import React from 'react';
import { L } from '../../components.jsx';

function timeLabel(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Full-width bordered card — replaces the legacy floating chat bubble
// (visual parity pass). Presentation only; `msg` comes from the same
// `msgs` state useChatHistory/useChatSend already produce.
export function UserMessage({ msg }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: '10px 14px', background: 'var(--color-bg-subtle)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--primary)' }}>{L('You', 'Bạn', '나', '你')}</span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{timeLabel(msg._id)}</span>
      </div>
      <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {msg.text}
      </div>
    </div>
  );
}
