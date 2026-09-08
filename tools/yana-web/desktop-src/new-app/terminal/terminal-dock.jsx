// Yana Desktop — Terminal dock (2026-09-05 rewrite).
//
// Same compact tab-bar shell around the real xterm.js + PTY panel as
// before (desktop-src/new-app/terminal-dock.jsx, now superseded) — this
// rewrite's actual changes are in xterm-panel.jsx's renderer (WebGL +
// addons) and in consolidating the session/layout bookkeeping into
// terminal-sessions.mjs's pure functions instead of ad hoc closures.
// Visual contract, tab behavior, and preferences popover are unchanged
// on purpose: the ask was reliability, not a new look.
import React from 'react';
import { Icons, L } from '../../components.jsx';
import { XTermPanel } from './xterm-panel.jsx';
import { IdePanel } from './ide-panel.jsx';
import { emitTerminalStarted, emitTerminalExited } from '../activity-source.mjs';
import * as terminalContext from '../../lib/terminal-context.mjs';
import { readTerminalPreferences, writeTerminalPreferences } from '../../lib/terminal-preferences.mjs';
import {
  MAX_TERMINALS,
  activateSession,
  addSession,
  closeSession,
  loadLayout,
  saveLayout,
  updateSession,
} from './terminal-sessions.mjs';

function Tab({ label, active, onClick, onClose, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent' }}>
      <button
        onClick={onClick}
        title={title}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', whiteSpace: 'nowrap',
          fontSize: 'var(--font-size-sm)', fontWeight: active ? 600 : 400,
          color: active ? 'var(--ink)' : 'var(--color-text-muted)',
        }}
      >
        {label}
      </button>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={L('Close terminal', 'Đóng terminal', '터미널 닫기', '关闭终端')}
          title={L('Close terminal', 'Đóng terminal', '터미널 닫기', '关闭终端')}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '2px 0 2px 5px' }}
        >×</button>
      )}
    </div>
  );
}

function Preferences({ value, onChange, onClose }) {
  return (
    <div style={{ position: 'absolute', right: 12, top: 36, zIndex: 5, width: 250, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg)', boxShadow: '0 10px 28px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 12 }}>
        <span>{L('Terminal preferences', 'Tùy chọn terminal', '터미널 환경설정', '终端偏好设置')}</span>
        <button onClick={onClose} aria-label={L('Close', 'Đóng', '닫기', '关闭')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>×</button>
      </div>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        {L('Font size', 'Cỡ chữ', '글꼴 크기', '字体大小')}: {value.fontSize}px
        <input aria-label={L('Terminal font size', 'Cỡ chữ terminal', '터미널 글꼴 크기', '终端字体大小')} type="range" min="11" max="20" value={value.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} style={{ display: 'block', width: '100%', marginTop: 5 }} />
      </label>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        {L('Line height', 'Dãn dòng', '줄 간격', '行高')}: {value.lineHeight.toFixed(1)}
        <input aria-label={L('Terminal line height', 'Dãn dòng terminal', '터미널 줄 간격', '终端行高')} type="range" min="1" max="2" step="0.1" value={value.lineHeight} onChange={(event) => onChange({ lineHeight: Number(event.target.value) })} style={{ display: 'block', width: '100%', marginTop: 5 }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
        <input type="checkbox" checked={value.cursorBlink} onChange={(event) => onChange({ cursorBlink: event.target.checked })} />
        {L('Blinking cursor', 'Con trỏ nhấp nháy', '깜박이는 커서', '闪烁光标')}
      </label>
    </div>
  );
}

// `activityPane` (roadmap Phase 1 item 3 — Responsive/Adaptive Layout):
// when the window is narrow, index.jsx stops rendering ActivityPanel as a
// permanent side-by-side column and instead passes it here as a THIRD
// tab — same component, same data, just a different structural slot.
export const TerminalDock = React.forwardRef(function TerminalDock({ cwdLabel, activityPane }, ref) {
  const [tab, setTab] = React.useState('shell');
  const [layout, setLayout] = React.useState(loadLayout);
  const [preferences, setPreferences] = React.useState(readTerminalPreferences);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
  const [, setContextRevision] = React.useState(0);
  const { sessions, activeKey } = layout;
  const activeSession = sessions.find((item) => item.key === activeKey) || sessions[0];
  const activeSnapshot = terminalContext.getActiveSessionSnapshot();

  React.useEffect(() => terminalContext.subscribe(() => setContextRevision((revision) => revision + 1)), []);
  React.useEffect(() => { saveLayout(layout); }, [layout]);
  React.useEffect(() => { terminalContext.setActiveSession(activeSession?.sessionId || null); }, [activeSession?.sessionId]);

  function addTerminal() {
    setLayout((current) => addSession(current));
    setTab('shell');
  }

  function closeTerminal(key) {
    setLayout((current) => closeSession(current, key));
  }

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}>
      <div className="na-terminal-tabs" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 14px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {sessions.map((session) => (
          <Tab key={session.key} label={session.title} active={tab === 'shell' && activeKey === session.key} onClick={() => { setLayout((current) => activateSession(current, session.key)); setTab('shell'); }} onClose={sessions.length > 1 ? () => closeTerminal(session.key) : undefined} />
        ))}
        <button onClick={addTerminal} disabled={sessions.length >= MAX_TERMINALS} title={L('New terminal', 'Terminal mới', '새 터미널', '新建终端')} aria-label={L('New terminal', 'Terminal mới', '새 터미널', '新建终端')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: sessions.length >= MAX_TERMINALS ? 'default' : 'pointer', opacity: sessions.length >= MAX_TERMINALS ? 0.5 : 1, display: 'flex' }}>{Icons.plus(15)}</button>
        <Tab label="IDE" active={tab === 'ide'} onClick={() => setTab('ide')} />
        {activityPane && <Tab label={L('Activity', 'Hoạt động', '활동', '活动')} active={tab === 'activity'} onClick={() => setTab('activity')} />}
        {tab === 'shell' && (activeSnapshot?.currentCwd || activeSession?.initialCwd || cwdLabel) && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {activeSession?.shell || L('Shell', 'Shell', '셸', 'Shell')} · {activeSnapshot?.currentCwd || activeSession?.initialCwd || cwdLabel}
          </span>
        )}
        <button onClick={() => setPreferencesOpen((open) => !open)} title={L('Terminal preferences', 'Tùy chọn terminal', '터미널 환경설정', '终端偏好设置')} aria-label={L('Terminal preferences', 'Tùy chọn terminal', '터미널 환경설정', '终端偏好设置')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}>{Icons.settings(15)}</button>
      </div>
      {preferencesOpen && <Preferences value={preferences} onChange={(patch) => setPreferences((current) => writeTerminalPreferences({ ...current, ...patch }))} onClose={() => setPreferencesOpen(false)} />}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {sessions.map((session) => (
          <XTermPanel
            key={session.key}
            active={tab === 'shell' && activeKey === session.key}
            preferences={preferences}
            onSessionStart={(result) => {
              setLayout((current) => updateSession(current, session.key, { sessionId: result.sessionId, initialCwd: result.initialCwd, shell: result.shell || null }));
              emitTerminalStarted();
            }}
            onSessionExit={(code) => emitTerminalExited(code)}
          />
        ))}
        <IdePanel active={tab === 'ide'} />
        {activityPane && (
          <div style={{ display: tab === 'activity' ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
            {activityPane}
          </div>
        )}
      </div>
    </div>
  );
});
