// Turns a genome + stage into animated pixel-art frames.
import { Genome, Stage } from './genome';
import { Rig, makeKit } from './rig';
import { rasterize, shapeBounds, Part } from './raster';
import { buildCell, buildLarva, buildSwimmer, buildAmphibian, buildLand } from './anatomy';
import { buildCiv } from './civ';

export interface CreatureSprite {
  frames: HTMLCanvasElement[];
  w: number; h: number;
  /** pixel inside the frame that sits on the ground (land) or at the swim centre (sea) */
  ax: number; ay: number;
  grounded: boolean;
}

export const FRAMES = 8;

export function buildParts(g: Genome, stage: Stage, frame: number, frames = FRAMES): Part[] {
  const ph = (frame / frames) * Math.PI * 2;
  const blink = frame === frames - 2 && g.r[3] > 0.2;
  const rig = new Rig();
  const k = makeKit(g, stage === Stage.AMPHIBIAN ? 'skin' : stage <= Stage.AQUA_GIANT ? (g.aquaForm === 'crustacean' ? 'chitin' : g.covering === 'plates' && stage === Stage.AQUA_GIANT ? 'plates' : g.aquaForm === 'fish' ? 'scales' : 'skin') : undefined);
  switch (stage) {
    case Stage.CELL: buildCell(rig, k, g, ph); break;
    case Stage.AQUA_LARVA: buildLarva(rig, k, g, ph, blink); break;
    case Stage.AQUA: buildSwimmer(rig, k, g, ph, blink, false); break;
    case Stage.AQUA_GIANT: buildSwimmer(rig, k, g, ph, blink, true); break;
    case Stage.AMPHIBIAN: buildAmphibian(rig, k, g, ph, blink); break;
    case Stage.LAND: buildLand(rig, k, g, ph, blink); break;
    default: buildCiv(rig, k, g, stage, ph, blink); break;
  }
  return rig.parts;
}

const cache = new Map<string, CreatureSprite>();
const keyOf = (g: Genome, stage: Stage, frames: number) => `${g.seed}|${Object.values(g.params).map(v => v.toFixed(3)).join(',')}|${g.locomotion}|${g.covering}|${stage}|${frames}`;

export function renderCreature(g: Genome, stage: Stage, frames = FRAMES): CreatureSprite {
  const key = keyOf(g, stage, frames);
  const hit = cache.get(key);
  if (hit) return hit;
  const all = Array.from({ length: frames }, (_, f) => buildParts(g, stage, f, frames));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of all) for (const p of parts) {
    const [a, b, c, d] = shapeBounds(p.s);
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
  }
  const pad = 3;
  const ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out: HTMLCanvasElement[] = all.map(parts => {
    for (const p of parts) translate(p, ox, oy);
    const r = rasterize(parts, w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    return c;
  });
  const sprite = { frames: out, w, h, ax: ox, ay: oy, grounded: stage >= Stage.AMPHIBIAN };
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  cache.set(key, sprite);
  return sprite;
}

function translate(p: Part, dx: number, dy: number) {
  const s = p.s;
  if (s.k === 'e') { s.x += dx; s.y += dy; }
  else if (s.k === 'c') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
}
