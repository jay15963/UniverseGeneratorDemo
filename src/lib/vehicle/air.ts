// Air vehicles (from the industrial era on): balloons and dirigibles to airliners, air taxis and shuttles;
// biplanes to drone fighters and saucer interceptors; bombers, gunship helicopters and tiltrotors; war zeppelins
// to flying carriers and sky fortresses; tiltrotors and jets that unfold into walkers (transform).
// 'idle' = parked on the ground (props still), 'move' = flying with its shadow below, 'use' = flying and firing.
import type { Mat } from '../creature/raster';
import type { V3 } from '../structure/draft';
import { box, cyl, facet, lamp, roofOn, Pt } from '../structure/parts';
import { VCtx, turret, shot, exhaust, moving, shotAge, frac, propeller, rotor, pod, canopy, wing, legs, wheel } from './vparts';

const tier = (x: VCtx) => (x.size === 'large' ? 2 : x.size === 'medium' ? 1 : 0);
const flying = (x: VCtx) => x.anim !== 'idle';
/** cruising height (the shadow stays on the ground) */
const alt = (x: VCtx, A: number) => (flying(x) ? A + Math.sin(x.ph) * 0.6 : 0);

/** the aircraft's shadow on the ground: a flat outline in (a, f) */
function shadow(x: VCtx, pts: Pt[], y: number) {
  if (y < 0.5) return;
  const k = Math.max(0.6, 1 - y / 80);
  x.D.poly(pts.map(([a, f]) => [a * k, 0.05, f * k] as V3), { ramp: x.P.dark.ramp, tex: 'smooth', alpha: 0.28, line: null }, -1e5, { g: x.D.group(), flat: 1, noLine: true });
}
const planShadow = (x: VCtx, L: number, span: number, y: number, wf = 0) => {
  const r = Math.max(1.2, L * 0.06), c = Math.max(3, L * 0.16), tc = L * 0.08, ts = span * 0.3;
  shadow(x, [[0, L / 2], [r, L * 0.4], [r, wf + c / 2], [span / 2, wf - c * 0.1], [span / 2, wf - c / 2], [r, wf - c / 2], [r * 0.6, -L * 0.4], [ts / 2, -L * 0.42], [ts / 2, -L * 0.42 - tc], [-ts / 2, -L * 0.42 - tc], [-ts / 2, -L * 0.42], [-r * 0.6, -L * 0.4], [-r, wf - c / 2], [-span / 2, wf - c / 2], [-span / 2, wf - c * 0.1], [-r, wf + c / 2], [-r, L * 0.4]], y);
};
const discShadow = (x: VCtx, R: number, Rf: number, y: number) => shadow(x, Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return [Math.cos(t) * R, Math.sin(t) * Rf] as Pt; }), y);

/** a fuselage of radius R along f with its belly at y */
const fuselage = (x: VCtx, L: number, R: number, y: number, m: Mat, nose = 0.8, bias = 0) => pod(x, R * 2, L, R * 2, y, m, bias, nose);
/** a pair of wings from the fuselage side (r) out to span/2; sweep moves the tips back, dih lifts them */
function wings(x: VCtx, r: number, y: number, f: number, span: number, chord: number, sweep: number, m: Mat, dih = 0, tip = 0.5) {
  for (const s of [-1, 1]) wing(x, [[s * r, y, f + chord / 2], [s * span / 2, y + dih, f + chord / 2 - sweep - chord * (1 - tip) * 0.3], [s * span / 2, y + dih, f - chord / 2 - sweep + chord * (1 - tip) * 0.7], [s * r, y, f - chord / 2]], m);
}
/** tailplane + fin at the back */
function tail(x: VCtx, L: number, y: number, h: number, span: number, m: Mat, twin = false) {
  wings(x, 0.3, y, -L * 0.44, span, L * 0.12, L * 0.03, m, 0, 0.6);
  for (const a of twin ? [-span * 0.25, span * 0.25] : [0]) facet(x, [[a, y, -L * 0.34], [a, y + h, -L * 0.45], [a, y + h, -L * 0.5], [a, y, -L * 0.5]], m, x.D.depth([a, y + h / 2, -L * 0.45]) + 0.05, x.D.group(), null, true);
}
/** landing gear, shown only on the ground */
function gearDown(x: VCtx, L: number, span: number, y: number, r = 1) {
  if (flying(x)) return;
  for (const s of [-1, 1]) { x.D.cap([s * span, y + 0.5, L * 0.05], [s * span, r, L * 0.05], 0.3, 0.3, x.P.dark, x.D.depth([s * span, y, 0])); wheel(x, s * span, L * 0.05, r, 0.8, s, 0, 'tyre'); }
  x.D.cap([0, y + 0.5, L * 0.38], [0, r, L * 0.38], 0.3, 0.3, x.P.dark, x.D.depth([0, y, L * 0.38])); wheel(x, 0, L * 0.38, r * 0.8, 0.6, 1, 0, 'tyre');
}
/** bombs tumbling out of the bay while firing */
function bombs(x: VCtx, y: number, f: number, n = 3) {
  const age = shotAge(x);
  if (age < 0) return;
  for (let i = 0; i < n; i++) {
    const g = age - i * 0.1;
    if (g < 0) continue;
    const p: V3 = [(i - (n - 1) / 2) * 1.2, y - g * g * 90, f - g * 4];
    if (p[1] > 0.5) x.D.cap([p[0], p[1] + 0.9, p[2]], [p[0], p[1] - 0.9, p[2] + 0.3], 0.55, 0.45, x.P.dark, 1e5 + i);
    else x.D.ell([p[0], 1.5, p[2]], 3.5, 2.8, x.P.fire, 1e5 + i, { g: x.D.group(), noLine: true });
  }
}
/** a lifting envelope (balloon or rigid airship) */
function envelope(x: VCtx, L: number, R: number, y: number, m: Mat) {
  pod(x, R * 2, L, R * 2, y, m, 0, 0.9);
  for (const s of [-1, 1]) facet(x, [[0, y + R, -L * 0.32], [s * R * 1.3, y + R, -L * 0.48], [s * R * 1.3, y + R, -L * 0.52], [0, y + R, -L * 0.5]], x.body2, x.D.depth([s * R, y + R, -L * 0.45]) + 0.1, x.D.group(), null, true);
  facet(x, [[0, y + R * 1.6, -L * 0.32], [0, y + R * 2.4, -L * 0.5], [0, y + R * 1.6, -L * 0.5]], x.body2, x.D.depth([0, y + R * 2, -L * 0.45]) + 0.1, x.D.group(), null, true);
}
/** a saucer: flat disc hull, glowing rim, a dome */
function saucer(x: VCtx, R: number, y: number, dome: number) {
  const D = x.D, pts: V3[] = [];
  for (let j = 0; j < 20; j++) { const t = (j / 20) * Math.PI * 2; pts.push([Math.cos(t) * R, y + R * 0.18, Math.sin(t) * R], [Math.cos(t) * R * 0.6, y, Math.sin(t) * R * 0.6], [Math.cos(t) * R * 0.7, y + R * 0.34, Math.sin(t) * R * 0.7]); }
  D.hull(pts, x.body, D.depth([0, y, 0]), { g: D.group(), flat: 0 });
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2 + x.ph * 0.5, p: V3 = [Math.cos(t) * R * 0.92, y + R * 0.18, Math.sin(t) * R * 0.92]; if (D.facing([Math.cos(t), 0, Math.sin(t)]) > -0.2) D.ell(p, 0.7, 0.5, x.P.glow, D.depth(p) + 0.05, { g: D.group() }); }
  canopy(x, 0, y + R * 0.3, R * dome, R * dome, R * 0.35, 0.1);
  D.ell([0, y - 0.3, 0], R * 0.3, R * 0.1, x.P.glow, D.depth([0, y, 0]) - 0.05, { g: D.group(), noLine: true });
}

// ---------------------------------------------------------------------------------------------------
// Civil
// ---------------------------------------------------------------------------------------------------
function airliner(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 3) {
    if (b === 0) { // hot-air balloon: basket, ropes, a burner that roars in flight
      const y = alt(x, 20) + 0.2, R = 8;
      box(x, -2, -2, 2, 2, y, y + 2.6, P.wood2, P.wood);
      for (const [a, f] of [[-1.8, -1.8], [1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]] as Pt[]) D.cap([a, y + 2.6, f], [a * 2.4, y + 7, f * 2.4], 0.15, 0.15, P.rope, D.depth([a, y + 5, f]));
      cyl(x, 0, 0, 0.8, y + 5.5, y + 7, P.metal, P.metal);
      if (flying(x)) { D.ell([0, y + 8, 0], 0.9, 1.6 + Math.sin(x.ph * 4) * 0.4, P.fire2, D.depth([0, y + 8, 0]) + 0.2, { g: D.group(), noLine: true }); }
      const c: V3 = [0, y + 7.5 + R, 0];
      D.ell(c, R, R * 1.12, x.body, D.depth(c), { g: D.group() });
      for (const q of [-0.45, 0, 0.45]) D.ell([c[0] + q * R * 0.9, c[1], c[2]], R * 0.14, R * 1.08, x.body2, D.depth(c) + 0.01, { g: D.group(), noLine: true });
      discShadow(x, R * 0.8, R * 0.8, y);
      return;
    }
    // dirigible: envelope, gondola, pusher propellers
    const L = (b === 1 ? 44 : 60) * Z * 0.8, R = L * 0.12, y = alt(x, 18), g = y + 0.2;
    if (!flying(x)) D.cap([0, 0, L * 0.5], [0, 2 * R + 3, L * 0.5 + 1], 0.5, 0.4, P.metal, D.depth([0, 5, L * 0.5])); // mooring mast
    const gL = L * 0.28;
    box(x, -1.8, -gL / 2, 1.8, gL / 2, g, g + 3, x.body2, P.paint2);
    for (const s of [-1, 1]) if (D.facing([s, 0, 0]) > 0.05) facet(x, [[s * 1.85, g + 1.3, -gL * 0.4], [s * 1.85, g + 1.3, gL * 0.4], [s * 1.85, g + 2.3, gL * 0.4], [s * 1.85, g + 2.3, -gL * 0.4]], P.glass, D.depth([s * 2, g + 2, 0]) + 0.1, D.group(), null, true);
    envelope(x, L, R, g + 4, x.body);
    for (const s of [-1, 1]) propeller(x, [s * (R + 1), g + 4 + R * 0.4, -L * 0.2], 2.2, 'f', flying(x));
    planShadow(x, L, R * 2, y);
    return;
  }
  if (e === 7) { // shuttle saucer
    const R = (7 + b * 3) * Z, y = alt(x, 16) + (flying(x) ? 0 : 2);
    if (!flying(x)) for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; D.cap([Math.cos(t) * R * 0.45, y + 0.5, Math.sin(t) * R * 0.45], [Math.cos(t) * R * 0.6, 0.3, Math.sin(t) * R * 0.6], 0.4, 0.3, P.metal, D.depth([Math.cos(t) * R * 0.5, 1, Math.sin(t) * R * 0.5])); }
    saucer(x, R, y, 0.45);
    discShadow(x, R, R, y);
    return;
  }
  if (e === 6) { // air taxi: a pod on ducted fans
    const L = (10 + b * 7) * Z, R = (2 + b * 0.8) * Z, y = alt(x, 14) + 1.4;
    for (const s of [-1, 1]) for (const f of [L * 0.3, -L * 0.3]) {
      const c: V3 = [s * (R + 2.2 * Z), y + R, f];
      cyl(x, c[0], c[2], 1.9 * Z, c[1] - 0.6, c[1] + 0.6, x.body2, x.body2, { bias: 0.02 });
      propeller(x, [c[0], c[1] + 0.3, c[2]], 1.6 * Z, 'y', flying(x));
      D.cap([s * R, y + R, f], c, 0.4, 0.4, x.body2, D.depth(c) - 0.02);
      if (flying(x)) exhaust(x, [c[0], c[1] - 1.2, c[2]], 'glow', 1 * Z);
    }
    fuselage(x, L, R, y, x.body, 0.7);
    canopy(x, L * 0.15, y + R * 1.4, R * 1.5, L * 0.45, R * 0.8, 0.2);
    if (!flying(x)) for (const s of [-1, 1]) D.cap([s * R * 0.6, y + 0.3, -L * 0.3], [s * R * 0.6, y + 0.3, L * 0.3], 0.3, 0.3, P.metal, D.depth([s, y, 0]) - 0.1);
    shadow(x, [[-R - 3 * Z, L / 2], [R + 3 * Z, L / 2], [R + 3 * Z, -L / 2], [-R - 3 * Z, -L / 2]], y);
    return;
  }
  // propeller liners (e4) and jets (e5)
  const L = [18, 30, 44][b] * Z, R = [1.4, 2.2, 3][b] * Z, span = L * (e === 5 ? 0.95 : 1.1), y = alt(x, 22) + (flying(x) ? 0 : 1.8);
  const wy = y + R * (b === 0 && e === 4 ? 1.9 : 0.6), wf = L * 0.02;
  gearDown(x, L, R * 1.2, y, 1);
  fuselage(x, L, R, y, x.body, 0.75);
  D.cap([-R * 0.98, y + R * 1.2, L * 0.4], [-R * 0.98, y + R * 1.2, -L * 0.35], 0.3, 0.3, P.glass, D.depth([-R, y + R, 0]) + 0.02, { noLine: true });
  D.cap([R * 0.98, y + R * 1.2, L * 0.4], [R * 0.98, y + R * 1.2, -L * 0.35], 0.3, 0.3, P.glass, D.depth([R, y + R, 0]) + 0.02, { noLine: true });
  canopy(x, L * 0.44, y + R * 1.3, R * 1.1, L * 0.08, R * 0.45, 0.2);
  wings(x, R * 0.9, wy, wf, span, L * 0.14, e === 5 ? L * 0.14 : L * 0.01, x.body2, e === 5 ? 1 : 0.3);
  tail(x, L, y + R * 1.2, R * 2.4, span * 0.35, x.body2);
  const eng = b === 0 ? [0] : b === 1 ? [span * 0.24] : [span * 0.2, span * 0.36];
  for (const s of [-1, 1]) for (const a of b === 0 ? [] : eng) {
    const f = wf + L * 0.07 - (e === 5 ? (a / (span / 2)) * L * 0.14 : 0), c: V3 = [s * a, wy - (e === 5 ? 1.2 * Z : 0), f];
    if (e === 5) { cyl(x, c[0], c[2], 1.1 * Z, c[1] - 1.1 * Z, c[1] + 1.1 * Z, P.metal, P.metal, { flat: 0.5 }); D.cap([c[0], c[1], c[2] + 2 * Z], [c[0], c[1], c[2] - 2.5 * Z], 1.1 * Z, 0.8 * Z, P.metal, D.depth(c) + 0.05); if (flying(x)) exhaust(x, [c[0], c[1], c[2] - 3.2 * Z], 'jet', 0.8 * Z); }
    else { D.cap([c[0], c[1], c[2] + 1.5 * Z], [c[0], c[1], c[2] - 2 * Z], 0.9 * Z, 0.6 * Z, x.body2, D.depth(c) + 0.05); propeller(x, [c[0], c[1], c[2] + 1.8 * Z], 2.4 * Z, 'f', flying(x)); }
  }
  if (b === 0 && e === 4) propeller(x, [0, y + R, L / 2 + 0.3], 2.4 * Z, 'f', flying(x));
  if (b === 0 && e === 5) for (const s of [-1, 1]) { const c: V3 = [s * R * 1.6, y + R * 1.3, -L * 0.28]; D.cap([c[0], c[1], c[2] + 2], [c[0], c[1], c[2] - 2], 0.9 * Z, 0.7 * Z, P.metal, D.depth(c) + 0.05); if (flying(x)) exhaust(x, [c[0], c[1], c[2] - 2.6], 'jet', 0.6 * Z); }
  for (const s of [-1, 1]) lamp(x, [s * span / 2, wy + 0.3, wf - L * 0.07], s > 0 ? { ...P.glow, ramp: P.glow.ramp } : x.K.fire, true, 0.5);
  planShadow(x, L, span, y, wf);
}

// ---------------------------------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------------------------------
/** fighters: biplane, prop fighter, jet, drone flying-wing, saucer interceptor */
function fighter(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  const L = (14 + b * 3) * Z, R = 1.3 * Z, span = L * (e === 3 ? 1.1 : e === 4 ? 1 : 0.7), y = alt(x, 18) + (flying(x) ? 0 : 1.6);
  if (e === 7) {
    const Rr = (5.5 + b * 1.5) * Z, yy = alt(x, 18) + (flying(x) ? 0 : 1.5);
    saucer(x, Rr, yy, 0.3);
    for (const s of [-1, 1]) { const m: V3 = [s * Rr * 0.4, yy + Rr * 0.1, Rr * 0.95]; D.ell(m, 0.8, 0.8, P.glow, D.depth(m) + 0.1, { g: D.group() }); shot(x, m, [0, 0, 1], 'plasma'); }
    discShadow(x, Rr, Rr, yy);
    return;
  }
  gearDown(x, L, R * 1.4, y, 0.9);
  if (e === 6) { // drone flying wing: no cockpit, a blended body, lasers
    const bw = span * 1.25;
    facet(x, [[0, y + R, L * 0.5], [bw / 2, y + R * 0.8, -L * 0.2], [bw * 0.3, y + R * 0.8, -L * 0.35], [0, y + R, -L * 0.2], [-bw * 0.3, y + R * 0.8, -L * 0.35], [-bw / 2, y + R * 0.8, -L * 0.2]], x.body, D.depth([0, y + R, 0]), D.group(), null, true);
    pod(x, R * 2.4, L * 0.7, R * 1.2, y + R * 0.6, x.body2, 0.05, 0.6);
    D.ell([0, y + R * 1.3, L * 0.2], 1, 0.5, P.glow, D.depth([0, y + R, L * 0.2]) + 0.1, { g: D.group() });
    if (flying(x)) exhaust(x, [0, y + R, -L * 0.3], 'glow', 1 * Z);
    for (const s of [-1, 1]) shot(x, [s * bw * 0.15, y + R, L * 0.35], [0, 0, 1], 'laser');
    shadow(x, [[0, L * 0.5], [bw / 2, -L * 0.2], [bw * 0.3, -L * 0.35], [0, -L * 0.2], [-bw * 0.3, -L * 0.35], [-bw / 2, -L * 0.2]], y);
    return;
  }
  fuselage(x, L, R, y, x.body, e === 5 ? 0.35 : 0.8);
  canopy(x, e === 5 ? L * 0.22 : -L * 0.02, y + R * 1.7, R * 1.1, L * 0.18, R * 0.7, 0.2);
  if (e === 3) { // biplane: two wings with struts, a nose propeller
    wings(x, R * 0.8, y + R * 0.3, L * 0.12, span, L * 0.18, 0, x.body2);
    wings(x, 0, y + R * 2.9, L * 0.14, span, L * 0.18, 0, x.body2);
    for (const s of [-1, 1]) for (const a of [span * 0.18, span * 0.4]) D.cap([s * a, y + R * 0.3, L * 0.14], [s * a, y + R * 2.9, L * 0.14], 0.2, 0.2, P.wood, D.depth([s * a, y + R, L * 0.14]) + 0.02);
    propeller(x, [0, y + R, L / 2 + 0.2], 3 * Z, 'f', flying(x));
    tail(x, L, y + R, R * 2, span * 0.3, x.body2);
    shot(x, [0.6, y + R * 2, L * 0.4], [0, 0, 1], 'mg');
  } else if (e === 4) { // prop fighter: low wing, roundels, nose prop
    wings(x, R * 0.8, y + R * 0.4, L * 0.08, span, L * 0.2, L * 0.02, x.body2, 0.5, 0.45);
    propeller(x, [0, y + R, L / 2 + 0.2], 3 * Z, 'f', flying(x));
    tail(x, L, y + R * 1.1, R * 2.2, span * 0.3, x.body2);
    for (const s of [-1, 1]) { const m: V3 = [s * span * 0.3, y + R * 0.5, L * 0.18]; shot(x, m, [0, 0, 1], 'mg'); D.ell([s * span * 0.34, y + R * 0.45, L * 0.04], 1.2, 0.5, P.paint2, D.depth([s * span * 0.34, y + R, 0]) + 0.02, { g: D.group(), noLine: true }); }
    if (b) for (const s of [-1, 1]) { const c: V3 = [s * span * 0.2, y + R * 0.3, L * 0.16]; D.cap(c, [c[0], c[1], c[2] - 4], 1 * Z, 0.6 * Z, x.body2, D.depth(c) + 0.05); propeller(x, [c[0], c[1], c[2] + 0.4], 2.4 * Z, 'f', flying(x)); }
  } else { // jet: delta or swept wings, intakes, twin fins on the bigger one, missiles off the rails
    wings(x, R * 0.8, y + R * 0.7, -L * 0.08, span, L * 0.38, L * 0.12, x.body2, 0, 0.15);
    wings(x, R * 0.6, y + R * 0.9, L * 0.3, span * 0.4, L * 0.08, L * 0.03, x.body2); // canards
    tail(x, L, y + R * 1.3, R * 2.4, span * 0.4, x.body2, b > 0);
    for (const s of [-1, 1]) { const c: V3 = [s * R * 1.1, y + R * 0.8, L * 0.08]; D.cap(c, [c[0], c[1], c[2] - L * 0.3], 0.8 * Z, 0.7 * Z, x.body2, D.depth(c) + 0.01); }
    if (flying(x)) exhaust(x, [0, y + R, -L * 0.52], 'jet', 1.2 * Z, [0, 0, -1]);
    const age = shotAge(x);
    for (const s of [-1, 1]) {
      const rail: V3 = [s * span * 0.38, y + R * 0.4, -L * 0.1];
      if (age < 0 || s > 0) D.cap([rail[0], rail[1], rail[2] + 2.5], [rail[0], rail[1], rail[2] - 2], 0.35, 0.35, P.metal, D.depth(rail) + 0.03);
      if (s > 0) shot(x, [rail[0], rail[1], rail[2] + 2.5], [0, 0, 1], 'rocket');
    }
    shot(x, [-R * 0.9, y + R * 1.2, L * 0.4], [0, 0, 1], 'mg');
  }
  planShadow(x, L, span, y);
}
/** medium: bomber (e4), attack helicopter (e5), tiltrotor gunship (e6), hover gunship (e7); armed airship (e3) */
function gunship(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 3) { // armed airship: gondola with machine guns and a bomb rack
    const L = (38 + b * 10) * Z, R = L * 0.11, y = alt(x, 20), g = y + 0.2;
    box(x, -1.8, -L * 0.14, 1.8, L * 0.14, g, g + 3, x.body2, x.body2);
    envelope(x, L, R, g + 4, x.body);
    for (const s of [-1, 1]) propeller(x, [s * (R + 1), g + 4 + R * 0.4, -L * 0.22], 2.2, 'f', flying(x));
    turret(x, 0, L * 0.12, g - 1.2, 1.2, 1.2, 'mg', 3.5, x.body2);
    bombs(x, g, -L * 0.05, 2);
    planShadow(x, L, R * 2, y);
    return;
  }
  if (e === 5) { // attack helicopter: stepped cockpit, stub wings with rockets, chin gun
    const L = (16 + b * 4) * Z, R = 1.8 * Z, y = alt(x, 16) + (flying(x) ? 0 : 1.2);
    if (!flying(x)) for (const s of [-1, 1]) D.cap([s * R * 1.1, 0.4, -L * 0.2], [s * R * 1.1, 0.4, L * 0.25], 0.35, 0.35, P.dark, D.depth([s * R, 0.4, 0]) - 0.05);
    fuselage(x, L * 0.6, R, y, x.body, 0.8);
    D.cap([0, y + R * 1.1, -L * 0.25], [0, y + R * 1.4, -L * 0.62], R * 0.55, R * 0.3, x.body, D.depth([0, y + R, -L * 0.4]));
    facet(x, [[0, y + R * 1.4, -L * 0.55], [0, y + R * 3, -L * 0.66], [0, y + R * 1.4, -L * 0.66]], x.body2, D.depth([0, y + R * 2, -L * 0.6]) + 0.05, D.group(), null, true);
    propeller(x, [R * 0.4, y + R * 2.2, -L * 0.63], 2 * Z, 'y', flying(x) || x.anim === 'use');
    canopy(x, L * 0.12, y + R * 1.6, R * 1.2, L * 0.24, R * 0.7, 0.2);
    wings(x, R * 0.9, y + R * 0.8, 0, R * 6, L * 0.08, 0, x.body2);
    for (const s of [-1, 1]) { const c: V3 = [s * R * 2.6, y + R * 0.4, 0]; D.cap([c[0], c[1], c[2] + 1.6], [c[0], c[1], c[2] - 1.6], 0.8, 0.8, P.dark, D.depth(c) + 0.05); if (s > 0) shot(x, [c[0], c[1], c[2] + 1.8], [0, 0, 1], 'rocket'); }
    const chin: V3 = [0, y + 0.2, L * 0.28];
    D.cap(chin, [0, y - 0.2, L * 0.28 + 3], 0.35, 0.3, P.dark, D.depth(chin) + 0.1);
    shot(x, [0, y - 0.2, L * 0.28 + 3], [0, 0, 1], 'mg');
    rotor(x, [0, y + R * 2.6 + 1, 0], L * 0.5, 4, flying(x));
    shadow(x, Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return [Math.cos(t) * L * 0.4, Math.sin(t) * L * 0.4] as Pt; }), y);
    return;
  }
  if (e === 6) { // tiltrotor gunship: rotors up to hover, forward in flight; a side gun
    const L = (18 + b * 5) * Z, R = 2.2 * Z, y = alt(x, 16) + (flying(x) ? 0 : 1.2), span = L * 0.9;
    gearDown(x, L, R, y, 1);
    fuselage(x, L, R, y, x.body, 0.7);
    canopy(x, L * 0.35, y + R * 1.4, R * 1.3, L * 0.16, R * 0.6, 0.2);
    wings(x, R * 0.9, y + R * 1.9, 0, span, L * 0.12, 0, x.body2);
    tail(x, L, y + R * 1.5, R * 2, span * 0.3, x.body2, true);
    const tilt = moving(x) ? 1 : 0;
    for (const s of [-1, 1]) { const c: V3 = [s * span / 2, y + R * 1.9, 0]; D.cap([c[0], c[1] - 1, c[2]], [c[0], c[1] + 3 * (1 - tilt) + 0.5, c[2] + 3 * tilt], 1 * Z, 0.8 * Z, x.body2, D.depth(c) + 0.05); if (tilt) propeller(x, [c[0], c[1], c[2] + 3.5], 5 * Z, 'f', true); else propeller(x, [c[0], c[1] + 3.6, c[2]], 5 * Z, 'y', flying(x)); }
    const side: V3 = [R * 1.1, y + R, L * 0.1];
    D.cap(side, [side[0] + 3, side[1] - 0.8, side[2] + 0.5], 0.4, 0.35, P.dark, D.depth(side) + 0.1);
    shot(x, [side[0] + 3, side[1] - 0.8, side[2] + 0.5], [1, -0.2, 0.1], 'laser');
    planShadow(x, L, span, y);
    return;
  }
  if (e === 7) { // hover gunship: a flat lifting body on glowing pads, a turret under the nose
    const L = (18 + b * 5) * Z, W = L * 0.5, y = alt(x, 16) + 2;
    facet(x, [[0, y + 2, L / 2], [W / 2, y + 2, -L * 0.1], [W * 0.4, y + 2, -L / 2], [-W * 0.4, y + 2, -L / 2], [-W / 2, y + 2, -L * 0.1]], x.body, x.D.depth([0, y + 2, 0]), x.D.group(), null, true);
    pod(x, W * 0.5, L * 0.8, 3 * Z, y + 1, x.body2, 0.05, 0.7);
    canopy(x, L * 0.15, y + 1 + 3 * Z, W * 0.3, L * 0.25, 1.2 * Z, 0.2);
    for (const s of [-1, 1]) for (const f of [L * 0.2, -L * 0.3]) D.ell([s * W * 0.3, y + 1, f], 1.4 * Z, 0.5 * Z, P.glow, D.depth([s * W * 0.3, y, f]) - 0.05, { g: D.group(), noLine: true });
    turret(x, 0, L * 0.25, y - 0.5, 1.2 * Z, 0.8 * Z, 'plasma', 5 * Z, x.body2);
    shadow(x, [[0, L / 2], [W / 2, -L * 0.1], [W * 0.4, -L / 2], [-W * 0.4, -L / 2], [-W / 2, -L * 0.1]], y);
    return;
  }
  // twin-engine bomber (e4)
  const L = (22 + b * 5) * Z, R = 1.9 * Z, span = L * 1.2, y = alt(x, 20) + (flying(x) ? 0 : 1.8);
  gearDown(x, L, span * 0.18, y, 1.1);
  fuselage(x, L, R, y, x.body, 0.9);
  canopy(x, L * 0.44, y + R, R * 1.3, L * 0.08, R * 0.9, 0.2);
  wings(x, R * 0.9, y + R * 1.3, L * 0.04, span, L * 0.16, L * 0.02, x.body2, 0.5, 0.5);
  tail(x, L, y + R * 1.2, R * 2, span * 0.3, x.body2, true);
  for (const s of [-1, 1]) { const c: V3 = [s * span * 0.18, y + R * 1.2, L * 0.14]; D.cap([c[0], c[1], c[2] + 1], [c[0], c[1], c[2] - 5], 1.1 * Z, 0.7 * Z, x.body2, D.depth(c) + 0.05); propeller(x, [c[0], c[1], c[2] + 1.3], 3 * Z, 'f', flying(x)); }
  turret(x, 0, -L * 0.1, y + R * 1.9, 1 * Z, 0.8 * Z, 'mg', 3 * Z, P.glass, 0, Math.PI);
  bombs(x, y, 0, 3);
  planShadow(x, L, span, y);
}
/** heavy: war zeppelin (e3), four-engine bomber (e4), jet flying wing (e5), flying carrier (e6), sky fortress (e7) */
function bomber(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 3) {
    const L = (60 + b * 12) * Z * 0.8, R = L * 0.12, y = alt(x, 22), g = y + 0.2;
    for (const f of [L * 0.18, -L * 0.18]) box(x, -1.8, f - 4, 1.8, f + 4, g, g + 3, x.body2, x.body2);
    envelope(x, L, R, g + 4, x.body);
    for (const s of [-1, 1]) for (const f of [L * 0.18, -L * 0.22]) propeller(x, [s * (R + 1.2), g + 4 + R * 0.5, f], 2.4, 'f', flying(x));
    turret(x, 0, L * 0.1, g + 4 + R * 2 - 0.4, 1.2, 1, 'mg', 3.5, x.body2); // gun platform on top
    bombs(x, g, 0, 4);
    planShadow(x, L, R * 2, y);
    return;
  }
  if (e === 4) {
    const L = (30 + b * 6) * Z, R = 2.4 * Z, span = L * 1.3, y = alt(x, 24) + (flying(x) ? 0 : 2);
    gearDown(x, L, span * 0.14, y, 1.3);
    fuselage(x, L, R, y, x.body, 0.9);
    canopy(x, L * 0.4, y + R * 1.3, R * 1.3, L * 0.07, R * 0.7, 0.2);
    D.ell([0, y + R, L / 2 - 0.5], R * 0.7, R * 0.6, P.glass, D.depth([0, y + R, L / 2]) + 0.05, { g: D.group() });
    wings(x, R * 0.9, y + R * 1.4, L * 0.03, span, L * 0.14, L * 0.02, x.body2, 0.4, 0.5);
    tail(x, L, y + R * 1.2, R * 2.4, span * 0.3, x.body2);
    for (const s of [-1, 1]) for (const a of [span * 0.14, span * 0.3]) { const c: V3 = [s * a, y + R * 1.3, L * 0.12]; D.cap([c[0], c[1], c[2] + 1], [c[0], c[1], c[2] - 5], 1.1 * Z, 0.7 * Z, x.body2, D.depth(c) + 0.05); propeller(x, [c[0], c[1], c[2] + 1.3], 3 * Z, 'f', flying(x)); }
    turret(x, 0, L * 0.12, y + R * 2, 1.1 * Z, 0.8 * Z, 'twin', 3 * Z, P.glass);
    turret(x, 0, -L * 0.48, y + R * 0.8, 1 * Z, 0.8 * Z, 'twin', 3 * Z, P.glass, 1, Math.PI);
    bombs(x, y, 0, 4);
    planShadow(x, L, span, y);
    return;
  }
  if (e === 5) { // jet flying wing
    const L = (24 + b * 5) * Z, span = L * 2, y = alt(x, 24) + (flying(x) ? 0 : 2);
    gearDown(x, L, span * 0.1, y, 1.2);
    const w: V3[] = [[0, y + 1.5, L / 2], [span / 2, y + 1.2, -L * 0.1], [span / 2 - 2, y + 1.2, -L * 0.25], [span * 0.25, y + 1.2, -L * 0.12], [span * 0.12, y + 1.2, -L * 0.3], [0, y + 1.2, -L * 0.15], [-span * 0.12, y + 1.2, -L * 0.3], [-span * 0.25, y + 1.2, -L * 0.12], [-span / 2 + 2, y + 1.2, -L * 0.25], [-span / 2, y + 1.2, -L * 0.1]];
    facet(x, w, x.body, D.depth([0, y + 1.3, 0]), D.group(), null, true);
    pod(x, span * 0.28, L * 0.8, 3 * Z, y, x.body2, 0.05, 0.5);
    D.poly([[-2, y + 1.8 + 3 * Z * 0.7, L * 0.3], [2, y + 1.8 + 3 * Z * 0.7, L * 0.3], [1.5, y + 1.6 + 3 * Z * 0.8, L * 0.2], [-1.5, y + 1.6 + 3 * Z * 0.8, L * 0.2]], P.glass, D.depth([0, y + 3, L * 0.3]) + 0.2, { g: D.group(), flat: 0.6 });
    if (flying(x)) for (const s of [-1, 1]) exhaust(x, [s * span * 0.07, y + 2, -L * 0.25], 'jet', 1 * Z);
    bombs(x, y, 0, 4);
    shadow(x, w.map(p => [p[0], p[2]] as Pt), y);
    return;
  }
  if (e === 6) { // flying carrier: a deck held up by four big ducted fans, drones launching
    const L = (40 + b * 8) * Z, W = L * 0.35, y = alt(x, 22) + 3;
    for (const s of [-1, 1]) for (const f of [L * 0.3, -L * 0.3]) { const c: V3 = [s * (W / 2 + 3.5 * Z), y + 1, f]; cyl(x, c[0], c[2], 3.4 * Z, c[1] - 1, c[1] + 1, x.body2, x.body2, { bias: 0.02 }); propeller(x, [c[0], c[1] + 0.6, c[2]], 3 * Z, 'y', flying(x)); if (flying(x)) exhaust(x, [c[0], c[1] - 2, c[2]], 'glow', 1.6 * Z); D.cap([s * W / 2, y + 1, f], c, 0.8, 0.8, x.body2, D.depth(c) - 0.03); }
    box(x, -W / 2, -L / 2, W / 2, L / 2, y, y + 2.5 * Z, x.body, { ...P.dark, tex: 'smooth' });
    const dy = y + 2.5 * Z;
    box(x, W * 0.2, -L * 0.2, W * 0.45, L * 0.1, dy, dy + 5 * Z, x.body2, x.body2, 0.05);
    for (let i = 0; i < 3 + b; i++) facet(x, [[-W * 0.25, dy + 0.2, -L * 0.35 + i * 3 * Z + 1.2 * Z], [-W * 0.25 + 1.5 * Z, dy + 0.2, -L * 0.35 + i * 3 * Z], [-W * 0.25 - 1.5 * Z, dy + 0.2, -L * 0.35 + i * 3 * Z]], P.mil2, D.depth([0, dy, 0]) + 0.1, D.group(), null, true);
    if (x.anim === 'use') { const f = -L * 0.2 + x.t * L, lift = Math.max(0, f - L * 0.4); facet(x, [[-W * 0.1, dy + 0.4 + lift, f + 1.4 * Z], [-W * 0.1 + 1.8 * Z, dy + 0.4 + lift, f], [-W * 0.1 - 1.8 * Z, dy + 0.4 + lift, f]], P.mil2, 1e4, D.group(), null, true); exhaust(x, [-W * 0.1, dy + 0.4 + lift, f - 0.6], 'glow', 0.6 * Z); }
    for (const s of [-1, 1]) turret(x, s * W * 0.38, L * 0.42, dy, 1.2 * Z, 1 * Z, 'laser', 4 * Z, x.body2, s);
    shadow(x, [[-W / 2 - 7 * Z, L / 2], [W / 2 + 7 * Z, L / 2], [W / 2 + 7 * Z, -L / 2], [-W / 2 - 7 * Z, -L / 2]], y);
    return;
  }
  // sky fortress: a huge saucer with a citadel and plasma batteries
  const R = (16 + b * 4) * Z, y = alt(x, 20) + 3;
  saucer(x, R, y, 0.25);
  const top = y + R * 0.34;
  const v = box(x, -R * 0.18, -R * 0.18, R * 0.18, R * 0.18, top, top + 4 * Z, x.body2, x.body2, 0.2);
  roofOn(x, v, 'dome', P.glass, P.glass, { over: 0.2 });
  for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + Math.PI / 4; turret(x, Math.sin(t) * R * 0.5, Math.cos(t) * R * 0.5, y + R * 0.25, 1.6 * Z, 1.2 * Z, 'plasma', 6 * Z, x.body2, i, t); }
  bombs(x, y, 0, 3);
  discShadow(x, R, R, y);
}

// ---------------------------------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------------------------------
/** e4: a tiltrotor (its rotors swing from lift to thrust); e5+: a jet that unfolds legs and arms and lands as a walker */
function transformer(x: VCtx) {
  const { e, P, D } = x, Z = x.Z, b = tier(x);
  if (e === 4) {
    const L = (18 + b * 4) * Z, R = 2 * Z, span = L * 0.9, y = alt(x, 16) + (flying(x) ? 0 : 1.2);
    gearDown(x, L, R, y, 1);
    fuselage(x, L, R, y, x.body, 0.8);
    canopy(x, L * 0.36, y + R * 1.4, R * 1.3, L * 0.14, R * 0.6, 0.2);
    wings(x, R * 0.9, y + R * 1.9, 0, span, L * 0.12, 0, x.body2);
    tail(x, L, y + R * 1.5, R * 2, span * 0.3, x.body2);
    const tilt = x.anim === 'use' ? Math.min(1, Math.max(0, (x.t - 0.2) / 0.5)) : moving(x) ? 1 : 0;
    for (const s of [-1, 1]) {
      const c: V3 = [s * span / 2, y + R * 1.9, 0], dir: V3 = [0, Math.cos(tilt * Math.PI / 2), Math.sin(tilt * Math.PI / 2)];
      D.cap([c[0] - dir[0], c[1] - dir[1] * 1.2, c[2] - dir[2] * 1.2], [c[0], c[1] + dir[1] * 3, c[2] + dir[2] * 3], 1 * Z, 0.8 * Z, x.body2, D.depth(c) + 0.05);
      const hub: V3 = [c[0], c[1] + dir[1] * 3.6, c[2] + dir[2] * 3.6];
      if (tilt > 0.5) propeller(x, hub, 5 * Z, 'f', flying(x)); else propeller(x, hub, 5 * Z, 'y', flying(x));
    }
    planShadow(x, L, span, y);
    return;
  }
  // jet <-> walker. 'idle' = walker standing, 'move' = jet flying, 'use' = the jet lands and unfolds (then folds back)
  const L = (15 + b * 3) * Z, R = 1.5 * Z, span = L * 0.7;
  const m = x.anim === 'idle' ? 1 : x.anim === 'move' ? 0 : Math.sin(Math.PI * Math.min(1, x.t * 1.25)) ** 0.7;
  const hip = 9 * Z * m, y = (1 - m) * 18 + hip + (m > 0.9 ? Math.sin(x.ph) * 0.3 : 0);
  if (m > 0.05) legs(x, R * 2.4, [-L * 0.15], y, hip, 1 * Z, P.metal, false);
  // the fuselage pitches up into a torso as it stands
  const pitch = m * 1.2, c: V3 = [0, y + R, -L * 0.15];
  const rot = (p: V3): V3 => { const dy = p[1] - c[1], df = p[2] - c[2]; return [p[0], c[1] + dy * Math.cos(pitch) + df * Math.sin(pitch), c[2] - dy * Math.sin(pitch) + df * Math.cos(pitch)]; };
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) { const k = i / 8, f = -L / 2 + L * k, rr = Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.45; for (let j = 0; j < 10; j++) { const t = (j / 10) * Math.PI * 2; pts.push(rot([Math.cos(t) * R * rr, y + R + Math.sin(t) * R * rr, f])); } }
  D.hull(pts, x.body, D.depth(c), { g: D.group(), flat: 0 });
  const cp = rot([0, y + R * 1.8, L * 0.22]);
  D.ell(cp, R * 0.8, R * 0.5, P.glass, D.depth(cp) + 0.2, { g: D.group() });
  // wings fold back along the body as it stands; arms with guns swing out
  for (const s of [-1, 1]) {
    const root = rot([s * R * 0.8, y + R, -L * 0.05]), tipW = rot([s * (R + (span / 2 - R) * (1 - m * 0.7)), y + R, -L * 0.2 - m * L * 0.1]), back = rot([s * (R + (span / 2 - R) * (1 - m * 0.7)), y + R, -L * 0.3 - m * L * 0.1]), rootB = rot([s * R * 0.8, y + R, -L * 0.3]);
    wing(x, [root, tipW, back, rootB], x.body2);
    if (m > 0.4) { const sh = rot([s * R * 1.3, y + R, L * 0.1]), mz: V3 = [sh[0] + s * 0.5, sh[1] - 2 * Z, sh[2] + 5 * Z * m]; D.cap(sh, mz, 0.9 * Z, 0.6 * Z, P.metal, D.depth(sh) + 0.3); shot(x, mz, [0, 0, 1], e >= 7 ? 'plasma' : e >= 6 ? 'laser' : 'mg'); }
  }
  const noz = rot([0, y + R, -L * 0.52]);
  if (m < 0.5 && x.anim !== 'idle') exhaust(x, noz, 'jet', 1.2 * Z, [0, 0, -1]);
  else if (m < 0.95 && x.anim === 'use') exhaust(x, [noz[0], noz[1] - 1, noz[2]], 'jet', 1 * Z, [0, -1, 0]);
  if (m < 0.2) planShadow(x, L, span, y);
  lamp(x, rot([0, y + R * 2, L * 0.4]), P.glow, true, 0.5);
}

export const AIR = { airliner, fighter, gunship, bomber, transformer };
void frac;
