// Cellular-era RTS simulation (runs in a worker, see sim.worker.ts). Fixed 20 Hz ticks over flat typed arrays so
// thousands of cells and dozens of nations stay cheap.
//
// Nations: every species is one nation (the player's too). Its colonies - each one a rooted mother cell - share one
// economy, one population cap and one army. A nation grows by dividing, by settling biofilm nodes and by founding
// new colonies: a mother cell divides into a new mother that swims to free space and roots there (far from any
// other mother, never inside a foreign biofilm) - it can take the room a destroyed colony left.
// Economy: workers carry nutrient motes to the nation's biofilm; photosynthesisers make energy on it (x2 under light);
// the mothers divide (food + energy + time; population cap: 8 per colony + 6 per node). Territory = biofilm: inside it
// cells heal, outside they burn a reserve and starve - the first lesson in supply lines.
// Combat: melee contact, toxin at range, armour; hunters engulf wounded smaller cells; dead cells leave motes.
// Colonies are the groups (like Hearts of Iron's army groups): every cell belongs to the colony whose mother bore it,
// named and coloured, selected and ordered together; when a colony falls its cells join the nearest one. Stances
// (automatic, gather, defend, hunt, explore) drive units without orders; workers never fight - they gather and flee.
// The AI nations colonise, defend their colonies together and raid weaker neighbours with an attack force.
// Evolution: every rival species carries a gene; the player steals it with DNA from its engulfed / killed cells.
// Diplomacy (player <-> nations): relation, gifts, peace, symbiosis (shared biofilm + trade) and endosymbiosis (the
// partner becomes an organelle: its gene and mitochondria for good). Endosymbiosis + 3 genes + 60 cells open the way
// to the multicellular stage.
// Wild life: bacteria (prey), diatoms, amoebas.
import { KINDS, Kind, TRAINABLE, GeneId, geneOf, DNA_FOR_GENE, SPECIES_KINDS, isStructure, TECHS, LOCKED, geneDiscount, PLACED, titanType, titanLimit, TITANS } from './look';
import { WorldDef, WORLD, BIO, BIO_N, flowAt } from './world';
import { mulberry, seedToInt } from '../terrain/noise';

export const CAP = 14000;
export const TICK = 1 / 20;
export const STRIDE = 9;           // snapshot floats per entity
export const NEUTRAL_SET = 65;     // sprite sets: 0..64 nations (species), 65.. wild variants

// tasks
const T_IDLE = 0, T_MOVE = 1, T_ATTACK = 2, T_GATHER = 3, T_RETURN = 4, T_BUILD = 5, T_AMOVE = 6, T_WANDER = 7;
// stances
export const ST_AUTO = 0, ST_GATHER = 1, ST_DEFEND = 2, ST_HUNT = 3, ST_EXPLORE = 4;
export const STANCES = ['Automático', 'Coletar', 'Defender', 'Caçar', 'Explorar'];
/** seconds before rival armies may raid the player */
export const GRACE = 60;
/** a new colony must root this far from any other mother cell */
export const COLONY_GAP = 450;
/** a biofilm node must sit this far from any other node or colony (any nation) */
export const NODE_GAP = 200;
/** colony colours (the player's colonies take them in order) */
export const COLONY_COLORS = ['#34d399', '#f87171', '#60a5fa', '#facc15', '#c084fc', '#fb923c', '#22d3ee', '#f472b6', '#e5e7eb'];

export interface Nation {
  id: number; species: number; player: boolean; alive: boolean;
  food: number; energy: number; pop: number; cap: number; counts: number[];
  mothers: number; nodes: number; builder: number;
  aggr: number; greed: number; prefs: number[]; nextThink: number;
  target: number; targetMother: number; power: number; area: number;
  kills: number; lost: number; born: number; founded: number;
  emitters: number[]; motherList: number[]; hx: number; hy: number;
  seedSite: { x: number; y: number } | null; seedAt: number;
  colIdx: number;
  genes: Set<GeneId>; mito: boolean;
  // economy bookkeeping (per second rates, storage caps)
  fIn: number; eIn: number; eOut: number; fRate: number; eInRate: number; eOutRate: number; foodCap: number; energyCap: number; photos: number;
  // evolution tree
  dnaPts: number; techs: Set<string>; research: { id: string; t: number } | null; nextTech: number;
  truce: number; energyWarned: number; grudge: number;
}
/** what the player knows of another nation */
export interface NationInfo { id: number; rel: number; pact: number; pactFor: number; dna: number; power: number; colonies: number; cells: number; alive: boolean }
/** a colony: a rooted mother cell and the cells it bore (the player's groups) */
export interface Colony { id: number; nation: number; mother: number; name: string; color: string; stance: number; idx: number; n: number; cx: number; cy: number; counts: number[] }
export interface ColonyInfo extends Colony { x: number; y: number; queue: { kind: number; p: number }[] }

export type EventKind = 'bloom' | 'toxic' | 'current' | 'heat' | 'plague';
export interface PoolEvent { id: number; kind: EventKind; name: string; x: number; y: number; r: number; until: number; vx: number; vy: number }
export interface Offer { id: number; nation: number; kind: 'peace' | 'symbiosis' | 'tribute'; amount: number; until: number }
export interface Cloud { x: number; y: number; r: number; until: number; nation: number }
/** fog of war grid: one cell every VIS px */
export const VIS = 64, VIS_N = WORLD / 64;

export type Cmd =
  | { t: 'move'; ids: number[]; x: number; y: number }
  | { t: 'attack'; ids: number[]; target: number }
  | { t: 'gather'; ids: number[]; x: number; y: number }
  | { t: 'stance'; ids: number[]; stance: number; colony?: number }
  | { t: 'train'; kind: Kind; colony?: number }
  | { t: 'cancel'; colony: number; index: number }
  | { t: 'nodeAt'; x: number; y: number; colony?: number }
  | { t: 'gift'; nation: number }
  | { t: 'propose'; nation: number; kind: 'peace' | 'symbiosis' | 'endo' | 'war' }
  | { t: 'evolve' }
  | { t: 'place'; kind: Kind; x: number; y: number; colony?: number }
  | { t: 'research'; id: string }
  | { t: 'cyst'; ids: number[] }
  | { t: 'cloud'; ids: number[]; x: number; y: number }
  | { t: 'answer'; id: number; yes: boolean }
  | { t: 'pause'; on: boolean }
  | { t: 'speed'; k: number };

export interface Stats {
  time: number; food: number; energy: number; pop: number; cap: number; alive: boolean;
  counts: number[]; nodes: number; ncol: number; area: number; kills: number; lost: number; founded: number;
  nationsAlive: number; msg: string | null; won: boolean;
  colonies: ColonyInfo[]; seeds: number;
  genes: GeneId[]; mito: boolean; canEvolve: boolean; evolved: boolean; nations: NationInfo[];
  foodCap: number; energyCap: number; foodRate: number; energyIn: number; energyOut: number;
  dna: number; techs: string[]; research: { id: string; p: number } | null;
  events: PoolEvent[]; offers: Offer[]; clouds: Cloud[];
}

const HB = 64, HN = WORLD / HB;
const MCAP = 9000, PCAP = 3000;
const clampW = (v: number) => (v < 8 ? 8 : v > WORLD - 8 ? WORLD - 8 : v);

export class Sim {
  w: WorldDef;
  time = 0; tick = 0; paused = false; speed = 1;
  // entities
  alive = new Uint8Array(CAP); gen = new Uint16Array(CAP); kind = new Uint8Array(CAP); col = new Int16Array(CAP).fill(-1);
  set = new Uint8Array(CAP); rooted = new Uint8Array(CAP); grp = new Int16Array(CAP).fill(-1); warned = new Uint8Array(CAP);
  role = new Uint8Array(CAP);      // AI armies: 0 at home, 1 in the attack force
  cyst = new Uint8Array(CAP);      // dormant (Encistamento): still, armoured, no upkeep
  inf = new Float32Array(CAP);     // seconds since a virus got in (0 = healthy)
  immune = new Float32Array(CAP);  // immune to the virus until this time
  acd = new Float32Array(CAP);     // ability cooldown (toxin cloud, titan powers)
  tt = new Uint8Array(CAP);        // titan body plan (0 rotifer, 1 tardigrade, 2 hydra, 3 nematode, 4 copepod)
  stun = new Float32Array(CAP);    // paralysed (hydra sting) until this time
  dash = new Float32Array(CAP);    // copepod leap: flying until this time (0 = not leaping)
  x = new Float32Array(CAP); y = new Float32Array(CAP); vx = new Float32Array(CAP); vy = new Float32Array(CAP); ang = new Float32Array(CAP);
  hp = new Float32Array(CAP); sat = new Float32Array(CAP); cd = new Float32Array(CAP); carry = new Float32Array(CAP);
  task = new Uint8Array(CAP); stance = new Uint8Array(CAP); manual = new Uint8Array(CAP);
  gx = new Float32Array(CAP); gy = new Float32Array(CAP);          // goal point
  ax = new Float32Array(CAP); ay = new Float32Array(CAP);          // anchor (guard point / gathering spot)
  tgt = new Int32Array(CAP).fill(-1); tgen = new Uint16Array(CAP);
  hitAt = new Float32Array(CAP); hitBy = new Int32Array(CAP).fill(-1); grow = new Float32Array(CAP);
  top = 0; free: number[] = []; count = 0;
  // spatial hash
  head = new Int32Array(HN * HN); next = new Int32Array(CAP);
  // motes
  mx = new Float32Array(MCAP); my = new Float32Array(MCAP); mamt = new Float32Array(MCAP); mv = new Uint8Array(MCAP); mfield = new Int16Array(MCAP);
  mlife = new Float32Array(MCAP); malive = new Uint8Array(MCAP); mtop = 0; mfree: number[] = [];
  mhead = new Int32Array(HN * HN); mnext = new Int32Array(MCAP);
  fieldCount: Int32Array;
  // projectiles
  px = new Float32Array(PCAP); py = new Float32Array(PCAP); pvx = new Float32Array(PCAP); pvy = new Float32Array(PCAP);
  pdmg = new Float32Array(PCAP); plife = new Float32Array(PCAP); ptgt = new Int32Array(PCAP); pown = new Int32Array(PCAP);
  palive = new Uint8Array(PCAP); ptop = 0; pfree: number[] = [];
  // biofilm
  bOwn = new Uint8Array(BIO_N * BIO_N).fill(255); bStr = new Uint8Array(BIO_N * BIO_N);
  nOwn = new Uint8Array(BIO_N * BIO_N); nStr = new Uint8Array(BIO_N * BIO_N);
  bioDirty = true;
  // obstacles (static grid): sand grains and vent chimneys
  rHead: Int32Array; rNext: Int32Array; rIdx: Int32Array;
  obst: { x: number; y: number; r: number }[] = [];
  nations: Nation[] = [];
  queues = new Map<number, { kind: Kind; t: number; tx?: number; ty?: number }[]>();   // per mother cell (placed kinds carry their spot)
  cols = new Map<number, Colony>(); nextCol = 1;
  allMothers: number[] = [];
  deaths: number[] = [];       // x, y, set, kind (for death bursts)
  fx: number[] = [];           // x, y, radius, type (titan powers: 0 sting, 1 leap impact)
  titanWarn = -99;
  msg: string | null = null; msgAt = 0; won = false;
  r: () => number;
  neutralTarget = { bac: 1300, dia: 240, ame: 10, tit: 3 };
  neutralCount = { bac: 0, dia: 0, ame: 0, tit: 0 };
  goals = { food: false, divide: false, photo: false, node: false, colony: false, gene: false, pact: false, endo: false, big: false };
  // the player's diplomacy with every nation
  rel: Float32Array; pact: Uint8Array; pactAt: Float32Array; met: Uint8Array; dna: Float32Array;
  evolved = false;
  events: PoolEvent[] = []; nextEvent = 170; evId = 1; plagueHitPlayer = false;
  offers: Offer[] = []; offerId = 1;
  clouds: Cloud[] = [];
  vis = new Uint8Array(VIS_N * VIS_N); visDirty = true;
  aiPact: Uint8Array = new Uint8Array(0);

  constructor(w: WorldDef) {
    this.w = w;
    this.r = mulberry(seedToInt(w.seed + ':sim'));
    this.fieldCount = new Int32Array(w.fields.length);
    const cells: number[] = [];
    this.obst = [...w.rocks.map(r => ({ x: r.x, y: r.y, r: r.r })), ...w.vents.map(v => ({ x: v.x, y: v.y, r: v.r * 0.8 }))];
    this.obst.forEach((rk, i) => {
      const e = rk.r + 24, x0 = Math.floor((rk.x - e) / HB), x1 = Math.floor((rk.x + e) / HB), y0 = Math.floor((rk.y - e) / HB), y1 = Math.floor((rk.y + e) / HB);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (x < 0 || y < 0 || x >= HN || y >= HN) continue; cells.push(y * HN + x, i); }
    });
    this.rHead = new Int32Array(HN * HN).fill(-1);
    this.rNext = new Int32Array(cells.length / 2).fill(-1);
    this.rIdx = new Int32Array(cells.length / 2);
    for (let i = 0, k = 0; i < cells.length; i += 2, k++) { const b = cells[i]; this.rIdx[k] = cells[i + 1]; this.rNext[k] = this.rHead[b]; this.rHead[b] = k; }
    // nations and their first colonies
    w.starts.forEach((list, i) => {
      const r = this.r;
      const N: Nation = {
        id: i, species: i, player: i === 0, alive: true,
        food: i === 0 ? 120 : 100, energy: i === 0 ? 60 : 50, pop: 0, cap: 0, counts: new Array(SPECIES_KINDS).fill(0),
        mothers: 0, nodes: 0, builder: -1,
        aggr: 0.25 + r() * 0.75, greed: 0.3 + r() * 0.7, prefs: [r(), r(), r()], nextThink: r() * 2,
        target: -1, targetMother: -1, power: 0, area: 0, kills: 0, lost: 0, born: 0, founded: 0,
        emitters: [], motherList: [], hx: list[0].x, hy: list[0].y, seedSite: null, seedAt: 0, colIdx: 0,
        genes: new Set(i === 0 ? [] : [geneOf(w.species[i]).id]), mito: false,
        fIn: 0, eIn: 0, eOut: 0, fRate: 0, eInRate: 0, eOutRate: 0, foodCap: 300, energyCap: 200, photos: 0,
        dnaPts: 0, techs: new Set(), research: null, nextTech: 60 + r() * 90, truce: 0, energyWarned: -99, grudge: 0,
      };
      this.nations.push(N);
      list.forEach((h, j) => {
        const m = this.spawn(Kind.MOTHER, i, h.x, h.y);
        this.root(m, false);
        this.grow[m] = 160;
        const start: Kind[] = j > 0 ? [Kind.WORKER, Kind.WORKER] : i === 0 ? [Kind.WORKER, Kind.WORKER, Kind.WORKER, Kind.PHOTO, Kind.SCOUT] : [Kind.WORKER, Kind.WORKER, Kind.WORKER, Kind.PHOTO];
        start.forEach((k2, q) => { const a = (q / start.length) * Math.PI * 2, u = this.spawn(k2, i, h.x + Math.cos(a) * 60, h.y + Math.sin(a) * 60); if (u >= 0) this.grp[u] = this.grp[m]; });
      });
    });
    const NN = this.nations.length;
    this.rel = new Float32Array(NN); this.pact = new Uint8Array(NN); this.pactAt = new Float32Array(NN); this.met = new Uint8Array(NN); this.dna = new Float32Array(NN);
    this.nations.forEach((N, i) => { if (i) this.rel[i] = Math.round(20 - N.aggr * 40); this.caps(N); });
    this.aiPact = new Uint8Array(NN * NN);
    for (let i = 0; i < 40; i++) this.spawnMotes(1);
    for (let i = 0; i < this.neutralTarget.bac; i++) this.spawnNeutral(Kind.BACTERIA);
    for (let i = 0; i < this.neutralTarget.dia; i++) this.spawnNeutral(Kind.DIATOM);
    for (let i = 0; i < this.neutralTarget.ame; i++) this.spawnNeutral(Kind.AMOEBA);
    this.updateBiofilm();
  }

  // ---------------------------------------------------------------------------------------------------------------------
  spawn(k: Kind, nation: number, x: number, y: number, variant = 0): number {
    const i = this.free.length ? this.free.pop()! : this.top < CAP ? this.top++ : -1;
    if (i < 0) return -1;
    const K = KINDS[k];
    this.alive[i] = 1; this.gen[i] = (this.gen[i] + 1) & 0xffff; this.kind[i] = k; this.col[i] = nation;
    this.set[i] = nation >= 0 ? this.nations[nation].species : NEUTRAL_SET + variant;
    this.x[i] = clampW(x); this.y[i] = clampW(y); this.vx[i] = 0; this.vy[i] = 0; this.ang[i] = this.r() * Math.PI * 2;
    this.hp[i] = K.hp; this.sat[i] = k === Kind.SCOUT ? 80 : k === Kind.MOTHER ? 120 : k === Kind.TITAN ? 240 : 40; this.cd[i] = 0; this.carry[i] = 0;
    this.task[i] = T_IDLE; this.stance[i] = ST_AUTO; this.manual[i] = 0; this.tgt[i] = -1; this.rooted[i] = 0; this.grp[i] = -1; this.warned[i] = 0; this.role[i] = 0; this.cyst[i] = 0; this.inf[i] = 0; this.immune[i] = 0; this.acd[i] = 0; this.stun[i] = 0; this.dash[i] = 0;
    this.tt[i] = k !== Kind.TITAN ? 0 : nation >= 0 ? titanType(this.w.species[this.nations[nation].species]) : variant - WILD_TITAN;
    this.gx[i] = x; this.gy[i] = y; this.ax[i] = x; this.ay[i] = y; this.hitAt[i] = -99; this.hitBy[i] = -1; this.grow[i] = 0;
    if (nation >= 0) {
      const N = this.nations[nation];
      N.pop += K.pop; N.counts[k]++;
      if (k === Kind.NODE) { N.nodes++; N.cap += 6; }
      if (k === Kind.MOTHER) N.motherList.push(i);
    }
    this.count++;
    return i;
  }
  /** a photosynthesiser / sentinel roots where it stopped */
  settleStruct(i: number) { this.rooted[i] = 1; this.task[i] = T_IDLE; this.manual[i] = 0; this.vx[i] = 0; this.vy[i] = 0; this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; }
  /** a mother cell settles: a colony is founded */
  root(m: number, announce = true) {
    const N = this.nations[this.col[m]];
    this.rooted[m] = 1; N.mothers++; N.cap += 8;
    this.task[m] = T_IDLE; this.manual[m] = 0; this.vx[m] = 0; this.vy[m] = 0;
    this.grow[m] = Math.max(this.grow[m], 60); this.ax[m] = this.x[m]; this.ay[m] = this.y[m];
    if (!this.queues.has(m)) this.queues.set(m, []);
    // the colony: this mother and every cell she bears
    const idx = ++N.colIdx;
    const C: Colony = {
      id: this.nextCol++, nation: N.id, mother: m, idx, stance: ST_AUTO, n: 0, cx: 0, cy: 0, counts: [],
      name: N.player ? `Colônia ${idx}` : `${this.w.species[N.species].genus} ${idx}`, color: COLONY_COLORS[(idx - 1) % COLONY_COLORS.length],
    };
    this.cols.set(C.id, C);
    this.grp[m] = C.id;
    if (announce) { N.founded++; if (N.player) this.say(`${C.name} fundada! (${N.mothers} colônias)`); }
  }
  kill(i: number, by = -1) {
    if (!this.alive[i]) return;
    const k = this.kind[i] as Kind, c = this.col[i];
    this.alive[i] = 0; this.free.push(i); this.count--;
    this.deaths.push(this.x[i], this.y[i], this.set[i], k);
    const drop = [3, 2, 5, 4, 7, 5, 26, 10, 6, 40, 1, 4, 12][k] ?? 2;
    for (let j = 0; j < drop; j++) this.addMote(this.x[i] + (this.r() - 0.5) * KINDS[k].r * 2, this.y[i] + (this.r() - 0.5) * KINDS[k].r * 2, 4 + this.r() * 3, -1);
    if (k === Kind.BACTERIA) this.neutralCount.bac--; else if (k === Kind.DIATOM) this.neutralCount.dia--; else if (k === Kind.AMOEBA) this.neutralCount.ame--;
    else if (k === Kind.TITAN && c < 0) this.neutralCount.tit--;
    if (by >= 0) this.gainDna(this.col[by], i, false);
    if (k === Kind.TITAN) {
      const who = by >= 0 ? this.col[by] : -1, what = `${c < 0 ? 'selvagem' : c === 0 ? 'seu' : 'de ' + this.w.species[c].genus} (${TITANS[this.tt[i]].name})`;
      if (who === 0) this.say(`Titã ${what} abatido! +25 DNA.`);
      else if (c === 0) this.say(`Seu titã (${TITANS[this.tt[i]].name}) morreu!`);
    }
    if (c < 0) return;
    if (by >= 0 && this.col[by] === 0 && c > 0) { this.dna[c] += 0.35; this.rel[c] = Math.max(-100, this.rel[c] - 2); this.stealCheck(c); }
    const N = this.nations[c];
    N.pop -= KINDS[k].pop; N.counts[k]--; N.lost++;
    if (k === Kind.NODE) { N.nodes--; N.cap -= 6; }
    if (N.builder === i) N.builder = -1;
    if (k === Kind.MOTHER) {
      N.motherList = N.motherList.filter(m => m !== i);
      if (this.rooted[i]) { N.mothers--; N.cap -= 8; this.dissolve(i); }
      this.queues.delete(i);
      const killer = by >= 0 ? this.col[by] : -1;
      if (killer >= 0 && this.rooted[i]) {
        this.nations[killer].kills++;
        if (killer === 0) this.say(`Colônia rival destruída! (${this.nations[0].kills})`);
      }
      if (N.counts[Kind.MOTHER] <= 0) {
        N.alive = false;
        if (N.player) this.say('Sua última célula-mãe morreu. A espécie está condenada.');
      }
    }
  }
  say(m: string) { this.msg = m; this.msgAt = this.time; }
  /** enough DNA of a species: its gene becomes the player's */
  stealCheck(n: number) {
    const P = this.nations[0], g = geneOf(this.w.species[n]);
    if (this.dna[n] < DNA_FOR_GENE || P.genes.has(g.id)) return;
    P.genes.add(g.id); this.goals.gene = true;
    this.say(`Gene roubado de ${this.w.species[n].genus}: ${g.name}! (${g.desc})`);
  }
  /** a colony lost its mother: its cells join the nearest colony of the nation */
  dissolve(m: number) {
    const id = this.grp[m], C = this.cols.get(id);
    if (!C || C.mother !== m) return;
    this.cols.delete(id);
    const N = this.nations[C.nation];
    const others = N.motherList.filter(o => o !== m && this.alive[o] && this.rooted[o]);
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.grp[i] !== id || i === m) continue;
      let best = -1, bd = 1e18;
      for (const o of others) { const d = (this.x[o] - this.x[i]) ** 2 + (this.y[o] - this.y[i]) ** 2; if (d < bd) { bd = d; best = o; } }
      this.grp[i] = best >= 0 ? this.grp[best] : -1;
    }
    if (N.player) this.say(`${C.name} caiu! As células restantes se juntam à colônia mais próxima.`);
  }

  addMote(x: number, y: number, amt: number, field: number) {
    const i = this.mfree.length ? this.mfree.pop()! : this.mtop < MCAP ? this.mtop++ : -1;
    if (i < 0) return;
    this.mx[i] = clampW(x); this.my[i] = clampW(y); this.mamt[i] = amt; this.mv[i] = Math.floor(this.r() * 4); this.mfield[i] = field;
    this.mlife[i] = field >= 0 ? 240 : 120; this.malive[i] = 1;
    if (field >= 0) this.fieldCount[field]++;
  }
  eatMote(i: number) { this.malive[i] = 0; this.mfree.push(i); if (this.mfield[i] >= 0) this.fieldCount[this.mfield[i]]--; }

  spawnMotes(dt: number) {
    const F = this.w.fields;
    for (let f = 0; f < F.length; f++) {
      const fd = F[f], capN = fd.rate * 10;
      if (this.fieldCount[f] >= capN) continue;
      let n = fd.rate * dt * 0.55;
      while (n > 0) {
        if (n < 1 && this.r() > n) break;
        n -= 1;
        const a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * fd.r;
        const x = fd.x + Math.cos(a) * d, y = fd.y + Math.sin(a) * d;
        // vent fields (the first ones) keep the scalding plume clear
        if (f < this.w.vents.length && Math.hypot(x - fd.x, y - fd.y) < this.w.vents[f].r + 34) continue;
        if (!this.inRock(x, y, 3)) this.addMote(x, y, 4 + this.r() * 4, f);
      }
    }
  }
  /** a wild titan appears somewhere far from the player's colonies */
  spawnWildTitan() {
    const P = this.nations[0], type = Math.floor(this.r() * 5);
    for (let t = 0; t < 30; t++) {
      const x = 400 + this.r() * (WORLD - 800), y = 400 + this.r() * (WORLD - 800);
      if (this.inRock(x, y, 40) || this.bioOwner(x, y) !== 255) continue;
      if (P.motherList.some(m => this.alive[m] && Math.hypot(this.x[m] - x, this.y[m] - y) < 1800)) continue;
      const i = this.spawn(Kind.TITAN, -1, x, y, WILD_TITAN + type);
      if (i < 0) return;
      this.neutralCount.tit++; this.stance[i] = ST_EXPLORE;
      this.say(`Um titã selvagem apareceu na poça: ${TITANS[type].name} gigante (${TITANS[type].power}). Veja o mapa.`);
      return;
    }
  }
  spawnNeutral(k: Kind) {
    const r = this.r, F = this.w.fields;
    let x = 0, y = 0;
    for (let t = 0; t < 12; t++) {
      if (k === Kind.BACTERIA) { const f = F[Math.floor(r() * F.length)], a = r() * 6.283, d = Math.sqrt(r()) * f.r * 1.2; x = f.x + Math.cos(a) * d; y = f.y + Math.sin(a) * d; }
      else { x = 200 + r() * (WORLD - 400); y = 200 + r() * (WORLD - 400); }
      if (k === Kind.AMOEBA && Math.hypot(x - this.w.starts[0][0].x, y - this.w.starts[0][0].y) < 1500) continue;
      if (!this.inRock(x, y, KINDS[k].r)) break;
    }
    const v = k === Kind.BACTERIA ? Math.floor(r() * 4) : k === Kind.DIATOM ? 4 + Math.floor(r() * 2) : 6;
    const i = this.spawn(k, -1, x, y, v);
    if (i < 0) return;
    if (k === Kind.BACTERIA) this.neutralCount.bac++; else if (k === Kind.DIATOM) this.neutralCount.dia++; else this.neutralCount.ame++;
    this.stance[i] = ST_EXPLORE;
  }
  inRock(x: number, y: number, pad: number) {
    const bx = Math.floor(x / HB), by = Math.floor(y / HB);
    if (bx < 0 || by < 0 || bx >= HN || by >= HN) return true;
    for (let k = this.rHead[by * HN + bx]; k >= 0; k = this.rNext[k]) { const rk = this.obst[this.rIdx[k]]; if (Math.hypot(rk.x - x, rk.y - y) < rk.r + pad) return true; }
    return false;
  }

  has(n: number, g: GeneId) { return n >= 0 && this.nations[n].genes.has(g); }
  // relations: nations are at war unless the player made peace / symbiosis with them; wild amoebas eat anyone
  hostile(a: number, b: number): boolean {
    const ca = this.col[a], cb = this.col[b];
    if (ca === cb) return ca === -1 ? wildPred(this.kind[a]) !== wildPred(this.kind[b]) : false;
    if (ca < 0 || cb < 0) return wildPred(this.kind[a]) || wildPred(this.kind[b]);
    if ((ca === 0 && this.pact[cb]) || (cb === 0 && this.pact[ca])) return false;
    if ((ca === 0 && this.nations[cb].truce > this.time) || (cb === 0 && this.nations[ca].truce > this.time)) return false;
    if (ca > 0 && cb > 0 && this.aiPact[ca * this.nations.length + cb]) return false;
    return true;
  }
  /** is this biofilm owner a home for cells of nation c (their own, or a symbiotic partner's) */
  homeFor(c: number, owner: number) {
    if (owner === 255) return false;
    if (owner === c) return true;
    return (c === 0 && this.pact[owner] === 2) || (owner === 0 && c > 0 && this.pact[c] === 2);
  }
  /** hostile and worth attacking on sight: during the grace period rivals leave the player alone unless provoked */
  aggro(a: number, b: number): boolean {
    if (!this.hostile(a, b)) return false;
    return !(this.time < GRACE && this.col[b] === 0 && this.col[a] > 0);
  }
  bioOwner(x: number, y: number) {
    const i = Math.floor(y / BIO) * BIO_N + Math.floor(x / BIO);
    return this.bStr[i] > 40 ? this.bOwn[i] : 255;
  }
  /** the current, plus the event that turns it */
  flow(x: number, y: number): [number, number] {
    const [fx, fy] = flowAt(x, y, this.time);
    const e = this.events.find(q => q.kind === 'current');
    return e ? [fx + e.vx, fy + e.vy] : [fx, fy];
  }
  eventOn(k: EventKind) { return this.events.some(e => e.kind === k); }
  inLight(x: number, y: number) { for (const l of this.w.lights) if ((l.x - x) ** 2 + (l.y - y) ** 2 < l.r * l.r) return true; return false; }

  // ---------------------------------------------------------------------------------------------------------------------
  step() {
    if (this.paused) return;
    for (let s = 0; s < this.speed; s++) this.stepOnce();
  }
  stepOnce() {
    const dt = TICK;
    this.time += dt; this.tick++;
    this.buildHash();
    if (this.tick % 10 === 0) { this.updateBiofilm(); this.spawnMotes(0.5); this.moteDecay(0.5); this.respawnNeutral(); this.tickEvents(0.5); }
    if (this.tick % 5 === 0) this.updateVision();
    if (this.tick % 20 === 0) for (const N of this.nations) {
      N.fRate = N.fIn; N.eInRate = N.eIn; N.eOutRate = N.eOut; N.fIn = 0; N.eIn = 0; N.eOut = 0;
      this.caps(N); N.food = Math.min(N.food, N.foodCap); N.energy = Math.min(N.energy, N.energyCap);
      if (N.research) { N.research.t += 1; const T = TECHS.find(q => q.id === N.research!.id)!; if (N.research.t >= T.time) { N.techs.add(T.id); N.research = null; if (N.player) this.say(`Pesquisa concluída: ${T.name}! ${T.desc}`); } }
    }
    for (const N of this.nations) if (N.alive && this.time >= N.nextThink) { N.nextThink = this.time + 1; this.nationThink(N); }
    const think = this.tick & 7;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      if ((i & 7) === think) this.unitThink(i);
      if (this.alive[i]) this.unitAct(i, dt);
    }
    this.moveAll(dt);
    this.moveProjectiles(dt);
    for (const N of this.nations) if (N.alive) this.produce(N, dt);
    this.checkGoals();
  }

  buildHash() {
    this.head.fill(-1);
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const b = Math.floor(this.y[i] / HB) * HN + Math.floor(this.x[i] / HB);
      this.next[i] = this.head[b]; this.head[b] = i;
    }
    this.mhead.fill(-1);
    for (let i = 0; i < this.mtop; i++) {
      if (!this.malive[i]) continue;
      const b = Math.floor(this.my[i] / HB) * HN + Math.floor(this.mx[i] / HB);
      this.mnext[i] = this.mhead[b]; this.mhead[b] = i;
    }
  }
  /** nearest entity around (x, y) within rad passing the filter */
  nearest(x: number, y: number, rad: number, test: (j: number) => boolean): number {
    const b0x = Math.max(0, Math.floor((x - rad) / HB)), b1x = Math.min(HN - 1, Math.floor((x + rad) / HB));
    const b0y = Math.max(0, Math.floor((y - rad) / HB)), b1y = Math.min(HN - 1, Math.floor((y + rad) / HB));
    let best = -1, bd = rad * rad;
    for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
      for (let j = this.head[by * HN + bx]; j >= 0; j = this.next[j]) {
        const d = (this.x[j] - x) ** 2 + (this.y[j] - y) ** 2;
        if (d < bd && test(j)) { bd = d; best = j; }
      }
    }
    return best;
  }
  nearestMote(x: number, y: number, rad: number): number {
    const b0x = Math.max(0, Math.floor((x - rad) / HB)), b1x = Math.min(HN - 1, Math.floor((x + rad) / HB));
    const b0y = Math.max(0, Math.floor((y - rad) / HB)), b1y = Math.min(HN - 1, Math.floor((y + rad) / HB));
    let best = -1, bd = rad * rad;
    for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++)
      for (let j = this.mhead[by * HN + bx]; j >= 0; j = this.mnext[j]) {
        const d = (this.mx[j] - x) ** 2 + (this.my[j] - y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    return best;
  }

  // --- biofilm ---------------------------------------------------------------------------------------------------------------
  updateBiofilm() {
    const N = BIO_N;
    this.nStr.fill(0); this.nOwn.fill(255);
    for (const n of this.nations) n.emitters = [];
    this.allMothers = [];
    for (let i = 0; i < this.top; i++) {
      const k = this.kind[i];
      if (!this.alive[i] || (k !== Kind.MOTHER && k !== Kind.NODE) || this.col[i] < 0) continue;
      if (k === Kind.MOTHER) this.allMothers.push(i);
      if (k === Kind.MOTHER && !this.rooted[i]) continue;
      const c = this.nations[this.col[i]];
      c.emitters.push(i);
      if (!c.alive) continue;
      const maxR = (k === Kind.MOTHER ? 300 : 240) * (c.genes.has('film') ? 1.2 : 1);
      this.grow[i] = Math.min(maxR, this.grow[i] + 6);
      const R = this.grow[i], cx = this.x[i] / BIO, cy = this.y[i] / BIO, rc = R / BIO;
      for (let y = Math.max(0, Math.floor(cy - rc)); y <= Math.min(N - 1, Math.ceil(cy + rc)); y++)
        for (let x = Math.max(0, Math.floor(cx - rc)); x <= Math.min(N - 1, Math.ceil(cx + rc)); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rc;
          if (d > 1) continue;
          const s = Math.min(255, Math.round((1 - d) * 3 * 255));
          const j = y * N + x;
          if (s > this.nStr[j]) { this.nStr[j] = s; this.nOwn[j] = c.id; }
        }
    }
    for (const c of this.nations) c.area = 0;
    for (let j = 0; j < N * N; j++) {
      if (this.nStr[j] > 0 && (this.nOwn[j] === this.bOwn[j] || this.nStr[j] >= this.bStr[j] - 10)) {
        this.bOwn[j] = this.nOwn[j];
        this.bStr[j] = Math.min(this.nStr[j], this.bStr[j] + 60);
      } else if (this.bStr[j] > 0) {
        this.bStr[j] = Math.max(0, this.bStr[j] - 10);
        if (!this.bStr[j]) this.bOwn[j] = 255;
      }
      if (this.bStr[j] > 40 && this.bOwn[j] !== 255) this.nations[this.bOwn[j]].area++;
    }
    this.bioDirty = true;
  }
  moteDecay(dt: number) {
    for (let i = 0; i < this.mtop; i++) {
      if (!this.malive[i]) continue;
      this.mlife[i] -= dt;
      if (this.mlife[i] <= 0) { this.eatMote(i); continue; }
      const [fx, fy] = this.flow(this.mx[i], this.my[i]);
      this.mx[i] = clampW(this.mx[i] + fx * dt * 0.5); this.my[i] = clampW(this.my[i] + fy * dt * 0.5);
    }
  }
  respawnNeutral() {
    const t = this.neutralTarget, n = this.neutralCount;
    for (let k = 0; k < 6 && n.bac < t.bac; k++) this.spawnNeutral(Kind.BACTERIA);
    if (n.dia < t.dia && this.r() < 0.5) this.spawnNeutral(Kind.DIATOM);
    if (n.ame < t.ame && this.r() < 0.02) this.spawnNeutral(Kind.AMOEBA);
    if (this.time > 150 && n.tit < t.tit && this.r() < (n.tit ? 0.004 : 0.02)) this.spawnWildTitan();
  }

  // --- production ------------------------------------------------------------------------------------------------------------
  rootedMothers(N: Nation) { return N.motherList.filter(m => this.alive[m] && this.rooted[m]); }
  produce(N: Nation, dt: number) {
    for (const m of N.motherList) {
      if (!this.alive[m] || !this.rooted[m]) continue;
      // each colony's own metabolism: a small trickle so a nation never locks up (the real income is workers + photos)
      this.income(N, 0.25 * dt, 0.3 * dt * (N.mito ? 1.5 : 1));
      const q = this.queues.get(m)?.[0];
      if (!q) continue;
      const K = KINDS[q.kind];
      if (N.pop + K.pop > N.cap) continue;
      q.t += dt * (N.genes.has('fast') ? 1.25 : 1) * (N.mito ? 1.15 : 1) * (N.techs.has('met4') ? 1.2 : 1);
      if (q.t < K.time) continue;
      this.queues.get(m)!.shift();
      const a = this.ang[m] + Math.PI + (this.r() - 0.5) * 1.5;
      const i = this.spawn(q.kind, N.id, this.x[m] + Math.cos(a) * 34, this.y[m] + Math.sin(a) * 34);
      if (i < 0) continue;
      N.born++;
      this.grp[i] = this.grp[m];
      if (q.kind !== Kind.MOTHER) { const C = this.cols.get(this.grp[m]); if (C && N.player) this.stance[i] = C.stance === ST_DEFEND || C.stance === ST_HUNT ? (isMil(q.kind) ? C.stance : ST_AUTO) : C.stance; }
      this.vx[i] = Math.cos(a) * 40; this.vy[i] = Math.sin(a) * 40;
      this.ax[i] = this.x[m] + Math.cos(a) * 90; this.ay[i] = this.y[m] + Math.sin(a) * 90;
      if (q.tx !== undefined && q.ty !== undefined) {
        // a placed structure (photosynthesiser, sentinel) swims to its spot and roots there
        this.task[i] = T_MOVE; this.gx[i] = q.tx; this.gy[i] = q.ty; this.manual[i] = 1;
      }
      if (q.kind === Kind.MOTHER) {
        this.warned[i] = 1;   // no complaint before the player has moved her
        if (N.player) this.say('Nova célula-mãe! Leve-a a um espaço livre para fundar uma colônia.');
        else if (N.seedSite) { this.task[i] = T_MOVE; this.gx[i] = N.seedSite.x; this.gy[i] = N.seedSite.y; this.manual[i] = 1; }
      }
    }
  }
  /** division cost (Diferenciação makes it 15% cheaper) */
  cost(N: Nation, k: Kind): [number, number] { const f = N.techs.has('com3') ? 0.85 : 1; return [Math.round(KINDS[k].food * f), Math.round(KINDS[k].energy * f)]; }
  unlocked(N: Nation, k: Kind) { const t = LOCKED[k]; return !t || N.techs.has(t); }
  canTrain(N: Nation, k: Kind) { const [f, e] = this.cost(N, k); return N.food >= f && N.energy >= e && this.unlocked(N, k) && (k !== Kind.TITAN || this.titanRoom(N) > 0); }
  /** how many more titans the nation may grow (alive + in the division queues count) */
  titanRoom(N: Nation) {
    let q = 0;
    for (const m of N.motherList) for (const e of this.queues.get(m) ?? []) if (e.kind === Kind.TITAN) q++;
    return titanLimit(N.techs) - N.counts[Kind.TITAN] - q;
  }
  train(N: Nation, m: number, k: Kind, tx?: number, ty?: number) {
    const q = this.queues.get(m);
    if (!q || q.length >= 6 || !this.canTrain(N, k)) return false;
    const [f, e] = this.cost(N, k);
    N.food -= f; N.energy -= e; q.push({ kind: k, t: 0, tx, ty });
    return true;
  }
  /** income goes through here so the HUD can show the rate and the stock respects its cap */
  income(N: Nation, food: number, energy: number) {
    N.food = Math.min(N.foodCap, N.food + food); N.energy = Math.min(N.energyCap, N.energy + energy);
    N.fIn += food; N.eIn += energy;
  }
  /** the stock caps grow with colonies, nodes and photosynthesisers (Vacúolos de reserva: +50%) */
  caps(N: Nation) {
    const k = N.techs.has('met2') ? 1.5 : 1;
    N.foodCap = Math.round((250 + 150 * N.mothers + 60 * N.nodes) * k);
    N.energyCap = Math.round((150 + 100 * N.mothers + 30 * N.nodes + 20 * N.counts[Kind.PHOTO]) * k);
  }
  /** can a photosynthesiser / sentinel go here: inside the nation's biofilm, clear of rocks and other structures */
  placeOk(nation: number, k: Kind, x: number, y: number) {
    if (this.inRock(x, y, 14) || this.bioOwner(x, y) !== nation) return false;
    return this.nearest(x, y, 70, j => { const g = structGap(k, this.kind[j]); return g > 0 && (this.x[j] - x) ** 2 + (this.y[j] - y) ** 2 < g * g; }) < 0;
  }
  motherOf(colony: number | undefined): number | undefined {
    if (colony === undefined) return undefined;
    const C = this.cols.get(colony);
    return C && C.nation === 0 && this.alive[C.mother] ? C.mother : undefined;
  }
  capital(N: Nation): number { for (const m of N.motherList) if (this.alive[m] && this.rooted[m]) return m; return N.motherList.find(m => this.alive[m]) ?? -1; }

  // --- nation brain --------------------------------------------------------------------------------------------------------------
  nationThink(N: Nation) {
    const cap = this.capital(N);
    if (cap >= 0) { N.hx = this.x[cap]; N.hy = this.y[cap]; }
    const cnt = N.counts;
    const mil = cnt[Kind.HUNTER] + cnt[Kind.ARMOR] + cnt[Kind.SPITTER];
    N.power = cnt[Kind.HUNTER] * 3 + cnt[Kind.ARMOR] * 4 + cnt[Kind.SPITTER] * 3 + cnt[Kind.TITAN] * 25 + N.mothers * 4;
    if (N.player) return;
    // research: a random open tech every now and then (never the step to multicellular)
    if (!N.research && this.time >= N.nextTech) {
      const open = TECHS.filter(t => t.id !== 'com4' && this.canResearch(N, t.id));
      if (open.length) { this.startResearch(N, open[Math.floor(this.r() * open.length)].id); N.nextTech = this.time + 40 + this.r() * 60; }
      else N.nextTech = this.time + 10;
    }
    // AI species get DNA slowly on their own (they do not micro-manage engulfing)
    N.dnaPts += 0.04 * (1 + N.mothers * 0.3);
    const colonies = this.rootedMothers(N);
    if (!colonies.length) {
      // a lone travelling mother: root wherever she can
      return;
    }
    // --- economy: every colony keeps dividing, the nation shares the stock
    const M = colonies.length;
    const wantW = Math.min(60, 3 * M + N.nodes * 2 + 1);
    // energy: photosynthesisers are placed structures; build more while the balance is thin
    const net = N.eInRate - N.eOutRate;
    const needPhoto = cnt[Kind.PHOTO] < M * 6 + N.nodes * 2 && (net < 0.8 + M * 0.4 || cnt[Kind.PHOTO] < M);
    // guard towers once they are known: one per colony, one per two nodes, more for warlike species
    const wantSent = this.unlocked(N, Kind.SENTINEL) ? Math.round((M + N.nodes / 2) * (0.6 + N.aggr * 0.8)) : 0;
    const wantMil = Math.floor(Math.min(M * 4 + N.nodes * 3, this.time / 60 * N.aggr * 2 * M + N.nodes * 2 * N.aggr));
    const seeding = N.seedSite !== null && this.time - N.seedAt < 150;
    for (const m of colonies) {
      const q = this.queues.get(m)!;
      if (q.length >= 2) continue;
      let k: Kind | -1 = -1;
      if (cnt[Kind.WORKER] < wantW && !(N.builder >= 0 && cnt[Kind.WORKER] >= 3)) k = Kind.WORKER;
      else if (needPhoto && N.energy < N.energyCap * 0.9) k = Kind.PHOTO;
      else if (cnt[Kind.SENTINEL] < wantSent && this.time > 90) k = Kind.SENTINEL;
      else if (this.time > 240 && this.titanRoom(N) > 0 && N.food >= KINDS[Kind.TITAN].food + 40 && N.energy >= KINDS[Kind.TITAN].energy + 20) k = Kind.TITAN;
      else if (mil < wantMil) {
        const p = N.prefs, s = p[0] + p[1] + p[2], u = this.r() * s;
        k = u < p[0] ? Kind.HUNTER : u < p[0] + p[1] ? Kind.SPITTER : Kind.ARMOR;
        if (!this.unlocked(N, k)) k = Kind.HUNTER;
      }
      else if (cnt[Kind.SCOUT] < 1 && this.time > 60) k = Kind.SCOUT;
      // keep a reserve for the next colony
      if (k >= 0 && seeding && N.food < KINDS[Kind.MOTHER].food + 40 && k !== Kind.WORKER) k = -1;
      if (k < 0 || N.pop + KINDS[k].pop > N.cap) continue;
      if (PLACED.includes(k as Kind)) { const s = this.aiSpot(N, m, k as Kind); if (s) this.train(N, m, k as Kind, s.x, s.y); }
      else this.train(N, m, k as Kind);
    }
    // --- expansion: biofilm nodes at the edge of a colony's biofilm
    const maxNodes = M * (2 + Math.round(N.greed * 3));
    if (N.pop >= N.cap - 2 && N.nodes < maxNodes && (N.builder < 0 || !this.alive[N.builder] || this.task[N.builder] !== T_BUILD) && N.food >= 80 && N.energy >= 30) {
      const home = colonies[Math.floor(this.r() * M)], hx = this.x[home], hy = this.y[home];
      const w = this.nearest(hx, hy, 700, j => this.col[j] === N.id && this.kind[j] === Kind.WORKER);
      if (w >= 0) for (let t = 0; t < 8; t++) {
        const a = this.r() * Math.PI * 2, d = 220 + this.r() * 120;
        const x = hx + Math.cos(a) * d, y = hy + Math.sin(a) * d;
        if (this.nodeSpotOk(N.id, x, y)) { this.order(w, T_BUILD, x, y); N.builder = w; break; }
      }
    }
    // --- colonisation: found a new colony in free space nearby
    const maxColonies = 2 + Math.round(N.greed * 5);
    if (!seeding) N.seedSite = null;
    if (!seeding && M < maxColonies && this.time > 45 && N.food >= KINDS[Kind.MOTHER].food + 60 && N.energy >= KINDS[Kind.MOTHER].energy + 20 && (N.pop >= N.cap - 4 || N.nodes >= M * 2)) {
      const site = this.pickSite(N, colonies);
      if (site) {
        let best = colonies[0], bd = 1e18;
        for (const m of colonies) { const d = (this.x[m] - site.x) ** 2 + (this.y[m] - site.y) ** 2; if (d < bd) { bd = d; best = m; } }
        if (this.train(N, best, Kind.MOTHER)) { N.seedSite = site; N.seedAt = this.time; }
      }
    }
    // travelling mothers of the AI root when they arrive (or look for another spot)
    for (const m of N.motherList) {
      if (!this.alive[m] || this.rooted[m] || this.task[m] !== T_IDLE) continue;
      if (this.rootSpotOk(N.id, this.x[m], this.y[m], m)) { this.root(m); N.seedSite = null; }
      else { const s = this.pickSite(N, colonies, this.x[m], this.y[m]); if (s) { this.task[m] = T_MOVE; this.gx[m] = s.x; this.gy[m] = s.y; this.manual[m] = 1; } }
    }
    // --- defence: the guard of the whole nation rushes to a colony under attack
    for (const m of colonies) {
      if (this.time - this.hitAt[m] > 2) continue;
      for (let i = 0; i < this.top; i++) {
        if (!this.alive[i] || this.col[i] !== N.id || this.role[i] !== 0 || !isMil(this.kind[i]) || this.task[i] === T_ATTACK) continue;
        if ((this.x[i] - this.x[m]) ** 2 + (this.y[i] - this.y[m]) ** 2 > 1600 * 1600) continue;
        this.task[i] = T_AMOVE; this.manual[i] = 2; this.gx[i] = this.ax[i] = this.x[m] + (this.r() - 0.5) * 120; this.gy[i] = this.ay[i] = this.y[m] + (this.r() - 0.5) * 120;
      }
      break;
    }
    // --- war: the attack group raids the nearest colony of a weaker neighbour
    if (N.target >= 0) {
      const T = this.nations[N.target];
      const atk = this.army(N, 1);
      if (!T.alive || atk.length < 2) { this.recall(N); return; }
      if (!this.valid(N.targetMother, this.gen[N.targetMother]) || !this.alive[N.targetMother]) {
        // next colony of the same nation, nearest to the army
        const [cx, cy] = this.centroid(atk);
        let best = -1, bd = 3000 * 3000;
        for (const m of T.motherList) { if (!this.alive[m]) continue; const d = (this.x[m] - cx) ** 2 + (this.y[m] - cy) ** 2; if (d < bd) { bd = d; best = m; } }
        if (best < 0) { this.recall(N); return; }
        N.targetMother = best;
        this.march(atk, this.x[best], this.y[best]);
      }
    } else if ((N.grudge > this.time && mil >= 3 && this.r() < 0.3) || (mil >= 5 && this.time > 60 + (1 - N.aggr) * 180 && this.r() < 0.1 * N.aggr)) {
      let best = -1, bm = -1, bd = 2600;
      for (const o of this.nations) {
        const angry = o.player && N.grudge > this.time;
        if (!o.alive || o.id === N.id || (!angry && o.power >= N.power * (0.6 + N.aggr * 0.6))) continue;
        if (o.player && (this.time < GRACE || this.pact[N.id] || N.truce > this.time)) continue;
        if (!o.player && N.grudge > this.time) continue;   // a grudge against the player comes first
        if (!o.player && this.aiPact[N.id * this.nations.length + o.id]) continue;
        for (const m of o.motherList) {
          if (!this.alive[m]) continue;
          for (const h of colonies) { const d = Math.hypot(this.x[m] - this.x[h], this.y[m] - this.y[h]) - (angry ? 1500 : 0); if (d < bd) { bd = d; best = o.id; bm = m; } }
        }
      }
      if (best >= 0) {
        N.target = best; N.targetMother = bm;
        // most of the guard marches; a garrison stays home
        const guard = this.army(N, 0).sort((a, b) => ((this.x[a] - this.x[bm]) ** 2 + (this.y[a] - this.y[bm]) ** 2) - ((this.x[b] - this.x[bm]) ** 2 + (this.y[b] - this.y[bm]) ** 2));
        const go = guard.slice(0, Math.ceil(guard.length * 0.7));
        for (const i of go) this.role[i] = 1;
        this.march(go, this.x[bm], this.y[bm]);
      }
    }
  }
  /** where an AI colony places a photosynthesiser (in the light when it can) or a sentinel (guarding structures) */
  aiSpot(N: Nation, m: number, k: Kind): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bs = -1e9;
    const mx = this.x[m], my = this.y[m];
    for (let t = 0; t < 14; t++) {
      const a = this.r() * Math.PI * 2, d = (k === Kind.SENTINEL ? 70 : 50) + this.r() * 170;
      const x = mx + Math.cos(a) * d, y = my + Math.sin(a) * d;
      if (!this.placeOk(N.id, k, x, y)) continue;
      let s = -d * 0.2 + this.r() * 20;
      if (k === Kind.PHOTO) { if (this.inLight(x, y)) s += 200; }
      else {
        // guard what matters: photosynthesisers, nodes and the mother
        let near = 0;
        this.nearest(x, y, 150, j => { if (this.col[j] === N.id && (this.kind[j] === Kind.PHOTO || this.kind[j] === Kind.NODE || this.kind[j] === Kind.MOTHER)) near++; return false; });
        s += near * 25;
      }
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best;
  }
  /** a nation's fighters at home (0) or in the attack force (1) */
  army(N: Nation, role: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.top; i++) if (this.alive[i] && this.col[i] === N.id && this.role[i] === role && isMil(this.kind[i])) out.push(i);
    return out;
  }
  centroid(ids: number[]): [number, number] {
    let x = 0, y = 0;
    for (const i of ids) { x += this.x[i]; y += this.y[i]; }
    return ids.length ? [x / ids.length, y / ids.length] : [0, 0];
  }
  march(ids: number[], x: number, y: number) {
    for (const i of ids) { this.task[i] = T_AMOVE; this.manual[i] = 2; this.tgt[i] = -1; this.gx[i] = this.ax[i] = x + (this.r() - 0.5) * 90; this.gy[i] = this.ay[i] = y + (this.r() - 0.5) * 90; }
  }
  recall(N: Nation) {
    N.target = -1; N.targetMother = -1;
    const colonies = this.rootedMothers(N);
    for (const i of this.army(N, 1)) {
      this.role[i] = 0; this.task[i] = T_IDLE; this.manual[i] = 0; this.tgt[i] = -1;
      let best = -1, bd = 1e18;
      for (const m of colonies) { const d = (this.x[m] - this.x[i]) ** 2 + (this.y[m] - this.y[i]) ** 2; if (d < bd) { bd = d; best = m; } }
      if (best >= 0) { this.ax[i] = this.x[best] + (this.r() - 0.5) * 200; this.ay[i] = this.y[best] + (this.r() - 0.5) * 200; }
    }
  }
  /** a free spot for a new colony around the nation's colonies (or around a travelling mother) */
  pickSite(N: Nation, colonies: number[], ox?: number, oy?: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bs = -1e9;
    for (let t = 0; t < 40; t++) {
      const base = colonies[Math.floor(this.r() * colonies.length)];
      const bx = ox ?? this.x[base], by = oy ?? this.y[base];
      const a = this.r() * Math.PI * 2, d = (ox !== undefined ? 150 : 520) + this.r() * 800;
      const x = bx + Math.cos(a) * d, y = by + Math.sin(a) * d;
      if (!this.rootSpotOk(N.id, x, y, -1)) continue;
      let s = -d * 0.4;
      for (const f of this.w.fields) if (Math.hypot(f.x - x, f.y - y) < f.r + 150) { s += 300; break; }
      if (this.inLight(x, y)) s += 150;
      for (const m of this.allMothers) if (this.alive[m] && this.col[m] !== N.id && Math.hypot(this.x[m] - x, this.y[m] - y) < 1000) s -= 500;
      if (this.bioOwner(x, y) === 255) s += 200;
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best;
  }
  rootSpotOk(nation: number, x: number, y: number, self: number) {
    if (x < 220 || y < 220 || x > WORLD - 220 || y > WORLD - 220 || this.inRock(x, y, 30)) return false;
    const own = this.bioOwner(x, y);
    if (own !== 255 && own !== nation) return false;          // never inside a foreign biofilm
    for (const m of this.allMothers) if (m !== self && this.alive[m] && Math.hypot(this.x[m] - x, this.y[m] - y) < COLONY_GAP) return false;
    return this.nearest(x, y, 140, j => j !== self && this.kind[j] === Kind.NODE) < 0;
  }
  nodeSpotOk(nation: number, x: number, y: number) {
    if (x < 200 || y < 200 || x > WORLD - 200 || y > WORLD - 200 || this.inRock(x, y, 18)) return false;
    // must touch the nation's own biofilm (expand from your territory, not into the void)
    let touch = false;
    for (let dy = -4; dy <= 4 && !touch; dy++) for (let dx = -4; dx <= 4; dx++) {
      const bx = Math.floor(x / BIO) + dx, by = Math.floor(y / BIO) + dy;
      if (bx < 0 || by < 0 || bx >= BIO_N || by >= BIO_N) continue;
      const j = by * BIO_N + bx;
      if (this.bOwn[j] === nation && this.bStr[j] > 40) { touch = true; break; }
    }
    if (!touch) return false;
    // biofilms keep their distance: no other node or colony (of any nation) within NODE_GAP
    return this.nearest(x, y, NODE_GAP, j => this.kind[j] === Kind.NODE || (this.kind[j] === Kind.MOTHER && !!this.rooted[j])) < 0;
  }
  order(i: number, task: number, x: number, y: number) { this.task[i] = task; this.gx[i] = x; this.gy[i] = y; this.tgt[i] = -1; }

  // --- units -------------------------------------------------------------------------------------------------------------------
  valid(j: number, g: number) { return j >= 0 && this.alive[j] && this.gen[j] === g; }
  setTarget(i: number, j: number) { this.tgt[i] = j; this.tgen[i] = this.gen[j]; }

  unitThink(i: number) {
    const k = this.kind[i] as Kind, K = KINDS[k], c = this.col[i];
    const x = this.x[i], y = this.y[i];
    if (k === Kind.NODE || k === Kind.DIATOM || this.cyst[i]) return;
    // placed structures: swim to the spot, root; sentinels shoot whatever comes in range
    if (k === Kind.PHOTO || k === Kind.SENTINEL) {
      if (!this.rooted[i]) { if (this.task[i] === T_IDLE) this.settleStruct(i); return; }
      if (k === Kind.SENTINEL && (!this.valid(this.tgt[i], this.tgen[i]) || this.task[i] !== T_ATTACK)) {
        const j = this.nearest(x, y, K.range + 12, j2 => this.aggro(i, j2) && (this.col[j2] >= 0 || wildPred(this.kind[j2])));
        if (j >= 0) { this.setTarget(i, j); this.task[i] = T_ATTACK; } else this.task[i] = T_IDLE;
      }
      return;
    }
    // wild life
    if (c < 0) {
      if (k === Kind.TITAN) {
        // a roaming boss: it goes for any cell that comes near and answers whoever hurts it
        if (!this.valid(this.tgt[i], this.tgen[i]) || this.task[i] !== T_ATTACK) {
          let j = this.nearest(x, y, 280, j2 => this.col[j2] >= 0 && !isStructure(this.kind[j2]) && this.kind[j2] !== Kind.TITAN);
          const hb = this.hitBy[i];
          if (j < 0 && hb >= 0 && this.alive[hb] && this.time - this.hitAt[i] < 4) j = hb;
          if (j >= 0) { this.setTarget(i, j); this.task[i] = T_ATTACK; }
          else if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 40) this.wander(i, 900);
        }
        return;
      }
      if (k === Kind.AMOEBA) {
        if (this.cd[i] > 1.5) { if (this.task[i] !== T_WANDER) this.wander(i, 80); return; }   // digesting
        if (!this.valid(this.tgt[i], this.tgen[i])) {
          const j = this.nearest(x, y, K.sight, j2 => this.kind[j2] !== Kind.AMOEBA && this.kind[j2] !== Kind.MOTHER && this.kind[j2] !== Kind.NODE);
          if (j >= 0) { this.setTarget(i, j); this.task[i] = T_ATTACK; }
          else if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 30) this.wander(i, 600);
        }
      } else {
        // bacteria drift around their patch and flee from cells
        const j = this.nearest(x, y, 60, j2 => this.col[j2] >= 0 || this.kind[j2] === Kind.AMOEBA);
        if (j >= 0) { const a = Math.atan2(y - this.y[j], x - this.x[j]); this.task[i] = T_MOVE; this.gx[i] = x + Math.cos(a) * 80; this.gy[i] = y + Math.sin(a) * 80; }
        else if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 10) this.wander(i, 120);
      }
      return;
    }
    const N = this.nations[c];
    // a nation without mothers falls apart: its cells roam and starve
    if (!N.alive) { if (this.task[i] === T_IDLE) this.wander(i, 200); return; }
    const t = this.task[i];
    if (t === T_ATTACK && !this.valid(this.tgt[i], this.tgen[i])) { this.task[i] = this.manual[i] === 2 ? T_AMOVE : T_IDLE; this.tgt[i] = -1; }
    if (k === Kind.MOTHER) {
      if (!this.rooted[i]) {
        // the player's travelling mother roots where she stops, if the spot is free
        if (N.player && this.task[i] === T_IDLE) {
          if (this.rootSpotOk(c, x, y, i)) this.root(i);
          else if (!this.warned[i] && this.manual[i] === 0 && this.time - this.hitAt[i] > 1) {
            this.warned[i] = 1;
            this.say('A célula-mãe precisa de espaço livre: longe de outras células-mãe e fora de biofilme estrangeiro.');
          }
        }
        return;
      }
      if (K.dmg && !this.valid(this.tgt[i], this.tgen[i])) {
        const j = this.nearest(x, y, K.r + 30, j2 => this.aggro(i, j2));
        if (j >= 0) { this.setTarget(i, j); this.task[i] = T_ATTACK; }
      }
      return;
    }
    // workers never fight: they run from anything dangerous (even on a direct order), then go back to gathering
    if (k === Kind.WORKER && this.task[i] !== T_BUILD) {
      const hit = this.time - this.hitAt[i] < 2 && this.hitBy[i] >= 0 && this.alive[this.hitBy[i]] ? this.hitBy[i] : -1;
      const th = hit >= 0 ? hit : this.nearest(x, y, 130, j2 => this.hostile(i, j2) && KINDS[this.kind[j2]].dmg > 0 && this.kind[j2] !== Kind.MOTHER && this.kind[j2] !== Kind.NODE);
      if (th >= 0) {
        // away from the threat, leaning towards home
        const [hx, hy] = this.homeOf(i);
        let fx = x - this.x[th], fy = y - this.y[th];
        const fl = Math.hypot(fx, fy) || 1, hl = Math.hypot(hx - x, hy - y) || 1;
        fx = fx / fl + ((hx - x) / hl) * 0.6; fy = fy / fl + ((hy - y) / hl) * 0.6;
        const l = Math.hypot(fx, fy) || 1;
        this.task[i] = T_MOVE; this.manual[i] = 0; this.tgt[i] = -1;
        this.gx[i] = clampW(x + (fx / l) * 180); this.gy[i] = clampW(y + (fy / l) * 180);
        return;
      }
    }
    if (this.manual[i] && (this.task[i] === T_MOVE || this.task[i] === T_ATTACK || this.task[i] === T_BUILD)) return;
    // hungry and away from the biofilm: go back and eat (units on direct orders push on and may starve)
    if (!this.manual[i] && this.task[i] !== T_RETURN && this.task[i] !== T_BUILD && this.sat[i] < (k === Kind.SCOUT ? 30 : 16) && this.bioOwner(x, y) !== c) { this.goHome(i); return; }
    const stance = this.stance[i];
    const retaliate = this.time - this.hitAt[i] < 3 && this.valid(this.hitBy[i], this.gen[this.hitBy[i]]) ? this.hitBy[i] : -1;
    if (k === Kind.WORKER && stance !== ST_EXPLORE) {
      // gathering is all a worker does (defend / hunt stances do not make it fight)
      if (this.task[i] === T_BUILD || this.task[i] === T_RETURN) return;
      if (this.task[i] === T_MOVE && Math.hypot(this.gx[i] - x, this.gy[i] - y) > 20 && this.carry[i] < 10) return;
      if (this.carry[i] >= 10) { this.goHome(i); return; }
      const sense = this.nations[c].techs.has('met1') ? 670 : 420;
      const mj = this.nearestMote(this.ax[i], this.ay[i], sense);
      const mj2 = mj >= 0 ? mj : this.nearestMote(x, y, sense);
      if (mj2 >= 0) { this.task[i] = T_GATHER; this.gx[i] = this.mx[mj2]; this.gy[i] = this.my[mj2]; this.tgt[i] = mj2; return; }
      if (this.carry[i] > 0) { this.goHome(i); return; }
      // nothing near: head for the nutrient field closest to the nearest colony
      const [hx, hy] = this.homeOf(i);
      let bf = -1, bd = 1e12;
      this.w.fields.forEach((f, fi) => { const d = (f.x - hx) ** 2 + (f.y - hy) ** 2 + (this.fieldCount[fi] < 3 ? 1e7 : 0); if (d < bd) { bd = d; bf = fi; } });
      if (bf >= 0) { const f = this.w.fields[bf]; this.ax[i] = f.x; this.ay[i] = f.y; this.task[i] = T_MOVE; this.gx[i] = f.x + (this.r() - 0.5) * f.r; this.gy[i] = f.y + (this.r() - 0.5) * f.r; }
      return;
    }
    if (k === Kind.SCOUT || stance === ST_EXPLORE) {
      if (retaliate >= 0 && K.dmg < 5) { this.goHome(i); return; }
      if (stance === ST_EXPLORE || !N.player) {
        if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 30) this.wander(i, 1800);
        return;
      }
    }
    // fighters: defend the anchor, hunt around it, or push an attack-move
    if (K.dmg > 0) {
      if (this.task[i] === T_ATTACK) return;
      const hunt = stance === ST_HUNT, amove = this.task[i] === T_AMOVE;
      const R = hunt ? K.sight * 1.4 : amove ? K.sight : Math.min(K.sight, 260);
      const ox = amove || hunt ? x : this.ax[i], oy = amove || hunt ? y : this.ay[i];
      let j = retaliate;
      if (j < 0) j = this.nearest(ox, oy, R + (amove ? 0 : 120), j2 => (this.aggro(i, j2) && (this.col[j2] >= 0 || this.kind[j2] === Kind.AMOEBA)) || (hunt && this.kind[j2] === Kind.BACTERIA));
      if (j >= 0) { this.setTarget(i, j); this.task[i] = T_ATTACK; return; }
      if (amove) return;
      if (hunt) { if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 30) { this.task[i] = T_WANDER; const a = this.r() * 6.283, d = this.r() * 600; this.gx[i] = clampW(this.ax[i] + Math.cos(a) * d); this.gy[i] = clampW(this.ay[i] + Math.sin(a) * d); } return; }
      const d = Math.hypot(this.ax[i] - x, this.ay[i] - y);
      if (d > 90 && this.task[i] !== T_MOVE) { this.task[i] = T_MOVE; this.gx[i] = this.ax[i] + (this.r() - 0.5) * 70; this.gy[i] = this.ay[i] + (this.r() - 0.5) * 70; }
      else if (d <= 90 && this.task[i] === T_IDLE && this.r() < 0.2) { this.task[i] = T_WANDER; this.gx[i] = this.ax[i] + (this.r() - 0.5) * 120; this.gy[i] = this.ay[i] + (this.r() - 0.5) * 120; }
      return;
    }
    if (this.task[i] === T_IDLE && this.r() < 0.15) this.wander(i, 50);
  }
  wander(i: number, rad: number) {
    this.task[i] = T_WANDER;
    const a = this.r() * 6.283, d = rad * (0.3 + this.r() * 0.7);
    this.gx[i] = clampW(this.x[i] + Math.cos(a) * d); this.gy[i] = clampW(this.y[i] + Math.sin(a) * d);
  }
  /** the nearest emitter (colony or node) of the unit's nation */
  homeOf(i: number): [number, number] {
    const N = this.nations[this.col[i]];
    let bx = N.hx, by = N.hy, bd = (N.hx - this.x[i]) ** 2 + (N.hy - this.y[i]) ** 2;
    for (const j of N.emitters) if (this.alive[j]) { const d = (this.x[j] - this.x[i]) ** 2 + (this.y[j] - this.y[i]) ** 2; if (d < bd) { bd = d; bx = this.x[j]; by = this.y[j]; } }
    return [bx, by];
  }
  goHome(i: number) {
    if (this.col[i] < 0) return;
    const [bx, by] = this.homeOf(i);
    this.task[i] = T_RETURN; this.gx[i] = bx; this.gy[i] = by;
  }

  unitAct(i: number, dt: number) {
    const k = this.kind[i] as Kind, K = KINDS[k], c = this.col[i];
    const x = this.x[i], y = this.y[i];
    // metabolism: heal on the own biofilm, burn reserve outside it, starve when it runs out; every cell burns energy
    if (c >= 0) {
      const N = this.nations[c];
      const home = N.alive && this.homeFor(c, this.bioOwner(x, y));
      const settled = (isStructure(k) && (this.rooted[i] || k === Kind.NODE));
      if (!this.cyst[i]) {
        const up = K.upkeep * dt * (N.techs.has('met3') ? 0.75 : 1);
        N.energy -= up; N.eOut += up;
      }
      if (home) {
        this.sat[i] = Math.min(k === Kind.SCOUT ? 80 : k === Kind.MOTHER ? 120 : k === Kind.TITAN ? 240 : 40, this.sat[i] + (k === Kind.TITAN ? 20 : 6) * dt);
        if (this.hp[i] < K.hp && this.time - this.hitAt[i] > 2) this.hp[i] = Math.min(K.hp, this.hp[i] + K.hp * (N.genes.has('regen') ? 0.04 : 0.02) * (N.techs.has('com2') ? 1.5 : 1) * dt);
      } else if (!settled && !this.cyst[i]) { this.sat[i] -= dt * (N.genes.has('reserve') ? 0.62 : 1); if (this.sat[i] <= 0) { this.sat[i] = 0; this.hp[i] -= (k === Kind.TITAN ? K.hp * 0.006 : Math.max(1.5, K.hp * 0.02)) * dt; if (this.hp[i] <= 0) { this.kill(i); return; } } }
      // out of energy: the cells run out of ATP and die, the photosynthesisers and mothers hold on
      if (N.energy <= 0) {
        N.energy = 0;
        if (k !== Kind.PHOTO && k !== Kind.MOTHER && k !== Kind.NODE && !this.cyst[i]) { this.hp[i] -= K.hp * 0.03 * (N.techs.has('com2') ? 0.5 : 1) * dt; if (this.hp[i] <= 0) { this.kill(i); return; } }
        if (N.player && this.time - N.energyWarned > 12) { N.energyWarned = this.time; this.say('Sem energia! As células estão morrendo: faça fotossintéticas ou reduza a população.'); }
      }
      if (!N.alive && settled) { this.hp[i] -= 6 * dt; if (this.hp[i] <= 0) { this.kill(i); return; } }
      if (k === Kind.PHOTO && home && this.rooted[i]) this.income(N, 0, (this.inLight(x, y) ? 2.4 : 1.2) * dt * (N.genes.has('photo') ? 1.4 : 1) * (N.mito ? 1.5 : 1));
      if (k === Kind.NODE) this.income(N, 0.15 * dt, 0);
    }
    if (k === Kind.TITAN) { this.titanAct(i, dt); if (!this.alive[i]) return; }
    // the virus eats the cell from inside
    if (this.inf[i] > 0) { this.hp[i] -= K.hp * 0.02 * dt; if (this.hp[i] <= 0) { this.kill(i); return; } }
    // vents scald what swims too close (much more during a heat wave)
    if (this.tick % 5 === 0 && !this.has(c, 'heat') && !this.tough(i)) {
      const hot = this.eventOn('heat');
      for (const v of this.w.vents) { const d = Math.hypot(v.x - x, v.y - y); if (d < (v.r + 16) * (hot ? 3.5 : 1)) { this.hp[i] -= 3 * (hot ? 2 : 1) * dt * 5; if (this.hp[i] <= 0) { this.kill(i); return; } } }
    }
    this.cd[i] -= dt;
    const t = this.task[i];
    if (t === T_GATHER) {
      const mj = this.tgt[i];
      if (mj < 0 || !this.malive[mj]) { this.task[i] = T_IDLE; this.tgt[i] = -1; return; }
      this.gx[i] = this.mx[mj]; this.gy[i] = this.my[mj];
      if ((this.mx[mj] - x) ** 2 + (this.my[mj] - y) ** 2 < (K.r + 5) ** 2) {
        const load = c >= 0 && this.nations[c].techs.has('met1') ? 12.5 : 10;
        this.carry[i] = Math.min(load + 2, this.carry[i] + this.mamt[mj]); this.eatMote(mj); this.tgt[i] = -1; this.task[i] = T_IDLE;
        this.ax[i] = x; this.ay[i] = y;
        if (this.carry[i] >= load) this.goHome(i);
      }
    } else if (t === T_RETURN) {
      if (this.bioOwner(x, y) === c) {
        const N = this.nations[c];
        if (this.carry[i] > 0) { this.income(N, this.carry[i], 0); this.carry[i] = 0; }
        // stay a little deeper inside until the reserve is refilled
        if (this.sat[i] > 30 || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 40) this.task[i] = T_IDLE;
      }
    } else if (t === T_BUILD) {
      if (Math.hypot(this.gx[i] - x, this.gy[i] - y) < 14) this.settle(i);
    } else if (t === T_ATTACK) {
      const j = this.tgt[i];
      if (!this.valid(j, this.tgen[i])) { this.task[i] = this.manual[i] === 2 ? T_AMOVE : T_IDLE; this.tgt[i] = -1; if (this.task[i] === T_AMOVE) { this.gx[i] = this.ax[i]; this.gy[i] = this.ay[i]; } return; }
      const d = Math.hypot(this.x[j] - x, this.y[j] - y) - K.r - KINDS[this.kind[j]].r;
      // chase, but give up on prey that drags too far from the anchor
      if (!this.manual[i] && c >= 0 && this.stance[i] !== ST_HUNT && this.col[j] >= 0 && Math.hypot(this.x[j] - this.ax[i], this.y[j] - this.ay[i]) > 450) { this.task[i] = T_IDLE; this.tgt[i] = -1; return; }
      if (c < 0 && k === Kind.TITAN && d > 700) { this.task[i] = T_IDLE; this.tgt[i] = -1; return; }
      if (this.stun[i] > this.time) { this.gx[i] = x; this.gy[i] = y; return; }
      if (k === Kind.SENTINEL) {
        this.gx[i] = x; this.gy[i] = y;
        if (d > K.range + 12) { this.task[i] = T_IDLE; this.tgt[i] = -1; }
        else if (this.cd[i] <= 0) { this.cd[i] = K.cd; this.strike(i, j); }
        return;
      }
      if (k === Kind.MOTHER) {
        // a mother cell only strikes what touches it, it never chases
        this.gx[i] = x; this.gy[i] = y;
        if (d > K.range + 6) { this.task[i] = T_IDLE; this.tgt[i] = -1; }
        else if (this.cd[i] <= 0) { this.cd[i] = K.cd; this.strike(i, j); }
        return;
      }
      if (k === Kind.TITAN && this.tt[i] === 3) {
        // the nematode never stops at its prey: it drives through and turns back
        const dx = this.x[j] - x, dy = this.y[j] - y, dd = Math.hypot(dx, dy) || 1;
        this.gx[i] = this.x[j] + (dx / dd) * 140; this.gy[i] = this.y[j] + (dy / dd) * 140;
        if (d <= K.range + 2 && this.cd[i] <= 0) { this.cd[i] = K.cd; this.strike(i, j); }
      } else if (d <= K.range + 2) {
        this.gx[i] = x; this.gy[i] = y;
        if (this.cd[i] <= 0) { this.cd[i] = K.cd; this.strike(i, j); }
      } else { this.gx[i] = this.x[j]; this.gy[i] = this.y[j]; }
    } else if (t === T_MOVE || t === T_WANDER || t === T_AMOVE) {
      if (Math.hypot(this.gx[i] - x, this.gy[i] - y) < K.r + 8) {
        if (t === T_AMOVE || t === T_MOVE) { this.ax[i] = x; this.ay[i] = y; }
        this.task[i] = T_IDLE; this.manual[i] = 0;
      }
    }
  }
  /** the tardigrade shrugs off heat, toxins and viruses */
  tough(i: number) { return this.kind[i] === Kind.TITAN && this.tt[i] === 1; }
  /** titan powers, one per body plan */
  titanAct(i: number, dt: number) {
    const c = this.col[i], K = KINDS[Kind.TITAN], x = this.x[i], y = this.y[i], T = this.tt[i];
    const N = c >= 0 ? this.nations[c] : null;
    if (N?.techs.has('tit3') || c < 0) this.hp[i] = Math.min(K.hp, this.hp[i] + K.hp * (c < 0 ? 0.004 : 0.01) * dt);
    const foe = (j: number) => j !== i && this.hostile(i, j) && !(this.time < GRACE && this.col[j] === 0 && c > 0);
    const boost = N?.techs.has('tit2') ? 1.3 : 1;
    // an enemy titan coming for the player's colonies
    if (c !== 0 && this.tick % 40 === 0 && this.time - this.titanWarn > 40) {
      const P = this.nations[0];
      if (P.alive && P.motherList.some(m => this.alive[m] && Math.hypot(this.x[m] - x, this.y[m] - y) < 750)) {
        this.titanWarn = this.time;
        this.say(`Um titã ${c < 0 ? 'selvagem' : 'inimigo'} (${TITANS[T].name}) se aproxima das suas colônias!`);
      }
    }
    if (this.stun[i] > this.time) return;
    if (T === 0 && this.tick % 5 === 0) {
      // rotifer: the corona's vortex drags motes and small cells into the mouth
      const a = this.ang[i], mx = x + Math.cos(a) * K.r, my = y + Math.sin(a) * K.r, R = 230, st = 5 * dt;
      const b0x = Math.max(0, Math.floor((mx - R) / HB)), b1x = Math.min(HN - 1, Math.floor((mx + R) / HB));
      const b0y = Math.max(0, Math.floor((my - R) / HB)), b1y = Math.min(HN - 1, Math.floor((my + R) / HB));
      for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) for (let m = this.mhead[by * HN + bx]; m >= 0; m = this.mnext[m]) {
        if (!this.malive[m]) continue;
        const dx = mx - this.mx[m], dy = my - this.my[m], d = Math.hypot(dx, dy);
        if (d > R) continue;
        if (d < 16) { if (N) this.income(N, this.mamt[m], 0); else this.hp[i] = Math.min(K.hp, this.hp[i] + 8); this.eatMote(m); continue; }
        const pull = Math.min(d, (70 + (R - d) * 0.5) * st);
        this.mx[m] += (dx / d) * pull; this.my[m] += (dy / d) * pull;
      }
      this.nearest(mx, my, 175, j => {
        if (!foe(j) || isStructure(this.kind[j]) || KINDS[this.kind[j]].r > 11 || this.cyst[j]) return false;
        const dx = mx - this.x[j], dy = my - this.y[j], d = Math.hypot(dx, dy) || 1;
        const pull = Math.min(d, 55 * st);
        this.x[j] += (dx / d) * pull; this.y[j] += (dy / d) * pull;
        if (d < 18 + KINDS[this.kind[j]].r) this.damage(j, 14 * boost, i);
        return false;
      });
    } else if (T === 2 && this.acd[i] <= this.time) {
      // hydra: the tentacles sting everything around and paralyse it
      const hits: number[] = [];
      this.nearest(x, y, 150, j => { if (foe(j)) hits.push(j); return false; });
      if (hits.length) {
        this.acd[i] = this.time + 2.5;
        this.fx.push(x, y, 150, 0);
        for (const j of hits) { if (!this.alive[j]) continue; if (!isStructure(this.kind[j])) this.stun[j] = this.time + 1.5; this.damage(j, 18 * boost, i); }
      }
    } else if (T === 3 && this.tick % 4 === 0) {
      // nematode: tramples through the ranks, hurting and shoving aside whatever it crosses
      const a = this.ang[i];
      this.nearest(x, y, K.r + 16, j => {
        if (!foe(j) || this.kind[j] === Kind.TITAN || (isStructure(this.kind[j]) && this.rooted[j]) || this.kind[j] === Kind.NODE || this.kind[j] === Kind.MOTHER) return false;
        const side = Math.sign((this.x[j] - x) * -Math.sin(a) + (this.y[j] - y) * Math.cos(a)) || 1;
        this.x[j] += -Math.sin(a) * side * 6; this.y[j] += Math.cos(a) * side * 6;
        this.damage(j, 8 * boost, i);
        return false;
      });
    } else if (T === 4) {
      // copepod: leaps on its target from afar; the landing hurts and throws everything near
      if (this.dash[i] > 0 && this.dash[i] <= this.time) {
        this.dash[i] = 0;
        this.fx.push(x, y, 80, 1);
        this.nearest(x, y, 80, j => {
          if (!foe(j)) return false;
          const dx = this.x[j] - x, dy = this.y[j] - y, d = Math.hypot(dx, dy) || 1;
          if (!isStructure(this.kind[j]) && this.kind[j] !== Kind.TITAN) { this.x[j] += (dx / d) * 30; this.y[j] += (dy / d) * 30; }
          this.damage(j, 45 * boost, i);
          return false;
        });
      } else if (!this.dash[i] && this.acd[i] <= this.time && this.task[i] === T_ATTACK && this.valid(this.tgt[i], this.tgen[i])) {
        const j = this.tgt[i], dx = this.x[j] - x, dy = this.y[j] - y, d = Math.hypot(dx, dy);
        if (d > 110 && d < 430) {
          const v = 620, tt = Math.max(0.12, (d - K.r) / v);
          this.vx[i] = (dx / d) * v; this.vy[i] = (dy / d) * v; this.ang[i] = Math.atan2(dy, dx);
          this.dash[i] = this.time + tt; this.acd[i] = this.time + 6;
        }
      }
    }
  }
  strike(i: number, j: number) {
    const k = this.kind[i] as Kind, K = KINDS[k];
    const c = this.col[i];
    if (k === Kind.SPITTER) { this.shoot(i, j, K.dmg * (this.has(c, 'toxin') ? 1.35 : 1)); return; }
    if (k === Kind.SENTINEL) { this.shoot(i, j, K.dmg); return; }
    // engulf: a hunter swallows a wounded cell no bigger than itself
    const kj = this.kind[j] as Kind;
    if ((k === Kind.HUNTER || k === Kind.AMOEBA) && !isStructure(kj) && !this.cyst[j] && KINDS[kj].r <= K.r * 1.05 && this.hp[j] < KINDS[kj].hp * (this.has(c, 'jaws') || (c >= 0 && this.nations[c].techs.has('pre2')) ? 0.4 : 0.3)) {
      this.hp[i] = Math.min(K.hp, this.hp[i] + KINDS[kj].hp * 0.5);
      if (c >= 0) this.income(this.nations[c], 6, 0);
      if (c === 0 && this.col[j] > 0) this.dna[this.col[j]] += 0.65;   // engulfed whole: the genes come with it
      if (c >= 0) this.gainDna(c, j, true);
      this.kill(j, i);
      if (k === Kind.AMOEBA) { this.cd[i] = 8; this.task[i] = T_IDLE; this.tgt[i] = -1; }
      return;
    }
    if (k === Kind.TITAN) { this.damage(j, K.dmg * (c >= 0 && this.nations[c].techs.has('tit2') ? 1.3 : 1) * (this.tt[i] === 1 ? 1.3 : 1), i); return; }
    this.damage(j, K.dmg * (k === Kind.HUNTER && this.has(c, 'jaws') ? 1.3 : 1) * (k === Kind.HUNTER && c >= 0 && this.nations[c].techs.has('pre2') ? 1.25 : 1), i);
  }
  damage(j: number, dmg: number, by: number) {
    const cj = this.col[j];
    let d = Math.max(1, dmg - KINDS[this.kind[j]].armor - (this.has(cj, 'armor') ? 1 : 0) - (cj >= 0 && this.nations[cj].techs.has('mem1') ? 1 : 0) - (this.cyst[j] ? 3 : 0));
    if (this.kind[j] === Kind.TITAN) d *= (this.tt[j] === 1 ? 0.45 : 1) * (cj >= 0 && this.nations[cj].techs.has('tit2') ? 0.77 : 1);
    this.hp[j] -= d; this.hitAt[j] = this.time; this.hitBy[j] = by;
    if (this.hp[j] <= 0) { this.kill(j, by); if (by >= 0 && this.kind[by] === Kind.AMOEBA) { this.cd[by] = 8; this.task[by] = T_IDLE; this.tgt[by] = -1; } }
  }
  shoot(i: number, j: number, dmg: number) {
    const p = this.pfree.length ? this.pfree.pop()! : this.ptop < PCAP ? this.ptop++ : -1;
    if (p < 0) return;
    const a = Math.atan2(this.y[j] - this.y[i], this.x[j] - this.x[i]), v = 240;
    this.px[p] = this.x[i] + Math.cos(a) * KINDS[this.kind[i]].r; this.py[p] = this.y[i] + Math.sin(a) * KINDS[this.kind[i]].r;
    this.pvx[p] = Math.cos(a) * v; this.pvy[p] = Math.sin(a) * v; this.pdmg[p] = dmg; this.plife[p] = 1.2;
    this.ptgt[p] = j; this.pown[p] = i; this.palive[p] = 1;
    this.ang[i] = a;
  }
  moveProjectiles(dt: number) {
    for (let p = 0; p < this.ptop; p++) {
      if (!this.palive[p]) continue;
      this.plife[p] -= dt;
      const j = this.ptgt[p];
      if (j >= 0 && this.alive[j]) {
        const a = Math.atan2(this.y[j] - this.py[p], this.x[j] - this.px[p]), v = Math.hypot(this.pvx[p], this.pvy[p]);
        this.pvx[p] += (Math.cos(a) * v - this.pvx[p]) * Math.min(1, dt * 6); this.pvy[p] += (Math.sin(a) * v - this.pvy[p]) * Math.min(1, dt * 6);
        if ((this.x[j] - this.px[p]) ** 2 + (this.y[j] - this.py[p]) ** 2 < (KINDS[this.kind[j]].r + 3) ** 2) {
          this.damage(j, this.pdmg[p], this.alive[this.pown[p]] ? this.pown[p] : -1);
          this.palive[p] = 0; this.pfree.push(p); continue;
        }
      }
      this.px[p] += this.pvx[p] * dt; this.py[p] += this.pvy[p] * dt;
      if (this.plife[p] <= 0 || this.inRock(this.px[p], this.py[p], 0)) { this.palive[p] = 0; this.pfree.push(p); }
    }
  }
  settle(i: number) {
    const c = this.col[i], N = this.nations[c];
    const K = KINDS[Kind.NODE];
    if (N.food < K.food || N.energy < K.energy || !this.nodeSpotOk(c, this.x[i], this.y[i])) {
      this.task[i] = T_IDLE; this.manual[i] = 0;
      if (N.player) this.say(N.food < K.food || N.energy < K.energy ? 'Recursos insuficientes para o nódulo.' : 'O nódulo precisa tocar o seu biofilme, longe de outros nódulos e rochas.');
      if (N.builder === i) N.builder = -1;
      return;
    }
    N.food -= K.food; N.energy -= K.energy;
    const x = this.x[i], y = this.y[i];
    N.pop -= KINDS[Kind.WORKER].pop; N.counts[Kind.WORKER]--;
    this.alive[i] = 0; this.free.push(i); this.count--;
    const g = this.grp[i];
    const n = this.spawn(Kind.NODE, c, x, y);
    if (n >= 0) { this.grow[n] = 40; this.grp[n] = g; }
    if (N.builder === i) N.builder = -1;
    if (N.player) this.say('Nódulo de biofilme fixado: o território cresce e cabem +6 células.');
  }

  moveAll(dt: number) {
    const turn = Math.min(1, dt * 8);
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i] as Kind, K = KINDS[k];
      let dvx = 0, dvy = 0;
      const t = this.task[i];
      const still = this.cyst[i] || (isStructure(k) && (this.rooted[i] || k === Kind.NODE));
      const N0 = this.col[i] >= 0 ? this.nations[this.col[i]] : null;
      if (this.dash[i] > this.time) {
        // a leaping copepod flies straight at its target
        this.x[i] = clampW(this.x[i] + this.vx[i] * dt); this.y[i] = clampW(this.y[i] + this.vy[i] * dt);
        continue;
      }
      const speed = still || this.stun[i] > this.time ? 0 : (k === Kind.MOTHER && !this.rooted[i] ? 36 : K.speed) * (this.has(this.col[i], 'speed') ? 1.15 : 1) * (N0?.techs.has('mot1') ? 1.1 : 1) * (k === Kind.TITAN ? TSPEED[this.tt[i]] : 1);
      if (speed > 0 && t !== T_IDLE) {
        const dx = this.gx[i] - this.x[i], dy = this.gy[i] - this.y[i], d = Math.hypot(dx, dy);
        const sp = speed * (t === T_WANDER ? 0.45 : 1) * (this.sat[i] <= 0 ? 0.6 : 1);
        if (d > 1) { const f = Math.min(1, d / 30); dvx = (dx / d) * sp * f; dvy = (dy / d) * sp * f; }
      }
      const [fx, fy] = this.flow(this.x[i], this.y[i]);
      const drift = still ? 0 : this.col[i] < 0 ? 1 : 0.5;
      const a = 1 - Math.exp(-dt * 5);
      this.vx[i] += (dvx + fx * drift - this.vx[i]) * a; this.vy[i] += (dvy + fy * drift - this.vy[i]) * a;
      if (still) { this.vx[i] = 0; this.vy[i] = 0; }
      this.x[i] = clampW(this.x[i] + this.vx[i] * dt); this.y[i] = clampW(this.y[i] + this.vy[i] * dt);
      let hx = dvx, hy = dvy;
      if (t === T_ATTACK && this.tgt[i] >= 0 && this.alive[this.tgt[i]]) { hx = this.x[this.tgt[i]] - this.x[i]; hy = this.y[this.tgt[i]] - this.y[i]; }
      if (hx * hx + hy * hy > 4 && k !== Kind.NODE && k !== Kind.PHOTO && !this.cyst[i]) {
        const want = Math.atan2(hy, hx);
        let da = want - this.ang[i];
        da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
        this.ang[i] += da * turn * (k === Kind.MOTHER ? (this.rooted[i] ? 0.15 : 0.4) : 0.6);
      }
    }
    // separation (soft bodies push apart) + obstacles
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const ri = KINDS[this.kind[i]].r, xi = this.x[i], yi = this.y[i];
      const bx = Math.floor(xi / HB), by = Math.floor(yi / HB);
      const mi = this.rooted[i] || this.kind[i] === Kind.NODE ? 1e4 : massOf(this.kind[i]);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cx = bx + ox, cy = by + oy;
        if (cx < 0 || cy < 0 || cx >= HN || cy >= HN) continue;
        for (let j = this.head[cy * HN + cx]; j >= 0; j = this.next[j]) {
          if (j <= i || !this.alive[j]) continue;
          const rr = ri + KINDS[this.kind[j]].r;
          const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i], d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), o = (rr - d) * 0.5, nx = dx / d, ny = dy / d;
          const mj = this.rooted[j] || this.kind[j] === Kind.NODE ? 1e4 : massOf(this.kind[j]), wi = mj / (mi + mj), wj = mi / (mi + mj);
          this.x[i] -= nx * o * wi; this.y[i] -= ny * o * wi; this.x[j] += nx * o * wj; this.y[j] += ny * o * wj;
        }
      }
      for (let k = this.rHead[by * HN + bx]; k >= 0; k = this.rNext[k]) {
        const rk = this.obst[this.rIdx[k]], dx = this.x[i] - rk.x, dy = this.y[i] - rk.y, d = Math.hypot(dx, dy), rr = rk.r + ri;
        if (d < rr && d > 1e-3) { this.x[i] = rk.x + (dx / d) * rr; this.y[i] = rk.y + (dy / d) * rr; }
      }
    }
  }

  // --- goals (the tutorial-ish objectives of the player) ------------------------------------------------------------------------
  cells(n: number) { return this.nations[n].counts.reduce((a, b) => a + b, 0); }
  canEvolve() { const P = this.nations[0]; return P.alive && P.mito && P.genes.size >= 3 && P.techs.has('com4') && this.cells(0) >= 60; }
  checkGoals() {
    const P = this.nations[0];
    if (this.tick % 10) return;
    const g = this.goals;
    if (!g.food && P.food >= 200) g.food = true;
    if (!g.divide && P.born > 0) g.divide = true;
    if (!g.node && P.nodes > 0) g.node = true;
    if (!g.colony && P.founded > 0) g.colony = true;
    if (!g.photo) for (let i = 0; i < this.top; i++) if (this.alive[i] && this.col[i] === 0 && this.kind[i] === Kind.PHOTO && this.inLight(this.x[i], this.y[i]) && this.bioOwner(this.x[i], this.y[i]) === 0) { g.photo = true; break; }
    if (!g.gene && P.genes.size > 0) g.gene = true;
    if (!g.pact && this.pact.some(v => v > 0)) g.pact = true;
    if (!g.endo && P.mito) g.endo = true;
    if (!g.big && this.cells(0) >= 60) g.big = true;
    if (this.tick % 40 === 0) this.diplomacy(2);
  }
  /** every 2 s: who the player has met, relations drifting, symbiotic trade */
  diplomacy(dt: number) {
    const P = this.nations[0];
    // offers the player let expire count as a refusal
    for (const o of this.offers) if (o.until <= this.time) this.refuse(o);
    this.offers = this.offers.filter(o => o.until > this.time);
    for (const N of this.nations) {
      if (N.player) continue;
      const n = N.id;
      if (!N.alive) { this.pact[n] = 0; continue; }
      // relations settle slowly; pacts warm them
      const base = Math.round(20 - N.aggr * 40);
      this.rel[n] += ((base - this.rel[n]) * 0.01 + (this.pact[n] === 2 ? 1 : this.pact[n] === 1 ? 0.5 : 0)) * dt / 2;
      this.rel[n] = Math.max(-100, Math.min(100, this.rel[n]));
      if (this.pact[n] === 2) { this.income(P, 0.4 * dt, 0.4 * dt); this.income(N, 0.4 * dt, 0.4 * dt); }
      // a bitter partner breaks the pact
      if (this.pact[n] && this.rel[n] < -40) { this.pact[n] = 0; this.say(`${this.w.species[n].genus} rompeu o pacto com você!`); }
      // the AI makes its own offers to species that know the player
      if (!this.met[n] || !P.alive || this.offers.some(o => o.nation === n) || this.offers.length >= 3) continue;
      const u = this.r(), r = this.rel[n];
      if (this.pact[n] === 0 && this.time > GRACE && (r >= 15 || N.power < P.power * 0.6) && N.grudge < this.time && u < 0.025) this.offer(n, 'peace', 0);
      else if (this.pact[n] === 1 && this.time - this.pactAt[n] >= 45 && r >= 40 && u < 0.04) this.offer(n, 'symbiosis', 0);
      else if (this.pact[n] === 0 && this.time > GRACE + 60 && N.power > P.power * 1.4 && N.aggr > 0.5 && r < 0 && N.truce < this.time && u < 0.015) this.offer(n, 'tribute', 10 * Math.round(6 + N.aggr * 6));
    }
    if (this.tick % 600 === 0) this.aiDiplomacy();
  }
  offer(n: number, kind: Offer['kind'], amount: number) {
    this.offers.push({ id: this.offerId++, nation: n, kind, amount, until: this.time + 30 });
    const name = `${this.w.species[n].genus} ${this.w.species[n].species}`;
    this.say(kind === 'peace' ? `${name} propõe paz.` : kind === 'symbiosis' ? `${name} propõe simbiose.` : `${name} exige um tributo de ${amount} nutrientes!`);
  }
  /** a refused (or ignored) offer sours the relation; a refused tribute means war */
  refuse(o: Offer) {
    const n = o.nation, N = this.nations[n];
    if (o.kind === 'tribute') {
      this.rel[n] = Math.max(-100, this.rel[n] - 20); N.grudge = this.time + 240;
      this.say(`${this.w.species[n].genus} não recebeu o tributo e vem atacar você!`);
    } else this.rel[n] = Math.max(-100, this.rel[n] - (o.kind === 'peace' ? 15 : 10));
  }
  /** every 30 s: AI species make and break pacts among themselves; a player grown too strong faces a coalition */
  aiDiplomacy() {
    const NN = this.nations.length, P = this.nations[0];
    for (let a = 1; a < NN; a++) for (let b = a + 1; b < NN; b++) {
      const A = this.nations[a], B = this.nations[b], k = a * NN + b, k2 = b * NN + a;
      if (!A.alive || !B.alive) { this.aiPact[k] = this.aiPact[k2] = 0; continue; }
      if ((A.hx - B.hx) ** 2 + (A.hy - B.hy) ** 2 > 3200 * 3200) continue;
      const calm = 2 - A.aggr - B.aggr;
      if (!this.aiPact[k]) { if (this.r() < 0.08 * calm) this.aiPact[k] = this.aiPact[k2] = 1; }
      else if (this.r() < 0.04 * (1 - calm / 2)) this.aiPact[k] = this.aiPact[k2] = 0;
    }
    let top = 0;
    for (const N of this.nations) if (!N.player && N.alive) top = Math.max(top, N.power);
    if (P.alive && this.time > GRACE + 120 && P.power > 40 && P.power > top * 1.6) {
      let n = 0;
      for (const N of this.nations) {
        if (N.player || !N.alive || this.pact[N.id] || !this.met[N.id] || this.rel[N.id] > 10 || N.truce > this.time) continue;
        if ((N.hx - P.hx) ** 2 + (N.hy - P.hy) ** 2 > 4000 * 4000) continue;
        N.grudge = this.time + 180; n++;
      }
      if (n >= 2) this.say(`Uma coalizão de ${n} espécies se formou contra você!`);
    }
  }

  // --- fog of war -------------------------------------------------------------------------------------------------------------
  /** what the player's cells see; species are discovered when one of their cells is seen */
  updateVision() {
    const vis = this.vis, N = VIS_N, P = this.nations[0], k = P.techs.has('mot2') ? 1.4 : 1;
    vis.fill(0);
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.col[i] !== 0) continue;
      const R = KINDS[this.kind[i]].sight * k / VIS, cx = this.x[i] / VIS, cy = this.y[i] / VIS;
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(N - 1, Math.floor(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N - 1, Math.floor(cx + R)); x++)
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= R * R) vis[y * N + x] = 1;
    }
    for (let i = 0; i < this.top; i++) {
      const c = this.col[i];
      if (!this.alive[i] || c <= 0 || this.met[c]) continue;
      if (!vis[Math.floor(this.y[i] / VIS) * N + Math.floor(this.x[i] / VIS)]) continue;
      this.met[c] = 1; P.dnaPts += 3;
      if (P.alive) this.say(`Espécie descoberta: ${this.w.species[c].genus} ${this.w.species[c].species} (+3 DNA). O território dela aparece no mapa.`);
    }
    this.visDirty = true;
  }
  seen(x: number, y: number) { return !!this.vis[Math.floor(y / VIS) * VIS_N + Math.floor(x / VIS)]; }

  // --- pool events ----------------------------------------------------------------------------------------------------------
  startEvent(kind: EventKind) {
    const r = this.r, W = WORLD;
    const e: PoolEvent = { id: this.evId++, kind, name: '', x: W / 2, y: W / 2, r: 0, until: this.time + 60, vx: 0, vy: 0 };
    if (kind === 'bloom') { const f = this.w.fields[Math.floor(r() * this.w.fields.length)]; e.x = f.x; e.y = f.y; e.r = 340; e.until = this.time + 60; e.name = 'Florescimento de algas'; }
    else if (kind === 'toxic') { e.x = 600 + r() * (W - 1200); e.y = 600 + r() * (W - 1200); e.r = 380; e.until = this.time + 45; e.name = 'Maré tóxica'; }
    else if (kind === 'current') { const a = r() * Math.PI * 2; e.vx = Math.cos(a) * 20; e.vy = Math.sin(a) * 20; e.until = this.time + 90; e.name = 'Mudança de corrente'; }
    else if (kind === 'heat') { e.until = this.time + 45; e.name = 'Onda de calor nas fontes termais'; }
    else {
      // the plague starts in some nation's cells (never the player's first colony right away)
      const cands: number[] = [];
      for (let i = 0; i < this.top; i++) if (this.alive[i] && this.col[i] > 0 && !isStructure(this.kind[i])) cands.push(i);
      if (!cands.length) return;
      const z = cands[Math.floor(r() * cands.length)];
      this.infect(z, true);
      for (let i = 0; i < this.top; i++) if (this.alive[i] && i !== z && Math.hypot(this.x[i] - this.x[z], this.y[i] - this.y[z]) < 60) this.infect(i, true);
      e.x = this.x[z]; e.y = this.y[z]; e.r = 220; e.until = 1e9; e.name = 'Praga viral';
      this.plagueHitPlayer = false;
    }
    this.events.push(e);
    const where = kind === 'current' || kind === 'heat' ? '' : ' (veja o mapa)';
    const tips: Record<EventKind, string> = {
      bloom: 'nutrientes em excesso numa região', toxic: 'uma área que machuca todas as células', current: 'o fluxo mudou de direção',
      heat: 'as fontes termais queimam muito mais longe', plague: 'células infectadas morrem em 20 s e contaminam as vizinhas',
    };
    this.say(`${e.name}: ${tips[kind]}${where}.`);
  }
  infect(i: number, force = false) {
    if (!this.alive[i] || this.inf[i] > 0 || this.immune[i] > this.time || this.tough(i)) return;
    const c = this.col[i];
    if (!force && c >= 0 && this.nations[c].techs.has('mem4') && this.r() < 0.8) { this.immune[i] = this.time + 20; return; }
    this.inf[i] = 0.01;
    if (c === 0 && !this.plagueHitPlayer) { this.plagueHitPlayer = true; this.say('Suas células foram infectadas pelo vírus! Afaste as sãs das doentes (Imunidade antiviral ajuda).'); }
  }
  tickEvents(dt: number) {
    if (this.time >= this.nextEvent) {
      this.nextEvent = this.time + 150 + this.r() * 110;
      const u = this.r();
      this.startEvent(u < 0.26 ? 'bloom' : u < 0.46 ? 'toxic' : u < 0.62 ? 'current' : u < 0.78 ? 'heat' : 'plague');
    }
    for (const e of this.events) {
      if (e.kind === 'bloom') for (let k = 0; k < 8; k++) { const a = this.r() * 6.283, d = Math.sqrt(this.r()) * e.r; this.addMote(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 5 + this.r() * 4, -1); }
      if (e.kind === 'toxic') for (let i = 0; i < this.top; i++) {
        if (!this.alive[i] || this.tough(i) || (this.x[i] - e.x) ** 2 + (this.y[i] - e.y) ** 2 > e.r * e.r) continue;
        this.hp[i] -= 1.5; if (this.hp[i] <= 0) this.kill(i);
      }
    }
    // the virus: incubates 20 s, jumps to cells nearby; structures pull through, the rest die and burst
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.inf[i] <= 0) continue;
      this.inf[i] += dt; n++; sx += this.x[i]; sy += this.y[i];
      if (this.r() < 0.35) { const j = this.nearest(this.x[i], this.y[i], 30, q => q !== i && this.inf[q] <= 0 && this.kind[q] !== Kind.DIATOM); if (j >= 0) this.infect(j); }
      if (this.inf[i] >= 20) {
        if (isStructure(this.kind[i]) || this.kind[i] === Kind.TITAN) { this.inf[i] = 0; this.immune[i] = this.time + 120; continue; }
        const x = this.x[i], y = this.y[i];
        this.kill(i);
        for (let j = 0; j < this.top; j++) if (this.alive[j] && (this.x[j] - x) ** 2 + (this.y[j] - y) ** 2 < 55 * 55 && this.r() < 0.5) this.infect(j);
      }
    }
    const pl = this.events.find(e => e.kind === 'plague');
    if (pl) { if (!n) pl.until = 0; else { pl.x = sx / n; pl.y = sy / n; } }
    const before = this.events.length;
    this.events = this.events.filter(e => e.until > this.time);
    if (this.events.length < before && pl && pl.until === 0) this.say('A praga viral acabou.');
    // toxin clouds
    for (const c of this.clouds) for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.tough(i) || this.col[i] === c.nation || (this.col[i] >= 0 && c.nation >= 0 && !this.hostileNations(c.nation, this.col[i]))) continue;
      if ((this.x[i] - c.x) ** 2 + (this.y[i] - c.y) ** 2 > c.r * c.r) continue;
      this.hp[i] -= 4; this.hitAt[i] = this.time; if (this.hp[i] <= 0) this.kill(i);
    }
    this.clouds = this.clouds.filter(c => c.until > this.time);
  }
  hostileNations(a: number, b: number) {
    if (a === b) return false;
    if ((a === 0 && this.pact[b]) || (b === 0 && this.pact[a])) return false;
    if (a > 0 && b > 0 && this.aiPact[a * this.nations.length + b]) return false;
    return true;
  }

  // --- evolution tree -------------------------------------------------------------------------------------------------------
  techCost(N: Nation, id: string): [number, number] { const T = TECHS.find(q => q.id === id)!; return [Math.ceil(T.dna * geneDiscount(N.genes.size)), T.energy]; }
  canResearch(N: Nation, id: string) {
    const T = TECHS.find(q => q.id === id);
    if (!T || N.techs.has(id) || N.research || !T.req.every(r => N.techs.has(r))) return false;
    const [d, e] = this.techCost(N, id);
    return N.dnaPts >= d && N.energy >= e;
  }
  startResearch(N: Nation, id: string) {
    if (!this.canResearch(N, id)) return false;
    const [d, e] = this.techCost(N, id);
    N.dnaPts -= d; N.energy -= e; N.research = { id, t: 0 };
    return true;
  }
  /** DNA from a kill (engulfing gives more): prey, diatoms and amoebas are rich */
  gainDna(killer: number, victim: number, engulf: boolean) {
    if (killer < 0) return;
    const N = this.nations[killer], k = this.kind[victim];
    const base = k === Kind.TITAN ? 25 : k === Kind.BACTERIA ? 0.3 : k === Kind.DIATOM ? 2 : k === Kind.AMOEBA ? 4 : this.col[victim] >= 0 ? (isStructure(k) ? 0.6 : 0.3) : 0.2;
    N.dnaPts += base + (engulf ? 0.7 + (N.techs.has('pre2') ? 0.4 : 0) : 0);
  }

  // --- commands ---------------------------------------------------------------------------------------------------------------------
  command(cmd: Cmd) {
    const P = this.nations[0];
    const mine = (i: number) => i >= 0 && i < this.top && this.alive[i] && this.col[i] === 0;
    switch (cmd.t) {
      case 'move': case 'gather': {
        const ids = cmd.ids.filter(mine);
        ids.forEach((i, n) => {
          const k = this.kind[i];
          if (k === Kind.NODE || (isStructure(k) && this.rooted[i]) || this.cyst[i]) return;
          const ring = n === 0 ? 0 : 12 + Math.sqrt(n) * 14, a = n * 2.4;
          const x = clampW(cmd.x + Math.cos(a) * ring), y = clampW(cmd.y + Math.sin(a) * ring);
          this.tgt[i] = -1; this.manual[i] = 1;
          if (k === Kind.MOTHER) { this.task[i] = T_MOVE; this.gx[i] = cmd.x; this.gy[i] = cmd.y; this.warned[i] = 0; return; }
          if (cmd.t === 'gather' && k === Kind.WORKER) { this.ax[i] = cmd.x; this.ay[i] = cmd.y; this.task[i] = T_MOVE; this.gx[i] = x; this.gy[i] = y; this.manual[i] = 0; }
          else if (isMil(k)) { this.task[i] = T_AMOVE; this.gx[i] = x; this.gy[i] = y; this.ax[i] = x; this.ay[i] = y; this.manual[i] = 2; }
          else { this.task[i] = T_MOVE; this.gx[i] = x; this.gy[i] = y; this.ax[i] = x; this.ay[i] = y; }
        });
        break;
      }
      case 'attack': {
        if (cmd.target < 0 || !this.alive[cmd.target]) break;
        const tn = this.col[cmd.target];
        if (tn > 0 && this.pact[tn]) { this.pact[tn] = 0; this.rel[tn] = Math.max(-100, this.rel[tn] - 50); this.say(`Você atacou ${this.w.species[tn].genus} e rompeu o pacto!`); }
        for (const i of cmd.ids.filter(mine)) { if (!KINDS[this.kind[i]].dmg || this.kind[i] === Kind.MOTHER) continue; this.setTarget(i, cmd.target); this.task[i] = T_ATTACK; this.manual[i] = 1; }
        break;
      }
      case 'stance':
        for (const i of cmd.ids.filter(mine)) { this.stance[i] = cmd.stance; this.manual[i] = 0; if (this.task[i] !== T_ATTACK) this.task[i] = T_IDLE; this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; }
        if (cmd.colony !== undefined) { const C = this.cols.get(cmd.colony); if (C && C.nation === 0) C.stance = cmd.stance; }
        break;
      case 'train': {
        const m = this.motherOf(cmd.colony) ?? this.capital(P);
        if (m < 0 || !this.rooted[m]) { this.say('Nenhuma colônia para dividir.'); break; }
        if (!this.unlocked(P, cmd.kind)) { this.say(`Pesquise ${TECHS.find(t => t.id === LOCKED[cmd.kind])!.name} primeiro.`); break; }
        if (PLACED.includes(cmd.kind)) { this.say('Escolha no mapa onde colocar.'); break; }
        if (cmd.kind === Kind.TITAN && this.titanRoom(P) <= 0) { this.say(`Limite de titãs atingido (${titanLimit(P.techs)}). Pesquise mais Gigantismo para ter outro.`); break; }
        if (!this.train(P, m, cmd.kind)) this.say((this.queues.get(m)?.length ?? 0) >= 6 ? 'Fila de divisão cheia.' : 'Nutrientes ou energia insuficientes.');
        break;
      }
      case 'cancel': {
        const m = this.motherOf(cmd.colony);
        const q = m !== undefined ? this.queues.get(m)?.[cmd.index] : undefined;
        if (q && m !== undefined) { const [f, e] = this.cost(P, q.kind); P.food += f; P.energy += e; this.queues.get(m)!.splice(cmd.index, 1); }
        break;
      }
      case 'nodeAt': {
        if (!this.nodeSpotOk(0, cmd.x, cmd.y)) { this.say(`O nódulo precisa tocar o seu biofilme e ficar a ${NODE_GAP}+ de outros nódulos e colônias (de qualquer espécie).`); break; }
        const K = KINDS[Kind.NODE];
        if (P.food < K.food || P.energy < K.energy) { this.say('Nutrientes ou energia insuficientes para o nódulo.'); break; }
        // the nearest free worker of the chosen colony (else of the whole nation) swims there and settles
        const pickW = (col: number | undefined) => this.nearest(cmd.x, cmd.y, 5000, j => this.col[j] === 0 && this.kind[j] === Kind.WORKER && this.task[j] !== T_BUILD && (col === undefined || this.grp[j] === col));
        let w = pickW(cmd.colony);
        if (w < 0) w = pickW(undefined);
        if (w < 0) { this.say('Nenhuma coletora disponível para virar nódulo.'); break; }
        this.order(w, T_BUILD, cmd.x, cmd.y); this.manual[w] = 1;
        this.say('Uma coletora está indo fixar o nódulo.');
        break;
      }
      case 'gift': {
        const n = cmd.nation, N = this.nations[n];
        if (!N || N.player || !N.alive) break;
        if (P.food < 50) { this.say('São precisos 50 nutrientes para um presente.'); break; }
        P.food -= 50; N.food += 50; this.rel[n] = Math.min(100, this.rel[n] + (P.techs.has('com1') ? 18 : 12));
        this.say(`${this.w.species[n].genus} recebeu 50 nutrientes (relação ${Math.round(this.rel[n])}).`);
        break;
      }
      case 'propose': {
        const n = cmd.nation, N = this.nations[n];
        if (!N || N.player || !N.alive) break;
        const name = this.w.species[n].genus, r = this.rel[n];
        if (cmd.kind === 'war') { if (this.pact[n]) { this.pact[n] = 0; this.rel[n] -= 30; this.say(`Você rompeu o pacto com ${name}.`); } break; }
        if (cmd.kind === 'peace') {
          if (this.pact[n]) break;
          // the weak make peace readily, the strong only with good relations
          const ok = r >= 10 || (N.power < P.power * 0.8 && r >= -20);
          if (ok) { this.pact[n] = 1; this.pactAt[n] = this.time; if (N.target === 0) this.recall(N); this.say(`${name} aceitou a paz.`); }
          else this.say(`${name} recusou a paz (relação ${Math.round(r)}). Presentes ajudam.`);
          break;
        }
        if (cmd.kind === 'symbiosis') {
          if (this.pact[n] !== 1) { this.say('A simbiose começa depois de um tempo de paz.'); break; }
          if (this.time - this.pactAt[n] < 45 || r < 40) { this.say(`${name} ainda não confia em você (paz há ${Math.max(0, Math.floor(this.time - this.pactAt[n]))} s, relação ${Math.round(r)}; precisa de 45 s e 40).`); break; }
          this.pact[n] = 2; this.pactAt[n] = this.time;
          this.say(`Simbiose com ${name}: vocês trocam nutrientes e energia e comem no biofilme um do outro.`);
          break;
        }
        if (cmd.kind === 'endo') {
          if (this.pact[n] !== 2) break;
          if (P.mito) { this.say('Sua espécie já tem uma endossimbiose.'); break; }
          if (this.time - this.pactAt[n] < 90 || r < 60) { this.say(`A endossimbiose precisa de 90 s de simbiose e relação 60 (agora: ${Math.floor(this.time - this.pactAt[n])} s, ${Math.round(r)}).`); break; }
          const g = geneOf(this.w.species[n]);
          P.mito = true; P.genes.add(g.id);
          this.say(`Endossimbiose! ${name} vive agora dentro das suas células como organela: +50% de energia, divisão mais rápida e o gene ${g.name}.`);
          break;
        }
        break;
      }
      case 'place': {
        const k = cmd.kind;
        if (!PLACED.includes(k)) break;
        if (!this.unlocked(P, k)) { this.say(`Pesquise ${TECHS.find(t => t.id === LOCKED[k])!.name} primeiro.`); break; }
        if (!this.placeOk(0, k, cmd.x, cmd.y)) { this.say(k === Kind.SENTINEL ? 'A sentinela precisa ficar no seu biofilme, longe de outras sentinelas, colônias e nódulos.' : 'A fotossintética precisa ficar no seu biofilme, longe de outras fotossintéticas, colônias e nódulos.'); break; }
        let m = this.motherOf(cmd.colony) ?? -1;
        if (m < 0 || !this.rooted[m]) {
          let bd = 1e18;
          for (const q of P.motherList) { if (!this.alive[q] || !this.rooted[q]) continue; const d = (this.x[q] - cmd.x) ** 2 + (this.y[q] - cmd.y) ** 2; if (d < bd) { bd = d; m = q; } }
        }
        if (m < 0) { this.say('Nenhuma colônia para dividir.'); break; }
        if (P.pop + KINDS[k].pop > P.cap) { this.say('População no limite: faça nódulos ou novas colônias.'); break; }
        if (!this.train(P, m, k, cmd.x, cmd.y)) this.say((this.queues.get(m)?.length ?? 0) >= 6 ? 'Fila de divisão cheia.' : 'Nutrientes ou energia insuficientes.');
        break;
      }
      case 'research': {
        const T = TECHS.find(t => t.id === cmd.id);
        if (!T) break;
        if (P.research) { this.say('Já há uma pesquisa em andamento.'); break; }
        if (!this.startResearch(P, cmd.id)) { const [d, e] = this.techCost(P, cmd.id); this.say(`${T.name} precisa de ${d} DNA e ${e} de energia${T.req.length ? ' e das pesquisas anteriores' : ''}.`); }
        else this.say(`Pesquisando ${T.name}…`);
        break;
      }
      case 'cyst': {
        if (!P.techs.has('mot3')) { this.say('Pesquise Encistamento primeiro.'); break; }
        const ids = cmd.ids.filter(i => mine(i) && !isStructure(this.kind[i]));
        const on = ids.some(i => !this.cyst[i]);
        for (const i of ids) { this.cyst[i] = on ? 1 : 0; this.task[i] = T_IDLE; this.tgt[i] = -1; this.manual[i] = 0; this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; }
        if (ids.length) this.say(on ? `${ids.length} células encistadas: paradas, blindadas e sem manutenção.` : 'As células despertaram.');
        break;
      }
      case 'cloud': {
        if (!P.techs.has('pre3')) { this.say('Pesquise Nuvem de toxina primeiro.'); break; }
        let best = -1, bd = 420 * 420;
        for (const i of cmd.ids) {
          if (!mine(i) || this.kind[i] !== Kind.SPITTER || this.acd[i] > this.time || this.cyst[i]) continue;
          const d = (this.x[i] - cmd.x) ** 2 + (this.y[i] - cmd.y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) { this.say('Nenhuma secretora pronta a até 420 do alvo (recarga de 20 s).'); break; }
        this.acd[best] = this.time + 20;
        this.clouds.push({ x: cmd.x, y: cmd.y, r: 70, until: this.time + 5, nation: 0 });
        break;
      }
      case 'answer': {
        const o = this.offers.find(q => q.id === cmd.id);
        if (!o) break;
        this.offers = this.offers.filter(q => q !== o);
        const n = o.nation, N = this.nations[n], name = this.w.species[n].genus;
        if (!N.alive) break;
        if (!cmd.yes) { this.refuse(o); if (o.kind !== 'tribute') this.say(`Você recusou a proposta de ${name}.`); break; }
        if (o.kind === 'peace') { if (!this.pact[n]) { this.pact[n] = 1; this.pactAt[n] = this.time; if (N.target === 0) this.recall(N); N.grudge = 0; } this.rel[n] = Math.min(100, this.rel[n] + 5); this.say(`Paz com ${name}.`); }
        else if (o.kind === 'symbiosis') { if (this.pact[n] === 1) { this.pact[n] = 2; this.pactAt[n] = this.time; this.say(`Simbiose com ${name}: vocês trocam nutrientes e energia e comem no biofilme um do outro.`); } }
        else {
          if (P.food < o.amount) { this.refuse(o); this.say(`Nutrientes insuficientes para o tributo: ${name} vem atacar!`); break; }
          P.food -= o.amount; N.food += o.amount; this.rel[n] = Math.min(100, this.rel[n] + 20); N.truce = this.time + 180; N.grudge = 0;
          if (N.target === 0) this.recall(N);
          this.say(`Tributo pago: ${name} deixa você em paz por 3 minutos.`);
        }
        break;
      }
      case 'evolve': if (this.canEvolve()) { this.evolved = true; this.paused = true; } break;
      case 'pause': this.paused = cmd.on; break;
      case 'speed': this.speed = Math.max(1, Math.min(4, Math.round(cmd.k))); break;
    }
  }

  // --- snapshots for the view ---------------------------------------------------------------------------------------------------
  snapshot(): { ents: Float32Array; n: number; motes: Float32Array; nm: number; shots: Float32Array; np: number; deaths: number[]; fx: number[] } {
    const n = this.top, ents = new Float32Array(n * STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (!this.alive[i]) { ents[o + 7] = -1; continue; }
      const k = this.kind[i];
      ents[o] = this.x[i]; ents[o + 1] = this.y[i]; ents[o + 2] = this.ang[i];
      ents[o + 3] = this.set[i] * 16 + k; ents[o + 4] = this.col[i];
      ents[o + 5] = Math.max(0, this.hp[i]) / KINDS[k].hp;
      ents[o + 6] = (this.carry[i] > 0 ? 1 : 0) | (this.time - this.hitAt[i] < 0.15 ? 2 : 0) | (this.sat[i] <= 0 ? 4 : 0) | (this.stance[i] << 4) | (this.task[i] === T_BUILD ? 128 : 0) | (k === Kind.MOTHER && !this.rooted[i] ? 256 : 0) | (this.cyst[i] ? 512 : 0) | (this.inf[i] > 0 ? 1024 : 0) | (this.stun[i] > this.time ? 2048 : 0);
      ents[o + 7] = this.gen[i];
      ents[o + 8] = this.grp[i];
    }
    let nm = 0;
    const motes = new Float32Array(this.mtop * 3);
    for (let i = 0; i < this.mtop; i++) if (this.malive[i]) { motes[nm * 3] = this.mx[i]; motes[nm * 3 + 1] = this.my[i]; motes[nm * 3 + 2] = this.mv[i]; nm++; }
    let np = 0;
    const shots = new Float32Array(this.ptop * 3);
    for (let p = 0; p < this.ptop; p++) if (this.palive[p]) { shots[np * 3] = this.px[p]; shots[np * 3 + 1] = this.py[p]; shots[np * 3 + 2] = Math.atan2(this.pvy[p], this.pvx[p]); np++; }
    const deaths = this.deaths; this.deaths = [];
    const fx = this.fx; this.fx = [];
    return { ents, n, motes, nm, shots, np, deaths, fx };
  }
  /** the player's colonies with their cells counted by kind, centre and division queue */
  colonyInfo(): ColonyInfo[] {
    const mine = [...this.cols.values()].filter(c => c.nation === 0);
    const by = new Map<number, Colony>();
    for (const c of mine) { c.n = 0; c.cx = 0; c.cy = 0; c.counts = new Array(SPECIES_KINDS).fill(0); by.set(c.id, c); }
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.col[i] !== 0) continue;
      const c = by.get(this.grp[i]);
      if (!c) continue;
      c.n++; c.cx += this.x[i]; c.cy += this.y[i]; c.counts[this.kind[i]]++;
    }
    return mine.sort((a, b) => a.idx - b.idx).map(c => ({
      ...c, counts: c.counts.slice(), cx: c.n ? c.cx / c.n : this.x[c.mother], cy: c.n ? c.cy / c.n : this.y[c.mother],
      x: this.x[c.mother], y: this.y[c.mother],
      queue: (this.queues.get(c.mother) ?? []).map((q, i) => ({ kind: q.kind, p: i === 0 ? q.t / KINDS[q.kind].time : 0 })),
    }));
  }
  stats(): Stats {
    const P = this.nations[0];
    const msg = this.msg && this.time - this.msgAt < 4 ? this.msg : null;
    return {
      time: this.time, food: P.food, energy: P.energy, pop: P.pop, cap: P.cap, alive: P.alive,
      counts: P.counts.slice(), nodes: P.nodes, ncol: P.mothers, area: P.area, kills: P.kills, lost: P.lost, founded: P.founded,
      nationsAlive: this.nations.filter(n => n.alive).length, msg, won: this.won,
      colonies: this.colonyInfo(), seeds: P.motherList.filter(m => this.alive[m] && !this.rooted[m]).length,
      genes: [...P.genes], mito: P.mito, canEvolve: this.canEvolve(), evolved: this.evolved,
      foodCap: P.foodCap, energyCap: P.energyCap, foodRate: P.fRate, energyIn: P.eInRate, energyOut: P.eOutRate,
      dna: P.dnaPts, techs: [...P.techs], research: P.research ? { id: P.research.id, p: P.research.t / TECHS.find(t => t.id === P.research!.id)!.time } : null,
      events: this.events.map(e => ({ ...e })), offers: this.offers.map(o => ({ ...o })), clouds: this.clouds.map(c => ({ ...c })),
      nations: this.nations.filter(n => !n.player && this.met[n.id]).map(n => ({ id: n.id, rel: Math.round(this.rel[n.id]), pact: this.pact[n.id], pactFor: Math.floor(this.time - this.pactAt[n.id]), dna: this.dna[n.id], power: n.power, colonies: n.mothers, cells: this.cells(n.id), alive: n.alive })),
    };
  }
  /** colony table for labels / minimap: x, y, nation, rooted (one row per mother cell) */
  colonyTable(): Float32Array {
    const ms = this.allMothers.filter(m => this.alive[m]);
    const out = new Float32Array(ms.length * 4);
    ms.forEach((m, i) => out.set([this.x[m], this.y[m], this.col[m], this.rooted[m]], i * 4));
    return out;
  }
}

/** how close a placed structure may sit to another structure (same kind keeps its own gap, the big ones their body) */
export const structGap = (k: number, other: number) => (other === k ? (k === Kind.SENTINEL ? 70 : 34) : other === Kind.MOTHER ? 46 : other === Kind.NODE ? 32 : 0);
const isMil = (k: number) => k === Kind.HUNTER || k === Kind.ARMOR || k === Kind.SPITTER || k === Kind.TITAN;
/** wild predators (hostile to every nation and to the wild prey) */
const wildPred = (k: number) => k === Kind.AMOEBA || k === Kind.TITAN;
/** titan speed by body plan: rotifer, tardigrade, hydra, nematode, copepod */
const TSPEED = [0.95, 0.9, 0.6, 2.3, 1.35];
/** wild titans use the neutral sprite sets NEUTRAL_SET + WILD_TITAN + body plan */
const WILD_TITAN = 7;
const massOf = (k: number) => (k === Kind.TITAN ? 400 : k === Kind.NODE ? 1e4 : k === Kind.MOTHER ? 60 : k === Kind.ARMOR ? 6 : k === Kind.AMOEBA ? 20 : k === Kind.DIATOM ? 3 : 1);
export { TRAINABLE };
