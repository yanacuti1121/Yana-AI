import React from 'react';
import { MarkdownBubble } from '../../pages/chat/message.jsx';
import { ProgressCard } from './progress-card.jsx';
import { ResultCard } from './result-card.jsx';

function timeLabel(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Full-width structured workspace card — replaces the legacy chat bubble.
// Reuses MarkdownBubble (pure markdown+DOMPurify+syntax-highlight
// rendering, Category B) for the actual text body rather than
// reimplementing markdown sanitization by hand. `steps`/`result` are
// undefined for every real message today (see progress-card.jsx/
// result-card.jsx's own doc comments) — both slots render nothing until
// real data exists.
export function YanaMessage({ msg }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {/* Simple temporary mark, not the outdated mascot — see sidebar.jsx's
          own note on why docs/yana-logo.png isn't usable at this size. */}
      <span style={{
        width: 22, height: 22, borderRadius: 6, background: 'var(--primary)', color: '#fff',
        display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
      }}>Y</span>
      <div style={{
        flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        padding: '10px 14px', background: 'var(--color-bg-subtle)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--ink)' }}>Yana</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{timeLabel(msg._id)}</span>
        </div>
        <MarkdownBubble text={msg.text} />
        <ProgressCard steps={msg.steps} />
        <ResultCard result={msg.result} />
      </div>
    </div>
  );
}
