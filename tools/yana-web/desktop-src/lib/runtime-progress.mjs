// Pure derivation from a turn's canonical RuntimeEvents (STEP 3 —
// src/chat/headless.rs's write_event()) into the two structured chat
// blocks the Desktop roadmap's Phase 4 calls for: a live progress
// checklist (ProgressCard) and a final outcome summary (ResultCard).
//
// No fabrication: every field here traces to a real `runtime_event`
// payload field (`call_id`, `tool`, `summary`, `ok`, `denied`). There is
// no file-change or test-outcome detection here — that would require
// either real Git-diff integration or parsing raw command output, and
// `ToolResultRecord::output` is deliberately excluded from the
// `runtime_event` payload upstream (see headless.rs's own doc comment).
// This module only ever reports what the lifecycle events themselves
// say: which commands ran, and whether each one succeeded, failed, or
// was blocked.

// events: RuntimeEvent[] for ONE turn only (caller resets the buffer per
// turn — see use-chat-send.js's sendText()). Returns [] when no tool
// calls occurred (a plain text-only reply).
export function buildProgressSteps(events) {
  const order = [];
  const byCallId = new Map();

  function upsert(callId, patch) {
    if (!byCallId.has(callId)) {
      order.push(callId);
      byCallId.set(callId, { callId, tool: null, label: '', status: 'pending' });
    }
    Object.assign(byCallId.get(callId), patch);
  }

  for (const ev of events) {
    if (!ev || typeof ev.kind !== 'string' || !ev.call_id) continue;
    switch (ev.kind) {
      case 'tool_requested':
      case 'human_approval_required':
        upsert(ev.call_id, { tool: ev.tool, label: ev.summary || ev.tool || 'command', status: 'pending' });
        break;
      case 'tool_approved':
        upsert(ev.call_id, { status: 'pending' });
        break;
      case 'tool_denied':
        upsert(ev.call_id, { status: 'failed' });
        break;
      case 'tool_started':
        upsert(ev.call_id, { status: 'active' });
        break;
      case 'tool_completed':
        upsert(ev.call_id, { status: ev.denied || !ev.ok ? 'failed' : 'done' });
        break;
      default:
        break;
    }
  }

  return order.map((id) => {
    const step = byCallId.get(id);
    return { callId: step.callId, label: step.label || step.tool || 'command', status: step.status };
  });
}

// events: same per-turn RuntimeEvent[]. Returns null when the turn ran
// no commands at all (the common case — most replies are plain text).
export function buildTurnResult(events) {
  const completions = events.filter((ev) => ev && ev.kind === 'tool_completed');
  if (completions.length === 0) return null;

  let done = 0, failed = 0, blocked = 0;
  for (const ev of completions) {
    if (ev.denied) blocked += 1;
    else if (ev.ok) done += 1;
    else failed += 1;
  }

  const total = completions.length;
  const ok = failed === 0 && blocked === 0;
  const summary = `${done}/${total} command${total === 1 ? '' : 's'} completed`;
  const noteParts = [];
  if (failed > 0) noteParts.push(`${failed} failed`);
  if (blocked > 0) noteParts.push(`${blocked} blocked`);

  return { ok, summary, note: noteParts.length > 0 ? noteParts.join(', ') : null };
}
