// Bodies for every non-cellular stage, drawn through a Sketch so they work in all facings.
// Land creatures stand on y = 0; swimmers are centred on (0, 0, 0). ph = animation phase.
import { Genome } from './genome';
import { Kit } from './kit';
import { Sketch, V3, add, lerp3, PO } from './pose';
import { leg, tail, wings, backFeature, LegSpec } from './limbs';
import { drawHead } from './head';
import { Mat, darkenRamp } from './raster';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------
// Swimmers
// ---------------------------------------------------------------------------------------------------
function fishEye(S: Sketch, k: Kit, g: Genome, c: V3, r: number, side: number, blink: boolean) {
  const vis = S.facing([0.35, 0.2, side]);
  if (vis < -0.1) return;
  const wf = Math.max(0.3, Math.min(1, 0.35 + vis));
  if (blink) { S.poly2(c, [-r * wf, -0.5, r * wf, -0.5, r * wf, 0.5, -r * wf, 0.5], k.lid, { bias: 0.4 }); return; }
  S.disc(c, r * wf, r, 0, k.sclera, { bias: 0.4 });
  S.disc(c, r * 0.72 * wf, r * 0.72, 0, k.iris, { bias: 0.41, noLine: true });
  S.disc(c, r * 0.4 * wf, r * 0.4, 0, k.pupil, { bias: 0.42, noLine: true });
  S.poly2(c, [-r * 0.45, -r * 0.55, -r * 0.1, -r * 0.55, -r * 0.1, -r * 0.2, -r * 0.45, -r * 0.2], k.shine, { bias: 0.43, noLine: true });
}

export function buildSwimmer(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, giant: boolean) {
  const U = (giant ? 34 : 22) * (0.8 + g.size * 0.4);
  switch (g.aquaForm) {
    case 'cephalopod': return cephalopod(S, k, g, ph, blink, U, giant);
    case 'crustacean': return crustacean(S, k, g, ph, blink, U, giant, false);
    case 'jelly': return jelly(S, k, g, ph, U, giant);
    case 'ray': return ray(S, k, g, ph, blink, U, giant);
    default: return fish(S, k, g, ph, blink, U, giant);
  }
}

function fish(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean) {
  const eel = g.aquaForm === 'eel', fb = g.fishBody;
  const len = U * (eel ? 3.6 : fb === 'puffer' ? 1.3 : fb === 'deep' ? 1.7 : 2.3) * g.length;
  const H = U * (eel ? 0.26 : fb === 'deep' ? 0.85 : fb === 'puffer' ? 0.62 : fb === 'boxy' ? 0.5 : 0.52) * g.girth * (giant ? 1.1 : 1);
  const Wd = H * (eel ? 0.9 : fb === 'deep' ? 0.35 : fb === 'puffer' ? 0.95 : fb === 'boxy' ? 0.85 : 0.55);
  const n = eel ? 14 : 9;
  const sp: V3[] = [];
  const amp = S.anim === 'idle' ? 0.35 : S.anim === 'run' ? 1.4 : 1;
  for (let i = 0; i <= n; i++) { const t = i / n; sp.push([len / 2 - t * len, 0, Math.sin(ph - t * (eel ? 7 : 4)) * U * (eel ? 0.25 : 0.14) * t * t * amp]); }
  const prof = (t: number) => (fb === 'puffer' ? Math.sin(Math.min(1, t * 1.05 + 0.05) * Math.PI) * 0.9 + 0.1 : t < 0.22 ? 0.62 + (t / 0.22) * 0.38 : 1 - Math.pow((t - 0.22) / 0.78, 1.25) * (eel ? 0.8 : 0.86));
  const tailP = sp[n], pre = sp[n - 1];
  const F = U * (eel ? 0.5 : 0.8) * (giant ? 1.1 : 1);
  const back: V3 = [tailP[0] - pre[0], 0, tailP[2] - pre[2]];
  const bl = Math.hypot(back[0], back[2]) || 1; back[0] /= bl; back[2] /= bl;
  const fin = (pts: V3[], o: PO = {}) => S.poly(pts, k.fin, { flat: 0.55, ...o });
  // tail fin (in the vertical plane of the last segment) + its rays as capsules so it shows head-on
  const tb = (x: number, y: number): V3 => add(tailP, [back[0] * x, y, back[2] * x]);
  if (!eel) {
    const shapes: Record<string, [number, number][]> = {
      forked: [[0, H * 0.2], [F, F * 0.8], [F * 0.45, 0], [F, -F * 0.8], [0, -H * 0.2]],
      lunate: [[0, H * 0.2], [F * 0.8, F * 0.95], [F * 0.55, F * 0.3], [F * 0.48, 0], [F * 0.55, -F * 0.3], [F * 0.8, -F * 0.95], [0, -H * 0.2]],
      round: [[0, H * 0.2], [F * 0.5, F * 0.6], [F * 0.9, F * 0.3], [F * 0.95, 0], [F * 0.9, -F * 0.3], [F * 0.5, -F * 0.6], [0, -H * 0.2]],
      shark: [[0, H * 0.2], [F * 1.15, F * 1.05], [F * 0.55, 0], [F * 0.6, -F * 0.45], [0, -H * 0.2]],
      veil: [[0, H * 0.2], [F * 0.9, F * 1.0], [F * 1.4, F * 0.3 + Math.sin(ph) * 2], [F * 1.3, -F * 0.5], [F * 0.8, -F * 1.0], [0, -H * 0.2]],
    };
    const pts = shapes[g.finShape].map(([x, y]) => tb(x, y));
    fin(pts);
    S.limb(tb(0, 0), tb(F * 0.8, F * 0.6), 0.7, 0.5, k.fin, { noLine: true });
    S.limb(tb(0, 0), tb(F * 0.8, -F * 0.6), 0.7, 0.5, k.fin, { noLine: true });
  } else {
    const top: V3[] = [], bot: V3[] = [];
    for (let i = 3; i <= n; i++) { const t = i / n; top.push(add(sp[i], [0, H * prof(t) + U * 0.22 * Math.sin(t * Math.PI), 0])); bot.push(add(sp[i], [0, -H * prof(t) - U * 0.18 * Math.sin(t * Math.PI), 0])); }
    fin([...top, ...bot.reverse()]);
  }
  // dorsal fin
  if (!eel && g.dorsal !== 'none') {
    const a = Math.floor(n * 0.3), b = Math.floor(n * (g.dorsal === 'ridge' ? 0.8 : 0.6));
    const top: V3[] = [];
    for (let i = a; i <= b; i++) {
      const t = (i - a) / Math.max(1, b - a);
      const hgt = g.dorsal === 'tall' ? U * 0.5 * Math.pow(1 - t, 0.8) * Math.min(1, t * 3.5) : g.dorsal === 'sail' ? U * 0.6 * Math.sin(t * Math.PI) : g.dorsal === 'spiny' ? U * 0.35 * (i % 2 ? 1 : 0.4) : U * 0.2 * Math.sin(t * Math.PI);
      top.push(add(sp[i], [-(g.dorsal === 'tall' ? t * t * U * 0.3 : 0), H * prof(i / n) * 0.85 + hgt, 0]));
    }
    const baseL: V3[] = [];
    for (let i = b; i >= a; i--) baseL.push(add(sp[i], [0, H * prof(i / n) * 0.5, 0]));
    fin([...top, ...baseL], { bias: -0.2 });
    const peak = top[Math.floor(top.length / 3)];
    S.limb(add(sp[a], [0, H * 0.7, 0]), peak, 0.8, 0.5, k.fin, { bias: -0.1, noLine: true });
  }
  // body
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, c = lerp3(sp[i], sp[i + 1], 0.5);
    S.blob(c, [sp[i][0] - sp[i + 1][0], 0, sp[i][2] - sp[i + 1][2]], len / n * 0.9, Wd * prof(t), k.body, { g: 1 }, H * prof(t));
  }
  if (giant) for (let i = 1; i < n - 2; i++) S.blob(add(sp[i], [0, H * prof(i / n) * 0.7, 0]), [1, 0, 0], len / n * 0.55, Wd * prof(i / n) * 0.55, k.plate, { g: 2 }, H * 0.25);
  if (fb === 'puffer') for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; const p = add(sp[Math.floor(n / 2)], [Math.cos(a) * len * 0.35, Math.sin(a) * H * 0.9, (i % 2 ? 1 : -1) * Wd * 0.7]); S.limb(p, add(p, [Math.cos(a) * U * 0.2, Math.sin(a) * U * 0.2, (i % 2 ? 1 : -1) * U * 0.1]), 0.8, 0.4, k.horn); }
  // pectoral & pelvic fins on both sides
  const flap = Math.sin(ph * 2) * 0.3;
  for (const s of [-1, 1]) {
    const r0 = add(sp[2], [0, -H * 0.2, s * Wd * 0.8]);
    fin([r0, add(r0, [-U * 0.5, -U * (0.2 + flap * 0.4), s * U * 0.35]), add(r0, [-U * 0.2, -U * 0.35, s * U * 0.15])]);
    const p0 = add(sp[Math.floor(n * 0.5)], [0, -H * 0.8, s * Wd * 0.4]);
    fin([p0, add(p0, [-U * 0.35, -U * 0.25, s * U * 0.12]), add(p0, [-U * 0.05, -U * 0.2, s * U * 0.05])]);
  }
  // gills
  for (const s of [-1, 1]) for (let i = 0; i < (giant ? 4 : 3); i++) {
    const p = add(sp[1], [-i * U * 0.1 - U * 0.05, 0, s * Wd * 0.75]);
    S.limb(add(p, [0.8, H * 0.45, 0]), add(p, [0, -H * 0.4, 0]), 0.5, 0.5, { ...k.mouth, ramp: darkenRamp(k.body.ramp, 0.55) }, { noLine: true, bias: 0.3 });
  }
  // head details
  const hx = sp[0];
  const er = Math.max(1.4, H * 0.28 * g.eyeSize * (giant ? 0.7 : 1) * (fb === 'angler' ? 0.6 : 1));
  for (const s of [-1, 1]) fishEye(S, k, g, add(hx, [-H * 0.3, H * 0.3, s * Wd * 0.6]), er, s, blink);
  const open = giant || fb === 'angler' ? (0.5 + Math.sin(ph) * 0.2) * H * 0.4 : 0;
  S.limb(add(hx, [-H * 0.15, -H * 0.25, 0]), add(hx, [H * 0.55, -H * 0.2 - open * 0.3, 0]), 0.6 + open * 0.5, 0.6 + open * 0.3, k.mouth, { bias: 0.3, noLine: true });
  if ((giant || fb === 'angler') && g.params.diet > 0.35) for (let i = 0; i < 5; i++) {
    const p = add(hx, [-H * 0.05 + i * H * 0.13, -H * 0.2, 0]);
    S.poly2(p, [-1, 0, 1, 0, 0, 2.4], k.teeth, { bias: 0.35, noLine: true });
    S.poly2(add(p, [0, -open - 1.5, 0]), [-1, 0, 1, 0, 0, -2.2], k.teeth, { bias: 0.35, noLine: true });
  }
  if (fb === 'angler') {
    const pts = S.chain(add(hx, [-H * 0.2, H * 0.8, 0]), 0, 1.2, 5, U * 0.9, 0.7, 0.5, i => [-0.35 + Math.sin(ph + i) * 0.05, 0], k.body);
    S.ball(pts[5], 2, k.glow);
  }
  if (giant || g.tentacleBeard) for (const s of [-1, 1]) S.chain(add(hx, [H * 0.2, -H * 0.45, s * Wd * 0.4]), 0, -1.2, 5, U * 0.7, 0.9, 0.5, j => [Math.sin(ph - j * 0.8) * 0.2, 0], k.skinWet);
  if (giant && g.glow > 0.2 || g.glow > 0.6) for (let i = 1; i < n - 1; i++) for (const s of [-1, 1]) S.ball(add(sp[i], [0, 0, s * Wd * prof(i / n) * 0.9]), 1, k.glow, { noLine: true, bias: 0.2 });
}

function ray(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean) {
  const W = U * 1.4 * g.girth, L = U * 1.1 * g.length, flap = Math.sin(ph) * U * 0.3;
  const c: V3 = [0, 0, 0];
  S.limb(add(c, [-L * 0.4, 0, 0]), add(c, [-L * 1.8, Math.sin(ph) * 2, Math.sin(ph * 2) * 3]), U * 0.08, 0.5, k.body);
  for (const s of [-1, 1]) {
    S.poly([add(c, [L * 0.5, 0, 0]), add(c, [L * 0.1, flap * 0.5, s * W * 0.7]), add(c, [-L * 0.15, flap, s * W]), add(c, [-L * 0.45, flap * 0.3, s * W * 0.4]), add(c, [-L * 0.45, 0, 0])], k.body, { flat: 0.3, g: 1 });
  }
  S.blob(c, [1, 0, 0], L * 0.55, W * 0.35, k.body, { g: 1 }, U * 0.18);
  for (const s of [-1, 1]) fishEye(S, k, g, add(c, [L * 0.3, U * 0.15, s * U * 0.22]), Math.max(1.4, U * 0.1 * g.eyeSize), s, blink);
  if (giant) for (const s of [-1, 1]) S.limb(add(c, [L * 0.5, 0, s * U * 0.3]), add(c, [L * 0.85, -U * 0.1, s * U * 0.35]), U * 0.12, U * 0.08, k.body);
}

function jelly(S: Sketch, k: Kit, g: Genome, ph: number, U: number, giant: boolean) {
  const R = U * 0.7 * (giant ? 1.3 : 1), pulse = 1 + Math.sin(ph) * 0.08;
  const bell: Mat = { ...k.gel, alpha: 0.72 };
  const n = giant ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, p: V3 = [Math.cos(a) * R * 0.75, -R * 0.2, Math.sin(a) * R * 0.75];
    S.chain(p, a, -1.45, 8, U * (1.4 + (i % 3) * 0.4), 0.8, 0.5, j => [Math.sin(ph - j * 0.7 + i) * 0.12, 0], { ...k.membrane, alpha: 0.8 });
  }
  for (let i = 0; i < 4; i++) S.chain([0, -R * 0.2, 0], i * 1.6, -1.4, 6, U * 0.9, 2.2, 1, j => [Math.sin(ph - j + i) * 0.15, 0], { ...k.crest, tex: 'fin', alpha: 0.85 });
  S.blob([0, 0, 0], [0, 1, 0], R * 0.75 / pulse, R * pulse, bell, { g: 1 }, R * pulse);
  S.ball([0, R * 0.1, 0], R * 0.35, { ...k.nucleus, alpha: 0.8 });
  if (g.glow > 0.2 || giant) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; S.ball([Math.cos(a) * R * 0.85, -R * 0.15, Math.sin(a) * R * 0.85], 1, k.glow, { noLine: true }); }
}

function cephalopod(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean) {
  const arms = giant ? 8 : 6;
  const head: V3 = [U * 0.35, 0, 0];
  const armMat = { ...k.body, pattern: null, belly: undefined };
  const octo = g.r[50] < 0.45;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU;
    const root = add(head, [U * 0.25, -U * 0.1 + Math.sin(a) * U * 0.18, Math.cos(a) * U * 0.2]);
    const pts = octo
      ? S.chain(root, Math.cos(a) * 1.2, -1.0, 8, U * (1.6 + (i % 3) * 0.2), U * 0.16, 0.6, j => [Math.sin(ph - j * 0.7 + i) * 0.14 + 0.08, Math.sin(ph + j + i) * 0.06], armMat)
      : S.chain(root, Math.sin(a) * 0.25, Math.sin(a) * 0.3, 8, U * (1.5 + (i % 3) * 0.25), U * 0.15, 0.6, j => [0.02 + Math.sin(ph - j * 0.7 + i) * 0.12, Math.sin(ph + j) * 0.04], armMat);
    if (giant) for (let j = 2; j < pts.length; j += 2) S.ball(pts[j], 0.9, k.inner, { noLine: true, bias: 0.05 });
  }
  if (!octo) for (let t = 0; t < 2; t++) {
    const pts = S.chain(add(head, [U * 0.35, 0, (t ? 1 : -1) * U * 0.1]), 0.05 * (t ? 1 : -1), 0, 10, U * 2.4, U * 0.08, U * 0.06, j => [Math.sin(ph * 1.3 - j * 0.5 + t) * 0.1, 0], armMat);
    S.blob(pts[pts.length - 1], [1, 0, 0], U * 0.22, U * 0.12, armMat);
  }
  const mantle: V3 = octo ? add(head, [-U * 0.3, U * 0.5, 0]) : [-U * 0.55, U * 0.15, 0];
  const ma: V3 = octo ? [-0.5, 1, 0] : [-1, 0.25, 0];
  if (!octo) for (const s of [-1, 1]) S.poly([add(mantle, [-U * 0.75, 0, 0]), add(mantle, [-U * 1.2, 0, s * U * 0.45]), add(mantle, [-U * 0.95, 0, s * U * 0.05])], k.fin, { flat: 0.5 });
  if (g.r[51] < 0.2 && octo) S.ball(add(mantle, [-U * 0.2, U * 0.1, 0]), U * 0.8, { ...k.plate, tex: 'bone', texScale: 1.5 });   // nautilus-like shell
  S.blob(mantle, ma, U * (1.05 + g.length * 0.2) * (octo ? 0.8 : 1), U * 0.48 * g.girth * (1 + Math.sin(ph) * 0.05), k.body, { g: 1 });
  S.ball(head, U * 0.42, k.body, { g: 1 });
  for (const s of [-1, 1]) fishEye(S, k, g, add(head, [U * 0.12, U * 0.1, s * U * 0.34]), Math.max(1.6, U * 0.2 * g.eyeSize), s, blink);
  if (giant && g.glow > 0.2) for (let i = 0; i < 7; i++) S.ball(add(mantle, [-U * 0.9 + i * U * 0.3, U * 0.15 * Math.sin(i), U * 0.35]), 1, k.glow, { noLine: true });
}

function crustacean(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean, walking: boolean) {
  const shell = { ...k.body, tex: 'chitin' as const, spec: 0.7, fuzz: 0 };
  const crab = g.r[52] < 0.35;
  const baseY = walking ? U * 0.55 : 0;
  // legs (4 pairs)
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const hip: V3 = [U * 0.3 - i * U * 0.3, baseY - U * 0.1, s * U * 0.3];
    leg(S, { ...k, limb: shell, sock: shell }, g, { hip, side: s, front: i < 2, len: walking ? baseY : U * 0.7, r: U * 0.08, phase: i * 1.3 + (s > 0 ? Math.PI : 0), stride: U * 0.1, type: 'insectoid' } as LegSpec, ph);
  }
  // antennae
  for (const s of [-1, 1]) S.chain([U * 0.9, baseY + U * 0.2, s * U * 0.15], s * 0.35, 0.3, 10, U * (crab ? 0.8 : 2.2), 0.8, 0.5, j => [-0.03 + Math.sin(ph - j * 0.5) * 0.04, 0], shell);
  // tail (curled segments + fan) unless crab
  if (!crab) {
    let p: V3 = [-U * 0.5, baseY, 0];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + 0.1 + i * (walking ? 0.05 : 0.18) + Math.sin(ph) * 0.05;
      const nx: V3 = [p[0] + Math.cos(a) * U * 0.34, p[1] - Math.sin(a - Math.PI) * U * 0.34, p[2]];
      S.blob(lerp3(p, nx, 0.5), [nx[0] - p[0], nx[1] - p[1], 0], U * 0.22, U * (0.4 - i * 0.05), shell, { g: 2 }, U * (0.36 - i * 0.05));
      p = nx;
    }
    for (const s of [-1, 0, 1]) S.poly([p, add(p, [-U * 0.5, -U * 0.15, s * U * 0.3 - U * 0.1]), add(p, [-U * 0.55, -U * 0.1, s * U * 0.3 + U * 0.1])], { ...shell, tex: 'fin' }, { flat: 0.5 });
  }
  // carapace
  S.blob([U * 0.15, baseY, 0], [1, 0, 0], U * (crab ? 0.6 : 0.8) * g.length, U * (crab ? 0.75 : 0.45) * g.girth, shell, { g: 1 }, U * 0.42 * g.girth);
  if (giant) for (let i = 0; i < 4; i++) S.limb([-U * 0.3 + i * U * 0.3, baseY + U * 0.4, 0], [-U * 0.35 + i * U * 0.3, baseY + U * 0.75, 0], U * 0.1, 0.6, k.claw);
  // claws
  for (const s of [-1, 1]) {
    const sh: V3 = [U * 0.7, baseY, s * U * 0.35];
    const pts = S.chain(sh, s * 0.4, 0.1, 2, U * 0.8, U * 0.13, U * 0.16, i => [i ? 0.2 : 0, i ? -s * 0.6 : 0], shell);
    const c = pts[2];
    const open = 0.25 + Math.max(0, Math.sin(ph + s)) * 0.35;
    const big = giant ? 1.35 : 1;
    S.blob(c, [1, 0, -s * 0.3], U * 0.36 * big, U * 0.22 * big, shell);
    S.limb(add(c, [U * 0.3, U * 0.05, 0]), add(c, [U * 0.75, U * 0.1 + open * U * 0.25, -s * U * 0.1]), U * 0.11, 0.8, shell);
    S.limb(add(c, [U * 0.3, -U * 0.05, 0]), add(c, [U * 0.7, -U * 0.08 - open * U * 0.2, -s * U * 0.1]), U * 0.09, 0.8, shell);
  }
  // stalked eyes
  for (const s of [-1, 1]) {
    const e: V3 = [U * 0.85, baseY + U * 0.45, s * U * 0.18];
    S.limb([U * 0.75, baseY + U * 0.2, s * U * 0.15], e, U * 0.07, U * 0.06, shell);
    S.ball(e, Math.max(1.3, U * 0.1 * g.eyeSize), { ...k.pupil, spec: 1, line: [10, 10, 12] });
    if (!blink) S.disc(e, 0.6, 0.6, 0, k.shine, { bias: 0.2 });
  }
}

// ---------------------------------------------------------------------------------------------------
// Larvae
// ---------------------------------------------------------------------------------------------------
export function buildLarva(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean) {
  const U = 13 + g.size * 4;
  switch (g.aquaForm) {
    case 'crustacean': {
      S.limb([-U * 0.4, 0, 0], [-U * 1.8, U * 0.3 + Math.sin(ph) * 1.5, 0], U * 0.24, 0.6, k.body);
      S.limb([U * 0.1, U * 0.3, 0], [U * 0.3, U * 1.5, 0], U * 0.2, 0.5, k.body);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) S.chain([U * 0.1 - i * 2, -U * 0.3, s * U * 0.3], s * 1.2, -0.8 + Math.sin(ph * 2 + i) * 0.3, 3, U * 0.9, 0.7, 0.4, () => [0.15, 0], k.limb);
      S.ball([0, 0, 0], U * 0.66, { ...k.gel, alpha: 0.9 }, { g: 1 });
      S.ball([U * 0.45, U * 0.1, 0], U * 0.3, k.pupil);
      if (!blink) S.disc([U * 0.45, U * 0.1, 0], 1, 1, 0, k.shine, { bias: 1 });
      return;
    }
    case 'cephalopod': {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; S.chain([U * 0.45, 0, 0], Math.cos(a) * 0.4, Math.sin(a) * 0.4 - 0.2, 4, U * 0.9, 0.9, 0.4, j => [Math.sin(ph * 2 - j - i) * 0.2, 0], k.body); }
      S.blob([-U * 0.35, U * 0.15, 0], [-1, 0.3, 0], U * 0.8, U * 0.5, { ...k.gel, alpha: 0.85 }, { g: 1 });
      for (let i = 0; i < 5; i++) S.ball([-U * 0.6 + g.r[90 + i] * U * 0.9, U * 0.1 + g.r[95 + i] * U * 0.4, (g.r[85 + i] - 0.5) * U * 0.5], 0.9, { ...k.body, alpha: 0.9 }, { noLine: true });
      S.ball([U * 0.35, 0, 0], U * 0.4, k.body, { g: 1 });
      for (const s of [-1, 1]) fishEye(S, k, g, [U * 0.45, U * 0.05, s * U * 0.25], U * 0.24, s, blink);
      return;
    }
    case 'jelly': {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; S.limb([Math.cos(a) * U * 0.6, 0, Math.sin(a) * U * 0.6], [Math.cos(a) * U * 1.1, -U * 0.15 + Math.sin(ph + i) * 1.5, Math.sin(a) * U * 1.1], U * 0.18, U * 0.1, { ...k.gel, alpha: 0.75 }); }
      S.blob([0, 0, 0], [0, 1, 0], U * 0.35, U * 0.65, { ...k.gel, alpha: 0.8 }, { g: 1 }, U * 0.65);
      S.ball([0, 0.5, 0], U * 0.2, k.nucleus);
      return;
    }
    case 'eel': {
      const w = Math.sin(ph) * 0.12;
      S.poly([[U * 1.2, 0, 0], [U * 0.4, U * 0.55, w * U], [-U * 0.9, U * 0.3, 0], [-U * 1.6, 0, -w * U], [-U * 0.9, -U * 0.3, 0], [U * 0.4, -U * 0.55, w * U]], { ...k.gel, alpha: 0.7 }, { flat: 0.5 });
      for (let i = -4; i <= 4; i++) S.limb([i * U * 0.22, U * 0.3, 0], [i * U * 0.22 - 1.5, -U * 0.3, 0], 0.35, 0.35, { ...k.gel, alpha: 0.5, ramp: darkenRamp(k.gel.ramp, 0.8) }, { noLine: true });
      S.blob([U * 1.1, 0, 0], [1, 0, 0], U * 0.26, U * 0.18, k.body);
      for (const s of [-1, 1]) fishEye(S, k, g, [U * 1.18, U * 0.05, s * U * 0.1], 1.4, s, blink);
      return;
    }
    default: {
      // fry / tadpole: round head-body, yolk sac, waving finned tail
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-U * 0.2 - t * U * 1.8, 0, Math.sin(ph * 2 - t * 4) * U * 0.25 * t]); }
      const top: V3[] = [], bot: V3[] = [];
      pts.forEach((p, i) => { const h = Math.sin((i / 8) * Math.PI * 0.95 + 0.1); top.push(add(p, [0, U * 0.45 * h, 0])); bot.push(add(p, [0, -U * 0.38 * h, 0])); });
      S.poly([...top, ...bot.reverse()], k.fin, { flat: 0.6, bias: -1 });
      for (let i = 0; i < 8; i++) S.limb(pts[i], pts[i + 1], U * 0.32 * (1 - i / 9), U * 0.32 * (1 - (i + 1) / 9), k.body, { g: 1 });
      S.blob([U * 0.1, -U * 0.25, 0], [1, 0, 0], U * 0.4, U * 0.3, { ...k.inner, alpha: 0.9 }, { g: 1 });
      S.blob([U * 0.25, U * 0.05, 0], [1, 0, 0], U * 0.62, U * 0.5, k.body, { g: 1 }, U * 0.52);
      for (const s of [-1, 1]) fishEye(S, k, g, [U * 0.5, U * 0.2, s * U * 0.3], U * 0.26, s, blink);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Amphibians (normal & giant branch)
// ---------------------------------------------------------------------------------------------------
export function buildAmphibian(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, giant: boolean) {
  const U = 22 * (0.8 + g.size * 0.4) * (giant ? 1.75 : 1);
  if (g.aquaForm === 'crustacean') return crustacean(S, k, g, ph, blink, U * 0.8, giant, true);
  const skin = giant ? { ...k.body, tex: 'plates' as const, texScale: 1.2, spec: 0.3 } : k.skinWet;
  const limbKit: Kit = { ...k, limb: { ...skin, belly: undefined, pattern: null }, sock: { ...skin, belly: undefined, pattern: null } };
  const bodyR = U * 0.34 * g.girth, legH = U * (giant ? 0.5 : 0.4);
  const len = U * 2.1 * g.length;
  const baseY = legH + bodyR * 0.25;
  const n = 8;
  const sp: V3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; sp.push([len * 0.35 - t * len, baseY - t * t * bodyR * 0.9, Math.sin(ph - t * 3) * U * 0.1 * t]); }
  const rad = (t: number) => bodyR * (t < 0.3 ? 0.85 + t * 0.5 : 1 - (t - 0.3) / 0.7 * 0.88);
  const tentacled = g.aquaForm === 'cephalopod' || g.aquaForm === 'jelly';
  const type = tentacled ? 'tentacle' : 'sprawl';
  const legAt = (p: V3, s: number, front: boolean, phase: number) => leg(S, limbKit, g, { hip: add(p, [0, -bodyR * 0.3, s * bodyR * 0.6]), side: s, front, len: legH, r: bodyR * 0.36, phase, stride: U * 0.22, type } as LegSpec, ph);
  for (const s of [-1, 1]) { legAt(sp[1], s, true, s > 0 ? Math.PI : 0); legAt(sp[5], s, false, s > 0 ? 0 : Math.PI); }
  // tail with fin fold (or armoured crocodilian tail on the giant branch)
  if (!giant) {
    const top: V3[] = [], bot: V3[] = [];
    for (let i = 4; i <= n; i++) { const t = i / n, fh = U * 0.18 * Math.sin((t - 0.45) / 0.55 * Math.PI); top.push(add(sp[i], [0, rad(t) + fh, 0])); bot.push(add(sp[i], [0, -rad(t) - fh * 0.6, 0])); }
    S.poly([...top, ...bot.reverse()], k.fin, { flat: 0.6 });
  } else for (let i = 3; i < n; i++) S.limb(add(sp[i], [0, rad(i / n) * 0.9, 0]), add(sp[i], [-U * 0.05, rad(i / n) * 0.9 + U * 0.15, 0]), U * 0.07, 0.5, k.plate);
  for (let i = 0; i < n; i++) S.blob(lerp3(sp[i], sp[i + 1], 0.5), [sp[i][0] - sp[i + 1][0], sp[i][1] - sp[i + 1][1], sp[i][2] - sp[i + 1][2]], len / n * 0.8, rad((i + 0.5) / n), skin, { g: 1 }, rad((i + 0.5) / n) * 0.85);
  if (giant) for (let i = 0; i < n - 2; i++) for (const s of [-1, 1]) S.ball(add(sp[i], [0, rad(i / n) * 0.75, s * rad(i / n) * 0.45]), U * 0.07, k.plate, { g: 2 });
  if (!giant) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) S.chain(add(sp[0], [-U * 0.05, bodyR * 0.2 - i * 1.6, s * bodyR * 0.7]), Math.PI - s * 0.6, 0.5 - i * 0.4, 3, U * 0.35, 0.9, 0.5, () => [Math.sin(ph + i) * 0.2, 0], k.crest);
  // wide flat head: gentle newt or armoured crocodilian depending on the branch and the diet
  const hg: Genome = { ...g, headShape: giant ? 'long' : 'flat', snout: giant ? 0.85 : 0.35, ears: 'none', horns: giant && g.horns === 'nasal' ? 'nasal' : 'none', jaw: giant && g.params.diet > 0.3 ? 'teeth' : g.jaw === 'beak' ? 'soft' : g.jaw, antennae: g.antennae, cheekFluff: false, whiskers: false, mask: false };
  const hk = { ...k, head: skin };
  drawHead(S, hk, hg, add(sp[0], [U * 0.3, U * 0.02, 0]), bodyR * 1.05, { ph, blink, tilt: 0.05 });
}

// ---------------------------------------------------------------------------------------------------
// Land animals (normal & giant branch)
// ---------------------------------------------------------------------------------------------------
export function buildLand(S: Sketch, k: Kit, g0: Genome, ph: number, blink: boolean, giant: boolean) {
  let g = g0;
  if (giant) {
    // titans: pillar legs (unless insectoid / tentacled / bird-like), heavier armour
    const heavy = g.legType === 'plantigrade' || g.legType === 'digitigrade' || g.legType === 'unguligrade' || g.legType === 'stubby' || g.legType === 'sprawl';
    g = { ...g, legType: heavy && g.locomotion !== 'biped' ? 'column' : g.legType, neck: Math.max(g.neck, g.params.diet < 0.4 ? 0.8 : g.neck), girth: g.girth * 1.1, locomotion: g.locomotion === 'flyer' ? 'dragon' : g.locomotion === 'hopper' ? 'biped' : g.locomotion };
  }
  const U = 26 * (0.72 + g.size * 0.5) * (giant ? 1.7 : 1);
  switch (g.locomotion) {
    case 'serpent': return serpent(S, k, g, ph, blink, U);
    case 'biped': case 'flyer': case 'hopper': return biped(S, k, g, ph, blink, U, giant);
    default: return quad(S, k, g, ph, blink, U, giant);
  }
}

function legHeight(g: Genome, U: number) {
  const t = g.legType;
  return U * g.legLen * (t === 'sprawl' ? 0.42 : t === 'insectoid' ? 0.55 : t === 'stubby' ? 0.36 : t === 'tentacle' ? 0.55 : t === 'column' ? 0.72 : t === 'unguligrade' ? 1.0 : 0.85);
}

function quad(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean) {
  const shape = g.bodyShape;
  const bodyR = U * 0.42 * g.girth * (shape === 'round' ? 1.2 : shape === 'lean' ? 0.85 : 1);
  const bodyLen = U * 1.55 * g.length * (shape === 'long' ? 1.3 : shape === 'stocky' || shape === 'round' ? 0.8 : 1) * (g.locomotion === 'octopod' ? 0.6 : 1);
  const L = legHeight(g, U);
  const breathe = 1 + Math.sin(ph) * 0.025;
  const hip: V3 = [-bodyLen / 2, L + bodyR * 0.3, 0], sh: V3 = [bodyLen / 2, L + bodyR * (0.45 + (1 - g.params.diet) * 0.1), 0];
  const rHip = bodyR * 0.9 * breathe, rCh = bodyR * (1 + g.params.diet * 0.1 + (shape === 'lean' ? 0.1 : 0)) * breathe;
  const legR = bodyR * 0.36 * (0.8 + g.params.gravity * 0.5) * (g.legType === 'column' ? 1.35 : g.legType === 'unguligrade' ? 0.8 : g.legType === 'insectoid' ? 0.6 : 1) * (giant ? 1.15 : 1);
  const n = g.locomotion === 'hexapod' ? 3 : g.locomotion === 'octopod' ? 4 : 2;
  const stride = U * 0.2;
  const specs: LegSpec[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = lerp3(hip, sh, t);
    for (const s of [-1, 1]) {
      // diagonal gait for quadrupeds, alternating tripods for insects
      const phase = ((i + (s > 0 ? 1 : 0)) % 2) * Math.PI;
      specs.push({ hip: add(p, [0, -bodyR * 0.3, s * bodyR * 0.55]), side: s, front: t > 0.5, len: p[1] - bodyR * 0.3, r: legR, phase, stride, type: g.legType });
    }
  }
  specs.forEach(sp => leg(S, k, g, sp, ph));
  // tail
  tail(S, k, g, add(hip, [-rHip * 0.6, rHip * 0.2, 0]), U * (0.3 + g.tailLen * 1.4), rHip * 0.5, ph, -0.45 + g.tailLen * 0.3);
  // torso
  const axis: V3 = [sh[0] - hip[0], sh[1] - hip[1], 0];
  if (shape === 'round') S.blob(lerp3(hip, sh, 0.5), axis, bodyLen * 0.6, bodyR * 1.05, k.body, { g: 1 }, bodyR * 1.05);
  else {
    S.blob(hip, axis, rHip * 1.15, rHip, k.body, { g: 1 });
    S.blob(sh, axis, rCh * 1.1, rCh, k.body, { g: 1 }, rCh * 1.05);
    S.blob(lerp3(hip, sh, 0.5), axis, bodyLen * 0.45, bodyR * (shape === 'barrel' ? 1.05 : 0.88) * breathe, k.body, { g: 1 }, bodyR * (shape === 'barrel' ? 1.08 : 0.82));
    if (shape === 'humped') S.ball(add(sh, [-rCh * 0.4, rCh * 0.75, 0]), rCh * 0.7, k.body, { g: 1 });
  }
  backFeature(S, k, g, hip, sh, t => rHip + (rCh - rHip) * t, U, ph);
  if (g.wings !== 'none') wings(S, k, g, add(sh, [-rCh * 0.4, rCh * 0.7, 0]), U * (1.3 + g.params.atmosphere * 0.5), ph, rCh);
  // centauroids: an upright torso with arms rises from the shoulders
  let neckRoot: V3 = add(sh, [rCh * 0.45, rCh * 0.3, 0]);
  if (g.locomotion === 'centauroid') {
    const top = add(sh, [rCh * 0.3, U * 1.0, 0]);
    S.limb(add(sh, [rCh * 0.2, rCh * 0.3, 0]), top, rCh * 0.75, rCh * 0.65, k.body, { g: 1 });
    for (const s of [-1, 1]) arm(S, k, g, add(top, [0, -U * 0.08, s * rCh * 0.7]), s, U * 0.55, rCh * 0.26, ph);
    neckRoot = add(top, [0, rCh * 0.4, 0]);
  }
  // neck & head
  const neckLen = U * (0.22 + g.neck * 1.05) * (g.locomotion === 'centauroid' ? 0.4 : 1);
  const np = S.chain(neckRoot, 0, 0.55 + g.neck * 0.5 + Math.sin(ph) * 0.04, 3, neckLen, rCh * 0.62, rCh * 0.5, i => [-0.12 * i, 0], k.body, { g: 1 });
  const nk = np[np.length - 1];
  const R = U * 0.34 * g.headSize * (giant ? 0.8 : 1);
  if (g.back === 'mane') {
    for (let i = 0; i < np.length; i++) S.ball(add(np[i], [-rCh * 0.25, rCh * 0.3, 0]), rCh * 0.62, { ...k.tuft, fuzz: 1.4 }, { g: 1 });
    S.ball(add(nk, [-R * 0.3, R * 0.1, 0]), R * 1.25, { ...k.tuft, fuzz: 1.5 }, { g: 1, bias: -R });
  }
  drawHead(S, k, g, add(nk, [R * 0.4, R * 0.25, 0]), R, { ph, blink });
}

function arm(S: Sketch, k: Kit, g: Genome, sh: V3, s: number, len: number, r: number, ph: number) {
  const sw = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.15;
  const hand: V3 = add(sh, [len * (0.35 + sw), -len * 0.95, s * r * 1.2]);
  const el: V3 = add(sh, [-len * 0.15, -len * 0.5, s * r * 1.3]);
  S.limb(sh, el, r, r * 0.8, k.limb);
  S.limb(el, hand, r * 0.8, r * 0.65, k.limb);
  S.ball(hand, r * 0.85, k.limb);
  if (g.claws) S.limb(hand, add(hand, [r * 1.2, -r * 0.6, 0]), 0.6, 0.35, k.claw, { noLine: true, bias: 0.2 });
}

function biped(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number, giant: boolean) {
  const fly = g.locomotion === 'flyer', hop = g.locomotion === 'hopper';
  const bodyR = U * 0.4 * g.girth * (fly ? 0.75 : 1);
  const L = U * g.legLen * (hop ? 0.75 : fly ? 0.7 : 1.0);
  const tilt = hop ? 0.95 : fly ? (S.anim === 'fly' ? 0.12 : 0.65) : 0.5;
  const tl = U * 0.95 * g.length * (fly ? 0.8 : 1);
  const hip: V3 = [-U * 0.25, L + bodyR * 0.1, 0];
  const ch: V3 = add(hip, [Math.cos(tilt) * tl, Math.sin(tilt) * tl, 0]);
  const breathe = 1 + Math.sin(ph) * 0.025;
  const type = hop ? 'digitigrade' : g.legType === 'column' ? 'column' : g.legType === 'insectoid' ? 'insectoid' : fly || g.covering === 'feathers' ? 'avian' : g.legType === 'sprawl' || g.legType === 'stubby' ? 'digitigrade' : g.legType;
  for (const s of [-1, 1]) leg(S, k, g, { hip: add(hip, [0, -bodyR * 0.2, s * bodyR * 0.5]), side: s, front: false, len: L, r: bodyR * 0.4 * (hop ? 1.3 : 1) * (giant ? 1.2 : 1), phase: s > 0 ? Math.PI : 0, stride: U * (hop ? 0.08 : 0.2), type } as LegSpec, ph);
  tail(S, k, g, add(hip, [-bodyR * 0.6, 0, 0]), U * (0.4 + g.tailLen * (hop ? 1.8 : 1.6)), bodyR * (hop ? 0.75 : 0.6), ph, hop ? -0.55 : -0.1);
  const axis: V3 = [ch[0] - hip[0], ch[1] - hip[1], 0];
  S.blob(hip, axis, bodyR * 1.1, bodyR * breathe, k.body, { g: 1 });
  S.blob(ch, axis, bodyR * 1.0, bodyR * 0.9 * breathe, k.body, { g: 1 });
  S.limb(hip, ch, bodyR * breathe, bodyR * 0.85, k.body, { g: 1 });
  backFeature(S, k, g, hip, ch, () => bodyR * 0.9, U * 0.8, ph);
  if (fly || g.wings !== 'none') wings(S, k, g, add(ch, [-bodyR * 0.3, bodyR * 0.4, 0]), U * (1.35 + g.params.atmosphere * 0.6), ph, bodyR);
  else for (const s of [-1, 1]) arm(S, k, g, add(ch, [bodyR * 0.2, -bodyR * 0.3, s * bodyR * 0.65]), s, U * 0.45 * (0.6 + g.params.diet * 0.4) * (hop ? 0.8 : 1), bodyR * 0.26, ph);
  const np = S.chain(add(ch, [bodyR * 0.35, bodyR * 0.3, 0]), 0, 1.15 + Math.sin(ph) * 0.04, 3, U * (0.18 + g.neck * 0.7), bodyR * 0.6, bodyR * 0.5, i => [-0.18 * i, 0], k.body, { g: 1 });
  const R = U * 0.34 * g.headSize * (fly ? 0.85 : 1) * (giant ? 0.8 : 1);
  if (g.back === 'mane') S.ball(add(np[np.length - 1], [-R * 0.3, 0, 0]), R * 1.2, { ...k.tuft, fuzz: 1.5 }, { g: 1, bias: -R });
  drawHead(S, k, g, add(np[np.length - 1], [R * 0.35, R * 0.2, 0]), R, { ph, blink });
}

function serpent(S: Sketch, k: Kit, g: Genome, ph: number, blink: boolean, U: number) {
  const R = U * 0.3 * g.girth;
  const n = 18, L = U * 4.2 * g.length;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t < 0.62) pts.push([-L * 0.45 + t * L * 0.8, R, Math.sin(t * 9 - ph) * U * 0.45 * (1 - t * 0.6)]);
    else { const u = (t - 0.62) / 0.38; pts.push([-L * 0.45 + 0.62 * L * 0.8 + Math.sin(u * 2.2) * U * 0.55, R + u * U * 1.5 + Math.sin(ph + u * 3) * 1.2, Math.sin(0.62 * 9 - ph) * U * 0.18 * (1 - u)]); }
  }
  const rad = (t: number) => R * (t < 0.15 ? 0.25 + t / 0.15 * 0.75 : t > 0.9 ? 0.85 : 1);
  const [hx, hy, hz] = pts[n];
  if (g.horns === 'frill' || g.ears === 'fins') S.blob([hx - R * 0.6, hy - R * 1.2, hz], [0, 1, 0.3], R * 2.1, R * 1.4, { ...k.body, pattern: null }, { bias: -R * 2 }, R * 0.4);
  for (let i = 0; i < n; i++) S.limb(pts[i], pts[i + 1], rad(i / n), rad((i + 1) / n), k.body, { g: 1 });
  if (g.tail === 'thagomizer' || g.tail === 'club' || g.tail === 'stinger') S.ball(pts[0], R * 0.5, k.horn);
  if (Math.sin(ph * 2) > 0.3) for (const s of [-1, 1]) S.limb([hx + R * 1.5, hy - R * 0.3, hz], [hx + R * 2.8, hy - R * 0.2 + s * R * 0.25, hz + s * R * 0.2], 0.45, 0.35, k.mouth, { bias: 0.5 });
  drawHead(S, k, g, [hx + R * 0.3, hy + R * 0.1, hz], R * 1.05, { ph, blink, tilt: 0.1 });
}
void add;
