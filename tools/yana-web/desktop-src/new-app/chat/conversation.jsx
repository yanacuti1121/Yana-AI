import React from 'react';
import { L, YanaMark } from '../../components.jsx';
import { UserMessage } from './user-message.jsx';
import { YanaMessage } from './yana-message.jsx';

// Replaces the legacy MessageLog presentation entirely (visual parity
// pass) — full-width structured cards, not floating bubbles. Reuses only
// the `msgs` state shape useChatHistory/useChatSend already produce
// (Category A); UserMessage/YanaMessage are the new-app-owned
// presentation (Category C replacement).
export function Conversation({ logRef, msgs, thinking, emptyState }) {
  return (
    <div ref={logRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 4px 16px', minHeight: 0 }}>
      {msgs.length === 0 && !thinking && emptyState}
      {msgs.map((m, i) => (
        m.who === 'user'
          ? <UserMessage key={m._id || i} msg={m} />
          : <YanaMessage key={m._id || i} msg={m} />
      ))}
      {thinking && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          <YanaMark size={18} /> {L('Yana is thinking…', 'Yana đang suy nghĩ…', 'Yana가 생각 중…', 'Yana 正在思考…')}
        </div>
      )}
    </div>
  );
}

export function ScrollToBottomButton({ show, onClick }) {
  if (!show) return null;
  return (
    <button onClick={onClick} style={{
      position: 'absolute', bottom: 130, right: 24, width: 32, height: 32, borderRadius: 99,
      border: '1px solid var(--border)', background: 'var(--color-bg)',
      cursor: 'pointer', fontSize: 14, display: 'grid', placeItems: 'center',
      color: 'var(--color-text-muted)', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    }}>↓</button>
  );
}
