// Software sphere rasterizer: projects an equirectangular planet texture onto a lit, rotating
// disc. Nearest-neighbour sampling on purpose — it keeps the crisp pixel-art look while the
// per-pixel normal lighting gives the volume.
import type { PlanetTexture } from '../planet-generator/planetClient';

interface SphereLUT {
  size: number;
  count: number;
  pix: Int32Array;     // pixel index in the output image
  lon: Float32Array;   // longitude of the visible point, 0..1 (front meridian = 0.5)
  lat: Float32Array;   // latitude as texture row fraction 0..1
  nx: Float32Array; ny: Float32Array; nz: Float32Array;
  alpha: Uint8Array;   // anti-aliased rim coverage
}

const lutCache = new Map<number, SphereLUT>();

function getLUT(size: number): SphereLUT {
  let lut = lutCache.get(size);
  if (lut) return lut;
  const r = size / 2;
  const cap = size * size;
  const pix = new Int32Array(cap), lon = new Float32Array(cap), lat = new Float32Array(cap);
  const nx = new Float32Array(cap), ny = new Float32Array(cap), nz = new Float32Array(cap);
  const alpha = new Uint8Array(cap);
  let n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - r) / r;
      const dy = (y + 0.5 - r) / r;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      const edge = (1 - d) * r; // distance to rim in pixels
      if (edge < -0.5) continue;
      const cd = Math.min(d, 0.9999);
      const sx = d > 0.9999 ? dx / d * cd : dx;
      const sy = d > 0.9999 ? dy / d * cd : dy;
      const sz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
      pix[n] = y * size + x;
      nx[n] = sx; ny[n] = sy; nz[n] = sz;
      lon[n] = 0.5 + Math.atan2(sx, sz) / (Math.PI * 2);
      lat[n] = 0.5 + Math.asin(Math.max(-1, Math.min(1, sy))) / Math.PI;
      alpha[n] = Math.round(Math.max(0, Math.min(1, edge + 0.5)) * 255);
      n++;
    }
  }
  lut = { size, count: n, pix, lon, lat, nx, ny, nz, alpha };
  if (lutCache.size > 24) lutCache.delete(lutCache.keys().next().value!);
  lutCache.set(size, lut);
  return lut;
}

export interface SphereShading {
  rotation: number;       // surface longitude offset, 0..1
  cloudRotation: number;  // cloud layer offset, 0..1 (clouds drift relative to ground)
  light: [number, number, number]; // unit vector towards the star, in sprite space (x right, y down, z to viewer)
  ambient: number;        // night side brightness 0..1
  emissive: number;       // magma glow strength on the night side
  cloudColor: [number, number, number];
  cloudOpacity: number;
  rimColor: [number, number, number] | null; // atmospheric scattering tint near the limb
  rimStrength: number;
}

/** Renders the sphere into `out` (a size×size ImageData). Returns `out` for chaining. */
export function renderSphere(out: ImageData, tex: PlanetTexture, s: SphereShading): ImageData {
  const size = out.width;
  const lut = getLUT(size);
  const data = out.data;
  data.fill(0);
  const tw = tex.width, th = tex.height, td = tex.data, clouds = tex.clouds;
  const [lx, ly, lz] = s.light;
  const amb = s.ambient;
  const [cr, cg, cb] = s.cloudColor;
  const co = s.cloudOpacity;
  const rim = s.rimColor;
  const rimS = s.rimStrength;
  const emis = s.emissive;
  const rot = s.rotation, crot = s.cloudRotation;

  for (let i = 0; i < lut.count; i++) {
    const nx = lut.nx[i], ny = lut.ny[i], nz = lut.nz[i];
    let u = lut.lon[i] + rot; u -= Math.floor(u);
    const ty = Math.min(th - 1, (lut.lat[i] * th) | 0);
    const tx = Math.min(tw - 1, (u * tw) | 0);
    const ti = (ty * tw + tx) * 4;
    let r = td[ti], g = td[ti + 1], b = td[ti + 2];

    // Lambert with a soft terminator
    const ndl = nx * lx + ny * ly + nz * lz;
    let lit = ndl * 1.15 + 0.08;
    lit = lit < 0 ? 0 : lit > 1 ? 1 : lit;
    lit = lit * lit * (3 - 2 * lit); // smoothstep
    const shade = amb + (1 - amb) * lit;

    // Clouds
    if (clouds && co > 0) {
      let cu = lut.lon[i] + crot; cu -= Math.floor(cu);
      const ca = clouds[ty * tw + Math.min(tw - 1, (cu * tw) | 0)] / 255 * co;
      if (ca > 0) {
        r = r + (cr - r) * ca; g = g + (cg - g) * ca; b = b + (cb - b) * ca;
      }
    }

    // Night-side magma glow: bright, red-dominant texels keep emitting light
    let er = 0, eg = 0, eb = 0;
    if (emis > 0) {
      const hot = (r - (g + b) * 0.45) / 255;
      if (hot > 0.15) {
        const k = (hot - 0.15) * emis * (1 - lit) * 1.6;
        er = r * k; eg = g * k * 0.6; eb = b * k * 0.3;
      }
    }

    // Limb darkening
    const limb = 0.55 + 0.45 * nz;
    r = r * shade * limb + er; g = g * shade * limb + eg; b = b * shade * limb + eb;

    // Atmospheric rim scattering on the day side
    if (rim) {
      const f = (1 - nz); const fr = f * f * f * rimS * (0.25 + lit * 0.75);
      r += rim[0] * fr; g += rim[1] * fr; b += rim[2] * fr;
    }

    const p = lut.pix[i] * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = lut.alpha[i];
  }
  return out;
}

/** Cheap placeholder sphere while the real texture is still generating. */
export function renderPlaceholderSphere(out: ImageData, color: [number, number, number], light: [number, number, number]): ImageData {
  const size = out.width;
  const lut = getLUT(size);
  const data = out.data;
  data.fill(0);
  const [lx, ly, lz] = light;
  for (let i = 0; i < lut.count; i++) {
    const ndl = lut.nx[i] * lx + lut.ny[i] * ly + lut.nz[i] * lz;
    let lit = Math.max(0, Math.min(1, ndl * 1.15 + 0.08));
    lit = lit * lit * (3 - 2 * lit);
    const k = (0.06 + 0.94 * lit) * (0.55 + 0.45 * lut.nz[i]);
    const p = lut.pix[i] * 4;
    data[p] = color[0] * k; data[p + 1] = color[1] * k; data[p + 2] = color[2] * k; data[p + 3] = lut.alpha[i];
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return [180, 180, 180];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface GlobeTexture { width: number; height: number; data: Uint8ClampedArray }

/**
 * Full 3D globe: like renderSphere but supports tilting the view towards the poles (drag in the
 * globe viewer). Costs a few trig ops per pixel, fine for a single large globe.
 */
export function renderGlobe(
  out: ImageData, tex: GlobeTexture, clouds: GlobeTexture | null,
  rotation: number, tilt: number, cloudRotation: number,
  light: [number, number, number], rim: [number, number, number] | null, cloudOpacity: number,
): ImageData {
  const size = out.width;
  const lut = getLUT(size);
  const data = out.data;
  data.fill(0);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const tw = tex.width, th = tex.height, td = tex.data;
  const [lx, ly, lz] = light;
  const TWO_PI = Math.PI * 2;
  for (let i = 0; i < lut.count; i++) {
    const nx = lut.nx[i], ny = lut.ny[i], nz = lut.nz[i];
    const y2 = ny * ct - nz * st;
    const z2 = ny * st + nz * ct;
    const latF = 0.5 + Math.asin(y2 < -1 ? -1 : y2 > 1 ? 1 : y2) / Math.PI;
    const lon0 = 0.5 + Math.atan2(nx, z2) / TWO_PI;
    let u = lon0 + rotation; u -= Math.floor(u);
    const ty = Math.min(th - 1, (latF * th) | 0);
    const ti = (ty * tw + Math.min(tw - 1, (u * tw) | 0)) * 4;
    let r = td[ti], g = td[ti + 1], b = td[ti + 2];
    if (clouds && cloudOpacity > 0) {
      let cu = lon0 + cloudRotation; cu -= Math.floor(cu);
      const cy = Math.min(clouds.height - 1, (latF * clouds.height) | 0);
      const ca = clouds.data[cy * clouds.width + Math.min(clouds.width - 1, (cu * clouds.width) | 0)] / 255 * cloudOpacity;
      r += (255 - r) * ca; g += (255 - g) * ca; b += (255 - b) * ca;
    }
    let lit = (nx * lx + ny * ly + nz * lz) * 1.15 + 0.08;
    lit = lit < 0 ? 0 : lit > 1 ? 1 : lit;
    lit = lit * lit * (3 - 2 * lit);
    const k = (0.12 + 0.88 * lit) * (0.6 + 0.4 * nz);
    r *= k; g *= k; b *= k;
    if (rim) { const f = 1 - nz; const fr = f * f * f * 0.9 * (0.3 + lit * 0.7); r += rim[0] * fr; g += rim[1] * fr; b += rim[2] * fr; }
    const p = lut.pix[i] * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = lut.alpha[i];
  }
  return out;
}
