// A small pool of structure workers for the gameplay map (a city needs dozens of designs at once).
// Jobs carry a priority (lower first: distance to the camera) that the caller can refresh while they wait.
import type { Dir8 } from '../creature/pose';
import type { SData, StructSpec } from './render';

interface Job { key: string; spec: StructSpec; dir: Dir8; k: number; frames: number; prio: number; resolve: (d: SData | null) => void }

export class StructPool {
  private workers: { w: Worker; busy: boolean }[] = [];
  private queue = new Map<string, Job>();
  private nextId = 1;
  private waiting = new Map<number, (m: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any

  /** `make`: another worker with the same protocol ({ spec, dir, frames, k } -> frames, w, h, ax, ay), e.g. vehicles */
  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2)), make?: () => Worker) {
    for (let i = 0; i < size; i++) {
      const w = make ? make() : new Worker(new URL('./struct.worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      w.onmessage = (ev: MessageEvent) => { const cb = this.waiting.get(ev.data.id); this.waiting.delete(ev.data.id); slot.busy = false; cb?.(ev.data); this.pump(); };
      this.workers.push(slot);
    }
  }
  get pending() { return this.queue.size; }
  /** queue a render (or refresh the priority of one already queued) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request(key: string, spec: StructSpec | any, dir: Dir8, k: number, frames: number, prio: number): Promise<SData | null> | null {
    const q = this.queue.get(key);
    if (q) { q.prio = Math.min(q.prio, prio); return null; }
    const p = new Promise<SData | null>(resolve => this.queue.set(key, { key, spec, dir, k, frames, prio, resolve }));
    this.pump();
    return p;
  }
  prioritize(key: string, prio: number) { const q = this.queue.get(key); if (q) q.prio = prio; }
  private pump() {
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.size) continue;
      let best: Job | null = null;
      for (const j of this.queue.values()) if (!best || j.prio < best.prio) best = j;
      const job = best!;
      this.queue.delete(job.key);
      slot.busy = true;
      const id = this.nextId++;
      this.waiting.set(id, m => job.resolve(m.ok ? { frames: m.frames, w: m.w, h: m.h, ax: m.ax, ay: m.ay } : null));
      slot.w.postMessage({ id, spec: job.spec, dir: job.dir, frames: job.frames, k: job.k });
    }
  }
  dispose() {
    for (const s of this.workers) s.w.terminate();
    this.workers = [];
    for (const j of this.queue.values()) j.resolve(null);
    this.queue.clear();
    for (const cb of this.waiting.values()) cb({ ok: false });
    this.waiting.clear();
  }
}
