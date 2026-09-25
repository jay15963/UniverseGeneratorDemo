// Where the cities of a whole planet go: clusters of towns around a few centres, never an even spread.
//
// Every land pixel of the planet map gets a habitability score: mild temperatures and moisture, fertile soil, fresh
// water or a coast nearby and low, flat ground are good; ice, deserts, jungles and high mountains are poor (cities are
// rare there, not forbidden). Cluster centres are drawn from that score, kept apart so civilisations sit on different
// shores and plains; each centre gets a capital and a handful of towns around it, fewer and smaller the further out.
import { mulberry } from '../terrain/noise';
import type { TerrainGenerator } from '../terrain/terrainGen';
import { Ground } from '../terrain/types';

export interface CitySite { tx: number; ty: number; cluster: number; capital: boolean; evo: number }

export interface SiteFields {
  width: number; height: number; seaLevel: number;
  elevation: Float32Array; temperature: Float32Array; moisture: Float32Array; fertility: Float32Array; waterAccumulation: Float32Array;
}

export function pickSites(F: SiteFields, tg: TerrainGenerator, count: number, seed: number): CitySite[] {
  const { width: W, height: H } = F;
  const r = mulberry(seed ^ 0x1f123bb5);
  const STEP = 3;
  const gw = Math.ceil(W / STEP), gh = Math.ceil(H / STEP);
  const score = new Float32Array(gw * gh);
  const sea = tg.hasSea ? tg.sea : F.seaLevel;
  const at = (a: Float32Array, x: number, y: number) => a[Math.max(0, Math.min(H - 1, y)) * W + (((x % W) + W) % W)];
  const land = (x: number, y: number) => !tg.hasSea || at(F.elevation, x, y) > sea;
  let total = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * STEP + 1, y = j * STEP + 1;
    if (y < H * 0.06 || y > H * 0.94 || !land(x, y)) continue;
    const t = at(F.temperature, x, y), m = at(F.moisture, x, y), f = at(F.fertility, x, y), e = at(F.elevation, x, y);
    const alt = (e - sea) / Math.max(0.05, 1 - sea);
    const warm = Math.exp(-(((t - 0.55) / 0.2) ** 2));                 // cold and scorching climates are rare homes
    const wet = Math.max(0.05, 1 - Math.abs(m - 0.5) * 1.6);           // deserts and swamps / rainforests less so
    let water = 0;
    for (let dy = -4; dy <= 4 && water < 1; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
      if (!land(x + dx, y + dy)) { water = 1; break; }                  // a coast or a lake
      if (at(F.waterAccumulation, x + dx, y + dy) > 6) water = Math.max(water, 0.8); // a river
    }
    const high = 1 - Math.min(1, Math.max(0, (alt - 0.25) / 0.4));
    const s = warm * wet * (0.4 + f) * (1 + water * 1.2) * high;
    score[j * gw + i] = s * s;
    total += s * s;
  }
  if (total <= 0) return [];
  const pickWeighted = (w: (k: number) => number) => {
    let sum = 0;
    for (let k = 0; k < score.length; k++) sum += w(k);
    if (sum <= 0) return -1;
    let u = r() * sum;
    for (let k = 0; k < score.length; k++) { u -= w(k); if (u <= 0) return k; }
    return -1;
  };
  const dx = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, gw - d); };
  const dist = (a: number, b: number) => Math.hypot(dx(a % gw, b % gw), ((a / gw) | 0) - ((b / gw) | 0)) * STEP;

  const clusters = Math.max(count >= 6 ? 2 : 1, Math.round(count / 4.5));
  const minCentre = Math.max(60, W / (2.2 * Math.sqrt(clusters)));   // map px between cluster centres
  const minCity = 22;                                                 // map px between two cities (territories)
  const Rc = 55;                                                      // cluster radius (map px)
  const centres: number[] = [];
  for (let tries = 0; centres.length < clusters && tries < clusters * 40; tries++) {
    const k = pickWeighted(q => score[q]);
    if (k < 0) break;
    if (centres.some(c => dist(c, k) < minCentre)) continue;
    centres.push(k);
  }
  const chosen: { k: number; cluster: number; capital: boolean; d: number }[] = [];
  centres.forEach((c, ci) => chosen.push({ k: c, cluster: ci, capital: true, d: 0 }));
  let n = 0;
  for (let tries = 0; chosen.length < count && tries < count * 60; tries++) {
    const ci = n++ % centres.length, c = centres[ci];
    const k = pickWeighted(q => { const d = dist(q, c); return d > Rc ? 0 : score[q] * Math.exp(-((d / (Rc * 0.55)) ** 2)); });
    if (k < 0) continue;
    if (chosen.some(s => dist(s.k, k) < minCity)) continue;
    chosen.push({ k, cluster: ci, capital: false, d: dist(k, c) });
  }
  const out: CitySite[] = [];
  for (const s of chosen) {
    const mx = (s.k % gw) * STEP + 1, my = ((s.k / gw) | 0) * STEP + 1;
    const sp = tg.spawn(mx, my);
    const t = tg.tile(sp.tx, sp.ty);
    if (t.g <= Ground.SWAMP_WATER || t.g === Ground.LAVA) continue;
    // capitals are the big old cities; towns get smaller away from them
    const evo = s.capital ? 70 + r() * 30 : Math.max(10, 70 - (s.d / Rc) * 45 - r() * 20);
    out.push({ tx: sp.tx, ty: sp.ty, cluster: s.cluster, capital: s.capital, evo: Math.round(evo) });
  }
  // capitals first (they claim their land before the towns around them)
  out.sort((a, b) => Number(b.capital) - Number(a.capital));
  return out;
}
