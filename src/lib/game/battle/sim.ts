// Real-time battles of the civilisation eras, fought on the planet's own terrain (Total War style).
// Regiments are blocks of soldiers in formation slots; soldiers walk to their slots, lock in melee with the
// nearest enemies, fire missiles or volleys, rout when morale breaks and rally if they can. The rules change with
// the era's battle style:
//  - warband (tribal): loose bands, wedges, javelins; morale breaks fast;
//  - formation (medieval): line, shield wall, wedge, pike brace (charges into braced pikes fail), loose order;
//  - line (classic): line infantry fires by ranks in volleys (heavy smoke), columns march fast, squares stop
//    cavalry, skirmishers spread; cannons fire round shot that bounces through the ranks;
//  - trench (industrial): both sides start in trench lines behind barbed wire; machine guns pin whole lines
//    (suppression), howitzers lay barrages, infantry goes over the top;
//  - combined (modern+, Steel Division / WARNO): command points buy units from the army into the field, sectors
//    give points and victory, recon and line of sight (fog of war), vehicles with armour and penetration,
//    indirect artillery on map points, attack helicopters and air strikes.
import type { BattleStyle } from '../eras';
import type { UnitDef } from '../campaign/units';
import type { Death } from '../../creature/death';

export type Anim = 'idle' | 'walk' | 'run' | 'use';
export type Form = 'line' | 'loose' | 'wedge' | 'shieldwall' | 'brace' | 'column' | 'square' | 'skirmish' | 'assault';

export const FORM_NAME: Record<Form, string> = {
  line: 'Linha', loose: 'Solta', wedge: 'Cunha', shieldwall: 'Parede de escudos', brace: 'Muralha de piques', column: 'Coluna',
  square: 'Quadrado', skirmish: 'Escaramuça', assault: 'Assalto',
};
/** formations a unit may take in a battle style */
export function formsFor(style: BattleStyle, u: UnitDef): Form[] {
  if (u.el === 'vehicle' || u.el === 'piece') return ['line'];
  if (style === 'warband') return u.cls === 'cav' ? ['loose', 'wedge'] : ['loose', 'wedge', 'line'];
  if (style === 'formation') {
    if (u.cls === 'pike') return ['line', 'brace', 'loose'];
    if (u.cls === 'spear' || (u.shield ?? 0) > 0.3) return ['line', 'shieldwall', 'loose'];
    if (u.cls === 'cav') return ['line', 'wedge', 'loose'];
    return ['line', 'loose'];
  }
  if (style === 'line') {
    if (u.cls === 'cav' || u.cls === 'cavgun') return ['line', 'column', 'wedge'];
    if (u.cls === 'skirm') return ['skirmish', 'line'];
    if (u.cls === 'pike') return ['line', 'brace', 'square'];
    return ['line', 'column', 'square', 'skirmish'];
  }
  if (style === 'trench') return u.cls === 'cav' ? ['line', 'loose'] : ['line', 'assault', 'loose'];
  return ['loose'];
}
const FORM: Record<Form, { sx: number; sy: number; speed: number; jitter: number }> = {
  line: { sx: 10, sy: 11, speed: 1, jitter: 0.6 },
  loose: { sx: 17, sy: 17, speed: 1.05, jitter: 4 },
  wedge: { sx: 10, sy: 10, speed: 1, jitter: 0.6 },
  shieldwall: { sx: 8, sy: 9, speed: 0.6, jitter: 0.3 },
  brace: { sx: 8, sy: 9, speed: 0, jitter: 0.3 },
  column: { sx: 9, sy: 9, speed: 1.3, jitter: 0.4 },
  square: { sx: 9, sy: 9, speed: 0.25, jitter: 0.3 },
  skirmish: { sx: 22, sy: 22, speed: 1.1, jitter: 5 },
  assault: { sx: 20, sy: 20, speed: 1.15, jitter: 6 },
};

export interface Soldier {
  i: number; u: Unit;
  x: number; y: number; hp: number; hp0: number;
  alive: boolean; fled: boolean;
  /** facing (0..7, DIRS order E, SE, S, SW, W, NW, N, NE) */
  dir: number; anim: Anim; ph: number;
  /** seconds the 'use' animation still shows */
  useT: number;
  cd: number; foe: Soldier | null;
  /** death: kind and time it started (the body stays) */
  death: Death | null; dieT: number;
  slot: number;
  /** a gun crew belongs to its piece */
  piece: Soldier | null; isPiece: boolean;
  /** flying height (helicopters, aircraft) */
  z: number;
  moving: boolean;
}
export type Order =
  | { k: 'idle' }
  | { k: 'move'; x: number; y: number; fa: number; run: boolean }
  | { k: 'attack'; t: Unit; run: boolean }
  | { k: 'fire'; x: number; y: number }
  | { k: 'strike'; x: number; y: number };
export interface Unit {
  id: number; side: 0 | 1; def: UnitDef; era: number; faction: number; color: string;
  /** campaign link: army and regiment index (-1 = settlement militia) */
  army: number; reg: number;
  men: Soldier[]; start: number;
  form: Form; fa: number; cx: number; cy: number; files: number;
  order: Order; run: boolean; fireAtWill: boolean; guard: boolean;
  morale: number; mor0: number; rout: boolean; shattered: boolean; routs: number; rallyT: number;
  sup: number; ammo: number; volleyT: number; volleyRank: number;
  engaged: boolean; chargeT: number; flank: number; lossT: number;
  target: Unit | null;
  /** on the field (combined arms: bought with command points) */
  deployed: boolean;
  /** aircraft strike state */
  strike?: { x: number; y: number; t: number; done: boolean; fromX: number; fromY: number };
  label: string;
  /** inside a trench line */
  dug: boolean;
  aiT: number;
  /** seen by the enemy (fog of war, combined arms) */
  seen: [boolean, boolean];
  /** left the field (escaped rout or withdrew) */
  gone: boolean;
  /** mean distance of the soldiers to their slots: the formation waits for them */
  lag: number; lagSum?: number; lagN?: number;
}
export interface Projectile {
  k: 'arrow' | 'bolt' | 'javelin' | 'bullet' | 'tracer' | 'shell' | 'roundshot' | 'rocket' | 'grenade' | 'bomb' | 'plasma' | 'stone';
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; arc: number;
  side: 0 | 1; from: Unit; dmg: number; ap: number; blast: number; sup: number; acc: number;
  target: Unit | null;
}
export type Fx =
  | { k: 'flash'; x: number; y: number; t: number; big: boolean }
  | { k: 'smoke'; x: number; y: number; t: number; r: number; dark: boolean }
  | { k: 'boom'; x: number; y: number; t: number; r: number }
  | { k: 'tracer'; x0: number; y0: number; x1: number; y1: number; t: number }
  | { k: 'crater'; x: number; y: number; r: number }
  | { k: 'dust'; x: number; y: number; t: number };

export interface BattleTerrain {
  /** walkable for soldiers / vehicles */
  ok(x: number, y: number): boolean;
  level(x: number, y: number): number;
  water(x: number, y: number): boolean;
}
export interface SideSetup {
  faction: number; color: string; era: number; player: boolean; name: string;
  regs: { army: number; reg: number; def: UnitDef; men: number; xp: number }[];
  /** settlement militia */
  militia?: { def: UnitDef; men: number }[];
  morale: number;
}
export interface BattleSetup {
  style: BattleStyle;
  /** battlefield centre, axis angle (attacker -> defender) */
  cx: number; cy: number; fa: number;
  /** half sizes along the axis and across it */
  hl: number; hw: number;
  sides: [SideSetup, SideSetup];
  siege: { x: number; y: number; walls: boolean } | null;
  terrain: BattleTerrain;
  seed: number;
}
export interface Sector { x: number; y: number; r: number; owner: -1 | 0 | 1; p: number; name: string }

const DIR_ANG = [0, 1, 2, 3, 4, 5, 6, 7].map(i => (i * Math.PI) / 4);
export const dirOf = (dx: number, dy: number) => (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
const rnd0 = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const isAir = (u: Unit) => u.def.cls === 'heli' || u.def.cls === 'air';
const isMounted = (u: Unit) => u.def.el === 'mounted';
const isMech = (u: Unit) => u.def.el === 'vehicle';

export class BattleSim {
  style: BattleStyle;
  t = 0;
  phase: 'deploy' | 'fight' | 'end' = 'deploy';
  units: Unit[] = [];
  soldiers: Soldier[] = [];
  shots: Projectile[] = [];
  fx: Fx[] = [];
  craters: Fx[] = [];
  winner: 0 | 1 | null = null;
  endReason = '';
  /** combined arms: command points and victory points per side */
  pts: [number, number] = [0, 0];
  vp: [number, number] = [0, 0];
  sectors: Sector[] = [];
  /** trench lines (world polylines) per side, barbed wire belts */
  trenches: [number, number][][] = [];
  wire: [number, number][][] = [];
  /** siege objective: the attacker holds the centre */
  hold = 0;
  limit: number;
  messages: string[] = [];
  readonly setup: BattleSetup;
  private rnd: () => number;
  private hash = new Map<number, Soldier[]>();
  private nextId = 1;
  /** deployment zones (centre along the axis, half depth) per side */
  zones: { x: number; y: number; hl: number; hw: number }[] = [];
  /** forward vector (attacker -> defender) and right vector */
  fx0: number; fy0: number; rx: number; ry: number;

  constructor(s: BattleSetup) {
    this.setup = s;
    this.style = s.style;
    this.rnd = rnd0(s.seed);
    this.fx0 = Math.cos(s.fa); this.fy0 = Math.sin(s.fa);
    this.rx = -this.fy0; this.ry = this.fx0;
    this.limit = s.style === 'combined' ? 20 * 60 : 18 * 60;
    const zoneOff = s.hl * 0.62;
    this.zones = [
      { x: s.cx - this.fx0 * zoneOff, y: s.cy - this.fy0 * zoneOff, hl: s.hl * 0.3, hw: s.hw * 0.9 },
      s.siege ? { x: s.siege.x, y: s.siege.y, hl: s.hl * 0.32, hw: s.hw * 0.6 } : { x: s.cx + this.fx0 * zoneOff, y: s.cy + this.fy0 * zoneOff, hl: s.hl * 0.3, hw: s.hw * 0.9 },
    ];
    if (s.style === 'trench') this.digTrenches();
    if (s.style === 'combined') this.makeSectors();
    s.sides.forEach((side, k) => this.deploySide(side, k as 0 | 1));
    if (s.style === 'combined') this.pts = [Math.max(400, this.deckCost(0) * 0.45), Math.max(400, this.deckCost(1) * 0.45)];
    // the AI side deploys what it can afford at once (combined arms)
    for (const k of [0, 1] as const) if (!s.sides[k].player) this.aiDeploy(k);
  }

  // -------------------------------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------------------------------
  /** world point of local coords (a along the attack axis, b across) */
  at(a: number, b: number): [number, number] { return [this.setup.cx + this.fx0 * a + this.rx * b, this.setup.cy + this.fy0 * a + this.ry * b]; }
  /** local coords of a world point */
  local(x: number, y: number): [number, number] { const dx = x - this.setup.cx, dy = y - this.setup.cy; return [dx * this.fx0 + dy * this.fy0, dx * this.rx + dy * this.ry]; }
  inField(x: number, y: number, pad = 0) { const [a, b] = this.local(x, y); return Math.abs(a) <= this.setup.hl + pad && Math.abs(b) <= this.setup.hw + pad; }
  inZone(k: 0 | 1, x: number, y: number) {
    const z = this.zones[k];
    const dx = x - z.x, dy = y - z.y, a = dx * this.fx0 + dy * this.fy0, b = dx * this.rx + dy * this.ry;
    return Math.abs(a) <= z.hl && Math.abs(b) <= z.hw;
  }
  /** facing of a side: towards the enemy */
  sideFa(k: 0 | 1) { return k === 0 ? this.setup.fa : this.setup.fa + Math.PI; }

  private digTrenches() {
    const s = this.setup;
    for (const k of [0, 1] as const) {
      const a0 = (k === 0 ? -1 : 1) * s.hl * 0.36;
      const line: [number, number][] = [], wire: [number, number][] = [];
      for (let b = -s.hw * 0.95; b <= s.hw * 0.95; b += 60) {
        const zig = ((Math.round(b / 60) % 2) ? 16 : -16) + (this.rnd() - 0.5) * 10;
        line.push(this.at(a0 + zig, b));
        wire.push(this.at(a0 + (k === 0 ? 1 : -1) * 120 + (this.rnd() - 0.5) * 16, b));
      }
      this.trenches.push(line); this.wire.push(wire);
    }
  }
  private makeSectors() {
    const s = this.setup, names = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'];
    const spots: [number, number][] = [[-s.hl * 0.28, -s.hw * 0.55], [s.hl * 0.05, -s.hw * 0.15], [-s.hl * 0.05, s.hw * 0.3], [s.hl * 0.3, s.hw * 0.6], [0, s.hw * 0.85 * (this.rnd() < 0.5 ? -1 : 1)]];
    spots.forEach(([a, b], i) => { const [x, y] = this.at(a, b); this.sectors.push({ x, y, r: 200, owner: -1, p: 0, name: names[i] }); });
  }
  private deckCost(k: 0 | 1) { return this.units.filter(u => u.side === k).reduce((q, u) => q + u.def.pts, 0); }
  private deploySide(side: SideSetup, k: 0 | 1) {
    const z = this.zones[k];
    const fa = this.sideFa(k);
    const all = [...side.regs.map(r => ({ ...r })), ...(side.militia ?? []).map(m => ({ army: -1, reg: -1, def: m.def, men: m.men, xp: 0 }))];
    // order on the line: infantry in the centre, missiles ahead (or mixed in line), cavalry on the flanks, guns behind
    const role = (d: UnitDef) => (d.cls === 'cav' || d.cls === 'cavgun' || d.cls === 'recon' || d.cls === 'tank' || d.cls === 'ifv' || d.cls === 'heli' ? 'flank' : d.cls === 'art' || d.cls === 'aa' || d.cls === 'air' ? 'back' : d.cls === 'missile' || d.cls === 'skirm' ? 'front' : 'main');
    const groups: Record<string, typeof all> = { main: [], front: [], flank: [], back: [] };
    for (const r of all) groups[role(r.def)].push(r);
    const place = (list: typeof all, depth: number) => {
      const widths = list.map(r => this.unitWidth(r.def, r.men));
      const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, list.length - 1) * 24;
      let b = -total / 2;
      list.forEach((r, i) => {
        const bw = widths[i];
        const cb = b + bw / 2; b += bw + 24;
        this.addUnit(side, k, r, z.x + Math.cos(fa) * depth - Math.sin(fa) * cb, z.y + Math.sin(fa) * depth + Math.cos(fa) * cb, fa);
      });
    };
    const flankL = groups.flank.filter((_, i) => i % 2 === 0), flankR = groups.flank.filter((_, i) => i % 2 === 1);
    const front = this.style === 'line' || this.style === 'trench' || this.style === 'combined' ? [] : groups.front;
    const main = this.style === 'line' || this.style === 'trench' || this.style === 'combined' ? [...groups.main, ...groups.front] : groups.main;
    // in the trench war both lines start in their trenches
    place(main, this.style === 'trench' ? z.hl * 0.87 : z.hl * 0.1);
    if (front.length) place(front, z.hl * 0.55);
    place(groups.back, -z.hl * 0.6);
    // flanks beyond the ends of the main line
    const mainW = main.reduce((q, r) => q + this.unitWidth(r.def, r.men) + 24, 0) / 2 + 60;
    const side2 = (list: typeof all, sgn: number) => {
      let off = mainW;
      for (const r of list) {
        const w = this.unitWidth(r.def, r.men);
        const cb = sgn * (off + w / 2); off += w + 24;
        const [lx, ly] = [z.x + Math.cos(fa) * z.hl * 0.05 - Math.sin(fa) * cb, z.y + Math.sin(fa) * z.hl * 0.05 + Math.cos(fa) * cb];
        this.addUnit(side, k, r, lx, ly, fa);
      }
    };
    side2(flankL, -1); side2(flankR, 1);
    for (const u of this.units) if (u.side === k) { const c = this.clampToZone(k, u.cx, u.cy); u.cx = c[0]; u.cy = c[1]; this.snapToSlots(u); }
  }
  clampField(x: number, y: number, pad = 40): [number, number] {
    const [a, b] = this.local(x, y), s = this.setup;
    return this.at(Math.max(-s.hl + pad, Math.min(s.hl - pad, a)), Math.max(-s.hw + pad, Math.min(s.hw - pad, b)));
  }
  clampToZone(k: 0 | 1, x: number, y: number): [number, number] {
    const z = this.zones[k];
    const dx = x - z.x, dy = y - z.y;
    const a = Math.max(-z.hl, Math.min(z.hl, dx * this.fx0 + dy * this.fy0)), b = Math.max(-z.hw, Math.min(z.hw, dx * this.rx + dy * this.ry));
    return [z.x + this.fx0 * a + this.rx * b, z.y + this.fy0 * a + this.ry * b];
  }
  unitWidth(d: UnitDef, men: number) {
    if (d.el === 'vehicle') return men * 60;
    if (d.el === 'piece') return men * 46;
    const files = this.defaultFiles(d, men, this.defaultForm(d));
    const f = FORM[this.defaultForm(d)];
    return files * (d.el === 'mounted' ? f.sx * 1.8 : f.sx);
  }
  defaultForm(d: UnitDef): Form {
    if (this.style === 'warband') return 'loose';
    if (this.style === 'combined') return 'loose';
    if (this.style === 'line') return d.cls === 'skirm' ? 'skirmish' : 'line';
    return 'line';
  }
  defaultFiles(d: UnitDef, men: number, f: Form) {
    if (d.el === 'vehicle' || d.el === 'piece') return men;
    if (f === 'column') return Math.min(6, men);
    if (f === 'wedge') return 1;
    if (this.style === 'line' && f === 'line' && (d.cls === 'gun')) return Math.ceil(men / 2);   // two ranks fire
    if (d.el === 'mounted') return Math.ceil(men / 2);
    if (f === 'loose' || f === 'skirmish' || f === 'assault') return Math.ceil(Math.sqrt(men * 2));
    return Math.ceil(men / 4);
  }
  private addUnit(side: SideSetup, k: 0 | 1, r: { army: number; reg: number; def: UnitDef; men: number; xp: number }, x: number, y: number, fa: number) {
    const d = r.def;
    const form = this.defaultForm(d);
    const u: Unit = {
      id: this.nextId++, side: k, def: d, era: side.era, faction: side.faction, color: side.color, army: r.army, reg: r.reg,
      men: [], start: r.men, form, fa, cx: x, cy: y, files: this.defaultFiles(d, r.men, form),
      order: { k: 'idle' }, run: false, fireAtWill: true, guard: false,
      morale: d.morale + r.xp * 4 + side.morale, mor0: d.morale + r.xp * 4 + side.morale, rout: false, shattered: false, routs: 0, rallyT: 0,
      sup: 0, ammo: d.range ? (d.thrown ? 2 : d.cls === 'missile' ? 24 : 60) : 0, volleyT: 0, volleyRank: 0,
      engaged: false, chargeT: 0, flank: 0, lossT: 0, target: null,
      deployed: this.style !== 'combined', label: d.name, dug: false, aiT: this.rnd() * 2, seen: [k === 0, k === 1], gone: false, lag: 0,
    };
    const mk = (isPiece: boolean, piece: Soldier | null, hp: number): Soldier => ({
      i: this.soldiers.length, u, x, y, hp, hp0: hp, alive: true, fled: false, dir: dirOf(Math.cos(fa), Math.sin(fa)), anim: 'idle', ph: this.rnd() * 4,
      useT: 0, cd: this.rnd() * 1.5, foe: null, death: null, dieT: 0, slot: u.men.length, piece, isPiece, z: d.cls === 'heli' ? 46 : 0, moving: false,
    });
    for (let i = 0; i < r.men; i++) {
      const s = mk(d.el === 'piece', null, d.el === 'vehicle' || d.el === 'piece' ? d.hp : d.hp * 2.2);
      u.men.push(s); this.soldiers.push(s);
      if (d.el === 'piece') for (let c = 0; c < (d.crew ?? 2); c++) { const q = mk(false, s, 22); q.slot = -1; u.men.push(q); this.soldiers.push(q); }
    }
    this.units.push(u);
  }
  private aiDeploy(k: 0 | 1) {
    if (this.style !== 'combined') return;
    const list = this.units.filter(u => u.side === k && !u.deployed && u.def.cls !== 'air').sort((a, b) => a.def.pts - b.def.pts);
    let budget = this.pts[k];
    for (const u of list) { if (u.def.pts <= budget) { budget -= u.def.pts; u.deployed = true; } }
    this.pts[k] = budget;
  }
  /** combined arms: bring a unit onto the field (deployment or reinforcement) */
  callIn(u: Unit): boolean {
    if (u.deployed || this.pts[u.side] < u.def.pts) return false;
    this.pts[u.side] -= u.def.pts;
    u.deployed = true;
    if (this.phase === 'fight') {
      // reinforcements arrive at the back of the zone
      const z = this.zones[u.side], back = -this.zones[u.side].hl * 0.9;
      const fa = this.sideFa(u.side);
      u.cx = z.x + Math.cos(fa) * back; u.cy = z.y + Math.sin(fa) * back;
      this.snapToSlots(u);
    }
    return true;
  }
  /** deploy phase: place a unit (inside its zone) */
  place(u: Unit, x: number, y: number, fa = u.fa) {
    const [cx, cy] = this.clampToZone(u.side, x, y);
    u.cx = cx; u.cy = cy; u.fa = fa;
    this.snapToSlots(u);
  }
  start() {
    this.phase = 'fight';
    for (const k of [0, 1] as const) if (!this.setup.sides[k].player) this.aiDeploy(k);
  }

  // -------------------------------------------------------------------------------------------------
  // Formation slots
  // -------------------------------------------------------------------------------------------------
  alive(u: Unit) { return u.men.filter(s => s.alive && !s.fled && s.slot >= 0); }
  count(u: Unit) { let n = 0; for (const s of u.men) if (s.alive && !s.fled && (s.slot >= 0)) n++; return n; }
  /** world position of slot `k` of a unit (n men alive) */
  slotPos(u: Unit, k: number, n: number, cx = u.cx, cy = u.cy, fa = u.fa): [number, number] {
    const F = FORM[u.form];
    const mounted = isMounted(u), sx = F.sx * (mounted ? 1.8 : 1) * (isMech(u) ? 6 : u.def.el === 'piece' ? 4.6 : 1), sy = F.sy * (mounted ? 1.9 : 1) * (isMech(u) ? 5 : u.def.el === 'piece' ? 3 : 1);
    const fx = Math.cos(fa), fy = Math.sin(fa), rx = -fy, ry = fx;
    let a = 0, b = 0;
    if (u.form === 'wedge') {
      // rank r holds 2r+1 soldiers
      let r = 0, used = 0;
      while (used + 2 * r + 1 <= k) { used += 2 * r + 1; r++; }
      const i = k - used;
      b = (i - r) * sx; a = -r * sy;
    } else if (u.form === 'square') {
      const side = Math.max(2, Math.ceil(n / 4)), q = Math.floor(k / side), i = k % side;
      const half = (side - 1) * sx / 2, t = -half + i * sx;
      [a, b] = q === 0 ? [half, t] : q === 1 ? [t, half] : q === 2 ? [-half, -t] : [-t, -half];
    } else {
      const files = Math.max(1, Math.min(u.files, n));
      const ranks = Math.ceil(n / files);
      const r = Math.floor(k / files), i = k % files;
      const inRank = r === ranks - 1 ? n - r * files : files;
      b = (i - (inRank - 1) / 2) * sx; a = -r * sy;
    }
    const j = F.jitter * (isMech(u) ? 4 : 1);
    if (j) { const h = Math.sin(k * 12.9898 + u.id * 78.233) * 43758.5453; const jr = (h - Math.floor(h)) - 0.5; a += jr * j * 2; b += Math.cos(k * 3.7 + u.id) * j; }
    return [cx + fx * a + rx * b, cy + fy * a + ry * b];
  }
  snapToSlots(u: Unit) {
    const men = this.alive(u);
    men.forEach((s, k) => {
      const [x, y] = this.slotPos(u, k, men.length);
      s.x = x; s.y = y; s.dir = dirOf(Math.cos(u.fa), Math.sin(u.fa));
      s.slot = k;
    });
    this.placeCrews(u);
  }
  private placeCrews(u: Unit) {
    for (const s of u.men) if (s.piece && s.alive) {
      const p = s.piece, k = u.men.indexOf(s) - u.men.indexOf(p);
      const ang = u.fa + Math.PI + (k - 1.5) * 0.7;
      s.x = p.x + Math.cos(ang) * 14; s.y = p.y + Math.sin(ang) * 10;
    }
  }

  // -------------------------------------------------------------------------------------------------
  // Orders (player and AI)
  // -------------------------------------------------------------------------------------------------
  orderMove(u: Unit, x: number, y: number, fa: number, run = u.run) {
    if (u.rout || u.shattered || !u.deployed) return;
    if (this.phase === 'deploy') { this.place(u, x, y, fa); return; }
    [x, y] = this.clampField(x, y);
    u.order = { k: 'move', x, y, fa, run }; u.target = null;
  }
  orderAttack(u: Unit, t: Unit, run = true) {
    if (u.rout || u.shattered || !u.deployed || t.side === u.side) return;
    u.order = { k: 'attack', t, run }; u.target = t;
  }
  orderFire(u: Unit, x: number, y: number) {
    if (!u.def.indirect && u.def.cls !== 'air') return;
    if (u.def.cls === 'air') { this.orderStrike(u, x, y); return; }
    u.order = { k: 'fire', x, y }; u.target = null;
  }
  orderStrike(u: Unit, x: number, y: number) {
    if (u.def.cls !== 'air' || u.strike) return;
    if (!u.deployed && !this.callIn(u)) return;
    const z = this.zones[u.side], fa = this.sideFa(u.side);
    const fromX = z.x - Math.cos(fa) * this.setup.hl, fromY = z.y - Math.sin(fa) * this.setup.hl;
    u.strike = { x, y, t: 0, done: false, fromX, fromY };
    u.cx = fromX; u.cy = fromY;
    for (const s of this.alive(u)) { s.x = fromX; s.y = fromY; s.z = 120; }
    u.order = { k: 'strike', x, y };
  }
  stop(u: Unit) { u.order = { k: 'idle' }; u.target = null; }
  setForm(u: Unit, f: Form) {
    if (!formsFor(this.style, u.def).includes(f)) return;
    u.form = f;
    u.files = this.defaultFiles(u.def, this.count(u), f);
    if (this.phase === 'deploy') this.snapToSlots(u);
  }
  /** every unit of a side leaves the field (the battle is lost, survivors keep their men) */
  withdraw(k: 0 | 1) {
    for (const u of this.units) if (u.side === k && !u.gone) { u.rout = true; u.morale = 0; }
    this.finish(k === 0 ? 1 : 0, 'Retirada');
  }

  // -------------------------------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------------------------------
  step(dt: number) {
    if (this.phase === 'end') { this.ageFx(dt); return; }
    if (this.phase === 'deploy') { this.idleAnims(dt); this.ageFx(dt); return; }
    this.t += dt;
    this.rehash();
    for (const k of [0, 1] as const) if (!this.setup.sides[k].player || this.autoPlayer) this.ai(k, dt);
    for (const u of this.units) this.updateUnit(u, dt);
    for (const u of this.units) { u.lagSum = 0; u.lagN = 0; }
    for (const s of this.soldiers) this.updateSoldier(s, dt);
    for (const u of this.units) u.lag = u.lagN ? u.lagSum / u.lagN : 0;
    this.updateShots(dt);
    if (this.style === 'combined') { this.updateSectors(dt); this.updateVision(); }
    this.ageFx(dt);
    if (Math.floor(this.t) !== Math.floor(this.t - dt)) this.checkEnd();
  }
  /** the player's units are run by the AI too (when the player hands over command) */
  autoPlayer = false;
  private idleAnims(dt: number) { for (const s of this.soldiers) { s.ph += dt; s.anim = 'idle'; } }
  private ageFx(dt: number) {
    for (const f of this.fx) if ('t' in f) f.t += dt;
    this.fx = this.fx.filter(f => !('t' in f) || f.t < (f.k === 'smoke' ? (f.dark ? 9 : 6) : f.k === 'boom' ? 1.2 : f.k === 'dust' ? 1.5 : 0.25));
  }
  private key(x: number, y: number) { return (Math.floor(x / 32) & 0xffff) * 65536 + (Math.floor(y / 32) & 0xffff); }
  private rehash() {
    this.hash.clear();
    for (const s of this.soldiers) {
      if (!s.alive || s.fled || s.z > 60) continue;
      const k = this.key(s.x, s.y);
      let l = this.hash.get(k);
      if (!l) this.hash.set(k, l = []);
      l.push(s);
    }
  }
  near(x: number, y: number, r: number, fn: (s: Soldier) => void) {
    const x0 = Math.floor((x - r) / 32), x1 = Math.floor((x + r) / 32), y0 = Math.floor((y - r) / 32), y1 = Math.floor((y + r) / 32);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const l = this.hash.get((i & 0xffff) * 65536 + (j & 0xffff));
      if (l) for (const s of l) fn(s);
    }
  }
  centre(u: Unit): [number, number] {
    let x = 0, y = 0, n = 0;
    for (const s of u.men) if (s.alive && !s.fled && s.slot >= 0) { x += s.x; y += s.y; n++; }
    return n ? [x / n, y / n] : [u.cx, u.cy];
  }
  private enemies(u: Unit) { return this.units.filter(v => v.side !== u.side && v.deployed && !v.gone && !v.shattered && this.count(v) > 0 && (this.style !== 'combined' || v.seen[u.side])); }
  private dist(a: Unit, b: Unit) { const [ax, ay] = this.centre(a), [bx, by] = this.centre(b); return Math.hypot(ax - bx, ay - by); }
  private rangeOf(u: Unit) { return (u.def.range ?? 0) * (u.def.thrown ? 0 : 1); }

  private updateUnit(u: Unit, dt: number) {
    if (u.gone || !u.deployed) return;
    const n = this.count(u);
    if (n === 0) { u.shattered = true; return; }
    u.sup = Math.max(0, u.sup - dt * (u.dug ? 9 : 6));
    u.chargeT = Math.max(0, u.chargeT - dt);
    u.lossT = Math.max(0, u.lossT - dt * 0.08);
    // morale
    if (!u.rout) {
      let dm = 0;
      if (!u.engaged && u.sup < 10) dm += 1.6;
      dm -= u.sup * 0.035;
      dm -= u.flank * 3.2;
      u.morale = Math.min(u.mor0, u.morale + dm * dt);
      if (n < u.start * 0.15 && !isMech(u)) u.morale = Math.min(u.morale, 5);
      if (u.morale < 12 && !isAir(u)) this.breakUnit(u);
    } else {
      // rally away from the enemy
      const [cx, cy] = this.centre(u);
      const close = this.enemies(u).some(v => { const [vx, vy] = this.centre(v); return Math.hypot(vx - cx, vy - cy) < 260; });
      if (!close) { u.rallyT += dt; u.morale += dt * 3; } else u.rallyT = 0;
      if (u.rallyT > 8 && u.morale > 35 && u.routs < 3 && n > u.start * 0.25) { u.rout = false; u.rallyT = 0; u.order = { k: 'idle' }; u.cx = cx; u.cy = cy; this.say(u, 'reagrupou'); }
    }
    u.flank = 0;
    if (u.rout) {
      // run to the own edge of the field
      const fa = this.sideFa(u.side) + Math.PI;
      const [cx, cy] = this.centre(u);
      u.cx = cx + Math.cos(fa) * 300; u.cy = cy + Math.sin(fa) * 300;
      return;
    }
    // air strike: fly in, drop, fly away
    if (u.strike) { this.updateStrike(u, dt); return; }
    // dug in?
    if (this.trenches.length && !isMech(u) && !isMounted(u)) {
      const [cx, cy] = this.centre(u);
      u.dug = this.trenchDist(cx, cy) < 26;
    }
    const o = u.order;
    const [cx, cy] = this.centre(u);
    const F = FORM[u.form];
    const speed = (o.k === 'move' ? o.run : o.k === 'attack' ? o.run : u.run) ? u.def.run : u.def.speed;
    const supSlow = u.sup > 60 ? 0.25 : u.sup > 30 ? 0.6 : 1;
    const v = speed * F.speed * supSlow;
    const wait = u.lag > (isMech(u) ? 60 : 22);
    if (o.k === 'move') {
      const dx = o.x - u.cx, dy = o.y - u.cy, d = Math.hypot(dx, dy);
      if (d > 4 && !u.engaged) {
        const st = wait ? 0 : Math.min(d, v * dt);
        u.cx += (dx / d) * st; u.cy += (dy / d) * st;
        // face the march, then turn to the ordered facing at the end
        u.fa = d > 40 && u.form !== 'square' ? Math.atan2(dy, dx) : o.fa;
      } else if (!u.engaged) { u.fa = o.fa; u.order = { k: 'idle' }; }
    } else if (o.k === 'attack') {
      const t = o.t;
      if (t.gone || t.shattered || this.count(t) === 0 || (t.rout && this.dist(u, t) > 400)) { u.order = { k: 'idle' }; u.target = null; }
      else {
        const [tx, ty] = this.centre(t);
        const d = Math.hypot(tx - cx, ty - cy);
        const range = this.rangeOf(u);
        if (range && u.ammo > 0 && d < range * 0.92 && !(u.def.cls === 'cav' || u.def.cls === 'cavgun')) {
          u.fa = Math.atan2(ty - cy, tx - cx);
        } else if (!u.engaged || d > 60) {
          // the anchor (front centre) marches on; the soldiers keep up
          const ax = tx - u.cx, ay = ty - u.cy, ad = Math.hypot(ax, ay) || 1;
          const st = wait ? 0 : Math.min(Math.max(0, ad - 14), v * dt * (d < 140 ? 1.15 : 1));
          u.cx += (ax / ad) * st; u.cy += (ay / ad) * st;
          u.fa = Math.atan2(ay, ax);
          if (d < 120 && (o.run || u.def.cls === 'cav') && u.chargeT <= 0 && !u.engaged) u.chargeT = 2.2;
        }
      }
    } else if (o.k === 'fire') {
      u.fa = Math.atan2(o.y - cy, o.x - cx);
    } else {
      // guard: defend against what comes close
      if (!u.guard && !this.rangeOf(u)) {
        const foe = this.enemies(u).find(v => this.dist(u, v) < 110);
        if (foe && !isMech(u)) u.target = foe;
      }
    }
    // missiles: pick a target in range
    if (this.rangeOf(u) && u.ammo > 0) {
      if (o.k !== 'attack' && u.fireAtWill && !u.engaged) {
        if (!u.target || u.target.gone || u.target.shattered || this.count(u.target) === 0 || this.dist(u, u.target) > this.rangeOf(u)) u.target = this.pickTarget(u);
      }
      this.fire(u, dt);
    } else if (u.def.thrown && u.ammo > 0 && u.target && this.dist(u, u.target) < 130) this.fire(u, dt);
    u.engaged = false;
  }
  private pickTarget(u: Unit): Unit | null {
    const range = this.rangeOf(u);
    let best: Unit | null = null, bs = -Infinity;
    const [cx, cy] = this.centre(u);
    for (const v of this.enemies(u)) {
      if (isAir(v) && !(u.def.cls === 'aa' || u.def.cls === 'mg' || u.def.cls === 'gun' || u.def.cls === 'skirm')) continue;
      if (v.def.cls === 'air' && u.def.cls !== 'aa') continue;
      const [vx, vy] = this.centre(v);
      const d = Math.hypot(vx - cx, vy - cy);
      if (d > range) continue;
      // anti-tank weapons look for armour, guns for soft targets
      const armour = isMech(v) ? 1 : 0;
      let sc = -d / range;
      if (u.def.cls === 'at' || (u.def.cls === 'tank' && (u.def.ap ?? 0) >= 1)) sc += armour * 1.5;
      else if (u.def.cls === 'aa') sc += isAir(v) ? 3 : -1;
      else sc -= armour * 0.8;
      if (v.rout) sc -= 0.6;
      if (sc > bs) { bs = sc; best = v; }
    }
    return best;
  }
  private breakUnit(u: Unit) {
    if (u.rout) return;
    u.rout = true; u.routs++; u.rallyT = 0; u.order = { k: 'idle' }; u.target = null;
    if (u.routs >= 3) u.shattered = true;
    this.say(u, u.shattered ? 'debandou' : 'está fugindo');
    // friends nearby lose heart
    const [cx, cy] = this.centre(u);
    for (const v of this.units) if (v !== u && v.side === u.side && !v.rout) { const [vx, vy] = this.centre(v); if (Math.hypot(vx - cx, vy - cy) < 260) v.morale -= 8; }
  }
  private say(u: Unit, what: string) { if (this.setup.sides[u.side].player || this.messages.length < 3) this.messages.push(`${u.label} ${what}`); }

  // --- missiles -------------------------------------------------------------------------------------
  private fire(u: Unit, dt: number) {
    const o = u.order;
    const t = o.k === 'fire' ? null : u.target;
    if (!t && o.k !== 'fire') return;
    if (u.rout) return;
    const d = u.def;
    const [cx, cy] = this.centre(u);
    const tx0 = o.k === 'fire' ? o.x : this.centre(t!)[0], ty0 = o.k === 'fire' ? o.y : this.centre(t!)[1];
    const dist = Math.hypot(tx0 - cx, ty0 - cy);
    const range = d.thrown ? 130 : d.range!;
    if (dist > range) return;
    // volleys by rank (line infantry in line)
    if (this.style === 'line' && d.cls === 'gun' && u.form === 'line') {
      u.volleyT -= dt;
      if (u.volleyT > 0) return;
      u.volleyT = d.reload! / 2;
      const files = Math.max(1, u.files);
      const shooters = this.alive(u).filter((s, k) => Math.floor(k / files) === u.volleyRank);
      u.volleyRank = (u.volleyRank + 1) % 2;
      for (const s of shooters) this.shoot(u, s, t, tx0, ty0, dist);
      u.ammo -= 0.5;
      return;
    }
    for (const s of u.men) {
      if (!s.alive || s.fled || s.foe) continue;
      if (u.def.el === 'piece' ? !s.isPiece : s.piece) continue;
      if (u.def.el === 'piece' && !u.men.some(c => c.piece === s && c.alive)) continue; // no crew left
      s.cd -= dt * (u.sup > 50 ? 0.5 : 1);
      if (s.cd > 0) continue;
      s.cd = (d.thrown ? 6 : d.reload!) * (0.8 + this.rnd() * 0.4);
      this.shoot(u, s, t, tx0, ty0, dist);
      if (d.thrown) { u.ammo -= 1 / Math.max(1, this.count(u)); }
      else if (d.cls === 'missile') u.ammo -= 1 / Math.max(1, this.count(u));
    }
  }
  private shoot(u: Unit, s: Soldier, t: Unit | null, tx0: number, ty0: number, dist: number) {
    const d = u.def;
    // aim at a soldier of the target (or the ground point)
    let x1 = tx0, y1 = ty0;
    let tgt: Soldier | null = null;
    if (t) {
      const men = this.alive(t);
      tgt = men[Math.floor(this.rnd() * men.length)] ?? null;
      if (tgt) { x1 = tgt.x; y1 = tgt.y; }
    }
    const spread = d.indirect ? 40 + dist * 0.05 : d.blast ? 18 : 6;
    x1 += (this.rnd() - 0.5) * spread; y1 += (this.rnd() - 0.5) * spread;
    const kind: Projectile['k'] = d.thrown && !d.range ? 'javelin' : d.thrown && this.style !== 'warband' && d.cls !== 'missile' ? 'grenade' :
      d.cls === 'missile' ? (u.era === 0 ? (d.dmg! >= 9 ? 'javelin' : 'arrow') : d.ap && d.ap > 0.5 ? 'bolt' : 'arrow') :
      d.cls === 'mg' || d.cls === 'aa' || (d.cls === 'ifv') || (d.cls === 'recon') ? 'tracer' :
      d.cls === 'art' ? (u.era <= 1 ? 'stone' : u.era === 2 && !d.indirect ? 'roundshot' : u.era >= 5 && d.indirect ? 'rocket' : 'shell') :
      d.cls === 'at' ? (u.era >= 5 ? 'rocket' : 'shell') :
      d.cls === 'tank' || d.cls === 'heli' ? (u.era >= 7 ? 'plasma' : d.cls === 'heli' ? 'rocket' : 'shell') :
      u.era >= 7 ? 'plasma' : 'bullet';
    if (u.def.thrown && t && this.dist(u, t) < 130 && u.ammo > 0) { /* thrown on the way in */ }
    const speed = kind === 'arrow' || kind === 'bolt' ? 420 : kind === 'javelin' || kind === 'grenade' ? 260 : kind === 'stone' ? 260 : kind === 'shell' && d.indirect ? 380 : kind === 'rocket' ? 520 : kind === 'roundshot' ? 520 : 1600;
    const dur = Math.max(0.05, dist / speed);
    const arc = kind === 'arrow' ? dist * 0.25 : kind === 'javelin' || kind === 'grenade' ? dist * 0.3 : kind === 'stone' || (kind === 'shell' && d.indirect) ? dist * 0.4 : kind === 'bolt' ? dist * 0.08 : 0;
    const sx = s.x, sy = s.y - (s.z || 0) - (isMech(u) ? 10 : 12);
    this.shots.push({ k: kind, x0: sx, y0: sy, x1, y1, t: 0, dur, arc, side: u.side, from: u, dmg: d.dmg ?? 8, ap: d.ap ?? 0, blast: d.blast ?? 0, sup: d.sup ?? 0, acc: d.acc ?? 0.3, target: t });
    s.useT = Math.max(s.useT, 0.6);
    s.dir = dirOf(x1 - s.x, y1 - s.y);
    // muzzle effects
    if (kind === 'bullet' || kind === 'tracer' || kind === 'shell' || kind === 'roundshot' || kind === 'rocket' || kind === 'plasma') {
      this.fx.push({ k: 'flash', x: sx + Math.cos(Math.atan2(y1 - sy, x1 - sx)) * 10, y: sy + Math.sin(Math.atan2(y1 - sy, x1 - sx)) * 6, t: 0, big: kind !== 'bullet' && kind !== 'tracer' });
      if (u.era <= 2 || kind === 'shell' || kind === 'roundshot') this.fx.push({ k: 'smoke', x: sx + (x1 - sx) * 0.02, y: sy, t: 0, r: u.era <= 2 ? 10 : 7, dark: false });
    }
  }
  private updateShots(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.shots) {
      p.t += dt;
      if (p.k === 'tracer' && this.rnd() < 0.3) this.fx.push({ k: 'tracer', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, t: 0 });
      if (p.t < p.dur) { keep.push(p); continue; }
      this.impact(p);
    }
    this.shots = keep;
  }
  private impact(p: Projectile) {
    if (p.blast > 0) {
      this.explode(p.x1, p.y1, p.blast, p.dmg, p.ap, p.sup, p.side, p.from);
      if (p.k === 'roundshot') {
        // the ball bounces on through the ranks
        const dx = p.x1 - p.x0, dy = p.y1 - p.y0, L = Math.hypot(dx, dy) || 1;
        for (let k = 1; k <= 8; k++) { const x = p.x1 + (dx / L) * k * 16, y = p.y1 + (dy / L) * k * 16; this.hitNear(x, y, 6, p, 0.8, true); }
        this.fx.push({ k: 'dust', x: p.x1, y: p.y1, t: 0 });
      }
      return;
    }
    this.hitNear(p.x1, p.y1, p.k === 'tracer' || p.k === 'bullet' ? 7 : 9, p, 1, false);
  }
  private hitNear(x: number, y: number, r: number, p: Projectile, mult: number, any: boolean) {
    let best: Soldier | null = null, bd = r;
    this.near(x, y, r, s => {
      if (!s.alive || (s.u.side === p.side && !any)) return;
      if (s.z > 0 && !(p.from.def.cls === 'aa' || p.from.def.cls === 'mg' || p.k === 'bullet' || p.k === 'tracer')) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    });
    // suppression from near misses
    if (p.sup && p.target) p.target.sup = Math.min(100, p.target.sup + p.sup * (p.target.dug ? 0.4 : 1));
    if (!best) return;
    const s = best as Soldier;
    const u = s.u, from = p.from;
    let chance = p.acc * mult;
    const dist = Math.hypot(p.x1 - p.x0, p.y1 - p.y0), range = from.def.range ?? 200;
    chance *= 1 - 0.55 * Math.min(1, dist / range);
    // shields, formations, cover
    const facing = DIR_ANG[s.dir], incoming = Math.atan2(p.y0 - s.y, p.x0 - s.x);
    const front = Math.abs(angDiff(facing, incoming)) < Math.PI / 2;
    if (front && u.def.shield) chance *= 1 - u.def.shield * (u.form === 'shieldwall' ? 1.6 : 1);
    if (u.form === 'loose' || u.form === 'skirmish' || u.form === 'assault') chance *= 0.65;
    if (u.dug) chance *= 0.3;
    if (this.setup.siege && u.side === 1 && this.setup.siege.walls && Math.hypot(s.x - this.setup.siege.x, s.y - this.setup.siege.y) < 320) chance *= 0.55;
    if (u.sup > 50 && !isMech(u)) chance *= 0.6;                         // pinned soldiers hug the ground
    if (this.onWire(s.x, s.y)) chance *= 1.4;
    const hiLv = this.setup.terrain.level(p.x0, p.y0) - this.setup.terrain.level(s.x, s.y);
    chance *= 1 + Math.max(-0.3, Math.min(0.4, hiLv * 0.12));
    if (this.rnd() > chance) return;
    this.damage(s, p.dmg, p.ap, from, p.k);
  }
  private explode(x: number, y: number, r: number, dmg: number, ap: number, sup: number, side: 0 | 1, from: Unit) {
    this.fx.push({ k: 'boom', x, y, t: 0, r });
    this.fx.push({ k: 'smoke', x, y, t: 0, r: r * 0.6, dark: true });
    if (r > 20 && this.craters.length < 400) this.craters.push({ k: 'crater', x, y, r: r * 0.45 });
    const hitUnits = new Set<Unit>();
    this.near(x, y, r, s => {
      if (!s.alive) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > r) return;
      let k = 1 - d / r;
      if (s.u.dug) k *= 0.22;
      if (s.z > 0) return;
      hitUnits.add(s.u);
      if (this.rnd() < 0.35 + k * 0.65) this.damage(s, dmg * (0.4 + k * 0.8), ap, from, 'blast');
    });
    for (const u of hitUnits) { u.sup = Math.min(100, u.sup + sup * (u.dug ? 0.5 : 1)); u.morale -= sup * 0.08; }
    void side;
  }
  /** a hit: armour, penetration, death */
  damage(s: Soldier, dmg: number, ap: number, from: Unit, how: string) {
    if (!s.alive) return;
    const u = s.u;
    let d = dmg;
    if (isMech(u) || s.isPiece) {
      const armour = u.def.armor;
      d *= Math.max(0.03, Math.min(1, (ap * 100 + 30 - armour) / 40));
    } else d *= 1 - (u.def.armor / 160) * (1 - ap);
    s.hp -= d;
    if (s.hp > 0) return;
    this.kill(s, from, how);
  }
  kill(s: Soldier, from: Unit | null, how: string) {
    s.alive = false; s.hp = 0; s.foe = null;
    s.dieT = this.t;
    const u = s.u;
    // the death fits the weapon: blasts tear bodies apart, blades sever, the rest fall
    const r = this.rnd();
    // (five kinds per battle, so their sheets are ready in time: see BattleLayer.prefetch)
    const deaths: Death[] = how === 'blast' ? (r < 0.5 ? ['burst_top', 'cut_h'] : ['fall_back', 'fall_fwd'])
      : how === 'melee' ? (from && ['shock', 'melee', 'cav'].includes(from.def.cls) && r < 0.4 ? ['sever_head', 'cut_h'] : ['fall_fwd', 'fall_back'])
      : ['fall_back', 'fall_fwd'];
    s.death = isMech(u) || s.isPiece ? null : deaths[Math.floor(this.rnd() * deaths.length)];
    if (isMech(u) || s.isPiece) { this.fx.push({ k: 'boom', x: s.x, y: s.y, t: 0, r: 30 }); this.fx.push({ k: 'smoke', x: s.x, y: s.y, t: 0, r: 24, dark: true }); }
    if (s.isPiece) for (const c of u.men) if (c.piece === s && c.alive && this.rnd() < 0.6) this.kill(c, from, 'blast');
    // morale: every loss hurts, the more so the faster they come
    const size = u.men.length;   // crews count: losing one gunner is not losing a quarter of the unit
    u.lossT += 1 / Math.max(1, size);
    u.morale -= (100 / Math.max(4, size)) * (0.45 + u.lossT * 1.6) * (s.isPiece ? 2 : 1);
    if (from && from.side !== u.side) from.morale = Math.min(from.mor0 + 10, from.morale + 0.3);
  }

  // --- melee and movement of soldiers ------------------------------------------------------------------
  private updateSoldier(s: Soldier, dt: number) {
    s.ph += dt;
    s.useT = Math.max(0, s.useT - dt);
    if (!s.alive || s.fled) return;
    const u = s.u;
    if (!u.deployed) return;
    if (u.strike) return;
    // crews stand by their gun
    if (s.piece) {
      if (!s.piece.alive) { s.piece = null; s.slot = -2; }
      else {
        const k = u.men.indexOf(s) - u.men.indexOf(s.piece), ang = u.fa + Math.PI + (k - 1.5) * 0.7;
        this.walkTo(s, s.piece.x + Math.cos(ang) * 14, s.piece.y + Math.sin(ang) * 10, u.def.speed * 2, dt);
        s.anim = s.piece.useT > 0 ? 'use' : s.moving ? 'walk' : 'idle';
        s.dir = s.piece.dir;
        return;
      }
    }
    if (u.rout) {
      // run for it; out of the field = escaped
      const fa = this.sideFa(u.side) + Math.PI;
      const tx = s.x + Math.cos(fa) * 200 + (s.i % 7 - 3) * 10, ty = s.y + Math.sin(fa) * 200;
      this.walkTo(s, tx, ty, u.def.run * 1.05, dt);
      s.anim = 'run';
      if (!this.inField(s.x, s.y, 40)) s.fled = true;
      if (u.men.every(q => !q.alive || q.fled)) u.gone = true;
      return;
    }
    // melee: lock onto the nearest enemy close by
    const melee = !isMech(u) && u.def.el !== 'piece' && !isAir(u) && (u.def.melee > 0);
    if (melee) {
      if (s.foe && (!s.foe.alive || s.foe.fled || Math.hypot(s.foe.x - s.x, s.foe.y - s.y) > 34)) s.foe = null;
      if (!s.foe) {
        let best: Soldier | null = null, bd = u.order.k === 'attack' || u.target ? 30 : 20;
        this.near(s.x, s.y, bd, o => {
          if (!o.alive || o.fled || o.u.side === u.side || o.z > 0) return;
          if (isMech(o.u) && !u.def.thrown) return;
          const d = Math.hypot(o.x - s.x, o.y - s.y);
          if (d < bd) { bd = d; best = o; }
        });
        s.foe = best;
      }
    }
    if (s.foe) {
      const f = s.foe;
      u.engaged = true;
      const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy);
      s.dir = dirOf(dx, dy);
      const reach = isMounted(u) || isMounted(f.u) ? 15 : 11;
      if (d > reach) this.walkTo(s, f.x - (dx / d) * reach * 0.9, f.y - (dy / d) * reach * 0.9, u.def.run, dt);
      else s.moving = false;
      // flank / rear: the enemy's unit loses heart
      const fFace = f.u.fa, from = Math.atan2(-dy, -dx);
      const off = Math.abs(angDiff(from, fFace));
      if (off > Math.PI * 0.6 && !f.u.rout) f.u.flank = Math.min(1, f.u.flank + (off > Math.PI * 0.8 ? 0.05 : 0.02));
      s.cd -= dt;
      if (s.cd <= 0 && d <= reach + 3) {
        s.cd = 2 + this.rnd() * 1.1;
        s.useT = 0.6;
        this.strike(s, f, off);
      }
      s.anim = s.useT > 0 ? 'use' : s.moving ? 'run' : 'idle';
      return;
    }
    // to the slot
    const men = this.alive(u);
    const k = men.indexOf(s);
    const [x, y] = this.slotPos(u, k, men.length);
    const run = u.order.k === 'move' ? u.order.run : u.order.k === 'attack' ? u.order.run : u.run;
    const sp = (run ? u.def.run : u.def.speed) * (u.sup > 60 ? 0.3 : 1) * (this.onWire(s.x, s.y) ? 0.3 : 1);
    this.walkTo(s, x, y, sp * 1.25, dt);
    u.lagSum! += Math.hypot(x - s.x, y - s.y); u.lagN!++;
    if (s.moving) s.dir = dirOf(x - s.x, y - s.y);
    else s.dir = dirOf(Math.cos(u.fa), Math.sin(u.fa));
    if (s.useT > 0) s.anim = 'use';
    else s.anim = s.moving ? (run ? 'run' : 'walk') : 'idle';
    if (isMech(u) && s.useT > 0 && s.moving) s.anim = 'walk';
  }
  private strike(s: Soldier, f: Soldier, flankOff: number) {
    const a = s.u, b = f.u;
    const charge = a.chargeT > 0 ? a.def.charge : 0;
    const braced = (b.form === 'brace' || (b.form === 'square' && isMounted(a)) || (b.def.brace && b.form === 'shieldwall')) && Math.abs(flankOff) < Math.PI / 2;
    let p = 0.34 + (a.def.melee + charge * 0.5 - b.def.def * (b.form === 'shieldwall' ? 1.3 : 1)) / 130;
    if (flankOff > Math.PI * 0.6) p += 0.15;
    if (braced && isMounted(a)) { p -= 0.35; if (this.rnd() < 0.5) this.damage(s, 6 + (b.def.brace ?? 10) * 0.4, 0.4, b, 'melee'); }
    if (b.def.brace && isMounted(a) && !braced) p += 0.05;
    if (b.def.brace && isMounted(a) && this.rnd() < 0.2) this.damage(s, 5, 0.3, b, 'melee');
    p = Math.max(0.06, Math.min(0.92, p));
    if (this.rnd() > p) return;
    const dmg = 4 + a.def.melee / 6 + charge / 8;
    this.damage(f, dmg, a.def.ap ?? (a.def.cls === 'shock' ? 0.4 : 0.15), a, 'melee');
    if (charge && this.rnd() < 0.3) b.morale -= 1.5;
  }
  private walkTo(s: Soldier, x: number, y: number, speed: number, dt: number) {
    const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    if (d < 1.5) { s.moving = false; return; }
    s.moving = d > 3;
    const st = Math.min(d, speed * dt);
    let nx = s.x + (dx / d) * st, ny = s.y + (dy / d) * st;
    // keep apart from the others (light separation)
    if (!isAir(s.u)) {
      let px = 0, py = 0;
      const rr = isMech(s.u) ? 22 : isMounted(s.u) ? 9 : 5.5;
      this.near(nx, ny, rr, o => {
        if (o === s || !o.alive || o.z > 0) return;
        const ex = nx - o.x, ey = ny - o.y, e = Math.hypot(ex, ey);
        if (e > 0.01 && e < rr) { px += (ex / e) * (rr - e) * 0.5; py += (ey / e) * (rr - e) * 0.5; }
      });
      nx += px; ny += py;
      // terrain: water and cliffs stop soldiers (they slide along)
      const T = this.setup.terrain;
      if (!T.ok(nx, ny) || Math.abs(T.level(nx, ny) - T.level(s.x, s.y)) > 1) {
        if (T.ok(nx, s.y) && Math.abs(T.level(nx, s.y) - T.level(s.x, s.y)) <= 1) ny = s.y;
        else if (T.ok(s.x, ny) && Math.abs(T.level(s.x, ny) - T.level(s.x, s.y)) <= 1) nx = s.x;
        else { s.moving = false; return; }
      }
    }
    s.x = nx; s.y = ny;
  }

  // --- trenches, sectors, vision, air -----------------------------------------------------------------
  trenchDist(x: number, y: number) {
    let best = Infinity;
    for (const line of this.trenches) for (let i = 1; i < line.length; i++) best = Math.min(best, segDist(x, y, line[i - 1], line[i]));
    return best;
  }
  onWire(x: number, y: number) {
    if (!this.wire.length) return false;
    for (const line of this.wire) for (let i = 1; i < line.length; i++) if (segDist(x, y, line[i - 1], line[i]) < 16) return true;
    return false;
  }
  private updateSectors(dt: number) {
    for (const sec of this.sectors) {
      const inside = [0, 0];
      for (const u of this.units) {
        if (!u.deployed || u.rout || u.gone || isAir(u)) continue;
        const [cx, cy] = this.centre(u);
        if (Math.hypot(cx - sec.x, cy - sec.y) < sec.r) inside[u.side] += isMech(u) ? 1 : 1.5;
      }
      if (inside[0] && !inside[1]) sec.p = Math.min(1, sec.p + dt / 12);
      else if (inside[1] && !inside[0]) sec.p = Math.max(-1, sec.p - dt / 12);
      sec.owner = sec.p >= 0.99 ? 0 : sec.p <= -0.99 ? 1 : sec.owner === 0 && sec.p > 0 ? 0 : sec.owner === 1 && sec.p < 0 ? 1 : -1;
    }
    for (const k of [0, 1] as const) {
      const own = this.sectors.filter(s => s.owner === k).length;
      this.pts[k] += dt * (3 + own * 2.5);
      this.vp[k] += dt * own * 0.9;
    }
  }
  private updateVision() {
    for (const u of this.units) u.seen = [u.side === 0, u.side === 1];
    for (const a of this.units) {
      if (!a.deployed || a.gone || a.rout) continue;
      const [ax, ay] = this.centre(a);
      const sight = a.def.sight;
      for (const b of this.units) {
        if (b.side === a.side || b.seen[a.side] || !b.deployed) continue;
        const [bx, by] = this.centre(b);
        const d = Math.hypot(bx - ax, by - ay);
        // firing units give themselves away; dug-in and loose infantry are hard to spot
        const stealth = isMech(b) ? 1 : b.dug ? 0.55 : b.def.cls === 'skirm' ? 0.6 : 0.8;
        const fired = b.men.some(s => s.useT > 0) ? 1.6 : 1;
        if (d < sight * stealth * fired || isAir(b)) b.seen[a.side] = true;
      }
    }
  }
  private updateStrike(u: Unit, dt: number) {
    const st = u.strike!;
    st.t += dt;
    const speed = u.def.speed;
    const dx = st.x - st.fromX, dy = st.y - st.fromY, L = Math.hypot(dx, dy) || 1;
    const pos = st.t * speed;
    const x = st.fromX + (dx / L) * pos, y = st.fromY + (dy / L) * pos;
    for (const s of this.alive(u)) { s.x = x; s.y = y; s.z = 120; s.dir = dirOf(dx, dy); s.anim = 'walk'; }
    // anti-air along the way
    for (const v of this.units) {
      if (v.side === u.side || v.def.cls !== 'aa' || !v.deployed || v.rout || v.gone) continue;
      const [vx, vy] = this.centre(v);
      if (Math.hypot(vx - x, vy - y) < (v.def.range ?? 600) && this.rnd() < dt * 0.6) {
        this.fx.push({ k: 'tracer', x0: vx, y0: vy - 10, x1: x, y1: y - 120, t: 0 });
        for (const s of this.alive(u)) this.damage(s, v.def.dmg ?? 30, 1, v, 'blast');
      }
    }
    if (!st.done && pos >= L) {
      st.done = true;
      for (let i = 0; i < 6; i++) {
        const bx = st.x + (this.rnd() - 0.5) * 90 + (dx / L) * (i - 2.5) * 24, by = st.y + (this.rnd() - 0.5) * 50 + (dy / L) * (i - 2.5) * 24;
        this.shots.push({ k: 'bomb', x0: x, y0: y - 120, x1: bx, y1: by, t: 0, dur: 0.6 + i * 0.08, arc: 0, side: u.side, from: u, dmg: u.def.dmg ?? 100, ap: 1, blast: u.def.blast ?? 50, sup: u.def.sup ?? 30, acc: 1, target: null });
      }
    }
    if (pos > L + this.setup.hl * 1.6) {
      // back to base: the regiment survives (minus losses)
      u.strike = undefined; u.deployed = false; u.order = { k: 'idle' };
      for (const s of u.men) { s.z = 0; }
    }
  }

  // --- the end ---------------------------------------------------------------------------------------
  private checkEnd() {
    const fighting = (k: 0 | 1) => this.units.some(u => u.side === k && !u.gone && !u.shattered && !u.rout && this.count(u) > 0 && (u.deployed || (this.style === 'combined' && this.pts[k] >= u.def.pts)));
    const a = fighting(0), b = fighting(1);
    if (!a && !b) return this.finish(1, 'Ambos os lados debandaram');
    if (!a) return this.finish(1, 'O atacante foi derrotado');
    if (!b) return this.finish(0, 'O defensor foi derrotado');
    if (this.style === 'combined') {
      if (this.vp[0] >= 600) return this.finish(0, 'Setores conquistados');
      if (this.vp[1] >= 600) return this.finish(1, 'Setores conquistados');
    }
    if (this.setup.siege) {
      const S = this.setup.siege;
      const inside = (k: 0 | 1) => this.units.some(u => u.side === k && !u.rout && !u.gone && u.deployed && this.alive(u).some(s => Math.hypot(s.x - S.x, s.y - S.y) < 160));
      if (inside(0) && !inside(1)) this.hold += 1; else this.hold = Math.max(0, this.hold - 2);
      if (this.hold >= 60) return this.finish(0, 'A praça central foi tomada');
    }
    if (this.t >= this.limit) {
      if (this.style === 'combined' && this.vp[0] !== this.vp[1]) return this.finish(this.vp[0] > this.vp[1] ? 0 : 1, 'Tempo esgotado: pontos de vitória');
      return this.finish(1, 'Tempo esgotado: o defensor resistiu');
    }
  }
  private finish(w: 0 | 1, why: string) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.winner = w; this.endReason = why;
  }
  /** survivors per campaign regiment (alive + fled) */
  survivors(): { army: number; reg: number; men: number; side: 0 | 1 }[] {
    return this.units.map(u => ({ army: u.army, reg: u.reg, side: u.side, men: u.men.filter(s => (s.alive || s.fled) && (u.def.el === 'piece' ? s.isPiece : true)).length }));
  }
  casualties(k: 0 | 1) {
    let start = 0, lost = 0;
    for (const u of this.units) if (u.side === k) for (const s of u.men) { if (s.piece) continue; start++; if (!s.alive) lost++; }
    return { start, lost };
  }

  // -------------------------------------------------------------------------------------------------
  // Battle AI (one side)
  // -------------------------------------------------------------------------------------------------
  private ai(k: 0 | 1, dt: number) {
    const mine = this.units.filter(u => u.side === k && u.deployed && !u.gone && !u.rout && !u.shattered);
    const foes = this.units.filter(u => u.side !== k && u.deployed && !u.gone && !u.shattered && this.count(u) > 0 && (this.style !== 'combined' || u.seen[k]));
    // combined arms: buy reinforcements
    if (this.style === 'combined') {
      const reserve = this.units.filter(u => u.side === k && !u.deployed && !u.strike && u.def.cls !== 'air' && this.count(u) > 0).sort((a, b) => a.def.pts - b.def.pts);
      if (reserve[0] && this.pts[k] >= reserve[0].def.pts && this.rnd() < dt * 0.3) this.callIn(reserve[0]);
      const air = this.units.find(u => u.side === k && u.def.cls === 'air' && !u.strike && !u.deployed && this.count(u) > 0);
      if (air && foes.length && this.pts[k] >= air.def.pts && this.rnd() < dt * 0.05) { const t = foes[Math.floor(this.rnd() * foes.length)]; const [x, y] = this.centre(t); this.orderStrike(air, x, y); }
    }
    if (!foes.length) {
      // nothing in sight: combined arms push for the sectors, the others close in on the enemy's deployment
      for (const u of mine) {
        u.aiT -= dt;
        if (u.aiT > 0 || u.order.k !== 'idle' || u.def.indirect || u.def.cls === 'air') continue;
        u.aiT = 2 + this.rnd();
        const [cx, cy] = this.centre(u);
        if (this.style === 'combined') {
          const sec = this.sectors.filter(q => q.owner !== k).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
          if (sec) this.orderMove(u, sec.x + (this.rnd() - 0.5) * 120, sec.y + (this.rnd() - 0.5) * 120, this.sideFa(k), false);
        } else if (!(this.setup.siege && k === 1) && !(this.style === 'trench' && k === 1)) {
          const z = this.zones[k === 0 ? 1 : 0];
          this.orderMove(u, cx + (z.x - cx) * 0.3, cy + (z.y - cy) * 0.3, this.sideFa(k), false);
        }
      }
      return;
    }
    const siegeDef = this.setup.siege && k === 1;
    const trenchDef = this.style === 'trench' && k === 1;
    const trenchAtt = this.style === 'trench' && k === 0;
    const [ex, ey] = foes.reduce<[number, number]>((q, u) => { const c = this.centre(u); return [q[0] + c[0] / foes.length, q[1] + c[1] / foes.length]; }, [0, 0]);
    for (const u of mine) {
      u.aiT -= dt;
      if (u.aiT > 0) continue;
      u.aiT = 1 + this.rnd() * 0.8;
      if (u.def.cls === 'air') continue;
      const [cx, cy] = this.centre(u);
      const nearest = foes.reduce<{ u: Unit | null; d: number }>((q, v) => { const [vx, vy] = this.centre(v); const d = Math.hypot(vx - cx, vy - cy); return d < q.d ? { u: v, d } : q; }, { u: null, d: Infinity });
      const range = this.rangeOf(u);
      if (u.def.indirect) {
        // artillery: shell the enemy (their trench first)
        const t = foes.filter(v => !isAir(v)).sort((a, b) => this.count(b) - this.count(a))[0];
        if (t) { const [tx, ty] = this.centre(t); if (Math.hypot(tx - cx, ty - cy) < (u.def.range ?? 0)) u.order = { k: 'fire', x: tx, y: ty }; }
        continue;
      }
      if (range && !u.def.thrown) {
        // shooters: keep at range, step back from melee
        if (nearest.u && nearest.d < 70 && !isMech(u) && u.def.cls !== 'gun' && u.def.cls !== 'mg') {
          const ax = cx - (ex - cx) * 0.4, ay = cy - (ey - cy) * 0.4;
          this.orderMove(u, ax, ay, Math.atan2(ey - cy, ex - cx), true);
        } else if (nearest.u && nearest.d > range * 0.85 && !(siegeDef || trenchDef) && !(this.style === 'trench' && u.def.cls === 'mg')) {
          const t = nearest.u, [tx, ty] = this.centre(t);
          const L = nearest.d, stop = range * 0.75;
          this.orderMove(u, cx + ((tx - cx) / L) * (L - stop), cy + ((ty - cy) / L) * (L - stop), Math.atan2(ty - cy, tx - cx), false);
        } else if (u.order.k === 'move' && nearest.u && nearest.d <= range * 0.85) this.stop(u);
        // the gun line charges at the end (bayonets)
        if ((u.def.cls === 'gun') && nearest.u && nearest.u.rout === false && nearest.d < 60) this.orderAttack(u, nearest.u, true);
        continue;
      }
      if (siegeDef && nearest.d > 260) { const S = this.setup.siege!; if (Math.hypot(cx - S.x, cy - S.y) > 200) this.orderMove(u, S.x, S.y, u.fa, false); continue; }
      if (trenchDef && nearest.d > 200) continue;
      if (trenchAtt && this.t < 50 && this.units.some(v => v.side === k && v.def.indirect)) continue; // wait for the barrage
      // cavalry and armour go for the flanks and the shooters
      let t = nearest.u;
      if (u.def.cls === 'cav' || u.def.cls === 'cavgun' || u.def.cls === 'tank' || u.def.cls === 'recon' || u.def.cls === 'heli') {
        const soft = foes.filter(v => (v.def.cls === 'missile' || v.def.cls === 'art' || v.def.cls === 'skirm' || v.def.cls === 'mg' || v.engaged) && !(v.form === 'brace' || v.form === 'square'));
        const pref = u.def.cls === 'tank' || u.def.cls === 'heli' ? foes.filter(v => isMech(v)) : soft;
        if (pref.length) t = pref.reduce((q, v) => (this.dist(u, v) < this.dist(u, q) ? v : q), pref[0]);
      }
      if (this.style === 'combined' && t && nearest.d > 700) {
        // go for the nearest sector not ours
        const sec = this.sectors.filter(s => s.owner !== k).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
        if (sec) { this.orderMove(u, sec.x, sec.y, Math.atan2(ey - cy, ex - cx), false); continue; }
      }
      if (t && (u.order.k !== 'attack' || u.order.t !== t)) {
        if (trenchAtt && u.form === 'line' && formsFor(this.style, u.def).includes('assault')) this.setForm(u, 'assault');
        this.orderAttack(u, t, nearest.d < 220);
      }
    }
  }
}

function segDist(x: number, y: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = x - a[0], wy = y - a[1];
  const L = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L));
  return Math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t));
}
