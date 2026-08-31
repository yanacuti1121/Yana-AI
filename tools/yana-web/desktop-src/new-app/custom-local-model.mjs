// Configuration for a user-owned, OpenAI-compatible local inference server.
// This stores only a loopback endpoint and model id. Authentication material
// deliberately has no place in this module or in localStorage.
export const CUSTOM_LOCAL_MODEL_STORAGE_KEY = 'yana.custom-local-model.v1';
export const CUSTOM_LOCAL_MODEL_EVENT = 'yana:custom-local-model';

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function validModelId(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= 256
    && !/[\u0000-\u001f]/.test(value);
}

export function validateCustomLocalModel(input) {
  const baseUrl = typeof input?.baseUrl === 'string' ? input.baseUrl.trim() : '';
  const model = typeof input?.model === 'string' ? input.model.trim() : '';
  const label = typeof input?.label === 'string' ? input.label.trim() : '';

  if (!baseUrl) return { ok: false, error: 'Enter the local chat endpoint.' };
  let parsed;
  try { parsed = new URL(baseUrl); } catch (_) { return { ok: false, error: 'Enter a valid http or https URL.' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'The endpoint must use http or https.' };
  }
  if (!isLoopbackHost(parsed.hostname)) {
    return { ok: false, error: 'This local-model setup accepts only localhost endpoints.' };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { ok: false, error: 'Put no credentials, query parameters, or fragments in the endpoint URL.' };
  }
  if (!parsed.pathname.endsWith('/chat/completions')) {
    return { ok: false, error: 'Use the full OpenAI-compatible /chat/completions endpoint.' };
  }
  if (!validModelId(model)) return { ok: false, error: 'Enter a model id supplied by your local server.' };
  if (label.length > 80 || /[\u0000-\u001f]/.test(label)) {
    return { ok: false, error: 'The display name is invalid.' };
  }
  return {
    ok: true,
    value: {
      version: 1,
      baseUrl: parsed.toString(),
      model,
      label: label || 'My local AI',
    },
  };
}

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

export function readCustomLocalModel(storage) {
  const target = storageOrNull(storage);
  if (!target) return null;
  try {
    const parsed = JSON.parse(target.getItem(CUSTOM_LOCAL_MODEL_STORAGE_KEY) || 'null');
    const result = validateCustomLocalModel(parsed);
    return result.ok ? result.value : null;
  } catch (_) {
    return null;
  }
}

function announceChange() {
  try { globalThis.window?.dispatchEvent?.(new CustomEvent(CUSTOM_LOCAL_MODEL_EVENT)); } catch (_) {}
}

export function saveCustomLocalModel(input, storage) {
  const result = validateCustomLocalModel(input);
  if (!result.ok) return result;
  const target = storageOrNull(storage);
  if (!target) return { ok: false, error: 'Local preferences are unavailable.' };
  try {
    target.setItem(CUSTOM_LOCAL_MODEL_STORAGE_KEY, JSON.stringify(result.value));
    announceChange();
    return result;
  } catch (_) {
    return { ok: false, error: 'Could not save the local model preference.' };
  }
}

export function removeCustomLocalModel(storage) {
  const target = storageOrNull(storage);
  if (!target) return;
  try { target.removeItem(CUSTOM_LOCAL_MODEL_STORAGE_KEY); } catch (_) {}
  announceChange();
}

export function subscribeToCustomLocalModel(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CUSTOM_LOCAL_MODEL_EVENT, listener);
  return () => window.removeEventListener(CUSTOM_LOCAL_MODEL_EVENT, listener);
}

export function customLocalProviderDescriptor(config) {
  if (!config) return null;
  return {
    id: 'custom',
    name: config.label || 'My local AI',
    company: 'On-device direct',
    models: [config.model],
    role: `Private local server · ${new URL(config.baseUrl).host}`,
    desktopOnly: true,
  };
}
