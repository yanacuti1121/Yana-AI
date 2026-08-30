import React from 'react';
import { L } from '../components.jsx';
import { useActivityFeed } from './activity-source.mjs';
import { ActivityRow } from './activity-panel.jsx';

// Roadmap Phase 3 item 12 — Activity History. The full-page counterpart
// to ActivityPanel's docked live glance: same data source
// (useActivityFeed, now backed by localStorage — see activity-source.mjs),
// same row rendering (ActivityRow), just the complete persisted list
// instead of the last-50 slice. No fake filters/search here — the
// roadmap explicitly calls for real data only, and there's no backing
// index to filter against yet.
export function ActivityHistoryView({ onSelect, selectedId }) {
  const events = useActivityFeed();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {L('Activity', 'Hoạt động', '활동', '活动')}
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          {L(
            'Full history of runtime and terminal activity, kept on this device.',
            'Lịch sử đầy đủ hoạt động runtime và terminal, lưu trên máy này.',
            '이 기기에 보관된 런타임 및 터미널 활동 전체 기록입니다.',
            '此设备保存的运行时与终端活动完整历史。',
          )}
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px' }}>
        {events.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            {L('No activity yet.', 'Chưa có hoạt động nào.', '아직 활동 없음.', '暂无活动。')}
          </p>
        ) : (
          events.map((ev) => (
            <ActivityRow key={ev.id} ev={ev} onSelect={onSelect} selected={selectedId === ev.id} />
          ))
        )}
      </div>
    </div>
  );
}
