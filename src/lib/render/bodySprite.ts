// Owns the on-screen look of one planet/moon: requests its texture from the worker pool,
// re-rasterizes the lit sphere only when something visible changed, and knows its halo/rings.
import type { CelestialBody } from '../solar-system/types';
import { PlanetType } from '../planet-generator/generator';
import { requestPlanetTexture, peekPlanetTexture, PlanetTexture, SPRITE_TEX_W } from '../planet-generator/planetClient';
import { atmosphereFor, cloudProfileFor, emissiveFor, AtmosphereProfile, CloudProfile } from '../planet-generator/visualProfile';
import { renderSphere, renderPlaceholderSphere, hexToRgb } from './planetSphere';
import { ringSprite, RingSprite, RGB } from './celestialSprites';
import { spinPeriodTicks } from '../solar-system/bodyInfo';
import seedrandom from 'seedrandom';

const MAX_SPRITE = 384;

function quantizeSize(px: number) {
  const s = Math.max(8, Math.min(MAX_SPRITE, Math.ceil(px)));
  return s <= 64 ? Math.ceil(s / 4) * 4 : Math.ceil(s / 16) * 16;
}

// Halo: bright at the planet limb, fading outward. innerFrac = planet radius / halo radius.
const haloCache = new Map<string, HTMLCanvasElement>();
export function haloSprite(rgb: RGB, innerFrac: number): HTMLCanvasElement {
  const key = rgb.join(',') + '|' + innerFrac.toFixed(2);
  let c = haloCache.get(key);
  if (c) return c;
  const S = 128;
  c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
    let a = 0;
    if (d < innerFrac) a = Math.pow(d / innerFrac, 6);
    else if (d < 1) a = Math.pow(1 - (d - innerFrac) / (1 - innerFrac), 2.2);
    const p = (y * S + x) * 4;
    img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  haloCache.set(key, c);
  return c;
}

export class BodySprite {
  readonly body: CelestialBody;
  readonly rgb: RGB;
  readonly atmo: AtmosphereProfile | null;
  readonly cloud: CloudProfile | null;
  readonly emissive: number;
  readonly spinPeriod: number;
  readonly ring: RingSprite | null;
  readonly ringTilt: number;
  tex: PlanetTexture | null = null;
  private requested = false;
  private canvas: HTMLCanvasElement | null = null;
  private img: ImageData | null = null;
  private last = { size: 0, rot: -1, lx: 9, ly: 9, hasTex: false };
  onTexture?: () => void;

  constructor(body: CelestialBody) {
    this.body = body;
    this.rgb = hexToRgb(body.baseColor);
    const pc = body.planetConfig;
    this.atmo = pc ? atmosphereFor(pc) : null;
    this.cloud = pc ? cloudProfileFor(pc) : null;
    this.emissive = pc ? emissiveFor(pc) : 0;
    this.spinPeriod = spinPeriodTicks(body);
    const rng = seedrandom(body.id + (pc?.seed ?? ''));
    const isGas = pc?.planetType === PlanetType.GAS_GIANT;
    this.ring = body.hasRings ? ringSprite(pc?.seed ?? body.id, this.rgb, !isGas || rng() < 0.4) : null;
    this.ringTilt = (rng() - 0.5) * 0.9;
    if (pc) this.tex = peekPlanetTexture(pc) ?? null;
  }

  requestTexture(priority: number) {
    const pc = this.body.planetConfig;
    if (!pc || this.tex || this.requested) return;
    this.requested = true;
    requestPlanetTexture(pc, priority)
      .then(t => { this.tex = t; this.onTexture?.(); })
      .catch(() => { this.requested = false; });
  }

  /**
   * Returns an up-to-date sprite canvas for the given on-screen diameter (device px).
   * `spinTicks` drives rotation; `light` is the unit vector towards the star in sprite space.
   */
  sprite(diameterPx: number, spinTicks: number, light: [number, number, number]): HTMLCanvasElement {
    const size = quantizeSize(diameterPx);
    const rot = this.spinPeriod > 1e8 ? 0 : (spinTicks / this.spinPeriod) % 1;
    const L = this.last;
    const hasTex = !!this.tex;
    const texel = 1 / SPRITE_TEX_W;
    const needs =
      !this.canvas || size !== L.size || hasTex !== L.hasTex ||
      Math.abs(rot - L.rot) > texel * 0.5 ||
      Math.abs(light[0] - L.lx) > 0.01 || Math.abs(light[1] - L.ly) > 0.01;
    if (!needs) return this.canvas!;

    if (!this.canvas || this.canvas.width !== size) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = size; this.canvas.height = size;
      this.img = new ImageData(size, size);
    }
    if (this.tex) {
      renderSphere(this.img!, this.tex, {
        rotation: rot,
        cloudRotation: rot * 1.12 + 0.37,
        light,
        ambient: this.body.type === 'moon' ? 0.03 : 0.05,
        emissive: this.emissive,
        cloudColor: this.cloud?.color ?? [255, 255, 255],
        cloudOpacity: this.cloud?.opacity ?? 0,
        rimColor: this.atmo?.color ?? null,
        rimStrength: this.atmo ? this.atmo.intensity * 0.9 : 0,
      });
    } else {
      renderPlaceholderSphere(this.img!, this.rgb, light);
    }
    this.canvas.getContext('2d')!.putImageData(this.img!, 0, 0);
    this.last = { size, rot, lx: light[0], ly: light[1], hasTex };
    return this.canvas;
  }

  /** Draws halo + (back rings) + sphere + (front rings) centred at (x,y) with radius r (device px). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spinTicks: number, light: [number, number, number], alpha = 1, pixelRatio = 1) {
    const ring = this.ring;
    if (ring) this.drawRingHalf(ctx, x, y, r, true, light);

    if (this.atmo && r > 2) {
      const outer = r * (1 + this.atmo.thickness * 2.2);
      const halo = haloSprite(this.atmo.color, r / outer);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * this.atmo.intensity * 0.55;
      // shift the halo slightly towards the star so the lit limb glows more
      ctx.drawImage(halo, x - outer + light[0] * r * 0.08, y - outer + light[1] * r * 0.08, outer * 2, outer * 2);
      ctx.restore();
    }

    const spr = this.sprite(r * 2 * pixelRatio, spinTicks, light);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = r * 2 * pixelRatio < spr.width; // crisp pixels when magnified, smooth when minified
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.restore();

    if (ring) this.drawRingHalf(ctx, x, y, r, false, light);
  }

  private drawRingHalf(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, back: boolean, light: [number, number, number]) {
    const ring = this.ring!;
    const R = r * ring.outer;
    const flat = 0.28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ringTilt);
    ctx.beginPath();
    // back half = upper half of the (flattened) ring in ring space
    if (back) ctx.rect(-R - 2, -R - 2, R * 2 + 4, R + 2);
    else ctx.rect(-R - 2, 0, R * 2 + 4, R + 2);
    ctx.clip();
    ctx.scale(1, flat);
    // lit side of the ring a bit brighter
    ctx.globalAlpha = 0.75 + 0.25 * Math.max(0, -light[1]);
    ctx.drawImage(ring.canvas, -R, -R, R * 2, R * 2);
    ctx.restore();
  }
}
