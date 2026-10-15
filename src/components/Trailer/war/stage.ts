// Trailer II's planet and everything placed on it before the film rolls: the home world of the first film (with
// its underwater layer), one city per era of the same culture on the best sites of one region, a battle of each
// age on the region's open grassland (the siege at its city), the spots of the sea floor, the coast and the herds,
// and the grand campaign's map (nations spreading turn after turn, precomputed).
import { openPlanetSession, type PlanetSession, type PlanetGrid } from '../../../lib/planet-generator/planetClient';
import type { PlanetConfig } from '../../../lib/planet-generator/generator';
import { WORLDS } from '../../Demo/worlds';
import { scout } from '../../Demo/director';
import { WORLD_TILES_X, TILE, Ground } from '../../../lib/terrain/types';
import { TerrainGenerator } from '../../../lib/terrain/terrainGen';
import { SeaZone } from '../../../lib/planet-generator/lifeStage';
import { makeSpecies } from '../../../lib/cell/look';
import { lineageGenome } from '../../../lib/game/save';
import type { Genome } from '../../../lib/creature/genome';
import type { Culture } from '../../../lib/structure/genome';
import { SpriteStore } from '../../../lib/fauna/spriteStore';
import { StructPool } from '../../../lib/structure/structPool';
import { planetFauna } from '../../../lib/fauna/species';
import { WarArt, factionGenome, factionCulture, pickMount } from '../../Play/war/art';
import { BattleLayer } from '../../Play/battle/BattleLayer';
import { CampaignLayer } from '../../Play/campaign/CampaignLayer';
import { CampaignWorld } from '../../../lib/game/campaign/world';
import { newCampaign, aiTurn, endTurnEconomy, autoResolve, applyOutcome, type Campaign, type Site, type Army } from '../../../lib/game/campaign/campaign';
import { cityName } from '../../../lib/city/plan';
import { Discovery } from '../../../lib/play/discovery';
import type { BattleSim, BattleTerrain } from '../../../lib/game/battle/sim';
import type { WorldApi } from '../../../lib/game/layer';
import { DIRS } from '../../../lib/creature/pose';
import { unitById } from '../../../lib/game/campaign/units';
import { WAR_BATTLES, warSetup, warSim, GOLD, CRIMSON, type WarBattle } from './battles';

export const WAR_WORLD: PlanetConfig = { ...WORLDS.gaia, aquaticView: true, lifeStage: 1 };
/** the species of the film (its cells, its lineage, its soldiers) */
export const WAR_SPECIES = makeSpecies('war-trailer-lineage', 'earth');
const CULTURE_SEED = 4242;

export interface EraCity {
  era: number; id: number; tx: number; ty: number; x: number; y: number; ok: boolean;
  /** where the camera looks: the densest block of buildings (close shot, and the wide one of the capital) */
  view: { x: number; y: number }; wide: { x: number; y: number };
}
export interface StagedBattle { spec: WarBattle; sim: BattleSim; layer: BattleLayer; cx: number; cy: number; done: Set<number> }

export class WarStage {
  session: PlanetSession | null = null;
  grid: PlanetGrid | null = null;
  readonly store = new SpriteStore();
  private vpool: StructPool | null = null;
  readonly pool = () => (this.vpool ??= new StructPool(2, () => new Worker(new URL('../../../lib/vehicle/vehicle.worker.ts', import.meta.url), { type: 'module' })));
  art: WarArt;
  readonly genome: Genome = lineageGenome(WAR_SPECIES);
  readonly sides: [Genome, Genome] = [factionGenome(WAR_SPECIES, GOLD), factionGenome(WAR_SPECIES, CRIMSON)];
  readonly cultures: [Culture, Culture] = [factionCulture(91, 'earth', 0.5), factionCulture(17, 'earth', 0.5)];
  cities: EraCity[] = [];
  battles: StagedBattle[] = [];
  spots = { reef: { x: NaN, y: NaN }, abyss: { x: NaN, y: NaN }, coast: { x: NaN, y: NaN }, wild: { x: NaN, y: NaN }, centre: { x: NaN, y: NaN } };
  campaign: { c: Campaign; layer: CampaignLayer; snaps: { owners: number[]; armies: Army[] }[] } | null = null;
  /** the view's world api (once the planet view is up): terrain under the battles */
  api: WorldApi | null = null;
  status = '';
  private dead = false;
  /** every building of the film's cities (x, y pairs): battles are fought clear of them */
  private built: number[] = [];
  /** the region's terrain at tile precision (the chunks' own generator, run here on the session's fields) */
  private tg: TerrainGenerator | null = null;
  private tiles = new Map<number, Tile>();

  constructor() { this.art = new WarArt(() => this.store, this.pool, null); }

  /** world px per map px */
  get S() { return (WORLD_TILES_X / WAR_WORLD.width) * TILE; }

  async prepare(onStatus: (s: string) => void): Promise<void> {
    const say = (s: string) => { this.status = s; onStatus(s); };
    say('O PLANETA…');
    const session = this.session = await openPlanetSession(WAR_WORLD).ready;
    if (this.dead) return;
    const grid = this.grid = await session.grid();
    try { this.art.mountSp = pickMount(planetFauna({ ...WAR_WORLD, life: { level: 'animal' } })); } catch { /* no mount */ }
    const sc = await scout(session);
    const S = this.S;
    const sp = (p: { x: number; y: number } | undefined) => (p ? { x: (p.x + 0.5) * S, y: (p.y + 0.5) * S } : { x: NaN, y: NaN });
    // --- the region of the cities: the biggest cluster of good city sites ---
    say('AS CIDADES…');
    const sites = await session.citySites(30, CULTURE_SEED);
    const byCluster = new Map<number, typeof sites>();
    for (const s of sites) { const l = byCluster.get(s.cluster) ?? []; l.push(s); byCluster.set(s.cluster, l); }
    const cluster = [...byCluster.values()].sort((a, b) => b.length - a.length)[0] ?? sites;
    const cx0 = cluster.reduce((q, s) => q + s.tx, 0) / cluster.length, cy0 = cluster.reduce((q, s) => q + s.ty, 0) / cluster.length;
    const cand = [...sites].sort((a, b) => Math.hypot(a.tx - cx0, a.ty - cy0) - Math.hypot(b.tx - cx0, b.ty - cy0));
    this.spots.centre = { x: cx0 * TILE, y: cy0 * TILE };
    let ci = 0;
    for (let era = 0; era < 8 && !this.dead; era++) {
      let ok = false;
      while (!ok && ci < cand.length) {
        const s = cand[ci++];
        try {
          // a mid-sized city: big enough to fill the frame, light enough to plan in seconds
          const p = era === 0 ? 210 : 170;
          const plan = await session.planCity(s.tx, s.ty, era, p, 900 + era, cityName(CULTURE_SEED + era, false, 0), WAR_SPECIES.seed, CULTURE_SEED);
          const x = (s.tx + 0.5) * TILE, y = (s.ty + 0.5) * TILE;
          const bs = plan.buildings.filter(b => b.stage <= p);
          for (const b of bs) this.built.push(b.x, b.y);
          this.cities.push({ era, id: 900 + era, tx: s.tx, ty: s.ty, x, y, ok: true, view: densest(bs, x, y, 290, 140), wide: densest(bs, x, y, 560, 270) });
          ok = true;
          say(`AS CIDADES… ${era + 1}/8`);
        } catch { /* a neighbour's land: the next site */ }
      }
      if (!ok) { const c = this.spots.centre; this.cities.push({ era, id: -1, tx: 0, ty: 0, x: c.x, y: c.y, ok: false, view: c, wide: c }); }
    }
    // the film shows the buildings, not the planner's zone colours (streets and walls stay)
    session.setCityZones(false);
    this.api?.citiesChanged();
    // --- the region's terrain, tile by tile (battle fields, the sea floor) ---
    const mx0 = Math.floor(this.spots.centre.x / S), my0 = Math.floor(this.spots.centre.y / S);
    this.tg = new TerrainGenerator(await session.fields(mx0, my0, 256));
    // --- nature: a reef and an abyss near the region, a coast and herds ---
    this.spots.coast = sp(sc.coast[0]);
    // herds far from the cities (they come later in the film)
    const far = (p: { x: number; y: number }) => Math.min(...this.cities.filter(c => c.ok).map(c => Math.hypot(c.x - p.x, c.y - p.y)), Infinity);
    this.spots.wild = sc.wild.map(sp).sort((a, b) => (far(b) > 4000 ? 1 : 0) - (far(a) > 4000 ? 1 : 0))[0] ?? sp(undefined);
    const sea = (i: number) => grid.elev[i] < grid.sea;
    const W = grid.w, H = grid.h;
    const reefs: { k: number; d: number }[] = [], deeps: { k: number; d: number }[] = [];
    for (let j = Math.max(0, my0 - 110); j < Math.min(H, my0 + 110); j++) for (let di = -110; di <= 110; di++) {
      const i = (mx0 + di + W) % W, k = j * W + i;
      if (!sea(k)) continue;
      const d = Math.hypot(di, j - my0), depth = grid.sea - grid.elev[k];
      // a reef: warm shallow water by the coast; an abyss: the deep ocean
      let shore = false;
      for (let q = -2; q <= 2 && !shore; q++) for (let r = -2; r <= 2; r++) { const kk = Math.max(0, Math.min(H - 1, j + r)) * W + ((i + q + W) % W); if (!sea(kk)) { shore = true; break; } }
      if (shore && depth < 0.05 && grid.temp[k] > 120) reefs.push({ k, d });
      // (the deepest water of the region first: the nearest may be a narrow trench by the coast)
      if (!shore) deeps.push({ k, d: -depth });
    }
    say('O FUNDO DO MAR…');
    // the frames must be all water at tile precision (a map pixel is 64 tiles: coasts wander inside it)
    // (frames sized for wide screens, plus the shot's drift)
    this.spots.reef = this.underSpot(reefs, 360, 150, (cz, op, ab) => (cz >= 0.6 ? 1 + cz * 0.5 + op * 0.3 - ab : -1));
    this.spots.abyss = this.underSpot(deeps, 520, 220, (cz, op, ab) => (cz < 0.05 ? 1 + ab * 2 + op * 0.5 : -1));
    if (!isFinite(this.spots.reef.x)) this.spots.reef = this.spots.coast;
    if (!isFinite(this.spots.abyss.x)) this.spots.abyss = this.spots.reef;
    // --- the battles, by their cities ---
    say('OS EXÉRCITOS…');
    // the same terrain from the first step to the last (the film's view is not up while the armies deploy)
    const terrain: BattleTerrain = {
      ok: (x, y) => !this.tileAt(x, y).deep,
      level: (x, y) => this.tileAt(x, y).lv,
      water: (x, y) => this.tileAt(x, y).water,
    };
    const fields: [number, number][] = [];
    for (const b of WAR_BATTLES) {
      const city = this.cities[b.city] ?? this.cities[0];
      const [cx, cy] = b.siege ? this.siegeNear(city, b) : this.fieldNear(city, b, fields);
      fields.push([cx, cy]);
      const setup = warSetup(b, cx, cy, terrain, b.siege ? { x: city.x, y: city.y } : null);
      const sim = warSim(b, setup);
      const layer = new BattleLayer(sim, this.art, this.sides, this.cultures, 0);
      layer.cinematic = true;
      this.battles.push({ spec: b, sim, layer, cx, cy, done: new Set() });
      this.prefetchVehicles(b);
    }
    // --- the grand campaign's map ---
    say('AS NAÇÕES…');
    await this.makeCampaign(session, grid);
  }

  /** the terrain under a world point (cached) */
  tileAt(x: number, y: number): Tile {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const k = ty * WORLD_TILES_X + (((tx % WORLD_TILES_X) + WORLD_TILES_X) % WORLD_TILES_X);
    let t = this.tiles.get(k);
    if (!t) {
      const tg = this.tg;
      if (!tg) return LAND;
      const i = tg.tile(tx, ty);
      t = { water: i.g <= Ground.SWAMP_WATER, deep: i.g === Ground.DEEP_WATER, river: i.g === Ground.RIVER_WATER, forest: i.forest, lv: tg.levelOf(i, tx, ty), zone: i.zone };
      if (this.tiles.size > 300000) this.tiles.clear();
      this.tiles.set(k, t);
    }
    return t;
  }

  /** how a rectangle of ground suits a battle: water, woods, slopes and houses count against it */
  private ground(x: number, y: number, hl: number, hw: number, step: number) {
    let n = 0, water = 0, wood = 0, l = 0, l2 = 0;
    for (let dy = -hw; dy <= hw; dy += step) for (let dx = -hl; dx <= hl; dx += step) {
      const t = this.tileAt(x + dx, y + dy); n++;
      if (t.water) water++;
      wood += t.forest;
      l += t.lv; l2 += t.lv * t.lv;
    }
    let houses = 0;
    for (let i = 0; i < this.built.length; i += 2) if (Math.abs(this.built[i] - x) < hl + 60 && Math.abs(this.built[i + 1] - y) < hw + 60) houses++;
    return -(water / n) * 8 - (wood / n) * 5 - Math.min(3, l2 / n - (l / n) ** 2) * 0.6 - Math.min(4, houses * 0.25);
  }

  /** a battle field: open, dry, flat grassland clear of every town and of the other fields, anywhere in the
   *  region (the cities fill the land around each other), a little nearer its own city when it can */
  private fieldNear(city: EraCity, b: WarBattle, taken: [number, number][]): [number, number] {
    const g = this.grid!, S = this.S, c0 = this.spots.centre;
    const at = (x: number, y: number) => { const i = ((Math.floor(x / S) % g.w) + g.w) % g.w, j = Math.max(0, Math.min(g.h - 1, Math.floor(y / S))); return j * g.w + i; };
    // a first cut on the planet grid (dry land, temperate grass rather than forest biomes), then the tiles decide
    const cands: { x: number; y: number; s: number }[] = [];
    for (let y = c0.y - 30000; y <= c0.y + 30000; y += 1500) for (let x = c0.x - 30000; x <= c0.x + 30000; x += 1500) {
      if (taken.some(([tx, ty]) => Math.abs(tx - x) < b.hl * 2.6 && Math.abs(ty - y) < b.hw * 2.6)) continue;
      let land = 0, n = 0, wood = 0;
      for (let dy = -b.hw; dy <= b.hw; dy += b.hw / 2) for (let dx = -b.hl; dx <= b.hl; dx += b.hl / 3) {
        const k = at(x + dx, y + dy); n++;
        if (g.elev[k] >= g.sea && !g.river[k]) land++;
        if (g.moist[k] > 125 || g.temp[k] < 90) wood++;
      }
      if (land < n) continue;
      cands.push({ x, y, s: -wood / n - Math.hypot(x - city.x, y - city.y) / 40000 });
    }
    cands.sort((p, q) => q.s - p.s);
    let best: [number, number] = cands.length ? [cands[0].x, cands[0].y] : [city.x + 4000, city.y], bs = -Infinity;
    for (const c of cands.slice(0, 50)) {
      const sc = this.ground(c.x, c.y, b.hl, b.hw, 128) + c.s * 0.5;
      if (sc > bs) { bs = sc; best = [c.x, c.y]; }
    }
    return best;
  }

  /** a siege: the town square is the target; the besiegers deploy west of it on dry, open ground */
  private siegeNear(city: EraCity, b: WarBattle): [number, number] {
    let best: [number, number] = [city.x - b.hl * 0.3, city.y], bs = -Infinity;
    for (let oy = -700; oy <= 700; oy += 100) for (let ox = -0.45; ox <= -0.1; ox += 0.05) {
      const cx = city.x + ox * b.hl, cy = city.y + oy;
      // the attackers' deployment zone (see BattleSim: centre hl * 0.62 behind, +-0.3 hl x +-0.9 hw)
      const sc = this.ground(cx - b.hl * 0.62, cy, b.hl * 0.34, b.hw * 0.9, 48) - Math.abs(oy) / 1500;
      if (sc > bs) { bs = sc; best = [cx, cy]; }
    }
    return best;
  }

  /** the best spot under the sea near the region: frames of +-hw x +-hh world px all water (no river), scored by
   *  their sea zones (shares of coast / open sea / abyss tiles) */
  private underSpot(cands: { k: number; d: number }[], hw: number, hh: number, score: (cz: number, op: number, ab: number) => number) {
    const g = this.grid!, S = this.S;
    cands.sort((p, q) => p.d - q.d);
    // no frame scores: the all-water frame with the least coast (still under the sea, if not the wanted zone)
    let fall: { x: number; y: number } | null = null, fs = Infinity;
    for (const c of cands.slice(0, 40)) {
      const px = (c.k % g.w) * S, py = Math.floor(c.k / g.w) * S;
      let best: { x: number; y: number } | null = null, bs = 0;
      for (let y = py; y < py + S; y += 128) for (let x = px; x < px + S; x += 128) {
        let n = 0, cz = 0, op = 0, ab = 0;
        frame: for (let dy = -hh; dy <= hh; dy += hh / 3) for (let dx = -hw; dx <= hw; dx += hw / 4) {
          const t = this.tileAt(x + dx, y + dy);
          if (!t.water || t.river) { n = -1; break frame; }
          n++;
          if (t.zone === SeaZone.COAST) cz++; else if (t.zone === SeaZone.OPEN) op++; else if (t.zone === SeaZone.ABYSS) ab++;
        }
        if (n <= 0) continue;
        const sc = score(cz / n, op / n, ab / n);
        if (sc > bs) { bs = sc; best = { x, y }; }
        if (cz / n < fs) { fs = cz / n; fall = { x, y }; }
      }
      if (best) return best;
    }
    return fall ?? { x: NaN, y: NaN };
  }

  /** war machines face east (the attackers) and west (the defenders): their sheets start rendering now */
  private prefetchVehicles(b: WarBattle) {
    for (const k of [0, 1] as const) for (const id of new Set(k === 0 ? b.a : b.d)) {
      const u = unitById(id);
      if (!u.veh) continue;
      for (const dir of k === 0 ? ['E', 'SE', 'NE'] : ['W', 'SW', 'NW']) for (const anim of ['idle', 'move', 'use'] as const) this.art.vehicle(this.cultures[k], u, b.era[k], dir as (typeof DIRS)[number], anim, 50);
    }
  }

  private async makeCampaign(session: PlanetSession, grid: PlanetGrid) {
    const world = new CampaignWorld(grid);
    const raw = await session.citySites(44, 77);
    const S = this.S;
    const sites: Site[] = raw.map(s => {
      const x = (s.tx + 0.5) * TILE, y = (s.ty + 0.5) * TILE;
      const seed = (Math.imul(s.tx, 73856093) ^ Math.imul(s.ty, 19349663)) >>> 0;
      return { x, y, tx: s.tx, ty: s.ty, capital: s.capital, evo: s.evo, coast: false, fert: grid.fert[world.cellOf(x, y)] / 255, name: cityName(seed, false, 0), seed };
    });
    if (!sites.length) return;
    const c = newCampaign(world, { seed: 77, era: 0, home: this.spots.centre, sites, species: `${WAR_SPECIES.genus} ${WAR_SPECIES.species}`, rivals: 9 });
    world.buildRegions(c.settlements);
    const fog = new Discovery('trailer-war-map', grid.w, grid.h);
    fog.mask.fill(1);
    const genomes = c.factions.map(f => factionGenome(WAR_SPECIES, f.color));
    const layer = new CampaignLayer(c, world, this.art, genomes, fog);
    layer.cinematic = true;
    const snaps: { owners: number[]; armies: Army[] }[] = [];
    const snap = () => snaps.push({ owners: c.settlements.map(s => s.owner), armies: c.armies.map(a => ({ ...a, regs: a.regs.map(r => ({ ...r })) })) });
    snap();
    this.campaign = { c, layer, snaps };
    void S;
    // the turns are played in the background (a few per beat of the map shot)
    const hooks = { playerBattle: async (b: Parameters<typeof autoResolve>[1]) => { applyOutcome(c, world, b, autoResolve(c, b)); } };
    (async () => {
      for (let r = 0; r < 30 && !this.dead; r++) {
        for (const f of c.factions) if (f.alive) { await aiTurn(c, world, f, hooks); await new Promise(res => setTimeout(res, 0)); }
        endTurnEconomy(c, world);
        snap();
      }
    })().catch(() => { /* the map keeps what it has */ });
  }

  /** the map shot: turn `k` of the precomputed campaign */
  showTurn(k: number) {
    const cp = this.campaign;
    if (!cp || !cp.snaps.length) return;
    const s = cp.snaps[Math.max(0, Math.min(cp.snaps.length - 1, k))];
    cp.c.settlements.forEach((q, i) => { q.owner = s.owners[i]; });
    cp.c.armies = s.armies.map(a => ({ ...a }));
    cp.layer.version++;
  }

  dispose() {
    this.dead = true;
    this.store.dispose();
    this.vpool?.dispose();
    this.session?.dispose();
  }
}

/** the point (by a building) whose window of +-hw x +-hh world px holds the most building, near the centre */
function densest(bs: { x: number; y: number; w: number }[], cx: number, cy: number, hw: number, hh: number): { x: number; y: number } {
  let best = { x: cx, y: cy + 120 }, bs0 = -Infinity;
  for (const a of bs) {
    // buildings rise above their ground point: the frame sits a little higher
    const x = a.x, y = a.y - 50;
    let sc = 0;
    for (const b of bs) if (Math.abs(b.x - x) < hw && Math.abs(b.y - 50 - y) < hh) sc += b.w * b.w;
    sc -= Math.hypot(x - cx, y - cy) / 120;
    if (sc > bs0) { bs0 = sc; best = { x, y }; }
  }
  return best;
}

interface Tile { water: boolean; deep: boolean; river: boolean; forest: number; lv: number; zone: number }
const LAND: Tile = { water: false, deep: false, river: false, forest: 0, lv: 0, zone: 0 };
