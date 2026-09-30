(() => {
  'use strict';
  const hero = document.querySelector('.yana-intro');
  const stage = hero?.querySelector('.yana-brand-hero');
  if (!hero || !stage) return;
  const canvas = document.createElement('canvas');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.className = 'yana-brand-hero__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', document.documentElement.lang.startsWith('vi')
    ? 'Vật thể Yana 3D. Kéo để xoay, hoặc dùng phím mũi tên.'
    : 'Interactive 3D Yana sculpture. Drag to rotate, or use arrow keys.');
  stage.append(canvas);
  const shadow = document.createElement('div');
  shadow.className = 'yana-brand-hero__shadow';
  shadow.setAttribute('aria-hidden', 'true');
  stage.insertBefore(shadow, canvas);
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) { canvas.remove(); shadow.remove(); return; }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aRim;
    uniform vec2 uRotation;
    uniform float uAspect;
    uniform float uFlow;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vRim;
    vec3 rotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
    void main(){
      float pulse=sin(min(uFlow/3.0,1.0)*3.14159)*0.025;
      vec3 sculpted=aPosition+aNormal*sin(aPosition.y*3.2+uFlow*3.0)*pulse;
      vec3 p=rotateY(rotateX(sculpted,uRotation.x),uRotation.y);
      vNormal=normalize(rotateY(rotateX(aNormal,uRotation.x),uRotation.y));
      vPosition=p;
      vRim=aRim;
      float depth=5.0-p.z;
      float scale=2.95;
      gl_Position=vec4(p.x*scale/uAspect,p.y*scale,depth-0.2,depth);
    }`;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vRim;
    void main(){
      vec3 n=normalize(vNormal);
      vec3 view=normalize(vec3(0.0,0.0,1.0));
      vec3 light=normalize(vec3(-0.45,0.78,0.72));
      vec3 fill=normalize(vec3(0.84,-0.28,0.45));
      float diffuse=max(dot(n,light),0.0)*0.16+max(dot(n,fill),0.0)*0.08;
      float fresnel=pow(1.0-max(dot(n,view),0.0),2.0);
      float specular=pow(max(dot(reflect(-light,n),view),0.0),38.0)*0.12;
      float rim=pow(max(dot(n,normalize(vec3(0.7,0.25,0.66))),0.0),13.0)*0.08;
      float edge=smoothstep(0.25,0.98,vRim);
      vec3 base=mix(vec3(0.45,0.66,0.84),vec3(0.80,0.89,0.96),edge);
      float innerLine=pow(max(sin(vPosition.y*3.8+vPosition.x*2.1+n.x*3.0),0.0),12.0)*0.025;
      vec3 color=base*(0.82+diffuse)+vec3(0.98,0.99,1.0)*(fresnel*0.07+specular+rim+innerLine);
      gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
    }`;
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('Yana 3D shader'); }
    return s;
  }
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Yana 3D program');
  } catch (_) { canvas.remove(); shadow.remove(); return; }
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  const position = gl.getAttribLocation(program, 'aPosition');
  const normal = gl.getAttribLocation(program, 'aNormal');
  const rimLocation = gl.getAttribLocation(program, 'aRim');
  const rotation = gl.getUniformLocation(program, 'uRotation');
  const aspect = gl.getUniformLocation(program, 'uAspect');
  const flow = gl.getUniformLocation(program, 'uFlow');
  let vertices = 0, visible = true, pending = 0, lastFrame = 0;
  let revealStart = 0, revealPlayed = false, revealTimer = 0;
  let introReady = !document.querySelector('.yana-opening');
  let rx = -0.12, ry = -0.27, drag = null;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const density = Math.min(devicePixelRatio || 1, 1.25);
    const width = Math.max(1, Math.min(800, Math.round(box.width * density)));
    const height = Math.max(1, Math.min(600, Math.round(box.height * density)));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  };
  const draw = now => {
    pending = 0;
    if (!vertices || !visible || document.hidden) return;
    if (drag && now - lastFrame < 40) { pending = requestAnimationFrame(draw); return; }
    lastFrame = now;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const elapsed = revealStart ? Math.min((now - revealStart) / 1000, 3) : 3;
    const ease = Math.pow(1 - Math.min(elapsed / 3, 1), 3);
    gl.uniform2f(rotation, rx + ease * .22, ry - ease * .78);
    gl.uniform1f(flow, elapsed);
    gl.uniform1f(aspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
    stage.classList.add('is-3d-ready');
    if (revealStart && elapsed < 3 && !drag) {
      clearTimeout(revealTimer);
      revealTimer = setTimeout(queue, 40);
    } else if (elapsed >= 3) revealStart = 0;
  };
  const queue = () => { if (!pending && visible && !document.hidden) pending = requestAnimationFrame(draw); };
  fetch('assets/yana-brand-mesh.bin?v=9').then(response => {
    if (!response.ok) throw new Error('Mesh unavailable');
    return response.arrayBuffer();
  }).then(data => {
    const floats = new Float32Array(data);
    if (floats.length % 7) throw new Error('Invalid mesh');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
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
  }).catch(() => { canvas.remove(); shadow.remove(); });

  new IntersectionObserver(entries => {
    visible = Boolean(entries[0]?.isIntersecting);
    if (visible && vertices && introReady && !revealPlayed && !reducedMotion) { revealStart = performance.now(); revealPlayed = true; }
    if (visible) queue();
  }, { threshold: 0 }).observe(hero);
  new ResizeObserver(queue).observe(stage);
  document.addEventListener('visibilitychange', queue);
  document.addEventListener('yana:opening-complete', () => {
    introReady = true;
    if (visible && vertices && !revealPlayed && !reducedMotion) {
      revealStart = performance.now();
      revealPlayed = true;
      queue();
    }
  });
  hero.addEventListener('pointerdown', event => {
    if (document.body.classList.contains('yana-navigation-open') || document.body.classList.contains('yana-search-open')) return;
    if (!vertices || event.target.closest('a,button')) return;
    const box = canvas.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rx, ry };
    revealStart = 0;
    clearTimeout(revealTimer);
    hero.setPointerCapture(event.pointerId);
    hero.classList.add('is-dragging-brand');
    event.preventDefault();
  });
  hero.addEventListener('pointermove', event => {
    if (document.body.classList.contains('yana-navigation-open') || document.body.classList.contains('yana-search-open')) {
      if (drag && hero.hasPointerCapture(drag.id)) hero.releasePointerCapture(drag.id);
      drag = null;
      hero.classList.remove('is-dragging-brand');
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    ry = Math.max(-1.15, Math.min(1.15, drag.ry + (event.clientX - drag.x) * 0.006));
    rx = Math.max(-0.75, Math.min(0.75, drag.rx + (event.clientY - drag.y) * 0.005));
    queue();
  });
  const endDrag = () => { drag = null; hero.classList.remove('is-dragging-brand'); };
  hero.addEventListener('pointerup', endDrag);
  hero.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') ry -= .12;
    if (event.key === 'ArrowRight') ry += .12;
    if (event.key === 'ArrowUp') rx -= .12;
    if (event.key === 'ArrowDown') rx += .12;
    queue();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stage.classList.remove('is-3d-ready');
  });
})();
