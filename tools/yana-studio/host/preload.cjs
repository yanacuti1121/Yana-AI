const { contextBridge, ipcRenderer, webUtils } = require("electron");
const methods = [
  "bootstrap",
  "dataOverview",
  "exportPortableData",
  "choosePortableData",
  "systemOverview",
  "accountCreateLocal",
  "accountUseGoogle",
  "accountUnlock",
  "accountLock",
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
