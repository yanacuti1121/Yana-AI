// Curated starting points, not a live-fetched catalog — Yana's own canonical
// provider list (kind/requiresKey/envVar/baseUrl) is authoritative and mirrors
// the Rust side (src/model/catalog.rs::provider_catalog()), but that Rust
// catalog carries no per-model data at all (see its own doc comment — it
// only enumerates providers). The `baseModels` list below is Studio-only:
// several popular models per provider instead of a single guess, each with
// rough metadata (context window, capability tags) so the picker can show
// more than a bare ID. "Dò model" (discoverModels) and the free-text Model ID
// field remain the actual source of truth for what a provider serves today —
// this list exists to give the picker something better than an empty field,
// the same way platforms like OpenRouter/Cursor seed a model list a user can
// still override.
//
// `defaultModel` stays a literal, first-class field (not derived from
// baseModels[0]) and MUST keep its original value per provider: the
// "Studio provider catalog stays aligned with the canonical Rust catalog"
// test in test/core.test.cjs regex-matches every provider's defaultModel
// string against the real Rust provider implementations
// (src/chat/anthropic.rs, gemini.rs, openai_compat.rs) — those files only
// contain the ORIGINAL default IDs, not every extra model added below.
// baseModels[0] is always the same ID as defaultModel by construction.
function models(...entries) {
  return entries.map(([id, label, context, tags]) => ({
    id,
    label,
    context,
    tags,
  }));
}

const PROVIDERS = Object.freeze([
  {
    id: "anthropic",
    label: "Claude",
    company: "Anthropic",
    kind: "cloud",
    requiresKey: true,
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    baseModels: models(
      [
        "claude-sonnet-4-6",
        "Sonnet 4.6",
        "200K",
        ["balanced", "tools", "vision"],
      ],
      [
        "claude-opus-4-6",
        "Opus 4.6",
        "200K",
        ["smartest", "reasoning", "vision"],
      ],
      ["claude-haiku-4-6", "Haiku 4.6", "200K", ["fastest", "cheap", "tools"]],
    ),
  },
  {
    id: "openai",
    label: "OpenAI",
    company: "OpenAI",
    kind: "cloud",
    requiresKey: true,
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    baseModels: models(
      [
        "gpt-4o-mini",
        "GPT-4o mini",
        "128K",
        ["fast", "cheap", "tools", "vision"],
      ],
      ["gpt-4o", "GPT-4o", "128K", ["balanced", "tools", "vision"]],
      ["o1", "o1", "200K", ["reasoning"]],
      ["o1-mini", "o1-mini", "128K", ["reasoning", "cheap"]],
    ),
  },
  {
    id: "gemini",
    label: "Gemini",
    company: "Google",
    kind: "cloud",
    requiresKey: true,
    envVar: "GEMINI_API_KEY",
    defaultModel: "gemini-2.0-flash",
    baseModels: models(
      [
        "gemini-2.0-flash",
        "2.0 Flash",
        "1M",
        ["fast", "cheap", "tools", "vision"],
      ],
      ["gemini-2.0-flash-thinking", "2.0 Flash Thinking", "1M", ["reasoning"]],
      ["gemini-1.5-pro", "1.5 Pro", "2M", ["long-context", "tools", "vision"]],
    ),
  },
  {
    id: "groq",
    label: "Groq",
    company: "Groq",
    kind: "cloud",
    requiresKey: true,
    envVar: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    baseModels: models(
      [
        "llama-3.3-70b-versatile",
        "Llama 3.3 70B",
        "128K",
        ["balanced", "tools"],
      ],
      ["llama-3.1-8b-instant", "Llama 3.1 8B", "128K", ["fastest", "cheap"]],
      ["mixtral-8x7b-32768", "Mixtral 8x7B", "32K", ["tools"]],
    ),
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    company: "DeepSeek",
    kind: "cloud",
    requiresKey: true,
    envVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    baseModels: models(
      ["deepseek-chat", "DeepSeek Chat", "64K", ["balanced", "tools"]],
      ["deepseek-reasoner", "DeepSeek Reasoner", "64K", ["reasoning"]],
    ),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    company: "OpenRouter",
    kind: "cloud",
    requiresKey: true,
    envVar: "OPENROUTER_API_KEY",
    defaultModel: "google/gemma-3-27b-it",
    baseModels: models(
      ["google/gemma-3-27b-it", "Gemma 3 27B", "8K", ["cheap"]],
      [
        "anthropic/claude-sonnet-4-6",
        "Claude Sonnet 4.6",
        "200K",
        ["balanced", "tools", "vision"],
      ],
      [
        "meta-llama/llama-3.3-70b-instruct",
        "Llama 3.3 70B",
        "128K",
        ["balanced"],
      ],
    ),
  },
  {
    id: "xai",
    label: "xAI",
    company: "xAI",
    kind: "cloud",
    requiresKey: true,
    envVar: "XAI_API_KEY",
    defaultModel: "grok-3-mini",
    baseModels: models(
      ["grok-3-mini", "Grok 3 mini", "128K", ["fast", "cheap"]],
      ["grok-3", "Grok 3", "128K", ["balanced", "tools"]],
      ["grok-2", "Grok 2", "128K", ["tools"]],
    ),
  },
  {
    id: "novita",
    label: "Novita",
    company: "Novita AI",
    kind: "cloud",
    requiresKey: true,
    envVar: "NOVITA_API_KEY",
    defaultModel: "meta-llama/llama-3.1-70b-instruct",
    baseModels: models(
      [
        "meta-llama/llama-3.1-70b-instruct",
        "Llama 3.1 70B",
        "128K",
        ["balanced"],
      ],
      [
        "meta-llama/llama-3.1-8b-instruct",
        "Llama 3.1 8B",
        "128K",
        ["cheap", "fast"],
      ],
    ),
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    company: "NVIDIA",
    kind: "cloud",
    requiresKey: true,
    envVar: "NVIDIA_API_KEY",
    defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    baseModels: models([
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "Nemotron 70B",
      "128K",
      ["balanced"],
    ]),
  },
  {
    id: "minimax",
    label: "MiniMax",
    company: "MiniMax",
    kind: "cloud",
    requiresKey: true,
    envVar: "MINIMAX_API_KEY",
    defaultModel: "abab6.5s-chat",
    baseModels: models(
      ["abab6.5s-chat", "abab6.5s", "245K", ["balanced", "fast"]],
      ["abab6.5-chat", "abab6.5", "245K", ["balanced"]],
    ),
  },
  {
    id: "glm",
    label: "GLM",
    company: "Zhipu AI",
    kind: "cloud",
    requiresKey: true,
    envVar: "GLM_API_KEY",
    defaultModel: "glm-4-flash",
    baseModels: models(
      ["glm-4-flash", "GLM-4 Flash", "128K", ["fast", "cheap"]],
      ["glm-4-plus", "GLM-4 Plus", "128K", ["balanced"]],
    ),
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    company: "Hugging Face",
    kind: "cloud",
    requiresKey: true,
    envVar: "HUGGINGFACE_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    baseModels: models([
      "meta-llama/Llama-3.3-70B-Instruct",
      "Llama 3.3 70B",
      "128K",
      ["balanced"],
    ]),
  },
  {
    id: "9router",
    label: "9Router",
    company: "Local gateway",
    kind: "local",
    requiresKey: true,
    envVar: "NINE_ROUTER_API_KEY",
    defaultModel: "kr/claude-sonnet-4.5",
    baseUrl: "http://127.0.0.1:20128/v1",
    discoverable: true,
    baseModels: models(
      [
        "kr/claude-sonnet-4.5",
        "Claude Sonnet 4.5 (routed)",
        "200K",
        ["balanced"],
      ],
      ["kr/gpt-4o", "GPT-4o (routed)", "128K", ["balanced"]],
    ),
  },
  {
    id: "kimi",
    label: "Kimi",
    company: "Moonshot AI",
    kind: "cloud",
    requiresKey: true,
    envVar: "MOONSHOT_API_KEY",
    defaultModel: "kimi-k3",
    baseModels: models(
      ["kimi-k3", "Kimi K3", "128K", ["balanced"]],
      ["kimi-k3-lite", "Kimi K3 Lite", "128K", ["fast", "cheap"]],
    ),
  },
  {
    id: "ollama",
    label: "Ollama",
    company: "On-device",
    kind: "local",
    requiresKey: false,
    envVar: "",
    defaultModel: "llama3.2",
    baseUrl: "http://127.0.0.1:11434",
    discoverable: true,
    baseModels: models(
      ["llama3.2", "Llama 3.2", "128K", ["local"]],
      ["qwen2.5", "Qwen 2.5", "32K", ["local"]],
      ["deepseek-r1", "DeepSeek R1", "64K", ["local", "reasoning"]],
    ),
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    company: "On-device",
    kind: "local",
    requiresKey: false,
    envVar: "",
    defaultModel: "local-model",
    baseUrl: "http://127.0.0.1:1234/v1",
    discoverable: true,
    baseModels: models(["local-model", "Loaded in LM Studio", "—", ["local"]]),
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    company: "On-device",
    kind: "local",
    requiresKey: false,
    envVar: "",
    defaultModel: "local-model",
    baseUrl: "http://127.0.0.1:8080/v1",
    discoverable: true,
    baseModels: models(["local-model", "Loaded GGUF", "—", ["local"]]),
  },
  {
    id: "turbofieldfare",
    label: "TurboFieldfare",
    company: "On-device",
    kind: "local",
    requiresKey: false,
    envVar: "",
    defaultModel: "gemma-4-26b-a4b-it",
    baseUrl: "http://127.0.0.1:8091/v1",
    discoverable: true,
    baseModels: models(["gemma-4-26b-a4b-it", "Gemma 4 26B", "—", ["local"]]),
  },
  {
    id: "airllm",
    label: "AirLLM",
    company: "On-device",
    kind: "local",
    requiresKey: false,
    envVar: "",
    defaultModel: "meta-llama/Llama-3.2-3B-Instruct",
    baseUrl: "http://127.0.0.1:8100/v1",
    discoverable: true,
    // The id here must stay literally in sync with the Rust default_model
    // (src/chat/openai_compat.rs::airllm()) per this file's own top-of-file
    // constraint — but that value is a placeholder on the Rust side too:
    // AirLLM's whole point is running whatever huge model the user actually
    // launched the bridge with (`--model <hf-id>`), not a fixed 3B model.
    // The label says so, same convention as LM Studio/llama.cpp below
    // ("Loaded in LM Studio" / "Loaded GGUF") instead of implying this is
    // really what's running.
    baseModels: models([
      "meta-llama/Llama-3.2-3B-Instruct",
      "Đặt qua --model khi chạy bridge",
      "—",
      ["local"],
    ]),
  },
]);

const CUSTOM_PROVIDER = Object.freeze({
  id: "custom",
  label: "OpenAI-compatible",
  company: "User endpoint",
  kind: "custom",
  requiresKey: false,
  envVar: "",
  defaultModel: "",
  baseUrl: "",
  discoverable: true,
  canonical: false,
  baseModels: [],
});

function publicCatalog() {
  return [...PROVIDERS, CUSTOM_PROVIDER].map((provider) => ({
    ...provider,
    canonical: provider.canonical !== false,
    models: provider.baseModels.map((model) => model.id),
    modelCatalog: provider.baseModels,
  }));
}

function providerById(id) {
  const provider = [...PROVIDERS, CUSTOM_PROVIDER].find(
    (entry) => entry.id === id,
  );
  if (!provider) throw new Error("Unsupported provider");
  return provider;
}

module.exports = { PROVIDERS, CUSTOM_PROVIDER, publicCatalog, providerById };
