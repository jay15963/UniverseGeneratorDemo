import React, { useEffect, useRef, useState } from 'react';
import { UniverseGalaxyMetadata, UniverseConfig } from '../../lib/universe/types';
import { GalaxyConfig, GalaxyLayer, GalaxyShape } from '../../lib/galaxy/types';
import { ZoomIn, ZoomOut, Crosshair, ChevronRight } from 'lucide-react';

const createPuff = (rgb: string) => {
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 64;
    const c = cvs.getContext('2d');
    if (c) {
       const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
       grad.addColorStop(0, `${rgb}1.0)`);
       grad.addColorStop(0.1, `${rgb}0.8)`);
       grad.addColorStop(0.3, `${rgb}0.3)`);
       grad.addColorStop(0.6, `${rgb}0.1)`);
       grad.addColorStop(1, `${rgb}0)`);
       c.fillStyle = grad;
       c.fillRect(0, 0, 64, 64);
    }
    return cvs;
};

const puffCache: Record<string, HTMLCanvasElement> = {};

function getPuffForColor(color: string) {
   if (!puffCache[color]) {
       // Convert 'hsl(200, 50%, 50%)' to 'hsla(200, 50%, 50%, ' so the gradient can mix alpha
       const hslaPrefix = color.replace('hsl', 'hsla').replace(')', ', ');
       puffCache[color] = createPuff(hslaPrefix);
   }
   return puffCache[color];
}

// Pseudo random inline
const pseudoRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
    return () => {
        hash = Math.imul(hash ^ hash >>> 16, 2246822507);
        hash = Math.imul(hash ^ hash >>> 13, 3266489909);
        return (hash ^= hash >>> 16) >>> 0 / 4294967296;
    };
};

interface UniverseViewerProps {
   galaxies: UniverseGalaxyMetadata[];
   config: UniverseConfig;
   onEnterGalaxy: (sysConfig: Partial<GalaxyConfig>) => void;
}

export function UniverseViewer({ galaxies, config, onEnterGalaxy }: UniverseViewerProps) {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const hudCanvasRef = useRef<HTMLCanvasElement>(null);
   const containerRef = useRef<HTMLDivElement>(null);
   
   // Start zoomed out appropriately for the amount of galaxies
   const initialScale = config.maxGalaxies > 10000 ? 0.05 : 0.1;
   const [scale, setScale] = useState(initialScale); 
   const [offset, setOffset] = useState({ x: 0, y: 0 });
   
   const [isDragging, setIsDragging] = useState(false);
   const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
   const pointerDownPos = useRef({ x: 0, y: 0 });

   const [hoveredGalaxy, setHoveredGalaxy] = useState<UniverseGalaxyMetadata | null>(null);
   const [selectedGalaxy, setSelectedGalaxy] = useState<UniverseGalaxyMetadata | null>(null);
   const [dimensions, setDimensions] = useState({ w: 1200, h: 800 });

   // The bounding spatial radius of the universe
   const LOGICAL_RADIUS = Math.max(10000, Math.sqrt(config.maxGalaxies) * 200) * 1.5;

   useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver((entries) => {
         const { width, height } = entries[0].contentRect;
         if (width > 0 && height > 0) setDimensions({ w: width, h: height });
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
   }, []);

   useEffect(() => {
      setScale(2.0);
      setOffset({ x: 0, y: 0 });
      setSelectedGalaxy(null);
   }, [config.seed]);

   // Render Loop
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Background
      ctx.fillStyle = '#020202';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(scale, scale);

      const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

      // 2. Cosmic Background Radiation / Flash (Expansion phase)
      if (config.age < 0.1) {
          const bgRg = ctx.createRadialGradient(0, 0, 0, 0, 0, LOGICAL_RADIUS);
          const flashAlpha = 1 - (config.age * 10);
          bgRg.addColorStop(0, `rgba(255, 200, 150, ${flashAlpha})`);
          bgRg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath(); ctx.arc(0, 0, LOGICAL_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = bgRg; ctx.fill();
      }

      // Culling Bounding Box Limits (Logical coords)
      const viewportHalfW = (canvas.width / 2) / scale;
      const viewportHalfH = (canvas.height / 2) / scale;
      const vX = -offset.x / scale;
      const vY = -offset.y / scale;

      let drawCount = 0;

      // LOD Grouping for massive performance boost
      // A batch array reduces 400,000 canvas API calls to just few canvas API calls.
      const colorBatches: Record<string, { x: number, y: number }[]> = {};
      const puffBatches: UniverseGalaxyMetadata[] = [];

      for (let i = 0; i < galaxies.length; i++) {
         const g = galaxies[i];
         const cx = g.x * ratio;
         const cy = g.y * ratio;

         // Frustum Culling limits off-screen rendering
         if (
            cx < vX - viewportHalfW - 100 || cx > vX + viewportHalfW + 100 ||
            cy < vY - viewportHalfH - 100 || cy > vY + viewportHalfH + 100
         ) { continue; }

         drawCount++;

         if (scale < 0.2) {
             if (!colorBatches[g.baseColor]) colorBatches[g.baseColor] = [];
             colorBatches[g.baseColor].push({ x: cx, y: cy });
         } else {
             // For all zoom levels above 0.2, just use optimized puff textures
             // Without rendering actual individual stars, which ensures high FPS
             puffBatches.push(g);
         }
      }

      // Execute LOD 1 Batch Render (Dots)
      if (scale < 0.2) {
         const dot = Math.max(0.5 / scale, 1.5 / scale);
         for (const color in colorBatches) {
             ctx.fillStyle = color;
             ctx.beginPath();
             const batch = colorBatches[color];
             for (let i = 0; i < batch.length; i++) {
                const pt = batch[i];
                ctx.moveTo(pt.x + dot, pt.y);
                ctx.arc(pt.x, pt.y, dot, 0, Math.PI * 2);
             }
             ctx.fill();
         }
      }

      // Execute LOD 2 Puff Render (Galaxy Shapes with Nebulae)
      if (puffBatches.length > 0) {
         for (let i = 0; i < puffBatches.length; i++) {
             const g = puffBatches[i];
             const cx = g.x * ratio;
             const cy = g.y * ratio;
             
             const galRadius = (g.size * 30) * ratio;
             const puff = getPuffForColor(g.baseColor);
             
             ctx.globalCompositeOperation = 'screen';
             ctx.globalAlpha = g.isDead ? 0.2 : 0.9; // Brighter
             
             // Fast deterministic rotation
             const angle = ((g.x * 12.9898) + (g.y * 78.233)) % (Math.PI * 2);

             ctx.save();
             ctx.translate(cx, cy);
             ctx.rotate(angle);

             if (g.shape === GalaxyShape.BARRED_SPIRAL) {
                 // Bright Core
                 ctx.drawImage(puff, -galRadius*0.8, -galRadius*0.8, galRadius*1.6, galRadius*1.6);
                 // Horizontal Bar
                 ctx.globalAlpha = g.isDead ? 0.1 : 0.6;
                 ctx.drawImage(puff, -galRadius*1.8, -galRadius*0.4, galRadius*3.6, galRadius*0.8);
             } else if (g.shape === GalaxyShape.ELLIPTICAL) {
                 // Large squashed oval
                 ctx.scale(1.5, 0.8);
                 ctx.drawImage(puff, -galRadius*1.2, -galRadius*1.2, galRadius*2.4, galRadius*2.4);
                 // Inner core
                 ctx.globalAlpha = g.isDead ? 0.15 : 0.7;
                 ctx.scale(0.5, 0.5);
                 ctx.drawImage(puff, -galRadius*1.2, -galRadius*1.2, galRadius*2.4, galRadius*2.4);
             } else if (g.shape === GalaxyShape.SPIRAL) {
                 // Bright dense core
                 ctx.drawImage(puff, -galRadius*0.8, -galRadius*0.8, galRadius*1.6, galRadius*1.6);
                 // Intersecting arms mimicking spirals
                 ctx.globalAlpha = g.isDead ? 0.1 : 0.5;
                 ctx.scale(1.3, 1.3);
                 ctx.drawImage(puff, -galRadius, -galRadius*0.35, galRadius*2, galRadius*0.7);
                 ctx.rotate(Math.PI / 1.5);
                 ctx.drawImage(puff, -galRadius, -galRadius*0.35, galRadius*2, galRadius*0.7);
             } else {
                 // Irregular - Chaotic blobs
                 ctx.drawImage(puff, -galRadius, -galRadius, galRadius*2, galRadius*2);
                 ctx.globalAlpha = g.isDead ? 0.1 : 0.6;
                 ctx.drawImage(puff, -galRadius*0.2, -galRadius*1.3, galRadius*1.6, galRadius*1.6);
                 ctx.drawImage(puff, -galRadius*1.3, -galRadius*0.1, galRadius*1.5, galRadius*1.5);
             }

             ctx.restore();
             ctx.globalAlpha = 1.0;
             ctx.globalCompositeOperation = 'source-over';
         }
      }

      ctx.restore();

      // Debug
      // ctx.fillStyle = 'white'; ctx.fillText(`Rendered Galaxies (Viewport): ${drawCount} | Zoom: ${scale.toFixed(2)}`, 10, 20);

   }, [galaxies, scale, offset, config.age, dimensions]);

   // HUD Render Loop
   useEffect(() => {
      const canvas = hudCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(scale, scale);
      const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

      [hoveredGalaxy, selectedGalaxy].forEach(g => {
         if (!g) return;
         const cx = g.x * ratio;
         const cy = g.y * ratio;
         // Draw target box
         const size = Math.max(15 / scale, ((g.size * 30) * ratio) * 1.2);
         ctx.strokeStyle = g === selectedGalaxy ? '#fff' : 'rgba(255,255,255,0.4)';
         ctx.lineWidth = 1.5 / scale;
         ctx.beginPath();
         // Top Left
         ctx.moveTo(cx - size, cy - size + size/2); ctx.lineTo(cx - size, cy - size); ctx.lineTo(cx - size + size/2, cy - size);
         // Top Right
         ctx.moveTo(cx + size - size/2, cy - size); ctx.lineTo(cx + size, cy - size); ctx.lineTo(cx + size, cy - size + size/2);
         // Bot Left
         ctx.moveTo(cx - size, cy + size - size/2); ctx.lineTo(cx - size, cy + size); ctx.lineTo(cx - size + size/2, cy + size);
         // Bot Right
         ctx.moveTo(cx + size - size/2, cy + size); ctx.lineTo(cx + size, cy + size); ctx.lineTo(cx + size, cy + size - size/2);
         ctx.stroke();
      });
      ctx.restore();
   }, [hoveredGalaxy, selectedGalaxy, scale, offset, dimensions]);

   // Interactions
   const handleWheel = (e: React.WheelEvent) => {
       const zoomSensitivity = 0.002;
       // Bounded zoom between 2x and 15x
       const newScale = Math.max(2.0, Math.min(15.0, scale - (e.deltaY * zoomSensitivity * scale)));
       setScale(newScale);

       // Lock camera target to selected galaxy when zooming
       if (selectedGalaxy) {
           const ratio = (Math.min(canvasRef.current?.width || 1200, canvasRef.current?.height || 800) / 2) / LOGICAL_RADIUS;
           setOffset({
               x: -(selectedGalaxy.x * ratio) * newScale,
               y: -(selectedGalaxy.y * ratio) * newScale
           });
       }
   };

   const handlePointerDown = (e: React.PointerEvent) => {
       setIsDragging(true);
       setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
       pointerDownPos.current = { x: e.clientX, y: e.clientY };
       
       // Frees the camera lock-on the moment user drags screen manually
       if (selectedGalaxy) {
           setSelectedGalaxy(null);
       }
   };

   const handlePointerMove = (e: React.PointerEvent) => {
       if (isDragging) {
           setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
           setHoveredGalaxy(null);
           return;
       }

       if (galaxies.length === 0) return;
       const canvas = canvasRef.current;
       if (!canvas) return;

       const rect = canvas.getBoundingClientRect();
       const mouseX = e.clientX - rect.left;
       const mouseY = e.clientY - rect.top;

       const logicalX = (mouseX - (canvas.width / 2 + offset.x)) / scale;
       const logicalY = (mouseY - (canvas.height / 2 + offset.y)) / scale;

       const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

       let closest: UniverseGalaxyMetadata | null = null;
       let mindistSq = Infinity;
       const hitRadius = Math.max(15 / scale, 0.5); 
       const hitRadiusSq = hitRadius * hitRadius;

       for (let i = 0; i < galaxies.length; i++) {
           const g = galaxies[i];
           const cx = g.x * ratio;
           const cy = g.y * ratio;
           if (Math.abs(cx - logicalX) > hitRadius || Math.abs(cy - logicalY) > hitRadius) continue;
           const distSq = (cx - logicalX) * (cx - logicalX) + (cy - logicalY) * (cy - logicalY);
           if (distSq < hitRadiusSq && distSq < mindistSq) {
               mindistSq = distSq;
               closest = g;
           }
       }

       setHoveredGalaxy(closest);
   };

   const handlePointerUp = (e: React.PointerEvent) => {
       const dx = e.clientX - pointerDownPos.current.x;
       const dy = e.clientY - pointerDownPos.current.y;
       const wasClick = Math.sqrt(dx * dx + dy * dy) < 5;

       setIsDragging(false);
       if (wasClick && hoveredGalaxy) {
           setSelectedGalaxy(hoveredGalaxy);
           
           // AUTO-FOCUS CAMERA ON GALAXY CLICK
           const canvas = canvasRef.current;
           if (canvas) {
               const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;
               const tgtCx = hoveredGalaxy.x * ratio;
               const tgtCy = hoveredGalaxy.y * ratio;
               
               // Calculate offset to mathematically center tgtCx, tgtCy.
               // Normally origin is canvas.width/2. Target logic puts tgtCx at center if offset is -tgtCx * scale.
               setOffset({
                   x: -tgtCx * scale,
                   y: -tgtCy * scale
               });
           }
       }
   };

   const enterGalaxy = () => {
      if (!selectedGalaxy) return;
      // Triggers transition to Galaxy Viewer with perfect matching seed and shape/size
      onEnterGalaxy({
         seed: selectedGalaxy.galaxySeed,
         age: selectedGalaxy.age,
         numStars: selectedGalaxy.starCount,
         shape: selectedGalaxy.shape,
      });
   };

   return (
       <div className="lg:col-span-3 flex flex-col gap-4 relative h-full min-h-[600px]">
          {/* Controls */}
          <div className="absolute top-4 left-4 z-10 flex gap-2 items-center">
             <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => setScale(s => Math.min(15.0, s * 1.5))}><ZoomIn className="w-5 h-5" /></button>
             <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => setScale(s => Math.max(2.0, s / 1.5))}><ZoomOut className="w-5 h-5" /></button>
             <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => { setScale(2.0); setOffset({ x: 0, y: 0 }); }} title="Recenter"><Crosshair className="w-5 h-5" /></button>
             <span className="ml-2 font-mono text-xs text-neutral-400 bg-neutral-800/50 px-2 py-1 rounded">
                 Zoom: {scale < 1.0 ? scale.toFixed(4) : Math.round(scale)}x
             </span>
          </div>

          <div
             ref={containerRef}
             className="flex-1 bg-black rounded-xl border border-neutral-700 overflow-hidden relative"
             onWheel={handleWheel}
             onPointerDown={handlePointerDown}
             onPointerMove={handlePointerMove}
             onPointerUp={handlePointerUp}
             onPointerLeave={() => { setIsDragging(false); setHoveredGalaxy(null); }}
          >
             <canvas ref={canvasRef} width={dimensions.w} height={dimensions.h} className="w-full h-full absolute inset-0 cursor-crosshair" />
             <canvas ref={hudCanvasRef} width={dimensions.w} height={dimensions.h} className="w-full h-full absolute inset-0 pointer-events-none" />

             {galaxies.length === 0 && config.age > 0.05 && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 font-medium">Configure parameters and Generate Universe</div>
             )}
          </div>

          {/* Modal Overlay for Selected Galaxy */}
          {selectedGalaxy && (
            <div className="absolute top-4 right-4 bg-neutral-900/95 border border-fuchsia-500/40 rounded-xl shadow-2xl backdrop-blur-sm w-80 z-20 flex flex-col overflow-hidden">
               <div className="p-4 pb-3 border-b border-neutral-700/50 flex justify-between items-start">
                   <div>
                       <h3 className="text-xl font-bold text-white mb-1">{selectedGalaxy.name}</h3>
                       <span className="text-xs font-semibold px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300">
                           {selectedGalaxy.shape.replace('_', ' ')}
                       </span>
                   </div>
                   <button onClick={() => setSelectedGalaxy(null)} className="text-neutral-500 hover:text-white">&times;</button>
               </div>
               
               <div className="p-4 space-y-4">
                   <p className="text-sm text-neutral-400">
                       {selectedGalaxy.isDead 
                           ? "Este resquício galáctico outrora brilhante já exauriu suas estrelas. Restam apenas buracos negros e anãs vermelhas moribundas na escuridão eterna."
                           : selectedGalaxy.shape === GalaxyShape.IRREGULAR 
                              ? "Uma enorme colisão galáctica ocorreu aqui, amalgamando bilhões de estrelas em uma massa gravitacional caótica e instável."
                              : "Uma imponente macroestrutura cósmica abrigando bilhões de sistemas estelares."}
                   </p>
                   
                   <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-neutral-800 p-2 rounded-lg">
                            <span className="block text-neutral-500 text-[10px] uppercase">Contagem Estelar</span>
                            <span className="font-semibold text-neutral-200">{(selectedGalaxy.starCount).toLocaleString()}k</span>
                        </div>
                        <div className="bg-neutral-800 p-2 rounded-lg">
                            <span className="block text-neutral-500 text-[10px] uppercase">Luz Visível</span>
                            <span className="font-semibold" style={{color: selectedGalaxy.baseColor}}>Spectro</span>
                        </div>
                        <div className="bg-neutral-800 p-2 rounded-lg">
                            <span className="block text-neutral-500 text-[10px] uppercase">Idade Relativa</span>
                            <span className="font-semibold text-neutral-200">{Math.round(selectedGalaxy.age * 100)}%</span>
                        </div>
                        <div className="bg-neutral-800 p-2 rounded-lg">
                            <span className="block text-neutral-500 text-[10px] uppercase">Estágio</span>
                            <span className={`font-semibold ${selectedGalaxy.isDead ? 'text-red-400' : 'text-emerald-400'}`}>
                                {selectedGalaxy.isDead ? 'Morto' : 'Ativo'}
                            </span>
                        </div>
                   </div>
               </div>

               <div className="p-4 pt-0">
                    <button
                        onClick={enterGalaxy}
                        className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 shadow-lg"
                    >
                        Visualizar Galáxia <ChevronRight className="w-4 h-4" />
                    </button>
               </div>
            </div>
          )}
       </div>
   );
}
