// Naval vehicles: canoes and rafts to container ships and hover barges, war canoes and longships to stealth
// corvettes, frigates to cruisers, ships of the line to floating fortresses, and submarines that dive (transform).
// Every ship is twice the size of the land/air vehicle of the same tier (the tier's Z already carries that).
// Hulls sit on the waterline (y = 0); nothing is drawn under the water except the dim shape of a diving hull.
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { box, cyl, prism, facet, flag, lamp, fire, crate, barrel, roofOn, Pt, Vol } from '../structure/parts';
import { VCtx, yawAt, turret, shot, exhaust, moving, shotAge, frac, wake, propeller, canopy, wing, Gun } from './vparts';

const tier = (x: VCtx) => (x.size === 'large' ? 2 : x.size === 'medium' ? 1 : 0);
const smooth = (v: number) => { const c = Math.max(0, Math.min(1, v)); return c * c * (3 - 2 * c); };

// ---------------------------------------------------------------------------------------------------
// Hull, rigging, oars, deck gear
// ---------------------------------------------------------------------------------------------------
/** the deck outline: square or round stern, a bow that is blunt (fine 0) or sharp (fine 1) */
function deckRing(W: number, L: number, fine: number, stern: 'square' | 'round'): Pt[] {
  const r: Pt[] = stern === 'round' ? [[W * 0.18, -L / 2], [W * 0.42, -L * 0.43]] : [[W * 0.42, -L / 2]];
  r.push([W / 2, -L * 0.25], [W / 2, L * (0.14 - fine * 0.16)], [W * 0.42, L * (0.31 - fine * 0.05)], [W * 0.2, L * 0.44], [0, L / 2]);
  return [...r, ...r.slice(0, -1).reverse().map(([a, f]) => [-a, f] as Pt)];
}
/** a hull from the waterline (y0) to the deck; the sides flare out from a narrower bottom */
function shipHull(x: VCtx, W: number, L: number, fb: number, side: Mat, deck: Mat | null, fine = 0.5, stern: 'square' | 'round' = 'square', y0 = 0): Vol {
  const top = deckRing(W, L, fine, stern), bot = top.map(([a, f]) => [a * 0.72, f * 0.96] as Pt);
  return prism(x, bot, y0, y0 + fb, side, deck, { topRing: top });
}
/** raised castle / deckhouse on the deck */
const house = (x: VCtx, a0: number, f0: number, a1: number, f1: number, y0: number, y1: number, m: Mat, top: Mat = m, bias = 0.05) => box(x, a0, f0, a1, f1, y0, y1, m, top, bias);
/** a band of windows on the front and sides of a deckhouse */
function bridgeGlass(x: VCtx, a0: number, f0: number, a1: number, f1: number, y: number, h: number) {
  const D = x.D, g = x.P.glass;
  facet(x, [[a0 + 0.3, y, f1 + 0.08], [a1 - 0.3, y, f1 + 0.08], [a1 - 0.3, y + h, f1 + 0.08], [a0 + 0.3, y + h, f1 + 0.08]], g, D.depth([0, y, f1]) + 0.2, D.group(), [(a0 + a1) / 2, y, (f0 + f1) / 2]);
  for (const s of [-1, 1]) { const a = s > 0 ? a1 + 0.08 : a0 - 0.08; facet(x, [[a, y, f0 + 0.6], [a, y, f1 - 0.6], [a, y + h, f1 - 0.6], [a, y + h, f0 + 0.6]], g, D.depth([a, y, (f0 + f1) / 2]) + 0.2, D.group(), [(a0 + a1) / 2, y, (f0 + f1) / 2]); }
}
function mast(x: VCtx, f: number, y0: number, y1: number, r = 0.55, m?: Mat) {
  x.D.cap([0, y0, f], [0, y1, f], r, r * 0.7, m ?? x.P.wood, x.D.depth([0, (y0 + y1) / 2, f]));
}
/** a square sail on its yard; it fills (bellies forward) while under way */
const BRACE = -0.45;
function squareSail(x: VCtx, f: number, y0: number, y1: number, w: number, m: Mat, stripe?: Mat) {
  const D = x.D, b = (moving(x) ? 1.5 : 0.45) * w * 0.12 * (1 + 0.08 * Math.sin(x.ph * 2)), ym = (y0 + y1) / 2;
  // the yards are braced round a little, so the sails still read when the ship is seen from the side
  const br = (p: V3): V3 => yawAt(p, 0, f, BRACE);
  const sheet = (k: number): V3[] => ([[-w * k, y1, f], [w * k, y1, f], [w * k * 1.04, ym, f + b], [w * k * 0.92, y0, f + b * 0.5], [-w * k * 0.92, y0, f + b * 0.5], [-w * k * 1.04, ym, f + b]] as V3[]).map(br);
  const key = D.depth([0, ym, f + b * 0.5]) + 0.02;
  facet(x, sheet(0.5), m, key, D.group(), null, true);
  if (stripe) facet(x, sheet(0.17).map(p => [p[0], p[1], p[2] + 0.06] as V3), stripe, key + 0.001, D.group(), null, true);
  D.cap(br([-w * 0.56, y1, f]), br([w * 0.56, y1, f]), 0.35, 0.35, x.P.wood, key + 0.002);
}
/** a fore-and-aft sail (gaff, jib or lateen) that swings out to leeward under way */
function foreSail(x: VCtx, f: number, y0: number, y1: number, len: number, m: Mat, lateen = false) {
  const D = x.D, sw = (moving(x) ? 0.38 : 0.08) + Math.sin(x.ph) * 0.03, bx = -Math.sin(sw) * len, bf = f - Math.cos(sw) * len;
  const belly = moving(x) ? -1.2 : -0.3;
  const pts: V3[] = lateen
    ? [[0, y0 + (y1 - y0) * 0.15, f + len * 0.35], [bx * 0.55 + belly, (y0 + y1) / 2, f - len * 0.1], [bx * 0.7, y1, bf + len * 0.2], [bx, y0 + 0.5, bf]]
    : [[0, y1, f], [bx * 0.55 + belly, (y0 + y1) / 2, (f + bf) / 2], [bx, y0, bf], [0, y0, f]];
  const key = D.depth([bx * 0.5, (y0 + y1) / 2, (f + bf) / 2]) + 0.02;
  facet(x, pts, m, key, D.group(), null, true);
  if (lateen) D.cap(pts[0], pts[2], 0.3, 0.25, x.P.wood, key + 0.001); else D.cap([0, y0, f], [bx, y0, bf], 0.3, 0.3, x.P.wood, key + 0.001);
}
/** oars / paddles on both sides, pulling together while moving, shipped (raised) at rest */
function oars(x: VCtx, W: number, y: number, fs: number[], len: number, paddle = false) {
  const D = x.D, row = x.anim !== 'idle';
  for (const s of [-1, 1]) for (const f of fs) {
    const ph = x.ph, sweep = row ? Math.sin(ph) * len * 0.3 : 0, dip = row ? (Math.cos(ph) > 0 ? 0 : 0.8) : 1.2;
    const a0: V3 = paddle ? [s * W * 0.42, y + 2.2, f] : [s * W * 0.5, y, f];
    const a1: V3 = [s * (W * 0.5 + len * (paddle ? 0.35 : 0.8)), row ? 0.3 + dip * len * 0.25 : y + len * 0.1, f + sweep];
    const key = D.depth([s * W * 0.55, y, f]) + 0.05;
    D.cap(a0, a1, 0.25, 0.25, x.P.wood, key);
    D.ell(a1, paddle ? 0.8 : 0.6, paddle ? 0.5 : 0.4, x.P.wood, key + 0.001, { g: D.group() });
    if (row && dip === 0 && moving(x)) D.ell([a1[0], 0.2, a1[2] - 0.8], 1, 0.4, x.P.foam, -900, { g: D.group(), noLine: true });
  }
}
/** round shields hung along the rail (longships) */
function shieldRow(x: VCtx, W: number, y: number, fs: number[], m: Mat, m2: Mat) {
  const D = x.D;
  for (const s of [-1, 1]) {
    if (D.facing([s, 0, 0]) < 0.05) continue;
    fs.forEach((f, i) => { const c: V3 = [s * (W / 2 + 0.25), y, f]; D.ell(c, 1.2, 1.2, i % 2 ? m : m2, D.depth(c) + 0.1, { g: D.group() }); D.ell(c, 0.35, 0.35, x.P.metal, D.depth(c) + 0.11, { g: D.group() }); });
  }
}
/** a row of gun ports on the flared sides (hull of width W and freeboard fb), on a painted band; the side facing
 * the viewer fires a broadside */
function gunDeck(x: VCtx, W: number, fb: number, y: number, f0: number, f1: number, n: number, band?: Mat) {
  const D = x.D, fireSide = D.facing([1, 0, 0]) >= 0 ? 1 : -1;
  const side = (yy: number) => (W / 2) * (0.72 + 0.28 * Math.min(1, yy / fb)) + 0.05;
  for (const s of [-1, 1]) {
    const vis = D.facing([s, 0, 0]) > 0.05, a = s * side(y);
    if (vis && band) facet(x, [[s * side(y - 1), y - 1, f0 - 1], [s * side(y - 1), y - 1, f1 + 1], [s * side(y + 1), y + 1, f1 + 1], [s * side(y + 1), y + 1, f0 - 1]], band, D.depth([a, y, (f0 + f1) / 2]) + 0.09, D.group(), null, true);
    for (let i = 0; i < n; i++) {
      const f = f0 + ((f1 - f0) * (i + 0.5)) / n;
      if (vis) {
        facet(x, [[a, y - 0.55, f - 0.55], [a, y - 0.55, f + 0.55], [a, y + 0.55, f + 0.55], [a, y + 0.55, f - 0.55]], x.P.dark, D.depth([a, y, f]) + 0.1, D.group(), null, true);
        const rec = s === fireSide && shotAge(x) >= 0 && shotAge(x) < 0.15 ? -0.6 : 0;
        D.cap([a, y, f], [a + s * (1.2 + rec), y, f], 0.35, 0.3, x.P.dark, D.depth([a, y, f]) + 0.11);
      }
      if (s === fireSide && i % 2 === 0) shot(x, [a + s * 1.4, y, f], [s, 0, 0], 'broadside');
    }
  }
}
/** a funnel with its smoke */
function funnel(x: VCtx, a: number, f: number, r: number, y0: number, y1: number, m: Mat, kind: 'steam' | 'diesel' = 'steam') {
  cyl(x, a, f, r, y0, y1, m, x.P.dark, { flat: 0.3 });
  cyl(x, a, f, r * 1.02, y1 - 0.9, y1, x.P.dark, x.P.dark, { bias: 0.01 });
  exhaust(x, [a, y1 + 0.5, f], kind, r * 1.1);
}
/** vertical launch cells; while firing, missiles climb out on smoke */
function launchCells(x: VCtx, a0: number, f0: number, a1: number, f1: number, y: number) {
  const D = x.D;
  box(x, a0, f0, a1, f1, y, y + 0.6, x.P.dark, x.body2, 0.03);
  const age = shotAge(x);
  if (age < 0) return;
  for (let i = 0; i < 2; i++) {
    const g = Math.max(0, age - i * 0.2), p: V3 = [a0 + (a1 - a0) * (0.3 + i * 0.4), y + 1 + g * 70, f0 + (f1 - f0) * 0.5 + g * g * 40];
    if (g <= 0) continue;
    D.cap(p, [p[0], p[1] - 3, p[2] - 0.8], 0.55, 0.5, x.P.metal, 1e5 + 2);
    D.ell([p[0], p[1] - 3.8, p[2] - 1], 0.9, 1.3, x.P.fire2, 1e5 + 3, { g: D.group(), noLine: true });
    for (let j = 0; j < 4; j++) D.ell([p[0], p[1] - 5 - j * 3.2, p[2] - 1.2 - j], 1 + j * 0.5, 1 + j * 0.45, x.P.smoke, 1e5 - j, { g: D.group() });
  }
}
/** a lattice or pole mast with radar / sensors */
function sensorMast(x: VCtx, f: number, y0: number, h: number, e: number) {
  const D = x.D;
  mast(x, f, y0, y0 + h, 0.45, x.P.metal);
  const spin = x.ph * 2, c: V3 = [0, y0 + h * 0.8, f];
  if (e >= 4) D.cap([c[0] - Math.cos(spin) * 2.2, c[1], c[2] - Math.sin(spin) * 2.2], [c[0] + Math.cos(spin) * 2.2, c[1], c[2] + Math.sin(spin) * 2.2], 0.45, 0.45, x.P.dark, D.depth(c) + 0.05);
  lamp(x, [0, y0 + h + 0.4, f], e >= 6 ? x.P.glow : x.K.glow, true, 0.5);
}
/** a tiny aircraft on a carrier deck (launching while the carrier is in action) */
function deckJet(x: VCtx, a: number, y: number, f: number, s: number, m: Mat) {
  const D = x.D, key = D.depth([a, y, f]) + 0.3;
  D.cap([a, y + 0.5 * s, f - 2.5 * s], [a, y + 0.5 * s, f + 2.8 * s], 0.6 * s, 0.4 * s, m, key);
  facet(x, [[a, y + 0.4 * s, f + 1.2 * s], [a + 2.4 * s, y + 0.4 * s, f - 1 * s], [a - 2.4 * s, y + 0.4 * s, f - 1 * s]], m, key + 0.001, D.group(), null, true);
  facet(x, [[a, y + 0.5 * s, f - 1.6 * s], [a, y + 1.9 * s, f - 2.6 * s], [a, y + 0.5 * s, f - 2.6 * s]], m, key + 0.002, D.group(), null, true);
  canopy(x, f + 1.4 * s, y + 0.8 * s, 0.7 * s, 1.4 * s, 0.4 * s, 0.31);
}
/** a hovering hull: glowing skirt and spray instead of a wake */
function hoverSkirt(x: VCtx, W: number, L: number, y: number) {
  const D = x.D;
  D.poly(Array.from({ length: 18 }, (_, i) => { const t = (i / 18) * Math.PI * 2; return [Math.cos(t) * W * 0.55, 0.15, Math.sin(t) * L * 0.5] as V3; }), { ...x.P.glow, alpha: 0.35, line: null }, -940, { g: D.group(), flat: 0.9 });
  for (let i = 0; i < 6; i++) { const k = frac(x.t + i / 6); D.ell([Math.cos(i * 1.7) * W * 0.5, 0.4 + k * y * 0.6, Math.sin(i * 1.7) * L * 0.45], 1 + k * 1.5, 0.7 + k, x.P.foam, -930 + i, { g: D.group(), noLine: true }); }
}

// ---------------------------------------------------------------------------------------------------
// Civil
// ---------------------------------------------------------------------------------------------------
function boat(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 0) {
    if (b < 2) { // dugout canoe; the medium one gets an outrigger and a crab-claw sail
      const W = 2.8 * Z, L = 11 * Z, fb = 1.1 * Z;
      wake(x, W, L);
      shipHull(x, W, L, fb, P.wood, P.wood2, 1, 'round');
      oars(x, W, fb, [L * 0.2, -L * 0.1], 3.5, true);
      if (b === 1) {
        const oa = W * 1.9;
        for (const f of [-L * 0.15, L * 0.18]) D.cap([0, fb + 0.3, f], [oa, 0.9, f], 0.3, 0.3, P.wood, D.depth([oa / 2, fb, f]) + 0.05);
        D.cap([oa, 0.6, -L * 0.35], [oa, 0.6, L * 0.35], 0.7, 0.5, P.wood, D.depth([oa, 0.6, 0]));
        mast(x, L * 0.05, fb, fb + 9 * Z * 0.5);
        facet(x, [[0, fb + 0.5, L * 0.3], [0, fb + 9 * Z * 0.5, L * 0.05], [-2.5, fb + 7 * Z * 0.5, -L * 0.28 + (moving(x) ? 0 : 1)]], P.hide, D.depth([0, fb + 3, 0]) + 0.03, D.group(), null, true);
      }
      return;
    }
    // reed / log raft with a hut and a hide sail
    const W = 8 * Z, L = 12 * Z;
    wake(x, W, L);
    for (let i = 0; i < 7; i++) { const a = -W / 2 + (W * (i + 0.5)) / 7; D.cap([a, 0.7, -L / 2], [a, 0.7, L / 2], 0.75, 0.7, x.K.trunk, D.depth([a, 0.7, 0])); }
    const v = house(x, -W * 0.3, -L * 0.35, W * 0.3, -L * 0.05, 1.4, 5.5, P.wood2);
    roofOn(x, v, 'gable', x.K.roof, x.K.roof, { over: 0.6, alongF: true, pitch: 0.9 });
    mast(x, L * 0.18, 1.4, 1.4 + 11 * Z * 0.5);
    squareSail(x, L * 0.18, 4, 1.4 + 10.5 * Z * 0.5, W * 0.7, P.hide);
    fire(x, [W * 0.25, 1.5, L * 0.35], 0.9);
    return;
  }
  if (e === 1) { // sail boat, cog, two-masted trader
    const W = [4.2, 6, 7][b] * Z, L = [12, 17, 21][b] * Z, fb = [1.6, 2.4, 2.6][b] * Z;
    wake(x, W, L);
    shipHull(x, W, L, fb, P.wood2, P.wood2, 0.4, b ? 'square' : 'round');
    if (b) { house(x, -W * 0.45, -L * 0.48, W * 0.45, -L * 0.3, fb, fb + 2.4 * Z, P.wood2); house(x, -W * 0.3, L * 0.3, W * 0.3, L * 0.42, fb, fb + 1.8 * Z, P.wood2); }
    const H = [11, 16, 18][b] * Z;
    mast(x, L * 0.02, fb, fb + H);
    squareSail(x, L * 0.02, fb + H * 0.3, fb + H * 0.92, W * 1.5, P.sail, x.d[7] < 0.5 ? x.body : undefined);
    if (b === 2) { mast(x, L * 0.3, fb, fb + H * 0.65); squareSail(x, L * 0.3, fb + H * 0.25, fb + H * 0.6, W * 1, P.sail); }
    for (let i = 0; i < b * 2; i++) (i % 2 ? barrel : crate)(x, -W * 0.25 + (i % 2) * W * 0.5, -L * 0.15 + Math.floor(i / 2) * 2.4, fb, 1.8, P.wood);
    flag(x, [0, fb + H, L * 0.02], 3, 3, x.body);
    return;
  }
  if (e === 2) { // sloop, caravel (lateen), merchantman
    const W = [4.4, 7, 9][b] * Z, L = [13, 20, 26][b] * Z, fb = [1.8, 2.8, 3.4][b] * Z;
    wake(x, W, L);
    shipHull(x, W, L, fb, P.wood2, P.wood2, 0.55, 'square');
    house(x, -W * 0.46, -L * 0.48, W * 0.46, -L * 0.28, fb, fb + (b ? 3 : 1.5) * Z, P.wood2);
    if (b === 2) house(x, -W * 0.35, L * 0.28, W * 0.35, L * 0.4, fb, fb + 2.2 * Z, P.wood2);
    const H = [12, 17, 22][b] * Z;
    if (b === 0) { mast(x, L * 0.1, fb, fb + H); foreSail(x, L * 0.1, fb + 1, fb + H * 0.95, L * 0.5, P.sail); facet(x, [[0, fb + H * 0.9, L * 0.1], [0, fb + 0.8, L * 0.46], [0, fb + 0.8, L * 0.14]], P.sail, D.depth([0, fb + 4, L * 0.3]) + 0.03, D.group(), null, true); }
    else if (b === 1) { mast(x, L * 0.12, fb, fb + H); foreSail(x, L * 0.12, fb + 1, fb + H, L * 0.5, P.sail, true); mast(x, -L * 0.22, fb, fb + H * 0.7); foreSail(x, -L * 0.22, fb + 1, fb + H * 0.7, L * 0.3, P.sail, true); }
    else for (const [f, h] of [[L * 0.22, 0.8], [0, 1], [-L * 0.24, 0.72]] as [number, number][]) { mast(x, f, fb, fb + H * h); squareSail(x, f, fb + H * h * 0.32, fb + H * h * 0.62, W * 1.3 * h, P.sail); squareSail(x, f, fb + H * h * 0.66, fb + H * h * 0.94, W * 1.0 * h, P.sail); }
    D.cap([0, fb + 1, L * 0.48], [0, fb + 3.5, L * 0.5 + 5 * Z], 0.4, 0.3, P.wood, D.depth([0, fb, L * 0.5]) + 0.1); // bowsprit
    lamp(x, [0, fb + (b ? 3 : 1.5) * Z + 1, -L * 0.48], x.K.fire, false, 0.7);
    flag(x, [0, fb + H, 0], 3, 4, x.body);
    return;
  }
  if (e === 3) { // steam launch, paddle steamer, steamship
    const W = [4.5, 7.5, 9.5][b] * Z, L = [12, 22, 30][b] * Z, fb = [1.6, 2.6, 3.4][b] * Z;
    wake(x, W, L);
    shipHull(x, W, L, fb, P.hull, P.wood2, 0.6, 'round');
    const cabin = house(x, -W * 0.35, -L * 0.3, W * 0.35, L * 0.1, fb, fb + 3 * Z, x.body2, P.wood2);
    void cabin;
    if (b === 1) for (const s of [-1, 1]) { // paddle wheels in their boxes
      const r = 3.2 * Z, a = s * (W / 2 + 1);
      const spin = moving(x) ? -x.ph : 0, key = D.depth([a, r, 0]);
      for (let i = 0; i < 8; i++) { const t = spin + (i / 8) * Math.PI * 2; D.cap([a, r * 0.8, 0], [a, r * 0.8 + Math.sin(t) * r, Math.cos(t) * r], 0.35, 0.35, P.wood, key + 0.01); }
      prism(x, [[a - s * 0.6, r * 1.1], [a + s * 1.2, r * 1.1], [a + s * 1.2, -r * 1.1], [a - s * 0.6, -r * 1.1]].map(([aa, f]) => [aa, f] as Pt), r * 0.7, r * 1.9, x.body, x.body, { bias: 0.05 });
      if (moving(x)) D.ell([a, 0.3, -r], 1.6, 0.6, P.foam, -900, { g: D.group(), noLine: true });
    }
    const nf = b === 2 ? 2 : 1;
    for (let i = 0; i < nf; i++) funnel(x, 0, -L * 0.1 + i * 5 * Z * (nf > 1 ? 1 : 0) - (nf > 1 ? 2.5 * Z : 0), 1 * Z, fb + 3 * Z, fb + (b ? 11 : 7) * Z, x.body);
    if (b) { mast(x, L * 0.3, fb, fb + 13 * Z, 0.5); mast(x, -L * 0.36, fb, fb + 11 * Z, 0.5); }
    if (b === 0) propeller(x, [0, 0.6, -L * 0.5], 1.2, 'f', moving(x));
    flag(x, [0, fb, -L * 0.48], 3, 3, x.body);
    return;
  }
  if (e <= 5) { // motor launch / coaster / cargo liner (e4); yacht / ferry / container ship (e5)
    const W = [4.6, 8, 11][b] * Z, L = [12, 24, 36][b] * Z, fb = [1.6, 3, 4][b] * Z;
    wake(x, W, L);
    shipHull(x, W, L, fb, x.body, P.hull, e === 5 ? 0.9 : 0.6, e === 5 && b === 0 ? 'round' : 'square');
    if (b === 0) { // small craft: a cabin with a windscreen
      house(x, -W * 0.35, -L * 0.2, W * 0.35, L * 0.12, fb, fb + 2.4 * Z, x.body2, P.paint2);
      bridgeGlass(x, -W * 0.35, -L * 0.2, W * 0.35, L * 0.12, fb + 1.2 * Z, 0.9 * Z);
      if (e === 5) mast(x, -L * 0.05, fb + 2.4 * Z, fb + 6 * Z, 0.3, P.metal);
      if (moving(x)) D.ell([0, 0.3, -L * 0.55], W * 0.4, 0.8, P.foam, -900, { g: D.group(), noLine: true });
      return;
    }
    const aft = e === 5 || b === 2, bf0 = aft ? -L * 0.46 : -L * 0.1, bf1 = bf0 + (e === 5 && b === 1 ? L * 0.7 : L * 0.16), bh = (b === 2 ? 9 : 6) * Z;
    house(x, -W * 0.42, bf0, W * 0.42, bf1, fb, fb + bh, P.paint2, P.paint2);
    bridgeGlass(x, -W * 0.42, bf0, W * 0.42, bf1, fb + bh - 1.6 * Z, 0.9 * Z);
    if (e === 5 && b === 1) for (let k = 1; k < 3; k++) bridgeGlass(x, -W * 0.42, bf0, W * 0.42, bf1, fb + k * 1.6 * Z, 0.6 * Z); // ferry decks
    funnel(x, 0, bf0 + 2 * Z, 1.1 * Z, fb + bh, fb + bh + 3 * Z, x.body, 'diesel');
    sensorMast(x, bf1 - 1.5 * Z, fb + bh, 4 * Z, e);
    if (e === 5 && b === 2) { // container stacks
      const cols = [0.02, 0.58, 0.12, 0.35, 0.95, 0.5], rows = 3, span = L * 0.75, n = 6;
      for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
        const f0 = bf1 + 0.5 + (span * i) / n, h = 2.2 * Z * (1 + ((i + j) % 2));
        const m: Mat = { ramp: ramp(cols[(i * 3 + j * 5 + Math.floor(x.d[8] * 6)) % 6], 0.5, 0.45), tex: 'panel', spec: 0.2 };
        box(x, -W * 0.44 + (j * W * 0.88) / rows, f0, -W * 0.44 + ((j + 1) * W * 0.88) / rows - 0.2, f0 + span / n - 0.4, fb, fb + h, m, m, 0.02);
      }
    } else if (e === 4 || b === 2) { // hatches and derricks
      for (const f of [bf1 + L * 0.08, bf1 + L * 0.25]) { house(x, -W * 0.3, f, W * 0.3, f + L * 0.1, fb, fb + 1, P.dark, x.body2); barrel(x, W * 0.3, f - 1, fb, 1.5, P.metal); }
      mast(x, bf1 + L * 0.18, fb, fb + 10 * Z, 0.45, P.metal);
    }
    return;
  }
  if (e === 6) { // hydrofoil: rises onto its foils when under way
    const W = [4.6, 7.5, 10][b] * Z, L = [12, 22, 32][b] * Z, fb = [1.8, 2.8, 3.6][b] * Z;
    const lift = moving(x) ? 2.4 * Z : x.anim === 'use' ? 1.2 * Z : 0;
    wake(x, W * (lift ? 0.6 : 1), L);
    for (const f of [L * 0.3, -L * 0.3]) for (const s of [-1, 1]) D.cap([s * W * 0.35, lift + 0.5, f], [s * W * 0.45, Math.max(0.1, lift - 1.5), f], 0.5, 0.4, P.metal, D.depth([s * W * 0.4, lift, f]) - 0.05);
    shipHull(x, W, L, fb, x.body, P.paint2, 0.95, 'round', lift);
    const cab = x.C.plan === 'round' || x.C.plan === 'pod';
    if (cab) canopy(x, -L * 0.05, lift + fb, W * 0.8, L * 0.6, 3 * Z, 0.1);
    else { house(x, -W * 0.38, -L * 0.35, W * 0.38, L * 0.15, lift + fb, lift + fb + 2.8 * Z, x.body2, P.paint2); bridgeGlass(x, -W * 0.38, -L * 0.35, W * 0.38, L * 0.15, lift + fb + 1.2 * Z, 1 * Z); }
    if (b === 2) for (let i = 0; i < 3; i++) canopy(x, -L * 0.42 + i * 0.1, lift + fb + 2.8 * Z, W * 0.3, L * 0.12, 1.6 * Z, 0.2 + i);
    for (const s of [-1, 1]) exhaust(x, [s * W * 0.3, lift + 1, -L * 0.5], 'glow', 1.2 * Z / 2);
    return;
  }
  // hover barge: floats over the water on a glowing field
  const W = [5, 9, 13][b] * Z, L = [12, 22, 34][b] * Z, y = 2.5 * Z + Math.sin(x.ph) * 0.5;
  hoverSkirt(x, W, L, y);
  shipHull(x, W, L, 2 * Z, x.body, P.paint2, 0.8, 'round', y);
  if (x.C.plan === 'round' || x.C.plan === 'pod') canopy(x, L * 0.1, y + 2 * Z, W * 0.7, L * 0.45, 3.5 * Z, 0.1);
  else { house(x, -W * 0.3, L * 0.02, W * 0.3, L * 0.3, y + 2 * Z, y + 5 * Z, x.body2, x.body2); bridgeGlass(x, -W * 0.3, L * 0.02, W * 0.3, L * 0.3, y + 3.4 * Z, 1 * Z); }
  for (let i = 0; i < b * 3; i++) cyl(x, -W * 0.25 + (i % 2) * W * 0.5, -L * 0.1 - Math.floor(i / 2) * 3.4 * Z, 1.4 * Z, y + 2 * Z, y + 4.2 * Z, P.glass, x.body2);
  for (const s of [-1, 1]) lamp(x, [s * W * 0.4, y + 2 * Z + 0.4, L * 0.35], P.glow, true, 0.6);
}

// ---------------------------------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------------------------------
/** light warship: war canoe, longship, galley, gunboat, patrol boat, missile corvette, stealth trimaran, hover skimmer */
function warboat(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const L = (13 + b * 4) * Z * (e <= 2 ? 1.2 : 1), W = L * (e <= 2 ? 0.2 : 0.24), fb = (1.4 + b * 0.3) * Z;
  if (e === 0) { // war canoe: many paddles, a carved prow
    wake(x, W, L);
    shipHull(x, W, L, fb, P.wood, P.wood2, 1, 'round');
    oars(x, W, fb, Array.from({ length: 3 + b }, (_, i) => L * 0.3 - (i * L * 0.6) / (2 + b)), 4, true);
    D.cap([0, fb, L * 0.48], [0, fb + 4, L * 0.52], 0.7, 0.5, P.wood, D.depth([0, fb + 2, L / 2]) + 0.1);
    D.ell([0, fb + 4.3, L * 0.52], 1, 1, x.body, D.depth([0, fb + 4, L / 2]) + 0.11, { g: D.group() });
    return;
  }
  if (e === 1) { // longship: oars, a striped square sail, shields on the rail, a dragon prow
    wake(x, W, L);
    shipHull(x, W, L, fb, P.wood2, P.wood2, 1, 'round');
    for (const s of [1, -1]) D.cap([0, fb, s * L * 0.49], [0, fb + 5 * Z * 0.6, s * (L * 0.5 + 1)], 0.8, 0.5, P.wood, D.depth([0, fb + 2, s * L / 2]) + 0.1);
    D.ell([0, fb + 5.3 * Z * 0.6, L * 0.5 + 1.8], 1.3, 0.9, P.wood, D.depth([0, fb + 3, L / 2]) + 0.11, { g: D.group() });
    const n = 4 + b * 2;
    oars(x, W, fb * 0.8, Array.from({ length: n }, (_, i) => L * 0.3 - (i * L * 0.6) / (n - 1)), 7);
    shieldRow(x, W, fb - 0.2, Array.from({ length: n + 1 }, (_, i) => L * 0.33 - (i * L * 0.66) / n), x.body, P.paint2);
    const H = 10 * Z;
    mast(x, 0, fb, fb + H);
    squareSail(x, 0, fb + H * 0.3, fb + H * 0.95, W * 1.8, P.sail, x.body);
    return;
  }
  if (e === 2) { // galley: oar banks, lateen sails, a bow ram and a bow gun
    wake(x, W, L);
    shipHull(x, W, L, fb * 1.2, P.wood2, P.wood2, 0.9, 'square');
    house(x, -W * 0.45, -L * 0.48, W * 0.45, -L * 0.32, fb * 1.2, fb * 1.2 + 2.4 * Z, x.body2, P.wood2);
    D.cap([0, 0.8, L * 0.45], [0, 0.6, L * 0.5 + 3 * Z], 0.9, 0.4, x.K.metal, D.depth([0, 1, L / 2]) + 0.1);
    const n = 5 + b * 2;
    oars(x, W, fb, Array.from({ length: n }, (_, i) => L * 0.3 - (i * L * 0.58) / (n - 1)), 8);
    const H = 11 * Z;
    mast(x, L * 0.1, fb * 1.2, fb * 1.2 + H); foreSail(x, L * 0.1, fb * 1.2 + 1, fb * 1.2 + H, L * 0.4, P.sail, true);
    const b1: V3 = [0, fb * 1.2 + 1, L * 0.44 + 2 * Z];
    D.cap([0, fb * 1.2 + 1, L * 0.36], b1, 0.6 * Z, 0.5 * Z, P.dark, D.depth(b1) + 0.1);
    shot(x, b1, [0, 0, 1], 'cannon');
    flag(x, [0, fb * 1.2 + 2.4 * Z, -L * 0.46], 3, 3, x.body);
    return;
  }
  const hover = e === 7, y0 = hover ? 2.2 * Z + Math.sin(x.ph) * 0.4 : 0;
  if (hover) hoverSkirt(x, W, L, y0); else wake(x, W, L);
  shipHull(x, e === 6 ? W * 0.7 : W, L, fb, x.body, x.body2, e >= 5 ? 1 : 0.8, e >= 6 ? 'round' : 'square', y0);
  // trimaran floats
  if (e === 6) for (const s of [-1, 1]) { const a = s * W * 0.75; prism(x, deckRing(W * 0.22, L * 0.55, 1, 'round').map(([aa, f]) => [aa + a, f - L * 0.1] as Pt), 0, fb * 0.8, x.body, x.body2); D.cap([a * 0.5, fb * 0.7, -L * 0.1], [a, fb * 0.7, -L * 0.1], 0.5, 0.5, x.body2, D.depth([a * 0.7, fb, -L * 0.1])); }
  const y = y0 + fb, sh = e === 3 ? 3 : 3.6;
  // deckhouse: angular (stealth) from e5, sloped plates otherwise
  const hw = W * (e === 6 ? 0.28 : 0.36);
  prism(x, [[-hw, L * 0.05], [hw, L * 0.05], [hw, -L * 0.25], [-hw, -L * 0.25]], y, y + sh * Z, x.body2, x.body2, { topRing: e >= 5 ? [[-hw * 0.6, -L * 0.03], [hw * 0.6, -L * 0.03], [hw * 0.6, -L * 0.22], [-hw * 0.6, -L * 0.22]] : undefined, bias: 0.05 });
  bridgeGlass(x, -hw * (e >= 5 ? 0.8 : 1), -L * 0.25, hw * (e >= 5 ? 0.8 : 1), e >= 5 ? L * 0.0 : L * 0.05, y + sh * Z * 0.55, 0.8 * Z);
  if (e === 3) funnel(x, 0, -L * 0.18, 0.9 * Z, y + sh * Z, y + 8 * Z, x.body2);
  else if (e <= 5) sensorMast(x, -L * 0.14, y + sh * Z, 5 * Z, e);
  const gun: Gun = e >= 7 ? 'plasma' : e === 6 ? 'laser' : e === 5 ? 'rockets' : 'cannon';
  turret(x, 0, L * 0.25, y, 1.8 * Z, 1.2 * Z, gun, (gun === 'rockets' ? 5 : 7) * Z, x.body);
  if (e >= 4) turret(x, 0, -L * 0.36, y, 1 * Z, 0.8 * Z, 'mg', 3.5 * Z, x.body, 1.7, Math.PI);
  if (e >= 4 && !hover && moving(x)) D.ell([0, 0.3, -L * 0.55], W * 0.4, 0.9, P.foam, -900, { g: D.group(), noLine: true });
  flag(x, [0, y + sh * Z, -L * 0.3], 2.5, 2.5, x.body);
}
/** medium warship: war cog, frigate, ironclad, cruiser, destroyer, drone frigate, gravity cruiser */
function warship(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const L = (22 + b * 5) * Z, W = L * 0.2, fb = (2.6 + b * 0.4) * Z;
  if (e === 1) { // war cog: fore and after castles with crenels, a crossbow on the fore castle
    wake(x, W * 1.3, L * 0.8);
    const L2 = L * 0.8, W2 = W * 1.3;
    shipHull(x, W2, L2, fb, P.wood2, P.wood2, 0.3, 'square');
    for (const [f0, f1, h] of [[-L2 * 0.5, -L2 * 0.3, 3.2], [L2 * 0.3, L2 * 0.44, 2.6]] as [number, number, number][]) {
      house(x, -W2 * 0.46, f0, W2 * 0.46, f1, fb, fb + h * Z, P.wood2);
      for (let i = 0; i < 4; i++) box(x, -W2 * 0.46 + (i * W2 * 0.92) / 3.5, f1 - 0.6, -W2 * 0.46 + (i * W2 * 0.92) / 3.5 + 0.8, f1, fb + h * Z, fb + h * Z + 1, P.wood2, P.wood2, 0.1);
    }
    const H = 18 * Z * 0.8;
    mast(x, 0, fb, fb + H); squareSail(x, 0, fb + H * 0.3, fb + H * 0.9, W2 * 1.4, P.sail, x.body);
    const b1: V3 = [0, fb + 3.4 * Z, L2 * 0.44 + 2];
    D.cap([0, fb + 3.2 * Z, L2 * 0.34], b1, 0.4, 0.4, P.wood, D.depth(b1) + 0.2);
    shot(x, b1, [0, 0, 1], 'bolt');
    flag(x, [0, fb + H, 0], 3, 4, x.body);
    return;
  }
  if (e === 2) { // frigate: three masts, one gun deck
    wake(x, W, L);
    shipHull(x, W, L, fb, P.wood2, P.wood2, 0.55, 'square');
    house(x, -W * 0.46, -L * 0.49, W * 0.46, -L * 0.3, fb, fb + 2.4 * Z, P.wood2, P.wood2);
    gunDeck(x, W, fb, fb * 0.62, -L * 0.28, L * 0.2, 6 + b * 2, x.body);
    const H = 20 * Z;
    for (const [f, h] of [[L * 0.24, 0.85], [0, 1], [-L * 0.22, 0.75]] as [number, number][]) { mast(x, f, fb, fb + H * h); squareSail(x, f, fb + H * h * 0.3, fb + H * h * 0.6, W * 1.3 * h, P.sail); squareSail(x, f, fb + H * h * 0.64, fb + H * h * 0.92, W * 1 * h, P.sail); }
    D.cap([0, fb + 1, L * 0.48], [0, fb + 4, L * 0.5 + 6 * Z], 0.45, 0.3, P.wood, D.depth([0, fb, L * 0.5]) + 0.1);
    flag(x, [0, fb + H, 0], 3, 4, x.body);
    return;
  }
  if (e === 7) { // gravity cruiser: hovers, plasma turrets fore and aft
    const y0 = 3 * Z + Math.sin(x.ph) * 0.5;
    hoverSkirt(x, W, L, y0);
    shipHull(x, W, L, fb, x.body, x.body2, 1, 'round', y0);
    const y = y0 + fb;
    canopy(x, -L * 0.05, y, W * 0.6, L * 0.35, 4 * Z, 0.1);
    turret(x, 0, L * 0.28, y, 2.2 * Z, 1.4 * Z, 'plasma', 8 * Z, x.body2);
    turret(x, 0, -L * 0.32, y, 2.2 * Z, 1.4 * Z, 'plasma', 8 * Z, x.body2, 1.1, Math.PI);
    for (const s of [-1, 1]) lamp(x, [s * W * 0.45, y + 0.4, L * 0.1], P.glow, true, 0.6);
    return;
  }
  wake(x, W, L);
  const iron = e === 3;
  shipHull(x, W, L, iron ? fb * 0.6 : fb, x.body, iron ? P.hull : x.body2, e >= 5 ? 0.95 : 0.7, 'square');
  const y = iron ? fb * 0.6 : fb;
  if (iron) { // ironclad: a sloped casemate, one turret, a funnel and auxiliary masts
    prism(x, [[-W * 0.4, L * 0.15], [W * 0.4, L * 0.15], [W * 0.4, -L * 0.2], [-W * 0.4, -L * 0.2]], y, y + 3 * Z, P.hull, P.hull, { topRing: [[-W * 0.25, L * 0.1], [W * 0.25, L * 0.1], [W * 0.25, -L * 0.15], [-W * 0.25, -L * 0.15]], bias: 0.05 });
    turret(x, 0, L * 0.3, y, 2 * Z, 1.6 * Z, 'cannon', 5 * Z, P.hull);
    funnel(x, 0, -L * 0.05, 1 * Z, y + 3 * Z, y + 9 * Z, P.hull);
    mast(x, -L * 0.3, y, y + 12 * Z, 0.45);
    return;
  }
  // cruiser (e4), destroyer (e5), drone frigate (e6)
  const hw = W * 0.34, f0 = -L * 0.12, f1 = L * 0.12, sh = 4.5 * Z;
  prism(x, [[-hw, f1], [hw, f1], [hw, f0], [-hw, f0]], y, y + sh, x.body2, x.body2, { topRing: e >= 5 ? [[-hw * 0.7, f1 - 1.5 * Z], [hw * 0.7, f1 - 1.5 * Z], [hw * 0.7, f0 + 1], [-hw * 0.7, f0 + 1]] : undefined, bias: 0.05 });
  bridgeGlass(x, -hw * (e >= 5 ? 0.7 : 1), f0, hw * (e >= 5 ? 0.7 : 1), e >= 5 ? f1 - 1.5 * Z : f1, y + sh - 1.6 * Z, 0.9 * Z);
  sensorMast(x, f0 + 2 * Z, y + sh, 6 * Z, e);
  const gun: Gun = e === 6 ? 'laser' : 'cannon';
  turret(x, 0, L * 0.3, y, 2.1 * Z, 1.4 * Z, e === 4 ? 'twin' : gun, 7 * Z, x.body);
  if (e === 4) { turret(x, 0, -L * 0.33, y, 2.1 * Z, 1.4 * Z, 'twin', 7 * Z, x.body, 1.3, Math.PI); for (let i = 0; i < 2; i++) funnel(x, 0, -L * 0.14 - i * 3 * Z, 0.9 * Z, y, y + sh + 3 * Z, x.body2, 'diesel'); }
  else {
    launchCells(x, -W * 0.25, L * 0.16, W * 0.25, L * 0.22, y);
    if (b) launchCells(x, -W * 0.25, -L * 0.26, W * 0.25, -L * 0.2, y);
    box(x, -W * 0.4, -L * 0.48, W * 0.4, -L * 0.3, y - 0.05, y + 0.1, x.body2, { ...P.dark, tex: 'smooth' }, 0.01); // helipad
    D.ell([0, y + 0.2, -L * 0.39], W * 0.25, W * 0.25 * 0.3, P.paint2, D.depth([0, y, -L * 0.39]) + 0.02, { g: D.group(), noLine: true });
    if (e === 6) turret(x, 0, -L * 0.22, y + sh * 0.4, 1.2 * Z, 0.8 * Z, 'laser', 4 * Z, x.body, 2.1, Math.PI);
  }
  if (moving(x)) D.ell([0, 0.3, -L * 0.55], W * 0.4, 0.9, P.foam, -900, { g: D.group(), noLine: true });
}
/** capital ship: ship of the line, dreadnought, battleship, carrier, arsenal ship, floating fortress */
function capital(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const L = (30 + b * 6) * Z, W = L * 0.19, fb = (3.4 + b * 0.4) * Z;
  if (e === 2) { // ship of the line: three gun decks and a towering rig
    wake(x, W, L);
    const hb = fb * 1.5;
    shipHull(x, W, L, hb, P.wood2, P.wood2, 0.4, 'square');
    house(x, -W * 0.47, -L * 0.49, W * 0.47, -L * 0.28, hb, hb + 3.2 * Z, P.wood2, P.wood2);
    for (let k = 0; k < 2 + Math.min(1, b); k++) gunDeck(x, W, hb, hb * (0.28 + k * 0.27), -L * 0.3, L * 0.22, 8 + b * 2, x.body);
    const H = 26 * Z;
    for (const [f, h] of [[L * 0.25, 0.85], [0, 1], [-L * 0.22, 0.72]] as [number, number][]) { mast(x, f, hb, hb + H * h, 0.8); for (let k = 0; k < 3; k++) squareSail(x, f, hb + H * h * (0.25 + k * 0.24), hb + H * h * (0.46 + k * 0.23), W * (1.4 - k * 0.25) * h, P.sail); }
    D.cap([0, hb + 1, L * 0.48], [0, hb + 5, L * 0.5 + 8 * Z], 0.55, 0.35, P.wood, D.depth([0, hb, L * 0.5]) + 0.1);
    for (const s of [-1, 1]) lamp(x, [s * W * 0.3, hb + 3.2 * Z + 1, -L * 0.49], x.K.fire, false, 0.8);
    flag(x, [0, hb + H, 0], 4, 6, x.body);
    return;
  }
  if (e === 7) { // floating fortress: hovering platform with domed batteries
    const y0 = 3.5 * Z + Math.sin(x.ph) * 0.5;
    hoverSkirt(x, W * 1.3, L, y0);
    shipHull(x, W * 1.3, L, fb, x.body, x.body2, 0.7, 'round', y0);
    const y = y0 + fb;
    const v = box(x, -W * 0.35, -L * 0.15, W * 0.35, L * 0.1, y, y + 6 * Z, x.body2, x.body2, 0.05);
    roofOn(x, v, 'dome', P.glass, P.glass, { over: 0.2 });
    for (const [f, base] of [[L * 0.3, 0], [L * 0.18, 0], [-L * 0.28, Math.PI], [-L * 0.4, Math.PI]] as [number, number][]) turret(x, 0, f, y, 2.4 * Z, 1.6 * Z, 'plasma', 9 * Z, x.body2, f, base);
    for (const s of [-1, 1]) turret(x, s * W * 0.45, -L * 0.02, y, 1.2 * Z, 1 * Z, 'laser', 5 * Z, x.body2, s * 2, s * Math.PI / 2);
    return;
  }
  wake(x, W, L);
  if (e === 5) { // carrier: flight deck, an island, jets parked and one launching
    const Wd = W * 1.25;
    shipHull(x, W, L, fb, x.body, x.body, 0.9, 'square');
    prism(x, [[-Wd / 2, L * 0.5], [Wd / 2 * 0.7, L * 0.5], [Wd / 2, -L * 0.5], [-Wd / 2 * 0.8, -L * 0.5]], fb, fb + 0.8 * Z, x.body2, { ...P.dark, tex: 'smooth' }, { bias: 0.02 });
    const y = fb + 0.8 * Z;
    D.cap([-Wd * 0.1, y + 0.05, -L * 0.45], [-Wd * 0.1, y + 0.05, L * 0.45], 0.2, 0.2, P.paint2, D.depth([0, y, 0]) + 0.03, { noLine: true });
    const ia = Wd * 0.34;
    house(x, ia - 2 * Z, -L * 0.15, ia + 1.5 * Z, L * 0.05, y, y + 8 * Z, x.body2, x.body2);
    bridgeGlass(x, ia - 2 * Z, -L * 0.15, ia + 1.5 * Z, L * 0.05, y + 6.2 * Z, 0.9 * Z);
    sensorMast(x, -L * 0.05, y + 8 * Z, 5 * Z, e);
    for (let i = 0; i < 3 + b; i++) deckJet(x, -Wd * 0.25 + (i % 2) * Wd * 0.2, y, -L * 0.42 + i * 2.2 * Z, 0.7 * Z, P.mil);
    const age = x.anim === 'use' ? x.t : -1;
    if (age >= 0) { const f = -L * 0.1 + smooth(age * 1.4) * L * 0.62, lift = Math.max(0, f - L * 0.4) * 0.5; deckJet(x, -Wd * 0.1, y + lift, f, 0.75 * Z, P.mil); exhaust(x, [-Wd * 0.1, y + lift + 0.4 * Z, f - 2.5 * Z], 'jet', 0.9 * Z); }
    turret(x, -Wd * 0.4, L * 0.38, y, 0.9 * Z, 0.8 * Z, 'mg', 3 * Z, x.body2, 0.4);
    if (moving(x)) D.ell([0, 0.3, -L * 0.55], W * 0.4, 0.9, P.foam, -900, { g: D.group(), noLine: true });
    return;
  }
  // dreadnought (e3), battleship (e4), arsenal ship (e6)
  shipHull(x, W, L, fb, x.body, x.body2, e === 6 ? 1 : 0.75, 'square');
  const y = fb, hw = W * 0.33, sh = (e === 6 ? 5 : 7) * Z;
  prism(x, [[-hw, L * 0.12], [hw, L * 0.12], [hw, -L * 0.14], [-hw, -L * 0.14]], y, y + sh * 0.5, x.body2, x.body2, { bias: 0.05 });
  const tw = hw * 0.6, tv = prism(x, [[-tw, L * 0.1], [tw, L * 0.1], [tw, L * 0.02], [-tw, L * 0.02]], y + sh * 0.5, y + sh, x.body2, x.body2, { topRing: e === 6 ? [[-tw * 0.6, L * 0.07], [tw * 0.6, L * 0.07], [tw * 0.6, L * 0.03], [-tw * 0.6, L * 0.03]] : undefined, bias: 0.06 });
  void tv;
  bridgeGlass(x, -tw, L * 0.02, tw, L * 0.1, y + sh - 1.6 * Z, 0.9 * Z);
  sensorMast(x, L * 0.05, y + sh, 7 * Z, e);
  if (e <= 4) for (let i = 0; i < 2; i++) funnel(x, 0, -L * 0.03 - i * 3.4 * Z, 1.2 * Z, y + sh * 0.5, y + sh + 1.5 * Z, x.body2, e === 3 ? 'steam' : 'diesel');
  const gun: Gun = e === 6 ? 'laser' : 'twin', R = 2.8 * Z;
  const tur: [number, number][] = [[L * 0.36, 0], [L * 0.22, 0], [-L * 0.25, Math.PI], [-L * 0.38, Math.PI]];
  tur.slice(0, 3 + (b ? 1 : 0)).forEach(([f, base], i) => turret(x, 0, f, y + (i === 1 ? 1.4 * Z : 0), R, 1.8 * Z, gun, 10 * Z, x.body, i * 0.7, base));
  if (e === 6) { launchCells(x, -W * 0.3, -L * 0.2, W * 0.3, -L * 0.15, y); launchCells(x, -W * 0.3, L * 0.13, W * 0.3, L * 0.17, y); }
  for (const s of [-1, 1]) turret(x, s * W * 0.4, -L * 0.07, y + sh * 0.5, 1 * Z, 0.8 * Z, e === 6 ? 'laser' : 'mg', 3.5 * Z, x.body2, s * 1.3, s * Math.PI / 2);
  if (moving(x)) D.ell([0, 0.3, -L * 0.55], W * 0.4, 0.9, P.foam, -900, { g: D.group(), noLine: true });
}

// ---------------------------------------------------------------------------------------------------
// Transform: submarines that dive and resurface; the late ones change shape
// ---------------------------------------------------------------------------------------------------
/** a cigar hull drawn only above the water (points below are pressed onto the surface, like a waterline cut) */
function cigar(x: VCtx, W: number, L: number, H: number, yc: number, m: Mat) {
  const D = x.D, pts: V3[] = [];
  let above = false;
  for (let i = 0; i <= 10; i++) {
    const k = i / 10, f = -L / 2 + L * k, rr = Math.sin(Math.PI * Math.min(1, k * 1.08)) ** 0.5;
    for (let j = 0; j < 12; j++) { const t = (j / 12) * Math.PI * 2, y = yc + Math.sin(t) * (H / 2) * rr; if (y > 0.05) above = true; pts.push([Math.cos(t) * (W / 2) * rr, Math.max(0.02, y), f]); }
  }
  if (above) D.hull(pts, m, D.depth([0, Math.max(0, yc), 0]), { g: D.group(), flat: 0 });
}
function submarine(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const L = (20 + b * 6) * Z, W = L * 0.12, H = W;
  // 'use' = dive and resurface (e3-e6); the space-age hull lifts off the sea and unfolds its wings (e7)
  const u = x.anim !== 'use' ? 0 : x.t < 0.5 ? smooth((x.t - 0.05) / 0.4) : smooth((0.97 - x.t) / 0.4);
  if (e === 7) {
    const y = u * 16 * Z + 0.5, wingOut = u;
    if (u < 0.3) wake(x, W * 1.4, L); else D.ell([0, 0.1, 0], W * 1.2, W * 0.4, { ...P.water, alpha: 0.35, line: null }, -950, { g: D.group(), noLine: true });
    for (let i = 0; i < 4; i++) { const k = frac(x.t * 2 + i / 4); if (u > 0.05 && u < 0.6) D.ell([Math.cos(i * 2) * W, k * y * 0.8, Math.sin(i * 2) * L * 0.3], 1.2 + k * 2, 0.8 + k, P.foam, 1e4, { g: D.group(), noLine: true }); }
    for (const s of [-1, 1]) wing(x, [[s * W * 0.4, y + H * 0.5, L * 0.1], [s * (W * 0.4 + (2 + wingOut * 10) * Z), y + H * 0.5, -L * 0.15], [s * (W * 0.4 + (2 + wingOut * 10) * Z), y + H * 0.5, -L * 0.3], [s * W * 0.4, y + H * 0.5, -L * 0.25]], x.body2);
    cigar(x, W * 1.4, L, H * 1.2, y + H * 0.5, x.body);
    canopy(x, L * 0.18, y + H, W * 0.8, L * 0.2, H * 0.5, 0.2);
    for (const s of [-1, 1]) exhaust(x, [s * W * 0.3, y + H * 0.5, -L * 0.5], u > 0.2 ? 'jet' : 'glow', 1.2 * Z / 2);
    return;
  }
  const depth = u * (H + 5 * Z), yc = H * 0.38 - depth;
  if (depth < H * 0.6) wake(x, W * 1.3, L);
  if (depth > 0.5) { // the dim shape of the hull under the surface, and the ring of disturbed water
    D.poly(Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return [Math.cos(t) * W * 0.55, 0.05, Math.sin(t) * L * 0.5] as V3; }), { ...P.water, ramp: P.water.ramp.map(c => c.map(v => v * 0.55)) as typeof P.water.ramp, alpha: 0.6 - u * 0.3, line: null }, -945, { g: D.group(), flat: 0.9 });
    for (let i = 0; i < 5; i++) { const k = frac(x.t * 2 + i / 5); D.ell([Math.sin(i * 2.3) * W * 0.8, 0.2, Math.cos(i * 2.3) * L * 0.35], 0.8 + k * 1.8, 0.4 + k * 0.6, P.foam, -930, { g: D.group(), noLine: true }); }
  }
  cigar(x, W, L, H, yc, x.body);
  // late subs change shape as they dive: diving planes fold out, the sail shrinks into the hull
  const fold = e === 6 ? u : 0;
  const tf = L * 0.12, th = (4 - fold * 2.5) * Z, ty0 = yc + H * 0.35, t0 = Math.max(0.02, ty0), t1 = ty0 + th;
  if (t1 > 0.1) {
    const tw = W * 0.28, tl = 3 * Z;
    const ring: Pt[] = x.C.plan === 'round' || x.C.plan === 'pod' ? Array.from({ length: 10 }, (_, i) => { const t = (i / 10) * Math.PI * 2; return [Math.cos(t) * tw, tf + Math.sin(t) * tl] as Pt; }) : [[-tw, tf + tl], [tw, tf + tl], [tw, tf - tl], [-tw, tf - tl]];
    prism(x, ring, t0, t1, x.body2, x.body2, { topRing: ring.map(([a, f]) => [a * 0.8, f * 0.95 + (f - tf) * -0.1] as Pt), bias: 0.1 });
    if (e >= 4) D.cap([0, t1, tf], [0, t1 + 3 * Z + u * 2, tf], 0.3, 0.25, P.dark, D.depth([0, t1, tf]) + 0.12); // periscope
    if (t1 - t0 > 1) for (const s of [-1, 1]) D.cap([s * tw, Math.max(0.05, t0 + th * 0.55), tf], [s * (tw + (1.5 + fold * 3) * Z), Math.max(0.05, t0 + th * 0.55), tf], 0.5, 0.3, x.body2, D.depth([s * tw, t0, tf]) + 0.11);
    if (e >= 6) lamp(x, [0, t1 + 0.3, tf + tl * 0.8], P.glow, true, 0.5);
  }
  if (e === 4 && yc + H * 0.5 > 0) { // deck gun
    const y = yc + H * 0.5, b1: V3 = [0, y + 1.2, L * 0.3 + 5 * Z];
    D.cap([0, y + 1, L * 0.3], b1, 0.45 * Z, 0.35 * Z, P.dark, D.depth([0, y, L * 0.3]) + 0.1);
  }
  if (x.anim === 'use' && x.t > 0.3 && x.t < 0.7) { // torpedo run
    const k = (x.t - 0.3) / 0.4;
    for (let i = 0; i < 4; i++) D.ell([W * 0.2, 0.15, L * 0.5 + k * 40 * Z - i * 2.5], 0.7 + i * 0.2, 0.3, P.foam, -920, { g: D.group(), noLine: true });
  }
  if (depth < H && moving(x)) propeller(x, [0, Math.max(0.3, yc), -L * 0.5], 1 * Z, 'f');
}

export const NAVAL = { boat, warboat, warship, capital, submarine };
void flag; void crate; void shotAge;
