// Land vehicles, built from modules rather than fixed types: a chassis (slab, wedge, pod, hex, tub, beetle,
// articulated), running gear (drag poles, rollers, sledge runners, wheels of every era, tracks, half-tracks,
// mechanical legs, hover, ball wheels, screw drives), a cab, a load or a fighting compartment, armour add-ons,
// weapon mounts and paint. The design numbers pick one option per slot (weighted by the culture: exotic worlds walk
// and roll on spheres earlier, cold ones ride runners and screws, wet ones hover); the era decides the technology,
// so the same design reads as the same family from the first cart to the space age.
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { crate, barrel, sack } from '../structure/parts';
import {
  VCtx, Station, loft, block, pod, dome, wheelRow, tracks, legs, hover, runners, screws, exhaust, light, rod, emblem, windowBand,
  banner, at, up, pick, moving, acting, bob, frac, lerp, smooth, groundShadow, transformed, pitchFrame, offsetA, WheelStyle, LegStyle, HoverStyle, circle,
} from './vparts';
import { turret, Mount, TurretShape, Gun, fixedGun } from './weapons';

export type Gear = 'drag' | 'runners' | 'wheels' | 'tracks' | 'halftrack' | 'legs' | 'hover' | 'balls' | 'screw';
export type Chassis = 'slab' | 'wedge' | 'pod' | 'hex' | 'tub' | 'beetle';
const tier = (x: VCtx) => (x.size === 'large' ? 2 : x.size === 'medium' ? 1 : 0);
const climate = (x: VCtx) => { const p = x.C.params; return { cold: p.temperature < 0.33, wet: p.water > 0.66, dry: p.water < 0.33, ex: p.exotic }; };

// ---------------------------------------------------------------------------------------------------
// Module choices
// ---------------------------------------------------------------------------------------------------
/** running gear for this design in this era (the design's lean is kept: a walker culture walks as soon as it can) */
export function gearFor(x: VCtx, role: 'cargo' | 'car' | 'light' | 'tank' | 'heavy'): Gear {
  const e = x.e, { cold, wet, dry, ex } = climate(x), u = x.d[0], armour = role === 'tank' || role === 'heavy';
  if (e === 0) return cold ? 'runners' : 'drag';
  if (e <= 2) return pick(u, [['wheels', 6], ['runners', cold ? 5 : 0]]);
  if (e === 3) return pick(u, [['wheels', armour ? 2 : 6], ['tracks', armour ? 6 : 1], ['screw', (cold || wet) && ex > 0.4 ? 1.5 : 0], ['runners', cold && !armour ? 1.5 : 0]]);
  if (e === 4) return pick(u, [['wheels', armour ? 1 : 6], ['tracks', armour ? 7 : 1], ['halftrack', role === 'light' || role === 'cargo' ? 2 : 1], ['screw', (cold || wet) && ex > 0.5 ? 1 : 0]]);
  if (e === 5) return pick(u, [['wheels', armour ? 1.5 : 6], ['tracks', armour ? 6 : 1], ['legs', ex * 3], ['screw', cold || wet ? ex : 0], ['halftrack', 0.5]]);
  if (e === 6) return pick(u, [['wheels', role === 'car' ? 3 : 1.5], ['tracks', armour ? 2 : 0.5], ['legs', 1 + ex * 3], ['hover', wet ? 4 : 2.5], ['balls', dry ? 2.5 : 1.2]]);
  return pick(u, [['hover', 4], ['legs', 1.5 + ex * 3], ['balls', 1.5]]);
}
export function chassisFor(x: VCtx): Chassis {
  const plan = x.C.plan, ex = x.C.params.exotic, u = x.d[1];
  return pick(u, [
    ['slab', plan === 'box' ? 4 : 1], ['wedge', plan === 'box' || plan === 'oct' ? 2.5 : 1], ['pod', plan === 'round' ? 4 : 1],
    ['tub', plan === 'round' ? 2 : 0.6], ['hex', plan === 'hex' || plan === 'oct' ? 5 : 0.4], ['beetle', plan === 'pod' ? 4 : 0.4 + ex * 2],
  ]);
}
export function wheelStyleFor(x: VCtx): WheelStyle {
  const e = x.e, ex = x.C.params.exotic, u = x.d[2];
  if (e <= 2) return ex > 0.65 && u < 0.4 ? 'bone' : e === 1 && u < 0.45 ? 'disk' : 'spoke';
  if (e === 3) return u < 0.55 ? 'iron' : 'spoke';
  if (e === 4) return 'tyre';
  if (e === 5) return u < 0.5 ? 'lug' : 'tyre';
  return u < 0.55 ? 'hubless' : 'lug';
}
const legStyleFor = (x: VCtx): LegStyle => pick(x.d[3], [['mammal', 3], ['bird', 2], ['insect', 1 + x.C.params.exotic * 4], ['strider', 1]]);
const hoverFor = (x: VCtx): HoverStyle => (x.e >= 7 ? pick(x.d[4], [['antigrav', 3], ['ring', 2]]) : pick(x.d[4], [['pads', 3], ['skirt', 2 + (climate(x).wet ? 3 : 0)], ['ring', 1]]));
function turretShapeFor(x: VCtx): TurretShape {
  const e = x.e, plan = x.C.plan, ex = x.C.params.exotic, u = x.d[5];
  if (e === 3) return pick(u, [['casemate', 2], ['box', 2], ['round', plan === 'round' ? 3 : 1], ['hex', plan === 'hex' ? 3 : 0.3]]);
  if (e === 4) return pick(u, [['box', 2], ['round', plan === 'round' || plan === 'pod' ? 3 : 1.5], ['cast', 2], ['hex', plan === 'hex' || plan === 'oct' ? 3 : 0.3]]);
  if (e === 5) return pick(u, [['wedge', 3], ['cast', 2], ['box', 1.5], ['hex', plan === 'hex' ? 2 : 0.3], ['bulb', ex > 0.7 ? 1 : 0]]);
  if (e === 6) return pick(u, [['wedge', 2], ['dome', plan === 'round' || plan === 'pod' ? 3 : 1], ['hex', plan === 'hex' || plan === 'oct' ? 3 : 0.5], ['bulb', ex * 2]]);
  return pick(u, [['dome', 2], ['saucer', 2], ['bulb', ex * 3], ['hex', plan === 'hex' ? 2 : 0.4]]);
}
/** the main gun of a war vehicle of this weight class */
function mainGun(x: VCtx, cls: 'light' | 'medium' | 'heavy'): Gun {
  const e = x.e, u = x.d[6], k = cls === 'heavy' ? 1.3 : cls === 'medium' ? 1 : 0.6;
  if (cls === 'light') {
    if (e <= 4) return pick(u, [[{ kind: 'mg', n: u < 0.2 ? 2 : 1, len: 4.5, r: 0.28, muzzle: e === 3 ? 'cooling' : 'flash' }, 4], [{ kind: 'cannon', len: 6, r: 0.4 }, 2], [{ kind: 'flame', len: 3.5, r: 0.45, muzzle: 'bell' }, e === 4 ? 1.2 : 0]] as [Gun, number][]);
    if (e === 5) return pick(u, [[{ kind: 'auto', len: 7, r: 0.4, muzzle: 'flash' }, 3], [{ kind: 'rotary', n: 6, len: 4.5, r: 0.22 }, 1.5], [{ kind: 'rockets', n: 4, len: 3.5, r: 0.45 }, 1.5], [{ kind: 'missile', len: 4, r: 0.55 }, 1]] as [Gun, number][]);
    if (e === 6) return pick(u, [[{ kind: 'laser', len: 5, r: 0.35, muzzle: 'bulb' }, 3], [{ kind: 'rail', len: 7, r: 0.35, muzzle: 'fork' }, 2], [{ kind: 'rotary', n: 6, len: 4.5, r: 0.22 }, 1]] as [Gun, number][]);
    return { kind: 'plasma', len: 4.5, r: 0.45, muzzle: 'bulb' };
  }
  if (e === 3) return { kind: 'cannon', len: 5.5 * k, r: 0.5 * k, muzzle: 'plain' };
  if (e === 4) return { kind: 'cannon', len: 10 * k, r: 0.5 * k, n: cls === 'heavy' && u < 0.35 ? 2 : 1, muzzle: u < 0.5 ? 'brake' : 'plain' };
  if (e === 5) return u < 0.12 ? { kind: 'missile', len: 5, r: 0.8 } : { kind: 'cannon', len: 14 * k, r: 0.55 * k, n: cls === 'heavy' && u < 0.35 ? 2 : 1, muzzle: u < 0.5 ? 'plain' : 'brake' };
  if (e === 6) return pick(u, [[{ kind: 'rail', len: 15 * k, r: 0.5 * k, muzzle: 'fork' }, 3], [{ kind: 'laser', len: 10 * k, r: 0.6 * k, muzzle: 'bulb' }, 2], [{ kind: 'cannon', len: 14 * k, r: 0.6 * k, muzzle: 'brake' }, 1.5]] as [Gun, number][]);
  return { kind: 'plasma', len: 11 * k, r: 0.7 * k, n: cls === 'heavy' && u < 0.5 ? 2 : 1, muzzle: 'bulb' };
}

// ---------------------------------------------------------------------------------------------------
// Chassis bodies
// ---------------------------------------------------------------------------------------------------
/** stations for a chassis of half-width w, length L, from y0 up H (front at +L/2) */
function chassisStations(c: Chassis, w: number, L: number, y0: number, H: number, glacis = 0.35): Station[] {
  const y1 = y0 + H;
  switch (c) {
    case 'wedge': return [
      { f: L / 2, fb: L / 2 - L * 0.05, w: w * 0.55, bw: w * 0.5, tw: w * 0.4, wy: 0.2, y0, y1: y0 + H * 0.3 },
      { f: L * 0.12, w, bw: w * 0.9, tw: w * 0.75, wy: 0.3, y0, y1 },
      { f: -L * 0.42, w, bw: w * 0.9, tw: w * 0.8, wy: 0.3, y0, y1 },
      { f: -L / 2, fb: -L / 2 + L * 0.04, w: w * 0.92, bw: w * 0.85, tw: w * 0.75, wy: 0.3, y0: y0 + H * 0.1, y1: y1 - H * 0.2 },
    ];
    case 'pod': case 'beetle': {
      const hi = c === 'beetle' ? 1.25 : 1;
      return [0.5, 0.42, 0.25, 0, -0.25, -0.42, -0.5].map(k => {
        const t = 1 - Math.pow(Math.abs(k) / 0.5, c === 'beetle' ? 2.2 : 3.2);
        const ww = w * Math.max(0.3, Math.sqrt(Math.max(0, t))), hh = H * hi * Math.max(0.35, Math.sqrt(Math.max(0, t)));
        return { f: L * k, w: ww, bw: ww * 0.8, tw: ww * (c === 'beetle' ? 0.5 : 0.7), wy: c === 'beetle' ? 0.25 : 0.4, y0: y0 + (H - hh) * 0.15, y1: y0 + hh };
      });
    }
    case 'hex': return [
      { f: L / 2, w: w * 0.55, bw: w * 0.35, tw: w * 0.35, wy: 0.5, y0: y0 + H * 0.15, y1: y1 - H * 0.2 },
      { f: L * 0.3, w, bw: w * 0.6, tw: w * 0.6, wy: 0.5, y0, y1 },
      { f: -L * 0.3, w, bw: w * 0.6, tw: w * 0.6, wy: 0.5, y0, y1 },
      { f: -L / 2, w: w * 0.6, bw: w * 0.4, tw: w * 0.4, wy: 0.5, y0: y0 + H * 0.15, y1: y1 - H * 0.2 },
    ];
    case 'tub': return [
      { f: L / 2, fb: L / 2 - L * 0.1, w: w * 0.8, bw: w * 0.55, tw: w * 0.8, wy: 0.9, y0: y0 + H * 0.15, y1: y1 + H * 0.1 },
      { f: L * 0.25, w, bw: w * 0.7, tw: w, wy: 0.9, y0, y1 },
      { f: -L * 0.35, w, bw: w * 0.7, tw: w, wy: 0.9, y0, y1 },
      { f: -L / 2, fb: -L / 2 + L * 0.06, w: w * 0.9, bw: w * 0.6, tw: w * 0.9, wy: 0.9, y0: y0 + H * 0.1, y1 },
    ];
    default: return [ // slab: a sloped glacis at the front, a short slope at the back
      { f: L / 2, fb: L / 2 + 0.1, w, bw: w, tw: w * 0.92, wy: 0.1, y0, y1: y0 + H * 0.4 },
      { f: L / 2 - L * glacis * 0.5, w, bw: w, tw: w * 0.92, wy: 0.1, y0, y1 },
      { f: -L / 2 + L * 0.06, w, bw: w, tw: w * 0.92, wy: 0.1, y0, y1 },
      { f: -L / 2, w, bw: w, tw: w * 0.9, wy: 0.1, y0, y1: y1 - H * 0.2 },
    ];
  }
}
const isRound = (c: Chassis) => c === 'pod' || c === 'beetle';
/** height of the chassis roof at f (to sit things on it) */
function roofAt(st: Station[], f: number) {
  for (let i = 0; i + 1 < st.length; i++) { const a = st[i], b = st[i + 1]; if ((f <= a.f && f >= b.f) || (f >= a.f && f <= b.f)) { const t = (f - a.f) / (b.f - a.f || 1); return lerp(a.y1, b.y1, t); } }
  return st[Math.floor(st.length / 2)].y1;
}

// ---------------------------------------------------------------------------------------------------
// Running gear
// ---------------------------------------------------------------------------------------------------
interface Run { y0: number; W: number; label: string }
/** draws the running gear under a body of half-width w and length L; returns where the body starts */
function runGear(x: VCtx, g: Gear, w: number, L: number, heavy: number, wheelsN?: number): Run {
  const P = x.P, Z = x.Z, e = x.e;
  switch (g) {
    case 'wheels': {
      const n = wheelsN ?? Math.max(2, Math.min(5, Math.round(L / (7 * Z * (1 + heavy * 0.2)))));
      const r = (e <= 3 ? 2.6 : 2) * Z * (1 + heavy * 0.25), ww = r * (e <= 2 ? 0.3 : 0.55);
      const fs = n === 1 ? [0] : Array.from({ length: n }, (_, i) => L * 0.36 - (L * 0.72 * i) / (n - 1));
      wheelRow(x, w * 2 - ww * 0.4, fs, r, ww, wheelStyleFor(x), x.e >= 4 && x.d[7] < 0.3 ? x.body2 : undefined);
      return { y0: r * (e <= 2 ? 1.05 : 0.7), W: w * 2 + ww, label: n > 3 ? ` ${n * 2}×${n * 2}` : '' };
    }
    case 'tracks': {
      const R = (1.7 + heavy * 0.5) * Z, tw = R * 1.1;
      tracks(x, w * 2 - tw * 1.2, L * 0.96, R, tw, { skirt: e >= 5 && x.d[8] < 0.6 ? x.body2 : null, style: e >= 6 ? 'rubber' : 'steel', lift: e === 3 ? 0.9 : 0.35 });
      return { y0: R * 0.5, W: w * 2 + tw * 0.2, label: '' };
    }
    case 'halftrack': {
      const R = 1.5 * Z, tw = R;
      at(x, 0, () => transformed(x, p => [p[0], p[1], p[2] - L * 0.2], n => n, () => tracks(x, w * 2 - tw * 1.2, L * 0.55, R, tw, { lift: 0.2 })));
      wheelRow(x, w * 2 - 0.6, [L * 0.33], 2 * Z, 1.1 * Z, e >= 5 ? 'lug' : 'tyre');
      return { y0: R * 0.8, W: w * 2 + tw * 0.2, label: '' };
    }
    case 'legs': {
      const n = pick(x.d[9], [[1, 1], [2, 3], [3, 1.5 + x.C.params.exotic * 2]] as [number, number][]), hip = (6 + heavy * 3) * Z, style = legStyleFor(x);
      const fs = n === 1 ? [0] : n === 2 ? [L * 0.3, -L * 0.3] : [L * 0.34, 0, -L * 0.34];
      legs(x, w * 1.6, fs, hip, hip, (0.8 + heavy * 0.3) * Z, x.P.steel, style, style === 'insect' ? 'claw' : pick(x.d[10], [['pad', 2], ['hoof', 1], ['claw', 1]]));
      return { y0: hip - 1.2 * Z + (moving(x) ? Math.abs(Math.sin(x.ph)) * 0.6 : bob(x, 0.25)), W: w * 2, label: n === 3 ? 'hexápode' : n === 2 ? 'quadrúpede' : 'bípede' };
    }
    case 'hover': {
      const y = (1.8 + heavy * 0.6) * Z + bob(x, 0.45), st = hoverFor(x);
      hover(x, w * 2, L, y, st);
      if (st === 'antigrav' || st === 'ring') groundShadow(x, w * 2, L, y);
      return { y0: y, W: w * 2, label: '' };
    }
    case 'balls': {
      const r = (2.2 + heavy * 0.6) * Z, fs = [L * 0.32, -L * 0.32];
      wheelRow(x, w * 2 - r * 0.8, fs, r, r * 2, 'ball', x.e >= 7 ? P.chrome : P.steel);
      return { y0: r * 1.1, W: w * 2 + r, label: '' };
    }
    case 'screw': {
      const R = (1.4 + heavy * 0.4) * Z;
      screws(x, w * 1.2, L * 0.95, R, P.steel);
      return { y0: R * 1.3, W: w * 2 + R * 2, label: '' };
    }
    case 'runners': runners(x, w * 1.8, L * 0.95, e <= 2 ? P.wood : P.steel); return { y0: 2.2, W: w * 2, label: '' };
    default: return { y0: 1, W: w * 2, label: '' };
  }
}
const gearName = (g: Gear, def: string) => ({ drag: def, runners: 'de esquis', wheels: def, tracks: 'de esteiras', halftrack: 'meia-lagarta', legs: 'andador', hover: 'flutuante', balls: 'de esferas', screw: 'de parafusos' })[g];

// ---------------------------------------------------------------------------------------------------
// Fittings
// ---------------------------------------------------------------------------------------------------
function headlights(x: VCtx, w: number, f: number, y: number) {
  if (x.e < 3) return;
  const m = x.e >= 6 ? x.P.glow : { ...x.K.glow, emit: true };
  for (const s of [-1, 1]) light(x, [s * w * 0.7, y, f + 0.1], x.e >= 6 ? 0.45 : 0.6, m);
}
function stacks(x: VCtx, a: number, f: number, y: number, h: number, kind: 'steam' | 'diesel') {
  const D = x.D;
  up(x, () => { D.cap([a, y, f], [a, y + h, f], 0.55 * x.Z, 0.5 * x.Z, x.P.dark, D.depth([a, y + h / 2, f])); exhaust(x, [a, y + h + 0.5, f], kind, 1.1 * x.Z); });
}
/** spikes, horns, fins or plates along a body (exotic and ancient decoration) */
function addons(x: VCtx, st: Station[], kind: number, m: Mat) {
  const D = x.D, mid = st[Math.floor(st.length / 2)], top = mid.y1, w = mid.w;
  up(x, () => {
    if (kind === 0) for (let i = 0; i < 4; i++) { const f = lerp(st[0].f, st[st.length - 1].f, (i + 0.5) / 4); D.cap([0, roofAt(st, f), f], [0, roofAt(st, f) + 1.6 * x.Z, f - 0.8 * x.Z], 0.5 * x.Z, 0.05, x.P.bone, D.depth([0, top, f])); }
    else if (kind === 1) for (const s of [-1, 1]) D.cap([s * w * 0.6, st[0].y1, st[0].f], [s * w * 1.1, st[0].y1 + 2.2 * x.Z, st[0].f + 1.6 * x.Z], 0.6 * x.Z, 0.05, x.P.bone, D.depth([s * w, top, st[0].f]));
    else if (kind === 2) { const f = st[st.length - 1].f; D.poly([[0, top, f + 3 * x.Z], [0, top + 3 * x.Z, f + 0.5], [0, top, f + 0.2]], m, D.depth([0, top + 1, f]) + 0.1, { g: D.group(), flat: 0.9, dark: D.light([1, 0, 0]) }); }
  });
}

// ---------------------------------------------------------------------------------------------------
// Civil: cargo
// ---------------------------------------------------------------------------------------------------
function cargo(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 0) { // travois (warm) or drag sledge (cold): poles and a sling of hide, loaded with bundles
    const L = 15 * Z, cold = climate(x).cold;
    if (cold) runners(x, 6 * Z, L, P.wood);
    for (const s of [-1, 1]) D.cap([s * 1.6 * Z, cold ? 3 : 5.5, L * 0.5], [s * 3.2 * Z, cold ? 2.2 : 0.4, -L * 0.45], 0.5, 0.45, P.wood, D.depth([s * 3, 3, 0]));
    const deck: V3[] = [[-3 * Z, cold ? 2.4 : 1.4, -L * 0.35], [3 * Z, cold ? 2.4 : 1.4, -L * 0.35], [2.4 * Z, cold ? 2.8 : 4, L * 0.1], [-2.4 * Z, cold ? 2.8 : 4, L * 0.1]];
    D.poly(deck, P.hide, D.depth([0, 2.5, -L * 0.1]), { g: D.group(), flat: 0.8, dark: D.light([0, 1, 0.3]) });
    up(x, () => { for (let i = 0; i < 2 + b * 2; i++) sack(x, -1.4 * Z + (i % 2) * 2.8 * Z, -L * 0.25 + Math.floor(i / 2) * 2.6, cold ? 2.8 : 2.4, 2.4, i % 3 ? x.K.cloth2 : P.hide); rod(x, [-2.6 * Z, 3, -L * 0.3], [2.6 * Z, 3.4, 0], 0.18, P.rope); });
    x.hitch = [0, 0, L * 0.5 + 2];
    x.label = cold ? 'Trenó de arrasto' : 'Travois';
    return;
  }
  if (e <= 2) return oldCart(x);
  truck(x);
}
/** carts and wagons of the ancient eras (beasts are harnessed at the hitch in gameplay) */
function oldCart(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), g = gearFor(x, 'cargo');
  const body = pick(x.d[11], [['box', 3], ['hoops', 2], ['basket', 1.5], ['barrel', 1], ['cage', 1]] as [string, number][]);
  const W = 7 * Z, L = (11 + b * 2) * Z, n = b === 0 ? 1 : 2;
  const run = g === 'runners' ? runGear(x, 'runners', W / 2, L, 0) : runGear(x, 'wheels', W / 2, L, 0, n);
  const y0 = run.y0 + 0.3, sideH = body === 'basket' ? 3 : 2.4;
  // floor, sides and a painted rail
  block(x, -W / 2, -L / 2, W / 2, L / 2, y0, y0 + 0.8, P.plank, P.plank);
  const wall = body === 'basket' ? P.wicker : P.plank;
  at(x, 0, () => {
    for (const s of [-1, 1]) block(x, s > 0 ? W / 2 - 0.45 : -W / 2, -L / 2, s > 0 ? W / 2 : -W / 2 + 0.45, L / 2, y0 + 0.8, y0 + 0.8 + sideH, wall, P.wood);
    block(x, -W / 2, -L / 2, W / 2, -L / 2 + 0.45, y0 + 0.8, y0 + 0.8 + sideH, wall, P.wood);
    block(x, -W / 2, L / 2 - 0.45, W / 2, L / 2, y0 + 0.8, y0 + 0.8 + sideH * 0.7, wall, P.wood);
    if (x.C.params.wealth > 0.5 && body !== 'basket') for (const s of [-1, 1]) D.cap([s * (W / 2 + 0.05), y0 + sideH * 0.8, -L / 2], [s * (W / 2 + 0.05), y0 + sideH * 0.8, L / 2], 0.25, 0.25, x.body, D.depth([s * W / 2, y0 + 2, 0]) + 0.01, { noLine: true });
  });
  const top = y0 + 0.8 + sideH;
  up(x, () => up(x, () => {
    if (body === 'hoops' || (body === 'box' && b === 2)) { // canvas cover on hoops
      const st: Station[] = [L / 2 - 0.5, L / 4, 0, -L / 4, -L / 2 + 0.3].map(f => ({ f, w: W / 2 + 0.2, bw: W / 2, tw: 0.4, wy: 0.05, y0: top - 0.4, y1: top + W * 0.55 }));
      loft(x, st, P.canvas, { round: 1, open: true, ends: { ...P.canvas, ramp: P.canvas.ramp.map(c => c.map(v => v * 0.8)) as typeof P.canvas.ramp } });
    } else if (body === 'barrel') { const r = W * 0.42; D.cap([0, y0 + 0.8 + r, L / 2 - r * 0.7], [0, y0 + 0.8 + r, -L / 2 + r * 0.7], r, r, { ...P.wood, tex: 'plank' }, D.depth([0, top, 0])); for (const k of [-0.3, 0, 0.3]) D.ell([0, y0 + 0.8 + r, L * k], 0.3, r * 1.02, P.dark, D.depth([0, top, L * k]) + 0.01, { g: D.group(), noLine: true }); }
    else if (body === 'cage') { for (let i = 0; i <= 5; i++) { const f = -L / 2 + (L * i) / 5; for (const s of [-1, 1]) rod(x, [s * W / 2, top, f], [s * W / 2, top + 4 * Z, f], 0.22, P.wood); } for (const s of [-1, 1]) D.cap([s * W / 2, top + 4 * Z, -L / 2], [s * W / 2, top + 4 * Z, L / 2], 0.3, 0.3, P.wood, D.depth([s * W / 2, top, 0])); }
    else for (let i = 0; i < 2 + b * 2; i++) (i % 3 === 0 ? barrel : i % 3 === 1 ? crate : sack)(x, -W / 4 + (i % 2) * W / 2, -L / 2 + 2.2 + Math.floor(i / 2) * 3.2, y0 + 0.8, 2.2, i % 3 === 2 ? x.K.cloth2 : P.wood);
  }));
  // shafts for the beasts, a lantern, the owner's colours
  const shaftY = y0 + 0.2, hf = L / 2 + 9 * Z;
  for (const s of n === 1 ? [-1, 1] : [0]) D.cap([s * 2.2 * Z, shaftY, L / 2 - 0.5], [s * 2.4 * Z, shaftY - 0.4, hf], 0.4, 0.35, P.wood, D.depth([s, shaftY, L / 2 + 3]));
  x.hitch = [0, 0, hf];
  if (e === 2 && x.d[12] < 0.5) up(x, () => { rod(x, [W / 2, top, L / 2 - 1], [W / 2 + 0.6, top + 2, L / 2 - 1], 0.14, P.dark); light(x, [W / 2 + 0.6, top + 1.4, L / 2 - 1], 0.55, x.K.fire); });
  x.label = body === 'hoops' ? 'Carroção coberto' : body === 'basket' ? 'Carroça de vime' : body === 'barrel' ? 'Carroça-pipa' : body === 'cage' ? 'Carroça-jaula' : g === 'runners' ? 'Trenó de carga' : b === 0 ? 'Carroça' : 'Carroção';
  if (g === 'runners' && body !== 'hoops') x.label = 'Trenó de carga';
}
/** motor transport: a chassis with a cab and a load (van, tanker, hopper, logs, containers, cages, pods) */
function truck(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), g = gearFor(x, 'cargo'), ch = chassisFor(x);
  const load = pick(x.d[11], [['flat', 2], ['box', 3], ['tank', 2], ['hopper', 1.5], ['logs', e <= 4 ? 1.5 : 0.3], ['container', e >= 5 ? 2 : 0], ['pods', e >= 6 ? 3 : 0], ['cage', 0.8]] as [string, number][]);
  const w = (3.6 + b * 0.4) * Z, L = (13 + b * 5) * Z, artic = b === 2 && g !== 'legs' && x.d[13] < 0.65;
  const run = runGear(x, g, w, L, b * 0.3, g === 'wheels' ? (b === 2 ? 3 : 2) : undefined);
  const y0 = run.y0, cabL = Math.min(6 * Z, L * 0.34), cf = L / 2 - cabL / 2, ch0 = isRound(ch) || e >= 6;
  // frame rails
  block(x, -w * 0.7, -L / 2, w * 0.7, L / 2, y0 - 0.3, y0 + 0.9, P.dark, P.dark);
  // cab
  const cabH = (e === 3 ? 6 : 5.5) * Z * 0.85;
  at(x, 0, () => {
    if (ch0) { pod(x, [0, y0 + cabH / 2 + 0.6, cf], w * 2, cabL * 1.15, cabH * 1.15, x.body); dome(x, [0, y0 + cabH * 0.55, cf + cabL * 0.1], w * 0.8, cabL * 0.42, cabH * 0.55, P.glass); }
    else {
      const st: Station[] = [
        { f: L / 2, w, bw: w, tw: w * 0.9, wy: 0.2, y0: y0 + 0.9, y1: y0 + cabH * 0.5 },
        { f: L / 2 - cabL * 0.25, w, bw: w, tw: w * 0.85, wy: 0.2, y0: y0 + 0.9, y1: y0 + cabH * (e === 3 ? 0.55 : 0.52) },
        { f: L / 2 - cabL * 0.42, fb: L / 2 - cabL * 0.34, w, bw: w, tw: w * 0.85, wy: 0.2, y0: y0 + 0.9, y1: y0 + cabH },
        { f: L / 2 - cabL, w, bw: w, tw: w * 0.85, wy: 0.2, y0: y0 + 0.9, y1: y0 + cabH },
      ];
      loft(x, st, x.body, { top: x.body2 });
      windowBand(x, [-w * 0.8, y0 + cabH * 0.62, L / 2 - cabL * 0.38], [w * 0.8, y0 + cabH * 0.62, L / 2 - cabL * 0.38], cabH * 0.3, 1, P.glass, D.depth([0, y0 + cabH, L / 2 - cabL * 0.38]) + 0.2);
      for (const s of [-1, 1]) windowBand(x, [s * w * 1.01, y0 + cabH * 0.6, L / 2 - cabL * 0.95], [s * w * 1.01, y0 + cabH * 0.6, L / 2 - cabL * 0.45], cabH * 0.28, 1, P.glass, D.depth([s * w, y0 + cabH, cf]) + 0.2);
      // bonnet grille
      D.poly([[-w * 0.6, y0 + 1.3, L / 2 + 0.12], [w * 0.6, y0 + 1.3, L / 2 + 0.12], [w * 0.6, y0 + cabH * 0.42, L / 2 + 0.12], [-w * 0.6, y0 + cabH * 0.42, L / 2 + 0.12]], { ...P.chrome, tex: 'grid' }, D.depth([0, y0 + 2, L / 2]) + 0.15, { g: D.group(), flat: 0.9, dark: D.light([0, 0, 1]) });
    }
    headlights(x, w, L / 2, y0 + 1.8 * Z);
  });
  // the load: on the chassis or on a trailer behind an articulated cab
  const lf1 = L / 2 - cabL - 0.6, lf0 = -L / 2, lh = (5 + b) * Z, ly = y0 + 0.9;
  if (artic) D.cap([0, ly, lf1 + 0.3], [0, ly, lf1 - 1.4], 0.9, 0.9, P.dark, D.depth([0, ly, lf1]));
  at(x, 0, () => {
    const cm = e >= 5 && x.d[14] < 0.5 ? civilLoad(x) : x.body2;
    switch (load) {
      case 'box': block(x, -w * 1.02, lf0, w * 1.02, lf1, ly, ly + lh, cm, cm); break;
      case 'tank': { const r = Math.min(w, lh * 0.5); D.cap([0, ly + r, lf1 - r * 0.6], [0, ly + r, lf0 + r * 0.6], r, r, e >= 5 ? P.chrome : P.steel, D.depth([0, ly + r, (lf0 + lf1) / 2])); for (let k = 0; k < 3; k++) D.ell([0, ly + r, lerp(lf0, lf1, (k + 0.5) / 3)], 0.35, r * 1.02, P.dark, D.depth([0, ly + r, 0]) + 0.01, { g: D.group(), noLine: true }); rod(x, [0, ly + r * 2, lerp(lf0, lf1, 0.5)], [0, ly + r * 2 + 0.6, lerp(lf0, lf1, 0.5)], 0.4, P.dark); break; }
      case 'hopper': loft(x, [{ f: lf1, w: w * 1.05, bw: w * 0.6, tw: w * 1.1, wy: 1, y0: ly, y1: ly + lh * 0.8 }, { f: lf0, w: w * 1.05, bw: w * 0.6, tw: w * 1.1, wy: 1, y0: ly, y1: ly + lh * 0.8 }], x.body2, { top: { ...x.K.soil, tex: 'soil' } }); break;
      case 'logs': block(x, -w, lf0, w, lf1, ly, ly + 0.8, P.dark, P.dark); up(x, () => { for (let i = 0; i < 3 + b * 2; i++) { const a = (-1 + (i % 3)) * w * 0.62, yy = ly + 1 + Math.floor(i / 3) * 1.8; D.cap([a, yy, lf1], [a, yy, lf0], 0.9 * Z, 0.9 * Z, x.K.trunk, D.depth([a, yy, 0])); } for (const k of [0.2, 0.8]) for (const s of [-1, 1]) rod(x, [s * w, ly, lerp(lf0, lf1, k)], [s * w, ly + 4 * Z, lerp(lf0, lf1, k)], 0.25, P.dark); }); break;
      case 'container': { const n = Math.max(1, Math.round((lf1 - lf0) / (8 * Z))); for (let i = 0; i < n; i++) { const f0 = lerp(lf0, lf1, i / n), f1 = lerp(lf0, lf1, (i + 1) / n) - 0.3, m = civilLoad(x, i); block(x, -w, f0, w, f1, ly, ly + lh * 0.9, { ...m, tex: 'corrugated' }, m); } break; }
      case 'pods': block(x, -w, lf0, w, lf1, ly, ly + 0.8, P.dark, P.dark); up(x, () => { for (let i = 0; i < 2 + b; i++) { const f = lerp(lf0, lf1, (i + 0.5) / (2 + b)); pod(x, [0, ly + lh * 0.4, f], w * 1.8, (lf1 - lf0) / (2 + b) * 0.9, lh * 0.8, i % 2 ? P.glass : x.body2); } }); break;
      case 'cage': for (let i = 0; i <= 5; i++) { const f = lerp(lf0, lf1, i / 5); for (const s of [-1, 1]) rod(x, [s * w, ly, f], [s * w, ly + lh, f], 0.25, P.steel); } for (const s of [-1, 1]) D.cap([s * w, ly + lh, lf0], [s * w, ly + lh, lf1], 0.3, 0.3, P.steel, D.depth([s * w, ly, 0])); block(x, -w, lf0, w, lf1, ly - 0.2, ly + 0.4, P.plank, P.plank); break;
      default: block(x, -w, lf0, w, lf1, ly, ly + 1, P.plank, P.plank); up(x, () => { for (let i = 0; i < 2 + b * 2; i++) crate(x, -w / 2 + (i % 2) * w, lf0 + 2 + Math.floor(i / 2) * 3, ly + 1, 2.4 * Z, i % 2 ? P.wood : x.body2); });
    }
  });
  if (e === 3) stacks(x, w * 0.5, L / 2 - cabL * 0.6, y0 + cabH, 3 * Z, 'steam');
  else if (e <= 5 && x.d[15] < 0.6) stacks(x, -w * 1.05, L / 2 - cabL - 0.3, y0 + 1, cabH + 1, 'diesel');
  if (e >= 6) up(x, () => light(x, [0, y0 + cabH + 0.4, cf], 0.5, P.glow, undefined, true));
  const lname: Record<string, string> = { flat: 'de carga', box: 'baú', tank: 'tanque', hopper: 'caçamba', logs: 'de toras', container: 'porta-contêiner', pods: 'de cápsulas', cage: 'gaiola' };
  const base = g === 'legs' ? 'Cargueiro andador' : g === 'hover' ? 'Cargueiro flutuante' : g === 'runners' ? 'Trenó a vapor' : artic ? 'Carreta' : e === 3 ? 'Caminhão a vapor' : b === 0 ? 'Picape' : 'Caminhão';
  x.label = `${base} ${lname[load]}${g === 'tracks' || g === 'halftrack' || g === 'balls' || g === 'screw' ? ' ' + gearName(g, '') : ''}`;
}
function civilLoad(x: VCtx, i = 0): Mat {
  const hs = [0.02, 0.58, 0.12, 0.35, 0.95, 0.5, 0.08];
  const h = x.C.mode === 'alien' ? x.C.hues[i % 3] : hs[(i * 3 + Math.floor(x.d[14] * 7)) % hs.length];
  return { ramp: ramp(h, 0.5, 0.45), tex: 'smooth', spec: 0.2 };
}

// ---------------------------------------------------------------------------------------------------
// Civil: passengers
// ---------------------------------------------------------------------------------------------------
function passenger(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e <= 2) { // gig (small, two wheels), coach (medium), stagecoach with luggage (large)
    const W = 6.5 * Z, L = (8 + b * 3) * Z, n = b === 0 ? 1 : 2;
    const run = climate(x).cold && x.d[0] < 0.5 ? runGear(x, 'runners', W / 2, L, 0) : runGear(x, 'wheels', W / 2, L, 0, n);
    const y0 = run.y0 + 0.4;
    if (b === 0) { // open gig: a seat with a hood
      block(x, -W / 2, -L / 2, W / 2, L / 3, y0, y0 + 1.6, x.body, P.plank);
      up(x, () => { block(x, -W / 2, -L / 2, W / 2, -L / 2 + 1.2, y0 + 1.6, y0 + 3.4, x.body, x.body); loft(x, [{ f: -L / 2 + 0.6, w: W / 2, bw: W / 2, tw: 0.3, wy: 0, y0: y0 + 3.4, y1: y0 + 7 }, { f: -L / 2 + 3, w: W / 2, bw: W / 2, tw: 0.3, wy: 0, y0: y0 + 3.4, y1: y0 + 6.6 }], x.body2, { round: 1, open: true }); });
    } else {
      const H = 6.5 * Z * 0.9, st: Station[] = [
        { f: L * 0.35, fb: L * 0.3, w: W / 2 * 0.9, bw: W / 2 * 0.7, tw: W / 2 * 0.85, wy: 0.6, y0, y1: y0 + H },
        { f: -L * 0.3, fb: -L * 0.25, w: W / 2 * 0.9, bw: W / 2 * 0.7, tw: W / 2 * 0.85, wy: 0.6, y0, y1: y0 + H },
      ];
      loft(x, st, x.body, { top: x.body2 });
      up(x, () => {
        for (const s of [-1, 1]) windowBand(x, [s * W / 2 * 0.91, y0 + H * 0.5, L * 0.2], [s * W / 2 * 0.91, y0 + H * 0.5, -L * 0.15], H * 0.32, 2, x.K.win, D.depth([s * W / 2, y0 + H / 2, 0]) + 0.2);
        if (x.C.params.wealth > 0.4) for (const s of [-1, 1]) D.cap([s * W / 2 * 0.92, y0 + H * 0.35, L * 0.34], [s * W / 2 * 0.92, y0 + H * 0.35, -L * 0.29], 0.2, 0.2, P.brass, D.depth([s * W / 2, y0 + 1, 0]) + 0.21, { noLine: true });
        block(x, -W / 2, L * 0.33, W / 2, L * 0.5, y0 + H * 0.25, y0 + H * 0.4, P.plank, P.plank);
        if (b === 2) for (let i = 0; i < 3; i++) (i % 2 ? crate : barrel)(x, -1.5 + i * 1.5, -L * 0.1 + i, y0 + H, 1.8, P.wood);
        for (const s of [-1, 1]) { rod(x, [s * W / 2, y0 + H * 0.7, L * 0.36], [s * W / 2, y0 + H + 0.5, L * 0.36], 0.12, P.dark); light(x, [s * W / 2, y0 + H + 0.6, L * 0.36], 0.5, x.K.fire); }
      });
    }
    const hf = L / 2 + 9 * Z;
    for (const s of n === 1 ? [-1, 1] : [0]) D.cap([s * 2 * Z, y0 + 0.3, L / 3], [s * 2.2 * Z, y0 - 0.3, hf], 0.4, 0.35, P.wood, D.depth([s, y0, L / 2]));
    x.hitch = [0, 0, hf];
    x.label = b === 0 ? 'Charrete' : b === 1 ? 'Carruagem' : 'Diligência';
    return;
  }
  const g = gearFor(x, 'car'), ch = chassisFor(x), bus = b === 2, round = isRound(ch) || e >= 6;
  const w = (bus ? 4.2 : 3.4) * Z * (b === 1 ? 1.05 : 1), L = (bus ? 26 : b === 1 ? 16 : 12.5) * Z;
  const run = runGear(x, g, w, L, bus ? 0.4 : 0, g === 'wheels' ? (bus && x.d[13] < 0.4 ? 3 : 2) : undefined);
  const y0 = run.y0;
  const H1 = (bus ? 3 : 2.4) * Z, H2 = (bus ? 5.5 : 2.6) * Z * (b === 1 && x.d[12] < 0.4 ? 1.35 : 1);
  if (round) {
    pod(x, [0, y0 + (H1 + H2) * 0.45, 0], w * 2.05, L, (H1 + H2) * 0.95, x.body);
    up(x, () => { dome(x, [0, y0 + H1 * 0.9, bus ? 0 : L * 0.05], w * 0.85, L * (bus ? 0.45 : 0.3), H2 * 0.85, P.glass); if (bus) for (const s of [-1, 1]) windowBand(x, [s * w * 0.98, y0 + H1, L * 0.35], [s * w * 0.98, y0 + H1, -L * 0.35], H2 * 0.4, 6, P.glassDark, D.depth([s * w, y0 + H1, 0]) + 0.3); });
  } else {
    // lower body with a bonnet and a boot, then the greenhouse
    const nose = bus ? 0.02 : 0.22, tail = bus ? 0.02 : 0.14;
    const low: Station[] = [
      { f: L / 2, fb: L / 2 - 0.3, w: w * 0.95, bw: w * 0.9, tw: w * 0.85, wy: 0.4, y0, y1: y0 + H1 * 0.75 },
      { f: L / 2 - L * 0.06, w, bw: w * 0.95, tw: w * 0.92, wy: 0.4, y0, y1: y0 + H1 },
      { f: -L / 2 + L * 0.05, w, bw: w * 0.95, tw: w * 0.92, wy: 0.4, y0, y1: y0 + H1 },
      { f: -L / 2, w: w * 0.95, bw: w * 0.9, tw: w * 0.85, wy: 0.4, y0: y0 + 0.2, y1: y0 + H1 * 0.85 },
    ];
    loft(x, low, x.body, { top: x.body });
    const g0 = L / 2 - L * nose, g1 = -L / 2 + L * tail, gw = w * 0.9;
    up(x, () => {
      const green: Station[] = [
        { f: g0 - H2 * 0.5, fb: g0, w: gw, bw: gw, tw: gw * 0.85, wy: 0, y0: y0 + H1, y1: y0 + H1 + H2 },
        { f: g1 + (bus ? 0 : H2 * 0.3), fb: g1, w: gw, bw: gw, tw: gw * 0.85, wy: 0, y0: y0 + H1, y1: y0 + H1 + H2 },
      ];
      if (bus) {
        // a painted body with rows of windows (two rows on a double-decker) and a windscreen
        loft(x, green, x.body, { top: x.body2 });
        const decks = x.d[12] > 0.7 ? 2 : 1, rowH = H2 / decks;
        for (let k = 0; k < decks; k++) {
          const yy = y0 + H1 + rowH * (k + 0.28);
          for (const s of [-1, 1]) windowBand(x, [s * gw * 1.01, yy, g0 - 1.2], [s * gw * 1.01, yy, g1 + 1], rowH * 0.5, 7, P.glassDark, D.depth([s * gw, yy, 0]) + 0.2, x.body2);
          windowBand(x, [-gw * 0.85, yy - (k === 0 ? rowH * 0.15 : 0), g0 + 0.05], [gw * 0.85, yy - (k === 0 ? rowH * 0.15 : 0), g0 + 0.05], rowH * (k === 0 ? 0.7 : 0.5), 1, P.glass, D.depth([0, yy, g0]) + 0.2);
        }
      } else loft(x, green, P.glass, { top: x.body2, ends: P.glass });
      if (bus) { /* done */ } else for (const s of [-1, 1]) D.cap([s * gw * 1.01, y0 + H1, (g0 + g1) / 2 + L * 0.03], [s * gw * 0.9, y0 + H1 + H2, (g0 + g1) / 2 + L * 0.03], 0.3, 0.3, x.body2, D.depth([s * gw, y0 + H1, 0]) + 0.01, { noLine: true });
      headlights(x, w, L / 2, y0 + H1 * 0.55);
      for (const s of [-1, 1]) light(x, [s * w * 0.75, y0 + H1 * 0.6, -L / 2 - 0.1], 0.45, { ...x.K.fire, emit: true });
    });
  }
  if (e === 3) stacks(x, 0, -L * 0.4, y0 + H1 + H2 * 0.3, 3 * Z, 'steam');
  if (g === 'hover' || g === 'legs') up(x, () => light(x, [0, y0 + H1 + H2 + 0.3, 0], 0.4, P.glow, undefined, true));
  const kind = bus ? (x.d[13] < 0.4 && g === 'wheels' ? 'Ônibus articulado' : x.d[12] > 0.7 ? 'Ônibus de dois andares' : 'Ônibus') : b === 1 ? (x.d[12] < 0.4 ? 'Furgão' : 'Limusine') : e === 3 ? 'Automóvel a vapor' : 'Carro';
  x.label = e >= 6 && g === 'hover' ? (bus ? 'Aeroônibus' : 'Aerocarro') : g === 'legs' ? `${kind} andador` : g === 'wheels' ? kind : `${kind} ${gearName(g, '')}`;
}

// ---------------------------------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------------------------------
function warCart(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), kind = pick(x.d[11], [['chariot', b === 0 ? 4 : 1.5], ['wagon', b >= 1 ? 3 : 0.5], ['sled', climate(x).cold ? 2 : 0]] as [string, number][]);
  if (kind === 'wagon') { // war wagon: a plank fort on wheels with shields, loopholes and (clássica) a swivel gun
    const W = 8 * Z, L = (13 + b * 2) * Z, run = runGear(x, 'wheels', W / 2, L, 0.2, 2), y0 = run.y0 + 0.3, H = 6 * Z;
    loft(x, [{ f: L / 2, w: W / 2, bw: W / 2 * 0.9, tw: W / 2 * 0.7, wy: 0.4, y0, y1: y0 + H }, { f: -L / 2, w: W / 2, bw: W / 2 * 0.9, tw: W / 2 * 0.7, wy: 0.4, y0, y1: y0 + H }], P.plank, { top: null });
    at(x, 0, () => {
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const c: V3 = [s * W / 2 * 1.01, y0 + H * 0.5, L * (k - 1) * 0.3]; if (D.facing([s, 0, 0]) > 0) { D.ell(c, 1.3 * Z, 1.5 * Z, k % 2 ? x.body : x.body2, D.depth(c) + 0.1, { g: D.group() }); D.ell([c[0] + s * 0.1, c[1] + 0.9 * Z, c[2]], 0.35, 0.2, P.dark, D.depth(c) + 0.11, { g: D.group(), noLine: true }); } }
    });
    up(x, () => {
      if (e === 2) fixedGun(x, { kind: 'cannon', len: 4 * Z, r: 0.35 * Z, muzzle: 'bell' }, [0, y0 + H, L / 2 - 0.5], 0, 0.3);
      else fixedGun(x, { kind: 'bolt', len: 3 * Z, r: 0.25 }, [0, y0 + H, L / 2 - 0.5], 0, 0.3);
      banner(x, [-W / 2 + 0.6, y0 + H, -L / 2 + 1], 6 * Z, 4 * Z, x.body);
    });
    const hf = L / 2 + 9 * Z; D.cap([0, y0, L / 2], [0, y0 - 0.4, hf], 0.45, 0.4, P.wood, D.depth([0, y0, L / 2 + 3])); x.hitch = [0, 0, hf];
    x.label = e === 2 ? 'Carroça de guerra armada' : 'Carroça de guerra';
    return;
  }
  // chariot (two spoked wheels, scythes on the hubs) or war sled
  const W = 6.5 * Z, L = 6.5 * Z, cold = kind === 'sled';
  const run = cold ? runGear(x, 'runners', W / 2, L * 1.4, 0) : runGear(x, 'wheels', W / 2, L, 0, 1);
  const y0 = run.y0 + 0.2;
  block(x, -W / 2, -L / 2, W / 2, L / 2, y0, y0 + 0.7, P.plank, P.plank);
  up(x, () => {
    loft(x, [{ f: L / 2, w: W / 2 * 0.9, bw: W / 2 * 0.9, tw: W / 2 * 0.7, wy: 0, y0: y0 + 0.7, y1: y0 + 4 }, { f: -L * 0.1, w: W / 2, bw: W / 2, tw: W / 2 * 0.85, wy: 0, y0: y0 + 0.7, y1: y0 + 3 }], x.body, { top: null, ends: null });
    if (!cold && x.d[12] < 0.7) for (const s of [-1, 1]) D.cap([s * (W / 2 + 1.2), run.y0 * 0.95, 0], [s * (W / 2 + 4.5 * Z), run.y0 * 0.9, 0.4], 0.4, 0.05, x.K.metal, D.depth([s * W, 2, 0]) + 0.3);
    if (x.C.params.exotic > 0.5) for (let i = 0; i < 3; i++) D.cap([(-1 + i) * W * 0.3, y0 + 4, L / 2], [(-1 + i) * W * 0.4, y0 + 5.6, L / 2 + 1.5], 0.35, 0.05, P.bone, D.depth([0, y0 + 4, L / 2]) + 0.1);
    banner(x, [-W / 2 + 0.5, y0 + 3, -L / 3], 7 * Z, 4 * Z, x.body, undefined, x.d[13] < 0.5);
  });
  const hf = L / 2 + 10 * Z; D.cap([0, y0, L / 2], [0, y0 - 0.4, hf], 0.45, 0.4, P.wood, D.depth([0, y0, L / 2 + 3])); x.hitch = [0, 0, hf];
  x.label = cold ? 'Trenó de guerra' : 'Carro de guerra';
}
/** armoured cars, scouts, tanks, heavy tanks and land battleships: chassis + gear + turret(s) */
function armour(x: VCtx, cls: 'light' | 'medium' | 'heavy') {
  const { e, P, D } = x, Z = x.Z * (cls === 'heavy' ? 1.25 : 1), b = tier(x);
  const g = gearFor(x, cls === 'light' ? 'light' : cls === 'medium' ? 'tank' : 'heavy');
  const ch = e === 3 && g === 'tracks' && x.d[1] < 0.6 ? 'slab' : chassisFor(x);
  const w = (cls === 'light' ? 3.6 : 4.8) * Z, L = (cls === 'light' ? 14 : 19) * Z, H = (cls === 'light' ? 3.8 : 3.4) * Z;
  const heavy = cls === 'heavy' ? 1 : cls === 'medium' ? 0.6 : 0;
  // e3 landship: a rhomboid wrapped in its own tracks, guns in side sponsons
  if (e === 3 && g === 'tracks' && cls !== 'light' && x.d[16] < 0.55) return landship(x, w, L, cls === 'heavy');
  const run = runGear(x, g, w, L, heavy, g === 'wheels' ? (cls === 'light' ? (b === 2 ? 3 : 2) : 4) : undefined);
  const y0 = run.y0;
  const tracked = g === 'tracks' || g === 'halftrack';
  let st: Station[];
  if (tracked) {
    // lower tub between the tracks, upper hull over the fenders
    const R = (1.7 + heavy * 0.5) * Z, fy = 2 * R + R * 0.35 + 0.1;
    loft(x, [{ f: L * 0.46, w: w * 0.55, bw: w * 0.5, tw: w * 0.55, wy: 1, y0, y1: fy }, { f: -L * 0.46, w: w * 0.55, bw: w * 0.5, tw: w * 0.55, wy: 1, y0, y1: fy }], x.body2, { top: null });
    st = chassisStations(ch, run.W / 2 + 0.3, L, fy, H * 0.75, 0.4);
  } else st = chassisStations(ch, w, L, y0, H);
  loft(x, st, x.body, { round: isRound(ch) ? 1 : 0, top: x.body });
  const deckF = -L * 0.06, deckY = roofAt(st, deckF), mid = st[Math.floor(st.length / 2)];
  // armour extras, lights, stowage, exhausts
  up(x, () => {
    headlights(x, mid.w * 0.8, st[0].f, (st[0].y0 + st[0].y1) / 2);
    if (e >= 4 && x.d[17] < 0.5) for (const s of [-1, 1]) { const a = s * (mid.w + 0.1); if (D.facing([s, 0, 0]) > 0) for (let k = 0; k < 2; k++) block(x, a - (s > 0 ? 0 : 0.9), -L * 0.3 + k * 2.4 * Z, a + (s > 0 ? 0.9 : 0), -L * 0.3 + k * 2.4 * Z + 1.8 * Z, mid.y1 - 1.6 * Z, mid.y1 - 0.2, P.canvas, P.canvas); }
    if (e >= 4 && e <= 5) for (const s of [-1, 1]) D.cap([s * mid.w * 0.6, mid.y1, -L * 0.42], [s * mid.w * 0.6, mid.y1 + 0.2, -L * 0.3], 0.5 * Z, 0.5 * Z, x.body2, D.depth([s * mid.w, mid.y1, -L * 0.4]) + 0.02);
    if (x.C.params.exotic > 0.55 || e <= 3) addons(x, st, Math.floor(x.d[18] * 3), x.body2);
    if (e >= 5 && x.d[19] < 0.4 && cls !== 'light') for (const s of [-1, 1]) D.poly([[s * (mid.w + 0.4), mid.y0 + 0.5, L * 0.2], [s * (mid.w + 0.4), mid.y0 + 0.5, -L * 0.2], [s * (mid.w + 0.4), mid.y1 - 0.2, -L * 0.2], [s * (mid.w + 0.4), mid.y1 - 0.2, L * 0.2]], { ...P.dark, tex: 'grid' }, D.depth([s * mid.w, mid.y1, 0]) + 0.3, { g: D.group(), flat: 0.9, dark: D.light([s, 0, 0]) });
  });
  for (const s of [-1, 1]) emblem(x, [s * mid.w * 1.02, (mid.y0 + mid.y1) / 2, -L * 0.15], [s, 0, 0], 0.9 * Z, Math.floor(x.d[20] * 5), x.P.paint2, x.body2);
  if (e <= 5 && g !== 'hover' && g !== 'legs') exhaust(x, [mid.w * 0.5, roofAt(st, -L * 0.45) + 0.3, -L * 0.48], e === 3 ? 'steam' : 'diesel', 0.9 * Z);
  if (g === 'hover') for (const s of [-1, 1]) exhaust(x, [s * w * 0.4, y0 + H * 0.4, -L / 2 - 0.3], 'glow', 0.7 * Z);
  // weapons
  const gun = mainGun(x, cls);
  const tShape = cls === 'light' && e <= 4 && x.d[21] < 0.5 ? 'open' : cls === 'light' && x.d[21] < 0.25 ? 'pintle' : turretShapeFor(x);
  const R = (cls === 'light' ? 1.9 : cls === 'medium' ? 3 : 3.8) * Z, TH = (cls === 'light' ? 1.6 : 2.2) * Z;
  let top = deckY;
  up(x, () => {
    const main: Mount = { id: 0, a: 0, f: deckF, y: deckY, R, H: TH, shape: tShape, gun, m: x.body, m2: x.body2, cupola: e >= 4 && cls !== 'light', roofGun: e >= 5 && cls !== 'light' && x.d[22] < 0.6, kit: e >= 4 && e <= 6, phase: x.d[23] * 6 };
    top = turret(x, main).top;
    // heavy: secondary turrets fore and aft (multi-turret colossi) or sponsons
    if (cls === 'heavy') {
      const sec: Gun = e >= 7 ? { kind: 'plasma', len: 4 * Z, r: 0.35 * Z, muzzle: 'bulb' } : e === 6 ? { kind: 'laser', len: 4.5 * Z, r: 0.3 * Z, muzzle: 'bulb' } : e === 5 ? { kind: 'auto', len: 5 * Z, r: 0.3 * Z } : { kind: 'mg', len: 3.5 * Z, r: 0.25, muzzle: 'cooling' };
      if (x.d[24] < 0.55) { turret(x, { id: 1, a: 0, f: L * 0.33, y: roofAt(st, L * 0.33), R: R * 0.45, H: TH * 0.65, shape: tShape === 'wedge' ? 'round' : tShape, gun: sec, m: x.body, phase: 1.3 }); turret(x, { id: 2, a: 0, f: -L * 0.36, y: roofAt(st, -L * 0.36), R: R * 0.45, H: TH * 0.65, shape: tShape === 'wedge' ? 'round' : tShape, gun: sec, m: x.body, yaw0: Math.PI, arc: 2.4, phase: 2.6 }); }
      else for (const s of [-1, 1]) { const p: V3 = [s * (mid.w + 0.2), (mid.y0 + mid.y1) / 2, L * 0.15]; D.cap([s * mid.w, p[1], p[2] - 1.5 * Z], [s * (mid.w + 1.2 * Z), p[1], p[2]], 1.3 * Z, 1.1 * Z, x.body, D.depth(p)); fixedGun(x, sec, [s * (mid.w + 1.2 * Z), p[1], p[2] + 0.3], s * 0.5, 0.35, s); }
    } else if (cls === 'medium' && e >= 4 && e <= 5 && x.d[24] < 0.35) fixedGun(x, { kind: 'mg', len: 2.5 * Z, r: 0.22 }, [mid.w * 0.4, roofAt(st, L * 0.4), L * 0.42], 0, 0.3, 0.7);
  });
  if (e >= 5) up(x, () => rod(x, [-mid.w * 0.5, mid.y1, -L * 0.35], [-mid.w * 0.55, mid.y1 + 6 * Z, -L * 0.4], 0.1, P.dark));
  void top;
  // names
  const legs2 = g === 'legs';
  if (cls === 'light') x.label = legs2 ? 'Andador de reconhecimento' : g === 'hover' ? 'Batedor flutuante' : gun.kind === 'flame' ? 'Blindado lança-chamas' : gun.kind === 'rockets' || gun.kind === 'missile' ? 'Blindado lança-mísseis' : g === 'wheels' ? (tShape === 'open' || tShape === 'pintle' ? 'Carro de reconhecimento' : 'Carro blindado') : `Blindado leve ${gearName(g, '')}`;
  else if (cls === 'medium') x.label = legs2 ? `Andador de combate ${run.label}` : g === 'tracks' ? 'Tanque' : g === 'wheels' ? 'Tanque de rodas' : g === 'hover' ? 'Tanque flutuante' : `Tanque ${gearName(g, '')}`;
  else x.label = legs2 ? `Colosso andador ${run.label}` : e === 3 ? 'Encouraçado terrestre' : g === 'hover' ? 'Fortaleza flutuante' : `Tanque pesado${g === 'tracks' ? '' : ' ' + gearName(g, '')}`;
  x.label = x.label.trim();
}
/** e3 landship: a rhomboid hull wrapped in tracks, side sponsons with guns, a commander's cupola */
function landship(x: VCtx, w: number, L: number, heavy: boolean) {
  const { P, D } = x, Z = x.Z, R = 3.2 * Z;
  const W = w * 1.6, H = 9 * Z;
  for (const s of [-1, 1]) {
    const a = s * W / 2, key = D.depth([a, H / 2, 0]), g = D.group();
    // the rhomboid track frame
    const prof: [number, number][] = [[0.6, -L / 2], [0.2, -L * 0.2], [0.2, L * 0.2], [H * 0.55, L / 2 + 1.5 * Z], [H, L * 0.35], [H, -L * 0.4], [H * 0.6, -L / 2 - 0.5]];
    const pts: V3[] = [];
    for (const [y, f] of prof) for (const q of [-1, 1]) pts.push([a + q * 1.3 * Z, y, f]);
    D.hull(pts, P.tyre, key, { g, flat: 0.3 });
    if (D.facing([s, 0, 0]) > 0) {
      D.poly(prof.map(([y, f]) => [a + s * 1.35 * Z, y + (H / 2 - y) * 0.12, f * 0.93] as V3), x.body, key + 0.001, { g, flat: 0.9, dark: D.light([s, 0, 0]), uv: [[a, 0, 0], [a, 0, 1], [a, 1, 0]] });
      for (let i = 0; i < 6; i++) D.ell([a + s * 1.4 * Z, H * 0.62, -L * 0.35 + i * L * 0.14], 0.3, 0.3, P.dark, key + 0.002, { g: D.group(), noLine: true });
      const crawl = moving(x) ? frac(x.t * 2) : 0;
      for (let i = 0; i < 16; i++) { const k = frac(i / 16 + crawl / 16); const pi = Math.floor(k * (prof.length - 1)), q = k * (prof.length - 1) - pi; const p0 = prof[pi], p1 = prof[pi + 1]; D.cap([a - 1.3 * Z, lerp(p0[0], p1[0], q), lerp(p0[1], p1[1], q)], [a + 1.3 * Z, lerp(p0[0], p1[0], q), lerp(p0[1], p1[1], q)], 0.3, 0.3, P.dark, key - 0.0005, { noLine: true }); }
    }
  }
  loft(x, [{ f: L * 0.35, w: W / 2 - 1.3 * Z, bw: W / 2 - 1.3 * Z, tw: W / 2 - 1.5 * Z, wy: 0, y0: 1, y1: H * 0.95 }, { f: -L * 0.4, w: W / 2 - 1.3 * Z, bw: W / 2 - 1.3 * Z, tw: W / 2 - 1.5 * Z, wy: 0, y0: 1, y1: H * 0.95 }], x.body2, { top: x.body });
  up(x, () => {
    for (const s of [-1, 1]) {
      const a = s * (W / 2 + 1.4 * Z);
      offsetA(x, a, () => loft(x, [{ f: L * 0.12, fb: L * 0.16, w: 1.4 * Z, bw: 1.2 * Z, tw: 1 * Z, wy: 0.5, y0: H * 0.3, y1: H * 0.75 }, { f: -L * 0.12, w: 1.4 * Z, bw: 1.2 * Z, tw: 1 * Z, wy: 0.5, y0: H * 0.3, y1: H * 0.75 }], x.body));
      fixedGun(x, heavy ? { kind: 'cannon', len: 4 * Z, r: 0.45 * Z } : { kind: 'mg', len: 3 * Z, r: 0.25, muzzle: 'cooling' }, [s * (W / 2 + 2.2 * Z), H * 0.55, L * 0.05], s * 0.9, 0.3, s);
    }
    block(x, -1.4 * Z, L * 0.05, 1.4 * Z, L * 0.25, H * 0.95, H * 0.95 + 2 * Z, x.body, x.body);
    stacks(x, 0, -L * 0.28, H * 0.95, 3.5 * Z, 'steam');
  });
  x.label = heavy ? 'Encouraçado terrestre' : 'Tanque de losango';
}

// ---------------------------------------------------------------------------------------------------
// Transform: a car that stands up as a walker ('use' morphs it and back)
// ---------------------------------------------------------------------------------------------------
function transformer(x: VCtx) {
  const { P, D, e } = x, Z = x.Z, b = tier(x), w = (3.4 + b * 0.4) * Z, L = (13 + b * 3) * Z;
  const m = x.anim === 'use' ? smooth(x.t < 0.5 ? (x.t - 0.05) / 0.35 : (0.97 - x.t) / 0.35) : 0; // 0 = vehicle, 1 = walker
  const hip = 1.6 * Z + m * (8 + b * 2) * Z, arms = m > 0.4;
  const wheelsOn = m < 0.9;
  if (wheelsOn) wheelRow(x, w * 2 * (1 - m * 0.4), [L * 0.32, -L * 0.3].map(f => f * (1 - m * 0.4)), 2.2 * Z * (1 - m * 0.4), 1.2 * Z, e >= 6 ? 'hubless' : 'lug', x.body2, 2.2 * Z * (1 - m * 0.4) + m * 3 * Z);
  if (m > 0.05) legs(x, w * 1.1, [-L * 0.1], hip, hip, 0.9 * Z, P.steel, 'bird', 'claw');
  const y = Math.max(2 * Z, hip - 0.5 * Z) + (m > 0.95 ? bob(x, 0.3) : 0);
  const pf = pitchFrame(y + 2 * Z, -L * 0.1, m * 1.25);
  transformed(x, pf.T, pf.Tn, () => {
    const st: Station[] = [
      { f: L / 2, fb: L / 2 - 0.4, w: w * 0.9, bw: w * 0.85, tw: w * 0.8, wy: 0.4, y0: y, y1: y + 2 * Z },
      { f: L * 0.2, w, bw: w * 0.95, tw: w * 0.85, wy: 0.4, y0: y, y1: y + 2.6 * Z },
      { f: -L * 0.2, w, bw: w * 0.95, tw: w * 0.85, wy: 0.4, y0: y, y1: y + 4.2 * Z },
      { f: -L / 2, w: w * 0.95, bw: w * 0.9, tw: w * 0.8, wy: 0.4, y0: y + 0.3, y1: y + 3.6 * Z },
    ];
    loft(x, st, x.body, { top: x.body2 });
    up(x, () => {
      windowBand(x, [-w * 0.8, y + 2.7 * Z, L * 0.2 - 0.05], [w * 0.8, y + 2.7 * Z, L * 0.2 - 0.05], 1.2 * Z, 1, P.glass, D.depth([0, y + 3 * Z, L * 0.2]) + 0.2);
      headlights(x, w, L / 2, y + 1.2 * Z);
      if (m > 0.6) for (let k = 0; k < 2; k++) light(x, [(k - 0.5) * w * 0.6, y + 1 * Z, L / 2 + 0.2], 0.55, P.glow);
    });
  });
  if (arms) up(x, () => {
    for (const s of [-1, 1]) {
      const sh: V3 = [s * (w + 0.8 * Z), y + 4.5 * Z * m, -L * 0.05];
      D.ell(sh, 1.2 * Z, 1.2 * Z, x.body2, D.depth(sh), { g: D.group() });
      const hand: V3 = [s * (w + 1.2 * Z), sh[1] - 3 * Z, sh[2] + 3 * Z];
      D.cap(sh, hand, 0.8 * Z, 0.7 * Z, P.steel, D.depth(sh) + 0.01);
      if (s > 0) fixedGun(x, e >= 7 ? { kind: 'plasma', len: 3.5 * Z, r: 0.4, muzzle: 'bulb' } : e === 6 ? { kind: 'laser', len: 4 * Z, r: 0.35, muzzle: 'bulb' } : { kind: 'rotary', n: 5, len: 3.5 * Z, r: 0.2 }, hand, 0.05, 0.2);
      else D.ell(hand, 0.8 * Z, 0.8 * Z, P.dark, D.depth(hand) + 0.02, { g: D.group() });
    }
  });
  x.label = b === 2 ? 'Caminhão-robô' : 'Carro-robô';
}

export const LAND = {
  cargo, passenger, transformer,
  light: (x: VCtx) => (x.e <= 2 ? warCart(x) : armour(x, 'light')),
  medium: (x: VCtx) => armour(x, 'medium'),
  heavy: (x: VCtx) => armour(x, 'heavy'),
};
void acting; void circle;
