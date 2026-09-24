// Garments and armour. A creature is generated naked; a wear set is then fitted on its own body anchors (pelvis,
// chest, shoulders, elbows, hands, hips, knees, feet, head and their radii), so any set fits any species: stocky
// or lean, big-headed, digitigrade, four-armed, serpent-tailed. Styles go from everyday clothes to armour of every
// resource; pieces (head, torso, arms, hands, legs, feet, cloak) can be switched off one by one.
import type { Mat, Tex } from '../creature/raster';
import { ramp } from '../creature/raster';
import type { Genome } from '../creature/genome';
import { Stage } from '../creature/genome';
import type { Sketch, V3 } from '../creature/pose';
import { add, lerp3 } from '../creature/pose';
import { Body, Outfit, garment, skirt, band, cape, hood, outfit as civilOutfit } from '../creature/civ';
import type { MatClass } from './materials';

export type Piece = 'head' | 'torso' | 'arms' | 'hands' | 'legs' | 'feet' | 'cloak';
export const PIECES: { id: Piece; name: string }[] = [
  { id: 'head', name: 'Cabeça' }, { id: 'torso', name: 'Tronco' }, { id: 'arms', name: 'Braços' }, { id: 'hands', name: 'Mãos' },
  { id: 'legs', name: 'Pernas' }, { id: 'feet', name: 'Pés' }, { id: 'cloak', name: 'Capa' },
];
export interface WearCtx {
  g: Genome; e: number; r: number[]; variant: number; pieces: Set<Piece>;
  M: Mat; M2: Mat; T: Mat; W: Mat; G: Mat; dye: Mat; dye2: Mat; under: Mat; under2: Mat; dark: Mat;
}
export interface WearStyle { id: string; name: string; blurb: string; mats: MatClass[]; minEra?: number; build: (x: WearCtx) => Outfit }

type Helm = 'none' | 'cap' | 'conical' | 'kettle' | 'full' | 'skull' | 'fur' | 'coif' | 'combat' | 'visor' | 'bubble';
interface Look {
  torso: Mat; torsoPad?: number; skirt?: Mat; skirtLen?: number; bands?: Mat; nBands?: number; studs?: Mat;
  sleeve?: Mat; sleeveFull?: boolean; pants?: Mat; pauldron?: Mat; bracer?: Mat; greave?: Mat; glove?: Mat; boot?: Mat;
  helm: Helm; helmM?: Mat; plume?: Mat; horns?: boolean; gorget?: Mat; tabard?: Mat; glow?: Mat; pouches?: Mat; fur?: Mat; field?: Mat;
}

const gg = (B: Body) => B.rC / (0.4 * B.U);
const has = (x: WearCtx, p: Piece) => x.pieces.has(p);

function helmet(S: Sketch, B: Body, kind: Helm, m: Mat, x: WearCtx, L: Look, ph: number) {
  const H = B.H, R = B.R, b = { bias: 0.3 };
  const dome = (r = 0.86, y = 0.5) => S.ball(add(H, [-R * 0.15, R * y, 0]), R * r, m, b);
  const rim = (r = 0.92, mm = x.T) => band(S, add(H, [-R * 0.12, R * 0.22, 0]), R * r, R * 0.09, mm, { bias: 0.32 });
  switch (kind) {
    case 'cap': dome(); rim(); break;
    case 'conical':
      dome(); S.limb(add(H, [-R * 0.15, R * 0.95, 0]), add(H, [-R * 0.25, R * 1.6, 0]), R * 0.5, R * 0.06, m, { bias: 0.31 }); rim();
      S.limb(add(H, [R * 0.62, R * 0.3, 0]), add(H, [R * 0.82, -R * 0.2, 0]), R * 0.1, R * 0.07, m, { bias: 0.33 }); // nasal
      break;
    case 'kettle': dome(0.84, 0.55); band(S, add(H, [-R * 0.1, R * 0.28, 0]), R * 1.4, R * 0.08, m, { bias: 0.32 }); break;
    case 'full': // closed helm: drawn over the whole face (eyes, snout base) - the visor slit is all that shows
      S.ball(add(H, [0.02 * R, R * 0.12, 0]), R * 1.08, m, { bias: 1.2 });
      S.limb(add(H, [R * 0.98, R * 0.14, -R * 0.45]), add(H, [R * 0.98, R * 0.14, R * 0.45]), R * 0.08, R * 0.08, x.dark, { bias: 1.25 });
      for (let i = 0; i < 3; i++) S.ball(add(H, [R * 1.0, -R * (0.2 + i * 0.14), R * 0.25]), 0.6, x.dark, { bias: 1.25, noLine: true });
      band(S, add(H, [0, R * 0.55, 0]), R * 0.95, R * 0.07, x.T, { bias: 1.22 });
      break;
    case 'skull':
      dome(0.88, 0.5);
      for (let i = 0; i < 2; i++) S.ball(add(H, [R * 0.45, R * 0.55, (i ? 1 : -1) * R * 0.35]), R * 0.16, x.dark, { bias: 0.33, noLine: true });
      break;
    case 'fur': S.ball(add(H, [-R * 0.15, R * 0.55, 0]), R * 0.9, { ...m, fuzz: 0.9 }, b); band(S, add(H, [-R * 0.1, R * 0.3, 0]), R * 0.98, R * 0.16, { ...m, fuzz: 1 }, { bias: 0.32 }); break;
    case 'coif': hood(S, B, m); dome(0.82, 0.5); break;
    case 'combat':
      dome(0.9, 0.48); band(S, add(H, [-R * 0.1, R * 0.2, 0]), R * 1.02, R * 0.08, m, { bias: 0.32 });
      if (x.e >= 5) S.limb(add(H, [R * 0.5, R * 0.62, -R * 0.4]), add(H, [R * 0.5, R * 0.62, R * 0.4]), R * 0.14, R * 0.14, x.dark, { bias: 0.34 }); // goggles on the brow
      break;
    case 'visor':
      S.ball(add(H, [0, R * 0.12, 0]), R * 1.06, m, { bias: 1.2 });
      S.blob(add(H, [R * 0.72, R * 0.14, 0]), [0, 0, 1], R * 0.6, R * 0.22, L.glow ?? x.G, { bias: 1.25 }, R * 0.22);
      break;
    case 'bubble': S.ball(add(H, [0, R * 0.1, 0]), R * 1.35, { ...(L.field ?? x.G), alpha: 0.22, line: null }, { bias: 0.5 }); break;
    default: return;
  }
  const pb = kind === 'full' ? 1.3 : 0.35;
  if (L.plume && (kind === 'cap' || kind === 'full' || kind === 'conical' || kind === 'kettle')) {
    const t = add(H, [-R * 0.3, R * (kind === 'full' ? 1.1 : 1.3), 0]);
    S.limb(t, add(t, [-R * 0.9, R * 0.6 + Math.sin(ph) * 0.6, 0]), R * 0.2, R * 0.08, L.plume, { bias: pb });
  }
  if (L.horns) for (const s of [-1, 1]) S.limb(add(H, [-R * 0.1, R * 0.75, s * R * 0.7]), add(H, [R * 0.2, R * 1.4, s * R * 1.2]), R * 0.14, R * 0.03, x.W, { bias: 0.31 });
}

/** builds an Outfit from a look, honouring the switched-off pieces */
function dress(x: WearCtx, L: Look): Outfit {
  const U = (B: Body) => B.U;
  return {
    sleeve: has(x, 'arms') ? L.sleeve ?? x.under : x.under, sleevePad: 0.9, sleeveFull: L.sleeveFull ?? true,
    pants: has(x, 'legs') ? L.pants ?? x.under2 : x.under2, pantsPad: 0.7, pantsFull: true,
    boot: has(x, 'feet') ? L.boot : undefined, bootHigh: !!L.greave && has(x, 'legs'),
    glove: has(x, 'hands') ? L.glove : undefined,
    naga: has(x, 'legs') && (L.pants ?? L.torso) ? { ...(L.pants ?? L.torso) } : undefined,
    hidesHorns: has(x, 'head') && (L.helm === 'full' || L.helm === 'visor' || L.helm === 'coif'),
    behind: (S, B, ph) => { if (has(x, 'cloak')) cape(S, B, x.dye2, B.U * 1.15, ph, 1.05); },
    torso: (S, B) => {
      if (!has(x, 'torso')) { garment(S, B, x.under, 0.9, B.U * 0.4, 1.5); return; }
      garment(S, B, L.torso, L.torsoPad ?? 1.4, L.skirt ? 0 : B.U * 0.35, 1.5);
      if (L.skirt) skirt(S, B, L.skirt, 1.8, B.U * (L.skirtLen ?? 0.45), 2.5);
      if (L.bands) for (let i = 0; i < (L.nBands ?? 3); i++) { const t = 0.15 + (i / Math.max(1, (L.nBands ?? 3) - 1)) * 0.7; band(S, lerp3(B.P, B.C, t), (B.rP + (B.rC - B.rP) * t) + (L.torsoPad ?? 1.4) + 0.3, 0.9, L.bands, { bias: 0.09 + i * 0.001 }); }
      if (L.tabard) S.poly([add(B.C, [B.rC + 1.8, B.rC * 0.6, -B.rC * 0.5]), add(B.C, [B.rC + 1.8, B.rC * 0.6, B.rC * 0.5]), add(B.P, [B.rP + 2.4, -U(B) * 0.5, B.rP * 0.6]), add(B.P, [B.rP + 2.4, -U(B) * 0.5, -B.rP * 0.6])], L.tabard, { bias: 0.4, flat: 0.5 });
      if (L.studs) for (let i = 0; i < 3; i++) for (const z of [-0.45, 0, 0.45]) S.ball(add(lerp3(B.P, B.C, 0.3 + i * 0.25), [(B.rP + (B.rC - B.rP) * (0.3 + i * 0.25)) * 0.97 + 1.2, 0, z * B.rC]), 0.8, L.studs, { bias: 0.2, noLine: true });
      if (L.pouches) for (const z of [-0.5, 0, 0.5]) S.limb(add(B.C, [B.rC + 1.4, -B.U * 0.25, z * B.rC]), add(B.C, [B.rC + 1.4, -B.U * 0.08, z * B.rC]), B.U * 0.07, B.U * 0.07, L.pouches, { bias: 0.25 });
      if (L.fur) S.blob(add(B.C, [-B.rC * 0.1, B.rC * 0.75, 0]), [1, 0, 0], B.rC * 1.05, B.rC * 1.05, { ...L.fur, fuzz: 1.2 }, { bias: 0.15 }, B.rC * 0.4);
      if (L.gorget) band(S, add(B.C, [B.U * 0.05, B.rC * 0.85, 0]), B.rC * 0.62, B.rC * 0.22, L.gorget, { bias: 0.16 });
      if (L.glow) { S.limb(add(B.C, [B.rC * 0.98 + 1, B.rC * 0.4, 0]), add(B.P, [B.rP * 0.98 + 1, 0, 0]), 0.6, 0.6, L.glow, { bias: 0.3 }); }
      if (L.field) S.limb(B.P, B.C, B.rP + 3.5, B.rC + 3.5, { ...L.field, alpha: 0.18, line: null }, { bias: 0.6 });
    },
    front: (S, B) => {
      const g = gg(B);
      for (const a of B.arms) {
        if (L.pauldron && has(x, 'arms') && !a.lower) {
          S.ball(add(a.sh, [-B.U * 0.02, B.U * 0.06, a.s * B.U * 0.04]), B.U * 0.19 * g, L.pauldron, { bias: 0.12 });
          S.ball(add(a.sh, [0, -B.U * 0.08, a.s * B.U * 0.07]), B.U * 0.15 * g, L.pauldron, { bias: 0.121 });
        }
        if (L.bracer && has(x, 'arms')) S.limb(lerp3(a.el, a.hand, 0.2), lerp3(a.el, a.hand, 0.82), B.U * 0.12 * g * 0.85 + 1.6, B.U * 0.12 * g * 0.75 + 1.4, L.bracer, { bias: 0.045 });
      }
      if (L.greave && has(x, 'legs')) for (const l of B.legs) {
        S.ball(l.knee, B.U * 0.15 * g, L.greave, { bias: 0.05 });
        S.limb(lerp3(l.knee, l.ankle, 0.15), lerp3(l.knee, l.ankle, 0.92), B.U * 0.17 * g * 0.72 + 1.6, B.U * 0.17 * g * 0.6 + 1.2, L.greave, { bias: 0.045 });
      }
    },
    headFront: (S, B, ph) => { if (has(x, 'head')) helmet(S, B, L.helm, L.helmM ?? L.torso, x, L, ph); },
  };
}

const retex = (m: Mat, tex: Tex, extra: Partial<Mat> = {}): Mat => ({ ...m, tex, ...extra });
const choose = <T,>(u: number, arr: T[]) => arr[Math.floor(u * arr.length) % arr.length];

export const WEAR_STYLES: WearStyle[] = [
  { id: 'civil', name: 'Roupa civil da era', blurb: 'As roupas do dia a dia daquela era, na cultura da espécie (variante = outro cidadão).', mats: ['fiber', 'hide', 'synthetic', 'metal', 'wood', 'bone', 'stone', 'crystal', 'energy'],
    build: x => civilOutfit(x.g, (Stage.TRIBAL + x.e) as Stage, x.variant) },
  { id: 'simple', name: 'Roupa simples', blurb: 'Túnica, calça, capuz ou chapéu, feitos do material escolhido.', mats: ['fiber', 'hide', 'synthetic'],
    build: x => dress(x, { torso: x.M, skirt: x.r[0] < 0.4 ? x.M : undefined, skirtLen: 0.6, sleeve: x.M, sleeveFull: x.r[1] < 0.6, pants: x.M2, boot: x.W, helm: x.r[2] < 0.5 ? 'fur' : 'none', helmM: x.M, bands: x.W, nBands: 1 }) },
  { id: 'padded', name: 'Gambesão (acolchoado)', blurb: 'Armadura de tecido acolchoado em losangos.', mats: ['fiber'],
    build: x => { const q = retex(x.M, 'quilt'); return dress(x, { torso: q, torsoPad: 2.4, skirt: q, skirtLen: 0.55, sleeve: q, pants: x.under2, boot: x.W, glove: x.W, helm: x.r[0] < 0.5 ? 'coif' : 'cap', helmM: q, bands: x.W, nBands: 1 }); } },
  { id: 'hide', name: 'Armadura de peles', blurb: 'Peles com pelo, amarradas com tiras; gola e gorro de pele.', mats: ['hide'],
    build: x => { const f = retex(x.M, 'fur', { fuzz: 0.9 }); return dress(x, { torso: x.M, torsoPad: 2, skirt: f, skirtLen: 0.5, sleeve: x.M, sleeveFull: false, pants: x.M2, boot: f, glove: x.W, helm: x.r[0] < 0.6 ? 'fur' : 'skull', helmM: f, fur: f, bands: x.W, nBands: 2 }); } },
  { id: 'leather', name: 'Armadura de couro', blurb: 'Couro endurecido com tachas, ombreiras e braçadeiras.', mats: ['hide'],
    build: x => dress(x, { torso: x.M, torsoPad: 1.8, skirt: x.M2, skirtLen: 0.4, sleeve: x.under, pants: x.M2, pauldron: x.M, bracer: x.M, glove: x.M2, boot: x.M2, helm: x.r[0] < 0.5 ? 'cap' : 'none', helmM: x.M, studs: x.T, bands: x.W, nBands: 1 }) },
  { id: 'bone', name: 'Armadura de ossos', blurb: 'Placas e costelas de osso amarradas, máscara de crânio.', mats: ['bone'],
    build: x => dress(x, { torso: x.under, skirt: x.M, skirtLen: 0.35, bands: x.M, nBands: 5, sleeve: x.under, pants: x.under2, pauldron: x.M, bracer: x.M, boot: x.W, helm: 'skull', helmM: x.M, horns: x.r[0] < 0.5 }) },
  { id: 'lamellar', name: 'Armadura de lamelas', blurb: 'Lamelas de madeira ou bambu atadas em fileiras.', mats: ['wood'],
    build: x => { const l = retex(x.M, 'plank', { texScale: 0.8 }); return dress(x, { torso: l, torsoPad: 2, skirt: l, skirtLen: 0.55, bands: x.W, nBands: 4, sleeve: x.under, pants: x.under2, pauldron: l, bracer: l, boot: x.W, helm: 'kettle', helmM: l }); } },
  { id: 'mail', name: 'Cota de malha', blurb: 'Anéis de metal entrelaçados; capuz de malha e sobreveste com as cores da cultura.', mats: ['metal'], minEra: 1,
    build: x => { const m = retex(x.M, 'mail', { spec: 0.6 }); return dress(x, { torso: m, skirt: m, skirtLen: 0.6, sleeve: m, pants: m, glove: x.W, boot: x.W, helm: x.r[0] < 0.5 ? 'coif' : 'conical', helmM: x.r[0] < 0.5 ? m : x.M, tabard: x.r[1] < 0.6 ? x.dye : undefined, bands: x.W, nBands: 1, plume: x.r[2] < 0.3 ? x.dye2 : undefined }); } },
  { id: 'scale', name: 'Armadura de escamas', blurb: 'Escamas sobrepostas do material (metal, osso, cristal ou couro).', mats: ['metal', 'bone', 'crystal', 'hide'],
    build: x => { const s = retex(x.M, 'scales', { texScale: 0.9 }); return dress(x, { torso: s, torsoPad: 1.8, skirt: s, skirtLen: 0.5, sleeve: x.r[0] < 0.5 ? s : x.under, sleeveFull: false, pants: x.under2, pauldron: s, bracer: x.M, boot: x.W, helm: choose(x.r[1], ['cap', 'conical', 'kettle'] as Helm[]), helmM: x.M, plume: x.r[2] < 0.4 ? x.dye : undefined }); } },
  { id: 'plate', name: 'Armadura de placas', blurb: 'Peitoral, ombreiras, braçadeiras, grevas e manoplas.', mats: ['metal', 'crystal', 'stone'], minEra: 1,
    build: x => dress(x, { torso: x.M, torsoPad: 2.2, skirt: x.M2, skirtLen: 0.4, bands: x.M2, nBands: 2, sleeve: retex(x.M, 'mail', { spec: 0.6 }), pants: retex(x.M, 'mail', { spec: 0.6 }), pauldron: x.M, bracer: x.M, greave: x.M, glove: x.M, boot: x.M, helm: choose(x.r[0], ['full', 'full', 'kettle', 'conical'] as Helm[]), helmM: x.M, gorget: x.M, plume: x.r[1] < 0.5 ? x.dye : undefined, tabard: x.r[2] < 0.25 ? x.dye : undefined }) },
  { id: 'tactical', name: 'Colete tático', blurb: 'Colete balístico com bolsos, capacete e joelheiras sobre roupa de campo.', mats: ['synthetic', 'metal'], minEra: 4,
    build: x => dress(x, { torso: x.M, torsoPad: 2.2, sleeve: x.under, pants: x.under2, pouches: x.M2, greave: x.r[0] < 0.6 ? x.dark : undefined, glove: x.dark, boot: x.dark, helm: 'combat', helmM: x.M, bands: x.dark, nBands: 1 }) },
  { id: 'exo', name: 'Exoarmadura', blurb: 'Armadura motorizada de placas lisas com linhas de energia e viseira.', mats: ['synthetic', 'metal'], minEra: 6,
    build: x => dress(x, { torso: x.M, torsoPad: 2.4, skirt: x.M2, skirtLen: 0.3, sleeve: x.M2, pants: x.M2, pauldron: x.M, bracer: x.M, greave: x.M, glove: x.M, boot: x.M, helm: 'visor', helmM: x.M, glow: x.G, gorget: x.M2 }) },
  { id: 'field', name: 'Traje de campo de força', blurb: 'Macacão justo e um campo de energia envolvendo o corpo e a cabeça.', mats: ['energy', 'synthetic'], minEra: 7,
    build: x => dress(x, { torso: x.M2, torsoPad: 0.8, sleeve: x.M2, pants: x.M2, glove: x.M2, boot: x.M2, helm: 'bubble', glow: x.G, field: x.G }) },
];
export const wearById = (id: string) => WEAR_STYLES.find(w => w.id === id) ?? WEAR_STYLES[0];
export const underMat = (h: number, s: number, l: number): Mat => ({ ramp: ramp(h, s, l), tex: 'cloth' });
void (null as unknown as V3);
