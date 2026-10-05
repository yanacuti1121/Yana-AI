(() => {
  'use strict';
  const hero = document.querySelector('.yana-intro');
  const stage = hero?.querySelector('.yana-brand-hero');
  if (!hero || !stage) return;
  const canvas = document.createElement('canvas');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lifetime = new AbortController();
  canvas.className = 'yana-brand-hero__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', document.documentElement.lang.startsWith('vi')
    ? 'Vật thể Yana 3D. Kéo để xoay, hoặc dùng phím mũi tên.'
    : document.documentElement.lang.startsWith('ko')
      ? 'Yana 3D 조형물. 드래그하거나 방향키로 회전할 수 있습니다.'
      : 'Interactive 3D Yana sculpture. Drag to rotate, or use arrow keys.');
  stage.append(canvas);
  const shadow = document.createElement('div');
  shadow.className = 'yana-brand-hero__shadow';
  shadow.setAttribute('aria-hidden', 'true');
  stage.insertBefore(shadow, canvas);
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) { console.warn('Yana 3D: WebGL is unavailable'); canvas.remove(); shadow.remove(); return; }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aRim;
    uniform vec2 uRotation;
    uniform float uAspect;
    uniform float uFlow;
    uniform mediump float uScroll;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vRim;
    vec3 rotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
    void main(){
      float pulse=sin(min(uFlow/3.0,1.0)*3.14159)*0.008;
      vec3 sculpted=aPosition+aNormal*sin(aPosition.y*3.2+uFlow*3.0)*pulse;
      vec3 p=rotateY(rotateX(sculpted,uRotation.x),uRotation.y);
      vNormal=normalize(rotateY(rotateX(aNormal,uRotation.x),uRotation.y));
      vPosition=p;
      vRim=aRim;
      float depth=5.0+uScroll*0.55-p.z;
      float scale=2.95;
      gl_Position=vec4(p.x*scale/uAspect,p.y*scale,depth-0.2,depth);
    }`;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vRim;
    uniform mediump float uScroll;
    void main(){
      vec3 n=normalize(vNormal);
      vec3 view=normalize(vec3(-vPosition.xy,5.0+uScroll*0.55-vPosition.z));
      vec3 reflection=reflect(-view,n);
      vec3 light=normalize(vec3(-0.55+uScroll*0.35,0.8,0.95));
      float facing=max(dot(n,view),0.0);
      float fresnel=pow(1.0-facing,3.0);
      float diffuse=max(dot(n,light),0.0);
      // Analytic studio reflections: no textures, extra canvas or postprocessing.
      float softbox=pow(max(dot(reflection,normalize(vec3(-0.6,0.75,0.7))),0.0),12.0);
      float strip=pow(max(dot(reflection,normalize(vec3(0.7,0.35,0.8))),0.0),38.0);
      float specular=pow(max(dot(reflect(-light,n),view),0.0),72.0);
      float floorReflection=pow(max(-reflection.y,0.0),2.0);
      float edge=smoothstep(0.2,1.0,vRim);
      vec3 body=mix(vec3(0.64,0.81,0.93),vec3(0.83,0.92,0.98),diffuse*0.65);
      vec3 color=body-vec3(0.15,0.11,0.045)*floorReflection
        -vec3(0.20,0.13,0.05)*fresnel*(1.0-edge*0.35)
        +vec3(0.97,0.99,1.0)*(softbox*0.17+strip*0.14+specular*0.20)
        +vec3(0.12,0.17,0.19)*fresnel*edge;
      gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
    }`;
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(`Yana 3D shader: ${message}`); }
    return s;
  }
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Yana 3D program: ${gl.getProgramInfoLog(program)}`);
  } catch (error) { console.warn(error); canvas.remove(); shadow.remove(); return; }
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  const position = gl.getAttribLocation(program, 'aPosition');
  const normal = gl.getAttribLocation(program, 'aNormal');
  const rimLocation = gl.getAttribLocation(program, 'aRim');
  const rotation = gl.getUniformLocation(program, 'uRotation');
  const aspect = gl.getUniformLocation(program, 'uAspect');
  const flow = gl.getUniformLocation(program, 'uFlow');
  const scroll = gl.getUniformLocation(program, 'uScroll');
  let vertices = 0, visible = true, pending = 0, lastFrame = 0;
  let revealStart = 0, revealPlayed = false;
  let introReady = !document.querySelector('.yana-opening');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let rx = -0.10, ry = -0.22, drag = null;
  let renderedRx = rx, renderedRy = ry, renderedScroll = 0;
  let pointerRx = 0, pointerRy = 0;
  let scrollProgress = 0, meshBuffer = null;
  let immersive = false, journeyOpacity = 1, sizeDirty = true, frameInterval = 16;
  const resize = () => {
    if (!sizeDirty) return;
    sizeDirty = false;
    const density = Math.min(devicePixelRatio || 1, 1.25);
    const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
    frameInterval = cssWidth < 600 ? 32 : 16;
    const scale = Math.min(density, 800 / Math.max(cssWidth, 1), 600 / Math.max(cssHeight, 1));
    // One scale for both axes preserves the sculpture's proportions at the cap.
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  };
  const draw = now => {
    pending = 0;
    if (!vertices || !visible || document.hidden || (immersive && journeyOpacity < .015)) return;
    if (lastFrame && now - lastFrame < frameInterval) { pending = requestAnimationFrame(draw); return; }
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 1 / 60;
    lastFrame = now;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const elapsed = revealStart ? Math.min((now - revealStart) / 1000, 3) : 3;
    const ease = Math.pow(1 - Math.min(elapsed / 3, 1), 3);
    // Scroll, drag and pointer targets share a bounded, time-based damping step.
    // A short settling tail stops once the pose is reached; there is no idle loop.
    const targetRx = clamp(rx + (immersive ? Math.sin(scrollProgress * Math.PI * 4) * .16 + pointerRx : scrollProgress * .12) + ease * .12, -.50, .50);
    const targetRy = clamp(ry + (immersive ? Math.sin(scrollProgress * Math.PI * 6) * .38 + pointerRy : scrollProgress * .5) - ease * .38, -.95, .95);
    const damping = reducedMotion ? 1 : 1 - Math.exp(-delta * 14);
    renderedRx += (targetRx - renderedRx) * damping;
    renderedRy += (targetRy - renderedRy) * damping;
    renderedScroll += (scrollProgress - renderedScroll) * damping;
    const settling = Math.abs(targetRx - renderedRx) + Math.abs(targetRy - renderedRy) + Math.abs(scrollProgress - renderedScroll) > .0006;
    if (!settling) { renderedRx = targetRx; renderedRy = targetRy; renderedScroll = scrollProgress; }
    gl.uniform2f(rotation, renderedRx, renderedRy);
    gl.uniform1f(flow, elapsed);
    gl.uniform1f(scroll, renderedScroll);
    gl.uniform1f(aspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
    stage.classList.add('is-3d-ready');
    if (elapsed >= 3) revealStart = 0;
    if (settling || (revealStart && !drag)) queue();
  };
  const queue = () => {
    if (!pending && visible && !document.hidden && (!immersive || journeyOpacity >= .015)) pending = requestAnimationFrame(draw);
  };
  const meshName = matchMedia('(max-width: 900px)').matches ? 'yana-brand-mesh-mobile' : 'yana-brand-mesh';
  fetch(`assets/${meshName}.bin?v=20261003polish4`, { signal: lifetime.signal }).then(response => {
    if (!response.ok) throw new Error('Mesh unavailable');
    return response.arrayBuffer();
  }).then(data => {
    const floats = new Float32Array(data);
    if (floats.length % 7) throw new Error('Invalid mesh');
    meshBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, floats, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(rimLocation);
    gl.vertexAttribPointer(rimLocation, 1, gl.FLOAT, false, 28, 24);
    vertices = floats.length / 7;
    if (visible && introReady && !reducedMotion) { revealStart = performance.now(); revealPlayed = true; }
    queue();
  }).catch(error => { if (!lifetime.signal.aborted) { console.warn('Yana 3D mesh:', error); canvas.remove(); shadow.remove(); } });

  const intersectionObserver = new IntersectionObserver(entries => {
    visible = Boolean(entries[0]?.isIntersecting);
    if (visible && vertices && introReady && !revealPlayed && !reducedMotion) { revealStart = performance.now(); revealPlayed = true; }
    if (visible) queue();
  }, { threshold: 0 });
  intersectionObserver.observe(hero);
  const invalidateSize = () => { sizeDirty = true; queue(); };
  const resizeObserver = new ResizeObserver(invalidateSize);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', invalidateSize, { passive: true, signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pending) cancelAnimationFrame(pending); pending = 0; lastFrame = 0; }
    else queue();
  }, { signal: lifetime.signal });
  window.addEventListener('yana:brand-scroll', event => {
    const next = Math.max(0, Math.min(1, Number(event.detail?.progress) || 0));
    if (reducedMotion || next === scrollProgress) return;
    scrollProgress = next;
    queue();
  }, { signal: lifetime.signal });
  window.addEventListener('yana:brand-journey', event => {
    const detail = event.detail || {};
    const enabled = Boolean(detail.enabled);
    if (enabled !== immersive) {
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      drag = null;
      hero.classList.remove('is-dragging-brand');
      immersive = enabled;
      if (immersive) {
        document.body.append(canvas);
        document.body.classList.add('yana-immersive-3d');
      } else {
        stage.append(canvas);
        document.body.classList.remove('yana-immersive-3d');
        canvas.classList.remove('is-hero-interactive');
        canvas.tabIndex = 0;
        canvas.removeAttribute('aria-hidden');
        pointerRx = 0;
        pointerRy = 0;
      }
      intersectionObserver.disconnect();
      intersectionObserver.observe(immersive ? document.querySelector('main') : hero);
      sizeDirty = true;
      resize();
    }
    if (!immersive) { journeyOpacity = 1; scrollProgress = 0; queue(); return; }
    const next = Math.max(0, Math.min(1, Number(detail.progress) || 0));
    journeyOpacity = Math.max(0, Math.min(1, Number(detail.opacity) || 0));
    scrollProgress = next;
    canvas.style.setProperty('--brand-journey-x', `${Number(detail.x) || 0}px`);
    canvas.style.setProperty('--brand-journey-y', `${Number(detail.y) || 0}px`);
    canvas.style.setProperty('--brand-journey-scale', String(Number(detail.scale) || 1));
    canvas.style.setProperty('--brand-journey-opacity', String(journeyOpacity));
    const interactive = Boolean(detail.hero) && journeyOpacity > .5;
    canvas.classList.toggle('is-hero-interactive', interactive);
    canvas.tabIndex = interactive ? 0 : -1;
    canvas.setAttribute('aria-hidden', String(!interactive));
    queue();
  }, { signal: lifetime.signal });
  document.addEventListener('pointermove', event => {
    if (!immersive || drag || event.pointerType !== 'mouse' || journeyOpacity < .015) return;
    const nextRy = (event.clientX / innerWidth - .5) * .28;
    const nextRx = (event.clientY / innerHeight - .5) * -.2;
    if (Math.abs(nextRy - pointerRy) < .008 && Math.abs(nextRx - pointerRx) < .008) return;
    pointerRy = nextRy;
    pointerRx = nextRx;
    queue();
  }, { passive: true, signal: lifetime.signal });
  document.addEventListener('yana:opening-complete', () => {
    introReady = true;
    if (visible && vertices && !revealPlayed && !reducedMotion) {
      revealStart = performance.now();
      revealPlayed = true;
      queue();
    }
  }, { signal: lifetime.signal });
  canvas.addEventListener('pointerdown', event => {
    if (document.body.classList.contains('yana-navigation-open') || document.body.classList.contains('yana-search-open')) return;
    if (!vertices) return;
    const box = canvas.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rx, ry };
    revealStart = 0;
    canvas.setPointerCapture(event.pointerId);
    hero.classList.add('is-dragging-brand');
    event.preventDefault();
  }, { signal: lifetime.signal });
  canvas.addEventListener('pointermove', event => {
    if (document.body.classList.contains('yana-navigation-open') || document.body.classList.contains('yana-search-open')) {
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      drag = null;
      hero.classList.remove('is-dragging-brand');
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    ry = clamp(drag.ry + (event.clientX - drag.x) * 0.004, -.8, .8);
    rx = clamp(drag.rx + (event.clientY - drag.y) * 0.003, -.42, .42);
    queue();
  }, { signal: lifetime.signal });
  const endDrag = () => { drag = null; hero.classList.remove('is-dragging-brand'); };
  canvas.addEventListener('pointerup', endDrag, { signal: lifetime.signal });
  canvas.addEventListener('pointercancel', endDrag, { signal: lifetime.signal });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') ry -= .12;
    if (event.key === 'ArrowRight') ry += .12;
    if (event.key === 'ArrowUp') rx -= .12;
    if (event.key === 'ArrowDown') rx += .12;
    rx = clamp(rx, -.42, .42);
    ry = clamp(ry, -.8, .8);
    revealStart = 0;
    queue();
  }, { signal: lifetime.signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stage.classList.remove('is-3d-ready');
  }, { signal: lifetime.signal });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    lifetime.abort();
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    if (pending) cancelAnimationFrame(pending);
    if (meshBuffer) gl.deleteBuffer(meshBuffer);
    gl.deleteProgram(program);
  });
})();
