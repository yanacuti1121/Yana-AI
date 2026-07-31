// Yana AI — Chat model catalog + capability flags + persisted model choice.

// Default model per provider — mirrors PROVIDERS defaults in server.js
export const CHAT_MODELS = {
  claude:     "claude-sonnet-4-6",
  openai:     "gpt-4o-mini",
  gemini:     "gemini-2.0-flash",
  groq:       "llama-3.3-70b-versatile",
  deepseek:   "deepseek-chat",
  openrouter: "google/gemma-3-27b-it",
  xai:        "grok-3-mini",
  novita:     "meta-llama/llama-3.1-70b-instruct",
  nvidia:     "nvidia/llama-3.1-nemotron-70b-instruct",
  kimi:       "moonshot-v1-8k",
  minimax:    "abab6.5s-chat",
  glm:        "glm-4-flash",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  "9router":  "kr/claude-sonnet-4.5",
  ollama:     "llama3.2",
  lmstudio:   "local-model",
  turbofieldfare: "gemma-4-26b-a4b-it",
};

// Curated model choices per provider — providers in CHAT_LIVE_MODELS get the
// real list fetched from /api/models when a key is available.
export const MODEL_CHOICES = {
  claude:     ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  openai:     ["gpt-4o-mini", "gpt-4o"],
  gemini:     ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
  deepseek:   ["deepseek-chat", "deepseek-reasoner"],
  groq:       ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct"],
  openrouter: ["google/gemma-3-27b-it"],
  xai:        ["grok-3-mini", "grok-3", "grok-2-vision-1212"],
  novita:     ["meta-llama/llama-3.1-70b-instruct", "meta-llama/llama-3.1-8b-instruct"],
  nvidia:     ["nvidia/llama-3.1-nemotron-70b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"],
  kimi:       ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  minimax:    ["abab6.5s-chat", "abab6.5g-chat"],
  glm:        ["glm-4-flash", "glm-4", "glm-4v", "glm-z1-flash"],
  huggingface: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3"],
  "9router":  ["kr/claude-sonnet-4.5"],
  ollama:     ["llama3.2"],
  lmstudio:   ["local-model"],
  turbofieldfare: ["gemma-4-26b-a4b-it"],
};
export const CHAT_LIVE_MODELS = new Set(["groq", "openrouter", "xai", "novita", "nvidia", "kimi", "minimax", "glm", "huggingface", "9router", "ollama", "lmstudio", "turbofieldfare"]);

// Capability flags per model (or substring match for dynamic model lists).
// v = vision  r = reasoning  t = text-only (explicit no-vision)
const MODEL_CAPS = {
  // Claude
  "claude-sonnet-4-6":           { v: true },
  "claude-opus-4-8":             { v: true },
  "claude-haiku-4-5-20251001":   { v: true },
  // OpenAI
  "gpt-4o":                      { v: true },
  "gpt-4o-mini":                 { v: true },
  // Gemini
  "gemini-2.0-flash":            { v: true },
  "gemini-2.0-flash-lite":       { v: true },
  "gemini-1.5-pro":              { v: true },
  // DeepSeek
  "deepseek-chat":               { t: true },
  "deepseek-reasoner":           { r: true, t: true },
  // Groq (text-only defaults)
  "llama-3.3-70b-versatile":     { t: true },
  // xAI
  "grok-3-mini":                 { r: true, t: true },
  "grok-3":                      { t: true },
  "grok-2-vision-1212":          { v: true },
  // GLM
  "glm-4v":                      { v: true },
  "glm-4-flash":                 { t: true },
  "glm-4":                       { t: true },
  "glm-z1-flash":                { r: true, t: true },
  // Kimi
  "moonshot-v1-8k":              { t: true },
  "moonshot-v1-32k":             { t: true },
  "moonshot-v1-128k":            { t: true },
};

// Return capability flags for a model name (partial substring match as fallback)
export function modelCaps(model) {
  if (!model) return {};
  if (MODEL_CAPS[model]) return MODEL_CAPS[model];
  const lower = model.toLowerCase();
  // Substring heuristics for dynamic model lists
  if (lower.includes("vision") || lower.includes("4v") || lower.includes("-v-")) return { v: true };
  if (lower.includes("reasoner") || lower.includes("thinking") || lower.includes("qwq") || lower.includes("r1")) return { r: true, t: true };
  return {};
}

// Short label string for an option
export function capsLabel(model) {
  const c = modelCaps(model);
  const tags = [];
  if (c.v) tags.push("👁 vision");
  if (c.r) tags.push("🧠 reasoning");
  if (c.t && !c.v) tags.push("✏ text");
  return tags.length ? " · " + tags.join(" · ") : "";
}

export const MODEL_STORE = "yana.chat.models"; // { providerId: modelId } — persisted

export function loadModelChoices() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_STORE));
    if (saved && typeof saved === "object") return saved;
  } catch (_) {}
  return {};
}
