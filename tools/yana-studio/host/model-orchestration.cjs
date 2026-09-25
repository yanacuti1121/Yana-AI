// "Mô hình & Điều phối" (Models & Orchestration) settings.
//
// Two real, distinct backend surfaces:
//   1. `resolveAutoProfile()` -- a genuinely working "Auto" default-model
//      resolver, used by main.cjs's launchTurn before every turn.
//   2. `isValidMoAConfig()` -- validates Mixture of Agents presets, which
//      main.cjs's `runMixtureOfAgentsPreset` IPC actually executes (see
//      host/mixture-of-agents.cjs) by calling the existing, generic
//      `startRuntime()` once per reference model and once for the
//      aggregator/fallback step. No Rust change needed.
//
// AUXILIARY_FLOWS below is NOT a configurable setting -- it is a static,
// read-only roadmap list. Confirmed by direct audit (grepped host/*.cjs,
// the Rust `yana-rt` source, and docs/programs/*) that none of these
// remaining 10 flows (image analysis, context compression, skill search,
// smart approval, MCP routing, code review, triage/spec, kanban split,
// profile description, curator) have ANY existing call site in this
// codebase to attach a real per-task model override to. Building save/
// reset UI for them with nothing behind it would be exactly the kind of
// fake setting this feature is supposed to avoid -- so there is no
// persisted state, no validator, and no IPC handler for this list at all.
//
// "titleGeneration" used to be the 11th entry here -- it moved out once
// host/chat-turns.cjs's generateTitle() gave it a real consumer (see
// `titleModel` below and host/main.cjs's sendChat wiring).
const { providerById, publicCatalog } = require("./model-catalog.cjs");

const AUXILIARY_FLOWS = Object.freeze([
  "imageAnalysis",
  "contextCompression",
  "skillSearch",
  "smartApproval",
  "mcpRouting",
  "codeReview",
  "triageSpec",
  "kanbanSplit",
  "profileDescription",
  "curator",
]);

function defaultMixtureOfAgents() {
  return { presets: [], defaultPresetId: "" };
}

function defaultTitleModel() {
  return { enabled: true, useMainModel: true, provider: "", model: "" };
}
function isValidTitleModelConfig(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.useMainModel !== "boolean") return false;
  if (value.useMainModel) return value.provider === "" && value.model === "";
  return isModelRef(value);
}

function isModelRef(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    value.model.length <= 200 &&
    !/[\r\n\0]/.test(value.model) &&
    isKnownProvider(value.provider)
  );
}
function isKnownProvider(id) {
  try {
    providerById(id);
    return true;
  } catch {
    return false;
  }
}
function sameModelRef(a, b) {
  return a.provider === b.provider && a.model === b.model;
}

function isValidPreset(preset, presetIds) {
  if (!preset || typeof preset !== "object") return false;
  if (
    typeof preset.id !== "string" ||
    !preset.id ||
    preset.id.length > 100 ||
    presetIds.has(preset.id)
  )
    return false;
  if (
    typeof preset.name !== "string" ||
    !preset.name.trim() ||
    preset.name.length > 200
  )
    return false;
  if (typeof preset.enabled !== "boolean") return false;
  if (
    !Array.isArray(preset.referenceModels) ||
    preset.referenceModels.length > 8
  )
    return false;
  const referenceIds = new Set();
  for (const reference of preset.referenceModels) {
    if (
      !reference ||
      typeof reference.id !== "string" ||
      !reference.id ||
      referenceIds.has(reference.id) ||
      typeof reference.enabled !== "boolean" ||
      !isModelRef(reference)
    )
      return false;
    referenceIds.add(reference.id);
  }
  if (!isModelRef(preset.aggregator)) return false;
  // Aggregator acting as one of the models it aggregates is a logical
  // conflict ("aggregator trùng/không tương thích"), not a technical one --
  // still rejected.
  if (
    preset.referenceModels.some(
      (reference) =>
        reference.enabled && sameModelRef(reference, preset.aggregator),
    )
  )
    return false;
  // Context window: model-catalog.cjs's `context` field ("1M"/"200K"/"—")
  // is a display string, not structured numeric metadata -- parsing it to
  // validate a custom number would be fabricating a check we can't back.
  // So this field only ever holds the literal "auto"; there is no
  // custom-number option to validate.
  if (preset.contextWindow !== "auto") return false;
  if (
    !Array.isArray(preset.fallbackModels) ||
    preset.fallbackModels.length > 5
  )
    return false;
  if (!preset.fallbackModels.every(isModelRef)) return false;
  if (
    preset.enabled &&
    !preset.referenceModels.some((reference) => reference.enabled)
  )
    return false;
  return true;
}

function isValidMoAConfig(value) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.presets) || value.presets.length > 20)
    return false;
  const presetIds = new Set();
  for (const preset of value.presets) {
    if (!isValidPreset(preset, presetIds)) return false;
    presetIds.add(preset.id);
  }
  if (typeof value.defaultPresetId !== "string") return false;
  if (value.defaultPresetId === "") return true;
  const target = value.presets.find(
    (preset) => preset.id === value.defaultPresetId,
  );
  return Boolean(target && target.enabled);
}

// Resolves the "Auto" default-model sentinel. Deterministic, documented
// algorithm (not "whichever provider happens to be connected"): walk
// `publicCatalog()` in its fixed declaration order (host/model-catalog.cjs's
// PROVIDERS array -- never sorted or reordered at runtime) and return the
// FIRST canonical provider that is ready to use right now: either it needs
// no key at all, or it already has a connected credential. Its catalog
// `defaultModel` is used. This exact function backs both the `auto` chat
// resolution in main.cjs's launchTurn AND the read-only `previewAutoProfile`
// IPC the renderer calls to show what Auto currently resolves to BEFORE a
// turn is sent -- one algorithm, one place it's defined, always in sync.
function resolveAutoProfile(configuredProviders) {
  const catalog = publicCatalog();
  const ready = catalog.find(
    (provider) =>
      provider.canonical &&
      (!provider.requiresKey || configuredProviders.includes(provider.id)) &&
      provider.defaultModel,
  );
  if (!ready)
    throw new Error(
      "Auto cần ít nhất một provider đã kết nối. Thêm API key hoặc dùng provider local trong Mô hình & Điều phối.",
    );
  return { provider: ready.id, model: ready.defaultModel, baseUrl: "" };
}

module.exports = {
  AUXILIARY_FLOWS,
  defaultMixtureOfAgents,
  defaultTitleModel,
  isValidMoAConfig,
  isValidTitleModelConfig,
  resolveAutoProfile,
};
