// Roadmap Phase 8 — Tasks. Reuses the existing Yana task model
// (.yana-ai/tasks.json, the SAME store `yana-rt task` already manages) —
// no second, frontend-only todo system. Items 31-32 (Task <-> Chat,
// Task <-> Activity/Evidence) are NOT built here: there is no real
// producer yet that links a task to a specific chat turn or Activity
// event (that needs Phase-4-style event correlation this store doesn't
// carry), so this view only does what's real today: list, create,
// mark done with evidence, drop.
import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';

const STATUS_ICON = { open: '○', in_progress: '◉', done: '✓', blocked: '✗' };
const STATUS_COLOR = { open: 'var(--color-text-muted)', in_progress: 'var(--primary)', done: 'var(--good)', blocked: 'var(--warn)' };

function TaskRow({ task, onComplete, onDrop, busy }) {
  const [evidence, setEvidence] = React.useState('');
  const [completing, setCompleting] = React.useState(false);
  const isOpen = task.status !== 'done';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: STATUS_COLOR[task.status] || 'var(--color-text-muted)', flexShrink: 0 }}>{STATUS_ICON[task.status] || '○'}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-sm)', color: 'var(--ink)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.name}</span>
        {task.scope && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 6px', flexShrink: 0 }}>{task.scope}</span>}
        {isOpen && (
          <button
            onClick={() => onDrop(task.id)}
            disabled={busy}
            title={L('Remove task', 'Xoá task', '작업 삭제', '删除任务')}
            style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: 'var(--color-text-muted)', display: 'flex', flexShrink: 0 }}
          >×</button>
        )}
      </div>
      {task.evidence?.raw && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', paddingLeft: 24 }}>
          {L('Evidence: ', 'Bằng chứng: ', '증거: ', '证据：')}{task.evidence.raw}
        </div>
      )}
      {isOpen && !completing && (
        <button
          onClick={() => setCompleting(true)}
          style={{ alignSelf: 'flex-start', marginLeft: 24, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: 0 }}
        >
          {L('Mark done…', 'Đánh dấu xong…', '완료로 표시…', '标记为完成…')}
        </button>
      )}
      {completing && (
        <div style={{ display: 'flex', gap: 6, marginLeft: 24 }}>
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder={L('What proves this is done?', 'Bằng chứng gì cho thấy đã xong?', '완료를 증명하는 것은?', '什么能证明已完成？')}
            style={{ flex: 1, fontSize: 'var(--font-size-xs)', background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '4px 8px' }}
          />
          <button
            onClick={() => { if (evidence.trim()) onComplete(task.id, evidence.trim()); }}
            disabled={!evidence.trim() || busy}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', padding: '4px 10px', fontSize: 'var(--font-size-xs)', cursor: evidence.trim() ? 'pointer' : 'default' }}
          >
            {L('Done', 'Xong', '완료', '完成')}
          </button>
        </div>
      )}
    </div>
  );
}

export function TasksView() {
  const [tasks, setTasks] = React.useState(null); // null = loading
  const [newName, setNewName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const refresh = React.useCallback(() => {
    window.yana.taskList().then((result) => {
      if (result.ok) { setTasks(result.tasks); setError(null); }
      else { setError(result.error); setTasks([]); }
    });
  }, []);

  React.useEffect(() => { if (IS_ELECTRON) refresh(); }, [refresh]);

  async function onCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    const result = await window.yana.taskCreate(newName.trim());
    setBusy(false);
    if (result.ok) { setNewName(''); refresh(); } else { setError(result.error); }
  }

  async function onComplete(id, evidence) {
    setBusy(true);
    const result = await window.yana.taskComplete(id, evidence);
    setBusy(false);
    if (result.ok) refresh(); else setError(result.error);
  }

  async function onDrop(id) {
    setBusy(true);
    const result = await window.yana.taskDrop(id);
    setBusy(false);
    if (result.ok) refresh(); else setError(result.error);
  }

  if (!IS_ELECTRON) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
        <p>{L('Tasks are only available in the desktop app.', 'Tasks chỉ có trong ứng dụng desktop.', '작업은 데스크톱 앱에서만 사용할 수 있습니다.', '任务仅在桌面应用中可用。')}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {L('Tasks', 'Việc', '작업', '任务')}
        </h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }}
            placeholder={L('New task…', 'Việc mới…', '새 작업…', '新任务…')}
            style={{ flex: 1, fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 10px' }}
          />
          <button
            onClick={onCreate}
            disabled={!newName.trim() || busy}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 'var(--font-size-sm)', cursor: newName.trim() ? 'pointer' : 'default' }}
          >
            {Icons.plus(14)}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warn)' }}>{error}</p>}
        {tasks === null ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
        ) : tasks.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('No tasks yet.', 'Chưa có việc nào.', '아직 작업이 없습니다.', '暂无任务。')}</p>
        ) : (
          tasks.map((t) => <TaskRow key={t.id} task={t} onComplete={onComplete} onDrop={onDrop} busy={busy} />)
        )}
      </div>
    </div>
  );
}
