// Worker-backed vehicle renders (kept apart from render.ts so the worker bundle does not reference itself).
import type { Dir8 } from '../creature/pose';
import { toCanvas } from '../structure/render';
import { vspecKey, VFRAMES, VSpec } from './render';

export interface VehSprite { frames: HTMLCanvasElement[]; w: number; h: number; ax: number; ay: number; hitch: { x: number; y: number; z: number } | null }
const cache = new Map<string, VehSprite>();

let worker: Worker | null = null, nextId = 1;
const waiting = new Map<number, (m: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
function post(msg: object): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!worker) {
    worker = new Worker(new URL('./vehicle.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => { const cb = waiting.get(ev.data.id); waiting.delete(ev.data.id); cb?.(ev.data); };
  }
  const id = nextId++;
  return new Promise(res => { waiting.set(id, res); worker!.postMessage({ ...msg, id }); });
}
export async function renderVehicleAsync(s: VSpec, dir: Dir8, k: number, frames = VFRAMES): Promise<VehSprite | null> {
  const key = `${vspecKey(s)}|${dir}|${frames}|${k}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = await post({ spec: s, dir, frames, k });
  if (!m.ok) { console.warn('vehicle render failed', m.message); return null; }
  const sp = { frames: (m.frames as Uint8ClampedArray[]).map(f => toCanvas(f, m.w, m.h)), w: m.w, h: m.h, ax: m.ax, ay: m.ay, hitch: m.hitch };
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
  cache.set(key, sp);
  return sp;
}
export async function vehicleSheetAsync(s: VSpec, k: number) {
  const m = await post({ kind: 'sheet', spec: s, k });
  return m.ok ? { data: m.data as Uint8ClampedArray, cw: m.cw as number, ch: m.ch as number, frames: m.frames as number } : null;
}
