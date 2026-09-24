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

// ---------------------------------------------------------------------------
// Distant galaxies (universe view): particle-baked sprites per shape
// ---------------------------------------------------------------------------
export function cssColorToRgb(c: string): RGB {
  const m = c.match(/-?[\d.]+/g);
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (c.startsWith('hsl') && m) {
    const h = +m[0], s = +m[1] / 100, l = +m[2] / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  if (m) return [+m[0], +m[1], +m[2]];
  return [255, 255, 255];
}

const galaxySpriteCache = new Map<string, HTMLCanvasElement>();
/** The cached galaxy sprite, or null when it has not been baked yet. */
export function peekGalaxySprite(shape: string, color: RGB, variant: number): HTMLCanvasElement | null {
  const q = color.map(v => Math.round(v / 24) * 24);
  return galaxySpriteCache.get(`${shape}|${q.join(',')}|${variant}`) ?? null;
}
export function galaxySprite(shape: string, color: RGB, variant: number): HTMLCanvasElement {
  const q = color.map(v => Math.round(v / 24) * 24) as RGB; // quantise colours to bound the cache
  const key = `${shape}|${q.join(',')}|${variant}`;
  let c = galaxySpriteCache.get(key);
  if (c) return c;
  const S = 96;
  const rng = seedrandom(key);
  const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const core = mix(q, [255, 222, 170], 0.7).map(v => v / 255) as RGB;
  const arm = mix(q, [170, 195, 255], 0.72).map(v => v / 255) as RGB;
  const hii: RGB = [1, 0.45, 0.75];
  let acc = new Float32Array(S * S * 3);
  const put = (x: number, y: number, w: number, col: RGB) => {
    const ix = Math.floor((x * 0.5 + 0.5) * S), iy = Math.floor((y * 0.5 + 0.5) * S);
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return;
    const i = (iy * S + ix) * 3;
    acc[i] += col[0] * w; acc[i + 1] += col[1] * w; acc[i + 2] += col[2] * w;
  };
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
  const isSpiral = shape === 'spiral' || shape === 'barred_spiral';
  const barred = shape === 'barred_spiral';
  const arms = 2 + (variant % 2);
  const twist = 2.0 + rng() * 1.6;

  // Particles: arm structure, ring, clumps
  const N = 5000;
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, col = arm, w = 0.22;
    if (shape === 'ring') {
      const a = rng() * Math.PI * 2, r = 0.6 + gauss() * 0.07; x = Math.cos(a) * r; y = Math.sin(a) * r;
      if (rng() < 0.06) col = hii;
    } else if (shape === 'irregular') {
      const cl = Math.floor(rng() * 6);
      const cr = seedrandom(key + cl);
      x = (cr() - 0.5) * 1.0 + gauss() * 0.2; y = (cr() - 0.5) * 1.0 + gauss() * 0.2;
      if (rng() < 0.08) col = hii;
    } else if (isSpiral) {
      const a = Math.floor(rng() * arms);
      const d = (barred ? 0.28 : 0.1) + Math.pow(rng(), 0.9) * 0.8;
      const th = (d - (barred ? 0.28 : 0)) * twist * Math.PI + a * (Math.PI * 2 / arms);
      const sp = 0.06 + d * 0.1;
      x = Math.cos(th) * d + gauss() * sp; y = Math.sin(th) * d + gauss() * sp;
      if (rng() < 0.03) { col = hii; w = 0.3; }
    } else continue; // ellipticals are purely analytic
    put(x * 0.92, y * 0.92, w, col);
  }
  // Soften particles (two 3x3 box passes)
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          sum += acc[(yy * S + xx) * 3 + ch]; n++;
        }
        out[(y * S + x) * 3 + ch] = sum / n * 1.6;
      }
    }
    acc = out;
  }
  // Analytic bulge + disc
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
    let r = Math.hypot(u, v);
    const i = (y * S + x) * 3;
    let b = 0, d = 0;
    if (shape === 'elliptical') { b = Math.exp(-r / 0.2) * 1.4 + Math.exp(-r / 0.5) * 0.25; }
    else {
      if (barred) r = Math.hypot(u, v * 3.2) * 0.6 + r * 0.4;
      b = Math.exp(-r / (barred ? 0.13 : 0.11)) * 2.2;
      d = Math.exp(-Math.hypot(u, v) / 0.38) * (shape === 'irregular' ? 0.15 : 0.35);
    }
    acc[i] += core[0] * b + arm[0] * d; acc[i + 1] += core[1] * b + arm[1] * d; acc[i + 2] += core[2] * b + arm[2] * d;
  }
  c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const r = acc[i * 3], g = acc[i * 3 + 1], b = acc[i * 3 + 2];
    const L = Math.max(r, g, b);
    if (L <= 0) continue;
    const m = 1 - Math.exp(-L * 1.6);
    img.data[i * 4] = (r / L) * m * 255;
    img.data[i * 4 + 1] = (g / L) * m * 255;
    img.data[i * 4 + 2] = (b / L) * m * 255;
    img.data[i * 4 + 3] = m * 255;
  }
  ctx.putImageData(img, 0, 0);
  galaxySpriteCache.set(key, c);
  return c;
}
