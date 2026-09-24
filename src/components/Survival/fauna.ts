// Wildlife on the playable surface: deterministic spawns per chunk, a light behaviour model
// (grazing, wandering, fleeing, flying, surfacing and diving) and draw data for the renderer.
import { Species, faunaIndex } from '../../lib/fauna/species';
import { SpriteStore, Sheet } from '../../lib/fauna/spriteStore';
import { Anim } from '../../lib/creature/pose';
import { Stage } from '../../lib/creature/genome';
import { mulberry, seedToInt } from '../../lib/terrain/noise';
import { TILE, CHUNK, LIFT } from '../../lib/terrain/types';
import { NatureFx } from './natureFx';

export interface TileQ { water: boolean; deep: boolean; blocking: boolean; level: number; biome: number; color: [number, number, number] }
export interface World {
  tile(wx: number, wy: number): TileQ | null;
  canStep(fx: number, fy: number, tx: number, ty: number): boolean;
}

type State = 'idle' | 'walk' | 'run' | 'takeoff' | 'fly' | 'land' | 'under' | 'surface' | 'dive';
export interface Animal {
  id: string; sp: Species; x: number; y: number; level: number; dir: number;
  state: State; t: number; tx: number; ty: number; alt: number; phase: number; sub: number; ripple: number;
}
export interface AnimalDraw { a: Animal; sheet: Sheet; frame: number; row: number; x: number; y: number; clip: number; shadowY: number }

const DIRV: [number, number][] = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];
const dirOf = (vx: number, vy: number) => ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8;
const FLY_ALT = 30;

export class Fauna {
  private idx: ReturnType<typeof faunaIndex>;
  private byChunk = new Map<string, Animal[]>();
  readonly all: Animal[] = [];
  private seed: number;

  constructor(readonly species: Species[], private store: SpriteStore, seed: string) {
    this.idx = faunaIndex(species);
    this.seed = seedToInt(seed + ':spawn');
  }

  get count() { return this.all.length; }

  spawnChunk(cx: number, cy: number, world: World) {
    const key = `${cx},${cy}`;
    if (this.byChunk.has(key) || !this.species.length) return;
    const rnd = mulberry((this.seed ^ (cx * 73856093) ^ (cy * 19349663)) >>> 0);
    const list: Animal[] = [];
    const tryAt = (ti: number, tj: number) => {
      const wx = (cx * CHUNK + ti + 0.5) * TILE, wy = (cy * CHUNK + tj + 0.5) * TILE;
      const q = world.tile(wx, wy);
      if (!q || q.blocking && !q.water) return;
      let pool: Species[] | undefined;
      if (q.water) pool = q.deep && rnd() < 0.35 && this.idx.deepWater.length ? this.idx.deepWater : this.idx.water;
      else {
        // shore dwellers next to water, everyone else by biome
        const nearWater = [[TILE * 2, 0], [-TILE * 2, 0], [0, TILE * 2], [0, -TILE * 2]].some(([dx, dy]) => world.tile(wx + dx, wy + dy)?.water);
        pool = nearWater && rnd() < 0.6 ? this.idx.shoreByBiome.get(q.biome) : this.idx.byBiome.get(q.biome);
      }
      if (!pool || !pool.length) return;
      const sp = pool[Math.floor(rnd() * pool.length)];
      const n = sp.herd[0] + Math.floor(rnd() * (sp.herd[1] - sp.herd[0] + 1));
      for (let i = 0; i < n; i++) {
        const x = wx + (rnd() - 0.5) * TILE * 3, y = wy + (rnd() - 0.5) * TILE * 3;
        const t2 = world.tile(x, y);
        if (!t2 || (sp.habitat === 'water') !== t2.water || (!t2.water && t2.blocking)) continue;
        const water = sp.habitat === 'water';
        list.push({
          id: `${key}:${list.length}`, sp, x, y, level: t2.level, dir: Math.floor(rnd() * 8),
          state: water ? 'under' : 'idle', t: 1 + rnd() * 5, tx: x, ty: y, alt: 0, phase: rnd() * 8, sub: water ? 1 : 0, ripple: 0,
        });
      }
    };
    const attempts = 3;
    for (let a = 0; a < attempts; a++) if (rnd() < 0.42) tryAt(Math.floor(rnd() * CHUNK), Math.floor(rnd() * CHUNK));
    this.byChunk.set(key, list);
    this.all.push(...list);
  }

  removeChunk(key: string) {
    const list = this.byChunk.get(key);
    if (!list) return;
    this.byChunk.delete(key);
    const gone = new Set(list);
    for (let i = this.all.length - 1; i >= 0; i--) if (gone.has(this.all[i])) this.all.splice(i, 1);
  }

  update(dt: number, px: number, py: number, world: World, fx: NatureFx, rnd: () => number) {
    for (const a of this.all) {
      if (Math.abs(a.x - px) > 1400 || Math.abs(a.y - py) > 1000) continue;
      a.t -= dt;
      a.phase += dt * (a.state === 'run' ? 11 : a.state === 'fly' || a.state === 'takeoff' ? 9 : 7);
      const sp = a.sp;
      const dPlayer = Math.hypot(a.x - px, a.y - py);
      if (sp.habitat === 'water') { this.water(a, dt, world, fx, rnd); continue; }
      // grazers bolt when the player comes close; predators just keep an eye on them
      if (dPlayer < 46 && sp.diet !== 'carn' && a.state !== 'fly' && a.state !== 'run') {
        if (sp.flyer) { a.state = 'takeoff'; a.t = 0.5; }
        else { a.state = 'run'; a.t = 2.5; const k = 90 / (dPlayer || 1); a.tx = a.x + (a.x - px) * k; a.ty = a.y + (a.y - py) * k; }
      }
      switch (a.state) {
        case 'idle':
          if (a.t <= 0) {
            if (sp.flyer && rnd() < 0.3) { a.state = 'takeoff'; a.t = 0.6; break; }
            const r = TILE * (2 + rnd() * 5), ang = rnd() * Math.PI * 2;
            a.tx = a.x + Math.cos(ang) * r; a.ty = a.y + Math.sin(ang) * r;
            a.state = 'walk'; a.t = 6;
          }
          break;
        case 'walk': case 'run': {
          const done = this.moveTo(a, dt, sp.speed * (a.state === 'run' ? 1.9 : 1), world, false);
          if (done || a.t <= 0) { a.state = 'idle'; a.t = 1.5 + rnd() * 5; }
          break;
        }
        case 'takeoff':
          a.alt = Math.min(FLY_ALT, a.alt + dt * 45);
          if (a.alt >= FLY_ALT * 0.6) {
            const r = TILE * (8 + rnd() * 14), ang = rnd() * Math.PI * 2;
            a.tx = a.x + Math.cos(ang) * r; a.ty = a.y + Math.sin(ang) * r; a.state = 'fly'; a.t = 12;
          }
          break;
        case 'fly': {
          a.alt += (FLY_ALT + Math.sin(a.phase * 0.3) * 4 - a.alt) * Math.min(1, dt * 2);
          const done = this.moveTo(a, dt, sp.speed * 2.2, world, true);
          if (done || a.t <= 0) {
            const q = world.tile(a.x, a.y);
            if (q && !q.water && !q.blocking) { a.state = 'land'; a.level = q.level; }
            else { const ang = rnd() * Math.PI * 2; a.tx = a.x + Math.cos(ang) * TILE * 10; a.ty = a.y + Math.sin(ang) * TILE * 10; a.t = 8; }
          }
          break;
        }
        case 'land':
          a.alt = Math.max(0, a.alt - dt * 35);
          if (a.alt <= 0) { a.state = 'idle'; a.t = 2 + rnd() * 6; }
          break;
        default: break;
      }
    }
  }

  /** Aquatic cycle: swim under water, surface for ~5 s (varies), dive again - with splashes in the water's own colour. */
  private water(a: Animal, dt: number, world: World, fx: NatureFx, rnd: () => number) {
    const q = world.tile(a.x, a.y);
    const col = q ? q.color : [200, 225, 240] as [number, number, number];
    const light = `rgba(${Math.min(255, col[0] + 110)},${Math.min(255, col[1] + 110)},${Math.min(255, col[2] + 110)},0.9)`;
    const ringC = `rgba(${Math.min(255, col[0] + 90)},${Math.min(255, col[1] + 90)},${Math.min(255, col[2] + 90)},0.6)`;
    const surfaceY = a.y - a.level * LIFT;
    switch (a.state) {
      case 'under':
        a.sub = 1;
        this.moveTo(a, dt, a.sp.speed * 0.6, world, false);
        if (Math.hypot(a.tx - a.x, a.ty - a.y) < 4) { const ang = rnd() * Math.PI * 2, r = TILE * (2 + rnd() * 5); a.tx = a.x + Math.cos(ang) * r; a.ty = a.y + Math.sin(ang) * r; }
        a.ripple -= dt;
        if (a.ripple <= 0) { a.ripple = 1.2 + rnd() * 1.5; if (rnd() < 0.5) fx.ring(a.x, surfaceY, 3, ringC); }
        if (a.t <= 0) { a.state = 'surface'; a.t = 3 + rnd() * 5; fx.splash(a.x, surfaceY, 7, light); fx.ring(a.x, surfaceY, 9, ringC); }
        break;
      case 'surface':
        a.sub = Math.max(0.42, a.sub - dt * 2.5);                       // rise until the back and head show
        this.moveTo(a, dt, a.sp.speed * 0.35, world, false);
        a.ripple -= dt;
        if (a.ripple <= 0) { a.ripple = 0.7 + rnd() * 0.6; fx.ring(a.x, surfaceY, 6 + rnd() * 3, ringC); }
        if (a.t <= 0) { a.state = 'dive'; a.t = 0.7; }
        break;
      case 'dive':
        a.sub = Math.min(1, a.sub + dt * 1.2);
        if (a.t <= 0) { a.state = 'under'; a.t = 3 + rnd() * 7; fx.splash(a.x, surfaceY, 9, light, 40); fx.ring(a.x, surfaceY, 11, ringC); }
        break;
      default: a.state = 'under'; break;
    }
  }

  /** Steps towards the target; land animals respect cliffs/water, fliers go straight. Returns true when arrived. */
  private moveTo(a: Animal, dt: number, speed: number, world: World, flying: boolean): boolean {
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const vx = dx / d * speed * dt, vy = dy / d * speed * dt;
    a.dir = dirOf(dx, dy);
    const nx = a.x + vx, ny = a.y + vy;
    if (flying) { a.x = nx; a.y = ny; return false; }
    const q = world.tile(nx, ny);
    const water = a.sp.habitat === 'water';
    const ok = q && (water ? q.water && (a.sp.stage !== Stage.AQUA_GIANT || q.deep) : (!q.water || (a.sp.habitat === 'shore' && !q.deep)) && !q.blocking && world.canStep(a.x, a.y, nx, ny));
    if (!ok) { a.tx = a.x - dx * 0.5; a.ty = a.y - dy * 0.5; return true; }
    a.x = nx; a.y = ny;
    if (q) a.level = q.level;
    return false;
  }

  /** Sheet + frame to draw for every animal inside the view (requests missing sheets). */
  collect(x0: number, y0: number, x1: number, y1: number): AnimalDraw[] {
    const out: AnimalDraw[] = [];
    for (const a of this.all) {
      if (a.x < x0 - 60 || a.x > x1 + 60 || a.y < y0 - 60 || a.y > y1 + 400) continue;
      if (a.sp.habitat === 'water' && a.state === 'under') continue;
      const anim: Anim = a.sp.habitat === 'water' ? 'swim'
        : a.state === 'fly' || a.state === 'takeoff' || a.state === 'land' ? 'fly'
        : a.state === 'run' ? (a.sp.flyer ? 'walk' : 'run') : a.state === 'walk' ? 'walk' : 'idle';
      const want = anim === 'run' && (a.sp.genome.locomotion === 'serpent' || a.sp.stage === Stage.AMPHIBIAN || a.sp.stage === Stage.AMPHIBIAN_GIANT) ? 'walk' : anim;
      const key = `${a.sp.id}:${want}`;
      let sheet = this.store.get(key, a.sp.genome, a.sp.stage, want, a.sp.k);
      // fall back to any animation already rendered for this species while the right one arrives
      if (!sheet) for (const alt of ['idle', 'walk', 'swim', 'fly'] as Anim[]) { sheet = this.store.get(`${a.sp.id}:${alt}`, a.sp.genome, a.sp.stage, alt, a.sp.k); if (sheet) break; }
      if (!sheet) continue;
      const frame = Math.floor(a.phase) % sheet.frames;
      const gy = a.y - a.level * LIFT;
      out.push({ a, sheet, frame, row: a.dir, x: a.x, y: gy - a.alt, clip: a.sp.habitat === 'water' ? a.sub : 0, shadowY: gy });
    }
    out.sort((p, q) => p.a.y - q.a.y);
    return out;
  }
}
export { DIRV };
