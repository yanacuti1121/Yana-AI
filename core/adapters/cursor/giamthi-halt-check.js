#!/usr/bin/env node
// Cursor bridge for the watcher-owned GIAMTHI_HALT.lock.
//
// The independent watcher writes exactly one shared authority file at
// <project>/.claude/state/GIAMTHI_HALT.lock. This adapter is registered for
// every blocking Cursor event currently exposed by the host. It never clears
// the lock and has no environment-variable bypass.

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_REASON_BYTES = 1500;

function emit(permission, message) {
  const payload = { permission };
  if (message) {
    payload.user_message = message;
    payload.agent_message = message;
  }
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 0;
  } catch {
    process.exitCode = 2;
  }
}

function deny(message) {
  emit('deny', message);
}

function main() {
  const projectRoot =
    process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const lockPath = path.join(projectRoot, '.claude', 'state', 'GIAMTHI_HALT.lock');
  const quarantinePath = path.join(projectRoot, '.claude', 'state', 'GIAMTHI_QUARANTINE.json');

  let metadata;
  try {
    metadata = fs.lstatSync(lockPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      enforceQuarantine(quarantinePath);
      return;
    }
    deny(`Yana Giám thị could not inspect ${lockPath} — failing closed.`);
    return;
  }

  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    deny(`Yana Giám thị found an invalid halt lock at ${lockPath} — failing closed.`);
    return;
  }

  let reason;
  try {
    const handle = fs.openSync(lockPath, 'r');
    try {
      const buffer = Buffer.alloc(MAX_REASON_BYTES);
      const bytesRead = fs.readSync(handle, buffer, 0, buffer.length, 0);
      reason = buffer.subarray(0, bytesRead).toString('utf8').trim();
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    reason = '(halt lock exists but its reason could not be read)';
  }

  if (!reason) reason = '(halt lock exists with an empty reason)';
  deny(
    `Giám thị has halted Yana. Only a human may remove ${lockPath} after review. ` +
      `Reason: ${reason}`
  );
}

function enforceQuarantine(quarantinePath) {
  let record;
  try {
    const metadata = fs.lstatSync(quarantinePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      deny(`Yana Giám thị found invalid quarantine state at ${quarantinePath}.`);
      return;
    }
    record = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') emit('allow');
    else deny(`Yana Giám thị could not read ${quarantinePath} — failing closed.`);
    return;
  }
  const event = process.env.CURSOR_HOOK_EVENT || '';
  const denyEvent = !event || (record.mode === 'read-only'
    ? ['beforeShellExecution', 'beforeMCPExecution'].includes(event)
    : record.mode === 'no-shell'
      ? event === 'beforeShellExecution'
      : record.mode === 'no-network'
        ? event === 'beforeMCPExecution'
        : true);
  if (denyEvent) deny(`Giám thị quarantine '${record.mode}' blocked ${event || 'this Cursor action'}.`);
  else emit('allow');
}

process.on('uncaughtException', () => {
  deny('Yana Giám thị halt hook crashed unexpectedly — failing closed.');
});
process.on('unhandledRejection', () => {
  deny('Yana Giám thị halt hook rejected unexpectedly — failing closed.');
});

main();
