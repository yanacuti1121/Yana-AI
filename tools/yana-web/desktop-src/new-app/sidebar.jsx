import React from 'react';
import { L, Icons } from '../components.jsx';

const CORE = [
  { id: 'chat', icon: Icons.chat, label: () => L('Chat', 'Trò chuyện', '채팅', '聊天') },
  { id: 'projects', icon: Icons.folder, label: () => L('Projects', 'Dự án', '프로젝트', '项目') },
  { id: 'files', icon: Icons.file, label: () => L('Files', 'Tệp', '파일', '文件') },
  { id: 'tasks', icon: Icons.check, label: () => L('Tasks', 'Việc', '작업', '任务') },
  { id: 'git', icon: Icons.gitBranch, label: () => 'Git' },
  { id: 'activity', icon: Icons.spark, label: () => L('Activity', 'Hoạt động', '활동', '活动') },
  { id: 'terminal', icon: Icons.code, label: () => L('Terminal', 'Terminal', '터미널', '终端') },
];

const SECONDARY = [
  { id: 'devices', icon: Icons.monitor, label: () => L('Devices', 'Thiết bị', '기기', '设备') },
  { id: 'models', icon: Icons.providers, label: () => L('Models', 'Model', '모델', '模型') },
  { id: 'remote-tools', icon: Icons.commandRef, label: () => L('Remote & Tools', 'Công cụ từ xa', '원격 도구', '远程工具') },
  { id: 'agents', icon: Icons.agents, label: () => L('Agents', 'Agent', '에이전트', '智能体') },
  { id: 'commands', icon: Icons.commandRef, label: () => L('Commands', 'Lệnh', '명령어', '命令') },
  { id: 'permissions', icon: Icons.safety, label: () => L('Permissions', 'Quyền hạn', '권한', '权限') },
];

// Roadmap Phase 1 item 3 — Responsive/Adaptive Layout: below the icon-rail
// breakpoint, labels hide and the icon becomes the only affordance — a
// real structural change (narrower fixed width, title-attribute tooltip
// for the hidden label), not a font-size scale-down.
function NavItem({ item, active, onClick, compact }) {
  const unavailable = item.unavailable === true;
  const unavailableLabel = L('Runtime bridge unavailable', 'Chưa có runtime bridge', '런타임 브리지가 아직 없습니다.', '运行时桥接尚不可用');
  return (
    <button
      onClick={unavailable ? undefined : onClick}
      disabled={unavailable}
      title={unavailable ? `${item.label()} · ${unavailableLabel}` : (compact ? item.label() : undefined)}
      className={`na-sidebar-nav-item${active ? ' is-active' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: compact ? 0 : 12, width: '100%',
        justifyContent: compact ? 'center' : 'flex-start', textAlign: 'left',
        padding: compact ? '11px 0' : '11px 14px', borderRadius: 'var(--r-md)', border: 'none',
        // Solid var(--primary) fill (real bug, 2026-09-03): appropriate when
        // --primary was near-white/near-black (the monochrome era), but a
        // full-opacity saturated jade fill this large reads as "xanh lè"
        // (garish) — anh's own words. --primary-soft is the restrained
        // low-opacity tint the marketing page and this same file's Settings
        // page tab already use for exactly this kind of active-state
        // highlight; --primary stays as the (much less area) text color.
        background: active ? 'var(--primary-soft)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--color-text-muted)',
        fontWeight: active ? 600 : 500,
        fontSize: 'var(--font-size-base)',
        cursor: unavailable ? 'not-allowed' : 'pointer', opacity: unavailable ? 0.55 : 1,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {item.icon && <span style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.85 }}>{item.icon(19)}</span>}
      {!compact && item.label()}
    </button>
  );
}

function Group({ items, view, setView, compact, onFocusTerminal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          active={item.id === 'terminal' ? false : view === item.id}
          onClick={item.id === 'terminal' ? onFocusTerminal : () => setView(item.id)}
          compact={compact}
        />
      ))}
    </div>
  );
}

function displayProjectName(projectName, workspaceRoot) {
  if (projectName) return projectName;
  if (!workspaceRoot) return null;
  const segments = workspaceRoot.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || workspaceRoot;
}

function connectorLabel(connector) {
  return connector?.displayName || connector?.display_name || connector?.name || connector?.id || null;
}

function connectorId(connector) {
  return String(connector?.id || connector?.name || '').trim().toLowerCase();
}

function ConnectorIcon({ connector }) {
  const id = connectorId(connector);
  const iconStyle = { display: 'grid', placeItems: 'center', width: 18, height: 18, flexShrink: 0 };

  if (id === 'github') {
    return <span aria-hidden="true" style={{ ...iconStyle, color: '#c7d2e3' }}>{Icons.gitBranch(16)}</span>;
  }
  if (id === 'gmail') {
    return (
      <span aria-hidden="true" style={{ ...iconStyle, color: '#f06c63' }}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="14" height="10" rx="1.5" />
          <path d="m3.8 6.2 6.2 4.9 6.2-4.9" />
        </svg>
      </span>
    );
  }
  if (id === 'google-calendar') {
    return (
      <span aria-hidden="true" style={{ ...iconStyle, color: '#73a8ff' }}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
          <path d="M6.5 3v3M13.5 3v3M3.5 8h13M7 11h2M11 11h2M7 14h2" />
        </svg>
      </span>
    );
  }
  if (id === 'google-drive') {
    return (
      <span aria-hidden="true" style={{ ...iconStyle, color: '#5bbf87' }}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m8.2 3 3.6 0 5 8.6-1.8 3.1H5.1l-1.9-3.2L8.2 3Z" />
          <path d="m8.2 3 4.9 8.6M3.2 11.6h9.9" />
        </svg>
      </span>
    );
  }
  if (id === 'notion') {
    return <span aria-hidden="true" style={{ ...iconStyle, border: '1px solid currentColor', borderRadius: 4, color: '#e6e9f2', fontSize: 10, fontWeight: 750, lineHeight: 1 }}>N</span>;
  }
  if (id === 'slack') {
    return (
      <span aria-hidden="true" style={{ ...iconStyle }}>
        <svg width="17" height="17" viewBox="0 0 20 20">
          <circle cx="7" cy="5.3" r="2.1" fill="#36c5f0" /><circle cx="14.7" cy="7" r="2.1" fill="#2eb67d" />
          <circle cx="13" cy="14.7" r="2.1" fill="#ecb22e" /><circle cx="5.3" cy="13" r="2.1" fill="#e01e5a" />
        </svg>
      </span>
    );
  }
  if (id === 'figma') {
    return (
      <span aria-hidden="true" style={{ ...iconStyle }}>
        <svg width="17" height="17" viewBox="0 0 20 20">
          <circle cx="8" cy="5" r="3" fill="#f24e1e" /><circle cx="12" cy="5" r="3" fill="#ff7262" />
          <circle cx="8" cy="10" r="3" fill="#a259ff" /><circle cx="12" cy="10" r="3" fill="#1abcfe" /><circle cx="8" cy="15" r="3" fill="#0acf83" />
        </svg>
      </span>
    );
  }
  return <span aria-hidden="true" style={{ ...iconStyle, color: 'var(--color-text-muted)' }}>{Icons.providers(16)}</span>;
}

function connectorState(connector) {
  if (typeof connector?.connectionState === 'string') return connector.connectionState.toLowerCase();
  if (typeof connector?.status === 'string') return connector.status.toLowerCase();
  if (connector?.connected === true) return 'connected';
  if (connector?.enabled === true) return 'enabled';
  return 'unknown';
}

function connectorDotColor(state) {
  if (state === 'ready') return 'var(--good)';
  if (state === 'connected' || state === 'enabled' || state === 'configured') return 'var(--primary)';
  if (state === 'credential-required') return 'var(--warn)';
  if (state === 'error' || state === 'failed' || state === 'unavailable') return 'var(--color-destructive, var(--warn))';
  return 'var(--color-text-muted)';
}

function connectorStateLabel(state) {
  if (state === 'ready') return L('Ready', 'Sẵn sàng', '준비됨', '已就绪');
  if (state === 'connected') return L('Connected', 'Đã kết nối', '연결됨', '已连接');
  if (state === 'credential-required') return L('Credential required', 'Cần credential', '자격 증명 필요', '需要凭据');
  if (state === 'adapter-unavailable') return L('Adapter unavailable', 'Chưa có adapter', '어댑터 없음', '适配器不可用');
  if (state === 'disabled') return L('Not connected', 'Chưa kết nối', '연결되지 않음', '未连接');
  if (state === 'error' || state === 'failed' || state === 'unavailable') return L('Needs attention', 'Cần chú ý', '확인 필요', '需要注意');
  if (state === 'enabled' || state === 'configured') return L('Configured', 'Đã cấu hình', '구성됨', '已配置');
  return L('Unknown', 'Chưa rõ', '알 수 없음', '未知');
}

function safetyStateLabel(mode) {
  if (mode === 'normal') return L('Safe mode active', 'Chế độ an toàn đang bật', '안전 모드 활성', '安全模式已启用');
  if (mode === 'halted') return L('Runtime halted', 'Runtime đã dừng', '런타임 중지됨', '运行时已停止');
  if (typeof mode === 'string' && mode.startsWith('quarantine:')) return L('Runtime quarantined', 'Runtime đang cách ly', '런타임 격리됨', '运行时已隔离');
  return L('Safety status unavailable', 'Chưa có trạng thái an toàn', '안전 상태를 사용할 수 없음', '安全状态不可用');
}

function safetyStateColor(mode) {
  if (mode === 'normal') return 'var(--good)';
  if (mode === 'halted' || (typeof mode === 'string' && mode.startsWith('quarantine:'))) return 'var(--warn)';
  return 'var(--color-text-muted)';
}

function CurrentProject({ projectName, workspaceRoot, onOpenProject, compact }) {
  if (compact) return null;

  const name = displayProjectName(projectName, workspaceRoot);
  if (!name && !onOpenProject) return null;

  async function openProject() {
    const result = await onOpenProject?.();
    if (result && !result.ok && !result.cancelled) console.error('[project-open]', result.error);
  }

  return (
    <button
      className="na-sidebar-project"
      onClick={() => { void openProject(); }}
      disabled={!onOpenProject}
      title={workspaceRoot || L('Open a project', 'Mở dự án', '프로젝트 열기', '打开项目')}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 11px',
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        background: 'var(--color-bg-subtle)', color: 'var(--ink)', textAlign: 'left',
        cursor: onOpenProject ? 'pointer' : 'default', font: 'inherit',
      }}
    >
      <span style={{ display: 'flex', color: 'var(--primary)', flexShrink: 0 }}>{Icons.folder(17)}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name || L('Open a project', 'Mở dự án', '프로젝트 열기', '打开项目')}
        </span>
        <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workspaceRoot || L('Choose a local folder', 'Chọn thư mục trên máy', '로컬 폴더 선택', '选择本地文件夹')}
        </span>
      </span>
      {onOpenProject && <span style={{ display: 'flex', color: 'var(--color-text-muted)' }}>{Icons.chevron(14)}</span>}
    </button>
  );
}

function Connections({ connectors, compact, onOpenIntegrations }) {
  const rows = Array.isArray(connectors)
    ? connectors.map((connector) => ({ connector, label: connectorLabel(connector) })).filter(({ label }) => Boolean(label))
    : [];
  if (compact || rows.length === 0) return null;

  return (
    <section aria-label={L('Connections', 'Kết nối', '연결', '连接')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 8px 7px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        <span>{L('Connections', 'Kết nối', '연결', '连接')}</span>
        {onOpenIntegrations && <button type="button" onClick={onOpenIntegrations} style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', font: 'inherit', fontSize: 'var(--font-size-xs)' }}>{L('Manage', 'Quản lý', '관리', '管理')}</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(({ connector, label }) => {
          const state = connectorState(connector);
          return (
            <button key={connector.id || label} type="button" onClick={onOpenIntegrations} title={`${label} · ${connectorStateLabel(state)}`} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, padding: '5px 9px', width: '100%', border: 'none', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--color-text-muted)', font: 'inherit', fontSize: 'var(--font-size-sm)', textAlign: 'left', cursor: onOpenIntegrations ? 'pointer' : 'default' }}>
              <ConnectorIcon connector={connector} />
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: connectorDotColor(state), flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ marginLeft: 'auto', color: connectorDotColor(state), fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}>{connectorStateLabel(state)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecentProjects({ recentProjects, currentProjectRoot, onSwitchProject, compact }) {
  const [switching, setSwitching] = React.useState(false);
  const projects = Array.isArray(recentProjects)
    ? recentProjects.filter((project) => project?.root && project.root !== currentProjectRoot)
    : [];

  if (compact || projects.length === 0 || !onSwitchProject) return null;

  async function selectProject(root) {
    if (switching) return;
    setSwitching(true);
    try {
      await onSwitchProject(root);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <section aria-label={L('Recent projects', 'Dự án gần đây', '최근 프로젝트', '最近项目')}>
      <div style={{ margin: '2px 8px 7px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {L('Recent projects', 'Dự án gần đây', '최근 프로젝트', '最近项目')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {projects.slice(0, 4).map((project) => (
          <button
            key={project.root}
            className="na-sidebar-recent-project"
            onClick={() => { void selectProject(project.root); }}
            disabled={switching}
            title={project.root}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 9px', border: 'none',
              background: 'transparent', borderRadius: 'var(--r-sm)', color: 'var(--color-text-muted)', textAlign: 'left',
              cursor: switching ? 'wait' : 'pointer', font: 'inherit', opacity: switching ? 0.6 : 1,
            }}
          >
            <span style={{ display: 'flex', flexShrink: 0 }}>{Icons.folder(14)}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-sm)' }}>{project.name || displayProjectName(null, project.root)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Sidebar({
  view, setView, desktopVersion, safetyMode, compact, onToggleCompact,
  projectName, workspaceRoot, recentProjects, currentProjectRoot,
  onOpenProject, onSwitchProject, connectors, onFocusTerminal, onOpenIntegrations,
}) {
  return (
    <nav className="na-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: compact ? '14px 6px 10px' : '14px 10px 10px' }}>
      {/* Simple temporary wordmark, no mascot — the real logo asset
          (docs/yana-logo.png) is a full hero illustration, not a usable
          small mark at this size; see the brand note this pass was given. */}
      <div className="na-sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', gap: 8, padding: compact ? '2px 0 18px' : '2px 10px 14px' }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, background: 'var(--primary)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>Y</span>
        {!compact && <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>Yana</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CurrentProject projectName={projectName} workspaceRoot={workspaceRoot} onOpenProject={onOpenProject} compact={compact} />
        <Group items={CORE} view={view} setView={setView} compact={compact} onFocusTerminal={onFocusTerminal} />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <Group items={SECONDARY} view={view} setView={setView} compact={compact} onFocusTerminal={onFocusTerminal} />
        </div>
        <Connections connectors={connectors} compact={compact} onOpenIntegrations={onOpenIntegrations} />
        <RecentProjects
          recentProjects={recentProjects}
          currentProjectRoot={currentProjectRoot || workspaceRoot}
          onSwitchProject={onSwitchProject}
          compact={compact}
        />
      </div>

      <div className="na-sidebar-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        <NavItem
          item={{ icon: Icons.settings, label: () => L('Settings', 'Cài đặt', '설정', '设置') }}
          active={view === 'settings'}
          onClick={() => setView('settings')}
          compact={compact}
        />
        {!compact && (
          <div className="na-sidebar-system-status" style={{ marginTop: 8, padding: '9px 10px', borderRadius: 'var(--r-md)', background: 'var(--color-bg-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: safetyStateColor(safetyMode) }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: safetyStateColor(safetyMode), flexShrink: 0 }} />
              <span>{safetyStateLabel(safetyMode)}</span>
            </div>
            {desktopVersion && (
              <div style={{ marginTop: 5, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {L('Yana Desktop', 'Yana Desktop', 'Yana 데스크톱', 'Yana 桌面版')} v{desktopVersion}
              </div>
            )}
          </div>
        )}
        {onToggleCompact && (
          <button
            type="button"
            className="na-sidebar-collapse"
            onClick={onToggleCompact}
            title={compact ? L('Expand sidebar', 'Mở rộng thanh bên', '사이드바 펼치기', '展开侧栏') : L('Collapse sidebar', 'Thu gọn thanh bên', '사이드바 접기', '折叠侧栏')}
            aria-label={compact ? L('Expand sidebar', 'Mở rộng thanh bên', '사이드바 펼치기', '展开侧栏') : L('Collapse sidebar', 'Thu gọn thanh bên', '사이드바 접기', '折叠侧栏')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8, padding: '6px 0', border: 'none', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            <span style={{ display: 'flex', transform: compact ? 'rotate(180deg)' : undefined }}>{Icons.chevron(15)}</span>
            {!compact && <span style={{ marginLeft: 7, fontSize: 'var(--font-size-xs)' }}>{L('Collapse', 'Thu gọn', '접기', '折叠')}</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
