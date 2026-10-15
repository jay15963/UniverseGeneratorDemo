/// <reference lib="webworker" />
// Renders creature sprite sheets (8 facings x 8 frames) off the main thread.
import { spriteSheet } from '../creature/render';
import { equippedSheet } from '../equipment/loadout';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    // soldiers: the civilised creature with an equipment loadout (and its death animations)
    const sh = m.load ? equippedSheet(m.genome, m.era, m.load, m.anim, m.k, m.death ?? undefined) : spriteSheet(m.genome, m.stage, m.anim, m.k, m.citizen ?? 0);
    ctx.postMessage({ id: m.id, ok: true, ...sh }, [sh.data.buffer]);
  } catch (e) {
    ctx.postMessage({ id: m.id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
