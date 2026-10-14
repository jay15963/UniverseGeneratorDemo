// The grand campaign (tribal .. space): turn-based grand strategy on the home planet, Total War style.
// Factions (the player's nation and rival nations of the same species, each with its own culture) own
// settlements (drawn by the city generator, growing with their population) and armies of regiments
// (`units.ts`). Every turn is a season: settlements grow, pay gold, produce research, finish buildings and
// recruits; armies move over the planet grid (`world.ts`) and fight - in real time (`game/battle/`) or
// auto-resolved. The last tech of an era moves a faction into the next one (its regiments are re-equipped).
// The race ends in the space era: the first nation to finish the colony ship leaves for the stars.
import { unitById, unitsFor, upgradeOf, UNITS, type UnitDef } from './units';
import { TECHS, techById, techCost, techAvailable, buildingById, BUILDINGS, levelOf, slotsOf, MOVE, ARMY_MAX, FACTION_COLORS, factionTitle, type Building } from './defs';
import type { CampaignWorld } from './world';

export interface Regiment { u: string; men: number; xp: number }
export interface Army {
  id: number; owner: number; x: number; y: number; regs: Regiment[];
  /** movement left this turn (cells) */
  mp: number;
  /** stationed in this settlement (its garrison) */
  at: number | null;
  /** at sea */
  boat?: boolean;
  /** standing order: keep moving towards here next turns */
  dest?: { x: number; y: number } | null;
}
export interface Settlement {
  id: number; name: string; owner: number; x: number; y: number; tx: number; ty: number;
  pop: number; coast: boolean; fert: number; capital: boolean; seed: number;
  built: string[];
  build: { id: string; left: number } | null;
  /** regiments being trained (done at the end of the turn) */
  queue: string[];
  /** city generator id (session) */
  cityId: number;
  /** turns since captured (unrest) */
  unrest: number;
}
export interface Faction {
  id: number; base: string; color: string; seed: number; era: number; techs: string[];
  research: string | null; rp: number; gold: number; alive: boolean; ai: boolean; capital: number;
  /** factions this one has met (the player's list drives the diplomacy panel) */
  met: number[];
  /** AI temper 0..1: how readily it goes to war */
  temper: number;
  /** turns of colony ship building left (space era) */
  ship?: number;
}
export type DiploState = 'war' | 'peace' | 'alliance';
export interface Diplo { s: DiploState; v: number; t: number }
export interface LogLine { turn: number; text: string; kind: 'info' | 'war' | 'battle' | 'era' | 'build' | 'tech' | 'diplo' | 'bad'; x?: number; y?: number }
export interface Offer { id: number; from: number; kind: 'peace' | 'alliance' | 'tribute'; gold?: number; turn: number }

export interface Campaign {
  v: 1; turn: number; seed: number;
  factions: Faction[]; settlements: Settlement[]; armies: Army[];
  diplo: Record<string, Diplo>;
  nextId: number; log: LogLine[]; offers: Offer[];
  /** the faction whose colony ship left */
  winner?: number;
  /** the player's species name (for texts) */
  species: string;
}

export const REBELS = -1;
const START_ARMY: string[][] = [
  ['clubs', 'clubs', 'tspears', 'javelins', 'javelins'],
  ['militia', 'militia', 'menatarms', 'archers', 'lightcav'],
  ['line', 'line', 'line', 'riflemen2', 'hussars', 'cannon'],
  ['riflemen', 'riflemen', 'riflemen', 'mg', 'howitzer', 'cav3'],
  ['inf', 'inf', 'inf', 'mg4', 'tank', 'at4', 'recon'],
  ['inf', 'inf', 'inf', 'tank', 'ifv', 'at4', 'heli', 'aa'],
  ['inf', 'inf', 'elite', 'tank', 'heavytank', 'ifv', 'heli', 'spg'],
  ['inf', 'inf', 'elite', 'tank', 'heavytank', 'ifv', 'heli', 'spg', 'jets'],
];
export const PLAYER = 0;
const dkey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// ---------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------
export function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const faction = (c: Campaign, id: number) => c.factions[id];
export const nameOf = (c: Campaign, id: number) => (id === REBELS ? 'Independentes' : factionTitle(c.factions[id].base, c.factions[id].era, c.factions[id].seed));
export const colorOf = (c: Campaign, id: number) => (id === REBELS ? '#8a8f98' : c.factions[id].color);
export function diplo(c: Campaign, a: number, b: number): Diplo {
  if (a === b) return { s: 'alliance', v: 100, t: 0 };
  if (a === REBELS || b === REBELS) return { s: 'war', v: -100, t: 0 };
  return (c.diplo[dkey(a, b)] ??= { s: 'peace', v: 0, t: 0 });
}
export const atWar = (c: Campaign, a: number, b: number) => a !== b && diplo(c, a, b).s === 'war';
export const settlementById = (c: Campaign, id: number) => c.settlements.find(s => s.id === id);
export const armyById = (c: Campaign, id: number) => c.armies.find(a => a.id === id);
export const known = (f: Faction) => new Set(f.techs);
export function techFx(f: Faction) {
  const fx = { food: 0, gold: 0, research: 0, move: 0, growth: 0, walls: 0, sea: false, morale: 0 };
  for (const id of f.techs) {
    const t = techById(id)?.fx;
    if (!t) continue;
    fx.food += t.food ?? 0; fx.gold += t.gold ?? 0; fx.research += t.research ?? 0; fx.move += t.move ?? 0;
    fx.growth += t.growth ?? 0; fx.walls += t.walls ?? 0; fx.morale += t.morale ?? 0; if (t.sea) fx.sea = true;
  }
  return fx;
}
export const log = (c: Campaign, text: string, kind: LogLine['kind'] = 'info', at?: { x: number; y: number }) => {
  c.log.push({ turn: c.turn, text, kind, x: at?.x, y: at?.y });
  if (c.log.length > 200) c.log.splice(0, c.log.length - 200);
};
/** max moves of a faction's armies per turn (cells) */
export const moveOf = (f: Faction) => MOVE[Math.min(7, f.era)] * (1 + techFx(f).move);
/** cost per sea cell (0 = cannot embark) */
export const seaCost = (f: Faction) => (f.era >= 2 ? 1 : techFx(f).sea ? (f.era === 1 ? 1.3 : 1.8) : 2.6);

// ---------------------------------------------------------------------------------------------------
// Strength (auto-resolve, AI)
// ---------------------------------------------------------------------------------------------------
export function regPower(r: Regiment): number {
  const u = unitById(r.u);
  const frac = r.men / u.men;
  const ranged = u.range && !u.thrown ? ((u.dmg ?? 0) / (u.reload ?? 5)) * (u.acc ?? 0.3) * 18 * (u.blast ? 1.6 : 1) : 0;
  const body = u.el === 'vehicle' ? u.hp / 6 : u.el === 'piece' ? u.hp / 8 : u.hp * u.men / 32;
  const base = (u.melee * 0.8 + u.def * 0.6 + u.armor * 0.5 + u.charge * 0.3 + ranged) * (0.5 + body / 24);
  return base * Math.pow(1.55, u.era[0]) * frac * (1 + r.xp * 0.08);
}
export const armyPower = (a: Army) => a.regs.reduce((s, r) => s + regPower(r), 0);
/** the militia a settlement raises when attacked (walls raise more) */
export function militia(c: Campaign, s: Settlement): Regiment[] {
  const f = s.owner === REBELS ? null : c.factions[s.owner];
  const era = f ? f.era : Math.max(0, Math.min(7, Math.round(avgEra(c))));
  const pool = UNITS.filter(u => era >= u.era[0] && era <= u.era[1] && u.el === 'soldier' && !u.req);
  const melee = pool.find(u => u.cls === 'spear' || u.cls === 'gun') ?? pool[0];
  const ranged = pool.find(u => u.cls === 'missile' || u.cls === 'gun') ?? melee;
  const lv = levelOf(s.pop), walls = s.built.includes('walls') ? 2 + (f ? techFx(f).walls : 0) : 0;
  const n = 1 + Math.floor(lv / 2) + walls + (s.owner === REBELS ? 1 : 0);
  const out: Regiment[] = [];
  for (let i = 0; i < n; i++) { const u = i % 3 === 2 ? ranged : melee; out.push({ u: u.id, men: Math.round(u.men * 0.7), xp: 0 }); }
  return out;
}
const avgEra = (c: Campaign) => { const a = c.factions.filter(f => f.alive); return a.reduce((s, f) => s + f.era, 0) / Math.max(1, a.length); };
export const defencePower = (c: Campaign, s: Settlement) => militia(c, s).reduce((q, r) => q + regPower(r), 0) * (s.built.includes('walls') ? 1.5 : 1);

// ---------------------------------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------------------------------
export function popCap(c: Campaign, s: Settlement) {
  const f = s.owner === REBELS ? null : c.factions[s.owner];
  const era = f ? f.era : 0;
  return 3500 * (1 + era * 0.9) * (0.6 + s.fert * 0.8) * (s.built.includes('farms') ? 1.6 : 1) * (s.capital ? 1.3 : 1);
}
export function income(c: Campaign, s: Settlement) {
  const f = s.owner === REBELS ? null : c.factions[s.owner];
  const fx = f ? techFx(f) : null;
  let gm = 1 + (fx?.gold ?? 0), rm = 1 + (fx?.research ?? 0), growth = 0.006 + s.fert * 0.006 + (fx?.growth ?? 0) * 0.01;
  for (const id of s.built) { const b = buildingById(id); if (!b) continue; gm += b.fx.gold ?? 0; rm += b.fx.research ?? 0; growth += b.fx.growth ?? 0; }
  const unrest = s.unrest > 0 ? 0.5 : 1;
  const gold = (12 + s.pop / 60) * gm * unrest;
  const research = (6 + s.pop / 220) * rm * unrest;
  const cap = popCap(c, s);
  const grow = s.pop * growth * Math.max(-0.2, 1 - s.pop / cap);
  return { gold, research, grow, cap };
}
export function upkeep(c: Campaign, fid: number) {
  let u = 0;
  for (const a of c.armies) if (a.owner === fid) for (const r of a.regs) u += unitById(r.u).upkeep * (0.4 + 0.6 * (r.men / unitById(r.u).men)) * 0.6;
  return u;
}
export function factionTotals(c: Campaign, fid: number) {
  let gold = 0, research = 0;
  for (const s of c.settlements) if (s.owner === fid) { const i = income(c, s); gold += i.gold; research += i.research; }
  return { gold, research, upkeep: upkeep(c, fid), net: gold - upkeep(c, fid) };
}
export const recruitSlots = (s: Settlement) => 1 + (s.built.includes('barracks') ? 1 : 0) + (levelOf(s.pop) >= 3 ? 1 : 0);
export function unitCost(s: Settlement, u: UnitDef) { return Math.round(u.cost * (s.built.includes('workshop') ? 0.8 : 1)); }
export function recruitable(c: Campaign, s: Settlement): UnitDef[] {
  const f = c.factions[s.owner];
  if (!f) return [];
  return unitsFor(f.era, f.techs).filter(u => u.cls !== 'air' || f.era >= 4);
}
export function buildable(c: Campaign, s: Settlement): Building[] {
  const f = c.factions[s.owner];
  if (!f) return [];
  const T = known(f);
  return BUILDINGS.filter(b => !s.built.includes(b.id) && (!b.coast || s.coast) && (!b.req || T.has(b.req)) && (!b.capital || s.capital) && (b.id !== 'shipyard' || f.era >= 7));
}
export const slotsUsed = (s: Settlement) => s.built.filter(b => b !== 'shipyard').length + (s.build && s.build.id !== 'shipyard' ? 1 : 0);

export function orderBuild(c: Campaign, s: Settlement, id: string): string | null {
  const f = c.factions[s.owner], b = buildingById(id);
  if (!f || !b) return 'Inválido';
  if (s.build) return 'Já há uma construção em andamento.';
  if (id !== 'shipyard' && slotsUsed(s) >= slotsOf(levelOf(s.pop))) return 'Sem espaço: a povoação precisa crescer.';
  const cost = Math.round(b.cost * (1 + f.era * 0.6));
  if (f.gold < cost) return 'Ouro insuficiente.';
  f.gold -= cost;
  s.build = { id, left: b.turns };
  return null;
}
export const buildCost = (c: Campaign, s: Settlement, b: Building) => Math.round(b.cost * (1 + (c.factions[s.owner]?.era ?? 0) * 0.6));
export function orderRecruit(c: Campaign, s: Settlement, uid: string): string | null {
  const f = c.factions[s.owner], u = unitById(uid);
  if (!f) return 'Inválido';
  if (s.queue.length >= recruitSlots(s)) return 'Limite de recrutamento deste turno.';
  const cost = unitCost(s, u);
  if (f.gold < cost) return 'Ouro insuficiente.';
  f.gold -= cost;
  s.queue.push(uid);
  return null;
}
export function cancelRecruit(c: Campaign, s: Settlement, i: number) {
  const f = c.factions[s.owner], uid = s.queue[i];
  if (!f || !uid) return;
  f.gold += unitCost(s, unitById(uid));
  s.queue.splice(i, 1);
}
/** the army garrisoned in a settlement (created on demand) */
export function garrison(c: Campaign, s: Settlement, make = false): Army | null {
  let a = c.armies.find(q => q.at === s.id && q.owner === s.owner && q.regs.length < ARMY_MAX) ?? null;
  if (!a && make) { a = { id: c.nextId++, owner: s.owner, x: s.x, y: s.y, regs: [], mp: 0, at: s.id }; c.armies.push(a); }
  return a;
}

// ---------------------------------------------------------------------------------------------------
// Research and eras
// ---------------------------------------------------------------------------------------------------
export function availableTechs(f: Faction) {
  const T = known(f);
  return TECHS.filter(t => techAvailable(t, f.era, T));
}
function learn(c: Campaign, f: Faction, id: string, events: TurnEvent[]) {
  const t = techById(id)!;
  f.techs.push(id);
  f.rp = 0; f.research = null;
  if (f.id === PLAYER) log(c, `Pesquisa concluída: ${t.name}.`, 'tech');
  if (t.advance && f.era < 7) {
    f.era++;
    // regiments are re-equipped for the new era
    for (const a of c.armies) if (a.owner === f.id) for (const r of a.regs) {
      const u0 = unitById(r.u), u1 = upgradeOf(u0, f.era);
      if (u1 && u1 !== u0) { r.men = Math.max(1, Math.round((r.men / u0.men) * u1.men)); r.u = u1.id; }
    }
    if (f.id === PLAYER) log(c, `Nova era: ${ERA_NAMES[f.era]}!`, 'era');
    else if (c.factions[PLAYER].met.includes(f.id)) log(c, `${nameOf(c, f.id)} entrou na era ${ERA_NAMES[f.era]}.`, 'era');
    events.push({ k: 'era', f: f.id, era: f.era });
  }
  if (t.id === 'navecolonial' && f.id !== PLAYER && c.factions[PLAYER].met.includes(f.id)) log(c, `${nameOf(c, f.id)} começou a projetar uma nave colonial!`, 'bad');
}
export const ERA_NAMES = ['Tribal', 'Medieval', 'Clássica', 'Industrial', 'Moderna', 'Contemporânea', 'Futurista', 'Espacial'];

// ---------------------------------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------------------------------
export type MoveResult =
  | { k: 'moved' }
  | { k: 'blocked'; reason: string }
  | { k: 'battle'; battle: Battle };
export interface Battle {
  id: number; x: number; y: number;
  att: number; attacker: number; defender: number;
  /** defending armies (the target, plus allies garrisoned there) */
  defs: number[];
  settlement: number | null;
  /** militia raised by the settlement */
  militia: Regiment[];
}
/** what is at a world point: an army (any owner) or a settlement, within `r` cells */
export function targetAt(c: Campaign, w: CampaignWorld, x: number, y: number, r = 1.6): { army?: Army; settlement?: Settlement } {
  let best: Army | undefined, bd = r;
  for (const a of c.armies) { if (a.at !== null || !a.regs.length) continue; const d = w.dist(a.x, a.y, x, y); if (d < bd) { bd = d; best = a; } }
  if (best) return { army: best };
  let bs: Settlement | undefined, sd = r * 1.4;
  for (const s of c.settlements) { const d = w.dist(s.x, s.y, x, y); if (d < sd) { sd = d; bs = s; } }
  return bs ? { settlement: bs } : {};
}
/** cells an army may not cross: around hostile armies in the field and hostile settlements */
function blocker(c: Campaign, w: CampaignWorld, a: Army) {
  const hostile: { x: number; y: number; r: number }[] = [];
  for (const o of c.armies) if (o.owner !== a.owner && o.regs.length && o.at === null && atWar(c, a.owner, o.owner)) hostile.push({ x: o.x, y: o.y, r: 1.2 });
  for (const s of c.settlements) if (s.owner !== a.owner && (s.owner === REBELS || atWar(c, a.owner, s.owner) || diplo(c, a.owner, s.owner).s === 'peace')) hostile.push({ x: s.x, y: s.y, r: 1.2 });
  return (cell: number) => {
    const [x, y] = w.centre(cell);
    for (const h of hostile) if (w.dist(h.x, h.y, x, y) < h.r) return true;
    return false;
  };
}
export function planPath(c: Campaign, w: CampaignWorld, a: Army, x: number, y: number) {
  const f = c.factions[a.owner];
  return w.path(a.x, a.y, x, y, seaCost(f), blocker(c, w, a));
}
/**
 * Moves an army towards (x, y) as far as its movement allows. Arriving next to a hostile army or settlement
 * that was the target starts a battle (the caller decides how it is fought).
 */
export function moveArmy(c: Campaign, w: CampaignWorld, a: Army, x: number, y: number, attack = true): MoveResult {
  const f = c.factions[a.owner];
  const tgt = targetAt(c, w, x, y);
  const enemy = tgt.army && tgt.army.owner !== a.owner ? tgt.army : null;
  const town = tgt.settlement && tgt.settlement.owner !== a.owner ? tgt.settlement : null;
  const own = tgt.settlement && tgt.settlement.owner === a.owner ? tgt.settlement : null;
  const tx = enemy ? enemy.x : town ? town.x : own ? own.x : x, ty = enemy ? enemy.y : town ? town.y : own ? own.y : y;
  const p = planPath(c, w, a, tx, ty);
  if (!p) return { k: 'blocked', reason: 'Sem caminho até lá.' };
  const hostileTo = enemy ? enemy.owner : town ? town.owner : null;
  let last = 0;
  for (let i = 1; i < p.cells.length; i++) {
    if (p.costs[i] > a.mp) break;
    last = i;
    const [cx, cy] = w.centre(p.cells[i]);
    // adjacent to the target: stop and fight
    if ((enemy || town) && attack && w.dist(cx, cy, tx, ty) <= 1.6) break;
  }
  if (last > 0) {
    const [cx, cy] = w.centre(p.cells[last]);
    a.mp -= p.costs[last];
    a.x = cx; a.y = cy; a.at = null;
    a.boat = !w.isLand(p.cells[last]);
  }
  if (own && w.dist(a.x, a.y, own.x, own.y) < 1.6) { a.x = own.x; a.y = own.y; a.at = own.id; a.dest = null; a.boat = false; mergeInto(c, a); return { k: 'moved' }; }
  a.dest = last < p.cells.length - 1 ? { x: tx, y: ty } : null;
  if ((enemy || town) && attack && hostileTo !== null && w.dist(a.x, a.y, tx, ty) <= 1.7) {
    if (a.mp < 0.5 && last === 0 && p.cells.length > 2) return { k: 'blocked', reason: 'Sem movimento neste turno.' };
    if (a.boat && town) return { k: 'blocked', reason: 'Desembarque antes de atacar a povoação.' };
    if (hostileTo !== REBELS && !atWar(c, a.owner, hostileTo)) declareWar(c, a.owner, hostileTo);
    a.dest = null;
    return { k: 'battle', battle: makeBattle(c, w, a, enemy, town) };
  }
  if (last === 0 && p.cells.length > 1) return { k: 'blocked', reason: 'Sem movimento neste turno.' };
  void f;
  return { k: 'moved' };
}
/** two armies of the same faction in the same settlement merge (up to the limit) */
function mergeInto(c: Campaign, a: Army) {
  if (a.at === null) return;
  for (const o of c.armies) {
    if (o === a || o.owner !== a.owner || o.at !== a.at) continue;
    while (a.regs.length && o.regs.length < ARMY_MAX) o.regs.push(a.regs.pop()!);
  }
  if (!a.regs.length) c.armies = c.armies.filter(q => q !== a);
}
function makeBattle(c: Campaign, w: CampaignWorld, a: Army, enemy: Army | null, town: Settlement | null): Battle {
  const settlement = town ?? (enemy?.at != null ? settlementById(c, enemy.at) ?? null : null);
  const defender = enemy ? enemy.owner : town!.owner;
  const defs: number[] = [];
  if (enemy) defs.push(enemy.id);
  if (settlement) for (const o of c.armies) if (o.at === settlement.id && o.owner === defender && !defs.includes(o.id) && o.regs.length) defs.push(o.id);
  // a second army of the defender standing next to the fight joins it (reinforcement)
  for (const o of c.armies) if (o.owner === defender && o.at === null && o.regs.length && !defs.includes(o.id) && w.dist(o.x, o.y, enemy?.x ?? town!.x, enemy?.y ?? town!.y) < 3) defs.push(o.id);
  const x = enemy ? (enemy.x + a.x) / 2 : settlement!.x, y = enemy ? (enemy.y + a.y) / 2 : settlement!.y;
  return { id: c.nextId++, x, y, att: a.id, attacker: a.owner, defender, defs, settlement: settlement?.id ?? null, militia: settlement && settlement.owner === defender ? militia(c, settlement) : [] };
}

// ---------------------------------------------------------------------------------------------------
// Battle outcome
// ---------------------------------------------------------------------------------------------------
export interface Outcome {
  winner: 'att' | 'def';
  /** survivors per army id (regiment index -> men left) */
  men: Record<number, number[]>;
  /** militia survivors (the settlement's own levy) */
  militia?: number[];
  /** the losing side broke off (true) or was wiped out */
  retreat: boolean;
}
export function autoResolve(c: Campaign, b: Battle, rnd = Math.random): Outcome {
  const att = armyById(c, b.att)!;
  const defs = b.defs.map(id => armyById(c, id)!).filter(Boolean);
  const town = b.settlement !== null ? settlementById(c, b.settlement)! : null;
  const pa = armyPower(att) * (0.85 + rnd() * 0.3);
  const pm = b.militia.reduce((s, r) => s + regPower(r), 0);
  const pd = (defs.reduce((s, a) => s + armyPower(a), 0) + pm) * (0.85 + rnd() * 0.3) * (town?.built.includes('walls') ? 1.35 : town ? 1.1 : 1);
  const ratio = pa / Math.max(1, pd);
  const attWins = ratio > 1;
  const r = attWins ? ratio : 1 / ratio;
  // the loser loses much more; a crushing win costs the winner little
  const lossWin = Math.max(0.04, Math.min(0.45, 0.42 / r));
  const lossLose = Math.max(0.35, Math.min(0.95, 0.35 + (r - 1) * 0.35));
  const men: Record<number, number[]> = {};
  const cut = (regs: Regiment[], loss: number) => regs.map(q => Math.max(0, Math.round(q.men * (1 - loss * (0.7 + rnd() * 0.6)))));
  men[att.id] = cut(att.regs, attWins ? lossWin : lossLose);
  for (const d of defs) men[d.id] = cut(d.regs, attWins ? lossLose : lossWin);
  return { winner: attWins ? 'att' : 'def', men, militia: cut(b.militia, attWins ? 1 : lossWin), retreat: !attWins || lossLose < 0.9 };
}
/** applies a battle's result: casualties, experience, retreats, captures */
export function applyOutcome(c: Campaign, w: CampaignWorld, b: Battle, o: Outcome): string {
  const att = armyById(c, b.att);
  const lines: string[] = [];
  const apply = (a: Army | undefined, won: boolean) => {
    if (!a) return;
    const left = o.men[a.id];
    if (left) a.regs.forEach((r, i) => { r.men = Math.min(r.men, left[i] ?? r.men); if (won) r.xp = Math.min(9, r.xp + 1); });
    a.regs = a.regs.filter(r => r.men >= Math.max(1, unitById(r.u).men * 0.12));
  };
  apply(att, o.winner === 'att');
  for (const id of b.defs) apply(armyById(c, id), o.winner === 'def');
  const town = b.settlement !== null ? settlementById(c, b.settlement) : null;
  if (o.winner === 'att') {
    for (const id of b.defs) {
      const d = armyById(c, id);
      if (!d) continue;
      if (!o.retreat || d.at !== null || !retreat(c, w, d, att!)) { d.regs = []; }
    }
    if (town && att && att.regs.length) {
      capture(c, town, att.owner);
      att.x = town.x; att.y = town.y; att.at = town.id;
      lines.push(`${town.name} foi tomada por ${nameOf(c, att.owner)}.`);
    }
  } else if (att) {
    if (!retreat(c, w, att, null)) att.regs = [];
  }
  c.armies = c.armies.filter(a => a.regs.length > 0);
  const wName = nameOf(c, o.winner === 'att' ? b.attacker : b.defender), lName = nameOf(c, o.winner === 'att' ? b.defender : b.attacker);
  const where = town ? ` em ${town.name}` : '';
  const text = `Batalha${where}: vitória de ${wName} sobre ${lName}.${lines.length ? ' ' + lines.join(' ') : ''}`;
  if (b.attacker === PLAYER || b.defender === PLAYER || c.factions[PLAYER].met.includes(b.attacker)) log(c, text, b.attacker === PLAYER || b.defender === PLAYER ? 'battle' : 'war', { x: b.x, y: b.y });
  // relations: the loser hates the winner a little more
  if (b.attacker !== REBELS && b.defender !== REBELS) diplo(c, b.attacker, b.defender).v -= 8;
  checkAlive(c);
  return text;
}
/** the loser steps back a few cells away from the enemy (towards its own land); false = nowhere to go */
function retreat(c: Campaign, w: CampaignWorld, a: Army, from: Army | null): boolean {
  const fx = from ? from.x : a.x + 1, fy = from ? from.y : a.y;
  let dx = a.x - fx, dy = a.y - fy;
  if (dx > w.CELL * w.W / 2) dx -= w.CELL * w.W; else if (dx < -w.CELL * w.W / 2) dx += w.CELL * w.W;
  const L = Math.hypot(dx, dy) || 1;
  for (const k of [4, 3, 5, 2, 6]) for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
    const ang = Math.atan2(dy / L, dx / L) + turn;
    const x = a.x + Math.cos(ang) * k * w.CELL, y = a.y + Math.sin(ang) * k * w.CELL;
    if (!w.isLand(w.cellOf(x, y))) continue;
    if (c.armies.some(o => o !== a && o.owner !== a.owner && w.dist(o.x, o.y, x, y) < 1.5)) continue;
    const [cx, cy] = w.centre(w.cellOf(x, y));
    a.x = cx; a.y = cy; a.at = null; a.mp = 0; a.dest = null;
    return true;
  }
  return false;
}
export function capture(c: Campaign, s: Settlement, owner: number) {
  const prev = s.owner;
  s.owner = owner;
  s.pop *= 0.85;
  s.build = null; s.queue = [];
  s.unrest = 3;
  if (s.capital) {
    s.capital = false;
    const f = prev !== REBELS ? c.factions[prev] : null;
    const next = f && c.settlements.filter(q => q.owner === prev).sort((a, b) => b.pop - a.pop)[0];
    if (f && next) { next.capital = true; f.capital = next.id; }
  }
  for (const a of c.armies) if (a.at === s.id && a.owner !== owner) a.regs = [];
  c.armies = c.armies.filter(a => a.regs.length > 0);
}
function checkAlive(c: Campaign) {
  for (const f of c.factions) {
    if (!f.alive) continue;
    const has = c.settlements.some(s => s.owner === f.id);
    if (!has) {
      f.alive = false;
      for (const a of c.armies) if (a.owner === f.id) a.regs = [];
      c.armies = c.armies.filter(a => a.regs.length > 0);
      log(c, f.id === PLAYER ? 'Sua nação caiu.' : `${nameOf(c, f.id)} foi destruída.`, f.id === PLAYER ? 'bad' : 'war');
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Diplomacy
// ---------------------------------------------------------------------------------------------------
export function declareWar(c: Campaign, a: number, b: number) {
  if (a === REBELS || b === REBELS || a === b) return;
  const d = diplo(c, a, b);
  if (d.s === 'war') return;
  const broke = d.s === 'alliance';
  d.s = 'war'; d.v = Math.min(d.v, -40); d.t = c.turn;
  // breaking a treaty angers everyone a little
  for (const f of c.factions) if (f.id !== a && f.id !== b && f.alive) diplo(c, a, f.id).v -= broke ? 15 : 5;
  if (a === PLAYER || b === PLAYER || c.factions[PLAYER].met.includes(a)) log(c, `${nameOf(c, a)} declarou guerra a ${nameOf(c, b)}.`, 'war');
  // allies of the attacked side join
  for (const f of c.factions) if (f.alive && f.id !== a && f.id !== b && diplo(c, f.id, b).s === 'alliance' && diplo(c, f.id, a).s !== 'alliance') {
    const e = diplo(c, f.id, a); e.s = 'war'; e.t = c.turn;
  }
}
export function makePeace(c: Campaign, a: number, b: number) {
  const d = diplo(c, a, b);
  d.s = 'peace'; d.t = c.turn; d.v = Math.max(d.v, -10);
  if (a === PLAYER || b === PLAYER) log(c, `Paz entre ${nameOf(c, a)} e ${nameOf(c, b)}.`, 'diplo');
}
export function makeAlliance(c: Campaign, a: number, b: number) {
  const d = diplo(c, a, b);
  d.s = 'alliance'; d.t = c.turn; d.v = Math.max(d.v, 50);
  if (a === PLAYER || b === PLAYER) log(c, `Aliança entre ${nameOf(c, a)} e ${nameOf(c, b)}.`, 'diplo');
}
export const strength = (c: Campaign, fid: number) => c.armies.filter(a => a.owner === fid).reduce((s, a) => s + armyPower(a), 0) + c.settlements.filter(s => s.owner === fid).length * 30;
/** would the AI faction `ai` accept this proposal from `from`? */
export function accepts(c: Campaign, ai: number, from: number, kind: 'peace' | 'alliance' | 'gift', gold = 0): boolean {
  const d = diplo(c, ai, from), f = c.factions[ai];
  const ratio = strength(c, from) / Math.max(1, strength(c, ai));
  if (kind === 'gift') return true;
  if (kind === 'peace') return d.s === 'war' && c.turn - d.t >= 2 && (d.v + gold / 10 + ratio * 25 - f.temper * 30 > 0 || ratio > 1.8);
  return d.s === 'peace' && c.turn - d.t >= 4 && d.v + gold / 10 > 40 - ratio * 10;
}
export function gift(c: Campaign, from: number, to: number, gold: number) {
  const f = c.factions[from];
  if (f.gold < gold) return false;
  f.gold -= gold; c.factions[to].gold += gold;
  diplo(c, from, to).v += gold / 8;
  return true;
}

// ---------------------------------------------------------------------------------------------------
// Turn
// ---------------------------------------------------------------------------------------------------
export type TurnEvent = { k: 'era'; f: number; era: number } | { k: 'won'; f: number } | { k: 'dead'; f: number };

/** end of a turn: economy, growth, research, buildings and recruits of every faction */
export function endTurnEconomy(c: Campaign, w: CampaignWorld): TurnEvent[] {
  const ev: TurnEvent[] = [];
  for (const f of c.factions) {
    if (!f.alive) continue;
    const t = factionTotals(c, f.id);
    f.gold += t.net;
    // bankrupt: regiments desert
    if (f.gold < 0) {
      const a = c.armies.filter(q => q.owner === f.id && q.regs.length).sort((p, q) => q.regs.length - p.regs.length)[0];
      if (a) { const r = a.regs.pop()!; if (f.id === PLAYER) log(c, `Sem ouro: ${unitById(r.u).name} desertou.`, 'bad'); }
      f.gold = Math.max(f.gold, -200);
    }
    if (f.research) {
      f.rp += t.research;
      const tech = techById(f.research);
      if (tech && f.rp >= techCost(tech)) learn(c, f, tech.id, ev);
    } else if (f.id === PLAYER) f.rp += t.research * 0.5; // stored, partly, until a research is chosen
    // the colony ship
    if (f.ship !== undefined && f.ship > 0) { f.ship--; if (f.ship === 0) { c.winner = f.id; ev.push({ k: 'won', f: f.id }); log(c, f.id === PLAYER ? 'A nave colonial partiu!' : `A nave colonial de ${nameOf(c, f.id)} partiu para as estrelas.`, f.id === PLAYER ? 'era' : 'bad'); } }
  }
  for (const s of c.settlements) {
    const inc = income(c, s);
    s.pop = Math.max(200, s.pop + inc.grow);
    if (s.unrest > 0) s.unrest--;
    if (s.owner === REBELS) continue;
    const f = c.factions[s.owner];
    if (s.build && --s.build.left <= 0) {
      const b = buildingById(s.build.id);
      if (b.id === 'shipyard') { f.ship = 6; if (s.owner === PLAYER) log(c, 'O estaleiro da nave colonial está pronto: a montagem começou (6 turnos).', 'era'); }
      else s.built.push(b.id);
      if (s.owner === PLAYER) log(c, `${s.name}: ${b.names[f.era]} concluído.`, 'build', s);
      s.build = null;
    }
    if (s.queue.length) {
      for (const uid of s.queue) {
        const u = unitById(uid);
        const g = garrison(c, s, true)!;
        g.regs.push({ u: uid, men: u.men, xp: s.built.includes('barracks') ? 1 : 0 });
      }
      if (s.owner === PLAYER) log(c, `${s.name}: ${s.queue.length} ${s.queue.length > 1 ? 'unidades recrutadas' : 'unidade recrutada'}.`, 'build', s);
      s.queue = [];
    }
  }
  // armies heal a little at home, refill movement
  for (const a of c.armies) {
    const f = a.owner === REBELS ? null : c.factions[a.owner];
    a.mp = f ? moveOf(f) : 0;
    if (a.at !== null) for (const r of a.regs) { const u = unitById(r.u); r.men = Math.min(u.men, r.men + Math.max(1, Math.round(u.men * 0.08))); }
  }
  // relations drift to neutral; long wars tire
  for (const d of Object.values(c.diplo)) { d.v *= 0.97; if (d.s === 'alliance') d.v = Math.min(100, d.v + 1); }
  c.turn++;
  void w;
  return ev;
}
export const seasonOf = (turn: number) => turn % 4;
export const yearOf = (turn: number) => Math.floor(turn / 4) + 1;

// ---------------------------------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------------------------------
export interface AiHooks {
  /** an AI army attacks the player: the player fights it (or lets it auto-resolve) */
  playerBattle(b: Battle): Promise<void>;
  /** an army moved (the map can animate it) */
  moved?(a: Army, fromX: number, fromY: number): void;
}
export async function aiTurn(c: Campaign, w: CampaignWorld, f: Faction, hooks: AiHooks, rnd = Math.random) {
  if (!f.alive || c.winner !== undefined) return;
  const mine = c.settlements.filter(s => s.owner === f.id);
  // research
  if (!f.research) {
    const av = availableTechs(f);
    const adv = av.find(t => t.advance);
    f.research = (adv ?? av.sort((a, b) => techCost(a) - techCost(b))[Math.floor(rnd() * Math.min(2, av.length))])?.id ?? null;
  }
  // diplomacy
  aiDiplomacy(c, w, f, rnd);
  const enemies = c.factions.filter(o => o.alive && atWar(c, f.id, o.id)).map(o => o.id);
  const threat = (s: Settlement) => c.armies.filter(a => a.owner !== f.id && (a.owner === REBELS || enemies.includes(a.owner)) && w.dist(a.x, a.y, s.x, s.y) < 30).reduce((q, a) => q + armyPower(a), 0);
  // buildings
  for (const s of mine) {
    if (s.build) continue;
    const opts = buildable(c, s);
    if (f.era >= 7 && f.techs.includes('navecolonial') && s.capital && f.ship === undefined) {
      const ship = opts.find(b => b.id === 'shipyard');
      if (ship && f.gold >= buildCost(c, s, ship)) { orderBuild(c, s, 'shipyard'); continue; }
      if (ship) continue; // saving for it
    }
    const order = threat(s) > 0 ? ['walls', 'barracks', 'farms', 'market', 'temple', 'workshop', 'port'] : ['farms', 'market', 'temple', 'barracks', 'workshop', 'port', 'walls'];
    for (const id of order) {
      const b = opts.find(q => q.id === id);
      if (!b || b.id === 'shipyard') continue;
      if (f.gold < buildCost(c, s, b) + 120) break;
      if (!orderBuild(c, s, id)) break;
    }
  }
  // recruitment: an army that grows with the realm
  const power = c.armies.filter(a => a.owner === f.id).reduce((q, a) => q + armyPower(a), 0);
  const want = (mine.length * 2.2 + 3) * 60 * Math.pow(1.55, f.era) * (0.7 + f.temper * 0.6);
  if (power < want && f.gold > 120) {
    const front = [...mine].sort((a, b) => threat(b) - threat(a) || nearestEnemyDist(c, w, f.id, a) - nearestEnemyDist(c, w, f.id, b));
    for (const s of front.slice(0, 3)) {
      const units = recruitable(c, s);
      if (!units.length) continue;
      for (let k = 0; k < recruitSlots(s); k++) {
        // a balanced army: mostly line troops, some ranged, some cavalry / armour
        const roll = rnd();
        const pick = units.filter(u => roll < 0.55 ? ['melee', 'spear', 'pike', 'gun', 'shock'].includes(u.cls) : roll < 0.8 ? ['missile', 'skirm', 'art', 'mg', 'at'].includes(u.cls) : ['cav', 'cavgun', 'tank', 'ifv', 'recon', 'heli'].includes(u.cls));
        const list = (pick.length ? pick : units).sort((a, b) => b.cost - a.cost);
        const u = list.find(q => unitCost(s, q) <= f.gold - 60);
        if (!u) break;
        orderRecruit(c, s, u.id);
      }
    }
  }
  // armies
  const armies = c.armies.filter(a => a.owner === f.id && a.regs.length);
  for (const a of armies) {
    if (!c.armies.includes(a) || !a.regs.length) continue;
    const p = armyPower(a);
    // keep a garrison in a threatened settlement
    if (a.at !== null) {
      const home = settlementById(c, a.at);
      if (home && threat(home) > p * 0.6) continue;
      if (home && c.armies.filter(q => q.at === home.id && q.owner === f.id).length === 1 && a.regs.length < 4) continue;
    }
    let best: { x: number; y: number; score: number } | null = null;
    // enemy armies in reach that we beat
    for (const o of c.armies) {
      if (o.owner === f.id || !o.regs.length || o.at !== null) continue;
      if (o.owner !== REBELS && !atWar(c, f.id, o.owner)) continue;
      const d = w.dist(a.x, a.y, o.x, o.y);
      if (d > moveOf(f) * 1.6) continue;
      const ratio = p / Math.max(1, armyPower(o));
      if (ratio < 1.25) continue;
      const score = ratio * 40 / (1 + d);
      if (!best || score > best.score) best = { x: o.x, y: o.y, score };
    }
    // enemy / free settlements
    for (const s of c.settlements) {
      if (s.owner === f.id) continue;
      if (s.owner !== REBELS && !atWar(c, f.id, s.owner)) continue;
      const d = w.dist(a.x, a.y, s.x, s.y);
      if (d > moveOf(f) * 4) continue;
      const defp = defencePower(c, s) + c.armies.filter(o => o.at === s.id).reduce((q, o) => q + armyPower(o), 0);
      const ratio = p / Math.max(1, defp);
      if (ratio < 1.3) continue;
      const score = (s.pop / 800 + (s.capital ? 4 : 1)) * Math.min(3, ratio) * 30 / (4 + d);
      if (!best || score > best.score) best = { x: s.x, y: s.y, score };
    }
    if (!best) {
      // nothing to do: gather at the most threatened settlement / stay
      if (a.at === null) {
        const home = [...mine].sort((q, r) => threat(r) - threat(q) || w.dist(a.x, a.y, q.x, q.y) - w.dist(a.x, a.y, r.x, r.y))[0];
        if (home) step(c, w, a, home.x, home.y, hooks, false);
      }
      continue;
    }
    const res = step(c, w, a, best.x, best.y, hooks, true);
    if (res && res.k === 'battle') {
      const b = res.battle;
      if (b.defender === PLAYER) await hooks.playerBattle(b);
      else applyOutcome(c, w, b, autoResolve(c, b, rnd));
    }
  }
}
function step(c: Campaign, w: CampaignWorld, a: Army, x: number, y: number, hooks: AiHooks, attack: boolean) {
  const fx = a.x, fy = a.y;
  const r = moveArmy(c, w, a, x, y, attack);
  if (a.x !== fx || a.y !== fy) hooks.moved?.(a, fx, fy);
  return r;
}
function nearestEnemyDist(c: Campaign, w: CampaignWorld, fid: number, s: Settlement) {
  let d = Infinity;
  for (const o of c.settlements) if (o.owner !== fid) d = Math.min(d, w.dist(s.x, s.y, o.x, o.y));
  return d;
}
function aiDiplomacy(c: Campaign, w: CampaignWorld, f: Faction, rnd: () => number) {
  const me = strength(c, f.id);
  for (const o of c.factions) {
    if (o.id === f.id || !o.alive) continue;
    const d = diplo(c, f.id, o.id);
    const them = strength(c, o.id);
    const near = c.settlements.some(s => s.owner === f.id && c.settlements.some(q => q.owner === o.id && w.dist(s.x, s.y, q.x, q.y) < 70));
    if (d.s === 'war') {
      // tired or losing: peace
      if (c.turn - d.t > 8 && (me < them * 0.8 || rnd() < 0.08)) {
        if (o.id === PLAYER) { if (!c.offers.some(q => q.from === f.id)) c.offers.push({ id: c.nextId++, from: f.id, kind: 'peace', turn: c.turn }); }
        else if (accepts(c, o.id, f.id, 'peace')) makePeace(c, f.id, o.id);
      }
    } else if (d.s === 'peace') {
      // a weak neighbour, a bad relation, a warlike temper: war
      if (near && c.turn - d.t > 6 && them < me * (0.75 - f.temper * 0.2 + 0.4) && d.v < 15 && rnd() < 0.05 + f.temper * 0.12) declareWar(c, f.id, o.id);
      else if (d.v > 45 && rnd() < 0.05) {
        if (o.id === PLAYER) { if (!c.offers.some(q => q.from === f.id)) c.offers.push({ id: c.nextId++, from: f.id, kind: 'alliance', turn: c.turn }); }
        else if (accepts(c, o.id, f.id, 'alliance')) makeAlliance(c, f.id, o.id);
      } else if (o.id === PLAYER && near && me > them * 2 && d.v < 0 && rnd() < 0.04 && !c.offers.some(q => q.from === f.id)) {
        c.offers.push({ id: c.nextId++, from: f.id, kind: 'tribute', gold: Math.round(80 * Math.pow(1.5, f.era)), turn: c.turn });
      }
    }
    // shared enemies warm relations
    for (const e of c.factions) if (e.alive && e.id !== f.id && e.id !== o.id && atWar(c, f.id, e.id) && atWar(c, o.id, e.id)) d.v += 0.6;
  }
}
/** the player's answer to an AI offer */
export function answerOffer(c: Campaign, id: number, yes: boolean) {
  const o = c.offers.find(q => q.id === id);
  if (!o) return;
  c.offers = c.offers.filter(q => q !== o);
  if (o.kind === 'peace') { if (yes) makePeace(c, PLAYER, o.from); else diplo(c, PLAYER, o.from).v -= 5; }
  else if (o.kind === 'alliance') { if (yes) makeAlliance(c, PLAYER, o.from); else diplo(c, PLAYER, o.from).v -= 10; }
  else if (o.kind === 'tribute') {
    if (yes && gift(c, PLAYER, o.from, o.gold ?? 0)) log(c, `Tributo pago a ${nameOf(c, o.from)}.`, 'diplo');
    else declareWar(c, o.from, PLAYER);
  }
}

// ---------------------------------------------------------------------------------------------------
// A new campaign
// ---------------------------------------------------------------------------------------------------
export interface Site { x: number; y: number; tx: number; ty: number; capital: boolean; evo: number; coast: boolean; fert: number; name: string; seed: number }
export interface NewCampaign { seed: number; era: number; home: { x: number; y: number }; sites: Site[]; species: string; rivals?: number; techs?: string[] }

export function newCampaign(w: CampaignWorld, o: NewCampaign): Campaign {
  const rnd = mulberry(o.seed ^ 0x51ed27);
  const c: Campaign = { v: 1, turn: 0, seed: o.seed, factions: [], settlements: [], armies: [], diplo: {}, nextId: 1, log: [], offers: [], species: o.species };
  // the capital: the site nearest to where the lineage lived, preferring a landmass shared with other sites
  // (a lonely island makes a poor cradle for a nation)
  const byDist = [...o.sites].sort((a, b) => w.dist(a.x, a.y, o.home.x, o.home.y) - w.dist(b.x, b.y, o.home.x, o.home.y));
  const mates = (s: Site) => { const m = w.landmass(w.cellOf(s.x, s.y)); return o.sites.filter(q => q !== s && w.landmass(w.cellOf(q.x, q.y)) === m && w.dist(q.x, q.y, s.x, s.y) > 18).length; };
  const homeSite = byDist.find(s => w.dist(s.x, s.y, o.home.x, o.home.y) < 220 && mates(s) >= 3) ?? byDist.find(s => mates(s) >= 1) ?? byDist[0];
  const sites = o.sites.filter(s => s === homeSite || w.dist(s.x, s.y, homeSite.x, homeSite.y) > 18);
  // the player's capital is the site nearest to where the lineage lived; rival capitals are the nearest other ones
  const capitals = sites.filter(s => s !== homeSite && s.capital).sort((a, b) => w.dist(a.x, a.y, homeSite.x, homeSite.y) - w.dist(b.x, b.y, homeSite.x, homeSite.y));
  const nRivals = Math.min(o.rivals ?? 7, capitals.length);
  const founders = [homeSite, ...capitals.slice(0, nRivals)];
  const pastTechs = TECHS.filter(t => t.era < o.era).map(t => t.id);
  founders.forEach((s, i) => {
    c.factions.push({
      id: i, base: s.name, color: FACTION_COLORS[i % FACTION_COLORS.length], seed: s.seed, era: o.era,
      techs: [...pastTechs, ...(i === PLAYER ? o.techs ?? [] : [])].filter((v, k, a) => a.indexOf(v) === k && techById(v)), research: null, rp: 0,
      gold: 300 + o.era * 400, alive: true, ai: i !== PLAYER, capital: -1, met: [], temper: i === PLAYER ? 0 : 0.2 + rnd() * 0.7,
    });
  });
  for (const s of sites) {
    const owner = founders.indexOf(s);
    const st: Settlement = {
      id: c.nextId++, name: s.name, owner: owner >= 0 ? owner : REBELS, x: s.x, y: s.y, tx: s.tx, ty: s.ty,
      pop: Math.round((owner >= 0 ? 1400 : 500 + s.evo * 12) * (1 + o.era * 1.2)), coast: s.coast, fert: s.fert, capital: owner >= 0, seed: s.seed,
      built: owner >= 0 && o.era > 0 ? ['farms', 'market'].slice(0, Math.min(2, o.era)) : [], build: null, queue: [], cityId: 0, unrest: 0,
    };
    st.cityId = st.id;
    c.settlements.push(st);
    if (owner >= 0) c.factions[owner].capital = st.id;
  }
  // each rival takes the free settlement nearest its capital
  for (const f of c.factions) {
    if (f.id === PLAYER) continue;
    const cap = settlementById(c, f.capital)!;
    const near = c.settlements.filter(s => s.owner === REBELS).sort((a, b) => w.dist(a.x, a.y, cap.x, cap.y) - w.dist(b.x, b.y, cap.x, cap.y))[0];
    if (near && w.dist(near.x, near.y, cap.x, cap.y) < 60) near.owner = f.id;
  }
  // starting armies of the era (a veteran force: it may hold units the nation cannot recruit yet)
  for (const f of c.factions) {
    const cap = settlementById(c, f.capital)!;
    const roster = START_ARMY[Math.min(7, f.era)].map(id => unitById(id));
    const field: Army = { id: c.nextId++, owner: f.id, x: cap.x, y: cap.y, regs: roster.map(u => ({ u: u.id, men: u.men, xp: 0 })), mp: moveOf(f), at: cap.id };
    c.armies.push(field);
  }
  // free towns keep a small war band each (rebels)
  // relations: everyone starts at peace, a few old feuds between rivals
  for (let i = 1; i < c.factions.length; i++) for (let j = i + 1; j < c.factions.length; j++) if (rnd() < 0.15) { const d = diplo(c, i, j); d.s = 'war'; d.v = -40; }
  for (const f of c.factions) f.research = f.ai ? availableTechs(f)[0]?.id ?? null : null;
  log(c, `A nação de ${o.species} nasce em ${homeSite.name}.`, 'era', homeSite);
  return c;
}
