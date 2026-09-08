export const AIRLLM_PROVIDER_ID = 'airllm';

export const LOCAL_PROVIDER_PREFERENCE = [
  'turbofieldfare',
  AIRLLM_PROVIDER_ID,
  'ollama',
  '9router',
  'lmstudio',
];

export function firstRunningLocalProvider(status) {
  return LOCAL_PROVIDER_PREFERENCE.find((providerId) => status?.[providerId]?.running) || '';
}

export function airLlmModelOptions(models) {
  return Array.isArray(models)
    ? models.filter((model) => typeof model === 'string' && model.length > 0).slice(0, 60)
    : [];
}
