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
        'h2.commands':     'All Commands',
        'h2.skills':       'Using Skills',
        'h2.agents':       'Agent Teams',
        'p.install':       'Three components, install what you need:',
        'p.first-scan':    'Scan your project for agent security risks in 30 seconds:',
        'p.gates':         'YAMTAM intercepts every Claude tool call through a layered gate pipeline:',
        'p.scan':          'Full security audit of your .claude/ setup and source files.',
        'p.hunt':          'Active scanner — goes deeper into code vulnerabilities and supply chain.',
        'p.ci':            'CI/CD workflow security check — unpinned actions, missing permissions, secret exposure.',
        'p.watch':         'Live file watcher — prints changes to skills, agents, rules as they happen.',
        'p.init':          'Auto-setup YAMTAM in any project — creates hooks, config, and settings skeleton in one command.',
        'p.skills':        'Skills are slash commands for Claude Code. With yamtam-engine installed, 3,457 skills are available.',
        'p.agents':        '95 specialized agents auto-routed by /agent-router. Key agents:',
        'footer.back':     '← yamtam-engine',
        'footer.built':    'Built by Vũ Văn Tâm · Vietnam',
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
        'h2.commands':     'Tất cả lệnh',
        'h2.skills':       'Dùng Skills',
        'h2.agents':       'Agent Teams',
        'p.install':       'Ba thành phần, cài những gì bạn cần:',
        'p.first-scan':    'Scan dự án trong 30 giây để tìm rủi ro bảo mật của AI agent:',
        'p.gates':         'YAMTAM chặn mọi tool call của Claude qua pipeline gate nhiều lớp:',
        'p.scan':          'Kiểm toán bảo mật đầy đủ cấu hình .claude/ và các file nguồn.',
        'p.hunt':          'Scanner chủ động — đào sâu hơn vào lỗ hổng code và supply chain.',
        'p.ci':            'Kiểm tra bảo mật CI/CD — actions không ghim phiên bản, thiếu permission, lộ secret.',
        'p.watch':         'Theo dõi file trực tiếp — in ra thay đổi của skills, agents, rules khi xảy ra.',
        'p.init':          'Tự động cài YAMTAM trong bất kỳ project nào — tạo hooks, config và settings skeleton bằng một lệnh.',
        'p.skills':        'Skills là slash commands cho Claude Code. Sau khi cài yamtam-engine, 3.457 skills sẵn sàng dùng.',
        'p.agents':        '95 agents chuyên biệt được /agent-router tự động định tuyến. Các agent chính:',
        'footer.back':     '← yamtam-engine',
        'footer.built':    'Được xây bởi Vũ Văn Tâm · Việt Nam',
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
        'h2.commands':     '전체 명령어',
        'h2.skills':       '스킬 사용',
        'h2.agents':       '에이전트 팀',
        'p.install':       '세 가지 구성 요소 — 필요한 것만 설치하세요:',
        'p.first-scan':    '30초 안에 AI 에이전트 보안 위험을 스캔하세요:',
        'p.gates':         'YAMTAM은 모든 Claude 도구 호출을 다층 게이트 파이프라인으로 차단합니다:',
        'p.scan':          '.claude/ 설정 및 소스 파일의 전체 보안 감사.',
        'p.hunt':          '능동 스캐너 — 코드 취약점과 공급망을 더 깊이 탐색합니다.',
        'p.ci':            'CI/CD 워크플로우 보안 검사 — 고정되지 않은 액션, 누락된 권한, 시크릿 노출.',
        'p.watch':         '라이브 파일 모니터 — 스킬, 에이전트, 규칙 변경사항을 실시간으로 출력.',
        'p.init':          '어떤 프로젝트에든 YAMTAM 자동 설치 — 훅, 설정, 세팅 스켈레톤을 한 번에 생성.',
        'p.skills':        '스킬은 Claude Code의 슬래시 명령어입니다. yamtam-engine 설치 후 3,457개 스킬 사용 가능.',
        'p.agents':        '95개 전문 에이전트가 /agent-router로 자동 라우팅. 주요 에이전트:',
        'footer.back':     '← yamtam-engine',
        'footer.built':    'Vũ Văn Tâm 제작 · 베트남',
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
        'page.title':    'Music — YAMTAM ENGINE',
        'page.h1':       '🎵 Background Music',
        'page.sub':      'Plays across pages — position saved between visits.',
        'now.label':     'Now Playing',
        'playlist.label':'Playlist',
        'add.title':     'Add from YouTube',
        'add.ph':        'Paste YouTube link or video ID…',
        'add.hint':      'e.g. https://youtu.be/aKSJAcG4V4o or aKSJAcG4V4o',
        'add.btn':       'Add',
        'play.title':    'Play / Pause',
        'mute.title':    'Mute / Unmute',
        'playing.badge': '▶ Playing',
        'back.link':     '← Home',
      },
      vi: {
        'page.title':    'Nhạc — YAMTAM ENGINE',
        'page.h1':       '🎵 Nhạc nền',
        'page.sub':      'Phát xuyên trang — lưu vị trí giữa các lần truy cập.',
        'now.label':     'Đang phát',
        'playlist.label':'Danh sách phát',
        'add.title':     'Thêm bài từ YouTube',
        'add.ph':        'Paste link YouTube hoặc video ID…',
        'add.hint':      'VD: https://youtu.be/aKSJAcG4V4o hoặc aKSJAcG4V4o',
        'add.btn':       'Thêm',
        'play.title':    'Phát / Dừng',
        'mute.title':    'Tắt / Bật tiếng',
        'playing.badge': '▶ Đang phát',
        'back.link':     '← Về trang chủ',
      },
      ko: {
        'page.title':    '음악 — YAMTAM ENGINE',
        'page.h1':       '🎵 배경 음악',
        'page.sub':      '페이지 전환 시 재생 유지 — 위치 자동 저장.',
        'now.label':     '재생 중',
        'playlist.label':'재생 목록',
        'add.title':     'YouTube에서 추가',
        'add.ph':        'YouTube 링크 또는 영상 ID 붙여넣기…',
        'add.hint':      '예: https://youtu.be/aKSJAcG4V4o 또는 aKSJAcG4V4o',
        'add.btn':       '추가',
        'play.title':    '재생 / 일시정지',
        'mute.title':    '음소거 / 해제',
        'playing.badge': '▶ 재생 중',
        'back.link':     '← 홈으로',
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
      const set = (sel, key) => { const el = document.querySelector(sel); if (el) el.textContent = t('music', key) || el.textContent; };
      const setTitle = (sel, key) => { const el = document.querySelector(sel); if (el) el.title = t('music', key) || el.title; };
      set('h1',              'page.h1');
      set('.page-header p',  'page.sub');
      set('.now-label',      'now.label');
      set('.section-label',  'playlist.label');
      set('.add-section h2', 'add.title');
      set('.add-hint',       'add.hint');
      set('.add-btn',        'add.btn');
      set('a.back-link',     'back.link');
      setTitle('#play-btn',  'play.title');
      setTitle('#mute-btn',  'mute.title');
      const inp = document.getElementById('add-url');
      if (inp) inp.placeholder = t('music', 'add.ph') || inp.placeholder;
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
