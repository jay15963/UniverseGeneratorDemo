/// <reference lib="webworker" />
// Renders vehicles off the main thread (gameplay-scale frames are large).
import { vehicleData, vehicleSheet } from './render';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.kind === 'sheet') {
      const sh = vehicleSheet(m.spec, m.k);
      ctx.postMessage({ id: m.id, ok: true, ...sh }, [sh.data.buffer]);
    } else {
      const d = vehicleData(m.spec, m.dir, m.frames, m.k);
      ctx.postMessage({ id: m.id, ok: true, ...d }, d.frames.map(f => f.buffer));
    }
  } catch (e) {
    ctx.postMessage({ id: m.id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
