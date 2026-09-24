// The catalogue of vehicle types: domain (land / naval / air), class, the size tiers it comes in and its name in
// each era ('' = the type does not exist yet in that era: no tanks in the tribal age, no aircraft before the
// industrial one). New types = one builder + one entry here.
import type { VCtx } from './vparts';
import { LAND } from './land';
import { NAVAL } from './naval';
import { AIR } from './air';

export type Domain = 'land' | 'naval' | 'air';
export type VClass = 'civil' | 'siege' | 'light' | 'medium' | 'heavy' | 'transform';
export type VSize = 'small' | 'medium' | 'large';

export const DOMAINS: { id: Domain; name: string; hint: string }[] = [
  { id: 'land', name: 'Terrestre', hint: 'Rodas, esteiras, pernas mecânicas e colchões flutuantes' },
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
  /** name per era (0 tribal .. 7 space); '' = not available in that era. Either a list or a function of era and size */
  names: string[] | ((era: number, size: VSize) => string);
  blurb: string;
  /** label of the 'use' animation (none = the type has no action) */
  use?: string;
  /** pulled by beasts in these eras (the preview shows a placeholder animal at the hitch) */
  beastUntil?: number;
  build: (x: VCtx) => void;
}

const bySize = (s: VSize, a: string, b: string, c: string) => (s === 'small' ? a : s === 'medium' ? b : c);

export const VTYPES: VType[] = [
  // ------------------------------------------------------------------ land
  {
    id: 'cart', domain: 'land', cls: 'civil', sizes: ['small', 'medium', 'large'], beastUntil: 2,
    names: (e, s) => [bySize(s, 'Travois', 'Travois', 'Trenó de arrasto'), bySize(s, 'Carroça', 'Carroção', 'Carroção coberto'), bySize(s, 'Carroça', 'Carroção', 'Carroção coberto'), 'Caminhão a vapor', 'Caminhão', 'Caminhão', 'Cargueiro autônomo', 'Cargueiro flutuante'][e],
    blurb: 'Transporte de carga. Nas eras antigas é puxado por animais atrelados durante o jogo (o animal da prévia é só ilustrativo); o porte muda pouco o tamanho, mas aumenta a carga.',
    build: LAND.cart,
  },
  {
    id: 'coach', domain: 'land', cls: 'civil', sizes: ['small', 'medium', 'large'], beastUntil: 2,
    names: (e, s) => ['', 'Carruagem', 'Diligência', 'Automóvel a vapor', s === 'large' ? 'Ônibus' : 'Automóvel', s === 'large' ? 'Ônibus' : 'Carro', s === 'large' ? 'Ônibus autônomo' : 'Carro autônomo', s === 'large' ? 'Aeroônibus' : 'Aerocarro'][e],
    blurb: 'Transporte de passageiros: carruagens puxadas por animais, depois carros e ônibus com rodas, pernas ou colchão flutuante.',
    build: LAND.coach,
  },
  {
    id: 'ballista', domain: 'land', cls: 'siege', sizes: ['small'], use: 'Disparar',
    names: ['', 'Balista', 'Balista', 'Canhão de campanha', 'Canhão de campanha', 'Canhão leve', 'Canhão de raios', 'Canhão de plasma'],
    blurb: 'Arma de cerco pequena: dispara virotes; da era industrial em diante vira canhão de campanha.',
    build: LAND.ballista,
  },
  {
    id: 'catapult', domain: 'land', cls: 'siege', sizes: ['medium'], use: 'Disparar',
    names: ['', 'Catapulta', 'Catapulta', 'Obuseiro', 'Obuseiro', 'Lança-foguetes', 'Lança-foguetes', 'Lança-foguetes'],
    blurb: 'O braço dispara contra a trave e arremessa a pedra; depois vira obuseiro e lança-foguetes.',
    build: LAND.catapult,
  },
  {
    id: 'trebuchet', domain: 'land', cls: 'siege', sizes: ['large'], use: 'Disparar',
    names: ['', 'Trabuco', 'Trabuco', 'Canhão de cerco', 'Canhão ferroviário', 'Canhão de cerco', 'Canhão de trilho', 'Canhão de plasma de cerco'],
    blurb: 'Veículo grande: o contrapeso cai, o braço gira e a funda solta a pedra. Depois, os canhões de cerco.',
    build: LAND.trebuchet,
  },
  {
    id: 'ram', domain: 'land', cls: 'siege', sizes: ['medium'], use: 'Golpear',
    names: ['Aríete', 'Aríete coberto', 'Aríete coberto', 'Aríete a vapor', '', '', '', ''],
    blurb: 'Um tronco balançado contra portões; coberto de couro nas eras medievais, movido a vapor na industrial.',
    build: LAND.ram,
  },
  {
    id: 'siegeTower', domain: 'land', cls: 'siege', sizes: ['large'], use: 'Baixar ponte',
    names: ['', 'Torre de cerco', 'Torre de cerco', '', '', '', '', ''],
    blurb: 'Torre sobre rodas maciças; na ação a ponte cai sobre a muralha.',
    build: LAND.siegeTower,
  },
  {
    id: 'chariot', domain: 'land', cls: 'light', sizes: ['small', 'medium', 'large'], use: 'Atirar', beastUntil: 2,
    names: ['', 'Carro de guerra', 'Carro de guerra', 'Carro blindado', 'Carro de reconhecimento', 'Blindado leve', 'Blindado de patrulha', 'Patrulheiro'],
    blurb: 'Rápido e leve: carro de guerra com foices nas rodas, depois blindados com torreta que gira sozinha.',
    build: LAND.chariot,
  },
  {
    id: 'tank', domain: 'land', cls: 'medium', sizes: ['small', 'medium', 'large'], use: 'Atirar',
    names: ['', '', '', 'Tanque primitivo', 'Tanque', 'Tanque de batalha', 'Blindado futurista', 'Andador de guerra'],
    blurb: 'Corpo com esteiras, colchão flutuante ou pernas e uma torreta separada que gira independente do corpo.',
    build: LAND.tank,
  },
  {
    id: 'heavy', domain: 'land', cls: 'heavy', sizes: ['medium', 'large'], use: 'Atirar',
    names: ['', '', '', 'Encouraçado terrestre', 'Tanque pesado', 'Tanque superpesado', 'Colosso futurista', 'Colosso estelar'],
    blurb: 'Colossos: canhões duplos, torretas de proa e metralhadoras com giro próprio; nas culturas exóticas, andadores de quatro pernas.',
    build: LAND.heavy,
  },
  {
    id: 'transformer', domain: 'land', cls: 'transform', sizes: ['small', 'medium', 'large'], use: 'Transformar',
    names: ['', '', '', '', '', 'Carro-robô', 'Carro-robô', 'Carro-robô'],
    blurb: 'Um carro que se levanta sobre pernas e vira andador armado.',
    build: LAND.transformer,
  },
  // ------------------------------------------------------------------ naval (twice the size)
  {
    id: 'boat', domain: 'naval', cls: 'civil', sizes: ['small', 'medium', 'large'],
    names: (e, s) => [
      bySize(s, 'Canoa', 'Canoa com flutuador', 'Jangada'), bySize(s, 'Barco a vela', 'Coca', 'Cargueiro de dois mastros'),
      bySize(s, 'Chalupa', 'Caravela', 'Nau mercante'), bySize(s, 'Lancha a vapor', 'Vapor de rodas', 'Navio a vapor'),
      bySize(s, 'Lancha', 'Cargueiro costeiro', 'Navio cargueiro'), bySize(s, 'Iate', 'Balsa', 'Porta-contêineres'),
      'Hidrofólio', 'Barcaça flutuante'][e],
    blurb: 'Barcos de carga e passageiros: velas que enchem com o vento, rodas de pás, chaminés, hidrofólios que sobem nas asas.',
    build: NAVAL.boat,
  },
  {
    id: 'warboat', domain: 'naval', cls: 'light', sizes: ['small', 'medium', 'large'], use: 'Atirar',
    names: ['Canoa de guerra', 'Drakkar', 'Galé', 'Canhoneira', 'Lancha torpedeira', 'Corveta de mísseis', 'Trimarã furtivo', 'Esquife flutuante'],
    blurb: 'Rápidos: remadores, escudos na amurada, aríete de proa; depois canhoneiras, corvetas e trimarãs furtivos.',
    build: NAVAL.warboat,
  },
  {
    id: 'warship', domain: 'naval', cls: 'medium', sizes: ['small', 'medium', 'large'], use: 'Atirar',
    names: ['', 'Coca de guerra', 'Fragata', 'Encouraçado a vapor', 'Cruzador', 'Destróier', 'Fragata-drone', 'Cruzador gravitacional'],
    blurb: 'Castelos com besta, bordadas de canhões, torretas que giram sozinhas e células de mísseis.',
    build: NAVAL.warship,
  },
  {
    id: 'capital', domain: 'naval', cls: 'heavy', sizes: ['medium', 'large'], use: 'Atirar',
    names: ['', '', 'Nau de linha', 'Dreadnought', 'Encouraçado', 'Porta-aviões', 'Navio-arsenal', 'Fortaleza flutuante'],
    blurb: 'Três cobertas de canhões, torres duplas, um porta-aviões que lança caças e fortalezas que pairam sobre o mar.',
    build: NAVAL.capital,
  },
  {
    id: 'submarine', domain: 'naval', cls: 'transform', sizes: ['small', 'medium', 'large'], use: 'Submergir',
    names: ['', '', '', 'Submarino', 'Submarino', 'Submarino nuclear', 'Submersível transformável', 'Nave anfíbia'],
    blurb: 'Mergulha e volta à superfície na ação; o futurista recolhe a vela e abre lemes, o espacial sai do mar e abre as asas.',
    build: NAVAL.submarine,
  },
  // ------------------------------------------------------------------ air (from the industrial era)
  {
    id: 'airliner', domain: 'air', cls: 'civil', sizes: ['small', 'medium', 'large'],
    names: (e, s) => ['', '', '', bySize(s, 'Balão', 'Dirigível', 'Dirigível de passageiros'), bySize(s, 'Monomotor', 'Bimotor de passageiros', 'Avião de linha'), bySize(s, 'Jato executivo', 'Jato de passageiros', 'Jato jumbo'), 'Táxi aéreo', 'Nave-disco'][e],
    blurb: 'Parado no chão; em movimento voa com a sombra no solo. Balões, dirigíveis, aviões, táxis de ventoinhas e discos.',
    build: AIR.airliner,
  },
  {
    id: 'fighter', domain: 'air', cls: 'light', sizes: ['small', 'medium'], use: 'Atirar',
    names: ['', '', '', 'Biplano', 'Caça a hélice', 'Caça a jato', 'Caça-drone', 'Interceptador-disco'],
    blurb: 'Caças: metralhadoras sincronizadas, mísseis que saem dos trilhos, lasers e plasma.',
    build: AIR.fighter,
  },
  {
    id: 'gunship', domain: 'air', cls: 'medium', sizes: ['small', 'medium', 'large'], use: 'Atirar',
    names: ['', '', '', 'Dirigível armado', 'Bombardeiro bimotor', 'Helicóptero de ataque', 'Convertiplano de ataque', 'Canhoneira flutuante'],
    blurb: 'Bombardeiros médios, helicópteros com foguetes e convertiplanos de ataque.',
    build: AIR.gunship,
  },
  {
    id: 'bomber', domain: 'air', cls: 'heavy', sizes: ['medium', 'large'], use: 'Bombardear',
    names: ['', '', '', 'Zepelim de guerra', 'Bombardeiro quadrimotor', 'Asa voadora', 'Porta-aviões voador', 'Fortaleza celeste'],
    blurb: 'Colossos do céu: zepelins, fortalezas voadoras, asas voadoras, porta-aviões sustentados por ventoinhas.',
    build: AIR.bomber,
  },
  {
    id: 'airTransformer', domain: 'air', cls: 'transform', sizes: ['small', 'medium', 'large'], use: 'Transformar',
    names: ['', '', '', '', 'Convertiplano', 'Jato-robô', 'Jato-robô', 'Jato-robô'],
    blurb: 'Convertiplano que gira os rotores; depois jatos que pousam e se desdobram em andadores (parado = andador, movendo = jato).',
    build: AIR.transformer,
  },
];

export const vtypeById = (id: string) => VTYPES.find(t => t.id === id) ?? VTYPES[0];
export const vtypeName = (t: VType, era: number, size: VSize) => (typeof t.names === 'function' ? t.names(era, size) : t.names[era]);
export const available = (t: VType, era: number, size: VSize = t.sizes[0]) => vtypeName(t, era, size) !== '';
export const firstEra = (t: VType) => { for (let e = 0; e < 8; e++) if (available(t, e)) return e; return 0; };
export const vtypesFor = (d: Domain, c: VClass) => VTYPES.filter(t => t.domain === d && t.cls === c);
/** tier scale: naval is always twice land/air; beast-drawn carts grow only a little */
export function tierZ(t: VType, size: VSize, era: number) {
  const i = size === 'small' ? 0 : size === 'medium' ? 1 : 2;
  if (t.beastUntil !== undefined && era <= t.beastUntil && t.cls === 'civil') return [1, 1.1, 1.2][i];
  const z = [1, 1.35, 1.8][i];
  return t.domain === 'naval' ? z * 2 : z;
}
