// Directional 2D drafting for structures - the same idea as the creatures' Sketch (pose.ts).
//
// A structure stays flat pixel art: every piece is a 2D polygon, ellipse or tapered capsule painted
// by the creatures' rasterizer (raster.ts) with its ramps, dithering, textures and outlines. For each
// facing the drafter only decides *where* each piece goes and the painting order - like a pixel
// artist redrawing a building from the front, at 3/4 or from the side. Anchor points are described
// in the building's own frame: a = across the front (to its right), y = up, f = towards the front
// door. Round things (towers, domes, tanks, cones, pods) are drawn as one 2D silhouette each, which
// the rasterizer shades like a sculpted volume; flat walls and roof slopes are single polygons lit
// by which way they face. Five facings are drawn (E, SE, S, NE, N); the other three are mirrors.
import type { Part, Mat } from '../creature/raster';

export type V3 = [number, number, number];
export interface DO { g?: number; dark?: number; flat?: number; noLine?: boolean; bias?: number; uv?: [V3, V3, V3] }

/** same 3/4 camera as the creatures */
const PITCH = 0.3;
const LN = (() => { const x = -0.45, y = -0.7, z = 0.56, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();

export class Draft {
  private items: { part: Part; key: number; n: number; tag: string }[] = [];
  /** stacking level: every piece drawn at level n sorts after all pieces of lower levels (things mounted on a body
   * are always painted over it, whatever their depth) - vehicles use it; structures stay on level 0 */
  level = 0;
  /** tag of the pieces being drawn (vehicles: 't0', 't1'... for turrets that are exported as separate sprites) */
  tag = '';
  private cy: number; private sy: number;
  readonly cp = Math.cos(PITCH); readonly sp = Math.sin(PITCH);
  private gid = 1000;
  /** yaw: FACINGS[...] of pose.ts (0 = the front door faces right, +90° = it faces the viewer) */
  constructor(readonly yaw: number, readonly k = 1, readonly ph = 0) { this.cy = Math.cos(yaw); this.sy = Math.sin(yaw); }

  group() { return ++this.gid; }
  private raw(p: V3): V3 {
    const x = p[2], z = -p[0];
    const xw = x * this.cy - z * this.sy, zw = x * this.sy + z * this.cy;
    return [xw, -p[1] * this.cp + zw * this.sp, zw * this.cp + p[1] * this.sp];
  }
  /** anchor -> [screen x, screen y (down), depth towards the viewer] (scaled) */
  P(p: V3): V3 { const r = this.raw(p); return [r[0] * this.k, r[1] * this.k, r[2] * this.k]; }
  depth(p: V3) { return this.raw(p)[2]; }
  /** how much a direction points at the viewer (-1 away .. 1 towards) */
  facing(n: V3) { const l = Math.hypot(n[0], n[1], n[2]) || 1; return this.raw([n[0] / l, n[1] / l, n[2] / l])[2]; }
  /** brightness multiplier for a flat piece facing `n` (fixed top-left light, like the creatures) */
  light(n: V3) {
    const l = Math.hypot(n[0], n[1], n[2]) || 1, r = this.raw([n[0] / l, n[1] / l, n[2] / l]);
    const d = r[0] * LN[0] + r[1] * LN[1] + r[2] * LN[2];
    return Math.max(0.5, Math.min(1.25, (0.62 + 0.38 * d) / 0.8));
  }

  private push(part: Part, key: number, o: DO) {
    part.g = o.g; part.dark = o.dark; part.noLine = o.noLine; part.flat = o.flat;
    this.items.push({ part, key: key + (o.bias ?? 0) + this.level * 1000, n: this.items.length, tag: this.tag });
  }

  /** polygon through anchor points (walls, roof slopes, windows, sails, flags) */
  poly(pts: V3[], m: Mat, key: number, o: DO = {}) {
    const q = pts.map(p => this.P(p));
    const part: Part = { s: { k: 'p', pts: q.flatMap(v => [v[0], v[1]]) }, m };
    if (o.uv) {
      // texture frame: u along the wall/slope, v up it, both in building units
      const [O, U, V] = o.uv, so = this.P(O), su = this.P(U), sv = this.P(V);
      const eu = [su[0] - so[0], su[1] - so[1]], ev = [sv[0] - so[0], sv[1] - so[1]];
      const det = eu[0] * ev[1] - eu[1] * ev[0];
      if (Math.abs(det) > 1e-6) {
        // texture units are screen pixels, so bricks, planks and tiles keep their pixel size at every LOD
        const Lu = Math.hypot(U[0] - O[0], U[1] - O[1], U[2] - O[2]) * this.k, Lv = Math.hypot(V[0] - O[0], V[1] - O[1], V[2] - O[2]) * this.k;
        const a = (ev[1] / det) * Lu, b = (-ev[0] / det) * Lu, d = (-eu[1] / det) * Lv, e = (eu[0] / det) * Lv;
        part.uv = [a, b, -(a * so[0] + b * so[1]), d, e, -(d * so[0] + e * so[1])];
      }
    }
    this.push(part, key, o);
  }
  /** screen-space polygon at an anchor (offsets in building units, unscaled) */
  shape(c: V3, pts: number[], m: Mat, key: number, o: DO = {}) {
    const [x, y] = this.P(c);
    const q: number[] = [];
    for (let i = 0; i < pts.length; i += 2) q.push(x + pts[i] * this.k, y + pts[i + 1] * this.k);
    this.push({ s: { k: 'p', pts: q }, m }, key, o);
  }
  /** screen-facing ellipse (puffs of smoke, lamps, foliage, fruit, flames) */
  ell(c: V3, rx: number, ry: number, m: Mat, key: number, o: DO = {}, rot = 0) {
    const [x, y] = this.P(c);
    this.push({ s: { k: 'e', x, y, rx: Math.max(0.5, rx * this.k), ry: Math.max(0.5, ry * this.k), a: rot }, m }, key, o);
  }
  /** tapered capsule between two anchors (posts, stilts, pipes, masts, beams, ropes) */
  cap(a: V3, b: V3, r1: number, r2: number, m: Mat, key: number, o: DO = {}) {
    const A = this.P(a), B = this.P(b);
    this.push({ s: { k: 'c', x1: A[0], y1: A[1], x2: B[0], y2: B[1], r1: Math.max(0.5, r1 * this.k), r2: Math.max(0.5, r2 * this.k) }, m }, key, o);
  }
  /** one 2D silhouette around a set of anchors (the outline a pixel artist would draw for a round volume) */
  hull(pts: V3[], m: Mat, key: number, o: DO = {}) {
    const q = convexHull(pts.map(p => { const s = this.P(p); return [s[0], s[1]] as [number, number]; }));
    if (q.length < 3) return;
    this.push({ s: { k: 'p', pts: q.flat() }, m }, key, o);
  }

  /** Painter's order: far to near (stable for equal keys). */
  parts(): Part[] { return this.items.sort((a, b) => a.key - b.key || a.n - b.n).map(i => i.part); }
  /** painter's order with each piece's tag */
  tagged(): { part: Part; tag: string }[] { return this.items.sort((a, b) => a.key - b.key || a.n - b.n).map(i => ({ part: i.part, tag: i.tag })); }
}

export function convexHull(p: [number, number][]): [number, number][] {
  const pts = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

/** points of a horizontal circle (for silhouettes of round volumes) */
export const ring = (a: number, f: number, y: number, r: number, n = 16, rf = r): V3[] =>
  Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [a + Math.sin(t) * r, y, f + Math.cos(t) * rf] as V3; });
