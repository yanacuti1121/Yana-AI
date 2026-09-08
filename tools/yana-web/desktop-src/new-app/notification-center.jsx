import React from 'react';
import { L } from '../components.jsx';
import { useNotifications } from './notification-source.mjs';

function BellIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.5 8.8a5.5 5.5 0 0 0-11 0c0 5.6-2 5.8-2 7.1h15c0-1.3-2-1.5-2-7.1Z" />
      <path d="M8 17.5c.4.6 1.1 1 2 1s1.6-.4 2-1" />
    </svg>
  );
}

function levelColor(level) {
  if (level === 'approval') return 'var(--primary)';
  if (level === 'error') return 'var(--bad)';
  return 'var(--warn)';
}

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false);
  const { notifications, unread, markAllRead, dismiss } = useNotifications();
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={L('Notifications', 'Thông báo', '알림', '通知')}
        aria-expanded={open}
        title={L('Notifications', 'Thông báo', '알림', '通知')}
        style={{
          position: 'relative', background: 'none', border: 'none', color: unread ? 'var(--primary)' : 'var(--color-text-muted)',
          cursor: 'pointer', display: 'flex', padding: 4,
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span aria-label={L(`${unread} unread`, `${unread} chưa đọc`, `${unread}개 읽지 않음`, `${unread} 条未读`)} style={{
            position: 'absolute', top: -3, right: -5, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 99,
            background: 'var(--primary)', color: 'white', fontSize: 9, fontWeight: 700, lineHeight: '14px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section aria-label={L('Notifications', 'Thông báo', '알림', '通知')} style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 'min(360px, calc(100vw - 24px))',
          maxHeight: 'min(440px, calc(100vh - 100px))', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg)',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)', zIndex: 20,
        }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
            <strong style={{ color: 'var(--ink)', fontSize: 'var(--font-size-sm)' }}>{L('Notifications', 'Thông báo', '알림', '通知')}</strong>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: 0 }}>
                {L('Mark all read', 'Đánh dấu đã đọc', '모두 읽음', '全部标为已读')}
              </button>
            )}
          </header>
          <div style={{ overflowY: 'auto', padding: 6 }}>
            {notifications.length === 0 ? (
              <p style={{ margin: '18px 10px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                {L('No notifications yet.', 'Chưa có thông báo.', '아직 알림이 없습니다.', '暂无通知。')}
              </p>
            ) : notifications.map((notice) => (
              <div key={notice.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 8px', borderRadius: 'var(--r-sm)', opacity: notice.read ? 0.68 : 1, background: notice.read ? 'transparent' : 'var(--color-bg-subtle)' }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, marginTop: 5, flexShrink: 0, borderRadius: '50%', background: levelColor(notice.level) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--ink)', fontSize: 'var(--font-size-sm)', fontWeight: notice.read ? 500 : 600 }}>{notice.title}</div>
                  <time style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{timeLabel(notice.timestamp)}</time>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(notice.id)}
                  aria-label={L('Dismiss notification', 'Xóa thông báo', '알림 닫기', '关闭通知')}
                  title={L('Dismiss', 'Xóa', '닫기', '关闭')}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 17, lineHeight: 1, cursor: 'pointer', padding: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
