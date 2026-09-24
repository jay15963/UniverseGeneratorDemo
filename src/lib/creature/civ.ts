// Sapient stages. The species keeps its anatomy (head, covering, colours, pattern, tail, extra arms,
// wings, digitigrade legs); only posture, clothes and tools change with each era.
import { Genome, Stage } from './genome';
import { Rig, Kit, ik, head, framePts } from './rig';
import { Mat, ramp, RGB, darkenRamp, Tex } from './raster';

const cloth = (h: number, s: number, l: number, tex: Tex = 'cloth', extra: Partial<Mat> = {}): Mat => ({ ramp: ramp(h, s, l), tex, ...extra });

interface J {
  S: number; pel: [number, number]; ch: [number, number]; rP: number; rC: number;
  hd: [number, number]; R: number;
  legs: { hip: [number, number]; knee: [number, number]; ankle: [number, number]; foot: [number, number]; dk: number }[];
  arms: { sh: [number, number]; el: [number, number]; hand: [number, number]; dk: number; holds: boolean }[];
}

export function buildCiv(rig: Rig, k: Kit, g: Genome, stage: Stage, ph: number, blink: boolean) {
  const S = 24 * (0.9 + g.size * 0.2);
  const breathe = Math.sin(ph) * 0.4;
  const serpent = g.locomotion === 'serpent';
  const digit = g.feet !== 'pad';
  const legH = serpent ? S * 1.1 : S * 1.5 * (0.94 + (g.legLen - 0.9) * 0.15);
  const pel: [number, number] = [0, -legH];
  const tors = S * 0.95 * (0.94 + g.length * 0.06);
  const ch: [number, number] = [S * 0.06, pel[1] - tors - breathe];
  const gg = Math.sqrt(g.girth);
  const rP = S * 0.34 * gg, rC = S * 0.4 * gg;
  const R = S * 0.4 * (0.85 + g.headSize * 0.15);
  const hd: [number, number] = [ch[0] + S * 0.16, ch[1] - S * 0.22 - R * 0.85 - breathe * 0.3];

  // --- skeleton ---
  const legs: J['legs'] = [];
  if (!serpent) for (const [fx, dk] of [[-S * 0.14, 0.72], [S * 0.16, 1]] as const) {
    const hip: [number, number] = [pel[0] + (dk < 1 ? -1.5 : 0), pel[1] + rP * 0.35];
    const foot: [number, number] = [fx, 0];
    const ankle: [number, number] = digit ? [fx - S * 0.2, -S * 0.34] : [fx - S * 0.04, -S * 0.12];
    const dl = Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1]);
    const knee = ik(hip[0], hip[1], ankle[0], ankle[1], dl * 0.515, dl * 0.515, -1);
    legs.push({ hip, knee, ankle, foot, dk });
  }
  const arms: J['arms'] = [];
  const armPairs = g.arms > 2 ? 2 : 1;
  for (let pair = 0; pair < armPairs; pair++) {
    const yOff = pair * S * 0.42, len = S * (0.62 - pair * 0.1);
    for (const dk of [0.72, 1]) {
      const sh: [number, number] = [ch[0] - (dk < 1 ? 2 : 0) - S * 0.02, ch[1] + rC * 0.25 + yOff];
      const holds = dk === 1 && pair === 0;
      const sw = Math.sin(ph + (dk < 1 ? Math.PI : 0) + pair) * S * 0.04;
      const hand: [number, number] = holds ? [sh[0] + S * 0.42, sh[1] + S * 0.82] : [sh[0] - S * 0.08 + sw, sh[1] + len * 1.75];
      const el = ik(sh[0], sh[1], hand[0], hand[1], len, len * 0.95, 1);
      arms.push({ sh, el, hand, dk, holds });
    }
  }
  const j: J = { S, pel, ch, rP, rC, hd, R, legs, arms };
  const E = eraKit(g, stage);

  // --- behind everything: cloak / coat tails / backpack / folded wings ---
  E.behind?.(rig, j, ph);
  if (g.wings !== 'none' && stage !== Stage.SPACE) {
    const w = g.wings === 'insect' ? { ...k.membrane, alpha: 0.55 } : g.wings === 'feather' ? { ...k.body, tex: 'feathers' as const, belly: undefined } : { ...k.membrane };
    rig.p([ch[0] - rC * 0.5, ch[1] - rC * 0.2, ch[0] - S * 0.9, ch[1] + S * 0.1, ch[0] - S * 0.75, pel[1] + S * 0.55, ch[0] - rC * 0.2, pel[1] - S * 0.1], w, { flat: 0.4 });
  }
  // far limbs
  arms.filter(a => a.dk < 1).forEach(a => arm(rig, k, g, E, a, S));
  legs.filter(l => l.dk < 1).forEach(l => leg(rig, k, g, E, l, S, digit));
  // tail
  if (!serpent && g.tail > 0.3) {
    const tp = rig.chain(pel[0] - rP * 0.6, pel[1] + rP * 0.2, Math.PI * 0.72, 6, S * (0.3 + g.tail * 1.1), rP * 0.55, 1, i => -0.12 - Math.sin(ph - i * 0.6) * 0.06, k.body, { g: 3 });
    if (g.tailTip === 'tuft') rig.e(tp[6][0], tp[6][1], S * 0.18, S * 0.13, 0, k.hairTuft);
  }
  if (serpent) {
    // naga: the whole lower body is a coiled tail
    const pts = rig.chain(pel[0], pel[1], 1.75, 10, S * 2.3 * g.length, rP * 1.05, 1.2, i => (i < 3 ? 0.42 : i < 7 ? 0.2 : -0.35) + Math.sin(ph - i * 0.5) * 0.03, E.naga ?? k.body, { g: 1 });
    void pts;
  }
  legs.filter(l => l.dk === 1).forEach(l => leg(rig, k, g, E, l, S, digit));
  // torso
  rig.c(pel[0], pel[1], ch[0], ch[1], rP, rC, k.body, { g: 1 });
  rig.c(ch[0] + S * 0.08, ch[1] - S * 0.05, hd[0] - R * 0.2, hd[1] + R * 0.5, rC * 0.42, rC * 0.38, k.body, { g: 1 });
  E.torso?.(rig, j, ph);
  // head (with hair / hood behind, hat or helmet in front)
  E.headBack?.(rig, j, ph);
  head(rig, k, g, hd[0], hd[1], R, { phase: ph, blink, sapient: true, noHorns: E.hidesHorns, tilt: 0.12 });
  E.headFront?.(rig, j, ph);
  // near arms with tools
  arms.filter(a => a.dk === 1).forEach(a => { if (a.holds) E.item?.(rig, j, a.hand, ph); arm(rig, k, g, E, a, S); });
  E.front?.(rig, j, ph);
}

function arm(rig: Rig, k: Kit, g: Genome, E: EraKit, a: J['arms'][number], S: number) {
  const o = { dark: a.dk };
  const r1 = S * 0.12 * Math.sqrt(g.girth), r2 = r1 * 0.85;
  rig.c(a.sh[0], a.sh[1], a.el[0], a.el[1], r1, r2, k.limb, o);
  rig.c(a.el[0], a.el[1], a.hand[0], a.hand[1], r2, r2 * 0.85, k.limb, o);
  if (E.sleeve) {
    rig.c(a.sh[0], a.sh[1], a.el[0], a.el[1], r1 + E.sleevePad, r2 + E.sleevePad, E.sleeve, o);
    if (E.sleeveFull) rig.c(a.el[0], a.el[1], a.hand[0] + (a.el[0] - a.hand[0]) * 0.18, a.hand[1] + (a.el[1] - a.hand[1]) * 0.18, r2 + E.sleevePad, r2 + E.sleevePad * 0.8, E.sleeve, o);
  }
  if (E.puff) rig.e(a.sh[0] + (a.el[0] - a.sh[0]) * 0.35, a.sh[1] + (a.el[1] - a.sh[1]) * 0.35, r1 * 1.9, r1 * 1.6, 0, E.puff, o);
  const hm = E.glove ?? k.limb;
  rig.e(a.hand[0], a.hand[1], S * 0.12, S * 0.1, 0, hm, o);
  if (g.claws && !E.glove) rig.c(a.hand[0] + S * 0.08, a.hand[1] + S * 0.05, a.hand[0] + S * 0.16, a.hand[1] + S * 0.1, 0.5, 0.35, k.claw, { ...o, noLine: true });
}

function leg(rig: Rig, k: Kit, g: Genome, E: EraKit, l: J['legs'][number], S: number, digit: boolean) {
  const o = { dark: l.dk };
  const r1 = S * 0.17 * Math.sqrt(g.girth), r2 = r1 * 0.72;
  rig.c(l.hip[0], l.hip[1], l.knee[0], l.knee[1], r1, r2, k.limb, o);
  rig.c(l.knee[0], l.knee[1], l.ankle[0], l.ankle[1], r2, r2 * 0.8, k.limb, o);
  rig.c(l.ankle[0], l.ankle[1], l.foot[0], l.foot[1] - 1, r2 * 0.75, r2 * 0.6, k.limb, o);
  if (E.pants) {
    rig.c(l.hip[0], l.hip[1], l.knee[0], l.knee[1], r1 + E.pantsPad, r2 + E.pantsPad, E.pants, o);
    if (E.pantsFull) rig.c(l.knee[0], l.knee[1], l.ankle[0] + (l.knee[0] - l.ankle[0]) * 0.1, l.ankle[1] + (l.knee[1] - l.ankle[1]) * 0.1, r2 + E.pantsPad, r2 * 0.8 + E.pantsPad, E.pants, o);
  }
  if (E.boot) {
    rig.c(l.ankle[0] + (l.knee[0] - l.ankle[0]) * (E.bootHigh ? 0.45 : 0.1), l.ankle[1] + (l.knee[1] - l.ankle[1]) * (E.bootHigh ? 0.45 : 0.1), l.ankle[0], l.ankle[1], r2 * 0.85 + 0.8, r2 * 0.8 + 0.8, E.boot, o);
    rig.c(l.ankle[0], l.ankle[1], l.foot[0] + S * 0.12, l.foot[1] - r2 * 0.55, r2 * 0.8 + 0.6, r2 * 0.6 + 0.4, E.boot, o);
  } else {
    // bare feet: the species' own foot
    if (g.feet === 'hoof') rig.c(l.foot[0] - 1, l.foot[1] - r2, l.foot[0] + 1, l.foot[1] - 0.5, r2 * 0.7, r2 * 0.8, k.claw, o);
    else if (g.feet === 'talon') for (const a of [0.1, 0.5, Math.PI - 0.2]) rig.c(l.foot[0], l.foot[1] - 1, l.foot[0] + Math.cos(a) * S * 0.28, l.foot[1] - 0.6, 0.7, 0.4, k.claw, o);
    else rig.e(l.foot[0] + S * 0.08, l.foot[1] - r2 * 0.5, S * 0.16, r2 * 0.55, 0, k.limb, o);
  }
  void digit;
}

// ---------------------------------------------------------------------------------------------------
// Era wardrobes
// ---------------------------------------------------------------------------------------------------
interface EraKit {
  sleeve?: Mat; sleevePad: number; sleeveFull?: boolean; puff?: Mat;
  pants?: Mat; pantsPad: number; pantsFull?: boolean;
  boot?: Mat; bootHigh?: boolean; glove?: Mat; naga?: Mat; hidesHorns?: boolean;
  behind?: (rig: Rig, j: J, ph: number) => void;
  torso?: (rig: Rig, j: J, ph: number) => void;
  headBack?: (rig: Rig, j: J, ph: number) => void;
  headFront?: (rig: Rig, j: J, ph: number) => void;
  item?: (rig: Rig, j: J, hand: [number, number], ph: number) => void;
  front?: (rig: Rig, j: J, ph: number) => void;
}

/** A garment over the torso from the chest down to `down` (px below the pelvis). */
function tunic(rig: Rig, j: J, m: Mat, pad: number, down: number, flare = 0) {
  const { pel, ch, rP, rC } = j;
  rig.c(pel[0], pel[1], ch[0], ch[1], rP + pad, rC + pad, m, { g: 20 });
  if (down > 0) rig.p([pel[0] - rP - pad, pel[1] - 2, pel[0] + rP + pad, pel[1] - 2, pel[0] + rP + pad + flare, pel[1] + down, pel[0] - rP - pad - flare, pel[1] + down], m, { g: 20, flat: 0.3 });
}

function eraKit(g: Genome, stage: Stage): EraKit {
  const c = g.culture;
  const leather = cloth(0.07, 0.45, 0.3, 'leather');
  const metal: Mat = { ramp: ramp(c.metal.h, c.metal.s, c.metal.l), tex: 'metal', spec: 1 };
  const steel: Mat = { ramp: ramp(0.6, 0.08, 0.62), tex: 'metal', spec: 1 };
  const linen = cloth(0.11, 0.18, 0.84);
  const black = cloth(0.66, 0.14, 0.16);
  const wood: Mat = { ramp: ramp(0.07, 0.45, 0.36), tex: 'wood' };
  const glow: Mat = { ramp: ramp(g.glowHue, 0.95, 0.6), tex: 'glow', emit: true, line: null };
  const accent = cloth(c.hue2, 0.75, 0.5);
  switch (stage) {
    case Stage.TRIBAL: {
      const hide = { ...cloth(0.08, 0.4, 0.38, 'fur'), fuzz: 0.8 };
      const paint: Mat = { ramp: ramp(c.hue > 0.5 ? 0.0 : 0.58, 0.7, 0.55), tex: 'smooth', line: null };
      return {
        sleevePad: 0, pantsPad: 0,
        torso: (rig, j) => {
          const { pel, rP, S, ch, rC } = j;
          rig.p([pel[0] - rP - 1, pel[1] - 1, pel[0] + rP + 1.5, pel[1] - 1, pel[0] + rP * 0.9, pel[1] + S * 0.45, pel[0] + 1, pel[1] + S * 0.32, pel[0] - rP, pel[1] + S * 0.5], hide, { g: 20 });
          rig.c(pel[0] - rP, pel[1] - 1, pel[0] + rP + 1, pel[1] - 1, 1, 1, leather, { g: 21 });
          rig.e(ch[0] - 1, ch[1] + 1, rC * 1.15, rC * 0.7, -0.2, hide, { g: 22 });
          for (let i = 0; i < 5; i++) rig.e(ch[0] + rC * 0.4 + i * 1.3, ch[1] - rC * 0.2 + i * 1.2 + (i % 2), 0.9, 0.9 + (i % 2) * 0.5, 0, { ramp: ramp(0.1, 0.15, 0.85), tex: 'bone' }, { noLine: true });
          rig.c(ch[0] - 1, ch[1] + rC * 0.9, ch[0] + rC * 0.6, ch[1] + rC * 1.2, 0.7, 0.7, paint, { noLine: true });
        },
        headFront: (rig, j, ph) => {
          const { hd, R } = j;
          rig.c(hd[0] + R * 0.1, hd[1] + R * 0.05, hd[0] + R * 0.55, hd[1] + R * 0.1, 0.6, 0.6, paint, { noLine: true });
          rig.c(hd[0] - R * 0.5, hd[1] - R * 0.6, hd[0] - R * 1.1, hd[1] - R * 1.5 + Math.sin(ph) * 0.8, 1.3, 0.6, { ramp: ramp(c.hue2, 0.7, 0.5), tex: 'feathers' });
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.c(hx - S * 0.1, hy + S * 0.9, hx + S * 0.12, hy - S * 1.6, 1.1, 0.9, wood);
          rig.p([hx + S * 0.12 - 1.8, hy - S * 1.6, hx + S * 0.12 + 1.8, hy - S * 1.6, hx + S * 0.16, hy - S * 2.05], { ramp: ramp(0.6, 0.06, 0.45), tex: 'plates', texScale: 0.4, spec: 0.3 });
          rig.c(hx + S * 0.08, hy - S * 1.55, hx + S * 0.1, hy - S * 1.4, 1.4, 1.4, leather, { noLine: true });
        },
      };
    }
    case Stage.MEDIEVAL: {
      const wool = cloth(c.hue, 0.38, 0.4), wool2 = cloth(c.hue2, 0.3, 0.3);
      const mail = c.motif % 2 === 0;
      return {
        sleeve: mail ? { ...steel, tex: 'scales', texScale: 0.5, spec: 0.6 } : wool, sleevePad: 1, sleeveFull: true,
        pants: wool2, pantsPad: 0.8, pantsFull: true, boot: leather, bootHigh: true,
        behind: (rig, j, ph) => {
          const { ch, pel, S } = j;
          const fl = Math.sin(ph) * S * 0.06;
          rig.p([ch[0] - j.rC * 0.3, ch[1] - 1, ch[0] + j.rC * 0.3, ch[1] - 1, pel[0] - S * 0.2, S * -0.12, pel[0] - S * 0.9 - fl, S * -0.1, pel[0] - S * 0.55, pel[1]], { ...wool2, ramp: darkenRamp(wool2.ramp, 0.9) }, { flat: 0.3 });
        },
        torso: (rig, j) => {
          tunic(rig, j, mail ? { ...steel, tex: 'scales', texScale: 0.5, spec: 0.6 } : wool, 1.2, j.S * 0.55, 2);
          if (mail) rig.p([j.pel[0] - j.rP, j.pel[1] + j.S * 0.1, j.pel[0] + j.rP + 2, j.pel[1] + j.S * 0.1, j.pel[0] + j.rP + 3, j.pel[1] + j.S * 0.6, j.pel[0] - j.rP - 1, j.pel[1] + j.S * 0.6], wool, { g: 21 });
          rig.c(j.pel[0] - j.rP - 1, j.pel[1] - 1.5, j.pel[0] + j.rP + 1.5, j.pel[1] - 1.5, 1.2, 1.2, leather, { g: 23 });
          rig.e(j.pel[0] + j.rP * 0.5, j.pel[1] - 1.5, 1.4, 1.2, 0, metal, { noLine: true });
        },
        headBack: (rig, j) => { if (!mail) rig.e(j.hd[0] - j.R * 0.4, j.hd[1] + j.R * 0.1, j.R * 1.12, j.R * 1.05, 0, wool2); },
        headFront: (rig, j) => {
          if (mail) {
            // kettle helm: dome on the crown, brim, nose guard - the face stays visible
            rig.e(j.hd[0] - j.R * 0.2, j.hd[1] - j.R * 0.55, j.R * 0.95, j.R * 0.6, 0, steel);
            rig.e(j.hd[0] - j.R * 0.15, j.hd[1] - j.R * 0.42, j.R * 1.3, j.R * 0.16, -0.05, steel);
            rig.c(j.hd[0] + j.R * 0.62, j.hd[1] - j.R * 0.45, j.hd[0] + j.R * 0.66, j.hd[1] - j.R * 0.05, 0.8, 0.7, steel);
          }
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.c(hx, hy + 1, hx + S * 0.05, hy + S * 0.28, 1, 1, leather);
          rig.c(hx - S * 0.25, hy + 1, hx + S * 0.25, hy - 1, 0.9, 0.9, metal);
          rig.c(hx, hy - 1, hx + S * 0.12, hy - S * 1.35, 1.5, 0.8, steel);
        },
        hidesHorns: mail,
      };
    }
    case Stage.RENAISSANCE: {
      const velvet = cloth(c.hue, 0.62, 0.3, 'cloth', { spec: 0.15 }), velvet2 = cloth(c.hue2, 0.55, 0.45);
      const slash = (x: number) => Math.sin(x * 1.3) > 0.4;
      return {
        sleeve: velvet, sleevePad: 0.8, sleeveFull: true, puff: { ...velvet, alt: velvet2.ramp, pattern: x => slash(x) },
        pants: velvet2, pantsPad: 0.4, pantsFull: true, boot: black,
        torso: (rig, j) => {
          tunic(rig, j, { ...velvet, alt: ramp(c.metal.h, c.metal.s, 0.6), pattern: (x, y) => ((x + y * 2) % 7) === 0 }, 1.4, 0);
          rig.e(j.pel[0], j.pel[1] + j.S * 0.12, j.rP * 1.6, j.S * 0.26, 0, { ...velvet, alt: velvet2.ramp, pattern: x => slash(x) }, { g: 21 });
        },
        headBack: (rig, j) => rig.e(j.hd[0] - j.R * 0.1, j.hd[1] + j.R * 0.9, j.R * 0.95, j.R * 0.38, 0.1, { ...linen, tex: 'fur', fuzz: 0.5 }),
        headFront: (rig, j, ph) => {
          const { hd, R } = j;
          rig.e(hd[0] - R * 0.2, hd[1] - R * 0.75, R * 1.15, R * 0.35, -0.12, velvet);
          rig.chain(hd[0] - R * 0.8, hd[1] - R * 0.9, -2.4, 5, R * 1.6, 1.4, 0.5, i => 0.25 + Math.sin(ph - i) * 0.04, { ...linen, tex: 'feathers' });
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.c(hx + 1, hy, hx + S * 0.35, hy + S * 1.3, 0.8, 0.5, steel);
          rig.e(hx, hy - 0.5, 2.2, 1.6, 0.3, metal);
        },
        hidesHorns: false,
      };
    }
    case Stage.INDUSTRIAL: {
      const coat = cloth(c.hue, 0.25, 0.18, 'cloth'), vest = cloth(c.hue2, 0.45, 0.4);
      const trousers: Mat = { ramp: ramp(0.62, 0.06, 0.34), tex: 'cloth', alt: ramp(0.62, 0.05, 0.48), pattern: x => x % 3 === 0 };
      const goggles = c.motif % 2 === 1;
      return {
        sleeve: coat, sleevePad: 1, sleeveFull: true, pants: trousers, pantsPad: 0.6, pantsFull: true, boot: { ...black, spec: 0.7 },
        glove: c.motif === 2 ? cloth(0.1, 0.1, 0.85) : undefined,
        behind: (rig, j, ph) => {
          const { pel, S } = j;
          rig.p([pel[0] - j.rP - 1, pel[1] - 2, pel[0] + 1, pel[1] - 2, pel[0] - S * 0.15, pel[1] + S * 0.95, pel[0] - S * 0.55 - Math.sin(ph) * 0.8, pel[1] + S * 0.9], coat, { flat: 0.3 });
        },
        torso: (rig, j) => {
          tunic(rig, j, coat, 1.4, j.S * 0.1);
          rig.c(j.pel[0] + j.rP * 0.5, j.pel[1] - 1, j.ch[0] + j.rC * 0.55, j.ch[1] + 2, j.rP * 0.55, j.rC * 0.5, vest, { g: 24 });
          rig.c(j.ch[0] + j.rC * 0.7, j.ch[1] - 1, j.ch[0] + j.rC * 0.9, j.ch[1] + 3, 1.3, 1, linen, { g: 25 });
          rig.p([j.ch[0] + j.rC * 0.9, j.ch[1] + 1, j.ch[0] + j.rC * 1.25, j.ch[1] + 2, j.ch[0] + j.rC * 0.95, j.ch[1] + 5], accent, { g: 26 });
          for (let i = 0; i < 3; i++) rig.e(j.ch[0] + j.rC * 0.72, j.ch[1] + j.S * 0.2 + i * 2.6, 0.6, 0.6, 0, metal, { noLine: true });
        },
        headFront: (rig, j) => {
          const { hd, R } = j;
          rig.e(hd[0] - R * 0.1, hd[1] - R * 0.78, R * 1.25, R * 0.2, -0.06, black);
          rig.c(hd[0] - R * 0.15, hd[1] - R * 0.85, hd[0] - R * 0.2, hd[1] - R * 2.1, R * 0.72, R * 0.78, black);
          rig.c(hd[0] - R * 0.9, hd[1] - R * 1.05, hd[0] + R * 0.5, hd[1] - R * 1.1, 1.1, 1.1, vest, { noLine: true });
          if (goggles) { rig.e(hd[0] + R * 0.15, hd[1] - R * 1.1, R * 0.28, R * 0.26, 0, metal); rig.e(hd[0] + R * 0.15, hd[1] - R * 1.1, R * 0.17, R * 0.16, 0, { ramp: ramp(0.12, 0.5, 0.6), tex: 'glass', alpha: 0.9 }); }
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.c(hx, hy - 1, hx + S * 0.2, hy + S * 1.3 - 1, 0.9, 0.8, wood);
          rig.e(hx - 0.3, hy - 1.6, 1.8, 1.6, 0, metal);
        },
        hidesHorns: true,
      };
    }
    case Stage.MODERN: {
      const suitH = c.motif % 2 ? 0.08 : 0.6;
      const suit = cloth(suitH, 0.18, 0.34), shirt = linen;
      const tie = cloth(c.hue2, 0.6, 0.35);
      const felt = cloth(suitH, 0.2, 0.24);
      return {
        sleeve: suit, sleevePad: 1, sleeveFull: true, pants: suit, pantsPad: 0.8, pantsFull: true, boot: cloth(0.06, 0.5, 0.22, 'leather', { spec: 0.6 }),
        torso: (rig, j) => {
          tunic(rig, j, suit, 1.3, j.S * 0.18);
          rig.p([j.ch[0] + j.rC * 0.3, j.ch[1] - 1, j.ch[0] + j.rC * 1.25, j.ch[1] - 1, j.ch[0] + j.rC * 0.8, j.ch[1] + j.S * 0.45], shirt, { g: 25 });
          rig.p([j.ch[0] + j.rC * 0.78, j.ch[1], j.ch[0] + j.rC * 1.02, j.ch[1], j.ch[0] + j.rC * 1.05, j.ch[1] + j.S * 0.4, j.ch[0] + j.rC * 0.85, j.ch[1] + j.S * 0.46, j.ch[0] + j.rC * 0.72, j.ch[1] + j.S * 0.4], tie, { g: 26 });
          rig.e(j.ch[0] + j.rC * 0.35, j.ch[1] + j.S * 0.08, 1.2, 1, 0, linen, { noLine: true });
        },
        headFront: (rig, j) => {
          const { hd, R } = j;
          rig.e(hd[0] - R * 0.05, hd[1] - R * 0.72, R * 1.45, R * 0.26, -0.1, felt);
          rig.e(hd[0] - R * 0.15, hd[1] - R * 1.05, R * 0.85, R * 0.5, -0.1, felt);
          rig.c(hd[0] - R * 0.95, hd[1] - R * 0.82, hd[0] + R * 0.6, hd[1] - R * 0.9, 1, 1, black, { noLine: true });
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.p([hx - S * 0.28, hy + 1, hx + S * 0.28, hy + 1, hx + S * 0.3, hy + S * 0.5, hx - S * 0.3, hy + S * 0.5], cloth(0.06, 0.5, 0.28, 'leather', { spec: 0.4 }));
          rig.c(hx - S * 0.1, hy + 1, hx + S * 0.1, hy + 1, 0.8, 0.8, metal, { noLine: true });
        },
        hidesHorns: true,
      };
    }
    case Stage.CONTEMPORARY: {
      const hoodie = cloth(c.hue, 0.62, 0.5), denim: Mat = { ramp: ramp(0.6, 0.45, 0.4), tex: 'denim' };
      const shoe = cloth(0.1, 0.05, 0.9, 'cloth', { alt: ramp(c.hue2, 0.8, 0.5), pattern: (_x, y) => y % 4 === 0 });
      const phone = c.motif % 2 === 0;
      return {
        sleeve: hoodie, sleevePad: 1.3, sleeveFull: true, pants: denim, pantsPad: 0.9, pantsFull: true, boot: shoe,
        torso: (rig, j) => {
          tunic(rig, j, hoodie, 1.8, j.S * 0.14);
          rig.c(j.ch[0] + j.rC * 0.2, j.pel[1] - j.S * 0.05, j.ch[0] + j.rC * 1.05, j.pel[1] - j.S * 0.08, 1.8, 1.8, { ...hoodie, ramp: darkenRamp(hoodie.ramp, 0.88) }, { g: 21 });
          for (let i = 0; i < 2; i++) rig.c(j.ch[0] + j.rC * (0.7 + i * 0.25), j.ch[1] + 1, j.ch[0] + j.rC * (0.72 + i * 0.25), j.ch[1] + j.S * 0.35, 0.45, 0.45, linen, { noLine: true });
        },
        headBack: (rig, j) => rig.e(j.hd[0] - j.R * 0.75, j.hd[1] + j.R * 0.75, j.R * 0.75, j.R * 0.55, 0.4, { ...hoodie, ramp: darkenRamp(hoodie.ramp, 0.85) }),
        headFront: (rig, j) => {
          if (phone) return;
          const { hd, R } = j;
          rig.chain(hd[0] - R * 0.2, hd[1] + R * 0.1, -1.7, 5, R * 2.2, 0.9, 0.9, () => 0.62, black);
          rig.e(hd[0] - R * 0.2, hd[1] + R * 0.1, R * 0.32, R * 0.36, 0, cloth(c.hue2, 0.7, 0.45));
        },
        item: phone ? (rig, _j, [hx, hy]) => {
          rig.p([hx - 1, hy - 4.5, hx + 2.5, hy - 4.5, hx + 2.5, hy + 1.5, hx - 1, hy + 1.5], black);
          rig.p([hx - 0.2, hy - 3.8, hx + 1.8, hy - 3.8, hx + 1.8, hy + 0.6, hx - 0.2, hy + 0.6], { ramp: ramp(0.55, 0.6, 0.62), tex: 'glow', emit: true, line: null });
        } : undefined,
      };
    }
    case Stage.FUTURIST: {
      const suit: Mat = { ramp: ramp(0.6, 0.1, 0.82), tex: 'cloth', spec: 0.7 };
      const trim: Mat = { ramp: ramp(0.62, 0.15, 0.3), tex: 'metal', spec: 0.9 };
      return {
        sleeve: suit, sleevePad: 0.5, sleeveFull: true, pants: suit, pantsPad: 0.5, pantsFull: true, boot: trim, bootHigh: true, glove: trim,
        torso: (rig, j) => {
          tunic(rig, j, suit, 0.8, 0);
          rig.e(j.ch[0] - 1, j.ch[1] + 1, j.rC * 1.05, j.rC * 0.62, -0.25, trim, { g: 22 });
          rig.c(j.pel[0] + j.rP * 0.2, j.pel[1] - 1, j.ch[0] + j.rC * 0.5, j.ch[1] + j.rC * 0.6, 0.6, 0.6, glow, { noLine: true });
          rig.c(j.pel[0] - j.rP - 0.5, j.pel[1] - 1.5, j.pel[0] + j.rP + 0.8, j.pel[1] - 1.5, 0.7, 0.7, glow, { noLine: true });
        },
        headFront: (rig, j) => {
          const { hd, R } = j;
          rig.c(hd[0] - R * 0.2, hd[1] - R * 0.25, hd[0] + R * 1.05, hd[1] - R * 0.25, R * 0.26, R * 0.2, { ramp: ramp(g.glowHue, 0.9, 0.55), tex: 'glass', alpha: 0.75, emit: true, line: [30, 40, 60] });
        },
        item: (rig, j, [hx, hy], ph) => {
          const S = j.S, y = hy - S * 0.55 + Math.sin(ph) * 1.2;
          rig.p([hx + 1, y, hx + S * 0.55, y - 2, hx + S * 0.55, y + S * 0.32, hx + 1, y + S * 0.36], { ramp: ramp(g.glowHue, 0.8, 0.6), tex: 'glow', emit: true, alpha: 0.55, line: null });
          for (let i = 0; i < 3; i++) rig.c(hx + 3, y + 2 + i * 2, hx + S * 0.45, y + 1.5 + i * 2, 0.4, 0.4, { ramp: ramp(g.glowHue, 0.3, 0.9), tex: 'glow', emit: true, line: null }, { noLine: true });
        },
      };
    }
    case Stage.SPACE: default: {
      const suit: Mat = { ramp: ramp(0.6, 0.05, 0.86), tex: 'cloth' };
      const joint: Mat = { ramp: ramp(0.6, 0.06, 0.55), tex: 'metal', spec: 0.5 };
      const orange = cloth(c.hue2 < 0.5 ? 0.07 : c.hue2, 0.85, 0.5);
      return {
        sleeve: suit, sleevePad: 2.4, sleeveFull: true, pants: suit, pantsPad: 2.2, pantsFull: true, boot: joint, bootHigh: true, glove: orange, hidesHorns: true,
        naga: suit,
        behind: (rig, j, ph) => {
          const { ch, pel, S } = j;
          rig.p([ch[0] - j.rC * 0.6, ch[1] - 3, ch[0] - j.rC * 0.6 - S * 0.55, ch[1] - 1, ch[0] - j.rC * 0.6 - S * 0.55, pel[1] - 1, ch[0] - j.rC * 0.6, pel[1] + 1], { ramp: ramp(0.6, 0.06, 0.72), tex: 'metal', spec: 0.4 });
          rig.c(ch[0] - j.rC - S * 0.3, ch[1] - 2, ch[0] - j.rC - S * 0.35, ch[1] - S * 0.9, 0.6, 0.5, joint);
          rig.e(ch[0] - j.rC - S * 0.35, ch[1] - S * 0.92, 1.3, 1.3, 0, Math.sin(ph * 2) > 0 ? { ramp: ramp(0.0, 0.9, 0.55), tex: 'glow', emit: true, line: null } : joint);
        },
        torso: (rig, j) => {
          tunic(rig, j, suit, 2.6, 0);
          rig.c(j.pel[0] - j.rP - 2, j.pel[1] - 1, j.pel[0] + j.rP + 2.5, j.pel[1] - 1, 1.4, 1.4, joint, { g: 23 });
          rig.p([j.ch[0] + 1, j.ch[1] + j.S * 0.15, j.ch[0] + j.rC + 1, j.ch[1] + j.S * 0.15, j.ch[0] + j.rC + 1, j.ch[1] + j.S * 0.4, j.ch[0] + 1, j.ch[1] + j.S * 0.4], { ramp: ramp(0.6, 0.1, 0.4), tex: 'metal', spec: 0.6 }, { g: 24 });
          rig.e(j.ch[0] + j.rC * 0.3, j.ch[1] + j.S * 0.25, 0.8, 0.8, 0, { ramp: ramp(0.33, 0.9, 0.5), tex: 'glow', emit: true, line: null }, { noLine: true });
          rig.e(j.ch[0] - j.rC * 0.3, j.ch[1] + 1, 2, 2, 0, orange, { noLine: true });
        },
        headFront: (rig, j) => {
          const { hd, R } = j;
          rig.c(hd[0] - R * 0.5, hd[1] + R * 1.05, hd[0] + R * 0.35, hd[1] + R * 1.1, 2, 2, joint);
          rig.e(hd[0] + R * 0.05, hd[1] - R * 0.05, R * 1.55, R * 1.45, 0, { ramp: ramp(0.56, 0.35, 0.72), tex: 'glass', alpha: 0.3, spec: 1, line: [150, 175, 200] });
        },
        item: (rig, j, [hx, hy]) => {
          const S = j.S;
          rig.p([hx - 1, hy - S * 0.1, hx + S * 0.42, hy - S * 0.14, hx + S * 0.42, hy + S * 0.2, hx - 1, hy + S * 0.2], { ramp: ramp(0.6, 0.08, 0.5), tex: 'metal', spec: 0.6 });
          rig.e(hx + S * 0.3, hy - S * 0.02, 1, 1, 0, { ramp: ramp(0.33, 0.9, 0.55), tex: 'glow', emit: true, line: null }, { noLine: true });
        },
      };
    }
  }
}
export type { RGB };
void framePts;
