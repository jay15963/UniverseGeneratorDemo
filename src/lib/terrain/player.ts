// Procedurally painted tribal explorer: 4 directions (right = mirrored left) x idle / walk / gather.
// Built from shaded capsules and blobs so the character has the same pixel density and lighting as
// the trees and rocks around it.
import { Pix } from './pixelKit';
import { ramp, hex, RGB } from './palettes';

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Anim = 'idle' | 'walk' | 'gather';
export type PlayerFrames = Record<Anim, Record<Dir, HTMLCanvasElement[]>>;

export const PLAYER_W = 22, PLAYER_H = 32, PLAYER_AX = 11, PLAYER_AY = 30;

const SKIN = ramp('#5a2c18', '#8c4a2c', '#b86a40', '#d88e58', '#f0b684');
const HAIR = ramp('#0a0808', '#161214', '#282228', '#403640');
const FUR = ramp('#26221f', '#48413a', '#6c6258', '#948876', '#bcb09a');
const LEATHER = ramp('#1e140c', '#3a2616', '#5a3c20', '#7a5430');
const BONE = ramp('#8e8268', '#c8bea2', '#ece6d2', '#fffaf0');
const WOOD = ramp('#3a2412', '#5c3a1c', '#80562c');
const FLINT = ramp('#1a1a20', '#3a3a46', '#6a6a7c', '#a4a4b8');
const RED: RGB = hex('#c43a22'), RED_L: RGB = hex('#ea6a3c');
const WHITE: RGB = hex('#efe8d6');
const EYE: RGB = hex('#120c0a');

interface Pose {
  bob: number;        // body vertical offset (px, + = down)
  crouch: number;     // gathering crouch (px)
  footL: number; footR: number;   // front/back view: foot lift (px)
  legA: number; legB: number;     // side view: leg angles (rad, + = forward)
  kneeA: number; kneeB: number;   // side view: knee bend (rad)
  armL: number; armR: number;     // swing (-1..1)
  reach: number;      // gather reach 0..1
  hair: number;       // hair/feather sway (-1..1)
  blink: boolean;
}

const base = (): Pose => ({ bob: 0, crouch: 0, footL: 0, footR: 0, legA: 0, legB: 0, kneeA: 0, kneeB: 0, armL: 0, armR: 0, reach: 0, hair: 0, blink: false });

function walkPose(f: number): Pose {
  const p = base();
  const a = (f / 6) * Math.PI * 2;
  const s = Math.sin(a);
  p.bob = Math.abs(Math.cos(a)) > 0.7 ? 0 : 1;          // down on the passing pose
  p.footL = Math.max(0, s) * 2.2; p.footR = Math.max(0, -s) * 2.2;
  p.legA = s * 0.42; p.legB = -s * 0.42;
  p.kneeA = Math.max(0, -Math.cos(a)) * 0.5 * (s < 0 ? 1 : 0.3); p.kneeB = Math.max(0, Math.cos(a)) * 0.5 * (s > 0 ? 1 : 0.3);
  p.armL = -s; p.armR = s;
  p.hair = -Math.cos(a) * 0.8;
  return p;
}
function idlePose(f: number): Pose {
  const p = base();
  p.bob = f === 1 || f === 2 ? 1 : 0;     // breathing
  p.hair = Math.sin((f / 4) * Math.PI * 2) * 0.5;
  p.blink = f === 3;
  return p;
}
function gatherPose(f: number): Pose {
  const p = base();
  const k = [0.4, 1, 1, 0.5][f];
  p.crouch = Math.round(k * 5);
  p.reach = k;
  p.legA = 0.35 * k; p.legB = -0.25 * k; p.kneeA = 0.9 * k; p.kneeB = 1.1 * k;
  p.hair = f === 2 ? 0.6 : 0;
  return p;
}

// ---------------------------------------------------------------------------
function spear(p: Pix, x0: number, y0: number, x1: number, y1: number) {
  p.line(x0, y0, x1, y1, (t, x, y) => p.shade(WOOD, 0.7 - t * 0.3, x, y));
  // flint head + binding
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  p.set(x1 - ux, y1 - uy, LEATHER[3]);
  p.set(x1, y1, FLINT[2]); p.set(x1 + ux, y1 + uy, FLINT[3]); p.set(x1 + ux * 2, y1 + uy * 2, FLINT[1]);
  p.set(x1 + ux - uy, y1 + uy + ux, FLINT[1]); p.set(x1 + ux + uy, y1 + uy - ux, FLINT[2]);
}

function feathers(p: Pix, x: number, y: number, sway: number, back: boolean) {
  // two feathers tucked in the headband, tips bounce with the hair
  const tips: [number, number, RGB, RGB][] = [[x + 2 + sway, y - 6, RED, RED_L], [x + 4 + sway * 1.4, y - 4, WHITE, hex('#2a2a2a')]];
  for (const [tx, ty, c, tipC] of tips) {
    p.line(x, y, tx, ty, (t) => (t > 0.75 ? tipC : c));
    p.line(x + 1, y, tx + 1, ty + (back ? 0 : 1), (t) => (t > 0.75 ? tipC : [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]));
  }
}

function featherLeft(p: Pix, x: number, y: number, sway: number) {
  p.line(x, y, x - 2 + sway, y - 6, (t) => (t > 0.75 ? RED_L : RED));
  p.line(x - 1, y, x - 3 + sway, y - 5, (t) => (t > 0.7 ? hex('#2a2a2a') : WHITE));
}

function paintFront(pose: Pose, back: boolean): HTMLCanvasElement {
  const p = new Pix(PLAYER_W, PLAYER_H, back ? 11 : 7);
  const cx = 11, ground = 30;
  const oy = pose.bob + pose.crouch;
  const hipY = 21 + pose.crouch * 0.8;
  // spear on the back (visible over the right shoulder)
  if (!back) spear(p, 15, 27 + oy * 0.5, 17, 5 + oy);
  // long hair behind the shoulders
  const hs = pose.hair;
  if (!back) p.blob(cx + hs * 0.5, 12 + oy, 5.2, 5, HAIR, { bias: -0.15 });
  // legs with leather wraps
  const leg = (hx: number, lift: number, dark: number) => {
    const fy = ground - lift - pose.crouch * 0.3;
    const kx = hx + (pose.crouch ? (hx < cx ? -1.5 : 1.5) : 0);
    p.capsule(hx, hipY, kx, (hipY + fy) / 2 + 0.5, 1.9, 1.6, SKIN, dark);
    p.capsule(kx, (hipY + fy) / 2 + 0.5, hx, fy - 1, 1.6, 1.4, SKIN, dark, t => (t > 0.35 && t < 0.85 && Math.floor(t * 9) % 2 === 0 ? LEATHER[2] : null));
    // wrapped foot
    p.blob(hx + (hx < cx ? -0.3 : 0.3), fy, 1.9, 1.1, LEATHER, { bias: dark });
  };
  leg(cx - 2.3, pose.footL, 0);
  leg(cx + 2.3, pose.footR, -0.1);
  // loincloth with fringe
  for (let y = Math.floor(hipY - 2); y <= hipY + 3; y++) for (let x = cx - 4; x <= cx + 4; x++) {
    const w = 4 - Math.max(0, y - hipY) * 0.5;
    if (Math.abs(x + 0.5 - cx) > w) continue;
    p.set(x, y, p.shade(LEATHER, 0.62 - (x - cx) * 0.06 - (y - hipY) * 0.05, x, y));
  }
  for (let x = cx - 3; x <= cx + 3; x += 1) if ((x + Math.round(hs)) % 2 === 0) p.set(x, hipY + 4, LEATHER[1]);
  // torso: fur vest over bare chest
  const ty0 = 12 + oy, ty1 = hipY - 1;
  for (let y = ty0; y <= ty1; y++) {
    const w = 4.6 - (y - ty0) * 0.12;
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
      const u = (x + 0.5 - cx) / w;
      if (Math.abs(u) > 1) continue;
      const chest = !back && Math.abs(u) < 0.42 - (y - ty0) * 0.02 && y < ty1 - 1;
      if (chest) p.set(x, y, p.shade(SKIN, 0.62 - u * 0.25 - (y - ty0) * 0.02, x, y));
      else {
        const fluff = ((x * 7 + y * 3) % 5 === 0) ? 0.18 : 0;
        p.set(x, y, p.shade(FUR, 0.6 - u * 0.3 - (y - ty0) * 0.02 + fluff, x, y));
      }
    }
  }
  // belt
  for (let x = cx - 4; x <= cx + 4; x++) p.set(x, ty1, LEATHER[x < cx ? 3 : 1]);
  p.set(cx, ty1, BONE[2]);
  if (!back) {
    // tooth necklace
    for (let k = -2; k <= 2; k++) p.set(cx + k, ty0 + 1 + (Math.abs(k) === 2 ? 0 : 1), LEATHER[0]);
    p.set(cx, ty0 + 3, BONE[3]); p.set(cx, ty0 + 4, BONE[1]); p.set(cx - 1, ty0 + 2, BONE[2]); p.set(cx + 1, ty0 + 2, BONE[2]);
  } else {
    // spear strapped across the back
    spear(p, 7, 27 + oy * 0.5, 5, 5 + oy);
    // hair cascades down the back with a braid
    p.blob(cx + hs * 0.6, 13 + oy, 4.2, 5.5, HAIR, { bias: -0.05 });
    for (let y = 16 + oy; y < 21 + oy; y++) { p.set(cx + Math.round(hs), y, HAIR[(y % 2) + 1]); p.set(cx + 1 + Math.round(hs), y, HAIR[y % 2]); }
    p.set(cx + Math.round(hs), 21 + oy, RED);
  }
  // arms (swing = hand moves up/down), bone bracelet at the wrist
  const arm = (sx: number, swing: number, reach: number, dark: number) => {
    const hx = sx + (sx < cx ? -0.6 : 0.6) * (1 - reach) + (reach ? (sx < cx ? 1 : -1) * reach * 1.5 : 0);
    const hy = 19.5 + oy + swing * (back ? 1 : -1) * 1.3 + reach * 5;
    p.capsule(sx, 13.3 + oy, hx, hy, 1.7, 1.35, SKIN, dark, t => (t > 0.82 && t < 0.95 ? BONE[2] : t < 0.18 ? FUR[3] : null));
  };
  arm(cx - 5, pose.armL, pose.reach, 0.05);
  arm(cx + 5, pose.armR, pose.reach * 0.3, -0.12);
  // head
  const hy = 7 + oy;
  p.blob(cx, hy, 3.7, 4.1, SKIN, { bias: 0.02 });
  if (back) {
    p.blob(cx, hy - 0.5, 4.2, 4.4, HAIR, { bias: 0.02 });
  } else {
    // hair: top, side locks framing the face
    for (let y = hy - 5; y <= hy - 1; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const d = Math.hypot((x + 0.5 - cx) / 4.3, (y + 0.5 - (hy - 0.5)) / 4.6);
      if (d <= 1 && (y < hy - 2 || Math.abs(x + 0.5 - cx) > 2.6)) p.set(x, y, p.shade(HAIR, 0.6 - (x - cx) * 0.06 - (y - hy + 5) * 0.03, x, y));
    }
    for (let y = hy - 1; y <= hy + 5; y++) {
      p.set(cx - 4 + (y > hy + 2 ? Math.round(-hs * 0.5) : 0), y, HAIR[2]);
      p.set(cx + 4 + (y > hy + 2 ? Math.round(-hs * 0.5) : 0), y, HAIR[1]);
    }
    // face: eyes, war paint, mouth
    if (pose.blink) { p.set(cx - 2, hy + 1, SKIN[1]); p.set(cx + 1, hy + 1, SKIN[1]); p.set(cx - 1, hy + 1, SKIN[1]); p.set(cx + 2, hy + 1, SKIN[1]); }
    else { p.set(cx - 2, hy + 1, EYE); p.set(cx + 2, hy + 1, EYE); p.set(cx - 2, hy, SKIN[4]); p.set(cx + 2, hy, SKIN[3]); }
    p.set(cx - 2, hy + 2, RED); p.set(cx + 2, hy + 2, RED); // cheek paint under each eye
    p.set(cx, hy + 2, SKIN[1]); // nose shadow
    p.set(cx, hy + 4, SKIN[1]);
  }
  // headband with a bone bead
  for (let x = cx - 4; x <= cx + 4; x++) p.set(x, hy - 2, x === cx ? BONE[3] : RED);
  p.set(cx - 4, hy - 2, hex('#8a2414'));
  if (back) feathers(p, cx + 3, hy - 3, pose.hair, true);
  else featherLeft(p, cx - 3, hy - 3, pose.hair);
  p.selout(0.3);
  return p.toCanvas();
}

function paintSide(pose: Pose): HTMLCanvasElement {
  // faces LEFT; "right" is a mirror
  const p = new Pix(PLAYER_W, PLAYER_H, 5);
  const cx = 11, ground = 30;
  const oy = pose.bob + pose.crouch;
  const hip = { x: 11.5, y: 21 + pose.crouch * 0.8 };
  const legLen = ground - 21;
  const hs = pose.hair;
  // spear across the back
  spear(p, 14, 27 + oy * 0.5, 16, 4 + oy);
  const leg = (a: number, knee: number, dark: number) => {
    const th = legLen * 0.5;
    const kx = hip.x - Math.sin(a) * th, ky = hip.y + Math.cos(a) * th;
    const a2 = a - knee;
    let fx = kx - Math.sin(a2) * th, fy = ky + Math.cos(a2) * th;
    fy = Math.min(fy, ground - 0.5);
    p.capsule(hip.x, hip.y, kx, ky, 1.9, 1.6, SKIN, dark);
    p.capsule(kx, ky, fx, fy - 0.8, 1.6, 1.3, SKIN, dark, t => (t > 0.3 && t < 0.85 && Math.floor(t * 9) % 2 === 0 ? LEATHER[2] : null));
    p.blob(fx - 1, fy, 2.2, 1.1, LEATHER, { bias: dark });
  };
  const arm = (swing: number, dark: number, reach: number) => {
    const sx = 12, sy = 13.3 + oy;
    const a = swing * 0.55 + reach * 1.2;
    const ex = sx - Math.sin(a) * 3.2, ey = sy + Math.cos(a) * 3.2;
    const a2 = a + 0.25 + reach * 0.4;
    const hx = ex - Math.sin(a2) * 3.2, hy = ey + Math.cos(a2) * 3.2;
    p.capsule(sx, sy, ex, ey, 1.6, 1.4, SKIN, dark, t => (t < 0.35 ? FUR[3] : null));
    p.capsule(ex, ey, hx, hy, 1.4, 1.25, SKIN, dark, t => (t > 0.7 && t < 0.9 ? BONE[2] : null));
  };
  // far limbs (darker, behind the body)
  leg(pose.legB, pose.kneeB, -0.38);
  arm(pose.armR, -0.4, pose.reach * 0.4);
  // hair flowing behind
  p.blob(14 + hs * 0.6, 12 + oy, 3.2, 5, HAIR, { bias: -0.1 });
  for (let y = 15 + oy; y < 20 + oy; y++) { p.set(15 + Math.round(hs), y, HAIR[(y % 2) + 1]); p.set(16 + Math.round(hs), y, HAIR[y % 2]); }
  p.set(15 + Math.round(hs), 20 + oy, RED);
  // near leg
  leg(pose.legA, pose.kneeA, 0);
  // loincloth
  for (let y = Math.floor(hip.y - 2); y <= hip.y + 3; y++) for (let x = 8; x <= 15; x++) {
    const w = 3.6 - Math.max(0, y - hip.y) * 0.45;
    if (Math.abs(x + 0.5 - 11.8 + pose.legA * 2) > w) continue;
    p.set(x, y, p.shade(LEATHER, 0.6 - (x - 11) * 0.06, x, y));
  }
  // torso (profile): fur vest, chest skin at the front edge
  const ty0 = 12 + oy, ty1 = hip.y - 1;
  for (let y = ty0; y <= ty1; y++) for (let x = 8; x <= 15; x++) {
    const front = 8.6 + (y - ty0) * 0.05, backX = 14.6;
    if (x + 0.5 < front || x + 0.5 > backX) continue;
    const u = (x + 0.5 - front) / (backX - front);
    if (u < 0.28 && y < ty1 - 1) p.set(x, y, p.shade(SKIN, 0.62 - u, x, y));
    else p.set(x, y, p.shade(FUR, 0.66 - u * 0.4 + ((x * 7 + y * 3) % 5 === 0 ? 0.18 : 0), x, y));
  }
  for (let x = 8; x <= 14; x++) p.set(x, ty1, LEATHER[2]);
  p.set(9, ty0 + 2, BONE[3]); p.set(9, ty0 + 3, BONE[1]); p.set(10, ty0 + 2, LEATHER[0]);
  // near arm
  arm(pose.armL, 0.02, pose.reach);
  // head (profile)
  const hy = 7 + oy;
  p.blob(10.4, hy + 0.3, 3.3, 3.8, SKIN, { bias: 0.02 });
  p.set(7, hy + 1, SKIN[3]); p.set(7, hy + 2, SKIN[2]); // nose
  for (let y = hy - 5; y <= hy + 4; y++) for (let x = 7; x <= 15; x++) {
    const d = Math.hypot((x + 0.5 - 11.2) / 4.2, (y + 0.5 - (hy - 0.4)) / 4.5);
    if (d <= 1 && (y < hy - 1 || x > 11)) p.set(x, y, p.shade(HAIR, 0.62 - (x - 8) * 0.05 - (y - hy + 5) * 0.03, x, y));
  }
  if (pose.blink) p.set(9, hy + 1, SKIN[1]); else { p.set(9, hy + 1, EYE); p.set(9, hy, SKIN[4]); }
  p.set(9, hy + 2, RED); p.set(10, hy + 2, RED_L); p.set(8, hy + 3, SKIN[0]);
  for (let x = 8; x <= 14; x++) p.set(x, hy - 2, x === 12 ? BONE[3] : RED);
  feathers(p, 13, hy - 3, pose.hair, true);
  p.selout(0.3);
  return p.toCanvas();
}

function mirror(c: HTMLCanvasElement) {
  const m = document.createElement('canvas');
  m.width = c.width; m.height = c.height;
  const ctx = m.getContext('2d')!;
  ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0);
  return m;
}

export function paintTribalPlayer(): PlayerFrames {
  const out = {} as PlayerFrames;
  const poses: Record<Anim, (f: number) => Pose> = { idle: idlePose, walk: walkPose, gather: gatherPose };
  const counts: Record<Anim, number> = { idle: 4, walk: 6, gather: 4 };
  for (const a of ['idle', 'walk', 'gather'] as Anim[]) {
    const n = counts[a];
    const down: HTMLCanvasElement[] = [], up: HTMLCanvasElement[] = [], left: HTMLCanvasElement[] = [];
    for (let f = 0; f < n; f++) {
      const pose = poses[a](f);
      down.push(paintFront(pose, false));
      up.push(paintFront(pose, true));
      left.push(paintSide(pose));
    }
    out[a] = { down, up, left, right: left.map(mirror) };
  }
  return out;
}
