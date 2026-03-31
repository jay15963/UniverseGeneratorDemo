import { LayerType, PlanetType, hasCapability, PlanetCapability } from '../lib/planet-generator/generator';

interface MapLegendProps {
  layer: LayerType;
  planetType?: PlanetType;
  vegetationHue?: string;
  waterHue?: string;
}

// Returns hue-shifted biome colors for Alien Life planets
function getAlienBiomeColors(vh: string) {
  // Map vegetation hue to RGB tint multipliers for forest/grass/savanna
  let forest: string, grass: string, savanna: string, taiga: string, tempRain: string, seasonal: string, steppe: string;
  
  if (vh === 'purple') {
    forest = 'rgb(80, 30, 100)';
    tempRain = 'rgb(60, 40, 90)';
    seasonal = 'rgb(100, 55, 110)';
    grass = 'rgb(130, 100, 140)';
    savanna = 'rgb(140, 110, 130)';
    taiga = 'rgb(70, 50, 90)';
    steppe = 'rgb(120, 100, 130)';
  } else if (vh === 'red') {
    forest = 'rgb(120, 30, 25)';
    tempRain = 'rgb(100, 40, 35)';
    seasonal = 'rgb(140, 60, 40)';
    grass = 'rgb(160, 100, 80)';
    savanna = 'rgb(170, 110, 70)';
    taiga = 'rgb(90, 50, 45)';
    steppe = 'rgb(150, 105, 85)';
  } else if (vh === 'blue') {
    forest = 'rgb(30, 50, 110)';
    tempRain = 'rgb(40, 60, 100)';
    seasonal = 'rgb(50, 70, 120)';
    grass = 'rgb(100, 120, 150)';
    savanna = 'rgb(110, 125, 140)';
    taiga = 'rgb(40, 60, 95)';
    steppe = 'rgb(95, 110, 140)';
  } else if (vh === 'cyan') {
    forest = 'rgb(20, 100, 110)';
    tempRain = 'rgb(30, 90, 100)';
    seasonal = 'rgb(40, 110, 110)';
    grass = 'rgb(90, 140, 140)';
    savanna = 'rgb(100, 145, 130)';
    taiga = 'rgb(30, 80, 90)';
    steppe = 'rgb(85, 130, 130)';
  } else if (vh === 'orange') {
    forest = 'rgb(130, 70, 20)';
    tempRain = 'rgb(110, 65, 25)';
    seasonal = 'rgb(145, 85, 30)';
    grass = 'rgb(160, 130, 75)';
    savanna = 'rgb(170, 140, 65)';
    taiga = 'rgb(100, 65, 30)';
    steppe = 'rgb(150, 125, 80)';
  } else { // green (Earth-like) 
    forest = 'rgb(11, 102, 35)';
    tempRain = 'rgb(34, 139, 34)';
    seasonal = 'rgb(107, 142, 35)';
    grass = 'rgb(140, 170, 90)';
    savanna = 'rgb(170, 186, 60)';
    taiga = 'rgb(46, 113, 80)';
    steppe = 'rgb(130, 140, 90)';
  }

  return { forest, tempRain, seasonal, grass, savanna, taiga, steppe };
}

export function MapLegend({ layer, planetType, vegetationHue, waterHue }: MapLegendProps) {
  const pt = planetType || PlanetType.EARTH_LIKE;
  
  if (layer === LayerType.BIOME || layer === LayerType.FINAL) {
    if (!hasCapability(pt, PlanetCapability.BIOMES)) return null;
    const isAlien = pt === PlanetType.ALIEN_LIFE;
    
    if (isAlien) {
      const vh = vegetationHue || 'purple';
      const c = getAlienBiomeColors(vh);
      
      // Alien water colors for ocean legend
      let deepOcean: string, shallowOcean: string;
      const wh = waterHue || 'green';
      if (wh === 'green') { deepOcean = 'rgb(10, 60, 30)'; shallowOcean = 'rgb(30, 140, 80)'; }
      else if (wh === 'amber') { deepOcean = 'rgb(80, 65, 15)'; shallowOcean = 'rgb(160, 130, 40)'; }
      else if (wh === 'magenta') { deepOcean = 'rgb(70, 15, 55)'; shallowOcean = 'rgb(140, 40, 120)'; }
      else if (wh === 'dark') { deepOcean = 'rgb(8, 10, 15)'; shallowOcean = 'rgb(20, 25, 35)'; }
      else { deepOcean = 'rgb(15, 65, 70)'; shallowOcean = 'rgb(40, 150, 160)'; } // teal
      
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
          <LegendItem color="rgb(200, 220, 255)" label="Sea Ice" />
          <LegendItem color={deepOcean} label="Deep Ocean" />
          <LegendItem color={shallowOcean} label="Shallow Ocean" />
          <LegendItem color={c.forest} label="Tropical Rainforest" />
          <LegendItem color={c.savanna} label="Savanna" />
          <LegendItem color="rgb(200, 180, 145)" label="Subtropical Desert" />
          <LegendItem color={c.tempRain} label="Temperate Rainforest" />
          <LegendItem color={c.seasonal} label="Seasonal Forest" />
          <LegendItem color={c.grass} label="Grassland" />
          <LegendItem color="rgb(190, 175, 140)" label="Cold Desert" />
          <LegendItem color={c.taiga} label="Taiga" />
          <LegendItem color={c.steppe} label="Steppe" />
          <LegendItem color="rgb(240, 240, 255)" label="Snow / Ice" />
          <LegendItem color="rgb(180, 180, 190)" label="Tundra" />
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
        <LegendItem color="rgb(200, 220, 255)" label="Sea Ice" />
        <LegendItem color="rgb(10, 40, 120)" label="Deep Ocean" />
        <LegendItem color="rgb(10, 40, 255)" label="Shallow Ocean" />
        <LegendItem color="rgb(11, 102, 35)" label="Tropical Rainforest" />
        <LegendItem color="rgb(170, 186, 60)" label="Savanna" />
        <LegendItem color="rgb(237, 201, 175)" label="Subtropical Desert" />
        <LegendItem color="rgb(34, 139, 34)" label="Temperate Rainforest" />
        <LegendItem color="rgb(107, 142, 35)" label="Seasonal Forest" />
        <LegendItem color="rgb(189, 183, 107)" label="Grassland" />
        <LegendItem color="rgb(210, 180, 140)" label="Cold Desert" />
        <LegendItem color="rgb(46, 113, 80)" label="Taiga" />
        <LegendItem color="rgb(160, 160, 130)" label="Steppe" />
        <LegendItem color="rgb(240, 240, 255)" label="Snow / Ice" />
        <LegendItem color="rgb(180, 180, 190)" label="Tundra" />
      </div>
    );
  }

  if (layer === LayerType.TECTONIC) {
    return (
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="rgb(255, 0, 0)" label="Convergent Boundary" />
        <LegendItem color="rgb(0, 255, 0)" label="Divergent Boundary" />
        <LegendItem color="rgb(255, 255, 0)" label="Transform Boundary" />
      </div>
    );
  }

  if (layer === LayerType.TEMPERATURE) {
    return (
      <GradientBar leftLabel="Cold" rightLabel="Hot"
        gradient="linear-gradient(to right, #3b82f6, #22c55e, #ef4444)" />
    );
  }

  if (layer === LayerType.MOISTURE) {
    return (
      <GradientBar leftLabel="Dry" rightLabel="Wet"
        gradient="linear-gradient(to right, #eab308, #3b82f6)" />
    );
  }

  if (layer === LayerType.ELEVATION) {
    return (
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="rgb(20, 40, 100)" label="Ocean" />
        <LegendItem color="rgb(128, 128, 128)" label="Land" />
        <LegendItem color="rgb(50, 100, 200)" label="Rivers" />
      </div>
    );
  }

  if (layer === LayerType.HEIGHTMAP) {
    return (
      <GradientBar leftLabel="Low" rightLabel="High"
        gradient="linear-gradient(to right, #000, #fff)" />
    );
  }

  if (layer === LayerType.NORMAL) {
    return (
      <div className="flex flex-wrap gap-4 text-xs">
        <LegendItem color="rgb(128, 128, 255)" label="Flat" />
        <LegendItem color="rgb(255, 128, 128)" label="Facing Right" />
        <LegendItem color="rgb(128, 255, 128)" label="Facing Down" />
      </div>
    );
  }

  if (layer === LayerType.MOVEMENT) {
    return (
      <GradientBar leftLabel="Easy (1)" rightLabel="Hard (13+)"
        gradient="linear-gradient(to right, #32c832, #ffd700, #dc2626, #501414)" />
    );
  }

  if (layer === LayerType.FERTILITY) {
    if (!hasCapability(pt, PlanetCapability.FERTILITY)) return null;
    return (
      <GradientBar leftLabel="Barren" rightLabel="Lush"
        gradient="linear-gradient(to right, #a09664, #b4be50, #64b43c, #1e821e)" />
    );
  }

  if (layer === LayerType.ORES) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <LegendItem color="rgb(60, 58, 55)" label="Barren" />
        <LegendItem color="rgb(180, 120, 60)" label="Basic Metals (Iron/Copper)" />
        <LegendItem color="rgb(200, 200, 210)" label="Minerals (Coal/Uranium)" />
        <LegendItem color="rgb(255, 215, 0)" label="Precious (Gold/Silver)" />
        <LegendItem color="rgb(120, 255, 255)" label="Rare Crystals (Gems)" />
      </div>
    );
  }

  if (layer === LayerType.SPICES) {
    if (!hasCapability(pt, PlanetCapability.SPICES)) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <LegendItem color="rgb(50, 45, 40)" label="None" />
        <LegendItem color="rgb(100, 130, 60)" label="T1 Aromatic Roots" />
        <LegendItem color="rgb(220, 160, 50)" label="T2 Stimulant Seeds" />
        <LegendItem color="rgb(200, 50, 150)" label="T3 Healing Sap" />
        <LegendItem color="rgb(160, 80, 255)" label="T4/T5 Bioluminescent" />
      </div>
    );
  }

  if (layer === LayerType.RESOURCES) {
    if (!hasCapability(pt, PlanetCapability.RESOURCES)) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <LegendItem color="rgb(55, 50, 45)" label="None" />
        <LegendItem color="rgb(150, 140, 130)" label="Stone / Marble" />
        <LegendItem color="rgb(140, 100, 50)" label="Softwood (Taiga)" />
        <LegendItem color="rgb(100, 55, 25)" label="Hardwood (Tropical)" />
      </div>
    );
  }

  if (layer === LayerType.FAUNA) {
    if (!hasCapability(pt, PlanetCapability.FAUNA)) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-500 font-semibold">Terrestrial</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <LegendItem color="rgb(180, 150, 50)" label="T1-T3 Herbivore Herds" />
          <LegendItem color="rgb(240, 160, 30)" label="T4-T6 Forest Predators" />
          <LegendItem color="rgb(220, 60, 30)" label="T7-T8 Megafauna" />
          <LegendItem color="rgb(180, 20, 40)" label="T9-T10 Apex Legends" />
        </div>
        <p className="text-xs text-neutral-500 font-semibold mt-1">Aquatic</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <LegendItem color="rgb(25, 90, 120)" label="A1 Reef Life" />
          <LegendItem color="rgb(30, 160, 185)" label="A2-A3 Marine Predators" />
          <LegendItem color="rgb(180, 160, 255)" label="A4-A5 Leviathans" />
        </div>
      </div>
    );
  }

  return null;
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm shadow-sm flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-neutral-300">{label}</span>
    </div>
  );
}

function GradientBar({ leftLabel, rightLabel, gradient }: { leftLabel: string; rightLabel: string; gradient: string }) {
  return (
    <div className="flex items-center gap-2 text-xs w-full max-w-md">
      <span className="text-neutral-400 whitespace-nowrap">{leftLabel}</span>
      <div className="h-3 flex-grow rounded-full" style={{ background: gradient }} />
      <span className="text-neutral-400 whitespace-nowrap">{rightLabel}</span>
    </div>
  );
}
