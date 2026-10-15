// Markdown tối giản cho câu trả lời của model: tiêu đề, đoạn văn, danh sách, trích dẫn, khối code,
// code inline, đậm, nghiêng, link. Chỉ dựng DOM bằng textContent, không bao giờ dùng innerHTML, nên nội
// dung model trả về không thể chèn HTML hay script. Link chỉ hiện dạng chữ, không bấm được.
(function () {
	'use strict';
	const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/;

	function inline(parent, text) {
		let rest = text;
		while (rest) {
			const match = INLINE.exec(rest);
			if (!match) {
				parent.append(document.createTextNode(rest));
				return;
			}
			if (match.index) parent.append(document.createTextNode(rest.slice(0, match.index)));
			const token = match[0];
			let node;
			if (match[1]) {
				node = document.createElement('code');
				node.textContent = token.slice(1, -1);
			} else if (match[2]) {
				node = document.createElement('strong');
				inline(node, token.slice(2, -2));
			} else if (match[3]) {
				node = document.createElement('em');
				inline(node, token.slice(1, -1));
			} else {
				const close = token.indexOf('](');
				node = document.createElement('span');
				node.className = 'md-link';
				node.textContent = token.slice(1, close);
				node.title = token.slice(close + 2, -1);
			}
			parent.append(node);
			rest = rest.slice(match.index + token.length);
		}
	}

	function paragraph(lines) {
		const node = document.createElement('p');
		lines.forEach((line, index) => {
			if (index) node.append(document.createElement('br'));
			inline(node, line);
		});
		return node;
	}

	// Trả về DocumentFragment. Khối code chưa đóng (đang stream) vẫn được hiển thị như khối code.
	function render(source) {
		const fragment = document.createDocumentFragment();
		const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
		let buffer = [];
		let list = null;
		const flush = () => {
			if (buffer.length) fragment.append(paragraph(buffer));
			buffer = [];
		};
		const endList = () => { list = null; };
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const fence = /^```\s*([\w+-]*)(?:\s+(?:path=|file=)?([^\s\n]+))?/.exec(line);
			if (fence) {
				flush(); endList();
				const lang = (fence[1] || '').toLowerCase();
				const filePath = fence[2] || '';
				const body = [];
				while (++i < lines.length && !/^```/.test(lines[i])) body.push(lines[i]);
				if (lang === 'slide-deck' || lang === 'presentation' || lang === 'slides') {
					const deckEl = renderSlideDeckElement(body.join('\n'));
					if (deckEl) {
						fragment.append(deckEl);
						continue;
					}
				}
				const wrapper = document.createElement('div');
				wrapper.className = 'code-block-wrapper';

				const header = document.createElement('div');
				header.className = 'code-block-header';

				const langLabel = document.createElement('span');
				langLabel.className = 'code-block-lang mono';
				langLabel.textContent = filePath ? `${(fence[1] || 'code').toUpperCase()} · ${filePath}` : (fence[1] || 'code').toUpperCase();

				const headerActions = document.createElement('div');
				headerActions.className = 'code-block-actions';

				if (filePath && window.vscode) {
					const openBtn = document.createElement('button');
					openBtn.className = 'code-block-action-btn mono';
					openBtn.textContent = 'Open';
					openBtn.title = `Open ${filePath} in editor`;
					openBtn.addEventListener('click', () => {
						window.vscode?.postMessage({ type: 'openFile', path: filePath });
					});
					headerActions.append(openBtn);
				}

				const copyBtn = document.createElement('button');
				copyBtn.className = 'code-block-copy mono';
				copyBtn.textContent = 'Copy';
				copyBtn.title = 'Copy code snippet';
				const rawCode = body.join('\n');
				copyBtn.addEventListener('click', () => {
					navigator.clipboard.writeText(rawCode).then(() => {
						copyBtn.textContent = '✓ Copied';
						copyBtn.classList.add('copied');
						setTimeout(() => {
							copyBtn.textContent = 'Copy';
							copyBtn.classList.remove('copied');
						}, 2000);
					}).catch(() => {
						// fallback selection if clipboard API blocked
						try {
							const range = document.createRange();
							range.selectNodeContents(code);
							const sel = window.getSelection();
							sel.removeAllRanges();
							sel.addRange(range);
							document.execCommand('copy');
							copyBtn.textContent = '✓ Copied';
							copyBtn.classList.add('copied');
							setTimeout(() => {
								copyBtn.textContent = 'Copy';
								copyBtn.classList.remove('copied');
							}, 2000);
						} catch (_) {}
					});
				});

				headerActions.append(copyBtn);
				header.append(langLabel, headerActions);
				wrapper.append(header);

				const pre = document.createElement('pre');
				if (fence[1]) pre.dataset.lang = fence[1];
				const code = document.createElement('code');

				if (lang === 'diff' || lang === 'patch') {
					pre.classList.add('diff-code-body');
					body.forEach(l => {
						const lineDiv = document.createElement('div');
						if (l.startsWith('+')) lineDiv.className = 'diff-line-add';
						else if (l.startsWith('-')) lineDiv.className = 'diff-line-del';
						else if (l.startsWith('@@')) lineDiv.className = 'diff-line-hunk';
						else lineDiv.className = 'diff-line-ctx';
						lineDiv.textContent = l;
						code.append(lineDiv);
					});
				} else {
					code.textContent = rawCode;
				}
				pre.append(code);
				wrapper.append(pre);
				fragment.append(wrapper);
				continue;
			}
			const heading = /^(#{1,4})\s+(.*)$/.exec(line);
			const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
			if (heading) {
				flush(); endList();
				const node = document.createElement(`h${Math.min(6, heading[1].length + 2)}`);
				inline(node, heading[2]);
				fragment.append(node);
			} else if (bullet) {
				flush();
				const ordered = /\d/.test(bullet[1]);
				if (!list || (list.tagName === 'OL') !== ordered) {
					list = document.createElement(ordered ? 'ol' : 'ul');
					fragment.append(list);
				}
				const item = document.createElement('li');
				inline(item, bullet[2]);
				list.append(item);
			} else if (/^>\s?/.test(line)) {
				flush(); endList();
				const quote = document.createElement('blockquote');
				inline(quote, line.replace(/^>\s?/, ''));
				fragment.append(quote);
			} else if (!line.trim()) {
				flush(); endList();
			} else {
				endList();
				buffer.push(line);
			}
		}
		flush();
		return fragment;
	}

	function parseSlideDeck(source) {
		try {
			const raw = JSON.parse(source);
			if (raw && Array.isArray(raw.slides) && raw.slides.length > 0) {
				return {
					title: raw.title || 'Untitled Presentation',
					theme: raw.theme || 'dark',
					slides: raw.slides.map((s, idx) => ({
						id: s.id || `slide-${idx + 1}`,
						title: s.title || `Slide ${idx + 1}`,
						subtitle: s.subtitle || '',
						layout: s.layout || 'bullets',
						bullets: Array.isArray(s.bullets) ? s.bullets : (s.content ? [s.content] : []),
						code: s.code || '',
						notes: s.notes || '',
					}))
				};
			}
		} catch {
			// Fallback: parse markdown formatted slides separated by ---
			const rawSlides = source.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
			if (rawSlides.length > 1) {
				return {
					title: 'Presentation Deck',
					theme: 'dark',
					slides: rawSlides.map((chunk, idx) => {
						const chunkLines = chunk.split('\n');
						const t = chunkLines[0]?.replace(/^#+\s*/, '') || `Slide ${idx + 1}`;
						const bullets = chunkLines.slice(1).filter(l => /^[-*]\s+/.test(l)).map(l => l.replace(/^[-*]\s+/, ''));
						return { id: `slide-${idx + 1}`, title: t, subtitle: '', bullets, code: '', notes: '' };
					})
				};
			}
		}
		return null;
	}

	function renderSlideDeckElement(source) {
		const deck = parseSlideDeck(source);
		if (!deck) return null;

		let currentIndex = 0;
		let showNotes = false;

		const card = document.createElement('div');
		card.className = `slide-deck-card theme-${deck.theme}`;

		const head = document.createElement('div');
		head.className = 'slide-deck-head';
		const titleSpan = document.createElement('span');
		titleSpan.className = 'slide-deck-title';
		titleSpan.textContent = `🎬 ${deck.title}`;
		const badgeSpan = document.createElement('span');
		badgeSpan.className = 'chip info';
		badgeSpan.textContent = `${deck.slides.length} slides`;
		head.append(titleSpan, badgeSpan);

		const stage = document.createElement('div');
		stage.className = 'slide-stage';
		const stageInner = document.createElement('div');
		stageInner.className = 'slide-stage-inner';
		stage.append(stageInner);

		const nav = document.createElement('div');
		nav.className = 'slide-nav';

		const prevBtn = document.createElement('button');
		prevBtn.className = 'ghost slide-nav-btn';
		prevBtn.textContent = '◀ Prev';

		const counterSpan = document.createElement('span');
		counterSpan.className = 'slide-counter';

		const nextBtn = document.createElement('button');
		nextBtn.className = 'ghost slide-nav-btn';
		nextBtn.textContent = 'Next ▶';

		const notesBtn = document.createElement('button');
		notesBtn.className = 'ghost slide-notes-btn';
		notesBtn.textContent = '📝 Notes';

		nav.append(prevBtn, counterSpan, nextBtn, notesBtn);

		const notesBox = document.createElement('div');
		notesBox.className = 'slide-notes-drawer';
		notesBox.style.display = 'none';

		const actions = document.createElement('div');
		actions.className = 'slide-actions-bar';

		const presentBtn = document.createElement('button');
		presentBtn.className = 'primary slide-action-btn';
		presentBtn.textContent = '▶ Present (F5)';
		presentBtn.title = 'Full-screen Presentation Mode';

		const exportPptxBtn = document.createElement('button');
		exportPptxBtn.className = 'ghost slide-action-btn';
		exportPptxBtn.textContent = '📥 Export .pptx';
		exportPptxBtn.title = 'Export as editable Microsoft PowerPoint presentation';

		const exportHtmlBtn = document.createElement('button');
		exportHtmlBtn.className = 'ghost slide-action-btn';
		exportHtmlBtn.textContent = '📄 Export HTML';
		exportHtmlBtn.title = 'Export as standalone HTML presentation';

		actions.append(presentBtn, exportPptxBtn, exportHtmlBtn);

		function updateSlide() {
			const slide = deck.slides[currentIndex];
			counterSpan.textContent = `${currentIndex + 1} / ${deck.slides.length}`;
			prevBtn.disabled = currentIndex === 0;
			nextBtn.disabled = currentIndex === deck.slides.length - 1;

			stageInner.replaceChildren();

			const sTitle = document.createElement('div');
			sTitle.className = 'slide-title';
			sTitle.textContent = slide.title;
			stageInner.append(sTitle);

			if (slide.subtitle) {
				const sSub = document.createElement('div');
				sSub.className = 'slide-subtitle';
				sSub.textContent = slide.subtitle;
				stageInner.append(sSub);
			}

			if (slide.bullets && slide.bullets.length > 0) {
				const ul = document.createElement('ul');
				ul.className = 'slide-bullets';
				for (const b of slide.bullets) {
					const li = document.createElement('li');
					li.textContent = b;
					ul.append(li);
				}
				stageInner.append(ul);
			}

			if (slide.code) {
				const pre = document.createElement('pre');
				pre.className = 'slide-code';
				const codeEl = document.createElement('code');
				codeEl.textContent = slide.code;
				pre.append(codeEl);
				stageInner.append(pre);
			}

			notesBox.textContent = slide.notes ? `Speaker Notes: ${slide.notes}` : 'No speaker notes for this slide.';
			notesBtn.textContent = slide.notes ? '📝 Notes (1)' : '📝 Notes (0)';
		}

		prevBtn.addEventListener('click', () => {
			if (currentIndex > 0) { currentIndex--; updateSlide(); }
		});

		nextBtn.addEventListener('click', () => {
			if (currentIndex < deck.slides.length - 1) { currentIndex++; updateSlide(); }
		});

		notesBtn.addEventListener('click', () => {
			showNotes = !showNotes;
			notesBox.style.display = showNotes ? 'block' : 'none';
			notesBtn.classList.toggle('active', showNotes);
		});

		presentBtn.addEventListener('click', () => {
			enterPresenterMode(deck, currentIndex);
		});

		exportPptxBtn.addEventListener('click', () => {
			if (window.vscode) window.vscode.postMessage({ type: 'exportPresentation', deck });
		});

		exportHtmlBtn.addEventListener('click', () => {
			if (window.vscode) window.vscode.postMessage({ type: 'exportPresentationHtml', deck });
		});

		updateSlide();
		card.append(head, stage, nav, notesBox, actions);
		return card;
	}

	function enterPresenterMode(deck, startIndex) {
		let pIndex = startIndex || 0;
		const overlay = document.createElement('div');
		overlay.className = `presenter-overlay theme-${deck.theme || 'dark'}`;

		const container = document.createElement('div');
		container.className = 'presenter-container';

		const slideBox = document.createElement('div');
		slideBox.className = 'presenter-slide-box';

		const bottomBar = document.createElement('div');
		bottomBar.className = 'presenter-bar';

		const pPrev = document.createElement('button');
		pPrev.className = 'ghost';
		pPrev.textContent = '◀ Prev';

		const pCounter = document.createElement('span');
		pCounter.className = 'presenter-counter mono';

		const pNext = document.createElement('button');
		pNext.className = 'ghost';
		pNext.textContent = 'Next ▶';

		const pNotesToggle = document.createElement('button');
		pNotesToggle.className = 'ghost';
		pNotesToggle.textContent = '📝 Speaker Notes';

		const pClose = document.createElement('button');
		pClose.className = 'primary';
		pClose.textContent = '✕ Exit (Esc)';

		bottomBar.append(pPrev, pCounter, pNext, pNotesToggle, pClose);

		const notesDrawer = document.createElement('div');
		notesDrawer.className = 'presenter-notes-drawer';
		notesDrawer.style.display = 'none';

		container.append(slideBox, notesDrawer, bottomBar);
		overlay.append(container);
		document.body.append(overlay);

		function renderCurrent() {
			const s = deck.slides[pIndex];
			pCounter.textContent = `${pIndex + 1} / ${deck.slides.length}`;
			pPrev.disabled = pIndex === 0;
			pNext.disabled = pIndex === deck.slides.length - 1;

			slideBox.replaceChildren();
			const t = document.createElement('h1');
			t.className = 'presenter-title';
			t.textContent = s.title;
			slideBox.append(t);

			if (s.subtitle) {
				const sub = document.createElement('h3');
				sub.className = 'presenter-subtitle';
				sub.textContent = s.subtitle;
				slideBox.append(sub);
			}

			if (s.bullets && s.bullets.length > 0) {
				const ul = document.createElement('ul');
				ul.className = 'presenter-bullets';
				for (const b of s.bullets) {
					const li = document.createElement('li');
					li.textContent = b;
					ul.append(li);
				}
				slideBox.append(ul);
			}

			if (s.code) {
				const pre = document.createElement('pre');
				pre.className = 'presenter-code';
				const codeEl = document.createElement('code');
				codeEl.textContent = s.code;
				pre.append(codeEl);
				slideBox.append(pre);
			}

			notesDrawer.textContent = s.notes ? `Speaker Notes: ${s.notes}` : 'No speaker notes for this slide.';
		}

		function onKey(e) {
			if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
				e.preventDefault();
				if (pIndex < deck.slides.length - 1) { pIndex++; renderCurrent(); }
			} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
				e.preventDefault();
				if (pIndex > 0) { pIndex--; renderCurrent(); }
			} else if (e.key === 'Escape') {
				cleanup();
			}
		}

		function cleanup() {
			window.removeEventListener('keydown', onKey);
			overlay.remove();
		}

		pPrev.addEventListener('click', () => { if (pIndex > 0) { pIndex--; renderCurrent(); } });
		pNext.addEventListener('click', () => { if (pIndex < deck.slides.length - 1) { pIndex++; renderCurrent(); } });
		pNotesToggle.addEventListener('click', () => {
			notesDrawer.style.display = notesDrawer.style.display === 'none' ? 'block' : 'none';
		});
		pClose.addEventListener('click', cleanup);
		window.addEventListener('keydown', onKey);

		renderCurrent();
	}

	window.YanaMarkdown = { render, parseSlideDeck, renderSlideDeckElement };
})();
