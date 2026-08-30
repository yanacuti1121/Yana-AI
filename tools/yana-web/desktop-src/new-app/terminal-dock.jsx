import React from 'react';
import { Icons, L } from '../components.jsx';
import { XTermPanel, IdePanel } from '../terminal.jsx';
import { emitTerminalStarted, emitTerminalExited } from './activity-source.mjs';
import * as terminalContext from '../lib/terminal-context.mjs';
import { readTerminalPreferences, writeTerminalPreferences } from '../lib/terminal-preferences.mjs';

const LAYOUT_KEY = 'yana.terminal.layout.v1';
const MAX_TERMINALS = 8;

function terminalKey() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTerminal(number) {
  return { key: terminalKey(), title: `Terminal ${number}`, sessionId: null, initialCwd: null, shell: null };
}

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    const sessions = Array.isArray(saved.sessions)
      ? saved.sessions.slice(0, MAX_TERMINALS).map((item, index) => ({
        ...createTerminal(index + 1),
        key: typeof item?.key === 'string' ? item.key : terminalKey(),
        title: typeof item?.title === 'string' && item.title.trim() ? item.title.slice(0, 80) : `Terminal ${index + 1}`,
      }))
      : [];
    const restored = sessions.length ? sessions : [createTerminal(1)];
    return { sessions: restored, activeKey: restored.some((item) => item.key === saved.activeKey) ? saved.activeKey : restored[0].key };
  } catch {
    const first = createTerminal(1);
    return { sessions: [first], activeKey: first.key };
  }
}

function saveLayout(sessions, activeKey) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify({
    version: 1,
    activeKey,
    // Runtime session IDs, process state, and terminal output are intentionally
    // excluded. A relaunch restores layout only; it never pretends processes
    // from the previous app run are still alive.
    sessions: sessions.map(({ key, title }) => ({ key, title })),
  }));
}

function Tab({ label, active, onClick, onClose, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent' }}>
      <button
        onClick={onClick}
        title={title}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
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

// Compact tab-bar wrapper around the SAME xterm.js + PTY component the
// legacy Terminal page uses (terminal.jsx's XTermPanel/IdePanel) — no
// duplicated PTY or code-server logic, just a slimmer presentational
// shell matching the mockup's bottom-docked terminal. Keeps the
// Terminal/IDE tab affordance terminal.jsx already established.
//
// `activityPane` (roadmap Phase 1 item 3 — Responsive/Adaptive Layout):
// when the window is narrow, index.jsx stops rendering ActivityPanel as
// a permanent side-by-side column and instead passes it here as a THIRD
// tab — same component, same data, just a different structural slot
// (folding a panel into a tab, not shrinking it to illegibility).
export const TerminalDock = React.forwardRef(function TerminalDock({ cwdLabel, activityPane }, ref) {
  const [tab, setTab] = React.useState('shell');
  const [{ sessions, activeKey }, setLayout] = React.useState(loadLayout);
  const [preferences, setPreferences] = React.useState(readTerminalPreferences);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
  const [, setContextRevision] = React.useState(0);
  const activeSession = sessions.find((item) => item.key === activeKey) || sessions[0];
  const activeSnapshot = terminalContext.getActiveSessionSnapshot();

  React.useEffect(() => terminalContext.subscribe(() => setContextRevision((revision) => revision + 1)), []);
  React.useEffect(() => { saveLayout(sessions, activeKey); }, [sessions, activeKey]);
  React.useEffect(() => { terminalContext.setActiveSession(activeSession?.sessionId || null); }, [activeSession?.sessionId]);

  function updateLayout(nextSessions, nextActiveKey = activeKey) {
    setLayout({ sessions: nextSessions, activeKey: nextActiveKey });
  }

  function addTerminal() {
    if (sessions.length >= MAX_TERMINALS) return;
    const next = createTerminal(sessions.length + 1);
    updateLayout([...sessions, next], next.key);
    setTab('shell');
  }

  function closeTerminal(key) {
    if (sessions.length <= 1) return;
    const index = sessions.findIndex((item) => item.key === key);
    const next = sessions.filter((item) => item.key !== key);
    const nextActiveKey = key === activeKey ? (next[Math.max(0, index - 1)] || next[0]).key : activeKey;
    updateLayout(next, nextActiveKey);
  }

  function updateSession(key, update) {
    setLayout((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.key === key ? { ...item, ...update } : item),
    }));
  }

  function updatePreferences(patch) {
    setPreferences((current) => writeTerminalPreferences({ ...current, ...patch }));
  }

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
        {sessions.map((session) => (
          <Tab key={session.key} label={session.title} active={tab === 'shell' && activeKey === session.key} onClick={() => { setActiveSession(session.key); setTab('shell'); }} onClose={sessions.length > 1 ? () => closeTerminal(session.key) : undefined} />
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
      {preferencesOpen && <Preferences value={preferences} onChange={updatePreferences} onClose={() => setPreferencesOpen(false)} />}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {sessions.map((session) => (
          <XTermPanel
            key={session.key}
            active={tab === 'shell' && activeKey === session.key}
            preferences={preferences}
            onSessionStart={(result) => {
              updateSession(session.key, { sessionId: result.sessionId, initialCwd: result.initialCwd, shell: result.shell || null });
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
