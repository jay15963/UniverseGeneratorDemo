// Trailer II's drawn scenes (on the film's own canvas, between the shots filmed on the planet): the home world
// from orbit, the microscopic pool where the first cell divides on every beat, the lineage, the species rising,
// its soldiers through the ages, the war machines, the colony ship leaving the planet, the warp to the stars and the
// last flashes. All sprites come from the game's own generators.
import { Stage, type Genome } from '../../../lib/creature/genome';
import { DIRS, type Anim } from '../../../lib/creature/pose';
import type { Sheet } from '../../../lib/fauna/spriteStore';
import { drawKind, spriteCanvas } from '../../../lib/cell/art';
import { Kind, makeSpecies, type CellSpecies } from '../../../lib/cell/look';
import { unitById, type UnitDef } from '../../../lib/game/campaign/units';
import { SpaceShot } from '../../Demo/spaceShot';
import { UniverseScene, GalaxyScene, drawHyperspace, drawCloudFog, ease, zoomLerp } from '../cosmos';
import { drawBackdrop } from '../creatures';
import { mulberry } from '../../../lib/terrain/noise';
import type { WarStage } from './stage';
import { WAR_WORLD, WAR_SPECIES } from './stage';
import { BEAT } from './timeline';

const lin = (t: number, a: number, d: number) => Math.max(0, Math.min(1, (t - a) / d));
const ROW_SE = DIRS.indexOf('SE'), ROW_S = DIRS.indexOf('S');

/** draws a sheet frame at an integer scale (crisp pixels), anchored at its feet */
function blit(ctx: CanvasRenderingContext2D, sh: Sheet, frame: number, row: number, x: number, y: number, k: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sh.canvas, (frame % sh.frames) * sh.cw, row * sh.ch, sh.cw, sh.ch, Math.round(x - sh.ax * k), Math.round(y - sh.ay * k), sh.cw * k, sh.ch * k);
  ctx.restore();
}
function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, k = 0.7) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------------------------------
// The home world from orbit (the film opens on it), then a fall through its clouds
// ---------------------------------------------------------------------------------------------------
export class GlobeScene {
  private shot = new SpaceShot(WAR_WORLD, [255, 226, 180], false, 70, 1024);
  constructor() { this.shot.maxSize = 900; }
  get ready() { return !!this.shot.tex; }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, dt: number, t0: number, t1: number) {
    const u = (t - t0) / (t1 - t0), m = Math.min(w, h);
    const fall = lin(t, t1 - BEAT * 1.5, BEAT * 1.5);
    const pr = m * zoomLerp(0.22, 0.4, ease(u)) * zoomLerp(1, 6, fall * fall);
    this.shot.draw(ctx, w, h, dpr, t + 40, dt, w / 2, h * 0.52, pr, w * 0.08, h * 0.12);
    if (fall > 0) drawCloudFog(ctx, w, h, Math.pow(fall, 1.3), t);
  }
}

// ---------------------------------------------------------------------------------------------------
// The microscopic pool: one cell, then two, four... one division per beat; rivals close in
// ---------------------------------------------------------------------------------------------------
export class CellScene {
  private own: { mother: HTMLCanvasElement[]; kinds: HTMLCanvasElement[][] };
  private rival: HTMLCanvasElement[][];
  constructor(sp: CellSpecies = WAR_SPECIES) {
    const frames = (s: ReturnType<typeof drawKind>) => s.frames.map((_, i) => spriteCanvas(s, i));
    this.own = { mother: frames(drawKind(sp, Kind.MOTHER)), kinds: [Kind.WORKER, Kind.HUNTER, Kind.PHOTO, Kind.SCOUT, Kind.ARMOR].map(k => frames(drawKind(sp, k))) };
    const r = makeSpecies('war-trailer-rival', 'alien');
    this.rival = [Kind.HUNTER, Kind.SPITTER, Kind.WORKER].map(k => frames(drawKind(r, k)));
  }
  /** cell i: its birth beat, parent and drift direction */
  private pos(i: number, u: number): [number, number] {
    if (i === 0) return [Math.sin(u * 0.7) * 3, Math.cos(u * 0.5) * 3];
    const gen = Math.floor(Math.log2(i)) + 1, born = gen - 1, parent = i - (1 << (gen - 1));
    const [px, py] = this.pos(parent, u);
    const h = Math.sin(i * 12.9898) * 43758.5453, a = (h - Math.floor(h)) * Math.PI * 2;
    const age = Math.max(0, u / BEAT - born);
    const d = 30 * ease(age / 0.6) * (1 + Math.min(1.5, age * 0.05));
    return [px + Math.cos(a) * d + Math.sin(u * 0.8 + i) * 2, py + Math.sin(a) * d + Math.cos(u * 0.6 + i * 1.3) * 2];
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, t0: number, t1: number) {
    const u = t - t0, beats = Math.floor(u / BEAT);
    // the pool: deep teal, drifting light ribbons and motes
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#0d3a37'); g.addColorStop(0.6, '#06201f'); g.addColorStop(1, '#020a0a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `rgba(120,255,220,${0.035 + (i % 3) * 0.012})`; ctx.lineWidth = 18 + i * 6;
      ctx.beginPath();
      for (let x = -40; x <= w + 40; x += 40) { const y = h * (0.1 + i * 0.13) + Math.sin(x * 0.006 + t * (0.4 + i * 0.07) + i) * 40; if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const r = mulberry(5);
    for (let i = 0; i < 90; i++) {
      const z = 0.3 + r() * 0.7, x = ((r() * w + t * 12 * z) % (w + 20)) - 10, y = ((r() * h - t * 6 * z) % h + h) % h;
      ctx.fillStyle = `rgba(170,255,230,${0.1 + z * 0.15})`; ctx.fillRect(x, y, 1 + z * 2, 1 + z * 2);
    }
    ctx.restore();
    // the colony
    const n = Math.min(128, 1 << Math.max(0, beats));
    const scale = Math.min(w, h) / 260 / Math.pow(Math.max(1, n), 0.33) * (1 + 0.15 * Math.sin(u * 0.4));
    const cx = w / 2, cy = h / 2, fr = Math.floor(t * 8);
    const draw = (c: HTMLCanvasElement, x: number, y: number, ang: number, k: number, alpha = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(ang); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, -c.width * k / 2, -c.height * k / 2, c.width * k, c.height * k); ctx.restore();
    };
    for (let i = n - 1; i >= 0; i--) {
      const [x, y] = this.pos(i, u), [x2, y2] = this.pos(i, u + 0.05);
      const set = i === 0 ? this.own.mother : this.own.kinds[i % this.own.kinds.length];
      const gen = i ? Math.floor(Math.log2(i)) : 0, birth = gen * BEAT;
      const pop = i ? ease((u - birth) / 0.25) : 1;
      draw(set[fr % set.length], cx + x * scale * 2.2, cy + y * scale * 2.2, Math.atan2(y2 - y, x2 - x), scale * (i === 0 ? 1.6 : 1) * (0.6 + 0.4 * pop));
    }
    // rival cells close in from the edges in the second half
    const rv = lin(t, t0 + (t1 - t0) * 0.45, (t1 - t0) * 0.5);
    if (rv > 0) for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3, R = Math.max(w, h) * (0.75 - rv * 0.3) + Math.sin(i * 7) * 30;
      const set = this.rival[i % this.rival.length];
      draw(set[(fr + i) % set.length], cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.7, a + Math.PI, scale * 1.4, rv);
    }
    // the division beat pulses
    const k = Math.exp(-((u % BEAT) / BEAT) * 6);
    ctx.fillStyle = `rgba(160,255,230,${0.1 * k})`; ctx.fillRect(0, 0, w, h);
    vignette(ctx, w, h, 0.75);
  }
}

// ---------------------------------------------------------------------------------------------------
// The lineage: the species at one stage, big, on its stage set
// ---------------------------------------------------------------------------------------------------
export class LineageScene {
  constructor(private stage: WarStage) {}
  private key(st: Stage, anim: Anim) { return `wartr|${this.stage.genome.seed}|${st}|${anim}`; }
  sheet(st: Stage, anim: Anim): Sheet | null { return this.stage.store.get(this.key(st, anim), this.stage.genome, st, anim, 1, 0); }
  static anim(st: Stage): Anim { return st <= Stage.AQUA_LEVIATHAN ? 'swim' : st >= Stage.TRIBAL ? 'walk' : 'walk'; }
  preload(list: Stage[]) { for (const s of list) this.sheet(s, LineageScene.anim(s)); }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, st: Stage, hue: number, flash = 0) {
    drawBackdrop(ctx, w, h, st, t, hue);
    const sh = this.sheet(st, LineageScene.anim(st));
    if (sh) {
      const size = st === Stage.CELL ? 0.5 : st <= Stage.AQUA ? 0.6 : st >= Stage.TRIBAL ? 0.74 : st === Stage.AQUA_GIANT || st === Stage.LAND_GIANT || st === Stage.AQUA_LEVIATHAN ? 0.8 : 0.66;
      const k = Math.max(1, Math.round((Math.min(w, h) * size) / Math.max(sh.ch, sh.cw * 0.8)));
      const grounded = st >= Stage.AMPHIBIAN, cy = st >= Stage.TRIBAL ? h * 0.74 : h * 0.58;
      if (grounded) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(w / 2, cy + 2, sh.cw * k * 0.3, sh.cw * k * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
      blit(ctx, sh, Math.floor(t * 9), st === Stage.CELL ? 0 : ROW_SE, w / 2, cy, k);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, w, h); }
    vignette(ctx, w, h, 0.6);
  }
}

// ---------------------------------------------------------------------------------------------------
// Soldiers through the ages: one hero walking at the camera, the regiment marching behind
// ---------------------------------------------------------------------------------------------------
export const SOLDIERS: [number, string][] = [[0, 'clubs'], [1, 'menatarms'], [2, 'line'], [3, 'riflemen'], [4, 'inf'], [5, 'inf'], [6, 'inf'], [7, 'inf']];
const ERA_SKY: [string, string][] = [['#3a2414', '#0d0704'], ['#3b2f23', '#0c0a07'], ['#3a3328', '#0c0b08'], ['#2f2e2a', '#0a0a09'], ['#2a2f29', '#090b09'], ['#1f2a33', '#06090c'], ['#1a2236', '#05070d'], ['#20163a', '#06040e']];
export class SoldiersScene {
  constructor(private stage: WarStage) {}
  sheet(i: number, anim: 'walk' | 'idle' | 'use' = 'walk'): Sheet | null {
    const [era, id] = SOLDIERS[i];
    return this.stage.art.soldier(this.stage.sides[0], era, unitById(id), anim);
  }
  preload() { SOLDIERS.forEach((_, i) => { this.sheet(i, 'walk'); this.sheet(i, 'use'); }); }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, i: number, u: number) {
    const [a, b] = ERA_SKY[i];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // embers / ash / snow of war drifting
    const r = mulberry(11 + i);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 70; k++) {
      const z = 0.3 + r() * 0.7, x = ((r() * w + t * 18 * z) % (w + 10)), y = ((r() * h - t * 30 * z) % h + h) % h;
      ctx.fillStyle = i <= 2 ? `rgba(255,${140 + z * 60},60,${0.25 * z})` : i <= 4 ? `rgba(220,220,210,${0.18 * z})` : `rgba(120,200,255,${0.25 * z})`;
      ctx.fillRect(x, y, 1 + z * 2, 1 + z * 2);
    }
    ctx.restore();
    const sh = this.sheet(i, 'walk');
    if (!sh) return;
    const big = Math.max(1, Math.round((Math.min(w, h) * 0.5) / sh.ch));
    // the regiment behind (smaller, darker, marching in step)
    const back = Math.max(1, Math.round(big / 3));
    for (let row = 3; row >= 0; row--) {
      const y = h * (0.5 + row * 0.07), k = Math.max(1, back - (3 - row) * 0);
      for (let c = -8; c <= 8; c++) {
        const x = w / 2 + c * sh.cw * k * 0.9 + (row % 2) * sh.cw * k * 0.45 - (u * 30) % (sh.cw * k * 0.9);
        blit(ctx, sh, Math.floor(t * 9) + row, ROW_SE, x, y, k, 0.55 - row * 0.1);
      }
    }
    // haze over the regiment, then the hero
    const hz = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.8);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, w, h);
    const ux = w * (0.52 - u * 0.04);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(ux, h * 0.86, sh.cw * big * 0.28, sh.cw * big * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    blit(ctx, sh, Math.floor(t * 8), ROW_SE, ux, h * 0.86, big);
    vignette(ctx, w, h, 0.7);
  }
}

// ---------------------------------------------------------------------------------------------------
// War machines: one per beat, firing
// ---------------------------------------------------------------------------------------------------
export const MACHINES: [number, string][] = [[1, 'trebuchet'], [2, 'cannon'], [3, 'howitzer'], [3, 'tank1'], [4, 'tank'], [5, 'heli'], [6, 'heavytank'], [7, 'heavytank']];
export class MachinesScene {
  constructor(private stage: WarStage) {}
  sheet(i: number) {
    const [era, id] = MACHINES[i];
    return this.stage.art.vehicle(this.stage.cultures[0], unitById(id), era, 'SE', id === 'heli' ? 'move' : 'use', 5);
  }
  preload() { MACHINES.forEach((_, i) => this.sheet(i)); }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, i: number, u: number) {
    const g = ctx.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, Math.max(w, h) * 0.7);
    g.addColorStop(0, i < 3 ? '#3a2a1c' : i < 6 ? '#2c2e2c' : '#1d1f35'); g.addColorStop(1, '#050505');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sh = this.sheet(i);
    // muzzle light on the beat
    const kick = Math.exp(-u * 7);
    if (sh) {
      const k = Math.max(1, Math.floor((Math.min(w, h) * 0.55) / Math.max(sh.h, sh.w * 0.7)));
      const x = w / 2 + (u - 0.5) * 30, y = h * 0.66 + Math.sin(t * 9) * (MACHINES[i][1] === 'heli' ? 6 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x, h * 0.7, sh.w * k * 0.35, sh.w * k * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const f = Math.floor(t * 10) % sh.frames;
      ctx.drawImage(sh.c, f * sh.w, 0, sh.w, sh.h, Math.round(x - sh.ax * k), Math.round(y - sh.ay * k - (MACHINES[i][1] === 'heli' ? h * 0.12 : 0)), sh.w * k, sh.h * k);
      ctx.restore();
    }
    ctx.fillStyle = `rgba(255,200,120,${0.18 * kick})`; ctx.fillRect(0, 0, w, h);
    vignette(ctx, w, h, 0.65);
  }
}

// ---------------------------------------------------------------------------------------------------
// The colony ship leaves the home world; the warp; the universe
// ---------------------------------------------------------------------------------------------------
const SHIP: UnitDef = { ...unitById('jets'), id: 'colonyship', veh: { type: 'airTransport', size: 'large' } };
export class LaunchScene {
  private globe = new SpaceShot(WAR_WORLD, [255, 226, 180], false, 70, 1024);
  constructor(private stage: WarStage) { this.globe.maxSize = 1100; }
  ship(dir: 'N' | 'NE' = 'N') { return this.stage.art.vehicle(this.stage.cultures[0], SHIP, 7, dir, 'move', 1); }
  preload() { this.ship('N'); this.ship('NE'); }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, dt: number, u: number) {
    const m = Math.min(w, h);
    // the planet fills the bottom of the frame, sinking away as we climb
    const pr = m * zoomLerp(1.6, 0.55, ease(u));
    this.globe.draw(ctx, w, h, dpr, t + 40, dt, w / 2, h * 0.5 + pr * zoomLerp(0.85, 1.3, ease(u)), pr, w * 0.85, h * 0.12);
    const sh = this.ship('N');
    if (!sh) return;
    const k = Math.max(1, Math.round(zoomLerp(0.6, 3.2, ease(u)) * (m / 700)));
    const x = w / 2 + Math.sin(u * 3) * 10, y = h * zoomLerp(0.7, 0.45, ease(u));
    // engine light and exhaust trail
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const q = i / 18, ey = y + sh.h * k * 0.1 + q * h * 0.35, r = sh.w * k * (0.18 - q * 0.12);
      const g = ctx.createRadialGradient(x, ey, 0, x, ey, Math.max(1, r));
      g.addColorStop(0, `rgba(160,220,255,${0.5 * (1 - q)})`); g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, ey, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sh.c, (Math.floor(t * 10) % sh.frames) * sh.w, 0, sh.w, sh.h, Math.round(x - sh.ax * k), Math.round(y - sh.ay * k), sh.w * k, sh.h * k);
    ctx.restore();
  }
}
export class CosmosScene {
  readonly universe = new UniverseScene('Claude');
  readonly galaxy: GalaxyScene;
  constructor() {
    const g = this.universe.galaxies.filter(q => !q.isDead && q.size > 1).sort((a, b) => b.size - a.size)[1] ?? this.universe.target;
    this.galaxy = new GalaxyScene(g);
  }
  warm(n: number) { return this.universe.warm(n); }
  /** the warp: hyperspace streaks, then a galaxy spinning closer, the ship a spark diving in */
  warp(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, u: number) {
    const sc = zoomLerp(0.9, 2.6, ease(u));
    this.galaxy.draw(ctx, w, h, t, 0, 0, sc, t * 0.04);
    const p = Math.max(0, 1 - u * 4);
    if (p > 0) drawHyperspace(ctx, w, h, p, 'out');
    // the ship's spark heading into the core
    const sx = w * (0.15 + u * 0.35), sy = h * (0.85 - u * 0.35);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    g.addColorStop(0, 'rgba(220,240,255,1)'); g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - w * 0.12, sy + h * 0.12); ctx.stroke();
    ctx.restore();
  }
  /** the whole universe, the camera pulling out from the target galaxy */
  out(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, u: number) {
    const U = this.universe;
    const s0 = U.fillScale(w, h, 1.2), s1 = U.fillScale(w, h, 0.03);
    const c = 1 - ease(u);
    U.draw(ctx, w, h, t, U.target.x * c, U.target.y * c, zoomLerp(s0, s1, ease(u)));
  }
}

// ---------------------------------------------------------------------------------------------------
// The last hits: one image per hit, a white flash, darkness between
// ---------------------------------------------------------------------------------------------------
export function drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hit: number, i: number, soldiers: SoldiersScene, machines: MachinesScene, g?: Genome) {
  const u = t - hit;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const fade = Math.exp(-u * 3.2);
  ctx.save(); ctx.globalAlpha = Math.min(1, fade * 1.4);
  if (i % 2 === 0) soldiers.draw(ctx, w, h, t, Math.min(7, 7 - (i >> 1) * 2), 0.5);
  else machines.draw(ctx, w, h, t, Math.min(7, 8 - i), 0.5);
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.85 - u * 6)})`; ctx.fillRect(0, 0, w, h);
  void g; void ROW_S;
}
