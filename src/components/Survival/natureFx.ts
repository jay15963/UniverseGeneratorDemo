// Ambient nature animation for the survival view: wind, weather, fauna-ish particles and light.
// World-space effects are drawn with the camera transform; screen-space ones (rain, night) without.
import { Feat, Feature, LIFT, TILE } from '../../lib/terrain/types';
import { mulberry } from '../../lib/terrain/noise';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';

interface Leaf { x: number; y: number; z: number; vx: number; ph: number; col: string; life: number; l: number }
interface Fly { x: number; y: number; hx: number; hy: number; z: number; ph: number; col: string; life: number; l: number }
interface Bug { x: number; y: number; hx: number; hy: number; ph: number; life: number; l: number }
interface Bird { x: number; y: number; vx: number; vy: number; ph: number }
interface Ring { x: number; y: number; r: number; max: number; life: number; col: string }
interface Mote { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; size: number }
interface Drop { x: number; y: number; v: number; len: number }
interface Fish { x: number; y: number; t: number; dir: number; l: number }

export interface FxContext {
  t: number;            // seconds
  dt: number;
  day: number;          // 0..1 (0 = midnight)
  sun: number;          // -1 night .. 1 noon
  view: { x0: number; y0: number; x1: number; y1: number };
  player: { x: number; y: number; lift: number };
  visible: Feature[];   // visible features this frame
  waterSpots: { x: number; y: number; l: number }[]; // a few random visible water tiles
  lavaSpots: { x: number; y: number; l: number }[];
  falls: { x: number; y: number; w: number; h: number }[];
  climate: { temp: number; moist: number; living: boolean; desert: boolean };
  /** Terrain probe for rain hits: null = not loaded. */
  surface: (x: number, y: number) => { water: boolean; lift: number } | null;
}

interface Bolt { pts: [number, number][]; branches: [number, number][][]; life: number }

const LEAF_COLS: Record<number, string[]> = {
  [Feat.OAK]: ['#5b9a3a', '#86bd4f', '#3f7a31'],
  [Feat.BIRCH]: ['#b8dd66', '#dff08c', '#e8d060'],
  [Feat.MAPLE]: ['#e8943d', '#c9692a', '#f7c35d', '#b0402a'],
  [Feat.WILLOW]: ['#86b257', '#aacd73'],
  [Feat.KAPOK]: ['#48a544', '#2e843a'],
};
const BUTTERFLY = ['#f5a623', '#ffffff', '#6fb8ff', '#ffe066', '#ff7ab8', '#b28cff'];

export class NatureFx {
  leaves: Leaf[] = [];
  flies: Fly[] = [];       // butterflies
  bugs: Bug[] = [];        // fireflies
  birds: Bird[] = [];
  rings: Ring[] = [];
  motes: Mote[] = [];      // embers, mist, splash, pollen
  drops: Drop[] = [];      // rain / snow (screen space)
  fish: Fish[] = [];
  weather: Weather = 'clear';
  intensity = 0;           // 0..1 current weather strength
  wind = 0.6;
  private nextWeather = 60;
  private nextFlock = 8;
  private rng = mulberry(1234);
  private darkCanvas: HTMLCanvasElement;
  private lightningFlash = 0;
  private bolts: Bolt[] = [];
  private shakeT = 0;
  private thunderIn = -1;
  private glow: HTMLCanvasElement = bakeGlow();

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.darkCanvas = document.createElement('canvas');
    this.nextWeather = 40 + this.rng() * 60;
  }

  get rainy() { return this.weather === 'rain' || this.weather === 'storm'; }
  /** warm light around the player at night (off for the cinematic camera) */
  lantern = true;
  /** Pins the weather (scripted scenes); the random state machine stays off until `release`. */
  force(w: Weather, instant = false) {
    this.weather = w; this.nextWeather = 1e9;
    if (instant) this.intensity = w === 'clear' ? 0 : w === 'cloudy' ? 0.45 : 1;
  }
  release() { this.nextWeather = 20; }

  update(c: FxContext) {
    const { dt, t } = c;
    const R = this.rng;
    // --- weather state machine ---
    this.nextWeather -= dt;
    if (this.nextWeather <= 0) {
      const roll = R();
      const cold = c.climate.temp < 0.3;
      if (roll < 0.45) this.weather = 'clear';
      else if (roll < 0.65) this.weather = 'cloudy';
      else if (c.climate.desert) this.weather = 'cloudy';
      else if (cold) this.weather = 'snow';
      else this.weather = roll < 0.9 ? 'rain' : 'storm';
      if (!c.climate.living && this.weather !== 'clear') this.weather = cold ? 'snow' : 'cloudy';
      this.nextWeather = 70 + R() * 110;
    }
    const target = this.weather === 'clear' ? 0 : this.weather === 'cloudy' ? 0.45 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.25);
    this.wind = 0.55 + Math.sin(t * 0.21) * 0.25 + Math.sin(t * 0.73) * 0.1 + (this.rainy ? 0.6 * this.intensity : 0) + (this.weather === 'storm' ? 0.4 : 0);

    const daylight = c.sun > 0.05;
    const night = c.sun < -0.1;
    const { x0, y0, x1, y1 } = c.view;

    // --- falling leaves from visible broadleaf trees ---
    if (c.climate.living && this.leaves.length < 50 && R() < dt * (1.5 + this.wind * 2.5)) {
      const trees = c.visible.filter(f => LEAF_COLS[f.t]);
      if (trees.length) {
        const f = trees[Math.floor(R() * trees.length)];
        const cols = LEAF_COLS[f.t];
        this.leaves.push({ x: f.x + (R() - 0.5) * 24, y: f.y + R() * 6, z: 16 + R() * 22, vx: (R() - 0.2) * 6, ph: R() * 6, col: cols[Math.floor(R() * cols.length)], life: 0, l: f.l });
      }
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const L = this.leaves[i];
      L.life += dt;
      if (L.z > 0) {
        L.z -= dt * (5 + Math.sin(L.ph + t * 3) * 2);
        L.x += (L.vx + this.wind * (this.weather === 'storm' ? 40 : 9) + Math.sin(L.ph + t * 2.2) * 8) * dt;
        L.y += Math.cos(L.ph + t * 1.7) * 3 * dt;
        if (L.z < 0) L.z = 0;
      } else if (L.life > 14) this.leaves.splice(i, 1);
      if (L.x < x0 - 60 || L.x > x1 + 60) this.leaves.splice(i, 1);
    }

    // --- butterflies around flowers (day) ---
    if (daylight && !this.rainy && this.flies.length < 7 && R() < dt * 0.8) {
      const flowers = c.visible.filter(f => f.t === Feat.FLOWER || f.t === Feat.FLAX || f.t === Feat.BERRY_RED);
      if (flowers.length) {
        const f = flowers[Math.floor(R() * flowers.length)];
        this.flies.push({ x: f.x, y: f.y, hx: f.x, hy: f.y, z: 8, ph: R() * 6, col: BUTTERFLY[Math.floor(R() * BUTTERFLY.length)], life: 0, l: f.l });
      }
    }
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const b = this.flies[i];
      b.life += dt;
      b.ph += dt;
      const tx = b.hx + Math.sin(b.ph * 0.7) * 22 + Math.sin(b.ph * 1.9) * 6, ty = b.hy + Math.cos(b.ph * 0.5) * 12;
      b.x += (tx - b.x) * dt * 1.5 + this.wind * 3 * dt; b.y += (ty - b.y) * dt * 1.5;
      b.z = 7 + Math.sin(b.ph * 2.3) * 4;
      if (b.life > 40 || !daylight || this.rainy) { b.hy -= dt * 30; if (b.life > 44 || b.y < y0 - 40) this.flies.splice(i, 1); }
    }

    // --- fireflies (night) ---
    if (night && c.climate.living && !this.rainy && this.bugs.length < 30 && R() < dt * 6) {
      const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
      this.bugs.push({ x, y, hx: x, hy: y, ph: R() * 6, life: 0, l: 0 });
    }
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i];
      b.life += dt; b.ph += dt;
      b.x = b.hx + Math.sin(b.ph * 0.6) * 14 + Math.sin(b.ph * 1.7) * 4;
      b.y = b.hy + Math.cos(b.ph * 0.45) * 9;
      if (b.life > 25 || !night) this.bugs.splice(i, 1);
    }

    // --- bird flocks crossing the sky (day) ---
    this.nextFlock -= dt;
    if (daylight && c.climate.living && this.nextFlock <= 0 && !this.rainy) {
      this.nextFlock = 20 + R() * 40;
      const n = 3 + Math.floor(R() * 6);
      const fromLeft = R() < 0.5;
      const vx = (fromLeft ? 1 : -1) * (45 + R() * 20), vy = (R() - 0.5) * 20;
      const sx = fromLeft ? x0 - 80 : x1 + 80, sy = y0 + R() * (y1 - y0);
      for (let k = 0; k < n; k++) {
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
        this.birds.push({ x: sx - Math.sign(vx) * row * 9, y: sy + side * row * 7, vx, vy, ph: R() * 6 });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * 9;
      if (b.x < x0 - 200 || b.x > x1 + 200) this.birds.splice(i, 1);
    }

    // --- fish jumping in nearby water ---
    if (c.waterSpots.length && this.fish.length < 2 && R() < dt * 0.25) {
      const w = c.waterSpots[Math.floor(R() * c.waterSpots.length)];
      this.fish.push({ x: w.x, y: w.y, t: 0, dir: R() < 0.5 ? -1 : 1, l: w.l });
      this.ring(w.x, w.y - w.l * LIFT, 6, 'rgba(220,240,255,0.6)');
    }
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      f.t += dt;
      if (f.t > 0.7) { this.ring(f.x + f.dir * 10, f.y - f.l * LIFT, 7, 'rgba(220,240,255,0.7)'); this.splash(f.x + f.dir * 10, f.y - f.l * LIFT, 5); this.fish.splice(i, 1); }
    }

    // --- raindrops hitting the ground: rings on water, tiny crowns on land ---
    if (this.rainy && this.intensity > 0.2) {
      const hits = Math.min(40, dt * 260 * this.intensity * (this.weather === 'storm' ? 1.6 : 1));
      for (let k = 0; k < hits; k++) {
        const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
        const sfc = c.surface(x, y);
        if (!sfc) continue;
        if (sfc.water) this.ring(x, y - sfc.lift, 2.5 + R() * 2.5, 'rgba(225,240,255,0.6)');
        else if (R() < 0.5) {
          const yy = y - sfc.lift;
          this.motes.push({ x, y: yy, vx: -6, vy: -10, life: 0, max: 0.18, col: 'rgba(210,225,255,0.8)', size: 1 });
          this.motes.push({ x, y: yy, vx: 6, vy: -10, life: 0, max: 0.18, col: 'rgba(210,225,255,0.8)', size: 1 });
        }
      }
    }
    // --- storm: flying leaves & debris hugging the ground ---
    if (this.weather === 'storm' && this.intensity > 0.5 && c.climate.living) {
      for (let k = 0; k < 3; k++) if (R() < dt * 12) {
        this.leaves.push({ x: x0 - 10, y: y0 + R() * (y1 - y0), z: 2 + R() * 18, vx: 70 + R() * 60, ph: R() * 6, col: ['#5b9a3a', '#86bd4f', '#9a7a4a', '#c9692a'][Math.floor(R() * 4)], life: 0, l: 0 });
      }
    }
    // ambient still-water ripples
    for (const w of c.waterSpots) if (R() < dt * 0.15) this.ring(w.x, w.y - w.l * LIFT, 5 + R() * 4, 'rgba(210,235,255,0.35)');

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt; r.r = r.max * Math.min(1, r.life / 0.7);
      if (r.life > 0.7) this.rings.splice(i, 1);
    }

    // --- lava embers ---
    for (const l of c.lavaSpots) if (R() < dt * 2.5) {
      this.motes.push({ x: l.x + (R() - 0.5) * 14, y: l.y - l.l * LIFT, vx: (R() - 0.5) * 6 + this.wind * 4, vy: -12 - R() * 16, life: 0, max: 1.2 + R() * 1.4, col: R() < 0.5 ? '#ffb03a' : '#ff6a1a', size: 1 });
    }
    // --- waterfall mist ---
    for (const f of c.falls) if (R() < dt * 5) {
      this.motes.push({ x: f.x + R() * f.w, y: f.y + f.h - 1, vx: (R() - 0.5) * 8, vy: -6 - R() * 10, life: 0, max: 0.8 + R(), col: 'rgba(240,250,255,0.8)', size: R() < 0.3 ? 2 : 1 });
    }
    // --- pollen motes in sunny meadows ---
    if (daylight && c.climate.living && !this.rainy && this.motes.length < 120 && R() < dt * 2) {
      this.motes.push({ x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), vx: this.wind * 6, vy: -1 - R() * 2, life: 0, max: 4 + R() * 3, col: 'rgba(255,250,200,0.7)', size: 1 });
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life > m.max) this.motes.splice(i, 1);
    }

    // lightning
    if (this.weather === 'storm' && this.intensity > 0.7 && R() < dt * 0.12) this.strike();
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.5);
    for (let i = this.bolts.length - 1; i >= 0; i--) { this.bolts[i].life -= dt; if (this.bolts[i].life <= 0) this.bolts.splice(i, 1); }
    if (this.thunderIn > 0) { this.thunderIn -= dt; if (this.thunderIn <= 0) this.shakeT = 0.9; }
    this.shakeT = Math.max(0, this.shakeT - dt);
  }

  /** Lightning: a jagged bolt (normalised screen coords) with side branches, flash, delayed thunder. */
  strike() {
    const R = this.rng;
    const pts: [number, number][] = [];
    let x = 0.15 + R() * 0.7, y = -0.05;
    const endY = 0.45 + R() * 0.4;
    while (y < endY) { pts.push([x, y]); y += 0.03 + R() * 0.05; x += (R() - 0.5) * 0.06; }
    pts.push([x, endY]);
    const branches: [number, number][][] = [];
    for (let b = 0; b < 3; b++) {
      const start = pts[1 + Math.floor(R() * (pts.length - 2))];
      const br: [number, number][] = [start];
      let bx = start[0], by = start[1];
      const dir = R() < 0.5 ? -1 : 1;
      for (let k = 0; k < 4; k++) { bx += dir * (0.01 + R() * 0.03); by += 0.02 + R() * 0.03; br.push([bx, by]); }
      branches.push(br);
    }
    this.bolts.push({ pts, branches, life: 0.28 });
    this.lightningFlash = 1;
    this.thunderIn = 0.4 + R() * 0.8;
  }

  ring(x: number, y: number, max: number, col: string) { if (this.rings.length < 220) this.rings.push({ x, y, r: 0, max, life: 0, col }); }
  splash(x: number, y: number, n: number, col = 'rgba(230,245,255,0.9)', spread = 30) {
    for (let k = 0; k < n; k++) this.motes.push({ x: x + (this.rng() - 0.5) * spread * 0.2, y, vx: (this.rng() - 0.5) * spread, vy: -20 - this.rng() * 22, life: 0, max: 0.35 + this.rng() * 0.25, col, size: this.rng() < 0.3 ? 2 : 1 });
  }

  /** Sway offset (px) for vegetation at a world position. */
  sway(t: number, x: number, y: number, k = 1): number {
    const w = this.wind;
    const v = Math.sin(t * (1.1 + w * 1.4) + x * 0.045 + y * 0.021) * w * k;
    // storms bend everything downwind (+x) and whip harder
    const lean = w > 1.2 ? Math.min(2, (w - 1.2) * 2.5) : 0;
    return Math.round(lean + (v > 0.55 ? 1 : v < -0.75 ? -1 : 0) * (w > 1.4 ? 2 : 1));
  }

  dust(x: number, y: number, col: string) {
    for (let k = 0; k < 3; k++) this.motes.push({ x: x + (this.rng() - 0.5) * 4, y: y - 1, vx: (this.rng() - 0.5) * 10 + this.wind * 4, vy: -4 - this.rng() * 5, life: 0, max: 0.35 + this.rng() * 0.3, col, size: this.rng() < 0.3 ? 2 : 1 });
  }

  /** Camera shake offset (world px) after a thunder strike. */
  shake(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const a = this.shakeT * 3;
    return [(this.rng() - 0.5) * a, (this.rng() - 0.5) * a];
  }

  // ---------------------------------------------------------------------------
  // World-space drawing (camera transform active)
  // ---------------------------------------------------------------------------
  drawWorldBelow(ctx: CanvasRenderingContext2D, c: FxContext) {
    // animated waterfalls
    const t = c.t;
    for (const f of c.falls) {
      if (f.x > c.view.x1 || f.x + f.w < c.view.x0) continue;
      for (let x = 0; x < f.w; x++) {
        const seed = (f.x + x) * 7919 % 97;
        for (let k = 0; k < 2; k++) {
          const y = (t * (38 + seed % 20) + seed * 3 + k * f.h * 0.5) % f.h;
          ctx.fillStyle = k ? 'rgba(255,255,255,0.75)' : 'rgba(200,235,255,0.55)';
          ctx.fillRect(f.x + x, f.y + y, 1, 3);
        }
      }
      ctx.fillStyle = 'rgba(245,252,255,0.8)';
      for (let x = 0; x < f.w; x += 2) if (Math.sin(t * 9 + x) > 0) ctx.fillRect(f.x + x, f.y + f.h - 2 + Math.round(Math.sin(t * 7 + x * 3)), 2, 1);
    }
    // ripples
    // ripples batched into 3 opacity buckets -> 3 strokes instead of hundreds
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(225,240,255)';
    for (let bucket = 0; bucket < 3; bucket++) {
      ctx.beginPath();
      let any = false;
      for (const r of this.rings) {
        if (Math.min(2, Math.floor((r.life / 0.7) * 3)) !== bucket) continue;
        ctx.moveTo(r.x + r.r, r.y);
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.45, 0, 0, Math.PI * 2);
        any = true;
      }
      if (any) { ctx.globalAlpha = [0.6, 0.38, 0.16][bucket]; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // fallen leaves on the ground
    for (const L of this.leaves) if (L.z <= 0) {
      ctx.globalAlpha = Math.max(0, 1 - (L.life - 10) / 4);
      ctx.fillStyle = L.col; ctx.fillRect(Math.round(L.x), Math.round(L.y - L.l * LIFT), 2, 1);
    }
    ctx.globalAlpha = 1;
    // lava glow pulse
    ctx.globalCompositeOperation = 'lighter';
    for (const l of c.lavaSpots) {
      ctx.fillStyle = `rgba(255,120,30,${0.08 + 0.07 * Math.sin(t * 2 + l.x * 0.1)})`;
      ctx.fillRect(l.x - TILE / 2, l.y - l.l * LIFT - TILE / 2, TILE, TILE);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWorldAbove(ctx: CanvasRenderingContext2D, c: FxContext) {
    const t = c.t;
    // leaves in the air
    for (const L of this.leaves) if (L.z > 0) {
      ctx.fillStyle = L.col;
      const flip = Math.sin(L.ph + t * 6) > 0;
      ctx.fillRect(Math.round(L.x), Math.round(L.y - L.l * LIFT - L.z), flip ? 2 : 1, flip ? 1 : 2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(Math.round(L.x + 2), Math.round(L.y - L.l * LIFT), 2, 1);
    }
    // butterflies
    for (const b of this.flies) {
      const x = Math.round(b.x), y = Math.round(b.y - b.l * LIFT - b.z);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, Math.round(b.y - b.l * LIFT), 2, 1);
      const open = Math.sin(t * 22 + b.ph * 5) > 0;
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(x, y, 1, 2);
      ctx.fillStyle = b.col;
      if (open) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); }
      else { ctx.fillRect(x - 1, y - 1, 1, 2); ctx.fillRect(x + 1, y - 1, 1, 2); }
    }
    // jumping fish
    for (const f of this.fish) {
      const k = f.t / 0.7;
      const x = f.x + f.dir * 10 * k, y = f.y - f.l * LIFT - Math.sin(k * Math.PI) * 10;
      ctx.fillStyle = '#c8d8e8'; ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
      ctx.fillStyle = '#6a8098'; ctx.fillRect(Math.round(x) + (f.dir > 0 ? -2 : 2), Math.round(y) - 1, 1, 1);
    }
    // motes (embers, mist, pollen, splashes)
    for (const m of this.motes) {
      ctx.globalAlpha = Math.max(0, 1 - m.life / m.max);
      ctx.fillStyle = m.col;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
    }
    ctx.globalAlpha = 1;
    // (cloud shadows: drawn by the view from its procedural cloud field, see clouds.ts)
    // birds high above, with their shadows far below
    for (const b of this.birds) {
      const flap = Math.sin(b.ph) > 0;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(Math.round(b.x + 22), Math.round(b.y + 30), 4, 1);
      const x = Math.round(b.x), y = Math.round(b.y - 40);
      ctx.fillStyle = '#1c1c24';
      ctx.fillRect(x, y, 1, 1);
      if (flap) { ctx.fillRect(x - 2, y - 1, 2, 1); ctx.fillRect(x + 1, y - 1, 2, 1); }
      else { ctx.fillRect(x - 2, y + 1, 2, 1); ctx.fillRect(x + 1, y + 1, 2, 1); }
    }
  }

  // ---------------------------------------------------------------------------
  // Screen-space: weather tint, rain/snow, darkness with lantern light, fireflies
  // ---------------------------------------------------------------------------
  drawScreen(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, c: FxContext, toScreen: (x: number, y: number) => [number, number]) {
    if (W < 1 || H < 1) return;
    const R = this.rng;
    const I = this.intensity;
    // overcast tint
    if (I > 0.02) { ctx.fillStyle = `rgba(30,42,64,${I * (this.rainy ? 0.36 : 0.14)})`; ctx.fillRect(0, 0, W, H); }

    // precipitation
    const snow = this.weather === 'snow';
    const want = (this.rainy || snow) ? Math.round(I * (snow ? 160 : 260)) : 0;
    while (this.drops.length < want) this.drops.push({ x: R() * W, y: R() * H, v: snow ? 30 + R() * 30 : 500 + R() * 250, len: snow ? 1 + Math.round(R()) : 6 + R() * 8 });
    if (this.drops.length > want) this.drops.length = want;
    const dt = c.dt;
    const vxR = 60 * this.wind + (this.weather === 'storm' ? 280 : 0); // rain drift (px/s at S=3)
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const d of this.drops) {
        d.y += d.v * dt * S / 3;
        d.x += (Math.sin(d.y * 0.02 + d.v) * 12 + this.wind * 25) * dt * S / 3;
        if (d.y > H) { d.y = -10; d.x = R() * W; }
        if (d.x > W) d.x -= W; else if (d.x < 0) d.x += W;
        ctx.fillRect(d.x, d.y, d.len * S / 2, d.len * S / 2);
      }
    } else if (this.drops.length) {
      // rain streaks follow their real velocity, so storms slant them hard; one batched stroke
      ctx.strokeStyle = 'rgba(200,220,250,0.7)';
      ctx.lineWidth = Math.max(1, Math.round(S / 2.5));
      ctx.beginPath();
      for (const d of this.drops) {
        const k = dt * S / 3;
        d.y += d.v * k; d.x += vxR * k;
        if (d.y > H) { d.y = -10; d.x = R() * W; }
        if (d.x > W) d.x -= W; else if (d.x < 0) d.x += W;
        const len = d.len * S / 2.5, sx = (vxR / d.v) * len;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - sx, d.y - len);
      }
      ctx.stroke();
    }

    // night darkness with a warm lantern around the player
    const night = Math.max(0, Math.min(1, (0.2 - c.sun) / 0.7));
    if (night > 0.01 || I > 0.5) {
      const dc = this.darkCanvas;
      if (dc.width !== W || dc.height !== H) { dc.width = W; dc.height = H; }
      const d = dc.getContext('2d')!;
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, W, H);
      d.fillStyle = `rgba(6,10,34,${night * 0.72 + I * 0.08})`;
      d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const [px, py] = toScreen(c.player.x, c.player.y - c.player.lift - 10);
      const flick = 1 + Math.sin(c.t * 11) * 0.02 + Math.sin(c.t * 7.3) * 0.03;
      const rad = 64 * S * flick;
      if (this.lantern) {
        const g = d.createRadialGradient(px, py, rad * 0.15, px, py, rad);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = g; d.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      for (const l of c.lavaSpots) {
        const [lx, ly] = toScreen(l.x, l.y - l.l * LIFT);
        const lr = 26 * S;
        const lg = d.createRadialGradient(lx, ly, 0, lx, ly, lr);
        lg.addColorStop(0, 'rgba(0,0,0,0.9)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = lg; d.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
      }
      ctx.drawImage(dc, 0, 0);
      if (night > 0.2 && this.lantern) {
        ctx.globalCompositeOperation = 'lighter';
        const wg = ctx.createRadialGradient(px, py, 0, px, py, rad * 0.8);
        wg.addColorStop(0, `rgba(255,170,80,${0.12 * night})`); wg.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = wg; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // fireflies glow through the darkness
    if (this.bugs.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bugs) {
        const a = Math.max(0, Math.sin(b.ph * 2.2)) * Math.min(1, b.life);
        if (a < 0.05) continue;
        const [x, y] = toScreen(b.x, b.y - 6);
        const r = 5 * S;
        ctx.globalAlpha = a;
        ctx.drawImage(this.glow, x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(255,255,200,${a})`; ctx.fillRect(x - S / 2, y - S / 2, S, S);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.lightningFlash > 0) { ctx.fillStyle = `rgba(230,235,255,${this.lightningFlash * 0.55})`; ctx.fillRect(0, 0, W, H); }
    for (const b of this.bolts) {
      const a = Math.min(1, b.life / 0.1);
      const flick = Math.sin(b.life * 90) > -0.3 ? 1 : 0.35;
      const path = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.stroke(); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(150,170,255,${0.35 * a * flick})`; ctx.lineWidth = 7 * S / 3; path(b.pts);
      ctx.strokeStyle = `rgba(255,255,255,${a * flick})`; ctx.lineWidth = 2 * S / 3; path(b.pts);
      ctx.lineWidth = 1 * S / 3; for (const br of b.branches) path(br);
    }
  }
}

function bakeGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,200,1)'); gr.addColorStop(0.18, 'rgba(230,255,120,0.6)'); gr.addColorStop(1, 'rgba(180,255,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}

