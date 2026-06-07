// Lotus Pond background — hồ sen Việt Nam
// Trắng trong, xanh ngọc nhạt, ánh vàng, hồng sen
(function () {
  const CSS = `
html, body {
  background: hsl(150 35% 97%) !important;
}
#water-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  width: 100%; height: 100%;
  overflow: hidden;
}
#water-bg canvas {
  width: 100%; height: 100%;
}
body { isolation: isolate; }
`;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  function init() {
    const wrap = document.createElement('div');
    wrap.id = 'water-bg';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    document.body.insertBefore(wrap, document.body.firstChild);

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    const ctx = canvas.getContext('2d');

    // Hồ sen palette
    const waves = [
      { amp: 18, freq: 0.009, speed: 0.25, phase: 0,   color: [134, 210, 174] }, // celadon
      { amp: 12, freq: 0.014, speed: 0.38, phase: 1.5, color: [167, 221, 196] }, // jade nhạt
      { amp: 22, freq: 0.007, speed: 0.18, phase: 2.8, color: [200, 232, 213] }, // xanh ngọc nhạt
      { amp: 10, freq: 0.020, speed: 0.50, phase: 4.1, color: [236, 202, 210] }, // hồng sen nhạt
      { amp: 15, freq: 0.011, speed: 0.30, phase: 5.3, color: [218, 235, 225] }, // trắng xanh
    ];

    let t = 0;
    let _lastFrame = 0;
    const _FRAME_MS = 1000 / 30; // throttle to 30fps

    // Floating lotus petals
    const petals = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(),
      y: 0.1 + Math.random() * 0.8,
      size: 18 + Math.random() * 22,
      rot: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.003,
      drift: (Math.random() - 0.5) * 0.0008,
      phase: Math.random() * Math.PI * 2,
    }));

    function drawPetal(cx, cy, size, rot, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      // Simple ellipse petal
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.5, size * 0.28, size * 0.55, 0, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(0, -size * 0.3, 0, 0, -size * 0.3, size * 0.6);
      g.addColorStop(0,   'rgba(255,230,235,0.95)');
      g.addColorStop(0.6, 'rgba(245,180,195,0.75)');
      g.addColorStop(1,   'rgba(230,140,165,0.30)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    function draw(now) {
      if (now - _lastFrame < _FRAME_MS) { requestAnimationFrame(draw); return; }
      _lastFrame = now;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Base gradient — trắng trong → xanh ngọc nhạt
      const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
      bg.addColorStop(0,   'rgba(240,250,245,1.0)');
      bg.addColorStop(0.5, 'rgba(220,242,232,0.95)');
      bg.addColorStop(1,   'rgba(200,235,220,0.90)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Water waves
      waves.forEach((wave, wi) => {
        const yBase = h * (0.1 + wi * 0.2);
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 4) {
          const y = yBase
            + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * wave.amp
            + Math.sin(x * wave.freq * 2.1 + t * wave.speed * 0.7 + 1) * (wave.amp * 0.35);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();

        const [r, g, b] = wave.color;
        const grad = ctx.createLinearGradient(0, yBase - wave.amp, 0, h);
        grad.addColorStop(0,   `rgba(${r},${g},${b},0.08)`);
        grad.addColorStop(0.4, `rgba(${r},${g},${b},0.18)`);
        grad.addColorStop(1,   `rgba(${r},${g},${b},0.06)`);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // Sunlight caustics — ánh vàng trên mặt nước
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const bx = (Math.sin(t * 0.22 + i * 1.9) * 0.5 + 0.5) * w;
        const by = (Math.sin(t * 0.15 + i * 2.7) * 0.5 + 0.5) * h * 0.7;
        const r  = 8 + Math.sin(t * 0.6 + i) * 5;
        const cg = ctx.createRadialGradient(bx, by, 0, bx, by, r * 4);
        cg.addColorStop(0,   'rgba(255,245,200,0.45)');
        cg.addColorStop(0.3, 'rgba(255,235,160,0.15)');
        cg.addColorStop(1,   'rgba(255,235,160,0)');
        ctx.beginPath();
        ctx.arc(bx, by, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();
      }
      ctx.restore();

      // Floating lotus petals
      petals.forEach(p => {
        p.x += p.drift + Math.sin(t * 0.1 + p.phase) * 0.0003;
        p.y += p.speed * 0.15;
        p.rot += 0.002;
        if (p.y > 1.1) { p.y = -0.05; p.x = Math.random(); }
        const alpha = 0.25 + Math.sin(t * 0.3 + p.phase) * 0.1;
        drawPetal(p.x * w, p.y * h, p.size, p.rot, alpha);
      });

      // Water ripple circles
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const rx = (0.2 + i * 0.3) * w + Math.sin(t * 0.08 + i) * 30;
        const ry = (0.3 + i * 0.2) * h + Math.cos(t * 0.06 + i * 1.5) * 20;
        const rr = (30 + i * 20) + Math.sin(t * 0.4 + i) * 8;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr, rr * 0.35, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120,190,155,${0.08 + Math.sin(t * 0.3 + i) * 0.04})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      t += 0.016; // 30fps equivalent
      requestAnimationFrame(draw);
    }

    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
