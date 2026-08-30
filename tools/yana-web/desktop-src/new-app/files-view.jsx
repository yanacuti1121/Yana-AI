// Roadmap Phase 5 — Files & Input (items 17 File Workspace, 20 Attachment
// Manager). Real data only: browsing goes through window.yana.listDir
// (Electron IPC -> yana-rt capability tree, Gate L5 sandboxed), preview
// through window.yana.readFile (capability read-file, size-capped,
// UTF-8-only). Electron-only, same gate the git-status fetch in index.jsx
// already uses — window.yana does not exist in a plain browser tab.
//
// Item 18 (Drag & Drop) and 19 (Clipboard/Paste) are NOT in this file:
// they attach to the Composer/Chat surface, not the Files browser itself
// — see composer.jsx's own follow-up for those two.
import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';
import { toggleAttachment, isAttached } from '../lib/file-attachments.mjs';

function useFileTree() {
  const [nodes, setNodes] = React.useState({}); // relPath -> { entries, loading, error }
  const [expanded, setExpanded] = React.useState(() => new Set(['']));

  const load = React.useCallback((relPath) => {
    setNodes((prev) => ({ ...prev, [relPath]: { ...(prev[relPath] || {}), loading: true, error: null } }));
    window.yana.listDir(relPath).then((result) => {
      setNodes((prev) => ({
        ...prev,
        [relPath]: result.ok
          ? { entries: result.entries, loading: false, error: null }
          : { entries: prev[relPath]?.entries || [], loading: false, error: result.error },
      }));
    });
  }, []);

  React.useEffect(() => { load(''); }, [load]);

  const toggleDir = React.useCallback((relPath) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else { next.add(relPath); if (!nodes[relPath]) load(relPath); }
      return next;
    });
  }, [nodes, load]);

  return { nodes, expanded, toggleDir };
}

function TreeNode({ entry, depth, nodes, expanded, toggleDir, onSelectFile, selectedPath }) {
  const isOpen = entry.isDir && expanded.has(entry.relPath);
  const node = entry.isDir ? nodes[entry.relPath] : null;
  const attached = !entry.isDir && isAttached(entry.relPath);

  return (
    <div>
      <div
        onClick={() => (entry.isDir ? toggleDir(entry.relPath) : onSelectFile(entry))}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', paddingLeft: 8 + depth * 16,
          borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 'var(--font-size-sm)',
          background: selectedPath === entry.relPath ? 'var(--primary-soft)' : 'transparent',
          color: attached ? 'var(--primary)' : 'var(--ink)',
        }}
      >
        {entry.isDir && (
          <span style={{ display: 'flex', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--color-text-muted)' }}>
            {Icons.chevron(12)}
          </span>
        )}
        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--color-text-muted)' }}>
          {entry.isDir ? Icons.folder(14) : Icons.file(14)}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        {attached && <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', color: 'var(--primary)' }}>{Icons.check(12)}</span>}
      </div>
      {entry.isDir && isOpen && node && (
        node.error ? (
          <div style={{ paddingLeft: 8 + (depth + 1) * 16, fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>{node.error}</div>
        ) : (
          (node.entries || []).map((child) => (
            <TreeNode key={child.relPath} entry={child} depth={depth + 1} nodes={nodes} expanded={expanded}
              toggleDir={toggleDir} onSelectFile={onSelectFile} selectedPath={selectedPath} />
          ))
        )
      )}
    </div>
  );
}

export function FilesView() {
  const { nodes, expanded, toggleDir } = useFileTree();
  const [selected, setSelected] = React.useState(null); // { relPath, name }
  const [preview, setPreview] = React.useState(null); // { content, sizeBytes, error }
  const [zipInfo, setZipInfo] = React.useState(null); // roadmap Phase 6 — ZIP Inspector state
  const [extractMsg, setExtractMsg] = React.useState(null);
  const [attachMsg, setAttachMsg] = React.useState(null);
  const isZip = selected?.name?.toLowerCase().endsWith('.zip');

  const onSelectFile = React.useCallback((entry) => {
    setSelected(entry);
    setExtractMsg(null);
    if (entry.name.toLowerCase().endsWith('.zip')) {
      setPreview(null);
      setZipInfo({ loading: true });
      window.yana.zipInspect(entry.relPath).then((result) => setZipInfo(result));
      return;
    }
    setZipInfo(null);
    setPreview({ loading: true });
    window.yana.readFile(entry.relPath).then((result) => {
      setPreview(result.ok
        ? { content: result.content, sizeBytes: result.sizeBytes }
        : { error: result.error });
    });
  }, []);

  function onAttach() {
    if (!selected || !preview?.content) return;
    const result = toggleAttachment(selected.relPath, preview.content, preview.sizeBytes);
    setAttachMsg(result);
  }

  function onExtract() {
    if (!selected) return;
    setExtractMsg({ loading: true });
    window.yana.zipExtract(selected.relPath).then((result) => setExtractMsg(result));
  }

  if (!IS_ELECTRON) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
        <p>{L('File Workspace is only available in the desktop app.', 'File Workspace chỉ có trong ứng dụng desktop.', 'File Workspace는 데스크톱 앱에서만 사용할 수 있습니다.', 'File Workspace 仅在桌面应用中可用。')}</p>
      </div>
    );
  }

  const root = nodes[''];

  return (
    <div style={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <div style={{ width: 280, minWidth: 200, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '10px 4px' }}>
        <div style={{ padding: '0 10px 8px', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--ink)' }}>
          {L('Files', 'Tệp', '파일', '文件')}
        </div>
        {!root || root.loading ? (
          <p style={{ padding: '0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
        ) : root.error ? (
          <p style={{ padding: '0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--warn)' }}>{root.error}</p>
        ) : (
          root.entries.map((entry) => (
            <TreeNode key={entry.relPath} entry={entry} depth={0} nodes={nodes} expanded={expanded}
              toggleDir={toggleDir} onSelectFile={onSelectFile} selectedPath={selected?.relPath} />
          ))
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
            <p>{L('Select a file to preview it.', 'Chọn 1 tệp để xem trước.', '미리 볼 파일을 선택하세요.', '选择一个文件以预览。')}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.relPath}</span>
              {!isZip && preview?.sizeBytes != null && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>{preview.sizeBytes} B</span>
              )}
              {isZip ? (
                <button
                  onClick={onExtract}
                  disabled={!zipInfo?.ok || extractMsg?.loading}
                  title={L('Extract into a new folder next to this archive', 'Giải nén vào 1 thư mục mới cạnh tệp này', '이 압축 파일 옆에 새 폴더로 압축 해제', '解压到该压缩包旁的新文件夹')}
                  style={{
                    marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 10px',
                    fontSize: 'var(--font-size-xs)', cursor: zipInfo?.ok ? 'pointer' : 'default',
                    color: 'var(--color-text-muted)', opacity: zipInfo?.ok ? 1 : 0.5,
                  }}
                >
                  {L('Extract', 'Giải nén', '압축 해제', '解压')}
                </button>
              ) : (
                <button
                  onClick={onAttach}
                  disabled={!preview?.content}
                  title={L('Attach this file\'s content to your next message', 'Đính kèm nội dung tệp này vào tin nhắn tiếp theo', '이 파일 내용을 다음 메시지에 첨부', '将此文件内容附加到下一条消息')}
                  style={{
                    marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 10px',
                    fontSize: 'var(--font-size-xs)', cursor: preview?.content ? 'pointer' : 'default',
                    color: isAttached(selected.relPath) ? 'var(--primary)' : 'var(--color-text-muted)',
                    opacity: preview?.content ? 1 : 0.5,
                  }}
                >
                  {Icons.attach(12)}
                  {isAttached(selected.relPath)
                    ? L('Attached', 'Đã đính kèm', '첨부됨', '已附加')
                    : L('Attach', 'Đính kèm', '첨부', '附加')}
                </button>
              )}
            </div>
            {attachMsg === 'file-limit' && (
              <div style={{ padding: '6px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>
                {L('Too many files attached already — remove one first.', 'Đã đính kèm quá nhiều tệp — gỡ bớt 1 tệp trước.', '이미 너무 많은 파일이 첨부되었습니다 — 먼저 하나를 제거하세요.', '已附加过多文件 — 请先移除一个。')}
              </div>
            )}
            {attachMsg === 'size-limit' && (
              <div style={{ padding: '6px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--warn)' }}>
                {L('Combined attached content is too large.', 'Tổng nội dung đính kèm quá lớn.', '첨부된 내용의 총합이 너무 큽니다.', '附加内容总量过大。')}
              </div>
            )}
            {extractMsg && !extractMsg.loading && (
              <div style={{ padding: '6px 16px', fontSize: 'var(--font-size-xs)', color: extractMsg.ok ? 'var(--good)' : 'var(--warn)' }}>
                {extractMsg.ok
                  ? L(`Extracted ${extractMsg.extractedFiles} files into ${extractMsg.destRelPath}.`, `Đã giải nén ${extractMsg.extractedFiles} tệp vào ${extractMsg.destRelPath}.`, `${extractMsg.destRelPath}에 파일 ${extractMsg.extractedFiles}개 압축 해제 완료.`, `已解压 ${extractMsg.extractedFiles} 个文件到 ${extractMsg.destRelPath}。`)
                  : extractMsg.error}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px' }}>
              {isZip ? (
                zipInfo?.loading ? (
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
                ) : !zipInfo?.ok ? (
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warn)' }}>{zipInfo?.error}</p>
                ) : (
                  <>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
                      {L(`${zipInfo.entryCount} entries, ${zipInfo.totalUncompressedSize} B uncompressed`,
                        `${zipInfo.entryCount} mục, ${zipInfo.totalUncompressedSize} B chưa nén`,
                        `${zipInfo.entryCount}개 항목, 압축 해제 시 ${zipInfo.totalUncompressedSize} B`,
                        `${zipInfo.entryCount} 个条目，解压后 ${zipInfo.totalUncompressedSize} B`)}
                    </p>
                    {zipInfo.warnings.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        {zipInfo.warnings.map((w, i) => (
                          <div key={i} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warn)', padding: '2px 0' }}>⚠ {w}</div>
                        ))}
                      </div>
                    )}
                    {zipInfo.entries.map((e) => (
                      <div key={e.name} style={{ display: 'flex', gap: 8, fontSize: 'var(--font-size-sm)', padding: '2px 0', color: 'var(--ink)' }}>
                        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--color-text-muted)' }}>{e.isDir ? Icons.folder(13) : Icons.file(13)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{e.name}</span>
                        {!e.isDir && <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{e.uncompressedSize} B</span>}
                      </div>
                    ))}
                    {zipInfo.entriesTruncated && (
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 8 }}>
                        {L('List truncated — archive has more entries than shown.', 'Danh sách đã rút gọn — kho lưu trữ có nhiều mục hơn hiển thị.', '목록이 잘렸습니다 — 표시된 것보다 더 많은 항목이 있습니다.', '列表已截断 — 压缩包中的条目多于此处显示。')}
                      </p>
                    )}
                  </>
                )
              ) : preview?.loading ? (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
              ) : preview?.error ? (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warn)' }}>{preview.error}</p>
              ) : (
                <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink)' }}>
                  {preview?.content}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
