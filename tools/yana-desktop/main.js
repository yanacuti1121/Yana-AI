'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { randomUUID } = require('crypto');
const { fork, spawn } = require('child_process');
const http  = require('http');
const { autoUpdater } = require('electron-updater');
const {
  runtimeBinaryPath,
  codeServerPath,
  parseServerReadyPort,
  serverUrl: buildServerUrl,
} = require('./runtime-paths');
const { listDir: listDirImpl } = require('./list-dir');
const { gitStatus: gitStatusImpl } = require('./git-status');
const { readFile: readFileImpl } = require('./read-file');
const { searchCode: searchCodeImpl } = require('./search-code');
const { trashFile: trashFileImpl } = require('./trash-file');
const { inspectZip: inspectZipImpl, extractZip: extractZipImpl } = require('./zip-archive');
const {
  gitDiffPath: gitDiffPathImpl, gitStage: gitStageImpl, gitUnstage: gitUnstageImpl, gitCommit: gitCommitImpl,
} = require('./git-actions');
const {
  listTasks: listTasksImpl, createTask: createTaskImpl, completeTask: completeTaskImpl, dropTask: dropTaskImpl,
} = require('./task-actions');
const {
  listCapabilities: listCapabilitiesImpl, listPendingApprovals: listPendingApprovalsImpl,
  listLeases: listLeasesImpl, revokeLease: revokeLeaseImpl,
} = require('./permission-actions');
const { readGovernanceStatus: readGovernanceStatusImpl } = require('./governance-status');
const { readHostStatus: readHostStatusImpl } = require('./host-status');
const { readRemoteToolsStatus: readRemoteToolsStatusImpl } = require('./remote-tools-status');
const { prepareCodeServerLaunch } = require('./code-server-launch');
const {
  configureConnector: configureConnectorImpl,
  disconnectConnector: disconnectConnectorImpl,
  listConnectors: listConnectorsImpl,
  syncConnector: syncConnectorImpl,
} = require('./connector-registry');
const { listWorkspaceResources: listWorkspaceResourcesImpl } = require('./workspace-resources');
const { summarizeDesktopData } = require('./data-overview');
const { exportPortableBackup } = require('./memory-backup');
const {
  readBackupSettings,
  runAutomaticBackup,
  setBackupDirectory,
  setBackupEnabled,
} = require('./memory-backup-policy');
const {
  applyPreparedRestore,
  cleanupPreparedRestore,
  discardRestoreRollback,
  preparePortableRestore,
  rollbackPortableRestore,
} = require('./memory-restore');
const {
  beginMemoryReset,
  discardMemoryResetRollback,
  rollbackMemoryReset,
} = require('./memory-reset');
const {
  ensureDesktopDataStore,
  resolveDesktopDataDir,
  writeJsonAtomic,
} = require('./desktop-data');
const { normalizeStore, recordProject } = require('./project-store');
const { terminateChild } = require('./process-lifecycle');
const {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyResizeOptions,
  normalizePtySessionId,
  normalizePtyStartOptions,
} = require('./security');

let mainWindow    = null;
let serverProcess = null;
let codeServerProcess = null;
const ptySessions  = new Map();
let serverUrl      = null;
let shuttingDown   = false;
let shutdownTask   = null;
const ptyStopTasks = new Map();
let allowImmediateQuit = false;
let quitAfterShutdownScheduled = false;
let activeProjectRoot = null;
let serverMaintenance = false;
let automaticBackupTimer = null;
let codeServerStartTask = null;

const MAX_PTY_SESSIONS = 8;
let initializedDataDir = null;

function dataDir() {
  return initializedDataDir || resolveDesktopDataDir({
    platform: process.platform,
    homeDir: os.homedir(),
    appDataDir: app.getPath('appData'),
    xdgDataHome: process.env.XDG_DATA_HOME,
  });
}
function authFilePath() { return path.join(dataDir(), 'auth.json'); }

function initializeDataStore() {
  const targetDir = dataDir();
  const legacyDir = path.join(app.getPath('userData'), '.yana');
  const result = ensureDesktopDataStore({
    targetDir,
    legacyDir,
    applicationVersion: app.getVersion(),
  });
  initializedDataDir = result.directory;
  if (result.migratedFiles.length) {
    console.log(`[data] migrated ${result.migratedFiles.length} legacy files; rollback copy retained at ${legacyDir}`);
  }
}

// Project references live in the application's data directory, while each
// project stays in the user-selected location. The store intentionally holds
// only canonical paths and display metadata — never a copy of project files.
function projectStorePath() { return path.join(dataDir(), 'projects.json'); }

function readProjectStore() {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(projectStorePath(), 'utf8')));
  } catch (_) {
    return normalizeStore({});
  }
}

function writeProjectStore(store) {
  const normalized = normalizeStore(store);
  writeJsonAtomic(projectStorePath(), normalized);
  return normalized;
}

function defaultProjectRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
}

function resolveProjectRoot(candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.length > 4096 || candidate.includes('\0') || !path.isAbsolute(candidate)) {
    throw new Error('project path must be an absolute, NUL-free directory path');
  }
  const root = fs.realpathSync(candidate);
  if (!fs.statSync(root).isDirectory()) throw new Error('project path is not a directory');
  return root;
}

function projectInfo() {
  const root = repoRoot();
  return {
    ok: true,
    root,
    name: path.basename(root) || root,
    recent: readProjectStore().recent,
  };
}

function restoreProjectRoot() {
  for (const entry of readProjectStore().recent) {
    try {
      activeProjectRoot = resolveProjectRoot(entry.root);
      return;
    } catch (_) {
      // A recent project may have moved or an external drive may be absent.
      // Keep its reference for the user to see, but never select it blindly.
    }
  }
  activeProjectRoot = defaultProjectRoot();
}

function sendWorkspaceRoot(root) {
  const child = serverProcess;
  if (!child) return Promise.resolve();
  if (!child.connected) return Promise.reject(new Error('the local Yana runtime is not connected'));
  return new Promise((resolve, reject) => {
    child.send({ type: 'yana:workspace-root', root }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function activateProject(root) {
  // Tell the governed server first. If its IPC channel is gone, keep the
  // currently active project instead of letting chat and workspace views drift.
  await sendWorkspaceRoot(root);
  activeProjectRoot = root;
  writeProjectStore(recordProject(readProjectStore(), root));

  // Existing human terminals deliberately keep their own live CWD. Only the
  // optional IDE process restarts so a newly opened IDE targets the selected
  // project; no human shell or user-owned process is terminated here.
  if (codeServerProcess) {
    await stopCodeServer();
    await startCodeServer();
  }
  return projectInfo();
}

// ── Server ────────────────────────────────────────────────────────────────────

function serverScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'server.js')
    : path.join(__dirname, '..', 'yana-web', 'server.js');
}

function runtimePath(name) {
  return runtimeBinaryPath({
    name,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: path.join(__dirname, '..', '..'),
  });
}

function startServer() {
  const script = serverScript();
  serverUrl = null;
  serverProcess = fork(script, [], {
    env: {
      ...process.env,
      PORT:          '0',
      HOST:          '127.0.0.1',
      NODE_ENV:      'production',
      YANA_DATA_DIR: dataDir(),
      YANA_RT_BIN:   runtimePath('yana-rt'),
      YANA_ROOT_DIR: app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, '..'),
      // The runtime/core root above stays fixed. This separate, trusted
      // workspace directory is the CWD for governed turns and changes only
      // through main-process project selection.
      YANA_WORKSPACE_DIR: repoRoot(),
    },
    silent: true,
  });

  serverProcess.stdout?.on('data', (d) =>
    console.log('[server]', d.toString().trimEnd()));
  serverProcess.stderr?.on('data', (d) =>
    console.error('[server]', d.toString().trimEnd()));
  serverProcess.on('message', (message) => {
    const port = parseServerReadyPort(message);
    if (port) serverUrl = buildServerUrl(port);
  });
  const child = serverProcess;
  child.on('exit', (code, signal) => {
    if (serverProcess === child) serverProcess = null;
    console.log('[server] exited', code, signal || '');
    if (!shuttingDown && !serverMaintenance && serverUrl && app.isReady()) {
      dialog.showErrorBox(
        'Yana AI — server stopped',
        'The local Yana server exited unexpectedly. The app will close to avoid leaving a broken window open.',
      );
      app.quit();
    }
  });
}

async function stopServer() {
  const child = serverProcess;
  serverProcess = null;
  await terminateChild(child);
}

// ── IDE (code-server) ────────────────────────────────────────────────────────
// The IDE tab (tools/yana-web/desktop-src/terminal.jsx's IdePanel) has
// always iframed http://127.0.0.1:8092 (see server.js's own CSP
// frame-src), but nothing ever started a code-server there — the tab was
// real, tested, and permanently blank. code-server is a real, already-
// working "a real VS Code" (per that file's own header comment); this
// just gives it something to connect to.
//
// A system-installed tool (Homebrew, `/opt/homebrew/bin/code-server` on
// this machine — path varies by OS/install method), NOT bundled with the
// app (matches the roadmap's own "Desktop must run on its bundled
// runtime even if the system CLI is broken" — this is optional, best-
// effort, never something Yana Desktop's own startup depends on).
// Resolved via bare command name + PATH lookup (spawn() with an argv
// array, no shell) rather than a hardcoded absolute path, since the
// install location isn't portable across machines/OSes.
//
// --bind-addr / --auth explicitly override the user's own personal
// code-server config (`~/.config/code-server/config.yaml`, which on this
// machine binds :8080 with a password) — this instance is a SEPARATE,
// loopback-only, unauthenticated one on :8092, isolated from whatever the
// user runs code-server for on their own. Unauthenticated is safe here
// specifically because it's loopback-only (127.0.0.1), the exact same
// trust model this app's own local server.js already uses.
const CODE_SERVER_PORT = 8092;

function startCodeServer() {
  if (codeServerProcess && !codeServerProcess.killed) {
    return Promise.resolve({ ok: true, url: `http://127.0.0.1:${CODE_SERVER_PORT}` });
  }
  if (codeServerStartTask) return codeServerStartTask;

  // Bundled, not system-installed: resolved via codeServerPath() the same
  // way runtimePath() resolves yana-rt/pty_bridge (process.resourcesPath
  // when packaged, target/desktop-runtime/ in dev — see
  // scripts/stage-code-server.js). code-server has no native Windows
  // build (project policy: WSL2 only), and a from-scratch checkout
  // before `npm run stage:code-server` has run also won't have it staged
  // yet — both are named explicitly here instead of surfacing whatever
  // raw spawn() error each would otherwise produce (previously a bare
  // `spawn('code-server', ...)` PATH lookup, ENOENT on every machine
  // without it manually installed system-wide).
  if (process.platform === 'win32') {
    return Promise.resolve({ ok: false, error: 'IDE is not available on Windows yet (code-server has no native Windows build).' });
  }
  const codeServerBin = codeServerPath({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, repoRoot: path.join(__dirname, '..', '..') });
  if (!fs.existsSync(codeServerBin)) {
    return Promise.resolve({ ok: false, error: 'IDE component is missing from this build. Run: npm run stage:code-server' });
  }

  const launch = prepareCodeServerLaunch({ dataDir: dataDir(), repoRoot: repoRoot(), port: CODE_SERVER_PORT });
  fs.mkdirSync(path.dirname(launch.configPath), { recursive: true });
  fs.writeFileSync(launch.configPath, launch.config, { encoding: 'utf8', mode: 0o600 });

  const child = spawn(codeServerBin, launch.args, {
    cwd: repoRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  codeServerProcess = child;

  child.on('error', (error) => {
    // Now genuinely unexpected (e.g. permission denied) — the ENOENT
    // case is already ruled out by the existsSync check above, so this
    // stays a diagnostic log rather than a silently-expected outcome.
    console.log('[code-server] failed to start:', error.message);
    if (codeServerProcess === child) codeServerProcess = null;
  });
  child.stdout?.on('data', (d) => console.log('[code-server]', d.toString().trimEnd()));
  child.stderr?.on('data', (d) => console.error('[code-server]', d.toString().trimEnd()));
  child.on('exit', () => { if (codeServerProcess === child) codeServerProcess = null; });

  codeServerStartTask = new Promise((resolve) => {
    let attempts = 0;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!result.ok && codeServerProcess === child) {
        codeServerProcess = null;
        void terminateChild(child);
      }
      resolve(result);
    };
    const probe = () => {
      if (settled) return;
      if (!codeServerProcess || codeServerProcess !== child) {
        finish({ ok: false, error: 'IDE process stopped before it became ready' });
        return;
      }
      const request = http.get(launch.url, (response) => {
        response.resume();
        finish({ ok: true, url: launch.url });
      });
      request.setTimeout(500, () => request.destroy());
      request.on('error', () => {
        attempts += 1;
        if (attempts >= 40) finish({ ok: false, error: 'IDE did not become ready within 10 seconds' });
        else setTimeout(probe, 250);
      });
    };
    child.once('error', (error) => finish({ ok: false, error: `code-server could not start: ${error.message}` }));
    child.once('exit', (code) => finish({ ok: false, error: `code-server exited before ready (code ${code ?? 'unknown'})` }));
    probe();
  }).finally(() => { codeServerStartTask = null; });
  return codeServerStartTask;
}

async function stopCodeServer() {
  const child = codeServerProcess;
  codeServerProcess = null;
  await terminateChild(child);
}

// ── Embedded terminal (user shell or yana-rt chat, via a PTY) ──────────────────
// `pty_bridge` (this repo's Cargo project, `pty-bridge` feature) is a small,
// generic Rust binary — opens a real pseudo-terminal, spawns whatever argv
// it's given inside it, then shuttles raw bytes over its own stdin/stdout.
// No native Node module (node-pty) needed: this is a plain child process,
// same integration shape `startServer()` already uses for `server.js`.
//
// Security boundary (Phase A of the Desktop Terminal vertical slice): the
// renderer never supplies a program or argv, only a closed `sessionType`
// enum (validated by `normalizePtyStartOptions`). Only this function, in
// the main process, decides what executable actually runs — a compromised
// or malicious renderer cannot smuggle an arbitrary command through
// `yana:pty-start`.

function ptyBridgeBinary() {
  return runtimePath('pty_bridge');
}

// Default interactive shell per platform when $SHELL isn't set (headless
// launch, or a platform where that env var isn't conventional).
function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
  return '/bin/zsh';
}

// Resolves what `yana:pty-start` actually spawns for a given (validated)
// sessionType. Returns { program, args, cwd } — never renderer-controlled
// beyond the enum value itself.
function resolvePtySession(sessionType) {
  if (sessionType === 'user-shell') {
    return {
      program: process.env.SHELL || defaultShell(),
      // '-i': interactive login-shell behavior (aliases, prompt, rc files)
      // matching what a user expects from "their real shell" — on Windows
      // shells this flag doesn't apply, so it's Unix-only.
      args: process.platform === 'win32' ? [] : ['-i'],
      cwd: repoRoot(),
    };
  }
  // 'yana-chat' — unchanged from the pre-Phase-A behavior: the embedded
  // chat pty always runs `yana-rt chat`, never renderer-influenced argv.
  return { program: runtimePath('yana-rt'), args: ['chat'], cwd: repoRoot() };
}

function stopPty(sessionId) {
  const existingTask = ptyStopTasks.get(sessionId);
  if (existingTask) return existingTask;

  const child = ptySessions.get(sessionId);
  if (!child) return Promise.resolve();
  ptySessions.delete(sessionId);

  const task = terminateChild(child).finally(() => { ptyStopTasks.delete(sessionId); });
  ptyStopTasks.set(sessionId, task);
  return task;
}

function stopAllPtys() {
  return Promise.all([...ptySessions.keys()].map((sessionId) => stopPty(sessionId)));
}

// ── File tree (Terminal page sidebar) ───────────────────────────────────────────
// Current user workspace root. Runtime binaries and core resources continue to
// resolve from the bundled app tree; this value changes only after trusted
// main-process project selection and powers project-scoped capabilities.
function repoRoot() {
  return activeProjectRoot || defaultProjectRoot();
}

// Lists the immediate children of `relPath` (relative to the repo root) — one
// directory at a time, not a recursive walk, so this stays cheap even next to
// huge dirs like `target/`/`node_modules/`. Thin Electron-context wrapper
// around `list-dir.js`'s pure implementation (real sandboxing/listing logic
// lives there — see that file for why it's split out).
function listDir(relPath) {
  return listDirImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt'), relPath });
}

// Thin Electron-context wrapper around git-status.js's pure implementation,
// same shape as listDir() above — see that file's own doc comment for why
// this is a temporary, single-purpose transport adapter rather than a
// pattern to repeat per Context Panel field.
function gitStatus() {
  return gitStatusImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

// Thin Electron-context wrapper around read-file.js's pure implementation,
// same shape as listDir()/gitStatus() above (roadmap Phase 5 — File
// Workspace's file preview + Attachment Manager's real file content).
function readFile(relPath) {
  return readFileImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt'), relPath });
}

// Read-only, bounded code search. The Rust capability owns scope checks,
// generated-directory skips, file-size limits, and result caps; Electron only
// transports the query through a trusted renderer IPC channel.
function searchCode(query) {
  return searchCodeImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt'), query });
}

function trashFile(relPath) {
  return trashFileImpl({
    repoRoot: repoRoot(),
    relPath,
    trashItem: (target) => shell.trashItem(target),
  });
}

// Roadmap Phase 5 item 18 — Drag & Drop. The renderer only ever learns a
// dropped file's ABSOLUTE path (via preload's webUtils.getPathForFile —
// modern Electron removed the old File.path for security reasons); every
// capability call (read-file, tree) takes a root-relative path instead.
// This is the one place that translation happens, and it's a real
// boundary check, not just string math: a dropped file from OUTSIDE the
// repo resolves to a relative path starting with ".." and is rejected
// here, before it ever reaches the sandboxed Rust read (defense in depth
// alongside capability::repo::resolve_existing's own check).
function toRepoRelativePath(absolutePath) {
  if (typeof absolutePath !== 'string' || !absolutePath) return { ok: false, error: 'no path given' };
  const root = repoRoot();
  const rel = path.relative(root, absolutePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'file is outside the current project' };
  }
  return { ok: true, relPath: rel.split(path.sep).join('/') };
}

// Same containment check as toRepoRelativePath, opposite direction:
// project-relative -> absolute, used by the ZIP capability CLI actions
// below, which (unlike tree/read-file/git-status) take a bare path with
// no --root sandboxing of their own — this is the one place that check
// happens instead.
function resolveInRepo(relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const root = repoRoot();
  const resolved = path.join(root, relPath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

// Roadmap Phase 6 item 21 — ZIP Inspector.
function inspectZip(relPath) {
  const absPath = resolveInRepo(relPath);
  if (!absPath) return { ok: false, error: 'path is outside the current project' };
  return inspectZipImpl({ zipPath: absPath, yanaRtBin: runtimePath('yana-rt') });
}

// Roadmap Phase 6 item 22 — Safe Extraction. Extracts into a NEW sibling
// folder named after the archive (never into an existing directory —
// refuses rather than silently merging/overwriting), so a user's own
// project files are never touched by this without them creating the
// destination themselves first via a rename/move afterward.
function extractZip(relPath) {
  const absZipPath = resolveInRepo(relPath);
  if (!absZipPath) return { ok: false, error: 'path is outside the current project' };
  const destName = path.basename(relPath, path.extname(relPath));
  const destDir = path.join(path.dirname(absZipPath), destName);
  if (fs.existsSync(destDir)) {
    return { ok: false, error: `a file or folder named "${destName}" already exists next to this archive` };
  }
  fs.mkdirSync(destDir, { recursive: true });
  const result = extractZipImpl({ zipPath: absZipPath, dest: destDir, yanaRtBin: runtimePath('yana-rt') });
  if (!result.ok) {
    try { fs.rmSync(destDir, { recursive: true, force: true }); } catch (_) {}
    return result;
  }
  return { ...result, destRelPath: path.relative(repoRoot(), destDir).split(path.sep).join('/') };
}

// Roadmap Phase 7 items 27-28 — Git Inspector + Git Actions. Every path
// argument goes through resolveInRepo() first — none of these trust a
// renderer-supplied relPath as pre-sanitized, same discipline as
// inspectZip()/extractZip() above.
function gitDiffPath(relPath, staged) {
  const abs = resolveInRepo(relPath);
  if (!abs) return { ok: false, error: 'path is outside the current project' };
  return gitDiffPathImpl({ repoRoot: repoRoot(), relPath, staged: !!staged, yanaRtBin: runtimePath('yana-rt') });
}

function gitStage(relPaths) {
  for (const p of relPaths) { if (!resolveInRepo(p)) return { ok: false, error: `path is outside the current project: ${p}` }; }
  return gitStageImpl({ repoRoot: repoRoot(), relPaths, yanaRtBin: runtimePath('yana-rt') });
}

function gitUnstage(relPaths) {
  for (const p of relPaths) { if (!resolveInRepo(p)) return { ok: false, error: `path is outside the current project: ${p}` }; }
  return gitUnstageImpl({ repoRoot: repoRoot(), relPaths, yanaRtBin: runtimePath('yana-rt') });
}

function gitCommit(message) {
  return gitCommitImpl({ repoRoot: repoRoot(), message, yanaRtBin: runtimePath('yana-rt') });
}

// Roadmap Phase 8 — Tasks. Same TaskStore any terminal `yana-rt task`
// invocation already reads/writes (see task-actions.js's own doc
// comment) — no second, frontend-only todo system.
function listTasks() {
  return listTasksImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function createTask(name, scope) {
  return createTaskImpl({ repoRoot: repoRoot(), name, scope, yanaRtBin: runtimePath('yana-rt') });
}

function completeTask(id, evidence) {
  return completeTaskImpl({ repoRoot: repoRoot(), id, evidence, yanaRtBin: runtimePath('yana-rt') });
}

function dropTask(id) {
  return dropTaskImpl({ repoRoot: repoRoot(), id, yanaRtBin: runtimePath('yana-rt') });
}

// Roadmap Phase 16 — Permissions & Autonomy (Permission Inspector /
// Approval UI / Autonomy Controls). Same real backend the terminal `yana-rt
// capability|authority|lease` subcommands already read/write — no
// separate frontend-only permission model.
function listCapabilities() {
  return listCapabilitiesImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function listPendingApprovals() {
  return listPendingApprovalsImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function listLeases() {
  return listLeasesImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function revokeLease(id) {
  return revokeLeaseImpl({ repoRoot: repoRoot(), id, yanaRtBin: runtimePath('yana-rt') });
}

function governanceStatus() {
  return readGovernanceStatusImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function hostStatus() {
  return readHostStatusImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function remoteToolsStatus() {
  return readRemoteToolsStatusImpl({ repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') });
}

function connectorRuntimeOptions() {
  return { repoRoot: repoRoot(), yanaRtBin: runtimePath('yana-rt') };
}

function listConnectors() {
  return listConnectorsImpl(connectorRuntimeOptions());
}

function configureConnector(name, scopes) {
  return configureConnectorImpl({ ...connectorRuntimeOptions(), name, scopes });
}

function disconnectConnector(name) {
  return disconnectConnectorImpl({ ...connectorRuntimeOptions(), name });
}

function syncConnector(name, options) {
  return syncConnectorImpl({ ...connectorRuntimeOptions(), name, ...options });
}

function listWorkspaceResources(connector) {
  return listWorkspaceResourcesImpl({ ...connectorRuntimeOptions(), connector });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const MAX  = 60;
    const tick = () => {
      if (!serverUrl) { retry(); return; }
      http.get(`${serverUrl}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (++tries >= MAX) return reject(new Error('Server did not start in 30 s'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1280,
    height:   800,
    // Below the responsive drawer breakpoint (themes.css: 860px), so the
    // window can actually reach the width needed to trigger the mobile
    // sidebar-collapse layout — minWidth: 900 previously made that
    // breakpoint unreachable no matter how far the window was shrunk.
    minWidth: 420,
    minHeight: 500,
    title:    'Yana AI',
    show:     false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isTrustedUrl(url, serverUrl) && isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((error) =>
        console.error('[external-link] failed:', error.message));
    }
    return { action: 'deny' };
  });

  const guardNavigation = (event, url) => {
    if (isTrustedUrl(url, serverUrl)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((error) =>
        console.error('[external-link] failed:', error.message));
    }
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);

  mainWindow.loadURL(serverUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event, serverUrl)) {
      throw new Error(`Rejected untrusted IPC sender for ${channel}`);
    }
    return handler(event, ...args);
  });
}

handleTrusted('yana:version',    () => app.getVersion());
handleTrusted('yana:server-url', () => serverUrl);
handleTrusted('yana:project-info', () => projectInfo());
handleTrusted('yana:project-open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open or create a project',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length !== 1) return { ok: false, cancelled: true };
  try {
    return await activateProject(resolveProjectRoot(result.filePaths[0]));
  } catch (error) {
    return { ok: false, error: `could not open project: ${error.message}` };
  }
});
handleTrusted('yana:project-switch', async (event, requestedRoot) => {
  if (typeof requestedRoot !== 'string' || requestedRoot.length > 4096 || requestedRoot.includes('\0')) {
    return { ok: false, error: 'project path is invalid' };
  }
  const stored = readProjectStore().recent.some((entry) => entry.root === requestedRoot);
  if (!stored) return { ok: false, error: 'project is not in recent projects' };
  try {
    return await activateProject(resolveProjectRoot(requestedRoot));
  } catch (error) {
    return { ok: false, error: `could not switch project: ${error.message}` };
  }
});

// Locked-out recovery: the login screen's "forgot password" panel offers a
// button that reveals this file in Finder/Explorer instead of asking the
// user to type a hidden per-OS path (userData) they have no reason to know.
handleTrusted('yana:auth-file-path', () => authFilePath());
handleTrusted('yana:reveal-auth-file', () => {
  const target = authFilePath();
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  else shell.openPath(path.dirname(target));
});

async function exportMemoryBackupWithDialog() {
  const date = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Yana memory backup',
    defaultPath: path.join(app.getPath('documents'), `Yana-memory-${date}.zip`),
    filters: [{ name: 'Yana memory backup', extensions: ['zip'] }],
    properties: ['showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  return exportPortableBackup({
    dataDir: dataDir(),
    outputPath: result.filePath,
    applicationVersion: app.getVersion(),
    yanaRtBin: runtimePath('yana-rt'),
  });
}

handleTrusted('yana:memory-backup-export', () => exportMemoryBackupWithDialog());

handleTrusted('yana:data-overview', () => {
  try {
    return { ok: true, overview: summarizeDesktopData(dataDir()) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

handleTrusted('yana:memory-backup-settings', () => {
  try {
    return { ok: true, ...readBackupSettings(dataDir()) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

handleTrusted('yana:memory-backup-select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose automatic memory backup folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length !== 1) return { ok: false, cancelled: true };
  try {
    return { ok: true, ...setBackupDirectory(dataDir(), result.filePaths[0]) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

handleTrusted('yana:memory-backup-set-enabled', (event, enabled) => {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' };
  try {
    return { ok: true, ...setBackupEnabled(dataDir(), enabled) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

async function startServerAfterDataChange() {
  startServer();
  await waitForServer();
  return serverUrl;
}

function scheduleWindowReload(url) {
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(url).catch((error) => console.error('[restore] window reload failed:', error.message));
    }
  }, 100);
}

handleTrusted('yana:memory-backup-restore', async () => {
  const selected = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Yana memory backup',
    filters: [{ name: 'Yana memory backup', extensions: ['zip'] }],
    properties: ['openFile'],
  });
  if (selected.canceled || selected.filePaths.length !== 1) return { ok: false, cancelled: true };

  const prepared = preparePortableRestore({
    archivePath: selected.filePaths[0],
    yanaRtBin: runtimePath('yana-rt'),
  });
  if (!prepared.ok) return prepared;

  try {
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Restore Yana memory?',
      message: `Restore ${prepared.includedFiles.length} portable data file${prepared.includedFiles.length === 1 ? '' : 's'}?`,
      detail: `${prepared.includedFiles.join('\n')}\n\nCredentials and login sessions will not be changed. The local Yana service will restart briefly.`,
      buttons: ['Restore', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (confirmation.response !== 0) return { ok: false, cancelled: true };

    serverMaintenance = true;
    let transaction = null;
    try {
      await stopServer();
      transaction = applyPreparedRestore({ prepared, dataDir: dataDir() });
      const restoredServerUrl = await startServerAfterDataChange();
      discardRestoreRollback(transaction);
      scheduleWindowReload(restoredServerUrl);
      return { ok: true, includedFiles: prepared.includedFiles };
    } catch (error) {
      try { await stopServer(); } catch (_) {}
      let recoveryError = null;
      let rollbackFailed = false;
      if (transaction) {
        try { rollbackPortableRestore(transaction); }
        catch (rollbackError) { recoveryError = rollbackError; rollbackFailed = true; }
        finally { if (!rollbackFailed) discardRestoreRollback(transaction); }
      }
      if (!recoveryError) {
        try {
          const recoveredServerUrl = await startServerAfterDataChange();
          scheduleWindowReload(recoveredServerUrl);
        }
        catch (restartError) { recoveryError = restartError; }
      }
      const recoveryDetail = recoveryError
        ? ` Original data recovery also failed: ${recoveryError.message}${rollbackFailed ? `; rollback retained at ${transaction.rollbackDir}` : ''}`
        : ' Original data was restored.';
      return { ok: false, error: `Memory restore failed: ${error.message}.${recoveryDetail}` };
    } finally {
      serverMaintenance = false;
    }
  } finally {
    cleanupPreparedRestore(prepared);
  }
});

handleTrusted('yana:memory-reset', async () => {
  const firstChoice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Reset portable Yana memory?',
    message: 'This removes memory, conversations, and missions from this device.',
    detail: 'Credentials, login sessions, projects, and the data schema stay unchanged. You can export a portable backup first.',
    buttons: ['Export first', 'Continue', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (firstChoice.response === 2) return { ok: false, cancelled: true };
  if (firstChoice.response === 0) {
    const exported = await exportMemoryBackupWithDialog();
    if (!exported.ok) return exported;
  }

  const finalChoice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Confirm memory reset',
    message: 'Reset portable memory now?',
    detail: 'This action restarts the local Yana service. If the restart fails, the current data will be restored automatically.',
    buttons: ['Reset memory', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (finalChoice.response !== 0) return { ok: false, cancelled: true };

  serverMaintenance = true;
  let transaction = null;
  try {
    await stopServer();
    transaction = beginMemoryReset({ dataDir: dataDir() });
    const resetServerUrl = await startServerAfterDataChange();
    discardMemoryResetRollback(transaction);
    scheduleWindowReload(resetServerUrl);
    return { ok: true, removedFiles: transaction.movedFiles };
  } catch (error) {
    try { await stopServer(); } catch (_) {}
    let recoveryError = null;
    let rollbackFailed = false;
    if (transaction) {
      try { rollbackMemoryReset(transaction); }
      catch (rollbackError) { recoveryError = rollbackError; rollbackFailed = true; }
      finally { if (!rollbackFailed) discardMemoryResetRollback(transaction); }
    }
    if (!recoveryError) {
      try {
        const recoveredServerUrl = await startServerAfterDataChange();
        scheduleWindowReload(recoveredServerUrl);
      } catch (restartError) { recoveryError = restartError; }
    }
    const recoveryDetail = recoveryError
      ? ` Recovery also failed: ${recoveryError.message}${rollbackFailed ? `; rollback retained at ${transaction.rollbackDir}` : ''}`
      : ' Current data was restored.';
    return { ok: false, error: `Memory reset failed: ${error.message}.${recoveryDetail}` };
  } finally {
    serverMaintenance = false;
  }
});

handleTrusted('yana:pty-start', (event, options) => {
  if (ptySessions.size + ptyStopTasks.size >= MAX_PTY_SESSIONS) {
    return { ok: false, error: `terminal session limit reached (${MAX_PTY_SESSIONS})` };
  }

  let normalized;
  try {
    normalized = normalizePtyStartOptions(options);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  const { cols, rows, sessionType } = normalized;

  const bridgeBin = ptyBridgeBinary();
  if (!fs.existsSync(bridgeBin)) {
    return {
      ok: false,
      error: `pty bridge binary not found at ${bridgeBin} — run: `
        + 'cargo build --release --features pty-bridge --bin pty_bridge',
    };
  }

  // Program/args/cwd are resolved HERE, in main, from the closed
  // sessionType enum only — see resolvePtySession()'s doc comment.
  const { program, args, cwd } = resolvePtySession(sessionType);
  if (!fs.existsSync(program)) {
    return { ok: false, error: `${sessionType} executable not found at ${program}` };
  }

  const childArgv = [program, ...args];
  // 4th stdio pipe: the resize control channel pty_bridge reads as fd 3
  // (see src/bin/pty_bridge.rs's doc comment). Absent on non-Unix bridges
  // today, but always opened here — a bridge build with no resize
  // listener simply never reads it, per that file's own fallback.
  // TERM/LANG: an Electron app launched from Finder/Dock (not from an
  // existing terminal) inherits neither. Without TERM, a themed shell
  // prompt (oh-my-zsh, powerlevel10k, starship) can't find its terminfo
  // entry and prints raw escape sequences instead of interpreting them,
  // and readline's key bindings (arrows, Home/End) stop resolving —
  // exactly xterm.js's own identity, so pty_bridge's child (via
  // portable_pty::CommandBuilder, which inherits this process's env by
  // default) needs it set explicitly here. LANG/LC_ALL only fall back
  // when truly unset, so a real user locale (set when launched from an
  // actual terminal) is never overridden — the fallback exists only to
  // make multi-byte input (Vietnamese diacritics) round-trip through the
  // shell's own line editor on a Dock launch, where xterm.js already
  // handles UTF-8 correctly on the client side but the shell wouldn't.
  const child = spawn(bridgeBin, [String(cols), String(rows), '--', ...childArgv], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    env: {
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      ...process.env,
      TERM: 'xterm-256color',
      YANA_RT_BIN: runtimePath('yana-rt'),
    },
  });
  const sessionId = randomUUID();
  ptySessions.set(sessionId, child);

  child.stdout.on('data', (buf) =>
    mainWindow?.webContents.send('yana:pty-data', { sessionId, chunk: buf.toString('utf8') }));
  child.stderr.on('data', (buf) =>
    console.error('[pty_bridge]', buf.toString('utf8')));
  child.on('exit', (code) => {
    mainWindow?.webContents.send('yana:pty-exit', { sessionId, code });
    if (ptySessions.get(sessionId) === child) ptySessions.delete(sessionId);
  });

  // Echo the spawn directory so the renderer can label the fresh terminal
  // without guessing. It remains an initial snapshot only; later CWD updates
  // are accepted solely from OSC 7 shell-integration markers in untrusted PTY
  // output, never inferred from a prompt or used as a privileged path.
  return { ok: true, sessionId, initialCwd: cwd, sessionType, shell: path.basename(program) };
});

handleTrusted('yana:pty-write', (event, sessionId, data) => {
  let normalizedId;
  let normalizedData;
  try {
    normalizedId = normalizePtySessionId(sessionId);
    normalizedData = normalizePtyInput(data);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  const child = ptySessions.get(normalizedId);
  if (!child || child.stdin.destroyed) return { ok: false, error: 'no active terminal session' };
  child.stdin.write(normalizedData);
  return { ok: true };
});

handleTrusted('yana:pty-resize', (event, sessionId, options) => {
  let normalizedId;
  let normalized;
  try {
    normalizedId = normalizePtySessionId(sessionId);
    normalized = normalizePtyResizeOptions(options);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  // stdio[3] is the 4th pipe opened above — undefined/closed on a bridge
  // build without resize support, in which case this is a silent no-op
  // rather than a thrown error (matches pty_bridge.rs's own fallback).
  const controlPipe = ptySessions.get(normalizedId)?.stdio?.[3];
  if (!controlPipe || controlPipe.destroyed) {
    return { ok: false, error: 'no active terminal session' };
  }
  controlPipe.write(`RESIZE ${normalized.cols} ${normalized.rows}\n`);
  return { ok: true };
});

handleTrusted('yana:pty-stop', (event, sessionId) => {
  let normalizedId;
  try {
    normalizedId = normalizePtySessionId(sessionId);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!ptySessions.has(normalizedId)) return { ok: false, error: 'no active terminal session' };
  return stopPty(normalizedId).then(() => ({ ok: true }));
});

handleTrusted('yana:list-dir', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return listDir(relPath);
});

handleTrusted('yana:git-status', () => gitStatus());

handleTrusted('yana:read-file', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return readFile(relPath);
});

handleTrusted('yana:search-code', (event, query) => {
  if (typeof query !== 'string' || query.length > 512 || query.includes('\0')) {
    return { ok: false, error: 'query must be a NUL-free string up to 512 characters' };
  }
  return searchCode(query);
});

handleTrusted('yana:trash-file', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return trashFile(relPath);
});

handleTrusted('yana:to-repo-relative-path', (event, absolutePath) => {
  if (typeof absolutePath !== 'string' || absolutePath.length > 4096 || absolutePath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return toRepoRelativePath(absolutePath);
});

handleTrusted('yana:zip-inspect', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return inspectZip(relPath);
});

handleTrusted('yana:zip-extract', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return extractZip(relPath);
});

function validPathList(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 200
    && paths.every((p) => typeof p === 'string' && p.length <= 4096 && !p.includes('\0'));
}

handleTrusted('yana:git-diff-path', (event, relPath, staged) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return gitDiffPath(relPath, staged);
});

handleTrusted('yana:git-stage', (event, relPaths) => {
  if (!validPathList(relPaths)) return { ok: false, error: 'paths must be a non-empty array of up to 200 NUL-free strings' };
  return gitStage(relPaths);
});

handleTrusted('yana:git-unstage', (event, relPaths) => {
  if (!validPathList(relPaths)) return { ok: false, error: 'paths must be a non-empty array of up to 200 NUL-free strings' };
  return gitUnstage(relPaths);
});

handleTrusted('yana:git-commit', (event, message) => {
  if (typeof message !== 'string' || !message.trim() || message.length > 8192) {
    return { ok: false, error: 'message must be a non-empty string up to 8192 characters' };
  }
  return gitCommit(message);
});

handleTrusted('yana:task-list', () => listTasks());

handleTrusted('yana:task-create', (event, name, scope) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 2048) {
    return { ok: false, error: 'name must be a non-empty string up to 2048 characters' };
  }
  if (scope != null && (typeof scope !== 'string' || scope.length > 512)) {
    return { ok: false, error: 'scope must be a string up to 512 characters' };
  }
  return createTask(name, scope || undefined);
});

handleTrusted('yana:task-complete', (event, id, evidence) => {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) {
    return { ok: false, error: 'id must be a non-empty string up to 128 characters' };
  }
  if (typeof evidence !== 'string' || !evidence.trim() || evidence.length > 4096) {
    return { ok: false, error: 'evidence must be a non-empty string up to 4096 characters' };
  }
  return completeTask(id, evidence);
});

handleTrusted('yana:task-drop', (event, id) => {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) {
    return { ok: false, error: 'id must be a non-empty string up to 128 characters' };
  }
  return dropTask(id);
});

handleTrusted('yana:permission-list-capabilities', () => listCapabilities());

handleTrusted('yana:permission-pending-approvals', () => listPendingApprovals());

handleTrusted('yana:permission-list-leases', () => listLeases());

handleTrusted('yana:permission-revoke-lease', (event, id) => {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) {
    return { ok: false, error: 'id must be a non-empty string up to 128 characters' };
  }
  return revokeLease(id);
});

handleTrusted('yana:governance-status', () => governanceStatus());

handleTrusted('yana:host-status', () => hostStatus());

handleTrusted('yana:remote-tools-status', () => remoteToolsStatus());

handleTrusted('yana:connector-list', () => listConnectors());

handleTrusted('yana:connector-configure', (event, name, scopes) => {
  if (typeof name !== 'string' || name.length > 64) {
    return { ok: false, error: 'connector name is invalid' };
  }
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 32
      || scopes.some((scope) => typeof scope !== 'string' || scope.length > 64)) {
    return { ok: false, error: 'connector scopes are invalid' };
  }
  return configureConnector(name, scopes);
});

handleTrusted('yana:connector-disconnect', (event, name) => {
  if (typeof name !== 'string' || name.length > 64) {
    return { ok: false, error: 'connector name is invalid' };
  }
  return disconnectConnector(name);
});

handleTrusted('yana:connector-sync', (event, name, options = {}) => {
  if (typeof name !== 'string' || name.length > 64 || !options || typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, error: 'connector sync request is invalid' };
  }
  const limit = options.limit === undefined ? 20 : options.limit;
  const dryRun = options.dryRun === undefined ? false : options.dryRun;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || typeof dryRun !== 'boolean') {
    return { ok: false, error: 'connector sync options are invalid' };
  }
  // Only threaded through for connectors whose Rust-side sync needs a
  // credential via environment variable (github today — see
  // connector-registry.js's SYNC_ENV_VAR_BY_CONNECTOR); ignored for every
  // other connector, never logged, never written to disk.
  if (options.accessToken !== undefined
      && (typeof options.accessToken !== 'string' || options.accessToken.length === 0 || options.accessToken.length > 4096)) {
    return { ok: false, error: 'connector sync options are invalid' };
  }
  return syncConnector(name, { limit, dryRun, accessToken: options.accessToken });
});

handleTrusted('yana:workspace-resources', (event, connector) => {
  if (connector != null && (typeof connector !== 'string' || connector.length > 64)) {
    return { ok: false, error: 'connector name is invalid' };
  }
  return listWorkspaceResources(connector);
});

handleTrusted('yana:ide-open', async () => {
  const result = await startCodeServer();
  if (!result.ok) return result;
  try {
    await shell.openExternal(result.url);
    return result;
  } catch (error) {
    return { ok: false, error: `could not open IDE in the default browser: ${error.message}` };
  }
});

// ── Auto-update ───────────────────────────────────────────────────────────────
// Checks GitHub Releases (build.publish in package.json) for a newer tagged
// build. Ask-before-download, ask-before-install — never silent, since an
// auto-installed update the user didn't confirm is a bigger risk than a
// missed notification.
//
// KNOWN GAP: this repo does not currently hold a code-signing certificate
// (see tools/yana-desktop/README.md). On macOS, electron-updater verifies a
// downloaded update's signature before allowing install; an unsigned build
// will fail that check with a clear error rather than silently installing
// unverified code — so today this menu genuinely tells a macOS user "update
// available" but downloadUpdate()/quitAndInstall() will error out until a
// certificate exists. Windows/Linux (AppImage) are not signature-gated the
// same way and this flow works there today, at the reduced trust level any
// unsigned Windows/Linux binary already carries.
function setupAutoUpdater() {
  if (!app.isPackaged) return; // dev runs have no publish feed to check

  let userRequestedDownload = false;

  autoUpdater.autoDownload         = false; // ask first
  autoUpdater.autoInstallOnAppQuit = false; // ask first

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update available',
      message: `Yana AI ${info.version} is available — you have ${app.getVersion()}.`,
      detail: 'Download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        userRequestedDownload = true;
        autoUpdater.downloadUpdate().catch(err =>
          console.error('[autoUpdater] download failed:', err.message));
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    userRequestedDownload = false;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: 'The update has been downloaded.',
      detail: 'Restart Yana AI now to install it?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        shutdownChildren().then(() => {
          allowImmediateQuit = true;
          autoUpdater.quitAndInstall();
        }).catch((error) => {
          console.error('[autoUpdater] install preparation failed:', error.message);
          dialog.showErrorBox('Yana AI — update failed', error.message);
        });
      }
    });
  });

  // Background errors (offline, no release yet) stay in logs so an automatic
  // check never interrupts normal work. Once a user explicitly chooses
  // Download, failures are surfaced because silence would look like a hung UI.
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err.message);
    if (userRequestedDownload) {
      userRequestedDownload = false;
      dialog.showErrorBox(
        'Yana AI — update failed',
        `The requested update could not be downloaded or verified:\n${err.message}`,
      );
    }
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch(err =>
      console.error('[autoUpdater] check failed:', err.message));
  };
  checkForUpdates();
  // Re-check periodically for long-running sessions — 4h, not on every
  // window focus, so this never becomes a noisy repeated background poll.
  setInterval(checkForUpdates, 4 * 3600_000);
}

function setupAutomaticMemoryBackup() {
  const check = () => {
    const result = runAutomaticBackup({
      dataDir: dataDir(),
      applicationVersion: app.getVersion(),
      yanaRtBin: runtimePath('yana-rt'),
    });
    if (result.ok && !result.skipped) console.log('[backup] automatic memory backup created:', result.outputPath);
    if (!result.ok) console.error('[backup] automatic memory backup failed:', result.error);
  };
  setTimeout(check, 15_000);
  automaticBackupTimer = setInterval(check, 60 * 60 * 1000);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

if (hasInstanceLock) app.whenReady().then(async () => {
  try {
    initializeDataStore();
  } catch (error) {
    dialog.showErrorBox('Yana AI — data migration error', error.message);
    app.quit();
    return;
  }
  restoreProjectRoot();
  startServer();

  try {
    await waitForServer();
  } catch (err) {
    await dialog.showErrorBox(
      'Yana AI — startup error',
      `Server failed to start:\n${err.message}`
    );
    app.quit();
    return;
  }

  createWindow();
  setupAutoUpdater();
  setupAutomaticMemoryBackup();
});

app.on('window-all-closed', () => {
  void stopAllPtys(); // never let a live terminal session survive as an orphan
  void stopCodeServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, 'activate' can fire during the app's own startup race, before
  // whenReady()'s waitForServer() has resolved and serverUrl is set. Calling
  // createWindow() at that point crashes on loadURL(null) (real bug, seen
  // live: "TypeError: ... conversion failure from null" at createWindow's
  // loadURL call). The whenReady() flow already creates the window once the
  // server is actually ready, so this only needs to handle the legitimate
  // case: no window, and a server already up (e.g. dock-click reopen).
  if (!mainWindow && serverUrl) createWindow();
});

function shutdownChildren() {
  if (!shutdownTask) {
    shuttingDown = true;
    if (automaticBackupTimer) {
      clearInterval(automaticBackupTimer);
      automaticBackupTimer = null;
    }
    shutdownTask = Promise.all([stopServer(), stopAllPtys(), stopCodeServer()]);
  }
  return shutdownTask;
}

app.on('before-quit', (event) => {
  if (allowImmediateQuit) return;
  event.preventDefault();
  if (quitAfterShutdownScheduled) return;
  quitAfterShutdownScheduled = true;
  shutdownChildren()
    .catch((error) => console.error('[shutdown]', error.message))
    .finally(() => {
      allowImmediateQuit = true;
      app.quit();
    });
});
