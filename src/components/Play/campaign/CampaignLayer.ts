// The campaign on the planet view: provinces painted in their owners' colours (only what has been discovered),
// settlement banners, armies (a flag with a soldier of their first regiment on the strategic zooms, the soldiers
// themselves standing on the terrain when zoomed in), the selected army's path for this turn and the next ones.
// Left click selects an army or a settlement; right click orders the selected army there (an enemy = attack).
import type { GameLayer, GameFrame, GameDraw, WorldApi, PointerInfo } from '../../../lib/game/layer';
import type { Campaign, Army, Settlement } from '../../../lib/game/campaign/campaign';
import { colorOf, planPath, targetAt, PLAYER, REBELS, atWar, nameOf } from '../../../lib/game/campaign/campaign';
import { levelOf, LEVELS } from '../../../lib/game/campaign/defs';
import { unitById } from '../../../lib/game/campaign/units';
import { WX, type CampaignWorld } from '../../../lib/game/campaign/world';
import type { Genome } from '../../../lib/creature/genome';
import type { Discovery } from '../../../lib/play/discovery';
import { WarArt } from '../war/art';

export interface CampaignSel { army?: number; settlement?: number }

export class CampaignLayer implements GameLayer {
  api: WorldApi | null = null;
  sel: CampaignSel = {};
  onChange: (() => void) | null = null;
  /** right click with an army selected: the era component moves it (battles need the UI) */
  onOrder: ((a: Army, x: number, y: number) => void) | null = null;
  /** displayed army positions (they glide to the real ones) */
  private disp = new Map<number, { x: number; y: number }>();
  private owners: HTMLCanvasElement | null = null;
  private ownersKey = '';
  private ownersT = 0;
  private hover: { x: number; y: number; t: number } | null = null;
  private path: { cells: number[]; costs: number[]; mp: number; army: number; key: string } | null = null;
  private hits: { x: number; y: number; w: number; h: number; army?: number; settlement?: number }[] = [];
  private lastF: GameFrame | null = null;
  /** bumped when ownership changes (the province canvas is redrawn) */
  version = 0;
  busy = false;
  /** films (trailer): everything known and in sight, no settlement banners on the whole-planet map */
  cinematic = false;

  constructor(public c: Campaign, readonly w: CampaignWorld, readonly art: WarArt, readonly genomes: Genome[], readonly fog: Discovery) {}

  attach(api: WorldApi) { this.api = api; }
  detach() { this.api = null; }

  // -------------------------------------------------------------------------------------------------
  /** sight circles of the player's armies and settlements (world px) */
  sight() {
    const out: { x: number; y: number; r: number }[] = [];
    const C = this.w.CELL;
    for (const a of this.c.armies) if (a.owner === PLAYER) out.push({ x: a.x, y: a.y, r: 15 * C });
    for (const s of this.c.settlements) if (s.owner === PLAYER) out.push({ x: s.x, y: s.y, r: (11 + levelOf(s.pop) * 2) * C });
    return out;
  }
  /** can the player see this point now (armies of others are shown only in sight) */
  seesNow(x: number, y: number) {
    if (this.cinematic) return true;
    for (const s of this.sight()) if (this.w.dist(s.x, s.y, x, y) * this.w.CELL < s.r) return true;
    return false;
  }
  knownAt(x: number, y: number) { return this.cinematic || this.fog.known(x / this.w.CELL, y / this.w.CELL); }
  /** factions met: their land seen */
  updateMet() {
    const me = this.c.factions[PLAYER];
    for (const s of this.c.settlements) if (s.owner > 0 && !me.met.includes(s.owner) && this.knownAt(s.x, s.y)) me.met.push(s.owner);
    for (const a of this.c.armies) if (a.owner > 0 && !me.met.includes(a.owner) && this.seesNow(a.x, a.y)) me.met.push(a.owner);
  }

  update(f: GameFrame) {
    this.lastF = f;
    for (const a of this.c.armies) {
      const d = this.disp.get(a.id);
      if (!d) { this.disp.set(a.id, { x: a.x, y: a.y }); continue; }
      let dx = a.x - d.x; if (dx > WX / 2) dx -= WX; else if (dx < -WX / 2) dx += WX;
      const dy = a.y - d.y, L = Math.hypot(dx, dy);
      if (L > 60 * this.w.CELL) { d.x = a.x; d.y = a.y; continue; }
      const st = Math.max(L * Math.min(1, f.dt * 3.5), Math.min(L, this.w.CELL * f.dt * 8));
      if (L > 0.5) { d.x += (dx / L) * st; d.y += (dy / L) * st; d.x = ((d.x % WX) + WX) % WX; }
    }
    for (const id of [...this.disp.keys()]) if (!this.c.armies.some(a => a.id === id)) this.disp.delete(id);
    // path preview of the selected army under the mouse
    const a = this.sel.army !== undefined ? this.c.armies.find(q => q.id === this.sel.army) : undefined;
    if (a && a.owner === PLAYER && this.hover && f.now - this.hover.t > 90) {
      const key = `${a.id}|${Math.floor(this.hover.x / this.w.CELL)}|${Math.floor(this.hover.y / this.w.CELL)}|${a.x}|${a.y}|${a.mp.toFixed(1)}`;
      if (!this.path || this.path.key !== key) {
        const p = planPath(this.c, this.w, a, this.hover.x, this.hover.y);
        this.path = p ? { cells: p.cells, costs: p.costs, mp: a.mp, army: a.id, key } : null;
      }
    }
    if (!a) this.path = null;
  }
  pos(a: Army) { return this.disp.get(a.id) ?? { x: a.x, y: a.y }; }

  // -------------------------------------------------------------------------------------------------
  // Sprites: armies standing on the terrain at the gameplay zooms
  // -------------------------------------------------------------------------------------------------
  collect(f: GameFrame): GameDraw[] {
    const out: GameDraw[] = [];
    if (!this.api) return out;
    for (const a of this.c.armies) {
      if (a.at !== null) continue;
      const p = this.pos(a);
      let x = p.x;
      const dx = x - f.cam.x; if (dx > WX / 2) x -= WX; else if (dx < -WX / 2) x += WX;
      if (x < f.view.x0 - 200 || x > f.view.x1 + 200 || p.y < f.view.y0 - 200 || p.y > f.view.y1 + 300) continue;
      if (a.owner !== PLAYER && !this.seesNow(a.x, a.y)) continue;
      const g = this.genomes[a.owner] ?? this.genomes[0];
      const moving = Math.hypot(a.x - p.x, a.y - p.y) > 4;
      // one soldier per regiment, in a small block facing south
      a.regs.forEach((r, i) => {
        const u = unitById(r.u);
        const era = a.owner >= 0 ? this.c.factions[a.owner].era : u.era[0];
        const col = i % 4, row = Math.floor(i / 4);
        const sx = x + (col - 1.5) * 18, sy = p.y + row * 16;
        if (u.el === 'vehicle' || u.el === 'piece') return;
        const sh = this.art.soldier(g, era, u, moving ? 'walk' : 'idle');
        if (!sh) return;
        const L = this.api!.liftAt(sx, sy);
        const fr = Math.floor(f.t * (moving ? 9 : 3) + i) % sh.frames;
        out.push({ c: sh.canvas, sx: fr * sh.cw, sy: 2 * sh.ch, w: sh.cw, h: sh.ch, x: sx, y: sy - L, ax: sh.ax, ay: sh.ay, gy: sy, shadow: 3, shadowY: sy - L });
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------------
  // Overlay
  // -------------------------------------------------------------------------------------------------
  /** provinces in their owners' colours, at map resolution (only discovered cells) */
  private ownerCanvas() {
    const W = this.w.W, H = this.w.H;
    const key = `${this.version}|${this.fog.version}`;
    if (this.owners && this.ownersKey === key) return this.owners;
    // discovery changes often while armies march: redraw at most every second and a half (ownership at once)
    const now = performance.now();
    if (this.owners && this.ownersKey.split('|')[0] === String(this.version) && now - this.ownersT < 1500) return this.owners;
    this.ownersT = now;
    this.ownersKey = key;
    const c = this.owners ?? document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const im = x.createImageData(W, H), D = im.data;
    const R = this.w.region, S = this.c.settlements;
    const rgb = S.map(s => hex(colorOf(this.c, s.owner)));
    const own = S.map(s => s.owner);
    const mask = this.fog.mask;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, r = R[k];
      if (r < 0 || !mask[k]) continue;
      const [cr, cg, cb] = rgb[r];
      const o = k * 4;
      D[o] = cr; D[o + 1] = cg; D[o + 2] = cb;
      D[o + 3] = own[r] === REBELS ? 26 : 70;
    }
    x.putImageData(im, 0, 0);
    this.owners = c;
    this.bordersCache = null;
    return c;
  }
  private bordersCache: { owner: Path2D; region: Path2D; inner: Map<string, Path2D> } | null = null;
  /** province borders as vector runs along the cell edges (cell units): owner borders, province borders */
  private borders() {
    if (this.bordersCache) return this.bordersCache;
    const W = this.w.W, H = this.w.H, R = this.w.region, mask = this.fog.mask;
    const own = this.c.settlements.map(s => s.owner);
    const col = this.c.settlements.map(s => colorOf(this.c, s.owner));
    const owner = new Path2D(), region = new Path2D(), inner = new Map<string, Path2D>();
    const innerOf = (k: number) => { const cc = col[k]; let p = inner.get(cc); if (!p) inner.set(cc, p = new Path2D()); return p; };
    const kind = (a: number, b: number, ka: number, kb: number) => {
      if (a === b || (!mask[ka] && !mask[kb])) return 0;
      if (a < 0 || b < 0) return 0;                           // coasts: the terrain draws them
      return own[a] !== own[b] ? 1 : 2;
    };
    // vertical edges between (i, j) and (i + 1, j), merged down the column
    for (let i = 0; i < W; i++) {
      let j0 = -1, k0 = 0, a0 = -1, b0 = -1;
      const flush = (j: number) => {
        if (j0 < 0) return;
        const x = i + 1;
        (k0 === 1 ? owner : region).moveTo(x, j0); (k0 === 1 ? owner : region).lineTo(x, j);
        if (k0 === 1) { innerOf(a0).moveTo(x - 0.18, j0); innerOf(a0).lineTo(x - 0.18, j); innerOf(b0).moveTo(x + 0.18, j0); innerOf(b0).lineTo(x + 0.18, j); }
        j0 = -1;
      };
      for (let j = 0; j < H; j++) {
        const ka = j * W + i, kb = j * W + ((i + 1) % W), a = R[ka], b = R[kb];
        const k = kind(a, b, ka, kb);
        if (j0 >= 0 && (k !== k0 || a !== a0 || b !== b0)) flush(j);
        if (k && j0 < 0) { j0 = j; k0 = k; a0 = a; b0 = b; }
      }
      flush(H);
    }
    for (let j = 0; j < H - 1; j++) {
      let i0 = -1, k0 = 0, a0 = -1, b0 = -1;
      const flush = (i: number) => {
        if (i0 < 0) return;
        const y = j + 1;
        (k0 === 1 ? owner : region).moveTo(i0, y); (k0 === 1 ? owner : region).lineTo(i, y);
        if (k0 === 1) { innerOf(a0).moveTo(i0, y - 0.18); innerOf(a0).lineTo(i, y - 0.18); innerOf(b0).moveTo(i0, y + 0.18); innerOf(b0).lineTo(i, y + 0.18); }
        i0 = -1;
      };
      for (let i = 0; i < W; i++) {
        const ka = j * W + i, kb = (j + 1) * W + i, a = R[ka], b = R[kb];
        const k = kind(a, b, ka, kb);
        if (i0 >= 0 && (k !== k0 || a !== a0 || b !== b0)) flush(i);
        if (k && i0 < 0) { i0 = i; k0 = k; a0 = a; b0 = b; }
      }
      flush(W);
    }
    return (this.bordersCache = { owner, region, inner });
  }

  overlay(o: CanvasRenderingContext2D, f: GameFrame) {
    const dpr = f.dpr;
    const strategic = f.lod === 'regional' || f.lod === 'world';
    this.hits = [];
    o.save();
    // provinces
    if (strategic) {
      const cv = this.ownerCanvas();
      const B = this.borders();
      const C = this.w.CELL;
      o.imageSmoothingEnabled = true;
      for (const k of [-1, 0, 1]) {
        const [x0, y0] = f.toScreen(k * WX, 0), [x1, y1] = f.toScreen(k * WX + WX, this.w.H * C);
        if (x1 < 0 || x0 > f.DW) continue;
        o.globalAlpha = 0.9;
        o.drawImage(cv, x0, y0, x1 - x0, y1 - y0);
        o.globalAlpha = 1;
        // borders (in cell units)
        const sc = (x1 - x0) / this.w.W;
        o.save();
        o.setTransform(sc, 0, 0, sc, x0, y0);
        o.lineCap = 'round';
        o.setLineDash([0.35, 0.35]); o.strokeStyle = 'rgba(255,255,255,0.35)'; o.lineWidth = Math.max(0.04, 1 * dpr / sc); o.stroke(B.region);
        o.setLineDash([]);
        o.strokeStyle = 'rgba(10,8,6,0.75)'; o.lineWidth = Math.max(0.08, 3.2 * dpr / sc); o.stroke(B.owner);
        if (sc > 3) for (const [cc, p] of B.inner) { o.strokeStyle = cc; o.lineWidth = Math.max(0.06, 2 * dpr / sc); o.stroke(p); }
        o.restore();
      }
    }
    // path of the selected army
    if (this.path && this.sel.army === this.path.army) {
      const p = this.path;
      for (let i = 1; i < p.cells.length; i++) {
        const [x, y] = this.w.centre(p.cells[i]);
        const [sx, sy] = this.screen(f, x, y);
        const ok = p.costs[i] <= p.mp;
        o.fillStyle = ok ? 'rgba(110,240,140,0.95)' : 'rgba(255,220,120,0.75)';
        const r = (i === p.cells.length - 1 ? 4.5 : 2.2) * dpr;
        if (i % (strategic ? 1 : 1) === 0) { o.beginPath(); o.arc(sx, sy, r, 0, Math.PI * 2); o.fill(); }
      }
      const last = p.cells[p.cells.length - 1], [lx, ly] = this.w.centre(last), [sx, sy] = this.screen(f, lx, ly);
      const turns = Math.ceil(Math.max(0, p.costs[p.costs.length - 1] - p.mp) / Math.max(1, this.moveMax())) + 1;
      if (turns > 1) this.pill(o, sx, sy - 16 * dpr, `${turns} turnos`, '#fde68a', dpr);
    }
    // settlements
    if (!(this.cinematic && f.lod === 'world')) for (const s of this.c.settlements) {
      if (!this.knownAt(s.x, s.y)) continue;
      const [sx, sy] = this.screen(f, s.x, s.y);
      if (sx < -200 || sx > f.DW + 200 || sy < -100 || sy > f.DH + 100) continue;
      this.settlementBanner(o, s, sx, sy, dpr, f);
    }
    // armies
    for (const a of this.c.armies) {
      if (a.at !== null) continue;
      if (a.owner !== PLAYER && !this.seesNow(a.x, a.y)) continue;
      const p = this.pos(a);
      const [sx, sy] = this.screen(f, p.x, p.y);
      if (sx < -100 || sx > f.DW + 100 || sy < -100 || sy > f.DH + 100) continue;
      this.armyFlag(o, a, sx, sy - (strategic ? 0 : 40 * Math.min(2, f.S)), dpr, strategic);
    }
    o.restore();
  }
  private moveMax() { const a = this.c.armies.find(q => q.id === this.sel.army); return a ? Math.max(a.mp, 1) : 1; }
  private screen(f: GameFrame, x: number, y: number): [number, number] {
    let dx = x - f.cam.x; if (dx > WX / 2) x -= WX; else if (dx < -WX / 2) x += WX;
    const L = f.lod === 'local' || f.lod === 'far' ? this.api?.liftAt(x, y) ?? 0 : 0;
    void dx;
    return f.toScreen(x, y - L);
  }
  private pill(o: CanvasRenderingContext2D, x: number, y: number, text: string, col: string, dpr: number) {
    o.font = `700 ${10 * dpr}px ui-sans-serif, system-ui`;
    const w = o.measureText(text).width + 10 * dpr;
    o.fillStyle = 'rgba(8,10,16,0.8)'; o.beginPath(); o.roundRect(x - w / 2, y - 9 * dpr, w, 15 * dpr, 4 * dpr); o.fill();
    o.fillStyle = col; o.textAlign = 'center'; o.fillText(text, x, y + 2 * dpr);
  }
  private settlementBanner(o: CanvasRenderingContext2D, s: Settlement, x: number, y: number, dpr: number, f: GameFrame) {
    const col = colorOf(this.c, s.owner), lv = levelOf(s.pop);
    const sel = this.sel.settlement === s.id;
    const garrison = this.c.armies.filter(a => a.at === s.id).reduce((q, a) => q + a.regs.length, 0);
    const war = s.owner !== PLAYER && (s.owner === REBELS || atWar(this.c, PLAYER, s.owner));
    o.font = `700 ${11 * dpr}px ui-sans-serif, system-ui`;
    const name = (s.capital ? '♛ ' : '') + s.name;
    const w = Math.max(o.measureText(name).width + 34 * dpr, 70 * dpr), h = 30 * dpr;
    const bx = x - w / 2, by = y - h - 12 * dpr;
    o.fillStyle = 'rgba(8,10,16,0.82)';
    o.strokeStyle = sel ? '#fff' : col; o.lineWidth = (sel ? 2.5 : 1.5) * dpr;
    o.beginPath(); o.roundRect(bx, by, w, h, 6 * dpr); o.fill(); o.stroke();
    o.fillStyle = col; o.fillRect(bx, by, 6 * dpr, h);
    o.beginPath(); o.moveTo(x - 5 * dpr, by + h); o.lineTo(x, by + h + 7 * dpr); o.lineTo(x + 5 * dpr, by + h); o.fillStyle = 'rgba(8,10,16,0.82)'; o.fill();
    o.textAlign = 'left';
    o.fillStyle = '#fff'; o.fillText(name, bx + 11 * dpr, by + 13 * dpr);
    o.font = `500 ${9 * dpr}px ui-sans-serif, system-ui`;
    o.fillStyle = war ? '#fca5a5' : 'rgba(255,255,255,0.65)';
    o.fillText(`${LEVELS[lv].name} · ${Math.round(s.pop).toLocaleString('pt-BR')}${garrison ? ` · ⚔${garrison}` : ''}`, bx + 11 * dpr, by + 25 * dpr);
    this.hits.push({ x: bx / dpr, y: by / dpr, w: w / dpr, h: (h + 8 * dpr) / dpr, settlement: s.id });
    void f;
  }
  private armyFlag(o: CanvasRenderingContext2D, a: Army, x: number, y: number, dpr: number, strategic: boolean) {
    const col = colorOf(this.c, a.owner), sel = this.sel.army === a.id;
    const H = 34 * dpr, W = 30 * dpr;
    // the standard: a pole, a flag in the faction's colour, a soldier of the first regiment
    o.strokeStyle = 'rgba(0,0,0,0.75)'; o.lineWidth = 2 * dpr;
    o.beginPath(); o.moveTo(x, y); o.lineTo(x, y - H - 8 * dpr); o.stroke();
    o.fillStyle = col; o.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.7)'; o.lineWidth = (sel ? 2.5 : 1) * dpr;
    o.beginPath(); o.roundRect(x, y - H - 8 * dpr, W, H * 0.62, 3 * dpr); o.fill(); o.stroke();
    o.fillStyle = 'rgba(0,0,0,0.75)'; o.font = `800 ${10 * dpr}px ui-monospace, monospace`; o.textAlign = 'center';
    o.fillText(String(a.regs.length), x + W / 2, y - H - 8 * dpr + H * 0.42);
    if (strategic && a.regs[0] && !this.cinematic) {
      const u = unitById(a.regs[0].u), g = this.genomes[a.owner] ?? this.genomes[0];
      const era = a.owner >= 0 ? this.c.factions[a.owner].era : u.era[0];
      const sh = u.el === 'soldier' || u.el === 'mounted' ? this.art.soldier(g, era, u, 'idle') : null;
      if (sh) {
        const k = (26 * dpr) / sh.ch;
        o.imageSmoothingEnabled = false;
        o.drawImage(sh.canvas, 0, 2 * sh.ch, sh.cw, sh.ch, x - 4 * dpr - sh.cw * k * 0.75, y - sh.ch * k * 0.95, sh.cw * k, sh.ch * k);
      }
    }
    if (a.owner === PLAYER) {
      // movement left
      const m = Math.max(0, Math.min(1, a.mp / Math.max(1, this.c.factions[PLAYER] ? 30 : 30)));
      o.fillStyle = 'rgba(0,0,0,0.6)'; o.fillRect(x, y - 6 * dpr, W, 3 * dpr);
      o.fillStyle = a.mp > 0.5 ? '#6ee7b7' : '#6b7280'; o.fillRect(x, y - 6 * dpr, W * m, 3 * dpr);
    }
    this.hits.push({ x: (x - 18 * dpr) / dpr, y: (y - H - 10 * dpr) / dpr, w: (W + 22 * dpr) / dpr, h: (H + 12 * dpr) / dpr, army: a.id });
  }

  // -------------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------------
  private hitAt(sx: number, sy: number) {
    for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return h; }
    return null;
  }
  pointerDown(p: PointerInfo) {
    if (this.busy) return true;
    const h = this.hitAt(p.sx, p.sy);
    if (p.button === 0) {
      if (h?.army !== undefined) { this.sel = { army: h.army }; this.onChange?.(); return true; }
      if (h?.settlement !== undefined) {
        // clicking the own settlement that holds the selected army's garrison selects the garrison
        this.sel = { settlement: h.settlement };
        this.onChange?.();
        return true;
      }
      // a click on the ground near an army / settlement (zoomed in)
      const t = targetAt(this.c, this.w, p.wx, p.wy, 0.9);
      if (t.army && (t.army.owner === PLAYER || this.seesNow(t.army.x, t.army.y))) { this.sel = { army: t.army.id }; this.onChange?.(); return true; }
      return false; // drag pans the map
    }
    if (p.button === 2) {
      const a = this.sel.army !== undefined ? this.c.armies.find(q => q.id === this.sel.army) : undefined;
      if (!a || a.owner !== PLAYER) return false;
      let x = p.wx, y = p.wy;
      if (h?.army !== undefined) { const t = this.c.armies.find(q => q.id === h.army)!; x = t.x; y = t.y; }
      else if (h?.settlement !== undefined) { const s = this.c.settlements.find(q => q.id === h.settlement)!; x = s.x; y = s.y; }
      this.onOrder?.(a, x, y);
      this.path = null;
      return true;
    }
    return false;
  }
  pointerMove(p: PointerInfo) { this.hover = { x: p.wx, y: p.wy, t: performance.now() }; }
  key(k: string, down: boolean) {
    if (!down) return false;
    if (k === 'escape') { this.sel = {}; this.onChange?.(); return true; }
    return false;
  }
  /** the army or settlement title for tooltips */
  title(a: Army) { return nameOf(this.c, a.owner); }
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
