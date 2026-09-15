// Real chat-turn orchestration that main.cjs's IPC handlers can't unit
// test directly (main.cjs loads Electron APIs at module scope, so it can
// only be exercised via the Electron-only `test:electron` smoke test).
// This module has no Electron dependency -- every side effect (spawning a
// process, updating the chat object, persisting) is passed in as `deps` --
// so it's testable with plain `node --test` the same way
// host/mixture-of-agents.cjs already is.
//
// Two real features live here:
//   1. runMoATurn -- routes a real chat conversation through a Mixture of
//      Agents preset (host/mixture-of-agents.cjs's runPreset), streaming
//      step-by-step progress into chat.events (the existing RuntimeEvent
//      log the Inspector panel already renders) instead of only resolving
//      once at the end.
//   2. generateTitle -- a real model call that replaces the placeholder
//      "first message, truncated" chat title with one the model actually
//      wrote, once per chat.
const { startRuntime } = require("./runtime.cjs");
const { runPreset } = require("./mixture-of-agents.cjs");

function stepEventKind(step) {
  return `moa_${step.kind}_${step.ok ? "ok" : "failed"}`;
}

// Mutates `chat` in place (same contract main.cjs's existing launchTurn
// already uses) and calls deps.onUpdate(chat) after every meaningful
// change, mirroring the chat:update push main.cjs emits today. Returns a
// {stop()} handle for main.cjs's `runs` Map / stopChat / shutdown-drain
// contract -- cancelling mid-run stops whichever step is currently
// in-flight and skips every step after it.
function runMoATurn(chat, preset, promptText, deps) {
  const { binary, root, credentialFor, spawnProcess, onUpdate, onFinish } = deps;
  chat.running = true;
  chat.error = "";
  chat.profile = { provider: "mixture-of-agents", model: preset.id, baseUrl: "" };
  onUpdate(chat);
  const reply = chat.messages.at(-1);
  let cancelled = false;
  let currentRun = null;

  runPreset(preset, {
    binary,
    root,
    promptText,
    credentialFor,
    spawnProcess,
    onStep: (step) => {
      chat.events = [
        ...chat.events,
        {
          type: "moa_step",
          kind: stepEventKind(step),
          tool: `${step.provider}/${step.model}`,
          summary: (step.message || "").slice(0, 300),
          reason: step.reason,
          ok: step.ok,
          time: new Date().toISOString(),
        },
      ].slice(-200);
      onUpdate(chat);
    },
    isCancelled: () => cancelled,
    registerActiveRun: (run) => {
      currentRun = run;
    },
  }).then((result) => {
    chat.running = false;
    currentRun = null;
    if (result.cancelled)
      chat.error = "Đã dừng theo yêu cầu. Nội dung nhận được được giữ lại.";
    else if (result.ok) reply.content = (result.finalOutput || "").slice(0, 500000);
    else
      chat.error =
        "Mixture of Agents thất bại — không model nào trả lời được, kể cả fallback.";
    onUpdate(chat);
    if (!result.cancelled) onFinish?.(chat, result.ok);
  });

  return {
    stop() {
      if (!cancelled) {
        cancelled = true;
        currentRun?.stop();
      }
    },
  };
}

// Pure: decides which profile (if any) should generate this chat's title.
// `effectiveMainProfile` is whatever the CALLER considers "the main model"
// for this chat right now -- for a normal turn that's chat.profile; for a
// turn that just ran through Mixture of Agents, chat.profile.provider is
// the "mixture-of-agents" sentinel (not a real model), so the caller swaps
// in the preset's aggregator profile instead before calling this.
function resolveTitleModelProfile(config, effectiveMainProfile) {
  if (!config || !config.enabled) return null;
  if (!config.useMainModel)
    return config.provider && config.model
      ? { provider: config.provider, model: config.model, baseUrl: "" }
      : null;
  return effectiveMainProfile &&
    effectiveMainProfile.provider &&
    effectiveMainProfile.model
    ? effectiveMainProfile
    : null;
}

function buildTitlePrompt(firstUserText, firstAssistantText) {
  return [
    "Tóm tắt đoạn hội thoại sau thành một tiêu đề ngắn gọn (tối đa 6 từ, tiếng Việt, không dùng dấu ngoặc kép, không chấm câu cuối):",
    "",
    `Người dùng: ${firstUserText.slice(0, 2000)}`,
    `Trợ lý: ${firstAssistantText.slice(0, 2000)}`,
  ].join("\n");
}

// Best-effort, silent-on-failure by design: a wrong/missing title is a
// cosmetic downgrade to the "first message, truncated" fallback that
// host/main.cjs's sendChat already sets, not something worth surfacing an
// error for. Only ever runs once per chat (guarded by chat.titleGenerated).
function generateTitle(chat, config, deps) {
  if (chat.titleGenerated) return;
  const profile = resolveTitleModelProfile(config, deps.effectiveMainProfile);
  if (!profile) return;
  const firstUser = chat.messages.find((message) => message.role === "user");
  const firstAssistant = chat.messages.find(
    (message) => message.role === "assistant" && message.content,
  );
  if (!firstUser || !firstAssistant) return;
  const events = [];
  try {
    startRuntime(
      deps.binary,
      deps.root,
      profile,
      {
        task: buildTitlePrompt(
          firstUser.userInput || firstUser.content,
          firstAssistant.content,
        ),
        history: [],
        session_id: `title-${chat.id}`,
        api_key: deps.credentialFor(profile.provider),
      },
      (event) => events.push(event),
      () => {
        const completed = [...events]
          .reverse()
          .find((event) => event.type === "completed");
        const title = completed?.message?.trim().replace(/["“”]/g, "");
        if (title) {
          chat.title = title.slice(0, 60);
          chat.titleGenerated = true;
          deps.onUpdate(chat);
        }
      },
      false,
      deps.spawnProcess,
    );
  } catch {
    // Runtime not configured or spawn failed -- keep the fallback title.
  }
}

module.exports = { runMoATurn, generateTitle, resolveTitleModelProfile };
