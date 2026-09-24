// Death animations for civilised creatures (any species, naked, clothed or armoured, holding anything).
//
// Still the same flat 2D pixel art: the body is drawn in named sections (civ.ts) and a death only decides where each
// section goes over time - a rigid placement per section, sometimes two placements with a cutting plane (a body cut
// in half), or none (blown apart). Blood, pools, splats and gore (gibs, bones, organs, guts, stump and cut faces)
// are ellipses, capsules and polygons too. Blood takes the species' colour in Alien-like worlds.
//   Common deaths (a thrust, a plain cut): fall forward / backward, a little blood pooling under the body.
//   Brutal deaths: each limb and the head severed, cut in half horizontally or vertically, upper or lower body
//   exploding - fountains, sprays, gibs and big pools.
import type { Mat } from './raster';
import { ramp } from './raster';
import type { Sketch, V3, Xf } from './pose';
import type { Body } from './civ';
import type { Genome } from './genome';
import { mulberry, seedToInt } from '../terrain/noise';

export type Death =
  | 'fall_fwd' | 'fall_back' | 'sever_head' | 'sever_arm_r' | 'sever_arm_l' | 'sever_leg_r' | 'sever_leg_l'
  | 'cut_h' | 'cut_v' | 'burst_top' | 'burst_bottom';
export const DEATHS: { id: Death; name: string; brutal: boolean }[] = [
  { id: 'fall_fwd', name: 'Cai para frente', brutal: false },
  { id: 'fall_back', name: 'Cai para trás', brutal: false },
  { id: 'sever_head', name: 'Decapitação', brutal: true },
  { id: 'sever_arm_r', name: 'Braço direito decepado', brutal: true },
  { id: 'sever_arm_l', name: 'Braço esquerdo decepado', brutal: true },
  { id: 'sever_leg_r', name: 'Perna direita decepada', brutal: true },
  { id: 'sever_leg_l', name: 'Perna esquerda decepada', brutal: true },
  { id: 'cut_h', name: 'Cortado ao meio (horizontal)', brutal: true },
  { id: 'cut_v', name: 'Cortado ao meio (vertical)', brutal: true },
  { id: 'burst_top', name: 'Tronco explode', brutal: true },
  { id: 'burst_bottom', name: 'Pernas explodem', brutal: true },
];
/** a death plays once over these frames (the last one is held) */
export const DEATH_FRAMES = 16;
const DUR = 2.4;            // seconds the frames cover
const GRAV = 540;           // body units / s² (a body ~100 units ≈ 1.8 m)

// ---------------------------------------------------------------------------------------------------
// Small linear algebra
// ---------------------------------------------------------------------------------------------------
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mv = (R: number[], v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const mm = (A: number[], B: number[]) => { const o = new Array(9).fill(0); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]; return o; };
function rot(axis: V3, a: number): number[] {
  const [x, y, z] = nrm(axis), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
/** rotate by R about `pivot`, then move by `T` */
const about = (R: number[], pivot: V3, T: V3 = [0, 0, 0]): Xf => ({ R, t: add(sub(pivot, mv(R, pivot)), T) });
const then = (a: Xf, b: Xf): Xf => ({ R: mm(b.R, a.R), t: add(mv(b.R, a.t), b.t) }); // a first, then b
const apply = (x: Xf, p: V3): V3 => add(mv(x.R, p), x.t);
const ID: Xf = { R: I3, t: [0, 0, 0] };
const withClip = (x: Xf, n: V3, p: V3): Xf => ({ ...x, clip: { n, p } });
const seg = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
const easeIn = (u: number) => u * u;
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

// ---------------------------------------------------------------------------------------------------
// Motions
// ---------------------------------------------------------------------------------------------------
/** the whole body (or what is left of it) toppling towards `dir` from p0, over `len`, landing with a small bounce */
function topple(B: Body, p: number, p0: number, dir: V3, len = 0.4, pivotY = 0): Xf {
  const u = seg(p, p0, p0 + len), bounce = Math.sin(Math.PI * seg(p, p0 + len, p0 + len + 0.1)) * 0.07;
  const a = (Math.PI / 2) * easeIn(u) - bounce;
  const d = nrm(dir), axis = cross([0, 1, 0], d);
  const pivot: V3 = [d[0] * B.U * 0.14, pivotY, d[2] * B.U * 0.14];
  return about(rot(axis, a), pivot, [0, B.rC * 0.8 * easeIn(u), 0]);
}
/** a piece flung from `J` (its joint, creature frame) that spins and lands lying at height `rest` */
function flight(p: number, p0: number, J: V3, v: V3, axis: V3, spin: number, rest: number): Xf {
  const T = Math.max(0, (p - p0) * DUR);
  const disc = v[1] * v[1] + 2 * GRAV * (J[1] - rest);
  const TL = (v[1] + Math.sqrt(Math.max(0, disc))) / GRAV; // time to reach the rest height
  const tt = Math.min(T, TL), slide = T > TL ? (1 - Math.exp(-(T - TL) * 5)) * 0.18 : 0;
  const pos: V3 = [J[0] + v[0] * (tt + slide), Math.max(rest, J[1] + v[1] * tt - 0.5 * GRAV * tt * tt), J[2] + v[2] * (tt + slide)];
  const a = spin * Math.min(1, T / Math.max(0.05, TL));
  return about(rot(axis, a), J, sub(pos, J));
}

// ---------------------------------------------------------------------------------------------------
// Gore materials and pieces
// ---------------------------------------------------------------------------------------------------
interface Gore { blood: Mat; blood2: Mat; flesh: Mat; meat: Mat; bone: Mat; organ: Mat; brain: Mat; skin: Mat }
function goreOf(g: Genome, skin: Mat): Gore {
  const h = g.mode === 'alien' ? g.glowHue : 0.995;
  return {
    blood: { ramp: ramp(h, 0.8, 0.28), tex: 'smooth', spec: 0.5 },
    blood2: { ramp: ramp(h, 0.75, 0.2), tex: 'gel', spec: 0.7 },
    flesh: { ramp: ramp(h + 0.01, 0.6, 0.45), tex: 'skin', spec: 0.35 },
    meat: { ramp: ramp(h, 0.65, 0.33), tex: 'fin', spec: 0.3 },
    bone: { ramp: ramp(0.11, 0.18, 0.86), tex: 'bone', spec: 0.2 },
    organ: { ramp: ramp(h - 0.04, 0.45, 0.6), tex: 'gel', spec: 0.5 },
    brain: { ramp: ramp(h - 0.05, 0.35, 0.72), tex: 'wool', spec: 0.3 },
    skin,
  };
}
type GibKind = 'meat' | 'bone' | 'organ' | 'eye' | 'gut';
interface Gib { kind: GibKind; o: V3; v: V3; axis: V3; w: number; r: number; p0: number }
interface Drop { o: (p: number) => V3; dir: (p: number) => V3; p0: number; p1: number; n: number; speed: number; spread: number; size: number; pulse?: boolean }
interface Pool { at: (p: number) => V3; p0: number; r: number; grow: number }

/** where a flung piece is at time T (ballistic with bounces), and whether it has landed */
function simulate(gb: Gib, T: number) {
  let p: V3 = [...gb.o] as V3, v: V3 = [...gb.v] as V3, t = 0, landed = -1, angle = 0;
  const dt = 1 / 60;
  while (t < T) {
    const h = Math.min(dt, T - t);
    v = [v[0], v[1] - GRAV * h, v[2]];
    p = add(p, mul(v, h));
    if (p[1] < gb.r * 0.7) {
      p[1] = gb.r * 0.7;
      if (landed < 0) landed = t;
      v = [v[0] * 0.55, Math.abs(v[1]) > 60 ? -v[1] * 0.3 : 0, v[2] * 0.55];
      if (Math.hypot(v[0], v[2]) < 8) v = [0, v[1], 0];
    }
    if (Math.hypot(v[0], v[1], v[2]) > 1) angle += gb.w * h;
    t += h;
  }
  return { p, landed, angle };
}

// ---------------------------------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------------------------------
export interface DeathHooks {
  begin: (S: Sketch, B: Body, ph: number) => void;
  draw: (S: Sketch, B: Body, ph: number) => void;
  /** placements for a held item (it follows a severed arm, is dropped or flung away) */
  items: (armIndex: number) => Xf[];
}

export function makeDeath(g: Genome, kind: Death, skin: Mat): DeathHooks {
  const G = goreOf(g, skin);
  let place: (name: string) => Xf[] | null = () => null;
  let after: (S: Sketch, name: string, i: number) => void = () => {};
  let gore: (S: Sketch) => void = () => {};
  let items: (armIndex: number) => Xf[] = () => [ID];

  const begin = (S: Sketch, B: Body, ph: number) => {
    const p = Math.min(1, (ph / (Math.PI * 2)) * DEATH_FRAMES / (DEATH_FRAMES - 1));
    const r = mulberry(seedToInt(`${g.seed}:death:${kind}`)), rn = () => r() * 2 - 1;
    const U = B.U, P = B.P, C = B.C, H = B.H;
    const armI = (s: number) => B.arms.findIndex(a => !a.lower && a.s === s), legI = (s: number) => B.legs.findIndex(l => l.s === s);
    const yc = P[1] + (C[1] - P[1]) * 0.4, rc = lerp(B.rP, B.rC, 0.4) + 1.2;
    const gibs: Gib[] = [], drops: Drop[] = [], pools: Pool[] = [];
    const stumps: { name: string; i: number; at: V3; dir: V3; r: number }[] = [];
    const faces: { name: string; i: number; draw: (S: Sketch) => void }[] = [];
    const ground = (q: V3): V3 => [q[0], 0, q[2]];
    items = () => [ID];
    const drawCaps = true;

    const simpleFall = (dir: V3) => {
      const body = topple(B, p, 0.08, dir, 0.42);
      place = n => (n.startsWith('item') ? null : [body]);
      const land = topple(B, 1, 0.08, dir, 0.42);
      pools.push({ at: () => ground(add(apply(land, C), [0, 0, B.rC * 1.1])), p0: 0.55, r: U * 0.75, grow: 0.4 }); // seeps out from under the body
      drops.push({ o: () => apply(topple(B, 0.5, 0.08, dir, 0.42), C), dir: () => [dir[0] * 0.3, 1, dir[2] * 0.3], p0: 0.48, p1: 0.56, n: 7, speed: 90, spread: 60, size: 1 });
      // what was held is dropped: it tumbles out of the hand onto the ground
      items = i => {
        const a = B.arms[i];
        return a ? [flight(p, 0.2, a.hand, [dir[0] * 60 + rn() * 20 + dir[2] * 20, 60, a.s * 50], [0, 0, 1], (dir[0] >= 0 ? -1 : 1) * 1.4, U * 0.1)] : [body];
      };
    };

    switch (kind) {
      case 'fall_fwd': simpleFall([1, 0, 0]); break;
      case 'fall_back': simpleFall([-1, 0, 0]); break;

      case 'sever_head': case 'sever_arm_r': case 'sever_arm_l': case 'sever_leg_r': case 'sever_leg_l': {
        const part = kind === 'sever_head' ? 'head' : kind.startsWith('sever_arm') ? 'arm' + armI(kind.endsWith('_r') ? 1 : -1) : 'leg' + legI(kind.endsWith('_r') ? 1 : -1);
        const s = kind.endsWith('_r') ? 1 : kind.endsWith('_l') ? -1 : 0;
        const isLeg = part.startsWith('leg'), isArm = part.startsWith('arm');
        const idx = Number(part.slice(3));
        if ((isLeg && !B.legs[idx]) || (isArm && !B.arms[idx])) { simpleFall([1, 0, 0]); break; }
        const J: V3 = kind === 'sever_head' ? [C[0] + U * 0.1, C[1] + B.rC * 0.75, 0] : isArm ? B.arms[idx].sh : B.legs[idx].hip;
        const out: V3 = kind === 'sever_head' ? [0.15, 1, 0] : isArm ? [0, 0.2, s] : [0, -1, s * 0.3];
        const rJ = kind === 'sever_head' ? B.rC * 0.42 : isArm ? U * 0.13 * (B.rC / (0.4 * U)) : U * 0.17 * (B.rC / (0.4 * U));
        const v: V3 = kind === 'sever_head' ? [rn() * 60 - 30, 240 + r() * 60, rn() * 40] : isArm ? [rn() * 50, 150 + r() * 60, s * (160 + r() * 60)] : [rn() * 40, 60, s * (90 + r() * 40)];
        const axis: V3 = kind === 'sever_head' ? [rn() * 0.3, rn() * 0.3, 1] : isArm ? [1, 0, rn() * 0.3] : [1, 0, 0];
        const spin = kind === 'sever_head' ? (r() < 0.5 ? -1 : 1) * Math.PI * (1.5 + r()) : isArm ? s * Math.PI * 2.5 : s * Math.PI * 0.5;
        const rest = kind === 'sever_head' ? B.R * 0.8 : rJ;
        const piece = flight(p, 0.03, J, v, axis, spin, rest);
        const falls: V3 = kind === 'sever_head' ? [1, 0, 0] : isArm ? [-1, 0, 0] : [0.2, 0, s];
        const body = topple(B, p, isLeg ? 0.1 : 0.32, falls, isLeg ? 0.32 : 0.42);
        const bodyAt = (q: number) => topple(B, q, isLeg ? 0.1 : 0.32, falls, isLeg ? 0.32 : 0.42);
        place = n => (n === part ? [piece] : n.startsWith('item') ? null : [body]);
        items = i => (isArm && i === idx ? [piece] : [body]);
        stumps.push({ name: isLeg ? 'torso' : 'torso', i: 0, at: J, dir: out, r: rJ }, { name: part, i: 0, at: J, dir: mul(out, -1), r: rJ * 0.95 });
        // a pulsing fountain from the stump while the heart still beats, a trail from the flying piece
        drops.push({ o: q => apply(bodyAt(q), J), dir: q => mv(bodyAt(q).R, out), p0: 0.02, p1: 0.6, n: 70, speed: 210, spread: 45, size: 1.3, pulse: true });
        drops.push({ o: q => apply(flight(q, 0.03, J, v, axis, spin, rest), J), dir: () => [0, 1, 0], p0: 0.03, p1: 0.35, n: 16, speed: 30, spread: 40, size: 1 });
        const landBody = topple(B, 1, isLeg ? 0.1 : 0.32, falls, isLeg ? 0.32 : 0.42), landPiece = flight(1, 0.03, J, v, axis, spin, rest);
        pools.push({ at: () => ground(apply(landBody, J)), p0: 0.45, r: U * 0.75, grow: 0.5 }, { at: () => ground(apply(landBody, C)), p0: 0.6, r: U * 0.45, grow: 0.4 }, { at: () => ground(apply(landPiece, J)), p0: 0.35, r: U * 0.35, grow: 0.4 });
        break;
      }

      case 'cut_h': {
        const upper = (q: number) => {
          const slide = easeOut(seg(q, 0, 0.12)), u = seg(q, 0.1, 0.48), bounce = Math.sin(Math.PI * seg(q, 0.48, 0.58)) * 0.06;
          const a = (Math.PI / 2) * easeIn(u) - bounce;
          return about(rot([0, 0, -1], a), [rc * 0.8, yc, 0], [U * 0.3 * slide, -(yc - rc * 0.95) * easeIn(u), 0]);
        };
        const lower = (q: number) => topple(B, q, 0.45, [-1, 0, 0], 0.38);
        const up = withClip(upper(p), [0, 1, 0], [0, yc, 0]), lo = withClip(lower(p), [0, -1, 0], [0, yc, 0]);
        place = n => (n === 'torso' || n === 'back' ? [up, lo] : n === 'misc' || n === 'aux:back' ? [upper(p)] : n === 'aux:belt' || n.startsWith('leg') || n === 'tail' ? [lower(p)] : n.startsWith('item') ? null : [upper(p)]);
        items = () => [upper(p)];
        const ring = (S: Sketch, face: number) => { // the cut surface: flesh, guts and the spine
          if (S.facing([0, face, 0]) < 0.04) return;
          const pts: V3[] = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; pts.push([Math.cos(t) * rc, yc + face * 0.2, Math.sin(t) * rc * 0.95]); }
          S.poly(pts, G.flesh, { bias: 0.4, flat: 0.6 });
          S.poly(pts.map(q => [q[0] * 0.75, q[1] + face * 0.1, q[2] * 0.75] as V3), G.meat, { bias: 0.41, flat: 0.6 });
          S.ball([-rc * 0.55, yc + face * 0.3, 0], rc * 0.22, G.bone, { bias: 0.42 });
          for (let i = 0; i < 4; i++) S.ball([rc * (0.1 + i * 0.12), yc + face * 0.35, rc * (i % 2 ? 0.3 : -0.3)], rc * 0.2, G.organ, { bias: 0.43 });
        };
        faces.push({ name: 'torso', i: 0, draw: S => ring(S, -1) }, { name: 'torso', i: 1, draw: S => ring(S, 1) });
        drops.push({ o: q => apply(lower(q), [0, yc, 0]), dir: q => mv(lower(q).R, [0, 1, 0]), p0: 0.02, p1: 0.55, n: 80, speed: 230, spread: 55, size: 1.3, pulse: true });
        drops.push({ o: q => apply(upper(q), [0, yc, 0]), dir: q => mv(upper(q).R, [0, -1, 0]), p0: 0.02, p1: 0.45, n: 40, speed: 120, spread: 60, size: 1.2 });
        for (let i = 0; i < 7; i++) gibs.push({ kind: i < 3 ? 'gut' : 'organ', o: [rn() * rc * 0.5, yc, rn() * rc * 0.5], v: [60 + r() * 90, 40 + r() * 60, rn() * 60], axis: [rn(), 1, rn()], w: rn() * 8, r: U * (0.07 + r() * 0.05), p0: 0.14 + r() * 0.2 });
        pools.push({ at: () => ground(apply(lower(1), [0, yc, 0])), p0: 0.5, r: U * 0.8, grow: 0.5 }, { at: () => ground(apply(upper(1), [0, yc, 0])), p0: 0.45, r: U * 0.7, grow: 0.5 }, { at: () => [U * 0.8, 0, 0], p0: 0.3, r: U * 0.5, grow: 0.5 });
        break;
      }

      case 'cut_v': {
        const half = (s: number) => (q: number) => {
          const sep = easeOut(seg(q, 0, 0.12)), u = seg(q, 0.08, 0.5), bounce = Math.sin(Math.PI * seg(q, 0.5, 0.6)) * 0.06;
          const a = s * ((Math.PI / 2) * easeIn(u) - bounce);
          return about(rot([1, 0, 0], a), [0, 0, s * B.rP * 0.6], [0, B.rC * 0.3 * easeIn(u), s * U * 0.15 * sep]);
        };
        const R_ = half(1), L_ = half(-1);
        const hr = withClip(R_(p), [0, 0, 1], [0, 0, 0]), hl = withClip(L_(p), [0, 0, -1], [0, 0, 0]);
        const sideOf = (n: string) => { const i = Number(n.slice(n.startsWith('item') ? 4 : 3)); const s = n.startsWith('leg') ? B.legs[i]?.s : B.arms[i]?.s; return (s ?? 1) > 0 ? R_(p) : L_(p); };
        place = n => (n.startsWith('arm') || n.startsWith('leg') ? [sideOf(n)] : n.startsWith('item') ? null : [hr, hl]);
        items = i => [(B.arms[i]?.s ?? 1) > 0 ? R_(p) : L_(p)];
        const profile = (S: Sketch, s: number, head: boolean) => { // the cut face in the body's middle plane
          if (S.facing([0, 0, -s]) < 0.04) return;
          const z = -s * 0.2;
          if (!head) {
            const pts: V3[] = [];
            for (let i = 0; i <= 10; i++) { const t = Math.PI / 2 + (i / 10) * Math.PI; pts.push([P[0] + Math.cos(t) * B.rP, P[1] + Math.sin(t) * B.rP, z]); }
            for (let i = 0; i <= 10; i++) { const t = -Math.PI / 2 + (i / 10) * Math.PI; pts.push([C[0] + Math.cos(t) * B.rC, C[1] + Math.sin(t) * B.rC, z]); }
            S.poly(pts.reverse(), G.flesh, { bias: 0.5, flat: 0.6 });
            S.limb([P[0] - B.rP * 0.6, P[1], z], [C[0] - B.rC * 0.6, C[1] + B.rC * 0.6, z], U * 0.05, U * 0.05, G.bone, { bias: 0.52 });
            for (let i = 0; i < 4; i++) { const y = C[1] + B.rC * (0.4 - i * 0.28); S.limb([C[0] - B.rC * 0.6, y, z], [C[0] + B.rC * 0.55, y - B.rC * 0.15, z], 0.8, 0.7, G.bone, { bias: 0.53 }); }
            for (let i = 0; i < 6; i++) S.ball([P[0] + B.rP * (0.35 - (i % 3) * 0.3), P[1] + B.rP * (0.6 - Math.floor(i / 3) * 0.45), z], B.rP * 0.28, i % 2 ? G.organ : G.meat, { bias: 0.54 });
            S.limb([C[0] + U * 0.06, C[1], z], [H[0] - B.R * 0.2, H[1] - B.R * 0.55, z], B.rC * 0.3, B.rC * 0.28, G.flesh, { bias: 0.5 });
          } else {
            const pts: V3[] = []; for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; pts.push([H[0] + Math.cos(t) * B.R * 0.92, H[1] + Math.sin(t) * B.R * 0.9, z]); }
            S.poly(pts, G.flesh, { bias: 1.4, flat: 0.6 });
            S.ball([H[0] - B.R * 0.15, H[1] + B.R * 0.25, z], B.R * 0.55, G.brain, { bias: 1.45 });
            S.ball([H[0] + B.R * 0.55, H[1] + B.R * 0.05, z], B.R * 0.16, G.meat, { bias: 1.46 });
          }
        };
        faces.push({ name: 'torso', i: 0, draw: S => profile(S, 1, false) }, { name: 'torso', i: 1, draw: S => profile(S, -1, false) }, { name: 'head', i: 0, draw: S => profile(S, 1, true) }, { name: 'head', i: 1, draw: S => profile(S, -1, true) });
        for (let k2 = 0; k2 < 5; k2++) { const y = lerp(P[1] - U * 0.3, H[1], k2 / 4); for (const s of [-1, 1]) drops.push({ o: () => [0, y, 0], dir: () => [0.2, 0.8, s], p0: 0.01, p1: 0.16, n: 9, speed: 110, spread: 60, size: 1.3 }); }
        for (let i = 0; i < 6; i++) gibs.push({ kind: i < 2 ? 'gut' : 'organ', o: [rn() * B.rP * 0.5, P[1] + r() * U * 0.4, 0], v: [rn() * 60, 30 + r() * 50, rn() * 50], axis: [rn(), 1, rn()], w: rn() * 6, r: U * (0.06 + r() * 0.05), p0: 0.12 + r() * 0.15 });
        pools.push({ at: () => [0, 0, 0], p0: 0.3, r: U * 1.0, grow: 0.6 }, { at: () => ground(apply(R_(1), C)), p0: 0.5, r: U * 0.6, grow: 0.4 }, { at: () => ground(apply(L_(1), C)), p0: 0.5, r: U * 0.6, grow: 0.4 });
        break;
      }

      case 'burst_top': case 'burst_bottom': {
        const top = kind === 'burst_top', pb = 0.1;
        const jitter: Xf = p < pb ? { R: I3, t: [rn() * U * 0.03, rn() * U * 0.02, rn() * U * 0.03] } : ID;
        // what is left always slumps forward - nothing is launched by the blast
        const fallDir: V3 = [1, 0, 0];
        if (top) {
          const lower = (q: number) => then(q < pb ? jitter : ID, topple(B, q, 0.55, fallDir, 0.32));
          const lo = withClip(lower(p), [0, -1, 0], [0, yc, 0]);
          // the back gear is torn off and thrown with the gibs (it never stays hanging in the air)
          const pack = flight(p, pb, [C[0] - B.rC * 1.3, C[1], 0], [-80 - r() * 40, 150 + r() * 60, rn() * 60], [0, 0, 1], 2.2, B.rC * 0.6);
          place = n => (p < pb ? [jitter] : n === 'torso' || n === 'back' || n === 'misc' ? [lo] : n.startsWith('leg') || n === 'tail' || n === 'aux:belt' ? [lower(p)] : n === 'aux:back' ? [pack] : n.startsWith('item') ? null : []);
          faces.push({ name: 'torso', i: 0, draw: S => { if (p < pb) return; const pts: V3[] = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; pts.push([Math.cos(t) * rc * (0.9 + (i % 3) * 0.12), yc + (i % 2) * 2, Math.sin(t) * rc]); } if (S.facing([0, 1, 0]) > 0.04) { S.poly(pts, G.meat, { bias: 0.4, flat: 0.5 }); S.ball([-rc * 0.55, yc + 2, 0], rc * 0.24, G.bone, { bias: 0.42 }); S.limb([-rc * 0.55, yc, 0], [-rc * 0.6, yc + U * 0.25, 0], U * 0.04, U * 0.03, G.bone, { bias: 0.43 }); } } });
          drops.push({ o: q => apply(lower(q), [0, yc, 0]), dir: q => mv(lower(q).R, [0, 1, 0]), p0: pb, p1: 0.62, n: 70, speed: 260, spread: 50, size: 1.3, pulse: true });
          for (let i = 0; i < 4; i++) drops.push({ o: () => [0, C[1], 0], dir: () => [rn(), 0.6 + r(), rn()], p0: pb, p1: pb + 0.03, n: 26, speed: 210, spread: 90, size: 1.5 });
          const chunk = (o: V3, kindG: GibKind, rr: number) => { const d = nrm(add(sub(o, [0, C[1] - U * 0.3, 0]), [rn() * 0.4, 0.5, rn() * 0.4])); gibs.push({ kind: kindG, o, v: add(mul(d, 100 + r() * 120), [0, 110, 0]), axis: [rn(), rn(), rn()], w: rn() * 16, r: rr, p0: pb }); };
          for (let i = 0; i < 12; i++) chunk([rn() * B.rC, lerp(yc, C[1] + B.rC, r()), rn() * B.rC], 'meat', U * (0.1 + r() * 0.1));
          for (let i = 0; i < 6; i++) chunk([rn() * B.rC, lerp(yc, C[1], r()), rn() * B.rC], 'bone', U * (0.07 + r() * 0.04));
          for (let i = 0; i < 5; i++) chunk([rn() * B.rC * 0.6, lerp(yc, C[1], r()), rn() * B.rC * 0.6], i < 2 ? 'gut' : 'organ', U * (0.06 + r() * 0.05));
          for (let i = 0; i < 4; i++) chunk([H[0] + rn() * B.R, H[1] + rn() * B.R, rn() * B.R], i < 2 ? 'eye' : 'meat', i < 2 ? B.R * 0.22 : U * 0.1);
          for (const a of B.arms) chunk(a.el, 'meat', U * 0.1);
          items = i => { const a = B.arms[i]; return a ? [flight(p, pb, a.hand, [rn() * 90, 200 + r() * 80, a.s * 90], [rn(), rn(), 1], rn() * 12, U * 0.12)] : []; };
          pools.push({ at: () => [0, 0, 0], p0: 0.2, r: U * 1.2, grow: 0.7 }, { at: () => ground(apply(lower(1), [0, yc, 0])), p0: 0.7, r: U * 0.8, grow: 0.3 });
        } else {
          const drop = (q: number) => {
            const T = Math.max(0, (q - pb) * DUR), fallH = yc - rc * 0.95, y = Math.min(fallH, 0.5 * GRAV * T * T);
            const u = seg(q, 0.42, 0.72), a = (Math.PI / 2) * easeIn(u);
            const d: Xf = { R: I3, t: [0, -y, 0] };
            // the torso falls straight down onto its stump, then slumps over its front edge
            const tip = about(rot(cross([0, 1, 0], fallDir), a), [fallDir[0] * rc, rc * 0.95, 0], [0, B.rC * 0.25 * easeIn(u), 0]);
            return then(then(q < pb ? jitter : ID, d), tip);
          };
          const up = withClip(drop(p), [0, 1, 0], [0, yc, 0]);
          place = n => (p < pb ? [jitter] : n === 'torso' || n === 'back' || n === 'misc' ? [up] : n.startsWith('leg') || n === 'tail' || n === 'aux:belt' ? [] : n.startsWith('item') ? null : [drop(p)]);
          items = () => [drop(p)];
          faces.push({ name: 'torso', i: 0, draw: S => { if (p < pb || S.facing([0, -1, 0]) < 0.04) return; const pts: V3[] = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; pts.push([Math.cos(t) * rc, yc - (i % 2) * 2, Math.sin(t) * rc]); } S.poly(pts, G.meat, { bias: 0.4, flat: 0.5 }); } });
          drops.push({ o: q => apply(drop(q), [0, yc, 0]), dir: q => mv(drop(q).R, [0, -0.3, 0]), p0: pb, p1: 0.6, n: 50, speed: 140, spread: 80, size: 1.3, pulse: true });
          for (let i = 0; i < 4; i++) drops.push({ o: () => [0, P[1] * 0.5, 0], dir: () => [rn(), 0.4 + r(), rn()], p0: pb, p1: pb + 0.03, n: 24, speed: 190, spread: 90, size: 1.5 });
          for (const l of B.legs) {
            for (const [a0, a1] of [[l.hip, l.knee], [l.knee, l.ankle]] as [V3, V3][]) {
              for (let i = 0; i < 3; i++) { const o = lerp3(a0, a1, r()); gibs.push({ kind: 'meat', o, v: [rn() * 130, 140 + r() * 130, l.s * (40 + r() * 110)], axis: [rn(), rn(), rn()], w: rn() * 14, r: U * (0.07 + r() * 0.06), p0: pb }); }
              gibs.push({ kind: 'bone', o: lerp3(a0, a1, 0.5), v: [rn() * 110, 160 + r() * 110, l.s * (30 + r() * 100)], axis: [rn(), rn(), rn()], w: rn() * 12, r: U * 0.08, p0: pb });
            }
          }
          if (!B.legs.length) for (let i = 0; i < 10; i++) gibs.push({ kind: 'meat', o: [rn() * U, U * 0.3, rn() * U * 0.3], v: [rn() * 130, 150 + r() * 120, rn() * 110], axis: [rn(), rn(), rn()], w: rn() * 14, r: U * 0.1, p0: pb });
          for (let i = 0; i < 3; i++) gibs.push({ kind: 'gut', o: [0, yc, 0], v: [rn() * 80, 60 + r() * 60, rn() * 80], axis: [rn(), 1, rn()], w: rn() * 6, r: U * 0.07, p0: pb + 0.02 });
          pools.push({ at: () => [0, 0, 0], p0: 0.16, r: U * 1.25, grow: 0.7 }, { at: () => ground(apply(drop(1), [0, yc, 0])), p0: 0.5, r: U * 0.7, grow: 0.4 });
        }
        break;
      }
    }

    after = (S2, name, i) => {
      if (!drawCaps) return;
      for (const st of stumps) if (st.name === name && st.i === i) {
        S2.ball(add(st.at, mul(nrm(st.dir), st.r * 0.25)), st.r * 1.02, G.flesh, { bias: 0.35 });
        S2.ball(add(st.at, mul(nrm(st.dir), st.r * 0.55)), st.r * 0.62, G.meat, { bias: 0.36 });
        S2.ball(add(st.at, mul(nrm(st.dir), st.r * 0.7)), st.r * 0.32, G.bone, { bias: 0.37 });
      }
      for (const f of faces) if (f.name === name && f.i === i) f.draw(S2);
    };
    // blood & gore in world space (drawn with no section placement)
    gore = S2 => {
      const T = p * DUR, splat = (at: V3, rr: number, m: Mat, key = -1000) => {
        const pts: V3[] = [];
        const q = mulberry(seedToInt(`${at[0] | 0},${at[2] | 0}`));
        for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2, k = 0.75 + q() * 0.45; pts.push([at[0] + Math.cos(t) * rr * k, 0.2, at[2] + Math.sin(t) * rr * k]); }
        S2.poly(pts, m, { bias: key, flat: 0.95 });
      };
      for (const pl of pools) { const u = seg(p, pl.p0, pl.p0 + pl.grow); if (u > 0) splat(pl.at(p), pl.r * easeOut(u), G.blood2, -1002); }
      for (const d of drops) {
        const q = mulberry(seedToInt(`${d.p0}:${d.n}:${d.speed}`));
        for (let i = 0; i < d.n; i++) {
          let pe = lerp(d.p0, d.p1, q());
          if (d.pulse) pe = d.p0 + Math.round((pe - d.p0) / 0.06) * 0.06 + q() * 0.012; // spurts with the heartbeat
          const sp = d.speed * (0.55 + q() * 0.7), jit: V3 = [(q() * 2 - 1) * d.spread, (q() * 2 - 1) * d.spread * 0.5, (q() * 2 - 1) * d.spread], rr = d.size * (0.7 + q() * 0.8);
          if (p < pe) continue;
          const o = d.o(pe), v = add(mul(nrm(d.dir(pe)), sp), jit), t = (p - pe) * DUR;
          const y = o[1] + v[1] * t - 0.5 * GRAV * t * t;
          if (y > 0.5) {
            const pos: V3 = [o[0] + v[0] * t, y, o[2] + v[2] * t], vel: V3 = [v[0], v[1] - GRAV * t, v[2]];
            S2.limb(pos, sub(pos, mul(vel, 0.012)), rr, rr * 0.7, G.blood, { bias: 2 });
          } else {
            const tl = (v[1] + Math.sqrt(Math.max(0, v[1] * v[1] + 2 * GRAV * o[1]))) / GRAV;
            splat([o[0] + v[0] * tl, 0, o[2] + v[2] * tl], rr * 2.2 * Math.min(1.4, 1 + (t - tl) * 0.8), G.blood, -1001);
          }
        }
      }
      for (const gb of gibs) {
        if (p < gb.p0) continue;
        const { p: at, landed, angle } = simulate(gb, (p - gb.p0) * DUR);
        if (landed >= 0) splat([at[0], 0, at[2]], gb.r * 2.4, G.blood, -1001);
        const R = rot(gb.axis, angle), X = mv(R, [1, 0, 0]), Y = mv(R, [0, 1, 0]);
        const o = { bias: 1.5 };
        if (gb.kind === 'meat') { S2.ball(at, gb.r, G.flesh, o); S2.ball(add(at, mul(Y, gb.r * 0.45)), gb.r * 0.75, G.skin, { bias: 1.51 }); S2.ball(add(at, mul(Y, -gb.r * 0.3)), gb.r * 0.45, G.meat, { bias: 1.52 }); }
        else if (gb.kind === 'bone') { S2.limb(add(at, mul(X, -gb.r * 1.6)), add(at, mul(X, gb.r * 1.6)), gb.r * 0.35, gb.r * 0.28, G.bone, o); S2.ball(add(at, mul(X, -gb.r * 1.6)), gb.r * 0.5, G.bone, o); S2.ball(add(at, mul(X, gb.r * 1.6)), gb.r * 0.45, G.meat, { bias: 1.51 }); }
        else if (gb.kind === 'organ') { S2.ball(at, gb.r, G.organ, o); S2.ball(add(at, mul(X, gb.r * 0.7)), gb.r * 0.6, G.meat, { bias: 1.51 }); }
        else if (gb.kind === 'eye') { S2.ball(at, gb.r, { ramp: ramp(0.12, 0.1, 0.88), tex: 'smooth', spec: 0.6 }, o); S2.ball(add(at, mul(X, gb.r * 0.5)), gb.r * 0.45, { ramp: ramp(g.eye.h, g.eye.s, g.eye.l), tex: 'smooth', spec: 0.8 }, { bias: 1.51 }); S2.ball(add(at, mul(X, -gb.r * 0.8)), gb.r * 0.4, G.meat, { bias: 1.49 }); }
        else { let q = at; for (let i = 0; i < 5; i++) { const n2 = add(q, add(mul(X, gb.r * 1.1), mul(Y, Math.sin(i * 1.7 + angle) * gb.r * 0.8))); S2.limb(q, n2, gb.r * 0.5, gb.r * 0.45, G.organ, { bias: 1.5 + i * 0.001 }); q = [n2[0], Math.max(gb.r * 0.4, n2[1]), n2[2]]; } }
      }
    };
    S.sectionHook = n => place(n);
    S.sectionAfter = (n, i) => after(S, n, i);
    void ph;
  };
  return { begin, draw: S => gore(S), items: i => items(i) };
}
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
