// Painting the discovery fog: the unknown is an ink-dark veil with a faint cloudy texture; its edge is organic (value
// noise in world space, so it never swims when the camera pans) and dithered with a 4x4 Bayer matrix on a
// world-anchored grid of big pixels - the same pixel-art feel as the rest of the game.
import type { Discovery } from './discovery';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

// the veil's colours: deep ink, a lighter rim where the known world begins
const INK = [7, 10, 18], RIM = [26, 34, 52];

interface Cache { key: string; c: HTMLCanvasElement; gx0: number; gy0: number }
const caches = new WeakMap<Discovery, Cache>();

/**
 * Covers the unknown on a screen canvas. `S` = device px per world px, (tx0, ty0) = screen position of world (0, 0),
 * `cellW` = world px per mask cell, `worldH` = world height in world px.
 */
export function drawFog(ctx: CanvasRenderingContext2D, fog: Discovery, DW: number, DH: number, S: number, tx0: number, ty0: number, cellW: number, dpr: number) {
  const P = Math.max(2, Math.round(3 * dpr));          // one fog pixel, in device px
  const q = P / S;                                     // ... in world px
  const gx0 = Math.floor(-tx0 / P) - 1, gy0 = Math.floor(-ty0 / P) - 1;
  const fw = Math.ceil(DW / P) + 3, fh = Math.ceil(DH / P) + 3;
  // quick outs: the whole view known / unknown
  const cx0 = (gx0 * q) / cellW, cx1 = ((gx0 + fw) * q) / cellW, cy0 = (gy0 * q) / cellW, cy1 = ((gy0 + fh) * q) / cellW;
  if ((cx1 - cx0 + 3) * (cy1 - cy0 + 3) < 40000) {
    let any0 = false, any1 = false;
    for (let y = Math.floor(cy0) - 1; y <= Math.ceil(cy1) + 1 && !(any0 && any1); y++) {
      const yy = Math.max(0, Math.min(fog.h - 1, y));
      for (let x = Math.floor(cx0) - 1; x <= Math.ceil(cx1) + 1; x++) {
        if (fog.mask[yy * fog.w + (((x % fog.w) + fog.w) % fog.w)]) any1 = true; else any0 = true;
        if (any0 && any1) break;
      }
    }
    if (!any0) return;
  }
  const key = `${fog.version}|${gx0}|${gy0}|${fw}|${fh}|${S}`;
  let cache = caches.get(fog);
  if (!cache || cache.key !== key) {
    const c = cache?.c ?? document.createElement('canvas');
    if (c.width !== fw || c.height !== fh) { c.width = fw; c.height = fh; }
    const x = c.getContext('2d')!;
    const img = x.createImageData(fw, fh), d = img.data;
    const ns = cellW * 0.42, ns2 = cellW * 0.13;    // edge noise scales (world px)
    const ns3 = Math.max(cellW * 5, q * 70);        // slow cloudy texture of the unknown
    for (let j = 0; j < fh; j++) {
      const wy = (gy0 + j + 0.5) * q, my = wy / cellW;
      for (let i = 0; i < fw; i++) {
        const wx = (gx0 + i + 0.5) * q, mx = wx / cellW;
        const u = fog.unknownAt(mx, my);
        if (u <= 0) continue;
        let a: number, n = 0.5;
        if (u >= 1) a = 1;
        else {
          n = vnoise(wx / ns, wy / ns) * 0.65 + vnoise(wx / ns2, wy / ns2) * 0.35;
          a = Math.max(0, Math.min(1, (u + (n - 0.5) * 0.7 - 0.5) * 4 + 0.5));
        }
        const gi = gx0 + i, gj = gy0 + j;
        const th = BAYER[((gj & 3) << 2) | (gi & 3)];
        const k = (j * fw + i) * 4;
        if (a < 1 && a < th) continue;
        // a lighter rim right at the edge of the known world, ink further in
        const rim = a < 1 ? Math.max(0, 1 - Math.abs(a - 0.55) * 2.2) : 0;
        const tex = (vnoise(wx / ns3, wy / ns3) - 0.5) * 9 + (u >= 1 ? 0 : (n - 0.5) * 6);
        d[k] = INK[0] + (RIM[0] - INK[0]) * rim + tex;
        d[k + 1] = INK[1] + (RIM[1] - INK[1]) * rim + tex;
        d[k + 2] = INK[2] + (RIM[2] - INK[2]) * rim + tex * 1.4;
        d[k + 3] = a >= 0.999 ? 255 : 150 + a * 105;
      }
    }
    x.putImageData(img, 0, 0);
    cache = { key, c, gx0, gy0 };
    caches.set(fog, cache);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cache.c, cache.gx0 * P + tx0, cache.gy0 * P + ty0, fw * P, fh * P);
  ctx.restore();
}

/** the fog over a whole planet map (mask resolution, RGBA): ink over the unknown with a soft noisy edge */
export function fogMapImage(fog: Discovery): ImageData {
  const { w, h, mask } = fog;
  const img = new ImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i]) continue;
    // cells next to the known world are a little lighter and not fully opaque
    let edge = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) if (mask[yy * w + ((x + dx + w) % w)]) edge++;
    }
    // a faint cloudy texture and the graticule of an uncharted globe, so the unknown reads as a map, not a void
    const grid = x % (w / 12) === 0 || y % (h / 6) === 0 ? 5 : 0;
    const k = i * 4, t = (hash(x, y) - 0.5) * 4 + (vnoise(x / 48, y / 48) - 0.5) * 12 + (vnoise(x / 13, y / 13) - 0.5) * 5 + grid, rim = Math.min(1, edge / 3);
    d[k] = INK[0] + (RIM[0] - INK[0]) * rim + t; d[k + 1] = INK[1] + (RIM[1] - INK[1]) * rim + t; d[k + 2] = INK[2] + (RIM[2] - INK[2]) * rim + t * 1.4;
    d[k + 3] = edge ? 200 : 255;
  }
  return img;
}

/** darkens an RGBA planet texture where the fog hides it (the 3D globe) */
export function fogTexture(data: Uint8ClampedArray, tw: number, th: number, fog: Discovery): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < th; y++) {
    const my = ((y + 0.5) / th) * fog.h;
    for (let x = 0; x < tw; x++) {
      const u = fog.unknownAt(((x + 0.5) / tw) * fog.w, my);
      if (u <= 0) continue;
      const k = (y * tw + x) * 4, a = Math.min(1, u * 1.3);
      out[k] = out[k] * (1 - a) + INK[0] * a; out[k + 1] = out[k + 1] * (1 - a) + INK[1] * a; out[k + 2] = out[k + 2] * (1 - a) + INK[2] * a;
    }
  }
  return out;
}
