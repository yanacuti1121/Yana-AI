'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { fork, spawn } = require('child_process');
const http  = require('http');
const { autoUpdater } = require('electron-updater');

const PORT       = 8081;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let mainWindow    = null;
let serverProcess = null;
let ptyProcess     = null;

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

function startServer() {
  const script = serverScript();
  serverProcess = fork(script, [], {
    env: {
      ...process.env,
      PORT:          String(PORT),
      HOST:          '127.0.0.1',
      NODE_ENV:      'production',
      YANA_DATA_DIR: dataDir(),
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
  serverProcess.on('exit', (code) =>
    console.log('[server] exited', code));
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  serverProcess = null;
}

// ── Embedded terminal (yana-rt chat via a PTY) ──────────────────────────────────
// `pty_bridge` (this repo's Cargo project, `pty-bridge` feature) is a small,
// generic Rust binary — opens a real pseudo-terminal, spawns whatever argv
// it's given inside it, then shuttles raw bytes over its own stdin/stdout.
// No native Node module (node-pty) needed: this is a plain child process,
// same integration shape `startServer()` already uses for `server.js`.

function ptyBridgeBinary() {
  const name = process.platform === 'win32' ? 'pty_bridge.exe' : 'pty_bridge';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'pty-bridge', name)
    : path.join(__dirname, '..', '..', 'target', 'release', name);
}

// `scripts/yana-rt-wrapper.js` — reused unmodified as the bridge's spawned
// command, so its recursion-guard fix doesn't need to be duplicated here.
// Its own multi-tier PATH/prebuilt-binary resolution is bypassed in
// practice by the `YANA_RT_BIN` override set on this spawn (see
// `yana:pty-start` below) — that env var is the wrapper's own first-tier
// check, pointed here at exactly the binary this app was built with.
// `package.json`'s `extraFiles` ships this file to `Resources/scripts/`.
function wrapperScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'yana-rt-wrapper.js')
    : path.join(__dirname, '..', '..', 'scripts', 'yana-rt-wrapper.js');
}

function stopPty() {
  if (!ptyProcess) return;
  ptyProcess.kill('SIGTERM');
  ptyProcess = null;
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
// huge dirs like `target/`/`node_modules/`. Sandboxed the same way
// `src/chat/tools/read_file.rs` already is on the Rust side (Gate L5):
// resolve, realpath, and reject anything that escapes the repo root.
function listDir(relPath) {
  const root = fs.realpathSync(repoRoot());
  const candidate = path.join(root, relPath || '');
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (e) {
    return { ok: false, error: `cannot resolve path: ${e.message}` };
  }
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { ok: false, error: 'path escapes repo root' };
  }
  let dirents;
  try {
    dirents = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: `cannot read directory: ${e.message}` };
  }
  const entries = dirents
    .filter((d) => d.name !== '.git')
    .map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
      relPath: path.join(relPath || '', d.name),
    }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return { ok: true, entries };
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const MAX  = 60;
    const tick = () => {
      http.get(`${SERVER_URL}/health`, (res) => {
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
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('yana:version',    () => app.getVersion());
ipcMain.handle('yana:server-url', () => SERVER_URL);

// Locked-out recovery: the login screen's "forgot password" panel offers a
// button that reveals this file in Finder/Explorer instead of asking the
// user to type a hidden per-OS path (userData) they have no reason to know.
ipcMain.handle('yana:auth-file-path', () => authFilePath());
ipcMain.handle('yana:reveal-auth-file', () => {
  const target = authFilePath();
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  else shell.openPath(path.dirname(target));
});

// Single terminal session for v1 (see the plan's "explicitly out of scope"
// list) — a second start() call while one is already running is rejected
// rather than silently replacing it.
ipcMain.handle('yana:pty-start', (event, { cols, rows, args } = {}) => {
  if (ptyProcess) return { ok: false, error: 'terminal already running' };

  const bridgeBin = ptyBridgeBinary();
  if (!fs.existsSync(bridgeBin)) {
    return {
      ok: false,
      error: `pty bridge binary not found at ${bridgeBin} — run: `
        + 'cargo build --release --features pty-bridge --bin pty_bridge',
    };
  }

  const childArgv = ['node', wrapperScript(), 'chat', ...(args || [])];
  ptyProcess = spawn(bridgeBin, [String(cols), String(rows), '--', ...childArgv], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // Always force the wrapper to use the exact `yana-rt` binary this app
    // ships/was built with, via $YANA_RT_BIN (the wrapper's own first-tier
    // resolution) — rather than trusting its PATH-walk/prebuilt-binary
    // fallback tiers. Dev mode: a stale globally-installed `yana-rt` (e.g.
    // from an earlier `cargo install`) would otherwise silently shadow the
    // build actually being tested. Packaged mode: points at the binary
    // bundled via package.json's `extraFiles` (Resources/bin/yana-rt).
    env: {
      ...process.env,
      YANA_RT_BIN: app.isPackaged
        ? path.join(process.resourcesPath, 'bin', 'yana-rt')
        : path.join(__dirname, '..', '..', 'target', 'release', 'yana-rt'),
    },
  });

  ptyProcess.stdout.on('data', (buf) =>
    mainWindow?.webContents.send('yana:pty-data', buf.toString('utf8')));
  ptyProcess.stderr.on('data', (buf) =>
    console.error('[pty_bridge]', buf.toString('utf8')));
  ptyProcess.on('exit', (code) => {
    mainWindow?.webContents.send('yana:pty-exit', code);
    ptyProcess = null;
  });

  return { ok: true };
});

ipcMain.handle('yana:pty-write', (event, data) => {
  ptyProcess?.stdin.write(data);
});

ipcMain.handle('yana:pty-stop', () => stopPty());

ipcMain.handle('yana:list-dir', (event, relPath) => listDir(relPath));

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
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: 'The update has been downloaded.',
      detail: 'Restart Yana AI now to install it?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Errors (offline, unsigned-build signature check on mac, no release yet)
  // are logged, never surfaced as a dialog — a failed background version
  // check must not interrupt someone who is just trying to use the app.
  autoUpdater.on('error', (err) => console.error('[autoUpdater]', err.message));

  autoUpdater.checkForUpdates();
  // Re-check periodically for long-running sessions — 4h, not on every
  // window focus, so this never becomes a noisy repeated background poll.
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 3600_000);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startServer();

  try {
    await waitForServer();
  } catch (err) {
    await dialog.showErrorBox(
      'Yana AI — startup error',
      `Server failed to start:\n${err.message}\n\nCheck that port ${PORT} is free.`
    );
    app.quit();
    return;
  }

  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  stopPty(); // never let a live terminal session survive as an orphan
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => { stopServer(); stopPty(); });
