import assert from 'node:assert/strict';
import { summarizeConnections } from './connector-summary.mjs';

assert.deepEqual(summarizeConnections(null), { total: 0, ready: 0, attention: 0 });
assert.deepEqual(summarizeConnections([{ connectionState: 'ready' }, { connectionState: 'credential-required' }, { connectionState: 'disabled' }]), { total: 3, ready: 1, attention: 1 });
assert.deepEqual(summarizeConnections([{ status: 'ADAPTER-UNAVAILABLE' }, { status: 'failed' }]), { total: 2, ready: 0, attention: 2 });

console.log('connector-summary tests passed: 3');
