// The evolution of life on a living planet, as one number (0..1) - the planet's "life stage":
//   0.00-0.30  only the seas are alive: the land is bare, dry, rocky and empty
//   0.30-0.60  the first plants creep along the coasts and rivers; amphibians haunt the shores
//   0.60-0.90  vegetation spreads inland; land animals appear (leviathans of the land from 0.8)
//   0.90-1.00  a fully green world
// A planet takes its stage from the editor slider (`lifeStage`), else from its rolled life level. In the play mode the
// aquatic era pushes the same number with the oxygen its life makes. The seas are split by depth percentiles, so every
// ocean has a coastal band (small and normal fauna), an open sea (the big ones) and an abyss (the leviathans).
import type { PlanetConfig } from './generator';
import { mulberry, seedToInt } from '../terrain/noise';

export function lifeStageOf(cfg: PlanetConfig): number {
  if (cfg.lifeStage !== undefined) return Math.max(0, Math.min(1, cfg.lifeStage));
  const lv = cfg.life?.level;
  if (!lv) return 1;                              // editor planets without a life roll: as green as they always were
  const r = mulberry(seedToInt(cfg.seed + ':lifeStage'))();
  switch (lv) {
    case 'none': return 0;
    case 'microbial': return 0.05 + r * 0.2;
    case 'plants': return 0.45 + r * 0.5;
    case 'animal': return 0.35 + r * 0.65;
    default: return 1;
  }
}
export const LIFE_STAGE_PT = (v: number) => (v < 0.3 ? 'Só os mares vivem: terra árida' : v < 0.6 ? 'Vegetação na costa, anfíbios nas margens' : v < 0.9 ? 'A vegetação avança; fauna terrestre' : 'Planeta verde');

/** distances are in reference px of a 2048-wide map (1 ref px = 64 tiles), whatever the map resolution */
export const REF_W = 2048;
/** how far from the water (ref px) vegetation reaches at this stage; < 0 = none */
export function vegReach(v: number): number {
  if (v < 0.3) return -1;
  if (v < 0.6) return 0.6 + ((v - 0.3) / 0.3) * 16;
  if (v < 0.9) return 16.6 + ((v - 0.6) / 0.3) ** 2.5 * 1500;
  return 1e9;
}
/** vegetation cover 0..1 of a land point: distance to water (map px), moisture and a noise for an organic front */
export function vegAmount(v: number, dist: number, moist: number, noise: number): number {
  const R = vegReach(v);
  if (R < 0) return 0;
  if (R > 1e8) return 1;
  const reach = R * (0.55 + moist * 0.9) * (0.7 + noise * 0.6);
  const edge = Math.max(0.6, reach * 0.25);
  return Math.max(0, Math.min(1, (reach - dist) / edge + 0.5));
}
/** are land / shore animals present at this stage (shore ones need the coastal plants) */
export const shoreFauna = (v: number) => v >= 0.3;
export const landFauna = (v: number) => Math.max(0, Math.min(1, (v - 0.6) / 0.3));
export const landLeviathans = (v: number) => v >= 0.8;

/** distance (ref px, see REF_W) from every pixel to the nearest water (sea or river); x wraps */
export function coastDistance(elev: Float32Array, water: Float32Array, W: number, H: number, sea: number): Float32Array {
  const INF = 1e6, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = elev[i] <= sea || water[i] > 2 ? 0 : INF;
  const A = REF_W / W, D = A * 1.4142;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i];
      if (!v) continue;
      const xl = (x - 1 + W) % W, xr = (x + 1) % W;
      v = Math.min(v, d[y * W + xl] + A);
      if (y > 0) v = Math.min(v, d[(y - 1) * W + x] + A, d[(y - 1) * W + xl] + D, d[(y - 1) * W + xr] + D);
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i];
      if (!v) continue;
      const xl = (x - 1 + W) % W, xr = (x + 1) % W;
      v = Math.min(v, d[y * W + xr] + A);
      if (y < H - 1) v = Math.min(v, d[(y + 1) * W + x] + A, d[(y + 1) * W + xl] + D, d[(y + 1) * W + xr] + D);
      d[i] = v;
    }
  }
  return d;
}
/** depth-ratio thresholds [coastal -> open sea, open sea -> abyss] from the planet's own ocean (35% / 80% percentiles) */
export function depthQuantiles(elev: Float32Array, sea: number): [number, number] {
  const vals: number[] = [];
  const step = Math.max(1, Math.floor(elev.length / 200000));
  for (let i = 0; i < elev.length; i += step) if (elev[i] <= sea) vals.push((sea - elev[i]) / Math.max(1e-6, sea));
  if (vals.length < 20) return [0.3, 0.55];
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(vals.length * 0.35)], vals[Math.floor(vals.length * 0.8)]];
}
export enum SeaZone { LAND = 0, COAST = 1, OPEN = 2, ABYSS = 3 }
export const seaZone = (depthRatio: number, q: [number, number]) => (depthRatio < q[0] ? SeaZone.COAST : depthRatio < q[1] ? SeaZone.OPEN : SeaZone.ABYSS);
