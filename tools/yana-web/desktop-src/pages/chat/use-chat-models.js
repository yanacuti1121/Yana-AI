// Yana AI — Chat: active-provider/model derivation + live model-list fetch.
import React from 'react';
import { providerAvailable, getProviderConfig } from '../../lib/provider-config.js';
import { CHAT_MODELS, MODEL_CHOICES, CHAT_LIVE_MODELS, MODEL_STORE, loadModelChoices } from './model-select.js';

// Stable fallback reference — new-app's chat-workspace.jsx depends on
// `modelOptions` (below) in a useEffect. A `[]` literal in that fallback
// position would otherwise construct a brand-new array every render
// whenever a provider has neither live nor static model data, making the
// effect see a "changed" dependency on every single render — an
// unconditional infinite render loop (confirmed: pegged a CPU core
// continuously, reproduced fresh on every launch, unrelated to any CSS or
// GPU work — see chat-workspace.jsx's own comment on that effect).
const EMPTY_MODEL_OPTIONS = [];

// Providers whose whole catalog is vision-first (every current model reads
// images) — safe to trust at the provider level without inspecting the
// model id.
const ALWAYS_VISION_PROVIDERS = new Set(["claude", "gemini"]);
// Anh hit this live: groq's own DEFAULT model (llama-3.3-70b-versatile) is
// text-only, but the old check only looked at the provider, not the model
// — so attaching an image with that model selected reached Groq's API and
// came back "messages[3].content must be a string" (Groq rejecting the
// multimodal content-block shape a text-only model doesn't accept). Groq,
// OpenRouter, xAI and GLM each mix vision and text-only models under one
// provider, and OpenAI now does too since live model discovery can surface
// non-4o models — so those five need the model id itself inspected, not
// just the provider name. This is a real but inherently incomplete
// heuristic (provider catalogs change and this file has no live "is this
// specific id multimodal" source) — it defaults to false (no attach
// allowed) for anything it doesn't recognize, since a wrong "no" just
// blocks an attach a capable model could have taken, while a wrong "yes"
// reproduces the exact confusing upstream-rejection bug this exists to
// prevent.
const VISION_MODEL_PATTERN = /vision|llama-4|gpt-4o|gpt-4-turbo|glm-4v|-vl-/i;

function isVisionCapable(provider, model) {
  if (ALWAYS_VISION_PROVIDERS.has(provider)) return true;
  if (!["openai", "groq", "openrouter", "xai", "glm"].includes(provider)) return false;
  return VISION_MODEL_PATTERN.test(String(model || ""));
}

export function useChatModels(providerSel, tabModel = '') {
  const [modelSel, setModelSel] = React.useState(loadModelChoices);
  const [liveModels, setLiveModels] = React.useState({}); // providerId -> [ids]

  const activeProvider = providerSel || getProviderConfig().provider;
  const modelOptions = liveModels[activeProvider] || MODEL_CHOICES[activeProvider] || EMPTY_MODEL_OPTIONS;
  // Prefer the live-fetched first model over the static default when no
  // explicit user pick exists yet — the static CHAT_MODELS default (e.g.
  // "llama3.2" for Ollama) may not actually be installed, which caused a
  // 404 even though the dropdown showed the real installed models.
  const activeModel = tabModel || modelSel[activeProvider] || (liveModels[activeProvider] && liveModels[activeProvider][0]) || CHAT_MODELS[activeProvider] || (modelOptions[0] || "");

  const isVisionModel = (model) => isVisionCapable(activeProvider, model);

  // Same instability class as modelOptions above, for the same reason: a
  // plain function declaration is a new reference every render, and this
  // one is directly in chat-workspace.jsx's effect dependency array.
  const pickModel = React.useCallback((v) => {
    setModelSel((prev) => {
      const next = { ...prev, [activeProvider]: v };
      try { localStorage.setItem(MODEL_STORE, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, [activeProvider]);

  // Fetch the real model list when the provider supports it and is usable
  React.useEffect(() => {
    const id = activeProvider;
    if (!CHAT_LIVE_MODELS.has(id) || !providerAvailable(id) || liveModels[id]) return;
    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id, key: YanaVault.getKey(id) || "" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.models) && d.models.length) {
          setLiveModels((m) => ({ ...m, [id]: d.models.slice(0, 60).map((x) => x.id) }));
        }
      })
      .catch(() => {});
  }, [activeProvider]);

  return { modelSel, liveModels, activeProvider, modelOptions, activeModel, isVisionModel, pickModel };
}
