// WebGL2 batched sprite renderer for the survival world.
//
// Everything is a textured quad: terrain rows come from per-chunk textures, sprites/particles from a
// shared atlas. The fragment shader can sample up to MAX_SLOTS textures, so a whole frame usually
// goes out in one to three draw calls. The "vision lens" is a per-fragment mask (dithered circle).

export interface TexRegion { tex: WebGLTexture; x: number; y: number; w: number; h: number; tw: number; th: number }

const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec4 a_col;
in float a_tex;
uniform vec4 u_view;   // camX, camY, scale (device px per world px), 0
uniform vec2 u_res;    // framebuffer size in device px
out vec2 v_uv;
out vec4 v_col;
flat out int v_tex;
void main() {
  vec2 p = floor((a_pos - u_view.xy) * u_view.z + u_res * 0.5 + 0.5);
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_col = a_col;
  v_tex = int(a_tex + 0.5);
}`;

function fragmentShader(slots: number) {
  let chain = '';
  for (let i = 0; i < slots; i++) chain += `${i ? 'else ' : ''}if (v_tex == ${i}) c = texture(u_tex[${i}], v_uv);\n`;
  return `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_col;
flat in int v_tex;
uniform sampler2D u_tex[${slots}];
uniform vec4 u_lens;   // x, y (GL window coords), radius, device px per world px (0 = off)
out vec4 o;
const float B[16] = float[16](0.0,8.0,2.0,10.0, 12.0,4.0,14.0,6.0, 3.0,11.0,1.0,9.0, 15.0,7.0,13.0,5.0);
void main() {
  vec4 c = vec4(0.0);
  ${chain}
  c *= v_col;
  if (c.a < 0.004) discard;
  if (u_lens.w > 0.0) {
    vec2 d = gl_FragCoord.xy - u_lens.xy;
    float r = length(vec2(d.x, d.y * 1.12));
    float band = 7.0 * u_lens.w;
    if (r > u_lens.z) discard;
    if (r > u_lens.z - band) {
      ivec2 q = ivec2(mod(floor(gl_FragCoord.xy / u_lens.w), 4.0));
      if ((r - (u_lens.z - band)) / band >= B[q.y * 4 + q.x] / 16.0) discard;
    }
  }
  o = c;
}`;
}

const FLOATS_PER_VERT = 6; // x, y, u, v, colour(packed), tex
const MAX_QUADS = 16384;

export class GLWorld {
  readonly gl: WebGL2RenderingContext;
  readonly slots: number;
  private prog: WebGLProgram;
  private vbo: WebGLBuffer;
  private data = new ArrayBuffer(MAX_QUADS * 4 * FLOATS_PER_VERT * 4);
  private f32 = new Float32Array(this.data);
  private u32 = new Uint32Array(this.data);
  private quads = 0;
  private bound: (WebGLTexture | null)[] = [];
  private slotOf = new Map<WebGLTexture, number>();
  private uView: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uLens: WebGLUniformLocation;
  private blendMode: 'normal' | 'add' = 'normal';
  // Vertex positions are stored relative to this origin (in JS doubles) so that float32 keeps
  // sub-pixel precision even millions of pixels away from the world origin.
  private ox = 0;
  private oy = 0;
  readonly maxTex: number;
  drawCalls = 0;

  // sprite atlas pages
  private pages: { tex: WebGLTexture; x: number; y: number; rowH: number }[] = [];
  private atlasMap = new WeakMap<HTMLCanvasElement, TexRegion>();
  private readonly PAGE = 2048;
  white!: TexRegion;

  /** `preserve`: keep the drawn frame readable after compositing (needed to record the canvas into a video) */
  static create(canvas: HTMLCanvasElement, preserve = false): GLWorld | null {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: preserve } as WebGLContextAttributes);
    // (no `desynchronized`: low-latency front-buffer mode shows the clear colour for a moment on heavy frames -> dark flicker)
    return gl ? new GLWorld(gl) : null;
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.slots = Math.min(16, gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentShader(this.slots)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    gl.useProgram(prog);
    this.uView = gl.getUniformLocation(prog, 'u_view')!;
    this.uRes = gl.getUniformLocation(prog, 'u_res')!;
    this.uLens = gl.getUniformLocation(prog, 'u_lens')!;
    gl.uniform1iv(gl.getUniformLocation(prog, 'u_tex'), Array.from({ length: this.slots }, (_, i) => i));

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    const attr = (name: string, size: number, type: number, norm: boolean, off: number) => {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, norm, stride, off);
    };
    attr('a_pos', 2, gl.FLOAT, false, 0);
    attr('a_uv', 2, gl.FLOAT, false, 8);
    attr('a_col', 4, gl.UNSIGNED_BYTE, true, 16);
    attr('a_tex', 1, gl.FLOAT, false, 20);
    // 32-bit indices (WebGL2 core)
    const ind = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0, v = 0; q < MAX_QUADS; q++, v += 4) ind.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    // 1x1 white texel for solid rectangles
    const w = document.createElement('canvas');
    w.width = 4; w.height = 4;
    const wc = w.getContext('2d')!; wc.fillStyle = '#fff'; wc.fillRect(0, 0, 4, 4);
    const r = this.atlas(w);
    this.white = { ...r, x: r.x + 1, y: r.y + 1, w: 1, h: 1 };
  }

  // ---------------------------------------------------------------------------
  // Textures
  // ---------------------------------------------------------------------------
  newTexture(w: number, h: number): WebGLTexture {
    this.flush(); // pending quads may reference the unit we are about to rebind
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.slotOf.clear(); this.bound.length = 0; // binding changed under us
    return t;
  }
  upload(t: WebGLTexture, x: number, y: number, w: number, h: number, px: Uint8ClampedArray | HTMLCanvasElement) {
    this.flush();
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (px instanceof HTMLCanvasElement) gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, px);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer, px.byteOffset, px.byteLength));
    this.slotOf.clear(); this.bound.length = 0;
  }
  deleteTexture(t: WebGLTexture) { this.flush(); this.gl.deleteTexture(t); this.slotOf.delete(t); this.bound = this.bound.map(b => (b === t ? null : b)); }

  /** Region of a canvas inside the sprite atlas (uploaded on first use). */
  atlas(c: HTMLCanvasElement): TexRegion {
    const hit = this.atlasMap.get(c);
    if (hit) return hit;
    const P = this.PAGE, pad = 1;
    let page = this.pages[this.pages.length - 1];
    const fits = (pg: typeof page) => pg && (pg.x + c.width + pad <= P ? pg.y + Math.max(pg.rowH, c.height + pad) <= P : pg.y + pg.rowH + c.height + pad <= P);
    if (!fits(page)) {
      page = { tex: this.newTexture(P, P), x: 0, y: 0, rowH: 0 };
      this.pages.push(page);
    }
    if (page.x + c.width + pad > P) { page.x = 0; page.y += page.rowH; page.rowH = 0; }
    const r: TexRegion = { tex: page.tex, x: page.x, y: page.y, w: c.width, h: c.height, tw: P, th: P };
    this.upload(page.tex, page.x, page.y, c.width, c.height, c);
    page.x += c.width + pad;
    page.rowH = Math.max(page.rowH, c.height + pad);
    this.atlasMap.set(c, r);
    return r;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  begin(camX: number, camY: number, scale: number, clear: [number, number, number]) {
    const gl = this.gl;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    gl.viewport(0, 0, W, H);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    this.ox = Math.round(camX); this.oy = Math.round(camY);
    gl.uniform4f(this.uView, camX - this.ox, camY - this.oy, scale, 0);
    gl.uniform2f(this.uRes, W, H);
    gl.uniform4f(this.uLens, 0, 0, 0, 0);
    this.drawCalls = 0;
    this.slotOf.clear(); this.bound.length = 0;
  }

  /** Enables the dithered lens mask (centre in device px, top-left origin; radius in device px) for subsequent draws; r = 0 disables. */
  lens(sx: number, sy: number, r: number, pxScale: number) {
    this.flush();
    const H = this.gl.drawingBufferHeight;
    this.gl.uniform4f(this.uLens, sx, H - sy, r, r > 0 ? Math.max(1, pxScale) : 0);
  }
  /** Sets the camera mid-frame (flushes first). */
  view(camX: number, camY: number, scale: number) {
    this.flush();
    this.ox = Math.round(camX); this.oy = Math.round(camY);
    this.gl.uniform4f(this.uView, camX - this.ox, camY - this.oy, scale, 0);
  }

  blend(mode: 'normal' | 'add') {
    if (mode === this.blendMode) return;
    this.flush();
    this.blendMode = mode;
    const gl = this.gl;
    if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private slot(t: WebGLTexture): number {
    let s = this.slotOf.get(t);
    if (s !== undefined) return s;
    if (this.slotOf.size >= this.slots) { this.flush(); this.slotOf.clear(); }
    s = this.slotOf.size;
    this.slotOf.set(t, s);
    const gl = this.gl;
    if (this.bound[s] !== t) { gl.activeTexture(gl.TEXTURE0 + s); gl.bindTexture(gl.TEXTURE_2D, t); this.bound[s] = t; }
    return s;
  }

  /** Textured quad. sx..sh in texture px, dx..dh in world px, colour premultiplied 0..255 packed ABGR. */
  quad(r: TexRegion, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, col = 0xffffffff) {
    const s = this.slot(r.tex);
    if (this.quads >= MAX_QUADS) this.flush();
    dx -= this.ox; dy -= this.oy;
    const u0 = (r.x + sx) / r.tw, v0 = (r.y + sy) / r.th, u1 = (r.x + sx + sw) / r.tw, v1 = (r.y + sy + sh) / r.th;
    let o = this.quads * 4 * FLOATS_PER_VERT;
    const f = this.f32, u = this.u32;
    f[o] = dx; f[o + 1] = dy; f[o + 2] = u0; f[o + 3] = v0; u[o + 4] = col; f[o + 5] = s; o += 6;
    f[o] = dx + dw; f[o + 1] = dy; f[o + 2] = u1; f[o + 3] = v0; u[o + 4] = col; f[o + 5] = s; o += 6;
    f[o] = dx + dw; f[o + 1] = dy + dh; f[o + 2] = u1; f[o + 3] = v1; u[o + 4] = col; f[o + 5] = s; o += 6;
    f[o] = dx; f[o + 1] = dy + dh; f[o + 2] = u0; f[o + 3] = v1; u[o + 4] = col; f[o + 5] = s;
    this.quads++;
  }
  /** Whole canvas (from the atlas) at world position. */
  sprite(c: HTMLCanvasElement, dx: number, dy: number, col = 0xffffffff, dw = c.width, dh = c.height) {
    const r = this.atlas(c);
    this.quad(r, 0, 0, r.w, r.h, dx, dy, dw, dh, col);
  }
  rect(x: number, y: number, w: number, h: number, col: number) {
    this.quad(this.white, 0, 0, 1, 1, x, y, w, h, col);
  }

  flush() {
    if (!this.quads) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.quads * 4 * FLOATS_PER_VERT);
    gl.drawElements(gl.TRIANGLES, this.quads * 6, gl.UNSIGNED_INT, 0);
    this.quads = 0;
    this.drawCalls++;
  }
}

/** Packs an RGBA colour (0..255, alpha 0..1) into premultiplied little-endian ABGR for vertex colours. */
export function rgba(r: number, g: number, b: number, a = 1): number {
  const A = Math.max(0, Math.min(1, a));
  return ((Math.round(A * 255) << 24) | (Math.round(b * A) << 16) | (Math.round(g * A) << 8) | Math.round(r * A)) >>> 0;
}
export const alphaTint = (a: number) => rgba(255, 255, 255, a);

const cssCache = new Map<string, [number, number, number, number]>();
/** Parses '#rrggbb' / 'rgba(r,g,b,a)' / 'rgb(r,g,b)' once and caches it. */
export function parseCss(css: string): [number, number, number, number] {
  let c = cssCache.get(css);
  if (c) return c;
  if (css.startsWith('#')) {
    const n = parseInt(css.slice(1, 7), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  } else {
    const m = css.match(/[\d.]+/g) ?? ['255', '255', '255'];
    c = [+m[0], +m[1], +m[2], m[3] !== undefined ? +m[3] : 1];
  }
  cssCache.set(css, c);
  return c;
}
