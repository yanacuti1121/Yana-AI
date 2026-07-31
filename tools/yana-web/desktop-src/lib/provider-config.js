// Shared provider-key resolution helper. Originally a chat.jsx-local
// function; extracted into its own module because spaces.jsx's Mission
// Center ("Plan with Yana") depends on it too, ahead of chat.jsx's own
// Phase 3 conversion/split (see .claude/plans/functional-shimmying-boole.md
// section 3 — this is the same extraction that plan already called for,
// just done a bit earlier so Phase 2 pages don't need chat.jsx yet).
// YanaVault stays a Tier-B ambient global (see components.jsx) — referenced
// bare here, exactly like the original chat.jsx did, not imported.

export const KEYLESS_PROVIDERS = new Set(["ollama", "lmstudio", "9router", "turbofieldfare"]);

export function providerAvailable(id) {
  if (id === "auto") return true;
  return KEYLESS_PROVIDERS.has(id) || YanaVault.hasKey(id);
}

export function getProviderConfig(preferred) {
  const order = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter"];
  if (preferred === "auto") {
    // Real provider is resolved at send time by smartPickProvider()
    for (const id of order) {
      const key = YanaVault.getKey(id);
      if (key) return { provider: id, apiKey: key };
    }
    return { provider: "claude", apiKey: "" };
  }
  if (preferred && KEYLESS_PROVIDERS.has(preferred)) {
    return { provider: preferred, apiKey: "" };
  }
  if (preferred && YanaVault.hasKey(preferred)) {
    return { provider: preferred, apiKey: YanaVault.getKey(preferred) };
  }
  for (const id of order) {
    const key = YanaVault.getKey(id);
    if (key) return { provider: id, apiKey: key };
  }
  return { provider: "claude", apiKey: "" };
}
