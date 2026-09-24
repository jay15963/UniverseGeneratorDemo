// Hand items: one-handed (main or off hand) and two-handed tools and weapons. Each type draws every era from the
// same design numbers (a species' swords stay recognisably theirs from knapped flint to plasma) in any material
// its classes accept. Geometry lives in the grip frame (see forge.ts), sized on the creature's body unit U.
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import { Forge } from './forge';
import type { Material, MatClass } from './materials';

export type Hold = 'swing' | 'thrust' | 'torch' | 'lantern' | 'shield' | 'two-swing' | 'two-thrust' | 'bow' | 'gun';
export type Slot = 'one' | 'two';

export interface ItemCtx {
  e: number; mat: Material; U: number; ph: number; t: number;
  /** design numbers of this item (fixed across eras and materials) */
  r: number[];
  M: Mat; M2: Mat; H: Mat; T: Mat; W: Mat; G: Mat; fire: Mat; fire2: Mat; dye: Mat; dye2: Mat; dark: Mat; string: Mat;
  /** how far a bow is drawn (0..1), recoil (0..1), whether the item is being used */
  draw: number; kick: number; use: boolean;
}
export interface Built { g2?: number; draw: (F: Forge) => void }
export interface HandType {
  id: string; slot: Slot; name: string; eraNames?: string[]; blurb: string;
  mats: MatClass[]; minEra?: number;
  hold: (e: number) => Hold;
  make: (x: ItemCtx) => Built;
}

const frac = (v: number) => v - Math.floor(v);
const cls = (x: ItemCtx) => x.mat.cls;
const knapped = (x: ItemCtx) => cls(x) === 'stone' || (cls(x) === 'crystal' && x.e === 0);

/** blade outline in the (a, f) plane: edge on +f, spine on -f; curve bends it back */
function profile(a0: number, len: number, w: number, o: { curve?: number; tip?: number; leaf?: number; jag?: number; spine?: number; clip?: boolean } = {}): [number, number][] {
  const n = 12, curve = o.curve ?? 0, tip = o.tip ?? 0.2, leaf = o.leaf ?? 0, jag = o.jag ?? 0, spine = o.spine ?? 1;
  const off = (k: number) => -curve * k * k;
  const wid = (k: number) => {
    let q = 1 - 0.18 * k + leaf * Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.6;
    if (k > 1 - tip) q *= Math.max(0, (1 - k) / tip);
    return w * q;
  };
  const edge: [number, number][] = [], back: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = a0 + len * k, j = jag ? (i % 2 ? jag : -jag * 0.4) * w : 0;
    edge.push([a, off(k) + wid(k) + (i < n ? j : 0)]);
    const bk = o.clip && k > 0.7 ? wid(k) * 0.2 : wid(k) * spine;
    back.push([a, off(k) - bk - (i < n && jag ? j * 0.6 : 0)]);
  }
  return [...edge, ...back.reverse().slice(1, -1)];
}
/** hand grip: wrapped for early eras, rubber/polymer later */
function grip(F: Forge, x: ItemCtx, a0: number, a1: number, r: number) {
  F.rod(a0, a1, r, r, x.e <= 3 ? x.H : x.dark);
  if (x.e <= 2) for (let a = a0 + r; a < a1 - r * 0.5; a += r * 1.6) F.rod(a, a + r * 0.5, r + 0.35, r + 0.35, x.W, 0, 0, 0, 0.001);
  else if (x.e >= 4) for (let a = a0 + r; a < a1 - r; a += r * 1.2) F.rod(a, a + r * 0.3, r + 0.2, r + 0.2, x.H, 0, 0, 0, 0.001);
}
/** lashing where a head is tied onto a haft (tribal) */
function lash(F: Forge, x: ItemCtx, a: number, r: number, n = 3) { for (let i = 0; i < n; i++) F.rod(a + i * r * 0.9, a + i * r * 0.9 + r * 0.5, r * 1.25, r * 1.25, x.W, 0, 0, 0, 0.002); }
/** glowing trim along an edge (futurist) */
function glowLine(F: Forge, x: ItemCtx, a0: number, a1: number, f0: number, f1: number) { if (x.e >= 6) F.bar([a0, f0, 0.3], [a1, f1, 0.3], 0.45, 0.45, x.G, 0.01); }
function guard(F: Forge, x: ItemCtx, a: number, w: number, style: number) {
  const r = x.U * 0.045;
  if (x.e === 0) return;
  if (x.e >= 6) { F.bar([a, -w * 0.5, 0], [a, w * 0.5, 0], r * 1.3, r * 1.3, x.T); return; }
  if (x.e === 5 || style < 0.25) { F.ball([a, 0, 0], r * 2.2, x.T); return; } // disc guard / tsuba
  const up = x.e === 2 || style > 0.7 ? w * 0.35 : 0;
  F.bar([a, 0, 0], [a + up, w, 0], r * 1.1, r * 0.8, x.T); F.bar([a, 0, 0], [a + up, -w, 0], r * 1.1, r * 0.8, x.T);
  F.ball([a + up, w, 0], r, x.T); F.ball([a + up, -w, 0], r, x.T);
  if (x.e === 3 || (x.e === 2 && style > 0.5)) F.bar([a, w * 0.7, 0], [a - x.U * 0.3, w * 0.55, 0], r * 0.7, r * 0.7, x.T); // knuckle bow
}

// ---------------------------------------------------------------------------------------------------
// Blades
// ---------------------------------------------------------------------------------------------------
function swordLike(x: ItemCtx, len: number, hl: number, w: number, two: boolean, short = false): Built {
  const r = x.r, U = x.U;
  const curve = r[2] < 0.3 ? U * (0.1 + r[3] * 0.25) : 0, leaf = r[4] < 0.25 ? 0.5 : 0, tip = 0.12 + r[5] * 0.2, clip = r[6] < 0.2;
  const gr = U * 0.05;
  return {
    g2: two ? -hl * 0.6 : undefined,
    draw: F => {
      grip(F, x, -hl, 0, gr);
      F.ball([-hl - gr, 0, 0], gr * 1.6, x.e === 0 ? x.W : x.T); // pommel
      if (cls(x) === 'energy' || (x.e === 7 && cls(x) !== 'wood')) {
        F.rod(-hl * 0.2, U * 0.12, gr * 1.5, gr * 1.5, x.T);
        const flick = 1 + Math.sin(x.ph * 3) * 0.06;
        F.rod(U * 0.12, len, w * 0.55 * flick, w * 0.3, x.G, 0, curve * 0.3, 0, 0.01);
        F.rod(U * 0.12, len - U * 0.05, w * 0.22, w * 0.12, { ramp: ramp(0.15, 0.2, 0.95), tex: 'glow', emit: true, line: null }, 0, curve * 0.3, 0, 0.02);
        return;
      }
      if (knapped(x) && !short) { // wooden paddle edged with knapped stone teeth (like a macuahuitl)
        F.blade(profile(0, len, w * 0.8, { tip: 0.08 }), x.H);
        for (let i = 1; i < 9; i++) {
          const a = (len * i) / 9;
          for (const s of [-1, 1]) F.blade([[a - U * 0.07, s * w * 0.7], [a + U * 0.07, s * w * 0.7], [a + U * 0.02, s * w * 1.7], [a - U * 0.03, s * w * 1.6]], x.M, 0, 0.002);
        }
        return;
      }
      guard(F, x, 0, w * 2.2, r[7]);
      const pts = profile(0, len, w, { curve, leaf, tip, clip, jag: knapped(x) ? 0.3 : cls(x) === 'bone' && r[8] < 0.5 ? 0.25 : 0 });
      F.blade(pts, x.M);
      F.rod(0, len * 0.96, 0.5, 0.4, x.M2, -curve * 0.3, -curve * 0.95, 0, -0.001); // spine: visible edge-on
      if (cls(x) === 'metal' || cls(x) === 'synthetic') {
        if (x.e >= 1 && x.e <= 3 && r[9] < 0.7) F.blade([[len * 0.05, -w * 0.12], [len * 0.72, -curve * 0.5 - w * 0.12], [len * 0.72, -curve * 0.5 + w * 0.05], [len * 0.05, w * 0.05]], x.M2, 0.2, 0.001); // fuller
        F.blade(profile(0, len, w, { curve, leaf, tip, clip }).slice(0, 12).concat(profile(0, len, w * 0.84, { curve, leaf, tip, clip }).slice(0, 12).reverse()), { ...x.M, ramp: x.M.ramp.map(c => [Math.min(255, c[0] + 28), Math.min(255, c[1] + 28), Math.min(255, c[2] + 28)] as [number, number, number]) }, 0.15, 0.0015); // bright edge bevel
      }
      if (cls(x) === 'crystal') F.blade(profile(len * 0.1, len * 0.8, w * 0.45, { curve: curve * 0.8, tip }), x.M2, 0.3, 0.002);
      glowLine(F, x, len * 0.05, len * 0.9, w * 0.8, w * 0.5 - curve * 0.8);
    },
  };
}
function dagger(x: ItemCtx): Built {
  const U = x.U, len = U * (0.5 + x.r[0] * 0.25), w = U * (0.07 + x.r[1] * 0.04);
  return swordLike({ ...x, r: [...x.r.slice(0, 2), 1, 0, x.r[4], x.r[5], 0, x.r[7], 1, 1] }, len, U * 0.22, w, false, true);
}
function sword(x: ItemCtx): Built { const U = x.U; return swordLike(x, U * (1.3 + x.r[0] * 0.5), U * 0.28, U * (0.08 + x.r[1] * 0.05), false); }
function longsword(x: ItemCtx): Built { const U = x.U; return swordLike(x, U * (2 + x.r[0] * 0.6), U * 0.55, U * (0.1 + x.r[1] * 0.05), true); }

// ---------------------------------------------------------------------------------------------------
// Hafted heads
// ---------------------------------------------------------------------------------------------------
function haft(F: Forge, x: ItemCtx, a0: number, a1: number, r: number) {
  F.rod(a0, a1, r, r * 0.92, cls(x) === 'wood' ? x.M : x.H); // bone and stone heads sit on a wooden haft
  if (x.e >= 4 && x.e <= 5) F.rod(a0, a0 + x.U * 0.3, r * 1.2, r * 1.2, x.dark, 0, 0, 0, 0.001); // rubber grip
  if (x.e >= 6) F.rod(a0, a1 * 0.7, r * 0.5, r * 0.5, x.G, 0, 0, r * 0.8, 0.002);
}
function axeHead(F: Forge, x: ItemCtx, top: number, hb: number, fw: number, beard: number, back: 'poll' | 'spike' | 'blade') {
  const U = x.U, M = x.M;
  if (knapped(x)) { // knapped stone head lashed to the haft
    F.blade([[top - hb * 0.4, -U * 0.04], [top - hb * 0.5, fw * 0.8], [top - hb * 0.1, fw * 1.02], [top + hb * 0.4, fw * 0.85], [top + hb * 0.35, -U * 0.04]], M);
    lash(F, x, top - hb * 0.4, U * 0.06, 3);
    return;
  }
  const eye = U * 0.09;
  F.blade([[top - eye, -eye * 0.6], [top - eye, fw * 0.35], [top - hb * 0.5 - beard, fw], [top, fw * 1.08], [top + hb * 0.5, fw * 0.96], [top + eye, fw * 0.35], [top + eye, -eye * 0.6]], M);
  F.bar([top, 0, 0], [top, fw * 0.95, 0], U * 0.035, U * 0.02, x.M2); // thickness seen edge-on
  F.blade([[top - hb * 0.5 - beard, fw], [top, fw * 1.08], [top + hb * 0.5, fw * 0.96], [top + hb * 0.4, fw * 0.84], [top, fw * 0.95], [top - hb * 0.4 - beard, fw * 0.88]], { ...M, ramp: M.ramp.map(c => [Math.min(255, c[0] + 45), Math.min(255, c[1] + 45), Math.min(255, c[2] + 45)] as [number, number, number]) }, 0.15, 0.001);
  if (back === 'poll') F.blade([[top - eye, -eye * 0.6], [top - eye * 0.8, -U * 0.14], [top + eye * 0.8, -U * 0.14], [top + eye, -eye * 0.6]], x.M2, 0, 0.001);
  if (back === 'spike') F.blade([[top - eye, -eye * 0.6], [top, -U * 0.35], [top + eye, -eye * 0.6]], M, 0, 0.001);
  if (back === 'blade') F.blade([[top - eye, 0], [top - hb * 0.45, -fw * 0.9], [top, -fw], [top + hb * 0.45, -fw * 0.9], [top + eye, 0]], M, 0, 0.001);
  glowLine(F, x, top - hb * 0.5 - beard, top + hb * 0.5, fw, fw * 0.96);
}
function axe(x: ItemCtx, two = false): Built {
  const U = x.U, r = x.r, L = U * (two ? 2.2 : 1.15) * (0.9 + r[0] * 0.2), hr = U * (two ? 0.06 : 0.05);
  const fw = U * (two ? 0.55 : 0.36) * (0.85 + r[1] * 0.3), hb = U * (two ? 0.6 : 0.34) * (0.8 + r[2] * 0.4), beard = r[3] < 0.4 ? U * 0.12 : 0;
  const back = two && r[4] < 0.5 ? 'blade' : r[4] < 0.35 ? 'spike' : 'poll';
  return {
    g2: two ? -U * 0.6 : undefined,
    draw: F => {
      haft(F, x, two ? -U * 0.85 : -U * 0.18, L, hr);
      axeHead(F, x, L - hb * 0.4, hb, fw, beard, back);
    },
  };
}
function mace(x: ItemCtx): Built {
  const U = x.U, r = x.r, L = U * 1.1 * (0.9 + r[0] * 0.25), hr = U * 0.05, head = U * (0.14 + r[1] * 0.06);
  return {
    draw: F => {
      if (x.e === 0 || cls(x) === 'wood' || cls(x) === 'bone') { // war club, studded
        F.rod(-U * 0.15, L, hr, head * 1.1, x.M);
        const n = cls(x) === 'bone' || r[2] < 0.5 ? 6 : 0;
        for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2, a = L * (0.7 + (i % 2) * 0.15); F.bar([a, Math.cos(t) * head * 0.9, Math.sin(t) * head * 0.9], [a + U * 0.03, Math.cos(t) * head * 1.6, Math.sin(t) * head * 1.6], head * 0.25, 0.4, x.T); }
        if (x.e === 0 && cls(x) !== 'wood') { F.ball([L, 0, 0], head, x.M); lash(F, x, L - head * 1.2, hr, 2); }
        return;
      }
      haft(F, x, -U * 0.2, L, hr);
      grip(F, x, -U * 0.2, U * 0.12, hr * 1.1);
      F.ball([L, 0, 0], head, x.M);
      if (r[3] < 0.5) for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; F.plate([[L - head * 1.1, Math.cos(t) * head * 0.6, Math.sin(t) * head * 0.6], [L - head * 0.3, Math.cos(t) * head * 1.55, Math.sin(t) * head * 1.55], [L + head * 0.6, Math.cos(t) * head * 1.45, Math.sin(t) * head * 1.45], [L + head * 0.9, Math.cos(t) * head * 0.6, Math.sin(t) * head * 0.6]], x.M, 0.001); }
      else for (let i = 0; i < 10; i++) { const t = i * 2.4, p = Math.cos(i * 1.3); F.bar([L, Math.cos(t) * head * 0.8 * Math.sqrt(1 - p * p), Math.sin(t) * head * 0.8 * Math.sqrt(1 - p * p)], [L + p * head * 1.6, Math.cos(t) * head * 1.7 * Math.sqrt(1 - p * p), Math.sin(t) * head * 1.7 * Math.sqrt(1 - p * p)], head * 0.22, 0.4, x.M2); }
      if (x.e >= 6) F.ball([L, 0, 0], head * 0.5, x.G, 0.02);
    },
  };
}
function spearHead(F: Forge, x: ItemCtx, top: number, len: number, w: number) {
  const U = x.U;
  if (cls(x) === 'energy') { F.rod(top, top + len, w * 0.6, 0.5, x.G, 0, 0, 0, 0.01); return; }
  F.blade(profile(top, len, w, { leaf: 0.7, tip: 0.4, jag: knapped(x) ? 0.3 : 0 }), x.M);
  F.rod(top, top + len * 0.92, 0.6, 0.35, x.M2, 0, 0, 0, -0.001);
  if (x.e === 0) lash(F, x, top - U * 0.08, U * 0.045, 3);
  else F.rod(top - U * 0.12, top + U * 0.02, U * 0.05, U * 0.04, x.T);
  glowLine(F, x, top, top + len * 0.9, w * 0.7, 0);
}
function spear(x: ItemCtx, two = false): Built {
  const U = x.U, L = U * (two ? 3.4 : 1.7) * (0.9 + x.r[0] * 0.2), hl = U * (0.3 + x.r[1] * 0.2), w = U * (0.08 + x.r[2] * 0.05);
  return {
    g2: two ? -U * 0.9 : undefined,
    draw: F => {
      haft(F, x, two ? -U * 1.2 : -U * 0.55, L, U * 0.04);
      spearHead(F, x, L, hl, w);
      if (two && x.e >= 1 && x.e <= 2 && x.r[3] < 0.5) axeHead(F, x, L - U * 0.1, U * 0.45, U * 0.4, 0, 'spike'); // halberd-ish
      if (x.e === 0 && x.r[4] < 0.5) for (let i = 0; i < 2; i++) F.bar([L - U * 0.05, 0, 0], [L - U * 0.35, (i ? 1 : -1) * U * 0.12, 0.3], 0.5, 0.3, x.dye2); // feathers
    },
  };
}
function hammer(x: ItemCtx, two = false): Built {
  const U = x.U, r = x.r, L = U * (two ? 2 : 0.95) * (0.9 + r[0] * 0.2), hw = U * (two ? 0.34 : 0.2), hr = U * (two ? 0.13 : 0.07);
  return {
    g2: two ? -U * 0.6 : undefined,
    draw: F => {
      haft(F, x, two ? -U * 0.8 : -U * 0.15, L, U * 0.045);
      if (knapped(x)) { F.ball([L, hw * 0.3, 0], hr * 1.5, x.M); lash(F, x, L - hr, U * 0.05, 3); return; }
      F.bar([L, -hw * (x.e >= 3 && !two ? 0.2 : 1), 0], [L, hw, 0], hr, hr, x.M);
      F.bar([L, hw, 0], [L, hw + U * 0.04, 0], hr * 1.05, hr * 0.9, x.M2, 0.001);
      if (x.e >= 3 && !two) { // claw
        F.bar([L, -hw * 0.2, 0], [L - U * 0.08, -hw * 1.1, 0], hr * 0.7, hr * 0.3, x.M);
      } else F.bar([L, -hw, 0], [L, -hw - U * 0.04, 0], hr * 1.05, hr * 0.9, x.M2, 0.001);
      if (x.e >= 6) F.ball([L, hw + U * 0.05, 0], hr * 0.6, x.G, 0.01);
    },
  };
}
function sickle(x: ItemCtx): Built {
  const U = x.U, R = U * (0.32 + x.r[0] * 0.12);
  return {
    draw: F => {
      grip(F, x, -U * 0.3, U * 0.05, U * 0.05);
      const outer: [number, number][] = [], inner: [number, number][] = [];
      for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI * 1.1 - 0.2; outer.push([U * 0.05 + R * Math.sin(t) * 1.1, R - R * Math.cos(t)]); inner.push([U * 0.05 + R * 0.85 * Math.sin(t) * 1.1, R - R * 0.78 * Math.cos(t) - (i === 10 ? 0 : R * 0.05)]); }
      F.blade([...outer, ...inner.reverse()], x.M);
      glowLine(F, x, U * 0.05, U * 0.05 + R, 0, R * 1.2);
    },
  };
}
function pick(x: ItemCtx): Built {
  const U = x.U, L = U * 2 * (0.9 + x.r[0] * 0.2), reach = U * (0.45 + x.r[1] * 0.15);
  return {
    g2: -U * 0.6,
    draw: F => {
      haft(F, x, -U * 0.8, L, U * 0.055);
      if (knapped(x) || cls(x) === 'bone') { // antler / horn pick
        F.bar([L, 0, 0], [L - U * 0.25, reach * 1.1, 0], U * 0.08, U * 0.03, x.M); lash(F, x, L - U * 0.1, U * 0.06, 2); return;
      }
      for (const s of [1, -1]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push([L - k * k * U * 0.28, s * reach * k]); }
        for (let i = 6; i >= 0; i--) { const k = i / 6; pts.push([L - k * k * U * 0.28 + U * (0.1 * (1 - k) + 0.01), s * reach * k]); }
        F.blade(pts.map(([a, f]) => [a - U * 0.05, f]), x.M);
        F.bar([L, 0, 0], [L - U * 0.28, s * reach, 0], U * 0.045, U * 0.015, x.M2, 0.001);
      }
      if (x.e >= 6) F.ball([L, 0, 0], U * 0.05, x.G, 0.01);
    },
  };
}
function scythe(x: ItemCtx): Built {
  const U = x.U, L = U * 2.6, bl = U * (1.1 + x.r[0] * 0.4);
  return {
    g2: -U * 0.8,
    draw: F => {
      haft(F, x, -U * 1.1, L, U * 0.045);
      F.bar([-U * 0.1, 0, 0], [-U * 0.1, 0, U * 0.25], U * 0.03, U * 0.03, x.H); // nib handle
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push([L - U * 0.05 - k * k * U * 0.35, -k * bl]); }
      for (let i = 10; i >= 0; i--) { const k = i / 10; pts.push([L - U * 0.05 - k * k * U * 0.35 + U * 0.14 * (1 - k * 0.85), -k * bl]); }
      F.blade(pts, x.M);
      glowLine(F, x, L, L - U * 0.35, 0, -bl);
    },
  };
}
function shovel(x: ItemCtx): Built {
  const U = x.U, L = U * 2, bw = U * 0.3, bl = U * 0.45;
  return {
    g2: -U * 0.5,
    draw: F => {
      haft(F, x, -U * 0.9, L, U * 0.045);
      if (x.e >= 3) { F.bar([-U * 0.9, 0, -U * 0.1], [-U * 0.9, 0, U * 0.1], U * 0.03, U * 0.03, x.dark); F.bar([-U * 0.75, 0, -U * 0.08], [-U * 0.9, 0, -U * 0.1], U * 0.025, U * 0.025, x.dark); F.bar([-U * 0.75, 0, U * 0.08], [-U * 0.9, 0, U * 0.1], U * 0.025, U * 0.025, x.dark); }
      if (x.e === 0) { F.cross([[L, -bw * 0.8], [L + bl * 0.4, -bw], [L + bl * 1.2, -bw * 0.5], [L + bl * 1.3, bw * 0.4], [L + bl * 0.4, bw], [L, bw * 0.8]], cls(x) === 'bone' || cls(x) === 'wood' ? x.M : { ...x.M, tex: 'bone' }); lash(F, x, L - U * 0.1, U * 0.05, 3); return; }
      F.cross([[L, -bw], [L + bl, -bw], [L + bl * 1.25, 0], [L + bl, bw], [L, bw]], x.M);
      F.bar([L - U * 0.1, 0, 0], [L + bl * 0.4, 0, 0], U * 0.05, U * 0.04, x.M2, 0.001);
    },
  };
}
function staff(x: ItemCtx): Built {
  const U = x.U, L = U * 2.6, r = x.r;
  return {
    g2: -U * 0.6,
    draw: F => {
      F.rod(-U * 1.2, L, U * 0.05, U * 0.045, cls(x) === 'wood' || cls(x) === 'bone' ? x.M : x.H);
      const top = L;
      if (cls(x) === 'crystal' || cls(x) === 'energy' || x.e >= 6) {
        for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; F.bar([top - U * 0.05, 0, 0], [top + U * 0.28, Math.cos(t) * U * 0.14, Math.sin(t) * U * 0.14], U * 0.03, U * 0.02, x.T); }
        F.ball([top + U * 0.22, 0, 0], U * (0.11 + Math.sin(x.ph) * 0.01), cls(x) === 'crystal' ? x.M : x.G, 0.01);
      } else if (r[0] < 0.5) { F.bar([top, 0, 0], [top + U * 0.2, U * 0.2, 0], U * 0.05, U * 0.04, x.M); F.bar([top + U * 0.2, U * 0.2, 0], [top + U * 0.35, U * 0.05, 0], U * 0.04, U * 0.03, x.M); }
      else { F.ball([top, 0, 0], U * 0.09, x.T); for (let i = 0; i < 3; i++) F.rod(top - U * 0.3 - i * U * 0.12, top - U * 0.26 - i * U * 0.12, U * 0.06, U * 0.06, x.W, 0, 0, 0, 0.001); }
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------------------------------
function light(x: ItemCtx): Built {
  const U = x.U, e = x.e, fl = 1 + Math.sin(x.ph * 3) * 0.12;
  return {
    draw: F => {
      if (e <= 1) { // torch
        F.rod(-U * 0.3, U * 0.55, U * 0.045, U * 0.06, cls(x) === 'bone' ? x.M : x.H);
        F.rod(U * 0.45, U * 0.62, U * 0.075, U * 0.075, x.W, 0, 0, 0, 0.001);
        F.ball([U * 0.72 * fl, 0, 0], U * 0.1 * fl, x.fire, 0.01); F.ball([U * 0.78 * fl, 0, 0], U * 0.06, x.fire2, 0.02);
        F.ball([U * (0.95 + Math.sin(x.ph * 2) * 0.03), Math.sin(x.ph * 3) * U * 0.02, 0], U * 0.045 * fl, x.fire, 0.015);
        return;
      }
      if (e <= 4) { // lantern: hangs from the hand by its bail
        const d = U * 0.18, top = -U * 0.12, h = U * 0.42, mat = cls(x) === 'metal' ? x.M : x.T;
        F.bar([0, 0, 0], [top, U * 0.1, 0], 0.4, 0.4, mat); F.bar([0, 0, 0], [top, -U * 0.1, 0], 0.4, 0.4, mat);
        F.rod(top, top - U * 0.06, d * 0.7, d, mat);
        F.rod(top - U * 0.06, top - h, d * 0.85, d * 0.85, e === 4 ? x.M2 : { ramp: ramp(0.12, 0.8, 0.7), tex: 'glass', alpha: 0.9 }, 0, 0, 0, -0.001);
        F.ball([top - h * 0.55, 0, 0], U * (e === 4 ? 0.1 : 0.07) * fl, e === 4 ? { ramp: ramp(0.14, 0.5, 0.82), tex: 'glow', emit: true, line: null } : x.fire2, 0.01);
        for (const s of [-1, 1]) F.bar([top - U * 0.06, s * d, 0], [top - h, s * d, 0], 0.5, 0.5, mat, 0.02);
        F.rod(top - h, top - h - U * 0.05, d, d * 0.8, mat);
        return;
      }
      if (e === 5) { // flashlight with a beam
        F.rod(-U * 0.25, U * 0.2, U * 0.045, U * 0.045, x.M);
        F.rod(U * 0.2, U * 0.32, U * 0.05, U * 0.07, x.M2);
        F.ball([U * 0.33, 0, 0], U * 0.055, { ramp: ramp(0.14, 0.4, 0.9), tex: 'glow', emit: true, line: null }, 0.01);
        return;
      }
      // glow rod / floating light orb
      F.rod(-U * 0.25, U * 0.15, U * 0.04, U * 0.04, x.M);
      if (e === 6) F.rod(U * 0.15, U * 0.6, U * 0.05, U * 0.05, x.G, 0, 0, 0, 0.01);
      else { F.ball([U * (0.45 + Math.sin(x.ph) * 0.04), 0, 0], U * 0.11 * fl, x.G, 0.01); F.ball([U * (0.45 + Math.sin(x.ph) * 0.04), 0, 0], U * 0.05, { ramp: ramp(0.15, 0.2, 0.95), tex: 'glow', emit: true, line: null }, 0.02); }
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Shield (face in the a/f plane, facing +c)
// ---------------------------------------------------------------------------------------------------
function shield(x: ItemCtx): Built {
  const U = x.U, e = x.e, r = x.r;
  // big shields only: a round one is about half the bearer's height across (like a viking shield)
  const shape = e >= 7 ? 'energy' : e >= 4 ? 'riot' : e === 0 ? (r[0] < 0.6 ? 'round' : 'oval') : ['round', 'round', 'heater', 'kite', 'tower'][Math.floor(r[0] * 5)];
  const S = U * ({ round: 1.18, oval: 1.1, heater: 1.1, kite: 1.2, tower: 1.25, riot: 1.25, energy: 1.2 } as Record<string, number>)[shape] * (0.95 + r[1] * 0.12);
  const outline = (k: number): [number, number][] => {
    const pts: [number, number][] = [];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      if (shape === 'round' || shape === 'energy') pts.push([s * S * k, c * S * k]);
      else if (shape === 'oval') pts.push([s * S * 1.3 * k, c * S * 0.8 * k]);
      else if (shape === 'tower' || shape === 'riot') pts.push([Math.sign(s) * Math.min(1, Math.abs(s) * 1.6) * S * 1.3 * k, Math.sign(c) * Math.min(1, Math.abs(c) * 1.6) * S * 0.7 * k]);
      else if (shape === 'heater') pts.push([(s > 0 ? s * 0.55 : s) * S * 1.1 * k + S * 0.2 * k, c * S * 0.8 * (s > 0 ? 1 : 1 + s * 0.9) * k]);
      else pts.push([(s > 0 ? s * 0.5 : s * 1.1) * S * 1.3 * k + S * 0.25 * k, c * S * 0.7 * (s > 0 ? 1 : 1 + s * 0.95) * k]);
    }
    return pts;
  };
  const faceMat: Mat = cls(x) === 'hide' ? x.M : cls(x) === 'wood' ? { ...x.M, tex: 'plank', texScale: 1.6 } : x.M;
  return {
    draw: F => {
      if (shape === 'energy') { // wrist emitter and a translucent hex field
        F.rod(-U * 0.1, U * 0.1, U * 0.07, U * 0.07, x.T, 0, 0, -U * 0.05);
        F.blade(outline(1), { ...x.G, alpha: 0.45, tex: 'hex' }, U * 0.12, 0.01);
        F.blade(outline(1.04).filter((_, i) => i % 2 === 0), { ...x.G, alpha: 0.7 }, U * 0.11, 0.005);
        return;
      }
      F.blade(outline(1.06), x.e >= 1 && cls(x) !== 'metal' ? x.T : x.M2, U * 0.05); // rim
      F.blade(outline(1), faceMat, U * 0.07, 0.001);
      if (shape === 'riot') F.blade(outline(0.5).map(([a, f]) => [a + S * 0.35, f]), { ramp: ramp(0.55, 0.3, 0.7), tex: 'glass', alpha: 0.85 }, U * 0.08, 0.002);
      else {
        // painted emblem in the culture's colours (stripe, cross, ring or chevron)
        const k = Math.floor(r[2] * (shape === 'round' ? 7 : 4)), em = x.dye;
        if (k >= 4 && shape === 'round') { // viking-style painted boards: halves, quarters or a swirl of arms
          const arc = (a0: number, a1: number, k2 = 1): [number, number][] => { const q: [number, number][] = [[0, 0]]; for (let i = 0; i <= 8; i++) { const t = a0 + ((a1 - a0) * i) / 8; q.push([Math.sin(t) * S * 0.98 * k2, Math.cos(t) * S * 0.98 * k2]); } return q; };
          if (k === 4) F.blade(arc(0, Math.PI), em, U * 0.08, 0.002);
          if (k === 5) { F.blade(arc(0, Math.PI / 2), em, U * 0.08, 0.002); F.blade(arc(Math.PI, Math.PI * 1.5), em, U * 0.08, 0.002); }
          if (k === 6) for (let j = 0; j < 3; j++) { const t0 = (j / 3) * Math.PI * 2; const q: [number, number][] = []; for (let i = 0; i <= 8; i++) { const t = t0 + i * 0.28, rr = S * (0.15 + i * 0.1); q.push([Math.sin(t) * rr, Math.cos(t) * rr]); } for (let i = 8; i >= 0; i--) { const t = t0 + i * 0.28 + 0.35, rr = S * (0.1 + i * 0.1); q.push([Math.sin(t) * rr, Math.cos(t) * rr]); } F.blade(q, em, U * 0.08, 0.002 + j * 0.0001); }
          F.ball([0, 0, U * 0.12], U * 0.2, x.T, 0.003); // iron boss
          for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; F.ball([Math.sin(t) * S * 0.97, Math.cos(t) * S * 0.97, U * 0.09], 0.7, x.T, 0.003); } // rim nails
          if (e >= 6) F.blade(outline(1.02).filter((_, i) => i % 3 === 0), x.G, U * 0.085, 0.004);
          return;
        }
        if (k === 0) F.blade([[-S * 0.9, -S * 0.15], [S * 0.9, -S * 0.15], [S * 0.9, S * 0.15], [-S * 0.9, S * 0.15]].map(([a, f]) => [a * 0.85, f]) as [number, number][], em, U * 0.08, 0.002);
        if (k === 1) { F.blade([[-S * 0.7, -S * 0.1], [S * 0.7, -S * 0.1], [S * 0.7, S * 0.1], [-S * 0.7, S * 0.1]], em, U * 0.08, 0.002); F.blade([[-S * 0.1, -S * 0.6], [S * 0.1, -S * 0.6], [S * 0.1, S * 0.6], [-S * 0.1, S * 0.6]], em, U * 0.08, 0.0021); }
        if (k === 2) { const ring: [number, number][] = []; for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; ring.push([Math.sin(t) * S * 0.6, Math.cos(t) * S * 0.6]); } F.blade(ring, em, U * 0.08, 0.002); F.blade(ring.map(([a, f]) => [a * 0.6, f * 0.6]), faceMat, U * 0.085, 0.0025); }
        if (k === 3) F.blade([[S * 0.1, -S * 0.7], [S * 0.6, 0], [S * 0.1, S * 0.7], [-S * 0.2, S * 0.7], [S * 0.25, 0], [-S * 0.2, -S * 0.7]], em, U * 0.08, 0.002);
        if (shape !== 'tower') F.ball([0, 0, U * 0.12], U * 0.17, x.T, 0.003); // boss
      }
      if (e >= 6) F.blade(outline(1.02).filter((_, i) => i % 3 === 0), x.G, U * 0.085, 0.004);
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Ranged
// ---------------------------------------------------------------------------------------------------
function arrow(F: Forge, x: ItemCtx, nock: number, len: number) {
  const U = x.U;
  F.bar([0, nock, 0], [0, nock + len, 0], 0.5, 0.5, x.H, 0.02);
  F.blade([[0, nock + len], [-U * 0.05, nock + len - U * 0.1], [U * 0.05, nock + len - U * 0.1]], x.e >= 1 ? x.T : x.M, 0.3, 0.021);
  for (const s of [-1, 1]) F.blade([[0, nock + U * 0.02], [s * U * 0.05, nock + U * 0.06], [s * U * 0.05, nock + U * 0.2], [0, nock + U * 0.18]], x.dye2, 0.2, 0.021);
}
function bow(x: ItemCtx): Built {
  const U = x.U, L = U * (2.2 + x.r[0] * 0.6), bend = U * (0.25 + x.r[1] * 0.15), recurve = x.r[2] < 0.4 || x.e >= 2;
  return {
    draw: F => {
      const pull = x.draw * U * 1.1;
      const limb = (k: number) => { // k -1..1 along the bow; returns f offset (limbs bend back = -f)
        const q = Math.abs(k);
        let f = -bend * q * q - pull * 0.12 * q;
        if (recurve && q > 0.8) f += (q - 0.8) * bend * 2.5;
        return f;
      };
      const n = 10;
      for (let i = 0; i < n; i++) {
        const k0 = -1 + (2 * i) / n, k1 = -1 + (2 * (i + 1)) / n, r0 = U * (0.055 - Math.abs(k0) * 0.03), r1 = U * (0.055 - Math.abs(k1) * 0.03);
        F.bar([k0 * L / 2, limb(k0), 0], [k1 * L / 2, limb(k1), 0], r0, r1, x.e >= 4 ? x.M : cls(x) === 'metal' ? x.M : x.M);
      }
      F.rod(-U * 0.1, U * 0.1, U * 0.06, U * 0.06, x.W, 0, 0, 0, 0.002);
      if (x.e >= 4) { for (const s of [-1, 1]) F.ball([s * L / 2, limb(s), 0], U * 0.06, x.T, 0.003); }
      const tipA = L / 2 * 0.98, tf = limb(1), nock = -bend * 0.4 - pull;
      F.bar([tipA, tf, 0], [0, Math.min(tf, nock), 0], 0.35, 0.35, x.string, -0.01);
      F.bar([-tipA, tf, 0], [0, Math.min(tf, nock), 0], 0.35, 0.35, x.string, -0.01);
      if (x.draw > 0.05) arrow(F, x, Math.min(tf, nock), U * 1.3);
      else if (x.use && x.t >= 0.8) arrow(F, x, -bend * 0.4 + (x.t - 0.8) * U * 22, U * 1.3); // loosed: it flies off
    },
  };
}
function crossbow(x: ItemCtx): Built {
  const U = x.U, pw = U * (0.55 + x.r[0] * 0.2);
  return {
    g2: U * 0.5,
    draw: F => {
      F.rod(-U * 0.55, U * 0.85, U * 0.06, U * 0.05, x.H);
      F.rod(-U * 0.6, -U * 0.35, U * 0.07, U * 0.06, x.H, -U * 0.04);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k0 = -1 + (2 * i) / n, k1 = -1 + (2 * (i + 1)) / n;
        F.bar([U * 0.8 - Math.abs(k0) * U * 0.12, 0.5, k0 * pw], [U * 0.8 - Math.abs(k1) * U * 0.12, 0.5, k1 * pw], U * 0.04, U * 0.04, x.M);
      }
      const latch = x.draw > 0.1 ? U * 0.2 : U * 0.65;
      for (const s of [-1, 1]) F.bar([U * 0.68, 1, s * pw], [latch, 1, 0], 0.35, 0.35, x.string, 0.01);
      if (x.draw > 0.1) F.bar([latch, 1.5, 0], [U * 1.05, 1.5, 0], 0.55, 0.45, x.T, 0.02);
      else if (x.use && x.t >= 0.5) { const d = U * (1.05 + (x.t - 0.5) * 20); F.bar([d - U * 0.4, 1.5, 0], [d, 1.5, 0], 0.55, 0.45, x.T, 0.02); } // the bolt flies off
    },
  };
}
/**
 * What leaves the muzzle after the shot (t >= 0.5 of the use loop): a big cloud of black-powder smoke for muskets,
 * a star-shaped flash, a wisp of smoke and a spent casing for modern guns (two shots for assault rifles), a glowing
 * bolt for pulse rifles and a plasma ball for the space age. `a` is the muzzle along the barrel, `f` its height.
 */
function shotFx(F: Forge, x: ItemCtx, a: number, f: number) {
  const U = x.U, e = x.e, age = x.t - 0.5; // 0 .. 0.5
  const smoke = (l: number): Mat => ({ ramp: ramp(0.6, 0.05, l), tex: 'smooth', line: [150, 150, 160] });
  const flash = (q: number, big = 1) => {
    if (q <= 0) return;
    const r = U * 0.3 * big * q;
    F.blade([[a, f - r * 0.5], [a + r * 1.6, f - r * 0.25], [a + r * 2.6, f], [a + r * 1.6, f + r * 0.25], [a, f + r * 0.5]], x.fire, 0.3, 0.06);
    F.blade([[a + r * 0.8, f - r * 1.1], [a + r * 1.05, f], [a + r * 0.8, f + r * 1.1], [a + r * 0.55, f]], x.fire, 0.3, 0.061);
    F.ball([a + r * 0.7, f, 0], r * 0.55, x.fire2, 0.062);
  };
  if (e === 3) { // musket: flash, then a big rolling cloud that drifts up and forward
    flash(age < 0.1 ? 1 : 0, 1.5);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = i / n, g = Math.min(1, age * 3 + 0.2);
      const pa = a + U * (0.1 + k * 0.9 * g + age * 0.4), pf = f + U * (0.05 + k * 0.15 + age * 0.9 + Math.sin(i * 1.7) * 0.06);
      F.ball([pa, pf, (i % 2 ? 1 : -1) * U * 0.05], U * (0.1 + g * 0.2) * (1 - k * 0.35), smoke(0.78 - k * 0.08), 0.05 + i * 0.001);
    }
    F.ball([U * 0.15, U * (0.18 + age * 0.6), 0], U * (0.05 + age * 0.25), smoke(0.72), 0.04); // flash in the pan
    return;
  }
  if (e <= 5) {
    flash(age < 0.1 ? 1 : 0);
    if (e === 5) flash(age >= 0.1 && age < 0.2 ? 0.75 : 0); // second round of the burst
    for (let i = 0; i < 3; i++) F.ball([a + U * (0.12 + i * 0.12 + age * 0.4), f + U * (age * 0.7 + i * 0.04), 0], U * (0.05 + age * 0.22) * (1 - i * 0.2), smoke(0.72 - i * 0.04), 0.04 + i * 0.001);
    const c = Math.min(age, 0.3); // spent casing tumbling out of the ejection port
    F.bar([U * 0.2 + c * U * 0.3, U * 0.1 + c * U * 2.2 - c * c * U * 9, U * 0.1 + c * U * 0.8], [U * 0.26 + c * U * 0.3, U * 0.12 + c * U * 2.2 - c * c * U * 9, U * 0.1 + c * U * 0.8], 0.6, 0.6, { ramp: ramp(0.12, 0.7, 0.55), tex: 'metal', spec: 0.8 }, 0.05);
    return;
  }
  const d = a + U * (0.2 + age * 9);
  if (e === 6) { F.bar([d, f, 0], [d + U * 0.7, f, 0], U * 0.05, U * 0.03, x.G, 0.06); F.ball([a + U * 0.05, f, 0], U * 0.12 * Math.max(0, 1 - age * 4), x.G, 0.06); return; }
  F.ball([d, f, 0], U * 0.13, x.G, 0.06); F.ball([d, f, 0], U * 0.06, { ramp: ramp(0.15, 0.2, 0.95), tex: 'glow', emit: true, line: null }, 0.07);
  F.bar([d - U * 0.6, f, 0], [d, f, 0], U * 0.02, U * 0.07, { ...x.G, alpha: 0.6 }, 0.055);
  if (age < 0.12) for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; F.ball([a + U * 0.1, f + Math.cos(t) * U * 0.15, Math.sin(t) * U * 0.15], U * 0.04, x.G, 0.06); }
}
function rifle(x: ItemCtx): Built {
  const U = x.U, e = x.e, L = U * (e === 3 ? 2.2 : 1.8);
  return {
    g2: U * 0.55,
    draw: F => {
      const body = e === 3 ? x.H : x.M, dark = e >= 5 ? x.dark : x.M2;
      F.rod(-U * 0.1, U * 0.55, U * 0.075, U * 0.07, body, -U * 0.02);
      F.rod(U * 0.3, L, U * 0.03, U * 0.028, dark, U * 0.05);
      F.plate([[-U * 0.6, -U * 0.02, 0], [-U * 0.1, U * 0.04, 0], [-U * 0.1, -U * 0.1, 0], [-U * 0.62, -U * 0.2, 0]], body); // stock
      F.bar([-U * 0.62, -U * 0.2, 0], [-U * 0.1, -U * 0.08, 0], U * 0.05, U * 0.05, body, -0.001);
      F.rod(-U * 0.02, U * 0.06, U * 0.04, U * 0.035, dark, -U * 0.12); // grip / trigger
      if (e >= 4) F.rod(U * 0.12, U * 0.24, U * 0.045, U * 0.04, dark, -U * 0.16); // magazine
      if (e >= 5) F.rod(U * 0.05, U * 0.35, U * 0.035, U * 0.035, dark, U * 0.12); // sight
      if (e >= 6) { F.rod(U * 0.3, L * 0.9, U * 0.02, U * 0.02, x.G, U * 0.09, U * 0.09, 0, 0.01); F.ball([L, U * 0.05, 0], U * 0.04, x.G, 0.01); }
      if (x.use && x.t >= 0.5) shotFx(F, x, L, U * 0.05);
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------------
const MELEE: MatClass[] = ['wood', 'stone', 'bone', 'metal', 'crystal', 'synthetic', 'energy'];
const TOOL: MatClass[] = ['wood', 'stone', 'bone', 'metal', 'crystal', 'synthetic'];
export const HAND_TYPES: HandType[] = [
  { id: 'sword', slot: 'one', name: 'Espada', eraNames: ['Espada de dentes', 'Espada', 'Espada', 'Sabre', 'Machete', 'Espada tática', 'Lâmina de fase', 'Espada de energia'], blurb: 'Lâmina de uma mão; curva, reta ou em folha conforme o desenho.', mats: MELEE, hold: () => 'swing', make: sword },
  { id: 'dagger', slot: 'one', name: 'Adaga / faca', blurb: 'Lâmina curta, cabe na mão principal ou na secundária.', mats: MELEE, hold: () => 'swing', make: dagger },
  { id: 'axe', slot: 'one', name: 'Machado', blurb: 'Ferramenta de corte e arma; cabeça lascada, fundida ou forjada.', mats: TOOL, hold: () => 'swing', make: x => axe(x) },
  { id: 'mace', slot: 'one', name: 'Maça / clava', eraNames: ['Clava', 'Maça', 'Maça', 'Maça', 'Cassetete', 'Cassetete', 'Maça de impacto', 'Maça de impacto'], blurb: 'Pancada: clava cravejada, maça de flanges ou estrela da manhã.', mats: MELEE, hold: () => 'swing', make: mace },
  { id: 'spear', slot: 'one', name: 'Lança curta', blurb: 'Lança de uma mão para estocar (ou arremessar).', mats: MELEE, hold: () => 'thrust', make: x => spear(x) },
  { id: 'hammer', slot: 'one', name: 'Martelo', blurb: 'Ferramenta de construção e forja.', mats: TOOL, hold: () => 'swing', make: x => hammer(x) },
  { id: 'sickle', slot: 'one', name: 'Foice pequena', blurb: 'Colheita.', mats: TOOL, hold: () => 'swing', make: sickle },
  { id: 'light', slot: 'one', name: 'Iluminação', eraNames: ['Tocha', 'Tocha', 'Lanterna de vela', 'Lampião', 'Lanterna elétrica', 'Lanterna de mão', 'Bastão de luz', 'Orbe de luz'], blurb: 'Tocha, lanterna, lanterna elétrica, bastão ou orbe de luz, conforme a era.', mats: ['wood', 'bone', 'metal', 'crystal', 'synthetic'], hold: e => (e <= 1 || e >= 5 ? 'torch' : 'lantern'), make: light },
  { id: 'shield', slot: 'one', name: 'Escudo', eraNames: ['Escudo de couro', 'Escudo', 'Escudo', 'Escudo', 'Escudo balístico', 'Escudo balístico', 'Escudo balístico', 'Escudo de energia'], blurb: 'Vai na mão secundária; escudos grandes: redondo (viking), heráldico, pipa ou torre.', mats: ['wood', 'hide', 'bone', 'metal', 'crystal', 'synthetic', 'energy'], hold: () => 'shield', make: shield },
  { id: 'longsword', slot: 'two', name: 'Espada longa', blurb: 'Lâmina de duas mãos.', mats: MELEE, hold: () => 'two-swing', make: longsword },
  { id: 'greataxe', slot: 'two', name: 'Machado longo', blurb: 'Machado de duas mãos, de lâmina simples ou dupla.', mats: TOOL, hold: () => 'two-swing', make: x => axe(x, true) },
  { id: 'pickaxe', slot: 'two', name: 'Picareta', blurb: 'Mineração: ponta de chifre, bronze, aço ou liga.', mats: TOOL, hold: () => 'two-swing', make: pick },
  { id: 'sledge', slot: 'two', name: 'Marreta', blurb: 'Martelo de duas mãos.', mats: TOOL, hold: () => 'two-swing', make: x => hammer(x, true) },
  { id: 'pike', slot: 'two', name: 'Lança longa', blurb: 'Haste longa; na era medieval pode ganhar lâmina de alabarda.', mats: MELEE, hold: () => 'two-thrust', make: x => spear(x, true) },
  { id: 'scythe', slot: 'two', name: 'Gadanha', blurb: 'Foice longa de colheita.', mats: TOOL, hold: () => 'two-swing', make: scythe },
  { id: 'shovel', slot: 'two', name: 'Pá', eraNames: ['Pá de omoplata', 'Pá', 'Pá', 'Pá', 'Pá', 'Pá', 'Pá', 'Pá'], blurb: 'Cavar e mover terra.', mats: TOOL, hold: () => 'two-swing', make: shovel },
  { id: 'staff', slot: 'two', name: 'Cajado', blurb: 'Bordão de caminhada ou de ofício, com pedra ou núcleo de energia.', mats: ['wood', 'bone', 'metal', 'crystal', 'synthetic', 'energy'], hold: () => 'two-thrust', make: staff },
  { id: 'bow', slot: 'two', name: 'Arco e flecha', eraNames: ['Arco simples', 'Arco', 'Arco recurvo', 'Arco recurvo', 'Arco composto', 'Arco composto', 'Arco composto', 'Arco composto'], blurb: 'Combina com a aljava (auxiliar) para guardar as flechas.', mats: ['wood', 'bone', 'metal', 'synthetic'], hold: () => 'bow', make: bow },
  { id: 'crossbow', slot: 'two', name: 'Besta', blurb: 'Arco montado numa coronha, com trava.', mats: ['wood', 'metal', 'synthetic'], minEra: 1, hold: () => 'gun', make: crossbow },
  { id: 'rifle', slot: 'two', name: 'Arma de fogo', eraNames: ['', '', '', 'Mosquete', 'Fuzil', 'Rifle', 'Rifle de pulso', 'Rifle de plasma'], blurb: 'Arma de disparo de cada época industrial em diante.', mats: ['wood', 'metal', 'synthetic', 'energy'], minEra: 3, hold: () => 'gun', make: rifle },
];
export const handById = (id: string) => HAND_TYPES.find(t => t.id === id);
void frac;
