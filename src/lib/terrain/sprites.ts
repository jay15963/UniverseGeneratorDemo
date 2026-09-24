// Procedural pixel-art painter for every survival asset. No image files: each sprite is
// drawn pixel by pixel from palettes, lit from the upper-left, dithered and sel-outlined.
import { Pix } from './pixelKit';
import { Feat } from './types';
import { LEAF, BARK, ROCK_RAMPS, RockType, RGB, ramp, hex, shiftRamp, mixRGB, darken } from './palettes';
import { mulberry, hash3 } from './noise';

export interface Sprite {
  c: HTMLCanvasElement;
  ax: number;       // anchor (ground contact) inside the sprite
  ay: number;
  shadow: number;   // ground shadow half-width (px); 0 = none
  tall: boolean;    // can occlude the player (drawn translucent when the player is behind)
}

const BERRY = {
  blue: ramp('#1b2154', '#2f3f96', '#5670d6', '#a9bbff'),
  red: ramp('#5a0c19', '#a8192e', '#e2434f', '#ffb0a8'),
  black: ramp('#140b1c', '#2e1a40', '#57356f', '#a384c0'),
};

export class SpriteBank {
  private cache = new Map<string, Sprite>();
  private vegShift: number;

  constructor(vegShift: number) { this.vegShift = vegShift; }

  private leaf(r: RGB[]) { return this.vegShift ? shiftRamp(r, this.vegShift) : r; }

  private fast = new Map<number, Sprite>(); // numeric keys: no string building in the render loop

  get(t: Feat, v: number, empty = false): Sprite {
    const key = (t * 4096 + v) * 2 + (empty ? 1 : 0);
    let s = this.fast.get(key);
    if (!s) { s = this.paint(t, v, empty); this.fast.set(key, s); }
    return s;
  }

  private paint(t: Feat, v: number, empty: boolean): Sprite {
    const seed = hash3(t, v, 7771);
    switch (t) {
      case Feat.OAK: return v >= 4 ? this.broadleaf(seed, this.leaf(LEAF.jungle), BARK.oak, 1.1) : this.broadleaf(seed, this.leaf(LEAF.oak), BARK.oak, 1);
      case Feat.MAPLE: return this.broadleaf(seed, this.leaf(v < 2 ? shiftRamp(LEAF.oak, 14) : v === 2 ? LEAF.maple : shiftRamp(LEAF.maple, -14)), BARK.oak, 0.95);
      case Feat.BIRCH: return this.birch(seed);
      case Feat.PINE: return this.conifer(seed, this.leaf(LEAF.pine), false, v >= 4);
      case Feat.SPRUCE: return this.conifer(seed, this.leaf(LEAF.spruce), true, v >= 4);
      case Feat.ACACIA: return this.acacia(seed);
      case Feat.KAPOK: return this.kapok(seed);
      case Feat.PALM: return this.palm(seed);
      case Feat.WILLOW: return this.willow(seed);
      case Feat.DEAD_TREE: return this.deadTree(seed);
      case Feat.BUSH: return this.bush(seed, this.leaf(v >= 4 ? LEAF.jungle : LEAF.bush), null);
      case Feat.BERRY_BLUE: return this.bush(seed, this.leaf(LEAF.bush), empty ? null : BERRY.blue);
      case Feat.BERRY_RED: return this.bush(seed, this.leaf(LEAF.bush), empty ? null : BERRY.red);
      case Feat.BERRY_BLACK: return this.bush(seed, this.leaf(shiftRamp(LEAF.bush, -8)), empty ? null : BERRY.black);
      case Feat.TALL_GRASS: return this.tallGrass(seed, v);
      case Feat.FERN: return this.fern(seed, v >= 4);
      case Feat.REEDS: return this.reeds(seed, false);
      case Feat.CATTAIL: return this.reeds(seed, true);
      case Feat.FLAX: return this.flax(seed);
      case Feat.FLOWER: return this.flower(seed, Math.floor(v / 3));
      case Feat.MUSHROOM: return this.mushroom(seed, Math.floor(v / 3), v % 3);
      case Feat.WILD_CROP: return this.crop(seed, Math.floor(v / 2));
      case Feat.CACTUS: return this.cactus(seed, v);
      case Feat.DEAD_BUSH: return this.deadBush(seed);
      case Feat.LILY_PAD: return this.lily(seed, v === 3);
      case Feat.STICK: return this.stick(seed, v >= 3);
      case Feat.LOOSE_STONE: return this.stones(seed, ROCK_RAMPS[Math.floor(v / 3) as RockType], (v % 3) + 1);
      case Feat.FLINT: return this.flint(seed);
      case Feat.NUGGET_COPPER: return this.nugget(seed, ramp('#4a1c0c', '#8a3f1a', '#c96b2e', '#f0a060', '#ffe0b0'), ramp('#1f5a3a', '#2f8a5a', '#5ac48a'));
      case Feat.NUGGET_TIN: return this.nugget(seed, ramp('#120d0a', '#2a1f18', '#46362a', '#6e5a48', '#b8a898'), null, true);
      case Feat.NUGGET_GOLD: return this.goldQuartz(seed);
      case Feat.LIMONITE: return this.nugget(seed, ramp('#3a1a08', '#6b3410', '#9c5418', '#c47a2a', '#e0a050'), null);
      case Feat.SEASHELL: return this.shell(seed, v);
      case Feat.BOULDER: return this.boulder(seed, ROCK_RAMPS[(v % 8) as RockType], (v & 8) !== 0, (v & 16) !== 0);
      case Feat.FALLEN_LOG: return this.log(seed, v >= 4 ? BARK.pine : BARK.oak);
      case Feat.STUMP: return this.stump(seed);
      case Feat.ICE_CRYSTAL: return this.crystals(seed, ramp('#3f7aa8', '#6fb0d8', '#a8dcf2', '#e4f7ff', '#ffffff'));
      case Feat.OBSIDIAN: return this.crystals(seed, ramp('#07060a', '#15121c', '#2a2436', '#4c4262', '#9a8cc0'));
      case Feat.SULFUR: return this.crystals(seed, ramp('#6b5a08', '#a88f10', '#dcc424', '#f6e866', '#fffbc4'));
      case Feat.DIAMOND: return this.crystals(seed, ramp('#5a8aa8', '#a0d0e8', '#d8f4ff', '#ffffff', '#ffffff'));
      case Feat.SALT_CRYSTAL: return this.crystals(seed, ramp('#a89898', '#d0c4c4', '#ece4e4', '#fff8f8', '#ffffff'));
    }
    return this.stones(seed, ROCK_RAMPS[RockType.GRANITE], 1);
  }

  private done(p: Pix, ax: number, ay: number, shadow: number, tall: boolean, outline = true): Sprite {
    if (outline) p.selout();
    return { c: p.toCanvas(), ax, ay, shadow, tall };
  }

  // ---------------------------------------------------------------------------
  // Trees
  // ---------------------------------------------------------------------------
  private trunk(p: Pix, x: number, yBase: number, yTop: number, w: number, bark: RGB[], roots = 2) {
    const rng = p.rng;
    for (let y = yTop; y <= yBase; y++) {
      const taper = (y - yTop) / Math.max(1, yBase - yTop);
      const ww = w + Math.round(taper * taper * roots);
      for (let i = 0; i < ww; i++) {
        const u = i / Math.max(1, ww - 1);
        let v = 0.85 - u * 0.75 + (rng() - 0.5) * 0.15;
        if (((x + i) * 7 + (y >> 1) * 3) % 5 === 0 && rng() > 0.4) v -= 0.3; // bark furrows
        p.set(x - Math.floor(ww / 2) + i, y, p.shade(bark, v, x + i, y));
      }
    }
  }

  private broadleaf(seed: number, leaves: RGB[], bark: RGB[], scale: number, accent?: RGB[]): Sprite {
    const W = Math.round(46 * scale), H = Math.round(48 * scale);
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    const cr = 15 * scale;              // canopy radius
    const ccy = cr + 2;                 // canopy centre
    const canopyBottom = ccy + cr * 0.75;
    this.trunk(p, Math.round(cx), base, Math.round(ccy), 4, bark, 3);
    // branches into the canopy
    p.line(cx, ccy + cr * 0.45, cx - cr * 0.6, ccy - 1, (t, x, y) => p.shade(bark, 0.7 - t * 0.3, x, y), 2);
    p.line(cx + 1, ccy + cr * 0.4, cx + cr * 0.55, ccy + 1, (t, x, y) => p.shade(bark, 0.3, x, y), 2);
    // back ring of clumps, then a front arc, then the crown
    const clumps: [number, number, number, number][] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4;
      const d = cr * (0.55 + rng() * 0.12);
      clumps.push([cx + Math.cos(a) * d, ccy + Math.sin(a) * d * 0.72, cr * (0.4 + rng() * 0.12), -0.04]);
    }
    for (let i = 0; i < 3; i++) clumps.push([cx + (i - 1) * cr * 0.45 + (rng() - 0.5) * 2, ccy + cr * 0.35, cr * 0.42, -0.02]);
    clumps.push([cx - 1, ccy - cr * 0.2, cr * 0.55, 0.05]);
    clumps.push([cx - cr * 0.3, ccy - cr * 0.45, cr * 0.4, 0.1]);
    clumps.sort((a, b) => a[1] - b[1]);
    const colored = accent && rng() < 0.5 ? accent : leaves;
    for (const [x, y, r, b] of clumps) {
      p.blob(x, y, r, r * 0.88, colored, { bias: b, rough: 0.3, rim: 1, global: { cx, cy: ccy - 2, r: cr * 1.2, w: 0.5 } });
    }
    p.leafMarks(colored, Math.round(cr * cr * 0.5), (x, y) => -(x - cx) / cr * 0.6 - (y - ccy) / cr * 0.8, 0, 0, W, canopyBottom + 3);
    // canopy shadow on the trunk
    for (let y = Math.round(canopyBottom); y < canopyBottom + 3; y++) for (let x = Math.round(cx - 3); x <= cx + 3; x++) {
      if (p.alpha(x, y) && !p.alpha(x, y - 8)) continue;
      const k = (y * W + x) * 4;
      if (p.d[k + 3] && p.d[k + 1] < p.d[k] + 10) { p.d[k] *= 0.6; p.d[k + 1] *= 0.6; p.d[k + 2] *= 0.6; }
    }
    return this.done(p, Math.round(cx), base, Math.round(cr * 0.95), true);
  }

  private birch(seed: number): Sprite {
    const W = 34, H = 58;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3, cr = 11, ccy = 15;
    // white trunk with black lenticels
    for (let y = ccy; y <= base; y++) {
      for (let i = 0; i < 3; i++) {
        const c = BARK.birch[i === 0 ? 4 : i === 1 ? 3 : 1];
        p.set(cx - 1 + i, y, c);
      }
      if (rng() < 0.28) { const x0 = cx - 1 + Math.floor(rng() * 2); p.set(x0, y, BARK.birch[0]); p.set(x0 + 1, y, BARK.birch[0]); }
    }
    p.set(cx - 2, base, BARK.birch[2]); p.set(cx + 2, base, BARK.birch[1]);
    const leaves = this.leaf(LEAF.birch);
    const clumps: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) {
      clumps.push([cx + (rng() - 0.5) * cr * 1.3, ccy - cr * 0.6 + rng() * cr * 1.7, 4 + rng() * 3]);
    }
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of clumps) p.blob(x, y, r, r * 1.1, leaves, { rough: 0.4, holes: 0.05, rim: 1, global: { cx, cy: ccy + 3, r: cr * 1.4, w: 0.5 } });
    p.leafMarks(leaves, 40, (x, y) => -(x - cx) / cr - (y - ccy) / cr);
    return this.done(p, Math.round(cx), base, 9, true);
  }

  private conifer(seed: number, leaves: RGB[], spruce: boolean, snow: boolean): Sprite {
    const W = spruce ? 30 : 36, H = spruce ? 62 : 58;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    const trunkTop = base - (spruce ? 7 : 11);
    this.trunk(p, Math.round(cx), base, trunkTop - 4, spruce ? 3 : 3, BARK.pine, 2);
    const tiers = spruce ? 7 : 5;
    const top = 4, bottom = trunkTop;
    const maxHW = spruce ? 13 : 16;
    const th = (bottom - top) / tiers * (spruce ? 1.9 : 2.1);
    // leader tip above the crown
    for (let y = 1; y < top + 2; y++) p.set(cx - 0.5, y, leaves[y < 2 ? 4 : 3]);
    for (let k = 0; k < tiers; k++) {
      // draw bottom tier first; upper tiers overlap the lower ones; the top tier ends exactly at `top`
      const t = 1 - k / tiers;
      const yb = top + th + (bottom - top - th) * (1 - k / (tiers - 1));
      const hw = maxHW * (spruce ? t * 0.95 + 0.12 : Math.pow(t, 0.8) * 0.9 + 0.12);
      for (let y = Math.floor(yb - th); y <= yb + 1; y++) {
        const fy = (y - (yb - th)) / th; // 0 top .. 1 bottom of tier
        const half = hw * Math.pow(Math.max(0, fy), spruce ? 0.9 : 0.7);
        for (let x = Math.floor(cx - half - 1); x <= Math.ceil(cx + half + 1); x++) {
          const dx = (x + 0.5 - cx) / Math.max(1, half);
          if (Math.abs(dx) > 1) continue;
          // jagged hanging branch tips on the lower edge
          if (fy > 0.82 && ((x * 3 + k) % 3 === 0) === (rng() > 0.3)) continue;
          let v = 0.55 - dx * 0.35 - fy * 0.25 + (rng() - 0.5) * 0.18;
          if (fy > 0.88) v -= 0.18;
          p.set(x, y, p.shade(leaves, v, x, y));
        }
      }
      // needle highlights along the upper-left of each tier
      for (let i = 0; i < hw * 1.4; i++) {
        const x = Math.round(cx - rng() * hw * 0.9), y = Math.round(yb - th * 0.35 + rng() * th * 0.5);
        if (p.alpha(x, y)) p.set(x, y, leaves[leaves.length - 1 - Math.floor(rng() * 2)]);
      }
      if (snow) {
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          if (rng() < 0.3 || Math.abs(x - cx) > hw - 1.5) continue;
          for (let y = Math.floor(yb - th * 0.45); y <= yb; y++) {
            if (p.alpha(x, y) && !p.alpha(x, y - 1)) { p.set(x, y, hex('#eef4fa')); if (rng() > 0.5) p.set(x, y + 1, hex('#c8d8e8')); break; }
          }
        }
      }
    }
    return this.done(p, Math.round(cx), base, spruce ? 10 : 12, true);
  }

  private acacia(seed: number): Sprite {
    const W = 58, H = 50;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    this.trunk(p, Math.round(cx), base, 30, 3, BARK.oak, 2);
    const fork = (dx: number) => p.line(cx, 31, cx + dx, 16, (t, x, y) => p.shade(BARK.oak, 0.6 - t * 0.2 + (dx > 0 ? -0.2 : 0), x, y), 2);
    fork(-10); fork(9); p.line(cx, 28, cx + 2, 17, BARK.oak[2], 2);
    const leaves = this.leaf(LEAF.acacia);
    // flat, layered umbrella canopy
    const layers: [number, number, number, number][] = [
      [cx - 12, 14, 13, 5], [cx + 11, 14, 13, 5], [cx, 12, 17, 6], [cx - 5, 9, 11, 4], [cx + 7, 10, 10, 4],
    ];
    for (const [x, y, rx, ry] of layers) p.blob(x, y, rx, ry, leaves, { rough: 0.5, holes: 0.04, global: { cx, cy: 10, r: 24, w: 0.4 } });
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rng() * W), y = Math.floor(rng() * 20);
      if (p.alpha(x, y)) p.set(x, y, leaves[rng() > 0.5 ? 5 : 1]);
    }
    return this.done(p, Math.round(cx), base, 20, true);
  }

  private kapok(seed: number): Sprite {
    const W = 68, H = 78;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    this.trunk(p, Math.round(cx), base, 30, 6, BARK.kapok, 4);
    // buttress roots
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const len = 6 + k * 4;
      p.line(cx + s * 2, base - 10 - k * 3, cx + s * (4 + len), base, (t, x, y) => p.shade(BARK.kapok, s < 0 ? 0.7 : 0.3, x, y), 2);
    }
    const leaves = this.leaf(LEAF.jungle);
    const cr = 22, ccy = 24;
    const clumps: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, d = cr * (0.25 + rng() * 0.55);
      clumps.push([cx + Math.cos(a) * d * 1.2, ccy + Math.sin(a) * d * 0.7, 8 + rng() * 5]);
    }
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of clumps) p.blob(x, y, r, r * 0.85, leaves, { rough: 0.35, rim: 1, global: { cx, cy: ccy, r: cr * 1.3, w: 0.55 } });
    p.leafMarks(leaves, 160, (x, y) => -(x - cx) / cr * 0.6 - (y - ccy) / cr * 0.8);
    // hanging lianas
    const vine = this.leaf(LEAF.fern);
    for (let i = 0; i < 7; i++) {
      const x = Math.round(cx - cr + rng() * cr * 2);
      let y = ccy + 6;
      while (y < H && p.alpha(x, y)) y++;
      const len = 6 + Math.floor(rng() * 14);
      for (let k = 0; k < len; k++) {
        p.set(x + (k % 7 === 3 ? 1 : 0), y + k, vine[1 + ((k >> 1) & 1)]);
        if (k % 4 === 1) p.set(x + 1, y + k, vine[3]);
      }
    }
    return this.done(p, Math.round(cx), base, 24, true);
  }

  private palm(seed: number): Sprite {
    const W = 48, H = 60;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const base = H - 3;
    const lean = (rng() - 0.5) * 16;
    const topX = W / 2 + lean, topY = 16;
    const bx = W / 2;
    // curved ringed trunk
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = bx + (topX - bx) * (t * t * 0.4 + t * 0.6);
      const y = base + (topY - base) * t;
      const ring = (i % 3) === 0;
      for (let k = -2; k <= 1; k++) {
        const v = 0.75 - (k + 2) * 0.2 - (ring ? 0.25 : 0);
        p.set(Math.round(x + k), Math.round(y), p.shade(BARK.palm, v, Math.round(x + k), Math.round(y)));
      }
    }
    const leaves = this.leaf(LEAF.palm);
    // coconuts
    for (let i = 0; i < 3; i++) p.blob(topX - 2 + i * 2, topY + 3 + (i % 2), 2, 2, ramp('#3b2410', '#6b4420', '#9a6a34', '#c89a5a'), {});
    // fronds
    const n = 8;
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + rng() * 0.3;
      const L = 15 + rng() * 6;
      const dirx = Math.cos(a), diry = Math.sin(a) * 0.55 - 0.35;
      let px = topX, py = topY;
      for (let s = 0; s <= L; s++) {
        const t = s / L;
        const x = topX + dirx * s, y = topY + diry * s + t * t * 9; // droop
        const v = 0.55 + (-dirx * 0.2 - diry * 0.3) * (1 - t) - t * 0.2;
        p.set(Math.round(x), Math.round(y), p.shade(leaves, v, Math.round(x), Math.round(y)));
        // leaflets
        const lw = Math.round((1 - t) * 3.5 + 1);
        const nx = -(y - py), ny = x - px;
        const nl = Math.hypot(nx, ny) || 1;
        for (const side of [-1, 1]) {
          for (let k = 1; k <= lw; k++) {
            const lx = Math.round(x + (nx / nl) * k * side + dirx * k * 0.4), ly = Math.round(y + (ny / nl) * k * side + k * 0.5);
            p.set(lx, ly, p.shade(leaves, v - 0.1 + (side < 0 ? 0.1 : -0.05), lx, ly));
          }
        }
        px = x; py = y;
      }
    }
    return this.done(p, Math.round(bx), base, 12, true);
  }

  private willow(seed: number): Sprite {
    const W = 54, H = 58;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3, ccy = 18, cr = 17;
    this.trunk(p, Math.round(cx), base, 28, 5, BARK.oak, 3);
    const leaves = this.leaf(LEAF.willow);
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, d = cr * rng() * 0.5;
      p.blob(cx + Math.cos(a) * d, ccy + Math.sin(a) * d * 0.6 - 2, 8 + rng() * 4, 7 + rng() * 3, leaves, { rough: 0.35, rim: 1, global: { cx, cy: ccy, r: cr * 1.2, w: 0.6 } });
    }
    // drooping curtains of leaves
    for (let x = Math.floor(cx - cr - 2); x <= cx + cr + 2; x++) {
      if (rng() < 0.25) continue;
      const dx = (x - cx) / (cr + 2);
      const start = Math.round(ccy - Math.sqrt(Math.max(0, 1 - dx * dx)) * 6 + 4);
      const len = Math.round((1 - Math.abs(dx) * 0.5) * (14 + rng() * 14));
      for (let k = 0; k < len; k++) {
        const y = start + k;
        if (y >= base - 2) break;
        const v = 0.62 - dx * 0.3 - (k / len) * 0.35 + (rng() - 0.5) * 0.2;
        p.set(x, y, p.shade(leaves, v, x, y));
      }
    }
    return this.done(p, Math.round(cx), base, 18, true);
  }

  private deadTree(seed: number): Sprite {
    const W = 40, H = 52;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    this.trunk(p, Math.round(cx), base, 20, 3, BARK.dead, 2);
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      p.line(x, y, x2, y2, (t, px, py) => p.shade(BARK.dead, 0.6 - (Math.cos(a) > 0 ? 0.25 : 0), px, py), w);
      if (depth <= 0) return;
      branch(x2, y2, a - 0.4 - rng() * 0.3, len * 0.7, Math.max(1, w - 1), depth - 1);
      if (rng() > 0.25) branch(x2, y2, a + 0.4 + rng() * 0.3, len * 0.65, Math.max(1, w - 1), depth - 1);
    };
    branch(cx, 22, -Math.PI / 2 - 0.2, 10, 2, 3);
    branch(cx, 26, -Math.PI / 2 + 0.7, 8, 2, 2);
    branch(cx, 30, -Math.PI / 2 - 0.9, 7, 1, 2);
    return this.done(p, Math.round(cx), base, 7, true);
  }

  // ---------------------------------------------------------------------------
  // Shrubs & plants
  // ---------------------------------------------------------------------------
  private bush(seed: number, leaves: RGB[], berries: RGB[] | null): Sprite {
    const W = 22, H = 18;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 2;
    const clumps: [number, number, number][] = [];
    for (let i = 0; i < 5; i++) clumps.push([cx + (rng() - 0.5) * 10, base - 5 - rng() * 5, 3.5 + rng() * 2.5]);
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of clumps) p.blob(x, y, r, r * 0.9, leaves, { rough: 0.35, rim: 1, global: { cx, cy: base - 7, r: 9, w: 0.5 } });
    p.leafMarks(leaves, 10, (x, y) => -(x - cx) / 9 - (y - (base - 7)) / 7);
    if (berries) {
      for (let i = 0; i < 9; i++) {
        const x = Math.round(cx + (rng() - 0.5) * 14), y = Math.round(base - 3 - rng() * 9);
        if (!p.alpha(x, y) || !p.alpha(x + 1, y + 1)) continue;
        p.set(x, y, berries[2]); p.set(x + 1, y, berries[1]); p.set(x, y + 1, berries[1]); p.set(x + 1, y + 1, berries[0]);
        p.set(x, y, berries[3]);
      }
    }
    return this.done(p, Math.round(cx), base, 7, false);
  }

  private tallGrass(seed: number, v: number): Sprite {
    const W = 14, H = 16;
    const p = new Pix(W, H, seed + v);
    const rng = p.rng;
    const dry = v >= 3 && v < 6, tundra = v >= 6;
    const g = dry ? this.leaf(LEAF.dryGrass) : tundra ? shiftRamp(this.leaf(LEAF.grass), -18, 0.6) : this.leaf(LEAF.grass);
    const base = H - 1;
    const blades = 8 + Math.floor(rng() * 4);
    for (let b = 0; b < blades; b++) {
      const x0 = 2 + rng() * 10, h = 6 + rng() * (dry ? 9 : 8), lean = (rng() - 0.5) * 5;
      for (let k = 0; k <= h; k++) {
        const t = k / h;
        const x = x0 + lean * t * t, y = base - k;
        p.set(Math.round(x), Math.round(y), p.shade(g, 0.15 + t * 0.8 + (rng() - 0.5) * 0.1, Math.round(x), Math.round(y)));
      }
      if ((dry || rng() < 0.3) && rng() < 0.6) {
        const tx = Math.round(x0 + lean), ty = Math.round(base - h);
        const seedC = dry ? hex('#f0dc98') : hex('#d8d49a');
        p.set(tx, ty - 1, seedC); p.set(tx, ty, seedC); p.set(tx + 1, ty, darken(seedC, 0.8));
      }
    }
    return this.done(p, 7, base, 0, false, false);
  }

  private fern(seed: number, tropical: boolean): Sprite {
    const W = tropical ? 26 : 22, H = tropical ? 18 : 15;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const g = this.leaf(tropical ? LEAF.jungle : LEAF.fern);
    const cx = W / 2, base = H - 1;
    const fronds = 7;
    for (let f = 0; f < fronds; f++) {
      const a = Math.PI + (f / (fronds - 1)) * Math.PI + (rng() - 0.5) * 0.2; // fan upwards
      const L = (tropical ? 11 : 9) + rng() * 3;
      for (let s = 0; s <= L; s++) {
        const t = s / L;
        const x = cx + Math.cos(a) * s, y = base + Math.sin(a) * s * 0.75 + t * t * 4;
        const v = 0.45 + (-Math.cos(a) * 0.2) + (1 - t) * 0.1;
        p.set(Math.round(x), Math.round(y), p.shade(g, v - 0.15, Math.round(x), Math.round(y)));
        if (s % 2 === 0 && s > 1) {
          const lw = Math.max(1, Math.round((1 - t) * 3));
          for (let k = 1; k <= lw; k++) {
            p.set(Math.round(x - Math.sin(a) * k), Math.round(y + Math.cos(a) * k * 0.6 - k * 0.3), p.shade(g, v + 0.15, Math.round(x), Math.round(y) + k));
            p.set(Math.round(x + Math.sin(a) * k), Math.round(y - Math.cos(a) * k * 0.6 - k * 0.3), p.shade(g, v, Math.round(x) + k, Math.round(y)));
          }
        }
      }
    }
    return this.done(p, Math.round(cx), base, 6, false);
  }

  private reeds(seed: number, cattail: boolean): Sprite {
    const W = 14, H = 24;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const g = this.leaf(LEAF.willow);
    const base = H - 1;
    const stalks = 5 + Math.floor(rng() * 3);
    for (let s = 0; s < stalks; s++) {
      const x0 = 2 + rng() * 10, h = 12 + rng() * 9, lean = (rng() - 0.5) * 3;
      for (let k = 0; k <= h; k++) {
        const t = k / h;
        const x = Math.round(x0 + lean * t), y = base - k;
        p.set(x, y, p.shade(g, 0.25 + t * 0.6, x, y));
      }
      const tx = Math.round(x0 + lean), ty = Math.round(base - h);
      if (cattail && rng() < 0.75) {
        const brown = ramp('#2a160a', '#4e2a12', '#744220', '#9a6334');
        for (let k = 0; k < 5; k++) { p.set(tx, ty + 2 + k, brown[k === 0 ? 3 : 1 + (k & 1)]); p.set(tx + 1, ty + 2 + k, brown[0]); }
        p.set(tx, ty, g[3]); p.set(tx, ty + 1, g[2]);
      } else if (!cattail && rng() < 0.6) {
        const plume = ramp('#6a5a3a', '#9a8660', '#c8b58a', '#e8dcb8');
        p.set(tx, ty - 1, plume[2]); p.set(tx - 1, ty, plume[1]); p.set(tx, ty, plume[3]); p.set(tx + 1, ty + 1, plume[1]); p.set(tx, ty + 1, plume[2]);
      }
      // a leaf
      if (rng() < 0.6) p.line(x0, base - h * 0.4, x0 + (rng() > 0.5 ? 4 : -4), base - h * 0.7, g[3]);
    }
    return this.done(p, 7, base, 0, false, false);
  }

  private flax(seed: number): Sprite {
    const W = 12, H = 17;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const g = this.leaf(LEAF.birch);
    const base = H - 1;
    for (let s = 0; s < 6; s++) {
      const x0 = 2 + rng() * 8, h = 9 + rng() * 5;
      for (let k = 0; k <= h; k++) p.set(Math.round(x0 + (k > h * 0.6 ? (s % 2 ? 1 : -1) : 0)), base - k, p.shade(g, 0.3 + (k / h) * 0.5, 0, k));
      if (rng() < 0.8) {
        const fx = Math.round(x0 + (s % 2 ? 1 : -1)), fy = Math.round(base - h - 1);
        const blue = ramp('#2c3f9a', '#4f6ed6', '#8ea8ff', '#e0e8ff');
        p.set(fx, fy, blue[3]); p.set(fx - 1, fy, blue[1]); p.set(fx + 1, fy, blue[2]); p.set(fx, fy - 1, blue[2]); p.set(fx, fy + 1, blue[0]);
      }
    }
    return this.done(p, 6, base, 0, false, false);
  }

  private flower(seed: number, sp: number): Sprite {
    const W = 14, H = 16;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const stem = this.leaf(LEAF.grass);
    const base = H - 1;
    const n = sp === 6 ? 5 : 2 + Math.floor(rng() * 3);
    const heads: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x0 = 3 + rng() * 8, h = sp === 3 ? 9 + rng() * 4 : sp === 6 ? 3 + rng() * 2 : 5 + rng() * 6;
      for (let k = 0; k <= h; k++) p.set(Math.round(x0), base - k, stem[1 + (k > h / 2 ? 1 : 0)]);
      if (rng() < 0.7) { p.set(Math.round(x0) - 1, base - Math.round(h * 0.4), stem[3]); p.set(Math.round(x0) + 1, base - Math.round(h * 0.3), stem[2]); }
      heads.push([Math.round(x0), Math.round(base - h)]);
    }
    const PAL: RGB[][] = [
      ramp('#9a7a08', '#e6c21a', '#fff06a', '#fffbd0'), // dandelion
      ramp('#5a0808', '#b8141a', '#ec3a32', '#ff9a86'), // poppy
      ramp('#1a2a7a', '#3450c8', '#6a8cff', '#c0d0ff'), // cornflower
      ramp('#3a145a', '#6a2aa0', '#a060d8', '#dcb8ff'), // lupine
      ramp('#a8a49a', '#e8e6de', '#ffffff', '#ffffff'), // daisy
      ramp('#6a0a4a', '#c0287a', '#f06ab0', '#ffd0ea'), // orchid
      ramp('#4a1a4a', '#8a3a8a', '#c06ac0', '#f0b0f0'), // heather
    ];
    const c = PAL[sp] ?? PAL[0];
    for (const [x, y] of heads) {
      if (sp === 3) { for (let k = 0; k < 5; k++) { p.set(x, y + k, c[k % 2 ? 1 : 2]); if (k < 4) p.set(x + (k % 2 ? -1 : 1), y + k, c[k === 0 ? 3 : 1]); } continue; }
      if (sp === 6) { p.set(x, y, c[2]); p.set(x + 1, y, c[1]); p.set(x, y - 1, c[3]); continue; }
      p.set(x - 1, y, c[1]); p.set(x + 1, y, c[1]); p.set(x, y - 1, c[2]); p.set(x, y + 1, c[0]); p.set(x, y, c[3]);
      if (sp === 1) p.set(x, y, hex('#1a1010'));
      if (sp === 4 || sp === 2) { p.set(x - 1, y - 1, c[2]); p.set(x + 1, y - 1, c[2]); p.set(x, y, hex(sp === 4 ? '#f0c020' : '#20308a')); }
      if (sp === 5) { p.set(x - 1, y - 1, c[3]); p.set(x + 1, y + 1, c[1]); }
    }
    return this.done(p, 7, base, 0, false, false);
  }

  private mushroom(seed: number, sp: number, sub: number): Sprite {
    const W = 14, H = 12;
    const p = new Pix(W, H, seed + sub);
    const rng = p.rng;
    const base = H - 1;
    const count = 1 + (sub === 2 ? 2 : sub);
    const CAP: RGB[][] = [
      ramp('#5a0a08', '#a8140e', '#e0301c', '#ff7a5a'),
      ramp('#3a200e', '#6a3e1c', '#94602c', '#c08a48'),
      ramp('#7a3a04', '#c06a0a', '#f09a1c', '#ffd060'),
      ramp('#9a9488', '#c8c2b4', '#e8e4d8', '#ffffff'),
    ];
    const stemC = ramp('#8a8070', '#c8c0ac', '#e8e2d0', '#ffffff');
    for (let i = 0; i < count; i++) {
      const x = 3 + Math.round(rng() * 8), s = i === 0 ? 1 : 0.7;
      const capR = sp === 3 ? 2.2 * s : (sp === 1 ? 3 : 2.6) * s;
      const stemH = sp === 3 ? 0 : Math.round((sp === 2 ? 3 : 4) * s);
      if (stemH) for (let k = 0; k < stemH; k++) { p.set(x, base - k, stemC[2]); p.set(x + 1, base - k, stemC[1]); if (sp === 1) p.set(x - 1, base - k, stemC[3]); }
      const cy = base - stemH - (sp === 3 ? 1.5 : 1);
      p.blob(x + 0.5, cy, capR + 0.5, sp === 2 ? capR * 0.55 : capR * 0.75, CAP[sp], { speck: 0.05 });
      if (sp === 0) { p.set(x - 1, Math.round(cy) - 1, hex('#ffffff')); p.set(x + 1, Math.round(cy), hex('#f4f0e8')); p.set(x + 2, Math.round(cy) - 1, hex('#ffffff')); }
    }
    return this.done(p, 7, base, 4, false);
  }

  private crop(seed: number, kind: number): Sprite {
    const W = 16, H = 16;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const base = H - 2;
    const g = this.leaf(LEAF.grass);
    const cx = 8;
    if (kind === 0) { // carrot: feathery fronds + orange shoulder
      for (let f = 0; f < 6; f++) { const a = -Math.PI / 2 + (f - 2.5) * 0.35; p.line(cx, base - 1, cx + Math.cos(a) * 9, base - 1 + Math.sin(a) * 9, (t, x, y) => p.shade(g, 0.4 + t * 0.5, x, y)); }
      p.rect(cx - 1, base - 1, 3, 2, hex('#e8741a')); p.set(cx - 1, base - 1, hex('#ffa84a'));
    } else if (kind === 1) { // onion
      for (let f = 0; f < 4; f++) p.line(cx - 1 + f * 0.7, base - 2, cx - 4 + f * 2.5, base - 12 + rng() * 2, (t, x, y) => p.shade(g, 0.3 + t * 0.6, x, y));
      p.blob(cx, base - 1, 2.5, 2, ramp('#6a3a5a', '#a86a8a', '#e0b8c8', '#fff0f4'), {});
    } else if (kind === 2) { // turnip
      for (let f = 0; f < 4; f++) p.blob(cx - 4 + f * 2.7, base - 6 - (f % 2) * 2, 2.6, 3.2, g, { rough: 0.3 });
      p.blob(cx, base - 1, 3, 2.4, ramp('#5a1a5a', '#9a4a9a', '#e0c0e0', '#ffffff'), {});
    } else if (kind === 3) { // pumpkin with vine
      p.line(1, base - 1, 15, base - 3, g[2]);
      p.blob(4, base - 5, 2.5, 2.2, g, {}); p.blob(13, base - 6, 2.5, 2.2, g, {});
      p.blob(cx, base - 3, 5, 3.8, ramp('#6a2a04', '#b85a0a', '#ec8a1c', '#ffc05a'), {});
      for (let k = -1; k <= 1; k += 2) for (let y = base - 5; y <= base - 1; y++) p.set(cx + k * 2, y, hex('#9a4a08'));
      p.set(cx, base - 7, g[1]); p.set(cx, base - 8, g[2]);
    } else { // wild wheat
      const gold = ramp('#6a5010', '#a8841c', '#d8b440', '#f4de84');
      for (let s = 0; s < 6; s++) {
        const x0 = 3 + s * 2 + rng(), h = 9 + rng() * 4;
        for (let k = 0; k <= h; k++) p.set(Math.round(x0), base - k, gold[k > h - 4 ? 3 : 1]);
        for (let k = 0; k < 4; k++) { p.set(Math.round(x0) - 1, Math.round(base - h + k), gold[2]); p.set(Math.round(x0) + 1, Math.round(base - h + k + 1), gold[1]); }
      }
    }
    return this.done(p, 8, base, 4, false);
  }

  private cactus(seed: number, v: number): Sprite {
    const W = 20, H = 28;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const g = this.leaf(ramp('#1c3a1a', '#2c5a28', '#3f7a34', '#5a9a44', '#7cba5a', '#a8d87a'));
    const cx = 10, base = H - 2;
    const col = (x0: number, y0: number, y1: number, w: number) => {
      for (let y = y0; y <= y1; y++) for (let i = 0; i < w; i++) {
        const u = i / (w - 1);
        let vv = 0.85 - u * 0.7;
        if (i % 2 === 1) vv -= 0.15; // ribs
        if (y === y0) vv += 0.1;
        p.set(x0 + i, y, p.shade(g, vv, x0 + i, y));
      }
    };
    col(cx - 2, 5, base, 5);
    if (v % 2 === 0) { col(cx - 7, 11, 16, 3); col(cx - 5, 15, 16, 3); }
    if (v < 2) { col(cx + 4, 8, 14, 3); col(cx + 2, 13, 14, 3); }
    for (let i = 0; i < 18; i++) { const x = Math.floor(rng() * W), y = Math.floor(rng() * H); if (p.alpha(x, y)) p.set(x, y, hex('#f0ecc8')); }
    if (v === 3) { p.set(cx, 4, hex('#ff5a9a')); p.set(cx - 1, 4, hex('#d0306a')); p.set(cx + 1, 4, hex('#ff9ac0')); }
    return this.done(p, cx, base, 5, true);
  }

  private deadBush(seed: number): Sprite {
    const W = 18, H = 14;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const br = ramp('#3a2414', '#5a3a20', '#7a5430', '#9a7246');
    const base = H - 1;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (rng() - 0.5) * 2.4;
      const L = 5 + rng() * 6;
      const x1 = 9 + Math.cos(a) * L, y1 = base + Math.sin(a) * L;
      p.line(9, base, x1, y1, br[1 + Math.floor(rng() * 3)]);
      p.line(x1, y1, x1 + (rng() - 0.5) * 5, y1 - 2 - rng() * 2, br[2]);
    }
    return this.done(p, 9, base, 5, false, false);
  }

  private lily(seed: number, flower: boolean): Sprite {
    const W = 14, H = 10;
    const p = new Pix(W, H, seed);
    const g = this.leaf(LEAF.oak);
    const cx = 7, cy = 5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / 5.5, dy = (y + 0.5 - cy) / 3.6;
      if (dx * dx + dy * dy > 1) continue;
      if (Math.abs(Math.atan2(dy, dx) - 0.6) < 0.25) continue; // notch
      p.set(x, y, p.shade(g, 0.55 - dx * 0.2 - dy * 0.3, x, y));
    }
    p.line(cx, cy, cx - 3, cy - 1, g[4]); p.line(cx, cy, cx + 2, cy + 2, g[1]);
    if (flower) { const f = ramp('#a8306a', '#f070a8', '#ffc0dc', '#ffffff'); p.blob(cx - 1, cy - 2, 2.2, 1.8, f, {}); p.set(cx - 1, cy - 2, hex('#ffe060')); }
    return this.done(p, cx, cy + 2, 0, false);
  }

  // ---------------------------------------------------------------------------
  // Loose resources
  // ---------------------------------------------------------------------------
  private stick(seed: number, drift: boolean): Sprite {
    const W = 16, H = 10;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const bark = drift ? ramp('#6a6258', '#9a9284', '#c4bcac', '#e4ddce') : ramp('#2e1c0e', '#553519', '#7a5028', '#a0703c');
    const flip = rng() > 0.5;
    const x0 = 2, y0 = flip ? 3 : 7, x1 = 13, y1 = flip ? 7 : 3;
    p.line(x0, y0, x1, y1, (t, x, y) => bark[2]);
    p.line(x0, y0 + 1, x1, y1 + 1, (t, x, y) => bark[1]);
    p.set(x0, y0, bark[3]);
    const fx = 6 + Math.round(rng() * 3);
    const fy = Math.round(y0 + (y1 - y0) * (fx - x0) / (x1 - x0));
    p.line(fx, fy, fx + 2, fy - 3, bark[2]);
    p.set(x1, y1, bark[3]);
    return this.done(p, 8, 7, 5, false);
  }

  private stones(seed: number, rock: RGB[], n: number): Sprite {
    const W = 12, H = 9;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? 1 : 0.7;
      p.blob(4 + rng() * 4, 5 - i * 0.5, 2.8 * s, 2 * s, rock, { rough: 0.3, bias: 0.05 });
    }
    return this.done(p, 6, 7, 4, false);
  }

  private flint(seed: number): Sprite {
    const W = 11, H = 9;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const r = ramp('#0a0a0c', '#1c1c22', '#34343e', '#5a5a68', '#a0a0b0');
    const pts: [number, number][] = [[2, 6], [4, 2], [8, 1], [9, 5], [6, 7]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      const conch = Math.sin(Math.hypot(x - 3, y - 6) * 1.8) * 0.15;
      p.set(x, y, p.shade(r, 0.4 - (x - 5) * 0.03 - (y - 4) * 0.06 + conch + (rng() - 0.5) * 0.1, x, y));
    }
    p.line(4, 2, 8, 1, r[4]); p.set(4, 3, r[3]);
    return this.done(p, 5, 7, 4, false);
  }

  private nugget(seed: number, metal: RGB[], patina: RGB[] | null, crystal = false): Sprite {
    const W = 10, H = 8;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    p.blob(5, 4.5, 3.3, 2.5, metal, { rough: 0.5, speck: 0.3 });
    p.blob(3, 5, 1.8, 1.5, metal, { bias: -0.1 });
    if (patina) for (let i = 0; i < 4; i++) { const x = 3 + Math.floor(rng() * 5), y = 3 + Math.floor(rng() * 3); if (p.alpha(x, y)) p.set(x, y, patina[1 + Math.floor(rng() * 2)]); }
    if (crystal) { p.set(4, 2, metal[4]); p.set(6, 3, metal[4]); p.line(5, 2, 5, 5, metal[0]); }
    p.set(4, 3, metal[metal.length - 1]);
    return this.done(p, 5, 6, 3, false);
  }

  private goldQuartz(seed: number): Sprite {
    const W = 11, H = 9;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    p.blob(5.5, 5, 3.8, 2.8, ramp('#9a948a', '#c8c4ba', '#e8e6e0', '#ffffff'), { rough: 0.4 });
    const gold = ramp('#7a5a08', '#c8960e', '#f6d23a', '#fff4a8');
    for (let i = 0; i < 6; i++) { const x = 3 + Math.floor(rng() * 6), y = 3 + Math.floor(rng() * 4); if (p.alpha(x, y)) { p.set(x, y, gold[2]); p.set(x + 1, y, gold[1]); } }
    p.set(5, 3, gold[3]);
    return this.done(p, 5, 7, 4, false);
  }

  private shell(seed: number, v: number): Sprite {
    const W = 9, H = 7;
    const p = new Pix(W, H, seed);
    const c = v % 2 ? ramp('#a8706a', '#e0a8a0', '#f8d8d0', '#ffffff') : ramp('#a89878', '#d8ccb0', '#f0e8d8', '#ffffff');
    if (v < 2) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - 4.5) / 4, dy = (y + 0.5 - 5.5) / 5;
        if (dx * dx + dy * dy > 1 || y > 5) continue;
        const ridge = Math.round(Math.atan2(dy, dx) * 3) % 2 === 0;
        p.set(x, y, c[ridge ? 2 : 1]);
      }
      p.set(4, 6, c[0]);
    } else {
      p.blob(4, 4, 3, 2, c, {});
      p.line(2, 4, 6, 3, c[0]); p.set(6, 3, c[3]);
    }
    return this.done(p, 4, 5, 2, false);
  }

  // ---------------------------------------------------------------------------
  // Big objects
  // ---------------------------------------------------------------------------
  private boulder(seed: number, rock: RGB[], moss: boolean, snow: boolean): Sprite {
    const W = 28, H = 22;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cx = W / 2, base = H - 3;
    p.blob(cx - 4, base - 7, 8, 6.5, rock, { rough: 0.25, global: { cx, cy: base - 9, r: 12, w: 0.6 } });
    p.blob(cx + 4, base - 6, 7, 5.5, rock, { rough: 0.25, bias: -0.05, global: { cx, cy: base - 9, r: 12, w: 0.6 } });
    p.blob(cx - 1, base - 11, 6.5, 5.5, rock, { rough: 0.25, bias: 0.08, global: { cx, cy: base - 9, r: 12, w: 0.6 } });
    // cracks
    let x = cx - 2 + rng() * 4, y = base - 14;
    for (let i = 0; i < 8; i++) { if (p.alpha(Math.round(x), Math.round(y))) p.set(x, y, rock[0]); x += (rng() - 0.5) * 2; y += 1; }
    const top = (xx: number) => { for (let yy = 0; yy < H; yy++) if (p.alpha(xx, yy)) return yy; return -1; };
    if (moss || snow) {
      const mr = snow ? ramp('#b8c8d8', '#dce6f0', '#f4f8fc', '#ffffff') : this.leaf(LEAF.moss);
      for (let xx = 0; xx < W; xx++) {
        const t0 = top(xx);
        if (t0 < 0) continue;
        const depth = snow ? 2 + Math.round(rng() * 2) : Math.round(rng() * 3);
        for (let k = 0; k < depth; k++) if (p.alpha(xx, t0 + k)) p.set(xx, t0 + k, mr[Math.min(mr.length - 1, 3 - k)]);
      }
    }
    return this.done(p, Math.round(cx), base, 12, true);
  }

  private log(seed: number, bark: RGB[]): Sprite {
    const W = 34, H = 14;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const cy = 8, r = 4, x0 = 3, x1 = 27;
    for (let x = x0; x <= x1; x++) for (let y = cy - r; y <= cy + r; y++) {
      const t = (y - (cy - r)) / (2 * r);
      let v = 0.85 - t * 0.8 + (rng() - 0.5) * 0.1;
      if ((x * 5 + y * 2) % 7 === 0) v -= 0.25;
      p.set(x, y, p.shade(bark, v, x, y));
    }
    // cut end with growth rings
    const ring = ramp('#6a4a28', '#a07a48', '#c8a070', '#e0c090');
    for (let y = cy - r; y <= cy + r; y++) for (let x = x1 - 2; x <= x1 + 3; x++) {
      const dx = (x - x1) / 2.6, dy = (y - cy) / r;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      p.set(x, y, d > 0.85 ? bark[1] : ring[Math.floor(d * 6) % 2 ? 1 : 2]);
    }
    p.line(10, cy - r, 8, cy - r - 3, bark[2], 1); // branch stub
    for (let i = 0; i < 10; i++) { const x = x0 + Math.floor(rng() * (x1 - x0 - 3)); p.set(x, cy - r + Math.floor(rng() * 2), this.leaf(LEAF.moss)[2 + Math.floor(rng() * 2)]); }
    if (rng() < 0.5) { p.set(14, cy - r - 1, hex('#e0301c')); p.set(15, cy - r - 1, hex('#a8140e')); p.set(14, cy - r, hex('#e8e2d0')); }
    return this.done(p, 16, cy + r, 14, false);
  }

  private stump(seed: number): Sprite {
    const W = 16, H = 14;
    const p = new Pix(W, H, seed);
    const bark = BARK.oak;
    const cx = 8, base = H - 2;
    for (let y = 5; y <= base; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const u = (x - (cx - 4)) / 8;
      p.set(x, y, p.shade(bark, 0.8 - u * 0.7, x, y));
    }
    p.set(cx - 5, base, bark[2]); p.set(cx + 5, base, bark[1]); p.set(cx - 5, base - 1, bark[2]);
    const ring = ramp('#6a4a28', '#a07a48', '#c8a070', '#e0c090');
    for (let y = 2; y <= 7; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const d = Math.hypot((x - cx) / 4.2, (y - 4.5) / 2.2);
      if (d > 1) continue;
      p.set(x, y, d > 0.8 ? bark[2] : ring[Math.floor(d * 5) % 2 ? 1 : 3]);
    }
    return this.done(p, cx, base, 6, false);
  }

  private crystals(seed: number, c: RGB[]): Sprite {
    const W = 12, H = 12;
    const p = new Pix(W, H, seed);
    const rng = p.rng;
    const base = H - 2;
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const x0 = 3 + rng() * 6, h = 4 + rng() * 5, lean = (rng() - 0.5) * 3, w = 2;
      for (let k = 0; k <= h; k++) {
        const t = k / h;
        const x = x0 + lean * t;
        const ww = k > h - 2 ? 1 : w;
        for (let j = 0; j < ww; j++) p.set(Math.round(x + j), base - k, c[j === 0 ? 3 : 1 + (k > h * 0.6 ? 1 : 0)]);
      }
      p.set(Math.round(x0 + lean), base - Math.round(h), c[4]);
    }
    return this.done(p, 6, base, 4, false);
  }

  // ---------------------------------------------------------------------------
  // Item icons that are not a feature sprite
  // ---------------------------------------------------------------------------
  icon(custom: string): HTMLCanvasElement {
    const key = 'icon|' + custom;
    const hit = this.cache.get(key);
    if (hit) return hit.c;
    const p = new Pix(16, 16, hash3(custom.length, custom.charCodeAt(0), 3));
    const rng = p.rng;
    if (custom.startsWith('berry_')) {
      const r = custom === 'berry_blue' ? BERRY.blue : custom === 'berry_red' ? BERRY.red : BERRY.black;
      for (let i = 0; i < 6; i++) p.blob(4 + rng() * 8, 5 + rng() * 7, 2.4, 2.4, r, { speck: 0.05 });
      p.set(8, 4, this.leaf(LEAF.bush)[3]); p.set(9, 3, this.leaf(LEAF.bush)[4]);
    } else if (custom.startsWith('crop_')) {
      const k = Number(custom.slice(5));
      const g = this.leaf(LEAF.grass);
      if (k === 0) { p.line(5, 3, 10, 13, hex('#e8741a'), 3); p.line(5, 3, 9, 12, hex('#ffa84a')); p.line(5, 3, 2, 0, g[3]); p.line(5, 3, 6, 0, g[2]); }
      else if (k === 1) { p.blob(8, 10, 4.5, 4, ramp('#6a3a5a', '#a86a8a', '#e0b8c8', '#fff0f4'), {}); p.line(8, 6, 7, 1, g[3]); p.line(8, 6, 10, 2, g[2]); }
      else if (k === 2) { p.blob(8, 10, 4.5, 4, ramp('#5a1a5a', '#9a4a9a', '#e0c0e0', '#ffffff'), {}); p.blob(6, 4, 2, 3, g, {}); p.blob(10, 4, 2, 3, g, {}); }
      else if (k === 3) { p.blob(8, 9, 6, 5, ramp('#6a2a04', '#b85a0a', '#ec8a1c', '#ffc05a'), {}); p.rect(8, 2, 1, 3, g[1]); }
      else { const gold = ramp('#6a5010', '#a8841c', '#d8b440', '#f4de84'); for (let s = 0; s < 4; s++) { p.line(4 + s * 2, 15, 6 + s * 2, 2, gold[1]); p.line(5 + s * 2, 6, 6 + s * 2, 1, gold[3]); } }
    }
    p.selout();
    const s: Sprite = { c: p.toCanvas(), ax: 8, ay: 8, shadow: 0, tall: false };
    this.cache.set(key, s);
    return s.c;
  }
}

export { mixRGB };
