import React from 'react';
import { L } from '../components.jsx';
import { useActivityFeed } from './activity-source.mjs';

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function trustLabel(kind) {
  return kind === 'ephemeral-ui'
    ? L('live', 'trực tiếp', '실시간', '实时')
    : L('verified', 'đã xác thực', '검증됨', '已验证');
}

function trustTitle(kind) {
  return kind === 'ephemeral-ui'
    ? L(
      'Live UI projection, not verified runtime evidence',
      'Chiếu tạm thời trên UI, chưa phải bằng chứng runtime đã xác thực',
      '실시간 UI 표시일 뿐, 검증된 런타임 증거 아님',
      '仅为实时 UI 展示，非已验证的运行时证据',
    )
    : L('Verified runtime evidence', 'Bằng chứng runtime đã xác thực', '검증된 런타임 증거', '已验证的运行时证据');
}

// Shared row renderer — used by both the docked live panel (below) and
// the full Activity History page (activity-history-view.jsx), so the
// "live vs verified" trust labeling stays defined in exactly one place.
export function ActivityRow({ ev, onSelect, selected }) {
  const interactive = Boolean(onSelect);
  const select = () => onSelect?.(ev);
  const onKeyDown = (event) => {
    if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    select();
  };

  return (
    <div
      className={`na-activity-row${selected ? ' is-selected' : ''}`}
      onClick={select}
      onKeyDown={onKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{
        display: 'flex', gap: 8, padding: '6px 6px', fontSize: 'var(--font-size-sm)',
        cursor: interactive ? 'pointer' : 'default', borderRadius: 'var(--r-sm)',
        background: selected ? 'var(--primary-soft)' : 'transparent',
      }}
    >
      <span className="na-activity-time" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{timeLabel(ev.timestamp)}</span>
      <span
        aria-hidden="true"
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 6,
          background: ev.kind === 'canonical' ? 'var(--good)' : 'var(--color-text-muted)',
        }}
      />
      <span style={{ color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
        {ev.source && ev.source !== 'runtime' && (
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.source}</span>
        )}
      </span>
      <span
        className={`na-activity-trust na-activity-trust-${ev.kind === 'canonical' ? 'verified' : 'live'}`}
        title={trustTitle(ev.kind)}
        style={{
          fontSize: 'var(--font-size-xs)', color: ev.kind === 'canonical' ? 'var(--good)' : 'var(--color-text-muted)',
          border: '1px solid var(--border)', borderRadius: 99, padding: '0 6px', flexShrink: 0, alignSelf: 'flex-start',
        }}
      >
        {trustLabel(ev.kind)}
      </span>
    </div>
  );
}

export function ActivityPanel({ onViewAll, onSelect, selectedId, limit = 50 }) {
  const events = useActivityFeed();
  const visible = events.slice(0, Math.max(0, limit));

  return (
    <section className="na-activity-panel" aria-label={L('Activity', 'Hoạt động', '활동', '活动')} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div className="na-activity-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--ink)' }}>
            {L('Activity', 'Hoạt động', '활동', '活动')}
          </span>
          <span className="na-activity-live-indicator" title={L('This panel updates from the live activity feed', 'Bảng này cập nhật từ luồng hoạt động trực tiếp', '이 패널은 실시간 활동 피드에서 업데이트됩니다', '此面板从实时活动流更新')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--good)' }} />
            {L('Live', 'Trực tiếp', '실시간', '实时')}
          </span>
        </div>
        {onViewAll && (
          <button className="na-inline-action" onClick={onViewAll} type="button" style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', flexShrink: 0 }}>
            {L('View all', 'Xem tất cả', '전체 보기', '查看全部')}
          </button>
        )}
      </div>
      <div className="na-activity-feed" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
        {visible.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            {L('No activity yet.', 'Chưa có hoạt động nào.', '아직 활동 없음.', '暂无活动。')}
          </p>
        ) : (
          visible.map((event) => (
            <ActivityRow key={event.id} ev={event} onSelect={onSelect} selected={selectedId === event.id} />
          ))
        )}
      </div>
    </section>
  );
}
