// Planet fauna: 200+ species derived from the planet seed, its type and its biomes.
// Only animal stages (sea, shore, land, their giant branch) - no civilisations here.
import { PlanetConfig, PlanetType, BiomeType } from '../planet-generator/generator';
import { makeGenome, Genome, Stage, CreatureParams } from '../creature/genome';
import { mulberry, seedToInt } from '../terrain/noise';

export type Habitat = 'land' | 'water' | 'shore';
export interface Species {
  id: number;
  genome: Genome;
  stage: Stage;
  habitat: Habitat;
  /** BiomeType values this species lives in (land/shore species) */
  biomes: number[];
  flyer: boolean;
  herd: [number, number];
  /** walking speed (world px / s) */
  speed: number;
  /** sprite scale relative to the generator size */
  k: number;
  diet: 'herb' | 'omni' | 'carn';
  name: string;
  /** water species: the depth band they live in (reefs: small & normal; open sea: the big ones; abyss: leviathans) */
  zone: 'coast' | 'open' | 'abyss' | null;
}

// typical climate of each biome (temperature, moisture) in the creature parameter space
const CLIMATE: Record<number, [number, number]> = {
  [BiomeType.SNOW]: [0.05, 0.3], [BiomeType.TUNDRA]: [0.2, 0.35], [BiomeType.TAIGA]: [0.3, 0.55], [BiomeType.COLD_DESERT]: [0.3, 0.1],
  [BiomeType.STEPPE]: [0.5, 0.25], [BiomeType.GRASSLAND]: [0.55, 0.45], [BiomeType.SEASONAL_FOREST]: [0.55, 0.65],
  [BiomeType.TEMPERATE_RAINFOREST]: [0.5, 0.9], [BiomeType.SAVANNA]: [0.78, 0.5], [BiomeType.SUBTROPICAL_DESERT]: [0.85, 0.1],
  [BiomeType.TROPICAL_RAINFOREST]: [0.8, 0.9],
};
const LAND_BIOMES = Object.keys(CLIMATE).map(Number);

export const hasFauna = (t: PlanetType) => t === PlanetType.EARTH_LIKE || t === PlanetType.ALIEN_LIFE || t === PlanetType.OCEAN_WORLD || t === PlanetType.SWAMP_WORLD;

export function planetFauna(cfg: PlanetConfig, count = 220): Species[] {
  if (!hasFauna(cfg.planetType)) return [];
  // only plants (or microbes): no animals at all
  if (cfg.life && cfg.life.level !== 'animal' && cfg.life.level !== 'intelligent') return [];
  const rnd = mulberry(seedToInt(cfg.seed + ':fauna'));
  const alien = cfg.planetType === PlanetType.ALIEN_LIFE;
  const ocean = cfg.planetType === PlanetType.OCEAN_WORLD, swamp = cfg.planetType === PlanetType.SWAMP_WORLD;
  const gravity = Math.max(0.05, Math.min(0.9, 0.3 + ((cfg.planetSize ?? 1) - 1) * 0.25 + (rnd() - 0.5) * 0.1));
  const atmosphere = Math.max(0.1, Math.min(0.95, 0.45 + (rnd() - 0.5) * 0.3 + (swamp ? 0.2 : 0)));
  const star = 0.35 + rnd() * 0.45;
  const out: Species[] = [];
  const wWater = ocean ? 0.45 : swamp ? 0.3 : 0.24, wShore = swamp ? 0.2 : 0.1;
  for (let i = 0; i < count; i++) {
    const r = rnd();
    const habitat: Habitat = r < wWater ? 'water' : r < wWater + wShore ? 'shore' : 'land';
    const home = LAND_BIOMES[Math.floor(rnd() * LAND_BIOMES.length)];
    const [t0, m0] = CLIMATE[home];
    const dr = rnd();
    const diet: Species['diet'] = dr < 0.55 ? 'herb' : dr < 0.8 ? 'omni' : 'carn';
    const giantRoll = rnd();
    const size = Math.pow(rnd(), 1.5);
    const p: CreatureParams = {
      gravity, atmosphere, star,
      temperature: Math.max(0, Math.min(1, t0 + (rnd() - 0.5) * 0.12)),
      water: habitat === 'land' ? Math.max(0, Math.min(1, m0 + (rnd() - 0.5) * 0.15)) : 0.75 + rnd() * 0.25,
      diet: diet === 'herb' ? rnd() * 0.33 : diet === 'omni' ? 0.38 + rnd() * 0.26 : 0.7 + rnd() * 0.3,
      exotic: alien ? 0.35 + rnd() * 0.5 : rnd() * 0.3,
      size,
    };
    const genome = makeGenome(`${cfg.seed}:sp${i}`, p, alien ? 'alien' : 'earth');
    let stage: Stage;
    // sea: leviathans in the abyss, giants in the open sea, larvae and normal swimmers on the reefs; land: rare leviathans
    if (habitat === 'water') stage = giantRoll < 0.07 ? Stage.AQUA_LEVIATHAN : giantRoll < 0.3 ? Stage.AQUA_GIANT : giantRoll < 0.45 ? Stage.AQUA_LARVA : Stage.AQUA;
    else if (habitat === 'shore') stage = giantRoll < 0.15 ? Stage.AMPHIBIAN_GIANT : Stage.AMPHIBIAN;
    else stage = giantRoll < 0.035 ? Stage.LAND_LEVIATHAN : giantRoll < 0.1 ? Stage.LAND_GIANT : Stage.LAND;
    const lev = stage === Stage.AQUA_LEVIATHAN || stage === Stage.LAND_LEVIATHAN;
    const giant = lev || stage === Stage.AQUA_GIANT || stage === Stage.AMPHIBIAN_GIANT || stage === Stage.LAND_GIANT;
    // neighbours in climate space share the species
    const biomes = habitat === 'water' ? [] : LAND_BIOMES.filter(b => b === home || (Math.abs(CLIMATE[b][0] - t0) < 0.14 && Math.abs(CLIMATE[b][1] - m0) < 0.25 && rnd() < 0.6));
    const flyer = stage === Stage.LAND && (genome.wings !== 'none' || genome.locomotion === 'flyer' || genome.locomotion === 'dragon');
    const speed = (diet === 'carn' ? 62 : diet === 'omni' ? 50 : 44) * (lev ? 0.5 : giant ? 0.6 : 1) * (0.8 + rnd() * 0.4);
    const k = lev ? (habitat === 'water' ? 0.44 : 0.4) : habitat === 'water' ? (giant ? 0.32 : stage === Stage.AQUA_LARVA ? 0.34 : 0.3 + size * 0.1) : giant ? 0.34 : 0.26 + size * 0.14;
    const zone: Species['zone'] = habitat !== 'water' ? null : stage === Stage.AQUA_LEVIATHAN ? 'abyss' : stage === Stage.AQUA_GIANT ? 'open' : stage === Stage.AQUA_LARVA ? 'coast' : rnd() < 0.72 ? 'coast' : 'open';
    out.push({
      id: i, genome, stage, habitat, biomes, flyer, speed, k, diet,
      herd: giant ? [1, 1] : stage === Stage.AQUA_LARVA ? [3, 7] : diet === 'herb' ? [2, size < 0.4 ? 6 : 4] : diet === 'carn' ? [1, 2] : [1, 3],
      name: `${genome.name.genus} ${genome.name.species}`, zone,
    });
  }
  // every living sea has its leviathans (at least two), every animal land at least one
  const ensure = (st: Stage, want: number, from: (s: Species) => boolean, habitat: Habitat) => {
    let have = out.filter(q => q.stage === st).length;
    for (const q of out) {
      if (have >= want) break;
      if (!from(q)) continue;
      q.stage = st; q.k = habitat === 'water' ? 0.44 : 0.4; q.herd = [1, 1]; q.speed *= 0.6; q.zone = habitat === 'water' ? 'abyss' : null; have++;
    }
  };
  ensure(Stage.AQUA_LEVIATHAN, 2, q => q.stage === Stage.AQUA_GIANT, 'water');
  if (!ocean) ensure(Stage.LAND_LEVIATHAN, 1, q => q.stage === Stage.LAND_GIANT, 'land');
  return out;
}

/** Index: which species live in which biome (land & shore), and the sea species by depth band. */
export function faunaIndex(list: Species[]) {
  const byBiome = new Map<number, Species[]>();
  const shoreByBiome = new Map<number, Species[]>();
  const levByBiome = new Map<number, Species[]>();
  const coast: Species[] = [], open: Species[] = [], abyss: Species[] = [];
  for (const s of list) {
    if (s.habitat === 'water') { (s.zone === 'abyss' ? abyss : s.zone === 'open' ? open : coast).push(s); continue; }
    const m = s.habitat === 'shore' ? shoreByBiome : s.stage === Stage.LAND_LEVIATHAN ? levByBiome : byBiome;
    for (const b of s.biomes) { if (!m.has(b)) m.set(b, []); m.get(b)!.push(s); }
  }
  return { byBiome, shoreByBiome, levByBiome, coast, open, abyss };
}
