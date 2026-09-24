// Planet configurations shared by the demo reel and the trailer.
import { PlanetConfig, PlanetType } from '../../lib/planet-generator/generator';

export type RGB = [number, number, number];

export const BASE: PlanetConfig = {
  seed: 'demo', width: 2048, height: 1024, numPlates: 30, seaLevel: 0.5, baseTemperature: 0.5, baseMoisture: 0.55,
  planetSize: 2, planetType: PlanetType.EARTH_LIKE, craterDensity: 0.4, surfaceHue: 'gray', dustStormIntensity: 0.3,
  cloudDensity: 0.55, volcanicActivity: 0.3, iceFractureDensity: 0.5, bandContrast: 0.6, stormFrequency: 0.4,
  colorPalette: 'jovian', vegetationHue: 'green', waterHue: 'blue', crustAge: 0.5, islandDensity: 0.2, lineaeDensity: 0.5,
  iceThickness: 0.5, starIntensity: 0.7, twilightWidth: 0.3, crystalDensity: 0.4, hydrocarbonLakes: 0.3,
  bioluminescence: 0.5, waterLevel: 0.6, ashDepth: 0.5, emberActivity: 0.4,
} as PlanetConfig;
export const cfg = (over: Partial<PlanetConfig>): PlanetConfig => ({ ...BASE, ...over });


/** the curated worlds of the films */
export const WORLDS = {
  gaia: cfg({ seed: 'demo-gaia-7', planetType: PlanetType.EARTH_LIKE, baseTemperature: 0.55, baseMoisture: 0.62 }),
  xeno: cfg({ seed: 'demo-xeno-3', planetType: PlanetType.ALIEN_LIFE, vegetationHue: 'purple', waterHue: 'green', baseMoisture: 0.65 }),
  ocean: cfg({ seed: 'demo-thalassa', planetType: PlanetType.OCEAN_WORLD, islandDensity: 0.22 }),
  bayou: cfg({ seed: 'demo-bayou-2', planetType: PlanetType.SWAMP_WORLD, baseTemperature: 0.65 }),
  inferno: cfg({ seed: 'demo-inferno', planetType: PlanetType.LAVA_WORLD, volcanicActivity: 0.9, emberActivity: 0.8, crustAge: 0.2 }),
  boreas: cfg({ seed: 'demo-boreas', planetType: PlanetType.GLACIAL, baseTemperature: 0.2 }),
};
export const STARS: Record<keyof typeof WORLDS, RGB> = {
  gaia: [255, 226, 180], xeno: [200, 220, 255], ocean: [255, 240, 210], bayou: [255, 210, 160], inferno: [255, 180, 120], boreas: [220, 235, 255],
};
// opens the film: a ringed gas giant drifting past
export const GIANT = cfg({ seed: 'demo-jove', planetType: PlanetType.GAS_GIANT, colorPalette: 'jovian', bandContrast: 0.75, stormFrequency: 0.6 });
