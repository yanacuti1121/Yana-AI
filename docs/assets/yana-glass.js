/*
 * Liquid glass surfaces for yana.vutam.link (test copy). Marks the surfaces that wear the glass
 * look from yana-glass.css. The earlier version also gave each one an SVG refraction filter as
 * its backdrop-filter; measured on 19/10/2026 that took scrolling to 100% GPU, so the look is
 * now drawn without any backdrop filter (see yana-glass.css).
 */
(() => {
  'use strict';

  const SURFACES = [
    '.site-nav',
    '.discovery-entry',
    '.hero26-secondary',
    '.hero26-sticker',
    '.discovery-stage',
    '.showcase-intro-panel > a',
    '.home-cap',
    '.home-architecture-map',
    '.home-use-list > a',
    '.route-card',
    '.home-final-primary',
    '.home-final-secondary',
  ];

  SURFACES.forEach(selector => document.querySelectorAll(selector).forEach(el => el.classList.add('lg')));
})();
