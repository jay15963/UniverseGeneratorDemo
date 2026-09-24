// Turns a genome + stage + facing + animation into pixel-art frames.
// The core (spriteData / spriteSheet) is DOM-free so it also runs inside a Web Worker.
import { Genome, Stage, isCiv } from './genome';
import { makeKit } from './kit';
import { rasterize, shapeBounds, Part, Tex } from './raster';
import { Sketch, Dir8, DIRS, DIR_SRC, FACINGS, Anim } from './pose';
import { buildCell, Rig } from './cell';
import { buildLarva, buildSwimmer, buildAmphibian, buildLand } from './bodies';
import { buildCiv, LoadHooks } from './civ';

export const FRAMES = 8;
export type { Anim };

export const ANIM_PT: Record<Anim, string> = { idle: 'Parado', walk: 'Andando', run: 'Correndo', fly: 'Voando', swim: 'Nadando', use: 'Usando' };

/** Animations that make sense for a creature at a stage (first = default). */
export function animsFor(g: Genome, stage: Stage): Anim[] {
  if (stage === Stage.CELL) return ['swim'];
  if (stage <= Stage.AQUA_GIANT) return ['swim', 'idle', 'run'];
  if (isCiv(stage)) return ['idle', 'walk', 'run'];
  if (stage === Stage.AMPHIBIAN || stage === Stage.AMPHIBIAN_GIANT) return ['idle', 'walk'];
  const flies = g.wings !== 'none' || g.locomotion === 'flyer' || g.locomotion === 'dragon';
  if (g.locomotion === 'serpent') return ['idle', 'walk'];
  return flies ? ['idle', 'walk', 'fly'] : ['idle', 'walk', 'run'];
}

const SMALL_TEX: Partial<Record<Tex, Tex>> = { mail: 'metal', quilt: 'cloth', scales: 'skin', feathers: 'skin', plates: 'skin', chitin: 'smooth', fin: 'smooth', knit: 'cloth', wool: 'cloth', denim: 'cloth', compound: 'smooth' };

export function buildParts(g: Genome, stage: Stage, frame: number, dir: Dir8 = 'E', citizen = 0, frames = FRAMES, anim: Anim = 'walk', k = 1, load?: LoadHooks): Part[] {
  const ph = (frame / frames) * Math.PI * 2;
  const blink = frame === frames - 2 && g.r[3] > 0.2 && anim !== 'use';
  const kit = makeKit(g, stage);
  let parts: Part[];
  if (stage === Stage.CELL) {
    const rig = new Rig(); buildCell(rig, kit, g, ph); parts = rig.parts;
    if (k !== 1) for (const p of parts) scalePart(p, k);
  } else {
    const S = new Sketch(FACINGS[DIR_SRC[dir][0]], anim, k);
    switch (stage) {
      case Stage.AQUA_LARVA: buildLarva(S, kit, g, ph, blink); break;
      case Stage.AQUA: case Stage.AQUA_GIANT: buildSwimmer(S, kit, g, ph, blink, stage === Stage.AQUA_GIANT); break;
      case Stage.AMPHIBIAN: case Stage.AMPHIBIAN_GIANT: buildAmphibian(S, kit, g, ph, blink, stage === Stage.AMPHIBIAN_GIANT); break;
      case Stage.LAND: case Stage.LAND_GIANT: buildLand(S, kit, g, ph, blink, stage === Stage.LAND_GIANT); break;
      default: buildCiv(S, kit, g, stage, ph, blink, citizen, load); break;
    }
    parts = S.parts();
  }
  // at gameplay size, fine surface textures turn to noise: simplify them and tame fur fuzz
  if (k < 0.7) for (const p of parts) p.m = { ...p.m, tex: SMALL_TEX[p.m.tex] ?? p.m.tex, fuzz: p.m.fuzz ? Math.max(0.3, p.m.fuzz * k * 1.4) : p.m.fuzz };
  return parts;
}

function scalePart(p: Part, k: number) {
  const s = p.s;
  if (s.k === 'e') { s.x *= k; s.y *= k; s.rx = Math.max(0.5, s.rx * k); s.ry = Math.max(0.5, s.ry * k); }
  else if (s.k === 'c') { s.x1 *= k; s.y1 *= k; s.x2 *= k; s.y2 *= k; s.r1 = Math.max(0.5, s.r1 * k); s.r2 = Math.max(0.5, s.r2 * k); }
  else for (let i = 0; i < s.pts.length; i++) s.pts[i] *= k;
}

export interface SpriteData { frames: Uint8ClampedArray[]; w: number; h: number; ax: number; ay: number; grounded: boolean }

/** DOM-free render of one facing (mirrored facings are flipped copies). */
export function spriteData(g: Genome, stage: Stage, dir: Dir8 = 'E', citizen = 0, frames = FRAMES, anim: Anim = 'walk', k = 1, load?: LoadHooks): SpriteData {
  const d: Dir8 = stage === Stage.CELL ? 'E' : dir;
  const [src, mirror] = DIR_SRC[d];
  if (mirror) {
    const b = spriteData(g, stage, src as Dir8, citizen, frames, anim, k, load);
    return { ...b, ax: b.w - b.ax, frames: b.frames.map(f => flip(f, b.w, b.h)) };
  }
  const all = Array.from({ length: frames }, (_, f) => buildParts(g, stage, f, d, citizen, frames, anim, k, load));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of all) for (const p of parts) {
    const [a, b, c2, e] = shapeBounds(p.s);
    const fz = p.m.fuzz ?? 0;
    x0 = Math.min(x0, a - fz); y0 = Math.min(y0, b - fz); x1 = Math.max(x1, c2 + fz); y1 = Math.max(y1, e + fz);
  }
  const pad = 2;
  const ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out = all.map(parts => { for (const p of parts) translate(p, ox, oy); return rasterize(parts, w, h).data; });
  return { frames: out, w, h, ax: ox, ay: oy, grounded: stage >= Stage.AMPHIBIAN };
}

function flip(px: Uint8ClampedArray, w: number, h: number) {
  const o = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
    o[b] = px[a]; o[b + 1] = px[a + 1]; o[b + 2] = px[a + 2]; o[b + 3] = px[a + 3];
  }
  return o;
}

export interface SheetData { data: Uint8ClampedArray; cw: number; ch: number; ax: number; ay: number; frames: number; grounded: boolean }

/** All 8 facings of one animation in one sheet: rows = DIRS order, columns = frames, shared anchor. */
export function spriteSheet(g: Genome, stage: Stage, anim: Anim, k: number, citizen = 0, frames = FRAMES): SheetData {
  const sps = DIRS.map(d => spriteData(g, stage, d, citizen, frames, anim, k));
  const ax = Math.max(...sps.map(s => s.ax)), right = Math.max(...sps.map(s => s.w - s.ax));
  const ay = Math.max(...sps.map(s => s.ay)), below = Math.max(...sps.map(s => s.h - s.ay));
  const cw = ax + right, ch = ay + below;
  const W = cw * frames, H = ch * DIRS.length;
  const data = new Uint8ClampedArray(W * H * 4);
  sps.forEach((sp, row) => sp.frames.forEach((f, col) => {
    const ox = col * cw + ax - sp.ax, oy = row * ch + ay - sp.ay;
    for (let y = 0; y < sp.h; y++) {
      const src = y * sp.w * 4, dst = ((oy + y) * W + ox) * 4;
      data.set(f.subarray(src, src + sp.w * 4), dst);
    }
  }));
  return { data, cw, ch, ax, ay, frames, grounded: sps[0].grounded };
}

// ---------------------------------------------------------------------------------------------------
// Canvas wrappers (main thread)
// ---------------------------------------------------------------------------------------------------
export interface CreatureSprite { frames: HTMLCanvasElement[]; w: number; h: number; ax: number; ay: number; grounded: boolean }

const cache = new Map<string, CreatureSprite>();
const keyOf = (g: Genome, stage: Stage, dir: Dir8, citizen: number, frames: number, anim: Anim, k: number) =>
  `${g.seed}|${g.mode}|${Object.values(g.params).map(v => v.toFixed(3)).join(',')}|${g.locomotion}|${g.covering}|${g.legType}|${stage}|${dir}|${citizen}|${frames}|${anim}|${k}`;

export const toCanvas = (px: Uint8ClampedArray, w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
  return c;
};

export function renderCreature(g: Genome, stage: Stage, dir: Dir8 = 'E', citizen = 0, frames = FRAMES, anim?: Anim, k = 1): CreatureSprite {
  const a = anim ?? animsFor(g, stage)[stage === Stage.LAND || isCiv(stage) ? 1 : 0] ?? 'walk';
  const key = keyOf(g, stage, dir, isCiv(stage) ? citizen : 0, frames, a, k);
  const hit = cache.get(key);
  if (hit) return hit;
  const d = spriteData(g, stage, dir, citizen, frames, a, k);
  const sprite = { frames: d.frames.map(f => toCanvas(f, d.w, d.h)), w: d.w, h: d.h, ax: d.ax, ay: d.ay, grounded: d.grounded };
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, sprite);
  return sprite;
}

function translate(p: Part, dx: number, dy: number) {
  const s = p.s;
  if (s.k === 'e') { s.x += dx; s.y += dy; }
  else if (s.k === 'c') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
}
