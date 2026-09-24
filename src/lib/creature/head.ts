// Heads for every facing, with a face that follows the diet: predators get heavy slanted brows,
// narrow eyes, fangs and a snarl; grazers a round skull, big glossy eyes and a soft smile;
// omnivores sit in between. Everything is continuous (genome.fierce), so no two faces match.
import { Genome } from './genome';
import { Kit } from './kit';
import { Sketch, V3, add, mul, norm, PO } from './pose';
import { Mat } from './raster';

export interface HeadOpts { sapient?: boolean; ph: number; blink: boolean; noHorns?: boolean; tilt?: number; noEars?: boolean }
export interface HeadInfo { top: V3; R: number; ch: number; face: V3; chin: V3 }

const SHAPES = {
  round: [1.0, 0.95, 0.95], long: [1.22, 0.8, 0.85], wedge: [1.15, 0.78, 0.8], flat: [1.2, 1.05, 0.64], domed: [0.95, 0.9, 1.08], hammer: [1.0, 0.85, 0.8],
} as const;

export function drawHead(S: Sketch, k: Kit, g: Genome, c: V3, R: number, o: HeadOpts): HeadInfo {
  const sap = !!o.sapient, ph = o.ph;
  const fierce = g.fierce * (sap ? 0.65 : 1);
  const [cl, cw, ch] = SHAPES[g.headShape];
  const at = (x: number, y: number, z: number): V3 => add(c, [x, y, z]);
  const tilt = o.tilt ?? 0.22;

  // --- skull ---
  S.blob(c, [1, 0, 0], R * cl, R * cw, k.head, { g: 7 }, R * ch);
  if (g.headShape === 'domed') S.ball(at(-R * 0.15, R * 0.35, 0), R * 0.82, k.head, { g: 7 });
  if (g.headShape === 'hammer') for (const s of [-1, 1]) S.blob(at(R * 0.2, R * 0.05, s * R * 1.05), [0, 0, 1], R * 0.55, R * 0.32, k.head, { g: 7 });
  if (g.cheekFluff) for (const s of [-1, 1]) S.ball(at(R * 0.05, -R * 0.4, s * R * 0.72), R * 0.42, k.tuft, { g: 7 });

  // --- muzzle / beak ---
  const round = g.headShape === 'round' || g.headShape === 'domed';
  const snoutLen = R * (0.2 + g.snout * 1.15) * (sap ? 0.45 : 1) * (round ? 0.75 : 1);
  const base = at(R * 0.45 * cl, -R * 0.18, 0);
  const tip = add(base, [Math.cos(tilt) * snoutLen, -Math.sin(tilt) * snoutLen, 0]);
  const rB = R * (g.headShape === 'wedge' ? 0.55 : 0.64), rT = R * (0.22 + (1 - fierce) * 0.14 + (g.jaw === 'trunk' || g.jaw === 'tusks' ? 0.08 : 0));
  if (g.jaw === 'beak') {
    const bl = snoutLen + R * 0.5, hook = fierce * R * 0.45;
    const bt = add(base, [bl, -R * 0.05, 0]);
    S.limb(add(base, [-R * 0.1, R * 0.05, 0]), bt, R * 0.5, R * 0.12, k.beak, { bias: 0.2 });
    if (hook > 1) S.limb(bt, add(bt, [R * 0.1, -hook, 0]), R * 0.14, 0.5, k.beak, { bias: 0.25 });
    S.limb(add(base, [-R * 0.05, -R * 0.28, 0]), add(base, [bl * 0.72, -R * 0.3, 0]), R * 0.3, R * 0.08, { ...k.beak, ramp: k.beak.ramp.map(v => [v[0] * 0.82, v[1] * 0.82, v[2] * 0.82]) as typeof k.beak.ramp }, { bias: 0.15 });
  } else {
    S.limb(add(base, [-R * 0.25, 0, 0]), tip, rB, rT, k.head, { g: 7 });
    // lower jaw (heavier on predators)
    const jawD = R * (0.3 + fierce * 0.08);
    S.limb(add(base, [-R * 0.2, -jawD, 0]), add(tip, [-rT * 0.4, -rT * 0.55, 0]), R * (0.38 + fierce * 0.1), rT * 0.72, { ...k.head, belly: k.body.belly ?? k.head.ramp, ramp: k.head.ramp } as Mat, { g: 7, bias: -0.1 });
    // nose
    if (g.covering === 'fur' || sap) S.ball(add(tip, [rT * 0.35, rT * 0.35, 0]), Math.max(1, rT * 0.55), k.nose, { bias: 0.3 });
    else for (const s of [-1, 1]) S.disc(add(tip, [rT * 0.2, rT * 0.45, s * rT * 0.45]), 0.7, 0.7, 0, k.mouth, { bias: 0.3, noLine: true });
    // mouth line: corners lift into a smile on grazers, sink into a snarl on predators
    const cornerY = -R * 0.3 + (1 - fierce) * R * 0.1 - fierce * R * 0.06;
    const tipPt = add(tip, [0, -rT * 0.6, 0]);
    for (const s of [-1, 1]) {
      const corner = add(base, [R * 0.05, cornerY, s * R * 0.42]);
      if (fierce > 0.72 && !sap) S.limb(corner, tipPt, 1.3, 1.1, k.gum, { bias: 0.08, noLine: true });   // bared gums
      S.limb(corner, tipPt, 0.55, 0.5, k.mouth, { bias: 0.1, noLine: true });
      // teeth
      const nT = g.jaw === 'teeth' ? Math.max(2, Math.floor(snoutLen / 2.3)) : fierce > 0.45 ? 2 : 0;
      for (let i = 0; i < nT && !(sap && fierce < 0.5); i++) {
        const t = (i + 0.7) / (nT + 0.4);
        const p = add(mul(corner, 1 - t), mul(tipPt, t));
        const fang = fierce > 0.5 && (i === nT - 1 || i === nT - 2 && nT > 3);
        const hgt = fang ? 1.6 + fierce * 2.8 : 1 + fierce * 0.6;
        S.poly2(p, [-0.8, -0.3, 0.8, -0.3, 0, hgt], k.teeth, { bias: 0.12, noLine: true });
      }
    }
    if (g.jaw === 'tusks') for (const s of [-1, 1]) S.chain(add(base, [R * 0.15, -R * 0.3, s * R * 0.35]), 0.1 * s, -0.35, 4, R * 1.1 * g.hornLen, R * 0.2, 0.6, () => [0.35, -0.05 * s], k.horn, { bias: 0.2 });
    if (g.jaw === 'trunk') S.chain(tip, 0, -0.9, 7, R * 2.2, rT * 0.9, rT * 0.4, i => [-0.08 + Math.sin(ph + i * 0.6) * 0.1 + (i > 4 ? 0.35 : 0), 0], k.head, { g: 7 });
    if (g.jaw === 'mandibles') for (const s of [-1, 1]) S.chain(add(tip, [0, -rT * 0.3, s * rT * 0.8]), 0.2 * s, -0.2, 3, R * 0.8, R * 0.18, 0.6, i => [0.1, -s * (0.35 + i * 0.1) + Math.sin(ph * 2) * 0.08 * s], k.claw, { bias: 0.2 });
    if (g.whiskers) for (const s of [-1, 1]) for (let i = 0; i < 2; i++) S.limb(add(tip, [-rT * 0.2, -rT * 0.1 + i, s * rT * 0.6]), add(tip, [-rT * 0.6 - R * 0.2, -rT * 0.1 + i * 2 - 1, s * (rT + R * 0.9)]), 0.35, 0.3, k.pupil, { bias: 0.35, noLine: true });
  }

  // --- ears ---
  if (!o.noEars) for (const s of [-1, 1]) ear(S, k, g, at(-R * 0.2, R * 0.62 * ch, s * R * 0.55 * cw), s, R, ph, sap);

  // --- horns & head gear of the species ---
  if (!o.noHorns) horns(S, k, g, c, R, ch, cw, tip, ph);
  if (g.antennae && !o.noHorns) for (const s of [-1, 1]) {
    const pts = S.chain(at(R * 0.35, R * 0.7 * ch, s * R * 0.3), s * 0.35, 1.0, 5, R * 1.5, 0.6, 0.5, i => [-0.12 + Math.sin(ph - i * 0.7) * 0.06, 0], { ...k.claw, spec: 0.3 });
    S.ball(pts[pts.length - 1], 1.2, k.crest);
  }
  if (g.tentacleBeard) for (let i = 0; i < 3; i++) S.chain(add(base, [R * 0.1, -R * 0.45, (i - 1) * R * 0.35]), 0, -1.35, 4, R * (0.9 - Math.abs(i - 1) * 0.2), R * 0.13, 0.5, j => [Math.sin(ph * 1.5 - j - i) * 0.2, 0], k.skinWet, { bias: 0.1 });

  // --- eyes ---
  const er = Math.max(1.3, R * 0.25 * g.eyeSize * (sap ? 0.85 : 1));
  const eyeAt = (pos: V3, n: V3, r: number) => eye(S, k, g, pos, n, r, fierce, o.blink, sap, tip);
  if (g.eyeLayout === 'cyclops') eyeAt(at(R * 0.62 * cl, R * 0.2, 0), [1, 0.2, 0], er * 1.5);
  else if (g.eyeLayout === 'stalks') {
    for (const s of [-1, 1]) {
      const b = at(R * 0.1, R * 0.7, s * R * 0.35);
      const e = add(b, [R * 0.3 + Math.sin(ph) * R * 0.08, R * 1.0, s * R * 0.4]);
      S.limb(b, e, R * 0.14, R * 0.11, k.head);
      eyeAt(e, [1, 0.3, s * 0.6], er * 0.85);
    }
  } else {
    const a = 1.25 - fierce * 0.7; // lateral grazer eyes .. forward predator eyes
    for (const s of [-1, 1]) {
      const n: V3 = [Math.cos(a), 0.25, s * Math.sin(a)];
      eyeAt(at(Math.cos(a) * R * cl * 0.78, R * 0.2 * ch, s * Math.sin(a) * R * cw * 0.84), n, er);
      if (g.eyeLayout === 'row') for (let i = 1; i < g.eyes / 2; i++) eyeAt(at(Math.cos(a) * R * 0.5 - i * R * 0.3, R * (0.35 + i * 0.12), s * Math.sin(a) * R * 0.8), [0.4, 0.5, s * 0.8], er * (0.75 - i * 0.1));
      if (g.eyeLayout === 'cluster') for (let i = 1; i < g.eyes / 2; i++) eyeAt(at(R * (0.5 - i * 0.12), R * (0.45 + i * 0.15), s * R * (0.25 + i * 0.12)), [0.7, 0.6, s * 0.3], er * 0.55);
    }
  }
  return { top: at(-R * 0.1, R * 0.9 * ch, 0), R, ch, face: at(R * 0.6, R * 0.1, 0), chin: at(R * 0.3, -R * 0.7, 0) };
}

function eye(S: Sketch, k: Kit, g: Genome, pos: V3, n: V3, r: number, fierce: number, blink: boolean, sap: boolean, snoutTip: V3) {
  const vis = S.facing(norm(n));
  if (vis < -0.12) return;
  const wf = Math.max(0.3, Math.min(1, 0.3 + (vis + 0.12) * 0.9));
  const o: PO = { bias: 0.4 };
  if (r < 1.5) { S.disc(pos, 1, 1, 0, k.pupil, o); return; }
  const [ex, ey] = S.P(pos), [tx, ty] = S.P(snoutTip);
  let ix = tx - ex, iy = ty - ey; const il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il; // towards the snout, on screen
  if (g.mask) S.disc(pos, r * 1.55 * wf + 0.8, r * 1.35, 0, k.mark, { bias: 0.3, noLine: true });
  if (blink) { S.poly2(pos, [-r * wf, -0.6, r * wf, -0.6, r * wf, 0.6, -r * wf, 0.6], k.lid, { bias: 0.45 }); return; }
  if (g.pupil === 'compound') {
    S.disc(pos, r * 1.05 * wf, r, 0, { ...k.iris, tex: 'compound', line: [20, 16, 20] }, o);
    S.disc([pos[0], pos[1], pos[2]], Math.max(0.6, r * 0.22), Math.max(0.6, r * 0.22), 0, k.shine, { bias: 0.5 });
    return;
  }
  S.disc(pos, r * wf, r * 0.94, 0, k.sclera, o);
  const ir = r * (0.66 + (1 - fierce) * 0.12);
  const look = 0.3 * r;
  const icx = ix * look * wf, icy = iy * look * 0.3;
  S.poly2(pos, circle(icx, icy, ir * wf, ir, 10), k.iris, { bias: 0.42, noLine: true });
  if (g.pupil === 'slit') S.poly2(pos, circle(icx, icy, Math.max(0.5, ir * 0.2) * wf, ir * 0.85, 8), k.pupil, { bias: 0.43, noLine: true });
  else if (g.pupil === 'bar') S.poly2(pos, circle(icx, icy, ir * 0.8 * wf, Math.max(0.6, ir * 0.24), 8), k.pupil, { bias: 0.43, noLine: true });
  else S.poly2(pos, circle(icx, icy, ir * (0.42 + (1 - fierce) * 0.14) * wf, ir * (0.42 + (1 - fierce) * 0.14), 8), k.pupil, { bias: 0.43, noLine: true });
  // catch-lights: two on gentle faces (the "cute" gloss), one on the rest
  S.poly2(pos, circle(icx - ir * 0.4, icy - ir * 0.45, Math.max(0.6, ir * 0.26), Math.max(0.6, ir * 0.26), 6), k.shine, { bias: 0.44, noLine: true });
  if (fierce < 0.4 && r > 2.2) S.poly2(pos, circle(icx + ir * 0.35, icy + ir * 0.35, 0.6, 0.6, 5), k.shine, { bias: 0.44, noLine: true });
  // lids & brows
  const w = r * wf + 0.6, top = -r * 1.25;
  if (fierce > 0.55) {
    // angry lid: slants down towards the snout, a heavy brow ridge above it
    const inner = Math.sign(ix || 1);
    const drop = r * (0.35 + (fierce - 0.55) * 1.6);
    S.poly2(pos, [-w * 1.2, top, w * 1.2, top, inner > 0 ? w * 1.2 : -w * 1.2, -r * 0.95 + drop, inner > 0 ? -w * 1.2 : w * 1.2, -r * 0.95 + drop * 0.2], k.lid, { bias: 0.46 });
    if (!sap || fierce > 0.6) S.poly2(pos, [-w * 1.35, top - 1.2, w * 1.35, top - 1.2, inner > 0 ? w * 1.3 : -w * 1.3, -r * 0.95 + drop - 0.4, inner > 0 ? -w * 1.3 : w * 1.3, -r * 0.95 + drop * 0.2 - 1.4], k.brow, { bias: 0.47, noLine: true });
  } else if (fierce > 0.3) {
    S.poly2(pos, [-w * 1.15, top, w * 1.15, top, w * 1.15, -r * 0.72, -w * 1.15, -r * 0.72], k.lid, { bias: 0.46 });
  }
}

function circle(cx: number, cy: number, rx: number, ry: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return out;
}

function ear(S: Sketch, k: Kit, g: Genome, b: V3, s: number, R: number, ph: number, sap: boolean) {
  const sw = Math.sin(ph) * 0.05;
  const spread: V3 = norm([-0.55, 0, s * 0.85]);
  const across = (d: number): V3 => mul(spread, d);
  const sz = sap ? 0.8 : 1;
  switch (g.ears) {
    case 'pointy': case 'tufted': {
      const apex = add(b, [-R * 0.2, R * (0.95 + sw) * sz, s * R * 0.25]);
      S.poly([add(b, across(-R * 0.3)), add(b, across(R * 0.3)), apex], k.head);
      S.poly([add(b, add(across(-R * 0.14), [0, R * 0.12, 0])), add(b, add(across(R * 0.14), [0, R * 0.12, 0])), add(apex, [0, -R * 0.25, 0])], k.inner, { bias: 0.05, noLine: true });
      if (g.ears === 'tufted') S.limb(apex, add(apex, [-R * 0.1, R * 0.45, s * R * 0.05]), 0.8, 0.4, k.tuft, { bias: 0.05 });
      break;
    }
    case 'round':
      S.blob(add(b, [0, R * 0.12, 0]), spread, R * 0.38 * sz, R * 0.2, k.head, {}, R * 0.36 * sz);
      S.blob(add(b, [R * 0.02, R * 0.12, s * 0.3]), spread, R * 0.22 * sz, R * 0.1, k.inner, { bias: 0.05, noLine: true }, R * 0.2 * sz);
      break;
    case 'long': {
      const e = add(b, [-R * 0.55, R * 1.4 * sz, s * R * 0.35]);
      S.limb(b, e, R * 0.26, R * 0.2, k.head);
      S.limb(add(b, [0, R * 0.1, s * 0.4]), add(e, [0, -R * 0.1, s * 0.4]), R * 0.12, R * 0.08, k.inner, { bias: 0.05, noLine: true });
      break;
    }
    case 'fan': {
      const o: V3 = add(b, [-R * 0.1, -R * 0.2, s * R * 0.35]);
      S.poly([add(o, [R * 0.2, R * 0.35, 0]), add(o, [-R * 0.7, R * 0.45 + sw * R, s * R * 0.35]), add(o, [-R * 0.9, -R * 0.4, s * R * 0.45]), add(o, [-R * 0.2, -R * 0.75, s * R * 0.2]), add(o, [R * 0.15, -R * 0.3, 0])], k.head, { flat: 0.3 });
      break;
    }
    case 'droopy':
      S.limb(b, add(b, [-R * 0.1, -R * 1.05, s * R * 0.3]), R * 0.28, R * 0.24, k.head);
      break;
    case 'fins':
      S.poly([b, add(b, [-R * 1.0, R * 0.55 + sw * R, s * R * 0.45]), add(b, [-R * 1.15, 0, s * R * 0.5]), add(b, [-R * 0.9, -R * 0.4, s * R * 0.4])], k.fin, { flat: 0.5 });
      break;
    default: break;
  }
}

function horns(S: Sketch, k: Kit, g: Genome, c: V3, R: number, ch: number, cw: number, snoutTip: V3, ph: number) {
  const L = R * 1.2 * g.hornLen;
  const at = (x: number, y: number, z: number): V3 => add(c, [x, y, z]);
  switch (g.horns) {
    case 'ram': for (const s of [-1, 1]) S.chain(at(-R * 0.05, R * 0.65 * ch, s * R * 0.45 * cw), Math.PI - s * 0.5, 0.9, 6, L * 1.5, R * 0.26, 0.8, () => [-0.42, 0], k.horn); break;
    case 'straight': for (const s of [-1, 1]) S.limb(at(R * 0.05, R * 0.7 * ch, s * R * 0.35), at(-R * 0.3, R * 0.7 * ch + L, s * R * 0.55), R * 0.2, 0.6, k.horn); break;
    case 'bull': for (const s of [-1, 1]) S.chain(at(0, R * 0.6 * ch, s * R * 0.6 * cw), s * Math.PI / 2, 0.1, 4, L * 1.1, R * 0.22, 0.6, () => [0.3, -s * 0.3], k.horn); break;
    case 'antlers': for (const s of [-1, 1]) {
      const pts = S.chain(at(-R * 0.05, R * 0.7 * ch, s * R * 0.35), Math.PI - s * 0.8, 1.2, 4, L * 1.3, R * 0.15, 0.6, () => [-0.12, 0], k.horn);
      for (let i = 1; i < pts.length - 1; i++) S.limb(pts[i], add(pts[i], [L * 0.3, L * 0.35, s * L * 0.1]), R * 0.09, 0.5, k.horn);
    } break;
    case 'nasal': S.limb(add(snoutTip, [-R * 0.3, R * 0.25, 0]), add(snoutTip, [-R * 0.1, R * 0.25 + L * 0.9, 0]), R * 0.22, 0.6, k.horn, { bias: 0.2 }); break;
    case 'unicorn': S.limb(at(R * 0.55, R * 0.55 * ch, 0), at(R * 0.55 + L * 0.8, R * 0.55 * ch + L * 1.1, 0), R * 0.18, 0.5, { ...k.horn, tex: 'bone', texScale: 0.5 }, { bias: 0.3 }); break;
    case 'ossicones': for (const s of [-1, 1]) { const e = at(-R * 0.2, R * 0.8 * ch + L * 0.5, s * R * 0.3); S.limb(at(-R * 0.1, R * 0.6 * ch, s * R * 0.3), e, R * 0.13, R * 0.11, k.head); S.ball(e, R * 0.17, k.mark); } break;
    case 'crown': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const b = at(Math.cos(a) * R * 0.55 - R * 0.1, R * 0.6 * ch, Math.sin(a) * R * 0.55); S.limb(b, add(b, [Math.cos(a) * R * 0.2, L * 0.5, Math.sin(a) * R * 0.2]), R * 0.12, 0.5, k.horn); } break;
    case 'crest': for (let i = 0; i < 5; i++) { const b = at(R * (0.3 - i * 0.22), R * 0.75 * ch, 0); S.limb(b, add(b, [-R * 0.35, L * (0.9 - Math.abs(i - 1.5) * 0.15) + Math.sin(ph + i) * 0.4, 0]), R * 0.2, R * 0.08, k.crest, { g: 9 }); } break;
    case 'frill': {
      const pts: V3[] = [];
      const fr = R * (1.5 + g.hornLen * 0.4);
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI * 0.05 + (i / 12) * Math.PI * 1.1, rr = fr * (i % 2 ? 0.82 : 1);
        const up = Math.sin(a) * rr, side = Math.cos(a) * rr;
        pts.push(at(-R * 0.55 - up * 0.45, up * 0.85 - R * 0.1, side));
      }
      S.poly(pts, { ...k.crest, tex: 'fin', alpha: 0.95 }, { flat: 0.4, bias: -R * 0.6 });
      break;
    }
    default: break;
  }
}
