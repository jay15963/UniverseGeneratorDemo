// The campaign's view of the planet: the planet grid (map resolution, 1 cell = 1024 world px), travel costs over
// land and sea, armies' paths (A* with the x axis wrapping round the planet) and the regions (provinces): every
// land cell belongs to the settlement it can be reached from most cheaply, so borders follow mountains and rivers.
import type { PlanetGrid } from '../../planet-generator/planetClient';

export const WX = 131072 * 16;

class Heap {
  i = new Int32Array(1 << 16); k = new Float32Array(1 << 16); n = 0;
  push(v: number, key: number) {
    if (this.n === this.i.length) { const a = new Int32Array(this.n * 2); a.set(this.i); this.i = a; const b = new Float32Array(this.n * 2); b.set(this.k); this.k = b; }
    let p = this.n++;
    while (p > 0) { const q = (p - 1) >> 1; if (this.k[q] <= key) break; this.i[p] = this.i[q]; this.k[p] = this.k[q]; p = q; }
    this.i[p] = v; this.k[p] = key;
  }
  pop(): number {
    const top = this.i[0], n = --this.n;
    if (n > 0) {
      const v = this.i[n], key = this.k[n];
      let p = 0;
      for (;;) { let c = 2 * p + 1; if (c >= n) break; if (c + 1 < n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= key) break; this.i[p] = this.i[c]; this.k[p] = this.k[c]; p = c; }
      this.i[p] = v; this.k[p] = key;
    }
    return top;
  }
}

const NB: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export interface PathResult { cells: number[]; costs: number[]; total: number }

export class CampaignWorld {
  readonly W: number; readonly H: number; readonly CELL: number;
  /** travel cost of a land cell (0 = sea) */
  readonly land: Float32Array;
  /** region (settlement index) of every cell, -1 = sea / unclaimed */
  region: Int16Array;
  private g: Float32Array; private from: Int32Array; private stamp: Uint32Array; private gen = 1;
  private heap = new Heap();

  constructor(readonly G: PlanetGrid) {
    const W = this.W = G.w, H = this.H = G.h;
    this.CELL = WX / W;
    const n = W * H;
    this.land = new Float32Array(n);
    const sea = G.sea, hi = sea + (1 - sea) * 0.42, peak = sea + (1 - sea) * 0.62;
    for (let i = 0; i < n; i++) {
      const e = G.elev[i];
      if (e < sea) continue;
      const t = G.temp[i] / 255, m = G.moist[i] / 255;
      let c = 1;
      if (e > peak) c = 5; else if (e > hi) c = 2.4;
      if (m > 0.68 && t > 0.35) c *= 1.35;           // forests and jungles
      if (t < 0.12) c *= 1.5;                        // ice
      if (m < 0.14 && t > 0.6) c *= 1.25;            // deserts
      if (G.river[i]) c += 0.6;                      // fords
      this.land[i] = c;
    }
    this.region = new Int16Array(n).fill(-1);
    this.g = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n);
  }

  private landLabel: Int32Array | null = null;
  /** connected landmasses (8-neighbour flood fill), computed on first use */
  landmass(c: number): number {
    if (!this.landLabel) {
      const W = this.W, H = this.H, L = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
      let id = 0;
      for (let s = 0; s < W * H; s++) {
        if (L[s] >= 0 || this.land[s] <= 0) continue;
        let h = 0, t = 0; q[t++] = s; L[s] = id;
        while (h < t) {
          const c0 = q[h++], i = c0 % W, j = Math.floor(c0 / W);
          for (const [dx, dy] of NB) { const jj = j + dy; if (jj < 0 || jj >= H) continue; const n = jj * W + this.wrapX(i + dx); if (L[n] < 0 && this.land[n] > 0) { L[n] = id; q[t++] = n; } }
        }
        id++;
      }
      this.landLabel = L;
    }
    return this.landLabel[c];
  }
  wrapX(i: number) { return ((i % this.W) + this.W) % this.W; }
  cellOf(x: number, y: number) { return Math.max(0, Math.min(this.H - 1, Math.floor(y / this.CELL))) * this.W + this.wrapX(Math.floor(x / this.CELL)); }
  centre(c: number): [number, number] { return [((c % this.W) + 0.5) * this.CELL, (Math.floor(c / this.W) + 0.5) * this.CELL]; }
  isLand(c: number) { return this.land[c] > 0; }
  isSea(x: number, y: number) { return !this.isLand(this.cellOf(x, y)); }
  /** cells between two world points (x wraps) */
  dist(ax: number, ay: number, bx: number, by: number) {
    let dx = Math.abs(ax - bx); if (dx > WX / 2) dx = WX - dx;
    return Math.hypot(dx, ay - by) / this.CELL;
  }
  /** nearest land cell to a world point (spiral) */
  nearestLand(x: number, y: number): number {
    const c0 = this.cellOf(x, y);
    if (this.isLand(c0)) return c0;
    const cx = c0 % this.W, cy = Math.floor(c0 / this.W);
    for (let r = 1; r < 120; r++) for (let a = 0; a < r * 8; a++) {
      const t = (a / (r * 8)) * Math.PI * 2, i = this.wrapX(Math.round(cx + Math.cos(t) * r)), j = Math.round(cy + Math.sin(t) * r);
      if (j < 0 || j >= this.H) continue;
      const c = j * this.W + i;
      if (this.isLand(c)) return c;
    }
    return c0;
  }
  /** a sea cell next to land (embarking) */
  coastal(c: number) {
    const i = c % this.W, j = Math.floor(c / this.W);
    for (const [dx, dy] of NB) { const jj = j + dy; if (jj < 0 || jj >= this.H) continue; if (!this.isLand(jj * this.W + this.wrapX(i + dx))) return true; }
    return false;
  }

  /**
   * A* from a world point to another. `sea`: the army can embark (cost per sea cell; 0 = it cannot).
   * `blocked(c)`: cells it may not enter (enemy armies' zones), except the goal.
   */
  path(ax: number, ay: number, bx: number, by: number, sea: number, blocked?: (c: number) => boolean, maxNodes = 400000): PathResult | null {
    const W = this.W, H = this.H;
    const s = this.cellOf(ax, ay), goal = this.cellOf(bx, by);
    if (s === goal) return { cells: [s], costs: [0], total: 0 };
    const cost = (c: number) => (this.land[c] > 0 ? this.land[c] : sea);
    if (cost(goal) <= 0) return null;
    const gen = ++this.gen;
    if (gen === 0xffffffff) { this.stamp.fill(0); this.gen = 1; }
    const gx = goal % W, gy = Math.floor(goal / W);
    const h = (c: number) => { let dx = Math.abs((c % W) - gx); if (dx > W / 2) dx = W - dx; const dy = Math.abs(Math.floor(c / W) - gy); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.95; };
    const heap = this.heap; heap.n = 0;
    this.g[s] = 0; this.from[s] = -1; this.stamp[s] = gen;
    heap.push(s, h(s));
    let n = 0;
    while (heap.n > 0) {
      const c = heap.pop();
      if (c === goal) break;
      if (++n > maxNodes) return null;
      const gc = this.g[c], i = c % W, j = Math.floor(c / W);
      const here = this.land[c] > 0;
      for (const [dx, dy, d] of NB) {
        const jj = j + dy;
        if (jj < 0 || jj >= H) continue;
        const nc = jj * W + this.wrapX(i + dx);
        let k = cost(nc);
        if (k <= 0) continue;
        if (blocked && nc !== goal && blocked(nc)) continue;
        if (here !== this.land[nc] > 0) k += 3;      // embarking / landing takes time
        const ng = gc + k * d;
        if (this.stamp[nc] === gen && this.g[nc] <= ng) continue;
        this.stamp[nc] = gen; this.g[nc] = ng; this.from[nc] = c;
        heap.push(nc, ng + h(nc));
      }
    }
    if (this.stamp[goal] !== gen) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = this.from[c]) cells.push(c);
    cells.reverse();
    const costs = cells.map(c => this.g[c]);
    return { cells, costs, total: this.g[goal] };
  }

  /** regions: multi-source Dijkstra over land from every settlement (index order = settlement order) */
  buildRegions(seeds: { x: number; y: number }[], maxCost = 90) {
    const W = this.W, H = this.H, n = W * H;
    const R = new Int16Array(n).fill(-1), D = new Float32Array(n).fill(Infinity);
    const heap = new Heap();
    seeds.forEach((s, k) => { const c = this.nearestLand(s.x, s.y); if (D[c] > 0) { D[c] = 0; R[c] = k; heap.push(c, 0); } });
    while (heap.n > 0) {
      const c = heap.pop(), dc = D[c];
      const i = c % W, j = Math.floor(c / W);
      for (const [dx, dy, d] of NB) {
        const jj = j + dy;
        if (jj < 0 || jj >= H) continue;
        const nc = jj * W + this.wrapX(i + dx);
        const k = this.land[nc];
        if (k <= 0) continue;
        const nd = dc + k * d;
        if (nd >= D[nc] || nd > maxCost) continue;
        D[nc] = nd; R[nc] = R[c];
        heap.push(nc, nd);
      }
    }
    this.region = R;
    return R;
  }
}
