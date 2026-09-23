import React, { useEffect, useRef } from 'react';
import { renderGlobe, GlobeTexture } from '../lib/render/planetSphere';
import { SpaceBackdrop } from '../lib/render/spaceBackdrop';

interface GlobeViewProps {
  texture: GlobeTexture | null;
  clouds: GlobeTexture | null;
  cloudsOn: boolean;
  rim: [number, number, number] | null;
  seed: string;
}

/** Interactive rotating 3D globe: drag to spin/tilt, wheel/pinch to zoom, auto-rotates when idle. */
export function GlobeView({ texture, clouds, cloudsOn, rim, seed }: GlobeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({ rot: 0, tilt: 0.25, vel: 0.02, zoom: 1, dragging: false, lx: 0, ly: 0, idle: 0 });
  const props = useRef({ texture, clouds, cloudsOn, rim });
  props.current = { texture, clouds, cloudsOn, rim };

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    const backdrop = new SpaceBackdrop({ seed: seed + '_globe', nebula: 0.5, density: 0.8 });
    const sphere = document.createElement('canvas');
    let img: ImageData | null = null;
    let raf = 0, last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      const S = st.current;
      if (!S.dragging) {
        S.idle += dt;
        S.vel += ((S.idle > 1.5 ? 0.012 : 0) - S.vel) * Math.min(1, dt * 1.5);
        S.rot += S.vel * dt * 2;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop.draw(ctx, w, h, S.rot * 400, S.tilt * 200, (now - t0) / 1000);
      const P = props.current;
      if (P.texture) {
        const r = Math.min(w, h) * 0.42 * S.zoom;
        const size = Math.max(64, Math.min(720, Math.round(r * 2 * dpr / 4) * 4));
        if (!img || img.width !== size) { img = new ImageData(size, size); sphere.width = size; sphere.height = size; }
        renderGlobe(img, P.texture, P.cloudsOn ? P.clouds : null, S.rot, S.tilt, S.rot * 1.1 + (now - t0) / 90000,
          [-0.55, -0.3, 0.78], P.rim, 0.85);
        sphere.getContext('2d')!.putImageData(img, 0, 0);
        const cx = w / 2, cy = h / 2;
        if (P.rim) {
          const g = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.18);
          g.addColorStop(0, `rgba(${P.rim[0]},${P.rim[1]},${P.rim[2]},0.45)`);
          g.addColorStop(1, `rgba(${P.rim[0]},${P.rim[1]},${P.rim[2]},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2); ctx.fill();
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sphere, cx - r, cy - r, r * 2, r * 2);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      st.current.zoom = Math.max(0.5, Math.min(2.4, st.current.zoom * Math.exp(-e.deltaY * 0.0012)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('wheel', onWheel); };
  }, [seed]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={e => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const S = st.current;
          S.dragging = true; S.lx = e.clientX; S.ly = e.clientY; S.idle = 0;
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
          }
        }}
        onPointerMove={e => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const S = st.current;
          if (pointers.current.size === 2 && pinch.current > 0) {
            const [a, b] = [...pointers.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            S.zoom = Math.max(0.5, Math.min(2.4, S.zoom * d / pinch.current));
            pinch.current = d;
            return;
          }
          const size = Math.min(wrapRef.current!.clientWidth, wrapRef.current!.clientHeight) * S.zoom;
          const dx = e.clientX - S.lx, dy = e.clientY - S.ly;
          S.rot -= dx / (size * 2.6);
          S.vel = -dx / (size * 2.6) / 0.016 / 2;
          S.tilt = Math.max(-1.3, Math.min(1.3, S.tilt + dy / size * 1.6));
          S.lx = e.clientX; S.ly = e.clientY;
        }}
        onPointerUp={e => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size === 0) { st.current.dragging = false; st.current.idle = 0; pinch.current = 0; }
        }}
        onPointerCancel={e => { pointers.current.delete(e.pointerId); st.current.dragging = false; }}
      />
      {!texture && (
        <div className="absolute inset-0 flex items-center justify-center text-emerald-300/70 text-sm animate-pulse">Preparando globo…</div>
      )}
    </div>
  );
}
