import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { L } from '../../components.jsx';
import { splitThinkingBlocks } from './thinking-blocks.mjs';

function renderMarkdown(text) {
  const source = typeof text === 'string' ? text : '';
  if (!source) return '';
  try {
    return DOMPurify.sanitize(marked.parse(source, { gfm: true, breaks: true }));
  } catch (_) {
    return DOMPurify.sanitize(source.replace(/\n/g, '<br>'));
  }
}

export function MarkdownBody({ text }) {
  const { display, reasoning } = React.useMemo(() => splitThinkingBlocks(text), [text]);
  const html = React.useMemo(() => renderMarkdown(display), [display]);

  return (
    <>
      {reasoning && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Reasoning', 'Lập luận', '추론', '推理')}</summary>
          <pre style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)', font: 'var(--font-size-xs)/1.55 var(--font-mono)' }}>{reasoning}</pre>
        </details>
      )}
      {html && <div className="yana-md" dangerouslySetInnerHTML={{ __html: html }} />}
    </>
  );
}
