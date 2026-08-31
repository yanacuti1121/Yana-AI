import assert from 'node:assert/strict';
import { filterAgentCatalog, groupAgentsByCategory, normalizeAgentCatalog } from './agent-catalog.mjs';

const agents = normalizeAgentCatalog({
  total: 3,
  agents: [
    { name: 'rust-reviewer', description: 'Reviews Rust changes.', category: 'quality' },
    { name: 'planner', description: 'Plans safe implementation work.', category: 'planning' },
    { name: 'invalid' },
  ],
});

assert.deepEqual(agents, [
  { name: 'rust-reviewer', description: 'Reviews Rust changes.', category: 'quality' },
  { name: 'planner', description: 'Plans safe implementation work.', category: 'planning' },
]);
assert.deepEqual(normalizeAgentCatalog(null), []);
assert.deepEqual(filterAgentCatalog(agents, 'RUST'), [agents[0]]);
assert.deepEqual(filterAgentCatalog(agents, '', 'planning'), [agents[1]]);
assert.deepEqual(groupAgentsByCategory(agents), [['planning', [agents[1]]], ['quality', [agents[0]]]]);

console.log('agent-catalog tests passed: 5');
