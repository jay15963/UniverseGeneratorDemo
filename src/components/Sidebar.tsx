import React from 'react';
import { Settings, RefreshCw, Layers, Map as MapIcon } from 'lucide-react';
import { PlanetConfig, PlanetType, LayerType, hasCapability, PlanetCapability } from '../lib/planet-generator/generator';

// Layer availability per planet type category
const ALL_LAYERS = Object.values(LayerType);
const ROCKY_LAYERS = [LayerType.FINAL, LayerType.ELEVATION, LayerType.HEIGHTMAP, LayerType.TECTONIC, LayerType.TEMPERATURE, LayerType.NORMAL, LayerType.ORES, LayerType.RESOURCES];
const ICE_LAYERS = [LayerType.FINAL, LayerType.ELEVATION, LayerType.HEIGHTMAP, LayerType.TECTONIC, LayerType.TEMPERATURE, LayerType.NORMAL, LayerType.ORES];
const GAS_LAYERS = [LayerType.FINAL, LayerType.TEMPERATURE, LayerType.NORMAL];
const OCEAN_LAYERS = [LayerType.FINAL, LayerType.ELEVATION, LayerType.HEIGHTMAP, LayerType.TEMPERATURE, LayerType.NORMAL, LayerType.FAUNA];

function getLayersForType(t: PlanetType): LayerType[] {
  return Object.values(LayerType).filter(l => {
    if (t === PlanetType.GAS_GIANT) {
      return [LayerType.FINAL, LayerType.TEMPERATURE, LayerType.NORMAL].includes(l);
    }
    if (l === LayerType.BIOME) return hasCapability(t, PlanetCapability.BIOMES);
    if (l === LayerType.FERTILITY) return hasCapability(t, PlanetCapability.FERTILITY);
    if (l === LayerType.FAUNA) return hasCapability(t, PlanetCapability.FAUNA);
    if (l === LayerType.RESOURCES) return hasCapability(t, PlanetCapability.RESOURCES);
    if (l === LayerType.SPICES) return hasCapability(t, PlanetCapability.SPICES);
    if (l === LayerType.MOVEMENT) return hasCapability(t, PlanetCapability.BIOMES);
    
    // Default layers for all solid planets
    return true;
  });
}

interface SidebarProps {
  config: PlanetConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlanetConfig>>;
  layer: LayerType;
  setLayer: React.Dispatch<React.SetStateAction<LayerType>>;
  isGenerating: boolean;
  handleGenerate: () => void;
  onBackToMenu: () => void;
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

export function Sidebar({ config, setConfig, layer, setLayer, isGenerating, handleGenerate, onBackToMenu }: SidebarProps) {
  const availableLayers = getLayersForType(config.planetType);
  const set = (partial: Partial<PlanetConfig>) => setConfig(prev => ({ ...prev, ...partial }));

  const handleTypeChange = (newType: PlanetType) => {
    set({ planetType: newType });
    const newLayers = getLayersForType(newType);
    if (!newLayers.includes(layer)) setLayer(LayerType.FINAL);
  };

  const pt = config.planetType;
  const hasOcean = [PlanetType.EARTH_LIKE, PlanetType.ALIEN_LIFE, PlanetType.SWAMP_WORLD, PlanetType.OCEAN_WORLD, PlanetType.TIDALLY_LOCKED, PlanetType.SWAMP_WORLD].includes(pt);
  const hasMoisture = hasCapability(pt, PlanetCapability.BIOMES);
  const isGas = pt === PlanetType.GAS_GIANT;

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl flex-1 overflow-y-auto custom-scrollbar">
        <button 
          onClick={onBackToMenu}
          className="text-sm font-semibold text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-4"
        >
          &larr; Voltar ao Menu
        </button>
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-emerald-400">
          <MapIcon className="w-6 h-6" /> PlanetGen
        </h1>
        
        <div className="space-y-4">
          {/* ... existing content ... */}
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

          {/* Planet Type */}
          <Dropdown label="Planet Type" value={pt}
            options={[
              { value: PlanetType.EARTH_LIKE, label: '🌍 Earth-Like' },
              { value: PlanetType.ALIEN_LIFE, label: '👽 Alien Life' },
              { value: PlanetType.ARID, label: '🟠 Arid (Mars)' },
              { value: PlanetType.TOXIC_ATMOSPHERE, label: '🟡 Toxic Atmosphere (Venus)' },
              { value: PlanetType.ROCKY_AIRLESS, label: '🌑 Rocky Airless (Moon)' },
              { value: PlanetType.GLACIAL, label: '🧊 Glacial (Pluto)' },
              { value: PlanetType.FROZEN_OCEAN, label: '❄️ Frozen Ocean (Europa)' },
              { value: PlanetType.GAS_GIANT, label: '🪐 Gas Giant' },
              { value: PlanetType.OCEAN_WORLD, label: '🌊 Ocean World' },
              { value: PlanetType.LAVA_WORLD, label: '🌋 Lava World' },
              { value: PlanetType.CARBON_WORLD, label: '💎 Carbon World' },
              { value: PlanetType.SWAMP_WORLD, label: '🍄 Swamp World' },
              { value: PlanetType.ASH_WORLD, label: '🕳️ Ash World' },
              { value: PlanetType.TIDALLY_LOCKED, label: '🌗 Tidally Locked' },
            ]}
            onChange={(v) => handleTypeChange(v as PlanetType)} />

          {/* Resolution */}
          <Dropdown label="Resolution" value={`${config.width}x${config.height}`}
            options={[
              { value: '512x256', label: '512 × 256 (Fast)' },
              { value: '1024x512', label: '1024 × 512 (Standard)' },
              { value: '2048x1024', label: '2048 × 1024 (Detailed)' },
              { value: '4096x2048', label: '4096 × 2048 (4K Ultra)' },
              { value: '8192x4096', label: '8192 × 4096 (8K Extreme)' },
            ]}
            onChange={(v) => { const [w, h] = v.split('x').map(Number); set({ width: w, height: h }); }} />

          {/* === Shared Sliders === */}
          {!isGas && (
            <Slider label="Tectonic Plates" value={config.numPlates} min={5} max={60} step={1}
              onChange={(v) => set({ numPlates: v })} />
          )}

          {hasOcean && (
            <Slider label="Sea Level" value={config.seaLevel} min={0.1} max={0.9} step={0.01}
              onChange={(v) => set({ seaLevel: v })} suffix="%" />
          )}

          <Slider label="Temperature" value={config.baseTemperature} min={0} max={1} step={0.01}
            onChange={(v) => set({ baseTemperature: v })} suffix="%" />

          {hasMoisture && (
            <Slider label="Moisture" value={config.baseMoisture} min={0} max={1} step={0.01}
              onChange={(v) => set({ baseMoisture: v })} suffix="%" />
          )}

          {!isGas && (
            <Slider label="Planet Size" value={config.planetSize} min={0.1} max={3} step={0.1}
              onChange={(v) => set({ planetSize: v })} suffix="x" />
          )}

          {/* === Type-Specific Sliders === */}

          {/* Rocky Airless */}
          {pt === PlanetType.ROCKY_AIRLESS && (<>
            <Slider label="Crater Density" value={config.craterDensity} min={0} max={1} step={0.01}
              onChange={(v) => set({ craterDensity: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'gray', label: '🌑 Gray (Lunar)' },
                { value: 'reddish', label: '🔴 Reddish' },
                { value: 'yellowish', label: '🟡 Yellowish' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Arid */}
          {pt === PlanetType.ARID && (<>
            <Slider label="Dust Storm Intensity" value={config.dustStormIntensity} min={0} max={1} step={0.01}
              onChange={(v) => set({ dustStormIntensity: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'reddish', label: '🔴 Reddish (Mars)' },
                { value: 'yellowish', label: '🟡 Yellowish' },
                { value: 'orange', label: '🟠 Orange' },
                { value: 'gray', label: '⚪ Grayish' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Toxic Atmosphere */}
          {pt === PlanetType.TOXIC_ATMOSPHERE && (<>
            <Slider label="Volcanic Activity" value={config.volcanicActivity} min={0} max={1} step={0.01}
              onChange={(v) => set({ volcanicActivity: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'yellowish', label: '🟡 Yellowish (Venus)' },
                { value: 'reddish', label: '🔴 Reddish' },
                { value: 'gray', label: '⚪ Gray' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Glacial */}
          {pt === PlanetType.GLACIAL && (<>
            <Slider label="Ice Fracture Density" value={config.iceFractureDensity} min={0} max={1} step={0.01}
              onChange={(v) => set({ iceFractureDensity: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'white-blue', label: '🔵 White-Blue' },
                { value: 'pinkish', label: '🩷 Pinkish (Pluto)' },
                { value: 'pale-blue', label: '💠 Pale Blue' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Gas Giant */}
          {pt === PlanetType.GAS_GIANT && (<>
            <Slider label="Band Contrast" value={config.bandContrast} min={0} max={1} step={0.01}
              onChange={(v) => set({ bandContrast: v })} suffix="%" />
            <Slider label="Storm Frequency" value={config.stormFrequency} min={0} max={1} step={0.01}
              onChange={(v) => set({ stormFrequency: v })} suffix="%" />
            <Dropdown label="Color Palette" value={config.colorPalette}
              options={[
                { value: 'jovian', label: '🟠 Jovian (Jupiter)' },
                { value: 'saturnian', label: '🟡 Saturnian' },
                { value: 'uranian', label: '🔵 Uranian (Ice Giant)' },
                { value: 'alien-purple', label: '🟣 Alien Purple' },
                { value: 'crimson', label: '🔴 Crimson' },
              ]}
              onChange={(v) => set({ colorPalette: v })} />
          </>)}

          {/* Alien Life */}
          {pt === PlanetType.ALIEN_LIFE && (<>
            <Dropdown label="Vegetation Hue" value={config.vegetationHue}
              options={[
                { value: 'purple', label: '🟣 Purple' },
                { value: 'red', label: '🔴 Red/Crimson' },
                { value: 'blue', label: '🔵 Blue' },
                { value: 'cyan', label: '🩵 Cyan' },
                { value: 'green', label: '🟢 Green (Earth-Like)' },
                { value: 'orange', label: '🟠 Orange' },
              ]}
              onChange={(v) => set({ vegetationHue: v })} />
            <Dropdown label="Water Hue" value={config.waterHue}
              options={[
                { value: 'green', label: '🟢 Green' },
                { value: 'amber', label: '🟡 Amber' },
                { value: 'magenta', label: '🩷 Magenta' },
                { value: 'teal', label: '🩵 Teal' },
                { value: 'dark', label: '⬛ Dark/Inky' },
              ]}
              onChange={(v) => set({ waterHue: v })} />
          </>)}

          {/* Lava World */}
          {pt === PlanetType.LAVA_WORLD && (<>
            <Slider label="Volcanic Activity" value={config.volcanicActivity} min={0} max={1} step={0.01}
              onChange={(v) => set({ volcanicActivity: v })} suffix="%" />
            <Slider label="Crust Age" value={config.crustAge} min={0} max={1} step={0.01}
              onChange={(v) => set({ crustAge: v })} suffix="%" />
          </>)}

          {/* Ocean World */}
          {pt === PlanetType.OCEAN_WORLD && (
            <Slider label="Island Density" value={config.islandDensity} min={0} max={0.5} step={0.01}
              onChange={(v) => set({ islandDensity: v })} suffix="%" />
          )}

          {/* Frozen Ocean */}
          {pt === PlanetType.FROZEN_OCEAN && (<>
            <Slider label="Lineae Density" value={config.lineaeDensity} min={0} max={1} step={0.01}
              onChange={(v) => set({ lineaeDensity: v })} suffix="%" />
            <Slider label="Ice Thickness" value={config.iceThickness} min={0.1} max={1} step={0.01}
              onChange={(v) => set({ iceThickness: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'white', label: '⬜ White' },
                { value: 'bluish', label: '🔵 Bluish' },
                { value: 'brownish', label: '🟤 Brown-Streaked (Europa)' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Tidally Locked */}
          {pt === PlanetType.TIDALLY_LOCKED && (<>
            <Slider label="Star Intensity" value={config.starIntensity} min={0.3} max={1} step={0.01}
              onChange={(v) => set({ starIntensity: v })} suffix="%" />
            <Slider label="Twilight Width" value={config.twilightWidth} min={0.05} max={0.5} step={0.01}
              onChange={(v) => set({ twilightWidth: v })} suffix="%" />
          </>)}

          {/* Carbon World */}
          {pt === PlanetType.CARBON_WORLD && (<>
            <Slider label="Crystal Density" value={config.crystalDensity} min={0} max={1} step={0.01}
              onChange={(v) => set({ crystalDensity: v })} suffix="%" />
            <Slider label="Hydrocarbon Lakes" value={config.hydrocarbonLakes} min={0} max={1} step={0.01}
              onChange={(v) => set({ hydrocarbonLakes: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'graphite', label: '⬛ Graphite' },
                { value: 'obsidian', label: '🖤 Obsidian' },
                { value: 'amber', label: '🟡 Amber-Carbon' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          {/* Swamp World */}
          {pt === PlanetType.SWAMP_WORLD && (<>
            <Slider label="Bioluminescence" value={config.bioluminescence} min={0} max={1} step={0.01}
              onChange={(v) => set({ bioluminescence: v })} suffix="%" />
            <Slider label="Water Level" value={config.waterLevel} min={0.2} max={0.9} step={0.01}
              onChange={(v) => set({ waterLevel: v })} suffix="%" />
          </>)}

          {/* Ash World */}
          {pt === PlanetType.ASH_WORLD && (<>
            <Slider label="Ash Depth" value={config.ashDepth} min={0} max={1} step={0.01}
              onChange={(v) => set({ ashDepth: v })} suffix="%" />
            <Slider label="Ember Activity" value={config.emberActivity} min={0} max={1} step={0.01}
              onChange={(v) => set({ emberActivity: v })} suffix="%" />
            <Dropdown label="Surface Hue" value={config.surfaceHue}
              options={[
                { value: 'gray', label: '⚪ Light Ash' },
                { value: 'dark-gray', label: '⬛ Dark Ash' },
                { value: 'yellowish', label: '🟡 Sulfuric Ash' },
              ]}
              onChange={(v) => set({ surfaceHue: v })} />
          </>)}

          <button onClick={handleGenerate} disabled={isGenerating}
            className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all shrink-0">
            {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" /> Generating...</>)
              : (<><Settings className="w-5 h-5" /> Generate Planet</>)}
          </button>
        </div>
      </div>

      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl shrink-0">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-neutral-200">
          <Layers className="w-5 h-5" /> Map Layers
        </h2>
        <div className="space-y-2">
          {availableLayers.map((l) => (
            <button key={l} onClick={() => setLayer(l)}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                layer === l
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-neutral-900/50 text-neutral-400 hover:bg-neutral-700 border border-transparent'
              }`}>
              {l.charAt(0).toUpperCase() + l.slice(1)} Map
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
