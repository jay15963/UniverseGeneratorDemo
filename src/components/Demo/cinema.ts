// Contract between the demo director and the survival renderer: the director owns the camera, the clock and the weather.
import type { Weather } from '../Survival/natureFx';

export interface CineApi {
  /** true once every terrain chunk the view needs at (x, y, zoom) is on screen-ready (always true when zoomed out) */
  loaded(x: number, y: number, zoom: number): boolean;
  /** zoom (CSS px per world px) that fits the whole planet on screen */
  worldZoom: number;
  /** view size in CSS px */
  viewW: number; viewH: number;
  /** loaded terrain under a world point (null when its chunk is not loaded) */
  tile(x: number, y: number): { water: boolean; lava: boolean; level: number } | null;
  /** terrain chunks still being generated or uploaded */
  pending(): number;
  /** wildlife currently alive around the camera */
  animals(): readonly { x: number; y: number; state: string }[];
  /** city building designs asked for by `Cinematic.warm` that are still rendering */
  warming?(): number;
}
export interface CineCam {
  /** world px */
  x: number; y: number;
  /** CSS px per world px (>= 1 is the local view, below that regional, then the world map) */
  zoom: number;
  /** 0 = clear picture, 1 = black */
  fade: number;
  /** time of day in hours (0-24) */
  hour?: number;
  weather?: Weather;
  /** terrain to load ahead of a hard cut (world px) */
  preload?: { x: number; y: number } | null;
  /** the underwater layer (aquatic views only): the camera films the sea floor */
  sub?: boolean;
  /** false: no wildlife on screen (battles, cities) */
  fauna?: boolean;
}
export interface Cinematic {
  update(dt: number, api: CineApi): CineCam;
  /** world rectangles whose city buildings are rendered ahead of the film (once the cities are planned) */
  warm?(): { x0: number; x1: number; y0: number; y1: number }[];
}
