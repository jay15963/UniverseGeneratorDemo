// The creature eras on the planet view: draws every creature of the simulation with the lineage's sprites (each
// caste its own anatomy; rivals and wild life with theirs), the nests / dens / sentinels, the territories, the
// effects (bites, spit, deaths), and handles the RTS controls: click / box select, double click = same caste in
// view, right click = move / attack / gather / rally, A = attack-move, S = stop, H = hold, Esc = deselect.
import type { GameLayer, GameFrame, GameDraw, WorldApi, PointerInfo } from '../../../lib/game/layer';
import type { RtsClient, Ent, Bld } from '../../../lib/game/rts/client';
import { NO_NATION, Ord, F_WILD, F_CARRY, type RtsDefs, type WildSpecies } from '../../../lib/game/rts/defs';
import type { SimEvent } from '../../../lib/game/rts/sim';
import { WX } from '../../../lib/game/rts/sim';
import { makeGenome, type Genome, type ColorMode, type CreatureParams, Stage } from '../../../lib/creature/genome';
import type { Anim } from '../../../lib/creature/pose';
import type { Sheet } from '../../../lib/fauna/spriteStore';
import { rgba } from '../../../lib/render/glWorld';

interface Fx { k: 'shot' | 'hit' | 'death' | 'built' | 'mark'; x: number; y: number; x2?: number; y2?: number; t: number; dur: number; col: string }

export class RtsLayer implements GameLayer {
  api: WorldApi | null = null;
  sel = new Set<number>();
  selB: number | null = null;
  /** building placement mode (type) */
  placing: number | null = null;
  armAttack = false;
  private down: { sx: number; sy: number; button: number } | null = null;
  private boxNow: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private genomes = new Map<string, Genome>();
  private bsprites = new Map<string, HTMLCanvasElement>();
  private fx: Fx[] = [];
  private listeners = new Set<() => void>();
  private lastF: GameFrame | null = null;
  private mouse = { sx: -1, sy: -1, wx: 0, wy: 0 };
  private dpr = 1;

  constructor(readonly client: RtsClient, readonly defs: RtsDefs, readonly lineage: (over: Partial<CreatureParams>) => Genome,
    readonly wild: WildSpecies[], readonly mode: ColorMode) {
    client.onEvents = ev => this.events(ev);
  }
  attach(api: WorldApi) { this.api = api; }
  detach() { this.api = null; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { for (const l of this.listeners) l(); }

  // ---------------------------------------------------------------------------------------------------
  // Sprites
  // ---------------------------------------------------------------------------------------------------
  genome(e: { kind: number; nation: number }): Genome {
    const key = `${e.nation}:${e.kind}`;
    let g = this.genomes.get(key);
    if (g) return g;
    if (e.nation === NO_NATION) { const w = this.wild[e.kind]; g = makeGenome(w.seed, w.params, this.mode); }
    else if (e.nation === 0) g = this.lineage(this.defs.castes[e.kind].params);
    else { const n = this.client.nations[e.nation]; g = makeGenome(n.seed, { ...n.params, ...this.defs.castes[e.kind].params }, this.mode); }
    this.genomes.set(key, g);
    return g;
  }
  stageOf(e: { kind: number; nation: number }): Stage { return e.nation === NO_NATION ? this.wild[e.kind].stage : this.defs.castes[e.kind].stage; }
  kOf(e: { kind: number; nation: number }) { return e.nation === NO_NATION ? this.wild[e.kind].k : this.defs.castes[e.kind].k; }
  sheet(e: { kind: number; nation: number }, anim: Anim): Sheet | null {
    const api = this.api!;
    const st = this.stageOf(e), g = this.genome(e), k = this.kOf(e);
    const aqua = st <= Stage.AQUA_LEVIATHAN;
    const want: Anim = aqua ? (anim === 'idle' ? 'idle' : anim === 'run' ? 'run' : 'swim') : (st === Stage.AMPHIBIAN && anim === 'run' ? 'walk' : anim);
    const s = api.store.get(`rts:${e.nation}:${e.kind}:${want}`, g, st, want, k);
    if (s) return s;
    return api.store.get(`rts:${e.nation}:${e.kind}:${aqua ? 'swim' : 'idle'}`, g, st, aqua ? 'swim' : 'idle', k);
  }
  private building(b: Bld): HTMLCanvasElement {
    const key = `${b.type}:${b.nation}`;
    let c = this.bsprites.get(key);
    if (c) return c;
    const col = b.nation === NO_NATION ? [200, 200, 200] : this.client.nations[b.nation]?.color ?? [200, 200, 200];
    c = this.defs.mode === 'aqua' ? (this.defs.buildings[b.type].key === 'nest' ? eggNest(col) : rockMound(col, true)) : (this.defs.buildings[b.type].key === 'den' ? denMound(col) : rockMound(col, false));
    this.bsprites.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------------------------------
  update(f: GameFrame) {
    this.lastF = f; this.dpr = f.dpr;
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].t += f.dt; if (this.fx[i].t > this.fx[i].dur) this.fx.splice(i, 1); }
  }
  /** where an entity is drawn: on the sea floor (underwater view), on the terrain, or at the surface */
  private lift(x: number, y: number, f: GameFrame, aqua: boolean) {
    const api = this.api!;
    if (aqua && f.sub) return (api.underLiftAt(x, y) ?? 0) + 12;
    if (aqua) return 0;
    return api.liftAt(x, y);
  }
  collect(f: GameFrame): GameDraw[] {
    const out: GameDraw[] = [];
    const { x0, x1, y0, y1 } = f.view, now = f.now / 1000;
    const inView = (x: number, y: number) => {
      let dx = x - (x0 + x1) / 2;
      if (dx > WX / 2) dx -= WX; else if (dx < -WX / 2) dx += WX;
      return Math.abs(dx) < (x1 - x0) / 2 + 80 && y > y0 - 60 && y < y1 + 300;
    };
    const unwrap = (x: number) => { let dx = x - (x0 + x1) / 2; if (dx > WX / 2) return x - WX; if (dx < -WX / 2) return x + WX; return x; };
    const aquaEra = this.defs.mode === 'aqua';
    const DARK = rgba(14, 34, 52, 0.55);
    for (const b of this.client.builds) {
      if (!inView(b.x, b.y)) continue;
      const B = this.defs.buildings[b.type], bx = unwrap(b.x);
      const onShore = B.site === 'shore';
      const L = onShore ? (f.sub ? (this.api!.underLiftAt(b.x, b.y) ?? 0) : this.api!.liftAt(b.x, b.y)) : this.lift(b.x, b.y, f, aquaEra);
      const c = this.building(b);
      if (aquaEra && !f.sub && !onShore) out.push({ c, sx: 0, sy: 0, w: c.width, h: c.height, x: bx, y: b.y - L, ax: c.width / 2, ay: c.height - 4, gy: b.y, tint: DARK });
      else out.push({ c, sx: 0, sy: 0, w: c.width, h: c.height, x: bx, y: b.y - L, ax: c.width / 2, ay: c.height - 4, gy: b.y, shadow: c.width * 0.35, shadowY: b.y - L });
      if (B.dmg) {
        // the sentinel: an adult of the species keeping guard on its rock
        const sh = this.towerSheet(b);
        if (sh) {
          const fr = Math.floor(now * 4 + b.id) % sh.frames;
          out.push({ c: sh.canvas, sx: fr * sh.cw, sy: 2 * sh.ch, w: sh.cw, h: sh.ch, x: bx, y: b.y - L - 8, ax: sh.ax, ay: sh.ay, gy: b.y + 0.5, ...(f.sub ? { tint: rgba(26, 44, 64, 1) } : {}) });
        }
      }
    }
    for (const e of this.client.cur.values()) {
      if (!inView(e.x, e.y)) continue;
      const [px, py] = this.client.pos(e);
      const st = this.stageOf(e), aqua = st <= Stage.AQUA_LEVIATHAN;
      const anim: Anim = e.anim === 2 ? 'run' : e.anim === 1 ? (aqua ? 'swim' : 'walk') : 'idle';
      const sh = this.sheet(e, anim);
      if (!sh) continue;
      const fr = Math.floor(now * (e.anim ? 9 : 5) + e.id * 0.37) % sh.frames;
      const L = this.lift(px, py, f, aqua);
      const bob = aqua && f.sub ? Math.sin(now * 2 + e.id) * 2 : 0;
      const x = unwrap(px);
      if (aqua && !f.sub) {
        // seen from above the water: a dark shape under the surface
        out.push({ c: sh.canvas, sx: fr * sh.cw, sy: e.dir * sh.ch, w: sh.cw, h: sh.ch, x, y: py - sh.ay * 0.4, ax: sh.ax, ay: sh.ay, gy: py, tint: DARK });
        continue;
      }
      out.push({ c: sh.canvas, sx: fr * sh.cw, sy: e.dir * sh.ch, w: sh.cw, h: sh.ch, x, y: py - L + bob, ax: sh.ax, ay: sh.ay, gy: py, shadow: Math.max(3, sh.cw * 0.22), shadowY: py - (aqua ? L - 12 : L) });
    }
    return out;
  }
  private towerSheet(b: Bld) {
    const B = this.defs.buildings[b.type];
    const key = `rts:t${b.nation}:${b.type}:idle`;
    let g = this.genomes.get(key);
    if (!g) {
      g = b.nation === 0 ? this.lineage(B.params) : makeGenome(this.client.nations[b.nation].seed, { ...this.client.nations[b.nation].params, ...B.params }, this.mode);
      this.genomes.set(key, g);
    }
    return this.api!.store.get(key, g, B.stage, 'idle', B.k);
  }

  overlay(ctx: CanvasRenderingContext2D, f: GameFrame) {
    const dpr = f.dpr, aquaEra = this.defs.mode === 'aqua';
    const zoomedOut = f.lod === 'regional' || f.lod === 'world';
    const S = f.S, wraps = f.lod === 'world' ? [-WX, 0, WX] : [0];
    const scr = (x: number, y: number, L = 0): [number, number] => {
      let dx = x - f.cam.x;
      if (dx > WX / 2) x -= WX; else if (dx < -WX / 2) x += WX;
      return f.toScreen(x, y - L);
    };
    const liftOf = (x: number, y: number) => (zoomedOut ? 0 : this.lift(x, y, f, aquaEra));
    // territories and buildings
    for (const b of this.client.builds) {
      const B = this.defs.buildings[b.type], col = this.client.nations[b.nation]?.color ?? [255, 255, 255];
      for (const k of wraps) {
        const L = zoomedOut ? 0 : (B.site === 'shore' ? (f.sub ? this.api!.underLiftAt(b.x, b.y) ?? 0 : this.api!.liftAt(b.x, b.y)) : liftOf(b.x, b.y));
        const [sx, sy] = scr(b.x + k, b.y, L);
        if (sx < -200 || sy < -200 || sx > f.DW + 200 || sy > f.DH + 200) continue;
        if (B.radius) {
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${b.nation === 0 ? 0.55 : 0.4})`;
          ctx.lineWidth = Math.max(1, dpr * (zoomedOut ? 1.5 : 1));
          ctx.setLineDash(zoomedOut ? [] : [6 * dpr, 6 * dpr]);
          ctx.beginPath(); ctx.ellipse(sx, sy, B.radius * S, B.radius * S * (zoomedOut ? 1 : 0.62), 0, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          if (zoomedOut) { ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.12)`; ctx.fill(); }
        }
        if (zoomedOut || b.id === this.selB || b.hp < 1) {
          if (zoomedOut) {
            ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.strokeStyle = '#000';
            const r = (B.trains ? 5 : 3.5) * dpr;
            ctx.beginPath();
            if (B.trains) ctx.rect(sx - r, sy - r, r * 2, r * 2); else { ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy + r); ctx.lineTo(sx - r, sy + r); ctx.closePath(); }
            ctx.fill(); ctx.stroke();
          }
          if (b.hp < 1 || b.id === this.selB) this.bar(ctx, sx, sy - (zoomedOut ? 10 : 36) * dpr, 34 * dpr, b.hp, b.nation === 0 ? '#7dffa0' : '#ff6a5a');
          if (b.id === this.selB && !zoomedOut) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.ellipse(sx, sy, 34 * S, 20 * S, 0, 0, Math.PI * 2); ctx.stroke(); }
          if (b.queue && b.nation === 0) this.bar(ctx, sx, sy - (zoomedOut ? 6 : 31) * dpr, 34 * dpr, b.prog, '#9ad8ff');
        }
      }
    }
    // creatures: dots on the zoomed-out maps, rings / bars at the gameplay zooms
    for (const e of this.client.cur.values()) {
      const [px, py] = this.client.pos(e);
      const sel = this.sel.has(e.id);
      const col = e.nation === NO_NATION ? [230, 230, 230] : this.client.nations[e.nation]?.color ?? [255, 255, 255];
      for (const k of wraps) {
        const st = this.stageOf(e), aqua = st <= Stage.AQUA_LEVIATHAN;
        const L = zoomedOut ? 0 : this.lift(px, py, f, aqua);
        const [sx, sy] = scr(px + k, py, L);
        if (sx < -20 || sy < -40 || sx > f.DW + 20 || sy > f.DH + 40) continue;
        if (zoomedOut) {
          if (e.flags & F_WILD) { if (this.wild[e.kind]?.role !== 2) continue; ctx.fillStyle = '#ffb347'; ctx.fillRect(sx - 2.5 * dpr, sy - 2.5 * dpr, 5 * dpr, 5 * dpr); continue; }
          ctx.fillStyle = sel ? '#fff' : `rgb(${col[0]},${col[1]},${col[2]})`;
          const r = (e.nation === 0 ? 1.8 : 1.4) * dpr;
          ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
          continue;
        }
        const sh = this.sheet(e, 'idle');
        const h = sh ? sh.ay : 16;
        if (sel) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2 * dpr;
          const rr = Math.max(7, (sh?.cw ?? 20) * 0.32) * S;
          ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (sel || e.hp < 0.999) this.bar(ctx, sx, sy - (h + 6) * S, Math.max(18 * dpr, (sh?.cw ?? 20) * 0.6 * S), e.hp, e.nation === 0 ? '#7dffa0' : e.nation === NO_NATION ? '#e8e8e8' : '#ff6a5a');
        if (e.nation !== 0 && e.nation !== NO_NATION && S > 1.2) {
          // rival nation tag
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
          ctx.fillRect(sx - 1.5 * dpr, sy - (h + 11) * S, 3 * dpr, 3 * dpr);
        }
        if (e.flags & F_CARRY && S > 0.8) { ctx.fillStyle = '#c8f58a'; ctx.beginPath(); ctx.arc(sx + 6 * S, sy - h * S * 0.6, 2.2 * dpr, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // effects
    for (const q of this.fx) {
      const k = q.t / q.dur;
      if (q.k === 'shot') {
        const ax = q.x + (q.x2! - q.x) * k, ay = q.y + (q.y2! - q.y) * k;
        const [sx, sy] = scr(ax, ay, zoomedOut ? 0 : 14);
        ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, 2.2 * S), 0, Math.PI * 2); ctx.fill();
      } else {
        const L = zoomedOut ? 0 : this.lift(q.x, q.y, f, aquaEra);
        const [sx, sy] = scr(q.x, q.y, L);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = q.col; ctx.lineWidth = Math.max(1, 1.5 * dpr);
        const r = (q.k === 'death' ? 6 + 26 * k : q.k === 'built' ? 10 + 60 * k : q.k === 'mark' ? 14 * (1 - k) + 3 : 3 + 8 * k) * (zoomedOut ? dpr : S);
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * (zoomedOut ? 1 : 0.55), 0, 0, Math.PI * 2); ctx.stroke();
        if (q.k === 'death' && !zoomedOut) {
          ctx.fillStyle = aquaEra && f.sub ? 'rgba(220,245,255,0.8)' : 'rgba(150,40,30,0.8)';
          for (let p = 0; p < 6; p++) { const a = p * 1.05 + q.x, d = 10 * k * S * 2; ctx.fillRect(sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.6 - k * 20 * S * (aquaEra ? 1 : 0), 2 * dpr, 2 * dpr); }
        }
        ctx.globalAlpha = 1;
      }
    }
    // placement ghost
    if (this.placing !== null && this.mouse.sx >= 0) {
      const B = this.defs.buildings[this.placing];
      const [sx, sy] = [this.mouse.sx * dpr, this.mouse.sy * dpr];
      ctx.strokeStyle = 'rgba(160,255,200,0.85)'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(12 * dpr, (B.radius || B.range || 60) * S), Math.max(8 * dpr, (B.radius || B.range || 60) * S * 0.62), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 ${11 * dpr}px ui-sans-serif, system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(B.name, sx + 1, sy - 16 * dpr + 1); ctx.fillStyle = '#c8ffd9'; ctx.fillText(B.name, sx, sy - 16 * dpr);
    }
    // drag box
    if (this.boxNow) {
      const b = this.boxNow;
      ctx.strokeStyle = 'rgba(180,255,210,0.9)'; ctx.fillStyle = 'rgba(120,255,170,0.08)'; ctx.lineWidth = 1 * dpr;
      ctx.fillRect(b.x0 * dpr, b.y0 * dpr, (b.x1 - b.x0) * dpr, (b.y1 - b.y0) * dpr);
      ctx.strokeRect(b.x0 * dpr, b.y0 * dpr, (b.x1 - b.x0) * dpr, (b.y1 - b.y0) * dpr);
    }
    if (this.armAttack) { ctx.font = `700 ${12 * dpr}px ui-sans-serif`; ctx.fillStyle = '#ff9a8a'; ctx.textAlign = 'left'; ctx.fillText('Ataque-movimento: clique no destino', 14 * dpr, f.DH - 120 * dpr); }
  }
  private bar(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, v: number, col: string) {
    const h = Math.max(2, 2.5 * this.dpr);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col; ctx.fillRect(cx - w / 2, y, w * Math.max(0, Math.min(1, v)), h);
  }

  private events(ev: SimEvent[]) {
    const mine = (n?: number) => n === 0;
    for (const e of ev) {
      if (e.k === 'shot') this.fx.push({ k: 'shot', x: e.x!, y: e.y!, x2: e.x2!, y2: e.y2!, t: 0, dur: 0.3, col: mine(e.n) ? '#b8ff7a' : '#ff9a6a' });
      else if (e.k === 'hit') this.fx.push({ k: 'hit', x: e.x!, y: e.y!, t: 0, dur: 0.35, col: 'rgba(255,230,200,0.9)' });
      else if (e.k === 'death') { this.fx.push({ k: 'death', x: e.x!, y: e.y!, t: 0, dur: 0.9, col: 'rgba(255,255,255,0.7)' }); for (const s of [...this.sel]) if (!this.client.cur.has(s)) this.sel.delete(s); }
      else if (e.k === 'built') this.fx.push({ k: 'built', x: e.x!, y: e.y!, t: 0, dur: 1.2, col: 'rgba(160,255,200,0.9)' });
    }
    if (this.fx.length > 300) this.fx.splice(0, this.fx.length - 300);
  }

  // ---------------------------------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------------------------------
  private screenOf(e: Ent, f: GameFrame): [number, number] {
    const [px, py] = this.client.pos(e);
    const aqua = this.stageOf(e) <= Stage.AQUA_LEVIATHAN;
    const zoomedOut = f.lod === 'regional' || f.lod === 'world';
    let x = px;
    const dx = x - f.cam.x;
    if (dx > WX / 2) x -= WX; else if (dx < -WX / 2) x += WX;
    const L = zoomedOut ? 0 : this.lift(px, py, f, aqua);
    const sh = zoomedOut ? null : this.sheet(e, 'idle');
    const [sx, sy] = f.toScreen(x, py - L - (sh ? sh.ay * 0.45 : 0));
    return [sx / f.dpr, sy / f.dpr];
  }
  private bScreen(b: Bld, f: GameFrame): [number, number] {
    let x = b.x;
    const dx = x - f.cam.x;
    if (dx > WX / 2) x -= WX; else if (dx < -WX / 2) x += WX;
    const [sx, sy] = f.toScreen(x, b.y - 10);
    return [sx / f.dpr, sy / f.dpr];
  }
  /** what is under a screen point: a creature or a building (nearest) */
  pick(sx: number, sy: number): { e?: Ent; b?: Bld } {
    const f = this.lastF;
    if (!f) return {};
    let best: Ent | undefined, bd = 16;
    for (const e of this.client.cur.values()) {
      const [x, y] = this.screenOf(e, f);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { e: best };
    let bb: Bld | undefined, bbd = 26;
    for (const b of this.client.builds) { const [x, y] = this.bScreen(b, f); const d = Math.hypot(x - sx, y - sy); if (d < bbd) { bbd = d; bb = b; } }
    return bb ? { b: bb } : {};
  }
  pointerDown(p: PointerInfo) {
    this.mouse = { sx: p.sx, sy: p.sy, wx: p.wx, wy: p.wy };
    if (p.button === 0) {
      if (this.placing !== null) {
        this.client.cmd({ c: 'place', type: this.placing, x: p.wx, y: p.wy, builder: [...this.sel].find(i => this.client.cur.get(i) && this.defs.castes[this.client.cur.get(i)!.kind]?.builder && this.client.cur.get(i)!.nation === 0) });
        if (!p.shift) this.placing = null;
        this.changed();
        return true;
      }
      if (this.armAttack) { this.command(p, true); this.armAttack = false; this.changed(); return true; }
      this.down = { sx: p.sx, sy: p.sy, button: 0 };
      return true;
    }
    if (p.button === 2) {
      if (this.placing !== null || this.armAttack) { this.placing = null; this.armAttack = false; this.changed(); return true; }
      this.command(p, false);
      return true;
    }
    return false;
  }
  pointerMove(p: PointerInfo) {
    this.mouse = { sx: p.sx, sy: p.sy, wx: p.wx, wy: p.wy };
    if (this.down && Math.hypot(p.sx - this.down.sx, p.sy - this.down.sy) > 6) {
      this.boxNow = { x0: Math.min(this.down.sx, p.sx), y0: Math.min(this.down.sy, p.sy), x1: Math.max(this.down.sx, p.sx), y1: Math.max(this.down.sy, p.sy) };
    }
  }
  pointerUp(p: PointerInfo) {
    if (!this.down) return;
    const f = this.lastF;
    if (this.boxNow && f) {
      const b = this.boxNow;
      if (!p.shift) { this.sel.clear(); this.selB = null; }
      for (const e of this.client.cur.values()) {
        if (e.nation !== 0) continue;
        const [x, y] = this.screenOf(e, f);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) this.sel.add(e.id);
      }
    } else {
      const hit = this.pick(p.sx, p.sy);
      if (!p.shift) { this.sel.clear(); this.selB = null; }
      if (hit.e && hit.e.nation === 0) {
        if (p.dbl && f) {
          // the same caste on screen
          for (const e of this.client.cur.values()) {
            if (e.nation !== 0 || e.kind !== hit.e.kind) continue;
            const [x, y] = this.screenOf(e, f);
            if (x >= 0 && y >= 0 && x <= f.DW / f.dpr && y <= f.DH / f.dpr) this.sel.add(e.id);
          }
        } else this.sel.add(hit.e.id);
      } else if (hit.b && hit.b.nation === 0) { this.selB = hit.b.id; }
      else if (hit.e || hit.b) { /* inspecting others: nothing to select */ }
    }
    this.down = null; this.boxNow = null;
    this.changed();
  }
  private command(p: PointerInfo, attackMove: boolean) {
    const ids = [...this.sel].filter(i => this.client.cur.get(i)?.nation === 0);
    if (!ids.length) {
      if (this.selB !== null) { this.client.cmd({ c: 'rally', b: this.selB, x: p.wx, y: p.wy }); this.fx.push({ k: 'mark', x: p.wx, y: p.wy, t: 0, dur: 0.6, col: '#9ad8ff' }); }
      return;
    }
    const hit = this.pick(p.sx, p.sy);
    if (hit.e && hit.e.nation !== 0) { this.client.cmd({ c: 'order', ids, o: Ord.ATTACK, x: hit.e.x, y: hit.e.y, target: hit.e.id }); this.fx.push({ k: 'mark', x: hit.e.x, y: hit.e.y, t: 0, dur: 0.6, col: '#ff8a7a' }); return; }
    if (hit.b && hit.b.nation !== 0) { this.client.cmd({ c: 'order', ids, o: Ord.ATTACK, x: hit.b.x, y: hit.b.y, targetB: hit.b.id }); this.fx.push({ k: 'mark', x: hit.b.x, y: hit.b.y, t: 0, dur: 0.6, col: '#ff8a7a' }); return; }
    const gatherers = ids.filter(i => this.defs.castes[this.client.cur.get(i)!.kind].gather);
    const fighters = ids.filter(i => !this.defs.castes[this.client.cur.get(i)!.kind].gather);
    if (gatherers.length) this.client.cmd({ c: 'order', ids: gatherers, o: Ord.GATHER, x: p.wx, y: p.wy });
    if (fighters.length) this.client.cmd({ c: 'order', ids: fighters, o: attackMove ? Ord.AMOVE : Ord.MOVE, x: p.wx, y: p.wy });
    this.fx.push({ k: 'mark', x: p.wx, y: p.wy, t: 0, dur: 0.6, col: attackMove ? '#ff8a7a' : '#a0ffc0' });
  }
  key(k: string, down: boolean) {
    if (!down) return false;
    const ids = [...this.sel];
    if (k === 'escape') {
      if (this.placing !== null || this.armAttack) { this.placing = null; this.armAttack = false; this.changed(); return true; }
      if (this.sel.size || this.selB !== null) { this.sel.clear(); this.selB = null; this.changed(); return true; }
      return false;
    }
    if (k === 'a' && ids.length) { this.armAttack = true; this.changed(); return true; }
    if ((k === 's' || k === 'h') && ids.length && this.lastF) {
      for (const i of ids) { const e = this.client.cur.get(i); if (e) this.client.cmd({ c: 'order', ids: [i], o: k === 'h' ? Ord.HOLD : Ord.IDLE, x: e.x, y: e.y }); }
      return true;
    }
    if (k === ' ' && (ids.length || this.selB !== null)) {
      const e = ids.length ? this.client.cur.get(ids[0]) : undefined, b = this.client.builds.find(q => q.id === this.selB);
      const p = e ?? b;
      if (p) this.api?.jump(p.x, p.y);
      return true;
    }
    return false;
  }
  sight() {
    const s = this.client.sights, out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < s.length; i += 3) out.push({ x: s[i], y: s[i + 1], r: s[i + 2] });
    return out;
  }
  /** selected creatures grouped by caste (for the HUD) */
  selection() {
    const by = new Map<number, number[]>();
    for (const i of this.sel) { const e = this.client.cur.get(i); if (!e || e.nation !== 0) continue; if (!by.has(e.kind)) by.set(e.kind, []); by.get(e.kind)!.push(i); }
    return by;
  }
}

// ---------------------------------------------------------------------------------------------------
// Procedural pixel-art buildings
// ---------------------------------------------------------------------------------------------------
function canvas(w: number, h: number): [HTMLCanvasElement, ImageData] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!.createImageData(w, h)];
}
function put(img: ImageData, x: number, y: number, r: number, g: number, b: number, a = 255) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const k = (y * img.width + x) * 4;
  img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = a;
}
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** a clutch of translucent eggs with embryos, among seaweed, tinted by the nation */
function eggNest(col: number[]): HTMLCanvasElement {
  const W = 56, H = 34;
  const [c, img] = canvas(W, H);
  // seaweed fronds behind
  for (let f = 0; f < 7; f++) {
    const x0 = 6 + f * 7 + Math.floor(hash(f, 1) * 4), len = 12 + Math.floor(hash(f, 2) * 12);
    for (let i = 0; i < len; i++) { const x = x0 + Math.round(Math.sin(i * 0.4 + f) * 1.5); put(img, x, H - 6 - i, 40, 90 + i * 2, 50); if (i % 3 === 0) put(img, x + 1, H - 6 - i, 70, 130, 60); }
  }
  // egg mound
  const eggs: [number, number, number][] = [];
  for (let e = 0; e < 22; e++) eggs.push([10 + hash(e, 3) * 36, H - 6 - hash(e, 4) * 10 * (1 - Math.abs(hash(e, 3) - 0.5) * 1.4), 2.5 + hash(e, 5) * 2]);
  eggs.sort((a, b) => a[1] - b[1]);
  for (const [ex, ey, r] of eggs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = (x * x + y * y) / (r * r);
      if (d > 1) continue;
      const rim = d > 0.6;
      const lit = x + y < -r * 0.6;
      const k = rim ? 0.55 : lit ? 1.15 : 0.85;
      put(img, Math.round(ex + x), Math.round(ey + y), Math.min(255, (120 + col[0] * 0.5) * k), Math.min(255, (120 + col[1] * 0.5) * k), Math.min(255, (130 + col[2] * 0.5) * k), rim ? 255 : 210);
    }
    put(img, Math.round(ex), Math.round(ey), 40, 30, 40); put(img, Math.round(ex) + 1, Math.round(ey), 60, 40, 50);   // embryo
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
/** a burrow mound with its dark entrance and the nation's scent marks */
function denMound(col: number[]): HTMLCanvasElement {
  const W = 60, H = 32;
  const [c, img] = canvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - (H - 4)) / (H - 6);
    const d = nx * nx + ny * ny;
    if (d > 1 || y > H - 3) continue;
    const t = hash(x >> 1, y >> 1);
    const shade = 0.75 + (1 - (x + (H - y)) / (W + H)) * 0.4 + (t - 0.5) * 0.15;
    put(img, x, y, 110 * shade, 82 * shade, 54 * shade);
    if (d > 0.82) put(img, x, y, 70, 52, 34);
  }
  // entrance
  for (let y = -6; y <= 0; y++) for (let x = -7; x <= 7; x++) if ((x * x) / 49 + (y * y) / 36 <= 1) put(img, W / 2 + x, H - 6 + y, 18, 12, 10);
  // grass tufts and scent marks
  for (let g = 0; g < 10; g++) { const x = Math.floor(hash(g, 7) * W), y = 8 + Math.floor(hash(g, 8) * (H - 12)); put(img, x, y, 90, 130, 60); put(img, x, y - 1, 110, 150, 70); }
  for (let m = 0; m < 6; m++) put(img, 6 + Math.floor(hash(m, 9) * (W - 12)), H - 3, col[0], col[1], col[2]);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
/** the rock a sentinel stands guard on */
function rockMound(col: number[], wet: boolean): HTMLCanvasElement {
  const W = 34, H = 16;
  const [c, img] = canvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H) / H;
    if (nx * nx + ny * ny > 1) continue;
    const k = 0.7 + (1 - (x + (H - y) * 1.5) / (W + H * 1.5)) * 0.5 + (hash(x, y) - 0.5) * 0.12;
    put(img, x, y, (wet ? 90 : 120) * k, (wet ? 100 : 112) * k, (wet ? 104 : 100) * k);
  }
  for (let m = 0; m < 4; m++) put(img, 6 + m * 7, H - 2, col[0], col[1], col[2]);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
