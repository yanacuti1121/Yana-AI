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
import { readUiPreferences, writeUiPreferences } from './ui-preferences.mjs';
import { setLang } from '../lib/i18n-lang.js';
import { Undercurrent } from '../app/undercurrent.jsx';
import { L } from '../components.jsx';
// Real, already-working API-key management (YanaVault, AES-256-GCM per
// rule 66) — reused as-is, not rebuilt. Takes no props (reads
// window.YANA/YanaVault globals directly, same as every other legacy
// page), so this is a genuine one-line reuse, not a presentation import.

// The chat, contextual inspector and terminal are the first-use workspace.
// Secondary screens load only when the user opens them so a large Settings or
// provider surface cannot delay the initial local workspace. Each component
// still uses the same existing runtime/IPC path after it loads.
const ActivityHistoryView = React.lazy(() => import('./activity-history-view.jsx').then((module) => ({ default: module.ActivityHistoryView })));
const TerminalDock = React.lazy(() => import('./terminal-dock.jsx').then((module) => ({ default: module.TerminalDock })));
const FilesView = React.lazy(() => import('./files-view.jsx').then((module) => ({ default: module.FilesView })));
const TasksView = React.lazy(() => import('./tasks-view.jsx').then((module) => ({ default: module.TasksView })));
const ProjectsView = React.lazy(() => import('./projects-view.jsx').then((module) => ({ default: module.ProjectsView })));
const SettingsView = React.lazy(() => import('./settings-view.jsx').then((module) => ({ default: module.SettingsView })));
const GitWorkspace = React.lazy(() => import('./git-workspace.jsx').then((module) => ({ default: module.GitWorkspace })));
const IntegrationsSettings = React.lazy(() => import('./integrations-settings.jsx').then((module) => ({ default: module.IntegrationsSettings })));
const CommandsReferenceView = React.lazy(() => import('./commands-reference-view.jsx').then((module) => ({ default: module.CommandsReferenceView })));
const PermissionsView = React.lazy(() => import('./permissions-view.jsx').then((module) => ({ default: module.PermissionsView })));
const AgentsView = React.lazy(() => import('./agents-view.jsx').then((module) => ({ default: module.AgentsView })));
const DevicesView = React.lazy(() => import('./devices-view.jsx').then((module) => ({ default: module.DevicesView })));
const RemoteToolsView = React.lazy(() => import('./remote-tools-view.jsx').then((module) => ({ default: module.RemoteToolsView })));
const ComingSoon = React.lazy(() => import('./coming-soon.jsx').then((module) => ({ default: module.ComingSoon })));
const ModelManager = React.lazy(() => import('./model-manager.jsx').then((module) => ({ default: module.ModelManager })));

function SurfaceLoading() {
  return <div role="status" aria-live="polite" style={{ display: 'grid', height: '100%', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Loading workspace…', 'Đang tải không gian làm việc…', '작업 공간을 불러오는 중…', '正在加载工作区…')}</div>;
}

function TerminalLoading() {
  return <div role="status" aria-live="polite" style={{ display: 'grid', height: '100%', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Starting terminal…', 'Đang khởi động terminal…', '터미널을 시작하는 중…', '正在启动终端…')}</div>;
}

function basename(p) {
  if (!p) return null;
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

// Roadmap Phase 1 item 3 — Responsive/Adaptive Layout. The Inspector
// gives up its permanent column before the sidebar becomes an icon rail:
// a middle-width desktop needs readable primary work, not three cramped
// columns. The user can reopen the Inspector from the Header as a drawer.
const INSPECTOR_DRAWER_WIDTH = 1360;
const SIDEBAR_RAIL_WIDTH = 1000;
const SHORT_VIEWPORT_HEIGHT = 860;
const SIDEBAR_COLLAPSED_KEY = 'yana.newapp.sidebar.collapsed';

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function useViewport() {
  const [viewport, setViewport] = React.useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  React.useEffect(() => {
    function onResize() { setViewport({ width: window.innerWidth, height: window.innerHeight }); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

const SIDEBAR_LABELS = { chat: 'Chat', projects: 'Projects', files: 'Files', tasks: 'Tasks', git: 'Git', activity: 'Activity', devices: 'Devices', models: 'Models', agents: 'Agents', settings: 'Settings', integrations: 'Integrations', remoteTools: 'Remote & Tools', commands: 'Commands', permissions: 'Permissions' };

export function NewAppShell({ onSwitchToLegacy }) {
  const [view, setView] = React.useState('chat');
  const [gitInfo, setGitInfo] = React.useState(null); // null until fetched — never fabricated
  const [projectInfo, setProjectInfo] = React.useState(null);
  const [connectors, setConnectors] = React.useState([]);
  const [uiPreferences, setUiPreferences] = React.useState(readUiPreferences);
  const [desktopVersion, setDesktopVersion] = React.useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(readSidebarCollapsed);
  const [governance, setGovernance] = React.useState(null);
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
  const [utilityDockOpen, setUtilityDockOpen] = React.useState(false);
  const terminalDockRef = React.useRef(null);
  const terminalFocusRequested = React.useRef(false);
  const palette = useCommandPalette();
  const { width: viewportWidth, height: viewportHeight } = useViewport();
  // Chat, Files, Git and Tasks benefit from the persistent workspace
  // utilities. Settings-like control planes do not: keeping a Git Inspector
  // and a human terminal visible while editing privacy/provider settings is
  // context collision, not useful information density. Those utilities stay
  // available from the Header as opt-in drawers instead of disappearing.
  const focusSurface = ['settings', 'integrations', 'models', 'agents', 'remote-tools'].includes(view);
  const inspectorDrawer = viewportWidth < INSPECTOR_DRAWER_WIDTH || focusSurface;
  const showBottomDock = !focusSurface || utilityDockOpen;
  const sidebarCompact = viewportWidth < SIDEBAR_RAIL_WIDTH || sidebarCollapsed;
  const shortViewport = viewportHeight < SHORT_VIEWPORT_HEIGHT;

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
  const refreshProject = React.useCallback(() => {
    if (!IS_ELECTRON) return Promise.resolve(null);
    return window.yana?.projectInfo?.().then((result) => {
      if (result?.ok) setProjectInfo(result);
      return result;
    });
  }, []);
  const refreshGovernance = React.useCallback(() => {
    if (!IS_ELECTRON) return;
    window.yana?.governanceStatus?.().then((result) => {
      if (result?.ok) setGovernance(result);
    });
  }, []);
  const refreshConnectors = React.useCallback(() => {
    if (!IS_ELECTRON) return;
    window.yana?.connectorList?.().then((result) => {
      if (result?.ok && Array.isArray(result.connectors)) setConnectors(result.connectors);
    });
  }, []);

  React.useEffect(() => {
    refreshProject();
    refreshGitStatus();
    refreshGovernance();
    refreshConnectors();
    // Already-existing IPC (yana:version) — real Electron app version,
    // not a fabricated runtime version string.
    window.yana?.getVersion?.().then((v) => setDesktopVersion(v));
  }, [refreshConnectors, refreshGitStatus, refreshGovernance, refreshProject]);

  // Proportions target the mockup's approximate desktop layout: sidebar
  // ~14%, main workspace ~55%, context panel ~31% of a normal-width
  // window; bottom workspace ~30-35% of window height. Absolute pixel
  // defaults below are tuned for the app's actual default window size
  // (1280x800, see tools/yana-desktop/main.js's createWindow), not an
  // arbitrary guess.
  const sidebarResize = useResizable({ storageKey: 'yana.newapp.sidebarW', initial: 230, min: 208, max: 340, axis: 'x' });
  const contextResize = useResizable({ storageKey: 'yana.newapp.contextW', initial: 408, min: 340, max: 540, axis: 'x', direction: -1 });
  const dockResize = useResizable({ storageKey: 'yana.newapp.dockH', initial: 280, min: 220, max: 560, axis: 'y', direction: -1 });

  const onContextChange = React.useCallback((c) => setChatContext(c), []);
  const onFocusTerminal = React.useCallback(() => {
    terminalFocusRequested.current = true;
    setUtilityDockOpen(true);
    terminalDockRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const onViewActivity = React.useCallback(() => setView('activity'), []);
  const onSelectActivityEvent = React.useCallback((ev) => setSelection(ev), []);
  const onToggleInspector = React.useCallback(() => setInspectorOpen((v) => !v), []);
  const onOpenProject = React.useCallback(async () => {
    if (!IS_ELECTRON) return { ok: false, error: 'desktop app required' };
    const result = await window.yana?.projectOpen?.();
    if (result?.ok) {
      setProjectInfo(result);
      refreshGitStatus();
      refreshGovernance();
      refreshConnectors();
    }
    return result;
  }, [refreshConnectors, refreshGitStatus, refreshGovernance]);
  const onSwitchProject = React.useCallback(async (root) => {
    if (!IS_ELECTRON) return { ok: false, error: 'desktop app required' };
    const result = await window.yana?.projectSwitch?.(root);
    if (result?.ok) {
      setProjectInfo(result);
      refreshGitStatus();
      refreshGovernance();
      refreshConnectors();
    }
    return result;
  }, [refreshConnectors, refreshGitStatus, refreshGovernance]);
  const onUiPreferencesChange = React.useCallback((patch) => {
    setUiPreferences((current) => writeUiPreferences({ ...current, ...patch }));
  }, []);
  const onToggleSidebarCollapse = React.useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch (_) { /* persistence is optional */ }
      return next;
    });
  }, []);

  React.useEffect(() => {
    setLang({ en: 'English', vi: 'Tiếng Việt', ko: '한국어', zh: '中文' }[uiPreferences.language]);
    document.documentElement.lang = uiPreferences.language;
  }, [uiPreferences.language]);

  // Auto-close the drawer when resizing back to the wide layout — a
  // drawer left "open" from narrow mode would otherwise render as an
  // orphaned floating panel once the permanent column returns.
  React.useEffect(() => { if (!inspectorDrawer) setInspectorOpen(false); }, [inspectorDrawer]);
  React.useEffect(() => {
    if (!focusSurface) setUtilityDockOpen(false);
  }, [focusSurface]);
  React.useEffect(() => {
    if (showBottomDock && terminalFocusRequested.current && terminalDockRef.current) {
      terminalDockRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      terminalFocusRequested.current = false;
    }
  }, [showBottomDock]);

  const workspaceRoot = projectInfo?.root || gitInfo?.repoRoot || null;
  const projectName = projectInfo?.name || basename(workspaceRoot) || document.title || null;

  // Roadmap Phase 2 item 8 — Command Palette registry. Real commands
  // only: every entry here actually does something (navigate/focus) —
  // no placeholder entries for features that don't exist yet.
  const commands = React.useMemo(() => ([
    ...Object.entries(SIDEBAR_LABELS).map(([id, label]) => ({
      id: `nav-${id}`, label: `Go to ${label}`, run: () => setView(id),
    })),
    { id: 'open-project', label: 'Open or create project', run: () => { void onOpenProject(); } },
    ...(projectInfo?.recent || []).map((project) => ({
      id: `project-${project.root}`, label: `Switch to ${project.name}`, run: () => { void onSwitchProject(project.root); },
    })),
    { id: 'focus-terminal', label: 'Open Terminal', run: onFocusTerminal },
    { id: 'open-integrations', label: 'Open Integrations', run: () => setView('integrations') },
    ...(onSwitchToLegacy ? [{ id: 'legacy-ui', label: 'Switch to Legacy UI', run: onSwitchToLegacy }] : []),
  ]), [onFocusTerminal, onOpenProject, onSwitchToLegacy, onSwitchProject, projectInfo?.recent]);

  const projectValue = React.useMemo(() => ({
    projectName, repoRoot: workspaceRoot, branch: gitInfo?.branch ?? null,
    modifiedCount: gitInfo?.modifiedCount, untrackedCount: gitInfo?.untrackedCount,
  }), [projectName, workspaceRoot, gitInfo]);

  const contextPanelNode = (
    <ContextPanel
      projectName={projectName}
      repoRoot={workspaceRoot}
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
      governance={governance}
      selection={selection}
      onViewActivity={onViewActivity}
      onSelectActivityEvent={onSelectActivityEvent}
      onOpenTasks={() => setView('tasks')}
      onOpenModels={() => setView('models')}
    />
  );

  return (
    <ProjectProvider value={projectValue}>
      {/* `key` forces a full remount on language change. `L(en,vi,ko,zh)`
          reads `currentLang` from lib/i18n-lang.js — a plain mutable
          module variable, not React state — so calling setLang() in the
          effect above mutates it but does NOT itself trigger a re-render
          anywhere. Without this key, already-mounted components kept
          showing stale text until something else (e.g. navigating to a
          different sidebar view) happened to remount them, which read as
          "changing the language doesn't work" even though the value was
          actually updated. Remounting on every language change is a
          deliberate, minimal fix — not a performance concern, since a
          user changing language is a rare, explicit action, not a
          per-render event. */}
      <div key={uiPreferences.language} className="new-app-shell" data-theme={uiPreferences.theme} style={{ display: 'flex', flexDirection: 'column' }}>
        {/* The theme's real background (radial-gradient glow layers +
            drifting motes, themes.css's "living lake" system) — previously
            missing here, so new-app only ever painted new-app.css's flat
            var(--color-bg) fill with no gradient depth, which combined with
            the flat purple accent override below is what read as "AI-hóa,
            tối tối pha xám" (anh's words). `.scene` is position:fixed so it
            doesn't participate in this flex layout — same reason the
            legacy app.jsx can drop it in as a plain first child. */}
        <Undercurrent />
        <Header
          projectName={projectName} branch={gitInfo?.branch} model={chatContext.model}
          safety={governance?.safety}
          recentProjects={projectInfo?.recent} currentProjectRoot={projectInfo?.root}
          onOpenProject={onOpenProject} onSwitchProject={onSwitchProject}
          onFocusTerminal={onFocusTerminal} onOpenPalette={() => palette.setOpen(true)} onSwitchToLegacy={onSwitchToLegacy}
          onOpenSettings={() => setView('settings')}
          onOpenModels={() => setView('models')}
          connectors={connectors}
          onOpenIntegrations={() => setView('integrations')}
          onToggleInspector={inspectorDrawer ? onToggleInspector : undefined}
        />
        <div className="na-workspace" style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
          <div className="na-sidebar-frame" style={{ width: sidebarCompact ? 58 : sidebarResize.size, minWidth: sidebarCompact ? 58 : 208, flexShrink: 0 }}>
            <Sidebar
              view={view}
              setView={setView}
              desktopVersion={desktopVersion}
              safetyMode={governance?.safety?.mode || null}
              compact={sidebarCompact}
              onToggleCompact={viewportWidth < SIDEBAR_RAIL_WIDTH ? undefined : onToggleSidebarCollapse}
              projectName={projectName}
              workspaceRoot={workspaceRoot}
              recentProjects={projectInfo?.recent}
              currentProjectRoot={projectInfo?.root || workspaceRoot}
              connectors={connectors}
              onOpenProject={onOpenProject}
              onSwitchProject={onSwitchProject}
              onFocusTerminal={onFocusTerminal}
              onOpenIntegrations={() => setView('integrations')}
            />
          </div>
          {!sidebarCompact && <div className="na-resize-handle-x" onMouseDown={sidebarResize.onDragStart} />}

          <div className="na-main-column" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div className="na-main-region" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div className="na-primary-surface" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <React.Suspense fallback={<SurfaceLoading />}>
                  {view === 'chat' ? (
                    <ChatWorkspace onContextChange={onContextChange} onFocusTerminal={onFocusTerminal} />
                  ) : view === 'models' ? (
                    <div style={{ overflowY: 'auto', height: '100%' }}><ModelManager /></div>
                  ) : view === 'activity' ? (
                    <ActivityHistoryView onSelect={onSelectActivityEvent} selectedId={selection?.id} />
                  ) : view === 'projects' ? (
                    <ProjectsView projectInfo={projectInfo} onOpen={onOpenProject} onSwitch={onSwitchProject} language={uiPreferences.language} />
                  ) : view === 'settings' ? (
                    <SettingsView preferences={uiPreferences} onChange={onUiPreferencesChange} onNavigate={setView} onFocusTerminal={onFocusTerminal} />
                  ) : view === 'files' ? (
                    <FilesView key={workspaceRoot || 'no-project'} />
                  ) : view === 'tasks' ? (
                    <TasksView key={workspaceRoot || 'no-project'} />
                  ) : view === 'git' ? (
                    <GitWorkspace gitInfo={gitInfo} onRefreshGit={refreshGitStatus} />
                  ) : view === 'integrations' ? (
                    <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--gap)' }}>
                      <IntegrationsSettings />
                    </div>
                  ) : view === 'commands' ? (
                    <CommandsReferenceView onFocusTerminal={onFocusTerminal} />
                  ) : view === 'agents' ? (
                    <AgentsView />
                  ) : view === 'devices' ? (
                    <DevicesView />
                  ) : view === 'remote-tools' ? (
                    <RemoteToolsView onFocusTerminal={onFocusTerminal} />
                  ) : view === 'permissions' ? (
                    <PermissionsView key={workspaceRoot || 'no-project'} />
                  ) : (
                    <ComingSoon label={view} />
                  )}
                </React.Suspense>
              </div>
            </div>

            {showBottomDock && (
              <>
                <div className="na-resize-handle-y" onMouseDown={dockResize.onDragStart} />
                <div className="na-bottom-dock" style={{ height: shortViewport ? Math.min(dockResize.size, 200) : dockResize.size, minHeight: shortViewport ? 180 : 220, flexShrink: 0, display: 'flex' }}>
                  <div className="na-terminal-pane" style={{ flex: '1 1 100%', minWidth: 0, overflow: 'hidden' }}>
                    <React.Suspense fallback={<TerminalLoading />}>
                      <TerminalDock
                        ref={terminalDockRef}
                        cwdLabel={workspaceRoot}
                      />
                    </React.Suspense>
                  </div>
                </div>
              </>
            )}
          </div>

          {!inspectorDrawer && (
            <>
              <div className="na-resize-handle-x" onMouseDown={contextResize.onDragStart} />
              <div className="na-inspector-frame" style={{ width: contextResize.size, minWidth: 340, flexShrink: 0 }}>
                {contextPanelNode}
              </div>
            </>
          )}
        </div>

        {/* Narrow layout: Context Panel becomes a toggleable drawer
            (Header's Inspector button) instead of a permanent column —
            same component/data, different structural slot. */}
        {inspectorDrawer && inspectorOpen && (
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
