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
const { terminateChild } = require('./process-lifecycle');
const {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyStartOptions,
} = require('./security');

let mainWindow    = null;
let serverProcess = null;
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

// ── Embedded terminal (yana-rt chat via a PTY) ──────────────────────────────────
// `pty_bridge` (this repo's Cargo project, `pty-bridge` feature) is a small,
// generic Rust binary — opens a real pseudo-terminal, spawns whatever argv
// it's given inside it, then shuttles raw bytes over its own stdin/stdout.
// No native Node module (node-pty) needed: this is a plain child process,
// same integration shape `startServer()` already uses for `server.js`.

function ptyBridgeBinary() {
  return runtimePath('pty_bridge');
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
  const { cols, rows, args } = normalized;

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

  const childArgv = [yanaRtBin, 'chat', ...(args || [])];
  const child = spawn(bridgeBin, [String(cols), String(rows), '--', ...childArgv], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      YANA_RT_BIN: yanaRtBin,
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

  return { ok: true };
});

handleTrusted('yana:pty-write', (event, data) => {
  ptyProcess?.stdin.write(normalizePtyInput(data));
});

handleTrusted('yana:pty-stop', () => stopPty());

handleTrusted('yana:list-dir', (event, relPath) => {
  if (typeof relPath !== 'string' || relPath.length > 4096 || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a NUL-free string up to 4096 characters' };
  }
  return listDir(relPath);
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
    shutdownTask = Promise.all([stopServer(), stopPty()]);
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
