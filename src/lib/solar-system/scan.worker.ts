/// <reference lib="webworker" />
// Life scanner: expands one galaxy (the same stars the explorer shows) and every star system in it, and reports the
// worlds that hold life - from microbes to intelligent species.
import { GalaxyGenerator, galaxyConfigFor } from '../galaxy/generator';
import { SolarSystemGenerator } from './generator';
import type { UniverseGalaxyMetadata } from '../universe/types';
import type { StellarSystemMetadata } from '../galaxy/types';
import type { LifeLevel, PlanetType } from '../planet-generator/generator';

export interface ScanHit {
  galaxyId: string; star: StellarSystemMetadata;
  body: string; bodyId: string; level: LifeLevel; era?: number; planetType: PlanetType; moon: boolean;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (ev: MessageEvent<{ id: number; galaxy: UniverseGalaxyMetadata }>) => {
  const { id, galaxy } = ev.data;
  try {
    const hits: ScanHit[] = [];
    let systems = 0;
    if (!galaxy.isDead) {
      const stars = new GalaxyGenerator(galaxyConfigFor(galaxy)).generate();
      for (const s of stars) {
        if (s.starClass === 'BH' || s.starClass === 'NS' || s.starClass === 'P') continue;
        systems++;
        for (const b of new SolarSystemGenerator({ ...s.config }).generateSystem()) {
          const life = b.planetConfig?.life;
          if (!life || life.level === 'none') continue;
          hits.push({ galaxyId: galaxy.id, star: s, body: b.name, bodyId: b.id, level: life.level, era: life.era, planetType: b.planetConfig!.planetType, moon: b.type === 'moon' });
        }
      }
    }
    ctx.postMessage({ id, ok: true, hits, systems });
  } catch (e) {
    ctx.postMessage({ id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
