// Per-planet-type look & feel shared by the worker (cloud maps) and the renderers
// (atmosphere halo, cloud tint, emissive glow). Pure data: safe to import in workers.
import { PlanetConfig, PlanetType } from './generator';

export interface CloudProfile {
  coverage: number;    // 0..1 fraction of sky covered
  sharpness: number;   // contrast of the cloud edges
  scale: number;       // base noise frequency (bigger = smaller cloud cells)
  bandStretch: number; // >1 squeezes clouds into latitude bands
  color: [number, number, number];
  opacity: number;     // max alpha when drawn over the surface
}

export interface AtmosphereProfile {
  color: [number, number, number];
  thickness: number; // halo width as a fraction of the radius
  intensity: number; // 0..1
}

export function cloudProfileFor(c: PlanetConfig): CloudProfile | null {
  const d = c.cloudDensity ?? 0.5;
  switch (c.planetType) {
    case PlanetType.EARTH_LIKE:
    case PlanetType.ALIEN_LIFE:
      return { coverage: 0.3 + d * 0.3, sharpness: 3.2, scale: 2.4, bandStretch: 1.3, color: [255, 255, 255], opacity: 0.9 };
    case PlanetType.OCEAN_WORLD:
      return { coverage: 0.4 + d * 0.3, sharpness: 3, scale: 2.2, bandStretch: 1.4, color: [250, 252, 255], opacity: 0.9 };
    case PlanetType.SWAMP_WORLD:
      return { coverage: 0.55 + d * 0.3, sharpness: 2, scale: 2, bandStretch: 1.2, color: [215, 225, 200], opacity: 0.8 };
    case PlanetType.TOXIC_ATMOSPHERE:
      return { coverage: 0.75 + d * 0.25, sharpness: 1.3, scale: 1.6, bandStretch: 2.2, color: [230, 205, 130], opacity: 0.85 };
    case PlanetType.ARID:
      return { coverage: 0.12 + (c.dustStormIntensity ?? 0.3) * 0.25, sharpness: 1.6, scale: 1.8, bandStretch: 1, color: [225, 170, 120], opacity: 0.55 };
    case PlanetType.ASH_WORLD:
      return { coverage: 0.35, sharpness: 1.4, scale: 2, bandStretch: 1, color: [90, 85, 85], opacity: 0.6 };
    case PlanetType.LAVA_WORLD:
      return { coverage: 0.2, sharpness: 1.2, scale: 2.2, bandStretch: 1, color: [70, 55, 50], opacity: 0.5 };
    case PlanetType.FROZEN_OCEAN:
    case PlanetType.GLACIAL:
      return { coverage: 0.1, sharpness: 1.4, scale: 2.5, bandStretch: 1.5, color: [235, 245, 255], opacity: 0.35 };
    case PlanetType.CARBON_WORLD:
      return { coverage: 0.3, sharpness: 1.5, scale: 2, bandStretch: 1.3, color: [120, 100, 80], opacity: 0.5 };
    default:
      return null; // airless bodies & gas giants (bands are the "clouds")
  }
}

const GAS_TINTS: Record<string, [number, number, number]> = {
  jovian: [240, 200, 150],
  saturnian: [245, 225, 170],
  uranian: [150, 230, 245],
  neptunian: [90, 140, 255],
  'alien-purple': [200, 140, 255],
  crimson: [255, 120, 90],
};

export function atmosphereFor(c: PlanetConfig): AtmosphereProfile | null {
  switch (c.planetType) {
    case PlanetType.EARTH_LIKE: return { color: [110, 170, 255], thickness: 0.12, intensity: 0.9 };
    case PlanetType.ALIEN_LIFE: {
      const hue = c.waterHue;
      const col: [number, number, number] = hue === 'green' ? [120, 255, 170] : hue === 'cyan' ? [110, 240, 255] : hue === 'indigo' ? [150, 130, 255] : [130, 190, 255];
      return { color: col, thickness: 0.13, intensity: 0.95 };
    }
    case PlanetType.OCEAN_WORLD: return { color: [90, 170, 255], thickness: 0.12, intensity: 0.9 };
    case PlanetType.SWAMP_WORLD: return { color: [160, 210, 140], thickness: 0.13, intensity: 0.8 };
    case PlanetType.TOXIC_ATMOSPHERE: return { color: [240, 210, 110], thickness: 0.18, intensity: 1 };
    case PlanetType.ARID: return { color: [255, 170, 120], thickness: 0.07, intensity: 0.5 };
    case PlanetType.GLACIAL: return { color: [190, 225, 255], thickness: 0.06, intensity: 0.45 };
    case PlanetType.FROZEN_OCEAN: return { color: [200, 230, 255], thickness: 0.05, intensity: 0.35 };
    case PlanetType.LAVA_WORLD: return { color: [255, 110, 40], thickness: 0.1, intensity: 0.8 };
    case PlanetType.ASH_WORLD: return { color: [200, 110, 90], thickness: 0.09, intensity: 0.55 };
    case PlanetType.CARBON_WORLD: return { color: [200, 160, 110], thickness: 0.08, intensity: 0.5 };
    case PlanetType.GAS_GIANT: return { color: GAS_TINTS[c.colorPalette] ?? GAS_TINTS.jovian, thickness: 0.09, intensity: 0.7 };
    default: return null;
  }
}

/** Whether the surface emits light on the night side (magma). */
export function emissiveFor(c: PlanetConfig): number {
  if (c.planetType === PlanetType.LAVA_WORLD) return 1;
  if (c.planetType === PlanetType.TIDALLY_LOCKED_DEAD || c.planetType === PlanetType.ASH_WORLD) return 0.6;
  return 0;
}
