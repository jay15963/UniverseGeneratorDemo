/// <reference lib="webworker" />
// Helper worker: generates terrain chunks from a window of planet fields.
// Several of these run in parallel so chunk streaming uses every CPU core.
import { TerrainGenerator, PlanetFields } from './terrainGen';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let gen: TerrainGenerator | null = null;

ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.kind === 'init') { gen = new TerrainGenerator(m.fields as PlanetFields); ctx.postMessage({ kind: 'ready', id: m.id }); return; }
    if (m.kind === 'region' && gen) {
      const px = gen.region(m.tx, m.ty, m.step, m.n);
      ctx.postMessage({ kind: 'region', id: m.id, px }, [px.buffer]);
      return;
    }
    if (m.kind === 'chunk' && gen) {
      const t0 = performance.now();
      const chunk = gen.chunk(m.cx, m.cy);
      ctx.postMessage({ kind: 'chunk', id: m.id, chunk, ms: performance.now() - t0 },
        [...chunk.rows.flatMap(r => [r.px.buffer, ...(r.anim ?? []).map(a => a.buffer)]), chunk.ground.buffer, chunk.biome.buffer, chunk.rock.buffer,
          chunk.temp.buffer, chunk.level.buffer, chunk.ramp.buffer, chunk.lava.buffer, chunk.mini.buffer]);
    }
  } catch (e) {
    ctx.postMessage({ kind: 'error', id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
};
