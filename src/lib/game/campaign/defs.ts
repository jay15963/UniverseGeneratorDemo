// Campaign rules: research per civilisation era (the last tech of an era opens the next one), settlement
// buildings (names follow the era), settlement levels, faction names and colours.

export interface TechEffect { food?: number; gold?: number; research?: number; move?: number; growth?: number; walls?: number; sea?: boolean; morale?: number }
export interface Tech {
  id: string; name: string; era: number; blurb: string;
  /** opens the next era (needs `need` other techs of the same era first) */
  advance?: boolean;
  fx?: TechEffect;
}

export const TECHS: Tech[] = [
  // tribal
  { id: 'arco', name: 'Arco e flecha', era: 0, blurb: 'Arqueiros tribais.' },
  { id: 'agricultura', name: 'Agricultura', era: 0, blurb: '+30% crescimento.', fx: { growth: 0.3 } },
  { id: 'domesticacao', name: 'Domesticação', era: 0, blurb: 'Montarias de guerra; +10% comida.', fx: { food: 0.1 } },
  { id: 'bronze', name: 'Metalurgia do bronze', era: 0, blurb: 'Campeões do clã; +10% moral.', fx: { morale: 0.1 } },
  { id: 'canoas', name: 'Canoas', era: 0, blurb: 'Travessias por mar mais rápidas.', fx: { sea: true } },
  { id: 'escambo', name: 'Escambo', era: 0, blurb: '+20% ouro.', fx: { gold: 0.2 } },
  { id: 'escrita', name: 'Escrita', era: 0, advance: true, blurb: 'Leis, reis e castelos: a era medieval.' },
  // medieval
  { id: 'piques', name: 'Formação de piques', era: 1, blurb: 'Piqueiros.' },
  { id: 'malha', name: 'Cota de malha', era: 1, blurb: 'Homens de armas.' },
  { id: 'besta', name: 'Besta', era: 1, blurb: 'Besteiros.' },
  { id: 'estribo', name: 'Estribo', era: 1, blurb: 'Cavalaria pesada.' },
  { id: 'cerco', name: 'Engenharia de cerco', era: 1, blurb: 'Trabucos; muralhas mais fortes.', fx: { walls: 1 } },
  { id: 'guildas', name: 'Guildas', era: 1, blurb: '+25% ouro.', fx: { gold: 0.25 } },
  { id: 'navegacao', name: 'Grandes navegações', era: 1, advance: true, blurb: 'Caravelas, pólvora e mosquetes: a era clássica.', fx: { sea: true } },
  // classic
  { id: 'polvora', name: 'Pólvora', era: 2, blurb: 'Artilharia de campanha.' },
  { id: 'granadas', name: 'Granadas', era: 2, blurb: 'Granadeiros e dragões.' },
  { id: 'raiado', name: 'Cano raiado', era: 2, blurb: 'Atiradores.' },
  { id: 'couraca', name: 'Couraças', era: 2, blurb: 'Couraceiros.' },
  { id: 'balistica', name: 'Balística', era: 2, blurb: 'Morteiros.' },
  { id: 'imprensa', name: 'Imprensa', era: 2, blurb: '+25% pesquisa.', fx: { research: 0.25 } },
  { id: 'vapor', name: 'Máquina a vapor', era: 2, advance: true, blurb: 'Ferrovias e fábricas: a era industrial.', fx: { move: 0.15 } },
  // industrial
  { id: 'ferrovias', name: 'Ferrovias', era: 3, blurb: '+30% movimento dos exércitos.', fx: { move: 0.3 } },
  { id: 'barragem', name: 'Barragem de artilharia', era: 3, blurb: 'Obuseiros.' },
  { id: 'motor', name: 'Motor a combustão', era: 3, blurb: 'Tanques e canhões anticarro.' },
  { id: 'infiltracao', name: 'Táticas de infiltração', era: 3, blurb: 'Tropas de assalto.' },
  { id: 'saneamento', name: 'Saneamento', era: 3, blurb: '+30% crescimento.', fx: { growth: 0.3 } },
  { id: 'telegrafo', name: 'Telégrafo', era: 3, blurb: '+25% pesquisa.', fx: { research: 0.25 } },
  { id: 'radio', name: 'Rádio e guerra móvel', era: 3, advance: true, blurb: 'Blindados, aviação e rádio: a era moderna.' },
  // modern
  { id: 'blindados', name: 'Divisões blindadas', era: 4, blurb: 'Tanques.' },
  { id: 'mecanizacao', name: 'Mecanização', era: 4, blurb: 'Infantaria mecanizada; +20% movimento.', fx: { move: 0.2 } },
  { id: 'aviacao', name: 'Aviação de ataque', era: 4, blurb: 'Ataques aéreos.' },
  { id: 'artilhariamovel', name: 'Artilharia autopropulsada', era: 4, blurb: 'Artilharia móvel.' },
  { id: 'radar', name: 'Radar', era: 4, blurb: 'Antiaérea.' },
  { id: 'blindadospesados', name: 'Blindagem pesada', era: 4, blurb: 'Tanques pesados.' },
  { id: 'computacao', name: 'Computação', era: 4, advance: true, blurb: 'Mísseis guiados e redes: a era contemporânea.', fx: { research: 0.2 } },
  // contemporary
  { id: 'helicopteros', name: 'Helicópteros de ataque', era: 5, blurb: 'Helicópteros.' },
  { id: 'forcasespeciais', name: 'Forças especiais', era: 5, blurb: 'Forças especiais.' },
  { id: 'satelites', name: 'Satélites', era: 5, blurb: '+40% pesquisa.', fx: { research: 0.4 } },
  { id: 'globalizacao', name: 'Globalização', era: 5, blurb: '+30% ouro.', fx: { gold: 0.3 } },
  { id: 'biotec', name: 'Biotecnologia', era: 5, blurb: '+30% crescimento.', fx: { growth: 0.3 } },
  { id: 'fusao', name: 'Fusão e robótica', era: 5, advance: true, blurb: 'Andadores, drones e lasers: a era futurista.' },
  // futurist
  { id: 'exoesqueletos', name: 'Exoesqueletos', era: 6, blurb: '+15% moral.', fx: { morale: 0.15 } },
  { id: 'trilhos', name: 'Canhões de trilho', era: 6, blurb: '+25% pesquisa.', fx: { research: 0.25 } },
  { id: 'ia', name: 'Inteligência artificial', era: 6, blurb: '+30% ouro.', fx: { gold: 0.3 } },
  { id: 'arcologias', name: 'Arcologias', era: 6, blurb: '+30% crescimento.', fx: { growth: 0.3 } },
  { id: 'espaco', name: 'Voo espacial tripulado', era: 6, advance: true, blurb: 'Plasma, campos de força e órbita: a era espacial.' },
  // space
  { id: 'plasma', name: 'Armas de plasma', era: 7, blurb: '+20% moral.', fx: { morale: 0.2 } },
  { id: 'orbitais', name: 'Estaleiros orbitais', era: 7, blurb: '+30% ouro.', fx: { gold: 0.3 } },
  { id: 'criogenia', name: 'Criogenia', era: 7, blurb: '+30% pesquisa.', fx: { research: 0.3 } },
  { id: 'navecolonial', name: 'Nave colonial', era: 7, advance: true, blurb: 'Abre a construção da nave colonial na capital: levar a espécie às estrelas.' },
];
export const techById = (id: string) => TECHS.find(t => t.id === id);
/** techs of an era needed (besides the advance) before the era can be left */
export const ADVANCE_NEED = 4;
export const techCost = (t: Tech) => Math.round(70 * Math.pow(1.75, t.era) * (t.advance ? 1.6 : 1));
export function techAvailable(t: Tech, era: number, known: Set<string>) {
  if (known.has(t.id) || t.era > era) return false;
  if (t.advance) return t.era === era && TECHS.filter(q => q.era === era && !q.advance && known.has(q.id)).length >= ADVANCE_NEED;
  return true;
}

// ---------------------------------------------------------------------------------------------------
export interface BuildingFx { growth?: number; gold?: number; research?: number; recruit?: number; walls?: number; garrison?: number; sight?: number; cheap?: number }
export interface Building { id: string; names: string[]; cost: number; turns: number; blurb: string; fx: BuildingFx; coast?: boolean; minLevel?: number; req?: string; capital?: boolean }
const N8 = (a: string, b = a, c = b, d = c, e = d, f = e, g = f, h = g) => [a, b, c, d, e, f, g, h];
export const BUILDINGS: Building[] = [
  { id: 'farms', names: N8('Roças', 'Fazendas', 'Fazendas', 'Fazendas mecanizadas', 'Agroindústria', 'Agricultura de precisão', 'Fazendas verticais', 'Biomas cultivados'), cost: 80, turns: 2, blurb: '+1,2% de crescimento por turno.', fx: { growth: 0.012 } },
  { id: 'market', names: N8('Ponto de troca', 'Mercado', 'Bolsa de comércio', 'Bancos', 'Centro comercial', 'Distrito financeiro', 'Rede de comércio', 'Bolsa interplanetária'), cost: 100, turns: 2, blurb: '+50% de ouro.', fx: { gold: 0.5 } },
  { id: 'barracks', names: N8('Casa dos guerreiros', 'Quartel', 'Quartel', 'Caserna', 'Base militar', 'Base militar', 'Centro de treinamento', 'Academia orbital'), cost: 120, turns: 2, blurb: '+1 unidade recrutada por turno; tropas veteranas.', fx: { recruit: 1 } },
  { id: 'walls', names: N8('Paliçada', 'Muralhas', 'Fortaleza abaluartada', 'Fortificações', 'Bunkers', 'Defesas de perímetro', 'Escudo de energia', 'Cúpula de força'), cost: 140, turns: 3, blurb: 'Guarnição de defesa e bônus ao defender.', fx: { walls: 1, garrison: 2 } },
  { id: 'temple', names: N8('Totem dos anciãos', 'Mosteiro', 'Universidade', 'Escola politécnica', 'Laboratórios', 'Centro de pesquisa', 'Núcleo de IA', 'Instituto estelar'), cost: 110, turns: 3, blurb: '+60% de pesquisa.', fx: { research: 0.6 } },
  { id: 'workshop', names: N8('Oficina', 'Forja', 'Manufatura', 'Fábrica', 'Complexo industrial', 'Fábrica automatizada', 'Fábrica autônoma', 'Forja de matéria'), cost: 130, turns: 3, blurb: '-20% no custo de recrutamento; +20% ouro.', fx: { cheap: 0.2, gold: 0.2 } },
  { id: 'port', names: N8('Ancoradouro', 'Porto', 'Porto', 'Porto a vapor', 'Porto', 'Porto de contêineres', 'Porto automático', 'Porto espacial'), cost: 120, turns: 2, coast: true, blurb: '+30% ouro (comércio); embarque mais barato.', fx: { gold: 0.3 } },
  { id: 'shipyard', names: N8('—', '—', '—', '—', '—', '—', '—', 'Estaleiro da nave colonial'), cost: 2500, turns: 8, capital: true, req: 'navecolonial', blurb: 'A nave colonial: quando ficar pronta, a espécie parte para as estrelas (vitória).', fx: {} },
];
export const buildingById = (id: string) => BUILDINGS.find(b => b.id === id)!;

// ---------------------------------------------------------------------------------------------------
export const LEVELS = [
  { name: 'Aldeia', pop: 0 }, { name: 'Vila', pop: 2500 }, { name: 'Cidade', pop: 6000 }, { name: 'Cidade grande', pop: 14000 }, { name: 'Metrópole', pop: 32000 },
];
export const levelOf = (pop: number) => { let l = 0; for (let i = 0; i < LEVELS.length; i++) if (pop >= LEVELS[i].pop) l = i; return l; };
/** building slots of a settlement level */
export const slotsOf = (lv: number) => 2 + lv;

export const FACTION_COLORS = ['#f2c14e', '#e4572e', '#4c9be8', '#5fbf6a', '#b06ad9', '#e98ac2', '#46c4c4', '#c98a4b', '#9aa5b1', '#7a6cf0', '#d6d65a', '#ff8f5a'];
export const REBEL_COLOR = '#8a8f98';
export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
/** army movement per turn (planet grid cells) by era */
export const MOVE = [26, 30, 34, 44, 56, 64, 72, 80];
/** up to this many regiments in one army */
export const ARMY_MAX = 12;

const TITLES = [['Tribo', 'Clã', 'Povo'], ['Reino', 'Ducado', 'Principado'], ['Reino', 'Império', 'República'], ['Império', 'República', 'Confederação'], ['República', 'União', 'Federação'], ['Federação', 'República', 'Coalizão'], ['Hegemonia', 'Federação', 'Diretório'], ['Hegemonia', 'Concórdia', 'Império estelar']];
/** a faction's title in an era ("Reino de X") */
export function factionTitle(base: string, era: number, seed: number) {
  const t = TITLES[Math.max(0, Math.min(7, era))];
  const w = t[Math.abs(seed) % t.length];
  return `${w} de ${base}`;
}
