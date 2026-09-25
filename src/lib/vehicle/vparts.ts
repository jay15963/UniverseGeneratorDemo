// Vehicle vocabulary: palette and paint schemes, running gear (wheels, tracks, mechanical legs, hover, sledge runners,
// rollers, screw drives), lofted bodies (hulls, chassis, fuselages built from cross-sections) and small fittings.
// Everything is flat 2D pieces drafted per facing (structure/draft.ts) and painted by the creatures' rasterizer.
// Units: a citizen is ~9 tall; a = across (to the vehicle's right), y = up, f = forward (the nose).
// Painting order: depth inside a *level*; anything mounted on a body is drawn one level up so it is never hidden
// behind the body it sits on (see `at`).
import type { Mat, RGB } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { Ctx, facet } from '../structure/parts';
import { vnoise, hash3 } from '../terrain/noise';

export type VAnim = 'idle' | 'move' | 'use';
export interface Pal {
  paint: Mat; paint2: Mat; paint3: Mat; mil: Mat; mil2: Mat; mil3: Mat; navy: Mat; navy2: Mat; antifoul: Mat; boot: Mat;
  hull: Mat; deck: Mat; deckSteel: Mat; metal: Mat; steel: Mat; dark: Mat; tyre: Mat; rim: Mat; chrome: Mat;
  glass: Mat; glassDark: Mat; wood: Mat; plank: Mat; sail: Mat; sail2: Mat; rope: Mat; hide: Mat; wicker: Mat; bone: Mat;
  bronze: Mat; brass: Mat; canvas: Mat; glow: Mat; glow2: Mat; fire: Mat; fire2: Mat; flash: Mat; smoke: Mat; soot: Mat;
  steam: Mat; water: Mat; foam: Mat; dust: Mat; tracer: Mat; shadow: Mat;
}
export interface VCtx extends Ctx {
  anim: VAnim;
  /** design numbers of this vehicle (the same for every era, size, frame and facing) */
  d: number[];
  P: Pal;
  /** size multiplier of the tier (naval already x2) */
  Z: number;
  /** main paint (war scheme or civil colour), second paint, trim */
  body: Mat; body2: Mat; trim: Mat;
  war: boolean;
  /** commanded turret yaw relative to the hull (radians, + = towards +a); null = the turrets sweep on their own */
  aim: number | null;
  /** turret pivots, in vehicle coordinates, by turret id (the renderer exports them as mount points) */
  pivots: { id: number; p: V3 }[];
  /** where the draught beasts are harnessed (set by pulled carts; the preview puts a placeholder animal there) */
  hitch?: V3;
  /** the vehicle's name, set by the builder from its modules */
  label?: string;
}

export const frac = (v: number) => v - Math.floor(v);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => { const c = clamp01(v); return c * c * (3 - 2 * c); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const moving = (x: VCtx) => x.anim === 'move';
export const acting = (x: VCtx) => x.anim === 'use';
/** 8-frame loop index */
export const frameOf = (x: VCtx) => Math.round(x.t * 8) % 8;
/** 0..1 after the shot that lands on frame 4 (-1 before it / when not firing) */
export const shotAge = (x: VCtx) => (x.anim === 'use' && x.t >= 0.5 - 1e-6 ? (x.t - 0.5) * 2 : -1);
export const bob = (x: VCtx, amp: number) => Math.sin(x.ph) * amp;
/** weighted pick with a design number */
export function pick<T>(u: number, opts: [T, number][]): T {
  const tot = opts.reduce((s, o) => s + Math.max(0, o[1]), 0);
  let v = u * tot;
  for (const [o, w] of opts) { v -= Math.max(0, w); if (v <= 0 && w > 0) return o; }
  return opts.filter(o => o[1] > 0).pop()?.[0] ?? opts[0][0];
}
/** draw at a stacking level (things mounted on a body go one level above it) */
export function at<T>(x: VCtx, level: number, fn: () => T): T {
  const D = x.D, o = D.level;
  D.level = level;
  try { return fn(); } finally { D.level = o; }
}
export const up = <T,>(x: VCtx, fn: () => T) => at(x, x.D.level + 1, fn);

// ---------------------------------------------------------------------------------------------------
// Palette & paint schemes
// ---------------------------------------------------------------------------------------------------
const mk = (h: number, s: number, l: number, tex: Mat['tex'] = 'smooth', o: Partial<Mat> = {}): Mat => ({ ramp: ramp(h, s, l), tex, ...o });
const darker = (r: RGB[], k: number): RGB[] => r.map(c => [c[0] * k, c[1] * k, c[2] * k] as RGB);

export function palette(x: Ctx): Pal {
  const K = x.K, C = x.C, alien = C.mode === 'alien', e = x.e, p = C.params;
  const cold = p.temperature < 0.35, dry = p.water < 0.35, wet = p.water > 0.65;
  const milH = alien ? C.hues[1] : cold ? 0.58 : dry ? 0.1 : wet ? 0.27 : 0.2;
  const milS = alien ? 0.35 : cold ? 0.05 : dry ? 0.35 : 0.3, milL = cold ? 0.8 : dry ? 0.6 : 0.36;
  const navyH = alien ? C.hues[0] : 0.6;
  return {
    paint: mk(0, 0.5, 0.45), paint2: mk(alien ? C.hues[0] : 0.1, 0.12, 0.86, 'smooth', { spec: 0.3 }), paint3: mk(alien ? C.hues[2] : 0.02, 0.6, 0.42),
    mil: mk(milH, milS, milL, 'smooth', { spec: 0.1 }), mil2: mk(milH + 0.02, milS * 0.85, milL * 0.78), mil3: mk(cold ? 0.6 : dry ? 0.07 : 0.12, cold ? 0.05 : 0.3, cold ? 0.5 : 0.22),
    navy: mk(navyH, alien ? 0.2 : 0.06, 0.55, 'smooth', { spec: 0.2 }), navy2: mk(navyH, alien ? 0.2 : 0.07, 0.36), antifoul: mk(alien ? C.hues[2] : 0.01, 0.55, 0.36), boot: mk(0.64, 0.15, 0.13),
    hull: e <= 2 ? { ...K.wood, tex: 'plank' } : e <= 3 ? mk(0.62, 0.08, 0.25, 'metal', { spec: 0.25 }) : mk(navyH, 0.08, 0.45, 'smooth', { spec: 0.25 }),
    deck: mk(0.09, 0.35, 0.56, 'plank'), deckSteel: mk(navyH, 0.08, 0.32, 'smooth'),
    metal: K.metal, steel: mk(alien ? C.hues[0] : 0.6, 0.06, 0.62, 'metal', { spec: 0.6 }), dark: K.dark,
    tyre: mk(0.66, 0.08, 0.15, 'smooth', { spec: 0.15 }), rim: mk(0.6, 0.05, 0.66, 'metal', { spec: 0.6 }), chrome: mk(0.58, 0.08, 0.72, 'metal', { spec: 0.9 }),
    glass: mk(alien ? C.hues[2] : 0.56, 0.4, 0.55, 'glass', { spec: 0.8 }), glassDark: mk(alien ? C.hues[2] : 0.6, 0.35, 0.22, 'glass', { spec: 0.8 }),
    wood: K.wood, plank: { ...K.wood, tex: 'plank' },
    sail: mk(alien ? C.hues[2] : 0.11, alien ? 0.35 : 0.16, 0.86, 'cloth'), sail2: mk(alien ? C.hues[1] : 0.04, alien ? 0.55 : 0.5, 0.45, 'cloth'),
    rope: mk(0.09, 0.35, 0.36), hide: mk(0.07, 0.35, 0.5, 'hide'), wicker: mk(0.1, 0.45, 0.5, 'thatch'), bone: mk(0.12, 0.2, 0.8, 'bone'),
    bronze: mk(0.08, 0.6, 0.45, 'metal', { spec: 0.6 }), brass: mk(0.12, 0.65, 0.55, 'metal', { spec: 0.7 }), canvas: mk(alien ? C.hues[0] : 0.12, 0.2, 0.7, 'cloth'),
    glow: K.glow2, glow2: K.glow, fire: K.fire, fire2: K.fire2, flash: { ramp: ramp(0.14, 0.9, 0.82), tex: 'glow', emit: true, line: [255, 170, 60] },
    smoke: K.smoke, soot: K.soot, steam: mk(0.58, 0.05, 0.9, 'smooth', { line: [180, 185, 195] }),
    water: K.water, foam: mk(0.55, 0.15, 0.93, 'smooth', { line: null }), dust: mk(0.09, 0.2, 0.62, 'smooth', { line: [150, 130, 105] }),
    tracer: { ramp: ramp(0.1, 1, 0.7), tex: 'glow', emit: true, line: null }, shadow: { ramp: darker(ramp(0.66, 0.2, 0.2), 1), tex: 'smooth', alpha: 0.3, line: null },
  };
}

/** civil colours a builder can paint with (earth-like: plausible vehicle paints; alien: the culture's hues) */
export function civilPaint(x: VCtx, u: number, u2: number): [Mat, Mat] {
  const C = x.C;
  if (C.mode === 'alien') {
    const h = C.hues[Math.floor(u * 3) % 3];
    return [mk(h, 0.55, 0.5, 'smooth', { spec: 0.4 }), mk(C.hues[(Math.floor(u * 3) + 1) % 3], 0.4, 0.75, 'smooth', { spec: 0.3 })];
  }
  const cols: [number, number, number][] = [[0.0, 0.62, 0.44], [0.6, 0.55, 0.4], [0.12, 0.35, 0.8], [0.35, 0.4, 0.34], [0.66, 0.2, 0.18], [0.13, 0.75, 0.52], [0.07, 0.65, 0.48], [0.5, 0.45, 0.42], [0.97, 0.45, 0.32], [0.58, 0.1, 0.85], [0.1, 0.3, 0.3], [0.8, 0.3, 0.4]];
  const [h, s, l] = cols[Math.floor(u * cols.length) % cols.length];
  const two = cols[Math.floor(u2 * cols.length) % cols.length];
  const tone = u2 < 0.5 ? mk(0.1, 0.1, 0.88) : mk(two[0], two[1], two[2]);
  return [mk(h, s, l, 'smooth', { spec: x.e >= 4 ? 0.5 : 0.15 }), { ...tone, spec: 0.3 }];
}

export type Scheme = 'plain' | 'blotch' | 'stripes' | 'split' | 'tiger' | 'digital' | 'dazzle' | 'bands';
/** a war paint scheme: base colour with a pattern of a second colour (screen-space, stable per sprite) */
export function warPaint(x: VCtx, base: Mat, alt: Mat, scheme: Scheme, seed: number): Mat {
  const s = 1 + (seed % 7);
  let pattern: ((px: number, py: number) => boolean) | null = null;
  switch (scheme) {
    case 'blotch': pattern = (px, py) => vnoise(px / 9, py / 7, s) > 0.6; break;
    case 'stripes': pattern = (px, py) => Math.sin((px * 0.8 + py * 0.5) / 3.2 + vnoise(px / 14, py / 14, s) * 5) > 0.55; break;
    case 'tiger': pattern = (px, py) => Math.sin(px / 2.4 + vnoise(px / 10, py / 6, s) * 7) > 0.72; break;
    case 'split': pattern = (px, py) => vnoise(px / 22, py / 22, s) > 0.52; break;
    case 'digital': pattern = (px, py) => hash3(px >> 2, py >> 2, s) / 4294967296 < 0.3 + (vnoise(px / 16, py / 16, s) - 0.5) * 0.6; break;
    case 'dazzle': pattern = (px, py) => { const r = Math.floor(vnoise(px / 26, py / 26, s) * 3); const q = r === 0 ? px + py : r === 1 ? px - py * 1.5 : py * 2 - px * 0.3; return Math.floor(q / 7) % 2 === 0; }; break;
    case 'bands': pattern = (px, py) => Math.floor((py + px * 0.2) / 6) % 3 === 0; break;
    default: return base;
  }
  return { ...base, alt: alt.ramp, pattern };
}

// ---------------------------------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------------------------------
/** a horizontal-axis circle of points around `c` in the plane across `axis` */
export function circle(c: V3, r: number, axis: 'a' | 'f' | 'y', n = 14, rot = 0, r2 = r): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = rot + (i / n) * Math.PI * 2, s = Math.sin(t) * r, q = Math.cos(t) * r2;
    return axis === 'a' ? [c[0], c[1] + s, c[2] + q] as V3 : axis === 'f' ? [c[0] + q, c[1] + s, c[2]] as V3 : [c[0] + q, c[1], c[2] + s] as V3;
  });
}
/** a flat disc facing along `axis` (only when it faces the viewer unless two-sided) */
export function discFace(x: VCtx, c: V3, r: number, axis: 'a' | 'f' | 'y', m: Mat, key: number, g: number, sign = 1, n = 14, r2 = r) {
  const pts = circle(c, r, axis, n, 0, r2);
  const nrmv: V3 = axis === 'a' ? [sign, 0, 0] : axis === 'f' ? [0, 0, sign] : [0, sign, 0];
  if (x.D.facing(nrmv) < 0.02) return false;
  x.D.poly(pts, m, key, { g, dark: x.D.light(nrmv), flat: 0.85 });
  return true;
}
/** a thin rod (rigging, rails, antennas, struts) */
export const rod = (x: VCtx, a: V3, b: V3, r: number, m: Mat, key?: number) => x.D.cap(a, b, r, r, m, key ?? (x.D.depth(a) + x.D.depth(b)) / 2, { noLine: r < 0.3 });
/** a lamp that glows (headlights, beacons) */
export function light(x: VCtx, p: V3, r: number, m: Mat, key?: number, blink = false) {
  if (blink && frac(x.t * 2 + p[0] * 0.13) > 0.5) return;
  x.D.ell(p, r, r, m, key ?? x.D.depth(p) + 0.05, { g: x.D.group() });
}
/** the vehicle's shadow on the ground (airborne or hovering things) */
export function groundShadow(x: VCtx, W: number, L: number, y: number) {
  if (y < 0.3) return;
  const k = Math.max(0.55, 1 - y / 90);
  x.D.poly(circle([0, 0.02, 0], L * 0.5 * k, 'y', 18, 0, W * 0.5 * k), x.P.shadow, -1e5, { g: x.D.group(), flat: 1, noLine: true });
}
/** a flat shadow through an outline in (a, f) */
export function outlineShadow(x: VCtx, pts: [number, number][], y: number) {
  if (y < 0.3) return;
  const k = Math.max(0.6, 1 - y / 90);
  x.D.poly(pts.map(([a, f]) => [a * k, 0.02, f * k] as V3), x.P.shadow, -1e5, { g: x.D.group(), flat: 1, noLine: true });
}

// ---------------------------------------------------------------------------------------------------
// Lofted bodies: cross-sections along f (hulls, chassis, fuselages, pods)
// ---------------------------------------------------------------------------------------------------
export interface Station {
  f: number;
  /** half width at the widest point, bottom and top of the section */
  w: number; y0: number; y1: number;
  /** half widths at the bottom and top edges (default w * 0.8 and w * 0.85) */
  bw?: number; tw?: number;
  /** where the widest point is between y0 and y1 (0..1, default 0.45) */
  wy?: number;
  /** f of the bottom edge (raked bows / sterns; default f) */
  fb?: number;
}
export interface LoftOpts {
  /** roundness: 0 = hard chine (6-sided section), 1 = round (more sides) */
  round?: number; top?: Mat | null; ends?: Mat | null; bias?: number; key?: number;
  /** skip the bottom faces (hulls sitting in water, bodies on the ground) */
  open?: boolean;
  /** texture frame: 'along' = u across the section (planks run along the hull), 'across' = u along the body */
  tex?: 'along' | 'across';
  /** second material for the lower band (waterline paint, belly) and its top height */
  lower?: Mat; lowerY?: number;
}
function section(s: Station, round: number): [number, number, number][] {
  // right half, bottom to top: [a, y, fraction 0 bottom .. 1 top]
  const bw = s.bw ?? s.w * 0.8, tw = s.tw ?? s.w * 0.85, wy = s.wy ?? 0.45, ym = s.y0 + (s.y1 - s.y0) * wy;
  if (round < 0.5) return [[bw, s.y0, 0], [s.w, ym, wy], [tw, s.y1, 1]];
  const out: [number, number, number][] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI, c = Math.cos(t), sn = Math.sin(t);
    const lo = sn < 0, half = lo ? ym - s.y0 : s.y1 - ym, ww = lo ? lerp(s.w, bw, Math.abs(sn)) : lerp(s.w, tw, sn);
    const a = ww * Math.pow(c, 0.7) + (lo ? bw : tw) * 0.0, y = ym + Math.sign(sn) * half * Math.pow(Math.abs(sn), 0.9);
    out.push([Math.max(0.02, i === 0 ? Math.min(a, bw * 0.4) : i === n ? Math.min(a, tw * 0.4) : a), y, (y - s.y0) / Math.max(1e-6, s.y1 - s.y0)]);
  }
  return out;
}
/** drop consecutive duplicate points (a facet takes its normal from its first corners) */
export function clean(pts: V3[]): V3[] {
  const out: V3[] = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) > 1e-4) out.push(p); }
  while (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1e-4) break; out.pop(); }
  return out;
}
/** a body lofted through stations (front to back or back to front, any order); returns its sort key */
export function loft(x: VCtx, st: Station[], m: Mat, o: LoftOpts = {}): number {
  const D = x.D, round = o.round ?? 0, g = D.group();
  const secs = st.map(s => section(s, round));
  const fm = (st[0].f + st[st.length - 1].f) / 2, ymid = st.reduce((q, s) => q + (s.y0 + s.y1) / 2, 0) / st.length;
  const key = o.key ?? D.depth([0, ymid, fm]) + (o.bias ?? 0);
  const P = (i: number, j: number, side: number): V3 => {
    const s = st[i], [a, y, k] = secs[i][j];
    return [side * a, y, lerp(s.fb ?? s.f, s.f, k)];
  };
  const n = secs[0].length;
  for (const side of [-1, 1]) for (let i = 0; i + 1 < st.length; i++) for (let j = 0; j + 1 < n; j++) {
    if (o.open && j === 0 && round < 0.5) { /* keep the lower chine: it is the visible flare */ }
    const q: V3[] = o.tex === 'across' ? [P(i, j, side), P(i + 1, j, side), P(i + 1, j + 1, side), P(i, j + 1, side)] : [P(i, j, side), P(i, j + 1, side), P(i + 1, j + 1, side), P(i + 1, j, side)];
    const inside: V3 = [0, (st[i].y0 + st[i].y1) / 2, (st[i].f + st[i + 1].f) / 2];
    const yMid = (q[0][1] + q[2][1]) / 2, top = j + 1 === n - 1 && o.top !== undefined && o.top !== null && round < 0.5 ? null : null;
    void top;
    const mat = o.lower && yMid < (o.lowerY ?? 0) ? o.lower : m;
    const cq = clean(q);
    if (cq.length >= 3) facet(x, cq, mat, key, g, inside);
  }
  // top (deck / roof): the strip between the two top edges
  if (o.top !== null) {
    const topM = o.top ?? m;
    for (let i = 0; i + 1 < st.length; i++) {
      const q: V3[] = [P(i, n - 1, -1), P(i, n - 1, 1), P(i + 1, n - 1, 1), P(i + 1, n - 1, -1)];
      if (Math.abs(q[0][0] - q[1][0]) + Math.abs(q[3][0] - q[2][0]) < 0.05) continue;
      const cq = clean(q);
      if (cq.length >= 3) facet(x, cq, topM, key + 0.002, g, [0, st[i].y0 - 5, (st[i].f + st[i + 1].f) / 2]);
    }
  }
  // bottoms (only seen on flying things from below - rarely) and the end caps
  if (!o.open) for (let i = 0; i + 1 < st.length; i++) {
    const q = clean([P(i, 0, -1), P(i, 0, 1), P(i + 1, 0, 1), P(i + 1, 0, -1)]);
    if (q.length >= 3) facet(x, q, m, key, g, [0, st[i].y1 + 5, (st[i].f + st[i + 1].f) / 2]);
  }
  if (o.ends !== null) for (const i of [0, st.length - 1]) {
    const ring: V3[] = [];
    for (let j = 0; j < n; j++) ring.push(P(i, j, 1));
    for (let j = n - 1; j >= 0; j--) ring.push(P(i, j, -1));
    const wsum = secs[i].reduce((q, v) => q + v[0], 0);
    if (wsum < 0.3) continue;
    const other = i === 0 ? st[1].f : st[st.length - 2].f, cr = clean(ring);
    if (cr.length >= 3) facet(x, cr, o.ends ?? m, key + 0.001, g, [0, (st[i].y0 + st[i].y1) / 2, other]);
  }
  return key;
}
/** a simple rounded pod along f (cabins, fuel tanks, engine nacelles, envelopes) as one shaded silhouette */
export function pod(x: VCtx, c: V3, W: number, L: number, H: number, m: Mat, key?: number, nose = 1, tail = 1) {
  const D = x.D, pts: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10, f = c[2] - L / 2 + L * k, rr = Math.pow(Math.sin(Math.PI * k), k > 0.5 ? 0.5 * nose : 0.5 * tail);
    for (let j = 0; j < 12; j++) { const t = (j / 12) * Math.PI * 2; pts.push([c[0] + Math.cos(t) * (W / 2) * rr, c[1] + Math.sin(t) * (H / 2) * rr, f]); }
  }
  D.hull(pts, m, key ?? D.depth(c), { g: D.group(), flat: 0 });
}
/** a sphere-ish dome over a horizontal ellipse (canopies, turret domes, cupolas) */
export function dome(x: VCtx, c: V3, rw: number, rl: number, h: number, m: Mat, key?: number) {
  const D = x.D, pts: V3[] = [];
  for (let i = 0; i <= 4; i++) { const k = i / 4, s = Math.cos((k * Math.PI) / 2), y = c[1] + Math.sin((k * Math.PI) / 2) * h; for (let j = 0; j < 14; j++) { const t = (j / 14) * Math.PI * 2; pts.push([c[0] + Math.sin(t) * rw * s, y, c[2] + Math.cos(t) * rl * s]); } }
  D.hull(pts, m, key ?? D.depth(c) + 0.05, { g: D.group(), flat: 0.05 });
}
/** a box volume with sloped faces (prism with a smaller top), returned key */
export function block(x: VCtx, a0: number, f0: number, a1: number, f1: number, y0: number, y1: number, m: Mat, top: Mat | null = m, o: { slopeF?: number; slopeB?: number; slopeS?: number; bias?: number } = {}) {
  const sf = o.slopeF ?? 0, sb = o.slopeB ?? 0, ss = o.slopeS ?? 0, h = y1 - y0;
  const st: Station[] = [
    { f: f1 - sf * h, fb: f1, w: (a1 - a0) / 2, bw: (a1 - a0) / 2, tw: (a1 - a0) / 2 - ss * h, wy: 0, y0, y1 },
    { f: f0 + sb * h, fb: f0, w: (a1 - a0) / 2, bw: (a1 - a0) / 2, tw: (a1 - a0) / 2 - ss * h, wy: 0, y0, y1 },
  ];
  const ca = (a0 + a1) / 2;
  if (Math.abs(ca) > 1e-6) return offsetA(x, ca, () => loft(x, st, m, { top, bias: o.bias }));
  return loft(x, st, m, { top, bias: o.bias });
}
/** draw with every anchor (and normal) passed through a transform: rotated turrets, pitched bodies, offset lofts */
export function transformed<T>(x: VCtx, T: (p: V3) => V3, Tn: (n: V3) => V3, fn: () => T): T {
  type Fn = (v: V3) => unknown;
  const D = x.D as unknown as Record<'P' | 'depth' | 'facing' | 'light', Fn>;
  const P0 = D.P, d0 = D.depth, f0 = D.facing, l0 = D.light;
  D.P = (p: V3) => P0.call(x.D, T(p)); D.depth = (p: V3) => d0.call(x.D, T(p));
  D.facing = (n: V3) => f0.call(x.D, Tn(n)); D.light = (n: V3) => l0.call(x.D, Tn(n));
  try { return fn(); } finally { D.P = P0; D.depth = d0; D.facing = f0; D.light = l0; }
}
/** draw something shifted across (a) - lofts are centred on a = 0 */
export const offsetA = <T,>(x: VCtx, da: number, fn: () => T): T => transformed(x, p => [p[0] + da, p[1], p[2]], n => n, fn);
/** a local frame turned by `yaw` (+ = to the right) around (ca, cf), raised to y0 */
export function yawFrame(ca: number, y0: number, cf: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { T: (p: V3): V3 => [ca + p[0] * c + p[2] * s, y0 + p[1], cf - p[0] * s + p[2] * c], Tn: (n: V3): V3 => [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c] };
}
/** a local frame pitched by `pitch` (+ = nose up) around (0, cy, cf) */
export function pitchFrame(cy: number, cf: number, pitch: number) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return { T: (p: V3): V3 => [p[0], cy + (p[1] - cy) * c + (p[2] - cf) * s, cf - (p[1] - cy) * s + (p[2] - cf) * c], Tn: (n: V3): V3 => [n[0], n[1] * c + n[2] * s, -n[1] * s + n[2] * c] };
}
/** a band of windows on one face (glass strip with mullions) */
export function windowBand(x: VCtx, p0: V3, p1: V3, h: number, n: number, m: Mat, key: number, frame?: Mat) {
  const D = x.D, nv: V3 = [p1[2] - p0[2], 0, -(p1[0] - p0[0])];
  const n0 = nrm(nv), outward = D.facing(n0) > 0 ? n0 : ([-n0[0], 0, -n0[2]] as V3);
  if (D.facing(outward) < 0.03) return;
  const off: V3 = [outward[0] * 0.06, 0, outward[2] * 0.06];
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.12) / n, t1 = (i + 0.88) / n;
    const a = add([lerp(p0[0], p1[0], t0), p0[1], lerp(p0[2], p1[2], t0)], off), b = add([lerp(p0[0], p1[0], t1), p0[1], lerp(p0[2], p1[2], t1)], off);
    D.poly([a, b, [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]]], m, key, { g: D.group(), flat: 0.9, dark: D.light(outward) });
  }
  if (frame) D.cap(add(p0, off), add(p1, off), 0.18, 0.18, frame, key + 0.001, { noLine: true });
}
/** round portholes along a face */
export function portholes(x: VCtx, p0: V3, p1: V3, n: number, r: number, m: Mat, key: number) {
  const D = x.D, nv: V3 = nrm([p1[2] - p0[2], 0, -(p1[0] - p0[0])]);
  const out = D.facing(nv) > 0 ? nv : ([-nv[0], 0, -nv[2]] as V3);
  if (D.facing(out) < 0.05) return;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; D.ell([lerp(p0[0], p1[0], t) + out[0] * 0.08, p0[1], lerp(p0[2], p1[2], t) + out[2] * 0.08], r, r, m, key, { g: D.group(), noLine: true }); }
}
/** a railing along a polyline (posts + top rail) */
export function railing(x: VCtx, pts: V3[], h: number, m: Mat, every = 2) {
  const D = x.D;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / every)), key = (D.depth(a) + D.depth(b)) / 2;
    D.cap([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.14, 0.14, m, key + 0.01, { noLine: true });
    for (let k = 0; k < n; k++) { const t = k / n, p: V3 = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; D.cap(p, [p[0], p[1] + h, p[2]], 0.1, 0.1, m, key, { noLine: true }); }
  }
}

// ---------------------------------------------------------------------------------------------------
// Running gear
// ---------------------------------------------------------------------------------------------------
export type WheelStyle = 'spoke' | 'disk' | 'iron' | 'tyre' | 'lug' | 'hubless' | 'ball' | 'roller' | 'bone';
/** one wheel: axle across (a), centre c; `side` = which face looks outwards (+1 right, -1 left) */
export function wheel(x: VCtx, c: V3, r: number, w: number, side: number, spin: number, style: WheelStyle, hubM?: Mat) {
  const D = x.D, P = x.P, key = D.depth(c), g = D.group();
  const ring = (rr: number, aa: number) => circle([aa, c[1], c[2]], rr, 'a', 16, spin);
  if (style === 'ball') {
    D.ell(c, r, r, hubM ?? P.chrome, key, { g });
    for (let i = 0; i < 2; i++) { const t = spin * 1.5 + i * Math.PI; D.ell([c[0] + side * r * 0.2, c[1] + Math.sin(t) * r * 0.55, c[2] + Math.cos(t) * r * 0.55], r * 0.28, r * 0.2, P.glow, key + 0.01, { g: D.group(), noLine: true }); }
    return;
  }
  if (style === 'roller') { D.cap([c[0] - w / 2, c[1], c[2]], [c[0] + w / 2, c[1], c[2]], r, r, x.K.trunk, key, { g }); return; }
  const oa = c[0] + (side * w) / 2, ia = c[0] - (side * w) / 2, vis = D.facing([side, 0, 0]) > 0.02;
  if (style === 'spoke' || style === 'iron' || style === 'bone') {
    // see-through wheel: a rim of short segments, spokes, a hub
    const rimM = style === 'iron' ? P.steel : style === 'bone' ? P.bone : P.wood, tyreM = style === 'bone' ? P.bone : P.dark;
    const pts = ring(r - 0.25, c[0]);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; D.cap(a, b, Math.max(0.35, w * 0.45), Math.max(0.35, w * 0.45), rimM, key, { g }); }
    if (style !== 'bone') for (let i = 0; i < pts.length; i += 2) { const a = pts[i], b = pts[(i + 2) % pts.length]; D.cap([oa, a[1] + (a[1] - c[1]) * 0.06, a[2] + (a[2] - c[2]) * 0.06], [oa, b[1] + (b[1] - c[1]) * 0.06, b[2] + (b[2] - c[2]) * 0.06], 0.22, 0.22, tyreM, key + 0.001, { noLine: true }); }
    const ns = style === 'iron' ? 10 : style === 'bone' ? 4 : 8;
    for (let i = 0; i < ns; i++) { const t = spin + (i / ns) * Math.PI * 2; D.cap([vis ? oa : c[0], c[1], c[2]], [c[0], c[1] + Math.sin(t) * (r - 0.4), c[2] + Math.cos(t) * (r - 0.4)], 0.28, 0.24, rimM, key + 0.002, { noLine: true }); }
    if (style === 'iron') for (let i = 0; i < 12; i++) { const t = spin + (i / 12) * Math.PI * 2; D.cap([c[0] - w / 2, c[1] + Math.sin(t) * r, c[2] + Math.cos(t) * r], [c[0] + w / 2, c[1] + Math.sin(t) * r, c[2] + Math.cos(t) * r], 0.25, 0.25, P.dark, key + 0.003, { noLine: true }); }
    D.ell([vis ? oa + side * 0.3 : c[0], c[1], c[2]], Math.max(0.6, r * 0.2), Math.max(0.6, r * 0.2), style === 'bone' ? P.bone : P.steel, key + 0.004, { g: D.group() });
    return;
  }
  // solid wheels: a tyre drum + the outer face
  const pts = [...ring(r, oa), ...ring(r, ia)];
  D.hull(pts, style === 'disk' ? P.plank : P.tyre, key, { g, flat: 0.35 });
  if (!vis) return;
  const face = (rr: number, m: Mat, b: number, n = 16) => discFace(x, [oa + side * 0.05 * (1 + b * 20), c[1], c[2]], rr, 'a', m, key + b, g, side, n);
  if (style === 'disk') {
    face(r * 0.96, P.plank, 0.001);
    for (let i = 0; i < 2; i++) { const t = spin + (i ? Math.PI / 2 : 0); D.cap([oa + side * 0.2, c[1] + Math.sin(t) * r * 0.85, c[2] + Math.cos(t) * r * 0.85], [oa + side * 0.2, c[1] - Math.sin(t) * r * 0.85, c[2] - Math.cos(t) * r * 0.85], 0.25, 0.25, P.dark, key + 0.002, { noLine: true }); }
    D.ell([oa + side * 0.3, c[1], c[2]], r * 0.22, r * 0.22, P.wood, key + 0.003, { g: D.group() });
    return;
  }
  if (style === 'hubless') {
    face(r * 0.8, P.dark, 0.001);
    for (let i = 0; i < 12; i++) { const t = spin + (i / 12) * Math.PI * 2; if (i % 2) continue; D.ell([oa + side * 0.2, c[1] + Math.sin(t) * r * 0.8, c[2] + Math.cos(t) * r * 0.8], 0.45, 0.45, P.glow, key + 0.002, { g: D.group(), noLine: true }); }
    return;
  }
  // rubber tyre: sidewall, rim, hub and bolts (turning), lugs on off-road tyres
  face(r * 0.96, P.tyre, 0.001);
  face(r * (style === 'lug' ? 0.55 : 0.62), hubM ?? P.rim, 0.002);
  D.ell([oa + side * 0.2, c[1], c[2]], r * 0.18, r * 0.18, P.dark, key + 0.003, { g: D.group() });
  const nb = 5;
  for (let i = 0; i < nb; i++) { const t = spin + (i / nb) * Math.PI * 2; D.ell([oa + side * 0.2, c[1] + Math.sin(t) * r * 0.36, c[2] + Math.cos(t) * r * 0.36], 0.28, 0.28, P.dark, key + 0.004, { g: D.group(), noLine: true }); }
  if (style === 'lug') for (let i = 0; i < 10; i++) { const t = spin + (i / 10) * Math.PI * 2; D.cap([oa, c[1] + Math.sin(t) * r * 0.99, c[2] + Math.cos(t) * r * 0.99], [ia, c[1] + Math.sin(t) * r * 0.99, c[2] + Math.cos(t) * r * 0.99], 0.4, 0.4, P.tyre, key - 0.001, { noLine: true }); }
}
/** a row of wheels on both sides at the given f positions (axle height = r) */
export function wheelRow(x: VCtx, W: number, fs: number[], r: number, w: number, style: WheelStyle, hubM?: Mat, y = r) {
  const spin = moving(x) ? -x.ph * (style === 'spoke' || style === 'iron' ? 0.25 : 0.5) : 0;
  for (const s of [-1, 1]) for (const f of fs) wheel(x, [s * (W / 2 + w / 2), y, f], r, w, s, spin, style, hubM);
}
/** caterpillar tracks: a band around sprocket, idler and road wheels, links crawling while moving; optional skirt */
export function tracks(x: VCtx, W: number, L: number, R: number, tw: number, o: { skirt?: Mat | null; wheels?: number; style?: 'steel' | 'rubber' | 'glow'; lift?: number; y?: number } = {}) {
  const D = x.D, P = x.P, y0 = o.y ?? 0, crawl = moving(x) ? frac(x.t * 2) : 0, nw = o.wheels ?? Math.max(3, Math.round(L / (R * 1.5)));
  const lift = o.lift ?? 0.35, style = o.style ?? 'steel';
  for (const s of [-1, 1]) {
    const a = s * (W / 2 + tw / 2), oa = a + (s * tw) / 2, vis = D.facing([s, 0, 0]) > 0.02;
    // the loop in (y, f): rear sprocket, raised front idler, straight top run
    const fr = L / 2 - R, rr = -L / 2 + R;
    const loop: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const t = -Math.PI / 2 + (i / 8) * Math.PI; loop.push([y0 + R + R * lift + Math.sin(t) * R, fr + Math.cos(t) * R]); }
    for (let i = 0; i <= 8; i++) { const t = Math.PI / 2 + (i / 8) * Math.PI; loop.push([y0 + R + Math.sin(t) * R, rr + Math.cos(t) * R]); }
    const key = D.depth([a, y0 + R, 0]), g = D.group();
    D.hull([...loop.map(([y, f]) => [a - tw / 2, y, f] as V3), ...loop.map(([y, f]) => [a + tw / 2, y, f] as V3)], P.tyre, key, { g, flat: 0.3 });
    if (!vis) continue;
    // inner face (dark) and the running gear on it
    D.poly(loop.map(([y, f]) => [oa + s * 0.02, y0 + R + (y - y0 - R) * 0.78, f * 0.97] as V3), P.dark, key + 0.001, { g, flat: 0.9, dark: 0.8 });
    const wheelM = style === 'glow' ? P.metal : P.steel;
    for (let i = 0; i < nw; i++) { const f = rr + ((fr - rr) * i) / (nw - 1); discFace(x, [oa + s * 0.1, y0 + R * 0.78, f], R * 0.62, 'a', wheelM, key + 0.002, D.group(), s, 12); D.ell([oa + s * 0.2, y0 + R * 0.78, f], R * 0.2, R * 0.2, P.dark, key + 0.003, { g: D.group(), noLine: true }); }
    discFace(x, [oa + s * 0.1, y0 + R + R * lift, fr], R * 0.7, 'a', wheelM, key + 0.002, D.group(), s, 12);
    // toothed drive sprocket at the back
    for (let i = 0; i < 8; i++) { const t = (moving(x) ? -x.ph : 0) + (i / 8) * Math.PI * 2; D.ell([oa + s * 0.15, y0 + R + Math.sin(t) * R * 0.72, rr + Math.cos(t) * R * 0.72], 0.4, 0.4, P.dark, key + 0.0025, { g: D.group(), noLine: true }); }
    discFace(x, [oa + s * 0.15, y0 + R, rr], R * 0.55, 'a', wheelM, key + 0.003, D.group(), s, 12);
    // return rollers and links crawling along the top run and around
    const per = loop.length, links = Math.max(8, Math.round(L / 1.3));
    for (let i = 0; i < links; i++) {
      const u = frac(i / links + crawl / links * 2) * (per - 1), k = Math.floor(u), q = u - k, p0 = loop[k], p1 = loop[Math.min(per - 1, k + 1)];
      const y = lerp(p0[0], p1[0], q), f = lerp(p0[1], p1[1], q);
      D.cap([a - tw / 2, y, f], [a + tw / 2, y, f], 0.3, 0.3, style === 'glow' ? P.glow : P.dark, key + 0.0005, { noLine: true });
    }
    if (o.skirt) {
      const sy0 = y0 + R * 1.2, sy1 = y0 + 2 * R + R * lift + 0.3;
      facet(x, [[oa + s * 0.25, sy0, -L / 2 + 0.3], [oa + s * 0.25, sy0, L / 2 - R * 0.6], [oa + s * 0.15, sy1, L / 2 - R * 0.2], [oa + s * 0.15, sy1, -L / 2]], o.skirt, key + 0.005, D.group(), [a, sy0, 0], true);
    }
  }
}
export type LegStyle = 'mammal' | 'bird' | 'insect' | 'strider';
/** mechanical legs: pairs along f, trotting (4), tripod gait (6) or striding (2); pistons and feet */
export function legs(x: VCtx, W: number, fs: number[], hipY: number, reach: number, thick: number, m: Mat, style: LegStyle = 'mammal', foot: 'pad' | 'claw' | 'hoof' = 'pad') {
  const D = x.D, P = x.P, walk = moving(x);
  fs.forEach((f0, i) => {
    for (const s of [-1, 1]) {
      const phase = x.ph + (fs.length === 3 ? (i % 2 ? Math.PI : 0) + (s > 0 ? Math.PI : 0) : (i % 2 ? Math.PI : 0) + (s > 0 ? Math.PI : 0));
      const step = walk ? Math.sin(phase) * reach * 0.32 : 0, lift = walk ? Math.max(0, Math.cos(phase)) * reach * 0.22 : 0;
      const spread = style === 'insect' ? reach * 0.75 : style === 'strider' ? reach * 0.1 : reach * 0.16;
      const hip: V3 = [s * W / 2, hipY, f0], ft: V3 = [s * (W / 2 + spread), lift, f0 + step];
      const mid: V3 = [(hip[0] + ft[0]) / 2, (hip[1] + ft[1]) / 2, (hip[2] + ft[2]) / 2];
      const knee: V3 = style === 'insect' ? [s * (W / 2 + spread * 0.7), hipY + reach * 0.3, f0 + step * 0.5]
        : style === 'bird' ? [mid[0] + s * 0.4, mid[1] + reach * 0.05, mid[2] - reach * 0.3]
          : [mid[0] + s * 0.3, mid[1], mid[2] + reach * 0.28];
      const key = D.depth(knee), g = D.group();
      D.cap(hip, knee, thick, thick * 0.8, m, key, { g });
      D.cap(knee, ft, thick * 0.8, thick * 0.55, m, key + 0.001, { g: D.group() });
      // a piston along the thigh and a joint cap
      D.cap([hip[0] + s * thick * 0.6, hip[1] - thick * 0.3, hip[2]], [knee[0] + s * thick * 0.6, knee[1] + thick * 0.2, knee[2]], thick * 0.3, thick * 0.3, P.steel, key + 0.0015, { noLine: true });
      D.ell(knee, thick * 1.05, thick * 1.05, P.dark, key + 0.002, { g: D.group() });
      D.ell(hip, thick * 1.2, thick * 1.2, P.dark, key - 0.001, { g: D.group() });
      if (foot === 'claw') for (const q of [-1, 0, 1]) D.cap([ft[0], ft[1] + thick * 0.5, ft[2]], [ft[0] + q * thick, ft[1], ft[2] + thick * 1.4 * (q ? 0.7 : 1)], thick * 0.35, thick * 0.15, P.dark, key + 0.003, { noLine: true });
      else D.ell([ft[0], ft[1] + thick * 0.35, ft[2] + (foot === 'hoof' ? 0 : thick * 0.3)], thick * (foot === 'hoof' ? 0.9 : 1.4), thick * 0.55, P.dark, key + 0.003, { g: D.group() });
    }
  });
}
export type HoverStyle = 'pads' | 'skirt' | 'ring' | 'antigrav';
/** hovering: glowing pads, a rubber skirt (hovercraft), a glowing ring or an anti-gravity field; spray/dust below */
export function hover(x: VCtx, W: number, L: number, y: number, style: HoverStyle, water = false) {
  const D = x.D, P = x.P, pulse = 0.85 + 0.15 * Math.sin(x.ph * 2);
  if (style === 'skirt') {
    const pts: V3[] = [];
    for (let i = 0; i < 20; i++) { const t = (i / 20) * Math.PI * 2; for (const yy of [0.1, y]) pts.push([Math.cos(t) * W * 0.55, yy, Math.sin(t) * L * 0.52]); }
    D.hull(pts, { ...P.tyre, tex: 'quilt' }, D.depth([0, y / 2, 0]) - 0.01, { g: D.group(), flat: 0.2 });
  } else if (style === 'pads') {
    for (const s of [-1, 1]) for (const f of [-L * 0.3, L * 0.3]) {
      const c: V3 = [s * W * 0.34, y - 0.3, f];
      D.ell(c, W * 0.2, 0.8, P.metal, D.depth(c) - 0.02, { g: D.group() });
      D.ell([c[0], y * 0.45, f], W * 0.15 * pulse, y * 0.4, { ...P.glow, alpha: 0.45, line: null }, D.depth(c) - 0.03, { g: D.group() });
    }
  } else if (style === 'ring') {
    const pts = circle([0, y * 0.5, 0], L * 0.45, 'y', 18, x.ph * 0.3, W * 0.5);
    D.poly(pts, { ...P.glow, alpha: 0.4, line: null }, D.depth([0, y * 0.5, 0]) - 0.05, { g: D.group(), flat: 1 });
  } else {
    D.poly(circle([0, 0.05, 0], L * 0.5 * pulse, 'y', 18, 0, W * 0.5 * pulse), { ...P.glow, alpha: 0.25, line: null }, -1e5 + 1, { g: D.group(), flat: 1 });
    for (let i = 0; i < 5; i++) { const k = frac(x.t + i / 5); D.ell([Math.cos(i * 2.4) * W * 0.3, y * (1 - k), Math.sin(i * 2.4) * L * 0.3], 0.35, 0.35, P.glow, D.depth([0, 0, 0]) - 0.05, { g: D.group(), noLine: true }); }
  }
  // spray over water, dust over land
  if (style !== 'antigrav') for (let i = 0; i < 6; i++) { const k = frac(x.t + i / 6), t = i * 1.05; D.ell([Math.cos(t) * W * (0.5 + k * 0.3), 0.3 + k * 1.5, Math.sin(t) * L * (0.45 + k * 0.2)], 0.9 + k * 1.4, 0.6 + k, water ? P.foam : P.dust, -900 + i, { g: D.group(), noLine: true }); }
}
/** sledge runners curving up at the front */
export function runners(x: VCtx, W: number, L: number, m: Mat) {
  const D = x.D;
  for (const s of [-1, 1]) {
    const a = (s * W) / 2, pts: V3[] = [[a, 0.4, -L / 2], [a, 0.3, L * 0.3], [a, 1.2, L * 0.46], [a, 2.6, L / 2]];
    for (let i = 0; i + 1 < pts.length; i++) D.cap(pts[i], pts[i + 1], 0.45, 0.45, m, D.depth([a, 1, 0]));
    for (const f of [-L * 0.3, 0, L * 0.25]) D.cap([a, 0.4, f], [a, 2.2, f], 0.3, 0.3, m, D.depth([a, 1, f]) + 0.01);
  }
}
/** Archimedes screws (auger drive for snow and swamp): turning helical flights */
export function screws(x: VCtx, W: number, L: number, R: number, m: Mat) {
  const D = x.D, turn = moving(x) ? x.t * Math.PI * 2 : 0;
  for (const s of [-1, 1]) {
    const a = s * (W / 2 + R * 0.8), key = D.depth([a, R, 0]);
    D.cap([a, R, -L / 2 + R], [a, R, L / 2 - R], R, R, m, key, { g: D.group() });
    D.cap([a, R, L / 2 - R], [a, R * 0.6, L / 2 + R * 0.6], R * 0.8, 0.3, m, key + 0.001);
    const n = Math.round(L / (R * 1.1));
    for (let i = 0; i < n; i++) {
      const f = -L / 2 + R + ((L - 2 * R) * (i + 0.5)) / n, t = turn + i * 1.3;
      D.cap([a + Math.cos(t) * R * 1.05, R + Math.sin(t) * R * 1.05, f - R * 0.3], [a - Math.cos(t) * R * 1.05, R - Math.sin(t) * R * 1.05, f + R * 0.3], 0.35, 0.35, x.P.dark, key + 0.002, { noLine: true });
    }
  }
}
/** exhaust: puffs of smoke (steam, diesel) or a jet flame / glowing thrust */
export function exhaust(x: VCtx, p: V3, kind: 'steam' | 'diesel' | 'jet' | 'glow' | 'soot', size = 1.4, dir: V3 = [0, 0, -1]) {
  const D = x.D, P = x.P;
  if (kind === 'steam' || kind === 'diesel' || kind === 'soot') {
    const m = kind === 'steam' ? P.steam : kind === 'soot' ? P.soot : { ...P.smoke, alpha: 0.75 };
    const n = moving(x) ? 5 : 3, rise = moving(x) ? 10 : 14;
    for (let i = 0; i < n; i++) {
      const t = frac(x.t + i / n), r = size * (0.5 + t * 1.3) * (t > 0.8 ? (1 - t) / 0.2 : 1);
      if (r < 0.4) continue;
      D.ell([p[0] + Math.sin(t * 6 + i) * 0.6, p[1] + t * rise, p[2] - t * (moving(x) ? 9 : 2)], r, r * 0.85, m, 1e5 + p[1] + t, { g: D.group() });
    }
    return;
  }
  const fl = 1 + Math.sin(x.ph * 4) * 0.15, key = D.depth(p) + 0.2, d = nrm(dir);
  if (kind === 'jet') {
    D.cap(p, [p[0] + d[0] * size * 2.4 * fl, p[1] + d[1] * size * 2.4 * fl, p[2] + d[2] * size * 2.4 * fl], size * 0.8, size * 0.2, P.fire, key, { noLine: true });
    D.cap(p, [p[0] + d[0] * size * 1.3, p[1] + d[1] * size * 1.3, p[2] + d[2] * size * 1.3], size * 0.5, size * 0.15, P.flash, key + 0.01, { noLine: true });
  } else {
    D.ell(p, size * fl, size * fl * 0.8, { ...P.glow, alpha: 0.85 }, key, { g: D.group(), noLine: true });
    D.ell(p, size * 0.5, size * 0.4, P.flash, key + 0.01, { g: D.group(), noLine: true });
  }
}
/** a propeller spinning in the plane across `axis` (blur disc + blades) */
export function propeller(x: VCtx, c: V3, R: number, axis: 'f' | 'y' = 'f', on = true, blades = 3, m?: Mat) {
  const D = x.D, spin = on ? x.ph * 3 : 0.5, key = D.depth(c) + 0.3;
  const at2 = (t: number, rr: number): V3 => (axis === 'f' ? [c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr, c[2]] : [c[0] + Math.cos(t) * rr, c[1], c[2] + Math.sin(t) * rr]);
  if (on) D.poly(Array.from({ length: 16 }, (_, i) => at2((i / 16) * Math.PI * 2, R)), { ...x.P.metal, alpha: 0.28, line: null }, key, { g: D.group(), flat: 0.8 });
  for (let i = 0; i < blades; i++) D.cap(c, at2(spin + (i / blades) * Math.PI * 2, R * (on ? 0.95 : 1)), R * 0.14, R * 0.07, m ?? x.P.dark, key + 0.01, { noLine: on });
  D.ell(c, R * 0.18, R * 0.18, x.P.steel, key + 0.02, { g: D.group() });
}
/** helicopter rotor above everything: blades turning (blurred when on) */
export function rotor(x: VCtx, c: V3, R: number, n = 4, on = true) {
  const D = x.D, spin = on ? x.ph * 2 : 0.3, key = D.depth(c) + 5;
  if (on) D.poly(circle(c, R, 'y', 18).map(p => [p[0], p[1] - 0.05, p[2]] as V3), { ...x.P.metal, alpha: 0.16, line: null }, key - 0.1, { g: D.group(), flat: 0.9 });
  for (let i = 0; i < n; i++) { const t = spin + (i / n) * Math.PI * 2; D.cap(c, [c[0] + Math.cos(t) * R, c[1] - (on ? 0 : 0.6), c[2] + Math.sin(t) * R], 0.45, 0.35, x.P.dark, key, { noLine: on }); }
  D.ell(c, 0.8, 0.6, x.P.steel, key + 0.01, { g: D.group() });
}
/** a flat wing / fin / plate through an outline, lit by the way it faces (two-sided) */
export function plate(x: VCtx, pts: V3[], m: Mat, key?: number, edge?: Mat) {
  const D = x.D, k = key ?? pts.reduce((s, p) => s + D.depth(p), 0) / pts.length;
  facet(x, pts, m, k, D.group(), null, true);
  if (edge) D.cap(pts[0], pts[1], 0.3, 0.25, edge, k + 0.001, { noLine: true });
}
/** water line + bow wave + wake while under way */
export function wake(x: VCtx, W: number, L: number, speed = 1) {
  const D = x.D, P = x.P, mv = moving(x) || acting(x);
  D.poly(circle([0, 0.05, 0], L * 0.51, 'y', 22, 0, W * 0.6), { ...P.foam, alpha: 0.5 }, -950, { g: D.group(), flat: 0.9 });
  if (!mv) { for (let i = 0; i < 3; i++) { const k = frac(x.t + i / 3); D.poly(circle([0, 0.04, 0], L * (0.52 + k * 0.1), 'y', 22, 0, W * (0.62 + k * 0.4)), { ...P.foam, alpha: 0.18 * (1 - k) }, -960 - i, { g: D.group(), flat: 0.9 }); } return; }
  for (let i = 0; i < 8; i++) {
    const k = frac(x.t * speed + i / 8);
    for (const s of [-1, 1]) D.ell([s * (W * 0.45 + k * W * 1.2), 0.1, -L * 0.42 - k * L * 0.55], 1 + k * 2.4, 0.45 + k * 0.3, { ...P.foam, alpha: 0.9 - k * 0.6 }, -940 + i, { g: D.group(), noLine: true });
  }
  for (let i = 0; i < 5; i++) { const k = frac(x.t * speed * 1.5 + i / 5); D.ell([Math.sin(i * 2) * W * 0.25, 0.1, -L * 0.5 - k * L * 0.7], W * 0.25 * (1 + k), 0.6, { ...P.foam, alpha: 0.8 - k * 0.6 }, -935 + i, { g: D.group(), noLine: true }); }
  for (const s of [-1, 1]) D.ell([s * W * 0.32, 0.4, L * 0.47], 1.6 + Math.sin(x.ph * 2) * 0.3, 0.7, P.foam, D.depth([s * W * 0.3, 0.4, L * 0.47]) + 0.1, { g: D.group(), noLine: true });
}
/** a flag / pennant on a staff that waves */
export function banner(x: VCtx, base: V3, h: number, len: number, m: Mat, pole?: Mat, pennant = false) {
  const D = x.D, key = D.depth(base) + 0.03;
  D.cap(base, [base[0], base[1] + h, base[2]], 0.3, 0.25, pole ?? x.P.wood, key, { noLine: true });
  const top = base[1] + h - 0.3, hh = pennant ? len * 0.25 : len * 0.6, N = 5, upper: V3[] = [], lower: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, w = Math.sin(x.ph * 2 - k * 4) * 1.1 * k, drop = pennant ? hh * k : 0;
    upper.push([base[0] + w, top - drop * 0.5, base[2] - k * len]);
    lower.push([base[0] + w, top - hh + drop * 0.5 + (pennant ? 0 : -k * 0.6), base[2] - k * len]);
  }
  facet(x, [...upper, ...lower.reverse()], m, key + 0.001, D.group(), null, true);
}
/** an emblem (roundel, star, bar, glyph) painted on a side face at p, facing n */
export function emblem(x: VCtx, p: V3, n: V3, r: number, kind: number, m1: Mat, m2: Mat) {
  const D = x.D;
  if (D.facing(n) < 0.1) return;
  const q: V3 = [p[0] + n[0] * 0.08, p[1], p[2] + n[2] * 0.08], key = D.depth(p) + 0.2, t: V3 = nrm([n[2], 0, -n[0]]);
  const pt = (u: number, v: number): V3 => [q[0] + t[0] * u, q[1] + v, q[2] + t[2] * u];
  switch (kind % 5) {
    case 0: D.poly(Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return pt(Math.cos(a) * r, Math.sin(a) * r); }), m1, key, { g: D.group(), flat: 0.9 }); D.poly(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return pt(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); }), m2, key + 0.001, { g: D.group(), flat: 0.9 }); break;
    case 1: D.poly(Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.42 : r; return pt(Math.cos(a) * rr, Math.sin(a) * rr); }), m1, key, { g: D.group(), flat: 0.9 }); break;
    case 2: D.poly([pt(-r, r * 0.9), pt(r, r * 0.9), pt(0, -r * 0.9)], m1, key, { g: D.group(), flat: 0.9 }); D.poly([pt(-r * 0.45, r * 0.45), pt(r * 0.45, r * 0.45), pt(0, -r * 0.35)], m2, key + 0.001, { g: D.group(), flat: 0.9 }); break;
    case 3: D.poly([pt(-r * 1.3, -r * 0.3), pt(r * 1.3, -r * 0.3), pt(r * 1.3, r * 0.3), pt(-r * 1.3, r * 0.3)], m1, key, { g: D.group(), flat: 0.9 }); D.poly([pt(-r * 0.3, -r), pt(r * 0.3, -r), pt(r * 0.3, r), pt(-r * 0.3, r)], m1, key + 0.001, { g: D.group(), flat: 0.9 }); break;
    default: D.poly(Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return pt(Math.cos(a) * r, Math.sin(a) * r); }), m2, key, { g: D.group(), flat: 0.9 }); D.poly([pt(-r * 0.2, -r * 0.7), pt(r * 0.2, -r * 0.7), pt(r * 0.2, r * 0.7), pt(-r * 0.2, r * 0.7)], m1, key + 0.001, { g: D.group(), flat: 0.9 });
  }
}
