// Yana Mobile — HTML Maker: 78 templates × any provider → stunning single-file HTML
// Same engine as desktop/html-maker.jsx; the side-by-side skill picker becomes
// a slide-up Sheet here since there's no room for two columns on a phone.
const { useState: useStateHM, useEffect: useEffectHM, useRef: useRefHM, useMemo: useMemoHM } = React;

function MHtmlMaker() {
  const [skills,        setSkills]        = useStateHM([]);
  const [pickerOpen,    setPickerOpen]    = useStateHM(false);
  const [selectedSkill, setSelectedSkill] = useStateHM(null);
  const [search,        setSearch]        = useStateHM('');
  const [content,       setContent]       = useStateHM('');
  const [format,        setFormat]        = useStateHM('text');
  const [generating,    setGenerating]    = useStateHM(false);
  const [htmlOutput,    setHtmlOutput]    = useStateHM('');
  const [error,         setError]         = useStateHM('');
  const [copied,        setCopied]        = useStateHM(false);
  const iframeRef = useRefHM(null);
  const abortRef  = useRefHM(null);

  useEffectHM(() => {
    fetch('/api/html/skills')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSkills(d.skills || []); })
      .catch(() => {});
  }, []);

  useEffectHM(() => {
    if (iframeRef.current && htmlOutput) {
      iframeRef.current.srcdoc = htmlOutput;
    }
  }, [htmlOutput]);

  const groups = useMemoHM(() => {
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
    const { provider, apiKey } = typeof mGetProviderConfig !== 'undefined' ? mGetProviderConfig() : { provider: 'claude', apiKey: '' };
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
    <div data-screen-label="HTML Maker" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <MHead title={L('HTML Maker', 'Tạo HTML')}
        sub={skills.length
          ? L(`${skills.length} templates`, `${skills.length} mẫu`)
          : L('Loading templates…', 'Đang tải mẫu…')} />

      {/* Template picker trigger */}
      <button onClick={() => setPickerOpen(true)} className="glass" style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
        borderRadius: 'var(--r-lg)', padding: '12px 14px', border: 'none', cursor: 'pointer',
        textAlign: 'left', color: 'var(--ink)',
      }}>
        {selectedSkill ? (
          <>
            <span style={{ fontSize: 22, lineHeight: 1, flex: 'none' }}>{selectedSkill.emoji}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSkill.enName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSkill.zhName}</div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', flex: 1 }}>{L('Choose a template…', 'Chọn một mẫu…')}</div>
        )}
        <span style={{ color: 'var(--ink-3)', flex: 'none' }}>{Icons.chevron(16)}</span>
      </button>

      {/* Input card */}
      <div className="glass" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--pad-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          placeholder={L('Paste your content — text, markdown, JSON, CSV…', 'Dán nội dung — văn bản, markdown, JSON, CSV…')}
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '10px 12px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--ink)', fontSize: 14, lineHeight: 1.55,
            fontFamily: 'inherit', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={format} onChange={e => setFormat(e.target.value)} style={{
            padding: '7px 10px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            <option value="text">text</option>
            <option value="markdown">markdown</option>
            <option value="json">json</option>
            <option value="csv">csv</option>
          </select>

          {generating ? (
            <button onClick={stop} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}>
              {Icons.pause(14)} {L('Stop', 'Dừng')}
            </button>
          ) : (
            <button onClick={generate} disabled={!canGenerate} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--r-sm)',
              border: 'none', background: 'var(--primary)', color: 'white',
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              opacity: canGenerate ? 1 : 0.4,
            }}>
              {Icons.spark(14)} {L('Generate', 'Tạo')}
            </button>
          )}
        </div>

        {hasOutput && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={copyHtml} style={{
              display: 'flex', alignItems: 'center', gap: 6, flex: 1,
              padding: '7px 12px', borderRadius: 'var(--r-sm)', justifyContent: 'center',
              border: '1px solid var(--border)', background: 'transparent',
              color: copied ? 'var(--good, #2d9f6e)' : 'var(--ink-2)',
              cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit',
            }}>
              {Icons.check(14)} {copied ? L('Copied!', 'Đã chép!') : L('Copy', 'Chép')}
            </button>
            <button onClick={downloadHtml} style={{
              display: 'flex', alignItems: 'center', gap: 6, flex: 1,
              padding: '7px 12px', borderRadius: 'var(--r-sm)', justifyContent: 'center',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit',
            }}>
              {Icons.pin(14)} {L('Download', 'Tải về')}
            </button>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#c0392b', padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'rgba(192,57,43,.08)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Preview */}
      {(hasOutput || generating) && (
        <div className="glass" style={{
          borderRadius: 'var(--r-lg)', minHeight: 280, height: 280,
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

      {/* Template picker sheet */}
      <Sheet open={pickerOpen} title={L('Choose a template', 'Chọn một mẫu')} onClose={() => setPickerOpen(false)}>
        <input
          placeholder={L('Search…', 'Tìm…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', marginBottom: 10,
            borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--ink)',
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        {groups.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 4px' }}>
            {L('No templates found', 'Không tìm thấy mẫu')}
          </div>
        )}
        {groups.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '6px 4px 3px' }}>{cat}</div>
            {items.map(s => {
              const active = selectedSkill?.id === s.id;
              return (
                <button key={s.id} onClick={() => { setSelectedSkill(s); setPickerOpen(false); }} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
                  padding: '9px 8px', borderRadius: 'var(--r-sm)', textAlign: 'left',
                  border: active ? '1px solid var(--primary)' : '1px solid transparent',
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  cursor: 'pointer', color: 'var(--ink)',
                }}>
                  <span style={{ fontSize: 18, flex: 'none', lineHeight: 1 }}>{s.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: active ? 500 : 400,
                      color: active ? 'var(--primary)' : 'var(--ink)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s.enName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.zhName}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </Sheet>
    </div>
  );
}

Object.assign(window, { MHtmlMaker });
