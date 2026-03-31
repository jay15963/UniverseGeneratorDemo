import React, { useEffect, useRef } from 'react';

interface HyperspaceTransitionProps {
  direction: 'in' | 'out';
}

export function HyperspaceTransition({ direction }: HyperspaceTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    
    // Generate star streaks
    const numStreaks = 200;
    const streaks = Array.from({ length: numStreaks }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2,
      dist: Math.random() * maxRadius * 0.3,
      length: 20 + Math.random() * 80,
      brightness: 0.3 + Math.random() * 0.7,
      hue: Math.random() > 0.8 ? 200 + Math.random() * 60 : 0, // Some blue streaks
    }));

    startTimeRef.current = Date.now();
    const DURATION = direction === 'in' ? 800 : 600;

    let animId: number;
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(1, elapsed / DURATION);

      ctx.fillStyle = `rgba(0, 0, 0, ${0.3})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Easing
      const ease = direction === 'in'
        ? progress * progress * progress // accelerate in
        : 1 - Math.pow(1 - progress, 3); // decelerate out

      // Star streaks
      for (const s of streaks) {
        const currentDist = s.dist + (maxRadius * 1.5 * ease * s.speed);
        const x1 = cx + Math.cos(s.angle) * currentDist;
        const y1 = cy + Math.sin(s.angle) * currentDist;
        const streakLen = s.length * (0.5 + ease * 2);
        const x2 = cx + Math.cos(s.angle) * (currentDist - streakLen);
        const y2 = cy + Math.sin(s.angle) * (currentDist - streakLen);

        const alpha = s.brightness * (direction === 'in' ? ease : (1 - ease * 0.5));

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (s.hue > 0) {
          ctx.strokeStyle = `hsla(${s.hue}, 80%, 70%, ${alpha})`;
        } else {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        }
        ctx.lineWidth = 1 + ease * 1.5;
        ctx.stroke();
      }

      // Central Flash (for zoom-in only)
      if (direction === 'in' && progress > 0.4) {
        const flashProgress = (progress - 0.4) / 0.6;
        const flashRadius = maxRadius * flashProgress;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
        grad.addColorStop(0, `rgba(200, 180, 255, ${flashProgress * 0.6})`);
        grad.addColorStop(0.3, `rgba(100, 80, 200, ${flashProgress * 0.3})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Final flash (white)
      if (direction === 'in' && progress > 0.85) {
        const whiteProgress = (progress - 0.85) / 0.15;
        ctx.fillStyle = `rgba(255, 255, 255, ${whiteProgress * 0.8})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Fade to black for zoom-out
      if (direction === 'out') {
        ctx.fillStyle = `rgba(0, 0, 0, ${ease * 0.7})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      }
    };

    // Initial clear
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [direction]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
