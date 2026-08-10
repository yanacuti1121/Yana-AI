'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { fork, spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const http  = require('http');
const { autoUpdater } = require('electron-updater');
const {
  runtimeBinaryPath,
  parseServerReadyPort,
  serverUrl: buildServerUrl,
} = require('./runtime-paths');
const { isAllowedPtyArgs } = require('./pty-args');

let mainWindow    = null;
let serverProcess = null;
let ptyProcess     = null;
let serverUrl      = null;

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
  return runtimePath('pty_bridge');
}

// RACE FIX (found in review): this used to kill the process and null out
// `ptyProcess` synchronously, before the OS had actually reaped it. A
// caller doing stop-then-start-again (a "restart") would see the guard in
// `yana:pty-start` ("terminal already running") pass immediately, spawn a
// SECOND pty_bridge, and then the still-dying FIRST one's stdout listener
// (still attached to that now-orphaned child_process object, since it was
// only ever detached from the `ptyProcess` module variable, not actually
// removed) could still fire and send stale output from the old session
// into the new one's terminal view. Now waits for the real 'exit' event
// before resolving, with a SIGKILL fallback so a hung child can't wedge
// the next start forever.
function stopPty() {
  if (!ptyProcess) return Promise.resolve();
  const proc = ptyProcess;
  ptyProcess = null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    proc.once('exit', finish);
    proc.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (!settled) proc.kill('SIGKILL');
    }, 3000);
    proc.once('exit', () => clearTimeout(killTimer));
    // Belt-and-suspenders: if 'exit' never fires for some reason, don't
    // hang the caller (e.g. yana:pty-stop's IPC promise) forever either.
    setTimeout(finish, 3500);
  });
}

// ── File tree (Terminal page sidebar) ───────────────────────────────────────────
// Same repo-root resolution `wrapperScript()`/`ptyBridgeBinary()` already use —
// primarily meaningful in dev mode (a packaged build's `resourcesPath` only
// ships a partial tree — core/, memory/, the server — not full source), but
// harmless either way since this just lists whatever directory actually exists.
function repoRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
}

// Shared sandboxing for any repo-relative path operation (Gate L5, same
// pattern `src/chat/tools/read_file.rs` uses on the Rust side): resolve,
// realpath, reject anything that escapes the repo root.
function resolveSandboxed(relPath) {
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
  return { ok: true, resolved };
}

// Lists the immediate children of `relPath` (relative to the repo root) — one
// directory at a time, not a recursive walk, so this stays cheap even next to
// huge dirs like `target/`/`node_modules/`.
function listDir(relPath) {
  const sandboxed = resolveSandboxed(relPath);
  if (!sandboxed.ok) return sandboxed;
  let dirents;
  try {
    dirents = fs.readdirSync(sandboxed.resolved, { withFileTypes: true });
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
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!serverUrl || !url.startsWith(serverUrl)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(serverUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('yana:version',    () => app.getVersion());
ipcMain.handle('yana:server-url', () => serverUrl);

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
//
// SECURITY (found in review before this handler shipped): `args` used to be
// spread straight from the renderer's IPC payload into the spawned
// `yana-rt chat` argv with zero validation. contextIsolation/nodeIntegration
// keep the renderer off raw Node, but that only protects the boundary this
// handler is itself part of — an untrusted-args IPC handler is a hole in
// that boundary, not something the sandbox settings cover. A compromised
// renderer (XSS, a poisoned bundled dependency) could have called
// `window.yana.ptyStart({ args: ['--no-sandbox'] })` and silently disabled
// `run_command`'s sandbox for the whole chat session — the exact protection
// this repo's safety model depends on. The current legitimate caller
// (terminal.jsx) only ever sends `args: []`, so nothing real depends on
// forwarding a non-empty array; reject rather than filter, so an attempt
// is visible instead of silently stripped.
ipcMain.handle('yana:pty-start', (event, { cols, rows, args } = {}) => {
  if (ptyProcess) return { ok: false, error: 'terminal already running' };

  if (!isAllowedPtyArgs(args)) {
    return { ok: false, error: 'yana:pty-start does not accept extra argv from the renderer' };
  }

  const bridgeBin = ptyBridgeBinary();
  if (!fs.existsSync(bridgeBin)) {
    return {
      ok: false,
      error: `pty bridge binary not found at ${bridgeBin} — run: `
        + 'cargo build --release --features pty-bridge --bin pty_bridge',
    };
  }

  const yanaRtBin = runtimePath('yana-rt');
  if (!fs.existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }

  const childArgv = [yanaRtBin, 'chat'];
  // RESIZE FIX (found in review): stdin is already fully consumed as raw
  // PTY input (real keystrokes), so a resize command can't be smuggled
  // into that stream without risking collision with something the user
  // actually typed. A 4th stdio pipe (fd 3), used only for resize control
  // messages, keeps that channel separate. Unix only for now — Windows
  // doesn't inherit raw fds the same way and pty_bridge.rs only opens fd 3
  // under #[cfg(unix)]; on Windows this pipe still gets created here but
  // nothing on the child side reads it, so yana:pty-resize below becomes a
  // documented no-op rather than a silent one (see its own comment).
  const stdio = process.platform === 'win32'
    ? ['pipe', 'pipe', 'pipe']
    : ['pipe', 'pipe', 'pipe', 'pipe'];
  ptyProcess = spawn(bridgeBin, [String(cols), String(rows), '--', ...childArgv], {
    stdio,
    env: {
      ...process.env,
      YANA_RT_BIN: yanaRtBin,
    },
  });

  // UTF-8 FIX (found in review): `buf.toString('utf8')` per chunk is not
  // safe on an arbitrary byte stream — a multi-byte character (this app
  // is Vietnamese-first, so this is not a theoretical edge case) can land
  // split across two separate 'data' events, and decoding each chunk
  // independently turns the split character into U+FFFD replacement
  // characters on both sides. StringDecoder holds the trailing partial
  // sequence across calls and only emits complete characters.
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');
  ptyProcess.stdout.on('data', (buf) =>
    mainWindow?.webContents.send('yana:pty-data', stdoutDecoder.write(buf)));
  ptyProcess.stderr.on('data', (buf) =>
    console.error('[pty_bridge]', stderrDecoder.write(buf)));
  ptyProcess.on('exit', (code) => {
    mainWindow?.webContents.send('yana:pty-exit', code);
    ptyProcess = null;
  });

  return { ok: true };
});

ipcMain.handle('yana:pty-write', (event, data) => {
  ptyProcess?.stdin.write(data);
});

// RESIZE FIX (found in review): previously there was no way at all to
// tell the running pty_bridge that the terminal panel had been resized —
// xterm.js's FitAddon re-fit the *visual* grid on the frontend, but the
// actual pty (and anything running inside it that queries or reacts to
// terminal size — most TUIs, `tput cols`, line-wrapping shells) kept
// whatever size was passed at yana:pty-start and silently drifted out of
// sync with the window. Writes a small text control message (not JSON —
// this repo's own pty_bridge.rs is deliberately dependency-light, see its
// header comment) to the dedicated fd-3 control pipe opened above.
// Bounds match a normal terminal's realistic range and guard against a
// buggy or compromised renderer sending an absurd size.
ipcMain.handle('yana:pty-resize', (event, { cols, rows } = {}) => {
  if (!ptyProcess || !ptyProcess.stdio[3]) return { ok: false, error: 'no active terminal (or unsupported on this platform)' };
  const c = Number(cols), r = Number(rows);
  if (!Number.isInteger(c) || !Number.isInteger(r) || c < 1 || r < 1 || c > 1000 || r > 1000) {
    return { ok: false, error: 'cols/rows out of range' };
  }
  ptyProcess.stdio[3].write(`resize ${c} ${r}\n`);
  return { ok: true };
});

ipcMain.handle('yana:pty-stop', () => stopPty());

ipcMain.handle('yana:list-dir',   (event, relPath) => listDir(relPath));

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
      if (response === 0) {
        autoUpdater.downloadUpdate().catch(err =>
          console.error('[autoUpdater] download failed:', err.message));
      }
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

app.whenReady().then(async () => {
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
