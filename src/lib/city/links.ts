// Links between nearby cities (visual placeholders for now): a main road over land and a sea lane over water.
//
// Both are A* searches over 3-tile cells between the two cities. The road uses the same terrain scoring as the city
// planner (plains cheap, forest costly, one-level slopes need ramps, steeper ones impassable, rivers bridged, the sea
// stops it) and is painted as an artery outside the cities' own territories; the sea lane keeps to water and joins the
// water nearest each city.
import type { TerrainGenerator } from '../terrain/terrainGen';
import { Ground, CHUNK } from '../terrain/types';
import { CZ, CityChunkData, CityPlan } from './codes';
import { MAX_BRIDGE } from './plan';

const C = 3;
/** cities closer than this (tiles) get a road, and a sea lane when both touch water */
export const ROAD_MAX = 2600;
export const SEA_MAX = 5000;

export interface CityLink {
  id: number; a: number; b: number; kind: 'road' | 'sea';
  /** polyline in tile coords (cell centres) */
  path: [number, number][];
  /** painted artery tiles (roads only) */
  chunks?: Record<string, CityChunkData>;
}

const isWaterG = (g: number) => g <= Ground.SWAMP_WATER;

class Heap {
  i: number[] = []; k: number[] = [];
  push(v: number, key: number) {
    const I = this.i, K = this.k;
    let p = I.length; I.push(v); K.push(key);
    while (p > 0) { const q = (p - 1) >> 1; if (K[q] <= key) break; I[p] = I[q]; K[p] = K[q]; p = q; }
    I[p] = v; K[p] = key;
  }
  pop(): number {
    const I = this.i, K = this.k, top = I[0], v = I.pop()!, key = K.pop()!, n = I.length;
    if (n) {
      let p = 0;
      for (;;) { let c = 2 * p + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= key) break; I[p] = I[c]; K[p] = K[c]; p = c; }
      I[p] = v; K[p] = key;
    }
    return top;
  }
  get n() { return this.i.length; }
}

/** A* over cells inside a box; returns tile-coord polyline or null */
/** goalR (cells): the search may end anywhere within this distance of `to` (sea lanes: any water near the city) */
export function search(tg: TerrainGenerator, from: [number, number], to: [number, number], sea: boolean, limit: number, goalR = 0): [number, number][] | null {
  const ax = Math.round(from[0] / C), ay = Math.round(from[1] / C), bx = Math.round(to[0] / C), by = Math.round(to[1] / C);
  const M = sea ? 260 : 120;
  const x0 = Math.min(ax, bx) - M, y0 = Math.min(ay, by) - M, W = Math.abs(ax - bx) + 2 * M + 1, H = Math.abs(ay - by) + 2 * M + 1;
  const N = W * H;
  const g = new Uint8Array(N).fill(255), lv = new Uint8Array(N), fo = new Uint8Array(N);
  const dist = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), done = new Uint8Array(N), wrun = new Uint8Array(N);
  const sample = (c: number) => {
    if (g[c] !== 255) return;
    const tx = (x0 + (c % W)) * C, ty = (y0 + ((c / W) | 0)) * C;
    const t = tg.tile(tx, ty);
    g[c] = t.g; lv[c] = tg.levelOf(t, tx, ty); fo[c] = Math.round(Math.min(1, t.forest) * 255);
  };
  const s = (ay - y0) * W + ax - x0, e = (by - y0) * W + bx - x0;
  const hx = (c: number) => Math.hypot((c % W) - (bx - x0), ((c / W) | 0) - (by - y0));
  const heap = new Heap();
  sample(s); sample(e);
  dist[s] = 0; heap.push(s, hx(s));
  let expanded = 0, end = -1;
  while (heap.n) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    if (c === e || (goalR > 0 && hx(c) <= goalR)) { end = c; break; }
    if (++expanded > limit) return null;
    const cx = c % W, cy = (c / W) | 0;
    for (let d = 0; d < 8; d++) {
      const dx = [1, 1, 0, -1, -1, -1, 0, 1][d], dy = [0, 1, 1, 1, 0, -1, -1, -1][d];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (done[n]) continue;
      sample(n);
      let step: number;
      if (sea) {
        // water only (the two ends may sit on the bank)
        if ((!isWaterG(g[n]) || g[n] === Ground.SWAMP_WATER) && n !== e) continue;
        step = g[n] === Ground.DEEP_WATER ? 1 : g[n] === Ground.RIVER_WATER ? 1.6 : 1.3;
      } else {
        if (g[n] === Ground.DEEP_WATER || g[n] === Ground.LAVA) continue;
        const dl = Math.abs(lv[n] - lv[c]);
        if (dl >= 3) continue;
        step = isWaterG(g[n]) ? 14 : 1 + (fo[n] / 255) * 5 + (dl === 1 ? 2.5 : dl === 2 ? 9 : 0);
        // bridges only over rivers: a few cells of water in a row at most, never across a sea
        const run = isWaterG(g[n]) ? wrun[c] + (dx && dy ? 2 : 1) : 0;
        if (run > MAX_BRIDGE) continue;
        if (dist[c] + step * (dx && dy ? 1.4142 : 1) < dist[n]) wrun[n] = run;
      }
      const nd = dist[c] + step * (dx && dy ? 1.4142 : 1);
      if (nd < dist[n]) { dist[n] = nd; par[n] = c; heap.push(n, nd + hx(n) * (sea ? 1 : 1.05)); }
    }
  }
  if (end < 0) return null;
  const out: [number, number][] = [];
  for (let c = end; c >= 0; c = par[c]) out.push([(x0 + (c % W)) * C, (y0 + ((c / W) | 0)) * C]);
  return out.reverse();
}

/** nearest water cell to a city centre (tile coords), searched in rings */
export function nearestWater(tg: TerrainGenerator, tx: number, ty: number, R: number): [number, number] | null {
  for (let r = 0; r <= R; r += C) {
    const n = Math.max(1, Math.round(r * 0.8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = Math.round(tx + Math.cos(a) * r), y = Math.round(ty + Math.sin(a) * r);
      const t = tg.tile(x, y);
      if (t.g === Ground.DEEP_WATER || t.g === Ground.SHALLOW_WATER || t.g === Ground.RIVER_WATER) return [x, y];
    }
  }
  return null;
}

/** road and sea links between a (new) city and the others */
export function planLinks(tg: TerrainGenerator, city: CityPlan, others: CityPlan[]): CityLink[] {
  const out: CityLink[] = [];
  const all = [city, ...others];
  for (const o of others) {
    const a = city.meta, b = o.meta;
    const d = Math.hypot(a.tx - b.tx, a.ty - b.ty);
    const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
    if (d < ROAD_MAX) {
      const path = search(tg, [a.tx, a.ty], [b.tx, b.ty], false, 400000);
      if (path) out.push({ id: 1_000_000 + lo * 1000 + hi, a: a.id, b: b.id, kind: 'road', path, chunks: paintRoad(tg, path, all) });
    }
    if (d < SEA_MAX) {
      const wa = nearestWater(tg, a.tx, a.ty, 240), wb = nearestWater(tg, b.tx, b.ty, 240);
      if (wa && wb) {
        // from the water by one city to any water within ~250 tiles of the other
        const path = search(tg, wa, [b.tx, b.ty], true, 2500000, 85);
        if (path && path.length > 8) out.push({ id: 2_000_000 + lo * 1000 + hi, a: a.id, b: b.id, kind: 'sea', path });
      }
    }
  }
  return out;
}

/** artery tiles along the road, except where a city already planned something (its own streets and lots take over) */
function paintRoad(tg: TerrainGenerator, path: [number, number][], plans: CityPlan[]) {
  const chunks: Record<string, CityChunkData> = {};
  const put = (tx: number, ty: number) => {
    const ck = `${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`, cq = (ty - Math.floor(ty / CHUNK) * CHUNK) * CHUNK + tx - Math.floor(tx / CHUNK) * CHUNK;
    if (plans.some(p => p.chunks[ck]?.code[cq])) return;
    const t = tg.tile(tx, ty);
    if (t.g === Ground.DEEP_WATER || t.g === Ground.LAVA) return;
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), key = `${cx},${cy}`;
    let ch = chunks[key];
    if (!ch) { const n = CHUNK * CHUNK; ch = chunks[key] = { code: new Uint8Array(n), stage: new Uint8Array(n).fill(255), lvl: new Uint8Array(n).fill(255), rd: new Uint8Array(n) }; }
    const q = (ty - cy * CHUNK) * CHUNK + tx - cx * CHUNK;
    ch.code[q] = isWaterG(t.g) ? CZ.BRIDGE : CZ.ARTERY; ch.stage[q] = 0;
  };
  for (let i = 0; i + 1 < path.length; i++) {
    let [x, y] = path[i];
    const [x1, y1] = path[i + 1];
    const sx = Math.sign(x1 - x), sy = Math.sign(y1 - y);
    for (;;) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) put(x + ox, y + oy);
      if (x === x1 && y === y1) break;
      if (x !== x1) x += sx;
      if (y !== y1) y += sy;
    }
  }
  return chunks;
}
