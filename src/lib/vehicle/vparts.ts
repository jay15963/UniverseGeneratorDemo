// Vehicle vocabulary: wheels, tracks, mechanical legs, hover pads, hulls, turrets that turn on their own, guns
// with their shots, sails, oars, paddle wheels, propellers, rotors, wings and jets. Same flat 2D pieces as the
// structures (drafted per facing by draft.ts, painted by the creatures' rasterizer). Units: a citizen is ~9 tall;
// a = across (to the vehicle's right), y = up, f = forward (the nose points where the vehicle faces).
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { ring } from '../structure/draft';
import { Ctx, facet, prism, Pt, cyl, smoke } from '../structure/parts';

export type VAnim = 'idle' | 'move' | 'use';
export interface Pal {
  paint: Mat; paint2: Mat; mil: Mat; mil2: Mat; hull: Mat; metal: Mat; dark: Mat; tyre: Mat; glass: Mat; wood: Mat; wood2: Mat;
  sail: Mat; rope: Mat; glow: Mat; fire: Mat; fire2: Mat; smoke: Mat; soot: Mat; water: Mat; foam: Mat; brass: Mat; hide: Mat;
}
export interface VCtx extends Ctx {
  anim: VAnim;
  /** design numbers of this vehicle (fixed across eras, frames and facings) */
  d: number[];
  P: Pal;
  /** size multiplier of the tier */
  Z: number;
  /** war paint or civil paint for the body */
  body: Mat; body2: Mat;
  /** where the draught beasts are harnessed (set by pulled carts; the preview puts a placeholder animal there) */
  hitch?: V3;
}

export const frac = (v: number) => v - Math.floor(v);
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const moving = (x: VCtx) => x.anim === 'move';
/** 0..1 through the loop, only while firing (the shot lands on frames 4-5 of 8) */
export const shotAge = (x: VCtx) => (x.anim === 'use' && x.t >= 0.5 ? x.t - 0.5 : -1);

export function palette(x: Ctx): Pal {
  const K = x.K, C = x.C, alien = C.mode === 'alien', e = x.e, p = C.params;
  const cold = p.temperature < 0.35, dry = p.water < 0.35, wet = p.water > 0.65;
  // military paint follows the home ground: snow, sand, jungle, forest; alien worlds tint it with the culture hue
  const milH = alien ? C.hues[1] : cold ? 0.58 : dry ? 0.1 : wet ? 0.27 : 0.2;
  const milS = alien ? 0.35 : cold ? 0.06 : dry ? 0.35 : 0.28, milL = cold ? 0.78 : dry ? 0.58 : 0.34;
  const civH = alien ? C.hues[2] : [0.0, 0.58, 0.12, 0.33, 0.95, 0.08][Math.floor(C.r[70] * 6)];
  return {
    paint: { ramp: ramp(civH, alien ? 0.6 : 0.55, 0.47), tex: 'smooth', spec: e >= 4 ? 0.5 : 0.1 },
    paint2: { ramp: ramp(alien ? C.hues[0] : 0.12, 0.15, 0.85), tex: 'smooth', spec: 0.3 },
    mil: { ramp: ramp(milH, milS, milL), tex: e >= 6 ? 'panel' : 'smooth', spec: 0.15 },
    mil2: { ramp: ramp(milH + 0.02, milS * 0.8, milL * 0.78), tex: 'smooth', spec: 0.1 },
    hull: e <= 2 ? K.wood : e <= 4 ? K.iron : { ramp: ramp(alien ? C.hues[0] : 0.6, 0.08, 0.5), tex: 'panel', spec: 0.3 },
    metal: K.metal, dark: K.dark,
    tyre: { ramp: ramp(0.66, 0.08, 0.14), tex: 'smooth', spec: 0.2 },
    glass: { ramp: ramp(alien ? C.hues[2] : 0.56, 0.35, 0.5), tex: 'glass', spec: 0.8 },
    wood: K.wood, wood2: { ...K.wood, tex: 'plank' },
    sail: { ramp: ramp(alien ? C.hues[2] : 0.11, alien ? 0.4 : 0.18, 0.84), tex: 'cloth' },
    rope: K.rope, glow: K.glow2, fire: K.fire, fire2: K.fire2, smoke: K.smoke, soot: K.soot,
    water: K.water, foam: { ramp: ramp(0.55, 0.15, 0.92), tex: 'smooth', line: null },
    brass: K.gold, hide: { ramp: ramp(0.08, 0.35, 0.5), tex: 'hide' },
  };
}

// ---------------------------------------------------------------------------------------------------
// Running gear
// ---------------------------------------------------------------------------------------------------
/** a wheel with its axle across; spokes (old eras) or a hub pattern show it turning */
export function wheel(x: VCtx, a: number, f: number, r: number, w: number, side: number, spin: number, style: 'spoke' | 'solid' | 'tyre') {
  const D = x.D, g = D.group(), pts: V3[] = [];
  for (let i = 0; i < 18; i++) { const t = (i / 18) * Math.PI * 2; for (const s of [-1, 1]) pts.push([a + (s * w) / 2, r + Math.sin(t) * r, f + Math.cos(t) * r]); }
  const key = D.depth([a, r, f]);
  D.hull(pts, style === 'tyre' ? x.P.tyre : x.P.wood, key, { g, flat: 0.3 });
  const oa = a + (side * w) / 2 + side * 0.2, n: V3 = [side, 0, 0];
  if (D.facing(n) < 0.05) return;
  const hub = style === 'tyre' ? x.P.metal : x.P.wood;
  const face = (rr: number, m: Mat, b: number) => facet(x, Array.from({ length: 14 }, (_, i) => { const t = (i / 14) * Math.PI * 2; return [oa, r + Math.sin(t) * rr, f + Math.cos(t) * rr] as V3; }), m, key + b, D.group(), null, true);
  if (style === 'tyre') face(r * 0.62, hub, 0.01);
  else if (style === 'solid') face(r * 0.9, x.P.wood2, 0.01);
  const n2 = style === 'spoke' ? 8 : 5;
  for (let i = 0; i < n2; i++) {
    const t = spin + (i / n2) * Math.PI * 2;
    if (style === 'spoke') D.cap([oa, r, f], [oa, r + Math.sin(t) * r * 0.92, f + Math.cos(t) * r * 0.92], 0.35, 0.3, x.P.wood, key + 0.02);
    else D.ell([oa, r + Math.sin(t) * r * 0.36, f + Math.cos(t) * r * 0.36], 0.45, 0.45, x.P.dark, key + 0.02, { g: D.group(), noLine: true });
  }
  D.ell([oa, r, f], Math.max(0.6, r * 0.18), Math.max(0.6, r * 0.18), style === 'tyre' ? x.P.dark : x.P.metal, key + 0.03, { g: D.group() });
}
/** a row of wheels on both sides at the given f positions */
export function wheels(x: VCtx, W: number, fs: number[], r: number, w: number, style: 'spoke' | 'solid' | 'tyre') {
  const spin = moving(x) ? -x.ph * (style === 'spoke' ? 0.25 : 0.4) * 8 / 8 : 0;
  for (const s of [-1, 1]) for (const f of fs) wheel(x, s * (W / 2 + w / 2), f, r, w, s, spin, style);
}
/** caterpillar tracks: a band around road wheels with treads that crawl while moving */
export function tracks(x: VCtx, W: number, L: number, R: number, tw: number) {
  const D = x.D, off = moving(x) ? x.t * 2.2 : 0;
  for (const s of [-1, 1]) {
    const a = s * (W / 2 + tw / 2), pts: V3[] = [];
    for (const fe of [-L / 2 + R, L / 2 - R]) for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; for (const q of [-1, 1]) pts.push([a + (q * tw) / 2, R + Math.sin(t) * R, fe + Math.cos(t) * R]); }
    const key = D.depth([a, R, 0]);
    D.hull(pts, x.P.tyre, key, { g: D.group(), flat: 0.4 });
    const oa = a + s * (tw / 2 + 0.2);
    if (D.facing([s, 0, 0]) > 0.05) {
      const n = Math.max(3, Math.round(L / (R * 1.6)));
      for (let i = 0; i < n; i++) { const f = -L / 2 + R + ((L - 2 * R) * i) / (n - 1); facet(x, Array.from({ length: 10 }, (_, j) => { const t = (j / 10) * Math.PI * 2; return [oa, R + Math.sin(t) * R * 0.62, f + Math.cos(t) * R * 0.62] as V3; }), x.P.metal, key + 0.01, D.group(), null, true); D.ell([oa, R, f], 0.6, 0.6, x.P.dark, key + 0.02, { g: D.group() }); }
      // treads along the top run, crawling forward (and back along the bottom)
      const sp = 1.6, m = Math.floor((L - 2 * R) / sp);
      for (let i = 0; i < m; i++) { const f = -L / 2 + R + frac((i + off) / m) * (L - 2 * R); D.cap([oa, 2 * R, f], [oa, 2 * R - 0.3, f], 0.45, 0.45, x.P.dark, key + 0.015, { noLine: true }); }
    }
  }
}
/** mechanical legs: n pairs along f, stepping in a trot while moving, a gentle sway when idle */
export function legs(x: VCtx, W: number, fs: number[], hipY: number, reach: number, thick: number, m: Mat, insect = false) {
  const D = x.D;
  fs.forEach((f0, i) => {
    for (const s of [-1, 1]) {
      const phase = x.ph + (i % 2 ? Math.PI : 0) + (s > 0 ? Math.PI : 0);
      const step = moving(x) ? Math.sin(phase) * reach * 0.35 : 0, lift = moving(x) ? Math.max(0, Math.cos(phase)) * reach * 0.25 : 0;
      const hip: V3 = [s * W / 2, hipY, f0], foot: V3 = [s * (W / 2 + (insect ? reach * 0.6 : reach * 0.15)), lift, f0 + step];
      const knee: V3 = insect ? [s * (W / 2 + reach * 0.45), hipY + reach * 0.35, f0 + step * 0.5] : [s * (W / 2 + reach * 0.1), hipY * 0.5 + lift * 0.5, f0 + step * 0.5 + reach * 0.25];
      const key = D.depth(knee);
      D.cap(hip, knee, thick, thick * 0.85, m, key, { g: D.group() });
      D.cap(knee, foot, thick * 0.85, thick * 0.6, m, key + 0.001, { g: D.group() });
      D.ell(knee, thick * 1.1, thick * 1.1, x.P.dark, key + 0.002, { g: D.group() });
      D.ell([foot[0], foot[1] + thick * 0.4, foot[2]], thick * 1.2, thick * 0.6, x.P.dark, key + 0.003, { g: D.group() });
    }
  });
}
/** glowing hover pads (futurist / space): the vehicle bobs above them */
export function hoverPads(x: VCtx, W: number, L: number, y: number) {
  const D = x.D;
  for (const s of [-1, 1]) for (const f of [-L * 0.3, L * 0.3]) {
    D.ell([s * W * 0.35, y - 0.4, f], W * 0.22, 0.9, x.P.glow, D.depth([s * W * 0.35, y, f]) - 0.1, { g: D.group() });
    D.ell([s * W * 0.35, y * 0.4, f], W * 0.16 * (0.8 + 0.2 * Math.sin(x.ph * 2)), 0.6, { ...x.P.glow, alpha: 0.5, line: null }, -900, { g: D.group() });
  }
}
export const bob = (x: VCtx, amp: number) => Math.sin(x.ph) * amp;

// ---------------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------------
/** a box hull with a sloped nose and tail (taper < 1 narrows the top) */
export function hullBox(x: VCtx, W: number, L: number, y0: number, y1: number, side: Mat, top: Mat | null, nose = 0.25, tail = 0.1, taper = 0.9, bias = 0, cf = 0) {
  const hw = W / 2, hl = L / 2;
  const rg: Pt[] = [[-hw, cf + hl], [hw, cf + hl], [hw, cf - hl], [-hw, cf - hl]];
  const tp: Pt[] = [[-hw * taper, cf + hl - L * nose], [hw * taper, cf + hl - L * nose], [hw * taper, cf - hl + L * tail], [-hw * taper, cf - hl + L * tail]];
  return prism(x, rg, y0, y1, side, top, { topRing: tp, bias });
}
/** a rounded pod hull (culture 'round' / 'pod' plans, organic designs, aircraft) along f */
export function pod(x: VCtx, W: number, L: number, H: number, y0: number, m: Mat, bias = 0, nose = 1, cf = 0) {
  const D = x.D, pts: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8, f = cf - L / 2 + L * k, rr = Math.sin(Math.PI * Math.min(1, k * (1 + (1 - nose) * 0.5))) ** 0.55;
    for (let j = 0; j < 12; j++) { const t = (j / 12) * Math.PI * 2; pts.push([Math.cos(t) * (W / 2) * rr, y0 + H / 2 + Math.sin(t) * (H / 2) * rr, f]); }
  }
  D.hull(pts, m, D.depth([0, y0 + H / 2, cf]) + bias, { g: D.group(), flat: 0 });
}
/** a canopy / cockpit bubble */
export function canopy(x: VCtx, f: number, y: number, w: number, l: number, h: number, bias = 0.05) {
  const D = x.D, pts: V3[] = [];
  for (let i = 0; i <= 5; i++) { const k = i / 5; pts.push(...ring(0, f, y + Math.sin((k * Math.PI) / 2) * h, 1, 12).map(([a, yy, ff]) => [a * Math.cos((k * Math.PI) / 2) * w / 2, yy, f + (ff - f) * Math.cos((k * Math.PI) / 2) * l / 2] as V3)); }
  D.hull(pts, x.P.glass, D.depth([0, y, f]) + bias, { g: D.group(), flat: 0.1 });
}

// ---------------------------------------------------------------------------------------------------
// Turrets & weapons
// ---------------------------------------------------------------------------------------------------
/** rotate [a, y, f] around the vertical axis through (ca, cf) */
export const yawAt = (p: V3, ca: number, cf: number, ang: number): V3 => {
  const c = Math.cos(ang), s = Math.sin(ang), da = p[0] - ca, df = p[2] - cf;
  return [ca + da * c + df * s, p[1], cf - da * s + df * c];
};
/** turret aim: sweeps while idle or moving, swings onto the target and holds while firing */
export function turretYaw(x: VCtx, amp = 0.7, off = 0) {
  if (x.anim === 'use') return Math.sin(off) * 0.15;
  return Math.sin(x.ph + off) * amp;
}
export type Gun = 'cannon' | 'mg' | 'rockets' | 'laser' | 'plasma' | 'twin';
/** a gun turret that turns on its own: ring of plates (the culture's plan) + barrel(s) with their shots */
export function turret(x: VCtx, ca: number, cf: number, y: number, R: number, H: number, gun: Gun, len: number, m: Mat, off = 0, yaw0 = 0) {
  const D = x.D, yaw = yaw0 + turretYaw(x, 0.7, off), n = x.C.plan === 'round' || x.C.plan === 'pod' ? 12 : x.C.plan === 'hex' ? 6 : x.C.plan === 'oct' ? 8 : 5;
  const base: Pt[] = Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2 + (n === 5 ? Math.PI / 5 : 0); return [ca + Math.sin(t) * R, cf + Math.cos(t) * R * (n === 5 ? 1.15 : 1)] as Pt; });
  const rot = (p: Pt): Pt => { const q = yawAt([p[0], 0, p[1]], ca, cf, yaw); return [q[0], q[2]]; };
  const rg = base.map(rot), tp = base.map(([a, f]) => rot([ca + (a - ca) * 0.8, cf + (f - cf) * 0.8]));
  prism(x, rg, y, y + H, m, m, { topRing: tp, bias: 0.3 });
  const fwd = yawAt([ca, 0, cf + 1], ca, cf, yaw), dir: V3 = [fwd[0] - ca, 0, fwd[2] - cf];
  const muzzle = (side: number): [V3, V3] => {
    const across: V3 = [dir[2], 0, -dir[0]];
    const recoil = shotAge(x) >= 0 && shotAge(x) < 0.15 ? -len * 0.15 : 0;
    const b0: V3 = [ca + dir[0] * R * 0.7 + across[0] * side, y + H * 0.55, cf + dir[2] * R * 0.7 + across[2] * side];
    return [b0, [b0[0] + dir[0] * (len + recoil), b0[1] + 0.3, b0[2] + dir[2] * (len + recoil)]];
  };
  const barrels = gun === 'twin' ? [-R * 0.25, R * 0.25] : [0];
  for (const s of barrels) {
    const [b0, b1] = muzzle(s);
    if (gun === 'rockets') {
      for (const q of [-1, 1]) { const o: V3 = [dir[2] * q * R * 0.55, 0, -dir[0] * q * R * 0.55]; D.cap([b0[0] + o[0], b0[1] + 0.6, b0[2] + o[2]], [b0[0] + o[0] + dir[0] * len * 0.5, b0[1] + 0.9, b0[2] + o[2] + dir[2] * len * 0.5], H * 0.45, H * 0.45, x.P.mil2, D.depth(b0) + 0.4); }
      shot(x, [b0[0] + dir[0] * len * 0.5, b0[1] + 0.8, b0[2] + dir[2] * len * 0.5], dir, 'rocket');
      continue;
    }
    const rr = gun === 'mg' ? 0.35 : Math.max(0.5, H * 0.18);
    D.cap(b0, b1, rr * 1.2, rr, gun === 'laser' || gun === 'plasma' ? x.P.metal : x.P.dark, D.depth(b0) + 0.4);
    if (gun === 'laser' || gun === 'plasma') D.cap(b0, b1, rr * 0.4, rr * 0.3, x.P.glow, D.depth(b0) + 0.41, { noLine: true });
    shot(x, b1, dir, gun === 'twin' ? 'cannon' : gun);
  }
  return y + H;
}
/** what leaves a muzzle while firing: flash + smoke (cannons), rapid flashes (MGs), a rocket, a beam or a plasma ball */
export function shot(x: VCtx, p: V3, dir0: V3, kind: Gun | 'rocket' | 'stone' | 'bolt' | 'broadside') {
  const age = shotAge(x);
  if (age < 0) return;
  const D = x.D, dir = nrm(dir0), key = 1e5;
  const flash = (s: number) => {
    D.ell([p[0] + dir[0] * s * 0.8, p[1], p[2] + dir[2] * s * 0.8], s, s * 0.7, x.P.fire, key, { g: D.group(), noLine: true });
    D.ell([p[0] + dir[0] * s * 0.5, p[1], p[2] + dir[2] * s * 0.5], s * 0.55, s * 0.45, x.P.fire2, key + 1, { g: D.group(), noLine: true });
  };
  switch (kind) {
    case 'cannon': case 'broadside': {
      if (age < 0.13) flash(kind === 'broadside' ? 2.2 : 2.6);
      for (let i = 0; i < 4; i++) { const k = age * 2 + i * 0.12; D.ell([p[0] + dir[0] * (2 + k * 8 + i), p[1] + k * 5, p[2] + dir[2] * (2 + k * 8 + i)], 1.2 + k * 5, (1.2 + k * 5) * 0.8, x.e <= 3 ? x.P.smoke : x.P.soot, key - 1 - i, { g: D.group() }); }
      const d = 4 + age * 90; D.ell([p[0] + dir[0] * d, p[1] + 0.5, p[2] + dir[2] * d], 0.7, 0.7, x.P.dark, key + 2, { g: D.group() });
      return;
    }
    case 'mg': case 'twin': if (Math.floor(x.t * 16) % 2 === 0) flash(1.2); return;
    case 'rocket': {
      const d = age * 70; const q: V3 = [p[0] + dir[0] * d, p[1] + age * 8, p[2] + dir[2] * d];
      D.cap([q[0] - dir[0] * 2, q[1], q[2] - dir[2] * 2], q, 0.6, 0.5, x.P.metal, key + 2);
      D.ell([q[0] - dir[0] * 2.8, q[1], q[2] - dir[2] * 2.8], 1.1, 0.8, x.P.fire2, key + 3, { g: D.group(), noLine: true });
      for (let i = 0; i < 4; i++) D.ell([q[0] - dir[0] * (4 + i * 3), q[1] - i * 0.2, q[2] - dir[2] * (4 + i * 3)], 0.9 + i * 0.5, 0.8 + i * 0.4, x.P.smoke, key - i, { g: D.group() });
      return;
    }
    case 'laser': if (age < 0.25) { D.cap(p, [p[0] + dir[0] * 60, p[1], p[2] + dir[2] * 60], 0.7, 0.5, x.P.glow, key, { noLine: true }); D.ell(p, 1.6, 1.6, x.P.glow, key + 1, { g: D.group() }); } return;
    case 'plasma': { const d = 3 + age * 80; D.ell([p[0] + dir[0] * d, p[1], p[2] + dir[2] * d], 1.6, 1.6, x.P.glow, key, { g: D.group() }); if (age < 0.12) D.ell(p, 2.2, 2.2, x.P.glow, key + 1, { g: D.group() }); return; }
    case 'bolt': { const d = 2 + age * 90; D.cap([p[0] + dir[0] * d, p[1], p[2] + dir[2] * d], [p[0] + dir[0] * (d + 5), p[1], p[2] + dir[2] * (d + 5)], 0.4, 0.4, x.P.wood, key); return; }
    case 'stone': return;
  }
}
/** exhaust: smoke from a stack (steam / diesel) or a jet flame */
export function exhaust(x: VCtx, p: V3, kind: 'steam' | 'diesel' | 'jet' | 'glow', size = 1.4, dir: V3 = [0, 0, -1]) {
  const D = x.D;
  if (kind === 'steam' || kind === 'diesel') { smoke(x, p, size * (moving(x) ? 1.2 : 0.8), kind === 'steam' ? x.P.smoke : x.P.soot, 4, 14); return; }
  const fl = 1 + Math.sin(x.ph * 4) * 0.15, key = D.depth(p) + 0.2, d = nrm(dir);
  if (kind === 'jet') {
    D.ell([p[0] + d[0] * size * fl, p[1], p[2] + d[2] * size * fl], size * 1.4 * fl, size * 0.7, x.P.fire, key, { g: D.group(), noLine: true });
    D.ell([p[0] + d[0] * size * 0.5, p[1], p[2] + d[2] * size * 0.5], size * 0.7, size * 0.5, x.P.fire2, key + 0.01, { g: D.group(), noLine: true });
  } else D.ell(p, size * fl, size * fl * 0.7, x.P.glow, key, { g: D.group(), noLine: true });
}

// ---------------------------------------------------------------------------------------------------
// Water & air
// ---------------------------------------------------------------------------------------------------
/** the water line around a hull and, while moving, a bow wave and a wake */
export function wake(x: VCtx, W: number, L: number) {
  const D = x.D, mv = moving(x);
  const pts: V3[] = [];
  for (let i = 0; i < 20; i++) { const t = (i / 20) * Math.PI * 2; pts.push([Math.cos(t) * W * 0.62, 0.1, Math.sin(t) * L * 0.52]); }
  D.poly(pts, { ...x.P.foam, alpha: 0.55 }, -950, { g: D.group(), flat: 0.9 });
  if (!mv) return;
  for (let i = 0; i < 6; i++) { const k = frac(x.t + i / 6); for (const s of [-1, 1]) D.ell([s * (W * 0.5 + k * W * 0.9), 0.15, -L * 0.45 - k * L * 0.5], 1.4 + k * 2, 0.6, x.P.foam, -940 + i, { g: D.group(), noLine: true }); }
  for (const s of [-1, 1]) D.ell([s * W * 0.4, 0.2, L * 0.48], 1.6, 0.7, x.P.foam, -930, { g: D.group(), noLine: true });
}
/** a propeller spinning in the plane across `axis` (blur disc + two blades) */
export function propeller(x: VCtx, c: V3, R: number, axis: 'f' | 'y' = 'f', on = true) {
  const D = x.D, spin = on ? x.ph * 3 : 0.5, key = D.depth(c) + 0.3;
  const at = (t: number, rr: number): V3 => (axis === 'f' ? [c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr, c[2]] : [c[0] + Math.cos(t) * rr, c[1], c[2] + Math.sin(t) * rr]);
  const pts: V3[] = Array.from({ length: 14 }, (_, i) => at((i / 14) * Math.PI * 2, R));
  if (on) D.poly(pts, { ...x.P.metal, alpha: 0.3, line: null }, key, { g: D.group(), flat: 0.8 });
  for (let i = 0; i < 2; i++) D.cap(c, at(spin + i * Math.PI, R), 0.6, 0.35, x.P.dark, key + 0.01);
  D.ell(c, 0.8, 0.8, x.P.metal, key + 0.02, { g: D.group() });
}
/** helicopter rotor: long blades turning above the hub */
export function rotor(x: VCtx, c: V3, R: number, n = 4, on = true) {
  const D = x.D, spin = on ? x.ph * 2 : 0.3, key = 1e4;
  for (let i = 0; i < n; i++) { const t = spin + (i / n) * Math.PI * 2; D.cap(c, [c[0] + Math.cos(t) * R, c[1], c[2] + Math.sin(t) * R], 0.5, 0.4, x.P.dark, key); }
  if (on) D.poly(Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return [c[0] + Math.cos(t) * R, c[1] - 0.1, c[2] + Math.sin(t) * R] as V3; }), { ...x.P.metal, alpha: 0.15, line: null }, key - 1, { g: D.group(), flat: 0.9 });
  cyl(x, c[0], c[2], 0.7, c[1] - 2, c[1], x.P.dark, x.P.dark);
}
/** a flat wing (or fin) through the given outline in the horizontal (or vertical) plane, with a leading-edge bar */
export function wing(x: VCtx, pts: V3[], m: Mat) {
  const D = x.D, key = D.depth(pts[0]) * 0.5 + D.depth(pts[Math.floor(pts.length / 2)]) * 0.5;
  facet(x, pts, m, key, D.group(), null, true);
  D.cap(pts[0], pts[1], 0.45, 0.35, m, key + 0.001, { noLine: true });
}
