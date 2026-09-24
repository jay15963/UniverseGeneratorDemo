// Materials of a culture in one era: what walls, roofs, frames and openings are made of.
// Earth-like: real materials in natural colours (stone tones follow the climate, pigments are the
// natural ochres, madders, indigos and verdigris). Alien-like: the same kinds of materials, but the
// hues are free and tinted by the star. Night dims every lit surface and turns windows and lamps on.
import type { Mat, RGB, Tex } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { Culture } from './genome';

type Kind = [number, number, number, Tex, number?];
const K: Record<string, Kind> = {
  // walls
  hide: [0.08, 0.3, 0.6, 'hide'], reed: [0.12, 0.45, 0.56, 'thatch'], log: [0.07, 0.4, 0.36, 'log'], mud: [0.07, 0.38, 0.52, 'adobe'],
  rough: [0.1, 0.08, 0.52, 'stone'], snow: [0.58, 0.2, 0.88, 'snow'], bone: [0.11, 0.2, 0.8, 'bone'],
  plaster: [0.11, 0.18, 0.84, 'adobe'], brick: [0.02, 0.5, 0.42, 'brick'], ashlar: [0.1, 0.1, 0.64, 'ashlar'], marble: [0.1, 0.05, 0.86, 'ashlar', 1.6],
  stucco: [0.1, 0.3, 0.76, 'adobe'], clap: [0.1, 0.25, 0.62, 'log', 0.6], concrete: [0.1, 0.04, 0.68, 'concrete'], glazing: [0.55, 0.3, 0.45, 'glazing'],
  panel: [0.58, 0.06, 0.74, 'panel'], clad: [0.07, 0.35, 0.45, 'plank'], composite: [0.55, 0.05, 0.9, 'smooth'], organic: [0.12, 0.25, 0.8, 'gel'],
  alloy: [0.6, 0.08, 0.62, 'panel'], hexa: [0.58, 0.1, 0.7, 'hex'],
  // roofs
  thatch: [0.11, 0.5, 0.52, 'thatch'], turf: [0.25, 0.35, 0.38, 'leafy'], palm: [0.2, 0.4, 0.4, 'thatch'], shingle: [0.07, 0.3, 0.36, 'shingle'],
  slate: [0.62, 0.12, 0.32, 'shingle'], tile: [0.03, 0.55, 0.45, 'tile'], copper: [0.44, 0.35, 0.5, 'metal'], lead: [0.6, 0.06, 0.45, 'metal'],
  corrugated: [0.6, 0.05, 0.5, 'corrugated'], darkmetal: [0.6, 0.08, 0.35, 'metal'], roofglass: [0.55, 0.3, 0.5, 'glazing'],
};
type W = [string, number][];
function pick(u: number, opts: W): string {
  const tot = opts.reduce((s, o) => s + Math.max(0, o[1]), 0);
  let x = u * tot;
  for (const [v, w] of opts) { x -= Math.max(0, w); if (x <= 0) return v; }
  return opts[opts.length - 1][0];
}

export interface Kit {
  e: number; night: boolean;
  wallKind: string; roofKind: string; halfTimber: boolean;
  wall: Mat; wall2: Mat; trim: Mat; base: Mat; roof: Mat; roof2: Mat; frame: Mat; door: Mat; win: Mat; winLit: Mat;
  metal: Mat; iron: Mat; dark: Mat; accent: Mat; accent2: Mat; cloth: Mat; cloth2: Mat; glow: Mat; glow2: Mat;
  smoke: Mat; soot: Mat; steam: Mat; fire: Mat; fire2: Mat; leaf: Mat; leaf2: Mat; trunk: Mat; crop: Mat; crop2: Mat; fruit: Mat;
  soil: Mat; ground: Mat; paving: Mat; water: Mat; field: Mat; solar: Mat; wood: Mat; stone: Mat; rope: Mat; gold: Mat;
  /** a lit window at night? (stable per window) */
  lit: (i: number) => boolean;
  /** base hue of the flora (for backdrops) */
  groundRGB: RGB;
}

const frac = (x: number) => x - Math.floor(x);

export function makeKit(c: Culture, eraIndex: number, night: boolean): Kit {
  const p = c.params, r = c.r, e = eraIndex, alien = c.mode === 'alien';
  const cold = Math.max(0, 0.4 - p.temperature) / 0.4, hot = Math.max(0, p.temperature - 0.6) / 0.4;
  const dry = Math.max(0, 0.45 - p.water) / 0.45, wet = Math.max(0, p.water - 0.55) / 0.45, ex = p.exotic, rich = p.wealth;
  const u = (i: number) => frac(r[30 + i] + e * 0.6180339);
  // culture-wide natural tones (carried through every era)
  const stoneH = dry > 0.3 ? 0.09 : cold > 0.4 ? 0.6 : wet > 0.4 ? 0.2 : [0.08, 0.1, 0.03, 0.6][Math.floor(r[40] * 4)];
  const stoneS = dry > 0.3 ? 0.35 : 0.07 + r[41] * 0.06;
  const brickH = [0.02, 0.02, 0.05, 0.1][Math.floor(r[42] * 4)];
  const PIG: [number, number, number][] = [[0.1, 0.6, 0.5], [0.99, 0.5, 0.42], [0.63, 0.4, 0.38], [0.45, 0.35, 0.45], [0.07, 0.4, 0.3], [0.12, 0.2, 0.85]];
  const pig = PIG[Math.floor(r[43] * PIG.length)], pig2 = PIG[Math.floor(r[44] * PIG.length)];
  const starShift = (p.star - 0.5) * 0.08;

  const WALLS: W[] = [
    [['hide', 1 + cold + dry * 0.5], ['reed', 0.4 + wet * 2], ['log', 0.7 + cold], ['mud', 0.4 + dry * 2 + hot], ['rough', 0.8], ['snow', cold * cold * 2.5], ['bone', ex * 0.6]],
    [['rough', 1.5], ['plaster', 1.2 + (1 - dry)], ['log', cold * 1.5 + 0.2], ['mud', dry * 2], ['brick', 0.4]],
    [['ashlar', 2], ['marble', 0.5 + rich], ['stucco', 1.5], ['brick', 1]],
    [['brick', 3], ['ashlar', 1], ['clap', 0.6 + wet]],
    [['concrete', 2], ['brick', 1.2], ['stucco', 1.2]],
    [['concrete', 1.5], ['glazing', 1.2], ['panel', 1], ['clad', 1]],
    [['composite', 2], ['glazing', 1.2], ['organic', ex * 2 + 0.5]],
    [['alloy', 2], ['hexa', 1 + ex], ['composite', 1]],
  ];
  const ROOFS: W[] = [
    [['thatch', 2 + dry], ['hide', 1 + cold], ['turf', 0.6 + cold], ['palm', wet * 2 + hot], ['snow', cold * cold * 2]],
    [['thatch', 1.5], ['shingle', 1.5], ['slate', 1 + cold], ['tile', 1 + hot + dry], ['turf', cold]],
    [['tile', 2], ['slate', 1.2], ['copper', 0.6 + rich], ['lead', 0.5]],
    [['slate', 2], ['corrugated', 1], ['tile', 1], ['copper', 0.4 + rich * 0.5]],
    [['tile', 1.5], ['concrete', 1.5], ['corrugated', 0.7], ['slate', 0.8]],
    [['concrete', 1.5], ['darkmetal', 1.2], ['turf', 0.8]],
    [['roofglass', 1], ['composite', 1.5], ['turf', 1]],
    [['alloy', 1.5], ['roofglass', 1], ['composite', 1]],
  ];
  let wallKind = pick(u(0), WALLS[e]);
  let roofKind = pick(u(1), ROOFS[e]);
  if (wallKind === 'snow') roofKind = 'snow';

  const dim = (m: Mat): Mat => (!night || m.emit ? m : { ...m, ramp: m.ramp.map(q => [q[0] * 0.4, q[1] * 0.44, q[2] * 0.58 + 14] as RGB) });
  const mk = (h: number, s: number, l: number, tex: Tex, extra: Partial<Mat> = {}): Mat => dim({ ramp: ramp(h, s, l), tex, ...extra });
  /** material of a kind, in the culture's colours; `slot` 0 = walls, 1 = roofs, 2 = trim */
  const kind = (name: string, slot: number, dl = 0): Mat => {
    const [h0, s0, l0, tex, ts] = K[name];
    let h = h0, s = s0;
    const l = Math.min(0.92, Math.max(0.12, l0 + dl));
    if (name === 'rough' || name === 'ashlar') { h = stoneH; s = stoneS * (name === 'ashlar' ? 0.8 : 1); }
    if (name === 'brick') h = brickH;
    if (name === 'stucco' || name === 'clap') { h = pig[0]; s = Math.min(0.35, pig[1] * 0.6); }
    if (alien) {
      h = frac(c.hues[slot % 3] + starShift + (name === 'glazing' || name === 'roofglass' ? 0.5 : 0));
      s = Math.min(0.7, 0.3 + s0 * 0.6 + ex * 0.2);
    }
    const spec = name === 'glazing' || name === 'roofglass' ? 0.6 : name === 'alloy' || name === 'copper' || name === 'darkmetal' ? 0.4 : 0;
    return mk(h, s, l, tex, { texScale: ts, spec });
  };

  const wall = kind(wallKind, 0);
  const wall2 = kind(wallKind === 'glazing' ? 'concrete' : wallKind === 'plaster' ? 'plaster' : wallKind, 0, -0.1);
  const roof = kind(roofKind, 1);
  const roof2 = kind(roofKind, 1, -0.12);
  const wood = mk(alien ? c.hues[1] : 0.07, alien ? 0.35 : 0.4, 0.34, 'wood');
  const stone = kind('rough', 2);
  const baseKind = e <= 1 ? 'rough' : e <= 3 ? 'ashlar' : e <= 5 ? 'concrete' : e === 6 ? 'composite' : 'alloy';
  const base = kind(baseKind, 2, -0.08);
  const trim = e <= 1 ? wood : e <= 3 ? kind('ashlar', 2, 0.12) : e <= 5 ? kind('concrete', 2, 0.1) : kind(e === 6 ? 'composite' : 'alloy', 2, 0.05);
  const frame = e <= 2 ? wood : e <= 3 ? mk(alien ? c.hues[1] : 0.6, 0.12, 0.26, 'metal', { spec: 0.3 }) : e <= 5 ? mk(alien ? c.hues[1] : 0.6, 0.08, 0.5, 'metal', { spec: 0.4 }) : kind(e === 6 ? 'composite' : 'alloy', 2);
  const door = e <= 0 ? mk(0.07, 0.3, 0.12, 'smooth') : e <= 3 ? mk(alien ? c.hues[1] : 0.06, 0.4, 0.28, 'plank') : e <= 5 ? mk(alien ? c.hues[2] : pig2[0], 0.3, 0.35, 'smooth', { spec: 0.3 }) : mk(alien ? c.hues[2] : 0.55, 0.25, 0.4, 'glass', { spec: 0.6 });
  const win = e <= 1 ? mk(0.07, 0.3, 0.13, 'smooth') : mk(alien ? frac(c.hues[0] + 0.5) : 0.58, 0.25, 0.3, 'glass', { spec: 0.6 });
  const glowH = alien ? c.hues[2] : e <= 2 ? 0.08 : e <= 5 ? 0.12 : 0.52;
  const glow: Mat = { ramp: ramp(glowH, 0.85, e <= 2 ? 0.6 : 0.68), tex: 'glow', emit: true };
  const glow2: Mat = { ramp: ramp(alien ? c.hues[1] : e >= 6 ? 0.52 : 0.11, 0.9, 0.62), tex: 'glow', emit: true };
  const winLit: Mat = night ? { ramp: ramp(glowH, 0.8, e <= 2 ? 0.58 : 0.7), tex: 'glow', emit: true } : win;
  const accent = mk(alien ? c.hues[2] : pig[0], alien ? 0.7 : pig[1], alien ? 0.5 : pig[2], 'cloth');
  const accent2 = mk(alien ? c.hues[1] : pig2[0], alien ? 0.65 : pig2[1], alien ? 0.55 : pig2[2], 'cloth');
  const cloth = mk(alien ? c.hues[2] : pig[0], alien ? 0.6 : Math.min(0.6, pig[1]), alien ? 0.55 : Math.max(0.42, pig[2]), 'cloth');
  const cloth2 = mk(alien ? frac(c.hues[2] + 0.1) : 0.11, alien ? 0.3 : 0.18, 0.84, 'cloth');
  const leafH = alien ? frac(c.hues[1] + 0.15) : cold > 0.4 ? 0.36 : dry > 0.4 ? 0.19 : wet > 0.3 ? 0.31 : 0.27;
  const leaf = mk(leafH, alien ? 0.6 : dry > 0.4 ? 0.3 : 0.45, cold > 0.4 ? 0.3 : 0.36, 'leafy', { fuzz: 0.6 });
  const leaf2 = mk(leafH + 0.03, alien ? 0.55 : 0.42, 0.46, 'leafy', { fuzz: 0.5 });
  const cropWheat = r[45] < 0.5 && !alien;
  const crop = mk(alien ? c.hues[0] : cropWheat ? 0.12 : 0.26, alien ? 0.6 : cropWheat ? 0.6 : 0.5, cropWheat ? 0.56 : 0.4, 'crop');
  const crop2 = mk(alien ? frac(c.hues[0] + 0.06) : cropWheat ? 0.11 : 0.28, 0.5, cropWheat ? 0.5 : 0.34, 'leafy', { fuzz: 0.4 });
  const fruit = mk(alien ? c.hues[2] : [0.0, 0.08, 0.14][Math.floor(r[46] * 3)], 0.75, 0.5, 'smooth', { spec: 0.4 });
  const groundH = alien ? frac(c.hues[1] + 0.3) : cold > 0.6 ? 0.58 : dry > 0.4 ? 0.11 : 0.25;
  const groundS = alien ? 0.35 : cold > 0.6 ? 0.2 : dry > 0.4 ? 0.4 : 0.35;
  const groundL = cold > 0.6 ? 0.86 : dry > 0.4 ? 0.62 : 0.38;
  const ground = mk(groundH, groundS, groundL, cold > 0.6 ? 'snow' : dry > 0.4 ? 'adobe' : 'leafy');
  const paving = e === 0 ? mk(0.08, 0.3, 0.42, 'soil') : e <= 3 ? mk(stoneH, stoneS, 0.55, 'paving') : e === 4 ? mk(0.6, 0.05, 0.3, 'concrete') : e === 5 ? mk(0.1, 0.03, 0.62, 'concrete') : e === 6 ? kind('composite', 2, -0.05) : mk(alien ? c.hues[0] : 0.58, 0.1, 0.45, 'grid');
  const lit = (i: number) => night && frac(Math.sin(i * 12.9898 + r[47] * 78.233) * 43758.5453) < 0.72;
  const [gr, gg, gb] = ramp(groundH, groundS, groundL)[3];
  return {
    e, night, wallKind, roofKind, halfTimber: wallKind === 'plaster' && e <= 2 && r[48] < 0.7,
    wall, wall2, trim, base, roof, roof2, frame, door, win, winLit,
    metal: mk(alien ? c.hues[0] : 0.6, 0.07, 0.55, 'metal', { spec: 0.5 }),
    iron: mk(alien ? c.hues[1] : 0.62, 0.1, 0.24, 'metal', { spec: 0.3 }),
    dark: mk(0.66, 0.2, 0.1, 'smooth'),
    accent, accent2, cloth, cloth2, glow, glow2,
    smoke: mk(0.6, 0.04, 0.74, 'smooth', { line: [150, 150, 160] }),
    soot: mk(0.6, 0.05, 0.4, 'smooth', { line: [60, 60, 70] }),
    steam: mk(alien ? c.hues[2] : 0.55, 0.1, 0.9, 'smooth', { line: [190, 200, 210] }),
    fire: { ramp: ramp(0.06, 1, 0.52), tex: 'glow', emit: true },
    fire2: { ramp: ramp(0.12, 1, 0.66), tex: 'glow', emit: true },
    leaf, leaf2, trunk: mk(alien ? c.hues[1] : 0.07, 0.35, 0.28, 'wood'), crop, crop2, fruit,
    soil: mk(0.07, 0.35, 0.3, 'soil'), ground, paving,
    water: mk(alien ? frac(c.hues[0] + 0.45) : 0.55, 0.5, 0.42, 'water', { spec: 0.5 }),
    field: { ramp: ramp(alien ? c.hues[2] : 0.52, 0.7, 0.6), tex: 'glow', emit: true, alpha: 0.2, line: null },
    solar: mk(0.62, 0.5, 0.25, 'grid', { spec: 0.7 }),
    wood, stone, rope: mk(0.08, 0.3, 0.3, 'smooth'),
    gold: mk(alien ? c.hues[2] : 0.12, 0.7, 0.55, 'metal', { spec: 0.7 }),
    lit, groundRGB: [gr, gg, gb],
  };
}

export const MAT_PT: Record<string, string> = {
  hide: 'couro', reed: 'junco', log: 'toras', mud: 'barro', rough: 'pedra bruta', snow: 'blocos de neve', bone: 'ossos', plaster: 'reboco e enxaimel',
  brick: 'tijolo', ashlar: 'cantaria', marble: 'mármore', stucco: 'estuque', clap: 'tábuas pintadas', concrete: 'concreto', glazing: 'vidro',
  panel: 'painéis', clad: 'revestimento de madeira', composite: 'compósito', organic: 'biomaterial', alloy: 'liga metálica', hexa: 'painéis hexagonais',
  thatch: 'palha', turf: 'relva', palm: 'folhas', shingle: 'telhas de madeira', slate: 'ardósia', tile: 'telhas de barro', copper: 'cobre',
  lead: 'chumbo', corrugated: 'chapa ondulada', darkmetal: 'metal', roofglass: 'vidro',
};
