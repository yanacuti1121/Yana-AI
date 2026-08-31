import React from 'react';
import { ProgressCard } from './progress-card.jsx';
import { ResultCard } from './result-card.jsx';
import { MarkdownBody } from './markdown-body.jsx';

function timeLabel(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
        <MarkdownBody text={msg.text} />
        <ProgressCard steps={msg.steps} />
        <ResultCard result={msg.result} />
      </div>
    </div>
  );
}
