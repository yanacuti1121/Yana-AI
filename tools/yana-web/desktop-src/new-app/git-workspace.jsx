import React from 'react';
import { L, Icons } from '../components.jsx';
import { ChangesView } from './changes-view.jsx';

// The desktop Git surface deliberately reuses ChangesView's IPC-backed
// diff/stage/unstage/commit actions. It is a human workspace, not an AI
// execution path: every mutation starts from an explicit user click.
export function GitWorkspace({ gitInfo, onRefreshGit }) {
  const repoRoot = gitInfo?.repoRoot || null;
  const files = gitInfo?.files || [];

  return (
    <div style={{ height: '100%', minWidth: 0, overflowY: 'auto', padding: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--ink)', fontSize: 'var(--font-size-xl)' }}>{Icons.gitBranch(20)} Git</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', overflowWrap: 'anywhere' }}>
            {repoRoot || L('Open a project to inspect its changes.', 'Mở một dự án để xem các thay đổi.', '변경 사항을 보려면 프로젝트를 여세요.', '打开项目以查看更改。')}
          </p>
        </div>
        <button type="button" onClick={onRefreshGit} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', font: 'inherit', fontSize: 'var(--font-size-xs)' }}>
          {L('Refresh', 'Làm mới', '새로고침', '刷新')}
        </button>
      </div>
      {gitInfo?.branch && <div style={{ marginBottom: 12, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Branch', 'Nhánh', '브랜치', '分支')}: <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{gitInfo.branch}</span></div>}
      <ChangesView repoRoot={repoRoot} files={files} onRefreshGit={onRefreshGit} />
    </div>
  );
}
