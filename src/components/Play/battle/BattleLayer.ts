// The battle on the planet view: every soldier drawn on the terrain (the species with its unit's loadout, its
// faction's colours, its facing and animation; deaths play once and the bodies stay), mounts under riders, guns
// with their crews, war machines and aircraft from the vehicle generator; trenches, barbed wire and craters as
// ground stamps; missiles, muzzle flashes, smoke and explosions over it. Orders work like Total War: click / drag
// to select, right click to move or attack, right drag to draw the line (width and facing).
import type { GameLayer, GameFrame, GameDraw, WorldApi, PointerInfo } from '../../../lib/game/layer';
import { BattleSim, type Unit, type Soldier, type Form, formsFor, dirOf } from '../../../lib/game/battle/sim';
import type { Genome } from '../../../lib/creature/genome';
import type { Culture } from '../../../lib/structure/genome';
import { DIRS, type Dir8 } from '../../../lib/creature/pose';
import { rgba } from '../../../lib/render/glWorld';
import { WarArt } from '../war/art';
import type { Death } from '../../../lib/creature/death';

const WRECK = rgba(70, 64, 60, 1);
const DIM = rgba(150, 150, 150, 1);

export class BattleLayer implements GameLayer {
  api: WorldApi | null = null;
  sel = new Set<Unit>();
  speed = 1;
  paused = false;
  private down: { sx: number; sy: number; wx: number; wy: number; button: number } | null = null;
  private boxNow: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private dragLine: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private lastF: GameFrame | null = null;
  private stamps: { trench: HTMLCanvasElement; wire: HTMLCanvasElement; crater: HTMLCanvasElement[] } | null = null;
  private stampList: { c: HTMLCanvasElement; x: number; y: number }[] = [];
  private craterN = 0;
  /** last selection change (the HUD redraws) */
  onChange: (() => void) | null = null;
  /** strike / barrage target mode (air units, artillery) */
  aim: 'fire' | null = null;
  private lastClick = { t: 0, u: null as Unit | null };

  constructor(readonly sim: BattleSim, readonly art: WarArt, readonly genomes: [Genome, Genome], readonly cultures: [Culture, Culture], readonly me: 0 | 1) {
    this.makeStamps();
    this.prefetch();
  }

  attach(api: WorldApi) { this.api = api; }
  detach() { this.api = null; }
  private changed() { this.onChange?.(); }

  /** request every sheet the battle will need, the visible ones first */
  private prefetch() {
    const seen = new Set<string>();
    for (const u of this.sim.units) {
      const g = this.genomes[u.side], key = `${u.side}|${u.def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (u.def.el === 'vehicle') continue;
      for (const a of ['idle', 'walk', 'use', 'run'] as const) this.art.soldier(g, u.era, u.def, a);
    }
    for (const u of this.sim.units) {
      const key = `${u.side}|${u.def.id}|d`;
      if (seen.has(key) || u.def.el === 'vehicle') continue;
      seen.add(key);
      for (const d of ['fall_fwd', 'fall_back', 'sever_head', 'burst_top', 'cut_h'] as Death[]) this.art.soldier(this.genomes[u.side], u.era, u.def, 'idle', d);
    }
    if (this.sim.units.some(u => u.def.el === 'mounted')) for (const a of ['idle', 'walk', 'run'] as const) this.art.mount(a);
  }
  /** fraction of the needed idle sheets that are ready (loading screen) */
  readiness() {
    let n = 0, ok = 0;
    const seen = new Set<string>();
    for (const u of this.sim.units) {
      const key = `${u.side}|${u.def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      n++;
      if (u.def.el === 'vehicle') { if (this.art.vehicle(this.cultures[u.side], u.def, u.era, DIRS[dirOf(Math.cos(u.fa), Math.sin(u.fa))], 'idle', 0)) ok++; }
      else if (this.art.soldier(this.genomes[u.side], u.era, u.def, 'idle', null, true)) ok++;
    }
    return n ? ok / n : 1;
  }

  // -------------------------------------------------------------------------------------------------
  // Ground stamps: trench, wire, craters
  // -------------------------------------------------------------------------------------------------
  private makeStamps() {
    const mk = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); return c; };
    const trench = mk(26, 18, x => {
      x.fillStyle = '#6b5236'; x.fillRect(0, 2, 26, 14);           // spoil
      x.fillStyle = '#2b1f14'; x.fillRect(0, 5, 26, 8);            // the cut
      x.fillStyle = '#3b2b1c'; x.fillRect(0, 11, 26, 2);
      x.fillStyle = '#b7a37a';                                      // sandbags along the lip
      for (let i = 0; i < 26; i += 5) { x.fillRect(i, 1, 4, 3); x.fillStyle = i % 10 ? '#a8946c' : '#c4b089'; }
      x.fillStyle = '#5e4a32'; for (let i = 2; i < 26; i += 7) x.fillRect(i, 7, 1, 5); // duckboard posts
    });
    const wire = mk(22, 12, x => {
      x.strokeStyle = '#5a5650'; x.lineWidth = 1;
      for (let i = 0; i < 22; i += 7) { x.beginPath(); x.moveTo(i, 2); x.lineTo(i + 6, 10); x.moveTo(i + 6, 2); x.lineTo(i, 10); x.stroke(); }
      x.strokeStyle = '#8b877f'; x.beginPath(); x.moveTo(0, 5); for (let i = 0; i <= 22; i += 2) x.lineTo(i, 5 + ((i / 2) % 2 ? -1.5 : 1.5)); x.stroke();
    });
    const crater = [10, 18, 28].map(r => mk(r * 2 + 4, r + 4, x => {
      x.fillStyle = 'rgba(70,55,40,0.85)'; x.beginPath(); x.ellipse(r + 2, r / 2 + 2, r, r / 2, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(30,24,18,0.9)'; x.beginPath(); x.ellipse(r + 2, r / 2 + 3, r * 0.62, r * 0.3, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(120,100,76,0.7)'; x.beginPath(); x.ellipse(r + 2, r / 2, r * 0.8, r * 0.18, 0, Math.PI, Math.PI * 2); x.fill();
    }));
    this.stamps = { trench, wire, crater };
    const along = (line: [number, number][], c: HTMLCanvasElement, step: number) => {
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = line[i - 1], [bx, by] = line[i];
        const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step));
        for (let k = 0; k < n; k++) this.stampList.push({ c, x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n });
      }
    };
    for (const l of this.sim.trenches) along(l, trench, 12);
    for (const l of this.sim.wire) along(l, wire, 14);
  }

  // -------------------------------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------------------------------
  update(f: GameFrame) {
    this.lastF = f;
    if (!this.paused) {
      let left = Math.min(0.25, f.dt) * this.speed;
      while (left > 1e-4) { const d = Math.min(0.05, left); this.sim.step(d); left -= d; }
    } else this.sim.step(0);
    // craters become ground stamps
    while (this.craterN < this.sim.craters.length && this.stamps) {
      const c = this.sim.craters[this.craterN++];
      if (c.k !== 'crater') continue;
      this.stampList.push({ c: this.stamps.crater[c.r < 12 ? 0 : c.r < 20 ? 1 : 2], x: c.x, y: c.y });
    }
    for (const u of [...this.sel]) if (u.gone || u.shattered || this.sim.count(u) === 0) this.sel.delete(u);
  }

  private visible(u: Unit) { return this.sim.style !== 'combined' || u.side === this.me || u.seen[this.me]; }
  private lift(x: number, y: number) { return this.api ? this.api.liftAt(x, y) : 0; }

  collect(f: GameFrame): GameDraw[] {
    const out: GameDraw[] = [];
    const v = f.view, pad = 80;
    const inView = (x: number, y: number) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad * 2;
    // ground stamps first in their row
    for (const s of this.stampList) {
      if (!inView(s.x, s.y)) continue;
      const L = this.lift(s.x, s.y);
      out.push({ c: s.c, sx: 0, sy: 0, w: s.c.width, h: s.c.height, x: s.x, y: s.y - L, ax: s.c.width / 2, ay: s.c.height / 2, gy: s.y - 8 });
    }
    const t = this.sim.t;
    for (const s of this.sim.soldiers) {
      const u = s.u;
      if (!u.deployed && !u.strike) continue;
      if (s.fled || !inView(s.x, s.y)) continue;
      if (s.alive && !this.visible(u)) continue;
      const g = this.genomes[u.side];
      const L = this.lift(s.x, s.y);
      const y = s.y - L;
      const dir = DIRS[s.dir] as Dir8;
      if (u.def.el === 'vehicle' || s.isPiece) {
        const anim = !s.alive ? 'idle' : s.useT > 0 ? 'use' : s.moving ? 'move' : 'idle';
        const sh = this.art.vehicle(this.cultures[u.side], u.def, u.era, dir, anim, Math.hypot(s.x - f.cam.x, s.y - f.cam.y) / 100) ?? (anim !== 'idle' ? this.art.vehicle(this.cultures[u.side], u.def, u.era, dir, 'idle') : null);
        if (!sh) continue;
        const fr = s.alive ? Math.floor(s.ph * 8) % sh.frames : 0;
        const z = s.z;
        out.push({ c: sh.c, sx: fr * sh.w, sy: 0, w: sh.w, h: sh.h, x: s.x, y: y - z, ax: sh.ax, ay: sh.ay, gy: s.y + (z ? 40 : 0), shadow: z ? 10 : undefined, shadowY: y, ...(s.alive ? {} : { tint: WRECK }) });
        continue;
      }
      if (!s.alive) {
        if (!s.death) continue;
        const sh = this.art.soldier(g, u.era, u.def, 'idle', s.death);
        if (!sh) continue;
        const fr = Math.min(sh.frames - 1, Math.floor((t - s.dieT) / 0.15));
        out.push({ c: sh.canvas, sx: fr * sh.cw, sy: s.dir * sh.ch, w: sh.cw, h: sh.ch, x: s.x, y, ax: sh.ax, ay: sh.ay, gy: s.y - 2 });
        if (u.def.el === 'mounted' && fr < 4) { const ms = this.art.mount('idle'); if (ms) out.push({ c: ms.canvas, sx: 0, sy: s.dir * ms.ch, w: ms.cw, h: ms.ch, x: s.x + 6, y, ax: ms.ax, ay: ms.ay, gy: s.y - 3, tint: DIM }); }
        continue;
      }
      const anim = s.anim;
      const sh = this.art.soldier(g, u.era, u.def, anim) ?? this.art.soldier(g, u.era, u.def, 'idle');
      if (!sh) continue;
      const fr = anim === 'use' ? Math.min(sh.frames - 1, Math.floor((1 - s.useT / 0.6) * sh.frames)) : anim === 'idle' ? Math.floor(s.ph * 3) % sh.frames : Math.floor(s.ph * (anim === 'run' ? 13 : 9)) % sh.frames;
      if (u.def.el === 'mounted') {
        const ma = anim === 'run' ? 'run' : anim === 'walk' ? 'walk' : 'idle';
        const ms = this.art.mount(ma) ?? this.art.mount('idle');
        let off = 10;
        if (ms) {
          const mf = Math.floor(s.ph * (ma === 'run' ? 12 : 8)) % ms.frames;
          out.push({ c: ms.canvas, sx: mf * ms.cw, sy: s.dir * ms.ch, w: ms.cw, h: ms.ch, x: s.x, y, ax: ms.ax, ay: ms.ay, gy: s.y, shadow: 5, shadowY: y });
          off = ms.ay * 0.55;
        }
        out.push({ c: sh.canvas, sx: fr * sh.cw, sy: s.dir * sh.ch, w: sh.cw, h: sh.ch, x: s.x, y: y - off, ax: sh.ax, ay: sh.ay, gy: s.y + 0.02 });
        continue;
      }
      out.push({ c: sh.canvas, sx: fr * sh.cw, sy: s.dir * sh.ch, w: sh.cw, h: sh.ch, x: s.x, y: y + (s.u.dug ? 4 : 0), ax: sh.ax, ay: sh.ay, gy: s.y, shadow: 3, shadowY: y });
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------------
  // Overlay: zones, sectors, banners, orders, missiles and effects
  // -------------------------------------------------------------------------------------------------
  overlay(o: CanvasRenderingContext2D, f: GameFrame) {
    const sim = this.sim, dpr = f.dpr, S = f.S;
    const P = (x: number, y: number) => f.toScreen(x, y - this.lift(x, y));
    o.save();
    // battlefield edge
    const corner = (a: number, b: number) => { const [x, y] = sim.at(a, b); return f.toScreen(x, y); };
    const hl = sim.setup.hl, hw = sim.setup.hw;
    o.strokeStyle = 'rgba(255,255,255,0.25)'; o.lineWidth = 1.5 * dpr; o.setLineDash([8 * dpr, 6 * dpr]);
    o.beginPath(); [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].forEach(([a, b], i) => { const [x, y] = corner(a, b); if (i) o.lineTo(x, y); else o.moveTo(x, y); }); o.closePath(); o.stroke();
    o.setLineDash([]);
    // deployment zones
    if (sim.phase === 'deploy') for (const k of [0, 1] as const) {
      const z = sim.zones[k];
      const pts = [[-z.hl, -z.hw], [z.hl, -z.hw], [z.hl, z.hw], [-z.hl, z.hw]].map(([a, b]) => f.toScreen(z.x + sim.fx0 * a + sim.rx * b, z.y + sim.fy0 * a + sim.ry * b));
      o.fillStyle = k === this.me ? 'rgba(80,200,255,0.12)' : 'rgba(255,80,60,0.10)';
      o.strokeStyle = k === this.me ? 'rgba(120,220,255,0.7)' : 'rgba(255,110,90,0.6)'; o.lineWidth = 2 * dpr;
      o.beginPath(); pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.closePath(); o.fill(); o.stroke();
    }
    // sectors (combined arms) and the siege centre
    for (const s of sim.sectors) {
      const [x, y] = f.toScreen(s.x, s.y), r = s.r * S;
      const col = s.owner === this.me ? '80,200,255' : s.owner === -1 ? '220,220,220' : '255,100,80';
      o.fillStyle = `rgba(${col},0.08)`; o.strokeStyle = `rgba(${col},0.75)`; o.lineWidth = 2 * dpr;
      o.beginPath(); o.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); o.fill(); o.stroke();
      o.strokeStyle = this.me === 0 ? (s.p > 0 ? 'rgba(80,200,255,0.9)' : 'rgba(255,100,80,0.9)') : (s.p < 0 ? 'rgba(80,200,255,0.9)' : 'rgba(255,100,80,0.9)'); o.lineWidth = 4 * dpr;
      o.beginPath(); o.ellipse(x, y, r, r * 0.62, 0, -Math.PI / 2, -Math.PI / 2 + Math.abs(s.p) * Math.PI * 2); o.stroke();
      this.tag(o, x, y - r * 0.62 - 10 * dpr, s.name, `rgb(${col})`, dpr);
    }
    if (sim.setup.siege) {
      const [x, y] = f.toScreen(sim.setup.siege.x, sim.setup.siege.y), r = 160 * S;
      o.strokeStyle = 'rgba(255,220,120,0.6)'; o.lineWidth = 2 * dpr; o.setLineDash([6 * dpr, 5 * dpr]);
      o.beginPath(); o.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); o.stroke(); o.setLineDash([]);
      if (sim.hold > 0) this.tag(o, x, y - r * 0.62 - 10 * dpr, `Praça: ${Math.round((sim.hold / 60) * 100)}%`, '#fde68a', dpr);
    }
    // selected units: their footprint and orders
    for (const u of this.sel) {
      const men = sim.alive(u);
      o.fillStyle = 'rgba(120,230,255,0.28)';
      for (const s of men) { const [x, y] = P(s.x, s.y); o.beginPath(); o.ellipse(x, y, 4.5 * S + 1, 2.4 * S + 1, 0, 0, Math.PI * 2); o.fill(); }
      const od = u.order;
      const [cx, cy] = sim.centre(u);
      const [sx, sy] = P(cx, cy);
      if (od.k === 'move') {
        const [tx, ty] = P(od.x, od.y);
        o.strokeStyle = 'rgba(120,230,255,0.7)'; o.lineWidth = 1.5 * dpr; o.setLineDash([5 * dpr, 4 * dpr]);
        o.beginPath(); o.moveTo(sx, sy); o.lineTo(tx, ty); o.stroke(); o.setLineDash([]);
        this.ghost(o, f, u, od.x, od.y, od.fa, 'rgba(120,230,255,0.45)');
      } else if (od.k === 'attack' || u.target) {
        const t = od.k === 'attack' ? od.t : u.target!;
        const [tx, ty] = sim.centre(t), [px, py] = P(tx, ty);
        o.strokeStyle = 'rgba(255,90,70,0.8)'; o.lineWidth = 2 * dpr;
        o.beginPath(); o.moveTo(sx, sy); o.lineTo(px, py); o.stroke();
        this.arrowHead(o, sx, sy, px, py, 8 * dpr);
      } else if (od.k === 'fire' || od.k === 'strike') {
        const [px, py] = P(od.x, od.y);
        o.strokeStyle = 'rgba(255,170,60,0.9)'; o.lineWidth = 2 * dpr;
        o.beginPath(); o.ellipse(px, py, 40 * S, 25 * S, 0, 0, Math.PI * 2); o.stroke();
        o.beginPath(); o.moveTo(px - 8 * dpr, py); o.lineTo(px + 8 * dpr, py); o.moveTo(px, py - 8 * dpr); o.lineTo(px, py + 8 * dpr); o.stroke();
      }
    }
    // right-drag line (formation preview)
    if (this.dragLine && this.sel.size) {
      const L = this.dragLine;
      const [ax, ay] = f.toScreen(L.x0, L.y0), [bx, by] = f.toScreen(L.x1, L.y1);
      o.strokeStyle = 'rgba(120,230,255,0.9)'; o.lineWidth = 2 * dpr;
      o.beginPath(); o.moveTo(ax, ay); o.lineTo(bx, by); o.stroke();
      for (const p of this.lineSlots(L.x0, L.y0, L.x1, L.y1)) this.ghost(o, f, p.u, p.x, p.y, p.fa, 'rgba(120,230,255,0.4)');
    }
    // missiles
    for (const p of sim.shots) {
      const k = p.t / p.dur;
      const x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * p.arc;
      const [sx, sy] = f.toScreen(x, y);
      const ang = Math.atan2((p.y1 - p.y0) - Math.cos(k * Math.PI) * Math.PI * p.arc, p.x1 - p.x0);
      switch (p.k) {
        case 'arrow': case 'bolt': case 'javelin': {
          const len = (p.k === 'javelin' ? 10 : 6) * S + 2;
          o.strokeStyle = p.k === 'javelin' ? '#7a5a36' : '#3a2a1a'; o.lineWidth = Math.max(1, S * 0.8);
          o.beginPath(); o.moveTo(sx - Math.cos(ang) * len, sy - Math.sin(ang) * len); o.lineTo(sx, sy); o.stroke();
          break;
        }
        case 'bullet': case 'tracer': {
          const len = (p.k === 'tracer' ? 18 : 8) * S;
          o.strokeStyle = p.k === 'tracer' ? 'rgba(255,230,140,0.95)' : 'rgba(255,240,200,0.7)'; o.lineWidth = Math.max(1, S * (p.k === 'tracer' ? 1.2 : 0.7));
          o.beginPath(); o.moveTo(sx - Math.cos(ang) * len, sy - Math.sin(ang) * len); o.lineTo(sx, sy); o.stroke();
          break;
        }
        case 'plasma': {
          o.fillStyle = 'rgba(140,255,240,0.95)'; o.beginPath(); o.arc(sx, sy, 2.5 * S + 1, 0, Math.PI * 2); o.fill();
          o.fillStyle = 'rgba(140,255,240,0.3)'; o.beginPath(); o.arc(sx, sy, 6 * S + 2, 0, Math.PI * 2); o.fill();
          break;
        }
        case 'rocket': {
          o.strokeStyle = 'rgba(210,210,210,0.5)'; o.lineWidth = 3 * S;
          o.beginPath(); o.moveTo(sx - Math.cos(ang) * 30 * S, sy - Math.sin(ang) * 30 * S); o.lineTo(sx, sy); o.stroke();
          o.fillStyle = '#ffb347'; o.fillRect(sx - 1.5 * S, sy - 1.5 * S, 3 * S, 3 * S);
          break;
        }
        default: {
          o.fillStyle = p.k === 'stone' ? '#6f6a60' : p.k === 'grenade' ? '#3c4a2c' : '#222';
          const r = (p.k === 'stone' ? 3.5 : p.k === 'bomb' ? 3 : 2) * S + 1;
          o.beginPath(); o.arc(sx, sy, r, 0, Math.PI * 2); o.fill();
        }
      }
    }
    // effects
    for (const e of sim.fx) {
      if (e.k === 'flash') {
        const [x, y] = f.toScreen(e.x, e.y), r = (e.big ? 9 : 4) * S * (1 - e.t / 0.25) + 1;
        o.fillStyle = 'rgba(255,240,170,0.95)'; o.beginPath(); o.arc(x, y, r, 0, Math.PI * 2); o.fill();
      } else if (e.k === 'tracer') {
        const [x0, y0] = f.toScreen(e.x0, e.y0), [x1, y1] = f.toScreen(e.x1, e.y1);
        o.strokeStyle = `rgba(255,220,120,${0.6 * (1 - e.t / 0.25)})`; o.lineWidth = Math.max(1, S * 0.8);
        o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke();
      } else if (e.k === 'boom') {
        const [x, y] = f.toScreen(e.x, e.y), k = e.t / 1.2, r = e.r * S * (0.4 + k * 0.9);
        if (k < 0.35) { o.fillStyle = `rgba(255,${200 - k * 300},80,${0.9 - k * 2})`; o.beginPath(); o.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); o.fill(); }
        o.fillStyle = `rgba(60,48,38,${0.5 * (1 - k)})`; o.beginPath(); o.ellipse(x, y - r * k * 0.8, r * 0.7, r * 0.55, 0, 0, Math.PI * 2); o.fill();
      } else if (e.k === 'smoke') {
        const life = e.dark ? 9 : 6, k = e.t / life;
        const [x, y] = f.toScreen(e.x + e.t * 6, e.y - e.t * (e.dark ? 9 : 5)), r = e.r * S * (0.6 + k * 2.2);
        o.fillStyle = e.dark ? `rgba(55,52,50,${0.5 * (1 - k)})` : `rgba(225,225,220,${0.55 * (1 - k)})`;
        o.beginPath(); o.arc(x, y, r, 0, Math.PI * 2); o.fill();
      } else if (e.k === 'dust') {
        const [x, y] = f.toScreen(e.x, e.y), k = e.t / 1.5;
        o.fillStyle = `rgba(150,125,90,${0.5 * (1 - k)})`; o.beginPath(); o.ellipse(x, y, 10 * S * (1 + k), 5 * S * (1 + k), 0, 0, Math.PI * 2); o.fill();
      }
    }
    // unit banners
    for (const u of sim.units) {
      if (!u.deployed || u.gone || (u.shattered && sim.count(u) === 0) || !this.visible(u)) continue;
      const n = sim.count(u);
      if (!n) continue;
      const [cx, cy] = sim.centre(u);
      const men = sim.alive(u);
      let top = cy;
      for (const s of men) top = Math.min(top, s.y - s.z);
      const [x, y] = P(cx, top);
      this.banner(o, x, y - 30 * Math.max(0.6, S) - 4 * dpr, u, n, dpr);
    }
    // aiming mode hint
    if (this.aim) { o.fillStyle = 'rgba(255,170,60,0.9)'; o.font = `700 ${12 * dpr}px ui-sans-serif`; o.textAlign = 'center'; o.fillText('Clique no alvo do bombardeio (botão direito cancela)', f.DW / 2, 70 * dpr); }
    o.restore();
  }
  private tag(o: CanvasRenderingContext2D, x: number, y: number, text: string, col: string, dpr: number) {
    o.font = `700 ${10 * dpr}px ui-sans-serif, system-ui`;
    const w = o.measureText(text).width + 10 * dpr;
    o.fillStyle = 'rgba(8,10,16,0.75)'; o.beginPath(); o.roundRect(x - w / 2, y - 9 * dpr, w, 15 * dpr, 4 * dpr); o.fill();
    o.fillStyle = col; o.textAlign = 'center'; o.fillText(text, x, y + 2 * dpr);
  }
  private banner(o: CanvasRenderingContext2D, x: number, y: number, u: Unit, n: number, dpr: number) {
    const mine = u.side === this.me, sel = this.sel.has(u);
    const w = 30 * dpr, h = 18 * dpr;
    // pole and flag in the faction's colour
    o.strokeStyle = 'rgba(0,0,0,0.6)'; o.lineWidth = 1.5 * dpr;
    o.beginPath(); o.moveTo(x, y + h); o.lineTo(x, y + h + 8 * dpr); o.stroke();
    o.fillStyle = u.color; o.strokeStyle = sel ? '#fff' : mine ? 'rgba(160,230,255,0.9)' : 'rgba(255,120,100,0.9)'; o.lineWidth = (sel ? 2.5 : 1.2) * dpr;
    o.beginPath(); o.roundRect(x - w / 2, y, w, h, 3 * dpr); o.fill(); o.stroke();
    o.fillStyle = 'rgba(0,0,0,0.7)'; o.font = `800 ${9 * dpr}px ui-sans-serif, system-ui`; o.textAlign = 'center';
    o.fillText(ICON[u.def.cls] ?? '•', x, y + 9 * dpr);
    o.font = `700 ${8 * dpr}px ui-monospace, monospace`; o.fillText(String(n), x, y + 16.5 * dpr);
    // morale bar
    const m = Math.max(0, Math.min(1, u.morale / Math.max(1, u.mor0)));
    o.fillStyle = 'rgba(0,0,0,0.6)'; o.fillRect(x - w / 2, y - 4 * dpr, w, 3 * dpr);
    o.fillStyle = u.rout ? (Math.floor(performance.now() / 250) % 2 ? '#ef4444' : '#7f1d1d') : m > 0.6 ? '#4ade80' : m > 0.3 ? '#facc15' : '#f97316';
    o.fillRect(x - w / 2, y - 4 * dpr, w * (u.rout ? 1 : m), 3 * dpr);
    if (u.sup > 40) { o.fillStyle = '#fbbf24'; o.font = `700 ${8 * dpr}px ui-sans-serif`; o.fillText('⬇', x + w / 2 + 5 * dpr, y + 10 * dpr); }
  }
  private ghost(o: CanvasRenderingContext2D, f: GameFrame, u: Unit, x: number, y: number, fa: number, col: string) {
    const n = this.sim.count(u);
    o.fillStyle = col;
    for (let k = 0; k < n; k++) {
      const [px, py] = this.sim.slotPos(u, k, n, x, y, fa);
      const [sx, sy] = f.toScreen(px, py - this.lift(px, py));
      o.fillRect(sx - 1.5 * f.dpr, sy - 1.5 * f.dpr, 3 * f.dpr, 3 * f.dpr);
    }
    const [sx, sy] = f.toScreen(x, y - this.lift(x, y));
    this.arrowHead(o, sx, sy, sx + Math.cos(fa) * 24 * f.dpr, sy + Math.sin(fa) * 24 * f.dpr, 7 * f.dpr);
  }
  private arrowHead(o: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, s: number) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    o.fillStyle = o.strokeStyle as string;
    o.beginPath(); o.moveTo(x1, y1); o.lineTo(x1 - Math.cos(a - 0.45) * s, y1 - Math.sin(a - 0.45) * s); o.lineTo(x1 - Math.cos(a + 0.45) * s, y1 - Math.sin(a + 0.45) * s); o.closePath(); o.fill();
  }

  // -------------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------------
  /** the unit under a screen point (a soldier or its banner) */
  private pick(sx: number, sy: number): Unit | null {
    const f = this.lastF;
    if (!f) return null;
    const dpr = f.dpr, px = sx * dpr, py = sy * dpr;
    let best: Unit | null = null, bd = 14 * dpr;
    for (const u of this.sim.units) {
      if (!u.deployed || u.gone || !this.visible(u)) continue;
      const [cx, cy] = this.sim.centre(u);
      let top = cy;
      for (const s of this.sim.alive(u)) {
        top = Math.min(top, s.y - s.z);
        const [x, y] = f.toScreen(s.x, s.y - s.z - this.lift(s.x, s.y) - 8);
        const d = Math.hypot(x - px, y - py);
        if (d < bd) { bd = d; best = u; }
      }
      const [bx, by] = f.toScreen(cx, top - this.lift(cx, top));
      const d = Math.hypot(bx - px, by - 30 * Math.max(0.6, f.S) + 5 * dpr - py);
      if (d < 18 * dpr && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  pointerDown(p: PointerInfo) {
    if (this.sim.phase === 'end') return true;
    this.down = { sx: p.sx, sy: p.sy, wx: p.wx, wy: p.wy, button: p.button };
    if (p.button === 2 && this.aim) { this.aim = null; this.down = null; this.changed(); return true; }
    return p.button === 0 || p.button === 2;
  }
  pointerMove(p: PointerInfo) {
    const d = this.down;
    if (!d) return;
    if (d.button === 0 && Math.hypot(p.sx - d.sx, p.sy - d.sy) > 6) this.boxNow = { x0: Math.min(d.sx, p.sx), y0: Math.min(d.sy, p.sy), x1: Math.max(d.sx, p.sx), y1: Math.max(d.sy, p.sy) };
    if (d.button === 2 && Math.hypot(p.sx - d.sx, p.sy - d.sy) > 10) this.dragLine = { x0: d.wx, y0: d.wy, x1: p.wx, y1: p.wy };
  }
  pointerUp(p: PointerInfo) {
    const d = this.down;
    this.down = null;
    if (!d) return;
    const f = this.lastF;
    if (d.button === 0) {
      if (this.aim) {
        for (const u of this.sel) if (u.def.indirect || u.def.cls === 'air') this.sim.orderFire(u, p.wx, p.wy);
        this.aim = null; this.changed();
        return;
      }
      if (this.boxNow && f) {
        const b = this.boxNow;
        if (!p.shift) this.sel.clear();
        for (const u of this.sim.units) {
          if (u.side !== this.me || !u.deployed || u.gone || u.rout) continue;
          const [cx, cy] = this.sim.centre(u);
          const [x, y] = f.toScreen(cx, cy - this.lift(cx, cy));
          if (x / f.dpr >= b.x0 && x / f.dpr <= b.x1 && y / f.dpr >= b.y0 && y / f.dpr <= b.y1) this.sel.add(u);
        }
        this.boxNow = null;
      } else {
        const u = this.pick(p.sx, p.sy);
        const now = performance.now();
        if (u && u.side === this.me) {
          if (now - this.lastClick.t < 350 && this.lastClick.u?.def.id === u.def.id) {
            for (const v of this.sim.units) if (v.side === this.me && v.def.id === u.def.id && v.deployed && !v.gone) this.sel.add(v);
          } else {
            if (!p.shift) this.sel.clear();
            if (p.shift && this.sel.has(u)) this.sel.delete(u); else this.sel.add(u);
          }
          this.lastClick = { t: now, u };
        } else if (!p.shift) this.sel.clear();
      }
      this.changed();
      return;
    }
    if (d.button === 2) {
      const L = this.dragLine;
      this.dragLine = null;
      const mine = [...this.sel].filter(u => u.side === this.me);
      if (!mine.length) return;
      if (L) {
        for (const q of this.lineSlots(L.x0, L.y0, L.x1, L.y1)) {
          if (q.files) q.u.files = q.files;
          this.sim.orderMove(q.u, q.x, q.y, q.fa, p.ctrl || q.u.run);
        }
        this.changed();
        return;
      }
      const t = this.pick(p.sx, p.sy);
      if (t && t.side !== this.me) {
        for (const u of mine) {
          if (u.def.cls === 'air') { const [x, y] = this.sim.centre(t); this.sim.orderStrike(u, x, y); }
          else this.sim.orderAttack(u, t, p.ctrl || u.run || !this.sim.alive(u).length || true);
        }
      } else {
        const art = mine.filter(u => u.def.indirect || u.def.cls === 'air');
        if (art.length === mine.length && !p.shift) for (const u of art) this.sim.orderFire(u, p.wx, p.wy);
        else this.spreadMove(mine.filter(u => u.def.cls !== 'air'), p.wx, p.wy, p.ctrl);
      }
      this.changed();
    }
  }
  /** a group order on a point: the units keep their side-by-side layout, facing the march */
  private spreadMove(units: Unit[], x: number, y: number, run: boolean) {
    if (!units.length) return;
    const cs = units.map(u => this.sim.centre(u));
    const gx = cs.reduce((q, c) => q + c[0], 0) / cs.length, gy = cs.reduce((q, c) => q + c[1], 0) / cs.length;
    const fa = Math.hypot(x - gx, y - gy) > 30 ? Math.atan2(y - gy, x - gx) : units[0].fa;
    // keep the relative positions, rotated to the new facing
    const f0 = units[0].fa;
    const rot = fa - f0;
    units.forEach((u, i) => {
      const dx = cs[i][0] - gx, dy = cs[i][1] - gy;
      const rx = dx * Math.cos(rot) - dy * Math.sin(rot), ry = dx * Math.sin(rot) + dy * Math.cos(rot);
      this.sim.orderMove(u, x + rx, y + ry, units.length > 1 ? fa : (Math.hypot(x - cs[i][0], y - cs[i][1]) > 30 ? Math.atan2(y - cs[i][1], x - cs[i][0]) : u.fa), run || u.run);
    });
  }
  /** units laid out along a dragged line, facing away from it towards the enemy */
  private lineSlots(x0: number, y0: number, x1: number, y1: number) {
    const units = [...this.sel].filter(u => u.side === this.me && u.def.cls !== 'air');
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    // the front: the normal pointing at the enemy
    let nx = -uy, ny = ux;
    const enemy = this.sim.units.filter(u => u.side !== this.me && u.deployed && !u.gone);
    if (enemy.length) {
      const [ex, ey] = enemy.reduce<[number, number]>((q, u) => { const c = this.sim.centre(u); return [q[0] + c[0] / enemy.length, q[1] + c[1] / enemy.length]; }, [0, 0]);
      if (nx * (ex - (x0 + x1) / 2) + ny * (ey - (y0 + y1) / 2) < 0) { nx = -nx; ny = -ny; }
    } else if (nx * Math.cos(this.sim.sideFa(this.me)) + ny * Math.sin(this.sim.sideFa(this.me)) < 0) { nx = -nx; ny = -ny; }
    const fa = Math.atan2(ny, nx);
    // order along the line by where the units stand now
    const sorted = units.map(u => ({ u, t: (() => { const [cx, cy] = this.sim.centre(u); return (cx - x0) * ux + (cy - y0) * uy; })() })).sort((a, b) => a.t - b.t).map(q => q.u);
    const per = L / Math.max(1, sorted.length);
    return sorted.map((u, i) => {
      const t = per * (i + 0.5);
      const n = this.sim.count(u);
      const sx = u.def.el === 'mounted' ? 18 : 10;
      const files = u.def.el === 'vehicle' || u.def.el === 'piece' ? undefined : Math.max(2, Math.min(n, Math.round((per - 16) / sx)));
      return { u, x: x0 + ux * t, y: y0 + uy * t, fa, files };
    });
  }
  key(k: string, down: boolean, e: KeyboardEvent) {
    if (!down) return false;
    const mine = [...this.sel];
    if (k === ' ') { this.paused = !this.paused; this.changed(); return true; }
    if (k === 'escape') { this.sel.clear(); this.aim = null; this.changed(); return true; }
    if (k === 'a' && (e.ctrlKey || e.metaKey)) { for (const u of this.sim.units) if (u.side === this.me && u.deployed && !u.gone) this.sel.add(u); this.changed(); return true; }
    if (!mine.length) return false;
    if (k === 'r') { const on = !mine.every(u => u.run); for (const u of mine) u.run = on; this.changed(); return true; }
    if (k === 'f') { const on = !mine.every(u => u.fireAtWill); for (const u of mine) u.fireAtWill = on; this.changed(); return true; }
    if (k === 'g') { const on = !mine.every(u => u.guard); for (const u of mine) u.guard = on; this.changed(); return true; }
    if (k === 'h' || k === 'backspace') { for (const u of mine) this.sim.stop(u); this.changed(); return true; }
    return false;
  }
  setForm(f: Form) { for (const u of this.sel) if (formsFor(this.sim.style, u.def).includes(f)) this.sim.setForm(u, f); this.changed(); }
  sight() {
    const out: { x: number; y: number; r: number }[] = [];
    for (const u of this.sim.units) if (u.side === this.me && u.deployed && !u.gone) { const [x, y] = this.sim.centre(u); out.push({ x, y, r: 900 }); }
    return out;
  }
  box() { return this.boxNow; }
  /** the soldier to look at for a portrait */
  portrait(u: Unit): { c: HTMLCanvasElement; sx: number; sy: number; w: number; h: number } | null {
    if (u.def.el === 'vehicle' || u.def.el === 'piece') {
      const sh = this.art.vehicle(this.cultures[u.side], u.def, u.era, 'SE', 'idle');
      return sh ? { c: sh.c, sx: 0, sy: 0, w: sh.w, h: sh.h } : null;
    }
    const sh = this.art.soldier(this.genomes[u.side], u.era, u.def, 'idle');
    return sh ? { c: sh.canvas, sx: 0, sy: 1 * sh.ch, w: sh.cw, h: sh.ch } : null;
  }
}

const ICON: Record<string, string> = {
  melee: '⚔', spear: '↑', pike: '⇈', shock: '✷', missile: '➶', gun: '═', skirm: '⁘', cav: '♞', cavgun: '♘',
  art: '●', mg: '⋯', at: '◆', aa: '✈', tank: '▣', ifv: '▤', recon: '◎', heli: '✢', air: '✈',
};
export type { Soldier };
