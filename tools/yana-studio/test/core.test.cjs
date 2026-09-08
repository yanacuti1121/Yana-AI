const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  Projects,
  parseStatus,
  parseWorktrees,
} = require("../host/projects.cjs");
const { Store } = require("../host/store.cjs");
const { DataOverview } = require("../host/data-overview.cjs");
const { Terminals } = require("../host/terminals.cjs");
const { endpoint, profileInput, discover } = require("../host/runtime.cjs");
const {
  adapterFor,
  discoverLocalModels,
  inspectLocalModels,
} = require("../host/local-models.cjs");
const {
  PROVIDERS,
  publicCatalog,
  providerById,
} = require("../host/model-catalog.cjs");
const { ModelCredentialStore } = require("../host/model-credentials.cjs");
const { AccountStore } = require("../host/account.cjs");
const { ProjectMemory } = require("../host/project-memory.cjs");
const {
  createBackup,
  readBackup,
  writeBackup,
} = require("../host/portable-data.cjs");
const http = require("node:http");
const {
  CAPABILITIES,
  parseCommands,
  executable,
  discordStatus,
} = require("../host/system-surfaces.cjs");

test("Studio capability surface stays aligned with Rust registry", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../../src/capability/registry_data.rs"),
    "utf8",
  );
  const names = [
    ...source.matchAll(/CapabilityDescriptor\s*\{\s*name:\s*"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    CAPABILITIES.map(([name]) => name),
    names,
  );
  assert.equal(names.length, 10);
});

test("command reference parser reads real CLI tables", () => {
  const markdown = fs.readFileSync(
    path.join(__dirname, "../../../COMMANDS.md"),
    "utf8",
  );
  const commands = parseCommands(markdown);
  assert.ok(commands.length > 50);
  assert.ok(commands.some((entry) => entry.command === "yana-ai doctor --fix"));
  assert.ok(
    commands.some((entry) =>
      entry.command.includes("--engine all|claude|codex"),
    ),
  );
});

test("external tool detection and Discord status expose no credential", (context) => {
  const root = fixture(context);
  const bin = path.join(
    root,
    process.platform === "win32" ? "codex.exe" : "codex",
  );
  fs.writeFileSync(bin, "stub", { mode: 0o700 });
  assert.equal(executable("codex", { PATH: root, PATHEXT: ".EXE" }), bin);
  const localBin = path.join(root, ".local", "bin");
  fs.mkdirSync(localBin, { recursive: true });
  const claude = path.join(localBin, "claude");
  fs.writeFileSync(claude, "stub", { mode: 0o700 });
  assert.equal(executable("claude", { PATH: "", HOME: root }), claude);
  const status = discordStatus(root, {
    DISCORD_BOT_TOKEN: "never-return-this",
  });
  assert.equal(status.configured, true);
  assert.doesNotMatch(JSON.stringify(status), /never-return-this/);
});

function fixture(context) {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "yana-studio-test-")),
  );
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test("local account stores a verifier and locks after reopening", (context) => {
  const root = fixture(context);
  const account = new AccountStore(root);
  const status = account.createLocal({
    email: "Anh@example.com",
    displayName: "Local User",
    password: "correct horse battery staple",
  });
  assert.equal(status.locked, false);
  const persisted = fs.readFileSync(path.join(root, "account-v1.json"), "utf8");
  assert.doesNotMatch(persisted, /correct horse battery staple/);
  assert.match(persisted, /"verifier"/);
  const reopened = new AccountStore(root);
  assert.equal(reopened.status().locked, true);
  assert.throws(() => reopened.unlock("wrong password"), /Incorrect password/);
  assert.equal(reopened.unlock("correct horse battery staple").locked, false);
});
test("account logout clears the local profile and deletes its file", (context) => {
  const root = fixture(context);
  const account = new AccountStore(root);
  account.createLocal({
    email: "anh@example.com",
    displayName: "Local User",
    password: "correct horse battery staple",
  });
  const file = path.join(root, "account-v1.json");
  assert.ok(fs.existsSync(file));
  const status = account.logout();
  assert.equal(status.configured, false);
  assert.equal(status.locked, false);
  assert.ok(!fs.existsSync(file));
  assert.throws(() => account.logout(), /No account configured/);
});
test("project memory reads empty before first write, persists after, and caps size", (context) => {
  const root = fixture(context);
  const memory = new ProjectMemory();
  const empty = memory.read(root);
  assert.equal(empty.text, "");
  assert.equal(empty.updatedAt, 0);
  const saved = memory.write(root, "# Notes\nAlways use pnpm here.");
  assert.equal(saved.text, "# Notes\nAlways use pnpm here.");
  assert.ok(saved.updatedAt > 0);
  const reread = memory.read(root);
  assert.equal(reread.text, saved.text);
  assert.throws(
    () => memory.write(root, "x".repeat(64 * 1024 + 1)),
    /limited to 64 KiB/,
  );
});
test("portable backup contains only allowlisted local state", (context) => {
  const root = fixture(context);
  const file = path.join(root, "backup.json");
  const state = {
    schema: 1,
    projects: [{ name: "Project", root: "/tmp/project" }],
    chats: [
      {
        id: "chat",
        root: "/tmp/project",
        title: "Hello",
        messages: [{ role: "user", content: "portable" }],
        events: [],
        running: true,
        approval: { approval_id: "secret-approval" },
      },
    ],
    profile: { provider: "openai", model: "model", baseUrl: "" },
    preferences: { locale: "vi" },
    layout: { sidebar: 250, inspector: 330, dock: 280 },
    runtime: "/private/runtime",
    encryptedKey: "secret-key",
    account: { verifier: "secret-password-verifier" },
  };
  const backup = createBackup(state);
  assert.equal(backup.data.chats[0].running, false);
  assert.equal(backup.data.chats[0].approval, null);
  writeBackup(file, state);
  const persisted = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(
    persisted,
    /secret-key|secret-password-verifier|private\/runtime|secret-approval/,
  );
  assert.equal(readBackup(file).chats[0].messages[0].content, "portable");
  fs.writeFileSync(file, JSON.stringify({ format: "other", version: 1 }));
  assert.throws(() => readBackup(file), /Unsupported/);
});
test("project access requires explicit registration", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  assert.throws(() => projects.list(root), /not opened/);
  projects.register(root);
  assert.deepEqual(projects.list(root).entries, []);
});
test("UTF-8 read, optimistic save and preservation of external edits", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  fs.writeFileSync(path.join(root, "hello.txt"), "Xin chào · 안녕 · 🐰");
  const old = projects.read(root, "hello.txt");
  assert.equal(old.text, "Xin chào · 안녕 · 🐰");
  const next = projects.write(root, "hello.txt", "Edited 🐰", old.revision);
  assert.notEqual(next.revision, old.revision);
  fs.writeFileSync(path.join(root, "hello.txt"), "changed elsewhere");
  assert.throws(
    () => projects.write(root, "hello.txt", "overwrite", next.revision),
    /changed on disk/,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "hello.txt"), "utf8"),
    "changed elsewhere",
  );
});
test("large text files use optimized editor metadata", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  const large = "const value = 1;\n".repeat(40000);
  fs.writeFileSync(path.join(root, "large.js"), large);
  const document = projects.read(root, "large.js");
  assert.equal(document.text.length, large.length);
  assert.equal(document.bytes, Buffer.byteLength(large));
  assert.equal(document.optimized, true);
  const saved = projects.write(
    root,
    "large.js",
    `${large}// edited\n`,
    document.revision,
  );
  assert.equal(saved.optimized, true);
});
test("directory pagination never silently drops entries", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  for (let index = 0; index < 525; index++)
    fs.writeFileSync(
      path.join(root, `file-${String(index).padStart(3, "0")}.txt`),
      "x",
    );
  const first = projects.list(root, "", { limit: 200 });
  const second = projects.list(root, "", { offset: 200, limit: 500 });
  assert.equal(first.entries.length, 200);
  assert.equal(first.total, 525);
  assert.equal(first.hasMore, true);
  assert.equal(second.entries.length, 325);
  assert.equal(second.hasMore, false);
});
test("giant text files open in bounded read-only windows", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  const file = path.join(root, "giant.log");
  fs.writeFileSync(file, "a".repeat(9 * 1024 * 1024));
  const first = projects.read(root, "giant.log");
  assert.equal(first.readOnly, true);
  assert.equal(first.truncated, true);
  assert.equal(first.bytes, 256 * 1024);
  assert.equal(first.totalBytes, 9 * 1024 * 1024);
  const last = projects.readWindow(root, "giant.log", first.totalBytes);
  assert.equal(last.offset + last.bytes, last.totalBytes);
});
test("path traversal and symlink escapes are blocked", (context) => {
  const root = fixture(context);
  const outside = fixture(context);
  const projects = new Projects();
  projects.register(root);
  fs.writeFileSync(path.join(outside, "private.txt"), "private");
  fs.symlinkSync(outside, path.join(root, "link"), "junction");
  assert.throws(() => projects.read(root, "../private.txt"));
  assert.throws(() => projects.read(root, "link/private.txt"), /escapes/);
  assert.deepEqual(projects.list(root).entries, []);
});
test("credentials, binary and oversized files are not exposed", (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  for (const name of [".env", ".env.local", "credentials.json", "server.key"]) {
    fs.writeFileSync(path.join(root, name), "secret");
    assert.throws(() => projects.read(root, name), /excluded/);
  }
  fs.writeFileSync(path.join(root, "binary"), Buffer.from([1, 0, 255]));
  assert.throws(() => projects.read(root, "binary"), /Binary/);
  fs.symlinkSync(path.join(root, ".env"), path.join(root, "innocent.txt"));
  assert.throws(() => projects.read(root, "innocent.txt"), /excluded/);
});
test("porcelain rename and worktree records use NUL framing", () => {
  assert.deepEqual(parseStatus("R  new name\0old name\0?? another\0"), [
    { status: "R ", path: "new name" },
    { status: "??", path: "another" },
  ]);
  assert.deepEqual(
    parseWorktrees(
      "worktree /tmp/a\0HEAD abc\0branch refs/heads/main\0\0worktree /tmp/b\0detached\0\0",
    ),
    [
      { root: "/tmp/a", branch: "main" },
      { root: "/tmp/b", branch: "detached" },
    ],
  );
});
test("real Git inspection handles changed file and does not mutate it", async (context) => {
  const root = fixture(context);
  const projects = new Projects();
  projects.register(root);
  execFileSync("git", ["init", "-q", root]);
  fs.writeFileSync(path.join(root, "file.txt"), "original\n");
  execFileSync("git", ["add", "."], { cwd: root });
  fs.writeFileSync(path.join(root, "file.txt"), "updated\n");
  const state = await projects.status(root);
  assert.equal(state.error, "");
  assert.equal(state.changes.length, 1);
  const diff = await projects.diff(root, "file.txt");
  assert.match(diff, /updated/);
  assert.equal(
    fs.readFileSync(path.join(root, "file.txt"), "utf8"),
    "updated\n",
  );
});
test("atomic workspace persistence survives reopening", (context) => {
  const root = fixture(context);
  const store = new Store(root);
  store.save({
    projects: [{ name: "a", root: "/tmp/a" }],
    chats: [
      {
        id: "conversation",
        root: "/tmp/a",
        title: "Test",
        events: [],
        running: false,
        messages: [{ role: "user", content: "안녕" }],
      },
    ],
  });
  const reopened = new Store(root);
  assert.equal(reopened.value.chats[0].messages[0].content, "안녕");
  reopened.save({ preferences: { locale: "ko" } });
  assert.equal(new Store(root).value.preferences.locale, "ko");
  assert.throws(
    () => reopened.save({ preferences: { locale: "unsupported" } }),
    /preferences/,
  );
  assert.equal(
    fs.readdirSync(root).filter((name) => name.endsWith(".tmp")).length,
    0,
  );
});
test("corrupt state is preserved rather than silently erased", (context) => {
  const root = fixture(context);
  fs.writeFileSync(path.join(root, "workspace-v1.json"), "{broken");
  const store = new Store(root);
  assert.match(store.warning, /recovery/);
  const recovery = fs
    .readdirSync(root)
    .find((name) => name.includes("recovery"));
  assert.equal(fs.readFileSync(path.join(root, recovery), "utf8"), "{broken");
});
test("valid JSON with invalid nested state cannot break startup", (context) => {
  const root = fixture(context);
  const store = new Store(root);
  store.save({});
  const broken = { ...store.value, projects: [null], profile: null };
  fs.writeFileSync(store.file, JSON.stringify(broken));
  const restored = new Store(root);
  assert.match(restored.warning, /recovery/);
  assert.deepEqual(restored.value.projects, []);
  assert.throws(() => restored.save({ layout: { sidebar: NaN } }), /layout/);
});
test("data overview reports sizes without following credential symlinks", (context) => {
  const root = fixture(context);
  const outside = fixture(context);
  const store = new Store(root);
  store.save({});
  fs.mkdirSync(path.join(root, "oauth-v1"));
  fs.writeFileSync(path.join(root, "oauth-v1", "google.enc"), "encrypted");
  fs.writeFileSync(path.join(outside, "secret.enc"), "must-not-count");
  fs.symlinkSync(
    path.join(outside, "secret.enc"),
    path.join(root, "oauth-v1", "linked.enc"),
  );
  const result = new DataOverview(root).inspect();
  assert.equal(result.workspace.files, 1);
  assert.equal(result.credentials.files, 1);
  assert.equal(result.credentials.bytes, Buffer.byteLength("encrypted"));
  assert.equal(
    result.total_bytes,
    result.workspace.bytes + result.credentials.bytes,
  );
  assert.equal(result.memory.status, "runtime_contract_required");
  assert.equal(JSON.stringify(result).includes("must-not-count"), false);
});
test("custom endpoints require HTTPS except explicit loopback", () => {
  assert.equal(
    endpoint("http://127.0.0.1:1234/v1/"),
    "http://127.0.0.1:1234/v1",
  );
  assert.throws(() => endpoint("http://example.com/v1"), /HTTPS/);
  assert.throws(
    () => endpoint("https://user:key@example.com/v1"),
    /credentials/,
  );
  assert.throws(() => endpoint("file:///etc/passwd"));
  assert.throws(() => profileInput({ provider: "invented", model: "test" }));
  assert.throws(
    () =>
      profileInput({
        provider: "ollama",
        model: "test",
        baseUrl: "http://127.0.0.1:1234",
      }),
    /canonical Ollama/,
  );
});
test("real local HTTP model discovery and no redirect forwarding", async (context) => {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect/models") {
      response.writeHead(302, { Location: "https://example.com" });
      response.end();
    } else {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data: [{ id: "local/test" }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(
    await discover({ provider: "custom", model: "", baseUrl: base }),
    ["local/test"],
  );
  await assert.rejects(
    discover({ provider: "custom", model: "", baseUrl: `${base}/redirect` }),
  );
});
test("local model adapters use separate canonical endpoints", async () => {
  assert.equal(adapterFor("ollama").baseUrl, "http://127.0.0.1:11434");
  assert.equal(adapterFor("lmstudio").baseUrl, "http://127.0.0.1:1234/v1");
  assert.equal(adapterFor("llamacpp").baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(
    profileInput({ provider: "lmstudio", model: "local-model", baseUrl: "" })
      .baseUrl,
    "http://127.0.0.1:1234/v1",
  );
});
test("local model inspection isolates offline adapters", async () => {
  const fetcher = async (url) => {
    if (String(url).includes("11434"))
      return new Response(JSON.stringify({ models: [{ name: "qwen" }] }));
    throw new Error("offline");
  };
  const discovered = await discoverLocalModels("ollama", "", "", fetcher);
  assert.deepEqual(discovered.models, ["qwen"]);
  const inspected = await inspectLocalModels(fetcher);
  assert.equal(
    inspected.find((item) => item.provider === "ollama").status,
    "ready",
  );
  assert.equal(
    inspected.find((item) => item.provider === "lmstudio").status,
    "offline",
  );
});
test("Studio provider catalog stays aligned with the canonical Rust catalog", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/model/catalog.rs"),
    "utf8",
  );
  const block = source.match(
    /const PROVIDERS:[\s\S]*?= &\[([\s\S]*?)\n\];/,
  )?.[1];
  assert.ok(block);
  const rustProviders = [...block.matchAll(/name: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    PROVIDERS.map((provider) => provider.id),
    rustProviders,
  );
  assert.equal(PROVIDERS.length, 19);
  assert.equal(
    PROVIDERS.filter((provider) => provider.kind === "local").length,
    6,
  );
  assert.equal(publicCatalog().at(-1).canonical, false);
  assert.throws(() => providerById("invented"), /Unsupported/);
  const implementations = [
    fs.readFileSync(
      path.resolve(__dirname, "../../../src/chat/anthropic.rs"),
      "utf8",
    ),
    fs.readFileSync(
      path.resolve(__dirname, "../../../src/chat/gemini.rs"),
      "utf8",
    ),
    fs.readFileSync(
      path.resolve(__dirname, "../../../src/chat/openai_compat.rs"),
      "utf8",
    ),
  ].join("\n");
  for (const provider of PROVIDERS) {
    const model = provider.defaultModel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(implementations, new RegExp(model));
    if (provider.envVar)
      assert.match(implementations, new RegExp(provider.envVar));
  }
});
test("model credentials are encrypted and isolated per provider", (context) => {
  const directory = fixture(context);
  const encryptionKey = crypto.randomBytes(32);
  const secureStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "keychain",
    encryptString(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
      const body = Buffer.concat([cipher.update(text), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString(data) {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        data.subarray(0, 12),
      );
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString();
    },
  };
  const credentials = new ModelCredentialStore(
    directory,
    secureStorage,
    "darwin",
  );
  credentials.write("anthropic", "ANTHROPIC_PRIVATE");
  credentials.write("openai", "OPENAI_PRIVATE");
  assert.equal(credentials.read("anthropic"), "ANTHROPIC_PRIVATE");
  assert.equal(credentials.read("openai"), "OPENAI_PRIVATE");
  assert.deepEqual(credentials.configured(), ["anthropic", "openai"]);
  for (const file of fs.readdirSync(directory)) {
    const stored = fs.readFileSync(path.join(directory, file)).toString();
    assert.doesNotMatch(stored, /ANTHROPIC_PRIVATE|OPENAI_PRIVATE/);
  }
  credentials.delete("anthropic");
  assert.equal(credentials.read("anthropic"), "");
  assert.equal(credentials.read("openai"), "OPENAI_PRIVATE");
});
test("unsafe Linux storage keeps model credentials in memory only", (context) => {
  const directory = fixture(context);
  const secureStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "basic_text",
    encryptString() {
      throw new Error("must not encrypt with basic_text");
    },
    decryptString() {
      throw new Error("must not decrypt with basic_text");
    },
  };
  const credentials = new ModelCredentialStore(
    directory,
    secureStorage,
    "linux",
  );
  assert.equal(credentials.write("groq", "SESSION_ONLY"), "session");
  assert.equal(credentials.read("groq"), "SESSION_ONLY");
  assert.deepEqual(fs.readdirSync(directory), []);
});
function fakePty() {
  const proc = {
    pauseCount: 0,
    resumed: 0,
    killed: false,
    onData(fn) {
      this.data = fn;
    },
    onExit(fn) {
      this.exit = fn;
    },
    pause() {
      this.pauseCount++;
    },
    resume() {
      this.resumed++;
    },
    kill() {
      this.killed = true;
    },
    write(text) {
      this.input = text;
    },
    resize(cols, rows) {
      this.size = [cols, rows];
    },
  };
  return proc;
}
test("terminal subscriptions buffer startup and acknowledge monotonically", () => {
  const proc = fakePty();
  const events = [];
  const manager = new Terminals(
    () => proc,
    (...event) => events.push(event),
  );
  const session = manager.create("/tmp");
  proc.data("start");
  assert.equal(events.length, 0);
  manager.subscribe(session.id);
  assert.equal(events[0][1].data, "start");
  proc.data("x".repeat(150000));
  assert.equal(proc.pauseCount, 1);
  manager.acknowledge(session.id, 150005);
  assert.equal(proc.resumed, 1);
  manager.acknowledge(session.id, 1);
  assert.equal(manager.get(session.id).ack, 150005);
  manager.acknowledge(session.id, Infinity);
  assert.equal(manager.get(session.id).ack, 150005);
});
test("independent terminal IDs, monotonically unique titles, resize and cleanup", () => {
  const processes = [];
  const manager = new Terminals(
    () => {
      const proc = fakePty();
      processes.push(proc);
      return proc;
    },
    () => {},
  );
  const first = manager.create("/tmp");
  const second = manager.create("/tmp");
  manager.write(first.id, "你好");
  assert.equal(processes[0].input, "你好");
  assert.equal(processes[1].input, undefined);
  manager.resize(first.id, 120, 40);
  assert.deepEqual(processes[0].size, [120, 40]);
  assert.throws(() => manager.resize(first.id, 0, 40));
  manager.close(first.id);
  assert.equal(processes[0].killed, true);
  assert.equal(manager.create("/tmp").label, "Terminal 3");
  manager.dispose();
  assert.equal(manager.sessions.size, 0);
  assert.equal(manager.closing.size, 3);
  for (const proc of processes) {
    proc.data("late output");
    proc.exit({ exitCode: 0 });
  }
  assert.equal(manager.closing.size, 0);
});
