const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  Menu,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { resolveDroppedCandidate } = require("./dropped-path.cjs");
const { Projects } = require("./projects.cjs");
const { Store, isValidLiquidGlass } = require("./store.cjs");
const { DataOverview } = require("./data-overview.cjs");
const { Terminals } = require("./terminals.cjs");
const { Tasks } = require("./tasks.cjs");
const { hostStatus } = require("./devices.cjs");
const { Permissions } = require("./permissions.cjs");
const { ProjectMemory } = require("./project-memory.cjs");
const {
  composeTurnSystem,
  ContinuityEngine,
} = require("./continuity-engine.cjs");
const { RunCommands } = require("./run-commands.cjs");
const { DiffComments } = require("./diff-comments.cjs");
const { scanProjectTokens } = require("./design-tokens.cjs");
const {
  buildCanvasPrompt,
  parseCanvasProposal,
  validateCanvasDocument,
} = require("./canvas-ai.cjs");
const { profileInput, discover, startRuntime } = require("./runtime.cjs");
const { inspectLocalModels } = require("./local-models.cjs");
const { publicCatalog, providerById } = require("./model-catalog.cjs");
const { ModelCredentialStore } = require("./model-credentials.cjs");
const {
  AUXILIARY_FLOWS,
  isValidMoAConfig,
  isValidTitleModelConfig,
  resolveAutoProfile,
} = require("./model-orchestration.cjs");
const { runPreset: runMoAPreset } = require("./mixture-of-agents.cjs");
const { runMoATurn, generateTitle } = require("./chat-turns.cjs");
const { SecureTokenStore } = require("./integrations/store.cjs");
const { IntegrationManager } = require("./integrations/manager.cjs");
const { systemOverview } = require("./system-surfaces.cjs");
const { AccountStore } = require("./account.cjs");
const { readBackup, writeBackup } = require("./portable-data.cjs");
const {
  appendUsageRecords,
  recordsForChat,
  summarizeTokenUsage,
} = require("./token-usage.cjs");

app.setName("Yana Studio");
app.setPath(
  "userData",
  process.env.YANA_STUDIO_TEST_DATA ||
    path.join(app.getPath("appData"), "Yana Studio"),
);
let window;
let terminals;
let store;
let integrations;
let dataOverview;
let modelCredentials;
let accounts;
let continuity;
let quitting = false;
let shutdownStarted = false;
let shutdownComplete = false;
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
const projects = new Projects();
const runs = new Map();
const tasks = new Tasks(() => store.value.runtime);
const permissions = new Permissions(() => store.value.runtime);
const projectMemory = new ProjectMemory();
const runCommands = new RunCommands();
const diffComments = new DiffComments();
const entry = pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
const emit = (channel, value) => {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
};
function continuityWarning(error) {
  const warning = `Continuity unavailable: ${error.message}`;
  if (!String(store.warning || "").includes(warning))
    store.warning = [store.warning, warning].filter(Boolean).join(" ");
}
function syncContinuity(chat, observe) {
  try {
    continuity?.syncConversation(chat, observe);
  } catch (error) {
    continuityWarning(error);
  }
}

function credentialAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}
function key(provider = store?.value.profile.provider) {
  if (modelCredentials) {
    try {
      return modelCredentials.read(provider);
    } catch {
      return "";
    }
  }
  try {
    return provider === store.value.profile.provider &&
      store.value.encryptedKey &&
      credentialAvailable()
      ? safeStorage.decryptString(
          Buffer.from(store.value.encryptedKey, "base64"),
        )
      : "";
  } catch {
    return "";
  }
}
function publicState() {
  const { encryptedKey, ...state } = store.value;
  const account = accounts?.status() || {
    configured: false,
    locked: false,
    mode: "none",
    email: "",
    displayName: "",
  };
  const visibleState = account.locked
    ? {
        ...state,
        projects: [],
        chats: [],
        runtime: "",
        profile: { provider: "ollama", model: "", baseUrl: "" },
      }
    : state;
  const configuredProviders = account.locked
    ? []
    : modelCredentials?.configured() || [];
  return {
    ...visibleState,
    providerCatalog: publicCatalog(),
    configuredProviders,
    auxiliaryFlows: AUXILIARY_FLOWS,
    hasKey: configuredProviders.includes(visibleState.profile.provider),
    credentialStorage: credentialAvailable() ? "OS encrypted" : "session only",
    warning: store.warning,
    version: app.getVersion(),
    platform: `${os.platform()} · ${os.arch()}`,
    account,
  };
}
function register(name, action, options = {}) {
  ipcMain.handle(`studio:${name}`, async (event, ...args) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url.split("#")[0] !== entry
    )
      throw new Error("Untrusted IPC caller");
    if (accounts?.status().locked && !options.allowLocked)
      throw new Error("Yana Studio is locked");
    try {
      return await action(...args);
    } catch (error) {
      console.error(`[ipc] studio:${name} failed:`, error);
      throw error;
    }
  });
}
function remember(root) {
  const project = projects.register(root);
  store.save({
    projects: [
      project,
      ...store.value.projects.filter((item) => item.root !== root),
    ].slice(0, 20),
  });
  return project;
}
// A path dropped from the OS (Finder/Explorer) via webUtils.getPathForFile —
// exactly as trustworthy as openProject()'s dialog result, since only a real
// native drag can populate that path, not renderer script. A dropped folder
// is opened as a project (same remember() openProject already uses); a
// dropped file that's inside the currently open project is returned as a
// relative path to open in the editor; a dropped file elsewhere opens its
// containing folder as a new project.
//
// Also the shared handler behind studio:openFilePath (preload.cjs), used
// for Terminal.tsx's clickable file:line links -- that caller passes a
// plain string parsed from terminal text, not a real OS drag, and it was
// broken two ways: (1) Terminal's FILE_LINK regex intentionally captures
// an optional trailing :line or :line:col suffix for its own display
// purposes, but nothing stripped it before this function's fs calls, so
// EVERY such click failed realpathSync on a path no real file has; (2) a
// relative candidate went straight into fs.realpathSync(candidate),
// which resolves relative paths against this process's own cwd, not the
// project root the user is actually looking at -- reported live as
// `ENOENT ... lstat '/.github'` from a relative candidate that should
// have resolved inside the open project.
function openDroppedPath(currentRoot, candidate) {
  const absoluteCandidate = resolveDroppedCandidate(currentRoot, candidate);
  const resolved = fs.realpathSync(absoluteCandidate);
  if (fs.statSync(resolved).isDirectory())
    return { kind: "project", project: remember(resolved) };
  if (currentRoot) {
    const relative = path.relative(currentRoot, resolved);
    const inside =
      relative &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (inside) {
      try {
        return {
          kind: "file",
          relative: projects.resolve(currentRoot, relative) && relative,
        };
      } catch {
        // Falls through to opening the file's own directory as a project —
        // e.g. it's inside a credential/internal path resolve() excludes.
      }
    }
  }
  const project = remember(path.dirname(resolved));
  return {
    kind: "file",
    relative: path.relative(project.root, resolved),
    project,
  };
}
function chatById(id) {
  const chat = store.value.chats.find((item) => item.id === id);
  if (!chat) throw new Error("Unknown conversation");
  return chat;
}
function updateChat(chat) {
  try {
    store.save({
      chats: store.value.chats.map((item) =>
        item.id === chat.id ? chat : item,
      ),
    });
  } catch (error) {
    chat.error = `Cannot persist conversation: ${error.message}. Keep this window open to copy your messages.`;
  }
  syncContinuity(chat, true);
  emit("chat:update", chat);
}
// profileInput() (host/runtime.cjs) only checks that a "mixture-of-agents"
// profile's `model` is a non-empty string -- it has no store access to
// confirm that string actually names a real, enabled preset. This is the
// deeper check, shared by saveProfile and sendChat (both places a
// "mixture-of-agents" profile can arrive from).
function requireEnabledMoAPreset(presetId) {
  const preset = store.value.mixtureOfAgents.presets.find(
    (entry) => entry.id === presetId,
  );
  if (!preset || !preset.enabled)
    throw new Error("Preset Mixture of Agents không tồn tại hoặc đã tắt");
  return preset;
}
// Shared by launchTurn's close handler and the Mixture of Agents chat path
// below -- generateTitle (host/chat-turns.cjs) is a real model call, not
// part of the Rust runtime's own protocol, so it needs the same
// binary/credential/spawn wiring startRuntime itself uses.
function maybeGenerateTitle(chat, effectiveMainProfile) {
  generateTitle(chat, store.value.titleModel, {
    binary: store.value.runtime,
    root: chat.root,
    credentialFor: (provider) => key(provider),
    effectiveMainProfile,
    onUpdate: (updated) => updateChat(updated),
  });
}
function launchTurn(chat, profile, input, resume = false) {
  if (runs.has(chat.id)) throw new Error("Conversation already running");
  projects.resolve(chat.root);
  // "Auto" is a Studio-only sentinel yana-rt doesn't understand -- resolve
  // it to a concrete, ready provider+model right before this turn runs.
  // chat.profile is set to the RESOLVED profile (not "auto") so the chat's
  // history is honest about which model actually answered; the app-wide
  // default in Settings can stay "auto" and gets re-resolved on every turn.
  if (profile.provider === "auto")
    profile = resolveAutoProfile(modelCredentials?.configured() || []);
  chat.running = true;
  chat.error = "";
  chat.profile = profile;
  const previousUsage = recordsForChat(chat);
  const currentUsage = [];
  updateChat(chat);
  let delivery;
  // Set only by a real `type: "error"` event (a provider/runtime failure),
  // not by cancellation or authority denial — those already have their own
  // clear chat.error text and aren't "the provider returned nothing".
  let runtimeErrorMessage = "";
  const flush = () => {
    clearTimeout(delivery);
    delivery = undefined;
    emit("chat:update", chat);
  };
  const run = startRuntime(
    store.value.runtime,
    chat.root,
    profile,
    input,
    (event) => {
      const reply = chat.messages.at(-1);
      if (event.type === "text_delta")
        reply.content = (reply.content + (event.text || "")).slice(0, 500000);
      if (event.type === "completed") {
        reply.content = (event.message || reply.content).slice(0, 500000);
        chat.approval = null;
      }
      if (event.type === "error") {
        chat.error = event.message;
        runtimeErrorMessage = event.message;
      }
      if (event.type === "cancelled")
        chat.error = "Đã dừng theo yêu cầu. Nội dung nhận được được giữ lại.";
      if (event.type === "authority_denied")
        chat.error = `${event.authority}: ${event.reason}`;
      if (event.type === "awaiting_approval") chat.approval = event;
      if (event.type === "metrics") {
        chat.usage = { input: event.input_tokens, output: event.output_tokens };
        currentUsage.push({
          ...chat.usage,
          provider: profile.provider,
          model: profile.model,
          recordedAt: new Date().toISOString(),
        });
      }
      if (event.type === "runtime_event")
        chat.events = [
          ...chat.events,
          { ...event, time: new Date().toISOString() },
        ].slice(-200);
      if (!delivery) delivery = setTimeout(flush, 40);
    },
    (exitCode) => {
      chat.running = false;
      // A failed turn that never streamed any content otherwise renders as
      // an empty assistant bubble captioned "Chưa có nội dung trả về." —
      // indistinguishable from "the model genuinely said nothing" even
      // though a real, specific reason (bad key, rate limit, malformed
      // response, ...) is sitting right there in runtimeErrorMessage. Only
      // fires when reply.content is still empty: a turn that streamed
      // partial content before failing keeps that content, and relies on
      // the existing chat.error banner to flag the failure — an error
      // card here would silently discard real output.
      const reply = chat.messages.at(-1);
      if (runtimeErrorMessage && reply && !reply.content) {
        reply.errorDetail = {
          provider: profile.provider,
          model: profile.model,
          reason: runtimeErrorMessage,
          exitCode: typeof exitCode === "number" ? exitCode : null,
        };
      }
      if (currentUsage.length)
        chat.usageHistory = appendUsageRecords(previousUsage, currentUsage);
      runs.delete(chat.id);
      flush();
      updateChat(chat);
      maybeGenerateTitle(chat, profile);
    },
    resume,
  );
  runs.set(chat.id, run);
}

app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  try {
    continuity = new ContinuityEngine(app.getPath("userData"));
    continuity.importLegacy(store.value.chats);
  } catch (error) {
    continuity = null;
    store.warning = [store.warning, `Continuity unavailable: ${error.message}`]
      .filter(Boolean)
      .join(" ");
  }
  accounts = new AccountStore(path.join(app.getPath("userData"), "account-v1"));
  dataOverview = new DataOverview(app.getPath("userData"));
  modelCredentials = new ModelCredentialStore(
    path.join(app.getPath("userData"), "model-credentials-v1"),
    safeStorage,
  );
  if (store.value.encryptedKey && credentialAvailable()) {
    try {
      const legacy = safeStorage.decryptString(
        Buffer.from(store.value.encryptedKey, "base64"),
      );
      if (legacy) modelCredentials.write(store.value.profile.provider, legacy);
      store.save({ encryptedKey: "" });
    } catch {
      store.warning = [
        store.warning,
        "Legacy model credential could not be migrated; enter it again.",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
  integrations = new IntegrationManager({
    store: new SecureTokenStore(
      path.join(app.getPath("userData"), "oauth-v1"),
      safeStorage,
    ),
    browser: async (value) => {
      const url = new URL(value);
      if (!(
        (url.origin === "https://accounts.google.com" &&
          url.pathname === "/o/oauth2/v2/auth") ||
        url.href === "https://github.com/login/device"
      ))
        throw new Error("untrusted_authorization_url");
      await shell.openExternal(url.href);
    },
    changed: () => emit("integrations:update", integrations.list()),
  });
  register("integrationList", () => integrations.list());
  register(
    "openGithubOAuthHelp",
    async () => shell.openExternal("https://github.com/settings/developers"),
    { allowLocked: true },
  );
  register(
    "openGoogleOAuthHelp",
    async () =>
      shell.openExternal("https://console.cloud.google.com/auth/audience"),
    { allowLocked: true },
  );
  register("integrationConfigureGithub", (clientId) =>
    integrations.configureGithub(clientId),
  );
  register("integrationConnect", (key) => integrations.connect(key));
  register("integrationCancel", (key) => integrations.cancel(key));
  register("integrationDisconnect", (key) => integrations.disconnect(key));
  register("integrationRevoke", async (key) => {
    integrations.definition(key);
    const answer = await dialog.showMessageBox(window, {
      message: "Thu hồi quyền tại nhà cung cấp?",
      detail:
        "Google có thể thu hồi cả Gmail và đăng nhập thuộc cùng OAuth project. Các kết nối cùng provider trong Studio sẽ bị ngắt. Hành động này không xóa email hay file.",
      buttons: ["Hủy", "Thu hồi"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) return integrations.list();
    return integrations.revoke(key);
  });
  for (const chat of store.value.chats) {
    if (chat.running) {
      chat.running = false;
      chat.error = "Previous generation was interrupted when the app closed.";
    }
  }
  for (const project of store.value.projects) {
    try {
      projects.register(project.root);
      continuity?.importProjectMemory(
        project.root,
        projectMemory.read(project.root),
      );
    } catch {}
  }
  const projectArgument = process.argv.indexOf("--project");
  if (projectArgument !== -1 && process.argv[projectArgument + 1]) {
    try {
      remember(process.argv[projectArgument + 1]);
    } catch (error) {
      store.warning = `Cannot open requested project: ${error.message}`;
    }
  }
  const bundled = path.join(
    __dirname,
    "../runtime",
    process.platform === "win32" ? "yana-rt.exe" : "yana-rt",
  );
  if (!store.value.runtime && fs.existsSync(bundled))
    store.save({ runtime: bundled });
  const pty = require("node-pty");
  terminals = new Terminals(pty.spawn, emit);
  register("bootstrap", publicState, { allowLocked: true });
  register(
    "accountUseGoogle",
    () => {
      const connection = integrations
        .list()
        .find((item) => item.key === "google:identity");
      accounts.useGoogle(connection);
      return publicState();
    },
    { allowLocked: true },
  );
  register(
    "accountUseGithub",
    () => {
      const connection = integrations
        .list()
        .find((item) => item.key === "github:account");
      accounts.useGithub(connection);
      return publicState();
    },
    { allowLocked: true },
  );
  register(
    "accountUnlock",
    (password) => {
      accounts.unlock(password);
      return publicState();
    },
    { allowLocked: true },
  );
  register("accountLock", () => {
    accounts.lock();
    return publicState();
  });
  register("accountLogout", () => {
    accounts.logout();
    store.save({ onboardingCompleted: false });
    return publicState();
  });
  register("dataOverview", () => dataOverview.inspect());
  register("tokenUsage", (projectRoot = "") => {
    if (projectRoot) projects.resolve(projectRoot);
    return summarizeTokenUsage(store.value.chats, projectRoot);
  });
  register("exportPortableData", async () => {
    const result = await dialog.showSaveDialog(window, {
      title: "Export Yana Studio data",
      defaultPath: `yana-studio-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "Yana Studio backup", extensions: ["json"] }],
    });
    return result.canceled ? null : writeBackup(result.filePath, store.value);
  });
  const importPortableData = async (file) => {
    if (runs.size) throw new Error("Stop running chats before restoring data");
    const data = readBackup(fs.realpathSync(file));
    const answer = await dialog.showMessageBox(window, {
      type: "warning",
      message: "Restore this Yana Studio backup?",
      detail:
        "Current projects, conversations and UI preferences will be replaced. Credentials and the local account stay on this device.",
      buttons: ["Cancel", "Restore"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) return publicState();
    store.save({ ...data, runtime: store.value.runtime, encryptedKey: "" });
    for (const project of data.projects) {
      try {
        projects.register(project.root);
      } catch {}
    }
    return publicState();
  };
  register("choosePortableData", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Restore Yana Studio data",
      properties: ["openFile"],
      filters: [{ name: "Yana Studio backup", extensions: ["json"] }],
    });
    return result.canceled
      ? publicState()
      : importPortableData(result.filePaths[0]);
  });
  register("importPortableData", importPortableData);
  register("systemOverview", (projectRoot) => {
    if (projectRoot) projects.resolve(projectRoot);
    return systemOverview({
      runtime: store.value.runtime,
      projectRoot,
      resourcesPath: process.resourcesPath,
    });
  });
  register("openProject", async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      title: "Open project in Yana Studio",
    });
    return result.canceled ? null : remember(result.filePaths[0]);
  });
  register("openDroppedPath", (currentRoot, candidate) =>
    openDroppedPath(currentRoot, candidate),
  );
  register("recentProject", (root) => {
    if (!store.value.projects.some((item) => item.root === root))
      throw new Error("Use Open project to authorize a new folder");
    return remember(root);
  });
  register("listFiles", (root, relative, options) =>
    projects.list(root, relative, options),
  );
  register("searchFiles", (root, query, limit) =>
    projects.search(root, query, limit),
  );
  register("readFile", (root, relative) => projects.read(root, relative));
  register("readFileWindow", (root, relative, offset) =>
    projects.readWindow(root, relative, offset),
  );
  register("saveFile", (root, relative, text, revision) =>
    projects.write(root, relative, text, revision),
  );
  register("gitStatus", (root) => projects.status(root));
  register("gitDiff", (root, relative) => projects.diff(root, relative));
  register("taskList", (root) => {
    projects.resolve(root);
    return tasks.list(root);
  });
  register("taskCreate", (root, name, scope) => {
    projects.resolve(root);
    return tasks.create(root, name, scope);
  });
  register("taskDone", (root, id, evidence) => {
    projects.resolve(root);
    return tasks.done(root, id, evidence);
  });
  register("taskDrop", (root, id) => {
    projects.resolve(root);
    return tasks.drop(root, id);
  });
  register("taskDepend", (root, id, on, type) => {
    projects.resolve(root);
    return tasks.depend(root, id, on, type);
  });
  register("hostStatus", () => hostStatus(store.value.runtime));
  register("leaseList", (root) => {
    projects.resolve(root);
    return permissions.leaseList(root);
  });
  register("leaseRevoke", (root, id) => {
    projects.resolve(root);
    return permissions.leaseRevoke(root, id);
  });
  register("leaseGrant", (root, options) => {
    projects.resolve(root);
    return permissions.leaseGrant(root, options);
  });
  register("pendingApprovals", (root) => {
    projects.resolve(root);
    return permissions.pendingApprovals(root);
  });
  register("projectMemoryRead", (root) => {
    projects.resolve(root);
    return projectMemory.read(root);
  });
  register("projectMemoryWrite", (root, text) => {
    projects.resolve(root);
    const saved = projectMemory.write(root, text);
    try {
      continuity?.importProjectMemory(root, saved);
    } catch (error) {
      continuityWarning(error);
    }
    return saved;
  });
  register("continuityOverview", (root) => {
    projects.resolve(root);
    if (!continuity) return { status: "unavailable", sharingEnabled: false };
    return continuity.overview(root);
  });
  register("continuitySetSharing", (root, enabled) => {
    projects.resolve(root);
    if (!continuity) throw new Error("Continuity database is unavailable");
    return continuity.setSharing(root, enabled);
  });
  register("continuityRetrieve", (root, query, conversationId) => {
    projects.resolve(root);
    if (!continuity) return { status: "unavailable", sources: [] };
    if (typeof query !== "string" || query.length > 40000)
      throw new Error("Invalid continuity query");
    return continuity.retrieve(root, query, conversationId);
  });
  register("runCommandList", (root) => {
    projects.resolve(root);
    return runCommands.list(root);
  });
  register("runCommandCreate", (root, entry) => {
    projects.resolve(root);
    return runCommands.create(root, entry);
  });
  register("runCommandRemove", (root, id) => {
    projects.resolve(root);
    return runCommands.remove(root, id);
  });
  register("diffCommentList", (root, file) => {
    projects.resolve(root);
    return diffComments.list(root, file);
  });
  register("diffCommentCreate", (root, file, entry) => {
    projects.resolve(root);
    return diffComments.create(root, file, entry);
  });
  register("diffCommentRemove", (root, file, id) => {
    projects.resolve(root);
    return diffComments.remove(root, file, id);
  });
  register("designCanvasLoad", (root) => {
    projects.resolve(root);
    return store.value.designs[root] || null;
  });
  register("designCanvasSave", (root, document) => {
    projects.resolve(root);
    store.save({
      designs: { ...store.value.designs, [root]: document },
    });
    return store.value.designs[root];
  });
  register("designCanvasSuggest", (root, document, instruction, selection) => {
    projects.resolve(root);
    validateCanvasDocument(document);
    if (!store.value.runtime)
      throw new Error("Configure the Yana runtime before using Canvas AI");
    if (!store.value.profile.model)
      throw new Error("Choose a model before using Canvas AI");
    const task = buildCanvasPrompt(document, instruction, selection);
    const profile = store.value.profile;
    const canvasRoot = path.join(app.getPath("userData"), "canvas-ai-sandbox");
    fs.mkdirSync(canvasRoot, { recursive: true, mode: 0o700 });
    return new Promise((resolve, reject) => {
      let response = "";
      let completed = false;
      let runtimeError = "";
      let controller;
      try {
        controller = startRuntime(
          store.value.runtime,
          canvasRoot,
          profile,
          {
            task,
            session_id: `canvas-ai-${crypto.randomUUID()}`,
            api_key: key(profile.provider),
            system:
              "Return only the requested structured Canvas JSON. Never call tools, access files, run commands, or use the network except for the selected model provider.",
            ...(profile.provider === "custom"
              ? {
                  base_url: profile.baseUrl,
                  custom_keyless: !key(profile.provider),
                }
              : {}),
          },
          (event) => {
            if (event.type === "text_delta")
              response = (response + (event.text || "")).slice(0, 200000);
            if (event.type === "completed") {
              response = (event.message || response).slice(0, 200000);
              completed = true;
            }
            if (event.type === "error") runtimeError = event.message;
            if (event.type === "authority_denied")
              runtimeError = `${event.authority}: ${event.reason}`;
            if (event.type === "awaiting_approval") {
              runtimeError =
                "Canvas AI attempted to use a tool, so Yana stopped the proposal";
              controller?.stop();
            }
          },
          () => {
            if (runtimeError) {
              reject(new Error(runtimeError));
              return;
            }
            if (!completed) {
              reject(
                new Error("Canvas AI stopped before returning a proposal"),
              );
              return;
            }
            try {
              resolve(parseCanvasProposal(response, document));
            } catch (error) {
              reject(error);
            }
          },
        );
      } catch (error) {
        reject(error);
      }
    });
  });
  register("scanDesignTokens", (root) => {
    projects.resolve(root);
    return scanProjectTokens(root);
  });
  register("terminalCreate", (root) => {
    projects.resolve(root);
    return terminals.create(root);
  });
  register("terminalSubscribe", (id) => terminals.subscribe(id));
  register("terminalWrite", (id, text) => terminals.write(id, text));
  register("terminalResize", (id, cols, rows) =>
    terminals.resize(id, cols, rows),
  );
  register("terminalAck", (id, sequence) =>
    terminals.acknowledge(id, sequence),
  );
  register("terminalClose", async (id) => {
    const result = await dialog.showMessageBox(window, {
      type: "question",
      message: "Close this terminal and stop its process?",
      buttons: ["Keep terminal", "Close terminal"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response !== 1) return false;
    terminals.close(id);
    return true;
  });
  register("saveLayout", (layout) => {
    const next = { sidebar: 250, inspector: 330, dock: 280 };
    for (const [name, low, high] of [
      ["sidebar", 190, 340],
      ["inspector", 260, 480],
      ["dock", 150, 700],
    ]) {
      if (!Number.isFinite(layout[name])) throw new Error("Invalid layout");
      next[name] = Math.max(low, Math.min(high, layout[name]));
    }
    store.save({ layout: next });
    return next;
  });
  register("savePreferences", (preferences) => {
    if (
      !preferences ||
      !["vi", "ko", "en"].includes(preferences.locale) ||
      !["light", "dark"].includes(preferences.theme) ||
      !Number.isSafeInteger(preferences.glassOpacity) ||
      preferences.glassOpacity < 0 ||
      preferences.glassOpacity > 100 ||
      !Number.isSafeInteger(preferences.glassBlur) ||
      preferences.glassBlur < 0 ||
      preferences.glassBlur > 32 ||
      !isValidLiquidGlass(preferences.liquidGlass)
    )
      throw new Error("Invalid interface preferences");
    store.save({
      preferences: {
        locale: preferences.locale,
        theme: preferences.theme,
        glassOpacity: preferences.glassOpacity,
        glassBlur: preferences.glassBlur,
        liquidGlass: { ...preferences.liquidGlass },
      },
    });
    return publicState();
  });
  register("completeOnboarding", () => {
    store.save({ onboardingCompleted: true });
    return publicState();
  });
  register("saveProfile", async (value, apiKey) => {
    if (runs.size)
      throw new Error("Stop running chats before changing provider");
    const profile = profileInput(value);
    if (typeof apiKey !== "string" || apiKey.length > 16000)
      throw new Error("Invalid API key");
    if (profile.provider === "auto") {
      store.save({ profile, encryptedKey: "" });
      return publicState();
    }
    if (profile.provider === "mixture-of-agents") {
      requireEnabledMoAPreset(profile.model);
      store.save({ profile, encryptedKey: "" });
      return publicState();
    }
    const provider = providerById(profile.provider);
    const credential = apiKey || key(profile.provider);
    if (provider.kind === "cloud") {
      const available = await discover(profile, credential);
      if (!available.includes(profile.model))
        throw new Error(
          `Model '${profile.model}' is not available for this key. Sync models and choose an available model.`,
        );
    }
    if (apiKey) modelCredentials.write(profile.provider, apiKey);
    store.save({ profile, encryptedKey: "" });
    return publicState();
  });
  register("clearProviderKey", (provider) => {
    if (runs.size)
      throw new Error("Stop running chats before removing a provider key");
    providerById(provider);
    modelCredentials.delete(provider);
    return publicState();
  });
  register("discoverModels", (profile, apiKey) => {
    const parsed = profileInput(profile);
    return discover(parsed, apiKey || key(parsed.provider));
  });
  register("inspectLocalModels", () => inspectLocalModels(fetch, key));
  // Read-only preview of what the "Auto" default-model sentinel resolves
  // to right now, using the exact same resolveAutoProfile() the real send
  // path (launchTurn) calls -- so what Settings shows and what a turn
  // actually uses can never drift apart.
  register("previewAutoProfile", () =>
    resolveAutoProfile(modelCredentials?.configured() || []),
  );
  register("saveMixtureOfAgents", (value) => {
    if (!isValidMoAConfig(value))
      throw new Error("Invalid Mixture of Agents configuration");
    store.save({ mixtureOfAgents: value });
    return publicState();
  });
  register("saveTitleModel", (value) => {
    if (!isValidTitleModelConfig(value))
      throw new Error("Invalid title model configuration");
    store.save({ titleModel: value });
    return publicState();
  });
  register("runMixtureOfAgentsPreset", async (presetId, promptText, projectRoot) => {
    if (
      typeof promptText !== "string" ||
      !promptText.trim() ||
      promptText.length > 8000
    )
      throw new Error("Nhập nội dung chạy thử (tối đa 8000 ký tự)");
    const preset = store.value.mixtureOfAgents.presets.find(
      (entry) => entry.id === presetId,
    );
    if (!preset) throw new Error("Preset không tồn tại");
    if (!store.value.runtime)
      throw new Error("Chọn yana-rt binary trong Model & Runtime trước");
    const root =
      typeof projectRoot === "string" && projectRoot
        ? projectRoot
        : app.getPath("home");
    return runMoAPreset(preset, {
      binary: store.value.runtime,
      root,
      promptText: promptText.trim(),
      credentialFor: (provider) => key(provider),
    });
  });
  register("chooseRuntime", async () => {
    if (runs.size) throw new Error("Stop chats before switching runtime");
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      title: "Choose the native yana-rt binary (not a shell wrapper)",
    });
    if (result.canceled) return null;
    const file = fs.realpathSync(result.filePaths[0]);
    if (!fs.statSync(file).isFile() || /\.(js|sh|cmd|bat)$/i.test(file))
      throw new Error("Choose a native runtime binary");
    fs.accessSync(
      file,
      process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
    );
    store.save({ runtime: file });
    return file;
  });
  register("newChat", (root) => {
    projects.resolve(root);
    if (store.value.chats.length >= 100)
      throw new Error("Conversation limit reached (100)");
    const chat = {
      id: crypto.randomUUID(),
      root,
      title: "New conversation",
      messages: [],
      events: [],
      running: false,
      error: "",
      approval: null,
      usageHistory: [],
    };
    store.save({ chats: [...store.value.chats, chat] });
    syncContinuity(chat, false);
    return chat;
  });
  register("removeChat", (id) => {
    const chat = chatById(id);
    if (runs.has(chat.id))
      throw new Error("Stop the running turn before deleting this chat");
    store.save({
      chats: store.value.chats.filter((item) => item.id !== id),
    });
    try {
      continuity?.removeConversation(id);
    } catch (error) {
      continuityWarning(error);
    }
    return true;
  });
  register("sendChat", async (id, task, userInput, profileOverride) => {
    const chat = chatById(id);
    if (runs.has(id) || chat.approval)
      throw new Error("Finish or resolve the current turn first");
    if (typeof task !== "string" || !task.trim() || task.length > 40000)
      throw new Error("Enter a message up to 40,000 characters");
    if (
      userInput !== undefined &&
      (typeof userInput !== "string" ||
        !userInput.trim() ||
        userInput.length > 40000)
    )
      throw new Error("Invalid visible message");
    if (!store.value.runtime)
      throw new Error("Configure the Yana runtime first");
    // A per-chat override (from the composer's own model picker, see
    // ChatModelPicker.tsx) is validated fresh here -- it never went through
    // saveProfile, so store.value.profile's own already-validated state
    // can't be trusted for it. It is used for exactly this one send and is
    // never persisted as the app-wide default.
    const profile = profileOverride
      ? profileInput(profileOverride)
      : store.value.profile;
    if (profile.provider !== "auto" && !profile.model)
      throw new Error("Choose a model in Models & Runtime first");
    if (profile.provider === "mixture-of-agents")
      requireEnabledMoAPreset(profile.model);
    else if (profile.provider !== "auto") {
      const provider = providerById(profile.provider);
      if (
        provider.requiresKey &&
        !(modelCredentials?.configured() || []).includes(provider.id)
      )
        throw new Error(
          `${provider.label} chưa kết nối — thêm API key trong Mô hình & Điều phối trước.`,
        );
    }
    const history = chat.messages
      .slice(-40)
      .map(({ role, content }) => ({ role, content }));
    const memory = projectMemory.read(chat.root);
    let continuityContext;
    try {
      continuity?.importProjectMemory(chat.root, memory);
    } catch (error) {
      continuityWarning(error);
    }
    try {
      if (continuity)
        continuity.syncTasks(chat.root, await tasks.list(chat.root));
    } catch {}
    try {
      continuityContext = continuity?.retrieve(
        chat.root,
        userInput || task,
        chat.id,
      );
    } catch (error) {
      continuityContext = {
        status: "unavailable",
        sources: [],
        error: error.message,
      };
    }
    chat.messages.push(
      { role: "user", content: task, ...(userInput ? { userInput } : {}) },
      { role: "assistant", content: "" },
    );
    // Once a real model-written title exists (chat-turns.cjs's
    // generateTitle, after the first completed turn), stop overwriting it
    // with the truncated-first-message placeholder on every later send.
    if (!chat.titleGenerated)
      chat.title = (
        chat.messages[0].userInput || chat.messages[0].content
      ).slice(0, 45);
    chat.continuity = continuityContext
      ? {
          status: continuityContext.status,
          sharingEnabled: continuity?.sharingEnabled(chat.root) || false,
          runId: continuityContext.runId || "",
          estimatedTokens: continuityContext.estimatedTokens || 0,
          candidateCount: continuityContext.candidateCount || 0,
          sources: continuityContext.sources || [],
          error: continuityContext.error || "",
        }
      : {
          status: "unavailable",
          sharingEnabled: false,
          sources: [],
          error: "Database unavailable",
        };
    // Studio's own durable Project Memory, threaded into every turn via
    // yana-rt's `system` input field — a real top-level parameter kept
    // separate from the message array on purpose (see Role's doc comment
    // in src/model/provider.rs: no System role exists, a stored/imported
    // message can never masquerade as one). Applies uniformly to every
    // provider (local and cloud) since sendChat is the one send path both
    // go through — this is what anh asked for: local AI shouldn't be the
    // one surface without persistent memory.
    const continuitySystem = composeTurnSystem(
      memory,
      continuityContext,
      continuity?.sharingEnabled(chat.root) || false,
    );
    if (profile.provider === "mixture-of-agents") {
      const preset = requireEnabledMoAPreset(profile.model);
      const handle = runMoATurn(chat, preset, task, {
        binary: store.value.runtime,
        root: chat.root,
        credentialFor: (provider) => key(provider),
        onUpdate: (updated) => updateChat(updated),
        onFinish: (finished) => maybeGenerateTitle(finished, preset.aggregator),
      });
      runs.set(chat.id, handle);
    } else {
      launchTurn(chat, profile, {
        task,
        history,
        session_id: chat.id,
        api_key: key(profile.provider),
        ...(continuitySystem ? { system: continuitySystem } : {}),
        ...(profile.provider === "custom"
          ? {
              base_url: profile.baseUrl,
              custom_keyless: !key(profile.provider),
            }
          : {}),
      });
    }
    return true;
  });
  register("stopChat", (id) => {
    runs.get(id)?.stop();
    return true;
  });
  register("decideApproval", (id, decision) => {
    const chat = chatById(id);
    if (typeof decision !== "boolean" || !chat.approval || runs.has(id))
      throw new Error("No pending approval");
    if (chat.profile.provider === "custom")
      throw new Error(
        "This runtime cannot resume custom-provider approvals yet. No tool has been authorized.",
      );
    if (JSON.stringify(chat.profile) !== JSON.stringify(store.value.profile))
      throw new Error(
        "Restore the original provider before resolving approval",
      );
    const approval = chat.approval;
    chat.approval = null;
    launchTurn(
      chat,
      chat.profile,
      {
        approval_id: approval.approval_id,
        decision,
        decided_by: "yana-studio-human",
        api_key: key(chat.profile.provider),
      },
      true,
    );
    return true;
  });
  window = new BrowserWindow({
    title: "Yana Studio · New architecture",
    width: 1500,
    height: 1000,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: "#0b0d12",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on("console-message", (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });
  window.webContents.on("render-process-gone", () => {
    terminals.dispose();
    for (const run of runs.values()) run.stop();
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "Yana Studio", submenu: [{ role: "about" }, { role: "quit" }] },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "togglefullscreen" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
        ],
      },
    ]),
  );
  window.on("close", (event) => {
    if (quitting) return;
    if (terminals.sessions.size || runs.size) {
      event.preventDefault();
      dialog
        .showMessageBox(window, {
          message: "Quit Yana Studio?",
          detail:
            "Terminal processes and AI generations will stop. Saved conversations and project files remain.",
          buttons: ["Stay", "Quit"],
          cancelId: 0,
          defaultId: 0,
        })
        .then((result) => {
          if (result.response === 1) {
            quitting = true;
            app.quit();
          }
        });
    }
  });
  window.loadURL(entry);
});
app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  quitting = true;
  integrations?.dispose();
  terminals?.dispose();
  for (const run of runs.values()) run.stop();
  const deadline = Date.now() + 2500;
  const finish = () => {
    if (store) {
      try {
        store.save({
          chats: store.value.chats.map((chat) => ({ ...chat, running: false })),
        });
      } catch (error) {
        console.error("Workspace shutdown save failed:", error.message);
      }
    }
    try {
      continuity?.close();
    } catch (error) {
      console.error("Continuity shutdown failed:", error.message);
    }
    continuity = null;
    shutdownComplete = true;
    app.quit();
  };
  if (!runs.size && !terminals?.closing.size) finish();
  else {
    const interval = setInterval(() => {
      if ((!runs.size && !terminals?.closing.size) || Date.now() >= deadline) {
        clearInterval(interval);
        finish();
      }
    }, 50);
  }
});
app.on("window-all-closed", () => app.quit());
