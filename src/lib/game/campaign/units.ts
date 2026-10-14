// The regiments of the civilisation eras, shared by the campaign (recruiting, upkeep, auto-resolve) and the
// battles (formations, weapons, morale). Every soldier is the player's species (or the rival nation's: the same
// species) drawn by the creature generator with an equipment loadout (`equipment/loadout.ts`); war machines are
// drawn by the vehicle generator (siege lines, tanks, aircraft) with the nation's culture.
//  - tribal (warband): clubs, spears, javelins, bows; war beasts later;
//  - medieval (formation): spear walls, pikes, men-at-arms, axes, bows, crossbows, light / heavy cavalry, trebuchets;
//  - classic (line): line infantry with muskets, grenadiers, riflemen, hussars, cuirassiers, field guns, mortars;
//  - industrial (trench): riflemen, assault troops, machine guns, howitzers, AT guns, the first tanks;
//  - modern .. space (combined arms, Steel Division / WARNO): squads, tanks, IFVs, AT, AA, artillery, recon,
//    helicopters and air strikes, with command points.
import type { Loadout, ItemSel, WearSel } from '../../equipment/loadout';
import type { VSize } from '../../vehicle/catalog';

export type UClass =
  | 'melee' | 'spear' | 'pike' | 'shock' | 'missile' | 'gun' | 'skirm' | 'cav' | 'cavgun'
  | 'art' | 'mg' | 'at' | 'aa' | 'tank' | 'ifv' | 'recon' | 'heli' | 'air';
export type Element = 'soldier' | 'mounted' | 'piece' | 'vehicle';

export interface UnitDef {
  id: string; name: string; cls: UClass; el: Element;
  /** civilisation eras it is recruited in (0 tribal .. 7 space) */
  era: [number, number];
  /** soldiers (or pieces / vehicles) in a full unit */
  men: number;
  hp: number; melee: number; def: number; armor: number; charge: number;
  /** walk / run speed (world px per second) */
  speed: number; run: number;
  /** ranged weapon: range (px), damage per hit, reload (s), accuracy (0..1 at half range), armour piercing (0..1), blast radius */
  range?: number; dmg?: number; reload?: number; acc?: number; ap?: number; blast?: number;
  /** suppression a hit (or a near miss) adds; machine guns pin whole lines */
  sup?: number;
  /** fires over the heads (artillery, mortars) */
  indirect?: boolean;
  /** the javelin / grenade is thrown by every soldier once the enemy is close */
  thrown?: boolean;
  shield?: number;
  /** +melee against a charge from the front (spears, pikes) */
  brace?: number;
  morale: number;
  cost: number; upkeep: number;
  /** command points in the combined-arms battles */
  pts: number;
  /** research needed (campaign tech id) */
  req?: string;
  /** crew per piece (art / mg / at drawn as a gun with its crew) */
  crew?: number;
  /** vehicle generator design (role, size) for pieces and vehicles */
  veh?: { type: string; size: VSize };
  /** carries a squad (IFV / half-track): the squad dismounts on arrival */
  carries?: string;
  sight: number;
  blurb: string;
  /** soldiers' equipment for an era */
  load: (e: number) => Loadout;
}

// --- materials of an era ---------------------------------------------------------------------------
const metal = (e: number) => (e <= 0 ? 'flint' : e === 1 ? 'iron' : e <= 3 ? 'steel' : e <= 4 ? 'steel' : e === 5 ? 'titanium' : 'nanoalloy');
const blade = (e: number) => (e <= 0 ? 'obsidian' : metal(e));
const haft = (e: number) => (e <= 3 ? 'wood' : e <= 5 ? 'polymer' : 'carbon');
const gunMat = (e: number) => (e <= 3 ? 'wood' : e <= 4 ? 'steel' : e === 5 ? 'polymer' : e === 6 ? 'carbon' : 'plasma');
const it = (type: string, mat: string, variant = 0): ItemSel => ({ type, mat, variant });
const wear = (style: string, mat: string, variant = 0, pieces: WearSel['pieces'] = ['head', 'torso', 'arms', 'hands', 'legs', 'feet']): WearSel => ({ style, mat, variant, pieces });
const civil = (e: number, v = 0) => wear('civil', e <= 0 ? 'hide' : e <= 3 ? 'wool' : 'polymer', v, ['torso', 'arms', 'legs', 'feet']);
const field = (e: number, v = 0) => (e >= 7 ? wear('field', 'plasma', v) : e === 6 ? wear('exo', 'nanoalloy', v) : e >= 4 ? wear('tactical', e === 4 ? 'steel' : 'kevlar', v) : civil(e, v));

const U = (d: Partial<UnitDef> & Pick<UnitDef, 'id' | 'name' | 'cls' | 'era' | 'blurb' | 'load'>): UnitDef => ({
  el: 'soldier', men: 32, hp: 10, melee: 20, def: 20, armor: 10, charge: 10, speed: 22, run: 42, morale: 50,
  cost: 100, upkeep: 20, pts: 30, sight: 420, ...d,
});

export const UNITS: UnitDef[] = [
  // ------------------------------------------------------------------ tribal: war bands
  U({ id: 'clubs', name: 'Guerreiros de clava', cls: 'melee', era: [0, 0], men: 30, melee: 28, def: 14, armor: 8, charge: 16, morale: 45, cost: 60, upkeep: 8,
    blurb: 'O grosso do bando: clavas e coragem.', load: e => ({ main: it('mace', 'hardwood', 1), wear: wear('hide', 'hide', 1, ['torso', 'legs']) }) }),
  U({ id: 'tspears', name: 'Lanceiros tribais', cls: 'spear', era: [0, 0], men: 30, melee: 20, def: 26, armor: 10, charge: 10, brace: 18, shield: 0.25, morale: 50, cost: 70, upkeep: 9,
    blurb: 'Lanças e escudos de couro: seguram a linha e param as feras.', load: e => ({ main: it('spear', blade(e)), off: it('shield', 'hide'), wear: wear('hide', 'hide', 2, ['torso', 'legs', 'feet']) }) }),
  U({ id: 'javelins', name: 'Arremessadores', cls: 'missile', era: [0, 0], men: 24, melee: 14, def: 10, armor: 4, range: 110, dmg: 9, reload: 4, acc: 0.42, ap: 0.2, morale: 40, cost: 60, upkeep: 8, speed: 25, run: 48,
    blurb: 'Dardos de curto alcance que doem muito.', load: e => ({ main: it('spear', blade(e), 2), wear: civil(e, 3) }) }),
  U({ id: 'tbows', name: 'Arqueiros tribais', cls: 'missile', era: [0, 0], men: 24, melee: 10, def: 8, armor: 4, range: 230, dmg: 6, reload: 5, acc: 0.3, morale: 38, cost: 70, upkeep: 9, req: 'arco',
    blurb: 'Arcos simples: chuva de flechas de longe.', load: e => ({ two: it('bow', 'wood'), back: it('quiver', 'hide'), wear: civil(e, 4) }) }),
  U({ id: 'champions', name: 'Campeões do clã', cls: 'shock', era: [0, 0], men: 20, hp: 13, melee: 40, def: 22, armor: 22, charge: 26, morale: 70, cost: 130, upkeep: 16, req: 'bronze',
    blurb: 'A elite da tribo, com armaduras de osso e machados pesados.', load: e => ({ two: it('greataxe', 'obsidian', 1), wear: wear('bone', 'bone', 1) }) }),
  U({ id: 'beasts', name: 'Montaria de guerra', cls: 'cav', el: 'mounted', era: [0, 0], men: 12, hp: 16, melee: 30, def: 16, armor: 12, charge: 46, speed: 38, run: 92, morale: 55, cost: 160, upkeep: 20, req: 'domesticacao',
    blurb: 'Feras domadas do planeta, montadas por caçadores com lanças.', load: e => ({ main: it('spear', blade(e), 1), wear: wear('hide', 'fur', 0, ['torso', 'legs']) }) }),

  // ------------------------------------------------------------------ medieval: formations
  U({ id: 'militia', name: 'Milícia de lanças', cls: 'spear', era: [1, 1], men: 40, melee: 18, def: 30, armor: 18, charge: 8, brace: 22, shield: 0.35, morale: 45, cost: 70, upkeep: 9,
    blurb: 'Lanças e escudos: forma a parede de escudos.', load: e => ({ main: it('spear', 'iron'), off: it('shield', 'wood', 1), wear: wear('padded', 'flax') }) }),
  U({ id: 'pikes', name: 'Piqueiros', cls: 'pike', era: [1, 1], men: 40, melee: 22, def: 26, armor: 22, charge: 6, brace: 40, morale: 55, cost: 100, upkeep: 12, req: 'piques', speed: 20, run: 36,
    blurb: 'Uma floresta de piques: a cavalaria que carrega de frente se empala.', load: e => ({ two: it('pike', 'steel'), wear: wear('padded', 'wool', 1) }) }),
  U({ id: 'menatarms', name: 'Homens de armas', cls: 'melee', era: [1, 1], men: 36, hp: 11, melee: 36, def: 32, armor: 45, charge: 14, shield: 0.4, morale: 65, cost: 150, upkeep: 18, req: 'malha',
    blurb: 'Espada, escudo e cota de malha: a infantaria pesada do reino.', load: e => ({ main: it('sword', 'steel'), off: it('shield', 'iron'), wear: wear('mail', 'iron') }) }),
  U({ id: 'axemen', name: 'Machadeiros', cls: 'shock', era: [1, 1], men: 36, hp: 11, melee: 42, def: 18, armor: 30, charge: 22, ap: 0.4, morale: 55, cost: 130, upkeep: 15,
    blurb: 'Machados de duas mãos que racham escudos e armaduras.', load: e => ({ two: it('greataxe', 'iron'), wear: wear('lamellar', 'iron') }) }),
  U({ id: 'archers', name: 'Arqueiros', cls: 'missile', era: [1, 1], men: 36, melee: 12, def: 10, armor: 10, range: 260, dmg: 7, reload: 4.5, acc: 0.32, morale: 40, cost: 90, upkeep: 11,
    blurb: 'Saraivadas de flechas sobre as formações.', load: e => ({ two: it('bow', 'wood', 1), back: it('quiver', 'leather'), wear: wear('padded', 'flax', 2, ['torso', 'arms', 'legs']) }) }),
  U({ id: 'xbows', name: 'Besteiros', cls: 'missile', era: [1, 1], men: 36, melee: 14, def: 14, armor: 28, range: 210, dmg: 11, reload: 7, acc: 0.42, ap: 0.6, morale: 45, cost: 120, upkeep: 14, req: 'besta',
    blurb: 'Virotes que atravessam a armadura.', load: e => ({ two: it('crossbow', 'wood'), belt: it('hipquiver', 'leather'), wear: wear('brigandine', 'iron') }) }),
  U({ id: 'lightcav', name: 'Cavalaria leve', cls: 'cav', el: 'mounted', era: [1, 1], men: 20, hp: 14, melee: 26, def: 16, armor: 18, charge: 30, speed: 42, run: 100, morale: 50, cost: 140, upkeep: 16,
    blurb: 'Rápida: persegue arqueiros e cai nos flancos.', load: e => ({ main: it('spear', 'iron', 1), off: it('shield', 'wood', 2), wear: wear('leather', 'leather') }) }),
  U({ id: 'knights', name: 'Cavalaria pesada', cls: 'cav', el: 'mounted', era: [1, 1], men: 20, hp: 18, melee: 38, def: 30, armor: 60, charge: 60, speed: 36, run: 88, morale: 75, cost: 260, upkeep: 30, req: 'estribo',
    blurb: 'A carga que quebra linhas — se não houver piques à frente.', load: e => ({ main: it('sword', 'steel', 2), off: it('shield', 'steel', 1), wear: wear('plate', 'steel') }) }),
  U({ id: 'trebuchet', name: 'Trabucos', cls: 'art', el: 'piece', era: [1, 1], men: 2, crew: 4, hp: 60, melee: 4, def: 4, armor: 0, range: 900, dmg: 40, reload: 14, acc: 0.18, blast: 34, indirect: true, ap: 0.5, speed: 10, run: 12, morale: 40, cost: 220, upkeep: 26, req: 'cerco',
    veh: { type: 'trebuchet', size: 'large' }, blurb: 'Pedras enormes contra muralhas e formações.', load: e => ({ wear: civil(e, 6) }) }),

  // ------------------------------------------------------------------ classic: line infantry
  U({ id: 'line', name: 'Infantaria de linha', cls: 'gun', era: [2, 2], men: 48, melee: 18, def: 18, armor: 6, charge: 10, range: 170, dmg: 10, reload: 9, acc: 0.2, ap: 0.6, morale: 55, cost: 110, upkeep: 13,
    blurb: 'Mosquetes em fileiras: descargas por fileira, baionetas na hora certa.', load: e => ({ two: it('rifle', 'wood'), belt: it('pouch', 'leather'), wear: wear('civil', 'wool', 1) }) }),
  U({ id: 'grenadiers', name: 'Granadeiros', cls: 'gun', era: [2, 2], men: 40, hp: 11, melee: 28, def: 22, armor: 8, charge: 18, range: 170, dmg: 10, reload: 8, acc: 0.22, ap: 0.6, morale: 70, cost: 160, upkeep: 18, req: 'granadas',
    blurb: 'Os mais altos e valentes: lançam granadas antes do assalto.', thrown: true, load: e => ({ two: it('rifle', 'wood', 1), belt: it('satchel', 'leather'), wear: wear('civil', 'wool', 2) }) }),
  U({ id: 'riflemen2', name: 'Atiradores', cls: 'skirm', era: [2, 2], men: 32, melee: 14, def: 14, armor: 4, range: 260, dmg: 10, reload: 12, acc: 0.38, ap: 0.6, morale: 50, cost: 140, upkeep: 16, req: 'raiado',
    blurb: 'Formação solta e carabinas raiadas: caçam oficiais e artilheiros.', load: e => ({ two: it('rifle', 'wood', 2), belt: it('pouch', 'leather', 1), wear: wear('civil', 'wool', 3) }) }),
  U({ id: 'pikemen2', name: 'Piqueiros de terço', cls: 'pike', era: [2, 2], men: 40, melee: 22, def: 28, armor: 26, charge: 6, brace: 40, morale: 55, cost: 90, upkeep: 11, speed: 20, run: 36,
    blurb: 'O terço ainda protege os mosqueteiros da cavalaria.', load: e => ({ two: it('pike', 'steel', 1), wear: wear('cuirass', 'steel') }) }),
  U({ id: 'hussars', name: 'Hussardos', cls: 'cav', el: 'mounted', era: [2, 2], men: 24, hp: 14, melee: 30, def: 18, armor: 10, charge: 34, speed: 44, run: 104, morale: 55, cost: 160, upkeep: 18,
    blurb: 'Cavalaria ligeira de sabre: flancos e perseguição.', load: e => ({ main: it('sword', 'steel', 3), wear: wear('civil', 'wool', 4) }) }),
  U({ id: 'cuirassiers', name: 'Couraceiros', cls: 'cav', el: 'mounted', era: [2, 2], men: 24, hp: 17, melee: 36, def: 28, armor: 40, charge: 55, speed: 38, run: 92, morale: 70, cost: 240, upkeep: 26, req: 'couraca',
    blurb: 'Couraça e espada larga: a carga pesada contra linhas sem quadrado.', load: e => ({ main: it('longsword', 'steel'), wear: wear('cuirass', 'steel', 1) }) }),
  U({ id: 'dragoons', name: 'Dragões', cls: 'cavgun', el: 'mounted', era: [2, 2], men: 24, hp: 14, melee: 24, def: 18, armor: 10, charge: 24, range: 150, dmg: 9, reload: 10, acc: 0.2, ap: 0.6, speed: 40, run: 96, morale: 55, cost: 200, upkeep: 22, req: 'granadas',
    blurb: 'Infantaria montada: atira e se desloca rápido.', load: e => ({ two: it('rifle', 'wood', 3), wear: wear('civil', 'wool', 5) }) }),
  U({ id: 'cannon', name: 'Artilharia de campanha', cls: 'art', el: 'piece', era: [2, 2], men: 3, crew: 4, hp: 50, melee: 6, def: 6, armor: 20, range: 700, dmg: 34, reload: 11, acc: 0.25, blast: 26, ap: 0.8, speed: 14, run: 16, morale: 45, cost: 240, upkeep: 26, req: 'polvora',
    veh: { type: 'catapult', size: 'medium' }, blurb: 'Balas rasas que varrem fileiras inteiras.', load: e => ({ wear: wear('civil', 'wool', 6) }) }),
  U({ id: 'mortar2', name: 'Morteiros', cls: 'art', el: 'piece', era: [2, 2], men: 2, crew: 4, hp: 50, melee: 6, def: 6, armor: 20, range: 1000, dmg: 30, reload: 15, acc: 0.15, blast: 40, indirect: true, ap: 0.6, speed: 10, run: 12, morale: 45, cost: 260, upkeep: 28, req: 'balistica',
    veh: { type: 'trebuchet', size: 'large' }, blurb: 'Bombas por cima das muralhas e das linhas.', load: e => ({ wear: wear('civil', 'wool', 7) }) }),

  // ------------------------------------------------------------------ industrial: trenches
  U({ id: 'riflemen', name: 'Fuzileiros', cls: 'gun', era: [3, 3], men: 36, melee: 18, def: 16, armor: 6, charge: 10, range: 320, dmg: 10, reload: 3.2, acc: 0.18, ap: 0.6, morale: 50, cost: 100, upkeep: 12,
    blurb: 'Fuzis de ferrolho; na trincheira, quase impossíveis de tirar.', load: e => ({ two: it('rifle', 'wood'), back: it('backpack', 'wool'), wear: wear('civil', 'wool', 1) }) }),
  U({ id: 'assault', name: 'Tropa de assalto', cls: 'shock', era: [3, 3], men: 24, hp: 11, melee: 34, def: 20, armor: 12, charge: 24, range: 120, dmg: 12, reload: 2, acc: 0.25, ap: 0.6, thrown: true, morale: 70, cost: 170, upkeep: 20, req: 'infiltracao', speed: 26, run: 50,
    blurb: 'Granadas, armas curtas e pás afiadas: limpam trincheiras.', load: e => ({ two: it('rifle', 'steel', 1), belt: it('satchel', 'leather'), wear: wear('padded', 'wool', 2) }) }),
  U({ id: 'mg', name: 'Metralhadoras', cls: 'mg', el: 'piece', era: [3, 3], men: 4, crew: 3, hp: 30, melee: 8, def: 8, armor: 10, range: 420, dmg: 9, reload: 0.18, acc: 0.12, sup: 6, ap: 0.5, speed: 14, run: 22, morale: 60, cost: 180, upkeep: 20,
    veh: { type: 'ballista', size: 'small' }, blurb: 'Ninhos de metralhadora: ninguém atravessa a terra de ninguém.', load: e => ({ wear: wear('civil', 'wool', 3) }) }),
  U({ id: 'howitzer', name: 'Obuseiros', cls: 'art', el: 'piece', era: [3, 3], men: 3, crew: 4, hp: 60, melee: 6, def: 6, armor: 20, range: 2000, dmg: 46, reload: 14, acc: 0.12, blast: 42, sup: 20, indirect: true, ap: 0.8, speed: 10, run: 14, morale: 50, cost: 280, upkeep: 30, req: 'barragem',
    veh: { type: 'trebuchet', size: 'large' }, blurb: 'Barragens que revolvem a terra e as trincheiras.', load: e => ({ wear: wear('civil', 'wool', 4) }) }),
  U({ id: 'atgun', name: 'Canhões anticarro', cls: 'at', el: 'piece', era: [3, 3], men: 2, crew: 3, hp: 40, melee: 6, def: 6, armor: 20, range: 600, dmg: 80, reload: 5, acc: 0.4, ap: 1, blast: 10, speed: 12, run: 18, morale: 50, cost: 200, upkeep: 22, req: 'motor',
    veh: { type: 'catapult', size: 'medium' }, blurb: 'Contra os primeiros blindados.', load: e => ({ wear: wear('civil', 'wool', 5) }) }),
  U({ id: 'tank1', name: 'Tanques', cls: 'tank', el: 'vehicle', era: [3, 3], men: 2, hp: 300, melee: 0, def: 0, armor: 70, range: 500, dmg: 60, reload: 6, acc: 0.25, ap: 0.9, blast: 20, sup: 8, speed: 14, run: 18, morale: 80, cost: 380, upkeep: 40, req: 'motor', sight: 380,
    veh: { type: 'heavy', size: 'medium' }, blurb: 'Losangos de aço que cruzam o arame e as trincheiras.', load: e => ({}) }),
  U({ id: 'cav3', name: 'Cavalaria', cls: 'cav', el: 'mounted', era: [3, 3], men: 20, hp: 14, melee: 30, def: 16, armor: 6, charge: 30, speed: 44, run: 100, morale: 50, cost: 150, upkeep: 16,
    blurb: 'Ainda útil para explorar e perseguir — fatal diante das metralhadoras.', load: e => ({ main: it('sword', 'steel', 4), wear: wear('civil', 'wool', 6) }) }),

  // ------------------------------------------------------------------ modern .. space: combined arms
  U({ id: 'inf', name: 'Infantaria', cls: 'gun', era: [4, 7], men: 10, melee: 22, def: 18, armor: 12, charge: 10, range: 360, dmg: 11, reload: 1.6, acc: 0.2, ap: 0.6, morale: 55, cost: 90, upkeep: 10, pts: 25, thrown: true, speed: 24, run: 46,
    blurb: 'Esquadra de fuzileiros: segura matas e prédios, granadas e lança-rojões leves.', load: e => ({ two: it('rifle', gunMat(e)), back: it('backpack', e >= 6 ? 'smartfabric' : 'polymer'), wear: field(e) }) }),
  U({ id: 'elite', name: 'Forças especiais', cls: 'skirm', era: [4, 7], men: 8, hp: 12, melee: 34, def: 26, armor: 22, charge: 18, range: 420, dmg: 13, reload: 1.3, acc: 0.3, ap: 0.7, morale: 80, cost: 170, upkeep: 18, pts: 55, thrown: true, req: 'forcasespeciais', speed: 26, run: 52, sight: 560,
    blurb: 'Poucos e letais; enxergam longe e se escondem bem.', load: e => ({ two: it('rifle', gunMat(e), 2), belt: it('pouch', 'polymer'), wear: field(e, 2) }) }),
  U({ id: 'mg4', name: 'Metralhadora pesada', cls: 'mg', el: 'piece', era: [4, 7], men: 2, crew: 3, hp: 30, melee: 8, def: 8, armor: 10, range: 480, dmg: 10, reload: 0.15, acc: 0.12, sup: 6, ap: 0.5, speed: 16, run: 24, morale: 60, cost: 120, upkeep: 14, pts: 30,
    veh: { type: 'ballista', size: 'small' }, blurb: 'Fogo de supressão: crava a infantaria no chão.', load: e => ({ wear: field(e, 3) }) }),
  U({ id: 'at4', name: 'Antitanque', cls: 'at', el: 'piece', era: [4, 7], men: 2, crew: 3, hp: 40, melee: 6, def: 6, armor: 20, range: 700, dmg: 110, reload: 6, acc: 0.42, ap: 1, blast: 10, speed: 14, run: 22, morale: 55, cost: 160, upkeep: 18, pts: 45,
    veh: { type: 'catapult', size: 'medium' }, blurb: 'Canhões e mísseis guiados: a morte dos blindados.', load: e => ({ wear: field(e, 4) }) }),
  U({ id: 'recon', name: 'Reconhecimento', cls: 'recon', el: 'vehicle', era: [4, 7], men: 2, hp: 120, melee: 0, def: 0, armor: 25, range: 420, dmg: 14, reload: 0.4, acc: 0.18, sup: 3, ap: 0.5, speed: 40, run: 70, morale: 50, cost: 140, upkeep: 14, pts: 30, sight: 900,
    veh: { type: 'light', size: 'small' }, blurb: 'Olhos do comandante: enxerga longe e revela o inimigo.', load: e => ({}) }),
  U({ id: 'ifv', name: 'Infantaria mecanizada', cls: 'ifv', el: 'vehicle', era: [4, 7], men: 2, hp: 180, melee: 0, def: 0, armor: 40, range: 480, dmg: 22, reload: 0.6, acc: 0.2, sup: 4, ap: 0.6, blast: 6, speed: 34, run: 60, morale: 60, cost: 220, upkeep: 24, pts: 60, carries: 'inf', req: 'mecanizacao',
    veh: { type: 'light', size: 'medium' }, blurb: 'Leva uma esquadra e a cobre com seu canhão automático.', load: e => ({}) }),
  U({ id: 'tank', name: 'Tanques', cls: 'tank', el: 'vehicle', era: [4, 7], men: 2, hp: 420, melee: 0, def: 0, armor: 85, range: 620, dmg: 95, reload: 5, acc: 0.32, ap: 1, blast: 18, sup: 10, speed: 28, run: 48, morale: 85, cost: 420, upkeep: 44, pts: 110, req: 'blindados', sight: 420,
    veh: { type: 'medium', size: 'medium' }, blurb: 'A ponta de lança: canhão, couraça e esteiras.', load: e => ({}) }),
  U({ id: 'heavytank', name: 'Tanques pesados', cls: 'tank', el: 'vehicle', era: [4, 7], men: 1, hp: 700, melee: 0, def: 0, armor: 100, range: 700, dmg: 130, reload: 6, acc: 0.34, ap: 1, blast: 22, sup: 12, speed: 20, run: 34, morale: 90, cost: 600, upkeep: 60, pts: 160, req: 'blindadospesados', sight: 420,
    veh: { type: 'heavy', size: 'large' }, blurb: 'Fortalezas lentas que quase nada perfura.', load: e => ({}) }),
  U({ id: 'spg', name: 'Artilharia', cls: 'art', el: 'vehicle', era: [4, 7], men: 2, hp: 160, melee: 0, def: 0, armor: 20, range: 2600, dmg: 60, reload: 8, acc: 0.12, blast: 50, sup: 22, indirect: true, ap: 0.8, speed: 22, run: 36, morale: 55, cost: 320, upkeep: 34, pts: 90, req: 'artilhariamovel',
    veh: { type: 'trebuchet', size: 'large' }, blurb: 'Fogo indireto: marque o alvo no mapa.', load: e => ({}) }),
  U({ id: 'aa', name: 'Antiaérea', cls: 'aa', el: 'vehicle', era: [4, 7], men: 2, hp: 140, melee: 0, def: 0, armor: 20, range: 900, dmg: 30, reload: 0.5, acc: 0.3, ap: 0.4, speed: 30, run: 52, morale: 55, cost: 200, upkeep: 22, pts: 50, req: 'radar',
    veh: { type: 'ballista', size: 'small' }, blurb: 'Derruba helicópteros e aviões que entram no seu céu.', load: e => ({}) }),
  U({ id: 'heli', name: 'Helicópteros de ataque', cls: 'heli', el: 'vehicle', era: [5, 7], men: 2, hp: 200, melee: 0, def: 0, armor: 30, range: 700, dmg: 70, reload: 3, acc: 0.38, ap: 1, blast: 14, sup: 8, speed: 70, run: 120, morale: 70, cost: 380, upkeep: 40, pts: 100, req: 'helicopteros', sight: 700,
    veh: { type: 'airMedium', size: 'small' }, blurb: 'Voam sobre o terreno e caçam blindados com mísseis.', load: e => ({}) }),
  U({ id: 'jets', name: 'Ataque aéreo', cls: 'air', el: 'vehicle', era: [4, 7], men: 1, hp: 180, melee: 0, def: 0, armor: 20, range: 120, dmg: 140, reload: 99, acc: 0.6, ap: 1, blast: 60, sup: 30, speed: 260, run: 260, morale: 99, cost: 300, upkeep: 30, pts: 80, req: 'aviacao',
    veh: { type: 'airHeavy', size: 'medium' }, blurb: 'Chamado no céu: um passe de bombas e vai embora.', load: e => ({}) }),
];
export const unitById = (id: string) => UNITS.find(u => u.id === id) ?? UNITS[0];
/** recruitable in an era with the techs known */
export const unitsFor = (era: number, techs: Set<string> | string[]) => {
  const T = techs instanceof Set ? techs : new Set(techs);
  return UNITS.filter(u => era >= u.era[0] && era <= u.era[1] && (!u.req || T.has(u.req)));
};
/** the same role one era later (old regiments are re-equipped when the era changes) */
export function upgradeOf(u: UnitDef, era: number): UnitDef | null {
  if (era >= u.era[0] && era <= u.era[1]) return u;
  const next = UNITS.filter(v => era >= v.era[0] && era <= v.era[1]);
  const same = next.find(v => v.cls === u.cls && v.el === u.el) ?? next.find(v => v.cls === u.cls) ?? next.find(v => v.el === u.el) ?? next[0];
  return same ?? null;
}
export const isVehicle = (u: UnitDef) => u.el === 'vehicle';
export const isRanged = (u: UnitDef) => !!u.range && !u.thrown;
export const CLASS_NAME: Record<UClass, string> = {
  melee: 'Infantaria corpo a corpo', spear: 'Lanceiros', pike: 'Piqueiros', shock: 'Tropa de choque', missile: 'Projéteis', gun: 'Infantaria de fogo',
  skirm: 'Escaramuçadores', cav: 'Cavalaria', cavgun: 'Cavalaria de fogo', art: 'Artilharia', mg: 'Metralhadoras', at: 'Antitanque', aa: 'Antiaérea',
  tank: 'Blindados', ifv: 'Mecanizada', recon: 'Reconhecimento', heli: 'Helicópteros', air: 'Aviação',
};
