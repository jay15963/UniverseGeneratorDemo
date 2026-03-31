import React from 'react';
import { Settings, RefreshCw, Layers, Map as MapIcon, ChevronLeft } from 'lucide-react';
import { GalaxyConfig, GalaxyShape, GalaxyLayer } from '../../lib/galaxy/types';

interface GalaxySidebarProps {
  config: GalaxyConfig;
  setConfig: React.Dispatch<React.SetStateAction<GalaxyConfig>>;
  layer: GalaxyLayer;
  setLayer: React.Dispatch<React.SetStateAction<GalaxyLayer>>;
  isGenerating: boolean;
  handleGenerate: () => void;
  onBackToMenu: () => void;
  galaxyName: string;
}

function Slider({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  const displayVal = suffix === '%' ? `${(value * 100).toFixed(0)}%` : suffix === 'x' ? `${value.toFixed(1)}x` : `${value}`;
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-400 mb-1">{label} ({displayVal})</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-emerald-500" />
    </div>
  );
}

function Dropdown({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-400 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function GalaxySidebar({ config, setConfig, layer, setLayer, isGenerating, handleGenerate, onBackToMenu, galaxyName }: GalaxySidebarProps) {
  const set = (partial: Partial<GalaxyConfig>) => setConfig(prev => ({ ...prev, ...partial }));

  return (
    <div className="lg:col-span-1 space-y-6">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl">
        <button 
          onClick={onBackToMenu}
          className="text-sm font-semibold text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar ao Menu
        </button>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2 text-fuchsia-400">
          <MapIcon className="w-6 h-6" /> Galáxia
        </h1>
        {galaxyName && (
          <p className="text-sm text-fuchsia-300/70 font-medium mb-5 ml-8">{galaxyName}</p>
        )}
        {!galaxyName && <div className="mb-6" />}
        
        <div className="space-y-4">
          {/* Seed */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Galactic Seed</label>
            <div className="flex gap-2">
              <input type="text" value={config.seed}
                onChange={(e) => set({ seed: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500 transition-colors text-white" />
              <button onClick={() => set({ seed: Math.random().toString(36).substring(2, 8) })}
                className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors text-white" title="Random Seed">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <Dropdown label="Galaxy Shape" value={config.shape}
            options={[
              { value: GalaxyShape.SPIRAL, label: '🌀 Spiral' },
              { value: GalaxyShape.BARRED_SPIRAL, label: '🌠 Barred Spiral' },
              { value: GalaxyShape.ELLIPTICAL, label: '⚪ Elliptical' },
              { value: GalaxyShape.RING, label: '🍩 Ring / Sombrero' },
              { value: GalaxyShape.IRREGULAR, label: '💥 Irregular' },
            ]}
            onChange={(v) => set({ shape: v as GalaxyShape })} />

          <Slider label="Galaxy Age" value={config.age} min={0} max={1} step={0.01}
            onChange={(v) => set({ age: v })} suffix="%" />

          <Slider label="Star Count" value={config.numStars} min={1000} max={10000} step={100}
            onChange={(v) => set({ numStars: v })} />
            
          <Slider label="Anomaly Factor" value={config.anomalyFactor} min={0} max={1} step={0.01}
            onChange={(v) => set({ anomalyFactor: v })} suffix="%" />

          <button onClick={handleGenerate} disabled={isGenerating}
            className="w-full py-3 mt-4 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all">
            {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" /> Generating...</>)
              : (<><Settings className="w-5 h-5" /> Generate Galaxy</>)}
          </button>
        </div>
      </div>

      {/* Map Layers */}
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-neutral-200">
          <Layers className="w-5 h-5" /> View Layers
        </h2>
        <div className="space-y-2">
          {Object.values(GalaxyLayer).map((l) => (
            <button key={l} onClick={() => setLayer(l)}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                layer === l
                  ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/50'
                  : 'bg-neutral-900/50 text-neutral-400 hover:bg-neutral-700 border border-transparent'
              }`}>
              {l === GalaxyLayer.SYSTEM && '✨ System View'}
              {l === GalaxyLayer.HABITABILITY && '🌱 Sweet Spot / Habitability'}
              {l === GalaxyLayer.STAR_TYPE && '⭐ Star Types'}
              {l === GalaxyLayer.DANGER && '☠️ Danger Zones (BH / NS)'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
