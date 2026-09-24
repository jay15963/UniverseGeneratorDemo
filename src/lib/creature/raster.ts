// Pixel-art rasterizer for procedural creatures.
//
// A creature is a painter's-ordered list of simple volumes (ellipses, tapered capsules, flat
// polygons). Each pixel keeps the pseudo-normal and the local (u, v) coordinates of the part that
// owns it, so a second pass can light it like a sculpted volume and quantise the result into a
// hand-picked colour ramp (ordered dithering on the ramp boundaries), add surface textures (scales,
// feathers, fur, chitin plates, cloth...), then draw pixel-art outlines: a selective outer outline
// (lighter on the lit side) and inner lines wherever a part overlaps another one.
import { hash3, vnoise, bayer } from '../terrain/noise';

export type RGB = [number, number, number];
export type Tex =
  | 'smooth' | 'scales' | 'fur' | 'feathers' | 'chitin' | 'plates' | 'skin' | 'fin' | 'cloth' | 'denim' | 'leather'
  | 'metal' | 'glass' | 'gel' | 'bone' | 'wood' | 'compound' | 'glow' | 'hair' | 'wool' | 'knit' | 'silk'
  // architecture (structures): u runs along the wall, v up it when a part carries a `uv` mapping
  | 'brick' | 'stone' | 'ashlar' | 'plank' | 'log' | 'thatch' | 'shingle' | 'tile' | 'adobe' | 'concrete' | 'panel'
  | 'corrugated' | 'glazing' | 'hex' | 'leafy' | 'crop' | 'soil' | 'snow' | 'paving' | 'grid' | 'water' | 'hide'
  // equipment: chain mail rings, quilted padding
  | 'mail' | 'quilt';

export interface Mat {
  ramp: RGB[];                  // 6 colours, dark -> light
  tex: Tex;
  alt?: RGB[];                  // pattern colour ramp
  belly?: RGB[];                // underside ramp (countershading)
  pattern?: ((x: number, y: number, u: number, v: number) => boolean) | null;
  spec?: number;                // specular strength 0..1
  emit?: boolean;               // self-lit
  alpha?: number;               // < 1: translucent (blends with what is behind)
  fuzz?: number;                // silhouette roughness in px (fur, moss, fluff)
  line?: RGB | null;            // outline colour override (null: never outlined)
  texScale?: number;
}

export type Shape =
  | { k: 'e'; x: number; y: number; rx: number; ry: number; a: number }
  | { k: 'c'; x1: number; y1: number; x2: number; y2: number; r1: number; r2: number }
  | { k: 'p'; pts: number[] };

export interface Part {
  s: Shape;
  m: Mat;
  g?: number;        // parts of the same group melt together (no inner line between them)
  dark?: number;     // shading multiplier (far-side limbs sit in shadow)
  noLine?: boolean;  // never casts inner lines on the parts behind it
  flat?: number;     // 0..1: flattens the normal (membranes, cloth panels)
  uv?: number[];     // polygons: texture coords u = a*x + b*y + c, v = d*x + e*y + f (default: the pixel position)
}

const L = (() => { const x = -0.45, y = -0.7, z = 0.56, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
const frac = (x: number) => x - Math.floor(x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const h01 = (x: number, y: number, s: number) => hash3(x, y, s) / 4294967296;

export function shapeBounds(s: Shape): [number, number, number, number] {
  if (s.k === 'e') { const r = Math.max(s.rx, s.ry) + 2; return [s.x - r, s.y - r, s.x + r, s.y + r]; }
  if (s.k === 'c') {
    const r = Math.max(s.r1, s.r2) + 2;
    return [Math.min(s.x1, s.x2) - r, Math.min(s.y1, s.y2) - r, Math.max(s.x1, s.x2) + r, Math.max(s.y1, s.y2) + r];
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]); }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
}

function inPoly(pts: number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Texture: lightness offset for a pixel of this material. */
function texDelta(m: Mat, x: number, y: number, u: number, v: number, nz: number): number {
  const s = m.texScale ?? 1;
  switch (m.tex) {
    case 'scales': {
      const k = 3.2 * s, row = Math.floor(v / k), uu = u / k + (row & 1) * 0.5;
      const fu = frac(uu), fv = v / k - row;
      if (fv > 0.6 + (fu - 0.5) * (fu - 0.5) * 1.4) return -0.2;
      return fv < 0.24 ? 0.07 : 0;
    }
    case 'feathers': {
      const k = 4.6 * s, row = Math.floor(u / k), vv = v / (k * 0.8) + (row & 1) * 0.5;
      const fv = frac(vv), fu = u / k - row;
      if (fu < 0.18 + (fv - 0.5) * (fv - 0.5) * 1.6) return -0.2;
      if (Math.abs(fv - 0.5) < 0.1 && fu > 0.35) return 0.06;
      return fu > 0.8 ? 0.06 : 0;
    }
    case 'wool': return (h01(x, y >> 1, 19) - 0.5) * 0.1 + ((x + y * 2) % 3 === 0 ? 0.06 : 0);
    case 'knit': return ((y % 2 === 0) !== (x % 2 === 0) ? 0.04 : -0.03) + (y % 3 === 0 ? -0.03 : 0);
    case 'silk': return Math.sin(u * 0.35 + v * 0.1) * 0.09;
    case 'fur': case 'hair':
      return (h01(x, y >> 1, 11) - 0.5) * 0.2 + (h01(x >> 1, y >> 2, 12) - 0.5) * 0.12 + (m.tex === 'hair' ? Math.sin(x * 1.3 + y * 0.4) * 0.05 : 0);
    case 'skin':
      return (vnoise(x / 3, y / 3, 13) - 0.5) * 0.1 - (h01(x, y, 14) > 0.97 ? 0.1 : 0);
    case 'chitin': {
      const fu = frac(u / (5 * s));
      return fu < 0.14 ? -0.26 : fu < 0.3 ? 0.12 : 0;
    }
    case 'plates': {
      const k = 6 * s, row = Math.floor(v / k), cu = u / k + (row & 1) * 0.5;
      const fu = frac(cu), fv = v / k - row;
      if (fu < 0.1 || fv < 0.12) return -0.24;
      return fv < 0.3 ? 0.1 : fu > 0.85 ? -0.06 : 0;
    }
    case 'fin': return frac(u / (2.6 * s)) < 0.34 ? 0.1 : -0.03;
    case 'cloth': return ((x + y) & 1 ? 0.018 : -0.018) + Math.sin(u * 0.7 + v * 0.23) * 0.05;
    case 'denim': return ((x ^ (y >> 1)) & 1 ? 0.035 : -0.035) + (h01(x, y, 15) - 0.5) * 0.05;
    case 'leather': return (vnoise(x / 2, y / 2, 16) - 0.5) * 0.12;
    case 'bone': return frac(u / (3.5 * s)) < 0.2 ? -0.06 : 0.02;
    case 'wood': return Math.sin(v * 1.6 + vnoise(u / 4, v, 17) * 3) * 0.06;
    case 'compound': return ((x + (y & 1)) % 2 === 0 && (y & 1) === 0) ? 0.18 : -0.05;
    case 'gel': return (vnoise(x / 2.5, y / 2.5, 18) - 0.5) * 0.18;
    case 'glass': return nz > 0.9 ? -0.1 : 0;
    case 'brick': {
      const bh = 2.4 * s, bw = 5 * s, row = Math.floor(v / bh), uu = u + (row & 1) * bw * 0.5;
      if (frac(v / bh) < 0.3 || frac(uu / bw) < 0.12) return -0.22;
      return (h01(Math.floor(uu / bw), row, 31) - 0.5) * 0.12;
    }
    case 'stone': {
      const bh = 3.6 * s, row = Math.floor(v / bh), bw = (4.5 + h01(row, 0, 32) * 3) * s, uu = u + h01(row, 1, 33) * 9;
      if (frac(v / bh) < 0.2 || frac(uu / bw) < 0.1) return -0.24;
      return (h01(Math.floor(uu / bw), row, 34) - 0.5) * 0.16 + (frac(v / bh) > 0.8 ? 0.05 : 0);
    }
    case 'ashlar': {
      const bh = 4 * s, bw = 8 * s, row = Math.floor(v / bh), uu = u + (row & 1) * bw * 0.5;
      if (frac(v / bh) < 0.12 || frac(uu / bw) < 0.06) return -0.16;
      return (h01(Math.floor(uu / bw), row, 35) - 0.5) * 0.06;
    }
    case 'plank': {
      const pw = 2.6 * s;
      if (frac(u / pw) < 0.18) return -0.2;
      return (h01(Math.floor(u / pw), 0, 36) - 0.5) * 0.1 + Math.sin(v * 1.3 + Math.floor(u / pw) * 2) * 0.03;
    }
    case 'log': {
      const lh = 2.8 * s, f = frac(v / lh);
      if (f < 0.14) return -0.24;
      return (0.5 - Math.abs(f - 0.55)) * 0.28 - 0.06;
    }
    case 'thatch': {
      const row = Math.floor(v / (3.2 * s));
      return (h01(Math.floor(u * 1.2), row, 38) - 0.5) * 0.26 + (frac(v / (3.2 * s)) < 0.2 ? -0.14 : 0);
    }
    case 'shingle': {
      const rh = 2.6 * s, sw = 3.2 * s, row = Math.floor(v / rh), uu = u + (row & 1) * sw * 0.5;
      const fu = frac(uu / sw), fv = frac(v / rh);
      if (fv < 0.22 + (fu - 0.5) * (fu - 0.5) * 0.9) return -0.2;
      return (h01(Math.floor(uu / sw), row, 40) - 0.5) * 0.1;
    }
    case 'tile': return Math.sin(frac(u / (2.6 * s)) * Math.PI) * 0.2 - 0.1 + (frac(v / (4 * s)) < 0.16 ? -0.14 : 0);
    case 'adobe': return (vnoise(u / 3, v / 3, 41) - 0.5) * 0.16 - (h01(Math.floor(u), Math.floor(v), 42) > 0.985 ? 0.12 : 0);
    case 'concrete':
      if (frac(u / (12 * s)) < 0.05 || frac(v / (9 * s)) < 0.06) return -0.12;
      return (h01(x, y, 43) - 0.5) * 0.05 + (vnoise(u / 5, v / 5, 44) - 0.5) * 0.06;
    case 'panel': {
      const fu = frac(u / (8 * s)), fv = frac(v / (6 * s));
      if (fu < 0.08 || fv < 0.1) return -0.18;
      return fu > 0.14 && fu < 0.22 && fv > 0.16 && fv < 0.3 ? 0.14 : 0;
    }
    case 'corrugated': return frac(u / (1.7 * s)) < 0.5 ? 0.08 : -0.07;
    case 'glazing':
      if (frac(u / (6 * s)) < 0.12 || frac(v / (5 * s)) < 0.14) return -0.3;
      return frac((u + v) * 0.09) < 0.14 ? 0.24 : 0;
    case 'hex': {
      const k = 4 * s, row = Math.floor(v / (k * 0.86)), uu = u / k + (row & 1) * 0.5;
      const fu = frac(uu), fv = frac(v / (k * 0.86));
      if (fv < 0.14 || Math.abs(fu - 0.5) > 0.42) return -0.2;
      return (h01(Math.floor(uu), row, 47) - 0.5) * 0.08;
    }
    case 'leafy': return (h01(x >> 1, y >> 1, 50) - 0.5) * 0.3 + (h01(x, y, 51) > 0.9 ? 0.12 : 0);
    case 'crop': return frac(u / (3 * s)) < 0.45 ? 0.12 + (h01(x, y, 52) - 0.5) * 0.1 : -0.12;
    case 'soil': return (h01(x, y, 53) - 0.5) * 0.12 + (frac(u / (3 * s)) < 0.3 ? -0.08 : 0);
    case 'snow': return (h01(x, y, 54) > 0.93 ? 0.06 : 0) + (vnoise(u / 8, v / 8, 55) - 0.5) * 0.05;
    case 'paving': {
      const k = 4 * s, row = Math.floor(v / k), uu = u + (row & 1) * k * 0.5;
      if (frac(v / k) < 0.15 || frac(uu / k) < 0.15) return -0.14;
      return (h01(Math.floor(uu / k), row, 58) - 0.5) * 0.08;
    }
    case 'grid': return frac(u / (3 * s)) < 0.18 || frac(v / (3 * s)) < 0.18 ? 0.16 : -0.04;
    case 'water': return Math.sin(u * 0.8 + Math.sin(v * 0.5) * 2) > 0.85 ? 0.2 : 0;
    case 'mail': return (y & 1) === 0 ? ((x + (y >> 1)) % 2 === 0 ? 0.2 : -0.12) : ((x + (y >> 1)) % 2 === 1 ? 0.06 : -0.2);
    case 'quilt': { const k = 4 * s; return frac((u + v) / k) < 0.14 || frac((u - v) / k) < 0.14 ? -0.16 : (vnoise(x / 3, y / 3, 60) - 0.5) * 0.06; }
    case 'hide': return (vnoise(u / 4, v / 4, 46) - 0.5) * 0.2 + (Math.abs(frac(u / (9 * s)) - 0.5) < 0.03 ? -0.14 : 0);
    default: return 0;
  }
}

export interface Raster { w: number; h: number; data: Uint8ClampedArray }

/** Rasterises parts (already in pixel space) into a w*h RGBA image. */
export function rasterize(parts: Part[], w: number, h: number): Raster {
  const N = w * h;
  const own = new Int16Array(N).fill(-1);
  const under = new Int16Array(N).fill(-1);
  const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N), U = new Float32Array(N), V = new Float32Array(N);
  const uU = new Float32Array(N), uV = new Float32Array(N), uNX = new Float32Array(N), uNY = new Float32Array(N), uNZ = new Float32Array(N);

  parts.forEach((pt, pi) => {
    const s = pt.s, fz = pt.m.fuzz ?? 0;
    const [bx0, by0, bx1, by1] = shapeBounds(s);
    const X0 = Math.max(0, Math.floor(bx0 - fz)), Y0 = Math.max(0, Math.floor(by0 - fz));
    const X1 = Math.min(w - 1, Math.ceil(bx1 + fz)), Y1 = Math.min(h - 1, Math.ceil(by1 + fz));
    let ca = 1, sa = 0, ax = 0, ay = 0, ll = 1;
    if (s.k === 'e') { ca = Math.cos(s.a); sa = Math.sin(s.a); }
    if (s.k === 'c') { ax = s.x2 - s.x1; ay = s.y2 - s.y1; ll = ax * ax + ay * ay || 1e-6; }
    // polygons get a soft dome normal around their centre so fins, sails and clothes read as volumes
    const pcx = (bx0 + bx1) / 2, pcy = (by0 + by1) / 2, phw = Math.max(1, (bx1 - bx0) / 2), phh = Math.max(1, (by1 - by0) / 2);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const edge = fz ? (h01(x, y, 21 + pi) - 0.5) * 2 * fz : 0;
      let nx = 0, ny = 0, nz = 1, u = px, v = py;
      if (s.k === 'e') {
        const dx = px - s.x, dy = py - s.y;
        const lx = (dx * ca + dy * sa) / s.rx, ly = (-dx * sa + dy * ca) / s.ry;
        const d = Math.sqrt(lx * lx + ly * ly);
        if (d > 1 + edge / Math.max(1, Math.min(s.rx, s.ry))) continue;
        const dc = Math.min(1, d);
        nx = lx * ca - ly * sa; ny = lx * sa + ly * ca; nz = Math.sqrt(1 - dc * dc);
        if (d > 1e-6 && d > 1) { nx /= d; ny /= d; }
        u = lx * s.rx; v = ly * s.ry;
      } else if (s.k === 'c') {
        const t = clamp(((px - s.x1) * ax + (py - s.y1) * ay) / ll, 0, 1);
        const cx = s.x1 + ax * t, cy = s.y1 + ay * t, r = Math.max(0.5, s.r1 + (s.r2 - s.r1) * t);
        const dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > r + edge) continue;
        const dn = Math.min(1, d / r);
        nx = d > 1e-6 ? (dx / d) * dn : 0; ny = d > 1e-6 ? (dy / d) * dn : 0; nz = Math.sqrt(1 - dn * dn);
        u = t * Math.sqrt(ll); v = (ax * dy - ay * dx) >= 0 ? d : -d;
      } else {
        if (!inPoly(s.pts, px, py)) continue;
        nx = ((px - pcx) / phw) * 0.62; ny = ((py - pcy) / phh) * 0.62; nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        if (pt.uv) { const q = pt.uv; u = q[0] * px + q[1] * py + q[2]; v = q[3] * px + q[4] * py + q[5]; }
      }
      const i = y * w + x;
      if (pt.m.alpha !== undefined && pt.m.alpha < 1 && own[i] >= 0) {
        under[i] = own[i]; uU[i] = U[i]; uV[i] = V[i]; uNX[i] = NX[i]; uNY[i] = NY[i]; uNZ[i] = NZ[i];
      } else under[i] = -1;
      own[i] = pi; NX[i] = nx; NY[i] = ny; NZ[i] = nz; U[i] = u; V[i] = v;
    }
  });

  const shade = (pi: number, x: number, y: number, nx0: number, ny0: number, nz0: number, u: number, v: number): RGB => {
    const pt = parts[pi], m = pt.m;
    let nx = nx0, ny = ny0, nz = nz0;
    if (pt.flat) { nx *= 1 - pt.flat; ny *= 1 - pt.flat; nz = nz + (1 - nz) * pt.flat; }
    const diff = nx * L[0] + ny * L[1] + nz * L[2];
    let val = 0.5 + 0.5 * diff;
    if (nx > 0.5 && nz < 0.8) val += (nx - 0.5) * 0.22;      // cool back-light on the right rim
    val += texDelta(m, x, y, u, v, nz);
    if (m.tex === 'metal') val = 0.5 + (val - 0.5) * 1.45;
    val *= pt.dark ?? 1;
    let ramp = m.ramp;
    if (m.belly && ny0 > 0.3 && nz0 < 0.97) ramp = m.belly;
    if (m.alt && m.pattern && m.pattern(x, y, u, v)) ramp = m.alt;
    const n = ramp.length - 1;
    if (m.emit) return ramp[clamp(Math.round(n * 0.55 + val * n * 0.5), 0, n)];
    let idx = clamp(Math.round(val * n + (bayer(x, y) - 0.5) * 0.42), 0, n);
    let c = ramp[idx];
    if (m.spec && diff > 0.94 - m.spec * 0.08) { idx = n; c = [c[0] + (255 - c[0]) * 0.5 * m.spec, c[1] + (255 - c[1]) * 0.5 * m.spec, c[2] + (255 - c[2]) * 0.5 * m.spec]; }
    if (m.tex === 'glass' && nx0 < -0.35 && ny0 < -0.25 && nz0 > 0.35 && nz0 < 0.8) c = [255, 255, 255];
    return c;
  };

  const out = new Uint8ClampedArray(N * 4);
  const alphaOf = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, pi = own[i];
    if (pi < 0) continue;
    let c = shade(pi, x, y, NX[i], NY[i], NZ[i], U[i], V[i]);
    let a = parts[pi].m.alpha ?? 1;
    if (a < 1 && under[i] >= 0) {
      const b = shade(under[i], x, y, uNX[i], uNY[i], uNZ[i], uU[i], uV[i]);
      c = [b[0] + (c[0] - b[0]) * a, b[1] + (c[1] - b[1]) * a, b[2] + (c[2] - b[2]) * a];
      a = 1;
    }
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = Math.round(a * 255);
    alphaOf[i] = a;
  }

  const lineOf = (pi: number, lit: boolean): RGB | null => {
    const m = parts[pi].m;
    if (m.line === null) return null;
    if (m.line) return m.line;
    const d = m.ramp[0];
    return lit ? [d[0] * 0.85, d[1] * 0.85, d[2] * 0.9] : [d[0] * 0.5, d[1] * 0.5, d[2] * 0.58];
  };
  // inner lines: pixels of a part right next to a part drawn in front of it
  const inner = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = own[i];
    if (a < 0) continue;
    let front = -1;
    for (const [dx, dy] of NB) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const b = own[yy * w + xx];
      if (b > a && b > front && !parts[b].noLine && (parts[b].g === undefined || parts[b].g !== parts[a].g) && (parts[b].m.alpha ?? 1) >= 0.9) front = b;
    }
    if (front >= 0) {
      const lc = lineOf(front, false);
      if (lc) { inner[i] = 1; out[i * 4] = out[i * 4] * 0.3 + lc[0] * 0.7; out[i * 4 + 1] = out[i * 4 + 1] * 0.3 + lc[1] * 0.7; out[i * 4 + 2] = out[i * 4 + 2] * 0.3 + lc[2] * 0.7; }
    }
  }
  // outer outline (selective: softer on the lit top-left side)
  const res = new Uint8ClampedArray(out);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (own[i] >= 0 && alphaOf[i] > 0.5) continue;
    let best = -1, lit = false;
    for (const [dx, dy] of NB) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx, b = own[j];
      if (b > best && alphaOf[j] > 0.5) { best = b; lit = dx > 0 || dy > 0; }
    }
    if (best < 0) continue;
    const lc = lineOf(best, lit);
    if (!lc) continue;
    res[i * 4] = lc[0]; res[i * 4 + 1] = lc[1]; res[i * 4 + 2] = lc[2]; res[i * 4 + 3] = 255;
  }
  return { w, h, data: res };
}
const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------------------------------------------------------------------------------------------
// Colour ramps
// ---------------------------------------------------------------------------------------------------
export function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 1) + 1) % 1; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
const hueTo = (a: number, b: number, t: number) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return a + d * t; };

/** Six-step pixel-art ramp: shadows drift towards violet-blue, highlights towards warm yellow. */
export function ramp(h: number, s: number, l: number, spread = 1): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const li = clamp(l + (t - 0.55) * 0.66 * spread, 0.04, 0.97);
    let hi = h;
    if (t < 0.5) hi = hueTo(h, 0.7, (0.5 - t) * 0.34);
    else hi = hueTo(h, 0.13, (t - 0.5) * 0.3);
    const si = clamp(s * (0.78 + Math.sin(Math.PI * t) * 0.35) - (t > 0.85 ? 0.08 : 0), 0, 1);
    out.push(hsl(hi, si, li));
  }
  return out;
}
export const rampRGB = (c: RGB, spread = 1): RGB[] => {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return ramp(h, s, l, spread);
};
export const darkenRamp = (r: RGB[], k: number): RGB[] => r.map(c => [c[0] * k, c[1] * k, c[2] * k] as RGB);
