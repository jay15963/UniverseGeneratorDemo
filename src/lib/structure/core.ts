// The generic building body every type reuses: a footprint in the culture's plan, storeys with
// windows in the culture's shape, a door on the front, optional stilts/plinth, a roof in the
// culture's style, and era details (chimney smoke, rooftop clutter, lamps).
import type { Mat } from '../creature/raster';
import { Ctx, Vol, prism, rect, polyRing, cyl, box, roofOn, windowRow, windowAt, onWall, frontSide, sideLen, smoke, lamp, solarPanel, antenna, dish, barrel, tree, fire } from './parts';
import type { Plan, Roof, WinShape } from './genome';
import { ring } from './draft';

export const rnd = (x: Ctx, a: number, b: number) => a + x.r() * (b - a);
export const chance = (x: Ctx, p: number) => x.r() < p;
export function choose<T>(x: Ctx, arr: T[]): T { return arr[Math.floor(x.r() * arr.length) % arr.length]; }
/** footprint scale per size tier */
export const SZ = (x: Ctx) => ({ small: 1, medium: 1.6, large: 2.4, giant: 3.5 }[x.size]);

export interface HouseOpt {
  a: number; f: number; w: number; d: number; floors: number;
  plan?: Plan; roof?: Roof; wall?: Mat; roofM?: Mat; y0?: number;
  door?: boolean; windows?: boolean; stilts?: boolean; plinth?: boolean; chimney?: boolean; clutter?: boolean;
  win?: WinShape; bias?: number;
}
export interface House { v: Vol; y0: number; top: number; peak: number; front: number }

const PITCHED: Roof[] = ['gable', 'hip', 'shed', 'saddle', 'pyramid'];

export function house(x: Ctx, o: HouseOpt): House {
  const { C, K, e } = x, S = C.storey, D = x.D;
  const plan = o.plan ?? C.plan;
  const wall = o.wall ?? K.wall;
  let y = o.y0 ?? 0;
  const hw = o.w / 2, hd = o.d / 2;
  // raised on stilts, or on a plinth with steps
  if (o.stilts ?? (C.stilts && e <= 2 && y === 0)) {
    const sh = S * 0.55;
    for (const [pa, pf] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]]) D.cap([o.a + pa * hw * 0.9, 0, o.f + pf * hd * 0.9], [o.a + pa * hw * 0.9, sh, o.f + pf * hd * 0.9], 0.9, 0.8, K.wood, D.depth([o.a + pa * hw, sh / 2, o.f + pf * hd]) - 0.5);
    box(x, o.a - hw - 1.5, o.f - hd - 1.5, o.a + hw + 1.5, o.f + hd + 2.5, sh - 1.2, sh, K.wood, K.wood, -0.3);
    for (let i = 0; i < 4; i++) D.cap([o.a - 1.5, (sh * i) / 4, o.f + hd + 5 - i * 0.6], [o.a + 1.5, (sh * i) / 4, o.f + hd + 5 - i * 0.6], 0.4, 0.4, K.wood, D.depth([o.a, 0, o.f + hd + 5]) + 0.01);
    D.cap([o.a - 1.6, 0, o.f + hd + 5.2], [o.a - 1.6, sh, o.f + hd + 2.6], 0.5, 0.5, K.wood, D.depth([o.a, 0, o.f + hd + 5]) + 0.02);
    D.cap([o.a + 1.6, 0, o.f + hd + 5.2], [o.a + 1.6, sh, o.f + hd + 2.6], 0.5, 0.5, K.wood, D.depth([o.a, 0, o.f + hd + 5]) + 0.02);
    y = sh;
  } else if (o.plinth ?? (C.plinth && y === 0 && e >= 1)) {
    const ph = 2.2;
    box(x, o.a - hw - 1.6, o.f - hd - 1.6, o.a + hw + 1.6, o.f + hd + 1.6, 0, ph, K.base, K.paving, -0.3);
    box(x, o.a - 3, o.f + hd + 1.6, o.a + 3, o.f + hd + 3.4, 0, ph * 0.5, K.base, K.paving, -0.2);
    y = ph;
  }
  const H = o.floors * S;
  let v: Vol;
  const tp = Math.min(0.3, C.taper) * Math.min(1, 12 / Math.max(12, H)) ;
  if (plan === 'round' || plan === 'pod') {
    const r = Math.min(hw, hd);
    if (plan === 'pod') {
      D.hull([...ring(o.a, o.f, y, r * 0.8, 18), ...ring(o.a, o.f, y + H * 0.4, r * 1.05, 18), ...ring(o.a, o.f, y + H * 0.85, r * 0.9, 18), ...ring(o.a, o.f, y + H * 1.1, r * 0.5, 14), [o.a, y + H * 1.25, o.f]], wall, D.depth([o.a, y + H / 2, o.f]) + (o.bias ?? 0), { g: D.group(), flat: 0 });
      v = { kind: 'round', a: o.a, f: o.f, r: r * 1.02, rt: r * 0.92, y0: y, y1: y + H, key: D.depth([o.a, y + H / 2, o.f]) + (o.bias ?? 0) };
    } else v = cyl(x, o.a, o.f, r, y, y + H, wall, null, { rt: r * (1 - tp), bias: o.bias });
  } else {
    const n = plan === 'hex' ? 6 : plan === 'oct' ? 8 : 4;
    const rg = n === 4 ? rect(o.a - hw, o.f - hd, o.a + hw, o.f + hd) : polyRing(o.a, o.f, hw, hd, n, Math.PI / n);
    const cx = o.a, cz = o.f, k = 1 - tp;
    const top = rg.map(([a, f]) => [cx + (a - cx) * k, cz + (f - cz) * k] as [number, number]);
    v = prism(x, rg, y, y + H, wall, (o.roof ?? C.roof) === 'flat' ? K.roof : null, { topRing: top, bias: o.bias });
  }
  const front = frontSide(v);
  // half-timbering, floor bands
  if (K.halfTimber && v.kind === 'prism' && e <= 2) for (let s = 0; s < v.ring.length; s++) {
    const L = sideLen(v, s), n = Math.max(2, Math.round(L / 6));
    for (let i = 0; i <= n; i++) onWall(x, v, s, (L * i) / n, y + H / 2, 1.1, H, 'rect', K.wood, 0.004);
    for (let f = 0; f <= o.floors; f++) onWall(x, v, s, L / 2, y + Math.min(H - 0.6, Math.max(0.6, f * S)), L, 1.1, 'rect', K.wood, 0.005);
  }
  if (C.bands && o.floors > 1) for (let f = 1; f < o.floors; f++) {
    if (v.kind === 'round') cyl(x, v.a, v.f, v.r + 0.5, y + f * S - 0.6, y + f * S + 0.6, K.trim, null, { bias: 0.004 });
    else for (let s = 0; s < v.ring.length; s++) onWall(x, v, s, sideLen(v, s) / 2, y + f * S, sideLen(v, s) + 0.8, 1.2, 'rect', K.trim, 0.004);
  }
  // door
  const dw = S * 0.38, dh = S * 0.66;
  const doorShape: WinShape = e === 0 ? (plan === 'box' ? 'rect' : 'arch') : C.win === 'arch' || (C.ornament > 0.6 && e <= 3) ? 'arch' : C.win === 'round' && e >= 6 ? 'round' : 'rect';
  if (o.door !== false) {
    const du = v.kind === 'round' ? 0 : sideLen(v, front) / 2;
    if (e >= 1) onWall(x, v, front, du, y + dh / 2 + 0.3, dw + 1.6, dh + 1.2, doorShape, K.trim, 0.006);
    onWall(x, v, front, du, y + dh / 2, dw, dh, doorShape, K.door, 0.012);
    if (x.night && e >= 3 && v.kind !== 'round') onWall(x, v, front, du + dw * 0.95, y + dh * 0.85, 1.4, 1.4, 'round', K.glow, 0.02);
  }
  // windows
  const shape: WinShape = o.win ?? (e === 0 ? (C.win === 'band' ? 'rect' : C.win) : C.win);
  if (o.windows !== false && K.wallKind !== 'glazing') {
    const ww = S * (e === 0 ? 0.22 : 0.28), wh = S * (e === 0 ? 0.26 : 0.42);
    for (let f = 0; f < o.floors; f++) {
      const wy = y + f * S + S * 0.56;
      if (v.kind === 'round') {
        const n = Math.max(3, Math.round((2 * Math.PI * v.r) / C.winEvery));
        for (let i = 0; i < n; i++) { const t = ((i + 0.5) / n) * Math.PI * 2; if (f === 0 && Math.abs(Math.sin(t / 2)) < 0.3) continue; windowAt(x, v, t, 0, wy, ww, wh, shape === 'band' ? 'rect' : shape); }
      } else for (let s = 0; s < v.ring.length; s++) {
        const L = sideLen(v, s);
        const skip: [number, number] | undefined = f === 0 && s === front && o.door !== false ? [L / 2 - dw, L / 2 + dw] : undefined;
        windowRow(x, v, s, wy, ww, wh, shape, e === 0 ? C.winEvery * 2 : C.winEvery, skip);
      }
    }
  } else if (K.wallKind === 'glazing') for (let f = 1; f < o.floors; f++) {
    if (v.kind === 'round') cyl(x, v.a, v.f, v.r + 0.2, y + f * S - 0.4, y + f * S + 0.4, K.frame, null, { bias: 0.004 });
    else for (let s = 0; s < v.ring.length; s++) onWall(x, v, s, sideLen(v, s) / 2, y + f * S, sideLen(v, s), 0.9, 'rect', K.frame, 0.004);
  }
  // roof
  let roof = o.roof ?? (plan === 'box' ? C.roof : C.roofRound);
  if (plan !== 'box' && PITCHED.includes(roof) && roof !== 'pyramid') roof = plan === 'round' ? C.roofRound : 'pyramid';
  if (plan === 'box' && (roof === 'cone')) roof = 'pyramid';
  if (e >= 4 && o.floors >= 4 && PITCHED.includes(roof) && C.r[51] > 0.3) roof = 'flat';
  let peak = y + H;
  if (plan !== 'pod') peak = roofOn(x, v, roof, o.roofM ?? K.roof, wall);
  else peak = y + H * 1.25;
  // era details
  const top = y + H;
  if ((o.chimney ?? (e >= 1 && e <= 4 && C.r[52] < 0.75 && plan === 'box')) && roof !== 'flat') {
    const ca = o.a + hw * 0.45, cf = o.f - hd * 0.25, chH = peak - top + 3;
    const ch = box(x, ca - 1.4, cf - 1.4, ca + 1.4, cf + 1.4, top - 1, top + chH, e >= 3 ? K.wall2 : K.stone, K.dark);
    void ch;
    smoke(x, [ca, top + chH + 1.5, cf], 1.7);
  } else if (e === 0 && plan !== 'pod' && o.floors === 1 && C.r[53] < 0.8) smoke(x, [o.a, peak + 1, o.f], 1.6);
  if (roof === 'flat' && o.clutter !== false && v.kind === 'prism') {
    const k = x.r();
    if (e === 4) { barrel(x, o.a + hw * 0.4, o.f - hd * 0.3, top + 1.2, 4, K.wood); if (k < 0.5) box(x, o.a - hw * 0.5, o.f - hd * 0.4, o.a - hw * 0.2, o.f - hd * 0.1, top + 1.2, top + 3, K.wall2, K.metal); }
    if (e === 5) { for (let i = 0; i < Math.min(4, Math.floor(o.w / 7)); i++) solarPanel(x, o.a - hw + 4 + i * 6, o.f - hd * 0.2, top + 1.2, 4.6, 3.6); if (k < 0.6) box(x, o.a + hw * 0.4, o.f + hd * 0.2, o.a + hw * 0.4 + 3, o.f + hd * 0.2 + 3, top + 1.2, top + 3.4, K.metal, K.metal); }
    if (e === 6) { for (let i = 0; i < 3; i++) tree(x, o.a - hw * 0.5 + i * hw * 0.5, o.f - hd * 0.2 + (i % 2) * hd * 0.3, 0.55, i); void top; }
    if (e === 7) { if (k < 0.5) dish(x, [o.a + hw * 0.4, top + 1.2, o.f - hd * 0.3], 3); else antenna(x, [o.a + hw * 0.4, top + 1.2, o.f - hd * 0.3], 10); }
  }
  if (e === 0 && o.floors === 1 && C.r[54] < 0.4 && o.y0 === undefined) fire(x, [o.a + hw + 4, 0, o.f + hd + 3], 1.2);
  if (x.night && e >= 3 && e <= 5 && o.y0 === undefined) lamp(x, [o.a - hw - 2, S * 0.8, o.f + hd + 2]);
  void K.wall2;
  return { v, y0: y, top, peak, front };
}

/** rectangular wall-less roof on posts (porches, market halls, sheds, pavilions) */
export function pavilion(x: Ctx, a: number, f: number, w: number, d: number, h: number, roof: Roof, m: Mat, post: Mat, posts = 2) {
  const D = x.D;
  const px: number[] = [], pf: number[] = [];
  for (let i = 0; i <= posts; i++) px.push(a - w / 2 + (w * i) / posts);
  pf.push(f - d / 2, f + d / 2);
  for (const pa of px) for (const pz of pf) D.cap([pa, 0, pz], [pa, h, pz], 0.7, 0.6, post, D.depth([pa, h / 2, pz]));
  const v = prism(x, rect(a - w / 2, f - d / 2, a + w / 2, f + d / 2), h, h + 1, post, roof === 'flat' ? m : null);
  return roofOn(x, v, roof, m, m, { over: 1.5 });
}
export const shade = (m: Mat): Mat => m;
