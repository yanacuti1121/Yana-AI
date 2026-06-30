'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, typed bridge — renderer never gets raw Node/Electron access
contextBridge.exposeInMainWorld('yana', {
  getVersion:   () => ipcRenderer.invoke('yana:version'),
  getServerUrl: () => ipcRenderer.invoke('yana:server-url'),
});
