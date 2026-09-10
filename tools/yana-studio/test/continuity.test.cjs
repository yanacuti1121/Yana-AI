const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  composeTurnSystem,
  ContinuityEngine,
  estimatedTokens,
  overlap,
  subjectFor,
} = require("../host/continuity-engine.cjs");

function fixture() {
  return fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "yana-continuity-test-")),
  );
}

function chat(id, root, messages) {
  return {
    id,
    root,
    title: messages[0]?.content.slice(0, 45) || "New conversation",
    messages,
    events: [],
    running: false,
    error: "",
    approval: null,
    usageHistory: [],
    profile: { provider: "openai", model: "gpt-test", baseUrl: "" },
  };
}

test("continuity helpers provide deterministic ranking signals", () => {
  assert.ok(
    overlap("continue provider gateway", "provider gateway work") > 0.5,
  );
  assert.equal(subjectFor("Yana AI is the parent ecosystem."), "yana ai");
  assert.equal(estimatedTokens("12345678"), 2);
});

test("retrieved history is not sent until project sharing is enabled", () => {
  const retrieval = {
    context: "SECRET FROM AN OLDER CONVERSATION",
    sources: [{ kind: "conversation" }],
  };
  const disabled = composeTurnSystem(
    { text: "Existing project memory" },
    retrieval,
    false,
  );
  assert.match(disabled, /Existing project memory/);
  assert.doesNotMatch(disabled, /SECRET FROM AN OLDER CONVERSATION/);
  const enabled = composeTurnSystem(
    { text: "Existing project memory" },
    retrieval,
    true,
  );
  assert.match(enabled, /SECRET FROM AN OLDER CONVERSATION/);
});

test("continuity persists raw conversations and imports project memory", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("conv-a", project, [
        {
          role: "user",
          content:
            "Yana AI is the parent ecosystem. Yana Studio is only one product.",
        },
        { role: "assistant", content: "Understood." },
      ]),
      true,
    );
    engine.importProjectMemory(project, {
      text: "Prefer verified implementation over aspirational claims.",
      updatedAt: Date.now(),
    });
    const overview = engine.overview(project);
    assert.equal(overview.conversations, 1);
    assert.ok(overview.memories >= 1);
    assert.ok(
      overview.decisions.some((decision) =>
        decision.content.includes("parent ecosystem"),
      ),
    );
    assert.ok(overview.topics.length > 0);
    assert.match(overview.projectState.summary, /parent ecosystem/);
    assert.ok(Array.isArray(overview.projectState.activeDecisions));
    assert.ok(Array.isArray(overview.projectState.openLoops));
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-conversation retrieval composes typed context with provenance", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("conv-a", project, [
        {
          role: "user",
          content:
            "Yana AI is the parent ecosystem. Yana Studio is only one product.",
        },
      ]),
      true,
    );
    engine.syncConversation(
      chat("conv-b", project, [
        { role: "user", content: "Continue designing the ecosystem homepage." },
      ]),
      true,
    );
    const result = engine.retrieve(
      project,
      "continue designing the homepage",
      "conv-new",
    );
    assert.equal(result.status, "ok");
    assert.match(result.context, /ACTIVE DECISIONS/);
    assert.match(result.context, /OPEN WORK/);
    assert.match(result.context, /RELEVANT CONVERSATIONS/);
    assert.ok(result.sources.some((source) => source.kind === "decision"));
    assert.ok(result.sources.some((source) => source.kind === "open_loop"));
    assert.ok(
      result.sources.some((source) => source.conversationId === "conv-b"),
    );
    assert.ok(result.estimatedTokens <= 2800);
    assert.equal(engine.overview(project).recentRuns.length, 1);
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("confirmed correction supersedes an older decision", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("conv-old", project, [
        { role: "user", content: "Yana Studio is the homepage hero." },
      ]),
      true,
    );
    engine.syncConversation(
      chat("conv-new", project, [
        {
          role: "user",
          content: "We are no longer using Yana Studio as the homepage hero.",
        },
      ]),
      true,
    );
    const overview = engine.overview(project);
    const oldDecision = overview.decisions.find((item) =>
      item.content.includes("is the homepage hero"),
    );
    const currentDecision = overview.decisions.find((item) =>
      item.content.includes("no longer using"),
    );
    assert.equal(oldDecision.status, "superseded");
    assert.equal(currentDecision.status, "active");
    const result = engine.retrieve(
      project,
      "what should the homepage hero show?",
      "conv-d",
    );
    assert.ok(
      result.sources.some((source) =>
        source.content.includes("no longer using"),
      ),
    );
    assert.ok(
      !result.sources.some((source) => source.content === oldDecision.content),
    );
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("uncertain statements wait for review instead of becoming truth", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("conv-uncertain", project, [
        {
          role: "user",
          content: "I think Yana Studio is possibly the homepage hero.",
        },
      ]),
      true,
    );
    const decision = engine.overview(project).decisions[0];
    assert.equal(decision.status, "review");
    const result = engine.retrieve(project, "homepage hero", "conv-next");
    assert.ok(!result.sources.some((source) => source.kind === "decision"));
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("explicit working preferences become inspectable user context", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("conv-preference", project, [
        {
          role: "user",
          content: "I prefer verified implementation over aspirational claims.",
        },
      ]),
      true,
    );
    const result = engine.retrieve(
      project,
      "how should we report completion?",
      "next",
    );
    assert.ok(
      result.sources.some(
        (source) =>
          source.kind === "memory" &&
          source.content.includes("I prefer verified"),
      ),
    );
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("global working preferences cross projects without leaking project facts", () => {
  const directory = fixture();
  const firstProject = path.join(directory, "first");
  const secondProject = path.join(directory, "second");
  fs.mkdirSync(firstProject);
  fs.mkdirSync(secondProject);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("preference-a", firstProject, [
        {
          role: "user",
          content: "I prefer verified implementation over aspirational claims.",
        },
        {
          role: "user",
          content: "Project Alpha is using a private gateway.",
        },
      ]),
      true,
    );
    const result = engine.retrieve(
      secondProject,
      "how should we report implementation?",
      "next-project",
    );
    assert.ok(
      result.sources.some(
        (source) =>
          source.kind === "memory" &&
          source.content.includes("I prefer verified"),
      ),
    );
    assert.doesNotMatch(result.context, /private gateway/);
    assert.doesNotMatch(result.context, new RegExp(directory));
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime tasks are linked as open loops and disappear after completion", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncTasks(project, [
      {
        id: "task-1",
        name: "Finish provider gateway",
        scope: "runtime",
        status: "active",
        blocked: false,
      },
    ]);
    let result = engine.retrieve(project, "continue provider gateway", "next");
    assert.ok(
      result.sources.some(
        (source) =>
          source.kind === "open_loop" &&
          source.content.includes("provider gateway"),
      ),
    );
    engine.syncTasks(project, [
      {
        id: "task-1",
        name: "Finish provider gateway",
        scope: "runtime",
        status: "done",
        blocked: false,
      },
    ]);
    result = engine.retrieve(project, "continue provider gateway", "later");
    assert.ok(!result.sources.some((source) => source.kind === "open_loop"));
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("history sharing is opt-in per project and survives reopening", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  assert.equal(engine.sharingEnabled(project), false);
  assert.equal(engine.setSharing(project, true).sharingEnabled, true);
  engine.close();
  const reopened = new ContinuityEngine(directory);
  try {
    assert.equal(reopened.sharingEnabled(project), true);
  } finally {
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("retrieval remains project scoped", () => {
  const directory = fixture();
  const firstProject = path.join(directory, "first");
  const secondProject = path.join(directory, "second");
  fs.mkdirSync(firstProject);
  fs.mkdirSync(secondProject);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("private-a", firstProject, [
        { role: "user", content: "Project Alpha is using a private gateway." },
      ]),
      true,
    );
    engine.syncConversation(
      chat("public-b", secondProject, [
        { role: "user", content: "Project Beta is using a local runtime." },
      ]),
      true,
    );
    const result = engine.retrieve(secondProject, "gateway runtime", "new-b");
    assert.doesNotMatch(result.context, /private gateway/);
    assert.ok(
      result.sources.every((source) => source.conversationId !== "private-a"),
    );
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("database schema keeps raw evidence and retrieval audit rows", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  engine.syncConversation(
    chat("conv-evidence", project, [
      { role: "user", content: "Continue the provider gateway work." },
      { role: "assistant", content: "I will inspect the current state." },
    ]),
    true,
  );
  engine.retrieve(project, "provider gateway", "conv-next");
  engine.close();
  const database = new DatabaseSync(
    path.join(directory, "continuity-v1.sqlite"),
  );
  try {
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM conversation_messages").get()
        .count,
      2,
    );
    assert.ok(
      database.prepare("SELECT COUNT(*) count FROM retrieval_candidates").get()
        .count > 0,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM schema_migrations").get()
        .count,
      1,
    );
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("removing a conversation also removes its derived continuity data", () => {
  const directory = fixture();
  const project = path.join(directory, "project");
  fs.mkdirSync(project);
  const engine = new ContinuityEngine(directory);
  try {
    engine.syncConversation(
      chat("delete-me", project, [
        {
          role: "user",
          content:
            "I prefer verified reports. Continue building the private gateway. Yana Studio is one product.",
        },
      ]),
      true,
    );
    assert.ok(engine.overview(project).decisions.length > 0);
    assert.ok(engine.overview(project).openLoops.length > 0);
    assert.equal(engine.removeConversation("delete-me"), true);
    const overview = engine.overview(project);
    assert.equal(overview.conversations, 0);
    assert.equal(overview.decisions.length, 0);
    assert.equal(overview.openLoops.length, 0);
    assert.equal(overview.userModel.length, 0);
    assert.equal(overview.topics.length, 0);
    assert.equal(engine.removeConversation("delete-me"), false);
    const retrieval = engine.retrieve(project, "private gateway", "new-chat");
    assert.equal(retrieval.sources.length, 0);
  } finally {
    engine.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
