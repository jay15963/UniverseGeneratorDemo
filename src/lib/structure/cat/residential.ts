// Residential: where the population lives - from tents and huts to arcologies.
import type { Mat } from '../../creature/raster';
import type { StructType } from '../registry';
import { Ctx, box, cyl, rect, polyRing, prism, ground, coneRoof, domeRoof, onWall, roofOn, tree, fence, fire, smoke, lamp, flag, antenna, dish, disc, barrel, windowRow, sideLen, frontSide, facet } from '../parts';
import { house, pavilion, rnd, chance, choose, SZ } from '../core';
import { ring, V3 } from '../draft';

/** mixes two materials' ramps (house colours in a row, painted variants) */
export function blend(m: Mat, o: Mat, t: number): Mat {
  return { ...m, ramp: m.ramp.map((c, i) => [c[0] + (o.ramp[i][0] - c[0]) * t, c[1] + (o.ramp[i][1] - c[1]) * t, c[2] + (o.ramp[i][2] - c[2]) * t] as [number, number, number]) };
}

function tent(x: Ctx, a: number, f: number, r: number, h: number) {
  const { D, K } = x, key = D.depth([a, h / 3, f]);
  coneRoof(x, a, f, 0, r, h, K.wall, key);
  for (const t of [0.4, 1.9, 3.3, 4.6]) D.cap([a, h * 0.85, f], [a + Math.sin(t) * 2.4, h + 3, f + Math.cos(t) * 2.4], 0.5, 0.4, K.wood, key + 0.01);
  // painted band and the door flap
  for (let i = 0; i < 7; i++) { const t = (i / 7) * Math.PI * 2; if (D.facing([Math.sin(t), 0.3, Math.cos(t)]) > 0.35) D.ell([a + Math.sin(t) * r * 0.62, h * 0.38, f + Math.cos(t) * r * 0.62], 1, 1, K.accent, key + 0.005, { noLine: true }); }
  if (D.facing([0, 0.2, 1]) > 0.2) D.poly([[a - r * 0.3, 0, f + r * 0.85], [a + r * 0.3, 0, f + r * 0.85], [a, h * 0.5, f + r * 0.5]], K.dark, key + 0.006);
  smoke(x, [a, h + 2, f], 1.5);
}
function igloo(x: Ctx, a: number, f: number, r: number) {
  const { D, K } = x, key = D.depth([a, r / 3, f]);
  domeRoof(x, a, f, 0, r, r * 0.8, K.wall, key);
  const R = r * 0.32, arcA: V3[] = [], arcB: V3[] = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI; arcA.push([a + Math.cos(t) * R, Math.sin(t) * R * 1.1, f + r * 0.7]); arcB.push([a + Math.cos(t) * R, Math.sin(t) * R * 1.1, f + r + 4]); }
  const k2 = D.depth([a, 0, f + r + 2]);
  D.hull([...arcA, ...arcB], K.wall, k2, { g: D.group(), flat: 0.2 });
  if (D.facing([0, 0, 1]) > 0.2) facet(x, arcB.map(p => [p[0] + (p[0] - a) * -0.3, p[1] * 0.7, p[2] + 0.1] as V3), K.dark, k2 + 0.01, D.group(), null, true);
}
/** yard props of a home in its era */
function yard(x: Ctx, w: number, d: number) {
  const { K, e, D } = x;
  const side = chance(x, 0.5) ? 1 : -1, fx = side * (w / 2 + 6);
  if (e === 0) {
    for (let i = 0; i < 4; i++) D.cap([fx - 2, 0.8 + i * 1.3 * 0.7, d / 2 - 2 + (i % 2)], [fx + 2.5, 0.8 + i * 0.9, d / 2 - 2 + (i % 2)], 0.8, 0.8, K.wood, D.depth([fx, 1, d / 2]) + i * 0.001);
    D.cap([fx - 3, 0, -d / 4], [fx - 3, 6, -d / 4], 0.5, 0.5, K.wood, D.depth([fx - 3, 3, -d / 4])); D.cap([fx + 3, 0, -d / 4], [fx + 3, 6, -d / 4], 0.5, 0.5, K.wood, D.depth([fx + 3, 3, -d / 4]));
    D.cap([fx - 3, 6, -d / 4], [fx + 3, 6, -d / 4], 0.4, 0.4, K.wood, D.depth([fx, 6, -d / 4]) + 0.01);
    facet(x, [[fx - 2.5, 6, -d / 4], [fx + 2.5, 6, -d / 4], [fx + 2.2, 2, -d / 4 + Math.sin(x.ph) * 0.4], [fx - 2.2, 2.3, -d / 4 + Math.sin(x.ph) * 0.4]], K.cloth2, D.depth([fx, 4, -d / 4]) + 0.02, D.group(), null, true);
  } else if (e <= 3) {
    fence(x, [[-w / 2 - 9, d / 2 + 5], [-3, d / 2 + 5]], 3.2, e >= 3 ? K.frame : K.wood, 3);
    fence(x, [[3, d / 2 + 5], [w / 2 + 9, d / 2 + 5]], 3.2, e >= 3 ? K.frame : K.wood, 3);
    if (chance(x, 0.7)) tree(x, fx, -d / 4, 0.9, Math.floor(x.r() * 3));
    if (chance(x, 0.6)) barrel(x, -side * (w / 2 + 3), d / 2 + 1, 0, 3.4, K.wood);
  } else if (e <= 5) {
    box(x, -w / 2 - 8, d / 2 + 4, -3, d / 2 + 6, 0, 2.6, K.leaf, K.leaf2);
    box(x, 3, d / 2 + 4, w / 2 + 8, d / 2 + 6, 0, 2.6, K.leaf, K.leaf2);
    if (chance(x, 0.8)) tree(x, fx, -d / 4, 1, Math.floor(x.r() * 3));
    D.cap([side * 6, 0, d / 2 + 6.5], [side * 6, 3, d / 2 + 6.5], 0.4, 0.4, K.metal, D.depth([side * 6, 1, d / 2 + 6.5]));
    box(x, side * 6 - 1, d / 2 + 5.8, side * 6 + 1, d / 2 + 7.2, 3, 4.4, K.accent, K.accent);
  } else {
    for (const s of [-1, 1]) { cyl(x, s * (w / 2 + 5), d / 2 + 3, 2, 0, 2.4, K.trim, K.soil); tree(x, s * (w / 2 + 5), d / 2 + 3, 0.5, 2); }
    const bob = Math.sin(x.ph) * 1.2;
    D.ell([fx, 5 + bob, -d / 4], 4, 1.8, K.trim, D.depth([fx, 5, -d / 4]), { g: D.group() });
    D.ell([fx, 5.8 + bob, -d / 4], 2.2, 1.3, K.win, D.depth([fx, 5, -d / 4]) + 0.01, { g: D.group() });
    lamp(x, [fx, 3.4 + bob, -d / 4], K.glow2, false, 1.2);
  }
}

function dwelling(x: Ctx) {
  const { C, K, e } = x, S = C.storey, med = x.size === 'medium';
  const w = rnd(x, 15, 22) * (med ? 1.25 : 1), d = rnd(x, 12, 16) * (med ? 1.15 : 1);
  const up = chance(x, 0.25 + C.tall * 0.4), up2 = chance(x, 0.4);
  const floors = e === 0 ? 1 : Math.min(3, 1 + (up ? 1 : 0) + (med && up2 ? 1 : 0));
  const tentish = chance(x, 0.5);
  if (e === 0 && K.wallKind === 'snow') { igloo(x, 0, 0, w * 0.5); if (med) igloo(x, w * 0.75, -d * 0.3, w * 0.35); }
  else if (e === 0 && K.wallKind === 'hide' && (C.plan !== 'box' || tentish)) { tent(x, 0, 0, w * 0.48, S * 1.6); if (med) tent(x, w * 0.8, -d * 0.4, w * 0.36, S * 1.3); }
  else {
    const h = house(x, { a: 0, f: 0, w, d, floors });
    if (med) {
      const w2 = w * rnd(x, 0.5, 0.7), d2 = d * rnd(x, 0.7, 0.95);
      house(x, { a: w / 2 + w2 / 2 - 0.5, f: -d * 0.12, w: w2, d: d2, floors: Math.max(1, floors - 1), plan: C.plan2 === 'pod' && e < 6 ? 'box' : C.plan2, door: false, chimney: false });
      if (e >= 1 && C.plan === 'box' && chance(x, 0.6)) pavilion(x, 0, d / 2 + 2.6, w * 0.8, 4.4, S * 0.78, 'shed', K.roof2, K.frame, 3);
    }
    void h;
  }
  yard(x, w, d);
}

function compound(x: Ctx) {
  const { C, K, e, D } = x, Z = SZ(x), S = C.storey;
  const R = 22 * Z * 0.55 + 6, hw = rnd(x, 12, 16), hd = rnd(x, 10, 13);
  ground(x, rect(-R - 4, -R - 4, R + 4, R + 4), K.paving);
  const back = x.size === 'large' ? 3 : 2;
  for (let i = 0; i < back; i++) house(x, { a: -R + hw / 2 + 2 + (i * (2 * R - hw - 4)) / Math.max(1, back - 1), f: -R + hd / 2 + 1, w: hw * rnd(x, 0.9, 1.15), d: hd, floors: e === 0 ? 1 : 1 + (chance(x, 0.4) ? 1 : 0) });
  for (const s of [-1, 1]) house(x, { a: s * (R - hd / 2 - 1), f: 0, w: hd, d: hw * 1.2, floors: e >= 2 && chance(x, 0.5) ? 2 : 1, door: false, plan: C.plan === 'pod' && e < 6 ? 'round' : undefined });
  // the enclosure with a gate
  const wallM = e === 0 ? K.wood : e <= 3 ? K.stone : e <= 5 ? K.wall2 : K.trim, wh = e === 0 ? 5 : 4.5;
  if (e === 0) { fence(x, [[-R - 3, R + 3], [-4, R + 3]], wh, wallM, 1.6, true); fence(x, [[4, R + 3], [R + 3, R + 3]], wh, wallM, 1.6, true); fence(x, [[-R - 3, -R - 3], [-R - 3, R + 3]], wh, wallM, 1.6, true); fence(x, [[R + 3, -R - 3], [R + 3, R + 3]], wh, wallM, 1.6, true); fence(x, [[-R - 3, -R - 3], [R + 3, -R - 3]], wh, wallM, 1.6, true); }
  else {
    box(x, -R - 4, -R - 4, R + 4, -R - 2.5, 0, wh, wallM, K.trim);
    box(x, -R - 4, -R - 2.5, -R - 2.5, R + 4, 0, wh, wallM, K.trim); box(x, R + 2.5, -R - 2.5, R + 4, R + 4, 0, wh, wallM, K.trim);
    box(x, -R - 4, R + 2.5, -4, R + 4, 0, wh, wallM, K.trim); box(x, 4, R + 2.5, R + 4, R + 4, 0, wh, wallM, K.trim);
    for (const s of [-1, 1]) { box(x, s * 4 - 1.2, R + 2, s * 4 + 1.2, R + 4.5, 0, wh + 2.5, K.trim, K.trim); if (C.finial) D.ell([s * 4, wh + 3.6, R + 3.2], 1.2, 1.2, K.trim, D.depth([s * 4, wh + 3, R + 3.2]) + 0.01); }
  }
  // heart of the courtyard
  const k = x.r();
  if (e === 0) fire(x, [0, 0, 2], 1.6);
  else if (k < 0.4) { cyl(x, 0, 2, 3.2, 0, 2.6, K.stone, K.water); pavilion(x, 0, 2, 7, 7, S * 0.7, 'pyramid', K.roof, K.wood, 1); }
  else if (k < 0.7) { disc(x, 0, 2, 0.05, 6, K.leaf, -5e3); tree(x, 0, 2, 1.4, 0); }
  else { cyl(x, 0, 2, 5, 0, 1.2, K.base, K.water); D.ell([0, 3 + Math.abs(Math.sin(x.ph)) * 1.4, 2], 0.9, 1.4 + Math.abs(Math.sin(x.ph)) * 0.6, K.water, D.depth([0, 2, 2]) + 0.1); }
  if (e >= 1) flag(x, [R - 2, 0, R - 2], S * 1.2, 7, K.accent);
}

function terrace(x: Ctx) {
  const { C, K, e } = x, n = x.size === 'large' ? 6 : 4;
  const alongF = C.r[55] < 0.55, tints = [K.wall, blend(K.wall, K.accent, 0.35), blend(K.wall, K.cloth2, 0.4), blend(K.wall, K.accent2, 0.3)];
  const ws = Array.from({ length: n }, () => rnd(x, 9, 13)), total = ws.reduce((s, w) => s + w, 0);
  let a = -total / 2;
  const d = rnd(x, 14, 18);
  for (let i = 0; i < n; i++) {
    const w = ws[i], fl = e === 0 ? 1 : Math.max(1, Math.min(e >= 3 ? 5 : 4, 2 + Math.floor(x.r() * (e >= 2 ? 3 : 2))));
    const gable = e >= 1 && e <= 3 && alongF;
    house(x, { a: a + w / 2, f: 0, w, d, floors: fl, plan: e === 0 && C.plan !== 'box' ? C.plan : 'box', wall: tints[(i + Math.floor(C.r[56] * 4)) % 4], roof: gable ? 'gable' : undefined, chimney: i % 2 === 0, bias: i * 0.002 });
    if (gable) void 0;
    a += w;
  }
  ground(x, rect(-total / 2 - 2, d / 2, total / 2 + 2, d / 2 + 7), K.paving);
  if (e >= 3) for (let i = 0; i <= n; i += 2) lamp(x, [-total / 2 + (total * i) / n, 7, d / 2 + 5], K.glow, false, 1), x.D.cap([-total / 2 + (total * i) / n, 0, d / 2 + 5], [-total / 2 + (total * i) / n, 6.5, d / 2 + 5], 0.4, 0.4, K.iron, x.D.depth([-total / 2 + (total * i) / n, 3, d / 2 + 5]));
}

function pueblo(x: Ctx, W: number, D0: number) {
  const { K, C, D } = x, S = C.storey;
  let y = 0, w = W, d = D0, f = 0;
  for (let lv = 0; lv < 3; lv++) {
    const cells = Math.max(2, Math.round(w / 12));
    for (let i = 0; i < cells; i++) {
      const cw = w / cells, a = -w / 2 + cw * (i + 0.5), v = box(x, a - cw / 2, f - d / 2, a + cw / 2, f + d / 2, y, y + S, K.wall, K.roof, lv * 0.01);
      onWall(x, v, frontSide(v), cw / 2, y + S * 0.35, S * 0.36, S * 0.6, lv === 0 ? 'rect' : 'tri', K.dark, 0.01);
      for (let j = 0; j < 3; j++) D.cap([a - cw / 2 + 2 + j * (cw - 4) / 2, y + S - 1, f + d / 2 - 0.5], [a - cw / 2 + 2 + j * (cw - 4) / 2, y + S - 1.2, f + d / 2 + 1.8], 0.5, 0.5, K.wood, v.key + 0.02);
    }
    if (lv < 2) { // ladder up to the next terrace
      const la = -w / 2 + 6 + (lv * 13) % Math.max(1, w - 12), lf = f + d / 2 - d * 0.35;
      D.cap([la - 1.5, y + S, lf + 2], [la - 1.5, y + S * 2 + 3, lf - 0.5], 0.4, 0.4, K.wood, D.depth([la, y + S * 1.5, lf]) + 0.5);
      D.cap([la + 1.5, y + S, lf + 2], [la + 1.5, y + S * 2 + 3, lf - 0.5], 0.4, 0.4, K.wood, D.depth([la, y + S * 1.5, lf]) + 0.5);
    }
    y += S; w *= 0.72; f -= d * 0.22; d *= 0.62;
  }
  smoke(x, [4, y + 1, f], 1.8);
}

function block(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant';
  const W = rnd(x, 40, 52) * (giant ? 1.4 : 1), Dd = rnd(x, 20, 26);
  if (e === 0) { pueblo(x, W, Dd * 1.3); return; }
  const floors = [0, 3, 4, 5, 7, 10, 12, 11][e] + Math.floor(x.r() * 3) + (giant ? 3 : 0);
  if (e === 6) { // stepped garden block
    let y = 0, w = W, d = Dd * 1.3;
    for (let i = 0; i < 4 + (giant ? 1 : 0); i++) {
      const h = house(x, { a: 0, f: -i * 3, w, d, floors: 2, y0: y, roof: 'flat', door: i === 0, clutter: false, plinth: false, stilts: false });
      for (let j = 0; j < 4; j++) tree(x, -w / 2 + 4 + j * (w - 8) / 3, h.top === 0 ? 0 : -i * 3 + d / 2 - 1.5, 0.55, j);
      y = h.top + 1.2; w *= 0.8; d *= 0.8;
    }
    return;
  }
  const wings = C.r[57] < 0.5 && e <= 3;
  const main = house(x, { a: 0, f: -4, w: W, d: Dd, floors, bias: -0.01 });
  if (wings) for (const s of [-1, 1]) house(x, { a: s * (W / 2 - 6), f: Dd / 2 + 3, w: 12, d: 14, floors: floors - 1, door: s < 0, chimney: false });
  // balconies with rails
  if (e >= 4 && main.v.kind === 'prism') {
    const fs = frontSide(main.v), L = sideLen(main.v, fs), n = Math.max(2, Math.floor(L / 10));
    for (let f = 1; f < floors; f++) for (let i = 0; i < n; i++) {
      if ((i + f) % 2 && e === 4) continue;
      const a = -W / 2 + (W * (i + 0.5)) / n, y = main.y0 + f * S, fz = -4 + Dd / 2;
      box(x, a - 3.5, fz, a + 3.5, fz + 3, y - 0.6, y, K.trim, K.trim, 0.03);
      box(x, a - 3.5, fz + 2.6, a + 3.5, fz + 3, y, y + 2.6, e >= 5 ? blend(K.win, K.trim, 0.3) : K.frame, K.frame, 0.031);
    }
  }
  if (giant) { house(x, { a: -W * 0.55, f: -Dd * 1.2, w: W * 0.5, d: Dd * 0.9, floors: floors + 3, door: false, bias: -0.05 }); }
  ground(x, rect(-W / 2 - 6, -4 + Dd / 2, W / 2 + 6, -4 + Dd / 2 + 8 + (wings ? 12 : 0)), K.paving);
  for (let i = 0; i < 3; i++) tree(x, -W / 2 + 4 + i * (W - 8) / 2, -4 + Dd / 2 + 6 + (wings ? 12 : 0), 0.9, i);
  void D;
}

function treeHome(x: Ctx, H: number) {
  const { K, C, D } = x, S = C.storey;
  const key = D.depth([0, H / 2, 0]);
  D.cap([0, 0, 0], [0, H, 0], 7, 4.5, K.trunk, key, { g: D.group() });
  for (const t of [0.5, 2.2, 4]) D.cap([0, 1, 0], [Math.sin(t) * 10, 0, Math.cos(t) * 10], 3, 1.2, K.trunk, D.depth([Math.sin(t) * 5, 0, Math.cos(t) * 5]), { g: D.group() });
  for (let i = 0; i < 3; i++) {
    const y = H * (0.3 + i * 0.25), s = i % 2 ? -1 : 1;
    disc(x, s * 6, 3, y, 9, K.wood, D.depth([s * 6, y, 3]) + 0.3);
    house(x, { a: s * 9, f: 3, w: 11, d: 9, floors: 1, y0: y, plinth: false, stilts: false, chimney: false, bias: 0.4 });
    for (let j = 0; j < 4; j++) D.cap([s * 4, y - 2 + j * 0.5, 7 - j], [s * 4, y + 4, 4], 0.3, 0.3, K.rope, D.depth([s * 4, y, 6]) + 0.5);
  }
  for (let i = 0; i < 5; i++) { const t = i * 1.3; D.ell([Math.sin(t) * 12, H + 4 + (i % 2) * 5, Math.cos(t) * 4], 11, 8, i % 2 ? K.leaf2 : K.leaf, key + 0.5 + i * 0.01, { g: D.group() }); }
  void S;
}

function tower(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant';
  if (e === 0) { treeHome(x, giant ? 70 : 50); return; }
  const w = rnd(x, 20, 26) * (giant ? 1.3 : 1);
  if (e <= 3) {
    const floors = [0, 4, 5, 7][e] + (giant ? 2 : 0);
    house(x, { a: 0, f: 0, w: w * 0.8, d: w * 0.8, floors, plan: C.plan === 'box' || C.plan === 'pod' ? 'box' : C.plan });
    house(x, { a: w * 0.62, f: 2, w: w * 0.55, d: w * 0.6, floors: Math.max(2, floors - 2), door: false });
    if (giant) house(x, { a: -w * 0.6, f: 3, w: w * 0.5, d: w * 0.6, floors: floors - 3, door: false, chimney: false });
    return;
  }
  if (e <= 5) {
    const pod = house(x, { a: 0, f: 0, w: w * 1.6, d: w * 1.3, floors: 2, roof: 'flat', clutter: false });
    let y = pod.top + 1.2, ww = w;
    const floors = (e === 4 ? 9 : 10) + (giant ? 3 : 0), steps = e === 4 ? 3 : 1;
    for (let s = 0; s < steps; s++) {
      const fl = Math.round(floors / steps * (s === 0 ? 1.4 : 0.8));
      const h = house(x, { a: 0, f: -1, w: ww, d: ww * 0.85, floors: fl, y0: y, door: false, roof: 'flat', clutter: s === steps - 1, plinth: false, stilts: false, win: e === 5 ? 'band' : undefined });
      y = h.top + 1.2; ww *= 0.78;
    }
    if (e === 4 && C.r[58] < 0.7) { coneRoof(x, 0, -1, y, ww * 0.4, S * 2.5, K.metal, D.depth([0, y, -1]) + 0.1); }
    else antenna(x, [0, y, -1], 18);
    return;
  }
  if (e === 6) { // twisting stack with sky gardens
    let y = 0;
    const n = giant ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const rg = polyRing(0, 0, w * 0.62, w * 0.62, 4, Math.PI / 4 + i * 0.09);
      const v = prism(x, rg, y, y + S, i % 3 === 2 ? K.leaf : K.wall, K.trim, { bias: i * 0.001 });
      for (let s = 0; s < 4; s++) windowRow(x, v, s, y + S * 0.55, 4, S * 0.5, 'band', 8);
      if (i % 3 === 2) for (let s = 0; s < 3; s++) tree(x, -w * 0.3 + s * w * 0.3, 0, 0.45, s), void 0;
      y += S;
    }
    roofOn(x, { kind: 'prism', ring: polyRing(0, 0, w * 0.62, w * 0.62, 4, Math.PI / 4 + n * 0.09), top: polyRing(0, 0, w * 0.62, w * 0.62, 4, Math.PI / 4 + n * 0.09), y0: y - S, y1: y, key: D.depth([0, y, 0]) }, 'dome', blend(K.win, K.trim, 0.2), K.trim);
    return;
  }
  // space age spire: a tapering needle with rings and pods
  const H = giant ? 190 : 140, r0 = w * 0.55;
  cyl(x, 0, 0, r0 * 1.6, 0, 6, K.base, K.paving);
  const v = cyl(x, 0, 0, r0, 6, H, K.wall, null, { rt: r0 * 0.35 });
  for (let i = 1; i < 6; i++) {
    const y = 6 + (H - 6) * (i / 6), r = r0 + (r0 * 0.35 - r0) * (i / 6);
    cyl(x, 0, 0, r * 1.9, y - 1.5, y + 1.5, K.trim, K.win, { bias: 0.05 });
    for (let j = 0; j < 8; j++) { const t = (j / 8) * Math.PI * 2 + x.ph * 0.25; if (D.facing([Math.sin(t), 0, Math.cos(t)]) > 0) lamp(x, [Math.sin(t) * r * 1.9, y + 0.2, Math.cos(t) * r * 1.9], K.glow2, false, 0.6); }
  }
  for (let f = 0; f < 12; f++) windowAtRing(x, v, 6 + f * (H - 20) / 12);
  coneRoof(x, 0, 0, H, r0 * 0.35, 20, K.metal, D.depth([0, H, 0]) + 0.1);
  lamp(x, [0, H + 20, 0], K.fire, true, 1.2);
}
function windowAtRing(x: Ctx, v: ReturnType<typeof cyl>, y: number) {
  for (let i = 0; i < 6; i++) onWall(x, v, (i / 6) * Math.PI * 2 + 0.3, 0, y, 3, 4, x.C.win === 'band' ? 'rect' : x.C.win, x.K.lit(x.wid++) ? x.K.winLit : x.K.win);
}

function arcology(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey;
  if (e === 0) { // the great mound: a hive of rooms under one earthen dome
    const R = 48;
    domeRoof(x, 0, 0, 0, R, R * 0.85, K.wall, D.depth([0, R / 3, 0]));
    const v = { kind: 'round' as const, a: 0, f: 0, r: R * 0.9, rt: R * 0.6, y0: 0, y1: R * 0.6, key: D.depth([0, R / 3, 0]) };
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 9; i++) onWall(x, v, (i / 9) * Math.PI * 2 + lv * 0.35, 0, 4 + lv * 9, 3.4, 4.6, lv === 0 ? 'arch' : 'round', K.dark);
    for (let i = 0; i < 3; i++) smoke(x, [-14 + i * 14, R * 0.8 - Math.abs(i - 1) * 6, -6], 2);
    for (let i = 0; i < 5; i++) { const t = -0.9 + i * 0.45; house(x, { a: Math.sin(t) * (R + 12), f: Math.cos(t) * (R + 12), w: 11, d: 9, floors: 1, chimney: false }); }
    return;
  }
  if (e <= 3) { // a stepped citadel of homes
    let y = 0, w = 110, d = 80;
    for (let lv = 0; lv < 4; lv++) {
      box(x, -w / 2, -d / 2, w / 2, d / 2, y, y + 6, K.base, K.paving, lv * 0.02);
      y += 6;
      const n = Math.max(2, Math.round(w / 22));
      for (let i = 0; i < n; i++) house(x, { a: -w / 2 + (w * (i + 0.5)) / n, f: d / 2 - 8, w: w / n - 3, d: 11, floors: e >= 2 ? 2 : 1, y0: y, plinth: false, stilts: false, bias: lv * 0.02 + 0.01 });
      w *= 0.74; d *= 0.7;
    }
    house(x, { a: 0, f: -4, w: w * 0.9, d: d * 0.9, floors: 3, y0: y, plinth: false, stilts: false, roof: C.roof === 'flat' ? 'dome' : C.roof, bias: 0.2 });
    flag(x, [w * 0.4, y + S * 3, -4], S * 1.4, 8, K.accent);
    return;
  }
  if (e <= 5) { // three slabs joined by sky bridges
    const fl = e === 4 ? 10 : 14;
    for (const [a, f, n] of [[-34, -8, fl], [0, -18, fl + 4], [34, -8, fl]] as [number, number, number][]) house(x, { a, f, w: 26, d: 20, floors: n, roof: 'flat', bias: -Math.abs(a) * 0.001 });
    for (const s of [-1, 1]) for (const y of [S * 5, S * 9]) box(x, s * 13, -14, s * 21, -8, y, y + S * 0.8, K.trim, K.trim, 0.3);
    ground(x, rect(-50, 2, 50, 16), K.paving);
    for (let i = 0; i < 5; i++) tree(x, -40 + i * 20, 10, 1, i);
    return;
  }
  // a whole district under a dome: glass (futurist) or a shimmering field (space age)
  const R = 62;
  cyl(x, 0, 0, R + 3, 0, 4, K.base, K.paving);
  for (let i = 0; i < 7; i++) { const t = (i / 7) * Math.PI * 2; house(x, { a: Math.sin(t) * R * 0.55, f: Math.cos(t) * R * 0.5, w: 13, d: 12, floors: 2 + (i % 3), y0: 4, plan: C.plan === 'box' ? 'round' : C.plan, plinth: false, stilts: false, chimney: false }); }
  house(x, { a: 0, f: 0, w: 20, d: 20, floors: 7, y0: 4, plan: 'round', roof: 'spire', plinth: false, stilts: false });
  for (let i = 0; i < 6; i++) tree(x, Math.sin(i * 1.1) * R * 0.8, Math.cos(i * 1.1) * R * 0.3 + 10, 0.8, i);
  const glass: Mat = e === 6 ? { ...K.win, alpha: 0.4, tex: 'glazing', line: null } : K.field;
  domeRoof(x, 0, 0, 4, R, R * 0.8, glass, 1e5 - 10);
  if (e === 7) for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + 0.4; cyl(x, Math.sin(t) * (R + 4), Math.cos(t) * (R + 4), 2, 0, 16, K.metal, K.trim); lamp(x, [Math.sin(t) * (R + 4), 17.5, Math.cos(t) * (R + 4)], K.glow2, false, 1.6); }
  void barrel; void dish; void ring; void rect;
}

export const RESIDENTIAL: StructType[] = [
  { id: 'dwelling', cat: 'residential', sizes: ['small', 'medium'], name: 'Moradia', eraNames: ['Tenda / cabana', 'Casa', 'Casa', 'Casa', 'Casa', 'Casa', 'Casa-módulo', 'Hab-módulo'], blurb: 'Lar de uma família, com o quintal da época.', build: dwelling },
  { id: 'compound', cat: 'residential', sizes: ['medium', 'large'], name: 'Pátio familiar', blurb: 'Várias casas de um clã em volta de um pátio murado.', build: compound },
  { id: 'terrace', cat: 'residential', sizes: ['medium', 'large'], name: 'Casario', eraNames: ['Fileira de cabanas', 'Casario', 'Casario', 'Casas geminadas', 'Sobrados', 'Casas geminadas', 'Casario modular', 'Casario modular'], blurb: 'Casas estreitas lado a lado, cada uma com sua cor.', build: terrace },
  { id: 'block', cat: 'residential', sizes: ['large', 'giant'], name: 'Bloco habitacional', eraNames: ['Pueblo em terraços', 'Cortiço', 'Palazzo', 'Cortiço de tijolos', 'Prédio de apartamentos', 'Condomínio', 'Bloco-jardim', 'Bloco modular'], blurb: 'Muitas famílias sob o mesmo teto.', build: block },
  { id: 'tower', cat: 'residential', sizes: ['large', 'giant'], name: 'Torre habitacional', eraNames: ['Árvore-lar', 'Casa-torre', 'Casa-torre', 'Torre de cortiços', 'Arranha-céu', 'Torre de vidro', 'Torre retorcida', 'Agulha orbital'], blurb: 'Moradia vertical: da árvore habitada à agulha espacial.', build: tower },
  { id: 'arcology', cat: 'residential', sizes: ['giant'], name: 'Arcologia', eraNames: ['Grande colmeia', 'Cidadela em degraus', 'Cidadela em degraus', 'Cidadela em degraus', 'Megaestrutura', 'Megaestrutura', 'Distrito sob cúpula', 'Distrito sob campo de força'], blurb: 'Um bairro inteiro numa só estrutura.', build: arcology },
];
