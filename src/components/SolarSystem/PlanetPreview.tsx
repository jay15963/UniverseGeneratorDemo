import React, { useEffect, useMemo, useRef } from 'react';
import { CelestialBody } from '../../lib/solar-system/types';
import { BodySprite } from '../../lib/render/bodySprite';
import { starSurfaceFrames, glowSprite } from '../../lib/render/celestialSprites';
import { hexToRgb } from '../../lib/render/planetSphere';

/** Small self-animating portrait of a planet, moon or star. */
export function PlanetPreview({ body, size = 96 }: { body: CelestialBody; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = useMemo(() => (body.type === 'star' ? null : new BodySprite(body)), [body]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    sprite?.requestTexture(100);
    let raf = 0;
    const t0 = performance.now();
    const light: [number, number, number] = [-0.62, -0.35, 0.7];
    const frames = body.type === 'star' ? starSurfaceFrames(hexToRgb(body.baseColor), body.id, 160) : null;
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const W = canvas.width;
      ctx.clearRect(0, 0, W, W);
      if (sprite) {
        const hasRing = !!sprite.ring;
        const r = W * (hasRing ? 0.17 : 0.34);
        sprite.draw(ctx, W / 2, W / 2, r, t * 60 * 2, light);
      } else if (frames) {
        const r = W * 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite(hexToRgb(body.baseColor), 2), W / 2 - r * 1.65, W / 2 - r * 1.65, r * 3.3, r * 3.3);
        ctx.restore();
        const f = Math.floor(t * 3) % frames.length;
        ctx.drawImage(frames[f], W / 2 - r, W / 2 - r, r * 2, r * 2);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [sprite, body, size]);

  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" />;
}
