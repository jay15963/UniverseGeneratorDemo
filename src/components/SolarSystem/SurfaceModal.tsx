import React, { useState, useEffect, useRef } from 'react';
import { X, Layers, Info } from 'lucide-react';
import { CelestialBody } from '../../lib/solar-system/types';
import { MapViewer } from '../MapViewer';
import { PlanetGenerator, LayerType, hasCapability, PlanetCapability } from '../../lib/planet-generator/generator';

interface SurfaceModalProps {
  body: CelestialBody;
  onClose: () => void;
}

export function SurfaceModal({ body, onClose }: SurfaceModalProps) {
  const [layer, setLayer] = useState<LayerType>(LayerType.FINAL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generatorRef = useRef<PlanetGenerator | null>(null);

  // Use the planetConfig from the celestial body, but force high resolution for "Detailed" view
  const config = { 
    ...body.planetConfig!,
    width: 2048,
    height: 1024
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress(0);
    setStatus('Initializing High-Res Surface...');
    
    // Defer to allow UI update
    setTimeout(async () => {
      const generator = new PlanetGenerator(config);
      generatorRef.current = generator;
      
      await generator.generate((p, s) => {
        setProgress(p);
        setStatus(s);
      });
      
      renderLayer(layer);
      setIsGenerating(false);
    }, 50);
  };

  const renderLayer = (l: LayerType) => {
    if (!generatorRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    generatorRef.current.render(ctx, l);
  };

  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id]);

  useEffect(() => {
    renderLayer(layer);
  }, [layer]);

  // Handle escape key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col p-4 lg:p-8 overflow-hidden animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/20 shadow-glow shrink-0" style={{ backgroundColor: body.baseColor }} />
          <div className="overflow-hidden">
            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">{body.name}</h2>
            <p className="text-emerald-400 text-[10px] sm:text-sm font-mono tracking-wider uppercase opacity-80 truncate">
              {body.planetConfig?.planetType.replace('-', ' ')} Surface
            </p>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="p-2 sm:p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-white transition-all shrink-0"
          title="Fechar Visualização"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </div>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        
        {/* Sidebar Controls */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto lg:pr-2 no-scrollbar">
          
          <div className="bg-neutral-800/50 p-4 sm:p-5 rounded-2xl border border-white/5 space-y-4 sm:space-y-6">
            <div className="flex items-center gap-2 text-white/50 mb-1 sm:mb-2 text-xs font-bold uppercase tracking-widest shrink-0">
              <Layers className="w-4 h-4" />
              <span>Camadas</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 gap-1.5 sm:gap-2">
              {Object.values(LayerType).filter(l => {
                const pt = config.planetType;
                if (l === LayerType.BIOME) return hasCapability(pt, PlanetCapability.BIOMES);
                if (l === LayerType.FERTILITY) return hasCapability(pt, PlanetCapability.FERTILITY);
                if (l === LayerType.FAUNA) return hasCapability(pt, PlanetCapability.FAUNA);
                if (l === LayerType.RESOURCES) return hasCapability(pt, PlanetCapability.RESOURCES);
                if (l === LayerType.SPICES) return hasCapability(pt, PlanetCapability.SPICES);
                return true;
              }).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayer(l)}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-medium transition-all text-left flex items-center justify-between group
                    ${layer === l 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 translate-x-1' 
                      : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'}`}
                >
                  <span className="capitalize">{l.replace('-', ' ')}</span>
                  {layer === l && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden sm:block bg-neutral-800/30 p-5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 text-white/50 mb-3">
              <Info className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Dicas</span>
            </div>
            <ul className="text-xs text-neutral-400 space-y-2">
              <li>• Use **dois dedos** para dar zoom no mapa.</li>
              <li>• **Arraste** para navegar pela superfície.</li>
              <li>• A geração é **infinita horizontalmente**.</li>
            </ul>
          </div>
        </div>

        {/* Main Map Area */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <MapViewer 
            layer={layer}
            config={config}
            isGenerating={isGenerating}
            progress={progress}
            status={status}
            canvasRef={canvasRef}
            generatorRef={generatorRef}
          />
        </div>
      </div>
    </div>
  );
}
