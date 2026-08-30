import React from 'react';
import { L, Icons } from '../components.jsx';

// Real, minimal derivation of a short display name from a full model id
// like "huihui_ai/qwen3.5-abliterated:9b-Qwopus" -> "qwen3.5-abliterated".
// Full id still available via the element's own title tooltip — nothing
// hidden, just not spelled out across the whole header.
function shortModelName(model) {
  if (!model) return null;
  const afterSlash = model.includes('/') ? model.split('/').pop() : model;
  return afterSlash.split(':')[0];
}

// `onSwitchToLegacy` is a callback the entrypoint (main.jsx) supplies —
// this component has no knowledge of localStorage or how the legacy/new
// switch is actually implemented (architecture correction: the new shell
// must stay decoupled from that mechanism). The "YANA" wordmark lives in
// the sidebar (mockup's header has no product wordmark, only project/
// status/controls).
function safetyPresentation(safety) {
  if (!safety?.mode) {
    return {
      color: 'var(--color-text-muted)',
      label: L('Safety unavailable', 'Không có trạng thái an toàn', '안전 상태를 확인할 수 없음', '安全状态不可用'),
      title: L('The runtime did not return a safety state.', 'Runtime không trả về trạng thái an toàn.', '런타임이 안전 상태를 반환하지 않았습니다.', '运行时未返回安全状态。'),
    };
  }
  if (safety.mode === 'normal') {
    return {
      color: 'var(--good)',
      label: L('Safety normal', 'An toàn bình thường', '안전 상태 정상', '安全状态正常'),
      title: L('Reported by yana-rt.', 'Do yana-rt báo cáo.', 'yana-rt가 보고했습니다.', '由 yana-rt 报告。'),
    };
  }
  if (safety.mode === 'halted') {
    return {
      color: 'var(--warn)',
      label: L('Safety halted', 'An toàn đã dừng', '안전 상태 중지됨', '安全状态已停止'),
      title: safety.halt_reason || L('Reported by yana-rt.', 'Do yana-rt báo cáo.', 'yana-rt가 보고했습니다.', '由 yana-rt 报告。'),
    };
  }
  return {
    color: 'var(--warn)',
    label: L('Safety quarantined', 'An toàn bị cách ly', '안전 상태 격리됨', '安全状态已隔离'),
    title: safety.quarantine?.reason || safety.mode,
  };
}

export function Header({
  projectName, branch, model, safety, recentProjects, currentProjectRoot,
  onOpenProject, onSwitchProject, onFocusTerminal, onOpenPalette, onSwitchToLegacy,
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Previously this project name + chevron was inert decoration — it
  // looked like a dropdown (the chevron is the universal "click me"
  // signal) but did nothing, so switching projects always meant going to
  // the Projects page and running the native folder picker again, even
  // for a project already in Recent. This menu reuses the same
  // onOpenProject/onSwitchProject callbacks projects-view.jsx already
  // has — just a second, faster entry point to them.
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const short = shortModelName(model);
  const safetyState = safetyPresentation(safety);
  const recent = Array.isArray(recentProjects) ? recentProjects : [];

  async function handleSwitch(root) {
    if (switching || root === currentProjectRoot) return;
    setSwitching(true);
    const result = await onSwitchProject?.(root);
    setSwitching(false);
    if (result?.ok) setProjectMenuOpen(false);
    else if (result?.error) console.error('[project-switch]', result.error);
  }

  async function handleOpen() {
    setProjectMenuOpen(false);
    const result = await onOpenProject?.();
    if (result && !result.ok && !result.cancelled) console.error('[project-open]', result.error);
  }

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
      background: 'var(--color-bg)', position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, position: 'relative' }}>
        <button
          onClick={() => setProjectMenuOpen((v) => !v)}
          title={L('Switch project', 'Đổi dự án', '프로젝트 전환', '切换项目')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-base)', color: 'var(--ink)',
            fontWeight: 600, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
          }}
        >
          {projectName || '—'} <span style={{ color: 'var(--color-text-muted)' }}>{Icons.chevron(11)}</span>
        </button>
        {projectMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 8,
            background: 'var(--color-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10, minWidth: 240, maxWidth: 340,
            overflow: 'hidden',
          }}>
            {recent.length > 0 ? (
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {recent.map((project) => (
                  <button
                    key={project.root}
                    onClick={() => handleSwitch(project.root)}
                    disabled={switching || project.root === currentProjectRoot}
                    title={project.root}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                      background: project.root === currentProjectRoot ? 'var(--primary-soft)' : 'none', border: 'none',
                      color: 'var(--ink)', fontSize: 'var(--font-size-sm)',
                      cursor: switching || project.root === currentProjectRoot ? 'default' : 'pointer',
                      opacity: switching && project.root !== currentProjectRoot ? 0.6 : 1,
                    }}
                  >
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: project.root === currentProjectRoot ? 600 : 400 }}>
                      {project.name}
                    </span>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
                      {project.root}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px 12px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                {L('No recent projects yet.', 'Chưa có dự án gần đây.', '최근 프로젝트가 없습니다.', '暂无最近项目。')}
              </div>
            )}
            <button
              onClick={handleOpen}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                color: 'var(--primary)', fontSize: 'var(--font-size-sm)', fontWeight: 500, cursor: 'pointer',
              }}
            >
              {L('Open project…', 'Mở dự án…', '프로젝트 열기…', '打开项目…')}
            </button>
          </div>
        )}
        {branch && (
          <span
            title={branch}
            style={{
              fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
            }}
          >
            {branch}
          </span>
        )}
      </div>

      <span style={{
        fontSize: 'var(--font-size-xs)', color: safetyState.color,
        border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px', flexShrink: 0,
      }} title={safetyState.title}>
        {safetyState.label}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        {short && (
          <span title={model} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {short}
          </span>
        )}
        {onOpenPalette && (
          <button onClick={onOpenPalette} title="⌘K" style={{
            fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'none',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 7px', cursor: 'pointer',
          }}>
            ⌘K
          </button>
        )}
        {onFocusTerminal && (
          <button onClick={onFocusTerminal} aria-label="Terminal" title={L('Focus terminal', 'Đưa focus tới terminal', '터미널로 포커스 이동', '聚焦终端')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}>
            {Icons.code(16)}
          </button>
        )}
        {/* No real notification data exists yet — shown as a static,
            disabled control rather than a fake unread badge. */}
        <span title={L('No notifications yet', 'Chưa có thông báo', '아직 알림 없음', '暂无通知')} style={{ color: 'var(--color-text-muted)', opacity: 0.5, display: 'flex' }}>
          {Icons.pin(16)}
        </span>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Settings"
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}
        >
          {Icons.settings(16)}
        </button>
        {/* No account/profile system exists yet — a plain placeholder
            mark, not a fake avatar photo or the outdated mascot. */}
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: 'var(--color-bg-subtle)',
          border: '1px solid var(--border)', display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0,
        }}>
          Y
        </span>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            background: 'var(--color-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10, minWidth: 140,
          }}>
            {onSwitchToLegacy && (
              <button
                onClick={() => { setMenuOpen(false); onSwitchToLegacy(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'none', border: 'none', color: 'var(--ink)', fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                }}
              >
                {L('Legacy UI', 'Giao diện cũ', '이전 UI', '旧版界面')}
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
