// Tiny pixel-art toolkit: every asset in the survival view is painted with these primitives.
import { RGB } from './palettes';
import { bayer, mulberry } from './noise';

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  rng: () => number;

  constructor(w: number, h: number, seed = 1) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.rng = mulberry(seed);
  }

  set(x: number, y: number, c: RGB, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = (y * this.w + x) * 4;
    if (a >= 255 || this.d[k + 3] === 0) {
      this.d[k] = c[0]; this.d[k + 1] = c[1]; this.d[k + 2] = c[2]; this.d[k + 3] = a;
    } else {
      const t = a / 255;
      this.d[k] = this.d[k] + (c[0] - this.d[k]) * t;
      this.d[k + 1] = this.d[k + 1] + (c[1] - this.d[k + 1]) * t;
      this.d[k + 2] = this.d[k + 2] + (c[2] - this.d[k + 2]) * t;
      this.d[k + 3] = Math.max(this.d[k + 3], a);
    }
  }
  alpha(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  get(x: number, y: number): RGB {
    const k = (y * this.w + x) * 4;
    return [this.d[k], this.d[k + 1], this.d[k + 2]];
  }
  /** Pick from a ramp with ordered dithering between neighbouring shades. */
  shade(ramp: RGB[], v: number, x: number, y: number): RGB {
    const f = Math.max(0, Math.min(ramp.length - 1.001, v * (ramp.length - 1)));
    const i = Math.floor(f);
    const fr = f - i;
    // flat bands with dithering only across the transition between two shades
    const up = fr > 0.68 ? true : fr < 0.32 ? false : (fr - 0.32) / 0.36 > bayer(x, y);
    return ramp[up ? Math.min(ramp.length - 1, i + 1) : i];
  }

  /**
   * Lit blob (leaf clump, rock, berry...). Light comes from the upper-left.
   * `bias` shifts the whole clump darker/lighter; `rough` frays the silhouette;
   * `global` (optional) is an outer sphere whose lighting is blended in for canopy cohesion.
   */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: RGB[], opts: {
    bias?: number; rough?: number; holes?: number; global?: { cx: number; cy: number; r: number; w: number }; speck?: number; rim?: number;
  } = {}) {
    const { bias = 0, rough = 0, holes = 0, global, speck = 0.05, rim = 0 } = opts;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d2 = dx * dx + dy * dy;
        const edge = 1 + (rough ? (this.rng() - 0.5) * rough : 0);
        if (d2 > edge) continue;
        if (holes && d2 > 0.35 && this.rng() < holes) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        let l = -dx * 0.45 - dy * 0.6 + nz * 0.55;
        if (global) {
          const gx = (x + 0.5 - global.cx) / global.r, gy = (y + 0.5 - global.cy) / global.r;
          const gz = Math.sqrt(Math.max(0, 1 - Math.min(1, gx * gx + gy * gy)));
          const gl = -gx * 0.5 - gy * 0.7 + gz * 0.4;
          l = l * (1 - global.w) + gl * global.w;
        }
        let v = 0.42 + l * 0.42 + bias + (this.rng() - 0.5) * speck;
        // self-shadowed lower-right rim separates overlapping clumps
        if (rim && d2 > 0.6 && dx * 0.6 + dy * 0.8 > 0.2) v -= rim * 0.3;
        if (rim && d2 > 0.55 && dx * 0.6 + dy * 0.8 < -0.35) v += rim * 0.12;
        this.set(x, y, this.shade(ramp, v, x, y));
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB | ((t: number, x: number, y: number) => RGB), width = 1) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      for (let w = 0; w < width; w++) {
        const px = Math.round(x + (Math.abs(dy) > Math.abs(dx) ? w - (width - 1) / 2 : 0));
        const py = Math.round(y + (Math.abs(dy) > Math.abs(dx) ? 0 : w - (width - 1) / 2));
        this.set(px, py, typeof c === 'function' ? c(t, px, py) : c);
      }
    }
  }

  /** Tiny leaf-shaped highlight/shadow marks scattered on an existing canopy. */
  leafMarks(ramp: RGB[], count: number, litTest: (x: number, y: number) => number, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(x0 + this.rng() * (x1 - x0)), y = Math.floor(y0 + this.rng() * (y1 - y0));
      if (!this.alpha(x, y) || !this.alpha(x + 1, y + 1) || !this.alpha(x - 1, y)) continue;
      const l = litTest(x, y);
      if (l > 0.15) { this.set(x, y, ramp[ramp.length - 1]); this.set(x + 1, y, ramp[ramp.length - 2]); this.set(x, y + 1, ramp[ramp.length - 3]); }
      else if (l < -0.2) { this.set(x, y, ramp[1]); this.set(x + 1, y + 1, ramp[0]); }
      else { this.set(x, y, ramp[Math.floor(ramp.length / 2) + 1]); this.set(x - 1, y + 1, ramp[Math.floor(ramp.length / 2)]); }
    }
  }

  /**
   * Rounded limb from (x0,y0) radius r0 to (x1,y1) radius r1, shaded across its width
   * (lit from the left) and slightly darker towards its end.
   */
  capsule(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, ramp: RGB[], bias = 0, band?: (t: number) => RGB | null) {
    const minX = Math.floor(Math.min(x0 - r0, x1 - r1)) - 1, maxX = Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1;
    const minY = Math.floor(Math.min(y0 - r0, y1 - r1)) - 1, maxY = Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
    const nx = -dy / L, ny = dx / L; // perpendicular
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - x0) * dx + (py - y0) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const r = r0 + (r1 - r0) * t;
      const d = Math.hypot(px - cx, py - cy);
      if (d > r) continue;
      const u = ((px - cx) * nx + (py - cy) * ny) / Math.max(0.5, r); // -1..1 across
      const lightSide = nx < 0 ? -u : u; // make the left side of the limb the lit side
      let v = 0.55 + lightSide * 0.28 - (d / r) * 0.15 - t * 0.08 + bias;
      const bc = band?.(t);
      if (bc) { this.set(x, y, [bc[0] * (0.8 + lightSide * 0.2), bc[1] * (0.8 + lightSide * 0.2), bc[2] * (0.8 + lightSide * 0.2)]); continue; }
      this.set(x, y, this.shade(ramp, v, x, y));
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Selective outline: transparent pixels touching the shape get a darkened copy of their neighbour. */
  selout(k = 0.42, onlyBottomRight = false) {
    const add: [number, number, RGB][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      const nb: [number, number][] = onlyBottomRight ? [[-1, 0], [0, -1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of nb) {
        if (this.alpha(x + dx, y + dy) > 128) {
          const c = this.get(x + dx, y + dy);
          add.push([x, y, [c[0] * k * 0.8, c[1] * k * 0.85, c[2] * k]]);
          break;
        }
      }
    }
    for (const [x, y, c] of add) this.set(x, y, c);
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
