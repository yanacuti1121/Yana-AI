// Yana Desktop — the "IDE" tab (relocated unchanged from desktop-src/
// terminal.jsx as part of the 2026-09-05 terminal rewrite; this panel
// wasn't implicated in either bug that rewrite addressed).
//
// Iframes/opens the bundled code-server instance (see main.js's
// startCodeServer/yana:ide-open) — a real VS Code, loopback-only,
// started on demand rather than at app launch.
import React from 'react';
import { L } from '../../components.jsx';

export function IdePanel({ active }) {
  const [state, setState] = React.useState({ status: 'idle', error: null });

  const openIde = React.useCallback(async () => {
    setState({ status: 'loading', error: null });
    const result = await window.yana?.ideOpen?.();
    if (result?.ok) setState({ status: 'opened', error: null });
    else setState({ status: 'error', error: result?.error || 'Desktop IDE bridge unavailable.' });
  }, []);

  React.useEffect(() => {
    if (active && state.status === 'idle') openIde();
  }, [active, openIde, state.status]);

  return (
    <div style={{ display: active ? 'flex' : 'none', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      {state.status === 'loading' && <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Starting local IDE in your browser…', 'Đang mở IDE cục bộ trong trình duyệt…', '브라우저에서 로컬 IDE 시작 중…', '正在浏览器中启动本地 IDE…')}</span>}
      {state.status === 'opened' && (
        <div style={{ maxWidth: 460, padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('IDE opened in your default browser. It runs only after you request it.', 'IDE đã mở trong trình duyệt mặc định. Nó chỉ chạy khi anh chủ động yêu cầu.', 'IDE가 기본 브라우저에서 열렸습니다. 요청할 때만 실행됩니다.', 'IDE 已在默认浏览器中打开，仅在您主动请求后运行。')}</p>
          <button type="button" onClick={openIde} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer' }}>{L('Open again', 'Mở lại', '다시 열기', '再次打开')}</button>
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ maxWidth: 460, padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--warn)', fontSize: 'var(--font-size-sm)', overflowWrap: 'anywhere' }}>{state.error}</p>
          <button type="button" onClick={openIde} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer' }}>{L('Retry', 'Thử lại', '다시 시도', '重试')}</button>
        </div>
      )}
    </div>
  );
}
