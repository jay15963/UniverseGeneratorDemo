// Pixel-art diorama behind a structure: sky banded by era and time of day, the home world's ground.
import type { RGB } from '../creature/raster';
import { hsl } from '../creature/raster';
import { mulberry } from '../terrain/noise';
import type { Culture } from './genome';

const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function bands(ctx: CanvasRenderingContext2D, W: number, y0: number, y1: number, top: RGB, bot: RGB, steps: number) {
  const h = (y1 - y0) / steps;
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = css(mix(top, bot, i / (steps - 1)));
    ctx.fillRect(0, Math.floor(y0 + i * h), W, Math.ceil(h) + 1);
    if (i > 0) { ctx.fillStyle = css(mix(top, bot, (i - 1) / (steps - 1))); const y = Math.floor(y0 + i * h); for (let x = i & 1; x < W; x += 2) ctx.fillRect(x, y, 1, 1); }
  }
}

export function drawStructBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, c: Culture, ground: RGB, night: boolean, t: number) {
  ctx.imageSmoothingEnabled = false;
  const alien = c.mode === 'alien', p = c.params;
  const skyH = alien ? c.hues[1] : 0.58 - (p.star - 0.5) * 0.08;
  const top: RGB = night ? hsl(0.66, 0.45, 0.07) : hsl(skyH, alien ? 0.45 : 0.5, 0.52);
  const hor: RGB = night ? hsl(0.7, 0.35, 0.18) : hsl(alien ? c.hues[2] : 0.1 + p.star * 0.05, alien ? 0.4 : 0.45, 0.78);
  bands(ctx, W, 0, gy, top, hor, 9);
  const r = mulberry(7);
  if (night) for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * gy * 0.9, tw = Math.sin(t * 2 + i) > 0.6; ctx.fillStyle = `rgba(255,255,240,${tw ? 0.9 : 0.5})`; ctx.fillRect(x | 0, y | 0, 1, 1); }
  else for (let i = 0; i < 4; i++) { // slow clouds
    const x = ((r() * W + t * (3 + i)) % (W + 80)) - 40, y = 10 + r() * gy * 0.45, w = 30 + r() * 40;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x | 0, y | 0, w | 0, 4); ctx.fillRect((x + 6) | 0, (y - 3) | 0, (w * 0.6) | 0, 3);
  }
  // distant hills in the ground's colour
  const hill = mix(ground, hor, 0.45);
  ctx.fillStyle = css(night ? mix(hill, [10, 12, 30], 0.7) : hill);
  for (let x = 0; x < W; x += 2) { const h = 6 + Math.sin(x * 0.03 + c.r[2] * 9) * 4 + Math.sin(x * 0.011 + c.r[3] * 5) * 6; ctx.fillRect(x, gy - h, 2, h + 1); }
  const g0: RGB = night ? mix(ground, [8, 10, 26], 0.65) : ground;
  bands(ctx, W, gy, H, g0, mix(g0, [0, 0, 0], 0.35), 6);
  for (let i = 0; i < 160; i++) { const x = r() * W, y = gy + r() * (H - gy); ctx.fillStyle = css(mix(g0, [0, 0, 0], 0.2 + r() * 0.2)); ctx.fillRect(x | 0, y | 0, 1, 1); }
}
