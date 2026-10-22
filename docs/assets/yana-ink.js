/*
 * Hand-drawn ink on the headings (owner 19/10/2026: plain text alone feels flat; add colour
 * and drawn marks like the samples). Each section marks one phrase, each with a different
 * kind of mark so no two sections repeat. A mark draws itself once, the first time its
 * heading scrolls into view (IntersectionObserver adds .is-inked; CSS does the drawing).
 */
(() => {
  'use strict';

  const page = document.querySelector('.home-page');
  if (!page) return;

  // [heading selector, phrase to mark, kind of mark]
  const MARKS = [
    ['#live-demo h2', '60 giây', 'box'],
    ['#how-it-works h2', 'hành động', 'highlight-green'],
    ['#terminal-origin h2', 'terminal', 'circle'],
    ['#prologue h2 em', 'Một lớp quyền hạn', 'rainbow'],
    ['#product-1 h2', 'ranh giới', 'squiggle'],
    ['#product-2 h2', 'nhìn thấy được', 'highlight-yellow'],
    ['#product-3 h2', 'thế giới thật', 'rainbow'],
    ['#capabilities h2', 'từng hành động', 'underline'],
    ['#architecture h2', 'rõ ràng', 'circle'],
    ['#evidence h2', 'mã nguồn', 'box'],
    ['#use-cases h2', 'phạm vi', 'highlight-blue'],
    ['.chapter.narrow h2', 'Ba sản phẩm', 'rainbow'],
  ];
  const WHY_WORDS = ['quyền', 'quyết', 'định']; // lit in rainbow inside the word-by-word heading

  const SVG = {
    underline: '<svg class="ink-svg ink-svg--under" viewBox="0 0 300 26" preserveAspectRatio="none"><path d="M4 17 C 70 7, 150 23, 296 11"/><path d="M34 22 C 120 15, 205 25, 282 18"/></svg>',
    squiggle: '<svg class="ink-svg ink-svg--under" viewBox="0 0 300 24" preserveAspectRatio="none"><path d="M3 14 q 12 -12 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0"/></svg>',
    circle: '<svg class="ink-svg ink-svg--circle" viewBox="0 0 300 120" preserveAspectRatio="none"><path d="M262 22 C 220 2, 60 0, 22 34 C -8 62, 40 112, 150 114 C 258 116, 300 80, 286 46 C 276 22, 232 12, 196 12"/></svg>',
    box: '<span class="ink-box" aria-hidden="true"><i></i><i></i><i></i><i></i></span>',
    burst: '<svg class="ink-svg ink-svg--burst" viewBox="0 0 120 60"><path d="M14 40 L 4 52"/><path d="M24 30 L 22 14"/><path d="M34 40 L 46 30"/><path d="M86 40 L 74 30"/><path d="M96 30 L 98 14"/><path d="M106 40 L 116 52"/></svg>',
  };

  /** Wraps the first occurrence of `phrase` inside `root` (any text node) in a mark span. */
  const wrap = (root, phrase, kind) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(phrase);
      if (at < 0) continue;
      const target = node.splitText(at);
      target.splitText(phrase.length);
      const mark = document.createElement('span');
      mark.className = `ink ink--${kind}`;
      target.replaceWith(mark);
      mark.append(target);
      const art = SVG[kind];
      if (art) mark.insertAdjacentHTML('beforeend', art.replace('<svg ', '<svg aria-hidden="true" '));
      // Keep a trailing full stop or comma on the same line as the marked words.
      const next = mark.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && /^[.,!?]/.test(next.data)) {
        const keep = document.createElement('span');
        keep.className = 'ink-keep';
        mark.replaceWith(keep);
        next.splitText(1);
        keep.append(mark, next);
      }
      return mark;
    }
    return null;
  };

  const marks = MARKS.map(([selector, phrase, kind]) => {
    const heading = page.querySelector(selector);
    const mark = heading && wrap(heading, phrase, kind);
    if (heading && !mark) console.warn(`[yana-ink] phrase not found: "${phrase}" in ${selector}`);
    return mark;
  }).filter(Boolean);

  // The "why" heading is split into word spans by yana-motion-2026.js (it runs first).
  page.querySelectorAll('.home-why h2 .w').forEach(word => {
    if (WHY_WORDS.includes(word.textContent)) word.classList.add('ink-rainbow-word');
  });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    marks.forEach(mark => mark.classList.add('is-inked'));
    return;
  }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-inked');
    observer.unobserve(entry.target);
  }), { threshold: 0.8 });
  marks.forEach(mark => observer.observe(mark));
})();
