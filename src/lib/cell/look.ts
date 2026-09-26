// A cell species: its name, colour mode and the appearance sliders the player sets in the cell editor. Everything the
// art needs is derived from these numbers, so a species always looks the same for the same (seed, look, mode).
import { mulberry, seedToInt } from '../terrain/noise';
import { speciesName } from '../creature/genome';
import type { ColorMode } from '../creature/genome';

export type CellShape = 'round' | 'oval' | 'rod' | 'egg' | 'star' | 'bean' | 'blob';
export type CellPattern = 'none' | 'spots' | 'stripes' | 'rings' | 'speckles' | 'bands';

export interface CellLook {
  // colour (0..1)
  hue: number; sat: number; light: number;       // membrane
  hue2: number;                                   // cytoplasm / pattern
  nucleusHue: number;
  accentHue: number;                              // organelles, vesicles, eyespot
  translucency: number;
  glow: number;                                   // bioluminescent dots
  pattern: CellPattern; patternScale: number;
  // form (0..1 unless noted)
  shape: CellShape;
  size: number; elongation: number; wobble: number; membrane: number;
  nucleusSize: number; organelles: number; vacuoles: number;
  cilia: number; ciliaLength: number;
  flagella: number;                               // 0..4 (integer)
  flagellumLength: number;
  spikes: number; eyespot: number;
}

export interface CellSpecies {
  seed: string; genus: string; species: string; mode: ColorMode; look: CellLook;
  /** set when the cellular era is won: the stolen genes and the body the colony evolved into (diet, size...) */
  evolved?: { genes: string[]; diet: number; size: number; at: number };
}

export const SHAPES: [CellShape, string][] = [
  ['round', 'Esférica'], ['oval', 'Ovalada'], ['rod', 'Bastonete'], ['egg', 'Gota'], ['star', 'Estrelada'], ['bean', 'Feijão'], ['blob', 'Ameboide'],
];
export const PATTERNS: [CellPattern, string][] = [
  ['none', 'Nenhum'], ['spots', 'Pintas'], ['stripes', 'Listras'], ['rings', 'Anéis'], ['speckles', 'Salpicado'], ['bands', 'Faixas'],
];

type NumKey = { [K in keyof CellLook]: CellLook[K] extends number ? K : never }[keyof CellLook];
export interface LookSlider { key: NumKey; label: string; group: 'Cor' | 'Forma' | 'Organelas' | 'Apêndices'; max?: number; step?: number }
export const LOOK_SLIDERS: LookSlider[] = [
  { key: 'hue', label: 'Cor da membrana', group: 'Cor' },
  { key: 'sat', label: 'Saturação', group: 'Cor' },
  { key: 'light', label: 'Luminosidade', group: 'Cor' },
  { key: 'hue2', label: 'Cor do citoplasma', group: 'Cor' },
  { key: 'nucleusHue', label: 'Cor do núcleo', group: 'Cor' },
  { key: 'accentHue', label: 'Cor das organelas', group: 'Cor' },
  { key: 'translucency', label: 'Translucidez', group: 'Cor' },
  { key: 'glow', label: 'Bioluminescência', group: 'Cor' },
  { key: 'patternScale', label: 'Escala do padrão', group: 'Cor' },
  { key: 'size', label: 'Tamanho', group: 'Forma' },
  { key: 'elongation', label: 'Alongamento', group: 'Forma' },
  { key: 'wobble', label: 'Irregularidade', group: 'Forma' },
  { key: 'membrane', label: 'Espessura da membrana', group: 'Forma' },
  { key: 'nucleusSize', label: 'Tamanho do núcleo', group: 'Organelas' },
  { key: 'organelles', label: 'Organelas', group: 'Organelas' },
  { key: 'vacuoles', label: 'Vacúolos', group: 'Organelas' },
  { key: 'eyespot', label: 'Mancha ocular', group: 'Organelas' },
  { key: 'cilia', label: 'Cílios', group: 'Apêndices' },
  { key: 'ciliaLength', label: 'Comprimento dos cílios', group: 'Apêndices' },
  { key: 'flagella', label: 'Flagelos', group: 'Apêndices', max: 4, step: 1 },
  { key: 'flagellumLength', label: 'Comprimento dos flagelos', group: 'Apêndices' },
  { key: 'spikes', label: 'Espinhos', group: 'Apêndices' },
];

export function randomLook(seed: string): CellLook {
  const r = mulberry(seedToInt(seed + ':look'));
  const pick = <T,>(a: [T, string][]) => a[Math.floor(r() * a.length)][0];
  return {
    hue: r(), sat: 0.35 + r() * 0.6, light: 0.3 + r() * 0.45, hue2: r(), nucleusHue: r(), accentHue: r(),
    translucency: r() * 0.8, glow: r() < 0.35 ? r() : 0, pattern: r() < 0.35 ? 'none' : pick(PATTERNS), patternScale: r(),
    shape: pick(SHAPES), size: r(), elongation: r() * 0.7, wobble: r() * 0.6, membrane: r(),
    nucleusSize: r(), organelles: r(), vacuoles: r(), cilia: r() < 0.45 ? 0.3 + r() * 0.7 : 0, ciliaLength: r(),
    flagella: Math.floor(r() * 3.5), flagellumLength: r(), spikes: r() < 0.3 ? r() : 0, eyespot: r() < 0.6 ? r() : 0,
  };
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export function makeSpecies(seed: string, mode: ColorMode = 'earth', look?: CellLook): CellSpecies {
  const n = speciesName(seed);
  return { seed, genus: n.genus, species: n.species, mode, look: look ?? randomLook(seed) };
}
/** a fresh random binomial name (the editor's dice next to the name) */
export function randomName() { const n = speciesName(randomSeed()); return { genus: n.genus, species: n.species }; }

// ---------------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------------
export interface HSL { h: number; s: number; l: number }
export interface CellColours { mem: HSL; cyto: HSL; nuc: HSL; acc: HSL; glow: number; glowHue: number }

// Earth-like microbes: the hue sliders run over natural pigments (ambers, olives, greens, teal, grey-blue, lilac, rose)
const NATURAL = [0.06, 0.1, 0.15, 0.22, 0.3, 0.4, 0.52, 0.58, 0.75, 0.93, 0.98];
const natural = (t: number) => {
  const x = Math.max(0, Math.min(0.9999, t)) * (NATURAL.length - 1), i = Math.floor(x), f = x - i;
  return NATURAL[i] + (NATURAL[Math.min(NATURAL.length - 1, i + 1)] - NATURAL[i]) * f;
};

export function cellColours(look: CellLook, mode: ColorMode): CellColours {
  if (mode === 'earth') {
    const s = look.sat * 0.5;
    return {
      mem: { h: natural(look.hue), s, l: 0.32 + look.light * 0.36 },
      cyto: { h: natural(look.hue2), s: s * 0.8, l: 0.5 + look.light * 0.22 },
      nuc: { h: natural(look.nucleusHue), s: 0.35, l: 0.34 },
      acc: { h: natural(look.accentHue), s: 0.55, l: 0.5 },
      glow: look.glow * 0.25, glowHue: 0.45,
    };
  }
  return {
    mem: { h: look.hue, s: 0.3 + look.sat * 0.7, l: 0.28 + look.light * 0.42 },
    cyto: { h: look.hue2, s: 0.25 + look.sat * 0.6, l: 0.5 + look.light * 0.2 },
    nuc: { h: look.nucleusHue, s: 0.6, l: 0.38 },
    acc: { h: look.accentHue, s: 0.8, l: 0.55 },
    glow: look.glow, glowHue: look.accentHue,
  };
}

/** a colony's team colour (biofilm, minimap, far zoom): the membrane, made a little louder */
export function teamColour(sp: CellSpecies): [number, number, number] {
  const c = cellColours(sp.look, sp.mode).mem;
  return hslRgb(c.h, Math.min(1, c.s + 0.25), Math.max(0.42, Math.min(0.62, c.l + 0.08)));
}
export function hslRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

// ---------------------------------------------------------------------------------------------------
// Unit kinds (shared by the art, the simulation and the HUD)
// ---------------------------------------------------------------------------------------------------
export enum Kind { WORKER = 0, SCOUT = 1, HUNTER = 2, PHOTO = 3, ARMOR = 4, SPITTER = 5, MOTHER = 6, NODE = 7, SENTINEL = 8, TITAN = 9, BACTERIA = 10, DIATOM = 11, AMOEBA = 12 }
export const SPECIES_KINDS = 10;         // kinds drawn for every species (units + mother + node + sentinel + titan)
/** kinds that stand still once placed (they root where they were sent) */
export const isStructure = (k: number) => k === Kind.MOTHER || k === Kind.NODE || k === Kind.PHOTO || k === Kind.SENTINEL;
/** kinds the division bar places on the map instead of dividing free */
export const PLACED: Kind[] = [Kind.PHOTO, Kind.SENTINEL];

export interface KindInfo {
  name: string; short: string; blurb: string;
  food: number; energy: number; time: number;  // division cost (s)
  hp: number; armor: number; speed: number; r: number; sight: number;
  dmg: number; range: number; cd: number;       // damage per hit, reach, seconds between hits
  pop: number;                                  // population it takes
  upkeep: number;                               // energy per second it burns
}
export const KINDS: KindInfo[] = [
  { name: 'Coletora', short: 'COL', blurb: 'Colhe nutrientes e os leva ao biofilme. Não luta: foge do perigo para sobreviver. É ela que se transforma em nódulo de biofilme.', food: 20, energy: 5, time: 4, hp: 30, armor: 0, speed: 46, r: 7, sight: 150, dmg: 0, range: 0, cd: 1.2, pop: 1, upkeep: 0.1 },
  { name: 'Flagelada', short: 'FLA', blurb: 'Batedora veloz de visão longa. Aguenta mais tempo longe do biofilme.', food: 15, energy: 15, time: 4, hp: 22, armor: 0, speed: 92, r: 6, sight: 320, dmg: 2, range: 2, cd: 1, pop: 1, upkeep: 0.12 },
  { name: 'Fagócita', short: 'FAG', blurb: 'Predadora: engole células feridas e se cura comendo restos.', food: 40, energy: 20, time: 7, hp: 70, armor: 1, speed: 52, r: 9, sight: 200, dmg: 9, range: 3, cd: 0.9, pop: 2, upkeep: 0.25 },
  { name: 'Fotossintética', short: 'FOT', blurb: 'Estrutura de energia: nasce na colônia, nada até o ponto escolhido e se fixa. Gera energia no seu biofilme, o dobro sob um feixe de luz.', food: 30, energy: 0, time: 6, hp: 45, armor: 1, speed: 30, r: 7.5, sight: 140, dmg: 0, range: 0, cd: 1, pop: 1, upkeep: 0 },
  { name: 'Encouraçada', short: 'ENC', blurb: 'Tanque lento de placas duras: segura a linha de frente.', food: 60, energy: 30, time: 10, hp: 160, armor: 4, speed: 30, r: 11, sight: 170, dmg: 5, range: 3, cd: 1.3, pop: 3, upkeep: 0.35 },
  { name: 'Secretora', short: 'SEC', blurb: 'Dispara toxina à distância. Frágil de perto.', food: 45, energy: 35, time: 8, hp: 38, armor: 0, speed: 40, r: 8, sight: 230, dmg: 7, range: 150, cd: 1.6, pop: 2, upkeep: 0.3 },
  { name: 'Célula-mãe', short: 'MÃE', blurb: 'Funda uma nova colônia: leve-a a um espaço livre (longe de outras células-mãe) e ela se fixa, cria biofilme, divide-se e dá +8 de população.', food: 160, energy: 70, time: 18, hp: 700, armor: 3, speed: 9, r: 22, sight: 260, dmg: 6, range: 4, cd: 1, pop: 0, upkeep: 0.2 },
  { name: 'Nódulo de biofilme', short: 'NÓD', blurb: 'A coletora mais próxima da colônia nada até o ponto e se transforma: espalha biofilme (território), cura as células e dá +6 de população.', food: 50, energy: 20, time: 6, hp: 180, armor: 2, speed: 0, r: 12, sight: 180, dmg: 0, range: 0, cd: 1, pop: 0, upkeep: 0.05 },
  { name: 'Sentinela', short: 'SEN', blurb: 'Torre de guarda: nasce na colônia, nada até o ponto e se fixa. Dispara espinhos mais longe que a secretora - proteja as fotossintéticas, os nódulos e as colônias.', food: 50, energy: 40, time: 8, hp: 130, armor: 2, speed: 30, r: 9, sight: 320, dmg: 6, range: 270, cd: 1.4, pop: 1, upkeep: 0.3 },
  { name: 'Titã', short: 'TIT', blurb: 'Um organismo multicelular gigante que a colônia leva muito tempo para formar. Cada espécie tem o seu: rotífero, tardígrado, hidra, nematoide ou copépode, cada um com um poder.', food: 380, energy: 220, time: 60, hp: 1400, armor: 4, speed: 26, r: 28, sight: 380, dmg: 20, range: 8, cd: 1.2, pop: 8, upkeep: 1.6 },
  { name: 'Bactéria', short: 'BAC', blurb: 'Presa selvagem. Vira nutriente e DNA.', food: 0, energy: 0, time: 0, hp: 8, armor: 0, speed: 30, r: 4, sight: 90, dmg: 0, range: 0, cd: 1, pop: 0, upkeep: 0 },
  { name: 'Diatomácea', short: 'DIA', blurb: 'Alga de carapaça de vidro, quase parada. Rica em nutrientes e DNA.', food: 0, energy: 0, time: 0, hp: 60, armor: 3, speed: 3, r: 10, sight: 0, dmg: 0, range: 0, cd: 1, pop: 0, upkeep: 0 },
  { name: 'Ameba selvagem', short: 'AME', blurb: 'Predadora solitária que devora qualquer célula.', food: 0, energy: 0, time: 0, hp: 260, armor: 1, speed: 34, r: 20, sight: 220, dmg: 14, range: 4, cd: 1.1, pop: 0, upkeep: 0 },
];
/** the kinds the mother cell can divide into */
export const TRAINABLE = [Kind.WORKER, Kind.SCOUT, Kind.HUNTER, Kind.PHOTO, Kind.ARMOR, Kind.SPITTER, Kind.SENTINEL, Kind.TITAN, Kind.MOTHER];
/** what each kind is for, in one line (the division tooltips) */
export const ROLE: Partial<Record<Kind, string>> = {
  [Kind.WORKER]: 'Economia', [Kind.SCOUT]: 'Batedora', [Kind.HUNTER]: 'Combate corpo a corpo', [Kind.PHOTO]: 'Energia',
  [Kind.ARMOR]: 'Linha de frente', [Kind.SPITTER]: 'Combate à distância', [Kind.MOTHER]: 'Nova colônia', [Kind.NODE]: 'Território',
  [Kind.SENTINEL]: 'Torre de defesa', [Kind.TITAN]: 'Organismo gigante',
};

// ---------------------------------------------------------------------------------------------------
// Titans: every species grows one body plan (from its seed); wild ones roam the pool
// ---------------------------------------------------------------------------------------------------
export type TitanType = 0 | 1 | 2 | 3 | 4;
export const TITANS: { name: string; power: string; desc: string }[] = [
  { name: 'Rotífero', power: 'Vórtice', desc: 'A coroa de cílios gira e cria um vórtice: puxa nutrientes (que viram estoque) e células pequenas inimigas para a boca, onde são trituradas.' },
  { name: 'Tardígrado', power: 'Indestrutível', desc: 'Blindagem enorme; imune a fontes termais, toxinas, nuvens e à praga viral.' },
  { name: 'Hidra', power: 'Ferroada', desc: 'A cada 2,5 s os tentáculos ferroam todos os inimigos em volta e os deixam paralisados.' },
  { name: 'Nematoide', power: 'Atropelar', desc: 'Rápido: atravessa as fileiras inimigas ferindo e empurrando quem estiver no caminho.' },
  { name: 'Copépode', power: 'Salto', desc: 'Salta sobre o alvo de longe e o impacto fere e arremessa quem estiver perto.' },
];
export const titanType = (sp: CellSpecies): TitanType => (Math.abs(seedToInt(sp.seed + ':titan')) % 5) as TitanType;

// ---------------------------------------------------------------------------------------------------
// The evolution tree: researched with DNA + energy, one at a time
// ---------------------------------------------------------------------------------------------------
export type Branch = 'met' | 'mot' | 'mem' | 'pre' | 'com' | 'tit';
export const BRANCHES: [Branch, string][] = [['met', 'Metabolismo'], ['mot', 'Motilidade'], ['mem', 'Membrana'], ['pre', 'Predação'], ['com', 'Comunicação'], ['tit', 'Gigantismo']];
export interface Tech { id: string; branch: Branch; tier: number; name: string; desc: string; dna: number; energy: number; time: number; req: string[]; unlock?: Kind }
export const TECHS: Tech[] = [
  { id: 'met1', branch: 'met', tier: 1, name: 'Quimiotaxia', desc: 'Coletoras sentem comida 60% mais longe e carregam 25% mais.', dna: 4, energy: 40, time: 25, req: [] },
  { id: 'met2', branch: 'met', tier: 2, name: 'Vacúolos de reserva', desc: 'Estoque de nutrientes e energia 50% maior.', dna: 8, energy: 60, time: 35, req: ['met1'] },
  { id: 'met3', branch: 'met', tier: 3, name: 'Respiração eficiente', desc: 'Manutenção de energia 25% menor.', dna: 14, energy: 90, time: 45, req: ['met2'] },
  { id: 'met4', branch: 'met', tier: 4, name: 'Glicólise rápida', desc: 'Divisões 20% mais rápidas.', dna: 20, energy: 120, time: 55, req: ['met3'] },
  { id: 'mot1', branch: 'mot', tier: 1, name: 'Flagelo longo', desc: 'Todas as células nadam 10% mais rápido.', dna: 4, energy: 30, time: 25, req: [] },
  { id: 'mot2', branch: 'mot', tier: 2, name: 'Ocelo', desc: 'Visão 40% maior (a névoa recua).', dna: 8, energy: 50, time: 30, req: ['mot1'] },
  { id: 'mot3', branch: 'mot', tier: 3, name: 'Encistamento', desc: 'Habilidade Cisto: as células selecionadas param, ficam blindadas e sem manutenção até despertar.', dna: 12, energy: 70, time: 40, req: ['mot2'] },
  { id: 'mem1', branch: 'mem', tier: 1, name: 'Parede celular', desc: '+1 de armadura em todas as células.', dna: 5, energy: 40, time: 30, req: [] },
  { id: 'mem2', branch: 'mem', tier: 2, name: 'Placas de quitina', desc: 'Libera a Encouraçada.', dna: 8, energy: 60, time: 35, req: ['mem1'], unlock: Kind.ARMOR },
  { id: 'mem3', branch: 'mem', tier: 2, name: 'Espinhos de guarda', desc: 'Libera a Sentinela (torre de defesa).', dna: 8, energy: 60, time: 35, req: ['mem1'], unlock: Kind.SENTINEL },
  { id: 'mem4', branch: 'mem', tier: 3, name: 'Imunidade antiviral', desc: 'As células resistem 80% das vezes à praga viral.', dna: 14, energy: 90, time: 45, req: ['mem2'] },
  { id: 'pre1', branch: 'pre', tier: 1, name: 'Vesículas de toxina', desc: 'Libera a Secretora.', dna: 6, energy: 50, time: 30, req: [], unlock: Kind.SPITTER },
  { id: 'pre2', branch: 'pre', tier: 2, name: 'Enzimas digestivas', desc: 'Fagócitas causam 25% mais dano, engolem mais cedo e ganham mais DNA.', dna: 8, energy: 60, time: 35, req: ['pre1'] },
  { id: 'pre3', branch: 'pre', tier: 3, name: 'Nuvem de toxina', desc: 'Habilidade das secretoras: uma nuvem que envenena uma área (recarga 20 s).', dna: 12, energy: 80, time: 40, req: ['pre2'] },
  { id: 'com1', branch: 'com', tier: 1, name: 'Quimiossinais', desc: 'Presentes rendem 50% mais relação.', dna: 4, energy: 30, time: 25, req: [] },
  { id: 'com2', branch: 'com', tier: 2, name: 'Adesão celular', desc: 'Células se curam 50% mais rápido e sofrem metade do dano quando falta energia.', dna: 10, energy: 70, time: 40, req: ['com1'] },
  { id: 'com3', branch: 'com', tier: 3, name: 'Diferenciação', desc: 'Divisões 15% mais baratas.', dna: 16, energy: 100, time: 50, req: ['com2'] },
  { id: 'com4', branch: 'com', tier: 4, name: 'Multicelularidade', desc: 'O passo final: exigido para evoluir para multicelular.', dna: 25, energy: 150, time: 70, req: ['com3'] },
  { id: 'tit1', branch: 'tit', tier: 1, name: 'Organismo colonial', desc: 'Libera o Titã da sua espécie (1 de cada vez).', dna: 12, energy: 90, time: 45, req: ['met1', 'mem1'], unlock: Kind.TITAN },
  { id: 'tit2', branch: 'tit', tier: 2, name: 'Tecidos especializados', desc: 'Titãs com +30% de vida e de dano; até 2 titãs.', dna: 18, energy: 120, time: 55, req: ['tit1', 'com2'] },
  { id: 'tit3', branch: 'tit', tier: 3, name: 'Superorganismo', desc: 'Titãs se regeneram em qualquer lugar; até 3 titãs.', dna: 26, energy: 160, time: 70, req: ['tit2'] },
];
/** kinds that need research first */
export const LOCKED: Partial<Record<Kind, string>> = { [Kind.ARMOR]: 'mem2', [Kind.SENTINEL]: 'mem3', [Kind.SPITTER]: 'pre1', [Kind.TITAN]: 'tit1' };
/** how many titans a species can keep alive */
export const titanLimit = (techs: { has(t: string): boolean }) => (techs.has('tit3') ? 3 : techs.has('tit2') ? 2 : techs.has('tit1') ? 1 : 0);
/** every stolen gene makes research 8% cheaper in DNA (up to 40%) */
export const geneDiscount = (genes: number) => Math.max(0.6, 1 - genes * 0.08);

// ---------------------------------------------------------------------------------------------------
// The player's species is kept in the browser (it carries into the later eras)
// ---------------------------------------------------------------------------------------------------
const STORE = 'player-cell-species';
export function saveSpecies(sp: CellSpecies) { try { localStorage.setItem(STORE, JSON.stringify(sp)); } catch { /* private mode */ } }
export function loadSpecies(): CellSpecies | null {
  try {
    const s = localStorage.getItem(STORE);
    if (!s) return null;
    const sp = JSON.parse(s) as CellSpecies;
    if (!sp.seed || !sp.look) return null;
    return { ...makeSpecies(sp.seed, sp.mode), ...sp, look: { ...randomLook(sp.seed), ...sp.look } };
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------
// Genes: every rival species carries one; the player steals them (DNA from engulfed / killed cells)
// ---------------------------------------------------------------------------------------------------
export type GeneId = 'armor' | 'speed' | 'toxin' | 'jaws' | 'photo' | 'reserve' | 'heat' | 'fast' | 'film' | 'regen';
export interface Gene { id: GeneId; name: string; desc: string }
export const GENES: Gene[] = [
  { id: 'armor', name: 'Membrana reforçada', desc: '+1 de armadura em todas as células' },
  { id: 'speed', name: 'Flagelo veloz', desc: 'Todas as células nadam 15% mais rápido' },
  { id: 'toxin', name: 'Toxina potente', desc: 'Secretoras causam 35% mais dano' },
  { id: 'jaws', name: 'Citóstomo voraz', desc: 'Fagócitas causam 30% mais dano e engolem mais cedo' },
  { id: 'photo', name: 'Cloroplastos eficientes', desc: 'Fotossintéticas geram 40% mais energia' },
  { id: 'reserve', name: 'Metabolismo lento', desc: 'A reserva fora do biofilme dura 60% mais' },
  { id: 'heat', name: 'Proteínas termorresistentes', desc: 'Imune ao calor das fontes termais' },
  { id: 'fast', name: 'Mitose acelerada', desc: 'Divisões 25% mais rápidas' },
  { id: 'film', name: 'Biofilme denso', desc: 'O biofilme se espalha 20% mais longe' },
  { id: 'regen', name: 'Reparo celular', desc: 'Cura duas vezes mais rápido no biofilme' },
];
/** DNA needed to steal a species' gene (an engulfed cell gives 1, a killed one about a third) */
export const DNA_FOR_GENE = 3;
export const geneOf = (sp: CellSpecies): Gene => GENES[seedToInt(sp.seed + ':gene') % GENES.length];
