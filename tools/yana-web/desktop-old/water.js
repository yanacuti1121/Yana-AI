/* Yana AI — Living Water
   Canvas ripple system: ambient auto-ripples + mouse/touch interaction.
   Renders soft expanding ring waves on the .scene layer, like stones
   dropped into a still lake surface.                                   */

(function initYanaWater() {
  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Wait for React to mount the scene
  let tries = 0;
  const tryInit = function () {
    const scene = document.querySelector('.scene');
    if (!scene) {
      if (++tries < 20) setTimeout(tryInit, 150);
      return;
    }

    // Create + mount canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'yana-ripple-canvas';
    scene.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const ripples = [];   // { x, y, t, maxR, alpha }

    /* ── sizing ───────────────────────────────────────── */
    function resize() {
      const r = scene.getBoundingClientRect();
      canvas.width  = Math.round(r.width);
      canvas.height = Math.round(r.height);
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── add a ripple ─────────────────────────────────── */
    function addRipple(x, y, maxR, alpha) {
      ripples.push({ x, y, t: 0, maxR: maxR || 140, alpha: alpha || 0.18 });
    }

    /* ── mouse: gentle ripple on slow move ────────────── */
    let lastMove = 0;
    scene.addEventListener('mousemove', function (e) {
      const now = Date.now();
      // throttle: one ripple per 350ms, random skip for natural feel
      if (now - lastMove < 350 || Math.random() > 0.55) return;
      lastMove = now;
      const r = canvas.getBoundingClientRect();
      addRipple(e.clientX - r.left, e.clientY - r.top, 100, 0.10);
    }, { passive: true });

    /* ── click / tap: strong ripple ──────────────────── */
    scene.addEventListener('click', function (e) {
      const r = canvas.getBoundingClientRect();
      addRipple(e.clientX - r.left, e.clientY - r.top, 220, 0.28);
      // second smaller echo ring
      setTimeout(function () {
        addRipple(e.clientX - r.left, e.clientY - r.top, 140, 0.14);
      }, 180);
    });

    scene.addEventListener('touchstart', function (e) {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      addRipple(t.clientX - r.left, t.clientY - r.top, 200, 0.24);
    }, { passive: true });

    /* ── ambient auto-ripples ─────────────────────────── */
    function scheduleAmbient() {
      const delay = 1800 + Math.random() * 3400;
      setTimeout(function () {
        const w = canvas.width, h = canvas.height;
        // Ripples prefer the lower 40% of the scene (the "lake surface")
        const x = w * (0.08 + Math.random() * 0.84);
        const y = h * (0.55 + Math.random() * 0.40);
        addRipple(x, y, 60 + Math.random() * 90, 0.06 + Math.random() * 0.08);
        scheduleAmbient();
      }, delay);
    }
    // Two independent ambient sources
    scheduleAmbient();
    setTimeout(scheduleAmbient, 1000);

    /* ── draw loop ────────────────────────────────────── */
    let lastFrame = 0;
    function draw(ts) {
      requestAnimationFrame(draw);

      // ~60 fps cap (no need to run faster)
      if (ts - lastFrame < 14) return;
      lastFrame = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        rip.t += 0.006;          // speed: full expansion over ~167 frames ≈ 2.8 s

        if (rip.t >= 1) {
          ripples.splice(i, 1);
          continue;
        }

        // Ease-out cubic: fast start, slow fade
        const ease = 1 - Math.pow(1 - rip.t, 3);
        const radius = ease * rip.maxR;
        const fade   = (1 - rip.t) * (1 - rip.t);  // quadratic fall-off

        // Primary ring
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (rip.alpha * fade).toFixed(3) + ')';
        ctx.lineWidth = 1.6 * (1 - rip.t * 0.8);
        ctx.stroke();

        // Inner trailing ring (slightly behind, softer)
        if (rip.t > 0.12) {
          const r2 = ease * rip.maxR * 0.62;
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, r2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,' + (rip.alpha * fade * 0.35).toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  };

  setTimeout(tryInit, 400);

  /* ── Card ripple: CSS ripple spawned on click ─────────────── */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.card-interactive');
    if (!card) return;
    var rect = card.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var el = document.createElement('span');
    el.className = 'card-ripple';
    el.style.cssText = [
      'width:'  + size + 'px',
      'height:' + size + 'px',
      'left:'   + (e.clientX - rect.left - size / 2) + 'px',
      'top:'    + (e.clientY - rect.top  - size / 2) + 'px',
    ].join(';');
    card.appendChild(el);
    setTimeout(function () { el.remove(); }, 600);
  });

  /* ── Global ripple ring: iOS-style expanding ring on every click ── */
  document.addEventListener('click', function (e) {
    var SIZE = 40;
    var el = document.createElement('div');
    el.className = 'ripple-ring';
    el.style.cssText = [
      'width:'  + SIZE + 'px',
      'height:' + SIZE + 'px',
      'left:'   + (e.clientX - SIZE / 2) + 'px',
      'top:'    + (e.clientY - SIZE / 2) + 'px',
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 600);
  });

  /* ── Message ripple: new message appears → ripple from message's position ── */
  var msgObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mut) {
      mut.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        var hasMsgIn = node.classList && node.classList.contains('msg-in');
        var childMsgIn = !hasMsgIn && node.querySelector && node.querySelector('.msg-in');
        var target = hasMsgIn ? node : childMsgIn;
        if (!target) return;
        var cr = target.getBoundingClientRect();
        var scr = canvas.getBoundingClientRect();
        // ripple from bottom-left of user bubble, bottom-right of assistant bubble
        var isUser = target.style.alignItems === 'flex-end' || (target.querySelector && target.querySelector('[style*="flex-end"]'));
        var rx = isUser ? cr.right - scr.left - 20 : cr.left - scr.left + 20;
        var ry = cr.bottom - scr.top;
        addRipple(rx, ry, 160, 0.18);
      });
    });
  });

  // Watch the chat message list — wait until it exists
  function watchMsgList() {
    var msgList = document.querySelector('[class*="chat"] [style*="overflow"]') ||
                  document.querySelector('[style*="flex-direction: column"][style*="gap"]');
    if (msgList) {
      msgObserver.observe(msgList, { childList: true, subtree: true });
    } else {
      setTimeout(watchMsgList, 800);
    }
  }
  setTimeout(watchMsgList, 1200);
})();
