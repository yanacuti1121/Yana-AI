'use strict';

const DESKTOP_RUNTIME_CONTRACT = Object.freeze({
  schemaVersion: 1,
  requiredCommands: Object.freeze(['chat', 'os', 'capability']),
  optionalFeatures: Object.freeze({
    discord: Object.freeze({ command: 'remote', included: false }),
    mcp: Object.freeze({ command: 'mcp', included: false }),
  }),
});

function parseRuntimeCommands(help) {
  if (typeof help !== 'string') return new Set();
  const commands = new Set();
  let inCommands = false;
  for (const line of help.split(/\r?\n/)) {
    if (/^Commands:\s*$/i.test(line.trim())) {
      inCommands = true;
      continue;
    }
    if (inCommands && /^Options:\s*$/i.test(line.trim())) break;
    if (!inCommands) continue;
    const match = line.match(/^\s{2,}([a-z][a-z0-9-]*)\s{2,}/i);
    if (match) commands.add(match[1].toLowerCase());
  }
  return commands;
}

function validateRuntimeHelp(help, contract = DESKTOP_RUNTIME_CONTRACT) {
  const commands = parseRuntimeCommands(help);
  if (commands.size === 0) {
    throw new Error('runtime help did not contain a parseable Commands section');
  }

  const missing = contract.requiredCommands.filter((command) => !commands.has(command));
  if (missing.length > 0) {
    throw new Error(`bundled runtime is missing required command(s): ${missing.join(', ')}`);
  }

  const optionalFeatures = {};
  for (const [feature, expectation] of Object.entries(contract.optionalFeatures)) {
    const available = commands.has(expectation.command);
    if (available !== expectation.included) {
      const expected = expectation.included ? 'included' : 'excluded';
      throw new Error(
        `bundled runtime feature mismatch for ${feature}: expected ${expected} command ${expectation.command}`,
      );
    }
    optionalFeatures[feature] = available;
  }

  return {
    schemaVersion: contract.schemaVersion,
    commandCount: commands.size,
    optionalFeatures,
  };
}

module.exports = { DESKTOP_RUNTIME_CONTRACT, parseRuntimeCommands, validateRuntimeHelp };
