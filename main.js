'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const { fork } = require('child_process');
const http  = require('http');

const PORT       = 8081;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let mainWindow    = null;
let serverProcess = null;

// ── Server ────────────────────────────────────────────────────────────────────

function serverScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'server.js')
    : path.join(__dirname, '..', 'tools', 'yana-web', 'server.js');
}

function startServer() {
  const script = serverScript();
  serverProcess = fork(script, [], {
    env: {
      ...process.env,
      PORT:          String(PORT),
      HOST:          '127.0.0.1',
      NODE_ENV:      'production',
      // User data dir survives app updates
      YANA_DATA_DIR: path.join(app.getPath('userData'), '.yana'),
      // Repo root: bundled Resources/ when packaged, local repo when dev
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

// Poll /health until ready (max 30 s)
function waitForServer() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const MAX  = 60;   // 60 × 500 ms = 30 s
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
    minWidth: 900,
    minHeight: 600,
    title:    'Yana AI',
    show:     false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Show only after the page is ready — no white flash
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in the default browser, not inside the app
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

  // macOS: re-open window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => stopServer());
