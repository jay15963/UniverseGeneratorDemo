// From a campaign battle to a battlefield: both armies' regiments (and the settlement's militia) on the real
// terrain where they met, the attack axis snapped to the 8 sprite facings, the era's battle style; and back:
// the survivors of every regiment become the campaign outcome.
import type { WorldApi } from '../../../lib/game/layer';
import type { Campaign, Battle, Outcome } from '../../../lib/game/campaign/campaign';
import { armyById, settlementById, techFx, colorOf, nameOf, PLAYER } from '../../../lib/game/campaign/campaign';
import { unitById } from '../../../lib/game/campaign/units';
import { civEra, eraById } from '../../../lib/game/eras';
import type { BattleSetup, SideSetup, BattleTerrain, BattleSim } from '../../../lib/game/battle/sim';
import { TILE } from '../../../lib/terrain/types';

export function battleSetup(c: Campaign, b: Battle, api: WorldApi): { setup: BattleSetup; me: 0 | 1 } {
  const att = armyById(c, b.att)!;
  const defs = b.defs.map(id => armyById(c, id)).filter(Boolean) as NonNullable<ReturnType<typeof armyById>>[];
  const town = b.settlement !== null ? settlementById(c, b.settlement) ?? null : null;
  const eraA = c.factions[b.attacker]?.era ?? 0, eraD = b.defender >= 0 ? c.factions[b.defender].era : eraA;
  const style = eraById(civEra(Math.max(eraA, eraD))).battle ?? 'warband';
  // axis: from the attacker towards the defender, snapped to 45 degrees
  const tx = town ? town.x : b.x, ty = town ? town.y : b.y;
  let fa = Math.atan2(ty - att.y, tx - att.x);
  if (!isFinite(fa) || (Math.abs(ty - att.y) < 1 && Math.abs(tx - att.x) < 1)) fa = 0;
  fa = Math.round(fa / (Math.PI / 4)) * (Math.PI / 4);
  const hl = style === 'combined' ? 1500 : style === 'trench' ? 1200 : 1100, hw = style === 'combined' ? 1000 : 780;
  const cx = town ? town.x - Math.cos(fa) * hl * 0.3 : b.x, cy = town ? town.y - Math.sin(fa) * hl * 0.3 : b.y;
  const side = (fid: number, armies: typeof defs, player: boolean, militia: Battle['militia']): SideSetup => {
    const f = fid >= 0 ? c.factions[fid] : null;
    return {
      faction: fid, color: colorOf(c, fid), era: f ? f.era : eraD, player, name: nameOf(c, fid),
      regs: armies.flatMap(a => a.regs.map((r, i) => ({ army: a.id, reg: i, def: unitById(r.u), men: r.men, xp: r.xp }))),
      militia: militia.map(r => ({ def: unitById(r.u), men: r.men })),
      morale: f ? techFx(f).morale * 60 : 0,
    };
  };
  const me: 0 | 1 = b.attacker === PLAYER ? 0 : 1;
  // terrain read lazily from the loaded chunks (the camera is on the battlefield)
  const cache = new Map<number, { ok: boolean; level: number; water: boolean }>();
  const q = (x: number, y: number) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), k = tx * 1048576 + ty;
    let v = cache.get(k);
    if (v) return v;
    const t = api.tile(x, y);
    if (!t) return { ok: true, level: 0, water: false };
    v = { ok: !t.deep && !t.blocking, level: t.level, water: t.water };
    cache.set(k, v);
    return v;
  };
  const terrain: BattleTerrain = { ok: (x, y) => q(x, y).ok, level: (x, y) => q(x, y).level, water: (x, y) => q(x, y).water };
  const setup: BattleSetup = {
    style, cx, cy, fa, hl, hw,
    sides: [side(b.attacker, [att], me === 0, []), side(b.defender, defs, me === 1, b.militia)],
    siege: town ? { x: town.x, y: town.y, walls: town.built.includes('walls') } : null,
    terrain, seed: (b.id * 7919) ^ c.seed,
  };
  return { setup, me };
}

/** the battle's result for the campaign */
export function battleOutcome(sim: BattleSim, b: Battle): Outcome {
  const men: Record<number, number[]> = {};
  for (const s of sim.survivors()) {
    if (s.army < 0) continue;
    (men[s.army] ??= [])[s.reg] = s.men;
  }
  // regiments that never made it onto the field (combined arms reserves) keep their men
  for (const u of sim.units) if (u.army >= 0 && !u.deployed && !u.strike) (men[u.army] ??= [])[u.reg] = u.start;
  const militia = sim.units.filter(u => u.army < 0).map(u => sim.count(u));
  return { winner: sim.winner === 0 ? 'att' : 'def', men, militia, retreat: true };
}
