// The architectural vocabulary: walls, roofs, towers, openings and the small animated things
// (smoke, fire, sails, flags, lights). Everything ends up as 2D pieces on the drafter: flat walls and
// roof slopes are single polygons lit by the way they face, round volumes are single silhouettes.
import type { Mat } from '../creature/raster';
import { Draft, V3, ring } from './draft';
import type { Kit } from './kit';
import type { Culture, Plan, Roof, Size, WinShape } from './genome';

export interface Ctx {
  D: Draft; K: Kit; C: Culture;
  /** era index 0 (tribal) .. 7 (space) */
  e: number;
  /** variant random numbers (same sequence for every frame and facing) */
  r: () => number;
  /** animation loop position 0..1 and phase 0..2PI */
  t: number; ph: number;
  night: boolean; size: Size;
  /** running window counter (which windows are lit at night) */
  wid: number;
}

export type Pt = [number, number]; // [a, f]
export type Vol =
  | { kind: 'prism'; ring: Pt[]; top: Pt[]; y0: number; y1: number; key: number }
  | { kind: 'round'; a: number; f: number; r: number; rt: number; y0: number; y1: number; key: number };

const frac = (x: number) => x - Math.floor(x);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const TOP = 1e5;   // things above everything (smoke, force fields)
const FLOOR = -1e5; // things on the ground (fields, plazas, shadows)

/** A flat piece through `pts`, lit by the way it faces; hidden when it looks away (unless `two`). */
export function facet(x: Ctx, pts: V3[], m: Mat, key: number, g: number, inside: V3 | null, two = false) {
  const D = x.D;
  let n = cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]));
  if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return false;
  if (inside) {
    const c: V3 = [0, 0, 0];
    for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
    if (dot(n, sub(c, inside)) < 0) n = [-n[0], -n[1], -n[2]];
  }
  let fc = D.facing(n);
  if (fc <= 0.012) { if (!two) return false; n = [-n[0], -n[1], -n[2]]; fc = -fc; }
  D.poly(pts, m, key, { g, dark: D.light(n), flat: 0.9, uv: [pts[0], pts[1], pts[pts.length - 1]] });
  return true;
}

// ---------------------------------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------------------------------
export function prism(x: Ctx, rg: Pt[], y0: number, y1: number, side: Mat, top: Mat | null, o: { topRing?: Pt[]; bias?: number } = {}): Vol {
  const tr = o.topRing ?? rg;
  let ca = 0, cf = 0;
  for (const [a, f] of rg) { ca += a / rg.length; cf += f / rg.length; }
  const key = x.D.depth([ca, (y0 + y1) / 2, cf]) + (o.bias ?? 0), g = x.D.group(), inside: V3 = [ca, (y0 + y1) / 2, cf];
  for (let i = 0; i < rg.length; i++) {
    const j = (i + 1) % rg.length;
    facet(x, [[rg[i][0], y0, rg[i][1]], [rg[j][0], y0, rg[j][1]], [tr[j][0], y1, tr[j][1]], [tr[i][0], y1, tr[i][1]]], side, key, g, inside);
  }
  if (top) facet(x, tr.map(([a, f]) => [a, y1, f] as V3), top, key + 0.001, g, [ca, y0 - 1, cf]);
  return { kind: 'prism', ring: rg, top: tr, y0, y1, key };
}
export const rect = (a0: number, f0: number, a1: number, f1: number): Pt[] => [[a0, f1], [a1, f1], [a1, f0], [a0, f0]];
export function box(x: Ctx, a0: number, f0: number, a1: number, f1: number, y0: number, y1: number, side: Mat, top: Mat | null = side, bias = 0): Vol {
  return prism(x, rect(a0, f0, a1, f1), y0, y1, side, top, { bias });
}
export const polyRing = (a: number, f: number, ra: number, rf: number, n: number, rot = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => { const t = rot + (i / n) * Math.PI * 2; return [a + Math.sin(t) * ra, f + Math.cos(t) * rf] as Pt; });

/** round volume: one silhouette (plus a lid) */
export function cyl(x: Ctx, a: number, f: number, r: number, y0: number, y1: number, side: Mat, top: Mat | null = side, o: { rt?: number; bias?: number; flat?: number } = {}): Vol {
  const rt = o.rt ?? r, D = x.D;
  const key = D.depth([a, (y0 + y1) / 2, f]) + (o.bias ?? 0);
  D.hull([...ring(a, f, y0, r, 20), ...ring(a, f, y1, rt, 20)], side, key, { g: D.group(), flat: o.flat ?? 0.15 });
  if (top && rt > 0.3) D.hull(ring(a, f, y1, rt, 20), top, key + 0.001, { g: D.group(), dark: D.light([0, 1, 0]), flat: 0.75 });
  return { kind: 'round', a, f, r, rt, y0, y1, key };
}
/** flat ellipse on a horizontal plane (well rims, ponds, plazas, pads) */
export function disc(x: Ctx, a: number, f: number, y: number, r: number, m: Mat, key: number, rf = r) {
  x.D.hull(ring(a, f, y, r, 18, rf), m, key, { g: x.D.group(), dark: x.D.light([0, 1, 0]), flat: 0.8 });
}
export function ground(x: Ctx, rg: Pt[], m: Mat, y = 0, bias = 0) {
  facet(x, rg.map(([a, f]) => [a, y, f] as V3), m, FLOOR + bias, x.D.group(), [0, y - 5, 0]);
}

// ---------------------------------------------------------------------------------------------------
// Openings (windows, doors, signs) on the walls of a volume
// ---------------------------------------------------------------------------------------------------
function shape2(shape: WinShape, w: number, h: number): [number, number][] {
  const hw = w / 2, hh = h / 2;
  switch (shape) {
    case 'arch': { const q: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh - hw]]; for (let i = 1; i < 6; i++) { const t = (i / 6) * Math.PI; q.push([Math.cos(t) * hw, hh - hw + Math.sin(t) * hw]); } q.push([-hw, hh - hw]); return q; }
    case 'round': return Array.from({ length: 10 }, (_, i) => { const t = (i / 10) * Math.PI * 2; return [Math.cos(t) * hw, Math.sin(t) * hh] as [number, number]; });
    case 'hex': return Array.from({ length: 6 }, (_, i) => { const t = (i / 6) * Math.PI * 2; return [Math.cos(t) * hw, Math.sin(t) * hh] as [number, number]; });
    case 'tri': return [[-hw, -hh], [hw, -hh], [0, hh]];
    case 'slit': return [[-hw * 0.35, -hh], [hw * 0.35, -hh], [hw * 0.35, hh], [-hw * 0.35, hh]];
    case 'cross': return [[-hw * 0.3, -hh], [hw * 0.3, -hh], [hw * 0.3, hh], [-hw * 0.3, hh]];
    default: return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  }
}
/** Where a point on a wall is: side `s` of a prism (u along it) or angle `s` of a round volume. */
export function wallFrame(v: Vol, s: number, u: number, y: number): { p: V3; t: V3; n: V3; len: number } | null {
  const k = (y - v.y0) / Math.max(1e-6, v.y1 - v.y0);
  if (v.kind === 'round') {
    const r = v.r + (v.rt - v.r) * k + 0.25;
    return { p: [v.a + Math.sin(s) * r, y, v.f + Math.cos(s) * r], t: [Math.cos(s), 0, -Math.sin(s)], n: [Math.sin(s), 0, Math.cos(s)], len: 2 * Math.PI * v.r };
  }
  const n = v.ring.length, i = ((s % n) + n) % n, j = (i + 1) % n;
  const A: Pt = [v.ring[i][0] + (v.top[i][0] - v.ring[i][0]) * k, v.ring[i][1] + (v.top[i][1] - v.ring[i][1]) * k];
  const B: Pt = [v.ring[j][0] + (v.top[j][0] - v.ring[j][0]) * k, v.ring[j][1] + (v.top[j][1] - v.ring[j][1]) * k];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]), t: V3 = [(B[0] - A[0]) / len, 0, (B[1] - A[1]) / len];
  let ca = 0, cf = 0;
  for (const [a, f] of v.ring) { ca += a / n; cf += f / n; }
  let nn: V3 = [-t[2], 0, t[0]];
  const mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (nn[0] * (mid[0] - ca) + nn[2] * (mid[1] - cf) < 0) nn = [-nn[0], 0, -nn[2]];
  return { p: [A[0] + t[0] * u + nn[0] * 0.25, y, A[1] + t[2] * u + nn[2] * 0.25], t, n: nn, len };
}
export function sideLen(v: Vol, s: number) { return wallFrame(v, s, 0, v.y0)!.len; }
/** a flat opening/sign on a wall; returns false when that wall looks away */
export function onWall(x: Ctx, v: Vol, s: number, u: number, y: number, w: number, h: number, shape: WinShape, m: Mat, bias = 0.01): boolean {
  const fr = wallFrame(v, s, u, y);
  if (!fr) return false;
  const fc = x.D.facing(fr.n);
  if (fc < (v.kind === 'round' ? 0.3 : 0.06)) return false;
  const pts = shape2(shape, w, h).map(([q, r]) => [fr.p[0] + fr.t[0] * q, fr.p[1] + r, fr.p[2] + fr.t[2] * q] as V3);
  x.D.poly(pts, m, v.key + bias, { g: x.D.group(), dark: x.D.light(fr.n) * 0.97, flat: 0.7 });
  if (shape === 'cross') x.D.poly([[-w / 2, -h * 0.1], [w / 2, -h * 0.1], [w / 2, h * 0.14], [-w / 2, h * 0.14]].map(([q, r]) => [fr.p[0] + fr.t[0] * q, fr.p[1] + r + h * 0.15, fr.p[2] + fr.t[2] * q] as V3), m, v.key + bias, { g: x.D.group(), dark: x.D.light(fr.n) * 0.97, flat: 0.7 });
  return true;
}
/** a window: frame, glass (lit at night for most windows), shutters/sill depending on the era */
export function windowAt(x: Ctx, v: Vol, s: number, u: number, y: number, w: number, h: number, shape: WinShape) {
  const K = x.K, id = x.wid++;
  if (x.C.winFrame && shape !== 'band') onWall(x, v, s, u, y, w + 1.6, h + 1.6, shape, K.trim, 0.008);
  const m = K.lit(id) ? K.winLit : K.win;
  if (!onWall(x, v, s, u, y, w, h, shape, m, 0.01)) return;
  if (x.e >= 1 && x.e <= 3 && shape === 'rect' && x.C.r[50] < 0.5) { // shutters
    onWall(x, v, s, u - w * 0.78, y, w * 0.5, h, 'rect', K.accent, 0.012); onWall(x, v, s, u + w * 0.78, y, w * 0.5, h, 'rect', K.accent, 0.012);
  }
  if (shape === 'rect' && w > 3 && x.e >= 2) onWall(x, v, s, u, y, w * 0.12, h, 'rect', K.frame, 0.013); // mullion
}
/** a whole row of windows along a wall */
export function windowRow(x: Ctx, v: Vol, s: number, y: number, w: number, h: number, shape: WinShape, every: number, skip?: [number, number]) {
  const len = v.kind === 'round' ? 0 : sideLen(v, s);
  if (shape === 'band') { if (len > 6) windowAt(x, v, s, len / 2, y, len - 3.5, h * 0.7, 'band'); return; }
  const n = Math.max(1, Math.floor(len / every));
  for (let i = 0; i < n; i++) {
    const u = (len * (i + 0.5)) / n;
    if (skip && u > skip[0] && u < skip[1]) continue;
    if (len < w + 2) continue;
    windowAt(x, v, s, u, y, w, h, shape);
  }
}

// ---------------------------------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------------------------------
const bounds = (rg: Pt[]) => {
  let a0 = 1e9, a1 = -1e9, f0 = 1e9, f1 = -1e9;
  for (const [a, f] of rg) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); f0 = Math.min(f0, f); f1 = Math.max(f1, f); }
  return { a0, a1, f0, f1 };
};

/** Puts a roof on a volume; returns the height of its top. */
export function roofOn(x: Ctx, v: Vol, type: Roof, m: Mat, end: Mat, o: { pitch?: number; over?: number; alongF?: boolean } = {}): number {
  const D = x.D, y = v.y1, key = v.key + 0.02, g = D.group();
  const pitch = o.pitch ?? x.C.roofPitch, ov = o.over ?? x.C.overhang * 2.5;
  if (v.kind === 'round' || v.ring.length !== 4 || type === 'dome' || type === 'onion' || type === 'mushroom' || type === 'cone') {
    const b = v.kind === 'round' ? { a: v.a, f: v.f, r: v.rt, out: v.rt } : (() => {
      const q = bounds(v.top), a = (q.a0 + q.a1) / 2, f = (q.f0 + q.f1) / 2;
      // r: the circle that fits inside the top (cupolas sit on it); out: the circle through its corners (anything that
      // must cover the whole wall top - cones, caps - is sized on this one, or the corners poke out of the roof)
      return { a, f, r: Math.min(q.a1 - q.a0, q.f1 - q.f0) / 2, out: Math.max(...v.top.map(([pa, pf]) => Math.hypot(pa - a, pf - f))) };
    })();
    const polyN = v.kind === 'prism' && v.ring.length !== 4 ? v.ring.length : 0;
    // a straight-walled volume gets a lid under a roof that does not reach its corners (cupolas, onions)
    if (v.kind === 'prism' && type !== 'flat') facet(x, v.top.map(([a, f]) => [a, y, f] as V3), x.K.roof2, v.key + 0.015, D.group(), [b.a, y - 1, b.f]);
    switch (type) {
      case 'flat': case 'terrace': case 'shed': case 'vault': case 'gable': case 'hip': case 'saddle':
        if (v.kind === 'round') { cyl(x, b.a, b.f, b.r + 0.8, y, y + 1.4, x.K.trim, m, { bias: 0.02 }); return y + 1.4; }
        if (type === 'flat' || type === 'terrace') { prism(x, v.top.map(([a, f]) => [b.a + (a - b.a) * 1.05, b.f + (f - b.f) * 1.05] as Pt), y, y + 1.3, x.K.trim, m, { bias: 0.02 }); return y + 1.3; }
        return polyRoof(x, v as Vol & { kind: 'prism' }, y, pitch * 0.8, ov, m, key, g);
      case 'pyramid': case 'spire':
        if (polyN) return polyRoof(x, v as Vol & { kind: 'prism' }, y, pitch * (type === 'spire' ? 3 : 1), ov, m, key, g);
        return coneRoof(x, b.a, b.f, y, b.r + ov * 0.5, b.r * (type === 'spire' ? 3.2 : 1.3) * pitch, m, key);
      case 'cone':
        // a faceted tower gets a faceted roof: the eaves follow its corners
        if (v.kind === 'prism') return polyRoof(x, v as Vol & { kind: 'prism' }, y, pitch * 1.6, ov * 0.6 + 0.5, m, key, g);
        return coneRoof(x, b.a, b.f, y, b.r + ov * 0.6, b.r * 1.6 * pitch + 2, m, key);
      case 'dome': return domeRoof(x, b.a, b.f, y, b.r * 0.98, b.r * (0.7 + x.C.tall * 0.4), m, key);
      case 'onion': return onionRoof(x, b.a, b.f, y, b.r * 0.9, b.r * 1.9, m, key);
      case 'mushroom': return mushroomRoof(x, b.a, b.f, y, Math.max(b.out * 1.12, b.r * 1.45) + ov, b.r * 0.75, m, key);
    }
  }
  const q = bounds(v.top);
  const a0 = q.a0 - ov, a1 = q.a1 + ov, f0 = q.f0 - ov, f1 = q.f1 + ov, am = (a0 + a1) / 2, fm = (f0 + f1) / 2;
  const alongA = o.alongF === undefined ? a1 - a0 >= f1 - f0 : !o.alongF;
  const span = alongA ? f1 - f0 : a1 - a0, h = Math.max(2, (span / 2) * pitch);
  const inside: V3 = [am, y + h * 0.25, fm];
  const F = (pts: V3[], mm: Mat) => facet(x, pts, mm, key + D.depth(pts[0]) * 1e-4, g, inside);
  switch (type) {
    case 'gable':
      if (alongA) {
        F([[a0, y, f1], [a1, y, f1], [a1, y + h, fm], [a0, y + h, fm]], m); F([[a1, y, f0], [a0, y, f0], [a0, y + h, fm], [a1, y + h, fm]], m);
        F([[a0, y, f0], [a0, y, f1], [a0, y + h, fm]], end); F([[a1, y, f1], [a1, y, f0], [a1, y + h, fm]], end);
      } else {
        F([[a1, y, f0], [a1, y, f1], [am, y + h, f1], [am, y + h, f0]], m); F([[a0, y, f1], [a0, y, f0], [am, y + h, f0], [am, y + h, f1]], m);
        F([[a0, y, f1], [a1, y, f1], [am, y + h, f1]], end); F([[a1, y, f0], [a0, y, f0], [am, y + h, f0]], end);
      }
      return y + h;
    case 'saddle': {
      // flared eaves: a shallow skirt and a steep upper slope
      const hm = h * 0.3, ins = 0.4;
      if (alongA) {
        const fa = f1 - (f1 - fm) * ins, fb = f0 + (fm - f0) * ins;
        F([[a0 - 1, y + 0.8, f1], [a1 + 1, y + 0.8, f1], [a1, y + hm, fa], [a0, y + hm, fa]], m); F([[a0, y + hm, fa], [a1, y + hm, fa], [a1, y + h, fm], [a0, y + h, fm]], m);
        F([[a1 + 1, y + 0.8, f0], [a0 - 1, y + 0.8, f0], [a0, y + hm, fb], [a1, y + hm, fb]], m); F([[a1, y + hm, fb], [a0, y + hm, fb], [a0, y + h, fm], [a1, y + h, fm]], m);
        F([[a0, y, fb], [a0, y, fa], [a0, y + hm, fa], [a0, y + h, fm], [a0, y + hm, fb]], end); F([[a1, y, fa], [a1, y, fb], [a1, y + hm, fb], [a1, y + h, fm], [a1, y + hm, fa]], end);
      } else {
        const aa = a1 - (a1 - am) * ins, ab = a0 + (am - a0) * ins;
        F([[a1, y + 0.8, f0 - 1], [a1, y + 0.8, f1 + 1], [aa, y + hm, f1], [aa, y + hm, f0]], m); F([[aa, y + hm, f0], [aa, y + hm, f1], [am, y + h, f1], [am, y + h, f0]], m);
        F([[a0, y + 0.8, f1 + 1], [a0, y + 0.8, f0 - 1], [ab, y + hm, f0], [ab, y + hm, f1]], m); F([[ab, y + hm, f1], [ab, y + hm, f0], [am, y + h, f0], [am, y + h, f1]], m);
        F([[ab, y, f1], [aa, y, f1], [aa, y + hm, f1], [am, y + h, f1], [ab, y + hm, f1]], end); F([[aa, y, f0], [ab, y, f0], [ab, y + hm, f0], [am, y + h, f0], [aa, y + hm, f0]], end);
      }
      if (x.C.spikes || x.C.ornament > 0.6) { const tip = alongA ? [[a0, fm], [a1, fm]] : [[am, f0], [am, f1]]; for (const [pa, pf] of tip) x.D.cap([pa, y + h, pf], [pa + (alongA ? (pa < am ? -2 : 2) : 0), y + h + 3, pf + (alongA ? 0 : (pf < fm ? -2 : 2))], 0.9, 0.4, m, key + 0.01); }
      return y + h;
    }
    case 'hip': case 'pyramid': case 'spire': {
      const hh = type === 'spire' ? h * 3.2 : h;
      if (type !== 'hip' || Math.abs((a1 - a0) - (f1 - f0)) < 0.5) {
        const ap: V3 = [am, y + hh, fm];
        F([[a0, y, f1], [a1, y, f1], ap], m); F([[a1, y, f1], [a1, y, f0], ap], m); F([[a1, y, f0], [a0, y, f0], ap], m); F([[a0, y, f0], [a0, y, f1], ap], m);
        return y + hh;
      }
      if (alongA) {
        const i = (f1 - f0) / 2, ra: V3 = [a0 + i, y + h, fm], rb: V3 = [a1 - i, y + h, fm];
        F([[a0, y, f1], [a1, y, f1], rb, ra], m); F([[a1, y, f0], [a0, y, f0], ra, rb], m); F([[a0, y, f0], [a0, y, f1], ra], m); F([[a1, y, f1], [a1, y, f0], rb], m);
      } else {
        const i = (a1 - a0) / 2, ra: V3 = [am, y + h, f0 + i], rb: V3 = [am, y + h, f1 - i];
        F([[a1, y, f0], [a1, y, f1], rb, ra], m); F([[a0, y, f1], [a0, y, f0], ra, rb], m); F([[a0, y, f1], [a1, y, f1], rb], m); F([[a1, y, f0], [a0, y, f0], ra], m);
      }
      return y + h;
    }
    case 'shed': {
      const hs = h * 0.9;
      F([[a0, y, f1], [a1, y, f1], [a1, y + hs, f0], [a0, y + hs, f0]], m);
      F([[a0, y, f0], [a0, y, f1], [a0, y + hs, f0]], end); F([[a1, y, f1], [a1, y, f0], [a1, y + hs, f0]], end);
      F([[a1, y, f0], [a0, y, f0], [a0, y + hs, f0], [a1, y + hs, f0]], end);
      return y + hs;
    }
    case 'vault': {
      const R = (alongA ? f1 - f0 : a1 - a0) / 2, H = R * Math.min(1, 0.5 + pitch * 0.5), arc: [number, number][] = [];
      for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI; arc.push([Math.cos(t) * R, Math.sin(t) * H]); }
      const endA = alongA ? arc.map(([c, s]) => [a0, y + s, fm + c] as V3) : arc.map(([c, s]) => [am + c, y + s, f0] as V3);
      const endB = alongA ? arc.map(([c, s]) => [a1, y + s, fm + c] as V3) : arc.map(([c, s]) => [am + c, y + s, f1] as V3);
      D.hull([...endA, ...endB], m, key, { g, flat: 0.2 });
      for (const en of [endA, endB]) facet(x, en, end, key + 0.002, g, inside);
      if (x.e >= 2) for (let i = 1; i < 4; i++) { const k2 = i / 4; const pa = alongA ? a0 + (a1 - a0) * k2 : am, pf = alongA ? fm : f0 + (f1 - f0) * k2; x.D.cap([alongA ? pa : am - R, y, alongA ? fm - R : pf], [pa, y + H, pf], 0.5, 0.5, x.K.trim, key + 0.003 + D.depth([pa, y, pf]) * 1e-4, { noLine: true }); }
      return y + H;
    }
    case 'terrace': {
      facet(x, v.top.map(([a, f]) => [a, y, f] as V3), x.K.wall, key - 0.005, D.group(), inside);
      let yy = y, s = 1;
      for (let i = 0; i < 2; i++) {
        s -= 0.28;
        const ia = ((q.a1 - q.a0) * (1 - s)) / 2, iff = ((q.f1 - q.f0) * (1 - s)) / 2;
        box(x, q.a0 + ia, q.f0 + iff, q.a1 - ia, q.f1 - iff, yy, yy + x.C.storey * 0.6, x.K.wall2, x.K.wall, 0.02 + i * 0.01);
        yy += x.C.storey * 0.6;
      }
      return yy;
    }
    default: { // flat: parapet rim
      const p = 1.2;
      box(x, q.a0 - 0.5, q.f0 - 0.5, q.a1 + 0.5, q.f1 + 0.5, y, y + p, x.K.trim, m, 0.015);
      return y + p;
    }
  }
}
/** hex/oct pyramid roof */
function polyRoof(x: Ctx, v: Vol & { kind: 'prism' }, y: number, pitch: number, ov: number, m: Mat, key: number, g: number) {
  let ca = 0, cf = 0;
  for (const [a, f] of v.top) { ca += a / v.top.length; cf += f / v.top.length; }
  const R = Math.max(...v.top.map(([a, f]) => Math.hypot(a - ca, f - cf)));
  const h = Math.max(2, R * pitch), ap: V3 = [ca, y + h, cf];
  const ex = v.top.map(([a, f]) => { const d = Math.hypot(a - ca, f - cf) || 1; return [ca + ((a - ca) * (d + ov)) / d, y, cf + ((f - cf) * (d + ov)) / d] as V3; });
  for (let i = 0; i < ex.length; i++) facet(x, [ex[i], ex[(i + 1) % ex.length], ap], m, key, g, [ca, y + h * 0.2, cf]);
  return y + h;
}
export function coneRoof(x: Ctx, a: number, f: number, y: number, r: number, h: number, m: Mat, key: number) {
  x.D.hull([...ring(a, f, y, r, 20), [a, y + h, f]], m, key, { g: x.D.group(), flat: 0.1 });
  if (x.C.finial) finial(x, [a, y + h, f], key + 0.01);
  return y + h;
}
export function domeRoof(x: Ctx, a: number, f: number, y: number, r: number, h: number, m: Mat, key: number) {
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) { const t = (i / 5) * (Math.PI / 2); pts.push(...ring(a, f, y + Math.sin(t) * h, Math.cos(t) * r + 0.01, 18)); }
  x.D.hull(pts, m, key, { g: x.D.group(), flat: 0 });
  if (x.C.finial) finial(x, [a, y + h, f], key + 0.01);
  return y + h;
}
export function onionRoof(x: Ctx, a: number, f: number, y: number, r: number, h: number, m: Mat, key: number) {
  const bulb: V3[] = [];
  const prof = [[0, 0.75], [0.12, 1.08], [0.28, 1.15], [0.45, 0.95]];
  for (const [t, s] of prof) bulb.push(...ring(a, f, y + t * h, r * s, 18));
  x.D.hull([...ring(a, f, y + 0.45 * h, r * 0.95, 18), [a, y + h, f]], m, key, { g: x.D.group(), flat: 0.1 });
  x.D.hull(bulb, m, key + 0.001, { g: x.D.group(), flat: 0 });
  finial(x, [a, y + h, f], key + 0.01);
  return y + h;
}
export function mushroomRoof(x: Ctx, a: number, f: number, y: number, R: number, h: number, m: Mat, key: number) {
  const D = x.D;
  D.hull([...ring(a, f, y + 0.5, R, 20), ...ring(a, f, y + h * 0.45, R * 0.82, 20), ...ring(a, f, y + h * 0.85, R * 0.45, 16), [a, y + h, f]], m, key, { g: D.group(), flat: 0 });
  // soft spots on the cap (alien forms) or a rim of shingles
  const rr = x.C.r;
  for (let i = 0; i < 5; i++) {
    const t = rr[60 + i] * Math.PI * 2, d = 0.3 + rr[65 + i] * 0.5;
    const p: V3 = [a + Math.sin(t) * R * d, y + h * (0.9 - d * 0.6), f + Math.cos(t) * R * d];
    if (D.facing([Math.sin(t) * d, 1, Math.cos(t) * d]) > 0.4 && x.C.spikes) D.ell(p, R * 0.12, R * 0.07, x.K.roof2, key + 0.005, { g: D.group(), noLine: true });
  }
  return y + h;
}
export function finial(x: Ctx, p: V3, key: number) {
  const m = x.e >= 2 ? x.K.gold : x.K.wood;
  x.D.cap(p, [p[0], p[1] + 4, p[2]], 0.6, 0.3, m, key, { g: x.D.group() });
  if (x.C.ornament > 0.5) x.D.ell([p[0], p[1] + 2, p[2]], 1, 1, m, key + 0.001, { g: x.D.group() });
}

// ---------------------------------------------------------------------------------------------------
// Animated details
// ---------------------------------------------------------------------------------------------------
/** puffs rising and swelling, looping with the animation */
export function smoke(x: Ctx, p: V3, size = 2.2, m?: Mat, n = 4, rise = 16) {
  const mm = m ?? (x.e >= 3 && x.e <= 4 ? x.K.soot : x.K.smoke);
  for (let i = 0; i < n; i++) {
    const t = frac(x.t + i / n);
    const r = size * (0.55 + t * 1.1) * (t > 0.8 ? (1 - t) / 0.2 : 1);
    if (r < 0.5) continue;
    x.D.ell([p[0] + t * rise * 0.35 + Math.sin(t * 6 + i) * 0.8, p[1] + t * rise, p[2]], r, r * 0.85, mm, TOP + p[1] + t, { g: x.D.group() });
  }
}
/** flickering flames */
export function fire(x: Ctx, p: V3, s = 1.5) {
  for (let i = 0; i < 3; i++) {
    const fl = 0.75 + 0.25 * Math.sin(x.ph * 3 + i * 2.1);
    x.D.ell([p[0] + (i - 1) * s * 0.5, p[1] + s * fl * (i === 1 ? 1.2 : 0.8), p[2]], s * 0.55, s * fl * (i === 1 ? 1.3 : 0.9), i === 1 ? x.K.fire2 : x.K.fire, x.D.depth(p) + 0.05 + i * 0.001, { g: x.D.group(), noLine: true });
  }
}
/** a flag on a pole; the cloth waves */
export function flag(x: Ctx, base: V3, h: number, len: number, m?: Mat) {
  const D = x.D, key = D.depth(base) + 0.03;
  D.cap(base, [base[0], base[1] + h, base[2]], 0.5, 0.4, x.K.frame, key, { g: D.group() });
  const top = base[1] + h - 0.5, hgt = len * 0.6, N = 5, upper: V3[] = [], lower: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, w = Math.sin(x.ph * 2 - k * 4) * 1.2 * k;
    upper.push([base[0] + k * len, top + w * 0.3, base[2] + w]);
    lower.push([base[0] + k * len, top - hgt + w * 0.3 - k * 0.8, base[2] + w]);
  }
  facet(x, [...upper, ...lower.reverse()], m ?? x.K.cloth, key + 0.001, D.group(), null, true);
}
/** windmill sails (or turbine blades) turning in the front plane of `hub` */
export function sails(x: Ctx, hub: V3, R: number, n: number, m: Mat, spar: Mat, width = 0.28, speed = 1) {
  const D = x.D, key = D.depth(hub) + 0.05, ang = -(x.ph / n) * speed; // a loop turns it by one blade: seamless
  const at = (rr: number, t: number, w: number): V3 => [hub[0] + Math.cos(t) * rr - Math.sin(t) * w, hub[1] + Math.sin(t) * rr + Math.cos(t) * w, hub[2]];
  for (let i = 0; i < n; i++) {
    const t = ang + (i / n) * Math.PI * 2;
    D.cap(at(0, t, 0), at(R, t, 0), 0.55, 0.35, spar, key + 0.002, { g: D.group() });
    const w = R * width;
    facet(x, [at(R * 0.18, t, 0.3), at(R, t, 0.3), at(R, t, w), at(R * 0.18, t, w * 0.8)], m, key + 0.001, D.group(), null, true);
  }
  D.ell(hub, 1.2, 1.2, spar, key + 0.003, { g: D.group() });
}
/** a lamp or beacon; `blink` makes it pulse */
export function lamp(x: Ctx, p: V3, m?: Mat, blink = false, r = 0.9) {
  if (blink && frac(x.t * 2 + p[0] * 0.13) > 0.5) return;
  x.D.ell(p, r, r, m ?? x.K.glow, x.D.depth(p) + 0.06, { g: x.D.group() });
}
/** a tree: earth-like crowns follow the climate; alien ones are bulbs and spirals. `fruit`: how many hang in the crown
 * (placed relative to the swaying crown, so they move with it) */
export function tree(x: Ctx, a: number, f: number, s0: number, kind = 0, fruit = 0, y0 = 0) {
  // s0 = 1 is a grown tree about 2.5 citizens tall (a citizen is ~9 units)
  const s = s0 * 2.2, D = x.D, K = x.K, key = D.depth([a, y0 + s * 4, f]), sw = Math.sin(x.ph + a * 0.3) * 0.35 * s;
  const cold = x.C.params.temperature < 0.35, dry = x.C.params.water < 0.35;
  D.cap([a, y0, f], [a + sw, y0 + s * 5, f], s * 0.5, s * 0.3, K.trunk, key, { g: D.group() });
  const k = kind % 3;
  if (x.C.mode === 'alien' && k === 2) {
    for (let i = 0; i < 3; i++) D.ell([a + sw + (i - 1) * s * 0.8, y0 + s * (5.5 + (i % 2) * 1.5), f], s * 1.1, s * 1.3, i === 1 ? K.leaf2 : K.leaf, key + 0.001 * i, { g: D.group() });
    D.ell([a + sw, y0 + s * 8, f], s * 0.6, s * 0.6, K.fruit, key + 0.01, { g: D.group() });
  } else if (cold || k === 1) {
    for (let i = 0; i < 3; i++) D.shape([a + sw, y0 + s * (3 + i * 2.2), f], [-s * (2.6 - i * 0.6), 0, s * (2.6 - i * 0.6), 0, 0, -s * 3.2], i === 2 ? K.leaf2 : K.leaf, key + 0.001 * i, { g: D.group(), flat: 0.3 });
  } else if (dry && k === 2) {
    for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI * 2; D.cap([a + sw, y0 + s * 5, f], [a + sw + Math.cos(t) * s * 3, y0 + s * 4 + Math.sin(t) * s * 0.8 - s * 0.6, f + Math.sin(t) * s], s * 0.6, s * 0.2, K.leaf, key + 0.002, { g: D.group() }); }
  } else {
    D.ell([a + sw, y0 + s * 6.2, f], s * 2.3, s * 2, K.leaf, key + 0.001, { g: D.group() });
    D.ell([a + sw - s * 0.6, y0 + s * 6.9, f], s * 1.2, s * 1, K.leaf2, key + 0.002, { g: D.group(), noLine: true });
  }
  for (let i = 0; i < fruit; i++) {
    const t = i * 2.1 + a * 0.7 + f * 0.3;
    D.ell([a + sw + Math.cos(t) * s * 1.5, y0 + s * (6.1 + Math.sin(t) * 0.9), f + s * 1.2], s * 0.42, s * 0.42, K.fruit, key + 0.01 + i * 0.0001, { g: D.group(), noLine: true });
  }
}
/** a fence or rail along a path of [a, f] points */
export function fence(x: Ctx, path: Pt[], h: number, m: Mat, every = 4, sharp = false) {
  const D = x.D;
  for (let i = 0; i < path.length - 1; i++) {
    const [a0, f0] = path[i], [a1, f1] = path[i + 1], L = Math.hypot(a1 - a0, f1 - f0), n = Math.max(1, Math.round(L / every));
    for (let j = 0; j <= n; j++) {
      if (j === n && i < path.length - 2) continue;
      const a = a0 + ((a1 - a0) * j) / n, f = f0 + ((f1 - f0) * j) / n;
      D.cap([a, 0, f], [a, h, f], sharp ? 0.9 : 0.55, sharp ? 0.25 : 0.5, m, D.depth([a, h / 2, f]), { g: D.group() });
    }
    if (!sharp) for (const y of [h * 0.45, h * 0.85]) D.cap([a0, y, f0], [a1, y, f1], 0.4, 0.4, m, D.depth([(a0 + a1) / 2, y, (f0 + f1) / 2]) + 0.001, { g: D.group() });
  }
}
/** stakes, sandbags, crenellations along the top of a straight wall */
export function merlons(x: Ctx, a0: number, f0: number, a1: number, f1: number, y: number, h: number, t: number, m: Mat, every = 4) {
  const L = Math.hypot(a1 - a0, f1 - f0), n = Math.max(1, Math.floor(L / every));
  const da = (a1 - a0) / L, df = (f1 - f0) / L;
  for (let i = 0; i < n; i++) {
    const c = (L * (i + 0.5)) / n, w = (L / n) * 0.28;
    const ca = a0 + da * c, cf = f0 + df * c;
    const pa = Math.abs(da) > 0.5 ? w : t / 2, pf = Math.abs(da) > 0.5 ? t / 2 : w;
    box(x, ca - pa, cf - pf, ca + pa, cf + pf, y, y + h, m, m);
  }
}
export function crate(x: Ctx, a: number, f: number, y: number, s: number, m: Mat) { return box(x, a - s / 2, f - s / 2, a + s / 2, f + s / 2, y, y + s, m, m); }
export function barrel(x: Ctx, a: number, f: number, y: number, s: number, m: Mat) { return cyl(x, a, f, s * 0.55, y, y + s * 1.4, m, m); }
export function sack(x: Ctx, a: number, f: number, y: number, s: number, m: Mat) { x.D.ell([a, y + s * 0.45, f], s * 0.5, s * 0.45, m, x.D.depth([a, y, f]), { g: x.D.group() }); }
/** antenna mast with a blinking beacon */
export function antenna(x: Ctx, p: V3, h: number) {
  const D = x.D;
  D.cap(p, [p[0], p[1] + h, p[2]], 0.6, 0.3, x.K.metal, D.depth(p) + 0.04, { g: D.group() });
  for (let i = 1; i < 3; i++) D.cap([p[0] - 1.5, p[1] + h * (i / 3), p[2]], [p[0] + 1.5, p[1] + h * (i / 3), p[2]], 0.3, 0.3, x.K.metal, D.depth(p) + 0.041, { g: D.group() });
  lamp(x, [p[0], p[1] + h, p[2]], x.K.fire, true, 0.8);
}
/** a dish that sweeps slowly */
export function dish(x: Ctx, p: V3, r: number) {
  const D = x.D, sw = Math.cos(x.ph);
  D.cap(p, [p[0], p[1] + r * 0.8, p[2]], 0.7, 0.5, x.K.metal, D.depth(p) + 0.04, { g: D.group() });
  D.ell([p[0], p[1] + r * 1.1, p[2]], r * Math.max(0.25, Math.abs(sw)), r * 0.8, x.K.metal, D.depth(p) + 0.05, { g: D.group() }, 0.4);
  D.ell([p[0] + sw * 0.8, p[1] + r * 1.1, p[2]], 0.6, 0.6, x.K.dark, D.depth(p) + 0.06, { g: D.group() });
}
/** a tilted solar panel on legs */
export function solarPanel(x: Ctx, a: number, f: number, y: number, w: number, d: number) {
  const K = x.K;
  x.D.cap([a, y, f], [a, y + 1.6, f], 0.4, 0.4, K.metal, x.D.depth([a, y, f]));
  facet(x, [[a - w / 2, y + 1, f + d / 2], [a + w / 2, y + 1, f + d / 2], [a + w / 2, y + 2.8, f - d / 2], [a - w / 2, y + 2.8, f - d / 2]], K.solar, x.D.depth([a, y + 2, f]) + 0.001, x.D.group(), null, true);
}
/** a striped awning over a shop front (on the +f side of [a0,a1] at height y) */
export function awning(x: Ctx, a0: number, a1: number, f: number, y: number, depth: number, m1: Mat, m2: Mat) {
  const n = Math.max(2, Math.round((a1 - a0) / 2.4)), key = x.D.depth([(a0 + a1) / 2, y, f + depth / 2]) + 0.05;
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n, s1 = a0 + ((a1 - a0) * (i + 1)) / n;
    facet(x, [[s0, y, f], [s1, y, f], [s1, y - depth * 0.55, f + depth], [s0, y - depth * 0.55, f + depth]], i % 2 ? m2 : m1, key, x.D.group(), null, true);
    facet(x, [[s0, y - depth * 0.55, f + depth], [s1, y - depth * 0.55, f + depth], [(s0 + s1) / 2, y - depth * 0.55 - 1.4, f + depth]], i % 2 ? m2 : m1, key + 0.001, x.D.group(), null, true);
  }
}
/** a sign board with glyphs of the culture's script (never real letters) */
export function sign(x: Ctx, v: Vol, s: number, u: number, y: number, w: number, h: number, seed: number) {
  const K = x.K, neon = x.e >= 5;
  if (!onWall(x, v, s, u, y, w, h, 'rect', neon ? K.dark : K.wood, 0.02)) return;
  const n = Math.max(2, Math.floor(w / 2.4));
  for (let i = 0; i < n; i++) {
    const q = frac(Math.sin(seed * 91.7 + i * 12.3) * 4375.5);
    const gu = u - w / 2 + (w * (i + 0.5)) / n;
    const on = !neon || frac(x.t * 2 + i * 0.1) > 0.12;
    if (on) onWall(x, v, s, gu, y + (q - 0.5) * h * 0.2, w / n * 0.55, h * (0.45 + q * 0.3), (['rect', 'tri', 'round', 'cross'] as WinShape[])[Math.floor(q * 4)], neon ? K.glow2 : K.accent2, 0.025);
  }
}
/** crop rows on a plot; plants sway */
export function cropRows(x: Ctx, a0: number, f0: number, a1: number, f1: number, m: Mat, tall0 = 1.6) {
  const D = x.D, tall = tall0 * 2.5; // 1.6 = a waist-high crop next to a citizen
  ground(x, rect(a0, f0, a1, f1), x.K.soil, 0.05, 1);
  const rows = Math.max(2, Math.floor((f1 - f0) / Math.max(3, tall * 0.9)));
  for (let i = 0; i < rows; i++) {
    const f = f0 + ((f1 - f0) * (i + 0.5)) / rows, n = Math.max(2, Math.floor((a1 - a0) / Math.max(2.2, tall * 0.55)));
    for (let j = 0; j < n; j++) {
      const a = a0 + ((a1 - a0) * (j + 0.5)) / n, sw = Math.sin(x.ph + a * 0.4 + f * 0.2) * 0.35;
      D.ell([a + sw * tall * 0.4, tall * 0.6, f], Math.max(1.1, tall * 0.28), tall * 0.7, m, D.depth([a, 0, f]) - 5e3, { g: D.group(), noLine: j % 2 === 1 });
    }
  }
}
export { TOP, FLOOR };
export type { Plan };
/** index of the wall that faces the front (+f) */
export function frontSide(v: Vol) {
  if (v.kind === 'round') return 0;
  let best = 0, bf = -2;
  for (let s = 0; s < v.ring.length; s++) { const n = wallFrame(v, s, 0, v.y0)!.n; if (n[2] > bf) { bf = n[2]; best = s; } }
  return best;
}
