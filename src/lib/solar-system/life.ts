// What lives on each world of a system: a deterministic roll per body (its own hash, so the system generator's
// random sequence is untouched). Habitable worlds (Earth-like / alien life) go from microbes to plants, animals and
// intelligent species; an intelligent species sits in one of the 8 civilisation eras, more advanced in older systems.
// Ocean / swamp worlds may hold microbes, frozen oceans rarely.
import { PlanetType, LifeInfo, LifeLevel } from '../planet-generator/generator';
import { mulberry, seedToInt } from '../terrain/noise';
import type { CelestialBody } from './types';

export const LIFE_NAMES: Record<LifeLevel, string> = {
  none: 'Nenhuma', microbial: 'Microbiana', plants: 'Vegetal', animal: 'Animal', intelligent: 'Inteligente',
};

export function rollLife(body: CelestialBody, systemAge: number): LifeInfo {
  const pc = body.planetConfig;
  if (!pc) return { level: 'none' };
  const r = mulberry(seedToInt(pc.seed + ':life'));
  const t = pc.planetType;
  if (body.isHabitable || t === PlanetType.EARTH_LIKE || t === PlanetType.ALIEN_LIFE) {
    const u = r(), age = Math.max(0, Math.min(1, systemAge));
    // older systems had more time: animals and minds are likelier
    const pInt = 0.12 + age * 0.3, pAnimal = 0.3, pPlants = 0.28;
    let level: LifeLevel = u < pInt ? 'intelligent' : u < pInt + pAnimal ? 'animal' : u < pInt + pAnimal + pPlants ? 'plants' : 'microbial';
    if (age < 0.25 && level === 'intelligent') level = 'animal';
    if (level !== 'intelligent') return { level };
    // any era can happen; older systems lean towards the advanced ones
    const era = Math.min(7, Math.floor(8 * r() ** (1.6 - age * 1.4)));
    return { level, era };
  }
  if (t === PlanetType.OCEAN_WORLD || t === PlanetType.SWAMP_WORLD) return { level: r() < 0.6 ? 'microbial' : 'none' };
  if (t === PlanetType.FROZEN_OCEAN) return { level: r() < 0.3 ? 'microbial' : 'none' };
  return { level: 'none' };
}

/** stamps `planetConfig.life` on every body of a generated system */
export function assignLife(bodies: CelestialBody[], systemAge: number) {
  for (const b of bodies) if (b.planetConfig) b.planetConfig = { ...b.planetConfig, life: rollLife(b, systemAge) };
  return bodies;
}
