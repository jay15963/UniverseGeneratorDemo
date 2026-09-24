// A creature's loadout: what it holds (main hand, off hand or both), what it carries (back, belt) and what it
// wears. Turned into LoadHooks for the creature builder: the arms are re-posed to hold the items (resting, walking
// or *using* them: swing, thrust, raise the light, brace the shield, draw the bow, aim), then the items are drawn
// in the hands' frames. Everything stays the creatures' flat 2D pixel art.
import type { Mat } from '../creature/raster';
import { ramp, rasterize, shapeBounds, Part } from '../creature/raster';
import type { Genome } from '../creature/genome';
import { Stage } from '../creature/genome';
import { Sketch, V3, ik3, FACINGS, DIR_SRC, Dir8, DIRS, Anim } from '../creature/pose';
import type { Body, LoadHooks, Outfit } from '../creature/civ';
import { spriteData, SpriteData } from '../creature/render';
import { makeKit } from '../creature/kit';
import { makeDeath, Death, DEATH_FRAMES } from '../creature/death';
import { mulberry, seedToInt } from '../terrain/noise';
import { Forge, frame, Frame } from './forge';
import { HAND_TYPES, handById, ItemCtx, Hold, HandType } from './hand';
import { auxById, AuxCtx, auxFletch } from './aux';
import { wearById, WearCtx, Piece } from './wear';
import { matById, matOf, Material, MATERIALS } from './materials';

export interface ItemSel { type: string; mat: string; variant: number }
export interface WearSel { style: string; mat: string; variant: number; pieces: Piece[] }
export interface Loadout { main?: ItemSel | null; off?: ItemSel | null; two?: ItemSel | null; back?: ItemSel | null; belt?: ItemSel | null; wear?: WearSel | null }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const designOf = (g: Genome, type: string, variant: number) => { const r = mulberry(seedToInt(`${g.seed}|${type}|${variant}`)); return Array.from({ length: 32 }, () => r()); };
/** materials a type accepts that the era already knows */
export const matsFor = (classes: string[], era: number) => MATERIALS.filter(m => classes.includes(m.cls) && m.era <= era);

// ---------------------------------------------------------------------------------------------------
// Shared materials of one item
// ---------------------------------------------------------------------------------------------------
function common(g: Genome, e: number, mat: Material) {
  const alien = g.mode === 'alien', hue = g.culture.hue;
  const M = matOf(mat, alien, hue), M2 = matOf(mat, alien, hue, -0.13);
  const handle = mat.cls === 'wood' || mat.cls === 'bone' ? mat : matById(e <= 3 ? 'wood' : e === 4 ? 'wood' : e === 5 ? 'polymer' : e === 6 ? 'carbon' : 'nanoalloy');
  const trim = matById(e === 0 ? 'bone' : e === 1 ? 'bronze' : e === 2 ? (g.culture.metal.h > 0.3 ? 'iron' : 'bronze') : e <= 4 ? 'steel' : e === 5 ? 'polymer' : e === 6 ? 'titanium' : 'nanoalloy');
  const wrap = matById(e === 0 ? 'hide' : e <= 3 ? 'leather' : 'rubber');
  const glowH = alien ? g.glowHue : 0.52;
  return {
    M, M2, H: handle === mat ? M : matOf(handle, alien, hue), T: matOf(trim, alien, hue), W: matOf(wrap, alien, hue, e === 0 ? 0.08 : 0),
    G: { ramp: ramp(glowH, 0.95, 0.62), tex: 'glow', emit: true, line: null } as Mat,
    fire: { ramp: ramp(0.06, 1, 0.55), tex: 'glow', emit: true, line: null } as Mat,
    fire2: { ramp: ramp(0.13, 1, 0.7), tex: 'glow', emit: true, line: null } as Mat,
    dye: { ramp: ramp(g.culture.hue, g.culture.sat, 0.45), tex: 'cloth' } as Mat,
    dye2: { ramp: ramp(g.culture.hue2, g.culture.sat * 0.9, 0.4), tex: 'cloth' } as Mat,
    dark: { ramp: ramp(0.66, 0.1, 0.16), tex: 'smooth', spec: 0.2 } as Mat,
    string: { ramp: ramp(0.1, 0.15, 0.8), tex: 'smooth', line: null } as Mat,
  };
}
function itemCtx(g: Genome, e: number, sel: ItemSel, U: number, ph: number): ItemCtx {
  const mat = matById(sel.mat);
  return { e, mat, U, ph, t: (((ph / (Math.PI * 2)) % 1) + 1) % 1, r: designOf(g, sel.type, sel.variant), ...common(g, e, mat), draw: 0, kick: 0, use: false };
}

// ---------------------------------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------------------------------
type Arm = Body['arms'][number];
function setHand(a: Arm, p: V3) {
  const reach = a.len * 1.93, d: V3 = [p[0] - a.sh[0], p[1] - a.sh[1], p[2] - a.sh[2]], L = Math.hypot(d[0], d[1], d[2]);
  a.hand = L > reach * 0.97 ? add(a.sh, mul(d, (reach * 0.97) / L)) : p;
  a.el = ik3(a.sh, a.hand, a.len, a.len * 0.95, [-0.6, -0.7, a.s * 0.8]);
  a.holds = true;
}
/** blade angle of a one-hand swing through the loop: raise back, strike down-forward, recover */
function swing(t: number, lo = -0.55, hi = 2.2, rest = 1.0) {
  if (t < 0.45) return lerp(rest, hi, ease(t / 0.45));
  if (t < 0.6) return lerp(hi, lo, ease((t - 0.45) / 0.15));
  return lerp(lo, rest, ease((t - 0.6) / 0.4));
}
interface Held { fr: Frame; built: ReturnType<HandType['make']>; x: ItemCtx; arm: number }

/** poses one hand item; returns the frame to draw it in */
function poseItem(B: Body, T: HandType, x: ItemCtx, built: ReturnType<HandType['make']>, arm: Arm, other: Arm | undefined, anim: string, e: number): Frame {
  const U = B.U, t = x.t, s = arm.s, sh = arm.sh, use = anim === 'use', gait = anim === 'walk' ? 1 : anim === 'run' ? 1.6 : 0;
  const sway = Math.sin(x.ph + (s > 0 ? Math.PI : 0)) * U * 0.05 * gait;
  const hold: Hold = T.hold(e);
  const reach = arm.len * 1.93;
  switch (hold) {
    case 'swing': {
      const th = use ? swing(t) : 1.05 + Math.sin(x.ph) * 0.04;
      const hand = use ? add(sh, [Math.cos(th - 0.75) * reach * 0.8, Math.sin(th - 0.75) * reach * 0.8, s * U * 0.22]) : add(sh, [U * 0.28 + sway, -U * 0.95, s * U * 0.18]);
      setHand(arm, hand);
      return frame(arm.hand, [Math.cos(th), Math.sin(th), 0], [Math.sin(th), -Math.cos(th), 0]);
    }
    case 'thrust': {
      if (!use) { setHand(arm, add(sh, [U * 0.3 + sway, -U * 0.9, s * U * 0.2])); return frame(arm.hand, [0.15, 1, 0], [1, 0, 0]); }
      const hx = t < 0.5 ? lerp(U * 0.3, -U * 0.15, ease(t / 0.5)) : t < 0.62 ? lerp(-U * 0.15, reach * 0.95, ease((t - 0.5) / 0.12)) : lerp(reach * 0.95, U * 0.3, ease((t - 0.62) / 0.38));
      setHand(arm, add(sh, [hx, -U * 0.3, s * U * 0.12]));
      return frame(arm.hand, [1, 0.05, 0], [0, 1, 0]);
    }
    case 'torch': {
      const flash = e === 5;
      if (use) setHand(arm, add(sh, flash ? [reach * 0.9, 0, -s * U * 0.1] : [U * 0.35, U * 0.55 + Math.sin(x.ph) * U * 0.03, s * U * 0.1]));
      else setHand(arm, add(sh, [U * 0.4 + sway, -U * 0.7, s * U * 0.22]));
      return frame(arm.hand, flash ? [1, use ? 0 : -0.35, 0] : [0.25, 1, 0], flash ? [0, 1, 0] : [1, 0, 0]);
    }
    case 'lantern': {
      if (use) setHand(arm, add(sh, [reach * 0.85, -U * 0.05, -s * U * 0.05]));
      else setHand(arm, add(sh, [U * 0.25 + sway, -U * 1.0, s * U * 0.25]));
      return frame(arm.hand, [Math.sin(x.ph) * (use ? 0.08 : 0.2), 1, 0], [1, 0, 0]);
    }
    case 'shield': {
      // held by the grip behind the boss: the big shield covers the side (resting) or the whole front (bracing)
      const n: V3 = use ? nrm([1, 0.05, s * 0.12]) : nrm([1, 0, s * 0.3]);
      setHand(arm, use ? add(sh, [U * 0.8, -U * 0.3, s * U * 0.05]) : add(sh, [U * 0.5 + sway * 0.5, -U * 0.62, s * U * 0.3]));
      const u: V3 = [0, 1, 0];
      return frame(add(arm.hand, mul(n, U * 0.14)), u, cross(n, u));
    }
    case 'bow': { // held in this hand (the bow hand); the other hand draws the string
      const draw = !use ? 0 : t < 0.15 ? 0 : t < 0.6 ? ease((t - 0.15) / 0.45) : t < 0.8 ? 1 : 0;
      x.draw = draw;
      if (!use) { setHand(arm, add(sh, [U * 0.3 + sway, -U * 0.9, s * U * 0.25])); return frame(arm.hand, [0.35, 1, 0], [1, -0.35, 0]); }
      setHand(arm, add(sh, [reach * 0.93, U * 0.05, -sh[2] * 0.6]));
      const f = frame(arm.hand, [0, 1, 0.02], [1, 0, 0]);
      if (other) setHand(other, add(arm.hand, [-(U * (0.25 + x.r[1] * 0.15)) * 0.4 - draw * U * 1.1, 0, -arm.hand[2] * 0.5]));
      return f;
    }
    case 'gun': {
      const kick = use && t >= 0.5 && t < 0.75 ? 1 - (t - 0.5) / 0.25 : 0; // on the loop's frames 4 (fire) and 5
      x.kick = kick; x.draw = use ? (t < 0.5 ? 1 : 0) : 1;
      const G: V3 = use ? [B.C[0] + U * 0.35 - kick * U * 0.1, B.C[1] + U * 0.05, sh[2] * 0.3] : [B.C[0] + U * 0.35, B.C[1] - U * 0.45, sh[2] * 0.4];
      const u: V3 = use ? [1, kick * 0.12, 0] : [0.8, 0.6, 0];
      setHand(arm, G);
      if (other) setHand(other, add(arm.hand, mul(nrm(u), built.g2 ?? U * 0.5)));
      return frame(arm.hand, u, cross([0, 0, 1], nrm(u)));
    }
    case 'two-swing': case 'two-thrust': {
      const thrust = hold === 'two-thrust';
      const g2 = built.g2 ?? -U * 0.5;
      if (!use && thrust) { setHand(arm, add(sh, [U * 0.3 + sway, -U * 0.85, s * U * 0.2])); return frame(arm.hand, [0.08, 1, 0], [1, 0, 0]); }
      let th: number, G: V3;
      if (thrust) {
        th = 0.04;
        const hx = t < 0.5 ? lerp(0, -U * 0.4, ease(t / 0.5)) : t < 0.62 ? lerp(-U * 0.4, U * 0.55, ease((t - 0.5) / 0.12)) : lerp(U * 0.55, 0, ease((t - 0.62) / 0.38));
        G = [B.C[0] + U * 0.45 + hx, B.C[1] - U * 0.3, 0];
      } else {
        th = use ? swing(t, -0.35, 2.5, 1.25) : 1.2 + Math.sin(x.ph) * 0.03;
        const M: V3 = [B.C[0], B.C[1] + U * 0.1, 0], ph2 = th - 0.65;
        G = use ? add(M, [Math.cos(ph2) * U * 0.85, Math.sin(ph2) * U * 0.85, 0]) : [B.C[0] + U * 0.5 + sway * 0.3, B.C[1] - U * 0.55, U * 0.1];
      }
      const u: V3 = [Math.cos(th), Math.sin(th), 0];
      setHand(arm, G);
      if (other) setHand(other, add(G, mul(u, g2)));
      return frame(arm.hand, u, [Math.sin(th), -Math.cos(th), 0]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------------
export function wearOutfit(g: Genome, e: number, w: WearSel | null | undefined): Outfit | null {
  if (!w) return null;
  const style = wearById(w.style), mat = matById(w.mat), c = common(g, e, mat);
  const alien = g.mode === 'alien';
  const cloth = e === 0 ? matOf(matById('hide'), alien, g.culture.hue, 0.05) : { ramp: ramp(g.culture.hue3, g.culture.sat * 0.5, 0.45), tex: 'cloth' as const };
  const x: WearCtx = {
    g, e, r: designOf(g, 'wear:' + w.style, w.variant), variant: w.variant, pieces: new Set(w.pieces),
    M: c.M, M2: c.M2, T: c.T, W: c.W, G: c.G, dye: c.dye, dye2: c.dye2, dark: c.dark,
    under: cloth, under2: { ...cloth, ramp: cloth.ramp.map(q => [q[0] * 0.75, q[1] * 0.75, q[2] * 0.8] as [number, number, number]) },
  };
  return style.build(x);
}

export function hooksFor(g: Genome, e: number, L: Loadout, death?: Death): LoadHooks {
  let held: Held[] = [];
  const outfit = wearOutfit(g, e, L.wear);
  const D = death ? makeDeath(g, death, makeKit(g, eraStage(e)).body) : null;
  return {
    outfit,
    begin: D ? D.begin : undefined,
    pose: (B, ph, anim0) => {
      held = [];
      const anim = anim0 === 'die' ? 'idle' : anim0; // a dying creature still holds its things until it drops them
      const main = B.arms.find(a => !a.lower && a.s > 0), off = B.arms.find(a => !a.lower && a.s < 0);
      if (!main || !off) return;
      const go = (sel: ItemSel | null | undefined, arm: Arm, other: Arm | undefined, phOff = 0) => {
        const T = sel && handById(sel.type);
        if (!sel || !T || (T.minEra && e < T.minEra)) return;
        const x = itemCtx(g, e, sel, B.U, ph + phOff);
        x.use = anim === 'use';
        const built = T.make(x); // its draw closure reads x, which the pose fills (bow draw, recoil)
        held.push({ fr: poseItem(B, T, x, built, arm, other, anim, e), built, x, arm: B.arms.indexOf(arm) });
      };
      if (L.two) {
        const T = handById(L.two.type);
        // bows are held in the off hand and drawn with the main one
        if (T && T.hold(e) === 'bow') go(L.two, off, main); else go(L.two, main, off);
      } else {
        go(L.main, main, undefined);
        // a second weapon strikes half a beat later, so both hands never swing together
        const T = L.off && handById(L.off.type);
        go(L.off, off, undefined, T && T.hold(e) !== 'shield' ? Math.PI : 0);
      }
    },
    draw: (S, B, ph) => {
      for (const h of held) {
        const one = () => h.built.draw(new Forge(S, h.fr, 0));
        if (!D) { one(); continue; }
        const old = S.xf;
        for (const v of D.items(h.arm)) { S.xf = v; one(); }
        S.xf = old;
      }
      for (const sel of [L.back, L.belt]) {
        const T = sel && auxById(sel.type);
        if (!sel || !T) continue;
        const mat = matById(sel.mat), c = common(g, e, mat);
        const x: AuxCtx = { e, r: designOf(g, sel.type, sel.variant), ph, M: c.M, M2: c.M2, T: c.T, W: c.W, G: c.G, dye: c.dye, dye2: c.dye2, dark: c.dark, shaft: matOf(matById('wood'), g.mode === 'alien', g.culture.hue, 0.1), fletch: auxFletch(g.culture.hue2) };
        S.section('aux:' + T.slot, () => T.draw(S, B, x));
      }
      D?.draw(S, B, ph);
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------
export const eraStage = (e: number) => (Stage.TRIBAL + e) as Stage;
export const loadKey = (L: Loadout) => JSON.stringify(L);

/** the creature wearing / holding its loadout (one facing, all frames) */
export function equippedData(g: Genome, e: number, L: Loadout, dir: Dir8, anim: Anim, frames = 8, k = 1, death?: Death): SpriteData {
  if (death) return spriteData(g, eraStage(e), dir, 0, DEATH_FRAMES, 'die', k, hooksFor(g, e, L, death));
  return spriteData(g, eraStage(e), dir, 0, frames, anim, k, hooksFor(g, e, L));
}

/** display frame of an item alone (like an inventory icon) */
function displayFrame(hold: Hold, U: number): Frame {
  switch (hold) {
    case 'gun': return frame([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    case 'bow': case 'shield': case 'lantern': return frame([0, 0, 0], [0, 1, 0], [-1, 0, 0]);
    case 'thrust': case 'two-thrust': return frame([0, 0, 0], [0.35, 1, 0], [-1, 0.35, 0]);
    default: return frame([0, -U * 0.2, 0], [0.7, 1, 0], [-1, 0.7, 0]);
  }
}
function translate(p: Part, dx: number, dy: number) {
  const s = p.s;
  if (s.k === 'e') { s.x += dx; s.y += dy; }
  else if (s.k === 'c') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
  if (p.clip) p.clip = [p.clip[0], p.clip[1], p.clip[2] - p.clip[0] * dx - p.clip[1] * dy];
}
function flip(px: Uint8ClampedArray, w: number, h: number) {
  const o = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4; o[b] = px[a]; o[b + 1] = px[a + 1]; o[b + 2] = px[a + 2]; o[b + 3] = px[a + 3]; }
  return o;
}
/** a hand item alone, every frame (flames flicker, energy blades hum) */
export function itemData(g: Genome, e: number, sel: ItemSel, dir: Dir8, frames = 8, k = 1): SpriteData {
  const [src, mirror] = DIR_SRC[dir];
  if (mirror) { const b = itemData(g, e, sel, src as Dir8, frames, k); return { ...b, ax: b.w - b.ax, frames: b.frames.map(f => flip(f, b.w, b.h)) }; }
  const T = handById(sel.type) ?? HAND_TYPES[0], U = 24;
  const all = Array.from({ length: frames }, (_, f) => {
    const S = new Sketch(FACINGS[src], 'idle', k), ph = (f / frames) * Math.PI * 2;
    const x = itemCtx(g, e, sel, U, ph);
    T.make(x).draw(new Forge(S, displayFrame(T.hold(e), U), 0));
    return S.parts();
  });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of all) for (const p of parts) { const [a, b, c, d] = shapeBounds(p.s); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); }
  if (x0 > x1) { x0 = y0 = 0; x1 = y1 = 1; }
  const pad = 2, ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad, w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  return { frames: all.map(parts => { for (const p of parts) translate(p, ox, oy); return rasterize(parts, w, h).data; }), w, h, ax: ox, ay: oy, grounded: false };
}
export { DIRS };
