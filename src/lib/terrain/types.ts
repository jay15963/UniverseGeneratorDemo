// Shared data model for the playable surface (worker <-> main thread).

export const TILE = 16;          // pixels per tile
export const CHUNK = 32;         // tiles per chunk side
export const CHUNK_PX = TILE * CHUNK;
/** Tiles per planet-map pixel is derived so the walkable world has the same size for any map resolution. */
export const WORLD_TILES_X = 131072;

export enum Ground {
  DEEP_WATER, SHALLOW_WATER, RIVER_WATER, SWAMP_WATER, ICE,
  SAND, RED_SAND, GRAVEL, GRASS, LUSH_GRASS, DRY_GRASS, TUNDRA, SNOW,
  FOREST_FLOOR, NEEDLES, JUNGLE_FLOOR, DIRT, MUD, CLAY, BLUE_CLAY, PEAT, MARSH,
  STONE, REGOLITH, LAVA, ASH, SULFUR_CRUST, GRAPHITE, SALT_FLAT,
}

export const GROUND_INFO: Record<Ground, { name: string; water?: boolean; blocking?: boolean; speed: number; resource?: string }> = {
  [Ground.DEEP_WATER]: { name: 'Água profunda', water: true, blocking: true, speed: 0 },
  [Ground.SHALLOW_WATER]: { name: 'Água rasa', water: true, speed: 0.55 },
  [Ground.RIVER_WATER]: { name: 'Rio', water: true, speed: 0.5 },
  [Ground.SWAMP_WATER]: { name: 'Água de pântano', water: true, speed: 0.45 },
  [Ground.ICE]: { name: 'Gelo', speed: 1.1 },
  [Ground.SAND]: { name: 'Areia', speed: 0.85, resource: 'Areia (vidro)' },
  [Ground.RED_SAND]: { name: 'Areia vermelha', speed: 0.85, resource: 'Areia' },
  [Ground.GRAVEL]: { name: 'Cascalho', speed: 0.9, resource: 'Cascalho (pederneira)' },
  [Ground.GRASS]: { name: 'Gramado', speed: 1 },
  [Ground.LUSH_GRASS]: { name: 'Gramado viçoso', speed: 1 },
  [Ground.DRY_GRASS]: { name: 'Capim seco', speed: 1 },
  [Ground.TUNDRA]: { name: 'Tundra', speed: 0.95 },
  [Ground.SNOW]: { name: 'Neve', speed: 0.75 },
  [Ground.FOREST_FLOOR]: { name: 'Serrapilheira', speed: 0.95 },
  [Ground.NEEDLES]: { name: 'Folhiço de pinheiro', speed: 0.95 },
  [Ground.JUNGLE_FLOOR]: { name: 'Solo de selva', speed: 0.85 },
  [Ground.DIRT]: { name: 'Terra', speed: 1, resource: 'Solo' },
  [Ground.MUD]: { name: 'Lama', speed: 0.65 },
  [Ground.CLAY]: { name: 'Argila vermelha', speed: 0.9, resource: 'Argila (cerâmica)' },
  [Ground.BLUE_CLAY]: { name: 'Argila azul', speed: 0.9, resource: 'Argila azul (cerâmica)' },
  [Ground.PEAT]: { name: 'Turfa', speed: 0.85, resource: 'Turfa (combustível)' },
  [Ground.MARSH]: { name: 'Brejo', speed: 0.7 },
  [Ground.STONE]: { name: 'Afloramento rochoso', speed: 0.9 },
  [Ground.REGOLITH]: { name: 'Regolito', speed: 0.9 },
  [Ground.LAVA]: { name: 'Lava', blocking: true, speed: 0 },
  [Ground.ASH]: { name: 'Cinzas', speed: 0.8 },
  [Ground.SULFUR_CRUST]: { name: 'Crosta de enxofre', speed: 0.9, resource: 'Enxofre' },
  [Ground.GRAPHITE]: { name: 'Grafite', speed: 0.9, resource: 'Grafite' },
  [Ground.SALT_FLAT]: { name: 'Salina', speed: 1, resource: 'Sal' },
};

export enum Feat {
  // trees
  OAK, BIRCH, MAPLE, PINE, SPRUCE, ACACIA, KAPOK, PALM, WILLOW, DEAD_TREE,
  // shrubs & plants
  BUSH, BERRY_BLUE, BERRY_RED, BERRY_BLACK, TALL_GRASS, FERN, REEDS, CATTAIL, FLAX,
  FLOWER, MUSHROOM, WILD_CROP, CACTUS, DEAD_BUSH, LILY_PAD,
  // loose resources
  STICK, LOOSE_STONE, FLINT, NUGGET_COPPER, NUGGET_TIN, NUGGET_GOLD, LIMONITE, SEASHELL,
  // big objects
  BOULDER, FALLEN_LOG, STUMP,
  // exotic minerals
  ICE_CRYSTAL, OBSIDIAN, SULFUR, DIAMOND, SALT_CRYSTAL,
}

export interface Feature {
  id: string;
  t: Feat;
  v: number;   // variant (species, rock type, sprite variant...)
  x: number;   // world pixel of the base point (where it touches the ground)
  y: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  pixels: Uint8ClampedArray; // CHUNK_PX² RGBA
  ground: Uint8Array;        // CHUNK² ground ids
  biome: Uint8Array;         // CHUNK² biome ids (BiomeType, 255 = none)
  rock: Uint8Array;          // CHUNK² RockType
  temp: Float32Array;        // CHUNK² local temperature 0..1
  features: Feature[];
}

export const TREES = new Set<Feat>([Feat.OAK, Feat.BIRCH, Feat.MAPLE, Feat.PINE, Feat.SPRUCE, Feat.ACACIA, Feat.KAPOK, Feat.PALM, Feat.WILLOW, Feat.DEAD_TREE]);

/** Collision radius in pixels for blocking features (0 = walk-through). */
export function solidRadius(t: Feat): number {
  if (TREES.has(t)) return t === Feat.KAPOK ? 7 : 4;
  switch (t) {
    case Feat.BOULDER: return 8;
    case Feat.CACTUS: return 4;
    case Feat.FALLEN_LOG: return 6;
    case Feat.STUMP: return 4;
    default: return 0;
  }
}

// Variant lists
export const FLOWER_SPECIES = ['Dente-de-leão', 'Papoula', 'Centáurea', 'Tremoço', 'Margarida', 'Orquídea', 'Urze'];
export const MUSHROOM_SPECIES = ['Amanita', 'Boleto', 'Cantarelo', 'Bufa-de-lobo'];
export const CROP_SPECIES = ['Cenoura selvagem', 'Cebola selvagem', 'Nabo selvagem', 'Abóbora selvagem', 'Trigo selvagem'];
