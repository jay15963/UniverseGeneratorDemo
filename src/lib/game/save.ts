// The play mode's save: one lineage (the cell species saved by the editor carries the name, colours, universe and
// home planet), the era it is in, the planet's life stage and the state of the era being played. Kept in
// localStorage; every era writes its own part (creature RTS / campaign) and the next era starts from it.
import { makeGenome, DEFAULT_PARAMS, type Genome, type CreatureParams } from '../creature/genome';
import { loadSpecies, makeSpecies, type CellSpecies } from '../cell/look';
import { ERA_LIST, eraIndex, type EraId } from './eras';
import { AQUATIC_START_STAGE } from '../play/homeworld';

export interface GameSave {
  v: 1;
  era: EraId;
  /** eras reached (the era screen opens them) */
  reached: EraId[];
  /** life stage of the home planet (oxygen of the aquatic era pushes it) */
  lifeStage: number;
  /** where the lineage lives now (world px): the next era starts there */
  home?: { x: number; y: number };
  /** carried from era to era */
  dna: number;
  techs: string[];
  /** the era being played (its own serialisable state) */
  creature?: unknown;
  campaign?: unknown;
  started: number; updated: number;
  /** the end: the colony ship left */
  won?: boolean;
}

const KEY = 'ugd:game';
export function loadGame(): GameSave | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const g = JSON.parse(s) as GameSave;
    return g && g.v === 1 ? g : null;
  } catch { return null; }
}
export function saveGame(g: GameSave) {
  g.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { console.warn('save failed', e); }
}
export function clearGame() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** a fresh lineage starting at an era (from the era screen; later eras start from a generated state) */
export function newGame(era: EraId): GameSave {
  const i = eraIndex(era);
  const life = i <= eraIndex('aqua') ? AQUATIC_START_STAGE : i === eraIndex('land') ? 0.62 : Math.min(1, 0.9 + (i - eraIndex('tribal')) * 0.02);
  return { v: 1, era, reached: ERA_LIST.slice(0, i + 1).map(e => e.id), lifeStage: life, dna: 0, techs: [], started: Date.now(), updated: Date.now() };
}
/** the era is won: the save moves on to the next one */
export function advance(g: GameSave, next: EraId, home?: { x: number; y: number }) {
  g.era = next;
  if (!g.reached.includes(next)) g.reached.push(next);
  if (home) g.home = home;
  g.creature = undefined;
  if (eraIndex(next) <= eraIndex('land')) g.campaign = undefined;
  saveGame(g);
}

export const currentSpecies = (): CellSpecies => loadSpecies() ?? makeSpecies('LINHAGEM');
/** the lineage's creature genome: the cell species' seed and colour mode, with the body the colony evolved */
export function lineageGenome(sp: CellSpecies, over: Partial<CreatureParams> = {}): Genome {
  const p: CreatureParams = { ...DEFAULT_PARAMS, diet: sp.evolved?.diet ?? 0.5, size: sp.evolved?.size ?? 0.5, ...over };
  return makeGenome(sp.seed, p, sp.mode);
}
