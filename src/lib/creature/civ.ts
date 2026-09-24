// Sapient stages. The species keeps its anatomy (head, covering, colours, pattern, tail, extra arms,
// digitigrade legs, wings); only posture, everyday clothes and small personal objects change with
// each era. Clothes are civilian on purpose - no armour, weapons, uniforms or work gear.
// Every era has several garments per slot and a citizen index picks one combination, so the same
// people can be shown as many different individuals.
import { Genome, Stage } from './genome';
import { Kit } from './kit';
import { Sketch, V3, add, ik3, lerp3, PO } from './pose';
import { drawHead, HeadInfo } from './head';
import { Mat, ramp, darkenRamp, Tex } from './raster';
import { mulberry, seedToInt } from '../terrain/noise';

const cloth = (h: number, s: number, l: number, tex: Tex = 'cloth', extra: Partial<Mat> = {}): Mat => ({ ramp: ramp(h, s, l), tex, ...extra });

export interface Body {
  U: number; P: V3; C: V3; rP: number; rC: number; H: V3; R: number; head?: HeadInfo;
  legs: { hip: V3; knee: V3; ankle: V3; foot: V3; s: number }[];
  arms: { sh: V3; el: V3; hand: V3; s: number; holds: boolean; lower: boolean }[];
  serpent: boolean;
}

export function buildCiv(S: Sketch, k: Kit, g: Genome, stage: Stage, ph: number, blink: boolean, citizen = 0) {
  const U = 24 * (0.9 + g.size * 0.2);
  const breathe = Math.sin(ph) * 0.4;
  const serpent = g.locomotion === 'serpent';
  const digit = g.legType === 'digitigrade' || g.legType === 'unguligrade' || g.legType === 'avian' || g.legType === 'insectoid';
  const legH = serpent ? U * 1.1 : U * 1.5 * (0.94 + (g.legLen - 0.9) * 0.15);
  const gg = Math.sqrt(g.girth);
  const P: V3 = [0, legH, 0];
  const C: V3 = [U * 0.05, legH + U * 0.95 * (0.94 + g.length * 0.06) + breathe, 0];
  const rP = U * 0.34 * gg, rC = U * 0.4 * gg;
  const R = U * 0.4 * (0.85 + g.headSize * 0.15);
  const H: V3 = [C[0] + U * 0.14, C[1] + U * 0.22 + R * 0.85 + breathe * 0.3, 0];
  const legs: Body['legs'] = [];
  if (!serpent) for (const s of [-1, 1]) {
    const hip: V3 = [P[0], P[1] - rP * 0.3, s * rP * 0.55];
    const foot: V3 = [s * U * 0.03, 0, s * rP * 0.62];
    const ankle: V3 = digit ? add(foot, [-U * 0.2, U * 0.34, 0]) : add(foot, [-U * 0.04, U * 0.12, 0]);
    const d = Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1], ankle[2] - hip[2]);
    legs.push({ hip, knee: ik3(hip, ankle, d * 0.515, d * 0.515, [1, 0, 0]), ankle, foot, s });
  }
  const arms: Body['arms'] = [];
  for (let pair = 0; pair < (g.locomotion === 'hexapod' || g.locomotion === 'octopod' ? 2 : 1); pair++) {
    const len = U * (0.62 - pair * 0.1);
    for (const s of [-1, 1]) {
      const sh: V3 = [C[0] - U * 0.02, C[1] - rC * 0.15 - pair * U * 0.42, s * rC * 0.95];
      const holds = s === 1 && pair === 0;
      const sw = Math.sin(ph + (s < 0 ? Math.PI : 0) + pair) * U * 0.04;
      const hand: V3 = holds ? add(sh, [U * 0.42, -U * 0.8, -U * 0.05]) : add(sh, [U * 0.06 + sw, -len * 1.72, s * U * 0.12]);
      arms.push({ sh, el: ik3(sh, hand, len, len * 0.95, [-1, -0.2, s * 0.3]), hand, s, holds, lower: pair > 0 });
    }
  }
  const B: Body = { U, P, C, rP, rC, H, R, legs, arms, serpent };
  const O = outfit(g, stage, citizen);

  // --- behind: capes, back bags, folded wings ---
  O.behind?.(S, B, ph);
  if (g.wings !== 'none') {
    const w = g.wings === 'insect' ? { ...k.membrane, alpha: 0.55 } : g.wings === 'feather' ? { ...k.body, tex: 'feathers' as const, belly: undefined } : { ...k.membrane };
    for (const s of [-1, 1]) S.poly([add(C, [-rC * 0.6, rC * 0.1, s * rC * 0.5]), add(C, [-U * 0.75, U * 0.2, s * rC * 0.9]), add(P, [-U * 0.6, -U * 0.45, s * rC * 0.8]), add(P, [-rC * 0.4, 0, s * rC * 0.4])], w, { flat: 0.4 });
  }
  // --- limbs, tail, torso ---
  for (const l of legs) leg(S, k, g, O, l, U, digit);
  if (!serpent && g.tail !== 'none' && g.tailLen > 0.3) {
    const tp = S.chain(add(P, [-rP * 0.6, -rP * 0.2, 0]), Math.PI, -0.9, 6, U * (0.3 + g.tailLen * 1.1), rP * 0.55, 1, i => [0.15 + Math.sin(ph - i * 0.6) * 0.05, 0], k.body, { g: 3 });
    if (g.tail === 'tuft' || g.tail === 'bushy') S.ball(tp[6], U * 0.17, k.tuft);
  }
  if (serpent) {
    const pts = S.chain(P, 0.3, -1.3, 10, U * 2.4 * g.length, rP * 1.05, 1.2, i => [i < 3 ? 0.42 : 0.05, i < 3 ? 0 : 0.42], O.naga ?? k.body, { g: 1 });
    void pts;
  }
  S.limb(P, C, rP, rC, k.body, { g: 1 });
  S.limb(add(C, [U * 0.06, 0, 0]), add(H, [-R * 0.2, -R * 0.55, 0]), rC * 0.42, rC * 0.38, k.body, { g: 1 });
  O.torso?.(S, B, ph);
  for (const a of arms) arm(S, k, g, O, a, U);
  // --- head ---
  O.headBack?.(S, B, ph);
  B.head = drawHead(S, k, g, H, R, { ph, blink, sapient: true, noHorns: O.hidesHorns, tilt: 0.12 });
  O.headFront?.(S, B, ph);
  const hold = arms.find(a => a.holds);
  if (hold) O.item?.(S, B, hold.hand, ph);
  O.front?.(S, B, ph);
}

function arm(S: Sketch, k: Kit, g: Genome, O: Outfit, a: Body['arms'][number], U: number) {
  const r1 = U * 0.12 * Math.sqrt(g.girth), r2 = r1 * 0.85;
  S.limb(a.sh, a.el, r1, r2, k.limb);
  S.limb(a.el, a.hand, r2, r2 * 0.85, k.limb);
  if (O.sleeve) {
    S.limb(a.sh, a.el, r1 + O.sleevePad, r2 + O.sleevePad, O.sleeve, { bias: 0.02 });
    if (O.sleeveFull) S.limb(a.el, lerp3(a.hand, a.el, 0.18), r2 + O.sleevePad, r2 + O.sleevePad * 0.8, O.sleeve, { bias: 0.02 });
    else if (O.sleeveMid) S.limb(a.el, lerp3(a.el, a.hand, 0.4), r2 + O.sleevePad, r2 + O.sleevePad * 0.8, O.sleeve, { bias: 0.02 });
  }
  if (O.puff) S.ball(lerp3(a.sh, a.el, 0.3), r1 * 1.8, O.puff, { bias: 0.03 });
  if (O.cuff && O.sleeveFull) S.blob(lerp3(a.hand, a.el, 0.2), [a.el[0] - a.hand[0], a.el[1] - a.hand[1], a.el[2] - a.hand[2]], 1, r2 + O.sleevePad + 0.8, O.cuff, { bias: 0.04 });
  S.ball(a.hand, U * 0.12, O.glove ?? k.limb, { bias: 0.05 });
  if (g.claws && !O.glove) S.limb(a.hand, add(a.hand, [U * 0.1, -U * 0.08, 0]), 0.5, 0.35, k.claw, { noLine: true, bias: 0.06 });
}

function leg(S: Sketch, k: Kit, g: Genome, O: Outfit, l: Body['legs'][number], U: number, digit: boolean) {
  const r1 = U * 0.17 * Math.sqrt(g.girth), r2 = r1 * 0.72;
  S.limb(l.hip, l.knee, r1, r2, k.limb);
  S.limb(l.knee, l.ankle, r2, r2 * 0.8, k.limb);
  S.limb(l.ankle, add(l.foot, [0, 1, 0]), r2 * 0.75, r2 * 0.6, k.limb);
  if (O.pants) {
    S.limb(l.hip, l.knee, r1 + O.pantsPad, r2 + O.pantsPad, O.pants, { bias: 0.02 });
    if (O.pantsFull) S.limb(l.knee, lerp3(l.ankle, l.knee, 0.08), r2 + O.pantsPad, r2 * 0.8 + O.pantsPad, O.pants, { bias: 0.02 });
  }
  if (O.boot) {
    S.limb(lerp3(l.ankle, l.knee, O.bootHigh ? 0.45 : 0.08), l.ankle, r2 * 0.85 + 0.8, r2 * 0.8 + 0.8, O.boot, { bias: 0.03 });
    S.limb(l.ankle, add(l.foot, [U * 0.13, r2 * 0.55, 0]), r2 * 0.8 + 0.6, r2 * 0.62 + 0.4, O.boot, { bias: 0.03 });
    if (O.bootTrim) S.blob(add(l.foot, [U * 0.02, 0.8, 0]), [1, 0, 0], U * 0.16, r2 * 0.7, O.bootTrim, { bias: 0.04 }, 0.8);
  } else {
    if (g.legType === 'unguligrade') S.limb(add(l.foot, [0, r2, 0]), add(l.foot, [1, 0.5, 0]), r2 * 0.7, r2 * 0.8, k.claw);
    else if (g.legType === 'avian') for (const [dx, dz] of [[1, 0], [0.8, 0.5], [0.8, -0.5]]) S.limb(add(l.foot, [0, 1, 0]), add(l.foot, [dx * U * 0.28, 0.3, dz * U * 0.15]), 0.7, 0.4, k.claw);
    else S.blob(add(l.foot, [U * 0.08, r2 * 0.5, 0]), [1, 0, 0], U * 0.16, r2 * 0.6, k.limb, {}, r2 * 0.5);
  }
  void digit;
}

// ---------------------------------------------------------------------------------------------------
// Wardrobe
// ---------------------------------------------------------------------------------------------------
interface Outfit {
  sleeve?: Mat; sleevePad: number; sleeveFull?: boolean; sleeveMid?: boolean; puff?: Mat; cuff?: Mat;
  pants?: Mat; pantsPad: number; pantsFull?: boolean;
  boot?: Mat; bootHigh?: boolean; bootTrim?: Mat; glove?: Mat; naga?: Mat; hidesHorns?: boolean;
  behind?: (S: Sketch, B: Body, ph: number) => void;
  torso?: (S: Sketch, B: Body, ph: number) => void;
  headBack?: (S: Sketch, B: Body, ph: number) => void;
  headFront?: (S: Sketch, B: Body, ph: number) => void;
  item?: (S: Sketch, B: Body, hand: V3, ph: number) => void;
  front?: (S: Sketch, B: Body, ph: number) => void;
}

// --- garment primitives -------------------------------------------------------------------------------
/** torso garment reaching `down` px below the pelvis, flaring by `flare` at the hem (tunic, dress, coat) */
function garment(S: Sketch, B: Body, m: Mat, pad: number, down: number, flare = 0, o: PO = {}) {
  S.limb(B.P, B.C, B.rP + pad, B.rC + pad, m, { g: 20, bias: 0.05, ...o });
  if (down > 0) {
    // the hem stops above the ankles; skirts flare but never swallow the feet
    const hemR = B.rP + pad + flare * 0.7;
    const d = Math.min(down, B.P[1] - hemR - B.U * 0.22);
    S.limb(add(B.P, [0, B.rP * 0.2, 0]), add(B.P, [-flare * 0.1, -d, 0]), B.rP + pad + 0.3, hemR, m, { g: 20, bias: 0.06, ...o });
  }
}
/** horizontal band around the body at height y (belts, sashes, collars, hat brims) */
function band(S: Sketch, c: V3, r: number, thick: number, m: Mat, o: PO = {}) { S.blob(c, [1, 0, 0], r, r, m, { bias: 0.08, ...o }, thick); }
function necklace(S: Sketch, B: Body, m: Mat, n: number, big = 1) {
  for (let i = 0; i < n; i++) {
    const a = -1.1 + (i / (n - 1)) * 2.2;
    S.ball(add(B.C, [Math.cos(a) * B.rC * 0.72 + B.U * 0.04, B.rC * 0.15 - Math.cos(a) * B.U * 0.08, Math.sin(a) * B.rC * 0.72]), 0.9 * big, m, { bias: 0.12, noLine: n > 7 });
  }
}
function cape(S: Sketch, B: Body, m: Mat, down: number, ph: number, width = 1) {
  const fl = Math.sin(ph) * B.U * 0.05;
  for (const s of [-1, 1]) S.poly([add(B.C, [-B.rC * 0.3, B.rC * 0.2, s * B.rC * 0.9 * width]), add(B.C, [-B.rC * 0.75, B.rC * 0.1, 0]), add(B.P, [-B.U * 0.45 - fl, -down, 0]), add(B.P, [-B.U * 0.3 - fl, -down, s * B.rC * 1.3 * width])], m, { flat: 0.3, bias: -0.5 });
}
function hood(S: Sketch, B: Body, m: Mat) { S.ball(add(B.H, [-B.R * 0.45, B.R * 0.05, 0]), B.R * 1.12, m, { bias: -B.R * 0.8 }); }
function brimHat(S: Sketch, B: Body, brim: Mat, crown: Mat, brimR: number, crownH: number, crownR: number, bandM?: Mat, tilt = 0) {
  const t = add(B.H, [-B.R * 0.1, B.R * 0.72, 0]);
  band(S, t, B.R * brimR, B.R * 0.12, brim, { bias: 0.3 });
  S.limb(add(t, [0, B.R * 0.05, 0]), add(t, [tilt, crownH, 0]), B.R * crownR, B.R * crownR * 0.92, crown, { bias: 0.32 });
  if (bandM) band(S, add(t, [0, B.R * 0.18, 0]), B.R * crownR + 0.5, 1.1, bandM, { bias: 0.34 });
}
function cap(S: Sketch, B: Body, m: Mat, visor?: Mat) {
  S.ball(add(B.H, [-B.R * 0.15, B.R * 0.55, 0]), B.R * 0.78, m, { bias: 0.3 });
  if (visor) S.blob(add(B.H, [B.R * 0.55, B.R * 0.55, 0]), [1, 0, 0], B.R * 0.5, B.R * 0.55, visor, { bias: 0.32 }, B.R * 0.1);
}

// --- per-era tables -------------------------------------------------------------------------------------
type Rng = () => number;
const choose = <T,>(r: Rng, list: T[]): T => list[Math.floor(r() * list.length)];

function outfit(g: Genome, stage: Stage, citizen: number): Outfit {
  const r: Rng = mulberry(seedToInt(`${g.seed}:${stage}:${citizen}`));
  const c = g.culture;
  const dye = (h: number, s = c.sat, l = 0.42, tex: Tex = 'cloth', extra: Partial<Mat> = {}) => cloth(h, s, l, tex, extra);
  const culture = [c.hue, c.hue2, c.hue3];
  const hueOf = () => (choose(r, culture) + (r() - 0.5) * 0.08 + 1) % 1;
  const linen = cloth(0.11, 0.16, 0.84), black = cloth(0.66, 0.12, 0.15), leather = cloth(0.07, 0.45, 0.3, 'leather');
  const metal: Mat = { ramp: ramp(c.metal.h, c.metal.s, c.metal.l), tex: 'metal', spec: 1 };
  const wood: Mat = { ramp: ramp(0.07, 0.45, 0.36), tex: 'wood' };
  const glow = (h = g.glowHue): Mat => ({ ramp: ramp(h, 0.95, 0.6), tex: 'glow', emit: true, line: null });
  const paper = cloth(0.12, 0.15, 0.88, 'smooth');

  switch (stage) {
    case Stage.TRIBAL: {
      const hide = { ...cloth(0.07 + r() * 0.04, 0.35 + r() * 0.15, 0.32 + r() * 0.12, 'fur'), fuzz: 0.8 };
      const woven = dye(choose(r, [0.08, 0.02, 0.6, 0.12]), 0.45, 0.45, 'knit');
      const paint: Mat = { ramp: ramp(choose(r, [0.0, 0.58, 0.1, 0.33]), 0.7, 0.5), tex: 'smooth', line: null };
      const beads: Mat = { ramp: ramp(hueOf(), 0.7, 0.55), tex: 'smooth', spec: 0.5 };
      const top = choose(r, ['none', 'shawl', 'poncho', 'wrap']), bottom = choose(r, ['loincloth', 'skirt', 'wrapskirt']);
      const head = choose(r, ['none', 'feather', 'headband', 'crown']), item = choose(r, ['basket', 'gourd', 'stick', 'none', 'fruit']);
      return {
        sleevePad: 0, pantsPad: 0,
        behind: (S, B) => { if (item === 'basket' && r() < 0.3) S.ball(add(B.C, [-B.rC * 1.1, -B.U * 0.1, 0]), B.U * 0.3, { ...wood, tex: 'knit' }, { bias: -1 }); },
        torso: (S, B) => {
          const len = bottom === 'loincloth' ? B.U * 0.35 : B.U * 0.7;
          S.limb(add(B.P, [0, B.rP * 0.3, 0]), add(B.P, [0, -len, 0]), B.rP + 0.9, B.rP + (bottom === 'skirt' ? 3 : 1.5), bottom === 'wrapskirt' ? woven : hide, { g: 20, bias: 0.06 });
          band(S, add(B.P, [0, B.rP * 0.3, 0]), B.rP + 1.4, 1, leather);
          if (top === 'shawl') S.blob(add(B.C, [0, B.rC * 0.2, 0]), [1, 0, 0], B.rC * 1.15, B.rC * 1.15, hide, { bias: 0.1 }, B.rC * 0.55);
          if (top === 'poncho') S.limb(add(B.C, [0, B.rC * 0.4, 0]), add(B.C, [0, -B.U * 0.55, 0]), B.rC * 0.7, B.rC + 3, woven, { bias: 0.1 });
          if (top === 'wrap') S.limb(add(B.C, [0, B.rC * 0.1, 0]), add(B.P, [0, B.U * 0.1, 0]), B.rC + 0.8, B.rP + 0.8, woven, { g: 20, bias: 0.05 });
          necklace(S, B, beads, 7, 1.1);
          S.disc(add(B.C, [B.rC * 0.9, -B.U * 0.2, B.rC * 0.4]), 1.5, 0.7, 0.3, paint, { bias: 0.2 });
        },
        headFront: (S, B, ph) => {
          const t = add(B.H, [-B.R * 0.1, B.R * 0.72, 0]);
          S.disc(add(B.H, [B.R * 0.55, -B.R * 0.1, 0]), 1.8, 0.6, 0.2, paint, { bias: 0.5 });
          if (head === 'feather') S.limb(add(t, [-B.R * 0.4, 0, 0]), add(t, [-B.R * 1.0, B.R * 1.1 + Math.sin(ph) * 0.8, 0]), 1.3, 0.6, dye(hueOf(), 0.7, 0.5, 'feathers'), { bias: 0.3 });
          if (head === 'headband') band(S, add(B.H, [0, B.R * 0.45, 0]), B.R * 0.95, 1.1, beads, { bias: 0.35 });
          if (head === 'crown') for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; S.limb(add(t, [Math.cos(a) * B.R * 0.5, -B.R * 0.1, Math.sin(a) * B.R * 0.6]), add(t, [Math.cos(a) * B.R * 0.7, B.R * 0.8, Math.sin(a) * B.R * 0.9]), 1.1, 0.5, dye(hueOf(), 0.7, 0.55, 'feathers'), { bias: 0.25 }); }
        },
        item: (S, B, h) => {
          const U = B.U;
          if (item === 'basket') { S.limb(add(h, [0, -U * 0.05, 0]), add(h, [0, -U * 0.35, 0]), U * 0.18, U * 0.22, { ...wood, tex: 'knit' }); S.ball(add(h, [0, -U * 0.02, 0]), U * 0.1, dye(0.0, 0.6, 0.45, 'smooth'), { bias: 0.1 }); }
          if (item === 'gourd') { S.ball(add(h, [0, -U * 0.2, 0]), U * 0.16, dye(0.12, 0.5, 0.5, 'smooth')); S.ball(add(h, [0, -U * 0.02, 0]), U * 0.09, dye(0.12, 0.5, 0.5, 'smooth')); }
          if (item === 'stick') S.limb(add(h, [-U * 0.05, -U * 1.0, 0]), add(h, [U * 0.08, U * 0.6, 0]), 1.2, 1, wood);
          if (item === 'fruit') S.ball(add(h, [U * 0.05, U * 0.05, 0]), U * 0.11, dye(choose(r, [0.0, 0.08, 0.3]), 0.7, 0.5, 'smooth'), { bias: 0.2 });
        },
      };
    }
    case Stage.MEDIEVAL: {
      const muted = [0.0, 0.6, 0.1, 0.3, 0.07, 0.95];
      const wool = dye(choose(r, muted), 0.32, 0.4, 'wool'), wool2 = dye(choose(r, muted), 0.28, 0.32, 'wool');
      const style = choose(r, ['tunic', 'gown', 'robe', 'kirtle']);
      const head = choose(r, ['hood', 'coif', 'straw', 'chaperon', 'none']), item = choose(r, ['basket', 'bread', 'lantern', 'book', 'none', 'jug']);
      const apron = r() < 0.35, cloak = r() < 0.45;
      const long = style !== 'tunic';
      return {
        sleeve: wool, sleevePad: 1, sleeveFull: true, pants: long ? undefined : wool2, pantsPad: 0.8, pantsFull: true, boot: leather, bootHigh: r() < 0.5,
        behind: (S, B, ph) => { if (cloak) cape(S, B, wool2, B.U * 1.3, ph); },
        torso: (S, B) => {
          garment(S, B, wool, 1.2, long ? B.U * 1.35 : B.U * 0.55, long ? (style === 'gown' ? 5 : 3) : 2);
          band(S, add(B.P, [0, B.rP * 0.25, 0]), B.rP + 1.6, 1.1, style === 'robe' ? dye(c.hue2, 0.4, 0.5, 'knit') : leather);
          if (apron) S.poly([add(B.P, [B.rP + 1.5, B.rP * 0.2, -B.rP * 0.7]), add(B.P, [B.rP + 1.5, B.rP * 0.2, B.rP * 0.7]), add(B.P, [B.rP + 2.5, -B.U * (long ? 1.1 : 0.5), B.rP * 0.8]), add(B.P, [B.rP + 2.5, -B.U * (long ? 1.1 : 0.5), -B.rP * 0.8])], linen, { bias: 0.4 });
          if (r() < 0.5) S.ball(add(B.P, [B.rP * 0.3, 0, B.rP + 1.5]), B.U * 0.1, leather, { bias: 0.3 });   // belt pouch
        },
        headBack: (S, B) => { if (head === 'hood') hood(S, B, wool2); },
        headFront: (S, B) => {
          if (head === 'coif') S.ball(add(B.H, [-B.R * 0.25, B.R * 0.35, 0]), B.R * 0.85, linen, { bias: 0.25 });
          if (head === 'straw') brimHat(S, B, dye(0.12, 0.5, 0.6, 'knit'), dye(0.12, 0.5, 0.6, 'knit'), 1.6, B.R * 0.35, 0.6);
          if (head === 'chaperon') { S.ball(add(B.H, [-B.R * 0.1, B.R * 0.7, 0]), B.R * 0.75, wool2, { bias: 0.3 }); S.limb(add(B.H, [-B.R * 0.5, B.R * 0.8, 0]), add(B.H, [-B.R * 1.3, B.R * 0.1, 0]), B.R * 0.25, B.R * 0.15, wool2, { bias: 0.28 }); }
        },
        item: (S, B, h) => medievalItem(S, B, h, item, { wood, leather, linen, metal, paper, glow: glow(0.12) }),
        hidesHorns: head === 'hood' || head === 'coif',
      };
    }
    case Stage.RENAISSANCE: {
      const rich = [0.98, 0.35, 0.62, 0.75, 0.08];
      const velvet = dye(choose(r, rich), 0.6, 0.3, 'silk', { spec: 0.15 }), velvet2 = dye(choose(r, rich), 0.55, 0.45, 'silk');
      const gold: Mat = { ramp: ramp(0.12, 0.7, 0.55), tex: 'metal', spec: 0.9 };
      const style = choose(r, ['doublet', 'gown', 'cloak']);
      const head = choose(r, ['beret', 'feathered', 'veil', 'none']), item = choose(r, ['book', 'fan', 'flower', 'letter', 'none']);
      const ruff = r() < 0.65;
      const slash = (x: number) => Math.sin(x * 1.3) > 0.4;
      return {
        sleeve: velvet, sleevePad: 0.8, sleeveFull: true, puff: style === 'doublet' || r() < 0.4 ? { ...velvet, alt: velvet2.ramp, pattern: x => slash(x) } : undefined, cuff: linen,
        pants: style === 'gown' ? undefined : velvet2, pantsPad: 0.4, pantsFull: true, boot: black,
        behind: (S, B, ph) => { if (style === 'cloak') cape(S, B, velvet2, B.U * 0.9, ph, 1.1); },
        torso: (S, B) => {
          garment(S, B, { ...velvet, alt: gold.ramp, pattern: (x, y) => ((x + y * 2) % 9) === 0 }, 1.4, style === 'gown' ? B.U * 1.45 : 0, style === 'gown' ? 7 : 0);
          if (style !== 'gown') S.ball(add(B.P, [0, -B.U * 0.12, 0]), B.rP * 1.5, { ...velvet, alt: velvet2.ramp, pattern: x => slash(x) }, { bias: 0.06 });
          band(S, add(B.P, [0, B.rP * 0.4, 0]), B.rP + 1.7, 1, gold);
          if (r() < 0.5) necklace(S, B, gold, 9, 0.8);
        },
        headBack: (S, B) => { if (ruff) band(S, add(B.C, [B.U * 0.08, B.U * 0.2, 0]), B.rC * 0.95, B.U * 0.12, { ...linen, tex: 'fur', fuzz: 0.5 }, { bias: 0.15 }); if (head === 'veil') hood(S, B, { ...linen, alpha: 0.85 }); },
        headFront: (S, B, ph) => {
          if (head === 'beret' || head === 'feathered') {
            S.blob(add(B.H, [-B.R * 0.2, B.R * 0.78, 0]), [1, 0, 0], B.R * 1.1, B.R * 1.0, velvet, { bias: 0.3 }, B.R * 0.3);
            if (head === 'feathered') S.chain(add(B.H, [-B.R * 0.8, B.R * 0.9, 0]), Math.PI, 0.9, 5, B.R * 1.6, 1.4, 0.5, i => [-0.25 + Math.sin(ph - i) * 0.04, 0], { ...linen, tex: 'feathers' }, { bias: 0.32 });
          }
        },
        item: (S, B, h) => {
          const U = B.U;
          if (item === 'book') S.blob(add(h, [U * 0.05, 0, 0]), [0, 1, 0], U * 0.22, U * 0.16, dye(choose(r, rich), 0.5, 0.35, 'leather'), { bias: 0.1 }, U * 0.08);
          if (item === 'fan') S.poly([h, add(h, [U * 0.35, U * 0.35, -U * 0.2]), add(h, [U * 0.45, U * 0.05, 0]), add(h, [U * 0.35, -U * 0.25, U * 0.2])], dye(c.hue3, 0.5, 0.7, 'silk'), { bias: 0.1 });
          if (item === 'flower') { S.limb(h, add(h, [U * 0.1, U * 0.45, 0]), 0.5, 0.5, dye(0.3, 0.5, 0.35, 'smooth')); S.ball(add(h, [U * 0.1, U * 0.5, 0]), U * 0.08, dye(0.95, 0.7, 0.55, 'smooth'), { bias: 0.1 }); }
          if (item === 'letter') S.poly2(h, [-1, -4, 3, -4, 3, 1, -1, 1], paper, { bias: 0.1 });
        },
        hidesHorns: head === 'veil',
      };
    }
    case Stage.INDUSTRIAL: {
      const dark = [0.66, 0.62, 0.08, 0.35, 0.0];
      const coat = dye(choose(r, dark), 0.25, 0.2, 'wool'), vest = dye(choose(r, [0.95, 0.35, 0.75, 0.1]), 0.5, 0.38, 'silk');
      const style = choose(r, ['frock', 'dress', 'worker', 'shawl']);
      const head = choose(r, style === 'dress' || style === 'shawl' ? ['bonnet', 'none', 'bonnet'] : ['tophat', 'bowler', 'flatcap', 'none']);
      const item = choose(r, ['umbrella', 'watch', 'newspaper', 'cane', 'none', 'parcel']);
      const trousers: Mat = { ramp: ramp(0.62, 0.06, 0.34), tex: 'wool', alt: ramp(0.62, 0.05, 0.46), pattern: r() < 0.5 ? (x => x % 3 === 0) : null };
      const skirt = style === 'dress' || style === 'shawl';
      return {
        sleeve: style === 'worker' ? linen : style === 'dress' ? vest : coat, sleevePad: 1, sleeveFull: style !== 'worker', sleeveMid: style === 'worker',
        pants: skirt ? undefined : trousers, pantsPad: 0.6, pantsFull: true, boot: { ...black, spec: 0.6 },
        glove: r() < 0.3 && style !== 'worker' ? cloth(0.1, 0.08, 0.86) : undefined,
        behind: (S, B, ph) => {
          if (style === 'frock') { for (const s of [-1, 1]) S.poly([add(B.P, [-B.rP * 0.6, B.rP * 0.2, s * B.rP * 0.2]), add(B.P, [-B.rP - 1, B.rP * 0.2, s * B.rP]), add(B.P, [-B.U * 0.35 - Math.sin(ph) * 0.8, -B.U * 0.95, s * B.rP * 0.8]), add(B.P, [-B.U * 0.15, -B.U * 0.95, s * B.rP * 0.2])], coat, { bias: -0.5 }); }
          if (style === 'dress') S.ball(add(B.P, [-B.rP * 1.1, -B.U * 0.15, 0]), B.rP * 1.05, vest, { bias: -0.3 }); // bustle
        },
        torso: (S, B) => {
          if (style === 'frock') { garment(S, B, coat, 1.4, B.U * 0.12); S.limb(add(B.P, [B.rP * 0.5, 0, 0]), add(B.C, [B.rC * 0.55, 0, 0]), B.rP * 0.55, B.rC * 0.5, vest, { bias: 0.08 }); }
          if (style === 'dress') garment(S, B, vest, 1.2, B.U * 1.5, 6);
          if (style === 'shawl') { garment(S, B, dye(c.hue3, 0.35, 0.4, 'wool'), 1.2, B.U * 1.45, 5); S.blob(add(B.C, [0, B.rC * 0.1, 0]), [1, 0, 0], B.rC * 1.2, B.rC * 1.2, dye(c.hue2, 0.4, 0.5, 'knit', { fuzz: 0.5 }), { bias: 0.12 }, B.rC * 0.6); }
          if (style === 'worker') {
            garment(S, B, linen, 0.9, 0);
            for (const s of [-1, 1]) S.limb(add(B.C, [B.rC * 0.6, B.rC * 0.3, s * B.rC * 0.45]), add(B.P, [B.rP * 0.7, 0, s * B.rP * 0.45]), 0.8, 0.8, leather, { bias: 0.12 });
          }
          if (style !== 'worker' && style !== 'shawl') { S.ball(add(B.C, [B.rC * 0.92, B.U * 0.18, 0]), B.U * 0.09, linen, { bias: 0.2 }); S.ball(add(B.C, [B.rC * 1.0, B.U * 0.08, 0]), B.U * 0.06, dye(c.hue2, 0.6, 0.35, 'silk'), { bias: 0.21 }); }
          if (item === 'watch') S.limb(add(B.C, [B.rC * 0.95, -B.U * 0.3, -B.rC * 0.3]), add(B.C, [B.rC * 1.0, -B.U * 0.38, B.rC * 0.3]), 0.5, 0.5, metal, { bias: 0.2, noLine: true });
        },
        headFront: (S, B) => {
          if (head === 'tophat') brimHat(S, B, black, black, 1.3, B.R * 1.2, 0.72, vest);
          if (head === 'bowler') { band(S, add(B.H, [-B.R * 0.1, B.R * 0.72, 0]), B.R * 1.15, B.R * 0.1, black, { bias: 0.3 }); S.ball(add(B.H, [-B.R * 0.1, B.R * 0.88, 0]), B.R * 0.7, black, { bias: 0.32 }); }
          if (head === 'flatcap') cap(S, B, dye(0.08, 0.2, 0.35, 'wool'), dye(0.08, 0.2, 0.35, 'wool'));
          if (head === 'bonnet') { S.ball(add(B.H, [-B.R * 0.3, B.R * 0.45, 0]), B.R * 0.95, vest, { bias: -B.R * 0.3 }); S.limb(add(B.H, [B.R * 0.3, B.R * 0.9, 0]), add(B.H, [B.R * 0.5, B.R * 0.1, 0]), B.R * 0.3, B.R * 0.2, vest, { bias: 0.3 }); }
        },
        item: (S, B, h) => {
          const U = B.U;
          if (item === 'umbrella') { S.limb(add(h, [0, -U * 0.9, 0]), add(h, [0, U * 0.35, 0]), 0.8, 0.7, black); S.limb(add(h, [0, -U * 0.2, 0]), add(h, [0, -U * 0.85, 0]), U * 0.14, 0.6, black); }
          if (item === 'newspaper') S.poly2(h, [-2, -6, 4, -7, 5, 2, -1, 3], paper, { bias: 0.1 });
          if (item === 'cane') { S.limb(add(h, [0, -1, 0]), add(h, [U * 0.15, -U * 1.35, 0]), 0.9, 0.8, wood); S.ball(add(h, [0, 0.5, 0]), 1.5, metal); }
          if (item === 'parcel') { S.blob(add(h, [U * 0.05, -U * 0.08, 0]), [1, 0, 0], U * 0.22, U * 0.2, dye(0.09, 0.4, 0.55, 'smooth'), { bias: 0.1 }, U * 0.16); }
        },
        hidesHorns: head !== 'none',
      };
    }
    case Stage.MODERN: {
      const suitH = choose(r, [0.08, 0.6, 0.62, 0.1, 0.35]);
      const suit = dye(suitH, 0.18, 0.34, 'wool');
      const style = choose(r, ['suit', 'dress', 'trench', 'sweater']);
      const head = choose(r, style === 'dress' ? ['cloche', 'none', 'cloche'] : ['fedora', 'newsboy', 'none', 'fedora']);
      const item = choose(r, ['newspaper', 'suitcase', 'flowers', 'none', 'radio']);
      const pastel = dye(choose(r, [0.95, 0.55, 0.15, 0.4, 0.8]), 0.35, 0.62, 'silk');
      const sweater = dye(hueOf(), 0.35, 0.45, 'knit');
      return {
        sleeve: style === 'dress' ? undefined : style === 'sweater' ? sweater : style === 'trench' ? dye(0.1, 0.35, 0.55, 'wool') : suit, sleevePad: 1, sleeveFull: true,
        pants: style === 'dress' ? undefined : suit, pantsPad: 0.8, pantsFull: true, boot: cloth(0.06, 0.5, 0.22, 'leather', { spec: 0.6 }),
        torso: (S, B) => {
          if (style === 'dress') { garment(S, B, pastel, 1, B.U * 0.85, 2.5); band(S, add(B.P, [0, -B.U * 0.05, 0]), B.rP + 1.6, 0.9, dye(c.hue2, 0.5, 0.35, 'silk')); necklace(S, B, linen, 11, 0.7); return; }
          if (style === 'trench') { garment(S, B, dye(0.1, 0.35, 0.55, 'wool'), 1.6, B.U * 0.95, 2.5); band(S, add(B.P, [0, B.rP * 0.3, 0]), B.rP + 2, 1, dye(0.1, 0.35, 0.45, 'wool')); return; }
          if (style === 'sweater') { garment(S, B, sweater, 1.3, B.U * 0.05); S.blob(add(B.C, [B.U * 0.05, B.U * 0.15, 0]), [1, 0, 0], B.rC * 0.7, B.rC * 0.7, linen, { bias: 0.1 }, B.U * 0.06); return; }
          garment(S, B, suit, 1.3, B.U * 0.2);
          S.poly([add(B.C, [B.rC + 1.2, B.U * 0.12, -B.rC * 0.35]), add(B.C, [B.rC + 1.2, B.U * 0.12, B.rC * 0.35]), add(B.C, [B.rC + 1.5, -B.U * 0.35, 0])], linen, { bias: 0.15 });
          S.limb(add(B.C, [B.rC + 1.6, B.U * 0.08, 0]), add(B.C, [B.rC + 1.8, -B.U * 0.32, 0]), 0.9, 1.3, dye(c.hue2, 0.6, 0.35, 'silk'), { bias: 0.2 });
        },
        headFront: (S, B) => {
          if (head === 'fedora') brimHat(S, B, dye(suitH, 0.2, 0.24, 'wool'), dye(suitH, 0.2, 0.24, 'wool'), 1.4, B.R * 0.55, 0.78, black);
          if (head === 'newsboy') { S.blob(add(B.H, [-B.R * 0.05, B.R * 0.7, 0]), [1, 0, 0], B.R * 1.05, B.R * 0.9, dye(0.08, 0.2, 0.4, 'wool'), { bias: 0.3 }, B.R * 0.4); S.blob(add(B.H, [B.R * 0.6, B.R * 0.55, 0]), [1, 0, 0], B.R * 0.4, B.R * 0.45, dye(0.08, 0.2, 0.35, 'wool'), { bias: 0.32 }, 0.8); }
          if (head === 'cloche') S.ball(add(B.H, [-B.R * 0.1, B.R * 0.45, 0]), B.R * 0.9, dye(c.hue3, 0.4, 0.4, 'wool'), { bias: 0.3 });
        },
        item: (S, B, h) => {
          const U = B.U;
          if (item === 'newspaper') S.poly2(h, [-2, -7, 4, -8, 5, 2, -1, 3], paper, { bias: 0.1 });
          if (item === 'suitcase') S.blob(add(h, [0, -U * 0.25, 0]), [1, 0, 0], U * 0.3, U * 0.12, cloth(0.07, 0.4, 0.35, 'leather'), { bias: 0.1 }, U * 0.22);
          if (item === 'flowers') for (let i = 0; i < 3; i++) S.ball(add(h, [U * 0.05, U * (0.25 + i * 0.06), (i - 1) * U * 0.08]), U * 0.07, dye(choose(r, [0.95, 0.15, 0.8]), 0.7, 0.55, 'smooth'), { bias: 0.1 });
          if (item === 'radio') S.blob(add(h, [0, -U * 0.15, 0]), [1, 0, 0], U * 0.2, U * 0.12, wood, { bias: 0.1 }, U * 0.16);
        },
        hidesHorns: head !== 'none',
      };
    }
    case Stage.CONTEMPORARY: {
      const vivid = hueOf();
      const top = choose(r, ['hoodie', 'tshirt', 'jacket', 'dress']), bottom = choose(r, ['jeans', 'shorts', 'joggers', 'skirt']);
      const head = choose(r, ['none', 'cap', 'beanie', 'headphones']), item = choose(r, ['phone', 'coffee', 'bag', 'none']);
      const hoodie = dye(vivid, 0.62, 0.5, 'knit'), tee = dye(hueOf(), 0.5, 0.6), jacket = dye(choose(r, [0.66, 0.08, 0.3]), 0.3, 0.25, 'leather', { spec: 0.4 });
      const denim: Mat = { ramp: ramp(0.6, 0.45, 0.4), tex: 'denim' };
      const shoe = cloth(0.1, 0.05, 0.9, 'cloth', { alt: ramp(c.hue2, 0.8, 0.5), pattern: (_x, y) => y % 4 === 0 });
      const backpack = r() < 0.4;
      return {
        sleeve: top === 'hoodie' ? hoodie : top === 'jacket' ? jacket : top === 'dress' ? undefined : tee, sleevePad: top === 'hoodie' ? 1.3 : 0.9, sleeveFull: top !== 'tshirt', sleeveMid: top === 'tshirt',
        pants: bottom === 'skirt' || top === 'dress' ? undefined : bottom === 'jeans' ? denim : dye(choose(r, [0.66, 0.6, 0.3]), 0.2, 0.3, 'knit'), pantsPad: 0.9, pantsFull: bottom !== 'shorts',
        boot: shoe, bootTrim: dye(c.hue2, 0.8, 0.5, 'smooth'),
        behind: (S, B) => { if (backpack) S.blob(add(B.C, [-B.rC - B.U * 0.12, -B.U * 0.25, 0]), [0, 1, 0], B.U * 0.35, B.U * 0.25, dye(hueOf(), 0.55, 0.4), { bias: -1 }, B.U * 0.2); },
        torso: (S, B) => {
          if (top === 'dress') garment(S, B, dye(vivid, 0.5, 0.5, 'silk'), 1, B.U * 0.75, 2.5);
          else garment(S, B, top === 'hoodie' ? hoodie : top === 'jacket' ? jacket : tee, top === 'hoodie' ? 1.8 : 1.1, B.U * 0.12);
          if (bottom === 'skirt' && top !== 'dress') S.limb(add(B.P, [0, B.rP * 0.2, 0]), add(B.P, [0, -B.U * 0.55, 0]), B.rP + 1.2, B.rP + 3, dye(hueOf(), 0.4, 0.35), { bias: 0.06 });
          if (top === 'jacket') garment(S, B, tee, 0.5, 0, 0, { bias: 0.04 });
          if (top === 'hoodie') for (const s of [-1, 1]) S.limb(add(B.C, [B.rC * 0.8, B.U * 0.12, s * B.rC * 0.2]), add(B.C, [B.rC * 0.85, -B.U * 0.15, s * B.rC * 0.22]), 0.45, 0.45, linen, { bias: 0.2, noLine: true });
          if (backpack) for (const s of [-1, 1]) S.limb(add(B.C, [B.rC * 0.2, B.rC * 0.4, s * B.rC * 0.6]), add(B.P, [B.rP * 0.2, B.U * 0.2, s * B.rP * 0.7]), 0.8, 0.8, black, { bias: 0.15 });
        },
        headBack: (S, B) => { if (top === 'hoodie') S.ball(add(B.H, [-B.R * 0.8, -B.R * 0.55, 0]), B.R * 0.62, { ...hoodie, ramp: darkenRamp(hoodie.ramp, 0.85) }, { bias: -B.R }); },
        headFront: (S, B) => {
          if (head === 'cap') cap(S, B, dye(hueOf(), 0.6, 0.45), dye(hueOf(), 0.6, 0.4));
          if (head === 'beanie') S.ball(add(B.H, [-B.R * 0.1, B.R * 0.55, 0]), B.R * 0.82, dye(hueOf(), 0.5, 0.45, 'knit'), { bias: 0.3 });
          if (head === 'headphones') { S.chain(add(B.H, [-B.R * 0.1, B.R * 0.2, -B.R * 0.9]), Math.PI / 2, 1.4, 5, B.R * 2.4, 0.9, 0.9, () => [-0.62, 0], black, { bias: 0.3 }); for (const s of [-1, 1]) S.ball(add(B.H, [-B.R * 0.1, B.R * 0.1, s * B.R * 0.9]), B.R * 0.3, dye(c.hue2, 0.7, 0.45, 'smooth'), { bias: 0.31 }); }
        },
        item: (S, B, h) => {
          const U = B.U;
          if (item === 'phone') { S.poly2(h, [-1, -4.5, 2.5, -4.5, 2.5, 1.5, -1, 1.5], black, { bias: 0.1 }); S.poly2(h, [-0.2, -3.8, 1.8, -3.8, 1.8, 0.6, -0.2, 0.6], glow(0.55), { bias: 0.12 }); }
          if (item === 'coffee') { S.limb(add(h, [0, -U * 0.06, 0]), add(h, [0, U * 0.18, 0]), U * 0.08, U * 0.1, cloth(0.1, 0.3, 0.85, 'smooth')); S.blob(add(h, [0, U * 0.19, 0]), [1, 0, 0], U * 0.1, U * 0.1, dye(c.hue2, 0.5, 0.35, 'smooth'), { bias: 0.1 }, 0.8); }
          if (item === 'bag') { S.blob(add(h, [0, -U * 0.3, 0]), [1, 0, 0], U * 0.22, U * 0.1, dye(hueOf(), 0.5, 0.55, 'cloth'), { bias: 0.1 }, U * 0.25); S.limb(h, add(h, [0, -U * 0.1, 0]), 0.6, 0.6, black); }
        },
        hidesHorns: head === 'beanie' || head === 'cap',
      };
    }
    case Stage.FUTURIST: {
      const base = dye(choose(r, [0.6, 0.55, 0.75, 0.1]), 0.12, 0.86, 'silk', { spec: 0.7 });
      const trim: Mat = { ramp: ramp(0.62, 0.15, 0.3), tex: 'metal', spec: 0.9 };
      const style = choose(r, ['coat', 'bodysuit', 'layered', 'robe']);
      const item = choose(r, ['tablet', 'drink', 'none', 'orb']);
      const gh = choose(r, [g.glowHue, 0.5, 0.85, 0.3]);
      const visor = r() < 0.6;
      return {
        sleeve: base, sleevePad: style === 'bodysuit' ? 0.4 : 0.9, sleeveFull: style !== 'layered', sleeveMid: style === 'layered',
        pants: style === 'robe' ? undefined : base, pantsPad: 0.5, pantsFull: true, boot: trim, bootHigh: r() < 0.5, bootTrim: glow(gh),
        torso: (S, B) => {
          if (style === 'coat') { garment(S, B, base, 1.2, B.U * 1.0, 2.5); S.limb(add(B.P, [B.rP + 1.4, 0, -B.rP * 0.3]), add(B.P, [B.rP + 2.2, -B.U * 0.95, -B.rP * 0.6]), 0.55, 0.55, glow(gh), { bias: 0.1, noLine: true }); }
          else if (style === 'robe') garment(S, B, base, 1.2, B.U * 1.45, 4);
          else garment(S, B, base, 0.8, 0);
          if (style === 'layered') S.blob(add(B.C, [0, 0, 0]), [1, 0, 0], B.rC * 1.15, B.rC * 1.1, trim, { bias: 0.1 }, B.rC * 0.55);
          band(S, add(B.P, [0, B.rP * 0.3, 0]), B.rP + 1.2, 0.7, glow(gh), { bias: 0.1 });
          S.limb(add(B.P, [B.rP * 0.3, B.rP * 0.5, 0]), add(B.C, [B.rC * 0.7, -B.rC * 0.3, 0]), 0.55, 0.55, glow(gh), { bias: 0.12, noLine: true });
        },
        headFront: (S, B) => { if (visor) S.limb(add(B.H, [B.R * 0.1, B.R * 0.2, -B.R * 0.85]), add(B.H, [B.R * 0.1, B.R * 0.2, B.R * 0.85]), B.R * 0.22, B.R * 0.22, { ramp: ramp(gh, 0.9, 0.55), tex: 'glass', alpha: 0.75, emit: true, line: [30, 40, 60] }, { bias: 0.6 }); },
        item: (S, B, h, ph) => {
          const U = B.U;
          if (item === 'tablet') { const p = add(h, [U * 0.15, U * 0.35 + Math.sin(ph) * 1.2, 0]); S.poly2(p, [-4, -5, 6, -6, 6, 3, -4, 4], { ramp: ramp(gh, 0.8, 0.6), tex: 'glow', emit: true, alpha: 0.55, line: null }, { bias: 0.1 }); }
          if (item === 'drink') { S.limb(add(h, [0, -U * 0.05, 0]), add(h, [0, U * 0.22, 0]), U * 0.07, U * 0.09, { ramp: ramp(gh, 0.5, 0.7), tex: 'glass', alpha: 0.7 }); }
          if (item === 'orb') S.ball(add(h, [U * 0.2, U * 0.55 + Math.sin(ph) * 1.5, 0]), U * 0.12, glow(gh), { bias: 0.1 });
        },
      };
    }
    case Stage.SPACE: default: {
      // civilian life among the stars: light jumpsuits, capes and jewellery of light - no helmets
      const pearl = dye(choose(r, [0.55, 0.8, 0.12, 0.45]), 0.25, 0.8, 'silk', { spec: 0.8 });
      const jewel = dye(hueOf(), 0.65, 0.42, 'silk', { spec: 0.6 });
      const style = choose(r, ['jumpsuit', 'robe', 'caped', 'tabard']);
      const gh = choose(r, [g.glowHue, 0.52, 0.9]);
      const head = choose(r, ['circlet', 'none', 'halo', 'none']), item = choose(r, ['orb', 'none', 'crystal', 'drone']);
      return {
        sleeve: style === 'tabard' ? jewel : pearl, sleevePad: 0.7, sleeveFull: true, cuff: glow(gh),
        pants: style === 'robe' ? undefined : pearl, pantsPad: 0.6, pantsFull: true, boot: { ramp: ramp(0.6, 0.1, 0.5), tex: 'metal', spec: 0.8 }, bootTrim: glow(gh),
        naga: pearl,
        behind: (S, B, ph) => { if (style === 'caped' || style === 'robe') cape(S, B, { ...jewel, alpha: style === 'robe' ? 0.8 : 1 }, B.U * 1.45, ph, 1.2); },
        torso: (S, B) => {
          if (style === 'robe') garment(S, B, jewel, 1.2, B.U * 1.5, 5);
          else garment(S, B, style === 'tabard' ? pearl : pearl, 0.9, 0);
          if (style === 'tabard') S.poly([add(B.C, [B.rC + 1, B.rC * 0.3, -B.rC * 0.5]), add(B.C, [B.rC + 1, B.rC * 0.3, B.rC * 0.5]), add(B.P, [B.rP + 2, -B.U * 0.7, B.rP * 0.6]), add(B.P, [B.rP + 2, -B.U * 0.7, -B.rP * 0.6])], jewel, { bias: 0.15 });
          S.blob(add(B.C, [B.U * 0.05, B.U * 0.14, 0]), [1, 0, 0], B.rC * 0.85, B.rC * 0.85, { ramp: ramp(0.12, 0.6, 0.6), tex: 'metal', spec: 1 }, { bias: 0.12 }, B.U * 0.05);
          S.ball(add(B.C, [B.rC + 1, B.U * 0.02, 0]), B.U * 0.07, glow(gh), { bias: 0.2 });
        },
        headFront: (S, B, ph) => {
          if (head === 'circlet') band(S, add(B.H, [0, B.R * 0.45, 0]), B.R * 0.96, 0.9, { ramp: ramp(0.12, 0.6, 0.6), tex: 'metal', spec: 1 }, { bias: 0.35 });
          if (head === 'halo') band(S, add(B.H, [-B.R * 0.1, B.R * 1.35 + Math.sin(ph) * 0.8, 0]), B.R * 0.8, 0.8, glow(gh), { bias: 0.4, noLine: true });
          S.ball(add(B.H, [B.R * 0.1, B.R * 0.1, B.R * 0.92]), 0.9, glow(gh), { bias: 0.4, noLine: true });
        },
        item: (S, B, h, ph) => {
          const U = B.U;
          if (item === 'orb') S.ball(add(h, [U * 0.25, U * 0.6 + Math.sin(ph) * 1.5, 0]), U * 0.13, glow(gh), { bias: 0.1 });
          if (item === 'crystal') S.limb(add(h, [0, U * 0.05, 0]), add(h, [U * 0.05, U * 0.4, 0]), U * 0.09, 0.6, { ramp: ramp(gh, 0.6, 0.65), tex: 'glass', alpha: 0.85, spec: 1 }, { bias: 0.1 });
          if (item === 'drone') { const p = add(B.H, [B.R * 1.6, B.R * 0.8 + Math.sin(ph * 2) * 1.5, B.R * 0.8]); S.blob(p, [1, 0, 0], U * 0.14, U * 0.1, { ramp: ramp(0.6, 0.1, 0.6), tex: 'metal', spec: 0.9 }, { bias: 1 }, U * 0.07); S.ball(add(p, [U * 0.1, 0, 0]), 1, glow(gh), { bias: 1.1 }); }
        },
      };
    }
  }
}

function medievalItem(S: Sketch, B: Body, h: V3, item: string, m: Record<string, Mat>) {
  const U = B.U;
  switch (item) {
    case 'basket': S.limb(add(h, [0, -U * 0.08, 0]), add(h, [0, -U * 0.34, 0]), U * 0.2, U * 0.24, { ...m.wood, tex: 'knit' }); S.ball(add(h, [0, -U * 0.05, 0]), U * 0.09, cloth(0.0, 0.6, 0.45, 'smooth'), { bias: 0.1 }); S.limb(add(h, [0, -U * 0.08, -U * 0.18]), add(h, [0, U * 0.05, 0]), 0.6, 0.6, m.wood); break;
    case 'bread': S.blob(add(h, [U * 0.08, U * 0.02, 0]), [1, 0.3, 0], U * 0.24, U * 0.11, cloth(0.08, 0.55, 0.5, 'smooth'), { bias: 0.1 }); break;
    case 'lantern': S.limb(h, add(h, [0, -U * 0.12, 0]), 0.5, 0.5, m.metal); S.limb(add(h, [0, -U * 0.14, 0]), add(h, [0, -U * 0.36, 0]), U * 0.1, U * 0.1, { ...m.glow, alpha: 0.9 }); break;
    case 'book': S.blob(add(h, [U * 0.05, 0, 0]), [0, 1, 0], U * 0.2, U * 0.15, cloth(0.02, 0.5, 0.3, 'leather'), { bias: 0.1 }, U * 0.07); break;
    case 'jug': S.ball(add(h, [0, -U * 0.18, 0]), U * 0.16, cloth(0.06, 0.45, 0.45, 'smooth', { spec: 0.4 })); S.limb(add(h, [0, -U * 0.05, 0]), add(h, [0, 0.8, 0]), U * 0.07, U * 0.08, cloth(0.06, 0.45, 0.45, 'smooth')); break;
    default: break;
  }
}
