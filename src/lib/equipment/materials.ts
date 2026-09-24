// The game's resources as crafting materials. Every tool, weapon, bag and garment can be made of any material its
// type accepts; the era (the creature's civilisation stage) decides which materials are already known.
import type { Mat, Tex, RGB } from '../creature/raster';
import { ramp } from '../creature/raster';

export type MatClass = 'wood' | 'stone' | 'bone' | 'metal' | 'crystal' | 'hide' | 'fiber' | 'synthetic' | 'energy';

export interface Material {
  id: string; name: string; cls: MatClass;
  /** first era (0 tribal .. 7 space) that works it */
  era: number;
  h: number; s: number; l: number; tex: Tex; spec?: number; emit?: boolean;
  /** 0 soft .. 1 hard (edges, plate thickness, how sharp a knapped edge looks) */
  hard: number;
}

export const MATERIALS: Material[] = [
  // plants & animals
  { id: 'wood', name: 'madeira', cls: 'wood', era: 0, h: 0.08, s: 0.42, l: 0.4, tex: 'wood', hard: 0.3 },
  { id: 'hardwood', name: 'madeira de lei', cls: 'wood', era: 0, h: 0.04, s: 0.45, l: 0.28, tex: 'wood', hard: 0.4 },
  { id: 'bamboo', name: 'bambu', cls: 'wood', era: 0, h: 0.15, s: 0.45, l: 0.58, tex: 'fin', hard: 0.35 },
  { id: 'bone', name: 'osso', cls: 'bone', era: 0, h: 0.11, s: 0.2, l: 0.82, tex: 'bone', hard: 0.45 },
  { id: 'shell', name: 'concha', cls: 'bone', era: 0, h: 0.05, s: 0.3, l: 0.8, tex: 'fin', spec: 0.5, hard: 0.4 },
  { id: 'hide', name: 'couro cru', cls: 'hide', era: 0, h: 0.07, s: 0.38, l: 0.42, tex: 'hide', hard: 0.15 },
  { id: 'fur', name: 'pele com pelo', cls: 'hide', era: 0, h: 0.08, s: 0.3, l: 0.5, tex: 'fur', hard: 0.1 },
  { id: 'leather', name: 'couro curtido', cls: 'hide', era: 1, h: 0.06, s: 0.5, l: 0.3, tex: 'leather', hard: 0.25 },
  { id: 'flax', name: 'linho', cls: 'fiber', era: 0, h: 0.11, s: 0.18, l: 0.78, tex: 'cloth', hard: 0.05 },
  { id: 'wool', name: 'lã', cls: 'fiber', era: 1, h: 0.1, s: 0.15, l: 0.7, tex: 'wool', hard: 0.05 },
  { id: 'silk', name: 'seda', cls: 'fiber', era: 2, h: 0.95, s: 0.35, l: 0.75, tex: 'silk', spec: 0.3, hard: 0.05 },
  // rock
  { id: 'stone', name: 'pedra', cls: 'stone', era: 0, h: 0.1, s: 0.06, l: 0.5, tex: 'stone', hard: 0.6 },
  { id: 'flint', name: 'pederneira', cls: 'stone', era: 0, h: 0.07, s: 0.25, l: 0.38, tex: 'chitin', spec: 0.4, hard: 0.7 },
  { id: 'obsidian', name: 'obsidiana', cls: 'stone', era: 0, h: 0.72, s: 0.25, l: 0.12, tex: 'glass', spec: 0.9, hard: 0.75 },
  // metals
  { id: 'copper', name: 'cobre', cls: 'metal', era: 0, h: 0.06, s: 0.6, l: 0.48, tex: 'metal', spec: 0.8, hard: 0.5 },
  { id: 'bronze', name: 'bronze', cls: 'metal', era: 1, h: 0.1, s: 0.55, l: 0.45, tex: 'metal', spec: 0.8, hard: 0.65 },
  { id: 'iron', name: 'ferro', cls: 'metal', era: 1, h: 0.6, s: 0.06, l: 0.36, tex: 'metal', spec: 0.6, hard: 0.75 },
  { id: 'steel', name: 'aço', cls: 'metal', era: 2, h: 0.58, s: 0.1, l: 0.5, tex: 'metal', spec: 1, hard: 0.9 },
  { id: 'gold', name: 'ouro', cls: 'metal', era: 1, h: 0.12, s: 0.75, l: 0.55, tex: 'metal', spec: 1, hard: 0.35 },
  { id: 'silver', name: 'prata', cls: 'metal', era: 1, h: 0.6, s: 0.05, l: 0.66, tex: 'metal', spec: 1, hard: 0.45 },
  { id: 'aluminium', name: 'alumínio', cls: 'metal', era: 4, h: 0.58, s: 0.04, l: 0.64, tex: 'metal', spec: 0.7, hard: 0.6 },
  { id: 'titanium', name: 'titânio', cls: 'metal', era: 5, h: 0.62, s: 0.08, l: 0.55, tex: 'metal', spec: 0.8, hard: 0.95 },
  // crystals
  { id: 'ice', name: 'cristal de gelo', cls: 'crystal', era: 0, h: 0.54, s: 0.45, l: 0.82, tex: 'glass', spec: 1, hard: 0.5 },
  { id: 'salt', name: 'cristal de sal', cls: 'crystal', era: 0, h: 0.95, s: 0.25, l: 0.85, tex: 'glass', spec: 0.8, hard: 0.35 },
  { id: 'diamond', name: 'diamante', cls: 'crystal', era: 2, h: 0.52, s: 0.3, l: 0.9, tex: 'glass', spec: 1, hard: 1 },
  // synthetic
  { id: 'rubber', name: 'borracha', cls: 'synthetic', era: 3, h: 0.66, s: 0.1, l: 0.16, tex: 'smooth', hard: 0.2 },
  { id: 'polymer', name: 'polímero', cls: 'synthetic', era: 4, h: 0.3, s: 0.12, l: 0.3, tex: 'smooth', spec: 0.3, hard: 0.5 },
  { id: 'kevlar', name: 'fibra de aramida', cls: 'synthetic', era: 5, h: 0.12, s: 0.45, l: 0.45, tex: 'denim', hard: 0.6 },
  { id: 'carbon', name: 'fibra de carbono', cls: 'synthetic', era: 5, h: 0.65, s: 0.08, l: 0.18, tex: 'grid', spec: 0.6, hard: 0.85 },
  { id: 'ceramic', name: 'cerâmica balística', cls: 'synthetic', era: 5, h: 0.1, s: 0.08, l: 0.7, tex: 'smooth', spec: 0.3, hard: 0.9 },
  { id: 'nanoalloy', name: 'nanoliga', cls: 'synthetic', era: 6, h: 0.75, s: 0.2, l: 0.45, tex: 'metal', spec: 1, hard: 1 },
  { id: 'smartfabric', name: 'tecido inteligente', cls: 'synthetic', era: 6, h: 0.55, s: 0.3, l: 0.3, tex: 'silk', spec: 0.4, hard: 0.3 },
  // energy
  { id: 'plasma', name: 'plasma', cls: 'energy', era: 7, h: 0.52, s: 0.95, l: 0.62, tex: 'glow', emit: true, hard: 1 },
];
export const matById = (id: string) => MATERIALS.find(m => m.id === id) ?? MATERIALS[0];

const CLS_PT: Record<MatClass, string> = { wood: 'madeira', stone: 'pedra', bone: 'osso', metal: 'metal', crystal: 'cristal', hide: 'couro', fiber: 'fibra', synthetic: 'sintético', energy: 'energia' };
export const clsName = (c: MatClass) => CLS_PT[c];

/** The pixel material of a resource. Alien-like worlds tint soft and crystal materials with the species' own hues. */
export function matOf(m: Material, alien: boolean, hue: number, dl = 0): Mat {
  let h = m.h, s = m.s;
  if (alien) {
    if (m.cls === 'crystal' || m.cls === 'energy' || m.cls === 'fiber') { h = hue; s = Math.min(0.8, m.s + 0.3); }
    else if (m.cls === 'metal') h = (m.h + (hue - 0.5) * 0.12 + 1) % 1;
    else if (m.cls === 'hide' || m.cls === 'wood' || m.cls === 'synthetic') { h = (m.h + (hue - 0.5) * 0.3 + 1) % 1; s = Math.min(0.7, m.s + 0.1); }
  }
  const out: Mat = { ramp: ramp(h, s, Math.max(0.08, Math.min(0.94, m.l + dl))), tex: m.tex, spec: m.spec };
  if (m.emit) { out.emit = true; out.line = null; }
  if (m.cls === 'crystal') out.alpha = 0.92;
  return out;
}
/** a dye made from the culture's colours (cloth, lacquer, paint) */
export const dyeMat = (h: number, s: number, l: number, tex: Tex = 'cloth', spec = 0): Mat => ({ ramp: ramp(h, s, l), tex, spec });
export const rgbOf = (m: Mat): RGB => m.ramp[3];
