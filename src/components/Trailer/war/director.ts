// Trailer II's camera on the planet: a list of timed shots, each an exact place (a city, a battle, a reef) with its
// zoom, drift, hour, weather, layer (surface or underwater) and wildlife. Between ground shots (while the film
// shows a drawn scene) the camera already waits on the next place so it streams in; battles can be followed
// (`focus`), and the drums shake the camera.
import type { Cinematic, CineApi, CineCam } from '../../Demo/cinema';
import type { Weather } from '../../Survival/natureFx';
import type { GameLayer } from '../../../lib/game/layer';
import { HITS } from './timeline';

export interface GShot {
  at: number; end: number;
  /** world px (NaN until the stage has found the place) */
  x: number; y: number;
  /** CSS px per world px at the start and end (multiples of the whole-planet zoom when `world`) */
  zoom: [number, number];
  world?: boolean;
  /** world px drifted over the shot */
  pan?: [number, number];
  hour: [number, number];
  weather?: Weather;
  sub?: boolean;
  fauna?: boolean;
  /** once the place is loaded: move to the densest group of animals (on land / under water), or to where the
   *  shore cuts the frame (coast) */
  refine?: 'land' | 'under' | 'coast';
  /** animals near these places are not picked (the cities, before the film shows them) */
  avoid?: { x: number; y: number; r: number }[];
  /** camera shake on the drum hits (0..1) */
  shake?: number;
  /** follow a moving point (the front line of a battle) */
  focus?: () => [number, number] | null;
  layer?: GameLayer | null;
  refined?: boolean;
}

const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export class WarCine implements Cinematic {
  ready = false;
  /** city designs still rendering for the shots (see `warm`); Infinity until the view has been asked */
  warmLeft = Infinity;
  private fx = 0; private fy = 0; private fshot: GShot | null = null;
  constructor(readonly shots: GShot[], private clock: () => number) {}

  /** the shot on screen, or the next one to come */
  current(now: number): { shot: GShot | null; next: GShot | null } {
    let shot: GShot | null = null, next: GShot | null = null;
    for (const s of this.shots) {
      if (now >= s.at && now < s.end) shot = s;
      else if (s.at > now && (!next || s.at < next.at)) next = s;
    }
    return { shot, next };
  }
  get start() { const s = this.shots.find(q => isFinite(q.x)) ?? this.shots[0]; return { x: s.x, y: s.y }; }

  /** the frames of the city shots: their buildings are rendered before the film rolls */
  warm() {
    return this.shots.filter(s => !s.layer && !s.world && !s.sub && !s.refine && isFinite(s.x)).map(s => {
      const z = Math.min(s.zoom[0], s.zoom[1]), hw = 700 / z + Math.abs(s.pan?.[0] ?? 0) / 2, hh = 420 / z + Math.abs(s.pan?.[1] ?? 0) / 2;
      return { x0: s.x - hw, x1: s.x + hw, y0: s.y - hh, y1: s.y + hh + 300 };
    });
  }

  private refine(sh: GShot, api: CineApi) {
    sh.refined = true;
    const R = 1400;
    if (sh.refine === 'coast') { this.coast(sh, api); return; }
    const an = api.animals().filter(a => (sh.refine === 'under' ? a.state === 'under' : a.state !== 'under') && Math.abs(a.x - sh.x) < R && Math.abs(a.y - sh.y) < R
      && !sh.avoid?.some(v => Math.hypot(a.x - v.x, a.y - v.y) < v.r));
    let best: { x: number; y: number; n: number } | null = null;
    for (const a of an) {
      let n = 0;
      for (const b of an) if (Math.hypot(a.x - b.x, a.y - b.y) < 260) n++;
      const sc = n - Math.hypot(a.x - sh.x, a.y - sh.y) / 1600;
      if (!best || sc > best.n) best = { x: a.x, y: a.y, n: sc };
    }
    if (best) { sh.x = best.x; sh.y = best.y; }
  }

  /** the loaded ground near the shot where land and water share the frame (like the demo's coasts) */
  private coast(sh: GShot, api: CineApi) {
    const R = 1300, step = 64;
    let best: { x: number; y: number; s: number } | null = null;
    for (let y = sh.y - R; y <= sh.y + R; y += step) for (let x = sh.x - R; x <= sh.x + R; x += step) {
      const c = api.tile(x, y);
      if (!c || c.water) continue;
      let water = 0, n = 0;
      for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
        const q = api.tile(x + i * 40, y + j * 40);
        if (!q) continue;
        n++;
        if (q.water) water++;
      }
      if (n < 60) continue;
      const frac = water / n;
      const s = -Math.abs(frac - 0.42) - Math.hypot(x - sh.x, y - sh.y) / 3000 + (frac > 0.1 && frac < 0.8 ? 0.3 : 0);
      if (!best || s > best.s) best = { x, y, s };
    }
    if (best) { sh.x = best.x; sh.y = best.y; }
  }

  private shakeAt(now: number) {
    let k = 0;
    for (const h of HITS) { const d = now - h; if (d >= 0 && d < 0.45) k = Math.max(k, Math.exp(-d * 9)); }
    return k;
  }

  update(dt: number, api: CineApi): CineCam {
    const now = this.clock();
    const { shot, next } = this.current(now);
    const sh = shot ?? next ?? this.shots[this.shots.length - 1];
    if (sh.refine && !sh.refined && isFinite(sh.x) && api.loaded(sh.x, sh.y, 1) && (sh.refine === 'coast' || api.animals().length)) this.refine(sh, api);
    this.warmLeft = api.warming?.() ?? 0;
    const u = shot ? (now - sh.at) / Math.max(0.001, sh.end - sh.at) : 0;
    const [z0, z1] = sh.zoom;
    const k = sh.world ? api.worldZoom : 1;
    const zoom = Math.exp(Math.log(z0 * k) + (Math.log(z1 * k) - Math.log(z0 * k)) * ease(u));
    let x = sh.x, y = sh.y;
    if (sh.focus) {
      const f = sh.focus();
      if (f) {
        if (this.fshot !== sh) { this.fshot = sh; this.fx = f[0]; this.fy = f[1]; }
        this.fx += (f[0] - this.fx) * Math.min(1, dt * 0.9); this.fy += (f[1] - this.fy) * Math.min(1, dt * 0.9);
        x = this.fx; y = this.fy;
      }
    }
    if (sh.pan) { x += sh.pan[0] * (u - 0.5); y += sh.pan[1] * (u - 0.5); }
    if (shot && sh.shake) {
      const s = this.shakeAt(now) * sh.shake * 7 / Math.max(0.5, zoom);
      x += Math.sin(now * 91) * s; y += Math.cos(now * 77) * s;
    }
    const [h0, h1] = sh.hour;
    // the place after this one streams in meanwhile
    const after = shot ? this.shots.filter(s => s.at >= sh.end - 0.01 && isFinite(s.x)).sort((a, b) => a.at - b.at)[0] : null;
    this.ready = !isFinite(x) || api.loaded(x, y, zoom);
    return {
      x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0, zoom, fade: 0, hour: h0 + (h1 - h0) * u, weather: sh.weather ?? 'clear',
      preload: after ? { x: after.x, y: after.y } : null, sub: !!sh.sub, fauna: sh.fauna !== false,
    };
  }
}
