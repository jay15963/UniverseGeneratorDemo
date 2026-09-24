// Turns a vehicle spec + facing + animation + frame into pixel-art frames (DOM-free, runs in the worker too).
// Same pipeline as the structures: pieces drafted per facing (draft.ts), painted by the creatures' rasterizer.
import { rasterize, Part } from '../creature/raster';
import { DIRS, DIR_SRC, FACINGS, Dir8 } from '../creature/pose';
import { mulberry, seedToInt } from '../terrain/noise';
import { Draft } from '../structure/draft';
import { makeKit, Kit } from '../structure/kit';
import type { Culture } from '../structure/genome';
import { shapeBox, translate, flip } from '../structure/render';
import { palette, VAnim, VCtx } from './vparts';
import { vtypeById, tierZ, VSize } from './catalog';

export const VFRAMES = 8;
export interface VSpec { culture: Culture; type: string; size: VSize; era: number; variant: number; night: boolean; anim: VAnim }

const kits = new Map<string, Kit>();
function kitFor(s: VSpec) {
  const key = `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).join(',')}|${s.era}|${s.night}`;
  let k = kits.get(key);
  if (!k) { k = makeKit(s.culture, s.era, s.night); if (kits.size > 64) kits.clear(); kits.set(key, k); }
  return k;
}

export function buildParts(s: VSpec, dir: Dir8, frame: number, frames = VFRAMES, k = 1) {
  const [src] = DIR_SRC[dir];
  const ph = (frame / frames) * Math.PI * 2;
  const D = new Draft(FACINGS[src], k, ph);
  const t = vtypeById(s.type);
  // design numbers: the same for every era, size, frame and facing, so a design stays recognisable through the ages
  const dr = mulberry(seedToInt(`${s.culture.seed}|veh|${s.type}|${s.variant}`));
  const d = Array.from({ length: 16 }, () => dr());
  const x = {
    D, K: kitFor(s), C: s.culture, e: s.era, r: mulberry(seedToInt(`${s.culture.seed}|${s.type}|${s.size}|${s.variant}|${s.era}`)),
    t: frame / frames, ph, night: s.night, size: s.size, wid: 0, anim: s.anim, d, Z: tierZ(t, s.size, s.era),
  } as unknown as VCtx;
  x.P = palette(x);
  const war = t.cls !== 'civil' && s.era >= 3;
  x.body = war ? x.P.mil : x.P.paint;
  x.body2 = war ? x.P.mil2 : t.cls === 'civil' ? x.P.paint2 : x.P.wood;
  t.build(x);
  const hitch = x.hitch ? { p: D.P(x.hitch), z: D.depth(x.hitch) } : null;
  return { parts: D.parts(), hitch };
}

/** frames of one facing; (ax, ay) is the ground centre of the vehicle; hitch = where beasts are harnessed, relative
 * to that centre (screen px), with z > 0 when it is nearer the viewer than the centre */
export interface VData { frames: Uint8ClampedArray[]; w: number; h: number; ax: number; ay: number; hitch: { x: number; y: number; z: number } | null }

export function vehicleData(s: VSpec, dir: Dir8, frames = VFRAMES, k = 1): VData {
  const [src, mirror] = DIR_SRC[dir];
  if (mirror) {
    const b = vehicleData(s, src as Dir8, frames, k);
    return { ...b, ax: b.w - b.ax, frames: b.frames.map(f => flip(f, b.w, b.h)), hitch: b.hitch && { ...b.hitch, x: -b.hitch.x } };
  }
  const all = Array.from({ length: frames }, (_, f) => buildParts(s, dir, f, frames, k));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const { parts } of all) for (const p of parts) {
    const [a, b, c, e] = shapeBox(p), fz = p.m.fuzz ?? 0;
    x0 = Math.min(x0, a - fz); y0 = Math.min(y0, b - fz); x1 = Math.max(x1, c + fz); y1 = Math.max(y1, e + fz);
  }
  const pad = 2, ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out = all.map(({ parts }) => { for (const p of parts as Part[]) translate(p, ox, oy); return rasterize(parts, w, h).data; });
  const hz = all[0].hitch;
  return { frames: out, w, h, ax: ox, ay: oy, hitch: hz ? { x: hz.p[0], y: hz.p[1], z: hz.z } : null };
}

/** all 8 facings in one sheet: rows = DIRS order, columns = frames, shared anchor */
export function vehicleSheet(s: VSpec, k = 1, frames = VFRAMES) {
  const sps = DIRS.map(d => vehicleData(s, d, frames, k));
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
export const vspecKey = (s: VSpec) => `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).map(v => v.toFixed(3)).join(',')}|${s.type}|${s.size}|${s.era}|${s.variant}|${s.night}|${s.anim}`;
