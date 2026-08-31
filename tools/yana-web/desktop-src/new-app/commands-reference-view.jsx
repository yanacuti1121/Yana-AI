// Yana AI — CLI Command Reference view. Read-only documentation surface
// inside new-app (anh asked for the same table already published as an
// artifact to also live inside the app itself). "Run" is deliberately
// copy-to-clipboard + focus Terminal, never a direct PTY write: this
// codebase keeps the terminal dock's human-typed path and any AI/UI-driven
// execution path separate on purpose (see index.jsx's own header comment,
// and terminal-context.mjs's snapshot never exposing a writable sessionId).
// Anh chose this option explicitly over "type it in for you, unsubmitted"
// specifically so every command still goes through one real keystroke
// (anh's own Cmd+V then Enter) — no per-command "is this one sensitive"
// classification needed, because the confirmation step is uniform.
import React from 'react';
import { L, Icons } from '../components.jsx';
import { COMMAND_GROUPS } from './commands-reference-data.mjs';

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('clipboard unavailable'));
}

function CopyButton({ text }) {
  const [copied, setCopied] = React.useState(false);
  async function handleClick() {
    try { await copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 1100); }
    catch (_) {}
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      title={L('Copy command', 'Sao chép lệnh', '명령어 복사', '复制命令')}
      style={{
        flexShrink: 0, width: 22, height: 22, display: 'grid', placeItems: 'center', border: 'none',
        borderRadius: 5, background: 'transparent', color: copied ? 'var(--good)' : 'var(--color-text-muted)', cursor: 'pointer',
      }}
    >
      {copied ? '✓' : Icons.file(13)}
    </button>
  );
}

function RunButton({ text, onFocusTerminal }) {
  const [state, setState] = React.useState('idle'); // idle | copied
  async function handleClick() {
    try {
      await copyToClipboard(text);
      onFocusTerminal?.();
      setState('copied');
      setTimeout(() => setState('idle'), 1800);
    } catch (_) {}
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      title={L('Copy and open Terminal — paste (⌘V) and press Enter to run', 'Sao chép và mở Terminal — dán (⌘V) rồi nhấn Enter để chạy', '복사 후 터미널 열기 — 붙여넣고(⌘V) Enter를 눌러 실행', '复制并打开终端 — 粘贴（⌘V）后按 Enter 运行')}
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)',
        borderRadius: 5, padding: '2px 7px', background: state === 'copied' ? 'var(--primary-soft)' : 'transparent',
        color: state === 'copied' ? 'var(--primary)' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: 11, font: 'inherit',
      }}
    >
      <span style={{ display: 'flex' }}>{state === 'copied' ? '✓' : Icons.send(11)}</span>
      {state === 'copied'
        ? L('Paste in Terminal', 'Dán vào Terminal', '터미널에 붙여넣기', '在终端中粘贴')
        : L('Run', 'Chạy', '실행', '运行')}
    </button>
  );
}

function CommandRow({ cmd, desc, onFocusTerminal }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(200px, 40%) 1fr', gap: 14,
      padding: '10px 14px', borderTop: '1px solid var(--border)', alignItems: 'start',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
        <code style={{
          fontSize: 12, color: 'var(--primary)', background: 'var(--primary-soft)',
          padding: '3px 7px', borderRadius: 6, wordBreak: 'break-word', fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}>{cmd}</code>
        <CopyButton text={cmd} />
        <RunButton text={cmd} onFocusTerminal={onFocusTerminal} />
      </div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 13, paddingTop: 4 }}>{desc}</div>
    </div>
  );
}

function matchesQuery(row, query) {
  if (!query) return true;
  return (row[0] + ' ' + row[1]).toLowerCase().includes(query);
}

export function CommandsReferenceView({ onFocusTerminal }) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = COMMAND_GROUPS
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchesQuery(row, normalizedQuery)) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px clamp(20px, 5vw, 56px)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-xl)', fontWeight: 650, color: 'var(--ink)' }}>
          {L('Command reference', 'Lệnh tham khảo', '명령어 참조', '命令参考')}
        </h1>
        <p style={{ margin: '0 0 20px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
          {L(
            'Every command the yana-ai CLI understands, kept in sync with COMMANDS.md at the repo root.',
            'Toàn bộ lệnh CLI yana-ai, đồng bộ với COMMANDS.md ở gốc repo.',
            'yana-ai CLI가 지원하는 모든 명령어 — 저장소 루트의 COMMANDS.md와 동기화됨.',
            'yana-ai CLI 支持的所有命令，与仓库根目录的 COMMANDS.md 保持同步。'
          )}
        </p>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          padding: '8px 12px', marginBottom: 20, color: 'var(--color-text-muted)', position: 'sticky', top: 0, background: 'var(--color-bg)',
        }}>
          {Icons.search(15)}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L('Filter commands…', 'Lọc lệnh…', '명령어 필터…', '筛选命令…')}
            aria-label={L('Filter commands', 'Lọc lệnh', '명령어 필터', '筛选命令')}
            style={{ border: 'none', outline: 'none', minWidth: 0, flex: 1, background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--font-size-sm)' }}
          />
        </label>

        {visibleGroups.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            {L('No commands match that filter.', 'Không có lệnh nào khớp bộ lọc.', '필터와 일치하는 명령어가 없습니다.', '没有匹配该筛选条件的命令。')}
          </p>
        )}

        {visibleGroups.map((group) => (
          <section key={group.id} style={{ marginBottom: 28 }}>
            <h2 style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 650,
              color: 'var(--primary)', margin: '0 0 10px',
            }}>{group.label}</h2>
            {group.intro && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-muted)' }}>{group.intro}</p>}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              {group.rows.map(([cmd, desc]) => <CommandRow key={cmd} cmd={cmd} desc={desc} onFocusTerminal={onFocusTerminal} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
