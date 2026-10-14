// The eras of the play mode: one lineage from the cell to the stars, on the same home planet.
//  - cell: the microscopic pool (its own RTS, `cell/`);
//  - aqua, land: creature RTS on the planet (`game/rts/`): castes, nests / dens, rival species, wild giants;
//  - tribal .. space: grand strategy on the planet (`game/campaign/`, turn based) with real-time battles on the
//    terrain (`game/battle/`), whose rules change with the era: loose war bands (tribal), Total War formations
//    (medieval), line infantry (classical: sails and muskets), trench warfare (industrial), Steel Division / WARNO
//    (modern, contemporary, futurist), and the space age, whose end is the colony ship.
import { Stage } from '../creature/genome';

export type EraId = 'cell' | 'aqua' | 'land' | 'tribal' | 'medieval' | 'classic' | 'industrial' | 'modern' | 'contemporary' | 'futurist' | 'space';
export type EraKind = 'cell' | 'creature' | 'campaign';
/** how battles are fought in a civilisation era */
export type BattleStyle = 'warband' | 'formation' | 'line' | 'trench' | 'combined';

export interface Era {
  id: EraId; name: string; kind: EraKind; group: 'Vida' | 'Civilização';
  /** creature stage the species is drawn at */
  stage: Stage;
  /** civilisation era index 0..7 (structures, clothes, equipment, vehicles) */
  civ?: number;
  battle?: BattleStyle;
  blurb: string;
}

export const ERA_LIST: Era[] = [
  { id: 'cell', name: 'Celular', kind: 'cell', group: 'Vida', stage: Stage.CELL, blurb: 'RTS de colônias numa poça primordial: divida, espalhe o biofilme e domine centenas de colônias.' },
  { id: 'aqua', name: 'Aquática', kind: 'creature', group: 'Vida', stage: Stage.AQUA, blurb: 'RTS nos oceanos do mundo natal: castas, ninhais, profundezas, leviatãs — e o oxigênio que faz a terra verdejar.' },
  { id: 'land', name: 'Terrestre', kind: 'creature', group: 'Vida', stage: Stage.LAND, blurb: 'Bandos, tocas, estações e rivais; dos quatro pés às duas patas e à primeira centelha de razão.' },
  { id: 'tribal', name: 'Tribal', kind: 'campaign', group: 'Civilização', stage: Stage.TRIBAL, civ: 0, battle: 'warband', blurb: 'Aldeias, tribos rivais e bandos de guerra: a grande estratégia começa.' },
  { id: 'medieval', name: 'Medieval', kind: 'campaign', group: 'Civilização', stage: Stage.MEDIEVAL, civ: 1, battle: 'formation', blurb: 'Reinos e cercos; batalhas em formações: parede de escudos, cunha, piqueiros e cavalaria.' },
  { id: 'classic', name: 'Clássica', kind: 'campaign', group: 'Civilização', stage: Stage.RENAISSANCE, civ: 2, battle: 'line', blurb: 'Grandes navegações e mosquetes: infantaria de linha, quadrados contra a cavalaria, canhões.' },
  { id: 'industrial', name: 'Industrial', kind: 'campaign', group: 'Civilização', stage: Stage.INDUSTRIAL, civ: 3, battle: 'trench', blurb: 'Ferrovias e fábricas; a guerra de trincheiras: metralhadoras, arame farpado e barragens de artilharia.' },
  { id: 'modern', name: 'Moderna', kind: 'campaign', group: 'Civilização', stage: Stage.MODERN, civ: 4, battle: 'combined', blurb: 'Guerra mecanizada: desdobramento, setores, reconhecimento, blindados e artilharia.' },
  { id: 'contemporary', name: 'Contemporânea', kind: 'campaign', group: 'Civilização', stage: Stage.CONTEMPORARY, civ: 5, battle: 'combined', blurb: 'Armas combinadas: helicópteros, mísseis guiados, defesa antiaérea e logística.' },
  { id: 'futurist', name: 'Futurista', kind: 'campaign', group: 'Civilização', stage: Stage.FUTURIST, civ: 6, battle: 'combined', blurb: 'Andadores, drones, trilhos e lasers no campo de batalha.' },
  { id: 'space', name: 'Espacial', kind: 'campaign', group: 'Civilização', stage: Stage.SPACE, civ: 7, battle: 'combined', blurb: 'Plasma e campos de força — e a corrida pela nave colonial que leva a espécie às estrelas.' },
];
export const eraById = (id: EraId) => ERA_LIST.find(e => e.id === id)!;
export const eraIndex = (id: EraId) => ERA_LIST.findIndex(e => e.id === id);
export const nextEra = (id: EraId): EraId | null => ERA_LIST[eraIndex(id) + 1]?.id ?? null;
/** the civilisation era of a campaign era index (0 tribal .. 7 space) */
export const civEra = (civ: number): EraId => ERA_LIST.find(e => e.civ === civ)!.id;
