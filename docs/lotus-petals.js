// Lotus Petals — cánh sen rơi nhẹ
// Standalone: chỉ cần include script, không cần thay đổi HTML
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
  .lp-wrap {
    position: fixed; inset: 0; pointer-events: none;
    z-index: 4; overflow: hidden;
  }
  .lp {
    position: absolute;
    pointer-events: none;
    will-change: transform, opacity;
    transform-origin: 50% 65%;
  }

  /* ── 3 hình dạng cánh sen — nhọn trên, tròn dưới ── */
  .lp-a {
    border-radius: 50% 50% 45% 45% / 85% 85% 15% 15%;
  }
  .lp-b {
    border-radius: 45% 55% 48% 52% / 82% 82% 18% 18%;
  }
  .lp-c {
    border-radius: 50% 50% 42% 42% / 88% 88% 12% 12%;
  }

  /* ── Rơi chính ── */
  @keyframes lp-fall {
    0%   { opacity: 0;   transform: translateY(-50px) translateX(0)            rotate(var(--r0))   scale(1); }
    6%   { opacity: .92; }
    30%  { transform: translateY(28vh)  translateX(var(--dx1))  rotate(var(--r1))  scale(var(--s1)); }
    60%  { transform: translateY(60vh)  translateX(var(--dx2))  rotate(var(--r2))  scale(var(--s2)); opacity: .75; }
    90%  { opacity: .45; }
    100% { opacity: 0;   transform: translateY(108vh) translateX(var(--dx3))  rotate(var(--r3))  scale(.7); }
  }

  /* ── Xoáy nhanh (petal nhỏ) ── */
  @keyframes lp-spin {
    0%   { opacity: 0;   transform: translateY(-30px) translateX(0) rotate(0deg) scale(.6); }
    8%   { opacity: .8; }
    100% { opacity: 0;   transform: translateY(105vh) translateX(var(--dx3)) rotate(720deg) scale(.5); }
  }

  /* ── Trôi ngang (petal lớn nhẹ) ── */
  @keyframes lp-float {
    0%   { opacity: 0;   transform: translate(-10px, 20vh) rotate(var(--r0)) scale(1.1); }
    12%  { opacity: .7; }
    50%  { transform: translate(var(--dx2), 52vh) rotate(var(--r2)) scale(1.05); }
    90%  { opacity: .4; }
    100% { opacity: 0;   transform: translate(var(--dx3), 96vh) rotate(var(--r3)) scale(.85); }
  }

  /* ── Hạt phấn nhỏ ── */
  @keyframes lp-dust {
    0%   { opacity: 0;   transform: translate(0, 0) scale(1); }
    15%  { opacity: .65; }
    100% { opacity: 0;   transform: translate(var(--dx3), 100vh) scale(.4); }
  }
  `;
  document.head.appendChild(style);

  const MAX_PETALS = 50;
  let paused = false;

  /* ── Container ───────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'lp-wrap';
  document.body.appendChild(wrap);

  /* ── Pause khi tab ẩn, dọn khi quay lại ─────────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true;
      // Xóa hết cánh đang tích khi tab bị ẩn
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    } else {
      paused = false;
    }
  });

  /* ── Màu sắc — hoa sen thật: đậm bão hòa, không nhạt như hoa hồng ── */
  const PALETTES = [
    // Sen hồng đậm
    ['rgba(255,75,130,OP)', 'rgba(220,35,90,OP)'],
    // Sen hồng tươi
    ['rgba(255,100,150,OP)', 'rgba(230,55,105,OP)'],
    // Sen hồng vừa
    ['rgba(255,130,168,OP)', 'rgba(240,75,120,OP)'],
    // Sen đỏ hồng
    ['rgba(240,55,105,OP)', 'rgba(200,25,75,OP)'],
    // Sen hồng sáng (cánh ngoài)
    ['rgba(255,160,190,OP)', 'rgba(245,110,150,OP)'],
    // Sen hồng đậm nhất
    ['rgba(250,60,115,OP)', 'rgba(210,20,70,OP)'],
  ];

  function mkColor(pair, opacity) {
    return pair.map(c => c.replace('OP', opacity.toFixed(2)));
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ── Tạo cánh sen ───────────────────────────────────────────────────── */
  function createPetal(opts = {}) {
    const el = document.createElement('div');
    el.className = 'lp';

    const type = opts.type || pick(['fall','fall','fall','spin','float']);
    const size = opts.size || (type === 'spin' ? rand(5,10) : type === 'float' ? rand(16,28) : rand(8,20));
    const palette = mkColor(pick(PALETTES), rand(.65, .92));
    const shape = pick(['lp-a','lp-b','lp-c']);
    el.classList.add(shape);

    const left = opts.left !== undefined ? opts.left : rand(0, 98);
    const dur  = type === 'spin' ? rand(4,7) : type === 'float' ? rand(10,16) : rand(7,14);
    const delay = opts.delay !== undefined ? opts.delay : rand(0, 0.5);

    const dx1 = rand(-60, 60);
    const dx2 = dx1 + rand(-50, 50);
    const dx3 = dx2 + rand(-40, 40);
    const r0  = rand(-40, 40);
    const r1  = r0  + rand(-60, 60);
    const r2  = r1  + rand(-80, 80);
    const r3  = r2  + rand(-120, 120);
    const s1  = rand(.88, 1.08);
    const s2  = rand(.80, 1.05);

    // Sheen highlight
    const sheen = `linear-gradient(135deg, rgba(255,255,255,.45) 0%, transparent 55%, rgba(255,255,255,.08) 100%)`;

    el.style.cssText = `
      left: ${left}%;
      top: 0;
      width: ${size}px;
      height: ${size * 2.2}px;
      background: linear-gradient(148deg, ${palette[0]}, ${palette[1]});
      box-shadow: inset 0 1px 3px rgba(255,255,255,.5), 0 2px 6px rgba(180,60,100,.12);
      --dx1: ${dx1}px; --dx2: ${dx2}px; --dx3: ${dx3}px;
      --r0: ${r0}deg;  --r1: ${r1}deg;  --r2: ${r2}deg;  --r3: ${r3}deg;
      --s1: ${s1};     --s2: ${s2};
      animation: lp-${type} ${dur}s ${delay}s ease-in-out forwards;
    `;

    // Sheen overlay
    const shine = document.createElement('div');
    shine.style.cssText = `
      position:absolute; inset:0; border-radius:inherit;
      background:${sheen}; pointer-events:none;
    `;
    el.appendChild(shine);

    if (wrap.children.length >= MAX_PETALS) return;
    wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /* ── Hạt phấn (chấm nhỏ) ─────────────────────────────────────────────── */
  function createDust() {
    const el = document.createElement('div');
    el.className = 'lp';
    const size = rand(2, 4.5);
    const palette = mkColor(pick(PALETTES), rand(.4, .7));
    const left = rand(0, 99);
    const dur  = rand(5, 9);
    const delay = rand(0, 0.8);
    const dx3 = rand(-80, 80);

    el.style.cssText = `
      left: ${left}%;
      top: 0;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: radial-gradient(circle, ${palette[0]}, ${palette[1]});
      --dx3: ${dx3}px;
      animation: lp-dust ${dur}s ${delay}s ease-in forwards;
    `;
    if (wrap.children.length >= MAX_PETALS) return;
    wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /* ── Burst đợt nhiều cánh ────────────────────────────────────────────── */
  function burst(count, baseDelay = 0) {
    for (let i = 0; i < count; i++) {
      setTimeout(createPetal, baseDelay + i * rand(80, 220));
    }
    // Vài hạt phấn kèm theo
    const dustCount = Math.ceil(count * .6);
    for (let i = 0; i < dustCount; i++) {
      setTimeout(createDust, baseDelay + i * rand(100, 300));
    }
  }

  /* ── Khởi động ───────────────────────────────────────────────────────── */
  function start() {
    // Burst đầu tiên
    burst(10, 400);

    // Nhịp thường — 2–3 cánh mỗi 1.4s
    setInterval(() => {
      if (paused) return;
      const n = Math.random() < .25 ? 4 : Math.random() < .5 ? 3 : 2;
      burst(n);
    }, 1400);

    // Burst lớn ngẫu nhiên mỗi ~18s
    setInterval(() => {
      if (paused) return;
      if (Math.random() < .6) burst(rand(6, 10) | 0, 0);
    }, 18000);

    // Float lớn mỗi ~8s
    setInterval(() => {
      if (paused) return;
      if (Math.random() < .7) {
        createPetal({ type: 'float', size: rand(18, 32), left: rand(0, 90) });
      }
    }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
