// Procedural clouds over the gameplay map: a world-space field where every cloud has its own shape.
//
// The sky is cut into cells; a cell holds a cloud or not (weather decides the coverage) and its hash picks the cloud's
// size, stretch, puffiness and shading, so no two clouds repeat. Each shape is baked once as pixel art (hard edges,
// three lit tones with ordered dithering) together with a matching ground shadow. The field drifts with the wind; the
// clouds float at an altitude above their shadows. Zoomed further out, a coarser layer of bigger clouds takes over so
// the number of sprites on screen stays small.
import { fbm2, hash3, mulberry, bayer } from '../../lib/terrain/noise';

interface Shape { cloud: HTMLCanvasElement; dark: HTMLCanvasElement; shadow: HTMLCanvasElement; w: number; h: number }
/** world px per baked pixel */
const PX = 4;

export class CloudField {
  private shapes = new Map<string, Shape>();
  constructor(private seed: number) {}

  private budget = 0;
  private bake(key: string, r: () => number, wpx: number): Shape | null {
    let s = this.shapes.get(key);
    if (s) return s;
    if (this.budget-- <= 0) return null;       // a few new shapes per frame, no hitch when the view jumps
    // footprint in baked pixels (big layers bake coarser so the canvases stay small)
    const scale = Math.max(1, wpx / 640);
    const W = Math.max(24, Math.round((wpx / PX) / scale)), H = Math.max(16, Math.round(W * (0.38 + r() * 0.3)));
    const nb = 5 + Math.floor(r() * 9);
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < nb; i++) {
      const u = (i + 0.5) / nb + (r() - 0.5) * 0.12;
      const rad = H * (0.22 + r() * 0.26) * (1 - Math.abs(u - 0.5) * 0.9);
      blobs.push([W * (0.1 + u * 0.8), H * (0.55 + (r() - 0.5) * 0.25) - rad * 0.3, rad]);
    }
    const ns = Math.floor(r() * 1e6);
    const field = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [bx, by, br] of blobs) { const d = ((x - bx) ** 2 + ((y - by) * 1.25) ** 2) / (br * br); if (d < 1) v = Math.max(v, 1 - d); }
      // ragged, puffy edge and a flat-ish base
      v += (fbm2(x / 7, y / 7, ns, 3) - 0.5) * 0.55;
      if (y > H * 0.78) v -= (y - H * 0.78) / (H * 0.22) * 0.6;
      field[y * W + x] = v;
    }
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cloud = mk(), dark = mk(), shadow = mk();
    const ci = cloud.getContext('2d')!.createImageData(W, H), di = dark.getContext('2d')!.createImageData(W, H), si = shadow.getContext('2d')!.createImageData(W, H);
    const LIGHT = [[255, 255, 255], [236, 241, 248], [206, 216, 230], [168, 180, 200]];
    const DARK = [[196, 202, 214], [160, 168, 184], [122, 130, 148], [92, 98, 116]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = field[y * W + x];
      if (v < 0.2) continue;
      const o = (y * W + x) * 4;
      // light from the upper left: compare with the field a little up-left
      const up = x >= 2 && y >= 3 ? field[(y - 3) * W + x - 2] : 0;
      const lit = (v - up) * 3 + (1 - y / H) * 0.8 + bayer(x, y) * 0.35;
      const tone = lit > 0.95 ? 0 : lit > 0.45 ? 1 : lit > 0.05 ? 2 : 3;
      const edge = v < 0.28 ? 1 : 0;
      const t2 = Math.min(3, tone + edge);
      for (const [img, pal] of [[ci, LIGHT], [di, DARK]] as [ImageData, number[][]][]) {
        img.data[o] = pal[t2][0]; img.data[o + 1] = pal[t2][1]; img.data[o + 2] = pal[t2][2]; img.data[o + 3] = 255;
      }
      si.data[o] = 10; si.data[o + 1] = 16; si.data[o + 2] = 30; si.data[o + 3] = v < 0.3 ? 150 : 255;
    }
    cloud.getContext('2d')!.putImageData(ci, 0, 0);
    dark.getContext('2d')!.putImageData(di, 0, 0);
    shadow.getContext('2d')!.putImageData(si, 0, 0);
    s = { cloud, dark, shadow, w: W, h: H };
    if (this.shapes.size > 400) this.shapes.delete(this.shapes.keys().next().value!);
    this.shapes.set(key, s);
    return s;
  }

  /**
   * Draws the field over a world-space view (ctx already carries the camera transform).
   * kind 'shadow' paints the ground shadows, 'cloud' the clouds themselves (at their altitude).
   */
  draw(ctx: CanvasRenderingContext2D, view: { x0: number; y0: number; x1: number; y1: number }, t: number, wind: number,
    coverage: number, zoom: number, kind: 'shadow' | 'cloud', alpha: number, stormy = false) {
    if (alpha <= 0.005 || coverage <= 0) return;
    this.budget = 6;
    const L = zoom >= 1 / 16 ? 0 : zoom >= 1 / 64 ? 1 : 2;
    const cell = 2600 * 4 ** L;
    const alt = cell * 0.32;
    const dx = t * (10 + wind * 14) * (1 + L * 3), dy = t * 3 * (1 + L * 3);
    // clouds are drawn raised: look further south for the ones that float into view
    const y1 = view.y1 + (kind === 'cloud' ? alt : 0), y0 = view.y0 - cell;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    for (let j = Math.floor((y0 - dy) / cell); j <= Math.floor((y1 - dy) / cell); j++)
      for (let i = Math.floor((view.x0 - cell - dx) / cell); i <= Math.floor((view.x1 - dx) / cell); i++) {
        const h = hash3(i, j, this.seed + L * 977);
        if ((h % 1000) / 1000 >= coverage) continue;
        const r = mulberry(h);
        const wpx = cell * (0.45 + r() * 0.55);
        const sh = this.bake(`${L}:${i}:${j}`, r, wpx);
        if (!sh) continue;
        const scale = wpx / sh.w;
        const x = i * cell + dx + r() * (cell - wpx * 0.6), y = j * cell + dy + r() * cell * 0.6;
        const w = sh.w * scale, hh = sh.h * scale;
        if (kind === 'shadow') {
          if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + hh < view.y0) continue;
          ctx.drawImage(sh.shadow, x, y, w, hh);
        } else {
          const cy = y - alt;
          if (x > view.x1 || x + w < view.x0 || cy > view.y1 || cy + hh < view.y0) continue;
          ctx.drawImage(stormy ? sh.dark : sh.cloud, x - alt * 0.25, cy, w, hh);
        }
      }
    ctx.restore();
  }
}
