// Military: training grounds and defences - towers, walls, barracks, batteries, fortresses.
import type { Mat } from '../../creature/raster';
import type { StructType } from '../registry';
import { Ctx, box, cyl, rect, polyRing, prism, ground, coneRoof, domeRoof, onWall, roofOn, fence, fire, lamp, crate, barrel, sack, facet, disc, flag, merlons, antenna, dish, frontSide, sideLen, windowRow } from '../parts';
import { house, rnd } from '../core';
import { ring, V3 } from '../draft';

/** a defensive tower of the era; returns its top height */
function defTower(x: Ctx, a: number, f: number, r: number, h: number, beacon = true): number {
  const { C, K, e, D } = x;
  if (e === 0) { // lookout platform on poles with a fire basket
    for (const [pa, pf] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D.cap([a + pa * r, 0, f + pf * r], [a + pa * r * 0.7, h, f + pf * r * 0.7], 0.8, 0.6, K.wood, D.depth([a + pa * r, h / 2, f + pf * r]));
    for (let i = 1; i < 3; i++) for (const pf of [-1, 1]) D.cap([a - r * (1 - 0.1 * i), (h * i) / 3, f + pf * r * (1 - 0.1 * i)], [a + r * (1 - 0.1 * i), (h * i) / 3 + 2, f + pf * r * (1 - 0.1 * i)], 0.4, 0.4, K.wood, D.depth([a, h / 2, f + pf * r]) + pf * 0.01);
    box(x, a - r, f - r, a + r, f + r, h, h + 1, K.wood, K.wood);
    fence(x, [[a - r, f + r], [a + r, f + r]], 3, K.wood, 2.4, true);
    roofOn(x, box(x, a - r * 0.1, f - r * 0.1, a + r * 0.1, f + r * 0.1, h + 1, h + 6, K.wood, null), 'pyramid', K.roof, K.roof, { over: r * 0.9, pitch: 0.6 });
    if (beacon) fire(x, [a, h + 1, f + r * 0.5], 1.2);
    return h + 8;
  }
  if (e <= 2) { // stone tower, crenellated or roofed
    const round = C.plan !== 'box';
    const v = round ? cyl(x, a, f, r, 0, h, K.stone, K.paving, { rt: r * (1 - C.taper * 0.4) }) : box(x, a - r, f - r, a + r, f + r, 0, h, K.stone, K.paving);
    for (let i = 0; i < 3; i++) onWall(x, v, round ? 0.3 + i * 2 : i % 4, round ? 0 : r, h * (0.35 + i * 0.2), 1.6, 4, 'slit', K.dark);
    if (C.roofRound === 'cone' || C.roofRound === 'onion' || C.roofRound === 'spire') {
      if (round) coneRoof(x, a, f, h, r + 1.2, r * 1.8, K.roof, v.key + 0.02); else roofOn(x, v, 'pyramid', K.roof, K.stone, { over: 1.2, pitch: 1.6 });
      if (beacon) flag(x, [a, h + r * 1.8, f], 5, 5, K.accent);
    } else {
      if (round) { cyl(x, a, f, r * (1 - C.taper * 0.4) + 1, h, h + 1.5, K.stone, K.paving, { bias: 0.01 }); for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2, rr = r * (1 - C.taper * 0.4) + 0.4; box(x, a + Math.sin(t) * rr - 1, f + Math.cos(t) * rr - 1, a + Math.sin(t) * rr + 1, f + Math.cos(t) * rr + 1, h + 1.5, h + 3.8, K.stone, K.stone); } }
      else { box(x, a - r - 1, f - r - 1, a + r + 1, f + r + 1, h, h + 1.5, K.stone, K.paving, 0.01); for (const [a0, f0, a1, f1] of [[-1, 1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1]]) merlons(x, a + a0 * (r + 0.5), f + f0 * (r + 0.5), a + a1 * (r + 0.5), f + f1 * (r + 0.5), h + 1.5, 2.2, 1.2, K.stone, 3.4); }
      if (beacon) flag(x, [a, h + 1.5, f], 8, 6, K.accent);
    }
    return h + 4;
  }
  if (e <= 4) { // brick / concrete lookout with a searchlight
    const v = C.plan === 'box' ? box(x, a - r, f - r, a + r, f + r, 0, h, e === 3 ? K.wall : K.base, K.base) : cyl(x, a, f, r, 0, h, e === 3 ? K.wall : K.base, K.base);
    const cab = box(x, a - r - 1, f - r - 1, a + r + 1, f + r + 1, h, h + 5, K.base, null, 0.01);
    for (let s = 0; s < 4; s++) onWall(x, cab, s, (sideLen(cab, s)) / 2, h + 2.8, sideLen(cab, s) - 2, 1.8, 'rect', K.dark);
    roofOn(x, cab, 'flat', K.base, K.base);
    const t = x.ph, beam: V3 = [a + Math.cos(t) * 30, 0, f + Math.sin(t) * 18];
    if (x.night) x.D.poly([[a, h + 6.5, f], [beam[0] - 3, 0, beam[2]], [beam[0] + 3, 0, beam[2]]], { ...K.glow, alpha: 0.35, line: null }, 1e5);
    lamp(x, [a, h + 6.5, f], K.glow, false, 1.1);
    void v;
    return h + 7;
  }
  if (e === 5) { // radar mast
    const v = cyl(x, a, f, r * 0.6, 0, h, K.trim, K.trim, { rt: r * 0.4 });
    domeRoof(x, a, f, h, r * 1.2, r * 1.2, K.cloth2, v.key + 0.02);
    dish(x, [a + r * 1.5, h * 0.6, f], 3);
    antenna(x, [a, h + r * 1.2, f], 8);
    return h + r * 1.2;
  }
  // futurist/space: an energy pylon that crackles
  const v = cyl(x, a, f, r * 0.7, 0, h, K.wall, null, { rt: r * 0.35 });
  for (let i = 1; i < 4; i++) cyl(x, a, f, r * (0.7 - i * 0.09) + 0.6, (h * i) / 4 - 0.5, (h * i) / 4 + 0.5, K.glow2, null, { bias: 0.02 });
  D.ell([a, h + 2.5, f], 2.6 + Math.sin(x.ph * 2) * 0.5, 2.6 + Math.sin(x.ph * 2) * 0.5, K.glow2, v.key + 0.1);
  return h + 5;
}

/** a straight defensive wall of the era from (a0,f) to (a1,f); `gate` opens a gap in the middle */
function defWall(x: Ctx, a0: number, a1: number, f: number, h: number, gate: boolean, th = 4) {
  const { K, e, D, C } = x;
  const pieces: [number, number][] = gate ? [[a0, -5], [5, a1]] : [[a0, a1]];
  if (gate && a0 > -5) pieces.splice(0, pieces.length, [a0, a1]);
  for (const [p0, p1] of pieces) {
    if (p1 - p0 < 1) continue;
    if (e === 0) { fence(x, [[p0, f], [p1, f]], h, K.wood, 1.7, true); continue; }
    if (e >= 6) { // force-field fence between emitters
      for (const p of [p0, p1]) { cyl(x, p, f, 1.4, 0, h + 3, K.wall, K.trim); lamp(x, [p, h + 3.6, f], K.glow2, true, 0.8); }
      const band = Math.sin(x.ph * 2) * 0.4;
      facet(x, [[p0, 0.5, f], [p1, 0.5, f], [p1, h + 1 + band, f], [p0, h + 1 - band, f]], K.field, 1e5 - 2, D.group(), null, true);
      continue;
    }
    const m: Mat = e <= 2 ? K.stone : e === 3 ? K.wall : K.base;
    const v = box(x, p0, f - th / 2, p1, f + th / 2, 0, h, m, K.paving);
    if (e <= 3) merlons(x, p0, f + th / 2 - 0.6, p1, f + th / 2 - 0.6, h, 2.4, 1.2, m, e === 3 ? 4.5 : 3.6);
    else if (e === 4) { for (let i = 0; i < Math.floor((p1 - p0) / 3); i++) D.ell([p0 + 1.5 + i * 3, h + 0.8, f + th / 2 - 0.5], 1.6, 1, K.cloth2, v.key + 0.02, { g: D.group() }); }
    else { for (let i = 0; i < Math.floor((p1 - p0) / 4); i++) { const pa = p0 + 2 + i * 4; D.cap([pa, h, f], [pa, h + 2.4, f], 0.25, 0.25, K.metal, v.key + 0.02); } D.cap([p0, h + 2, f], [p1, h + 2, f], 0.15, 0.15, K.metal, v.key + 0.021); }
    if (C.buttress && e <= 3) for (let i = 0; i <= Math.floor((p1 - p0) / 12); i++) box(x, p0 + i * 12 - 1, f + th / 2, p0 + i * 12 + 1, f + th / 2 + 2, 0, h * 0.8, m, m, 0.005);
  }
  if (gate) { // gatehouse
    if (e === 0) { for (const s of [-1, 1]) defTower(x, s * 7, f, 2.5, h + 4, s > 0); return; }
    if (e >= 6) { facet(x, [[-5, 0.5, f], [5, 0.5, f], [5, h + 1, f], [-5, h + 1, f]], { ...K.field, ramp: K.glow.ramp }, 1e5 - 1, D.group(), null, true); return; }
    const g = box(x, -8, f - th / 2 - 1, 8, f + th / 2 + 1, 0, h + 5, e <= 2 ? K.stone : e === 3 ? K.wall : K.base, K.paving, 0.01);
    onWall(x, g, frontSide(g), 8, (h + 2) / 2, 8, h + 1, e <= 3 ? 'arch' : 'rect', e <= 3 ? K.door : K.metal);
    if (e <= 3) { merlons(x, -8, f + th / 2 + 0.4, 8, f + th / 2 + 0.4, h + 5, 2.4, 1.2, K.stone, 3.6); flag(x, [0, h + 5, f], 8, 6, K.accent); }
    else lamp(x, [0, h + 5.5, f + th / 2 + 1], K.fire, true, 0.9);
  }
}

function watchtower(x: Ctx) {
  const { C, K } = x, S = C.storey, med = x.size === 'medium';
  const r = med ? 6 : 4.5, h = S * (med ? 3.2 : 2.4) * (0.8 + C.tall * 0.4);
  defTower(x, 0, 0, r, h);
  for (let i = 0; i < 2; i++) (i ? barrel : crate)(x, r + 3, 2 + i * 3, 0, 3, K.wood);
  if (med) defWall(x, -26, -r - 1, 0, S * 0.9, false, 3);
}
function wall(x: Ctx) {
  const { C } = x, S = C.storey;
  const L = { small: 20, medium: 44, large: 70, giant: 100 }[x.size], h = S * (x.size === 'small' ? 0.9 : 1.1) + (x.e === 0 ? 0 : 2);
  defWall(x, -L / 2, L / 2, 0, h, x.size !== 'small');
  if (x.size === 'large' || x.size === 'giant') for (const s of [-1, 1]) defTower(x, s * (L / 2 + 3), 0, 5.5, h * 1.5, s > 0);
  if (x.size === 'giant') for (const s of [-1, 1]) defTower(x, s * L * 0.25, 0, 4.5, h * 1.3, false);
}

function dummy(x: Ctx, a: number, f: number) {
  const { K, D } = x, hit = Math.max(0, Math.sin(x.ph * 2 + a)) * 0.3;
  D.cap([a, 0, f], [a + hit, 7, f], 0.5, 0.5, K.wood, D.depth([a, 3, f]));
  D.cap([a - 2.5 + hit, 5.5, f], [a + 2.5 + hit, 5.5, f], 0.5, 0.5, K.wood, D.depth([a, 5, f]) + 0.001);
  D.ell([a + hit, 4.5, f], 1.8, 2.4, K.cloth2, D.depth([a, 4, f]) + 0.002, { g: D.group() });
  D.ell([a + hit * 1.2, 8, f], 1.3, 1.3, K.cloth2, D.depth([a, 8, f]) + 0.003, { g: D.group() });
}
function target(x: Ctx, a: number, f: number) {
  const { K, D } = x, k = D.depth([a, 3, f]) + 0.1;
  D.cap([a - 1.5, 0, f - 1], [a, 4, f], 0.4, 0.4, K.wood, k - 0.01); D.cap([a + 1.5, 0, f - 1], [a, 4, f], 0.4, 0.4, K.wood, k - 0.01);
  for (let i = 0; i < 3; i++) { const r = 3 - i; D.ell([a, 4.5, f + 0.1 * i], r * 0.9, r, [K.cloth2, K.accent, K.cloth2][i], k + i * 0.001, { g: D.group(), dark: D.light([0, 0, 1]) }); }
}
function training(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, Z = x.size === 'small' ? 1 : x.size === 'medium' ? 1.5 : 2.1;
  const W = 34 * Z, Dd = 24 * Z;
  ground(x, rect(-W / 2, -Dd / 2, W / 2, Dd / 2), e >= 4 ? K.paving : K.soil, 0, 0.5);
  if (e === 0) { // sparring ring of stones and a spear rack
    for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; D.ell([Math.sin(t) * 11 * Z, 0.8, Math.cos(t) * 7 * Z], 1.4, 1.1, K.stone, D.depth([Math.sin(t) * 11 * Z, 0, Math.cos(t) * 7 * Z]), { g: D.group() }); }
    fire(x, [W / 2 - 4, 0, -Dd / 2 + 4], 1.3);
    for (let i = 0; i < 3; i++) dummy(x, -W / 2 + 5 + i * 6, -Dd / 2 + 4);
    return;
  }
  for (let i = 0; i < Math.round(3 * Z); i++) dummy(x, -W / 2 + 5 + i * 6, -Dd / 2 + 4);
  for (let i = 0; i < Math.round(2 * Z); i++) target(x, W / 2 - 5 - i * 7, -Dd / 2 + 3);
  // obstacle course: log hurdles, a wall and a climbing frame
  for (let i = 0; i < 3; i++) D.cap([-W / 4 - 4 + i * 6, 1.5, 2], [-W / 4 - 4 + i * 6, 1.5, 8], 0.9, 0.9, K.wood, D.depth([-W / 4 + i * 6, 1, 5]));
  box(x, W / 8 - 4, 2, W / 8 + 4, 3.5, 0, 5, e <= 2 ? K.wood : K.base, e <= 2 ? K.wood : K.base);
  const fx = W / 3;
  for (const s of [-1, 1]) D.cap([fx + s * 4, 0, 5], [fx + s * 4, 10, 5], 0.5, 0.5, K.wood, D.depth([fx, 5, 5]));
  for (let i = 1; i < 5; i++) D.cap([fx - 4, i * 2.2, 5], [fx + 4, i * 2.2, 5], 0.3, 0.3, K.rope, D.depth([fx, 5, 5]) + 0.01);
  if (x.size !== 'small') { // running track and a stand
    x.D.hull(ring(0, Dd / 2 + 10, 0.02, W * 0.35, 24, 6), K.accent2, -9e4 + 1);
    x.D.hull(ring(0, Dd / 2 + 10, 0.03, W * 0.3, 24, 4), K.ground, -9e4 + 2);
    house(x, { a: -W / 2 - 10, f: 0, w: 14, d: 12, floors: 1, chimney: false });
  }
  flag(x, [W / 2 - 2, 0, Dd / 2 - 2], S * 1.5, 7, K.accent);
}

function barracks(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, large = x.size === 'large';
  const W = large ? 56 : 40, Dd = 14;
  ground(x, rect(-W / 2 - 4, -8, W / 2 + 4, 34), e >= 4 ? K.paving : K.soil, 0, 0.5);
  const rows = large ? 2 : 1;
  for (let i = 0; i < rows; i++) house(x, { a: 0, f: -i * 22 - 2, w: W, d: Dd, floors: e <= 1 ? 1 : 2, chimney: e >= 1 && e <= 3, roof: e >= 4 ? 'flat' : undefined, bias: -i });
  // parade ground with the flag and ranks of dummies / targets
  flag(x, [0, 0, 20], S * 2, 9, K.accent);
  disc(x, 0, 20, 0.05, 3, K.base, -9e4 + 3);
  for (let i = 0; i < 4; i++) dummy(x, -W / 2 + 6 + i * 6, 26);
  for (let i = 0; i < 2; i++) target(x, W / 2 - 6 - i * 8, 26);
  if (e === 0) for (let i = 0; i < 2; i++) fire(x, [-W / 4 + i * W / 2, 0, 12], 1.2);
  if (e >= 4) { for (let i = 0; i < 3; i++) box(x, W / 2 + 6, -4 + i * 5, W / 2 + 14, -4 + i * 5 + 4, 0, 3, K.accent2, K.accent2); }
  else for (let i = 0; i < 4; i++) (i % 2 ? barrel : crate)(x, W / 2 + 5 + (i % 2) * 3, -2 + i * 3, 0, 3, K.wood);
  if (e >= 5) dish(x, [-W / 2 - 6, 0, 0], 4);
  void D; void sack; void windowRow;
}

function cannon(x: Ctx, a: number, f: number, s: number, recoil: number) {
  const { K, D, e } = x, k = D.depth([a, 2, f]);
  if (e <= 3) { for (const sd of [-1, 1]) { const c: V3 = [a + sd * 1.6 * s, 1.5 * s, f]; D.ell(c, 1.5 * s * 0.3, 1.5 * s, K.wood, k + sd * 0.01, { g: D.group() }); } }
  else box(x, a - 2.5 * s, f - 2.5 * s, a + 2.5 * s, f + 2.5 * s, 0, 1.6 * s, K.metal, K.metal);
  D.cap([a, 2 * s, f - 1.5 * s + recoil], [a, 3.2 * s, f + 5 * s + recoil], 1 * s, 0.7 * s, e <= 3 ? K.iron : K.metal, k + 0.02);
}
function battery(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, med = x.size === 'medium';
  const W = med ? 36 : 22;
  ground(x, rect(-W / 2 - 3, -10, W / 2 + 3, 12), K.soil, 0, 0.5);
  if (e === 0) { // boulder piles and a sling frame
    for (let i = 0; i < 6; i++) D.ell([-8 + (i % 3) * 2.6, 1.2 + Math.floor(i / 3) * 1.8, 4], 1.6, 1.4, K.stone, D.depth([-8, 1, 4]) + i * 0.001, { g: D.group() });
    for (const s of [-1, 1]) D.cap([6 + s * 3, 0, 0], [6, 9, 0], 0.7, 0.6, K.wood, D.depth([6, 4, 0]));
    const sw = Math.sin(x.ph) * 0.8;
    D.cap([6, 9, 0], [6 + Math.sin(sw) * 8, 9 - Math.cos(sw) * 8 + 8, Math.cos(sw) * 2], 0.3, 0.3, K.rope, D.depth([6, 8, 0]) + 0.1);
    fence(x, [[-W / 2, 9], [W / 2, 9]], 4, K.wood, 1.6, true);
    return;
  }
  if (e <= 2) { // trebuchet: the arm swings through the loop
    const k = D.depth([0, 8, 0]), H = S * 1.3, sw = Math.sin(x.ph) * 1.2 - 0.3;
    for (const s of [-1, 1]) { D.cap([-5, 0, s * 3], [0, H, s * 2], 0.9, 0.8, K.wood, k + s * 0.02); D.cap([5, 0, s * 3], [0, H, s * 2], 0.9, 0.8, K.wood, k + s * 0.02); }
    const L1 = H * 1.3, L2 = H * 0.45, p: V3 = [0, H, 0];
    const arm1: V3 = [Math.cos(sw) * L1, H + Math.sin(sw) * L1, 0], arm2: V3 = [-Math.cos(sw) * L2, H - Math.sin(sw) * L2, 0];
    D.cap(arm2, arm1, 0.9, 0.6, K.wood, k + 0.01);
    box(x, arm2[0] - 2.5, -2, arm2[0] + 2.5, 2, arm2[1] - 5, arm2[1] - 1, K.wood, K.wood, 0.5);
    D.cap(arm1, [arm1[0] + 2, arm1[1] - 4, 0], 0.2, 0.2, K.rope, k + 0.02); void p;
    for (let i = 0; i < 4; i++) D.ell([W / 2 - 3 + (i % 2) * 2.4, 1.2 + Math.floor(i / 2) * 1.8, 5], 1.2, 1.2, K.stone, D.depth([W / 2, 1, 5]) + i * 0.001, { g: D.group() });
    if (med) defWall(x, -W / 2, W / 2, 10, S * 0.6, false, 3);
    return;
  }
  if (e <= 4) { // cannons / guns behind an earthwork or sandbags
    const n = med ? 3 : 2, rec = Math.max(0, Math.sin(x.ph * 2)) * -1.2;
    for (let i = 0; i < n; i++) cannon(x, (i - (n - 1) / 2) * 14, 0, 2, i === 1 ? rec : 0);
    x.D.hull([...ring(0, 9, 0, W / 2 + 2, 20, 3), ...ring(0, 9, 3.2, W / 2, 20, 1.5)], e === 3 ? K.soil : K.cloth2, D.depth([0, 1, 9]), { g: D.group(), flat: 0.1 });
    for (let i = 0; i < 4; i++) (i % 2 ? barrel : crate)(x, -W / 2 - 1 + i * 3, -7, 0, 2.8, e >= 4 ? K.accent2 : K.wood);
    if (e === 4) defTower(x, W / 2 + 6, -6, 3, S * 2, false);
    return;
  }
  if (e === 5) { // missile launcher tilting up
    const tilt = 0.5 + Math.sin(x.ph) * 0.15;
    box(x, -12, -9, 12, 9, 0, 4.5, K.accent2, K.accent2);
    for (let i = 0; i < 4; i++) { const a = -6.6 + i * 4.4; D.cap([a, 5.5, -6], [a, 5.5 + Math.sin(tilt) * 20, -6 + Math.cos(tilt) * 20], 1.8, 1.8, K.trim, D.depth([a, 10, 2]) + 0.1 + i * 0.001); }
    dish(x, [14, 0, -4], 3);
    return;
  }
  // turret with a charging barrel (laser / railgun)
  const rot = x.ph / 2, k = D.depth([0, 9, 0]);
  cyl(x, 0, 0, 10, 0, 6, K.base, K.trim);
  domeRoof(x, 0, 0, 6, 8, 7, K.wall, k + 0.05);
  const tip: V3 = [Math.sin(rot) * 24, 12, Math.cos(rot) * 24];
  D.cap([0, 10.5, 0], tip, 1.8, 1.1, K.metal, D.depth([tip[0] / 2, 11, tip[2] / 2]) + 0.06);
  const ch = (Math.sin(x.ph * 2) + 1) / 2;
  lamp(x, tip, e === 7 ? K.glow2 : K.fire2, false, 0.6 + ch * 1.2);
  for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2 + 0.4; cyl(x, Math.sin(t) * 10, Math.cos(t) * 10, 1, 0, 3, K.metal, K.glow2); }
}

function fortress(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant';
  const R = giant ? 52 : 36, h = S * 1.2 + (e === 0 ? 0 : 3);
  ground(x, rect(-R - 4, -R - 4, R + 4, R + 4), e >= 4 ? K.paving : K.soil, 0, 0.5);
  if (e === 0) { // hill fort: an earthen mound ringed by palisades
    x.D.hull([...ring(0, 0, 0, R, 24), ...ring(0, 0, 8, R * 0.7, 24)], K.soil, -8e4, { g: D.group(), flat: 0.1 });
    const pr = R * 0.72;
    const path: [number, number][] = Array.from({ length: 17 }, (_, i) => { const t = (i / 16) * Math.PI * 2 + 0.2; return [Math.sin(t) * pr, Math.cos(t) * pr * 0.9]; });
    fence(x, path.filter(p => p[1] < pr * 0.8), 6, K.wood, 1.7, true);
    for (let i = 0; i < 3; i++) house(x, { a: -14 + i * 14, f: -6 + (i % 2) * 8, w: 11, d: 9, floors: 1, y0: 8, stilts: false, plinth: false, chimney: false });
    defTower(x, 0, pr * 0.9, 3, 12);
    return;
  }
  // curtain walls: a square or a polygon of the culture's plan, towers at the corners, a keep inside
  const n = C.plan === 'hex' ? 6 : C.plan === 'oct' || C.plan === 'round' ? 8 : 4;
  const rg = n === 4 ? [[-R, R], [R, R], [R, -R], [-R, -R]] as [number, number][] : polyRing(0, 0, R, R, n, Math.PI / n);
  // back walls first, then keep, then the front ones (painter's order by depth handles the rest)
  for (let i = 0; i < n; i++) {
    const [a0, f0] = rg[i], [a1, f1] = rg[(i + 1) % n];
    const mid: V3 = [(a0 + a1) / 2, h / 2, (f0 + f1) / 2], L = Math.hypot(a1 - a0, f1 - f0);
    const isFront = Math.abs(a1 - a0) > Math.abs(f1 - f0) && mid[2] > 0;
    // rotate the wall into place: build straight walls between corners as prisms
    const nx = -(f1 - f0) / L, nf = (a1 - a0) / L, th = e >= 6 ? 0 : 2.2;
    if (e >= 6) { for (const [pa, pf] of [[a0, f0]]) { cyl(x, pa, pf, 1.6, 0, h + 4, K.wall, K.trim); lamp(x, [pa, h + 4.6, pf], K.glow2, true, 0.9); } facet(x, [[a0, 0.5, f0], [a1, 0.5, f1], [a1, h + 1 + Math.sin(x.ph * 2 + i) * 0.4, f1], [a0, h + 1, f0]], K.field, 1e5 - 3 + mid[2] * 1e-3, D.group(), null, true); continue; }
    const m = e <= 2 ? K.stone : e === 3 ? K.wall : K.base;
    const v = prism(x, [[a0 + nx * th, f0 + nf * th], [a1 + nx * th, f1 + nf * th], [a1 - nx * th, f1 - nf * th], [a0 - nx * th, f0 - nf * th]], 0, h, m, K.paving);
    if (e <= 3) merlons(x, a0 - nx * (th - 0.6), f0 - nf * (th - 0.6), a1 - nx * (th - 0.6), f1 - nf * (th - 0.6), h, 2.4, 1.2, m, 3.8);
    if (isFront) { const s = frontSide(v); onWall(x, v, s, L / 2, h * 0.42, 9, h * 0.8, e <= 3 ? 'arch' : 'rect', e <= 3 ? K.door : K.metal); }
    void mid; void sideLen;
  }
  for (const [a, f] of rg) defTower(x, a, f, giant ? 7 : 5.5, h * 1.6, f < 0);
  // the keep (or the command block / shield generator)
  if (e <= 3) {
    const k = house(x, { a: 0, f: -R * 0.2, w: R * 0.7, d: R * 0.6, floors: e === 3 ? 4 : 3, chimney: false, win: 'slit', roof: C.roof === 'flat' ? 'flat' : C.roof });
    if (C.roof === 'flat' && k.v.kind === 'prism') for (let s = 0; s < 4; s++) void s;
    flag(x, [0, k.peak, -R * 0.2], S, 8, K.accent);
  } else if (e <= 5) {
    house(x, { a: 0, f: -R * 0.2, w: R * 0.8, d: R * 0.5, floors: 2, roof: 'flat', win: 'band' });
    dish(x, [R * 0.3, S * 2 + 1.2, -R * 0.3], 4); antenna(x, [-R * 0.25, S * 2 + 1.2, -R * 0.3], 14);
  } else {
    cyl(x, 0, 0, 8, 0, S * 2, K.wall, K.trim);
    lamp(x, [0, S * 2 + 2 + Math.sin(x.ph) * 0.6, 0], K.glow2, false, 2.5);
    domeRoof(x, 0, 0, 0, R * 1.08, R * 0.75, K.field, 1e5);
  }
  void sack; void coneRoof; void disc; void rnd;
}

export const MILITARY: StructType[] = [
  { id: 'watchtower', cat: 'military', sizes: ['small', 'medium'], name: 'Torre de vigia', eraNames: ['Mirante de estacas', 'Torre de vigia', 'Torre de vigia', 'Posto de observação', 'Torre de holofote', 'Torre de radar', 'Pilar de energia', 'Pilar de energia'], blurb: 'Vigia o horizonte e dá o alarme.', build: watchtower },
  { id: 'wall', cat: 'military', sizes: ['small', 'medium', 'large', 'giant'], name: 'Muralha', eraNames: ['Paliçada', 'Muralha', 'Muralha', 'Muralha', 'Barreira de concreto', 'Barreira', 'Cerca de energia', 'Cerca de energia'], blurb: 'Trecho de defesa; do médio em diante tem portão, do grande em diante, torres.', build: wall },
  { id: 'barracks', cat: 'military', sizes: ['medium', 'large'], name: 'Quartel', blurb: 'Alojamentos, pátio de formatura, bonecos e alvos.', build: barracks },
  { id: 'training', cat: 'military', sizes: ['small', 'medium', 'large'], name: 'Campo de treino', eraNames: ['Roda de luta', 'Campo de treino', 'Campo de treino', 'Campo de treino', 'Campo de treino', 'Centro de treinamento', 'Centro de treinamento', 'Centro de treinamento'], blurb: 'Bonecos, alvos, pista de obstáculos e de corrida.', build: training },
  { id: 'battery', cat: 'military', sizes: ['small', 'medium'], name: 'Bateria de defesa', eraNames: ['Funda e pedras', 'Trabuco', 'Trabuco', 'Bateria de canhões', 'Ninho de artilharia', 'Lançador de mísseis', 'Torreta de laser', 'Canhão de trilho'], blurb: 'Armas fixas de defesa da época.', build: battery },
  { id: 'fortress', cat: 'military', sizes: ['large', 'giant'], name: 'Fortaleza', eraNames: ['Forte de colina', 'Castelo', 'Castelo', 'Forte', 'Base fortificada', 'Base fortificada', 'Cidadela de energia', 'Cidadela com escudo'], blurb: 'Muralhas, torres e o reduto central.', build: fortress },
];
void cyl; void roofOn; void antenna; void lamp;
