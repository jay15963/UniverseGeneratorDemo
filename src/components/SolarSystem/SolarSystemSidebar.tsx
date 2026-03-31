import React from 'react';
import { Settings, RefreshCw, Sun, Map as MapIcon } from 'lucide-react';
import { SolarSystemConfig, StarClass } from '../../lib/solar-system/types';

interface SidebarProps {
  config: SolarSystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SolarSystemConfig>>;
  isGenerating: boolean;
  handleGenerate: () => void;
  onBackToMenu: () => void;
  showZones: boolean;
  setShowZones: (val: boolean) => void;
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

export function SolarSystemSidebar({ config, setConfig, isGenerating, handleGenerate, onBackToMenu, showZones, setShowZones }: SidebarProps) {
  const set = (partial: Partial<SolarSystemConfig>) => setConfig(prev => ({ ...prev, ...partial }));

  return (
    <div className="lg:col-span-1 space-y-6">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl overflow-y-auto max-h-[90vh]">
        <button 
          onClick={onBackToMenu}
          className="text-sm font-semibold text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-4"
        >
          &larr; Voltar ao Menu
        </button>
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-emerald-400">
          <Sun className="w-6 h-6" /> SystemStar
        </h1>
        
        <div className="space-y-4">
          {/* Seed */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Seed</label>
            <div className="flex gap-2">
              <input type="text" value={config.seed}
                onChange={(e) => set({ seed: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
              <button onClick={() => set({ seed: Math.random().toString(36).substring(2, 8) })}
                className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors" title="Random Seed">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <Dropdown label="Classe da Estrela" value={config.starClass}
            options={[
              { value: 'O', label: 'Gigante Azul (O)' },
              { value: 'B', label: 'Azul-Branca (B)' },
              { value: 'A', label: 'Branca (A)' },
              { value: 'F', label: 'Amarela-Branca (F)' },
              { value: 'G', label: 'Anã Amarela (G)' },
              { value: 'K', label: 'Laranja (K)' },
              { value: 'M', label: 'Anã Vermelha (M)' },
            ]}
            onChange={(v) => set({ starClass: v as StarClass })} />

          <Dropdown label="Sistema Binário" value={config.isBinary ? 'yes' : 'no'}
            options={[
              { value: 'no', label: 'Não (1 Estrela)' },
              { value: 'yes', label: 'Sim (2 Estrelas)' },
            ]}
            onChange={(v) => set({ isBinary: v === 'yes' })} />

          <Slider 
            label="Idade do Sistema" 
            value={config.systemAge} 
            min={0} max={1} step={0.05}
            onChange={(v) => set({ systemAge: v })} 
            suffix="%" 
          />
          
          <Slider 
            label="Número de Planetas" 
            value={config.numPlanets} 
            min={1} max={18} step={1}
            onChange={(v) => set({ numPlanets: v })} 
          />

          <Slider 
            label="% Rochosos/Gasosos" 
            value={config.rockyPercentage} 
            min={0} max={1} step={0.05}
            onChange={(v) => set({ rockyPercentage: v })} 
            suffix="%" 
          />

          <Slider 
            label="Chance de Vida (Alien/Earth)" 
            value={config.lifeChance} 
            min={0} max={1} step={0.05}
            onChange={(v) => set({ lifeChance: v })} 
            suffix="%" 
          />

          <Slider 
            label="Quantidade de Luas" 
            value={config.numMoons} 
            min={0} max={50} step={1}
            onChange={(v) => set({ numMoons: v })} 
          />

          <Slider 
            label="Cinturões de Asteroides" 
            value={config.numAsteroidBelts} 
            min={0} max={3} step={1}
            onChange={(v) => set({ numAsteroidBelts: v })} 
          />

          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              id="showZones" 
              checked={showZones} 
              onChange={(e) => setShowZones(e.target.checked)} 
              className="w-4 h-4 accent-emerald-500 rounded border-neutral-700 bg-neutral-900 cursor-pointer" 
            />
            <label htmlFor="showZones" className="text-sm font-medium text-neutral-300 cursor-pointer">
              Exibir Zonas de Temperatura
            </label>
          </div>

          <button onClick={handleGenerate} disabled={isGenerating}
            className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all">
            {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" /> Gerando...</>)
              : (<><Settings className="w-5 h-5" /> Gerar Sistema</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
