(() => {
  const REPO = "yanacuti1121/Yana-AI";
  const API = `https://api.github.com/repos/${REPO}`;
  const RELEASES_URL = `https://github.com/${REPO}/releases`;
  const state = { lang: "en", releases: [] };
  const FETCH_TIMEOUT_MS = 10000; // the GitHub API can stall on a flaky network; without a cap the page sat on "loading" forever

  // localStorage throws when storage is blocked (private mode, site settings). An unguarded call aborted this
  // whole script, so releases never loaded and the reveal/scene code below never ran.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (error) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (error) { /* storage blocked: language choice is just not remembered */ } }
  };

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
    store.set("yana-ecosystem-lang", lang);
    document.documentElement.lang = lang;
    if (window.PAGE_I18N) {
      document.querySelectorAll("[data-i18n]").forEach((node) => {
        const value = t(node.dataset.i18n);
        if (value !== undefined) node.innerHTML = value;
      });
      document.querySelectorAll(".lang-btn").forEach((button) => button.classList.toggle("active", button.dataset.lang === lang));
    }
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
    const all = document.createElement("a"); all.className = "button light"; all.href = release.html_url; all.textContent = t("github");
    banner.append(info, all); root.append(banner);

    const platform = detectedPlatform();
    const grid = document.createElement("div"); grid.className = "download-grid";
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
      const response = await fetch(`${API}/releases?per_page=10`, {
        headers: { Accept: "application/vnd.github+json" },
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
      });
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

  function currentPage() {
    const name = window.location.pathname.split("/").pop();
    return name || "index.html";
  }

  function sharedNavigation() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;

    const language = document.documentElement.lang.slice(0, 2);
    if (language !== "vi" && language !== "en") return;

    const isVietnamese = language === "vi";
    const page = currentPage();
    const languagePair = {
      "index.html": "en.html", "en.html": "index.html",
      "studio.html": "studio-en.html", "studio-en.html": "studio.html",
      "runtime.html": "runtime-en.html", "runtime-en.html": "runtime.html",
      "wheelbot.html": "wheelbot-en.html", "wheelbot-en.html": "wheelbot.html",
      "ecosystem.html": "ecosystem-en.html", "ecosystem-en.html": "ecosystem.html",
      "models.html": "models-en.html", "models-en.html": "models.html",
      "agents-skills.html": "agents-skills-en.html", "agents-skills-en.html": "agents-skills.html",
      "connectors.html": "connectors-en.html", "connectors-en.html": "connectors.html",
      "missions.html": "missions-en.html", "missions-en.html": "missions.html",
      "continuity.html": "continuity-en.html", "continuity-en.html": "continuity.html",
      "design.html": "design-en.html", "design-en.html": "design.html",
      "governance.html": "governance-en.html", "governance-en.html": "governance.html",
      "evidence.html": "evidence-en.html", "evidence-en.html": "evidence.html",
      "safety.html": "safety-en.html", "safety-en.html": "safety.html",
      "architecture.html": "architecture-en.html", "architecture-en.html": "architecture.html",
      "download.html": "download-en.html", "download-en.html": "download.html"
    };

    const copy = isVietnamese ? {
      home: "Trang chủ", open: "Mở menu", close: "Đóng menu", language: "EN", cta: "Tải Studio",
      products: "Sản phẩm", platform: "Nền tảng", trust: "Trust", resources: "Tài nguyên",
      productsEyebrow: "KHÁM PHÁ YANA", productsTitle: "Những bề mặt để làm việc.",
      platformEyebrow: "NỀN TẢNG", platformTitle: "Mọi lớp bên dưới Studio.",
      trustEyebrow: "QUYỀN & BẰNG CHỨNG", trustTitle: "Nhìn rõ ranh giới kiểm soát.",
      resourcesEyebrow: "TÀI LIỆU & CẬP NHẬT", resourcesTitle: "Theo dõi nguồn chính thức.",
      studio: "Yana Studio", studioDetail: "Workspace trực quan cho AI có kiểm soát",
      runtime: "Yana Runtime", runtimeDetail: "Control plane và thực thi có giới hạn",
      wheelbot: "Yana Wheelbot", wheelbotDetail: "Ranh giới AI vật lý",
      download: "Tải Studio", downloadDetail: "Bộ cài macOS Apple Silicon",
      ecosystem: "Hệ sinh thái", ecosystemDetail: "Xem các bề mặt Yana",
      models: "Models & Providers", modelsDetail: "Catalog cloud và local",
      agents: "Agents & Skills", agentsDetail: "Tác vụ, agent và skill",
      missions: "Missions", missionsDetail: "Điều phối công việc AI",
      continuity: "Continuity", continuityDetail: "Context qua nhiều phiên",
      connectors: "Connectors", connectorsDetail: "Kết nối có quyền riêng",
      design: "Design Canvas", designDetail: "Bề mặt thiết kế thử nghiệm",
      governance: "Governance", governanceDetail: "Con người giữ quyền quyết định",
      safety: "Safety / Guardrails", safetyDetail: "Luật bảo vệ và chặn rủi ro",
      evidence: "Evidence & Audit", evidenceDetail: "Dấu vết và bằng chứng",
      architecture: "Kiến trúc", architectureDetail: "Từ bề mặt tới Runtime",
      releases: "GitHub Releases", releasesDetail: "Bản phát hành thực tế",
      roadmap: "Roadmap", roadmapDetail: "Hướng phát triển chính thức",
      security: "Security", securityDetail: "Chính sách bảo mật",
      source: "GitHub", sourceDetail: "Mã nguồn Yana"
    } : {
      home: "Home", open: "Open menu", close: "Close menu", language: "VI", cta: "Get Studio",
      products: "Products", platform: "Platform", trust: "Trust", resources: "Resources",
      productsEyebrow: "EXPLORE YANA", productsTitle: "The surfaces where work happens.",
      platformEyebrow: "THE PLATFORM", platformTitle: "Everything beneath Studio.",
      trustEyebrow: "AUTHORITY & EVIDENCE", trustTitle: "Make control boundaries visible.",
      resourcesEyebrow: "DOCUMENTATION & UPDATES", resourcesTitle: "Follow the official source.",
      studio: "Yana Studio", studioDetail: "Visual workspace for governed AI",
      runtime: "Yana Runtime", runtimeDetail: "Control plane and bounded execution",
      wheelbot: "Yana Wheelbot", wheelbotDetail: "The physical-AI boundary",
      download: "Download Studio", downloadDetail: "Apple Silicon macOS installer",
      ecosystem: "Ecosystem", ecosystemDetail: "See Yana's real surfaces",
      models: "Models & Providers", modelsDetail: "Cloud and local catalog",
      agents: "Agents & Skills", agentsDetail: "Tasks, agents and skills",
      missions: "Missions", missionsDetail: "Coordinate AI work",
      continuity: "Continuity", continuityDetail: "Context across sessions",
      connectors: "Connectors", connectorsDetail: "Separately governed connections",
      design: "Design Canvas", designDetail: "Experimental design surface",
      governance: "Governance", governanceDetail: "Human authority stays explicit",
      safety: "Safety / Guardrails", safetyDetail: "Protective policy and limits",
      evidence: "Evidence & Audit", evidenceDetail: "Records and evidence",
      architecture: "Architecture", architectureDetail: "From surfaces to Runtime",
      releases: "GitHub Releases", releasesDetail: "Actual published releases",
      roadmap: "Roadmap", roadmapDetail: "Official development direction",
      security: "Security", securityDetail: "Security policy",
      source: "GitHub", sourceDetail: "Yana source code"
    };

    const route = (vi, en) => isVietnamese ? vi : en;
    const item = (href, title, detail, selected = false) =>
      `<a class="global-mega-link${selected ? " is-current" : ""}" href="${href}"${selected ? " aria-current=\"page\"" : ""}><strong>${title}</strong><small>${detail}</small></a>`;
    const panel = (eyebrow, title, columns) =>
      `<div class="global-mega-panel"><div class="global-mega-intro"><small>${eyebrow}</small><h3>${title}</h3></div>${columns.map((column) => `<div class="global-mega-column">${column}</div>`).join("")}</div>`;
    const group = (label, key, eyebrow, title, columns) =>
      `<details class="global-nav-group" data-nav-group="${key}"><summary>${label}</summary>${panel(eyebrow, title, columns)}</details>`;
    const pageIs = (...pages) => pages.includes(page);

    const productLinks = [
      item(route("studio.html", "studio-en.html"), copy.studio, copy.studioDetail, pageIs("studio.html", "studio-en.html")),
      item(route("runtime.html", "runtime-en.html"), copy.runtime, copy.runtimeDetail, pageIs("runtime.html", "runtime-en.html")),
      item(route("wheelbot.html", "wheelbot-en.html"), copy.wheelbot, copy.wheelbotDetail, pageIs("wheelbot.html", "wheelbot-en.html"))
    ].join("");
    const platformLinks = [
      item(route("models.html", "models-en.html"), copy.models, copy.modelsDetail, pageIs("models.html", "models-en.html")),
      item(route("agents-skills.html", "agents-skills-en.html"), copy.agents, copy.agentsDetail, pageIs("agents-skills.html", "agents-skills-en.html")),
      item(route("missions.html", "missions-en.html"), copy.missions, copy.missionsDetail, pageIs("missions.html", "missions-en.html")),
      item(route("continuity.html", "continuity-en.html"), copy.continuity, copy.continuityDetail, pageIs("continuity.html", "continuity-en.html")),
      item(route("connectors.html", "connectors-en.html"), copy.connectors, copy.connectorsDetail, pageIs("connectors.html", "connectors-en.html")),
      item(route("design.html", "design-en.html"), copy.design, copy.designDetail, pageIs("design.html", "design-en.html"))
    ];
    const trustLinks = [
      item(route("governance.html", "governance-en.html"), copy.governance, copy.governanceDetail, pageIs("governance.html", "governance-en.html")),
      item(route("safety.html", "safety-en.html"), copy.safety, copy.safetyDetail, pageIs("safety.html", "safety-en.html")),
      item(route("evidence.html", "evidence-en.html"), copy.evidence, copy.evidenceDetail, pageIs("evidence.html", "evidence-en.html")),
      item(route("architecture.html", "architecture-en.html"), copy.architecture, copy.architectureDetail, pageIs("architecture.html", "architecture-en.html"))
    ];
    const resourceLinks = [
      item(route("download.html", "download-en.html"), copy.download, copy.downloadDetail, pageIs("download.html", "download-en.html")),
      item(route("ecosystem.html", "ecosystem-en.html"), copy.ecosystem, copy.ecosystemDetail, pageIs("ecosystem.html", "ecosystem-en.html")),
      item("https://github.com/yanacuti1121/Yana-AI/releases", copy.releases, copy.releasesDetail),
      item("https://github.com/yanacuti1121/Yana-AI/blob/main/ROADMAP.md", copy.roadmap, copy.roadmapDetail),
      item("https://github.com/yanacuti1121/Yana-AI/blob/main/SECURITY.md", copy.security, copy.securityDetail),
      item("https://github.com/yanacuti1121/Yana-AI", copy.source, copy.sourceDetail)
    ];
    const brand = document.body.classList.contains("home-page")
      ? `<a class="brand home-brand" href="${route("index.html", "en.html")}" aria-label="Yana ${copy.home}"><span class="home-brand-mark" aria-hidden="true">Y</span><span>Yana</span></a>`
      : `<a class="brand" href="${route("index.html", "en.html")}" aria-label="Yana ${copy.home}"><img src="yana-logo.png" alt=""><span>Yana</span></a>`;

    nav.classList.add("global-nav");
    nav.setAttribute("aria-label", isVietnamese ? "Điều hướng chính" : "Primary navigation");
    nav.innerHTML = `${brand}<button class="menu-button" type="button" aria-label="${copy.open}" aria-expanded="false">☰</button><div class="nav-links global-nav-links"><a class="global-home-link${pageIs("index.html", "en.html") ? " is-current" : ""}" href="${route("index.html", "en.html")}"${pageIs("index.html", "en.html") ? " aria-current=\"page\"" : ""}>${copy.home}</a>${group(copy.products, "products", copy.productsEyebrow, copy.productsTitle, [productLinks, item(route("download.html", "download-en.html"), copy.download, copy.downloadDetail), item(route("ecosystem.html", "ecosystem-en.html"), copy.ecosystem, copy.ecosystemDetail)])}${group(copy.platform, "platform", copy.platformEyebrow, copy.platformTitle, [platformLinks.slice(0, 3).join(""), platformLinks.slice(3).join("")])}${group(copy.trust, "trust", copy.trustEyebrow, copy.trustTitle, [trustLinks.slice(0, 2).join(""), trustLinks.slice(2).join("")])}${group(copy.resources, "resources", copy.resourcesEyebrow, copy.resourcesTitle, [resourceLinks.slice(0, 2).join(""), resourceLinks.slice(2, 4).join(""), resourceLinks.slice(4).join("")])}<a class="global-language-link" href="${languagePair[page] || route("en.html", "index.html")}" lang="${isVietnamese ? "en" : "vi"}">${copy.language}</a></div><div class="nav-actions"><a class="nav-cta" href="${route("download.html", "download-en.html")}">${copy.cta}<span aria-hidden="true">↗</span></a></div>`;

    const menuButton = nav.querySelector(".menu-button");
    const links = nav.querySelector(".nav-links");
    const groups = [...nav.querySelectorAll(".global-nav-group")];
    const closeGroups = (except) => groups.forEach((group) => {
      if (group !== except) group.removeAttribute("open");
    });
    const closeAll = () => {
      closeGroups();
      links.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    };

    menuButton.addEventListener("click", () => {
      const isOpen = links.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute("aria-label", isOpen ? copy.close : copy.open);
    });
    groups.forEach((group) => {
      group.addEventListener("toggle", () => {
        if (group.open) closeGroups(group);
      });
      if (window.matchMedia("(hover: hover)").matches) {
        let closeTimer;
        group.addEventListener("pointerenter", () => {
          window.clearTimeout(closeTimer);
          closeGroups(group);
          group.open = true;
        });
        group.addEventListener("pointerleave", () => {
          closeTimer = window.setTimeout(() => group.removeAttribute("open"), 120);
        });
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!nav.contains(event.target)) closeAll();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAll();
        menuButton.focus();
      }
    });
  }

  sharedNavigation();

  if (window.PAGE_I18N) {
    document.querySelectorAll(".lang-btn").forEach((button) => button.addEventListener("click", () => setLang(button.dataset.lang)));
  }
  const documentLanguage = document.documentElement.lang.slice(0, 2);
  const preferred = window.PAGE_I18N
    ? (store.get("yana-ecosystem-lang") ||({ vi: "vi", ko: "ko", zh: "zh" }[navigator.language.slice(0, 2)] || "en"))
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
    const revealTargets = document.querySelectorAll("main > section:not(.hero):not(.page-hero):not(.home-hero)");
    revealTargets.forEach((section) => section.classList.add("reveal"));
    const staggerGrids = document.querySelectorAll("main > section:not(.hero):not(.page-hero) > .product-grid, main > section:not(.hero):not(.page-hero) > .download-panel > [data-release-download] > .download-grid, .home-scenario, .signature-map, .convergence, .gate-path");
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
      // with fewer than two items there is nothing to cycle, and items[0] being undefined threw on every tick
      if (items.length > 1) {
        setInterval(() => {
          if (document.hidden) return; // no point restyling while the tab is in the background
          items[index].classList.remove("is-active");
          index = (index + 1) % items.length;
          items[index].classList.add("is-active");
        }, 1900);
      }
    }
  }
})();
