// Aircraft, built from modules (from the industrial era on): lift (gas envelope, wings, rotors, ducted fans, flapping
// wings, anti-gravity), a fuselage (tube, pod, flying-boat hull, blended body), a wing planform (straight, tapered,
// elliptic, swept, delta, forward-swept, gull, bat, biplane, triplane) placed high, mid or low, a tail (conventional,
// T, twin, V, canard, none), engines (nose or wing propellers, pushers, jet pods, fans, glowing thrusters), landing
// gear and weapons (nose and wing guns, gunner turrets that turn on their own, rockets, missiles, bombs, beams).
// 'idle' = parked on the ground (props still), 'move' = flying (banking a little, shadow on the ground),
// 'use' = flying and firing / bombing.
import type { Mat } from '../creature/raster';
import type { V3 } from '../structure/draft';
import {
  VCtx, Station, loft, pod, dome, plate, propeller, rotor, exhaust, outlineShadow, groundShadow, transformed, wheel, legs,
  at, up, pick, light, rod, frameOf, acting, moving, smooth, lerp, circle, banner, pitchFrame,
} from './vparts';
import { turret, fixedGun, barrels, Gun } from './weapons';

const tier = (x: VCtx) => (x.size === 'large' ? 2 : x.size === 'medium' ? 1 : 0);
const flying = (x: VCtx) => x.anim !== 'idle';
/** a frame rolled by `roll` around the fuselage axis at height cy */
function rollFrame(cy: number, roll: number) {
  const c = Math.cos(roll), s = Math.sin(roll);
  return { T: (p: V3): V3 => [p[0] * c - (p[1] - cy) * s, cy + p[0] * s + (p[1] - cy) * c, p[2]], Tn: (n: V3): V3 => [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]] };
}
/** fly: the airframe at cruising height, banking gently; parked: on its gear */
function airborne(x: VCtx, alt: number, park: number, fn: (y: number) => void) {
  const y = flying(x) ? alt + Math.sin(x.ph) * 0.6 : park;
  const r = flying(x) ? rollFrame(y, Math.sin(x.ph) * 0.07) : null;
  if (r) transformed(x, r.T, r.Tn, () => fn(y)); else fn(y);
  return y;
}

// ---------------------------------------------------------------------------------------------------
// Airframe modules
// ---------------------------------------------------------------------------------------------------
type Body = 'tube' | 'pod' | 'boat' | 'blended' | 'insect';
/** a fuselage along f with its axis at y; returns its stations */
function fuselage(x: VCtx, L: number, R: number, y: number, m: Mat, body: Body, nose = 0.5, belly?: Mat): Station[] {
  const ks = [1, 0.92, 0.78, 0.5, 0.2, -0.1, -0.4, -0.65, -0.85, -1];
  const st: Station[] = ks.map(k => {
    let w: number, lift = 0;
    if (k > 0.5) w = Math.pow(Math.max(0.02, 1 - Math.pow((k - 0.5) / 0.5, 1.4 + nose * 1.6)), 0.55);
    else if (k < -0.1) { const t = (-0.1 - k) / 0.9; w = lerp(1, body === 'pod' ? 0.15 : 0.22, Math.pow(t, body === 'pod' ? 0.8 : 1.3)); lift = t * t * R * 0.6; }
    else w = 1;
    if (body === 'insect') w *= 0.75 + 0.25 * Math.abs(Math.cos(k * 7));
    const hw = Math.max(0.05, w * R), hh = hw * (body === 'blended' ? 0.55 : 1);
    const boat = body === 'boat' && k > -0.6;
    return { f: (k * L) / 2, w: hw, bw: boat ? hw * 0.95 : hw * 0.55, tw: hw * 0.6, wy: boat ? 0.35 : 0.5, y0: y - hh + lift - (boat ? R * 0.25 : 0), y1: y + hh + lift };
  });
  loft(x, st, m, { round: 1, lower: belly, lowerY: y - R * 0.45 });
  return st;
}
type Planform = 'straight' | 'tapered' | 'elliptic' | 'swept' | 'delta' | 'forward' | 'gull' | 'bat';
/** a pair of wings from the fuselage side (r) out to span/2 */
function wings(x: VCtx, r: number, y: number, f: number, span: number, chord: number, kind: Planform, m: Mat, dih = 0.4, edge?: Mat) {
  const D = x.D, half = span / 2;
  for (const s of [-1, 1]) {
    const o = (a: number, yy: number, ff: number): V3 => [s * a, y + yy, f + ff];
    let pts: V3[];
    switch (kind) {
      case 'delta': pts = [o(r, 0, chord * 0.6), o(half, dih, -chord * 0.45), o(half, dih, -chord * 0.55), o(r, 0, -chord * 0.55)]; break;
      case 'swept': pts = [o(r, 0, chord / 2), o(half, dih, -chord * 0.55), o(half, dih, -chord * 0.85), o(r, 0, -chord / 2)]; break;
      case 'forward': pts = [o(r, 0, chord / 2 - chord * 0.4), o(half, dih, chord * 0.35), o(half, dih, chord * 0.05), o(r, 0, -chord * 0.7)]; break;
      case 'elliptic': pts = Array.from({ length: 9 }, (_, i) => { const t = (i / 8) * Math.PI; return o(r + Math.sin(t) * (half - r), dih * Math.sin(t), (Math.cos(t) * chord) / 2); }); break;
      case 'gull': pts = [o(r, 0, chord / 2), o(half * 0.35, dih * 3 + 0.6, chord * 0.45), o(half, dih * 2, chord * 0.2), o(half, dih * 2, -chord * 0.25), o(half * 0.35, dih * 3 + 0.6, -chord * 0.5), o(r, 0, -chord / 2)]; break;
      case 'bat': pts = [o(r, 0, chord * 0.5), o(half * 0.55, dih + 0.5, chord * 0.3), o(half, dih, -chord * 0.1), o(half * 0.8, dih * 0.7, -chord * 0.55), o(half * 0.6, dih * 0.6, -chord * 0.3), o(half * 0.4, dih * 0.4, -chord * 0.7), o(half * 0.2, dih * 0.2, -chord * 0.45), o(r, 0, -chord * 0.7)]; break;
      case 'tapered': pts = [o(r, 0, chord / 2), o(half, dih, chord * 0.2), o(half, dih, -chord * 0.2), o(r, 0, -chord / 2)]; break;
      default: pts = [o(r, 0, chord / 2), o(half, dih, chord / 2), o(half, dih, -chord / 2), o(r, 0, -chord / 2)];
    }
    const key = pts.reduce((q, p) => q + D.depth(p), 0) / pts.length;
    plate(x, pts, m, key, edge);
    // wing-tip lights
    const tip = pts[Math.floor(pts.length / 2) - (kind === 'bat' ? 1 : 0)];
    light(x, tip, 0.35, s > 0 ? { ...x.P.glow, ramp: x.P.glow.ramp } : { ...x.K.fire, emit: true }, key + 0.01, true);
  }
}
type Tail = 'conv' | 'T' | 'twin' | 'V' | 'canard' | 'none';
function tail(x: VCtx, st: Station[], kind: Tail, span: number, h: number, m: Mat) {
  const last = st[st.length - 1], prev = st[st.length - 3], f = last.f, y = (last.y0 + last.y1) / 2, c = Math.abs(prev.f - f);
  if (kind === 'none') return;
  if (kind === 'canard') { const n = st[2]; wings(x, n.w * 0.6, (n.y0 + n.y1) / 2, n.f, span * 0.8, c * 0.5, 'tapered', m, 0); plate(x, [[0, y, f + c * 0.9], [0, y + h, f + c * 0.2], [0, y + h, f], [0, y, f]], m); return; }
  if (kind === 'V') { for (const s of [-1, 1]) plate(x, [[0, y, f + c], [s * span * 0.35, y + h, f + c * 0.25], [s * span * 0.35, y + h, f], [0, y, f]], m); return; }
  const ty = kind === 'T' ? y + h : y;
  wings(x, 0.2, ty, f + c * 0.35, span, c * 0.6, 'tapered', m, 0);
  const fins = kind === 'twin' ? [-span * 0.3, span * 0.3] : [0];
  for (const a of fins) plate(x, [[a, y, f + c * 0.9], [a, y + h, f + c * 0.25], [a, y + h, f - c * 0.05], [a, y, f]], m);
}
/** an engine nacelle along f with a propeller in front, or a jet pod with its intake and flame */
function engine(x: VCtx, c: V3, r: number, len: number, kind: 'prop' | 'jet' | 'pusher' | 'fan' | 'glow', m: Mat, key: number, blades = 3) {
  const D = x.D, P = x.P, on = flying(x);
  if (kind === 'fan') {
    const pts = [...circle([c[0], c[1] - r * 0.2, c[2]], r, 'y', 14), ...circle([c[0], c[1] + r * 0.2, c[2]], r, 'y', 14)];
    D.hull(pts, m, key, { g: D.group(), flat: 0.3 });
    propeller(x, [c[0], c[1] + r * 0.25, c[2]], r * 0.85, 'y', on, 5);
    if (on) exhaust(x, [c[0], c[1] - r * 0.8, c[2]], 'glow', r * 0.5, [0, -1, 0]);
    return;
  }
  if (kind === 'glow') { D.cap([c[0], c[1], c[2] + len / 2], [c[0], c[1], c[2] - len / 2], r, r * 0.8, m, key); exhaust(x, [c[0], c[1], c[2] - len / 2 - r * 0.4], 'glow', r * 0.9); return; }
  D.cap([c[0], c[1], c[2] + len * 0.5], [c[0], c[1], c[2] - len * 0.5], r, r * (kind === 'jet' ? 0.85 : 0.55), m, key);
  if (kind === 'jet') {
    if (D.facing([0, 0, 1]) > 0) D.ell([c[0], c[1], c[2] + len * 0.5 + 0.05], r * 0.7, r * 0.7, P.dark, key + 0.001, { g: D.group(), noLine: true });
    if (on) exhaust(x, [c[0], c[1], c[2] - len * 0.5 - 0.2], 'jet', r * 0.9, [0, 0, -1]);
    return;
  }
  const front = kind === 'pusher' ? c[2] - len * 0.5 - 0.3 : c[2] + len * 0.5 + 0.3;
  at(x, x.D.level + (D.facing([0, 0, kind === 'pusher' ? -1 : 1]) > 0 ? 1 : 0), () => propeller(x, [c[0], c[1], front], r * 2.6, 'f', on, blades));
  D.ell([c[0], c[1], front], r * 0.45, r * 0.45, P.steel, key + 0.002, { g: D.group() });
}
/** landing gear, drawn only on the ground */
function gear(x: VCtx, st: Station[], y: number, span: number, kind: 'tri' | 'tail' | 'skid' | 'float' | 'legs', r: number) {
  if (flying(x)) return;
  const D = x.D, P = x.P, fN = st[1].f, fM = st[4].f;
  if (kind === 'legs') { legs(x, span, [fM, (fM + st[7].f) / 2], y, y, 0.4, P.steel, 'bird', 'pad'); return; }
  if (kind === 'skid') { for (const s of [-1, 1]) { D.cap([s * span, 0.3, fN * 0.6], [s * span, 0.3, st[6].f], 0.3, 0.3, P.dark, D.depth([s * span, 0.3, 0])); for (const f of [fN * 0.4, st[5].f]) rod(x, [s * span * 0.5, y - 0.5, f], [s * span, 0.3, f], 0.2, P.dark); } return; }
  if (kind === 'float') { for (const s of [-1, 1]) { pod(x, [s * span, r * 0.6, fM], r * 1.4, (st[1].f - st[6].f) * 0.8, r * 1.1, x.body2); for (const f of [fM + 2, fM - 2]) rod(x, [s * span * 0.4, y - 0.5, f], [s * span, r, f], 0.2, P.dark); } return; }
  for (const s of [-1, 1]) { rod(x, [s * span * 0.4, y - 0.4, fM], [s * span, r, fM], 0.25, P.dark); wheel(x, [s * span, r, fM], r, r * 0.6, s, 0, 'tyre'); }
  const f2 = kind === 'tri' ? fN * 0.8 : st[8].f;
  rod(x, [0, y - 0.4, f2], [0, r * (kind === 'tri' ? 0.8 : 0.6), f2], 0.22, P.dark);
  wheel(x, [0, r * (kind === 'tri' ? 0.8 : 0.6), f2], r * (kind === 'tri' ? 0.8 : 0.6), r * 0.5, 1, 0, 'tyre');
}
/** bombs tumbling out of the bay while attacking (from frame 4) */
function bombs(x: VCtx, y: number, f: number, n = 3, s = 1) {
  if (!acting(x)) return;
  const D = x.D, fr = frameOf(x);
  for (let i = 0; i < n; i++) {
    const g = fr - 4 - i * 0.5 + 0.5;
    if (g < 0) continue;
    const p: V3 = [(i - (n - 1) / 2) * 1.2 * s, y - 1 - g * g * 2.2, f - g * 1.5];
    if (p[1] > 0.8) { D.cap([p[0], p[1] + 0.9 * s, p[2]], [p[0], p[1] - 0.9 * s, p[2] + 0.3], 0.5 * s, 0.4 * s, x.P.dark, 2e4 + D.depth(p)); plate(x, [[p[0], p[1] + 0.9 * s, p[2]], [p[0] + 0.6 * s, p[1] + 1.4 * s, p[2]], [p[0] - 0.6 * s, p[1] + 1.4 * s, p[2]]], x.P.dark, 2e4 + D.depth(p) + 1); }
    else for (let k = 0; k < 3; k++) D.ell([p[0] + (k - 1) * 1.5, 1 + k * 0.8, p[2]], 2.6 - k * 0.4, 2 - k * 0.3, k === 1 ? x.P.flash : x.P.fire, 2e4 + D.depth(p) + k, { g: D.group(), noLine: true });
  }
}
/** a gas envelope (balloon, blimp, rigid airship) with fins */
function envelope(x: VCtx, c: V3, L: number, R: number, m: Mat, fins: Mat, ribs = true) {
  const D = x.D, key = D.depth(c);
  pod(x, c, R * 2, L, R * 2, m, key, 0.8, 1.3);
  if (ribs) for (let i = 1; i < 6; i++) { const f = c[2] - L / 2 + (L * i) / 6, rr = R * Math.pow(Math.sin(Math.PI * (i / 6)), 0.55); D.ell([c[0], c[1], f], rr * 0.18, rr, { ...m, ramp: m.ramp.map(q => q.map(v => v * 0.85)) as typeof m.ramp }, key + 0.001, { g: D.group(), noLine: true }); }
  const tf = c[2] - L * 0.42;
  for (const s of [-1, 1]) plate(x, [[c[0], c[1], tf + L * 0.12], [c[0] + s * R * 1.3, c[1], tf - L * 0.04], [c[0] + s * R * 1.3, c[1], tf - L * 0.1], [c[0], c[1], tf - L * 0.08]], fins);
  for (const s of [-1, 1]) plate(x, [[c[0], c[1], tf + L * 0.12], [c[0], c[1] + s * R * 1.3, tf - L * 0.04], [c[0], c[1] + s * R * 1.3, tf - L * 0.1], [c[0], c[1], tf - L * 0.08]], fins);
}
/** a gondola hung under an envelope on struts (never floating) */
function gondola(x: VCtx, yTop: number, y: number, f: number, len: number, w: number, m: Mat) {
  loft(x, [{ f: f + len / 2, w: w * 0.6, bw: w * 0.4, tw: w * 0.5, wy: 0.5, y0: y, y1: y + w * 1.1 }, { f: f + len * 0.3, w, bw: w * 0.8, tw: w * 0.85, wy: 0.5, y0: y, y1: y + w * 1.3 }, { f: f - len / 2, w: w * 0.7, bw: w * 0.5, tw: w * 0.6, wy: 0.5, y0: y + 0.2, y1: y + w * 1.2 }], m, { round: 1 });
  for (const q of [0.3, -0.3]) for (const s of [-1, 1]) rod(x, [s * w * 0.6, y + w, f + len * q], [s * w * 0.4, yTop, f + len * q * 1.4], 0.15, x.P.dark);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) x.D.ell([s * w * 0.98, y + w * 0.7, f + len * (0.25 - i * 0.2)], 0.4, 0.3, x.P.glass, x.D.depth([s * w, y, f]) + 0.1, { g: x.D.group(), noLine: true });
}
/** a saucer: disc hull, a glowing rim, a dome */
function saucer(x: VCtx, R: number, y: number, dm: number, m: Mat) {
  const D = x.D, pts: V3[] = [];
  for (let j = 0; j < 22; j++) { const t = (j / 22) * Math.PI * 2; pts.push([Math.cos(t) * R, y + R * 0.16, Math.sin(t) * R], [Math.cos(t) * R * 0.6, y - R * 0.05, Math.sin(t) * R * 0.6], [Math.cos(t) * R * 0.7, y + R * 0.32, Math.sin(t) * R * 0.7]); }
  const key = D.depth([0, y, 0]);
  D.hull(pts, m, key, { g: D.group(), flat: 0 });
  up(x, () => {
    for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2 + x.ph * 0.5, p: V3 = [Math.cos(t) * R * 0.94, y + R * 0.16, Math.sin(t) * R * 0.94]; if (D.facing([Math.cos(t), 0, Math.sin(t)]) > -0.15) D.ell(p, 0.6, 0.4, x.P.glow, D.depth(p), { g: D.group() }); }
    dome(x, [0, y + R * 0.3, 0], R * dm, R * dm, R * 0.35, x.P.glass);
  });
  D.ell([0, y - R * 0.08, 0], R * 0.3, R * 0.1, x.P.glow, key - 0.05, { g: D.group(), noLine: true });
}
const planShadow = (x: VCtx, L: number, span: number, chord: number, y: number, wf = 0) => {
  const r = Math.max(1, L * 0.06);
  outlineShadow(x, [[0, L / 2], [r, L * 0.35], [r, wf + chord / 2], [span / 2, wf], [span / 2, wf - chord / 2], [r, wf - chord / 2], [r * 0.5, -L * 0.42], [span * 0.16, -L * 0.45], [span * 0.16, -L * 0.5], [-span * 0.16, -L * 0.5], [-span * 0.16, -L * 0.45], [-r * 0.5, -L * 0.42], [-r, wf - chord / 2], [-span / 2, wf - chord / 2], [-span / 2, wf], [-r, wf + chord / 2], [-r, L * 0.35]], y);
};

// ---------------------------------------------------------------------------------------------------
// A winged aircraft of any era: one function, many modules
// ---------------------------------------------------------------------------------------------------
interface Plane {
  L: number; R: number; body: Body; nose: number; span: number; chord: number; plan: Planform; pos: 'high' | 'mid' | 'low'; dih: number;
  tail: Tail; engines: { kind: 'prop' | 'jet' | 'pusher' | 'fan' | 'glow'; n: number; where: 'nose' | 'wing' | 'side' | 'tail' }; gear: 'tri' | 'tail' | 'float' | 'legs' | 'skid';
  cockpit: 'bubble' | 'stepped' | 'glazed' | 'windows' | 'none'; stack?: 1 | 2 | 3; alt: number;
}
function plane(x: VCtx, p: Plane, arm: (y: number, st: Station[]) => void) {
  const D = x.D, P = x.P, gearR = Math.max(0.9, p.R * 0.55);
  const park = p.R + gearR * (p.gear === 'float' ? 1.4 : 1.6) + (p.gear === 'legs' ? 3 : 0);
  let stOut: Station[] = [];
  const y = airborne(x, p.alt, park, y => {
    const st = fuselage(x, p.L, p.R, y, x.body, p.body, p.nose, p.body === 'boat' ? x.body2 : undefined);
    stOut = st;
    const wy = y + (p.pos === 'high' ? p.R * 0.85 : p.pos === 'low' ? -p.R * 0.6 : 0), wf = p.L * 0.04;
    const wingLevel = p.pos === 'high' || (p.stack ?? 1) > 1 ? D.level + 1 : D.level;
    at(x, wingLevel, () => {
      const n = p.stack ?? 1;
      for (let k = 0; k < n; k++) {
        const yy = wy + k * p.R * 2.1 - (n > 1 ? p.R * 0.5 : 0);
        wings(x, p.R * (k === 0 ? 0.8 : 0.1), yy, wf + k * p.chord * 0.15, p.span * (k === n - 1 && n === 3 ? 0.85 : 1), p.chord, p.plan, x.body2, p.dih, P.dark);
        if (k > 0) for (const s of [-1, 1]) for (const a of [p.span * 0.2, p.span * 0.42]) { rod(x, [s * a, yy - p.R * 2.1, wf], [s * a, yy, wf + p.chord * 0.15], 0.15, P.wood); rod(x, [s * a, yy - p.R * 2.1, wf], [s * a * 0.9, yy, wf - p.chord * 0.3], 0.06, P.dark); }
      }
      // engines on the wings
      if (p.engines.where === 'wing') {
        const n = p.engines.n;
        for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
          const a = s * p.span * (0.18 + (i * 0.34) / Math.max(1, n)), sweepBack = p.plan === 'swept' ? (Math.abs(a) / (p.span / 2)) * p.chord * 0.5 : 0;
          const under = p.engines.kind === 'jet' ? -p.R * 0.55 : 0, c: V3 = [a, wy + under, wf + p.chord * 0.25 - sweepBack];
          const wk = D.depth([a, wy, wf]);
          engine(x, c, Math.max(0.6, p.R * (p.engines.kind === 'jet' ? 0.42 : 0.36)), p.chord * (p.engines.kind === 'jet' ? 1.1 : 0.9), p.engines.kind, x.body2, under < 0 ? wk - 0.02 : wk + 0.02);
          if (under < 0) rod(x, [a, wy, c[2]], [a, c[1], c[2]], 0.25, x.body2, wk - 0.01);
        }
      }
    });
    tail(x, st, p.tail, p.span * 0.34, p.R * 2.2, x.body2);
    // nose / side / tail engines
    if (p.engines.where === 'nose') engine(x, [0, y, st[0].f - p.L * 0.02], p.R * 0.6, p.L * 0.05, 'prop', P.steel, D.depth([0, y, st[0].f]) + 0.1, 3);
    if (p.engines.where === 'tail') { if (p.engines.kind === 'pusher') engine(x, [0, y + p.R * 0.3, st[st.length - 1].f - 0.5], p.R * 0.5, p.L * 0.06, 'pusher', P.steel, D.depth([0, y, st[st.length - 1].f]) + 0.1, 3); else if (flying(x)) exhaust(x, [0, y + p.R * 0.3, st[st.length - 1].f - 0.4], p.engines.kind === 'glow' ? 'glow' : 'jet', p.R * 0.7, [0, 0, -1]); }
    if (p.engines.where === 'side') for (const s of [-1, 1]) engine(x, [s * p.R * 1.25, y + p.R * 0.2, -p.L * 0.28], p.R * 0.45, p.L * 0.2, p.engines.kind, x.body2, D.depth([s * p.R, y, -p.L * 0.28]));
    // cockpit
    up(x, () => {
      const cf = p.cockpit === 'glazed' ? st[1].f - 0.2 : st[2].f - p.L * 0.02;
      if (p.cockpit === 'bubble') dome(x, [0, y + p.R * 0.75, cf - p.L * 0.05], p.R * 0.55, p.L * 0.09, p.R * 0.7, P.glass);
      else if (p.cockpit === 'stepped') { dome(x, [0, y + p.R * 0.6, cf], p.R * 0.75, p.L * 0.05, p.R * 0.5, P.glassDark); }
      else if (p.cockpit === 'glazed') dome(x, [0, y, cf], p.R * 0.6, p.L * 0.05, p.R * 0.8, P.glass);
      else if (p.cockpit === 'windows') { dome(x, [0, y + p.R * 0.5, st[1].f - p.L * 0.03], p.R * 0.6, p.L * 0.04, p.R * 0.45, P.glassDark); for (const s of [-1, 1]) if (D.facing([s, 0, 0]) > 0) for (let i = 0; i < Math.round(p.L / 3); i++) { const f = lerp(st[2].f, st[6].f, (i + 0.5) / Math.round(p.L / 3)); D.ell([s * p.R * 0.98, y + p.R * 0.3, f], 0.35, 0.4, P.glassDark, D.depth([s * p.R, y, f]) + 0.1, { g: D.group(), noLine: true }); } }
    });
    arm(y, st);
  });
  gear(x, stOut, y, p.R * (p.gear === 'float' ? 3 : 1.5), p.gear, gearR);
  if (flying(x)) planShadow(x, p.L, p.span, p.chord, y);
  return y;
}

// ---------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------
function transport(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), ex = x.C.params.exotic, wet = x.C.params.water > 0.65;
  if (e === 3) {
    const kind = pick(x.d[11], [['balloon', b === 0 ? 4 : 0.5], ['airship', b > 0 ? 4 : 1], ['ornithopter', ex > 0.45 ? 2.5 : 0]] as [string, number][]);
    if (kind === 'balloon') {
      const y = flying(x) ? 22 : 0.2, R = 8;
      up(x, () => {
        loft(x, [{ f: 1.8, w: 1.8, bw: 1.6, tw: 1.9, wy: 0.5, y0: y, y1: y + 2.4 }, { f: -1.8, w: 1.8, bw: 1.6, tw: 1.9, wy: 0.5, y0: y, y1: y + 2.4 }], P.wicker, { top: P.dark });
        for (const [a, f] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) rod(x, [a, y + 2.4, f], [a * 2.6, y + 7.5, f * 2.6], 0.1, P.rope);
        if (flying(x)) D.ell([0, y + 7, 0], 0.9, 1.5 + Math.sin(x.ph * 4) * 0.4, P.fire2, D.depth([0, y + 7, 0]) + 0.3, { g: D.group(), noLine: true });
        const c: V3 = [0, y + 7.5 + R, 0];
        D.ell(c, R, R * 1.12, x.body, D.depth(c), { g: D.group() });
        for (const q of [-0.5, 0, 0.5]) D.ell([q * R * 0.85, c[1], 0], R * 0.14, R * 1.08, x.body2, D.depth(c) + 0.01, { g: D.group(), noLine: true });
        for (let i = 0; i < 3; i++) sandbag(x, [(-1 + i) * 1.2, y + 1.2, 1.9]);
      });
      if (flying(x)) groundShadow(x, R * 1.6, R * 1.6, y); else rod(x, [0, 0, 3], [0, 3, 3], 0.2, P.wood);
      x.label = 'Balão de ar quente';
      return;
    }
    if (kind === 'ornithopter') return ornithopter(x, false);
    return airship(x, false);
  }
  if (e === 7) {
    const kind = pick(x.d[11], [['saucer', 3], ['manta', ex * 3], ['ring', 1.5]] as [string, number][]);
    if (kind === 'manta') return manta(x, false);
    const R = (6 + b * 3) * Z, y = flying(x) ? 16 : 2.4;
    if (!flying(x)) for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; rod(x, [Math.cos(t) * R * 0.4, y, Math.sin(t) * R * 0.4], [Math.cos(t) * R * 0.55, 0.3, Math.sin(t) * R * 0.55], 0.3, P.steel); }
    if (kind === 'ring') { const pts = circle([0, y, 0], R, 'y', 20); for (let i = 0; i < 20; i++) D.cap(pts[i], pts[(i + 1) % 20], R * 0.14, R * 0.14, x.body, D.depth(pts[i]) - 0.01 + (pts[i][2] > 0 ? 0 : 0)); up(x, () => { pod(x, [0, y + R * 0.1, 0], R * 0.6, R * 0.9, R * 0.5, x.body2); dome(x, [0, y + R * 0.3, R * 0.1], R * 0.2, R * 0.3, R * 0.2, P.glass); for (const s of [-1, 1]) rod(x, [0, y, 0], [s * R, y, 0], 0.3, x.body2); }); }
    else saucer(x, R, y, 0.45, x.body);
    groundShadow(x, R * 2, R * 2, y);
    x.label = kind === 'ring' ? 'Nave-anel' : 'Nave-disco';
    return;
  }
  if (e === 6) {
    const kind = pick(x.d[11], [['taxi', b === 0 ? 4 : 1], ['tilt', b > 0 ? 3 : 0.5], ['blended', b === 2 ? 3 : 0.5], ['ornithopter', ex > 0.5 ? 2 : 0]] as [string, number][]);
    if (kind === 'ornithopter') return ornithopter(x, false);
    if (kind === 'tilt') return tiltrotor(x, false);
    if (kind === 'taxi') { // an air taxi on ducted fans
      const L = (10 + b * 6) * Z, R = (2 + b * 0.8) * Z;
      const y = airborne(x, 14, 1.6 + R, y => {
        const st = fuselage(x, L, R, y, x.body, 'pod', 0.3);
        up(x, () => dome(x, [0, y + R * 0.3, st[2].f - 1], R * 0.85, L * 0.22, R * 0.8, P.glass));
        for (const s of [-1, 1]) for (const f of [L * 0.3, -L * 0.3]) { const c: V3 = [s * (R + 2.2 * Z), y + R * 0.4, f]; rod(x, [s * R * 0.8, y, f], c, 0.35, x.body2); engine(x, c, 1.9 * Z, 1, 'fan', x.body2, D.depth(c)); }
      });
      if (!flying(x)) for (const s of [-1, 1]) D.cap([s * 1.2 * Z, 0.3, -L * 0.3], [s * 1.2 * Z, 0.3, L * 0.3], 0.3, 0.3, P.metal, D.depth([s, 0.3, 0]));
      if (flying(x)) groundShadow(x, R * 2 + 8 * Z, L, y);
      x.label = 'Táxi aéreo';
      return;
    }
    plane(x, { L: 30 * Z, R: 3 * Z, body: 'blended', nose: 0.3, span: 40 * Z, chord: 14 * Z, plan: 'delta', pos: 'mid', dih: 0.2, tail: 'twin', engines: { kind: 'jet', n: 1, where: 'side' }, gear: 'tri', cockpit: 'windows', alt: 22 }, () => undefined);
    x.label = 'Asa integrada de passageiros';
    return;
  }
  // e4: props (high-wing bush plane, twin, four-engine liner or flying boat); e5: jets
  const boat = e === 4 && wet && x.d[12] < 0.6;
  const L = [14, 24, 36][b] * Z, R = [1.3, 2, 2.8][b] * Z;
  const jet = e === 5;
  plane(x, {
    L, R, body: boat ? 'boat' : 'tube', nose: jet ? 0.6 : 0.3, span: L * (jet ? 0.95 : 1.15), chord: L * 0.13, plan: jet ? 'swept' : b === 0 ? 'straight' : pick(x.d[13], [['tapered', 2], ['elliptic', 1], ['gull', boat ? 2 : 0.3]] as [Planform, number][]), pos: boat || b === 0 ? 'high' : 'low', dih: jet ? 1.2 : 0.4,
    tail: jet ? pick(x.d[14], [['conv', 2], ['T', 1.5]] as [Tail, number][]) : 'conv', engines: b === 0 ? { kind: jet ? 'jet' : 'prop', n: 1, where: jet ? 'side' : 'nose' } : { kind: jet ? 'jet' : 'prop', n: b === 2 ? 2 : 1, where: jet && x.d[15] < 0.3 ? 'side' : 'wing' },
    gear: boat ? 'float' : b === 0 && !jet ? 'tail' : 'tri', cockpit: b === 0 ? 'stepped' : 'windows', alt: 22,
  }, () => undefined);
  x.label = boat ? 'Hidroavião' : jet ? ['Jato executivo', 'Jato de passageiros', 'Jato jumbo'][b] : ['Monomotor', 'Bimotor de passageiros', 'Avião de linha'][b];
}
function sandbag(x: VCtx, p: V3) { x.D.ell(p, 0.45, 0.6, x.P.canvas, x.D.depth(p) + 0.1, { g: x.D.group() }); }

function airship(x: VCtx, war: boolean) {
  const { P, D } = x, b = tier(x), Z = x.Z;
  const L = (war ? 44 + b * 10 : 30 + b * 12) * Z * 0.8, R = L * 0.12, y = flying(x) ? 18 : 4, gy = y - R - 3;
  if (!flying(x)) { rod(x, [0, 0, L * 0.5 + 1], [0, y + R * 0.4, L * 0.5 + 1], 0.5, P.steel); for (const s of [-1, 1]) rod(x, [s * R, 0, 0], [s * R * 0.6, gy + 1, 0], 0.08, P.rope); }
  const ng = war ? 2 : 1;
  for (let i = 0; i < ng; i++) gondola(x, y - R * 0.8, gy, (ng === 1 ? 0 : (i ? -1 : 1) * L * 0.18), L * 0.26, R * 0.35, x.body2);
  up(x, () => {
    envelope(x, [0, y, 0], L, R, war ? x.body : x.P.paint2, x.body);
    // engine cars on struts
    for (const s of [-1, 1]) for (const f of war ? [L * 0.12, -L * 0.2] : [-L * 0.18]) { const c: V3 = [s * (R + 1.8), y - R * 0.5, f]; rod(x, [s * R * 0.7, y - R * 0.4, f], c, 0.2, P.dark); engine(x, c, 0.8, 2.6, 'pusher', x.body2, D.depth(c)); }
    if (war) {
      turret(x, { id: 0, a: 0, f: L * 0.18, y: y + R * 0.95, R: 1.2, H: 0.9, shape: 'open', gun: { kind: 'mg', len: 3, r: 0.2, muzzle: 'cooling' }, m: x.body2, phase: 0.5, sweep: 1.2 });
      turret(x, { id: 1, a: 0, f: L * 0.05, y: gy - 0.4, R: 1, H: 0.9, shape: 'dome', gun: { kind: 'mg', len: 3, r: 0.2 }, m: P.glass, yaw0: Math.PI, arc: 3, phase: 2 });
      bombs(x, gy, 0, 3);
    }
    banner(x, [0, y + R * 1.2, -L * 0.45], 2, 3, x.body2, P.dark, true);
  });
  if (flying(x)) groundShadow(x, R * 2, L, y);
  x.label = war ? (b === 2 ? 'Zepelim de guerra' : 'Dirigível armado') : b === 2 ? 'Zepelim de passageiros' : 'Dirigível';
}
/** flapping-wing aircraft (exotic cultures): a light body with two pairs of beating wings */
function ornithopter(x: VCtx, war: boolean) {
  const { P, D } = x, Z = x.Z, b = tier(x), L = (12 + b * 5) * Z, R = (1.3 + b * 0.4) * Z;
  const flap = flying(x) ? Math.sin(x.ph * 2) : -0.2;
  const y = airborne(x, 16, R + 2.6 * Z, y => {
    const st = fuselage(x, L, R, y, x.body, 'insect', 0.4);
    up(x, () => {
      dome(x, [0, y + R * 0.4, st[2].f], R * 0.7, L * 0.12, R * 0.6, P.glass);
      for (const [f, span] of [[L * 0.12, L * 1.2], [-L * 0.12, L * 0.9]] as [number, number][]) for (const s of [-1, 1]) {
        const tipY = y + R * 0.5 + flap * span * 0.25, pts: V3[] = [[s * R * 0.6, y + R * 0.5, f + L * 0.06], [s * span * 0.5, tipY, f + L * 0.02], [s * span * 0.45, tipY - 0.3, f - L * 0.08], [s * span * 0.25, (y + tipY) / 2, f - L * 0.12], [s * R * 0.6, y + R * 0.5, f - L * 0.06]];
        plate(x, pts, { ...x.body2, alpha: 0.75 }, undefined, P.dark);
      }
      if (war) fixedGun(x, { kind: x.e >= 5 ? 'laser' : 'mg', len: 2.5 * Z, r: 0.2 * Z, muzzle: x.e >= 5 ? 'bulb' : 'flash' }, [0, y - R * 0.5, st[1].f], 0, 0.15);
    });
  });
  if (!flying(x)) legs(x, R * 1.6, [L * 0.15, -L * 0.2], R + 2.4 * Z - R, R + 2.4 * Z - R, 0.3 * Z, P.steel, 'insect', 'claw');
  if (flying(x)) groundShadow(x, L * 1.1, L, y);
  x.label = war ? 'Ornitóptero de combate' : 'Ornitóptero';
}
/** an organic bat-winged lifting body (exotic, late eras) */
function manta(x: VCtx, war: boolean) {
  const { P, D } = x, Z = x.Z, b = tier(x), L = (16 + b * 6) * Z, span = L * 1.3;
  const flap = flying(x) ? Math.sin(x.ph) * 0.8 : -0.5;
  const y = airborne(x, 16, 2.6 * Z, y => {
    fuselage(x, L * 0.8, L * 0.1, y, x.body, 'blended', 0.2);
    up(x, () => {
      for (const s of [-1, 1]) plate(x, [[s * L * 0.06, y, L * 0.3], [s * span * 0.3, y + flap * 0.5, L * 0.15], [s * span * 0.5, y + flap * 1.5, -L * 0.05], [s * span * 0.38, y + flap, -L * 0.2], [s * span * 0.2, y + flap * 0.4, -L * 0.12], [s * L * 0.06, y, -L * 0.3]], x.body2, undefined, P.dark);
      for (let i = 0; i < 4; i++) light(x, [(-1.5 + i) * L * 0.05, y + L * 0.06, L * 0.1], 0.5, P.glow, undefined, true);
      rod(x, [0, y, -L * 0.4], [0, y + Math.sin(x.ph * 2) * 1.5, -L * 0.8], 0.3, x.body);
      if (war) fixedGun(x, { kind: 'plasma', len: 3 * Z, r: 0.35 * Z, muzzle: 'bulb', n: 2 }, [0, y - L * 0.04, L * 0.38], 0, 0.2);
    });
  });
  if (flying(x)) groundShadow(x, span, L, y);
  x.label = war ? 'Arraia de combate' : 'Arraia de transporte';
}
function tiltrotor(x: VCtx, war: boolean) {
  const { P, D } = x, Z = x.Z, b = tier(x), L = (16 + b * 5) * Z, R = 1.8 * Z * (1 + b * 0.2), span = L * 0.95;
  const tilt = x.anim === 'use' && !war ? smooth((x.t - 0.1) / 0.5) : moving(x) || (war && acting(x)) ? 1 : 0;
  plane(x, { L, R, body: 'tube', nose: 0.4, span, chord: L * 0.1, plan: 'straight', pos: 'high', dih: 0, tail: x.d[14] < 0.5 ? 'twin' : 'T', engines: { kind: 'prop', n: 0, where: 'tail' }, gear: 'tri', cockpit: war ? 'stepped' : 'windows', alt: 16 }, (y) => {
    up(x, () => up(x, () => {
      for (const s of [-1, 1]) {
        const c: V3 = [s * span / 2, y + R * 0.9, 0], dir: V3 = [0, Math.cos(tilt * Math.PI / 2), Math.sin(tilt * Math.PI / 2)];
        D.cap([c[0], c[1] - dir[1] * 1.4, c[2] - dir[2] * 1.4], [c[0], c[1] + dir[1] * 2.6, c[2] + dir[2] * 2.6], R * 0.5, R * 0.4, x.body2, D.depth(c));
        const hub: V3 = [c[0], c[1] + dir[1] * 3.2, c[2] + dir[2] * 3.2];
        if (tilt > 0.5) propeller(x, hub, L * 0.2, 'f', flying(x) || x.anim === 'use', 3); else propeller(x, hub, L * 0.2, 'y', flying(x) || x.anim === 'use', 3);
      }
      if (war) { fixedGun(x, { kind: x.e >= 6 ? 'laser' : 'rotary', n: 3, len: 2.5 * Z, r: 0.2 * Z, muzzle: x.e >= 6 ? 'bulb' : 'plain' }, [0, y - R, L * 0.4], 0, 0.3); }
    }));
  });
  x.label = war ? 'Convertiplano de ataque' : x.anim === 'use' ? 'Convertiplano' : 'Convertiplano de passageiros';
}

/** fighters: biplane / triplane / monoplane / jets / drones / discs */
function fighter(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), ex = x.C.params.exotic;
  if (e === 7) {
    if (ex > 0.5 && x.d[11] < 0.5) return manta(x, true);
    const R = (5.5 + b * 1.5) * Z, y = flying(x) ? 18 : 2;
    saucer(x, R, y, 0.3, x.body);
    up(x, () => { for (const s of [-1, 1]) fixedGun(x, { kind: 'plasma', len: 1.2 * Z, r: 0.4 * Z, muzzle: 'bulb' }, [s * R * 0.4, y + R * 0.1, R * 0.9], 0, 0.1, s); });
    groundShadow(x, R * 2, R * 2, y);
    x.label = 'Interceptador-disco'; return;
  }
  if (e === 3 && ex > 0.55 && x.d[11] < 0.4) return ornithopter(x, true);
  const L = (13 + b * 3) * Z, R = 1.2 * Z * (1 + b * 0.15);
  if (e === 3) {
    const tri = x.d[12] < 0.35;
    plane(x, { L, R, body: 'tube', nose: 0.2, span: L * 1.05, chord: L * 0.16, plan: 'straight', pos: 'low', dih: 0.1, tail: 'conv', engines: { kind: 'prop', n: 1, where: 'nose' }, gear: 'tail', cockpit: 'none', stack: tri ? 3 : 2, alt: 18 }, (y, st) => {
      up(x, () => { D.cap([0, y + R * 0.8, st[3].f], [0, y + R * 1.1, st[4].f], R * 0.5, R * 0.4, P.dark, D.depth([0, y, st[3].f]) + 0.1); for (const s of [-0.3, 0.3]) fixedGun(x, { kind: 'mg', len: 2 * Z, r: 0.16 * Z, muzzle: 'cooling' }, [s * R, y + R * 1.1, st[2].f], 0, 0.05); });
    });
    x.label = tri ? 'Triplano' : 'Biplano'; return;
  }
  if (e === 4) {
    const kind = pick(x.d[12], [['radial', 2], ['inline', 2], ['twinboom', 1], ['canard', ex > 0.4 ? 1.5 : 0.3]] as [string, number][]);
    plane(x, { L, R, body: 'tube', nose: kind === 'inline' ? 0.8 : 0.1, span: L * 1, chord: L * 0.16, plan: kind === 'inline' ? 'elliptic' : pick(x.d[13], [['tapered', 2], ['gull', 1]] as [Planform, number][]), pos: 'low', dih: 0.5, tail: kind === 'canard' ? 'canard' : kind === 'twinboom' ? 'twin' : 'conv', engines: kind === 'canard' ? { kind: 'pusher', n: 1, where: 'tail' } : kind === 'twinboom' ? { kind: 'prop', n: 1, where: 'wing' } : { kind: 'prop', n: 1, where: 'nose' }, gear: kind === 'canard' ? 'tri' : 'tail', cockpit: 'bubble', alt: 18 }, (y, st) => {
      at(x, x.D.level + 1, () => { for (const s of [-1, 1]) fixedGun(x, { kind: 'mg', len: 1.5 * Z, r: 0.14 * Z, muzzle: 'flash' }, [s * L * 0.28, y - R * 0.5, st[3].f + 0.5], 0, 0.02, s); });
    });
    x.label = kind === 'canard' ? 'Caça canard' : kind === 'twinboom' ? 'Caça de dupla cauda' : 'Caça a hélice'; return;
  }
  if (e === 5) {
    const plan = pick(x.d[12], [['swept', 3], ['delta', 2.5], ['forward', ex > 0.3 ? 1.5 : 0.3]] as [Planform, number][]);
    plane(x, { L, R, body: 'tube', nose: 1, span: L * (plan === 'delta' ? 0.7 : 0.75), chord: L * (plan === 'delta' ? 0.45 : 0.28), plan, pos: 'mid', dih: 0, tail: plan === 'delta' ? (x.d[13] < 0.5 ? 'canard' : 'conv') : b > 0 ? 'twin' : 'conv', engines: { kind: 'jet', n: 1, where: 'tail' }, gear: 'tri', cockpit: 'bubble', alt: 20 }, (y, st) => {
      at(x, x.D.level + 1, () => {
        fixedGun(x, { kind: 'rotary', n: 5, len: 1.2 * Z, r: 0.12 * Z }, [R * 0.7, y + R * 0.3, st[2].f], 0, 0.02);
        for (const s of [-1, 1]) { const p: V3 = [s * L * 0.28, y - R * 0.3, -L * 0.05]; if (!acting(x) || s < 0) D.cap([p[0], p[1], p[2] + 2.4], [p[0], p[1], p[2] - 2], 0.35, 0.35, P.metal, D.depth(p) + 0.03); if (s > 0) barrels(x, { kind: 'missile', len: 0.5, r: 0.4 }, p, [0, 0, 1], { key: D.depth(p), depth: D.depth(p) }); }
      });
    });
    x.label = plan === 'delta' ? 'Caça delta' : plan === 'forward' ? 'Caça de asa invertida' : 'Caça a jato'; return;
  }
  // e6: drones - a flying wing with no cockpit, or a fan fighter
  plane(x, { L: L * 0.8, R: R * 1.2, body: 'blended', nose: 0.5, span: L * 1.2, chord: L * 0.5, plan: x.d[12] < 0.5 ? 'delta' : 'bat', pos: 'mid', dih: 0, tail: 'none', engines: { kind: 'glow', n: 1, where: 'tail' }, gear: 'legs', cockpit: 'none', alt: 18 }, (y, st) => {
    up(x, () => { light(x, [0, y + R * 0.8, st[2].f], 0.6, P.glow); for (const s of [-1, 1]) fixedGun(x, { kind: x.d[13] < 0.5 ? 'laser' : 'rail', len: 1.6 * Z, r: 0.2 * Z, muzzle: 'bulb' }, [s * L * 0.15, y, st[2].f], 0, 0.02, s); });
  });
  x.label = 'Caça-drone';
}

/** medium attack: armed airship, biplane bomber, medium bomber, dive bomber, attack helicopter, gunships */
function attack(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), ex = x.C.params.exotic;
  if (e === 3) return x.d[11] < 0.5 ? airship(x, true) : bomberPlane(x, 'bi');
  if (e === 4) return x.d[11] < 0.25 && ex > 0.3 ? autogyro(x) : bomberPlane(x, 'twin');
  if (e === 5) return x.d[11] < 0.6 ? helicopter(x) : bomberPlane(x, 'attackjet');
  if (e === 6) return x.d[11] < 0.5 ? tiltrotor(x, true) : multicopter(x);
  // hover gunship: a lifting body on glowing pads, a turret under the nose
  const L = (18 + b * 5) * Z, W = L * 0.5;
  const y = airborne(x, 15, 2.5, y => {
    fuselage(x, L, W * 0.3, y, x.body, 'blended', 0.4);
    up(x, () => {
      plate(x, [[0, y + 0.2, L * 0.45], [W / 2, y + 0.2, -L * 0.1], [W * 0.4, y + 0.2, -L / 2], [-W * 0.4, y + 0.2, -L / 2], [-W / 2, y + 0.2, -L * 0.1]], x.body2);
      dome(x, [0, y + W * 0.15, L * 0.15], W * 0.18, L * 0.14, W * 0.15, P.glass);
      for (const s of [-1, 1]) for (const f of [L * 0.2, -L * 0.3]) D.ell([s * W * 0.3, y - W * 0.12, f], 1.4 * Z, 0.5 * Z, P.glow, D.depth([s * W * 0.3, y, f]) - 0.05, { g: D.group(), noLine: true });
    });
    at(x, x.D.level + 1, () => turret(x, { id: 0, a: 0, f: L * 0.28, y: y - W * 0.3, R: 1.3 * Z, H: 0.9 * Z, shape: 'dome', gun: { kind: 'plasma', len: 4 * Z, r: 0.4 * Z, muzzle: 'bulb' }, m: x.body2, phase: 0.4, sweep: 0.8 }));
  });
  groundShadow(x, W, L, y);
  x.label = 'Canhoneira flutuante';
}
function bomberPlane(x: VCtx, kind: 'bi' | 'twin' | 'four' | 'attackjet' | 'jetbomber' | 'wing') {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const big = kind === 'four' || kind === 'jetbomber' || kind === 'wing';
  const L = (big ? 30 : 20) * Z * (1 + b * 0.15), R = (big ? 2.4 : 1.8) * Z;
  if (kind === 'wing') {
    plane(x, { L: L * 0.7, R: R * 1.4, body: 'blended', nose: 0.5, span: L * 2, chord: L * 0.5, plan: 'delta', pos: 'mid', dih: 0, tail: 'none', engines: { kind: 'jet', n: 1, where: 'side' }, gear: 'tri', cockpit: 'stepped', alt: 24 }, (y) => { bombs(x, y, 0, 4, 1.2); });
    x.label = 'Asa voadora'; return;
  }
  const jet = kind === 'attackjet' || kind === 'jetbomber';
  plane(x, {
    L, R, body: kind === 'bi' ? 'tube' : 'tube', nose: jet ? 0.8 : 0.5, span: L * (jet ? 0.9 : 1.25), chord: L * (jet ? 0.2 : 0.14), plan: jet ? 'swept' : kind === 'bi' ? 'straight' : 'tapered', pos: kind === 'jetbomber' ? 'high' : 'mid', dih: jet ? -0.4 : 0.4,
    tail: kind === 'twin' && x.d[13] < 0.5 ? 'twin' : kind === 'attackjet' ? 'twin' : 'conv',
    engines: kind === 'bi' ? { kind: 'prop', n: 1, where: 'wing' } : kind === 'twin' ? { kind: 'prop', n: 1, where: 'wing' } : kind === 'four' ? { kind: 'prop', n: 2, where: 'wing' } : kind === 'attackjet' ? { kind: 'jet', n: 1, where: 'side' } : { kind: 'jet', n: 2, where: 'wing' },
    gear: jet || kind === 'four' || kind === 'twin' ? 'tri' : 'tail', cockpit: kind === 'bi' ? 'none' : 'glazed', stack: kind === 'bi' ? 2 : 1, alt: 22,
  }, (y, st) => {
    at(x, x.D.level + 1, () => {
      let id = 0;
      if (!jet) {
        turret(x, { id: id++, a: 0, f: st[3].f, y: y + R * 0.85, R: R * 0.45, H: R * 0.35, shape: 'dome', gun: { kind: 'mg', n: 2, len: 2 * Z, r: 0.13 * Z }, m: P.glass, phase: 1.2, sweep: 1 });
        if (big) turret(x, { id: id++, a: 0, f: st[st.length - 2].f, y: y + R * 0.1, R: R * 0.4, H: R * 0.3, shape: 'dome', gun: { kind: 'mg', n: 2, len: 2 * Z, r: 0.13 * Z }, m: P.glass, yaw0: Math.PI, arc: 1.4, phase: 2.2 });
        if (b > 0 || big) turret(x, { id: id++, a: 0, f: st[4].f, y: y - R * 1.3, R: R * 0.45, H: R * 0.35, shape: 'dome', gun: { kind: 'mg', n: 2, len: 2 * Z, r: 0.13 * Z }, m: P.glass, yaw0: Math.PI, arc: 3, phase: 3.1 });
        bombs(x, y - R, 0, big ? 4 : 3);
      } else if (kind === 'attackjet') {
        fixedGun(x, { kind: 'rotary', n: 7, len: 2 * Z, r: 0.16 * Z }, [0, y - R * 0.6, st[1].f], 0, 0.02);
        for (const s of [-1, 1]) { const p: V3 = [s * L * 0.3, y - R * 0.5, 0]; D.cap([p[0], p[1] + 0.6, p[2]], [p[0], p[1] + 0.1, p[2]], 0.2, 0.2, P.dark, D.depth(p)); barrels(x, { kind: 'rockets', n: 4, len: 3 * Z, r: 0.35 * Z, m: x.body2 }, [p[0], p[1], p[2] - 1.5], [0, -0.05, 1], { key: D.depth(p) + 0.01, depth: D.depth(p) }); }
      } else bombs(x, y - R, 0, 5, 1.2);
    });
  });
  x.label = { bi: 'Biplano bombardeiro', twin: 'Bombardeiro bimotor', four: 'Bombardeiro quadrimotor', attackjet: 'Jato de ataque ao solo', jetbomber: 'Bombardeiro a jato', wing: 'Asa voadora' }[kind];
}
function helicopter(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x), L = (15 + b * 4) * Z, R = 1.8 * Z * (1 + b * 0.15);
  const tandem = b === 2 && x.d[12] < 0.5;
  const y = airborne(x, 15, R + 1, y => {
    const st = fuselage(x, tandem ? L : L * 0.62, R, y, x.body, 'pod', 0.3);
    if (!tandem) {
      D.cap([0, y + R * 0.3, st[st.length - 1].f + 1], [0, y + R * 0.8, -L * 0.62], R * 0.45, R * 0.22, x.body, D.depth([0, y, -L * 0.4]));
      plate(x, [[0, y + R * 0.7, -L * 0.55], [0, y + R * 2.6, -L * 0.64], [0, y + R * 0.7, -L * 0.64]], x.body2);
      at(x, x.D.level + 1, () => propeller(x, [R * 0.35, y + R * 1.6, -L * 0.62], 1.9 * Z, 'y', flying(x), 3));
    }
    up(x, () => {
      dome(x, [0, y + R * 0.25, st[2].f], R * 0.8, L * 0.1, R * 0.7, P.glass);
      if (!tandem) {
        plate(x, [[-R * 0.8, y - R * 0.2, 0.5], [-R * 3.2, y - R * 0.3, 0.2], [-R * 3.2, y - R * 0.3, -1], [-R * 0.8, y - R * 0.2, -1.4]], x.body2);
        plate(x, [[R * 0.8, y - R * 0.2, 0.5], [R * 3.2, y - R * 0.3, 0.2], [R * 3.2, y - R * 0.3, -1], [R * 0.8, y - R * 0.2, -1.4]], x.body2);
        for (const s of [-1, 1]) barrels(x, { kind: 'rockets', n: 4, len: 2.6 * Z, r: 0.35 * Z, m: x.body2 }, [s * R * 2.6, y - R * 0.6, -1.4], [0, -0.03, 1], { key: D.depth([s * R * 2.6, y, 0]) + 0.02, depth: D.depth([s * R * 2.6, y, 0]) });
        turret(x, { id: 0, a: 0, f: st[1].f - 0.5, y: y - R * 1.1, R: R * 0.35, H: R * 0.35, shape: 'pintle', gun: { kind: e >= 6 ? 'laser' : 'rotary', n: 3, len: 2 * Z, r: 0.14 * Z }, m: x.body2, phase: 0.5, sweep: 0.9 });
      } else for (const s of [-1, 1]) fixedGun(x, { kind: 'mg', len: 2 * Z, r: 0.15 * Z }, [s * R, y, L * 0.1], s * 1.4, 0.3, s);
      for (const f of tandem ? [L * 0.38, -L * 0.38] : [0]) { rod(x, [0, y + R * 0.9, f], [0, y + R * 1.5, f], 0.4, P.dark); rotor(x, [0, y + R * 1.5, f], L * (tandem ? 0.35 : 0.5), 4, flying(x)); }
    });
  });
  if (!flying(x)) { for (const s of [-1, 1]) { D.cap([s * R * 1.1, 0.3, -L * 0.2], [s * R * 1.1, 0.3, L * 0.2], 0.3, 0.3, P.dark, D.depth([s * R, 0.3, 0])); for (const f of [-L * 0.1, L * 0.12]) rod(x, [s * R * 0.6, y - R * 0.8, f], [s * R * 1.1, 0.3, f], 0.18, P.dark); } }
  else groundShadow(x, L * 0.8, L * 0.8, y);
  x.label = tandem ? 'Helicóptero de dois rotores' : 'Helicóptero de ataque';
}
function autogyro(x: VCtx) {
  const { P, D } = x, Z = x.Z, L = 12 * Z, R = 1.3 * Z;
  plane(x, { L, R, body: 'pod', nose: 0.2, span: L * 0.5, chord: L * 0.12, plan: 'straight', pos: 'low', dih: 0.4, tail: 'twin', engines: { kind: 'prop', n: 1, where: 'nose' }, gear: 'tri', cockpit: 'bubble', alt: 14 }, (y, st) => {
    up(x, () => { rod(x, [0, y + R, 0], [0, y + R * 2.4, 0], 0.3, P.dark); rotor(x, [0, y + R * 2.4, 0], L * 0.55, 3, flying(x)); fixedGun(x, { kind: 'mg', len: 1.8 * Z, r: 0.14 * Z, muzzle: 'cooling' }, [R * 0.7, y, st[1].f], 0, 0.05); });
  });
  x.label = 'Autogiro armado';
  void D;
}
function multicopter(x: VCtx) {
  const { P, D } = x, Z = x.Z, b = tier(x), L = (12 + b * 4) * Z, R = 2.2 * Z;
  const y = airborne(x, 14, 3 * Z, y => {
    fuselage(x, L, R, y, x.body, 'pod', 0.2);
    up(x, () => {
      const n = b === 2 ? 6 : 4;
      for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2 + Math.PI / n, c: V3 = [Math.cos(t) * L * 0.55, y + R * 0.4, Math.sin(t) * L * 0.5]; rod(x, [0, y + R * 0.4, 0], c, 0.3, x.body2); engine(x, c, 1.7 * Z, 1, 'fan', x.body2, D.depth(c)); }
      dome(x, [0, y + R * 0.6, L * 0.25], R * 0.6, L * 0.12, R * 0.5, P.glass);
      turret(x, { id: 0, a: 0, f: L * 0.3, y: y - R * 1.1, R: R * 0.45, H: R * 0.4, shape: 'dome', gun: { kind: x.d[13] < 0.5 ? 'laser' : 'rotary', n: 4, len: 2.4 * Z, r: 0.16 * Z, muzzle: 'bulb' }, m: x.body2, phase: 0.4, sweep: 0.9 });
    });
  });
  if (!flying(x)) for (const s of [-1, 1]) D.cap([s * R, 0.3, -L * 0.3], [s * R, 0.3, L * 0.3], 0.3, 0.3, P.dark, D.depth([s * R, 0.3, 0]));
  else groundShadow(x, L * 1.2, L * 1.2, y);
  x.label = 'Multicóptero de ataque';
}

/** heavy: zeppelin, four-engine bomber, jet bomber / flying wing, flying carrier, sky fortress */
function heavy(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 3) return airship(x, true);
  if (e === 4) return bomberPlane(x, 'four');
  if (e === 5) return bomberPlane(x, x.d[11] < 0.5 ? 'wing' : 'jetbomber');
  if (e === 6) { // flying carrier: a deck held up by big ducted fans, drones launching
    const L = (40 + b * 8) * Z, W = L * 0.35;
    const y = airborne(x, 22, 6 * Z, y => {
      loft(x, [{ f: L / 2, w: W * 0.4, bw: W * 0.3, tw: W * 0.4, wy: 0.3, y0: y - 2.5 * Z, y1: y }, { f: L * 0.3, w: W / 2, bw: W * 0.4, tw: W / 2, wy: 0.3, y0: y - 3 * Z, y1: y }, { f: -L / 2, w: W / 2, bw: W * 0.4, tw: W / 2, wy: 0.3, y0: y - 3 * Z, y1: y }], x.body, { top: { ...P.deckSteel } });
      up(x, () => {
        for (const s of [-1, 1]) for (const f of [L * 0.3, -L * 0.3]) { const c: V3 = [s * (W / 2 + 3.6 * Z), y - 1, f]; rod(x, [s * W * 0.45, y - 1, f], c, 0.6, x.body2); engine(x, c, 3.4 * Z, 2, 'fan', x.body2, D.depth(c)); }
        loft(x, [{ f: L * 0.1, w: 2 * Z, bw: 2 * Z, tw: 1.6 * Z, wy: 0, y0: y, y1: y + 6 * Z }, { f: -L * 0.15, w: 2 * Z, bw: 2 * Z, tw: 1.6 * Z, wy: 0, y0: y, y1: y + 6 * Z }].map(s => ({ ...s })), x.body2, { key: D.depth([W * 0.3, y, 0]) });
        for (let i = 0; i < 3 + b; i++) plate(x, [[-W * 0.25, y + 0.2, -L * 0.35 + i * 3 * Z + 1.2 * Z], [-W * 0.25 + 1.5 * Z, y + 0.2, -L * 0.35 + i * 3 * Z], [-W * 0.25 - 1.5 * Z, y + 0.2, -L * 0.35 + i * 3 * Z]], P.mil2);
        if (acting(x)) { const f = lerp(-L * 0.2, L * 0.8, x.t), lift = Math.max(0, f - L * 0.45) * 0.4; plate(x, [[-W * 0.1, y + 0.4 + lift, f + 1.4 * Z], [-W * 0.1 + 1.8 * Z, y + 0.4 + lift, f], [-W * 0.1 - 1.8 * Z, y + 0.4 + lift, f]], P.mil2); exhaust(x, [-W * 0.1, y + 0.4 + lift, f - 0.6], 'glow', 0.6 * Z); }
        for (const s of [-1, 1]) turret(x, { id: s > 0 ? 0 : 1, a: s * W * 0.38, f: L * 0.42, y, R: 1.2 * Z, H: 1 * Z, shape: 'wedge', gun: { kind: 'laser', len: 4 * Z, r: 0.3 * Z, muzzle: 'bulb' }, m: x.body2, phase: s });
      });
    });
    groundShadow(x, W + 14 * Z, L, y);
    x.label = 'Porta-aviões voador';
    return;
  }
  // sky fortress: a huge saucer with a domed citadel and plasma batteries
  const R = (16 + b * 4) * Z;
  const y = airborne(x, 20, 3 + R * 0.1, y => {
    saucer(x, R, y, 0.25, x.body);
    at(x, x.D.level + 2, () => { for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + Math.PI / 4; turret(x, { id: i, a: Math.sin(t) * R * 0.55, f: Math.cos(t) * R * 0.55, y: y + R * 0.22, R: 1.6 * Z, H: 1.2 * Z, shape: 'saucer', gun: { kind: 'plasma', len: 6 * Z, r: 0.5 * Z, muzzle: 'bulb' }, m: x.body2, yaw0: -t + Math.PI / 2 * 0, phase: i, arc: 2 }); } });
    bombs(x, y - R * 0.1, 0, 3, 1.5);
  });
  groundShadow(x, R * 2, R * 2, y);
  x.label = 'Fortaleza celeste';
}

/** transform: a tiltrotor (e4) or a jet that lands and unfolds as a walker (e5+: 'idle' walker, 'move' jet) */
function transformer(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 4) return tiltrotor(x, false);
  const L = (14 + b * 3) * Z, R = 1.4 * Z, span = L * 0.75;
  const m = x.anim === 'idle' ? 1 : x.anim === 'move' ? 0 : Math.pow(Math.sin(Math.PI * Math.min(1, x.t * 1.25)), 0.7);
  const hip = 9 * Z * m, y = (1 - m) * 18 + hip + (m > 0.9 ? Math.sin(x.ph) * 0.3 : 0);
  if (m > 0.05) legs(x, R * 2.2, [-L * 0.15], y, hip, 1 * Z, P.steel, 'bird', 'claw');
  const pf = pitchFrame(y + R, -L * 0.15, m * 1.2);
  transformed(x, pf.T, pf.Tn, () => {
    const st = fuselage(x, L, R, y + R, x.body, 'tube', 1);
    up(x, () => {
      dome(x, [0, y + R * 1.8, st[2].f], R * 0.55, L * 0.1, R * 0.6, P.glass);
      const fold = 1 - m * 0.7;
      for (const s of [-1, 1]) plate(x, [[s * R * 0.8, y + R, L * 0.05], [s * (R + (span / 2 - R) * fold), y + R, -L * 0.18 - m * L * 0.1], [s * (R + (span / 2 - R) * fold), y + R, -L * 0.28 - m * L * 0.1], [s * R * 0.8, y + R, -L * 0.3]], x.body2, undefined, P.dark);
      plate(x, [[0, y + R * 1.8, -L * 0.3], [0, y + R * 3.8, -L * 0.45], [0, y + R * 1.8, -L * 0.5]], x.body2);
    });
    if (m < 0.5 && x.anim !== 'idle') exhaust(x, [0, y + R, -L * 0.52], 'jet', 1.2 * Z, [0, 0, -1]);
  });
  if (m > 0.4) up(x, () => { for (const s of [-1, 1]) { const sh: V3 = [s * R * 1.6, y + R * 2, 0], hand: V3 = [s * R * 1.9, y - 1.5 * Z, 4 * Z * m]; D.cap(sh, hand, 0.9 * Z, 0.6 * Z, P.steel, D.depth(sh) + 0.3); if (s > 0) fixedGun(x, e >= 7 ? { kind: 'plasma', len: 3 * Z, r: 0.35 * Z, muzzle: 'bulb' } : e === 6 ? { kind: 'laser', len: 3.5 * Z, r: 0.3 * Z, muzzle: 'bulb' } : { kind: 'rotary', n: 5, len: 3 * Z, r: 0.18 * Z }, hand, 0.05, 0.2); } });
  if (m < 0.2) planShadow(x, L, span, L * 0.2, y);
  x.label = 'Jato-robô';
}

export const AIR = { transport, light: fighter, medium: attack, heavy, transform: transformer };
void rod; void smooth;
