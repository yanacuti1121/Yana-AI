// Water Droplet Effects — ported from JNMT
// Standalone: just include this script, no HTML changes needed.
// Automatically finds nav/glass elements and adds condensation drops.

(function () {
  // ── CSS ──────────────────────────────────────────────────────────────────
  const CSS = `
@keyframes drop-fall {
  0%   { transform: translate(0, 0)     scaleY(1);    opacity: 0;    }
  6%   {                                               opacity: 0.82; }
  30%  { transform: translate(2px, 25%) scaleY(1.18); opacity: 0.75; }
  65%  { transform: translate(-1px,62%) scaleY(1.10); opacity: 0.55; }
  88%  { transform: translate(1px, 90%) scaleY(1.04); opacity: 0.30; }
  100% { transform: translate(0, 110%)  scaleY(0.90); opacity: 0;    }
}
@keyframes drop-form {
  0%,100% { transform: scale(0.85) scaleY(0.90); opacity: 0.55; }
  45%     { transform: scale(1.05) scaleY(1.12); opacity: 0.88; }
}
@keyframes wd-shimmer {
  0%,100% { opacity: 0.35; }
  50%      { opacity: 0.75; }
}
.wd-drop {
  position: absolute; pointer-events: none; z-index: 9;
  border-radius: 50% 50% 60% 60%;
  background: radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.25) 70%);
  border: 0.5px solid rgba(255,255,255,0.50);
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.80), 0 1px 3px rgba(0,0,0,0.07);
  animation: drop-fall var(--wd-dur,4s) var(--wd-delay,0s) linear infinite;
}
.wd-still {
  position: absolute; pointer-events: none; z-index: 9;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.18) 80%);
  border: 0.5px solid rgba(255,255,255,0.45);
  box-shadow: inset 0 0.5px 1px rgba(255,255,255,0.85);
  animation: drop-form var(--wd-sdur,3s) var(--wd-sdelay,0s) ease-in-out infinite;
}
.wd-layer {
  position: absolute; inset: 0; pointer-events: none; z-index: 8;
  border-radius: inherit;
  background-image:
    radial-gradient(ellipse 5px 7px at 14% 10%, rgba(255,255,255,0.38) 0%, transparent 75%),
    radial-gradient(ellipse 4px 5px at 68%  7%, rgba(255,255,255,0.30) 0%, transparent 75%),
    radial-gradient(ellipse 6px 8px at 38% 20%, rgba(255,255,255,0.26) 0%, transparent 75%),
    radial-gradient(ellipse 4px 6px at 82% 18%, rgba(255,255,255,0.32) 0%, transparent 75%),
    radial-gradient(ellipse 3px 4px at 55% 13%, rgba(255,255,255,0.28) 0%, transparent 75%),
    radial-gradient(ellipse 7px 9px at 25% 30%, rgba(255,255,255,0.22) 0%, transparent 75%);
  animation: wd-shimmer 7s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .wd-drop, .wd-still, .wd-layer { animation: none !important; }
}`;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // ── Spawn drops on an element ─────────────────────────────────────────────
  function spawnDrops(el) {
    if (el.dataset.wdDone) return;
    el.dataset.wdDone = '1';

    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';

    // Condensation layer
    const layer = document.createElement('div');
    layer.className = 'wd-layer';
    el.appendChild(layer);

    // 2-4 falling drops
    const nFall = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nFall; i++) {
      const d = document.createElement('span');
      d.className = 'wd-drop';
      const w = 4 + Math.random() * 3;
      d.style.cssText = `
        left:${5 + Math.random() * 88}%;
        top:0; width:${w}px; height:${w * 1.4}px;
      `;
      d.style.setProperty('--wd-dur',   (3.5 + Math.random() * 4)  + 's');
      d.style.setProperty('--wd-delay', (Math.random() * 7)         + 's');
      el.appendChild(d);
    }

    // 3-6 still dots
    const nStill = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nStill; i++) {
      const s = document.createElement('span');
      s.className = 'wd-still';
      const sz = 3 + Math.random() * 5;
      s.style.cssText = `
        left:${Math.random() * 90}%;
        top:${5 + Math.random() * 55}%;
        width:${sz}px; height:${sz * 1.2}px;
      `;
      s.style.setProperty('--wd-sdur',   (2.5 + Math.random() * 3) + 's');
      s.style.setProperty('--wd-sdelay', (Math.random() * 5)        + 's');
      el.appendChild(s);
    }
  }

  // ── Find targets after DOM ready ──────────────────────────────────────────
  function init() {
    // Nav bar
    const nav = document.querySelector('nav, .nav, header, .nav-bar, .app-nav-bar');
    if (nav) spawnDrops(nav);

    // Hero / terminal / feature cards — first 2 only (performance)
    const cards = document.querySelectorAll(
      '.terminal, .feature-tile, .hero-card, .glass, .stat-card, .app-window'
    );
    Array.from(cards).slice(0, 2).forEach(spawnDrops);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
