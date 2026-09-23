// Procedural deep-space backdrop: tileable nebula + parallax star layers + twinkling stars.
// Everything is seeded, baked once into small tiles and then just blitted every frame.
import seedrandom from 'seedrandom';
import { createNoise4D } from 'simplex-noise';

export interface BackdropOptions {
  seed: string;
  /** Hues (0..360) for the nebula clouds. Picked from the seed when omitted. */
  hues?: number[];
  /** 0..1 overall nebula strength. */
  nebula?: number;
  /** 0..1 star density multiplier. */
  density?: number;
  /** Dims everything (e.g. dying universes). 0..1 */
  dim?: number;
}

interface Twinkler { x: number; y: number; r: number; phase: number; speed: number; rgb: string; }

const STAR_COLORS = ['255,255,255', '200,220,255', '170,200,255', '255,240,220', '255,220,180', '255,200,160'];

function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export class SpaceBackdrop {
  private nebula: HTMLCanvasElement;
  private layers: { tile: HTMLCanvasElement; parallax: number }[] = [];
  private twinklers: Twinkler[] = [];
  private dim: number;
  static readonly NEB = 256;   // nebula texture resolution (upscaled smoothly)
  static readonly NEB_WORLD = 1600; // screen px covered by one nebula tile

  constructor(opts: BackdropOptions) {
    const rng = seedrandom(opts.seed + '_backdrop');
    this.dim = opts.dim ?? 0;
    const density = opts.density ?? 1;
    const baseHue = rng() * 360;
    const hues = opts.hues ?? [baseHue, (baseHue + 40 + rng() * 80) % 360, (baseHue + 180 + rng() * 60) % 360];
    this.nebula = this.bakeNebula(rng, hues, opts.nebula ?? 0.8);

    // Star tiles: far (many tiny), mid, near (few bright with glow)
    this.layers.push({ tile: this.bakeStars(rng, 1024, Math.round(1400 * density), 0.3, 1.0, 0.25), parallax: 0.015 });
    this.layers.push({ tile: this.bakeStars(rng, 1024, Math.round(420 * density), 0.6, 1.5, 0.6), parallax: 0.04 });
    this.layers.push({ tile: this.bakeStars(rng, 1024, Math.round(70 * density), 1.0, 2.2, 1.0, true), parallax: 0.08 });

    for (let i = 0; i < 60 * density; i++) {
      this.twinklers.push({
        x: rng(), y: rng(), r: 0.6 + rng() * 1.3, phase: rng() * Math.PI * 2, speed: 0.6 + rng() * 2.2,
        rgb: STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)],
      });
    }
  }

  private bakeNebula(rng: () => number, hues: number[], strength: number): HTMLCanvasElement {
    const N = SpaceBackdrop.NEB;
    const noise = createNoise4D(rng);
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const cols = hues.map((h, i) => hsl(h, 70 - i * 10, 45 + i * 5));
    const R = 1.2;
    const fbm = (a: number, b: number, off: number, oct: number) => {
      // torus mapping makes the texture tile seamlessly
      const x = Math.cos(a) * R, y = Math.sin(a) * R, z = Math.cos(b) * R, w = Math.sin(b) * R;
      let f = 0, amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        f += noise(x * freq + off, y * freq, z * freq, w * freq + off) * amp;
        norm += amp; amp *= 0.55; freq *= 2;
      }
      return f / norm;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = (j / N) * Math.PI * 2;
      const warp = fbm(a, b, 50, 3) * 1.2;
      const base = fbm(a + warp, b + warp, 0, 6) * 0.5 + 0.5;
      const mask = Math.max(0, fbm(a, b, 20, 3) * 0.5 + 0.5 - 0.35) / 0.65; // big empty voids
      const dust = Math.max(0, fbm(a * 1.0, b * 1.0, 90, 5)); // dark dust lanes
      let v = Math.pow(base, 2.4) * mask * strength;
      v *= 1 - Math.min(0.85, dust * 1.4);
      const mix = fbm(a, b, 130, 3) * 0.5 + 0.5;
      const c0 = cols[0], c1 = cols[1 % cols.length], c2 = cols[2 % cols.length];
      const t = mix;
      let r = c0[0] * (1 - t) + c1[0] * t, g = c0[1] * (1 - t) + c1[1] * t, bl = c0[2] * (1 - t) + c1[2] * t;
      const hot = Math.pow(Math.max(0, base - 0.6) / 0.4, 2); // brighter cores shift to the third hue
      r = r * (1 - hot) + c2[0] * hot; g = g * (1 - hot) + c2[1] * hot; bl = bl * (1 - hot) + c2[2] * hot;
      const p = (j * N + i) * 4;
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = bl;
      img.data[p + 3] = Math.min(255, v * 255 * 1.4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  private bakeStars(rng: () => number, S: number, count: number, minR: number, maxR: number, bright: number, glow = false) {
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < count; i++) {
      const x = rng() * S, y = rng() * S;
      const r = minR + Math.pow(rng(), 3) * (maxR - minR);
      const a = (0.25 + rng() * 0.75) * bright;
      const col = STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)];
      if (glow) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        g.addColorStop(0, `rgba(${col},${a * 0.5})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      }
      ctx.fillStyle = `rgba(${col},${a})`;
      if (r < 0.9) ctx.fillRect(x, y, 1, 1);
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    return c;
  }

  /**
   * Draw the backdrop covering (0,0,w,h) in CSS pixels.
   * camX/camY: camera position in any world unit; parallax factors turn it into a gentle drift.
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number, timeSec: number, zoom = 1) {
    ctx.save();
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);

    // Nebula (smoothly upscaled, tiled)
    const NW = SpaceBackdrop.NEB_WORLD;
    const zPar = 1 + Math.log2(Math.max(0.05, zoom)) * 0.04; // slight "depth" when zooming
    const tile = NW * zPar;
    ctx.globalAlpha = 1 - this.dim;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const nx = (((-camX * 0.01) % tile) + tile) % tile - tile;
    const ny = (((-camY * 0.01) % tile) + tile) % tile - tile;
    for (let y = ny; y < h; y += tile) for (let x = nx; x < w; x += tile) ctx.drawImage(this.nebula, x, y, tile, tile);

    // Star layers
    ctx.globalAlpha = 1 - this.dim * 0.6;
    for (const L of this.layers) {
      const S = L.tile.width;
      const ox = (((-camX * L.parallax) % S) + S) % S - S;
      const oy = (((-camY * L.parallax) % S) + S) % S - S;
      for (let y = oy; y < h; y += S) for (let x = ox; x < w; x += S) ctx.drawImage(L.tile, x, y);
    }

    // Twinkling stars (screen-anchored with mild parallax)
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.twinklers) {
      const a = (0.5 + 0.5 * Math.sin(timeSec * t.speed + t.phase)) * (1 - this.dim);
      if (a < 0.05) continue;
      const x = ((t.x * w - camX * 0.06) % w + w) % w;
      const y = ((t.y * h - camY * 0.06) % h + h) % h;
      ctx.fillStyle = `rgba(${t.rgb},${a})`;
      ctx.fillRect(x - t.r * 3, y - 0.35, t.r * 6, 0.7);
      ctx.fillRect(x - 0.35, y - t.r * 3, 0.7, t.r * 6);
      ctx.beginPath(); ctx.arc(x, y, t.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
