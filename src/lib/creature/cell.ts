// The cellular stage: seen from above (as under a microscope), so it has a single facing.
import { Genome } from './genome';
import { Kit } from './kit';
import { Part, Mat, darkenRamp } from './raster';

const TAU = Math.PI * 2;

/** Minimal 2D part list used by the cell (no facings). */
export class Rig {
  parts: Part[] = [];
  e(x: number, y: number, rx: number, ry: number, a: number, m: Mat, o: { g?: number; noLine?: boolean } = {}) { this.parts.push({ s: { k: 'e', x, y, rx: Math.max(0.5, rx), ry: Math.max(0.5, ry), a }, m, ...o }); }
  c(x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, m: Mat, o: { g?: number; noLine?: boolean } = {}) { this.parts.push({ s: { k: 'c', x1, y1, x2, y2, r1, r2 }, m, ...o }); }
  p(pts: number[], m: Mat, o: { g?: number; noLine?: boolean } = {}) { this.parts.push({ s: { k: 'p', pts }, m, ...o }); }
  chain(x: number, y: number, ang: number, n: number, len: number, r0: number, r1: number, bend: (i: number) => number, m: Mat, o: { g?: number; noLine?: boolean } = {}) {
    let a = ang, cx = x, cy = y;
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      a += bend(i);
      const nx = cx + Math.cos(a) * seg, ny = cy + Math.sin(a) * seg;
      this.c(cx, cy, nx, ny, r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n), m, o);
      cx = nx; cy = ny;
    }
  }
}
function framePts(ox: number, oy: number, a: number, local: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) out.push(ox + local[i] * Math.cos(a) - local[i + 1] * Math.sin(a), oy + local[i] * Math.sin(a) + local[i + 1] * Math.cos(a));
  return out;
}

export function buildCell(rig: Rig, k: Kit, g: Genome, ph: number) {
  const c = g.cell, R = 16 + g.size * 6;
  const pulse = 1 + Math.sin(ph) * 0.04;
  const rx = (c.shape === 'oval' || c.shape === 'spiral' ? R * 1.35 : c.shape === 'rod' ? R * 1.7 : R) * pulse, ry = (c.shape === 'rod' ? R * 0.62 : c.shape === 'oval' ? R * 0.85 : c.shape === 'spiral' ? R * 0.55 : R) / pulse;
  const mem = { ...k.gel, alpha: 1, tex: 'skin' as const, ramp: darkenRamp(k.gel.ramp, 0.82), spec: 0.4 };
  // flagella behind (travelling wave), cilia around, spikes
  for (let f = 0; f < c.flagella; f++) {
    const a0 = Math.PI + (f - (c.flagella - 1) / 2) * 0.45;
    rig.chain(Math.cos(a0) * rx * 0.95, Math.sin(a0) * ry * 0.95, a0, 12, R * 2.4, 0.9, 0.5, i => Math.sin(ph * 2 - i * 0.9 + f) * 0.32, mem, { noLine: false });
  }
  if (c.cilia) for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, wob = Math.sin(ph * 3 + i * 0.8) * 0.35;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    rig.c(x, y, x + Math.cos(a + wob) * 3.2, y + Math.sin(a + wob) * 3.2, 0.45, 0.4, mem);
  }
  if (c.shape === 'star' || c.spikes) {
    const n = c.shape === 'star' ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3, l = c.shape === 'star' ? R * 0.75 : R * 0.35;
      const bx = Math.cos(a) * rx * 0.8, by = Math.sin(a) * ry * 0.8;
      rig.p(framePts(bx, by, a, [0, -R * 0.18, l, 0, 0, R * 0.18]), c.shape === 'star' ? mem : k.claw);
    }
  }
  // membrane + cytoplasm
  if (c.shape === 'rod') {
    rig.c(-rx + ry, 0, rx - ry, 0, ry, ry, mem, { g: 1 });
    rig.c(-rx + ry, 0, rx - ry, 0, ry - 1.6, ry - 1.6, k.gel, { g: 1 });
  } else {
    rig.e(0, 0, rx, ry, 0, mem, { g: 1 });
    rig.e(0, 0, rx - 1.6, ry - 1.6, 0, k.gel, { g: 1 });
  }
  if (c.shell) for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    rig.e(Math.cos(a) * (rx - 1), Math.sin(a) * (ry - 1), 2.2, 1.4, a + Math.PI / 2, { ...k.plate, tex: 'plates', texScale: 0.3 });
  }
  if (c.shape === 'spiral') for (let i = 0; i < 6; i++) rig.c(-rx + i * rx * 0.36, -ry * 0.9, -rx + i * rx * 0.36 + rx * 0.2, ry * 0.9, 0.5, 0.5, { ...mem, alpha: 1 }, { noLine: true });
  // organelles drifting in the cytoplasm
  for (let i = 0; i < c.organelles; i++) {
    const a = g.r[60 + i] * TAU + Math.sin(ph + i) * 0.08, d = 0.3 + g.r[70 + i] * 0.45;
    const x = Math.cos(a) * rx * d, y = Math.sin(a) * ry * d;
    const m = k.organelle[i % 3];
    if (i % 3 === 0) rig.c(x - 1.8, y - 0.6, x + 1.8, y + 0.6, 1.1, 1.1, m);
    else rig.e(x, y, 1.2 + g.r[80 + i] * 1.4, 1.1 + g.r[80 + i], 0, m);
  }
  // nucleus + eyespot
  rig.e(-rx * 0.15, ry * 0.05, R * 0.38, R * 0.34, 0, k.nucleus);
  rig.e(-rx * 0.15 - 1, ry * 0.05 - 1, R * 0.12, R * 0.12, 0, { ...k.nucleus, alpha: 1, ramp: darkenRamp(k.nucleus.ramp, 0.7) });
  rig.e(rx * 0.62, -ry * 0.35, 1.6, 1.4, 0, { ...k.glow, ramp: k.organelle[0].ramp.map(c => [c[0], c[1] * 0.4, c[2] * 0.3]) as typeof k.glow.ramp });
}
