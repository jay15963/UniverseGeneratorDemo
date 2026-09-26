// Sprite atlas of the cellular era: every sprite strip (its frames side by side) shelf-packed into 2048x2048 layers of a
// texture array. Sprite ids used by the simulation are set * 16 + kind (sets 0..16 = species, 17.. = wild variants).
import type { ArtJob } from './art.worker';
import { Kind, SPECIES_KINDS, CellSpecies } from './look';
import { ROCK_VARIANTS } from './art';
import { NEUTRAL_SET } from './sim';

export const LAYER = 2048;
export interface AtlasEntry { x: number; y: number; w: number; h: number; layer: number; frames: number }
export interface Atlas { layers: Uint8Array[]; entries: Map<string, AtlasEntry>; bySprite: (AtlasEntry | undefined)[] }

export const spriteKey = (set: number, kind: number) => `k:${set}:${kind}`;
export const NEUTRAL_VARIANTS = 7;   // bacteria 0-3, diatoms 4-5, amoeba 6

export function atlasJobs(species: CellSpecies[]): ArtJob[] {
  const jobs: ArtJob[] = [];
  species.forEach((sp, set) => { for (let k = 0; k < SPECIES_KINDS; k++) jobs.push({ key: spriteKey(set, k), t: 'kind', sp, kind: k as Kind }); });
  for (let v = 0; v < NEUTRAL_VARIANTS; v++) {
    const kind = v < 4 ? Kind.BACTERIA : v < 6 ? Kind.DIATOM : Kind.AMOEBA;
    jobs.push({ key: spriteKey(NEUTRAL_SET + v, kind), t: 'neutral', kind, variant: v < 4 ? v : v < 6 ? v - 4 : 0 });
  }
  for (let v = 0; v < 4; v++) jobs.push({ key: `mote:${v}`, t: 'prop', prop: 'mote', variant: v, frames: 4 });
  jobs.push({ key: 'toxin', t: 'prop', prop: 'toxin', variant: 0, frames: 1 });
  for (let v = 0; v < 3; v++) jobs.push({ key: `spark:${v}`, t: 'prop', prop: 'spark', variant: v, frames: 1 });
  for (let v = 0; v < ROCK_VARIANTS; v++) jobs.push({ key: `rock:${v}`, t: 'prop', prop: 'rock', variant: v, frames: 1 });
  for (let v = 0; v < 3; v++) jobs.push({ key: `vent:${v}`, t: 'prop', prop: 'vent', variant: v, frames: 4 });
  return jobs;
}

/** renders the jobs on a worker pool and packs them */
export async function buildAtlas(jobs: ArtJob[], onProgress?: (p: number) => void): Promise<Atlas> {
  const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const workers = Array.from({ length: n }, () => new Worker(new URL('./art.worker.ts', import.meta.url), { type: 'module' }));
  const results: { key: string; w: number; h: number; frames: number; data: Uint8ClampedArray }[] = [];
  let done = 0;
  // small batches so the progress bar moves and the heavy species spread over the pool
  const batches: ArtJob[][] = [];
  for (let i = 0; i < jobs.length; i += 4) batches.push(jobs.slice(i, i + 4));
  await new Promise<void>((resolve) => {
    let next = 0, id = 0;
    const feed = (w: Worker) => {
      if (next >= batches.length) { if (done >= jobs.length) resolve(); return; }
      const b = batches[next++];
      w.postMessage({ id: id++, jobs: b });
    };
    for (const w of workers) {
      w.onmessage = (ev: MessageEvent<{ out: typeof results }>) => {
        results.push(...ev.data.out);
        done += ev.data.out.length;
        onProgress?.(done / jobs.length);
        if (done >= jobs.length) resolve(); else feed(w);
      };
      feed(w);
    }
  });
  workers.forEach(w => w.terminate());

  // shelf packing, tallest first
  results.sort((a, b) => b.h - a.h || b.w * b.frames - a.w * a.frames);
  const layers: Uint8Array[] = [];
  const entries = new Map<string, AtlasEntry>();
  let layer = -1, sx = 0, sy = 0, shelf = 0;
  const newLayer = () => { layers.push(new Uint8Array(LAYER * LAYER * 4)); layer++; sx = 0; sy = 0; shelf = 0; };
  newLayer();
  for (const r of results) {
    const W = r.w * r.frames + 2, H = r.h + 2;
    if (sx + W > LAYER) { sx = 0; sy += shelf; shelf = 0; }
    if (sy + H > LAYER) newLayer();
    const L = layers[layer];
    const rowW = r.w * r.frames;
    for (let y = 0; y < r.h; y++) L.set(r.data.subarray(y * rowW * 4, (y + 1) * rowW * 4), ((sy + 1 + y) * LAYER + sx + 1) * 4);
    entries.set(r.key, { x: sx + 1, y: sy + 1, w: r.w, h: r.h, layer, frames: r.frames });
    sx += W; shelf = Math.max(shelf, H);
  }
  const bySprite: (AtlasEntry | undefined)[] = [];
  for (let set = 0; set < NEUTRAL_SET + NEUTRAL_VARIANTS; set++) for (let k = 0; k < 16; k++) bySprite[set * 16 + k] = entries.get(spriteKey(set, k));
  return { layers, entries, bySprite };
}
