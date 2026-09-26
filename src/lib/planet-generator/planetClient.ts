// Main-thread facade over the planet workers.
//
//  - requestPlanetTexture(): small textures for the system view, served by a shared pool with a
//    priority queue and an LRU cache so revisiting a system is instant.
//  - openPlanetSession(): a dedicated worker holding a full-resolution generator for the surface map.
import type { LayerType, PlanetConfig } from './generator';
import type { PlanetProbe, WorkerRequest, WorkerResponse } from './workerProtocol';
import type { ChunkData } from '../terrain/types';
import { CHUNK, WORLD_TILES_X } from '../terrain/types';
import type { PlanetFields } from '../terrain/terrainGen';
import type { CityPlan } from '../city/codes';
import type { CityLink } from '../city/links';
import type { CitySite } from '../city/sites';

export type { PlanetProbe };

export interface PlanetTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;           // RGBA surface colour
  clouds: Uint8ClampedArray | null;  // 1 byte alpha per texel
}

const createWorker = () =>
  new Worker(new URL('./planet.worker.ts', import.meta.url), { type: 'module' });

// ---------------------------------------------------------------------------
// Texture pool
// ---------------------------------------------------------------------------
interface Job {
  key: string;
  config: PlanetConfig;
  priority: number;
  resolve: (t: PlanetTexture) => void;
  reject: (e: Error) => void;
}

const POOL_SIZE = Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) - 1 || 2));
const CACHE_LIMIT = 96;

class TexturePool {
  private workers: { worker: Worker; busy: boolean }[] = [];
  private queue: Job[] = [];
  private inflight = new Map<number, Job>();
  private pending = new Map<string, Promise<PlanetTexture>>();
  private cache = new Map<string, PlanetTexture>();
  private nextId = 1;

  private ensureWorkers() {
    if (this.workers.length) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const worker = createWorker();
      const slot = { worker, busy: false };
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(slot, ev.data);
      worker.onerror = (ev) => console.error('Planet worker error', ev.message);
      this.workers.push(slot);
    }
  }

  private onMessage(slot: { busy: boolean }, msg: WorkerResponse) {
    if (msg.kind !== 'texture' && msg.kind !== 'error') return;
    const job = this.inflight.get(msg.id);
    this.inflight.delete(msg.id);
    slot.busy = false;
    if (job) {
      this.pending.delete(job.key);
      if (msg.kind === 'texture') {
        const tex: PlanetTexture = { width: msg.width, height: msg.height, data: msg.data, clouds: msg.clouds };
        this.cache.set(job.key, tex);
        if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
        job.resolve(tex);
      } else {
        job.reject(new Error(msg.message));
      }
    }
    this.pump();
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy || this.queue.length === 0) continue;
      // Highest priority first
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority > this.queue[best].priority) best = i;
      const job = this.queue.splice(best, 1)[0];
      const id = this.nextId++;
      slot.busy = true;
      this.inflight.set(id, job);
      const req: WorkerRequest = { kind: 'texture', id, config: job.config };
      slot.worker.postMessage(req);
    }
  }

  peek(key: string): PlanetTexture | undefined {
    const t = this.cache.get(key);
    if (t) { this.cache.delete(key); this.cache.set(key, t); } // LRU touch
    return t;
  }

  request(key: string, config: PlanetConfig, priority = 0): Promise<PlanetTexture> {
    const cached = this.peek(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) {
      const queued = this.queue.find(j => j.key === key);
      if (queued) queued.priority = Math.max(queued.priority, priority);
      return existing;
    }
    this.ensureWorkers();
    const p = new Promise<PlanetTexture>((resolve, reject) => {
      this.queue.push({ key, config, priority, resolve, reject });
    });
    this.pending.set(key, p);
    this.pump();
    return p;
  }

  /** Drop queued (not yet started) jobs that the caller no longer needs. */
  cancelExcept(keep: Set<string>) {
    this.queue = this.queue.filter(j => {
      if (keep.has(j.key)) return true;
      this.pending.delete(j.key);
      j.reject(new Error('cancelled'));
      return false;
    });
  }
}

const pool = new TexturePool();

export const SPRITE_TEX_W = 256;
export const SPRITE_TEX_H = 128;

export function textureKey(config: PlanetConfig, width = SPRITE_TEX_W) {
  return `${config.seed}|${config.planetType}|${width}|${config.lifeStage ?? ""}`;
}

export function peekPlanetTexture(config: PlanetConfig) {
  return pool.peek(textureKey(config));
}

export function requestPlanetTexture(config: PlanetConfig, priority = 0, width = SPRITE_TEX_W): Promise<PlanetTexture> {
  const sized: PlanetConfig = { ...config, width, height: width / 2 };
  return pool.request(textureKey(config, width), sized, priority);
}

export function cancelPlanetTexturesExcept(configs: PlanetConfig[]) {
  pool.cancelExcept(new Set(configs.map(textureKey)));
}

// ---------------------------------------------------------------------------
// Surface sessions (full resolution, one dedicated worker each)
// ---------------------------------------------------------------------------
export interface PlanetSession {
  width: number;
  height: number;
  clouds: { width: number; height: number; data: Uint8ClampedArray } | null;
  renderLayer(layer: LayerType): Promise<ImageData>;
  probe(x: number, y: number): Promise<PlanetProbe | null>;
  /** Playable terrain chunk (32x32 tiles) */
  chunk(cx: number, cy: number): Promise<ChunkData>;
  /** Regional LOD block from the full-resolution session worker (anywhere on the planet) */
  region(tx: number, ty: number, step: number, n: number): Promise<Uint8ClampedArray>;
  /** Nearest walkable tile to a map pixel */
  spawn(x: number, y: number): Promise<{ tx: number; ty: number }>;
  /** Parallel chunk generator (one worker per spare core) around a map point. */
  terrainPool(x: number, y: number): Promise<TerrainPool>;
  /** Cities planned this session (kept only for the session), with their current evolution p (0..254). */
  cities: Map<number, { plan: CityPlan; p: number }>;
  /** Plans a city around a tile (replacing city `cityId` when given) and paints it into every terrain worker. */
  planCity(tx: number, ty: number, era: number, p: number, cityId?: number, name?: string, species?: string): Promise<CityPlan>;
  setCityLevel(cityId: number, p: number): void;
  /** where the cities of the whole planet should go (clusters, habitability) */
  citySites(count: number, seed: number): Promise<CitySite[]>;
  /** main roads and sea lanes between nearby cities */
  links: Map<number, CityLink>;
  removeCity(cityId: number): void;
  /** show / hide the district colours of every city */
  setCityZones(on: boolean): void;
  config: PlanetConfig;
  dispose(): void;
}

export function openPlanetSession(
  config: PlanetConfig,
  onProgress?: (progress: number, status: string) => void,
): { ready: Promise<PlanetSession>; cancel: () => void } {
  const worker = createWorker();
  const sessionId = Math.random().toString(36).slice(2);
  let nextId = 1;
  const waiters = new Map<number, (msg: WorkerResponse) => void>();
  let disposed = false;

  const call = (req: WorkerRequest & { id: number }) =>
    new Promise<WorkerResponse>((resolve, reject) => {
      if (disposed) { reject(new Error('disposed')); return; }
      waiters.set(req.id, (msg) => (msg.kind === 'error' ? reject(new Error(msg.message)) : resolve(msg)));
      worker.postMessage(req);
    });

  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.kind === 'progress') { onProgress?.(msg.progress, msg.status); return; }
    const w = waiters.get(msg.id);
    if (w) { waiters.delete(msg.id); w(msg); }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    waiters.clear();
  };

  const cities = new Map<number, { plan: CityPlan; p: number }>();
  const pools = new Set<TerrainPool>();
  const links = new Map<number, CityLink>();
  const dropLinks = (id: number) => {
    for (const [lid, l] of links) if (l.a === id || l.b === id) { links.delete(lid); for (const pool of pools) pool.broadcast({ kind: 'cityRemove', cityId: lid }); }
  };
  let nextCity = 1;
  let zonesOn = true;
  const ready = call({ kind: 'open', id: nextId++, sessionId, config }).then((msg) => {
    if (msg.kind !== 'opened') throw new Error('unexpected response');
    // eslint-disable-next-line prefer-const
    let session: PlanetSession;
    session = {
      width: config.width,
      height: config.height,
      clouds: msg.clouds ? { width: msg.cloudWidth, height: msg.cloudHeight, data: msg.clouds } : null,
      renderLayer: async (layer) => {
        const res = await call({ kind: 'render', id: nextId++, sessionId, layer });
        if (res.kind !== 'layer') throw new Error('unexpected response');
        return new ImageData(res.data as Uint8ClampedArray<ArrayBuffer>, res.width, res.height);
      },
      probe: async (x, y) => {
        const res = await call({ kind: 'probe', id: nextId++, sessionId, x, y });
        return res.kind === 'probe' ? res.probe : null;
      },
      chunk: async (cx, cy) => {
        const res = await call({ kind: 'chunk', id: nextId++, sessionId, cx, cy });
        if (res.kind !== 'chunk') throw new Error('unexpected response');
        return res.chunk;
      },
      region: async (tx, ty, step, n) => {
        const res = await call({ kind: 'region', id: nextId++, sessionId, tx, ty, step, n });
        if (res.kind !== 'region') throw new Error('unexpected response');
        return res.px;
      },
      spawn: async (x, y) => {
        const res = await call({ kind: 'spawn', id: nextId++, sessionId, x, y });
        if (res.kind !== 'spawn') throw new Error('unexpected response');
        return { tx: res.tx, ty: res.ty };
      },
      terrainPool: async (x, y) => {
        const res = await call({ kind: 'fields', id: nextId++, sessionId, x, y, size: 256 });
        if (res.kind !== 'fields') throw new Error('unexpected response');
        const pool = new TerrainPool(res.fields, (cx, cy) => session.chunk(cx, cy));
        await pool.ready;
        pool.broadcast({ kind: 'cityZones', on: zonesOn });
        for (const [id, c] of cities) pool.broadcast({ kind: 'cityAdd', cityId: id, era: c.plan.meta.era, p: c.p, chunks: c.plan.chunks });
        for (const l of links.values()) if (l.chunks) pool.broadcast({ kind: 'cityAdd', cityId: l.id, era: cities.get(l.a)?.plan.meta.era ?? 0, p: 254, chunks: l.chunks });
        pools.add(pool);
        pool.onDispose = () => pools.delete(pool);
        return pool;
      },
      cities,
      links,
      planCity: async (tx, ty, era, p, cityId, name, species) => {
        const id = cityId ?? nextCity++;
        const prev = cities.get(id);
        const seed = prev?.plan.meta.seed ?? ((Math.random() * 2 ** 31) | 0);
        const res = await call({ kind: 'city', id: nextId++, sessionId, cityId: id, tx, ty, era, seed, p, name: name ?? prev?.plan.meta.name, species: species ?? prev?.plan.meta.species });
        if (res.kind !== 'city') throw new Error('unexpected response');
        cities.set(id, { plan: res.plan, p });
        dropLinks(id);
        for (const l of res.links) {
          links.set(l.id, l);
          if (l.chunks) for (const pool of pools) pool.broadcast({ kind: 'cityAdd', cityId: l.id, era: res.plan.meta.era, p: 254, chunks: l.chunks });
        }
        for (const pool of pools) {
          pool.broadcast({ kind: 'cityRemove', cityId: id });
          pool.broadcast({ kind: 'cityAdd', cityId: id, era: res.plan.meta.era, p, chunks: res.plan.chunks });
        }
        return res.plan;
      },
      citySites: async (count, seed) => {
        const res = await call({ kind: 'citySites', id: nextId++, sessionId, count, seed });
        if (res.kind !== 'citySites') throw new Error('unexpected response');
        return res.sites;
      },
      setCityLevel: (id, p) => {
        const c = cities.get(id);
        if (!c) return;
        c.p = p;
        worker.postMessage({ kind: 'cityLevel', sessionId, cityId: id, p } satisfies WorkerRequest);
        for (const pool of pools) pool.broadcast({ kind: 'cityLevel', cityId: id, p });
      },
      setCityZones: (on) => {
        zonesOn = on;
        worker.postMessage({ kind: 'cityZones', sessionId, on } satisfies WorkerRequest);
        for (const pool of pools) pool.broadcast({ kind: 'cityZones', on });
      },
      removeCity: (id) => {
        cities.delete(id);
        dropLinks(id);
        worker.postMessage({ kind: 'cityRemove', sessionId, cityId: id } satisfies WorkerRequest);
        for (const pool of pools) pool.broadcast({ kind: 'cityRemove', cityId: id });
      },
      config,
      dispose,
    };
    return session;
  });

  return { ready, cancel: dispose };
}


// ---------------------------------------------------------------------------
// Terrain pool: chunk generation spread over every spare CPU core
// ---------------------------------------------------------------------------
export class TerrainPool {
  readonly size: number;
  readonly ready: Promise<void>;
  private workers: { w: Worker; busy: boolean }[] = [];
  private queue: { cx: number; cy: number; resolve: (c: ChunkData) => void; reject: (e: Error) => void }[] = [];
  private regionQueue: { tx: number; ty: number; step: number; n: number; resolve: (px: Uint8ClampedArray) => void; reject: (e: Error) => void }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private waiting = new Map<number, { resolve: (c: any) => void; reject: (e: Error) => void; slot: { busy: boolean } }>();
  private nextId = 1;
  private fields: PlanetFields;
  private fallback: (cx: number, cy: number) => Promise<ChunkData>;
  /** Rolling average generation time per chunk (ms), for the perf overlay. */
  avgMs = 0;
  onDispose: (() => void) | null = null;

  constructor(fields: PlanetFields, fallback: (cx: number, cy: number) => Promise<ChunkData>) {
    this.fields = fields;
    this.fallback = fallback;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(8, cores - 1));
    const inits: Promise<void>[] = [];
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL('../terrain/terrain.worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      this.workers.push(slot);
      inits.push(new Promise(res => {
        w.onmessage = (ev) => {
          const m = ev.data;
          if (m.kind === 'ready') { res(); return; }
          const job = this.waiting.get(m.id);
          if (!job) return;
          this.waiting.delete(m.id);
          slot.busy = false;
          if (m.kind === 'chunk') { this.avgMs = this.avgMs ? this.avgMs * 0.9 + m.ms * 0.1 : m.ms; job.resolve(m.chunk); }
          else if (m.kind === 'region') job.resolve(m.px);
          else job.reject(new Error(m.message));
          this.pump();
        };
      }));
      // each worker gets its own copy of the (small) field window
      w.postMessage({ kind: 'init', id: 0, fields });
    }
    this.ready = Promise.all(inits).then(() => undefined);
  }

  private covers(cx: number, cy: number) {
    const F = this.fields, W = F.config.width;
    const S = WORLD_TILES_X / W;
    const mx = ((cx + 0.5) * CHUNK) / S, my = ((cy + 0.5) * CHUNK) / S;
    const lx = (((Math.floor(mx) - F.ox) % W) + W) % W, ly = Math.floor(my) - F.oy;
    return lx >= 3 && lx < F.fw - 3 && ly >= 3 && ly < F.fh - 3;
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const id = this.nextId++;
      if (this.queue.length) {
        // gameplay chunks always go first
        const job = this.queue.shift()!;
        slot.busy = true;
        this.waiting.set(id, { resolve: job.resolve, reject: job.reject, slot });
        slot.w.postMessage({ kind: 'chunk', id, cx: job.cx, cy: job.cy });
      } else if (this.regionQueue.length) {
        const job = this.regionQueue.shift()!;
        slot.busy = true;
        this.waiting.set(id, { resolve: job.resolve, reject: job.reject, slot });
        slot.w.postMessage({ kind: 'region', id, tx: job.tx, ty: job.ty, step: job.step, n: job.n });
      }
    }
  }

  /** Map-pixel coverage test for a tile position (regional LOD requests must stay inside the field window). */
  coversTile(tx: number, ty: number) {
    const F = this.fields, W = F.config.width;
    const S = WORLD_TILES_X / W;
    const lx = (((Math.floor(tx / S) - F.ox) % W) + W) % W, ly = Math.floor(ty / S) - F.oy;
    return lx >= 3 && lx < F.fw - 3 && ly >= 3 && ly < F.fh - 3;
  }

  /** Regional LOD block: n*n colours, one per `step` tiles, starting at tile (tx, ty). */
  region(tx: number, ty: number, step: number, n: number): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => { this.regionQueue.push({ tx, ty, step, n, resolve, reject }); this.pump(); });
  }
  /** Drops queued (not yet started) regional jobs - used when the camera moves on. */
  clearRegions() { const q = this.regionQueue; this.regionQueue = []; for (const j of q) j.reject(new Error('cancelled')); }
  get regionBacklog() { return this.regionQueue.length; }

  /** Number of chunk jobs that can start right now without queueing. */
  get idle() { return this.workers.filter(w => !w.busy).length - this.queue.length; }

  chunk(cx: number, cy: number): Promise<ChunkData> {
    if (!this.covers(cx, cy)) return this.fallback(cx, cy);
    return new Promise((resolve, reject) => { this.queue.push({ cx, cy, resolve, reject }); this.pump(); });
  }

  /** Fire-and-forget message to every worker (city overlays). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadcast(msg: any) { for (const s of this.workers) s.w.postMessage(msg); }

  dispose() {
    this.onDispose?.();
    this.workers.forEach(s => s.w.terminate());
    this.workers = [];
    // settle everything in flight so callers can clean up their bookkeeping
    const err = new Error('disposed');
    for (const j of this.waiting.values()) j.reject(err);
    for (const j of this.queue) j.reject(err);
    for (const j of this.regionQueue) j.reject(err);
    this.waiting.clear(); this.queue = []; this.regionQueue = [];
  }
}
