import assert from 'node:assert';
import { buildProgressSteps, buildTurnResult } from './runtime-progress.mjs';

// --- buildProgressSteps ---

// No tool calls at all -> no steps (plain text-only reply).
assert.deepStrictEqual(buildProgressSteps([]), []);
assert.deepStrictEqual(buildProgressSteps([{ kind: 'turn_completed', tool_rounds: 0 }]), []);

// Full lifecycle for one call: requested -> approved -> started -> completed(ok)
{
  const events = [
    { kind: 'tool_requested', call_id: 'c1', tool: 'run_command', summary: 'cargo test' },
    { kind: 'tool_approved', call_id: 'c1' },
    { kind: 'tool_started', call_id: 'c1' },
    { kind: 'tool_completed', call_id: 'c1', ok: true, denied: false },
  ];
  assert.deepStrictEqual(buildProgressSteps(events), [
    { callId: 'c1', label: 'cargo test', status: 'done' },
  ]);
}

// Denied outright (no separate tool_completed needed) -> failed, not pending.
{
  const events = [
    { kind: 'tool_requested', call_id: 'c1', tool: 'run_command', summary: 'rm -rf /' },
    { kind: 'tool_denied', call_id: 'c1', reason: 'blocked' },
  ];
  assert.deepStrictEqual(buildProgressSteps(events), [
    { callId: 'c1', label: 'rm -rf /', status: 'failed' },
  ]);
}

// human_approval_required substitutes for tool_requested when no separate
// tool_requested event was emitted for that call — step still gets a real
// label from the event's own summary field, not a placeholder.
{
  const events = [
    { kind: 'human_approval_required', call_id: 'c1', tool: 'run_command', summary: 'git push --force', authority: 'X', reason: 'needs human' },
  ];
  assert.deepStrictEqual(buildProgressSteps(events), [
    { callId: 'c1', label: 'git push --force', status: 'pending' },
  ]);
}

// Still-running step (no tool_completed yet) stays 'active', not silently
// dropped or marked done.
{
  const events = [
    { kind: 'tool_requested', call_id: 'c1', tool: 'run_command', summary: 'cargo build' },
    { kind: 'tool_approved', call_id: 'c1' },
    { kind: 'tool_started', call_id: 'c1' },
  ];
  assert.deepStrictEqual(buildProgressSteps(events), [
    { callId: 'c1', label: 'cargo build', status: 'active' },
  ]);
}

// A completed-but-failed (not denied) command is 'failed', distinct from
// pending — a failed step already ran, it did not simply not start yet.
{
  const events = [
    { kind: 'tool_requested', call_id: 'c1', tool: 'run_command', summary: 'cargo test' },
    { kind: 'tool_started', call_id: 'c1' },
    { kind: 'tool_completed', call_id: 'c1', ok: false, denied: false },
  ];
  assert.deepStrictEqual(buildProgressSteps(events)[0].status, 'failed');
}

// Multiple calls in one turn preserve first-seen order.
{
  const events = [
    { kind: 'tool_requested', call_id: 'c1', tool: 'run_command', summary: 'a' },
    { kind: 'tool_requested', call_id: 'c2', tool: 'run_command', summary: 'b' },
    { kind: 'tool_completed', call_id: 'c1', ok: true, denied: false },
    { kind: 'tool_started', call_id: 'c2' },
  ];
  const steps = buildProgressSteps(events);
  assert.strictEqual(steps.length, 2);
  assert.strictEqual(steps[0].callId, 'c1');
  assert.strictEqual(steps[1].callId, 'c2');
}

// Malformed/missing call_id is ignored rather than throwing.
assert.deepStrictEqual(buildProgressSteps([{ kind: 'tool_requested' }, null, { not: 'an event' }]), []);

// --- buildTurnResult ---

// No tool calls -> null (plain text reply gets no ResultCard at all).
assert.strictEqual(buildTurnResult([]), null);
assert.strictEqual(buildTurnResult([{ kind: 'tool_requested', call_id: 'c1' }]), null);

// All completed successfully.
{
  const events = [
    { kind: 'tool_completed', call_id: 'c1', ok: true, denied: false },
    { kind: 'tool_completed', call_id: 'c2', ok: true, denied: false },
  ];
  assert.deepStrictEqual(buildTurnResult(events), { ok: true, summary: '2/2 commands completed', note: null });
}

// One failed, one blocked -> ok:false, note lists both.
{
  const events = [
    { kind: 'tool_completed', call_id: 'c1', ok: true, denied: false },
    { kind: 'tool_completed', call_id: 'c2', ok: false, denied: false },
    { kind: 'tool_completed', call_id: 'c3', ok: false, denied: true },
  ];
  assert.deepStrictEqual(buildTurnResult(events), { ok: false, summary: '1/3 commands completed', note: '1 failed, 1 blocked' });
}

// Singular phrasing for exactly one command.
{
  const events = [{ kind: 'tool_completed', call_id: 'c1', ok: true, denied: false }];
  assert.strictEqual(buildTurnResult(events).summary, '1/1 command completed');
}

console.log('runtime-progress tests passed: 12');
