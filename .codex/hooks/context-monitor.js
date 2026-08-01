#!/usr/bin/env node
// PostToolUse hook — context window monitor.
//
// Inspired by GSD's gsd-context-monitor.js. Warns Claude when the context
// window fills up so it can wrap up the current task or save state before
// quality degrades ("context rot").
//
// How it works:
//   1. Reads token_count from tool input metadata (if available)
//   2. Compares against Claude Code's context limit (200k tokens)
//   3. When remaining context drops below thresholds, injects a warning
//
// Thresholds:
//   WARNING  (remaining <= 35%): Wrap up current task soon
//   CRITICAL (remaining <= 20%): Stop immediately, save state, handoff
//
// Debounce: 5 tool uses between warnings to avoid spam.
// CRITICAL always fires immediately (bypasses debounce).
//
// Fails open on any error — never blocks a tool call.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONTEXT_LIMIT = 200000;      // Claude Code default context window
const WARNING_THRESHOLD = 35;      // remaining_percent <= 35%
const CRITICAL_THRESHOLD = 20;     // remaining_percent <= 20%
const DEBOUNCE_CALLS = 5;          // min tool uses between warnings

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id || 'default';

    // Reject path-traversal attempts in session ID
    if (/[/\\]|\.\./.test(sessionId)) process.exit(0);

    // State file — track debounce across tool calls in this session
    const stateFile = path.join(os.tmpdir(), `claude-ctx-${sessionId}.json`);
    let state = { lastWarnedAtCall: 0, lastSeverity: 'OK', callCount: 0 };
    try {
      if (fs.existsSync(stateFile)) {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      }
    } catch { /* use default */ }

    state.callCount = (state.callCount || 0) + 1;

    // Try to read token count from hook metadata (newer Claude Code versions)
    // Fallback: estimate from tool output size if available
    let tokenCount = null;
    if (data.metadata && typeof data.metadata.token_count === 'number') {
      tokenCount = data.metadata.token_count;
    } else if (data.tool_response && data.tool_response.output_tokens) {
      // Rough running estimate — not precise but useful as a canary
      state.estimatedTokens = (state.estimatedTokens || 0) + data.tool_response.output_tokens;
      tokenCount = state.estimatedTokens;
    }

    if (tokenCount === null) {
      // Cannot determine — save state and exit silently
      try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch {}
      process.exit(0);
    }

    const usedPercent = (tokenCount / CONTEXT_LIMIT) * 100;
    const remainingPercent = 100 - usedPercent;

    let severity = 'OK';
    if (remainingPercent <= CRITICAL_THRESHOLD) severity = 'CRITICAL';
    else if (remainingPercent <= WARNING_THRESHOLD) severity = 'WARNING';

    // Check debounce — but always fire on severity escalation
    const shouldFire = (
      severity !== 'OK' &&
      (severity !== state.lastSeverity ||
       (state.callCount - state.lastWarnedAtCall) >= DEBOUNCE_CALLS)
    );

    if (shouldFire) {
      state.lastWarnedAtCall = state.callCount;
      state.lastSeverity = severity;
      try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch {}

      let message;
      if (severity === 'CRITICAL') {
        message = `🚨 CONTEXT CRITICAL — ${remainingPercent.toFixed(0)}% remaining. ` +
          `STOP current work immediately. Run /handoff to save state, then start a fresh session. ` +
          `Quality will degrade sharply past this point (context rot).`;
      } else {
        message = `⚠️ Context usage high — ${remainingPercent.toFixed(0)}% remaining. ` +
          `Wrap up the current subtask soon. Consider running /brain-dump or /handoff ` +
          `before starting any new work to preserve context for the next session.`;
      }

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message
        }
      }));
    } else {
      try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch {}
    }
  } catch {
    // Fail open — never block tool calls
  }
  process.exit(0);
});
