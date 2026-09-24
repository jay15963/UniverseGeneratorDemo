// Shared building blocks: a part list with helpers, 2-bone IK, bone chains, the material kit
// derived from a genome and the head (used by every stage from the amphibian to the astronaut).
import { Genome } from './genome';
import { Part, Mat, RGB, ramp, rampRGB, darkenRamp, Tex } from './raster';
import { vnoise } from '../terrain/noise';

export interface PO { g?: number; dark?: number; noLine?: boolean; flat?: number }

export class Rig {
  parts: Part[] = [];
  e(x: number, y: number, rx: number, ry: number, a: number, m: Mat, o: PO = {}) { this.parts.push({ s: { k: 'e', x, y, rx: Math.max(0.5, rx), ry: Math.max(0.5, ry), a }, m, ...o }); }
  c(x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, m: Mat, o: PO = {}) { this.parts.push({ s: { k: 'c', x1, y1, x2, y2, r1, r2 }, m, ...o }); }
  p(pts: number[], m: Mat, o: PO = {}) { this.parts.push({ s: { k: 'p', pts }, m, ...o }); }
  /** A bent chain of capsules (tails, necks, tentacles). Returns the joint positions. */
  chain(x: number, y: number, ang: number, n: number, len: number, r0: number, r1: number, bend: (i: number) => number, m: Mat, o: PO = {}): [number, number][] {
    const pts: [number, number][] = [[x, y]];
    let a = ang, cx = x, cy = y;
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      a += bend(i);
      const nx = cx + Math.cos(a) * seg, ny = cy + Math.sin(a) * seg;
      const ra = r0 + (r1 - r0) * (i / n), rb = r0 + (r1 - r0) * ((i + 1) / n);
      this.c(cx, cy, nx, ny, ra, rb, m, o);
      cx = nx; cy = ny;
      pts.push([cx, cy]);
    }
    return pts;
  }
}

/** Knee position for a two-bone limb from (ax, ay) to (fx, fy); bend = +1 / -1 picks the side. */
export function ik(ax: number, ay: number, fx: number, fy: number, l1: number, l2: number, bend: number): [number, number] {
  const dx = fx - ax, dy = fy - ay;
  const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx) + bend * a;
  return [ax + Math.cos(base) * l1, ay + Math.sin(base) * l1];
}

export const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
/** Polygon given in a local frame (origin ox, oy rotated by a). */
export function framePts(ox: number, oy: number, a: number, local: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) { const [x, y] = rot(local[i], local[i + 1], a); out.push(ox + x, oy + y); }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------------
export interface Kit {
  body: Mat; limb: Mat; head: Mat; skinWet: Mat; gel: Mat; membrane: Mat; fin: Mat; horn: Mat; claw: Mat; beak: Mat;
  sclera: Mat; iris: Mat; pupil: Mat; shine: Mat; mouth: Mat; teeth: Mat; inner: Mat; crest: Mat; glow: Mat;
  nucleus: Mat; organelle: Mat[]; plate: Mat; hairTuft: Mat;
  cover: Tex;
}
const K = (r: RGB[], tex: Tex, extra: Partial<Mat> = {}): Mat => ({ ramp: r, tex, ...extra });

export function patternFn(g: Genome): ((x: number, y: number, u: number, v: number) => boolean) | null {
  const sc = g.patternScale, a = 0.18 + g.patternAngle * 0.25, ca = Math.cos(a), sa = Math.sin(a);
  const seed = Math.floor(g.r[40] * 1000);
  switch (g.pattern) {
    case 'stripes': return (x, y) => Math.sin(((x * ca + y * sa) / (2.6 * sc)) + vnoise(x / 12, y / 12, seed) * 2.2) > 0.4;
    case 'bands': return (x, y) => Math.sin((x * ca + y * sa) / (5.5 * sc)) > 0.55;
    case 'rings': return (_x, _y, u) => Math.sin(u / (1.6 * sc)) > 0.55;
    case 'patches': return (x, y) => vnoise(x / (9 * sc), y / (9 * sc), seed) > 0.6;
    case 'spots': case 'rosettes': {
      const k = 7.5 * sc, ros = g.pattern === 'rosettes';
      return (x, y) => {
        const cx = Math.floor(x / k), cy = Math.floor(y / k);
        let best = 9;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const hx = (cx + i + 0.5 + (vnoise(cx + i, cy + j, seed) - 0.5) * 0.6) * k, hy = (cy + j + 0.5 + (vnoise(cx + i + 7, cy + j, seed) - 0.5) * 0.6) * k;
          best = Math.min(best, Math.hypot(x - hx, y - hy) / k);
        }
        return ros ? best > 0.17 && best < 0.33 : best < 0.26;
      };
    }
    default: return null;
  }
}

export function makeKit(g: Genome, stageTex?: Tex): Kit {
  const P = ramp(g.primary.h, g.primary.s, g.primary.l);
  const Sd = ramp(g.secondary.h, g.secondary.s, g.secondary.l);
  const B = ramp(g.belly.h, g.belly.s, g.belly.l, 0.8);
  const A = ramp(g.accent.h, g.accent.s, g.accent.l);
  const pat = patternFn(g);
  const cover: Tex = stageTex ?? ({ scales: 'scales', feathers: 'feathers', fur: 'fur', skin: 'skin', chitin: 'chitin', plates: 'plates' } as const)[g.covering];
  const fuzz = cover === 'fur' ? 1.1 : cover === 'feathers' ? 0.55 : 0;
  const spec = cover === 'chitin' ? 0.8 : cover === 'skin' ? 0.35 : cover === 'scales' ? 0.25 : 0;
  const body = K(P, cover, { alt: Sd, pattern: pat, belly: g.counterShade ? B : undefined, fuzz, spec });
  const hornR = rampRGB(g.params.temperature > 0.6 ? [214, 196, 160] : [226, 214, 190]);
  const eyeR = ramp(g.eye.h, g.eye.s, g.eye.l);
  const scl: RGB[] = g.params.diet > 0.8 && g.params.exotic > 0.5 ? ramp(0.02, 0.6, 0.3) : ramp(0.12, 0.12, 0.84, 0.6);
  return {
    cover,
    body,
    limb: { ...body, belly: undefined },
    head: { ...body },
    skinWet: K(P, 'skin', { alt: Sd, pattern: pat, belly: B, spec: 0.55 }),
    gel: K(ramp(g.primary.h, g.primary.s * 0.8, 0.62, 0.7), 'gel', { alpha: 0.78, alt: Sd, pattern: null }),
    membrane: K(ramp(g.secondary.h, g.secondary.s, Math.min(0.7, g.secondary.l + 0.08)), 'fin', { alpha: 0.86 }),
    fin: K(ramp(g.secondary.h, g.secondary.s * 0.9, Math.min(0.72, g.secondary.l + 0.1)), 'fin', { alpha: 0.82 }),
    horn: K(hornR, 'bone', { spec: 0.2 }),
    claw: K(ramp(0.08, 0.15, 0.3), 'smooth', { spec: 0.4 }),
    beak: K(ramp(g.r[41] < 0.5 ? 0.11 : 0.06, 0.65, 0.55), 'smooth', { spec: 0.35 }),
    sclera: K(scl, 'smooth', { line: [20, 14, 18] }),
    iris: K(eyeR, 'smooth', { line: null, spec: 0.6 }),
    pupil: K([[8, 6, 10], [10, 8, 12], [14, 10, 16], [18, 14, 20], [24, 18, 26], [30, 24, 32]], 'smooth', { line: null }),
    shine: K([[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255]], 'smooth', { emit: true, line: null }),
    mouth: K(ramp(0.98, 0.45, 0.2), 'smooth', { line: null }),
    teeth: K(ramp(0.12, 0.2, 0.86, 0.5), 'smooth', { line: [60, 40, 40] }),
    inner: K(B, cover === 'fur' ? 'fur' : 'skin', { fuzz: cover === 'fur' ? 0.6 : 0 }),
    crest: K(A, cover === 'feathers' ? 'feathers' : 'fin', { fuzz: cover === 'feathers' ? 0.5 : 0 }),
    glow: K(ramp(g.glowHue, 0.9, 0.62), 'glow', { emit: true, line: null }),
    nucleus: K(ramp(g.secondary.h, 0.55, 0.32), 'gel', { alpha: 0.9 }),
    organelle: [
      K(ramp(0.07, 0.7, 0.55), 'smooth', { spec: 0.3 }),
      K(ramp(g.params.diet < 0.5 ? 0.3 : 0.9, 0.6, 0.5), 'smooth'),
      K(ramp(0.55, 0.4, 0.75), 'gel', { alpha: 0.7 }),
    ],
    plate: K(darkenRamp(Sd, 0.9), 'plates', { spec: 0.3 }),
    hairTuft: K(Sd, 'fur', { fuzz: 1.2 }),
  };
}

// ---------------------------------------------------------------------------------------------------
// Eyes & head
// ---------------------------------------------------------------------------------------------------
export function eye(rig: Rig, k: Kit, g: Genome, x: number, y: number, r: number, blink: boolean, lookX = 0.35, lid?: Mat) {
  if (r < 1.3) { rig.e(x, y, 1, 1, 0, k.pupil); return; }
  if (blink) { rig.c(x - r, y, x + r, y, r * 0.35, r * 0.35, lid ?? k.head, { noLine: false }); return; }
  if (g.pupil === 'compound') {
    rig.e(x, y, r * 1.1, r, 0, { ...k.iris, tex: 'compound', line: [20, 16, 20] });
    rig.e(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.22), Math.max(0.6, r * 0.22), 0, k.shine);
    return;
  }
  rig.e(x, y, r, r * 0.92, 0, k.sclera);
  const ir = r * 0.72, ix = x + r * lookX * 0.4;
  rig.e(ix, y, ir, ir, 0, k.iris, { noLine: true });
  if (g.pupil === 'slit') rig.e(ix, y, Math.max(0.5, ir * 0.22), ir * 0.85, 0, k.pupil, { noLine: true });
  else if (g.pupil === 'bar') rig.e(ix, y, ir * 0.8, Math.max(0.5, ir * 0.24), 0, k.pupil, { noLine: true });
  else rig.e(ix, y, ir * 0.48, ir * 0.48, 0, k.pupil, { noLine: true });
  rig.e(ix - ir * 0.4, y - ir * 0.45, Math.max(0.55, ir * 0.24), Math.max(0.55, ir * 0.24), 0, k.shine, { noLine: true });
}

export interface HeadOpts { sapient?: boolean; phase: number; blink: boolean; tilt?: number; noHorns?: boolean; hatTop?: (x: number, y: number, R: number) => void }

/** Draws a head centred on (hx, hy) facing right. Returns anchor points for hats / helmets. */
export function head(rig: Rig, k: Kit, g: Genome, hx: number, hy: number, R: number, o: HeadOpts) {
  const ph = o.phase, sap = !!o.sapient;
  const snoutLen = R * (0.35 + g.snout * 1.25) * (sap ? 0.5 : 1);
  const tilt = (o.tilt ?? 0.18) + (sap ? -0.05 : 0);
  const [dxs, dys] = [Math.cos(tilt), Math.sin(tilt)];
  const sx = hx + R * 0.45 * dxs, sy = hy + R * 0.45 * dys;           // snout base
  const tx = sx + snoutLen * dxs, ty = sy + snoutLen * dys;           // snout tip
  const tipR = R * (0.28 + (g.jaw === 'tusks' ? 0.1 : 0) + (1 - g.params.diet) * 0.08);

  // behind the head: frill, far horn / ear, far antenna
  if (!o.noHorns && g.horns === 'frill') {
    const pts: number[] = [];
    const fr = R * (1.6 + g.hornLen * 0.4);
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      const rr = fr * (i % 2 ? 0.82 : 1);
      pts.push(hx - R * 0.35 + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.9);
    }
    pts.push(hx - R * 0.2, hy + R * 0.5);
    rig.p(pts, { ...k.crest, tex: 'fin', alpha: 0.95 }, { flat: 0.5 });
  }
  if (g.ears === 'long' || g.ears === 'pointy' || g.ears === 'round') earShape(rig, k, g, hx - R * 0.1, hy - R * 0.55, R, ph, 0.7, sap);
  if (!o.noHorns && (g.horns === 'curved' || g.horns === 'antlers' || g.horns === 'straight')) horn(rig, k, g, hx + R * 0.15, hy - R * 0.65, R, 0.7);
  if (g.antennae && !o.noHorns) antenna(rig, k, hx + R * 0.1, hy - R * 0.7, R, ph + 1, 0.7);
  if (g.eyeFront && !g.eyeStalks && g.eyes >= 2) eye(rig, k, g, hx + R * 0.72, hy - R * 0.2, Math.max(1.3, R * 0.2 * g.eyeSize), o.blink, 0.6, k.head); // far eye peeking

  // cranium, snout, jaw
  rig.e(hx, hy, R, R * 0.9, 0, k.head, { g: 7 });
  if (g.jaw === 'beak') {
    const bl = snoutLen * 1.05 + R * 0.3, hook = g.params.diet * R * 0.35;
    rig.p([sx - R * 0.1, sy - R * 0.45, sx + bl * 0.7, sy - R * 0.25, sx + bl, sy + hook * 0.3, sx + bl - R * 0.1, sy + R * 0.18 + hook, sx + bl * 0.4, sy + R * 0.16, sx - R * 0.1, sy + R * 0.3], k.beak);
    rig.p([sx - R * 0.05, sy + R * 0.18, sx + bl * 0.75, sy + R * 0.22, sx + bl * 0.55, sy + R * 0.45, sx - R * 0.05, sy + R * 0.48], { ...k.beak, ramp: darkenRamp(k.beak.ramp, 0.82) });
  } else {
    rig.c(sx - R * 0.2 * dxs, sy, tx, ty, R * 0.72, tipR, k.head, { g: 7 });
    // lower jaw
    const jy = R * 0.32;
    rig.c(sx - R * 0.1, sy + jy, tx - tipR * 0.3, ty + jy * 0.7, R * 0.42, tipR * 0.7, { ...k.head, belly: undefined, ramp: darkenRamp(k.head.ramp, 0.94) }, { g: 7 });
    // mouth line & teeth
    const my0 = sy + jy * 0.55, my1 = ty + tipR * 0.35;
    rig.c(sx + R * 0.05, my0, tx - tipR * 0.2, my1, 0.5, 0.5, k.mouth, { noLine: true });
    if (g.jaw === 'teeth' && !sap) {
      const n = Math.max(2, Math.floor(snoutLen / 2.4));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.6) / (n + 0.4), x = sx + (tx - sx) * t, y = my0 + (my1 - my0) * t;
        const big = i === n - 1 || (i === Math.floor(n / 2) && g.params.diet > 0.8);
        rig.p([x - 0.8, y - 0.2, x + 0.8, y - 0.2, x, y + (big ? 2.4 : 1.4)], k.teeth, { noLine: true });
      }
    }
    if (g.jaw === 'tusks') rig.chain(sx + R * 0.1, my0 + 0.5, 0.6, 4, R * 1.1 * g.hornLen, R * 0.2, 0.6, () => -0.4, k.horn);
    if (g.jaw === 'mandibles') {
      for (const [d, dk] of [[1, 0.65], [0, 1]] as const) {
        rig.chain(tx - tipR, ty + tipR * 0.5 - d, 0.5, 3, R * 0.8, R * 0.2, 0.6, i => -0.35 - i * 0.2 + Math.sin(ph * 2) * 0.1 * (d ? -1 : 1), { ...k.claw, spec: 0.6 }, { dark: dk });
      }
    }
    // nostril
    rig.e(tx - tipR * 0.2, ty - tipR * 0.4, 0.6, 0.6, 0, k.mouth, { noLine: true });
  }
  // near ear / horns / crest / antenna / eyes
  if (g.ears === 'fins') {
    const pts = framePts(hx - R * 0.35, hy - R * 0.1, -2.4 + Math.sin(ph) * 0.1, [0, 0, R * 1.1, -R * 0.45, R * 1.25, 0, R * 1.1, R * 0.45]);
    rig.p(pts, k.fin, { flat: 0.6 });
  }
  if (g.ears === 'long' || g.ears === 'pointy' || g.ears === 'round') earShape(rig, k, g, hx - R * 0.3, hy - R * 0.6, R, ph, 1, sap);
  if (!o.noHorns && (g.horns === 'curved' || g.horns === 'antlers' || g.horns === 'straight')) horn(rig, k, g, hx - R * 0.05, hy - R * 0.72, R, 1);
  if (!o.noHorns && g.horns === 'crest') {
    for (let i = 0; i < 4; i++) {
      const a = -1.9 - i * 0.28 + Math.sin(ph + i) * 0.05, l = R * (1.1 - i * 0.12) * g.hornLen;
      rig.c(hx - R * 0.1, hy - R * 0.6, hx - R * 0.1 + Math.cos(a) * l, hy - R * 0.6 + Math.sin(a) * l, R * 0.22, R * 0.08, k.crest, { g: 9 });
    }
  }
  if (g.antennae && !o.noHorns) antenna(rig, k, hx - R * 0.05, hy - R * 0.8, R, ph, 1);
  if (g.tentacleBeard) {
    for (let i = 0; i < 3; i++) rig.chain(sx + R * 0.1 + i * R * 0.25, sy + R * 0.45, 1.5 - i * 0.15, 4, R * (0.9 - i * 0.15), R * 0.14, 0.5, j => Math.sin(ph * 1.5 - j - i) * 0.25 + 0.08, k.skinWet);
  }

  // eyes
  const er = Math.max(1.3, R * 0.26 * g.eyeSize * (sap ? 0.9 : 1));
  const ex = hx + R * (g.eyeFront ? 0.5 : 0.28), ey = hy - R * 0.22;
  if (g.eyeStalks) {
    for (const [dx, dk] of [[R * 0.35, 0.75], [0, 1]] as const) {
      const bx = hx + dx, by = hy - R * 0.6;
      const [x2, y2] = [bx + R * 0.35 + Math.sin(ph + dx) * R * 0.1, by - R * 1.1];
      rig.c(bx, by, x2, y2, R * 0.16, R * 0.12, k.head, { dark: dk });
      eye(rig, k, g, x2, y2, er * 0.85, o.blink);
    }
  } else if (g.eyes === 1) {
    eye(rig, k, g, hx + R * 0.35, hy - R * 0.25, er * 1.45, o.blink);
  } else {
    eye(rig, k, g, ex, ey, er, o.blink);
    // extra eyes: a trail of smaller ones up the brow
    for (let i = 2; i < g.eyes; i++) {
      const t = i - 1;
      eye(rig, k, g, ex - R * 0.28 * t, ey - R * 0.32 * t + (t > 2 ? R * 0.5 : 0), Math.max(1.2, er * (0.8 - t * 0.1)), o.blink);
    }
  }
  if (sap && g.jaw !== 'beak' && g.jaw !== 'mandibles') {
    // a hint of a brow gives sapient heads their expression
    rig.c(ex - er * 1.1, ey - er * 1.25, ex + er * 0.9, ey - er * 1.1, 0.6, 0.6, { ...k.head, ramp: darkenRamp(k.head.ramp, 0.6), tex: 'smooth', fuzz: 0 }, { noLine: true });
  }
  return { top: [hx - R * 0.1, hy - R * 0.85] as [number, number], R, eyeY: ey, face: [ex, ey] as [number, number] };
}

function earShape(rig: Rig, k: Kit, g: Genome, x: number, y: number, R: number, ph: number, dk: number, sap: boolean) {
  const sw = Math.sin(ph) * 0.06;
  if (g.ears === 'long') {
    const a = -1.95 + sw, l = R * (sap ? 1.1 : 1.6);
    rig.c(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, R * 0.3, R * 0.2, k.head, { dark: dk });
    rig.c(x + 0.4, y - 0.5, x + Math.cos(a) * l * 0.85, y + Math.sin(a) * l * 0.85, R * 0.14, R * 0.08, k.inner, { dark: dk, noLine: true });
  } else if (g.ears === 'pointy') {
    const pts = framePts(x, y, -1.8 + sw, [0, -R * 0.35, R * 0.95, 0, 0, R * 0.35]);
    rig.p(pts, k.head, { dark: dk });
    rig.p(framePts(x, y, -1.8 + sw, [R * 0.1, -R * 0.16, R * 0.65, 0, R * 0.1, R * 0.16]), k.inner, { dark: dk, noLine: true });
  } else {
    rig.e(x, y - R * 0.2, R * 0.38, R * 0.34, 0, k.head, { dark: dk });
    rig.e(x + 0.3, y - R * 0.2, R * 0.2, R * 0.18, 0, k.inner, { dark: dk, noLine: true });
  }
}

function horn(rig: Rig, k: Kit, g: Genome, x: number, y: number, R: number, dk: number) {
  const L = R * 1.2 * g.hornLen;
  if (g.horns === 'straight') { rig.c(x, y, x + L * 0.45, y - L, R * 0.2, 0.6, k.horn, { dark: dk }); return; }
  if (g.horns === 'curved') { rig.chain(x, y, -1.9, 5, L * 1.2, R * 0.24, 0.6, () => -0.3, k.horn, { dark: dk }); return; }
  const pts = rig.chain(x, y, -1.75, 4, L * 1.1, R * 0.14, 0.6, () => -0.12, k.horn, { dark: dk });
  for (let i = 1; i < pts.length - 1; i++) rig.c(pts[i][0], pts[i][1], pts[i][0] + L * 0.3, pts[i][1] - L * 0.28, R * 0.09, 0.5, k.horn, { dark: dk });
}

function antenna(rig: Rig, k: Kit, x: number, y: number, R: number, ph: number, dk: number) {
  const pts = rig.chain(x, y, -1.3, 5, R * 1.6, 0.6, 0.5, i => 0.12 + Math.sin(ph - i * 0.7) * 0.07, { ...k.claw, spec: 0.3 }, { dark: dk });
  const [ex, ey] = pts[pts.length - 1];
  rig.e(ex, ey, 1.2, 1.2, 0, k.glow.emit && R > 0 ? k.crest : k.crest, { dark: dk });
}
