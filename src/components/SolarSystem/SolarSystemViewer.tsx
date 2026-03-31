import React, { useRef, useEffect, useState } from 'react';
import { CelestialBody } from '../../lib/solar-system/types';
import { STAR_DATA, AU_TO_PX, PlanetType } from '../../lib/solar-system/generator';
import { SurfaceModal } from './SurfaceModal';

interface ViewerProps {
  bodies: CelestialBody[];
  showZones?: boolean;
  systemAge?: number;
}

export function SolarSystemViewer({ bodies, showZones, systemAge = 1 }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Viewport state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const [focusedBodyId, setFocusedBodyId] = useState<string | null>(null);
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null);
  const [localMouse, setLocalMouse] = useState({ x: 0, y: 0 });

  // Surface Generation State
  const [surfaceStates, setSurfaceStates] = useState<Record<string, 'idle' | 'generating' | 'ready'>>({});
  const [viewingSurfaceBody, setViewingSurfaceBody] = useState<CelestialBody | null>(null);

  // Reset surface states when the solar system is re-generated
  useEffect(() => {
    setSurfaceStates({});
    setViewingSurfaceBody(null);
  }, [bodies]);

  // Time for animation
  const timeRef = useRef(0);

  // Build a map of body positions for rendering and hit detection
  const bodyPositionsRef = useRef<Map<string, {x: number, y: number, r: number}>>(new Map());

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Clear - darken background based on system age
      // Normal: #050510, at age 100%: #000000 (pure black)
      const ageDarkening = systemAge >= 0.7 ? Math.min(1, (systemAge - 0.7) / 0.3) : 0;
      const bgR = Math.round(5 * (1 - ageDarkening));
      const bgG = Math.round(5 * (1 - ageDarkening));
      const bgB = Math.round(16 * (1 - ageDarkening));
      ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      ctx.fillRect(0, 0, width, height);

      // We'll update positions first
      // Assuming parent is always rendered/calculated before child because of how we generated them
      const positions = new Map<string, {x: number, y: number, r: number}>();
      
      bodies.forEach(body => {
        let cx = 0, cy = 0;

        if (body.parentId && positions.has(body.parentId)) {
            const p = positions.get(body.parentId)!;
            cx = p.x;
            cy = p.y;
        }

        const a = body.orbit.semiMajorAxis;
        if (a > 0) {
            const e = body.orbit.eccentricity;
            // Physical orbital velocity matching kepler's laws: inner bodies spin much faster than outer ones.
            const speedMult = body.type === 'moon' ? 0.02 : 0.15;
            const speed = (50 / Math.sqrt(Math.max(0.1, a * a * a))) * speedMult;
            const currentAnomaly = body.orbit.trueAnomaly + timeRef.current * speed;

            // r = a(1-e^2)/(1+e*cos(theta))
            const r = (a * (1 - e * e)) / (1 + e * Math.cos(currentAnomaly));
            
            const lx = r * Math.cos(currentAnomaly);
            const ly = r * Math.sin(currentAnomaly);
            
            const argP = body.orbit.argumentOfPeriapsis || 0;
            cx += lx * Math.cos(argP) - ly * Math.sin(argP);
            cy += lx * Math.sin(argP) + ly * Math.cos(argP);
        }

        positions.set(body.id, { x: cx, y: cy, r: body.radius });
      });

      bodyPositionsRef.current = positions;

      // Update offset if focusing a body
      let currentOffsetX = offset.x;
      let currentOffsetY = offset.y;
      
      if (focusedBodyId && positions.has(focusedBodyId)) {
          const p = positions.get(focusedBodyId)!;
          currentOffsetX = width/2 - p.x * scale;
          currentOffsetY = height/2 - p.y * scale;
      }

      ctx.save();
      ctx.translate(currentOffsetX, currentOffsetY);
      ctx.scale(scale, scale);

      // Draw Temperature Zones if enabled
      if (showZones) {
          const primaryStar = bodies.find(b => b.type === 'star' && b.id === 'star-1');
          if (primaryStar) {
              const sData = STAR_DATA[primaryStar.starClass];
              // Convert AU distances to world pixels using the unified scale
              const hzInPx = sData.hzIn * AU_TO_PX;
              const hzOutPx = sData.hzOut * AU_TO_PX;
              
              // Find the farthest planet to know how far to draw the cold zone
              const farthestOrbit = Math.max(
                  ...bodies.filter(b => b.type === 'planet').map(b => b.orbit.semiMajorAxis),
                  hzOutPx * 3
              );
              const coldEdge = farthestOrbit * 1.5;
              
              // === HOT ZONE (Red) - from star center to inner habitable edge ===
              if (hzInPx > 5) {
                  const hotGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, hzInPx);
                  hotGrad.addColorStop(0, "rgba(255, 40, 0, 0.25)");
                  hotGrad.addColorStop(0.5, "rgba(255, 60, 0, 0.15)");
                  hotGrad.addColorStop(1, "rgba(255, 80, 0, 0.03)");
                  ctx.beginPath();
                  ctx.arc(0, 0, hzInPx, 0, Math.PI * 2);
                  ctx.fillStyle = hotGrad;
                  ctx.fill();
              }
              
              // === HABITABLE ZONE (Green) - ring between hzIn and hzOut ===
              const hzGrad = ctx.createRadialGradient(0, 0, hzInPx * 0.8, 0, 0, hzOutPx * 1.2);
              hzGrad.addColorStop(0, "rgba(0, 200, 80, 0.0)");
              hzGrad.addColorStop(0.15, "rgba(0, 220, 80, 0.12)");
              hzGrad.addColorStop(0.5, "rgba(0, 255, 100, 0.15)");
              hzGrad.addColorStop(0.85, "rgba(0, 220, 80, 0.12)");
              hzGrad.addColorStop(1, "rgba(0, 200, 80, 0.0)");
              ctx.beginPath();
              ctx.arc(0, 0, hzOutPx * 1.2, 0, Math.PI * 2);
              ctx.fillStyle = hzGrad;
              ctx.fill();
              
              // === COLD ZONE (Blue) - from hzOut outward ===
              const coldGrad = ctx.createRadialGradient(0, 0, hzOutPx, 0, 0, coldEdge);
              coldGrad.addColorStop(0, "rgba(0, 100, 255, 0.0)");
              coldGrad.addColorStop(0.1, "rgba(0, 120, 255, 0.06)");
              coldGrad.addColorStop(0.5, "rgba(0, 100, 230, 0.10)");
              coldGrad.addColorStop(1, "rgba(0, 80, 200, 0.15)");
              ctx.beginPath();
              ctx.arc(0, 0, coldEdge, 0, Math.PI * 2);
              ctx.fillStyle = coldGrad;
              ctx.fill();
              
              // === Zone boundary rings for visual clarity ===
              ctx.strokeStyle = "rgba(255, 80, 0, 0.2)";
              ctx.lineWidth = 2 / scale;
              ctx.setLineDash([8 / scale, 6 / scale]);
              ctx.beginPath();
              ctx.arc(0, 0, hzInPx, 0, Math.PI * 2);
              ctx.stroke();
              
              ctx.strokeStyle = "rgba(0, 255, 100, 0.25)";
              ctx.beginPath();
              ctx.arc(0, 0, hzOutPx, 0, Math.PI * 2);
              ctx.stroke();
              
              ctx.setLineDash([]);
          }
      }

      // Draw Protoplanetary Disk (Dust/Debris)
      if (systemAge <= 0.30) {
          const primaryStar = bodies.find(b => b.type === 'star' && b.id === 'star-1');
          if (primaryStar) {
              const farthestOrbit = Math.max(
                  ...bodies.filter(b => b.type === 'planet' || b.type === 'comet').map(b => b.orbit.semiMajorAxis),
                  10 * AU_TO_PX
              );
              // Opacity scales from systemAge=0 (max) to systemAge=0.3 (zero)
              const dustOpacity = Math.max(0, 1 - (systemAge / 0.30));
              const diskRadius = farthestOrbit * 1.2;

              const diskGrad = ctx.createRadialGradient(0, 0, primaryStar.radius * 2, 0, 0, diskRadius);
              diskGrad.addColorStop(0, `rgba(200, 130, 80, ${0.15 * dustOpacity})`);
              diskGrad.addColorStop(0.3, `rgba(150, 110, 80, ${0.1 * dustOpacity})`);
              diskGrad.addColorStop(0.7, `rgba(100, 80, 80, ${0.05 * dustOpacity})`);
              diskGrad.addColorStop(1, `rgba(50, 40, 40, 0)`);
              
              ctx.beginPath();
              ctx.arc(0, 0, diskRadius, 0, Math.PI * 2);
              ctx.fillStyle = diskGrad;
              ctx.fill();
          }
      }

      // Draw Orbits
      ctx.lineWidth = 1 / scale;
      bodies.forEach(body => {
          if (body.type === 'star' || body.type === 'asteroid') return; // Stars and asteroids don't draw individual orbits

          
          let pcx = 0, pcy = 0;
          if (body.parentId && positions.has(body.parentId)) {
              const p = positions.get(body.parentId)!;
              pcx = p.x;
              pcy = p.y;
          }

          const a = body.orbit.semiMajorAxis;
          if (a === 0) return;
          const e = body.orbit.eccentricity;
          const argP = body.orbit.argumentOfPeriapsis || 0;

          // Draw the ellipse path
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${body.type === 'comet' ? 0.05 : 0.15})`;
          ctx.beginPath();
          for (let th = 0; th <= Math.PI * 2; th += 0.05) {
              const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
              const lx = r * Math.cos(th);
              const ly = r * Math.sin(th);
              
              const x = pcx + lx * Math.cos(argP) - ly * Math.sin(argP);
              const y = pcy + lx * Math.sin(argP) + ly * Math.cos(argP);
              
              if (th === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
      });

      // Draw Bodies
      bodies.forEach(body => {
          const p = positions.get(body.id);
          if (!p) return;

          // Body Circle
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5 / scale, p.r), 0, Math.PI * 2);
          ctx.fillStyle = body.baseColor;
          
          // Outer glow for stars / habitable worlds
          if (body.type === 'star') {
              // Dim the star based on system age (star dies → grey, no glow)
              const starAgeDim = systemAge >= 0.7 ? Math.min(1, (systemAge - 0.7) / 0.3) : 0;
              if (starAgeDim > 0) {
                  // Lerp color towards dark grey
                  const hex = body.baseColor;
                  // Parse hex to RGB
                  const r = parseInt(hex.slice(1, 3), 16) || 200;
                  const g = parseInt(hex.slice(3, 5), 16) || 200;
                  const b = parseInt(hex.slice(5, 7), 16) || 200;
                  const targetGrey = 40;
                  const dr = Math.round(r + (targetGrey - r) * starAgeDim);
                  const dg = Math.round(g + (targetGrey - g) * starAgeDim);
                  const db = Math.round(b + (targetGrey - b) * starAgeDim);
                  ctx.fillStyle = `rgb(${dr}, ${dg}, ${db})`;
                  ctx.shadowColor = `rgb(${dr}, ${dg}, ${db})`;
              } else {
                  ctx.shadowColor = body.baseColor;
              }
              ctx.shadowBlur = p.r * 2 * scale * (1 - starAgeDim); // Glow fades to 0
          } else if (body.isForming) {
              // Fiery/dusty halo for forming bodies
              ctx.shadowColor = '#ff6600';
              ctx.shadowBlur = p.r * 2 * scale;
              ctx.strokeStyle = `rgba(255, 100, 0, ${0.5 + Math.sin(timeRef.current * 0.1) * 0.3})`; // Pulsing border
              ctx.lineWidth = 3 / scale;
              ctx.stroke();
          } else if (body.isHabitable) {
              ctx.shadowColor = '#00ff88';
              ctx.shadowBlur = p.r * 1.5 * scale;
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = 2 / scale;
              ctx.stroke();
          } else if (body.type === 'comet') {
              ctx.shadowColor = '#fff';
              ctx.shadowBlur = p.r * scale;
          } else {
              ctx.shadowBlur = 0;
          }
          
          ctx.fill();
          ctx.shadowBlur = 0; // Reset

          // Rings
          if (body.hasRings) {
              ctx.beginPath();
              // Elliptical ring to look tilted
              ctx.ellipse(p.x, p.y, p.r * 2.2, p.r * 0.5, Math.PI / 6, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
              ctx.lineWidth = Math.max(1 / scale, 2);
              ctx.stroke();

              ctx.beginPath();
              ctx.ellipse(p.x, p.y, p.r * 2.5, p.r * 0.6, Math.PI / 6, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(200, 200, 200, 0.2)`;
              ctx.lineWidth = Math.max(1 / scale, 1.5);
              ctx.stroke();
          }
      });

      // Draw Labels/Tooltips for focused or hovered? For now draw names near stars/planets
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = `${12 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      
      bodies.forEach(body => {
          if (body.type === 'asteroid' || body.type === 'comet') return; // Too much clutter
          // Don't draw moon labels unless focused
          if (body.type === 'moon' && focusedBodyId !== body.id && focusedBodyId !== body.parentId) return;

          const p = positions.get(body.id);
          if (!p) return;
          
          ctx.fillText(body.name, p.x, p.y - p.r - (8 / scale));
      });

      ctx.restore();

      timeRef.current += 1;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [bodies, scale, offset, focusedBodyId, showZones, systemAge]);

  const handleGenerateSurface = (bodyId: string) => {
    setSurfaceStates(prev => ({ ...prev, [bodyId]: 'generating' }));
    
    // Simulate generation time for high-res surface
    setTimeout(() => {
        setSurfaceStates(prev => ({ ...prev, [bodyId]: 'ready' }));
    }, 2000);
  };

  // Resize observer
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        // Initial center
        if (offset.x === 0 && offset.y === 0 && !focusedBodyId) {
            setOffset({ x: parent.clientWidth / 2, y: parent.clientHeight / 2 });
        }
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Interaction handlers
  const applyZoom = (newScale: number, centerX: number, centerY: number) => {
    // World coordinates of center
    const worldX = (centerX - offset.x) / scale;
    const worldY = (centerY - offset.y) / scale;

    setScale(newScale);
    if (!focusedBodyId) {
        setOffset({
            x: centerX - worldX * newScale,
            y: centerY - worldY * newScale
        });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    let newScale = scale * (direction > 0 ? zoomFactor : 1 / zoomFactor);
    newScale = Math.max(0.0005, Math.min(newScale, 50));

    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    applyZoom(newScale, mouseX, mouseY);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
        setIsDragging(true);
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
    } else if (activePointers.current.size === 2) {
        setIsDragging(false);
        const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
        lastPinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (activePointers.current.size === 2 && lastPinchDistance.current !== null) {
        const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const delta = distance / lastPinchDistance.current;
        
        // Midpoint of pinch for zooming target
        const midX = (points[0].x + points[1].x) / 2 - rect.left;
        const midY = (points[0].y + points[1].y) / 2 - rect.top;

        const newScale = Math.max(0.0005, Math.min(scale * delta, 50));
        applyZoom(newScale, midX, midY);
        lastPinchDistance.current = distance;
        return;
    }

    if (!isDragging) {
        setLocalMouse({ x: mouseX, y: mouseY });

        const worldX = (mouseX - offset.x) / scale;
        const worldY = (mouseY - offset.y) / scale;

        let hoverId: string | null = null;
        let hoverDist = Infinity;

        const positions = bodyPositionsRef.current;
        bodies.forEach(body => {
            const p = positions.get(body.id);
            if (!p) return;

            const dx = p.x - worldX;
            const dy = p.y - worldY;
            const dist = Math.sqrt(dx*dx + dy*dy);

            const hitRadius = Math.max(p.r, 15 / scale); // Slightly larger hit target for mobile
            if (dist <= hitRadius && dist < hoverDist) {
                hoverId = body.id;
                hoverDist = dist;
            }
        });

        if (hoveredBodyId !== hoverId) setHoveredBodyId(hoverId);
        return;
    }
    
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    
    // Break focus on drag - use a slightly higher threshold for mobile to avoid accidental breaks
    const breakThreshold = activePointers.current.size > 1 ? 50 : 3;
    if (focusedBodyId && (Math.abs(dx) > breakThreshold || Math.abs(dy) > breakThreshold)) {
        const p = bodyPositionsRef.current.get(focusedBodyId);
        if (p && canvas) {
            // Re-calculate the absolute offset BEFORE applying dx to avoid jumps
            const currentX = canvas.width/2 - p.x * scale;
            const currentY = canvas.height/2 - p.y * scale;
            setOffset({ x: currentX + dx, y: currentY + dy });
        }
        setFocusedBodyId(null);
    } else if (!focusedBodyId) {
        setOffset(prev => ({
          x: prev.x + dx,
          y: prev.y + dy
        }));
    }
    
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
        lastPinchDistance.current = null;
    }
    setIsDragging(false);
  };

  const handleClick = (e: React.PointerEvent) => {
    // If we just finished a drag or were pinching, don't click
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    const moveDist = Math.sqrt(dx * dx + dy * dy);
    if (moveDist > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;

    let clickedBodyId: string | null = null;
    let clickDist = Infinity;

    // Find the closest body clicked
    const positions = bodyPositionsRef.current;
    bodies.forEach(body => {
        const p = positions.get(body.id);
        if (!p) return;

        const dx = p.x - worldX;
        const dy = p.y - worldY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Make hit target slightly larger for ease of clicking small bodies
        const hitRadius = Math.max(p.r, 15 / scale);
        
        if (dist <= hitRadius && dist < clickDist) {
            clickedBodyId = body.id;
            clickDist = dist;
        }
    });

    if (clickedBodyId) {
        setFocusedBodyId(clickedBodyId);
    }
  };

  return (
    <div className="w-full h-full bg-neutral-900 overflow-hidden relative">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => { handlePointerUp({ pointerId: -1, clientX: 0, clientY: 0 } as any); setHoveredBodyId(null); }}
        onClick={handleClick}
        className={`w-full h-full touch-none ${hoveredBodyId ? 'cursor-pointer' : (isDragging ? 'cursor-grabbing' : 'cursor-grab')}`}
      />

      {/* Basic HUD */}
      <div className="absolute top-4 left-4 pointer-events-none text-white flex flex-col gap-2 font-mono text-sm bg-black/50 p-2 rounded">
        <div>Zoom: {(scale * 100).toFixed(0)}%</div>
      </div>

      {/* Focused Body Details Sidebar */}
      {focusedBodyId && (() => {
          const body = bodies.find(b => b.id === focusedBodyId);
          if (!body) return null;
          
          const distAu = body.orbit.semiMajorAxis / AU_TO_PX;
          const moons = bodies.filter(b => b.parentId === body.id && b.type === 'moon');
          
          // Determine temperature zone
          const primaryStar = bodies.find(b => b.type === 'star' && b.id === 'star-1');
          let tempZone = '—';
          let tempZoneColor = '#888';
          if (primaryStar && body.type !== 'star') {
              const sd = STAR_DATA[primaryStar.starClass];
              if (distAu < sd.hzIn) { tempZone = 'Zona Quente'; tempZoneColor = '#ff6b35'; }
              else if (distAu <= sd.hzOut) { tempZone = 'Zona Habitável'; tempZoneColor = '#4ade80'; }
              else { tempZone = 'Zona Fria'; tempZoneColor = '#60a5fa'; }
          }
          
          // Planet type display names
          const typeNames: Record<string, string> = {
              'earth-like': 'Terrestre (Earth-like)',
              'rocky-airless': 'Rochoso Sem Atmosfera',
              'arid': 'Árido / Desértico',
              'toxic-atmosphere': 'Atmosfera Tóxica',
              'glacial': 'Glacial',
              'gas-giant': 'Gigante Gasoso',
              'alien-life': 'Vida Alienígena',
              'lava-world': 'Mundo de Lava',
              'ocean-world': 'Mundo Oceânico',
              'frozen-ocean': 'Oceano Congelado',
              'tidally-locked': 'Rotação Síncrona',
              'tidally-locked-dead': 'Rotação Síncrona (Morto)',
              'carbon-world': 'Mundo de Carbono',
              'swamp-world': 'Mundo Pantanoso',
              'ash-world': 'Mundo de Cinzas',
          };
          
          // Planet descriptions
          const typeDescriptions: Record<string, string> = {
              'earth-like': 'Um mundo temperado com oceanos líquidos, atmosfera respirável e vegetação abundante. Condições ideais para o desenvolvimento de vida complexa.',
              'rocky-airless': 'Um corpo rochoso sem atmosfera significativa, coberto por crateras de impacto e regolito. Similar a Mercúrio ou à Lua.',
              'arid': 'Mundo desértico com vastas planícies de areia e cânions profundos. Possui uma atmosfera fina e temperaturas extremas entre dia e noite.',
              'toxic-atmosphere': 'Envolvido por uma atmosfera densa e corrosiva composta de gases tóxicos. Chuvas ácidas e pressão atmosférica extrema tornam a superfície hostil.',
              'glacial': 'Um mundo congelado coberto por camadas espessas de gelo. Temperaturas extremamente baixas e ventos cortantes dominam a superfície.',
              'gas-giant': 'Um colosso gasoso sem superfície sólida definida. Bandas atmosféricas, tempestades ciclônicas massivas e ventos de milhares de km/h.',
              'alien-life': 'Um mundo exótico que abriga formas de vida com bioquímica diferente da terrestre. Flora e fauna de cores e formas incomuns.',
              'lava-world': 'Superfície coberta por oceanos de magma e vulcões em erupção constante. Temperaturas superficiais superiores a 1000°C.',
              'ocean-world': 'Um planeta coberto inteiramente por um oceano global profundo. Sem terra firme visível, ondas colossais e possível vida marinha.',
              'frozen-ocean': 'Oceano global coberto por uma crosta de gelo. Fraturas e geysers revelam um oceano líquido subterrâneo potencialmente habitável.',
              'tidally-locked': 'Rotação sincronizada com sua estrela. Um lado em dia perpétuo, outro em noite eterna, com uma faixa crepuscular intermediária.',
              'tidally-locked-dead': 'Rotação sincronizada com metade derretida em lava permanente e a outra metade congelada num vácuo escuro. Totalmente estéril.',
              'carbon-world': 'Rico em compostos de carbono como grafite, diamantes e hidrocarbonetos. Superfície escura com lagos de metano e etano.',
              'swamp-world': 'Mundo úmido e quente coberto por pântanos densos e vegetação primitiva. Atmosfera rica em metano e vapor d\'água.',
              'ash-world': 'Coberto por camadas profundas de cinzas vulcânicas. Erupções constantes e rios de lava serpenteiam entre planícies cinzentas.',
          };
          
          const starClassNames: Record<string, string> = {
              O: 'Gigante Azul (Classe O)', B: 'Azul-Branca (Classe B)', A: 'Branca (Classe A)',
              F: 'Amarelo-Branca (Classe F)', G: 'Anã Amarela (Classe G)', K: 'Anã Laranja (Classe K)',
              M: 'Anã Vermelha (Classe M)',
          };
          
          const pc = body.planetConfig;
          const pTypeName = pc ? (typeNames[pc.planetType] || pc.planetType) : null;
          const pDesc = pc ? (typeDescriptions[pc.planetType] || '') : null;
          
          // Star description
          const starDesc = body.type === 'star' && body.starClass
              ? `Esta é uma estrela ${starClassNames[body.starClass] || body.starClass}. ${body.starClass === 'G' ? 'Similar ao nosso Sol, fornece calor e luz moderados.' : body.starClass === 'M' ? 'Pequena e fria, com uma zona habitável muito próxima.' : body.starClass === 'O' ? 'Extremamente quente e luminosa, com vida curta mas intensa.' : 'Irradia energia em sua região do espaço.'}`
              : null;
          
          const InfoRow = ({ label, value, color }: { label: string, value: string | number, color?: string }) => (
              <div className="flex justify-between border-b border-neutral-700/30 pb-1.5 pt-1">
                  <span className="text-neutral-500 text-xs">{label}</span>
                  <span className="font-mono text-neutral-100 text-xs" style={color ? { color } : {}}>{value}</span>
              </div>
          );

          return (
             <div className="absolute top-4 right-4 sm:top-14 sm:right-4 left-4 sm:left-auto bottom-24 sm:bottom-auto max-h-[80vh] overflow-y-auto bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/80 rounded-xl shadow-2xl pointer-events-auto z-30 animate-in fade-in slide-in-from-right-4 duration-300 sm:w-80" style={{ scrollbarWidth: 'thin', scrollbarColor: '#444 transparent' }}>
                 {/* Header */}
                 <div className="sticky top-0 bg-neutral-900/95 backdrop-blur-xl p-4 pb-3 border-b border-neutral-700/50 z-10">
                     <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full shadow-lg flex-shrink-0 border-2" style={{ backgroundColor: body.baseColor, boxShadow: `0 0 20px ${body.baseColor}`, borderColor: `${body.baseColor}88` }} />
                            <div>
                               <h2 className="font-bold text-lg text-white leading-tight">{body.name}</h2>
                               <span className="text-xs text-neutral-400 capitalize">
                                   {body.type === 'star' ? (starClassNames[body.starClass || ''] || 'Estrela') : pTypeName || body.type}
                                   {body.isHabitable && <span className="ml-1 text-emerald-400">• Habitável</span>}
                               </span>
                            </div>
                         </div>
                         <button onClick={() => setFocusedBodyId(null)} className="text-neutral-500 hover:text-white transition-colors text-xl leading-none mt-1">&times;</button>
                     </div>
                 </div>
                 
                 {/* Description */}
                 <div className="px-4 pt-3 pb-2">
                     <p className="text-xs text-neutral-400 leading-relaxed italic">
                         {body.type === 'star' ? starDesc : pDesc || 'Corpo celeste sem classificação detalhada.'}
                     </p>
                 </div>
                 
                 {/* Stats */}
                 <div className="px-4 pb-3 space-y-0.5">
                     <h3 className="text-[10px] uppercase tracking-wider text-neutral-600 font-bold mb-2 mt-1">Dados Orbitais</h3>
                     {body.type !== 'star' && (
                         <>
                             <InfoRow label="Distância" value={`${distAu.toFixed(2)} AU`} />
                             <InfoRow label="Excentricidade" value={body.orbit.eccentricity.toFixed(4)} />
                             <InfoRow label="Zona Térmica" value={tempZone} color={tempZoneColor} />
                         </>
                     )}
                     {body.type === 'star' && body.starClass && (
                         <>
                             <InfoRow label="Raio Estelar" value={`${STAR_DATA[body.starClass].r.toFixed(1)} R☉`} />
                             <InfoRow label="Zona Hab. (Início)" value={`${STAR_DATA[body.starClass].hzIn.toFixed(2)} AU`} />
                             <InfoRow label="Zona Hab. (Fim)" value={`${STAR_DATA[body.starClass].hzOut.toFixed(2)} AU`} />
                         </>
                     )}
                     
                     <h3 className="text-[10px] uppercase tracking-wider text-neutral-600 font-bold mb-2 mt-3">Propriedades Físicas</h3>
                     <InfoRow label="Raio" value={`${(body.radius * 1000).toFixed(0)} km`} />
                     <InfoRow label="Anéis" value={body.hasRings ? 'Sim 💍' : 'Não'} />
                     {body.type !== 'star' && (
                         <InfoRow label="Luas" value={moons.length > 0 ? `${moons.length} lua${moons.length > 1 ? 's' : ''}` : 'Nenhuma'} />
                     )}
                     {body.isHabitable && (
                         <InfoRow label="Habitabilidade" value="Confirmada ✓" color="#4ade80" />
                     )}
                     
                     {/* Planet-specific detailed config */}
                     {pc && (
                         <>
                             <h3 className="text-[10px] uppercase tracking-wider text-neutral-600 font-bold mb-2 mt-3">Condições da Superfície</h3>
                             <InfoRow label="Tamanho Planetário" value={`${pc.planetSize.toFixed(2)} M⊕`} />
                             <InfoRow label="Nível do Mar" value={`${(pc.seaLevel * 100).toFixed(0)}%`} />
                             <InfoRow label="Temperatura Base" value={pc.baseTemperature > 0.7 ? 'Escaldante 🔥' : pc.baseTemperature > 0.4 ? 'Temperado 🌡️' : 'Gélido ❄️'} />
                             <InfoRow label="Umidade" value={`${(pc.baseMoisture * 100).toFixed(0)}%`} />
                             <InfoRow label="Atividade Vulcânica" value={pc.volcanicActivity > 0.6 ? 'Intensa 🌋' : pc.volcanicActivity > 0.3 ? 'Moderada' : 'Baixa'} />
                             <InfoRow label="Densidade de Crateras" value={pc.craterDensity > 0.7 ? 'Alta' : pc.craterDensity > 0.3 ? 'Média' : 'Baixa'} />
                             <InfoRow label="Cobertura de Nuvens" value={`${(pc.cloudDensity * 100).toFixed(0)}%`} />
                             {pc.planetType === 'gas-giant' && (
                                 <>
                                     <InfoRow label="Contraste de Bandas" value={`${(pc.bandContrast * 100).toFixed(0)}%`} />
                                     <InfoRow label="Frequência de Tempestades" value={pc.stormFrequency > 0.6 ? 'Alta ⚡' : pc.stormFrequency > 0.3 ? 'Média' : 'Baixa'} />
                                     <InfoRow label="Paleta" value={pc.colorPalette} />
                                 </>
                             )}
                             {(pc.planetType === 'earth-like' || pc.planetType === 'alien-life') && (
                                 <>
                                     <InfoRow label="Cor da Vegetação" value={pc.vegetationHue} />
                                     <InfoRow label="Cor da Água" value={pc.waterHue} />
                                 </>
                             )}
                         </>
                     )}
                     
                     {/* Moon list if this is a planet */}
                     {moons.length > 0 && (
                         <>
                             <h3 className="text-[10px] uppercase tracking-wider text-neutral-600 font-bold mb-2 mt-3">Luas Orbitais ({moons.length})</h3>
                             <div className="space-y-1">
                                 {moons.map(m => (
                                     <div key={m.id} onClick={() => setFocusedBodyId(m.id)} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/10 cursor-pointer transition-colors">
                                         <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.baseColor }} />
                                         <span className="text-xs text-neutral-300">{m.name.split(' ').pop()}</span>
                                         <span className="text-[10px] text-neutral-500 ml-auto">{m.planetConfig ? (typeNames[m.planetConfig.planetType] || '').split(' ')[0] : 'Rochosa'}</span>
                                     </div>
                                 ))}
                             </div>
                         </>
                     )}
                 </div>

                 {/* Action Button */}
                 {body.planetConfig && (
                     <div className="sticky bottom-0 bg-neutral-900/95 border-t border-neutral-700/50 p-4">
                         {surfaceStates[body.id] === 'ready' ? (
                             <button 
                               onClick={() => setViewingSurfaceBody(body)}
                               className="w-full bg-emerald-500 text-white hover:bg-emerald-400 py-2.5 rounded-lg transition-all font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                             >
                               🗺️ Visualizar Superfície
                             </button>
                         ) : surfaceStates[body.id] === 'generating' ? (
                             <button 
                               disabled
                               className="w-full bg-neutral-800 text-neutral-500 border border-neutral-700 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                             >
                               <div className="w-4 h-4 border-2 border-neutral-600 border-t-emerald-500 rounded-full animate-spin" />
                               Gerando Superfície...
                             </button>
                         ) : (
                             <button 
                               onClick={() => handleGenerateSurface(body.id)}
                               className="w-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 hover:bg-emerald-600 hover:text-white py-2.5 rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2"
                             >
                               🌍 Gerar Superfície Detalhada
                             </button>
                         )}
                     </div>
                 )}
             </div>
          )
      })()}

      {/* Floating Tooltip */}
      {hoveredBodyId && (
          <div className="absolute pointer-events-none bg-neutral-900/95 border border-neutral-600 text-white px-3 py-1.5 rounded-lg shadow-2xl z-50 transform -translate-x-1/2 -translate-y-[130%]"
               style={{ left: localMouse.x, top: localMouse.y }}>
              <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bodies.find(b => b.id === hoveredBodyId)?.baseColor }}/>
                 <span className="font-bold text-sm">{bodies.find(b => b.id === hoveredBodyId)?.name}</span>
              </div>
          </div>
      )}

      {/* Body List at Bottom */}
      <div className="absolute bottom-0 left-0 w-full bg-neutral-900/90 backdrop-blur-md border-t border-neutral-700/50 p-2 sm:p-3 flex gap-2 sm:gap-3 overflow-x-auto select-none no-scrollbar z-20" style={{ maxHeight: '160px' }}>
        
        {/* Stars */}
        {bodies.filter(b => b.type === 'star').map(star => (
            <div key={star.id} onClick={() => setFocusedBodyId(star.id)} className={`flex flex-col justify-center flex-shrink-0 cursor-pointer px-4 py-2 rounded-lg transition-colors border ${focusedBodyId === star.id ? 'bg-white/10 border-white/30' : 'bg-black/40 border-transparent hover:bg-white/5'}`}>
               <div className="flex items-center gap-3">
                   <div className="w-5 h-5 rounded-full shadow-lg" style={{ backgroundColor: star.baseColor, boxShadow: `0 0 10px ${star.baseColor}` }} />
                   <span className="font-bold text-lg text-white whitespace-nowrap drop-shadow">{star.name}</span>
               </div>
            </div>
        ))}
        
        <div className="w-px bg-neutral-700/50 mx-1 flex-shrink-0" />

        {/* Planets + Moons */}
        {bodies.filter(b => b.type === 'planet').map(planet => {
            const moons = bodies.filter(b => b.parentId === planet.id && b.type === 'moon');
            return (
              <div key={planet.id} className="flex flex-col flex-shrink-0 bg-black/40 rounded-lg p-2 min-w-[140px] border border-transparent hover:border-neutral-700/50 transition-colors">
                 <div onClick={() => setFocusedBodyId(planet.id)} className={`flex items-center gap-2 cursor-pointer p-1.5 rounded transition-colors ${focusedBodyId === planet.id ? 'bg-white/20' : 'hover:bg-white/10'}`}>
                    <div className="w-3.5 h-3.5 rounded-full border border-black/50 flex-shrink-0" style={{ backgroundColor: planet.baseColor }} />
                    <span className="text-neutral-200 font-bold whitespace-nowrap text-sm">{planet.name} {planet.isHabitable && '🌱'}</span>
                 </div>
                 {moons.length > 0 && (
                     <div className="flex gap-1.5 text-xs flex-wrap px-1 mt-1 max-w-[200px]">
                        {moons.map(moon => (
                            <div key={moon.id} onClick={() => setFocusedBodyId(moon.id)} className={`cursor-pointer flex items-center gap-1.5 rounded bg-black/50 px-2 py-1 transition-colors ${focusedBodyId === moon.id ? 'bg-white/30 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}>
                               <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: moon.baseColor }} />
                               <span className="whitespace-nowrap font-mono">{moon.name.split(' ').pop()}</span>
                            </div>
                        ))}
                     </div>
                 )}
              </div>
            );
        })}

      </div>

      {/* Surface Viewer Modal */}
      {viewingSurfaceBody && (
          <SurfaceModal 
            body={viewingSurfaceBody} 
            onClose={() => setViewingSurfaceBody(null)} 
          />
      )}
    </div>
  );
}
