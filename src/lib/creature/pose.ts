// Directional 2D sketching.
//
// The creatures stay flat pixel art: every piece is still a 2D ellipse, tapered capsule or polygon
// painted by raster.ts with the same shading and outlines. What changes per facing direction is only
// *where* each piece goes and in which order it is painted - exactly like a pixel artist redrawing a
// sprite facing down, up, sideways or at 3/4. Anchor points are described in the creature's own
// frame (x forward, y up, z to its side) and placed on the sprite for the chosen facing; pieces are
// then painted back to front.
import { Part, Mat } from './raster';

export type V3 = [number, number, number];
export interface PO { g?: number; dark?: number; noLine?: boolean; flat?: number; bias?: number }

/** The five drawn facings (the other three are mirrors). yaw: 0 = right, +90° = towards the viewer. */
export const FACINGS = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, NE: -Math.PI / 4, N: -Math.PI / 2 } as const;
export type Dir8 = 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE';
export const DIRS: Dir8[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export const DIR_PT: Record<Dir8, string> = { E: 'Direita', SE: 'Baixo-direita', S: 'Baixo', SW: 'Baixo-esquerda', W: 'Esquerda', NW: 'Cima-esquerda', N: 'Cima', NE: 'Cima-direita' };
/** which drawn facing a direction uses, and whether it is mirrored */
export const DIR_SRC: Record<Dir8, [keyof typeof FACINGS, boolean]> = {
  E: ['E', false], SE: ['SE', false], S: ['S', false], SW: ['SE', true], W: ['E', true], NW: ['NE', true], N: ['N', false], NE: ['NE', false],
};

const PITCH = 0.3; // the game's 3/4 camera looks slightly down

export class Sketch {
  private items: { part: Part; key: number; n: number }[] = [];
  private cy: number; private sy: number; private cp = Math.cos(PITCH); private sp = Math.sin(PITCH);
  readonly yaw: number;
  constructor(yaw: number) { this.yaw = yaw; this.cy = Math.cos(yaw); this.sy = Math.sin(yaw); }

  /** anchor -> [screen x, screen y (down), depth towards the viewer] */
  P(p: V3): [number, number, number] {
    const xw = p[0] * this.cy - p[2] * this.sy, zw = p[0] * this.sy + p[2] * this.cy;
    return [xw, -p[1] * this.cp + zw * this.sp, zw * this.cp + p[1] * this.sp];
  }
  /** how much a direction in the creature frame points at the viewer (-1 away .. 1 towards) */
  facing(d: V3): number { const l = Math.hypot(d[0], d[1], d[2]) || 1; return this.P([d[0] / l, d[1] / l, d[2] / l])[2]; }
  /** projected 2D direction of a unit vector (length < 1 when it points at / away from the viewer) */
  flat(d: V3): [number, number] { const a = this.P(d); return [a[0], a[1]]; }

  private push(part: Part, depth: number, o: PO) {
    this.items.push({ part: { ...part, g: o.g, dark: o.dark, noLine: o.noLine, flat: o.flat }, key: depth + (o.bias ?? 0), n: this.items.length });
  }
  /** round piece */
  ball(c: V3, r: number, m: Mat, o: PO = {}) { const [x, y, d] = this.P(c); this.push({ s: { k: 'e', x, y, rx: Math.max(0.5, r), ry: Math.max(0.5, r), a: 0 }, m }, d, o); }
  /** elongated piece along `axis` (it foreshortens when the axis points at the viewer) */
  blob(c: V3, axis: V3, rLong: number, rShort: number, m: Mat, o: PO = {}, rShortY = rShort) {
    const [x, y, d] = this.P(c);
    const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const [ax, ay] = this.flat([axis[0] / l, axis[1] / l, axis[2] / l]);
    const L = Math.hypot(ax, ay);
    const along = Math.max(rShort, rLong * L);
    const a = L > 0.05 ? Math.atan2(ay, ax) : 0;
    this.push({ s: { k: 'e', x, y, rx: Math.max(0.5, along), ry: Math.max(0.5, L > 0.05 ? rShortY : Math.max(rShort, rShortY)), a }, m }, d, o);
  }
  /** flat 2D ellipse drawn facing the viewer (eyes, pupils, buttons) */
  disc(c: V3, rx: number, ry: number, rot: number, m: Mat, o: PO = {}) { const [x, y, d] = this.P(c); this.push({ s: { k: 'e', x, y, rx: Math.max(0.5, rx), ry: Math.max(0.5, ry), a: rot }, m }, d, o); }
  limb(a: V3, b: V3, ra: number, rb: number, m: Mat, o: PO = {}) {
    const A = this.P(a), B = this.P(b);
    this.push({ s: { k: 'c', x1: A[0], y1: A[1], x2: B[0], y2: B[1], r1: ra, r2: rb }, m }, (A[2] + B[2]) / 2, o);
  }
  poly(pts: V3[], m: Mat, o: PO = {}) {
    const q = pts.map(p => this.P(p));
    this.push({ s: { k: 'p', pts: q.flatMap(v => [v[0], v[1]]) }, m }, q.reduce((s, v) => s + v[2], 0) / q.length, o);
  }
  /** screen-space polygon anchored at a point (for things that always face the viewer) */
  poly2(c: V3, pts: number[], m: Mat, o: PO = {}) {
    const [x, y, d] = this.P(c);
    const q: number[] = [];
    for (let i = 0; i < pts.length; i += 2) q.push(x + pts[i], y + pts[i + 1]);
    this.push({ s: { k: 'p', pts: q }, m }, d, o);
  }
  /** chain of capsules (tails, necks, tentacles). yaw/pitch are in the creature frame. */
  chain(a: V3, yaw: number, pitch: number, n: number, len: number, r0: number, r1: number, bend: (i: number) => [number, number], m: Mat, o: PO = {}): V3[] {
    const pts: V3[] = [a];
    let yw = yaw, pt = pitch, c = a;
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const [dp, dy] = bend(i);
      pt += dp; yw += dy;
      const nx: V3 = [c[0] + Math.cos(pt) * Math.cos(yw) * seg, c[1] + Math.sin(pt) * seg, c[2] + Math.cos(pt) * Math.sin(yw) * seg];
      this.limb(c, nx, r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n), m, o);
      pts.push(nx);
      c = nx;
    }
    return pts;
  }
  /** Painter's order: far to near (stable for equal depth). */
  parts(): Part[] { return this.items.sort((a, b) => a.key - b.key || a.n - b.n).map(i => i.part); }
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Two-bone joint position between `a` and `f` bending towards `pole`. */
export function ik3(a: V3, f: V3, l1: number, l2: number, pole: V3): V3 {
  const d = sub(f, a);
  const dist = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, len3(d)));
  const dir = norm(d);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2];
  const p = norm(sub(pole, mul(dir, pd)));
  return add(add(a, mul(dir, along)), mul(p, h));
}
