const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const {
  runMoATurn,
  generateTitle,
  resolveTitleModelProfile,
} = require("../host/chat-turns.cjs");

// Reuses the same deterministic fixture mixture-of-agents.test.cjs already
// uses (--model ending in "-fail" errors, anything else succeeds) --
// avoids a second, slightly-different fixture for the same protocol.
function fakeSpawn(_binary, args, spawnOptions) {
  return spawn(
    process.execPath,
    [path.join(__dirname, "moa-fixture.cjs"), ...args],
    spawnOptions,
  );
}

function baseChat(overrides = {}) {
  return {
    id: "chat-1",
    root: __dirname,
    title: "original title",
    messages: [
      { role: "user", content: "hello", userInput: "hello" },
      { role: "assistant", content: "" },
    ],
    events: [],
    running: false,
    error: "",
    approval: null,
    titleGenerated: false,
    ...overrides,
  };
}

// generateTitle only looks at chats that already have a real completed
// assistant reply (it runs right after a turn finishes) -- baseChat()'s
// placeholder empty-content assistant message represents mid-stream, which
// would make generateTitle correctly (but unhelpfully, for these tests)
// no-op since there is nothing to summarize yet.
function completedChat(overrides = {}) {
  return baseChat({
    messages: [
      { role: "user", content: "hello", userInput: "hello" },
      { role: "assistant", content: "a real completed answer" },
    ],
    ...overrides,
  });
}

function basePreset(overrides = {}) {
  return {
    id: "preset-1",
    name: "Test preset",
    enabled: true,
    referenceModels: [
      { id: "r1", provider: "anthropic", model: "ref-ok-1", enabled: true },
    ],
    aggregator: { provider: "openai", model: "agg-ok" },
    contextWindow: "auto",
    fallbackModels: [],
    ...overrides,
  };
}

test("runMoATurn mutates chat.messages/events/profile/running on success", async () => {
  const chat = baseChat();
  const updates = [];
  await new Promise((resolve) => {
    runMoATurn(chat, basePreset(), "hi there", {
      binary: process.execPath,
      root: __dirname,
      credentialFor: () => "test-key",
      spawnProcess: fakeSpawn,
      onUpdate: (c) => {
        updates.push(JSON.parse(JSON.stringify(c)));
        if (!c.running && updates.length > 1) resolve();
      },
      onFinish: () => resolve(),
    });
  });
  assert.equal(chat.running, false);
  assert.equal(chat.messages.at(-1).content, "answer from agg-ok");
  assert.equal(chat.profile.provider, "mixture-of-agents");
  assert.equal(chat.profile.model, "preset-1");
  assert.ok(chat.events.length >= 2, "expected reference + aggregator step events");
  assert.ok(chat.events.every((event) => event.type === "moa_step"));
  assert.ok(updates.length >= 2, "onUpdate should fire at least on start and finish");
});

test("runMoATurn.stop() cancels mid-run: no further steps run, chat.error explains it", async () => {
  const chat = baseChat();
  const preset = basePreset({
    referenceModels: [
      { id: "r1", provider: "anthropic", model: "ref-ok-1", enabled: true },
      { id: "r2", provider: "openai", model: "ref-ok-2", enabled: true },
    ],
  });
  let handle;
  const finished = new Promise((resolve) => {
    handle = runMoATurn(chat, preset, "hi", {
      binary: process.execPath,
      root: __dirname,
      credentialFor: () => "test-key",
      spawnProcess: fakeSpawn,
      onUpdate: (c) => {
        if (!c.running) resolve();
      },
      onFinish: () => {},
    });
  });
  handle.stop();
  await finished;
  assert.equal(chat.running, false);
  assert.match(chat.error, /dừng theo yêu cầu/);
  assert.equal(chat.messages.at(-1).content, "");
});

test("resolveTitleModelProfile: disabled config returns null", () => {
  assert.equal(
    resolveTitleModelProfile(
      { enabled: false, useMainModel: true, provider: "", model: "" },
      { provider: "anthropic", model: "claude-sonnet-5", baseUrl: "" },
    ),
    null,
  );
});
test("resolveTitleModelProfile: useMainModel uses the caller-supplied effective profile", () => {
  const effective = { provider: "anthropic", model: "claude-sonnet-5", baseUrl: "" };
  const resolved = resolveTitleModelProfile(
    { enabled: true, useMainModel: true, provider: "", model: "" },
    effective,
  );
  assert.deepEqual(resolved, effective);
});
test("resolveTitleModelProfile: useMainModel with no effective profile (e.g. turn never resolved) returns null", () => {
  assert.equal(
    resolveTitleModelProfile(
      { enabled: true, useMainModel: true, provider: "", model: "" },
      null,
    ),
    null,
  );
});
test("resolveTitleModelProfile: custom model used when useMainModel is false", () => {
  const resolved = resolveTitleModelProfile(
    { enabled: true, useMainModel: false, provider: "openai", model: "gpt-4o-mini" },
    { provider: "anthropic", model: "claude-sonnet-5", baseUrl: "" },
  );
  assert.deepEqual(resolved, {
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "",
  });
});
test("resolveTitleModelProfile: custom mode with an incomplete override returns null instead of a broken profile", () => {
  assert.equal(
    resolveTitleModelProfile(
      { enabled: true, useMainModel: false, provider: "openai", model: "" },
      { provider: "anthropic", model: "claude-sonnet-5", baseUrl: "" },
    ),
    null,
  );
});

test("generateTitle sets a real model-written title exactly once", async () => {
  const chat = completedChat();
  const updates = [];
  await new Promise((resolve) => {
    generateTitle(
      chat,
      { enabled: true, useMainModel: true, provider: "", model: "" },
      {
        binary: process.execPath,
        root: __dirname,
        credentialFor: () => "test-key",
        spawnProcess: fakeSpawn,
        effectiveMainProfile: { provider: "anthropic", model: "title-ok", baseUrl: "" },
        onUpdate: (c) => {
          updates.push(JSON.parse(JSON.stringify(c)));
          resolve();
        },
      },
    );
  });
  assert.equal(chat.title, "answer from title-ok");
  assert.equal(chat.titleGenerated, true);
  assert.equal(updates.length, 1);
});

test("generateTitle is a no-op once chat.titleGenerated is already true", async () => {
  const chat = completedChat({ titleGenerated: true, title: "kept title" });
  let updateCalled = false;
  generateTitle(
    chat,
    { enabled: true, useMainModel: true, provider: "", model: "" },
    {
      binary: process.execPath,
      root: __dirname,
      credentialFor: () => "test-key",
      spawnProcess: () => {
        throw new Error("must not spawn when titleGenerated is already true");
      },
      effectiveMainProfile: { provider: "anthropic", model: "title-ok", baseUrl: "" },
      onUpdate: () => {
        updateCalled = true;
      },
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chat.title, "kept title");
  assert.equal(updateCalled, false);
});

test("generateTitle failure keeps the existing fallback title and never throws", async () => {
  const chat = completedChat();
  await new Promise((resolve) => {
    generateTitle(
      chat,
      { enabled: true, useMainModel: true, provider: "", model: "" },
      {
        binary: process.execPath,
        root: __dirname,
        credentialFor: () => "test-key",
        spawnProcess: fakeSpawn,
        effectiveMainProfile: { provider: "anthropic", model: "title-fail", baseUrl: "" },
        onUpdate: () => {},
      },
    );
    // No onUpdate fires on failure (silent by design) -- give the child
    // process a moment to finish, then assert nothing changed.
    setTimeout(resolve, 300);
  });
  assert.equal(chat.title, "original title");
  assert.equal(chat.titleGenerated, false);
});
