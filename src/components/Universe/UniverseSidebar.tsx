import React from 'react';
import { Settings2, RefreshCw, ChevronLeft, Rocket } from 'lucide-react';
import { UniverseConfig } from '../../lib/universe/types';

interface UniverseSidebarProps {
  config: UniverseConfig;
  setConfig: React.Dispatch<React.SetStateAction<UniverseConfig>>;
  isGenerating: boolean;
  handleGenerate: () => void;
  onBackToMenu: () => void;
}

export function UniverseSidebar({
  config,
  setConfig,
  isGenerating,
  handleGenerate,
  onBackToMenu,
}: UniverseSidebarProps) {

  const randomizeSeed = () => {
    setConfig({ ...config, seed: Math.random().toString(36).substring(2, 10) });
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
        <button 
          onClick={onBackToMenu}
          className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-fuchsia-500" />
            UNIVERSE ENGINE
          </h2>
          <p className="text-xs text-neutral-500 font-mono mt-1">SIMULATION PARAMETERS</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
        
        {/* Seed */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex justify-between">
            <span>Cosmic Seed</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.seed}
              onChange={(e) => setConfig({ ...config, seed: e.target.value })}
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-fuchsia-500 transition-colors"
              placeholder="Enter seed..."
            />
            <button
              onClick={randomizeSeed}
              className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-colors"
              title="Randomize Seed"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Temporal Age */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Universe Age
            </label>
            <span className="text-sm font-mono text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded">
              {Math.round(config.age * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.age}
            onChange={(e) => setConfig({ ...config, age: parseFloat(e.target.value) })}
            className="w-full accent-fuchsia-500"
          />
          <div className="flex justify-between text-[10px] text-neutral-600 font-medium px-1">
            <span>Singularity</span>
            <span>Expansion</span>
            <span>Heat Death</span>
          </div>
        </div>

        {/* Max Galaxies */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Galaxy Density
            </label>
            <span className="text-sm font-mono text-neutral-300 font-bold bg-neutral-800 px-2 py-0.5 rounded">
              {config.maxGalaxies.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min="1000"
            max="5000"
            step="100"
            value={config.maxGalaxies}
            onChange={(e) => setConfig({ ...config, maxGalaxies: parseInt(e.target.value) })}
            className="w-full accent-neutral-500"
          />
        </div>

      </div>

      {/* Action Area */}
      <div className="pt-4 border-t border-neutral-800">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`
            w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
            ${isGenerating 
              ? 'bg-neutral-800 text-neutral-500 cursor-wait' 
              : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-fuchsia-900/20 hover:shadow-fuchsia-900/40 hover:-translate-y-0.5'
            }
          `}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              SIMULATING COSMOS...
            </>
          ) : (
            <>
              <Settings2 className="w-5 h-5" />
              GENERATE UNIVERSE
            </>
          )}
        </button>
      </div>

    </div>
  );
}
