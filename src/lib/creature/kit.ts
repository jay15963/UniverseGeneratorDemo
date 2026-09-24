// Material kit derived from a genome (per stage), and the pixel-space pattern functions.
import { Genome, Stage, seaColours, HSL } from './genome';
import { Mat, RGB, Tex, ramp, darkenRamp, rampRGB } from './raster';
import { vnoise } from '../terrain/noise';

export interface Kit {
  body: Mat; limb: Mat; head: Mat; sock: Mat; mark: Mat; skinWet: Mat; gel: Mat; membrane: Mat; fin: Mat;
  horn: Mat; claw: Mat; beak: Mat; nose: Mat; sclera: Mat; iris: Mat; pupil: Mat; shine: Mat; lid: Mat; brow: Mat;
  mouth: Mat; gum: Mat; teeth: Mat; inner: Mat; crest: Mat; glow: Mat; nucleus: Mat; organelle: Mat[]; plate: Mat; tuft: Mat;
  cover: Tex;
}
const K = (r: RGB[], tex: Tex, extra: Partial<Mat> = {}): Mat => ({ ramp: r, tex, ...extra });
const R = (c: HSL, spread = 1) => ramp(c.h, c.s, c.l, spread);

export function patternFn(g: Genome): ((x: number, y: number, u: number, v: number) => boolean) | null {
  const sc = g.patternScale, a = 0.18 + g.patternAngle * 0.25, ca = Math.cos(a), sa = Math.sin(a);
  const seed = Math.floor(g.r[40] * 1000);
  const cells = (k: number, test: (d: number) => boolean) => (x: number, y: number) => {
    const cx = Math.floor(x / k), cy = Math.floor(y / k);
    let best = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const hx = (cx + i + 0.5 + (vnoise(cx + i, cy + j, seed) - 0.5) * 0.7) * k, hy = (cy + j + 0.5 + (vnoise(cx + i + 7, cy + j, seed) - 0.5) * 0.7) * k;
      best = Math.min(best, Math.hypot(x - hx, y - hy) / k);
    }
    return test(best);
  };
  switch (g.pattern) {
    case 'stripes': return (x, y) => Math.sin(((x * ca + y * sa) / (2.6 * sc)) + vnoise(x / 12, y / 12, seed) * 2.4) > 0.42;
    case 'bands': return (x, y) => Math.sin((x * ca + y * sa) / (5.5 * sc)) > 0.55;
    case 'rings': return (_x, _y, u) => Math.sin(u / (1.7 * sc)) > 0.55;
    case 'patches': return (x, y) => vnoise(x / (9 * sc), y / (9 * sc), seed) > 0.6;
    case 'dapples': return (x, y) => vnoise(x / (3.2 * sc), y / (3.2 * sc), seed + 3) > 0.7;
    case 'spots': return cells(7.5 * sc, d => d < 0.24);
    case 'rosettes': return cells(8 * sc, d => d > 0.16 && d < 0.32);
    default: return null; // saddle / dorsal are painted as shapes by the builders
  }
}

export function makeKit(g: Genome, stage: Stage): Kit {
  const sea = stage >= Stage.AQUA_LARVA && stage <= Stage.AQUA_GIANT;
  const col = sea ? seaColours(g) : { primary: g.primary, secondary: g.secondary, belly: g.belly, accent: g.accent };
  const amph = stage === Stage.AMPHIBIAN || stage === Stage.AMPHIBIAN_GIANT;
  const P = R(col.primary), Sd = R(col.secondary), B = R(col.belly, 0.8), A = R(col.accent);
  const pat = patternFn(g);
  const cover: Tex = sea ? (g.aquaForm === 'crustacean' ? 'chitin' : g.aquaForm === 'fish' || g.aquaForm === 'ray' ? 'scales' : 'skin')
    : amph ? (g.aquaForm === 'crustacean' ? 'chitin' : stage === Stage.AMPHIBIAN_GIANT ? 'plates' : 'skin')
      : ({ scales: 'scales', feathers: 'feathers', fur: 'fur', skin: 'skin', chitin: 'chitin', plates: 'plates' } as const)[g.covering];
  const fuzz = cover === 'fur' ? 1.1 : cover === 'feathers' ? 0.5 : 0;
  const spec = cover === 'chitin' ? 0.8 : cover === 'skin' ? (amph ? 0.55 : 0.3) : cover === 'scales' ? 0.25 : 0;
  const body = K(P, cover, { alt: Sd, pattern: pat, belly: g.counterShade ? B : undefined, fuzz, spec, texScale: stage === Stage.LAND_GIANT || stage === Stage.AQUA_GIANT || stage === Stage.AMPHIBIAN_GIANT ? 1.4 : 1 });
  const hornR = rampRGB(g.params.temperature > 0.6 ? [214, 196, 160] : [226, 214, 190]);
  const eyeR = ramp(g.eye.h, g.eye.s, g.eye.l);
  const scl: RGB[] = g.fierce > 0.85 && g.mode === 'alien' ? ramp(0.02, 0.6, 0.3) : ramp(0.12, 0.1, 0.86, 0.6);
  const headDark = darkenRamp(P, 0.62);
  return {
    cover, body,
    limb: { ...body, belly: undefined },
    head: { ...body },
    sock: K(g.socks ? Sd : P, cover, { fuzz, spec }),
    mark: K(Sd, cover, { fuzz: fuzz * 0.6 }),
    skinWet: K(P, 'skin', { alt: Sd, pattern: pat, belly: B, spec: 0.55 }),
    gel: K(ramp(col.primary.h, col.primary.s * 0.8, 0.62, 0.7), 'gel', { alpha: 0.78 }),
    membrane: K(ramp(col.secondary.h, col.secondary.s, Math.min(0.66, col.secondary.l + 0.08)), 'fin', { alpha: 0.88 }),
    fin: K(ramp(col.secondary.h, col.secondary.s * 0.9, Math.min(0.7, col.secondary.l + 0.1)), 'fin', { alpha: 0.84 }),
    horn: K(hornR, 'bone', { spec: 0.2 }),
    claw: K(ramp(0.08, 0.15, 0.28), 'smooth', { spec: 0.4 }),
    beak: K(g.mode === 'alien' ? A : ramp(g.r[41] < 0.5 ? 0.11 : 0.07, 0.55, g.r[42] < 0.3 ? 0.25 : 0.55), 'smooth', { spec: 0.35 }),
    nose: K(ramp(g.covering === 'fur' ? 0.97 : col.primary.h, 0.25, 0.22), 'smooth', { spec: 0.6, line: null }),
    sclera: K(scl, 'smooth', { line: [20, 14, 18] }),
    iris: K(eyeR, 'smooth', { line: null, spec: 0.6 }),
    pupil: K([[8, 6, 10], [10, 8, 12], [14, 10, 16], [18, 14, 20], [24, 18, 26], [30, 24, 32]], 'smooth', { line: null }),
    shine: K(Array.from({ length: 6 }, () => [255, 255, 255] as RGB), 'smooth', { emit: true, line: null }),
    lid: K(darkenRamp(P, 0.8), cover === 'fur' ? 'fur' : 'skin', { line: null }),
    brow: K(headDark, 'smooth', { line: null }),
    mouth: K(ramp(0.98, 0.45, 0.16), 'smooth', { line: null }),
    gum: K(ramp(0.97, 0.55, 0.35), 'smooth', { line: [40, 10, 16] }),
    teeth: K(ramp(0.12, 0.18, 0.88, 0.5), 'smooth', { line: [60, 40, 40] }),
    inner: K(B, cover === 'fur' ? 'fur' : 'skin', { fuzz: cover === 'fur' ? 0.5 : 0 }),
    crest: K(A, cover === 'feathers' ? 'feathers' : 'fin', { fuzz: cover === 'feathers' ? 0.5 : 0 }),
    glow: K(ramp(g.glowHue, 0.9, 0.62), 'glow', { emit: true, line: null }),
    nucleus: K(ramp(col.secondary.h, 0.55, 0.32), 'gel', { alpha: 0.9 }),
    organelle: [
      K(ramp(0.07, 0.7, 0.55), 'smooth', { spec: 0.3 }),
      K(ramp(g.params.diet < 0.5 ? 0.3 : 0.9, 0.6, 0.5), 'smooth'),
      K(ramp(0.55, 0.4, 0.75), 'gel', { alpha: 0.7 }),
    ],
    plate: K(darkenRamp(Sd, 0.9), 'plates', { spec: 0.3 }),
    tuft: K(g.tipColor ? (col.secondary.l < col.primary.l ? Sd : B) : Sd, 'fur', { fuzz: 1.2 }),
  };
}
