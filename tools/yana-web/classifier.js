'use strict';

// Keyword tables mirroring src/route.rs semantics
const EXTERNAL_SIGNALS = [
  'git push', 'cargo publish', 'npm publish', 'deploy',
  'send email', 'send message', 'webhook', 'api call',
  'rm -rf', 'production',
];

const COMPLEX_SIGNALS = [
  'implement', 'refactor', 'sửa bug', 'fix bug',
  'add feature', 'create', 'build', 'migrate',
  'test', 'debug',
];

function findMatches(task, signals) {
  const lower = task.toLowerCase();
  return signals.filter(s => lower.includes(s.toLowerCase()));
}

function pickAgents(matchedSignals) {
  for (const s of matchedSignals) {
    if (s === 'test' || s === 'debug') return ['qa-engineer'];
  }
  return ['backend-developer', 'code-reviewer'];
}

/**
 * classify(task) → decision object matching Context #2 schema
 * Handles ASCII and Vietnamese input (no non-ASCII stripping).
 */
function classify(task) {
  if (typeof task !== 'string') task = String(task || '');

  // Check EXTERNAL first (higher precedence)
  const extMatches = findMatches(task, EXTERNAL_SIGNALS);
  if (extMatches.length > 0) {
    return {
      route: 'external',
      gate: 'confirm',
      confidence: Math.min(0.6 + extMatches.length * 0.1, 0.95),
      reason: 'Task involves external side-effects or irreversible actions',
      matched_signals: extMatches,
      suggested_agents: ['security-engineer', 'deployment-engineer'],
    };
  }

  // Check COMPLEX
  const cplxMatches = findMatches(task, COMPLEX_SIGNALS);
  if (cplxMatches.length > 0) {
    return {
      route: 'complex',
      gate: 'harness',
      confidence: Math.min(0.6 + cplxMatches.length * 0.1, 0.95),
      reason: 'Task requires multi-step code changes or analysis',
      matched_signals: cplxMatches,
      suggested_agents: pickAgents(cplxMatches),
    };
  }

  // Default: simple
  return {
    route: 'simple',
    gate: 'auto',
    confidence: 0.5,
    reason: 'No complex or external signals detected',
    matched_signals: [],
    suggested_agents: [],
  };
}

module.exports = { classify };
