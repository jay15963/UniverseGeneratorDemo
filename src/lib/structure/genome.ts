// Procedural architecture: a culture's building language.
//
// Like the creature genome, a culture is a pure function of (seed, world parameters, colour mode):
// every random number is drawn up-front in a fixed order and then combined with the parameters, so
// sliders morph the same architecture instead of reshuffling it. The culture decides the *forms*
// (footprints, roofs, proportions, openings, ornament) and carries them through all eight eras; the
// era decides materials and technology. Earth-like only restricts the palette to natural/real
// materials - the forms are free (domes, pods, spires, stilts, mushrooms, hexagons...).
import { mulberry, seedToInt } from '../terrain/noise';
import { Stage, STAGES } from '../creature/genome';

export type ColorMode = 'earth' | 'alien';
export type WinShape = 'rect' | 'arch' | 'round' | 'slit' | 'hex' | 'tri' | 'band' | 'cross';
export type Category = 'residential' | 'industrial' | 'extraction' | 'commercial' | 'military';
export type Size = 'small' | 'medium' | 'large' | 'giant';

export const CATEGORIES: { id: Category; name: string; hint: string }[] = [
  { id: 'residential', name: 'Residencial', hint: 'Onde a população vive: de cabanas a arcologias.' },
  { id: 'industrial', name: 'Industrial', hint: 'Onde as coisas são fabricadas: ferramentas, tecidos, recursos refinados.' },
  { id: 'extraction', name: 'Extração', hint: 'Onde os recursos saem do mundo: fazendas, minas, poços, madeireiras.' },
  { id: 'commercial', name: 'Comercial', hint: 'Onde as coisas são vendidas e trocadas.' },
  { id: 'military', name: 'Militar', hint: 'Treinamento e defesa: quartéis, torres, muralhas, fortalezas.' },
];
export const SIZES: { id: Size; name: string; span: string }[] = [
  { id: 'small', name: 'Pequena', span: '≈ 1 lote' },
  { id: 'medium', name: 'Média', span: '≈ 2×2 lotes' },
  { id: 'large', name: 'Grande', span: '≈ 3×3 lotes' },
  { id: 'giant', name: 'Gigante', span: '≈ 5×5 lotes' },
];
/** the eight civilisation eras (the same ones the species go through) */
export const ERAS: Stage[] = [Stage.TRIBAL, Stage.MEDIEVAL, Stage.RENAISSANCE, Stage.INDUSTRIAL, Stage.MODERN, Stage.CONTEMPORARY, Stage.FUTURIST, Stage.SPACE];
export const eraMeta = (s: Stage) => STAGES.find(x => x.id === s)!;

export interface StructParams { gravity: number; temperature: number; water: number; exotic: number; wealth: number; star: number }
export const DEFAULT_SPARAMS: StructParams = { gravity: 0.35, temperature: 0.5, water: 0.5, exotic: 0.3, wealth: 0.5, star: 0.55 };

export type Plan = 'box' | 'round' | 'hex' | 'oct' | 'pod';
export type Roof = 'gable' | 'hip' | 'flat' | 'dome' | 'cone' | 'onion' | 'pyramid' | 'shed' | 'mushroom' | 'spire' | 'saddle' | 'terrace' | 'vault';

export interface Culture {
  seed: string; params: StructParams; mode: ColorMode;
  name: string;
  /** raw random numbers drawn up-front (materials and colours read them per era) */
  r: number[];
  plan: Plan; plan2: Plan; roof: Roof; roofRound: Roof;
  /** storey height in pixels */
  storey: number;
  /** 0 squat .. 1 soaring */
  tall: number;
  /** walls lean in (battered walls, tapering towers) */
  taper: number;
  overhang: number; roofPitch: number;
  stilts: boolean; plinth: boolean; buttress: boolean;
  win: WinShape; winEvery: number; winFrame: boolean;
  ornament: number; spikes: boolean; bands: boolean; finial: boolean;
  /** alien palette hues */
  hues: [number, number, number];
}

type W<T> = [T, number][];
function pick<T>(u: number, opts: W<T>): T {
  const tot = opts.reduce((s, o) => s + Math.max(0, o[1]), 0);
  let x = u * tot;
  for (const [v, w] of opts) { x -= Math.max(0, w); if (x <= 0) return v; }
  return opts[opts.length - 1][0];
}

const SYL = ['ka', 'tho', 'vel', 'ur', 'ish', 'mar', 'zen', 'ol', 'qua', 'dru', 'ne', 'sa', 'rum', 'bel', 'ix', 'ya', 'tor', 'lu', 'ae', 'gor', 'phi', 'nak', 'sel', 'mo', 'ri', 'thu', 'va', 'khe', 'om', 'ze'];
const END = ['i', 'an', 'esh', 'ic', 'ar', 'ul', 'eni', 'ok', 'ane', 'is'];

export function makeCulture(seed: string, p: StructParams, mode: ColorMode): Culture {
  const R = mulberry(seedToInt(seed + ':culture'));
  const r = Array.from({ length: 96 }, () => R());
  const cold = Math.max(0, 0.4 - p.temperature) / 0.4, hot = Math.max(0, p.temperature - 0.6) / 0.4;
  const dry = Math.max(0, 0.45 - p.water) / 0.45, wet = Math.max(0, p.water - 0.55) / 0.45;
  const ex = p.exotic, lowG = Math.max(0, 0.45 - p.gravity) / 0.45, highG = Math.max(0, p.gravity - 0.55) / 0.45;

  const plan = pick<Plan>(r[0], [['box', 3 - ex * 1.5], ['round', 1 + cold * 1.5 + wet * 0.8], ['hex', 0.4 + ex * 1.6], ['oct', 0.5 + ex * 0.8], ['pod', ex * 2.2]]);
  const plan2 = pick<Plan>(r[1], [['box', 2], ['round', 1.2], ['hex', ex], ['oct', 0.6], ['pod', ex * 1.2]]);
  const roof = pick<Roof>(r[2], [
    ['gable', 2 + cold * 1.5 + wet], ['hip', 1.3], ['flat', 0.6 + dry * 3 + hot], ['dome', 0.4 + dry * 1.2 + cold * 0.8 + ex], ['pyramid', 0.6 + ex * 0.5],
    ['shed', 0.7], ['mushroom', ex * 1.8 + wet * 0.4], ['spire', ex * 0.9 + lowG], ['saddle', 0.5 + wet * 1.2 + ex * 0.5], ['terrace', dry * 1.2 + ex * 0.4], ['vault', 0.4 + dry * 0.6],
    ['onion', 0.2 + ex * 0.9],
  ]);
  const roofRound = pick<Roof>(r[3], [['cone', 2 + wet + cold], ['dome', 1.5 + dry + ex], ['onion', 0.3 + ex], ['flat', 0.4 + dry], ['mushroom', ex * 1.5 + wet * 0.3], ['spire', 0.3 + lowG + ex * 0.5]]);
  const name = (SYL[Math.floor(r[4] * SYL.length)] + SYL[Math.floor(r[5] * SYL.length)] + (r[6] < 0.4 ? SYL[Math.floor(r[7] * SYL.length)] : '') + END[Math.floor(r[8] * END.length)]);
  const win = pick<WinShape>(r[9], [['rect', 3], ['arch', 1.5 + p.wealth], ['round', 0.8 + ex * 1.5], ['slit', 0.5 + cold + highG], ['hex', ex * 1.4], ['tri', ex * 0.8], ['band', 0.7], ['cross', 0.15 + ex * 0.3]]);
  const hue0 = r[10];
  return {
    seed, params: p, mode, name: name[0].toUpperCase() + name.slice(1),
    r, plan, plan2, roof, roofRound,
    storey: Math.round(15 - p.gravity * 4 + lowG * 3),
    tall: Math.min(1, Math.max(0, 0.5 + lowG * 0.5 - highG * 0.45 + (r[11] - 0.5) * 0.4)),
    taper: Math.max(0, highG * 0.22 + (r[12] < 0.3 ? r[13] * 0.18 : 0) + dry * 0.05),
    overhang: Math.max(0, 0.3 + wet * 0.8 + (r[14] - 0.5) * 0.6 - dry * 0.3),
    roofPitch: Math.max(0.25, Math.min(1.2, 0.55 + cold * 0.45 + wet * 0.25 - dry * 0.3 + (r[15] - 0.5) * 0.4)),
    stilts: r[16] < wet * 0.7 + ex * 0.15,
    plinth: r[17] < 0.3 + p.wealth * 0.3 + dry * 0.2,
    buttress: r[18] < highG * 0.8 + 0.1,
    win, winEvery: 7 + Math.round(r[19] * 6 - p.wealth * 2), winFrame: r[20] < 0.35 + p.wealth * 0.4,
    ornament: Math.min(1, p.wealth * 0.7 + r[21] * 0.4),
    spikes: r[22] < ex * 0.55, bands: r[23] < 0.5, finial: r[24] < 0.35 + ex * 0.3,
    hues: [hue0, (hue0 + 0.25 + r[25] * 0.5) % 1, (hue0 + 0.5 + (r[26] - 0.5) * 0.3) % 1],
  };
}

const WIN_PT: Record<WinShape, string> = { rect: 'retangulares', arch: 'em arco', round: 'redondas', slit: 'em fenda', hex: 'hexagonais', tri: 'triangulares', band: 'em faixa contínua', cross: 'em cruz' };
const ROOF_PT: Record<Roof, string> = { gable: 'duas águas', hip: 'quatro águas', flat: 'plano', dome: 'cúpula', cone: 'cônico', onion: 'bulboso', pyramid: 'piramidal', shed: 'uma água', mushroom: 'em cogumelo', spire: 'agulha', saddle: 'curvo (sela)', terrace: 'em terraços', vault: 'abobadado' };
const PLAN_PT: Record<Plan, string> = { box: 'retangular', round: 'circular', hex: 'hexagonal', oct: 'octogonal', pod: 'orgânica (casulos)' };

export function describeCulture(c: Culture): [string, string][] {
  return [
    ['Planta', `${PLAN_PT[c.plan]} / ${PLAN_PT[c.plan2]}`],
    ['Telhado', `${ROOF_PT[c.roof]} · torres ${ROOF_PT[c.roofRound]}`],
    ['Janelas', WIN_PT[c.win]],
    ['Proporção', c.tall > 0.66 ? 'esguia, vertical' : c.tall < 0.34 ? 'baixa e maciça' : 'equilibrada'],
    ['Paredes', c.taper > 0.12 ? 'inclinadas (taludadas)' : 'a prumo'],
    ['Fundação', c.stilts ? 'palafitas' : c.plinth ? 'embasamento elevado' : 'no chão'],
    ['Ornamento', c.ornament > 0.66 ? 'rico' : c.ornament > 0.33 ? 'moderado' : 'austero'],
  ];
}
