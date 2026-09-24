// Turns a genome + stage + facing into animated pixel-art frames.
import { Genome, Stage, isCiv, isGiant } from './genome';
import { makeKit } from './kit';
import { rasterize, shapeBounds, Part } from './raster';
import { Sketch, Dir8, DIR_SRC, FACINGS } from './pose';
import { buildCell, Rig } from './cell';
import { buildLarva, buildSwimmer, buildAmphibian, buildLand } from './bodies';
import { buildCiv } from './civ';

export interface CreatureSprite {
  frames: HTMLCanvasElement[];
  w: number; h: number;
  /** pixel inside the frame that sits on the ground (land) or at the swim centre (sea) */
  ax: number; ay: number;
  grounded: boolean;
}

export const FRAMES = 8;

export function buildParts(g: Genome, stage: Stage, frame: number, dir: Dir8 = 'E', citizen = 0, frames = FRAMES): Part[] {
  const ph = (frame / frames) * Math.PI * 2;
  const blink = frame === frames - 2 && g.r[3] > 0.2;
  const k = makeKit(g, stage);
  if (stage === Stage.CELL) { const rig = new Rig(); buildCell(rig, k, g, ph); return rig.parts; }
  const S = new Sketch(FACINGS[DIR_SRC[dir][0]]);
  switch (stage) {
    case Stage.AQUA_LARVA: buildLarva(S, k, g, ph, blink); break;
    case Stage.AQUA: case Stage.AQUA_GIANT: buildSwimmer(S, k, g, ph, blink, stage === Stage.AQUA_GIANT); break;
    case Stage.AMPHIBIAN: case Stage.AMPHIBIAN_GIANT: buildAmphibian(S, k, g, ph, blink, stage === Stage.AMPHIBIAN_GIANT); break;
    case Stage.LAND: case Stage.LAND_GIANT: buildLand(S, k, g, ph, blink, stage === Stage.LAND_GIANT); break;
    default: buildCiv(S, k, g, stage, ph, blink, citizen); break;
  }
  return S.parts();
}

const cache = new Map<string, CreatureSprite>();
const keyOf = (g: Genome, stage: Stage, dir: Dir8, citizen: number, frames: number) =>
  `${g.seed}|${g.mode}|${Object.values(g.params).map(v => v.toFixed(3)).join(',')}|${g.locomotion}|${g.covering}|${g.legType}|${stage}|${dir}|${citizen}|${frames}`;

export function renderCreature(g: Genome, stage: Stage, dir: Dir8 = 'E', citizen = 0, frames = FRAMES): CreatureSprite {
  const d: Dir8 = stage === Stage.CELL ? 'E' : dir;
  const key = keyOf(g, stage, d, isCiv(stage) ? citizen : 0, frames);
  const hit = cache.get(key);
  if (hit) return hit;
  const [src, mirror] = DIR_SRC[d];
  // mirrored facings reuse the drawn one, flipped
  if (mirror) {
    const base = renderCreature(g, stage, src as Dir8, citizen, frames);
    const fl = base.frames.map(f => {
      const c = document.createElement('canvas');
      c.width = f.width; c.height = f.height;
      const x = c.getContext('2d')!;
      x.translate(f.width, 0); x.scale(-1, 1); x.drawImage(f, 0, 0);
      return c;
    });
    const sp = { ...base, frames: fl, ax: base.w - base.ax };
    cache.set(key, sp);
    return sp;
  }
  const all = Array.from({ length: frames }, (_, f) => buildParts(g, stage, f, d, citizen, frames));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of all) for (const p of parts) {
    const [a, b, c2, e] = shapeBounds(p.s);
    const fz = p.m.fuzz ?? 0;
    x0 = Math.min(x0, a - fz); y0 = Math.min(y0, b - fz); x1 = Math.max(x1, c2 + fz); y1 = Math.max(y1, e + fz);
  }
  const pad = 3;
  const ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out = all.map(parts => {
    for (const p of parts) translate(p, ox, oy);
    const r = rasterize(parts, w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    return c;
  });
  const sprite = { frames: out, w, h, ax: ox, ay: oy, grounded: stage >= Stage.AMPHIBIAN };
  if (cache.size > 160) cache.delete(cache.keys().next().value!);
  cache.set(key, sprite);
  void isGiant;
  return sprite;
}

function translate(p: Part, dx: number, dy: number) {
  const s = p.s;
  if (s.k === 'e') { s.x += dx; s.y += dy; }
  else if (s.k === 'c') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
}
