// Turns a structure spec + facing + frame into pixel-art frames (DOM-free core, like the creatures).
import { rasterize, Part, Tex } from '../creature/raster';
import { DIRS, DIR_SRC, FACINGS, Dir8 } from '../creature/pose';
import { mulberry, seedToInt } from '../terrain/noise';
import { Draft } from './draft';
import { makeKit, Kit } from './kit';
import type { Culture, Size } from './genome';
import { typeById } from './registry';
import type { Ctx } from './parts';

export const SFRAMES = 8;
export interface StructSpec { culture: Culture; type: string; size: Size; era: number; variant: number; night: boolean }

const kits = new Map<string, Kit>();
function kitFor(s: StructSpec) {
  const key = `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).join(',')}|${s.era}|${s.night}`;
  let k = kits.get(key);
  if (!k) { k = makeKit(s.culture, s.era, s.night); if (kits.size > 64) kits.clear(); kits.set(key, k); }
  return k;
}

const SMALL_TEX: Partial<Record<Tex, Tex>> = { brick: 'smooth', stone: 'smooth', ashlar: 'smooth', shingle: 'smooth', tile: 'smooth', panel: 'smooth', hex: 'smooth', plank: 'smooth', log: 'smooth', thatch: 'smooth', glazing: 'glass' };

export function buildParts(s: StructSpec, dir: Dir8, frame: number, frames = SFRAMES, k = 1): Part[] {
  const [src] = DIR_SRC[dir];
  const ph = (frame / frames) * Math.PI * 2;
  const D = new Draft(FACINGS[src], k, ph);
  const x: Ctx = {
    D, K: kitFor(s), C: s.culture, e: s.era, r: mulberry(seedToInt(`${s.culture.seed}|${s.type}|${s.size}|${s.variant}|${s.era}`)),
    t: frame / frames, ph, night: s.night, size: s.size, wid: 0,
  };
  typeById(s.type).build(x);
  const parts = D.parts();
  if (k < 0.7) for (const p of parts) p.m = { ...p.m, tex: SMALL_TEX[p.m.tex] ?? p.m.tex, fuzz: p.m.fuzz ? Math.max(0.3, p.m.fuzz * k) : p.m.fuzz };
  return parts;
}

function shapeBox(p: Part): [number, number, number, number] {
  const s = p.s;
  if (s.k === 'e') { const r = Math.max(s.rx, s.ry) + 2; return [s.x - r, s.y - r, s.x + r, s.y + r]; }
  if (s.k === 'c') { const r = Math.max(s.r1, s.r2) + 2; return [Math.min(s.x1, s.x2) - r, Math.min(s.y1, s.y2) - r, Math.max(s.x1, s.x2) + r, Math.max(s.y1, s.y2) + r]; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]); }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
}
function translate(p: Part, dx: number, dy: number) {
  const s = p.s;
  if (s.k === 'e') { s.x += dx; s.y += dy; }
  else if (s.k === 'c') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] += dx; s.pts[i + 1] += dy; }
  if (p.uv) { const q = p.uv; q[2] -= q[0] * dx + q[1] * dy; q[5] -= q[3] * dx + q[4] * dy; }
}
function flip(px: Uint8ClampedArray, w: number, h: number) {
  const o = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
    o[b] = px[a]; o[b + 1] = px[a + 1]; o[b + 2] = px[a + 2]; o[b + 3] = px[a + 3];
  }
  return o;
}

/** frames of one facing; (ax, ay) is the ground centre of the structure */
export interface SData { frames: Uint8ClampedArray[]; w: number; h: number; ax: number; ay: number }

export function structData(s: StructSpec, dir: Dir8, frames = SFRAMES, k = 1): SData {
  const [src, mirror] = DIR_SRC[dir];
  if (mirror) {
    const b = structData(s, src as Dir8, frames, k);
    return { ...b, ax: b.w - b.ax, frames: b.frames.map(f => flip(f, b.w, b.h)) };
  }
  const all = Array.from({ length: frames }, (_, f) => buildParts(s, dir, f, frames, k));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of all) for (const p of parts) {
    const [a, b, c, e] = shapeBox(p), fz = p.m.fuzz ?? 0;
    x0 = Math.min(x0, a - fz); y0 = Math.min(y0, b - fz); x1 = Math.max(x1, c + fz); y1 = Math.max(y1, e + fz);
  }
  const pad = 2, ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out = all.map(parts => { for (const p of parts) translate(p, ox, oy); return rasterize(parts, w, h).data; });
  return { frames: out, w, h, ax: ox, ay: oy };
}

/** all 8 facings in one sheet: rows = DIRS order, columns = frames, shared anchor */
export function structSheet(s: StructSpec, k = 1, frames = SFRAMES) {
  const sps = DIRS.map(d => structData(s, d, frames, k));
  const ax = Math.max(...sps.map(q => q.ax)), right = Math.max(...sps.map(q => q.w - q.ax));
  const ay = Math.max(...sps.map(q => q.ay)), below = Math.max(...sps.map(q => q.h - q.ay));
  const cw = ax + right, ch = ay + below, W = cw * frames, H = ch * DIRS.length;
  const data = new Uint8ClampedArray(W * H * 4);
  sps.forEach((sp, row) => sp.frames.forEach((f, col) => {
    const ox = col * cw + ax - sp.ax, oy = row * ch + ay - sp.ay;
    for (let y = 0; y < sp.h; y++) data.set(f.subarray(y * sp.w * 4, (y + 1) * sp.w * 4), ((oy + y) * W + ox) * 4);
  }));
  return { data, cw, ch, ax, ay, frames };
}

// ---------------------------------------------------------------------------------------------------
// Canvas wrappers (main thread)
// ---------------------------------------------------------------------------------------------------
export interface StructSprite { frames: HTMLCanvasElement[]; w: number; h: number; ax: number; ay: number }
const cache = new Map<string, StructSprite>();
export const specKey = (s: StructSpec) => `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).map(v => v.toFixed(3)).join(',')}|${s.type}|${s.size}|${s.era}|${s.variant}|${s.night}`;
export const toCanvas = (px: Uint8ClampedArray, w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
  return c;
};
export function renderStructure(s: StructSpec, dir: Dir8, frames = SFRAMES, k = 1): StructSprite {
  const key = `${specKey(s)}|${dir}|${frames}|${k}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const d = structData(s, dir, frames, k);
  const sp = { frames: d.frames.map(f => toCanvas(f, d.w, d.h)), w: d.w, h: d.h, ax: d.ax, ay: d.ay };
  if (cache.size > 160) cache.delete(cache.keys().next().value!);
  cache.set(key, sp);
  return sp;
}
