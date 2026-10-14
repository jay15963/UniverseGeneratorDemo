// Sprites of the wars of the civilisation eras: soldiers (the species with an equipment loadout of their unit and
// era, the faction's colour dyed into their clothes), their death animations, mounts (a land herbivore of the
// planet) and war machines (the vehicle generator with the faction's culture: siege lines, tanks, aircraft).
import type { Genome } from '../../../lib/creature/genome';
import { Stage } from '../../../lib/creature/genome';
import type { Death } from '../../../lib/creature/death';
import type { Dir8 } from '../../../lib/creature/pose';
import type { SpriteStore, Sheet } from '../../../lib/fauna/spriteStore';
import type { StructPool } from '../../../lib/structure/structPool';
import { LOD_K } from '../../../lib/structure/render';
import { makeCulture, type Culture } from '../../../lib/structure/genome';
import type { Species } from '../../../lib/fauna/species';
import type { UnitDef } from '../../../lib/game/campaign/units';
import { lineageGenome } from '../../../lib/game/save';
import type { CellSpecies } from '../../../lib/cell/look';

/** every civilised creature in the world uses the citizens' scale */
export const SOLDIER_K = 0.32;
export const WAR_VEH_K = LOD_K.gameplay * 0.55;
const VFRAMES = 4;

export function hueOf(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) + 1) % 1;
}
/** the species in a faction's colours (the same body: one species per planet) */
export function factionGenome(sp: CellSpecies, color: string): Genome {
  const g = lineageGenome(sp);
  const h = hueOf(color);
  return { ...g, culture: { ...g.culture, hue: h, hue2: (h + 0.5) % 1, sat: Math.max(0.55, g.culture.sat) } };
}
export function factionCulture(seed: number, mode: 'earth' | 'alien', temperature = 0.5): Culture {
  return makeCulture(`faction:${seed}`, { gravity: 0.35, temperature, water: 0.5, exotic: mode === 'alien' ? 0.6 : 0.25, wealth: 0.55, star: 0.55 }, mode);
}

export interface VSheet { c: HTMLCanvasElement; w: number; h: number; ax: number; ay: number; frames: number }

export class WarArt {
  private veh = new Map<string, VSheet | null>();
  /** the planet view's sprite workers (available once the view is up) */
  constructor(private store: () => SpriteStore | null, private pool: () => StructPool, public mountSp: Species | null) {}

  soldier(g: Genome, era: number, def: UnitDef, anim: 'idle' | 'walk' | 'run' | 'use', death: Death | null = null, urgent = false): Sheet | null {
    const st = this.store();
    if (!st) return null;
    const key = `war|${g.seed}|${g.culture.hue.toFixed(3)}|${def.id}|${era}|${death ? 'die:' + death : anim}`;
    return st.getEquipped(key, g, era, def.load(era), death ? 'die' : anim, SOLDIER_K, death, urgent);
  }
  mount(anim: 'idle' | 'walk' | 'run'): Sheet | null {
    const m = this.mountSp, st = this.store();
    if (!m || !st) return null;
    return st.get(`warmount|${m.id}|${anim}`, m.genome, Stage.LAND, anim === 'run' ? 'run' : anim, m.k);
  }
  /** a war machine facing `dir` (rows are requested one facing at a time, like the city traffic) */
  vehicle(culture: Culture, def: UnitDef, era: number, dir: Dir8, anim: 'idle' | 'move' | 'use', prio = 10): VSheet | null {
    if (!def.veh) return null;
    const key = `warveh|${culture.seed}|${def.id}|${era}|${dir}|${anim}`;
    const hit = this.veh.get(key);
    if (hit !== undefined) { if (hit === null) this.pool().prioritize(key, prio); return hit; }
    this.veh.set(key, null);
    const job = this.pool().request(key, { culture, type: def.veh.type, size: def.veh.size, era, variant: 0, night: false, anim, aim: null }, dir, WAR_VEH_K, VFRAMES, prio);
    job?.then(d => {
      if (!d) { this.veh.delete(key); return; }
      const c = document.createElement('canvas');
      c.width = d.w * d.frames.length; c.height = d.h;
      const x = c.getContext('2d')!;
      d.frames.forEach((f, i) => x.putImageData(new ImageData(new Uint8ClampedArray(f), d.w, d.h), i * d.w, 0));
      this.veh.set(key, { c, w: d.w, h: d.h, ax: d.ax, ay: d.ay, frames: d.frames.length });
    });
    return null;
  }
}

/** a mount for the cavalry: the biggest plain land herbivore of the planet */
export function pickMount(all: Species[]): Species | null {
  const land = all.filter(s => s.habitat === 'land' && s.stage === Stage.LAND && !s.flyer);
  const herb = land.filter(s => s.diet === 'herb');
  const pool = herb.length ? herb : land;
  return pool.sort((a, b) => b.k - a.k)[0] ?? null;
}
