import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Maximize, Globe2, Map as MapIcon, Cloud } from 'lucide-react';
import { LayerType, BIOME_NAMES, hasCapability, PlanetCapability, PlanetConfig } from '../lib/planet-generator/generator';
import type { PlanetSession, PlanetProbe } from '../lib/planet-generator/planetClient';
import { atmosphereFor } from '../lib/planet-generator/visualProfile';
import { GlobeTexture } from '../lib/render/planetSphere';
import { MapLegend } from './MapLegend';
import { GlobeView } from './GlobeView';

interface MapViewerProps {
  layer: LayerType;
  config: PlanetConfig;
  isGenerating: boolean;
  progress: number;
  status: string;
  session: PlanetSession | null;
  /** Compact chrome for embedding inside modals. */
  compact?: boolean;
}

interface HoverInfo { x: number; y: number; screenX: number; screenY: number; probe: PlanetProbe | null }

const LAYER_LABELS: Record<string, string> = {
  elevation: 'Elevação', heightmap: 'Mapa de Altura', tectonic: 'Placas Tectônicas', temperature: 'Temperatura',
  moisture: 'Umidade', biome: 'Biomas', normal: 'Normal Map', final: 'Superfície', movement: 'Custo de Movimento',
  fertility: 'Fertilidade', ores: 'Minérios', spices: 'Especiarias', resources: 'Recursos', fauna: 'Fauna',
};

export function MapViewer({ layer, config, isGenerating, progress, status, session, compact }: MapViewerProps) {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [baseOffset, setBaseOffset] = useState({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [mode, setMode] = useState<'map' | 'globe'>('map');
  const [cloudsOn, setCloudsOn] = useState(true);
  const [globeTex, setGlobeTex] = useState<GlobeTexture | null>(null);
  const [rendering, setRendering] = useState(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const probeSeq = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);

  // Render the requested layer in the worker, then paint the three wrap-around canvases
  useEffect(() => {
    if (!session || isGenerating) return;
    let cancelled = false;
    setRendering(true);
    session.renderLayer(layer).then(img => {
      if (cancelled) return;
      for (const c of [canvasRef.current, leftRef.current, rightRef.current]) {
        if (!c) continue;
        if (c.width !== img.width) { c.width = img.width; c.height = img.height; }
        c.getContext('2d')!.putImageData(img, 0, 0);
      }
      setGlobeTex({ width: img.width, height: img.height, data: img.data });
      setRendering(false);
    }).catch(() => setRendering(false));
    return () => { cancelled = true; };
  }, [session, layer, isGenerating]);

  useEffect(() => { setViewTransform({ x: 0, y: 0, scale: 1 }); }, [session]);

  const applyZoom = useCallback((newScale: number, centerX: number, centerY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setViewTransform(prev => {
      if (newScale === prev.scale) return prev;
      const mapX = (centerX - prev.x) / prev.scale;
      const mapY = (centerY - prev.y) / prev.scale;
      let newX = centerX - mapX * newScale;
      let newY = centerY - mapY * newScale;
      const minY = rect.height - rect.height * newScale;
      newY = Math.max(minY, Math.min(0, newY));
      const scaledWidth = rect.width * newScale;
      newX = newX % scaledWidth;
      if (newX > 0) newX -= scaledWidth;
      return { x: newX, y: newY, scale: newScale };
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mode !== 'map') return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const zoomFactor = e.deltaY * -0.002;
      setViewTransform(prev => {
        const newScale = Math.min(Math.max(1, prev.scale * (1 + zoomFactor)), 8);
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const mapX = (cx - prev.x) / prev.scale, mapY = (cy - prev.y) / prev.scale;
        let nx = cx - mapX * newScale, ny = cy - mapY * newScale;
        ny = Math.max(rect.height - rect.height * newScale, Math.min(0, ny));
        const sw = rect.width * newScale;
        nx = nx % sw; if (nx > 0) nx -= sw;
        return { x: nx, y: ny, scale: newScale };
      });
    };
    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelNative);
  }, [mode]);

  const handleExport = () => {
    const c = canvasRef.current;
    if (!c) return;
    const link = document.createElement('a');
    link.download = `planet-${config.seed}-${layer}.png`;
    link.href = c.toDataURL();
    link.click();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setBaseOffset({ x: viewTransform.x, y: viewTransform.y });
    } else if (activePointers.current.size === 2) {
      setIsDragging(false);
      const [a, b] = [...activePointers.current.values()];
      lastPinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const getMapPixel = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const mapX = (clientX - rect.left - viewTransform.x) / viewTransform.scale;
    const mapY = (clientY - rect.top - viewTransform.y) / viewTransform.scale;
    let px = Math.floor((mapX / rect.width) * config.width);
    const py = Math.floor((mapY / rect.height) * config.height);
    px = ((px % config.width) + config.width) % config.width;
    if (py < 0 || py >= config.height) return null;
    return { px, py };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (activePointers.current.size === 2 && lastPinchDistance.current !== null) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const newScale = Math.min(Math.max(1, viewTransform.scale * (distance / lastPinchDistance.current)), 8);
      applyZoom(newScale, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      lastPinchDistance.current = distance;
      return;
    }

    if (!isDragging && session) {
      const pixel = getMapPixel(e.clientX, e.clientY);
      if (pixel) {
        const seq = ++probeSeq.current;
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        session.probe(pixel.px, pixel.py).then(probe => {
          if (seq === probeSeq.current) setHoverInfo({ x: pixel.px, y: pixel.py, screenX: sx, screenY: sy, probe });
        }).catch(() => {});
      } else setHoverInfo(null);
    }

    if (isDragging) {
      let newX = baseOffset.x + (e.clientX - dragStart.x);
      let newY = baseOffset.y + (e.clientY - dragStart.y);
      newY = Math.max(rect.height - rect.height * viewTransform.scale, Math.min(0, newY));
      const sw = rect.width * viewTransform.scale;
      newX = newX % sw; if (newX > 0) newX -= sw;
      setViewTransform(prev => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinchDistance.current = null;
    setIsDragging(false);
  };

  const getHoverContent = (): string[] | null => {
    if (!hoverInfo?.probe) return null;
    const P = hoverInfo.probe;
    const pt = config.planetType;
    const lat = (0.5 - hoverInfo.y / config.height) * 180;
    const lon = (hoverInfo.x / config.width) * 360 - 180;
    const lines: string[] = [`📍 ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'L' : 'O'}`];
    if (hasCapability(pt, PlanetCapability.BIOMES)) lines.push(`🏔️ ${BIOME_NAMES[P.biome as keyof typeof BIOME_NAMES] || 'Unknown'}`);
    const isOcean = P.elevation <= config.seaLevel;
    lines.push(`Elevação: ${(P.elevation * 100).toFixed(1)}%${isOcean && pt !== 'gas-giant' ? ' (submerso)' : ''}`);
    if (layer === LayerType.TEMPERATURE || layer === LayerType.BIOME || layer === LayerType.FINAL) lines.push(`Temperatura: ${(P.temperature * 100).toFixed(0)}%  Umidade: ${(P.moisture * 100).toFixed(0)}%`);
    else if (layer === LayerType.MOISTURE) lines.push(`Umidade: ${(P.moisture * 100).toFixed(1)}%`);
    else if (layer === LayerType.MOVEMENT) lines.push(`Custo: ${P.movementCost}`);
    else if (layer === LayerType.FERTILITY) lines.push(`Fertilidade: ${(P.fertility * 100).toFixed(1)}%`);
    else if (layer === LayerType.ORES) {
      const o = P.ore;
      const tier = o >= 0.8 ? 'Cristais Raros' : o >= 0.6 ? 'Metais Preciosos' : o >= 0.35 ? 'Minerais' : o >= 0.15 ? 'Metais Básicos' : 'Estéril';
      lines.push(`Minério: ${tier} (${(o * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.SPICES) {
      const s = P.spice;
      const tier = s >= 0.75 ? 'T5 Bioluminescente' : s >= 0.5 ? 'T4 Flora Profunda' : s >= 0.25 ? 'T3 Seiva Curativa' : s >= 0.05 ? 'T1-T2 Raízes/Sementes' : 'Nenhuma';
      lines.push(`Especiaria: ${tier} (${(s * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.RESOURCES) {
      const r = P.resource;
      const tier = r >= 0.6 ? 'Madeira nobre' : r >= 0.35 ? 'Madeira / Pedra' : r >= 0.1 ? 'Pedra / Argila' : 'Nenhum';
      lines.push(`Recurso: ${tier} (${(r * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.FAUNA) {
      const f = P.fauna;
      let tier = 'Nenhuma';
      if (isOcean) tier = f >= 0.6 ? 'A4-A5 Leviatãs' : f >= 0.3 ? 'A2-A3 Predadores Marinhos' : f >= 0.05 ? 'A1 Vida de Recife' : tier;
      else tier = f >= 0.75 ? 'T9-T10 Lendas Ápice' : f >= 0.5 ? 'T5-T7 Predadores de Selva' : f >= 0.25 ? 'T4-T6 Predadores' : f >= 0.05 ? 'T1-T3 Herbívoros' : tier;
      lines.push(`Fauna: ${tier} (${(f * 100).toFixed(0)}%)`);
    } else if (layer === LayerType.TECTONIC) {
      lines.push(P.boundaryType === 1 ? 'Limite Convergente' : P.boundaryType === 2 ? 'Limite Divergente' : P.boundaryType === 3 ? 'Limite Transformante' : 'Interior da placa');
    }
    if (P.water > 2 && !isOcean) lines.push('💧 Rio');
    return lines;
  };

  const hoverContent = mode === 'map' ? getHoverContent() : null;
  const atmo = atmosphereFor(config);

  return (
    <div className={`${compact ? '' : 'bg-neutral-900/70 p-3 sm:p-4 rounded-2xl border border-white/10 shadow-xl'} flex-grow flex flex-col min-h-0`}>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h2 className="text-base sm:text-lg font-bold text-neutral-100">{LAYER_LABELS[layer] ?? layer}</h2>
        <div className="flex gap-1.5 flex-wrap">
          <div className="flex bg-black/40 border border-white/10 rounded-lg p-0.5">
            <button onClick={() => setMode('map')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${mode === 'map' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-white'}`}>
              <MapIcon className="w-3.5 h-3.5" /> Mapa
            </button>
            <button onClick={() => setMode('globe')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${mode === 'globe' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-white'}`}>
              <Globe2 className="w-3.5 h-3.5" /> Globo 3D
            </button>
          </div>
          {mode === 'globe' && session?.clouds && (
            <button onClick={() => setCloudsOn(v => !v)} title="Nuvens"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${cloudsOn ? 'bg-sky-400/15 border-sky-300/30 text-sky-200' : 'bg-black/40 border-white/10 text-neutral-400'}`}>
              <Cloud className="w-3.5 h-3.5" /> Nuvens
            </button>
          )}
          {mode === 'map' && (
            <button onClick={() => setViewTransform({ x: 0, y: 0, scale: 1 })} className="px-2.5 py-1 bg-black/40 border border-white/10 hover:bg-white/10 rounded-lg text-xs" title="Resetar visão">
              <Maximize className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-white/10 hover:bg-white/10 rounded-lg text-xs">
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full ${mode === 'globe' ? 'aspect-[2/1] min-h-[260px]' : 'aspect-[2/1]'} bg-black rounded-xl overflow-hidden border border-white/10 select-none touch-none ${mode === 'map' ? (isDragging ? 'cursor-grabbing' : 'cursor-crosshair') : ''}`}
        onPointerDown={mode === 'map' ? handlePointerDown : undefined}
        onPointerMove={mode === 'map' ? handlePointerMove : undefined}
        onPointerUp={mode === 'map' ? handlePointerUp : undefined}
        onPointerCancel={mode === 'map' ? handlePointerUp : undefined}
        onPointerLeave={mode === 'map' ? (e) => { handlePointerUp(e); setHoverInfo(null); } : undefined}
      >
        {(isGenerating || (rendering && !globeTex)) && (
          <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-16 h-16 mb-5">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
              <div className="absolute inset-3 rounded-full bg-gradient-to-br from-emerald-400/40 to-sky-500/20 animate-pulse" />
            </div>
            <div className="w-56 sm:w-64 h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-300 ease-out" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="text-emerald-300 text-xs sm:text-sm font-medium font-mono">{status || 'Renderizando…'}</p>
          </div>
        )}

        {mode === 'map' && (
          <div className="absolute top-3 left-3 z-30 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-mono text-emerald-300 pointer-events-none">
            {viewTransform.scale.toFixed(2)}×
          </div>
        )}

        {hoverContent && hoverInfo && !isDragging && (
          <div className="absolute z-40 pointer-events-none"
            style={{
              left: Math.min(hoverInfo.screenX + 16, (containerRef.current?.clientWidth || 400) - 220),
              top: Math.min(hoverInfo.screenY + 16, (containerRef.current?.clientHeight || 300) - 110),
            }}>
            <div className="bg-black/85 backdrop-blur-md border border-white/15 rounded-lg px-3 py-2 shadow-2xl text-[11px] font-mono space-y-0.5 min-w-[180px]">
              {hoverContent.map((line, i) => (
                <div key={i} className={i === 0 ? 'text-emerald-300 font-semibold' : 'text-neutral-300'}>{line}</div>
              ))}
            </div>
          </div>
        )}

        <div className="absolute flex pointer-events-none"
          style={{
            top: 0, left: '-100%', width: '300%', height: '100%',
            transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
            transformOrigin: '33.333333% 0', willChange: 'transform',
            visibility: mode === 'map' ? 'visible' : 'hidden',
          }}>
          <canvas ref={leftRef} width={config.width} height={config.height} className="w-1/3 h-full" style={{ imageRendering: 'pixelated' }} />
          <canvas ref={canvasRef} width={config.width} height={config.height} className="w-1/3 h-full" style={{ imageRendering: 'pixelated' }} />
          <canvas ref={rightRef} width={config.width} height={config.height} className="w-1/3 h-full" style={{ imageRendering: 'pixelated' }} />
        </div>

        {mode === 'globe' && (
          <GlobeView texture={globeTex} clouds={session?.clouds ?? null} cloudsOn={cloudsOn && layer === LayerType.FINAL}
            rim={atmo?.color ?? null} seed={config.seed} />
        )}
      </div>

      <div className="mt-3 bg-black/30 p-3 sm:p-4 rounded-xl border border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">Legenda</h3>
        <MapLegend layer={layer} planetType={config.planetType} vegetationHue={config.vegetationHue} waterHue={config.waterHue} />
      </div>
    </div>
  );
}
