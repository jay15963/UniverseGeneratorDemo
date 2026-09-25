// Turns a vehicle spec + facing + animation + frame into pixel-art frames (DOM-free, runs in the worker too).
// Same pipeline as the structures: pieces drafted per facing (draft.ts), painted by the creatures' rasterizer.
// Turrets are tagged while drawing, so a render can keep only the body (layer 'body') or one turret ('t<id>'),
// anchored on its pivot - the game composes a hull facing with a turret facing of its own.
import { rasterize, Part } from '../creature/raster';
import { DIRS, DIR_SRC, FACINGS, Dir8 } from '../creature/pose';
import { mulberry, seedToInt } from '../terrain/noise';
import { Draft } from '../structure/draft';
import { makeKit, Kit } from '../structure/kit';
import type { Culture } from '../structure/genome';
import { shapeBox, translate, flip } from '../structure/render';
import { palette, civilPaint, warPaint, pick, VAnim, VCtx, Scheme } from './vparts';
import { vtypeById, tierZ, VSize } from './catalog';

export const VFRAMES = 8;
export interface VSpec {
  culture: Culture; type: string; size: VSize; era: number; variant: number; night: boolean; anim: VAnim;
  /** absolute direction the turrets aim at (null = they sweep on their own) */
  aim?: Dir8 | null;
}
export type Layer = 'all' | 'body' | string;

const kits = new Map<string, Kit>();
function kitFor(s: VSpec) {
  const key = `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).join(',')}|${s.era}|${s.night}`;
  let k = kits.get(key);
  if (!k) { k = makeKit(s.culture, s.era, s.night); if (kits.size > 64) kits.clear(); kits.set(key, k); }
  return k;
}
const MIRROR: Record<Dir8, Dir8> = { E: 'W', W: 'E', SE: 'SW', SW: 'SE', NE: 'NW', NW: 'NE', S: 'S', N: 'N' };
/** turret yaw relative to a hull facing `dir` for an absolute aim (yaw + turns towards +a, the vehicle's left:
 * DIRS run clockwise seen from above, so a clockwise step is a negative yaw) */
export function relAim(dir: Dir8, aim: Dir8) { let d = -((DIRS.indexOf(aim) - DIRS.indexOf(dir)) * Math.PI) / 4; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function schemeFor(e: number, u: number): Scheme {
  if (e === 3) return pick<Scheme>(u, [['plain', 3], ['bands', 1]]);
  if (e === 4) return pick<Scheme>(u, [['plain', 2], ['blotch', 3]]);
  if (e === 5) return pick<Scheme>(u, [['blotch', 2], ['tiger', 1], ['split', 2], ['stripes', 1]]);
  if (e === 6) return pick<Scheme>(u, [['digital', 3], ['split', 2], ['plain', 1]]);
  return pick<Scheme>(u, [['plain', 3], ['split', 1]]);
}

/** the vehicle context for one frame: palette, paints, design numbers */
export function makeCtx(s: VSpec, D: Draft, frame: number, frames: number, rel: number | null): VCtx {
  const t = vtypeById(s.type);
  const dr = mulberry(seedToInt(`${s.culture.seed}|veh|${s.type}|${s.variant}`));
  const d = Array.from({ length: 32 }, () => dr());
  const x = {
    D, K: kitFor(s), C: s.culture, e: s.era, r: mulberry(seedToInt(`${s.culture.seed}|${s.type}|${s.size}|${s.variant}|${s.era}`)),
    t: frame / frames, ph: (frame / frames) * Math.PI * 2, night: s.night, size: s.size, wid: 0, anim: s.anim, d, Z: tierZ(t, s.size, s.era),
    aim: rel, pivots: [], war: t.cls !== 'civil',
  } as unknown as VCtx;
  x.P = palette(x);
  const P = x.P;
  if (!x.war || s.era <= 2) { const [a, b] = civilPaint(x, d[25], d[26]); x.body = a; x.body2 = b; }
  else if (t.domain === 'naval') {
    const dazzle = (s.era === 3 || s.era === 4) && d[27] < 0.35;
    x.body = dazzle ? warPaint(x, P.navy, P.boot, 'dazzle', Math.floor(d[28] * 7)) : s.culture.mode === 'alien' ? warPaint(x, P.navy, P.navy2, schemeFor(s.era, d[27]), 3) : P.navy;
    x.body2 = P.navy2;
  } else if (t.domain === 'air' && d[27] < 0.4) { x.body = P.navy; x.body2 = P.navy2; }
  else { x.body = warPaint(x, P.mil, P.mil3, schemeFor(s.era, d[27]), Math.floor(d[28] * 7)); x.body2 = P.mil2; }
  x.trim = P.dark;
  return x;
}

export function buildParts(s: VSpec, dir: Dir8, frame: number, frames = VFRAMES, k = 1) {
  const [src] = DIR_SRC[dir];
  const D = new Draft(FACINGS[src], k, (frame / frames) * Math.PI * 2);
  const x = makeCtx(s, D, frame, frames, s.aim ? relAim(dir, s.aim) : null);
  vtypeById(s.type).build(x);
  const hitch = x.hitch ? { p: D.P(x.hitch), z: D.depth(x.hitch) } : null;
  const pivots = x.pivots.map(q => ({ id: q.id, p: D.P(q.p), z: D.depth(q.p) }));
  return { tagged: D.tagged(), hitch, label: x.label ?? vtypeById(s.type).name, pivots };
}
/** the vehicle's name for a spec (builds one small frame) */
export function vehicleLabel(s: VSpec) { return buildParts(s, 'SE', 0, 1, 0.1).label; }

export interface Mount2D { id: number; x: number; y: number; z: number }
/** frames of one facing; (ax, ay) is the ground centre; hitch and turret mounts relative to it (screen px) */
export interface VData { frames: Uint8ClampedArray[]; w: number; h: number; ax: number; ay: number; hitch: { x: number; y: number; z: number } | null; label: string; mounts: Mount2D[] }

/** `layer`: everything, the body without turrets, or one turret ('t0'...) anchored on its pivot */
export function vehicleData(s: VSpec, dir: Dir8, frames = VFRAMES, k = 1, layer: Layer = 'all'): VData {
  const [src, mirror] = DIR_SRC[dir];
  if (mirror) {
    const b = vehicleData({ ...s, aim: s.aim ? MIRROR[s.aim] : s.aim }, src as Dir8, frames, k, layer);
    return { ...b, ax: b.w - b.ax, frames: b.frames.map(f => flip(f, b.w, b.h)), hitch: b.hitch && { ...b.hitch, x: -b.hitch.x }, mounts: b.mounts.map(m => ({ ...m, x: -m.x })) };
  }
  const all = Array.from({ length: frames }, (_, f) => buildParts(s, dir, f, frames, k));
  const partsOf = (q: typeof all[number]): Part[] => {
    if (layer === 'all') return q.tagged.map(p => p.part);
    const keep = q.tagged.filter(p => (layer === 'body' ? !p.tag : p.tag === layer)).map(p => p.part);
    if (layer !== 'body') { const pv = q.pivots.find(v => `t${v.id}` === layer); if (pv) for (const p of keep) translate(p, -pv.p[0], -pv.p[1]); }
    return keep;
  };
  const lists = all.map(partsOf);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const parts of lists) for (const p of parts) {
    const [a, b, c, e] = shapeBox(p), fz = p.m.fuzz ?? 0;
    x0 = Math.min(x0, a - fz); y0 = Math.min(y0, b - fz); x1 = Math.max(x1, c + fz); y1 = Math.max(y1, e + fz);
  }
  if (x0 > x1) { x0 = -1; y0 = -1; x1 = 1; y1 = 1; }
  const pad = 2, ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2, h = Math.ceil(y1 - y0) + pad * 2;
  const out = lists.map(parts => { for (const p of parts) translate(p, ox, oy); return rasterize(parts, w, h).data; });
  const q0 = all[0];
  return {
    frames: out, w, h, ax: ox, ay: oy, label: q0.label,
    hitch: q0.hitch ? { x: q0.hitch.p[0], y: q0.hitch.p[1], z: q0.hitch.z } : null,
    mounts: q0.pivots.map(v => ({ id: v.id, x: v.p[0], y: v.p[1], z: v.z })),
  };
}

/** all 8 facings in one sheet: rows = DIRS order, columns = frames, shared anchor */
export function vehicleSheet(s: VSpec, k = 1, frames = VFRAMES, layer: Layer = 'all') {
  const sps = DIRS.map(d => (layer === 'all' || layer === 'body' ? vehicleData(s, d, frames, k, layer) : vehicleData({ ...s, aim: d }, 'E', frames, k, layer)));
  const ax = Math.max(...sps.map(q => q.ax)), right = Math.max(...sps.map(q => q.w - q.ax));
  const ay = Math.max(...sps.map(q => q.ay)), below = Math.max(...sps.map(q => q.h - q.ay));
  const cw = ax + right, ch = ay + below, W = cw * frames, H = ch * DIRS.length;
  const data = new Uint8ClampedArray(W * H * 4);
  sps.forEach((sp, row) => sp.frames.forEach((f, col) => {
    const ox = col * cw + ax - sp.ax, oy = row * ch + ay - sp.ay;
    for (let y = 0; y < sp.h; y++) data.set(f.subarray(y * sp.w * 4, (y + 1) * sp.w * 4), ((oy + y) * W + ox) * 4);
  }));
  // mount points of every turret for every hull facing (relative to the body sheet's anchor)
  const mounts = layer === 'body' ? DIRS.map((d, i) => ({ dir: d, mounts: sps[i].mounts })) : [];
  return { data, cw, ch, ax, ay, frames, mounts };
}
export const vspecKey = (s: VSpec) => `${s.culture.seed}|${s.culture.mode}|${Object.values(s.culture.params).map(v => v.toFixed(3)).join(',')}|${s.type}|${s.size}|${s.era}|${s.variant}|${s.night}|${s.anim}|${s.aim ?? '-'}`;
