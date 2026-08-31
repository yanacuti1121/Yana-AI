import assert from 'node:assert/strict';
import {
  CUSTOM_LOCAL_MODEL_STORAGE_KEY,
  customLocalProviderDescriptor,
  readCustomLocalModel,
  saveCustomLocalModel,
  validateCustomLocalModel,
} from './custom-local-model.mjs';

const valid = {
  baseUrl: 'http://127.0.0.1:8080/v1/chat/completions',
  model: 'qwen-local',
  label: 'Qwen on my Mac',
};

assert.equal(validateCustomLocalModel(valid).ok, true);
assert.equal(validateCustomLocalModel({ ...valid, baseUrl: 'http://192.168.1.2/v1/chat/completions' }).ok, false);
assert.equal(validateCustomLocalModel({ ...valid, baseUrl: 'http://localhost:8080/v1' }).ok, false);
assert.equal(validateCustomLocalModel({ ...valid, baseUrl: 'http://user:secret@localhost:8080/v1/chat/completions' }).ok, false);
assert.equal(validateCustomLocalModel({ ...valid, model: '' }).ok, false);

const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
const saved = saveCustomLocalModel(valid, storage);
assert.equal(saved.ok, true);
assert.deepEqual(readCustomLocalModel(storage), saved.value);
assert.equal(JSON.parse(values.get(CUSTOM_LOCAL_MODEL_STORAGE_KEY)).model, 'qwen-local');
assert.equal(customLocalProviderDescriptor(saved.value).id, 'custom');

console.log('new-app custom local model: 9/9 PASS');
