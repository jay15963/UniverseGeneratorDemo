// Leviathans: the apex category of the lineage, beside the normal and giant forms. They are not a bigger version of the
// species but a body plan of their own, picked from the genome and drawn with the species' colours, pattern, eyes and
// glow: at sea the abyssal serpent, the kraken, the armoured placoderm, the filter whale, the colossal sea scorpion,
// the abyssal manta and the colossal medusa; on land the dinosaur-like apex - sauropod, tyrant, armoured ankylo-
// ceratopsian, hexapod behemoth and colossal serpent. Flat 2D pieces placed through the Sketch (8 facings, 8 frames),
// the same art as every other creature.
import { Genome, Stage } from './genome';
import { Kit } from './kit';
import { Sketch, V3, add, lerp3, PO } from './pose';
import { leg, tail, LegSpec } from './limbs';
import { drawHead } from './head';
import { Mat, darkenRamp } from './raster';

const TAU = Math.PI * 2;

export type SeaLeviathan = 'serpent' | 'kraken' | 'placoderm' | 'whale' | 'scorpion' | 'manta' | 'medusa';
export type LandLeviathan = 'sauropod' | 'tyrant' | 'armoured' | 'behemoth' | 'serpent';
export const SEA_LEVIATHAN_PT: Record<SeaLeviathan, string> = {
  serpent: 'Serpente abissal', kraken: 'Kraken', placoderm: 'Placodermo couraçado', whale: 'Baleia-fantasma filtradora',
  scorpion: 'Escorpião-do-mar colossal', manta: 'Manta abissal', medusa: 'Medusa colossal',
};
export const LAND_LEVIATHAN_PT: Record<LandLeviathan, string> = {
  sauropod: 'Saurópode colossal', tyrant: 'Tirano', armoured: 'Couraçado de chifres', behemoth: 'Behemoth hexápode', serpent: 'Serpente colossal',
};

/** the sea leviathan follows the species' aquatic form (fish: predators become placoderms, the rest filter whales) */
export function seaLeviathan(g: Genome): SeaLeviathan {
  switch (g.aquaForm) {
    case 'eel': return 'serpent';
    case 'cephalopod': return 'kraken';
    case 'crustacean': return 'scorpion';
    case 'ray': return 'manta';
    case 'jelly': return 'medusa';
    default: return g.params.diet > 0.55 ? 'placoderm' : g.r[60] < 0.25 ? 'serpent' : 'whale';
  }
}
/** the land leviathan: serpents stay serpents, many-legged ones become behemoths, predators tyrants, armoured ones horned tanks */
export function landLeviathan(g: Genome): LandLeviathan {
  if (g.locomotion === 'serpent') return 'serpent';
  if (g.locomotion === 'hexapod' || g.locomotion === 'octopod') return 'behemoth';
  if (g.params.diet > 0.6) return 'tyrant';
  if (g.covering === 'plates' || g.covering === 'chitin' || g.back === 'plates' || g.back === 'shell' || g.back === 'spines' || g.r[61] < 0.3) return 'armoured';
  return 'sauropod';
}
export const leviathanName = (g: Genome, stage: Stage) => (stage === Stage.AQUA_LEVIATHAN ? SEA_LEVIATHAN_PT[seaLeviathan(g)] : LAND_LEVIATHAN_PT[landLeviathan(g)]);

// --- shared pieces ------------------------------------------------------------------------------------------------------
function eye(S: Sketch, k: Kit, c: V3, r: number, side: number, blink: boolean, glowRing = false) {
  const vis = S.facing([0.3, 0.15, side]);
  if (vis < -0.1) return;
  const wf = Math.max(0.3, Math.min(1, 0.35 + vis));
  if (blink) { S.poly2(c, [-r * wf, -0.6, r * wf, -0.6, r * wf, 0.6, -r * wf, 0.6], k.lid, { bias: 0.4 }); return; }
  if (glowRing) S.disc(c, r * 1.25 * wf, r * 1.25, 0, k.glow, { bias: 0.39, noLine: true });
  S.disc(c, r * wf, r, 0, k.sclera, { bias: 0.4 });
  S.disc(c, r * 0.75 * wf, r * 0.75, 0, k.iris, { bias: 0.41, noLine: true });
  S.disc(c, r * 0.32 * wf, r * 0.62, 0, k.pupil, { bias: 0.42, noLine: true });
  S.poly2(c, [-r * 0.5, -r * 0.6, -r * 0.1, -r * 0.6, -r * 0.1, -r * 0.2, -r * 0.5, -r * 0.2], k.shine, { bias: 0.43, noLine: true });
}
/** a body tube along spine points (blobs per segment), radius profile rad(t) and height ratio hy */
function tube(S: Sketch, sp: V3[], rad: (t: number) => number, m: Mat, o: PO = {}, hy = 1) {
  const n = sp.length - 1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, c = lerp3(sp[i], sp[i + 1], 0.5);
    const seg = Math.hypot(sp[i][0] - sp[i + 1][0], sp[i][1] - sp[i + 1][1], sp[i][2] - sp[i + 1][2]);
    S.blob(c, [sp[i][0] - sp[i + 1][0], sp[i][1] - sp[i + 1][1], sp[i][2] - sp[i + 1][2]], seg * 0.62 + rad(t) * 0.35, rad(t), m, o, rad(t) * hy);
  }
}
const barnacles = (S: Sketch, k: Kit, pts: V3[], r: number) => pts.forEach((p, i) => { for (let j = 0; j < 4; j++) S.ball(add(p, [Math.cos(j * 1.7 + i) * r * 1.3, (j % 2) * r * 0.4, Math.sin(j * 1.7 + i) * r * 1.3]), r * (0.55 + ((i + j) % 3) * 0.15), k.horn, { noLine: j > 0, bias: 0.15 }); });
const photophores = (S: Sketch, k: Kit, pts: V3[], r: number, ph: number) => pts.forEach((p, i) => S.ball(p, r * (0.75 + 0.35 * Math.max(0, Math.sin(ph + i * 0.9))), k.glow, { noLine: true, bias: 0.25 }));

// =========================================================================================================================
// SEA
// =========================================================================================================================
export function buildSeaLeviathan(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean) {
  const U = 58 * (0.85 + g.size * 0.3);
  const amp = S.anim === 'idle' ? 0.4 : S.anim === 'run' ? 1.4 : 1;
  switch (seaLeviathan(g)) {
    case 'serpent': return seaSerpent(S, k, g, ph, blink, U, amp);
    case 'kraken': return kraken(S, k, g, ph, blink, U, amp);
    case 'placoderm': return placoderm(S, k, g, ph, blink, U, amp);
    case 'whale': return whale(S, k, g, ph, blink, U, amp);
    case 'scorpion': return seaScorpion(S, k, g, ph, blink, U, amp);
    case 'manta': return manta(S, k, g, ph, blink, U, amp);
    case 'medusa': return medusa(S, k, g, ph, U);
  }
}

// --- abyssal serpent: an endless undulating body, a crest of spined fin, a horned dragon-fish head ------------------------
function seaSerpent(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const n = 26, L = U * 6.2 * (0.85 + g.length * 0.3), R = U * 0.3 * g.girth;
  const sp: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sp.push([L * 0.42 - t * L, Math.sin(ph * 2 - t * 5) * U * 0.12 * t * amp, Math.sin(ph - t * 7) * U * 0.42 * (0.15 + t) * amp]);
  }
  const rad = (t: number) => R * (t < 0.06 ? 0.75 + t * 4 : t < 0.3 ? 1 + Math.sin((t - 0.06) / 0.24 * Math.PI) * 0.12 : 1 - (t - 0.3) / 0.7 * 0.82);
  // the crest: one long spined fin along the whole back, and the tail fan
  const top: V3[] = [], base: V3[] = [];
  for (let i = 2; i <= n; i++) {
    const t = i / n, h = U * 0.34 * Math.sin(Math.min(1, (t - 0.05) / 0.9) * Math.PI) * (0.8 + 0.2 * Math.sin(i * 1.3));
    top.push(add(sp[i], [-U * 0.05, rad(t) * 0.8 + h, 0])); base.push(add(sp[i], [0, rad(t) * 0.5, 0]));
  }
  S.poly([...top, ...base.reverse()], k.fin, { flat: 0.6, bias: -1 });
  for (let i = 3; i < n; i += 2) { const t = i / n; S.limb(add(sp[i], [0, rad(t) * 0.6, 0]), top[i - 2], 0.9, 0.4, { ...k.horn, alpha: 0.9 }, { noLine: true, bias: -0.9 }); }
  const tp = sp[n], pre = sp[n - 2];
  const bk: V3 = [tp[0] - pre[0], 0, tp[2] - pre[2]], bl = Math.hypot(bk[0], bk[2]) || 1;
  const tb = (x: number, y: number): V3 => add(tp, [bk[0] / bl * x, y, bk[2] / bl * x]);
  S.poly([tb(-U * 0.3, R * 0.3), tb(U * 0.7, U * 0.55), tb(U * 0.35, 0), tb(U * 0.7, -U * 0.5), tb(-U * 0.3, -R * 0.3)], k.fin, { flat: 0.6 });
  // body: back over a pale belly band, scute plates on the neck
  tube(S, sp, rad, k.body, { g: 1 }, 1.05);
  for (let i = 1; i < n - 3; i++) S.blob(add(lerp3(sp[i], sp[i + 1], 0.5), [0, -rad(i / n) * 0.5, 0]), [1, 0, 0], L / n * 0.6, rad(i / n) * 0.7, k.inner, { g: 1 }, rad(i / n) * 0.35);
  for (let i = 1; i < 8; i++) S.blob(add(sp[i], [0, rad(i / n) * 0.82, 0]), [1, 0, 0], L / n * 0.45, rad(i / n) * 0.45, k.plate, { g: 2 }, rad(i / n) * 0.22);
  if (g.glow > 0.12) photophores(S, k, sp.slice(2, n - 2).map((p, i) => add(p, [0, 0, (i % 2 ? 1 : -1) * rad((i + 2) / n) * 0.95])), 1.1, ph);
  serpentHead(S, k, g, sp[0], [sp[0][0] - sp[1][0], sp[0][1] - sp[1][1], sp[0][2] - sp[1][2]], R, U, ph, blink);
}
/** a dragon-fish head: a long armoured skull, gaping toothed jaws, swept-back horns, a frill of fin rays and barbels */
function serpentHead(S: Sketch, k: Kit, g: Genome, neck: V3, dir0: V3, R: number, U: number, ph: number, blink: boolean) {
  const l = Math.hypot(dir0[0], dir0[2]) || 1, d: V3 = [dir0[0] / l, 0, dir0[2] / l], side: V3 = [-d[2], 0, d[0]];
  const at = (f: number, y: number, z: number): V3 => [neck[0] + d[0] * f + side[0] * z, neck[1] + y, neck[2] + d[2] * f + side[2] * z];
  const H = R * 1.25, gape = (0.25 + 0.35 * Math.max(0, Math.sin(ph))) * H;
  // fin-ray frill behind the skull
  for (const s of [-1, 1]) S.poly([at(-R * 0.2, H * 0.4, s * R * 0.6), at(-R * 1.4, H * 1.3, s * R * 1.3), at(-R * 1.8, H * 0.1, s * R * 1.4), at(-R * 0.6, -H * 0.2, s * R * 0.7)], k.fin, { flat: 0.6, bias: -0.5 });
  // swept horns
  for (const s of [-1, 1]) S.chain(at(R * 0.2, H * 0.7, s * R * 0.45), Math.atan2(-d[2], -d[0]) + s * 0.25, 0.55, 5, U * 0.75, R * 0.28, 0.6, i => [-0.12 - i * 0.02, 0], k.horn, { bias: -0.2 });
  // lower jaw, mouth, upper skull
  S.limb(at(0, -H * 0.2 - gape * 0.2, 0), at(R * 2.4, -H * 0.35 - gape, 0), R * 0.55, R * 0.25, k.body, { g: 5 });
  S.limb(at(R * 0.4, -H * 0.05, 0), at(R * 2.3, -H * 0.2 - gape * 0.5, 0), R * 0.45 + gape * 0.3, R * 0.15, k.mouth, { g: 6, noLine: true });
  S.limb(at(-R * 0.1, H * 0.1, 0), at(R * 2.6, -H * 0.02, 0), H * 0.72, R * 0.3, k.body, { g: 5 });
  S.blob(at(R * 0.6, H * 0.45, 0), [d[0], 0.15, d[2]], R * 1.3, R * 0.6, k.plate, { g: 5 }, R * 0.25);
  for (let i = 0; i < 6; i++) for (const sgn of [1, -1]) {
    const f = R * (0.9 + i * 0.28);
    S.poly2(at(f, sgn > 0 ? -H * 0.12 - gape * (f / (R * 2.6)) * 0.5 : -H * 0.3 - gape * (f / (R * 2.4)), 0), sgn > 0 ? [-1.2, 0, 1.2, 0, 0, 3.4] : [-1.2, 0, 1.2, 0, 0, -3.4], k.teeth, { bias: 0.35, noLine: true });
  }
  for (const s of [-1, 1]) {
    eye(S, k, at(R * 0.9, H * 0.3, s * R * 0.62), Math.max(1.8, R * 0.3 * g.eyeSize), s, blink, g.glow > 0.2);
    S.chain(at(R * 1.8, -H * 0.4, s * R * 0.3), Math.atan2(d[2], d[0]) + s * 0.4, -0.7, 6, U * 0.8, 1.2, 0.5, j => [Math.sin(ph - j * 0.7) * 0.18, s * 0.05], k.skinWet);
  }
}

// --- kraken: a mantle like a cathedral, eight arms with suckers, two hunting tentacles with clubs, a dinner-plate eye ----
function kraken(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const head: V3 = [U * 0.2, 0, 0];
  const arm: Mat = { ...k.body, pattern: null, belly: undefined };
  const sucker: Mat = { ...k.inner, spec: 0.4 };
  const pulse = 1 + Math.sin(ph) * 0.05 * amp;
  // arms: a writhing crown, suckers on their inner face
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, root = add(head, [U * 0.35, Math.sin(a) * U * 0.28, Math.cos(a) * U * 0.32]);
    const spread = Math.sin(a) * 0.45, curl = (i % 2 ? 1 : -1) * 0.04;
    const pts = S.chain(root, Math.cos(a) * 0.55, spread, 11, U * (2.3 + (i % 3) * 0.3), U * 0.2, 1, j => [Math.sin(ph - j * 0.55 + i) * 0.11 * amp - spread * 0.05, curl + Math.sin(ph * 0.5 + j * 0.4 + i) * 0.05], arm, { g: 3 + i });
    for (let j = 2; j < pts.length - 1; j++) S.ball(add(pts[j], [0, -U * 0.05, 0]), Math.max(0.8, U * 0.07 * (1 - j / 12)), sucker, { noLine: j > 6, bias: 0.05 });
  }
  // the two long hunting tentacles with toothed clubs
  for (const s of [-1, 1]) {
    const pts = S.chain(add(head, [U * 0.45, -U * 0.05, s * U * 0.12]), s * 0.1, 0.05, 14, U * 4.2, U * 0.09, U * 0.07, j => [Math.sin(ph * 1.3 - j * 0.45 + s) * 0.08 * amp, s * Math.sin(ph - j * 0.3) * 0.03], arm, { g: 20 + s });
    const tip = pts[pts.length - 1], pre = pts[pts.length - 3];
    S.blob(lerp3(pre, tip, 0.5), [tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]], U * 0.42, U * 0.18, arm, { g: 20 + s });
    for (let j = 0; j < 5; j++) S.ball(lerp3(pre, tip, j / 4), U * 0.06, k.teeth, { bias: 0.1 });
  }
  // mantle: long, ridged, with a pair of fins at its point and a siphon underneath
  const mc: V3 = [-U * 1.1, U * 0.25, 0], ma: V3 = [-1, 0.18, 0];
  for (const s of [-1, 1]) S.poly([add(mc, [-U * 0.9, U * 0.05, 0]), add(mc, [-U * 1.7, U * 0.1, s * U * 1.0 * pulse]), add(mc, [-U * 2.05, U * 0.12, s * U * 0.2])], k.fin, { flat: 0.5, bias: -0.5 });
  S.blob(mc, ma, U * 1.55, U * 0.72 * g.girth * pulse, k.body, { g: 1 }, U * 0.72 * pulse);
  for (let i = 0; i < 5; i++) S.blob(add(mc, [U * 0.8 - i * U * 0.42, U * 0.62 * pulse, 0]), ma, U * 0.3, U * 0.09, k.mark, { g: 1 }, U * 0.05);
  S.limb(add(head, [-U * 0.1, -U * 0.4, 0]), add(head, [U * 0.25, -U * 0.55 - Math.sin(ph) * U * 0.05, 0]), U * 0.16, U * 0.11, k.skinWet);
  S.ball(head, U * 0.58, k.body, { g: 1 });
  for (const s of [-1, 1]) eye(S, k, add(head, [U * 0.08, U * 0.12, s * U * 0.48]), Math.max(2, U * 0.24 * g.eyeSize), s, blink, g.glow > 0.3);
  if (g.glow > 0.12) photophores(S, k, Array.from({ length: 9 }, (_, i) => add(mc, [U * 1.1 - i * U * 0.28, U * 0.2 + Math.sin(i) * U * 0.2, (i % 2 ? 1 : -1) * U * 0.6])), 1.2, ph);
}

// --- armoured placoderm: a bony helm with shearing jaw plates, heavy shark tail -------------------------------------------
function placoderm(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const n = 11, len = U * 3.4 * (0.85 + g.length * 0.3), H = U * 0.62 * g.girth, Wd = H * 0.7;
  const sp: V3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; sp.push([len * 0.45 - t * len, 0, Math.sin(ph - t * 3.6) * U * 0.2 * t * t * amp]); }
  const prof = (t: number) => (t < 0.25 ? 0.8 + t * 0.8 : 1 - Math.pow((t - 0.25) / 0.75, 1.3) * 0.84);
  const armour: Mat = { ...k.plate, tex: 'plates', texScale: 1.7, spec: 0.45 };
  const tp = sp[n], pre = sp[n - 1], bk: V3 = [tp[0] - pre[0], 0, tp[2] - pre[2]], bl = Math.hypot(bk[0], bk[2]) || 1;
  const tb = (x: number, y: number): V3 => add(tp, [bk[0] / bl * x, y, bk[2] / bl * x]);
  const F = U * 1.1;
  S.poly([tb(0, H * 0.2), tb(F * 1.25, F * 1.1), tb(F * 0.55, 0), tb(F * 0.7, -F * 0.5), tb(0, -H * 0.2)], k.fin, { flat: 0.55 });
  // dorsal & pectorals
  S.poly([add(sp[3], [0, H * 0.8, 0]), add(sp[4], [-U * 0.3, H * 1.7, 0]), add(sp[5], [-U * 0.2, H * 0.75, 0])], k.fin, { flat: 0.55, bias: -0.2 });
  for (const s of [-1, 1]) S.poly([add(sp[2], [0, -H * 0.3, s * Wd * 0.8]), add(sp[3], [-U * 0.5, -H * 0.8 - Math.sin(ph * 2) * U * 0.1, s * U * 0.9]), add(sp[3], [0, -H * 0.5, s * Wd * 0.4])], k.fin, { flat: 0.5 });
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; S.blob(lerp3(sp[i], sp[i + 1], 0.5), [sp[i][0] - sp[i + 1][0], 0, sp[i][2] - sp[i + 1][2]], len / n * 0.9, Wd * prof(t), k.body, { g: 1 }, H * prof(t)); }
  // the helm: overlapping bony plates over the head and the front third, rivet-like tubercles
  const hc = sp[0];
  S.blob(add(hc, [-U * 0.15, H * 0.1, 0]), [1, 0, 0], U * 0.95, Wd * 1.05, armour, { g: 2 }, H * 1.02);
  S.blob(add(sp[2], [0, H * 0.25, 0]), [1, 0, 0], U * 0.75, Wd * 0.95, armour, { g: 2 }, H * 0.85);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) S.ball(add(hc, [-U * 0.1 - i * U * 0.2, H * (0.5 + 0.15 * Math.sin(i)), s * Wd * 0.55]), U * 0.05, k.horn, { noLine: true, bias: 0.2 });
  // shearing jaw blades (no teeth: bone edges), gape opens on the loop
  const open = (0.35 + 0.35 * Math.max(0, Math.sin(ph))) * H * 0.6;
  S.limb(add(hc, [U * 0.3, -H * 0.2, 0]), add(hc, [U * 0.95, -H * 0.35, 0]), H * 0.28, H * 0.12, armour, { bias: 0.2 });
  S.limb(add(hc, [U * 0.25, -H * 0.45 - open, 0]), add(hc, [U * 0.9, -H * 0.55 - open * 1.2, 0]), H * 0.3, H * 0.12, armour, { bias: 0.19 });
  S.limb(add(hc, [U * 0.35, -H * 0.3, 0]), add(hc, [U * 0.85, -H * 0.4 - open * 0.8, 0]), H * 0.2 + open * 0.3, H * 0.08, k.mouth, { bias: 0.18, noLine: true });
  for (const s of [-1, 1]) {
    S.poly2(add(hc, [U * 0.9, -H * 0.37, s * U * 0.05]), [-2, 0, 2, 0, 0, 4], k.teeth, { bias: 0.25, noLine: true });
    S.poly2(add(hc, [U * 0.85, -H * 0.52 - open * 1.1, s * U * 0.05]), [-2, 0, 2, 0, 0, -4], k.teeth, { bias: 0.25, noLine: true });
    eye(S, k, add(hc, [U * 0.35, H * 0.35, s * Wd * 0.7]), Math.max(1.8, H * 0.2 * g.eyeSize), s, blink);
  }
  if (g.glow > 0.3) photophores(S, k, sp.slice(3, n - 1).map(p => add(p, [0, -H * 0.5, 0])), 1, ph);
}

// --- filter whale: a mountain of a body, throat pleats, baleen, barnacles, long knobbed flippers, horizontal flukes ------
function whale(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const n = 12, len = U * 4.4 * (0.85 + g.length * 0.3), H = U * 0.75 * g.girth, Wd = H * 0.95;
  const sp: V3[] = [];
  // whales beat up and down: the wave runs in the vertical plane
  for (let i = 0; i <= n; i++) { const t = i / n; sp.push([len * 0.42 - t * len, Math.sin(ph - t * 3.2) * U * 0.22 * t * t * amp, 0]); }
  const prof = (t: number) => (t < 0.18 ? 0.75 + t * 1.35 : 1 - Math.pow((t - 0.18) / 0.82, 1.5) * 0.88);
  // flukes in the horizontal plane
  const tp = sp[n], pre = sp[n - 1];
  const up = (tp[1] - pre[1]) / (len / n);
  for (const s of [-1, 1]) S.poly([add(tp, [U * 0.15, 0, 0]), add(tp, [-U * 0.55, -up * U * 0.4, s * U * 1.25]), add(tp, [-U * 0.85, -up * U * 0.5, s * U * 1.15]), add(tp, [-U * 0.3, 0, s * U * 0.1])], { ...k.body, pattern: null }, { flat: 0.3, g: 3 });
  // flippers: long, with knobs on the leading edge
  for (const s of [-1, 1]) {
    const r0 = add(sp[3], [0, -H * 0.35, s * Wd * 0.8]), sw = Math.sin(ph) * 0.25;
    const pts = S.chain(r0, s * 1.9, -0.55 + sw, 6, U * 1.9, U * 0.22, U * 0.08, j => [0.02, s * 0.06], { ...k.body, pattern: null }, { g: 4 + s });
    for (let j = 1; j < pts.length - 1; j += 2) S.ball(pts[j], U * 0.07, k.horn, { bias: 0.1 });
  }
  // body, pale throat with pleats, small dorsal hump
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; S.blob(lerp3(sp[i], sp[i + 1], 0.5), [sp[i][0] - sp[i + 1][0], sp[i][1] - sp[i + 1][1], 0], len / n * 0.9, Wd * prof(t), k.body, { g: 1 }, H * prof(t)); }
  S.blob(add(lerp3(sp[1], sp[3], 0.5), [0, -H * 0.55, 0]), [1, 0, 0], U * 1.25, Wd * 0.8, k.inner, { g: 1 }, H * 0.45);
  for (let i = 0; i < 7; i++) { const x = sp[0][0] - U * 0.2 - i * U * 0.16; S.limb([x + U * 0.15, sp[1][1] - H * 0.3, (i - 3) * Wd * 0.12], [x - U * 1.1, sp[3][1] - H * 0.5, (i - 3) * Wd * 0.14], 0.5, 0.5, { ...k.mouth, ramp: darkenRamp(k.inner.ramp, 0.7) }, { noLine: true, bias: 0.2 }); }
  S.poly([add(sp[7], [0, H * prof(7 / n) * 0.9, 0]), add(sp[8], [-U * 0.2, H * prof(8 / n) + U * 0.35, 0]), add(sp[9], [0, H * prof(9 / n) * 0.85, 0])], k.fin, { flat: 0.5, bias: -0.1 });
  // head: a long mouth line with a baleen fringe, an eye in the corner, blowholes, barnacles
  const hc = sp[0];
  const gape = Math.max(0, Math.sin(ph)) * H * 0.18;
  S.limb(add(hc, [U * 0.55, -H * 0.1, 0]), add(hc, [-U * 0.75, -H * 0.3 - gape, 0]), 1, 1.2, k.mouth, { noLine: true, bias: 0.3 });
  for (let i = 0; i < 9; i++) { const p = add(hc, [U * 0.45 - i * U * 0.13, -H * 0.18 - gape * (i / 9), 0]); S.poly2(p, [-1.2, 0, 1.2, 0, 0.2, 3 + gape * 0.3], k.teeth, { bias: 0.31, noLine: true }); }
  for (const s of [-1, 1]) eye(S, k, add(hc, [-U * 0.85, -H * 0.05, s * Wd * 0.72]), Math.max(1.6, H * 0.12 * g.eyeSize), s, blink);
  for (const s of [-1, 1]) S.ball(add(sp[1], [0, H * 0.95, s * U * 0.08]), U * 0.06, k.mouth, { bias: 0.3, noLine: true });
  barnacles(S, k, [add(hc, [U * 0.2, H * 0.6, U * 0.2]), add(hc, [0, H * 0.7, -U * 0.25]), add(sp[1], [0, H * 0.8, U * 0.35]), add(sp[2], [0, H * 0.7, -U * 0.4]), add(hc, [U * 0.4, H * 0.35, -U * 0.35])], U * 0.09);
  if (g.glow > 0.35) photophores(S, k, sp.slice(3, n - 2).map((p, i) => add(p, [0, -H * prof((i + 3) / n) * 0.7, (i % 2 ? 1 : -1) * Wd * 0.5])), 1, ph);
}

// --- colossal sea scorpion: a shield head, segmented abdomen, paddle legs, a telson spike and grasping claws -----------
function seaScorpion(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const shell: Mat = { ...k.body, tex: 'chitin', spec: 0.75, fuzz: 0, texScale: 1.4 };
  const dark: Mat = { ...shell, ramp: darkenRamp(shell.ramp, 0.75) };
  // abdomen: 12 segments narrowing back, the tail ends in a curved telson
  let p: V3 = [-U * 0.45, 0, 0];
  const segs: V3[] = [p];
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + Math.sin(ph - i * 0.5) * 0.05 * amp, yw = Math.sin(ph - i * 0.45) * 0.08 * amp;
    const l = U * (0.3 - i * 0.008);
    p = [p[0] + Math.cos(a) * Math.cos(yw) * l, p[1] + (i > 8 ? U * 0.05 : 0), p[2] + Math.sin(yw) * l];
    segs.push(p);
  }
  for (let i = 0; i < 12; i++) { const w = U * (0.62 - i * 0.042); S.blob(lerp3(segs[i], segs[i + 1], 0.5), [segs[i][0] - segs[i + 1][0], 0, segs[i][2] - segs[i + 1][2]], U * 0.2, Math.max(U * 0.1, w), i % 2 ? shell : dark, { g: 2 }, Math.max(U * 0.08, w * 0.4)); }
  const tip = segs[12];
  S.limb(tip, add(tip, [-U * 0.9, U * 0.35, 0]), U * 0.1, 0.8, k.claw, { bias: 0.1 });
  // paddles (the last leg pair) and walking legs with spines
  for (const s of [-1, 1]) {
    const sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.4 * amp;
    const base: V3 = [-U * 0.25, -U * 0.05, s * U * 0.45];
    const pts = S.chain(base, s * (1.9 + sw), -0.1, 3, U * 1.0, U * 0.12, U * 0.1, () => [0, 0], shell);
    S.blob(pts[3], [Math.cos(s * (1.9 + sw)), 0, Math.sin(s * (1.9 + sw))], U * 0.42, U * 0.28, { ...shell, tex: 'fin' }, { flat: 0.5 }, U * 0.05);
    for (let i = 0; i < 4; i++) {
      const hip: V3 = [U * (0.55 - i * 0.2), -U * 0.12, s * U * 0.4];
      const legPts = S.chain(hip, s * (1.2 + i * 0.25), -0.5, 3, U * (0.8 + i * 0.1), U * 0.07, U * 0.04, j => [Math.sin(ph + i * 1.1 + (s > 0 ? Math.PI : 0)) * 0.15 * amp, 0], dark);
      for (let j = 1; j < legPts.length; j++) S.limb(legPts[j], add(legPts[j], [U * 0.1, U * 0.06, s * U * 0.05]), 0.7, 0.4, k.claw, { noLine: true, bias: 0.05 });
    }
  }
  // the grasping claws in front, opening and closing
  for (const s of [-1, 1]) {
    const pts = S.chain([U * 0.85, U * 0.02, s * U * 0.22], s * 0.35, 0.1, 3, U * 1.0, U * 0.1, U * 0.12, j => [0, -s * 0.2 * j], shell);
    const c = pts[3], snap = 0.25 + Math.max(0, Math.sin(ph * 2)) * 0.35;
    S.limb(c, add(c, [U * 0.45, U * snap * 0.4, s * U * 0.1]), U * 0.1, U * 0.03, k.claw);
    S.limb(c, add(c, [U * 0.45, -U * snap * 0.4, s * U * 0.1]), U * 0.08, U * 0.03, k.claw);
  }
  // prosoma shield with compound eyes
  S.blob([U * 0.35, U * 0.05, 0], [1, 0, 0], U * 0.85, U * 0.7, shell, { g: 1 }, U * 0.28);
  S.blob([U * 0.35, U * 0.25, 0], [1, 0, 0], U * 0.55, U * 0.35, dark, { g: 1 }, U * 0.08);
  for (const s of [-1, 1]) { const c: V3 = [U * 0.62, U * 0.28, s * U * 0.38]; S.blob(c, [1, 0, 0], U * 0.16, U * 0.1, { ...k.iris, tex: 'compound' }, { bias: 0.3 }, U * 0.1); }
  void blink;
  if (g.glow > 0.2) photophores(S, k, segs.slice(1, 11).map((q, i) => add(q, [0, U * 0.12, (i % 2 ? 1 : -1) * U * 0.25])), 1, ph);
}

// --- abyssal manta: wings like a cathedral roof, cephalic horns, a whip tail, glowing wing edges ------------------------
function manta(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, amp: number) {
  const W = U * 3.1 * Math.max(0.85, g.girth), L = U * 2.1 * Math.max(0.85, g.length);
  const flap = Math.sin(ph) * U * 0.9 * amp, mid = Math.sin(ph - 0.8) * U * 0.4 * amp;
  S.chain([-L * 0.45, 0, 0], Math.PI, 0.02, 9, U * 3.4, U * 0.1, 0.6, j => [Math.sin(ph - j * 0.6) * 0.04, Math.sin(ph * 2 - j * 0.5) * 0.05], k.body);
  for (const s of [-1, 1]) {
    const edge: V3[] = [[L * 0.4, 0, s * U * 0.3], [L * 0.15, mid, s * W * 0.45], [-L * 0.05, flap, s * W], [-L * 0.3, flap * 0.6, s * W * 0.8], [-L * 0.45, mid * 0.4, s * W * 0.35], [-L * 0.5, 0, 0]];
    S.poly([[L * 0.45, 0, 0], ...edge], k.body, { flat: 0.35, g: 1 });
    // under-wing pale band and the glowing edge
    S.poly([[L * 0.3, -U * 0.05, s * U * 0.2], [L * 0.05, mid - U * 0.05, s * W * 0.5], [-L * 0.2, flap * 0.6 - U * 0.05, s * W * 0.65], [-L * 0.35, -U * 0.05, s * U * 0.3]], k.inner, { flat: 0.4, g: 1, bias: -0.3 });
    if (g.glow > 0.1) photophores(S, k, edge.slice(0, 5), 1.1, ph + s);
    // cephalic fins that scoop the plankton
    S.limb([L * 0.45, 0, s * U * 0.35], [L * 0.85, -U * 0.08, s * U * 0.42 + Math.sin(ph * 2) * s * 2], U * 0.12, U * 0.05, k.body);
  }
  S.blob([0, U * 0.05, 0], [1, 0, 0], L * 0.55, U * 0.7, k.body, { g: 1 }, U * 0.45);
  S.blob([0, U * 0.35, 0], [1, 0, 0], L * 0.35, U * 0.35, k.mark, { g: 1 }, U * 0.1);
  S.limb([L * 0.5, -U * 0.08, -U * 0.25], [L * 0.5, -U * 0.08, U * 0.25], U * 0.07, U * 0.07, k.mouth, { bias: 0.3, noLine: true });
  for (const s of [-1, 1]) eye(S, k, [L * 0.42, U * 0.08, s * U * 0.38], Math.max(1.6, U * 0.1 * g.eyeSize), s, blink);
}

// --- colossal medusa: a pulsing bell, frilled oral arms and a curtain of trailing tentacles ------------------------------
function medusa(S: Sketch, k: Kit, g: Genome, ph: number, U: number) {
  const R = U * 1.25, pulse = 1 + Math.sin(ph) * 0.1;
  const bell: Mat = { ...k.gel, alpha: 0.72 };
  const tent: Mat = { ...k.membrane, alpha: 0.75 };
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, p: V3 = [Math.cos(a) * R * 0.95 * pulse, -R * 0.25, Math.sin(a) * R * 0.95 * pulse];
    S.chain(p, a, -1.5, 12, U * (3.2 + (i % 4) * 0.6), 0.9, 0.4, j => [Math.sin(ph - j * 0.5 + i * 0.7) * 0.06, Math.sin(ph * 0.5 + j * 0.3 + i) * 0.05], tent);
  }
  for (let i = 0; i < 5; i++) {
    const pts = S.chain([0, -R * 0.2, 0], i * 1.25, -1.45, 9, U * 2.4, U * 0.28, U * 0.1, j => [Math.sin(ph - j * 0.6 + i) * 0.1, Math.sin(ph + j + i) * 0.04], { ...k.crest, tex: 'fin', alpha: 0.85 });
    for (let j = 1; j < pts.length; j += 2) S.ball(pts[j], U * 0.12, { ...k.crest, tex: 'fin', alpha: 0.8 }, { g: 30 + i });
  }
  // the bell with its radial canals, lappets on the rim and the glowing ring
  S.blob([0, 0, 0], [0, 1, 0], R * 0.72 / pulse, R * pulse, bell, { g: 1 }, R * pulse);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; S.limb([0, R * 0.5, 0], [Math.cos(a) * R * 0.85 * pulse, -R * 0.1, Math.sin(a) * R * 0.85 * pulse], 0.8, 0.8, { ...k.nucleus, alpha: 0.6 }, { noLine: true, g: 1 }); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; S.ball([Math.cos(a) * R * 0.98 * pulse, -R * 0.2, Math.sin(a) * R * 0.98 * pulse], U * 0.16, bell, { g: 1 }); }
  S.ball([0, R * 0.12, 0], R * 0.38, { ...k.nucleus, alpha: 0.75 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; S.ball([Math.cos(a) * R * 0.3, R * 0.05, Math.sin(a) * R * 0.3], R * 0.14, { ...k.organelle[0], alpha: 0.8 }); }
  photophores(S, k, Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * TAU; return [Math.cos(a) * R * 0.9 * pulse, -R * 0.15, Math.sin(a) * R * 0.9 * pulse] as V3; }), 1.2, ph);
  void g;
}

// =========================================================================================================================
// LAND - the dinosaur-like apex
// =========================================================================================================================
export function buildLandLeviathan(S: Sketch, k: Kit, g0: Genome, ph: number, blink: boolean) {
  const U = 26 * (0.72 + g0.size * 0.5) * 2.6;
  const g: Genome = { ...g0, fierce: g0.params.diet > 0.6 ? Math.max(0.8, g0.fierce) : g0.fierce };
  const heavy: Kit = { ...k, body: { ...k.body, texScale: 1.8 }, limb: { ...k.limb, texScale: 1.8 } };
  switch (landLeviathan(g)) {
    case 'sauropod': return sauropod(S, heavy, g, ph, blink, U);
    case 'tyrant': return tyrant(S, heavy, g, ph, blink, U);
    case 'armoured': return armoured(S, heavy, g, ph, blink, U);
    case 'behemoth': return behemoth(S, heavy, g, ph, blink, U);
    case 'serpent': return landSerpent(S, heavy, g, ph, blink, U);
  }
}

/** osteoderms / dermal plates along a line of points */
function scutes(S: Sketch, k: Kit, pts: V3[], r: (i: number) => number, lift: (i: number) => number) {
  pts.forEach((p, i) => S.blob(add(p, [0, lift(i), 0]), [1, 0.4, 0], r(i) * 1.2, r(i), k.plate, { g: 9, bias: 0.05 }, r(i) * 0.7));
}

// --- sauropod: a hill of a body on pillar legs, a neck that climbs to the treetops, a whip tail ---------------------------
function sauropod(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const bodyR = U * 0.5 * g.girth, L = U * 0.78;
  const hip: V3 = [-U * 0.55, L + bodyR * 0.55, 0], sh: V3 = [U * 0.5, L + bodyR * 0.75, 0];
  const legR = bodyR * 0.36;
  for (const [p, front] of [[hip, false], [sh, true]] as [V3, boolean][]) for (const s of [-1, 1])
    leg(S, k, g, { hip: add(p, [0, -bodyR * 0.35, s * bodyR * 0.55]), side: s, front, len: p[1] - bodyR * 0.35, r: legR, phase: ((front ? 1 : 0) + (s > 0 ? 1 : 0)) % 2 * Math.PI, stride: U * 0.14, type: 'column' } as LegSpec, ph);
  const tg: Genome = { ...g, tail: 'whip' };
  const tailPts = tail(S, k, tg, add(hip, [-bodyR * 0.7, bodyR * 0.3, 0]), U * 2.2, bodyR * 0.55, ph, -0.12);
  S.blob(lerp3(hip, sh, 0.5), [1, 0.1, 0], U * 1.05, bodyR * 1.05 * (1 + Math.sin(ph) * 0.02), k.body, { g: 1 }, bodyR * 1.1);
  S.blob(hip, [1, 0, 0], bodyR * 1.1, bodyR * 0.95, k.body, { g: 1 });
  S.blob(sh, [1, 0.3, 0], bodyR * 1.05, bodyR * 1.0, k.body, { g: 1 });
  // the neck: a long arch up and forward, swaying slowly
  const np = S.chain(add(sh, [bodyR * 0.55, bodyR * 0.5, 0]), Math.sin(ph) * 0.05, 1.0, 9, U * 2.4, bodyR * 0.6, bodyR * 0.24, i => [-0.075, Math.sin(ph - i * 0.3) * 0.015], k.body, { g: 1 });
  scutes(S, k, [...np.slice(1, -1), sh, lerp3(hip, sh, 0.5), hip, ...tailPts.slice(1, 5)], i => U * (0.1 - i * 0.002), () => bodyR * 0.2);
  const hg: Genome = { ...g, headShape: 'long', snout: 0.45, ears: 'none', horns: g.horns === 'crest' ? 'crest' : 'none', jaw: 'soft', fierce: Math.min(0.3, g.fierce) };
  const R = U * 0.26;
  drawHead(S, k, hg, add(np[np.length - 1], [R * 0.5, R * 0.1, 0]), R, { ph, blink, tilt: 0.5 });
}

// --- tyrant: huge hind legs, a counterweight tail, a head that is mostly jaws, tiny arms ----------------------------------
function tyrant(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const bodyR = U * 0.5 * Math.max(0.9, g.girth), L = U * 1.0;
  const hip: V3 = [-U * 0.2, L + bodyR * 0.2, 0];
  const lean = 0.18 + (S.anim === 'run' ? 0.12 : 0);
  const ch: V3 = add(hip, [Math.cos(lean) * U * 1.05, Math.sin(lean) * U * 1.05, 0]);
  for (const s of [-1, 1]) leg(S, k, g, { hip: add(hip, [0, -bodyR * 0.15, s * bodyR * 0.55]), side: s, front: false, len: L, r: bodyR * 0.55, phase: s > 0 ? Math.PI : 0, stride: U * 0.22, type: 'digitigrade' } as LegSpec, ph);
  const tg: Genome = { ...g, tail: 'plain' };
  const tailPts = tail(S, k, tg, add(hip, [-bodyR * 0.7, bodyR * 0.1, 0]), U * 1.9, bodyR * 0.8, ph, -0.02);
  const axis: V3 = [ch[0] - hip[0], ch[1] - hip[1], 0];
  S.blob(hip, axis, bodyR * 1.2, bodyR * 1.05, k.body, { g: 1 });
  S.blob(ch, axis, bodyR * 1.05, bodyR * 0.95, k.body, { g: 1 }, bodyR * 1.05);
  S.limb(hip, ch, bodyR * 1.05, bodyR * 0.95, k.body, { g: 1 });
  if (g.covering === 'feathers' || g.back === 'mane') for (let i = 0; i < 6; i++) S.ball(lerp3(hip, ch, i / 5), bodyR * 0.55, { ...k.tuft, fuzz: 1.4 }, { g: 1, bias: -bodyR });
  else scutes(S, k, [...tailPts.slice(1, 4).reverse(), hip, lerp3(hip, ch, 0.5), ch], () => U * 0.07, () => bodyR * 0.9);
  // tiny arms with two claws
  for (const s of [-1, 1]) {
    const a0 = add(ch, [bodyR * 0.3, -bodyR * 0.55, s * bodyR * 0.6]), el = add(a0, [U * 0.08, -U * 0.14, s * U * 0.03]), hd = add(el, [U * 0.12, U * 0.02, 0]);
    S.limb(a0, el, U * 0.06, U * 0.05, k.limb); S.limb(el, hd, U * 0.05, U * 0.04, k.limb);
    S.limb(hd, add(hd, [U * 0.06, -U * 0.04, 0]), 0.8, 0.4, k.claw, { noLine: true });
  }
  // the neck is short and thick, the head enormous
  const np = S.chain(add(ch, [bodyR * 0.5, bodyR * 0.4, 0]), 0, 0.55 + Math.sin(ph) * 0.05, 2, U * 0.35, bodyR * 0.75, bodyR * 0.65, () => [-0.25, 0], k.body, { g: 1 });
  const hg: Genome = { ...g, headShape: g.headShape === 'domed' || g.headShape === 'round' ? 'wedge' : g.headShape, snout: Math.max(0.75, g.snout), jaw: g.jaw === 'beak' ? 'beak' : 'teeth', ears: 'none', fierce: Math.max(0.85, g.fierce) };
  drawHead(S, k, hg, add(np[np.length - 1], [U * 0.3, U * 0.05, 0]), U * 0.55 * Math.max(0.9, g.headSize), { ph, blink, tilt: 0.12 });
}

// --- armoured: a low wide tank of osteoderms and side spikes, a horned frill, a club tail -------------------------------
function armoured(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const bodyR = U * 0.5 * g.girth, L = U * 0.42;
  const hip: V3 = [-U * 0.6, L + bodyR * 0.45, 0], sh: V3 = [U * 0.55, L + bodyR * 0.4, 0];
  for (const [p, front] of [[hip, false], [sh, true]] as [V3, boolean][]) for (const s of [-1, 1])
    leg(S, k, g, { hip: add(p, [0, -bodyR * 0.35, s * bodyR * 0.75]), side: s, front, len: p[1] - bodyR * 0.35, r: bodyR * 0.33, phase: ((front ? 1 : 0) + (s > 0 ? 1 : 0)) % 2 * Math.PI, stride: U * 0.1, type: 'column' } as LegSpec, ph);
  tail(S, k, { ...g, tail: g.tail === 'thagomizer' ? 'thagomizer' : 'club' }, add(hip, [-bodyR * 0.8, 0, 0]), U * 1.25, bodyR * 0.45, ph, -0.18);
  S.blob(lerp3(hip, sh, 0.5), [1, 0, 0], U * 1.05, bodyR * 1.3, k.body, { g: 1 }, bodyR * 0.95);
  // rows of osteoderms over the back, spikes down both flanks
  for (let r = -2; r <= 2; r++) for (let i = 0; i < 6; i++) {
    const t = i / 5, p = lerp3(hip, sh, t), z = r * bodyR * 0.42, y = Math.sqrt(Math.max(0, 1 - (r * 0.42) ** 2)) * bodyR * 0.92;
    S.ball(add(p, [0, y, z]), U * (0.11 - Math.abs(r) * 0.012), k.plate, { g: 9 });
    if (Math.abs(r) === 2 && i % 2 === 0) S.limb(add(p, [0, y * 0.4, z * 1.05]), add(p, [-U * 0.08, y * 0.3, z * 1.05 + Math.sign(z) * U * 0.32]), U * 0.07, 0.6, k.horn, { bias: 0.1 });
  }
  const hg: Genome = { ...g, headShape: 'wedge', snout: 0.6, jaw: g.jaw === 'teeth' ? 'beak' : g.jaw === 'soft' ? 'beak' : g.jaw, horns: g.r[62] < 0.5 ? 'frill' : 'nasal', hornLen: Math.max(0.8, g.hornLen), ears: 'none' };
  const R = U * 0.34;
  drawHead(S, k, hg, add(sh, [bodyR * 0.9, -bodyR * 0.05, 0]), R, { ph, blink, tilt: 0.35 });
  if (hg.horns === 'frill') for (const s of [-1, 1]) S.limb(add(sh, [bodyR * 0.95, R * 0.55, s * R * 0.3]), add(sh, [bodyR * 1.3 + R * 0.9, R * 0.9, s * R * 0.45]), R * 0.14, 0.7, k.horn, { bias: 0.4 });
}

// --- hexapod behemoth: six pillar legs under a vaulted carapace, tusks ----------------------------------------------------
function behemoth(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const bodyR = U * 0.52 * g.girth, L = U * 0.72;
  const hip: V3 = [-U * 0.75, L + bodyR * 0.5, 0], sh: V3 = [U * 0.7, L + bodyR * 0.55, 0];
  const insect = g.covering === 'chitin' || g.legType === 'insectoid';
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const p = lerp3(hip, sh, i / 2);
    leg(S, k, g, { hip: add(p, [0, -bodyR * 0.35, s * bodyR * 0.6]), side: s, front: i === 2, len: p[1] - bodyR * 0.35, r: bodyR * (insect ? 0.22 : 0.3), phase: ((i + (s > 0 ? 1 : 0)) % 2) * Math.PI, stride: U * 0.12, type: insect ? 'insectoid' : 'column' } as LegSpec, ph);
  }
  tail(S, k, { ...g, tail: g.tail === 'none' ? 'plain' : g.tail }, add(hip, [-bodyR * 0.8, 0, 0]), U * 1.0, bodyR * 0.45, ph, -0.4);
  S.blob(lerp3(hip, sh, 0.5), [1, 0, 0], U * 1.2, bodyR * 1.1, k.body, { g: 1 }, bodyR * 1.05);
  // the carapace: overlapping vaulted plates with a ridge
  const shell: Mat = { ...k.plate, tex: insect ? 'chitin' : 'plates', spec: 0.5, texScale: 1.6 };
  for (let i = 0; i < 5; i++) { const p = lerp3(hip, sh, i / 4); S.blob(add(p, [0, bodyR * 0.55, 0]), [1, 0, 0], U * 0.36, bodyR * 1.05, shell, { g: 8 }, bodyR * 0.62); }
  for (let i = 0; i < 7; i++) S.limb(add(lerp3(hip, sh, i / 6), [0, bodyR * 1.05, 0]), add(lerp3(hip, sh, i / 6), [-U * 0.08, bodyR * 1.45, 0]), U * 0.07, 0.6, k.horn, { bias: 0.05 });
  const hg: Genome = { ...g, jaw: 'tusks', headShape: 'flat', snout: 0.5, ears: g.ears === 'none' ? 'none' : 'fan' };
  drawHead(S, k, hg, add(sh, [bodyR * 1.0, -bodyR * 0.1, 0]), U * 0.36, { ph, blink, tilt: 0.3 });
}

// --- colossal serpent: a titanic constrictor with horned brows and a raised hood -------------------------------------------
function landSerpent(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const R = U * 0.26 * g.girth, n = 24, Ln = U * 5.2;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t < 0.7) pts.push([-Ln * 0.45 + t * Ln * 0.8, R, Math.sin(t * 10 - ph) * U * 0.5 * (1 - t * 0.5)]);
    else { const u = (t - 0.7) / 0.3; pts.push([-Ln * 0.45 + 0.7 * Ln * 0.8 + Math.sin(u * 2) * U * 0.45, R + u * U * 1.35 + Math.sin(ph + u * 3) * 2, Math.sin(0.7 * 10 - ph) * U * 0.15 * (1 - u)]); }
  }
  const rad = (t: number) => R * (t < 0.12 ? 0.2 + t / 0.12 * 0.8 : t > 0.88 ? 0.9 : 1);
  const [hx, hy, hz] = pts[n];
  S.blob([hx - R * 0.8, hy - R * 1.3, hz], [0, 1, 0.3], R * 2.6, R * 1.8, { ...k.body, pattern: null }, { bias: -R * 2 }, R * 0.45);
  for (let i = 0; i < n; i++) S.limb(pts[i], pts[i + 1], rad(i / n), rad((i + 1) / n), k.body, { g: 1 });
  scutes(S, k, pts.slice(2, n - 1), i => R * (0.3 + (i % 2) * 0.08), i => rad(i / n) * 0.85);
  const hg: Genome = { ...g, headShape: 'wedge', horns: g.horns === 'none' ? 'ram' : g.horns, ears: 'none', jaw: 'teeth', fierce: Math.max(0.8, g.fierce) };
  if (Math.sin(ph * 2) > 0.3) for (const s of [-1, 1]) S.limb([hx + R * 1.7, hy - R * 0.3, hz], [hx + R * 3.2, hy - R * 0.2 + s * R * 0.3, hz + s * R * 0.25], 0.8, 0.5, k.mouth, { bias: 0.5 });
  drawHead(S, k, hg, [hx + R * 0.35, hy + R * 0.1, hz], R * 1.2, { ph, blink, tilt: 0.1 });
}
