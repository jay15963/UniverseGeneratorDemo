// Main-thread cache of creature sprite sheets rendered by a small pool of workers.
import { Genome, Stage } from '../creature/genome';
import { Anim } from '../creature/pose';

export interface Sheet { canvas: HTMLCanvasElement; cw: number; ch: number; ax: number; ay: number; frames: number }

export class SpriteStore {
  private sheets = new Map<string, Sheet>();
  private pending = new Map<number, string>();
  private queue: { key: string; msg: object }[] = [];
  private queued = new Set<string>();
  private workers: { w: Worker; busy: boolean }[] = [];
  private nextId = 1;

  constructor(private n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2))) {}

  /** Workers are spawned lazily (and again after a dispose, e.g. React strict-mode remounts). */
  private spawn() {
    for (let i = 0; i < this.n; i++) {
      const w = new Worker(new URL('./sprite.worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data, key = this.pending.get(m.id);
        this.pending.delete(m.id);
        slot.busy = false;
        if (!m.ok) console.warn('creature sprite failed', key, m.message);
        if (key && m.ok) {
          const c = document.createElement('canvas');
          c.width = m.cw * m.frames; c.height = m.ch * 8;
          c.getContext('2d')!.putImageData(new ImageData(m.data as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0);
          this.sheets.set(key, { canvas: c, cw: m.cw, ch: m.ch, ax: m.ax, ay: m.ay, frames: m.frames });
        }
        this.pump();
      };
      this.workers.push(slot);
    }
  }

  /** Returns the sheet if ready; otherwise schedules it (higher priority = sooner) and returns null. */
  get(key: string, genome: Genome, stage: Stage, anim: Anim, k: number, citizen = 0, urgent = false): Sheet | null {
    const hit = this.sheets.get(key);
    if (hit) return hit;
    if (!this.queued.has(key)) {
      this.queued.add(key);
      const job = { key, msg: { genome, stage, anim, k, citizen } };
      if (urgent) this.queue.unshift(job); else this.queue.push(job);
      this.pump();
    }
    return null;
  }
  has(key: string) { return this.sheets.has(key); }

  private pump() {
    if (!this.workers.length && this.queue.length) this.spawn();
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.length) continue;
      const job = this.queue.shift()!;
      const id = this.nextId++;
      this.pending.set(id, job.key);
      slot.busy = true;
      slot.w.postMessage({ id, ...job.msg });
    }
  }
  dispose() {
    this.workers.forEach(s => s.w.terminate());
    this.workers = [];
    // jobs in flight are lost with their worker: let them be requested again
    for (const key of this.pending.values()) this.queued.delete(key);
    this.pending.clear();
  }
}
