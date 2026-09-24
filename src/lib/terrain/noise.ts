// Fast deterministic integer hashing + value noise. Much cheaper than simplex for the
// per-pixel work of the ground rasterizer, and fully reproducible across machines.

/** 32-bit integer hash of (x, y, seed) -> uint32 */
export function hash3(x: number, y: number, s: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return h >>> 0;
}
/** hash -> [0,1) */
export const rand2 = (x: number, y: number, s: number) => hash3(x, y, s) / 4294967296;

export function seedToInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** 2D value noise in [0,1] */
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = rand2(xi, yi, s), b = rand2(xi + 1, yi, s);
  const c = rand2(xi, yi + 1, s), d = rand2(xi + 1, yi + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** Fractal value noise in [0,1] */
export function fbm2(x: number, y: number, s: number, oct = 4): number {
  let f = 0, amp = 0.5, norm = 0, fr = 1;
  for (let o = 0; o < oct; o++) {
    f += vnoise(x * fr, y * fr, s + o * 1013) * amp;
    norm += amp; amp *= 0.5; fr *= 2.03;
  }
  return f / norm;
}

/** Ridged noise: 1 at ridges (value noise zero-crossings), 0 elsewhere */
export function ridge(x: number, y: number, s: number, oct = 3): number {
  const n = fbm2(x, y, s, oct) * 2 - 1;
  return 1 - Math.abs(n);
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 4x4 Bayer matrix for ordered dithering (values 0..1)
export const BAYER4 = [
  0 / 16, 8 / 16, 2 / 16, 10 / 16,
  12 / 16, 4 / 16, 14 / 16, 6 / 16,
  3 / 16, 11 / 16, 1 / 16, 9 / 16,
  15 / 16, 7 / 16, 13 / 16, 5 / 16,
];
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];
