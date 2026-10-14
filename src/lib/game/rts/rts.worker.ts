/// <reference lib="webworker" />
// The creature eras' simulation thread: ticks the RtsSim at 20 Hz and sends snapshots at 10 Hz.
import { RtsSim, type SimInit } from './sim';
import type { Ord } from './defs';

export type RtsCmd =
  | { c: 'order'; ids: number[]; o: Ord; x: number; y: number; target?: number; targetB?: number }
  | { c: 'train'; b: number; caste: number }
  | { c: 'cancel'; b: number }
  | { c: 'place'; type: number; x: number; y: number; builder?: number }
  | { c: 'research'; id: string }
  | { c: 'rally'; b: number; x: number; y: number }
  | { c: 'speed'; v: number }
  | { c: 'pause'; v: boolean }
  | { c: 'reveal'; v: boolean }
  | { c: 'save' };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let sim: RtsSim | null = null;
let timer = 0, n = 0, revealAll = false;

ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.kind === 'init') {
      sim = new RtsSim(m.init as SimInit);
      clearInterval(timer);
      timer = setInterval(step, 50) as unknown as number;
      ctx.postMessage({ kind: 'ready', nations: sim.nations.map(q => q.info), mode: sim.mode });
      return;
    }
    if (!sim) return;
    if (m.kind === 'cmd') {
      const c = m.cmd as RtsCmd;
      let err: string | null = null;
      switch (c.c) {
        case 'order': sim.order(c.ids, c.o, c.x, c.y, c.target ?? -1, c.targetB ?? -1); break;
        case 'train': err = sim.train(c.b, c.caste, 0); break;
        case 'cancel': sim.cancel(c.b, 0); break;
        case 'place': err = sim.placeBuilding(c.type, c.x, c.y, 0, c.builder); break;
        case 'research': err = sim.research(c.id, 0); break;
        case 'rally': if (sim.bnation[c.b] === 0) { sim.brx[c.b] = c.x; sim.bry[c.b] = c.y; } break;
        case 'speed': sim.speed = c.v; break;
        case 'pause': sim.paused = c.v; break;
        case 'reveal': revealAll = c.v; break;
        case 'save': ctx.postMessage({ kind: 'save', save: sim.save(), id: m.id }); break;
      }
      if (err) ctx.postMessage({ kind: 'msg', text: err });
    }
  } catch (e) {
    ctx.postMessage({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};

function step() {
  if (!sim) return;
  sim.tick(0.05);
  if (++n % 2) return;
  const { ents, builds } = sim.snapshot(revealAll);
  const ev = sim.events; sim.events = [];
  const sights = new Float32Array(sim.sights);
  const msg: Record<string, unknown> = { kind: 'snap', t: sim.t, ents, builds, events: ev, lifeStage: sim.lifeStage, season: sim.season(), sights, paused: sim.paused, speed: sim.speed };
  if (n % 10 === 0) {
    msg.stats = sim.stats(0);
    msg.nations = sim.nations.map((q, i) => ({ ...q.info, alive: q.alive, pop: q.pop, buildings: i === 0 ? 0 : 0 }));
    msg.victory = sim.victory();
  }
  ctx.postMessage(msg, [ents.buffer, builds.buffer, sights.buffer]);
}
