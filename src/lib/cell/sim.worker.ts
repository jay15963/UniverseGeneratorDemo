/// <reference lib="webworker" />
// Runs the cellular-era simulation at a fixed 20 Hz and streams snapshots to the view (which interpolates between the
// last two). The world is rebuilt here from its seed and the player's species, exactly as the view builds it.
import { Sim, TICK, Cmd } from './sim';
import { makeWorld } from './world';
import type { CellSpecies } from './look';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let sim: Sim | null = null;
let timer = 0;

type In = { t: 'init'; seed: string; player: CellSpecies } | { t: 'cmd'; cmd: Cmd } | { t: 'stop' };

ctx.onmessage = (ev: MessageEvent<In>) => {
  const m = ev.data;
  if (m.t === 'init') {
    sim = new Sim(makeWorld(m.seed, m.player));
    ctx.postMessage({ t: 'ready' });
    let last = performance.now(), acc = 0;
    const loop = () => {
      const now = performance.now();
      acc += Math.min(0.5, (now - last) / 1000); last = now;
      let stepped = false;
      while (acc >= TICK) { acc -= TICK; sim!.step(); stepped = true; }
      if (stepped) send();
      timer = setTimeout(loop, Math.max(1, (TICK - acc) * 1000)) as unknown as number;
    };
    loop();
  } else if (m.t === 'cmd') sim?.command(m.cmd);
  else if (m.t === 'stop') { clearTimeout(timer); sim = null; close(); }
};

let lastBio = -1, lastCol = -1, lastStats = -1;
function send() {
  const s = sim!;
  const now = performance.now() / 1000;
  const snap = s.snapshot();
  const out: Record<string, unknown> = { t: 'frame', time: s.time, paused: s.paused, speed: s.speed, ...snap };
  const tr: Transferable[] = [snap.ents.buffer, snap.motes.buffer, snap.shots.buffer];
  if (s.bioDirty && now - lastBio > 0.4) {
    s.bioDirty = false; lastBio = now;
    const own = s.bOwn.slice(), str = s.bStr.slice();
    out.bioOwn = own; out.bioStr = str; tr.push(own.buffer, str.buffer);
  }
  if (now - lastCol >= 1 || lastCol < 0) { lastCol = now; const c = s.colonyTable(); out.colonies = c; tr.push(c.buffer); }
  if (now - lastStats >= 0.2 || lastStats < 0) { lastStats = now; out.stats = s.stats(); out.goals = { ...s.goals }; }
  ctx.postMessage(out, tr);
}
