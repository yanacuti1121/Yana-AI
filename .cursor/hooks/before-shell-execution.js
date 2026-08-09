#!/usr/bin/env node
// Yana AI — Cursor beforeShellExecution -> guard-destructive.sh bridge.
//
// Thin translator ONLY. core/hooks/guard-destructive.sh (542 lines, 4 rounds
// of adversarial review, MCP-payload-aware) is the single source of truth
// for "is this command dangerous" -- this file must never grow any
// destructive-pattern detection logic of its own. See
// core/rules/54-bft-consensus-law.md and the design this shipped with for
// why that split is deliberate and not open for reconsideration.
//
// Exit-code contract, verified against cursor.com/docs/hooks: exit 0 means
// Cursor reads the JSON `permission` field on stdout; exit 2 means block,
// but the docs never confirm whether exit 2's stdout is read for a message
// at all -- Cursor's own example denial script (block-git.sh) exits 0. So
// every message-bearing outcome here (allow, guard-destructive.sh's deny,
// every internal error) uses exit 0 with an explicit `permission` field.
// Exit 2 is reserved for the one case where even writing that JSON to
// stdout has failed. `.cursor/hooks.json`'s `failClosed: true` is the
// independent, Cursor-native safety net under all of this: if this script
// crashes, times out, or emits invalid JSON, Cursor blocks the action
// regardless of what happens below.
//
// Fully synchronous by design (readFileSync/spawnSync, no promises) so
// every exit path is verifiable by reading top to bottom, and so nothing
// can fire after the script believes it is done.
//
// No YANA_*_BYPASS env var (core/hooks/CLAUDE.md's usual convention for a
// blocking hook) is implemented here, deliberately, not by omission:
// guard-destructive.sh itself has none, and a bypass on a destructive-
// command guard is itself a weakening -- any process able to set an env
// var for this hook's invocation could then wave through rm -rf/force-push
// unchecked. If a bypass is ever genuinely wanted, it belongs in
// guard-destructive.sh so every engine (Cursor, and the Windsurf/Kiro/
// OpenCode/Codex translators planned to follow this same pattern) gets it
// uniformly, instead of 5 independently-implemented bypass mechanisms.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Matches the subprocess's own maxBuffer below -- defense-in-depth only
// (Cursor is the trusted, semi-controlled caller supplying this payload,
// not arbitrary network input), kept consistent for the same reason the
// subprocess call bounds its own output.
const MAX_STDIN_BYTES = 10 * 1024 * 1024;

// Writes the one and only JSON object Cursor will read, then lets Node
// exit naturally (no process.exit()) so the write is never raced by an
// immediate process teardown. `message`, when present, carries text that
// may originate from the user-supplied command or from
// guard-destructive.sh's reason string (which itself echoes the command)
// -- always goes through JSON.stringify, never string concatenation.
function emit(permission, message) {
  const payload = { permission };
  if (message) {
    payload.user_message = message;
    payload.agent_message = message;
  }
  try {
    process.stdout.write(JSON.stringify(payload) + '\n');
    process.exitCode = 0;
  } catch (e) {
    // Even stdout is broken -- nothing left to communicate on the
    // documented channel. This is the one and only path that reaches
    // exit 2; .cursor/hooks.json's failClosed:true is the real safety
    // net for this case, not anything below.
    try {
      process.stderr.write(`Yana AI Cursor guard: stdout write failed: ${e.message}\n`);
    } catch {
      /* nothing left to report to */
    }
    process.exitCode = 2;
  }
}

process.on('uncaughtException', () => {
  emit('deny', 'Yana AI Cursor guard crashed unexpectedly — failing closed.');
});
process.on('unhandledRejection', () => {
  emit('deny', 'Yana AI Cursor guard crashed unexpectedly — failing closed.');
});

// COMPLEXITY-EXCEPTION: exceeds agent-code-constraints.md's 50-line hard
// limit (and its 2x/100-line exception ceiling for documented cases) --
// this is a deliberate, reviewed exception (security-auditor + code-auditor
// pass, core/rules/54-bft-consensus-law.md), not an oversight. Every branch
// follows the identical shape "check one failure mode -> emit(deny) ->
// return", and the whole point of this file's fully-synchronous, linear
// design (see the header comment above) is that every exit path stays
// visible in one top-to-bottom read. Splitting this into named helpers
// would relocate the complexity behind indirection without reducing it,
// at real cost to that auditability goal for exactly the kind of
// security-critical sequential-gate code this is.
function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (e) {
    emit('deny', `Yana AI guard: could not read Cursor hook input (${e.message}) — failing closed.`);
    return;
  }

  if (raw.length > MAX_STDIN_BYTES) {
    emit('deny', 'Yana AI guard: Cursor hook input exceeded the size cap — failing closed.');
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    emit('deny', 'Yana AI guard: received malformed input from Cursor — failing closed.');
    return;
  }

  // No further validation beyond "is it a string" -- guard-destructive.sh
  // owns all semantic judgment about the command, including what an empty
  // command means. Re-implementing any of that here would violate the
  // single-source-of-truth split this file exists to preserve.
  const command = typeof input.command === 'string' ? input.command : '';

  // CURSOR_PROJECT_DIR is Cursor's documented project-root env var for
  // every hook process. CLAUDE_PROJECT_DIR is a verified Cursor-side
  // compatibility alias for the same value. process.cwd() is a last
  // resort (Cursor's docs state project hooks run with cwd = project
  // root anyway, so this should equal the same path in practice).
  const projectRoot =
    process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const guardPath = path.join(projectRoot, 'core', 'hooks', 'guard-destructive.sh');

  let stat = null;
  try {
    stat = fs.statSync(guardPath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    emit(
      'deny',
      `Yana AI guard: destructive-command guard is missing from this project ` +
        `(expected at ${guardPath}) — failing closed.`
    );
    return;
  }

  // tool_name is hardcoded to "Bash": beforeShellExecution has no MCP
  // concept (no tool_name in its input schema at all) -- Cursor's MCP
  // tool calls go through the separate beforeMCPExecution event, which
  // this translator does not handle. guard-destructive.sh only branches
  // on tool_name for its `mcp__*` deep-scan path; anything else,
  // including this literal string, already takes its plain
  // `.tool_input.command` path, so no MCP-awareness is lost here.
  const bridgeInput = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

  let result;
  try {
    result = spawnSync('bash', [guardPath], {
      input: bridgeInput,
      encoding: 'utf8',
      shell: false, // no shell interpolation -- guardPath is an executable, not a string to parse
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    emit(
      'deny',
      `Yana AI guard: failed to invoke the destructive-command guard (${e.message}) — failing closed.`
    );
    return;
  }

  // Verified empirically (Node v26.4.0, not assumed): a spawnSync timeout
  // sets BOTH result.error.code === 'ETIMEDOUT' AND result.signal ===
  // 'SIGTERM'. This branch runs first, so the timeout case gets the more
  // specific message below rather than falling through to the generic
  // "terminated unexpectedly" signal branch.
  if (result.error) {
    const detail =
      result.error.code === 'ETIMEDOUT'
        ? 'guard timed out after 15s'
        : `spawn error: ${result.error.message}`;
    emit('deny', `Yana AI guard: ${detail} — failing closed.`);
    return;
  }

  if (result.signal) {
    emit(
      'deny',
      `Yana AI guard: guard was terminated unexpectedly (signal ${result.signal}) — failing closed.`
    );
    return;
  }

  if (result.status === 0) {
    emit('allow');
    return;
  }

  if (result.status === 2) {
    // guard-destructive.sh's deny() always emits
    // {hookSpecificOutput:{hookEventName,permissionDecision,permissionDecisionReason}}
    // on exit 2 (confirmed by reading the script directly) -- this also
    // transparently forwards guard-destructive.sh's OWN internal
    // fail-closed denials (e.g. its jq-missing check), not just the
    // "genuinely destructive command" case.
    let reason = 'Blocked by Yana AI destructive-command guard.';
    try {
      const parsed = JSON.parse(result.stdout);
      const r = parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.permissionDecisionReason;
      if (typeof r === 'string' && r.length > 0) reason = r;
    } catch {
      const fallback = (result.stdout || '').trim() || (result.stderr || '').trim();
      if (fallback) reason = fallback;
    }
    emit('deny', reason);
    return;
  }

  // Any status guard-destructive.sh's own contract doesn't document (only
  // 0 and 2 are promised). Deliberately does NOT try to interpret an
  // unknown status as safe to allow -- guessing here would be exactly the
  // kind of silent fail-open this whole design exists to avoid.
  const stderrTail = (result.stderr || '').trim().slice(-500);
  emit(
    'deny',
    `Yana AI guard: guard exited with unexpected status ${result.status} — failing closed.` +
      (stderrTail ? ` (${stderrTail})` : '')
  );
}

main();
