import React from 'react';

// Roadmap Phase 4 item 14 — Structured Result Blocks. `result` is now
// real, live-derived data: use-chat-send.js's sendText() builds it via
// lib/runtime-progress.mjs's buildTurnResult(), from the SAME canonical
// tool_completed events ProgressCard's steps come from. Only ever set
// when the turn actually ran at least one command — a plain text-only
// reply never gets a ResultCard. `filesChanged` deliberately does not
// exist yet: it would need real Git-diff integration (roadmap Phase 7),
// not parsed-from-prose guessing (banned — see the Desktop handoff's
// rule 10), so this card only ever shows the command outcome counts it
// actually has.
export function ResultCard({ result }) {
  if (!result) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: '10px 14px', marginTop: 8, background: 'var(--color-bg-subtle)',
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: result.ok ? 'var(--good)' : 'var(--warn)',
        color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, flexShrink: 0,
      }}>{result.ok ? '✓' : '✗'}</span>
      <div>
        {result.summary && <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--ink)' }}>{result.summary}</div>}
        {result.note && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{result.note}</div>}
      </div>
    </div>
  );
}
