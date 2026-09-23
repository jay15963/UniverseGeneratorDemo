// Main-thread facade over the planet workers.
//
//  - requestPlanetTexture(): small textures for the system view, served by a shared pool with a
//    priority queue and an LRU cache so revisiting a system is instant.
//  - openPlanetSession(): a dedicated worker holding a full-resolution generator for the surface map.
import type { LayerType, PlanetConfig } from './generator';
import type { PlanetProbe, WorkerRequest, WorkerResponse } from './workerProtocol';

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

export function textureKey(config: PlanetConfig) {
  return `${config.seed}|${config.planetType}|${SPRITE_TEX_W}`;
}

export function peekPlanetTexture(config: PlanetConfig) {
  return pool.peek(textureKey(config));
}

export function requestPlanetTexture(config: PlanetConfig, priority = 0): Promise<PlanetTexture> {
  const small: PlanetConfig = { ...config, width: SPRITE_TEX_W, height: SPRITE_TEX_H };
  return pool.request(textureKey(config), small, priority);
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

  const ready = call({ kind: 'open', id: nextId++, sessionId, config }).then((msg) => {
    if (msg.kind !== 'opened') throw new Error('unexpected response');
    const session: PlanetSession = {
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
      dispose,
    };
    return session;
  });

  return { ready, cancel: dispose };
}
