/// <reference lib="webworker" />
// Finds the home world off the main thread (walking galaxies and star systems takes up to ~1-2 s).
import { pickHomeworld } from './homeworld';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent<{ seed: string; mode: 'earth' | 'alien' }>) => {
  try { ctx.postMessage({ ok: true, home: pickHomeworld(ev.data.seed, ev.data.mode) }); }
  catch (e) { ctx.postMessage({ ok: false, message: e instanceof Error ? e.message : String(e) }); }
};
