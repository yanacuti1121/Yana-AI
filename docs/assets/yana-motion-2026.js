/*
 * The few homepage effects CSS cannot do alone (see yana-motion-2026.css). All of them are
 * event-driven: they run on a click, a pointer move or a resize, never in a loop.
 */
(() => {
  'use strict';

  const page = document.querySelector('.home-page');
  if (!page) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TICKER_MAX_BOOST = 5; // tickers run at most 6x their resting speed
  const TICKER_SPEED_SCALE = 500; // px/s of scrolling that adds 1x speed
  const TICKER_MAX_SKEW = 7; // degrees
  const TICKER_SKEW_SCALE = 260; // px/s of scrolling per degree of lean
  const TICKER_DECAY = 0.92; // per frame, while the boost settles
  const GATE_RESET_MS = 3500; // the approval card asks again this long after an answer
  const SCREEN_LEAN = 10; // px the screen picture leans with the pointer
  const PHOTO_AT = 0.98; // lid value at which the photographed MacBook takes over (timed fade)
  const LID_OPEN_SHARE = 0.75; // the hero Mac is fully open three quarters of the way through its pause

  // 2 · discovery: a glass knob follows the current step (aria-current set by yana-discovery.js).
  const steps = page.querySelector('.discovery-steps');
  if (steps) {
    const knob = document.createElement('span');
    knob.className = 'discovery-knob';
    knob.setAttribute('aria-hidden', 'true');
    steps.prepend(knob);
    const place = () => {
      const current = steps.querySelector('[aria-current="step"]') || steps.querySelector('button');
      if (!current) return;
      const box = current.getBoundingClientRect();
      const origin = steps.getBoundingClientRect();
      knob.style.setProperty('--knob-x', `${box.left - origin.left}px`);
      knob.style.setProperty('--knob-y', `${box.top - origin.top}px`);
      knob.style.setProperty('--knob-w', `${box.width}px`);
      knob.style.setProperty('--knob-h', `${box.height}px`);
    };
    new MutationObserver(place).observe(steps, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    new ResizeObserver(place).observe(steps);
    place();
  }

  // 14 · why: wrap each word so the CSS can light them one after another.
  const why = page.querySelector('.home-why h2');
  if (why && !why.querySelector('.w')) {
    const words = why.textContent.trim().split(/\s+/);
    why.setAttribute('aria-label', words.join(' '));
    why.textContent = '';
    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', String(index));
      span.textContent = word;
      why.append(span, ' ');
    });
    why.style.setProperty('--step', `${(36 / words.length).toFixed(2)}%`);
  }

  // Tickers (hero ribbon, Studio marquee) run all the time; scrolling speeds them up and fast
  // scrolling leans them. The loop below only runs while
  // that boost is settling back, so a still page adds nothing to the CSS animation itself.
  const tickers = [...page.querySelectorAll('[data-velocity]')];
  if (tickers.length && !reduced) {
    const animations = () => tickers.flatMap(row => [...row.querySelectorAll('ul')].flatMap(list => list.getAnimations()));
    let lastY = scrollY, lastT = performance.now(), boost = 0, skew = 0, settling = 0;
    const apply = () => {
      // Always forwards: a CSS animation played backwards stops for good once it reaches its
      // start, even when it loops (that froze the tickers after scrolling up). Scroll only
      // speeds them up and leans them.
      const rate = 1 + boost;
      animations().forEach(animation => {
        animation.playbackRate = rate;
        if (animation.playState !== 'running') animation.play();
      });
      tickers.forEach(row => row.style.setProperty('--mq-skew', `${skew.toFixed(2)}deg`));
    };
    const settle = () => {
      boost *= TICKER_DECAY;
      skew *= TICKER_DECAY;
      apply();
      settling = boost > 0.01 || Math.abs(skew) > 0.05 ? requestAnimationFrame(settle) : 0;
    };
    addEventListener('scroll', () => {
      const now = performance.now();
      const velocity = (scrollY - lastY) / Math.max(1, now - lastT) * 1000; // px per second
      lastY = scrollY;
      lastT = now;
      boost = Math.max(boost, Math.min(TICKER_MAX_BOOST, Math.abs(velocity) / TICKER_SPEED_SCALE));
      skew = Math.max(-TICKER_MAX_SKEW, Math.min(TICKER_MAX_SKEW, -velocity / TICKER_SKEW_SCALE));
      apply();
      if (!settling) settling = requestAnimationFrame(settle);
    }, { passive: true });
  }

  // Photographed Mac's screen: the real screen recordings play one after another while the
  // photo is showing, and stop when it is not (owner 19/10: a still screen looked dead).
  const reelVideo = page.querySelector('.mac-screen-video');
  let screenReel = null;
  if (reelVideo && !reduced) {
    const clips = (reelVideo.dataset.playlist || '').split(/\s+/).filter(Boolean);
    let clip = 0;
    const playClip = () => {
      reelVideo.play().catch(error => console.warn('[yana-motion] screen video did not start', error));
    };
    reelVideo.addEventListener('ended', () => {
      clip = (clip + 1) % clips.length;
      reelVideo.src = clips[clip];
      playClip();
    });
    screenReel = on => {
      if (!on) { reelVideo.pause(); return; }
      if (!reelVideo.src) reelVideo.src = clips[clip];
      playClip();
    };
  }

  // Hero Mac: while it is pinned (.hero26-pin, see yana-hero.css) the page scroll opens its lid,
  // reaching fully open at LID_OPEN_SHARE of the pinned stretch. Sent to the embed by message.
  const pin = page.querySelector('.hero26-pin');
  const macFrame = pin?.querySelector('iframe');
  if (pin && macFrame) {
    let lastLid = -1, queued = 0, embedReady = false;
    if (pin.classList.contains('is-photo')) {
      screenReel?.(true);
    }
    const sendLid = () => {
      queued = 0;
      if (!embedReady) return;
      const device = pin.firstElementChild;
      const stickTop = parseFloat(getComputedStyle(device).top) || 0;
      const start = pin.offsetTop - stickTop;
      const span = Math.max(1, pin.offsetHeight - device.offsetHeight);
      const lid = Math.min(1, Math.max(0, (scrollY - start) / (span * LID_OPEN_SHARE)));
      if (Math.abs(lid - lastLid) < 0.002) return;
      lastLid = lid;
      // Hand over to the photographed MacBook (yana-hero.css .mac-photo) once the lid is fully open.
      const shown = lid >= PHOTO_AT;
      if (shown !== pin.classList.contains('is-photo')) {
        pin.classList.toggle('is-photo', shown);
        screenReel?.(shown);
      }
      macFrame.contentWindow?.postMessage({ type: 'yana:lid', value: lid }, location.origin);
    };
    addEventListener('scroll', () => { if (embedReady && !queued) queued = requestAnimationFrame(sendLid); }, { passive: true });
    // The embed says when it can listen; send the current lid again then (page may load mid-pin).
    addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== macFrame.contentWindow || event.data?.type !== 'yana:lid-ready') return;
      embedReady = true;
      lastLid = -1;
      sendLid();
    });
    const embedSrc = macFrame.dataset.embedSrc;
    if (embedSrc) {
      fetch(embedSrc, { method: 'HEAD' }).then(res => {
        if (res.ok && !res.headers.get('x-vercel-error')) {
          macFrame.src = embedSrc;
        }
      }).catch(() => {});
    }
  } else if (pin?.classList.contains('is-photo')) {
    // No 3D embed on the page (the /embed/mac route was never deployed): the photographed
    // Mac is the hero, so its screen reel starts straight away.
    screenReel?.(true);
  }

  // Section videos (iMac screen, small MacBook terminal) play only while on screen.
  if (!reduced) {
    const inView = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) { target.pause(); return; }
      target.play().catch(error => console.warn('[yana-motion] section video did not start', error));
    }), { threshold: 0.25 });
    page.querySelectorAll('.imac-screen video, .mini-mac-video').forEach(video => inView.observe(video));
  }

  // The photographed Mac's approval card: answer it like in Yana Studio, then it resets.
  const gate = page.querySelector('.mac-gate');
  if (gate) {
    const result = gate.querySelector('.mac-gate-result');
    let resetTimer = 0;
    gate.addEventListener('click', event => {
      const choice = event.target.closest('[data-gate]')?.dataset.gate;
      if (!choice) return;
      gate.dataset.state = choice;
      result.textContent = choice === 'allow' ? '✓ Đã chạy · đã ghi vào audit' : '✕ Đã chặn · đã ghi vào audit';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { gate.dataset.state = 'ask'; result.textContent = ''; }, GATE_RESET_MS);
    });
  }

  // Closing orbit (yana-final.css): turns only while the section is on screen.
  const finalOrbit = page.querySelector('.final26');
  if (finalOrbit && !reduced) {
    new IntersectionObserver(([entry]) => finalOrbit.classList.toggle('is-orbiting', entry.isIntersecting)).observe(finalOrbit);
  }

  // Hero stickers loop only while the hero is on screen (yana-hero.css .is-live).
  const heroSection = page.querySelector('.yana-intro');
  if (heroSection && !reduced) {
    new IntersectionObserver(([entry]) => heroSection.classList.toggle('is-live', entry.isIntersecting)).observe(heroSection);
  }

  if (!finePointer || reduced) return;

  // 10 · capabilities: light follows the pointer inside the card under it.
  page.querySelectorAll('.home-cap').forEach(card => {
    card.addEventListener('pointermove', event => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - box.left}px`);
      card.style.setProperty('--my', `${event.clientY - box.top}px`);
    }, { passive: true });
  });

  // Photographed Mac: glare follows the pointer over the glass, the screen picture leans with it.
  const macScreen = page.querySelector('.mac-photo-screen');
  if (macScreen) {
    macScreen.addEventListener('pointermove', event => {
      const box = macScreen.getBoundingClientRect();
      const fx = (event.clientX - box.left) / box.width;
      const fy = (event.clientY - box.top) / box.height;
      macScreen.style.setProperty('--glare-x', `${(fx * 100).toFixed(1)}%`);
      macScreen.style.setProperty('--glare-y', `${(fy * 100).toFixed(1)}%`);
      macScreen.style.setProperty('--scr-x', `${((0.5 - fx) * SCREEN_LEAN).toFixed(1)}px`);
      macScreen.style.setProperty('--scr-y', `${((0.5 - fy) * SCREEN_LEAN).toFixed(1)}px`);
    }, { passive: true });
    macScreen.addEventListener('pointerleave', () => {
      macScreen.style.setProperty('--scr-x', '0px');
      macScreen.style.setProperty('--scr-y', '0px');
    });
  }

  // No magnetic buttons: they made the hero buttons crowd together (owner 20/10).
})();
