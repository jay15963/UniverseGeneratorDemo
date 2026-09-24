// Industrial: where things are made - tools, cloth, refined resources.
import type { Mat } from '../../creature/raster';
import type { StructType } from '../registry';
import { Ctx, box, cyl, rect, prism, ground, coneRoof, domeRoof, onWall, roofOn, fence, fire, smoke, lamp, sails, crate, barrel, sack, facet, disc, frontSide, sideLen, windowRow, flag, antenna } from '../parts';
import { house, pavilion, rnd, chance } from '../core';
import { ring, V3 } from '../draft';

/** a smokestack: tapered, banded, smoking */
export function stack(x: Ctx, a: number, f: number, r: number, h: number, m: Mat, steam = false) {
  const K = x.K;
  cyl(x, a, f, r, 0, h, m, K.dark, { rt: r * 0.7 });
  for (const k of [0.3, 0.62, 0.92]) cyl(x, a, f, r * (1 - 0.3 * k) + 0.4, h * k - 0.6, h * k + 0.6, K.trim, K.trim, { bias: 0.01 });
  if (x.e >= 4) lamp(x, [a, h + 0.5, f], K.fire, true, 0.8);
  smoke(x, [a, h + 2, f], r * 1.3, steam ? K.steam : undefined, 5, 26);
}
/** sawtooth-roofed hall (north lights) */
export function sawHall(x: Ctx, a: number, f: number, w: number, d: number, h: number, teeth: number) {
  const { K, D } = x;
  const v = box(x, a - w / 2, f - d / 2, a + w / 2, f + d / 2, 0, h, K.wall, null);
  const fs = frontSide(v);
  windowRow(x, v, fs, h * 0.5, 4, h * 0.45, 'rect', 7, [w / 2 - 5, w / 2 + 5]);
  onWall(x, v, fs, w / 2, h * 0.36, 8, h * 0.72, 'rect', K.door);
  for (let i = 0; i < teeth; i++) {
    const f0 = f - d / 2 + (d * i) / teeth, f1 = f - d / 2 + (d * (i + 1)) / teeth, th = (d / teeth) * 0.7, key = v.key + 0.02 + D.depth([a, h, f0]) * 1e-4;
    const inside: V3 = [a, h + th * 0.3, (f0 + f1) / 2];
    facet(x, [[a - w / 2, h, f1], [a + w / 2, h, f1], [a + w / 2, h + th, f0], [a - w / 2, h + th, f0]], K.roof, key, D.group(), inside);
    facet(x, [[a + w / 2, h, f0], [a - w / 2, h, f0], [a - w / 2, h + th, f0], [a + w / 2, h + th, f0]], K.win, key + 0.0005, D.group(), inside);
    for (const s of [-1, 1]) facet(x, [[a + (s * w) / 2, h, f0], [a + (s * w) / 2, h, f1], [a + (s * w) / 2, h + th, f0]], K.wall, key + 0.0004, D.group(), inside);
  }
  return v;
}

function workshop(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, med = x.size === 'medium';
  const w = rnd(x, 18, 24) * (med ? 1.3 : 1), d = rnd(x, 12, 15) * (med ? 1.2 : 1);
  ground(x, rect(-w / 2 - 10, -d / 2 - 2, w / 2 + 10, d / 2 + 9), K.paving);
  if (e <= 1) { // open lean-to on posts over the work floor
    pavilion(x, 0, 0, w, d, S * 0.95, 'shed', K.roof, K.wood, 2);
    cyl(x, -w * 0.25, 1, 2.6, 0, 2.2, K.stone, K.dark); fire(x, [-w * 0.25, 2.2, 1], 1.4); smoke(x, [-w * 0.25, S * 1.3, 1], 1.5);
    box(x, w * 0.1, 0, w * 0.1 + 3, 3, 0, 3, K.stone, K.stone); // anvil stone
    for (let i = 0; i < 3; i++) { const fx = w / 2 + 5; D.cap([fx - 3, 0, -d / 3 + i * 3], [fx - 3, 6, -d / 3 + i * 3], 0.4, 0.4, K.wood, D.depth([fx, 3, -d / 3 + i * 3])); }
    const fx = w / 2 + 2; D.cap([fx, 6, -d / 3], [fx, 6, -d / 3 + 6], 0.4, 0.4, K.wood, D.depth([fx, 6, 0]) + 0.01);
    facet(x, [[fx, 6, -d / 3], [fx, 6, -d / 3 + 6], [fx + Math.sin(x.ph) * 0.3, 1.5, -d / 3 + 6], [fx + Math.sin(x.ph) * 0.3, 1.5, -d / 3]], e === 0 ? K.wall : K.cloth, D.depth([fx, 4, 0]) + 0.02, D.group(), null, true);
    for (let i = 0; i < 3; i++) D.cap([-w / 2 - 6, 1 + i * 1.6, d / 2 - 1 + i * 0.2], [-w / 2 - 1, 1 + i * 1.6, d / 2 + 2], 0.9, 0.9, K.wood, D.depth([-w / 2 - 3, 1, d / 2]) + i * 0.001);
    return;
  }
  const h = house(x, { a: 0, f: 0, w, d, floors: med ? 2 : 1, windows: e >= 4, door: false, chimney: false });
  const fs = h.front, L = h.v.kind === 'prism' ? sideLen(h.v, fs) : 10;
  onWall(x, h.v, fs, L * 0.35, h.y0 + S * 0.42, S * 0.7, S * 0.84, e >= 4 ? 'rect' : 'arch', e >= 5 ? K.metal : K.door);
  if (e >= 4) for (let i = 0; i < 4; i++) onWall(x, h.v, fs, L * 0.35, h.y0 + S * 0.1 + i * S * 0.2, S * 0.7, 0.4, 'rect', K.dark, 0.02);
  onWall(x, h.v, fs, L * 0.78, h.y0 + S * 0.35, S * 0.36, S * 0.66, 'rect', K.door);
  if (e <= 3) { const ca = w * 0.3; box(x, ca - 1.8, -d * 0.2 - 1.8, ca + 1.8, -d * 0.2 + 1.8, h.top - 1, h.peak + 4, K.stone, K.dark); smoke(x, [ca, h.peak + 6, -d * 0.2], 2, K.soot); }
  if (e >= 6) { // fabricator pods with a glowing core and a working arm
    cyl(x, w / 2 + 7, 3, 4, 0, 7, K.trim, K.win); domeRoof(x, w / 2 + 7, 3, 7, 4, 3.5, K.win, D.depth([w / 2 + 7, 7, 3]));
    lamp(x, [w / 2 + 7, 6 + Math.sin(x.ph) * 0.6, 3], K.glow2, false, 1.6);
    const sw = Math.sin(x.ph);
    D.cap([-w / 2 - 5, 0, 4], [-w / 2 - 5, 7, 4], 1, 0.8, K.metal, D.depth([-w / 2 - 5, 3, 4]));
    D.cap([-w / 2 - 5, 7, 4], [-w / 2 - 5 + 4 * sw, 10, 6], 0.8, 0.6, K.metal, D.depth([-w / 2 - 5, 8, 5]) + 0.01);
    lamp(x, [-w / 2 - 5 + 4 * sw, 10, 6], K.glow2, true, 0.6);
  } else {
    for (let i = 0; i < 3; i++) crate(x, w / 2 + 4, d / 2 - 2 - i * 3.4, 0, 3, i % 2 ? K.wood : e >= 4 ? K.accent : K.wood);
    crate(x, w / 2 + 4, d / 2 - 3.5, 3, 3, K.wood);
    barrel(x, -w / 2 - 3, d / 2 + 1, 0, 3.4, e >= 4 ? K.metal : K.wood);
    for (let i = 0; i < 4; i++) D.cap([-w / 2 - 8, 0.6 + (i % 2) * 1.2, d / 2 + 3 + i * 0.8], [-w / 2 - 2, 0.6 + (i % 2) * 1.2, d / 2 + 3 + i * 0.8], 0.6, 0.6, e >= 3 ? K.metal : K.wood, D.depth([-w / 2 - 5, 1, d / 2 + 3 + i]));
  }
}

function kiln(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, sz = x.size === 'small' ? 1 : x.size === 'medium' ? 1.4 : 2;
  ground(x, rect(-20 * sz, -14 * sz, 20 * sz, 16 * sz), K.paving);
  if (e === 0) { // clay dome kilns with fire mouths
    for (let i = 0; i < Math.round(sz * 1.5); i++) {
      const a = (i - (sz * 1.5 - 1) / 2) * 16, key = D.depth([a, 3, 0]);
      domeRoof(x, a, 0, 0, 6, 7, K.wall, key);
      if (D.facing([0, 0, 1]) > 0.2) { D.poly([[a - 2, 0, 5.8], [a + 2, 0, 5.8], [a + 2, 2.6, 5.5], [a - 2, 2.6, 5.5]], K.dark, key + 0.01); fire(x, [a, 0.3, 6.4], 1.1); }
      smoke(x, [a, 8, 0], 1.6);
    }
    for (let i = 0; i < 6; i++) cyl(x, -14 + i * 4, 12, 1.2, 0, 2.6, K.wall2, K.dark);
    return;
  }
  if (e <= 2) { // bottle kilns
    const n = x.size === 'small' ? 1 : x.size === 'medium' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 20, r = 7;
      const v = cyl(x, a, -2, r, 0, S * 1.2, e === 1 ? K.stone : K.wall, null, { rt: r * 1.05 });
      x.D.hull([...ring(a, -2, S * 1.2, r * 1.05), ...ring(a, -2, S * 2.1, r * 0.45), ...ring(a, -2, S * 2.6, r * 0.35)], e === 1 ? K.stone : K.wall, v.key + 0.01, { g: D.group(), flat: 0.1 });
      onWall(x, v, 0, 0, S * 0.35, 4, 6, 'arch', K.dark);
      if (D.facing([0, 0, 1]) > 0.2) fire(x, [a, 0.4, -2 + r + 0.8], 1.2);
      smoke(x, [a, S * 2.6 + 2, -2], 2.4, K.soot);
    }
    house(x, { a: 0, f: 12, w: 22, d: 10, floors: 1, chimney: false });
    return;
  }
  if (e <= 4) { // blast furnace: tall shaft, stoves, charging ramp
    const H = S * (3 + sz);
    const v = cyl(x, 0, -4, 7, 0, H, K.iron, K.dark, { rt: 5 });
    for (let i = 1; i < 5; i++) cyl(x, 0, -4, 7 - i * 0.4 + 0.5, (H * i) / 5 - 0.6, (H * i) / 5 + 0.6, K.trim, K.trim, { bias: 0.01 });
    onWall(x, v, 0, 0, 3.5, 4, 5, 'arch', K.fire);
    for (const s of [-1, 1]) { cyl(x, s * 14, -8, 4.5, 0, H * 0.8, K.wall, K.wall2); domeRoof(x, s * 14, -8, H * 0.8, 4.5, 3, K.wall2, D.depth([s * 14, H * 0.8, -8]) + 0.01); }
    D.cap([12, 0, 10], [2, H * 0.95, -2], 1.6, 1.6, K.frame, D.depth([7, H / 2, 4]) + 0.4);
    stack(x, 20, -14, 3.5, H * 1.25, K.wall);
    smoke(x, [0, H + 2, -4], 3, K.soot);
    if (D.facing([0, 0, 1]) > 0.1) { D.cap([-3, 0.4, 3], [-10, 0.4, 12], 1, 1.3, K.fire, D.depth([-6, 0, 8]) + 0.2); }
    return;
  }
  // electric / plasma: a clean hall with a glowing crucible under a cage
  const h = house(x, { a: 0, f: -6, w: 36 * sz * 0.7 + 10, d: 22, floors: 2, roof: 'vault', chimney: false });
  const cx = 26 * sz * 0.5 + 8;
  cyl(x, cx, 6, 7, 0, 3, K.base, K.dark);
  for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; D.cap([cx + Math.sin(t) * 6, 3, 6 + Math.cos(t) * 6], [cx + Math.sin(t) * 3, 15, 6 + Math.cos(t) * 3], 0.6, 0.5, K.metal, D.depth([cx + Math.sin(t) * 5, 8, 6 + Math.cos(t) * 5])); }
  const pulse = 3 + Math.sin(x.ph) * 0.8;
  D.ell([cx, 9, 6], pulse, pulse, e >= 6 ? K.glow2 : K.fire2, D.depth([cx, 9, 6]), { g: D.group() });
  if (e === 5) stack(x, -20, -18, 3, 44, K.wall2, true);
  void h;
}

function mill(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, large = x.size === 'large';
  if (e <= 2) {
    const wind = C.params.water < 0.55 || C.r[59] < 0.5;
    if (wind) { // tower mill with turning sails
      const r = 8, H = S * (2.4 + (large ? 0.8 : 0));
      const v = C.plan === 'box' ? house(x, { a: 0, f: 0, w: r * 2, d: r * 2, floors: Math.round(H / S), roof: 'pyramid', chimney: false }).v
        : cyl(x, 0, 0, r, 0, H, e === 0 ? K.wall : K.stone, null, { rt: r * 0.72 });
      if (v.kind === 'round') { coneRoof(x, 0, 0, H, r * 0.8, 7, K.roof, v.key + 0.02); onWall(x, v, 0, 0, 4, 4, 7, 'arch', K.door); for (let i = 1; i < 3; i++) onWall(x, v, 0.4 + i, 0, (H * i) / 3 + 2, 2.4, 3.6, C.win === 'band' ? 'rect' : C.win, K.win); }
      sails(x, [0, H - 1, r + 1.5], H * 0.85, 4, e === 0 ? K.wall : K.cloth2, K.wood, 0.3);
      for (let i = 0; i < 4; i++) sack(x, -r - 3 + (i % 2) * 2.4, r + 2 + Math.floor(i / 2) * 2, 0, 3, K.cloth2);
      if (large) house(x, { a: 20, f: 4, w: 16, d: 12, floors: 1 });
    } else { // water mill: house by a pond, wheel turning
      const h = house(x, { a: 0, f: 0, w: 22, d: 16, floors: 2 });
      ground(x, rect(11, -12, 24, 14), K.water, 0.2, 2);
      const hub: V3 = [13.5, 7, 0], R = 7.5;
      for (let i = 0; i < 8; i++) {
        const t = x.ph / 8 + (i / 8) * Math.PI * 2, p: V3 = [13.5, 7 + Math.sin(t) * R, Math.cos(t) * R];
        D.cap(hub, p, 0.5, 0.5, K.wood, D.depth(hub) + 0.1);
        D.cap([13.5, p[1], p[2]], [15.5, p[1], p[2]], 0.9, 0.9, K.wood, D.depth(p) + 0.11);
      }
      for (let i = 0; i < 16; i++) { const t0 = (i / 16) * Math.PI * 2, t1 = ((i + 1) / 16) * Math.PI * 2; D.cap([13.5, 7 + Math.sin(t0) * R, Math.cos(t0) * R], [13.5, 7 + Math.sin(t1) * R, Math.cos(t1) * R], 0.7, 0.7, K.wood, D.depth(hub) + 0.12); }
      smoke(x, [14, 1.2, 8], 1, K.steam, 3, 5);
      void h;
    }
    return;
  }
  if (e <= 4) { // textile mill: long storeyed hall and its stack
    const w = large ? 70 : 50;
    house(x, { a: 0, f: -4, w, d: 20, floors: large ? 4 : 3, chimney: false, roof: C.roof === 'flat' ? 'flat' : 'gable' });
    stack(x, w / 2 + 6, -10, 3.6, S * 6, e === 3 ? K.wall : K.wall2);
    box(x, -w / 2 - 1, -6, -w / 2 + 7, 2, S * 3.5, S * 4.8, K.wall2, K.roof2, 0.3);
    ground(x, rect(-w / 2 - 4, 6, w / 2 + 12, 16), K.paving);
    for (let i = 0; i < 4; i++) crate(x, -w / 2 + 6 + i * 4, 12, 0, 3.2, i % 2 ? K.wood : K.cloth);
    return;
  }
  // wind turbines by the plant
  const n = large ? 3 : 2;
  house(x, { a: -18, f: 6, w: 18, d: 12, floors: 1, roof: 'flat' });
  for (let i = 0; i < n; i++) {
    const a = -6 + i * 22, f = -10 - (i % 2) * 10, H = S * 5.5;
    cyl(x, a, f, 1.6, 0, H, K.trim, K.trim, { rt: 1 });
    box(x, a - 1.8, f - 3, a + 1.8, f + 1.5, H - 1.5, H + 1.5, K.trim, K.trim, 0.02);
    sails(x, [a, H, f + 2], H * 0.62, 3, K.trim, K.trim, 0.08, 1);
    if (e >= 6) lamp(x, [a, H + 2, f], K.fire, true, 0.7);
  }
  void antenna; void fence; void flag; void prism; void roofOn; void disc; void coneRoof; void chance;
}

function factory(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant';
  const Z = giant ? 1.5 : 1;
  if (e <= 1) { // communal workshops: open sheds, looms, fires
    for (let i = 0; i < 3 + (giant ? 2 : 0); i++) {
      const a = (i % 3 - 1) * 26, f = Math.floor(i / 3) * -22;
      pavilion(x, a, f, 20, 12, S * 0.9, e === 0 ? 'gable' : C.roof === 'flat' ? 'gable' : C.roof, K.roof, K.wood, 2);
      fire(x, [a - 5, 0, f + 2], 1.2); smoke(x, [a - 5, S * 1.4, f + 2], 1.4);
      for (let j = 0; j < 2; j++) { const la = a + 3 + j * 5; box(x, la - 1.5, f - 1, la + 1.5, f + 2, 0, 4, K.wood, null); facet(x, [[la - 1.3, 4, f - 0.8], [la + 1.3, 4, f - 0.8], [la + 1.3, 1, f + 1.8], [la - 1.3, 1, f + 1.8]], j ? K.cloth : K.cloth2, D.depth([la, 3, f]) + 0.01, D.group(), null, true); }
    }
    for (let i = 0; i < 5; i++) sack(x, 30 + (i % 3) * 2.6, 10 + Math.floor(i / 3) * 2.4, 0, 3, K.cloth2);
    return;
  }
  const w = 56 * Z, d = 34 * Z;
  if (e >= 6) { // clean domes linked by glowing tubes
    for (let i = 0; i < 3; i++) { const a = (i - 1) * 36 * Z, r = (i === 1 ? 18 : 13) * Z; cyl(x, a, -6, r, 0, 7, K.wall, null); cyl(x, a, -6, r + 0.4, 5, 6.2, K.glow2, null, { bias: 0.01 }); domeRoof(x, a, -6, 7, r, r * 0.85, i === 1 ? blend2(K.win, K.trim) : K.trim, D.depth([a, 7, -6]) + 0.02); }
    for (const s of [-1, 1]) D.cap([s * 17 * Z, 4, -6], [s * 24 * Z, 4, -6], 2, 2, K.win, D.depth([s * 20 * Z, 4, -6]) + 1);
    for (let i = 0; i < 2; i++) stack(x, -46 * Z + i * 8, -20, 2.4, 40, K.trim, true);
    for (let i = 0; i < 3; i++) { const t = frac(x.t + i / 3); lamp(x, [-24 * Z + t * 48 * Z, 4.2, -6 + 2], K.glow2, false, 1.1); }
    for (let i = 0; i < 2; i++) { const t = x.ph + i * Math.PI; D.ell([Math.cos(t) * 30, 26 + Math.sin(t * 2) * 2, Math.sin(t) * 8], 2.4, 1, K.metal, 1e5 - 1, { g: D.group() }); lamp(x, [Math.cos(t) * 30, 25.2 + Math.sin(t * 2) * 2, Math.sin(t) * 8], K.glow2, true, 0.5); }
    return;
  }
  sawHall(x, 0, 0, w, d, S * 1.3, Math.round(d / 7));
  house(x, { a: -w / 2 - 9, f: d / 2 - 8, w: 16, d: 14, floors: 3, roof: e >= 4 ? 'flat' : undefined, chimney: false });
  const nS = e === 3 ? 3 : 2;
  for (let i = 0; i < nS + (giant ? 1 : 0); i++) stack(x, w / 2 - 6 - i * 12, -d / 2 - 4, 3.2, S * (4.2 + i * 0.4), e === 3 ? K.wall : K.wall2, e >= 5);
  for (let i = 0; i < 2; i++) { cyl(x, w / 2 + 8, -8 + i * 11, 4.5, 0, S * 1.6, K.metal, K.metal); domeRoof(x, w / 2 + 8, -8 + i * 11, S * 1.6, 4.5, 2, K.metal, D.depth([w / 2 + 8, S * 1.6, -8 + i * 11]) + 0.01); }
  D.cap([w / 2 + 3, S * 1.3, -2], [w / 2 + 8, S * 1.6 + 1, -8], 0.8, 0.8, K.frame, D.depth([w / 2 + 5, S, -5]) + 0.2);
  ground(x, rect(-w / 2 - 18, d / 2, w / 2 + 14, d / 2 + 14), K.paving);
  for (let i = 0; i < 5; i++) crate(x, -10 + i * 4.5, d / 2 + 6, 0, 3.4, i % 2 ? K.wood : K.accent);
  if (giant) sawHall(x, -8, -d - 6, w * 0.8, d * 0.7, S * 1.1, 3);
}
const frac = (v: number) => v - Math.floor(v);
const blend2 = (a: Mat, b: Mat): Mat => ({ ...a, ramp: a.ramp.map((c, i) => [(c[0] + b.ramp[i][0]) / 2, (c[1] + b.ramp[i][1]) / 2, (c[2] + b.ramp[i][2]) / 2] as [number, number, number]) });

function column(x: Ctx, a: number, f: number, r: number, h: number) {
  const { K, D } = x;
  const v = cyl(x, a, f, r, 0, h, K.metal, K.metal);
  domeRoof(x, a, f, h, r, r * 0.6, K.metal, v.key + 0.01);
  for (let i = 1; i < 4; i++) { const y = (h * i) / 4; cyl(x, a, f, r + 1.2, y - 0.3, y + 0.3, K.frame, K.frame, { bias: 0.01 }); }
  D.cap([a + r + 0.8, 0, f + 0.5], [a + r + 0.8, h, f + 0.5], 0.35, 0.35, K.frame, v.key + 0.02);
  return v;
}
function refinery(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant', Z = giant ? 1.4 : 1;
  if (e <= 2) { // smelting vats, evaporation pans, tar kettles
    for (let i = 0; i < 6; i++) { const a = -30 + (i % 3) * 16, f = -14 + Math.floor(i / 3) * 14; ground(x, rect(a - 6, f - 5, a + 6, f + 5), i % 2 ? K.water : K.cloth2, 0.1, 1); box(x, a - 6.5, f - 5.5, a + 6.5, f - 4.5, 0, 1, K.stone, K.stone); }
    for (let i = 0; i < 3; i++) { const a = 22 + (i % 2) * 10, f = -10 + i * 9; cyl(x, a, f, 3.5, 0, 4, K.iron, K.dark); fire(x, [a, 0, f + 3.8], 1); smoke(x, [a, 6, f], 1.8, K.soot); }
    house(x, { a: 30, f: 18, w: 16, d: 11, floors: 1 });
    return;
  }
  const n = giant ? 4 : 3;
  for (let i = 0; i < n; i++) column(x, -24 * Z + i * 10, -14, 3 + (i % 2), S * (3.2 + (i % 3) * 0.9));
  for (let i = 0; i < 2 + (giant ? 2 : 0); i++) { const a = 18 * Z + (i % 2) * 18, f = -8 + Math.floor(i / 2) * 18; cyl(x, a, f, 7.5, 0, 9, K.trim, K.metal); onWall(x, cyl(x, a, f, 7.6, 3.5, 4.5, e >= 6 ? K.glow2 : K.accent, null), 0.3, 0, 4, 12, 1, 'rect', K.dark, 0.01); }
  for (let i = 0; i < 3; i++) D.cap([-24 * Z + i * 10, 5 + i * 2, -10], [16 * Z, 5 + i * 2, -8 + i * 6], 0.9, 0.9, i === 1 ? K.accent : K.metal, D.depth([0, 5, -6]) + 0.5 + i * 0.01);
  // flare stack
  const fa = -34 * Z, fh = S * 5.5;
  D.cap([fa, 0, 6], [fa, fh, 6], 1.2, 0.8, K.metal, D.depth([fa, fh / 2, 6]));
  for (let i = 0; i < 4; i++) D.cap([fa - 3, 0, 6 + (i % 2 ? 3 : -3)], [fa, (fh * (i + 1)) / 5, 6], 0.3, 0.3, K.frame, D.depth([fa, fh / 2, 6]) + 0.001);
  fire(x, [fa, fh, 6], e >= 6 ? 1.4 : 2.2);
  if (e < 6) smoke(x, [fa, fh + 5, 6], 2.2, K.soot);
  house(x, { a: 0, f: 16, w: 20, d: 12, floors: 2, roof: 'flat' });
  ground(x, rect(-40 * Z, -24, 40 * Z, 26), K.paving);
}

export const INDUSTRIAL: StructType[] = [
  { id: 'workshop', cat: 'industrial', sizes: ['small', 'medium'], name: 'Oficina', eraNames: ['Oficina ao ar livre', 'Ferraria', 'Ateliê', 'Oficina a vapor', 'Oficina mecânica', 'Oficina', 'Fabricador', 'Fabricador orbital'], blurb: 'Onde se fazem ferramentas, peças e utensílios.', build: workshop },
  { id: 'kiln', cat: 'industrial', sizes: ['small', 'medium', 'large'], name: 'Forno / Fundição', eraNames: ['Fornos de barro', 'Fornos-garrafa', 'Fornos-garrafa', 'Alto-forno', 'Alto-forno', 'Forno elétrico', 'Forja de plasma', 'Forja de plasma'], blurb: 'Cerâmica, metal e vidro saem do fogo.', build: kiln },
  { id: 'mill', cat: 'industrial', sizes: ['medium', 'large'], name: 'Moinho / Tecelagem', eraNames: ['Moinho', 'Moinho', 'Moinho', 'Tecelagem', 'Tecelagem', 'Usina eólica', 'Usina eólica', 'Usina eólica'], blurb: 'Grãos, fibras e tecidos; o vento e a água trabalham.', build: mill },
  { id: 'factory', cat: 'industrial', sizes: ['large', 'giant'], name: 'Fábrica', eraNames: ['Oficinas comunais', 'Oficinas comunais', 'Manufatura', 'Fábrica', 'Fábrica', 'Fábrica', 'Nanofábrica', 'Nanofábrica'], blurb: 'Produção em grande escala.', build: factory },
  { id: 'refinery', cat: 'industrial', sizes: ['large', 'giant'], name: 'Refinaria', eraNames: ['Salinas e tanques', 'Salinas e tanques', 'Destilaria', 'Refinaria', 'Refinaria', 'Refinaria', 'Refinaria de plasma', 'Refinaria de plasma'], blurb: 'Recursos brutos viram recursos refinados.', build: refinery },
];
void chance; void rnd;
