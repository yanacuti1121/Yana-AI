(() => {
  "use strict";

  function bindChoices(rootSelector, choiceSelector, dataKey) {
    document.querySelectorAll(rootSelector).forEach((root) => {
      const choices = [...root.querySelectorAll(choiceSelector)];
      const detail = root.querySelector("[data-showcase-detail]");
      if (!choices.length || !detail) return;

      function activate(choice) {
        choices.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === choice));
        });
        detail.textContent = choice.dataset.description || "";
        root.dataset.active = choice.dataset[dataKey] || "";
      }

      choices.forEach((choice) => {
        choice.addEventListener("click", () => activate(choice));
        choice.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activate(choice);
        });
      });
    });
  }

  bindChoices(".showcase-visual--ai", "[data-showcase-step]", "showcaseStep");
  bindChoices(".showcase-visual--studio", "[data-studio-focus]", "studioFocus");

  document.querySelectorAll("[data-wheelbot-switch]").forEach((root) => {
    const buttons = [...root.querySelectorAll("[data-wheelbot-view-button]")];
    const views = [...root.querySelectorAll("[data-wheelbot-view]")];

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const selected = button.dataset.wheelbotViewButton;
        buttons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        views.forEach((view) => {
          view.hidden = view.dataset.wheelbotView !== selected;
        });
        root.dataset.view = selected;
      });
    });
  });

  const figures = [...document.querySelectorAll(".wheelbot-view")];
  if (figures.length) {
    const language = document.documentElement.lang.slice(0, 2).toLowerCase();
    const copy = language === "ko"
      ? { inspect: "자세히 보기", close: "닫기", full: "100%로 보기", fit: "화면에 맞추기", concept: "Wheelbot 콘셉트", plates: "3D 프린트 플레이트" }
      : language === "en"
        ? { inspect: "Inspect image", close: "Close", full: "View at 100%", fit: "Fit image", concept: "Wheelbot concept", plates: "3D print plates" }
        : { inspect: "Xem chi tiết", close: "Đóng", full: "Xem 100%", fit: "Vừa khung", concept: "Concept Wheelbot", plates: "Bộ file in 3D" };
    const dialog = document.createElement("dialog");
    dialog.className = "wheelbot-inspector";
    dialog.innerHTML = `<div class="wheelbot-inspector__panel">
      <header><strong></strong><button type="button" class="wheelbot-inspector__close"></button></header>
      <div class="wheelbot-inspector__viewport"><img alt=""></div>
      <footer><span class="wheelbot-inspector__caption"></span><button type="button" class="wheelbot-inspector__zoom" aria-pressed="false"></button></footer>
    </div>`;
    document.body.append(dialog);

    const heading = dialog.querySelector("header strong");
    const image = dialog.querySelector("img");
    const caption = dialog.querySelector(".wheelbot-inspector__caption");
    const zoom = dialog.querySelector(".wheelbot-inspector__zoom");
    const close = dialog.querySelector(".wheelbot-inspector__close");
    let opener = null;
    close.textContent = copy.close;
    zoom.textContent = copy.full;
    close.addEventListener("click", () => dialog.close());
    zoom.addEventListener("click", () => {
      const active = dialog.classList.toggle("is-zoomed");
      zoom.setAttribute("aria-pressed", String(active));
      zoom.textContent = active ? copy.fit : copy.full;
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.classList.remove("is-zoomed");
      zoom.setAttribute("aria-pressed", "false");
      zoom.textContent = copy.full;
      opener?.focus();
    });

    figures.forEach((figure) => {
      const source = figure.querySelector("img");
      if (!source) return;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "wheelbot-inspect-trigger";
      trigger.textContent = `${copy.inspect} ↗`;
      figure.insertBefore(trigger, figure.querySelector("figcaption"));
      trigger.addEventListener("click", () => {
        opener = trigger;
        heading.textContent = figure.dataset.wheelbotView === "plates" ? copy.plates : copy.concept;
        image.src = source.getAttribute("src") || "";
        image.alt = source.alt;
        caption.textContent = figure.querySelector("figcaption")?.firstChild?.textContent?.trim() || "";
        dialog.showModal();
      });
    });
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll(".wheelbot-view").forEach((figure) => {
    let lastMove = 0;

    figure.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || event.timeStamp - lastMove < 32) return;
      lastMove = event.timeStamp;
      const bounds = figure.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      figure.style.setProperty("--wheelbot-x", `${(x * -9).toFixed(1)}px`);
      figure.style.setProperty("--wheelbot-y", `${(y * -9).toFixed(1)}px`);
    });

    figure.addEventListener("pointerleave", () => {
      figure.style.removeProperty("--wheelbot-x");
      figure.style.removeProperty("--wheelbot-y");
    });
  });
})();
