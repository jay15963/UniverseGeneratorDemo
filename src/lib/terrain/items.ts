// Items the player can gather from the terrain and how each feature is harvested.
import { Feat, Feature, FLOWER_SPECIES, MUSHROOM_SPECIES, CROP_SPECIES, TREES } from './types';
import { RockType, ROCK_NAMES } from './palettes';

export type ItemCategory = 'Madeira' | 'Pedra' | 'Minério' | 'Alimento' | 'Planta' | 'Fibra' | 'Mineral';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  cat: ItemCategory;
  icon: { t: Feat; v: number; state?: 'empty' } | { custom: string };
}

const defs: ItemDef[] = [
  { id: 'graveto', name: 'Graveto', desc: 'Galho seco. Base para fogueiras, ferramentas e o primeiro machado de pedra.', cat: 'Madeira', icon: { t: Feat.STICK, v: 0 } },
  { id: 'pederneira', name: 'Pederneira', desc: 'Sílex de fratura conchoidal. Lascado, vira lâminas, facas e pontas de lança.', cat: 'Pedra', icon: { t: Feat.FLINT, v: 0 } },
  { id: 'cobre_nativo', name: 'Pepita de cobre nativo', desc: 'Cobre quase puro. Pode ser fundido num forno de argila para as primeiras ferramentas de metal.', cat: 'Minério', icon: { t: Feat.NUGGET_COPPER, v: 0 } },
  { id: 'cassiterita', name: 'Cassiterita', desc: 'Minério de estanho. Misturado ao cobre, forma o bronze.', cat: 'Minério', icon: { t: Feat.NUGGET_TIN, v: 0 } },
  { id: 'ouro_quartzo', name: 'Quartzo aurífero', desc: 'Quartzo com veios de ouro nativo.', cat: 'Minério', icon: { t: Feat.NUGGET_GOLD, v: 0 } },
  { id: 'limonita', name: 'Limonita', desc: 'Minério de ferro hidratado. Exige um forno de alta temperatura (bloomery).', cat: 'Minério', icon: { t: Feat.LIMONITE, v: 0 } },
  { id: 'concha', name: 'Concha', desc: 'Rica em cálcio. Pode ser moída para cal.', cat: 'Mineral', icon: { t: Feat.SEASHELL, v: 0 } },
  { id: 'mirtilo', name: 'Mirtilos', desc: 'Frutinhas azuis de clima frio. Comida rápida, apodrece em poucos dias.', cat: 'Alimento', icon: { custom: 'berry_blue' } },
  { id: 'framboesa', name: 'Framboesas', desc: 'Frutas vermelhas de clima temperado.', cat: 'Alimento', icon: { custom: 'berry_red' } },
  { id: 'amora', name: 'Amoras', desc: 'Frutas escuras de clima quente, em arbustos espinhosos.', cat: 'Alimento', icon: { custom: 'berry_black' } },
  { id: 'capim', name: 'Capim', desc: 'Pode ser seco ao sol para palha, cama e isca de fogo.', cat: 'Fibra', icon: { t: Feat.TALL_GRASS, v: 0 } },
  { id: 'capim_seco', name: 'Capim seco', desc: 'Palha pronta: isca de fogo, telhados e cestos.', cat: 'Fibra', icon: { t: Feat.TALL_GRASS, v: 3 } },
  { id: 'samambaia', name: 'Folha de samambaia', desc: 'Folhagem macia. Útil como cama rústica.', cat: 'Planta', icon: { t: Feat.FERN, v: 0 } },
  { id: 'junco', name: 'Junco', desc: 'Caules ocos e flexíveis. Trançados viram cestos e esteiras.', cat: 'Fibra', icon: { t: Feat.REEDS, v: 0 } },
  { id: 'taboa', name: 'Raiz de taboa', desc: 'Rizoma amiláceo comestível. As folhas servem de fibra.', cat: 'Alimento', icon: { t: Feat.CATTAIL, v: 0 } },
  { id: 'linho', name: 'Fibra de linho', desc: 'Fibra longa e resistente. Vira barbante, corda e tecido.', cat: 'Fibra', icon: { t: Feat.FLAX, v: 0 } },
  { id: 'cristal_gelo', name: 'Cristal de gelo', desc: 'Gelo antigo e límpido.', cat: 'Mineral', icon: { t: Feat.ICE_CRYSTAL, v: 0 } },
  { id: 'obsidiana', name: 'Obsidiana', desc: 'Vidro vulcânico. Lascas mais afiadas que o aço.', cat: 'Mineral', icon: { t: Feat.OBSIDIAN, v: 0 } },
  { id: 'enxofre', name: 'Enxofre', desc: 'Cristais amarelos. Ingrediente de pólvora e conservantes.', cat: 'Mineral', icon: { t: Feat.SULFUR, v: 0 } },
  { id: 'diamante', name: 'Diamante bruto', desc: 'Carbono cristalizado sob pressão extrema.', cat: 'Mineral', icon: { t: Feat.DIAMOND, v: 0 } },
  { id: 'sal', name: 'Sal-gema', desc: 'Conserva carnes e peles.', cat: 'Mineral', icon: { t: Feat.SALT_CRYSTAL, v: 0 } },
];
for (let r = 0; r < 8; r++) {
  defs.push({ id: `pedra_${r}`, name: `Pedra de ${ROCK_NAMES[r as RockType]}`, desc: 'Pedra solta do solo. Lascada, vira machado, faca e pá de pedra.', cat: 'Pedra', icon: { t: Feat.LOOSE_STONE, v: r * 3 } });
}
FLOWER_SPECIES.forEach((n, i) => defs.push({ id: `flor_${i}`, name: n, desc: 'Flor silvestre. Algumas dão corantes ou chás.', cat: 'Planta', icon: { t: Feat.FLOWER, v: i * 3 } }));
MUSHROOM_SPECIES.forEach((n, i) => defs.push({
  id: `cogumelo_${i}`, name: n,
  desc: i === 0 ? 'Venenoso! Belo, mas não coma.' : i === 3 ? 'Comestível quando jovem e branco por dentro.' : 'Cogumelo comestível da floresta.',
  cat: 'Alimento', icon: { t: Feat.MUSHROOM, v: i * 3 },
}));
const CROP_ITEM = ['Cenoura', 'Cebola', 'Nabo', 'Abóbora', 'Espigas de trigo'];
CROP_SPECIES.forEach((_, i) => defs.push({ id: `cultivo_${i}`, name: CROP_ITEM[i], desc: 'Planta selvagem comestível. Guarde algumas para plantar.', cat: 'Alimento', icon: { custom: `crop_${i}` } }));

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map(d => [d.id, d]));

export type Harvest =
  | { kind: 'take'; items: [string, number][] }          // feature disappears
  | { kind: 'pick'; items: [string, number][] }          // feature stays, becomes "empty"
  | { kind: 'tool'; tool: string }                       // needs a tool (not yet craftable)
  | { kind: 'none' };

export function harvestFor(f: Feature): Harvest {
  const v = f.v;
  switch (f.t) {
    case Feat.STICK: return { kind: 'take', items: [['graveto', v >= 3 ? 2 : 1]] };
    case Feat.DEAD_BUSH: return { kind: 'take', items: [['graveto', 2]] };
    case Feat.LOOSE_STONE: return { kind: 'take', items: [[`pedra_${Math.floor(v / 3)}`, 1]] };
    case Feat.FLINT: return { kind: 'take', items: [['pederneira', 1]] };
    case Feat.NUGGET_COPPER: return { kind: 'take', items: [['cobre_nativo', 1]] };
    case Feat.NUGGET_TIN: return { kind: 'take', items: [['cassiterita', 1]] };
    case Feat.NUGGET_GOLD: return { kind: 'take', items: [['ouro_quartzo', 1]] };
    case Feat.LIMONITE: return { kind: 'take', items: [['limonita', 1]] };
    case Feat.SEASHELL: return { kind: 'take', items: [['concha', 1]] };
    case Feat.BERRY_BLUE: return { kind: 'pick', items: [['mirtilo', 3]] };
    case Feat.BERRY_RED: return { kind: 'pick', items: [['framboesa', 3]] };
    case Feat.BERRY_BLACK: return { kind: 'pick', items: [['amora', 3]] };
    case Feat.TALL_GRASS: return { kind: 'take', items: [[v >= 3 && v < 6 ? 'capim_seco' : 'capim', 1]] };
    case Feat.FERN: return { kind: 'take', items: [['samambaia', 1]] };
    case Feat.REEDS: return { kind: 'take', items: [['junco', 2]] };
    case Feat.CATTAIL: return { kind: 'take', items: [['taboa', 1], ['junco', 1]] };
    case Feat.FLAX: return { kind: 'take', items: [['linho', 2]] };
    case Feat.FLOWER: return { kind: 'take', items: [[`flor_${Math.floor(v / 3)}`, 1]] };
    case Feat.MUSHROOM: return { kind: 'take', items: [[`cogumelo_${Math.floor(v / 3)}`, 1 + (v % 3 === 2 ? 1 : 0)]] };
    case Feat.WILD_CROP: return { kind: 'take', items: [[`cultivo_${Math.floor(v / 2)}`, 1 + (v % 2)]] };
    case Feat.ICE_CRYSTAL: return { kind: 'take', items: [['cristal_gelo', 1]] };
    case Feat.OBSIDIAN: return { kind: 'take', items: [['obsidiana', 1]] };
    case Feat.SULFUR: return { kind: 'take', items: [['enxofre', 1]] };
    case Feat.DIAMOND: return { kind: 'take', items: [['diamante', 1]] };
    case Feat.SALT_CRYSTAL: return { kind: 'take', items: [['sal', 1]] };
    case Feat.BUSH: case Feat.CACTUS: return { kind: 'tool', tool: 'faca' };
    case Feat.BOULDER: return { kind: 'tool', tool: 'picareta' };
    case Feat.FALLEN_LOG: case Feat.STUMP: return { kind: 'tool', tool: 'machado' };
    default: return TREES.has(f.t) ? { kind: 'tool', tool: 'machado' } : { kind: 'none' };
  }
}

const TREE_NAMES: Partial<Record<Feat, string>> = {
  [Feat.OAK]: 'Carvalho', [Feat.BIRCH]: 'Bétula', [Feat.MAPLE]: 'Bordo', [Feat.PINE]: 'Pinheiro', [Feat.SPRUCE]: 'Abeto',
  [Feat.ACACIA]: 'Acácia', [Feat.KAPOK]: 'Sumaúma', [Feat.PALM]: 'Palmeira', [Feat.WILLOW]: 'Salgueiro', [Feat.DEAD_TREE]: 'Árvore morta',
};

export function featureName(f: Feature): string {
  if (TREE_NAMES[f.t]) return f.t === Feat.OAK && f.v >= 4 ? 'Árvore tropical' : TREE_NAMES[f.t]!;
  switch (f.t) {
    case Feat.BUSH: return 'Arbusto';
    case Feat.BERRY_BLUE: return 'Arbusto de mirtilo';
    case Feat.BERRY_RED: return 'Arbusto de framboesa';
    case Feat.BERRY_BLACK: return 'Arbusto de amora';
    case Feat.TALL_GRASS: return f.v >= 3 && f.v < 6 ? 'Capim seco alto' : 'Capim alto';
    case Feat.FERN: return 'Samambaia';
    case Feat.REEDS: return 'Junco';
    case Feat.CATTAIL: return 'Taboa';
    case Feat.FLAX: return 'Linho selvagem';
    case Feat.FLOWER: return FLOWER_SPECIES[Math.floor(f.v / 3)] ?? 'Flor';
    case Feat.MUSHROOM: return MUSHROOM_SPECIES[Math.floor(f.v / 3)] ?? 'Cogumelo';
    case Feat.WILD_CROP: return CROP_SPECIES[Math.floor(f.v / 2)] ?? 'Planta selvagem';
    case Feat.CACTUS: return 'Cacto';
    case Feat.DEAD_BUSH: return 'Arbusto seco';
    case Feat.LILY_PAD: return 'Vitória-régia';
    case Feat.STICK: return f.v >= 3 ? 'Madeira flutuante' : 'Graveto';
    case Feat.LOOSE_STONE: return `Pedra solta (${ROCK_NAMES[Math.floor(f.v / 3) as RockType]})`;
    case Feat.FLINT: return 'Pederneira';
    case Feat.NUGGET_COPPER: return 'Cobre nativo';
    case Feat.NUGGET_TIN: return 'Cassiterita';
    case Feat.NUGGET_GOLD: return 'Quartzo aurífero';
    case Feat.LIMONITE: return 'Limonita';
    case Feat.SEASHELL: return 'Concha';
    case Feat.BOULDER: return `Pedregulho de ${ROCK_NAMES[(f.v % 8) as RockType]}`;
    case Feat.FALLEN_LOG: return 'Tronco caído';
    case Feat.STUMP: return 'Toco';
    case Feat.ICE_CRYSTAL: return 'Cristal de gelo';
    case Feat.OBSIDIAN: return 'Obsidiana';
    case Feat.SULFUR: return 'Enxofre';
    case Feat.DIAMOND: return 'Diamante bruto';
    case Feat.SALT_CRYSTAL: return 'Sal-gema';
  }
  return 'Objeto';
}
