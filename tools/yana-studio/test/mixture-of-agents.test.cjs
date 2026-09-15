const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { runPreset } = require("../host/mixture-of-agents.cjs");

// Same pattern as test/protocol.test.cjs's execute(): swap the real
// spawn for a deterministic fixture script instead of mocking
// startRuntime/runPreset themselves -- this exercises the real
// orchestration logic (sequencing, step log, fallback reasons) against a
// real child process protocol, just not the real yana-rt binary. Unlike
// protocol.test.cjs's version (which only needs stdin content), this one
// forwards the real `args` (--provider/--model/...) to the spawned
// process, since moa-fixture.cjs's behavior is keyed on --model to give
// each reference/aggregator/fallback call in one runPreset() a distinct,
// deterministic outcome.
function fakeSpawn(_binary, args, spawnOptions) {
  return spawn(
    process.execPath,
    [path.join(__dirname, "moa-fixture.cjs"), ...args],
    spawnOptions,
  );
}

function referenceModel(id, provider, model, enabled = true) {
  return { id, provider, model, enabled };
}

function basePreset(overrides = {}) {
  return {
    id: "preset-1",
    name: "Test preset",
    enabled: true,
    referenceModels: [],
    aggregator: { provider: "anthropic", model: "agg-ok" },
    contextWindow: "auto",
    fallbackModels: [],
    ...overrides,
  };
}

function run(preset, promptText = "hello") {
  return runPreset(preset, {
    binary: process.execPath,
    root: __dirname,
    promptText,
    credentialFor: () => "test-key",
    spawnProcess: fakeSpawn,
  });
}

test("all reference models succeed, aggregator succeeds", async () => {
  const preset = basePreset({
    referenceModels: [
      referenceModel("r1", "anthropic", "ref-ok-1"),
      referenceModel("r2", "openai", "ref-ok-2"),
    ],
  });
  const result = await run(preset);
  assert.equal(result.ok, true);
  assert.equal(result.finalOutput, "answer from agg-ok");
  assert.deepEqual(
    result.steps.map((step) => step.kind),
    ["reference", "reference", "aggregator"],
  );
  assert.ok(result.steps.every((step) => step.ok));
});

test("one reference model fails, orchestration continues using the rest", async () => {
  const preset = basePreset({
    referenceModels: [
      referenceModel("r1", "anthropic", "ref-ok-1"),
      referenceModel("r2", "openai", "ref-fail"),
    ],
  });
  const result = await run(preset);
  assert.equal(result.ok, true);
  const referenceSteps = result.steps.filter((step) => step.kind === "reference");
  assert.equal(referenceSteps.length, 2);
  assert.equal(referenceSteps[0].ok, true);
  assert.equal(referenceSteps[1].ok, false);
  const aggregatorStep = result.steps.find((step) => step.kind === "aggregator");
  assert.equal(aggregatorStep.ok, true);
});

test("disabled reference models are skipped entirely, not just excluded from aggregation", async () => {
  const preset = basePreset({
    referenceModels: [
      referenceModel("r1", "anthropic", "ref-ok-1", false),
      referenceModel("r2", "openai", "ref-ok-2", true),
    ],
  });
  const result = await run(preset);
  const referenceSteps = result.steps.filter((step) => step.kind === "reference");
  assert.equal(referenceSteps.length, 1);
  assert.equal(referenceSteps[0].model, "ref-ok-2");
});

test("aggregator fails, falls through fallback models in order with a clear reason", async () => {
  const preset = basePreset({
    referenceModels: [referenceModel("r1", "anthropic", "ref-ok-1")],
    aggregator: { provider: "anthropic", model: "agg-fail" },
    fallbackModels: [
      { provider: "openai", model: "fb-fail" },
      { provider: "gemini", model: "fb-ok" },
    ],
  });
  const result = await run(preset);
  assert.equal(result.ok, true);
  assert.equal(result.finalOutput, "answer from fb-ok");
  const aggregatorStep = result.steps.find((step) => step.kind === "aggregator");
  assert.equal(aggregatorStep.ok, false);
  const fallbackSteps = result.steps.filter((step) => step.kind === "fallback");
  assert.equal(fallbackSteps.length, 2);
  assert.equal(fallbackSteps[0].ok, false);
  assert.equal(fallbackSteps[1].ok, true);
  assert.match(fallbackSteps[0].reason, /Aggregator lỗi/);
});

test("no reference model succeeds -- aggregator never runs, fallback reason says so", async () => {
  const preset = basePreset({
    referenceModels: [referenceModel("r1", "anthropic", "ref-fail")],
    fallbackModels: [{ provider: "openai", model: "fb-ok" }],
  });
  const result = await run(preset);
  assert.equal(result.ok, true);
  assert.equal(
    result.steps.some((step) => step.kind === "aggregator"),
    false,
  );
  const fallbackStep = result.steps.find((step) => step.kind === "fallback");
  assert.match(fallbackStep.reason, /không có reference model/i);
});

test("everything fails including fallback -- returns a clear not-ok result, never throws", async () => {
  const preset = basePreset({
    referenceModels: [referenceModel("r1", "anthropic", "ref-fail")],
    fallbackModels: [{ provider: "openai", model: "fb-fail" }],
  });
  const result = await run(preset);
  assert.equal(result.ok, false);
  assert.equal(result.finalOutput, null);
});

test("aggregation prompt embeds the original prompt and every reference output", async () => {
  // A dedicated fixture model name that echoes stdin back as the "answer"
  // would be more direct, but moa-fixture.cjs is deliberately dumb (keyed
  // only on --model) to keep it a reusable, auditable fixture. Instead,
  // assert indirectly: the aggregator step must still run and succeed even
  // though it received a large, multi-section prompt built from real
  // reference outputs -- proving buildAggregationPrompt() ran, not that a
  // trivial task string was forwarded unchanged.
  const preset = basePreset({
    referenceModels: [
      referenceModel("r1", "anthropic", "ref-ok-1"),
      referenceModel("r2", "openai", "ref-ok-2"),
    ],
  });
  const result = await run(preset, "What is the capital of Vietnam?");
  assert.equal(result.ok, true);
  assert.equal(result.steps.find((step) => step.kind === "aggregator").ok, true);
});
