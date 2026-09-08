import React from 'react';
import { L } from '../components.jsx';

// Honest placeholder for sidebar items not yet built in the new shell
// (Projects/Files/Tasks/Git/Activity full views = Phase 2; Devices/
// Models/Agents = Phase 3). No fake data, no fake controls — just an
// explicit "not here yet" state, per the architecture's own "hide the
// field or show an explicit unavailable state" rule.
export function ComingSoon({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
      <p style={{ fontSize: 'var(--font-size-base)' }}>
        {label} — {L('not yet available in the new app shell.', 'chưa có trong giao diện mới.', '새 앱 셸에서 아직 사용할 수 없습니다.', '新应用外壳中尚不可用。')}
      </p>
    </div>
  );
}
