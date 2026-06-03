// Water background — animated liquid glass effect
// Injects a fullscreen SVG turbulence water layer behind all content
(function () {
  const CSS = `
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
  opacity: 0.18;
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

    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    window.addEventListener('resize', () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    // Wave parameters
    const waves = [
      { amp: 28, freq: 0.012, speed: 0.6,  phase: 0,    color: 'rgba(147,197,253,' },
      { amp: 18, freq: 0.019, speed: 0.9,  phase: 1.2,  color: 'rgba(99,179,237,'  },
      { amp: 12, freq: 0.028, speed: 1.2,  phase: 2.4,  color: 'rgba(186,230,253,' },
      { amp: 22, freq: 0.015, speed: 0.45, phase: 3.8,  color: 'rgba(125,211,252,' },
    ];

    let t = 0;

    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      waves.forEach((wave, wi) => {
        ctx.beginPath();
        const yBase = h * (0.25 + wi * 0.18);

        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 3) {
          const y = yBase
            + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * wave.amp
            + Math.sin(x * wave.freq * 1.7 + t * wave.speed * 0.6) * (wave.amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();

        const grad = ctx.createLinearGradient(0, yBase - wave.amp, 0, h);
        grad.addColorStop(0,   wave.color + '0.10)');
        grad.addColorStop(0.3, wave.color + '0.22)');
        grad.addColorStop(1,   wave.color + '0.06)');
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // Caustic shimmer dots
      ctx.save();
      for (let i = 0; i < 18; i++) {
        const bx = (Math.sin(t * 0.3 + i * 1.7) * 0.5 + 0.5) * w;
        const by = (Math.sin(t * 0.2 + i * 2.3) * 0.5 + 0.5) * h;
        const r  = 2 + Math.sin(t * 0.8 + i) * 1.5;
        const g  = ctx.createRadialGradient(bx, by, 0, bx, by, r * 3);
        g.addColorStop(0,   'rgba(255,255,255,0.55)');
        g.addColorStop(0.4, 'rgba(147,210,253,0.18)');
        g.addColorStop(1,   'rgba(147,210,253,0)');
        ctx.beginPath();
        ctx.arc(bx, by, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();

      t += 0.012;
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
