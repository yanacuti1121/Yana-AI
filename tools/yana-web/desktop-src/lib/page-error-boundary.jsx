// Yana AI — per-page error boundary.
// Before this, an uncaught render error anywhere in a page (Chat, Settings,
// etc.) would white-screen the entire app, including the sidebar and nav —
// there was no boundary anywhere in the original app.jsx. React only
// supports error boundaries via class components (no hook equivalent as of
// React 18), so this is the one class component in the whole codebase.
import React from 'react';
import { L } from '../components.jsx';

export class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', this.props.pageId, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 'var(--gap)', maxWidth: 560 }}>
        <div className="glass" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--pad-card)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            {L('This page hit an error', 'Trang này gặp lỗi', '이 페이지에서 오류가 발생했습니다', '此页面出现错误')}
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            {L(
              'Try reloading. If it keeps happening, switch to another page from the sidebar.',
              'Thử tải lại trang. Nếu vẫn còn lỗi, hãy chuyển sang trang khác từ thanh bên.',
              '다시 로드해 보세요. 계속 발생하면 사이드바에서 다른 페이지로 이동하세요.',
              '请尝试重新加载。如果问题持续出现，请从侧边栏切换到其他页面。'
            )}
          </p>
          <button onClick={() => window.location.reload()} style={{
            padding: '7px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 500,
          }}>{L('Reload', 'Tải lại', '새로고침', '重新加载')}</button>
        </div>
      </div>
    );
  }
}
