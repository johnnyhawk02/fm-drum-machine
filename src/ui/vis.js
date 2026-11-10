// fm/dm — visualiser: click the logo for a full-screen feedback-shader picture. It is Johnny's Slow Signal video
// synth (same scene, feedback and signal shaders, same visual controls), but its patch matrix takes the six
// drums as sources in place of the LFOs and the audio input: each drum's envelope, from its level meter.
// Randomise always leaves the mirror on (two segments or more). Esc or ✕ closes; Enter randomises.

const VIS_SRC = SHORT; // dr1 dr2 dr3 sn cy hh
const VIS_N = VIS_SRC.length;
const VIS_PARAMS = [
  { g: 'colour' },
  { k: 'hue', n: 'hue', min: 0, max: 1, d: 0.58, wrap: true },
  { k: 'spread', n: 'colour spread', min: 0, max: 1, d: 0.35 },
  { k: 'sat', n: 'saturation', min: 0, max: 1, d: 0.8 },
  { k: 'bright', n: 'brightness', min: 0, max: 2, d: 1 },
  { g: 'geometry' },
  { k: 'zoom', n: 'zoom', min: 0.3, max: 4, d: 1 },
  { k: 'rot', n: 'rotate', min: -3.1416, max: 3.1416, d: 0 },
  { k: 'seg', n: 'mirror', min: 1, max: 12, d: 6 },
  { g: 'pattern' },
  { k: 'shape', n: 'plasma/rings/grid', min: 0, max: 2, d: 0.3 },
  { k: 'scale', n: 'pattern scale', min: 0.5, max: 6, d: 2 },
  { k: 'warp', n: 'warp', min: 0, max: 2, d: 0.6 },
  { k: 'contour', n: 'contour bands', min: 0, max: 1, d: 0.4 },
  { k: 'flow', n: 'flow speed', min: -2, max: 2, d: 0.4 },
  { g: 'feedback' },
  { k: 'fb', n: 'feedback', min: 0, max: 0.97, d: 0.6 },
  { k: 'fbZoom', n: 'feedback zoom', min: 0.94, max: 1.06, d: 1.01 },
  { k: 'fbRot', n: 'feedback twist', min: -0.08, max: 0.08, d: 0.006 },
  { k: 'fbHue', n: 'feedback hue', min: -0.15, max: 0.15, d: 0.02 },
  { g: 'signal' },
  { k: 'chroma', n: 'chroma split', min: 0, max: 0.03, d: 0.004 },
  { k: 'scan', n: 'scanlines', min: 0, max: 1, d: 0.15 },
];
const VPK = VIS_PARAMS.filter((p) => p.k);
const VIDX = Object.fromEntries(VPK.map((p, i) => [p.k, i]));

function visDefault() {
  const mod = VPK.map(() => new Array(VIS_N).fill(0));
  const set = (k, s, a) => (mod[VIDX[k]][s] = a);
  set('zoom', 0, 0.12); set('bright', 0, 0.2); set('fbZoom', 0, 0.3); // dr1 (the kick) punches in
  set('rot', 1, 0.08); set('warp', 2, 0.25);
  set('hue', 3, 0.15); set('chroma', 3, 0.25); // snare shifts colour and splits it
  set('contour', 4, 0.4); set('scan', 5, 0.4); set('fbRot', 5, 0.2);
  return { base: VPK.map((p) => p.d), mod, depth: 1, slew: 0.03 };
}
function visLoad() {
  try {
    const p = JSON.parse(localStorage.getItem('fmdm.vis'));
    if (p && p.base && p.base.length === VPK.length && p.mod && p.mod.length === VPK.length && p.mod[0].length === VIS_N) return p;
  } catch {}
  return visDefault();
}
let vis = visLoad();
function visSave() {
  try { localStorage.setItem('fmdm.vis', JSON.stringify(vis)); } catch {}
}

// mirror is always up after a randomise: at least 3 segments, and drums only ever add more
function visRandomise() {
  const r = Math.random;
  const base = VPK.map((P) => {
    const span = P.max - P.min;
    if (P.k === 'fb') return 0.3 + r() * 0.55;
    if (P.k === 'bright') return 0.8 + r() * 0.5;
    if (P.k === 'chroma') return r() * 0.008;
    if (P.k === 'seg') return 3 + Math.floor(r() * 8);
    if (P.k === 'flow') return (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.9); // keeps moving between hits
    return P.d + (r() - 0.5) * span * 0.5;
  }).map((v, i) => clamp(v, VPK[i].min, VPK[i].max));
  const mod = VPK.map(() => new Array(VIS_N).fill(0));
  const pins = 7 + Math.floor(r() * 7);
  for (let n = 0; n < pins; n++) {
    const d = Math.floor(r() * VPK.length);
    const s = n < VIS_N ? n : Math.floor(r() * VIS_N); // every drum moves something
    const k = VPK[d].k;
    let a = (r() < 0.75 ? 1 : -1) * (0.08 + r() * 0.35);
    if (k === 'seg') a = Math.abs(a);
    if (k === 'flow' || k === 'zoom' || k === 'rot') a *= 0.5; // big jumps here look like glitches
    mod[d][s] = Math.round(a * 100) / 100;
  }
  vis = { base, mod, depth: vis.depth, slew: vis.slew };
  visSave();
  visSync();
}

// ---- drum envelopes: each voice's level meter, normalised to its own recent peak, then fast-attack/slow-release
const visEnv = new Float32Array(VIS_N);
const visRef = new Float32Array(VIS_N).fill(0.05);
function visDrums(dt) {
  const st = S.status;
  const att = 1 - Math.exp(-dt / 0.008), rel = 1 - Math.exp(-dt / 0.16), fall = Math.exp(-dt / 6);
  for (let v = 0; v < VIS_N; v++) {
    const raw = st && st.meters ? st.meters[v] || 0 : 0;
    visRef[v] = Math.max(raw, visRef[v] * fall, 0.05);
    let x = Math.min(1, raw / visRef[v]);
    if (x < 0.04) x = 0;
    visEnv[v] += (x > visEnv[v] ? att : rel) * (x - visEnv[v]);
  }
}
function visParam(i) {
  const P = VPK[i], row = vis.mod[i], span = P.max - P.min;
  let v = vis.base[i];
  for (let s = 0; s < VIS_N; s++) if (row[s]) v += row[s] * visEnv[s] * vis.depth * span;
  return P.wrap ? v : clamp(v, P.min, P.max);
}

// ---- WebGL: scene pass with feedback into ping-pong buffers, then a signal pass (from Slow Signal)
const VIS_VS = `#version 300 es
in vec2 a; out vec2 vUv; void main(){ vUv = a*.5+.5; gl_Position = vec4(a,0.,1.); }`;
const VIS_FS_SCENE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev; uniform vec2 uRes; uniform float uDt;
uniform float hue, spread, sat, bright, zoom, rot, seg, shape, scale, warp, contour, flowT, fb, fbZoom, fbRot, fbHue;
mat2 R(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y)*2.-1.; }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+17.1; a*=.5; } return v; }
vec3 hsv(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.), clamp(p-1.,0.,1.), c.y); }
vec3 hueShift(vec3 c, float a){
  const mat3 toY = mat3(.299,.596,.211, .587,-.274,-.523, .114,-.322,.312);
  const mat3 toR = mat3(1.,1.,1., .956,-.272,-1.106, .621,-.647,1.703);
  vec3 y = toY*c; float h = a*6.2832; float cs=cos(h), sn=sin(h);
  y.yz = vec2(y.y*cs - y.z*sn, y.y*sn + y.z*cs); return toR*y; }
vec3 field(vec2 p, float n){
  if(n>1.5){ float a=atan(p.y,p.x), r=length(p), s=6.28318/n; a=mod(a,s); a=abs(a-s*.5); p=vec2(cos(a),sin(a))*r; }
  vec2 q = p*scale;
  q += warp*vec2(fbm(q*.8+flowT*.31), fbm(q*.8+vec2(5.2,1.3)-flowT*.27));
  float pl = (sin(q.x*3.+flowT)+sin(q.y*2.7-flowT*1.3)+sin((q.x+q.y)*2.1+flowT*.7)+sin(length(q)*4.-flowT*2.))*.25;
  float rg = sin(length(q)*7.-flowT*3.);
  float gd = sin(q.x*5.+flowT)*sin(q.y*5.-flowT*.8);
  float v = shape<1. ? mix(pl, rg, shape) : mix(rg, gd, shape-1.);
  v = mix(v, sin(v*(2.+contour*22.)), smoothstep(0.,.6,contour));
  return hsv(vec3(fract(hue + v*spread), sat, (.5+.5*v)*(.35+.65*smoothstep(-.9,.9,v)))) * bright;
}
void main(){
  float asp = uRes.x/uRes.y;
  vec2 p = (vUv-.5)*vec2(asp,1.);
  p = R(rot)*p/zoom;
  float n0 = floor(max(seg, 1.)), x = max(seg, 1.)-n0;
  vec3 col = field(p, n0);
  if(x > .001) col = mix(col, field(p, n0+1.), x);
  float k = uDt*60.;
  vec2 fp = (vUv-.5)*vec2(asp,1.);
  fp = R(fbRot*k)*fp / pow(fbZoom, k);
  fp = fp/vec2(asp,1.)+.5;
  float edge = step(0.,fp.x)*step(fp.x,1.)*step(0.,fp.y)*step(fp.y,1.);
  vec3 prev = hueShift(texture(uPrev, fp).rgb, fbHue*k) * edge;
  float fb0 = clamp(fb,0.,.97);
  float f = pow(fb0, k);
  float w = (1.-f)*(1.-.55*fb0)/(1.-fb0);
  o = vec4(clamp(col*w + prev*f, 0., 1.), 1.);
}`;
const VIS_FS_POST = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform float chroma, scan, uLines;
void main(){
  vec2 d = (vUv-.5)*chroma*4.;
  vec3 c = vec3(texture(uSrc, vUv+d).r, texture(uSrc, vUv).g, texture(uSrc, vUv-d).b);
  float l = .5+.5*sin(vUv.y*3.14159*uLines);
  c *= 1. - scan*.55*l;
  vec2 w = vUv-.5; c *= 1. - dot(w,w)*.55;
  o = vec4(c, 1.);
}`;

class VisRenderer {
  constructor(canvas) {
    this.c = canvas;
    const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false }));
    if (!gl) throw new Error('no webgl2');
    this.half = !!gl.getExtension('EXT_color_buffer_float');
    this.scene = this.prog(VIS_FS_SCENE);
    this.post = this.prog(VIS_FS_POST);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.w = this.h = 0;
    this.cur = 0;
    this.tex = [];
    this.fbo = [];
  }
  prog(fs) {
    const gl = this.gl;
    const sh = (t, s) => {
      const x = gl.createShader(t);
      gl.shaderSource(x, s);
      gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VIS_VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), loc = {};
    for (let i = 0; i < n; i++) {
      const u = gl.getActiveUniform(p, i);
      loc[u.name] = gl.getUniformLocation(p, u.name);
    }
    return { p, loc };
  }
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.c.width = w;
    this.c.height = h;
    this.w = w;
    this.h = h;
    this.tex.forEach((t) => gl.deleteTexture(t));
    this.fbo.forEach((f) => gl.deleteFramebuffer(f));
    this.tex = [];
    this.fbo = [];
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.tex.push(t);
      this.fbo.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  draw(u, dt) {
    const gl = this.gl, nx = 1 - this.cur;
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.w, this.h);
    let P = this.scene;
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[nx]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    gl.uniform1i(P.loc.uPrev, 0);
    gl.uniform2f(P.loc.uRes, this.w, this.h);
    gl.uniform1f(P.loc.uDt, Math.min(dt, 0.1));
    for (const k in P.loc) if (k in u) gl.uniform1f(P.loc[k], u[k]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    P = this.post;
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[nx]);
    gl.uniform1i(P.loc.uSrc, 0);
    gl.uniform1f(P.loc.chroma, u.chroma);
    gl.uniform1f(P.loc.scan, u.scan);
    gl.uniform1f(P.loc.uLines, this.h / 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.cur = nx;
  }
}

// ---- overlay: the picture, a small bar (randomise, matrix, close) and the matrix panel, both in the LCD look
let visEl = null, visR = null, visOn = false, visRaf = 0, visLast = 0, visIdle = 0, visTick = 0;
let visFlow = 0;
const visSm = new Float64Array(VPK.length);
const visRows = [];

function visBuild() {
  visEl = h('div', 'vis');
  visEl.id = 'vis';
  const cv = h('canvas');
  visEl.append(cv);
  try {
    visR = new VisRenderer(cv);
  } catch (e) {
    visEl = null;
    return false;
  }
  const bar = h('div', 'vbar');
  const mat = h('div', 'vmat');
  mat.hidden = true;
  const mbtn = btn('matrix', 'sm', () => {
    mat.hidden = !mat.hidden;
    mbtn.classList.toggle('on', !mat.hidden);
  });
  bar.append(btn('randomise', 'sm', visRandomise), mbtn, btn('✕', 'sm', visClose));
  visEl.append(bar, mat);

  // matrix: a row per visual control (base bar with its live value, then one cell per drum)
  const head = h('div', 'vrow vhead', `<span class="vn"></span><span></span>${VIS_SRC.map((s) => `<span class="vc">${s}</span>`).join('')}`);
  mat.append(head);
  let idx = 0;
  for (const P of VIS_PARAMS) {
    if (P.g) {
      mat.append(h('div', 'vgrp', P.g));
      continue;
    }
    const i = idx++;
    const row = h('div', 'vrow');
    const name = h('span', 'vn', P.n);
    const base = h('span', 'vb', '<i></i><b></b>');
    base.title = 'drag to set; double-click resets';
    const setBase = (x) => {
      vis.base[i] = P.min + (P.max - P.min) * clamp(x, 0, 1);
      visSyncRow(i);
      visSave();
    };
    base.addEventListener('pointerdown', (e) => {
      base.setPointerCapture(e.pointerId);
      const r = base.getBoundingClientRect();
      const mv = (ev) => setBase((ev.clientX - r.left) / r.width);
      mv(e);
      base.onpointermove = mv;
      base.onpointerup = base.onpointercancel = () => (base.onpointermove = null);
    });
    base.addEventListener('dblclick', () => {
      vis.base[i] = P.d;
      visSyncRow(i);
      visSave();
    });
    row.append(name, base);
    const cells = [];
    for (let s = 0; s < VIS_N; s++) {
      const c = h('span', 'vc cell', '<i></i>');
      visBindCell(c, i, s);
      cells.push(c);
      row.append(c);
    }
    visRows.push({ base, cells });
    mat.append(row);
  }
  mat.append(h('div', 'vfoot', 'click a cell to patch a drum to it, drag up or down for amount (down is negative), double-click clears'));

  const wake = () => {
    visEl.classList.remove('idle');
    clearTimeout(visIdle);
    visIdle = setTimeout(() => mat.hidden && visEl.classList.add('idle'), 2500);
  };
  visEl.addEventListener('pointermove', wake);
  visEl.addEventListener('pointerdown', wake);
  visEl.wake = wake;
  document.body.append(visEl);
  visSync();
  return true;
}
function visBindCell(c, i, s) {
  let y0 = 0, a0 = 0, moved = false, id = null;
  const setA = (a) => {
    vis.mod[i][s] = Math.round(clamp(a, -1, 1) * 100) / 100;
    visSyncCell(i, s);
    visSave();
  };
  c.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    c.setPointerCapture(id);
    y0 = e.clientY;
    a0 = vis.mod[i][s];
    moved = false;
    e.preventDefault();
  });
  c.addEventListener('pointermove', (e) => {
    if (id !== e.pointerId) return;
    const dy = y0 - e.clientY;
    if (Math.abs(dy) > 3) moved = true;
    if (moved) setA(a0 + dy / (90 * stageScale));
  });
  c.addEventListener('pointerup', (e) => {
    if (id !== e.pointerId) return;
    id = null;
    if (!moved) setA(a0 === 0 ? 0.3 : 0);
  });
  c.addEventListener('pointercancel', () => (id = null));
  c.addEventListener('dblclick', () => setA(0));
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    setA(vis.mod[i][s] - Math.sign(e.deltaY) * 0.05);
  }, { passive: false });
}
function visSyncCell(i, s) {
  const a = vis.mod[i][s], c = visRows[i].cells[s];
  c.classList.toggle('on', a !== 0);
  c.classList.toggle('neg', a < 0);
  c.firstChild.style.height = Math.round(Math.min(1, Math.abs(a) * 2) * 100) + '%'; // half scale fills the cell
  c.title = `${VIS_SRC[s]} → ${VPK[i].n}: ${a === 0 ? 'off' : (a > 0 ? '+' : '') + a.toFixed(2)}`;
}
function visSyncRow(i) {
  if (!visRows[i]) return;
  const P = VPK[i];
  visRows[i].base.firstChild.style.width = (((vis.base[i] - P.min) / (P.max - P.min)) * 100).toFixed(1) + '%';
  for (let s = 0; s < VIS_N; s++) visSyncCell(i, s);
}
function visSync() {
  for (let i = 0; i < VPK.length; i++) visSyncRow(i);
}
function visFit() {
  const dpr = window.devicePixelRatio || 1;
  const w = innerWidth, hgt = innerHeight;
  const k = Math.min(dpr, Math.sqrt(2.2e6 / Math.max(1, w * hgt))); // about 1920x1080 at most
  visR.resize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(hgt * k)));
  const sc = Math.min(1.25, Math.max(0.55, stageScale));
  visEl.querySelector('.vbar').style.transform = `scale(${sc})`;
  visEl.querySelector('.vmat').style.transform = `scale(${sc})`;
}
function visFrame(now) {
  if (!visOn) return;
  visRaf = requestAnimationFrame(visFrame);
  const dt = Math.min(0.1, Math.max(0.001, (now - visLast) / 1000));
  visLast = now;
  visDrums(dt);
  const a = vis.slew > 0 ? 1 - Math.exp(-dt / vis.slew) : 1;
  for (let i = 0; i < VPK.length; i++) {
    let d = visParam(i) - visSm[i];
    if (VPK[i].wrap) d -= Math.round(d);
    visSm[i] += a * d;
  }
  visFlow += visSm[VIDX.flow] * dt;
  const u = { flowT: visFlow };
  for (let i = 0; i < VPK.length; i++) u[VPK[i].k] = visSm[i];
  visR.draw(u, dt);
  // live value on each base bar
  if ((visTick++ & 3) === 0 && !visEl.querySelector('.vmat').hidden) {
    for (let i = 0; i < VPK.length; i++) {
      const P = VPK[i];
      let x = (visSm[i] - P.min) / (P.max - P.min);
      if (P.wrap) x = ((x % 1) + 1) % 1;
      visRows[i].base.lastChild.style.left = (clamp(x, 0, 1) * 100).toFixed(1) + '%';
    }
  }
}
function visKey(e) {
  if (!visOn) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    visClose();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopImmediatePropagation();
    visRandomise();
  }
}
function openVis() {
  if (!visEl && !visBuild()) return toast('the visualiser needs webgl2');
  visOn = true;
  visEl.hidden = false;
  for (let i = 0; i < VPK.length; i++) visSm[i] = visParam(i);
  visFit();
  visEl.wake();
  visLast = performance.now();
  visRaf = requestAnimationFrame(visFrame);
  try {
    const p = visEl.requestFullscreen && visEl.requestFullscreen();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}
function visClose() {
  if (!visOn) return;
  visOn = false;
  cancelAnimationFrame(visRaf);
  visEl.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
addEventListener('keydown', visKey, true);
addEventListener('resize', () => visOn && visFit());
// leaving full screen (the browser's own Esc) closes the visualiser too
document.addEventListener('fullscreenchange', () => {
  if (visOn && !document.fullscreenElement) visClose();
});
