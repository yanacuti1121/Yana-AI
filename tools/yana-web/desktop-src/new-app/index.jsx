// New Yana Desktop app shell. A product surface over the existing
// yana-rt runtime, not a new runtime: this file and its siblings never
// call RuntimeAuthority, TurnEngine, or capability::command directly —
// chat-workspace.jsx's hooks talk to the SAME /api/chat endpoint the
// legacy Chat page uses, which is the same governed path (TurnEngine ->
// RuntimeAuthority -> capability::command -> guard/governance ->
// execution -> receipts) it always was. The terminal dock's human-typed
// PTY path and Yana's AI-execution path remain the two separate,
// never-merged authority paths.
import React from 'react';
import './new-app.css';
import { IS_ELECTRON } from '../lib/is-electron.js';
import { useResizable } from './use-resizable.js';
import { ProjectProvider } from './project-context.jsx';
import { useCommandPalette, CommandPalette } from './command-palette.jsx';
import { Header } from './header.jsx';
import { Sidebar } from './sidebar.jsx';
import { ChatWorkspace } from './chat-workspace.jsx';
import { ContextPanel } from './context-panel.jsx';
import { TerminalDock } from './terminal-dock.jsx';
import { ActivityPanel } from './activity-panel.jsx';
import { ActivityHistoryView } from './activity-history-view.jsx';
import { FilesView } from './files-view.jsx';
import { TasksView } from './tasks-view.jsx';
import { ComingSoon } from './coming-soon.jsx';
// Real, already-working API-key management (YanaVault, AES-256-GCM per
// rule 66) — reused as-is, not rebuilt. Takes no props (reads
// window.YANA/YanaVault globals directly, same as every other legacy
// page), so this is a genuine one-line reuse, not a presentation import.
import { Providers } from '../pages/system/providers.jsx';

function basename(p) {
  if (!p) return null;
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

// Roadmap Phase 1 item 3 — Responsive/Adaptive Layout. Structural
// collapse at real breakpoints, not micro-scaling everything down:
//   < NARROW      -> sidebar becomes an icon rail, Context Panel becomes
//                    a toggleable drawer instead of a permanent column
//   < VERY_NARROW -> Activity folds into the Terminal dock as a third
//                    tab instead of a permanent side-by-side split
const NARROW = 1000;
const VERY_NARROW = 760;

function useViewportWidth() {
  const [width, setWidth] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

const SIDEBAR_LABELS = { chat: 'Chat', projects: 'Projects', files: 'Files', tasks: 'Tasks', git: 'Git', activity: 'Activity', devices: 'Devices', models: 'Models', agents: 'Agents', settings: 'Settings' };

export function NewAppShell({ onSwitchToLegacy }) {
  const [view, setView] = React.useState('chat');
  const [gitInfo, setGitInfo] = React.useState(null); // null until fetched — never fabricated
  const [runtimeVersion, setRuntimeVersion] = React.useState(null);
  const [chatContext, setChatContext] = React.useState({
    provider: null, model: null, lastUsage: null,
    providerSel: null, setProviderSel: null, pickModel: null, modelOptions: [], providers: [],
  });
  // Roadmap Phase 2 item 5 — Workspace Selection Model: one shared
  // `{ kind, payload }`-shaped value every surface reads/writes instead of
  // each owning private selection state. Only `activity_event` has a real
  // producer today (ActivityPanel rows); file/task/git_change/command/
  // project selections plug into this SAME state once those surfaces
  // exist — no second selection mechanism to reconcile later.
  const [selection, setSelection] = React.useState(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const terminalDockRef = React.useRef(null);
  const palette = useCommandPalette();
  const viewportWidth = useViewportWidth();
  const isNarrow = viewportWidth < NARROW;
  const isVeryNarrow = viewportWidth < VERY_NARROW;

  // Real repo/branch/changed-files state via the temporary git-status
  // adapter (main.js -> git-status.js -> `yana-rt capability git-status`
  // -> capability::git::git_status). Electron-only; no fallback fake data
  // when unavailable (web-only deployments, or the call failing).
  // `refreshGitStatus` is re-callable (not just a mount-time effect) so
  // roadmap Phase 7's stage/unstage/commit actions can pull a fresh
  // status right after mutating, instead of showing stale counts/files.
  const refreshGitStatus = React.useCallback(() => {
    if (!IS_ELECTRON) return;
    window.yana?.gitStatus?.().then((result) => { if (result?.ok) setGitInfo(result); });
  }, []);

  React.useEffect(() => {
    refreshGitStatus();
    // Already-existing IPC (yana:version) — real Electron app version,
    // not a fabricated runtime version string.
    window.yana?.getVersion?.().then((v) => setRuntimeVersion(v));
  }, [refreshGitStatus]);

  // Proportions target the mockup's approximate desktop layout: sidebar
  // ~14%, main workspace ~55%, context panel ~31% of a normal-width
  // window; bottom workspace ~30-35% of window height. Absolute pixel
  // defaults below are tuned for the app's actual default window size
  // (1280x800, see tools/yana-desktop/main.js's createWindow), not an
  // arbitrary guess.
  const sidebarResize = useResizable({ storageKey: 'yana.newapp.sidebarW', initial: 252, max: 360, axis: 'x' });
  const contextResize = useResizable({ storageKey: 'yana.newapp.contextW', initial: 360, max: 520, axis: 'x' });
  const dockResize = useResizable({ storageKey: 'yana.newapp.dockH', initial: 340, max: 620, axis: 'y' });

  const onContextChange = React.useCallback((c) => setChatContext(c), []);
  const onFocusTerminal = React.useCallback(() => {
    terminalDockRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const onViewActivity = React.useCallback(() => setView('activity'), []);
  const onSelectActivityEvent = React.useCallback((ev) => setSelection(ev), []);
  const onToggleInspector = React.useCallback(() => setInspectorOpen((v) => !v), []);

  // Auto-close the drawer when resizing back to the wide layout — a
  // drawer left "open" from narrow mode would otherwise render as an
  // orphaned floating panel once the permanent column returns.
  React.useEffect(() => { if (!isNarrow) setInspectorOpen(false); }, [isNarrow]);

  const projectName = basename(gitInfo?.repoRoot) || document.title || null;

  // Roadmap Phase 2 item 8 — Command Palette registry. Real commands
  // only: every entry here actually does something (navigate/focus) —
  // no placeholder entries for features that don't exist yet.
  const commands = React.useMemo(() => ([
    ...Object.entries(SIDEBAR_LABELS).map(([id, label]) => ({
      id: `nav-${id}`, label: `Go to ${label}`, run: () => setView(id),
    })),
    { id: 'focus-terminal', label: 'Open Terminal', run: onFocusTerminal },
    ...(onSwitchToLegacy ? [{ id: 'legacy-ui', label: 'Switch to Legacy UI', run: onSwitchToLegacy }] : []),
  ]), [onFocusTerminal, onSwitchToLegacy]);

  const projectValue = React.useMemo(() => ({
    projectName, repoRoot: gitInfo?.repoRoot ?? null, branch: gitInfo?.branch ?? null,
    modifiedCount: gitInfo?.modifiedCount, untrackedCount: gitInfo?.untrackedCount,
  }), [projectName, gitInfo]);

  const contextPanelNode = (
    <ContextPanel
      projectName={projectName}
      repoRoot={gitInfo?.repoRoot}
      branch={gitInfo?.branch}
      modifiedCount={gitInfo?.modifiedCount}
      untrackedCount={gitInfo?.untrackedCount}
      changedFiles={gitInfo?.files}
      onRefreshGit={refreshGitStatus}
      provider={chatContext.provider}
      model={chatContext.model}
      lastUsage={chatContext.lastUsage}
      providerSel={chatContext.providerSel}
      setProviderSel={chatContext.setProviderSel}
      pickModel={chatContext.pickModel}
      modelOptions={chatContext.modelOptions}
      providers={chatContext.providers}
      selection={selection}
    />
  );

  const activityPanelNode = (
    <ActivityPanel onViewAll={onViewActivity} onSelect={onSelectActivityEvent} selectedId={selection?.id} />
  );

  return (
    <ProjectProvider value={projectValue}>
      <div className="new-app-shell" data-theme="navy" style={{ display: 'flex', flexDirection: 'column' }}>
        <Header
          projectName={projectName} branch={gitInfo?.branch} model={chatContext.model}
          onFocusTerminal={onFocusTerminal} onOpenPalette={() => palette.setOpen(true)} onSwitchToLegacy={onSwitchToLegacy}
          onToggleInspector={isNarrow ? onToggleInspector : undefined}
        />
        <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
          <div style={{ width: isNarrow ? 56 : sidebarResize.size, minWidth: isNarrow ? 56 : 160, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
            <Sidebar view={view} setView={setView} runtimeVersion={runtimeVersion} compact={isNarrow} />
          </div>
          {!isNarrow && <div className="na-resize-handle-x" onMouseDown={sidebarResize.onDragStart} />}

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {view === 'chat' ? (
                  <ChatWorkspace onContextChange={onContextChange} onFocusTerminal={onFocusTerminal} />
                ) : view === 'models' ? (
                  <div style={{ padding: 'var(--gap)', overflowY: 'auto', height: '100%' }}>
                    <Providers />
                  </div>
                ) : view === 'activity' ? (
                  <ActivityHistoryView onSelect={onSelectActivityEvent} selectedId={selection?.id} />
                ) : view === 'files' ? (
                  <FilesView />
                ) : view === 'tasks' ? (
                  <TasksView />
                ) : (
                  <ComingSoon label={view} />
                )}
              </div>
            </div>

            <div className="na-resize-handle-y" onMouseDown={dockResize.onDragStart} />
            <div style={{ height: dockResize.size, minHeight: 160, flexShrink: 0, display: 'flex', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: isVeryNarrow ? '1 1 100%' : '0 0 65%', minWidth: 0, overflow: 'hidden' }}>
                <TerminalDock
                  ref={terminalDockRef}
                  cwdLabel={projectName ? `~/${projectName}` : null}
                  activityPane={isVeryNarrow ? activityPanelNode : null}
                />
              </div>
              {!isVeryNarrow && (
                <>
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <div style={{ flex: '0 0 35%', minWidth: 0, overflow: 'hidden' }}>
                    {activityPanelNode}
                  </div>
                </>
              )}
            </div>
          </div>

          {!isNarrow && (
            <>
              <div className="na-resize-handle-x" onMouseDown={contextResize.onDragStart} />
              <div style={{ width: contextResize.size, minWidth: 240, flexShrink: 0, borderLeft: '1px solid var(--border)' }}>
                {contextPanelNode}
              </div>
            </>
          )}
        </div>

        {/* Narrow layout: Context Panel becomes a toggleable drawer
            (Header's Inspector button) instead of a permanent column —
            same component/data, different structural slot. */}
        {isNarrow && inspectorOpen && (
          <div
            onClick={onToggleInspector}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, maxWidth: '85vw',
                background: 'var(--color-bg)', borderLeft: '1px solid var(--border)',
                boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
              }}
            >
              {contextPanelNode}
            </div>
          </div>
        )}

        <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
      </div>
    </ProjectProvider>
  );
}
