// The aquatic era's two new zooms (play mode):
//  - submerged gameplay (the local zooms): the seabed rows of the terrain workers, and over them the life of the
//    water column - slanting shafts of sunlight, marine snow drifting in three parallax layers, bubble streams from
//    the floor and a dark vignette of depth, all weighted by how much of the view is sea;
//  - aquatic regional (the far zoom): the sea's surface seen from above, the swimmers as dark shapes below it.
// Crossing between them (zooming out of / into the water) plays a short pixel-art transition: bubbles rushing,
// the wavy waterline sweeping past the camera, a splash of droplets.

const hash = (a: number, b: number, s: number) => {
  let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Underwater {
  private low = document.createElement('canvas');
  /** a transition in progress: `up` = surfacing (zooming out), else diving; t0 in seconds */
  trans: { up: boolean; t0: number } | null = null;
  static readonly TRANS = 0.95;

  /**
   * Water-column ambience over the submerged view. S = device px per world px, (tx0, ty0) = screen position of world
   * (0,0); sea = share of the view that is sea (0..1); day = 0 (night) .. 1 (noon).
   */
  ambience(ctx: CanvasRenderingContext2D, DW: number, DH: number, S: number, tx0: number, ty0: number, t: number, sea: number, day: number, dpr: number) {
    if (sea < 0.02) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const camX = (DW / 2 - tx0) / S, camY = (DH / 2 - ty0) / S;
    // sun shafts: slanted soft beams, sliding slowly with a parallax of their own
    const light = sea * (0.25 + day * 0.75);
    ctx.globalCompositeOperation = 'lighter';
    const spacing = 360 * S, par = camX * S * 0.35;
    for (let i = -1; i < DW / spacing + 2; i++) {
      const base = Math.floor(par / spacing) + i;
      const seedX = hash(base, 7, 3);
      const x = base * spacing - par + seedX * spacing * 0.6 + Math.sin(t * 0.13 + base) * 30 * S;
      const w = (60 + seedX * 130) * S * (0.8 + Math.sin(t * 0.4 + base * 2.1) * 0.2);
      const a = (0.09 + hash(base, 9, 3) * 0.09) * light;
      const g = ctx.createLinearGradient(0, 0, 0, DH);
      g.addColorStop(0, `rgba(190,240,255,${a})`); g.addColorStop(0.7, `rgba(150,220,240,${a * 0.35})`); g.addColorStop(1, 'rgba(150,220,240,0)');
      ctx.fillStyle = g;
      const slant = DH * 0.42;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + slant, DH); ctx.lineTo(x + slant, DH); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // marine snow: three layers (nearer ones bigger, faster in parallax)
    const layers = [[0.7, 0.25, 64], [1, 0.4, 50], [1.35, 0.55, 40]] as const;
    for (let li = 0; li < layers.length; li++) {
      const [f, alpha, C] = layers[li];
      const size = Math.max(1, Math.round(S * 0.5 * f));
      ctx.fillStyle = `rgba(214,236,232,${alpha * sea})`;
      const hx = DW / 2 / S / f + C, hy = DH / 2 / S / f + C;
      const lx = camX, ly = camY;
      const i0 = Math.floor((lx - hx) / C), i1 = Math.floor((lx + hx) / C), j0 = Math.floor((ly - hy) / C), j1 = Math.floor((ly + hy) / C);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        for (let k = 0; k < 2; k++) {
          const h1 = hash(i, j, li * 2 + k), h2 = hash(j, i, li * 2 + k + 11);
          // slow sinking with a sideways sway, wrapped inside the cell
          const px = i * C + ((h1 * C + Math.sin(t * 0.5 + h2 * 6) * 6 + t * 3) % C);
          const py = j * C + ((h2 * C + t * (4 + h1 * 5)) % C);
          const sx = (px - lx) * f * S + DW / 2, sy = (py - ly) * f * S + DH / 2;
          if (sx < -4 || sy < -4 || sx > DW + 4 || sy > DH + 4) continue;
          ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
        }
      }
    }
    // bubble streams from vents and burrows on the floor
    ctx.strokeStyle = `rgba(210,245,255,${0.55 * sea})`;
    ctx.lineWidth = Math.max(1, Math.round(S * 0.35));
    const BC = 260;
    const bi0 = Math.floor((camX - DW / 2 / S) / BC) - 1, bi1 = Math.floor((camX + DW / 2 / S) / BC) + 1;
    const bj0 = Math.floor((camY - DH / 2 / S) / BC) - 1, bj1 = Math.floor((camY + DH / 2 / S) / BC) + 2;
    for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) {
      if (hash(i, j, 40) > 0.35) continue;
      const ox = i * BC + hash(i, j, 41) * BC, oy = j * BC + hash(i, j, 42) * BC;
      for (let k = 0; k < 5; k++) {
        const life = ((t * (0.35 + hash(i, j, 43) * 0.2) + k / 5) % 1);
        const bx = ox + Math.sin(life * 9 + k) * 3, by = oy - life * 110;
        const [sx, sy] = [bx * S + tx0, by * S + ty0];
        if (sx < -8 || sx > DW + 8 || sy < -8 || sy > DH + 8) continue;
        const r = Math.max(1, (1 + life * 2) * S * 0.5);
        ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // the depth closes in at the edges
    const v = ctx.createRadialGradient(DW / 2, DH / 2, Math.min(DW, DH) * 0.35, DW / 2, DH / 2, Math.max(DW, DH) * 0.75);
    v.addColorStop(0, 'rgba(2,14,26,0)'); v.addColorStop(1, `rgba(2,14,26,${0.45 * sea})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, DW, DH);
    ctx.restore();
    void dpr;
  }

  /** the surfacing / diving transition over the whole screen (k = 0..1), in chunky pixels */
  transition(ctx: CanvasRenderingContext2D, DW: number, DH: number, dpr: number, k: number, up: boolean, water: [number, number, number]) {
    const P = Math.max(3, Math.round(4 * dpr));
    const w = Math.ceil(DW / P), h = Math.ceil(DH / P);
    const c = this.low;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    const [wr, wg, wb] = water;
    // the waterline's position (screen fraction): surfacing it sweeps down past the eye, diving it rises
    const lineK = up ? (k - 0.22) / 0.4 : 1 - (k - 0.28) / 0.4;
    const yLine = lineK * h;
    // water body (below the line when surfacing = still under; above when diving = already under)
    const waterA = up ? 0.55 * (1 - k) : Math.min(0.6, k * 0.9) * (1 - Math.max(0, k - 0.75) * 4);
    x.fillStyle = `rgba(${wr},${wg},${wb},${Math.max(0, waterA)})`;
    if (lineK > -0.1 && lineK < 1.1) {
      if (up) x.fillRect(0, Math.max(0, yLine), w, h); else x.fillRect(0, 0, w, Math.min(h, yLine));
    } else if ((up && lineK <= -0.1) || (!up && lineK >= 1.1)) x.fillRect(0, 0, w, h);
    // air flash above the line on the way up
    if (up && lineK > 0 && lineK < 1.2) { x.fillStyle = `rgba(230,248,255,${0.28 * (1 - k)})`; x.fillRect(0, 0, w, Math.min(h, yLine)); }
    // the wavy waterline with its foam
    if (lineK > -0.05 && lineK < 1.05) {
      for (let i = 0; i < w; i++) {
        const y = Math.round(yLine + Math.sin(i * 0.23 + k * 18) * 2 + Math.sin(i * 0.07 - k * 9) * 3);
        x.fillStyle = 'rgba(240,252,255,0.95)'; x.fillRect(i, y, 1, 2);
        x.fillStyle = `rgba(${Math.min(255, wr + 90)},${Math.min(255, wg + 90)},${Math.min(255, wb + 80)},0.8)`; x.fillRect(i, y + 2, 1, 2);
        if (hash(i, Math.floor(k * 30), 5) > 0.8) { x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(i, y - 1 - Math.floor(hash(i, 3, 6) * 3), 1, 1); }
      }
    }
    // bubbles rushing past (surfacing: they are left behind below; diving: they rise around)
    const bubbles = up ? Math.max(0, 1 - k / 0.55) : Math.max(0, Math.min(1, (k - 0.35) / 0.25)) * (1 - Math.max(0, k - 0.8) * 5);
    if (bubbles > 0) {
      for (let i = 0; i < 110; i++) {
        const bx = hash(i, 1, 9) * w, sp = 0.6 + hash(i, 2, 9) * 1.4;
        const by = up ? h - ((k * 2.2 * sp + hash(i, 3, 9)) % 1.2) * h * 1.1 : h * (1.05 - ((k * 1.6 * sp + hash(i, 3, 9)) % 1.1));
        const r = hash(i, 4, 9) > 0.8 ? 2 : 1;
        x.fillStyle = `rgba(215,248,255,${0.85 * bubbles})`;
        x.fillRect(Math.round(bx + Math.sin(k * 20 + i) * 1.5), Math.round(by), r, r);
        if (r === 2) { x.fillStyle = `rgba(255,255,255,${bubbles})`; x.fillRect(Math.round(bx), Math.round(by), 1, 1); }
      }
    }
    // a splash of droplets (surfacing: thrown up as the surface breaks; diving: the entry splash)
    const sk = up ? (k - 0.5) / 0.5 : k / 0.4;
    if (sk > 0 && sk < 1) {
      x.fillStyle = `rgba(230,250,255,${0.9 * (1 - sk)})`;
      for (let i = 0; i < 70; i++) {
        const a = hash(i, 7, 2) * Math.PI * 2, v = 0.25 + hash(i, 8, 2) * 0.55;
        const px = w / 2 + Math.cos(a) * v * sk * w * 0.7;
        const py = h / 2 + Math.sin(a) * v * sk * h * 0.6 + sk * sk * h * 0.35;
        x.fillRect(Math.round(px), Math.round(py), hash(i, 9, 2) > 0.7 ? 2 : 1, hash(i, 9, 2) > 0.7 ? 2 : 1);
      }
      if (!up) {
        // the entry ring of foam
        const rr = sk * Math.min(w, h) * 0.6;
        x.fillStyle = `rgba(245,252,255,${0.8 * (1 - sk)})`;
        for (let i = 0; i < 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          x.fillRect(Math.round(w / 2 + Math.cos(a) * rr), Math.round(h / 2 + Math.sin(a) * rr * 0.55), 2, 1);
        }
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, 0, 0, w * P, h * P);
    ctx.restore();
  }
}
