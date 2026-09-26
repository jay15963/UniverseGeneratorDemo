// The microscopic world of the cellular era: a generic pool seen from above, NOT the planet. A deterministic function of
// its seed: sand grains (obstacles), hydrothermal vents ringed by rich nutrient fields, shafts of light (photosynthesis),
// nutrient patches, a slow current field, and the starting colonies of the rival species (grouped in homelands, so
// neighbours tend to be the same species). Shared by the simulation worker and the renderer.
import { mulberry, seedToInt, vnoise } from '../terrain/noise';
import { CellSpecies, makeSpecies } from './look';
import { rockSize, ROCK_VARIANTS } from './art';
import type { ColorMode } from '../creature/genome';

export const WORLD = 12288;       // world px (1 world px = 1 art pixel at zoom 1)
export const BIO = 32;            // biofilm grid cell (world px)
export const BIO_N = WORLD / BIO; // 384 x 384

export interface Rock { x: number; y: number; r: number; v: number; rot: number }
export interface Vent { x: number; y: number; r: number; v: number }
export interface Light { x: number; y: number; r: number }
export interface Field { x: number; y: number; r: number; rate: number }
export interface Home { x: number; y: number; species: number }

export interface WorldDef {
  seed: string;
  species: CellSpecies[];         // 0 = the player
  rocks: Rock[]; vents: Vent[]; lights: Light[]; fields: Field[];
  homes: Home[];                  // 0 = the player's start
}

export const RIVAL_SPECIES = 16;
export const COLONIES = 180;

export function makeWorld(seed: string, player: CellSpecies): WorldDef {
  const r = mulberry(seedToInt(seed + ':world'));
  const S = WORLD, M = 300;
  const rocks: Rock[] = [], vents: Vent[] = [], lights: Light[] = [], fields: Field[] = [];
  // vents first: they anchor the richest fields
  for (let i = 0; i < 22; i++) vents.push({ x: M + r() * (S - 2 * M), y: M + r() * (S - 2 * M), r: 30, v: Math.floor(r() * 3) });
  for (const v of vents) { v.r = 26 + v.v * 8; fields.push({ x: v.x, y: v.y, r: 340, rate: 4 }); }
  for (let i = 0; i < 70; i++) fields.push({ x: M + r() * (S - 2 * M), y: M + r() * (S - 2 * M), r: 180 + r() * 260, rate: 1 + r() * 1.5 });
  for (let i = 0; i < 46; i++) lights.push({ x: M + r() * (S - 2 * M), y: M + r() * (S - 2 * M), r: 200 + r() * 260 });
  // sand grains in drifts (banks follow a noise field), a few loose ones everywhere
  const s0 = seedToInt(seed) & 0xffff;
  for (let tries = 0; rocks.length < 620 && tries < 20000; tries++) {
    const x = M + r() * (S - 2 * M), y = M + r() * (S - 2 * M);
    const bank = vnoise(x / 1400, y / 1400, s0);
    if (r() > (bank > 0.62 ? 0.9 : 0.08)) continue;
    const v = Math.floor(r() * ROCK_VARIANTS), rr = rockSize(v) * 0.92;
    if (vents.some(q => Math.hypot(q.x - x, q.y - y) < q.r + rr + 60)) continue;
    if (rocks.some(q => Math.hypot(q.x - x, q.y - y) < q.r + rr + 6)) continue;
    rocks.push({ x, y, r: rr, v, rot: r() * Math.PI * 2 });
  }

  // species: the player + rivals, each rival with a homeland; colonies take the species of the nearest homeland
  const species: CellSpecies[] = [player];
  const modes: ColorMode[] = [player.mode];
  for (let i = 0; i < RIVAL_SPECIES; i++) species.push(makeSpecies(seed + ':sp' + i, modes[0]));
  const lands = Array.from({ length: RIVAL_SPECIES }, () => ({ x: r() * S, y: r() * S }));
  const homes: Home[] = [];
  const free = (x: number, y: number) =>
    x > 500 && y > 500 && x < S - 500 && y < S - 500 &&
    !rocks.some(q => Math.hypot(q.x - x, q.y - y) < q.r + 90) && !vents.some(q => Math.hypot(q.x - x, q.y - y) < 260);
  // the player starts near the middle, close to a light and a field
  const cx = S / 2 + (r() - 0.5) * 1500, cy = S / 2 + (r() - 0.5) * 1500;
  let best = { x: cx, y: cy }, bd = 1e9;
  for (let i = 0; i < 400; i++) {
    const x = cx + (r() - 0.5) * 1800, y = cy + (r() - 0.5) * 1800;
    if (!free(x, y)) continue;
    const dl = Math.min(...lights.map(l => Math.hypot(l.x - x, l.y - y) - l.r)), df = Math.min(...fields.map(f => Math.hypot(f.x - x, f.y - y) - f.r));
    const d = Math.max(0, dl) + Math.max(0, df) * 0.7;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  homes.push({ x: best.x, y: best.y, species: 0 });
  const g = Math.ceil(Math.sqrt(COLONIES * 2.4)), step = S / g;
  const spots: { x: number; y: number }[] = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) spots.push({ x: (i + 0.5) * step + (r() - 0.5) * step * 0.6, y: (j + 0.5) * step + (r() - 0.5) * step * 0.6 });
  for (let i = spots.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [spots[i], spots[k]] = [spots[k], spots[i]]; }
  for (const s of spots) {
    if (homes.length > COLONIES) break;
    if (!free(s.x, s.y) || homes.some(h => Math.hypot(h.x - s.x, h.y - s.y) < 560)) continue;
    let k = 0, kd = 1e18;
    lands.forEach((l, i) => { const d = (l.x - s.x) ** 2 + (l.y - s.y) ** 2; if (d < kd) { kd = d; k = i; } });
    homes.push({ x: s.x, y: s.y, species: 1 + k });
  }
  return { seed, species, rocks, vents, lights, fields, homes };
}

/** the slow current (world px / s): a divergence-free swirl from two noise-like stream functions */
export function flowAt(x: number, y: number, t: number): [number, number] {
  const a = 1 / 900, b = 1 / 2300;
  // stream psi = sin(ax + .) cos(ay + .) + 0.6 sin(bx) sin(by); velocity = (dpsi/dy, -dpsi/dx)
  const p1 = x * a + t * 0.01, p2 = y * a - t * 0.013;
  const vx = -Math.sin(p1) * Math.sin(p2) * a + 0.6 * Math.sin(x * b) * Math.cos(y * b) * b;
  const vy = -Math.cos(p1) * Math.cos(p2) * a - 0.6 * Math.cos(x * b) * Math.sin(y * b) * b;
  return [vx * 5500, vy * 5500];
}
