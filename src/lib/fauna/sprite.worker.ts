/// <reference lib="webworker" />
// Renders creature sprite sheets (8 facings x 8 frames) off the main thread.
import { spriteSheet } from '../creature/render';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    const sh = spriteSheet(m.genome, m.stage, m.anim, m.k, m.citizen ?? 0);
    ctx.postMessage({ id: m.id, ok: true, ...sh }, [sh.data.buffer]);
  } catch (e) {
    ctx.postMessage({ id: m.id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
