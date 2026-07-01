'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yana', {
  getVersion:   () => ipcRenderer.invoke('yana:version'),
  getServerUrl: () => ipcRenderer.invoke('yana:server-url'),
});
