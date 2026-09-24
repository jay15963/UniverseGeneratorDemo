// Procedural species genome.
//
// A genome is a pure function of (seed, planet parameters, colour mode). Every random number is
// drawn up-front in a fixed order and then *combined* with the parameters, so dragging a slider
// morphs the same species instead of reshuffling it. One genome drives the whole lineage: the cell,
// the larva, the swimmer (or the leviathan), the first walker (or the giant walker), the land animal
// (or the titan) and, finally, the people wearing the everyday clothes of each era.
//
// Colour rule (see CLAUDE.md): in Earth-like mode fur, skin and feathers use natural pigments picked
// by climate - pale coats in the cold, sandy ones in deserts, dark or rufous ones in wet tropics -
// and each species picks its own shade, so two species of the same world rarely look alike.
// Vivid, arbitrary hues only happen in Alien-like mode.
import { mulberry, seedToInt } from '../terrain/noise';

export enum Stage {
  CELL, AQUA_LARVA, AQUA, AQUA_GIANT, AMPHIBIAN, AMPHIBIAN_GIANT, LAND, LAND_GIANT,
  TRIBAL, MEDIEVAL, RENAISSANCE, INDUSTRIAL, MODERN, CONTEMPORARY, FUTURIST, SPACE,
}
export type StageGroup = 'Célula' | 'Oceano' | 'Terra' | 'Civilização';
export const STAGES: { id: Stage; name: string; group: StageGroup; scale: string; years?: string; giant?: boolean }[] = [
  { id: Stage.CELL, name: 'Celular', group: 'Célula', scale: '≈ 40 µm' },
  { id: Stage.AQUA_LARVA, name: 'Aquática inicial', group: 'Oceano', scale: '≈ 2 cm' },
  { id: Stage.AQUA, name: 'Aquática', group: 'Oceano', scale: '≈ 60 cm' },
  { id: Stage.AQUA_GIANT, name: 'Aquática gigante', group: 'Oceano', scale: '≈ 14 m', giant: true },
  { id: Stage.AMPHIBIAN, name: 'Anfíbia', group: 'Terra', scale: '≈ 1,5 m' },
  { id: Stage.AMPHIBIAN_GIANT, name: 'Anfíbia gigante', group: 'Terra', scale: '≈ 9 m', giant: true },
  { id: Stage.LAND, name: 'Terrestre', group: 'Terra', scale: '≈ 2 m' },
  { id: Stage.LAND_GIANT, name: 'Terrestre gigante', group: 'Terra', scale: '≈ 12 m', giant: true },
  { id: Stage.TRIBAL, name: 'Tribal', group: 'Civilização', scale: '≈ 1,8 m', years: 'pré-história' },
  { id: Stage.MEDIEVAL, name: 'Medieval', group: 'Civilização', scale: '≈ 1,8 m', years: '500–1400' },
  { id: Stage.RENAISSANCE, name: 'Clássica', group: 'Civilização', scale: '≈ 1,8 m', years: '≈ 1500' },
  { id: Stage.INDUSTRIAL, name: 'Vitoriana / industrial', group: 'Civilização', scale: '≈ 1,8 m', years: '1800–1900' },
  { id: Stage.MODERN, name: 'Moderna', group: 'Civilização', scale: '≈ 1,8 m', years: '1900–1950' },
  { id: Stage.CONTEMPORARY, name: 'Contemporânea', group: 'Civilização', scale: '≈ 1,8 m', years: 'hoje' },
  { id: Stage.FUTURIST, name: 'Futurista', group: 'Civilização', scale: '≈ 1,8 m', years: '2050–2100' },
  { id: Stage.SPACE, name: 'Espacial', group: 'Civilização', scale: '≈ 1,8 m', years: '2100+' },
];
export const isCiv = (s: Stage) => s >= Stage.TRIBAL;
export const isGiant = (s: Stage) => s === Stage.AQUA_GIANT || s === Stage.AMPHIBIAN_GIANT || s === Stage.LAND_GIANT;

export type ColorMode = 'earth' | 'alien';
export interface CreatureParams {
  gravity: number; temperature: number; water: number; atmosphere: number; star: number; diet: number; exotic: number; size: number;
}
export const DEFAULT_PARAMS: CreatureParams = { gravity: 0.35, temperature: 0.5, water: 0.5, atmosphere: 0.5, star: 0.55, diet: 0.5, exotic: 0.25, size: 0.5 };

export type Locomotion = 'quadruped' | 'biped' | 'hopper' | 'hexapod' | 'octopod' | 'serpent' | 'flyer' | 'dragon' | 'centauroid';
export type LegType = 'column' | 'plantigrade' | 'digitigrade' | 'unguligrade' | 'avian' | 'insectoid' | 'sprawl' | 'tentacle' | 'stubby';
export type BodyShape = 'barrel' | 'lean' | 'humped' | 'long' | 'stocky' | 'round';
export type HeadShape = 'round' | 'long' | 'wedge' | 'flat' | 'domed' | 'hammer';
export type Covering = 'scales' | 'feathers' | 'fur' | 'skin' | 'chitin' | 'plates';
export type AquaForm = 'fish' | 'eel' | 'cephalopod' | 'crustacean' | 'ray' | 'jelly';
export type FishBody = 'fusiform' | 'deep' | 'angler' | 'puffer' | 'boxy';
export type Pattern = 'none' | 'stripes' | 'spots' | 'rosettes' | 'bands' | 'patches' | 'dapples' | 'saddle' | 'dorsal' | 'rings';
export type Jaw = 'teeth' | 'beak' | 'mandibles' | 'soft' | 'tusks' | 'trunk';
export type Ears = 'none' | 'pointy' | 'round' | 'long' | 'fan' | 'tufted' | 'droopy' | 'fins';
export type Horns = 'none' | 'ram' | 'straight' | 'antlers' | 'crest' | 'frill' | 'nasal' | 'bull' | 'unicorn' | 'ossicones' | 'crown';
export type Back = 'none' | 'spines' | 'plates' | 'sail' | 'mane' | 'shell' | 'quills' | 'hump' | 'ridge' | 'crystals';
export type Wings = 'none' | 'feather' | 'membrane' | 'insect';
export type Tail = 'none' | 'plain' | 'tuft' | 'club' | 'thagomizer' | 'fin' | 'fan' | 'curl' | 'bushy' | 'paddle' | 'stinger' | 'whip';
export type Pupil = 'round' | 'slit' | 'bar' | 'compound';
export type EyeLayout = 'pair' | 'row' | 'cluster' | 'stalks' | 'cyclops';

export interface HSL { h: number; s: number; l: number }

export interface Genome {
  seed: string; params: CreatureParams; mode: ColorMode;
  name: { genus: string; species: string; people: string };
  primary: HSL; secondary: HSL; belly: HSL; accent: HSL; eye: HSL; glowHue: number;
  pattern: Pattern; patternScale: number; patternAngle: number; counterShade: boolean;
  mask: boolean; socks: boolean; tipColor: boolean;
  aquaForm: AquaForm; fishBody: FishBody; covering: Covering; locomotion: Locomotion; legType: LegType;
  bodyShape: BodyShape; headShape: HeadShape;
  size: number; length: number; girth: number; legLen: number; neck: number; tailLen: number; tail: Tail;
  headSize: number; snout: number; jaw: Jaw;
  eyes: number; eyeLayout: EyeLayout; eyeSize: number; pupil: Pupil;
  ears: Ears; horns: Horns; hornLen: number; antennae: boolean; whiskers: boolean; cheekFluff: boolean; tentacleBeard: boolean;
  back: Back; wings: Wings; claws: boolean; glow: number;
  /** 0 = gentle herbivore face .. 1 = terrifying predator face (continuous, from the diet slider + seed) */
  fierce: number;
  cell: { shape: 'round' | 'oval' | 'rod' | 'star' | 'spiral'; flagella: number; cilia: boolean; spikes: boolean; organelles: number; shell: boolean };
  finShape: 'forked' | 'lunate' | 'round' | 'shark' | 'veil'; dorsal: 'none' | 'tall' | 'ridge' | 'sail' | 'spiny';
  culture: { hue: number; hue2: number; hue3: number; motif: number; metal: HSL; sat: number };
  r: number[];
}

// ---------------------------------------------------------------------------------------------------
const SYL_A = ['va', 'ko', 'ra', 'thu', 'zel', 'mi', 'or', 'ka', 'shi', 'lu', 'dra', 'ne', 'xo', 'bel', 'ta', 'qui', 'mor', 'is', 'ga', 'vex', 'ul', 'sa', 'rhe', 'no', 'fen', 'ath', 'ky', 'zu', 'pel', 'om', 'hau', 'tre'];
const SYL_B = ['rak', 'lis', 'dor', 'men', 'tha', 'vi', 'nox', 'ria', 'gan', 'sor', 'lek', 'ma', 'dun', 'phi', 'tor', 'xil', 'ven', 'bra', 'ku', 'sen', 'lo', 'mir'];
const END_G = ['us', 'ax', 'or', 'on', 'ix', 'ar', 'is', 'um', 'oth', 'yx', 'ops', 'erium'];
const END_S = ['ensis', 'ii', 'ata', 'ica', 'oides', 'ura', 'ifera', 'ana', 'ides', 'aris', 'ella', 'osa'];
const END_P = ['i', 'ari', 'eni', 'ath', 'uun', 'ori', 'esh', 'ai', 'ven', 'aru'];
function word(rnd: () => number, parts: number, end: string[]) {
  let w = '';
  for (let i = 0; i < parts; i++) { const L = i % 2 ? SYL_B : SYL_A; w += L[Math.floor(rnd() * L.length)]; }
  return w + end[Math.floor(rnd() * end.length)];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** weighted choice: highest (score + noise) wins, so parameters bias but the seed still decides */
function pick<T extends string>(scores: Record<T, number>, rs: number[], noise = 0.5): T {
  let best: T | null = null, bv = -1e9, i = 0;
  for (const k in scores) {
    if (scores[k] <= -5) { i++; continue; }
    const v = scores[k] + (rs[i++ % rs.length] - 0.5) * 2 * noise;
    if (v > bv) { bv = v; best = k; }
  }
  return best as T;
}
const hueLerp = (a: number, b: number, t: number) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return (a + d * t + 1) % 1; };

// ---------------------------------------------------------------------------------------------------
// Natural (Earth-like) pigments by covering and climate
// ---------------------------------------------------------------------------------------------------
type Swatch = [number, number, number];
const COATS = {
  furCold: [[0.11, 0.12, 0.9], [0.1, 0.25, 0.8], [0.6, 0.06, 0.68], [0.08, 0.15, 0.5], [0.07, 0.2, 0.62]] as Swatch[],
  furTemperate: [[0.07, 0.42, 0.34], [0.04, 0.55, 0.42], [0.08, 0.5, 0.5], [0.6, 0.05, 0.45], [0.7, 0.08, 0.16], [0.03, 0.45, 0.3], [0.09, 0.3, 0.6]] as Swatch[],
  furDesert: [[0.1, 0.42, 0.64], [0.09, 0.55, 0.5], [0.08, 0.35, 0.6], [0.1, 0.12, 0.68], [0.07, 0.48, 0.55]] as Swatch[],
  furTropic: [[0.06, 0.4, 0.22], [0.7, 0.08, 0.13], [0.1, 0.62, 0.5], [0.03, 0.52, 0.36], [0.08, 0.3, 0.3]] as Swatch[],
  skin: [[0.6, 0.05, 0.5], [0.98, 0.3, 0.72], [0.2, 0.2, 0.38], [0.07, 0.3, 0.38], [0.62, 0.08, 0.3], [0.05, 0.25, 0.55]] as Swatch[],
  skinWet: [[0.3, 0.45, 0.36], [0.22, 0.4, 0.3], [0.1, 0.35, 0.4], [0.35, 0.25, 0.28]] as Swatch[],
  scalesHot: [[0.1, 0.38, 0.6], [0.08, 0.4, 0.42], [0.2, 0.35, 0.36], [0.06, 0.35, 0.3], [0.12, 0.25, 0.5]] as Swatch[],
  scalesWet: [[0.3, 0.42, 0.38], [0.22, 0.38, 0.32], [0.18, 0.3, 0.28], [0.35, 0.35, 0.3], [0.4, 0.1, 0.4]] as Swatch[],
  feathers: [[0.08, 0.35, 0.36], [0.6, 0.06, 0.52], [0.7, 0.06, 0.15], [0.1, 0.1, 0.88], [0.07, 0.25, 0.55], [0.05, 0.4, 0.3]] as Swatch[],
  chitin: [[0.7, 0.1, 0.12], [0.07, 0.4, 0.22], [0.38, 0.5, 0.28], [0.09, 0.62, 0.42], [0.02, 0.5, 0.3], [0.6, 0.35, 0.3]] as Swatch[],
  plates: [[0.1, 0.12, 0.5], [0.08, 0.2, 0.38], [0.6, 0.06, 0.42], [0.09, 0.25, 0.6]] as Swatch[],
  sea: [[0.57, 0.25, 0.6], [0.5, 0.3, 0.42], [0.1, 0.25, 0.5], [0.6, 0.15, 0.35], [0.45, 0.2, 0.55], [0.03, 0.45, 0.5]] as Swatch[],
};

function earthColours(cover: Covering, p: CreatureParams, r: () => number, aquatic: boolean) {
  const t = p.temperature, w = p.water;
  let list: Swatch[];
  if (aquatic) list = COATS.sea;
  else if (cover === 'fur') list = t < 0.3 ? COATS.furCold : t > 0.65 ? (w > 0.55 ? COATS.furTropic : COATS.furDesert) : COATS.furTemperate;
  else if (cover === 'skin') list = w > 0.6 ? COATS.skinWet : COATS.skin;
  else if (cover === 'scales') list = w > 0.5 ? COATS.scalesWet : COATS.scalesHot;
  else if (cover === 'feathers') list = COATS.feathers;
  else if (cover === 'chitin') list = COATS.chitin;
  else list = COATS.plates;
  const b = list[Math.floor(r() * list.length)];
  const primary = { h: (b[0] + (r() - 0.5) * 0.04 + 1) % 1, s: clamp01(b[1] + (r() - 0.5) * 0.12), l: clamp01(b[2] + (r() - 0.5) * 0.12) };
  // markings in the same family: darker for stripes / spots, lighter for the belly
  const darkMark = r() < 0.7;
  const secondary = darkMark ? { h: hueLerp(primary.h, 0.08, 0.3), s: clamp01(primary.s * 0.9), l: clamp01(primary.l * 0.45) }
    : { h: primary.h, s: primary.s * 0.6, l: clamp01(primary.l + 0.25) };
  const belly = { h: hueLerp(primary.h, 0.11, 0.5), s: primary.s * 0.45, l: clamp01(Math.max(primary.l + 0.22, 0.7)) };
  // tropical birds, poison frogs and reef fish are the only loud natural colours
  const loud = (cover === 'feathers' || (cover === 'skin' && w > 0.6) || aquatic) && t > 0.55 && w > 0.5 && r() < 0.5;
  const accent = loud ? { h: [0.0, 0.14, 0.58, 0.33][Math.floor(r() * 4)], s: 0.8, l: 0.5 } : { h: hueLerp(primary.h, 0.05, 0.5), s: 0.5, l: 0.35 };
  return { primary, secondary, belly, accent };
}

function alienColours(p: CreatureParams, r: () => number) {
  const cold = 1 - p.temperature, hot = p.temperature, wet = p.water, ex = p.exotic;
  const envHue = hot > 0.6 ? lerp(0.07, 0.02, (hot - 0.6) / 0.4) : cold > 0.65 ? 0.58 : wet > 0.6 ? 0.3 : 0.1;
  const starTint = lerp(0.95, 0.62, p.star);
  let h0 = hueLerp(envHue, starTint, 0.3 + ex * 0.2);
  h0 = hueLerp(h0, r(), 0.45 + ex * 0.5);
  const sat = clamp01(0.45 + ex * 0.35 + (r() - 0.5) * 0.25);
  const lum = clamp01(0.45 + (r() - 0.5) * 0.2);
  const harmony = r();
  const h1 = harmony < 0.35 ? (h0 + 0.5) % 1 : harmony < 0.7 ? (h0 + 0.08 + r() * 0.07) % 1 : (h0 + 0.93 - r() * 0.07) % 1;
  return {
    primary: { h: h0, s: sat, l: lum },
    secondary: { h: h1, s: clamp01(sat + 0.12), l: clamp01(lum + (r() - 0.6) * 0.3) },
    belly: { h: hueLerp(h0, 0.12, 0.4), s: sat * 0.55, l: clamp01(lum + 0.24) },
    accent: { h: (h0 + 0.33 + r() * 0.34) % 1, s: clamp01(0.65 + ex * 0.3), l: 0.52 },
  };
}

export function makeGenome(seed: string, p: CreatureParams, mode: ColorMode = 'earth'): Genome {
  const rnd = mulberry(seedToInt(seed || 'x'));
  const R: number[] = Array.from({ length: 200 }, () => rnd());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  const rs = (n: number) => Array.from({ length: n }, r);
  const nr = mulberry(seedToInt(seed + ':name'));
  const genus = cap(word(nr, 2 + Math.floor(nr() * 2), END_G)), species = word(nr, 2, END_S), people = cap(word(nr, 2, END_P));

  const cold = 1 - p.temperature, hot = p.temperature, wet = p.water, dry = 1 - p.water;
  const carn = p.diet, herb = 1 - p.diet, ex = p.exotic, grav = p.gravity;
  const alien = mode === 'alien';
  const exA = alien ? Math.max(ex, 0.35) : ex * 0.6; // Earth-like worlds keep anatomy more familiar

  // --- lineage & covering ------------------------------------------------------------------------
  const aquaForm = pick<AquaForm>({ fish: 0.6, eel: 0.25 + wet * 0.1, cephalopod: 0.2 + exA * 0.3, crustacean: 0.25 + dry * 0.1, ray: 0.18, jelly: 0.05 + exA * 0.3 }, rs(6), 0.45);
  const fishBody = pick<FishBody>({ fusiform: 0.6, deep: 0.35 + herb * 0.1, angler: 0.1 + carn * 0.3 + exA * 0.1, puffer: 0.15 + herb * 0.1, boxy: 0.12 }, rs(5), 0.45);
  const covering = pick<Covering>({
    fur: 0.2 + cold * 0.75 + herb * 0.05 - wet * 0.25,
    feathers: 0.15 + cold * 0.25 + p.atmosphere * 0.35 - grav * 0.2,
    scales: 0.15 + hot * 0.55 + dry * 0.35 + (aquaForm === 'fish' ? 0.1 : 0),
    skin: 0.12 + wet * 0.6 + hot * 0.1,
    chitin: 0.02 + exA * 0.4 + (aquaForm === 'crustacean' ? 0.5 : 0) + dry * 0.1,
    plates: 0.04 + grav * 0.45,
  }, rs(6), 0.45);
  const flyScore = 0.05 + p.atmosphere * 0.6 - grav * 0.8 + (covering === 'feathers' ? 0.35 : 0);
  const locomotion = pick<Locomotion>({
    quadruped: 0.6 + grav * 0.2 + herb * 0.1,
    biped: 0.3 + carn * 0.25 - grav * 0.2,
    hopper: 0.12 + herb * 0.15 - grav * 0.3 + dry * 0.1,
    hexapod: 0.05 + exA * 0.45 + grav * 0.2 + (covering === 'chitin' ? 0.4 : 0),
    octopod: 0.02 + exA * 0.3 + (covering === 'chitin' ? 0.3 : 0),
    serpent: 0.06 + hot * 0.2 + (aquaForm === 'eel' ? 0.3 : 0) + (covering === 'scales' ? 0.1 : 0),
    flyer: flyScore,
    dragon: flyScore * 0.6 + carn * 0.1 + (covering === 'scales' ? 0.1 : 0) - 0.1,
    centauroid: 0.02 + exA * 0.25,
  }, rs(9), 0.4);
  const legType = pick<LegType>({
    column: grav * 0.8 + (p.size > 0.7 ? 0.25 : 0) - 0.1,
    plantigrade: 0.3 + cold * 0.2 + (covering === 'fur' ? 0.15 : 0),
    digitigrade: 0.45 + carn * 0.3 + (covering === 'fur' ? 0.15 : 0),
    unguligrade: 0.2 + herb * 0.55 - grav * 0.3,
    avian: covering === 'feathers' ? 0.9 : (locomotion === 'biped' ? 0.25 : -9),
    insectoid: covering === 'chitin' ? 0.95 : exA * 0.3,
    sprawl: 0.1 + (covering === 'scales' ? 0.35 : 0) + (covering === 'skin' ? 0.15 : 0) + hot * 0.1,
    tentacle: exA * 0.35 - 0.1,
    stubby: 0.08 + grav * 0.2,
  }, rs(9), 0.35);
  const bodyShape = pick<BodyShape>({ barrel: 0.3 + herb * 0.3, lean: 0.3 + carn * 0.35, humped: 0.1 + dry * 0.3, long: 0.15 + carn * 0.1, stocky: 0.15 + grav * 0.4 + cold * 0.1, round: 0.1 + herb * 0.15 + cold * 0.15 }, rs(6), 0.4);
  // predators get angular heads, grazers rounder ones
  const headShape = pick<HeadShape>({ round: 0.3 + herb * 0.45, long: 0.25 + herb * 0.3, wedge: 0.2 + carn * 0.55, flat: 0.1 + wet * 0.3, domed: 0.08 + exA * 0.3 + herb * 0.1, hammer: exA * 0.3 - 0.05 }, rs(6), 0.35);
  // herbivores ~0-0.3 (gentle), omnivores ~0.3-0.55 (plain), carnivores ~0.6-1 (menacing)
  const fierce = clamp01(smooth(0.12, 0.95, carn) + (r() - 0.5) * 0.18);

  // --- colour ----------------------------------------------------------------------------------------
  const col = alien ? alienColours(p, r) : earthColours(covering, p, r, false);
  const eye = alien ? { h: r(), s: 0.75, l: 0.5 } : { h: [0.1, 0.13, 0.08, 0.3, 0.58][Math.floor(r() * 5)], s: 0.6, l: fierce > 0.6 ? 0.55 : 0.4 };
  const glowHue = lerp(0.45, 0.85, r());
  const pattern = pick<Pattern>({
    none: 0.3, stripes: 0.12 + carn * 0.25 + hot * 0.1, spots: 0.18 + wet * 0.15, rosettes: 0.05 + carn * 0.25 + hot * 0.1, bands: 0.12,
    patches: 0.12 + herb * 0.15, dapples: 0.08 + herb * 0.25, saddle: 0.1, dorsal: 0.12, rings: 0.06 + exA * 0.2,
  }, rs(10), 0.4);

  // --- body & head ----------------------------------------------------------------------------------
  const size = clamp01(0.25 + p.size * 0.6 + (r() - 0.5) * 0.2 - grav * 0.1);
  const length = lerp(0.8, 1.3, clamp01(r() * 0.7 + (bodyShape === 'long' ? 0.4 : 0) + herb * 0.1));
  const girth = lerp(0.72, 1.3, clamp01(grav * 0.5 + herb * 0.3 + cold * 0.2 + (bodyShape === 'barrel' || bodyShape === 'stocky' || bodyShape === 'round' ? 0.25 : 0) - (bodyShape === 'lean' ? 0.25 : 0) + (r() - 0.5) * 0.3));
  const legLen = lerp(0.6, 1.35, clamp01(1 - grav * 0.8 + (r() - 0.5) * 0.4 + (legType === 'unguligrade' ? 0.2 : 0) - (legType === 'stubby' ? 0.4 : 0) - (legType === 'sprawl' ? 0.2 : 0)));
  const neck = clamp01(r() * 0.5 + herb * 0.35 - grav * 0.3 + (legType === 'unguligrade' ? 0.15 : 0));
  const tailLen = clamp01(0.25 + r() * 0.6 + (locomotion === 'biped' || locomotion === 'hopper' ? 0.25 : 0));
  const tail = pick<Tail>({
    none: 0.05 + (locomotion === 'octopod' ? 0.8 : 0), plain: 0.35, tuft: covering === 'fur' ? 0.4 : 0.02, club: 0.05 + grav * 0.25 + (covering === 'plates' ? 0.3 : 0),
    thagomizer: 0.05 + herb * 0.15 + (covering === 'plates' || covering === 'scales' ? 0.15 : 0), fin: 0.03 + wet * 0.35, fan: covering === 'feathers' ? 0.75 : 0,
    curl: 0.1 + exA * 0.1, bushy: covering === 'fur' ? 0.3 + cold * 0.3 : 0, paddle: wet * 0.3, stinger: (covering === 'chitin' ? 0.5 : 0) + carn * 0.1, whip: 0.1 + hot * 0.1,
  }, rs(12), 0.35);
  const headSize = lerp(0.85, 1.2, r());
  const snout = clamp01(r() * 0.5 + carn * 0.2 + (headShape === 'long' || headShape === 'wedge' ? 0.35 : 0) - (headShape === 'round' || headShape === 'domed' ? 0.25 : 0));
  const jaw = pick<Jaw>({
    teeth: 0.2 + carn * 0.75, beak: covering === 'feathers' ? 0.9 : 0.05 + exA * 0.1, mandibles: covering === 'chitin' ? 0.85 : exA * 0.15,
    soft: 0.3 + herb * 0.45, tusks: 0.03 + herb * 0.2 + cold * 0.15, trunk: 0.02 + herb * 0.2 + (p.size > 0.65 ? 0.2 : 0) - (covering === 'feathers' ? 9 : 0),
  }, rs(6), 0.35);
  const eyes = exA > 0.55 && r() < exA ? [3, 4, 6, 8][Math.floor(r() * 4)] : r() < exA * 0.25 ? 1 : 2;
  const eyeLayout: EyeLayout = eyes === 1 ? 'cyclops' : eyes === 2 ? (exA > 0.6 && r() < 0.3 ? 'stalks' : 'pair') : (['row', 'cluster', 'stalks'] as const)[Math.floor(r() * 3)];
  // gentle faces have big eyes, predators narrow ones
  const eyeSize = lerp(0.7, 1.6, clamp01((1 - p.star) * 0.4 + r() * 0.3 + (1 - fierce) * 0.4));
  const pupil = pick<Pupil>({ round: 0.45 + (1 - fierce) * 0.3, slit: fierce * 0.8 + hot * 0.1, bar: herb * 0.55, compound: covering === 'chitin' ? 0.7 : exA * 0.15 }, rs(4), 0.3);
  const ears = pick<Ears>({
    none: covering === 'scales' || covering === 'chitin' || covering === 'feathers' || covering === 'plates' ? 0.9 : 0.1,
    pointy: 0.25 + carn * 0.25, round: 0.2 + cold * 0.3 + herb * 0.1, long: 0.08 + herb * 0.3 + hot * 0.15, fan: hot * 0.4 + (p.size > 0.6 ? 0.2 : 0) - 0.1,
    tufted: 0.1 + carn * 0.2 + cold * 0.1, droopy: 0.05 + herb * 0.25 + wet * 0.1, fins: wet * 0.35 + exA * 0.15,
  }, rs(8), 0.35);
  const horns = pick<Horns>({
    none: 0.5 + carn * 0.2, ram: 0.05 + herb * 0.3 + cold * 0.1, straight: 0.06 + herb * 0.15, antlers: 0.03 + herb * 0.3 + cold * 0.2 - (covering === 'scales' ? 0.2 : 0),
    crest: 0.05 + (covering === 'feathers' ? 0.45 : 0) + exA * 0.1, frill: 0.03 + (covering === 'scales' ? 0.3 : 0) + hot * 0.1,
    nasal: 0.03 + herb * 0.2 + grav * 0.15, bull: 0.04 + herb * 0.2, unicorn: exA * 0.2, ossicones: herb * 0.15 + (legType === 'unguligrade' ? 0.15 : 0), crown: exA * 0.15 + (covering === 'plates' ? 0.2 : 0),
  }, rs(11), 0.35);
  const hornLen = lerp(0.6, 1.4, r());
  const antennae = covering === 'chitin' ? r() < 0.8 : r() < exA * 0.3;
  const whiskers = (covering === 'fur' || covering === 'skin') && r() < 0.35 + carn * 0.2;
  const cheekFluff = covering === 'fur' && r() < 0.35 + cold * 0.3;
  const back = pick<Back>({
    none: 0.45, spines: 0.08 + carn * 0.2 + (covering === 'scales' ? 0.15 : 0), plates: 0.04 + grav * 0.3 + (covering === 'plates' ? 0.3 : 0),
    sail: 0.03 + hot * 0.25, mane: covering === 'fur' ? 0.35 + carn * 0.15 : 0, shell: 0.02 + grav * 0.15 + herb * 0.15 + (covering === 'plates' ? 0.25 : 0),
    quills: covering === 'fur' || covering === 'feathers' ? 0.12 + herb * 0.1 : 0, hump: 0.04 + dry * 0.35 + herb * 0.1, ridge: 0.1 + (covering === 'scales' ? 0.15 : 0),
    crystals: alien ? exA * 0.4 : -9,
  }, rs(10), 0.35);
  const wings: Wings = locomotion !== 'flyer' && locomotion !== 'dragon' ? 'none'
    : covering === 'feathers' ? 'feather' : covering === 'chitin' ? 'insect' : r() < 0.2 + exA * 0.3 && locomotion === 'flyer' ? 'insect' : 'membrane';
  const claws = carn > 0.4 || r() < 0.3;
  const glow = alien ? clamp01((p.star < 0.2 ? 0.3 : 0) + ex * 0.6 + (r() - 0.6) * 0.8) : clamp01((r() - 0.8) * 2);
  const tentacleBeard = exA > 0.5 && r() < 0.35 || aquaForm === 'cephalopod' && r() < 0.3;

  const cell = {
    shape: (['round', 'oval', 'rod', 'star', 'spiral'] as const)[Math.min(4, Math.floor(r() * (exA > 0.4 ? 5 : 3.2)))],
    flagella: Math.floor(r() * 3.4), cilia: r() < 0.45, spikes: r() < 0.2 + carn * 0.3, organelles: 3 + Math.floor(r() * 6), shell: r() < 0.25,
  };
  const finShape = (['forked', 'lunate', 'round', 'shark', 'veil'] as const)[Math.floor(r() * 5)];
  const dorsal = (['none', 'tall', 'ridge', 'sail', 'spiny'] as const)[Math.floor(r() * 5)];
  const culture = { hue: r(), hue2: r(), hue3: r(), motif: Math.floor(r() * 6), metal: r() < 0.5 ? { h: 0.11, s: 0.55, l: 0.5 } : { h: 0.58, s: 0.08, l: 0.62 }, sat: lerp(0.35, 0.7, r()) };

  return {
    seed, params: p, mode, name: { genus, species, people },
    primary: col.primary, secondary: col.secondary, belly: col.belly, accent: col.accent, eye, glowHue,
    pattern, patternScale: lerp(0.8, 1.5, r()), patternAngle: r() * Math.PI, counterShade: r() < 0.75,
    mask: r() < 0.15 + fierce * 0.25, socks: r() < 0.2, tipColor: r() < 0.35,
    aquaForm, fishBody, covering, locomotion, legType, bodyShape, headShape,
    size, length, girth, legLen, neck, tailLen, tail, headSize, snout, jaw,
    eyes, eyeLayout, eyeSize, pupil, ears, horns, hornLen, antennae, whiskers, cheekFluff, tentacleBeard,
    back, wings, claws, glow, fierce, cell, finShape, dorsal, culture, r: R,
  };
}

/** Sea colours for the ocean stages (a fish is not coloured like the mammal it becomes). */
export function seaColours(g: Genome) {
  if (g.mode === 'alien') return { primary: g.primary, secondary: g.secondary, belly: g.belly, accent: g.accent };
  const rnd = mulberry(seedToInt(g.seed + ':sea'));
  return earthColours('scales', g.params, rnd, true);
}

// ---------------------------------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------------------------------
const COVER_PT: Record<Covering, string> = { scales: 'Escamas', feathers: 'Penas', fur: 'Pelagem', skin: 'Pele lisa', chitin: 'Exoesqueleto de quitina', plates: 'Placas ósseas' };
const LOCO_PT: Record<Locomotion, string> = { quadruped: 'Quadrúpede', biped: 'Bípede', hopper: 'Saltador', hexapod: 'Hexápode', octopod: 'Octópode', serpent: 'Serpentiforme', flyer: 'Voador', dragon: 'Quadrúpede alado', centauroid: 'Centauroide' };
const LEG_PT: Record<LegType, string> = { column: 'colunares', plantigrade: 'plantígradas', digitigrade: 'digitígradas', unguligrade: 'com cascos', avian: 'de ave', insectoid: 'articuladas', sprawl: 'esparramadas', tentacle: 'tentaculares', stubby: 'curtas e grossas' };
const AQUA_PT: Record<AquaForm, string> = { fish: 'Peixe', eel: 'Enguia', cephalopod: 'Cefalópode', crustacean: 'Crustáceo', ray: 'Raia', jelly: 'Água-viva' };
const JAW_PT: Record<Jaw, string> = { teeth: 'mandíbula dentada', beak: 'bico córneo', mandibles: 'mandíbulas quitinosas', soft: 'boca macia', tusks: 'presas', trunk: 'tromba' };
const PATTERN_PT: Record<Pattern, string> = { none: 'uniforme', stripes: 'listrado', spots: 'pintado', rosettes: 'rosetas', bands: 'em faixas', patches: 'malhado', dapples: 'mosqueado', saddle: 'sela', dorsal: 'faixa dorsal', rings: 'anelado' };

export function describe(g: Genome, stage: Stage): { title: string; lines: [string, string][]; blurb: string; society?: string } {
  const p = g.params;
  const diet = p.diet > 0.66 ? 'Carnívoro' : p.diet > 0.36 ? 'Onívoro' : 'Herbívoro';
  const temp = Math.round(-60 + p.temperature * 140);
  const grav = (0.2 + p.gravity * 2.8).toFixed(1);
  const star = p.star < 0.2 ? 'anã vermelha' : p.star < 0.45 ? 'estrela laranja' : p.star < 0.7 ? 'estrela amarela' : p.star < 0.88 ? 'estrela branca' : 'gigante azul';
  const civ = isCiv(stage);
  const lines: [string, string][] = [];
  if (stage === Stage.CELL) {
    lines.push(['Forma', { round: 'Esférica', oval: 'Ovalada', rod: 'Bastonete', star: 'Estrelada', spiral: 'Espiral' }[g.cell.shape]]);
    lines.push(['Locomoção', g.cell.flagella ? `${g.cell.flagella} flagelo${g.cell.flagella > 1 ? 's' : ''}` : g.cell.cilia ? 'Cílios' : 'Deriva']);
    lines.push(['Nutrição', p.diet > 0.5 ? 'Fagocitose (predadora)' : 'Fotossíntese / filtração']);
  } else if (stage <= Stage.AQUA_GIANT) {
    lines.push(['Plano corporal', AQUA_PT[g.aquaForm]]);
    lines.push(['Dieta', diet]);
    lines.push(['Olhos', `${g.eyes}`]);
  } else {
    lines.push(['Locomoção', stage === Stage.AMPHIBIAN || stage === Stage.AMPHIBIAN_GIANT ? 'Rastejante anfíbio' : civ ? (g.locomotion === 'serpent' ? 'Ereto sobre a cauda' : g.locomotion === 'centauroid' ? 'Centauroide' : 'Bípede ereto') : LOCO_PT[g.locomotion]]);
    if (!civ && stage !== Stage.AMPHIBIAN && stage !== Stage.AMPHIBIAN_GIANT && g.locomotion !== 'serpent') lines.push(['Pernas', LEG_PT[g.legType]]);
    lines.push(['Cobertura', stage === Stage.AMPHIBIAN || stage === Stage.AMPHIBIAN_GIANT ? 'Pele úmida' : COVER_PT[g.covering]]);
    lines.push(['Dieta', diet]);
    lines.push(['Boca', JAW_PT[g.jaw]]);
    lines.push(['Olhos', `${g.eyes}`]);
  }
  lines.push(['Padrão', PATTERN_PT[g.pattern]]);
  lines.push(['Mundo natal', `${grav} g · ${temp > 0 ? '+' : ''}${temp} °C · ${star}`]);
  lines.push(['Paleta', g.mode === 'earth' ? 'Natural (Earth-like)' : 'Alienígena']);

  const habitat = p.water > 0.7 ? 'pântanos e mares rasos' : p.water < 0.3 ? 'desertos e planaltos secos' : p.temperature < 0.3 ? 'tundras geladas' : p.temperature > 0.7 ? 'savanas escaldantes' : 'florestas e campos';
  const mood = p.diet > 0.66 ? 'predador temível' : p.diet < 0.36 ? 'pastador tranquilo' : 'onívoro oportunista';
  const blurbs: Partial<Record<Stage, string>> = {
    [Stage.CELL]: `Uma célula ${p.diet > 0.5 ? 'predadora que engole vizinhas' : 'que filtra a sopa primordial'}, o primeiro elo da linhagem ${g.name.genus}.`,
    [Stage.AQUA_LARVA]: `Larva translúcida que se esconde entre partículas em suspensão, já com ${g.eyes === 1 ? 'um único olho' : `${g.eyes} olhos`}.`,
    [Stage.AQUA]: `${AQUA_PT[g.aquaForm]} ${diet.toLowerCase()} de padrão ${PATTERN_PT[g.pattern]}, patrulhando os mares rasos.`,
    [Stage.AQUA_GIANT]: `O ramo colossal da linhagem: o maior ${AQUA_PT[g.aquaForm].toLowerCase()} dos abismos${g.glow > 0.25 ? ', coberto de pontos que brilham no escuro' : ''}.`,
    [Stage.AMPHIBIAN]: `As nadadeiras viraram patas: o primeiro ${g.name.genus} a arrastar-se para fora da água.`,
    [Stage.AMPHIBIAN_GIANT]: `Descendente dos colossos marinhos, um anfíbio blindado do tamanho de um barco que domina os estuários.`,
    [Stage.LAND]: `${LOCO_PT[g.locomotion]} de ${COVER_PT[g.covering].toLowerCase()}, ${mood} adaptado a ${habitat}.`,
    [Stage.LAND_GIANT]: `O titã da linhagem gigante: um ${LOCO_PT[g.locomotion].toLowerCase()} de várias toneladas que faz a terra tremer em ${habitat}.`,
  };
  const society: Partial<Record<Stage, string>> = {
    [Stage.TRIBAL]: `Tribo ${g.name.people}`, [Stage.MEDIEVAL]: `Reino de ${g.name.people}`, [Stage.RENAISSANCE]: `Império ${g.name.people}`,
    [Stage.INDUSTRIAL]: `Confederação ${g.name.people}`, [Stage.MODERN]: `República ${g.name.people}`, [Stage.CONTEMPORARY]: `União ${g.name.people}`,
    [Stage.FUTURIST]: `Consórcio ${g.name.people}`, [Stage.SPACE]: `Comunidade Estelar ${g.name.people}`,
  };
  const civBlurb: Partial<Record<Stage, string>> = {
    [Stage.TRIBAL]: 'Aldeias, peles curtidas, colares de contas e pinturas corporais.',
    [Stage.MEDIEVAL]: 'Vilas e mercados: túnicas de lã, capuzes, aventais e cestos.',
    [Stage.RENAISSANCE]: 'Veludo, golas plissadas e as primeiras cidades cosmopolitas.',
    [Stage.INDUSTRIAL]: 'Fumaça de carvão, sobrecasacas, vestidos com anquinha e guarda-chuvas.',
    [Stage.MODERN]: 'Ternos, vestidos soltos, chapéus e o jornal da manhã.',
    [Stage.CONTEMPORARY]: 'Moletons, jeans, tênis e o mundo inteiro na tela do telefone.',
    [Stage.FUTURIST]: 'Tecidos inteligentes com fios luminosos e óculos de realidade aumentada.',
    [Stage.SPACE]: 'Cidadãos de várias estrelas: macacões leves, capas e joias de luz.',
  };
  return { title: `${g.name.genus} ${g.name.species}`, lines, blurb: (civ ? civBlurb[stage] : blurbs[stage]) ?? '', society: civ ? society[stage] : undefined };
}
