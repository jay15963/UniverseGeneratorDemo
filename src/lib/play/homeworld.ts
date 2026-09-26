// The player's home planet: a real world of the explorable universe, drawn from a universe seed when the species is
// created (random galaxy -> random star system -> a living ocean world of the species' colour mode). The same planet
// carries the lineage through every era, up to the space age. Deterministic: the same (seed, mode) is the same world.
import seedrandom from 'seedrandom';
import { UniverseGenerator } from '../universe/generator';
import { GalaxyGenerator, galaxyConfigFor } from '../galaxy/generator';
import { SolarSystemGenerator } from '../solar-system/generator';
import { PlanetType, type PlanetConfig } from '../planet-generator/generator';
import type { UniverseGalaxyMetadata } from '../universe/types';
import type { StellarSystemMetadata } from '../galaxy/types';

/** the explorer's universe settings (so the home world is the one "Explorar" shows with the same seed) */
export const HOME_UNIVERSE = { age: 0.5, maxGalaxies: 3000 };
/** life stage of the home world when the aquatic era begins: only the seas live */
export const AQUATIC_START_STAGE = 0.12;

export interface HomeWorld {
  universeSeed: string;
  galaxyId: string; galaxyName: string;
  starId: string; starName: string;
  bodyId: string; bodyName: string;
  moon: boolean;
  /** the planet as the system generator made it (life stage set by the play mode) */
  config: PlanetConfig;
}

const shuffled = <T,>(a: T[], rng: () => number) => {
  const o = a.slice();
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
};

/** a random word seed for the dice of the species editor */
export function randomUniverseSeed() {
  const s = 'BCDFGHJKLMNPRSTVZ', v = 'AEIOU';
  let o = '';
  for (let i = 0; i < 3; i++) o += s[Math.floor(Math.random() * s.length)] + v[Math.floor(Math.random() * v.length)];
  return `${o}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/**
 * walks the universe of `universeSeed`: galaxies and stars in a seeded random order, the first world of the wanted
 * type (Earth-like for 'earth', alien life for 'alien') with open seas; planets are preferred over moons.
 */
export function pickHomeworld(universeSeed: string, mode: 'earth' | 'alien'): HomeWorld | null {
  const want = mode === 'alien' ? PlanetType.ALIEN_LIFE : PlanetType.EARTH_LIKE;
  const rng = seedrandom(`${universeSeed}:home:${mode}`);
  const galaxies = new UniverseGenerator({ seed: universeSeed, ...HOME_UNIVERSE }).generate().filter(g => !g.isDead);
  let fallback: HomeWorld | null = null;
  let gi = 0;
  for (const gal of shuffled(galaxies, rng).slice(0, 12)) {
    gi++;
    const stars = new GalaxyGenerator(galaxyConfigFor(gal)).generate()
      .filter(s => s.starClass !== 'BH' && s.starClass !== 'NS' && s.starClass !== 'P' && !s.isDeadZone);
    let tries = 0;
    for (const star of shuffled(stars, rng)) {
      if (++tries > 600) break;
      for (const b of new SolarSystemGenerator({ ...star.config }).generateSystem()) {
        const pc = b.planetConfig;
        if (!pc || pc.planetType !== want || pc.seaLevel < 0.4) continue;
        const hw = homeOf(universeSeed, gal, star, b.id, b.name, b.type === 'moon', pc);
        if (!hw.moon) return hw;
        fallback ??= hw;
      }
    }
    if (fallback && gi >= 3) return fallback;   // a moon only when a few galaxies had no planet
  }
  return fallback;
}

function homeOf(universeSeed: string, gal: UniverseGalaxyMetadata, star: StellarSystemMetadata, bodyId: string, bodyName: string, moon: boolean, pc: PlanetConfig): HomeWorld {
  return {
    universeSeed, galaxyId: gal.id, galaxyName: gal.name, starId: star.id, starName: star.name, bodyId, bodyName, moon,
    config: { ...pc, width: 2048, height: 1024 },
  };
}

/** the home world as it looks at a life stage (0..1): the aquatic era starts it with bare land */
export const homeConfig = (hw: HomeWorld, lifeStage: number): PlanetConfig => ({ ...hw.config, lifeStage, life: { level: 'animal' } });

/** pickHomeworld in a worker */
export function findHomeworld(universeSeed: string, mode: 'earth' | 'alien'): Promise<HomeWorld | null> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./homeworld.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<{ ok: boolean; home?: HomeWorld | null; message?: string }>) => {
      w.terminate();
      if (ev.data.ok) resolve(ev.data.home ?? null); else reject(new Error(ev.data.message));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ seed: universeSeed, mode });
  });
}
