// Lotus Petals — cánh sen + bông hoa rơi + cảnh hồ sen
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
  .lp-wrap {
    position:fixed; inset:0; pointer-events:none;
    z-index:4; overflow:hidden;
  }

  /* ── Ánh nắng ──────────────────────────────────────────────────────── */
  .lp-sun {
    position:fixed; inset:0; pointer-events:none; z-index:2;
    overflow:hidden;
  }
  .lp-sun::before {
    content:'';
    position:absolute;
    top:-20%; right:-10%;
    width:80vw; height:80vw;
    background: conic-gradient(
      from 200deg at 80% 10%,
      transparent 0deg,
      rgba(255,240,180,.07) 8deg,
      transparent 14deg,
      transparent 22deg,
      rgba(255,235,160,.05) 28deg,
      transparent 34deg,
      transparent 44deg,
      rgba(255,245,200,.06) 48deg,
      transparent 54deg,
      transparent 66deg,
      rgba(255,238,170,.04) 70deg,
      transparent 76deg,
      transparent 90deg,
      rgba(255,242,185,.05) 94deg,
      transparent 100deg,
      transparent 360deg
    );
    animation: lp-sun-rot 28s linear infinite;
    transform-origin: 80% 10%;
    border-radius: 50%;
  }
  .lp-sun::after {
    content:'';
    position:absolute;
    top:-5%; right:5%;
    width:40vw; height:40vw;
    background: radial-gradient(ellipse at center,
      rgba(255,248,210,.22) 0%,
      rgba(255,240,170,.10) 35%,
      rgba(255,235,150,.04) 60%,
      transparent 80%
    );
    animation: lp-sun-pulse 6s ease-in-out infinite;
    border-radius: 50%;
  }
  @keyframes lp-sun-rot {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes lp-sun-pulse {
    0%,100% { opacity:.7; transform: scale(1); }
    50%     { opacity:1;  transform: scale(1.08); }
  }

  /* Hạt bụi ánh sáng lơ lửng */
  .lp-mote {
    position:absolute; pointer-events:none; border-radius:50%;
    background: radial-gradient(circle, rgba(255,248,200,.9), rgba(255,240,160,.3));
    animation: lp-mote-float var(--md) var(--mdelay) ease-in-out infinite alternate;
  }
  @keyframes lp-mote-float {
    0%   { transform: translate(0,0) scale(1);    opacity: var(--mo); }
    100% { transform: translate(var(--mx),var(--my)) scale(1.4); opacity: calc(var(--mo) * .4); }
  }
  .lp {
    position:absolute; pointer-events:none;
    will-change:transform,opacity; transform-origin:50% 65%;
  }
  .lp-a { border-radius:50% 50% 45% 45% / 85% 85% 15% 15%; }
  .lp-b { border-radius:45% 55% 48% 52% / 82% 82% 18% 18%; }
  .lp-c { border-radius:50% 50% 42% 42% / 88% 88% 12% 12%; }

  @keyframes lp-fall {
    0%   { opacity:0; transform:translateY(-50px) translateX(0) rotate(var(--r0)) scale(1); }
    6%   { opacity:.92; }
    30%  { transform:translateY(28vh) translateX(var(--dx1)) rotate(var(--r1)) scale(var(--s1)); }
    60%  { transform:translateY(60vh) translateX(var(--dx2)) rotate(var(--r2)) scale(var(--s2)); opacity:.75; }
    90%  { opacity:.45; }
    100% { opacity:0; transform:translateY(108vh) translateX(var(--dx3)) rotate(var(--r3)) scale(.7); }
  }
  @keyframes lp-spin {
    0%   { opacity:0; transform:translateY(-30px) rotate(0deg) scale(.6); }
    8%   { opacity:.8; }
    100% { opacity:0; transform:translateY(105vh) translateX(var(--dx3)) rotate(720deg) scale(.5); }
  }
  @keyframes lp-float {
    0%   { opacity:0; transform:translate(-10px,20vh) rotate(var(--r0)) scale(1.1); }
    12%  { opacity:.7; }
    50%  { transform:translate(var(--dx2),52vh) rotate(var(--r2)) scale(1.05); }
    90%  { opacity:.4; }
    100% { opacity:0; transform:translate(var(--dx3),96vh) rotate(var(--r3)) scale(.85); }
  }
  @keyframes lp-dust {
    0%   { opacity:0; transform:translate(0,0) scale(1); }
    15%  { opacity:.65; }
    100% { opacity:0; transform:translate(var(--dx3),100vh) scale(.4); }
  }

  `;
  document.head.appendChild(style);

  const MAX_PETALS = 70;
  let paused = false;

  // Ánh nắng layer
  const sun = document.createElement('div');
  sun.className = 'lp-sun';
  document.body.appendChild(sun);

  // Hạt bụi ánh sáng lơ lửng (10 hạt)
  for (let i = 0; i < 10; i++) {
    const m = document.createElement('div');
    m.className = 'lp-mote';
    const sz = rand(2, 5);
    m.style.cssText = `
      left:${rand(50,95)}%; top:${rand(2,55)}%;
      width:${sz}px; height:${sz}px;
      --md:${rand(4,9).toFixed(1)}s;
      --mdelay:-${rand(0,8).toFixed(1)}s;
      --mx:${rand(-30,30).toFixed(0)}px;
      --my:${rand(-20,20).toFixed(0)}px;
      --mo:${rand(.35,.75).toFixed(2)};
    `;
    document.body.appendChild(m);
  }

  const wrap = document.createElement('div');
  wrap.className = 'lp-wrap';
  document.body.appendChild(wrap);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true;
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    } else {
      paused = false;
    }
  });

  const PALETTES = [
    ['rgba(255,75,130,OP)',  'rgba(220,35,90,OP)'],
    ['rgba(255,100,150,OP)', 'rgba(230,55,105,OP)'],
    ['rgba(255,130,168,OP)', 'rgba(240,75,120,OP)'],
    ['rgba(240,55,105,OP)',  'rgba(200,25,75,OP)'],
    ['rgba(255,160,190,OP)', 'rgba(245,110,150,OP)'],
    ['rgba(250,60,115,OP)',  'rgba(210,20,70,OP)'],
  ];

  function mkColor(pair, opacity) { return pair.map(c => c.replace('OP', opacity.toFixed(2))); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ── Cánh sen rời rơi ──────────────────────────────────────────────── */
  function createPetal(opts = {}) {
    const el = document.createElement('div');
    el.className = 'lp';
    const type = opts.type || pick(['fall','fall','fall','spin','float']);
    const size = opts.size || (type === 'spin' ? rand(3,6) : type === 'float' ? rand(5,9) : rand(3,8));
    const palette = mkColor(pick(PALETTES), rand(.65, .92));
    el.classList.add(pick(['lp-a','lp-b','lp-c']));
    const left = opts.left !== undefined ? opts.left : rand(0, 98);
    const topStart = opts.topStart !== undefined ? opts.topStart : rand(-5, 35);
    const dur = type === 'spin' ? rand(4,7) : type === 'float' ? rand(10,16) : rand(7,14);
    const delay = opts.delay !== undefined ? opts.delay : rand(0, 0.5);
    const dx1=rand(-60,60), dx2=dx1+rand(-50,50), dx3=dx2+rand(-40,40);
    const r0=rand(-40,40), r1=r0+rand(-60,60), r2=r1+rand(-80,80), r3=r2+rand(-120,120);
    el.style.cssText = `
      left:${left}%; top:${topStart}%;
      width:${size}px; height:${size*2.2}px;
      background:linear-gradient(148deg,${palette[0]},${palette[1]});
      box-shadow:inset 0 1px 3px rgba(255,255,255,.45);
      --dx1:${dx1}px;--dx2:${dx2}px;--dx3:${dx3}px;
      --r0:${r0}deg;--r1:${r1}deg;--r2:${r2}deg;--r3:${r3}deg;
      --s1:${rand(.88,1.08)};--s2:${rand(.80,1.05)};
      animation:lp-${type} ${dur}s ${delay}s ease-in-out forwards;
    `;
    const shine = document.createElement('div');
    shine.style.cssText = `position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.38) 0%,transparent 55%);pointer-events:none`;
    el.appendChild(shine);
    if (wrap.children.length >= MAX_PETALS) return;
    wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /* ── Bông hoa sen đầy đủ rơi ───────────────────────────────────────── */
  function createFullLotus() {
    if (wrap.children.length >= MAX_PETALS) return;
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;pointer-events:none;will-change:transform,opacity;`;
    const sz = rand(18, 28);
    const pc = pick([6, 7, 8]);
    const palette = mkColor(pick(PALETTES), rand(.78, .96));
    const pw = sz * 0.36, ph = sz * 0.70;

    for (let i = 0; i < pc; i++) {
      const angle = (360 / pc) * i;
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;
        width:${pw}px; height:${ph}px;
        background:linear-gradient(158deg,${palette[0]},${palette[1]});
        border-radius:50% 50% 44% 44% / 84% 84% 16% 16%;
        transform-origin:50% 100%;
        transform:rotate(${angle}deg) translateY(-${sz*0.27}px);
        left:${sz/2 - pw/2}px; top:${sz/2 - ph}px;
        box-shadow:inset 0 1px 3px rgba(255,255,255,.42);
      `;
      box.appendChild(p);
    }
    const c = document.createElement('div');
    const cs = sz * 0.28;
    c.style.cssText = `
      position:absolute; width:${cs}px; height:${cs}px;
      background:radial-gradient(circle,#ffe566,#ffa020);
      border-radius:50%;
      left:${sz/2-cs/2}px; top:${sz/2-cs/2}px;
    `;
    box.appendChild(c);
    box.style.width = `${sz}px`;
    box.style.height = `${sz}px`;

    const dx1=rand(-40,40), dx2=dx1+rand(-40,40), dx3=dx2+rand(-30,30);
    const r0=rand(-20,20), r1=r0+rand(-35,35), r2=r1+rand(-50,50), r3=r2+rand(-60,60);
    box.style.left = `${rand(2,92)}%`;
    box.style.top  = `${rand(-5,20)}%`;
    box.style.setProperty('--dx1',`${dx1}px`);
    box.style.setProperty('--dx2',`${dx2}px`);
    box.style.setProperty('--dx3',`${dx3}px`);
    box.style.setProperty('--r0',`${r0}deg`);
    box.style.setProperty('--r1',`${r1}deg`);
    box.style.setProperty('--r2',`${r2}deg`);
    box.style.setProperty('--r3',`${r3}deg`);
    box.style.setProperty('--s1','1');
    box.style.setProperty('--s2','.9');
    box.style.animation = `lp-fall ${rand(9,15)}s ${rand(0,.5)}s ease-in-out forwards`;
    wrap.appendChild(box);
    box.addEventListener('animationend', () => box.remove(), { once: true });
  }

  /* ── Hạt phấn ──────────────────────────────────────────────────────── */
  function createDust() {
    const el = document.createElement('div');
    el.className = 'lp';
    const size = rand(1.5, 3);
    const palette = mkColor(pick(PALETTES), rand(.4,.7));
    el.style.cssText = `
      left:${rand(0,99)}%; top:0;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:radial-gradient(circle,${palette[0]},${palette[1]});
      --dx3:${rand(-80,80)}px;
      animation:lp-dust ${rand(5,9)}s ${rand(0,.8)}s ease-in forwards;
    `;
    if (wrap.children.length >= MAX_PETALS) return;
    wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /* ── Burst ──────────────────────────────────────────────────────────── */
  function burst(count, baseDelay = 0) {
    for (let i = 0; i < count; i++) {
      setTimeout(createPetal, baseDelay + i * rand(80, 220));
    }
    const dustN = Math.ceil(count * .5);
    for (let i = 0; i < dustN; i++) {
      setTimeout(createDust, baseDelay + i * rand(100, 300));
    }
  }

  /* ── RAF-based scheduler (no setInterval drift) ────────────────────── */
  function start() {
    burst(14, 400);

    const T = { burst: 0, lotus: 0, float: 0, big: 0 };
    const IV = { burst: 900, lotus: 8000, float: 5000, big: 14000 };

    function tick(now) {
      if (!paused) {
        if (now - T.burst > IV.burst) {
          burst(Math.random() < .2 ? 6 : Math.random() < .5 ? 4 : 3);
          T.burst = now;
        }
        if (now - T.lotus > IV.lotus) {
          if (Math.random() < .8) createFullLotus();
          if (Math.random() < .4) createFullLotus(); // đôi khi 2 bông cùng lúc
          T.lotus = now;
        }
        if (now - T.big > IV.big) {
          if (Math.random() < .7) burst(rand(7,12)|0, 0);
          T.big = now;
        }
        if (now - T.float > IV.float) {
          if (Math.random() < .8) createPetal({ type: 'float', left: rand(0, 90) });
          T.float = now;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
