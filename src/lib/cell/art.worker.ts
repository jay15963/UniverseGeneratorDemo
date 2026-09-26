/// <reference lib="webworker" />
// Rasterises cellular-era sprites off the main thread: species kinds, wild life and props.
import { drawKind, drawNeutral, drawProp, PropKind } from './art';
import type { CellSpecies, Kind } from './look';

export type ArtJob =
  | { key: string; t: 'kind'; sp: CellSpecies; kind: Kind }
  | { key: string; t: 'neutral'; kind: Kind; variant: number }
  | { key: string; t: 'prop'; prop: PropKind; variant: number; frames: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent<{ id: number; jobs: ArtJob[] }>) => {
  const out = ev.data.jobs.map(j => {
    const s = j.t === 'kind' ? drawKind(j.sp, j.kind) : j.t === 'neutral' ? drawNeutral(j.kind, j.variant) : drawProp(j.prop, j.variant, j.frames);
    // one strip: the frames side by side
    const strip = new Uint8ClampedArray(s.w * s.frames.length * s.h * 4);
    const W = s.w * s.frames.length;
    s.frames.forEach((f, fi) => { for (let y = 0; y < s.h; y++) strip.set(f.subarray(y * s.w * 4, (y + 1) * s.w * 4), (y * W + fi * s.w) * 4); });
    return { key: j.key, w: s.w, h: s.h, frames: s.frames.length, data: strip };
  });
  ctx.postMessage({ id: ev.data.id, out }, out.map(o => o.data.buffer));
};
