// Yana AI — Chat: active-provider/model derivation + live model-list fetch.
import React from 'react';
import { providerAvailable, getProviderConfig } from '../../lib/provider-config.js';
import { CHAT_MODELS, MODEL_CHOICES, CHAT_LIVE_MODELS, MODEL_STORE, loadModelChoices } from './model-select.js';

export function useChatModels(providerSel) {
  const [modelSel, setModelSel] = React.useState(loadModelChoices);
  const [liveModels, setLiveModels] = React.useState({}); // providerId -> [ids]

  const activeProvider = providerSel || getProviderConfig().provider;
  const modelOptions = liveModels[activeProvider] || MODEL_CHOICES[activeProvider] || [];
  // Prefer the live-fetched first model over the static default when no
  // explicit user pick exists yet — the static CHAT_MODELS default (e.g.
  // "llama3.2" for Ollama) may not actually be installed, which caused a
  // 404 even though the dropdown showed the real installed models.
  const activeModel = modelSel[activeProvider] || (liveModels[activeProvider] && liveModels[activeProvider][0]) || CHAT_MODELS[activeProvider] || (modelOptions[0] || "");

  const isVisionModel = (_model) => ["claude", "openai", "gemini", "groq", "openrouter", "xai", "glm"].includes(activeProvider);

  function pickModel(v) {
    setModelSel((prev) => {
      const next = { ...prev, [activeProvider]: v };
      try { localStorage.setItem(MODEL_STORE, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }

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
