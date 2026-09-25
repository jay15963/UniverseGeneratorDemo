// Ships, built from modules: a hull lofted through stations (sheer rising to bow and stern, flare or tumblehome,
// bow and stern shapes, monohull / catamaran / trimaran / outrigger / raft / reed bundle), propulsion (paddles, oars,
// rigs of square, lateen, junk, crab-claw and fore-and-aft sails, paddle wheels, screws with funnels, rotor and wing
// sails, hydrofoils, hover), superstructures (castles, deckhouses, bridges, pagodas, stealth towers, domes), masts,
// cargo gear and weapons (broadsides, turrets that turn on their own, deck guns, missile cells, rotary cannons).
// Every ship is twice the size of the land/air vehicle of the same tier. Hulls sit on the waterline (y = 0).
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { crate, barrel, sack } from '../structure/parts';
import {
  VCtx, Station, loft, block, pod, dome, rod, light, banner, emblem, windowBand, portholes, wake, hover, exhaust, propeller,
  up, at, pick, moving, acting, lerp, smooth, frac, frameOf, offsetA, transformed, yawFrame, groundShadow, circle, plate, clean,
} from './vparts';
import { turret, Gun, fixedGun, fire, setNoDust, TurretShape } from './weapons';

const tier = (x: VCtx) => (x.size === 'large' ? 2 : x.size === 'medium' ? 1 : 0);
type Bow = 'plumb' | 'raked' | 'clipper' | 'ram' | 'spoon' | 'bulb' | 'canoe';
type Stern = 'transom' | 'round' | 'castle' | 'cruiser' | 'canoe';
export interface HullSpec { L: number; W: number; fb: number; bow: Bow; stern: Stern; sheerF: number; sheerA: number; flare: number; fine: number; y0?: number }

// ---------------------------------------------------------------------------------------------------
// Hulls
// ---------------------------------------------------------------------------------------------------
/** the stations of a hull: half-width, deck height (sheer) and the bow / stern rakes */
function hullStations(h: HullSpec): Station[] {
  const { L, W, fb, bow, stern, sheerF, sheerA, flare, fine } = h, y0 = h.y0 ?? 0;
  const ks = [1, 0.93, 0.8, 0.6, 0.3, 0, -0.3, -0.6, -0.8, -0.93, -1];
  return ks.map(k => {
    const u = Math.abs(k), f = (k * L) / 2;
    let hw: number;
    if (k > 0) hw = Math.pow(Math.max(0, 1 - Math.pow(u, 1.6 + fine * 1.6)), 0.55 + fine * 0.3);
    else hw = stern === 'transom' || stern === 'castle' ? Math.max(0.62, Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 0.4)) : Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.5);
    hw = Math.max(0.03, hw) * (W / 2);
    const sheer = k > 0 ? sheerF * Math.pow(u, 2) : sheerA * Math.pow(u, 2.2);
    const y1 = y0 + fb + sheer;
    // bottom-edge overhangs: raked / clipper bows lean forward, a ram juts out at the waterline
    let fbot = f;
    if (k === 1) fbot = bow === 'plumb' || bow === 'bulb' ? f : bow === 'ram' ? f + L * 0.04 : bow === 'clipper' ? f - L * 0.1 : bow === 'spoon' ? f - L * 0.07 : f - L * 0.05;
    if (k === 0.93 && (bow === 'clipper' || bow === 'spoon')) fbot = f - L * 0.05;
    if (k === -1) fbot = stern === 'transom' || stern === 'castle' ? f + L * 0.03 : stern === 'cruiser' ? f + L * 0.015 : f + L * 0.04;
    const topW = hw * (1 + flare), botW = hw * (k === 1 || k === -1 ? 0.6 : 0.8);
    return { f, fb: fbot, w: hw, bw: botW, tw: Math.max(0.03, topW), wy: 0.16, y0, y1 };
  });
}
/** a hull with a painted boot-top at the waterline, a deck and a rail along the gunwale; returns its stations */
function hull(x: VCtx, h: HullSpec, side: Mat, deck: Mat, boot?: Mat, rail?: Mat): Station[] {
  const st = hullStations(h);
  loft(x, st, side, { top: deck, lower: boot, lowerY: (h.y0 ?? 0) + h.fb * 0.17, open: true, tex: 'along' });
  if (rail) up(x, () => { for (const s of [-1, 1]) { const pts: V3[] = st.map(q => [s * (q.tw ?? q.w), q.y1 + 0.05, q.f]); for (let i = 0; i + 1 < pts.length; i++) x.D.cap(pts[i], pts[i + 1], 0.22, 0.22, rail, (x.D.depth(pts[i]) + x.D.depth(pts[i + 1])) / 2, { noLine: true }); } });
  return st;
}
/** deck height along the hull (to stand things on it) */
function deckAt(st: Station[], f: number) {
  for (let i = 0; i + 1 < st.length; i++) { const a = st[i], b = st[i + 1]; if (f <= a.f && f >= b.f) return lerp(a.y1, b.y1, (f - a.f) / (b.f - a.f || 1)); }
  return f > st[0].f ? st[0].y1 : st[st.length - 1].y1;
}
function halfWidth(st: Station[], f: number) {
  for (let i = 0; i + 1 < st.length; i++) { const a = st[i], b = st[i + 1]; if (f <= a.f && f >= b.f) return lerp(a.tw ?? a.w, b.tw ?? b.w, (f - a.f) / (b.f - a.f || 1)); }
  return 0.5;
}
/** outrigger floats / catamaran or trimaran hulls joined by beams */
function extraHulls(x: VCtx, h: HullSpec, form: string, side: Mat, deck: Mat) {
  const D = x.D;
  if (form === 'outrigger') {
    const a = h.W * 1.6, sub: HullSpec = { ...h, L: h.L * 0.6, W: h.W * 0.28, fb: h.fb * 0.5, sheerF: h.sheerF * 0.3, sheerA: h.sheerA * 0.3 };
    offsetA(x, a, () => hull(x, sub, side, side));
    up(x, () => { for (const f of [-h.L * 0.12, h.L * 0.15]) D.cap([0, h.fb + 0.3, f], [a, h.fb * 0.6, f], 0.35, 0.35, x.P.wood, D.depth([a / 2, h.fb, f])); });
  }
  if (form === 'cat' || form === 'tri') {
    const a = h.W * (form === 'tri' ? 0.85 : 0.55), sub: HullSpec = { ...h, W: h.W * (form === 'tri' ? 0.28 : 0.42), L: h.L * (form === 'tri' ? 0.7 : 1) };
    for (const s of [-1, 1]) offsetA(x, s * a, () => hull(x, sub, side, deck));
  }
}

// ---------------------------------------------------------------------------------------------------
// Rigging
// ---------------------------------------------------------------------------------------------------
export type Rig = 'square' | 'lateen' | 'junk' | 'crab' | 'gaff' | 'wing' | 'rotor';
function mast(x: VCtx, f: number, y0: number, y1: number, r: number, m?: Mat) {
  x.D.cap([0, y0, f], [0, y1, f], r, r * 0.6, m ?? x.P.wood, x.D.depth([0, (y0 + y1) / 2, f]));
}
const BRACE = -0.45;
/** a square sail on its yard, braced round a little so it reads in every facing; fills under way */
function squareSail(x: VCtx, f: number, y0: number, y1: number, w: number, m: Mat, stripe?: Mat) {
  const D = x.D, b = (moving(x) || acting(x) ? 1.5 : 0.5) * w * 0.12 * (1 + 0.08 * Math.sin(x.ph * 2)), ym = (y0 + y1) / 2;
  const fr = yawFrame(0, 0, f, BRACE);
  transformed(x, fr.T, fr.Tn, () => {
    const sheet = (k: number): V3[] => [[-w * k, y1, 0], [w * k, y1, 0], [w * k * 1.04, ym, b], [w * k * 0.9, y0, b * 0.45], [-w * k * 0.9, y0, b * 0.45], [-w * k * 1.04, ym, b]];
    const key = D.depth([0, ym, b * 0.5]) + 0.02;
    plate(x, sheet(0.5), m, key);
    if (stripe) plate(x, sheet(0.17).map(p => [p[0], p[1], p[2] + 0.05] as V3), stripe, key + 0.001);
    D.cap([-w * 0.56, y1, 0], [w * 0.56, y1, 0], 0.3, 0.3, x.P.wood, key + 0.002, { noLine: true });
    D.cap([-w * 0.5, y0, b * 0.4], [w * 0.5, y0, b * 0.4], 0.2, 0.2, x.P.wood, key + 0.002, { noLine: true });
  });
}
/** fore-and-aft sails: gaff/jib, lateen, junk (battened) and crab-claw; they swing out to leeward under way */
function foreSail(x: VCtx, f: number, y0: number, y1: number, len: number, m: Mat, kind: 'gaff' | 'lateen' | 'junk' | 'crab') {
  const D = x.D, sw = (moving(x) || acting(x) ? 0.38 : 0.1) + Math.sin(x.ph) * 0.03;
  const fr = yawFrame(0, 0, f, sw);
  transformed(x, fr.T, fr.Tn, () => {
    const H = y1 - y0, belly = moving(x) ? 0.8 : 0.25;
    let pts: V3[];
    if (kind === 'lateen') pts = [[0, y0 + H * 0.2, len * 0.35], [belly, y0 + H * 0.55, -len * 0.1], [0, y1, -len * 0.5], [0, y0 + 0.4, -len * 0.55]];
    else if (kind === 'crab') pts = [[0, y0 + 0.3, len * 0.1], [belly, y0 + H * 0.6, -len * 0.3], [0, y1, -len * 0.25], [0, y1 - H * 0.2, -len * 0.7], [0, y0 + H * 0.3, -len * 0.6]];
    else if (kind === 'junk') pts = [[0, y1, len * 0.12], [0, y1 + H * 0.04, -len * 0.55], [belly, y0 + H * 0.5, -len * 0.75], [0, y0 + 0.3, -len * 0.7], [0, y0 + 0.3, len * 0.15]];
    else pts = [[0, y1, 0], [0, y1 - H * 0.05, -len * 0.55], [belly, y0 + H * 0.45, -len * 0.75], [0, y0 + 0.3, -len * 0.8], [0, y0 + 0.3, 0]];
    const key = D.depth([0, (y0 + y1) / 2, -len * 0.3]) + 0.02;
    plate(x, pts, m, key);
    if (kind === 'junk') for (let i = 1; i < 6; i++) { const yy = y0 + (H * i) / 6; D.cap([0.1, yy, len * 0.13], [0.1 + belly * 0.5, yy + H * 0.02, -len * (0.6 + (i / 6) * 0.1)], 0.18, 0.18, x.P.wood, key + 0.001, { noLine: true }); }
    else if (kind === 'lateen') D.cap(pts[0], pts[2], 0.28, 0.22, x.P.wood, key + 0.001, { noLine: true });
    else if (kind === 'crab') { D.cap(pts[0], pts[2], 0.25, 0.2, x.P.wood, key + 0.001, { noLine: true }); D.cap(pts[0], pts[3], 0.25, 0.2, x.P.wood, key + 0.001, { noLine: true }); }
    else { D.cap([0, y0 + 0.3, 0], [0, y0 + 0.3, -len * 0.8], 0.25, 0.25, x.P.wood, key + 0.001, { noLine: true }); D.cap([0, y1, 0], pts[1], 0.22, 0.2, x.P.wood, key + 0.001, { noLine: true }); }
  });
}
/** a jib from the bowsprit to the foremast */
function jib(x: VCtx, fBow: number, yBow: number, fMast: number, yTop: number, m: Mat) {
  const s = moving(x) ? 0.8 : 0.3;
  plate(x, [[0, yTop, fMast], [s, (yTop + yBow) / 2, (fMast + fBow) / 2], [0, yBow, fBow], [0, yBow + 0.5, fMast + 1]], m);
}
/** a Flettner rotor sail (a spinning cylinder with bands) or a rigid wing sail */
function modernSail(x: VCtx, f: number, y0: number, h: number, r: number, kind: 'rotor' | 'wing') {
  const D = x.D;
  if (kind === 'rotor') {
    D.cap([0, y0, f], [0, y0 + h, f], r, r, x.P.paint2, D.depth([0, y0 + h / 2, f]), { g: D.group() });
    const spin = moving(x) ? x.t * 3 : 0;
    for (let i = 0; i < 4; i++) { const yy = y0 + h * (0.15 + i * 0.22) + frac(spin) * h * 0.05; D.ell([0, yy, f], r * 1.02, r * 0.28, x.body, D.depth([0, y0 + h / 2, f]) + 0.001, { g: D.group(), noLine: true }); }
    D.ell([0, y0 + h, f], r * 1.5, r * 0.45, x.P.paint2, D.depth([0, y0 + h, f]) + 0.002, { g: D.group() });
    return;
  }
  const fr = yawFrame(0, 0, f, moving(x) ? 0.5 : 0.1);
  transformed(x, fr.T, fr.Tn, () => {
    const st: Station[] = [0.5, 0.2, -0.2, -0.5].map(k => ({ f: k * r * 4, w: Math.max(0.1, (1 - Math.abs(k * 2) ** 2) * r * 0.5), bw: Math.max(0.1, (1 - Math.abs(k * 2) ** 2) * r * 0.5), tw: Math.max(0.1, (1 - Math.abs(k * 2) ** 2) * r * 0.4), wy: 0.5, y0, y1: y0 + h }));
    loft(x, st, x.P.paint2, { round: 1 });
  });
}
function oars(x: VCtx, W: number, y: number, fs: number[], len: number, paddle = false) {
  const D = x.D, row = x.anim !== 'idle';
  for (const s of [-1, 1]) for (const f of fs) {
    const sweep = row ? Math.sin(x.ph) * len * 0.3 : 0, dip = row ? (Math.cos(x.ph) > 0 ? 0 : 0.8) : 1.2;
    const a0: V3 = paddle ? [s * W * 0.45, y + 2, f] : [s * W * 0.5, y, f];
    const a1: V3 = [s * (W * 0.5 + len * (paddle ? 0.3 : 0.8)), row ? 0.25 + dip * len * 0.2 : y + len * 0.12, f + sweep];
    const key = D.depth([s * W * 0.55, y, f]) + 0.05, near = D.facing([s, 0, 0]) > 0;
    at(x, near ? 1 : 0, () => {
      D.cap(a0, a1, 0.22, 0.22, x.P.wood, key, { noLine: true });
      D.ell(a1, paddle ? 0.8 : 0.55, paddle ? 0.45 : 0.35, x.P.wood, key + 0.001, { g: D.group() });
    });
    if (row && dip === 0 && moving(x)) D.ell([a1[0], 0.15, a1[2] - 0.8], 1, 0.35, x.P.foam, -900, { g: D.group(), noLine: true });
  }
}
/** a paddle wheel in its box on each side (or one at the stern) */
function paddleWheels(x: VCtx, st: Station[], f: number, r: number, sternWheel: boolean) {
  const D = x.D, spin = moving(x) ? -x.ph : 0;
  const one = (a: number, ff: number, w: number) => {
    const key = D.depth([a, r, ff]);
    for (let i = 0; i < 10; i++) { const t = spin + (i / 10) * Math.PI * 2, p: V3 = [a, r * 0.75 + Math.sin(t) * r, ff + Math.cos(t) * r]; D.cap([a - w / 2, p[1], p[2]], [a + w / 2, p[1], p[2]], 0.35, 0.35, x.P.wood, key + 0.001, { noLine: true }); }
    D.cap([a - w / 2, r * 0.75, ff], [a + w / 2, r * 0.75, ff], 0.5, 0.5, x.P.dark, key + 0.002);
    if (moving(x)) for (let i = 0; i < 3; i++) D.ell([a, 0.2, ff - r - i * 1.5], 1.2 + i * 0.5, 0.4, x.P.foam, -900 + i, { g: D.group(), noLine: true });
  };
  if (sternWheel) { at(x, 0, () => one(0, st[st.length - 1].f - r * 0.9, halfWidth(st, st[st.length - 1].f) * 1.6)); return; }
  for (const s of [-1, 1]) {
    const a = s * (halfWidth(st, f) + 1.2);
    at(x, 0, () => one(a, f, 2.2));
    const q = r * 1.2;
    offsetA(x, a, () => loft(x, [{ f: f + q, w: 1.4, bw: 1.4, tw: 1.3, wy: 0, y0: r * 0.6, y1: r * 1.9 }, { f: f - q, w: 1.4, bw: 1.4, tw: 1.3, wy: 0, y0: r * 0.6, y1: r * 1.9 }], x.body, { round: 1, key: D.depth([a, r, f]) + 0.05 }));
  }
}

// ---------------------------------------------------------------------------------------------------
// Superstructures, funnels, masts, gear
// ---------------------------------------------------------------------------------------------------
type Super = 'block' | 'stepped' | 'streamline' | 'pagoda' | 'stealth' | 'dome' | 'spire';
/** tiers of deckhouses with windows; returns the top height */
function superstructure(x: VCtx, st: Station[], style: Super, f0: number, f1: number, tiers: number, tierH: number, m: Mat, glass: Mat) {
  const D = x.D, e = x.e;
  let y = deckAt(st, (f0 + f1) / 2), top = y;
  for (let i = 0; i < tiers; i++) {
    const shrink = style === 'stepped' ? i * 0.12 : style === 'pagoda' ? i * 0.18 : i * 0.06, fa = lerp(f0, f1, shrink * 0.8), fb2 = lerp(f1, f0, shrink * 0.3);
    const hw = halfWidth(st, (f0 + f1) / 2) * (style === 'stealth' ? 0.8 : 0.72) * (1 - shrink * 0.8), h = tierH * (style === 'pagoda' && i === tiers - 1 ? 1.4 : 1);
    if (style === 'streamline' || style === 'dome') {
      const n = 5, sts: Station[] = Array.from({ length: n }, (_, k) => { const t = k / (n - 1), ff = lerp(fb2, fa, t), round = Math.sin(Math.PI * t) ** 0.4; return { f: ff, w: hw * Math.max(0.35, round), bw: hw * Math.max(0.35, round), tw: hw * Math.max(0.3, round) * 0.9, wy: 0.2, y0: y, y1: y + h }; });
      loft(x, sts, m, { round: 1 });
    } else block(x, -hw, fa, hw, fb2, y, y + h, m, m, { slopeS: style === 'stealth' ? 0.35 : 0, slopeF: style === 'stealth' ? 0.4 : 0 });
    // windows: rows of portholes low, a band of glass on the bridge (top tier)
    const last = i === tiers - 1, inset = style === 'stealth' ? 0.72 : style === 'streamline' || style === 'dome' ? 0.95 : 1.0;
    if (e >= 3) for (const s of [-1, 1]) {
      if (last || style === 'stepped') windowBand(x, [s * hw * inset, y + h * 0.45, fa + 0.8], [s * hw * inset, y + h * 0.45, fb2 - 0.8], h * 0.35, Math.max(2, Math.round((fb2 - fa) / 2.2)), glass, D.depth([s * hw, y + h / 2, (fa + fb2) / 2]) + 0.2);
      else portholes(x, [s * hw, y + h * 0.55, fa + 0.6], [s * hw, y + h * 0.55, fb2 - 0.6], Math.max(2, Math.round((fb2 - fa) / 2.5)), 0.35, glass, D.depth([s * hw, y + h / 2, (fa + fb2) / 2]) + 0.2);
    }
    if (last && e >= 3) { const ff = fb2 + (style === 'stealth' ? -h * 0.35 : 0) + 0.05; windowBand(x, [-hw * 0.8 * inset, y + h * 0.45, ff], [hw * 0.8 * inset, y + h * 0.45, ff], h * 0.35, Math.max(2, Math.round(hw)), glass, D.depth([0, y + h / 2, fb2]) + 0.2); }
    // bridge wings
    if (last && e >= 4 && style !== 'stealth' && style !== 'dome' && style !== 'streamline') block(x, -hw * 1.35, fb2 - 1.2, hw * 1.35, fb2, y + h * 0.85, y + h * 0.97, m, m);
    if (style === 'pagoda' && i < tiers - 1) block(x, -hw * 1.2, fb2 - 1.2, hw * 1.2, fb2 + 0.4, y + h, y + h + 0.3, x.P.dark, x.P.dark);
    y += h; top = y;
  }
  if (style === 'dome') dome(x, [0, top, (f0 + f1) / 2], halfWidth(st, (f0 + f1) / 2) * 0.55, (f1 - f0) * 0.3, tierH * 1.2, glass);
  if (style === 'spire') { D.cap([0, top, (f0 + f1) / 2], [0, top + tierH * 3, (f0 + f1) / 2 - 1], tierH * 0.6, 0.15, m, D.depth([0, top + tierH, (f0 + f1) / 2])); top += tierH * 3; }
  return top;
}
type FunnelStyle = 'round' | 'raked' | 'square' | 'twin' | 'stack';
function funnel(x: VCtx, f: number, y: number, h: number, r: number, style: FunnelStyle, band: Mat, kind: 'steam' | 'diesel' | 'soot') {
  const D = x.D, P = x.P, rake = style === 'raked' ? 0.35 : style === 'stack' ? 0 : 0.12, top: V3 = [0, y + h, f - h * rake];
  const key = D.depth([0, y + h / 2, f - h * rake * 0.5]);
  if (style === 'square') { block(x, -r, f - r * 1.3, r, f + r * 1.3, y, y + h, x.body2, P.dark, { slopeB: -0.15 }); D.cap([-r * 1.01, y + h * 0.82, f], [r * 1.01, y + h * 0.82, f], r * 0.18, r * 0.18, band, key + 0.01, { noLine: true }); }
  else if (style === 'twin') for (const s of [-1, 1]) { D.cap([s * r * 0.6, y, f], [s * r * 0.6, y + h, f - h * rake], r * 0.5, r * 0.45, x.body2, key + s * 0.001); D.ell([s * r * 0.6, y + h * 0.85, f - h * rake * 0.85], r * 0.52, r * 0.25, band, key + 0.01, { g: D.group(), noLine: true }); }
  else {
    const sr = style === 'stack' ? r * 0.45 : r;
    D.cap([0, y, f], top, sr * 1.05, sr, style === 'stack' ? P.dark : x.body2, key, { g: D.group() });
    if (style !== 'stack') { D.ell([0, y + h * 0.78, f - h * rake * 0.78], sr * 1.02, sr * 0.3, band, key + 0.01, { g: D.group(), noLine: true }); D.ell([0, y + h * 0.9, f - h * rake * 0.9], sr * 1.02, sr * 0.3, P.dark, key + 0.011, { g: D.group(), noLine: true }); }
  }
  exhaust(x, [0, y + h + 0.6, f - h * rake], kind, r * 0.9);
  return top;
}
type MastStyle = 'pole' | 'tripod' | 'lattice' | 'stealth' | 'radar';
function modernMast(x: VCtx, f: number, y: number, h: number, style: MastStyle) {
  const D = x.D, P = x.P, e = x.e;
  if (style === 'tripod') { for (const [a, ff] of [[0, 1.2], [-1, -0.8], [1, -0.8]]) rod(x, [a * 1.2, y, f + ff], [0, y + h, f], 0.28, x.body2); block(x, -1.4, f - 1.2, 1.4, f + 1.2, y + h * 0.8, y + h * 0.95, x.body2, x.body2); }
  else if (style === 'lattice') { for (const s of [-1, 1]) rod(x, [s * 1.2, y, f], [s * 0.3, y + h, f], 0.2, P.dark); for (let i = 1; i < 5; i++) { const yy = y + (h * i) / 5, w = lerp(1.2, 0.3, i / 5); rod(x, [-w, yy, f], [w, yy + h / 5, f], 0.1, P.dark); } }
  else if (style === 'stealth') loft(x, [{ f: f + 1.4, w: 1.2, bw: 1.6, tw: 0.5, wy: 0, y0: y, y1: y + h }, { f: f - 1.4, w: 1.2, bw: 1.6, tw: 0.5, wy: 0, y0: y, y1: y + h }], x.body2, { top: x.body2 });
  else rod(x, [0, y, f], [0, y + h, f], 0.3, x.body2);
  // yardarm, radar that turns, lights
  rod(x, [-2.4, y + h * 0.75, f], [2.4, y + h * 0.75, f], 0.14, P.dark);
  if (e >= 4) { const t = x.ph * 2, c: V3 = [0, y + h + 0.3, f]; D.cap([c[0] - Math.cos(t) * 2, c[1], c[2] - Math.sin(t) * 2], [c[0] + Math.cos(t) * 2, c[1], c[2] + Math.sin(t) * 2], 0.4, 0.4, P.dark, D.depth(c) + 0.05); }
  if (e >= 5 && style !== 'pole') for (const s of [-1, 1]) D.ell([s * 1.3, y + h * 0.6, f + 0.9], 0.8, 0.8, x.P.paint2, D.depth([s, y + h * 0.6, f + 1]) + 0.04, { g: D.group() });
  light(x, [0, y + h + 0.8, f], 0.35, e >= 6 ? P.glow : { ...x.K.fire, emit: true }, undefined, true);
}
function lifeboats(x: VCtx, st: Station[], f0: number, f1: number, y: number, n: number) {
  const D = x.D;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) { const f = lerp(f0, f1, (i + 0.5) / n), a = s * (halfWidth(st, f) * 0.85); pod(x, [a, y + 0.9, f], 1.4, 3.4, 1.1, i % 2 ? x.P.paint2 : { ...x.P.paint2, ramp: ramp(0.06, 0.8, 0.5) }, D.depth([a, y, f]) + 0.05); }
}
function derrick(x: VCtx, f: number, y: number, h: number, dir: number) {
  const D = x.D;
  rod(x, [0, y, f], [0, y + h, f], 0.3, x.body2);
  const boom: V3 = [Math.sin(dir) * h * 0.8, y + h * 0.35, f + Math.cos(dir) * h * 0.8];
  D.cap([0, y + 1, f], boom, 0.22, 0.18, x.body2, D.depth([boom[0] / 2, y + h / 2, f]) + 0.01, { noLine: true });
  rod(x, [0, y + h, f], boom, 0.08, x.P.dark);
  rod(x, boom, [boom[0], boom[1] - 2.5, boom[2]], 0.06, x.P.dark);
}

// ---------------------------------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------------------------------
interface ShipDesign { form: 'mono' | 'cat' | 'tri' | 'outrigger' | 'raft' | 'reed'; bow: Bow; stern: Stern; rig: Rig; supers: Super; funnel: FunnelStyle; mast: MastStyle; tshape: TurretShape; band: Mat }
function design(x: VCtx, role: string): ShipDesign {
  const e = x.e, d = x.d, ex = x.C.params.exotic, wet = x.C.params.water > 0.6, plan = x.C.plan;
  const civil = role === 'cargo' || role === 'passenger';
  const form = e === 0 ? pick(d[1], [['mono', 3], ['outrigger', wet ? 3 : 1.5], ['raft', role === 'cargo' ? 3 : civil ? 0.5 : 0], ['reed', civil ? 1.5 : 0], ['cat', ex * 2]] as [ShipDesign['form'], number][])
    : e <= 2 ? pick(d[1], [['mono', 6], ['outrigger', wet && ex > 0.4 ? 1 : 0], ['cat', ex > 0.6 ? 1 : 0]] as [ShipDesign['form'], number][])
      : e <= 5 ? pick(d[1], [['mono', 8], ['cat', ex > 0.5 || role === 'passenger' ? 1 : 0], ['tri', ex > 0.6 ? 0.8 : 0]] as [ShipDesign['form'], number][])
        : pick(d[1], [['mono', 4], ['cat', 2 + ex], ['tri', 1.5 + ex * 2]] as [ShipDesign['form'], number][]);
  const bow: Bow = e <= 0 ? 'canoe' : e <= 2 ? (role === 'light' && e >= 1 ? pick<Bow>(d[2], [['ram', 2], ['spoon', 1], ['canoe', 1]]) : pick<Bow>(d[2], [['spoon', 2], ['raked', 2], ['canoe', e === 1 ? 1 : 0]])) : e === 3 ? pick<Bow>(d[2], [['plumb', 2], ['clipper', 2], ['ram', role !== 'cargo' && role !== 'passenger' ? 2 : 0]]) : e <= 5 ? pick<Bow>(d[2], [['raked', 3], ['clipper', 1], ['bulb', role === 'cargo' ? 2 : 0.5]]) : pick<Bow>(d[2], [['raked', 2], ['plumb', 1], ['spoon', 1]]);
  const stern: Stern = e <= 0 ? 'canoe' : e <= 2 ? pick<Stern>(d[3], [['castle', role === 'light' ? 0.5 : 3], ['round', 1], ['canoe', e === 1 ? 1.5 : 0]]) : e <= 4 ? pick<Stern>(d[3], [['cruiser', 2], ['round', 1], ['transom', 1]]) : pick<Stern>(d[3], [['transom', 3], ['cruiser', 1]]);
  const junkCulture = plan === 'hex' || plan === 'oct' || ex > 0.55;
  const rig: Rig = e <= 0 ? 'crab' : e === 1 ? pick<Rig>(d[4], [['square', 3], ['lateen', 1.5], ['junk', junkCulture ? 3 : 0.4], ['crab', ex > 0.5 ? 1 : 0]]) : pick<Rig>(d[4], [['square', 3], ['lateen', 1.5], ['junk', junkCulture ? 3 : 0.4], ['gaff', 1.5]]);
  const supers: Super = e >= 7 ? pick<Super>(d[5], [['dome', 2], ['spire', ex * 2], ['streamline', 1]]) : e === 6 ? pick<Super>(d[5], [['stealth', 2], ['streamline', 1.5], ['dome', plan === 'round' || plan === 'pod' ? 2 : 0.5], ['spire', ex]]) : e === 5 ? pick<Super>(d[5], [['block', 2], ['stealth', role === 'cargo' || role === 'passenger' ? 0.3 : 2], ['streamline', 1]]) : e === 4 ? pick<Super>(d[5], [['block', 2], ['stepped', 1.5], ['streamline', 1], ['pagoda', role === 'heavy' ? 2 : 0]]) : pick<Super>(d[5], [['block', 2], ['stepped', 1]]);
  const funnelS: FunnelStyle = e === 3 ? pick<FunnelStyle>(d[6], [['round', 3], ['raked', 1]]) : e === 4 ? pick<FunnelStyle>(d[6], [['round', 2], ['raked', 2], ['twin', 1]]) : e === 5 ? pick<FunnelStyle>(d[6], [['square', 2], ['raked', 1.5], ['stack', 1]]) : pick<FunnelStyle>(d[6], [['stack', 1], ['square', 1]]);
  const mastS: MastStyle = e === 3 ? 'pole' : e === 4 ? pick<MastStyle>(d[7], [['tripod', 2], ['pole', 1], ['lattice', 1]]) : e === 5 ? pick<MastStyle>(d[7], [['lattice', 2], ['tripod', 1], ['stealth', 1]]) : pick<MastStyle>(d[7], [['stealth', 2], ['lattice', 1]]);
  const tshape: TurretShape = e === 3 ? pick<TurretShape>(d[8], [['round', 2], ['box', 2]]) : e === 4 ? pick<TurretShape>(d[8], [['box', 3], ['cast', 1]]) : e === 5 ? pick<TurretShape>(d[8], [['wedge', 2], ['box', 1], ['dome', 1]]) : e === 6 ? pick<TurretShape>(d[8], [['wedge', 2], ['dome', 1], ['hex', plan === 'hex' ? 2 : 0.3]]) : pick<TurretShape>(d[8], [['dome', 2], ['saucer', 2], ['bulb', ex * 2]]);
  const bandH = x.C.mode === 'alien' ? x.C.hues[2] : [0.0, 0.08, 0.13, 0.58, 0.35][Math.floor(d[9] * 5)];
  return { form, bow, stern, rig, supers, funnel: funnelS, mast: mastS, tshape, band: { ramp: ramp(bandH, 0.7, 0.45), tex: 'smooth' } };
}
/** hull materials for the era and role */
function hullMats(x: VCtx, war: boolean): { side: Mat; deck: Mat; boot?: Mat; rail?: Mat } {
  const e = x.e, P = x.P;
  const dark = (m: Mat, k: number): Mat => ({ ...m, ramp: m.ramp.map(c => c.map(v => v * k)) as typeof m.ramp });
  if (e <= 2) return { side: war && x.d[10] < 0.5 ? dark(P.plank, 0.72) : P.plank, deck: P.deck, boot: dark(P.plank, 0.55), rail: P.wood };
  if (war) return { side: x.body, deck: e <= 4 ? P.deck : P.deckSteel, boot: P.boot, rail: P.dark };
  const civil = x.d[10] < 0.4 ? P.boot : x.d[10] < 0.7 ? x.body : P.paint2;
  return { side: { ...civil, tex: e === 3 ? 'plates' : 'smooth' }, deck: e <= 4 ? P.deck : P.deckSteel, boot: P.antifoul, rail: P.paint2 };
}
function sizeOf(x: VCtx, base: number) { const eraK = [0.72, 0.85, 1, 1.1, 1.15, 1.2, 1.2, 1.2][x.e]; return base * x.Z * eraK; }

// ---------------------------------------------------------------------------------------------------
// Ancient hulls with rigs (tribal to classical), shared by civil and war roles
// ---------------------------------------------------------------------------------------------------
function sailingShip(x: VCtx, ds: ShipDesign, role: 'cargo' | 'passenger' | 'light' | 'medium' | 'heavy') {
  const { e, P, D } = x, b = tier(x), war = role !== 'cargo' && role !== 'passenger';
  const L = sizeOf(x, role === 'heavy' ? 22 : role === 'medium' ? 17 : role === 'light' ? 15 : 12), W = L * (role === 'light' ? 0.2 : 0.3), fb = W * (role === 'heavy' ? 0.62 : 0.42);
  const mats = hullMats(x, war);
  if (ds.form === 'raft' || ds.form === 'reed') {
    wake(x, W * 1.6, L);
    if (ds.form === 'raft') { const n = 7; for (let i = 0; i < n; i++) { const a = -W * 0.8 + (W * 1.6 * (i + 0.5)) / n; D.cap([a, 0.6, -L / 2], [a, 0.6, L / 2], W * 0.12, W * 0.11, x.K.trunk, D.depth([a, 0.6, 0])); } }
    else { for (let i = -2; i <= 2; i++) { const a = i * W * 0.28; D.cap([a, 0.8, -L / 2 + 1], [a, 0.8, L / 2 - 1], W * 0.2, W * 0.2, P.wicker, D.depth([a, 0.8, 0])); } for (const s of [1, -1]) D.cap([0, 1, s * L * 0.42], [0, W * 0.9, s * (L / 2 + 1)], W * 0.25, 0.3, P.wicker, D.depth([0, 2, s * L / 2]) + 0.02); }
    const deckY = ds.form === 'raft' ? W * 0.2 : W * 0.35;
    up(x, () => {
      block(x, -W * 0.4, -L * 0.35, W * 0.4, -L * 0.08, deckY, deckY + W * 0.55, P.wicker, null);
      loft(x, [{ f: -L * 0.05, w: W * 0.5, bw: W * 0.5, tw: 0.2, wy: 0, y0: deckY + W * 0.55, y1: deckY + W * 0.95 }, { f: -L * 0.38, w: W * 0.5, bw: W * 0.5, tw: 0.2, wy: 0, y0: deckY + W * 0.55, y1: deckY + W * 0.95 }], { ...x.K.roof, tex: 'thatch' }, { open: true });
      mast(x, L * 0.15, deckY, deckY + L * 0.7, 0.4);
      if (ds.rig === 'crab' || e === 0) foreSail(x, L * 0.15, deckY + 1.5, deckY + L * 0.68, L * 0.4, P.hide, 'crab'); else squareSail(x, L * 0.15, deckY + 2, deckY + L * 0.65, W * 1.3, P.hide);
      if (b > 0) for (let i = 0; i < 2 + b; i++) (i % 2 ? sack : barrel)(x, (i % 2 ? 1 : -1) * W * 0.4, L * 0.3 - i * 1.5, deckY, 1.8, i % 2 ? x.K.cloth2 : P.wood);
    });
    x.label = ds.form === 'raft' ? 'Jangada' : 'Barco de junco';
    return;
  }
  // canoe-like hulls (tribal) paddle; bigger old hulls row and sail
  const bow: Bow = ds.bow, stern: Stern = ds.stern;
  const h: HullSpec = { L, W, fb, bow, stern, sheerF: e === 0 ? fb * 0.4 : bow === 'canoe' ? fb * 1.1 : fb * 0.5, sheerA: stern === 'castle' ? fb * 0.9 : stern === 'canoe' ? fb * 1.1 : fb * 0.6, flare: e === 0 ? 0.05 : role === 'heavy' || role === 'medium' ? -0.12 : 0.02, fine: role === 'light' ? 0.9 : 0.5 };
  wake(x, W, L);
  extraHulls(x, h, ds.form, mats.side, mats.deck);
  const st = hull(x, h, mats.side, mats.deck, mats.boot, mats.rail);
  const deckY = (f: number) => deckAt(st, f);
  if (e === 0) {
    oars(x, W, fb, Array.from({ length: war ? 3 + b : 2 }, (_, i) => L * 0.25 - (i * L * 0.5) / Math.max(1, (war ? 2 + b : 1))), 3.5, true);
    up(x, () => {
      // carved prow (figure) and, on war canoes, painted shields; cargo canoes carry bundles
      D.cap([0, deckY(L * 0.45), L * 0.46], [0, deckY(L * 0.45) + 3, L * 0.5 + 0.8], 0.6, 0.4, P.wood, D.depth([0, fb, L / 2]) + 0.1);
      D.ell([0, deckY(L * 0.45) + 3.3, L * 0.5 + 0.9], 0.9, 0.9, x.body, D.depth([0, fb, L / 2]) + 0.11, { g: D.group() });
      if (ds.form === 'outrigger' || b >= 1) { mast(x, L * 0.05, deckY(0), deckY(0) + L * 0.55, 0.35); foreSail(x, L * 0.05, deckY(0) + 0.8, deckY(0) + L * 0.53, L * 0.4, P.hide, 'crab'); }
      if (!war) for (let i = 0; i < 1 + b; i++) sack(x, 0, -L * 0.1 + i * 1.8, deckY(0) - 0.3, 1.6, x.K.cloth2);
    });
    x.label = war ? 'Canoa de guerra' : ds.form === 'outrigger' ? 'Canoa com flutuador' : ds.form === 'cat' ? 'Canoa dupla' : 'Canoa';
    return;
  }
  // castles fore and aft on round ships
  up(x, () => {
    if (stern === 'castle' && role !== 'light') {
      const f0 = -L * 0.48, f1 = -L * (role === 'heavy' ? 0.26 : 0.32), y = deckY(-L * 0.4), hw = halfWidth(st, -L * 0.38) * 0.95;
      block(x, -hw, f0, hw, f1, y - 0.5, y + fb * 0.55, mats.side, P.deck);
      if (e === 2) for (const s of [-1, 1]) windowBand(x, [s * hw * 1.01, y + fb * 0.18, f0 + 0.6], [s * hw * 1.01, y + fb * 0.18, f1 - 0.6], fb * 0.2, 3, x.K.winLit ?? P.glass, D.depth([s * hw, y, (f0 + f1) / 2]) + 0.2);
      if (e === 2 && D.facing([0, 0, -1]) > 0) windowBand(x, [-hw * 0.8, y + fb * 0.2, f0 - 0.05], [hw * 0.8, y + fb * 0.2, f0 - 0.05], fb * 0.2, 4, x.K.winLit ?? P.glass, D.depth([0, y, f0]) + 0.2);
      for (const s of [-1, 1]) light(x, [s * hw * 0.8, y + fb * 0.7, f0 + 0.3], 0.55, x.K.fire);
      if (role === 'medium' || role === 'heavy' || b === 2) block(x, -halfWidth(st, L * 0.36) * 0.9, L * 0.28, halfWidth(st, L * 0.36) * 0.9, L * 0.42, deckY(L * 0.35) - 0.4, deckY(L * 0.35) + fb * 0.4, mats.side, P.deck);
    }
  });
  // oars on galleys and longships
  const rowed = role === 'light' || (e === 1 && x.d[11] < 0.3);
  if (rowed) { const n = 4 + b * 2; oars(x, W, fb * 0.75, Array.from({ length: n }, (_, i) => L * 0.3 - (i * L * 0.58) / (n - 1)), fb * 2.4); }
  // rig: masts and sails
  const nm = role === 'light' ? 1 : role === 'heavy' ? 3 : e === 2 && role !== 'cargo' ? 3 : Math.min(3, 1 + b);
  const H = L * (role === 'light' ? 0.55 : 0.8), sailM = x.d[12] < 0.3 ? P.sail2 : P.sail, stripe = war && e === 1 ? x.body : undefined;
  up(x, () => {
    const mf = nm === 1 ? [L * 0.05] : nm === 2 ? [L * 0.18, -L * 0.18] : [L * 0.26, L * 0.02, -L * 0.24];
    mf.forEach((f, i) => {
      const hh = H * (nm === 3 ? [0.85, 1, 0.72][i] : 1), y0 = deckY(f);
      mast(x, f, y0 - 0.3, y0 + hh, 0.45 + (role === 'heavy' ? 0.2 : 0));
      if (ds.rig === 'square' || (ds.rig === 'gaff' && i < nm - 1)) {
        const tiersN = e === 2 && role !== 'light' ? (role === 'heavy' ? 3 : 2) : 1;
        for (let k = 0; k < tiersN; k++) { const a0 = y0 + hh * (0.2 + k * (0.75 / tiersN)), a1 = y0 + hh * (0.2 + (k + 1) * (0.75 / tiersN)) - 0.4; squareSail(x, f, a0, a1, W * (1.5 - k * 0.3) * (hh / H), sailM, k === 0 ? stripe : undefined); }
        if (e === 2 && (nm === 1 || i === 1)) D.cap([0, y0 + hh * 0.7, f], [0, y0 + hh * 0.7 + 0.8, f], 1, 1, P.wood, D.depth([0, y0 + hh * 0.7, f]) + 0.01); // crow's nest
      } else if (ds.rig === 'junk') foreSail(x, f, y0 + 0.6, y0 + hh * 0.95, L * 0.35, x.d[12] < 0.5 ? P.sail2 : P.canvas, 'junk');
      else foreSail(x, f, y0 + 0.6, y0 + hh * 0.95, L * 0.38, sailM, ds.rig === 'lateen' ? 'lateen' : ds.rig === 'crab' ? 'crab' : 'gaff');
      banner(x, [0, y0 + hh, f], 2, 3, x.body, P.wood, true);
    });
    // bowsprit and jib on sailing ships of the classical era
    if (e === 2 && role !== 'light') { const by = deckY(L * 0.45) + 0.5; D.cap([0, by, L * 0.45], [0, by + 3, L * 0.5 + L * 0.12], 0.4, 0.25, P.wood, D.depth([0, by, L * 0.5]) + 0.05); jib(x, L * 0.5 + L * 0.1, by + 2.5, mf[0], deckY(mf[0]) + H * 0.7, sailM); }
    // rigging from mast heads to the rails
    for (const f of mf) for (const s of [-1, 1]) rod(x, [0, deckY(f) + H * 0.75, f], [s * halfWidth(st, f - 2), deckY(f - 2) + 0.2, f - 2], 0.07, P.rope);
    // dragon head on longships
    if (role === 'light' && e === 1) { D.cap([0, deckY(L * 0.48), L * 0.49], [0, deckY(L * 0.48) + 2.5, L * 0.52 + 1], 0.8, 0.5, P.wood, D.depth([0, fb, L / 2]) + 0.1); D.ell([0, deckY(L * 0.48) + 2.8, L * 0.52 + 1.6], 1.2, 0.8, P.wood, D.depth([0, fb, L / 2]) + 0.11, { g: D.group() }); }
    if (war) {
      // shields along the rail (longships), a bow gun or a Greek-fire siphon
      if (role === 'light' && e === 1) for (const s of [-1, 1]) if (D.facing([s, 0, 0]) > 0.05) for (let i = 0; i < 5 + b * 2; i++) { const f = L * 0.3 - (i * L * 0.6) / (4 + b * 2), c: V3 = [s * (halfWidth(st, f) + 0.2), deckY(f) - 0.3, f]; D.ell(c, 1, 1, i % 2 ? x.body : P.paint2, D.depth(c) + 0.1, { g: D.group() }); D.ell(c, 0.3, 0.3, P.metal, D.depth(c) + 0.11, { g: D.group() }); }
      const bowP: V3 = [0, deckY(L * 0.4) + 0.8, L * 0.42];
      if (role === 'light' && e === 2) fixedGun(x, { kind: 'cannon', len: 3.5 * x.Z * 0.6, r: 0.4 * x.Z * 0.6, muzzle: 'bell', m: P.bronze }, bowP, 0, 0.2);
      else if (role === 'light' && x.C.params.exotic > 0.45) fixedGun(x, { kind: 'flame', len: 2.2, r: 0.5, muzzle: 'bell', m: P.bronze }, bowP, 0, 0.3);
    }
  });
  // gun decks (classical warships) and broadsides
  if (war && e === 2 && role !== 'light') { const decks = role === 'heavy' ? 3 : 1; for (let k = 0; k < decks; k++) gunDeck(x, st, fb * (0.3 + k * 0.26), -L * 0.3, L * 0.24, 6 + b * 2, x.d[13] < 0.5 ? P.paint2 : x.body); }
  if (war && e === 1 && role === 'medium') up(x, () => fixedGun(x, { kind: 'bolt', len: 3, r: 0.3 }, [0, deckY(L * 0.35) + fb * 0.4 + 0.8, L * 0.4], 0, 0.3));
  const names: Record<string, string[]> = {
    cargo: ['', ds.rig === 'junk' ? 'Junco de carga' : ds.rig === 'lateen' ? 'Dau' : b === 0 ? 'Barco a vela' : 'Coca de carga', ds.rig === 'junk' ? 'Junco mercante' : b === 0 ? 'Chalupa' : ds.rig === 'lateen' ? 'Caravela' : 'Nau mercante'],
    passenger: ['', ds.rig === 'junk' ? 'Junco de passageiros' : 'Barco de passageiros', ds.rig === 'junk' ? 'Junco de passageiros' : 'Galeão de passageiros'],
    light: ['', rowed ? 'Drakkar' : 'Barco de guerra', 'Galé'],
    medium: ['', 'Coca de guerra', ds.rig === 'junk' ? 'Junco de guerra' : 'Fragata'],
    heavy: ['', '', 'Nau de linha'],
  };
  x.label = names[role][e] || 'Navio';
}
/** a row of gun ports on the flared sides on a painted band; the side facing the viewer fires a rippling broadside */
function gunDeck(x: VCtx, st: Station[], y: number, f0: number, f1: number, n: number, band: Mat) {
  const D = x.D, fireSide = D.facing([1, 0, 0]) >= 0 ? 1 : -1, f = frameOf(x);
  const sideA = (ff: number, yy: number) => { const hw = halfWidth(st, ff); return hw * (0.8 + 0.2 * Math.min(1, yy / Math.max(0.1, deckAt(st, ff)))) + 0.08; };
  for (const s of [-1, 1]) {
    const vis = D.facing([s, 0, 0]) > 0.05;
    at(x, 1, () => {
      if (vis) { const lo: V3[] = [], hi: V3[] = []; for (let i = 0; i <= 6; i++) { const ff = lerp(f0 - 1, f1 + 1, i / 6); lo.push([s * sideA(ff, y - 0.8), y - 0.8, ff]); hi.push([s * sideA(ff, y + 0.8), y + 0.8, ff]); } D.poly(clean([...lo, ...hi.reverse()]), band, D.depth([s * halfWidth(st, 0), y, 0]) + 0.1, { g: D.group(), flat: 0.9, dark: D.light([s, 0, 0]) }); }
      for (let i = 0; i < n; i++) {
        const ff = f0 + ((f1 - f0) * (i + 0.5)) / n, a = s * sideA(ff, y);
        if (vis) {
          D.poly([[a, y - 0.5, ff - 0.5], [a, y - 0.5, ff + 0.5], [a, y + 0.5, ff + 0.5], [a, y + 0.5, ff - 0.5]], x.P.dark, D.depth([a, y, ff]) + 0.12, { g: D.group(), flat: 0.9 });
          const rec = s === fireSide && acting(x) && (f === 4 || f === 5) ? -0.5 : 0;
          D.cap([a, y, ff], [a + s * (1 + rec), y, ff], 0.3, 0.26, x.P.dark, D.depth([a, y, ff]) + 0.13);
        }
        // a broadside ripples down the side: each gun fires on its own frame; a few puffs, not a wall of smoke
        if (s === fireSide && acting(x) && i % 2 === 0) {
          const fire0 = 4 + Math.floor((i / n) * 3);
          if (f >= fire0) {
            const age = f - fire0, p: V3 = [a + s * 1.2, y, ff];
            if (age === 0) fire(x, { kind: 'cannon', len: 2, r: 0.35 }, p, [s, 0.02, 0], { key: 2e4 + D.depth(p), depth: -1e9 }, i);
            const r = 0.8 + age * 0.8;
            D.ell([p[0] + s * (1.5 + age * 1.6), y + age * 0.8, ff + age * 0.3], r * 1.3, r, { ...x.P.smoke, alpha: 0.85 }, 2e4 + D.depth(p) + age, { g: D.group() });
          }
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------------
// Powered ships (industrial era on)
// ---------------------------------------------------------------------------------------------------
function poweredHull(x: VCtx, ds: ShipDesign, role: string, base: number, beam: number, war: boolean) {
  const e = x.e, L = sizeOf(x, base), W = L * beam, fb = W * (role === 'light' ? 0.34 : 0.4);
  const hover2 = e === 7 && x.d[14] < 0.6, foil = e === 6 && (role === 'light' || role === 'passenger') && x.d[14] < 0.5;
  const lift = hover2 ? 2.2 * x.Z * 0.5 + Math.sin(x.ph) * 0.4 : foil ? (moving(x) ? 2.2 * x.Z * 0.5 : 0.4) : 0;
  const h: HullSpec = { L, W, fb, bow: ds.bow, stern: ds.stern, sheerF: fb * (e === 3 ? 0.3 : 0.5), sheerA: fb * 0.12, flare: e >= 5 ? 0.08 : 0.02, fine: role === 'cargo' ? 0.2 : role === 'light' ? 1 : 0.7, y0: lift };
  const mats = hullMats(x, war);
  if (hover2) hover(x, W * (ds.form === 'mono' ? 1 : 2), L, lift, 'skirt', true);
  else if (foil) { wake(x, W * 0.6, L * 0.7); for (const f of [L * 0.3, -L * 0.3]) for (const s of [-1, 1]) x.D.cap([s * W * 0.35, lift + 0.5, f], [s * W * 0.45, 0.05, f], 0.4, 0.35, x.P.steel, x.D.depth([s * W * 0.4, lift / 2, f]) - 0.05); }
  else wake(x, W * (ds.form === 'mono' ? 1 : ds.form === 'tri' ? 2.2 : 1.6), L);
  extraHulls(x, h, ds.form, mats.side, mats.deck);
  const st = hull(x, h, mats.side, mats.deck, mats.boot, mats.rail);
  // hull numbers on warships, anchors at the bow
  if (war && e >= 4) for (const s of [-1, 1]) emblem(x, [s * halfWidth(st, L * 0.32) * 1.01, lift + fb * 0.6, L * 0.32], [s, 0, 0], fb * 0.2, 3, x.P.paint2, x.P.paint2);
  up(x, () => { for (const s of [-1, 1]) if (x.D.facing([s, 0, 0]) > 0) x.D.ell([s * halfWidth(st, L * 0.42) * 1.02, lift + fb * 0.8, L * 0.42], 0.45, 0.6, x.P.dark, x.D.depth([s * halfWidth(st, L * 0.42), fb, L * 0.42]) + 0.1, { g: x.D.group() }); });
  return { st, L, W, fb, lift, deckY: (f: number) => deckAt(st, f) };
}
function steamPlant(x: VCtx, ds: ShipDesign, f: number, y: number, n: number, h: number, r: number) {
  const kind = x.e === 3 ? 'steam' : x.e <= 4 ? 'soot' : 'diesel';
  const spacing = r * 2.6;
  for (let i = 0; i < n; i++) funnel(x, f - (i - (n - 1) / 2) * spacing, y, h, r, ds.funnel, ds.band, kind);
}

function civilPowered(x: VCtx, ds: ShipDesign, role: 'cargo' | 'passenger') {
  const { e, P, D } = x, b = tier(x);
  const load = role === 'cargo' ? pick(x.d[15], [['general', 2], ['tanker', 2], ['container', e >= 5 ? 3 : 0], ['bulk', 1.5], ['rotor', e >= 6 ? 3 : 0], ['pods', e >= 7 ? 3 : 0]] as [string, number][]) : pick(x.d[15], [['liner', 3], ['ferry', 2], ['paddle', e === 3 ? 3 : 0], ['yacht', b === 0 ? 3 : 0.5]] as [string, number][]);
  const { st, L, W, fb, lift, deckY } = poweredHull(x, ds, role, role === 'cargo' ? 17 : 15, role === 'cargo' ? 0.17 : 0.15, false);
  const sm = e >= 6 ? P.paint2 : x.d[16] < 0.5 ? P.paint2 : { ...P.paint2, ramp: ramp(0.12, 0.2, 0.8) };
  if (load === 'paddle' && role === 'passenger') paddleWheels(x, st, 0, fb * 1.2, x.d[19] < 0.35);
  up(x, () => {
    if (role === 'cargo') {
      // bridge aft on modern cargo ships, amidships on older ones
      const aft = e >= 4 || load === 'tanker' || load === 'container', bf0 = aft ? -L * 0.46 : -L * 0.12, bf1 = bf0 + L * 0.16;
      const top = superstructure(x, st, ds.supers === 'pagoda' ? 'block' : ds.supers, bf0, bf1, 2 + (b > 0 ? 1 : 0), fb * 0.55, sm, P.glass);
      if (e <= 5) at(x, 2, () => steamPlant(x, ds, bf0 + L * 0.03, top - fb * 0.3, 1, fb * 0.9, W * 0.1));
      at(x, 2, () => modernMast(x, bf1 - 1, top, fb * 0.8, e >= 5 ? 'lattice' : 'pole'));
      const h0 = aft ? bf1 + 1 : -L * 0.44, h1 = L * 0.4;
      if (load === 'tanker') { D.cap([0, deckY(0) + 0.6, h1], [0, deckY(0) + 0.6, h0], 0.5, 0.5, P.dark, D.depth([0, deckY(0), 0]) + 0.01); for (let i = 0; i < 4; i++) { const f = lerp(h0, h1, (i + 0.5) / 4); D.ell([0, deckY(f) + 1.2, f], W * 0.22, W * 0.12, P.steel, D.depth([0, deckY(f), f]) + 0.02, { g: D.group() }); } }
      else if (load === 'container') { const cols = Math.max(4, Math.round((h1 - h0) / 4)); for (let i = 0; i < cols; i++) for (let j = 0; j < 3; j++) { const f0 = lerp(h0, h1, i / cols), f1 = lerp(h0, h1, (i + 1) / cols) - 0.3, hw = halfWidth(st, (f0 + f1) / 2) * 0.9, a0 = -hw + (j * 2 * hw) / 3, a1 = a0 + (2 * hw) / 3 - 0.2, hh = fb * (0.5 + ((i * 7 + j * 3 + Math.floor(x.d[17] * 5)) % 3) * 0.35); const hue = x.C.mode === 'alien' ? x.C.hues[(i + j) % 3] : [0.02, 0.58, 0.12, 0.35, 0.95, 0.5][(i * 3 + j * 5 + Math.floor(x.d[17] * 6)) % 6]; block(x, a0, f0, a1, f1, deckY((f0 + f1) / 2), deckY((f0 + f1) / 2) + hh, { ramp: ramp(hue, 0.5, 0.45), tex: 'corrugated' }, { ramp: ramp(hue, 0.5, 0.5), tex: 'smooth' }); } }
      else if (load === 'rotor') { for (let i = 0; i < 2 + b; i++) modernSail(x, lerp(h0 + 2, h1 - 2, i / Math.max(1, 1 + b)), deckY(0), fb * 2.4, W * 0.08, x.d[18] < 0.5 ? 'rotor' : 'wing'); }
      else if (load === 'pods') { for (let i = 0; i < 3 + b; i++) { const f = lerp(h0 + 3, h1 - 3, i / (2 + b)); pod(x, [0, deckY(f) + fb * 0.45, f], W * 0.7, (h1 - h0) / (3 + b) * 0.85, fb * 0.8, i % 2 ? P.glass : x.body); } }
      else {
        const nh = Math.max(2, Math.round((h1 - h0) / 8));
        for (let i = 0; i < nh; i++) { const f0 = lerp(h0, h1, i / nh) + 0.8, f1 = lerp(h0, h1, (i + 1) / nh) - 0.8, hw = halfWidth(st, (f0 + f1) / 2) * 0.55; block(x, -hw, f0, hw, f1, deckY((f0 + f1) / 2), deckY((f0 + f1) / 2) + 0.9, load === 'bulk' ? { ...x.K.soil, tex: 'soil' } : x.body2, load === 'bulk' ? { ...x.K.soil, tex: 'soil' } : x.body2); if (load === 'general' && i % 2 === 0) derrick(x, f1 + 0.8, deckY(f1), fb * 1.6, (i % 4 === 0 ? 1 : -1) * 1.1 + Math.sin(x.ph) * 0.1); }
        if (load === 'general') for (let i = 0; i < 3; i++) crate(x, W * 0.1 * (i - 1), lerp(h0, h1, 0.5) + i, deckY(0) + 0.9, 1.6, P.wood);
      }
    } else {
      if (load === 'yacht' || b === 0) {
        const top = superstructure(x, st, ds.supers === 'pagoda' ? 'streamline' : ds.supers, -L * 0.25, L * 0.12, 2, fb * 0.6, sm, P.glassDark);
        if (e <= 4) at(x, 2, () => steamPlant(x, ds, -L * 0.08, top - fb * 0.3, 1, fb * 0.8, W * 0.12));
        at(x, 2, () => modernMast(x, L * 0.05, top, fb * 1.2, 'pole'));
      } else {
        const f0 = -L * 0.38, f1 = L * (load === 'ferry' ? 0.3 : 0.22), tiers = load === 'ferry' ? 2 + b : 3 + b;
        const top = superstructure(x, st, ds.supers === 'block' || ds.supers === 'pagoda' ? 'stepped' : ds.supers, f0, f1, tiers, fb * 0.5, sm, P.glassDark);
        if (e <= 5) at(x, 2, () => steamPlant(x, ds, lerp(f0, f1, 0.45), top, e === 3 ? 2 : 1 + (b > 1 ? 1 : 0), fb * 1.2, W * 0.1));
        at(x, 2, () => modernMast(x, f1 - 1, top, fb * 1.1, 'pole'));
        if (e <= 5) lifeboats(x, st, f0 + 2, f1 - 2, deckY(0) + fb, 3 + b);
      }
    }
    if (e >= 3) banner(x, [0, deckY(-L * 0.48) + 0.3, -L * 0.48], 3, 2.4, x.body, x.P.dark);
  });
  const names = role === 'cargo'
    ? { general: e === 3 ? 'Vapor de carga' : 'Cargueiro', tanker: 'Petroleiro', container: 'Porta-contêineres', bulk: 'Graneleiro', rotor: 'Cargueiro de velas-rotor', pods: 'Cargueiro de cápsulas' }[load]
    : { liner: e === 3 ? 'Vapor de passageiros' : 'Transatlântico', ferry: 'Balsa', paddle: 'Vapor de rodas', yacht: e >= 6 ? 'Lancha' : 'Iate' }[load];
  x.label = `${lift > 1 && e >= 7 ? `${names} flutuante` : lift > 0.5 ? `${names} hidrofólio` : names}${ds.form === 'cat' ? ' (catamarã)' : ds.form === 'tri' ? ' (trimarã)' : ''}`;
}

function warPowered(x: VCtx, ds: ShipDesign, role: 'light' | 'medium' | 'heavy') {
  const { e, P, D } = x, b = tier(x);
  const base = role === 'heavy' ? 21 : role === 'medium' ? 17 : 12;
  const carrier = role === 'heavy' && e >= 5 && x.d[15] < 0.45;
  const { st, L, W, fb, lift, deckY } = poweredHull(x, ds, role, base, carrier ? 0.17 : role === 'light' ? 0.17 : 0.14, true);
  const k = x.Z * 0.5, gl = L * (role === 'light' ? 0.07 : 0.1), gr = L * 0.0055;
  const gunKind = (big: boolean): Gun => {
    const len = gl * (big ? 1 : 0.55), r = Math.max(0.25, gr * (big ? 1 : 0.65));
    return e === 3 ? { kind: 'cannon', len: len * 0.8, r, n: big && x.d[16] < 0.5 ? 2 : 1 } : e === 4 ? { kind: 'cannon', len, r, n: big ? (x.d[16] < 0.4 ? 3 : 2) : 1 } : e === 5 ? { kind: 'cannon', len: len * 0.8, r, muzzle: 'plain' } : e === 6 ? (x.d[16] < 0.5 ? { kind: 'rail', len: len * 1.2, r, muzzle: 'fork' } : { kind: 'laser', len: len * 0.8, r: r * 1.2, muzzle: 'bulb' }) : { kind: 'plasma', len: len * 0.8, r: r * 1.4, muzzle: 'bulb', n: big ? 2 : 1 };
  };
  let id = 0;
  const mount = (f: number, big: boolean, aft: boolean, y?: number, a = 0) => turret(x, { id: id++, a, f, y: y ?? deckY(f), R: W * (big ? 0.27 : 0.14), H: W * (big ? 0.16 : 0.1), shape: !big && e <= 4 ? 'open' : ds.tshape, gun: gunKind(big), m: x.body, m2: x.body2, yaw0: aft ? Math.PI : a > 0 ? Math.PI / 2 : a < 0 ? -Math.PI / 2 : 0, arc: a !== 0 ? 1.6 : 2.6, phase: f * 0.3 + a, kit: false });
  up(x, () => {
    if (carrier) {
      // flight deck, island, parked aircraft and one launching
      const y = deckY(0) + fb * 0.35, hw = W * 0.62;
      loft(x, [{ f: L * 0.5, w: hw * 0.6, bw: hw * 0.4, tw: hw * 0.6, wy: 0.5, y0: y - fb * 0.35, y1: y }, { f: L * 0.3, w: hw, bw: hw * 0.7, tw: hw, wy: 0.5, y0: y - fb * 0.35, y1: y }, { f: -L * 0.5, w: hw, bw: hw * 0.7, tw: hw, wy: 0.5, y0: y - fb * 0.35, y1: y }], x.body, { top: { ...P.deckSteel, tex: 'smooth' } });
      D.cap([0, y + 0.05, -L * 0.45], [0, y + 0.05, L * 0.45], 0.2, 0.2, P.paint2, D.depth([0, y, 0]) + 0.03, { noLine: true });
      at(x, 2, () => {
        const ia = hw * 0.72, top = y + fb * 1.6;
        block(x, ia - 1.8 * k, -L * 0.12, ia + 1.2 * k, L * 0.06, y, top, x.body, x.body);
        windowBand(x, [ia - 1.7 * k, top - fb * 0.35, L * 0.06 + 0.05], [ia + 1.1 * k, top - fb * 0.35, L * 0.06 + 0.05], fb * 0.2, 2, P.glassDark, D.depth([ia, top, L * 0.06]) + 0.2);
        offsetA(x, ia, () => modernMast(x, -L * 0.03, top, fb, 'lattice'));
        for (let i = 0; i < 3 + b; i++) deckJet(x, -hw * 0.5 + (i % 2) * hw * 0.35, y, -L * 0.42 + i * 3.4 * k, 0.9 * k);
        if (acting(x)) { const kk = smooth(x.t * 1.3), f = lerp(-L * 0.1, L * 0.62, kk), up2 = Math.max(0, f - L * 0.44) * 0.5; deckJet(x, -hw * 0.1, y + up2, f, 0.95 * k); exhaust(x, [-hw * 0.1, y + up2 + 0.4, f - 3 * k], 'jet', 0.9, [0, 0, -1]); }
        turret(x, { id: id++, a: -hw * 0.85, f: L * 0.4, y, R: 0.9 * k, H: 1 * k, shape: 'dome', gun: { kind: 'rotary', n: 6, len: 2.4 * k, r: 0.14 * k }, m: P.paint2, phase: 1 });
      });
      x.label = e >= 6 ? 'Porta-drones' : 'Porta-aviões';
      return;
    }
    // bridge / superstructure, funnels, masts
    const bf1 = role === 'light' ? L * 0.08 : L * 0.12, bf0 = bf1 - L * (role === 'light' ? 0.22 : 0.3);
    const tiers = role === 'heavy' ? (ds.supers === 'pagoda' ? 4 : 3) : 2;
    const top = superstructure(x, st, ds.supers, bf0, bf1, tiers, fb * 0.45, x.body, P.glassDark);
    if (e <= 5) at(x, 2, () => steamPlant(x, ds, lerp(bf0, bf1, 0.3), deckY(0) + fb * 0.45 * (tiers - 1), role === 'heavy' ? 2 : 1, fb * (role === 'heavy' ? 1.6 : 1.1), W * 0.1));
    at(x, 2, () => modernMast(x, lerp(bf0, bf1, 0.7), top, fb * (role === 'heavy' ? 1.5 : 1.1), ds.mast));
    // main guns fore and aft (superfiring pairs on capital ships), secondaries on the sides, missile cells, CIWS
    if (role === 'heavy') {
      mount(L * 0.34, true, false);
      if (b >= 1 || e <= 4) mount(L * 0.2, true, false, deckY(L * 0.2) + fb * 0.35);
      mount(-L * 0.3, true, true);
      if (b >= 1) mount(-L * 0.42, true, true, deckY(-L * 0.42));
      for (const s of [-1, 1]) mount(lerp(bf0, bf1, 0.4), false, false, deckY(0) + 0.1, s * halfWidth(st, bf0) * 0.8);
    } else if (role === 'medium') {
      mount(L * 0.3, e <= 4, false);
      if (e <= 4) mount(-L * 0.32, true, true); else { launchCells(x, st, L * 0.16, L * 0.22); if (b > 0) launchCells(x, st, -L * 0.28, -L * 0.22); helipad(x, st, -L * 0.42); }
      if (e >= 5) at(x, 2, () => turret(x, { id: id++, a: 0, f: lerp(bf0, bf1, 0.1), y: top, R: 0.8 * k, H: 0.9 * k, shape: 'dome', gun: { kind: e >= 6 ? 'laser' : 'rotary', n: 6, len: 2.2 * k, r: 0.14 * k, muzzle: e >= 6 ? 'bulb' : 'plain' }, m: P.paint2, yaw0: Math.PI, arc: 3, phase: 2 }));
    } else {
      mount(L * 0.28, e >= 5, false);
      if (e === 4) torpedoTubes(x, st, -L * 0.2, deckY(-L * 0.2));
      if (e >= 5) { if (x.d[17] < 0.5) launchCells(x, st, -L * 0.3, -L * 0.22); else turret(x, { id: id++, a: 0, f: -L * 0.3, y: deckY(-L * 0.3), R: 1.2 * k, H: 1 * k, shape: 'box', gun: { kind: 'rockets', n: 4, len: 2.6 * k, r: 0.35 * k }, m: x.body, yaw0: Math.PI, arc: 2.6, phase: 1 }); }
      else if (e === 3) mount(-L * 0.35, false, true);
    }
    banner(x, [0, deckY(-L * 0.48) + 0.2, -L * 0.48], 3, 2.4, x.body2, P.dark);
  });
  const n: Record<string, string[]> = {
    light: ['', '', '', 'Canhoneira', 'Lancha torpedeira', x.d[17] < 0.5 ? 'Corveta de mísseis' : 'Corveta', ds.form === 'tri' ? 'Trimarã furtivo' : 'Corveta furtiva', lift > 1 ? 'Esquife flutuante' : 'Corveta estelar'],
    medium: ['', '', '', 'Encouraçado a vapor', 'Cruzador', 'Destróier', 'Fragata-drone', lift > 1 ? 'Cruzador flutuante' : 'Cruzador gravitacional'],
    heavy: ['', '', '', 'Dreadnought', 'Encouraçado', 'Encouraçado de mísseis', 'Navio-arsenal', 'Fortaleza flutuante'],
  };
  x.label = n[role][e] + (ds.form === 'cat' ? ' (catamarã)' : ds.form === 'tri' && e !== 6 ? ' (trimarã)' : '');
}
function launchCells(x: VCtx, st: Station[], f0: number, f1: number) {
  const D = x.D, hw = halfWidth(st, (f0 + f1) / 2) * 0.5, y = deckAt(st, (f0 + f1) / 2), f = frameOf(x);
  block(x, -hw, f0, hw, f1, y, y + 0.5, x.P.dark, { ...x.P.dark, tex: 'grid' });
  if (!acting(x)) return;
  for (let i = 0; i < 2; i++) {
    const f2 = 4 + i * 2;
    if (f < f2) continue;
    const g = (f - f2) + 0.4, p: V3 = [lerp(-hw, hw, 0.3 + i * 0.4), y + 1 + g * 9, (f0 + f1) / 2 + g * g * 1.5];
    D.cap(p, [p[0], p[1] - 3, p[2] - 0.5], 0.5, 0.45, x.P.steel, 2e4 + D.depth(p));
    D.ell([p[0], p[1] - 3.6, p[2] - 0.6], 0.8, 1.2, x.P.flash, 2e4 + D.depth(p) + 1, { g: D.group(), noLine: true });
    for (let j = 0; j < 4; j++) D.ell([p[0], p[1] - 5 - j * 2.6, p[2] - 0.8 - j * 0.6], 0.9 + j * 0.5, 0.9 + j * 0.45, { ...x.P.smoke, alpha: 0.85 }, 1e5 - j, { g: D.group() });
  }
}
function helipad(x: VCtx, st: Station[], f: number) {
  const D = x.D, y = deckAt(st, f) + 0.05, r = halfWidth(st, f) * 0.7;
  const disc = (rr: number, m: Mat, b: number) => D.poly(circle([0, y + b, f], rr, 'y', 16), m, D.depth([0, y, f]) + 0.01 + b, { g: D.group(), flat: 0.95, noLine: b > 0 });
  disc(r, { ...x.P.deckSteel, ramp: x.P.deckSteel.ramp.map(c => c.map(v => v * 0.8)) as typeof x.P.deckSteel.ramp }, 0);
  disc(r * 0.6, x.P.paint2, 0.02);
  disc(r * 0.45, x.P.deckSteel, 0.03);
}
function torpedoTubes(x: VCtx, st: Station[], f: number, y: number) {
  for (const s of [-1, 1]) fixedGun(x, { kind: 'missile', len: 3 * x.Z * 0.5, r: 0.3 * x.Z * 0.5, m: x.P.dark }, [s * halfWidth(st, f) * 0.5, y + 0.6, f], s * 1.3, 0.2, s);
}
/** a small aircraft on a deck */
function deckJet(x: VCtx, a: number, y: number, f: number, s: number) {
  const D = x.D, key = D.depth([a, y, f]) + 0.3, m = x.P.navy;
  D.cap([a, y + 0.5 * s, f - 2.6 * s], [a, y + 0.5 * s, f + 2.8 * s], 0.6 * s, 0.35 * s, m, key);
  plate(x, [[a, y + 0.45 * s, f + 1.2 * s], [a + 2.3 * s, y + 0.45 * s, f - 1 * s], [a + 2.3 * s, y + 0.45 * s, f - 1.6 * s], [a - 2.3 * s, y + 0.45 * s, f - 1.6 * s], [a - 2.3 * s, y + 0.45 * s, f - 1 * s]], m, key + 0.001);
  plate(x, [[a, y + 0.6 * s, f - 1.6 * s], [a, y + 2 * s, f - 2.7 * s], [a, y + 0.6 * s, f - 2.7 * s]], m, key + 0.002);
  dome(x, [a, y + 0.8 * s, f + 1.4 * s], 0.4 * s, 0.8 * s, 0.35 * s, x.P.glassDark, key + 0.003);
}

// ---------------------------------------------------------------------------------------------------
// Transform: submarines (dive and resurface), a shape-changing submersible, a sea-to-sky hull
// ---------------------------------------------------------------------------------------------------
/** a cigar hull drawn only above the water (points below are pressed onto the surface, a waterline cut) */
function cigar(x: VCtx, W: number, L: number, H: number, yc: number, m: Mat) {
  const D = x.D, pts: V3[] = [];
  let above = false;
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, f = -L / 2 + L * k, rr = Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.05)), 0.45);
    for (let j = 0; j < 14; j++) { const t = (j / 14) * Math.PI * 2, y = yc + Math.sin(t) * (H / 2) * rr; if (y > 0.05) above = true; pts.push([Math.cos(t) * (W / 2) * rr, Math.max(0.02, y), f]); }
  }
  if (above) D.hull(pts, m, D.depth([0, Math.max(0, yc), 0]), { g: D.group(), flat: 0 });
}
function transform(x: VCtx) {
  const { e, P, D } = x, b = tier(x), k = x.Z * 0.5;
  const L = sizeOf(x, 17), W = L * 0.12, H = W * 1.05;
  const u = acting(x) ? (x.t < 0.5 ? smooth((x.t - 0.05) / 0.4) : smooth((0.97 - x.t) / 0.4)) : 0;
  if (e === 7) { // leaves the sea: rises, wings unfold, thrusters light
    const y = u * 14 * k + 0.4;
    if (u < 0.3) wake(x, W * 1.4, L); else groundShadow(x, W * 3, L, y);
    for (let i = 0; i < 5; i++) { const q = frac(x.t * 2 + i / 5); if (u > 0.05 && u < 0.7) D.ell([Math.cos(i * 2) * W, q * y * 0.8, Math.sin(i * 2) * L * 0.3], 1 + q * 2, 0.7 + q, P.foam, 1e4 + i, { g: D.group(), noLine: true }); }
    for (const s of [-1, 1]) plate(x, [[s * W * 0.4, y + H * 0.5, L * 0.1], [s * (W * 0.4 + (1.5 + u * 9) * k), y + H * 0.5 + u * 1.5, -L * 0.15], [s * (W * 0.4 + (1.5 + u * 9) * k), y + H * 0.5 + u * 1.5, -L * 0.3], [s * W * 0.4, y + H * 0.5, -L * 0.28]], x.body2);
    cigar(x, W * 1.5, L, H * 1.2, y + H * 0.5, x.body);
    up(x, () => { dome(x, [0, y + H * 0.9, L * 0.2], W * 0.4, L * 0.1, H * 0.45, P.glass); for (const s of [-1, 1]) exhaust(x, [s * W * 0.3, y + H * 0.5, -L * 0.5], u > 0.2 ? 'jet' : 'glow', 1.2 * k); });
    x.label = 'Nave anfíbia';
    return;
  }
  const depth = u * (H + 5 * k), yc = H * 0.38 - depth;
  if (depth < H * 0.6) wake(x, W * 1.3, L);
  if (depth > 0.5) {
    D.poly(circle([0, 0.05, 0], L * 0.5, 'y', 16, 0, W * 0.55), { ...P.water, ramp: P.water.ramp.map(c => c.map(v => v * 0.55)) as typeof P.water.ramp, alpha: 0.6 - u * 0.3, line: null }, -945, { g: D.group(), flat: 0.9 });
    for (let i = 0; i < 5; i++) { const q = frac(x.t * 2 + i / 5); D.ell([Math.sin(i * 2.3) * W * 0.8, 0.2, Math.cos(i * 2.3) * L * 0.35], 0.8 + q * 1.8, 0.4 + q * 0.6, P.foam, -930, { g: D.group(), noLine: true }); }
  }
  cigar(x, W, L, H, yc, x.body);
  const fold = e === 6 ? u : 0;
  const tf = L * 0.14, th = (3.6 - fold * 2.5) * k, ty0 = yc + H * 0.35, t0 = Math.max(0.02, ty0), t1 = ty0 + th;
  up(x, () => {
    if (t1 > 0.1) {
      const tw = W * 0.3, tl = 2.6 * k;
      loft(x, [{ f: tf + tl, w: tw * 0.5, bw: tw * 0.5, tw: tw * 0.4, wy: 0.5, y0: t0, y1: t1 }, { f: tf, w: tw, bw: tw, tw: tw * 0.8, wy: 0.5, y0: t0, y1: t1 }, { f: tf - tl, w: tw * 0.6, bw: tw * 0.6, tw: tw * 0.4, wy: 0.5, y0: t0, y1: t1 - th * 0.15 }], x.body2, { round: 1 });
      if (e >= 4) rod(x, [0, t1, tf], [0, t1 + 2 * k + u * 1.5, tf], 0.25, P.dark);
      if (t1 - t0 > 1) for (const s of [-1, 1]) D.cap([s * tw, Math.max(0.05, t0 + th * 0.55), tf], [s * (tw + (1.3 + fold * 2.5) * k), Math.max(0.05, t0 + th * 0.55), tf], 0.45, 0.25, x.body2, D.depth([s * tw, t0, tf]) + 0.01);
      if (e >= 6) light(x, [0, t1 + 0.3, tf + tl * 0.8], 0.45, P.glow, undefined, true);
    }
    if (e === 4 && yc + H * 0.5 > 0) fixedGun(x, { kind: 'cannon', len: 3.6 * k, r: 0.35 * k }, [0, yc + H * 0.5 + 0.8, L * 0.3], 0, 0.3);
  });
  if (acting(x) && x.t > 0.3 && x.t < 0.75) { const q = (x.t - 0.3) / 0.45; for (let i = 0; i < 5; i++) D.ell([W * 0.2, 0.12, L * 0.5 + q * 30 * k - i * 2.2], 0.7 + i * 0.2, 0.3, P.foam, -920, { g: D.group(), noLine: true }); }
  if (depth < H && moving(x)) propeller(x, [0, Math.max(0.3, yc), -L * 0.5], 1 * k, 'f');
  x.label = e === 3 ? 'Submarino' : e === 4 ? 'Submarino de ataque' : e === 5 ? (b === 2 ? 'Submarino nuclear lança-mísseis' : 'Submarino nuclear') : 'Submersível transformável';
}

// ---------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------
function role(r: 'cargo' | 'passenger' | 'light' | 'medium' | 'heavy') {
  return (x: VCtx) => {
    setNoDust(true);
    const ds = design(x, r);
    try { if (x.e <= 2) sailingShip(x, ds, r); else if (r === 'cargo' || r === 'passenger') civilPowered(x, ds, r); else warPowered(x, ds, r); }
    finally { setNoDust(false); }
  };
}
export const NAVAL = {
  cargo: role('cargo'), passenger: role('passenger'), light: role('light'), medium: role('medium'), heavy: role('heavy'),
  transform: (x: VCtx) => { setNoDust(true); try { transform(x); } finally { setNoDust(false); } },
};
