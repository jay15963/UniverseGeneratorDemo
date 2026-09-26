// Pixel art for the cellular era, seen from above (like the creature generator's cell): every unit kind of a species
// shares its colours, pattern, membrane and eyespot, and adds its own anatomy - long flagella for the scout,
// pseudopods and a mouth for the hunter, chloroplasts for the photosynthesiser, armour plates, toxin vesicles, the
// budding mother cell, the rooted biofilm node. Flat 2D pieces painted by the creatures' rasterizer; the sprite faces
// +x (east), the view rotates it towards where the cell swims. 8 animation frames.
import { Rig } from '../creature/cell';
import { rasterize, ramp, darkenRamp, Mat, Part, Shape, shapeBounds, RGB } from '../creature/raster';
import { mulberry, seedToInt, hash3 } from '../terrain/noise';
import { CellSpecies, CellLook, CellShape, Kind, cellColours, HSL } from './look';

export const FRAMES = 8;
const TAU = Math.PI * 2;
export interface CellSprite { w: number; h: number; frames: Uint8ClampedArray[] }

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const R_ = (c: HSL, spread = 1) => ramp(c.h, clamp(c.s, 0, 1), clamp(c.l, 0.05, 0.95), spread);
export const hueTo = (a: number, b: number, t: number) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return (a + d * t + 1) % 1; };

/** radius of the base shape along angle a (unit cell) */
function shapeR(shape: CellShape, a: number, rr: number[]): number {
  const c = Math.cos(a), s = Math.sin(a);
  switch (shape) {
    case 'oval': return 1 / Math.sqrt((c / 1.3) ** 2 + (s / 0.82) ** 2);
    case 'rod': { const n = 3.4; return 1 / ((Math.abs(c) / 1.55) ** n + (Math.abs(s) / 0.66) ** n) ** (1 / n); }
    case 'egg': return (0.92 + 0.22 * c) / Math.sqrt(c * c * 0.75 + s * s * 1.05);
    case 'star': return 0.84 + 0.26 * ((Math.cos(a * 5) + 1) / 2) ** 2;
    case 'bean': return 1.05 - 0.32 * Math.max(0, Math.cos(a - Math.PI / 2)) ** 3;
    case 'blob': return 1 + 0.14 * Math.sin(a * 2 + rr[0] * TAU) + 0.1 * Math.sin(a * 3 + rr[1] * TAU);
    default: return 1;
  }
}

export interface Ctx {
  look: CellLook; rr: number[]; ph: number; R: number; elong: number; wob: number; shape: CellShape;
  mem: Mat; memDark: Mat; cyto: Mat; nuc: Mat; nucDark: Mat; org: Mat[]; vac: Mat; eye: Mat; glow: Mat | null; pale: Mat;
  glowN: number; memThick: number;
}

/** membrane outline radius along angle a (px), animated */
function rimAt(c: Ctx, a: number) {
  const base = shapeR(c.shape, a, c.rr);
  const x = Math.cos(a) * (1 + c.elong * 0.55), y = Math.sin(a) / (1 + c.elong * 0.25);
  const k = Math.hypot(x, y);
  const w = c.wob * (0.13 * Math.sin(a * 2 + c.rr[2] * TAU + c.ph) + 0.09 * Math.sin(a * 3 + c.rr[3] * TAU - c.ph * 2) + 0.06 * Math.sin(a * 5 + c.rr[4] * TAU + c.ph));
  return c.R * base * k * (1 + w + Math.sin(c.ph) * 0.025);
}
const rimPt = (c: Ctx, a: number, k = 1): [number, number] => { const r = rimAt(c, a) * k; return [Math.cos(a) * r, Math.sin(a) * r]; };
function outline(c: Ctx, inset = 0, n = 48): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = Math.max(1, rimAt(c, a) - inset); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
  return pts;
}

function patternFn(look: CellLook, seed: number): Mat['pattern'] {
  const k = 2.2 + look.patternScale * 4;
  switch (look.pattern) {
    case 'spots': return (x, y) => { const cx = Math.floor(x / k), cy = Math.floor(y / k); const h = hash3(cx, cy, seed); if ((h & 3) !== 0) return false; const ox = (h >>> 8 & 255) / 255 * 0.5 + 0.25, oy = (h >>> 16 & 255) / 255 * 0.5 + 0.25; return Math.hypot(x / k - cx - ox, y / k - cy - oy) < 0.32; };
    case 'stripes': return (x) => Math.sin(x / k * 1.9) > 0.45;
    case 'bands': return (_x, y) => Math.sin(y / k * 1.6) > 0.5;
    case 'rings': return (x, y, u, v) => Math.sin(Math.hypot(u, v) / k * 2.2) > 0.55;
    case 'speckles': return (x, y) => (hash3(x, y, seed) & 255) < 22 + look.patternScale * 30;
    default: return null;
  }
}

export function makeCtx(sp: CellSpecies, R: number, ph: number, over: Partial<CellLook> = {}): Ctx {
  const look = { ...sp.look, ...over };
  const col = cellColours(look, sp.mode);
  const rr = Array.from({ length: 64 }, mulberry(seedToInt(sp.seed + ':art')));
  const memR = R_(col.mem);
  const pat = patternFn(look, seedToInt(sp.seed) & 0xffff);
  const org: Mat[] = [
    { ramp: R_({ h: col.acc.h, s: col.acc.s, l: 0.5 }), tex: 'smooth', spec: 0.35 },
    { ramp: R_({ h: hueTo(col.acc.h, 0.08, 0.5), s: 0.6, l: 0.55 }), tex: 'smooth' },
    { ramp: R_({ h: col.nuc.h, s: 0.4, l: 0.62 }), tex: 'gel', alpha: 0.8 },
  ];
  return {
    look, rr, ph, R, elong: look.elongation, wob: look.wobble, shape: look.shape,
    mem: { ramp: memR, tex: 'skin', spec: 0.22 },
    memDark: { ramp: darkenRamp(memR, 0.78), tex: 'smooth' },
    cyto: { ramp: R_(col.cyto, 0.7), tex: 'gel', alpha: clamp(0.96 - look.translucency * 0.42, 0.5, 0.96), alt: R_({ h: col.cyto.h, s: col.cyto.s + 0.15, l: col.cyto.l - 0.2 }, 0.7), pattern: pat },
    nuc: { ramp: R_(col.nuc, 0.8), tex: 'gel', alpha: 0.92 },
    nucDark: { ramp: darkenRamp(R_(col.nuc, 0.8), 0.62), tex: 'smooth', line: null },
    org,
    vac: { ramp: R_({ h: col.cyto.h, s: 0.15, l: 0.84 }, 0.5), tex: 'gel', alpha: 0.55, line: null },
    eye: sp.mode === 'earth' ? { ramp: ramp(0.02, 0.8, 0.45), tex: 'smooth', spec: 0.6 } : { ramp: R_({ h: col.acc.h, s: 0.9, l: 0.5 }), tex: 'smooth', spec: 0.6 },
    glow: col.glow > 0.05 ? { ramp: ramp(col.glowHue, 0.9, 0.62), tex: 'glow', emit: true, line: null } : null,
    pale: { ramp: ramp(0.12, 0.12, 0.84, 0.5), tex: 'bone', spec: 0.3 },
    glowN: Math.round(col.glow * 7), memThick: 0.9 + look.membrane * 2.1,
  };
}

// --- generic pieces --------------------------------------------------------------------------------------------------
function body(rig: Rig, c: Ctx) {
  rig.p(outline(c), c.mem, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.3;
  rig.p(outline(c, c.memThick), c.cyto, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.5;
}
function cilia(rig: Rig, c: Ctx, n: number, len: number, from = 0, to = TAU) {
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.5) / n) * (to - from), wob = Math.sin(c.ph * 2 + i * 0.9) * 0.45;
    const [x, y] = rimPt(c, a, 0.96);
    rig.c(x, y, x + Math.cos(a + wob) * len, y + Math.sin(a + wob) * len, 0.5, 0.45, c.memDark);
  }
}
function flagella(rig: Rig, c: Ctx, n: number, len: number) {
  for (let f = 0; f < n; f++) {
    const a0 = Math.PI + (f - (n - 1) / 2) * 0.5;
    const [x, y] = rimPt(c, a0, 0.95);
    rig.chain(x, y, a0, 10, len, 0.95, 0.5, i => Math.sin(c.ph * 2 - i * 0.9 + f * 1.7) * 0.3, c.memDark);
  }
}
function spikes(rig: Rig, c: Ctx, n: number, len: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + c.rr[5] * TAU, [x, y] = rimPt(c, a, 0.9), w = 1.1;
    const ca = Math.cos(a), sa = Math.sin(a);
    rig.p([x - sa * w, y + ca * w, x + ca * (len + 1.5), y + sa * (len + 1.5), x + sa * w, y - ca * w], c.pale);
  }
}
function organelles(rig: Rig, c: Ctx, n: number, rad = 0.62) {
  for (let i = 0; i < n; i++) {
    const a = c.rr[(10 + i) % 64] * TAU + Math.sin(c.ph + i) * 0.12, d = 0.25 + c.rr[(30 + i) % 64] * 0.6;
    const r = rimAt(c, a) * rad * d, x = Math.cos(a) * r, y = Math.sin(a) * r;
    const t = i % 3, m = c.org[t];
    if (t === 0) { const o = c.rr[(40 + i) % 64] * Math.PI; rig.c(x - Math.cos(o) * 1.4, y - Math.sin(o) * 1.4, x + Math.cos(o) * 1.4, y + Math.sin(o) * 1.4, 0.9, 0.9, m); }
    else rig.e(x, y, 0.8 + c.rr[(50 + i) % 64] * 0.8, 0.7 + c.rr[(52 + i) % 64] * 0.6, 0, m);
  }
}
function vacuoles(rig: Rig, c: Ctx, n: number) {
  for (let i = 0; i < n; i++) {
    const a = c.rr[20 + i] * TAU, r = rimAt(c, a) * (0.35 + c.rr[24 + i] * 0.2);
    const s = c.R * (0.14 + c.rr[28 + i] * 0.1) * (1 + Math.sin(c.ph + i * 2) * 0.06);
    rig.e(Math.cos(a) * r, Math.sin(a) * r, s, s, 0, c.vac);
  }
}
function nucleus(rig: Rig, c: Ctx, k = 1, x = -0.12) {
  const nr = c.R * (0.2 + c.look.nucleusSize * 0.26) * k;
  const nx = rimAt(c, Math.PI) * x;
  rig.e(nx, 0, nr * 1.05, nr, 0, c.nuc);
  rig.e(nx - nr * 0.2, -nr * 0.2, Math.max(0.8, nr * 0.34), Math.max(0.8, nr * 0.3), 0, c.nucDark);
}
function eyespot(rig: Rig, c: Ctx, size: number) {
  if (size < 0.05) return;
  const [x, y] = rimPt(c, -0.45, 0.72);
  rig.e(x, y, 0.7 + size * 1.5, 0.6 + size * 1.2, 0, c.eye);
}
export function glowDots(rig: Rig, c: Ctx) {
  if (!c.glow) return;
  for (let i = 0; i < c.glowN; i++) {
    const a = c.rr[56 + (i % 8)] * TAU + i, [x, y] = rimPt(c, a, 0.72);
    const s = 0.6 + 0.4 * Math.max(0, Math.sin(c.ph + i * 1.3));
    rig.e(x, y, s, s, 0, c.glow);
  }
}

// --- kinds -------------------------------------------------------------------------------------------------------------
const KIND_R: Record<number, number> = { [Kind.WORKER]: 1, [Kind.SCOUT]: 0.82, [Kind.HUNTER]: 1.25, [Kind.PHOTO]: 1.05, [Kind.ARMOR]: 1.3, [Kind.SPITTER]: 1.1, [Kind.MOTHER]: 2.3, [Kind.NODE]: 1.35, [Kind.SENTINEL]: 1.45 };
export const baseRadius = (look: CellLook) => 7 + look.size * 5;

function buildKind(rig: Rig, sp: CellSpecies, kind: Kind, ph: number) {
  const L = sp.look, R = baseRadius(L) * (KIND_R[kind] ?? 1);
  const over: Partial<CellLook> = {};
  if (kind === Kind.SCOUT) { over.elongation = Math.min(1, L.elongation + 0.45); over.eyespot = Math.max(0.6, L.eyespot); }
  if (kind === Kind.PHOTO) { over.elongation = L.elongation * 0.4; over.hue2 = hueTo(L.hue2, sp.mode === 'earth' ? 0.4 : 0.3, 0.35); }
  if (kind === Kind.ARMOR) { over.membrane = Math.min(1, L.membrane + 0.4); over.wobble = L.wobble * 0.4; }
  if (kind === Kind.MOTHER) { over.elongation = L.elongation * 0.35; }
  if (kind === Kind.NODE) { over.elongation = 0; over.shape = 'star'; }
  if (kind === Kind.SENTINEL) { over.elongation = L.elongation * 0.2; over.membrane = Math.min(1, L.membrane + 0.3); over.eyespot = Math.max(0.8, L.eyespot); }
  const c = makeCtx(sp, R, ph, over);
  const look = c.look;
  const nCilia = look.cilia > 0.02 ? Math.round(10 + look.cilia * 26) : 0, ciliaLen = 1.4 + look.ciliaLength * 2.6;
  const flagLen = R * (1.1 + look.flagellumLength * 2);

  // behind the body
  if (kind === Kind.SCOUT) flagella(rig, c, Math.max(1, Math.round(look.flagella)) + 1, flagLen * 1.35);
  else if (kind !== Kind.NODE && kind !== Kind.MOTHER && kind !== Kind.SENTINEL) flagella(rig, c, Math.round(look.flagella), flagLen);
  if (kind === Kind.MOTHER) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + c.rr[6], [x, y] = rimPt(c, a, 0.9);
      rig.chain(x, y, a, 5, R * 0.55, 0.9, 0.4, j => Math.sin(ph + i + j * 0.8) * 0.25, c.memDark);
    }
  }
  if (kind === Kind.NODE) {
    const slime: Mat = { ...c.cyto, alpha: 0.85, pattern: null };
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + c.rr[7], [x, y] = rimPt(c, a, 0.8);
      rig.chain(x, y, a, 7, R * 1.5, 2.2, 0.6, j => Math.sin(ph * 0.5 + i * 1.7 + j * 0.6) * 0.22, slime);
    }
  }
  if (nCilia && kind !== Kind.ARMOR) cilia(rig, c, kind === Kind.MOTHER ? Math.max(40, nCilia) : nCilia, ciliaLen);
  if (kind === Kind.WORKER) cilia(rig, c, 7, 1.6 + look.ciliaLength * 1.4, -0.7, 0.7);
  if (kind === Kind.MOTHER && !nCilia) cilia(rig, c, 40, 1.8);
  if (kind === Kind.SENTINEL) {
    // a crown of long guard spines and a spine launcher pointing forward (it recoils on the loop)
    spikes(rig, c, 12, R * 0.55);
    const rec = Math.max(0, Math.sin(ph)) * R * 0.12, [lx, ly] = rimPt(c, 0, 0.85);
    rig.c(lx - rec, ly, lx + R * 0.95 - rec, ly, R * 0.3, R * 0.17, c.mem, { g: 1 });
    rig.c(lx + R * 0.5 - rec, ly, lx + R * 0.95 - rec, ly, R * 0.1, R * 0.08, c.memDark);
    rig.p([lx + R * 0.9 - rec, ly - R * 0.11, lx + R * 1.35 - rec, ly, lx + R * 0.9 - rec, ly + R * 0.11], c.pale);
  } else if (look.spikes > 0.03 && kind !== Kind.NODE) spikes(rig, c, Math.round(3 + look.spikes * 8), 1 + look.spikes * 3);
  if (kind === Kind.HUNTER) {
    // pseudopods: lobes of the membrane reaching forward, melted into the body
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.75 + Math.sin(ph + i * 2.1) * 0.12, [x, y] = rimPt(c, a, 0.75);
      const ext = R * (0.42 + 0.14 * Math.sin(ph + i * 2.1));
      rig.c(x, y, x + Math.cos(a) * ext, y + Math.sin(a) * ext, R * 0.34, R * 0.2, c.mem, { g: 1 });
    }
  }
  if (kind === Kind.MOTHER) {
    // a daughter cell budding off the back
    const bud = R * 0.36 * (0.72 + 0.28 * Math.sin(ph)), [bx, by] = rimPt(c, Math.PI, 0.98);
    rig.e(bx - bud * 0.5, by, bud, bud * 0.95, 0, c.mem, { g: 1 });
    rig.e(bx - bud * 0.5, by, bud - c.memThick, bud * 0.95 - c.memThick, 0, c.cyto, { g: 1 });
  }
  if (kind === Kind.SPITTER) {
    const [x, y] = rimPt(c, 0, 0.8);
    rig.c(x, y, x + R * 0.5, y, R * 0.2, R * 0.13, c.mem, { g: 1 });
  }

  body(rig, c);

  // inside
  vacuoles(rig, c, Math.round(look.vacuoles * 3) + (kind === Kind.MOTHER ? 2 : 0));
  organelles(rig, c, Math.round(2 + look.organelles * 8) * (kind === Kind.MOTHER ? 2 : 1));
  if (kind === Kind.PHOTO) {
    const chl: Mat = { ramp: sp.mode === 'earth' ? ramp(0.3, 0.55, 0.4) : ramp(0.34, 0.8, 0.45), tex: 'fin', spec: 0.2, texScale: 0.5 };
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + c.rr[8] + Math.sin(ph + i) * 0.06, [x, y] = rimPt(c, a, 0.6), o = a + Math.PI / 2;
      rig.c(x - Math.cos(o) * 1.6, y - Math.sin(o) * 1.6, x + Math.cos(o) * 1.6, y + Math.sin(o) * 1.6, 1.25, 1.25, chl);
    }
  }
  if (kind === Kind.WORKER) {
    const [x, y] = rimPt(c, 0, 0.55);
    rig.e(x - 1, y, R * 0.2, R * 0.2, 0, { ramp: ramp(0.14, 0.6, 0.55), tex: 'gel', alpha: 0.8 });
  }
  if (kind === Kind.SPITTER) {
    const tox: Mat = { ramp: ramp(c.look.accentHue, 0.9, 0.55), tex: 'glow', emit: true };
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6, [x, y] = rimPt(c, a, 0.55), s = 1.2 + 0.25 * Math.sin(ph * 2 + i);
      rig.e(x, y, s, s, 0, tox);
    }
    const [nx, ny] = rimPt(c, 0, 0.8), d = 0.7 + 0.8 * Math.max(0, Math.sin(ph));
    rig.e(nx + R * 0.52, ny, d, d, 0, tox);
  }
  nucleus(rig, c, kind === Kind.MOTHER ? 1.25 : 1);
  if (kind === Kind.MOTHER) rig.e(rimAt(c, Math.PI) * -0.12 + c.R * 0.08, c.R * 0.1, 1.2, 1.1, 0, c.nucDark);
  if (kind === Kind.HUNTER) {
    // cytostome (mouth) with pale trichocyst "teeth"
    const [mx, my] = rimPt(c, 0, 0.78);
    rig.e(mx, my, R * 0.16, R * 0.3, 0, { ramp: ramp(0.97, 0.45, 0.14), tex: 'smooth', line: [20, 6, 10] });
    for (let i = 0; i < 4; i++) {
      const y0 = my + (i - 1.5) * R * 0.14;
      rig.p([mx + R * 0.1, y0 - 0.7, mx - R * 0.05, y0, mx + R * 0.1, y0 + 0.7], c.pale);
    }
  }
  if (kind === Kind.ARMOR) {
    const plate: Mat = { ramp: darkenRamp(R_({ h: cellColours(look, sp.mode).mem.h, s: 0.25, l: 0.55 }), 0.95), tex: 'plates', spec: 0.35, texScale: 0.35 };
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, [x, y] = rimPt(c, a, 0.93);
      rig.e(x, y, R * 0.26, R * 0.17, a + Math.PI / 2, plate);
    }
  }
  eyespot(rig, c, look.eyespot);
  glowDots(rig, c);
}

// --- neutral life & props ------------------------------------------------------------------------------------------------
export function neutralSpecies(variant: number): CellSpecies {
  const seed = 'neutral' + variant;
  const r = mulberry(seedToInt(seed));
  return {
    seed, genus: '', species: '', mode: 'earth',
    look: { hue: r(), sat: 0.5 + r() * 0.4, light: 0.35 + r() * 0.3, hue2: r(), nucleusHue: r(), accentHue: r(), translucency: 0.3 + r() * 0.4, glow: 0, pattern: 'none', patternScale: 0.5, shape: 'round', size: 0.5, elongation: 0, wobble: 0.5, membrane: 0.3, nucleusSize: 0.5, organelles: 0.6, vacuoles: 0.6, cilia: 0, ciliaLength: 0, flagella: 0, flagellumLength: 0, spikes: 0, eyespot: 0 },
  };
}
function buildNeutral(rig: Rig, kind: Kind, variant: number, ph: number) {
  const sp = neutralSpecies(variant);
  if (kind === Kind.BACTERIA) {
    const hues = [0.2, 0.95, 0.09, 0.5], h = hues[variant % 4];
    const m: Mat = { ramp: ramp(h, 0.45, 0.5), tex: 'gel', spec: 0.3 };
    rig.chain(-4, 0, Math.PI, 6, 7, 0.6, 0.35, i => Math.sin(ph * 2 - i) * 0.35, { ramp: ramp(h, 0.3, 0.35), tex: 'smooth' });
    rig.c(-3.5, 0, 3.5, 0, 2.3, 2.3, m);
    rig.e(0.5, -0.4, 1, 0.7, 0, { ramp: ramp(h, 0.5, 0.3), tex: 'smooth', line: null });
    return;
  }
  if (kind === Kind.DIATOM) {
    // glass frustule: centric disc or pennate boat, radial / cross striae, golden chloroplasts inside
    const glass: Mat = { ramp: ramp(0.5, 0.15, 0.72, 0.6), tex: 'glass', spec: 0.8, alt: ramp(0.5, 0.2, 0.55, 0.6), pattern: variant % 2 ? (x, y, u, v) => Math.sin(Math.atan2(v, u) * 14) > 0.5 : (x) => (x & 1) === 0 };
    const gold: Mat = { ramp: ramp(0.1, 0.6, 0.42), tex: 'smooth' };
    if (variant % 2) {
      rig.e(0, 0, 10, 10, 0, glass);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + ph * 0.02; rig.e(Math.cos(a) * 5, Math.sin(a) * 5, 1.8, 1.4, a, gold); }
      rig.e(0, 0, 2.2, 2.2, 0, gold);
    } else {
      rig.p([-13, 0, -7, -4.5, 7, -4.5, 13, 0, 7, 4.5, -7, 4.5], glass);
      rig.c(-8, 0, 8, 0, 2.2, 2.2, gold);
      rig.c(-11, 0, 11, 0, 0.4, 0.4, { ramp: ramp(0.5, 0.2, 0.4), tex: 'smooth', line: null }, { noLine: true });
    }
    return;
  }
  if (kind === Kind.AMOEBA) {
    const c = makeCtx(sp, 18, ph, { shape: 'blob', wobble: 1, hue: 0.58, sat: 0.2, light: 0.55, hue2: 0.55, translucency: 0.7 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.sin(ph + i) * 0.3, [x, y] = rimPt(c, a, 0.7), ext = 18 * (0.45 + 0.25 * Math.sin(ph + i * 1.7));
      rig.c(x, y, x + Math.cos(a) * ext, y + Math.sin(a) * ext, 6, 3, c.mem, { g: 1 });
    }
    body(rig, c);
    vacuoles(rig, c, 3);
    organelles(rig, c, 10);
    nucleus(rig, c, 1.1, 0);
  }
}

export const ROCK_VARIANTS = 24;
/** a grain's radius (world px): variant % 4 picks the size, variant / 4 the mineral */
export const rockSize = (variant: number) => 16 + (variant % 4) * 13;
/** props: food motes, toxin spit, sand grains, vents (one frame, except vents and motes) */
export type PropKind = 'mote' | 'toxin' | 'rock' | 'vent' | 'spark';
function buildProp(rig: Rig, prop: PropKind, variant: number, ph: number) {
  const r = mulberry(seedToInt(prop + variant));
  if (prop === 'mote') {
    // a nutrient grain: a glowing organic blob with one or two crumbs, it twinkles
    const hs = [0.13, 0.26, 0.07, 0.4], h = hs[variant % 4];
    const m: Mat = { ramp: ramp(h, 0.85, 0.52), tex: 'glow', emit: true, line: [36, 26, 10] };
    const s = 1.7 + r() * 0.5;
    rig.e(0, 0, s * 1.2, s, r() * 3, m);
    rig.e(s * 1.2, s * 0.6, s * 0.55, s * 0.5, 0, m);
    if (variant % 2) rig.e(-s * 1.1, s * 0.7, s * 0.45, s * 0.45, 0, m);
    const tw = 0.6 + 0.4 * Math.sin(ph);
    rig.e(-0.4, -0.5, 0.5 + tw * 0.4, 0.5 + tw * 0.4, 0, { ramp: ramp(h, 0.4, 0.93), tex: 'smooth', emit: true, line: null });
    return;
  }
  if (prop === 'toxin') {
    rig.e(0, 0, 2.2, 1.7, 0, { ramp: ramp(0.28, 0.9, 0.55), tex: 'glow', emit: true, line: [20, 50, 10] });
    rig.c(-4, 0, -1, 0, 0.5, 1.2, { ramp: ramp(0.28, 0.8, 0.45), tex: 'glow', emit: true, line: null });
    return;
  }
  if (prop === 'spark') {
    const s = 1 + variant * 0.5;
    rig.e(0, 0, s, s, 0, { ramp: ramp(0.12, 0.3, 0.9), tex: 'smooth', emit: true, line: null });
    return;
  }
  if (prop === 'rock') {
    // a sand grain / mineral fragment: an irregular faceted blob
    const size = rockSize(variant);
    const tones: [number, number, number][] = [[0.09, 0.25, 0.52], [0.08, 0.18, 0.4], [0.58, 0.06, 0.5], [0.1, 0.3, 0.62], [0.05, 0.2, 0.34], [0.52, 0.12, 0.6]];
    const [h, s, l] = tones[Math.floor(variant / 4) % tones.length];
    const m: Mat = { ramp: ramp(h, s, l), tex: variant % 3 === 2 ? 'glass' : 'skin', spec: 0.35, alt: ramp(h, s, l - 0.12), pattern: (x, y) => ((hash3(x >> 2, y >> 2, variant) & 15) === 0) };
    const n = 11, pts: number[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = size * (0.78 + r() * 0.3); pts.push(Math.cos(a) * d, Math.sin(a) * d * 0.9); }
    rig.p(pts, m);
    // facets
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = size * 0.35 * r();
      const fp: number[] = [];
      for (let j = 0; j < 5; j++) { const b = (j / 5) * TAU + r() * 0.4, e = size * (0.2 + r() * 0.15); fp.push(Math.cos(a) * d + Math.cos(b) * e, Math.sin(a) * d + Math.sin(b) * e); }
      rig.p(fp, { ...m, ramp: ramp(h, s, l + 0.05), pattern: null, line: null }, { noLine: true });
    }
    return;
  }
  if (prop === 'vent') {
    // hydrothermal vent seen from above: mineral chimney rings around a glowing mouth
    const size = 26 + variant * 8;
    const rockM: Mat = { ramp: ramp(0.06, 0.3, 0.3), tex: 'skin', spec: 0.2 };
    const n = 14, pts: number[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = size * (0.85 + r() * 0.25); pts.push(Math.cos(a) * d, Math.sin(a) * d); }
    rig.p(pts, rockM);
    rig.e(0, 0, size * 0.62, size * 0.58, 0, { ramp: ramp(0.07, 0.25, 0.4), tex: 'skin' });
    rig.e(0, 0, size * 0.38, size * 0.36, 0, { ramp: ramp(0.05, 0.35, 0.22), tex: 'smooth' });
    const g = 0.55 + 0.1 * Math.sin(ph);
    rig.e(0, 0, size * 0.24 * (0.95 + 0.08 * Math.sin(ph)), size * 0.22, 0, { ramp: ramp(0.06, 0.95, g), tex: 'glow', emit: true, line: null });
    rig.e(0, 0, size * 0.1, size * 0.1, 0, { ramp: ramp(0.12, 0.9, 0.8), tex: 'glow', emit: true, line: null });
  }
}

// --- rasterising ------------------------------------------------------------------------------------------------------------
function shiftShape(s: Shape, dx: number, dy: number): Shape {
  if (s.k === 'e') return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.k === 'c') return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { k: 'p', pts: s.pts.map((v, i) => v + (i & 1 ? dy : dx)) };
}
/** rasterises n frames on one canvas size, centred on the cell (the sprite's anchor is its centre) */
export function render(build: (rig: Rig, ph: number) => void, n: number): CellSprite {
  const sets: Part[][] = [];
  let hx = 2, hy = 2;
  for (let f = 0; f < n; f++) {
    const rig = new Rig();
    build(rig, (f / n) * TAU);
    for (const p of rig.parts) { const [x0, y0, x1, y1] = shapeBounds(p.s); hx = Math.max(hx, -x0, x1); hy = Math.max(hy, -y0, y1); }
    sets.push(rig.parts);
  }
  const w = 2 * Math.ceil(hx + 1), h = 2 * Math.ceil(hy + 1);
  const frames = sets.map(parts => rasterize(parts.map(p => ({ ...p, s: shiftShape(p.s, w / 2, h / 2) })), w, h).data);
  return { w, h, frames };
}

export function drawKind(sp: CellSpecies, kind: Kind, n = FRAMES): CellSprite {
  return render((rig, ph) => buildKind(rig, sp, kind, ph), n);
}
export function drawNeutral(kind: Kind, variant: number, n = FRAMES): CellSprite {
  return render((rig, ph) => buildNeutral(rig, kind, variant, ph), n);
}
export function drawProp(prop: PropKind, variant: number, n = 1): CellSprite {
  return render((rig, ph) => buildProp(rig, prop, variant, ph), n);
}

/** a sprite frame as a canvas (editor previews) */
export function spriteCanvas(s: CellSprite, frame = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(s.frames[frame % s.frames.length]), s.w, s.h), 0, 0);
  return c;
}
export type { RGB };
