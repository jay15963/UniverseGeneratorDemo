import React, { useEffect, useRef } from 'react';
import seedrandom from 'seedrandom';
import { PlanetConfig, PlanetType } from '../lib/planet-generator/generator';
import { requestPlanetTexture, PlanetTexture } from '../lib/planet-generator/planetClient';
import { atmosphereFor, cloudProfileFor, emissiveFor } from '../lib/planet-generator/visualProfile';
import { renderSphere } from '../lib/render/planetSphere';
import { SpaceBackdrop } from '../lib/render/spaceBackdrop';
import { glowSprite, ringSprite, starRaysSprite } from '../lib/render/celestialSprites';
import { haloSprite } from '../lib/render/bodySprite';

// Curated showcase worlds for the title screen; one is picked per visit.
const SHOWCASE: Partial<PlanetConfig>[] = [
  { planetType: PlanetType.GAS_GIANT, colorPalette: 'alien-purple', bandContrast: 0.8, stormFrequency: 0.6 },
  { planetType: PlanetType.EARTH_LIKE, seaLevel: 0.55, numPlates: 40 },
  { planetType: PlanetType.GAS_GIANT, colorPalette: 'jovian', bandContrast: 0.7, stormFrequency: 0.5 },
  { planetType: PlanetType.ALIEN_LIFE, vegetationHue: 'purple', waterHue: 'cyan', seaLevel: 0.52 },
  { planetType: PlanetType.LAVA_WORLD, volcanicActivity: 0.9, crustAge: 0.2 },
  { planetType: PlanetType.GAS_GIANT, colorPalette: 'uranian', bandContrast: 0.4, stormFrequency: 0.3 },
  { planetType: PlanetType.FROZEN_OCEAN, lineaeDensity: 0.8 },
];

function showcaseConfig(seed: string): { config: PlanetConfig; rings: boolean } {
  const rng = seedrandom(seed);
  const pick = SHOWCASE[Math.floor(rng() * SHOWCASE.length)];
  const config: PlanetConfig = {
    seed, width: 512, height: 256, numPlates: 36, seaLevel: 0.55, baseTemperature: 0.5, baseMoisture: 0.6,
    planetSize: 2, planetType: PlanetType.EARTH_LIKE, craterDensity: 0.4, surfaceHue: 'gray', dustStormIntensity: 0.3,
    cloudDensity: 0.55, volcanicActivity: 0.3, iceFractureDensity: 0.5, bandContrast: 0.6, stormFrequency: 0.4,
    colorPalette: 'jovian', vegetationHue: 'green', waterHue: 'blue', crustAge: 0.5, islandDensity: 0.2, lineaeDensity: 0.5,
    iceThickness: 0.5, starIntensity: 0.6, twilightWidth: 0.2, crystalDensity: 0.5, hydrocarbonLakes: 0.5,
    bioluminescence: 0.5, waterLevel: 0.5, ashDepth: 0.5, emberActivity: 0.5,
    ...pick,
  } as PlanetConfig;
  return { config, rings: config.planetType === PlanetType.GAS_GIANT || rng() < 0.25 };
}

export function MenuScene({ seed }: { seed: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { config, rings } = showcaseConfig(seed);
    const atmo = atmosphereFor(config);
    const cloud = cloudProfileFor(config);
    const emissive = emissiveFor(config);
    const ring = rings ? ringSprite(seed, atmo?.color ?? [200, 180, 220], false) : null;
    const backdrop = new SpaceBackdrop({ seed: seed + '_menu', nebula: 1, density: 1.2 });
    const starRgb: [number, number, number] = [255, 214, 160];
    const rays = starRaysSprite(starRgb, seed);

    let tex: PlanetTexture | null = null;
    let fadeIn = 0;
    requestPlanetTexture(config, 1000, 512).then(t => { tex = t; }).catch(() => {});

    const sphere = document.createElement('canvas');
    let img: ImageData | null = null;
    let lastRot = -1;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / window.innerWidth - 0.5; mouse.ty = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('pointermove', onMove);

    const meteors: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    let raf = 0, last = performance.now();
    const t0 = last;

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      const t = Math.max(0, (now - t0) / 1000);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2);
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop.draw(ctx, w, h, t * 14 + mouse.x * 120, t * 3 + mouse.y * 80, t);

      const portrait = h > w;
      // Star (off to the upper right)
      const sx = w * (portrait ? 0.85 : 0.93) - mouse.x * 30, sy = h * (portrait ? 0.12 : 0.28) - mouse.y * 20;
      const sr = Math.min(w, h) * 0.035;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glowSprite(starRgb, 1.4), sx - sr * 16, sy - sr * 16, sr * 32, sr * 32);
      ctx.drawImage(glowSprite([255, 250, 235], 3), sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
      ctx.translate(sx, sy);
      ctx.rotate(t * 0.02);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(rays, -sr * 14, -sr * 14, sr * 28, sr * 28);
      ctx.restore();

      // Planet
      const pr = Math.min(w, h) * (portrait ? 0.42 : 0.38);
      const px = (portrait ? w * 0.55 : w * 0.66) - mouse.x * 60;
      const py = (portrait ? h * 0.66 : h * 0.55) - mouse.y * 40;
      let lx = sx - px, ly = sy - py;
      const ll = Math.hypot(lx, ly) || 1;
      const light: [number, number, number] = [lx / ll * 0.85, ly / ll * 0.85, 0.52];
      const ringTilt = -0.35;

      const drawRing = (back: boolean) => {
        if (!ring) return;
        const R = pr * Math.min(ring.outer, 2.25);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ringTilt);
        ctx.beginPath();
        if (back) ctx.rect(-R - 2, -R - 2, R * 2 + 4, R + 2); else ctx.rect(-R - 2, 0, R * 2 + 4, R + 2);
        ctx.clip();
        ctx.scale(1, 0.22);
        ctx.globalAlpha = 0.9 * fadeIn;
        ctx.drawImage(ring.canvas, -R, -R, R * 2, R * 2);
        ctx.restore();
      };

      if (tex) {
        fadeIn = Math.min(1, fadeIn + dt * 0.8);
        drawRing(true);
        if (atmo) {
          const outer = pr * (1 + atmo.thickness * 2);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = atmo.intensity * 0.6 * fadeIn;
          ctx.drawImage(haloSprite(atmo.color, pr / outer), px - outer + light[0] * pr * 0.06, py - outer + light[1] * pr * 0.06, outer * 2, outer * 2);
          ctx.restore();
        }
        const size = Math.max(64, Math.min(760, Math.round(pr * 2 * dpr / 8) * 8));
        const rot = (t / 160) % 1;
        if (!img || img.width !== size || Math.abs(rot - lastRot) > 1 / tex.width) {
          if (!img || img.width !== size) { img = new ImageData(size, size); sphere.width = size; sphere.height = size; }
          renderSphere(img, tex, {
            rotation: rot, cloudRotation: rot * 1.15 + 0.2, light, ambient: 0.025, emissive,
            cloudColor: cloud?.color ?? [255, 255, 255], cloudOpacity: cloud?.opacity ?? 0,
            rimColor: atmo?.color ?? null, rimStrength: atmo ? atmo.intensity : 0,
          });
          sphere.getContext('2d')!.putImageData(img, 0, 0);
          lastRot = rot;
        }
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sphere, px - pr, py - pr, pr * 2, pr * 2);
        ctx.restore();
        drawRing(false);
      }

      // Shooting stars
      if (Math.random() < dt * 0.35) {
        meteors.push({ x: Math.random() * w, y: Math.random() * h * 0.5, vx: -(300 + Math.random() * 400), vy: 150 + Math.random() * 200, life: 1 });
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 1.2;
        if (m.life <= 0) { meteors.splice(i, 1); continue; }
        const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 0.15, m.y - m.vy * 0.15);
        g.addColorStop(0, `rgba(255,255,255,${m.life * 0.9})`);
        g.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 0.15, m.y - m.vy * 0.15); ctx.stroke();
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, [seed]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
