// Real Mixture of Agents execution. No change to the Rust `yana-rt` binary
// or protocol was needed: `startRuntime()` (host/runtime.cjs) is already a
// generic "run one turn against one provider/model" function, so a preset
// is executed by calling it multiple times -- once per enabled reference
// model, then once more for the aggregator (or, if that fails, once per
// fallback model in order) -- and collecting real results into a step log.
//
// Two callers use this: the standalone "test run" IPC in host/main.cjs
// (Settings page, no `onStep`/`isCancelled`/`registerActiveRun` -- it just
// awaits the final result), and host/chat-turns.cjs's `runMoATurn`, which
// wires a real chat conversation to a preset and needs live step-by-step
// progress plus mid-run cancellation. All three extra params are optional
// so the first caller's usage (and its existing tests) is unaffected.
const { startRuntime } = require("./runtime.cjs");

function runOneTurn(binary, root, profile, input, spawnProcess, registerActiveRun) {
  return new Promise((resolve) => {
    const events = [];
    try {
      const run = startRuntime(
        binary,
        root,
        profile,
        input,
        (event) => events.push(event),
        () => {
          const completed = [...events]
            .reverse()
            .find((event) => event.type === "completed");
          if (completed) {
            resolve({ ok: true, message: completed.message || "" });
            return;
          }
          const errored = [...events]
            .reverse()
            .find((event) => event.type === "error");
          resolve({
            ok: false,
            message: errored?.message || "Không có phản hồi từ runtime",
          });
        },
        false,
        spawnProcess,
      );
      registerActiveRun?.(run);
    } catch (error) {
      resolve({ ok: false, message: error.message });
    }
  });
}

function buildAggregationPrompt(promptText, referenceOutputs) {
  const sections = referenceOutputs
    .map(
      (reference, index) =>
        `[Model ${index + 1} — ${reference.provider}/${reference.model}]\n${reference.message}`,
    )
    .join("\n\n");
  return [
    "Bạn là một aggregator tổng hợp câu trả lời từ nhiều model AI khác nhau cho cùng một câu hỏi.",
    "",
    "Câu hỏi gốc:",
    promptText,
    "",
    "Các câu trả lời tham khảo:",
    "",
    sections,
    "",
    "Hãy tổng hợp thành MỘT câu trả lời tốt nhất, chính xác và đầy đủ nhất.",
  ].join("\n");
}

const CANCELLED_RESULT = { ok: false, steps: null, finalOutput: null, cancelled: true };

async function runPreset(
  preset,
  {
    binary,
    root,
    promptText,
    credentialFor,
    spawnProcess,
    onStep = () => {},
    isCancelled = () => false,
    registerActiveRun = () => {},
  },
) {
  const steps = [];
  const pushStep = (step) => {
    steps.push(step);
    onStep(step);
  };
  const cancelledNow = () => (isCancelled() ? { ...CANCELLED_RESULT, steps } : null);

  const referenceOutputs = [];
  for (const reference of preset.referenceModels.filter((r) => r.enabled)) {
    const early = cancelledNow();
    if (early) return early;
    const profile = {
      provider: reference.provider,
      model: reference.model,
      baseUrl: "",
    };
    const result = await runOneTurn(
      binary,
      root,
      profile,
      {
        task: promptText,
        history: [],
        session_id: `moa-ref-${reference.id}`,
        api_key: credentialFor(reference.provider),
      },
      spawnProcess,
      registerActiveRun,
    );
    pushStep({
      kind: "reference",
      provider: reference.provider,
      model: reference.model,
      ok: result.ok,
      message: result.message,
    });
    if (result.ok)
      referenceOutputs.push({
        provider: reference.provider,
        model: reference.model,
        message: result.message,
      });
  }

  {
    const early = cancelledNow();
    if (early) return early;
  }

  let finalOutput = null;
  if (referenceOutputs.length > 0) {
    const aggregatorProfile = {
      provider: preset.aggregator.provider,
      model: preset.aggregator.model,
      baseUrl: "",
    };
    const aggregated = await runOneTurn(
      binary,
      root,
      aggregatorProfile,
      {
        task: buildAggregationPrompt(promptText, referenceOutputs),
        history: [],
        session_id: `moa-agg-${preset.id}`,
        api_key: credentialFor(preset.aggregator.provider),
      },
      spawnProcess,
      registerActiveRun,
    );
    pushStep({
      kind: "aggregator",
      provider: preset.aggregator.provider,
      model: preset.aggregator.model,
      ok: aggregated.ok,
      message: aggregated.message,
    });
    if (aggregated.ok) finalOutput = aggregated.message;
  }

  if (finalOutput === null) {
    // Fallback only runs when the "main model" -- the aggregator -- failed
    // or never ran (no reference model produced anything to aggregate).
    // Each attempt answers the original prompt directly, since there is
    // nothing left to synthesize, and its reason is recorded in `steps`
    // for the activity log rather than shown as a silent retry.
    const reason =
      referenceOutputs.length === 0
        ? "Không có reference model nào trả lời được"
        : `Aggregator lỗi: ${steps.at(-1).message}`;
    for (const fallback of preset.fallbackModels) {
      const early = cancelledNow();
      if (early) return early;
      const profile = {
        provider: fallback.provider,
        model: fallback.model,
        baseUrl: "",
      };
      const result = await runOneTurn(
        binary,
        root,
        profile,
        {
          task: promptText,
          history: [],
          session_id: `moa-fb-${preset.id}-${fallback.provider}`,
          api_key: credentialFor(fallback.provider),
        },
        spawnProcess,
        registerActiveRun,
      );
      pushStep({
        kind: "fallback",
        provider: fallback.provider,
        model: fallback.model,
        ok: result.ok,
        message: result.message,
        reason,
      });
      if (result.ok) {
        finalOutput = result.message;
        break;
      }
    }
  }

  return { ok: finalOutput !== null, steps, finalOutput };
}

module.exports = { runPreset };
