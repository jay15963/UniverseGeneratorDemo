// Playable surface generator. Runs inside the planet worker, reading the full-resolution planet
// fields so the local terrain matches the world map (biomes, coasts, rivers, ores, climate).
import { PlanetType, BiomeType, PlanetConfig } from '../planet-generator/generator';

/** The subset of planet data the terrain needs. Arrays may be a window of the full map (ox, oy, fw, fh). */
export interface PlanetFields {
  config: PlanetConfig;
  ox: number; oy: number; fw: number; fh: number;
  elevation: Float32Array; temperature: Float32Array; moisture: Float32Array;
  fertility: Float32Array; ores: Float32Array; waterAccumulation: Float32Array;
  /** map px to the nearest water (vegetation front of a young world) and the ocean's depth percentiles (lifeStage.ts) */
  coast?: Float32Array; depthQ?: [number, number];
}

export function cropFields(src: Omit<PlanetFields, 'ox' | 'oy' | 'fw' | 'fh'>, cx: number, cy: number, size: number): PlanetFields {
  const W = src.config.width, H = src.config.height;
  const fw = Math.min(W, size), fh = Math.min(H, size);
  const ox = ((Math.round(cx - fw / 2) % W) + W) % W, oy = Math.max(0, Math.min(H - fh, Math.round(cy - fh / 2)));
  const crop = (a: Float32Array) => {
    const o = new Float32Array(fw * fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) o[y * fw + x] = a[(oy + y) * W + ((ox + x) % W)];
    return o;
  };
  return {
    config: src.config, ox, oy, fw, fh,
    elevation: crop(src.elevation), temperature: crop(src.temperature), moisture: crop(src.moisture),
    fertility: crop(src.fertility), ores: crop(src.ores), waterAccumulation: crop(src.waterAccumulation),
    coast: src.coast ? crop(src.coast) : undefined, depthQ: src.depthQ,
  };
}
import { Ground, Feat, Feature, ChunkData, TerrainRow, TILE, CHUNK, CHUNK_PX, WORLD_TILES_X, LIFT, MAX_LEVEL, LIQUID_FRAMES } from './types';
import { fbm2, vnoise, rand2, ridge, hash3, mulberry, seedToInt, smoothstep } from './noise';
import { RockType, ROCK_RAMPS, GROUND_RAMPS, LEAF, RGB, shiftRamp, vegetationHueShift, waterHueShift, hex, mixRGB } from './palettes';
import { CZ, CityChunkData, isGraded, isRoad, isWallish, isZone, keepFeature } from '../city/codes';
import { lifeStageOf, vegAmount, seaZone, SeaZone } from '../planet-generator/lifeStage';
import { cityPixel, cityRegionColor } from '../city/paint';

// ---------------------------------------------------------------------------
// Cities painted into the terrain (per worker). A city plan is a set of per-chunk tile codes with the
// evolution stage at which each tile appears; `p` is the city's current evolution (0..254).
// ---------------------------------------------------------------------------
interface CityLayer { era: number; p: number; chunks: Map<string, CityChunkData> }
const CITIES = new Map<number, CityLayer>();
export function cityAdd(id: number, era: number, p: number, chunks: Record<string, CityChunkData>) {
  CITIES.set(id, { era, p, chunks: new Map(Object.entries(chunks)) });
}
export function cityLevel(id: number, p: number) { const c = CITIES.get(id); if (c) c.p = p; }
export function cityRemove(id: number) { CITIES.delete(id); }
/** show the district / field colours (off: only streets and walls are painted) */
let CITY_ZONES = true;
export function cityZones(on: boolean) { CITY_ZONES = on; }
/** visible city code and era on a tile ([0, 0] outside every city) */
function cityTile(tx: number, ty: number): [number, number] {
  if (!CITIES.size) return [0, 0];
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), q = (ty - cy * CHUNK) * CHUNK + tx - cx * CHUNK, key = `${cx},${cy}`;
  for (const L of CITIES.values()) {
    const d = L.chunks.get(key);
    if (d && d.code[q] && d.stage[q] <= L.p) return [d.code[q], L.era];
  }
  return [0, 0];
}

type Mode = 'living' | 'arid' | 'airless' | 'glacial' | 'frozen' | 'volcanic' | 'toxic' | 'carbon';

interface TileInfo {
  g: Ground;
  biome: number;     // BiomeType or 255
  h: number;         // local elevation (planet units)
  depth: number;     // water depth (0 on land)
  temp: number;
  moist: number;
  fert: number;
  ore: number;
  forest: number;    // 0..1 tree density
  rock: RockType;
  wet: number;       // 0..1 closeness to water (floodplain / creek bank)
  beach: boolean;
  lv: number;        // terrain level (0 = sea level plain)
  ramp: boolean;     // walkable slope down to a neighbour one level lower
  cz: number;        // city tile code (CZ), 0 = none
  ce: number;        // era of that city
  rd: number;        // city road ramp direction 1=S 2=N 3=E 4=W
  veg: number;       // 0..1 how far the plants have reached here (young worlds: bare land)
  zone: number;      // SeaZone of water tiles (coast / open sea / abyss), 0 on land
}

const B = 2; // tile border computed around each chunk
const N = CHUNK + B * 2;

const FOREST_BASE: Record<number, number> = {
  [BiomeType.SNOW]: 0.02, [BiomeType.TUNDRA]: 0.08, [BiomeType.TAIGA]: 0.85, [BiomeType.COLD_DESERT]: 0,
  [BiomeType.STEPPE]: 0.08, [BiomeType.GRASSLAND]: 0.16, [BiomeType.SEASONAL_FOREST]: 0.8,
  [BiomeType.TEMPERATE_RAINFOREST]: 0.95, [BiomeType.SAVANNA]: 0.14, [BiomeType.SUBTROPICAL_DESERT]: 0,
  [BiomeType.TROPICAL_RAINFOREST]: 1,
};

const isWater = (g: Ground) => g <= Ground.SWAMP_WATER;

export class TerrainGenerator {
  readonly gen: PlanetFields;
  readonly W: number;
  readonly H: number;
  readonly S: number;          // tiles per map pixel
  readonly seed: number;
  readonly mode: Mode;
  readonly type: PlanetType;
  readonly sea: number;
  readonly hasSea: boolean;
  readonly ramps: Record<string, RGB[]>;
  private lastLiquid: Uint8Array | null = null;
  /** the planet's life stage (0 bare land .. 1 green) and its ocean depth bands */
  readonly vita: number;
  readonly depthQ: [number, number];

  constructor(gen: PlanetFields) {
    this.gen = gen;
    const c = gen.config;
    this.W = c.width; this.H = c.height;
    this.S = WORLD_TILES_X / c.width;
    this.seed = seedToInt(c.seed + '_terrain');
    this.type = c.planetType;
    this.mode = modeFor(c.planetType);
    this.sea = c.planetType === PlanetType.OCEAN_WORLD ? 1 - (c.islandDensity || 0.1) - 0.02 : c.seaLevel;
    this.hasSea = [PlanetType.EARTH_LIKE, PlanetType.ALIEN_LIFE, PlanetType.OCEAN_WORLD, PlanetType.SWAMP_WORLD].includes(c.planetType);
    this.vita = gen.coast ? lifeStageOf(c) : 1;
    this.depthQ = gen.depthQ ?? [0.3, 0.55];
    const alien = c.planetType === PlanetType.ALIEN_LIFE;
    const vh = vegetationHueShift(c.vegetationHue, alien);
    const wh = waterHueShift(c.waterHue, alien);
    const R = GROUND_RAMPS;
    this.ramps = {
      ...R, moss: shiftRamp(LEAF.moss, vh * 0.5),
      grass: shiftRamp(R.grass, vh), lushGrass: shiftRamp(R.lushGrass, vh), dryGrass: shiftRamp(R.dryGrass, vh),
      marsh: shiftRamp(R.marsh, vh), jungle: shiftRamp(R.jungle, vh * 0.5), tundra: shiftRamp(R.tundra, vh * 0.5),
      water: shiftRamp(R.water, wh), shallow: shiftRamp(R.shallow, wh), swampWater: shiftRamp(R.swampWater, wh * 0.5),
    };
  }

  // ---------------------------------------------------------------------------
  // Planet field sampling
  // ---------------------------------------------------------------------------
  /** Map-pixel index into the (possibly windowed) field arrays. */
  private idx(x: number, y: number): number {
    const F = this.gen, W = this.W;
    let lx = (((x - F.ox) % W) + W) % W;
    if (lx >= F.fw) lx = lx - F.fw < (W - F.fw) / 2 ? F.fw - 1 : 0;
    const ly = Math.max(0, Math.min(F.fh - 1, y - F.oy));
    return ly * F.fw + lx;
  }
  /** Whether a map point is inside the field window (always true for full maps). */
  covers(mx: number, my: number): boolean {
    const F = this.gen;
    if (F.fw >= this.W && F.fh >= this.H) return true;
    const lx = (((Math.floor(mx) - F.ox) % this.W) + this.W) % this.W, ly = Math.floor(my) - F.oy;
    return lx >= 2 && lx < F.fw - 2 && ly >= 2 && ly < F.fh - 2;
  }
  private bil(f: Float32Array, mx: number, my: number): number {
    const W = this.W, H = this.H;
    const x = mx - 0.5, y = Math.max(0, Math.min(H - 1.001, my - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
    const ya = y0, yb = Math.min(H - 1, y0 + 1);
    const a = f[this.idx(xa, ya)], b = f[this.idx(xb, ya)], c = f[this.idx(xa, yb)], d = f[this.idx(xb, yb)];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  private at(f: Float32Array, mx: number, my: number): number {
    const W = this.W, H = this.H;
    const x = ((Math.floor(mx) % W) + W) % W, y = Math.max(0, Math.min(H - 1, Math.floor(my)));
    return f[this.idx(x, y)];
  }

  private rockAt(tx: number, ty: number): RockType {
    const n = fbm2(tx / 300, ty / 300, this.seed + 7, 3);
    const n2 = vnoise(tx / 90, ty / 90, this.seed + 8);
    const k = n * 0.8 + n2 * 0.2;
    switch (this.mode) {
      case 'volcanic': return k > 0.78 ? RockType.PERIDOTITE : RockType.BASALT;
      case 'arid': return k > 0.62 ? RockType.BASALT : k > 0.45 ? RockType.SANDSTONE : RockType.ANDESITE;
      case 'airless': return k > 0.6 ? RockType.BASALT : k > 0.42 ? RockType.ANDESITE : RockType.GRANITE;
      case 'glacial': case 'frozen': return k > 0.5 ? RockType.SHALE : RockType.GRANITE;
      case 'carbon': return RockType.SHALE;
      case 'toxic': return k > 0.5 ? RockType.BASALT : RockType.ANDESITE;
      default: {
        const order = [RockType.GRANITE, RockType.LIMESTONE, RockType.ANDESITE, RockType.SANDSTONE, RockType.SHALE, RockType.CHALK, RockType.BASALT, RockType.PERIDOTITE];
        return order[Math.min(7, Math.floor(Math.pow(k, 1.3) * 9.5))];
      }
    }
  }

  private classify(temp: number, moist: number): BiomeType {
    if (temp < 0.15) return BiomeType.SNOW;
    if (temp < 0.25) return BiomeType.TUNDRA;
    if (temp < 0.35) return moist > 0.4 ? BiomeType.TAIGA : moist > 0.2 ? BiomeType.STEPPE : BiomeType.COLD_DESERT;
    if (temp < 0.65) return moist > 0.8 ? BiomeType.TEMPERATE_RAINFOREST : moist > 0.5 ? BiomeType.SEASONAL_FOREST : moist > 0.35 ? BiomeType.GRASSLAND : BiomeType.STEPPE;
    return moist > 0.65 ? BiomeType.TROPICAL_RAINFOREST : moist > 0.45 ? BiomeType.SAVANNA : BiomeType.SUBTROPICAL_DESERT;
  }

  /** Discrete terrain level: plains stay flat, highlands terrace into plateaus and cliffs. */
  levelOf(t: TileInfo, tx: number, ty: number): number {
    if (t.g === Ground.DEEP_WATER || (this.hasSea && t.h <= this.sea)) return 0;
    const ref = this.hasSea ? this.sea : this.gen.config.seaLevel;
    const alt = (t.h - ref) / Math.max(0.05, 1 - ref);
    if (alt <= 0) return 0;
    const m = smoothstep(0.16, 0.5, alt);
    // rugged ridges & valleys inside mountain ranges, gentle knolls on the plains
    const rug = ridge(tx / 44, ty / 44, this.seed + 82, 3);
    const e = alt * (0.32 + 0.68 * m)
      + m * (rug * rug * 0.2 + (fbm2(tx / 14, ty / 14, this.seed + 83, 2) - 0.5) * 0.05)
      + (fbm2(tx / 23, ty / 23, this.seed + 80, 3) - 0.5) * 0.07 * (0.35 + m)
      + (1 - m) * Math.max(0, fbm2(tx / 30, ty / 30, this.seed + 84, 3) - 0.58) * 0.35;
    return Math.max(0, Math.min(MAX_LEVEL, Math.floor(e / 0.038)));
  }

  /** Full per-tile environment (a young world's land is stripped bare where the plants have not reached). */
  tile(tx: number, ty: number): TileInfo {
    const t = this.tileRaw(tx, ty);
    if (t.veg < 1 && t.biome !== 255) this.barrenize(t, tx, ty);
    return t;
  }
  /** Before the plants: dry rock, gravel, dust and red sand; the front is sparse, dry grass */
  private barrenize(t: TileInfo, tx: number, ty: number) {
    const v = t.veg, s = this.seed;
    t.forest *= v < 0.5 ? 0 : (v - 0.5) * 2;
    const g = t.g;
    const green = g === Ground.GRASS || g === Ground.LUSH_GRASS || g === Ground.DRY_GRASS || g === Ground.FOREST_FLOOR || g === Ground.NEEDLES
      || g === Ground.JUNGLE_FLOOR || g === Ground.MARSH || g === Ground.PEAT || g === Ground.TUNDRA;
    if (!green) return;
    const n = fbm2(tx / 16, ty / 16, s + 41, 3), n2 = fbm2(tx / 40, ty / 40, s + 42, 3);
    if (v >= 0.4) {
      // the green front: patchy, dry grass with bare dirt between
      if (n > 0.35 + (v - 0.4) * 1.2) t.g = n2 > 0.55 ? Ground.GRAVEL : Ground.DIRT;
      else if (g === Ground.LUSH_GRASS || g === Ground.FOREST_FLOOR || g === Ground.JUNGLE_FLOOR || g === Ground.NEEDLES) t.g = v > 0.75 ? Ground.GRASS : Ground.DRY_GRASS;
      return;
    }
    if (t.temp < 0.2) t.g = n > 0.62 ? Ground.STONE : n2 > 0.5 ? Ground.GRAVEL : Ground.SNOW;
    else t.g = n > 0.7 ? Ground.STONE : n2 > 0.62 ? Ground.GRAVEL : t.temp > 0.55 && t.moist < 0.55 && n < 0.45 ? Ground.RED_SAND : Ground.DIRT;
  }
  private tileRaw(tx: number, ty: number): TileInfo {
    const gen = this.gen, S = this.S, s = this.seed;
    const mx = tx / S, my = ty / S;
    const wx = (fbm2(tx / 80, ty / 80, s + 1, 3) - 0.5) * 1.6;
    const wy = (fbm2(tx / 80, ty / 80, s + 2, 3) - 0.5) * 1.6;

    const mapElev = this.bil(gen.elevation, mx, my);
    const hills = (fbm2(tx / 46, ty / 46, s + 3, 4) - 0.5) * 0.022 + (fbm2(tx / 11, ty / 11, s + 4, 2) - 0.5) * 0.004;
    let h = mapElev + hills;
    let temp = this.bil(gen.temperature, mx + wx, my + wy) - Math.max(0, hills) * 1.5 + (fbm2(tx / 150, ty / 150, s + 5, 2) - 0.5) * 0.06;
    let moist = this.bil(gen.moisture, mx + wx, my + wy) + (fbm2(tx / 60, ty / 60, s + 6, 3) - 0.5) * 0.14;
    const fert = this.bil(gen.fertility, mx + wx * 0.5, my + wy * 0.5);
    const ore = this.bil(gen.ores, mx + wx, my + wy);
    const rock = this.rockAt(tx, ty);
    if (this.type === PlanetType.SWAMP_WORLD) moist += 0.35;
    temp = Math.max(0, Math.min(1, temp));
    moist = Math.max(0, Math.min(1, moist));

    const info: TileInfo = { g: Ground.GRASS, biome: 255, h, depth: 0, temp, moist, fert, ore, forest: 0, rock, wet: 0, beach: false, lv: 0, ramp: false, cz: 0, ce: 0, rd: 0, veg: 1, zone: 0 };
    if (this.mode !== 'living') { this.barrenGround(info, tx, ty); return info; }

    const sea = this.sea;
    // --- Ocean & coast ---
    if (this.hasSea && h <= sea) {
      info.depth = sea - h;
      if (temp < 0.13 && fbm2(tx / 25, ty / 25, s + 12, 3) > 0.35) info.g = Ground.ICE;
      else info.g = info.depth < 0.012 ? Ground.SHALLOW_WATER : Ground.DEEP_WATER;
      info.zone = info.g === Ground.SHALLOW_WATER ? SeaZone.COAST : seaZone(info.depth / Math.max(1e-4, sea), this.depthQ);
      return info;
    }
    const alt = (h - sea) / Math.max(0.05, 1 - sea);

    // --- Rivers from the planet map (meandering band along the accumulation ridge) ---
    const acc = gen.waterAccumulation;
    const rmx = mx + (fbm2(tx / 38, ty / 38, s + 13, 3) - 0.5) * 0.9;
    const rmy = my + (fbm2(tx / 38, ty / 38, s + 14, 3) - 0.5) * 0.9;
    let M = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) M = Math.max(M, this.at(acc, rmx + dx, rmy + dy));
    if (M > 2) {
      const c = this.bil(acc, rmx, rmy) / M;
      if (c > 0.86) { info.g = Ground.RIVER_WATER; info.depth = (c - 0.86) * 0.2; info.zone = SeaZone.COAST; return info; }
      if (c > 0.72) info.wet = Math.max(info.wet, (c - 0.72) / 0.14);
    } else if (M >= 1) info.wet = Math.max(info.wet, 0.25);

    // --- Creeks: ridged-noise network in wetter lowlands ---
    if (moist > 0.38 && alt < 0.6 && temp > 0.12) {
      const r = ridge(tx / 130, ty / 130, s + 9, 3);
      const width = 0.011 + (moist - 0.38) * 0.012;
      if (r > 1 - width) { info.g = Ground.RIVER_WATER; info.depth = 0.004; info.zone = SeaZone.COAST; return info; }
      if (r > 1 - width * 3.2) info.wet = Math.max(info.wet, (r - (1 - width * 3.2)) / (width * 2.2));
    }
    // --- Ponds & swamps ---
    const p = fbm2(tx / 34, ty / 34, s + 10, 3);
    const pondT = this.type === PlanetType.SWAMP_WORLD ? 0.6 : 0.745 - (moist - 0.5) * 0.08;
    if (moist > 0.5 && temp > 0.15 && alt < 0.5 && p > pondT) {
      info.g = moist > 0.82 || this.type === PlanetType.SWAMP_WORLD ? Ground.SWAMP_WATER : Ground.SHALLOW_WATER;
      info.depth = (p - pondT) * 0.1;
      info.zone = SeaZone.COAST;
      return info;
    }
    if (moist > 0.5 && p > pondT - 0.035) info.wet = Math.max(info.wet, (p - (pondT - 0.035)) / 0.035);

    // --- Land ---
    const biome = this.classify(temp, moist);
    info.biome = biome;
    if (this.vita < 0.9) info.veg = vegAmount(this.vita, this.bil(this.gen.coast!, mx, my), moist, fbm2(tx / 220, ty / 220, s + 40, 3));
    const coast = this.hasSea && h - sea < 0.0024 + (vnoise(tx / 9, ty / 9, s + 15) - 0.5) * 0.002;
    const nPatch = fbm2(tx / 16, ty / 16, s + 16, 3);
    const nPatch2 = fbm2(tx / 23, ty / 23, s + 17, 3);

    // Forest density: base per biome modulated into groves & clearings
    const base = FOREST_BASE[biome] ?? 0.1;
    const fn = fbm2(tx / 52, ty / 52, s + 11, 4);
    let forest = smoothstep(0.52, 0.7, fn + base * 0.45 - 0.2) * Math.min(1, 0.55 + moist * 0.8);
    if (base < 0.2) forest *= 0.35 + base;
    info.forest = coast ? forest * 0.2 : forest;

    if (coast) {
      info.beach = true;
      info.g = temp < 0.3 || nPatch2 > 0.68 ? Ground.GRAVEL : Ground.SAND;
      return info;
    }
    if (alt > 0.62 + (nPatch - 0.5) * 0.25 || (nPatch2 > 0.8 && alt > 0.25)) { info.g = Ground.STONE; info.forest *= 0.3; return info; }
    if (fbm2(tx / 13, ty / 13, s + 18, 2) > 0.84) { info.g = Ground.STONE; info.forest *= 0.2; return info; } // small outcrops

    // Riverbanks / wetlands: mud, clay, peat, marsh
    if (info.wet > 0.35) {
      const k = vnoise(tx / 7, ty / 7, s + 19);
      if (temp < 0.35 && info.wet > 0.5) info.g = Ground.PEAT;
      else if (k > 0.72) info.g = temp > 0.5 ? Ground.CLAY : Ground.BLUE_CLAY;
      else if (k < 0.3) info.g = Ground.MUD;
      else if (biome === BiomeType.SUBTROPICAL_DESERT || biome === BiomeType.COLD_DESERT) info.g = Ground.SAND;
      else info.g = Ground.MARSH;
      return info;
    }
    // Scattered clay pits (VS style surface deposits)
    if (vnoise(tx / 5, ty / 5, s + 20) > 0.93 && fbm2(tx / 60, ty / 60, s + 21, 2) > 0.55 && moist > 0.3) {
      info.g = temp > 0.45 ? Ground.CLAY : Ground.BLUE_CLAY; return info;
    }

    const dense = info.forest > 0.45;
    switch (biome) {
      case BiomeType.SNOW: info.g = nPatch > 0.75 ? Ground.STONE : nPatch > 0.66 ? Ground.GRAVEL : Ground.SNOW; break;
      case BiomeType.TUNDRA: info.g = nPatch > 0.68 ? Ground.SNOW : nPatch2 > 0.7 ? Ground.GRAVEL : moist > 0.6 && nPatch < 0.35 ? Ground.PEAT : Ground.TUNDRA; break;
      case BiomeType.TAIGA: info.g = dense ? Ground.NEEDLES : nPatch > 0.72 ? Ground.SNOW : moist > 0.7 && nPatch < 0.3 ? Ground.PEAT : Ground.TUNDRA; break;
      case BiomeType.COLD_DESERT: info.g = nPatch > 0.6 ? Ground.GRAVEL : nPatch < 0.35 ? Ground.DRY_GRASS : Ground.DIRT; break;
      case BiomeType.STEPPE: info.g = nPatch > 0.72 ? Ground.DIRT : dense ? Ground.GRASS : Ground.DRY_GRASS; break;
      case BiomeType.GRASSLAND: info.g = dense ? Ground.FOREST_FLOOR : nPatch > 0.76 ? Ground.DIRT : nPatch2 > 0.55 ? Ground.LUSH_GRASS : Ground.GRASS; break;
      case BiomeType.SEASONAL_FOREST: info.g = dense ? Ground.FOREST_FLOOR : nPatch2 > 0.6 ? Ground.LUSH_GRASS : Ground.GRASS; break;
      case BiomeType.TEMPERATE_RAINFOREST: info.g = dense ? (nPatch > 0.6 ? Ground.NEEDLES : Ground.FOREST_FLOOR) : Ground.LUSH_GRASS; break;
      case BiomeType.SAVANNA: info.g = nPatch > 0.7 ? Ground.DIRT : Ground.DRY_GRASS; break;
      case BiomeType.SUBTROPICAL_DESERT: info.g = nPatch2 > 0.78 ? Ground.SALT_FLAT : nPatch > 0.55 ? Ground.RED_SAND : Ground.SAND; break;
      case BiomeType.TROPICAL_RAINFOREST: info.g = dense ? Ground.JUNGLE_FLOOR : nPatch > 0.7 ? Ground.MUD : Ground.LUSH_GRASS; break;
    }
    return info;
  }

  private barrenGround(info: TileInfo, tx: number, ty: number) {
    const s = this.seed;
    const n = fbm2(tx / 18, ty / 18, s + 30, 3);
    const n2 = fbm2(tx / 40, ty / 40, s + 31, 3);
    const lowland = info.h < this.gen.config.seaLevel;
    switch (this.mode) {
      case 'arid': info.g = n > 0.7 ? Ground.STONE : n2 > 0.62 ? Ground.GRAVEL : n < 0.3 ? Ground.DIRT : Ground.RED_SAND; break;
      case 'airless': {
        // Craters on a jittered grid
        const cs = 48, gx = Math.floor(tx / cs), gy = Math.floor(ty / cs);
        let crater = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = (gx + dx) * cs + rand2(gx + dx, gy + dy, s + 32) * cs, cy = (gy + dy) * cs + rand2(gx + dx, gy + dy, s + 33) * cs;
          const r = 6 + rand2(gx + dx, gy + dy, s + 34) * 18;
          if (rand2(gx + dx, gy + dy, s + 35) > 0.55) continue;
          const d = Math.hypot(tx - cx, ty - cy) / r;
          if (d < 1.25) crater = Math.max(crater, d < 0.85 ? 1 : 2);
          if (d < 0.85) info.h -= (0.85 - d) * 0.02; else if (d < 1.25) info.h += (1.25 - d) * 0.01;
        }
        info.g = crater === 2 ? Ground.GRAVEL : n > 0.72 ? Ground.STONE : Ground.REGOLITH;
        break;
      }
      case 'glacial': info.g = n > 0.72 ? Ground.STONE : lowland && n2 < 0.45 ? Ground.ICE : n2 > 0.65 ? Ground.GRAVEL : Ground.SNOW; break;
      case 'frozen': info.g = n > 0.8 ? Ground.STONE : n2 > 0.55 ? Ground.SNOW : Ground.ICE; break;
      case 'volcanic': {
        const lava = ridge(tx / 90, ty / 90, s + 36, 3);
        const lowLava = info.h < 0.3 + (this.gen.config.volcanicActivity || 0.5) * 0.15;
        if ((lava > 0.975 && this.type !== PlanetType.ASH_WORLD) || (lowLava && n2 > 0.55)) { info.g = Ground.LAVA; info.depth = 0.01; }
        else info.g = this.type === PlanetType.ASH_WORLD ? (n > 0.75 ? Ground.STONE : Ground.ASH) : n > 0.6 ? Ground.STONE : n2 > 0.55 ? Ground.ASH : Ground.STONE;
        if (lava > 0.94 && info.g !== Ground.LAVA) info.wet = 1; // lava bank
        break;
      }
      case 'toxic': info.g = n > 0.68 ? Ground.SULFUR_CRUST : n2 > 0.6 ? Ground.ASH : Ground.STONE; break;
      case 'carbon': info.g = n > 0.7 ? Ground.STONE : Ground.GRAPHITE; break;
    }
  }

  /** Nearest walkable tile near a map pixel, spiralling outwards. */
  spawn(mapX: number, mapY: number): { tx: number; ty: number } {
    const cx = Math.floor((mapX + 0.5) * this.S), cy = Math.floor((mapY + 0.5) * this.S);
    for (let r = 0; r < 900; r += 3) {
      const steps = Math.max(1, Math.floor(r * 0.8));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const tx = cx + Math.round(Math.cos(a) * r), ty = cy + Math.round(Math.sin(a) * r);
        const t = this.tile(tx, ty);
        if (!isWater(t.g) && t.g !== Ground.LAVA && t.forest < 0.6) return { tx, ty };
      }
    }
    return { tx: cx, ty: cy };
  }

  // ---------------------------------------------------------------------------
  // Regional LOD: one colour per sampled tile (no rasterising, no features) - cheap enough to cover
  // thousands of tiles around the player when the camera zooms out.
  // ---------------------------------------------------------------------------
  region(tx0: number, ty0: number, step: number, n: number): Uint8ClampedArray {
    const M = n + 1; // one extra sample row/column for hill shading
    const lv = new Float32Array(M * M);
    const cols = new Float32Array(M * M * 3);
    const R = this.ramps as Record<string, RGB[]>;
    const vh = vegetationHueShift(this.gen.config.vegetationHue, this.type === PlanetType.ALIEN_LIFE);
    const canopy = { oak: shiftRamp(LEAF.oak, vh), pine: shiftRamp(LEAF.pine, vh), jungle: shiftRamp(LEAF.oak, vh * 0.5 + 12) };
    const rampOf: Partial<Record<Ground, RGB[]>> = {
      [Ground.DEEP_WATER]: R.water, [Ground.SHALLOW_WATER]: R.shallow, [Ground.RIVER_WATER]: R.shallow, [Ground.SWAMP_WATER]: R.swampWater,
      [Ground.ICE]: R.ice, [Ground.SAND]: R.sand, [Ground.RED_SAND]: R.redSand, [Ground.GRAVEL]: R.gravel, [Ground.GRASS]: R.grass,
      [Ground.LUSH_GRASS]: R.lushGrass, [Ground.DRY_GRASS]: R.dryGrass, [Ground.TUNDRA]: R.tundra, [Ground.SNOW]: R.snow,
      [Ground.FOREST_FLOOR]: R.forest, [Ground.NEEDLES]: R.needles, [Ground.JUNGLE_FLOOR]: R.jungle, [Ground.DIRT]: R.dirt, [Ground.MUD]: R.mud,
      [Ground.CLAY]: R.clay, [Ground.BLUE_CLAY]: R.blueClay, [Ground.PEAT]: R.peat, [Ground.MARSH]: R.marsh, [Ground.REGOLITH]: R.regolith,
      [Ground.LAVA]: R.lava, [Ground.ASH]: R.ash, [Ground.SULFUR_CRUST]: R.sulfur, [Ground.GRAPHITE]: R.graphite, [Ground.SALT_FLAT]: R.snow,
    };
    const tiles: TileInfo[] = new Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const tx = tx0 + (i - 1) * step + (step >> 1), ty = ty0 + (j - 1) * step + (step >> 1);
      const t = this.tile(tx, ty);
      tiles[j * M + i] = t;
      lv[j * M + i] = this.levelOf(t, tx, ty);
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const tx = tx0 + (i - 1) * step + (step >> 1), ty = ty0 + (j - 1) * step + (step >> 1);
      const k = j * M + i;
      const t = tiles[k], L = lv[k];
      // same high-ground rules as chunk(): snow caps on cold peaks, bare rock on cliffs
      if (L >= 3 && !isWater(t.g) && t.g !== Ground.LAVA) {
        const n = vnoise(tx / 5, ty / 5, this.seed + 85);
        const steep = step <= 2 && i > 0 && j > 0 && (Math.abs(L - lv[k - 1]) >= 2 || Math.abs(L - lv[k - M]) >= 2);
        if (L >= 8 && t.temp < 0.45 && n > 0.25) { t.g = Ground.SNOW; t.forest *= 0.2; }
        else if (steep) { t.g = n > 0.7 ? Ground.GRAVEL : Ground.STONE; t.forest *= 0.25; }
      }
      let c: RGB;
      if (t.g === Ground.STONE) { const r = ROCK_RAMPS[t.rock]; c = r[3]; }
      else {
        const r = rampOf[t.g] ?? R.dirt;
        const n = vnoise(tx / 7, ty / 7, this.seed + 91);
        c = t.g === Ground.DEEP_WATER ? r[Math.max(0, Math.round(3.2 - Math.min(1, t.depth * 18) * 3))] : r[Math.round(2 + n * 1.6)];
      }
      if (t.forest > 0.05 && !isWater(t.g)) {
        const cr = t.biome === BiomeType.TAIGA || t.temp < 0.35 ? canopy.pine : t.biome === BiomeType.TROPICAL_RAINFOREST ? canopy.jungle : canopy.oak;
        const n = rand2(tx >> 1, ty >> 1, this.seed + 92);
        const leaf = cr[n > 0.7 ? 3 : n > 0.3 ? 2 : 1];
        const k2 = Math.min(1, t.forest * 1.25) * (0.55 + n * 0.45);
        c = [c[0] + (leaf[0] - c[0]) * k2, c[1] + (leaf[1] - c[1]) * k2, c[2] + (leaf[2] - c[2]) * k2];
      }
      if (CITIES.size) {
        const [cz, ce] = cityTile(tx, ty);
        if (cz && (!isWater(t.g) || cz === CZ.BRIDGE)) c = cityRegionColor(cz, ce, c, CITY_ZONES) ?? c;
      }
      cols[k * 3] = c[0]; cols[k * 3 + 1] = c[1]; cols[k * 3 + 2] = c[2];
    }
    const out = new Uint8ClampedArray(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j + 1) * M + i + 1;
      const L = lv[k];
      // light from the north-west: terraces facing it glow, the ones turned away fall into shade
      const slope = (lv[k - M] - L) + (lv[k - 1] - L) * 0.6;
      const sh = (1 + L * 0.03) * (slope > 0 ? Math.max(0.55, 1 - slope * 0.16) : Math.min(1.25, 1 - slope * 0.07));
      const o = (j * n + i) * 4;
      out[o] = cols[k * 3] * sh; out[o + 1] = cols[k * 3 + 1] * sh; out[o + 2] = cols[k * 3 + 2] * sh; out[o + 3] = 255;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Chunk generation
  // ---------------------------------------------------------------------------
  chunk(cx: number, cy: number): ChunkData {
    const tx0 = cx * CHUNK - B, ty0 = cy * CHUNK - B;
    const tiles: TileInfo[] = new Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const t = this.tile(tx0 + i, ty0 + j);
      t.lv = this.levelOf(t, tx0 + i, ty0 + j);
      tiles[j * N + i] = t;
    }
    const city = this.applyCities(tiles, tx0, ty0);
    // Walkable slopes: clustered stretches of a terrace edge become ramps
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const t = tiles[j * N + i];
      if (t.cz && (isGraded(t.cz) || isWallish(t.cz))) {
        // graded streets carry their own ramps (kept only where the neighbour really is one level down)
        if (t.rd && !isWallish(t.cz)) {
          const [dx, dy] = t.rd === 1 ? [0, 1] : t.rd === 2 ? [0, -1] : t.rd === 3 ? [1, 0] : [-1, 0];
          const ii = i + dx, jj = j + dy;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N && tiles[jj * N + ii].lv === t.lv - 1) t.ramp = true; else t.rd = 0;
        } else t.rd = 0;
        continue;
      }
      if (t.lv === 0 || isWater(t.g)) continue;
      let cliff = false, dS = false, dN = false, dE = false, dW = false;
      for (const [dx, dy] of NB4) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const d = t.lv - tiles[jj * N + ii].lv;
        if (d === 1) { if (dy === 1) dS = true; else if (dy === -1) dN = true; else if (dx === 1) dE = true; else dW = true; }
        else if (d > 1) cliff = true;
      }
      if (cliff || !(dS || dN || dE || dW)) continue;
      // narrow natural trails: in each 6-tile cell along the edge, at most one 2-tile-wide stairway
      const gx = tx0 + i, gy = ty0 + j;
      const along = dS || dN ? gx : gy;          // position along the terrace edge
      const cell = Math.floor(along / 6), other = Math.floor((dS || dN ? gy : gx) / 3);
      const pick = Math.floor(rand2(cell, other, this.seed + 81) * 4);
      if (rand2(cell, other, this.seed + 82) < 0.7 && (((along % 6) + 6) % 6 === pick || ((along % 6) + 6) % 6 === pick + 1)) t.ramp = true;
    }

    // Steep terrain turns rocky: scree on multi-level slopes, bare rock and snow on high peaks
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const t = tiles[j * N + i];
      if (t.lv < 3 || isWater(t.g) || t.g === Ground.LAVA) continue;
      let steep = 0, edge = false;
      for (const [dx, dy] of NB4) {
        const d = Math.abs(t.lv - tiles[(j + dy) * N + i + dx].lv);
        if (d >= 2) steep++;
        if (d >= 1) edge = true;
      }
      const n = vnoise((tx0 + i) / 5, (ty0 + j) / 5, this.seed + 85);
      if (t.lv >= 8 && t.temp < 0.45 && n > 0.25) { t.g = Ground.SNOW; t.forest *= 0.2; }
      else if (steep >= 2 || (steep === 1 && n > 0.5)) { t.g = n > 0.7 ? Ground.GRAVEL : Ground.STONE; t.forest *= 0.25; }
      else if (edge && !t.ramp && t.lv >= 4 && n > 0.72) { t.g = Ground.GRAVEL; t.forest *= 0.6; }
    }

    // Water proximity (for reeds, wet shores)
    const nearWater = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let d = 9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        if (isWater(tiles[jj * N + ii].g)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      }
      nearWater[j * N + i] = d;
    }

    const pixels = this.raster(cx, cy, tiles, nearWater, city);
    const falls: ChunkData['falls'] = [];
    const rows = this.compose(cx, cy, tiles, pixels, falls, this.lastLiquid!);
    let features = this.place(cx, cy, tiles, nearWater);
    if (city) {
      // the city clears trees, rocks and logs in its way (lumber camps keep their woods)
      features = features.filter(f => {
        const i = Math.floor(f.x / TILE) - cx * CHUNK + B, j = Math.floor(f.y / TILE) - cy * CHUNK + B;
        const t = tiles[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))];
        return !t.cz || keepFeature(t.cz, f.t, rand2(f.x, f.y, this.seed + 720));
      });
    }

    const ground = new Uint8Array(CHUNK * CHUNK), biome = new Uint8Array(CHUNK * CHUNK), rock = new Uint8Array(CHUNK * CHUNK);
    const temp = new Float32Array(CHUNK * CHUNK);
    const level = new Uint8Array(CHUNK * CHUNK), ramp = new Uint8Array(CHUNK * CHUNK), lava = new Uint8Array(CHUNK * CHUNK);
    const zone = new Uint8Array(CHUNK * CHUNK);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const t = tiles[(j + B) * N + i + B];
      const k = j * CHUNK + i;
      ground[k] = t.g; biome[k] = t.biome; rock[k] = t.rock; temp[k] = t.temp;
      zone[k] = t.zone | (t.veg >= 0.5 ? 4 : 0);
      level[k] = t.lv; lava[k] = t.g === Ground.LAVA ? 1 : 0;
      if (t.ramp) {
        const n = tiles[(j + B - 1) * N + i + B].lv, so = tiles[(j + B + 1) * N + i + B].lv, e = tiles[(j + B) * N + i + B + 1].lv, w = tiles[(j + B) * N + i + B - 1].lv;
        ramp[k] = t.rd || (so === t.lv - 1 ? 1 : e === t.lv - 1 ? 3 : w === t.lv - 1 ? 4 : n === t.lv - 1 ? 2 : 0); // 1=S 2=N 3=E 4=W
      }
    }
    const mini = new Uint8ClampedArray(CHUNK * CHUNK * 4);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const gk = ((j * TILE + 8) * CHUNK_PX + i * TILE + 8) * 4, mk = (j * CHUNK + i) * 4;
      const lvl = 1 + level[j * CHUNK + i] * 0.035;
      mini[mk] = pixels[gk] * lvl; mini[mk + 1] = pixels[gk + 1] * lvl; mini[mk + 2] = pixels[gk + 2] * lvl; mini[mk + 3] = 255;
      if (ramp[j * CHUNK + i]) { mini[mk] = 235; mini[mk + 1] = 215; mini[mk + 2] = 160; }
    }
    return { cx, cy, rows, ground, biome, rock, temp, level, ramp, lava, falls, features, mini, zone };
  }

  /** Stamps the visible city tiles onto a chunk window (codes, graded levels, road ramps). */
  private applyCities(tiles: TileInfo[], tx0: number, ty0: number): boolean {
    if (!CITIES.size) return false;
    let any = false;
    const c0x = Math.floor(tx0 / CHUNK), c0y = Math.floor(ty0 / CHUNK);
    const c1x = Math.floor((tx0 + N - 1) / CHUNK), c1y = Math.floor((ty0 + N - 1) / CHUNK);
    for (const L of CITIES.values()) {
      for (let ccy = c0y; ccy <= c1y; ccy++) for (let ccx = c0x; ccx <= c1x; ccx++) {
        const d = L.chunks.get(`${ccx},${ccy}`);
        if (!d) continue;
        const ax = Math.max(tx0, ccx * CHUNK), bx = Math.min(tx0 + N, (ccx + 1) * CHUNK);
        const ay = Math.max(ty0, ccy * CHUNK), by = Math.min(ty0 + N, (ccy + 1) * CHUNK);
        for (let ty = ay; ty < by; ty++) for (let tx = ax; tx < bx; tx++) {
          const q = (ty - ccy * CHUNK) * CHUNK + tx - ccx * CHUNK;
          const c = d.code[q];
          if (!c || d.stage[q] > L.p) continue;
          const t = tiles[(ty - ty0) * N + tx - tx0];
          t.cz = c; t.ce = L.era; t.rd = d.rd[q];
          if (d.lvl[q] !== 255) t.lv = d.lvl[q];
          any = true;
        }
      }
    }
    return any;
  }

  // ---------------------------------------------------------------------------
  // Ground rasterizer: organic edges (jittered tile lookup), palette-quantised shading,
  // hillshade, shore foam & wet banks, and baked micro-detail (blades, leaves, pebbles...)
  // ---------------------------------------------------------------------------
  private raster(cx: number, cy: number, tiles: TileInfo[], nearWater: Uint8Array, city = false): Uint8ClampedArray {
    const out = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4);
    const liq = new Uint8Array(CHUNK_PX * CHUNK_PX); // 1 river, 2 still water, 3 swamp, 4 lava, 5 foam
    this.lastLiquid = liq;
    const s = this.seed;
    const R = this.ramps;
    const px0 = cx * CHUNK_PX, py0 = cy * CHUNK_PX;

    // Per-tile hillshade (light from the upper-left)
    const shade = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = (ii: number, jj: number) => tiles[Math.max(0, Math.min(N - 1, jj)) * N + Math.max(0, Math.min(N - 1, ii))].h;
      const dx = h(i + 1, j) - h(i - 1, j), dy = h(i, j + 1) - h(i, j - 1);
      shade[j * N + i] = Math.max(-1.6, Math.min(1.6, (dx + dy) * 260));
    }
    const depthG = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) depthG[i] = tiles[i].depth;
    const lookup = (lx: number, ly: number) => {
      const i = Math.max(0, Math.min(N - 1, Math.floor(lx / TILE) + B));
      const j = Math.max(0, Math.min(N - 1, Math.floor(ly / TILE) + B));
      return j * N + i;
    };
    const rockRamps = ROCK_RAMPS;
    const leafColors: RGB[] = [hex('#7a4a1c'), hex('#9a5a22'), hex('#b8742c'), hex('#6b3b18'), hex('#a88a3a'), hex('#5b2e14')];
    const flowerColors: RGB[] = [hex('#f7e05a'), hex('#ffffff'), hex('#b58cf0'), hex('#f06a6a'), hex('#7fb0ff')];

    // Half-resolution fields (edge jitter + colour patches): 4x fewer noise evaluations
    const HR = CHUNK_PX / 2 + 1;
    const JX = new Float32Array(HR * HR), JY = new Float32Array(HR * HR), PA = new Float32Array(HR * HR);
    for (let j = 0; j < HR; j++) for (let i = 0; i < HR; i++) {
      const wx = px0 + i * 2, wy = py0 + j * 2;
      JX[j * HR + i] = (vnoise(wx / 7, wy / 7, s + 40) - 0.5) * 11;
      JY[j * HR + i] = (vnoise(wx / 7, wy / 7, s + 41) - 0.5) * 11;
      PA[j * HR + i] = vnoise(wx / 11, wy / 11, s + 42);
    }
    // Which tiles need shore/bank probing at all
    const landNear = new Uint8Array(N * N);
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
        const g2 = tiles[(j + dy) * N + i + dx].g;
        if (!isWater(g2) && g2 !== Ground.LAVA) { any = 1; break; }
      }
      landNear[j * N + i] = any;
    }

    for (let py = 0; py < CHUNK_PX; py++) {
      for (let px = 0; px < CHUNK_PX; px++) {
        const wx = px0 + px, wy = py0 + py;
        const hk = (py >> 1) * HR + (px >> 1);
        const jx = JX[hk], jy = JY[hk];
        let ti = lookup(px + jx, py + jy);
        const own = lookup(px, py);
        if (tiles[ti].lv !== tiles[own].lv) ti = own; // crisp terrace edges
        const t = tiles[ti];
        const g = t.g;
        const r0 = rand2(wx, wy, s);
        // bilinear hillshade
        const fx = (px + TILE / 2) / TILE + B - 1, fy = (py + TILE / 2) / TILE + B - 1;
        const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
        const sh = shade[iy * N + ix] * (1 - ax) * (1 - ay) + shade[iy * N + ix + 1] * ax * (1 - ay) +
          shade[(iy + 1) * N + ix] * (1 - ax) * ay + shade[(iy + 1) * N + ix + 1] * ax * ay;
        const patch = PA[hk];
        let ramp: RGB[] = R.grass;
        let idx = 2 + (patch - 0.5) * 1.6 + (r0 - 0.5) * 0.9 + sh;
        let col: RGB | null = null;

        if (isWater(g) || g === Ground.LAVA) {
          // distance to shore (approx) from jittered probes
          let shore = 0;
          if (landNear[ti]) {
            const bxp = px + jx * 0.4, byp = py + jy * 0.4;
            for (let q = 0; q < SHORE_PROBES.length; q += 3) {
              const w = SHORE_PROBES[q + 2];
              if (w <= shore) continue;
              const g2 = tiles[lookup(bxp + SHORE_PROBES[q], byp + SHORE_PROBES[q + 1])].g;
              if (!isWater(g2) && g2 !== Ground.LAVA) shore = w;
            }
          }
          if (g === Ground.LAVA) {
            ramp = R.lava;
            const crust = ridge(wx / 14, wy / 14, s + 43, 2);
            idx = 1.5 + vnoise(wx / 6, wy / 6, s + 44) * 3.5 - (crust > 0.9 ? 2.5 : 0) - shore * 1.5;
          } else {
            ramp = g === Ground.SWAMP_WATER ? R.swampWater : g === Ground.DEEP_WATER ? R.water : R.shallow;
            const dep = depthG[iy * N + ix] * (1 - ax) * (1 - ay) + depthG[iy * N + ix + 1] * ax * (1 - ay) +
              depthG[(iy + 1) * N + ix] * (1 - ax) * ay + depthG[(iy + 1) * N + ix + 1] * ax * ay;
            const depth = g === Ground.DEEP_WATER ? Math.min(1, dep * 18) : 0;
            idx = (g === Ground.DEEP_WATER ? 3.4 - depth * 3.4 : 1.7) + (patch - 0.5) * 0.8 + shore * 1.8;
            const wave = Math.sin(wx * 0.35 + vnoise(wx / 20, wy / 9, s + 45) * 9 + wy * 0.08);
            if (wave > 0.93 && r0 > 0.3) idx += 1.3;
            if (g === Ground.SWAMP_WATER && vnoise(wx / 3, wy / 3, s + 46) > 0.72) { col = mix(R.marsh[3], R.marsh[4], r0); }
            if (shore >= 1 && r0 > 0.25) col = [226, 238, 240]; // foam
          }
        } else {
          switch (g) {
            case Ground.GRASS: case Ground.LUSH_GRASS: case Ground.DRY_GRASS: case Ground.MARSH: {
              ramp = g === Ground.GRASS ? R.grass : g === Ground.LUSH_GRASS ? R.lushGrass : g === Ground.DRY_GRASS ? R.dryGrass : R.marsh;
              // two-pixel grass blades
              idx = 2.5 + (patch - 0.5) * 2.4 + (r0 - 0.5) * 0.6 + sh;
              const b0 = rand2(wx, wy, s + 50), b1 = rand2(wx, wy + 1, s + 50);
              if (b0 > 0.955 || b1 > 0.955) idx += 1.3; else if (rand2(wx, wy - 1, s + 50) > 0.955) idx -= 1.2;
              if (g === Ground.MARSH && vnoise(wx / 5, wy / 5, s + 51) > 0.7) { ramp = R.swampWater; idx = 2 + r0; }
              if (g !== Ground.DRY_GRASS && g !== Ground.MARSH && rand2(wx >> 1, wy >> 1, s + 52) < 0.0012 && (wx & 1) === 0) col = flowerColors[hash3(wx >> 1, wy >> 1, s) % flowerColors.length];
              break;
            }
            case Ground.FOREST_FLOOR: {
              ramp = R.forest;
              const cxl = Math.floor(wx / 3), cyl = Math.floor(wy / 3);
              const lr = rand2(cxl, cyl, s + 53);
              if (vnoise(wx / 9, wy / 9, s + 75) > 0.64) { ramp = R.moss; idx = 1.6 + (patch - 0.5) * 2 + r0 * 0.8 + sh; break; }
              if (lr < 0.38) {
                const lc = leafColors[hash3(cxl, cyl, s + 54) % leafColors.length];
                const edge = (wx % 3 === 0 || wy % 3 === 0) && rand2(wx, wy, s + 55) > 0.5;
                col = edge ? [lc[0] * 0.75, lc[1] * 0.75, lc[2] * 0.75] : lc;
                col = shadeCol(col, sh);
              } else if (lr > 0.93) { ramp = R.lushGrass; idx = 2 + r0; } // moss / seedlings
              break;
            }
            case Ground.NEEDLES: {
              ramp = R.needles;
              if (vnoise(wx / 10, wy / 10, s + 76) > 0.62) { ramp = R.moss; idx = 1.4 + (patch - 0.5) * 2 + r0 * 0.8 + sh; break; }
              if (((wx + wy) & 3) === 0 && r0 > 0.45) idx += 1.3;
              if (((wx - wy) & 3) === 0 && rand2(wx, wy, s + 56) > 0.6) idx -= 1;
              break;
            }
            case Ground.JUNGLE_FLOOR: {
              ramp = R.jungle;
              if (rand2(wx >> 2, wy >> 2, s + 57) > 0.55) idx += (rand2(wx, wy, s + 58) > 0.5 ? 1.2 : -0.6);
              break;
            }
            case Ground.TUNDRA: {
              ramp = R.tundra;
              const lich = vnoise(wx / 4, wy / 4, s + 59);
              if (lich > 0.8) col = r0 > 0.5 ? [198, 180, 110] : [170, 190, 150];
              break;
            }
            case Ground.SNOW: {
              ramp = R.snow; idx = 3.3 + (patch - 0.5) * 1.2 + sh * 1.3;
              if (r0 > 0.994) idx = 5.5;
              break;
            }
            case Ground.SAND: case Ground.RED_SAND: {
              ramp = g === Ground.SAND ? R.sand : R.redSand;
              const dune = Math.sin(wx * 0.11 + wy * 0.04 + vnoise(wx / 30, wy / 30, s + 60) * 8);
              idx = 2.6 + (patch - 0.5) * 0.9 + (r0 - 0.5) * 0.7 + sh + dune * 0.55;
              if (t.beach && rand2(wx >> 1, wy >> 1, s + 61) > 0.985) col = [236, 228, 214];
              break;
            }
            case Ground.GRAVEL: case Ground.DIRT: {
              ramp = g === Ground.GRAVEL ? R.gravel : R.dirt;
              const cell = g === Ground.GRAVEL ? 4 : 6;
              const gx = Math.floor(wx / cell), gy = Math.floor(wy / cell);
              if (g === Ground.GRAVEL || rand2(gx, gy, s + 62) > 0.75) {
                const pcx = gx * cell + 1 + rand2(gx, gy, s + 63) * (cell - 2), pcy = gy * cell + 1 + rand2(gx, gy, s + 64) * (cell - 2);
                const d = Math.hypot(wx + 0.5 - pcx, wy + 0.5 - pcy);
                const pr = g === Ground.GRAVEL ? 1.7 : 1.2;
                if (d < pr) {
                  const rr = rockRamps[t.rock];
                  const li = 2.5 + ((pcx - wx) + (pcy - wy)) * 0.8 + rand2(gx, gy, s + 65) * 1.5;
                  col = rr[Math.max(0, Math.min(rr.length - 1, Math.round(li)))];
                } else if (g === Ground.GRAVEL) idx -= 0.8;
              }
              break;
            }
            case Ground.MUD: {
              ramp = R.mud;
              if (r0 > 0.97) idx += 2.5;
              if (vnoise(wx / 6, wy / 6, s + 66) > 0.72) { ramp = R.shallow; idx = 0.6 + r0 * 0.8; }
              break;
            }
            case Ground.CLAY: case Ground.BLUE_CLAY: {
              ramp = g === Ground.CLAY ? R.clay : R.blueClay;
              idx = 2.6 + (patch - 0.5) + sh;
              if (ridge(wx / 9, wy / 9, s + 67, 2) > 0.94) idx -= 1.6;
              break;
            }
            case Ground.PEAT: {
              ramp = R.peat;
              if (rand2(wx, wy >> 1, s + 68) > 0.8) idx += 1.2;
              if (rand2(wx >> 2, wy >> 2, s + 69) > 0.9) { ramp = R.moss; idx = 1.5 + r0; }
              break;
            }
            case Ground.STONE: {
              ramp = rockRamps[t.rock];
              idx = 2.4 + (patch - 0.5) * 1.8 + (r0 - 0.5) * 0.6 + sh * 1.4;
              const cr = ridge(wx / 12, wy / 12, s + 70, 2);
              if (cr > 0.95) idx -= 2; else if (cr > 0.91) idx += 0.8;
              if (this.mode === 'living' && t.moist > 0.55 && vnoise(wx / 5, wy / 5, s + 71) > 0.76) { ramp = R.moss; idx = 1.5 + r0 * 2; }
              break;
            }
            case Ground.REGOLITH: {
              ramp = R.regolith;
              if (r0 > 0.96) idx += 1.5; else if (r0 < 0.04) idx -= 1.5;
              break;
            }
            case Ground.ICE: {
              ramp = R.ice; idx = 3 + (patch - 0.5) * 1.5 + sh;
              if (ridge(wx / 16, wy / 16, s + 72, 2) > 0.965) idx = 5.5;
              break;
            }
            case Ground.ASH: {
              ramp = R.ash;
              if (r0 > 0.997) col = [255, 140, 40];
              break;
            }
            case Ground.SULFUR_CRUST: {
              ramp = R.sulfur;
              if (rand2(wx >> 1, wy >> 1, s + 73) > 0.8) idx += 1.3;
              break;
            }
            case Ground.GRAPHITE: {
              ramp = R.graphite;
              if (r0 > 0.985) idx = 5.5;
              break;
            }
            case Ground.SALT_FLAT: {
              ramp = [hex('#b8b2a4'), hex('#cfc9bb'), hex('#e0dccf'), hex('#ece9df'), hex('#f6f4ec'), hex('#ffffff')];
              if (ridge(wx / 10, wy / 10, s + 74, 1) > 0.93) idx -= 2;
              break;
            }
          }
          // Wet banks: land darkens right next to water
          if (!col && nearWater[ti] <= 1) {
            let near = false;
            const bxp = px + jx * 0.5, byp = py + jy * 0.5;
            if (isWater(tiles[lookup(bxp + 3, byp)].g) || isWater(tiles[lookup(bxp - 3, byp)].g) ||
                isWater(tiles[lookup(bxp, byp + 3)].g) || isWater(tiles[lookup(bxp, byp - 3)].g)) near = true;
            if (near) idx -= 1.1;
            // lava glow on banks
            if (this.mode === 'volcanic' && t.wet > 0) { col = null; idx -= 0.5; }
          }
        }
        const k = (py * CHUNK_PX + px) * 4;
        if (!col) {
          const ri = Math.max(0, Math.min(ramp.length - 1, Math.round(idx)));
          col = ramp[ri];
        }
        if (city) {
          const tt = tiles[own];
          let cz = tt.cz;
          // round the tile corners of streets and walls so diagonal runs read as smooth 45-degree bands
          const lx = px & 15, ly = py & 15;
          const qx = lx < 8 ? -1 : 1, qy = ly < 8 ? -1 : 1;
          if ((qx < 0 ? lx : 15 - lx) + (qy < 0 ? ly : 15 - ly) < 7) {
            const a = tiles[own + qx].cz, b = tiles[own + qy * N].cz, dg = tiles[own + qx + qy * N].cz;
            const k0 = strokeOf(cz);
            if (k0) { if (strokeOf(a) !== k0 && strokeOf(b) !== k0 && strokeOf(dg) !== k0) cz = !strokeOf(a) ? a : !strokeOf(b) ? b : 0; }
            else if (strokeOf(a) && strokeOf(a) === strokeOf(b) && !isWallish(cz) && cz !== CZ.PLAZA && (!isWater(tt.g) || a === CZ.BRIDGE)) cz = a;
          }
          if (cz && (!isWater(tt.g) || cz === CZ.BRIDGE || !(cz < CZ.ROAD)) && (CITY_ZONES || !isZone(cz))) {
            col = cityPixel(cz, tt.ce, wx, wy, lx, ly, col, tiles[own - N].cz, tiles[own + 1].cz, tiles[own + N].cz, tiles[own - 1].cz, s);
            if (cz >= CZ.ROAD) { out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255; continue; }
          }
        }
        out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
        if (g === Ground.LAVA) liq[k >> 2] = 4;
        else if (isWater(g)) liq[k >> 2] = col[0] > 200 && col[2] > 200 ? 5 : g === Ground.RIVER_WATER ? 1 : g === Ground.SWAMP_WATER ? 3 : 2;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Raised terrain: each tile row becomes a buffer where tiles are lifted by their level
  // and exposed south faces are painted as rock cliffs, grassy ramps or waterfalls.
  // ---------------------------------------------------------------------------
  private compose(cx: number, cy: number, tiles: TileInfo[], G: Uint8ClampedArray, falls: ChunkData['falls'], liq: Uint8Array): TerrainRow[] {
    const rows: TerrainRow[] = [];
    const s = this.seed;
    const R = this.ramps;
    for (let j = 0; j < CHUNK; j++) {
      const jj = j + B;
      let maxL = 0, minL = MAX_LEVEL;
      for (let i = 0; i < CHUNK; i++) {
        const lv = tiles[jj * N + i + B].lv;
        maxL = Math.max(maxL, lv);
        minL = Math.min(minL, lv, Math.max(0, Math.min(lv, tiles[(jj + 1) * N + i + B].lv)));
      }
      const H = TILE + (maxL - minL) * LIFT; // buffer spans only this row's own relief
      const buf = new Uint8ClampedArray(CHUNK_PX * H * 4);
      const animPx: number[] = []; // [bufIndex, wx, wy, kind, tileCol] * n
      const rowGroundY = (cy * CHUNK + j) * TILE;
      for (let i = 0; i < CHUNK; i++) {
        const t = tiles[jj * N + i + B];
        const L = t.lv;
        const north = tiles[(jj - 1) * N + i + B].lv, south = tiles[(jj + 1) * N + i + B].lv;
        const west = tiles[jj * N + i + B - 1].lv, east = tiles[jj * N + i + B + 1].lv;
        const top = (maxL - L) * LIFT;
        const wx0 = (cx * CHUNK + i) * TILE;
        if (t.ramp && !isWater(t.g) && t.g !== Ground.LAVA) {
          const dir = t.rd ? t.rd - 1 : south === L - 1 ? 0 : east === L - 1 ? 2 : west === L - 1 ? 3 : 1;
          const rampAt = (di: number, dj: number) => { const n = tiles[(jj + dj) * N + i + B + di]; return n.ramp && n.lv === L; };
          const [sa, sb] = dir <= 1 ? [rampAt(-1, 0), rampAt(1, 0)] : [rampAt(0, -1), rampAt(0, 1)];
          this.paintRamp(buf, H, i, top, t, L, dir, G, j, wx0, rowGroundY, south, sa, sb, t.rd > 0);
          continue;
        }
        // --- surface ---
        for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
          const gk = ((j * TILE + y) * CHUNK_PX + i * TILE + x) * 4;
          const bk = ((top + y) * CHUNK_PX + i * TILE + x) * 4;
          let r = G[gk], g = G[gk + 1], b = G[gk + 2];
          const bright = t.g === Ground.SNOW || t.g === Ground.ICE || t.g === Ground.SALT_FLAT;
          let k = bright ? 1 - Math.min(L, 6) * 0.012 : 1 + Math.min(L, 8) * 0.018; // higher terraces catch more light
          if (north < L && y === 0) k *= bright ? 1.04 : 1.22;               // lit crest
          if (north < L && y === 1) k *= 1.08;
          if (north > L && y < 4) k *= [0.55, 0.68, 0.8, 0.92][y];          // occlusion under a cliff
          if (west < L && x === 0) k *= 1.1;
          if (east < L && x === TILE - 1) k *= 0.72;
          if (west > L && x < 5) k *= [0.62, 0.72, 0.8, 0.88, 0.95][x];   // cliff shadow falls east
          // chamfer convex corners so terraces read as rounded rock, not boxes
          const cut = (south < L && west < L && x + (TILE - 1 - y) < 3) || (south < L && east < L && (TILE - 1 - x) + (TILE - 1 - y) < 3);
          if (cut && south < L) {
            const rk = ROCK_RAMPS[t.rock][1];
            buf[bk] = rk[0]; buf[bk + 1] = rk[1]; buf[bk + 2] = rk[2]; buf[bk + 3] = 255;
            continue;
          }
          buf[bk] = r * k; buf[bk + 1] = g * k; buf[bk + 2] = b * k; buf[bk + 3] = 255;
          const lq = liq[gk >> 2];
          if (lq) animPx.push(bk, wx0 + x, rowGroundY + y, lq, i);
        }
        // --- south face ---
        if (south >= L) continue;
        const fh = (L - south) * LIFT;
        const f0 = top + TILE;
        const water = isWater(t.g), lava = t.g === Ground.LAVA;
        const isRamp = t.ramp && L - south === 1 && !water && !lava;
        if (water) falls.push({ x: wx0, y: rowGroundY - maxL * LIFT + f0, w: TILE, h: fh });
        const rock = ROCK_RAMPS[t.rock];
        const veg = t.g === Ground.GRASS || t.g === Ground.LUSH_GRASS || t.g === Ground.FOREST_FLOOR || t.g === Ground.JUNGLE_FLOOR ||
          t.g === Ground.MARSH || t.g === Ground.NEEDLES || t.g === Ground.TUNDRA || t.g === Ground.DRY_GRASS;
        const snowy = t.g === Ground.SNOW;
        for (let x = 0; x < TILE; x++) {
          const wx = wx0 + x;
          const gkb = ((j * TILE + TILE - 1) * CHUNK_PX + i * TILE + x) * 4; // surface's bottom pixel colour
          const lip = veg || snowy ? 1 + Math.floor(rand2(wx, rowGroundY, s + 92) * (snowy ? 3 : 5)) : Math.floor(rand2(wx, rowGroundY, s + 92) * 2);
          for (let y = 0; y < fh; y++) {
            const bk = ((f0 + y) * CHUNK_PX + i * TILE + x) * 4;
            const fy = y / Math.max(1, fh - 1);
            let c: RGB;
            if (water || lava) {
              const wr = lava ? R.lava : R.shallow;
              const streak = rand2(wx, Math.floor((y + wx * 3) / 3), s + 93);
              let idx = lava ? 3 + streak * 2 : 2.5 + (streak > 0.6 ? 1.6 : 0) - fy * 0.8;
              if (!lava && y >= fh - 2) idx = 5.2;
              c = wr[Math.max(0, Math.min(wr.length - 1, Math.round(idx)))];
              if (!lava && y >= fh - 2 && rand2(wx, y, s + 94) > 0.4) c = [235, 245, 250];
            } else if (isRamp) {
              // the stairway continues down the face
              let v: number;
              if (x <= 1 || x >= TILE - 2) v = x <= 1 ? 1.2 : 0.4;
              else { const ph = y % 4; v = (ph === 0 ? 4.2 : ph === 3 ? 0.6 : 2.8 - ph * 0.4) - fy * 0.6; }
              c = rock[Math.max(0, Math.min(rock.length - 1, Math.round(v)))];
            } else if (y < lip) {
              const base: RGB = [G[gkb], G[gkb + 1], G[gkb + 2]];
              const k = snowy ? 1 : 0.72 - y * 0.08;
              c = [base[0] * k, base[1] * k, base[2] * k];
            } else {
              const band = Math.floor((y + (rowGroundY >> 1)) / 3);
              const strat = rand2(wx >> 2, band, s + 90);
              let idx = 3.4 - fy * 2.4 + (strat - 0.5) * 1.1;
              if (rand2(wx, y >> 2, s + 91) > 0.92) idx -= 1.6;           // vertical cracks
              if (x < 2) idx += 0.6;                                      // lit left edge
              if (x > TILE - 3) idx -= 0.4;
              if (y === fh - 1) idx = 0;
              if (t.moist > 0.6 && this.mode === 'living' && rand2(wx >> 1, y >> 1, s + 96) > 0.9) { c = R.moss[2]; }
              else c = rock[Math.max(0, Math.min(rock.length - 1, Math.round(idx)))];
            }
            buf[bk] = c[0]; buf[bk + 1] = c[1]; buf[bk + 2] = c[2]; buf[bk + 3] = 255;
          }
        }
      }
      rows.push({ y: rowGroundY - maxL * LIFT, h: H, px: buf, anim: animPx.length ? this.animateLiquid(buf, animPx, tiles, jj) : undefined });
    }
    return rows;
  }

  /**
   * Natural stairway: steps built from flat stones in the colour of the local ground (tinted towards
   * the bedrock), laid out in world coordinates so a two-tile stairway reads as one.
   * dir: 0 = descends south (towards the viewer), 1 = north (away), 2 = east, 3 = west.
   * Direction cues: going down towards the viewer every step shows its shaded front face; going away
   * only the bright lips show; sideways stairs really drop step by step with a rock wall above them.
   * sideA / sideB: whether the neighbours across the stairway (W/E for N-S stairs, N/S for E-W) are stairs too.
   */
  private paintRamp(buf: Uint8ClampedArray, H: number, i: number, top: number, t: TileInfo, L: number, dir: number,
    G: Uint8ClampedArray, j: number, wx0: number, rowGroundY: number, south: number, sideA: boolean, sideB: boolean, smooth = false) {
    const s = this.seed;
    const rk = ROCK_RAMPS[t.rock];
    const gpx = (x: number, y: number): RGB => {
      const k = ((j * TILE + (((y % TILE) + TILE) % TILE)) * CHUNK_PX + i * TILE + Math.max(0, Math.min(TILE - 1, x))) * 4;
      return [G[k], G[k + 1], G[k + 2]];
    };
    const put = (x: number, y: number, c: RGB, k = 1) => {
      if (x < 0 || x >= TILE || y < 0 || y >= H) return;
      const bk = (y * CHUNK_PX + i * TILE + x) * 4;
      buf[bk] = Math.min(255, c[0] * k); buf[bk + 1] = Math.min(255, c[1] * k); buf[bk + 2] = Math.min(255, c[2] * k); buf[bk + 3] = 255;
    };
    const h = (a: number, b: number, c: number) => rand2(a, b, s + 400 + c);
    const bright = t.g === Ground.SNOW || t.g === Ground.ICE || t.g === Ground.SALT_FLAT;
    const baseK = (lv: number) => bright ? 1 - Math.min(lv, 6) * 0.012 : 1 + Math.min(lv, 8) * 0.018; // same terrace lighting as normal tiles
    const kTop = baseK(L), kBot = baseK(L - 1) * 0.97;
    const stone = (x: number, y: number, w: number): RGB => mixRGB(gpx(x, y), rk[w > 0.7 ? 2 : 3], bright ? 0.28 : 0.3 + w * 0.2);
    const mossy = !bright && (t.g === Ground.GRASS || t.g === Ground.LUSH_GRASS || t.g === Ground.FOREST_FLOOR || t.g === Ground.JUNGLE_FLOOR || t.g === Ground.MARSH || t.g === Ground.TUNDRA);
    const earth = (x: number, y: number): RGB => mixRGB(gpx(x, y), rk[1], 0.65);
    const speck = (x: number, y: number) => 0.94 + h(wx0 + x, rowGroundY + y, 7) * 0.12;
    const vertical = dir <= 1;
    // stone joints across the stairway, in world px, shared by both tiles of a stairway
    const origin = vertical ? wx0 : rowGroundY;
    const anchor = Math.floor(origin / (TILE * 2)) * TILE * 2;
    const joints = (k: number): number[] => {
      const out: number[] = [];
      for (let p = anchor - 2 - Math.floor(h(anchor, k, 1) * 5); p < anchor + TILE * 2 + 9; p += 3 + Math.floor(h(p, k, 2) * 6)) out.push(p - origin);
      return out;
    };
    // ragged ends where the stairway meets plain terrain, with tufts of the surrounding ground
    const inset = (k: number, n: number, side: boolean) => (side ? 0 : 1 + Math.floor(h(origin, k * 7 + n, 3) * 2.5));

    if (vertical) {
      const Hc = dir === 0 ? TILE + Math.max(1, L - south) * LIFT : TILE;
      const steps = dir === 0 ? 5 : 3;
      const lightAt = (y: number) => { const a = dir === 0 ? y / (Hc - 1) : 1 - y / (TILE - 1); return kTop + (kBot - kTop) * a; };
      // bed: the tile's own ground (earth where the stairs cut through the cliff) with smooth lighting
      if (smooth) {
        // a graded street: the paving simply runs down the slope
        for (let x = 0; x < TILE; x++) for (let y = 0; y < Hc; y++) put(x, top + y, gpx(x, Math.floor((y * TILE) / Hc)), lightAt(y) * (dir === 0 ? 1 - (y / Hc) * 0.12 : 1));
      } else for (let x = 0; x < TILE; x++) for (let y = 0; y < Hc; y++) put(x, top + y, y < TILE ? gpx(x, y) : earth(x, y), y < TILE ? lightAt(y) : lightAt(y) * (0.62 + h(wx0 + x, y, 8) * 0.1));
      for (let k = 0; k < (smooth ? 0 : steps); k++) {
        const y0 = Math.round((k * Hc) / steps), y1 = Math.round(((k + 1) * Hc) / steps);
        const J = joints(k);
        const lo = inset(k, 0, sideA), hi = TILE - 1 - inset(k, 1, sideB);
        for (let n = 0; n + 1 < J.length; n++) {
          const xa = Math.max(lo, J[n] + 1), xb = Math.min(hi, J[n + 1] - 1);
          if (xb < xa) continue;
          const id = J[n] + origin;
          const sy0 = y0 + (h(id, k, 5) < 0.35 ? 1 : 0), sy1 = y1 - 1 - (h(id, k, 12) < 0.25 && y1 - y0 > 4 ? 1 : 0);
          const lum = 0.86 + h(id, k, 6) * 0.26, weather = h(id, k, 13);
          const chip = h(id, k, 14) < 0.3;                        // a knocked-off corner here and there
          for (let y = sy0; y <= sy1; y++) for (let x = xa; x <= xb; x++) {
            if ((y === sy0 || y === sy1) && (x === xa || x === xb) && xb - xa > 1) continue; // rounded corners
            if (chip && y === sy0 && x === xa + 1 && xb - xa > 3) continue;
            let l: number;
            const v = (y - sy0) / Math.max(1, sy1 - sy0);
            if (dir === 0) l = y === sy0 ? 1.2 : v < 0.5 ? 1.05 : y === sy1 ? 0.48 : 0.72;   // lit tread, shaded front face, dark crease
            else l = y === sy0 ? 1.24 : y === sy1 ? 0.7 : 1.02 - v * 0.08;                     // bright lip, occluded foot
            if (x === xa) l *= 1.07; else if (x === xb) l *= 0.84;
            // moss and grass creeping over the stone tops
            if (mossy && y === sy0 && h(wx0 + x, rowGroundY + y, 15) < 0.28) { put(x, top + y, gpx(x, y), lightAt(y) * 1.1); continue; }
            put(x, top + y, stone(x, y, weather), l * lum * lightAt(y) * speck(x, y));
          }
        }
        // grass / moss creeping over the ragged ends
        for (const [x0, x1] of [[0, lo], [hi + 1, TILE]] as [number, number][]) for (let x = x0; x < x1; x++) {
          const y = y0 + Math.floor(h(wx0 + x, k, 9) * Math.max(1, y1 - y0));
          if (y < TILE && h(wx0 + x, k, 10) < 0.7) { put(x, top + y, gpx(x, y), lightAt(y) * 1.15); put(x, top + y - 1, gpx(x, y), lightAt(y) * 1.28); }
        }
      }
      if (dir === 1 && south < L) {
        // stairs leading away still sit on a terrace edge: plain rock face below, like any cliff
        const fh = (L - south) * LIFT;
        for (let x = 0; x < TILE; x++) for (let y = 0; y < fh; y++) {
          const idx = 3.2 - (y / Math.max(1, fh - 1)) * 2.4 + (h(wx0 + x, (y + rowGroundY) >> 2, 17) - 0.5) * 1.1;
          put(x, top + TILE + y, y < 2 ? gpx(x, TILE - 1) : rk[Math.max(0, Math.min(rk.length - 1, Math.round(idx)))], y < 2 ? 0.7 - y * 0.08 : y === fh - 1 ? 0.6 : 1);
        }
      }
      return;
    }

    // --- sideways stairs: the ground really steps down, a rock wall rises behind the lower treads ---
    const steps = smooth ? TILE : 4, sw = TILE / steps;
    const east = dir === 2;
    const stepOf = (x: number) => Math.min(steps - 1, Math.floor(x / sw));
    const drop = (k: number) => Math.round(((east ? k : steps - 1 - k) * LIFT) / (steps - 1));
    const fh = south < L ? (L - south) * LIFT : 0;
    for (let x = 0; x < TILE; x++) {
      const k = stepOf(x), o = drop(k);
      const a = o / LIFT, lk = kTop + (kBot - kTop) * a;
      // wall of the cut (the plateau's own rock), with a ground lip on top like every terrace edge
      for (let y = 0; y < o; y++) {
        const lip = 1 + Math.floor(h(wx0 + x, rowGroundY, 16) * 2.5);
        if (y < lip) { put(x, top + y, gpx(x, y), y === 0 ? kTop * 1.14 : kTop * 0.78); continue; }
        const fy = (y - lip) / Math.max(1, o - lip);
        const rc = rk[Math.max(0, Math.min(rk.length - 1, Math.round(2.6 - fy * 1.6 + (h(wx0 + x, (y + rowGroundY) >> 1, 11) - 0.5) * 0.9)))];
        put(x, top + y, mixRGB(rc, gpx(x, y), 0.3), (x % sw === 0 ? 1.06 : 0.94) * (y === o - 1 ? 0.7 : 1));
      }
      // tread bed
      for (let y = 0; y < TILE; y++) put(x, top + o + y, gpx(x, y), lk);
      // front face down to the terrain south of the stairs
      for (let y = TILE + o; y < TILE + fh; y++) put(x, top + y, rk[Math.max(0, Math.round(3 - ((y - TILE - o) / Math.max(1, fh - o)) * 2.4))], y === TILE + fh - 1 ? 0.6 : 0.95);
    }
    for (let k = 0; k < (smooth ? 0 : steps); k++) {
      const o = drop(k), lk = kTop + (kBot - kTop) * (o / LIFT);
      const xa = k * sw, xb = xa + sw - 1;
      const J = joints(k);
      const lo = inset(k, 0, sideA), hi = TILE - 1 - inset(k, 1, sideB);
      // which end of this tread is the drop to the next (lower) step
      const lipX = east ? xb : xa, footX = east ? xa : xb;
      const lowerNext = east ? k < steps - 1 : k > 0;
      const higherPrev = east ? k > 0 : k < steps - 1;
      for (let n = 0; n + 1 < J.length; n++) {
        const ya = Math.max(lo, J[n] + 1), yb = Math.min(hi, J[n + 1] - 1);
        if (yb < ya) continue;
        const lum = 0.86 + h(J[n] + origin, k, 6) * 0.26, weather = h(J[n] + origin, k, 13);
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
          if ((y === ya || y === yb) && (x === xa || x === xb)) continue;
          if (mossy && y === ya && h(wx0 + x, rowGroundY + y, 15) < 0.28) { put(x, top + o + y, gpx(x, y), lk * 1.1); continue; }
          let l = y === ya ? 1.14 : y === yb ? 0.66 : 1;          // lit back edge, shaded front edge
          if (x === lipX && lowerNext) l *= 1.16;                  // step lip catching the light
          if (x === footX && higherPrev) l *= 0.68;                // foot of the step above
          put(x, top + o + y, stone(x, y, weather), l * lum * lk * speck(x, y));
        }
      }
    }
  }

  /**
   * Bakes LIQUID_FRAMES looping frames for one row: river water streams downhill with drifting
   * highlights, still water ripples gently in the wind, swamps barely move, lava pulses.
   */
  private animateLiquid(buf: Uint8ClampedArray, px: number[], tiles: TileInfo[], jj: number): Uint8ClampedArray[] {
    const s = this.seed;
    // per-column downhill flow for this row
    const flow: [number, number][] = [];
    for (let i = 0; i < CHUNK; i++) {
      const h = (di: number, dj: number) => tiles[(jj + dj) * N + i + B + di].h;
      let fx = h(-1, 0) - h(1, 0), fy = h(0, -1) - h(0, 1);
      const l = Math.hypot(fx, fy);
      if (l < 1e-5) { fx = 0.8; fy = 0.35; } else { fx /= l; fy /= l; }
      flow.push([fx, fy]);
    }
    const frames: Uint8ClampedArray[] = [];
    for (let f = 0; f < LIQUID_FRAMES; f++) {
      const out = new Uint8ClampedArray(buf);
      const ph = (f / LIQUID_FRAMES) * Math.PI * 2;
      for (let q = 0; q < px.length; q += 5) {
        const k = px[q], wx = px[q + 1], wy = px[q + 2], kind = px[q + 3];
        const [fx, fy] = flow[px[q + 4]];
        const n = vnoise(wx / 9, wy / 9, s + 300) * 6.283;
        let m = 1, add = 0;
        if (kind === 1) {                        // river: streaks travel along the current
          const along = wx * fx + wy * fy, across = -wx * fy + wy * fx;
          const w = Math.sin(along * 0.42 - ph + n + Math.sin(across * 0.5) * 0.8);
          if (w > 0.9) { m = 1.18; add = 10; } else if (w < -0.94) m = 0.92;
        } else if (kind === 2) {                 // lake / sea: slow wind ripples
          const w = Math.sin((wx * 0.8 + wy * 0.35) * 0.3 - ph + n);
          if (w > 0.9) { m = 1.14; add = 8; } else if (w < -0.95) m = 0.93;
        } else if (kind === 3) {                 // swamp: faint shimmer
          if (Math.sin(n * 2 - ph) > 0.93) { m = 1.1; add = 4; }
        } else if (kind === 4) {                 // lava: glowing pulses under the crust
          const w = Math.sin(n * 1.5 - ph);
          m = 1 + w * 0.16; add = w > 0.7 ? 18 : 0;
        } else if (kind === 5) {                 // foam: breathes in and out
          if (Math.sin(n + ph) < -0.3) m = 0.86;
        }
        if (m !== 1 || add) {
          out[k] = Math.min(255, buf[k] * m + add); out[k + 1] = Math.min(255, buf[k + 1] * m + add); out[k + 2] = Math.min(255, buf[k + 2] * m + add);
        }
      }
      frames.push(out);
    }
    return frames;
  }

  // ---------------------------------------------------------------------------
  // Feature placement
  // ---------------------------------------------------------------------------
  private place(cx: number, cy: number, tiles: TileInfo[], nearWater: Uint8Array): Feature[] {
    const feats: Feature[] = [];
    let n = 0;
    const add = (t: Feat, v: number, x: number, y: number) => {
      const lx = Math.floor(x / TILE) - cx * CHUNK, ly = Math.floor(y / TILE) - cy * CHUNK;
      const l = tiles[(Math.max(0, Math.min(CHUNK - 1, ly)) + B) * N + Math.max(0, Math.min(CHUNK - 1, lx)) + B].lv;
      feats.push({ id: `${cx}:${cy}:${n++}`, t, v, x: Math.round(x), y: Math.round(y), l });
    };
    const tx0 = cx * CHUNK, ty0 = cy * CHUNK;
    const occupied = new Uint8Array(CHUNK * CHUNK);
    const T = (i: number, j: number) => tiles[(j + B) * N + i + B];
    // stairways stay clear of trees, boulders and logs (and of their approach tiles)
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) if (T(i, j).ramp) {
      for (const [dx, dy] of [[0, 0], ...NB4]) { const ii = i + dx, jj = j + dy; if (ii >= 0 && jj >= 0 && ii < CHUNK && jj < CHUNK) occupied[jj * CHUNK + ii] = 1; }
    }
    const living = this.mode === 'living';
    const s = this.seed;

    // --- Trees on a jittered 2x2 grid (dense forests fill almost every cell; canopies overlap) ---
    if (living) {
      for (let gj = 0; gj < CHUNK; gj += 2) for (let gi = 0; gi < CHUNK; gi += 2) {
        const r = mulberry(hash3(tx0 + gi, ty0 + gj, s + 100));
        const i = gi + Math.floor(r() * 2), j = gj + Math.floor(r() * 2);
        const t = T(i, j);
        if (!treeGround(t.g) || occupied[j * CHUNK + i]) continue;
        const p = t.forest * 0.92 + (t.beach && t.temp > 0.55 && this.vita >= 0.45 ? 0.12 : 0);
        if (r() > p) continue;
        const species = this.pickTree(t, nearWater[(j + B) * N + i + B], r());
        const conifer = species === Feat.PINE || species === Feat.SPRUCE;
        const variant = Math.floor(r() * 4) + (species === Feat.OAK && t.biome === BiomeType.TROPICAL_RAINFOREST ? 4 : 0) + (conifer && t.temp < 0.22 ? 4 : 0);
        add(species, variant, (tx0 + i) * TILE + 3 + r() * 10, (ty0 + j) * TILE + 6 + r() * 8);
        occupied[j * CHUNK + i] = 1;
        // Dense stands: pack a second, offset tree into the cell so canopies interlock
        if (t.forest > 0.5 && r() < (t.forest - 0.5) * 1.6) {
          const i2 = gi + 1 - (i - gi), j2 = gj + 1 - (j - gj);
          const t2 = T(i2, j2);
          if (treeGround(t2.g) && !occupied[j2 * CHUNK + i2]) {
            const sp2 = this.pickTree(t2, nearWater[(j2 + B) * N + i2 + B], r());
            const c2 = sp2 === Feat.PINE || sp2 === Feat.SPRUCE;
            add(sp2, Math.floor(r() * 4) + (sp2 === Feat.OAK && t2.biome === BiomeType.TROPICAL_RAINFOREST ? 4 : 0) + (c2 && t2.temp < 0.22 ? 4 : 0),
              (tx0 + i2) * TILE + 3 + r() * 10, (ty0 + j2) * TILE + 4 + r() * 10);
            occupied[j2 * CHUNK + i2] = 1;
          }
        }
      }
    }

    // --- Per-tile undergrowth & loose resources ---
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const t = T(i, j);
      const r = mulberry(hash3(tx0 + i, ty0 + j, s + 200));
      const bx = (tx0 + i) * TILE, by = (ty0 + j) * TILE;
      const spot = () => [bx + 2 + r() * 12, by + 3 + r() * 12] as const;
      const wd = nearWater[(j + B) * N + i + B];
      const occ = occupied[j * CHUNK + i] === 1;
      const g = t.g;

      if (isWater(g)) {
        if ((g === Ground.SHALLOW_WATER || g === Ground.SWAMP_WATER) && t.temp > 0.3 && living && wd === 0 && this.vita >= 0.3) {
          if (r() < (g === Ground.SWAMP_WATER ? 0.16 : 0.05) && t.depth < 0.02) { const [x, y] = spot(); add(Feat.LILY_PAD, Math.floor(r() * 4), x, y); }
          if (r() < 0.05) { const [x, y] = spot(); add(Feat.CATTAIL, Math.floor(r() * 3), x, y); }
        }
        continue;
      }
      if (g === Ground.LAVA) continue;

      // Geology (everywhere)
      const rockiness = g === Ground.STONE ? 1 : g === Ground.GRAVEL ? 0.7 : 0.25;
      if (r() < 0.012 * rockiness + (g === Ground.STONE ? 0.02 : 0)) { const [x, y] = spot(); add(Feat.LOOSE_STONE, t.rock * 3 + Math.floor(r() * 3), x, y); }
      if (!occ && r() < (g === Ground.STONE ? (living ? 0.035 : 0.012) : 0.0035)) { const [x, y] = spot(); add(Feat.BOULDER, t.rock + (t.moist > 0.55 && living ? 8 : 0) + (t.temp < 0.2 ? 16 : 0), x, y); }
      const flintRich = t.rock === RockType.CHALK || t.rock === RockType.LIMESTONE ? 4 : 1;
      if (r() < 0.0018 * flintRich * (g === Ground.GRAVEL || g === Ground.STONE ? 3 : 1)) { const [x, y] = spot(); add(Feat.FLINT, Math.floor(r() * 3), x, y); }
      const oreP = 0.0008 + t.ore * 0.004 * (g === Ground.STONE || g === Ground.GRAVEL ? 3 : 1);
      if (r() < oreP) {
        const [x, y] = spot();
        const kind = r();
        const ft = kind < 0.4 ? Feat.NUGGET_COPPER : kind < 0.65 ? Feat.LIMONITE : kind < 0.9 ? Feat.NUGGET_TIN : Feat.NUGGET_GOLD;
        add(ft, Math.floor(r() * 3), x, y);
      }

      if (!living) {
        this.placeExotic(t, r, spot, add);
        continue;
      }

      // no plants here yet (young world): only rocks and minerals
      if (t.veg < 0.35) continue;
      const b = t.biome;
      const D = t.forest;
      const warm = t.temp > 0.55, cold = t.temp < 0.3;
      const grassy = g === Ground.GRASS || g === Ground.LUSH_GRASS || g === Ground.DRY_GRASS || g === Ground.MARSH || g === Ground.TUNDRA;
      const floor = g === Ground.FOREST_FLOOR || g === Ground.NEEDLES || g === Ground.JUNGLE_FLOOR;

      // Beach
      if (t.beach) {
        if (r() < 0.03) { const [x, y] = spot(); add(Feat.SEASHELL, Math.floor(r() * 4), x, y); }
        if (this.vita >= 0.6 && r() < 0.012) { const [x, y] = spot(); add(Feat.STICK, 3 + Math.floor(r() * 2), x, y); } // driftwood
        continue;
      }
      // Shores: reeds & cattails
      if (wd <= 1 && t.temp > 0.2 && (grassy || g === Ground.MUD || g === Ground.CLAY || g === Ground.BLUE_CLAY || g === Ground.PEAT || g === Ground.SAND)) {
        if (r() < 0.32) { const [x, y] = spot(); add(r() < 0.55 ? Feat.REEDS : Feat.CATTAIL, Math.floor(r() * 3), x, y); }
        if (r() < 0.18) { const [x, y] = spot(); add(Feat.REEDS, Math.floor(r() * 3), x, y); }
      }
      // Forest floor: sticks, logs, mushrooms, ferns, stumps
      const woody = D > 0.2 || floor;
      if (woody) {
        if (r() < 0.035 + D * 0.05) { const [x, y] = spot(); add(Feat.STICK, Math.floor(r() * 3), x, y); }
        if (!occ && r() < 0.006 * D) { const [x, y] = spot(); add(Feat.FALLEN_LOG, Math.floor(r() * 4) + (b === BiomeType.TAIGA ? 4 : 0), x, y); }
        if (!occ && r() < 0.003 * D) { const [x, y] = spot(); add(Feat.STUMP, Math.floor(r() * 3), x, y); }
        if (r() < (0.018 + t.moist * 0.02) * D) { const [x, y] = spot(); add(Feat.MUSHROOM, Math.floor(r() * 4) * 3 + Math.floor(r() * 3), x, y); }
        if (!cold && r() < (b === BiomeType.TROPICAL_RAINFOREST || b === BiomeType.TEMPERATE_RAINFOREST ? 0.2 : 0.07) * D) { const [x, y] = spot(); add(Feat.FERN, Math.floor(r() * 4) + (warm ? 4 : 0), x, y); }
      } else if (r() < 0.004) { const [x, y] = spot(); add(Feat.STICK, Math.floor(r() * 3), x, y); }

      // Shrubs and berries
      const shrubP = b === BiomeType.SUBTROPICAL_DESERT || b === BiomeType.COLD_DESERT ? 0.004 : 0.018 + D * 0.06;
      if (!occ && r() < shrubP) {
        const [x, y] = spot();
        const berryP = 0.12 + t.fert * 0.35;
        if (t.temp > 0.2 && b !== BiomeType.SUBTROPICAL_DESERT && r() < berryP) {
          add(t.temp < 0.42 ? Feat.BERRY_BLUE : t.temp < 0.58 ? Feat.BERRY_RED : Feat.BERRY_BLACK, Math.floor(r() * 3), x, y);
        } else add(b === BiomeType.SUBTROPICAL_DESERT || b === BiomeType.COLD_DESERT ? Feat.DEAD_BUSH : Feat.BUSH, Math.floor(r() * 4) + (warm ? 4 : 0), x, y);
      }

      // Grasses, flowers, flax, crops
      if (grassy) {
        const tallP = b === BiomeType.SAVANNA || b === BiomeType.STEPPE ? 0.3 : b === BiomeType.GRASSLAND ? 0.22 : b === BiomeType.TUNDRA ? 0.06 : 0.1;
        if (r() < tallP) { const [x, y] = spot(); add(Feat.TALL_GRASS, Math.floor(r() * 3) + (g === Ground.DRY_GRASS ? 3 : 0) + (b === BiomeType.TUNDRA ? 6 : 0), x, y); }
        if (r() < tallP * 0.6) { const [x, y] = spot(); add(Feat.TALL_GRASS, Math.floor(r() * 3) + (g === Ground.DRY_GRASS ? 3 : 0) + (b === BiomeType.TUNDRA ? 6 : 0), x, y); }
        const flowerP = b === BiomeType.GRASSLAND ? 0.045 : b === BiomeType.TUNDRA ? 0.02 : 0.02;
        if (r() < flowerP * (0.5 + t.fert)) {
          const [x, y] = spot();
          const sp = cold ? (r() < 0.6 ? 6 : 0) : warm && t.moist > 0.6 ? 5 : Math.floor(r() * 5);
          add(Feat.FLOWER, sp * 3 + Math.floor(r() * 3), x, y);
        }
        if (t.temp > 0.35 && t.temp < 0.65 && r() < 0.005) { const [x, y] = spot(); add(Feat.FLAX, Math.floor(r() * 3), x, y); }
        if (t.fert > 0.45 && r() < 0.0035 * t.fert) {
          const [x, y] = spot();
          const crop = b === BiomeType.STEPPE || b === BiomeType.GRASSLAND && r() < 0.35 ? 4 : warm ? (r() < 0.6 ? 3 : 1) : Math.floor(r() * 3);
          add(Feat.WILD_CROP, crop * 2 + Math.floor(r() * 2), x, y);
        }
      }
      // Deserts
      if (b === BiomeType.SUBTROPICAL_DESERT && (g === Ground.SAND || g === Ground.RED_SAND) && r() < 0.012) { const [x, y] = spot(); add(Feat.CACTUS, Math.floor(r() * 4), x, y); }
      if ((b === BiomeType.COLD_DESERT || b === BiomeType.SAVANNA || b === BiomeType.STEPPE) && r() < 0.006) { const [x, y] = spot(); add(Feat.DEAD_BUSH, Math.floor(r() * 3), x, y); }
      // Snow: ice crystals near stone
      if (b === BiomeType.SNOW && r() < 0.004) { const [x, y] = spot(); add(Feat.ICE_CRYSTAL, Math.floor(r() * 3), x, y); }
    }
    // Draw order hint: sorted by y on the main thread each frame anyway
    return feats;
  }

  private placeExotic(t: TileInfo, r: () => number, spot: () => readonly [number, number], add: (t: Feat, v: number, x: number, y: number) => void) {
    switch (this.mode) {
      case 'glacial': case 'frozen':
        if (r() < 0.02) { const [x, y] = spot(); add(Feat.ICE_CRYSTAL, Math.floor(r() * 3), x, y); }
        break;
      case 'volcanic':
        if (r() < (t.wet > 0 ? 0.08 : 0.01)) { const [x, y] = spot(); add(Feat.OBSIDIAN, Math.floor(r() * 3), x, y); }
        if (r() < 0.008) { const [x, y] = spot(); add(Feat.SULFUR, Math.floor(r() * 3), x, y); }
        break;
      case 'toxic':
        if (r() < (t.g === Ground.SULFUR_CRUST ? 0.05 : 0.01)) { const [x, y] = spot(); add(Feat.SULFUR, Math.floor(r() * 3), x, y); }
        break;
      case 'carbon':
        if (r() < 0.004) { const [x, y] = spot(); add(Feat.DIAMOND, Math.floor(r() * 3), x, y); }
        break;
      case 'arid':
        if (t.g === Ground.GRAVEL && r() < 0.01) { const [x, y] = spot(); add(Feat.SALT_CRYSTAL, Math.floor(r() * 3), x, y); }
        break;
    }
  }

  private pickTree(t: TileInfo, waterDist: number, r: number): Feat {
    const b = t.biome;
    if (t.beach) return Feat.PALM;
    if (waterDist <= 2 && t.temp > 0.35 && t.temp < 0.7 && r < 0.35) return Feat.WILLOW;
    const pick = (table: [Feat, number][]) => {
      let acc = 0;
      for (const [f, w] of table) { acc += w; if (r * 0.9999 < acc) return f; }
      return table[table.length - 1][0];
    };
    switch (b) {
      case BiomeType.SNOW: case BiomeType.TUNDRA: return pick([[Feat.SPRUCE, 0.7], [Feat.PINE, 0.2], [Feat.DEAD_TREE, 0.1]]);
      case BiomeType.TAIGA: return pick([[Feat.PINE, 0.42], [Feat.SPRUCE, 0.46], [Feat.BIRCH, 0.1], [Feat.DEAD_TREE, 0.02]]);
      case BiomeType.COLD_DESERT: case BiomeType.STEPPE: return pick([[Feat.PINE, 0.35], [Feat.OAK, 0.3], [Feat.BIRCH, 0.2], [Feat.DEAD_TREE, 0.15]]);
      case BiomeType.GRASSLAND: return pick([[Feat.OAK, 0.55], [Feat.BIRCH, 0.2], [Feat.MAPLE, 0.25]]);
      case BiomeType.SEASONAL_FOREST: return pick([[Feat.OAK, 0.42], [Feat.BIRCH, 0.25], [Feat.MAPLE, 0.28], [Feat.PINE, 0.05]]);
      case BiomeType.TEMPERATE_RAINFOREST: return pick([[Feat.OAK, 0.3], [Feat.SPRUCE, 0.3], [Feat.MAPLE, 0.15], [Feat.BIRCH, 0.1], [Feat.PINE, 0.15]]);
      case BiomeType.SAVANNA: return pick([[Feat.ACACIA, 0.85], [Feat.DEAD_TREE, 0.15]]);
      case BiomeType.SUBTROPICAL_DESERT: return pick([[Feat.PALM, 0.7], [Feat.DEAD_TREE, 0.3]]);
      case BiomeType.TROPICAL_RAINFOREST: return pick([[Feat.KAPOK, 0.42], [Feat.OAK, 0.4], [Feat.PALM, 0.18]]);
      default: return Feat.OAK;
    }
  }
}

const NB4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Stroke class for corner rounding: 1 streets, 2 walls, 0 anything else. */
const strokeOf = (z: number) => (isRoad(z) ? 1 : z === CZ.WALL ? 2 : 0);

// flat [dx, dy, weight] triples, strongest first
const SHORE_PROBES = [
  2, 0, 1, -2, 0, 1, 0, 2, 1, 0, -2, 1,
  6, 0, 0.6, -6, 0, 0.6, 0, 6, 0.6, 0, -6, 0.6,
  12, 0, 0.3, -12, 0, 0.3, 0, 12, 0.3, 0, -12, 0.3,
];

function treeGround(g: Ground) {
  return g === Ground.GRASS || g === Ground.LUSH_GRASS || g === Ground.DRY_GRASS || g === Ground.FOREST_FLOOR ||
    g === Ground.NEEDLES || g === Ground.JUNGLE_FLOOR || g === Ground.TUNDRA || g === Ground.DIRT || g === Ground.MARSH ||
    g === Ground.SAND || g === Ground.SNOW || g === Ground.PEAT;
}

function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function shadeCol(c: RGB, sh: number): RGB { const k = 1 + sh * 0.12; return [c[0] * k, c[1] * k, c[2] * k]; }

function modeFor(t: PlanetType): Mode {
  switch (t) {
    case PlanetType.EARTH_LIKE: case PlanetType.ALIEN_LIFE: case PlanetType.OCEAN_WORLD: case PlanetType.SWAMP_WORLD: return 'living';
    case PlanetType.ARID: case PlanetType.TIDALLY_LOCKED: return 'arid';
    case PlanetType.ROCKY_AIRLESS: return 'airless';
    case PlanetType.GLACIAL: return 'glacial';
    case PlanetType.FROZEN_OCEAN: return 'frozen';
    case PlanetType.LAVA_WORLD: case PlanetType.ASH_WORLD: case PlanetType.TIDALLY_LOCKED_DEAD: return 'volcanic';
    case PlanetType.TOXIC_ATMOSPHERE: return 'toxic';
    case PlanetType.CARBON_WORLD: return 'carbon';
    default: return 'arid';
  }
}
