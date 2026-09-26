// The seabed (play mode, aquatic era): what the submerged gameplay zoom shows instead of the sea's surface.
// Every sea pixel of a terrain row gets a floor by its "deepness" q (0 = the shore, 0.33 = coastal shelf edge,
// 0.66 = abyss edge, 1 = the deepest trench of that ocean): rippled sand on the shelf, silt and rock outcrops in the
// open sea, dark ooze with faint living lights in the abyss. The water between the eye and the floor is baked in as
// the planet's own water colour, thicker with depth. Shallow rows are animated (the row's liquid frames): moving
// caustic webs of sunlight and swaying seagrass / kelp; corals dot warm shallows. Flat 2D pixel art.
import { LIQUID_FRAMES } from './types';
import { rand2, vnoise } from './noise';
import { RGB, shiftRamp } from './palettes';

export interface BedStyle {
  seed: number;
  sand: RGB[]; mud: RGB[]; rock: RGB[][]; water: RGB[]; shallow: RGB[];
  /** seagrass (shifted with the planet's vegetation hue) */
  grass: RGB[];
  alien: boolean;
  /** hue shift of the vegetation (corals / glows of alien worlds follow it) */
  vh: number;
}

const CORAL: RGB[][] = [
  [[120, 40, 70], [180, 70, 100], [232, 120, 140]],
  [[140, 70, 30], [206, 120, 50], [246, 176, 90]],
  [[70, 50, 120], [120, 90, 180], [178, 150, 230]],
  [[40, 110, 110], [70, 170, 160], [140, 220, 200]],
];
/** the world above the water, seen from below: a multiplier (the view tints rows without water the same way) */
export const ABOVE: RGB = [26 / 255, 44 / 255, 64 / 255];
const KELP: RGB[] = [[40, 38, 14], [70, 64, 22], [104, 92, 34], [138, 124, 52]];
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pick = (r: RGB[], v: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];

/** colour of the water column in front of a floor at deepness q, and how much of the floor it hides */
function column(st: BedStyle, q: number): [RGB, number] {
  const c = q < 0.4 ? lerp(st.shallow[1], st.water[2], q / 0.4) : lerp(st.water[2], st.water[0], Math.min(1, (q - 0.4) / 0.6));
  return [c, 0.5 + q * 0.38];
}

/**
 * Paints the seabed version of a terrain row. `pts` = [bufIndex, wx, wy, q*1000, temp*1000, rock] per sea pixel;
 * returns the static bed and, when the row has shallow water, its animated frames.
 */
export function seabedRow(st: BedStyle, buf: Uint8ClampedArray, W: number, pts: number[]): { bed: Uint8ClampedArray; anim?: Uint8ClampedArray[] } {
  const s = st.seed;
  const bed = new Uint8ClampedArray(buf);
  const n = pts.length / 6;
  const isBed = new Uint8Array(buf.length >> 2);
  const qOf = new Float32Array(buf.length >> 2);
  let shallow = false;
  const coral = st.alien ? CORAL.map(c => shiftRamp(c, st.vh)) : CORAL;
  const glow: RGB = st.alien ? shiftRamp([[90, 220, 210]], st.vh * 1.5)[0] : [110, 210, 220];
  const roots: number[] = [];   // [bufIndex, wx, wy, len, kind(0 grass / 1 kelp), q]
  for (let p = 0; p < n; p++) {
    const k = pts[p * 6], wx = pts[p * 6 + 1], wy = pts[p * 6 + 2], q = pts[p * 6 + 3] / 1000, temp = pts[p * 6 + 4] / 1000;
    const inland = Math.floor(pts[p * 6 + 5] / 100);          // 1 river, 2 swamp
    const rock = st.rock[pts[p * 6 + 5] % 100] ?? st.rock[0];
    const r0 = rand2(wx, wy, s + 700);
    const pa = vnoise(wx / 23, wy / 23, s + 701), pb = vnoise(wx / 7, wy / 7, s + 702);
    const qm = q + (pa - 0.5) * 0.12;                               // organic borders between the floors
    let c: RGB;
    // rock outcrops, more of them out in the open sea
    const outAt = (x: number, y: number) => vnoise(x / 31, y / 31, s + 703) * 0.7 + vnoise(x / 7, y / 7, s + 702) * 0.3;
    const out = vnoise(wx / 31, wy / 31, s + 703) * 0.7 + pb * 0.3;
    const thr = 0.72 - qm * 0.1;
    let shadow = false;
    if (inland === 1) {
      // riverbed: rounded pebbles in the current, sand in between
      // round pebbles on a jittered 5 px grid, lit from the north-west
      let peb = -1, lit = 0;
      for (let oy = -1; oy <= 1 && peb < 0; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = Math.floor(wx / 5) + ox, gy = Math.floor(wy / 5) + oy, h = rand2(gx, gy, s + 730);
        if (h < 0.25) continue;
        const cx = gx * 5 + 2.5 + (rand2(gy, gx, s + 731) - 0.5) * 2, cy = gy * 5 + 2.5 + (h - 0.5) * 2;
        const r = 1.4 + h * 1.4, dx = wx + 0.5 - cx, dy = wy + 0.5 - cy;
        if (dx * dx + dy * dy < r * r) { peb = h; lit = -(dx + dy) / r; break; }
      }
      c = peb >= 0 ? pick(rock, 2.2 + peb * 2 + lit * 1.2) : pick(st.sand, 1.6 + pb * 1.5);
    } else if (inland === 2) {
      // swamp bottom: dark silt with sunken leaves
      c = pick(st.mud, 1.5 + pb * 1.8);
      if (r0 > 0.97) c = pick(st.grass, 1);
    } else if (out > thr) {
      // a boulder: lit crest towards the sun (north-west), dark flank, crisp dark rim
      const hi = out - outAt(wx - 3, wy - 3), rim = out - thr < 0.02;
      c = pick(rock, 2.6 + hi * 38 + (out - thr) * 8 + (pb - 0.5) * 0.9 + (r0 - 0.5) * 0.7 - (rim ? 2 : 0));
      if (!rim && hi > 0.012 && r0 > 0.6) c = pick(st.grass, 1 + r0 * 2);   // algae on the lit crest
    } else if (qm < 0.36 && (shadow = outAt(wx - 4, wy - 6) > thr, true)) {
      // rippled sand: bands across the swell, pebbles and shells
      const rip = Math.sin((wx * 0.55 + wy * 0.9) / 1.9 + pa * 9 + pb * 3);
      c = pick(st.sand, 2.6 + (rip > 0.55 ? 1.1 : rip < -0.7 ? -0.9 : 0) + (pb - 0.5) * 1.2 + (r0 - 0.5) * 0.5);
      if (r0 > 0.994) c = pick(rock, 3 + r0 * 2);
      if (qm > 0.26) c = lerp(c, pick(st.mud, 3), (qm - 0.26) * 6);
      if (shadow) c = [c[0] * 0.68, c[1] * 0.72, c[2] * 0.78];      // the boulder's shadow on the sand
    } else if (qm < 0.68) {
      // silt: soft mud with worm casts and scattered stones
      c = pick(st.mud, 2.8 + (pb - 0.5) * 1.6 + (r0 - 0.5) * 0.6);
      if (rand2(wx >> 1, wy >> 1, s + 704) > 0.985) c = pick(st.mud, 5);
      if (r0 > 0.992) c = pick(rock, 2 + r0 * 2);
      if (qm > 0.58) c = lerp(c, pick(rock, 0.5), (qm - 0.58) * 6);
    } else {
      // abyssal ooze
      c = lerp(pick(rock, 0.4 + pb * 1.2), pick(st.mud, 0.5), 0.5);
      if (vnoise(wx / 5, wy / 5, s + 705) > 0.8) c = lerp(c, [8, 10, 14], 0.4);
    }
    // corals on warm shelves
    if (qm < 0.28 && temp > 0.68 && vnoise(wx / 15, wy / 15, s + 706) > 0.7 && vnoise(wx / 47, wy / 47, s + 717) > 0.55 && rand2(wx >> 1, wy >> 1, s + 707) > 0.5) {
      const cr = coral[Math.floor(vnoise(wx / 41, wy / 41, s + 708) * coral.length) % coral.length];
      c = cr[rand2(wx, wy, s + 709) > 0.7 ? 2 : rand2(wx >> 1, wy, s + 710) > 0.4 ? 1 : 0];
    }
    // the water column in front of it, and a slow light variation
    const [wc, a] = column(st, q);
    const light = 0.9 + vnoise(wx / 57, wy / 57, s + 711) * 0.2;
    c = lerp(c, wc, a);
    c = [c[0] * light * (0.86 - q * 0.42), c[1] * light * (0.97 - q * 0.38), c[2] * light * (1.04 - q * 0.3)];
    // living lights of the abyss
    if (q > 0.7 && rand2(wx, wy, s + 712) > 0.9983) c = lerp(glow, [255, 255, 255], rand2(wx, wy, s + 713) * 0.4);
    bed[k] = c[0]; bed[k + 1] = c[1]; bed[k + 2] = c[2]; bed[k + 3] = 255;
    isBed[k >> 2] = 1; qOf[k >> 2] = q;
    if (q < 0.45) shallow = true;
    // seagrass meadows on the shelf (kelp forests where the water is cold)
    if (q < 0.5 && vnoise(wx / 21, wy / 21, s + 714) > 0.62 && rand2(wx, wy, s + 715) > (temp < 0.42 ? 0.978 : 0.955)) {
      const kelp = temp < 0.42;
      roots.push(k, wx, wy, kelp ? 7 + Math.floor(rand2(wx, wy, s + 716) * 7) : 3 + Math.floor(rand2(wx, wy, s + 716) * 4), kelp ? 1 : 0, q);
    }
  }
  const blades = (out: Uint8ClampedArray, ph: number) => {
    for (let r = 0; r < roots.length; r += 6) {
      const k0 = roots[r], wx = roots[r + 1], len = roots[r + 3], kelp = roots[r + 4], q = roots[r + 5];
      const [wc, a] = column(st, q);
      const x0 = (k0 >> 2) % W, y0 = Math.floor((k0 >> 2) / W);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const sway = Math.round(Math.sin(ph + wx * 0.37) * (kelp ? 2.2 : 1.3) * t ** 1.4);
        const x = x0 + sway, y = y0 - i;
        if (x < 0 || x >= W || y < 0) break;
        const kk = (y * W + x) * 4;
        if (!isBed[kk >> 2]) continue;
        let c = kelp ? KELP[Math.min(KELP.length - 1, Math.floor(t * KELP.length))] : pick(st.grass, 1 + t * 3.5);
        if (kelp && i > 2 && i % 3 === 0) c = KELP[3];            // gas bladders
        c = lerp(c, wc, a * 0.6);
        out[kk] = c[0]; out[kk + 1] = c[1]; out[kk + 2] = c[2];
      }
    }
  };
  // everything above the water (land, cliffs, waterfalls) is only a dark shape seen from below
  for (let i = 0; i < isBed.length; i++) {
    if (isBed[i]) continue;
    const k = i * 4;
    if (!bed[k + 3]) continue;
    bed[k] = bed[k] * ABOVE[0]; bed[k + 1] = bed[k + 1] * ABOVE[1]; bed[k + 2] = bed[k + 2] * ABOVE[2];
  }
  const still = new Uint8ClampedArray(bed);
  blades(still, 0);
  if (!shallow) return { bed: still };
  // animated frames: caustic webs drift over the shelf, the meadows sway
  const anim: Uint8ClampedArray[] = [];
  for (let f = 0; f < LIQUID_FRAMES; f++) {
    const ph = (f / LIQUID_FRAMES) * Math.PI * 2;
    const out = new Uint8ClampedArray(bed);
    const cx = Math.cos(ph) * 5, cy = Math.sin(ph) * 5;
    for (let p = 0; p < n; p++) {
      const k = pts[p * 6], q = qOf[k >> 2];
      if (q >= 0.45) continue;
      const wx = pts[p * 6 + 1], wy = pts[p * 6 + 2];
      const a = vnoise((wx + cx) / 10, (wy + cy) / 10, s + 720), b = vnoise((wx - cy) / 7, (wy + cx) / 7, s + 721);
      const web = 1 - Math.abs(a - b) * 8;
      if (web < 0.45) continue;
      const k2 = (0.45 - q) / 0.45 * (web > 0.8 ? 1 : 0.5);
      out[k] = Math.min(255, out[k] + 46 * k2); out[k + 1] = Math.min(255, out[k + 1] + 62 * k2); out[k + 2] = Math.min(255, out[k + 2] + 54 * k2);
    }
    blades(out, ph);
    anim.push(out);
  }
  return { bed: still, anim };
}
