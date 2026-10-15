// The wild life of the creature eras, taken from the planet's own fauna (the same 200+ species Explorar shows):
// prey schools / herds, predators and the leviathans of the abyss / the plains.
import type { PlanetConfig } from '../../planet-generator/generator';
import { planetFauna } from '../../fauna/species';
import { Stage } from '../../creature/genome';
import { Wild, type RtsMode, type WildSpecies } from './defs';

export function wildFor(cfg: PlanetConfig, mode: RtsMode): WildSpecies[] {
  const all = planetFauna({ ...cfg, life: { level: 'animal' } });
  const out: WildSpecies[] = [];
  for (const s of all) {
    const water = s.habitat === 'water';
    if ((mode === 'aqua') !== water) continue;
    if (!water && (s.habitat === 'shore' || s.flyer)) continue;
    const lev = s.stage === Stage.AQUA_LEVIATHAN || s.stage === Stage.LAND_LEVIATHAN;
    const giant = s.stage === Stage.AQUA_GIANT || s.stage === Stage.LAND_GIANT;
    const role = lev ? Wild.LEVIATHAN : s.diet === 'carn' || (giant && s.diet !== 'herb') ? Wild.PREDATOR : Wild.PREY;
    out.push({
      idx: out.length, role, stage: s.stage, seed: s.genome.seed, params: s.genome.params, k: s.k,
      hp: lev ? 2400 : role === Wild.PREDATOR ? (giant ? 260 : 95) : giant ? 160 : 30,
      dmg: lev ? 48 : role === Wild.PREDATOR ? (giant ? 18 : 8) : 0,
      speed: Math.max(30, s.speed * (mode === 'aqua' ? 1.3 : 1.1)),
      zone: water ? (s.zone ?? 'coast') : 'land', name: s.name,
    });
  }
  // keep the list compact (sprites are rendered on demand): every leviathan, a handful of the others
  const lev = out.filter(w => w.role === Wild.LEVIATHAN), pred = out.filter(w => w.role === Wild.PREDATOR).slice(0, 8), prey = out.filter(w => w.role === Wild.PREY).slice(0, 14);
  return [...prey, ...pred, ...lev].map((w, i) => ({ ...w, idx: i }));
}
