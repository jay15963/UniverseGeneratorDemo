// Trailer II's battles: one per age of war, fought by the real battle engine on the planet, next to (or inside)
// the city of that era. Each starts at a fixed time of the soundtrack and is advanced deterministically with it,
// so the clashes land on the music (start times tuned with the headless engine).
import { BattleSim, type BattleSetup, type BattleTerrain, type Form, type SideSetup } from '../../../lib/game/battle/sim';
import type { BattleStyle } from '../../../lib/game/eras';
import { unitById } from '../../../lib/game/campaign/units';
import { S, bar } from './timeline';

export interface WarBattle {
  id: string; style: BattleStyle;
  /** eras of the attacker and the defender */
  era: [number, number];
  /** the era city it is fought by (or in, for a siege) */
  city: number; siege?: boolean;
  a: string[]; d: string[];
  /** formations taken at the start (by unit id) */
  aForms?: Record<string, Form>; dForms?: Record<string, Form>;
  hl: number; hw: number;
  /** soundtrack time of the battle's first second, and when it is dropped */
  start: number; end: number;
  trenchWait?: number;
  /** combined arms: every regiment on the field from the start (no command-point deck) */
  deployAll?: boolean;
  events?: { at: number; run: (sim: BattleSim) => void }[];
}

export const GOLD = '#f2c14e', CRIMSON = '#c8432f';

/** air units strike the middle of the enemy line */
const strike = (sim: BattleSim) => {
  const foe = sim.units.filter(u => u.side === 1 && u.deployed && !u.gone && sim.count(u) > 0);
  if (!foe.length) return;
  const [x, y] = foe.reduce<[number, number]>((q, u) => { const c = sim.centre(u); return [q[0] + c[0] / foe.length, q[1] + c[1] / foe.length]; }, [0, 0]);
  for (const u of sim.units) if (u.side === 0 && u.def.cls === 'air') sim.orderStrike(u, x, y);
};
/** the trebuchets / guns of the attacker bombard the town square */
const bombard = (sim: BattleSim) => {
  const s = sim.setup.siege;
  if (!s) return;
  for (const u of sim.units) if (u.side === 0 && u.def.indirect) sim.orderFire(u, s.x, s.y);
};

export const WAR_BATTLES: WarBattle[] = [
  { id: 'tribal', style: 'warband', era: [0, 0], city: 0, hl: 900, hw: 700, start: 25.6, end: S.knights,
    a: ['champions', 'clubs', 'clubs', 'tspears', 'tspears', 'javelins', 'javelins'], d: ['clubs', 'clubs', 'clubs', 'tspears', 'tspears', 'javelins', 'javelins'],
    aForms: { champions: 'wedge' } },
  { id: 'medieval', style: 'formation', era: [1, 1], city: 1, hl: 1000, hw: 750, start: 36.7, end: S.siege,
    a: ['knights', 'knights', 'menatarms', 'menatarms', 'archers', 'archers', 'xbows'], d: ['pikes', 'pikes', 'militia', 'militia', 'archers', 'archers', 'lightcav'],
    aForms: { knights: 'wedge' }, dForms: { pikes: 'brace', militia: 'shieldwall' } },
  { id: 'siege', style: 'formation', era: [1, 1], city: 1, siege: true, hl: 750, hw: 650, start: S.siege - 3, end: S.line,
    a: ['trebuchet', 'trebuchet', 'menatarms', 'militia'], d: ['militia', 'militia', 'archers'],
    events: [{ at: S.siege - 2.9, run: bombard }] },
  { id: 'line', style: 'line', era: [2, 2], city: 2, hl: 1100, hw: 800, start: 42.5, end: S.soldiers,
    a: ['line', 'line', 'line', 'line', 'grenadiers', 'cannon', 'cannon', 'hussars', 'cuirassiers'], d: ['line', 'line', 'line', 'line', 'pikemen2', 'cannon', 'hussars'],
    dForms: { pikemen2: 'square' } },
  { id: 'trench', style: 'trench', era: [3, 3], city: 3, hl: 1200, hw: 800, start: bar(33), end: S.ww2, trenchWait: 5,
    a: ['riflemen', 'riflemen', 'riflemen', 'riflemen', 'assault', 'assault', 'mg', 'howitzer', 'howitzer', 'tank1', 'tank1'], d: ['riflemen', 'riflemen', 'riflemen', 'riflemen', 'mg', 'mg', 'howitzer'] },
  { id: 'ww2', style: 'combined', era: [4, 4], city: 4, hl: 1300, hw: 900, start: S.ww2 - 9, end: S.helis, deployAll: true,
    a: ['tank', 'tank', 'tank', 'inf', 'inf', 'inf', 'inf', 'at4', 'spg', 'spg', 'recon', 'jets'], d: ['inf', 'inf', 'inf', 'inf', 'mg4', 'mg4', 'at4', 'at4', 'tank'],
    events: [{ at: S.strike - 11.2, run: strike }] },
  { id: 'modern', style: 'combined', era: [5, 5], city: 5, hl: 1300, hw: 900, start: S.helis - 12, end: S.machines, deployAll: true,
    a: ['heli', 'heli', 'tank', 'tank', 'ifv', 'ifv', 'inf', 'inf', 'inf'], d: ['inf', 'inf', 'inf', 'tank', 'tank', 'at4', 'aa'] },
  { id: 'future', style: 'combined', era: [7, 6], city: 6, hl: 1300, hw: 900, start: S.future - 12, end: S.capital, deployAll: true,
    a: ['heavytank', 'heavytank', 'tank', 'tank', 'heli', 'heli', 'inf', 'inf', 'inf', 'elite'], d: ['inf', 'inf', 'inf', 'inf', 'heavytank', 'heavytank', 'spg', 'elite'] },
];

export function warSetup(b: WarBattle, cx: number, cy: number, terrain: BattleTerrain, siege: { x: number; y: number } | null): BattleSetup {
  const side = (k: 0 | 1): SideSetup => {
    const ids = k === 0 ? b.a : b.d;
    return {
      faction: k, color: k === 0 ? GOLD : CRIMSON, era: b.era[k], player: false, name: k === 0 ? 'A' : 'B', morale: 8,
      regs: ids.map((id, i) => { const u = unitById(id); return { army: k, reg: i, def: u, men: u.men, xp: 2 }; }),
    };
  };
  return { style: b.style, cx, cy, fa: 0, hl: b.hl, hw: b.hw, sides: [side(0), side(1)], siege: siege ? { ...siege, walls: true } : null, terrain, seed: b.id.length * 7919 };
}

/** the battle as the film wants it: everyone deployed, opening formations, the fight on */
export function warSim(b: WarBattle, setup: BattleSetup): BattleSim {
  const sim = new BattleSim(setup);
  if (b.deployAll) { for (const u of sim.units) if (u.def.cls !== 'air') u.deployed = true; sim.pts = [99999, 99999]; }
  if (b.trenchWait !== undefined) sim.trenchWait = b.trenchWait;
  for (const u of sim.units) {
    const f = (u.side === 0 ? b.aForms : b.dForms)?.[u.def.id];
    if (f) sim.setForm(u, f);
  }
  for (const u of sim.units) sim.place(u, u.cx, u.cy, u.fa);
  sim.start();
  return sim;
}

/** where the fight is: the soldiers locked in melee, else between the two armies */
export function frontOf(sim: BattleSim): [number, number] | null {
  let x = 0, y = 0, n = 0;
  for (const s of sim.soldiers) if (s.alive && s.foe) { x += s.x; y += s.y; n++; }
  if (n >= 6) return [x / n, y / n];
  const c = [0, 1].map(k => {
    const us = sim.units.filter(u => u.side === k && u.deployed && !u.gone && sim.count(u) > 0 && u.def.cls !== 'air');
    if (!us.length) return null;
    return us.reduce<[number, number]>((q, u) => { const p = sim.centre(u); return [q[0] + p[0] / us.length, q[1] + p[1] / us.length]; }, [0, 0]);
  });
  if (!c[0] || !c[1]) return c[0] ?? c[1] ?? null;
  return [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
}
/** the centre of a side's units of some classes (cavalry, tanks, guns...) */
export function groupOf(sim: BattleSim, side: 0 | 1, cls: string[]): [number, number] | null {
  const us = sim.units.filter(u => u.side === side && u.deployed && !u.gone && sim.count(u) > 0 && cls.includes(u.def.cls));
  if (!us.length) return null;
  return us.reduce<[number, number]>((q, u) => { const p = sim.centre(u); return [q[0] + p[0] / us.length, q[1] + p[1] / us.length]; }, [0, 0]);
}

/** where the action is when the armies spread out (combined arms): the densest knot of living soldiers, those
 *  shooting or fighting counting double and the classes in `prefer` (helicopters, tanks...) triple; refreshed a few
 *  times a second of battle time */
const action = new WeakMap<BattleSim, { t: number; p: [number, number] | null }>();
export function actionOf(sim: BattleSim, prefer: string[] = [], R = 260): [number, number] | null {
  const c = action.get(sim);
  if (c && Math.abs(sim.t - c.t) < 0.25) return c.p;
  const all = sim.soldiers.filter(s => s.alive && !s.fled && s.u.def.cls !== 'air');
  const w = (s: (typeof all)[number]) => (prefer.includes(s.u.def.cls) ? 3 : 1) * (s.foe || s.useT > 0 ? 2 : 1);
  const step = Math.max(1, Math.floor(all.length / 120));
  let best: [number, number] | null = null, bs = 0;
  for (let i = 0; i < all.length; i += step) {
    const a = all[i];
    let n = 0, x = 0, y = 0;
    for (const b of all) if (Math.abs(b.x - a.x) < R && Math.abs(b.y - a.y) < R * 0.6) { const k = w(b); n += k; x += b.x * k; y += b.y * k; }
    if (n > bs) { bs = n; best = [x / n, y / n]; }
  }
  action.set(sim, { t: sim.t, p: best });
  return best;
}
/** the centre of a side's ground units (an air strike's target) */
export function sideOf(sim: BattleSim, side: 0 | 1): [number, number] | null {
  const us = sim.units.filter(u => u.side === side && u.deployed && !u.gone && sim.count(u) > 0 && u.def.cls !== 'air');
  if (!us.length) return null;
  return us.reduce<[number, number]>((q, u) => { const p = sim.centre(u); return [q[0] + p[0] / us.length, q[1] + p[1] / us.length]; }, [0, 0]);
}
