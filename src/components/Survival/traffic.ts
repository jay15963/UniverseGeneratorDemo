// City traffic, purely visual (placeholders to see the vehicle assets at work): carts, cars and trucks of each city
// drive along its streets, cargo vehicles travel the main roads between nearby cities, ships sail the water around
// coastal cities (there are no harbours yet) and the sea lanes between them. Every vehicle is designed by the city's
// own culture (vehicle generator, era of the city), so a town's traffic matches its architecture.
import { CZ, CityPlan } from '../../lib/city/codes';
import type { CityLink } from '../../lib/city/links';
import { CHUNK, TILE } from '../../lib/terrain/types';
import { DIRS, Dir8 } from '../../lib/creature/pose';
import type { StructPool } from '../../lib/structure/structPool';
import { LOD_K } from '../../lib/structure/render';
import { vtypeById } from '../../lib/vehicle/catalog';
import { Stage } from '../../lib/creature/genome';
import type { Species } from '../../lib/fauna/species';
import type { SpriteStore } from '../../lib/fauna/spriteStore';

/** land vehicles in the world: a little over the buildings' scale (CITY_K), so they still fit the streets */
export const VEH_K = LOD_K.gameplay * 0.55;
/** ships are drawn much bigger (they have the whole water to themselves) */
export const SHIP_K = LOD_K.gameplay * 1.05;
const FRAMES = 4;
const DRIVE = new Set<number>([CZ.ARTERY, CZ.ROAD, CZ.BRIDGE, CZ.GATE]);
const NB8: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

type Cities = Map<number, { plan: CityPlan; p: number }>;
export interface VehSheet { c: HTMLCanvasElement; w: number; h: number; ax: number; ay: number; hitch: { x: number; y: number; z: number } | null }
/** one sprite to draw: the source rectangle of a canvas and its anchor */
export interface VehDraw { x: number; y: number; gy: number; c: HTMLCanvasElement; sx: number; sy: number; w: number; h: number; ax: number; ay: number }

interface Mover {
  kind: 'street' | 'link' | 'boat';
  city: number; type: string; size: 'small' | 'medium' | 'large'; variant: number;
  x: number; y: number; dir: number; speed: number; pause: number; anim: number;
  // street / boat walkers
  tx: number; ty: number; dx: number; dy: number;
  // link walkers
  link?: CityLink; s: number; ds: number;
}

export class Traffic {
  private list: Mover[] = [];
  private sheets = new Map<string, VehSheet | null>();
  private hitStreet = 0.05;
  /** draught animals by city: a land species of the planet (never a giant), drawn at its own size */
  private beasts = new Map<number, Species | null>();
  constructor(private pool: () => StructPool, private store: SpriteStore, private species: () => Species[]) {}

  private beastFor(plan: CityPlan): Species | null {
    const id = plan.meta.id;
    let b = this.beasts.get(id);
    if (b === undefined) {
      const land = this.species().filter(sp => sp.habitat === 'land' && sp.stage === Stage.LAND && !sp.flyer);
      const herb = land.filter(sp => sp.diet === 'herb');
      const pool = herb.length ? herb : land;
      b = pool.length ? pool[plan.meta.seed % pool.length] : null;
      this.beasts.set(id, b);
    }
    return b;
  }

  private streetOf(cities: Cities, tx: number, ty: number): number {
    const key = `${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`, q = (ty - Math.floor(ty / CHUNK) * CHUNK) * CHUNK + tx - Math.floor(tx / CHUNK) * CHUNK;
    for (const [id, c] of cities) {
      const ch = c.plan.chunks[key];
      if (ch && DRIVE.has(ch.code[q]) && ch.stage[q] <= c.p) return id;
    }
    return -1;
  }

  update(dt: number, cities: Cities, links: Map<number, CityLink>, view: { x0: number; y0: number; x1: number; y1: number },
    water: (x: number, y: number) => boolean | null, R: () => number) {
    if (!cities.size) { this.list = []; return; }
    const m = 160;
    const inView = (x: number, y: number, pad = m) => x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad * 2;
    this.list = this.list.filter(v => cities.has(v.city) && (v.kind === 'link' ? links.has(v.link!.id) && inView(v.x, v.y, 600) : inView(v.x, v.y)));
    const tiles = ((view.x1 - view.x0) / TILE) * ((view.y1 - view.y0) / TILE);
    /** open water: the tile and a ring two tiles out are all water (big hulls keep off the banks) */
    const open = (x: number, y: number) => {
      if (water(x, y) !== true) return false;
      for (const [dx, dy] of NB8) if (water(x + dx * 2 * TILE, y + dy * 2 * TILE) !== true) return false;
      return true;
    };
    const count = (k: Mover['kind']) => this.list.reduce((a, v) => a + (v.kind === k ? 1 : 0), 0);

    // 1. street traffic, in proportion to the streets in view
    const wantStreet = Math.min(60, Math.round((this.hitStreet * tiles) / 90));
    for (let tries = 0, n = count('street'); tries < 20 && n < wantStreet; tries++) {
      const x = view.x0 + R() * (view.x1 - view.x0), y = view.y0 + R() * (view.y1 - view.y0);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), id = this.streetOf(cities, tx, ty);
      this.hitStreet = this.hitStreet * 0.995 + (id >= 0 ? 0.005 : 0);
      if (id < 0 || water(x, y) === null) continue;
      const era = cities.get(id)!.plan.meta.era;
      const d = NB8[Math.floor(R() * 8)];
      const passenger = era >= 1 && R() < 0.55;
      this.list.push({ kind: 'street', city: id, type: passenger ? 'passenger' : 'cargo', size: 'small', variant: Math.floor(R() * 3), x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
        dir: 0, speed: 34 + R() * 20 + era * 4, pause: 0, anim: 0, tx, ty, dx: d[0], dy: d[1], s: 0, ds: 0 });
      n++;
    }
    // 2. cargo on the main roads, ships on the sea lanes: a few movers per link near the view
    for (const l of links.values()) {
      if (!cities.has(l.a)) continue;
      const near = l.path.findIndex(([tx, ty]) => inView(tx * TILE, ty * TILE, 200));
      if (near < 0) continue;
      const kind: Mover['kind'] = 'link';
      const have = this.list.filter(v => v.link?.id === l.id).length;
      if (have >= (l.kind === 'road' ? 4 : 2)) continue;
      if (R() > dt * 2) continue;
      const city = R() < 0.5 ? l.a : l.b;
      if (!cities.has(city)) continue;
      const s = Math.max(0, Math.min(l.path.length - 1.001, near + (R() - 0.5) * 30));
      const [x, y] = pointAt(l.path, s);
      this.list.push({ kind, city, link: l, s, ds: R() < 0.5 ? 1 : -1, type: l.kind === 'road' ? 'cargo' : R() < 0.6 ? 'shipCargo' : 'shipPassenger',
        size: l.kind === 'road' ? 'small' : 'medium', variant: Math.floor(R() * 3), x, y, dir: 0, speed: l.kind === 'road' ? 44 + R() * 16 : 22 + R() * 10,
        pause: 0, anim: 0, tx: 0, ty: 0, dx: 0, dy: 0 });
    }
    // 3. boats on the water around coastal cities (no harbours yet)
    const wantBoats = 3;
    for (let tries = 0, n = count('boat'); tries < 6 && n < wantBoats; tries++) {
      const x = view.x0 + R() * (view.x1 - view.x0), y = view.y0 + R() * (view.y1 - view.y0);
      if (!open(x, y)) continue;
      let best = -1, bd = 1e9;
      for (const [id, c] of cities) { const d = Math.hypot(c.plan.meta.tx * TILE - x, c.plan.meta.ty * TILE - y); if (d < bd) { bd = d; best = id; } }
      if (best < 0 || bd > 700 * TILE) continue;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), d = NB8[Math.floor(R() * 8)];
      this.list.push({ kind: 'boat', city: best, type: R() < 0.5 ? 'shipCargo' : 'shipPassenger', size: 'small', variant: Math.floor(R() * 3),
        x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, dir: 0, speed: 14 + R() * 10, pause: 0, anim: 0, tx, ty, dx: d[0], dy: d[1], s: 0, ds: 0 });
      n++;
    }

    for (const v of this.list) {
      v.anim += dt * 6;
      if (v.pause > 0) { v.pause -= dt; continue; }
      if (v.kind === 'link') {
        const l = v.link!, step = (v.speed * dt) / (3 * TILE);
        v.s += v.ds * step;
        if (v.s <= 0 || v.s >= l.path.length - 1.001) { v.ds = -v.ds; v.s = Math.max(0, Math.min(l.path.length - 1.001, v.s)); v.pause = 1 + R() * 3; }
        const [x, y] = pointAt(l.path, v.s), [x2, y2] = pointAt(l.path, Math.max(0, Math.min(l.path.length - 1.001, v.s + v.ds * 0.6)));
        if (Math.hypot(x2 - x, y2 - y) > 0.01) v.dir = dirOf(x2 - x, y2 - y);
        v.x = x; v.y = y;
        continue;
      }
      const lane = v.kind === 'street' ? 3.5 : 0;
      const gx = (v.tx + 0.5) * TILE - v.dy * lane, gy = (v.ty + 0.5) * TILE + v.dx * lane;
      const ex = gx - v.x, ey = gy - v.y, d = Math.hypot(ex, ey);
      if (d < 1.5) {
        const opts: [number, number, number][] = [];
        let tot = 0;
        for (const [nx, ny] of NB8) {
          const tx = v.tx + nx, ty = v.ty + ny;
          const ok = v.kind === 'street' ? this.streetOf(cities, tx, ty) === v.city : open((tx + 0.5) * TILE, (ty + 0.5) * TILE);
          if (!ok) continue;
          const dot = (nx * v.dx + ny * v.dy) / (Math.hypot(nx, ny) * Math.hypot(v.dx, v.dy) || 1);
          if (dot < -0.5) continue;
          const w = 0.15 + Math.max(0, dot) ** 2 * 4;
          opts.push([nx, ny, w]); tot += w;
        }
        let pick: [number, number] = [-v.dx, -v.dy];
        if (opts.length) { let r = R() * tot; for (const o of opts) { r -= o[2]; if (r <= 0) { pick = [o[0], o[1]]; break; } } }
        v.dx = pick[0]; v.dy = pick[1]; v.tx += v.dx; v.ty += v.dy;
        if (!opts.length) v.pause = 0.6;
        continue;
      }
      const s = Math.min(d, v.speed * dt);
      v.x += (ex / d) * s; v.y += (ey / d) * s;
      v.dir = dirOf(ex, ey);
    }
  }

  private sheet(plan: CityPlan, v: Mover, prio: number): VehSheet | null {
    const dir = DIRS[v.dir] as Dir8, era = plan.meta.era;
    const key = `veh|${plan.meta.culture.seed}|${era}|${v.type}|${v.size}|${v.variant}|${dir}`;
    const hit = this.sheets.get(key);
    if (hit !== undefined) { if (hit === null) this.pool().prioritize(key, prio); return hit; }
    this.sheets.set(key, null);
    const naval = v.type.startsWith('ship');
    const job = this.pool().request(key, { culture: plan.meta.culture, type: v.type, size: v.size, era, variant: v.variant, night: false, anim: 'move', aim: null }, dir, naval ? SHIP_K : VEH_K, FRAMES, prio);
    job?.then(d => {
      if (!d) { this.sheets.delete(key); return; }
      const c = document.createElement('canvas');
      c.width = d.w * d.frames.length; c.height = d.h;
      const g = c.getContext('2d')!;
      d.frames.forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f), d.w, d.h), i * d.w, 0));
      this.sheets.set(key, { c, w: d.w, h: d.h, ax: d.ax, ay: d.ay, hitch: (d as unknown as { hitch: VehSheet['hitch'] }).hitch ?? null });
      if (this.sheets.size > 400) this.sheets.delete(this.sheets.keys().next().value!);
    });
    return null;
  }

  collect(cities: Cities, lift: (x: number, y: number) => number, cx: number, cy: number): VehDraw[] {
    const out: VehDraw[] = [];
    for (const v of this.list) {
      const c = cities.get(v.city);
      if (!c) continue;
      const sh = this.sheet(c.plan, v, Math.hypot(v.x - cx, v.y - cy));
      if (!sh) continue;
      const fr = Math.floor(v.pause > 0 ? 0 : v.anim) % FRAMES, y = v.y - lift(v.x, v.y);
      const body: VehDraw = { x: v.x, y, gy: v.y, c: sh.c, sx: fr * sh.w, sy: 0, w: sh.w, h: sh.h, ax: sh.ax, ay: sh.ay };
      // carts of the early eras are pulled by an animal of the planet, harnessed at the hitch
      const t = vtypeById(v.type);
      const beast = sh.hitch && t.beastUntil !== undefined && c.plan.meta.era <= t.beastUntil ? this.beastFor(c.plan) : null;
      if (beast && sh.hitch) {
        const anim = v.pause > 0 ? 'idle' : 'walk';
        const bs = this.store.get(`${beast.id}:${anim}`, beast.genome, beast.stage, anim, beast.k);
        if (bs) {
          const L = Math.hypot(sh.hitch.x, sh.hitch.y) || 1, reach = bs.cw * 0.3;
          const bx = v.x + sh.hitch.x + (sh.hitch.x / L) * reach, by = y + sh.hitch.y + (sh.hitch.y / L) * reach;
          const bf = Math.floor(v.pause > 0 ? performance.now() / 200 : v.anim * 1.4) % bs.frames;
          const draw: VehDraw = { x: bx, y: by, gy: v.y + (sh.hitch.z > 0 ? 0.01 : -0.01), c: bs.canvas, sx: bf * bs.cw, sy: v.dir * bs.ch, w: bs.cw, h: bs.ch, ax: bs.ax, ay: bs.ay };
          out.push(draw);
        }
      }
      out.push(body);
    }
    return out;
  }
  clear() { this.list = []; }
}

function pointAt(path: [number, number][], s: number): [number, number] {
  const i = Math.floor(s), f = s - i, a = path[i], b = path[Math.min(path.length - 1, i + 1)];
  return [(a[0] + (b[0] - a[0]) * f + 0.5) * TILE, (a[1] + (b[1] - a[1]) * f + 0.5) * TILE];
}
const dirOf = (x: number, y: number) => ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8;
