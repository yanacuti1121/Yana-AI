'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

const CONNECTOR_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ATTENTION = new Set(['signal', 'review', 'noise']);

function run(yanaRtBin, repoRoot, args, { exec, existsSync, timeout = 10_000 }) {
  if (!existsSync(yanaRtBin)) {
    return Promise.resolve({ ok: false, error: `yana-rt binary not found at ${yanaRtBin}` });
  }
  return new Promise((resolve) => {
    exec(yanaRtBin, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').trim();
        resolve({ ok: false, error: detail || 'yana-rt workspace command failed' });
        return;
      }
      resolve({ ok: true, stdout: String(stdout || '') });
    });
  });
}

function boundedString(value, field, maxLength, { optional = false } = {}) {
  if (optional && value == null) return null;
  if (typeof value !== 'string' || value.length > maxLength || (!optional && value.length === 0)) {
    throw new Error(`workspace resource ${field} is invalid`);
  }
  return value;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workspace resource metadata is invalid');
  }
  const entries = Object.entries(value);
  if (entries.length > 32) throw new Error('workspace resource metadata is not bounded');
  return Object.fromEntries(entries.map(([key, item]) => [
    boundedString(key, 'metadata key', 64),
    boundedString(item, 'metadata value', 2048, { optional: true }) || '',
  ]));
}

function normalizeWorkspaceResource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workspace resource is invalid');
  }
  const attention = boundedString(value.attention, 'attention', 32);
  if (!ATTENTION.has(attention)) throw new Error('workspace resource attention is invalid');
  return {
    id: boundedString(value.id, 'id', 256),
    kind: boundedString(value.kind, 'kind', 64),
    title: boundedString(value.title, 'title', 512),
    body: boundedString(value.body, 'body', 128 * 1024, { optional: true }) || '',
    attention,
    createdAt: boundedString(value.created_at, 'created timestamp', 64),
    updatedAt: boundedString(value.updated_at, 'updated timestamp', 64),
    metadata: normalizeMetadata(value.metadata),
  };
}

async function listWorkspaceResources({
  repoRoot,
  connector,
  limit = 100,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (connector != null && !CONNECTOR_NAME.test(connector)) {
    return { ok: false, error: 'connector name is invalid' };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return { ok: false, error: 'workspace resource limit must be 1..200' };
  }
  const result = await run(
    yanaRtBin,
    repoRoot,
    ['workspace', 'inbox', '--include-noise', '--json'],
    { exec, existsSync },
  );
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.length > 2_000) {
      throw new Error('workspace inbox is not a bounded array');
    }
    const resources = parsed
      .map(normalizeWorkspaceResource)
      .filter((resource) => connector == null || resource.metadata.connector === connector)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
    return { ok: true, resources };
  } catch (error) {
    return { ok: false, error: `workspace inbox returned invalid JSON: ${error.message}` };
  }
}

module.exports = { listWorkspaceResources, normalizeWorkspaceResource };
