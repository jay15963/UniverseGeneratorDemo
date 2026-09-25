// Ground painting for cities (Cities: Skylines style): district tints, specialised fields, street
// materials per era, bridges, plazas, and painted walls / towers / gates. Pure per-pixel colour
// functions called by the terrain rasterizer for tiles that carry a city code.
import { hash3, rand2 } from '../terrain/noise';
import type { RGB } from '../terrain/palettes';
import { CZ, isRoad, isWallish } from './codes';

const ZONE: Record<number, RGB> = {
  [CZ.RES]: [80, 200, 90], [CZ.COM]: [70, 130, 235], [CZ.IND]: [235, 205, 60], [CZ.ADMIN]: [130, 210, 245], [CZ.MIL]: [220, 60, 55],
  [CZ.OUTPOST]: [220, 60, 55],
};
const FIELD: RGB = [160, 90, 210];

const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
/** Zone colour carrying the ground's own light and texture (so grass under a green zone still reads as zoned). */
const tint = (base: RGB, z: RGB, k: number): RGB => {
  const l = (base[0] * 0.3 + base[1] * 0.59 + base[2] * 0.11) / 150;
  const m = 0.55 + l * 0.45;
  return [base[0] + (z[0] * m - base[0]) * k, base[1] + (z[1] * m - base[1]) * k, base[2] + (z[2] * m - base[2]) * k];
};

/** Street material family per era: 0 dirt, 1 cobble ("ladrilho"), 2 asphalt, 3 space-age glow panels. */
export const roadKind = (era: number) => (era <= 2 ? 0 : era <= 4 ? 1 : era <= 6 ? 2 : 3);

/**
 * Colour of one ground pixel of a city tile.
 * code: tile code; nN/nE/nS/nW: codes of the 4 neighbouring tiles; lx, ly: pixel inside the tile (0..15);
 * base: the natural ground colour at this pixel.
 */
export function cityPixel(code: number, era: number, wx: number, wy: number, lx: number, ly: number, base: RGB,
  nN: number, nE: number, nS: number, nW: number, s: number): RGB {
  const r0 = rand2(wx, wy, s + 700);
  if (isRoad(code) || code === CZ.PLAZA || code === CZ.GATE) {
    let c = code === CZ.BRIDGE ? bridge(era, wx, wy, r0) : code === CZ.PLAZA ? plaza(era, wx, wy, r0, s) : street(code === CZ.TRACK ? 0 : roadKind(era), wx, wy, r0, s);
    // edges against non-street ground
    const edge = (ly === 0 && !cls(nN)) || (lx === 15 && !cls(nE)) || (ly === 15 && !cls(nS)) || (lx === 0 && !cls(nW));
    const edge2 = (ly === 1 && !cls(nN)) || (lx === 14 && !cls(nE)) || (ly === 14 && !cls(nS)) || (lx === 1 && !cls(nW));
    if (code === CZ.BRIDGE) {
      if ((ly <= 1 && !cls(nN)) || (ly >= 14 && !cls(nS)) || (lx <= 1 && !cls(nW)) || (lx >= 14 && !cls(nE))) c = era >= 7 ? [90, 230, 255] : era >= 4 ? [120, 122, 126] : [70, 52, 36];
    } else if (edge || edge2) {
      const k = roadKind(era);
      if (code === CZ.TRACK || k === 0) c = edge ? mixc(c, base, 0.55) : mul(c, 0.9);
      else if (k === 1) c = edge ? [96, 92, 86] : c;
      else if (k === 2) c = edge ? (era >= 6 ? [150, 200, 230] : [184, 182, 174]) : mul(c, 1.12);
      else c = edge ? [110, 240, 255] : [50, 150, 190];
    }
    if (code === CZ.GATE) {
      const alongX = isWallish(nE) || isWallish(nW);   // the wall runs E-W, the road passes N-S
      const t = alongX ? ly : lx;
      if (t >= 6 && t <= 9) {
        const post = (alongX ? lx : ly) % 4 === 0;
        c = era >= 7 ? (post ? [180, 250, 255] : [70, 200, 240]) : era >= 3 ? (post ? [50, 54, 60] : [86, 92, 100]) : (post ? [52, 36, 22] : [104, 74, 44]);
      }
    }
    return c;
  }
  if (code === CZ.WALL || code === CZ.TOWER) return wall(code, era, wx, wy, lx, ly, r0, nN, nE, nS, nW, s);

  // districts and fields: tint the natural ground, outline the zone like a zoning overlay
  const zc = ZONE[code] ?? FIELD;
  let k = 0.55;
  switch (code) {
    case CZ.ADMIN: k = 0.62; break;
    case CZ.COM: k = 0.6; break;
    case CZ.MIL: k = 0.6; if (((wx + wy) & 7) === 0) k = 0.75; break;
    case CZ.OUTPOST: k = 0.5; if (((wx + wy) & 5) === 0 || ((wx - wy) & 5) === 0) k = 0.66; break;
    case CZ.FARM: {
      const cell = hash3(wx >> 7, wy >> 7, s + 710);
      const along = cell & 1 ? wx : wy;
      k = 0.34 + ((cell >> 3) % 3) * 0.05;
      if ((along & 3) === 0) k += 0.16;
      break;
    }
    case CZ.PASTURE: k = 0.32; if ((lx === 0 || ly === 0) && ((wx >> 4) % 3 === 0 || (wy >> 4) % 3 === 0) && ((wx + wy) & 1)) return [96, 70, 44]; break;
    case CZ.LUMBER: k = 0.3; break;
    case CZ.MINE: k = 0.55; if (r0 > 0.9) return [70, 50, 84]; break;
    case CZ.QUARRY: k = 0.5; if ((wx & 7) === 0 || (wy & 7) === 0) k = 0.62; break;
    case CZ.FISH: k = 0.4; if (((wx + wy) % 6) === 0) k = 0.56; break;
  }
  let c = tint(base, zc, k);
  // lot grid in a light version of the zone colour, so zoning reads even on same-coloured ground
  if (lx === 0 || ly === 0) c = mixc(c, [zc[0] + (255 - zc[0]) * 0.55, zc[1] + (255 - zc[1]) * 0.55, zc[2] + (255 - zc[2]) * 0.55], 0.55);
  // strong outline where the zone changes (not along streets, which already frame it)
  if ((ly <= 1 && other(nN, code)) || (lx >= 14 && other(nE, code)) || (ly >= 14 && other(nS, code)) || (lx <= 1 && other(nW, code))) c = tint(base, zc, 0.8);
  return c;
}

const cls = (n: number) => isRoad(n) || n === CZ.PLAZA || n === CZ.GATE;
const other = (n: number, code: number) => n !== code && !isRoad(n) && n !== CZ.PLAZA && !isWallish(n);
const DIRT: RGB[] = [[112, 84, 56], [130, 98, 66], [146, 112, 78], [160, 126, 90]];
const COBBLE: RGB[] = [[150, 144, 132], [136, 128, 118], [164, 156, 142], [126, 120, 112]];
const FLAG: RGB[] = [[196, 188, 172], [184, 176, 160], [206, 198, 182]];
const PLANK: RGB[] = [[126, 90, 54], [146, 106, 64], [112, 80, 48]];
const LOG: RGB[] = [[150, 110, 66], [140, 102, 60], [160, 118, 72]];
const STONE: RGB[] = [[150, 146, 136], [138, 134, 126], [160, 156, 146]];
const BRICK: RGB[] = [[150, 72, 52], [136, 64, 46], [162, 82, 58]];

function street(kind: number, wx: number, wy: number, r0: number, s: number): RGB {
  switch (kind) {
    case 0: { // packed dirt with pebbles and wheel-worn patches
      const n = rand2(wx >> 2, wy >> 2, s + 701);
      let i = 1 + (n > 0.6 ? 1 : 0) + (r0 > 0.8 ? 1 : 0) - (r0 < 0.08 ? 1 : 0);
      if (r0 > 0.985) return [172, 164, 150];
      i = Math.max(0, Math.min(3, i));
      return DIRT[i];
    }
    case 1: { // cobbles / paving tiles, staggered rows
      const row = wy >> 2, sx = wx + (row & 1) * 2;
      if (sx % 5 === 0 || (wy & 3) === 0) return [84, 80, 74];
      const h = hash3(Math.floor(sx / 5), row, s + 702) % 4;
      const st = COBBLE[h];
      return (wy & 3) === 1 ? mul(st, 1.1) : st;
    }
    case 2: { // asphalt
      const v = 60 + Math.round((r0 - 0.5) * 10) + (rand2(wx >> 3, wy >> 3, s + 703) > 0.8 ? -5 : 0);
      return [v, v + 2, v + 6];
    }
    default: { // space age: dark composite panels with lit seams
      if ((wx & 7) === 0 || (wy & 7) === 0) return [58, 78, 116];
      return r0 > 0.97 ? [90, 200, 240] : [34, 44, 68];
    }
  }
}

function plaza(era: number, wx: number, wy: number, r0: number, s: number): RGB {
  if (era <= 1) { const c = street(0, wx, wy, r0, s); return mul(c, 1.14); }
  if (era <= 4) {
    const sx = wx + ((wy >> 3) & 1) * 4;
    if ((sx & 7) === 0 || (wy & 7) === 0) return [120, 114, 104];
    const h = hash3(sx >> 3, wy >> 3, s + 704) % 3;
    return FLAG[h];
  }
  if (era <= 6) return (wx & 15) === 0 || (wy & 15) === 0 ? [140, 140, 138] : [178 + Math.round(r0 * 6), 178 + Math.round(r0 * 6), 174];
  return (wx & 15) === 0 || (wy & 15) === 0 ? [90, 220, 255] : [46, 58, 86];
}

function bridge(era: number, wx: number, wy: number, r0: number): RGB {
  if (era <= 1) { // planks
    if (wy % 3 === 0) return [62, 44, 28];
    const h = hash3(wy / 3 | 0, wx >> 4, 705) % 3;
    return PLANK[h];
  }
  if (era <= 3) { // stone arches
    const sx = wx + ((wy >> 2) & 1) * 3;
    if (sx % 6 === 0 || (wy & 3) === 0) return [104, 98, 90];
    return r0 > 0.5 ? [156, 150, 138] : [144, 138, 128];
  }
  if (era <= 6) return [150 + Math.round(r0 * 8), 150 + Math.round(r0 * 8), 148];
  return (wx & 7) === 0 ? [90, 220, 255] : [40, 56, 86];
}

function wall(code: number, era: number, wx: number, wy: number, lx: number, ly: number, r0: number,
  nN: number, nE: number, nS: number, nW: number, s: number): RGB {
  let c: RGB;
  if (era === 0) { // palisade: rows of log ends
    const u = wx & 3, v = wy & 3;
    const d = (u - 1.5) * (u - 1.5) + (v - 1.5) * (v - 1.5);
    const h = hash3(wx >> 2, wy >> 2, s + 706) % 3;
    c = d < 1.2 ? LOG[h] : d < 2.8 ? [104, 72, 42] : [58, 42, 28];
  } else if (era <= 2) { // dressed stone
    const row = wy >> 2, sx = wx + (row & 1) * 4;
    if ((sx & 7) === 0 || (wy & 3) === 0) c = [88, 84, 78];
    else c = STONE[hash3(sx >> 3, row, s + 707) % 3];
  } else if (era === 3) { // brick
    const row = Math.floor(wy / 3), sx = wx + (row & 1) * 3;
    if (sx % 6 === 0 || wy % 3 === 0) c = [186, 176, 158];
    else c = BRICK[hash3(Math.floor(sx / 6), row, s + 708) % 3];
  } else if (era <= 5) { // concrete
    c = (wx & 7) === 0 || (wy & 7) === 0 ? [118, 118, 116] : [150 + Math.round(r0 * 8), 150 + Math.round(r0 * 8), 146];
  } else if (era === 6) { // steel panels with rivets
    const u = wx & 7, v = wy & 7;
    c = u === 0 || v === 0 ? [66, 76, 90] : (u === 1 || u === 7) && (v === 1 || v === 7) ? [176, 186, 196] : [98, 110, 126];
  } else { // energy barrier
    c = ((wx + wy) & 3) === 0 ? [170, 250, 255] : [50, 170, 235];
  }
  const same = (n: number) => n === CZ.WALL || n === CZ.TOWER || n === CZ.GATE;
  if (code === CZ.TOWER) {
    // raised platform: bright top, crenellated rim
    c = mul(c, 1.08);
    const rim = (ly <= 1 && nN !== CZ.TOWER) || (ly >= 14 && nS !== CZ.TOWER) || (lx <= 1 && nW !== CZ.TOWER) || (lx >= 14 && nE !== CZ.TOWER);
    if (rim) c = ((wx >> 1) + (wy >> 1)) & 1 ? mul(c, 1.25) : mul(c, 0.55);
  } else {
    if ((ly === 0 && !same(nN)) || (lx === 0 && !same(nW))) c = mul(c, 1.18);           // lit top edge
    if ((ly >= 14 && !same(nS)) || (lx === 15 && !same(nE))) c = mul(c, 0.6);           // shadowed face
  }
  return c;
}

/** One colour per tile for the regional map (no texture): streets by era, walls, and the zone tint (when shown). */
export function cityRegionColor(code: number, era: number, base: RGB, zones: boolean): RGB | null {
  if (isRoad(code) || code === CZ.PLAZA || code === CZ.GATE) {
    if (code === CZ.BRIDGE) return era <= 1 ? [120, 88, 56] : era >= 7 ? [60, 150, 190] : [150, 146, 140];
    const k = code === CZ.TRACK ? 0 : roadKind(era);
    const c: RGB = k === 0 ? [140, 106, 72] : k === 1 ? [140, 134, 124] : k === 2 ? [66, 68, 72] : [44, 60, 96];
    return code === CZ.PLAZA ? mul(c, 1.2) : c;
  }
  if (code === CZ.WALL || code === CZ.TOWER) return era === 0 ? [104, 74, 44] : era >= 7 ? [80, 200, 240] : era === 3 ? [150, 76, 56] : [150, 146, 138];
  if (!zones) return null;
  return tint(base, ZONE[code] ?? FIELD, 0.5);
}
