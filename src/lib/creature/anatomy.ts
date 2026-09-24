// Biological stages: cell, sea larva, swimmer, leviathan, the first walker and the land animal.
// Everything is built in a local frame facing right. Land creatures stand on y = 0; swimmers and
// cells are centred on (0, 0). `ph` is the animation phase (0..2π over the loop).
import { Genome } from './genome';
import { Rig, Kit, ik, rot, framePts, head, eye } from './rig';
import { darkenRamp } from './raster';

const TAU = Math.PI * 2;
/** Reverses a flat [x, y, x, y, ...] list point-wise. */
const revPairs = (a: number[]) => { const o: number[] = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); return o; };

// ---------------------------------------------------------------------------------------------------
// Cell
// ---------------------------------------------------------------------------------------------------
export function buildCell(rig: Rig, k: Kit, g: Genome, ph: number) {
  const c = g.cell, R = 16 + g.size * 6;
  const pulse = 1 + Math.sin(ph) * 0.04;
  const rx = (c.shape === 'oval' ? R * 1.35 : c.shape === 'rod' ? R * 1.7 : R) * pulse, ry = (c.shape === 'rod' ? R * 0.62 : c.shape === 'oval' ? R * 0.85 : R) / pulse;
  const mem = { ...k.gel, alpha: 1, tex: 'skin' as const, ramp: darkenRamp(k.gel.ramp, 0.82), spec: 0.4 };
  // flagella behind (travelling wave), cilia around, spikes
  for (let f = 0; f < c.flagella; f++) {
    const a0 = Math.PI + (f - (c.flagella - 1) / 2) * 0.45;
    rig.chain(Math.cos(a0) * rx * 0.95, Math.sin(a0) * ry * 0.95, a0, 12, R * 2.4, 0.9, 0.5, i => Math.sin(ph * 2 - i * 0.9 + f) * 0.32, mem, { noLine: false });
  }
  if (c.cilia) for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, wob = Math.sin(ph * 3 + i * 0.8) * 0.35;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    rig.c(x, y, x + Math.cos(a + wob) * 3.2, y + Math.sin(a + wob) * 3.2, 0.45, 0.4, mem);
  }
  if (c.shape === 'star' || c.spikes) {
    const n = c.shape === 'star' ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3, l = c.shape === 'star' ? R * 0.75 : R * 0.35;
      const bx = Math.cos(a) * rx * 0.8, by = Math.sin(a) * ry * 0.8;
      rig.p(framePts(bx, by, a, [0, -R * 0.18, l, 0, 0, R * 0.18]), c.shape === 'star' ? mem : k.claw);
    }
  }
  // membrane + cytoplasm
  if (c.shape === 'rod') {
    rig.c(-rx + ry, 0, rx - ry, 0, ry, ry, mem, { g: 1 });
    rig.c(-rx + ry, 0, rx - ry, 0, ry - 1.6, ry - 1.6, k.gel, { g: 1 });
  } else {
    rig.e(0, 0, rx, ry, 0, mem, { g: 1 });
    rig.e(0, 0, rx - 1.6, ry - 1.6, 0, k.gel, { g: 1 });
  }
  // organelles drifting in the cytoplasm
  for (let i = 0; i < c.organelles; i++) {
    const a = g.r[60 + i] * TAU + Math.sin(ph + i) * 0.08, d = 0.3 + g.r[70 + i] * 0.45;
    const x = Math.cos(a) * rx * d, y = Math.sin(a) * ry * d;
    const m = k.organelle[i % 3];
    if (i % 3 === 0) rig.c(x - 1.8, y - 0.6, x + 1.8, y + 0.6, 1.1, 1.1, m);
    else rig.e(x, y, 1.2 + g.r[80 + i] * 1.4, 1.1 + g.r[80 + i], 0, m);
  }
  // nucleus + eyespot
  rig.e(-rx * 0.15, ry * 0.05, R * 0.38, R * 0.34, 0, k.nucleus);
  rig.e(-rx * 0.15 - 1, ry * 0.05 - 1, R * 0.12, R * 0.12, 0, { ...k.nucleus, alpha: 1, ramp: darkenRamp(k.nucleus.ramp, 0.7) });
  rig.e(rx * 0.62, -ry * 0.35, 1.6, 1.4, 0, { ...k.glow, ramp: k.organelle[0].ramp.map(c => [c[0], c[1] * 0.4, c[2] * 0.3]) as typeof k.glow.ramp });
}

// ---------------------------------------------------------------------------------------------------
// Sea larva
// ---------------------------------------------------------------------------------------------------
export function buildLarva(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean) {
  const S = 13 + g.size * 4;
  const f = g.aquaForm;
  if (f === 'crustacean') {
    // zoea: round shell, a dorsal spike, feathery legs and one big eye
    rig.c(-S * 0.4, 0, -S * 1.9, S * 0.3 + Math.sin(ph) * 1.5, S * 0.26, 0.6, k.body);
    rig.c(S * 0.1, -S * 0.3, S * 0.3, -S * 1.6, S * 0.2, 0.5, k.body);
    for (let i = 0; i < 3; i++) {
      const a = 1.1 + i * 0.35 + Math.sin(ph * 2 + i) * 0.35;
      const pts = rig.chain(S * 0.1 - i * 2, S * 0.3, a, 3, S * 0.9, 0.7, 0.4, () => 0.2, k.limb, { dark: 0.85 });
      for (const [x, y] of pts.slice(1)) rig.c(x, y, x + 1.6, y + 1.4, 0.35, 0.3, k.limb);
    }
    rig.e(0, 0, S * 0.7, S * 0.6, 0, { ...k.gel, alpha: 0.9 }, { g: 1 });
    eye(rig, k, g, S * 0.4, -S * 0.1, S * 0.3, blink);
    return;
  }
  if (f === 'cephalopod') {
    for (let i = 0; i < 6; i++) rig.chain(S * 0.45, S * 0.05 + (i - 3) * 0.6, 0.2 + (i - 2.5) * 0.25, 4, S * 0.9, 0.9, 0.4, j => Math.sin(ph * 2 - j - i) * 0.25, k.body, { dark: i % 2 ? 0.75 : 1 });
    rig.e(-S * 0.35, -S * 0.15, S * 0.8, S * 0.55, -0.25, { ...k.gel, alpha: 0.85 }, { g: 1 });
    for (let i = 0; i < 5; i++) rig.e(-S * 0.6 + g.r[90 + i] * S * 0.9, -S * 0.4 + g.r[95 + i] * S * 0.5, 0.9, 0.9, 0, { ...k.body, alpha: 0.9 }, { noLine: true });
    rig.e(S * 0.35, 0, S * 0.4, S * 0.38, 0, k.body, { g: 1 });
    eye(rig, k, g, S * 0.42, -S * 0.08, S * 0.26, blink);
    return;
  }
  if (f === 'eel') {
    // leptocephalus: a transparent leaf with a tiny head
    const w = Math.sin(ph) * 0.12;
    rig.p(framePts(0, 0, w, [S * 1.2, 0, S * 0.4, -S * 0.55, -S * 0.9, -S * 0.3, -S * 1.6, 0, -S * 0.9, S * 0.3, S * 0.4, S * 0.55]), { ...k.gel, alpha: 0.7 }, { flat: 0.5 });
    for (let i = -4; i <= 4; i++) rig.c(i * S * 0.22, -S * 0.3, i * S * 0.22 - 1.5, S * 0.3, 0.35, 0.35, { ...k.gel, alpha: 0.5, ramp: darkenRamp(k.gel.ramp, 0.8) }, { noLine: true });
    rig.e(S * 1.1, 0, S * 0.26, S * 0.2, 0, k.body);
    eye(rig, k, g, S * 1.18, -S * 0.05, 1.4, blink);
    return;
  }
  // fish fry / tadpole: round head-body, yolk sac, waving tail with a fin fold
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-S * 0.2 - t * S * 1.8, Math.sin(ph * 2 - t * 4) * S * 0.25 * t]); }
  const fin: number[] = [];
  pts.forEach(([x, y], i) => fin.push(x, y - S * 0.45 * Math.sin((i / 8) * Math.PI * 0.95 + 0.1)));
  for (let i = pts.length - 1; i >= 0; i--) fin.push(pts[i][0], pts[i][1] + S * 0.38 * Math.sin((i / 8) * Math.PI * 0.95 + 0.1));
  rig.p(fin, k.fin, { flat: 0.6 });
  for (let i = 0; i < 8; i++) rig.c(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], S * 0.32 * (1 - i / 9), S * 0.32 * (1 - (i + 1) / 9), k.body, { g: 1 });
  rig.e(S * 0.1, S * 0.25, S * 0.4, S * 0.3, 0, { ...k.inner, ramp: k.body.belly ?? k.inner.ramp, alpha: 0.9 }, { g: 1 });
  rig.e(S * 0.25, -S * 0.05, S * 0.62, S * 0.52, 0, k.body, { g: 1 });
  eye(rig, k, g, S * 0.48, -S * 0.2, S * 0.26, blink);
}

// ---------------------------------------------------------------------------------------------------
// Swimmers (normal & giant)
// ---------------------------------------------------------------------------------------------------
export function buildSwimmer(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean, giant: boolean) {
  const S = (giant ? 36 : 23) * (0.8 + g.size * 0.4);
  const f = g.aquaForm;
  if (f === 'cephalopod') return cephalopod(rig, k, g, ph, blink, S, giant);
  if (f === 'crustacean') return crustacean(rig, k, g, ph, blink, S, giant);
  const eel = f === 'eel';
  const len = S * (eel ? 3.6 : 2.3) * g.length, maxR = S * (eel ? 0.26 : 0.56) * g.girth * (giant ? 1.1 : 1);
  const n = eel ? 14 : 9;
  const sp: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sp.push([len / 2 - t * len, Math.sin(ph - t * (eel ? 7 : 4)) * S * (eel ? 0.22 : 0.12) * t * t]);
  }
  const rad = (t: number) => maxR * (t < 0.22 ? 0.62 + (t / 0.22) * 0.38 : 1 - Math.pow((t - 0.22) / 0.78, 1.3) * (eel ? 0.8 : 0.86));
  const tail = sp[n], pre = sp[n - 1];
  const ta = Math.atan2(tail[1] - pre[1], tail[0] - pre[0]);
  const F = S * (eel ? 0.5 : 0.85) * (giant ? 1.1 : 1);
  const rr = rad(1);
  // tail fin (in a frame pointing backwards along the last segment)
  const tf: Record<string, number[]> = {
    forked: [0, -rr, F, -F * 0.8, F * 0.45, 0, F, F * 0.8, 0, rr],
    lunate: [0, -rr, F * 0.8, -F * 0.95, F * 0.55, -F * 0.3, F * 0.48, 0, F * 0.55, F * 0.3, F * 0.8, F * 0.95, 0, rr],
    round: [0, -rr, F * 0.5, -F * 0.6, F * 0.85, -F * 0.3, F * 0.95, 0, F * 0.85, F * 0.3, F * 0.5, F * 0.6, 0, rr],
    shark: [0, -rr, F * 1.15, -F * 1.05, F * 0.55, 0, F * 0.6, F * 0.45, 0, rr],
  };
  const fin = (local: number[], x: number, y: number, a: number, o = {}) => rig.p(framePts(x, y, a, local), k.fin, { flat: 0.6, ...o });
  // far pectoral, tail fin, dorsal & anal fins sit behind the body
  const gx = sp[2][0], gy = sp[2][1];
  const flap = Math.sin(ph * 2) * 0.25;
  fin([0, 0, S * 0.55, -S * 0.12, S * 0.6, S * 0.12], gx - S * 0.05, gy + maxR * 0.3, 2.3 + flap, { dark: 0.7 });
  if (!eel) fin(tf[g.finShape], tail[0], tail[1], ta);
  else {
    const top: number[] = [], bot: number[] = [];
    for (let i = 3; i <= n; i++) { const t = i / n; top.push(sp[i][0], sp[i][1] - rad(t) - S * 0.22 * Math.sin(t * Math.PI)); bot.push(sp[i][0], sp[i][1] + rad(t) + S * 0.18 * Math.sin(t * Math.PI)); }
    rig.p([...top, ...revPairs(bot)], k.fin, { flat: 0.6 });
  }
  if (!eel && g.dorsal !== 'none') {
    const a = Math.floor(n * 0.3), b = Math.floor(n * (g.dorsal === 'ridge' ? 0.8 : 0.58));
    const pts: number[] = [];
    for (let i = a; i <= b; i++) {
      const t = (i - a) / Math.max(1, b - a), hgt = g.dorsal === 'tall' ? S * 0.55 * Math.pow(1 - t, 0.8) * Math.min(1, t * 3.5) : g.dorsal === 'sail' ? S * 0.6 * Math.sin(t * Math.PI) : S * 0.22 * Math.sin(t * Math.PI);
      pts.push(sp[i][0] - (g.dorsal === 'tall' ? t * t * S * 0.35 : 0), sp[i][1] - rad(i / n) * 0.8 - hgt);
    }
    for (let i = b; i >= a; i--) pts.push(sp[i][0], sp[i][1] - rad(i / n) * 0.5);
    rig.p(pts, k.fin, { flat: 0.6 });
    fin([0, 0, S * 0.4, S * 0.3, S * 0.05, S * 0.35], sp[Math.floor(n * 0.7)][0], sp[Math.floor(n * 0.7)][1] + rad(0.7) * 0.6, 0.3);
  }
  // body
  for (let i = 0; i < n; i++) rig.c(sp[i][0], sp[i][1], sp[i + 1][0], sp[i + 1][1], rad(i / n), rad((i + 1) / n), k.body, { g: 1 });
  if (giant) {
    // armour plates along the back
    for (let i = 1; i < n - 2; i++) rig.e(sp[i][0], sp[i][1] - rad(i / n) * 0.62, rad(i / n) * 0.62, rad(i / n) * 0.36, -0.08, k.plate, { g: 2 });
  }
  // gills
  for (let i = 0; i < (giant ? 4 : 3); i++) {
    const x = sp[1][0] - i * S * 0.12 - S * 0.1, y = sp[1][1];
    rig.c(x + S * 0.05, y - maxR * 0.45, x - S * 0.02, y + maxR * 0.4, 0.5, 0.5, { ...k.mouth, ramp: darkenRamp(k.body.ramp, 0.55) }, { noLine: true });
  }
  // near pectoral & pelvic fins
  fin([0, 0, S * 0.55, -S * 0.14, S * 0.62, S * 0.14], gx, gy + maxR * 0.35, 2.2 - flap);
  fin([0, 0, S * 0.35, -S * 0.08, S * 0.35, S * 0.12], sp[4][0], sp[4][1] + rad(0.45) * 0.85, 2.0 + flap * 0.5);
  // glowing lateral line (deep / exotic species)
  if (giant && g.glow > 0.25 || g.glow > 0.6) {
    for (let i = 1; i < n - 1; i++) rig.e(sp[i][0], sp[i][1] + rad(i / n) * 0.15, 1, 1, 0, k.glow, { noLine: true });
  }
  // head: eye, mouth, teeth, barbels
  const hx = sp[0][0], hy = sp[0][1];
  const er = Math.max(1.4, maxR * 0.28 * g.eyeSize * (giant ? 0.7 : 1));
  if (g.eyes === 1) eye(rig, k, g, hx - maxR * 0.35, hy - maxR * 0.3, er * 1.4, blink);
  else for (let i = g.eyes - 1; i >= 0; i--) eye(rig, k, g, hx - maxR * (0.35 + (i % 3) * 0.35), hy - maxR * (0.28 + Math.floor(i / 2) * 0.22), Math.max(1.2, er * (1 - i * 0.18)), blink);
  const open = giant ? (0.5 + Math.sin(ph) * 0.2) * maxR * 0.4 : 0;
  rig.c(hx - maxR * 0.1, hy + maxR * 0.28, hx + maxR * 0.55, hy + maxR * 0.2 + open * 0.3, 0.6 + open * 0.5, 0.6 + open * 0.35, k.mouth, { noLine: true });
  if (giant && (g.params.diet > 0.4 || g.jaw === 'teeth')) {
    for (let i = 0; i < 5; i++) {
      const x = hx - maxR * 0.05 + i * maxR * 0.13, y = hy + maxR * 0.22;
      rig.p([x - 1, y, x + 1, y, x, y + 2.6], k.teeth, { noLine: true });
      rig.p([x - 1, y + open * 0.9 + 1.6, x + 1, y + open * 0.9 + 1.6, x, y + open * 0.9 - 0.6], k.teeth, { noLine: true });
    }
  }
  if (giant || g.tentacleBeard) for (let i = 0; i < 2; i++) rig.chain(hx + maxR * 0.2 - i * 3, hy + maxR * 0.45, 1.3, 5, S * 0.8, 0.9, 0.5, j => Math.sin(ph - j * 0.8 + i) * 0.22, k.skinWet);
}

function cephalopod(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean, S: number, giant: boolean) {
  const arms = giant ? 8 : 6;
  const hx = S * 0.35, hy = 0;
  const armMat = { ...k.body, pattern: null, belly: undefined };
  // far arms, mantle fins, mantle, head, near arms
  const arm = (i: number, dk: number) => {
    const a0 = 0.15 + (i / arms) * 1.2;
    const pts = rig.chain(hx + S * 0.3, hy + S * 0.1, a0, 8, S * (1.5 + (i % 3) * 0.25), S * 0.16, 0.6, j => 0.08 + Math.sin(ph - j * 0.7 + i) * 0.16, armMat, { dark: dk });
    if (giant && dk === 1) for (let j = 2; j < pts.length; j += 2) rig.e(pts[j][0], pts[j][1] + 1.2, 0.9, 0.9, 0, k.inner, { noLine: true });
  };
  for (let i = 0; i < arms; i += 2) arm(i, 0.7);
  const mx = -S * 0.55, my = -S * 0.35, ma = -0.35 + Math.sin(ph) * 0.04;
  rig.p(framePts(mx, my, ma, [-S * 0.8, 0, -S * 1.25, -S * 0.45, -S * 0.95, 0, -S * 1.25, S * 0.45]), k.fin, { flat: 0.5 });
  rig.e(mx, my, S * (1.1 + g.length * 0.2), S * 0.5 * g.girth * (1 + Math.sin(ph) * 0.05), ma, k.body, { g: 1 });
  rig.e(hx, hy, S * 0.45, S * 0.42, 0, k.body, { g: 1 });
  rig.c(hx - S * 0.2, hy + S * 0.3, hx - S * 0.45, hy + S * 0.5, S * 0.12, S * 0.1, k.body);
  for (let i = 1; i < arms; i += 2) arm(i, 1);
  // two long hunting tentacles with clubs
  for (let t = 0; t < 2; t++) {
    const pts = rig.chain(hx + S * 0.35, hy + S * 0.05, 0.05 + t * 0.2, 10, S * 2.4, S * 0.08, S * 0.06, j => Math.sin(ph * 1.3 - j * 0.5 + t) * 0.12, armMat, { dark: t ? 0.75 : 1 });
    const [ex, ey] = pts[pts.length - 1];
    rig.e(ex, ey, S * 0.22, S * 0.12, 0.2, armMat, { dark: t ? 0.75 : 1 });
  }
  const er = Math.max(1.6, S * 0.2 * g.eyeSize);
  eye(rig, k, g, hx + S * 0.05, hy - S * 0.12, er, blink, 0.4);
  if (giant && g.glow > 0.2) for (let i = 0; i < 7; i++) rig.e(mx - S * 0.9 + i * S * 0.3, my + S * 0.15 * Math.sin(i), 1, 1, 0, k.glow, { noLine: true });
}

function crustacean(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean, S: number, giant: boolean) {
  const shell = { ...k.body, tex: 'chitin' as const, spec: 0.7, fuzz: 0 };
  const legs = (dk: number, off: number) => {
    for (let i = 0; i < 4; i++) {
      const ax = S * 0.3 - i * S * 0.35 + off, ay = S * 0.25;
      const fx = ax + Math.sin(ph + i * 1.3 + off) * S * 0.12 - S * 0.1, fy = S * 0.95;
      const [kx, ky] = ik(ax, ay, fx, fy, S * 0.5, S * 0.55, -1);
      rig.c(ax, ay, kx, ky, S * 0.08, S * 0.07, shell, { dark: dk });
      rig.c(kx, ky, fx, fy, S * 0.07, 0.6, shell, { dark: dk });
    }
  };
  legs(0.65, S * 0.1);
  // antennae
  for (let i = 0; i < 2; i++) rig.chain(S * 0.9, -S * 0.2, -0.5 - i * 0.25, 10, S * (2.2 - i * 0.6), 0.8, 0.5, j => 0.06 + Math.sin(ph - j * 0.5 + i) * 0.05, shell, { dark: i ? 0.7 : 1 });
  // tail: segments curling down, fan at the end
  let x = -S * 0.5, y = 0;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + 0.15 + i * 0.2 + Math.sin(ph) * 0.05, l = S * 0.34;
    const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
    rig.c(x, y, nx, ny, S * (0.42 - i * 0.05), S * (0.38 - i * 0.05), shell, { g: 2 });
    x = nx; y = ny;
  }
  rig.p(framePts(x, y, Math.PI + 1.2, [0, -S * 0.12, S * 0.5, -S * 0.35, S * 0.62, 0, S * 0.5, S * 0.35, 0, S * 0.12]), { ...shell, tex: 'fin', alpha: 0.95 }, { flat: 0.5 });
  // carapace
  rig.e(S * 0.15, 0, S * 0.8 * g.length, S * 0.48 * g.girth, 0, shell, { g: 1 });
  if (giant) for (let i = 0; i < 4; i++) rig.p(framePts(-S * 0.3 + i * S * 0.3, -S * 0.45, -0.3, [0, 0, S * 0.18, -S * 0.3, S * 0.3, 0]), k.claw);
  // claws
  const claw = (dk: number, dy: number) => {
    const sx = S * 0.7, sy = S * 0.2 + dy;
    const pts = rig.chain(sx, sy, 0.3, 2, S * 0.9, S * 0.13, S * 0.16, i => (i ? -0.8 : 0), shell, { dark: dk });
    const [cx, cy] = pts[2];
    const open = 0.25 + Math.max(0, Math.sin(ph)) * 0.35;
    rig.e(cx + S * 0.2, cy - S * 0.05, S * 0.36 * (giant ? 1.3 : 1), S * 0.22, -0.5, shell, { dark: dk });
    rig.c(cx + S * 0.35, cy - S * 0.2, cx + S * 0.85, cy - S * 0.45 - open * S * 0.3, S * 0.12, 0.8, shell, { dark: dk });
    rig.c(cx + S * 0.35, cy - S * 0.05, cx + S * 0.8, cy - S * 0.15 + open * S * 0.2, S * 0.1, 0.8, shell, { dark: dk });
  };
  claw(0.7, -S * 0.1);
  legs(1, 0);
  claw(1, 0);
  // stalked eyes
  const er = Math.max(1.3, S * 0.13 * g.eyeSize);
  rig.c(S * 0.75, -S * 0.3, S * 0.85, -S * 0.62, S * 0.07, S * 0.06, shell);
  eye(rig, k, g, S * 0.87, -S * 0.66, er, blink);
}

// ---------------------------------------------------------------------------------------------------
// First walker (amphibian)
// ---------------------------------------------------------------------------------------------------
export function buildAmphibian(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean) {
  const S = 22 * (0.8 + g.size * 0.4);
  const legH = S * 0.42, bodyR = S * 0.34 * g.girth;
  const len = S * 2.1 * g.length;
  const skin = k.skinWet, limb = { ...skin, belly: undefined };
  const baseY = -legH - bodyR * 0.35;
  const n = 8;
  const sp: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; sp.push([len * 0.35 - t * len, baseY + Math.sin(ph - t * 3) * S * 0.04 * t + t * t * bodyR * 0.9]); }
  const rad = (t: number) => bodyR * (t < 0.3 ? 0.85 + t * 0.5 : 1 - (t - 0.3) / 0.7 * 0.88);
  const leg = (ax: number, ay: number, phase: number, dk: number, front: boolean) => {
    const w = ph + phase;
    const fx = ax + Math.sin(w) * S * 0.25 + (front ? S * 0.12 : -S * 0.05), fy = -Math.max(0, -Math.cos(w)) * S * 0.12;
    const [kx, ky] = ik(ax, ay, fx, fy, legH * 0.8, legH * 0.75, front ? 1 : -1);
    rig.c(ax, ay, kx, ky, bodyR * 0.36, bodyR * 0.28, limb, { dark: dk });
    rig.c(kx, ky, fx, fy - 1, bodyR * 0.28, bodyR * 0.24, limb, { dark: dk });
    rig.e(fx + 1.5, fy - 1, bodyR * 0.42, bodyR * 0.2, 0, limb, { dark: dk });
  };
  const fA = sp[1], bA = sp[5];
  leg(fA[0] + 1, fA[1] + bodyR * 0.4, Math.PI, 0.7, true);
  leg(bA[0] + 1, bA[1] + bodyR * 0.4, 0, 0.7, false);
  // tail with a fin fold above and below
  const top: number[] = [], bot: number[] = [];
  for (let i = 4; i <= n; i++) { const t = i / n, fh = S * 0.18 * Math.sin((t - 0.45) / 0.55 * Math.PI); top.push(sp[i][0], sp[i][1] - rad(t) - fh); bot.push(sp[i][0], sp[i][1] + rad(t) + fh * 0.6); }
  rig.p([...top, ...revPairs(bot)], k.fin, { flat: 0.6 });
  for (let i = 0; i < n; i++) rig.c(sp[i][0], sp[i][1], sp[i + 1][0], sp[i + 1][1], rad(i / n), rad((i + 1) / n), skin, { g: 1 });
  // gill frills (a memory of the sea)
  for (let i = 0; i < 3; i++) rig.chain(sp[0][0] - S * 0.05, sp[0][1] - bodyR * 0.2 + i * 1.6, Math.PI + 0.9 - i * 0.4, 3, S * 0.35, 0.9, 0.5, () => Math.sin(ph + i) * 0.2, k.crest);
  leg(fA[0], fA[1] + bodyR * 0.5, 0, 1, true);
  leg(bA[0], bA[1] + bodyR * 0.5, Math.PI, 1, false);
  // flat wide head with eyes on top
  const hx = sp[0][0] + S * 0.3, hy = sp[0][1] - S * 0.02;
  const hR = bodyR * 1.05;
  rig.e(hx, hy, hR * 1.35, hR * 0.72, 0.05, skin, { g: 1 });
  rig.c(hx + hR * 0.2, hy + hR * 0.25, hx + hR * 1.25, hy + hR * 0.2, 0.55, 0.55, k.mouth, { noLine: true });
  const er = Math.max(1.6, hR * 0.32 * g.eyeSize);
  rig.e(hx + hR * 0.35, hy - hR * 0.55, er * 1.1, er * 0.9, 0, skin);
  eye(rig, k, g, hx + hR * 0.4, hy - hR * 0.7, er, blink);
  if (g.antennae || g.aquaForm === 'crustacean') rig.chain(hx + hR, hy - hR * 0.3, -0.4, 6, S * 0.9, 0.6, 0.5, j => 0.1 + Math.sin(ph - j) * 0.06, k.claw);
  if (g.tentacleBeard || g.aquaForm === 'cephalopod') for (let i = 0; i < 3; i++) rig.chain(hx + hR * 0.6 + i * 2, hy + hR * 0.5, 1.4, 4, S * 0.45, 0.9, 0.5, j => Math.sin(ph - j + i) * 0.25, skin);
}

// ---------------------------------------------------------------------------------------------------
// Land animal
// ---------------------------------------------------------------------------------------------------
export function buildLand(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean) {
  const S = 26 * (0.72 + g.size * 0.5);
  if (g.locomotion === 'serpent') return serpent(rig, k, g, ph, blink, S);
  const biped = g.locomotion === 'biped' || g.locomotion === 'flyer';
  const fly = g.locomotion === 'flyer';
  const grav = g.params.gravity;
  const legH = S * (biped ? 1.05 : 0.9) * g.legLen * (fly ? 0.7 : 1);
  const bodyR = S * 0.42 * g.girth * (fly ? 0.75 : 1);
  const bodyLen = S * (biped ? 0.9 : 1.55) * g.length * (fly ? 0.8 : 1);
  const breathe = 1 + Math.sin(ph) * 0.025;
  // spine
  let hipX: number, hipY: number, shX: number, shY: number;
  if (biped) { hipX = -bodyLen * 0.35; hipY = -legH - bodyR * 0.2; shX = hipX + bodyLen * Math.cos(0.55); shY = hipY - bodyLen * Math.sin(0.55); }
  else { hipX = -bodyLen / 2; shX = bodyLen / 2; hipY = -legH - bodyR * 0.45; shY = hipY - bodyR * (0.15 + (1 - g.params.diet) * 0.2); }
  const rHip = bodyR * 0.9 * breathe, rCh = bodyR * (1 + g.params.diet * 0.1) * breathe;
  const limb = { ...k.limb };
  const legR = bodyR * 0.36 * (0.75 + grav * 0.55) * (g.feet === 'pad' ? 1.35 : g.feet === 'hoof' ? 0.8 : g.feet === 'insect' ? 0.45 : 1);

  const legAt = (ax: number, ay: number, phase: number, dk: number, backLeg: boolean) => {
    const w = ph + phase;
    const stride = S * 0.2;
    const fx = ax + Math.sin(w) * stride + (backLeg ? -S * 0.05 : S * 0.05), fy = -Math.max(0, -Math.cos(w)) * S * 0.14;
    const d = Math.hypot(fx - ax, fy - ay);
    const insect = g.feet === 'insect';
    const l1 = insect ? d * 0.75 : d * 0.56 + 1, l2 = insect ? d * 0.75 : d * 0.56 + 1;
    const [kx, ky] = ik(ax, ay, fx, fy - (g.feet === 'hoof' ? legR * 0.8 : 0), l1, l2, insect ? (backLeg ? 1 : -1) : backLeg || biped ? 1 : -1);
    rig.c(ax, ay, kx, ky, legR * 1.15, legR * 0.8, limb, { dark: dk });
    const r2 = insect ? 0.6 : legR * (g.feet === 'pad' ? 0.95 : 0.62);
    rig.c(kx, ky, fx, fy - (g.feet === 'hoof' ? legR * 0.8 : legR * 0.35), legR * 0.75, r2, limb, { dark: dk });
    foot(rig, k, g, fx, fy, legR, dk);
  };

  const pairs: { x: number; y: number; back: boolean }[] = biped
    ? [{ x: hipX, y: hipY + rHip * 0.3, back: true }]
    : g.locomotion === 'hexapod'
      ? [{ x: hipX, y: hipY + rHip * 0.4, back: true }, { x: (hipX + shX) / 2, y: (hipY + shY) / 2 + bodyR * 0.5, back: true }, { x: shX, y: shY + rCh * 0.4, back: false }]
      : [{ x: hipX, y: hipY + rHip * 0.4, back: true }, { x: shX, y: shY + rCh * 0.4, back: false }];

  // wings behind (far wing)
  if (g.wings !== 'none') wing(rig, k, g, shX - bodyR * 0.2, shY - bodyR * 0.3, S, ph, 0.7, true);
  // far legs
  pairs.forEach((p, i) => legAt(p.x + 1.5, p.y - 1, (i % 2 ? Math.PI : 0) + Math.PI, 0.72, p.back));
  // tail
  const tailLen = S * (0.35 + g.tail * (biped ? 1.9 : 1.5));
  const tailA = biped ? Math.PI + 0.15 : Math.PI - 0.5 + g.tail * 0.3;
  const tp = rig.chain(hipX - rHip * 0.4, hipY - rHip * 0.1, tailA, 7, tailLen, rHip * (biped ? 0.7 : 0.5), 1, i => (biped ? 0.02 : 0.14) + Math.sin(ph - i * 0.55) * 0.07, k.body, { g: 3 });
  tailTip(rig, k, g, tp, S, ph);
  // torso
  rig.c(hipX, hipY, shX, shY, rHip, rCh, k.body, { g: 1 });
  if (!biped) rig.e((hipX + shX) / 2, (hipY + shY) / 2 + bodyR * 0.3, bodyLen * 0.42, bodyR * 0.82 * breathe, 0, k.body, { g: 1 });
  backFeature(rig, k, g, hipX, hipY, shX, shY, rHip, rCh, S, ph);
  // near legs
  pairs.forEach((p, i) => legAt(p.x, p.y, i % 2 ? Math.PI : 0, 1, p.back));
  // small arms for bipeds (not for winged bipeds)
  if (biped && !fly) {
    for (const [dk, off] of [[0.72, 1.5], [1, 0]] as const) {
      const ax = shX - rCh * 0.1 + off, ay = shY + rCh * 0.35;
      const sw = Math.sin(ph + off) * 0.15;
      const pts = rig.chain(ax, ay, 1.1 + sw, 2, S * 0.55 * (0.6 + g.params.diet * 0.4), legR * 0.75, legR * 0.45, i => (i ? -0.9 : 0), limb, { dark: dk });
      if (g.claws) { const [x, y] = pts[2]; rig.c(x, y, x + 2, y + 1.5, 0.6, 0.4, k.claw, { dark: dk }); }
    }
  }
  // neck + head
  const neckLen = S * (0.22 + g.neck * (biped ? 0.7 : 1.1));
  const na = biped ? -1.15 : -0.85 - g.neck * 0.35;
  const bob = Math.sin(ph) * 0.05;
  const np = rig.chain(shX + rCh * 0.35, shY - rCh * 0.25, na + bob, 3, neckLen, rCh * 0.62, rCh * 0.5, i => 0.18 * i * (biped ? 1 : 0.8), k.body, { g: 1 });
  const [nx, ny] = np[np.length - 1];
  const R = S * 0.34 * g.headSize * (fly ? 0.85 : 1);
  if (g.back === 'mane') {
    for (let i = 0; i < np.length; i++) rig.e(np[i][0] - rCh * 0.35, np[i][1] - rCh * 0.2, rCh * 0.55, rCh * 0.7, 0, k.hairTuft, { g: 1 });
    rig.e(nx - R * 0.5, ny - R * 0.1, R * 1.1, R * 1.05, 0, k.hairTuft, { g: 1 });
  }
  head(rig, k, g, nx + R * 0.35, ny - R * 0.15, R, { phase: ph, blink });
  if (g.wings !== 'none') wing(rig, k, g, shX - bodyR * 0.5, shY - bodyR * 0.5, S, ph, 1, false);
}

function foot(rig: Rig, k: Kit, g: Genome, fx: number, fy: number, r: number, dk: number) {
  switch (g.feet) {
    case 'paw':
      rig.e(fx + r * 0.45, fy - r * 0.45, r * 1.05, r * 0.6, 0, k.limb, { dark: dk });
      if (g.claws) for (let i = 0; i < 2; i++) rig.c(fx + r * 1.2, fy - r * 0.35 - i * 1.2, fx + r * 1.2 + 1.8, fy - r * 0.1 - i * 1.2, 0.5, 0.35, k.claw, { dark: dk, noLine: true });
      break;
    case 'hoof':
      rig.c(fx - r * 0.1, fy - r * 0.9, fx + r * 0.25, fy - r * 0.2, r * 0.75, r * 0.85, k.claw, { dark: dk });
      break;
    case 'talon':
      for (const [a, l] of [[0.1, 1], [0.45, 0.8], [Math.PI - 0.2, 0.6]] as const) rig.c(fx, fy - 1, fx + Math.cos(a) * r * 2.4 * l, fy - 0.6 + Math.sin(a) * 0.6, 0.7, 0.4, k.claw, { dark: dk });
      break;
    case 'pad':
      rig.e(fx + r * 0.2, fy - r * 0.55, r * 1.25, r * 0.6, 0, k.limb, { dark: dk });
      for (let i = 0; i < 3; i++) rig.e(fx + r * 0.6 + i * r * 0.45 - r * 0.45, fy - r * 0.2, 0.8, 0.6, 0, k.horn, { dark: dk, noLine: true });
      break;
    default: break;
  }
}

function tailTip(rig: Rig, k: Kit, g: Genome, tp: [number, number][], S: number, ph: number) {
  const [x, y] = tp[tp.length - 1], [px, py] = tp[tp.length - 2];
  const a = Math.atan2(y - py, x - px);
  switch (g.tailTip) {
    case 'tuft': rig.e(x, y, S * 0.22, S * 0.16, a, k.hairTuft); break;
    case 'club': rig.e(x, y, S * 0.24, S * 0.18, a, k.plate); for (let i = 0; i < 3; i++) rig.p(framePts(x, y, a + i * 2.1, [S * 0.12, -1, S * 0.3, 0, S * 0.12, 1]), k.horn); break;
    case 'spike': for (let i = 0; i < 4; i++) rig.p(framePts(tp[tp.length - 1 - (i >> 1)][0], tp[tp.length - 1 - (i >> 1)][1], a + (i % 2 ? 1.2 : -1.2) + (i > 1 ? 0.4 : 0), [0, -1.2, S * 0.4, 0, 0, 1.2]), k.horn); break;
    case 'fin': rig.p(framePts(x, y, a, [-S * 0.3, 0, S * 0.1, -S * 0.3, S * 0.25, 0, S * 0.1, S * 0.3]), k.fin, { flat: 0.6 }); break;
    case 'fan':
      for (let i = 0; i < 5; i++) { const b = a - 0.7 + i * 0.35 + Math.sin(ph + i) * 0.04; rig.c(x, y, x + Math.cos(b) * S * 0.9, y + Math.sin(b) * S * 0.9, S * 0.1, S * 0.14, i % 2 ? k.crest : k.body, { g: 4 }); }
      break;
    default: break;
  }
}

function backFeature(rig: Rig, k: Kit, g: Genome, hx: number, hy: number, sx: number, sy: number, rH: number, rC: number, S: number, ph: number) {
  const along = (t: number): [number, number, number] => { const x = hx + (sx - hx) * t, y = hy + (sy - hy) * t; return [x, y - (rH + (rC - rH) * t) * 0.92, rH + (rC - rH) * t]; };
  switch (g.back) {
    case 'spines': for (let i = 0; i < 7; i++) { const [x, y] = along(0.05 + i * 0.14); rig.p([x - 1.6, y + 2, x + 1.6, y + 2, x - 1.5, y - S * 0.28 * (0.6 + Math.sin(i / 6 * Math.PI) * 0.5)], k.horn); } break;
    case 'plates': for (let i = 0; i < 5; i++) { const [x, y] = along(0.08 + i * 0.2); const hgt = S * 0.45 * (0.6 + Math.sin(i / 4 * Math.PI) * 0.5); rig.p([x - S * 0.14, y + 3, x - S * 0.08, y - hgt * 0.7, x + S * 0.05, y - hgt, x + S * 0.14, y + 3], k.plate); } break;
    case 'sail': {
      const pts: number[] = [];
      for (let i = 0; i <= 8; i++) { const [x, y] = along(0.05 + i * 0.11); pts.push(x, y - S * 0.8 * Math.sin((i / 8) * Math.PI) - 1 + Math.sin(ph + i) * 0.4); }
      for (let i = 8; i >= 0; i--) { const [x, y] = along(0.05 + i * 0.11); pts.push(x, y + 2); }
      rig.p(pts, k.crest.tex === 'feathers' ? k.fin : { ...k.crest, tex: 'fin', fuzz: 0 }, { flat: 0.5 });
      break;
    }
    case 'shell': {
      const [mx, my] = along(0.5);
      rig.e(mx, my + rH * 0.35, Math.hypot(sx - hx, sy - hy) * 0.62, rC * 0.95, Math.atan2(sy - hy, sx - hx), { ...k.plate, tex: 'plates', texScale: 1.3 }, { g: 5 });
      break;
    }
    case 'quills': for (let i = 0; i < 12; i++) { const [x, y] = along(0.02 + i * 0.075); rig.c(x, y + 2, x - S * 0.45, y - S * 0.25 + (i % 2) * 2, 0.7, 0.4, i % 3 ? k.horn : k.claw); } break;
    default: break;
  }
}

function wing(rig: Rig, k: Kit, g: Genome, x: number, y: number, S: number, ph: number, dk: number, far: boolean) {
  const flap = Math.sin(ph * (g.wings === 'insect' ? 2 : 1)) * 0.45;
  const L = S * (1.35 + g.params.atmosphere * 0.6) * (far ? 0.9 : 1);
  const o = { dark: dk, flat: 0.45 };
  if (g.wings === 'insect') {
    for (let i = 0; i < 2; i++) {
      const a = -2.2 + flap - i * 0.45 + (far ? 0.15 : 0);
      const [cx, cy] = [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5];
      rig.e(cx, cy, L * 0.52, L * 0.16, a, { ...k.membrane, alpha: 0.5, tex: 'fin', line: [60, 70, 90] }, o);
    }
    return;
  }
  const a = -2.05 + flap + (far ? 0.12 : 0);
  const [ex, ey] = [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5];           // wrist
  const a2 = a - 0.75 - flap * 0.3;
  const [tx, ty] = [ex + Math.cos(a2) * L * 0.6, ey + Math.sin(a2) * L * 0.6];         // tip
  if (g.wings === 'feather') {
    const bx = x - S * 0.55, by = y + S * 0.15;
    rig.p([x, y, ex, ey, tx, ty, tx - S * 0.15, ty + S * 0.35, bx - S * 0.2, by + S * 0.1, bx, by], { ...k.body, tex: 'feathers', texScale: 1.1, belly: undefined, fuzz: 0.4 }, o);
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const px = tx + (bx - tx) * t * 0.7, py = ty + (by - ty) * t * 0.7;
      const fa = a2 + 1.9 + t * 0.4;
      rig.c(px, py, px + Math.cos(fa) * S * 0.55, py + Math.sin(fa) * S * 0.55, S * 0.1, S * 0.07, i % 2 ? k.crest : k.body, { dark: dk * 0.95 });
    }
    rig.c(x, y, ex, ey, S * 0.12, S * 0.1, k.body, { dark: dk });
  } else {
    // membrane wing: three finger bones with skin stretched between them and the flank
    const fingers: [number, number][] = [];
    for (let i = 0; i < 3; i++) { const fa = a2 + i * 0.55; fingers.push([ex + Math.cos(fa) * L * (0.75 - i * 0.12), ey + Math.sin(fa) * L * (0.75 - i * 0.12)]); }
    const pts = [x, y, ex, ey, fingers[0][0], fingers[0][1]];
    const mid = (p: [number, number], q: [number, number], s: number): [number, number] => [(p[0] + q[0]) / 2 + s, (p[1] + q[1]) / 2 + s * 0.6];
    let prev = fingers[0];
    for (let i = 1; i < 3; i++) { const m = mid(prev, fingers[i], S * 0.12); pts.push(m[0], m[1], fingers[i][0], fingers[i][1]); prev = fingers[i]; }
    pts.push(x - S * 0.5, y + S * 0.35);
    rig.p(pts, { ...k.membrane, alpha: 0.92 }, o);
    rig.c(x, y, ex, ey, S * 0.11, S * 0.09, k.limb, { dark: dk });
    for (const [fx, fy] of fingers) rig.c(ex, ey, fx, fy, S * 0.07, 0.6, k.limb, { dark: dk });
    rig.c(ex, ey, ex + 1.5, ey - 2, 0.7, 0.4, k.claw, { dark: dk });
  }
}

function serpent(rig: Rig, k: Kit, g: Genome, ph: number, blink: boolean, S: number) {
  const R = S * 0.3 * g.girth;
  const n = 18, L = S * 4.2 * g.length;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t < 0.62) pts.push([-L * 0.5 + t * L * 0.95, -R + Math.sin(t * 16 - ph) * R * 0.08 - (t < 0.05 ? 0 : 0)]);
    else { const u = (t - 0.62) / 0.38; pts.push([-L * 0.5 + 0.62 * L * 0.95 + Math.sin(u * 2.2) * S * 0.55, -R - u * S * 1.5 + Math.sin(ph + u * 3) * 1.2]); }
  }
  const rad = (t: number) => R * (t < 0.15 ? 0.25 + t / 0.15 * 0.75 : t > 0.9 ? 0.85 : 1);
  // hood (frill) behind the raised neck
  const [hx, hy] = pts[n];
  if (g.horns === 'frill' || g.ears === 'fins') rig.e(hx - R * 0.6, hy + R * 1.6, R * 1.4, R * 2.1, 0.25, { ...k.body, pattern: null }, { dark: 0.85 });
  for (let i = 0; i < n; i++) rig.c(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad(i / n), rad((i + 1) / n), k.body, { g: 1 });
  if (g.tailTip === 'spike' || g.tailTip === 'club') rig.e(pts[0][0] - 1, pts[0][1], R * 0.45, R * 0.35, 0, k.horn);
  const [tx, ty] = pts[n];
  // forked tongue flicker
  if (Math.sin(ph * 2) > 0.3) { rig.c(tx + R * 1.5, ty + R * 0.3, tx + R * 2.6, ty + R * 0.2, 0.45, 0.4, k.mouth); rig.c(tx + R * 2.6, ty + R * 0.2, tx + R * 3, ty - R * 0.1, 0.4, 0.3, k.mouth); rig.c(tx + R * 2.6, ty + R * 0.2, tx + R * 3, ty + R * 0.5, 0.4, 0.3, k.mouth); }
  head(rig, k, g, tx + R * 0.3, ty - R * 0.1, R * 1.05, { phase: ph, blink, tilt: 0.1 });
  void rot;
}
