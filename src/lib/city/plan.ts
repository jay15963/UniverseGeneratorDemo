// City planner. Runs in the planet session worker (it needs the full-resolution terrain generator).
//
// Everything grows out of one least-cost field: a Dijkstra from the centre over a grid of C-tile cells
// where plains are cheap, forest is expensive to clear, one-level slopes need (costly) ramps, steeper
// ones are impassable, rivers need bridges and the sea stops the city. The cheapest cells to reach
// become the city (in reach order, so a slider from 0 to 100% just reveals more of the same plan),
// the next ones its territory. Roads are least-cost paths of the same field, so they curve around
// woods and climb terraces where it is cheapest; tiles are then graded so roads step at most one
// level at a time (with ramps). Walls ring the old core with octilinear runs (the wall assets only
// have 8 directions): the core never spreads over water, so the ring follows river banks and coasts
// and only turns inland where it has to close.
import type { TerrainGenerator } from '../terrain/terrainGen';
import { Ground, CHUNK } from '../terrain/types';
import { fbm2, hash3, mulberry } from '../terrain/noise';
import { CZ, CityPlan, CityMeta, CityChunkData, isGraded, isRoad } from './codes';
import { makeCulture } from '../structure/genome';
import { PlanetType } from '../planet-generator/generator';
import { placeBuildings } from './build';

const C = 3;                                        // tiles per planning cell
const ERA_F = [0.35, 0.5, 0.65, 0.8, 0.9, 1, 1, 1]; // metropolis size per era
const NU_MAX = 52000;                               // urban cells of a 100% metropolis
const ARTERIES = [3, 4, 4, 6, 6, 8, 8, 8];
const ARTERY_W = [2, 2, 2, 3, 3, 3, 4, 4];
const STREET_W = [1, 1, 2, 2, 2, 2, 2, 3];
const BLOCK = [0, 0, 14, 12, 14, 16, 18, 20];       // grid block pitch (tiles) from the classical era
const GRID_W = [0, 0, 2, 2, 2, 2, 3, 3];
const IND_FRAC = [0.03, 0.05, 0.06, 0.16, 0.18, 0.15, 0.12, 0.1];
const COM_P = [0.2, 0.35, 0.5, 0.6, 0.65, 0.7, 0.7, 0.7];
const OUTPOSTS = [0, 1, 2, 2, 3, 3, 3, 3];
const WALL_STAGE = Math.round(254 * 0.18);
/** longest bridge, in 3-tile cells crossed in a row (a diagonal cell counts twice): ~5-6 tiles, wide rivers yes, seas no */
export const MAX_BRIDGE = 2;

const K_STREET = 2, K_TRACK = 1, K_ARTERY = 3;

const isWaterG = (g: number) => g <= Ground.SWAMP_WATER;
const DIRS8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // clockwise from N

class Heap {
  i = new Int32Array(4096); k = new Float32Array(4096); n = 0;
  push(v: number, key: number) {
    if (this.n === this.i.length) {
      const i2 = new Int32Array(this.n * 2); i2.set(this.i); this.i = i2;
      const k2 = new Float32Array(this.n * 2); k2.set(this.k); this.k = k2;
    }
    let p = this.n++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.k[q] <= key) break;
      this.i[p] = this.i[q]; this.k[p] = this.k[q]; p = q;
    }
    this.i[p] = v; this.k[p] = key;
  }
  pop(): number {
    const top = this.i[0];
    const n = --this.n;
    if (n > 0) {
      const v = this.i[n], key = this.k[n];
      let p = 0;
      for (;;) {
        let c = 2 * p + 1;
        if (c >= n) break;
        if (c + 1 < n && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= key) break;
        this.i[p] = this.i[c]; this.k[p] = this.k[c]; p = c;
      }
      this.i[p] = v; this.k[p] = key;
    }
    return top;
  }
}

export interface PlanInput {
  id: number;
  tx: number; ty: number;
  era: number;
  seed: number;
  name?: string;
  /** Existing cities: their territory can never be taken. */
  others: { meta: CityMeta; territory: Uint8Array }[];
}

/** Which city's territory (index into `others`) holds a tile, or -1. */
export function territoryAt(others: PlanInput['others'], tx: number, ty: number): number {
  for (let q = 0; q < others.length; q++) {
    const m = others[q].meta;
    const i = Math.round((tx - m.ox) / m.c), j = Math.round((ty - m.oy) / m.c);
    if (i < 0 || j < 0 || i >= m.gs || j >= m.gs) continue;
    if (others[q].territory[j * m.gs + i] !== 255) return q;
  }
  return -1;
}

export function planCity(tg: TerrainGenerator, inp: PlanInput): CityPlan {
  const era = Math.max(0, Math.min(7, inp.era | 0));
  const seed = inp.seed >>> 0;
  const rnd = mulberry(seed ^ 0x5bd1e995);
  const NU = Math.round(NU_MAX * ERA_F[era]);
  const NT = Math.round(NU * 2.6);
  const RC = Math.min(300, Math.ceil(Math.sqrt(NT / Math.PI) * 1.35) + 20);
  const GS = RC * 2 + 1, G2 = GS * GS;
  const cx = inp.tx, cy = inp.ty;
  const ox = cx - RC * C, oy = cy - RC * C;           // centre tile of cell (0, 0)

  const held = territoryAt(inp.others, cx, cy);
  if (held >= 0) throw new Error(`Esse lugar já é território de ${inp.others[held].meta.name}.`);
  const t0 = tg.tile(cx, cy);
  if (isWaterG(t0.g) || t0.g === Ground.LAVA) throw new Error('Escolha um ponto em terra firme.');

  // ---------------------------------------------------------------------------------------------
  // Cells: sampled lazily (only what the search reaches)
  // ---------------------------------------------------------------------------------------------
  const gnd = new Uint8Array(G2).fill(255), lv = new Uint8Array(G2), forest = new Uint8Array(G2);
  const fert = new Uint8Array(G2), ore = new Uint8Array(G2), blk = new Uint8Array(G2);
  const mult = new Float32Array(G2);
  const sample = (c: number) => {
    if (gnd[c] !== 255) return;
    const i = c % GS, j = (c / GS) | 0;
    const tx = ox + i * C, ty = oy + j * C;
    const t = tg.tile(tx, ty);
    gnd[c] = t.g; lv[c] = tg.levelOf(t, tx, ty);
    forest[c] = Math.round(Math.max(0, Math.min(1, t.forest)) * 255);
    fert[c] = Math.round(Math.max(0, Math.min(1, t.fert)) * 255);
    ore[c] = Math.round(Math.max(0, Math.min(1, t.ore)) * 255);
    blk[c] = territoryAt(inp.others, tx, ty) >= 0 ? 1 : 0;
    mult[c] = 0.62 + fbm2(tx / 130, ty / 130, seed + 11, 3) * 0.85; // lobes and uneven edges
  };
  const isLand = (c: number) => gnd[c] !== 255 && !isWaterG(gnd[c]) && gnd[c] !== Ground.LAVA;
  const groundCost = (g: number) => {
    switch (g) {
      case Ground.STONE: return 2.5;
      case Ground.MARSH: case Ground.MUD: case Ground.PEAT: return 2.5;
      case Ground.SNOW: case Ground.ICE: return 1.2;
      case Ground.GRAVEL: return 0.8;
      case Ground.SAND: case Ground.RED_SAND: return 0.5;
      default: return 0;
    }
  };
  const waterCost = (g: number) => {
    if (g === Ground.DEEP_WATER) return Infinity;
    if (g === Ground.SWAMP_WATER) return era >= 3 ? 25 : 45;
    return era === 0 ? 30 : 14;                        // bridge (a ford for tribes)
  };

  // ---------------------------------------------------------------------------------------------
  // Least-cost field
  // ---------------------------------------------------------------------------------------------
  const dist = new Float32Array(G2).fill(Infinity);
  const par = new Int32Array(G2).fill(-1);
  const done = new Uint8Array(G2);
  /** water cells crossed in a row on the way here: bridges span rivers, never a whole sea (<= MAX_BRIDGE cells) */
  const wrun = new Uint8Array(G2);
  let order = new Int32Array(65536), nOrder = 0;
  const c0 = RC * GS + RC;
  sample(c0);
  dist[c0] = 0;
  const heap = new Heap();
  heap.push(c0, 0);
  let landSettled = 0;
  while (heap.n && landSettled < NT) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    if (nOrder === order.length) { const o2 = new Int32Array(nOrder * 2); o2.set(order); order = o2; }
    order[nOrder++] = c;
    if (isLand(c)) landSettled++;
    const i = c % GS, j = (c / GS) | 0;
    for (let d = 0; d < 8; d++) {
      const ni = i + DIRS8[d][0], nj = j + DIRS8[d][1];
      if (ni < 0 || nj < 0 || ni >= GS || nj >= GS) continue;
      const n = nj * GS + ni;
      if (done[n]) continue;
      sample(n);
      if (blk[n]) continue;
      const g = gnd[n];
      if (g === Ground.LAVA) continue;
      let base: number;
      if (isWaterG(g)) { base = waterCost(g); if (!isFinite(base)) continue; }
      else base = (1 + (forest[n] / 255) * 6 + groundCost(g)) * mult[n];
      const dl = Math.abs(lv[n] - lv[c]);
      if (dl >= (isWaterG(g) || isWaterG(gnd[c]) ? 4 : 3)) continue;
      const slope = dl === 0 ? 0 : dl === 1 ? 2.5 : 9;   // ramp / cut-and-fill
      const run = isWaterG(g) ? wrun[c] + (d & 1 ? 2 : 1) : 0;
      if (run > MAX_BRIDGE) continue;
      const nd = dist[c] + (base + slope) * (d & 1 ? 1.4142 : 1);
      if (nd < dist[n]) { dist[n] = nd; par[n] = c; wrun[n] = run; heap.push(n, nd); }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Ranks and stages (stage s appears when the evolution slider reaches s / 254)
  // ---------------------------------------------------------------------------------------------
  const landRank = new Int32Array(G2).fill(-1);
  let landCount = 0;
  for (let q = 0; q < nOrder; q++) if (isLand(order[q])) landRank[order[q]] = landCount++;
  const NUe = Math.max(8, Math.min(NU, Math.round(landCount * 0.55)));
  const NTe = Math.max(NUe + 1, landCount);
  const NA = Math.max(20, Math.round(0.01 * NUe));            // administrative quarter (palace / seat of government)
  const NM = NA + Math.round(0.012 * NUe * (era >= 3 ? 2 : 1)); // market ring around it
  const N0 = NA;
  const NP = Math.max(3, Math.round(NA * 0.12));
  const Ncore = Math.round(N0 + (NUe - N0) * Math.pow(0.22, 1.6));
  const urban = (c: number) => landRank[c] >= 0 && landRank[c] < NUe;
  const uStage = (c: number) => {
    const r = landRank[c];
    if (r < 0 || r >= NUe) return 255;
    if (r < N0) return 0;
    return Math.max(1, Math.round(254 * Math.pow((r - N0) / Math.max(1, NUe - N0), 1 / 1.6)));
  };
  const terrStage = new Uint8Array(G2).fill(255);
  let lastLand = 0;
  for (let q = 0; q < nOrder; q++) {
    const c = order[q];
    if (isLand(c)) {
      lastLand = Math.round(254 * Math.pow(landRank[c] / NTe, 1 / 1.3));
      terrStage[c] = Math.min(lastLand, uStage(c));
    } else terrStage[c] = lastLand;
  }

  // ---------------------------------------------------------------------------------------------
  // Road network on the cell tree: every road is a least-cost path to the centre
  // ---------------------------------------------------------------------------------------------
  const edgeStage = new Uint8Array(G2).fill(255), edgeKind = new Uint8Array(G2);
  const mark = (start: number, kind: number, sConst: number) => {
    let c = start;
    while (c !== c0 && par[c] >= 0) {
      let s = kind === K_ARTERY ? terrStage[c] : kind === K_STREET ? uStage(c) : sConst;
      if (urban(c)) {
        if (kind === K_TRACK) break;                 // inside the town its own streets take over
        s = Math.min(s, uStage(c));                  // it shows up with the district it runs through
      }
      if (edgeKind[c] >= kind && edgeStage[c] <= s) break; // the rest of the way is already there
      edgeStage[c] = Math.min(edgeStage[c], s);
      edgeKind[c] = Math.max(edgeKind[c], kind);
      c = par[c];
    }
  };
  const angOf = (c: number) => Math.atan2(((c / GS) | 0) - RC, (c % GS) - RC);
  const radOf = (c: number) => Math.hypot(((c / GS) | 0) - RC, (c % GS) - RC);
  const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

  // arteries out to the edge of the territory
  const K = ARTERIES[era];
  const theta0 = rnd() * Math.PI * 2;
  const artAngles: number[] = [];
  for (let k = 0; k < K; k++) {
    const th = theta0 + (k / K) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI / K) * 0.5;
    let best = -1, bestR = 0;
    for (let q = 0; q < nOrder; q++) {
      const c = order[q];
      if (!isLand(c)) continue;
      const r = radOf(c);
      if (r <= bestR || angDiff(angOf(c), th) > (Math.PI / K) * 0.7) continue;
      best = c; bestR = r;
    }
    if (best >= 0 && bestR > 4) { mark(best, K_ARTERY, 0); artAngles.push(angOf(best)); }
  }
  if (!artAngles.length) artAngles.push(theta0);

  // organic streets: laid out after the tiles exist (see C2)

  // ---------------------------------------------------------------------------------------------
  // Zoning (cells)
  // ---------------------------------------------------------------------------------------------
  const zone = new Uint8Array(G2);
  const zStage = new Uint8Array(G2).fill(255);
  for (let q = 0; q < nOrder; q++) {
    const c = order[q];
    if (!urban(c)) continue;
    const r = landRank[c];
    zone[c] = r < NP ? CZ.PLAZA : r < NA ? CZ.ADMIN : r < NM && era >= 1 ? CZ.COM : CZ.RES;
    zStage[c] = uStage(c);
  }
  const rCore = Math.sqrt(Ncore / Math.PI);
  // military quarter: inside the core, on the side most exposed to land
  {
    let bestD = 0, bestLand = -1;
    for (let d = 0; d < 8; d++) {
      let n = 0;
      for (let r = Math.max(2, Math.round(rCore)); r < rCore * 2.2; r++) {
        const i = RC + Math.round(DIRS8[d][0] * r / (d & 1 ? 1.4142 : 1)), j = RC + Math.round(DIRS8[d][1] * r / (d & 1 ? 1.4142 : 1));
        if (i < 0 || j < 0 || i >= GS || j >= GS) break;
        const c = j * GS + i;
        sample(c);
        if (isLand(c)) n++;
      }
      if (n > bestLand) { bestLand = n; bestD = d; }
    }
    const dir = Math.atan2(DIRS8[bestD][1], DIRS8[bestD][0]);
    // only on the centre's own bank
    const wet = new Uint8Array(G2);
    for (let q = 1; q < nOrder; q++) { const c = order[q]; wet[c] = wet[par[c]] || (isWaterG(gnd[c]) ? 1 : 0); }
    const cand: number[] = [];
    for (let q = 0; q < nOrder; q++) {
      const c = order[q];
      if (wet[c]) continue;
      if (!urban(c) || landRank[c] >= Ncore || landRank[c] < NM || zone[c] !== CZ.RES && zone[c] !== CZ.COM) continue;
      if (angDiff(angOf(c), dir) < 0.6) cand.push(c);
    }
    cand.sort((a, b) => landRank[b] - landRank[a]);
    const want = Math.max(6, Math.round(Ncore * 0.05));
    // one compact quarter grown from a cell in the outer part of the wedge
    if (cand.length) {
      const isCand = new Set(cand);
      const seedC = cand[Math.floor(cand.length * 0.25)];
      const q = [seedC];
      zone[seedC] = CZ.MIL;
      for (let h = 0, n = 1; h < q.length && n < want; h++) {
        const u = q[h], ui = u % GS, uj = (u / GS) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const v = (uj + dj) * GS + ui + di;
          if (!isCand.has(v) || zone[v] === CZ.MIL) continue;
          zone[v] = CZ.MIL; q.push(v);
          if (++n >= want) break;
        }
      }
    }
  }
  // commercial strips along the arteries (blobby so they read as districts, not noise)
  for (let q = 0; q < nOrder; q++) {
    const c = order[q];
    if (zone[c] !== CZ.RES) continue;
    const i = c % GS, j = (c / GS) | 0;
    let near = false;
    const R = era >= 3 ? 2 : 1;
    for (let dj = -R; dj <= R && !near; dj++) for (let di = -R; di <= R; di++) {
      const n = (j + dj) * GS + i + di;
      if (edgeKind[n] === K_ARTERY) { near = true; break; }
    }
    if (!near) continue;
    const bl = fbm2((ox + i * C) / 40, (oy + j * C) / 40, seed + 21, 2);
    if (bl > 1 - COM_P[era] * 0.9) zone[c] = CZ.COM;
  }
  // neighbourhood centres out in the newer districts
  if (era >= 3) {
    const subs = 2 + Math.floor(rnd() * 4);
    const art: number[] = [];
    for (let q = 0; q < nOrder; q++) { const c = order[q]; if (edgeKind[c] === K_ARTERY && urban(c) && landRank[c] > NUe * 0.35 && landRank[c] < NUe * 0.85) art.push(c); }
    for (let s = 0; s < subs && art.length; s++) {
      const c = art[Math.floor(rnd() * art.length)];
      const i = c % GS, j = (c / GS) | 0, R = 3 + Math.floor(rnd() * 3);
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        if (di * di + dj * dj > R * R) continue;
        const n = (j + dj) * GS + i + di;
        if (zone[n] === CZ.RES) zone[n] = CZ.COM;
      }
    }
  }
  // industry: by the water, flat, on the outskirts, in blobs
  {
    const cand: [number, number][] = [];
    for (let q = 0; q < nOrder; q++) {
      const c = order[q];
      if (zone[c] !== CZ.RES || landRank[c] < Ncore) continue;
      const i = c % GS, j = (c / GS) | 0;
      let water = 0, rough = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= GS || jj >= GS) continue;
        const n = jj * GS + ii;
        if (gnd[n] === 255) continue;
        if (isWaterG(gnd[n])) water = 1;
        else if (Math.abs(di) <= 1 && Math.abs(dj) <= 1) rough += Math.abs(lv[n] - lv[c]);
      }
      const score = water * 0.5 + Math.max(0, 0.3 - rough * 0.06) + (landRank[c] / NUe) * 0.6 +
        fbm2((ox + i * C) / 55, (oy + j * C) / 55, seed + 23, 3) * 1.1;
      cand.push([c, score]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    // compact districts grown from the best spots (factories need whole blocks, not strips)
    const want = Math.round(NUe * IND_FRAC[era]);
    const per = Math.max(40, Math.min(600, Math.round(want / 3)));
    const seeds: number[] = [];
    let got = 0;
    for (const [c] of cand) {
      if (got >= want) break;
      if (zone[c] !== CZ.RES) continue;
      const i = c % GS, j = (c / GS) | 0;
      if (seeds.some(s0 => Math.hypot((s0 % GS) - i, ((s0 / GS) | 0) - j) < 25)) continue;
      seeds.push(c);
      const q = [c];
      zone[c] = CZ.IND; got++;
      for (let h = 0, n = 1; h < q.length && n < per && got < want; h++) {
        const u = q[h], ui = u % GS, uj = (u / GS) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const v = (uj + dj) * GS + ui + di;
          if (zone[v] !== CZ.RES || landRank[v] < Ncore) continue;
          zone[v] = CZ.IND; q.push(v); n++; got++;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Specialised fields out in the territory (purple) and military outposts (red)
  // ---------------------------------------------------------------------------------------------
  const field = new Uint8Array(G2);
  const fStage = new Uint8Array(G2).fill(255);
  const ring = (c: number) => landRank[c] >= NUe && landRank[c] < NTe && !blk[c];
  const waterNear = (c: number) => {
    const i = c % GS, j = (c / GS) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= GS || jj >= GS) continue;
      const g = gnd[jj * GS + ii];
      if (g !== 255 && isWaterG(g) && g !== Ground.DEEP_WATER) return true;
      if (g === Ground.DEEP_WATER) return true;
    }
    return false;
  };
  const slopeAt = (c: number) => {
    const i = c % GS, j = (c / GS) | 0;
    let s = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (j + dj) * GS + i + di;
      if (gnd[n] !== 255 && !isWaterG(gnd[n])) s += Math.abs(lv[n] - lv[c]);
    }
    return s;
  };
  const FIELD_TYPES = [CZ.FARM, CZ.PASTURE, CZ.LUMBER, CZ.MINE, CZ.QUARRY, CZ.FISH];
  const suit = (c: number, type: number): number => {
    const g = gnd[c], f = forest[c] / 255, fe = fert[c] / 255, o = ore[c] / 255, L = lv[c], sl = slopeAt(c);
    const grassy = g === Ground.GRASS || g === Ground.LUSH_GRASS || g === Ground.DRY_GRASS || g === Ground.DIRT || g === Ground.TUNDRA || g === Ground.CLAY || g === Ground.BLUE_CLAY;
    switch (type) {
      case CZ.FARM: return grassy && g !== Ground.TUNDRA ? fe * 1.1 + 0.25 - f * 0.9 - sl * 0.12 : 0;
      case CZ.PASTURE: return grassy ? 0.45 + (1 - f) * 0.2 - sl * 0.08 : 0;
      case CZ.LUMBER: return f >= 0.45 ? 0.3 + f * 0.6 : 0;
      case CZ.MINE: return o * 1.4 + (g === Ground.STONE || g === Ground.GRAVEL ? 0.25 : 0) + Math.min(L, 10) * 0.02 - 0.15;
      case CZ.QUARRY: return era < 1 ? 0 : g === Ground.STONE ? 0.55 + Math.min(L, 10) * 0.03 : g === Ground.GRAVEL ? 0.3 : 0;
      case CZ.FISH: return waterNear(c) ? 0.72 : 0;
      default: return 0;
    }
  };
  const SIZE: Record<number, [number, number]> = {
    [CZ.FARM]: [40, 140], [CZ.PASTURE]: [40, 110], [CZ.LUMBER]: [30, 90], [CZ.MINE]: [9, 25], [CZ.QUARRY]: [9, 20], [CZ.FISH]: [4, 12],
  };
  const trackStage = (s: number) => s;
  {
    const cand: number[] = [];
    for (let q = 0; q < nOrder; q++) if (ring(order[q])) cand.push(order[q]);
    cand.sort((a, b) => hash3(a, 3, seed) - hash3(b, 3, seed));
    const seeds: number[] = [];
    const maxSeeds = Math.round(NTe / 700);
    for (const c of cand) {
      if (seeds.length >= maxSeeds) break;
      if (field[c]) continue;
      // farmland crowds around the town and thins out towards the border
      const far = (landRank[c] - NUe) / Math.max(1, NTe - NUe);
      if (rnd() < far * 0.75) continue;
      const i = c % GS, j = (c / GS) | 0;
      let clash = false;
      for (const s of seeds) if (Math.max(Math.abs((s % GS) - i), Math.abs(((s / GS) | 0) - j)) < 8) { clash = true; break; }
      if (clash) continue;
      let bt = 0, bs = 0;
      for (const t of FIELD_TYPES) { const v = suit(c, t) * (0.75 + rnd() * 0.5); if (v > bs) { bs = v; bt = t; } }
      if (bs < 0.3) continue;
      seeds.push(c);
      const s0 = suit(c, bt);
      const [a, b] = SIZE[bt];
      const target = Math.round((a + rnd() * (b - a)) * (1 + era * 0.08));
      const st = terrStage[c];
      // a rectangle of plots (or a strip along the shore), clipped to suitable ground
      const asp = 0.5 + rnd() * 1.5;
      const hw = Math.max(1, Math.round(Math.sqrt(target * asp) / 2)), hh = Math.max(1, Math.round(Math.sqrt(target / asp) / 2));
      for (let dj = -hh; dj <= hh; dj++) for (let di = -hw; di <= hw; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= GS || jj >= GS) continue;
        const v = jj * GS + ii;
        if (field[v] || !ring(v) || suit(v, bt) < s0 * 0.55) continue;
        field[v] = bt; fStage[v] = st;
      }
      mark(c, K_TRACK, trackStage(st));
    }
    // outposts on high ground near the border
    const nOut = OUTPOSTS[era];
    if (nOut) {
      const oc: number[] = [];
      for (const c of cand) {
        if (landRank[c] < NTe * 0.6 || field[c]) continue;
        const i = c % GS, j = (c / GS) | 0;
        let top = true;
        for (let dj = -3; dj <= 3 && top; dj++) for (let di = -3; di <= 3; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= GS || jj >= GS) continue;
          const v = jj * GS + ii;
          if (gnd[v] !== 255 && lv[v] > lv[c]) { top = false; break; }
        }
        if (top) oc.push(c);
      }
      oc.sort((a, b) => lv[b] - lv[a] || hash3(a, 5, seed) - hash3(b, 5, seed));
      const got: number[] = [];
      for (const c of oc) {
        if (got.length >= nOut) break;
        const i = c % GS, j = (c / GS) | 0;
        if (got.some(s => Math.hypot((s % GS) - i, ((s / GS) | 0) - j) < 30)) continue;
        got.push(c);
        const st = terrStage[c];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const v = (j + dj) * GS + i + di;
          if (ring(v) && isLand(v)) { field[v] = CZ.OUTPOST; fStage[v] = st; }
        }
        mark(c, K_TRACK, st);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------------------------------------------
  const TG = GS * C, TN = TG * TG;
  const T0x = ox - 1, T0y = oy - 1;                   // local tile (0, 0)
  const code = new Uint8Array(TN), stage = new Uint8Array(TN).fill(255);
  const tLv = new Uint8Array(TN).fill(255), tG = new Uint8Array(TN);
  const info = (k: number) => {
    if (tLv[k] === 255) {
      const tx = T0x + (k % TG), ty = T0y + ((k / TG) | 0);
      const t = tg.tile(tx, ty);
      tG[k] = t.g; tLv[k] = tg.levelOf(t, tx, ty);
    }
  };
  const waterT = (k: number) => { info(k); return isWaterG(tG[k]) || tG[k] === Ground.LAVA; };

  // A: districts and fields fill their cells
  for (let q = 0; q < nOrder; q++) {
    const c = order[q];
    const z = zone[c] || field[c];
    if (!z) continue;
    const s = zone[c] ? zStage[c] : fStage[c];
    const i = c % GS, j = (c / GS) | 0;
    for (let dy = 0; dy < C; dy++) for (let dx = 0; dx < C; dx++) {
      const k = (j * C + dy) * TG + i * C + dx;
      code[k] = z; stage[k] = s;
    }
  }

  const PRI: Record<number, number> = { [CZ.TRACK]: 1, [CZ.ROAD]: 2, [CZ.BRIDGE]: 3, [CZ.ARTERY]: 4, [CZ.PLAZA]: 5 };
  const putRoad = (lx: number, ly: number, cz: number, s: number) => {
    if (lx < 0 || ly < 0 || lx >= TG || ly >= TG) return;
    const k = ly * TG + lx;
    const cur = code[k];
    if (waterT(k)) {
      if (tG[k] === Ground.LAVA || tG[k] === Ground.DEEP_WATER) return;
      cz = CZ.BRIDGE;
    }
    const pc = PRI[cur] ?? 0, pn = PRI[cz] ?? 0;
    if (pc >= pn && pc) { stage[k] = Math.min(stage[k], s); return; }
    code[k] = cz;
    stage[k] = Math.min(s, stage[k]);
  };

  // B: street grid in the newer districts (classical era on), aligned with the nearest artery
  if (era >= 2) {
    const B = BLOCK[era], W = GRID_W[era];
    const frames = artAngles.map((a, n) => {
      const m = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      return { a, diag: Math.abs(m - Math.PI / 4) < Math.PI / 8, u0: hash3(n, 1, seed) % 64, v0: hash3(n, 2, seed) % 64 };
    });
    const Bd = Math.round(B * 1.4142), Wd = W + 1;
    const mod = (a: number, m: number) => ((a % m) + m) % m;
    for (let q = 0; q < nOrder; q++) {
      const c = order[q];
      if (!urban(c) || landRank[c] < Ncore || zone[c] === CZ.ADMIN || zone[c] === CZ.PLAZA) continue;
      const a = angOf(c);
      let f = frames[0], bd = 9;
      for (const fr of frames) { const d = angDiff(a, fr.a); if (d < bd) { bd = d; f = fr; } }
      const i = c % GS, j = (c / GS) | 0, s = zStage[c];
      for (let dy = 0; dy < C; dy++) for (let dx = 0; dx < C; dx++) {
        const lx = i * C + dx, ly = j * C + dy;
        const gx = T0x + lx - cx, gy = T0y + ly - cy;
        // industrial and military yards get blocks twice as big (factories, depots and drill grounds need room)
        const m2 = zone[c] === CZ.IND || zone[c] === CZ.MIL ? 2 : 1;
        const on = f.diag
          ? mod(gx + gy + f.u0, Bd * m2) < Wd || mod(gy - gx + f.v0, Bd * m2) < Wd
          : mod(gx + f.u0, B * m2) < W || mod(gy + f.v0, B * m2) < W;
        if (!on) continue;
        const k = ly * TG + lx;
        if (waterT(k)) continue;
        let cliff = false;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = lx + ddx, ny = ly + ddy;
          if (nx < 0 || ny < 0 || nx >= TG || ny >= TG) continue;
          const n = ny * TG + nx;
          info(n);
          if (!isWaterG(tG[n]) && Math.abs(tLv[n] - tLv[k]) >= 2) { cliff = true; break; }
        }
        if (!cliff) putRoad(lx, ly, CZ.ROAD, s);
      }
    }
  }

  // C: the road tree, cell centre to cell centre
  for (let q = 0; q < nOrder; q++) {
    const c = order[q];
    if (edgeStage[c] === 255 || par[c] < 0) continue;
    const kind = edgeKind[c], s = edgeStage[c];
    const cz = kind === K_ARTERY ? CZ.ARTERY : kind === K_STREET ? CZ.ROAD : era >= 3 ? CZ.ROAD : CZ.TRACK;
    const w = kind === K_ARTERY ? ARTERY_W[era] : kind === K_STREET ? STREET_W[era] : 1;
    const p = par[c];
    let x0 = (c % GS) * C + 1, y0 = ((c / GS) | 0) * C + 1;
    const x1 = (p % GS) * C + 1, y1 = ((p / GS) | 0) * C + 1;
    const lo = -((w - 1) >> 1), hi = lo + w - 1;
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (;;) {
      for (let by = lo; by <= hi; by++) for (let bx = lo; bx <= hi; bx++) putRoad(x0 + bx, y0 + by, cz, s);
      if (x0 === x1 && y0 === y1) break;
      if (x0 !== x1) x0 += sx;
      if (y0 !== y1) y0 += sy;
    }
  }

  // C2: organic lanes - an irregular mesh between scattered points (old core; whole towns before the classical era)
  {
    const sp = era === 1 ? 4 : 5;                     // cells between lane crossings
    const limit = era >= 2 ? Ncore : NUe;
    const occ = new Uint8Array(G2);
    const pts: { c: number; x: number; y: number; s: number; ang: number[] }[] = [];
    for (let q = 0; q < nOrder; q++) {
      const c = order[q];
      if (!urban(c) || landRank[c] >= limit || occ[c]) continue;
      if (q > 0 && hash3(c, 7, seed) % 100 < 30) continue;
      const i = c % GS, j = (c / GS) | 0;
      const jit = (n: number) => (hash3(c, n, seed) % 3) - 1;
      pts.push({ c, x: i * C + 1 + (q ? jit(8) : 0), y: j * C + 1 + (q ? jit(9) : 0), s: uStage(c), ang: [] });
      const spr = zone[c] === CZ.IND || zone[c] === CZ.MIL ? sp * 2 : sp;   // bigger yards
      for (let dj = -spr + 1; dj < spr; dj++) for (let di = -spr + 1; di < spr; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < GS && jj < GS) occ[jj * GS + ii] = 1;
      }
    }
    const bucket = new Map<number, number[]>();
    const BK = sp * C * 2;
    const bkey = (x: number, y: number) => Math.floor(x / BK) * 100000 + Math.floor(y / BK);
    pts.forEach((p, n) => { const k = bkey(p.x, p.y); const b = bucket.get(k); if (b) b.push(n); else bucket.set(k, [n]); });
    const w = STREET_W[era];
    const lo = -((w - 1) >> 1), hi = lo + w - 1;
    const line = (x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => boolean) => {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) {
        if (!fn(x0, y0)) return false;
        if (x0 === x1 && y0 === y1) return true;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    };
    const done2 = new Set<number>();
    const maxD = sp * C * 2.3;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[n];
      const near: [number, number][] = [];
      const bx = Math.floor(p.x / BK), by = Math.floor(p.y / BK);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        for (const m of bucket.get((bx + di) * 100000 + by + dj) ?? []) {
          if (m === n) continue;
          const d = Math.hypot(pts[m].x - p.x, pts[m].y - p.y);
          if (d <= maxD) near.push([m, d]);
        }
      }
      near.sort((a, b) => a[1] - b[1]);
      let links = 0;
      for (const [m, d] of near) {
        if (links >= 3) break;
        const key = Math.min(n, m) * 1000003 + Math.max(n, m);
        if (done2.has(key)) { links++; continue; }
        const q = pts[m];
        const a1 = Math.atan2(q.y - p.y, q.x - p.x), a2 = a1 + Math.PI;
        if (p.ang.some(a => angDiff(a, a1) < 0.95) || q.ang.some(a => angDiff(a, a2) < 0.95)) continue;
        // lanes do not cross water or climb more than one level between neighbouring tiles
        let prev = -1, ok = true;
        line(p.x, p.y, q.x, q.y, (x, y) => {
          const k = y * TG + x;
          if (waterT(k)) { ok = false; return false; }
          if (prev >= 0 && Math.abs(tLv[k] - tLv[prev]) >= 2) { ok = false; return false; }
          prev = k;
          return true;
        });
        if (!ok || d < 2) continue;
        done2.add(key);
        p.ang.push(a1); q.ang.push(a2);
        links++;
        const s = Math.max(p.s, q.s);
        line(p.x, p.y, q.x, q.y, (x, y) => {
          for (let by2 = lo; by2 <= hi; by2++) for (let bx2 = lo; bx2 <= hi; bx2++) putRoad(x + bx2, y + by2, CZ.ROAD, s);
          return true;
        });
      }
    }
  }

  // D: walls around the old core, towers, gates
  const walls: [number, number][][] = [], towers: [number, number][] = [], gates: [number, number][] = [];
  buildWalls();

  // E: grading - neighbouring road tiles differ by at most one level; one-level steps become ramps
  const lvl = new Uint8Array(TN).fill(255), rd = new Uint8Array(TN);
  {
    const list: number[] = [];
    for (let k = 0; k < TN; k++) if (isGraded(code[k])) { info(k); list.push(k); }
    const L = new Map<number, number>();
    for (const k of list) L.set(k, tLv[k]);
    const nb = (k: number, d: number) => {
      const x = k % TG, y = (k / TG) | 0;
      const nx = x + (d === 2 ? 1 : d === 3 ? -1 : 0), ny = y + (d === 0 ? 1 : d === 1 ? -1 : 0);
      return nx < 0 || ny < 0 || nx >= TG || ny >= TG ? -1 : ny * TG + nx;
    };
    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (const k of list) {
        const a = L.get(k)!;
        for (let d = 0; d < 4; d++) {
          const n = nb(k, d);
          if (n < 0) continue;
          const b = L.get(n);
          if (b === undefined) continue;
          if (a - b >= 2) { L.set(k, b + 1); changed = true; break; }
        }
      }
      if (!changed) break;
    }
    for (const k of list) {
      const a = L.get(k)!;
      if (a !== tLv[k]) lvl[k] = a;
      if (code[k] === CZ.GATE) continue;
      // ramp towards the neighbour road one level down: S, E, W, N (same preference as the terrain)
      for (const [d, r] of [[0, 1], [2, 3], [3, 4], [1, 2]]) {
        const n = nb(k, d);
        if (n >= 0 && L.get(n) === a - 1) { rd[k] = r; break; }
      }
    }
  }

  // E2: the city's culture and its buildings
  // water around the site (fixed disc, so the culture does not depend on the era)
  let wetCells = 0, siteCells = 0;
  for (let dj = -30; dj <= 30; dj += 2) for (let di = -30; di <= 30; di += 2) {
    if (di * di + dj * dj > 900) continue;
    const c = (RC + dj) * GS + RC + di;
    sample(c); siteCells++;
    if (isWaterG(gnd[c])) wetCells++;
  }
  const cfg = tg.gen.config;
  const alien = cfg.planetType === PlanetType.ALIEN_LIFE;
  // its own random stream: the same city keeps the same architecture in every era
  const cr = mulberry(seed ^ 0x2c1b3c6d);
  const culture = makeCulture(`city:${seed}`, {
    gravity: Math.max(0, Math.min(1, (cfg.planetSize ?? 1) / 3)),
    temperature: Math.max(0, Math.min(1, t0.temp)),
    water: Math.max(0, Math.min(1, 0.3 + (wetCells / siteCells) * 1.5)),
    exotic: alien ? 0.55 + cr() * 0.3 : 0.1 + cr() * 0.3,
    wealth: 0.35 + cr() * 0.35,
    star: 0.55,
  }, alien ? 'alien' : 'earth');
  const buildings = placeBuildings({
    era, seed, culture, TG, T0x, T0y, code, stage, lvl,
    level: k => { if (lvl[k] !== 255) return lvl[k]; info(k); return tLv[k]; },
    water: k => waterT(k),
    towers, wallStage: WALL_STAGE,
    blocked: (tx, ty) => inp.others.length > 0 && territoryAt(inp.others, tx, ty) >= 0,
  });

  // F: cut into chunks
  const chunks: Record<string, CityChunkData> = {};
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let ly = 0; ly < TG; ly++) for (let lx = 0; lx < TG; lx++) {
    const k = ly * TG + lx;
    if (!code[k] || stage[k] === 255) continue;
    const tx = T0x + lx, ty = T0y + ly;
    if (inp.others.length && territoryAt(inp.others, tx, ty) >= 0) continue; // never paint on a neighbour's land
    const ccx = Math.floor(tx / CHUNK), ccy = Math.floor(ty / CHUNK);
    const key = `${ccx},${ccy}`;
    let ch = chunks[key];
    if (!ch) {
      const n = CHUNK * CHUNK;
      ch = chunks[key] = { code: new Uint8Array(n), stage: new Uint8Array(n).fill(255), lvl: new Uint8Array(n).fill(255), rd: new Uint8Array(n) };
    }
    const q = (ty - ccy * CHUNK) * CHUNK + tx - ccx * CHUNK;
    ch.code[q] = code[k]; ch.stage[q] = stage[k]; ch.lvl[q] = lvl[k]; ch.rd[q] = isGraded(code[k]) ? rd[k] : 0;
    if (tx < bx0) bx0 = tx; if (tx > bx1) bx1 = tx; if (ty < by0) by0 = ty; if (ty > by1) by1 = ty;
  }

  const territory = new Uint8Array(G2).fill(255);
  for (let q = 0; q < nOrder; q++) territory[order[q]] = terrStage[order[q]];

  const water = (() => { for (let q = 0; q < Math.min(nOrder, NUe); q++) if (isWaterG(gnd[order[q]])) return true; return false; })();
  const meta: CityMeta = {
    id: inp.id, name: inp.name ?? cityName(seed, water, lv[c0]), era, seed,
    tx: cx, ty: cy, gs: GS, c: C, ox, oy,
    bbox: { tx0: bx0, ty0: by0, tx1: bx1, ty1: by1 },
    walls, towers, gates, culture,
  };
  return { meta, territory, chunks, buildings };

  // -----------------------------------------------------------------------------------------------
  function buildWalls() {
    const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < GS && j < GS;
    let M = new Uint8Array(G2);
    for (let q = 0; q < nOrder; q++) { const c = order[q]; if (urban(c) && landRank[c] < Ncore) M[c] = 1; }
    const dilate = (src: Uint8Array, r: number) => {
      const tmp = new Uint8Array(G2), out = new Uint8Array(G2);
      for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) { const ii = i + d; if (ii >= 0 && ii < GS && src[j * GS + ii]) v = 1; }
        tmp[j * GS + i] = v;
      }
      for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) { const jj = j + d; if (jj >= 0 && jj < GS && tmp[jj * GS + i]) v = 1; }
        out[j * GS + i] = v;
      }
      return out;
    };
    const inv = (a: Uint8Array) => { const o = new Uint8Array(G2); for (let k = 0; k < G2; k++) o[k] = a[k] ? 0 : 1; return o; };
    // close gaps, then keep land only (the ring hugs rivers and coasts instead of crossing them)
    M = inv(dilate(inv(dilate(M, 3)), 3));
    // creeks run under the wall; wide rivers, lakes and the sea stay outside so the ring follows their banks
    const drop: number[] = [];
    for (let k = 0; k < G2; k++) {
      if (!M[k] || isLand(k)) continue;
      if (gnd[k] === 255 || gnd[k] === Ground.DEEP_WATER || gnd[k] === Ground.LAVA) { drop.push(k); continue; }
      const i = k % GS, j = (k / GS) | 0;
      let bank = false;
      for (const [di, dj] of DIRS8) { const ii = i + di, jj = j + dj; if (inGrid(ii, jj) && isLand(jj * GS + ii)) { bank = true; break; } }
      if (!bank) drop.push(k);
    }
    for (const k of drop) M[k] = 0;
    // a water cell whose whole neighbourhood is water was dropped: strip the bank-hugging rest of that body too
    for (let pass = 0; pass < 2; pass++) {
      const more: number[] = [];
      for (let k = 0; k < G2; k++) {
        if (!M[k] || isLand(k)) continue;
        const i = k % GS, j = (k / GS) | 0;
        for (const [di, dj] of DIRS8) { const ii = i + di, jj = j + dj; if (inGrid(ii, jj) && !M[jj * GS + ii] && !isLand(jj * GS + ii) && gnd[jj * GS + ii] !== 255) { more.push(k); break; } }
      }
      for (const k of more) M[k] = 0;
    }
    // fill holes (lakes and parks inside stay inside)
    const out = new Uint8Array(G2);
    const stack: number[] = [];
    for (let k = 0; k < GS; k++) for (const c of [k, (GS - 1) * GS + k, k * GS, k * GS + GS - 1]) if (!M[c] && !out[c]) { out[c] = 1; stack.push(c); }
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % GS, j = (c / GS) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (!inGrid(ii, jj)) continue;
        const n = jj * GS + ii;
        if (!M[n] && !out[n]) { out[n] = 1; stack.push(n); }
      }
    }
    for (let k = 0; k < G2; k++) M[k] = out[k] ? 0 : 1;
    // one cell outwards onto land: the wall stands just outside the old town
    const D1 = dilate(M, 1);
    for (let k = 0; k < G2; k++) if (D1[k] && !M[k] && isLand(k)) M[k] = 2;
    // components
    const lab = new Int32Array(G2);
    const sizes: number[] = [0];
    let total = 0;
    for (let k = 0; k < G2; k++) {
      if (!M[k] || lab[k]) continue;
      const id = sizes.length;
      let n = 0;
      lab[k] = id; stack.push(k);
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const i = c % GS, j = (c / GS) | 0;
        for (const [di, dj] of DIRS8) {
          const ii = i + di, jj = j + dj;
          if (!inGrid(ii, jj)) continue;
          const v = jj * GS + ii;
          if (M[v] && !lab[v]) { lab[v] = id; stack.push(v); }
        }
      }
      sizes.push(n); total += n;
    }
    const centreX = RC * C + 1, centreY = RC * C + 1;
    const spacing = era === 0 ? 16 : 12;
    for (let id = 1; id < sizes.length; id++) {
      if (sizes[id] < Math.max(20, total * 0.12)) continue;
      const ring = trace(lab, id);
      if (ring.length < 8) continue;
      const simp = simplifyClosed(ring, 2.2);
      // cell -> local tile coords, then octilinear
      const pts = simp.map(([i, j]) => [i * C + 1, j * C + 1] as [number, number]);
      const oct: [number, number][] = [];
      for (let q = 0; q < pts.length; q++) {
        const A = pts[q], Bp = pts[(q + 1) % pts.length];
        oct.push(A);
        const dx = Bp[0] - A[0], dy = Bp[1] - A[1];
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (!ax || !ay || ax === ay) continue;
        const sx = Math.sign(dx), sy = Math.sign(dy), d = Math.min(ax, ay);
        const P1: [number, number] = [A[0] + sx * d, A[1] + sy * d];          // diagonal first
        const P2: [number, number] = [Bp[0] - sx * d, Bp[1] - sy * d];        // straight first
        const far = (P: [number, number]) => Math.hypot(P[0] - centreX, P[1] - centreY);
        const ok = (P: [number, number]) => { const k = P[1] * TG + P[0]; return P[0] >= 0 && P[1] >= 0 && P[0] < TG && P[1] < TG && !waterT(k); };
        let P = far(P1) >= far(P2) ? P1 : P2;
        if (!ok(P)) P = P === P1 ? P2 : P1;
        oct.push(P);
      }
      // drop repeats and collinear points
      const ringPts: [number, number][] = [];
      for (const p of oct) { const l = ringPts[ringPts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) ringPts.push(p); }
      for (let changed = true; changed && ringPts.length > 3;) {
        changed = false;
        for (let q = 0; q < ringPts.length; q++) {
          const a = ringPts[(q + ringPts.length - 1) % ringPts.length], b = ringPts[q], c = ringPts[(q + 1) % ringPts.length];
          const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
          if ((d1[0] === d2[0] && d1[1] === d2[1]) || (a[0] === b[0] && a[1] === b[1])) { ringPts.splice(q, 1); changed = true; break; }
        }
      }
      walls.push(ringPts.map(([x, y]) => [T0x + x, T0y + y]));
      // rasterize: 8 directions only; diagonals get a staircase so the wall stays closed
      // the ring's tiles in order (stepped inwards where the line crosses water)
      const seq: number[] = [];
      const put = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= TG || y >= TG) return;
        let k = y * TG + x;
        if (waterT(k)) {
          const sx = Math.sign(centreX - x), sy = Math.sign(centreY - y);
          let found = -1;
          // (the simplified ring may cut a few tiles into a bay: walk back to the bank)
          for (let s = 1; s <= 9; s++) {
            const nx = x + sx * s, ny = y + sy * s;
            if (nx < 0 || ny < 0 || nx >= TG || ny >= TG) break;
            const n = ny * TG + nx;
            if (!waterT(n)) { found = n; break; }
          }
          if (found < 0) return;
          k = found;
        }
        if (seq[seq.length - 1] !== k) seq.push(k);
      };
      const towerAt: [number, number][] = [];
      for (let q = 0; q < ringPts.length; q++) {
        const A = ringPts[q], Bp = ringPts[(q + 1) % ringPts.length];
        const sx = Math.sign(Bp[0] - A[0]), sy = Math.sign(Bp[1] - A[1]);
        const n = Math.max(Math.abs(Bp[0] - A[0]), Math.abs(Bp[1] - A[1]));
        towerAt.push(A);
        const every = Math.max(4, Math.round(n / Math.max(1, Math.round(n / spacing))));
        // straight runs are two tiles thick after the palisade era (the extra row goes outside)
        let ox2 = -sy, oy2 = sx;
        if (ox2 * (A[0] - centreX) + oy2 * (A[1] - centreY) < 0) { ox2 = -ox2; oy2 = -oy2; }
        for (let s = 0; s < n; s++) {
          const x = A[0] + sx * s, y = A[1] + sy * s;
          put(x, y);
          if (sx && sy) put(x + sx, y);
          else if (era > 0) put(x + ox2, y + oy2);
          if (s > 0 && s % every === 0 && n - s > 3) towerAt.push([x, y]);
        }
      }
      // gates where an artery crosses the ring; where the ring runs along an artery the wall wins
      const maxGate = ARTERY_W[era] * 2 + 2;
      for (let q = 0; q < seq.length;) {
        if (code[seq[q]] !== CZ.ARTERY) {
          const k = seq[q++];
          if (code[k] === CZ.BRIDGE || code[k] === CZ.TOWER || code[k] === CZ.GATE) continue;
          code[k] = CZ.WALL; stage[k] = WALL_STAGE;
          continue;
        }
        let e = q;
        while (e < seq.length && code[seq[e]] === CZ.ARTERY) e++;
        const gate = e - q <= maxGate;
        for (let r = q; r < e; r++) {
          const k = seq[r];
          code[k] = gate ? CZ.GATE : CZ.WALL;
          stage[k] = gate ? Math.min(stage[k], WALL_STAGE) : WALL_STAGE;
        }
        if (gate) gates.push([T0x + (seq[(q + e) >> 1] % TG), T0y + ((seq[(q + e) >> 1] / TG) | 0)]);
        q = e;
      }
      for (const [x, y] of towerAt) {
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= TG || ny >= TG) { clear = false; break; }
          const c = code[ny * TG + nx];
          if (c === CZ.ARTERY || c === CZ.GATE || c === CZ.BRIDGE) { clear = false; break; }
        }
        if (!clear) continue;
        let placed = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = (y + dy) * TG + x + dx;
          if (waterT(k)) continue;
          code[k] = CZ.TOWER; stage[k] = WALL_STAGE; placed = true;
        }
        if (placed) towers.push([T0x + x, T0y + y]);
      }
    }
  }

  /** Moore-neighbour trace of the outer boundary of component `id`. */
  function trace(lab: Int32Array, id: number): [number, number][] {
    let start = -1;
    for (let k = 0; k < G2; k++) if (lab[k] === id) { start = k; break; }
    const inM = (i: number, j: number) => i >= 0 && j >= 0 && i < GS && j < GS && lab[j * GS + i] === id;
    const sx = start % GS, sy = (start / GS) | 0;
    const pts: [number, number][] = [[sx, sy]];
    let bx = sx, by = sy, cbx = sx - 1, cby = sy;
    const firstBack: [number, number] = [cbx, cby];
    for (let iter = 0; iter < G2 * 4; iter++) {
      const k0 = DIRS8.findIndex(([dx, dy]) => dx === cbx - bx && dy === cby - by);
      let found = false, px = cbx, py = cby;
      for (let q = 1; q <= 8; q++) {
        const [dx, dy] = DIRS8[(k0 + q) % 8];
        const nx = bx + dx, ny = by + dy;
        if (inM(nx, ny)) { cbx = px; cby = py; bx = nx; by = ny; found = true; break; }
        px = nx; py = ny;
      }
      if (!found) break;
      if (bx === sx && by === sy && cbx === firstBack[0] && cby === firstBack[1]) break;
      if (bx === sx && by === sy && pts.length > 2 && iter > G2) break;
      pts.push([bx, by]);
    }
    if (pts.length > 1 && pts[pts.length - 1][0] === sx && pts[pts.length - 1][1] === sy) pts.pop();
    return pts;
  }
}

/** Douglas-Peucker on a closed ring. */
function simplifyClosed(ring: [number, number][], eps: number): [number, number][] {
  const n = ring.length;
  let far = 0, fd = -1;
  for (let q = 1; q < n; q++) { const d = Math.hypot(ring[q][0] - ring[0][0], ring[q][1] - ring[0][1]); if (d > fd) { fd = d; far = q; } }
  const dp = (pts: [number, number][]): [number, number][] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    let mi = 0, md = -1;
    for (let q = 1; q < pts.length - 1; q++) {
      const p = pts[q];
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
      if (d > md) { md = d; mi = q; }
    }
    if (md <= eps) return [a, b];
    const l = dp(pts.slice(0, mi + 1)), r = dp(pts.slice(mi));
    return [...l.slice(0, -1), ...r];
  };
  const h1 = dp(ring.slice(0, far + 1));
  const h2 = dp([...ring.slice(far), ring[0]]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

const SYL = ['va', 'lo', 'ra', 'mi', 'ren', 'ta', 'so', 'bel', 'dor', 'can', 'ti', 'quel', 'mar', 'nos', 'gua', 'ri', 'ber', 'sa',
  'lem', 'to', 'ca', 'ven', 'fa', 'du', 'al', 'mon', 'es', 'ter', 'vi', 'ro', 'na', 'cor', 'ze', 'il', 'bra', 'pe', 'que', 'lu'];
const END = ['ra', 'na', 'polis', 'burgo', 'via', 'lândia', 'tins', 'mar', 'dor', 'vale', 'ria', 'ente', 'ópolis', 'ada', 'el', 'ar'];

export function cityName(seed: number, water: boolean, level: number): string {
  const r = mulberry(seed ^ 0x9e3779b9);
  let s = '';
  const n = 1 + Math.floor(r() * 2);
  for (let q = 0; q < n; q++) s += SYL[Math.floor(r() * SYL.length)];
  s += END[Math.floor(r() * END.length)];
  s = s.charAt(0).toUpperCase() + s.slice(1);
  const k = r();
  if (water && k < 0.3) return 'Porto ' + s;
  if (level >= 6 && k < 0.3) return 'Alto ' + s;
  if (k > 0.9) return s + ' do ' + ['Norte', 'Sul', 'Leste', 'Oeste'][Math.floor(r() * 4)];
  return s;
}
