// Yana AI — HTML Maker: left-side template/skill picker panel
import React from 'react';
import { L } from '../components.jsx';

export function SkillPicker({ groups, search, setSearch, selectedSkill, setSelectedSkill }) {
  return (
    <div className="glass" style={{
      width: 248, flex: 'none',
      borderRadius: 'var(--r-lg)', padding: '12px',
      display: 'flex', flexDirection: 'column', gap: 8,
      overflowY: 'auto',
    }}>
      <input
        placeholder={L('Search…', 'Tìm…')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '7px 10px', boxSizing: 'border-box',
          borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--ink)',
          fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
      />

      {groups.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 4px' }}>
          {L('No templates found', 'Không tìm thấy mẫu')}
        </div>
      )}

      {groups.map(([cat, items]) => (
        <div key={cat}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '6px 4px 3px' }}>{cat}</div>
          {items.map(s => {
            const active = selectedSkill?.id === s.id;
            return (
              <button key={s.id} onClick={() => setSelectedSkill(s)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 8px', borderRadius: 'var(--r-sm)', textAlign: 'left',
                border: active ? '1px solid var(--primary)' : '1px solid transparent',
                background: active ? 'var(--primary-soft)' : 'transparent',
                cursor: 'pointer', color: 'var(--ink)', transition: 'background .1s',
              }}>
                <span style={{ fontSize: 17, flex: 'none', lineHeight: 1 }}>{s.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: active ? 500 : 400,
                    color: active ? 'var(--primary)' : 'var(--ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{s.enName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.zhName}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
