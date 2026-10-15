// Main-thread side of the creature eras' simulation: owns the worker, keeps the last two snapshots to interpolate
// positions between them, and fans the stats / events out to the HUD.
import type { RtsCmd } from './rts.worker';
import type { SimInit, RtsSave, SimEvent } from './sim';
import { SNAP, type NationInfo, type NationStats, type RtsMode } from './defs';
import { WX } from './sim';

export interface Ent { id: number; x: number; y: number; hp: number; kind: number; nation: number; dir: number; anim: number; flags: number }
export interface Bld { id: number; x: number; y: number; hp: number; type: number; nation: number; queue: number; prog: number }
export interface HudState {
  stats: NationStats | null; nations: (NationInfo & { pop: number })[]; lifeStage: number; season: number; t: number;
  victory: { ok: boolean; lines: [string, boolean][] } | null; paused: boolean; speed: number;
}

export class RtsClient {
  private w: Worker;
  mode: RtsMode;
  ready = false;
  nations: NationInfo[] = [];
  /** interpolation: positions at the previous and the current snapshot */
  private prev = new Map<number, Ent>();
  cur = new Map<number, Ent>();
  builds: Bld[] = [];
  private tPrev = 0; private tCur = 0; private recv = 0; private interval = 100;
  sights: Float32Array = new Float32Array(0);
  hud: HudState = { stats: null, nations: [], lifeStage: 0, season: 1, t: 0, victory: null, paused: false, speed: 1 };
  private listeners = new Set<(h: HudState) => void>();
  onEvents: ((ev: SimEvent[]) => void) | null = null;
  onMsg: ((text: string) => void) | null = null;
  private saveWait: ((s: RtsSave) => void) | null = null;

  constructor(init: SimInit) {
    this.mode = init.mode;
    this.w = new Worker(new URL('./rts.worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (ev: MessageEvent) => this.on(ev.data);
    this.w.onerror = e => console.error('rts worker', e.message);
    this.w.postMessage({ kind: 'init', init });
  }
  private on(m: Record<string, unknown>) {
    switch (m.kind) {
      case 'ready': this.ready = true; this.nations = m.nations as NationInfo[]; break;
      case 'msg': this.onMsg?.(m.text as string); break;
      case 'error': console.error('rts', m.message); break;
      case 'save': this.saveWait?.(m.save as RtsSave); this.saveWait = null; break;
      case 'snap': {
        const now = performance.now();
        if (this.recv) this.interval = Math.max(40, Math.min(250, this.interval * 0.8 + (now - this.recv) * 0.2));
        this.recv = now;
        this.prev = this.cur;
        const ents = m.ents as Float32Array, map = new Map<number, Ent>();
        for (let o = 0; o < ents.length; o += SNAP) map.set(ents[o], { id: ents[o], x: ents[o + 1], y: ents[o + 2], hp: ents[o + 3], kind: ents[o + 4], nation: ents[o + 5], dir: ents[o + 6], anim: ents[o + 7], flags: ents[o + 8] });
        this.cur = map;
        const b = m.builds as Float32Array, bl: Bld[] = [];
        for (let o = 0; o < b.length; o += 8) bl.push({ id: b[o], x: b[o + 1], y: b[o + 2], hp: b[o + 3], type: b[o + 4], nation: b[o + 5], queue: b[o + 6], prog: b[o + 7] });
        this.builds = bl;
        this.sights = m.sights as Float32Array;
        this.tPrev = this.tCur; this.tCur = m.t as number;
        const h = this.hud;
        h.lifeStage = m.lifeStage as number; h.season = m.season as number; h.t = m.t as number; h.paused = m.paused as boolean; h.speed = m.speed as number;
        if (m.stats) { h.stats = m.stats as NationStats; h.nations = m.nations as HudState['nations']; h.victory = m.victory as HudState['victory']; }
        if ((m.events as SimEvent[]).length) this.onEvents?.(m.events as SimEvent[]);
        for (const l of this.listeners) l(h);
        break;
      }
    }
  }
  /** interpolated position of an entity */
  pos(e: Ent): [number, number] {
    const p = this.prev.get(e.id);
    if (!p) return [e.x, e.y];
    const a = Math.max(0, Math.min(1, (performance.now() - this.recv) / this.interval));
    let dx = e.x - p.x;
    if (dx > WX / 2) dx -= WX; else if (dx < -WX / 2) dx += WX;
    if (Math.abs(dx) > 4000 || Math.abs(e.y - p.y) > 4000) return [e.x, e.y];
    return [p.x + dx * a, p.y + (e.y - p.y) * a];
  }
  cmd(c: RtsCmd) { this.w.postMessage({ kind: 'cmd', cmd: c }); }
  save(): Promise<RtsSave> { return new Promise(res => { this.saveWait = res; this.cmd({ c: 'save' }); }); }
  subscribe(fn: (h: HudState) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  dispose() { this.w.terminate(); this.listeners.clear(); }
}
