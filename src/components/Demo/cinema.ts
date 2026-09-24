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
  /** wildlife currently alive around the camera */
  animals(): readonly { x: number; y: number; state: string }[];
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
}
export interface Cinematic {
  update(dt: number, api: CineApi): CineCam;
}
