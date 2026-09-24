// Land vehicles: carts and wagons (pulled by beasts coupled in gameplay - never part of the asset), motor transport,
// siege engines, war carts to tanks and walkers, and transformers. Forms follow the culture (plan, exotic) and the
// design numbers; the era decides the technology (spoked wheels -> steam -> tyres -> tracks -> legs -> hover).
import type { V3 } from '../structure/draft';
import { box, cyl, prism, facet, roofOn, flag, lamp, fire, crate, barrel, sack, Pt } from '../structure/parts';
import { VCtx, wheels, tracks, legs, hoverPads, hullBox, pod, canopy, turret, shot, exhaust, moving, bob, shotAge, frac, Gun } from './vparts';

const pick = <T,>(u: number, arr: T[]) => arr[Math.floor(u * arr.length) % arr.length];
type Loco = 'wheels' | 'tracks' | 'legs' | 'hover';

/** how a motor vehicle of this culture and era moves (exotic cultures walk earlier) */
function locoFor(x: VCtx, heavy: boolean, prefer: Loco = 'wheels'): Loco {
  const e = x.e, ex = x.C.params.exotic, u = x.d[0];
  if (e >= 7) return u < 0.35 + ex * 0.3 ? 'legs' : 'hover';
  if (e === 6) return u < 0.25 + ex * 0.3 ? 'legs' : u < 0.75 ? 'hover' : heavy ? 'tracks' : 'wheels';
  if (e === 5 && u < ex * 0.35) return 'legs';
  return prefer;
}

/** the running gear under a hull of width W and length L; returns the hull's bottom height */
function gear(x: VCtx, loco: Loco, W: number, L: number, n: number, r: number, style: 'spoke' | 'solid' | 'tyre' = 'tyre') {
  switch (loco) {
    case 'wheels': {
      const fs = Array.from({ length: n }, (_, i) => -L * 0.36 + (L * 0.72 * i) / Math.max(1, n - 1));
      wheels(x, W * 0.88, n === 1 ? [0] : fs, r, r * 0.7, style);
      return r * 0.9;
    }
    case 'tracks': tracks(x, W * 0.78, L * 0.95, r, r * 1.1); return r * 1.7;
    case 'legs': { const hip = r * 3.2; legs(x, W * 0.8, n <= 2 ? [0] : [L * 0.28, -L * 0.28], hip, hip, Math.max(0.9, r * 0.35), x.P.metal, x.C.params.exotic > 0.5); return hip; }
    case 'hover': { const y = r * 1.4 + bob(x, 0.5); hoverPads(x, W, L, y); return y; }
  }
}

// ---------------------------------------------------------------------------------------------------
// Beast-drawn and motor transport
// ---------------------------------------------------------------------------------------------------
function cart(x: VCtx) {
  const { e, P, D } = x, k = x.Z, big = x.size !== 'small';
  if (e === 0) { // travois / drag sledge: two poles and a hide sling
    const L = 16 * k;
    for (const s of [-1, 1]) D.cap([s * 2.2 * k, 5.5, L * 0.55], [s * 3.5 * k, 0.4, -L * 0.45], 0.55, 0.5, P.wood, D.depth([s * 3, 3, 0]));
    for (let i = 0; i < 3; i++) D.cap([-3.2 * k, 1.5 + i * 1.3, -L * 0.2 + i * 2.4], [3.2 * k, 1.5 + i * 1.3, -L * 0.2 + i * 2.4], 0.4, 0.4, P.wood, D.depth([0, 2, 0]) + 0.01);
    facet(x, [[-3 * k, 1.4, -L * 0.3], [3 * k, 1.4, -L * 0.3], [2.8 * k, 4.2, L * 0.15], [-2.8 * k, 4.2, L * 0.15]], P.hide, D.depth([0, 3, 0]) + 0.02, D.group(), null, true);
    for (let i = 0; i < (big ? 4 : 2); i++) sack(x, -1.5 + i * 1.2, -L * 0.1 + (i % 2) * 2, 2.5, 2.4, x.K.cloth2);
    return;
  }
  if (e <= 2) { // cart (small), wagon (medium), covered wagon (large): a little bigger each tier
    const W = 7 * k, L = 13 * k, r = 2.6 + (big ? 0.6 : 0);
    const n = x.size === 'small' ? 1 : 2;
    wheels(x, W, n === 1 ? [-L * 0.1] : [-L * 0.32, L * 0.3], r, 0.8, e === 1 && x.d[1] < 0.5 ? 'solid' : 'spoke');
    const y0 = r * 1.15;
    box(x, -W / 2, -L / 2, W / 2, L / 2, y0, y0 + 0.8, P.wood2, P.wood2);
    for (const s of [-1, 1]) box(x, s * W / 2 - (s > 0 ? 0.5 : 0), -L / 2, s * W / 2 + (s < 0 ? 0.5 : 0), L / 2, y0 + 0.8, y0 + 3, P.wood2, P.wood, 0.01);
    box(x, -W / 2, -L / 2, W / 2, -L / 2 + 0.5, y0 + 0.8, y0 + 3, P.wood2, P.wood, 0.01);
    // shafts / tongue for the beasts that will be harnessed in gameplay
    for (const s of n === 1 ? [-1, 1] : [0]) D.cap([s * 2, y0, L / 2], [s * 2.2, y0 - 0.5, L / 2 + 9 * k], 0.45, 0.4, P.wood, D.depth([s, y0, L / 2 + 4]));
    x.hitch = [0, 0, L / 2 + 9 * k];
    if (x.size === 'large' || (e === 2 && x.d[2] < 0.6)) { // canvas hoops
      const v = { kind: 'prism' as const, ring: [[-W / 2, L / 2 - 1], [W / 2, L / 2 - 1], [W / 2, -L / 2 + 0.5], [-W / 2, -L / 2 + 0.5]] as Pt[], top: [[-W / 2, L / 2 - 1], [W / 2, L / 2 - 1], [W / 2, -L / 2 + 0.5], [-W / 2, -L / 2 + 0.5]] as Pt[], y0: y0, y1: y0 + 3, key: D.depth([0, y0 + 3, 0]) + 0.1 };
      roofOn(x, v, 'vault', P.sail, P.sail, { over: 0, alongF: true, pitch: 1.4 });
    } else for (let i = 0; i < (x.size === 'small' ? 3 : 6); i++) (i % 3 === 0 ? barrel : i % 3 === 1 ? crate : sack)(x, -W / 2 + 2 + (i % 2) * (W - 4), -L / 2 + 2.5 + Math.floor(i / 2) * 3.5, y0 + 0.8, 2.6, i % 3 === 2 ? x.K.cloth2 : P.wood);
    if (e === 2 && x.d[3] < 0.5) lamp(x, [W / 2 + 0.4, y0 + 4, L / 2 - 0.5], x.K.fire, false, 0.7);
    return;
  }
  motorTruck(x, 'cargo');
}
function coach(x: VCtx) {
  const { e, P, D } = x, k = x.Z;
  if (e <= 2) { // carriage: a closed cabin on spoked wheels, driver's bench in front
    const W = 7 * k, L = 12 * k, r = 3.2;
    wheels(x, W, [-L * 0.3, L * 0.3], r, 0.7, 'spoke');
    const y0 = r * 1.2, H = 7;
    const cab = hullBox(x, W, L * 0.7, y0, y0 + H, x.body, P.paint2, 0.02, 0.02, 0.92);
    void cab;
    for (const s of [-1, 1]) facet(x, [[s * (W / 2 + 0.2), y0 + H * 0.45, -1.8], [s * (W / 2 + 0.2), y0 + H * 0.45, 1.8], [s * (W / 2 + 0.1), y0 + H * 0.85, 1.8], [s * (W / 2 + 0.1), y0 + H * 0.85, -1.8]], x.K.win, D.depth([s * W, y0 + H * 0.6, 0]) + 0.1, D.group(), [0, y0 + H / 2, 0]);
    box(x, -W / 2, L * 0.35, W / 2, L * 0.5, y0 + H * 0.35, y0 + H * 0.5, P.wood, P.wood2);
    for (const s of [-1, 1]) { D.cap([s * 1.8, y0, L * 0.5], [s * 1.9, y0 - 0.6, L * 0.5 + 9], 0.45, 0.4, P.wood, D.depth([s, y0, L])); lamp(x, [s * (W / 2 + 0.5), y0 + H * 0.9, L * 0.34], x.K.fire, false, 0.6); }
    x.hitch = [0, 0, L * 0.5 + 9];
    cyl(x, 0, 0, W * 0.25, y0 + H, y0 + H + 0.5, P.metal, P.metal);
    return;
  }
  motorTruck(x, x.size === 'large' ? 'bus' : 'car');
}
/** motor transport: trucks, cars and buses of every era from steam onward */
function motorTruck(x: VCtx, kind: 'cargo' | 'car' | 'bus') {
  const { e, P, D } = x, k = x.Z;
  const W = (kind === 'car' ? 7.5 : 8.5) * k, L = (kind === 'bus' ? 26 : kind === 'car' ? 14 : 18) * k;
  const loco = e >= 6 ? locoFor(x, false) : 'wheels';
  const r = e === 3 ? 3.4 : 2.4;
  const y0 = gear(x, loco, W, L, kind === 'bus' || L > 20 ? 3 : 2, r, e === 3 ? 'spoke' : 'tyre');
  const round = x.C.plan === 'round' || x.C.plan === 'pod' || e >= 6;
  if (kind === 'cargo') {
    const cabL = L * 0.3, cf = L / 2 - cabL / 2;
    if (round) pod(x, W, cabL * 1.2, 6.5, y0, x.body, 0.1, 0.8, cf - cabL * 0.1); else hullBox(x, W, cabL, y0, y0 + 6.5, x.body, x.body2, 0.25, 0.02, 0.9, 0, cf);
    if (!round) D.poly([[-W * 0.4, y0 + 4, L / 2 - cabL * 0.2 + 0.2], [W * 0.4, y0 + 4, L / 2 - cabL * 0.2 + 0.2], [W * 0.36, y0 + 6, L / 2 - cabL * 0.45], [-W * 0.36, y0 + 6, L / 2 - cabL * 0.45]], P.glass, D.depth([0, y0 + 5, L / 2]) + 0.2, { g: D.group(), flat: 0.6 });
    else canopy(x, cf + cabL * 0.15, y0 + 5, W * 0.7, cabL * 0.6, 2, 0.2);
    // the load bed: open (small), boxed (medium), tank or container (large)
    const f0 = -L / 2, f1 = L / 2 - cabL - 0.8;
    if (x.size === 'large' && x.d[4] < 0.5) { const r = W * 0.45; D.cap([0, y0 + r, f0 + r * 0.8], [0, y0 + r, f1 - r * 0.8], r, r, P.metal, D.depth([0, y0 + r, (f0 + f1) / 2])); }
    else if (x.size !== 'small') box(x, -W / 2, f0, W / 2, f1, y0, y0 + 7, x.body2, x.body2);
    else { box(x, -W / 2, f0, W / 2, f1, y0, y0 + 1.2, P.dark, P.wood2); for (let i = 0; i < 3; i++) crate(x, -W / 4 + (i % 2) * W / 2, f0 + 2 + i * 2.5, y0 + 1.2, 2.4, P.wood); }
    hullBox(x, W * 0.9, L, y0 - 0.6, y0 + 0.2, P.dark, P.dark, 0, 0, 1, -0.05);
  } else {
    const H = kind === 'bus' ? 9 : 5.5;
    if (round) pod(x, W, L, H * 1.3, y0, x.body, 0);
    else { hullBox(x, W, L, y0, y0 + H * 0.5, x.body, x.body, 0.05, 0.05, 0.96); hullBox(x, W * 0.9, L * (kind === 'bus' ? 0.95 : 0.55), y0 + H * 0.5, y0 + H, P.glass, x.body2, kind === 'bus' ? 0.03 : 0.2, 0.15, 0.85, 0.01); }
    if (round) canopy(x, L * 0.05, y0 + H * 0.8, W * 0.8, L * 0.55, H * 0.55);
  }
  for (const s of [-1, 1]) lamp(x, [s * W * 0.35, y0 + 2, L / 2 + 0.3], e >= 6 ? P.glow : x.K.glow, false, 0.7);
  if (e === 3) exhaust(x, [W * 0.25, y0 + 9, L * 0.2], 'steam', 1.6);
  else if (e <= 5 && kind !== 'car') exhaust(x, [W * 0.4, y0 + 8, L * 0.1], 'diesel', 1);
  if (e === 3) cyl(x, W * 0.25, L * 0.2, 0.8, y0 + 5, y0 + 9, P.dark, P.dark);
}

// ---------------------------------------------------------------------------------------------------
// Siege engines (and the artillery that replaces them)
// ---------------------------------------------------------------------------------------------------
function carriage(x: VCtx, W: number, L: number, r: number) {
  const P = x.P;
  wheels(x, W, [-L * 0.3, L * 0.3], r, 0.8, x.e <= 3 ? 'spoke' : 'tyre');
  const y0 = r * 1.1;
  for (const s of [-1, 1]) box(x, s * W / 2 - 0.5, -L / 2, s * W / 2 + 0.5, L / 2, y0, y0 + 1.2, x.e <= 2 ? P.wood : x.P.mil2, x.e <= 2 ? P.wood : x.P.mil2);
  box(x, -W / 2, -L / 2, W / 2, -L / 2 + 1, y0, y0 + 1.2, P.wood, P.wood);
  box(x, -W / 2, L / 2 - 1, W / 2, L / 2, y0, y0 + 1.2, P.wood, P.wood);
  return y0 + 1.2;
}
/** a thrown stone following its arc after release */
function stone(x: VCtx, from: V3, age: number, big = 1.4) {
  if (age < 0) return;
  const d = age * 110, h = from[1] + age * 60 - age * age * 120;
  x.D.ell([from[0], h, from[2] + d], big, big, x.K.stone, 1e5, { g: x.D.group() });
}
function ballista(x: VCtx) {
  const { e, P, D } = x;
  if (e >= 3) return fieldGun(x, 'small');
  const y = carriage(x, 6, 9, 2.2), age = shotAge(x);
  box(x, -0.8, -5, 0.8, 5, y + 1.5, y + 2.6, P.wood, P.wood2, 0.1); // stock
  const draw = x.anim === 'use' ? (x.t < 0.5 ? x.t * 2 : 0) : 0.2;
  for (const s of [-1, 1]) {
    D.cap([s * 0.8, y + 2, 3.5], [s * 5.5, y + 2.2, 2 - draw], 0.6, 0.4, P.wood, D.depth([s * 3, y + 2, 3]) + 0.2);
    D.cap([s * 5.5, y + 2.2, 2 - draw], [0, y + 2.3, -2 - draw * 2.5], 0.2, 0.2, P.rope, D.depth([s * 2, y + 2, 0]) + 0.21);
  }
  D.cap([0, y + 1.5, -1], [0, y, -5], 0.5, 0.5, P.wood, D.depth([0, y, -3]));
  if (age < 0) D.cap([0, y + 2.9, -2 - draw * 2.5], [0, y + 2.9, 5], 0.35, 0.35, P.wood, D.depth([0, y + 3, 1]) + 0.3);
  shot(x, [0, y + 2.9, 5], [0, 0, 1], 'bolt');
}
function catapult(x: VCtx) {
  const { e, P, D } = x;
  if (e >= 3) return fieldGun(x, 'medium');
  const y = carriage(x, 9, 14, 2.6), age = shotAge(x);
  for (const s of [-1, 1]) D.cap([s * 3.5, y, 2], [s * 2.5, y + 7, 1], 0.7, 0.6, P.wood, D.depth([s * 3, y + 3, 1]));
  D.cap([-3, y + 7, 1], [3, y + 7, 1], 0.6, 0.6, P.wood, D.depth([0, y + 7, 1]) + 0.01);
  // the arm: cocked back, whips up against the crossbar, drops back while being rewound
  const ang = x.anim !== 'use' ? -0.95 : x.t < 0.5 ? -0.95 + (x.t / 0.5) * 0.15 : x.t < 0.6 ? -0.8 + ((x.t - 0.5) / 0.1) * 2.1 : 1.3 - ((x.t - 0.6) / 0.4) * 2.25;
  const piv: V3 = [0, y + 1.5, -2], tip: V3 = [0, piv[1] + Math.sin(Math.PI / 2 + ang) * 11, piv[2] + Math.cos(Math.PI / 2 + ang) * 11];
  D.cap(piv, tip, 0.8, 0.6, P.wood, D.depth([0, y + 4, 0]) + 0.1);
  D.ell(tip, 1.4, 0.9, P.hide, D.depth(tip) + 0.11, { g: D.group() });
  cyl(x, 0, -2, 1.6, y, y + 1.6, P.rope, P.wood);
  if (age < 0 || age > 0.45) D.ell([tip[0], tip[1] + 1, tip[2]], 1.2, 1.2, x.K.stone, D.depth(tip) + 0.12, { g: D.group() });
  else stone(x, [0, y + 12, 2], age);
}
function trebuchet(x: VCtx) {
  const { e, P, D } = x;
  if (e >= 3) return fieldGun(x, 'large');
  const y = carriage(x, 12, 20, 2.8);
  for (const s of [-1, 1]) { D.cap([s * 5, y, 7], [s * 1.2, y + 20, 0], 0.9, 0.7, P.wood, D.depth([s * 3, y + 10, 3])); D.cap([s * 5, y, -7], [s * 1.2, y + 20, 0], 0.9, 0.7, P.wood, D.depth([s * 3, y + 10, -3])); }
  D.cap([-1.5, y + 20, 0], [1.5, y + 20, 0], 0.8, 0.8, P.wood, D.depth([0, y + 20, 0]) + 0.01);
  const ang = x.anim !== 'use' ? -0.8 : x.t < 0.45 ? -0.8 : x.t < 0.6 ? -0.8 + ((x.t - 0.45) / 0.15) * 2.4 : 1.6 - ((x.t - 0.6) / 0.4) * 2.4;
  const piv: V3 = [0, y + 20, 0], L1 = 24, L2 = 7;
  const tip: V3 = [0, piv[1] + Math.sin(ang) * L1, piv[2] - Math.cos(ang) * L1], cw: V3 = [0, piv[1] - Math.sin(ang) * L2, piv[2] + Math.cos(ang) * L2];
  D.cap(cw, tip, 1, 0.6, P.wood, D.depth(piv) + 0.1);
  box(x, -2.5, cw[2] - 2.5, 2.5, cw[2] + 2.5, cw[1] - 6, cw[1] - 1, P.wood2, P.wood2, 0.2); // counterweight box
  const sling: V3 = [0, tip[1] - 5, tip[2] - 1];
  D.cap(tip, sling, 0.2, 0.2, P.rope, D.depth(tip) + 0.11);
  const age = shotAge(x);
  if (age < 0.1) D.ell(sling, 1.6, 1.6, x.K.stone, D.depth(sling) + 0.12, { g: D.group() }); else stone(x, [0, y + 30, 6], age - 0.1, 2);
}
function ram(x: VCtx) {
  const { e, P, D } = x;
  if (e === 0) { // a log carried on rope loops from a frame on sledge runners
    for (const s of [-1, 1]) D.cap([s * 3, 0.5, -8], [s * 3, 0.5, 8], 0.6, 0.6, P.wood, D.depth([s * 3, 0.5, 0]));
    for (const f of [-5, 5]) for (const s of [-1, 1]) D.cap([s * 3, 0.5, f], [0, 7, f], 0.5, 0.4, P.wood, D.depth([s, 4, f]));
    const sw = x.anim === 'use' ? Math.sin(x.ph) * 2.5 : 0;
    D.cap([0, 3.5, -9 + sw], [0, 3.5, 11 + sw], 1.3, 1.1, x.K.trunk, D.depth([0, 3.5, 0]) + 0.1);
    for (const f of [-5, 5]) D.cap([0, 7, f], [0, 3.8, f + sw], 0.2, 0.2, P.rope, D.depth([0, 5, f]) + 0.11);
    return;
  }
  const W = 9, L = 18, y = carriage(x, W, L, 2.4);
  const v = { kind: 'prism' as const, ring: [[-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]] as Pt[], top: [[-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]] as Pt[], y0: y + 6, y1: y + 6, key: D.depth([0, y + 7, 0]) + 0.2 };
  for (const f of [-L / 2 + 1, L / 2 - 1]) for (const s of [-1, 1]) D.cap([s * W / 2, y, f], [s * W / 2, y + 6, f], 0.5, 0.5, P.wood, D.depth([s * W / 2, y + 3, f]));
  roofOn(x, v, 'gable', e === 3 ? x.K.iron : P.hide, P.hide, { over: 0.5, alongF: true, pitch: 0.8 });
  const sw = x.anim === 'use' ? Math.max(0, Math.sin(x.ph)) * 4 : 0;
  D.cap([0, y + 3, -L / 2 - 1 + sw], [0, y + 3, L / 2 + 3 + sw], 1.3, 1.2, x.K.trunk, D.depth([0, y + 3, 0]) + 0.1);
  cyl(x, 0, L / 2 + 3 + sw, 1.6, y + 1.6, y + 4.4, x.K.iron, x.K.iron);
  if (e === 3) exhaust(x, [0, y + 12, -L / 4], 'steam', 1.4);
}
function siegeTower(x: VCtx) {
  const { e, P, D } = x;
  if (e >= 3) return fieldGun(x, 'large');
  const W = 12, L = 12, r = 2.6;
  wheels(x, W, [-L * 0.3, L * 0.3], r, 1, 'solid');
  const y = r * 1.2, H = 36;
  const v = prism(x, [[-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]], y, y + H, P.hide, P.wood2, { topRing: [[-W * 0.4, L * 0.4], [W * 0.4, L * 0.4], [W * 0.4, -L * 0.4], [-W * 0.4, -L * 0.4]] });
  void v;
  for (let i = 1; i < 5; i++) box(x, -W / 2 - 0.3, L / 2 - 0.2 - (i * 0.2), W / 2 + 0.3, L / 2 + 0.3 - i * 0.2, y + (H * i) / 5 - 0.5, y + (H * i) / 5 + 0.5, P.wood, P.wood, 0.05);
  const drop = x.anim === 'use' ? Math.min(1, x.t * 2) : 0; // the bridge falls onto the wall
  const hinge: V3 = [0, y + H - 4, L * 0.42];
  const end: V3 = [0, hinge[1] + Math.cos(drop * Math.PI / 2) * 8, hinge[2] + Math.sin(drop * Math.PI / 2) * 8];
  facet(x, [[-4, hinge[1], hinge[2]], [4, hinge[1], hinge[2]], [4, end[1], end[2]], [-4, end[1], end[2]]], P.wood2, D.depth(hinge) + 0.2, D.group(), null, true);
  flag(x, [W * 0.3, y + H, 0], 7, 5, x.body);
}
/** artillery from the industrial era on: field gun (small), howitzer / rocket launcher (medium), rail or plasma siege gun (large) */
function fieldGun(x: VCtx, tier: 'small' | 'medium' | 'large') {
  const { e, P, D } = x, big = tier === 'large' ? 1.8 : tier === 'medium' ? 1.35 : 1;
  if (e >= 5 && tier === 'medium') { // rocket launcher truck
    const W = 9, L = 22, y0 = gear(x, e >= 6 ? locoFor(x, true) : 'wheels', W, L, 3, 2.6);
    hullBox(x, W, 7, y0, y0 + 6.5, P.mil, P.mil2, 0.25, 0.02, 0.9);
    D.poly([[-3.5, y0 + 4.5, 3.4], [3.5, y0 + 4.5, 3.4], [3.2, y0 + 6, 2], [-3.2, y0 + 6, 2]].map(([a, y, f]) => [a, y, f + L / 2 - 3.5] as V3), P.glass, D.depth([0, y0 + 5, L / 2]) + 0.2, { g: D.group(), flat: 0.6 });
    box(x, -W / 2, -L / 2, W / 2, L / 2 - 7.5, y0, y0 + 1.5, P.mil2, P.mil2);
    const el = x.anim === 'use' ? 0.55 : 0.2;
    const c: V3 = [0, y0 + 3.5, -L * 0.15], dir: V3 = [0, Math.sin(el), Math.cos(el)];
    const pts = (s: number, o: number): V3 => [s * 3.2, c[1] + dir[1] * o, c[2] + dir[2] * o];
    facet(x, [pts(-1, -6), pts(1, -6), pts(1, 6), pts(-1, 6)], P.mil2, D.depth(c) + 0.3, D.group(), null, true);
    for (let i = 0; i < 4; i++) shot(x, [(-1.5 + i) * 1.6, c[1] + dir[1] * 6 + i * 0.2, c[2] + dir[2] * 6], dir, 'rocket');
    return;
  }
  const W = 6 * big, L = 12 * big, y = e >= 6 ? gear(x, locoFor(x, true), W, L, 2, 2.4 * big) : carriage(x, W, L, 2.6 * big);
  if (e >= 6) hullBox(x, W, L, y, y + 3 * big, P.mil, P.mil2, 0.2, 0.1, 0.9);
  const el = tier === 'small' ? 0.08 : 0.5, recoil = shotAge(x) >= 0 && shotAge(x) < 0.15 ? -2 * big : 0;
  const piv: V3 = [0, y + 2.5 * big, 0], dir: V3 = [0, Math.sin(el), Math.cos(el)];
  const b0: V3 = [0, piv[1] + dir[1] * recoil, piv[2] + dir[2] * recoil - 2 * big], b1: V3 = [0, piv[1] + dir[1] * (13 * big + recoil), piv[2] + dir[2] * (13 * big + recoil)];
  D.cap(b0, b1, 1.3 * big, (e >= 6 ? 0.9 : 0.8) * big, e >= 6 ? P.metal : P.dark, D.depth(piv) + 0.2);
  if (e >= 6) D.cap(b0, b1, 0.4 * big, 0.3 * big, P.glow, D.depth(piv) + 0.21, { noLine: true });
  if (e >= 4 && tier !== 'large') box(x, -W * 0.6, 1, W * 0.6, 1.8, y, y + 6 * big, P.mil, P.mil2, 0.3); // gun shield
  for (const s of [-1, 1]) D.cap([s * W * 0.3, y, -L / 2], [s * W * 0.8, 0.3, -L / 2 - 7 * big], 0.5, 0.5, P.mil2, D.depth([s * W, 1, -L]));
  shot(x, b1, dir, e >= 7 ? 'plasma' : e >= 6 ? 'laser' : 'cannon');
}

// ---------------------------------------------------------------------------------------------------
// War vehicles
// ---------------------------------------------------------------------------------------------------
function chariot(x: VCtx) {
  const { e, P, D } = x;
  if (e <= 2) { // war cart: two spoked wheels, an open fighting platform, scythes on the hubs
    const W = 7, L = 7, r = 3;
    wheels(x, W, [0], r, 0.8, 'spoke');
    const y = r * 1.1;
    box(x, -W / 2, -L / 2, W / 2, L / 2, y, y + 0.8, P.wood2, P.wood2);
    const v = prism(x, [[-W / 2, L / 2], [W / 2, L / 2], [W / 2 * 0.9, -L / 4], [-W / 2 * 0.9, -L / 4]], y + 0.8, y + 4.5, x.body, P.wood, { topRing: [[-W / 2 * 0.9, L / 2 - 0.5], [W / 2 * 0.9, L / 2 - 0.5], [W / 2 * 0.8, -L / 4], [-W / 2 * 0.8, -L / 4]] });
    void v;
    D.cap([0, y, L / 2], [0, y - 0.4, L / 2 + 10], 0.5, 0.45, P.wood, D.depth([0, y, L]));
    x.hitch = [0, 0, L / 2 + 10];
    if (x.d[5] < 0.6) for (const s of [-1, 1]) D.cap([s * (W / 2 + 1.2), r, 0], [s * (W / 2 + 4.5), r - 0.5, 0], 0.4, 0.1, x.K.metal, D.depth([s * W, r, 0]) + 0.2);
    flag(x, [-W / 2 + 0.5, y + 4, -L / 4], 6, 4, x.body);
    return;
  }
  // light armoured car / scout: wheels, legs or hover; a machine gun or light turret on top
  const W = 8 * x.Z, L = 15 * x.Z, loco = locoFor(x, false, 'wheels');
  const y0 = gear(x, loco, W, L, x.size === 'large' ? 3 : 2, 2.6);
  const round = x.C.plan === 'round' || x.C.plan === 'pod';
  if (round || e >= 6) pod(x, W, L, 5.5, y0, x.body, 0, 0.6); else hullBox(x, W, L, y0, y0 + 5, x.body, x.body2, 0.3, 0.12, 0.88);
  const gun: Gun = e >= 7 ? 'laser' : e >= 6 ? 'plasma' : x.size === 'large' ? 'cannon' : 'mg';
  turret(x, 0, -L * 0.05, y0 + 5, 2.4, 2.2, gun, gun === 'mg' ? 6 : 9, x.body2);
  for (const s of [-1, 1]) lamp(x, [s * W * 0.35, y0 + 3, L / 2], x.K.glow, false, 0.5);
  if (e <= 5 && loco === 'wheels') exhaust(x, [-W * 0.35, y0 + 4, -L / 2], 'diesel', 0.9);
}
/** tanks and war walkers: a hull on tracks / legs / hover with a turret that turns on its own */
function tank(x: VCtx, heavy: boolean) {
  const { e, P, D } = x, Z = x.Z * (heavy ? 1.25 : 1);
  if (e === 3) { // landship: rhomboid hull wrapped in tracks, side sponsons, smoke stacks
    const W = 11 * Z, L = 24 * Z, R = 5 * Z;
    tracks(x, W * 0.7, L, R, 2.6 * Z);
    hullBox(x, W * 0.7, L * 0.8, R * 0.6, R * 2.1, P.mil, P.mil2, 0.1, 0.1, 0.95);
    for (const s of [-1, 1]) {
      box(x, s * W * 0.35, -L * 0.15, s * (W * 0.35 + 2.4 * Z), L * 0.15, R * 0.7, R * 1.8, P.mil2, P.mil2, 0.2);
      const b0: V3 = [s * (W * 0.35 + 1.4 * Z), R * 1.3, L * 0.1], b1: V3 = [s * (W * 0.35 + 1.4 * Z), R * 1.3, L * 0.1 + 7 * Z];
      D.cap(b0, b1, 0.7 * Z, 0.6 * Z, P.dark, D.depth(b0) + 0.3);
      shot(x, b1, [0, 0, 1], 'cannon');
    }
    if (heavy) turret(x, 0, 0, R * 2.1, 3 * Z, 2.4 * Z, 'cannon', 9 * Z, P.mil);
    exhaust(x, [0, R * 2.1 + 3, -L * 0.3], 'steam', 1.8);
    return;
  }
  if (e === 7 && !heavy || (e >= 6 && x.d[0] < 0.25 + x.C.params.exotic * 0.3)) return mech(x, heavy);
  const W = 10 * Z, L = 20 * Z, loco: 'tracks' | 'hover' = e >= 6 ? 'hover' : 'tracks';
  const y0 = gear(x, loco, W, L, 0, loco === 'tracks' ? 2.4 * Z : 2 * Z);
  const round = x.C.plan === 'round' || x.C.plan === 'pod';
  if (round) pod(x, W * 1.05, L, 5 * Z, y0 - 0.5, x.body, 0, 0.7); else hullBox(x, W, L, y0, y0 + 4.5 * Z, x.body, x.body2, e >= 5 ? 0.35 : 0.15, 0.1, e >= 5 ? 0.8 : 0.92);
  if (loco === 'tracks' && e >= 5) for (const s of [-1, 1]) box(x, s * W / 2 - (s > 0 ? 0 : 0.6), -L * 0.45, s * W / 2 + (s > 0 ? 0.6 : 0), L * 0.45, y0 - 1.5 * Z, y0 + 0.5, x.body2, x.body2, 0.05); // side skirts
  const gun: Gun = e >= 7 ? 'plasma' : e >= 6 ? 'laser' : heavy && x.d[6] < 0.4 ? 'twin' : 'cannon';
  const top = turret(x, 0, -L * 0.08, y0 + 4.5 * Z, (heavy ? 4.2 : 3.4) * Z, (heavy ? 3 : 2.6) * Z, gun, (heavy ? 15 : 12) * Z, x.body);
  if (e >= 5) turret(x, 1.2 * Z, -L * 0.15, top, 0.9 * Z, 0.9 * Z, 'mg', 3 * Z, x.body2, 1.3); // commander's MG, its own traverse
  if (heavy && e >= 4) turret(x, 0, L * 0.3, y0 + 4.5 * Z, 2 * Z, 1.6 * Z, 'mg', 5 * Z, x.body2, 2.1); // bow turret
  if (loco === 'tracks') exhaust(x, [W * 0.3, y0 + 4.5 * Z, -L / 2], 'diesel', 1.1);
  if (e >= 5) D.cap([-W * 0.3, y0 + 4.5 * Z, -L * 0.35], [-W * 0.3, y0 + 12 * Z, -L * 0.35], 0.2, 0.15, P.dark, D.depth([0, y0 + 8, -L * 0.35]) + 0.3);
}
/** war walkers: two legs (medium) or four (heavy), a cockpit pod and weapon arms */
function mech(x: VCtx, heavy: boolean) {
  const { P, D } = x, Z = x.Z * (heavy ? 1.3 : 1);
  const hip = 12 * Z, W = 8 * Z, L = 10 * Z;
  legs(x, W, heavy ? [L * 0.35, -L * 0.35] : [0], hip, hip, 1.3 * Z, P.metal, heavy && x.C.params.exotic > 0.4);
  const y = hip + (moving(x) ? Math.abs(Math.sin(x.ph)) * 0.8 : bob(x, 0.3));
  pod(x, W * 1.1, L * 1.3, 7 * Z, y - 1, x.body, 0.1, 0.8);
  canopy(x, L * 0.35, y + 4 * Z, W * 0.5, L * 0.4, 2 * Z, 0.2);
  for (const s of [-1, 1]) {
    const yaw = Math.sin(x.ph + s) * 0.3 * (x.anim === 'use' ? 0.2 : 1);
    const sh: V3 = [s * (W * 0.6 + 1), y + 4 * Z, 0], muzzle: V3 = [sh[0] + Math.sin(yaw) * 9 * Z, sh[1], sh[2] + Math.cos(yaw) * 9 * Z];
    D.ell(sh, 1.8 * Z, 1.8 * Z, x.body2, D.depth(sh) + 0.2, { g: D.group() });
    D.cap(sh, muzzle, 1.2 * Z, 0.8 * Z, P.metal, D.depth(sh) + 0.25);
    shot(x, muzzle, [Math.sin(yaw), 0, Math.cos(yaw)], x.e >= 7 ? 'plasma' : x.e >= 6 ? 'laser' : s > 0 ? 'cannon' : 'mg');
  }
  if (heavy) turret(x, 0, -L * 0.1, y + 7 * Z - 1, 3 * Z, 2 * Z, 'rockets', 7 * Z, x.body2);
  lamp(x, [0, y + 6 * Z, L * 0.55], P.glow, true, 0.8);
}
/** transformers: a car that stands up on legs (the 'use' animation morphs it) */
function transformer(x: VCtx) {
  const { P, D, e } = x, Z = x.Z, W = 8 * Z, L = 15 * Z;
  const m = x.anim === 'use' ? Math.min(1, Math.max(0, (x.t - 0.1) / 0.6)) : 0;  // 0 = vehicle, 1 = walker
  const wheelY = 2.4 * (1 - m), hip = 2.4 + m * 10 * Z;
  if (m < 0.95) wheels(x, W * (1 - m * 0.5), [-L * 0.32, L * 0.32], 2.4 * (1 - m * 0.3), 1.6, e >= 6 ? 'solid' : 'tyre');
  if (m > 0.05) legs(x, W * 0.7, [0], hip, hip, 1.2 * Z, P.metal);
  const y = Math.max(wheelY * 0.9, hip) + (m > 0.9 ? bob(x, 0.4) : 0);
  // the body pitches up as it stands, like a torso
  const pitch = m * 0.9, c: V3 = [0, y + 3, 0];
  const rot = (p: V3): V3 => { const dy = p[1] - c[1], df = p[2] - c[2]; return [p[0], c[1] + dy * Math.cos(pitch) + df * Math.sin(pitch), c[2] - dy * Math.sin(pitch) + df * Math.cos(pitch)]; };
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const f = -L / 2 + (L * i) / 6, rr = Math.sin(Math.PI * Math.min(1, (i / 6) * 1.05)) ** 0.5; for (let j = 0; j < 10; j++) { const t = (j / 10) * Math.PI * 2; pts.push(rot([Math.cos(t) * W / 2 * rr, y + 2.5 + Math.sin(t) * 2.8 * rr, f])); } }
  D.hull(pts, x.body, D.depth(c), { g: D.group(), flat: 0 });
  const g0 = rot([0, y + 5, L * 0.1]);
  D.ell(g0, 2.2, 1.4, P.glass, D.depth(g0) + 0.2, { g: D.group() });
  if (m > 0.6) for (const s of [-1, 1]) { const sh = rot([s * (W / 2 + 0.5), y + 3, L * 0.2]); D.cap(sh, [sh[0], sh[1] - 1, sh[2] + 7], 1, 0.7, P.metal, D.depth(sh) + 0.3); shot(x, [sh[0], sh[1] - 1, sh[2] + 7], [0, 0, 1], e >= 6 ? 'laser' : 'mg'); }
  lamp(x, rot([0, y + 3, L / 2]), P.glow, false, 0.7);
}

export const LAND = {
  cart, coach, ballista, catapult, trebuchet, ram, siegeTower, chariot,
  tank: (x: VCtx) => tank(x, false), heavy: (x: VCtx) => tank(x, true), transformer,
};
void fire; void pick; void frac; void cyl;
