(() => {
  "use strict";
  if (!document.body.classList.contains("home-page")) return;

  const language = document.documentElement.lang.slice(0, 2);
  const labels = {
    vi: { rail: "Khám phá hành trình Yana", next: "Chặng tiếp theo", kicker: "CHẶNG TIẾP THEO" },
    en: { rail: "Explore the Yana story", next: "Next chapter", kicker: "NEXT CHAPTER" },
    ko: { rail: "Yana 이야기 살펴보기", next: "다음 장", kicker: "다음 장" }
  }[language] || { rail: "Explore the Yana story", next: "Next chapter", kicker: "NEXT CHAPTER" };
  const chapters = [
    ["live-demo", "Trải nghiệm 60 giây", "60-second tour", "60초 체험"],
    ["how-it-works", "Cách hoạt động", "How it works", "작동 방식"],
    ["terminal-origin", "Khởi đầu", "Origins", "시작"],
    ["prologue", "Hệ sinh thái", "Ecosystem", "생태계"],
    ["product-1", "Yana AI", "Yana AI", "Yana AI"],
    ["product-2", "Studio", "Studio", "Studio"],
    ["product-3", "Wheelbot", "Wheelbot", "Wheelbot"],
    ["capabilities", "Quyền hạn", "Authority", "권한"],
    ["architecture", "Kiến trúc", "Architecture", "아키텍처"],
    ["evidence", "Bằng chứng", "Evidence", "증거"],
    ["why-yana", "Vì sao Yana", "Why Yana", "Yana를 선택하는 이유"]
  ].map(([id, vi, en, ko]) => ({ id, label: ({ vi, en, ko }[language] || en), section: document.getElementById(id) }))
    .filter(chapter => chapter.section);
  if (!chapters.length) return;

  const progress = document.createElement("div");
  progress.className = "yana-journey-progress";
  progress.setAttribute("aria-hidden", "true");
  progress.append(document.createElement("span"));

  const rail = document.createElement("nav");
  rail.className = "yana-journey-rail";
  rail.setAttribute("aria-label", labels.rail);
  const links = chapters.map((chapter, index) => {
    const link = document.createElement("a");
    link.href = `#${chapter.id}`;
    link.setAttribute("aria-label", `${String(index + 1).padStart(2, "0")}. ${chapter.label}`);
    const dot = document.createElement("span");
    dot.className = "yana-journey-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "yana-journey-label";
    label.textContent = chapter.label;
    link.append(label, dot);
    rail.append(link);
    return link;
  });
  const next = document.createElement("a");
  next.className = "yana-journey-next";
  const nextKicker = document.createElement("span");
  nextKicker.textContent = labels.kicker;
  const nextLabel = document.createElement("strong");
  const nextArrow = document.createElement("span");
  nextArrow.setAttribute("aria-hidden", "true");
  nextArrow.textContent = "↗";
  next.append(nextKicker, nextLabel, nextArrow);
  document.body.append(progress, rail, next);

  let offsets = [];
  let pending = 0;
  let current = -1;
  let nextVisible = false;
  const measure = () => {
    offsets = chapters.map(chapter => chapter.section.getBoundingClientRect().top + scrollY);
    update();
  };
  const update = () => {
    pending = 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress.style.setProperty("--journey-progress", Math.min(1, scrollY / maxScroll).toFixed(3));
    const readingLine = scrollY + innerHeight * .38;
    let active = 0;
    for (let i = 1; i < offsets.length; i++) {
      if (offsets[i] <= readingLine) active = i;
      else break;
    }
    rail.classList.toggle("is-visible", readingLine >= offsets[0]);
    const hasNext = readingLine >= offsets[0] && active < chapters.length - 1 &&
      scrollY + innerHeight >= offsets[active + 1] - 180;
    if (active !== current || hasNext !== nextVisible) {
      next.hidden = !hasNext;
      if (hasNext) {
        next.href = `#${chapters[active + 1].id}`;
        nextLabel.textContent = chapters[active + 1].label;
        next.setAttribute("aria-label", `${labels.next}: ${chapters[active + 1].label}`);
      }
      links.forEach((link, index) => {
        if (index === active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      current = active;
      nextVisible = hasNext;
    }
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(update);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", measure, { passive: true });
  addEventListener("yana:discovery-resize", measure);
  addEventListener("load", measure, { once: true });
  document.fonts?.ready.then(measure);
  measure();

  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const revealTargets = document.querySelectorAll(
      ".home-flow-intro, .home-flow-steps li, .home-origin-copy, .home-section-heading, .home-cap, .home-architecture-copy, .home-architecture-map li, .home-evidence-list a, .home-why-list>div"
    );
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -7% 0px", threshold: 0 });
    revealTargets.forEach((target, index) => {
      target.classList.add("journey-reveal");
      target.style.setProperty("--journey-delay", `${(index % 4) * 65}ms`);
      revealObserver.observe(target);
    });
  }
})();
