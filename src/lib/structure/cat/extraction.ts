// Extraction: where resources come out of the world - farms, orchards, mines, wells, timber.
import type { StructType } from '../registry';
import { Ctx, box, cyl, rect, ground, coneRoof, domeRoof, onWall, fence, fire, smoke, lamp, sails, crate, barrel, sack, facet, disc, tree, cropRows, solarPanel, flag } from '../parts';
import { house, pavilion, rnd, chance } from '../core';
import { ring, V3 } from '../draft';
import { stack } from './industrial';

function scarecrow(x: Ctx, a: number, f: number) {
  const { D, K } = x, k = D.depth([a, 3, f]) + 0.2, sw = Math.sin(x.ph) * 0.4;
  D.cap([a, 0, f], [a, 8, f], 0.5, 0.4, K.wood, k);
  D.cap([a - 3.5, 6 + sw * 0.3, f], [a + 3.5, 6 - sw * 0.3, f], 0.5, 0.5, K.wood, k + 0.001);
  D.ell([a, 5, f], 1.6, 2.2, K.cloth, k + 0.002);
  D.ell([a, 8.6, f], 1.3, 1.3, K.cloth2, k + 0.003);
}
function silo(x: Ctx, a: number, f: number, r: number, h: number) {
  const { K } = x;
  const v = cyl(x, a, f, r, 0, h, x.e >= 4 ? K.metal : K.wall2, null);
  domeRoof(x, a, f, h, r, r * 0.7, x.e >= 4 ? K.metal : K.roof, v.key + 0.02);
  for (let i = 1; i < 4; i++) cyl(x, a, f, r + 0.3, (h * i) / 4 - 0.3, (h * i) / 4 + 0.3, K.trim, K.trim, { bias: 0.01 });
}
function greenhouse(x: Ctx, a: number, f: number, w: number, d: number) {
  const { K, D } = x, h = 6;
  const v = box(x, a - w / 2, f - d / 2, a + w / 2, f + d / 2, 0, h, { ...K.win, tex: 'glazing' }, null);
  const R = d / 2, arcA: V3[] = [], arcB: V3[] = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI; arcA.push([a - w / 2, h + Math.sin(t) * R * 0.6, f + Math.cos(t) * R]); arcB.push([a + w / 2, h + Math.sin(t) * R * 0.6, f + Math.cos(t) * R]); }
  D.hull([...arcA, ...arcB], { ...K.win, tex: 'glazing' }, v.key + 0.02, { g: D.group(), flat: 0.3 });
  if (x.e >= 6) for (let i = 0; i < 4; i++) lamp(x, [a - w / 2 + (w * (i + 0.5)) / 4, h + R * 0.3, f + R * 0.6], K.glow2, false, 0.7);
}

function farm(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey;
  const Z = { small: 1, medium: 1.6, large: 2.3, giant: 3.2 }[x.size];
  if (x.size === 'giant' && e >= 6) { // vertical farm: glass tiers of green
    let y = 0;
    for (let i = 0; i < 9; i++) {
      const v = box(x, -22, -16, 22, 16, y, y + S, { ...K.win, tex: 'glazing' }, K.trim, i * 0.001);
      for (let j = 0; j < 6; j++) { const a = -18 + j * 7.2; if (x.D.facing([0, 0, 1]) > 0.1) x.D.ell([a, y + 3, 16.4], 3, 2.2, j % 2 ? K.leaf : K.leaf2, v.key + 0.01, { g: D.group(), noLine: true }); }
      y += S;
    }
    domeRoof(x, 0, 0, y, 18, 10, { ...K.win, tex: 'glazing' }, D.depth([0, y, 0]) + 0.01);
    for (let i = 0; i < 4; i++) cropRows(x, -60 + i * 30, 26, -36 + i * 30, 44, K.crop);
    return;
  }
  // fields around the farmstead
  const fw = 26 * Z, fd = 16 * Z;
  const plots = x.size === 'small' ? 1 : x.size === 'medium' ? 2 : 4;
  for (let i = 0; i < plots; i++) {
    const a = (i % 2) * (fw + 4) - (plots > 1 ? fw / 2 + 2 : 0), f = Math.floor(i / 2) * (fd + 4) + fd / 2 + 6;
    cropRows(x, a - fw / 2, f - fd / 2, a + fw / 2, f + fd / 2, i % 2 ? K.crop2 : K.crop, e === 0 ? 1.4 : 1.8);
    if (e <= 1) fence(x, [[a - fw / 2, f + fd / 2 + 1], [a + fw / 2, f + fd / 2 + 1]], 4.5, K.wood, 4);
    if (e <= 2 && i === 0) scarecrow(x, a, f);
  }
  // the farmstead
  const hy = -12 - (x.size === 'small' ? 0 : 6);
  if (e === 0) { house(x, { a: -8, f: hy, w: 14, d: 11, floors: 1 }); for (let i = 0; i < 3; i++) sack(x, 4 + i * 2.5, hy + 5, 0, 3, K.cloth2); cyl(x, 12, hy, 4, 3, 7, K.wall, null); coneRoof(x, 12, hy, 7, 5, 5, K.roof, D.depth([12, 7, hy]) + 0.01); for (const s of [-1, 1]) x.D.cap([12 + s * 3, 0, hy + 2], [12 + s * 3, 3, hy + 2], 0.5, 0.5, K.wood, D.depth([12, 1, hy + 3])); return; }
  house(x, { a: -14, f: hy, w: 16, d: 12, floors: e >= 2 ? 2 : 1 });
  const barn = house(x, { a: 10, f: hy - 2, w: 20, d: 15, floors: 2, roof: e >= 4 ? 'vault' : 'gable', windows: false, door: false, chimney: false, wall: e <= 3 ? K.wood : K.wall2 });
  if (barn.v.kind === 'prism') onWall(x, barn.v, barn.front, 10, barn.y0 + S * 0.6, S * 0.9, S * 1.2, 'rect', K.door);
  if (e >= 3) silo(x, 26, hy - 4, 5, S * 3);
  if (e === 3) { // wind pump
    x.D.cap([-28, 0, hy + 4], [-28, S * 2.4, hy + 4], 0.7, 0.4, K.frame, D.depth([-28, 10, hy + 4]));
    sails(x, [-28, S * 2.4, hy + 5], 5, 8, K.metal, K.metal, 0.2, 2);
  }
  if (e === 5 && x.size !== 'small') { // centre-pivot irrigation arm sweeping
    const t = x.ph / 4, len = fw * 0.9, c: V3 = [0, 3, fd + 10];
    x.D.cap(c, [c[0] + Math.cos(t) * len, 3, c[2] + Math.sin(t) * len * 0.5], 0.5, 0.5, K.metal, 1e4);
    for (let i = 1; i < 4; i++) x.D.cap([c[0] + Math.cos(t) * len * i / 4, 0, c[2] + Math.sin(t) * len * 0.5 * i / 4], [c[0] + Math.cos(t) * len * i / 4, 3, c[2] + Math.sin(t) * len * 0.5 * i / 4], 0.4, 0.4, K.metal, 1e4 + 0.01);
  }
  if (e >= 5) greenhouse(x, -30, hy + 2, 14, 10);
  if (e >= 6) for (let i = 0; i < 3; i++) solarPanel(x, 30 + i * 5, 6, 0, 4.4, 3.4);
}

function orchard(x: Ctx) {
  const { K, e } = x, med = x.size === 'medium';
  const cols = med ? 5 : 3, rows = med ? 3 : 2;
  ground(x, rect(-cols * 9 - 6, -rows * 9 - 4, cols * 9 + 6, rows * 9 + 10), K.ground, 0, 0.5);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = (c - (cols - 1) / 2) * 18, f = (r - (rows - 1) / 2) * 18;
    tree(x, a, f, 1, x.C.mode === 'alien' ? 2 : 0, 4);
  }
  if (e >= 1) fence(x, [[-cols * 9 - 5, rows * 9 + 9], [cols * 9 + 5, rows * 9 + 9]], 5, e >= 4 ? K.metal : K.wood, 5);
  for (let i = 0; i < 3; i++) (e >= 4 ? crate : barrel)(x, cols * 9 + 10, -4 + i * 5, 0, 3.6, K.wood);
  if (med) house(x, { a: -cols * 9 - 14, f: -2, w: 14, d: 12, floors: 1, chimney: false });
}

function mound(x: Ctx, a: number, f: number, r: number, h: number) {
  x.D.hull([...ring(a, f, 0, r, 18), ...ring(a, f, h * 0.6, r * 0.6, 14), [a, h, f]], x.K.stone, x.D.depth([a, h / 3, f]), { g: x.D.group(), flat: 0.05 });
}
function headframe(x: Ctx, a: number, f: number, h: number) {
  const { K, D } = x, m = x.e <= 2 ? K.wood : K.iron, k = D.depth([a, h / 2, f]);
  for (const [pa, pf] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) D.cap([a + pa, 0, f + pf], [a + pa * 0.3, h, f + pf * 0.3], 0.8, 0.6, m, k + (pf > 0 ? 0.01 : -0.01));
  for (let i = 1; i < 4; i++) { const y = (h * i) / 4, s = 1 - 0.7 * (i / 4); D.cap([a - 4 * s, y, f + 3 * s], [a + 4 * s, y, f + 3 * s], 0.4, 0.4, m, k + 0.012); D.cap([a - 4 * s, y, f - 3 * s], [a + 4 * s, y, f - 3 * s], 0.4, 0.4, m, k - 0.012); }
  const hub: V3 = [a, h + 1, f + 2], R = 3.5;
  for (let i = 0; i < 6; i++) { const t = x.ph / 6 + (i / 6) * Math.PI * 2; D.cap(hub, [a + Math.cos(t) * R, h + 1 + Math.sin(t) * R, f + 2], 0.35, 0.35, m, k + 0.03); }
  for (let i = 0; i < 12; i++) { const t0 = (i / 12) * Math.PI * 2, t1 = ((i + 1) / 12) * Math.PI * 2; D.cap([a + Math.cos(t0) * R, h + 1 + Math.sin(t0) * R, f + 2], [a + Math.cos(t1) * R, h + 1 + Math.sin(t1) * R, f + 2], 0.5, 0.5, m, k + 0.031); }
  D.cap([a + R, h + 1, f + 2], [a + R, 2 + (Math.sin(x.ph) + 1) * h * 0.3, f + 2], 0.25, 0.25, K.rope, k + 0.029);
}
function mine(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey;
  if (x.size === 'giant') { // open pit: stepped rings sinking into the ground
    const R = 70;
    ground(x, rect(-R - 10, -R * 0.8, R + 10, R * 0.8), K.soil, 0, 0.5);
    for (let i = 0; i < 6; i++) {
      const r = R * (1 - i * 0.14), y = -i * 5;
      disc(x, 0, 0, y + 0.01, r, i % 2 ? K.stone : x.K.soil, -9e4 + i);
      if (i < 5) x.D.hull([...ring(0, r * 0.1, y - 5, r * 0.86, 24).filter(p => p[2] < r * 0.1), ...ring(0, r * 0.1, y, r * 0.86, 24).filter(p => p[2] < r * 0.1)], K.stone, -9e4 + i + 0.5, { g: x.D.group(), dark: 0.8 });
    }
    headframe(x, R * 0.8, -R * 0.55, S * 3);
    house(x, { a: -R * 0.75, f: -R * 0.6, w: 22, d: 14, floors: 2, roof: e >= 4 ? 'flat' : undefined });
    if (e >= 3) stack(x, -R * 0.55, -R * 0.75, 2.6, S * 4, K.wall2);
    return;
  }
  const hill = x.size === 'small' ? 22 : 30;
  mound(x, 0, -8, hill, hill * 0.75);
  // the adit: a timbered mouth in the hillside with rails coming out
  const key = D.depth([0, 4, hill * 0.6 - 8]) + 0.3;
  if (D.facing([0, 0.2, 1]) > 0.1) {
    D.poly([[-4, 0, hill * 0.8 - 8], [4, 0, hill * 0.8 - 8], [3.4, 8, hill * 0.66 - 8], [-3.4, 8, hill * 0.66 - 8]], K.dark, key);
    for (const s of [-1, 1]) D.cap([s * 4, 0, hill * 0.8 - 7.6], [s * 3.6, 8.5, hill * 0.68 - 7.6], 0.8, 0.8, K.wood, key + 0.01);
    D.cap([-5, 8.5, hill * 0.68 - 7.4], [5, 8.5, hill * 0.68 - 7.4], 0.9, 0.9, K.wood, key + 0.02);
  }
  for (const s of [-1.2, 1.2]) D.cap([s, 0.2, hill * 0.8 - 8], [s, 0.2, hill + 10], 0.3, 0.3, K.iron, -5e4);
  for (let i = 0; i < 5; i++) mound(x, 18 + (i % 3) * 4, 10 + Math.floor(i / 3) * 4, 3, 3);
  if (x.size !== 'small') {
    headframe(x, -hill * 0.9, 6, e >= 3 ? S * 2.4 : S * 1.6);
    house(x, { a: -hill * 0.9, f: 18, w: 16, d: 11, floors: 1 });
    if (e >= 3) stack(x, hill * 0.9, -14, 2.4, S * 3.2, K.wall2);
    if (x.size === 'large') { house(x, { a: hill + 8, f: -18, w: 22, d: 16, floors: 3, roof: e >= 4 ? 'flat' : undefined, windows: e >= 3 }); D.cap([hill * 0.3, 2, 0], [hill + 2, S * 2.6, -14], 1.2, 1.2, K.frame, D.depth([hill * 0.6, S, -7]) + 0.5); }
  }
  lamp(x, [5.5, 7, hill * 0.8 - 7], K.fire, false, 0.9);
  void onWall; void smoke;
}

function derrick(x: Ctx, a: number, f: number, h: number) {
  const { K, D } = x, m = x.e <= 3 ? K.wood : K.iron, k = D.depth([a, h / 2, f]);
  for (const [pa, pf] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) D.cap([a + pa, 0, f + pf], [a, h, f], 0.6, 0.4, m, k + pf * 0.002);
  for (let i = 1; i < 6; i++) { const y = (h * i) / 6, s = 1 - i / 6; for (const pf of [-1, 1]) D.cap([a - 4 * s, y, f + 4 * s * pf], [a + 4 * s, y, f + 4 * s * pf], 0.3, 0.3, m, k + pf * 0.003); }
  lamp(x, [a, h + 1, f], K.fire, true, 0.8);
}
function pumpjack(x: Ctx, a: number, f: number, s: number) {
  const { K, D } = x, k = D.depth([a, 4 * s, f]), tilt = Math.sin(x.ph) * 0.35;
  box(x, a - 5 * s, f - 1.5 * s, a + 5 * s, f + 1.5 * s, 0, 1 * s, K.base, K.base);
  D.cap([a, 1 * s, f], [a, 6 * s, f], 0.7 * s, 0.5 * s, K.frame, k);
  const L = 7 * s, p: V3 = [a, 6.5 * s, f];
  const head: V3 = [a + Math.cos(tilt) * L, 6.5 * s + Math.sin(tilt) * L, f], tail: V3 = [a - Math.cos(tilt) * L * 0.6, 6.5 * s - Math.sin(tilt) * L * 0.6, f];
  D.cap(tail, head, 0.9 * s, 0.9 * s, K.accent, k + 0.01);
  D.ell(head, 1.4 * s, 2.2 * s, K.accent, k + 0.012, {}, tilt);
  D.cap([head[0] + 0.8 * s, head[1] - 2 * s, f], [head[0] + 0.8 * s, 1, f], 0.2, 0.2, K.rope, k + 0.011);
  D.ell([tail[0], tail[1] - 1.6 * s, f], 1.6 * s, 1.6 * s, K.iron, k + 0.013);
  void p;
}
function well(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey;
  if (e <= 2) { // water well with a roof and a turning windlass
    const n = x.size === 'small' ? 1 : x.size === 'medium' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 18;
      cyl(x, a, 0, 4, 0, 3, e === 0 ? K.wood : K.stone, K.dark);
      disc(x, a, 0, 3.05, 2.8, K.water, D.depth([a, 3, 0]) + 0.002);
      for (const s of [-1, 1]) D.cap([a + s * 4.2, 0, 0], [a + s * 4.2, 9, 0], 0.6, 0.5, K.wood, D.depth([a + s * 4, 4, 0]) + 0.01);
      const t = x.ph;
      D.cap([a - 4.2, 7, 0], [a + 4.2, 7, 0], 1.1, 1.1, K.wood, D.depth([a, 7, 0]) + 0.02);
      D.cap([a + 4.2, 7, 0], [a + 4.2 + Math.cos(t) * 2.2, 7 + Math.sin(t) * 2.2, 0.8], 0.4, 0.4, K.wood, D.depth([a + 5, 7, 0]) + 0.03);
      D.cap([a, 7, 0], [a, 7 - 2.5 - (Math.sin(t) + 1) * 1.5, 0], 0.2, 0.2, K.rope, D.depth([a, 5, 0]) + 0.021);
      box(x, a - 1, -1, a + 1, 1, 7 - 4 - (Math.sin(t) + 1) * 1.5, 7 - 2.4 - (Math.sin(t) + 1) * 1.5, K.wood, K.water, 0.022);
      if (e >= 1) box(x, a - 5, -3, a + 5, 3, 9, 9.3, K.wood, null);
      if (e >= 1) coneRoof(x, a, 0, 9, 6.2, 4.4, K.roof, D.depth([a, 9, 0]) + 0.05);
      for (let j = 0; j < 2; j++) barrel(x, a + 6 + j * 3, 3, 0, 2.8, K.wood);
    }
    return;
  }
  if (e <= 5) { // oil: derricks, pumpjacks, tanks
    const n = x.size === 'small' ? 1 : x.size === 'medium' ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i % 2) * 24 - (n > 1 ? 12 : 0), f = Math.floor(i / 2) * -20;
      if (e === 3 || (i === 0 && x.size !== 'small')) derrick(x, a, f, S * 3.4);
      if (e >= 4 || i > 0 || x.size === 'small') pumpjack(x, a + (e === 3 ? 10 : 0), f + 6, 1);
    }
    if (x.size !== 'small') for (let i = 0; i < 2; i++) { cyl(x, -34 + i * 11, -10, 5, 0, 8, K.metal, K.metal); }
    if (x.size === 'large') { house(x, { a: 30, f: 10, w: 14, d: 10, floors: 1, roof: 'flat' }); for (let i = 0; i < 2; i++) D.cap([-30, 2 + i, -6], [24, 2 + i, 10], 0.6, 0.6, K.accent, D.depth([0, 2, 2]) - 1); }
    for (let i = 0; i < 4; i++) barrel(x, 8 + (i % 2) * 3, 12 + Math.floor(i / 2) * 3, 0, 3, K.accent);
    return;
  }
  // atmospheric / core extractor: a tower breathing in the sky, rings of light
  const H = S * (x.size === 'small' ? 4 : x.size === 'medium' ? 6 : 8), r = x.size === 'small' ? 4 : 6;
  cyl(x, 0, 0, r * 2, 0, 3, K.base, K.paving);
  const v = cyl(x, 0, 0, r, 3, H, K.wall, null, { rt: r * 0.6 });
  domeRoof(x, 0, 0, H, r * 0.6, r * 0.8, K.win, v.key + 0.02);
  for (let i = 0; i < 4; i++) { const t = frac(x.t + i / 4), y = 3 + t * (H - 3), rr = r - (r * 0.4 * (y - 3)) / (H - 3); cyl(x, 0, 0, rr + 1.2, y - 0.4, y + 0.4, K.glow2, null, { bias: 0.02 }); }
  for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2 + 0.5; cyl(x, Math.sin(t) * r * 3, Math.cos(t) * r * 2, 3, 0, 7, K.metal, K.trim); D.cap([Math.sin(t) * r * 3, 5, Math.cos(t) * r * 2], [0, 5, 0], 0.8, 0.8, K.metal, D.depth([Math.sin(t) * r * 1.5, 5, Math.cos(t) * r]) - 0.5); }
  smoke(x, [0, H + r, 0], 2, K.steam, 4, 20);
}
const frac = (v: number) => v - Math.floor(v);

function lumber(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, med = x.size === 'medium';
  ground(x, rect(-34, -20, 34, 20), K.soil, 0, 0.5);
  for (let i = 0; i < (med ? 4 : 3); i++) { const a = -30 + i * 13, f = -18 + (i % 2) * 6; tree(x, a, f, 1.1, 1); }
  for (let i = 0; i < 6; i++) cyl(x, -18 + (i % 3) * 5, 6 + Math.floor(i / 3) * 5, 1.4, 0, 1.2, K.trunk, K.wood);
  for (let r = 0; r < 3; r++) for (let j = 0; j < 4 - r; j++) D.cap([10 + j * 2.4 + r * 1.2, 1.1 + r * 2, -4], [10 + j * 2.4 + r * 1.2, 1.1 + r * 2, 12], 1.2, 1.2, K.trunk, D.depth([10 + j * 2.4, 1 + r * 2, 4]) + r * 0.01);
  if (e <= 1) {
    pavilion(x, -4, -4, 14, 9, S * 0.8, 'shed', K.roof, K.wood, 1);
    const saw = Math.sin(x.ph * 2) * 1.5;
    D.cap([-6 + saw, 3.5, -4], [-6 + saw, 6, -4], 0.3, 0.3, K.metal, D.depth([-6, 4, -4]) + 0.5);
    D.cap([-10, 3, -4], [2, 3, -4], 1.1, 1.1, K.trunk, D.depth([-4, 3, -4]) + 0.4);
    fire(x, [6, 0, 12], 1.1);
  } else {
    const h = house(x, { a: -6, f: -4, w: 20, d: 13, floors: 1, roof: e >= 4 ? 'flat' : 'gable', chimney: false, windows: false });
    if (e <= 4) { stack(x, -14, -10, 1.8, S * 2, K.iron); }
    if (e >= 4) for (let i = 0; i < 3; i++) box(x, 18, -14 + i * 6, 30, -9 + i * 6, 0, 4, K.wood, K.wood); // bundled timber
    void h;
  }
  void flag; void crate; void pavilion; void onWall; void chance; void rnd; void solarPanel;
}

export const EXTRACTION: StructType[] = [
  { id: 'farm', cat: 'extraction', sizes: ['small', 'medium', 'large', 'giant'], name: 'Fazenda', eraNames: ['Roça', 'Herdade', 'Quinta', 'Fazenda', 'Fazenda', 'Fazenda irrigada', 'Fazenda vertical', 'Fazenda vertical'], blurb: 'Lavouras, celeiros e silos; na era futurista, sobe em andares.', build: farm },
  { id: 'orchard', cat: 'extraction', sizes: ['small', 'medium'], name: 'Pomar', blurb: 'Fileiras de árvores frutíferas.', build: orchard },
  { id: 'mine', cat: 'extraction', sizes: ['small', 'medium', 'large', 'giant'], name: 'Mina', eraNames: ['Galeria', 'Mina', 'Mina', 'Mina de poço', 'Mina de poço', 'Mina', 'Mina', 'Mina'], blurb: 'Galerias no morro, poços com torre e, no gigante, a cava a céu aberto.', build: mine },
  { id: 'well', cat: 'extraction', sizes: ['small', 'medium', 'large'], name: 'Poço', eraNames: ['Poço d\'água', 'Poço d\'água', 'Poço d\'água', 'Campo de petróleo', 'Campo de petróleo', 'Campo de petróleo', 'Extrator atmosférico', 'Extrator de núcleo'], blurb: 'Água, petróleo e, no futuro, o que o planeta tiver.', build: well },
  { id: 'lumber', cat: 'extraction', sizes: ['small', 'medium'], name: 'Madeireira', blurb: 'Corte e empilhamento de toras.', build: lumber },
];
void facet;
