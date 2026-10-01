(() => {
  'use strict';

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const page = document.querySelector('.home-page');
  if (!page || !gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const hero = page.querySelector('.yana-intro');
  const flow = page.querySelector('.home-flow');
  const prologue = page.querySelector('.ecosystem-prologue');
  const cards = [...(prologue?.querySelectorAll('.showcase-intro-panel > a') || [])];
  const controls = prologue?.querySelector('.showcase-carousel-controls');
  const counter = controls?.querySelector('[data-carousel-count]');
  const media = gsap.matchMedia();
  const listeners = new AbortController();
  let carouselTrigger;
  let carouselPosition = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const updateBrand = progress => {
    window.dispatchEvent(new CustomEvent('yana:brand-scroll', { detail: { progress } }));
  };

  // The original product links remain real links; the controls only change the view.
  const renderCards = position => {
    carouselPosition = clamp(position, 0, cards.length - 1);
    cards.forEach((card, index) => {
      const distance = index - carouselPosition;
      const depth = Math.min(Math.abs(distance), 2);
      gsap.set(card, {
        xPercent: -50 + distance * 78,
        y: depth * 24,
        rotationY: -distance * 14,
        rotationZ: distance * 1.8,
        scale: 1 - depth * 0.11,
        opacity: 1 - depth * 0.12,
        zIndex: 10 - Math.round(depth * 3),
        force3D: true
      });
      card.classList.toggle('is-centered', Math.round(carouselPosition) === index);
    });
    if (counter) counter.textContent = `${Math.round(carouselPosition) + 1} / ${cards.length}`;
  };

  const moveCarousel = direction => {
    if (!carouselTrigger) return;
    const target = clamp(Math.round(carouselPosition) + direction, 0, cards.length - 1);
    const top = carouselTrigger.start + (carouselTrigger.end - carouselTrigger.start) * target / (cards.length - 1);
    window.scrollTo({ top, behavior: 'smooth' });
  };

  controls?.querySelector('[data-carousel-prev]')?.addEventListener('click', () => moveCarousel(-1), { signal: listeners.signal });
  controls?.querySelector('[data-carousel-next]')?.addEventListener('click', () => moveCarousel(1), { signal: listeners.signal });
  prologue?.querySelector('.showcase-intro-panel')?.addEventListener('keydown', event => {
    if (!carouselTrigger || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    moveCarousel(event.key === 'ArrowRight' ? 1 : -1);
  }, { signal: listeners.signal });

  media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    if (hero) {
      gsap.fromTo(hero.querySelector('.yana-intro-copy'),
        { y: 0, opacity: 1 },
        { y: -48, opacity: 0.72, ease: 'none', scrollTrigger: {
          trigger: hero, start: 'top top', end: 'bottom top', scrub: true
        } });
      ScrollTrigger.create({
        trigger: hero, start: 'top top', end: 'bottom top',
        onUpdate: self => updateBrand(self.progress),
        onRefresh: self => updateBrand(self.progress)
      });
    }

    if (flow) {
      const steps = flow.querySelectorAll('.home-flow-steps li');
      gsap.timeline({ scrollTrigger: {
        trigger: flow, start: 'top 70%', end: 'bottom 35%', scrub: true
      } })
        .fromTo(flow.querySelector('.home-flow-intro h2'),
          { y: 24, opacity: 0.75 }, { y: 0, opacity: 1, duration: 0.7, ease: 'none' }, 0)
        .fromTo(steps,
          { y: 26, opacity: 0.58 },
          { y: 0, opacity: 1, duration: 0.55, stagger: 0.25, ease: 'none' }, 0.15);
    }

    const tour = page.querySelector('.home-tour');
    if (tour) gsap.fromTo(tour.querySelectorAll('.home-tour-steps a'),
      { y: 20, opacity: 0.72 },
      { y: 0, opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: {
        trigger: tour, start: 'top 90%', end: 'bottom 30%', scrub: true
      } });

    const origin = page.querySelector('.home-origin');
    if (origin) {
      gsap.fromTo(origin.querySelector('.home-origin-copy h2'),
        { y: 24, opacity: 0.72 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: {
          trigger: origin, start: 'top 80%', end: 'top 35%', scrub: true
        } });
      gsap.fromTo(origin.querySelector('.home-terminal'),
        { y: 34, rotationY: -5, opacity: 0.78 },
        { y: 0, rotationY: 0, opacity: 1, ease: 'none', scrollTrigger: {
          trigger: origin, start: 'top 78%', end: 'bottom 65%', scrub: true
        } });
    }

    if (prologue && cards.length === 3) {
      prologue.classList.add('is-carousel-active');
      renderCards(0);
      carouselTrigger = ScrollTrigger.create({
        trigger: prologue.querySelector('.showcase-intro-panel'),
        start: 'top 80%',
        end: 'bottom 5%',
        onUpdate: self => renderCards(self.progress * (cards.length - 1)),
        onRefresh: self => renderCards(self.progress * (cards.length - 1))
      });
    }

    page.querySelectorAll('.showcase-scene').forEach((scene, index) => {
      const copy = scene.querySelector('.showcase-copy');
      const visual = scene.querySelector('.showcase-visual');
      if (copy) gsap.fromTo(copy,
        { x: index % 2 ? 34 : -34, opacity: 0.75 },
        { x: 0, opacity: 1, ease: 'none', scrollTrigger: {
          trigger: scene, start: 'top 85%', end: 'top 35%', scrub: true
        } });
      if (visual) gsap.fromTo(visual,
        { opacity: 0.78 }, { opacity: 1, ease: 'none', scrollTrigger: {
          trigger: scene, start: 'top 80%', end: 'top 28%', scrub: true
        } });
    });

    const demo = page.querySelector('.execution-lab');
    if (demo) gsap.fromTo(demo.querySelector('.chapter-header h2'),
      { y: 28, opacity: 0.7 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: {
        trigger: demo, start: 'top 84%', end: 'top 42%', scrub: true
      } });

    ['.home-capabilities', '.home-architecture', '.home-evidence'].forEach(selector => {
      const section = page.querySelector(selector);
      if (!section) return;
      const heading = section.querySelector('h2');
      if (heading) gsap.fromTo(heading,
        { y: 24, opacity: 0.72 },
        { y: 0, opacity: 1, ease: 'none', scrollTrigger: {
          trigger: section, start: 'top 85%', end: 'top 42%', scrub: true
        } });
    });

    [
      ['.home-capabilities', '.home-cap-grid .home-cap'],
      ['.home-architecture', '.home-architecture-map li'],
      ['.home-evidence', '.home-evidence-list a'],
      ['.home-use-cases', '.home-use-list a'],
      ['.home-why', '.home-why-list > div'],
      ['.chapter.narrow', '.route-grid .route-card']
    ].forEach(([sectionSelector, itemsSelector]) => {
      const section = page.querySelector(sectionSelector);
      const items = section?.querySelectorAll(itemsSelector);
      if (!items?.length) return;
      gsap.fromTo(items,
        { y: 22, opacity: 0.73 },
        { y: 0, opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: {
          trigger: section, start: 'top 82%', end: 'bottom 44%', scrub: true
        } });
    });

    const why = page.querySelector('.home-why h2');
    const productRecap = page.querySelector('.chapter.narrow .chapter-header h2');
    const final = page.querySelector('.home-final h2');
    [why, productRecap, final].filter(Boolean).forEach(heading => {
      gsap.fromTo(heading,
        { y: 30, opacity: 0.72 },
        { y: 0, opacity: 1, ease: 'none', scrollTrigger: {
          trigger: heading.closest('section'), start: 'top 84%', end: 'top 42%', scrub: true
        } });
    });

    return () => {
      prologue?.classList.remove('is-carousel-active');
      cards.forEach(card => card.classList.remove('is-centered'));
      carouselTrigger = null;
      updateBrand(0);
    };
  });

  // Native hash restoration can land at the top after the opening overlay closes.
  // Align once after load; normal anchor clicks keep their existing behavior.
  window.addEventListener('load', () => {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    requestAnimationFrame(() => {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      root.style.scrollBehavior = previous;
      ScrollTrigger.refresh();
    });
  }, { once: true, signal: listeners.signal });

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    listeners.abort();
    media.revert();
  });
})();
