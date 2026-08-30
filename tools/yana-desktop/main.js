'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { fork, spawn } = require('child_process');
const http  = require('http');
const { autoUpdater } = require('electron-updater');
const {
  runtimeBinaryPath,
  parseServerReadyPort,
  serverUrl: buildServerUrl,
} = require('./runtime-paths');
const { listDir: listDirImpl } = require('./list-dir');
const { gitStatus: gitStatusImpl } = require('./git-status');
const { readFile: readFileImpl } = require('./read-file');
const { inspectZip: inspectZipImpl, extractZip: extractZipImpl } = require('./zip-archive');
const {
  gitDiffPath: gitDiffPathImpl, gitStage: gitStageImpl, gitUnstage: gitUnstageImpl, gitCommit: gitCommitImpl,
} = require('./git-actions');
const {
  listTasks: listTasksImpl, createTask: createTaskImpl, completeTask: completeTaskImpl, dropTask: dropTaskImpl,
} = require('./task-actions');
const { terminateChild } = require('./process-lifecycle');
const {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyResizeOptions,
  normalizePtyStartOptions,
} = require('./security');

let mainWindow    = null;
let serverProcess = null;
let codeServerProcess = null;
let ptyProcess     = null;
let serverUrl      = null;
let shuttingDown   = false;
let shutdownTask   = null;
let ptyStopTask    = null;
let allowImmediateQuit = false;
let quitAfterShutdownScheduled = false;

// Same layout auth.js uses under the hood — kept in one place so the reveal-
// in-Finder button and the server's YANA_DATA_DIR can never drift apart.
function dataDir()      { return path.join(app.getPath('userData'), '.yana'); }
function authFilePath() { return path.join(dataDir(), 'auth.json'); }

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
    if (!shuttingDown && serverUrl && app.isReady()) {
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
  const child = spawn('code-server', [
    '--bind-addr', `127.0.0.1:${CODE_SERVER_PORT}`,
    '--auth', 'none',
    repoRoot(),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  child.on('error', (error) => {
    // ENOENT (not installed) is expected on most machines — the IDE tab
    // simply stays unavailable, same as before this function existed.
    // Never crashes the app over an optional, best-effort tool.
    console.log('[code-server] not started:', error.message);
    if (codeServerProcess === child) codeServerProcess = null;
  });
  child.stdout?.on('data', (d) => console.log('[code-server]', d.toString().trimEnd()));
  child.stderr?.on('data', (d) => console.error('[code-server]', d.toString().trimEnd()));
  child.on('exit', () => { if (codeServerProcess === child) codeServerProcess = null; });
  codeServerProcess = child;
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

function stopPty() {
  if (ptyStopTask) return ptyStopTask;
  const child = ptyProcess;
  ptyProcess = null;
  ptyStopTask = terminateChild(child).finally(() => { ptyStopTask = null; });
  return ptyStopTask;
}

// ── File tree (Terminal page sidebar) ───────────────────────────────────────────
// Same repo-root resolution `wrapperScript()`/`ptyBridgeBinary()` already use —
// primarily meaningful in dev mode (a packaged build's `resourcesPath` only
// ships a partial tree — core/, memory/, the server — not full source), but
// harmless either way since this just lists whatever directory actually exists.
function repoRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
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

// Locked-out recovery: the login screen's "forgot password" panel offers a
// button that reveals this file in Finder/Explorer instead of asking the
// user to type a hidden per-OS path (userData) they have no reason to know.
handleTrusted('yana:auth-file-path', () => authFilePath());
handleTrusted('yana:reveal-auth-file', () => {
  const target = authFilePath();
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  else shell.openPath(path.dirname(target));
});

// Single terminal session for v1 (see the plan's "explicitly out of scope"
// list) — a second start() call while one is already running is rejected
// rather than silently replacing it.
handleTrusted('yana:pty-start', (event, options) => {
  if (ptyProcess || ptyStopTask) return { ok: false, error: 'terminal already running or stopping' };

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
  const child = spawn(bridgeBin, [String(cols), String(rows), '--', ...childArgv], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      YANA_RT_BIN: runtimePath('yana-rt'),
    },
  });
  ptyProcess = child;

  child.stdout.on('data', (buf) =>
    mainWindow?.webContents.send('yana:pty-data', buf.toString('utf8')));
  child.stderr.on('data', (buf) =>
    console.error('[pty_bridge]', buf.toString('utf8')));
  child.on('exit', (code) => {
    mainWindow?.webContents.send('yana:pty-exit', code);
    if (ptyProcess === child) ptyProcess = null;
  });

  // Echoed back so the renderer's bounded terminal-context snapshot
  // (Phase C) can report it without needing a second IPC round-trip or
  // its own (necessarily less trustworthy) guess at the repo root.
  // Named `initialCwd`, not `cwd`: this is the directory the PTY was
  // SPAWNED in, a one-time snapshot — nothing observes a `cd` the user
  // types afterward, so calling it "cwd" would falsely imply live
  // tracking. See terminal-context.mjs's header comment for the same
  // point and the TODO for real (OSC-based) live-cwd tracking.
  return { ok: true, initialCwd: cwd };
});

handleTrusted('yana:pty-write', (event, data) => {
  ptyProcess?.stdin.write(normalizePtyInput(data));
});

handleTrusted('yana:pty-resize', (event, options) => {
  let normalized;
  try {
    normalized = normalizePtyResizeOptions(options);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  // stdio[3] is the 4th pipe opened above — undefined/closed on a bridge
  // build without resize support, in which case this is a silent no-op
  // rather than a thrown error (matches pty_bridge.rs's own fallback).
  const controlPipe = ptyProcess?.stdio?.[3];
  if (!controlPipe || controlPipe.destroyed) {
    return { ok: false, error: 'no active terminal session' };
  }
  controlPipe.write(`RESIZE ${normalized.cols} ${normalized.rows}\n`);
  return { ok: true };
});

handleTrusted('yana:pty-stop', () => stopPty());

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
  startServer();
  startCodeServer(); // best-effort, optional — see that function's own doc comment

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
});

app.on('window-all-closed', () => {
  void stopPty(); // never let a live terminal session survive as an orphan
  void stopCodeServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

function shutdownChildren() {
  if (!shutdownTask) {
    shuttingDown = true;
    shutdownTask = Promise.all([stopServer(), stopPty(), stopCodeServer()]);
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
