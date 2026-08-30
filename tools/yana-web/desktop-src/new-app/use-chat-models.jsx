import React from 'react';
import { useChatModels } from '../pages/chat/use-chat-models.js';
import { AIRLLM_PROVIDER_ID, airLlmModelOptions } from './local-provider-config.mjs';

export function useNewAppChatModels(providerSel) {
  const shared = useChatModels(providerSel);
  const [airLlmModels, setAirLlmModels] = React.useState([]);
  const isAirLlm = shared.activeProvider === AIRLLM_PROVIDER_ID;

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

  if (!isAirLlm) return shared;

  const liveModels = airLlmModels.length
    ? { ...shared.liveModels, [AIRLLM_PROVIDER_ID]: airLlmModels }
    : shared.liveModels;
  const modelOptions = airLlmModels;
  const activeModel = shared.modelSel[AIRLLM_PROVIDER_ID]
    || airLlmModels[0]
    || '';

  return { ...shared, liveModels, modelOptions, activeModel };
}
