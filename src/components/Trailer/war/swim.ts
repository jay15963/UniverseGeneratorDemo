// Trailer II: the lineage's own sea creatures swimming through the underwater shots (a school of the aquatic
// form on the reef, a leviathan and its escort in the abyss), drawn over the sea floor like the aquatic era's units.
import type { GameLayer, GameFrame, GameDraw, WorldApi } from '../../../lib/game/layer';
import { Stage } from '../../../lib/creature/genome';
import type { WarStage } from './stage';

export interface School { stage: Stage; n: number; k: number; speed: number; spread: number; lift: number }

/** sheets wider than this are cut into one canvas per frame (the view's sprite atlas pages are 2048 px) */
const ATLAS_W = 2048;

export class SwimLayer implements GameLayer {
  api: WorldApi | null = null;
  private cut = new Map<HTMLCanvasElement, HTMLCanvasElement[]>();
  /** `clock`: the film's time; at `mid` (the shot's middle) every swimmer is at its place in the school */
  constructor(private st: WarStage, private at: () => { x: number; y: number }, private schools: School[], private clock: () => number, private mid: number) {}
  attach(api: WorldApi) { this.api = api; }
  detach() { this.api = null; }
  update() { /* positions are a function of time */ }
  /** the sheets jump the sprite queue (the film's soldiers fill it before the first dive) */
  preload() { for (const s of this.schools) this.sheet(s, true); }
  get ready() { return this.schools.every(s => !!this.sheet(s)); }
  private sheet(s: School, urgent = false) { return this.st.store.get(`warswim|${this.st.genome.seed}|${s.stage}|${s.k}`, this.st.genome, s.stage, 'swim', s.k, 0, urgent); }
  collect(f: GameFrame): GameDraw[] {
    const out: GameDraw[] = [];
    const api = this.api;
    if (!api) return out;
    const c = this.at(), t = f.t, ft = this.clock() - this.mid;
    this.schools.forEach((s, si) => {
      const sh = this.sheet(s);
      if (!sh) return;
      for (let i = 0; i < s.n; i++) {
        const h = Math.sin((i + 1) * 12.9898 + si * 78.233) * 43758.5453, r = h - Math.floor(h);
        // they cruise eastwards across the frame on the film's clock (a shot is short: no wrapping), each on its own
        // lane, swaying
        const x = c.x + (r - 0.5) * s.spread * 2.4 + ft * s.speed * (0.85 + r * 0.3);
        const y = c.y + (r - 0.5) * s.spread + Math.sin(t * 0.9 + i * 1.7) * 14;
        const floor = api.underLiftAt(x, y) ?? 0;
        const fr = Math.floor(t * 9 + i * 0.37) % sh.frames;
        const bob = Math.sin(t * 2 + i) * 3;
        const big = sh.canvas.width > ATLAS_W ? this.frames(sh.canvas, sh.cw, sh.ch, sh.frames)[fr] : null;
        out.push({ c: big ?? sh.canvas, sx: big ? 0 : fr * sh.cw, sy: 0, w: sh.cw, h: sh.ch, x, y: y - floor - s.lift + bob, ax: sh.ax, ay: sh.ay, gy: y, shadow: Math.max(3, sh.cw * 0.22), shadowY: y - floor });
      }
    });
    return out;
  }
  overlay(_o: CanvasRenderingContext2D, _f: GameFrame) { /* nothing over the picture */ }
  private frames(c: HTMLCanvasElement, cw: number, ch: number, n: number) {
    let l = this.cut.get(c);
    if (!l) {
      l = [];
      for (let i = 0; i < n; i++) {
        const f = document.createElement('canvas');
        f.width = cw; f.height = ch;
        f.getContext('2d')!.drawImage(c, i * cw, 0, cw, ch, 0, 0, cw, ch);
        l.push(f);
      }
      this.cut.set(c, l);
    }
    return l;
  }
}
