(() => {
  "use strict";
  const page = location.pathname.split("/").pop() || "index.html";
  const vi = document.documentElement.lang.slice(0, 2) === "vi";
  /* localStorage throws when storage is blocked (private mode, site settings). An unguarded call
     aborted this whole script, leaving the footer, petals and demos unbuilt. Not persisting is fine. */
  const store={get:key=>{try{return localStorage.getItem(key)}catch(error){return null}},set:(key,value)=>{try{localStorage.setItem(key,value)}catch(error){/* storage blocked: preference just is not remembered */}}};
  const englishPages=new Set(["yana-ai","studio","wheelbot","runtime","governance","agents-skills","models","connectors","missions","continuity","design","evidence","safety","architecture","ecosystem","download","support","privacy","legal-notices","acknowledgements"]);
  const stem=page.replace(/\.html$/,"").replace(/-en$/,"");
  const languageHref=vi?(page==="index.html"?"en.html":englishPages.has(stem)?`${stem}-en.html`:"en.html"):(stem==="en"?"index.html":`${stem}.html`);
  const route=name=>vi?`${name}.html`:(name==="index"?"en.html":`${name}-en.html`);
  document.body.classList.add("sakura-site");

  /* Apple Liquid Glass refraction filter — SVG feDisplacementMap masked by a
     radial gradient so the centre reads clean and distortion concentrates at
     the rim/corners, matching iOS/macOS Liquid Glass (not a uniform frosted
     blur). Injected once, referenced by .apple-glass via backdrop-filter:url(). */
  if(!document.getElementById("apple-glass-defs")){
    const svgNS="http://www.w3.org/2000/svg";
    const defs=document.createElementNS(svgNS,"svg");
    defs.id="apple-glass-defs";
    defs.setAttribute("width","0");defs.setAttribute("height","0");
    defs.style.position="absolute";
    defs.innerHTML=`<filter id="apple-glass-refract" x="-20%" y="-20%" width="140%" height="140%">`+
      `<feTurbulence type="fractalNoise" baseFrequency="0.015 0.02" numOctaves="2" seed="11" result="noise"/>`+
      `<feImage href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cdefs%3E%3CradialGradient id='g' cx='50%25' cy='50%25' r='60%25'%3E%3Cstop offset='55%25' stop-color='black'/%3E%3Cstop offset='100%25' stop-color='white'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3C/svg%3E" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" result="edgeMask"/>`+
      `<feComposite in="noise" in2="edgeMask" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="maskedNoise"/>`+
      `<feGaussianBlur in="maskedNoise" stdDeviation="1.5" result="softMasked"/>`+
      `<feDisplacementMap in="SourceGraphic" in2="softMasked" scale="55" xChannelSelector="R" yChannelSelector="G"/>`+
    `</filter>`;
    document.body.prepend(defs);
  }
  const documentPages=["legal-notices","privacy","acknowledgements"];
  const technicalPages=["architecture","governance","runtime","models","connectors","evidence","continuity","missions","agents-skills"];
  document.body.classList.add(documentPages.includes(stem)?"mode-document":technicalPages.some(name=>stem===name)?"mode-technical":stem==="index"||stem==="en"?"petal-high":"mode-standard");

  const copy = vi ? {
    announcement:"Yana kết nối AI với công việc thật, còn quyền kiểm soát vẫn nằm trong tay anh.",
    products:"Sản phẩm",platform:"Nền tảng",resources:"Tài nguyên",about:"Về Yana",
    source:"Mã nguồn",download:"Tải Yana Studio",
    productsTitle:"Ba sản phẩm được công bố.",platformTitle:"Những lớp vận hành bên dưới.",resourcesTitle:"Tài liệu và hỗ trợ chính thức."
  } : {
    announcement:"Yana connects AI to real work while authority stays with you.",
    products:"Products",platform:"Platform",resources:"Resources",about:"About Yana",
    source:"Source",download:"Download Studio",
    productsTitle:"Three published products.",platformTitle:"The layers underneath.",resourcesTitle:"Official documentation and support."
  };
  const link = (href,title,detail,current=false) => `<a class="global-mega-link${current?" is-current":""}" href="${href}"><strong>${title}</strong><small>${detail}</small></a>`;
  const group = (label,title,columns) => `<details class="global-nav-group"><summary>${label}</summary><div class="global-mega-panel"><div class="global-mega-intro"><small>YANA</small><h3>${title}</h3></div>${columns.map(c=>`<div class="global-mega-column">${c}</div>`).join("")}</div></details>`;
  const nav = document.querySelector(".site-nav");
  if (nav) {
    const products = [
      link(route("yana-ai"),"Yana AI",vi?"Hệ thống điều phối và kiểm soát AI":"The governed AI system",page.includes("yana-ai")),
      link(route("studio"),"Yana Studio",vi?"Workspace desktop trực quan":"Visual desktop workspace",page.includes("studio")||page.includes("download")),
      link(route("wheelbot"),"Yana Wheelbot",vi?"Nhánh AI vật lý":"The physical AI branch",page.includes("wheelbot"))
    ].join("");
    const platform = [
      link(route("runtime"),"Runtime",vi?"TurnEngine và thực thi":"TurnEngine and execution"),
      link(route("governance"),"Governance",vi?"Quyền hạn và phê duyệt":"Authority and approvals"),
      link(route("agents-skills"),"Agents & Skills",vi?"Năng lực có thể điều phối":"Orchestrated capabilities"),
      link(route("models"),"Models",vi?"Cloud và local":"Cloud and local"),
      link(route("connectors"),"Integrations",vi?"Kết nối có quyền riêng":"Scoped connections")
    ];
    const resources = [
      link(route("support"),vi?"Hỗ trợ & Liên hệ":"Support & Contact",vi?"Hướng dẫn và các kênh chính thức":"Guidance and official channels"),
      link(route("legal-notices"),vi?"Thông báo pháp lý":"Legal Notices",vi?"Phạm vi và giới hạn":"Scope and limitations"),
      link(route("privacy"),vi?"Quyền riêng tư":"Privacy",vi?"Dữ liệu website sử dụng":"Website data use"),
      link(route("acknowledgements"),vi?"Lời cảm ơn":"Acknowledgements",vi?"Ghi nhận nguồn mở":"Open-source credits"),
      link("https://github.com/yanacuti1121/Yana-AI","GitHub",vi?"Mã nguồn Yana AI":"Yana AI source")
    ];
    const studioPage = page.includes("studio") || page.includes("download");
    nav.innerHTML = `<a class="brand" href="${route("index")}"><img class="brand-mark" src="yana-mark.svg" alt=""><span>Yana</span></a><button class="menu-button knob" type="button" aria-label="Menu" aria-expanded="false">☰</button><div class="nav-links">${group(copy.products,copy.productsTitle,[products])}${group(copy.platform,copy.platformTitle,[platform.slice(0,3).join(""),platform.slice(3).join("")])}${group(copy.resources,copy.resourcesTitle,[resources.slice(0,3).join(""),resources.slice(3).join("")])}<a href="https://vutam.link/">${copy.about}</a></div><div class="nav-actions"><a class="language-link knob" href="${languageHref}" aria-label="${vi?"View in English":"Xem bằng tiếng Việt"}">${vi?"EN":"VI"}</a><a class="nav-cta" href="https://github.com/yanacuti1121/Yana-AI">${copy.source}</a>${studioPage?`<a class="nav-cta studio-download-cta" href="${route("download")}">${copy.download}</a>`:""}</div>`;
    const scrim = document.createElement("div"); scrim.className="nav-scrim"; document.body.append(scrim);
    const menu = nav.querySelector(".menu-button"), links = nav.querySelector(".nav-links"), groups=[...nav.querySelectorAll("details")];
    const close = () => { groups.forEach(g=>g.open=false); links.classList.remove("open"); menu.setAttribute("aria-expanded","false"); scrim.classList.remove("is-visible"); };
    menu.addEventListener("click",()=>{const open=links.classList.toggle("open");menu.setAttribute("aria-expanded",String(open));scrim.classList.toggle("is-visible",open)});
    groups.forEach(g=>{let closeTimer;g.addEventListener("toggle",()=>{if(g.open){groups.forEach(o=>{if(o!==g)o.open=false});scrim.classList.add("is-visible")}else if(!groups.some(o=>o.open)&&!links.classList.contains("open"))scrim.classList.remove("is-visible")});g.addEventListener("pointerenter",()=>{if(matchMedia("(min-width: 641px)").matches){clearTimeout(closeTimer);g.open=true}});g.addEventListener("pointerleave",()=>{if(matchMedia("(min-width: 641px)").matches)closeTimer=setTimeout(()=>{g.open=false},140)})});
    scrim.addEventListener("click",close); document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
  }

  if (store.get("yana-announcement-hidden") !== "1") {
    const bar=document.createElement("div");bar.className="announcement-bar";bar.innerHTML=`<span>${copy.announcement}</span><button type="button" aria-label="${vi?"Đóng":"Close"}">×</button>`;document.body.prepend(bar);const hideAnnouncement=()=>{bar.classList.add("is-hiding");setTimeout(()=>{bar.hidden=true;store.set("yana-announcement-hidden","1")},420)};bar.querySelector("button").addEventListener("click",hideAnnouncement);setTimeout(hideAnnouncement,5200);
  }

  const footer=document.querySelector(".site-footer");
  if(footer) footer.innerHTML=`<div class="footer-inner"><div><a class="brand" href="${route("index")}"><img class="brand-mark" src="yana-mark.svg" alt=""><span>Yana</span></a><p>${vi?"Trí tuệ có thể thay. Quyền hạn phải bền vững.":"Intelligence may change. Authority must endure."}</p></div><div class="footer-links"><strong>${copy.products}</strong><a href="${route("yana-ai")}">Yana AI</a><a href="${route("studio")}">Yana Studio</a><a href="${route("wheelbot")}">Yana Wheelbot</a></div><div class="footer-links"><strong>${vi?"Hệ thống":"System"}</strong><a href="${route("architecture")}">${vi?"Kiến trúc":"Architecture"}</a><a href="${route("runtime")}">Runtime</a><a href="${route("governance")}">Governance</a><a href="${route("connectors")}">Connectors</a></div><div class="footer-links"><strong>${vi?"Tài nguyên":"Resources"}</strong><a href="${route("support")}">${vi?"Hỗ trợ & Liên hệ":"Support & Contact"}</a><a href="https://github.com/yanacuti1121/Yana-AI/issues">GitHub Issues</a><a href="https://vutam.link/">vutam.link</a></div><div class="footer-links"><strong>${vi?"Pháp lý":"Legal"}</strong><a href="${route("legal-notices")}">${vi?"Thông báo pháp lý":"Legal Notices"}</a><a href="${route("acknowledgements")}">${vi?"Lời cảm ơn":"Acknowledgements"}</a><a href="${route("privacy")}">${vi?"Quyền riêng tư":"Privacy"}</a></div></div><div class="footer-bottom">© 2026 Yana · ${vi?"Các thành phần nguồn mở giữ nguyên giấy phép tương ứng.":"Open-source components remain under their respective licenses."}</div>`;

  if(footer){
    const contextualFooterLinks={"support.html":route("support"),"legal-notices.html":route("legal-notices"),"privacy.html":route("privacy"),"acknowledgements.html":route("acknowledgements")};
    Object.entries(contextualFooterLinks).forEach(([current,target])=>{const anchor=footer.querySelector(`a[href="${current}"]`);if(anchor)anchor.setAttribute("href",target)});
  }

  let sylvaVisible=false;
  const sylvaFrame=document.querySelector("[data-sylva-intro] iframe");
  if(sylvaFrame){
    const sylvaSource=sylvaFrame.getAttribute("src");
    let suspendSylvaTimer=0;
    new IntersectionObserver(entries=>entries.forEach(entry=>{
      clearTimeout(suspendSylvaTimer);
      sylvaVisible=entry.isIntersecting;
      document.body.classList.toggle("sylva-active",sylvaVisible);
      if(entry.isIntersecting){
        if(sylvaFrame.getAttribute("src")==="about:blank")sylvaFrame.setAttribute("src",sylvaSource);
        return;
      }
      suspendSylvaTimer=setTimeout(()=>{
        if(!entry.target.getBoundingClientRect().bottom || entry.target.getBoundingClientRect().bottom<0)sylvaFrame.setAttribute("src","about:blank");
      },700);
    }),{rootMargin:"65% 0px 65% 0px"}).observe(sylvaFrame.parentElement);
  }

  const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!reduced){
    document.querySelectorAll(".depth-card,.hero-stage,.feature-visual").forEach(card=>{
      card.classList.add("depth-card");
      /* pointermove fires far faster than frames and each event forced a layout read; apply once per frame */
      let tiltFrame=0,tiltX=0,tiltY=0;
      const applyTilt=()=>{tiltFrame=0;const box=card.getBoundingClientRect();card.style.setProperty("--tilt-x",`${((tiltX-box.left)/box.width-.5)*7}deg`);card.style.setProperty("--tilt-y",`${((tiltY-box.top)/box.height-.5)*-6}deg`)};
      card.addEventListener("pointermove",event=>{tiltX=event.clientX;tiltY=event.clientY;if(!tiltFrame)tiltFrame=requestAnimationFrame(applyTilt)},{passive:true});
      card.addEventListener("pointerleave",()=>{cancelAnimationFrame(tiltFrame);tiltFrame=0;card.style.setProperty("--tilt-x","0deg");card.style.setProperty("--tilt-y","0deg")});
    });
    const scene=document.querySelector(".sakura-scene");
    if(scene){let sceneFrame=0,sceneX=0,sceneY=0;const applyScene=()=>{sceneFrame=0;scene.style.setProperty("--scene-x",`${(sceneX/innerWidth-.5)*8}deg`);scene.style.setProperty("--scene-y",`${(sceneY/innerHeight-.5)*-6}deg`)};addEventListener("pointermove",event=>{sceneX=event.clientX;sceneY=event.clientY;if(!sceneFrame)sceneFrame=requestAnimationFrame(applyScene)},{passive:true})}
    const revealTargets=[...document.querySelectorAll(".section,.chapter,.quote-band")];
    const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-revealed");revealObserver.unobserve(entry.target)}}),{threshold:.08});
    revealTargets.forEach((target,index)=>{target.classList.add("reveal-section");target.style.setProperty("--reveal-delay",`${Math.min(index*45,180)}ms`);revealObserver.observe(target)});
    const spatialSections=[...document.querySelectorAll("main > .section,main > .chapter,main > .quote-band")];
    spatialSections.forEach(section=>section.classList.add("scroll-spatial"));
    const prologue=document.querySelector(".ecosystem-prologue");
    let spatialFrame=0;
    const updateSpatialScroll=()=>{
      spatialFrame=0;
      /* PERF: per-section 3D transforms (--scroll-y, --scroll-z, --scroll-rotate, --scroll-scale)
         are disabled: they forced getBoundingClientRect + style.setProperty on every section every
         scroll frame, triggering transition: transform .16s — heavy layout thrash for a subtle
         parallax that most users never notice. The prologue orbit progress is still updated. */
      if(prologue){
        const prologueRect=prologue.getBoundingClientRect();
        const travel=Math.max(1,prologueRect.height-innerHeight);
        const progress=Math.max(0,Math.min(1,-prologueRect.top/travel));
        prologue.style.setProperty("--prologue-progress",progress.toFixed(4));
      }
    };
    const queueSpatialScroll=()=>{if(!spatialFrame)spatialFrame=requestAnimationFrame(updateSpatialScroll)};
    addEventListener("scroll",queueSpatialScroll,{passive:true});addEventListener("resize",queueSpatialScroll);updateSpatialScroll();
    /* Petals are intentionally disabled site-wide: motion is reserved for
       meaningful controls instead of running a decorative canvas forever. */
    const enablePetals=false;
    if(enablePetals&&!document.body.classList.contains("home-page")){
    const canvas=document.createElement("canvas");canvas.id="sakura-canvas";document.body.prepend(canvas);const ctx=canvas.getContext("2d",{alpha:true});let w=0,h=0,dpr=1,pointer=0;
    const resize=()=>{dpr=Math.min(devicePixelRatio||1,innerWidth<700?1:1.5);w=innerWidth;h=innerHeight;canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)};resize();addEventListener("resize",resize,{passive:true});addEventListener("pointermove",e=>pointer=(e.clientX/w-.5),{passive:true});
    canvas.setAttribute("aria-hidden","true");const base=document.body.classList.contains("mode-document")?2:document.body.classList.contains("mode-technical")?8:document.body.classList.contains("petal-high")?24:16;const count=innerWidth<700?Math.ceil(base*.5):base;const petals=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,s:4+Math.random()*8,v:.35+Math.random()*.75,r:Math.random()*6.28,rv:(Math.random()-.5)*.025,z:.35+Math.random()*.9}));
    const petal=p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.scale(p.z,p.z);ctx.beginPath();ctx.moveTo(0,-p.s);ctx.bezierCurveTo(p.s*.9,-p.s*.4,p.s*.75,p.s*.75,0,p.s);ctx.bezierCurveTo(-p.s*.75,p.s*.75,-p.s*.9,-p.s*.4,0,-p.s);ctx.fillStyle=`rgba(244,184,204,${.28+p.z*.35})`;ctx.fill();ctx.restore()};
    const frameMs=innerWidth<700||navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4?1000/24:1000/30;let last=performance.now();const draw=now=>{requestAnimationFrame(draw);if(document.hidden||sylvaVisible||now-last<frameMs){last=now;return}const dt=Math.min((now-last)/16.67,2);last=now;ctx.clearRect(0,0,w,h);petals.forEach(p=>{p.y+=p.v*p.z*dt;p.x+=(Math.sin(p.y*.012)+pointer*1.8)*p.z*dt;p.r+=p.rv*dt;if(p.y>h+20){p.y=-20;p.x=Math.random()*w}if(p.x>w+30)p.x=-20;if(p.x<-30)p.x=w+20;petal(p)})};requestAnimationFrame(draw);
    }
  }

  document.querySelectorAll("[data-execution-demo]").forEach(demo=>{
    const receipt=demo.querySelector(".decision-receipt");
    const messages=vi?{
      allow:["ALLOW","Capability được cấp. Thực thi có giới hạn và ghi receipt bằng chứng."],
      ask:["ASK","Chờ phê duyệt của con người. Chưa có thay đổi nào được thực thi."],
      deny:["DENY","Yêu cầu bị chặn tại cổng quyền hạn. Không chạm vào hệ thống đích."]
    }:{
      allow:["ALLOW","Capability granted. Execution is bounded and an evidence receipt is written."],
      ask:["ASK","Waiting for human approval. No change has been executed."],
      deny:["DENY","The request is stopped at the authority gate. The target system is untouched."]
    };
    demo.querySelectorAll("[data-decision]").forEach(button=>button.addEventListener("click",()=>{
      const state=button.dataset.decision;demo.dataset.state=state;
      demo.querySelectorAll("[data-decision]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
      receipt.innerHTML=`<b>${messages[state][0]}</b><span>${messages[state][1]}</span>`;
    }));
  });

  const activateAuthTab=name=>{const target=document.querySelector(`[data-auth-tab="${name}"]`);if(!target)return;document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("is-active",b===target));document.querySelectorAll("[data-auth-panel]").forEach(p=>p.hidden=p.dataset.authPanel!==name)};
  document.querySelectorAll("[data-auth-tab]").forEach(btn=>btn.addEventListener("click",()=>{activateAuthTab(btn.dataset.authTab);history.replaceState(null,"",`#${btn.dataset.authTab}`)}));
  if(location.hash==="#login")activateAuthTab("login");
  const password=document.querySelector("#signup-password"),meter=document.querySelector(".password-meter span");if(password&&meter)password.addEventListener("input",()=>{let score=0;const v=password.value;if(v.length>=10)score++;if(/[A-Z]/.test(v)&&/[a-z]/.test(v))score++;if(/\d/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;meter.style.width=`${score*25}%`});
  document.querySelectorAll("[data-auth-form]").forEach(form=>form.addEventListener("submit",e=>{e.preventDefault();const message=form.querySelector(".form-message");if(!form.reportValidity())return;message.textContent=vi?"Giao diện đã sẵn sàng. Đăng ký thật sẽ được bật sau khi dịch vụ xác thực phía máy chủ được triển khai.":"The interface is ready. Real registration will be enabled after the authentication service is deployed."}));
})();
