import assert from 'node:assert/strict';
import {
  AIRLLM_PROVIDER_ID,
  LOCAL_PROVIDER_PREFERENCE,
  airLlmModelOptions,
  firstRunningLocalProvider,
} from './local-provider-config.mjs';

assert.equal(AIRLLM_PROVIDER_ID, 'airllm');
assert.ok(LOCAL_PROVIDER_PREFERENCE.includes(AIRLLM_PROVIDER_ID));
assert.equal(firstRunningLocalProvider({ airllm: { running: true } }), 'airllm');
assert.equal(
  firstRunningLocalProvider({ airllm: { running: true }, turbofieldfare: { running: true } }),
  'turbofieldfare',
);
assert.equal(firstRunningLocalProvider({ airllm: { running: false } }), '');
assert.deepEqual(airLlmModelOptions(['Qwen/Qwen3-32B', '', null]), ['Qwen/Qwen3-32B']);
assert.deepEqual(airLlmModelOptions(null), []);

console.log('new-app local-provider-config: 6/6 PASS');
