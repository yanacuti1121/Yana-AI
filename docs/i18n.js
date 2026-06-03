// YAMTAM i18n — shared translation engine for all pages
// Usage: <script src="i18n.js"></script>  — auto-detects page, applies translations
(function () {
  /* ── Translation tables ─────────────────────────────────────────────── */
  const T = {

    /* ── Shared nav ─────────────────────────────────────────────────── */
    nav: {
      en: { home:'Home', skills:'Skills', marketplace:'Marketplace', guide:'Guide',
            changelog:'Changelog', github:'GitHub', search:'Search', music:'Music',
            back:'← Back' },
      vi: { home:'Trang chủ', skills:'Skills', marketplace:'Marketplace', guide:'Hướng dẫn',
            changelog:'Changelog', github:'GitHub', search:'Tìm kiếm', music:'Nhạc',
            back:'← Quay lại' },
      ko: { home:'홈', skills:'스킬', marketplace:'마켓플레이스', guide:'가이드',
            changelog:'변경 이력', github:'GitHub', search:'검색', music:'음악',
            back:'← 뒤로' },
    },

    /* ── skills.html ────────────────────────────────────────────────── */
    skills: {
      en: {
        'page.title': 'YAMTAM Library — Skills & Agents',
        'hero.title': 'YAMTAM Library',
        'hero.sub':   '3,457 workflow skills + 95 agents — searchable by category, tag, domain.',
        'search.ph':  'Search skills or agents…',
        'search.ph.skills':  'Search skills — name, description, tags…',
        'search.ph.agents':  'Search agents — name, description, domain…',
        'tab.skills': 'Skills', 'tab.agents': 'Agents',
        'chip.yamtam': 'YAMTAM Core', 'chip.openai': 'OpenAI Plugins',
        'chip.terminal': 'TerminalSkills', 'chip.venice': 'Venice AI',
        'footer.back': '← yamtam-engine',
      },
      vi: {
        'page.title': 'Thư viện YAMTAM — Skills & Agents',
        'hero.title': 'Thư viện YAMTAM',
        'hero.sub':   '3.457 workflow skills + 95 agents — tìm kiếm theo danh mục, tag, domain.',
        'search.ph':  'Tìm skills hoặc agents…',
        'search.ph.skills':  'Tìm skills — tên, mô tả, tags…',
        'search.ph.agents':  'Tìm agents — tên, mô tả, domain…',
        'tab.skills': 'Skills', 'tab.agents': 'Agents',
        'chip.yamtam': 'YAMTAM Core', 'chip.openai': 'OpenAI Plugins',
        'chip.terminal': 'TerminalSkills', 'chip.venice': 'Venice AI',
        'footer.back': '← yamtam-engine',
      },
      ko: {
        'page.title': 'YAMTAM 라이브러리 — 스킬 & 에이전트',
        'hero.title': 'YAMTAM 라이브러리',
        'hero.sub':   '3,457개 워크플로우 스킬 + 95개 에이전트 — 카테고리, 태그, 도메인별 검색.',
        'search.ph':  '스킬 또는 에이전트 검색…',
        'search.ph.skills':  '스킬 검색 — 이름, 설명, 태그…',
        'search.ph.agents':  '에이전트 검색 — 이름, 설명, 도메인…',
        'tab.skills': '스킬', 'tab.agents': '에이전트',
        'chip.yamtam': 'YAMTAM 코어', 'chip.openai': 'OpenAI 플러그인',
        'chip.terminal': 'TerminalSkills', 'chip.venice': 'Venice AI',
        'footer.back': '← yamtam-engine',
      },
    },

    /* ── marketplace.html ───────────────────────────────────────────── */
    marketplace: {
      en: {
        'page.title':  'YAMTAM Marketplace — Skills & Agents',
        'hero.title':  'YAMTAM Marketplace',
        'hero.sub':    'Install any skill or agent in one command.',
        'search.ph':   'Search skills, agents, tools…',
        'cat.all':     'All', 'cat.skills': 'Skills', 'cat.agents': 'Agents',
        'cat.tools':   'Tools', 'cat.rules':  'Rules',
        'grid.all':    'All items',
        'btn.install': 'Install', 'btn.use': 'Use', 'btn.copy': 'Copy',
        'btn.copied':  '✓ Copied',
        'footer.back': '← yamtam-engine',
      },
      vi: {
        'page.title':  'YAMTAM Marketplace — Skills & Agents',
        'hero.title':  'YAMTAM Marketplace',
        'hero.sub':    'Cài bất kỳ skill hay agent chỉ bằng một lệnh.',
        'search.ph':   'Tìm skills, agents, tools…',
        'cat.all':     'Tất cả', 'cat.skills': 'Skills', 'cat.agents': 'Agents',
        'cat.tools':   'Tools', 'cat.rules':  'Rules',
        'grid.all':    'Tất cả',
        'btn.install': 'Cài đặt', 'btn.use': 'Dùng', 'btn.copy': 'Sao chép',
        'btn.copied':  '✓ Đã sao chép',
        'footer.back': '← yamtam-engine',
      },
      ko: {
        'page.title':  'YAMTAM 마켓플레이스 — 스킬 & 에이전트',
        'hero.title':  'YAMTAM 마켓플레이스',
        'hero.sub':    '명령어 하나로 스킬이나 에이전트를 설치하세요.',
        'search.ph':   '스킬, 에이전트, 도구 검색…',
        'cat.all':     '전체', 'cat.skills': '스킬', 'cat.agents': '에이전트',
        'cat.tools':   '도구', 'cat.rules':  '규칙',
        'grid.all':    '전체 항목',
        'btn.install': '설치', 'btn.use': '사용', 'btn.copy': '복사',
        'btn.copied':  '✓ 복사됨',
        'footer.back': '← yamtam-engine',
      },
    },

    /* ── guide.html ─────────────────────────────────────────────────── */
    guide: {
      en: {
        'page.title':      'Guide — YAMTAM ENGINE',
        'page.h1':         'YAMTAM ENGINE Guide',
        'page.sub':        'Everything you need to install, configure, and run YAMTAM ENGINE.',
        'sidebar.start':   'Getting Started',
        'sidebar.runtime': 'Runtime CLI',
        'sidebar.skills':  'Skills & Agents',
        'nav.install':     'Installation',
        'nav.first-scan':  'First Scan',
        'nav.gates':       'Gate System',
        'nav.scan':        'scan',
        'nav.hunt':        'hunt',
        'nav.ci':          'ci',
        'nav.watch':       'watch',
        'nav.init':        'init',
        'nav.commands':    'All Commands',
        'nav.skills':      'Using Skills',
        'nav.agents':      'Agent Teams',
        'h2.install':      'Installation',
        'h2.first-scan':   'First Scan',
        'h2.gates':        'Gate System',
        'h2.scan':         'yamtam-rt scan',
        'h2.hunt':         'yamtam-rt hunt',
        'h2.ci':           'yamtam-rt ci',
        'h2.watch':        'yamtam-rt watch',
        'h2.init':         'yamtam-rt init',
        'footer.back':     '← yamtam-engine',
      },
      vi: {
        'page.title':      'Hướng dẫn — YAMTAM ENGINE',
        'page.h1':         'Hướng dẫn YAMTAM ENGINE',
        'page.sub':        'Mọi thứ cần biết để cài đặt, cấu hình và chạy YAMTAM ENGINE.',
        'sidebar.start':   'Bắt đầu',
        'sidebar.runtime': 'Runtime CLI',
        'sidebar.skills':  'Skills & Agents',
        'nav.install':     'Cài đặt',
        'nav.first-scan':  'Scan đầu tiên',
        'nav.gates':       'Hệ thống Gate',
        'nav.scan':        'scan',
        'nav.hunt':        'hunt',
        'nav.ci':          'ci',
        'nav.watch':       'watch',
        'nav.init':        'init',
        'nav.commands':    'Tất cả lệnh',
        'nav.skills':      'Dùng Skills',
        'nav.agents':      'Agent Teams',
        'h2.install':      'Cài đặt',
        'h2.first-scan':   'Scan đầu tiên',
        'h2.gates':        'Hệ thống Gate',
        'h2.scan':         'yamtam-rt scan',
        'h2.hunt':         'yamtam-rt hunt',
        'h2.ci':           'yamtam-rt ci',
        'h2.watch':        'yamtam-rt watch',
        'h2.init':         'yamtam-rt init',
        'footer.back':     '← yamtam-engine',
      },
      ko: {
        'page.title':      '가이드 — YAMTAM ENGINE',
        'page.h1':         'YAMTAM ENGINE 가이드',
        'page.sub':        'YAMTAM ENGINE 설치, 설정, 실행에 필요한 모든 정보.',
        'sidebar.start':   '시작하기',
        'sidebar.runtime': '런타임 CLI',
        'sidebar.skills':  '스킬 & 에이전트',
        'nav.install':     '설치',
        'nav.first-scan':  '첫 번째 스캔',
        'nav.gates':       '게이트 시스템',
        'nav.scan':        'scan',
        'nav.hunt':        'hunt',
        'nav.ci':          'ci',
        'nav.watch':       'watch',
        'nav.init':        'init',
        'nav.commands':    '전체 명령어',
        'nav.skills':      '스킬 사용',
        'nav.agents':      '에이전트 팀',
        'h2.install':      '설치',
        'h2.first-scan':   '첫 번째 스캔',
        'h2.gates':        '게이트 시스템',
        'h2.scan':         'yamtam-rt scan',
        'h2.hunt':         'yamtam-rt hunt',
        'h2.ci':           'yamtam-rt ci',
        'h2.watch':        'yamtam-rt watch',
        'h2.init':         'yamtam-rt init',
        'footer.back':     '← yamtam-engine',
      },
    },

    /* ── search.html ────────────────────────────────────────────────── */
    search: {
      en: {
        'page.title':   'Search — YAMTAM ENGINE',
        'page.h1':      'Search',
        'page.loading': 'Loading index…',
        'search.ph':    'Search skills, agents, commands, rules…',
        'filter.all':      'All',
        'filter.skill':    'Skills',
        'filter.agent':    'Agents',
        'filter.command':  'Commands',
        'filter.rule':     'Rules',
        'stats.results':   (n) => `${n} result${n===1?'':'s'}`,
      },
      vi: {
        'page.title':   'Tìm kiếm — YAMTAM ENGINE',
        'page.h1':      'Tìm kiếm',
        'page.loading': 'Đang tải chỉ mục…',
        'search.ph':    'Tìm skills, agents, lệnh, rules…',
        'filter.all':      'Tất cả',
        'filter.skill':    'Skills',
        'filter.agent':    'Agents',
        'filter.command':  'Lệnh',
        'filter.rule':     'Rules',
        'stats.results':   (n) => `${n} kết quả`,
      },
      ko: {
        'page.title':   '검색 — YAMTAM ENGINE',
        'page.h1':      '검색',
        'page.loading': '인덱스 로딩 중…',
        'search.ph':    '스킬, 에이전트, 명령어, 규칙 검색…',
        'filter.all':      '전체',
        'filter.skill':    '스킬',
        'filter.agent':    '에이전트',
        'filter.command':  '명령어',
        'filter.rule':     '규칙',
        'stats.results':   (n) => `${n}개 결과`,
      },
    },

    /* ── music.html ─────────────────────────────────────────────────── */
    music: {
      en: {
        'page.title':      'Music — YAMTAM ENGINE',
        'page.h1':         '🎵 Choose Music',
        'page.sub':        'Background music for the whole site — state saved between pages.',
        'now.label':       'Now playing',
        'add.title':       'Add from YouTube',
        'add.ph':          'Paste YouTube link or video ID…',
        'add.hint':        'e.g. https://youtu.be/aKSJAcG4V4o or aKSJAcG4V4o',
        'add.btn':         'Add',
        'mute.label':      'Mute / Unmute',
        'mute.on':         '🔊 On',
        'mute.off':        '🔇 Off',
        'playing.badge':   '▶ Playing',
        'back.link':       '← Home',
      },
      vi: {
        'page.title':      'Nhạc — YAMTAM ENGINE',
        'page.h1':         '🎵 Chọn nhạc',
        'page.sub':        'Nhạc nền cho toàn bộ site — state lưu giữa các trang.',
        'now.label':       'Đang phát',
        'add.title':       'Thêm bài từ YouTube',
        'add.ph':          'Paste link YouTube hoặc video ID…',
        'add.hint':        'VD: https://youtu.be/aKSJAcG4V4o hoặc aKSJAcG4V4o',
        'add.btn':         'Thêm',
        'mute.label':      'Tắt / bật nhạc',
        'mute.on':         '🔊 Bật',
        'mute.off':        '🔇 Đang tắt',
        'playing.badge':   '▶ Đang phát',
        'back.link':       '← Về trang chủ',
      },
      ko: {
        'page.title':      '음악 — YAMTAM ENGINE',
        'page.h1':         '🎵 음악 선택',
        'page.sub':        '전체 사이트 배경 음악 — 페이지 간 상태 유지.',
        'now.label':       '지금 재생 중',
        'add.title':       'YouTube에서 추가',
        'add.ph':          'YouTube 링크 또는 영상 ID 붙여넣기…',
        'add.hint':        '예: https://youtu.be/aKSJAcG4V4o 또는 aKSJAcG4V4o',
        'add.btn':         '추가',
        'mute.label':      '음소거 / 해제',
        'mute.on':         '🔊 켜짐',
        'mute.off':        '🔇 음소거',
        'playing.badge':   '▶ 재생 중',
        'back.link':       '← 홈으로',
      },
    },

    /* ── changelog.html ─────────────────────────────────────────────── */
    changelog: {
      en: {
        'page.title': 'Changelog — YAMTAM ENGINE',
        'page.h1':    'Changelog',
        'page.sub':   'Full history of releases and commits.',
        'badge.head': '🔵 HEAD',
        'badge.cur':  'Current',
        'label.date': 'Released',
        'footer.back':'← yamtam-engine',
      },
      vi: {
        'page.title': 'Changelog — YAMTAM ENGINE',
        'page.h1':    'Changelog',
        'page.sub':   'Toàn bộ lịch sử release và commit.',
        'badge.head': '🔵 HEAD',
        'badge.cur':  'Hiện tại',
        'label.date': 'Phát hành',
        'footer.back':'← yamtam-engine',
      },
      ko: {
        'page.title': '변경 이력 — YAMTAM ENGINE',
        'page.h1':    '변경 이력',
        'page.sub':   '전체 릴리즈 및 커밋 히스토리.',
        'badge.head': '🔵 HEAD',
        'badge.cur':  '현재',
        'label.date': '출시일',
        'footer.back':'← yamtam-engine',
      },
    },

    /* ── yamtam-system-map.html ─────────────────────────────────────── */
    sysmap: {
      en: {
        'page.title': 'YAMTAM ENGINE — System Map',
        'page.h1':    'System Map',
        'page.sub':   'Architecture overview of YAMTAM ENGINE.',
      },
      vi: {
        'page.title': 'YAMTAM ENGINE — Bản đồ hệ thống',
        'page.h1':    'Bản đồ hệ thống',
        'page.sub':   'Tổng quan kiến trúc YAMTAM ENGINE.',
      },
      ko: {
        'page.title': 'YAMTAM ENGINE — 시스템 맵',
        'page.h1':    '시스템 맵',
        'page.sub':   'YAMTAM ENGINE 아키텍처 개요.',
      },
    },
  };

  /* ── State ──────────────────────────────────────────────────────────── */
  let lang = localStorage.getItem('yamtam-lang') || 'vi';

  /* ── Detect current page ────────────────────────────────────────────── */
  function detectPage() {
    const p = location.pathname.split('/').pop().replace('.html', '') || 'index';
    const MAP = { 'yamtam-system-map': 'sysmap' };
    return MAP[p] || p;
  }

  /* ── Translation helper ─────────────────────────────────────────────── */
  function t(page, key) {
    const pg = T[page];
    if (!pg) return null;
    const loc = pg[lang] || pg['en'];
    return loc ? loc[key] : null;
  }

  function tNav(key) { return (T.nav[lang] || T.nav['en'])[key] || key; }

  /* ── Apply translations to DOM ──────────────────────────────────────── */
  function applyI18n() {
    const page = detectPage();
    document.documentElement.lang = lang;

    // data-i18n: text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = t(page, key) || tNav(key);
      if (val && typeof val === 'string') el.innerHTML = val;
    });

    // data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const val = t(page, el.dataset.i18nPlaceholder) || tNav(el.dataset.i18nPlaceholder);
      if (val) el.placeholder = val;
    });

    // data-i18n-title (HTML <title>)
    const titleKey = t(page, 'page.title');
    if (titleKey) document.title = titleKey;

    // Lang buttons
    document.querySelectorAll('.lang-btn, [data-lang-btn]').forEach(btn => {
      const code = (btn.dataset.lang || btn.textContent.trim()).toLowerCase();
      btn.classList.toggle('active', code === lang);
    });

    // page-specific dynamic text
    applyPageSpecific(page);
  }

  /* ── Page-specific logic ────────────────────────────────────────────── */
  function applyPageSpecific(page) {
    if (page === 'skills') {
      const si = document.getElementById('search');
      if (si) si.placeholder = t('skills', 'search.ph') || '';
    }

    if (page === 'marketplace') {
      const si = document.getElementById('search');
      if (si) si.placeholder = t('marketplace', 'search.ph') || '';
      // grid title
      const gt = document.getElementById('grid-title');
      if (gt && gt.textContent.match(/^All/i)) gt.textContent = t('marketplace','grid.all') || gt.textContent;
    }

    if (page === 'search') {
      const q = document.getElementById('q');
      if (q) q.placeholder = t('search','search.ph') || '';
      // filter buttons
      document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
        const key = 'filter.' + btn.dataset.type;
        const val = t('search', key);
        if (val) btn.textContent = val;
      });
      // subtitle
      const sub = document.getElementById('subtitle');
      if (sub && sub.textContent.includes('Loading')) sub.textContent = t('search','page.loading') || sub.textContent;
    }

    if (page === 'music') {
      const h1 = document.querySelector('h1');
      if (h1) h1.textContent = t('music','page.h1') || h1.textContent;
      const sub = document.querySelector('p.sub');
      if (sub) sub.textContent = t('music','page.sub') || sub.textContent;
      const inp = document.getElementById('add-url');
      if (inp) inp.placeholder = t('music','add.ph') || inp.placeholder;
      const addBtn = document.querySelector('.add-btn');
      if (addBtn) addBtn.textContent = t('music','add.btn') || addBtn.textContent;
      const muteRow = document.querySelector('.mute-label');
      if (muteRow) muteRow.textContent = t('music','mute.label') || muteRow.textContent;
      const nowLabel = document.querySelector('.now-playing-label');
      if (nowLabel) nowLabel.textContent = t('music','now.label') || nowLabel.textContent;
      const addTitle = document.querySelector('.add-section h2');
      if (addTitle) addTitle.textContent = t('music','add.title') || addTitle.textContent;
      const addHint = document.querySelector('.add-hint');
      if (addHint) addHint.textContent = t('music','add.hint') || addHint.textContent;
      const back = document.querySelector('a.back-link');
      if (back) back.textContent = t('music','back.link') || back.textContent;
      const muteBtn = document.getElementById('mute-toggle-btn');
      if (muteBtn) {
        const muted = localStorage.getItem('site-mute') === '1';
        muteBtn.textContent = muted ? t('music','mute.off') : t('music','mute.on');
      }
    }

    if (page === 'guide') {
      const h1 = document.querySelector('article h1');
      if (h1) h1.textContent = t('guide','page.h1') || h1.textContent;
      // sidebar section labels
      document.querySelectorAll('aside .section-label').forEach(el => {
        const txt = el.textContent.trim();
        if (/getting started/i.test(txt))  el.textContent = t('guide','sidebar.start')   || txt;
        if (/runtime cli/i.test(txt))       el.textContent = t('guide','sidebar.runtime') || txt;
        if (/skills.*agents/i.test(txt))    el.textContent = t('guide','sidebar.skills')  || txt;
      });
      // sidebar links
      document.querySelectorAll('aside a[href^="#"]').forEach(el => {
        const id = el.getAttribute('href').slice(1);
        const val = t('guide', 'nav.'+id);
        if (val) el.textContent = val;
      });
    }

    if (page === 'changelog') {
      const h1 = document.querySelector('h1');
      if (h1) h1.textContent = t('changelog','page.h1') || h1.textContent;
      const sub = document.querySelector('.subtitle');
      if (sub) sub.textContent = t('changelog','page.sub') || sub.textContent;
    }
  }

  /* ── Lang bar UI ────────────────────────────────────────────────────── */
  function ensureLangBar() {
    if (document.querySelector('.lang-btn, [data-lang-btn]')) return; // already exists
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:fixed; bottom:18px; left:50%; transform:translateX(-50%);
      z-index:9999; display:flex; gap:3px;
      background:rgba(255,255,255,.35); backdrop-filter:blur(28px) saturate(220%);
      -webkit-backdrop-filter:blur(28px) saturate(220%);
      border:1px solid rgba(255,255,255,.65); border-radius:18px; padding:4px 6px;
      box-shadow:0 6px 24px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.8);
    `;
    ['VI','EN','KO'].forEach(code => {
      const btn = document.createElement('button');
      btn.textContent = code;
      btn.dataset.lang = code.toLowerCase();
      btn.className = 'lang-btn';
      btn.style.cssText = `
        border:none; background:transparent; cursor:pointer;
        font-size:.68rem; font-weight:700; padding:.22rem .55rem; border-radius:12px;
        color:rgba(30,50,80,.55); transition:background .15s,color .15s; font-family:inherit;
        letter-spacing:.04em;
      `;
      if (btn.dataset.lang === lang) {
        btn.style.background = 'rgba(30,50,80,.12)';
        btn.style.color = 'hsl(220 78% 24%)';
      }
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
      bar.appendChild(btn);
    });
    document.body.appendChild(bar);
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  window.setLang = function(l) {
    lang = l;
    localStorage.setItem('yamtam-lang', l);
    applyI18n();
    // Sync existing lang buttons style if injected bar
    document.querySelectorAll('[data-lang-btn], .lang-btn[data-lang]').forEach(btn => {
      const code = (btn.dataset.lang || '').toLowerCase();
      const active = code === l;
      btn.style.background = active ? 'rgba(30,50,80,.12)' : 'transparent';
      btn.style.color      = active ? 'hsl(220 78% 24%)'  : 'rgba(30,50,80,.55)';
    });
  };

  window._i18n = { t, tNav, applyI18n, lang: () => lang };

  /* ── Boot ───────────────────────────────────────────────────────────── */
  function boot() {
    ensureLangBar();
    applyI18n();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
