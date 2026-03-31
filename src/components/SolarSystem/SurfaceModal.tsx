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
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 shadow-glow" style={{ backgroundColor: body.baseColor }} />
          <div>
            <h2 className="text-2xl font-bold text-white leading-tight">{body.name}</h2>
            <p className="text-emerald-400 text-sm font-mono tracking-wider uppercase opacity-80">
              {body.planetConfig?.planetType.replace('-', ' ')} Surface Detail
            </p>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-white transition-all hover:rotate-90 group"
          title="Fechar Visualização"
        >
          <X className="w-6 h-6 group-hover:scale-110" />
        </button>
      </div>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        
        {/* Sidebar Controls */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          
          <div className="bg-neutral-800/50 p-5 rounded-2xl border border-white/5 space-y-6">
            <div className="flex items-center gap-2 text-white/50 mb-2">
              <Layers className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Camadas de Visualização</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
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
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left flex items-center justify-between group
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

          <div className="bg-neutral-800/30 p-5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 text-white/50 mb-3">
              <Info className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Dicas</span>
            </div>
            <ul className="text-xs text-neutral-400 space-y-2">
              <li>• Use o **scroll** do mouse para dar zoom no mapa.</li>
              <li>• **Clique e arraste** para navegar pela superfície.</li>
              <li>• A geração é **infinita horizontalmente** (wrap-around).</li>
              <li>• Passe o mouse sobre o mapa para ver **estatísticas locais**.</li>
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
