// fm/dm — visualiser: click the logo for a full-screen feedback-shader picture. It is Johnny's Slow Signal video
// synth (same scene, feedback and signal shaders, same visual controls), but its patch matrix takes the six
// drums as sources in place of the LFOs and the audio input: each drum's envelope, from its level meter. The
// fm/dm logo sits in the picture: the drums (and everything in the matrix) move it, it follows the picture's
// geometry and imprints on its pattern, and every few bars it flashes into the feedback trails; that flash is
// the seventh matrix source (logo), so it can move everything else too.
// Randomise picture always leaves the mirror on; randomise everything randomises the sounds,
// rhythm, fx, mix, xmod and motion. Esc or ✕ closes; Enter randomises the picture.

const VIS_SRC = [...SHORT, 'logo']; // dr1 dr2 dr3 sn cy hh, and the logo flash
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
  // the fm/dm logo, drawn over the picture; its feedback amount is how much of it goes into the trails
  { g: 'logo' },
  { k: 'lAmt', n: 'logo level', min: 0, max: 1, d: 1 },
  { k: 'lSize', n: 'logo size', min: 0.1, max: 1.6, d: 0.55 },
  { k: 'lRot', n: 'logo rotate', min: -3.1416, max: 3.1416, d: 0 },
  { k: 'lHue', n: 'logo hue', min: 0, max: 1, d: 0.05, wrap: true },
  { k: 'lSat', n: 'logo saturation', min: 0, max: 1, d: 0 },
  { k: 'lBright', n: 'logo brightness', min: 0, max: 2, d: 1 },
  { k: 'lWarp', n: 'logo follows', min: 0, max: 1, d: 0.3 },
  { k: 'lImprint', n: 'logo imprint', min: 0, max: 1, d: 0.25 },
  { k: 'lFlash', n: 'logo flash', min: 0, max: 1, d: 0.8 },
  { k: 'lEvery', n: 'flash every (bars)', min: 1, max: 16, d: 4 },
  { k: 'lFade', n: 'flash length', min: 0.05, max: 1, d: 0.4 },
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
// a patch saved before a control existed gets that control's default (new controls are added at the end)
function visFix(p) {
  if (!p || !p.base || !p.mod || p.mod.length !== p.base.length) return null;
  // patches from when the logo had a 'logo feedback' row (after brightness): drop it
  if (p.base.length === VPK.length + 1) {
    const i = VIDX.lBright + 1;
    p = { ...p, base: p.base.filter((_, j) => j !== i), mod: p.mod.filter((_, j) => j !== i) };
  }
  if (p.base.length > VPK.length) return null;
  if (p.mod.some((row) => row.length > VIS_N)) return null;
  const base = p.base.slice(), mod = p.mod.map((r) => [...r, ...new Array(VIS_N - r.length).fill(0)]); // the logo source came later
  for (let i = base.length; i < VPK.length; i++) {
    base.push(VPK[i].d);
    mod.push(new Array(VIS_N).fill(0));
  }
  return { ...p, base, mod, depth: p.depth ?? 1, slew: p.slew ?? 0.03 };
}
function visLoad() {
  try {
    const p = visFix(JSON.parse(localStorage.getItem('fmdm.vis')));
    if (p) return p;
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
    // the logo: solid, with subtle effects every time (mid size, mostly upright, gentle follow/imprint/flash)
    if (P.k === 'lAmt') return 1;
    if (P.k === 'lSize') return 0.35 + r() * 0.35;
    if (P.k === 'lRot') return r() < 0.8 ? 0 : (r() - 0.5) * 0.5;
    if (P.k === 'lSat') return r() * 0.5;
    if (P.k === 'lBright') return 0.6 + r() * 0.4;
    if (P.k === 'lWarp') return r() * 0.35;
    if (P.k === 'lImprint') return r() * 0.2;
    if (P.k === 'lFlash') return 0.15 + r() * 0.3;
    if (P.k === 'lEvery') return [4, 8, 8, 16][Math.floor(r() * 4)];
    if (P.k === 'lFade') return 0.2 + r() * 0.3;
    if (P.k === 'seg') return 3 + Math.floor(r() * 8);
    if (P.k === 'flow') return (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.9); // keeps moving between hits
    return P.d + (r() - 0.5) * span * 0.5;
  }).map((v, i) => clamp(v, VPK[i].min, VPK[i].max));
  const mod = VPK.map(() => new Array(VIS_N).fill(0));
  const pins = 7 + Math.floor(r() * 7);
  for (let n = 0; n < pins; n++) {
    const d = Math.floor(r() * VPK.length);
    const s = n < VIS_N ? n : Math.floor(r() * VIS_N); // every drum (and the logo flash) moves something
    const k = VPK[d].k;
    let a = (r() < 0.75 ? 1 : -1) * (0.08 + r() * 0.35);
    if (k === 'seg') a = Math.abs(a);
    if (k === 'flow' || k === 'zoom' || k === 'rot') a *= 0.5; // big jumps here look like glitches
    if (k[0] === 'l' && k !== 'lEvery' || s === VIS_N - 1) a *= 0.35; // drums move the logo gently, and the logo flash moves the picture gently
    if (k === 'lEvery' || k === 'lAmt') a = 0; // the logo stays solid
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
  for (let v = 0; v < 6; v++) {
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
// the logo: its alpha as a mask, sharpened (the artwork is small), centred, sized in screen heights
const VIS_LOGO_GLSL = `
uniform sampler2D uLogo; uniform float uLogoAsp, lAmt, lSize, lRot, lHue, lSat, lBright, lImprint, lWarp, uFlash;
vec3 lhsv(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.), clamp(p-1.,0.,1.), c.y); }
// p: centred screen position (x scaled by the aspect); returns the bare shape, 0..1
float logoMask(vec2 p){
  float c=cos(lRot), s=sin(lRot);
  p = mat2(c,s,-s,c)*p / max(lSize, .01);
  vec2 t = vec2(p.x + .5, .5 - p.y*uLogoAsp);
  if (t.x < 0. || t.x > 1. || t.y < 0. || t.y > 1.) return 0.;
  return smoothstep(.3, .7, texture(uLogo, t).a);
}
vec3 logoCol(){ return lhsv(vec3(lHue, lSat, 1.)) * lBright; }`;
const VIS_FS_SCENE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev; uniform vec2 uRes; uniform float uDt;
uniform float hue, spread, sat, bright, zoom, rot, seg, shape, scale, warp, contour, flowT, fb, fbZoom, fbRot, fbHue;
${VIS_LOGO_GLSL}
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
  // the logo, carried part way through the picture's own zoom, rotation, mirror and warp
  vec2 p0 = (vUv-.5)*vec2(asp,1.);
  vec2 pg = p;
  float nm = floor(seg+.5);
  if(nm>1.5){ float a=atan(pg.y,pg.x), r=length(pg), s=6.28318/nm; a=mod(a+s*.25,s); a=abs(a-s*.5); pg=vec2(cos(a),sin(a))*r; pg=vec2(pg.y,-pg.x); }
  pg += warp*.12*vec2(fbm(pg*2.+flowT*.3), fbm(pg*2.+vec2(3.1,.7)-flowT*.3));
  float lm = logoMask(mix(p0, pg, lWarp));
  // imprint: inside the logo the pattern turns to its opposite colours
  col = mix(col, hueShift(col, .5)*1.15, lm*lImprint);
  float k = uDt*60.;
  vec2 fp = (vUv-.5)*vec2(asp,1.);
  fp = R(fbRot*k)*fp / pow(fbZoom, k);
  fp = fp/vec2(asp,1.)+.5;
  float edge = step(0.,fp.x)*step(fp.x,1.)*step(0.,fp.y)*step(fp.y,1.);
  vec3 prev = hueShift(texture(uPrev, fp).rgb, fbHue*k) * edge;
  float fb0 = clamp(fb,0.,.97);
  float f = pow(fb0, k);
  float w = (1.-f)*(1.-.55*fb0)/(1.-fb0);
  vec3 outc = clamp(col*w + prev*f, 0., 1.);
  outc = mix(outc, logoCol(), clamp(lm*(lAmt + uFlash), 0., 1.)); // only ever through the effects: into the trails, with the flash
  o = vec4(outc, 1.);
}`;
const VIS_FS_POST = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uRes; uniform float chroma, scan, uLines;
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
    // the logo texture: blank until the image has loaded
    this.logo = gl.createTexture();
    this.logoAsp = 325 / 120;
    gl.bindTexture(gl.TEXTURE_2D, this.logo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, this.logo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.logoAsp = img.width / img.height;
    };
    img.src = LOGO_URL;
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
  bindLogo(P) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.logo);
    gl.uniform1i(P.loc.uLogo, 1);
    gl.uniform1f(P.loc.uLogoAsp, this.logoAsp);
    gl.activeTexture(gl.TEXTURE0);
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
    this.bindLogo(P);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    P = this.post;
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[nx]);
    gl.uniform1i(P.loc.uSrc, 0);
    gl.uniform2f(P.loc.uRes, this.w, this.h);
    for (const k in P.loc) if (k in u) gl.uniform1f(P.loc[k], u[k]);
    gl.uniform1f(P.loc.uLines, this.h / 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.cur = nx;
  }
}

// ---- overlay: the picture, a small bar (randomise, matrix, close) and the matrix panel, both in the LCD look
let visEl = null, visR = null, visOn = false, visRaf = 0, visLast = 0, visIdle = 0, visTick = 0;
let visFlow = 0, visFlashPh = 0;
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
  const name = h('span', 'vname');
  const mt = btn('', 'sm', () => {
    visOpt.morph = VIS_MORPHS[(VIS_MORPHS.indexOf(visOpt.morph) + 1) % VIS_MORPHS.length];
    drawOpt();
  });
  mt.title = 'morph time: how long ‹ › take to glide to the next preset';
  const auto = btn('auto', 'sm', () => {
    visOpt.auto = !visOpt.auto;
    visHold = 0;
    drawOpt();
  });
  auto.title = 'step to the next preset by itself (holds each for the morph time, at least 4 s)';
  const drawOpt = () => {
    mt.textContent = visOpt.morph ? `morph ${visOpt.morph}s` : 'morph off';
    auto.classList.toggle('on', visOpt.auto);
    visOptSave();
  };
  drawOpt();
  const del = btn('del', 'sm', visDeleteScene);
  del.title = 'delete the shown preset';
  const sv = btn('save', 'sm', visSaveScene);
  const ex = btn('export presets', 'sm', visExport);
  ex.title = 'download your visualiser presets (picture + sound) as a file, to make factory presets';
  sv.title = 'save the picture and the sound as a new preset';
  bar.append(btn('randomise picture', 'sm', () => { visMorph = null; visRandomise(); }), btn('randomise everything', 'sm', () => { visMorph = null; runRandom('all'); }),
    sv, btn('‹', 'sm', () => visStep(-1)), name, btn('›', 'sm', () => visStep(1)), mt, auto, del, ex, mbtn, btn('✕', 'sm', visClose));
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
      visMorph = null;
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
    visMorph = null;
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
  // logo flash: every n bars at the current tempo, a sin² bump lasting the flash length (a share of the gap)
  const bpm = S.base[NV_ + M.bpm] || 120;
  visFlashPh = (visFlashPh + (dt * bpm) / 240 / Math.max(1, visSm[VIDX.lEvery])) % 1;
  const fl = Math.max(0.05, visSm[VIDX.lFade]);
  visEnv[6] = visFlashPh < fl ? Math.sin((Math.PI * visFlashPh) / fl) ** 2 : 0;
  if (visMorph) visMorphTick(now);
  else if (visOpt.auto && (visHold += dt) >= Math.max(4, visOpt.morph)) visStep(1);
  const a = vis.slew > 0 ? 1 - Math.exp(-dt / vis.slew) : 1;
  for (let i = 0; i < VPK.length; i++) {
    let d = visParam(i) - visSm[i];
    if (VPK[i].wrap) d -= Math.round(d);
    visSm[i] += a * d;
  }
  visFlow += visSm[VIDX.flow] * dt;
  const u = { flowT: visFlow, uFlash: visEnv[6] * visSm[VIDX.lFlash] };
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
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopImmediatePropagation();
    visStep(e.key === 'ArrowRight' ? 1 : -1);
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
  { const l = visScenes(); visShowName(visCur >= 0 && l[visCur] ? l[visCur].name : l.length ? `${l.length} presets` : ''); }
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
  if (visMorph) visMorphTick(visMorph.t0 + visMorph.dur + 1);
  visEl.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
addEventListener('keydown', visKey, true);
addEventListener('resize', () => visOn && visFit());
// leaving full screen (the browser's own Esc) closes the visualiser too
document.addEventListener('fullscreenchange', () => {
  if (visOn && !document.fullscreenElement) visClose();
});

// ---- visualiser presets: each saves the picture (vis) and the whole sound (the preset page's capture). ‹ › step
// through them, morphing over the morph time: the picture and every continuous sound parameter glide (exp
// parameters glide geometrically), switches, the rhythm and knob sequences change halfway. auto steps on by itself.
const VIS_LS = 'fmdm.visPresets';
const VIS_MORPHS = [0, 1, 2, 4, 8, 16, 32];
const visOpt = (() => {
  try { return { morph: 4, auto: false, ...JSON.parse(localStorage.getItem('fmdm.visOpt') || '{}') }; } catch { return { morph: 4, auto: false }; }
})();
const visOptSave = () => { try { localStorage.setItem('fmdm.visOpt', JSON.stringify(visOpt)); } catch {} };
// yours (saved in this browser) first, then the factory ones (presets/vis/*.json, built in)
function visMine() {
  try { return JSON.parse(localStorage.getItem(VIS_LS) || '[]'); } catch { return []; }
}
function visScenes() {
  const mine = visMine();
  const names = new Set(mine.map((p) => p.name));
  return [...mine, ...BUILTIN_VIS.filter((p) => !names.has(p.name)).map((p) => ({ ...p, builtin: true }))];
}
// downloads your presets in the same format as presets/vis/*.json, so a file can be dropped in there as factory presets
function visExport() {
  const mine = visMine();
  if (!mine.length) return toast('save a preset first');
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'fm/dm', kind: 'visualiser', v: PRESET_V, presets: mine }, null, 1)], { type: 'application/json' }));
  a.download = 'fm-dm-vis-presets.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let visCur = -1; // index of the scene last loaded or saved
let visMorph = null; // { t0, dur, vFrom, vTo, sFrom, sTo, pr, half }
let visHold = 0; // auto: time spent on the current scene
const visClone = (o) => JSON.parse(JSON.stringify(o));
function visSaveScene() {
  const mine = visMine();
  const all = visScenes();
  let name;
  do name = presetName((Math.random() * 1e9) | 0);
  while (all.some((p) => p.name === name));
  mine.push({ name, vis: visClone(vis), sound: capture(name) });
  try { localStorage.setItem(VIS_LS, JSON.stringify(mine)); } catch { return toast('could not save (storage full or blocked)'); }
  visCur = mine.length - 1;
  visShowName(name);
}
function visDeleteScene() {
  const list = visScenes();
  const sc = list[visCur];
  if (!sc) return;
  if (sc.builtin) return toast('factory presets cannot be deleted');
  const mine = visMine().filter((p) => p.name !== sc.name);
  try { localStorage.setItem(VIS_LS, JSON.stringify(mine)); } catch {}
  const now = visScenes();
  visCur = Math.min(visCur, now.length - 1);
  visShowName(visCur >= 0 ? now[visCur].name : '');
}
function visShowName(n) {
  if (visEl) visEl.querySelector('.vname').textContent = n || 'no presets';
}
// the sound of a preset as a flat array, the way applyPreset would set it
function visSoundBase(pr) {
  const b = S.base.slice();
  for (let v = 0; v < 6; v++) for (const p of PARAMS) b[v * NP + p.i] = pr.voices[v]?.[p.id] ?? defaultFor(v * NP + p.i);
  for (const p of MPARAMS) b[NV_ + p.i] = pr.master?.[p.id] ?? p.def;
  return b;
}
function visStep(dir) {
  const list = visScenes();
  if (!list.length) return toast('save a preset first');
  visCur = ((visCur < 0 ? (dir > 0 ? -1 : 0) : visCur) + dir + list.length) % list.length;
  const sc = list[visCur];
  visShowName(sc.name);
  visHold = 0;
  pushUndo();
  visMorph = { t0: performance.now(), dur: visOpt.morph * 1000, vFrom: visClone(vis), vTo: visFix(sc.vis) || visClone(vis), sFrom: S.base.slice(), sTo: visSoundBase(sc.sound), pr: sc.sound, half: false };
  visMorphTick(visMorph.t0);
}
function visLerp(a, b, x, curve) {
  if (curve === 'int') return x < 0.5 ? a : b;
  if (curve === 'exp' && a > 0 && b > 0) return a * Math.pow(b / a, x);
  return a + (b - a) * x;
}
function visMorphTick(now) {
  const m = visMorph;
  if (!m) return;
  const x = m.dur > 0 ? clamp((now - m.t0) / m.dur, 0, 1) : 1;
  const e = x * x * (3 - 2 * x);
  // picture
  vis.base = m.vTo.base.map((b, i) => {
    let a = m.vFrom.base[i], d = b - a;
    if (VPK[i].wrap) d -= Math.round(d);
    return a + d * e;
  });
  vis.mod = m.vTo.mod.map((row, i) => row.map((b, s) => m.vFrom.mod[i][s] + (b - m.vFrom.mod[i][s]) * e));
  vis.depth = m.vFrom.depth + (m.vTo.depth - m.vFrom.depth) * e;
  vis.slew = m.vFrom.slew + (m.vTo.slew - m.vFrom.slew) * e;
  // sound: every parameter glides, sent in one message about 30 times a second
  if (!m.lastSend || now - m.lastSend > 33 || x >= 1) {
    m.lastSend = now;
    for (let g = 0; g < m.sTo.length; g++) S.base[g] = visLerp(m.sFrom[g], m.sTo[g], e, specOf(g).curve);
    post({ t: 'all', base: S.base.slice() });
  }
  // halfway: the rhythm, knob sequences, beat generator and perf knobs change over
  if (!m.half && x >= 0.5) {
    m.half = true;
    const pr = m.pr;
    S.vel.fill(0);
    S.flag.fill(0);
    (pr.pat || []).forEach((row, t) => row.forEach((v, k) => { S.vel[t * MAX_STEPS + k] = v & 127; S.flag[t * MAX_STEPS + k] = v >> 7; }));
    S.lanes = new Array(NUM_LANES).fill(null);
    (pr.lanes || []).slice(0, NUM_LANES).forEach((ln, l) => {
      const g = keyG(ln.key);
      if (g < 0) return;
      const steps = new Float32Array(MAX_STEPS);
      steps.set(ln.steps.slice(0, MAX_STEPS));
      const shapes = new Uint8Array(MAX_STEPS);
      if (ln.shapes) shapes.set(ln.shapes.slice(0, MAX_STEPS));
      S.lanes[l] = { g, steps, shapes, mode: ln.mode || 0, len: ln.len, slew: ln.slew, speed: ln.speed, depth: ln.depth, groove: ln.groove };
    });
    if (pr.gen) S.gen = { ...S.gen, ...pr.gen, density: pr.gen.density ? pr.gen.density.slice() : S.gen.density };
    post({ t: 'bundle', msgs: [{ t: 'pat', vel: S.vel.slice(), flag: S.flag.slice() }, ...laneMsgs()] });
  }
  if (x >= 1) {
    visMorph = null;
    if (m.pr.perf) m.pr.perf.forEach((k, i) => k !== S.perf[i] && setPerf(i, k));
    curPreset = m.pr.name;
    visSave();
    visSync();
    redrawAll();
    redraw('pattern');
    redraw('preset');
    dirty();
  } else if ((visTick & 7) === 0) visSync();
}
