const { contextBridge, ipcRenderer, webUtils } = require("electron");
const methods = [
  "bootstrap",
  "dataOverview",
  "tokenUsage",
  "exportPortableData",
  "choosePortableData",
  "systemOverview",
  "accountCreateLocal",
  "accountUseGoogle",
  "accountUnlock",
  "accountLock",
  "accountLogout",
  "integrationList",
  "integrationConfigureGithub",
  "integrationConnect",
  "integrationCancel",
  "integrationDisconnect",
  "integrationRevoke",
  "openProject",
  "recentProject",
  "listFiles",
  "searchFiles",
  "readFile",
  "readFileWindow",
  "saveFile",
  "gitStatus",
  "gitDiff",
  "terminalCreate",
  "terminalSubscribe",
  "terminalWrite",
  "terminalResize",
  "terminalAck",
  "terminalClose",
  "saveLayout",
  "savePreferences",
  "saveProfile",
  "clearProviderKey",
  "discoverModels",
  "inspectLocalModels",
  "chooseRuntime",
  "newChat",
  "sendChat",
  "stopChat",
  "decideApproval",
  "taskList",
  "taskCreate",
  "taskDone",
  "taskDrop",
  "taskDepend",
  "hostStatus",
  "leaseList",
  "leaseRevoke",
  "leaseGrant",
  "pendingApprovals",
  "projectMemoryRead",
  "projectMemoryWrite",
  "runCommandList",
  "runCommandCreate",
  "runCommandRemove",
];
const bridge = Object.fromEntries(
  methods.map((method) => [
    method,
    (...args) => ipcRenderer.invoke(`studio:${method}`, ...args),
  ]),
);
bridge.importPortableData = (file) =>
  ipcRenderer.invoke(
    "studio:importPortableData",
    webUtils.getPathForFile(file),
  );
// webUtils.getPathForFile only resolves a real path for a File that came
// from an actual OS drag (Finder/Explorer) — must run here in preload, on
// the original File, before it crosses the IPC boundary.
bridge.openDroppedPath = (currentRoot, file) =>
  ipcRenderer.invoke(
    "studio:openDroppedPath",
    currentRoot,
    webUtils.getPathForFile(file),
  );
// Same studio:openDroppedPath host handler as above — this caller already
// has a plain path string (parsed from terminal output text), not a
// dragged File, so there's nothing for webUtils to extract.
bridge.openFilePath = (currentRoot, path) =>
  ipcRenderer.invoke("studio:openDroppedPath", currentRoot, path);
bridge.on = (channel, callback) => {
  if (
    ![
      "terminal:data",
      "terminal:exit",
      "chat:update",
      "host:notice",
      "integrations:update",
    ].includes(channel)
  )
    throw new Error("Unknown event");
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("studio", Object.freeze(bridge));
