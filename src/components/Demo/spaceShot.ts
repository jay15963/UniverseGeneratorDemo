// A planet seen from space: starfield, its star, the textured sphere (+ atmosphere and rings), shaded by the star.
import { PlanetConfig } from '../../lib/planet-generator/generator';
import { requestPlanetTexture, PlanetTexture } from '../../lib/planet-generator/planetClient';
import { atmosphereFor, cloudProfileFor, emissiveFor } from '../../lib/planet-generator/visualProfile';
import { renderSphere } from '../../lib/render/planetSphere';
import { SpaceBackdrop } from '../../lib/render/spaceBackdrop';
import { glowSprite, ringSprite, starRaysSprite, RingSprite } from '../../lib/render/celestialSprites';
import { haloSprite } from '../../lib/render/bodySprite';
import type { RGB } from './worlds';

// ---------------------------------------------------------------------------------------------------
// Space shots
// ---------------------------------------------------------------------------------------------------
export class SpaceShot {
  tex: PlanetTexture | null = null;
  private img: ImageData | null = null;
  private sphere = document.createElement('canvas');
  private lastRot = -1;
  private atmo; private cloud; private emissive;
  private ring: RingSprite | null;
  private backdrop: SpaceBackdrop;
  private rays: HTMLCanvasElement;
  private fade = 0;
  /** largest sphere render (device px); bigger is sharper and slower */
  maxSize = 640;
  /** draw the starfield behind the planet */
  backdropOn = true;

  constructor(readonly config: PlanetConfig, private star: RGB, rings: boolean, private spin = 90, texW = 512, nebula = 0.9) {
    this.atmo = atmosphereFor(config);
    this.cloud = cloudProfileFor(config);
    this.emissive = emissiveFor(config);
    this.ring = rings ? ringSprite(config.seed, this.atmo?.color ?? [210, 190, 160], false) : null;
    this.backdrop = new SpaceBackdrop({ seed: config.seed + '_demo', nebula, density: 1.1 });
    this.rays = starRaysSprite(star, config.seed);
    requestPlanetTexture(config, 1000, texW).then(t => { this.tex = t; }).catch(() => { /* stays a starfield */ });
  }

  /** px/py/pr in CSS px; sx/sy: the star. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, dt: number, px: number, py: number, pr: number, sx: number, sy: number) {
    if (this.backdropOn) this.backdrop.draw(ctx, w, h, t * 22, t * 5, t);
    const sr = Math.min(w, h) * 0.03;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowSprite(this.star, 1.4), sx - sr * 16, sy - sr * 16, sr * 32, sr * 32);
    ctx.drawImage(glowSprite([255, 250, 235], 3), sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.02);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(this.rays, -sr * 14, -sr * 14, sr * 28, sr * 28);
    ctx.restore();
    const tex = this.tex;
    if (!tex) return;
    this.fade = Math.min(1, this.fade + dt * 1.2);
    const lx = sx - px, ly = sy - py, ll = Math.hypot(lx, ly) || 1;
    const light: [number, number, number] = [lx / ll * 0.85, ly / ll * 0.85, 0.52];
    const ring = this.ring;
    const drawRing = (back: boolean) => {
      if (!ring) return;
      const R = pr * Math.min(ring.outer, 2.25);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.32);
      ctx.beginPath();
      if (back) ctx.rect(-R - 2, -R - 2, R * 2 + 4, R + 2); else ctx.rect(-R - 2, 0, R * 2 + 4, R + 2);
      ctx.clip();
      ctx.scale(1, 0.22);
      ctx.globalAlpha = 0.9 * this.fade;
      ctx.drawImage(ring.canvas, -R, -R, R * 2, R * 2);
      ctx.restore();
    };
    drawRing(true);
    if (this.atmo) {
      const outer = pr * (1 + this.atmo.thickness * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.atmo.intensity * 0.6 * this.fade;
      ctx.drawImage(haloSprite(this.atmo.color, pr / outer), px - outer + light[0] * pr * 0.06, py - outer + light[1] * pr * 0.06, outer * 2, outer * 2);
      ctx.restore();
    }
    const size = Math.max(64, Math.min(this.maxSize, Math.round(pr * 2 * dpr / 8) * 8));
    const rot = (t / this.spin) % 1;
    if (!this.img || this.img.width !== size || Math.abs(rot - this.lastRot) > 0.5 / tex.width) {
      if (!this.img || this.img.width !== size) { this.img = new ImageData(size, size); this.sphere.width = size; this.sphere.height = size; }
      renderSphere(this.img, tex, {
        rotation: rot, cloudRotation: rot * 1.15 + 0.2, light, ambient: 0.025, emissive: this.emissive,
        cloudColor: this.cloud?.color ?? [255, 255, 255], cloudOpacity: this.cloud?.opacity ?? 0,
        rimColor: this.atmo?.color ?? null, rimStrength: this.atmo ? this.atmo.intensity : 0,
      });
      this.sphere.getContext('2d')!.putImageData(this.img, 0, 0);
      this.lastRot = rot;
    }
    ctx.save();
    ctx.globalAlpha = this.fade;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.sphere, px - pr, py - pr, pr * 2, pr * 2);
    ctx.restore();
    drawRing(false);
  }
  get atmoColor(): RGB { return (this.atmo?.color as RGB) ?? [200, 220, 255]; }
}

