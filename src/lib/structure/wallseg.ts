// The simplest wall asset: one straight segment from a tile to the next one in any of the 8 directions.
//
// Unlike the other structures (drafted with the 3/4 camera of draft.ts), wall segments are drawn in the terrain's own
// projection - ground straight from above, height straight up - so consecutive segments join end to end along any of
// the 8 directions of the city's wall rings. Still flat 2D pixel art: every face is one polygon painted by the
// creatures' rasterizer with the culture's materials for the era (palisade logs, stone, brick, concrete, steel,
// energy). The longer wall pieces of the structure generator are a different asset (whole stretches).
import { rasterize, Part, Mat } from '../creature/raster';
import { makeKit } from './kit';
import type { Culture } from './genome';

export const WALL_DIRS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export interface WallSprite { data: Uint8ClampedArray; w: number; h: number; ax: number; ay: number }

/**
 * dir: index into WALL_DIRS; tile: tile size in px; lift: px per terrain level; dl: level of the end tile minus the
 * start tile (-1, 0, 1). (ax, ay) is the start tile's ground centre in the sprite.
 */
export function wallSegment(culture: Culture, era: number, dir: number, tile: number, lift: number, dl: number): WallSprite {
  const K = makeKit(culture, era, false);
  const [dx, dy] = WALL_DIRS[dir];
  const L = tile, H = era === 0 ? 15 : era >= 4 ? 20 : 18, T = era === 0 ? 4 : 6;
  const mat: Mat = era === 0 ? K.wood : era <= 3 ? K.stone : era <= 5 ? K.base : era === 6 ? K.metal : { ...K.glow2, alpha: 0.75 };
  const top: Mat = era === 7 ? { ...K.glow, alpha: 0.85 } : mat;
  // ground points (x right, y down), the far end raised/lowered by its level
  const bx = dx * L, by = dy * L, bz = dl * lift;
  const len = Math.hypot(dx, dy);
  // thickness towards the back (north; west for north-south runs)
  let nx = -dy / len, ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  const h2 = T / 2;
  const P = (x: number, y: number, z: number): [number, number] => [x, y - z];
  const f0 = [-nx * h2, -ny * h2], f1 = [bx - nx * h2, by - ny * h2], k1 = [bx + nx * h2, by + ny * h2], k0 = [nx * h2, ny * h2];
  const parts: Part[] = [];
  const poly = (pts: [number, number][], m: Mat, dark: number, g = 1) => parts.push({ s: { k: 'p', pts: pts.flat() }, m, dark, g, flat: 0.9 });
  const z0 = 0, z1 = bz;
  // front face (only when it looks towards the viewer)
  if (ny < -0.01) poly([P(f0[0], f0[1], z0), P(f1[0], f1[1], z1), P(f1[0], f1[1], z1 + H), P(f0[0], f0[1], z0 + H)], mat, 0.92);
  // end caps that face the viewer (they give the run its thickness where it starts or turns)
  if (dy > 0) poly([P(f1[0], f1[1], z1), P(k1[0], k1[1], z1), P(k1[0], k1[1], z1 + H), P(f1[0], f1[1], z1 + H)], mat, 0.72);
  if (dy < 0) poly([P(k0[0], k0[1], z0), P(f0[0], f0[1], z0), P(f0[0], f0[1], z0 + H), P(k0[0], k0[1], z0 + H)], mat, 0.72);
  if (dy === 0 && dx !== 0) {
    // horizontal run seen from the front: nothing else
  } else if (dx === 0) {
    // north-south run: the side face is edge-on; show a sliver of the lit west side
    poly([P(f0[0], f0[1], z0 + H), P(f1[0], f1[1], z1 + H), P(f1[0], f1[1], z1), P(f0[0], f0[1], z0)], mat, 0.8);
  }
  // walk on top
  poly([P(f0[0], f0[1], z0 + H), P(f1[0], f1[1], z1 + H), P(k1[0], k1[1], z1 + H), P(k0[0], k0[1], z0 + H)], top, 1.18, 2);
  // crest: merlons (stone and later), pointed stakes (palisade), an emitter line (energy)
  const n = Math.max(2, Math.round((L * len) / 5));
  for (let i = 0; i < n; i++) {
    const u0 = (i + 0.15) / n, u1 = (i + 0.6) / n;
    const zA = z0 + (z1 - z0) * u0 + H, zB = z0 + (z1 - z0) * u1 + H;
    const ax = f0[0] + (f1[0] - f0[0]) * u0, ay = f0[1] + (f1[1] - f0[1]) * u0, cx = f0[0] + (f1[0] - f0[0]) * u1, cy = f0[1] + (f1[1] - f0[1]) * u1;
    if (era === 0) {
      const mx = (ax + cx) / 2, my = (ay + cy) / 2, mz = (zA + zB) / 2;
      poly([P(ax, ay, zA), P(cx, cy, zB), P(mx, my, mz + 4)], mat, 1.05, 3 + i);
    } else if (era < 7) {
      const hM = era >= 4 ? 2 : 3;
      poly([P(ax, ay, zA), P(cx, cy, zB), P(cx, cy, zB + hM), P(ax, ay, zA + hM)], mat, 1.0, 3 + i);
      poly([P(ax, ay, zA + hM), P(cx, cy, zB + hM), P(cx + nx * T * 0.6, cy + ny * T * 0.6, zB + hM), P(ax + nx * T * 0.6, ay + ny * T * 0.6, zA + hM)], top, 1.2, 3 + i);
    }
  }
  // bounds and rasterize
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) if (p.s.k === 'p') for (let i = 0; i < p.s.pts.length; i += 2) { x0 = Math.min(x0, p.s.pts[i]); x1 = Math.max(x1, p.s.pts[i]); y0 = Math.min(y0, p.s.pts[i + 1]); y1 = Math.max(y1, p.s.pts[i + 1]); }
  const pad = 2, ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2 + 1, h = Math.ceil(y1 - y0) + pad * 2 + 1;
  for (const p of parts) if (p.s.k === 'p') for (let i = 0; i < p.s.pts.length; i += 2) { p.s.pts[i] += ox; p.s.pts[i + 1] += oy; }
  return { data: rasterize(parts, w, h).data, w, h, ax: ox, ay: oy };
}
