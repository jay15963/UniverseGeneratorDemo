// Director for the planet surface (demo reel and trailer): finds beautiful places on a planet (coasts, wildlife,
// cliffs, lava, snow) and films them with a scripted spectator camera - slow pans, time-lapses, weather and a pull-out
// to the world map. Shots change with hard cuts: the next place streams in while the current one is on screen.
import type { PlanetSession } from '../../lib/planet-generator/planetClient';
import { PlanetType, BiomeType } from '../../lib/planet-generator/generator';
import type { PlanetProbe } from '../../lib/planet-generator/workerProtocol';
import { WORLD_TILES_X, TILE } from '../../lib/terrain/types';
import { mulberry, seedToInt } from '../../lib/terrain/noise';
import type { Weather } from '../Survival/natureFx';
import type { Cinematic, CineApi, CineCam } from './cinema';

/** coast: water meets land · wild: where the animals are · peaks: terraces and cliffs · cold: snowfields · lava: molten rivers ·
 *  rise: pull out to the world map */
export type ShotKind = 'coast' | 'wild' | 'peaks' | 'cold' | 'lava' | 'rise';
export interface ShotSpec {
  kind: ShotKind;
  dur: number;
  /** time of day at the start and end of the shot (a time-lapse when they differ) */
  hour: [number, number];
  weather?: Weather;
  /** zoom at the start and end (CSS px per world px); keep local shots at whole numbers so terrain rows line up */
  zoom?: [number, number];
  /** pan speed, world px per second */
  speed?: number;
  /** absolute start time on the soundtrack (timed directors only; the shot lasts until the next one starts) */
  at?: number;
}

interface Spot { x: number; y: number }
export interface Scouted { coast: Spot[]; wild: Spot[]; peaks: Spot[]; cold: Spot[]; lava: Spot[]; land: Spot[] }

const hasSea = (t: PlanetType) => t === PlanetType.EARTH_LIKE || t === PlanetType.ALIEN_LIFE || t === PlanetType.OCEAN_WORLD || t === PlanetType.SWAMP_WORLD;
// animals are easy to see in open country and hidden under a rainforest canopy
const OPEN: Partial<Record<number, number>> = {
  [BiomeType.GRASSLAND]: 0.7, [BiomeType.SAVANNA]: 0.7, [BiomeType.STEPPE]: 0.5, [BiomeType.TUNDRA]: 0.35, [BiomeType.SEASONAL_FOREST]: 0.15,
  [BiomeType.TROPICAL_RAINFOREST]: -0.4, [BiomeType.TEMPERATE_RAINFOREST]: -0.3, [BiomeType.TAIGA]: -0.1,
};
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Samples the planet map (a grid of probes) and returns candidate map-pixel spots per kind of scenery. */
export async function scout(session: PlanetSession): Promise<Scouted> {
  const cfg = session.config;
  const W = session.width, H = session.height;
  const sea = cfg.planetType === PlanetType.OCEAN_WORLD ? 1 - (cfg.islandDensity || 0.1) - 0.02 : cfg.seaLevel;
  const wet = hasSea(cfg.planetType);
  const isWater = (p: PlanetProbe | null) => !p || (wet && p.elevation <= sea);
  const rnd = mulberry(seedToInt(cfg.seed + ':scout'));
  const GX = 96, GY = 40, y0 = 0.16, y1 = 0.84;
  const pts: Spot[] = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) pts.push({ x: Math.floor(((i + 0.5) / GX) * W), y: Math.floor((y0 + ((j + 0.5) / GY) * (y1 - y0)) * H) });
  const probes = await Promise.all(pts.map(p => session.probe(p.x, p.y)));
  const at = (i: number, j: number) => probes[j * GX + ((i % GX) + GX) % GX];

  const out: Scouted = { coast: [], wild: [], peaks: [], cold: [], lava: [], land: [] };
  const coastPairs: { a: Spot; b: Spot; score: number }[] = [];
  const wild: { s: Spot; score: number }[] = [], peaks: { s: Spot; score: number }[] = [], cold: { s: Spot; score: number }[] = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const p = at(i, j);
    if (!p || isWater(p)) continue;
    const s = pts[j * GX + i];
    out.land.push(s);
    // comfortable climates make the prettiest coasts; frozen or scorched ones rank lower
    const mild = 1 - Math.abs(p.temperature - 0.55) * 1.4;
    if (wet) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (j + dj < 0 || j + dj >= GY) continue;
      const q = at(i + di, j + dj);
      if (q && isWater(q)) coastPairs.push({ a: s, b: pts[(j + dj) * GX + (((i + di) % GX) + GX) % GX], score: mild + rnd() * 0.3 });
    }
    wild.push({ s, score: p.fauna + p.fertility * 0.3 + mild * 0.5 + (OPEN[p.biome] ?? 0) + rnd() * 0.25 });
    peaks.push({ s, score: p.elevation - (wet ? sea : cfg.seaLevel) - (p.temperature < 0.15 ? 0.2 : 0) + rnd() * 0.05 });
    if (p.temperature < 0.2) cold.push({ s, score: -p.temperature + rnd() * 0.1 });
  }
  // refine coastline crossings to the map pixel by bisection
  coastPairs.sort((a, b) => b.score - a.score);
  for (const c of coastPairs.slice(0, 10)) {
    let a = { ...c.a }, b = { ...c.b };
    if (Math.abs(b.x - a.x) > W / 2) b = { x: b.x + (b.x < a.x ? W : -W), y: b.y };
    for (let k = 0; k < 6; k++) {
      const m = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
      const p = await session.probe(((m.x % W) + W) % W, m.y);
      if (isWater(p)) b = m; else a = m;
    }
    out.coast.push({ x: ((a.x % W) + W) % W, y: a.y });
  }
  const top = (l: { s: Spot; score: number }[], n: number) => l.sort((a, b) => b.score - a.score).slice(0, n).map(e => e.s);
  out.wild = top(wild, 12);
  out.peaks = top(peaks, 12);
  out.cold = top(cold, 8);
  // lava flows are a tile-level feature: search volcanic lowlands and let the refine step find the rivers
  out.lava = cfg.planetType === PlanetType.LAVA_WORLD ? out.land.slice().sort(() => rnd() - 0.5).slice(0, 12) : [];
  return out;
}

interface Planned { spec: ShotSpec; cx: number; cy: number; dx: number; dy: number; refined: boolean; cont: boolean; dur: number }

/**
 * Plays a list of shots on one planet.
 * - free-running (demo reel): each shot lasts `dur`; the cut waits (a little) until the next place is loaded.
 * - timed (trailer): shots start at `spec.at` on the `clock` (the soundtrack), whatever happens.
 * `ready` flips once the first shot is loaded; `finished` after the last one.
 */
export class SurfaceCine implements Cinematic {
  ready = false;
  finished = false;
  /** no terrain left to stream in around the camera */
  idle = false;
  private shots: Planned[] = [];
  private i = 0;
  private t = 0;
  private last: CineCam = { x: 0, y: 0, zoom: 3, fade: 0 };
  /** map px of the first shot (where the renderer spawns) */
  readonly start: Spot;

  constructor(specs: ShotSpec[], spots: Scouted, W: number, seed: string, private clock?: () => number, endAt?: number) {
    const rnd = mulberry(seedToInt(seed + ':demo'));
    const S = (WORLD_TILES_X / W) * TILE; // world px per map px
    const used = new Set<Spot>();
    const pick = (l: Spot[]) => {
      const free = l.filter(s => !used.has(s));
      const s = free.length ? free[Math.floor(rnd() * Math.min(free.length, 4))] : l[Math.floor(rnd() * l.length)];
      if (s) used.add(s);
      return s;
    };
    specs.forEach((spec, n) => {
      const kind = (spec.kind === 'coast' || spec.kind === 'cold' || spec.kind === 'lava') && !spots[spec.kind].length ? 'peaks' : spec.kind;
      const cont = kind === 'rise' && this.shots.length > 0;
      const s = kind === 'rise' ? (cont ? null : pick(spots.land)) : pick(spots[kind]) ?? pick(spots.land);
      const a = rnd() * Math.PI * 2;
      const next = specs[n + 1];
      const dur = spec.at !== undefined ? (next?.at ?? endAt ?? spec.at + spec.dur) - spec.at : spec.dur;
      this.shots.push({
        spec: { ...spec, kind }, cx: s ? (s.x + 0.5) * S : 0, cy: s ? (s.y + 0.5) * S : 0,
        dx: Math.cos(a), dy: Math.sin(a) * 0.6, refined: cont || kind === 'rise', cont, dur,
      });
    });
    const f = this.shots[0];
    this.start = { x: Math.floor(f.cx / S), y: Math.floor(f.cy / S) };
  }

  private zoomAt(sh: Planned, u: number, api: CineApi) {
    if (sh.spec.kind === 'rise') {
      // local view -> regional -> the whole planet, exponentially (steady perceived speed), then hold
      const z0 = sh.spec.zoom?.[0] ?? 3, z1 = api.worldZoom;
      const k = smooth(0.05, 0.8, u);
      return Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * k);
    }
    const [z0, z1] = sh.spec.zoom ?? [3, 3];
    return z0 + (z1 - z0) * u;
  }
  private camAt(sh: Planned, u: number, api: CineApi): CineCam {
    const dist = sh.spec.kind === 'rise' ? 0 : (sh.spec.speed ?? 26) * sh.dur;
    const [h0, h1] = sh.spec.hour;
    return {
      x: sh.cx + sh.dx * (u - 0.5) * dist, y: sh.cy + sh.dy * (u - 0.5) * dist, zoom: this.zoomAt(sh, u, api), fade: 0,
      hour: h0 + (h1 - h0) * u, weather: sh.spec.weather ?? 'clear',
    };
  }

  /** Streams a shot's place in, then moves it to the best spot on the loaded tiles. true once it can be cut to. */
  private prepare(sh: Planned, api: CineApi): { ready: boolean; preload: { x: number; y: number } } {
    if (sh.cont) return { ready: true, preload: { x: this.last.x, y: this.last.y } };
    if (!sh.refined) {
      if (api.loaded(sh.cx, sh.cy, 2)) { this.refine(sh, api); sh.refined = true; }
      return { ready: false, preload: { x: sh.cx, y: sh.cy } };
    }
    const c0 = this.camAt(sh, 0, api);
    return { ready: api.loaded(c0.x, c0.y, c0.zoom), preload: { x: c0.x, y: c0.y } };
  }

  /** Moves a shot to the best nearby spot, judged on the loaded terrain (tile precision). */
  private refine(sh: Planned, api: CineApi) {
    const R = sh.spec.kind === 'lava' ? 1500 : 1300, step = 64;
    let best = { x: sh.cx, y: sh.cy, score: -1e9, dx: sh.dx, dy: sh.dy };
    const kind = sh.spec.kind;
    if (kind === 'wild') {
      // centre on the densest group of animals out of the water
      const an = api.animals().filter(a => a.state !== 'under' && Math.abs(a.x - sh.cx) < R && Math.abs(a.y - sh.cy) < R);
      for (const a of an) {
        let n = 0;
        for (const b of an) if (Math.hypot(a.x - b.x, a.y - b.y) < 220) n++;
        const score = n - Math.hypot(a.x - sh.cx, a.y - sh.cy) / 1500;
        if (score > best.score) best = { ...best, x: a.x, y: a.y, score };
      }
      if (an.length) { sh.cx = best.x; sh.cy = best.y; return; }
    }
    for (let y = sh.cy - R; y <= sh.cy + R; y += step) for (let x = sh.cx - R; x <= sh.cx + R; x += step) {
      const c = api.tile(x, y);
      if (!c || c.water) continue;
      let water = 0, lava = 0, n = 0, wx = 0, wy = 0, lv = 0, lv2 = 0;
      for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
        const q = api.tile(x + i * 40, y + j * 40);
        if (!q) continue;
        n++;
        if (q.water) { water++; wx += i; wy += j; }
        if (q.lava) { lava++; wx += i; wy += j; }
        lv += q.level; lv2 += q.level * q.level;
      }
      if (n < 60) continue;
      const frac = water / n, varL = lv2 / n - (lv / n) ** 2;
      const d = Math.hypot(x - sh.cx, y - sh.cy) / 3000;
      let score: number;
      if (kind === 'lava') score = -Math.abs(lava / n - 0.3) - d + (lava > 3 ? 0.4 : 0);
      else if (kind === 'coast') score = -Math.abs(frac - 0.42) - d + (frac > 0.1 && frac < 0.8 ? 0.3 : 0);
      else score = Math.min(varL, 1) * (1 - frac) - frac - d; // peaks, cold, wild without animals: rugged (not jagged) dry land
      if (score > best.score) {
        // pan along the shoreline: perpendicular to where the water lies
        const wl = Math.hypot(wx, wy);
        best = { x, y, score, dx: wl > 0 ? -wy / wl : sh.dx, dy: wl > 0 ? wx / wl : sh.dy };
      }
    }
    if (best.score > -1e9) { sh.cx = best.x; sh.cy = best.y; sh.dx = best.dx; sh.dy = best.dy * 0.8; }
  }

  update(dt: number, api: CineApi): CineCam {
    this.idle = api.pending() === 0;
    const timed = !!this.clock;
    if (timed) {
      // the soundtrack decides which shot is on screen
      const now = this.clock!();
      let i = 0;
      while (i + 1 < this.shots.length && now >= (this.shots[i + 1].spec.at ?? 0)) i++;
      if (i !== this.i) { this.i = i; if (this.shots[i].cont) { this.shots[i].cx = this.last.x; this.shots[i].cy = this.last.y; } }
      const sh = this.shots[i];
      const start = sh.spec.at ?? 0;
      if (now < start) {
        // pre-roll: park the camera on the first place so it streams in (and is refined) before the cut
        const p = this.prepare(sh, api);
        this.ready = p.ready;
        this.last = { ...this.camAt(sh, 0, api), x: p.preload.x, y: p.preload.y, preload: null };
        return this.last;
      }
      this.ready = true;
      if (now >= start + sh.dur && i === this.shots.length - 1) this.finished = true;
      const cam = this.camAt(sh, Math.min(1, (now - start) / sh.dur), api);
      const nx = this.shots[i + 1];
      cam.preload = nx ? this.prepare(nx, api).preload : null;
      this.last = cam;
      return cam;
    }

    let sh = this.shots[this.i];
    if (!sh) return this.last;
    if (!this.ready) {
      const p = this.prepare(sh, api);
      this.last = { ...this.camAt(sh, 0, api), x: p.preload.x, y: p.preload.y };
      if (p.ready) this.ready = true; else return this.last;
    }
    this.t += dt;
    const nx = this.shots[this.i + 1];
    const np = nx ? this.prepare(nx, api) : null;
    // hard cut when the shot is over and the next place is on screen-ready (or we waited long enough)
    if (this.t >= sh.dur && (!np || np.ready || this.t > sh.dur + 4)) {
      if (!nx) { this.finished = true; return this.last; }
      this.i++; this.t = 0; sh = nx;
      if (sh.cont) { sh.cx = this.last.x; sh.cy = this.last.y; }
    }
    const cam = this.camAt(sh, Math.min(1, this.t / sh.dur), api);
    const n2 = this.shots[this.i + 1];
    cam.preload = n2 ? this.prepare(n2, api).preload : null;
    this.last = cam;
    return cam;
  }
}
