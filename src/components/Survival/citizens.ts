// City population, purely visual: citizens of the species that built each city stroll along its streets.
//
// The species comes from the city's culture seed and site parameters (the same way the structure generator shows its
// builders), in the clothes of the city's era; a handful of citizen indices give variety of dress. Walkers follow the
// planned street tiles (visible at the city's current evolution), keep going mostly straight, turn at crossings, stop
// for a moment now and then, and are recycled when they leave the view.
import { makeGenome, Genome } from '../../lib/creature/genome';
import { ERAS } from '../../lib/structure/genome';
import { CZ, CityPlan } from '../../lib/city/codes';
import { CHUNK, TILE } from '../../lib/terrain/types';
import type { SpriteStore, Sheet } from '../../lib/fauna/spriteStore';

/** citizens are drawn a little smaller than the player, in proportion with the city's buildings */
export const CITIZEN_K = 0.32;
const VARIANTS = 6;
const WALK = new Set<number>([CZ.ROAD, CZ.ARTERY, CZ.PLAZA, CZ.GATE, CZ.TRACK, CZ.BRIDGE]);
const NB8: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

interface Walker {
  city: number; v: number;
  x: number; y: number;       // world px (ground)
  tx: number; ty: number;     // tile being walked to
  dx: number; dy: number;     // last step
  ox: number; oy: number;     // lane offset inside the tile
  speed: number; pause: number; anim: number; dir8: number;
}
export interface CitizenDraw { x: number; y: number; gy: number; sheet: Sheet; frame: number; row: number }

export class Citizens {
  private list: Walker[] = [];
  private genomes = new Map<string, Genome>();
  private hit = 0.05;
  constructor(private store: SpriteStore) {}

  private genomeOf(plan: CityPlan) {
    const c = plan.meta.culture, key = c.seed + c.mode;
    let g = this.genomes.get(key);
    if (!g) {
      const p = c.params;
      g = makeGenome(c.seed, { gravity: p.gravity, temperature: p.temperature, water: p.water, atmosphere: 0.5, star: p.star, diet: 0.5, exotic: p.exotic, size: 0.5 }, c.mode);
      this.genomes.set(key, g);
    }
    return g;
  }

  /** id of the city whose visible street is on this tile, or -1 */
  private street(cities: Map<number, { plan: CityPlan; p: number }>, tx: number, ty: number): number {
    const key = `${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`, q = (ty - Math.floor(ty / CHUNK) * CHUNK) * CHUNK + tx - Math.floor(tx / CHUNK) * CHUNK;
    for (const [id, c] of cities) {
      const ch = c.plan.chunks[key];
      if (ch && WALK.has(ch.code[q]) && ch.stage[q] <= c.p) return id;
    }
    return -1;
  }

  update(dt: number, cities: Map<number, { plan: CityPlan; p: number }>, view: { x0: number; y0: number; x1: number; y1: number }, loaded: (x: number, y: number) => boolean, R: () => number) {
    if (!cities.size) { this.list = []; return; }
    const m = 96;
    // recycle walkers that left the view (or whose street vanished with the slider)
    this.list = this.list.filter(w => w.x > view.x0 - m && w.x < view.x1 + m && w.y > view.y0 - m && w.y < view.y1 + m * 2 &&
      cities.has(w.city) && this.street(cities, Math.floor(w.x / TILE), Math.floor(w.y / TILE)) >= 0);
    // population in proportion to the streets in view
    const tiles = ((view.x1 - view.x0) / TILE) * ((view.y1 - view.y0) / TILE);
    const target = Math.min(160, Math.round(this.hit * tiles / 26));
    for (let tries = 0; tries < 30 && this.list.length < target; tries++) {
      const x = view.x0 + R() * (view.x1 - view.x0), y = view.y0 + R() * (view.y1 - view.y0);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const id = this.street(cities, tx, ty);
      this.hit = this.hit * 0.995 + (id >= 0 ? 0.005 : 0);
      if (id < 0 || !loaded(x, y)) continue;
      const d = NB8[Math.floor(R() * 8)];
      this.list.push({
        city: id, v: Math.floor(R() * VARIANTS), x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, tx, ty, dx: d[0], dy: d[1],
        ox: (R() - 0.5) * 8, oy: (R() - 0.5) * 6, speed: 16 + R() * 12, pause: R() * 2, anim: R() * 10, dir8: 2,
      });
    }
    for (const w of this.list) {
      if (w.pause > 0) { w.pause -= dt; continue; }
      const gx = (w.tx + 0.5) * TILE + w.ox, gy = (w.ty + 0.5) * TILE + w.oy;
      const ex = gx - w.x, ey = gy - w.y, d = Math.hypot(ex, ey);
      if (d < 1.5) {
        // at a tile: carry on, preferring straight ahead; turn back only at a dead end
        let best: [number, number] | null = null, tot = 0;
        const opts: [number, number, number][] = [];
        for (const [nx, ny] of NB8) {
          if (this.street(cities, w.tx + nx, w.ty + ny) !== w.city) continue;
          const dot = (nx * w.dx + ny * w.dy) / (Math.hypot(nx, ny) * Math.hypot(w.dx, w.dy) || 1);
          if (dot < -0.5) continue;
          const wt = 0.3 + Math.max(0, dot) * 3;
          opts.push([nx, ny, wt]); tot += wt;
        }
        if (!opts.length) { best = [-w.dx, -w.dy]; if (this.street(cities, w.tx + best[0], w.ty + best[1]) !== w.city) { w.pause = 1; continue; } }
        else {
          let r = R() * tot;
          for (const o of opts) { r -= o[2]; if (r <= 0) { best = [o[0], o[1]]; break; } }
          best ??= [opts[0][0], opts[0][1]];
        }
        w.dx = best[0]; w.dy = best[1]; w.tx += w.dx; w.ty += w.dy;
        if (R() < 0.04) w.pause = 0.8 + R() * 2.5;
        continue;
      }
      const s = Math.min(d, w.speed * dt);
      w.x += (ex / d) * s; w.y += (ey / d) * s;
      w.anim += dt * w.speed * 0.28;
      w.dir8 = ((Math.round(Math.atan2(ey, ex) / (Math.PI / 4)) % 8) + 8) % 8;
    }
  }

  /** sprites of the walkers in view (sheets are requested from the creature workers on first use) */
  collect(cities: Map<number, { plan: CityPlan; p: number }>, lift: (x: number, y: number) => number): CitizenDraw[] {
    const out: CitizenDraw[] = [];
    for (const w of this.list) {
      const c = cities.get(w.city);
      if (!c) continue;
      const plan = c.plan, era = plan.meta.era, anim = w.pause > 0 ? 'idle' : 'walk';
      const key = `cit:${plan.meta.culture.seed}:${era}:${w.v}:${anim}`;
      const sheet = this.store.get(key, this.genomeOf(plan), ERAS[era], anim, CITIZEN_K, w.v);
      if (!sheet) continue;
      const frame = anim === 'walk' ? Math.floor(w.anim) % sheet.frames : Math.floor(performance.now() / 200 + w.v) % sheet.frames;
      out.push({ x: w.x, y: w.y - lift(w.x, w.y), gy: w.y, sheet, frame, row: w.dir8 });
    }
    return out;
  }
  clear() { this.list = []; }
}
