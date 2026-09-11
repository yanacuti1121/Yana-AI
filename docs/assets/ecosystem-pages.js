(() => {
  const REPO = "yanacuti1121/Yana-AI";
  const API = `https://api.github.com/repos/${REPO}`;
  const RELEASES_URL = `https://github.com/${REPO}/releases`;
  const state = { lang: "en", releases: [] };

  const fallback = {
    en: { loading: "Loading verified release data…", unavailable: "Live release data is temporarily unavailable.", noCurrentRelease: "No public Yana Studio 1.5 installer is available yet.", github: "Open GitHub Releases", recommended: "Recommended", download: "Download", published: "Published", assets: "files", noAssets: "No installer files published.", verify: "Verify downloads with" },
    vi: { loading: "Đang tải dữ liệu phát hành đã xác minh…", unavailable: "Dữ liệu phát hành trực tiếp đang tạm thời không khả dụng.", noCurrentRelease: "Chưa có bộ cài Yana Studio 1.5 được phát hành công khai.", github: "Mở GitHub Releases", recommended: "Đề xuất", download: "Tải xuống", published: "Phát hành", assets: "tệp", noAssets: "Chưa có tệp cài đặt được công bố.", verify: "Xác minh tệp tải xuống bằng" },
    ko: { loading: "검증된 릴리스 데이터를 불러오는 중…", unavailable: "실시간 릴리스 데이터를 일시적으로 사용할 수 없습니다.", github: "GitHub Releases 열기", recommended: "추천", download: "다운로드", published: "게시", assets: "파일", noAssets: "게시된 설치 파일이 없습니다.", verify: "다운로드 검증:" },
    zh: { loading: "正在加载已验证的发布数据…", unavailable: "实时发布数据暂时不可用。", github: "打开 GitHub Releases", recommended: "推荐", download: "下载", published: "发布于", assets: "个文件", noAssets: "尚未发布安装文件。", verify: "使用以下文件验证下载：" }
  };

  function t(key) {
    return window.PAGE_I18N?.[state.lang]?.[key] ?? fallback[state.lang]?.[key] ?? window.PAGE_I18N?.en?.[key] ?? fallback.en[key] ?? key;
  }

  function setLang(lang) {
    if (window.PAGE_I18N && !window.PAGE_I18N[lang]) lang = "en";
    if (!window.PAGE_I18N && !fallback[lang]) lang = "en";
    state.lang = lang;
    localStorage.setItem("yana-ecosystem-lang", lang);
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const value = t(node.dataset.i18n);
      if (value !== undefined) node.innerHTML = value;
    });
    document.querySelectorAll(".lang-btn").forEach((button) => button.classList.toggle("active", button.dataset.lang === lang));
    renderReleaseSurfaces();
  }

  function detectedPlatform() {
    const value = `${navigator.userAgentData?.platform || navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    if (value.includes("mac")) return "mac";
    if (value.includes("win")) return "windows";
    if (value.includes("linux")) return "linux";
    return "unknown";
  }

  function humanSize(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes; let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }

  function humanDate(value) {
    if (!value) return "—";
    const locale = { vi: "vi-VN", ko: "ko-KR", zh: "zh-CN", en: "en-US" }[state.lang];
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
  }

  function isInstaller(asset) {
    return !/(\.blockmap$|\.ya?ml$|manifest\.json$)/i.test(asset.name);
  }

  function assetPlatform(name) {
    const lower = name.toLowerCase();
    if (/\.dmg$|mac\.zip$/.test(lower)) return "mac";
    if (/\.exe$/.test(lower)) return "windows";
    if (/\.appimage$|\.deb$/.test(lower)) return "linux";
    if (lower === "sha256sums") return "checksum";
    if (lower === "yana-rt" || lower === "yana-rt.exe") return "runtime";
    return "other";
  }

  function releaseVersion(release) {
    const source = `${release.tag_name || ""} ${release.name || ""}`;
    const match = source.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[^\d]|$)/);
    return match ? match.slice(1).map(Number) : null;
  }

  function isStudio15OrNewer(release) {
    const version = releaseVersion(release);
    if (!version) return false;
    const [major, minor] = version;
    return major > 1 || (major === 1 && minor >= 5);
  }

  function makeAssetLink(asset) {
    const link = document.createElement("a");
    link.className = "asset-link";
    link.href = asset.browser_download_url;
    const name = document.createElement("span");
    name.className = "asset-name";
    name.textContent = asset.name;
    const size = document.createElement("span");
    size.className = "meta";
    size.textContent = humanSize(asset.size);
    link.append(name, size);
    return link;
  }

  function renderDownload(release) {
    const root = document.querySelector("[data-release-download]");
    if (!root || !release) return;
    root.replaceChildren();
    const banner = document.createElement("div");
    banner.className = "release-banner";
    const info = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = release.name || release.tag_name;
    const small = document.createElement("small"); small.textContent = `${t("published")} ${humanDate(release.published_at)}`;
    info.append(strong, document.createElement("br"), small);
    const all = document.createElement("a"); all.className = "button secondary"; all.href = release.html_url; all.textContent = t("github");
    banner.append(info, all); root.append(banner);

    const platform = detectedPlatform();
    const grid = document.createElement("div"); grid.className = "grid three";
    const labels = { mac: "macOS", windows: "Windows", linux: "Linux" };
    Object.entries(labels).forEach(([key, label]) => {
      const card = document.createElement("article"); card.className = `os-card${platform === key ? " recommended" : ""}`;
      const head = document.createElement("div"); head.className = "os-title";
      const title = document.createElement("h3"); title.textContent = label;
      head.append(title);
      if (platform === key) { const badge = document.createElement("span"); badge.className = "status shipped"; badge.textContent = t("recommended"); head.append(badge); }
      card.append(head);
      const list = document.createElement("div"); list.className = "asset-list";
      const assets = release.assets.filter(isInstaller).filter((asset) => assetPlatform(asset.name) === key);
      if (!assets.length) { const empty = document.createElement("p"); empty.className = "meta"; empty.textContent = t("noAssets"); list.append(empty); }
      assets.forEach((asset) => list.append(makeAssetLink(asset)));
      card.append(list); grid.append(card);
    });
    root.append(grid);
    const checksum = release.assets.find((asset) => asset.name === "SHA256SUMS");
    if (checksum) { const note = document.createElement("p"); note.className = "meta"; const link = document.createElement("a"); link.className = "text-link"; link.href = checksum.browser_download_url; link.textContent = "SHA256SUMS"; note.append(document.createTextNode(`${t("verify")} `), link, document.createTextNode(".")); root.append(note); }
  }

  function renderReleases(releases) {
    const root = document.querySelector("[data-release-list]");
    if (!root || !releases.length) return;
    root.replaceChildren();
    releases.slice(0, 8).forEach((release) => {
      const item = document.createElement("article"); item.className = "timeline-item";
      const dot = document.createElement("span"); dot.className = "timeline-dot";
      const card = document.createElement("div"); card.className = "timeline-card";
      const header = document.createElement("header");
      const title = document.createElement("h3"); const link = document.createElement("a"); link.href = release.html_url; link.textContent = release.name || release.tag_name; title.append(link);
      const date = document.createElement("span"); date.className = "meta"; date.textContent = humanDate(release.published_at);
      header.append(title, date);
      const summary = document.createElement("p"); summary.textContent = `${release.assets.filter(isInstaller).length} ${t("assets")}`;
      const assets = document.createElement("div"); assets.className = "release-assets meta";
      assets.textContent = release.assets.filter(isInstaller).slice(0, 4).map((asset) => asset.name).join(" · ");
      card.append(header, summary, assets); item.append(dot, card); root.append(item);
    });
  }

  function renderReleaseSurfaces() {
    if (!state.releases.length) return;
    renderDownload(state.releases[0]);
    renderReleases(state.releases);
  }

  async function loadReleases() {
    if (!document.querySelector("[data-release-download], [data-release-list]")) return;
    try {
      const response = await fetch(`${API}/releases?per_page=10`, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub API ${response.status}`);
      state.releases = (await response.json()).filter((release) => !release.draft && isStudio15OrNewer(release));
      if (!state.releases.length) throw new Error("No Studio 1.5+ public releases");
      renderReleaseSurfaces();
    } catch (error) {
      const noCurrentRelease = error.message === "No Studio 1.5+ public releases";
      const message = noCurrentRelease ? t("noCurrentRelease") : t("unavailable");
      document.querySelectorAll("[data-release-loading]").forEach((node) => { node.textContent = message; });
      document.querySelectorAll("[data-release-error]").forEach((node) => node.classList.toggle("visible", !noCurrentRelease));
    }
  }

  document.querySelector(".menu-button")?.addEventListener("click", (event) => {
    const links = document.querySelector(".nav-links");
    const open = links?.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(Boolean(open)));
  });
  document.querySelectorAll(".nav-links a").forEach((link) => link.addEventListener("click", () => {
    document.querySelector(".nav-links")?.classList.remove("open");
    document.querySelector(".menu-button")?.setAttribute("aria-expanded", "false");
  }));
  document.querySelectorAll(".lang-btn").forEach((button) => button.addEventListener("click", () => setLang(button.dataset.lang)));
  const documentLanguage = document.documentElement.lang.slice(0, 2);
  const preferred = window.PAGE_I18N
    ? (localStorage.getItem("yana-ecosystem-lang") || ({ vi: "vi", ko: "ko", zh: "zh" }[navigator.language.slice(0, 2)] || "en"))
    : (fallback[documentLanguage] ? documentLanguage : "en");
  setLang(preferred);
  loadReleases();

  // Scroll-reveal: progressive enhancement only -- the .reveal class is
  // added here, by JS, never baked into the HTML. If this script fails to
  // load or run, every section keeps its normal, fully-visible default
  // state (see .reveal's CSS: only elements carrying the class start
  // hidden). The hero stays untouched -- it's already on screen at load,
  // "reveal on scroll" doesn't apply to content nobody had to scroll to.
  if (!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) && "IntersectionObserver" in window) {
    const revealTargets = document.querySelectorAll("main > section:not(.hero):not(.page-hero)");
    revealTargets.forEach((section) => section.classList.add("reveal"));
    const staggerGrids = document.querySelectorAll("main > section:not(.hero):not(.page-hero) > .product-grid, main > section:not(.hero):not(.page-hero) > .download-panel > [data-release-download] > .download-grid, .layer-diagram, .checkpoint-path, .home-scenario, .home-runtime-graph");
    staggerGrids.forEach((grid) => grid.classList.add("reveal-stagger"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("visible", entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealTargets.forEach((section) => observer.observe(section));
    staggerGrids.forEach((grid) => observer.observe(grid));
  }

  // Runtime scene: nodes connect while the scene is in view and disconnect
  // again once scrolled past, either direction -- so the transition plays
  // both scrolling down into a scene and scrolling back up out of it. Runs
  // even under prefers-reduced-motion -- the CSS strips the transition
  // there, so this just toggles the end state instantly instead of
  // animating it.
  if ("IntersectionObserver" in window) {
    const runtimeScenes = document.querySelectorAll(".runtime-scene");
    if (runtimeScenes.length) {
      const sceneObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("connected", entry.isIntersecting);
        });
      }, { threshold: 0.4 });
      runtimeScenes.forEach((scene) => sceneObserver.observe(scene));
    }

    // Scene 4 (Any AI): cycle through the real provider list while the
    // adjacent "unchanged" panel stays fixed. Paused entirely under
    // prefers-reduced-motion -- the first provider just stays shown.
    const cycle = document.querySelector("#anyai-cycle");
    if (cycle && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      const items = cycle.querySelectorAll(".anyai-item");
      let index = 0;
      setInterval(() => {
        items[index].classList.remove("is-active");
        index = (index + 1) % items.length;
        items[index].classList.add("is-active");
      }, 1900);
    }
  }
})();
