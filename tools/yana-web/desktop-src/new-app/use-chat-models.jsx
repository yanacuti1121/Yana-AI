import React from 'react';
import { useChatModels } from '../pages/chat/use-chat-models.js';
import { AIRLLM_PROVIDER_ID, airLlmModelOptions } from './local-provider-config.mjs';
import { readCustomLocalModel, subscribeToCustomLocalModel } from './custom-local-model.mjs';

export function useNewAppChatModels(providerSel, tabModel = '') {
  const shared = useChatModels(providerSel, tabModel);
  const [airLlmModels, setAirLlmModels] = React.useState([]);
  const [customLocalModel, setCustomLocalModel] = React.useState(() => readCustomLocalModel());
  const [customModels, setCustomModels] = React.useState([]);
  const isAirLlm = shared.activeProvider === AIRLLM_PROVIDER_ID;
  const isCustomLocal = shared.activeProvider === 'custom';

  React.useEffect(() => subscribeToCustomLocalModel(() => setCustomLocalModel(readCustomLocalModel())), []);

  React.useEffect(() => {
    if (!isAirLlm || airLlmModels.length) return;
    fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: AIRLLM_PROVIDER_ID, key: '' }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const models = airLlmModelOptions(payload?.models?.map((model) => model?.id));
        if (models.length) setAirLlmModels(models);
      })
      .catch(() => {});
  }, [isAirLlm, airLlmModels.length]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isCustomLocal || !customLocalModel?.baseUrl) {
      setCustomModels([]);
      return undefined;
    }
    fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'custom', baseUrl: customLocalModel.baseUrl, customKeyless: true }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const models = payload?.models?.map((entry) => entry?.id).filter((entry) => typeof entry === 'string' && entry.length > 0).slice(0, 60);
        setCustomModels(models || []);
      })
      .catch(() => { if (!cancelled) setCustomModels([]); });
    return () => { cancelled = true; };
  }, [isCustomLocal, customLocalModel?.baseUrl]);

  if (!isAirLlm && !isCustomLocal) return { ...shared, customLocalModel };

  const providerId = isCustomLocal ? 'custom' : AIRLLM_PROVIDER_ID;
  const discoveredModels = isCustomLocal ? customModels : airLlmModels;
  const liveModels = discoveredModels.length
    ? { ...shared.liveModels, [providerId]: discoveredModels }
    : shared.liveModels;
  const modelOptions = discoveredModels;
  const activeModel = tabModel
    || shared.modelSel[providerId]
    || (isCustomLocal ? customLocalModel?.model : '')
    || discoveredModels[0]
    || '';

  return { ...shared, liveModels, modelOptions, activeModel, customLocalModel };
}
