// Yana AI — HTML Maker: 78 templates × any provider → stunning single-file HTML
// Port of nexu-io/html-anything, adapted for yana-web (no CLI, uses provider API directly)
const { useState, useEffect, useRef, useMemo } = React;

function HtmlMaker() {
  const [skills,        setSkills]        = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [search,        setSearch]        = useState('');
  const [content,       setContent]       = useState('');
  const [format,        setFormat]        = useState('text');
  const [generating,    setGenerating]    = useState(false);
  const [htmlOutput,    setHtmlOutput]    = useState('');
  const [error,         setError]         = useState('');
  const [copied,        setCopied]        = useState(false);
  const iframeRef = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => {
    fetch('/api/html/skills')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSkills(d.skills || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (iframeRef.current && htmlOutput) {
      iframeRef.current.srcdoc = htmlOutput;
    }
  }, [htmlOutput]);

  // Group skills by category
  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? skills.filter(s =>
          s.zhName.toLowerCase().includes(q) ||
          s.enName.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          (s.tags || []).some(t => t.toLowerCase().includes(q))
        )
      : skills;
    const map = {};
    for (const s of filtered) {
      const cat = s.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills, search]);

  async function generate() {
    if (!selectedSkill || !content.trim() || generating) return;
    const { provider, apiKey } = window.getProviderConfig ? window.getProviderConfig() : { provider: 'anthropic', apiKey: '' };
    if (!provider) {
      setError(L('No provider configured. Go to Providers page.', 'Chưa cài provider. Vào trang Providers.'));
      return;
    }

    setGenerating(true);
    setError('');
    setHtmlOutput('');
    setCopied(false);

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Wait for vault to finish decrypting keys from IndexedDB before reading
    if (typeof YanaVault !== "undefined") await YanaVault.ready;

    try {
      const res = await fetch('/api/html/convert', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          skillId:  selectedSkill.id,
          content:  content.trim(),
          format,
          provider,
          apiKey,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const obj = JSON.parse(raw);
            if (obj.error) { setError(obj.error); break; }
            if (obj.text) { accumulated += obj.text; setHtmlOutput(accumulated); }
          } catch (_) {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  }

  function stop() {
    if (abortRef.current) abortRef.current.abort();
    setGenerating(false);
  }

  function copyHtml() {
    if (!htmlOutput) return;
    navigator.clipboard.writeText(htmlOutput).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function downloadHtml() {
    if (!htmlOutput) return;
    const blob = new Blob([htmlOutput], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${selectedSkill?.id || 'output'}.html` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasOutput = !!htmlOutput;
  const canGenerate = !!selectedSkill && !!content.trim() && !generating;

  return (
    <div data-screen-label="HTML Maker" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', minHeight: 0 }}>
      <PageHeader
        title={L('HTML Maker', 'Tạo HTML')}
        sub={skills.length
          ? L(`${skills.length} templates — pick one, paste content, get world-class HTML`, `${skills.length} mẫu — chọn mẫu, dán nội dung, nhận HTML đỉnh`)
          : L('Loading templates…', 'Đang tải mẫu…')} />

      <div style={{ display: 'flex', gap: 'var(--gap)', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left: skill picker ── */}
        <div className="glass" style={{
          width: 248, flex: 'none',
          borderRadius: 'var(--r-lg)', padding: '12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          overflowY: 'auto',
        }}>
          <input
            placeholder={L('Search…', 'Tìm…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', boxSizing: 'border-box',
              borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--ink)',
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />

          {groups.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 4px' }}>
              {L('No templates found', 'Không tìm thấy mẫu')}
            </div>
          )}

          {groups.map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '6px 4px 3px' }}>{cat}</div>
              {items.map(s => {
                const active = selectedSkill?.id === s.id;
                return (
                  <button key={s.id} onClick={() => setSelectedSkill(s)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 8px', borderRadius: 'var(--r-sm)', textAlign: 'left',
                    border: active ? '1px solid var(--primary)' : '1px solid transparent',
                    background: active ? 'var(--primary-soft)' : 'transparent',
                    cursor: 'pointer', color: 'var(--ink)', transition: 'background .1s',
                  }}>
                    <span style={{ fontSize: 17, flex: 'none', lineHeight: 1 }}>{s.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: active ? 500 : 400,
                        color: active ? 'var(--primary)' : 'var(--ink)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{s.enName}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.zhName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Right: input + preview ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)', overflow: 'hidden' }}>

          {/* Input card */}
          <div className="glass" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--pad-card)', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
            {selectedSkill ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{selectedSkill.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedSkill.enName}{selectedSkill.aspectHint ? ' · ' + selectedSkill.aspectHint : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selectedSkill.zhName}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink-3)', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                {L('← Select a template from the left', '← Chọn mẫu bên trái')}
              </div>
            )}

            <textarea
              placeholder={L('Paste your content — text, markdown, JSON, CSV…', 'Dán nội dung — văn bản, markdown, JSON, CSV…')}
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                padding: '10px 12px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.55,
                fontFamily: 'inherit', outline: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={format} onChange={e => setFormat(e.target.value)} style={{
                padding: '6px 10px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                <option value="text">text</option>
                <option value="markdown">markdown</option>
                <option value="json">json</option>
                <option value="csv">csv</option>
              </select>

              <div style={{ flex: 1 }} />

              {hasOutput && (
                <>
                  <button onClick={copyHtml} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: copied ? 'var(--good, #2d9f6e)' : 'var(--ink-2)',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                  }}>
                    {Icons.check(14)} {copied ? L('Copied!', 'Đã chép!') : L('Copy HTML', 'Chép HTML')}
                  </button>
                  <button onClick={downloadHtml} title={L('Download .html', 'Tải .html')} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                  }}>
                    {Icons.pin(14)} {L('Download', 'Tải về')}
                  </button>
                </>
              )}

              {generating ? (
                <button onClick={stop} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 18px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                }}>
                  {Icons.pause(14)} {L('Stop', 'Dừng')}
                </button>
              ) : (
                <button onClick={generate} disabled={!canGenerate} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 18px', borderRadius: 'var(--r-sm)',
                  border: 'none', background: 'var(--primary)', color: 'white',
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                  opacity: canGenerate ? 1 : 0.4, transition: 'opacity .15s',
                }}>
                  {Icons.spark(14)} {L('Generate HTML', 'Tạo HTML')}
                </button>
              )}
            </div>

            {error && (
              <div style={{ fontSize: 13, color: '#c0392b', padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'rgba(192,57,43,.08)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Preview */}
          {(hasOutput || generating) && (
            <div className="glass" style={{
              borderRadius: 'var(--r-lg)', flex: 1, minHeight: 320,
              overflow: 'hidden', position: 'relative',
            }}>
              {generating && !hasOutput && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  {L('Generating HTML…', 'Đang tạo HTML…')}
                </div>
              )}
              {hasOutput && (
                <iframe
                  ref={iframeRef}
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title={L('HTML Preview', 'Xem trước HTML')}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.HtmlMaker = HtmlMaker;
