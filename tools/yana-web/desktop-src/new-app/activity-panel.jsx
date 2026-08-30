import React from 'react';
import { L } from '../components.jsx';
import { useActivityFeed } from './activity-source.mjs';

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Shared row renderer — used by both the docked live panel (below) and
// the full Activity History page (activity-history-view.jsx), so the
// "live vs verified" trust labeling stays defined in exactly one place.
export function ActivityRow({ ev, onSelect, selected }) {
  return (
    <div
      onClick={() => onSelect?.(ev)}
      style={{
        display: 'flex', gap: 8, padding: '4px 6px', fontSize: 'var(--font-size-sm)',
        cursor: onSelect ? 'pointer' : 'default', borderRadius: 'var(--r-sm)',
        background: selected ? 'var(--primary-soft)' : 'transparent',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{timeLabel(ev.timestamp)}</span>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 6,
        background: ev.kind === 'canonical' ? 'var(--good)' : 'var(--color-text-muted)',
      }} />
      <span style={{ color: 'var(--ink)', flex: 1, minWidth: 0 }}>
        {ev.label}
        {ev.source && ev.source !== 'runtime' && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{ev.source}</div>
        )}
      </span>
      {/* Explicit trust label per the architecture correction — this UI
          must never present an ephemeral, in-browser-only projection as
          if it were verified runtime evidence. */}
      {ev.kind === 'ephemeral-ui' ? (
        <span title={L(
          'Live UI projection, not verified runtime evidence',
          'Chiếu tạm thời trên UI, chưa phải bằng chứng runtime đã xác thực',
          '실시간 UI 표시일 뿐, 검증된 런타임 증거 아님',
          '仅为实时 UI 展示，非已验证的运行时证据',
        )} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 6px', flexShrink: 0 }}>
          live
        </span>
      ) : (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--good)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 6px', flexShrink: 0 }}>
          verified
        </span>
      )}
    </div>
  );
}

export function ActivityPanel({ onViewAll, onSelect, selectedId }) {
  const events = useActivityFeed();
  // The docked panel is a live glance, not the history browser — cap
  // what it shows to the most recent 50 even though useActivityFeed()
  // now returns up to 200 persisted events; the full list lives in the
  // Activity History page (onViewAll navigates there).
  const visible = events.slice(0, 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--ink)' }}>
          {L('Activity', 'Hoạt động', '활동', '活动')}
        </span>
        {onViewAll && (
          <button onClick={onViewAll} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
            {L('View all', 'Xem tất cả', '전체 보기', '查看全部')}
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
        {visible.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            {L('No activity yet.', 'Chưa có hoạt động nào.', '아직 활동 없음.', '暂无活动。')}
          </p>
        ) : (
          visible.map((ev) => (
            <ActivityRow key={ev.id} ev={ev} onSelect={onSelect} selected={selectedId === ev.id} />
          ))
        )}
      </div>
    </div>
  );
}
