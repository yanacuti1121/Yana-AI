import React from 'react';
import { L, Icons } from '../components.jsx';

const CORE = [
  { id: 'chat', icon: Icons.chat, label: () => L('Chat', 'Trò chuyện', '채팅', '聊天') },
  { id: 'projects', icon: Icons.folder, label: () => L('Projects', 'Dự án', '프로젝트', '项目') },
  { id: 'files', icon: Icons.file, label: () => L('Files', 'Tệp', '파일', '文件') },
  { id: 'tasks', icon: Icons.check, label: () => L('Tasks', 'Việc', '작업', '任务') },
  { id: 'git', icon: Icons.gitBranch, label: () => 'Git' },
  { id: 'activity', icon: Icons.spark, label: () => L('Activity', 'Hoạt động', '활동', '活动') },
];

const SECONDARY = [
  { id: 'devices', icon: Icons.monitor, label: () => L('Devices', 'Thiết bị', '기기', '设备') },
  { id: 'models', icon: Icons.providers, label: () => L('Models', 'Model', '모델', '模型') },
  { id: 'agents', icon: Icons.agents, label: () => L('Agents', 'Agent', '에이전트', '智能体') },
];

// Roadmap Phase 1 item 3 — Responsive/Adaptive Layout: below the icon-rail
// breakpoint, labels hide and the icon becomes the only affordance — a
// real structural change (narrower fixed width, title-attribute tooltip
// for the hidden label), not a font-size scale-down.
function NavItem({ item, active, onClick, compact }) {
  return (
    <button
      onClick={onClick}
      title={compact ? item.label() : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: compact ? 0 : 12, width: '100%',
        justifyContent: compact ? 'center' : 'flex-start', textAlign: 'left',
        padding: compact ? '11px 0' : '11px 14px', borderRadius: 'var(--r-md)', border: 'none',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--color-text-muted)',
        fontWeight: active ? 600 : 500,
        fontSize: 'var(--font-size-base)',
        cursor: 'pointer',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {item.icon && <span style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.85 }}>{item.icon(19)}</span>}
      {!compact && item.label()}
    </button>
  );
}

function Group({ items, view, setView, compact }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((item) => (
        <NavItem key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} compact={compact} />
      ))}
    </div>
  );
}

export function Sidebar({ view, setView, runtimeVersion, compact }) {
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: compact ? '14px 6px 10px' : '14px 10px 10px' }}>
      {/* Simple temporary wordmark, no mascot — the real logo asset
          (docs/yana-logo.png) is a full hero illustration, not a usable
          small mark at this size; see the brand note this pass was given. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', gap: 8, padding: compact ? '2px 0 18px' : '2px 10px 18px' }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, background: 'var(--primary)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>Y</span>
        {!compact && <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>YANA</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Group items={CORE} view={view} setView={setView} compact={compact} />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <Group items={SECONDARY} view={view} setView={setView} compact={compact} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        <NavItem
          item={{ icon: Icons.settings, label: () => L('Settings', 'Cài đặt', '설정', '设置') }}
          active={view === 'settings'}
          onClick={() => setView('settings')}
          compact={compact}
        />
      </div>

      {/* System Status — only real fields (see index.jsx: runtimeVersion
          comes from window.yana.getVersion(), an already-existing IPC
          call). No CPU/RAM/token here — those aren't backed by real data
          anywhere in this app yet, and this rule is strict about that.
          Hidden in compact/icon-rail mode — there's no room for prose,
          and the underlying status is not lost, just not shown at this
          width (same "structural collapse, not micro-scaling" rule). */}
      {!compact && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {L('System Status', 'Trạng thái hệ thống', '시스템 상태', '系统状态')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--good)', marginBottom: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--good)', flexShrink: 0 }} />
            {L('Runtime connected', 'Runtime đã kết nối', '런타임 연결됨', '运行时已连接')}
          </div>
          {runtimeVersion && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {L('Yana Runtime', 'Yana Runtime', 'Yana 런타임', 'Yana 运行时')} v{runtimeVersion}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
