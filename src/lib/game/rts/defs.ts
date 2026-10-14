// The creature eras' rules (aquatic and land), shared by the simulation worker and the view: castes (each its own
// anatomy - the species' genome with other body sliders, so colours, pattern and eyes stay the lineage's), the
// buildings, the evolution tree and the wild life.
import { Stage, type CreatureParams } from '../../creature/genome';

export type RtsMode = 'aqua' | 'land';

export interface Caste {
  id: number; key: string; name: string; blurb: string;
  stage: Stage;
  /** body sliders over the lineage's genome (anatomy of the caste) */
  params: Partial<CreatureParams>;
  /** sprite scale */
  k: number;
  hp: number; dmg: number; range: number; speed: number; sight: number; armor: number;
  cost: number; pop: number; upkeep: number; time: number;
  gather?: boolean; ranged?: boolean; builder?: boolean;
  req?: string;
}
export interface BuildingDef {
  id: number; key: string; name: string; blurb: string;
  hp: number; cost: number; pop: number; radius: number; sight: number;
  /** attacking buildings (amphibian sentinels) */
  dmg?: number; range?: number;
  /** drawn as a creature of the lineage */
  stage: Stage; params: Partial<CreatureParams>; k: number;
  /** where it may stand */
  site: 'shelf' | 'shore' | 'land';
  /** keep-out from buildings of the same kind (world px) */
  gap: number;
  req?: string;
  /** trains castes */
  trains?: boolean;
}
export interface Tech {
  id: string; name: string; desc: string; dna: number; food: number; time: number; req: string[];
  /** life stage the planet must have reached */
  life?: number;
}
export interface RtsDefs {
  mode: RtsMode; castes: Caste[]; buildings: BuildingDef[]; techs: Tech[];
  /** the tech that ends the era (with its other conditions in `victory`) */
  final: string;
  victory: string;
}

// ---------------------------------------------------------------------------------------------------
// Aquatic era
// ---------------------------------------------------------------------------------------------------
const AQ_CASTES: Caste[] = [
  { id: 0, key: 'forager', name: 'Forrageador', blurb: 'Larva que filtra o plâncton e leva a comida ao ninhal; funda novos ninhais. Não luta.', stage: Stage.AQUA_LARVA,
    params: { diet: 0.12, size: 0.22 }, k: 0.3, hp: 30, dmg: 1, range: 14, speed: 78, sight: 420, armor: 0, cost: 25, pop: 1, upkeep: 0.02, time: 6, gather: true, builder: true },
  { id: 1, key: 'hunter', name: 'Caçador', blurb: 'Predador de mandíbulas: caça presas (comida e DNA) e enfrenta os rivais.', stage: Stage.AQUA,
    params: { diet: 0.95, size: 0.55 }, k: 0.34, hp: 70, dmg: 9, range: 20, speed: 95, sight: 520, armor: 0.05, cost: 50, pop: 1, upkeep: 0.05, time: 9 },
  { id: 2, key: 'scout', name: 'Batedor', blurb: 'Corpo esguio e olhos grandes: rápido, enxerga longe e revela o oceano.', stage: Stage.AQUA,
    params: { diet: 0.55, size: 0.12, exotic: 0.6 }, k: 0.3, hp: 35, dmg: 3, range: 14, speed: 165, sight: 950, armor: 0, cost: 30, pop: 1, upkeep: 0.03, time: 6 },
  { id: 3, key: 'armored', name: 'Couraçado', blurb: 'Placas e espinhos: lento, aguenta a linha e protege os ninhais.', stage: Stage.AQUA,
    params: { diet: 0.4, size: 0.92, gravity: 0.85 }, k: 0.36, hp: 190, dmg: 6, range: 20, speed: 58, sight: 460, armor: 0.4, cost: 80, pop: 1, upkeep: 0.07, time: 14, req: 'escamas' },
  { id: 4, key: 'spitter', name: 'Cuspidor', blurb: 'Glândulas de veneno: cospe à distância.', stage: Stage.AQUA,
    params: { diet: 0.75, size: 0.45, exotic: 0.9 }, k: 0.33, hp: 55, dmg: 8, range: 170, speed: 84, sight: 560, armor: 0, cost: 70, pop: 1, upkeep: 0.06, time: 12, ranged: true, req: 'veneno' },
  { id: 5, key: 'giant', name: 'Forma gigante', blurb: '≈2,5× a força e a vida de um caçador pelo dobro do sustento: menos criaturas, mais temíveis.', stage: Stage.AQUA_GIANT,
    params: { diet: 0.85, size: 0.7 }, k: 0.3, hp: 175, dmg: 22, range: 30, speed: 82, sight: 600, armor: 0.12, cost: 140, pop: 2, upkeep: 0.1, time: 20, req: 'gigantismo' },
];
const AQ_BUILDINGS: BuildingDef[] = [
  { id: 0, key: 'nest', name: 'Ninhal', blurb: 'Berçário de ovos na água rasa da plataforma: gera as castas, guarda a comida, +10 de população. Dentro do território as criaturas comem e se curam.',
    hp: 420, cost: 120, pop: 10, radius: 1100, sight: 900, stage: Stage.AQUA_LARVA, params: { diet: 0.1, size: 0.05 }, k: 0.3, site: 'shelf', gap: 2600, trains: true },
  { id: 1, key: 'tower', name: 'Sentinela anfíbia', blurb: 'Um anfíbio da espécie de guarda na margem (precisa de vegetação em volta): ataca tudo o que se aproxima dos ninhais.',
    hp: 180, cost: 90, pop: 0, radius: 0, sight: 800, dmg: 11, range: 260, stage: Stage.AMPHIBIAN, params: { diet: 0.9, size: 0.5 }, k: 0.32, site: 'shore', gap: 500, req: 'pulmoes1' },
];
const AQ_TECHS: Tech[] = [
  { id: 'mandibulas', name: 'Mandíbulas', desc: 'Caçadores e gigantes +30% de dano.', dna: 6, food: 60, time: 25, req: [] },
  { id: 'escamas', name: 'Escamas', desc: 'Libera o Couraçado; todas as castas +10% de vida.', dna: 8, food: 80, time: 30, req: [] },
  { id: 'nadadeiras', name: 'Nadadeiras', desc: 'Todas as castas +15% de velocidade.', dna: 6, food: 60, time: 25, req: [] },
  { id: 'veneno', name: 'Glândulas de veneno', desc: 'Libera o Cuspidor (ataque à distância).', dna: 10, food: 90, time: 30, req: ['mandibulas'] },
  { id: 'olhos', name: 'Olhos de profundidade', desc: '+40% de visão; o abismo não cansa as castas.', dna: 8, food: 70, time: 25, req: ['nadadeiras'] },
  { id: 'simbiose', name: 'Algas simbióticas', desc: 'Forrageadores +30% de coleta; os ninhais soltam mais oxigênio.', dna: 8, food: 80, time: 30, req: [] },
  { id: 'gigantismo', name: 'Gigantismo', desc: 'Libera a forma gigante (≈2,5× atributos, 2× sustento).', dna: 18, food: 180, time: 45, req: ['mandibulas', 'escamas'] },
  { id: 'pulmoes1', name: 'Pulmões primitivos', desc: 'Libera as sentinelas anfíbias nas margens com vegetação.', dna: 12, food: 120, time: 35, req: ['simbiose'], life: 0.3 },
  { id: 'pulmoes', name: 'Pulmões', desc: 'Respirar fora d\'água por longos períodos.', dna: 20, food: 200, time: 50, req: ['pulmoes1'], life: 0.5 },
  { id: 'patas', name: 'Nadadeiras-pata', desc: 'Nadadeiras lobadas que sustentam o corpo em terra: a espécie pode conquistar a terra.', dna: 26, food: 260, time: 60, req: ['pulmoes', 'nadadeiras'], life: 0.6 },
];

// ---------------------------------------------------------------------------------------------------
// Land era
// ---------------------------------------------------------------------------------------------------
const LD_CASTES: Caste[] = [
  { id: 0, key: 'gatherer', name: 'Coletor', blurb: 'Pasta, colhe frutos e carrega comida para a toca; funda novas tocas. Não luta.', stage: Stage.LAND,
    params: { diet: 0.15, size: 0.3 }, k: 0.3, hp: 40, dmg: 1, range: 14, speed: 70, sight: 420, armor: 0, cost: 25, pop: 1, upkeep: 0.02, time: 6, gather: true, builder: true },
  { id: 1, key: 'hunter', name: 'Caçador', blurb: 'Garras e presas: caça manadas (comida e DNA) e enfrenta os rivais.', stage: Stage.LAND,
    params: { diet: 0.95, size: 0.55 }, k: 0.33, hp: 80, dmg: 10, range: 20, speed: 92, sight: 520, armor: 0.05, cost: 50, pop: 1, upkeep: 0.05, time: 9 },
  { id: 2, key: 'scout', name: 'Batedor', blurb: 'Pernas longas e faro: corre e enxerga longe.', stage: Stage.LAND,
    params: { diet: 0.55, size: 0.15 }, k: 0.28, hp: 40, dmg: 3, range: 14, speed: 160, sight: 950, armor: 0, cost: 30, pop: 1, upkeep: 0.03, time: 6 },
  { id: 3, key: 'bruiser', name: 'Brutamontes', blurb: 'Couro grosso e chifres: segura a linha e quebra cargas.', stage: Stage.LAND,
    params: { diet: 0.45, size: 0.95, gravity: 0.8 }, k: 0.36, hp: 210, dmg: 8, range: 22, speed: 60, sight: 460, armor: 0.4, cost: 80, pop: 1, upkeep: 0.07, time: 14, req: 'couro' },
  { id: 4, key: 'thrower', name: 'Arremessador', blurb: 'De pé nas duas patas: arremessa pedras à distância.', stage: Stage.LAND,
    params: { diet: 0.6, size: 0.45, gravity: 0.15 }, k: 0.32, hp: 60, dmg: 8, range: 175, speed: 82, sight: 600, armor: 0, cost: 70, pop: 1, upkeep: 0.06, time: 12, ranged: true, req: 'bipedalismo' },
  { id: 5, key: 'giant', name: 'Forma gigante', blurb: '≈2,5× a força e a vida de um caçador pelo dobro do sustento.', stage: Stage.LAND_GIANT,
    params: { diet: 0.85, size: 0.7 }, k: 0.3, hp: 200, dmg: 25, range: 30, speed: 80, sight: 620, armor: 0.12, cost: 140, pop: 2, upkeep: 0.1, time: 20, req: 'gigantismo' },
];
const LD_BUILDINGS: BuildingDef[] = [
  { id: 0, key: 'den', name: 'Toca', blurb: 'Abrigo do bando: gera as castas, guarda a comida, +10 de população. No território o bando come e se cura.',
    hp: 460, cost: 120, pop: 10, radius: 1100, sight: 900, stage: Stage.LAND, params: { diet: 0.1, size: 0.05 }, k: 0.3, site: 'land', gap: 2600, trains: true },
  { id: 1, key: 'tower', name: 'Vigia', blurb: 'Um adulto de guarda num ponto alto: ataca o que se aproxima das tocas.',
    hp: 200, cost: 90, pop: 0, radius: 0, sight: 900, dmg: 12, range: 250, stage: Stage.LAND, params: { diet: 0.9, size: 0.6 }, k: 0.34, site: 'land', gap: 500, req: 'faro' },
];
const LD_TECHS: Tech[] = [
  { id: 'garras', name: 'Garras', desc: 'Caçadores e gigantes +30% de dano.', dna: 6, food: 60, time: 25, req: [] },
  { id: 'couro', name: 'Couro grosso', desc: 'Libera o Brutamontes; todas as castas +10% de vida.', dna: 8, food: 80, time: 30, req: [] },
  { id: 'patas', name: 'Patas velozes', desc: 'Todas as castas +15% de velocidade.', dna: 6, food: 60, time: 25, req: [] },
  { id: 'faro', name: 'Faro', desc: '+40% de visão; libera as vigias.', dna: 8, food: 70, time: 25, req: [] },
  { id: 'gigantismo', name: 'Gigantismo', desc: 'Libera a forma gigante (≈2,5× atributos, 2× sustento).', dna: 18, food: 180, time: 45, req: ['garras', 'couro'] },
  { id: 'bipedalismo', name: 'Bipedalismo', desc: 'De pé nas duas patas: libera o Arremessador.', dna: 12, food: 120, time: 35, req: ['patas'] },
  { id: 'ferramentas', name: 'Ferramentas de pedra', desc: 'Coletores +30% de coleta; +15% de dano.', dna: 14, food: 140, time: 40, req: ['bipedalismo'] },
  { id: 'fogo', name: 'Fogo', desc: 'O inverno não castiga; curas mais rápidas nas tocas.', dna: 16, food: 160, time: 45, req: ['ferramentas'] },
  { id: 'linguagem', name: 'Linguagem', desc: 'Palavras, nomes e histórias: a centelha da razão. A espécie pode fundar a primeira tribo.', dna: 26, food: 260, time: 60, req: ['fogo', 'bipedalismo'] },
];

export const AQUA_DEFS: RtsDefs = { mode: 'aqua', castes: AQ_CASTES, buildings: AQ_BUILDINGS, techs: AQ_TECHS, final: 'patas',
  victory: 'Pesquise Nadadeiras-pata, com o planeta verde até a costa (estágio de vida ≥ 60%) e 2 sentinelas anfíbias nas margens.' };
export const LAND_DEFS: RtsDefs = { mode: 'land', castes: LD_CASTES, buildings: LD_BUILDINGS, techs: LD_TECHS, final: 'linguagem',
  victory: 'Pesquise Linguagem com 3 tocas de pé.' };
export const defsFor = (m: RtsMode) => (m === 'aqua' ? AQUA_DEFS : LAND_DEFS);

/** wild life roles */
export const enum Wild { PREY = 0, PREDATOR = 1, LEVIATHAN = 2 }
export interface WildSpecies { idx: number; role: Wild; stage: Stage; seed: string; params: CreatureParams; k: number; hp: number; dmg: number; speed: number; zone: 'coast' | 'open' | 'abyss' | 'land'; name: string }

export const NO_NATION = 255;
/** order codes */
export const enum Ord { IDLE = 0, MOVE = 1, ATTACK = 2, GATHER = 3, RETURN = 4, AMOVE = 5, BUILD = 6, HOLD = 7 }

/** per-entity snapshot stride (Float32): id, x, y, hp/maxhp, kind, nation, dir, anim, flags */
export const SNAP = 9;
/** snapshot flags */
export const F_VISIBLE = 1, F_CARRY = 2, F_WILD = 4, F_ATTACK = 8, F_BUILDING = 16, F_SELECTED = 32;

export interface NationInfo { id: number; name: string; seed: string; params: CreatureParams; color: [number, number, number]; ai: boolean; alive: boolean }
export interface NationStats { food: number; dna: number; pop: number; cap: number; upkeep: number; income: number; techs: string[]; research: { id: string; p: number } | null; units: number[]; buildings: number }
