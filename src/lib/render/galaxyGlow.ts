// Bakes a photographic-looking "integrated light" image for a galaxy from its star list:
// point deposit -> two-scale gaussian blur -> HII knots around young stars -> dust lanes -> tone map.
import seedrandom from 'seedrandom';
import { createNoise2D } from 'simplex-noise';
import type { StellarSystemMetadata } from '../galaxy/types';

const N = 512;

function blur(src: Float32Array, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 2.5);
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const row = y * N;
    for (let x = 0; x < N; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < N) a += src[row + xx] * k[i + r]; }
      tmp[row + x] = a;
    }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < N) a += tmp[yy * N + x] * k[i + r]; }
      out[y * N + x] = a;
    }
  }
  return out;
}

function hexRgb(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}

/** Returns a canvas covering logical space [-extent, extent]² */
export function bakeGalaxyGlow(stars: StellarSystemMetadata[], extent: number, galaxyRadius: number, age: number, seed: string): HTMLCanvasElement {
  const rng = seedrandom(seed + '_glow');
  const noise = createNoise2D(rng);
  const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N);
  const Hr = new Float32Array(N * N); // HII emission (pink)
  const toPx = (v: number) => ((v / extent) * 0.5 + 0.5) * N;
  const young = Math.max(0, 1 - age / 0.75);

  const deposit = (x: number, y: number, w: number, c: [number, number, number], target?: Float32Array) => {
    const px = toPx(x), py = toPx(y);
    const ix = px | 0, iy = py | 0;
    if (ix < 0 || iy < 0 || ix >= N || iy >= N) return;
    const i = iy * N + ix;
    if (target) { target[i] += w; return; }
    R[i] += c[0] * w; G[i] += c[1] * w; B[i] += c[2] * w;
  };

  for (const s of stars) {
    if (s.starClass === 'BH') continue;
    const c = hexRgb(s.baseColor);
    const cls = s.starClass;
    // young massive stars dominate the light of spiral arms -> bluish arms, yellow bulge
    const lum = cls === 'O' ? 14 : cls === 'B' ? 7 : cls === 'A' ? 3 : cls === 'F' ? 1.6 : cls === 'NS' || cls === 'P' ? 0.8 : 1;
    deposit(s.x, s.y, lum / 255, c);
    // Unresolved background population: scatter a few faint copies around each star
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2, d = Math.abs(rng() + rng() - 1) * galaxyRadius * 0.05;
      deposit(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 0.35 / 255, c);
    }
    if ((cls === 'O' || cls === 'B') && young > 0) deposit(s.x, s.y, young * (cls === 'O' ? 2 : 1), [0, 0, 0], Hr);
  }

  const fine = [blur(R, 1.2), blur(G, 1.2), blur(B, 1.2)];
  const wide = [blur(R, 7), blur(G, 7), blur(B, 7)];
  const hii = blur(Hr, 2.4);

  // Normalise by a high percentile so every galaxy is exposed similarly
  const lum = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) lum[i] = fine[0][i] + fine[1][i] + fine[2][i] + (wide[0][i] + wide[1][i] + wide[2][i]) * 3;
  const sample: number[] = [];
  for (let i = 0; i < N * N; i += 37) if (lum[i] > 0) sample.push(lum[i]);
  sample.sort((a, b) => a - b);
  // expose for the typical (median) disc brightness; the core is allowed to saturate
  const p = sample.length ? sample[Math.floor(sample.length * 0.6)] : 1;
  const k = 0.55 / (p || 1);
  let hmax = 0;
  for (let i = 0; i < N * N; i++) if (hii[i] > hmax) hmax = hii[i];

  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const dustAmount = 0.75 * (1 - Math.max(0, age - 0.6) * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let r = fine[0][i] + wide[0][i] * 3, g = fine[1][i] + wide[1][i] * 3, b = fine[2][i] + wide[2][i] * 3;
    const L = r + g + b;
    if (L <= 0 && hii[i] <= 0) continue;
    const mapped = 1 - Math.exp(-L * k);
    // keep the hue, compress the intensity (r+g+b = L -> each channel ~ L/3 for white light)
    const f = L > 0 ? (mapped * 255 * 3 * 0.9) / L : 0;
    r *= f; g *= f; b *= f;
    // Dust filaments: ridged noise darkening the mid disc
    const lx = (x / N - 0.5) * 2 * extent, ly = (y / N - 0.5) * 2 * extent;
    const rr = Math.hypot(lx, ly) / galaxyRadius;
    if (dustAmount > 0 && rr > 0.06 && rr < 1.1) {
      const q = lx / galaxyRadius, w = ly / galaxyRadius;
      const n = noise(q * 3.5, w * 3.5) * 0.55 + noise(q * 8 + 3.1, w * 8 - 1.7) * 0.3 + noise(q * 17 - 5, w * 17 + 2) * 0.15;
      const lane = Math.max(0, Math.min(1, (n - 0.05) / 0.5));
      const radial = Math.sin(Math.min(1, (rr - 0.06) / 1.04) * Math.PI);
      const d = lane * lane * dustAmount * radial * 0.6;
      r *= 1 - d; g *= 1 - d * 1.08; b *= 1 - d * 1.2; // dust reddens as it dims
    }
    // HII regions glow pink/red
    if (hmax > 0) {
      const h = Math.pow(hii[i] / hmax, 0.6) * young;
      r += h * 255 * 0.9; g += h * 70; b += h * 150;
    }
    const a = Math.max(r, g, b);
    img.data[i * 4] = Math.min(255, r);
    img.data[i * 4 + 1] = Math.min(255, g);
    img.data[i * 4 + 2] = Math.min(255, b);
    img.data[i * 4 + 3] = Math.min(255, a);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
