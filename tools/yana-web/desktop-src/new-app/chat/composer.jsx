// New app shell's chat composer — presentation only. Reuses the EXACT
// same send/stop/draft state the legacy ComposerBar used (useChatSend) —
// only the visual layer is new-app-owned. Visual parity pass: rebuilt as
// a real workspace panel (tall textarea + bottom action row), not a
// single compact input row.
import React from 'react';
import { L, Icons } from '../../components.jsx';
import { IS_ELECTRON } from '../../lib/is-electron.js';
import {
  attachExternalFile,
  beginAttachmentOperation,
  isAttachmentOperationCurrent,
  subscribe,
  getSnapshot,
  toggleAttachment,
} from '../../lib/file-attachments.mjs';

// Roadmap Phase 5 item 18 — Drag & Drop. Project files retain their
// canonical capability read. A file selected from outside the project is
// allowed only as an explicit, bounded one-turn context attachment: its
// content is read from the selected DOM File and its absolute path never
// reaches the chat payload.
const CODE_FILE_TYPES = '.rs,.py,.js,.jsx,.mjs,.cjs,.ts,.tsx,.go,.java,.kt,.kts,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.php,.swift,.scala,.sh,.bash,.zsh,.fish,.sql,.html,.css,.scss,.json,.toml,.yaml,.yml,.md';
const MAX_EXTERNAL_TEXT_BYTES = 512 * 1024;

function attachmentNotice(result) {
  if (result === 'file-limit') return L('You can attach up to 8 files to one message.', 'Mỗi tin nhắn chỉ đính kèm tối đa 8 tệp.', '한 메시지에는 최대 8개 파일을 첨부할 수 있습니다.', '每条消息最多可附加 8 个文件。');
  if (result === 'size-limit') return L('The selected files exceed the 40,000-character context limit.', 'Các tệp đã chọn vượt giới hạn context 40.000 ký tự.', '선택한 파일이 40,000자 컨텍스트 제한을 초과합니다.', '所选文件超过 40,000 个字符的上下文限制。');
  return null;
}

function isImageFile(file) {
  return file?.type?.startsWith('image/') || /\.(avif|bmp|gif|heic|jpeg|jpg|png|webp)$/i.test(file?.name || '');
}

async function readSelectedTextFile(file) {
  if (file.size > MAX_EXTERNAL_TEXT_BYTES) {
    return { ok: false, error: L('Selected file is larger than the 512 KB context-import limit.', 'Tệp đã chọn lớn hơn giới hạn nhập context 512 KB.', '선택한 파일이 512KB 컨텍스트 가져오기 제한을 초과합니다.', '所选文件超过 512 KB 上下文导入限制。') };
  }
  try {
    const buffer = await file.arrayBuffer();
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (content.includes('\0')) throw new Error('contains binary data');
    return { ok: true, content };
  } catch (_) {
    return { ok: false, error: L('This file is not UTF-8 text. Attach an image, or extract text from a PDF/document before adding it.', 'Tệp này không phải văn bản UTF-8. Hãy đính kèm ảnh hoặc trích xuất văn bản từ PDF/tài liệu trước khi thêm.', '이 파일은 UTF-8 텍스트가 아닙니다. 이미지를 첨부하거나 PDF/문서에서 텍스트를 추출한 뒤 추가하세요.', '此文件不是 UTF-8 文本。请附加图像，或先从 PDF/文档中提取文本。') };
  }
}

async function attachSelectedFiles(fileList, setDropMsg, attachVisionFile, hasVisionImage, canAttachVision, isCurrent) {
  let imageAttached = hasVisionImage;

  for (const file of Array.from(fileList)) {
    if (!isCurrent()) return;
    if (isImageFile(file)) {
      // Legacy ComposerBar hides its attach-image affordance entirely for
      // a non-vision provider (isVisionModel gate) — new-app's generic
      // drag/drop-anything composer had no equivalent check, so an image
      // could reach the backend for a provider that can't read it,
      // surfacing only as a late, confusing "does not support image
      // input" error after the request round-trip. Checking up front
      // means the failure is immediate and named, not a wasted round-trip.
      if (!canAttachVision) {
        setDropMsg(L('The current provider does not support images — switch to Claude, OpenAI, Gemini, Groq, OpenRouter, xAI, or GLM to attach one.', 'Provider hiện tại không hỗ trợ ảnh — đổi sang Claude, OpenAI, Gemini, Groq, OpenRouter, xAI hoặc GLM để đính kèm.', '현재 프로바이더는 이미지를 지원하지 않습니다 — 이미지를 첨부하려면 Claude, OpenAI, Gemini, Groq, OpenRouter, xAI 또는 GLM으로 전환하세요.', '当前提供商不支持图片 — 请切换到 Claude、OpenAI、Gemini、Groq、OpenRouter、xAI 或 GLM 以附加图片。'));
        continue;
      }
      if (imageAttached) {
        setDropMsg(L('Only one image can be attached to a message right now.', 'Hiện mỗi tin nhắn chỉ đính kèm được một ảnh.', '현재 메시지당 이미지 한 개만 첨부할 수 있습니다.', '目前每条消息只能附加一张图片。'));
        continue;
      }
      try {
        const attached = await attachVisionFile(file, isCurrent);
        if (!attached) return;
        imageAttached = true;
      } catch (error) {
        if (isCurrent()) setDropMsg(error.message || String(error));
      }
      continue;
    }

    const absolutePath = window.yana?.getPathForFile?.(file);
    if (absolutePath && window.yana?.toRepoRelativePath && window.yana?.readFile) {
      const resolved = await window.yana.toRepoRelativePath(absolutePath);
      if (!isCurrent()) return;
      if (resolved.ok) {
        const read = await window.yana.readFile(resolved.relPath);
        if (!isCurrent()) return;
        if (!read.ok) { setDropMsg(read.error); continue; }
        const result = toggleAttachment(resolved.relPath, read.content, read.sizeBytes);
        const message = attachmentNotice(result);
        if (message) setDropMsg(message);
        continue;
      }
    }

    const read = await readSelectedTextFile(file);
    if (!isCurrent()) return;
    if (!read.ok) { setDropMsg(read.error); continue; }
    const { result } = attachExternalFile(file.name, read.content, file.size);
    const message = attachmentNotice(result);
    if (message) setDropMsg(message);
  }
}

const menuButtonStyle = {
  display: 'block', width: '100%', padding: '7px 9px', border: 'none', borderRadius: 'var(--r-sm)',
  background: 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', font: 'inherit', fontSize: 'var(--font-size-xs)',
};

function QuickAction({ icon, label, onClick, disabled, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-label={label || title}
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

export function Composer({ draft, setDraft, autoResize, send, stopStream, streaming, thinking, inputRef, activeModel, hasTerminalSession, terminalAttached, onToggleTerminalContext, visionImage, setVisionImage, attachVisionFile, activeStep, canAttachVision, sendError }) {
  const attachedFiles = React.useSyncExternalStore(subscribe, getSnapshot);
  const [dragOver, setDragOver] = React.useState(false);
  const [dropMsg, setDropMsg] = React.useState(null);
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);
  const [isComposing, setIsComposing] = React.useState(false);
  const filePickerRef = React.useRef(null);
  const addMenuRef = React.useRef(null);

  // Close the "add context" menu on outside click / Escape — it had no
  // dismiss path other than re-clicking the same "+" button.
  React.useEffect(() => {
    if (!addMenuOpen) return;
    function onPointerDown(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setAddMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addMenuOpen]);

  const canAttachFiles = IS_ELECTRON && !streaming && !thinking;

  function beginFileAttachmentOperation(fileList) {
    const operation = beginAttachmentOperation();
    const isCurrent = () => isAttachmentOperationCurrent(operation);
    void attachSelectedFiles(fileList, setDropMsg, attachVisionFile, Boolean(visionImage), canAttachVision, isCurrent);
  }

  function selectFiles(kind = 'all') {
    if (!canAttachFiles) return;
    const picker = filePickerRef.current;
    if (!picker) return;
    picker.accept = kind === 'code' ? CODE_FILE_TYPES : '';
    picker.click();
  }

  function onPickFiles(event) {
    const files = event.target.files;
    if (files?.length) {
      setDropMsg(null);
      beginFileAttachmentOperation(files);
    }
    event.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!IS_ELECTRON || !e.dataTransfer.files?.length) return;
    setDropMsg(null);
    beginFileAttachmentOperation(e.dataTransfer.files);
  }

  const canSend = Boolean(draft.trim() || visionImage || attachedFiles.length > 0);

  return (
    <div
      className="na-composer"
      onDragOver={(e) => { if (IS_ELECTRON) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        border: dragOver ? '1px solid var(--primary)' : '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        padding: '14px 16px 10px', background: 'var(--color-bg-subtle)',
      }}
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={onPickFiles}
      />
      {attachedFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attachedFiles.map((f) => (
            <span key={f.path} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--font-size-xs)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', color: 'var(--ink)',
            }}>
              {Icons.file(11)}
              {f.displayName || f.path}
              <button
                onClick={() => toggleAttachment(f.path, '', 0)}
                aria-label={L('Remove attachment', 'Gỡ đính kèm', '첨부 제거', '移除附件')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
      )}
      {visionImage && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px 2px 2px', color: 'var(--ink)' }}>
            {/* visionImage already carries the base64 payload built for the
                API request (prepareVisionImage in use-vision-attach.js) — an
                actual thumbnail costs nothing extra to render, and "clearly
                see what will be sent" (product brief) needs more than a
                filename for an image attachment. */}
            <img
              src={`data:${visionImage.mimeType};base64,${visionImage.data}`}
              alt={visionImage.name}
              style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
            />
            {visionImage.name}
            <button onClick={() => setVisionImage(null)} aria-label={L('Remove image', 'Gỡ ảnh', '이미지 제거', '移除图像')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 0 }}>×</button>
          </span>
        </div>
      )}
      {dropMsg && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>{dropMsg}</div>
      )}
      {sendError && (
        <div role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>{sendError}</div>
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
        className="na-composer-input"
        ref={inputRef}
        rows={2}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autoResize(); }}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(e) => {
          // isComposing (state) + e.nativeEvent.isComposing (belt-and-suspenders,
          // some IME/browser combos fire the Enter keydown a tick before the
          // compositionend React event settles): without this, hitting Enter
          // to confirm a Vietnamese/Chinese/Japanese/Korean IME candidate
          // sends the half-typed message instead of confirming the candidate.
          if (isComposing || e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }}
        onPaste={(e) => {
          // Clipboard image paste (screenshot tools write an image, not a
          // file path, to the clipboard) — the legacy composer had this
          // wired (pages/chat/composer-bar.jsx's onComposerPaste); new-app's
          // rebuilt composer never got it. Routes through the SAME
          // attachSelectedFiles() the file-picker/drag-drop paths already
          // use, so the one-image limit and the vision-capability notice
          // stay consistent instead of a second, divergent check.
          const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
          if (!item) return;
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          setDropMsg(null);
          beginFileAttachmentOperation([file]);
        }}
        placeholder={L('Ask Yana anything…', 'Hỏi Yana bất cứ điều gì…', 'Yana에게 무엇이든 물어보세요…', '问 Yana 任何问题…')}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 'var(--font-size-base)', fontFamily: 'inherit', color: 'var(--ink)', lineHeight: 1.5,
          minHeight: 44, maxHeight: 180, overflowY: 'auto', resize: 'none',
        }}
      />
      <div className="na-composer-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <QuickAction
            icon={Icons.plus(15)}
            onClick={() => setAddMenuOpen((open) => !open)}
            disabled={!canAttachFiles}
            title={canAttachFiles
              ? L('Add context', 'Thêm context', '컨텍스트 추가', '添加上下文')
              : L('File attachments are available when Yana Desktop is idle', 'Đính kèm tệp khả dụng khi Yana Desktop đang rảnh', 'Yana Desktop이 대기 중일 때 파일을 첨부할 수 있습니다.', 'Yana Desktop 空闲时可添加文件附件')}
          />
          {addMenuOpen && (
            <div role="menu" style={{ position: 'absolute', zIndex: 10, left: 0, bottom: 'calc(100% + 6px)', minWidth: 196, padding: 5, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg)', boxShadow: '0 10px 24px rgba(0,0,0,.24)' }}>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); selectFiles('all'); }} style={menuButtonStyle}>{L('Attach file from computer', 'Đính kèm tệp từ máy', '컴퓨터에서 파일 첨부', '从电脑附加文件')}</button>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); selectFiles('code'); }} style={menuButtonStyle}>{L('Attach source code', 'Đính kèm mã nguồn', '소스 코드 첨부', '附加源代码')}</button>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); onToggleTerminalContext(); }} style={menuButtonStyle}>{terminalAttached ? L('Remove terminal context', 'Gỡ context terminal', '터미널 컨텍스트 제거', '移除终端上下文') : L('Attach terminal context', 'Đính kèm context terminal', '터미널 컨텍스트 첨부', '附加终端上下文')}</button>
            </div>
          )}
        </div>
        <QuickAction
          icon="@"
          onClick={() => selectFiles('all')}
          disabled={!canAttachFiles}
          title={L('Attach a file from your computer', 'Đính kèm tệp từ máy', '컴퓨터에서 파일 첨부', '从电脑附加文件')}
        />
        <QuickAction
          icon={Icons.file(14)}
          label={L('Files', 'Tệp', '파일', '文件')}
          onClick={() => selectFiles('all')}
          disabled={!canAttachFiles}
          title={L('Attach files from your computer or project', 'Đính kèm tệp từ máy hoặc project', '컴퓨터 또는 프로젝트에서 파일 첨부', '从电脑或项目附加文件')}
        />
        <QuickAction
          icon={Icons.code(14)}
          label={L('Code', 'Mã', '코드', '代码')}
          onClick={() => selectFiles('code')}
          disabled={!canAttachFiles}
          title={L('Attach selected source files', 'Đính kèm tệp mã nguồn đã chọn', '선택한 소스 파일 첨부', '附加所选源文件')}
        />
        <QuickAction
          icon={Icons.code(14)} label={terminalAttached ? 'Terminal ✓' : 'Terminal'}
          onClick={onToggleTerminalContext}
          title={terminalAttached
            ? L('Terminal context is attached to your next message — click to remove', 'Ngữ cảnh terminal sẽ được đính kèm — bấm để gỡ', '터미널 컨텍스트가 다음 메시지에 첨부됩니다 — 클릭하여 제거', '终端上下文将附加到下一条消息 — 点击移除')
            : hasTerminalSession
              ? L('Attach bounded terminal context to your next message', 'Đính kèm ngữ cảnh terminal có giới hạn vào tin nhắn tiếp theo', '다음 메시지에 제한된 터미널 컨텍스트 첨부', '将受限终端上下文附加到下一条消息')
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
            <button onClick={send} aria-label="Send" disabled={!canSend} style={{
              width: 34, height: 34, borderRadius: 'var(--r-md)', border: 'none',
              cursor: canSend ? 'pointer' : 'default',
              background: canSend ? 'var(--primary)' : 'var(--border)',
              color: canSend ? '#fff' : 'var(--color-text-muted)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>{Icons.send(16)}</button>
          )}
        </div>
      </div>
    </div>
  );
}
