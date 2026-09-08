// Roadmap Phase 2 item 8 — Command Palette (⌘K). A real, minimal command
// REGISTRY (not a hardcoded list baked into the modal) so later real
// capabilities can register into the same array instead of a parallel
// mechanism being invented per feature.
import React from 'react';
import { L } from '../components.jsx';

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  if (!open) return null;

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: '90vw', background: 'var(--color-bg)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) { filtered[0].run(); onClose(); }
          }}
          placeholder={L('Type a command…', 'Gõ lệnh…', '명령 입력…', '输入命令…')}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px solid var(--border)',
            padding: '14px 16px', fontSize: 'var(--font-size-base)', background: 'transparent', color: 'var(--ink)', outline: 'none',
          }}
        />
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {L('No matching commands', 'Không tìm thấy lệnh', '일치하는 명령 없음', '没有匹配的命令')}
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { c.run(); onClose(); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'none', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                fontSize: 'var(--font-size-sm)', color: 'var(--ink)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
