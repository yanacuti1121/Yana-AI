import React from 'react';
import { Icons } from '../components.jsx';
import { XTermPanel, IdePanel } from '../terminal.jsx';
import { emitTerminalStarted, emitTerminalExited } from './activity-source.mjs';

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
        fontSize: 'var(--font-size-sm)', fontWeight: active ? 600 : 400,
        color: active ? 'var(--ink)' : 'var(--color-text-muted)',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
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

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
        <Tab label="Terminal" active={tab === 'shell'} onClick={() => setTab('shell')} />
        <Tab label="IDE" active={tab === 'ide'} onClick={() => setTab('ide')} />
        {activityPane && <Tab label="Activity" active={tab === 'activity'} onClick={() => setTab('activity')} />}
        {tab === 'shell' && cwdLabel && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            zsh · {cwdLabel}
          </span>
        )}
        {/* Multi-terminal isn't built yet — shown, disabled, honest
            tooltip, rather than omitted (preserve the target layout's
            toolbar region even when the feature behind it doesn't exist). */}
        <button
          disabled
          title="Multiple terminal sessions — not available yet"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'default', opacity: 0.5, display: 'flex' }}
        >
          {Icons.plus(15)}
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <XTermPanel active={tab === 'shell'} onSessionStart={emitTerminalStarted} onSessionExit={emitTerminalExited} />
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
