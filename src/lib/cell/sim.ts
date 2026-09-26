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
// Groups (like Hearts of Iron's army groups): named, coloured sets of cells that are selected and ordered together;
// the AI keeps a guard and an attack group per nation. Stances (automatic, gather, defend, hunt, explore) drive units
// without orders. The AI nations colonise, defend their colonies together and raid weaker neighbours.
// Wild life: bacteria (prey), diatoms, amoebas.
import { KINDS, Kind, TRAINABLE } from './look';
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

export interface Nation {
  id: number; species: number; player: boolean; alive: boolean;
  food: number; energy: number; pop: number; cap: number; counts: number[];
  mothers: number; nodes: number; builder: number;
  aggr: number; greed: number; prefs: number[]; nextThink: number;
  target: number; targetMother: number; power: number; area: number;
  kills: number; lost: number; born: number; founded: number;
  emitters: number[]; motherList: number[]; hx: number; hy: number;
  seedSite: { x: number; y: number } | null; seedAt: number;
  defGroup: number; atkGroup: number;
}
export interface Group { id: number; nation: number; name: string; color: string; stance: number; key: number; ai: number; n: number; cx: number; cy: number }
export interface MotherInfo { id: number; x: number; y: number; rooted: boolean; queue: { kind: number; p: number }[] }

export type Cmd =
  | { t: 'move'; ids: number[]; x: number; y: number }
  | { t: 'attack'; ids: number[]; target: number }
  | { t: 'gather'; ids: number[]; x: number; y: number }
  | { t: 'stance'; ids: number[]; stance: number; group?: number }
  | { t: 'train'; kind: Kind; mother?: number }
  | { t: 'cancel'; mother: number; index: number }
  | { t: 'node'; id: number; x: number; y: number }
  | { t: 'group'; ids: number[]; name: string; color: string; key: number }
  | { t: 'groupAdd'; group: number; ids: number[] }
  | { t: 'groupDel'; group: number }
  | { t: 'pause'; on: boolean }
  | { t: 'speed'; k: number };

export interface Stats {
  time: number; food: number; energy: number; pop: number; cap: number; alive: boolean;
  counts: number[]; nodes: number; colonies: number; area: number; kills: number; lost: number; founded: number;
  nationsAlive: number; msg: string | null; won: boolean;
  mothers: MotherInfo[]; groups: Group[];
}

const HB = 64, HN = WORLD / HB;
const MCAP = 9000, PCAP = 3000;
const clampW = (v: number) => (v < 8 ? 8 : v > WORLD - 8 ? WORLD - 8 : v);
const AI_GUARD = ['Guarda', 'Muralha', 'Sentinelas', 'Vigília'];
const AI_ATTACK = ['Horda', 'Enxame', 'Maré', 'Vanguarda'];

export class Sim {
  w: WorldDef;
  time = 0; tick = 0; paused = false; speed = 1;
  // entities
  alive = new Uint8Array(CAP); gen = new Uint16Array(CAP); kind = new Uint8Array(CAP); col = new Int16Array(CAP).fill(-1);
  set = new Uint8Array(CAP); rooted = new Uint8Array(CAP); grp = new Int16Array(CAP).fill(-1); warned = new Uint8Array(CAP);
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
  queues = new Map<number, { kind: Kind; t: number }[]>();   // per mother cell
  groups = new Map<number, Group>(); nextGroup = 1;
  allMothers: number[] = [];
  deaths: number[] = [];       // x, y, set, kind (for death bursts)
  msg: string | null = null; msgAt = 0; won = false;
  r: () => number;
  neutralTarget = { bac: 1300, dia: 240, ame: 10 };
  neutralCount = { bac: 0, dia: 0, ame: 0 };
  goals = { food: false, divide: false, photo: false, node: false, colony: false, rival: false, big: false };

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
        food: i === 0 ? 120 : 100, energy: i === 0 ? 60 : 50, pop: 0, cap: 0, counts: new Array(8).fill(0),
        mothers: 0, nodes: 0, builder: -1,
        aggr: 0.25 + r() * 0.75, greed: 0.3 + r() * 0.7, prefs: [r(), r(), r()], nextThink: r() * 2,
        target: -1, targetMother: -1, power: 0, area: 0, kills: 0, lost: 0, born: 0, founded: 0,
        emitters: [], motherList: [], hx: list[0].x, hy: list[0].y, seedSite: null, seedAt: 0, defGroup: -1, atkGroup: -1,
      };
      this.nations.push(N);
      list.forEach((h, j) => {
        const m = this.spawn(Kind.MOTHER, i, h.x, h.y);
        this.root(m, false);
        this.grow[m] = 160;
        const start: Kind[] = j > 0 ? [Kind.WORKER, Kind.WORKER] : i === 0 ? [Kind.WORKER, Kind.WORKER, Kind.WORKER, Kind.PHOTO, Kind.SCOUT] : [Kind.WORKER, Kind.WORKER, Kind.WORKER, Kind.PHOTO];
        start.forEach((k2, q) => { const a = (q / start.length) * Math.PI * 2; this.spawn(k2, i, h.x + Math.cos(a) * 60, h.y + Math.sin(a) * 60); });
      });
    });
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
    this.hp[i] = K.hp; this.sat[i] = k === Kind.SCOUT ? 80 : k === Kind.MOTHER ? 120 : 40; this.cd[i] = 0; this.carry[i] = 0;
    this.task[i] = T_IDLE; this.stance[i] = ST_AUTO; this.manual[i] = 0; this.tgt[i] = -1; this.rooted[i] = 0; this.grp[i] = -1; this.warned[i] = 0;
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
  /** a mother cell settles: a colony is founded */
  root(m: number, announce = true) {
    const N = this.nations[this.col[m]];
    this.rooted[m] = 1; N.mothers++; N.cap += 8;
    this.task[m] = T_IDLE; this.manual[m] = 0; this.vx[m] = 0; this.vy[m] = 0;
    this.grow[m] = Math.max(this.grow[m], 60); this.ax[m] = this.x[m]; this.ay[m] = this.y[m];
    if (this.grp[m] >= 0) this.grp[m] = -1;
    if (!this.queues.has(m)) this.queues.set(m, []);
    if (announce) { N.founded++; if (N.player) this.say(`Nova colônia fundada! (${N.mothers} colônias)`); }
  }
  kill(i: number, by = -1) {
    if (!this.alive[i]) return;
    const k = this.kind[i] as Kind, c = this.col[i];
    this.alive[i] = 0; this.free.push(i); this.count--;
    this.deaths.push(this.x[i], this.y[i], this.set[i], k);
    const drop = [3, 2, 5, 4, 7, 5, 26, 10, 1, 4, 12][k] ?? 2;
    for (let j = 0; j < drop; j++) this.addMote(this.x[i] + (this.r() - 0.5) * KINDS[k].r * 2, this.y[i] + (this.r() - 0.5) * KINDS[k].r * 2, 4 + this.r() * 3, -1);
    if (k === Kind.BACTERIA) this.neutralCount.bac--; else if (k === Kind.DIATOM) this.neutralCount.dia--; else if (k === Kind.AMOEBA) this.neutralCount.ame--;
    if (c < 0) return;
    const N = this.nations[c];
    N.pop -= KINDS[k].pop; N.counts[k]--; N.lost++;
    if (k === Kind.NODE) { N.nodes--; N.cap -= 6; }
    if (N.builder === i) N.builder = -1;
    if (k === Kind.MOTHER) {
      N.motherList = N.motherList.filter(m => m !== i);
      if (this.rooted[i]) { N.mothers--; N.cap -= 8; }
      this.queues.delete(i);
      const killer = by >= 0 ? this.col[by] : -1;
      if (killer >= 0 && this.rooted[i]) {
        this.nations[killer].kills++;
        if (killer === 0) this.say(`Colônia rival destruída! (${this.nations[0].kills})`);
      }
      if (N.counts[Kind.MOTHER] <= 0) {
        N.alive = false;
        if (N.player) this.say('Sua última célula-mãe morreu. A espécie está condenada.');
      } else if (N.player && this.rooted[i]) this.say('Uma das suas colônias caiu!');
    }
  }
  say(m: string) { this.msg = m; this.msgAt = this.time; }

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
      const fd = F[f], capN = fd.rate * 16;
      if (this.fieldCount[f] >= capN) continue;
      let n = fd.rate * dt * 0.9;
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

  // relations: every nation is at war with the others; the wild amoebas eat anyone
  hostile(a: number, b: number): boolean {
    const ca = this.col[a], cb = this.col[b];
    if (ca === cb) return ca === -1 ? (this.kind[a] === Kind.AMOEBA) !== (this.kind[b] === Kind.AMOEBA) : false;
    if (ca < 0 || cb < 0) return this.kind[a] === Kind.AMOEBA || this.kind[b] === Kind.AMOEBA;
    return true;
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
    if (this.tick % 10 === 0) { this.updateBiofilm(); this.spawnMotes(0.5); this.moteDecay(0.5); this.respawnNeutral(); }
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
      const maxR = k === Kind.MOTHER ? 300 : 240;
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
      const [fx, fy] = flowAt(this.mx[i], this.my[i], this.time);
      this.mx[i] = clampW(this.mx[i] + fx * dt * 0.5); this.my[i] = clampW(this.my[i] + fy * dt * 0.5);
    }
  }
  respawnNeutral() {
    const t = this.neutralTarget, n = this.neutralCount;
    for (let k = 0; k < 6 && n.bac < t.bac; k++) this.spawnNeutral(Kind.BACTERIA);
    if (n.dia < t.dia && this.r() < 0.5) this.spawnNeutral(Kind.DIATOM);
    if (n.ame < t.ame && this.r() < 0.02) this.spawnNeutral(Kind.AMOEBA);
  }

  // --- production ------------------------------------------------------------------------------------------------------------
  rootedMothers(N: Nation) { return N.motherList.filter(m => this.alive[m] && this.rooted[m]); }
  produce(N: Nation, dt: number) {
    for (const m of N.motherList) {
      if (!this.alive[m] || !this.rooted[m]) continue;
      // each colony's own metabolism: a trickle so a nation never locks up
      N.food += 0.8 * dt; N.energy += 0.8 * dt;
      const q = this.queues.get(m)?.[0];
      if (!q) continue;
      const K = KINDS[q.kind];
      if (N.pop + K.pop > N.cap) continue;
      q.t += dt;
      if (q.t < K.time) continue;
      this.queues.get(m)!.shift();
      const a = this.ang[m] + Math.PI + (this.r() - 0.5) * 1.5;
      const i = this.spawn(q.kind, N.id, this.x[m] + Math.cos(a) * 34, this.y[m] + Math.sin(a) * 34);
      if (i < 0) continue;
      N.born++;
      this.vx[i] = Math.cos(a) * 40; this.vy[i] = Math.sin(a) * 40;
      this.ax[i] = this.x[m] + Math.cos(a) * 90; this.ay[i] = this.y[m] + Math.sin(a) * 90;
      if (q.kind === Kind.MOTHER) {
        this.warned[i] = 1;   // no complaint before the player has moved her
        if (N.player) this.say('Nova célula-mãe! Leve-a a um espaço livre para fundar uma colônia.');
        else if (N.seedSite) { this.task[i] = T_MOVE; this.gx[i] = N.seedSite.x; this.gy[i] = N.seedSite.y; this.manual[i] = 1; }
      } else if (!N.player && isMil(q.kind)) this.joinGroup(i, this.aiGroup(N, 1));
    }
  }
  canTrain(N: Nation, k: Kind) { const K = KINDS[k]; return N.food >= K.food && N.energy >= K.energy; }
  train(N: Nation, m: number, k: Kind) {
    const q = this.queues.get(m);
    if (!q || q.length >= 6 || !this.canTrain(N, k)) return false;
    N.food -= KINDS[k].food; N.energy -= KINDS[k].energy; q.push({ kind: k, t: 0 });
    return true;
  }
  capital(N: Nation): number { for (const m of N.motherList) if (this.alive[m] && this.rooted[m]) return m; return N.motherList.find(m => this.alive[m]) ?? -1; }

  // --- groups ------------------------------------------------------------------------------------------------------------------
  newGroup(nation: number, name: string, color: string, ai: number, key = 0): Group {
    const g: Group = { id: this.nextGroup++, nation, name, color, stance: ST_AUTO, key, ai, n: 0, cx: 0, cy: 0 };
    this.groups.set(g.id, g);
    return g;
  }
  joinGroup(i: number, g: number) { this.grp[i] = g; }
  /** the AI's guard (1) or attack (2) group of a nation, created on demand */
  aiGroup(N: Nation, ai: 1 | 2): number {
    const id = ai === 1 ? N.defGroup : N.atkGroup;
    if (id >= 0 && this.groups.has(id)) return id;
    const sp = this.w.species[N.species];
    const name = `${(ai === 1 ? AI_GUARD : AI_ATTACK)[N.id % 4]} ${sp.genus}`;
    const g = this.newGroup(N.id, name, ai === 1 ? '#94a3b8' : '#f87171', ai);
    g.stance = ai === 1 ? ST_DEFEND : ST_HUNT;
    if (ai === 1) N.defGroup = g.id; else N.atkGroup = g.id;
    return g.id;
  }

  // --- nation brain --------------------------------------------------------------------------------------------------------------
  nationThink(N: Nation) {
    const cap = this.capital(N);
    if (cap >= 0) { N.hx = this.x[cap]; N.hy = this.y[cap]; }
    const cnt = N.counts;
    const mil = cnt[Kind.HUNTER] + cnt[Kind.ARMOR] + cnt[Kind.SPITTER];
    N.power = cnt[Kind.HUNTER] * 3 + cnt[Kind.ARMOR] * 4 + cnt[Kind.SPITTER] * 3 + N.mothers * 4;
    if (N.player) return;
    const colonies = this.rootedMothers(N);
    if (!colonies.length) {
      // a lone travelling mother: root wherever she can
      return;
    }
    // --- economy: every colony keeps dividing, the nation shares the stock
    const M = colonies.length;
    const wantW = Math.min(60, 3 * M + N.nodes * 2 + 1), wantP = M + Math.floor(N.nodes / 2);
    const wantMil = Math.floor(Math.min(M * 4 + N.nodes * 3, this.time / 60 * N.aggr * 2 * M + N.nodes * 2 * N.aggr));
    const seeding = N.seedSite !== null && this.time - N.seedAt < 150;
    for (const m of colonies) {
      const q = this.queues.get(m)!;
      if (q.length >= 2) continue;
      let k: Kind | -1 = -1;
      if (cnt[Kind.WORKER] < wantW && !(N.builder >= 0 && cnt[Kind.WORKER] >= 3)) k = Kind.WORKER;
      else if (cnt[Kind.PHOTO] < wantP) k = Kind.PHOTO;
      else if (mil < wantMil) { const p = N.prefs, s = p[0] + p[1] + p[2], u = this.r() * s; k = u < p[0] ? Kind.HUNTER : u < p[0] + p[1] ? Kind.SPITTER : Kind.ARMOR; }
      else if (cnt[Kind.SCOUT] < 1 && this.time > 60) k = Kind.SCOUT;
      // keep a reserve for the next colony
      if (k >= 0 && seeding && N.food < KINDS[Kind.MOTHER].food + 40 && k !== Kind.WORKER) k = -1;
      if (k >= 0 && N.pop + KINDS[k].pop <= N.cap) this.train(N, m, k as Kind);
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
      const g = N.defGroup;
      for (let i = 0; i < this.top; i++) {
        if (!this.alive[i] || this.col[i] !== N.id || this.grp[i] !== g || this.task[i] === T_ATTACK) continue;
        if ((this.x[i] - this.x[m]) ** 2 + (this.y[i] - this.y[m]) ** 2 > 1600 * 1600) continue;
        this.task[i] = T_AMOVE; this.manual[i] = 2; this.gx[i] = this.ax[i] = this.x[m] + (this.r() - 0.5) * 120; this.gy[i] = this.ay[i] = this.y[m] + (this.r() - 0.5) * 120;
      }
      break;
    }
    // --- war: the attack group raids the nearest colony of a weaker neighbour
    if (N.target >= 0) {
      const T = this.nations[N.target];
      const atk = this.members(N.atkGroup);
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
    } else if (mil >= 5 && this.time > 60 + (1 - N.aggr) * 180 && this.r() < 0.1 * N.aggr) {
      let best = -1, bm = -1, bd = 2600;
      for (const o of this.nations) {
        if (!o.alive || o.id === N.id || o.power >= N.power * (0.6 + N.aggr * 0.6)) continue;
        if (o.player && this.time < GRACE) continue;
        for (const m of o.motherList) {
          if (!this.alive[m]) continue;
          for (const h of colonies) { const d = Math.hypot(this.x[m] - this.x[h], this.y[m] - this.y[h]); if (d < bd) { bd = d; best = o.id; bm = m; } }
        }
      }
      if (best >= 0) {
        N.target = best; N.targetMother = bm;
        // most of the guard marches; a garrison stays home
        const guard = this.members(N.defGroup).sort((a, b) => ((this.x[a] - this.x[bm]) ** 2 + (this.y[a] - this.y[bm]) ** 2) - ((this.x[b] - this.x[bm]) ** 2 + (this.y[b] - this.y[bm]) ** 2));
        const go = guard.slice(0, Math.ceil(guard.length * 0.7));
        const ag = this.aiGroup(N, 2);
        for (const i of go) this.grp[i] = ag;
        this.march(go, this.x[bm], this.y[bm]);
      }
    }
  }
  members(g: number): number[] {
    const out: number[] = [];
    if (g < 0) return out;
    for (let i = 0; i < this.top; i++) if (this.alive[i] && this.grp[i] === g) out.push(i);
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
    const def = this.aiGroup(N, 1);
    for (const i of this.members(N.atkGroup)) {
      this.grp[i] = def; this.task[i] = T_IDLE; this.manual[i] = 0; this.tgt[i] = -1;
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
    return this.nearest(x, y, 150, j => this.kind[j] === Kind.NODE || this.kind[j] === Kind.MOTHER) < 0;
  }
  order(i: number, task: number, x: number, y: number) { this.task[i] = task; this.gx[i] = x; this.gy[i] = y; this.tgt[i] = -1; }

  // --- units -------------------------------------------------------------------------------------------------------------------
  valid(j: number, g: number) { return j >= 0 && this.alive[j] && this.gen[j] === g; }
  setTarget(i: number, j: number) { this.tgt[i] = j; this.tgen[i] = this.gen[j]; }

  unitThink(i: number) {
    const k = this.kind[i] as Kind, K = KINDS[k], c = this.col[i];
    const x = this.x[i], y = this.y[i];
    if (k === Kind.NODE || k === Kind.DIATOM) return;
    // wild life
    if (c < 0) {
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
    if (this.manual[i] && (this.task[i] === T_MOVE || this.task[i] === T_ATTACK || this.task[i] === T_BUILD)) return;
    // hungry and away from the biofilm: go back and eat (units on direct orders push on and may starve)
    if (!this.manual[i] && this.task[i] !== T_RETURN && this.task[i] !== T_BUILD && this.sat[i] < (k === Kind.SCOUT ? 30 : 16) && this.bioOwner(x, y) !== c) { this.goHome(i); return; }
    const stance = this.stance[i];
    const retaliate = this.time - this.hitAt[i] < 3 && this.valid(this.hitBy[i], this.gen[this.hitBy[i]]) ? this.hitBy[i] : -1;
    if (k === Kind.WORKER && (stance === ST_AUTO || stance === ST_GATHER)) {
      if (this.task[i] === T_BUILD) return;
      if (retaliate >= 0 || this.time - this.hitAt[i] < 2) { this.goHome(i); return; }
      if (this.task[i] === T_RETURN) return;
      if (this.carry[i] >= 10) { this.goHome(i); return; }
      const mj = this.nearestMote(this.ax[i], this.ay[i], 420);
      const mj2 = mj >= 0 ? mj : this.nearestMote(x, y, 420);
      if (mj2 >= 0) { this.task[i] = T_GATHER; this.gx[i] = this.mx[mj2]; this.gy[i] = this.my[mj2]; this.tgt[i] = mj2; return; }
      if (this.carry[i] > 0) { this.goHome(i); return; }
      // nothing near: head for the nutrient field closest to the nearest colony
      const [hx, hy] = this.homeOf(i);
      let bf = -1, bd = 1e12;
      this.w.fields.forEach((f, fi) => { const d = (f.x - hx) ** 2 + (f.y - hy) ** 2 + (this.fieldCount[fi] < 3 ? 1e7 : 0); if (d < bd) { bd = d; bf = fi; } });
      if (bf >= 0) { const f = this.w.fields[bf]; this.ax[i] = f.x; this.ay[i] = f.y; this.task[i] = T_MOVE; this.gx[i] = f.x + (this.r() - 0.5) * f.r; this.gy[i] = f.y + (this.r() - 0.5) * f.r; }
      return;
    }
    if (k === Kind.PHOTO && stance === ST_AUTO) {
      if (retaliate >= 0) { this.goHome(i); return; }
      // bask in the brightest spot of the own biofilm
      if (this.bioOwner(x, y) === c && this.inLight(x, y)) { if (this.task[i] !== T_WANDER || Math.hypot(this.gx[i] - x, this.gy[i] - y) < 6) this.wander(i, 40); return; }
      const [hx, hy] = this.homeOf(i);
      let best: [number, number] | null = null, bd = 1e12;
      for (const l of this.w.lights) {
        const d = Math.hypot(l.x - hx, l.y - hy);
        if (d > 900) continue;
        const a = Math.atan2(l.y - hy, l.x - hx), reach = Math.min(d, 230);
        const px = hx + Math.cos(a) * reach, py = hy + Math.sin(a) * reach;
        if (Math.hypot(px - l.x, py - l.y) < l.r && d < bd) { bd = d; best = [px, py]; }
      }
      if (best) { this.task[i] = T_MOVE; this.gx[i] = best[0] + (this.r() - 0.5) * 60; this.gy[i] = best[1] + (this.r() - 0.5) * 60; }
      else if (this.bioOwner(x, y) !== c) this.goHome(i);
      else if (this.task[i] === T_IDLE) this.wander(i, 60);
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
    // metabolism: heal on the own biofilm, burn reserve outside it, starve when it runs out
    if (c >= 0) {
      const N = this.nations[c];
      const home = N.alive && this.bioOwner(x, y) === c;
      const settled = (k === Kind.MOTHER && this.rooted[i]) || k === Kind.NODE;
      if (home) { this.sat[i] = Math.min(k === Kind.SCOUT ? 80 : k === Kind.MOTHER ? 120 : 40, this.sat[i] + 6 * dt); if (this.hp[i] < K.hp && this.time - this.hitAt[i] > 2) this.hp[i] = Math.min(K.hp, this.hp[i] + K.hp * 0.02 * dt); }
      else if (!settled) { this.sat[i] -= dt; if (this.sat[i] <= 0) { this.sat[i] = 0; this.hp[i] -= Math.max(1.5, K.hp * 0.02) * dt; if (this.hp[i] <= 0) { this.kill(i); return; } } }
      if (!N.alive && settled) { this.hp[i] -= 6 * dt; if (this.hp[i] <= 0) { this.kill(i); return; } }
      if (k === Kind.PHOTO && home) N.energy += (this.inLight(x, y) ? 2.4 : 1.2) * dt;
      if (k === Kind.NODE) N.food += 0.15 * dt;
    }
    // vents scald what swims too close
    if (this.tick % 5 === 0) for (const v of this.w.vents) { const d = Math.hypot(v.x - x, v.y - y); if (d < v.r + 16) { this.hp[i] -= 3 * dt * 5; if (this.hp[i] <= 0) { this.kill(i); return; } } }
    this.cd[i] -= dt;
    const t = this.task[i];
    if (t === T_GATHER) {
      const mj = this.tgt[i];
      if (mj < 0 || !this.malive[mj]) { this.task[i] = T_IDLE; this.tgt[i] = -1; return; }
      this.gx[i] = this.mx[mj]; this.gy[i] = this.my[mj];
      if ((this.mx[mj] - x) ** 2 + (this.my[mj] - y) ** 2 < (K.r + 5) ** 2) {
        this.carry[i] = Math.min(12, this.carry[i] + this.mamt[mj]); this.eatMote(mj); this.tgt[i] = -1; this.task[i] = T_IDLE;
        this.ax[i] = x; this.ay[i] = y;
        if (this.carry[i] >= 10) this.goHome(i);
      }
    } else if (t === T_RETURN) {
      if (this.bioOwner(x, y) === c) {
        const N = this.nations[c];
        if (this.carry[i] > 0) { N.food += this.carry[i]; this.carry[i] = 0; }
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
      if (k === Kind.MOTHER) {
        // a mother cell only strikes what touches it, it never chases
        this.gx[i] = x; this.gy[i] = y;
        if (d > K.range + 6) { this.task[i] = T_IDLE; this.tgt[i] = -1; }
        else if (this.cd[i] <= 0) { this.cd[i] = K.cd; this.strike(i, j); }
        return;
      }
      if (d <= K.range + 2) {
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
  strike(i: number, j: number) {
    const k = this.kind[i] as Kind, K = KINDS[k];
    if (k === Kind.SPITTER) { this.shoot(i, j, K.dmg); return; }
    // engulf: a hunter swallows a wounded cell no bigger than itself
    const kj = this.kind[j] as Kind;
    if ((k === Kind.HUNTER || k === Kind.AMOEBA) && kj !== Kind.MOTHER && kj !== Kind.NODE && KINDS[kj].r <= K.r * 1.05 && this.hp[j] < KINDS[kj].hp * 0.3) {
      this.hp[i] = Math.min(K.hp, this.hp[i] + KINDS[kj].hp * 0.5);
      if (this.col[i] >= 0) this.nations[this.col[i]].food += 6;
      this.kill(j, i);
      if (k === Kind.AMOEBA) { this.cd[i] = 8; this.task[i] = T_IDLE; this.tgt[i] = -1; }
      return;
    }
    this.damage(j, K.dmg, i);
  }
  damage(j: number, dmg: number, by: number) {
    const d = Math.max(1, dmg - KINDS[this.kind[j]].armor);
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
    const n = this.spawn(Kind.NODE, c, x, y);
    if (n >= 0) this.grow[n] = 40;
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
      const speed = k === Kind.MOTHER && !this.rooted[i] ? 36 : K.speed;
      if (speed > 0 && t !== T_IDLE) {
        const dx = this.gx[i] - this.x[i], dy = this.gy[i] - this.y[i], d = Math.hypot(dx, dy);
        const sp = speed * (t === T_WANDER ? 0.45 : 1) * (this.sat[i] <= 0 ? 0.6 : 1);
        if (d > 1) { const f = Math.min(1, d / 30); dvx = (dx / d) * sp * f; dvy = (dy / d) * sp * f; }
      }
      const [fx, fy] = flowAt(this.x[i], this.y[i], this.time);
      const drift = k === Kind.NODE || (k === Kind.MOTHER && this.rooted[i]) ? 0 : this.col[i] < 0 ? 1 : 0.5;
      const a = 1 - Math.exp(-dt * 5);
      this.vx[i] += (dvx + fx * drift - this.vx[i]) * a; this.vy[i] += (dvy + fy * drift - this.vy[i]) * a;
      if (k === Kind.NODE) { this.vx[i] = 0; this.vy[i] = 0; }
      this.x[i] = clampW(this.x[i] + this.vx[i] * dt); this.y[i] = clampW(this.y[i] + this.vy[i] * dt);
      let hx = dvx, hy = dvy;
      if (t === T_ATTACK && this.tgt[i] >= 0 && this.alive[this.tgt[i]]) { hx = this.x[this.tgt[i]] - this.x[i]; hy = this.y[this.tgt[i]] - this.y[i]; }
      if (hx * hx + hy * hy > 4 && k !== Kind.NODE) {
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
      const mi = massOf(this.kind[i]);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cx = bx + ox, cy = by + oy;
        if (cx < 0 || cy < 0 || cx >= HN || cy >= HN) continue;
        for (let j = this.head[cy * HN + cx]; j >= 0; j = this.next[j]) {
          if (j <= i || !this.alive[j]) continue;
          const rr = ri + KINDS[this.kind[j]].r;
          const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i], d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), o = (rr - d) * 0.5, nx = dx / d, ny = dy / d;
          const mj = massOf(this.kind[j]), wi = mj / (mi + mj), wj = mi / (mi + mj);
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
  checkGoals() {
    const P = this.nations[0];
    if (this.tick % 10) return;
    const g = this.goals;
    if (!g.food && P.food >= 200) g.food = true;
    if (!g.divide && P.born > 0) g.divide = true;
    if (!g.node && P.nodes > 0) g.node = true;
    if (!g.colony && P.founded > 0) g.colony = true;
    if (!g.photo) for (let i = 0; i < this.top; i++) if (this.alive[i] && this.col[i] === 0 && this.kind[i] === Kind.PHOTO && this.inLight(this.x[i], this.y[i]) && this.bioOwner(this.x[i], this.y[i]) === 0) { g.photo = true; break; }
    if (!g.rival && P.kills > 0) g.rival = true;
    const cells = P.counts.reduce((a, b) => a + b, 0);
    if (!g.big && cells >= 80) g.big = true;
    if (!this.won && g.big && g.rival && g.colony) { this.won = true; this.say('A sua espécie domina a poça!'); }
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
          if (k === Kind.NODE || (k === Kind.MOTHER && this.rooted[i])) return;
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
        for (const i of cmd.ids.filter(mine)) { if (!KINDS[this.kind[i]].dmg || this.kind[i] === Kind.MOTHER) continue; this.setTarget(i, cmd.target); this.task[i] = T_ATTACK; this.manual[i] = 1; }
        break;
      }
      case 'stance':
        for (const i of cmd.ids.filter(mine)) { this.stance[i] = cmd.stance; this.manual[i] = 0; if (this.task[i] !== T_ATTACK) this.task[i] = T_IDLE; this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; }
        if (cmd.group !== undefined) { const g = this.groups.get(cmd.group); if (g && g.nation === 0) g.stance = cmd.stance; }
        break;
      case 'train': {
        const m = cmd.mother !== undefined && mine(cmd.mother) && this.kind[cmd.mother] === Kind.MOTHER && this.rooted[cmd.mother] ? cmd.mother : this.capital(P);
        if (m < 0 || !this.rooted[m]) { this.say('Nenhuma célula-mãe fixada para dividir.'); break; }
        if (!this.train(P, m, cmd.kind)) this.say((this.queues.get(m)?.length ?? 0) >= 6 ? 'Fila de divisão cheia.' : 'Nutrientes ou energia insuficientes.');
        break;
      }
      case 'cancel': {
        const q = this.queues.get(cmd.mother)?.[cmd.index];
        if (q && mine(cmd.mother)) { P.food += KINDS[q.kind].food; P.energy += KINDS[q.kind].energy; this.queues.get(cmd.mother)!.splice(cmd.index, 1); }
        break;
      }
      case 'node': {
        const i = cmd.id;
        if (!mine(i) || this.kind[i] !== Kind.WORKER) break;
        if (!this.nodeSpotOk(0, cmd.x, cmd.y)) { this.say('O nódulo precisa tocar o seu biofilme, longe de outros nódulos e rochas.'); break; }
        this.order(i, T_BUILD, cmd.x, cmd.y); this.manual[i] = 1;
        break;
      }
      case 'group': {
        const ids = cmd.ids.filter(i => mine(i) && this.kind[i] !== Kind.NODE && !(this.kind[i] === Kind.MOTHER && this.rooted[i]));
        if (!ids.length) break;
        const g = this.newGroup(0, cmd.name.slice(0, 24) || `Grupo ${this.nextGroup}`, cmd.color, 0, cmd.key);
        // a hotkey belongs to one group only
        if (cmd.key) for (const o of this.groups.values()) if (o !== g && o.nation === 0 && o.key === cmd.key) o.key = 0;
        for (const i of ids) this.grp[i] = g.id;
        g.stance = this.stance[ids[0]];
        break;
      }
      case 'groupAdd': {
        const g = this.groups.get(cmd.group);
        if (!g || g.nation !== 0) break;
        for (const i of cmd.ids) if (mine(i) && this.kind[i] !== Kind.NODE && !(this.kind[i] === Kind.MOTHER && this.rooted[i])) { this.grp[i] = g.id; this.stance[i] = g.stance; }
        break;
      }
      case 'groupDel': {
        const g = this.groups.get(cmd.group);
        if (!g || g.nation !== 0) break;
        for (let i = 0; i < this.top; i++) if (this.grp[i] === g.id) this.grp[i] = -1;
        this.groups.delete(g.id);
        break;
      }
      case 'pause': this.paused = cmd.on; break;
      case 'speed': this.speed = Math.max(1, Math.min(4, Math.round(cmd.k))); break;
    }
  }

  // --- snapshots for the view ---------------------------------------------------------------------------------------------------
  snapshot(): { ents: Float32Array; n: number; motes: Float32Array; nm: number; shots: Float32Array; np: number; deaths: number[] } {
    const n = this.top, ents = new Float32Array(n * STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (!this.alive[i]) { ents[o + 7] = -1; continue; }
      const k = this.kind[i];
      ents[o] = this.x[i]; ents[o + 1] = this.y[i]; ents[o + 2] = this.ang[i];
      ents[o + 3] = this.set[i] * 16 + k; ents[o + 4] = this.col[i];
      ents[o + 5] = Math.max(0, this.hp[i]) / KINDS[k].hp;
      ents[o + 6] = (this.carry[i] > 0 ? 1 : 0) | (this.time - this.hitAt[i] < 0.15 ? 2 : 0) | (this.sat[i] <= 0 ? 4 : 0) | (this.stance[i] << 4) | (this.task[i] === T_BUILD ? 128 : 0) | (k === Kind.MOTHER && !this.rooted[i] ? 256 : 0);
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
    return { ents, n, motes, nm, shots, np, deaths };
  }
  /** group sizes and centres (the player's groups + the AI's armies); empty groups are dropped */
  groupTable(): Group[] {
    for (const g of this.groups.values()) { g.n = 0; g.cx = 0; g.cy = 0; }
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.grp[i] < 0) continue;
      const g = this.groups.get(this.grp[i]);
      if (!g) { this.grp[i] = -1; continue; }
      g.n++; g.cx += this.x[i]; g.cy += this.y[i];
    }
    const out: Group[] = [];
    for (const g of [...this.groups.values()]) {
      if (!g.n) { this.groups.delete(g.id); continue; }
      g.cx /= g.n; g.cy /= g.n;
      out.push({ ...g });
    }
    return out;
  }
  stats(): Stats {
    const P = this.nations[0];
    const msg = this.msg && this.time - this.msgAt < 4 ? this.msg : null;
    return {
      time: this.time, food: P.food, energy: P.energy, pop: P.pop, cap: P.cap, alive: P.alive,
      counts: P.counts.slice(), nodes: P.nodes, colonies: P.mothers, area: P.area, kills: P.kills, lost: P.lost, founded: P.founded,
      nationsAlive: this.nations.filter(n => n.alive).length, msg, won: this.won,
      mothers: P.motherList.filter(m => this.alive[m]).map(m => ({ id: m, x: this.x[m], y: this.y[m], rooted: !!this.rooted[m], queue: (this.queues.get(m) ?? []).map((q, i) => ({ kind: q.kind, p: i === 0 ? q.t / KINDS[q.kind].time : 0 })) })),
      groups: this.groupTable(),
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

const isMil = (k: number) => k === Kind.HUNTER || k === Kind.ARMOR || k === Kind.SPITTER;
const massOf = (k: number) => (k === Kind.NODE ? 1e4 : k === Kind.MOTHER ? 60 : k === Kind.ARMOR ? 6 : k === Kind.AMOEBA ? 20 : k === Kind.DIATOM ? 3 : 1);
export { TRAINABLE };
