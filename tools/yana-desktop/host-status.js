'use strict';

const { runRuntimeJson } = require('./runtime-json');

function validHostProfile(value) {
  return value
    && typeof value.os === 'string'
    && typeof value.arch === 'string'
    && value.cpu
    && Number.isInteger(value.cpu.logical_cores)
    && value.memory
    && Array.isArray(value.accelerators)
    && value.capabilities;
}

async function readHostStatus(options) {
  const result = await runRuntimeJson({
    ...options,
    args: ['os', 'host', 'status', '--json'],
  });
  if (!result.ok) return result;
  if (!validHostProfile(result.data)) {
    return { ok: false, error: 'yana-rt returned an invalid host profile' };
  }
  return { ok: true, host: result.data };
}

module.exports = { readHostStatus };
