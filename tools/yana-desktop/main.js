// Yana AI — Electron desktop shell
// Spawns the yana-web Node server as a child process, then loads it in a BrowserWindow.
'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = parseInt(process.env.PORT || '8081', 10);
const SERVER_ENTRY = path.join(__dirname, '..', 'yana-web', 'server.js');

let serverProc = null;
let mainWindow = null;
let tray = null;

/* ---------- Server lifecycle ---------- */

function startServer() {
  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(d));
  serverProc.stderr.on('data', (d) => process.stderr.write(d));
  serverProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('[yana-desktop] server exited with code', code);
    }
  });
}

function waitForServer(attemptsLeft, callback) {
  http.get('http://127.0.0.1:' + PORT + '/api/status', (res) => {
    res.resume();
    callback(null);
  }).on('error', () => {
    if (attemptsLeft <= 0) {
      callback(new Error('Yana server did not start in time'));
      return;
    }
    setTimeout(() => waitForServer(attemptsLeft - 1, callback), 400);
  });
}

/* ---------- Window ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Yana AI',
    backgroundColor: '#f6faf7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL('http://127.0.0.1:' + PORT);

  // Open external links in the OS browser, not inside the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ---------- Tray ---------- */

function createTray() {
  // Empty icon — replace with a real .png path for a visible tray icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Yana AI');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Yana',
      click: () => { mainWindow ? mainWindow.focus() : createWindow(); },
    },
    {
      label: 'Open in browser',
      click: () => shell.openExternal('http://127.0.0.1:' + PORT),
    },
    { type: 'separator' },
    { label: 'Quit Yana', click: () => app.quit() },
  ]));
  tray.on('double-click', () => { mainWindow ? mainWindow.focus() : createWindow(); });
}

/* ---------- App lifecycle ---------- */

app.whenReady().then(() => {
  startServer();
  waitForServer(30, (err) => {
    if (err) {
      console.error('[yana-desktop]', err.message);
      app.quit();
      return;
    }
    createWindow();
    createTray();
  });
});

// Keep alive in tray when all windows are closed (macOS convention + useful on all platforms)
app.on('window-all-closed', () => {
  // intentionally no-op — tray keeps the app alive
});

app.on('activate', () => {
  // macOS dock click when no window open
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});
