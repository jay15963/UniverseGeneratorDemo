// Pre-rendered sprites for stars, rings, asteroids and generic glows.
// Everything is baked once into offscreen canvases and cached; per-frame work is just drawImage.
import seedrandom from 'seedrandom';
import { createNoise3D } from 'simplex-noise';

export type RGB = [number, number, number];

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------------------------------------------------------------------------
// Glow (radial falloff) – used for coronas, bloom, halos
// ---------------------------------------------------------------------------
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(rgb: RGB, falloff = 2.2): HTMLCanvasElement {
  const key = rgb.join(',') + '|' + falloff;
  let c = glowCache.get(key);
  if (c) return c;
  const S = 128;
  c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
    const a = d >= 1 ? 0 : Math.pow(1 - d, falloff);
    const p = (y * S + x) * 4;
    img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  glowCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Star photosphere: limb darkening + animated granulation (a few baked frames)
// ---------------------------------------------------------------------------
const starCache = new Map<string, HTMLCanvasElement[]>();
export function starSurfaceFrames(rgb: RGB, seed: string, size = 192, frames = 6): HTMLCanvasElement[] {
  const key = rgb.join(',') + seed + size;
  let list = starCache.get(key);
  if (list) return list;
  const noise = createNoise3D(seedrandom(seed + '_photosphere'));
  list = [];
  const r = size / 2;
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const t = (f / frames) * Math.PI * 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      // granulation cells, looping over time along a circle in noise space
      const g = noise(dx * 9 + Math.cos(t) * 0.6, dy * 9 + Math.sin(t) * 0.6, nz * 9) * 0.5
              + noise(dx * 22, dy * 22 + Math.cos(t) * 0.4, nz * 22 + Math.sin(t) * 0.4) * 0.25;
      const limb = 0.35 + 0.65 * Math.pow(nz, 0.55);
      const k = limb * (1 + g * 0.22);
      const hot = Math.pow(nz, 3) * 0.55; // whiter core
      const p = (y * size + x) * 4;
      img.data[p] = Math.min(255, (rgb[0] + (255 - rgb[0]) * hot) * k);
      img.data[p + 1] = Math.min(255, (rgb[1] + (255 - rgb[1]) * hot) * k);
      img.data[p + 2] = Math.min(255, (rgb[2] + (255 - rgb[2]) * hot) * k);
      const edge = (1 - Math.sqrt(d2)) * r;
      img.data[p + 3] = Math.min(1, edge + 0.5) * 255;
    }
    ctx.putImageData(img, 0, 0);
    list.push(c);
  }
  starCache.set(key, list);
  return list;
}

// Soft streak rays around bright stars (additive)
const rayCache = new Map<string, HTMLCanvasElement>();
export function starRaysSprite(rgb: RGB, seed: string): HTMLCanvasElement {
  const key = rgb.join(',') + seed;
  let c = rayCache.get(key);
  if (c) return c;
  const S = 512;
  c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const rng = seedrandom(seed + '_rays');
  ctx.translate(S / 2, S / 2);
  ctx.globalCompositeOperation = 'lighter';
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rng() * 0.3;
    const len = S * (0.22 + rng() * 0.28);
    const w = 2 + rng() * 5;
    ctx.save();
    ctx.rotate(a);
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  rayCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Planetary rings: seeded radial band profile baked into a flat annulus
// ---------------------------------------------------------------------------
export interface RingSprite { canvas: HTMLCanvasElement; inner: number; outer: number; }
const ringCache = new Map<string, RingSprite>();
export function ringSprite(seed: string, tint: RGB, icy: boolean): RingSprite {
  const key = seed + tint.join(',') + icy;
  let rs = ringCache.get(key);
  if (rs) return rs;
  const rng = seedrandom(seed + '_rings');
  const S = 512;
  const inner = 1.35 + rng() * 0.2;   // in planet radii
  const outer = inner + 0.7 + rng() * 0.9;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  // 1D profile
  const N = 256;
  const prof = new Float32Array(N);
  const gaps: [number, number][] = [];
  for (let g = 0; g < 2 + Math.floor(rng() * 3); g++) gaps.push([rng(), 0.01 + rng() * 0.04]);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let v = 0.55 + 0.45 * Math.sin(t * 40 + rng() * 0.4) * Math.sin(t * 13 + 1.3);
    v *= 0.6 + 0.4 * Math.sin(t * Math.PI);
    for (const [gp, gw] of gaps) if (Math.abs(t - gp) < gw) v *= 0.08;
    prof[i] = Math.max(0, Math.min(1, v));
  }
  const base: RGB = icy ? [225, 232, 240] : [tint[0] * 0.8 + 50, tint[1] * 0.8 + 45, tint[2] * 0.8 + 40];
  const outerPx = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / outerPx * outer; // in planet radii
    if (d < inner || d > outer) continue;
    const t = (d - inner) / (outer - inner);
    const v = prof[Math.min(N - 1, (t * N) | 0)];
    const shade = 0.75 + 0.25 * Math.sin(t * 90);
    const p = (y * S + x) * 4;
    img.data[p] = base[0] * shade; img.data[p + 1] = base[1] * shade; img.data[p + 2] = base[2] * shade;
    img.data[p + 3] = v * 200;
  }
  ctx.putImageData(img, 0, 0);
  rs = { canvas: c, inner, outer };
  ringCache.set(key, rs);
  return rs;
}

// ---------------------------------------------------------------------------
// Asteroids: a handful of irregular lit rocks (pixel-art style, tiny canvases)
// ---------------------------------------------------------------------------
let asteroidSprites: HTMLCanvasElement[] | null = null;
export function asteroidSpriteSet(): HTMLCanvasElement[] {
  if (asteroidSprites) return asteroidSprites;
  const rng = seedrandom('asteroids');
  asteroidSprites = [];
  for (let k = 0; k < 10; k++) {
    const S = 16;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const lobes = Array.from({ length: 5 }, () => [rng() * 2 - 1, rng() * 2 - 1, 0.35 + rng() * 0.35]);
    const tone = 90 + rng() * 60;
    const warm = rng() * 25;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - S / 2) / (S / 2), dy = (y + 0.5 - S / 2) / (S / 2);
      let inside = dx * dx + dy * dy < 0.35;
      for (const [lx, ly, lr] of lobes) if ((dx - lx * 0.4) ** 2 + (dy - ly * 0.4) ** 2 < lr * lr) inside = true;
      if (!inside || dx * dx + dy * dy > 0.95) continue;
      const light = 0.55 + 0.45 * (-dx * 0.6 - dy * 0.6) + (rng() - 0.5) * 0.15;
      const p = (y * S + x) * 4;
      img.data[p] = (tone + warm) * light; img.data[p + 1] = tone * light; img.data[p + 2] = (tone - warm * 0.5) * light; img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    asteroidSprites.push(c);
  }
  return asteroidSprites;
}
