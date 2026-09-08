// Roadmap Phase 7 items 26-28 — Changes View, Git Inspector, Git Actions.
// Real data only: file list comes from git-status.js's own porcelain v2
// parse (see that file's own doc comment on the X/Y status letters).
// Stage/unstage/commit are human-initiated UI actions, NOT AI tool
// calls — see src/capability/git.rs's own doc comment on why these stay
// outside RuntimeAuthority (same trust tier as the human PTY).
import React from 'react';
import { L, Icons } from '../components.jsx';

const STATUS_LABEL = {
  M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Unmerged', '?': 'Untracked', '.': null,
};

function FileRow({ file, onSelect, selected, onStage, onUnstage, staging }) {
  const staged = file.indexStatus !== '.' && file.indexStatus !== '?';
  const label = STATUS_LABEL[file.indexStatus] || STATUS_LABEL[file.worktreeStatus] || file.kind;
  return (
    <div
      onClick={() => onSelect(file)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 'var(--r-sm)',
        cursor: 'pointer', fontSize: 'var(--font-size-sm)',
        background: selected === file.path ? 'var(--primary-soft)' : 'transparent',
      }}
    >
      <span style={{ width: 16, flexShrink: 0, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: staged ? 'var(--good)' : 'var(--color-text-muted)' }}>
        {file.indexStatus !== '.' ? file.indexStatus : file.worktreeStatus}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }} title={`${file.path} (${label})`}>
        {file.path}
      </span>
      <button
        disabled={staging}
        onClick={(e) => { e.stopPropagation(); (staged ? onUnstage : onStage)(file.path); }}
        title={staged ? L('Unstage', 'Bỏ stage', '스테이지 취소', '取消暂存') : L('Stage', 'Stage', '스테이지', '暂存')}
        style={{
          flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          padding: '1px 6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: staging ? 'default' : 'pointer',
        }}
      >
        {staged ? '−' : '+'}
      </button>
    </div>
  );
}

export function ChangesView({ repoRoot, files, onRefreshGit }) {
  const [selected, setSelected] = React.useState(null);
  const [diff, setDiff] = React.useState(null);
  const [staging, setStaging] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [commitMsg, setCommitMsg] = React.useState(null);

  const list = files || [];
  const stagedFiles = list.filter((f) => f.indexStatus !== '.' && f.indexStatus !== '?');

  function onSelect(file) {
    setSelected(file.path);
    setDiff({ loading: true });
    const staged = file.indexStatus !== '.' && file.indexStatus !== '?';
    window.yana.gitDiffPath(file.path, staged).then((result) => {
      setDiff(result.ok ? { output: result.output } : { error: result.error });
    });
  }

  async function onStage(path) {
    setStaging(true);
    await window.yana.gitStage([path]);
    setStaging(false);
    onRefreshGit?.();
  }

  async function onUnstage(path) {
    setStaging(true);
    await window.yana.gitUnstage([path]);
    setStaging(false);
    onRefreshGit?.();
  }

  async function onCommit() {
    if (!message.trim()) return;
    setCommitMsg({ loading: true });
    const result = await window.yana.gitCommit(message);
    if (result.ok) {
      setMessage('');
      setDiff(null);
      setSelected(null);
      onRefreshGit?.();
    }
    setCommitMsg(result);
  }

  if (!repoRoot) {
    return <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('No project open.', 'Chưa mở dự án.', '열려 있는 프로젝트가 없습니다.', '未打开项目。')}</p>;
  }

  if (list.length === 0) {
    return <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('No changes.', 'Không có thay đổi.', '변경 사항 없음.', '没有更改。')}</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {list.map((f) => (
          <FileRow key={f.path} file={f} onSelect={onSelect} selected={selected} onStage={onStage} onUnstage={onUnstage} staging={staging} />
        ))}
      </div>

      {diff && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px', maxHeight: 220, overflow: 'auto' }}>
          {diff.loading ? (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
          ) : diff.error ? (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)', margin: 0 }}>{diff.error}</p>
          ) : (
            <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink)' }}>{diff.output || L('(empty diff)', '(diff rỗng)', '(빈 diff)', '（空差异）')}</pre>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={L('Commit message…', 'Nội dung commit…', '커밋 메시지…', '提交信息…')}
          rows={2}
          style={{
            width: '100%', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--ink)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', resize: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={onCommit}
          disabled={!message.trim() || stagedFiles.length === 0 || commitMsg?.loading}
          title={stagedFiles.length === 0 ? L('Stage a file first', 'Stage 1 tệp trước', '먼저 파일을 스테이지하세요', '请先暂存一个文件') : undefined}
          style={{
            marginTop: 6, width: '100%', background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 'var(--r-sm)', padding: '6px 0', fontSize: 'var(--font-size-sm)',
            cursor: message.trim() && stagedFiles.length > 0 ? 'pointer' : 'default',
            opacity: message.trim() && stagedFiles.length > 0 ? 1 : 0.5,
          }}
        >
          {L(`Commit ${stagedFiles.length} file(s)`, `Commit ${stagedFiles.length} tệp`, `${stagedFiles.length}개 파일 커밋`, `提交 ${stagedFiles.length} 个文件`)}
        </button>
        {commitMsg && !commitMsg.loading && !commitMsg.ok && (
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)', marginTop: 4 }}>{commitMsg.error}</p>
        )}
      </div>
    </div>
  );
}
