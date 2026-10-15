// The creature eras' simulation (runs in `rts.worker.ts`): the whole home planet at map resolution (`PlanetGrid`),
// every nation of creatures (the player's lineage and rival species), their castes, nests / dens and sentinels,
// the wild life (prey schools / herds, predators, leviathans), food fields, combat, evolution research, the
// rivals' AI and - in the aquatic era - the oxygen that pushes the planet's life stage (plants creep up the coasts,
// then inland). World px everywhere (x wraps around the planet); one grid cell = one map px = CELL world px.
import type { PlanetGrid } from '../../planet-generator/workerProtocol';
import { WORLD_TILES_X, TILE } from '../../terrain/types';
import { mulberry, seedToInt, vnoise } from '../../terrain/noise';
import { vegAmount } from '../../planet-generator/lifeStage';
import { defsFor, NO_NATION, Ord, SNAP, F_VISIBLE, F_CARRY, F_WILD, F_ATTACK, Wild, type RtsDefs, type RtsMode, type WildSpecies, type NationInfo, type NationStats } from './defs';
import type { CreatureParams } from '../../creature/genome';

export const WX = WORLD_TILES_X * TILE;
const CAP = 6000, BCAP = 600;
/** AI does not raid the player during the first minutes */
const GRACE = 180;
const HASH = 1 << 16, HMASK = HASH - 1, HC = 256;

export interface SimInit {
  mode: RtsMode; grid: PlanetGrid; seed: string; lifeStage: number; alien: boolean;
  player: { name: string; seed: string; params: CreatureParams; x: number; y: number };
  rivals: number;
  wild: WildSpecies[];
  save?: RtsSave | null;
  /** carried from the previous era */
  dna?: number; techs?: string[];
}
export interface RtsSave {
  t: number; o2: number; nations: SavedNation[];
  units: number[]; buildings: number[];
}
interface SavedNation { info: NationInfo; food: number; dna: number; techs: string[]; research: { id: string; p: number } | null }

interface Nation {
  info: NationInfo; food: number; dna: number; techs: Set<string>; research: { id: string; p: number } | null;
  pop: number; cap: number; upkeep: number; income: number; incomeAcc: number;
  ai: { t: number; attackT: number; target: number; expandT: number; towerT: number } | null;
  alive: boolean;
}
export interface SimEvent { k: 'death' | 'hit' | 'shot' | 'built' | 'trained' | 'msg' | 'won' | 'lost'; x?: number; y?: number; x2?: number; y2?: number; n?: number; text?: string }

export class RtsSim {
  readonly mode: RtsMode;
  readonly defs: RtsDefs;
  readonly grid: PlanetGrid;
  readonly WY: number;
  readonly CELL: number;
  t = 0; o2 = 0; speed = 1; paused = false;
  lifeStage: number;
  private life0: number;
  nations: Nation[] = [];
  wild: WildSpecies[];
  // --- units ---
  alive = new Uint8Array(CAP); kind = new Uint8Array(CAP); nation = new Uint8Array(CAP);
  x = new Float64Array(CAP); y = new Float64Array(CAP); vx = new Float32Array(CAP); vy = new Float32Array(CAP);
  hp = new Float32Array(CAP); maxhp = new Float32Array(CAP);
  ord = new Uint8Array(CAP); tx = new Float64Array(CAP); ty = new Float64Array(CAP); tgt = new Int32Array(CAP).fill(-1); tgtB = new Int32Array(CAP).fill(-1);
  carry = new Float32Array(CAP); cd = new Float32Array(CAP); home = new Int32Array(CAP).fill(-1);
  dir = new Uint8Array(CAP); anim = new Uint8Array(CAP); role = new Uint8Array(CAP); stuck = new Float32Array(CAP); gatherT = new Float32Array(CAP);
  buildType = new Int8Array(CAP).fill(-1); flee = new Float32Array(CAP);
  paths = new Map<number, number[]>();
  private free: number[] = [];
  count = 0;
  // --- buildings ---
  balive = new Uint8Array(BCAP); btype = new Uint8Array(BCAP); bnation = new Uint8Array(BCAP);
  bx = new Float64Array(BCAP); by = new Float64Array(BCAP); bhp = new Float32Array(BCAP); bmaxhp = new Float32Array(BCAP); bcd = new Float32Array(BCAP);
  bqueue: { caste: number; t: number }[][] = Array.from({ length: BCAP }, () => []);
  brx = new Float64Array(BCAP); bry = new Float64Array(BCAP);
  private bfree: number[] = [];
  // --- spatial hash ---
  private head = new Int32Array(HASH).fill(-1); private next = new Int32Array(CAP).fill(-1);
  // --- food fields (per grid cell) ---
  food: Float32Array; foodMax: Float32Array;
  events: SimEvent[] = [];
  private rnd: () => number;
  private seen = new Set<number>();
  /** the player's sight (for the discovery fog) - world px circles */
  sights: number[] = [];
  won = false; lost = false;

  constructor(init: SimInit) {
    this.mode = init.mode;
    this.defs = defsFor(init.mode);
    this.grid = init.grid;
    this.CELL = WX / init.grid.w;
    this.WY = this.CELL * init.grid.h;
    this.lifeStage = init.lifeStage; this.life0 = init.lifeStage;
    this.wild = init.wild;
    this.rnd = mulberry(seedToInt(init.seed + ':rts:' + init.mode));
    for (let i = CAP - 1; i >= 0; i--) this.free.push(i);
    for (let i = BCAP - 1; i >= 0; i--) this.bfree.push(i);
    const n = init.grid.w * init.grid.h;
    this.food = new Float32Array(n); this.foodMax = new Float32Array(n);
    this.initFood();
    if (init.save) this.load(init.save);
    else this.setup(init);
  }

  // ---------------------------------------------------------------------------------------------------
  // Planet queries
  // ---------------------------------------------------------------------------------------------------
  wrapX(x: number) { return ((x % WX) + WX) % WX; }
  dx(a: number, b: number) { let d = b - a; if (d > WX / 2) d -= WX; else if (d < -WX / 2) d += WX; return d; }
  elevAt(x: number, y: number) {
    const G = this.grid, fx = this.wrapX(x) / this.CELL - 0.5, fy = Math.max(0, Math.min(G.h - 1.001, y / this.CELL - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const xa = ((x0 % G.w) + G.w) % G.w, xb = (xa + 1) % G.w, ya = y0 * G.w, yb = Math.min(G.h - 1, y0 + 1) * G.w;
    const e = G.elev;
    return (e[ya + xa] * (1 - ax) + e[ya + xb] * ax) * (1 - ay) + (e[yb + xa] * (1 - ax) + e[yb + xb] * ax) * ay;
  }
  cellOf(x: number, y: number) {
    const G = this.grid;
    const cx = Math.floor(this.wrapX(x) / this.CELL) % G.w, cy = Math.max(0, Math.min(G.h - 1, Math.floor(y / this.CELL)));
    return cy * G.w + cx;
  }
  isSea(x: number, y: number) { return this.elevAt(x, y) < this.grid.sea; }
  isRiver(x: number, y: number) { return this.grid.river[this.cellOf(x, y)] === 1; }
  /** 0 land, 1 shelf, 2 open sea, 3 abyss */
  zone(x: number, y: number) {
    const e = this.elevAt(x, y), s = this.grid.sea;
    if (e >= s) return 0;
    const dr = (s - e) / Math.max(1e-4, s), [q0, q1] = this.grid.depthQ;
    return dr < q0 ? 1 : dr < q1 ? 2 : 3;
  }
  habitable(x: number, y: number) {
    if (y < this.CELL || y > this.WY - this.CELL) return false;
    if (this.mode === 'aqua') return this.isSea(x, y) || this.isRiver(x, y);
    const e = this.elevAt(x, y);
    return e >= this.grid.sea && e < this.grid.sea + (1 - this.grid.sea) * 0.62;
  }
  /** vegetation (0..1) of a land point at the current life stage */
  veg(x: number, y: number) {
    const c = this.cellOf(x, y), G = this.grid;
    if (this.elevAt(x, y) < G.sea) return 0;
    const dist = G.coast ? G.coast[c] : 0;
    return vegAmount(this.lifeStage, dist, G.moist[c] / 255, vnoise(x / (TILE * 220), y / (TILE * 220), 40));
  }
  siteOk(type: number, x: number, y: number, nation: number) {
    const B = this.defs.buildings[type];
    if (B.site === 'shelf') { if (this.zone(x, y) !== 1) return false; }
    else if (B.site === 'land') { if (!this.habitable(x, y) || this.isSea(x, y)) return false; }
    else {
      // shore: dry land next to the water, with plants around
      if (this.isSea(x, y)) return false;
      let water = false;
      for (let a = 0; a < 8 && !water; a++) if (this.isSea(x + Math.cos(a * 0.785) * 600, y + Math.sin(a * 0.785) * 600)) water = true;
      if (!water || this.veg(x, y) < 0.3) return false;
    }
    for (let b = 0; b < BCAP; b++) {
      if (!this.balive[b]) continue;
      const d = Math.hypot(this.dx(this.bx[b], x), this.by[b] - y);
      if (this.btype[b] === type && d < B.gap) return false;
      // never inside a rival's territory
      if (this.bnation[b] !== nation && d < this.defs.buildings[this.btype[b]].radius + 300) return false;
    }
    return true;
  }

  private initFood() {
    const G = this.grid, n = G.w * G.h;
    for (let i = 0; i < n; i++) {
      const x = (i % G.w + 0.5) * this.CELL, y = (Math.floor(i / G.w) + 0.5) * this.CELL;
      const t = G.temp[i] / 255;
      let r: number;
      if (this.mode === 'aqua') {
        const z = this.zone(x, y);
        r = z === 1 ? 1 : z === 2 ? 0.35 : z === 3 ? 0.08 : G.river[i] ? 0.4 : 0;
        r *= 0.45 + Math.max(0, 1 - Math.abs(t - 0.55) * 1.6) * 0.7;
        r *= 0.6 + vnoise(x / 9000, y / 9000, 33) * 0.8;     // upwellings
      } else {
        r = this.isSea(x, y) ? 0 : (0.2 + this.veg(x, y) * 0.8) * (0.3 + (G.fert[i] / 255) * 0.9);
      }
      this.foodMax[i] = r * 400;
      this.food[i] = this.foodMax[i];
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------------------------------
  spawn(kind: number, nation: number, x: number, y: number): number {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1; this.kind[i] = kind; this.nation[i] = nation;
    this.x[i] = this.wrapX(x); this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0;
    const hp = nation === NO_NATION ? this.wild[kind].hp : this.casteHp(nation, kind);
    this.hp[i] = hp; this.maxhp[i] = hp;
    this.ord[i] = Ord.IDLE; this.tx[i] = x; this.ty[i] = y; this.tgt[i] = -1; this.tgtB[i] = -1; this.carry[i] = 0; this.cd[i] = 0;
    this.home[i] = -1; this.dir[i] = Math.floor(this.rnd() * 8); this.anim[i] = 0; this.role[i] = 0; this.stuck[i] = 0; this.gatherT[i] = 0;
    this.buildType[i] = -1; this.flee[i] = 0;
    this.paths.delete(i);
    this.count++;
    return i;
  }
  kill(i: number) {
    if (!this.alive[i]) return;
    this.alive[i] = 0; this.count--; this.paths.delete(i); this.free.push(i);
  }
  build(type: number, nation: number, x: number, y: number): number {
    const b = this.bfree.pop();
    if (b === undefined) return -1;
    const B = this.defs.buildings[type];
    this.balive[b] = 1; this.btype[b] = type; this.bnation[b] = nation; this.bx[b] = this.wrapX(x); this.by[b] = y;
    this.bhp[b] = B.hp; this.bmaxhp[b] = B.hp; this.bcd[b] = 0; this.bqueue[b] = []; this.brx[b] = x; this.bry[b] = y + 220;
    return b;
  }
  private casteHp(n: number, c: number) {
    const C = this.defs.castes[c], N = this.nations[n];
    return C.hp * (N && (N.techs.has('escamas') || N.techs.has('couro')) ? 1.1 : 1);
  }
  /** a free habitable spot near a point */
  near(x: number, y: number, r: number): [number, number] {
    for (let k = 0; k < 40; k++) {
      const a = this.rnd() * Math.PI * 2, d = this.rnd() * r;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (this.habitable(px, py)) return [px, py];
    }
    return [x, y];
  }

  private setup(init: SimInit) {
    const pal: [number, number, number][] = [[80, 220, 255], [255, 120, 90], [250, 210, 80], [160, 120, 255], [110, 230, 130], [255, 120, 200], [240, 160, 60], [120, 170, 255], [200, 250, 110], [255, 90, 140], [90, 255, 220], [210, 140, 255], [255, 200, 160], [150, 200, 120]];
    const mk = (id: number, name: string, seed: string, params: CreatureParams, ai: boolean): Nation => ({
      info: { id, name, seed, params, color: pal[id % pal.length], ai, alive: true }, food: ai ? 160 : 160, dna: 0, techs: new Set(), research: null,
      pop: 0, cap: 0, upkeep: 0, income: 0, incomeAcc: 0, ai: ai ? { t: this.rnd() * 2, attackT: GRACE * (0.6 + this.rnd() * 0.6), target: -1, expandT: 60 + this.rnd() * 60, towerT: 0 } : null, alive: true,
    });
    const P = init.player;
    const me = mk(0, P.name, P.seed, P.params, false);
    me.dna = init.dna ?? 0;
    for (const t of init.techs ?? []) if (this.defs.techs.some(q => q.id === t)) me.techs.add(t);
    this.nations.push(me);
    const homeB = this.defs.buildings[0];
    // the player's home: snap the start onto a valid site nearby
    let [hx, hy] = [P.x, P.y];
    if (!this.validStart(hx, hy)) [hx, hy] = this.findSite(hx, hy, 12000) ?? [hx, hy];
    this.startNation(0, hx, hy);
    // rivals: a few near the player, the rest spread over the planet
    const placed: [number, number][] = [[hx, hy]];
    const names = rivalNames(init.seed + init.mode, init.rivals);
    for (let r = 0; r < init.rivals; r++) {
      const nearMe = r < 4;
      let site: [number, number] | null = null;
      for (let k = 0; k < 400 && !site; k++) {
        let px: number, py: number;
        if (nearMe) { const a = this.rnd() * Math.PI * 2, d = this.CELL * (16 + this.rnd() * 40); px = hx + Math.cos(a) * d; py = hy + Math.sin(a) * d; }
        else { px = this.rnd() * WX; py = this.WY * (0.12 + this.rnd() * 0.76); }
        if (!this.validStart(px, py)) continue;
        if (placed.some(([qx, qy]) => Math.hypot(this.dx(qx, px), qy - py) < this.CELL * (nearMe ? 14 : 22))) continue;
        site = [px, py];
      }
      if (!site) continue;
      placed.push(site);
      const R = mulberry(seedToInt(`${init.seed}:rival:${init.mode}:${r}`));
      const params: CreatureParams = { gravity: 0.2 + R() * 0.6, temperature: 0.2 + R() * 0.6, water: this.mode === 'aqua' ? 0.8 + R() * 0.2 : 0.2 + R() * 0.6, atmosphere: 0.3 + R() * 0.5, star: 0.35 + R() * 0.4, diet: R(), exotic: init.alien ? 0.4 + R() * 0.5 : R() * 0.35, size: R() };
      const id = this.nations.length;
      this.nations.push(mk(id, names[r], `${init.seed}:rival${r}`, params, true));
      this.startNation(id, site[0], site[1]);
    }
    void homeB;
    // wild life around every start (respawned later)
    for (const [px, py] of placed) this.populateWild(px, py, 14000, 1);
  }
  private validStart(x: number, y: number) { return this.siteOk(0, x, y, 255) && (this.mode === 'aqua' || !this.isSea(x, y)); }
  findSite(x: number, y: number, r: number, type = 0, nation = 255): [number, number] | null {
    for (let k = 0; k < 600; k++) {
      const a = this.rnd() * Math.PI * 2, d = Math.sqrt(this.rnd()) * r;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (this.siteOk(type, px, py, nation)) return [px, py];
    }
    return null;
  }
  private startNation(n: number, x: number, y: number) {
    const b = this.build(0, n, x, y);
    const C = this.defs.castes;
    const start: number[] = [0, 0, 0, 0, 0, 1, 1, 2];
    for (const c of start) {
      const [px, py] = this.near(x, y, 500);
      const u = this.spawn(c, n, px, py);
      if (u >= 0) { this.home[u] = b; if (C[c].gather) this.ord[u] = Ord.GATHER; this.gatherPoint(u); }
    }
  }
  private populateWild(x: number, y: number, r: number, mult: number) {
    const W = this.wild;
    if (!W.length) return;
    const prey = W.filter(w => w.role === Wild.PREY), pred = W.filter(w => w.role === Wild.PREDATOR), lev = W.filter(w => w.role === Wild.LEVIATHAN);
    const place = (sp: WildSpecies, group: number) => {
      for (let k = 0; k < 30; k++) {
        const a = this.rnd() * Math.PI * 2, d = 2500 + this.rnd() * r;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (!this.habitable(px, py)) continue;
        if (this.mode === 'aqua') {
          const z = this.zone(px, py);
          if (sp.zone === 'abyss' ? z !== 3 : sp.zone === 'open' ? z < 2 : z === 0 || z === 3) continue;
        }
        for (let g = 0; g < group; g++) { const [qx, qy] = this.near(px, py, 160); this.spawn(sp.idx, NO_NATION, qx, qy); }
        return;
      }
    };
    for (let k = 0; k < Math.round(7 * mult) && prey.length; k++) place(prey[Math.floor(this.rnd() * prey.length)], 3 + Math.floor(this.rnd() * 4));
    for (let k = 0; k < Math.round(2 * mult) && pred.length; k++) place(pred[Math.floor(this.rnd() * pred.length)], 1);
    if (this.rnd() < 0.7 * mult && lev.length) place(lev[Math.floor(this.rnd() * lev.length)], 1);
  }

  // ---------------------------------------------------------------------------------------------------
  // Orders (player and AI)
  // ---------------------------------------------------------------------------------------------------
  order(ids: number[], o: Ord, x: number, y: number, target = -1, targetB = -1) {
    for (const i of ids) {
      if (!this.alive[i] || this.nation[i] === NO_NATION) continue;
      const C = this.defs.castes[this.kind[i]];
      if (o === Ord.GATHER && !C.gather) o = Ord.AMOVE;
      this.ord[i] = o; this.tx[i] = this.wrapX(x); this.ty[i] = y; this.tgt[i] = target; this.tgtB[i] = targetB;
      this.paths.delete(i); this.stuck[i] = 0; this.flee[i] = 0;
      if (o === Ord.GATHER) this.gatherT[i] = 0;
      if (o !== Ord.BUILD) this.buildType[i] = -1;
    }
    // spread a group around the point
    if ((o === Ord.MOVE || o === Ord.AMOVE) && ids.length > 1) {
      const n = ids.length, cols = Math.ceil(Math.sqrt(n));
      ids.forEach((i, k) => { this.tx[i] = this.wrapX(x + ((k % cols) - (cols - 1) / 2) * 34); this.ty[i] = y + (Math.floor(k / cols) - (cols - 1) / 2) * 34; });
    }
  }
  train(b: number, caste: number, nation: number): string | null {
    if (!this.balive[b] || this.bnation[b] !== nation || !this.defs.buildings[this.btype[b]].trains) return 'Essa construção não gera criaturas';
    const C = this.defs.castes[caste], N = this.nations[nation];
    if (C.req && !N.techs.has(C.req)) return `Requer ${this.techName(C.req)}`;
    if (N.food < C.cost) return 'Comida insuficiente';
    const queued = this.bqueue.reduce((s, q, bi) => s + (this.balive[bi] && this.bnation[bi] === nation ? q.reduce((a, j) => a + this.defs.castes[j.caste].pop, 0) : 0), 0);
    if (N.pop + queued + C.pop > N.cap) return 'População no limite — funde mais ninhais';
    if (this.bqueue[b].length >= 8) return 'Fila cheia';
    N.food -= C.cost;
    this.bqueue[b].push({ caste, t: 0 });
    return null;
  }
  cancel(b: number, nation: number) {
    const q = this.bqueue[b];
    if (!q.length || this.bnation[b] !== nation) return;
    const it = q.pop()!;
    this.nations[nation].food += this.defs.castes[it.caste].cost;
  }
  /** a builder goes to a site and turns into the building (nest, den) or raises it (sentinel) */
  placeBuilding(type: number, x: number, y: number, nation: number, builder?: number): string | null {
    const B = this.defs.buildings[type], N = this.nations[nation];
    if (B.req && !N.techs.has(B.req)) return `Requer ${this.techName(B.req)}`;
    if (N.food < B.cost) return 'Comida insuficiente';
    if (!this.siteOk(type, x, y, nation)) return B.site === 'shelf' ? 'Ninhais só na água rasa da plataforma, longe de outros ninhais e de territórios rivais'
      : B.site === 'shore' ? 'Na margem, em terra, com vegetação em volta (o planeta precisa estar verde até a costa)' : 'Lugar inválido (longe de outras construções iguais e de territórios rivais)';
    let u = builder ?? -1;
    if (u < 0 || !this.alive[u]) {
      let best = 1e18;
      for (let i = 0; i < CAP; i++) {
        if (!this.alive[i] || this.nation[i] !== nation || !this.defs.castes[this.kind[i]].builder || this.ord[i] === Ord.BUILD) continue;
        const d = Math.hypot(this.dx(this.x[i], x), this.y[i] - y);
        if (d < best) { best = d; u = i; }
      }
    }
    if (u < 0) return 'Nenhum forrageador / coletor livre para fundar';
    N.food -= B.cost;
    this.order([u], Ord.BUILD, x, y);
    this.buildType[u] = type;
    return null;
  }
  research(id: string, nation: number): string | null {
    const T = this.defs.techs.find(t => t.id === id), N = this.nations[nation];
    if (!T) return 'Pesquisa desconhecida';
    if (N.techs.has(id)) return 'Já pesquisado';
    if (N.research) return 'Já há uma pesquisa em andamento';
    if (T.req.some(r => !N.techs.has(r))) return 'Requer: ' + T.req.filter(r => !N.techs.has(r)).map(r => this.techName(r)).join(', ');
    if (T.life && this.lifeStage < T.life) return `O planeta precisa de estágio de vida ${Math.round(T.life * 100)}%`;
    if (N.dna < T.dna) return 'DNA insuficiente (cace presas e rivais)';
    if (N.food < T.food) return 'Comida insuficiente';
    N.dna -= T.dna; N.food -= T.food;
    N.research = { id, p: 0 };
    return null;
  }
  techName(id: string) { return this.defs.techs.find(t => t.id === id)?.name ?? id; }

  // ---------------------------------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------------------------------
  tick(dt0: number) {
    if (this.paused) return;
    const dt = dt0 * this.speed;
    this.t += dt;
    this.rehash();
    this.updateNations(dt);
    this.updateBuildings(dt);
    for (let i = 0; i < CAP; i++) if (this.alive[i]) this.updateUnit(i, dt);
    this.regrowFood(dt);
    if (this.mode === 'aqua') {
      let nests = 0;
      for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.btype[b] === 0) nests++;
      const symb = this.nations.reduce((s, n) => s + (n.alive && n.techs.has('simbiose') ? 1 : 0), 0);
      this.o2 += dt * (0.00042 + nests * 0.000012 + symb * 0.00006);
      this.lifeStage = Math.min(0.95, this.life0 + this.o2);
    } else this.lifeStage = Math.min(1, this.lifeStage + dt * 0.00002);
    if (Math.floor(this.t / 10) !== Math.floor((this.t - dt) / 10)) this.keepWild();
    this.vision();
    this.checkEnd();
  }

  private rehash() {
    this.head.fill(-1);
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i]) continue;
      const h = this.hkey(this.x[i], this.y[i]);
      this.next[i] = this.head[h]; this.head[h] = i;
    }
  }
  private hkey(x: number, y: number) { return ((Math.floor(x / HC) * 73856093) ^ (Math.floor(y / HC) * 19349663)) & HMASK; }
  /** calls fn for every unit within r of (x, y) */
  around(x: number, y: number, r: number, fn: (j: number, d: number) => void) {
    const c0 = Math.floor((x - r) / HC), c1 = Math.floor((x + r) / HC), r0 = Math.floor((y - r) / HC), r1 = Math.floor((y + r) / HC);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const h = ((cx * 73856093) ^ (cy * 19349663)) & HMASK;
      for (let j = this.head[h]; j >= 0; j = this.next[j]) {
        const d = Math.hypot(this.dx(x, this.x[j]), this.y[j] - y);
        if (d <= r) fn(j, d);
      }
    }
  }

  private updateNations(dt: number) {
    const N = this.nations;
    for (const n of N) { n.pop = 0; n.cap = 0; n.upkeep = 0; }
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i] || this.nation[i] === NO_NATION) continue;
      const C = this.defs.castes[this.kind[i]], n = N[this.nation[i]];
      n.pop += C.pop; n.upkeep += C.upkeep;
    }
    const winter = this.season() === 3;
    for (let b = 0; b < BCAP; b++) if (this.balive[b]) N[this.bnation[b]].cap += this.defs.buildings[this.btype[b]].pop;
    for (let k = 0; k < N.length; k++) {
      const n = N[k];
      if (!n.alive) continue;
      const up = n.upkeep * (winter && !n.techs.has('fogo') && this.mode === 'land' ? 1.3 : 1);
      n.food -= up * dt;
      if (n.food < 0) n.food = 0;
      n.incomeAcc += 0;
      if (n.research) {
        const T = this.defs.techs.find(t => t.id === n.research!.id)!;
        n.research.p += dt / T.time;
        if (n.research.p >= 1) {
          n.techs.add(T.id);
          if (k === 0) this.events.push({ k: 'msg', text: `Evolução concluída: ${T.name}` });
          n.research = null;
        }
      }
      if (n.ai) this.think(k, n, dt);
    }
  }

  private updateBuildings(dt: number) {
    for (let b = 0; b < BCAP; b++) {
      if (!this.balive[b]) continue;
      const B = this.defs.buildings[this.btype[b]], nat = this.bnation[b], n = this.nations[nat];
      const q = this.bqueue[b];
      if (q.length) {
        const C = this.defs.castes[q[0].caste];
        q[0].t += dt;
        if (q[0].t >= C.time && n.pop + C.pop <= n.cap) {
          q.shift();
          const [px, py] = this.near(this.bx[b], this.by[b], 300);
          const u = this.spawn(C.id, nat, px, py);
          if (u >= 0) {
            this.home[u] = b;
            if (C.gather) { this.ord[u] = Ord.GATHER; this.gatherPoint(u); }
            else if (Math.hypot(this.dx(this.bx[b], this.brx[b]), this.bry[b] - this.by[b]) > 260) this.order([u], Ord.AMOVE, this.brx[b], this.bry[b]);
            n.pop += C.pop;
            if (nat === 0) this.events.push({ k: 'trained', x: px, y: py, n: C.id });
          }
        }
      }
      // sentinels: strike what comes near
      if (B.dmg) {
        this.bcd[b] -= dt;
        if (this.bcd[b] <= 0) {
          let best = -1, bd = B.range! + 1;
          this.around(this.bx[b], this.by[b], B.range!, (j, d) => { if (this.hostile(nat, j) && d < bd) { bd = d; best = j; } });
          if (best >= 0) {
            this.bcd[b] = 1.2;
            this.damage(best, B.dmg, nat);
            this.events.push({ k: 'shot', x: this.bx[b], y: this.by[b] - 20, x2: this.x[best], y2: this.y[best], n: nat });
          }
        }
      }
      // territory: own creatures heal
      if (B.radius) this.around(this.bx[b], this.by[b], B.radius, j => {
        if (this.nation[j] === nat && this.hp[j] < this.maxhp[j]) this.hp[j] = Math.min(this.maxhp[j], this.hp[j] + dt * (n.techs.has('fogo') ? 5 : 3));
      });
    }
  }

  hostile(nat: number, j: number) {
    const o = this.nation[j];
    if (o === nat) return false;
    if (o === NO_NATION) return this.wild[this.kind[j]].role !== Wild.PREY;
    // the rivals leave the player alone for the first minutes (they still fight each other)
    if ((nat === 0 || o === 0) && this.t < GRACE && (this.nations[nat]?.ai || this.nations[o]?.ai)) return false;
    return true;
  }
  private damage(j: number, dmg: number, by: number) {
    const armor = this.nation[j] === NO_NATION ? (this.wild[this.kind[j]].role === Wild.LEVIATHAN ? 0.3 : 0) : this.defs.castes[this.kind[j]].armor;
    this.hp[j] -= dmg * (1 - armor);
    if (this.hp[j] <= 0) this.die(j, by);
  }
  private die(j: number, by: number) {
    const x = this.x[j], y = this.y[j];
    this.events.push({ k: 'death', x, y, n: this.nation[j] });
    if (by !== NO_NATION && this.nations[by]) {
      const n = this.nations[by];
      if (this.nation[j] === NO_NATION) {
        const W = this.wild[this.kind[j]];
        n.food += W.role === Wild.LEVIATHAN ? 260 : W.role === Wild.PREDATOR ? 45 : 22;
        n.dna += W.role === Wild.LEVIATHAN ? 25 : W.role === Wild.PREDATOR ? 1.6 : 0.6;
        if (by === 0 && W.role === Wild.LEVIATHAN) this.events.push({ k: 'msg', text: `Um leviatã caiu: ${W.name} (+25 DNA)` });
      } else { n.dna += 0.4; n.food += 8; }
    }
    this.kill(j);
  }
  private damageB(b: number, dmg: number, by: number) {
    this.bhp[b] -= dmg;
    if (this.bhp[b] > 0) return;
    const nat = this.bnation[b];
    this.balive[b] = 0; this.bfree.push(b);
    this.events.push({ k: 'death', x: this.bx[b], y: this.by[b], n: nat });
    if (nat === 0) this.events.push({ k: 'msg', text: `${this.defs.buildings[this.btype[b]].name} destruído!` });
    if (by !== NO_NATION && this.nations[by]) this.nations[by].dna += 4;
    // orphaned creatures adopt the nearest building of their nation
    for (let i = 0; i < CAP; i++) if (this.alive[i] && this.home[i] === b) this.home[i] = this.nearestBuilding(nat, this.x[i], this.y[i], true);
  }
  nearestBuilding(nat: number, x: number, y: number, trains = false): number {
    let best = -1, bd = 1e18;
    for (let b = 0; b < BCAP; b++) {
      if (!this.balive[b] || this.bnation[b] !== nat || (trains && !this.defs.buildings[this.btype[b]].trains)) continue;
      const d = Math.hypot(this.dx(x, this.bx[b]), this.by[b] - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------------------
  // Units
  // ---------------------------------------------------------------------------------------------------
  private speedOf(i: number) {
    const nat = this.nation[i];
    if (nat === NO_NATION) return this.wild[this.kind[i]].speed;
    const C = this.defs.castes[this.kind[i]], n = this.nations[nat];
    let s = C.speed * ((n.techs.has('nadadeiras') || n.techs.has('patas')) ? 1.15 : 1);
    if (this.mode === 'aqua' && this.zone(this.x[i], this.y[i]) === 3 && !n.techs.has('olhos')) s *= 0.8;
    return s;
  }
  private dmgOf(i: number) {
    const nat = this.nation[i];
    if (nat === NO_NATION) return this.wild[this.kind[i]].dmg;
    const C = this.defs.castes[this.kind[i]], n = this.nations[nat];
    let d = C.dmg;
    if ((C.key === 'hunter' || C.key === 'giant') && (n.techs.has('mandibulas') || n.techs.has('garras'))) d *= 1.3;
    if (n.techs.has('ferramentas')) d *= 1.15;
    return d;
  }
  private rangeOf(i: number) { return this.nation[i] === NO_NATION ? (this.wild[this.kind[i]].role === Wild.LEVIATHAN ? 60 : 24) : this.defs.castes[this.kind[i]].range; }
  sightOf(i: number) {
    const C = this.defs.castes[this.kind[i]], n = this.nations[this.nation[i]];
    return C.sight * ((n.techs.has('olhos') || n.techs.has('faro')) ? 1.4 : 1);
  }
  private radius(i: number) {
    if (this.nation[i] === NO_NATION) { const w = this.wild[this.kind[i]]; return w.role === Wild.LEVIATHAN ? 46 : w.k * 30; }
    return this.defs.castes[this.kind[i]].key === 'giant' ? 22 : 9;
  }

  private updateUnit(i: number, dt: number) {
    const nat = this.nation[i];
    if (this.cd[i] > 0) this.cd[i] -= dt;
    if (nat === NO_NATION) { this.wildAI(i, dt); return; }
    const n = this.nations[nat];
    const C = this.defs.castes[this.kind[i]];
    // starving creatures waste away (inside their territory the nest feeds them a little)
    if (n.food <= 0) { this.hp[i] -= dt * 1.2; if (this.hp[i] <= 0) { this.die(i, NO_NATION); return; } }
    if (this.mode === 'land' && this.season() === 3 && !n.techs.has('fogo') && this.grid.temp[this.cellOf(this.x[i], this.y[i])] < 90) { this.hp[i] -= dt * 0.25; if (this.hp[i] <= 0) { this.die(i, NO_NATION); return; } }
    const sp = this.speedOf(i);
    let mx = 0, my = 0, want = 0;
    this.anim[i] = 0;
    const o = this.ord[i];
    // --- gatherers ---
    if (C.gather && (o === Ord.GATHER || o === Ord.RETURN || o === Ord.IDLE)) {
      // flee from danger
      let threat = -1;
      this.around(this.x[i], this.y[i], 260, j => { if (this.hostile(nat, j) && (this.nation[j] !== NO_NATION || this.wild[this.kind[j]].role !== Wild.PREY)) threat = j; });
      if (threat >= 0) { this.flee[i] = 2.5; const ddx = this.dx(this.x[threat], this.x[i]), ddy = this.y[i] - this.y[threat], l = Math.hypot(ddx, ddy) || 1; this.tx[i] = this.x[i] + (ddx / l) * 600; this.ty[i] = this.y[i] + (ddy / l) * 600; }
      if (this.flee[i] > 0) { this.flee[i] -= dt; want = sp * 1.15; }
      else if (o === Ord.IDLE) { this.ord[i] = Ord.GATHER; this.gatherPoint(i); }
      else if (o === Ord.GATHER) {
        const d = Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]);
        if (d < 40) {
          const c = this.cellOf(this.x[i], this.y[i]);
          const rate = 5 * ((n.techs.has('simbiose') || n.techs.has('ferramentas')) ? 1.3 : 1);
          const take = Math.min(this.food[c], rate * dt);
          this.food[c] -= take; this.carry[i] += take; this.anim[i] = 2;
          if (this.carry[i] >= 20) { this.ord[i] = Ord.RETURN; this.home[i] = this.nearestBuilding(nat, this.x[i], this.y[i], true); }
          else if (take < rate * dt * 0.2) this.gatherPoint(i);
        } else want = sp;
      } else if (o === Ord.RETURN) {
        const b = this.home[i] >= 0 && this.balive[this.home[i]] ? this.home[i] : (this.home[i] = this.nearestBuilding(nat, this.x[i], this.y[i], true));
        if (b < 0) this.ord[i] = Ord.IDLE;
        else {
          this.tx[i] = this.bx[b]; this.ty[i] = this.by[b];
          if (Math.hypot(this.dx(this.x[i], this.bx[b]), this.by[b] - this.y[i]) < 120) { n.food += this.carry[i]; n.incomeAcc += this.carry[i]; this.carry[i] = 0; this.ord[i] = Ord.GATHER; this.gatherPoint(i); }
          else want = sp;
        }
      }
    } else if (o === Ord.BUILD) {
      const d = Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]);
      const type0 = this.buildType[i];
      // sentinels stand on the shore: the builder only has to reach the water's edge
      if (d < (type0 >= 0 && this.defs.buildings[type0].site === 'shore' ? 760 : 60) || (this.stuck[i] > 1 && d < 900)) {
        const type = this.buildType[i];
        if (type >= 0 && this.siteOk(type, this.tx[i], this.ty[i], nat)) {
          const b = this.build(type, nat, this.tx[i], this.ty[i]);
          if (b >= 0) {
            this.events.push({ k: 'built', x: this.tx[i], y: this.ty[i], n: nat });
            if (nat === 0) this.events.push({ k: 'msg', text: `${this.defs.buildings[type].name} fundado` });
            // the founder becomes the nest (a sentinel: the builder stays)
            if (this.defs.buildings[type].trains) { this.kill(i); return; }
          }
        } else if (type >= 0) { n.food += this.defs.buildings[type].cost; if (nat === 0) this.events.push({ k: 'msg', text: 'O lugar não serve mais para construir' }); }
        this.ord[i] = Ord.IDLE; this.buildType[i] = -1;
      } else want = sp;
    } else {
      // --- fighters ---
      let tg = this.tgt[i];
      if (tg >= 0 && (!this.alive[tg] || this.nation[tg] === nat)) { tg = this.tgt[i] = -1; if (o === Ord.ATTACK) this.ord[i] = Ord.IDLE; }
      let tb = this.tgtB[i];
      if (tb >= 0 && (!this.balive[tb] || this.bnation[tb] === nat)) { tb = this.tgtB[i] = -1; if (o === Ord.ATTACK) this.ord[i] = Ord.IDLE; }
      // acquire
      if (tg < 0 && tb < 0 && (o === Ord.IDLE || o === Ord.AMOVE || o === Ord.HOLD)) {
        const r = o === Ord.HOLD ? this.rangeOf(i) + 20 : Math.min(this.sightOf(i), 420);
        let best = -1, bd = r + 1;
        this.around(this.x[i], this.y[i], r, (j, d) => {
          if (!this.hostile(nat, j)) return;
          // AI hunters also take prey
          if (d < bd) { bd = d; best = j; }
        });
        if (best < 0 && n.ai && this.role[i] === 0 && o === Ord.IDLE) {
          this.around(this.x[i], this.y[i], 700, (j, d) => { if (this.nation[j] === NO_NATION && this.wild[this.kind[j]].role === Wild.PREY && d < bd + 700) { bd = d; best = j; } });
        }
        if (best >= 0) tg = this.tgt[i] = best;
        else if (o === Ord.AMOVE || o === Ord.IDLE) {
          // buildings of enemies close by
          for (let b = 0; b < BCAP; b++) {
            if (!this.balive[b] || this.bnation[b] === nat) continue;
            if (!this.hostileB(nat, b)) continue;
            if (Math.hypot(this.dx(this.x[i], this.bx[b]), this.by[b] - this.y[i]) < 420) { tb = this.tgtB[i] = b; break; }
          }
        }
      }
      if (tg >= 0) {
        const d = Math.hypot(this.dx(this.x[i], this.x[tg]), this.y[tg] - this.y[i]);
        const reach = this.rangeOf(i) + this.radius(tg);
        if (d <= reach) {
          this.anim[i] = 2;
          this.face(i, this.dx(this.x[i], this.x[tg]), this.y[tg] - this.y[i]);
          if (this.cd[i] <= 0) {
            this.cd[i] = C.ranged ? 1.6 : 1;
            this.damage(tg, this.dmgOf(i), nat);
            if (C.ranged) this.events.push({ k: 'shot', x: this.x[i], y: this.y[i], x2: this.x[tg], y2: this.y[tg], n: nat });
            else this.events.push({ k: 'hit', x: this.x[tg], y: this.y[tg], n: nat });
          }
        } else if (o !== Ord.HOLD) { this.tx[i] = this.x[tg]; this.ty[i] = this.y[tg]; want = sp * 1.05; this.paths.delete(i); }
        // give up chases that run far from the order
        if (o === Ord.IDLE && d > 1500) { this.tgt[i] = -1; }
      } else if (tb >= 0) {
        const d = Math.hypot(this.dx(this.x[i], this.bx[tb]), this.by[tb] - this.y[i]);
        if (d <= this.rangeOf(i) + 60) {
          this.anim[i] = 2;
          this.face(i, this.dx(this.x[i], this.bx[tb]), this.by[tb] - this.y[i]);
          if (this.cd[i] <= 0) { this.cd[i] = C.ranged ? 1.6 : 1; this.damageB(tb, this.dmgOf(i), nat); if (C.ranged) this.events.push({ k: 'shot', x: this.x[i], y: this.y[i], x2: this.bx[tb], y2: this.by[tb], n: nat }); }
        } else { this.tx[i] = this.bx[tb]; this.ty[i] = this.by[tb]; want = sp; }
      } else if (o === Ord.MOVE || o === Ord.AMOVE || o === Ord.ATTACK) {
        const d = Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]);
        if (d < 24) { this.ord[i] = o === Ord.AMOVE || o === Ord.MOVE ? Ord.IDLE : o; this.paths.delete(i); }
        else want = sp;
      }
    }
    if (want > 0) {
      // cruise: long trips without enemies around go much faster (migrations across the ocean / the plains)
      const far = Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]);
      if (far > 3500 && this.tgt[i] < 0 && this.tgtB[i] < 0) want *= 3;
      const [wx, wy] = this.waypoint(i);
      const ddx = this.dx(this.x[i], wx), ddy = wy - this.y[i], l = Math.hypot(ddx, ddy) || 1;
      mx = (ddx / l) * want; my = (ddy / l) * want;
      this.anim[i] = this.anim[i] === 2 ? 2 : 1;
    }
    this.move(i, mx, my, dt);
  }
  private hostileB(nat: number, b: number) {
    const o = this.bnation[b];
    if (o === nat) return false;
    if ((nat === 0 || o === 0) && this.t < GRACE) return false;
    return true;
  }
  private face(i: number, ddx: number, ddy: number) { this.dir[i] = ((Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)) % 8) + 8) % 8; }
  private move(i: number, mx: number, my: number, dt: number) {
    // separation from neighbours
    let sx = 0, sy = 0;
    const r = this.radius(i);
    this.around(this.x[i], this.y[i], r * 2.2, (j, d) => {
      if (j === i || d < 1e-3) return;
      const push = (r * 2.2 - d) / (r * 2.2);
      sx += (this.dx(this.x[j], this.x[i]) / d) * push; sy += ((this.y[i] - this.y[j]) / d) * push;
    });
    const k = 40;
    let vx = mx + sx * k, vy = my + sy * k;
    if (Math.abs(vx) + Math.abs(vy) < 0.5) { this.vx[i] = 0; this.vy[i] = 0; return; }
    const nx = this.x[i] + vx * dt, ny = this.y[i] + vy * dt;
    if (this.habitable(nx, ny)) { this.x[i] = this.wrapX(nx); this.y[i] = ny; }
    else {
      // slide along the shore: try turning left / right
      let ok = false;
      for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const c = Math.cos(a), s = Math.sin(a), rx = vx * c - vy * s, ry = vx * s + vy * c;
        if (this.habitable(this.x[i] + rx * dt, this.y[i] + ry * dt)) { this.x[i] = this.wrapX(this.x[i] + rx * dt); this.y[i] += ry * dt; vx = rx; vy = ry; ok = true; break; }
      }
      if (!ok) { this.stuck[i] += dt; vx = 0; vy = 0; }
      if (this.stuck[i] > 1.5 && this.nation[i] !== NO_NATION && !this.paths.has(i)) { this.stuck[i] = 0; this.findPath(i); }
    }
    this.vx[i] = vx; this.vy[i] = vy;
    if (Math.abs(mx) + Math.abs(my) > 1) this.face(i, mx, my);
  }
  private waypoint(i: number): [number, number] {
    const p = this.paths.get(i);
    if (p && p.length >= 2) {
      const wx = p[0], wy = p[1];
      if (Math.hypot(this.dx(this.x[i], wx), wy - this.y[i]) < this.CELL * 0.6) { p.splice(0, 2); if (!p.length) this.paths.delete(i); }
      return [wx, wy];
    }
    return [this.tx[i], this.ty[i]];
  }
  /** A* over the grid cells (coarsened x2) around the obstacle, towards the order's target */
  private findPath(i: number) {
    const G = this.grid, S = 2, gw = Math.ceil(G.w / S), gh = Math.ceil(G.h / S), cell = this.CELL * S;
    const sx = Math.floor(this.x[i] / cell), sy = Math.floor(this.y[i] / cell);
    const ex = Math.floor(this.wrapX(this.tx[i]) / cell), ey = Math.floor(this.ty[i] / cell);
    const pass = (cx: number, cy: number) => this.habitable((cx + 0.5) * cell, (cy + 0.5) * cell);
    const key = (cx: number, cy: number) => cy * gw + (((cx % gw) + gw) % gw);
    const open: number[] = [], gScore = new Map<number, number>(), from = new Map<number, number>();
    const h = (cx: number, cy: number) => { let ddx = Math.abs(cx - ex); ddx = Math.min(ddx, gw - ddx); return Math.hypot(ddx, cy - ey); };
    const push = (k: number, f: number) => { open.push(k, f); };
    const k0 = key(sx, sy), goal = key(ex, ey);
    gScore.set(k0, 0); push(k0, h(sx, sy));
    let found = false, iter = 0;
    while (open.length && iter++ < 30000) {
      let bi = 0;
      for (let q = 3; q < open.length; q += 2) if (open[q] < open[bi + 1]) bi = q - 1;
      const cur = open[bi]; open.splice(bi, 2);
      if (cur === goal) { found = true; break; }
      const cx = cur % gw, cy = Math.floor(cur / gw), g0 = gScore.get(cur)!;
      for (let dy = -1; dy <= 1; dy++) for (let ddx = -1; ddx <= 1; ddx++) {
        if (!dy && !ddx) continue;
        const nx = cx + ddx, ny = cy + dy;
        if (ny < 0 || ny >= gh) continue;
        const nk = key(nx, ny);
        if (nk !== goal && !pass(nx, ny)) continue;
        const g1 = g0 + (dy && ddx ? 1.414 : 1);
        if (g1 < (gScore.get(nk) ?? 1e18)) { gScore.set(nk, g1); from.set(nk, cur); push(nk, g1 + h(nx, ny)); }
      }
    }
    if (!found) return;
    const pts: number[] = [];
    let c = goal;
    while (c !== k0 && from.has(c)) { pts.unshift((c % gw + 0.5) * cell, (Math.floor(c / gw) + 0.5) * cell); c = from.get(c)!; }
    // keep every 3rd waypoint (the steering follows the line between them)
    const out: number[] = [];
    for (let q = 0; q < pts.length; q += 2) if (q % 6 === 0 || q >= pts.length - 2) out.push(pts[q], pts[q + 1]);
    out.push(this.tx[i], this.ty[i]);
    this.paths.set(i, out);
  }
  gatherPoint(i: number) {
    // the richest cell near home (or near the gatherer)
    const b = this.home[i] >= 0 && this.balive[this.home[i]] ? this.home[i] : this.nearestBuilding(this.nation[i], this.x[i], this.y[i], true);
    const cx = b >= 0 ? this.bx[b] : this.x[i], cy = b >= 0 ? this.by[b] : this.y[i];
    let best: [number, number] | null = null, bv = -1;
    for (let k = 0; k < 14; k++) {
      const a = this.rnd() * Math.PI * 2, d = 250 + this.rnd() * 2400;
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
      if (!this.habitable(px, py)) continue;
      const v = this.food[this.cellOf(px, py)] - d * 0.02;
      if (v > bv) { bv = v; best = [px, py]; }
    }
    if (best) { this.tx[i] = this.wrapX(best[0]); this.ty[i] = best[1]; }
  }
  private regrowFood(dt: number) {
    // a slice of the planet regrows every tick
    const n = this.food.length, slice = Math.ceil(n / 40), s0 = Math.floor((this.t * 20) % 40) * slice;
    const winterK = this.mode === 'land' && this.season() === 3 ? 0.3 : 1;
    for (let i = s0; i < Math.min(n, s0 + slice); i++) {
      const m = this.foodMax[i];
      if (this.food[i] < m) this.food[i] = Math.min(m, this.food[i] + m * 0.004 * 40 * dt * winterK);
    }
  }
  season() { return this.mode === 'land' ? Math.floor(this.t / 90) % 4 : 1; }

  // ---------------------------------------------------------------------------------------------------
  // Wild life
  // ---------------------------------------------------------------------------------------------------
  private wildAI(i: number, dt: number) {
    const W = this.wild[this.kind[i]];
    const sp = W.speed;
    let mx = 0, my = 0;
    this.anim[i] = 0;
    if (W.role === Wild.PREY) {
      // graze and drift; flee from anything close
      let threat = -1, td = 300;
      this.around(this.x[i], this.y[i], 300, (j, d) => { if (this.nation[j] !== NO_NATION && d < td) { td = d; threat = j; } else if (this.nation[j] === NO_NATION && this.wild[this.kind[j]].role !== Wild.PREY && d < td) { td = d; threat = j; } });
      if (threat >= 0) {
        const ddx = this.dx(this.x[threat], this.x[i]), ddy = this.y[i] - this.y[threat], l = Math.hypot(ddx, ddy) || 1;
        mx = (ddx / l) * sp * 1.3; my = (ddy / l) * sp * 1.3; this.anim[i] = 1;
      } else {
        if (this.stuck[i] <= 0 || Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]) < 30) { this.stuck[i] = 4 + this.rnd() * 8; const [px, py] = this.near(this.x[i], this.y[i], 500); this.tx[i] = px; this.ty[i] = py; }
        this.stuck[i] -= dt;
        const ddx = this.dx(this.x[i], this.tx[i]), ddy = this.ty[i] - this.y[i], l = Math.hypot(ddx, ddy);
        if (l > 20) { mx = (ddx / l) * sp * 0.5; my = (ddy / l) * sp * 0.5; this.anim[i] = 1; }
      }
    } else {
      // predators and leviathans: hunt what comes near, otherwise roam their depth
      let tg = this.tgt[i];
      if (tg >= 0 && !this.alive[tg]) tg = this.tgt[i] = -1;
      if (tg < 0) {
        let bd = W.role === Wild.LEVIATHAN ? 520 : 380;
        this.around(this.x[i], this.y[i], bd, (j, d) => { if (j !== i && this.nation[j] !== NO_NATION && d < bd) { bd = d; tg = j; } else if (W.role === Wild.PREDATOR && this.nation[j] === NO_NATION && this.wild[this.kind[j]].role === Wild.PREY && d < bd) { bd = d; tg = j; } });
        this.tgt[i] = tg;
      }
      if (tg >= 0) {
        const d = Math.hypot(this.dx(this.x[i], this.x[tg]), this.y[tg] - this.y[i]);
        if (d > 1800) this.tgt[i] = -1;
        else if (d <= this.rangeOf(i) + this.radius(tg)) {
          this.anim[i] = 2; this.face(i, this.dx(this.x[i], this.x[tg]), this.y[tg] - this.y[i]);
          if (this.cd[i] <= 0) { this.cd[i] = W.role === Wild.LEVIATHAN ? 1.4 : 1.1; this.damage(tg, W.dmg, NO_NATION); this.events.push({ k: 'hit', x: this.x[tg], y: this.y[tg], n: NO_NATION }); }
        } else { const ddx = this.dx(this.x[i], this.x[tg]), ddy = this.y[tg] - this.y[i]; mx = (ddx / d) * sp * 1.2; my = (ddy / d) * sp * 1.2; this.anim[i] = 1; }
      } else {
        if (this.stuck[i] <= 0 || Math.hypot(this.dx(this.x[i], this.tx[i]), this.ty[i] - this.y[i]) < 40) {
          this.stuck[i] = 8 + this.rnd() * 12;
          for (let k = 0; k < 12; k++) {
            const [px, py] = this.near(this.x[i], this.y[i], W.role === Wild.LEVIATHAN ? 4000 : 1500);
            if (this.mode !== 'aqua' || W.role !== Wild.LEVIATHAN || this.zone(px, py) >= 2) { this.tx[i] = px; this.ty[i] = py; break; }
          }
        }
        this.stuck[i] -= dt;
        const ddx = this.dx(this.x[i], this.tx[i]), ddy = this.ty[i] - this.y[i], l = Math.hypot(ddx, ddy);
        if (l > 30) { mx = (ddx / l) * sp * 0.6; my = (ddy / l) * sp * 0.6; this.anim[i] = 1; }
      }
    }
    this.move(i, mx, my, dt);
  }
  private keepWild() {
    // keep some life around every nation's buildings (and the leviathans out in the deep)
    for (let b = 0; b < BCAP; b++) {
      if (!this.balive[b] || !this.defs.buildings[this.btype[b]].trains) continue;
      let wild = 0;
      this.around(this.bx[b], this.by[b], 9000, j => { if (this.nation[j] === NO_NATION) wild++; });
      if (wild < 26 && this.count < CAP - 300) this.populateWild(this.bx[b], this.by[b], 7000, 0.4);
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Rival AI
  // ---------------------------------------------------------------------------------------------------
  private think(k: number, n: Nation, dt: number) {
    const A = n.ai!;
    A.t -= dt;
    if (A.t > 0) return;
    A.t = 1 + this.rnd() * 0.5;
    const C = this.defs.castes, B = this.defs.buildings;
    const mine: number[] = [], army: number[] = [];
    let gatherers = 0;
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i] || this.nation[i] !== k) continue;
      mine.push(i);
      if (C[this.kind[i]].gather) gatherers++; else if (this.role[i] === 1) army.push(i);
    }
    const nests: number[] = [];
    for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.bnation[b] === k && B[this.btype[b]].trains) nests.push(b);
    if (!nests.length) {
      if (!mine.length) { n.alive = false; n.info.alive = false; if (k !== 0) this.events.push({ k: 'msg', text: `A espécie ${n.info.name} foi extinta` }); }
      else {
        // refound the nation where the survivors are
        const g = mine.find(i => C[this.kind[i]].builder);
        if (g !== undefined && n.food >= B[0].cost) { const site = this.findSite(this.x[g], this.y[g], 6000, 0, k); if (site) this.placeBuilding(0, site[0], site[1], k, g); }
      }
      return;
    }
    // research
    if (!n.research) for (const T of this.defs.techs) if (!n.techs.has(T.id) && T.id !== this.defs.final && !this.research(T.id, k)) break;
    // economy
    const wantG = 5 + nests.length * 3, minutes = this.t / 60;
    const train = (caste: number) => { const b = nests.reduce((best, q) => (this.bqueue[q].length < this.bqueue[best].length ? q : best), nests[0]); return !this.train(b, caste, k); };
    if (gatherers < wantG && n.food >= C[0].cost) train(0);
    else if (n.food > 70) {
      const opts = C.filter(c => !c.gather && (!c.req || n.techs.has(c.req)));
      const pick = opts[Math.floor(this.rnd() * opts.length)];
      if (pick && train(pick.id)) { /* new fighters join the army on spawn */ }
    }
    for (const i of mine) if (!C[this.kind[i]].gather && this.role[i] === 0 && this.rnd() < 0.6) this.role[i] = 1;
    // expand
    A.expandT -= 1;
    if (A.expandT <= 0 && n.food > B[0].cost + 60 && nests.length < 2 + minutes / 5) {
      A.expandT = 50 + this.rnd() * 60;
      const from = nests[Math.floor(this.rnd() * nests.length)];
      const site = this.findSite(this.bx[from], this.by[from], 7000, 0, k);
      if (site && Math.hypot(this.dx(site[0], this.bx[from]), site[1] - this.by[from]) > 2600) this.placeBuilding(0, site[0], site[1], k);
    }
    // sentinels by the nests once the coasts are green
    A.towerT -= 1;
    if (A.towerT <= 0 && B[1].req && n.techs.has(B[1].req) && n.food > B[1].cost + 40) {
      A.towerT = 40;
      const from = nests[Math.floor(this.rnd() * nests.length)];
      const site = this.findSite(this.bx[from], this.by[from], 2500, 1, k);
      if (site) this.placeBuilding(1, site[0], site[1], k);
    }
    // defend: enemies inside a territory
    for (const b of nests) {
      let foe = -1;
      this.around(this.bx[b], this.by[b], B[this.btype[b]].radius, j => { if (this.nation[j] !== k && this.nation[j] !== NO_NATION && this.hostile(k, j)) foe = j; });
      if (foe >= 0) { this.order(army, Ord.AMOVE, this.x[foe], this.y[foe]); return; }
    }
    // raid the weakest neighbour
    A.attackT -= 1;
    if (A.attackT <= 0 && army.length >= 6 + Math.min(10, minutes)) {
      A.attackT = 70 + this.rnd() * 60;
      let best = -1, bs = 1e18;
      for (let b = 0; b < BCAP; b++) {
        if (!this.balive[b] || this.bnation[b] === k || !this.hostileB(k, b)) continue;
        const d = Math.hypot(this.dx(this.bx[nests[0]], this.bx[b]), this.by[b] - this.by[nests[0]]);
        if (d > 40000) continue;
        const s = d / (1 + this.armyOf(this.bnation[b]) * 0.0) + this.armyOf(this.bnation[b]) * 600;
        if (s < bs) { bs = s; best = b; }
      }
      if (best >= 0) this.order(army, Ord.AMOVE, this.bx[best], this.by[best]);
    }
  }
  private armyOf(nat: number) { let s = 0; for (let i = 0; i < CAP; i++) if (this.alive[i] && this.nation[i] === nat && !this.defs.castes[this.kind[i]].gather) s++; return s; }

  // ---------------------------------------------------------------------------------------------------
  // Vision, end, snapshots, save
  // ---------------------------------------------------------------------------------------------------
  private vision() {
    const S = this.seen;
    S.clear();
    this.sights = [];
    const VC = 512;
    const mark = (x: number, y: number, r: number) => {
      this.sights.push(x, y, r);
      const c0 = Math.floor((x - r) / VC), c1 = Math.floor((x + r) / VC), r0 = Math.floor((y - r) / VC), r1 = Math.floor((y + r) / VC);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) S.add(cy * 8192 + (((cx % 4096) + 4096) % 4096));
    };
    for (let i = 0; i < CAP; i++) if (this.alive[i] && this.nation[i] === 0) mark(this.x[i], this.y[i], this.sightOf(i));
    for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.bnation[b] === 0) mark(this.bx[b], this.by[b], this.defs.buildings[this.btype[b]].sight);
  }
  visible(x: number, y: number) { const VC = 512; return this.seen.has(Math.floor(y / VC) * 8192 + (((Math.floor(x / VC) % 4096) + 4096) % 4096)); }
  private checkEnd() {
    if (this.lost) return;
    const me = this.nations[0];
    let units = 0, builds = 0;
    for (let i = 0; i < CAP; i++) if (this.alive[i] && this.nation[i] === 0) units++;
    for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.bnation[b] === 0) builds++;
    if (!builds && !units) { this.lost = true; me.alive = false; this.events.push({ k: 'lost' }); }
  }
  /** what the era's victory needs, and whether it is met */
  victory(): { ok: boolean; lines: [string, boolean][] } {
    const me = this.nations[0], B = this.defs.buildings;
    const count = (type: number) => { let c = 0; for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.bnation[b] === 0 && this.btype[b] === type) c++; return c; };
    const lines: [string, boolean][] = this.mode === 'aqua' ? [
      [`Pesquisa: ${this.techName('patas')}`, me.techs.has('patas')],
      [`Planeta verde até a costa (${Math.round(this.lifeStage * 100)}% / 60%)`, this.lifeStage >= 0.6],
      [`${B[1].name}s nas margens (${count(1)}/2)`, count(1) >= 2],
    ] : [
      [`Pesquisa: ${this.techName('linguagem')}`, me.techs.has('linguagem')],
      [`${B[0].name}s (${count(0)}/3)`, count(0) >= 3],
    ];
    return { ok: lines.every(l => l[1]), lines };
  }
  stats(k: number): NationStats {
    const n = this.nations[k];
    const units = new Array(this.defs.castes.length).fill(0);
    for (let i = 0; i < CAP; i++) if (this.alive[i] && this.nation[i] === k) units[this.kind[i]]++;
    let buildings = 0;
    for (let b = 0; b < BCAP; b++) if (this.balive[b] && this.bnation[b] === k) buildings++;
    return { food: n.food, dna: n.dna, pop: n.pop, cap: n.cap, upkeep: n.upkeep, income: n.income, techs: [...n.techs], research: n.research ? { ...n.research } : null, units, buildings };
  }
  /** entity snapshot (SNAP floats each) and buildings (8 floats each); `all` = include what the player cannot see */
  snapshot(all = false) {
    const ents = new Float32Array(this.count * SNAP);
    let o = 0;
    for (let i = 0; i < CAP; i++) {
      if (!this.alive[i]) continue;
      const nat = this.nation[i];
      const vis = nat === 0 || all || this.visible(this.x[i], this.y[i]);
      if (!vis) continue;
      let f = F_VISIBLE;
      if (this.carry[i] > 0) f |= F_CARRY;
      if (nat === NO_NATION) f |= F_WILD;
      if (this.anim[i] === 2) f |= F_ATTACK;
      ents[o] = i; ents[o + 1] = this.x[i]; ents[o + 2] = this.y[i]; ents[o + 3] = this.hp[i] / this.maxhp[i]; ents[o + 4] = this.kind[i];
      ents[o + 5] = nat; ents[o + 6] = this.dir[i]; ents[o + 7] = this.anim[i]; ents[o + 8] = f;
      o += SNAP;
    }
    const bl: number[] = [];
    for (let b = 0; b < BCAP; b++) {
      if (!this.balive[b]) continue;
      if (this.bnation[b] !== 0 && !all && !this.visible(this.bx[b], this.by[b])) continue;
      const q = this.bqueue[b];
      bl.push(b, this.bx[b], this.by[b], this.bhp[b] / this.bmaxhp[b], this.btype[b], this.bnation[b], q.length, q.length ? q[0].t / this.defs.castes[q[0].caste].time : 0);
    }
    return { ents: ents.subarray(0, o), builds: new Float32Array(bl) };
  }
  /** the player's units, with their order (for the selection panel) */
  orders(ids: number[]) { return ids.map(i => (this.alive[i] ? this.ord[i] : -1)); }
  queueOf(b: number) { return this.balive[b] ? this.bqueue[b].map(q => q.caste) : []; }

  save(): RtsSave {
    const units: number[] = [];
    for (let i = 0; i < CAP; i++) if (this.alive[i]) units.push(this.kind[i], this.nation[i], Math.round(this.x[i]), Math.round(this.y[i]), Math.round(this.hp[i]), this.home[i], this.ord[i] === Ord.GATHER ? 1 : 0);
    const buildings: number[] = [];
    for (let b = 0; b < BCAP; b++) if (this.balive[b]) buildings.push(b, this.btype[b], this.bnation[b], Math.round(this.bx[b]), Math.round(this.by[b]), Math.round(this.bhp[b]));
    return {
      t: this.t, o2: this.o2, units, buildings,
      nations: this.nations.map(n => ({ info: n.info, food: n.food, dna: n.dna, techs: [...n.techs], research: n.research })),
    };
  }
  private load(s: RtsSave) {
    this.t = s.t; this.o2 = s.o2;
    if (this.mode === 'aqua') this.lifeStage = Math.min(0.95, this.life0 + this.o2);
    this.nations = s.nations.map(sn => ({
      info: sn.info, food: sn.food, dna: sn.dna, techs: new Set(sn.techs), research: sn.research, pop: 0, cap: 0, upkeep: 0, income: 0, incomeAcc: 0,
      ai: sn.info.ai ? { t: this.rnd() * 2, attackT: 60, target: -1, expandT: 60, towerT: 0 } : null, alive: sn.info.alive,
    }));
    const map = new Map<number, number>();
    for (let q = 0; q < s.buildings.length; q += 6) {
      const b = this.build(s.buildings[q + 1], s.buildings[q + 2], s.buildings[q + 3], s.buildings[q + 4]);
      if (b >= 0) { this.bhp[b] = s.buildings[q + 5]; map.set(s.buildings[q], b); }
    }
    for (let q = 0; q < s.units.length; q += 7) {
      const u = this.spawn(s.units[q], s.units[q + 1], s.units[q + 2], s.units[q + 3]);
      if (u < 0) continue;
      this.hp[u] = Math.min(this.maxhp[u], s.units[q + 4]);
      this.home[u] = map.get(s.units[q + 5]) ?? -1;
      if (s.units[q + 6]) { this.ord[u] = Ord.GATHER; this.gatherPoint(u); }
    }
  }
}

function rivalNames(seed: string, n: number) {
  const R = mulberry(seedToInt(seed + ':names'));
  const A = ['Vel', 'Kor', 'Tha', 'Mu', 'Zan', 'Or', 'Ish', 'Bra', 'Ny', 'Ka', 'Sel', 'Dru', 'Ae', 'Gho', 'Pir', 'Lun'], B = ['ari', 'oth', 'enu', 'ixa', 'ora', 'umi', 'eth', 'ala', 'ozi', 'yne', 'aru', 'esk'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(A[Math.floor(R() * A.length)] + B[Math.floor(R() * B.length)] + (R() < 0.4 ? A[Math.floor(R() * A.length)].toLowerCase() : ''));
  return out;
}
