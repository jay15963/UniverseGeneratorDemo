// Animated pixel-art dioramas behind the creature: the primordial soup, the sea, the abyss, the
// shore, the home world's plains and, for each era, the skyline the species has built.
import { Genome, Stage } from './genome';
import { hsl } from './raster';
import { mulberry, seedToInt } from '../terrain/noise';

type Ctx = CanvasRenderingContext2D;
const css = (c: [number, number, number], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Banded vertical gradient (pixel-art style: flat steps, dithered seams). */
function bands(ctx: Ctx, W: number, y0: number, y1: number, top: [number, number, number], bot: [number, number, number], steps = 8) {
  const h = (y1 - y0) / steps;
  for (let i = 0; i < steps; i++) {
    const c = mix(top, bot, i / (steps - 1));
    ctx.fillStyle = css(c);
    ctx.fillRect(0, Math.floor(y0 + i * h), W, Math.ceil(h) + 1);
    if (i > 0) { // checker dither on the seam
      const p = mix(top, bot, (i - 1) / (steps - 1));
      ctx.fillStyle = css(p);
      const y = Math.floor(y0 + i * h);
      for (let x = (i & 1); x < W; x += 2) ctx.fillRect(x, y, 1, 1);
    }
  }
}

export const GROUND_Y = (H: number) => Math.round(H * 0.83);

export function drawBackdrop(ctx: Ctx, W: number, H: number, stage: Stage, g: Genome, t: number) {
  const p = g.params;
  const rnd = mulberry(seedToInt(g.seed + ':bg:' + stage));
  const starC = hsl(0.02 + p.star * 0.58, 0.5 + (1 - Math.abs(p.star - 0.5)) * 0.2, 0.62);
  ctx.imageSmoothingEnabled = false;
  const gy = GROUND_Y(H);

  if (stage === Stage.CELL) {
    bands(ctx, W, 0, H, hsl(0.42, 0.45, 0.2), hsl(0.5, 0.5, 0.07), 10);
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * W + t * (4 + rnd() * 6)) % W, y = (rnd() * H + Math.sin(t + i) * 3 + H) % H;
      ctx.fillStyle = css(hsl(0.35 + rnd() * 0.2, 0.4, 0.45), 0.35 + rnd() * 0.3);
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
    // other cells drifting out of focus
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * W + t * 3 * (i % 2 ? 1 : -1) + W) % W, y = rnd() * H, r = 4 + rnd() * 9;
      ctx.fillStyle = css(hsl(0.3 + rnd() * 0.3, 0.35, 0.35), 0.18);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.7 + rnd() * 0.3), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css(hsl(0.35, 0.4, 0.5), 0.25); ctx.lineWidth = 1; ctx.stroke();
    }
    return;
  }

  if (stage === Stage.AQUA_LARVA || stage === Stage.AQUA) {
    const surf = hsl(0.5 + (p.star - 0.5) * 0.1, 0.55, 0.45), deep = hsl(0.58, 0.6, 0.12);
    bands(ctx, W, 0, H, surf, deep, 9);
    // god rays
    for (let i = 0; i < 5; i++) {
      const x = ((i * 61 + t * 6) % (W + 60)) - 30;
      ctx.fillStyle = 'rgba(210,245,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, 0); ctx.lineTo(x + 48, H); ctx.lineTo(x + 26, H); ctx.fill();
    }
    // sea floor, kelp, rocks
    ctx.fillStyle = css(hsl(0.12, 0.3, 0.3)); ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = css(hsl(0.12, 0.3, 0.38)); for (let x = 0; x < W; x += 3) ctx.fillRect(x, H - 10 - ((x * 7) % 3 === 0 ? 1 : 0), 2, 1);
    for (let i = 0; i < 9; i++) {
      const bx = rnd() * W, hgt = 18 + rnd() * 40, col = hsl(0.28 + rnd() * 0.12, 0.5, 0.22 + rnd() * 0.1);
      ctx.fillStyle = css(col);
      for (let y = 0; y < hgt; y++) { const sx = Math.sin(t * 1.4 + y * 0.12 + i) * (y / hgt) * 4; ctx.fillRect(Math.round(bx + sx), H - 10 - y, 2, 1); if (y % 6 === 3) ctx.fillRect(Math.round(bx + sx) + 2, H - 10 - y, 2, 1); }
    }
    for (let i = 0; i < 5; i++) { const x = rnd() * W; ctx.fillStyle = css(hsl(0.6, 0.1, 0.25)); ctx.beginPath(); ctx.ellipse(x, H - 10, 6 + rnd() * 8, 4 + rnd() * 4, 0, Math.PI, 0); ctx.fill(); }
    bubbles(ctx, W, H, t, rnd, 16);
    return;
  }

  if (stage === Stage.AQUA_LEVIATHAN) {
    // the abyss: black water, a hydrothermal field glowing far below, drifting glow and marine snow
    bands(ctx, W, 0, H, hsl(0.64, 0.6, 0.07), hsl(0.68, 0.6, 0.015), 10);
    const vx = W * 0.25;
    for (let r = 60; r > 0; r -= 6) { ctx.fillStyle = css(hsl(0.06, 0.9, 0.35), 0.02 + (60 - r) / 60 * 0.06); ctx.beginPath(); ctx.ellipse(vx, H, r * 2.2, r, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = css(hsl(0.05, 0.2, 0.08)); ctx.fillRect(0, H - 8, W, 8);
    for (let i = 0; i < 4; i++) { const x = vx - 30 + i * 22, h = 14 + (i % 2) * 10; ctx.fillStyle = css(hsl(0.06, 0.25, 0.12)); ctx.fillRect(x, H - 8 - h, 6, h); ctx.fillStyle = css(hsl(0.07, 0.95, 0.5), 0.6 + 0.3 * Math.sin(t * 3 + i)); ctx.fillRect(x + 2, H - 9 - h, 2, 2); }
    for (let i = 0; i < 110; i++) { const x = (rnd() * W + Math.sin(t * 0.4 + i) * 2 + W) % W, y = (rnd() * H + t * (1.5 + rnd() * 2)) % H; ctx.fillStyle = `rgba(190,210,255,${0.1 + rnd() * 0.25})`; ctx.fillRect(x | 0, y | 0, 1, 1); }
    for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H * 0.85; ctx.fillStyle = css(hsl(g.glowHue, 0.9, 0.65), 0.25 + 0.35 * Math.sin(t * 1.7 + i * 1.3)); ctx.fillRect(x | 0, y | 0, 1, 1); }
    return;
  }
  if (stage === Stage.AQUA_GIANT) {
    bands(ctx, W, 0, H, hsl(0.6, 0.55, 0.13), hsl(0.64, 0.6, 0.03), 8);
    for (let i = 0; i < 90; i++) { // marine snow
      const x = (rnd() * W + Math.sin(t * 0.5 + i) * 2 + W) % W, y = (rnd() * H + t * (2 + rnd() * 3)) % H;
      ctx.fillStyle = `rgba(200,220,255,${0.15 + rnd() * 0.3})`; ctx.fillRect(x | 0, y | 0, 1, 1);
    }
    for (let i = 0; i < 3; i++) { // distant silhouettes
      const x = ((rnd() * W - t * (2 + i)) % (W + 80) + W + 80) % (W + 80) - 40, y = 20 + rnd() * (H - 60);
      ctx.fillStyle = 'rgba(10,20,40,0.55)';
      ctx.beginPath(); ctx.ellipse(x, y, 18 + i * 6, 5 + i * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 18 - i * 6, y); ctx.lineTo(x - 30 - i * 8, y - 6); ctx.lineTo(x - 30 - i * 8, y + 6); ctx.fill();
    }
    for (let i = 0; i < 14; i++) { const x = rnd() * W, y = rnd() * H; ctx.fillStyle = css(hsl(g.glowHue, 0.9, 0.65), 0.3 + 0.3 * Math.sin(t * 2 + i)); ctx.fillRect(x | 0, y | 0, 1, 1); }
    return;
  }

  // ---- surface scenes: sky, sun, far layers ----
  const skyTop = mix(hsl(0.6 + (p.star - 0.5) * 0.2, 0.55, 0.35 + p.atmosphere * 0.1), starC, 0.15);
  const skyBot = mix(hsl(0.55, 0.4, 0.7), starC, 0.45);
  const civ = stage >= Stage.TRIBAL;
  if (stage === Stage.SPACE) {
    bands(ctx, W, 0, H, [4, 6, 16], [14, 12, 34], 6);
    for (let i = 0; i < 140; i++) { const b = rnd(); ctx.fillStyle = `rgba(255,255,255,${0.25 + b * 0.7 * (0.8 + 0.2 * Math.sin(t * 3 + i))})`; ctx.fillRect(rnd() * W | 0, rnd() * gy | 0, 1, 1); }
    // home planet on the horizon
    const pr = W * 0.55, pc = hsl(0.3 + p.water * 0.25, 0.45, 0.4);
    ctx.fillStyle = css(pc); ctx.beginPath(); ctx.arc(W * 0.72, gy + pr * 0.72, pr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css(mix(pc, [180, 220, 255], 0.6), 0.8); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = css(hsl(0.1, 0.35, 0.45), 0.8);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(W * 0.72 + (rnd() - 0.5) * pr, gy + pr * 0.35 + rnd() * 20, 8 + rnd() * 18, 3 + rnd() * 5, 0, 0, Math.PI * 2); ctx.fill(); }
    // station deck
    ctx.fillStyle = '#3a4150'; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = '#556072'; ctx.fillRect(0, gy, W, 1);
    for (let x = 0; x < W; x += 16) { ctx.fillStyle = '#2b313d'; ctx.fillRect(x, gy + 1, 1, H - gy); ctx.fillStyle = (Math.floor(t * 2) + x / 16) % 5 === 0 ? '#7df' : '#1b2029'; ctx.fillRect(x + 7, gy + 4, 2, 1); }
    return;
  }
  bands(ctx, W, 0, gy, skyTop, skyBot, 9);
  // sun (colour of the star)
  const sx = W * 0.8, sy = H * 0.2, sr = 6 + (1 - p.star) * 8;
  ctx.fillStyle = css(starC, 0.25); ctx.beginPath(); ctx.arc(sx, sy, sr * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css(mix(starC, [255, 255, 240], 0.5)); ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  // clouds
  if (p.atmosphere > 0.2) for (let i = 0; i < 4; i++) {
    const x = ((rnd() * W + t * (2 + i)) % (W + 60)) - 30, y = 10 + rnd() * H * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + p.atmosphere * 0.25})`;
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(x + k * 6), Math.round(y - (k % 2) * 2), 14, 4);
  }

  if (stage === Stage.AMPHIBIAN || stage === Stage.AMPHIBIAN_GIANT) {
    const sea = hsl(0.53, 0.5, 0.38);
    ctx.fillStyle = css(sea); ctx.fillRect(0, gy - 26, W, 26);
    ctx.fillStyle = css(mix(sea, [255, 255, 255], 0.35));
    for (let x = 0; x < W; x += 5) ctx.fillRect(x, gy - 26 + ((x + Math.floor(t * 4)) % 3), 3, 1);
    const sand = hsl(0.11, 0.35, 0.6);
    ctx.fillStyle = css(sand); ctx.fillRect(0, gy - 2, W, H - gy + 2);
    // wet sand + foam line that ebbs and flows
    const tide = Math.sin(t * 0.8) * 3;
    ctx.fillStyle = css(mix(sand, sea, 0.4)); ctx.fillRect(0, gy - 3, W * 0.45 + tide * 3, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let x = 0; x < W * 0.45 + tide * 3; x += 2) ctx.fillRect(x, gy - 3 + (x % 4 === 0 ? 1 : 0), 1, 1);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = css(hsl(0.6, 0.08, 0.35)); ctx.beginPath(); ctx.ellipse(rnd() * W, gy + 4 + rnd() * 10, 4 + rnd() * 6, 2 + rnd() * 3, 0, 0, Math.PI * 2); ctx.fill(); }
    return;
  }

  // far hills tinted by climate
  const landH = p.temperature > 0.7 && p.water < 0.4 ? 0.09 : p.temperature < 0.25 ? 0.58 : 0.28 - p.water * 0.02;
  const landS = p.temperature < 0.25 ? 0.15 : 0.35 + p.water * 0.2;
  for (let layer = 0; layer < 2; layer++) {
    const base = gy - 26 + layer * 12;
    ctx.fillStyle = css(mix(hsl(landH, landS, 0.3 + (1 - layer) * 0.12), skyBot, 0.55 - layer * 0.3));
    for (let x = 0; x < W; x++) {
      const hh = Math.sin(x * 0.03 + layer * 2 + g.r[5] * 6) * 8 + Math.sin(x * 0.011 + layer) * 10;
      ctx.fillRect(x, base - hh, 1, gy - base + hh);
    }
  }
  if (civ) skyline(ctx, W, gy, stage, g, t, rnd);
  // ground
  const grd = hsl(landH, landS, p.temperature < 0.25 ? 0.82 : 0.34);
  bands(ctx, W, gy, H, grd, mix(grd, [0, 0, 0], 0.4), 4);
  if (stage === Stage.MODERN || stage === Stage.CONTEMPORARY || stage === Stage.FUTURIST || stage === Stage.INDUSTRIAL) {
    // paved street / cobbles
    const pave = stage === Stage.INDUSTRIAL ? [92, 84, 78] as [number, number, number] : stage === Stage.FUTURIST ? [40, 46, 64] as [number, number, number] : [70, 72, 78] as [number, number, number];
    ctx.fillStyle = css(pave); ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = css(mix(pave, [255, 255, 255], 0.2)); ctx.fillRect(0, gy, W, 1);
    if (stage === Stage.INDUSTRIAL) for (let y = gy + 2; y < H; y += 3) for (let x = (y % 2) * 2; x < W; x += 5) { ctx.fillStyle = css(mix(pave, [0, 0, 0], 0.3)); ctx.fillRect(x, y, 1, 1); }
    else for (let x = 0; x < W; x += 24) { ctx.fillStyle = stage === Stage.FUTURIST ? css(hsl(g.glowHue, 0.9, 0.6), 0.8) : '#d8d0a0'; ctx.fillRect(x, H - 8, 12, 1); }
  } else {
    // grass tufts / pebbles
    const tuft = hsl(landH, landS + 0.1, p.temperature < 0.25 ? 0.92 : 0.45);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W | 0, y = gy + 1 + (rnd() * (H - gy - 2)) | 0;
      ctx.fillStyle = css(tuft, 0.9);
      const sw = Math.round(Math.sin(t * 2 + x * 0.1));
      ctx.fillRect(x, y - 2, 1, 2); ctx.fillRect(x + 1 + sw, y - 3, 1, 3);
    }
  }
  if (stage === Stage.TRIBAL) campfire(ctx, W * 0.2, gy + 6, t);
}

function bubbles(ctx: Ctx, W: number, H: number, t: number, rnd: () => number, n: number) {
  for (let i = 0; i < n; i++) {
    const x0 = rnd() * W, sp = 8 + rnd() * 14, ph = rnd() * H;
    const y = H - ((t * sp + ph) % H), x = x0 + Math.sin(t * 2 + i) * 2;
    const r = rnd() < 0.3 ? 2 : 1;
    ctx.fillStyle = 'rgba(220,245,255,0.55)';
    if (r === 1) ctx.fillRect(x | 0, y | 0, 1, 1);
    else { ctx.fillRect((x | 0) - 1, y | 0, 3, 1); ctx.fillRect(x | 0, (y | 0) - 1, 1, 3); }
  }
}

function campfire(ctx: Ctx, x: number, y: number, t: number) {
  ctx.fillStyle = '#4a3020'; ctx.fillRect(x - 6, y, 12, 2);
  const f = Math.floor(t * 8) % 3;
  const flame = [[255, 220, 110], [255, 150, 40], [220, 70, 20]];
  for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgb(${flame[i].join(',')})`; const w = 6 - i * 2, h = 8 - i * 2 + ((f + i) % 2); ctx.fillRect(x - w / 2, y - h + i, w, h - i); }
  ctx.fillStyle = 'rgba(255,160,60,0.18)'; ctx.beginPath(); ctx.arc(x, y - 3, 14, 0, Math.PI * 2); ctx.fill();
}

/** Era silhouettes on the horizon. */
function skyline(ctx: Ctx, W: number, gy: number, stage: Stage, g: Genome, t: number, rnd: () => number) {
  const fg = 'rgba(28,30,44,0.75)', mid = 'rgba(40,44,62,0.55)';
  const rect = (x: number, y: number, w: number, h: number, c = fg) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const win = (x: number, y: number, w: number, h: number, lit: string, on = 0.5) => {
    for (let yy = y + 3; yy < y + h - 2; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (rnd() < on) rect(xx, yy, 1, 2, lit);
  };
  switch (stage) {
    case Stage.TRIBAL:
      for (let i = 0; i < 3; i++) { const x = W * (0.55 + i * 0.13), h = 14 + i * 3; ctx.fillStyle = mid; ctx.beginPath(); ctx.moveTo(x - h * 0.6, gy); ctx.lineTo(x, gy - h); ctx.lineTo(x + h * 0.6, gy); ctx.fill(); rect(x - 1, gy - h - 3, 1, 4, mid); rect(x + 1, gy - h - 2, 1, 3, mid); }
      rect(W * 0.9, gy - 26, 3, 26); rect(W * 0.9 - 2, gy - 26, 7, 4); rect(W * 0.9 - 2, gy - 18, 7, 3);
      break;
    case Stage.MEDIEVAL: {
      const x = W * 0.58;
      rect(x, gy - 28, 60, 28); for (let i = 0; i < 60; i += 6) rect(x + i, gy - 31, 3, 3);
      rect(x - 8, gy - 44, 14, 44); rect(x + 54, gy - 40, 12, 40);
      for (const tx of [x - 8, x + 54]) { ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(tx - 2, tx === x - 8 ? gy - 44 : gy - 40); ctx.lineTo(tx + 7, (tx === x - 8 ? gy - 44 : gy - 40) - 12); ctx.lineTo(tx + 16, tx === x - 8 ? gy - 44 : gy - 40); ctx.fill(); }
      rect(x - 1, gy - 60, 1, 5, '#b33'); rect(x, gy - 60, 5, 3, `hsl(${g.culture.hue * 360},60%,45%)`);
      win(x, gy - 26, 60, 20, 'rgba(255,200,110,0.8)', 0.25);
      break;
    }
    case Stage.RENAISSANCE: {
      const x = W * 0.6;
      rect(x, gy - 30, 50, 30); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x + 25, gy - 30, 16, Math.PI, 0); ctx.fill(); rect(x + 24, gy - 52, 2, 6);
      rect(x - 16, gy - 46, 10, 46); ctx.beginPath(); ctx.moveTo(x - 18, gy - 46); ctx.lineTo(x - 11, gy - 62); ctx.lineTo(x - 4, gy - 46); ctx.fill();
      // a galleon on the far water
      const sx = W * 0.2 + Math.sin(t * 0.3) * 3;
      rect(sx - 14, gy - 16, 28, 5, mid); rect(sx - 1, gy - 38, 2, 22, mid);
      for (let i = 0; i < 3; i++) rect(sx - 8 + i, gy - 34 + i * 7, 16 - i * 2, 5, 'rgba(230,225,210,0.55)');
      break;
    }
    case Stage.INDUSTRIAL:
      for (let i = 0; i < 5; i++) {
        const x = W * 0.45 + i * 26, h = 20 + (i % 3) * 8;
        rect(x, gy - h, 22, h); for (let k = 0; k < 22; k += 7) { ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x + k, gy - h); ctx.lineTo(x + k + 7, gy - h - 5); ctx.lineTo(x + k + 7, gy - h); ctx.fill(); }
        if (i % 2 === 0) { rect(x + 14, gy - h - 22, 4, 22); for (let s = 0; s < 6; s++) { const yy = gy - h - 24 - s * 5 - ((t * 6) % 5), xx = x + 16 + s * 2 + Math.sin(t + s) * 2; ctx.fillStyle = `rgba(90,90,100,${0.4 - s * 0.06})`; ctx.beginPath(); ctx.arc(xx, yy, 3 + s, 0, Math.PI * 2); ctx.fill(); } }
        win(x, gy - h, 22, h, 'rgba(255,190,90,0.7)', 0.3);
      }
      break;
    case Stage.MODERN:
      for (let i = 0; i < 7; i++) {
        const x = W * 0.3 + i * 25, h = 30 + ((i * 37) % 5) * 9, w = 18;
        rect(x, gy - h, w, h, i % 2 ? fg : mid); rect(x + 4, gy - h - 6, w - 8, 6, i % 2 ? fg : mid); rect(x + w / 2 - 1, gy - h - 14, 2, 8, i % 2 ? fg : mid);
        win(x, gy - h, w, h, 'rgba(255,230,160,0.6)', 0.35);
      }
      break;
    case Stage.CONTEMPORARY:
      for (let i = 0; i < 8; i++) {
        const x = W * 0.25 + i * 24, h = 36 + ((i * 53) % 6) * 10, w = 20;
        rect(x, gy - h, w, h, i % 2 ? 'rgba(40,60,90,0.7)' : 'rgba(60,80,110,0.6)');
        for (let yy = gy - h + 2; yy < gy; yy += 3) rect(x + 1, yy, w - 2, 1, 'rgba(160,200,240,0.25)');
      }
      rect(W * 0.15, gy - 70, 2, 70, mid); rect(W * 0.15 - 6, gy - 70, 14, 2, mid);
      break;
    case Stage.FUTURIST: {
      const neon = `hsl(${g.glowHue * 360},90%,60%)`;
      for (let i = 0; i < 7; i++) {
        const x = W * 0.25 + i * 27, h = 44 + ((i * 29) % 5) * 12, w = 14 + (i % 3) * 4;
        ctx.fillStyle = 'rgba(20,24,44,0.85)'; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w * 0.2, gy - h); ctx.lineTo(x + w * 0.8, gy - h - 8); ctx.lineTo(x + w, gy); ctx.fill();
        rect(x + w * 0.5, gy - h - 4, 1, h, neon);
        if (i % 2) rect(x + 2, gy - h * 0.6, w - 4, 1, neon);
      }
      for (let i = 0; i < 3; i++) { const x = ((t * (20 + i * 9) + i * 90) % (W + 40)) - 20, y = 20 + i * 12; rect(x, y, 6, 2, 'rgba(220,230,255,0.8)'); rect(x - 4, y + 1, 4, 1, neon); }
      break;
    }
    default: break;
  }
}
