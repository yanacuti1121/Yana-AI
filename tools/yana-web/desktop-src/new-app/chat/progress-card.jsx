import React from 'react';

// Roadmap Phase 4 item 15 — Canonical Progress. `steps` is now real,
// live-derived data: use-chat-send.js's sendText() builds it per-turn via
// lib/runtime-progress.mjs's buildProgressSteps(), fed by the SAME
// canonical RuntimeEvent stream Activity uses (STEP 3) — this component
// still invents nothing, it only renders what that pure function
// returns. `status` is one of 'pending' | 'active' | 'done' | 'failed'
// (denied/blocked commands render as 'failed', not silently as
// 'pending' — a blocked step already happened, it did not simply not
// start yet).
const ICON = { done: '✓', active: '◉', failed: '✗', pending: '○' };
const COLOR = { done: 'var(--good)', active: 'var(--primary)', failed: 'var(--warn)', pending: 'var(--color-text-muted)' };

export function ProgressCard({ steps }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginTop: 8 }}>
      {steps.map((step, i) => (
        <div key={step.callId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 'var(--font-size-sm)' }}>
          <span style={{ color: COLOR[step.status] || COLOR.pending }}>{ICON[step.status] || ICON.pending}</span>
          <span style={{ color: step.status === 'pending' ? 'var(--color-text-muted)' : 'var(--ink)' }}>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
