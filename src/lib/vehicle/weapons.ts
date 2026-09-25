// Guns, turrets and what leaves a muzzle. A turret is a separate piece from the body: it turns on its own (sweeping,
// or to the commanded aim `x.aim`), is drawn under its own tag ('t<id>') so it can be exported as its own sprite, and
// every shot follows the barrel it leaves. Firing loops over the 8 frames:
//  - automatic weapons (machine guns, rotary cannons, autocannons, flamers) fire on every frame: alternating muzzle
//    flashes, streams of tracers, ejected casings, a shaking barrel;
//  - single shots (cannons, howitzers, bolts, rails, plasma) land on frame 4: recoil, blast, smoke ring, the shell
//    or bolt flying, drifting smoke (and dust kicked up for guns near the ground) on the frames after;
//  - energy weapons charge on frames 2-3 first; rockets ripple out of their tubes on frames 4-7.
import type { Mat } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { prism, Pt } from '../structure/parts';
import { VCtx, loft, dome, pod, transformed, yawFrame, frameOf, nrm, add, frac, lerp, circle, discFace, rod, light, Station } from './vparts';

export type GunKind = 'mg' | 'rotary' | 'auto' | 'cannon' | 'howitzer' | 'mortar' | 'rockets' | 'missile' | 'laser' | 'plasma' | 'rail' | 'flame' | 'bolt' | 'spike';
export type Muzzle = 'plain' | 'brake' | 'flash' | 'bulb' | 'fork' | 'bell' | 'cooling';
export interface Gun {
  kind: GunKind;
  /** barrels (tubes for rockets) */
  n?: number;
  len: number;
  /** calibre (barrel radius) */
  r: number;
  muzzle?: Muzzle;
  /** barrel elevation (radians, + up) */
  elev?: number;
  m?: Mat;
}
export type TurretShape = 'round' | 'box' | 'hex' | 'wedge' | 'cast' | 'dome' | 'bulb' | 'saucer' | 'open' | 'pintle' | 'casemate';
export interface Mount {
  id: number;
  a: number; f: number; y: number;
  /** ring radius and height of the turret body */
  R: number; H: number;
  shape: TurretShape;
  gun: Gun;
  m: Mat; m2?: Mat;
  /** rest direction relative to the hull (π = aft turrets) and how far it may turn from it */
  yaw0?: number; arc?: number;
  /** sweep phase / amplitude while idle or moving */
  phase?: number; sweep?: number;
  cupola?: boolean;
  /** a machine gun on the roof that turns on its own */
  roofGun?: boolean;
  /** smoke dischargers, stowage, antenna */
  kit?: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** the turret's yaw: commanded aim (clamped to its arc), holding on target while firing, or sweeping */
export function yawFor(x: VCtx, mt: { yaw0?: number; arc?: number; phase?: number; sweep?: number }) {
  const base = mt.yaw0 ?? 0, arc = mt.arc ?? Math.PI;
  if (x.aim !== null) { const d = Math.max(-arc, Math.min(arc, wrap(x.aim - base))); return base + d; }
  if (x.anim === 'use') return base + Math.sin(mt.phase ?? 0) * 0.1;
  return base + Math.sin(x.ph + (mt.phase ?? 0)) * (mt.sweep ?? 0.55);
}
const isAuto = (k: GunKind) => k === 'mg' || k === 'rotary' || k === 'auto' || k === 'flame';

/** barrel recoil along its axis (fraction of its length) on this frame */
export function recoil(x: VCtx, k: GunKind, i = 0) {
  if (x.anim !== 'use') return 0;
  const f = frameOf(x);
  if (isAuto(k)) return (f + i) % 2 ? -0.05 : 0.01;
  if (k === 'cannon' || k === 'howitzer' || k === 'rail' || k === 'mortar') return [0, 0, 0, 0, -0.3, -0.2, -0.1, -0.03][f];
  return 0;
}

// ---------------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------------
interface FxRef { key: number; depth: number; /** ground height in the current frame (turrets: minus their mount height) */ gy?: number }
/** effects in front of the gun are painted over everything; behind it, just under the gun */
function fk(x: VCtx, p: V3, ref: FxRef, add2 = 0) { return x.D.depth(p) >= ref.depth - 0.5 ? 2e4 + x.D.depth(p) + add2 : ref.key - 0.2 + add2 * 0.001; }
/** a star-shaped muzzle flash pointing along the shot */
export function flash(x: VCtx, p: V3, d: V3, size: number, ref: FxRef, spikes = 5, inner = true) {
  const D = x.D, a = D.P(p), b = D.P(add(p, d, 1)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), fwd = Math.min(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / (D.k || 1) + 0.35);
  const star = (s: number) => {
    const pts: number[] = [];
    const n = spikes * 2;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, spike = i % 2 === 0;
      const along = Math.cos(t), len = spike ? (along > 0.7 ? 2.2 * fwd + 0.6 : along < -0.7 ? 0.6 : 1.1) : 0.42;
      pts.push(Math.cos(t + ang) * s * len, Math.sin(t + ang) * s * len * 0.85);
    }
    return pts;
  };
  const c = add(p, d, size * 0.6);
  D.shape(c, star(size), x.P.fire, fk(x, c, ref), { g: D.group(), noLine: true });
  if (inner) D.shape(c, star(size * 0.55), x.P.flash, fk(x, c, ref, 1), { g: D.group(), noLine: true });
}
function puff(x: VCtx, p: V3, r: number, m: Mat, key: number) { if (r > 0.3) x.D.ell(p, r, r * 0.85, m, key, { g: x.D.group() }); }
function tracer(x: VCtx, p: V3, d: V3, dist: number, len: number, r: number, ref: FxRef, m?: Mat) {
  const a = add(p, d, dist), b = add(p, d, dist + len);
  x.D.cap(a, b, r * 0.6, r, m ?? x.P.tracer, fk(x, b, ref), { noLine: true });
}
function casings(x: VCtx, p: V3, d: V3, n: number, big: number, ref: FxRef) {
  const side = nrm([d[2], 0, -d[0]]);
  for (let j = 0; j < n; j++) {
    const k = frac(x.t * 2 + j / n), q: V3 = [p[0] + side[0] * (0.8 + k * 3), p[1] + 1.2 * k - k * k * 4, p[2] + side[2] * (0.8 + k * 3) - d[2] * 0.5];
    x.D.cap(q, [q[0] + 0.25 * big, q[1] + 0.15 * big, q[2]], 0.22 * big, 0.2 * big, x.P.brass, fk(x, q, ref), { noLine: true });
  }
}
function dustKick(x: VCtx, p: V3, d: V3, age: number, size: number, gy = 0) {
  if (p[1] - gy > 16 || age < 0 || false) return;
  for (let j = 0; j < 4; j++) {
    const k = age + j * 0.07, q: V3 = [p[0] + d[0] * (2 + j * 1.5) + Math.sin(j * 2.3) * 2, gy + 0.4 + k * 1.5, p[2] + d[2] * (2 + j * 1.5) + Math.cos(j * 2.3) * 2];
    const r = size * (0.8 + k * 1.8) * (age > 0.8 ? (1 - age) * 5 : 1);
    if (r > 0.3) x.D.ell(q, r * 1.5, r * 0.6, { ...x.P.dust, alpha: 0.7 }, -800 + j, { g: x.D.group(), noLine: true });
  }
}
/** everything that leaves the muzzle `p` along `d` on this frame; `i` staggers multiple barrels */
/** set by ship builders: no dust kicked up over water */
let noDust = false;
export const setNoDust = (v: boolean) => { noDust = v; };
export function fire(x: VCtx, g: Gun, p: V3, d0: V3, ref: FxRef, i = 0) {
  if (x.anim !== 'use') return;
  const D = x.D, P = x.P, d = nrm(d0), f = frameOf(x), r = g.r;
  switch (g.kind) {
    case 'mg': case 'rotary': case 'auto': {
      const big = g.kind === 'auto' ? 1.8 : g.kind === 'rotary' ? 1.3 : 1;
      const on = g.kind === 'rotary' || (f + i) % 2 === 0;
      if (on) flash(x, p, d, (0.9 + ((f * 7 + i * 3) % 3) * 0.2) * big, ref, f % 2 ? 4 : 5);
      else flash(x, p, d, 0.45 * big, ref, 4, false);
      const nt = g.kind === 'rotary' ? 5 : 3;
      for (let j = 0; j < nt; j++) tracer(x, p, d, 3 + frac(x.t * 2 + j / nt + i * 0.13) * 46, 2.4 * big, 0.25 * big, ref);
      casings(x, p, d, g.kind === 'rotary' ? 3 : 2, big, ref);
      if (f % 4 === (i % 4)) puff(x, add(add(p, d, 1.5), [0, 0.8, 0]), 0.9 * big, { ...P.smoke, alpha: 0.6 }, fk(x, p, ref, -1));
      return;
    }
    case 'flame': {
      for (let j = 0; j < 7; j++) {
        const k = frac(j / 7 + x.t * 2), q = add(add(p, d, 1 + k * 16), [Math.sin(j * 1.7 + x.ph * 3) * k, k * k * 3, 0]);
        puff(x, q, (0.5 + k * 2.6) * (k > 0.85 ? (1 - k) * 6 : 1), k < 0.35 ? P.flash : k < 0.7 ? P.fire2 : P.fire, fk(x, q, ref, j));
        if (k > 0.75) puff(x, add(q, [0, 2.5, 0]), 1.6 * k, { ...P.soot, alpha: 0.7 }, 1e5 + j);
      }
      return;
    }
    case 'cannon': case 'howitzer': case 'mortar': {
      const big = Math.min(1.7, (g.kind === 'howitzer' ? 1.3 : g.kind === 'mortar' ? 1.1 : 1) * Math.max(0.7, Math.sqrt(r / 0.55)));
      if (f === 4) { flash(x, p, d, 2.2 * big, ref, 6); if (g.muzzle === 'brake') { const s = nrm([d[2], 0, -d[0]]); for (const q of [-1, 1]) flash(x, p, [s[0] * q, 0.1, s[2] * q], 0.9 * big, ref, 4, false); } }
      if (f === 5) flash(x, p, d, 1.1 * big, ref, 5);
      if (f >= 4) {
        const age = (f - 4) / 4;
        // smoke ring, then a cloud that drifts and grows
        for (let j = 0; j < 7; j++) {
          const t = (j / 7) * Math.PI * 2, rr = (0.9 + age * 2.6) * big, s = nrm([d[2], 0, -d[0]]);
          const q: V3 = [p[0] + d[0] * (1.5 + age * 5) + s[0] * Math.cos(t) * rr, p[1] + Math.sin(t) * rr * 0.8 + age * 3, p[2] + d[2] * (1.5 + age * 5) + s[2] * Math.cos(t) * rr];
          puff(x, q, (0.6 + age * 1.1) * big * (f === 7 ? 0.8 : 1), x.e <= 3 ? P.smoke : { ...P.smoke, alpha: 0.85 }, fk(x, q, ref, -2));
        }
        // the shell (a hot streak)
        if (f <= 5) tracer(x, p, d, 6 + (f - 4) * 30, 5, 0.45 * big, ref);
        if (!noDust) dustKick(x, p, d, age, 1.6 * big, ref.gy ?? 0);
      }
      return;
    }
    case 'rockets': case 'missile': {
      const n = g.kind === 'missile' ? 1 : Math.max(2, g.n ?? 4);
      for (let j = 0; j < Math.min(n, 4); j++) {
        const f0 = 4 + ((j + i) % 4);
        if (f < f0) continue;
        const age = f - f0 + 0.5, off: V3 = [((j % 2) - 0.5) * r * 2, (Math.floor(j / 2) - 0.5) * r * 2, 0];
        const q = add(add(add(p, off), d, age * (g.kind === 'missile' ? 9 : 13)), [0, age * age * (g.kind === 'missile' ? 1.4 : 0.5), 0]);
        D.cap(add(q, d, -2), q, r * 0.8, r * 0.6, P.steel, fk(x, q, ref, 3));
        D.ell(add(q, d, -2.6), r * 1.6, r * 1.1, P.flash, fk(x, q, ref, 4), { g: D.group(), noLine: true });
        for (let k = 0; k < 4; k++) puff(x, add(add(q, d, -4 - k * 3), [0, -k * 0.2, 0]), (0.7 + k * 0.45) * (g.kind === 'missile' ? 1.3 : 1), { ...P.smoke, alpha: 0.85 }, fk(x, q, ref, -k));
        if (f === f0) { flash(x, add(p, off), d, 1.2, ref, 4); puff(x, add(add(p, off), d, -3), 1.8, P.dust, fk(x, p, ref, -3)); }
      }
      return;
    }
    case 'laser': {
      if (f === 2 || f === 3) { const s = f === 2 ? 0.5 : 0.9; D.ell(p, r * 2.5 * s, r * 2.5 * s, P.glow, fk(x, p, ref, 1), { g: D.group() }); }
      if (f === 4 || f === 5 || f === 6) {
        const w = f === 6 ? 0.35 : 1;
        D.cap(p, add(p, d, 90), r * 1.4 * w, r * 1.1 * w, { ...P.glow, alpha: f === 6 ? 0.6 : 0.85 }, fk(x, add(p, d, 3), ref), { noLine: true });
        D.cap(p, add(p, d, 90), r * 0.5 * w, r * 0.4 * w, P.flash, fk(x, add(p, d, 3), ref, 1), { noLine: true });
        if (f === 4) D.ell(p, r * 3, r * 3, P.glow, fk(x, p, ref, 2), { g: D.group() });
      }
      return;
    }
    case 'plasma': {
      if (f === 2 || f === 3) { const s = f === 2 ? 0.6 : 1.1; D.ell(add(p, d, 0.6), r * 2.6 * s, r * 2.6 * s, { ...P.glow, alpha: 0.9 }, fk(x, p, ref, 1), { g: D.group() }); D.ell(add(p, d, 0.6), r * s, r * s, P.flash, fk(x, p, ref, 2), { g: D.group(), noLine: true }); }
      if (f >= 4) {
        const dist = 2 + (f - 4) * 16, q = add(p, d, dist), s = f === 4 ? 1.3 : 1;
        for (let k = 1; k <= 3; k++) D.ell(add(q, d, -k * 2.2), r * (2 - k * 0.45), r * (1.6 - k * 0.4), { ...P.glow, alpha: 0.7 - k * 0.15 }, fk(x, q, ref, -k), { g: D.group(), noLine: true });
        D.ell(q, r * 2.6 * s, r * 2.6 * s, P.glow, fk(x, q, ref, 1), { g: D.group() });
        D.ell(q, r * 1.1 * s, r * 1.1 * s, P.flash, fk(x, q, ref, 2), { g: D.group(), noLine: true });
        if (f === 4) D.ell(p, r * 3.2, r * 3.2, { ...P.glow, alpha: 0.6 }, fk(x, p, ref, 3), { g: D.group(), noLine: true });
      }
      return;
    }
    case 'rail': {
      if (f === 2 || f === 3) for (let k = 0; k < 4; k++) { const a = add(p, d, -g.len * (0.2 + k * 0.2)), b = add(a, [Math.sin(k * 3 + f) * r * 2, r * 2, 0]); D.cap(a, b, 0.18, 0.12, P.glow, fk(x, a, ref, k), { noLine: true }); }
      if (f === 4 || f === 5) {
        D.cap(p, add(p, d, f === 4 ? 80 : 60), r * (f === 4 ? 0.9 : 0.4), r * 0.2, P.flash, fk(x, add(p, d, 3), ref), { noLine: true });
        if (f === 4) flash(x, p, d, 1.8 * Math.max(0.7, r / 0.5), ref, 6);
        for (let k = 0; k < 5; k++) D.ell(add(add(p, d, 2 + k * 3), [Math.sin(k * 2.1) * 1.4, Math.cos(k * 1.3) * 1.2, 0]), 0.3, 0.3, P.glow, fk(x, p, ref, k), { g: D.group(), noLine: true });
      }
      return;
    }
    case 'bolt': case 'spike': {
      if (f >= 4) {
        const q = add(p, d, (f - 4) * 14 + 2), q2 = add(q, [0, -(f - 4) * (f - 4) * 0.3, 0]);
        D.cap(add(q2, d, -4), q2, 0.3, 0.3, g.kind === 'spike' ? P.bone : P.wood, fk(x, q2, ref, 1));
        D.shape(q2, [0, -0.6, 1.2, 0, 0, 0.6], g.kind === 'spike' ? P.bone : P.steel, fk(x, q2, ref, 2));
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Barrels
// ---------------------------------------------------------------------------------------------------
/** draw a gun's barrel(s) from `base` along the local direction and fire them; returns the muzzles.
 * Coordinates are in the current (possibly transformed) frame; `ref` decides what is behind / in front. */
export function barrels(x: VCtx, g: Gun, base: V3, dir: V3, ref: FxRef, spacing = 0) {
  const D = x.D, P = x.P, n = g.n ?? 1, d = nrm(dir), side = nrm([d[2], 0, -d[0]]), muzzles: V3[] = [];
  const m = g.m ?? (g.kind === 'laser' || g.kind === 'plasma' || g.kind === 'rail' ? P.steel : P.dark);
  if (g.kind === 'rockets' || g.kind === 'missile') {
    // a launcher box with the tube mouths (rockets visible until launched)
    const w = g.r * 2.6 * Math.min(2, n), h = g.r * 2.6 * Math.ceil(Math.min(n, 4) / 2);
    const c = add(base, d, g.len * 0.5), f = frameOf(x);
    D.cap(add(base, d, -g.len * 0.1), add(base, d, g.len), Math.max(w, h) * 0.55, Math.max(w, h) * 0.55, g.m ?? x.body2, D.depth(c) > ref.depth ? ref.key + 0.05 : ref.key - 0.05);
    const mouth = add(base, d, g.len);
    for (let j = 0; j < Math.min(n, 4); j++) {
      const off: V3 = [side[0] * ((j % 2) - 0.5) * g.r * 2.2, (Math.floor(j / 2) - 0.5) * g.r * 2.2 * (n > 2 ? 1 : 0), side[2] * ((j % 2) - 0.5) * g.r * 2.2];
      const q = add(mouth, off), gone = x.anim === 'use' && f >= 4 + ((j) % 4);
      if (D.facing(d) > 0) D.ell(add(q, d, 0.05), g.r * 0.8, g.r * 0.8, gone ? P.dark : g.kind === 'missile' ? P.paint2 : P.steel, D.depth(q) > ref.depth ? ref.key + 0.06 : ref.key - 0.04, { g: D.group(), noLine: true });
      muzzles.push(q);
    }
    fire(x, g, mouth, d, ref);
    return muzzles;
  }
  const spin = g.kind === 'rotary' && x.anim === 'use' ? x.t * Math.PI * 6 : 0;
  for (let i = 0; i < n; i++) {
    let off: V3 = [0, 0, 0];
    if (g.kind === 'rotary') { const t = spin + (i / n) * Math.PI * 2, rr = g.r * 1.2; off = [side[0] * Math.cos(t) * rr, Math.sin(t) * rr, side[2] * Math.cos(t) * rr]; }
    else if (n > 1) { const k = (i - (n - 1) / 2) * (spacing || g.r * 3.2); off = [side[0] * k, 0, side[2] * k]; }
    const rec = recoil(x, g.kind, i) * g.len;
    const b0 = add(base, off), b1 = add(b0, d, g.len + rec);
    const mid = add(b0, d, g.len * 0.5), key = D.depth(mid) > ref.depth ? ref.key + 0.03 + i * 0.001 : ref.key - 0.03 - i * 0.001;
    const r0 = g.kind === 'mg' || g.kind === 'rotary' ? g.r : g.r * 1.25;
    D.cap(b0, b1, r0, g.r, m, key);
    if (g.kind === 'laser' || g.kind === 'plasma') { D.cap(add(b0, d, g.len * 0.2), b1, g.r * 0.45, g.r * 0.4, P.glow, key + 0.0005, { noLine: true }); }
    if (g.kind === 'cannon' || g.kind === 'howitzer') { // bore evacuator / sleeve
      const q = add(b0, d, (g.len + rec) * 0.62); D.cap(add(q, d, -g.r * 1.2), add(q, d, g.r * 1.2), g.r * 1.45, g.r * 1.45, m, key + 0.0003);
    }
    // muzzle devices
    const mz = g.muzzle ?? 'plain';
    if (mz === 'brake') D.cap(add(b1, d, -g.r * 1.3), b1, g.r * 1.6, g.r * 1.6, m, key + 0.0006);
    else if (mz === 'flash') D.cap(add(b1, d, -g.r * 0.8), b1, g.r * 1.05, g.r * 1.35, m, key + 0.0006);
    else if (mz === 'bell') D.cap(add(b1, d, -g.r * 1.5), b1, g.r, g.r * 1.8, m, key + 0.0006);
    else if (mz === 'bulb') D.ell(b1, g.r * 1.7, g.r * 1.7, P.glow, key + 0.0006, { g: D.group() });
    else if (mz === 'cooling') D.cap(add(b0, d, g.len * 0.15), add(b0, d, g.len * 0.75), g.r * 1.7, g.r * 1.7, { ...m, tex: 'corrugated' }, key - 0.0002);
    else if (mz === 'fork') for (const q of [-1, 1]) D.cap(add(add(b1, [0, q * g.r * 1.2, 0]), d, -g.len * 0.4), add(b1, [0, q * g.r * 1.2, 0]), g.r * 0.5, g.r * 0.45, m, key + 0.0006);
    muzzles.push(b1);
    fire(x, g, b1, d, ref, i);
  }
  if (g.kind === 'rotary') D.ell(base, g.r * 2.2, g.r * 2.2, m, D.depth(base) > ref.depth ? ref.key + 0.035 : ref.key - 0.035, { g: D.group() });
  return muzzles;
}

// ---------------------------------------------------------------------------------------------------
// Turrets
// ---------------------------------------------------------------------------------------------------
/** turret body stations in the local frame (f forward, centred on 0) */
function bodyStations(mt: Mount): Station[] {
  const R = mt.R, H = mt.H;
  switch (mt.shape) {
    case 'box': return [{ f: R * 0.9, fb: R * 1.05, w: R * 0.9, bw: R * 0.9, tw: R * 0.72, wy: 0.2, y0: 0, y1: H }, { f: -R * 1.25, w: R * 0.9, bw: R * 0.9, tw: R * 0.78, wy: 0.2, y0: 0, y1: H }];
    case 'wedge': return [{ f: R * 1.3, fb: R * 1.1, w: R * 0.95, bw: R * 0.95, tw: R * 0.5, wy: 0.1, y0: 0, y1: H * 0.45 }, { f: R * 0.35, w: R * 0.95, bw: R, tw: R * 0.8, wy: 0.25, y0: 0, y1: H }, { f: -R * 1.2, w: R * 0.9, bw: R * 0.9, tw: R * 0.8, wy: 0.2, y0: 0, y1: H * 0.95 }];
    case 'casemate': return [{ f: R, fb: R * 1.2, w: R, bw: R, tw: R * 0.8, wy: 0, y0: 0, y1: H }, { f: -R, fb: -R * 1.1, w: R, bw: R, tw: R * 0.8, wy: 0, y0: 0, y1: H }];
    case 'saucer': return [0.95, 0.6, 0, -0.6, -0.95].map(k => ({ f: R * k * 1.2, w: Math.sqrt(1 - k * k) * R * 1.2 + 0.2, bw: Math.sqrt(1 - k * k) * R, tw: Math.sqrt(1 - k * k) * R * 0.6 + 0.1, wy: 0.3, y0: 0, y1: H * 0.7 }));
    default: { // round / cast: a rounded drum, a little longer at the back (bustle)
      const ks = [1, 0.7, 0.2, -0.4, -0.85, -1.15];
      return ks.map(k => { const c = Math.sqrt(Math.max(0.05, 1 - Math.min(1, Math.abs(k)) ** 2)); return { f: R * k, w: R * c + 0.1, bw: R * c, tw: R * c * (mt.shape === 'cast' ? 0.7 : 0.82) + 0.05, wy: 0.3, y0: 0, y1: H * (k > 0.5 ? 0.92 : 1) }; });
    }
  }
}
/** a turret with its gun(s), turning on its own; returns its top height, muzzles and yaw */
export function turret(x: VCtx, mt: Mount): { top: number; yaw: number; muzzles: V3[] } {
  const D = x.D, P = x.P, tag0 = D.tag, yaw = yawFor(x, mt), m2 = mt.m2 ?? P.dark;
  D.tag = `t${mt.id}`;
  x.pivots.push({ id: mt.id, p: [mt.a, mt.y, mt.f] });
  const fr = yawFrame(mt.a, mt.y, mt.f, yaw), R = mt.R, H = mt.H;
  let muzzles: V3[] = [];
  try {
    transformed(x, fr.T, fr.Tn, () => {
      const key0 = D.depth([0, H / 2, 0]) + 0.3, ref = { key: key0, depth: D.depth([0, H / 2, 0]), gy: -mt.y };
      // the ring the turret turns on
      if (mt.shape !== 'open' && mt.shape !== 'pintle') D.hull([...circle([0, 0, 0], R * 1.02, 'y', 16), ...circle([0, 0.35, 0], R * 1.02, 'y', 16)], P.dark, key0 - 0.02, { g: D.group(), flat: 0.4 });
      let gy = H * 0.5, gf = R * 0.9;
      switch (mt.shape) {
        case 'hex': case 'box': case 'wedge': case 'casemate': case 'round': case 'cast': case 'saucer':
          if (mt.shape === 'hex') {
            const ring: Pt[] = Array.from({ length: 6 }, (_, i) => { const t = (i / 6) * Math.PI * 2 + Math.PI / 6; return [Math.sin(t) * R * 1.05, Math.cos(t) * R * 1.05] as Pt; });
            prism(x, ring, 0, H, mt.m, mt.m, { topRing: ring.map(([a, f]) => [a * 0.8, f * 0.8] as Pt), bias: 0.3 });
          } else loft(x, bodyStations(mt), mt.m, { round: mt.shape === 'round' || mt.shape === 'cast' || mt.shape === 'saucer' ? 1 : 0, key: key0 });
          if (mt.shape === 'saucer') { gy = H * 0.35; light(x, [0, H * 0.72, 0], R * 0.3, P.glow, key0 + 0.01); }
          if (mt.shape === 'wedge') { gy = H * 0.6; gf = R * 0.5; }
          // mantlet where the barrels come out
          if (mt.gun.kind !== 'rockets' && mt.gun.kind !== 'missile') D.cap([0, gy, gf - R * 0.15], [0, gy, gf + R * 0.2], Math.max(mt.gun.r * 2.2, H * 0.3), Math.max(mt.gun.r * 1.8, H * 0.25), m2 === P.dark ? mt.m : m2, key0 + 0.01);
          break;
        case 'dome': dome(x, [0, 0, 0], R, R, H * 1.1, mt.m, key0); gy = H * 0.55; gf = R * 0.8; break;
        case 'bulb': pod(x, [0, H * 0.55, -R * 0.1], R * 2, R * 2.3, H * 1.2, mt.m, key0, 0.8, 1.2); for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI * 2; D.cap([Math.sin(t) * R * 0.8, H * 0.9, Math.cos(t) * R * 0.8 - R * 0.1], [Math.sin(t) * R * 1.2, H * 1.35, Math.cos(t) * R * 1.2 - R * 0.3], 0.35, 0.05, P.bone, key0 + 0.02, { noLine: true }); } gy = H * 0.5; break;
        case 'open': { // pedestal and a gun shield
          D.cap([0, 0, 0], [0, H * 0.55, 0], R * 0.3, R * 0.25, P.dark, key0 - 0.01);
          const sh = R * 1.1;
          const pts: V3[] = [[-sh, H * 0.2, R * 0.55], [sh, H * 0.2, R * 0.55], [sh * 0.8, H * 1.1, R * 0.4], [-sh * 0.8, H * 1.1, R * 0.4]];
          const front = D.depth([0, H * 0.6, R * 0.55]) > ref.depth;
          D.poly(pts, mt.m, front ? key0 + 0.02 : key0 - 0.05, { g: D.group(), flat: 0.85, dark: D.light([0, 0.2, 1]) });
          gy = H * 0.6; gf = R * 0.3; break;
        }
        case 'pintle': D.cap([0, 0, 0], [0, H * 0.7, 0], 0.25, 0.25, P.dark, key0 - 0.01); gy = H * 0.75; gf = 0; break;
      }
      // details on top: hatch, cupola, antenna, smoke dischargers, stowage basket
      if (mt.shape !== 'open' && mt.shape !== 'pintle' && mt.shape !== 'bulb') {
        const top = mt.shape === 'dome' ? H * 1.1 : mt.shape === 'saucer' ? H * 0.7 : H;
        if (mt.cupola) { D.hull([...circle([R * 0.35, top, -R * 0.35], R * 0.32, 'y', 10), ...circle([R * 0.35, top + R * 0.25, -R * 0.35], R * 0.28, 'y', 10)], m2 === P.dark ? mt.m : m2, key0 + 0.04, { g: D.group(), flat: 0.3 }); D.ell([R * 0.35, top + R * 0.3, -R * 0.35], R * 0.18, R * 0.08, P.glassDark, key0 + 0.045, { g: D.group(), noLine: true }); }
        else discFace(x, [-R * 0.3, top + 0.08, -R * 0.3], R * 0.22, 'y', m2 === P.dark ? mt.m : m2, key0 + 0.03, D.group(), 1, 10);
        if (mt.kit) {
          rod(x, [-R * 0.7, top, -R * 0.8], [-R * 0.75, top + R * 2.2, -R * 0.95], 0.1, P.dark, key0 + 0.05);
          for (const s of [-1, 1]) for (let k = 0; k < 3; k++) D.cap([s * R * 0.85, H * 0.65 + k * 0.35, R * 0.3], [s * R * 1.05, H * 0.75 + k * 0.35, R * 0.45], 0.22, 0.22, P.dark, key0 + (D.facing([s, 0, 0]) > 0 ? 0.05 : -0.05), { noLine: true });
          if (mt.shape !== 'dome' && mt.shape !== 'saucer') D.cap([-R * 0.6, H * 0.55, -R * 1.25], [R * 0.6, H * 0.55, -R * 1.25], H * 0.25, H * 0.25, P.canvas, key0 + (D.depth([0, H, -R * 1.2]) > ref.depth ? 0.05 : -0.05));
        }
        if (mt.roofGun) {
          const ry = yawFor(x, { phase: (mt.phase ?? 0) + 2.1, sweep: 1.1 }) - yaw;
          const rf = yawFrame(R * 0.35, top + R * 0.28, -R * 0.35, ry);
          transformed(x, rf.T, rf.Tn, () => {
            const rr = { key: key0 + 0.06, depth: D.depth([0, 0, 0]) };
            D.cap([0, 0, 0], [0, 0.6, 0], 0.18, 0.18, P.dark, rr.key - 0.01, { noLine: true });
            barrels(x, { kind: 'mg', len: R * 1.1, r: 0.18, muzzle: 'flash' }, [0, 0.7, 0.2], [0, 0.03, 1], rr);
          });
        }
      }
      // the gun(s)
      const el = mt.gun.elev ?? 0, dir: V3 = [0, Math.sin(el), Math.cos(el)];
      muzzles = barrels(x, mt.gun, [0, gy, gf], dir, ref, mt.gun.kind === 'mg' ? 0.5 : 0);
      muzzles = muzzles.map(fr.T);
    });
  } finally { D.tag = tag0; }
  const top = mt.shape === 'dome' ? mt.y + mt.H * 1.1 : mt.y + mt.H;
  return { top, yaw, muzzles };
}
/** a weapon on a fixed mount (bow guns, sponsons, wing guns, pods) that traverses a little */
export function fixedGun(x: VCtx, g: Gun, base: V3, yaw0: number, sweep = 0.25, phase = 0) {
  const D = x.D, yaw = yawFor(x, { yaw0, arc: 0.6, phase, sweep });
  const d: V3 = [Math.sin(yaw) * Math.cos(g.elev ?? 0), Math.sin(g.elev ?? 0), Math.cos(yaw) * Math.cos(g.elev ?? 0)];
  const ref = { key: D.depth(base), depth: D.depth(base) };
  D.ell(base, g.r * 2.2, g.r * 2.2, x.P.dark, ref.key, { g: D.group() });
  return barrels(x, g, base, d, ref);
}
export { lerp };
