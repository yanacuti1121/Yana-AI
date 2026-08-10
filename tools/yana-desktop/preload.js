'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yana', {
  getVersion:      () => ipcRenderer.invoke('yana:version'),
  getServerUrl:    () => ipcRenderer.invoke('yana:server-url'),
  getAuthFilePath: () => ipcRenderer.invoke('yana:auth-file-path'),
  revealAuthFile:  () => ipcRenderer.invoke('yana:reveal-auth-file'),

  ptyStart:  (opts) => ipcRenderer.invoke('yana:pty-start', opts),
  ptyWrite:  (data) => ipcRenderer.invoke('yana:pty-write', data),
  ptyResize: (opts) => ipcRenderer.invoke('yana:pty-resize', opts),
  ptyStop:   ()     => ipcRenderer.invoke('yana:pty-stop'),
  listDir:  (relPath) => ipcRenderer.invoke('yana:list-dir', relPath),
  // The app's first push-style (main -> renderer) listeners — every other
  // method above is request/response `invoke`, which can't fit unsolicited
  // streaming PTY output. Both return an unsubscribe function so a React
  // component can clean up in a `useEffect` return; without it, listeners
  // would accumulate across every visit to the Terminal page.
  onPtyData: (cb) => {
    const handler = (_event, chunk) => cb(chunk);
    ipcRenderer.on('yana:pty-data', handler);
    return () => ipcRenderer.removeListener('yana:pty-data', handler);
  },
  onPtyExit: (cb) => {
    const handler = (_event, code) => cb(code);
    ipcRenderer.on('yana:pty-exit', handler);
    return () => ipcRenderer.removeListener('yana:pty-exit', handler);
  },
});
