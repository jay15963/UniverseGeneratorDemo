import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Maximize } from 'lucide-react';
import { PlanetGenerator, LayerType, BIOME_NAMES, hasCapability, PlanetCapability, PlanetConfig, BiomeType } from '../lib/planet-generator/generator';
import { MapLegend } from './MapLegend';

interface MapViewerProps {
  layer: LayerType;
  config: PlanetConfig;
  isGenerating: boolean;
  progress: number;
  status: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  generatorRef: React.RefObject<PlanetGenerator | null>;
}

interface HoverInfo {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

export function MapViewer({ 
  layer, 
  config, 
  isGenerating, 
  progress, 
  status, 
  canvasRef,
  generatorRef,
}: MapViewerProps) {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [baseOffset, setBaseOffset] = useState({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);

  // Sync the clone canvases whenever the main canvas finishes generating a new layer
  useEffect(() => {
    if (!isGenerating && canvasRef.current && leftRef.current && rightRef.current) {
      // Defer to next frame so usePlanetController's renderLayer synchronously paints first
      requestAnimationFrame(() => {
        if (!canvasRef.current || !leftRef.current || !rightRef.current) return;
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const ctxLeft = leftRef.current.getContext('2d');
        const ctxRight = rightRef.current.getContext('2d');
        if (ctxLeft && ctxRight) {
          ctxLeft.clearRect(0, 0, w, h);
          ctxRight.clearRect(0, 0, w, h);
          ctxLeft.drawImage(canvasRef.current, 0, 0);
          ctxRight.drawImage(canvasRef.current, 0, 0);
        }
      });
    }
  }, [isGenerating, layer, config.width, config.height, canvasRef]);

  // Prevent default scroll behavior when zooming and handle zoom-to-pointer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY * -0.002;
      const newScale = Math.min(Math.max(1, viewTransform.scale * (1 + zoomFactor)), 6);
      applyZoom(newScale, mouseX, mouseY);
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelNative);
  }, [viewTransform]);

  const applyZoom = (newScale: number, centerX: number, centerY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    setViewTransform(prev => {
      if (newScale === prev.scale) return prev;

      // Coordinate of point on the unscaled map (relative to current origin)
      const mapX = (centerX - prev.x) / prev.scale;
      const mapY = (centerY - prev.y) / prev.scale;
      
      // Expected new offset to keep pointer exactly on the same map pixel
      let newX = centerX - mapX * newScale;
      let newY = centerY - mapY * newScale;

      // Restrict Y panning to map edges
      const minY = rect.height - rect.height * newScale;
      newY = Math.max(minY, Math.min(0, newY));

      // Infinite Horizontal Wrap-around: keep offset.x in (-scaledWidth, 0]
      const scaledWidth = rect.width * newScale;
      newX = newX % scaledWidth;
      if (newX > 0) newX -= scaledWidth;
      
      return { x: newX, y: newY, scale: newScale };
    });
  };

  const handleExport = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `planet-${config.seed}-${layer}.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
        setBaseOffset({ x: viewTransform.x, y: viewTransform.y });
    } else if (activePointers.current.size === 2) {
        setIsDragging(false);
        const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
        lastPinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  };

  const getMapPixel = useCallback((clientX: number, clientY: number): { px: number; py: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    
    // Reverse the transform to get map-space coordinates
    const mapX = (mouseX - viewTransform.x) / viewTransform.scale;
    const mapY = (mouseY - viewTransform.y) / viewTransform.scale;
    
    // mapX/mapY are in the container's 0..containerWidth/Height space
    // Canvas fills the container, so normalize
    let px = Math.floor((mapX / rect.width) * config.width);
    const py = Math.floor((mapY / rect.height) * config.height);
    
    // Wrap X
    px = ((px % config.width) + config.width) % config.width;
    
    if (py < 0 || py >= config.height) return null;
    return { px, py };
  }, [viewTransform, config.width, config.height]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (activePointers.current.size === 2 && lastPinchDistance.current !== null) {
      const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const delta = distance / lastPinchDistance.current;

      const midX = (points[0].x + points[1].x) / 2 - rect.left;
      const midY = (points[0].y + points[1].y) / 2 - rect.top;

      const newScale = Math.min(Math.max(1, viewTransform.scale * delta), 6);
      applyZoom(newScale, midX, midY);
      lastPinchDistance.current = distance;
      return;
    }

    // Hover inspector
    if (!isDragging && layer !== LayerType.FINAL) {
      const pixel = getMapPixel(e.clientX, e.clientY);
      if (pixel) {
        setHoverInfo({
          x: pixel.px,
          y: pixel.py,
          screenX: e.clientX - rect.left,
          screenY: e.clientY - rect.top,
        });
      } else {
        setHoverInfo(null);
      }
    }

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      let newX = baseOffset.x + dx;
      let newY = baseOffset.y + dy;

      // Vertical constraints
      const minY = rect.height - rect.height * viewTransform.scale;
      newY = Math.max(minY, Math.min(0, newY));

      // Horizontal wrap
      const scaledWidth = rect.width * viewTransform.scale;
      newX = newX % scaledWidth;
      if (newX > 0) newX -= scaledWidth;

      setViewTransform(prev => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinchDistance.current = null;
    setIsDragging(false);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    setIsDragging(false);
    setHoverInfo(null);
  };

  const resetView = () => {
    setViewTransform({ x: 0, y: 0, scale: 1 });
  };

  // Build the hover tooltip content
  const getHoverContent = (): string[] | null => {
    if (!hoverInfo || !generatorRef.current) return null;
    const gen = generatorRef.current;
    const idx = hoverInfo.y * config.width + hoverInfo.x;
    if (idx < 0 || idx >= config.width * config.height) return null;
    
    const elev = gen.elevation[idx];
    const temp = gen.temperature[idx];
    const moist = gen.moisture[idx];
    const pt = config.planetType;
    
    const lines: string[] = [
      `📍 ${hoverInfo.x}, ${hoverInfo.y}`,
    ];

    if (hasCapability(pt, PlanetCapability.BIOMES)) {
      const biome = BIOME_NAMES[gen.biomeIds[idx]] || 'Unknown';
      lines.push(`🏔️ ${biome}`);
    } else {
      lines.push(`🏔️ ${pt.replace('-', ' ')}`);
    }

    if (layer === LayerType.ELEVATION || layer === LayerType.HEIGHTMAP) {
      lines.push(`Elevation: ${(elev * 100).toFixed(1)}%`);
    } else if (layer === LayerType.TEMPERATURE) {
      lines.push(`Temperature: ${(temp * 100).toFixed(1)}%`);
    } else if (layer === LayerType.MOISTURE) {
      lines.push(`Moisture: ${(moist * 100).toFixed(1)}%`);
    } else if (layer === LayerType.MOVEMENT) {
      lines.push(`Cost: ${gen.movementCosts[idx]}`);
    } else if (layer === LayerType.FERTILITY) {
      lines.push(`Fertility: ${(gen.fertility[idx] * 100).toFixed(1)}%`);
    } else if (layer === LayerType.ORES) {
      const o = gen.ores[idx];
      let tier = 'Barren';
      if (o >= 0.80) tier = 'Rare Crystals';
      else if (o >= 0.60) tier = 'Precious Metals';
      else if (o >= 0.35) tier = 'Minerals';
      else if (o >= 0.15) tier = 'Basic Metals';
      lines.push(`Ore: ${tier} (${(o * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.SPICES) {
      const s = gen.spices[idx];
      let tier = 'None';
      if (s >= 0.75) tier = 'T5 Bioluminescent';
      else if (s >= 0.50) tier = 'T4 Deep Flora';
      else if (s >= 0.25) tier = 'T3 Healing Sap';
      else if (s >= 0.05) tier = 'T1-T2 Roots/Seeds';
      lines.push(`Spice: ${tier} (${(s * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.RESOURCES) {
      const r = gen.resources[idx];
      let tier = 'None';
      if (r >= 0.60) tier = 'Hardwood';
      else if (r >= 0.35) tier = 'Softwood / Stone';
      else if (r >= 0.10) tier = 'Stone / Clay';
      lines.push(`Resource: ${tier} (${(r * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.FAUNA) {
      const f = gen.fauna[idx];
      const isOcean = elev <= config.seaLevel;
      let tier = 'None';
      if (isOcean) {
        if (f >= 0.60) tier = 'A4-A5 Leviathans';
        else if (f >= 0.30) tier = 'A2-A3 Marine Predators';
        else if (f >= 0.05) tier = 'A1 Reef Life';
      } else {
        if (f >= 0.75) tier = 'T9-T10 Apex Legends';
        else if (f >= 0.50) tier = 'T5-T7 Apex Jungle';
        else if (f >= 0.25) tier = 'T4-T6 Predators';
        else if (f >= 0.05) tier = 'T1-T3 Herbivores';
      }
      lines.push(`Fauna: ${tier} (${(f * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.TECTONIC) {
      const bType = gen.boundaryTypes[idx];
      const dist = gen.plateDistances[idx];
      if (bType === 1) lines.push('Convergent Boundary');
      else if (bType === 2) lines.push('Divergent Boundary');
      else if (bType === 3) lines.push('Transform Boundary');
      lines.push(`Plate Dist: ${dist.toFixed(1)}`);
    } else if (layer === LayerType.NORMAL) {
      lines.push(`Elevation: ${(elev * 100).toFixed(1)}%`);
    } else if (layer === LayerType.BIOME) {
      lines.push(`Temp: ${(temp * 100).toFixed(0)}% | Moist: ${(moist * 100).toFixed(0)}%`);
    }

    return lines;
  };

  const hoverContent = getHoverContent();

  return (
    <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-xl flex-grow flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-neutral-200 capitalize">{layer} View</h2>
        <div className="flex gap-2">
          <button 
            onClick={resetView}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm transition-colors"
            title="Reset View"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className={`relative w-full aspect-[2/1] bg-neutral-950 rounded-lg overflow-hidden border border-neutral-700 select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {isGenerating && (
          <div className="absolute inset-0 z-20 bg-neutral-900/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
            <div className="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="text-emerald-400 font-medium animate-pulse">{status}</p>
          </div>
        )}

        <div className="absolute top-4 left-4 z-30 bg-neutral-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-700/50 text-xs font-mono text-emerald-400 font-medium shadow-lg select-none">
          {viewTransform.scale.toFixed(2)}x
        </div>

        {/* Hover Inspector Tooltip */}
        {hoverContent && hoverInfo && !isDragging && (
          <div
            className="absolute z-40 pointer-events-none"
            style={{
              left: Math.min(hoverInfo.screenX + 16, (containerRef.current?.clientWidth || 400) - 200),
              top: Math.min(hoverInfo.screenY + 16, (containerRef.current?.clientHeight || 300) - 100),
            }}
          >
            <div className="bg-neutral-900/95 backdrop-blur-md border border-neutral-600/60 rounded-lg px-3 py-2 shadow-2xl text-xs font-mono space-y-0.5 min-w-[160px]">
              {hoverContent.map((line, i) => (
                <div key={i} className={i === 0 ? 'text-emerald-400 font-semibold' : 'text-neutral-300'}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Transform Container */}
        <div 
          className="absolute flex pointer-events-none"
          style={{
            top: 0,
            left: '-100%',
            width: '300%',
            height: '100%',
            transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
            transformOrigin: '33.333333% 0',
            willChange: 'transform',
          }}
        >
          <canvas 
            ref={leftRef}
            width={config.width}
            height={config.height}
            className="w-1/3 h-full object-fill"
            style={{ imageRendering: 'pixelated' }}
          />
          <canvas 
            ref={canvasRef}
            width={config.width}
            height={config.height}
            className="w-1/3 h-full object-fill"
            style={{ imageRendering: 'pixelated' }}
          />
          <canvas 
            ref={rightRef}
            width={config.width}
            height={config.height}
            className="w-1/3 h-full object-fill"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>
      
      <div className="mt-4 bg-neutral-900 p-4 rounded-lg border border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-400 mb-3">Legend</h3>
        <MapLegend 
          layer={layer} 
          planetType={config.planetType}
          vegetationHue={config.vegetationHue}
          waterHue={config.waterHue}
        />
      </div>
    </div>
  );
}
