// Trailer: the creature generator montage - 20 random species (land and sea) cut every half second, one of them
// is picked from the line-up and walks through its whole lineage: cell -> sea -> shore -> land -> 8 civilisations.
import { makeGenome, Genome, Stage, CreatureParams, ColorMode } from '../../lib/creature/genome';
import { DIRS } from '../../lib/creature/pose';
import type { Anim } from '../../lib/creature/pose';
import { SpriteStore, Sheet } from '../../lib/fauna/spriteStore';
import { mulberry, seedToInt } from '../../lib/terrain/noise';

interface Specimen { g: Genome; stage: Stage; anim: Anim; key: string }

export const GALLERY_N = 20;
export const LINEAGE: Stage[] = [
  Stage.CELL, Stage.AQUA_LARVA, Stage.AQUA, Stage.AMPHIBIAN, Stage.LAND,
  Stage.TRIBAL, Stage.MEDIEVAL, Stage.RENAISSANCE, Stage.INDUSTRIAL, Stage.MODERN, Stage.CONTEMPORARY, Stage.FUTURIST, Stage.SPACE,
];
// land, sea, shore and giants take turns so the montage keeps surprising
const MIX: Stage[] = [Stage.LAND, Stage.AQUA, Stage.LAND_GIANT, Stage.AMPHIBIAN, Stage.AQUA_GIANT, Stage.LAND, Stage.AQUA, Stage.LAND, Stage.AMPHIBIAN_GIANT, Stage.AQUA];
const K = 1;
const ROW = DIRS.indexOf('SE');

const animFor = (g: Genome, stage: Stage): Anim => {
  if (stage <= Stage.AQUA_GIANT) return 'swim';
  if (stage === Stage.LAND && (g.wings !== 'none' || g.locomotion === 'flyer' || g.locomotion === 'dragon')) return 'fly';
  return 'walk';
};

export class CreatureMontage {
  readonly gallery: Specimen[] = [];
  readonly lineage: Specimen[] = [];
  /** index in the gallery of the species that evolves */
  readonly chosen: number;
  private store = new SpriteStore();

  constructor(seed: string) {
    const r = mulberry(seedToInt(seed + ':montage'));
    for (let i = 0; i < GALLERY_N; i++) {
      const stage = MIX[i % MIX.length];
      const p: CreatureParams = {
        gravity: 0.1 + r() * 0.7, temperature: r(), water: stage <= Stage.AQUA_GIANT ? 0.8 + r() * 0.2 : r(), atmosphere: 0.2 + r() * 0.7,
        star: 0.3 + r() * 0.5, diet: r(), exotic: r() * 0.9, size: r(),
      };
      const mode: ColorMode = r() < 0.5 ? 'alien' : 'earth';
      const g = makeGenome(`${seed}:c${i}`, p, mode);
      const anim = animFor(g, stage);
      this.gallery.push({ g, stage, anim, key: `${seed}:c${i}|${stage}|${anim}` });
    }
    // the one that evolves: a walking land species from the second half of the line-up
    let c = this.gallery.findIndex((s, i) => i >= 11 && s.stage === Stage.LAND && s.anim === 'walk');
    if (c < 0) c = this.gallery.findIndex(s => s.stage === Stage.LAND);
    this.chosen = c;
    const g = this.gallery[c].g;
    for (const stage of LINEAGE) {
      const anim: Anim = stage <= Stage.AQUA ? 'swim' : stage === Stage.SPACE ? 'idle' : 'walk';
      this.lineage.push({ g, stage, anim, key: `${g.seed}|${stage}|${anim}|evo` });
    }
  }

  /** Queues every sprite sheet on the workers (call well before the montage). */
  preload() { for (const s of [...this.gallery, ...this.lineage]) this.sheet(s); }
  private sheet(s: Specimen): Sheet | null { return this.store.get(s.key, s.g, s.stage, s.anim, K, 0); }
  dispose() { this.store.dispose(); }

  private backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, stage: Stage, t: number, hue: number) {
    const sea = stage <= Stage.AQUA_GIANT, cell = stage === Stage.CELL;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (cell) { g.addColorStop(0, '#0b2a26'); g.addColorStop(1, '#03110f'); }
    else if (sea) { g.addColorStop(0, '#0d4a6e'); g.addColorStop(0.55, '#062840'); g.addColorStop(1, '#020c16'); }
    else if (stage >= Stage.TRIBAL) { g.addColorStop(0, `hsl(${hue},28%,12%)`); g.addColorStop(1, `hsl(${hue},30%,4%)`); }
    else { g.addColorStop(0, '#1b1530'); g.addColorStop(0.62, '#4a2f3c'); g.addColorStop(0.63, '#231a1c'); g.addColorStop(1, '#0c0909'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (sea) {
      // light shafts from the surface
      for (let i = 0; i < 6; i++) {
        const x = ((i * 0.19 + Math.sin(t * 0.3 + i) * 0.03) % 1) * w;
        const lg = ctx.createLinearGradient(x, 0, x + w * 0.1, h);
        lg.addColorStop(0, 'rgba(140,210,255,0.13)'); lg.addColorStop(1, 'rgba(140,210,255,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.06, 0); ctx.lineTo(x + w * 0.22, h); ctx.lineTo(x + w * 0.1, h); ctx.fill();
      }
    }
    // drifting motes (plankton, pollen, dust)
    const r = mulberry(7);
    for (let i = 0; i < 60; i++) {
      const x = ((r() + t * 0.01 * (r() - 0.5)) % 1 + 1) % 1 * w, y = ((r() - t * 0.015 * r()) % 1 + 1) % 1 * h;
      ctx.fillStyle = cell ? 'rgba(120,255,200,0.18)' : sea ? 'rgba(180,230,255,0.2)' : 'rgba(255,220,180,0.12)';
      const s = 1 + r() * 2.5;
      ctx.fillRect(x, y, s, s);
    }
    // spotlight on the stage
    const sg = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.min(w, h) * 0.55);
    sg.addColorStop(0, cell ? 'rgba(120,255,210,0.12)' : sea ? 'rgba(120,200,255,0.12)' : 'rgba(255,220,170,0.12)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** One specimen, big, centred, animated; `sizeFrac` of the short side. */
  private hero(ctx: CanvasRenderingContext2D, w: number, h: number, s: Specimen, t: number, sizeFrac: number, cx = w / 2, cy = h * 0.55) {
    const sh = this.sheet(s);
    if (!sh) return false;
    const row = s.stage === Stage.CELL ? 0 : ROW;
    const f = Math.floor(t * 9) % sh.frames;
    const k = Math.max(1, Math.round((Math.min(w, h) * sizeFrac) / Math.max(sh.ch, sh.cw * 0.8)));
    const grounded = s.stage >= Stage.AMPHIBIAN;
    if (grounded) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, cy + (sh.ch - sh.ay) * 0.1 * k, sh.cw * k * 0.32, sh.cw * k * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sh.canvas, f * sh.cw, row * sh.ch, sh.cw, sh.ch, Math.round(cx - sh.ax * k), Math.round(cy - sh.ay * k), sh.cw * k, sh.ch * k);
    return true;
  }

  /** gallery: specimen i (0..19) */
  drawGallery(ctx: CanvasRenderingContext2D, w: number, h: number, i: number, t: number) {
    const s = this.gallery[Math.max(0, Math.min(GALLERY_N - 1, i))];
    this.backdrop(ctx, w, h, s.stage, t, 30);
    this.hero(ctx, w, h, s, t, s.stage === Stage.LAND_GIANT || s.stage === Stage.AQUA_GIANT ? 0.8 : 0.66);
  }

  /** the line-up: every specimen small, the chosen one lights up (p: 0..1 through the beat) */
  drawLineup(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, t: number) {
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#15131f'); bg.addColorStop(1, '#030305');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const cols = 5, rows = 4, cw = w / (cols + 0.6), ch = h / (rows + 0.4);
    const ox = (w - cw * cols) / 2, oy = (h - ch * rows) / 2;
    const pick = this.chosen, sel = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
    for (let i = 0; i < GALLERY_N; i++) {
      const s = this.gallery[i], sh = this.sheet(s);
      const cx = ox + (i % cols + 0.5) * cw, cy = oy + (Math.floor(i / cols) + 0.62) * ch;
      if (i === pick && sel > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(160,255,220,${sel})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(120,255,210,0.9)'; ctx.shadowBlur = 18 * sel;
        const R = Math.min(cw, ch) * (0.46 + 0.04 * Math.sin(t * 8));
        ctx.beginPath(); ctx.arc(cx, cy - ch * 0.12, R, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (!sh) continue;
      ctx.globalAlpha = i === pick ? 1 : 1 - sel * 0.75;
      const k = Math.max(1, Math.floor(Math.min(cw, ch) * 0.7 / Math.max(sh.ch, sh.cw * 0.8)));
      ctx.imageSmoothingEnabled = false;
      const row = s.stage === Stage.CELL ? 0 : ROW, f = Math.floor(t * 9) % sh.frames;
      ctx.drawImage(sh.canvas, f * sh.cw, row * sh.ch, sh.cw, sh.ch, Math.round(cx - sh.ax * k), Math.round(cy - sh.ay * k), sh.cw * k, sh.ch * k);
      ctx.globalAlpha = 1;
    }
  }

  /** evolution: lineage step i */
  drawEvolution(ctx: CanvasRenderingContext2D, w: number, h: number, i: number, t: number) {
    const s = this.lineage[Math.max(0, Math.min(LINEAGE.length - 1, i))];
    this.backdrop(ctx, w, h, s.stage, t, 200 + i * 23);
    const size = s.stage === Stage.CELL ? 0.55 : s.stage <= Stage.AQUA ? 0.62 : s.stage >= Stage.TRIBAL ? 0.78 : 0.66;
    this.hero(ctx, w, h, s, t, size, w / 2, s.stage >= Stage.TRIBAL ? h * 0.72 : h * 0.58);
  }
}
