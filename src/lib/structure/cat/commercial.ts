// Commercial: where things are sold and traded - stalls, shops, markets, malls, depots.
import type { Mat } from '../../creature/raster';
import type { StructType } from '../registry';
import { Ctx, box, cyl, rect, ground, onWall, fence, fire, lamp, crate, barrel, sack, facet, disc, tree, awning, sign, flag, frontSide, sideLen, windowAt, domeRoof, antenna } from '../parts';
import { house, pavilion, rnd, chance } from '../core';
import type { V3 } from '../draft';
import { blend } from './residential';

/** goods on a counter: fruit, pots, cloth rolls, crates - whatever the stall sells */
function goods(x: Ctx, a0: number, a1: number, f: number, y: number, kind: number) {
  const { K, D } = x, n = Math.max(2, Math.floor((a1 - a0) / 2.4));
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n, k = D.depth([a, y, f]) + 0.03;
    if (kind === 0) for (let j = 0; j < 3; j++) D.ell([a + (j - 1) * 0.7, y + 0.8 + (j === 1 ? 0.7 : 0), f], 0.8, 0.8, j % 2 ? K.fruit : K.crop, k + j * 0.001, { g: D.group() });
    else if (kind === 1) cyl(x, a, f, 0.9, y, y + 2, i % 2 ? K.wall2 : K.accent, K.dark, { bias: 0.03 });
    else if (kind === 2) D.cap([a, y + 0.8, f - 1], [a, y + 0.8, f + 1], 0.9, 0.9, i % 2 ? K.cloth : K.accent2, k);
    else box(x, a - 0.9, f - 0.9, a + 0.9, f + 0.9, y, y + 1.6, i % 2 ? K.accent : K.cloth2, i % 2 ? K.accent : K.cloth2, 0.03);
  }
}

function stall(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, w = rnd(x, 12, 16), d = 7, kind = Math.floor(x.r() * 4);
  ground(x, rect(-w / 2 - 3, -d / 2 - 2, w / 2 + 3, d / 2 + 5), K.paving);
  if (e >= 5) { // kiosk: glass box with a lit sign (a floating holo sign in the space age)
    const h = house(x, { a: 0, f: 0, w, d: d + 2, floors: 1, roof: 'flat', windows: false, door: false, clutter: false });
    if (h.v.kind === 'prism') {
      const fs = frontSide(h.v), L = sideLen(h.v, fs);
      onWall(x, h.v, fs, L / 2, S * 0.5, L - 2, S * 0.6, 'rect', K.win);
      sign(x, h.v, fs, L / 2, S * 0.92, L - 3, 2.6, C.r[70]);
    }
    if (e === 7) { const b = Math.sin(x.ph) * 0.8; D.ell([0, S * 1.7 + b, 0], w * 0.4, 2.4, { ...K.glow2, alpha: 0.6 }, 1e5, { g: D.group() }); }
    for (let i = 0; i < 2; i++) cyl(x, w / 2 + 3, -1 + i * 3, 1.2, 0, 3.2, K.trim, K.trim);
    return;
  }
  box(x, -w / 2, -d / 2 + 1, w / 2, d / 2, 0, 3.6, e === 0 ? K.wood : K.wall, K.wood);
  goods(x, -w / 2 + 1, w / 2 - 1, d / 2 - 1.5, 3.6, kind);
  for (const s of [-1, 1]) for (const f of [-d / 2 + 1, d / 2]) D.cap([s * w / 2, 0, f], [s * w / 2, S * 0.85, f], 0.5, 0.45, K.wood, D.depth([s * w / 2, 4, f]));
  if (e === 0) facet(x, [[-w / 2 - 1, S * 0.85, -d / 2], [w / 2 + 1, S * 0.85, -d / 2], [w / 2 + 1, S * 0.7 + Math.sin(x.ph) * 0.3, d / 2 + 2], [-w / 2 - 1, S * 0.7 + Math.sin(x.ph) * 0.3, d / 2 + 2]], K.wall, D.depth([0, S, 0]) + 0.1, D.group(), null, true);
  else awning(x, -w / 2 - 1, w / 2 + 1, -d / 2 + 1, S * 0.95, d + 1, K.cloth, K.cloth2);
  for (let i = 0; i < 3; i++) (i % 2 ? sack : barrel)(x, w / 2 + 2.5, -1 + i * 2.6, 0, 2.6, i % 2 ? K.cloth2 : K.wood);
  if (x.night) lamp(x, [w / 2, S * 0.8, d / 2 + 0.5], K.fire, false, 0.9);
}

function shop(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, med = x.size === 'medium';
  const w = rnd(x, 16, 20) * (med ? 1.4 : 1), d = rnd(x, 13, 16), floors = e === 0 ? 1 : med ? 2 + (chance(x, 0.4) ? 1 : 0) : 1 + (chance(x, 0.5) ? 1 : 0);
  const h = house(x, { a: 0, f: 0, w, d, floors, door: false });
  ground(x, rect(-w / 2 - 6, d / 2, w / 2 + 6, d / 2 + 9), K.paving);
  if (h.v.kind === 'prism') {
    const fs = h.front, L = sideLen(h.v, fs), y0 = h.y0;
    onWall(x, h.v, fs, L * 0.72, y0 + S * 0.33, S * 0.36, S * 0.66, e >= 5 ? 'rect' : 'arch', K.door);
    // shop window(s)
    const sw = L * 0.42;
    if (e >= 2) { onWall(x, h.v, fs, L * 0.3, y0 + S * 0.45, sw + 1.4, S * 0.62, 'rect', K.trim, 0.008); onWall(x, h.v, fs, L * 0.3, y0 + S * 0.45, sw, S * 0.54, 'rect', x.night ? K.winLit : K.win); }
    else goods(x, -w / 2 + 2, -w / 2 + 2 + sw, d / 2 + 1.5, 2.6, Math.floor(C.r[71] * 4));
    sign(x, h.v, fs, L / 2, y0 + S * 0.92, L * 0.7, 2.6, C.r[72] + x.e);
    if (e >= 1 && e <= 4) awning(x, -w / 2 + 1, -w / 2 + 1 + sw + 2, d / 2 + 0.2, y0 + S * 0.82, 4.5, K.cloth, K.cloth2);
  }
  // a hanging sign or a tavern's tables outside
  if (e <= 3) {
    D.cap([w / 2 + 0.3, S * 0.9, d / 2], [w / 2 + 4, S * 0.9, d / 2], 0.4, 0.4, K.iron, D.depth([w / 2 + 2, S, d / 2]) + 0.1);
    const sw = Math.sin(x.ph) * 0.5;
    facet(x, [[w / 2 + 1.5, S * 0.85, d / 2 + sw * 0.2], [w / 2 + 4, S * 0.85, d / 2 + sw * 0.2], [w / 2 + 4, S * 0.5, d / 2 + sw], [w / 2 + 1.5, S * 0.5, d / 2 + sw]], K.accent, D.depth([w / 2 + 3, S * 0.7, d / 2]) + 0.11, D.group(), null, true);
  }
  for (let i = 0; i < (med ? 3 : 2); i++) {
    const a = -w / 2 + 3 + i * 7, f = d / 2 + 5.5;
    cyl(x, a, f, 1.8, 0, 2.6, e <= 3 ? K.wood : K.trim, e <= 3 ? K.wood : K.trim);
    if (e >= 3 && i === 0) { D.cap([a, 2.6, f], [a, 6.5, f], 0.25, 0.25, K.metal, D.depth([a, 4, f]) + 0.01); D.shape([a, 6.5, f], [-3, 0, 3, 0, 0, -2.2], K.accent, D.depth([a, 6, f]) + 0.02, { g: D.group() }); }
  }
  if (e === 0) fire(x, [w / 2 + 5, 0, d / 2 + 5], 1.2);
  if (x.night && e >= 3) lamp(x, [-w / 2 - 1, S * 0.8, d / 2 + 1], K.glow, false, 1);
}

function market(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, large = x.size === 'large';
  const W = large ? 70 : 48, Dd = large ? 44 : 30;
  ground(x, rect(-W / 2 - 4, -Dd / 2 - 4, W / 2 + 4, Dd / 2 + 8), K.paving);
  if (e >= 1 && C.r[73] < 0.6) { // covered market hall on columns, stalls inside
    const top = pavilion(x, 0, -2, W, Dd, S * 1.4, C.roof === 'flat' ? 'vault' : C.roof === 'dome' ? 'hip' : C.roof, K.roof, e >= 3 ? K.iron : K.trim, large ? 6 : 4);
    for (let i = 0; i < (large ? 4 : 3); i++) for (let j = 0; j < 2; j++) {
      const a = -W / 2 + 8 + i * ((W - 16) / Math.max(1, large ? 3 : 2)), f = -Dd / 2 + 7 + j * (Dd - 10);
      box(x, a - 4, f - 2, a + 4, f + 2, 0, 3, K.wood, K.wood, -0.5); goods(x, a - 3, a + 3, f + 0.5, 3, (i + j) % 4);
    }
    if (e >= 3) for (let i = 0; i < 3; i++) lamp(x, [-W / 3 + (i * W) / 3, S * 1.2, Dd / 2 - 2], K.glow, false, 1);
    void top;
  } else { // open bazaar: stalls around a well or fountain
    const n = large ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + 0.3, a = Math.sin(t) * W * 0.36, f = Math.cos(t) * Dd * 0.34, sw = 9;
      box(x, a - sw / 2, f - 2.5, a + sw / 2, f + 2.5, 0, 2.6, K.wood, K.wood);
      goods(x, a - sw / 2 + 1, a + sw / 2 - 1, f + 1, 2.6, i % 4);
      const sh = Math.sin(x.ph + i) * 0.3;
      for (const s of [-1, 1]) D.cap([a + s * sw / 2, 0, f - 2.5], [a + s * sw / 2, S * 0.95, f - 2.5], 0.4, 0.4, K.wood, D.depth([a, 3, f - 2.5]));
      if (e === 0) facet(x, [[a - sw / 2 - 1, S * 0.95, f - 2.5], [a + sw / 2 + 1, S * 0.95, f - 2.5], [a + sw / 2 + 1, S * 0.7 + sh, f + 4], [a - sw / 2 - 1, S * 0.7 + sh, f + 4]], K.wall, D.depth([a, S * 0.7, f]) + 0.1, D.group(), null, true);
      else awning(x, a - sw / 2 - 1, a + sw / 2 + 1, f - 2.5, S * 0.95, 6, i % 2 ? K.cloth : K.accent2, K.cloth2);
    }
    if (e === 0) fire(x, [0, 0, 0], 1.8);
    else { cyl(x, 0, 0, 5, 0, 1.4, K.base, K.water); const j = Math.abs(Math.sin(x.ph)); D.ell([0, 3 + j * 1.5, 0], 1, 1.8 + j * 0.8, K.water, D.depth([0, 2, 0]) + 0.1); cyl(x, 0, 0, 1, 1.4, 3, K.base, K.base); }
  }
  flag(x, [-W / 2 - 1, 0, Dd / 2 + 4], S * 1.6, 7, K.accent);
  flag(x, [W / 2 + 1, 0, Dd / 2 + 4], S * 1.6, 7, K.accent2);
}

function mall(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, giant = x.size === 'giant';
  if (e <= 2) { // caravanserai: an arcaded courtyard of shops
    const R = giant ? 42 : 32;
    ground(x, rect(-R, -R, R, R), K.paving);
    for (const [a0, f0, a1, f1] of [[-R, -R, R, -R + 10], [-R, -R + 10, -R + 10, R], [R - 10, -R + 10, R, R]] as [number, number, number, number][]) {
      const h = house(x, { a: (a0 + a1) / 2, f: (f0 + f1) / 2, w: a1 - a0, d: f1 - f0, floors: 2, door: false, chimney: false });
      void h;
    }
    for (const s of [-1, 1]) { box(x, s > 0 ? 6 : -R, R - 6, s > 0 ? R : -6, R, 0, S * 1.2, K.wall, K.roof); }
    box(x, -6, R - 7, 6, R + 1, 0, S * 1.8, K.wall2, K.roof, 0.1);
    onWall(x, { kind: 'prism', ring: rect(-6, R - 7, 6, R + 1), top: rect(-6, R - 7, 6, R + 1), y0: 0, y1: S * 1.8, key: D.depth([0, S, R - 3]) + 0.1 }, 0, 6, S * 0.6, 7, S * 1.1, 'arch', K.dark);
    for (let i = 0; i < 6; i++) { const t = i * 1.05; (i % 2 ? sack : crate)(x, Math.sin(t) * R * 0.4, Math.cos(t) * R * 0.3, 0, 3, i % 3 ? K.cloth : K.wood); }
    cyl(x, 0, 0, 4, 0, 1.4, K.base, K.water);
    return;
  }
  const W = giant ? 96 : 70, Dd = giant ? 48 : 36;
  ground(x, rect(-W / 2 - 8, Dd / 2 - 4, W / 2 + 8, Dd / 2 + 22), e >= 4 ? K.paving : K.paving);
  if (e >= 6) { // futurist: glass domes and a floating ring of lights
    for (const [a, r] of [[-W * 0.25, 20], [W * 0.22, 26]] as [number, number][]) { cyl(x, a, -4, r, 0, 6, K.wall, null); domeRoof(x, a, -4, 6, r, r * 0.8, { ...K.win, tex: 'glazing' }, D.depth([a, 6, -4]) + 0.01); }
    const ringY = 34 + Math.sin(x.ph) * 1.5;
    for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2 + x.ph / 16; lamp(x, [Math.sin(t) * W * 0.4, ringY, -4 + Math.cos(t) * 12], i % 2 ? K.glow : K.glow2, false, 0.9); }
    if (e === 7) antenna(x, [W * 0.22, 6 + 26 * 0.8, -4], 16);
    for (let i = 0; i < 5; i++) tree(x, -W / 2 + 6 + i * (W - 12) / 4, Dd / 2 + 12, 0.8, 2);
    return;
  }
  const h = house(x, { a: 0, f: 0, w: W, d: Dd, floors: giant ? 4 : 3, roof: 'flat', windows: e === 3, door: false, wall: e >= 5 ? blend(K.wall, K.trim, 0.3) : K.wall });
  if (h.v.kind === 'prism') {
    const fs = h.front, L = sideLen(h.v, fs);
    // glass front, entrance canopy, big lit signs
    onWall(x, h.v, fs, L / 2, S * 1.1, L * 0.35, S * 2, 'rect', x.night ? K.winLit : K.win);
    for (let i = 0; i < 2; i++) sign(x, h.v, fs, L * (0.18 + i * 0.64), S * (giant ? 3.3 : 2.4), L * 0.24, 3.4, C.r[74] + i);
    for (let i = 0; i < 3; i++) windowAt(x, h.v, fs, L * (0.1 + i * 0.4), S * 0.5, 5, S * 0.6, 'rect');
  }
  box(x, -12, Dd / 2, 12, Dd / 2 + 6, S * 1.3, S * 1.5, K.trim, K.trim, 0.2);
  for (const s of [-1, 1]) D.cap([s * 11, 0, Dd / 2 + 5.5], [s * 11, S * 1.3, Dd / 2 + 5.5], 0.5, 0.5, K.metal, D.depth([s * 11, 5, Dd / 2 + 5.5]) + 0.2);
  for (let i = 0; i < 6; i++) { const a = -W / 2 + 4 + i * (W - 8) / 5; D.cap([a, 0, Dd / 2 + 16], [a, 7, Dd / 2 + 16], 0.3, 0.3, K.metal, D.depth([a, 3, Dd / 2 + 16])); lamp(x, [a, 7.4, Dd / 2 + 16], K.glow, false, 0.9); }
  if (giant) house(x, { a: W * 0.3, f: -Dd * 0.3, w: 26, d: 22, floors: 12, roof: 'flat', door: false });
  void fence; void fire; void disc;
}

function warehouse(x: Ctx) {
  const { C, K, e, D } = x, S = C.storey, large = x.size === 'large';
  const W = large ? 60 : 40, Dd = large ? 30 : 22;
  ground(x, rect(-W / 2 - 6, Dd / 2, W / 2 + 12, Dd / 2 + 14), K.paving);
  const h = house(x, { a: 0, f: 0, w: W, d: Dd, floors: 2, windows: e >= 3 && e <= 4, door: false, chimney: false, roof: e >= 4 ? 'vault' : C.roof === 'flat' ? 'gable' : C.roof });
  if (h.v.kind === 'prism') {
    const fs = h.front, L = sideLen(h.v, fs), n = large ? 3 : 2;
    for (let i = 0; i < n; i++) onWall(x, h.v, fs, (L * (i + 0.5)) / n, S * 0.5, S * 0.8, S, e >= 4 ? 'rect' : 'arch', e >= 4 ? K.metal : K.door);
  }
  // goods on the yard: crates and barrels, or stacked shipping containers
  if (e >= 4) {
    const cols: Mat[] = [K.accent, K.accent2, K.cloth, blend(K.accent, K.trim, 0.4)];
    for (let i = 0; i < (large ? 6 : 4); i++) { const a = -W / 2 + 4 + (i % 3) * 13, lvl = Math.floor(i / 3); box(x, a, Dd / 2 + 3, a + 12, Dd / 2 + 8, lvl * 5, lvl * 5 + 5, cols[i % 4], cols[i % 4], lvl * 0.01); }
  } else {
    for (let i = 0; i < 8; i++) (i % 3 === 0 ? barrel : i % 3 === 1 ? crate : sack)(x, -W / 2 + 3 + (i % 4) * 4, Dd / 2 + 4 + Math.floor(i / 4) * 4, 0, 3.2, i % 3 === 2 ? K.cloth2 : K.wood);
  }
  void tree; void chance; void D; void ([] as V3[]);
}

export const COMMERCIAL: StructType[] = [
  { id: 'stall', cat: 'commercial', sizes: ['small'], name: 'Barraca', eraNames: ['Banca de troca', 'Barraca', 'Barraca', 'Barraca', 'Banca', 'Quiosque', 'Quiosque', 'Quiosque holográfico'], blurb: 'Um balcão com a mercadoria à vista.', build: stall },
  { id: 'shop', cat: 'commercial', sizes: ['small', 'medium'], name: 'Loja / Taverna', blurb: 'Vitrine, placa na escrita da espécie e mesas na calçada.', build: shop },
  { id: 'market', cat: 'commercial', sizes: ['medium', 'large'], name: 'Mercado', eraNames: ['Feira', 'Mercado', 'Mercado', 'Mercado coberto', 'Mercado coberto', 'Mercado', 'Mercado', 'Mercado'], blurb: 'Muitas bancas juntas: feira ao ar livre ou pavilhão coberto.', build: market },
  { id: 'mall', cat: 'commercial', sizes: ['large', 'giant'], name: 'Centro comercial', eraNames: ['Caravançarai', 'Caravançarai', 'Caravançarai', 'Galeria comercial', 'Loja de departamentos', 'Shopping', 'Galeria sob cúpulas', 'Galeria sob cúpulas'], blurb: 'Comércio concentrado num grande complexo.', build: mall },
  { id: 'warehouse', cat: 'commercial', sizes: ['medium', 'large'], name: 'Armazém / Entreposto', blurb: 'Estoque e distribuição de mercadorias.', build: warehouse },
];
