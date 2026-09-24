import React, { useState, useEffect, useMemo } from 'react';
import { X, Layers, Info } from 'lucide-react';
import { CelestialBody } from '../../lib/solar-system/types';
import { MapViewer } from '../MapViewer';
import { LayerType, hasCapability, PlanetCapability } from '../../lib/planet-generator/generator';
import { openPlanetSession, PlanetSession } from '../../lib/planet-generator/planetClient';
import { PlanetPreview } from './PlanetPreview';
import { bodyStats, PLANET_TYPE_NAMES } from '../../lib/solar-system/bodyInfo';

interface SurfaceModalProps {
  body: CelestialBody;
  onClose: () => void;
}

const LAYER_LABELS: Record<string, string> = {
  final: 'Superfície', biome: 'Biomas', elevation: 'Elevação', heightmap: 'Altura', tectonic: 'Tectônica',
  temperature: 'Temperatura', moisture: 'Umidade', normal: 'Relevo', movement: 'Movimento', fertility: 'Fertilidade',
  ores: 'Minérios', spices: 'Especiarias', resources: 'Recursos', fauna: 'Fauna',
};

export function SurfaceModal({ body, onClose }: SurfaceModalProps) {
  const [layer, setLayer] = useState<LayerType>(LayerType.FINAL);
  const [isGenerating, setIsGenerating] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Inicializando superfície em alta resolução...');
  const [session, setSession] = useState<PlanetSession | null>(null);

  // High resolution for the detailed view; generation runs in a dedicated worker
  const config = useMemo(() => ({ ...body.planetConfig!, width: 2048, height: 1024 }), [body]);

  useEffect(() => {
    setIsGenerating(true);
    setSession(null);
    const job = openPlanetSession(config, (p, s) => { setProgress(p); setStatus(s); });
    let live: PlanetSession | null = null;
    job.ready.then(s => { live = s; setSession(s); setIsGenerating(false); }).catch(() => {});
    return () => { job.cancel(); live?.dispose(); };
  }, [config]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const layers = Object.values(LayerType).filter(l => {
    const pt = config.planetType;
    if (l === LayerType.BIOME) return hasCapability(pt, PlanetCapability.BIOMES);
    if (l === LayerType.FERTILITY) return hasCapability(pt, PlanetCapability.FERTILITY);
    if (l === LayerType.FAUNA) return hasCapability(pt, PlanetCapability.FAUNA);
    if (l === LayerType.RESOURCES) return hasCapability(pt, PlanetCapability.RESOURCES);
    if (l === LayerType.SPICES) return hasCapability(pt, PlanetCapability.SPICES);
    if (l === LayerType.MOVEMENT) return hasCapability(pt, PlanetCapability.BIOMES);
    return true;
  });
  const stats = bodyStats(body);

  return (
    <div className="fixed inset-0 z-[100] bg-[#03050b]/95 backdrop-blur-xl flex flex-col p-3 sm:p-5 lg:p-8 overflow-y-auto lg:overflow-hidden">
      <div className="flex justify-between items-center mb-3 sm:mb-5 gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <PlanetPreview body={body} size={56} />
          <div className="overflow-hidden">
            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight truncate">{body.name}</h2>
            <p className="text-emerald-300/80 text-[10px] sm:text-xs font-mono tracking-[0.2em] uppercase truncate">
              {PLANET_TYPE_NAMES[config.planetType] ?? config.planetType} · Mapa de Superfície
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 sm:p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-white transition-all shrink-0" title="Fechar (Esc)">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6 min-h-0">
        <div className="lg:col-span-1 flex flex-col gap-3 lg:overflow-y-auto lg:pr-1 no-scrollbar order-2 lg:order-1">
          <div className="bg-white/[0.03] p-3 sm:p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 text-neutral-500 mb-3 text-[10px] font-bold uppercase tracking-[0.2em]">
              <Layers className="w-3.5 h-3.5" /> Camadas
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-2 gap-1.5">
              {layers.map(l => (
                <button key={l} onClick={() => setLayer(l)}
                  className={`px-2.5 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-all text-left truncate
                    ${layer === l ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
                  {LAYER_LABELS[l] ?? l}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/[0.03] p-3 sm:p-4 rounded-2xl border border-white/5">
            <div className="text-neutral-500 mb-2 text-[10px] font-bold uppercase tracking-[0.2em]">Leitura do Scanner</div>
            {stats.map(s => (
              <div key={s.label} className="flex justify-between gap-2 border-b border-white/5 py-1.5 text-xs">
                <span className="text-neutral-500">{s.label}</span>
                <span className="font-mono text-right" style={{ color: s.color ?? '#e5e5e5' }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div className="hidden lg:block bg-white/[0.02] p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 text-neutral-500 mb-2 text-[10px] font-bold uppercase tracking-[0.2em]">
              <Info className="w-3.5 h-3.5" /> Dicas
            </div>
            <ul className="text-xs text-neutral-400 space-y-1.5">
              <li>• Roda do mouse / pinça para zoom</li>
              <li>• Arraste para navegar — o mapa dá a volta no planeta</li>
              <li>• Passe o mouse para inspecionar cada ponto</li>
              <li>• Use <b className="text-neutral-200">Globo 3D</b> para girar o planeta</li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col min-h-0 order-1 lg:order-2 lg:overflow-y-auto no-scrollbar">
          <MapViewer layer={layer} config={config} isGenerating={isGenerating} progress={progress} status={status} session={session} compact />
        </div>
      </div>
    </div>
  );
}
