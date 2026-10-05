(() => {
  "use strict";
  const page = location.pathname.split("/").pop() || "index.html";
  const locale = document.documentElement.lang.slice(0, 2);
  const vi = locale === "vi", ko = locale === "ko";
  /* localStorage throws when storage is blocked (private mode, site settings). An unguarded call
     aborted this whole script, leaving the footer, petals and demos unbuilt. Not persisting is fine. */
  const store={get:key=>{try{return localStorage.getItem(key)}catch(error){return null}},set:(key,value)=>{try{localStorage.setItem(key,value)}catch(error){/* storage blocked: preference just is not remembered */}}};
  const englishPages=new Set(["yana-ai","studio","wheelbot","runtime","governance","agents-skills","models","connectors","missions","continuity","design","evidence","safety","architecture","ecosystem","download","updates","support","privacy","legal-notices","acknowledgements","install-macos","install-windows","install-linux","account","history","commands","contact"]);
  const stem=page.replace(/\.html$/,"").replace(/-(en|ko)$/,"");
  const koreanPages=new Set(englishPages);
  const languageHref=vi?(page==="index.html"?"en.html":englishPages.has(stem)?`${stem}-en.html`:"en.html"):(stem==="en"||stem==="ko"?"index.html":`${stem}.html`);
  const route=name=>vi?`${name}.html`:(name==="index"?(ko?"ko.html":"en.html"):ko&&koreanPages.has(name)?`${name}-ko.html`:`${name}-en.html`);
  document.body.classList.add("sakura-site");

  if(stem==="wheelbot"&&location.hash){
    let section="";
    try{section=decodeURIComponent(location.hash.slice(1))}catch{section=""}
    const target=section&&document.getElementById(section);
    if(target)window.addEventListener("load",()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      target.scrollIntoView({block:"start",behavior:"instant"});
    })),{once:true});
  }

  const documentPages=["legal-notices","privacy","acknowledgements"];
  const technicalPages=["architecture","governance","runtime","models","connectors","evidence","continuity","missions","agents-skills"];
  document.body.classList.add(documentPages.includes(stem)?"mode-document":technicalPages.some(name=>stem===name)?"mode-technical":["index","en","ko"].includes(stem)?"petal-high":"mode-standard");

  const copy = vi ? {
    announcement:"Yana kết nối AI với công việc thật, còn quyền kiểm soát vẫn nằm trong tay anh.",
    products:"Sản phẩm",platform:"Nền tảng",solutions:"Giải pháp",resources:"Tài nguyên",about:"Về Yana",
    source:"Mã nguồn",updates:"Cập nhật",download:"Tải Studio",search:"Tìm kiếm",docs:"Docs",start:"Bắt đầu",
    productsTitle:"Các bề mặt của Yana.",platformTitle:"Những lớp vận hành bên dưới.",solutionsTitle:"Yana giúp được gì?",resourcesTitle:"Tài liệu và hỗ trợ."
  } : ko ? {
    announcement:"Yana는 AI를 실제 작업에 연결하고, 결정권은 사람에게 남깁니다.",
    products:"제품",platform:"플랫폼",solutions:"활용 방법",resources:"자료",about:"Yana 소개",
    source:"소스 코드",updates:"업데이트",download:"Studio 다운로드",search:"검색",docs:"문서",start:"시작하기",
    productsTitle:"Yana의 제품.",platformTitle:"시스템을 이루는 계층.",solutionsTitle:"Yana로 할 수 있는 일",resourcesTitle:"문서와 지원."
  } : {
    announcement:"Yana connects AI to real work while authority stays with you.",
    products:"Products",platform:"Platform",solutions:"Solutions",resources:"Resources",about:"About Yana",
    source:"Source",updates:"Updates",download:"Download Studio",search:"Search",docs:"Docs",start:"Get started",
    productsTitle:"The Yana surfaces.",platformTitle:"The layers underneath.",solutionsTitle:"What can Yana do?",resourcesTitle:"Documentation and support."
  };
  const liquidKnobButton = (extraClass,label,ariaLabel) => `<div class="liquid-stage liquid-stage--knob menu-knob" data-liquid-metal="cta"><div class="liquid-plate" aria-hidden="true"></div><button class="liquid-button liquid-button--knob ${extraClass}" type="button" aria-label="${ariaLabel}" aria-expanded="false"><span class="lbl">${label}</span></button></div>`;
  const nav = document.querySelector(".site-nav");
  if (nav) {
    const homeHref=route("index"),startHref=homeHref+"#how-it-works",docsHref=route("architecture");
    const githubHref="https://github.com/yanacuti1121/Yana-AI";
    const koreanDetails={
      "yana-ai":"AI 조정과 권한",studio:"Yana를 위한 시각적 워크스페이스",wheelbot:"물리적 로봇 프로젝트",
      "yana-runtime":"통제되는 AI 에이전트 실행",safety:"규칙과 권한",audit:"로그와 추적 기록",
      runtime:"에이전트 런타임 · TurnEngine",governance:"정책 엔진 · 권한", "agents-skills":"조합할 수 있는 기능",
      models:"클라우드와 로컬 AI 모델",connectors:"범위가 정해진 연결",infrastructure:"아키텍처와 시스템 계층",
      developers:"프로젝트, 파일, 터미널", "ai-agents":"허용된 범위에서 실행",teams:"명확한 결정과 권한",
      "infra-teams":"시스템 계층 연결", "quick-start":"Studio 설치부터 시작",documentation:"Yana AI 시스템 개요",
      architecture:"제안에서 실행까지",commands:"CLI 및 슬래시 명령 참고",examples:"작업 흐름 예시",
      updates:"생태계 출시 기록",download:"지원 플랫폼 설치 파일",support:"문의 채널",
      legal:"라이선스 정보",privacy:"데이터 처리 방식",thanks:"출처와 기여",github:"소스 코드와 프로젝트 상태"
    };
    const koreanTitles={
      "yana-runtime":"Yana 런타임",safety:"안전 엔진",audit:"감사 시스템",
      runtime:"런타임",governance:"거버넌스","agents-skills":"에이전트와 스킬",models:"모델",connectors:"연동",infrastructure:"인프라",
      developers:"개발자용","ai-agents":"AI 에이전트용",
      teams:"팀용","infra-teams":"인프라팀용","quick-start":"빠른 시작",documentation:"문서",
      architecture:"아키텍처",commands:"명령어 안내",examples:"예시",updates:"업데이트 / 변경 기록",
      download:"Studio 다운로드",support:"지원 및 문의",legal:"법적 고지",privacy:"개인정보 보호",thanks:"감사의 말"
    };
    const item=(id,path,viTitle,enTitle,viDetail,enDetail,icon,keywords="")=>({
      id,href:/^https?:/.test(path)?path:route(path),title:vi?viTitle:ko?(koreanTitles[id]||enTitle):enTitle,
      detail:vi?viDetail:ko?(koreanDetails[id]||enDetail):enDetail,icon,keywords,external:/^https?:/.test(path)
    });
    // One destination map feeds desktop groups, mobile subviews, and the command palette.
    const navigationConfig={
      products:{label:copy.products,title:copy.productsTitle,items:[
        item("yana-ai","yana-ai","Yana AI","Yana AI","Lớp điều phối và quyền hạn","Orchestration and authority","◇","orchestration control plane"),
        item("studio","studio","Yana Studio","Yana Studio","Giao diện trực quan để vận hành Yana","Visual workspace for Yana","▣","workspace desktop chat terminal"),
        item("wheelbot","wheelbot","Yana Wheelbot","Yana Wheelbot","Nhánh robot vật lý","Physical robot project","◌","robot esp32 3d print"),
        item("yana-runtime","runtime","Yana Runtime","Yana Runtime","Thực thi AI agent có kiểm soát","Controlled AI agent execution","⌘","agent runtime turnengine"),
        item("safety","safety","Safety Engine","Safety Engine","Quy tắc, chốt chặn và quyền","Rules, guards and permissions","◇","safety policy guard guards permissions"),
        item("audit","evidence","Audit System","Audit System","Bản ghi, trace và bằng chứng","Logs, traces and evidence","◎","audit receipt history evidence")
      ]},
      platform:{label:copy.platform,title:copy.platformTitle,items:[
        item("runtime","runtime","Runtime","Runtime","Agent Runtime · TurnEngine","Agent Runtime · TurnEngine","⌘","agent execution"),
        item("governance","governance","Governance","Governance","Policy Engine · quyền hạn","Policy Engine · authority","◇","policy safety guards permissions approval"),
        item("agents-skills","agents-skills","Agents & Skills","Agents & Skills","Năng lực có thể điều phối","Composable capabilities","✳","agents skills capabilities"),
        item("models","models","Models","Models","AI Providers · cloud và local","AI Providers · cloud and local","◈","providers llm model"),
        item("connectors","connectors","Integrations","Integrations","Connectors có phạm vi","Scoped connectors","⇄","integrations connectors tools"),
        item("infrastructure","architecture","Infrastructure","Infrastructure","Kiến trúc và các lớp hệ thống","Architecture and system layers","▦","architecture system")
      ]},
      solutions:{label:copy.solutions,title:copy.solutionsTitle,items:[
        item("developers","studio","Cho Developer","For developers","Project, tệp và terminal","Projects, files and terminal","⌘","developer code"),
        item("ai-agents","runtime","Cho AI Agent","For AI agents","Thực thi trong phạm vi được cấp","Execution within granted scope","◇","agent runtime"),
        item("teams","governance","Cho Team","For teams","Quyết định và quyền hạn rõ ràng","Visible decisions and permissions","◌","team collaboration approvals"),
        item("infra-teams","architecture","Cho Infrastructure","For infrastructure","Kết nối các lớp hệ thống","Connect system layers","▦","infrastructure architecture")
      ]},
      resources:{label:copy.resources,title:copy.resourcesTitle,items:[
        item("quick-start","download","Quick Start","Quick Start","Bắt đầu từ bản cài Studio","Start with the Studio installer","→","get started installation"),
        item("documentation","yana-ai","Documentation","Documentation","Tổng quan hệ thống Yana AI","Yana AI system overview","▤","docs documentation guide"),
        item("architecture","architecture","Architecture","Architecture","Luồng đề xuất tới thực thi","From proposal to execution","▦","system map design"),
        item("commands","commands","Command Reference","Command Reference","Bảng lệnh CLI và slash command","CLI and slash command reference","⌘","api reference cli commands"),
        item("examples","missions","Examples","Examples","Các luồng công việc minh họa","Illustrated workflows","◈","use cases examples missions"),
        item("updates","updates","Cập nhật / Changelog","Updates / Changelog","Lịch sử phiên bản hệ sinh thái","Ecosystem release history","◴","releases version changelog"),
        item("download","download","Tải Studio","Download Studio","Bộ cài các nền tảng được hỗ trợ","Installers for supported platforms","↓","download mac windows linux"),
        item("support","support","Hỗ trợ & Liên hệ","Support & Contact","Kênh liên hệ hiện có","Available contact channels","?","help contact"),
        item("legal","legal-notices","Thông báo pháp lý","Legal notices","Thông tin giấy phép","License information","§","legal license"),
        item("privacy","privacy","Quyền riêng tư","Privacy","Cách xử lý dữ liệu","How data is handled","◌","privacy data"),
        item("thanks","acknowledgements","Lời cảm ơn","Acknowledgements","Các nguồn và đóng góp","Sources and contributions","♡","credits thanks"),
        item("github",githubHref,"GitHub","GitHub","Mã nguồn và trạng thái dự án","Source and project status","↗","source repository")
      ]}
    };
    const groupsOrder=["products","platform","solutions","resources"];
    const navItemHTML=entry=>`<a class="global-mega-link" href="${entry.href}" data-nav-id="${entry.id}"${entry.external?' target="_blank" rel="noopener noreferrer"':''}><span class="nav-link-icon" aria-hidden="true">${entry.icon}</span><span><strong>${entry.title}${entry.external?' <span class="external-indicator" aria-hidden="true">↗</span>':''}</strong><small>${entry.detail}</small></span></a>`;
    const groupHTML=key=>{
      const data=navigationConfig[key];
      return `<details class="global-nav-group" data-nav-group="${key}"><summary aria-haspopup="true" aria-expanded="false" aria-controls="nav-panel-${key}">${data.label}</summary><div class="global-mega-panel" id="nav-panel-${key}"><div class="global-mega-intro"><small>YANA / ${data.label}</small><h3>${data.title}</h3></div><div class="global-mega-column">${data.items.map(navItemHTML).join("")}</div></div></details>`;
    };
    const searchButton='<button class="nav-search-trigger" type="button" aria-label="'+(vi?"Tìm kiếm Yana":ko?"Yana 검색":"Search Yana")+'" aria-keyshortcuts="Meta+K Control+K"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 5 5"/></svg><span>'+copy.search+'</span><kbd>⌘K</kbd></button>';
    const viHref=ko?(koreanPages.has(stem)?`${stem}.html`:"index.html"):vi?page:languageHref,enHref=ko?(koreanPages.has(stem)?`${stem}-en.html`:"en.html"):vi?languageHref:page,koHref=ko?page:koreanPages.has(stem)?`${stem}-ko.html`:"ko.html";
    const languageOptions='<a href="'+viHref+'" data-locale="vi"'+(vi?' aria-current="true"':'')+'>'+(vi?'✓ ':'')+'Tiếng Việt</a><a href="'+enHref+'" data-locale="en"'+(!vi&&!ko?' aria-current="true"':'')+'>'+(!vi&&!ko?'✓ ':'')+'English</a><a href="'+koHref+'" data-locale="ko"'+(ko?' aria-current="true"':'')+'>'+(ko?'✓ ':'')+'한국어</a>';
    const languageMenu='<details class="nav-language-menu"><summary aria-label="'+(vi?"Chọn ngôn ngữ":ko?"언어 선택":"Choose language")+'" aria-haspopup="true" aria-expanded="false">'+(vi?"VI":ko?"KO":"EN")+'</summary><div class="nav-language-panel"><small>'+(ko?'언어':'LANGUAGE')+'</small>'+languageOptions+'</div></details>';
    nav.innerHTML='<a class="brand" href="'+homeHref+'"><img class="brand-mark" src="yana-mark.svg" alt=""><span>Yana</span></a>'
      +liquidKnobButton("menu-button","☰",vi?"Mở menu":ko?"메뉴 열기":"Open menu")
      +'<div class="nav-links">'
      +groupsOrder.map(groupHTML).join("")
      +'<a class="nav-about" href="https://vutam.link/" target="_blank" rel="noopener noreferrer">'+copy.about+' <span aria-hidden="true">↗</span></a>'
      +'<div class="nav-mobile-actions"><a href="'+route("updates")+'">'+copy.updates+'</a><a href="'+route("download")+'">'+copy.download+'</a><a href="'+docsHref+'">'+copy.docs+'</a><a href="'+githubHref+'" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="'+startHref+'">'+copy.start+' →</a><details class="mobile-language-group"><summary>'+(vi?"Ngôn ngữ":ko?"언어":"Language")+' →</summary><div>'+languageOptions+'</div></details></div></div>'
      +'<div class="nav-actions">'+searchButton+'<a class="nav-docs" href="'+docsHref+'">'+copy.docs+'</a>'
      +languageMenu
      +'<a class="nav-action--updates" href="'+route("updates")+'">'+copy.updates+'</a>'
      +'<a class="nav-action--source" href="'+githubHref+'" target="_blank" rel="noopener noreferrer">'+copy.source+' ↗</a>'
      +'<a class="nav-action--download" href="'+route("download")+'">'+copy.download+'</a>'
      +'<a class="nav-start" href="'+startHref+'"><span>'+copy.start+'</span><span class="nav-start-arrow" aria-hidden="true">→</span></a></div>';
    const scrim=document.createElement("div");scrim.className="nav-scrim";document.body.append(scrim);
    const menu=nav.querySelector(".menu-button"),links=nav.querySelector(".nav-links");
    const groups=[...nav.querySelectorAll(".global-nav-group")],language=nav.querySelector(".nav-language-menu");
    const mobileMedia=matchMedia("(max-width: 1380px)"),desktopHover=matchMedia("(min-width: 1381px) and (hover: hover) and (pointer: fine)");
    let closeTimer=0,lockState=null;
    const lockBody=()=>{
      if(lockState)return;
      lockState={overflow:document.body.style.overflow,paddingRight:document.body.style.paddingRight};
      const scrollbar=Math.max(0,innerWidth-document.documentElement.clientWidth);
      if(scrollbar)document.body.style.paddingRight=scrollbar+"px";
      document.body.style.overflow="hidden";
    };
    const unlockBody=()=>{if(!lockState)return;document.body.style.overflow=lockState.overflow;document.body.style.paddingRight=lockState.paddingRight;lockState=null};
    const emit=(name,detail={})=>document.dispatchEvent(new CustomEvent("yana:navigation",{detail:{event:name,...detail}}));
    const syncState=()=>{
      const open=groups.some(g=>g.open)||language.open||links.classList.contains("open");
      scrim.classList.toggle("is-visible",open);
      document.body.classList.toggle("yana-navigation-open",open);
      links.classList.toggle("is-nested",mobileMedia.matches&&groups.some(g=>g.open));
      menu.setAttribute("aria-expanded",String(links.classList.contains("open")));
      if(mobileMedia.matches&&links.classList.contains("open"))lockBody();else unlockBody();
      groups.forEach(g=>g.querySelector("summary").setAttribute("aria-expanded",String(g.open)));
      language.querySelector("summary").setAttribute("aria-expanded",String(language.open));
    };
    const close=()=>{clearTimeout(closeTimer);groups.forEach(g=>g.open=false);language.open=false;links.classList.remove("open");syncState()};
    const openGroup=g=>{
      clearTimeout(closeTimer);
      groups.forEach(other=>{if(other!==g)other.open=false});
      language.open=false;g.open=true;syncState();emit("dropdown_open",{group:g.dataset.navGroup});
    };
    menu.addEventListener("click",()=>{links.classList.contains("open")?close():(links.classList.add("open"),syncState())});
    groups.forEach(g=>{
      const summary=g.querySelector("summary");
      summary.addEventListener("click",event=>{
        event.preventDefault();
        if(g.open){if(mobileMedia.matches){g.open=false;syncState()}}
        else openGroup(g);
      });
      summary.addEventListener("keydown",event=>{
        if(event.key==="ArrowDown"){event.preventDefault();openGroup(g);g.querySelector(".global-mega-link")?.focus()}
      });
      g.addEventListener("pointerenter",event=>{if(desktopHover.matches&&event.pointerType!=="touch")openGroup(g)});
      g.addEventListener("pointerleave",event=>{if(desktopHover.matches&&event.pointerType!=="touch")closeTimer=setTimeout(()=>{if(!g.matches(":hover")&&!(g.contains(document.activeElement)&&document.activeElement.matches(":focus-visible")))close()},150)});
    });
    language.querySelector("summary").addEventListener("click",event=>{event.preventDefault();groups.forEach(g=>g.open=false);language.open=!language.open;syncState()});
    language.addEventListener("pointerenter",()=>clearTimeout(closeTimer));
    language.addEventListener("pointerleave",()=>{if(desktopHover.matches)closeTimer=setTimeout(()=>{if(!language.matches(":hover"))close()},150)});
    const localeLinks=[...nav.querySelectorAll("[data-locale]")];
    const localePaths=new Map(localeLinks.map(a=>[a,a.getAttribute("href")]));
    const syncLocaleAnchors=()=>{
      let section="";
      try{section=decodeURIComponent(location.hash.slice(1))}catch{section=""}
      const hash=section&&document.getElementById(section)?location.hash:"";
      localeLinks.forEach(a=>a.setAttribute("href",localePaths.get(a)+hash));
    };
    syncLocaleAnchors();
    window.addEventListener("hashchange",syncLocaleAnchors);
    localeLinks.forEach(a=>a.addEventListener("click",()=>store.set("yana-locale",a.dataset.locale)));
    scrim.addEventListener("pointerdown",close);
    document.addEventListener("pointerdown",event=>{if(!nav.contains(event.target)&&!scrim.contains(event.target))close()});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&document.body.classList.contains("yana-navigation-open")){close();menu.focus()}});
    mobileMedia.addEventListener("change",()=>{close();syncState()});
    nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>emit(a.classList.contains("nav-start")?"cta_click":"nav_click",{href:a.getAttribute("href")})));

    const activeGroupByStem={"yana-ai":"products",studio:"products",wheelbot:"products",runtime:"platform",governance:"platform","agents-skills":"platform",models:"platform",connectors:"platform",safety:"products",evidence:"platform",architecture:"platform",download:"resources",updates:"resources",commands:"resources",missions:"resources",support:"resources",privacy:"resources","legal-notices":"resources",acknowledgements:"resources"};
    const hashGroup={"#prologue":"products","#capabilities":"platform","#architecture":"platform","#evidence":"platform","#use-cases":"solutions","#terminal-origin":"platform"};
    const setActive=()=>{
      const group=(stem==="index"||stem==="en"||stem==="ko")?(hashGroup[location.hash]||""):(activeGroupByStem[stem]||"");
      groups.forEach(g=>{
        const active=g.dataset.navGroup===group;
        g.classList.toggle("is-active-page",active);
        active?g.querySelector("summary").setAttribute("aria-current","location"):g.querySelector("summary").removeAttribute("aria-current");
        g.querySelectorAll(".global-mega-link").forEach(a=>{
          const current=active&&new URL(a.href,location.href).pathname===location.pathname;
          a.classList.toggle("is-current",current);
          current?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current");
        });
      });
    };
    setActive();window.addEventListener("hashchange",setActive);
    if(stem==="index"||stem==="en"||stem==="ko"){
      const watched=Object.keys(hashGroup).map(hash=>document.querySelector(hash)).filter(Boolean);
      if(watched.length){const observer=new IntersectionObserver(entries=>{
        const match=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if(match&&!location.hash){groups.forEach(g=>g.classList.toggle("is-active-page",g.dataset.navGroup===hashGroup["#"+match.target.id]))}
      },{rootMargin:"-18% 0px -55% 0px",threshold:[0,.15,.4]});watched.forEach(el=>observer.observe(el))}
    }
    const updateScroll=()=>{
      const progress=Math.min(1,Math.max(0,scrollY/80));
      nav.style.setProperty("--nav-bg-alpha",(.1+progress*.78).toFixed(3));
      nav.style.setProperty("--nav-border-alpha",(.06+progress*.15).toFixed(3));
      nav.style.setProperty("--nav-shadow-alpha",(progress*.075).toFixed(3));
      nav.style.setProperty("--nav-blur",(3+progress*19).toFixed(1)+"px");
      nav.classList.toggle("is-scrolled",progress>.25);
    };
    updateScroll();window.addEventListener("scroll",updateScroll,{passive:true});

    const searchIndex=groupsOrder.flatMap(key=>navigationConfig[key].items.map(entry=>({...entry,category:navigationConfig[key].label,categoryKey:key})));
    const palette=document.createElement("div");palette.className="yana-command-shell";palette.hidden=true;
    palette.innerHTML='<div class="yana-command-backdrop"></div><section class="yana-command-panel" role="dialog" aria-modal="true" aria-labelledby="yana-search-title"><div class="yana-command-head"><label id="yana-search-title" for="yana-search-input">'+(vi?"Tìm trong Yana":ko?"Yana에서 검색":"Search Yana")+'</label><button type="button" class="yana-command-close" aria-label="'+(vi?"Đóng tìm kiếm":ko?"검색 닫기":"Close search")+'">Esc</button></div><div class="yana-command-field"><span aria-hidden="true">⌕</span><input id="yana-search-input" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="yana-search-results" placeholder="'+(vi?"Tìm sản phẩm, tài liệu, trang…":ko?"제품, 문서, 페이지 검색…":"Search products, docs, pages…")+'"></div><div id="yana-search-results" class="yana-command-results" role="listbox"></div><p class="yana-command-help">'+(vi?"↑ ↓ chọn · ↵ mở · Esc đóng":ko?"↑ ↓ 선택 · ↵ 열기 · Esc 닫기":"↑ ↓ Navigate · ↵ Open · Esc Close")+'</p></section>';
    document.body.append(palette);
    const input=palette.querySelector("input"),results=palette.querySelector(".yana-command-results"),trigger=nav.querySelector(".nav-search-trigger"),closeButton=palette.querySelector(".yana-command-close");
    let visible=[],active=0,returnFocus=trigger;
    const normalize=value=>value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const escapeHTML=value=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    const getRecent=()=>{try{return JSON.parse(store.get("yana-nav-recent")||"[]").slice(0,4)}catch{return []}};
    const saveRecent=entry=>store.set("yana-nav-recent",JSON.stringify([entry.id,...getRecent().filter(id=>id!==entry.id)].slice(0,4)));
    const render=()=>{
      const query=normalize(input.value.trim());
      const all=searchIndex.filter(entry=>!query||normalize([entry.title,entry.detail,entry.keywords,entry.category].join(" ")).includes(query));
      const seen=new Set();visible=all.filter(entry=>{if(seen.has(entry.id))return false;seen.add(entry.id);return true});
      if(!query){const recent=getRecent().map(id=>visible.find(entry=>entry.id===id)).filter(Boolean);visible=[...recent,...visible.filter(entry=>!recent.includes(entry))]}
      active=Math.min(active,Math.max(0,visible.length-1));
      if(!visible.length){
        const suggested=[navigationConfig.resources.items[1],navigationConfig.resources.items[0],navigationConfig.resources.items.at(-1)];
        results.innerHTML='<div class="yana-command-empty"><strong>'+(vi?'Không có kết quả cho “':ko?'검색 결과가 없습니다: “':'No results for “')+escapeHTML(input.value.trim())+'”</strong><span>'+(vi?'Thử một lối vào khác:':ko?'다른 경로를 살펴보세요:':'Try another destination:')+'</span></div>'+suggested.map(entry=>'<a class="yana-command-suggestion" href="'+entry.href+'"'+(entry.external?' target="_blank" rel="noopener noreferrer"':'')+'>'+entry.title+(entry.external?' ↗':'')+'</a>').join("");
        input.removeAttribute("aria-activedescendant");return;
      }
      let lastCategory="";
      results.innerHTML=visible.map((entry,index)=>{
        const isRecent=!query&&getRecent().includes(entry.id),category=isRecent?(vi?"Gần đây":ko?"최근":"Recent"):entry.category;
        const heading=category!==lastCategory?'<div class="yana-command-category">'+category+'</div>':"";lastCategory=category;
        return heading+'<a id="yana-search-option-'+index+'" role="option" aria-selected="'+(index===active)+'" tabindex="-1" href="'+entry.href+'" data-search-id="'+entry.id+'"'+(entry.external?' target="_blank" rel="noopener noreferrer"':'')+' class="yana-command-result'+(index===active?' is-active':'')+'"><span><strong>'+entry.title+'</strong><small>'+entry.detail+'</small></span><span aria-hidden="true">'+(entry.external?'↗':'→')+'</span></a>';
      }).join("");
      input.setAttribute("aria-activedescendant","yana-search-option-"+active);
    };
    const closePalette=()=>{if(palette.hidden)return;palette.hidden=true;document.body.classList.remove("yana-search-open");unlockBody();returnFocus?.focus()};
    const openPalette=()=>{returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:trigger;close();palette.hidden=false;document.body.classList.add("yana-search-open");lockBody();input.value="";active=0;render();input.focus();emit("search_open")};
    trigger.addEventListener("click",openPalette);
    palette.querySelector(".yana-command-backdrop").addEventListener("pointerdown",closePalette);
    closeButton.addEventListener("click",closePalette);
    input.addEventListener("input",()=>{active=0;render()});
    input.addEventListener("keydown",event=>{
      if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(visible.length){active=(active+(event.key==="ArrowDown"?1:-1)+visible.length)%visible.length;render();results.querySelector(".is-active")?.scrollIntoView({block:"nearest"})}}
      else if(event.key==="Enter"&&visible.length){event.preventDefault();const entry=visible[active];saveRecent(entry);emit("search_result_click",{href:entry.href});if(entry.external)window.open(entry.href,"_blank","noopener,noreferrer");else location.href=entry.href}
    });
    results.addEventListener("click",event=>{const link=event.target.closest("[data-search-id]");if(!link)return;const entry=visible.find(row=>row.id===link.dataset.searchId);if(entry){saveRecent(entry);emit("search_result_click",{href:entry.href})}});
    document.addEventListener("keydown",event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();palette.hidden?openPalette():closePalette()}
      else if(event.key==="Escape"&&!palette.hidden){event.preventDefault();closePalette()}
      else if(event.key==="Tab"&&!palette.hidden){event.preventDefault();(document.activeElement===input?closeButton:input).focus()}
    });
  }

  if (store.get("yana-announcement-hidden") !== "1") {
    const bar=document.createElement("div");bar.className="announcement-bar";bar.innerHTML=`<span>${copy.announcement}</span><button type="button" aria-label="${vi?"Đóng":ko?"닫기":"Close"}">×</button>`;document.body.prepend(bar);const hideAnnouncement=()=>{bar.classList.add("is-hiding");setTimeout(()=>{bar.hidden=true;store.set("yana-announcement-hidden","1")},420)};bar.querySelector("button").addEventListener("click",hideAnnouncement);setTimeout(hideAnnouncement,5200);
  }

  const footer=document.querySelector(".site-footer");
  if(footer) footer.innerHTML=`<div class="footer-inner"><div><a class="brand" href="${route("index")}"><img class="brand-mark" src="yana-mark.svg" alt=""><span>Yana</span></a><p>${vi?"Trí tuệ có thể thay. Quyền hạn phải bền vững.":ko?"지능은 바뀔 수 있어도 권한은 흔들리지 않아야 합니다.":"Intelligence may change. Authority must endure."}</p></div><div class="footer-links"><strong>${copy.products}</strong><a href="${route("yana-ai")}">Yana AI</a><a href="${route("studio")}">Yana Studio</a><a href="${route("wheelbot")}">Yana Wheelbot</a></div><div class="footer-links"><strong>${vi?"Hệ thống":ko?"시스템":"System"}</strong><a href="${route("architecture")}">${vi?"Kiến trúc":ko?"아키텍처":"Architecture"}</a><a href="${route("runtime")}">${ko?"런타임":"Runtime"}</a><a href="${route("governance")}">${ko?"거버넌스":"Governance"}</a><a href="${route("connectors")}">${ko?"연동":"Connectors"}</a></div><div class="footer-links"><strong>${copy.resources}</strong><a href="${route("updates")}">${copy.updates}</a><a href="${route("support")}">${vi?"Hỗ trợ & Liên hệ":ko?"지원 및 문의":"Support & Contact"}</a><a href="https://github.com/yanacuti1121/Yana-AI/issues">GitHub Issues</a><a href="https://vutam.link/">vutam.link</a></div><div class="footer-links"><strong>${vi?"Pháp lý":ko?"법적 고지":"Legal"}</strong><a href="${route("legal-notices")}">${vi?"Thông báo pháp lý":ko?"법적 고지":"Legal Notices"}</a><a href="${route("acknowledgements")}">${vi?"Lời cảm ơn":ko?"감사의 말":"Acknowledgements"}</a><a href="${route("privacy")}">${vi?"Quyền riêng tư":ko?"개인정보 보호":"Privacy"}</a></div></div><div class="footer-bottom">© 2026 Yana · ${vi?"Các thành phần nguồn mở giữ nguyên giấy phép tương ứng.":ko?"오픈 소스 구성 요소에는 각 라이선스가 적용됩니다.":"Open-source components remain under their respective licenses."}</div>`;

  if(footer){
    const contextualFooterLinks={"support.html":route("support"),"legal-notices.html":route("legal-notices"),"privacy.html":route("privacy"),"acknowledgements.html":route("acknowledgements")};
    Object.entries(contextualFooterLinks).forEach(([current,target])=>{const anchor=footer.querySelector(`a[href="${current}"]`);if(anchor)anchor.setAttribute("href",target)});
  }

  /* Reveal sections once. No continuous render or per-scroll transforms. */
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches){
    const targets=document.querySelectorAll(".showcase-scene,.chapter,.section,.quote-band");
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add("is-revealed");observer.unobserve(entry.target)}
    }),{threshold:.08});
    targets.forEach(target=>observer.observe(target));
  }

  document.querySelectorAll("[data-execution-demo]:not([data-guided-discovery])").forEach(demo=>{
    const receipt=demo.querySelector(".decision-receipt");
    const messages=vi?{
      allow:["ALLOW","Capability được cấp. Thực thi có giới hạn và ghi receipt bằng chứng."],
      ask:["ASK","Chờ phê duyệt của con người. Chưa có thay đổi nào được thực thi."],
      deny:["DENY","Yêu cầu bị chặn tại cổng quyền hạn. Không chạm vào hệ thống đích."]
    }:ko?{
      allow:["허용","기능이 허용되었습니다. 정해진 범위에서 실행하고 증거 기록을 남깁니다."],
      ask:["승인 요청","사람의 승인을 기다리는 중입니다. 아직 변경된 내용은 없습니다."],
      deny:["거부","요청이 권한 게이트에서 차단되었습니다. 대상 시스템은 변경되지 않았습니다."]
    }:{
      allow:["ALLOW","Capability granted. Execution is bounded and an evidence receipt is written."],
      ask:["ASK","Waiting for human approval. No change has been executed."],
      deny:["DENY","The request is stopped at the authority gate. The target system is untouched."]
    };
    demo.querySelectorAll("button[data-decision]").forEach(button=>button.addEventListener("click",()=>{
      const state=button.dataset.decision;demo.dataset.state=state;
      demo.querySelectorAll("button[data-decision]").forEach(item=>{
        const selected=item===button;
        item.setAttribute("aria-pressed",String(selected));
        const stage=item.closest(".liquid-stage");
        if(stage)stage.classList.toggle("is-selected",selected);
      });
      receipt.innerHTML=`<b>${messages[state][0]}</b><span>${messages[state][1]}</span>`;
      demo.classList.remove("is-transitioning");
      void demo.offsetWidth;
      demo.classList.add("is-transitioning");
      clearTimeout(demo._transitionTimer);
      demo._transitionTimer=setTimeout(()=>demo.classList.remove("is-transitioning"),760);
    }));
  });

  const activateAuthTab=name=>{const target=document.querySelector(`[data-auth-tab="${name}"]`);if(!target)return;document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("is-active",b===target));document.querySelectorAll("[data-auth-panel]").forEach(p=>p.hidden=p.dataset.authPanel!==name)};
  document.querySelectorAll("[data-auth-tab]").forEach(btn=>btn.addEventListener("click",()=>{activateAuthTab(btn.dataset.authTab);history.replaceState(null,"",`#${btn.dataset.authTab}`)}));
  if(location.hash==="#login")activateAuthTab("login");
  const password=document.querySelector("#signup-password"),meter=document.querySelector(".password-meter span");if(password&&meter)password.addEventListener("input",()=>{let score=0;const v=password.value;if(v.length>=10)score++;if(/[A-Z]/.test(v)&&/[a-z]/.test(v))score++;if(/\d/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;meter.style.width=`${score*25}%`});
  document.querySelectorAll("[data-auth-form]").forEach(form=>form.addEventListener("submit",e=>{e.preventDefault();const message=form.querySelector(".form-message");if(!form.reportValidity())return;message.textContent=vi?"Giao diện đã sẵn sàng. Đăng ký thật sẽ được bật sau khi dịch vụ xác thực phía máy chủ được triển khai.":ko?"화면은 준비되었지만 실제 가입과 로그인은 아직 사용할 수 없습니다. 서버 인증 서비스가 배포된 후 활성화됩니다.":"The interface is ready. Real registration will be enabled after the authentication service is deployed."}));
})();
