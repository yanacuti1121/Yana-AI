// New app shell's chat composer — presentation only. Reuses the EXACT
// same send/stop/draft state the legacy ComposerBar used (useChatSend) —
// only the visual layer is new-app-owned. Visual parity pass: rebuilt as
// a real workspace panel (tall textarea + bottom action row), not a
// single compact input row.
import React from 'react';
import { L, Icons } from '../../components.jsx';
import { IS_ELECTRON } from '../../lib/is-electron.js';
import { subscribe, getSnapshot, toggleAttachment } from '../../lib/file-attachments.mjs';

// Roadmap Phase 5 item 18 — Drag & Drop. Electron-only: window.yana's
// path-resolution helpers (getPathForFile/toRepoRelativePath) only exist
// in the desktop preload context. A dropped file OUTSIDE the current
// project (toRepoRelativePath returns ok:false) is rejected with a
// visible reason, not silently ignored — same "no silent no-op on a
// limit" rule file-attachments.mjs's own toggleAttachment follows.
async function attachDroppedFiles(fileList, setDropMsg) {
  for (const file of Array.from(fileList)) {
    const absolutePath = window.yana.getPathForFile(file);
    const resolved = await window.yana.toRepoRelativePath(absolutePath);
    if (!resolved.ok) { setDropMsg(resolved.error); continue; }
    const read = await window.yana.readFile(resolved.relPath);
    if (!read.ok) { setDropMsg(read.error); continue; }
    const result = toggleAttachment(resolved.relPath, read.content, read.sizeBytes);
    if (result === 'file-limit' || result === 'size-limit') setDropMsg(result);
  }
}

function QuickAction({ icon, label, onClick, disabled, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', padding: '4px 6px', borderRadius: 'var(--r-sm)',
        color: disabled ? 'var(--ink-3)' : 'var(--color-text-muted)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 'var(--font-size-xs)', opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

export function Composer({ draft, setDraft, autoResize, send, stopStream, streaming, thinking, inputRef, activeModel, hasWorkspaceContext, onFocusTerminal, activeStep }) {
  const attachedFiles = React.useSyncExternalStore(subscribe, getSnapshot);
  const [dragOver, setDragOver] = React.useState(false);
  const [dropMsg, setDropMsg] = React.useState(null);

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!IS_ELECTRON || !e.dataTransfer.files?.length) return;
    setDropMsg(null);
    attachDroppedFiles(e.dataTransfer.files, setDropMsg);
  }

  return (
    <div
      onDragOver={(e) => { if (IS_ELECTRON) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        border: dragOver ? '1px solid var(--primary)' : '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        padding: '14px 16px 10px', background: 'var(--color-bg-subtle)',
      }}
    >
      {attachedFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attachedFiles.map((f) => (
            <span key={f.path} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--font-size-xs)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', color: 'var(--ink)',
            }}>
              {Icons.file(11)}
              {f.path}
              <button
                onClick={() => toggleAttachment(f.path, '', 0)}
                aria-label={L('Remove attachment', 'Gỡ đính kèm', '첨부 제거', '移除附件')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
      )}
      {dropMsg && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>{dropMsg}</div>
      )}
      {/* Roadmap Phase 4 item 16 — Context-aware Composer: reflects the
          SAME real per-turn step data ProgressCard renders in the
          conversation above, just surfaced here too while it's running.
          Never shown for a plain text-only reply (activeStep is null). */}
      {activeStep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--primary)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
          {L('Running: ', 'Đang chạy: ', '실행 중: ', '正在运行：')}{activeStep.label}
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={2}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autoResize(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={L('Ask Yana anything…', 'Hỏi Yana bất cứ điều gì…', 'Yana에게 무엇이든 물어보세요…', '问 Yana 任何问题…')}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 'var(--font-size-base)', fontFamily: 'inherit', color: 'var(--ink)', lineHeight: 1.5,
          minHeight: 44, maxHeight: 180, overflowY: 'auto', resize: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <QuickAction icon={Icons.plus(15)} disabled title={L('Not available yet', 'Chưa có sẵn', '아직 사용 불가', '暂不可用')} />
        <QuickAction icon="@" disabled title={L('Not available yet', 'Chưa có sẵn', '아직 사용 불가', '暂不可用')} />
        <QuickAction icon={Icons.file(14)} label="Files" disabled title={L('Not available yet', 'Chưa có sẵn', '아직 사용 불가', '暂不可用')} />
        <QuickAction icon={Icons.code(14)} label="Code" disabled title={L('Not available yet', 'Chưa có sẵn', '아직 사용 불가', '暂不可用')} />
        <QuickAction
          icon={Icons.code(14)} label={hasWorkspaceContext ? 'Terminal ✓' : 'Terminal'}
          onClick={onFocusTerminal}
          title={hasWorkspaceContext
            ? L('Terminal context will be attached to your next message — click to view', 'Ngữ cảnh terminal sẽ được đính kèm — bấm để xem', '터미널 컨텍스트가 첨부됩니다 — 클릭하여 보기', '将附带终端上下文 — 点击查看')
            : L('No terminal session yet — click to open', 'Chưa có phiên terminal — bấm để mở', '아직 터미널 세션 없음 — 클릭하여 열기', '尚无终端会话 — 点击打开')}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeModel && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{activeModel}</span>}
          {streaming || thinking ? (
            <button onClick={stopStream} aria-label="Stop" title={L('Stop', 'Dừng', '중지', '停止')} style={{
              width: 34, height: 34, borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
              background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>■</button>
          ) : (
            <button onClick={send} aria-label="Send" disabled={!draft.trim()} style={{
              width: 34, height: 34, borderRadius: 'var(--r-md)', border: 'none',
              cursor: draft.trim() ? 'pointer' : 'default',
              background: draft.trim() ? 'var(--primary)' : 'var(--border)',
              color: draft.trim() ? '#fff' : 'var(--color-text-muted)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>{Icons.send(16)}</button>
          )}
        </div>
      </div>
    </div>
  );
}
