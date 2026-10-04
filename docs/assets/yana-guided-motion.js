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
  const cameraStates = new Map();
  let carouselTrigger;
  let carouselPosition = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const updateBrand = detail => {
    window.dispatchEvent(new CustomEvent('yana:brand-journey', { detail }));
  };

  // A common camera pass carries every chapter diagonally to the right. Native
  // scrolling and section anchors keep their original layout coordinates.
  media.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)', motion: '(prefers-reduced-motion: no-preference)' }, context => {
    if (!context.conditions.motion) return;
    page.classList.add('is-camera-guided');
    const distance = context.conditions.desktop ? 64 : 7;
    const rise = context.conditions.desktop ? 38 : 5;
    const cameraLayers = [];
    page.querySelectorAll('main > section').forEach(section => {
      const layers = [...section.children].filter(layer => !layer.classList.contains('yana-scene-field'));
      const state = { x: 0, y: 0, progress: 0 };
      cameraStates.set(section, state);
      layers.forEach(layer => { layer.classList.add('yana-camera-layer'); cameraLayers.push(layer); });
      const moveCamera = progress => {
        state.x = (progress * 2 - 1) * distance;
        state.y = (1 - progress * 2) * rise;
        layers.forEach(layer => {
          layer.style.setProperty('--page-camera-x', `${state.x.toFixed(2)}px`);
          layer.style.setProperty('--page-camera-y', `${state.y.toFixed(2)}px`);
          if (context.conditions.desktop) {
            layer.style.setProperty('--page-camera-z', `${(-100 + Math.sin(progress * Math.PI) * 96).toFixed(2)}px`);
            layer.style.setProperty('--page-camera-yaw', `${((1 - progress * 2) * 2.5).toFixed(3)}deg`);
          }
        });
      };
      gsap.fromTo(state, { progress: 0 }, {
        progress: 1, ease: 'none', onUpdate: () => moveCamera(state.progress),
        scrollTrigger: {
          trigger: section, start: 'top bottom', end: 'bottom top',
          scrub: context.conditions.desktop ? .35 : true
        }
      });
    });
    return () => {
      page.classList.remove('is-camera-guided');
      cameraLayers.forEach(layer => {
        layer.classList.remove('yana-camera-layer');
        layer.style.removeProperty('--page-camera-x');
        layer.style.removeProperty('--page-camera-y');
        layer.style.removeProperty('--page-camera-z');
        layer.style.removeProperty('--page-camera-yaw');
      });
      cameraStates.clear();
    };
  });

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
    const sceneDefinitions = [
      [hero, 'ice', { x: 0, y: 0, scale: 1, opacity: 1 }],
      [page.querySelector('.home-tour'), 'ice', { x: 55, y: -60, scale: .78, opacity: 0 }],
      [flow, 'blue', { x: 125, y: -105, scale: .6, opacity: .72 }],
      [page.querySelector('.home-origin'), 'blue', { x: 170, y: -55, scale: .58, opacity: 0 }],
      [prologue, 'violet', { x: 130, y: -115, scale: .64, opacity: .58 }],
      [page.querySelector('#product-1'), 'ice', { x: 110, y: -80, scale: .5, opacity: 0 }],
      [page.querySelector('#product-2'), 'violet', { x: 110, y: 40, scale: .5, opacity: 0 }],
      [page.querySelector('#product-3'), 'blue', { x: 110, y: -20, scale: .5, opacity: 0 }],
      [page.querySelector('.home-capabilities'), 'ice', { x: 125, y: -85, scale: .62, opacity: 0 }],
      [page.querySelector('.home-architecture'), 'blue', { x: 150, y: 30, scale: .55, opacity: .4 }],
      [page.querySelector('.home-evidence'), 'ice', { x: 100, y: -75, scale: .5, opacity: 0 }],
      [page.querySelector('.home-use-cases'), 'violet', { x: 120, y: 40, scale: .55, opacity: 0 }],
      [page.querySelector('.home-why'), 'night', { x: 120, y: -165, scale: .72, opacity: .72 }],
      [page.querySelector('.home-final'), 'ice', { x: 0, y: 100, scale: .58, opacity: 0 }]
    ].filter(([section]) => section);
    const depthFields = [];
    const anchors = [];
    const sculptureRegions = [];
    const contentRegions = [];
    const brandCanvas = document.querySelector('.yana-brand-hero__canvas');
    let canvasHeight = 0, canvasWidth = 0, canvasLeft = 0;
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = value => value * value * (3 - 2 * value);
    // Keep the sculpture out of white reading areas, including between keyframes.
    updateBrand({ enabled: true, opacity: 0 });
    const measureScenes = () => {
      anchors.length = 0;
      sculptureRegions.length = 0;
      contentRegions.length = 0;
      canvasHeight = brandCanvas?.clientHeight || 0;
      canvasWidth = brandCanvas?.clientWidth || 0;
      canvasLeft = brandCanvas?.offsetLeft || 0;
      sceneDefinitions.forEach(([section, , pose]) => {
        const box = section.getBoundingClientRect();
        const top = box.top + scrollY;
        anchors.push(top + box.height * .5);
        if (pose.opacity > 0) {
          // The existing reveal translates sections; use their resting boundaries.
          const transform = getComputedStyle(section).transform;
          const revealShift = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
          sculptureRegions.push({ top: top - revealShift, bottom: top - revealShift + box.height });
          section.querySelectorAll('.home-flow-steps, .showcase-intro-panel, .home-architecture-map').forEach(panel => {
            const panelBox = panel.getBoundingClientRect();
            const camera = cameraStates.get(section) || { x: 0, y: 0 };
            contentRegions.push({
              left: panelBox.left - camera.x, right: panelBox.right - camera.x,
              top: panelBox.top + scrollY - revealShift - camera.y,
              bottom: panelBox.bottom + scrollY - revealShift - camera.y,
              camera
            });
          });
        }
      });
    };
    const updateScene = () => {
      if (!anchors.length) measureScenes();
      const readingLine = scrollY + innerHeight * .5;
      let index = 0;
      while (index < anchors.length - 2 && readingLine > anchors[index + 1]) index++;
      const span = Math.max(1, anchors[index + 1] - anchors[index]);
      const linear = clamp((readingLine - anchors[index]) / span, 0, 1);
      const eased = smoothstep(linear);
      const current = sceneDefinitions[index][2];
      const next = sceneDefinitions[Math.min(index + 1, sceneDefinitions.length - 1)][2];
      const x = lerp(current.x, next.x, eased);
      const y = lerp(current.y, next.y, eased);
      const scale = lerp(current.scale, next.scale, eased);
      const center = readingLine + y;
      const halfHeight = canvasHeight * scale * .5;
      const centerX = canvasLeft + canvasWidth * .5 + x;
      const halfWidth = canvasWidth * scale * .5;
      const fadeDistance = Math.min(90, innerHeight * .12);
      const visibility = sculptureRegions.reduce((visible, region) => {
        const clearance = Math.min(center - halfHeight - region.top, region.bottom - center - halfHeight);
        return Math.max(visible, smoothstep(clamp(clearance / fadeDistance, 0, 1)));
      }, 0);
      const contentClearance = contentRegions.reduce((clear, region) => {
        const distance = Math.max(
          region.left + region.camera.x - centerX - halfWidth, centerX - halfWidth - region.right - region.camera.x,
          region.top + region.camera.y - center - halfHeight, center - halfHeight - region.bottom - region.camera.y
        );
        return Math.min(clear, smoothstep(clamp(distance / fadeDistance, 0, 1)));
      }, 1);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      updateBrand({
        enabled: true,
        progress: clamp(scrollY / maxScroll, 0, 1),
        x,
        y,
        scale,
        opacity: lerp(current.opacity, next.opacity, eased) * visibility * contentClearance,
        hero: scrollY < hero.offsetHeight * .55
      });
    };

    sceneDefinitions.forEach(([section, tone], index) => {
      if (section === hero) return;
      const field = document.createElement('div');
      field.className = `yana-scene-field yana-scene-field--${tone}`;
      field.setAttribute('aria-hidden', 'true');
      field.innerHTML = '<span></span><i></i>';
      section.prepend(field);
      section.classList.add('has-yana-depth');
      depthFields.push([section, field]);
      ScrollTrigger.create({
        trigger: section, start: 'top bottom', end: 'bottom top',
        onUpdate: self => {
          const travel = self.progress * 2 - 1;
          field.style.setProperty('--scene-yaw', `${(travel * (index % 2 ? -16 : 16)).toFixed(1)}deg`);
          field.style.setProperty('--scene-yaw-back', `${(travel * (index % 2 ? 16 : -16)).toFixed(1)}deg`);
          field.style.setProperty('--scene-rise', `${(travel * -90).toFixed(1)}px`);
          field.style.setProperty('--scene-rise-back', `${(travel * 63).toFixed(1)}px`);
          field.style.setProperty('--scene-drift', `${(travel * 70).toFixed(1)}px`);
          field.style.setProperty('--scene-drift-back', `${(travel * -42).toFixed(1)}px`);
          field.style.setProperty('--scene-drift-near', `${(travel * -28).toFixed(1)}px`);
          field.style.setProperty('--scene-rise-near', `${(travel * -54).toFixed(1)}px`);
        }
      });
    });
    const main = page.querySelector('main');
    ScrollTrigger.create({
      trigger: main, start: 'top top', end: 'bottom bottom',
      onRefresh: () => { measureScenes(); updateScene(); },
      onUpdate: updateScene
    });
    if (hero) {
      gsap.fromTo(hero.querySelector('.yana-intro-copy'),
        { y: 0, opacity: 1 },
        { y: -48, opacity: 0.72, ease: 'none', scrollTrigger: {
          trigger: hero, start: 'top top', end: 'bottom top', scrub: true
        } });
    }

    if (flow) {
      const steps = flow.querySelectorAll('.home-flow-steps li');
      gsap.timeline({ scrollTrigger: {
        trigger: flow, start: 'top 70%', end: 'bottom 35%', scrub: true
      } })
        .fromTo(flow.querySelector('.home-flow-intro h2'),
          { y: 24, opacity: 0.75 }, { y: 0, opacity: 1, duration: 0.7, ease: 'none' }, 0)
        .fromTo(steps,
          { y: 44, z: -90, rotationX: -11, opacity: 0.48 },
          { y: 0, z: 0, rotationX: 0, opacity: 1, duration: 0.55, stagger: 0.25, ease: 'none' }, 0.15);
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
        { opacity: 0.62, '--scene-rx': '7deg', '--scene-ry': index % 2 ? '8deg' : '-8deg', '--scene-lift': '46px' },
        { opacity: 1, '--scene-rx': '0deg', '--scene-ry': '0deg', '--scene-lift': '0px', ease: 'none', scrollTrigger: {
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
      const dimensional = sectionSelector === '.home-capabilities' || sectionSelector === '.home-use-cases' || sectionSelector === '.chapter.narrow';
      gsap.fromTo(items,
        { y: dimensional ? 54 : 22, z: dimensional ? -95 : 0, rotationY: dimensional ? -7 : 0, opacity: dimensional ? .5 : .73 },
        { y: 0, z: 0, rotationY: 0, opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: {
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

    // Carousel layout is now final; cache boundaries after all scene setup.
    measureScenes();
    updateScene();

    return () => {
      depthFields.forEach(([section, field]) => { field.remove(); section.classList.remove('has-yana-depth'); });
      prologue?.classList.remove('is-carousel-active');
      cards.forEach(card => card.classList.remove('is-centered'));
      carouselTrigger = null;
      updateBrand({ enabled: false });
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
