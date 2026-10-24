#!/usr/bin/env node
// Yana AI — Antigravity PreToolUse bridge (Giám thị halt + destructive guard).
//
// Thin translator ONLY, same split as core/adapters/cursor/: the watcher-owned
// .claude/state/GIAMTHI_HALT.lock decides "is Yana halted", and
// core/hooks/guard-destructive.sh decides "is this command dangerous". This
// file must never grow destructive-pattern logic of its own.
//
// Contract, from antigravity.google/docs/hooks (checked 2026-10-22):
// - stdin JSON carries `workspacePaths` and `toolCall` ({ name, args }); the
//   shell tool is `run_command` with the command in `args.CommandLine`.
// - stdout JSON `{ "decision": "allow" | "deny", "reason": ... }`; "deny"
//   hard-blocks the tool call. Exit codes are not documented, so every
//   outcome here is exit 0 with an explicit decision, and every internal
//   error is a deny (fail closed).
// Any tool call whose args carry a command-like string is screened, named
// or not: Antigravity can send the nameless-with-args form (noted by
// Dicklesworthstone/destructive_command_guard, which handles the same
// envelope).
//
// Trust: the guard is found relative to this file and runs with a fixed
// PATH; workspacePaths are only used to look for Giám thị halt/quarantine
// state, and every root is checked (plus this adapter's own project).
//
// Known limits: `agy --dangerously-skip-permissions` is reported to skip
// the hook layer entirely. File-write tools are not screened, so an agent
// can still edit .agents/hooks.json or delete a halt lock with them.
//
// No YANA_*_BYPASS env var, deliberately: see the matching note in
// core/adapters/cursor/before-shell-execution.js.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MAX_STDIN_BYTES = 10 * 1024 * 1024;
const MAX_REASON_BYTES = 1500;
const GUARD_TIMEOUT_MS = 15000;

function emit(decision, reason) {
  const payload = { decision };
  if (reason) payload.reason = reason;
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 0;
  } catch {
    process.exitCode = 2;
  }
}

function deny(reason) {
  emit('deny', reason);
}

process.on('uncaughtException', () => deny('Yana AI Antigravity guard crashed unexpectedly — failing closed.'));
process.on('unhandledRejection', () => deny('Yana AI Antigravity guard rejected unexpectedly — failing closed.'));

// The project this adapter was installed into, derived from where the adapter
// lives (never from input or env): <project>/.agents/hooks/ for an install,
// <checkout>/core/adapters/antigravity/ inside a Yana checkout.
function adapterProjectRoot() {
  const installed = path.basename(__dirname) === 'hooks' && path.basename(path.dirname(__dirname)) === '.agents';
  return path.resolve(__dirname, installed ? '../..' : '../../..');
}

// Every workspace root Antigravity reports, plus the adapter's own project, so
// a missing or partial workspacePaths can never skip the halt check.
function workspaceRoots(input) {
  const reported = Array.isArray(input.workspacePaths) ? input.workspacePaths : [];
  const roots = reported.filter((p) => typeof p === 'string' && p.length > 0).map((p) => path.resolve(p));
  roots.push(adapterProjectRoot());
  return [...new Set(roots)];
}

// Returns a deny reason when Giám thị has halted or quarantined Yana, else null.
function haltReason(root) {
  const stateDir = path.join(root, '.claude', 'state');
  const lockPath = path.join(stateDir, 'GIAMTHI_HALT.lock');
  let meta;
  try {
    meta = fs.lstatSync(lockPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return quarantineReason(path.join(stateDir, 'GIAMTHI_QUARANTINE.json'));
    return `Yana Giám thị could not inspect ${lockPath} — failing closed.`;
  }
  if (meta.isSymbolicLink() || !meta.isFile()) {
    return `Yana Giám thị found an invalid halt lock at ${lockPath} — failing closed.`;
  }
  let text = '';
  try {
    const handle = fs.openSync(lockPath, 'r');
    try {
      const buffer = Buffer.alloc(MAX_REASON_BYTES);
      text = buffer.subarray(0, fs.readSync(handle, buffer, 0, buffer.length, 0)).toString('utf8').trim();
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    text = '(halt lock exists but its reason could not be read)';
  }
  return `Giám thị has halted Yana. Only a human may remove ${lockPath} after review. Reason: ${text || '(empty reason)'}`;
}

// Antigravity tool names beyond run_command are not mapped to quarantine
// modes yet, so any quarantine record blocks every tool call (stricter than
// the Cursor adapter's per-event mapping, never looser).
function quarantineReason(quarantinePath) {
  try {
    const meta = fs.lstatSync(quarantinePath);
    if (meta.isSymbolicLink() || !meta.isFile()) return `Yana Giám thị found invalid quarantine state at ${quarantinePath}.`;
    const record = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
    return `Giám thị quarantine '${record && record.mode}' blocks Antigravity tool calls until a human lifts it.`;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    return `Yana Giám thị could not read ${quarantinePath} — failing closed.`;
  }
}

// guard-destructive.sh is resolved relative to this adapter only: next to it
// (installed copy in .agents/hooks) or ../../hooks (core/hooks in a Yana
// checkout). Never from workspacePaths: a repo opened in Antigravity could
// otherwise ship its own core/hooks/guard-destructive.sh that exits 0.
const GUARD_CANDIDATES = [
  path.join(__dirname, 'guard-destructive.sh'),
  path.resolve(__dirname, '../../hooks/guard-destructive.sh'),
];

function findGuard() {
  for (const candidate of GUARD_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next location */
    }
  }
  return null;
}

// Fixed PATH so a yana-rt or jq planted earlier in the user's PATH (a project
// .envrc, node_modules/.bin) cannot stand in for the guard's own tools.
const GUARD_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin',
  HOME: process.env.HOME || '',
  LANG: 'C.UTF-8',
});

// Returns a deny reason when guard-destructive.sh blocks the command, else null.
function guardReason(command) {
  const guardPath = findGuard();
  if (!guardPath) {
    return `Yana AI guard: destructive-command guard is missing next to ${__dirname} — failing closed.`;
  }
  const result = spawnSync('bash', [guardPath], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    shell: false,
    env: GUARD_ENV,
    timeout: GUARD_TIMEOUT_MS,
    maxBuffer: MAX_STDIN_BYTES,
  });
  if (result.error) {
    const detail = result.error.code === 'ETIMEDOUT' ? 'guard timed out after 15s' : `spawn error: ${result.error.message}`;
    return `Yana AI guard: ${detail} — failing closed.`;
  }
  if (result.signal) return `Yana AI guard: guard was terminated (signal ${result.signal}) — failing closed.`;
  if (result.status === 0) return null;
  if (result.status === 2) {
    try {
      const r = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      if (typeof r === 'string' && r.length > 0) return r;
    } catch {
      /* fall through to the generic reason */
    }
    return 'Blocked by Yana AI destructive-command guard.';
  }
  return `Yana AI guard: guard exited with unexpected status ${result.status} — failing closed.`;
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (e) {
    deny(`Yana AI guard: could not read Antigravity hook input (${e.message}) — failing closed.`);
    return;
  }
  if (raw.length > MAX_STDIN_BYTES) {
    deny('Yana AI guard: Antigravity hook input exceeded the size cap — failing closed.');
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    deny('Yana AI guard: received malformed input from Antigravity — failing closed.');
    return;
  }
  if (!input || typeof input !== 'object') {
    deny('Yana AI guard: Antigravity hook input is not an object — failing closed.');
    return;
  }

  for (const root of workspaceRoots(input)) {
    const halted = haltReason(root);
    if (halted) {
      deny(halted);
      return;
    }
  }

  const toolCall = input.toolCall && typeof input.toolCall === 'object' ? input.toolCall : {};
  const args = toolCall.args && typeof toolCall.args === 'object' ? toolCall.args : {};
  const commands = commandsToScreen(toolCall.name, args);
  if (toolCall.name === 'run_command' && commands.length === 0) {
    deny('Yana AI guard: run_command arrived without a command to screen — failing closed.');
    return;
  }
  for (const command of commands) {
    const blocked = guardReason(command);
    if (blocked) {
      deny(blocked);
      return;
    }
  }
  emit('allow');
}

// Shell-like strings in a tool call. run_command uses CommandLine; the other
// keys and the name pattern cover tools whose schema this adapter has not
// seen, so an unfamiliar shell tool is screened instead of waved through.
const COMMAND_KEYS = ['CommandLine', 'commandLine', 'command', 'Command', 'cmd'];
const SHELL_TOOL_NAME = /command|shell|terminal|exec/i;

function commandsToScreen(name, args) {
  const found = COMMAND_KEYS.filter((key) => typeof args[key] === 'string').map((key) => args[key]);
  if (typeof name === 'string' && SHELL_TOOL_NAME.test(name)) {
    for (const value of Object.values(args)) {
      if (typeof value === 'string' && !found.includes(value)) found.push(value);
    }
  }
  return found;
}

main();
