// Draws an item in its own grip frame on a creature Sketch - the same flat 2D pieces as the creatures (capsules,
// ellipses, polygons painted by raster.ts); only *where* they go changes with the hand, the pose and the facing.
// Local coordinates: a = along the haft (towards the tip), f = the edge / front direction, c = to the side (the
// normal of a blade's flat). The grip (the main hand) is at a = 0.
import type { Mat } from '../creature/raster';
import type { Sketch, V3 } from '../creature/pose';

export interface Frame { o: V3; u: V3; f: V3; s: V3 }
const LN = (() => { const x = -0.45, y = -0.7, z = 0.56, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** orthonormal frame from an axis and an approximate front direction */
export function frame(o: V3, u: V3, fApprox: V3): Frame {
  const U = nrm(u);
  let f: V3 = [fApprox[0] - U[0] * dot(fApprox, U), fApprox[1] - U[1] * dot(fApprox, U), fApprox[2] - U[2] * dot(fApprox, U)];
  if (Math.hypot(f[0], f[1], f[2]) < 1e-4) f = Math.abs(U[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  f = nrm(f);
  return { o, u: U, f, s: cross(U, f) };
}

export class Forge {
  constructor(readonly S: Sketch, readonly fr: Frame, readonly bias = 0) {}
  /** local [a, f, c] -> creature frame */
  W(a: number, f = 0, c = 0): V3 {
    const { o, u, f: F, s } = this.fr;
    return [o[0] + u[0] * a + F[0] * f + s[0] * c, o[1] + u[1] * a + F[1] * f + s[1] * c, o[2] + u[2] * a + F[2] * f + s[2] * c];
  }
  dir(a: number, f = 0, c = 0): V3 { const { u, f: F, s } = this.fr; return [u[0] * a + F[0] * f + s[0] * c, u[1] * a + F[1] * f + s[1] * c, u[2] * a + F[2] * f + s[2] * c]; }
  /** brightness of a flat piece whose normal is `n` (creature frame); two-sided */
  light(n: V3) {
    const S = this.S, z = S.facing(n), [x, y] = S.flat(nrm(n));
    const sg = z < 0 ? -1 : 1, d = (x * LN[0] + y * LN[1]) * sg + Math.abs(z) * LN[2];
    return Math.max(0.55, Math.min(1.25, (0.62 + 0.38 * d) / 0.8));
  }
  /** round bar along the haft axis, optionally offset in f / c */
  rod(a0: number, a1: number, r0: number, r1: number, m: Mat, f0 = 0, f1 = f0, c = 0, b = 0) {
    this.S.limb(this.W(a0, f0, c), this.W(a1, f1, c), r0, r1, m, { bias: this.bias + b });
  }
  /** bar between two local points */
  bar(p: [number, number, number], q: [number, number, number], r0: number, r1: number, m: Mat, b = 0) {
    this.S.limb(this.W(...p), this.W(...q), r0, r1, m, { bias: this.bias + b });
  }
  ball(p: [number, number, number], r: number, m: Mat, b = 0) { this.S.ball(this.W(...p), r, m, { bias: this.bias + b }); }
  /** flat polygon in the blade plane ([a, f] points) at side offset c; lit by its facing */
  blade(pts: [number, number][], m: Mat, c = 0, b = 0, flat = 0.85) {
    this.S.poly(pts.map(([a, f]) => this.W(a, f, c)), m, { dark: this.light(this.fr.s), flat, bias: this.bias + b });
  }
  /** flat polygon in the plane across the blade ([a, c] points: axes, guards seen edge-on in the blade view) */
  cross(pts: [number, number][], m: Mat, f = 0, b = 0) {
    this.S.poly(pts.map(([a, c]) => this.W(a, f, c)), m, { dark: this.light(this.fr.f), flat: 0.85, bias: this.bias + b });
  }
  /** any flat polygon of local points with its own normal */
  plate(pts: [number, number, number][], m: Mat, b = 0) {
    const W = pts.map(p => this.W(...p));
    const n = cross([W[1][0] - W[0][0], W[1][1] - W[0][1], W[1][2] - W[0][2]], [W[W.length - 1][0] - W[0][0], W[W.length - 1][1] - W[0][1], W[W.length - 1][2] - W[0][2]]);
    this.S.poly(W, m, { dark: this.light(n), flat: 0.85, bias: this.bias + b });
  }
  /** a disc (shield face, lens, dial) in the plane spanned by the f and a axes, seen as its projection */
  hull(pts: [number, number, number][], m: Mat, b = 0, flat = 0.3) {
    const q = pts.map(p => { const w = this.S.P(this.W(...p)); return [w[0], w[1]] as [number, number]; });
    const h = convexHull(q);
    if (h.length < 3) return;
    let d = 0;
    for (const p of pts) d += this.S.P(this.W(...p))[2] / pts.length;
    // Sketch has no public raw push: use poly2 anchored at the origin projected back
    const o = this.S.P(this.fr.o);
    this.S.poly2(this.fr.o, h.flatMap(([x, y]) => [(x - o[0]) / this.S.k, (y - o[1]) / this.S.k]), m, { bias: this.bias + b + (d - o[2]), flat });
  }
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
