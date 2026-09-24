// Procedural species genome.
//
// A genome is a pure function of (seed, planet parameters). Every random number is drawn up-front in
// a fixed order and then *combined* with the parameters, so dragging a slider morphs the same species
// smoothly instead of reshuffling it. One genome drives the whole lineage: the cell, the sea larva,
// the leviathan, the first walker on the shore and, finally, the people wearing the clothes of each era.
import { mulberry, seedToInt } from '../terrain/noise';

export enum Stage {
  CELL, AQUA_LARVA, AQUA, AQUA_GIANT, AMPHIBIAN, LAND,
  TRIBAL, MEDIEVAL, RENAISSANCE, INDUSTRIAL, MODERN, CONTEMPORARY, FUTURIST, SPACE,
}
export type StageGroup = 'Célula' | 'Oceano' | 'Terra' | 'Civilização';
export const STAGES: { id: Stage; name: string; group: StageGroup; scale: string; years?: string }[] = [
  { id: Stage.CELL, name: 'Celular', group: 'Célula', scale: '≈ 40 µm' },
  { id: Stage.AQUA_LARVA, name: 'Aquática inicial', group: 'Oceano', scale: '≈ 2 cm' },
  { id: Stage.AQUA, name: 'Aquática', group: 'Oceano', scale: '≈ 60 cm' },
  { id: Stage.AQUA_GIANT, name: 'Aquática gigante', group: 'Oceano', scale: '≈ 14 m' },
  { id: Stage.AMPHIBIAN, name: 'Transição (anfíbia)', group: 'Terra', scale: '≈ 1,5 m' },
  { id: Stage.LAND, name: 'Terrestre', group: 'Terra', scale: '≈ 2 m' },
  { id: Stage.TRIBAL, name: 'Tribal', group: 'Civilização', scale: '≈ 1,8 m', years: 'pré-história' },
  { id: Stage.MEDIEVAL, name: 'Medieval', group: 'Civilização', scale: '≈ 1,8 m', years: '500–1400' },
  { id: Stage.RENAISSANCE, name: 'Clássica', group: 'Civilização', scale: '≈ 1,8 m', years: '≈ 1500' },
  { id: Stage.INDUSTRIAL, name: 'Vitoriana / industrial', group: 'Civilização', scale: '≈ 1,8 m', years: '1800–1900' },
  { id: Stage.MODERN, name: 'Moderna', group: 'Civilização', scale: '≈ 1,8 m', years: '1900–1950' },
  { id: Stage.CONTEMPORARY, name: 'Contemporânea', group: 'Civilização', scale: '≈ 1,8 m', years: 'hoje' },
  { id: Stage.FUTURIST, name: 'Futurista', group: 'Civilização', scale: '≈ 1,8 m', years: '2050–2100' },
  { id: Stage.SPACE, name: 'Espacial', group: 'Civilização', scale: '≈ 1,8 m', years: '2100+' },
];

/** Planet / ecology parameters, all normalised 0..1 (the UI maps them to physical units). */
export interface CreatureParams {
  gravity: number;      // 0 = 0.2 g .. 1 = 3 g
  temperature: number;  // 0 = -60 °C .. 1 = +80 °C
  water: number;        // 0 = desert .. 1 = swamp / ocean world
  atmosphere: number;   // 0 = thin .. 1 = very dense
  star: number;         // 0 = red dwarf .. 1 = blue giant
  diet: number;         // 0 = herbivore .. 1 = carnivore
  exotic: number;       // 0 = Earth-like .. 1 = truly alien
  size: number;         // 0 = small .. 1 = huge
}
export const DEFAULT_PARAMS: CreatureParams = { gravity: 0.35, temperature: 0.5, water: 0.5, atmosphere: 0.5, star: 0.55, diet: 0.5, exotic: 0.3, size: 0.5 };

export type Locomotion = 'quadruped' | 'biped' | 'hexapod' | 'serpent' | 'flyer';
export type Covering = 'scales' | 'feathers' | 'fur' | 'skin' | 'chitin' | 'plates';
export type AquaForm = 'fish' | 'eel' | 'cephalopod' | 'crustacean';
export type Pattern = 'none' | 'stripes' | 'spots' | 'rings' | 'patches' | 'bands' | 'rosettes';
export type Jaw = 'teeth' | 'beak' | 'mandibles' | 'soft' | 'tusks';
export type Ears = 'none' | 'pointy' | 'round' | 'long' | 'fins';
export type Horns = 'none' | 'curved' | 'straight' | 'antlers' | 'crest' | 'frill';
export type Back = 'none' | 'spines' | 'plates' | 'sail' | 'mane' | 'shell' | 'quills';
export type Wings = 'none' | 'feather' | 'membrane' | 'insect';
export type Feet = 'paw' | 'hoof' | 'talon' | 'insect' | 'pad';
export type TailTip = 'plain' | 'tuft' | 'club' | 'spike' | 'fin' | 'fan';
export type Pupil = 'round' | 'slit' | 'bar' | 'compound';

export interface HSL { h: number; s: number; l: number }

export interface Genome {
  seed: string;
  params: CreatureParams;
  name: { genus: string; species: string; people: string };
  // colour
  primary: HSL; secondary: HSL; belly: HSL; accent: HSL; eye: HSL; glowHue: number;
  pattern: Pattern; patternScale: number; patternAngle: number; counterShade: boolean;
  // lineage
  aquaForm: AquaForm; covering: Covering; locomotion: Locomotion;
  // body
  size: number; length: number; girth: number; legLen: number; neck: number; tail: number; tailTip: TailTip;
  headSize: number; snout: number; jaw: Jaw;
  eyes: number; eyeSize: number; eyeFront: boolean; eyeStalks: boolean; pupil: Pupil;
  ears: Ears; horns: Horns; hornLen: number; antennae: boolean;
  back: Back; wings: Wings; feet: Feet; arms: number; claws: boolean;
  glow: number; tentacleBeard: boolean;
  // cell
  cell: { shape: 'round' | 'oval' | 'rod' | 'star'; flagella: number; cilia: boolean; spikes: boolean; organelles: number };
  // aquatic
  finShape: 'forked' | 'lunate' | 'round' | 'shark'; dorsal: 'none' | 'tall' | 'ridge' | 'sail';
  // culture
  culture: { hue: number; hue2: number; motif: number; metal: HSL };
  /** random numbers kept for the painters (deterministic per species) */
  r: number[];
}

const SYL_A = ['va', 'ko', 'ra', 'thu', 'zel', 'mi', 'or', 'ka', 'shi', 'lu', 'dra', 'ne', 'xo', 'bel', 'ta', 'qui', 'mor', 'is', 'ga', 'vex', 'ul', 'sa', 'rhe', 'no', 'fen', 'ath', 'ky', 'zu', 'pel', 'om'];
const SYL_B = ['rak', 'lis', 'dor', 'men', 'tha', 'vi', 'nox', 'ria', 'gan', 'sor', 'lek', 'ma', 'dun', 'phi', 'tor', 'xil', 'ven', 'bra', 'ku', 'sen'];
const END_G = ['us', 'ax', 'or', 'on', 'ix', 'ar', 'is', 'um', 'oth', 'yx'];
const END_S = ['ensis', 'ii', 'ata', 'ica', 'oides', 'ura', 'ifera', 'ana', 'ides', 'aris'];
const END_P = ['i', 'ari', 'eni', 'ath', 'uun', 'ori', 'esh', 'ai'];

function word(rnd: () => number, parts: number, end: string[]) {
  let w = '';
  for (let i = 0; i < parts; i++) w += (i % 2 ? SYL_B : SYL_A)[Math.floor(rnd() * (i % 2 ? SYL_B.length : SYL_A.length))];
  return w + end[Math.floor(rnd() * end.length)];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** weighted choice: highest (score + noise) wins, so parameters bias but the seed still decides */
function pick<T extends string>(scores: Record<T, number>, rs: number[], noise = 0.6): T {
  let best: T | null = null, bv = -1e9, i = 0;
  for (const k in scores) {
    const v = scores[k] + (rs[i++ % rs.length] - 0.5) * 2 * noise;
    if (v > bv) { bv = v; best = k; }
  }
  return best as T;
}
const hueLerp = (a: number, b: number, t: number) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return (a + d * t + 1) % 1; };

export function makeGenome(seed: string, p: CreatureParams): Genome {
  const rnd = mulberry(seedToInt(seed || 'x'));
  const R: number[] = Array.from({ length: 160 }, () => rnd());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  const rs = (n: number) => Array.from({ length: n }, r);

  // names depend only on the seed (the species keeps its name while the planet sliders move)
  const nr = mulberry(seedToInt(seed + ':name'));
  const genus = cap(word(nr, 2 + Math.floor(nr() * 2), END_G));
  const species = word(nr, 2, END_S);
  const people = cap(word(nr, 2, END_P));

  const cold = 1 - p.temperature, hot = p.temperature, wet = p.water, dry = 1 - p.water;
  const carn = p.diet, herb = 1 - p.diet, ex = p.exotic;

  // --- colour: environment first, seed second ---------------------------------------------------
  const envHue = hot > 0.6 ? lerp(0.07, 0.02, (hot - 0.6) / 0.4) : cold > 0.65 ? 0.58 : wet > 0.6 ? 0.3 : 0.1;
  const starTint = lerp(0.95, 0.62, p.star); // red dwarf -> magenta/red pigments, blue star -> cyan/blue
  let h0 = hueLerp(envHue, starTint, 0.25 + ex * 0.2);
  h0 = hueLerp(h0, r(), 0.35 + ex * 0.55);
  const sat = clamp01(0.32 + ex * 0.4 + (wet - 0.5) * 0.15 + (r() - 0.5) * 0.25 - (cold > 0.7 ? 0.15 : 0));
  const lum = clamp01(0.42 + (cold > 0.75 ? 0.22 : 0) - (p.star < 0.25 ? 0.08 : 0) + (r() - 0.5) * 0.16);
  const harmony = r();
  const h1 = harmony < 0.35 ? (h0 + 0.5) % 1 : harmony < 0.7 ? (h0 + 0.08 + r() * 0.07) % 1 : (h0 + 0.93 - r() * 0.07) % 1;
  const primary = { h: h0, s: sat, l: lum };
  const secondary = { h: h1, s: clamp01(sat + 0.12), l: clamp01(lum + (r() - 0.6) * 0.3) };
  const belly = { h: hueLerp(h0, 0.12, 0.4), s: sat * 0.55, l: clamp01(lum + 0.24) };
  const accent = { h: (h0 + 0.33 + r() * 0.34) % 1, s: clamp01(0.6 + ex * 0.3), l: 0.52 };
  const eye = { h: r() < 0.5 ? (h1 + 0.5) % 1 : 0.12 + r() * 0.05, s: 0.75, l: 0.5 };
  const glowHue = lerp(0.45, 0.85, r());

  const pattern = pick<Pattern>({ none: 0.2, stripes: 0.25 + carn * 0.2, spots: 0.25 + wet * 0.2, rings: 0.12, patches: 0.18 + herb * 0.15, bands: 0.15, rosettes: 0.1 + carn * 0.2 + hot * 0.1 }, rs(7), 0.45);

  // --- lineage -------------------------------------------------------------------------------------
  const aquaForm = pick<AquaForm>({ fish: 0.55, eel: 0.25 + wet * 0.1, cephalopod: 0.2 + ex * 0.3, crustacean: 0.22 + dry * 0.1 + ex * 0.1 }, rs(4), 0.5);
  const covering = pick<Covering>({
    fur: 0.2 + cold * 0.75 + herb * 0.05 - wet * 0.25,
    feathers: 0.15 + cold * 0.3 + p.atmosphere * 0.35 - p.gravity * 0.2,
    scales: 0.15 + hot * 0.55 + dry * 0.35 + (aquaForm === 'fish' ? 0.15 : 0),
    skin: 0.1 + wet * 0.65 + hot * 0.1,
    chitin: 0.05 + ex * 0.4 + (aquaForm === 'crustacean' ? 0.55 : 0) + dry * 0.1,
    plates: 0.05 + p.gravity * 0.45 + carn * 0.05,
  }, rs(6), 0.45);
  const flyScore = 0.1 + p.atmosphere * 0.65 - p.gravity * 0.75 + (covering === 'feathers' ? 0.35 : 0) + (covering === 'chitin' ? 0.1 : 0);
  const locomotion = pick<Locomotion>({
    quadruped: 0.55 + p.gravity * 0.2 + herb * 0.1,
    biped: 0.35 + carn * 0.25 - p.gravity * 0.2,
    hexapod: 0.1 + ex * 0.45 + p.gravity * 0.25 + (covering === 'chitin' ? 0.35 : 0),
    serpent: 0.08 + hot * 0.2 + (aquaForm === 'eel' ? 0.35 : 0) + (covering === 'scales' ? 0.1 : 0),
    flyer: flyScore,
  }, rs(5), 0.4);

  // --- body proportions ------------------------------------------------------------------------------
  const g = p.gravity;
  const size = clamp01(0.25 + p.size * 0.6 + (r() - 0.5) * 0.2 - g * 0.1);
  const length = lerp(0.75, 1.3, clamp01(r() * 0.7 + (locomotion === 'serpent' ? 0.5 : 0) + herb * 0.15));
  const girth = lerp(0.7, 1.35, clamp01(g * 0.6 + herb * 0.3 + cold * 0.2 + (r() - 0.5) * 0.4));
  const legLen = lerp(0.55, 1.35, clamp01(1 - g * 0.8 + (r() - 0.5) * 0.4 + (locomotion === 'biped' ? 0.15 : 0)));
  const neck = clamp01(r() * 0.55 + herb * 0.35 - g * 0.35 + (locomotion === 'flyer' ? 0.1 : 0));
  const tail = clamp01(0.2 + r() * 0.7 + (locomotion === 'biped' ? 0.25 : 0) - (covering === 'feathers' ? 0.2 : 0));
  const tailTip = pick<TailTip>({
    plain: 0.4, tuft: covering === 'fur' ? 0.55 : 0.05, club: 0.1 + g * 0.3 + (covering === 'plates' ? 0.3 : 0), spike: 0.1 + carn * 0.2,
    fin: 0.05 + wet * 0.35, fan: covering === 'feathers' ? 0.7 : 0,
  }, rs(6), 0.4);
  const headSize = lerp(0.8, 1.25, r());
  const snout = clamp01(r() * 0.6 + carn * 0.25 + herb * 0.15);
  const jaw = pick<Jaw>({
    teeth: 0.2 + carn * 0.7, beak: covering === 'feathers' ? 0.9 : 0.1 + ex * 0.1, mandibles: covering === 'chitin' ? 0.8 : ex * 0.2,
    soft: 0.25 + herb * 0.4, tusks: 0.05 + herb * 0.25 + cold * 0.15,
  }, rs(5), 0.35);
  const eyes = ex > 0.55 && r() < ex ? [3, 4, 6][Math.floor(r() * 3)] : r() < ex * 0.3 ? 1 : 2;
  const eyeSize = lerp(0.7, 1.6, clamp01((1 - p.star) * 0.6 + r() * 0.4));
  const eyeFront = carn > 0.55 ? r() < 0.8 : r() < 0.15;
  const eyeStalks = ex > 0.6 && r() < 0.35;
  const pupil = pick<Pupil>({ round: 0.5, slit: carn * 0.7 + hot * 0.15, bar: herb * 0.6, compound: covering === 'chitin' ? 0.7 : ex * 0.2 }, rs(4), 0.3);
  const ears = pick<Ears>({
    none: covering === 'scales' || covering === 'chitin' || covering === 'feathers' ? 0.8 : 0.2, pointy: 0.3 + carn * 0.2,
    round: 0.25 + cold * 0.3, long: 0.1 + hot * 0.4 + herb * 0.2, fins: wet * 0.4 + ex * 0.2,
  }, rs(5), 0.35);
  const horns = pick<Horns>({
    none: 0.45, curved: 0.1 + herb * 0.35, straight: 0.1 + herb * 0.2, antlers: 0.05 + herb * 0.3 + cold * 0.25 - (covering === 'scales' ? 0.2 : 0),
    crest: 0.08 + (covering === 'feathers' ? 0.4 : 0) + ex * 0.15, frill: 0.05 + (covering === 'scales' ? 0.35 : 0) + hot * 0.1,
  }, rs(6), 0.4);
  const hornLen = lerp(0.6, 1.4, r());
  const antennae = covering === 'chitin' ? r() < 0.75 : r() < ex * 0.35;
  const back = pick<Back>({
    none: 0.4, spines: 0.1 + carn * 0.2 + (covering === 'scales' ? 0.2 : 0), plates: 0.05 + g * 0.35 + (covering === 'plates' ? 0.3 : 0),
    sail: 0.05 + hot * 0.3, mane: covering === 'fur' ? 0.45 + carn * 0.1 : 0, shell: 0.03 + g * 0.2 + herb * 0.2 + (covering === 'plates' ? 0.25 : 0),
    quills: covering === 'fur' || covering === 'feathers' ? 0.15 + herb * 0.1 : 0,
  }, rs(7), 0.4);
  const wings: Wings = locomotion !== 'flyer' ? 'none'
    : covering === 'feathers' ? 'feather' : covering === 'chitin' ? 'insect' : r() < 0.25 + ex * 0.3 ? 'insect' : 'membrane';
  const feet = pick<Feet>({
    paw: covering === 'fur' ? 0.7 : 0.25 + carn * 0.2, hoof: herb * 0.6 + (covering === 'fur' ? 0.15 : 0) - (locomotion === 'biped' ? 0.3 : 0),
    talon: (covering === 'feathers' ? 0.8 : 0.1) + carn * 0.15 + (locomotion === 'flyer' ? 0.3 : 0), insect: covering === 'chitin' ? 0.9 : 0.02,
    pad: g * 0.5 + (size > 0.7 ? 0.3 : 0),
  }, rs(5), 0.3);
  const arms = locomotion === 'hexapod' ? 4 : 2;
  const claws = carn > 0.45 || r() < 0.3;
  const glow = clamp01((p.star < 0.2 ? 0.3 : 0) + ex * 0.6 + (r() - 0.6) * 0.8);
  const tentacleBeard = ex > 0.5 && r() < 0.4 || aquaForm === 'cephalopod' && r() < 0.35;

  const cell = {
    shape: (['round', 'oval', 'rod', 'star'] as const)[Math.min(3, Math.floor(r() * (ex > 0.5 ? 4 : 3.2)))],
    flagella: Math.floor(r() * 3.4), cilia: r() < 0.45, spikes: r() < 0.2 + carn * 0.3, organelles: 3 + Math.floor(r() * 6),
  };
  const finShape = (['forked', 'lunate', 'round', 'shark'] as const)[Math.floor(r() * 4)];
  const dorsal = (['none', 'tall', 'ridge', 'sail'] as const)[Math.floor(r() * 4)];

  const culture = {
    hue: r(), hue2: r(), motif: Math.floor(r() * 4),
    metal: r() < 0.5 ? { h: 0.11, s: 0.55, l: 0.5 } : { h: 0.58, s: 0.08, l: 0.62 },
  };

  return {
    seed, params: p, name: { genus, species, people },
    primary, secondary, belly, accent, eye, glowHue,
    pattern, patternScale: lerp(0.7, 1.5, r()), patternAngle: r() * Math.PI, counterShade: r() < 0.7,
    aquaForm, covering, locomotion,
    size, length, girth, legLen, neck, tail, tailTip, headSize, snout, jaw,
    eyes, eyeSize, eyeFront, eyeStalks, pupil, ears, horns, hornLen, antennae, back, wings, feet, arms, claws, glow, tentacleBeard,
    cell, finShape, dorsal, culture, r: R,
  };
}

// ---------------------------------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------------------------------
const COVER_PT: Record<Covering, string> = { scales: 'Escamas', feathers: 'Penas', fur: 'Pelagem', skin: 'Pele lisa', chitin: 'Exoesqueleto de quitina', plates: 'Placas ósseas' };
const LOCO_PT: Record<Locomotion, string> = { quadruped: 'Quadrúpede', biped: 'Bípede', hexapod: 'Hexápode', serpent: 'Serpentiforme', flyer: 'Voador' };
const AQUA_PT: Record<AquaForm, string> = { fish: 'Peixe', eel: 'Enguia', cephalopod: 'Cefalópode', crustacean: 'Crustáceo' };
const JAW_PT: Record<Jaw, string> = { teeth: 'mandíbula dentada', beak: 'bico córneo', mandibles: 'mandíbulas quitinosas', soft: 'boca macia', tusks: 'presas' };
const PATTERN_PT: Record<Pattern, string> = { none: 'uniforme', stripes: 'listrado', spots: 'pintado', rings: 'anelado', patches: 'malhado', bands: 'em faixas', rosettes: 'rosetas' };

export function describe(g: Genome, stage: Stage): { title: string; lines: [string, string][]; blurb: string; society?: string } {
  const p = g.params;
  const diet = p.diet > 0.66 ? 'Carnívoro' : p.diet > 0.36 ? 'Onívoro' : 'Herbívoro';
  const temp = Math.round(-60 + p.temperature * 140);
  const grav = (0.2 + p.gravity * 2.8).toFixed(1);
  const star = p.star < 0.2 ? 'anã vermelha' : p.star < 0.45 ? 'estrela laranja' : p.star < 0.7 ? 'estrela amarela' : p.star < 0.88 ? 'estrela branca' : 'gigante azul';
  const civ = stage >= Stage.TRIBAL;
  const lines: [string, string][] = [];
  if (stage === Stage.CELL) {
    lines.push(['Forma', { round: 'Esférica', oval: 'Ovalada', rod: 'Bastonete', star: 'Estrelada' }[g.cell.shape]]);
    lines.push(['Locomoção', g.cell.flagella ? `${g.cell.flagella} flagelo${g.cell.flagella > 1 ? 's' : ''}` : g.cell.cilia ? 'Cílios' : 'Deriva']);
    lines.push(['Nutrição', p.diet > 0.5 ? 'Fagocitose (predadora)' : 'Fotossíntese / filtração']);
  } else if (stage <= Stage.AQUA_GIANT) {
    lines.push(['Plano corporal', AQUA_PT[g.aquaForm]]);
    lines.push(['Dieta', diet]);
    lines.push(['Olhos', `${g.eyes}`]);
    if (stage === Stage.AQUA_GIANT && g.glow > 0.25) lines.push(['Bioluminescência', 'Sim']);
  } else {
    lines.push(['Locomoção', stage === Stage.AMPHIBIAN ? 'Rastejante anfíbio' : civ ? (g.locomotion === 'serpent' ? 'Ereto sobre a cauda' : 'Bípede ereto') : LOCO_PT[g.locomotion]]);
    lines.push(['Cobertura', stage === Stage.AMPHIBIAN ? 'Pele úmida' : COVER_PT[g.covering]]);
    lines.push(['Dieta', diet]);
    lines.push(['Boca', JAW_PT[g.jaw]]);
    lines.push(['Olhos', `${g.eyes}${g.eyeStalks ? ' (pedunculados)' : ''}`]);
    if (civ && g.arms > 2) lines.push(['Braços', `${g.arms}`]);
  }
  lines.push(['Padrão', PATTERN_PT[g.pattern]]);
  lines.push(['Mundo natal', `${grav} g · ${temp > 0 ? '+' : ''}${temp} °C · ${star}`]);

  const habitat = p.water > 0.7 ? 'pântanos e mares rasos' : p.water < 0.3 ? 'desertos e planaltos secos' : p.temperature < 0.3 ? 'tundras geladas' : p.temperature > 0.7 ? 'savanas escaldantes' : 'florestas e campos';
  const blurbs: Record<number, string> = {
    [Stage.CELL]: `Uma célula ${p.diet > 0.5 ? 'predadora que engole vizinhas' : 'que filtra a sopa primordial'}, o primeiro elo da linhagem ${g.name.genus}.`,
    [Stage.AQUA_LARVA]: `Larva translúcida que se esconde entre partículas em suspensão, já com ${g.eyes === 1 ? 'um único olho' : `${g.eyes} olhos`}.`,
    [Stage.AQUA]: `${AQUA_PT[g.aquaForm]} ${diet.toLowerCase()} de padrão ${PATTERN_PT[g.pattern]}, patrulhando os mares rasos.`,
    [Stage.AQUA_GIANT]: `Um colosso dos abismos: o maior ${AQUA_PT[g.aquaForm].toLowerCase()} do planeta${g.glow > 0.25 ? ', coberto de pontos que brilham no escuro' : ''}.`,
    [Stage.AMPHIBIAN]: `As nadadeiras viraram patas: o primeiro ${g.name.genus} a arrastar-se para fora da água.`,
    [Stage.LAND]: `${LOCO_PT[g.locomotion]} ${diet.toLowerCase()} de ${COVER_PT[g.covering].toLowerCase()}, adaptado a ${habitat}.`,
  };
  const society: Record<number, string> = {
    [Stage.TRIBAL]: `Tribo ${g.name.people}`, [Stage.MEDIEVAL]: `Reino de ${g.name.people}`, [Stage.RENAISSANCE]: `Império ${g.name.people}`,
    [Stage.INDUSTRIAL]: `Confederação ${g.name.people}`, [Stage.MODERN]: `República ${g.name.people}`, [Stage.CONTEMPORARY]: `União ${g.name.people}`,
    [Stage.FUTURIST]: `Consórcio ${g.name.people}`, [Stage.SPACE]: `Hegemonia Estelar ${g.name.people}`,
  };
  const civBlurb: Record<number, string> = {
    [Stage.TRIBAL]: 'Caçadores-coletores com lanças de pedra, peles e pinturas rituais.',
    [Stage.MEDIEVAL]: 'Castelos, túnicas de lã tingida e cotas de malha.',
    [Stage.RENAISSANCE]: 'Veludo, golas plissadas e navegadores que cruzam oceanos.',
    [Stage.INDUSTRIAL]: 'Fumaça de carvão, cartolas e engrenagens de latão.',
    [Stage.MODERN]: 'Ternos, chapéus fedora e o rádio em todas as casas.',
    [Stage.CONTEMPORARY]: 'Moletons, tênis e o mundo inteiro na tela do telefone.',
    [Stage.FUTURIST]: 'Tecidos inteligentes com circuitos luminosos e visores holográficos.',
    [Stage.SPACE]: 'Trajes pressurizados: a espécie agora habita outras estrelas.',
  };
  return {
    title: `${g.name.genus} ${g.name.species}`,
    lines,
    blurb: civ ? civBlurb[stage] : blurbs[stage],
    society: civ ? society[stage] : undefined,
  };
}
