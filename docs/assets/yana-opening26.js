/*
 * Opening screen timing (see yana-opening26.css). Runs right after its markup so the screen is
 * decided before first paint. Skipped for reduced motion, for deep links (#section) and after the
 * first view in a session. Sets html.opening26-done when the page is revealed.
 */
(() => {
  'use strict';

  const ASK_MS = 850; // "Đang kiểm tra quyền…" shows this long
  const APPROVED_MS = 650; // then "Đã duyệt · mời vào" before the screen lifts
  const LIFT_MS = 760; // matches the .is-leaving transition
  const SEEN_KEY = 'yana-opening26-seen';

  const root = document.documentElement;
  const screen = document.querySelector('.opening26');
  if (!screen) return;

  const reveal = () => {
    root.classList.remove('opening26-lock');
    screen.classList.add('is-gone');
    root.classList.add('opening26-done');
    document.dispatchEvent(new Event('yana:opening-complete'));
  };

  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; sessionStorage.setItem(SEEN_KEY, '1'); } catch (error) { seen = false; }
  if (seen || location.hash || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('opening26-skipped', 'opening26-done');
    reveal();
    return;
  }

  root.classList.add('opening26-lock');
  const timers = [];
  const leave = () => {
    timers.forEach(clearTimeout);
    screen.classList.add('is-approved', 'is-leaving');
    timers.push(setTimeout(reveal, LIFT_MS));
  };
  timers.push(setTimeout(() => screen.classList.add('is-approved'), ASK_MS));
  timers.push(setTimeout(leave, ASK_MS + APPROVED_MS));
  screen.querySelector('.opening26-skip')?.addEventListener('click', leave);
})();
