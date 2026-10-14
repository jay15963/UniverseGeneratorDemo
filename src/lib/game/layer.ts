// A game layer: what an era of the play mode adds on top of the planet view (`SurvivalView`). The view keeps the
// terrain, the zoom ladder (surface and underwater), the clouds, the discovery fog and the camera; the layer brings
// its units and buildings (drawn in the terrain's row order), its overlay (selection, orders, bars, front lines,
// markers on the zoomed-out maps), its input (select, command) and what its creatures see.
import type { PlanetSession } from '../planet-generator/planetClient';
import type { SpriteStore } from '../fauna/spriteStore';
import type { NatureFx } from '../../components/Survival/natureFx';

/** one sprite in the world, drawn with the terrain row it stands on */
export interface GameDraw {
  c: HTMLCanvasElement; sx: number; sy: number; w: number; h: number;
  /** world position of the anchor (feet), already lifted by the terrain (or the sea floor) */
  x: number; y: number; ax: number; ay: number;
  /** unlifted ground y: decides the row (painting order) */
  gy: number;
  /** multiply colour (premultiplied ABGR from `rgba()`; the canvas fallback only uses its alpha) */
  tint?: number;
  /** contact shadow (radius, world px) at (x, shadowY) */
  shadow?: number; shadowY?: number;
}

export type GameLod = 'local' | 'far' | 'regional' | 'world';
export interface GameFrame {
  dt: number; t: number; now: number;
  /** device px per world px, screen offset of world (0,0) */
  S: number; tx0: number; ty0: number; dpr: number; DW: number; DH: number;
  toScreen(x: number, y: number): [number, number];
  view: { x0: number; y0: number; x1: number; y1: number };
  lod: GameLod;
  /** the underwater layer is on screen (aquatic era) */
  sub: boolean;
  zoom: number;
  cam: { x: number; y: number };
}

export interface TileQuery { ground: number; water: boolean; deep: boolean; level: number; under: number | null; blocking: boolean; biome: number; zone: number }

export interface WorldApi {
  session: PlanetSession;
  store: SpriteStore;
  fx: NatureFx;
  /** loaded terrain at a world point (null = chunk not streamed in) */
  tile(wx: number, wy: number): TileQuery | null;
  liftAt(wx: number, wy: number): number;
  underLiftAt(wx: number, wy: number): number | null;
  /** the ground point under a screen point (CSS px), respecting the terraces of the layer on screen */
  groundAt(sx: number, sy: number): { x: number; y: number };
  camera(): { x: number; y: number; zoom: number; zoomIdx: number; sub: boolean; lod: GameLod };
  /** moves the camera (zoomIdx: index in the surface ladder; negative = underwater stops) */
  jump(x: number, y: number, zoomIdx?: number): void;
  flash(msg: string): void;
  /** the life stage changed: every chunk and regional block is redrawn */
  refreshTerrain(): void;
  /** cities were planned / changed: redraw what they cover */
  citiesChanged(): void;
}

export interface PointerInfo {
  /** CSS px on the canvas */
  sx: number; sy: number;
  /** ground point under the pointer */
  wx: number; wy: number;
  button: number; shift: boolean; ctrl: boolean; alt: boolean; dbl: boolean;
}

export interface GameLayer {
  attach(api: WorldApi): void;
  detach?(): void;
  update(f: GameFrame): void;
  /** sprites in view (gameplay zooms) */
  collect(f: GameFrame): GameDraw[];
  /** screen-space overlay (device px): selection, orders, bars, markers of the zoomed-out maps */
  overlay(ctx: CanvasRenderingContext2D, f: GameFrame): void;
  pointerDown?(p: PointerInfo): boolean;
  pointerMove?(p: PointerInfo): void;
  pointerUp?(p: PointerInfo): void;
  /** keyboard; return true to consume the key */
  key?(k: string, down: boolean, e: KeyboardEvent): boolean;
  /** discovery fog: what the player's creatures see (world px circles) */
  sight?(): { x: number; y: number; r: number }[];
  /** drag-select box in progress (CSS px), drawn by the view */
  box?(): { x0: number; y0: number; x1: number; y1: number } | null;
}
