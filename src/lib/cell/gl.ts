// WebGL2 renderer of the cellular era. The whole scene is drawn into a low-resolution framebuffer (1 art pixel = 1
// framebuffer pixel at zoom 1) and scaled up with nearest filtering, so rotated sprites, parallax layers and shaders
// all share one pixel grid - flat pixel art, never smooth. Top-down with depth: the abyss, drifting particles and the
// silhouettes of big organisms far below move slower than the play plane (parallax); marine snow floats between; a
// few blurred motes pass above the camera.
import type { Atlas } from './atlas';
import { LAYER } from './atlas';
import type { WorldDef } from './world';
import { WORLD, BIO_N } from './world';
import { VIS_N } from './sim';

export const INST = 17;            // floats per sprite instance
const MAX_INST = 24000;

const VS_SPRITE = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_pos;    // x, y, angle, scale (negative: flat dot)
layout(location=2) in vec4 a_rect;   // u, v, w, h (texels of frame 0)
layout(location=3) in vec4 a_anim;   // layer, frames, phase, fps
layout(location=4) in vec4 a_tint;   // rgb, amount
layout(location=5) in float a_alpha;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform float u_time; uniform float u_depth;
out vec2 v_uv; out vec2 v_local; flat out float v_layer; out vec4 v_tint; out float v_alpha; flat out float v_dot;
void main() {
  float sc = abs(a_pos.w);
  v_dot = a_pos.w < 0.0 ? 1.0 : 0.0;
  vec2 size = a_rect.zw * sc;
  if (v_dot > 0.5) size = max(size, vec2(1.6 / (u_zoom * u_depth)));
  vec2 local = a_corner * size;
  float c = cos(a_pos.z), s = sin(a_pos.z);
  vec2 world = a_pos.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 fbp = (world - u_cam) * u_zoom * u_depth + u_fb * 0.5;
  vec2 ndc = fbp / u_fb * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  float frame = a_anim.y > 1.0 ? floor(mod(u_time * a_anim.w + a_anim.z * a_anim.y, a_anim.y)) : 0.0;
  v_uv = vec2(a_rect.x + frame * a_rect.z, a_rect.y) + (a_corner + 0.5) * a_rect.zw;
  v_local = a_corner;
  v_layer = a_anim.x; v_tint = a_tint; v_alpha = a_alpha;
}`;
const FS_SPRITE = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec2 v_uv; in vec2 v_local; flat in float v_layer; in vec4 v_tint; in float v_alpha; flat in float v_dot;
uniform sampler2DArray u_atlas;
out vec4 o;
void main() {
  if (v_dot > 0.5) {
    if (dot(v_local, v_local) > 0.25) discard;
    o = vec4(v_tint.rgb, v_alpha); return;
  }
  vec4 t = texture(u_atlas, vec3(v_uv / ${LAYER.toFixed(1)}, v_layer));
  if (t.a < 0.5) discard;
  o = vec4(mix(t.rgb, v_tint.rgb, v_tint.a), v_alpha);
}`;

const VS_FULL = `#version 300 es
layout(location=0) in vec2 a_corner;
void main() { gl_Position = vec4(a_corner * 2.0, 0.0, 1.0); }`;

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float bayer4(vec2 p) { ivec2 q = ivec2(mod(p, 4.0)); int i = q.y * 4 + q.x;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return float(b[i]) / 16.0; }
vec3 quant(vec3 c, vec2 p, float n) { return floor(c * n + bayer4(p)) / n; }
// voronoi edge distance (F2 - F1): bright caustic lines
float caustic(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p); float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + 3.7));
    o = 0.5 + 0.42 * sin(t * 0.6 + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.14, f2 - f1);
}
vec2 flowAt(vec2 p, float t) {
  float a = 1.0 / 900.0, b = 1.0 / 2300.0;
  float p1 = p.x * a + t * 0.01, p2 = p.y * a - t * 0.013;
  float vx = -sin(p1) * sin(p2) * a + 0.6 * sin(p.x * b) * cos(p.y * b) * b;
  float vy = -cos(p1) * cos(p2) * a - 0.6 * cos(p.x * b) * sin(p.y * b) * b;
  return vec2(vx, vy) * 5500.0;
}`;

const FS_BG = `#version 300 es
precision highp float;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform float u_time; uniform float u_world;
uniform vec3 u_lights[32]; uniform int u_nl; uniform vec3 u_vents[16]; uniform int u_nv; uniform vec3 u_water; uniform vec3 u_deep;
out vec4 o;
${NOISE}
vec2 worldAt(float depth) { vec2 f = vec2(gl_FragCoord.x, u_fb.y - gl_FragCoord.y); return u_cam + (f - u_fb * 0.5) / (u_zoom * depth); }
void main() {
  vec2 fp = gl_FragCoord.xy;
  // abyss far below (slow): dark water with big soft clouds of plankton
  vec2 wa = worldAt(0.3);
  float cl = fbm(wa / 900.0 + u_time * 0.004);
  vec3 col = mix(u_deep * 0.55, u_deep, smoothstep(0.3, 0.8, cl));
  // far drifting particles
  vec2 wf = worldAt(0.45) + vec2(u_time * 3.0, u_time * 1.5);
  vec2 cf = floor(wf / 22.0);
  float hf = h21(cf);
  if (hf > 0.93 && length(fract(wf / 22.0) - vec2(h21(cf + 1.3), h21(cf + 2.7))) < 0.9 / (u_zoom * 0.45 * 22.0)) col += u_water * 0.25;
  // the play plane: water tint, caustics, light shafts, vents
  vec2 w = worldAt(1.0);
  float light = 0.0;
  for (int i = 0; i < 32; i++) { if (i >= u_nl) break; vec3 L = u_lights[i]; float d = length(w - L.xy) / L.z; light = max(light, smoothstep(1.0, 0.35, d)); }
  float cs = caustic(w / 130.0, u_time) * 0.6 + caustic(w / 57.0 + 3.1, u_time * 1.3) * 0.4;
  col = mix(col, u_water, 0.35 + light * 0.25);
  col += vec3(0.3, 0.5, 0.4) * cs * (0.045 + light * 0.16);
  col += vec3(0.16, 0.22, 0.12) * light;
  for (int i = 0; i < 16; i++) { if (i >= u_nv) break; vec3 V = u_vents[i]; float d = length(w - V.xy); float g = exp(-d / (V.z * 1.6));
    col += vec3(0.55, 0.22, 0.05) * g * (0.75 + 0.25 * sin(u_time * 2.0 + d * 0.05)); }
  // the pool's rim beyond the world edge
  vec2 e = min(w, u_world - w);
  float edge = min(e.x, e.y);
  if (edge < 0.0) col = mix(col * 0.35, vec3(0.08, 0.07, 0.06), smoothstep(0.0, 80.0, -edge) * 0.85);
  else col *= mix(0.55, 1.0, smoothstep(0.0, 260.0, edge));
  o = vec4(quant(clamp(col, 0.0, 1.0), fp, 22.0), 1.0);
}`;

// marine snow between the deep layer and the play plane, carried by the current (flow-map advection, two phases)
const FS_MID = `#version 300 es
precision highp float;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform float u_time; uniform float u_depth; uniform float u_cell; uniform float u_density; uniform vec3 u_col; uniform float u_size;
out vec4 o;
${NOISE}
float snow(vec2 w) { vec2 c = floor(w / u_cell); float h = h21(c + 0.5); if (h > u_density) return 0.0;
  vec2 o2 = vec2(h21(c + 11.1), h21(c + 7.3)) * 0.8 + 0.1; float r = u_size / (u_zoom * u_depth * u_cell);
  return 1.0 - smoothstep(r * 0.6, r, length(fract(w / u_cell) - o2)); }
void main() {
  vec2 f = vec2(gl_FragCoord.x, u_fb.y - gl_FragCoord.y);
  vec2 w = u_cam + (f - u_fb * 0.5) / (u_zoom * u_depth);
  vec2 fl = flowAt(w, u_time) * 1.4;
  float T = 24.0, p0 = fract(u_time / T), p1 = fract(u_time / T + 0.5);
  float a = snow(w - fl * p0 * T + 3.0) * (1.0 - abs(2.0 * p0 - 1.0)) + snow(w - fl * p1 * T + 91.0) * (1.0 - abs(2.0 * p1 - 1.0));
  if (a < 0.3) discard;
  o = vec4(u_col, min(1.0, a) * 0.55);
}`;

// biofilm: the colonies' territory, an organic slime tinted by the colony
const FS_BIO = `#version 300 es
precision highp float;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform float u_time;
uniform sampler2D u_own; uniform sampler2D u_str; uniform sampler2D u_pal; uniform float u_bio;
out vec4 o;
${NOISE}
void main() {
  vec2 f = vec2(gl_FragCoord.x, u_fb.y - gl_FragCoord.y);
  vec2 w = u_cam + (f - u_fb * 0.5) / u_zoom;
  vec2 j = w + (vec2(vn(w / 23.0), vn(w / 23.0 + 9.0)) - 0.5) * 26.0;
  vec2 uv = j / u_bio;
  float s = texture(u_str, uv).r;
  if (s < 0.14) discard;
  int own = int(texture(u_own, uv).r * 255.0 + 0.5);
  if (own == 255) discard;
  vec4 pc = texelFetch(u_pal, ivec2(own, 0), 0);
  if (pc.a < 0.5) discard;              // a species not discovered yet: its territory stays hidden
  vec3 c = pc.rgb;
  // contested borders: another (known) owner right next door
  int o1 = int(texture(u_own, (j + vec2(22.0, 0)) / u_bio).r * 255.0 + 0.5), o2 = int(texture(u_own, (j + vec2(0, 22.0)) / u_bio).r * 255.0 + 0.5);
  bool k1 = o1 != 255 && texelFetch(u_pal, ivec2(o1, 0), 0).a > 0.5, k2 = o2 != 255 && texelFetch(u_pal, ivec2(o2, 0), 0).a > 0.5;
  bool border = (o1 != own && k1) || (o2 != own && k2);
  float rim = 1.0 - smoothstep(0.14, 0.3, s);
  float bubbles = step(0.82, vn(w / 7.0 + u_time * 0.05)) * 0.5 + step(0.9, h21(floor(w / 3.0))) * 0.3;
  float mott = fbm(w / 40.0 + u_time * 0.02);
  vec3 col = c * (0.75 + mott * 0.4) + bubbles * 0.14;
  float a = 0.12 + mott * 0.08 + bubbles * 0.12;
  if (rim > 0.0) { col = mix(col, c * 1.25 + 0.08, rim); a = mix(a, 0.6, rim); }
  if (border) { col = c * 0.35; a = 0.7; }
  o = vec4(quant(clamp(col, 0.0, 1.0), gl_FragCoord.xy, 20.0), a);
}`;

// fog of war: a light, dithered darkening where the player's cells see nothing
const FS_FOG = `#version 300 es
precision highp float;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform sampler2D u_vis; uniform float u_world;
out vec4 o;
${NOISE}
void main() {
  vec2 f = vec2(gl_FragCoord.x, u_fb.y - gl_FragCoord.y);
  vec2 w = u_cam + (f - u_fb * 0.5) / u_zoom;
  float v = texture(u_vis, w / u_world).r;
  float d = floor((1.0 - v) * 4.0 + bayer4(gl_FragCoord.xy) * 0.999) / 4.0;
  if (d <= 0.0) discard;
  o = vec4(0.0, 0.02, 0.04, d * 0.34);
}`;

// bokeh above the camera
const FS_FG = `#version 300 es
precision highp float;
uniform vec2 u_cam; uniform float u_zoom; uniform vec2 u_fb; uniform float u_time;
out vec4 o;
${NOISE}
void main() {
  vec2 f = vec2(gl_FragCoord.x, u_fb.y - gl_FragCoord.y);
  float dz = 1.8;
  vec2 w = u_cam + (f - u_fb * 0.5) / (u_zoom * dz) + vec2(u_time * 9.0, -u_time * 4.0);
  vec2 c = floor(w / 420.0);
  if (h21(c) > 0.35) discard;
  vec2 ctr = (c + vec2(h21(c + 4.1), h21(c + 8.3)) * 0.7 + 0.15) * 420.0;
  float r = (26.0 + h21(c + 2.2) * 40.0);
  float d = length(w - ctr) / r;
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * 0.1 + step(0.86, d) * step(d, 0.97) * 0.06;
  o = vec4(0.75, 0.9, 0.85, a);
}`;

const FS_BLIT = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform vec2 u_fb; uniform vec2 u_out;
out vec4 o;
void main() { vec2 f = vec2(gl_FragCoord.x, u_out.y - gl_FragCoord.y); vec2 uv = floor(f / u_out * u_fb) + 0.5;
  o = texture(u_tex, vec2(uv.x, u_fb.y - uv.y) / u_fb); }`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i)!; const name = a.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
type Prog = ReturnType<typeof compile>;

export interface View { x: number; y: number; zoom: number }
export interface Batch { data: Float32Array; count: number; depth: number }

export class CellGL {
  gl: WebGL2RenderingContext;
  sprite: Prog; bg: Prog; mid: Prog; bio: Prog; fg: Prog; blit: Prog; fog: Prog;
  quad: WebGLBuffer; inst: WebGLBuffer; vaoFull: WebGLVertexArrayObject; vaoSprite: WebGLVertexArrayObject;
  atlas: WebGLTexture; own: WebGLTexture; str: WebGLTexture; pal: WebGLTexture; vis: WebGLTexture; palData: Uint8Array;
  fbo: WebGLFramebuffer; fbTex: WebGLTexture; fbW = 0; fbH = 0; outW = 0; outH = 0;
  world: WorldDef;
  water: [number, number, number]; deep: [number, number, number];

  constructor(public canvas: HTMLCanvasElement, atlas: Atlas, world: WorldDef, palette: [number, number, number][], alien: boolean) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 indisponível');
    this.gl = gl; this.world = world;
    this.water = alien ? [0.1, 0.2, 0.26] : [0.1, 0.26, 0.28];
    this.deep = alien ? [0.07, 0.06, 0.16] : [0.03, 0.1, 0.14];
    this.sprite = compile(gl, VS_SPRITE, FS_SPRITE);
    this.bg = compile(gl, VS_FULL, FS_BG);
    this.mid = compile(gl, VS_FULL, FS_MID);
    this.bio = compile(gl, VS_FULL, FS_BIO);
    this.fg = compile(gl, VS_FULL, FS_FG);
    this.blit = compile(gl, VS_FULL, FS_BLIT);
    this.fog = compile(gl, VS_FULL, FS_FOG);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    this.vaoFull = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoFull);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer()!;
    this.vaoSprite = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoSprite);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INST * INST * 4, gl.DYNAMIC_DRAW);
    const S = INST * 4;
    [[1, 4, 0], [2, 4, 16], [3, 4, 32], [4, 4, 48], [5, 1, 64]].forEach(([loc, n, off]) => {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off); gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);
    // atlas
    this.atlas = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, LAYER, LAYER, atlas.layers.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    atlas.layers.forEach((L, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, L));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // biofilm grids + colony palette
    const tex2d = (w: number, h: number, fmt: number, ifmt: number, filter: number, data: ArrayBufferView | null) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.own = tex2d(BIO_N, BIO_N, gl.RED, gl.R8, gl.NEAREST, new Uint8Array(BIO_N * BIO_N).fill(255));
    this.str = tex2d(BIO_N, BIO_N, gl.RED, gl.R8, gl.LINEAR, new Uint8Array(BIO_N * BIO_N));
    const pal = new Uint8Array(256 * 4);
    // alpha = discovered (the player's own species always)
    palette.forEach((c, i) => { pal[i * 4] = c[0]; pal[i * 4 + 1] = c[1]; pal[i * 4 + 2] = c[2]; pal[i * 4 + 3] = i === 0 ? 255 : 0; });
    this.palData = pal;
    this.pal = tex2d(256, 1, gl.RGBA, gl.RGBA8, gl.NEAREST, pal);
    this.vis = tex2d(VIS_N, VIS_N, gl.RED, gl.R8, gl.LINEAR, new Uint8Array(VIS_N * VIS_N));
    this.fbo = gl.createFramebuffer()!;
    this.fbTex = gl.createTexture()!;
  }

  setBio(own: Uint8Array, str: Uint8Array) {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.own); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BIO_N, BIO_N, gl.RED, gl.UNSIGNED_BYTE, own);
    gl.bindTexture(gl.TEXTURE_2D, this.str); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BIO_N, BIO_N, gl.RED, gl.UNSIGNED_BYTE, str);
  }

  /** fog of war (1 = seen) and the discovered species (their biofilm shows) */
  setVis(vis: Uint8Array, met: Uint8Array) {
    const gl = this.gl, v = new Uint8Array(vis.length);
    for (let i = 0; i < vis.length; i++) v[i] = vis[i] ? 255 : 0;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.vis); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, VIS_N, VIS_N, gl.RED, gl.UNSIGNED_BYTE, v);
    let changed = false;
    for (let i = 1; i < met.length && i < 256; i++) { const a = met[i] ? 255 : 0; if (this.palData[i * 4 + 3] !== a) { this.palData[i * 4 + 3] = a; changed = true; } }
    if (changed) { gl.bindTexture(gl.TEXTURE_2D, this.pal); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.palData); }
  }

  /** sizes the canvas (device px) and the low-res framebuffer (px device pixels per art pixel) */
  resize(w: number, h: number, px: number) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const fw = Math.ceil(w / px), fh = Math.ceil(h / px);
    this.outW = w; this.outH = h;
    if (fw === this.fbW && fh === this.fbH) return;
    this.fbW = fw; this.fbH = fh;
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private common(p: Prog, v: View, t: number) {
    const gl = this.gl;
    gl.useProgram(p.p);
    gl.uniform2f(p.u.u_cam, v.x, v.y); gl.uniform1f(p.u.u_zoom, v.zoom); gl.uniform2f(p.u.u_fb, this.fbW, this.fbH); gl.uniform1f(p.u.u_time, t);
  }
  private full() { const gl = this.gl; gl.bindVertexArray(this.vaoFull); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

  draw(v: View, t: number, deep: Batch, batches: Batch[], showBio: boolean, fog = true) {
    const gl = this.gl, W = this.world;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.fbW, this.fbH);
    gl.disable(gl.BLEND);
    // background
    this.common(this.bg, v, t);
    const vr = Math.max(this.fbW, this.fbH) / v.zoom;
    const near = <T extends { x: number; y: number }>(a: T[], n: number, pad: (q: T) => number) => a
      .map(q => ({ q, d: Math.hypot(q.x - v.x, q.y - v.y) - pad(q) })).filter(o => o.d < vr).sort((a2, b) => a2.d - b.d).slice(0, n).map(o => o.q);
    const L = near(W.lights, 32, q => q.r), lv = new Float32Array(96);
    L.forEach((l, i) => lv.set([l.x, l.y, l.r], i * 3));
    gl.uniform3fv(this.bg.u.u_lights, lv); gl.uniform1i(this.bg.u.u_nl, L.length);
    const V = near(W.vents, 16, q => q.r * 8), vv = new Float32Array(48);
    V.forEach((q, i) => vv.set([q.x, q.y, q.r], i * 3));
    gl.uniform3fv(this.bg.u.u_vents, vv); gl.uniform1i(this.bg.u.u_nv, V.length);
    gl.uniform1f(this.bg.u.u_world, WORLD);
    gl.uniform3fv(this.bg.u.u_water, this.water); gl.uniform3fv(this.bg.u.u_deep, this.deep);
    this.full();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // deep organisms, then marine snow
    this.sprites(v, t, deep);
    this.snow(v, t, 0.62, 30, 0.1, [0.35, 0.55, 0.55], 1);
    this.snow(v, t, 0.8, 26, 0.08, [0.6, 0.78, 0.72], 1.4);
    // biofilm
    if (showBio) {
      this.common(this.bio, v, t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.own);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.str);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.pal);
      gl.uniform1i(this.bio.u.u_own, 1); gl.uniform1i(this.bio.u.u_str, 2); gl.uniform1i(this.bio.u.u_pal, 3);
      gl.uniform1f(this.bio.u.u_bio, WORLD);
      gl.activeTexture(gl.TEXTURE0);
      this.full();
    }
    for (const b of batches) this.sprites(v, t, b);
    if (fog) {
      this.common(this.fog, v, t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vis);
      gl.uniform1i(this.fog.u.u_vis, 1); gl.uniform1f(this.fog.u.u_world, WORLD);
      gl.activeTexture(gl.TEXTURE0);
      this.full();
    }
    // bokeh above
    this.common(this.fg, v, t);
    this.full();
    // upscale
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.useProgram(this.blit.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.uniform1i(this.blit.u.u_tex, 0); gl.uniform2f(this.blit.u.u_fb, this.fbW, this.fbH); gl.uniform2f(this.blit.u.u_out, this.outW, this.outH);
    this.full();
  }
  private snow(v: View, t: number, depth: number, cell: number, density: number, col: number[], size: number) {
    const gl = this.gl;
    this.common(this.mid, v, t);
    gl.uniform1f(this.mid.u.u_depth, depth); gl.uniform1f(this.mid.u.u_cell, cell); gl.uniform1f(this.mid.u.u_density, density);
    gl.uniform3fv(this.mid.u.u_col, col); gl.uniform1f(this.mid.u.u_size, size);
    this.full();
  }
  private sprites(v: View, t: number, b: Batch) {
    if (!b.count) return;
    const gl = this.gl;
    this.common(this.sprite, v, t);
    gl.uniform1f(this.sprite.u.u_depth, b.depth);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.uniform1i(this.sprite.u.u_atlas, 0);
    gl.bindVertexArray(this.vaoSprite);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    const n = Math.min(b.count, MAX_INST);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, n * INST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  dispose() {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
