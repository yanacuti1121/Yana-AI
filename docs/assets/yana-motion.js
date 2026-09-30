(() => {
  "use strict";
  const opening = document.querySelector(".yana-opening");
  if (opening) {
    const closeOpening = () => {
      if (!opening.isConnected) return;
      document.body.classList.remove("opening-active");
      opening.remove();
      document.dispatchEvent(new Event("yana:opening-complete"));
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || location.hash) {
      closeOpening();
    } else {
      document.body.classList.add("opening-active");
      opening.classList.add("is-playing");
      opening.addEventListener("animationend", event => {
        if (event.target === opening) closeOpening();
      });
      opening.querySelector(".opening-skip")?.addEventListener("click", closeOpening);
      setTimeout(closeOpening, opening.classList.contains("yana-opening--inner") ? 1500 : 3400);
    }
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Looping CSS animations keep the compositor busy even when their scene is
  // scrolled away; pause them while the scene is outside the viewport.
  const loopScenes = document.querySelectorAll(
    ".execution-stage, .wheelbot-stage, .yana-orbit, .screenshot-stack, .sylva-intro"
  );
  if (loopScenes.length && "IntersectionObserver" in window) {
    const loopObserver = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle("yana-offscreen", !entry.isIntersecting);
    }, { rootMargin: "10% 0px 10% 0px", threshold: 0 });
    for (const scene of loopScenes) loopObserver.observe(scene);
  }

  const surfaces = [...document.querySelectorAll(
    ".yana-hero-object, .showcase-visual, .hero-stage, .feature-visual"
  )];
  if (!surfaces.length) return;

  const active = new Set();
  const coarsePointer = matchMedia("(pointer: coarse)").matches;
  let frame = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const render = () => {
    frame = 0;
    if (document.hidden || coarsePointer || innerWidth <= 900) return;
    const center = innerHeight * .5;
    for (const surface of active) {
      if (!surface.classList.contains("showcase-visual")) continue;
      const box = surface.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) continue;
      const travel = clamp((center - (box.top + box.height * .5)) / (center + box.height * .5), -1, 1);
      surface.style.setProperty("--motion-progress", travel.toFixed(3));
    }
  };
  const queue = () => {
    if (!frame && !document.hidden && !coarsePointer && innerWidth > 900 &&
        [...active].some(surface => surface.classList.contains("showcase-visual"))) {
      frame = requestAnimationFrame(render);
    }
  };

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        active.add(entry.target);
        entry.target.classList.add("motion-active");
        if (!entry.target.classList.contains("motion-entered")) {
          entry.target.classList.add("motion-entered");
        }
      } else {
        active.delete(entry.target);
        entry.target.classList.remove("motion-active");
      }
    }
    queue();
  }, { rootMargin: "8% 0px 8% 0px", threshold: 0 });

  for (const surface of surfaces) {
    surface.classList.add("motion-surface");
    observer.observe(surface);
  }

  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue, { passive: true });
  addEventListener("visibilitychange", () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else queue();
  });
  queue();
})();
