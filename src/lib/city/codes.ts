// Shared city tile codes (planner <-> terrain painter <-> UI).
import { Feat } from '../terrain/types';
import type { Culture, Size } from '../structure/genome';
import type { Dir8 } from '../creature/pose';

export const CZ = {
  NONE: 0,
  RES: 1, COM: 2, IND: 3, ADMIN: 4, MIL: 5,
  FARM: 6, LUMBER: 7, MINE: 8, FISH: 9, PASTURE: 10, QUARRY: 11, OUTPOST: 12,
  ROAD: 20, ARTERY: 21, PLAZA: 22, BRIDGE: 23, TRACK: 24,
  WALL: 30, TOWER: 31, GATE: 32,
} as const;

export const ERA_NAMES = ['Tribal', 'Medieval', 'Clássica', 'Industrial', 'Moderna', 'Contemporânea', 'Futurista', 'Espacial'];

/** Linear, smoothed strokes: streets (incl. bridges) and walls. */
export const isRoad = (c: number) => c === CZ.ROAD || c === CZ.ARTERY || c === CZ.TRACK || c === CZ.BRIDGE;
export const isGraded = (c: number) => c === CZ.ROAD || c === CZ.ARTERY || c === CZ.TRACK || c === CZ.PLAZA || c === CZ.GATE;
export const isWallish = (c: number) => c === CZ.WALL || c === CZ.TOWER || c === CZ.GATE;
export const isZone = (c: number) => c >= CZ.RES && c <= CZ.OUTPOST;
export const isField = (c: number) => c >= CZ.FARM && c <= CZ.OUTPOST;

/** One chunk (32x32 tiles) of a city plan. */
export interface CityChunkData {
  code: Uint8Array;   // CZ code per tile
  stage: Uint8Array;  // evolution (0..254) at which the tile appears
  lvl: Uint8Array;    // graded terrain level (255 = natural)
  rd: Uint8Array;     // road ramp direction 1=S 2=N 3=E 4=W (0 none)
}

export interface CityMeta {
  id: number;
  name: string;
  era: number;
  seed: number;
  tx: number; ty: number;          // centre tile
  /** Territory grid: GS x GS cells of C tiles, cell (0,0) centred on tile (ox, oy). */
  gs: number; c: number; ox: number; oy: number;
  /** Tile bounding box of everything painted. */
  bbox: { tx0: number; ty0: number; tx1: number; ty1: number };
  /** Octilinear wall rings (tile coords, closed) and tower centres, for future wall assets. */
  walls: [number, number][][];
  towers: [number, number][];
  gates: [number, number][];
  /** the city's building culture: every structure uses the same architectural language */
  culture: Culture;
}

/** One structure placed by the planner (drawn by the view from the structure generator). */
export interface CityBuilding {
  type: string; size: Size; variant: number; dir: Dir8;
  /** world px of the ground centre */
  x: number; y: number;
  /** tile row of the lot's front edge (painting order), terrain level, footprint side in tiles */
  row: number; l: number; w: number;
  stage: number;
}

export interface CityPlan {
  meta: CityMeta;
  territory: Uint8Array;           // gs*gs stage per cell (255 = outside)
  chunks: Record<string, CityChunkData>;
  buildings: CityBuilding[];
}

const SMALL = new Set<Feat>([Feat.FLOWER, Feat.TALL_GRASS, Feat.MUSHROOM]);
const TREE_SET = new Set<Feat>([Feat.OAK, Feat.BIRCH, Feat.MAPLE, Feat.PINE, Feat.SPRUCE, Feat.ACACIA, Feat.KAPOK, Feat.PALM, Feat.WILLOW, Feat.DEAD_TREE]);
const ROCKS = new Set<Feat>([Feat.LOOSE_STONE, Feat.FLINT, Feat.BOULDER, Feat.NUGGET_COPPER, Feat.NUGGET_TIN, Feat.NUGGET_GOLD, Feat.LIMONITE]);

/** Whether a natural feature survives on a city tile (the city clears what is in its way). */
export function keepFeature(code: number, t: Feat, h: number): boolean {
  switch (code) {
    case CZ.NONE: case CZ.LUMBER: return true;
    case CZ.RES: return SMALL.has(t);
    case CZ.PASTURE: return SMALL.has(t) || (TREE_SET.has(t) && h < 0.2);
    case CZ.MINE: case CZ.QUARRY: return ROCKS.has(t);
    case CZ.FISH: return t === Feat.REEDS || t === Feat.CATTAIL || t === Feat.LILY_PAD || t === Feat.SEASHELL;
    case CZ.FARM: return t === Feat.FLOWER;
    default: return false;
  }
}
