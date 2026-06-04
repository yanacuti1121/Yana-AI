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

  const MAX_PETALS = 50;
  let paused = false;

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

  /* ── Vẽ lá sen trên canvas ─────────────────────────────────────────── */
  function drawLeaf(ctx, x, y, r, rot, hue, sat, lit, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.68);
    const notch = rand(22, 32) * Math.PI / 180;
    const a1 = -Math.PI / 2 + notch / 2;
    const a2 = -Math.PI / 2 - notch / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * Math.cos(a1), r * Math.sin(a1));
    ctx.arc(0, 0, r, a1, a2, false);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, `hsla(${hue},${sat}%,${lit + 10}%,${alpha})`);
    g.addColorStop(1, `hsla(${hue},${sat - 8}%,${lit - 6}%,${alpha * 0.7})`);
    ctx.fillStyle = g;
    ctx.fill();
    // Gân lá
    ctx.strokeStyle = `hsla(${hue},${sat}%,${lit - 10}%,${alpha * 0.35})`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const vAngle = -Math.PI / 2 + (i - 2) * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.9 * Math.cos(vAngle), r * 0.9 * Math.sin(vAngle));
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── Vẽ hoa sen trên canvas ─────────────────────────────────────────── */
  function drawFlower(ctx, x, y, sz, pc, r1, g1, b1, r2, g2, b2) {
    const pw = sz * 0.36, ph = sz * 0.70;
    const openY = sz * 0.28;
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < pc; i++) {
      const angle = (Math.PI * 2 / pc) * i;
      ctx.save();
      ctx.rotate(angle);
      ctx.translate(0, -openY);
      const g = ctx.createLinearGradient(0, -ph, 0, ph * 0.3);
      g.addColorStop(0, `rgba(${r1},${g1},${b1},0.92)`);
      g.addColorStop(1, `rgba(${r2},${g2},${b2},0.75)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      // cánh nhọn trên tròn dưới
      ctx.moveTo(0, -ph);
      ctx.bezierCurveTo( pw * 0.5, -ph * 0.75,  pw, 0,  pw, ph * 0.25);
      ctx.bezierCurveTo( pw * 0.75, ph * 0.65,  pw * 0.3, ph * 0.9, 0, ph * 0.9);
      ctx.bezierCurveTo(-pw * 0.3,  ph * 0.9, -pw * 0.75, ph * 0.65, -pw, ph * 0.25);
      ctx.bezierCurveTo(-pw, 0, -pw * 0.5, -ph * 0.75, 0, -ph);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Nhụy
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 0.18);
    cg.addColorStop(0, 'rgba(255,230,80,0.95)');
    cg.addColorStop(1, 'rgba(255,160,30,0.8)');
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.restore();
  }

  /* ── Vẽ cảnh hồ sen → canvas → background-image ────────────────────── */
  function initPond() {
    const W = window.innerWidth;
    const H = Math.round(window.innerHeight * 0.38); // 38% chiều cao màn hình
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const pinkPairs = [
      [255,75,130,  220,35,90],
      [255,100,150, 230,55,105],
      [240,55,105,  200,25,75],
      [255,130,168, 240,75,120],
    ];

    // Lá sen — trải 3 hàng sâu
    const leafN = Math.max(8, Math.round(W / 75));
    for (let i = 0; i < leafN; i++) {
      const row  = Math.floor(i % 3);            // 3 hàng
      const lx   = (i / leafN) * W + rand(-30, 30);
      const ly   = H * (0.55 + row * 0.18) + rand(-15, 15);
      const r    = rand(30, 58);
      const rot  = rand(-0.45, 0.45);
      const hue  = rand(138, 162);
      const sat  = rand(48, 66);
      const lit  = rand(22, 38);
      const a    = rand(0.55, 0.75);
      drawLeaf(ctx, lx, ly, r, rot, hue, sat, lit, a);
    }

    // Hoa sen — rải giữa các lá
    const flowerN = Math.max(4, Math.round(W / 180));
    for (let i = 0; i < flowerN; i++) {
      const fx  = ((i + 0.4) / flowerN) * W * 0.92 + rand(-20, 20);
      const fy  = H * rand(0.45, 0.82);
      const sz  = rand(20, 34);
      const pc  = pick([6, 7, 8]);
      const pp  = pick(pinkPairs);
      drawFlower(ctx, fx, fy, sz, pc, pp[0],pp[1],pp[2], pp[3],pp[4],pp[5]);
    }

    const bg = document.createElement('div');
    bg.style.cssText = `
      position:absolute; bottom:0; left:0; right:0; height:${H}px;
      background:url(${canvas.toDataURL()}) bottom left / 100% 100% no-repeat;
      z-index:-1; pointer-events:none;
      opacity:0.82;
      mask-image:linear-gradient(to top, black 50%, rgba(0,0,0,.75) 75%, transparent 100%);
      -webkit-mask-image:linear-gradient(to top, black 50%, rgba(0,0,0,.75) 75%, transparent 100%);
    `;
    document.body.appendChild(bg);
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

  /* ── Start ──────────────────────────────────────────────────────────── */
  function start() {
    initPond();
    burst(8, 500);

    // Cánh rơi đều
    setInterval(() => {
      if (paused) return;
      burst(Math.random() < .25 ? 4 : Math.random() < .5 ? 3 : 2);
    }, 1400);

    // Bông hoa đầy đủ rơi mỗi ~12s
    setInterval(() => {
      if (paused) return;
      if (Math.random() < .65) createFullLotus();
    }, 12000);

    // Burst lớn mỗi ~18s
    setInterval(() => {
      if (paused) return;
      if (Math.random() < .6) burst(rand(5,9)|0, 0);
    }, 18000);

    // Float chậm mỗi 8s
    setInterval(() => {
      if (paused) return;
      if (Math.random() < .7) createPetal({ type: 'float', left: rand(0, 90) });
    }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
