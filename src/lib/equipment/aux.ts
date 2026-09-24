// Auxiliary gear carried on the body: on the back (backpack, quiver, bedroll) or at the belt (pouch, satchel,
// flask, sheath, hip quiver). Everything is placed on the creature's own body anchors, so it fits any build.
import type { Mat } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { Sketch, V3 } from '../creature/pose';
import { add } from '../creature/pose';
import type { Body } from '../creature/civ';
import type { MatClass } from './materials';

export type AuxSlot = 'back' | 'belt';
export interface AuxCtx {
  e: number; r: number[]; ph: number;
  M: Mat; M2: Mat; T: Mat; W: Mat; G: Mat; dye: Mat; dye2: Mat; dark: Mat; shaft: Mat; fletch: Mat;
}
export interface AuxType {
  id: string; slot: AuxSlot; name: string; eraNames?: string[]; blurb: string; mats: MatClass[];
  draw: (S: Sketch, B: Body, x: AuxCtx) => void;
}

/** +1 when the creature's back faces the viewer (back gear is then in front of the body) */
const backBias = (S: Sketch, B: Body) => (S.facing([-1, 0, 0]) > 0.15 ? 1 : -1) * B.U * 0.6;
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** shoulder straps: over the shoulder, down the chest to the waist */
function straps(S: Sketch, B: Body, m: Mat, both = true) {
  for (const s of both ? [-1, 1] : [1]) {
    const top = add(B.C, [-B.rC * 0.2, B.rC * 0.95, s * B.rC * 0.55]);
    S.limb(add(top, [-B.rC * 0.7, -B.rC * 0.1, 0]), top, 0.9, 0.9, m, { bias: 0.2 });
    S.limb(top, add(B.C, [B.rC * 0.95, -B.rC * 0.4, s * B.rC * 0.6]), 0.9, 0.9, m, { bias: 0.2 });
    S.limb(add(B.C, [B.rC * 0.95, -B.rC * 0.4, s * B.rC * 0.6]), add(B.P, [B.rP * 0.6, B.rP * 0.2, s * B.rP * 0.9]), 0.8, 0.8, m, { bias: 0.19 });
  }
}
/** belt around the hips (drawn once per belt item) */
export function belt(S: Sketch, B: Body, m: Mat, buckle: Mat) {
  S.blob(add(B.P, [0, B.rP * 0.3, 0]), [1, 0, 0], B.rP + 1.6, B.rP + 1.6, m, { bias: 0.09 }, 1.1);
  S.ball(add(B.P, [B.rP + 1.4, B.rP * 0.3, 0]), 1.2, buckle, { bias: 0.1 });
}
/** a diagonal strap across the chest from shoulder `s` to the opposite hip */
function baldric(S: Sketch, B: Body, m: Mat, s: number) {
  S.limb(add(B.C, [-B.rC * 0.3, B.rC * 0.95, s * B.rC * 0.6]), add(B.C, [B.rC * 0.98, 0, 0]), 0.9, 0.9, m, { bias: 0.22 });
  S.limb(add(B.C, [B.rC * 0.98, 0, 0]), add(B.P, [B.rP * 0.4, B.rP * 0.3, -s * B.rP * 1.05]), 0.9, 0.9, m, { bias: 0.21 });
  S.limb(add(B.C, [-B.rC * 0.3, B.rC * 0.95, s * B.rC * 0.6]), add(B.C, [-B.rC * 0.98, -B.rC * 0.1, 0]), 0.9, 0.9, m, { bias: -0.2 });
}

function backpack(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, e = x.e, bb = backBias(S, B), sway = Math.sin(x.ph * 2) * U * 0.01;
  const w = B.rC * (0.8 + x.r[0] * 0.3), h = U * (0.55 + x.r[1] * 0.3), d = U * (0.22 + x.r[2] * 0.1);
  const c = add(B.C, [-B.rC - d * 0.7 + sway, -U * 0.08, 0]);
  straps(S, B, e >= 4 ? x.dark : x.W);
  if (e === 0) { // hide sack tied at the neck
    S.ball(add(c, [0, -h * 0.1, 0]), Math.max(w, d) * 1.05, x.M, { bias: bb });
    S.limb(add(c, [0, h * 0.25, 0]), add(c, [0, h * 0.45, 0]), w * 0.35, w * 0.5, x.M, { bias: bb + 0.01 });
    S.blob(add(c, [0, h * 0.28, 0]), [1, 0, 0], w * 0.4, w * 0.4, x.W, { bias: bb + 0.02 }, 1);
    return;
  }
  S.limb(add(c, [0, -h / 2 + d, 0]), add(c, [0, h / 2 - d * 0.6, 0]), d * 1.05, d, x.M, { bias: bb }); // body
  for (const s of [-1, 1]) S.limb(add(c, [0, -h * 0.35, s * w * 0.62]), add(c, [0, h * 0.25, s * w * 0.62]), d * 0.9, d * 0.85, x.M, { bias: bb + 0.001 });
  S.ball(add(c, [-d * 0.1, h / 2 - d * 0.3, 0]), d * 1.1, x.M2, { bias: bb + 0.01 }); // flap
  S.limb(add(c, [-d * 0.95, -h * 0.3, 0]), add(c, [-d * 0.95, h * 0.05, 0]), d * 0.45, d * 0.45, e >= 4 ? x.dye : x.M2, { bias: bb * 1.02 + 0.02 }); // front pocket
  if (e <= 3) S.limb(add(c, [-d * 1.1, h * 0.12, -w * 0.4]), add(c, [-d * 1.1, h * 0.12, w * 0.4]), 0.6, 0.6, x.T, { bias: bb * 1.02 + 0.03 });
  else S.limb(add(c, [-d * 1.0, h * 0.35, -w * 0.5]), add(c, [-d * 1.0, h * 0.35, w * 0.5]), 0.45, 0.45, x.dark, { bias: bb * 1.02 + 0.03 }); // zip
  if (x.r[3] < 0.55 && e <= 4) { // bedroll on top
    const bt = add(c, [0, h / 2 + d * 0.4, 0]);
    S.limb(add(bt, [0, 0, -w * 1.1]), add(bt, [0, 0, w * 1.1]), d * 0.6, d * 0.6, x.dye2, { bias: bb + 0.03 });
    for (const s of [-0.6, 0.6]) S.blob(add(bt, [0, 0, s * w]), [0, 0, 1], 0.9, d * 0.65, x.W, { bias: bb + 0.04 }, d * 0.65);
  }
  if (e >= 6) S.limb(add(c, [-d * 1.05, -h * 0.35, 0]), add(c, [-d * 1.05, h * 0.3, 0]), 0.6, 0.6, x.G, { bias: bb * 1.03 + 0.05 });
}
function quiverAt(S: Sketch, a: V3, b: V3, x: AuxCtx, bias: number, n = 5) {
  const U = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  S.limb(a, b, U * 0.1, U * 0.13, x.M, { bias });
  S.blob(b, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], 0.9, U * 0.14, x.e === 0 ? x.W : x.T, { bias: bias + 0.01 }, U * 0.14);
  S.blob(lerp(a, b, 0.25), [b[0] - a[0], b[1] - a[1], b[2] - a[2]], 0.8, U * 0.12, x.e === 0 ? x.W : x.M2, { bias: bias + 0.01 }, U * 0.12);
  const d: V3 = [(b[0] - a[0]) / U, (b[1] - a[1]) / U, (b[2] - a[2]) / U];
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) / n, tip = add(b, [d[0] * U * 0.35 + k * U * 0.12, d[1] * U * 0.35 + (i % 2) * 1.2, d[2] * U * 0.35 + k * U * 0.18]);
    const base = add(b, [k * U * 0.08, -U * 0.05, k * U * 0.12]);
    S.limb(base, tip, 0.45, 0.45, x.shaft, { bias: bias - 0.005 });
    S.blob(lerp(base, tip, 0.8), d, U * 0.08, 1.3, x.fletch, { bias: bias - 0.004 }, 0.8);
  }
}
function quiver(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, bb = backBias(S, B);
  baldric(S, B, x.e >= 4 ? x.dark : x.W, 1);
  const a = add(B.C, [-B.rC - U * 0.1, -U * 0.55, -B.rC * 0.45]), b = add(B.C, [-B.rC - U * 0.16, U * 0.45, B.rC * 0.5]);
  quiverAt(S, a, b, x, bb);
}
function hipQuiver(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U;
  belt(S, B, x.W, x.T);
  const a = add(B.P, [-B.rP * 0.2, -U * 0.55, B.rP + U * 0.12]), b = add(B.P, [B.rP * 0.2, U * 0.12, B.rP + U * 0.14]);
  quiverAt(S, a, b, x, 0.15, 4);
}
function pouch(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, e = x.e, sw = Math.sin(x.ph) * U * 0.01;
  belt(S, B, x.W, x.T);
  const c = add(B.P, [B.rP * 0.35 + sw, -U * 0.08, B.rP + U * 0.1]);
  if (e === 0) { S.ball(c, U * 0.13, x.M, { bias: 0.15 }); S.blob(add(c, [0, U * 0.11, 0]), [1, 0, 0], U * 0.06, U * 0.06, x.W, { bias: 0.16 }, 0.9); return; }
  S.limb(add(c, [0, -U * 0.08, 0]), add(c, [0, U * 0.08, 0]), U * 0.12, U * 0.11, x.M, { bias: 0.15 });
  S.blob(add(c, [U * 0.02, U * 0.07, 0]), [1, 0, 0], U * 0.13, U * 0.12, x.M2, { bias: 0.16 }, U * 0.05);
  S.ball(add(c, [U * 0.12, U * 0.02, 0]), 0.9, e >= 4 ? x.dark : x.T, { bias: 0.17 });
  if (x.r[0] < 0.5) { const c2 = add(B.P, [B.rP * 0.2, -U * 0.05, -B.rP - U * 0.1]); S.limb(add(c2, [0, -U * 0.06, 0]), add(c2, [0, U * 0.06, 0]), U * 0.1, U * 0.09, x.M, { bias: 0.15 }); }
}
function satchel(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, sw = Math.sin(x.ph + 0.5) * U * 0.02;
  baldric(S, B, x.e >= 4 ? x.dark : x.W, -1);
  const c = add(B.P, [B.rP * 0.1 + sw, 0, B.rP + U * 0.18]);
  S.limb(add(c, [-U * 0.2, -U * 0.02, 0]), add(c, [U * 0.2, -U * 0.02, 0]), U * 0.17, U * 0.17, x.M, { bias: 0.15 });
  S.poly([add(c, [-U * 0.24, U * 0.15, U * 0.05]), add(c, [U * 0.24, U * 0.15, U * 0.05]), add(c, [U * 0.24, -U * 0.04, U * 0.19]), add(c, [-U * 0.24, -U * 0.04, U * 0.19])], x.M2, { bias: 0.16, flat: 0.6 });
  S.ball(add(c, [0, -U * 0.02, U * 0.2]), 1, x.e >= 4 ? x.dark : x.T, { bias: 0.17 });
  if (x.e >= 6) S.limb(add(c, [-U * 0.22, U * 0.15, U * 0.06]), add(c, [U * 0.22, U * 0.15, U * 0.06]), 0.45, 0.45, x.G, { bias: 0.18 });
}
function flask(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, e = x.e, sw = Math.sin(x.ph) * U * 0.02;
  belt(S, B, x.W, x.T);
  const c = add(B.P, [-B.rP * 0.2 + sw, -U * 0.18, -(B.rP + U * 0.1)]);
  S.limb(add(B.P, [-B.rP * 0.2, B.rP * 0.2, -(B.rP + 1)]), add(c, [0, U * 0.14, 0]), 0.5, 0.5, x.W, { bias: 0.14 });
  if (e <= 1) { S.ball(add(c, [0, -U * 0.05, 0]), U * 0.14, x.M, { bias: 0.15 }); S.ball(add(c, [0, U * 0.1, 0]), U * 0.08, x.M, { bias: 0.151 }); S.limb(add(c, [0, U * 0.14, 0]), add(c, [0, U * 0.2, 0]), U * 0.03, U * 0.03, x.W, { bias: 0.152 }); return; }
  if (e <= 3) { S.disc(c, U * 0.15, U * 0.15, 0, x.M, { bias: 0.15 }); S.limb(add(c, [0, U * 0.12, 0]), add(c, [0, U * 0.2, 0]), U * 0.035, U * 0.03, x.T, { bias: 0.151 }); return; }
  S.limb(add(c, [0, -U * 0.13, 0]), add(c, [0, U * 0.1, 0]), U * 0.08, U * 0.075, x.M, { bias: 0.15 });
  S.limb(add(c, [0, U * 0.1, 0]), add(c, [0, U * 0.16, 0]), U * 0.04, U * 0.04, x.dark, { bias: 0.151 });
  if (e >= 6) S.limb(add(c, [0, -U * 0.08, U * 0.05]), add(c, [0, U * 0.05, U * 0.05]), 0.5, 0.5, x.G, { bias: 0.152 });
}
function sheath(S: Sketch, B: Body, x: AuxCtx) {
  const U = B.U, L = U * (1 + x.r[0] * 0.4);
  belt(S, B, x.W, x.T);
  const top = add(B.P, [B.rP * 0.3, B.rP * 0.1, -(B.rP + U * 0.08)]), end = add(top, [-L * 0.55, -L * 0.8, -U * 0.05]);
  S.limb(top, end, U * 0.07, U * 0.05, x.M, { bias: 0.12 });
  S.limb(top, lerp(top, end, 0.12), U * 0.08, U * 0.075, x.T, { bias: 0.13 });
  S.limb(lerp(top, end, 0.9), end, U * 0.06, U * 0.04, x.T, { bias: 0.13 });
  S.limb(add(top, [U * 0.04, U * 0.05, 0]), add(top, [U * 0.14, U * 0.25, 0]), U * 0.04, U * 0.04, x.dark, { bias: 0.125 }); // the hilt of the stowed blade
  S.ball(add(top, [U * 0.17, U * 0.3, 0]), U * 0.05, x.T, { bias: 0.126 });
}

const BAG: MatClass[] = ['hide', 'fiber', 'synthetic'];
export const AUX_TYPES: AuxType[] = [
  { id: 'backpack', slot: 'back', name: 'Mochila', eraNames: ['Saco de couro', 'Mochila', 'Mochila', 'Mochila', 'Mochila', 'Mochila', 'Mochila', 'Mochila'], blurb: 'Carga nas costas, com rolo de dormir em algumas.', mats: BAG, draw: backpack },
  { id: 'quiver', slot: 'back', name: 'Aljava de costas', blurb: 'Guarda as flechas do arco; tira-colo sobre o peito.', mats: ['hide', 'wood', 'fiber', 'synthetic', 'metal'], draw: quiver },
  { id: 'hipquiver', slot: 'belt', name: 'Aljava de cintura', blurb: 'Flechas à mão, presas ao cinto.', mats: ['hide', 'wood', 'fiber', 'synthetic'], draw: hipQuiver },
  { id: 'pouch', slot: 'belt', name: 'Bolsa de cintura', blurb: 'Uma ou duas bolsinhas no cinto.', mats: BAG, draw: pouch },
  { id: 'satchel', slot: 'belt', name: 'Bolsa a tiracolo', blurb: 'Bolsa lateral com alça cruzando o peito.', mats: BAG, draw: satchel },
  { id: 'flask', slot: 'belt', name: 'Cantil', eraNames: ['Cabaça', 'Odre', 'Cantil', 'Cantil', 'Cantil', 'Garrafa', 'Garrafa', 'Garrafa'], blurb: 'Água: cabaça, odre, cantil ou garrafa, conforme a era.', mats: ['wood', 'hide', 'metal', 'synthetic', 'crystal'], draw: flask },
  { id: 'sheath', slot: 'belt', name: 'Bainha', blurb: 'Bainha na cintura com a lâmina guardada.', mats: ['hide', 'wood', 'metal', 'synthetic'], draw: sheath },
];
export const auxById = (id: string) => AUX_TYPES.find(t => t.id === id);
export const auxFletch = (h: number): Mat => ({ ramp: ramp(h, 0.5, 0.6), tex: 'feathers' });
