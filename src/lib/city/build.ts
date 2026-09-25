// Populates a planned city with structures from the structure generator.
//
// One culture per city: every building - houses, shops, workshops, barracks, farms - is drawn from the
// same architectural language (plan, roof, windows, proportions, ornament), so a town reads as one
// people's work; the era picks the technology. Lots are cut along the street frontage (the door faces
// the street), sized from the real footprint of each design in this culture, and must sit on one level
// of dry ground inside a single zone. Which families of buildings a district gets follows a slow noise
// (neighbourhoods, not a random scatter) and the density (the old centre is taller than the outskirts).
import { fbm2, hash3 } from '../terrain/noise';
import { TILE } from '../terrain/types';
import type { Culture, Size } from '../structure/genome';
import { buildParts, shapeBox, CITY_K } from '../structure/render';
import type { Dir8 } from '../creature/pose';
import { CZ, CityBuilding, isField, isZone } from './codes';

type Opt = [string, Size];
interface Family { w: number; o: Opt[] }

/** Building families per zone and era (each family lists its designs biggest first). */
function families(zone: number, e: number, dens: number, seat = false): Family[] {
  const f = (w: number, ...o: Opt[]): Family => ({ w: Math.max(0, w), o });
  switch (zone) {
    case CZ.RES:
      if (e === 0) return [f(1, ['dwelling', 'small']), f(0.18, ['compound', 'medium'])];
      if (e === 1) return [f(1, ['dwelling', 'medium'], ['dwelling', 'small']), f(0.2, ['compound', 'medium']), f(dens > 0.6 ? 0.9 : 0, ['terrace', 'medium'])];
      if (e === 2) return [f(1, ['dwelling', 'medium'], ['dwelling', 'small']), f(dens * 1.6, ['terrace', 'large'], ['terrace', 'medium']), f(0.15, ['compound', 'large'], ['compound', 'medium'])];
      if (e === 3) return [f(1.1 - dens, ['dwelling', 'medium'], ['dwelling', 'small']), f(0.8 + dens, ['terrace', 'large'], ['terrace', 'medium']), f(dens > 0.7 ? 1 : 0, ['block', 'large'])];
      if (e === 4) return [f(1 - dens, ['dwelling', 'medium'], ['dwelling', 'small']), f(1, ['terrace', 'large'], ['terrace', 'medium']), f(dens * 2, ['block', 'giant'], ['block', 'large'])];
      if (e === 5) return [f((1 - dens) * 1.2, ['dwelling', 'medium'], ['dwelling', 'small']), f(0.6, ['block', 'large']), f(dens * 2, ['tower', 'giant'], ['tower', 'large'])];
      if (e === 6) return [f(1 - dens, ['dwelling', 'medium'], ['dwelling', 'small']), f(1, ['block', 'giant'], ['block', 'large']), f(dens * 2, ['tower', 'giant'], ['tower', 'large'])];
      return [f((1 - dens) * 0.8, ['dwelling', 'medium'], ['dwelling', 'small']), f(1, ['tower', 'giant'], ['tower', 'large']), f(dens * 1.5, ['arcology', 'giant'])];
    case CZ.COM:
      if (e === 0) return [f(1, ['stall', 'small'])];
      if (e <= 2) return [f(1, ['shop', 'medium'], ['shop', 'small']), f(0.6, ['stall', 'small']), f(dens > 0.8 ? 1 : 0.2, ['market', 'large'], ['market', 'medium'])];
      if (e <= 4) return [f(1, ['shop', 'medium'], ['shop', 'small']), f(0.5, ['market', 'large'], ['market', 'medium']), f(0.4, ['warehouse', 'large'], ['warehouse', 'medium'])];
      return [f(1, ['shop', 'medium'], ['shop', 'small']), f(dens * 1.5, ['mall', 'giant'], ['mall', 'large']), f(0.35, ['warehouse', 'large'], ['warehouse', 'medium']), f(dens > 0.6 ? 1 : 0, ['tower', 'large'])];
    case CZ.IND:
      if (e === 0) return [f(1, ['workshop', 'small']), f(0.6, ['kiln', 'small'])];
      if (e <= 2) return [f(1, ['workshop', 'medium'], ['workshop', 'small']), f(0.7, ['kiln', 'medium'], ['kiln', 'small']), f(0.5, ['mill', 'medium'])];
      return [f(1, ['factory', 'giant'], ['factory', 'large']), f(0.5, ['mill', 'large'], ['mill', 'medium']), f(0.5, ['warehouse', 'large'], ['warehouse', 'medium']),
        f(0.3, ['kiln', 'large'], ['kiln', 'medium']), f(e >= 4 ? 0.5 : 0, ['refinery', 'giant'], ['refinery', 'large']), f(0.3, ['workshop', 'medium'], ['workshop', 'small'])];
    case CZ.ADMIN:
      // one seat of government; the rest of the quarter gets smaller civic buildings of the same culture
      if (seat) return e <= 2 ? [f(1, ['compound', 'large'], ['compound', 'medium'])] : e <= 4 ? [f(1, ['terrace', 'large'], ['terrace', 'medium'])] : [f(1, ['block', 'large'])];
      if (e === 0) return [f(1, ['compound', 'large'], ['compound', 'medium'])];
      if (e <= 2) return [f(1, ['fortress', 'giant'], ['fortress', 'large'], ['compound', 'large'], ['compound', 'medium'])];
      if (e <= 4) return [f(1, ['block', 'giant'], ['block', 'large'], ['terrace', 'medium'])];
      return [f(1, ['tower', 'giant'], ['tower', 'large'], ['block', 'large'])];
    case CZ.MIL: case CZ.OUTPOST:
      return [f(1, ['barracks', 'large'], ['barracks', 'medium']), f(0.7, ['training', 'large'], ['training', 'medium'], ['training', 'small']),
        f(zone === CZ.OUTPOST ? 1.2 : 0.4, ['watchtower', 'medium'], ['watchtower', 'small']),
        f(e >= 1 && e <= 3 ? 0.3 : 0, ['fortress', 'large']), f(e >= 4 ? 0.6 : 0, ['bunker', 'medium'], ['bunker', 'small'])];
    case CZ.FARM: return [f(1, ['farm', 'giant'], ['farm', 'large'], ['farm', 'medium'], ['farm', 'small']), f(e >= 1 ? 0.4 : 0, ['orchard', 'medium'], ['orchard', 'small'])];
    case CZ.PASTURE: return [f(1, ['farm', 'medium'], ['farm', 'small'])];
    case CZ.LUMBER: return [f(1, ['lumber', 'medium'], ['lumber', 'small'])];
    case CZ.MINE: return [f(1, ['mine', 'large'], ['mine', 'medium'], ['mine', 'small'])];
    case CZ.QUARRY: return [f(1, ['mine', 'medium'], ['mine', 'small'])];
    case CZ.FISH: return [f(1, ['dwelling', 'small']), f(0.4, ['stall', 'small'])];
    default: return [];
  }
}

export interface LotInput {
  era: number; seed: number; culture: Culture;
  TG: number; T0x: number; T0y: number;
  code: Uint8Array; stage: Uint8Array;
  /** graded levels (255 = natural): cleared where a big building takes over a lane */
  lvl: Uint8Array;
  /** tile level (graded or natural) and dry-land test, both by local tile index */
  level: (k: number) => number; water: (k: number) => boolean;
  towers: [number, number][]; wallStage: number;
  /** a neighbour city's land */
  blocked: (tx: number, ty: number) => boolean;
}

const STREETS = new Set<number>([CZ.ROAD, CZ.ARTERY, CZ.TRACK, CZ.PLAZA, CZ.GATE, CZ.BRIDGE]);
// [dx, dy] towards the street and the facing that looks at it
const SIDES: [number, number, Dir8][] = [[0, 1, 'S'], [1, 0, 'E'], [-1, 0, 'W'], [0, -1, 'N']];

export function placeBuildings(p: LotInput): CityBuilding[] {
  const { TG, code, stage, era, culture } = p;
  const out: CityBuilding[] = [];
  const occ = new Uint8Array(TG * TG);

  // real footprint of every design in this culture (widest of two facings), in tiles
  const fpCache = new Map<string, number>();
  const fp = (t: string, s: Size) => {
    const key = t + s;
    let v = fpCache.get(key);
    if (v === undefined) {
      let w = 0;
      for (const d of ['S', 'E'] as Dir8[]) {
        let x0 = 1e9, x1 = -1e9;
        for (const part of buildParts({ culture, type: t, size: s, era, variant: 0, night: false }, d, 0, 8, CITY_K)) {
          const b = shapeBox(part); x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[2]);
        }
        w = Math.max(w, x1 - x0);
      }
      v = Math.max(3, Math.ceil((w * 0.72) / TILE));
      fpCache.set(key, v);
    }
    return v;
  };

  // field buildings stay apart: one farmstead / camp / mine head per patch or so
  const fieldAt: [number, number][] = [];
  let seat = false;
  const fieldClear = (x: number, y: number) => !fieldAt.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) < 22);

  /** a w x h lot of one zone on dry ground, at most one level of slope; the level of its front row wins */
  const inZone = (x: number, y: number, zone: number) => x >= 0 && y >= 0 && x < TG && y < TG && code[y * TG + x] === zone;
  const fits = (zone: number, x0: number, y0: number, w: number, h: number, fk: number): { l: number; s: number } | null => {
    if (x0 < 0 || y0 < 0 || x0 + w > TG || y0 + h > TG) return null;
    const big = zone === CZ.ADMIN || zone === CZ.MIL || zone === CZ.IND;
    let lo = 99, hi = -1, s = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const k = y * TG + x;
      // palaces, barracks and factories may swallow the minor lanes of their own quarter
      const own = code[k] === zone || (big && code[k] === CZ.ROAD && (inZone(x - 1, y, zone) || inZone(x + 1, y, zone) || inZone(x, y - 1, zone) || inZone(x, y + 1, zone)));
      if (!own || occ[k] || p.water(k)) return null;
      const L = p.level(k);
      if (L < lo) lo = L;
      if (L > hi) hi = L;
      if (hi - lo > 1) return null;
      if (stage[k] > s) s = stage[k];
    }
    if (p.blocked(p.T0x + x0 + (w >> 1), p.T0y + y0 + (h >> 1))) return null;
    return { l: p.level(fk), s };
  };
  const place = (zone: number, t: string, sz: Size, dir: Dir8, x0: number, y0: number, w: number, h: number, l: number, s: number, margin: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const k = y * TG + x;
      if (code[k] === CZ.ROAD) { code[k] = zone; p.lvl[k] = 255; }
    }
    for (let y = y0 - margin; y < y0 + h + margin; y++) for (let x = x0 - margin; x < x0 + w + margin; x++) if (x >= 0 && y >= 0 && x < TG && y < TG) occ[y * TG + x] = 1;
    out.push({
      type: t, size: sz, variant: hash3(x0, y0, p.seed + 31) % 3, dir,
      x: (p.T0x + x0 + w / 2) * TILE, y: (p.T0y + y0 + h / 2) * TILE, row: p.T0y + y0 + h - 1, l, w: Math.max(w, h),
      stage: Math.min(254, s + 4),
    });
  };
  /** try the families of a zone at a spot; (sx, sy) = direction towards the street */
  const tryAt = (zone: number, lx: number, ly: number, side: [number, number, Dir8], frontage: boolean, bigOnly = false) => {
    const k = ly * TG + lx;
    const dens = 1 - stage[k] / 254;
    const fams = families(zone, era, dens, zone === CZ.ADMIN && seat);
    if (!fams.length) return false;
    const field = isField(zone);
    if (field && !fieldClear(lx, ly)) return false;
    // the neighbourhood picks the family (slow noise), the lot only nudges it
    const tx = p.T0x + lx, ty = p.T0y + ly;
    const u = Math.min(0.999, Math.max(0, fbm2(tx / 55, ty / 55, p.seed + 900 + zone, 2) * 1.6 - 0.3 + ((hash3(tx, ty, p.seed + 7) % 100) / 100 - 0.5) * 0.25));
    const tot = fams.reduce((a, b) => a + b.w, 0);
    let x = u * tot, fam = fams[0];
    for (const fm of fams) { x -= fm.w; if (x <= 0 && fm.w > 0) { fam = fm; break; } }
    // first pass: only the district's own big designs, so small fallbacks do not eat the room they need
    const opts = bigOnly ? fam.o.slice(0, Math.max(1, fam.o.length - 1)) : [...fam.o, ...fams.filter(f2 => f2 !== fam && f2.w > 0).flatMap(f2 => f2.o.slice(-1))];
    const [dx, dy, dir] = side;
    for (const [t, sz] of opts) {
      // W along the street; the lot is shallower than wide (the 3/4 view shows little of its depth)
      const W = fp(t, sz), Dp = Math.max(3, Math.round(W * 0.62));
      const across = dx === 0;                     // street above/below: the lot is W wide, Dp deep
      const w = across ? W : Dp, h = across ? Dp : W;
      const shifts = frontage ? [0, -(W >> 2), W >> 2] : [0];
      for (const sh of shifts) {
        // the front edge lies on the street, the lot reaches away from it
        let x0: number, y0: number;
        if (!frontage) { x0 = lx - (w >> 1); y0 = ly - (h >> 1); }
        else if (dy === 1) { x0 = lx - (w >> 1) + sh; y0 = ly - h + 1; }
        else if (dy === -1) { x0 = lx - (w >> 1) + sh; y0 = ly; }
        else if (dx === 1) { x0 = lx - w + 1; y0 = ly - (h >> 1) + sh; }
        else { x0 = lx; y0 = ly - (h >> 1) + sh; }
        const r = fits(zone, x0, y0, w, h, ly * TG + lx);
        if (!r) continue;
        const margin = field || (dens < 0.45 && (t === 'dwelling' || t === 'compound')) ? 1 : 0;
        place(zone, t, sz, dir, x0, y0, w, h, r.l, r.s, margin);
        if (field) fieldAt.push([lx, ly]);
        if (zone === CZ.ADMIN) seat = true;
        return true;
      }
    }
    return false;
  };

  // 1. frontage: zone tiles next to a street, centre first
  const front: [number, number][] = [];
  for (let k = 0; k < TG * TG; k++) {
    if (!isZone(code[k]) || stage[k] === 255) continue;
    const x = k % TG, y = (k / TG) | 0;
    for (let s = 0; s < 4; s++) {
      const nx = x + SIDES[s][0], ny = y + SIDES[s][1];
      if (nx < 0 || ny < 0 || nx >= TG || ny >= TG) continue;
      if (STREETS.has(code[ny * TG + nx])) { front.push([k, s]); break; }
    }
  }
  front.sort((a, b) => stage[a[0]] - stage[b[0]] || hash3(a[0], 1, p.seed) - hash3(b[0], 1, p.seed));
  for (const big of [true, false]) for (const [k, s] of front) {
    if (occ[k]) continue;
    tryAt(code[k], k % TG, (k / TG) | 0, SIDES[s], true, big);
  }
  // 2. what is left inside the blocks (big industrial / military yards, fields without a track)
  const facingTo = (x: number, y: number): [number, number, Dir8] => {
    for (let d = 1; d < 18; d++) for (const sd of SIDES) {
      const nx = x + sd[0] * d, ny = y + sd[1] * d;
      if (nx >= 0 && ny >= 0 && nx < TG && ny < TG && STREETS.has(code[ny * TG + nx])) return sd;
    }
    return SIDES[0];
  };
  for (let y = 2; y < TG; y += 4) for (let x = 2; x < TG; x += 4) {
    const k = y * TG + x;
    if (occ[k] || !isZone(code[k]) || stage[k] === 255) continue;
    tryAt(code[k], x, y, facingTo(x, y), false);
  }
  // 3. watchtowers on the towers of the city wall (the wall itself is a painted placeholder for now)
  for (const [tx, ty] of p.towers) {
    const x = tx - p.T0x, y = ty - p.T0y;
    if (x < 1 || y < 1 || x >= TG - 1 || y >= TG - 1) continue;
    out.push({ type: 'watchtower', size: 'small', variant: 0, dir: 'S', x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, row: ty + 1, l: p.level(y * TG + x), w: 3, stage: p.wallStage });
  }
  return out;
}
