// Titans of the cellular era: giant multicellular micro-animals a species grows from its colonies (and wild ones that
// roam the pool as bosses). Five body plans, each a real microscopic animal seen from above: the rotifer (two
// counter-rotating ciliated wheels, grinding jaws), the tardigrade (eight clawed stubby legs), the hydra (a crown of
// stinging tentacles and a bud), the nematode (an undulating ringed worm) and the copepod (one red eye, long beating
// antennae, egg sacs). Every titan wears its species' colours, pattern, glow and eyespot. Flat 2D pieces painted by
// the creatures' rasterizer, facing +x, 8 looping frames - the same art as every other cell sprite.
import { Rig } from '../creature/cell';
import { ramp, darkenRamp, Mat } from '../creature/raster';
import { mulberry, seedToInt } from '../terrain/noise';
import { CellSpecies, cellColours, TitanType } from './look';
import { Ctx, makeCtx, render, R_, hueTo, glowDots, CellSprite, FRAMES, neutralSpecies } from './art';

const TAU = Math.PI * 2;

// --- a bending body: a centre line sampled head -> tail and a width along it -------------------------------------------
interface Spine { x: number[]; y: number[]; a: number[] }   // a: the direction the body faces (towards the head)
function spine(n: number, f: (t: number) => [number, number]): Spine {
  const x: number[] = [], y: number[] = [], a: number[] = [];
  for (let i = 0; i < n; i++) { const [px, py] = f(i / (n - 1)); x.push(px); y.push(py); }
  for (let i = 0; i < n; i++) { const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1); a.push(Math.atan2(y[p] - y[q], x[p] - x[q])); }
  return { x, y, a };
}
/** the outline of a tube along a spine, with rounded head and tail caps */
function tube(s: Spine, w: (t: number) => number, inset = 0): number[] {
  const n = s.x.length, pts: number[] = [];
  const W = (i: number) => Math.max(0.6, w(i / (n - 1)) - inset);
  const side = (i: number, k: number) => { const a = s.a[i] + (k * Math.PI) / 2, r = W(i); pts.push(s.x[i] + Math.cos(a) * r, s.y[i] + Math.sin(a) * r); };
  // head cap: from the right side over the front to the left side
  for (let j = 0; j <= 6; j++) { const a = s.a[0] - Math.PI / 2 + (j / 6) * Math.PI, r = W(0); pts.push(s.x[0] + Math.cos(a) * r, s.y[0] + Math.sin(a) * r); }
  for (let i = 1; i < n - 1; i++) side(i, 1);
  // tail cap: left over the back to the right
  for (let j = 0; j <= 6; j++) { const a = s.a[n - 1] + Math.PI / 2 + (j / 6) * Math.PI, r = W(n - 1); pts.push(s.x[n - 1] + Math.cos(a) * r, s.y[n - 1] + Math.sin(a) * r); }
  for (let i = n - 2; i > 0; i--) side(i, -1);
  return pts;
}
/** point on the spine at t (0 head .. 1 tail) offset sideways by d (px, + = left) */
function at(s: Spine, t: number, d = 0): [number, number, number] {
  const n = s.x.length, f = Math.max(0, Math.min(n - 1.0001, t * (n - 1))), i = Math.floor(f), u = f - i;
  const x = s.x[i] + (s.x[i + 1] - s.x[i]) * u, y = s.y[i] + (s.y[i + 1] - s.y[i]) * u, a = s.a[i] + angDiff(s.a[i], s.a[i + 1]) * u;
  return [x + Math.cos(a + Math.PI / 2) * d, y + Math.sin(a + Math.PI / 2) * d, a];
}
const angDiff = (a: number, b: number) => { let d = b - a; d -= Math.round(d / TAU) * TAU; return d; };
/** a jointed limb: returns its joints so hairs / stinging cells can sit on it */
function limb(rig: Rig, x: number, y: number, ang: number, n: number, len: number, r0: number, r1: number, bend: (i: number) => number, m: Mat, o: { g?: number } = {}): [number, number, number][] {
  const pts: [number, number, number][] = [[x, y, ang]];
  let a = ang, cx = x, cy = y;
  for (let i = 0; i < n; i++) {
    a += bend(i);
    const nx = cx + Math.cos(a) * (len / n), ny = cy + Math.sin(a) * (len / n);
    rig.c(cx, cy, nx, ny, r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n), m, o);
    cx = nx; cy = ny; pts.push([cx, cy, a]);
  }
  return pts;
}

// --- materials of a titan (from the species' colours) ---------------------------------------------------------------------
interface Kit {
  c: Ctx; claw: Mat; skin: Mat; skinDark: Mat; flesh: Mat; fleshLight: Mat; gut: Mat; gutDark: Mat; pale: Mat; eye: Mat; red: Mat;
  oil: Mat; egg: Mat; seam: Mat; plate: Mat; hair: Mat; algae: Mat; r: () => number;
}
function kit(sp: CellSpecies, R: number, ph: number): Kit {
  const c = makeCtx(sp, R, ph, { elongation: 0 });
  const col = cellColours(c.look, sp.mode), memR = R_(col.mem);
  const acc = col.acc;
  return {
    c,
    skin: { ...c.mem, tex: 'skin', spec: 0.3 },
    skinDark: { ramp: darkenRamp(memR, 0.8), tex: 'skin', spec: 0.2 },
    flesh: { ...c.cyto, alpha: Math.max(0.72, c.cyto.alpha ?? 0.9) },
    fleshLight: { ramp: R_({ h: col.cyto.h, s: col.cyto.s * 0.8, l: Math.min(0.82, col.cyto.l + 0.14) }, 0.6), tex: 'gel', alpha: 0.85 },
    gut: { ramp: R_({ h: hueTo(acc.h, 0.08, 0.35), s: Math.min(0.7, acc.s), l: 0.42 }, 0.8), tex: 'gel', spec: 0.25, alpha: 0.92 },
    gutDark: { ramp: R_({ h: hueTo(acc.h, 0.05, 0.5), s: 0.45, l: 0.26 }, 0.7), tex: 'smooth', alpha: 0.85, line: null },
    pale: c.pale,
    eye: c.eye,
    red: { ramp: ramp(0.01, 0.85, 0.42), tex: 'smooth', spec: 0.7 },
    claw: { ramp: ramp(0.1, 0.25, 0.3), tex: 'bone', spec: 0.5 },
    oil: { ramp: ramp(0.1, 0.85, 0.6), tex: 'glass', spec: 0.9, alpha: 0.9 },
    egg: { ramp: R_({ h: hueTo(col.cyto.h, 0.12, 0.4), s: 0.35, l: 0.66 }, 0.6), tex: 'gel', spec: 0.4, alpha: 0.9 },
    seam: { ramp: Array(6).fill(darkenRamp(memR, 0.5)[1]), tex: 'smooth', line: null, alpha: 0.6 },
    plate: { ramp: darkenRamp(R_({ h: col.mem.h, s: col.mem.s * 0.8, l: col.mem.l + 0.04 }), 0.95), tex: 'plates', spec: 0.4, texScale: 0.45 },
    hair: { ramp: darkenRamp(memR, 0.7), tex: 'smooth', line: null },
    algae: { ramp: sp.mode === 'earth' ? ramp(0.3, 0.55, 0.4) : R_({ h: acc.h, s: 0.8, l: 0.45 }), tex: 'smooth', line: null },
    r: mulberry(seedToInt(sp.seed + ':titan-art')),
  };
}

// --- Rotífero ---------------------------------------------------------------------------------------------------------
function rotifer(rig: Rig, k: Kit, S: number, ph: number) {
  const { c } = k, r = k.r;
  const sway = Math.sin(ph) * 0.1, breathe = 1 + Math.sin(ph) * 0.025;
  // the telescoping foot with its two toes
  const foot = spine(8, t => [-0.5 * S - t * 1.05 * S, Math.sin(t * Math.PI * 0.8) * sway * S * 1.6]);
  for (let i = 0; i < 3; i++) {
    const [x0, y0] = at(foot, i / 3), [x1, y1] = at(foot, (i + 1) / 3);
    rig.c(x0, y0, x1, y1, S * (0.2 - i * 0.045), S * (0.17 - i * 0.045), k.skin, { g: 3 });
    rig.c(x1, y1, x1, y1, S * (0.16 - i * 0.045), S * (0.16 - i * 0.045), k.seam);
  }
  const [fx, fy, fa] = at(foot, 1);
  for (const s of [-1, 1]) {
    const a = fa + Math.PI + s * (0.35 + Math.sin(ph * 2) * 0.06);
    rig.c(fx, fy, fx + Math.cos(a) * S * 0.2, fy + Math.sin(a) * S * 0.2, S * 0.05, S * 0.025, k.skinDark);
  }
  // the trunk: a translucent bag, widest behind the middle
  const trunk = spine(18, t => [0.42 * S - t * 1.02 * S, Math.sin(t * Math.PI) * sway * S * 0.35]);
  const tw = (t: number) => S * (0.16 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)) ** 0.8) * breathe;
  rig.p(tube(trunk, tw), k.skin, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.25;
  rig.p(tube(trunk, tw, 2), k.flesh, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.45;
  // folds of the cuticle near the foot
  for (let i = 0; i < 4; i++) { const t = 0.72 + i * 0.07, w = tw(t) * 0.92, [x0, y0] = at(trunk, t, -w), [x1, y1] = at(trunk, t, w); rig.c(x0, y0, x1, y1, 0.5, 0.5, k.seam, { noLine: true }); }
  // the germovitellarium with a ripe egg
  const [ex, ey] = at(trunk, 0.66, S * 0.2);
  rig.e(ex, ey, S * 0.2, S * 0.13, -0.3, k.egg);
  rig.e(ex + S * 0.03, ey - S * 0.02, S * 0.06, S * 0.05, 0, c.nuc);
  // the gut with food granules
  // stomach lobes and the intestine behind them
  for (const [t, d, rx, ry] of [[0.2, 0.02, 0.17, 0.15], [0.36, -0.04, 0.15, 0.16], [0.52, 0.01, 0.12, 0.11]]) {
    const [x, y, a] = at(trunk, t, d * S);
    rig.e(x, y, rx * S, ry * S, a, k.gut, { g: 21 });
  }
  const [g0x, g0y] = at(trunk, 0.55), [g1x, g1y] = at(trunk, 0.78, -S * 0.03);
  rig.c(g0x, g0y, g1x, g1y, S * 0.06, S * 0.04, k.gutDark);
  for (let i = 0; i < 7; i++) {
    const t = 0.18 + r() * 0.45, [x, y] = at(trunk, t, (r() - 0.5) * S * 0.18);
    rig.e(x, y, 1 + r() * 1.2, 1 + r() * 1, r() * 3, c.org[i % 2]);
  }
  // neck and head
  rig.c(0.3 * S, 0, 0.66 * S, 0, S * 0.24, S * 0.26, k.skin, { g: 1 });
  rig.c(0.3 * S, 0, 0.62 * S, 0, S * 0.24 - 2, S * 0.26 - 2, k.flesh, { g: 1 });
  // the mastax: a muscular bulb with pale grinding jaws (trophi)
  const grind = 0.25 + Math.sin(ph * 2) * 0.22;
  rig.e(0.5 * S, 0, S * 0.13, S * 0.12, 0, k.gut);
  for (const s of [-1, 1]) {
    const a = Math.PI + s * grind;
    rig.c(0.56 * S, s * S * 0.02, 0.56 * S + Math.cos(a) * S * 0.12, s * S * 0.02 + Math.sin(a) * S * 0.12, S * 0.035, S * 0.02, k.pale);
  }
  // the corona: two wheels of cilia that beat like turning wheels (counter-rotating), the mouth between them
  const wr = S * 0.22;
  for (const s of [-1, 1]) {
    const cx = 0.84 * S, cy = s * 0.27 * S, n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, wave = Math.sin(a * 4 - s * ph);
      if (Math.cos(a) < -0.55 && Math.abs(Math.sin(a)) < 0.6) continue;      // not over the neck
      const x = cx + Math.cos(a) * wr, y = cy + Math.sin(a) * wr, bend = a + wave * 0.5 * s, len = S * (0.08 + 0.06 * (wave + 1) / 2);
      rig.c(x, y, x + Math.cos(bend) * len, y + Math.sin(bend) * len, 0.7, 0.45, k.hair);
    }
    rig.e(cx, cy, wr, wr, 0, k.skin, { g: 2 });
    rig.e(cx, cy, wr - 2, wr - 2, 0, k.fleshLight, { g: 2 });
    // the ring of the wheel turns: a few darker dashes run round it
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + s * ph / 3; rig.e(cx + Math.cos(a) * wr * 0.7, cy + Math.sin(a) * wr * 0.7, 1.2, 0.8, a, k.seam); }
  }
  rig.e(0.9 * S, 0, S * 0.08, S * 0.12, 0, { ramp: ramp(0.97, 0.4, 0.13), tex: 'smooth', line: null });
  // eyespots
  for (const s of [-1, 1]) rig.e(0.64 * S, s * S * 0.1, 1.3, 1.1, 0, k.red);
  glowDots(rig, { ...c, R: S * 0.5 });
}

// --- Tardígrado -------------------------------------------------------------------------------------------------------
function tardigrade(rig: Rig, k: Kit, S: number, ph: number) {
  const { c } = k, r = k.r, armoured = c.look.membrane > 0.45;
  const body = spine(20, t => [1.0 * S - t * 2.0 * S, Math.sin(ph + t * TAU * 0.5) * S * 0.03]);
  const w = (t: number) => S * 0.47 * (0.42 + 0.58 * Math.sin(Math.PI * (0.02 + 0.96 * t)) ** 0.5) * (1 + 0.05 * Math.cos(t * 5 * TAU));
  // eight stubby legs with claws, walking (pairs alternate; the last pair points back)
  const legs: [number, number][] = [[0.3, 0], [0.48, 1], [0.66, 2], [0.86, 3]];
  for (const [t, p] of legs) for (const s of [-1, 1]) {
    const [bx, by, a] = at(body, t, s * w(t) * 0.8);
    const swing = Math.sin(ph + p * Math.PI / 2 + (s > 0 ? Math.PI : 0)) * 0.4;
    const la = p === 3 ? a + Math.PI - s * 0.55 : a + s * (Math.PI / 2 + 0.25) + swing * s * -1;
    const L = S * 0.3, lx = bx + Math.cos(la) * L, ly = by + Math.sin(la) * L;
    // the plump leg, then its hooked claws poking out of the foot
    rig.c(bx, by, lx, ly, S * 0.12, S * 0.13, k.skin, { g: 4 + p });
    for (let j = 0; j < 4; j++) {
      const ca = la + (j - 1.5) * 0.36, fx = lx + Math.cos(ca) * S * 0.08, fy = ly + Math.sin(ca) * S * 0.08;
      const hx = lx + Math.cos(ca) * S * 0.19, hy = ly + Math.sin(ca) * S * 0.19, ha = ca + s * 1.3;
      rig.c(fx, fy, hx, hy, 1, 0.7, k.claw);
      rig.c(hx, hy, hx + Math.cos(ha) * S * 0.05, hy + Math.sin(ha) * S * 0.05, 0.7, 0.45, k.claw);
    }
  }
  // lateral cirri / spines (armoured species)
  if (c.look.spikes > 0.02 || armoured) {
    for (const s of [-1, 1]) {
      const [hx, hy, a] = at(body, 0.12, s * w(0.12) * 0.9);
      limb(rig, hx, hy, a + s * 2.2, 6, S * (0.5 + c.look.spikes * 0.4), 0.9, 0.4, i => s * (0.08 + Math.sin(ph + i) * 0.04), k.hair);
      for (let i = 1; i < 5; i++) {
        const t = 0.2 + i * 0.15, [x, y, b] = at(body, t, s * w(t) * 0.92), l = S * (0.1 + c.look.spikes * 0.2);
        rig.p([x - Math.cos(b) * 1.4, y - Math.sin(b) * 1.4, x + Math.cos(b + s * 2) * l, y + Math.sin(b + s * 2) * l, x + Math.cos(b) * 1.4, y + Math.sin(b) * 1.4], k.pale);
      }
    }
  }
  rig.p(tube(body, w), k.skin, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.2;
  rig.p(tube(body, w, 2.2), k.flesh, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.35;
  // inside: storage cells drifting in the body cavity, the gut, the pharynx bulb with its stylets
  const [gx0, gy0] = at(body, 0.4), [gx1, gy1] = at(body, 0.82);
  rig.c(gx0, gy0, gx1, gy1, S * 0.2, S * 0.14, k.gut);
  for (let i = 0; i < 22; i++) {
    const t = 0.18 + r() * 0.72, side = (r() * 2 - 1) * w(t) * 0.7, [x, y] = at(body, t, side);
    const d = Math.sin(ph + i) * 0.8;
    rig.e(x + d, y, 1.2 + r() * 1.4, 1.1 + r() * 1.2, r() * 3, i % 3 ? k.fleshLight : c.org[i % 2]);
  }
  const [px, py, pa] = at(body, 0.13);
  rig.e(px, py, S * 0.12, S * 0.11, pa, k.gutDark);
  for (let i = 0; i < 3; i++) rig.e(px + Math.cos(pa + i * 2.1) * S * 0.05, py + Math.sin(pa + i * 2.1) * S * 0.05, 1, 1, 0, k.pale);
  const [mx, my] = at(body, 0);
  for (const s of [-1, 1]) rig.c(px, py + s * 1.2, mx - Math.cos(pa) * 1.5, my - Math.sin(pa) * 1.5 + s * 0.6, 0.5, 0.45, k.pale, { noLine: true });
  // dorsal plates of the armoured ones (Echiniscus-like), or soft segment seams
  for (let i = 0; i < 5; i++) {
    const t = 0.12 + i * 0.19, [x, y, a] = at(body, t);
    if (armoured) rig.e(x, y, S * 0.13, w(t) * 0.9, a, k.plate);
    else { const [x0, y0] = at(body, t + 0.09, -w(t + 0.09) * 0.9), [x1, y1] = at(body, t + 0.09, w(t + 0.09) * 0.9); rig.c(x0, y0, x1, y1, 0.5, 0.5, k.seam, { noLine: true }); void x; void y; void a; }
  }
  // mouth ring and the two eyes
  rig.e(mx - Math.cos(pa) * 1.5, my - Math.sin(pa) * 1.5, S * 0.06, S * 0.08, pa, k.skinDark);
  for (const s of [-1, 1]) { const [x, y] = at(body, 0.1, s * S * 0.14); rig.e(x, y, 1.4, 1.3, 0, { ramp: ramp(0.7, 0.2, 0.12), tex: 'smooth', spec: 0.8 }); }
  glowDots(rig, { ...c, R: S * 0.45 });
}

// --- Hidra --------------------------------------------------------------------------------------------------------------
function hydra(rig: Rig, k: Kit, S: number, ph: number) {
  const { c } = k, r = k.r;
  const nT = 6 + Math.floor(r() * 4), tL = S * (1.25 + r() * 0.45);
  const col = spine(16, t => [0.55 * S - t * 1.6 * S, Math.sin(ph + t * Math.PI) * S * 0.09]);
  const cw = (t: number) => S * (0.32 - 0.1 * t) * (1 + 0.06 * Math.sin(ph + t * 3));
  // the basal disc (sticky foot)
  const [bx, by, ba] = at(col, 1);
  rig.e(bx, by, S * 0.13, S * 0.27, ba, k.skinDark);
  // a bud growing on the side: a small hydra with its own little tentacles
  const [ux, uy, ua] = at(col, 0.42, cw(0.42) * 0.75), bA = ua + Math.PI / 2 - 0.75, bL = S * 0.42;
  const tx = ux + Math.cos(bA) * bL, ty = uy + Math.sin(bA) * bL;
  for (let i = 0; i < 5; i++) limb(rig, tx, ty, bA + (i - 2) * 0.5, 7, S * 0.45, 1.1, 0.5, j => Math.sin(ph + i * 1.7 + j * 0.8) * 0.2, k.skin, { g: 6 });
  rig.c(ux, uy, tx, ty, S * 0.13, S * 0.1, k.skin, { g: 5 });
  rig.c(ux, uy, tx, ty, S * 0.13 - 1.6, S * 0.1 - 1.6, k.flesh, { g: 5 });
  // the column: ectoderm, endoderm and the gastric cavity with symbiotic algae
  rig.p(tube(col, cw), k.skin, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.25;
  rig.p(tube(col, cw, 2.2), k.flesh, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.4;
  rig.p(tube(spine(10, t => { const [x, y] = at(col, 0.08 + t * 0.8); return [x, y]; }), t => cw(0.08 + t * 0.8) * 0.36), k.gutDark);
  for (let i = 0; i < 16; i++) { const t = 0.1 + r() * 0.8, [x, y] = at(col, t, (r() * 2 - 1) * cw(t) * 0.6); rig.e(x, y, 0.9, 0.9, 0, k.algae); }
  // hypostome (the mouth dome) with the star-shaped mouth
  rig.e(0.62 * S, 0, S * 0.19, S * 0.23, 0, k.skin, { g: 1 });
  rig.e(0.62 * S, 0, S * 0.19 - 2, S * 0.23 - 2, 0, k.fleshLight, { g: 1 });
  const open = 0.6 + 0.4 * Math.sin(ph);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; rig.c(0.66 * S, 0, 0.66 * S + Math.cos(a) * S * 0.09 * open, Math.sin(a) * S * 0.09 * open, 0.7, 0.4, k.gutDark, { noLine: true }); }
  // the crown of tentacles, writhing, dotted with batteries of stinging cells
  const nem: Mat = { ...k.pale, emit: c.glow !== null };
  for (let i = 0; i < nT; i++) {
    const a0 = -2.35 + (i / (nT - 1)) * 4.7, hx = 0.62 * S + Math.cos(a0) * S * 0.17, hy = Math.sin(a0) * S * 0.2;
    const curl = (i % 2 ? 1 : -1) * 0.05;
    const pts = limb(rig, hx, hy, a0 * 0.8, 14, tL * (0.85 + ((i * 7) % 5) * 0.06), S * 0.09, S * 0.035,
      j => Math.sin(ph + i * 1.3 + j * 0.45) * 0.13 + (j > 9 ? curl * (j - 9) : 0), k.skin, { g: 10 + i });
    for (let j = 3; j < pts.length - 1; j += 3) { const [x, y] = pts[j]; rig.e(x, y, 1.3 - j * 0.04, 1.1 - j * 0.04, 0, nem); }
  }
  glowDots(rig, { ...c, R: S * 0.3 });
}

// --- Nematoide ----------------------------------------------------------------------------------------------------------
function nematode(rig: Rig, k: Kit, S: number, ph: number) {
  const { c } = k, L = 3.3 * S;
  // a travelling wave runs from head to tail (the worm swims forward by pushing it back)
  const body = spine(44, t => [1.55 * S - t * L * 0.93, S * (0.05 + 0.3 * t ** 1.1) * Math.sin(t * TAU * 1.25 - ph)]);
  const w = (t: number) => {
    const head = Math.min(1, Math.sqrt(t / 0.05)), tail = t > 0.78 ? 1 - ((t - 0.78) / 0.22) * 0.9 : 1;
    return S * 0.17 * Math.max(0.12, head * tail);
  };
  rig.p(tube(body, w), k.skin, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.2;
  rig.p(tube(body, w, 1.8), k.flesh, { g: 1 });
  rig.parts[rig.parts.length - 1].flat = 0.35;
  // pharynx with its terminal bulb, then the granular intestine down to the anus
  const seg = (t0: number, t1: number, r0: number, r1: number, m: Mat, n = 6) => {
    for (let i = 0; i < n; i++) { const [x0, y0] = at(body, t0 + (t1 - t0) * (i / n)), [x1, y1] = at(body, t0 + (t1 - t0) * ((i + 1) / n)); rig.c(x0, y0, x1, y1, r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n), m, { g: 20 }); }
  };
  seg(0.01, 0.14, S * 0.035, S * 0.05, k.fleshLight, 5);
  const [bx, by, ba] = at(body, 0.155);
  rig.e(bx, by, S * 0.09, S * 0.075, ba, k.gut);
  rig.e(bx, by, 1.2, 1.2, 0, k.gutDark);
  seg(0.18, 0.84, S * 0.075, S * 0.05, k.gut, 14);
  for (let i = 0; i < 16; i++) { const t = 0.2 + (i / 16) * 0.6, [x, y] = at(body, t, Math.sin(i * 2.3) * S * 0.035); rig.e(x, y, 0.9, 0.8, 0, i % 3 ? k.gutDark : c.org[0]); }
  // the gonad with eggs lined up around the vulva
  for (let i = 0; i < 4; i++) {
    const t = 0.42 + i * 0.05, [x, y, a] = at(body, t, S * 0.02);
    rig.e(x, y, S * 0.075, S * 0.055, a, k.egg);
    rig.e(x, y, 1, 1, 0, c.nuc);
  }
  // cuticle rings
  for (let i = 3; i < 42; i += 2) {
    const t = i / 43, [x0, y0] = at(body, t, -w(t) * 0.92), [x1, y1] = at(body, t, w(t) * 0.92);
    rig.c(x0, y0, x1, y1, 0.45, 0.45, k.seam, { noLine: true });
  }
  // lips and amphids at the head
  const [hx, hy, ha] = at(body, 0);
  for (let i = 0; i < 3; i++) { const a = ha + (i - 1) * 0.9; rig.e(hx + Math.cos(a) * S * 0.12, hy + Math.sin(a) * S * 0.12, S * 0.05, S * 0.04, a, k.skin); }
  for (const s of [-1, 1]) { const [x, y] = at(body, 0.04, s * w(0.04) * 0.55); rig.e(x, y, 1.1, 0.9, 0, k.eye); }
  glowDots(rig, { ...c, R: S * 0.5 });
}

// --- Copépode -----------------------------------------------------------------------------------------------------------
function copepod(rig: Rig, k: Kit, S: number, ph: number) {
  const { c } = k, r = k.r, eggs = r() < 0.7;
  const beat = Math.sin(ph), kick = Math.sin(ph * 2);
  const chitin: Mat = { ...k.skin, tex: 'chitin', spec: 0.5, texScale: 0.5 };
  // the urosome (tail) with the caudal rami and their long setae
  const tail = spine(6, t => [-0.66 * S - t * 0.75 * S, Math.sin(t * 2 + ph) * S * 0.05]);
  const [ex, ey, ea] = at(tail, 1);
  for (const s of [-1, 1]) {
    const ra = ea + Math.PI + s * 0.22, rx = ex + Math.cos(ra) * S * 0.14, ry = ey + Math.sin(ra) * S * 0.14;
    [0.55, 0.85, 0.45].forEach((l, j) => {
      const a = ra + s * (j - 0.6) * 0.18 + kick * 0.05;
      limb(rig, rx, ry, a, 5, S * l, 0.7, 0.35, i => s * 0.02 * i, k.pale);
    });
    rig.c(ex, ey, rx, ry, S * 0.05, S * 0.04, chitin, { g: 8 });
  }
  // egg sacs clinging to the tail
  if (eggs) for (const s of [-1, 1]) {
    const [sx, sy] = at(tail, 0.45, s * S * 0.27);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, d = i === 8 ? 0 : S * 0.1; rig.e(sx + Math.cos(a) * d * 1.5 - S * 0.04, sy + Math.sin(a) * d, S * 0.065, S * 0.06, 0, k.egg); }
  }
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = at(tail, i / 4), [x1, y1] = at(tail, (i + 1) / 4);
    rig.c(x0, y0, x1, y1, S * (i ? 0.085 - i * 0.008 : 0.12), S * (0.08 - i * 0.008), chitin, { g: 7 });
  }
  // swimming legs under the body: feathery paddles kicking one after the other
  for (let p = 0; p < 4; p++) for (const s of [-1, 1]) {
    const x = (0.18 - p * 0.24) * S, y = s * S * (0.36 - p * 0.05), a = s * (Math.PI / 2 + 0.5) + s * Math.sin(ph * 2 - p * 0.9) * 0.45;
    const pts = limb(rig, x, y, a, 3, S * 0.3, 1.4, 0.9, () => s * 0.15, k.skinDark);
    const [lx, ly, la] = pts[3];
    for (const h of [-0.5, 0.5]) rig.c(lx, ly, lx + Math.cos(la + h) * S * 0.12, ly + Math.sin(la + h) * S * 0.12, 0.5, 0.4, k.hair);
  }
  // the antennules: long, jointed, beating back with every stroke; hairs on their front edge
  for (const s of [-1, 1]) {
    const pts = limb(rig, 0.88 * S, s * 0.28 * S, s * (Math.PI / 2 - 0.05) + s * (beat * 0.3 + 0.1), 11, S * 1.25, S * 0.055, S * 0.02, i => s * (0.06 + (i > 6 ? 0.07 : 0)), chitin, { g: 30 + s });
    for (let i = 1; i < pts.length; i++) { const [x, y, a] = pts[i], ha = a - s * 1.1; rig.c(x, y, x + Math.cos(ha) * S * 0.08, y + Math.sin(ha) * S * 0.08, 0.45, 0.4, k.hair); }
    limb(rig, 0.96 * S, s * 0.12 * S, s * 0.55 + s * beat * 0.15, 4, S * 0.34, S * 0.04, S * 0.02, () => s * 0.1, chitin);
  }
  // the prosome: cephalothorax plus thoracic segments, front ones over the back ones
  const segs: [number, number, number][] = [[-0.6, 0.12, 0.21], [-0.44, 0.15, 0.28], [-0.22, 0.18, 0.35], [0.03, 0.22, 0.41], [0.52, 0.52, 0.45]];
  segs.forEach(([x, rx, ry], i) => { rig.e(x * S, 0, rx * S, ry * S, 0, chitin, { g: 9 }); if (i < 4) rig.e(x * S + rx * S * 0.6, 0, 1.2, ry * S * 0.95, 0, k.seam, { noLine: true }); });
  rig.e(0.5 * S, 0, 0.5 * S - 2, 0.43 * S - 2, 0, k.flesh, { g: 9 });
  // gut, oil droplets (the copepod's amber fuel), mouthparts and the single red naupliar eye
  rig.c(0.62 * S, 0, -0.95 * S, 0, S * 0.07, S * 0.04, k.gutDark);
  for (let i = 0; i < 3; i++) rig.e((0.25 - i * 0.28) * S, (i % 2 ? 1 : -1) * S * 0.12, S * (0.1 - i * 0.02), S * (0.09 - i * 0.02), 0, k.oil);
  rig.e(0.8 * S, 0, S * 0.1, S * 0.14, 0, k.skinDark);
  rig.e(0.97 * S, 0, S * 0.075, S * 0.085, 0, k.red);
  rig.e(0.99 * S, -S * 0.02, 1, 1, 0, { ramp: ramp(0.12, 0.2, 0.92), tex: 'smooth', emit: true, line: null });
  glowDots(rig, { ...c, R: S * 0.4 });
}

// --- entry points ---------------------------------------------------------------------------------------------------------
const SCALE: Record<TitanType, number> = { 0: 40, 1: 40, 2: 30, 3: 38, 4: 32 };
const BUILD = [rotifer, tardigrade, hydra, nematode, copepod];
export function buildTitan(rig: Rig, sp: CellSpecies, type: TitanType, ph: number) {
  const S = SCALE[type] * (0.9 + sp.look.size * 0.2);
  BUILD[type](rig, kit(sp, S * 0.5, ph), S, ph);
}
export function drawTitan(sp: CellSpecies, type: TitanType, n = FRAMES): CellSprite {
  return render((rig, ph) => buildTitan(rig, sp, type, ph), n);
}
/** the wild titans' colours: natural microscope tones, one look per body plan */
export function wildTitanSpecies(type: TitanType): CellSpecies {
  const sp = neutralSpecies(40 + type);
  const hues = [0.1, 0.06, 0.3, 0.13, 0.52];
  return { ...sp, seed: 'wild-titan' + type, look: { ...sp.look, hue: hues[type], hue2: hues[type] + 0.02, sat: 0.55, light: 0.45, accentHue: 0.08, translucency: 0.45, membrane: type === 1 ? 0.7 : 0.4, size: 0.7, spikes: type === 1 ? 0.4 : 0, glow: 0, pattern: 'none' } };
}
