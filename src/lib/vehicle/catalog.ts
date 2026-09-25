// The catalogue of vehicle *roles*: domain (land / naval / air), class, the size tiers it comes in and the eras it
// exists in. A role is not a fixed model: its builder assembles each vehicle from modules chosen by the design
// numbers and the culture, and names it (`x.label`). New roles = one builder + one entry here.
import type { VCtx } from './vparts';
import { LAND } from './land';
import { SIEGE } from './siege';
import { NAVAL } from './naval';
import { AIR } from './air';

export type Domain = 'land' | 'naval' | 'air';
export type VClass = 'civil' | 'siege' | 'light' | 'medium' | 'heavy' | 'transform';
export type VSize = 'small' | 'medium' | 'large';

export const DOMAINS: { id: Domain; name: string; hint: string }[] = [
  { id: 'land', name: 'Terrestre', hint: 'Rodas, esteiras, meias-lagartas, pernas mecânicas, esferas, parafusos, esquis e colchões flutuantes' },
  { id: 'naval', name: 'Naval', hint: 'Sempre o dobro do tamanho dos terrestres e aéreos do mesmo porte' },
  { id: 'air', name: 'Aéreo', hint: 'A partir da era industrial' },
];
export const CLASSES: { id: VClass; name: string; hint: string }[] = [
  { id: 'civil', name: 'Civil', hint: 'Transporte de carga e passageiros' },
  { id: 'siege', name: 'Cerco', hint: 'Máquinas de cerco e a artilharia que as substitui' },
  { id: 'light', name: 'Guerra leve', hint: 'Rápidos e pouco blindados' },
  { id: 'medium', name: 'Guerra média', hint: 'A linha de batalha' },
  { id: 'heavy', name: 'Guerra pesada', hint: 'Colossos blindados' },
  { id: 'transform', name: 'Transformável', hint: 'Mudam de forma na ação: andam, mergulham, decolam' },
];
export const VSIZES: { id: VSize; name: string }[] = [{ id: 'small', name: 'Pequeno' }, { id: 'medium', name: 'Médio' }, { id: 'large', name: 'Grande' }];

export interface VType {
  id: string; domain: Domain; cls: VClass; sizes: VSize[];
  /** role name (the vehicle itself is named by its builder from its modules) */
  name: string;
  /** first and last era it exists in */
  eras: [number, number];
  blurb: string;
  /** label of the 'use' animation (none = the role has no action) */
  use?: string;
  /** pulled by beasts up to this era (the preview shows a placeholder animal at the hitch) */
  beastUntil?: number;
  build: (x: VCtx) => void;
}
const ALL: VSize[] = ['small', 'medium', 'large'];

export const VTYPES: VType[] = [
  // ------------------------------------------------------------------ land
  { id: 'cargo', domain: 'land', cls: 'civil', sizes: ALL, eras: [0, 7], beastUntil: 2, name: 'Transporte de carga', build: LAND.cargo,
    blurb: 'Travois, trenós e carroças (puxados por criaturas atreladas no jogo; o animal da prévia é só ilustrativo), depois caminhões de baú, tanque, caçamba, toras, contêineres ou cápsulas, com rodas, esteiras, pernas, esferas, parafusos ou colchão flutuante.' },
  { id: 'passenger', domain: 'land', cls: 'civil', sizes: ALL, eras: [1, 7], beastUntil: 2, name: 'Transporte de passageiros', build: LAND.passenger,
    blurb: 'Charretes, carruagens e diligências; depois carros, furgões, limusines e ônibus (articulados, de dois andares), andadores e aerocarros.' },
  { id: 'ballista', domain: 'land', cls: 'siege', sizes: ['small'], eras: [1, 7], use: 'Disparar', name: 'Cerco pequeno', build: SIEGE.ballista,
    blurb: 'Balista (escorpião, de carro, de repetição; de aço na era clássica). Da industrial em diante, metralhadora montada: giratória, refrigerada a água, pesada, lança-granadas, arma de trilho e repetidor de plasma. Disparo automático.' },
  { id: 'catapult', domain: 'land', cls: 'siege', sizes: ['medium'], eras: [1, 7], use: 'Disparar', name: 'Cerco médio', build: SIEGE.catapult,
    blurb: 'Catapulta (onagro, de balde, de tração) que vira canhão na era clássica (colubrina, falconete, morteiro); da industrial em diante, artilharia anticarro: canhão, míssil guiado, canhão sem recuo, lança de trilho e de plasma.' },
  { id: 'trebuchet', domain: 'land', cls: 'siege', sizes: ['large'], eras: [1, 7], use: 'Disparar', name: 'Cerco grande', build: SIEGE.trebuchet,
    blurb: 'Trabuco (fixo, articulado, de tração) que vira bombarda ou morteiro de cerco na era clássica; depois obuseiros, lança-foguetes múltiplos, canhões de massa e artilharia de plasma.' },
  { id: 'ram', domain: 'land', cls: 'siege', sizes: ['medium'], eras: [0, 3], use: 'Golpear', name: 'Aríete', build: SIEGE.ram,
    blurb: 'Um tronco balançado contra portões: pendurado num cavalete, coberto de couro, depois blindado e movido a vapor.' },
  { id: 'siegeTower', domain: 'land', cls: 'siege', sizes: ['large'], eras: [1, 2], use: 'Baixar ponte', name: 'Torre de cerco', build: SIEGE.siegeTower,
    blurb: 'Torre sobre rodas maciças; na ação a ponte cai sobre a muralha.' },
  { id: 'light', domain: 'land', cls: 'light', sizes: ALL, eras: [1, 7], use: 'Atirar', beastUntil: 2, name: 'Blindado leve', build: LAND.light,
    blurb: 'Carros de guerra com foices e carroças de guerra; depois carros blindados, batedores, lança-chamas e lança-mísseis, andadores e flutuantes, com metralhadora, canhão automático, laser, trilho ou plasma.' },
  { id: 'medium', domain: 'land', cls: 'medium', sizes: ALL, eras: [3, 7], use: 'Atirar', name: 'Tanque', build: LAND.medium,
    blurb: 'Casco (placa, cunha, cápsula, hexagonal, banheira, besouro) sobre esteiras, rodas, pernas, esferas, parafusos ou colchão flutuante, com uma torreta separada que gira sozinha (e para onde você mandar).' },
  { id: 'heavy', domain: 'land', cls: 'heavy', sizes: ['medium', 'large'], eras: [3, 7], use: 'Atirar', name: 'Tanque pesado', build: LAND.heavy,
    blurb: 'Tanques de losango com canhões nos flancos, tanques pesados com torretas secundárias ou casamatas laterais, colossos andadores e fortalezas flutuantes.' },
  { id: 'transformer', domain: 'land', cls: 'transform', sizes: ALL, eras: [5, 7], use: 'Transformar', name: 'Carro-robô', build: LAND.transformer,
    blurb: 'Um carro (ou caminhão) que se levanta sobre pernas, abre os braços e atira, e volta a ser carro.' },
  // ------------------------------------------------------------------ naval (twice the size)
  { id: 'shipCargo', domain: 'naval', cls: 'civil', sizes: ALL, eras: [0, 7], name: 'Navio de carga', build: NAVAL.cargo,
    blurb: 'Jangadas e barcos de junco, naus e juncos a vela, vapores de rodas, cargueiros, petroleiros, porta-contêineres, navios de velas-rotor e barcaças flutuantes.' },
  { id: 'shipPassenger', domain: 'naval', cls: 'civil', sizes: ALL, eras: [0, 7], name: 'Navio de passageiros', build: NAVAL.passenger,
    blurb: 'Canoas com flutuador, barcos de passageiros, vapores de rodas, transatlânticos, balsas, hidrofólios e catamarãs.' },
  { id: 'shipLight', domain: 'naval', cls: 'light', sizes: ALL, eras: [0, 7], use: 'Atirar', name: 'Navio de guerra leve', build: NAVAL.light,
    blurb: 'Canoas de guerra, drakkars e galés com aríete; canhoneiras, lanchas torpedeiras, corvetas, trimarãs furtivos e esquifes flutuantes.' },
  { id: 'shipMedium', domain: 'naval', cls: 'medium', sizes: ALL, eras: [1, 7], use: 'Atirar', name: 'Navio de guerra médio', build: NAVAL.medium,
    blurb: 'Cocas de guerra, fragatas, couraçados a vapor, cruzadores e destróieres, com torretas que giram sozinhas e células de mísseis.' },
  { id: 'shipHeavy', domain: 'naval', cls: 'heavy', sizes: ['medium', 'large'], eras: [2, 7], use: 'Atirar', name: 'Navio de guerra pesado', build: NAVAL.heavy,
    blurb: 'Naus de linha com três cobertas de canhões, dreadnoughts, encouraçados, porta-aviões, navios-arsenal e fortalezas flutuantes.' },
  { id: 'shipTransform', domain: 'naval', cls: 'transform', sizes: ALL, eras: [3, 7], use: 'Submergir', name: 'Submersível', build: NAVAL.transform,
    blurb: 'Mergulha e volta à superfície na ação; os futuristas mudam de forma e o espacial sai do mar e voa.' },
  // ------------------------------------------------------------------ air (from the industrial era)
  { id: 'airTransport', domain: 'air', cls: 'civil', sizes: ALL, eras: [3, 7], name: 'Transporte aéreo', build: AIR.transport,
    blurb: 'Balões, dirigíveis, hidroaviões, aviões de linha de hélice e a jato, táxis de ventoinhas, ornitópteros e naves.' },
  { id: 'airLight', domain: 'air', cls: 'light', sizes: ['small', 'medium'], eras: [3, 7], use: 'Atirar', name: 'Caça', build: AIR.light,
    blurb: 'Biplanos e triplanos, caças a hélice e a jato (delta, enflechado, asa invertida), drones e discos.' },
  { id: 'airMedium', domain: 'air', cls: 'medium', sizes: ALL, eras: [3, 7], use: 'Atirar', name: 'Aeronave de ataque', build: AIR.medium,
    blurb: 'Dirigíveis armados, bombardeiros médios, helicópteros de ataque, convertiplanos e canhoneiras flutuantes.' },
  { id: 'airHeavy', domain: 'air', cls: 'heavy', sizes: ['medium', 'large'], eras: [3, 7], use: 'Bombardear', name: 'Aeronave pesada', build: AIR.heavy,
    blurb: 'Zepelins de guerra, fortalezas voadoras, asas voadoras, porta-aviões voadores e fortalezas celestes.' },
  { id: 'airTransform', domain: 'air', cls: 'transform', sizes: ALL, eras: [4, 7], use: 'Transformar', name: 'Aeronave transformável', build: AIR.transform,
    blurb: 'Convertiplanos que giram os rotores e jatos que pousam e se desdobram em andadores.' },
];

export const vtypeById = (id: string) => VTYPES.find(t => t.id === id) ?? VTYPES[0];
export const available = (t: VType, era: number) => era >= t.eras[0] && era <= t.eras[1];
export const firstEra = (t: VType) => t.eras[0];
export const vtypesFor = (d: Domain, c: VClass) => VTYPES.filter(t => t.domain === d && t.cls === c);
/** tier scale: naval is always twice land/air; beast-drawn carts grow only a little */
export function tierZ(t: VType, size: VSize, era: number) {
  const i = size === 'small' ? 0 : size === 'medium' ? 1 : 2;
  if (t.beastUntil !== undefined && era <= t.beastUntil && t.cls === 'civil') return [1, 1.08, 1.16][i];
  const z = [1, 1.35, 1.8][i];
  return t.domain === 'naval' ? z * 2 : z;
}
