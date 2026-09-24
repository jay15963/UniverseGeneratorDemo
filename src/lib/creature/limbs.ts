// Legs (nine skeletal types), feet, tails, wings and back ornaments - all facing-aware.
import { Genome } from './genome';
import { Kit } from './kit';
import { Sketch, V3, add, mul, ik3, lerp3, PO } from './pose';
import { Mat } from './raster';

export interface LegSpec {
  hip: V3;             // attachment on the body
  side: number;        // -1 / +1
  front: boolean;      // fore (arm-like joints) or hind leg
  len: number;         // hip height above the ground (px)
  r: number;           // thigh radius
  phase: number;       // walk phase
  stride: number;
  type: Genome['legType'];
}

/** Draws one leg; returns the foot position. */
export function leg(S: Sketch, k: Kit, g: Genome, L: LegSpec, ph: number, o: PO = {}): V3 {
  const w = ph + L.phase;
  const lift = Math.max(0, -Math.cos(w)) * L.len * 0.16;
  const fwd = Math.sin(w) * L.stride;
  const r = L.r, lo = g.socks ? k.sock : k.limb;
  const out = L.type === 'sprawl' ? L.len * 0.6 : L.type === 'insectoid' ? L.len * 0.85 : L.type === 'tentacle' ? L.len * 0.3 : r * 0.3;
  const foot: V3 = [L.hip[0] + fwd, lift, L.hip[2] + L.side * out];
  const hipDn = L.hip;
  const pole: V3 = L.front ? [-1, 0, L.side * 0.2] : [1, 0, L.side * 0.2];
  switch (L.type) {
    case 'column': {
      S.limb(hipDn, add(foot, [0, r * 0.4, 0]), r * 1.1, r * 0.95, k.limb, o);
      S.limb(add(foot, [0, r * 0.5, 0]), add(foot, [0, r * 0.1, 0]), r * 0.98, r * 1.05, lo, o);
      for (let i = -1; i <= 1; i++) S.ball(add(foot, [r * 0.9, r * 0.25, i * r * 0.5]), Math.max(0.8, r * 0.22), k.horn, { ...o, bias: 0.3, noLine: true });
      break;
    }
    case 'plantigrade': {
      const ankle: V3 = add(foot, [-r * 0.2, L.len * 0.14, 0]);
      const d = Math.hypot(ankle[0] - hipDn[0], ankle[1] - hipDn[1], ankle[2] - hipDn[2]);
      const knee = ik3(hipDn, ankle, d * 0.55, d * 0.55, pole);
      S.limb(hipDn, knee, r * 1.15, r * 0.85, k.limb, o);
      S.limb(knee, ankle, r * 0.85, r * 0.7, lo, o);
      S.blob(add(foot, [r * 0.55, r * 0.35, 0]), [1, 0, 0], r * 1.2, r * 0.75, lo, o, r * 0.45);
      if (g.claws) for (let i = -1; i <= 1; i++) S.limb(add(foot, [r * 1.5, r * 0.35, i * r * 0.4]), add(foot, [r * 2.1, r * 0.05, i * r * 0.45]), 0.55, 0.35, k.claw, { ...o, bias: 0.2, noLine: true });
      break;
    }
    case 'digitigrade': case 'unguligrade': {
      const ung = L.type === 'unguligrade';
      const hock: V3 = L.front ? add(foot, [-L.len * 0.04, L.len * (ung ? 0.3 : 0.2), 0]) : add(foot, [-L.len * (ung ? 0.22 : 0.18), L.len * (ung ? 0.42 : 0.32), 0]);
      const d = Math.hypot(hock[0] - hipDn[0], hock[1] - hipDn[1], hock[2] - hipDn[2]);
      const knee = ik3(hipDn, hock, d * 0.56, d * 0.56, pole);
      const rr = ung ? r * 0.8 : r;
      S.limb(hipDn, knee, rr * 1.2, rr * 0.8, k.limb, o);
      S.limb(knee, hock, rr * 0.75, rr * 0.55, k.limb, o);
      S.limb(hock, add(foot, [0, ung ? rr * 0.9 : rr * 0.4, 0]), rr * 0.55, rr * 0.48, lo, o);
      if (ung) S.limb(add(foot, [0, rr * 0.9, 0]), add(foot, [rr * 0.25, rr * 0.15, 0]), rr * 0.58, rr * 0.72, k.claw, o);
      else {
        S.blob(add(foot, [rr * 0.45, rr * 0.4, 0]), [1, 0, 0], rr * 0.85, rr * 0.6, lo, o, rr * 0.45);
        if (g.claws) for (const i of [-1, 1]) S.limb(add(foot, [rr * 1.15, rr * 0.35, i * rr * 0.3]), add(foot, [rr * 1.7, rr * 0.05, i * rr * 0.32]), 0.55, 0.35, k.claw, { ...o, bias: 0.2, noLine: true });
      }
      break;
    }
    case 'avian': {
      const hock: V3 = add(foot, [-L.len * 0.25, L.len * 0.45, 0]);
      const d = Math.hypot(hock[0] - hipDn[0], hock[1] - hipDn[1], hock[2] - hipDn[2]);
      const knee = ik3(hipDn, hock, d * 0.56, d * 0.56, [1, 0, 0]);
      S.limb(hipDn, knee, r * 1.25, r * 0.85, k.limb, o);
      S.limb(knee, hock, r * 0.6, r * 0.45, k.limb, o);
      const scaly: Mat = { ...k.beak, tex: 'scales', texScale: 0.5 };
      S.limb(hock, add(foot, [0, 1, 0]), r * 0.38, r * 0.34, scaly, o);
      for (const [dx, dz] of [[1, 0], [0.8, 0.5], [0.8, -0.5], [-0.6, 0]]) S.limb(add(foot, [0, 0.8, 0]), add(foot, [dx * L.len * 0.22, 0.2, dz * L.len * 0.18]), 0.7, 0.45, scaly, o);
      break;
    }
    case 'insectoid': {
      const knee: V3 = [L.hip[0] + fwd * 0.5 + (L.front ? L.len * 0.15 : -L.len * 0.1), L.hip[1] + L.len * 0.35 + lift * 0.5, L.hip[2] + L.side * L.len * 0.5];
      S.limb(hipDn, knee, r * 0.7, r * 0.5, k.limb, o);
      S.limb(knee, foot, r * 0.5, 0.6, lo, o);
      S.ball(knee, r * 0.55, k.limb, o);
      break;
    }
    case 'sprawl': {
      const elbow: V3 = [L.hip[0] + fwd * 0.4, L.hip[1] - L.len * 0.05, L.hip[2] + L.side * L.len * 0.48];
      S.limb(hipDn, elbow, r * 1.1, r * 0.85, k.limb, o);
      S.limb(elbow, add(foot, [0, r * 0.3, 0]), r * 0.85, r * 0.65, lo, o);
      for (const a of [-0.6, 0, 0.6]) S.limb(add(foot, [0, r * 0.3, 0]), add(foot, [Math.cos(a) * r * 1.8, 0.2, L.side * Math.sin(a + L.side * 0.3) * r * 1.4]), r * 0.3, r * 0.2, lo, o);
      break;
    }
    case 'tentacle': {
      const pts: V3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push([L.hip[0] + fwd * t + Math.sin(ph * 1.3 + L.phase + t * 3) * r * 0.6 * t, L.hip[1] * (1 - t) + lift * t, L.hip[2] + L.side * out * t * t]);
      }
      pts.push(add(pts[6], [r * 1.2, 0, L.side * r * 0.4]));
      for (let i = 0; i < pts.length - 1; i++) S.limb(pts[i], pts[i + 1], r * (1 - i * 0.11), r * (1 - (i + 1) * 0.11), lo, o);
      break;
    }
    case 'stubby': default: {
      S.limb(hipDn, add(foot, [0, r * 0.6, 0]), r * 1.25, r * 1.05, k.limb, o);
      S.ball(add(foot, [r * 0.3, r * 0.6, 0]), r * 1.05, lo, o);
      break;
    }
  }
  return foot;
}

/** Tail from `root` pointing backwards. */
export function tail(S: Sketch, k: Kit, g: Genome, root: V3, len: number, r: number, ph: number, pitch = -0.35, o: PO = {}): V3[] {
  if (g.tail === 'none') return [root];
  const n = g.tail === 'whip' ? 9 : 7;
  const sway = (i: number): [number, number] => {
    const wv = Math.sin(ph - i * 0.55) * 0.09;
    if (g.tail === 'curl') return [i > 2 ? 0.5 : 0.1, wv];
    if (g.tail === 'stinger') return [i > 1 ? 0.55 : 0.2, wv * 0.5];
    if (g.tail === 'bushy') return [0.14, wv];
    return [0.05 + (pitch < -0.2 ? 0.06 : 0), wv];
  };
  const mat = k.body;
  const rr0 = g.tail === 'whip' ? r * 0.6 : g.tail === 'paddle' ? r * 0.8 : r;
  const pts = S.chain(root, Math.PI, pitch, n, len * (g.tail === 'whip' ? 1.4 : 1), rr0, g.tail === 'bushy' ? r * 0.6 : 1, sway, mat, { g: 3, ...o });
  const tip = pts[pts.length - 1], pre = pts[pts.length - 2];
  const dir: V3 = [tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]];
  switch (g.tail) {
    case 'tuft': S.ball(tip, Math.max(2, r * 0.9), k.tuft, o); break;
    case 'bushy': for (let i = 2; i < pts.length; i++) S.ball(pts[i], r * (0.8 + (i / pts.length) * 0.6), i === pts.length - 1 && g.tipColor ? k.tuft : { ...k.body, fuzz: 1.4 }, { g: 3, ...o }); break;
    case 'club': S.ball(tip, r * 1.4, k.plate, o); for (const s of [-1, 1]) S.limb(tip, add(tip, [0, r * 0.4, s * r * 1.6]), r * 0.4, 0.5, k.horn, o); break;
    case 'thagomizer': for (let i = 0; i < 4; i++) { const p = pts[pts.length - 1 - (i >> 1)], s = i % 2 ? 1 : -1; S.limb(p, add(p, [-r * 0.3, r * 1.2, s * r * 1.8]), r * 0.35, 0.5, k.horn, o); } break;
    case 'fin': case 'paddle': {
      const t2 = pts[Math.max(0, pts.length - 4)];
      if (g.tail === 'paddle') S.blob(lerp3(t2, tip, 0.6), dir, len * 0.28, r * 1.4, k.plate, o, r * 0.45);
      else S.poly([add(t2, [0, r * 0.6, 0]), add(lerp3(t2, tip, 0.5), [0, r * 2.4, 0]), add(tip, [-r * 0.8, r * 0.6, 0]), add(lerp3(t2, tip, 0.6), [0, -r * 1.6, 0])], k.fin, { flat: 0.6, ...o });
      break;
    }
    case 'fan': for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; S.limb(tip, add(tip, [-len * 0.45, len * 0.25 + Math.sin(a) * len * 0.1, Math.sin(a) * len * 0.35]), r * 0.5, r * 0.8, i % 2 ? k.crest : k.mark, { g: 4, ...o }); } break;
    case 'stinger': S.limb(tip, add(tip, [r * 1.6, -r * 0.8, 0]), r * 0.7, 0.5, k.claw, o); break;
    case 'whip': case 'curl': case 'plain': default:
      if (g.tipColor && g.tail !== 'whip') S.ball(tip, Math.max(1, r * 0.35), k.tuft, o);
      break;
  }
  return pts;
}

/** Pair of wings on the shoulders (flap 0..1 from folded-up to spread). */
export function wings(S: Sketch, k: Kit, g: Genome, sh: V3, span: number, ph: number, halfWidth: number) {
  const insect = g.wings === 'insect';
  const flap = Math.sin(ph * (insect ? 2 : 1));
  const th = 0.55 + flap * 0.45;                                   // angle above horizontal
  for (const s of [-1, 1]) {
    const root = add(sh, [0, 0, s * halfWidth * 0.6]);
    const dir = (t: number, back: number): V3 => add(root, [-back, Math.sin(th) * span * t, s * Math.cos(th) * span * t]);
    if (insect) {
      for (let i = 0; i < 2; i++) {
        const tipP = dir(1, span * (0.25 + i * 0.35));
        S.blob(lerp3(root, tipP, 0.5), [tipP[0] - root[0], tipP[1] - root[1], tipP[2] - root[2]], span * 0.5, span * 0.14, { ...k.membrane, alpha: 0.5, tex: 'fin', line: [60, 70, 90] }, { flat: 0.4 });
      }
      continue;
    }
    if (g.wings === 'feather') {
      const lead = [dir(0, 0), dir(0.45, -span * 0.05), dir(0.8, span * 0.1), dir(1, span * 0.3)];
      const trail = [dir(0.9, span * 0.55), dir(0.6, span * 0.62), dir(0.3, span * 0.5), dir(0.05, span * 0.35)];
      S.poly([...lead, ...trail], { ...k.body, tex: 'feathers', texScale: 1.1, belly: undefined, fuzz: 0.4 }, { flat: 0.35 });
      for (let i = 0; i < 5; i++) {
        const t = 1 - i * 0.18, a = dir(t, span * (0.3 + i * 0.06));
        S.limb(a, add(a, [-span * 0.28, -span * 0.05, 0]), span * 0.05, span * 0.035, i % 2 ? k.crest : k.body, {});
      }
      S.limb(lead[0], lead[1], span * 0.07, span * 0.05, k.body);
    } else {
      // membrane: finger bones with skin stretched to the flank
      const wrist = dir(0.45, -span * 0.05);
      const f = [dir(1, span * 0.15), dir(0.85, span * 0.45), dir(0.6, span * 0.7)];
      S.poly([root, wrist, f[0], lerp3(f[0], f[1], 0.5), f[1], lerp3(f[1], f[2], 0.5), f[2], add(root, [-span * 0.55, -span * 0.05, 0])], { ...k.membrane, alpha: 0.92 }, { flat: 0.35 });
      S.limb(root, wrist, span * 0.06, span * 0.05, k.limb);
      for (const fp of f) S.limb(wrist, fp, span * 0.035, 0.6, k.limb);
      S.limb(wrist, add(wrist, [span * 0.05, span * 0.08, 0]), 0.7, 0.4, k.claw);
    }
  }
}

/** Ornaments along the spine from `a` (hips) to `b` (shoulders); `rad(t)` = body radius there. */
export function backFeature(S: Sketch, k: Kit, g: Genome, a: V3, b: V3, rad: (t: number) => number, unit: number, ph: number) {
  const top = (t: number): V3 => { const p = lerp3(a, b, t); return add(p, [0, rad(t) * 0.9, 0]); };
  switch (g.back) {
    case 'spines': for (let i = 0; i < 8; i++) { const t = 0.05 + i * 0.12, p = top(t); S.limb(p, add(p, [-unit * 0.1, unit * 0.3 * (0.6 + Math.sin(t * Math.PI) * 0.5), 0]), unit * 0.07, 0.5, k.horn); } break;
    case 'plates': for (let i = 0; i < 5; i++) {
      const t = 0.08 + i * 0.2, p = top(t), hgt = unit * 0.5 * (0.6 + Math.sin(t * Math.PI) * 0.5), s = i % 2 ? 1 : -1;
      S.poly([add(p, [-unit * 0.16, -1, s]), add(p, [-unit * 0.08, hgt * 0.7, s * 1.5]), add(p, [unit * 0.04, hgt, s * 1.5]), add(p, [unit * 0.16, -1, s])], k.plate);
    } break;
    case 'sail': case 'ridge': {
      const pts: V3[] = [];
      const hh = g.back === 'sail' ? unit * 0.8 : unit * 0.22;
      for (let i = 0; i <= 8; i++) { const t = 0.05 + i * 0.11; pts.push(add(top(t), [0, hh * Math.sin((i / 8) * Math.PI) + Math.sin(ph + i) * 0.3, 0])); }
      for (let i = 8; i >= 0; i--) pts.push(add(top(0.05 + i * 0.11), [0, -2, 0]));
      S.poly(pts, g.back === 'sail' ? { ...k.crest, tex: 'fin', fuzz: 0 } : k.mark, { flat: 0.45 });
      if (g.back === 'sail') for (let i = 1; i < 8; i++) { const p = top(0.05 + i * 0.11); S.limb(p, add(p, [0, hh * Math.sin((i / 8) * Math.PI), 0]), 0.5, 0.4, k.horn, { noLine: true, bias: 0.1 }); }
      break;
    }
    case 'shell': { const m = lerp3(a, b, 0.5); S.blob(add(m, [0, rad(0.5) * 0.35, 0]), [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.66, rad(0.5) * 1.12, { ...k.plate, texScale: 1.3 }, { g: 5 }, rad(0.5) * 0.95); break; }
    case 'quills': for (let i = 0; i < 12; i++) { const t = 0.02 + i * 0.075, p = top(t), s = (i % 3) - 1; S.limb(p, add(p, [-unit * 0.45, unit * 0.22, s * unit * 0.2]), 0.7, 0.4, i % 3 ? k.horn : k.claw); } break;
    case 'hump': { const p = top(0.62); S.ball(add(p, [0, unit * 0.1, 0]), rad(0.62) * 0.7, k.body, { g: 1 }); break; }
    case 'crystals': for (let i = 0; i < 6; i++) { const p = top(0.1 + i * 0.15), s = (i % 3) - 1; S.limb(p, add(p, [unit * 0.05, unit * (0.35 + (i % 2) * 0.2), s * unit * 0.15]), unit * 0.1, 0.6, { ...k.glow, alpha: 0.9, line: [40, 40, 80] }); } break;
    case 'mane': default: break;
  }
  if (g.pattern === 'dorsal' || g.pattern === 'saddle') {
    const t0 = g.pattern === 'saddle' ? 0.3 : 0, t1 = g.pattern === 'saddle' ? 0.7 : 1;
    for (let i = 0; i <= 6; i++) { const t = t0 + (t1 - t0) * (i / 6); S.blob(add(lerp3(a, b, t), [0, rad(t) * 0.7, 0]), [b[0] - a[0], b[1] - a[1], b[2] - a[2]], rad(t) * 0.5, rad(t) * 0.5, k.mark, { g: 1, bias: 0.01 }, rad(t) * 0.35); }
  }
}
void mul;
