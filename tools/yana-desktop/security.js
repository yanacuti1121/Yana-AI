'use strict';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

function parsedUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isTrustedUrl(value, trustedOrigin) {
  const candidate = parsedUrl(value);
  const trusted = parsedUrl(trustedOrigin);
  return Boolean(candidate && trusted && candidate.origin === trusted.origin);
}

function isSafeExternalUrl(value) {
  const candidate = parsedUrl(value);
  return Boolean(candidate && SAFE_EXTERNAL_PROTOCOLS.has(candidate.protocol));
}

function isTrustedIpcSender(event, trustedOrigin) {
  return isTrustedUrl(event?.senderFrame?.url, trustedOrigin);
}

function normalizePtyStartOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('terminal options must be an object');
  }

  const cols = value.cols ?? 80;
  const rows = value.rows ?? 24;
  if (!Number.isInteger(cols) || cols < 20 || cols > 500) {
    throw new TypeError('terminal cols must be an integer between 20 and 500');
  }
  if (!Number.isInteger(rows) || rows < 5 || rows > 300) {
    throw new TypeError('terminal rows must be an integer between 5 and 300');
  }

  const args = value.args ?? [];
  if (!Array.isArray(args) || args.length > 64) {
    throw new TypeError('terminal args must be an array with at most 64 entries');
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0')) {
      throw new TypeError('terminal args must be NUL-free strings up to 8192 characters');
    }
  }

  return { cols, rows, args: [...args] };
}

function normalizePtyInput(value) {
  if (typeof value !== 'string') throw new TypeError('terminal input must be a string');
  if (value.length > 1_048_576 || value.includes('\0')) {
    throw new TypeError('terminal input must be NUL-free and at most 1 MiB');
  }
  return value;
}

module.exports = {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyStartOptions,
};
