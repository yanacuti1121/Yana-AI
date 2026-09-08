export function splitThinkingBlocks(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text) return { display: '', reasoning: null };

  const blocks = [];
  const display = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const trimmed = inner.trim();
    if (trimmed) blocks.push(trimmed);
    return '';
  }).trim();

  if (blocks.length === 0) {
    const unclosed = text.match(/^<think>([\s\S]*)$/i);
    if (unclosed) return { display: '', reasoning: unclosed[1].trim() || null };
  }

  return { display, reasoning: blocks.length ? blocks.join('\n\n---\n\n') : null };
}
