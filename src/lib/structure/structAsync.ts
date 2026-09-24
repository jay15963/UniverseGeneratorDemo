// Worker-backed structure renders for the big gameplay LOD (kept apart from render.ts so the worker bundle does not
// reference itself).
import type { Dir8 } from '../creature/pose';
import { cache, specKey, toCanvas, SFRAMES, StructSpec, StructSprite } from './render';

// ---------------------------------------------------------------------------------------------------
let worker: Worker | null = null, nextId = 1;
const waiting = new Map<number, (m: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
function post(msg: object): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!worker) {
    worker = new Worker(new URL('./struct.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => { const cb = waiting.get(ev.data.id); waiting.delete(ev.data.id); cb?.(ev.data); };
  }
  const id = nextId++;
  return new Promise(res => { waiting.set(id, res); worker!.postMessage({ ...msg, id }); });
}
export async function renderStructureAsync(s: StructSpec, dir: Dir8, k: number, frames = SFRAMES): Promise<StructSprite | null> {
  const key = `${specKey(s)}|${dir}|${frames}|${k}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = await post({ spec: s, dir, frames, k });
  if (!m.ok) { console.warn('structure render failed', m.message); return null; }
  const sp = { frames: (m.frames as Uint8ClampedArray[]).map(f => toCanvas(f, m.w, m.h)), w: m.w, h: m.h, ax: m.ax, ay: m.ay };
  if (cache.size > 160) cache.delete(cache.keys().next().value!);
  cache.set(key, sp);
  return sp;
}
export async function structSheetAsync(s: StructSpec, k: number) {
  const m = await post({ kind: 'sheet', spec: s, k });
  return m.ok ? { data: m.data as Uint8ClampedArray, cw: m.cw as number, ch: m.ch as number, frames: m.frames as number } : null;
}
