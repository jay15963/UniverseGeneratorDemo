// The cellular era's view engine (outside React): camera, snapshot interpolation, sprite batches for the GL renderer,
// RTS input (box select, right-click orders, groups, node placement) and the 2D overlay (selection rings, health bars,
// order pings, colony names, minimap). The HUD (React) talks to it through a few methods and a state callback.
import { CellGL, INST, View, Batch } from '../../lib/cell/gl';
import type { Atlas, AtlasEntry } from '../../lib/cell/atlas';
import { WorldDef, WORLD, BIO, BIO_N } from '../../lib/cell/world';
import { KINDS, Kind, CellSpecies, teamColour } from '../../lib/cell/look';
import { STRIDE, Cmd, Stats, NEUTRAL_SET, ColonyInfo, NODE_GAP } from '../../lib/cell/sim';

interface Frame { ents: Float32Array; n: number; t: number }
export interface Selection { ids: number[]; counts: number[]; stance: number; workers: number; colony: number; seeds: number }
export interface HudState {
  stats: Stats | null; goals: Record<string, boolean>; sel: Selection; paused: boolean; speed: number;
  placing: boolean; hover: string | null; fps: number; colonies: ColonyInfo[]; zoom: number; active: number;
}
const hexRgb = (h: string): [number, number, number] => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const ZOOMS = [0.1, 0.13, 0.17, 0.22, 0.28, 0.36, 0.46, 0.6, 0.78, 1, 2];
const DOT_ZOOM = 0.3;

export class CellEngine {
  gl: CellGL;
  view: View; zoomTarget = 1; zi = 9;
  prev: Frame | null = null; cur: Frame | null = null;
  rx = new Float32Array(0); ry = new Float32Array(0); ra = new Float32Array(0);
  motes = new Float32Array(0); nm = 0; shots = new Float32Array(0); np = 0;
  colonies = new Float32Array(0);
  sel = new Map<number, number>();
  cols: ColonyInfo[] = [];
  colRgb = new Map<number, [number, number, number]>();
  activeCol = -1;
  badges: { x: number; y: number; w: number; h: number; id: number }[] = [];
  keys = new Set<string>();
  stats: Stats | null = null; goals: Record<string, boolean> = {};
  paused = false; speed = 1;
  placing = false;
  drag: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null;
  pan: { x: number; y: number; cx: number; cy: number } | null = null;
  mouse = { x: 0, y: 0, in: false };
  pings: { x: number; y: number; t: number; c: string }[] = [];
  fx: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: [number, number, number]; e: AtlasEntry }[] = [];
  hover: number = -1;
  lastClick = { i: -1, t: 0 };
  lastKey = { n: 0, t: 0 };
  palette: [number, number, number][];
  paletteCss: string[];
  ground: Float32Array; groundN: number;
  buf = { deep: new Float32Array(200 * INST), cells: new Float32Array(20000 * INST), motes: new Float32Array(9000 * INST), fx: new Float32Array(4000 * INST) };
  raf = 0; last = 0; fpsAcc = 0; fpsN = 0; fps = 0; lastHud = 0;
  miniBase: HTMLCanvasElement; miniDirty = true; bioOwn: Uint8Array | null = null;
  dpr = 1; px = 3; w = 0; h = 0;
  disposed = false;
  private offs: (() => void)[] = [];

  constructor(
    public canvas: HTMLCanvasElement, public overlay: HTMLCanvasElement, public mini: HTMLCanvasElement,
    public world: WorldDef, public atlas: Atlas, public sim: Worker, public onHud: (s: HudState) => void,
  ) {
    const alien = world.species[0].mode === 'alien';
    this.palette = world.species.map(sp => teamColour(sp));
    this.paletteCss = this.palette.map(c => `rgb(${c[0]},${c[1]},${c[2]})`);
    this.gl = new CellGL(canvas, atlas, world, this.palette, alien);
    const home = world.starts[0][0];
    this.view = { x: home.x, y: home.y, zoom: 1 };
    // static ground batch: sand grains + vents
    this.ground = new Float32Array((world.rocks.length + world.vents.length) * INST);
    let n = 0;
    for (const r of world.rocks) { const e = atlas.entries.get(`rock:${r.v}`)!; this.put(this.ground, n++, r.x, r.y, r.rot, 1, e, 0, 0, 0, 0, 0, 0, 1); }
    for (const v of world.vents) { const e = atlas.entries.get(`vent:${v.v}`)!; this.put(this.ground, n++, v.x, v.y, 0, 1, e, 0, 3, 0, 0, 0, 0, 1); }
    this.groundN = n;
    this.miniBase = document.createElement('canvas');
    this.miniBase.width = 192; this.miniBase.height = 192;
    this.bindInput();
  }

  // --- instance helper -------------------------------------------------------------------------------------------------
  put(a: Float32Array, i: number, x: number, y: number, ang: number, scale: number, e: AtlasEntry, phase: number, fps: number,
    r: number, g: number, b: number, amt: number, alpha: number) {
    const o = i * INST;
    a[o] = x; a[o + 1] = y; a[o + 2] = ang; a[o + 3] = scale;
    a[o + 4] = e.x; a[o + 5] = e.y; a[o + 6] = e.w; a[o + 7] = e.h;
    a[o + 8] = e.layer; a[o + 9] = e.frames; a[o + 10] = phase; a[o + 11] = fps;
    a[o + 12] = r; a[o + 13] = g; a[o + 14] = b; a[o + 15] = amt; a[o + 16] = alpha;
  }

  // --- data from the simulation ---------------------------------------------------------------------------------------------
  onFrame(m: { ents: Float32Array; n: number; motes: Float32Array; nm: number; shots: Float32Array; np: number; deaths: number[]; paused: boolean; speed: number;
    bioOwn?: Uint8Array; bioStr?: Uint8Array; colonies?: Float32Array; stats?: Stats; goals?: Record<string, boolean> }) {
    this.prev = this.cur;
    this.cur = { ents: m.ents, n: m.n, t: performance.now() };
    this.motes = m.motes; this.nm = m.nm; this.shots = m.shots; this.np = m.np;
    this.paused = m.paused; this.speed = m.speed;
    if (m.bioOwn && m.bioStr) { this.gl.setBio(m.bioOwn, m.bioStr); this.bioOwn = m.bioOwn; this.miniDirty = true; }
    if (m.colonies) this.colonies = m.colonies;
    if (m.stats) {
      this.stats = m.stats; this.goals = m.goals ?? {};
      this.cols = m.stats.colonies;
      this.colRgb.clear();
      for (const c of this.cols) this.colRgb.set(c.id, hexRgb(c.color));
      if (!this.cols.some(c => c.id === this.activeCol)) this.activeCol = this.cols[0]?.id ?? -1;
      this.hud();
    }
    for (let i = 0; i < m.deaths.length; i += 4) this.burst(m.deaths[i], m.deaths[i + 1], m.deaths[i + 2], m.deaths[i + 3]);
    // forget selected cells that died
    for (const [id, g] of this.sel) if (id >= m.n || m.ents[id * STRIDE + 7] !== g) this.sel.delete(id);
  }
  burst(x: number, y: number, set: number, kind: number) {
    if (Math.hypot(x - this.view.x, y - this.view.y) > 2400) return;
    const sp = set < NEUTRAL_SET ? this.world.species[set] : null;
    const c: [number, number, number] = sp ? teamColour(sp) : [200, 220, 190];
    const n = kind === Kind.MOTHER ? 26 : kind === Kind.NODE ? 14 : kind === Kind.BACTERIA ? 3 : 8;
    const sz = KINDS[kind].r;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60 * (sz / 8);
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.6, c, e: this.atlas.entries.get(`spark:${Math.floor(Math.random() * 3)}`)! });
    }
  }

  // --- commands -------------------------------------------------------------------------------------------------------------------
  cmd(c: Cmd) { this.sim.postMessage({ t: 'cmd', cmd: c }); }
  selIds() { return [...this.sel.keys()]; }
  setStance(s: number) { const c = this.selection().colony; this.cmd({ t: 'stance', ids: this.selIds(), stance: s, colony: c >= 0 ? c : undefined }); }
  /** the colony the division bar works on (its dropdown; clicking a mother cell picks hers) */
  setColony(id: number) { this.activeCol = id; this.hud(); }
  train(k: Kind) {
    if (k === Kind.NODE) { this.placing = !this.placing; this.hud(); return; }
    this.cmd({ t: 'train', kind: k, colony: this.activeCol >= 0 ? this.activeCol : undefined });
  }
  cancel(i: number) { if (this.activeCol >= 0) this.cmd({ t: 'cancel', colony: this.activeCol, index: i }); }
  togglePause() { this.cmd({ t: 'pause', on: !this.paused }); }
  setSpeed(k: number) { this.cmd({ t: 'speed', k }); }
  startPlacing() { this.placing = true; this.hud(); }
  focus(x: number, y: number) { this.view.x = x; this.view.y = y; }
  focusHome() { const c = this.cols.find(q => q.id === this.activeCol) ?? this.cols[0]; if (c) this.focus(c.x, c.y); }
  /** keep only the cells of one kind in the selection */
  filterKind(k: number) { const f = this.cur; if (!f) return; for (const id of [...this.sel.keys()]) if (f.ents[id * STRIDE + 3] % 16 !== k) this.sel.delete(id); this.hud(); }
  selectMother() {
    const c = this.cols.find(q => q.id === this.activeCol) ?? this.cols[0], f = this.cur;
    if (!f || !c) return;
    this.sel.clear(); this.sel.set(c.mother, f.ents[c.mother * STRIDE + 7]);
    this.focus(c.x, c.y); this.hud();
  }
  /** a colony's cells (optionally one kind only); nodes are never selected with them */
  selectColony(id: number, add = false, focus = false, kind = -1) {
    const f = this.cur; if (!f) return;
    if (!add) this.sel.clear();
    for (let i = 0; i < f.n; i++) {
      const o = i * STRIDE, k = f.ents[o + 3] % 16;
      if (f.ents[o + 7] < 0 || f.ents[o + 4] !== 0 || f.ents[o + 8] !== id) continue;
      if (kind >= 0 ? k !== kind : k === Kind.NODE) continue;
      this.sel.set(i, f.ents[o + 7]);
    }
    const c = this.cols.find(q => q.id === id);
    if (c) this.activeCol = id;
    if (focus && c) this.focus(c.cx, c.cy);
    this.hud();
  }

  selection(): Selection {
    const counts = new Array(8).fill(0), f = this.cur;
    let stance = -1, workers = 0, colony = -2, seeds = 0;
    if (f) for (const id of this.sel.keys()) {
      const o = id * STRIDE, k = f.ents[o + 3] % 16;
      counts[k]++;
      if (k === Kind.WORKER) workers++;
      if (f.ents[o + 6] & 256) seeds++;
      const st = (f.ents[o + 6] >> 4) & 7;
      stance = stance < 0 ? st : stance === st ? st : 9;
      const g = f.ents[o + 8];
      colony = colony === -2 ? g : colony === g ? g : -1;
    }
    // the selection is a colony when it holds all its (swimming) cells
    const C = this.cols.find(q => q.id === colony);
    if (!C || C.n - (C.counts[Kind.NODE] ?? 0) !== this.sel.size) colony = -1;
    return { ids: this.selIds(), counts, stance, workers, colony, seeds };
  }
  hud() {
    this.onHud({ stats: this.stats, goals: this.goals, sel: this.selection(), paused: this.paused, speed: this.speed, placing: this.placing, hover: this.hoverText(), fps: this.fps, colonies: this.cols, zoom: this.view.zoom, active: this.activeCol });
  }
  hoverText(): string | null {
    const f = this.cur, i = this.hover;
    if (!f || i < 0 || i >= f.n) return null;
    const o = i * STRIDE, set = Math.floor(f.ents[o + 3] / 16), k = f.ents[o + 3] % 16, col = f.ents[o + 4];
    const K = KINDS[k];
    if (col < 0) return K.name;
    const sp = this.world.species[set];
    return col === 0 ? `${K.name} · sua espécie` : `${K.name} · ${sp.genus} ${sp.species}`;
  }

  // --- coordinates ---------------------------------------------------------------------------------------------------------------------
  toWorld(sx: number, sy: number): [number, number] {
    const v = this.view, fx = (sx * this.dpr) / this.px, fy = (sy * this.dpr) / this.px;
    return [v.x + (fx - this.gl.fbW / 2) / v.zoom, v.y + (fy - this.gl.fbH / 2) / v.zoom];
  }
  toScreen(wx: number, wy: number): [number, number] {
    const v = this.view;
    return [(((wx - v.x) * v.zoom + this.gl.fbW / 2) * this.px) / this.dpr, (((wy - v.y) * v.zoom + this.gl.fbH / 2) * this.px) / this.dpr];
  }
  pick(sx: number, sy: number, filter?: (col: number, k: number) => boolean): number {
    const f = this.cur; if (!f) return -1;
    const [wx, wy] = this.toWorld(sx, sy);
    let best = -1, bd = 1e9;
    const slack = 5 / this.view.zoom;
    for (let i = 0; i < f.n; i++) {
      const o = i * STRIDE; if (f.ents[o + 7] < 0) continue;
      const k = f.ents[o + 3] % 16, col = f.ents[o + 4];
      if (filter && !filter(col, k)) continue;
      const d = Math.hypot(this.rx[i] - wx, this.ry[i] - wy) - KINDS[k].r;
      if (d < slack && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // --- input ---------------------------------------------------------------------------------------------------------------------------
  bindInput() {
    const el = this.overlay;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, ev: K | string, fn: (e: never) => void, opt?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn as EventListener, opt); this.offs.push(() => t.removeEventListener(ev, fn as EventListener, opt));
    };
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(el, 'pointerdown', (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const x = e.offsetX, y = e.offsetY;
      if (e.button === 1 || (e.button === 0 && e.altKey)) { this.pan = { x, y, cx: this.view.x, cy: this.view.y }; return; }
      if (e.button === 2) { if (this.placing) { this.placing = false; this.hud(); return; } this.order(x, y); return; }
      if (e.button === 0) {
        if (this.placing) { this.placeNode(x, y); return; }
        const b = this.badges.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
        if (b) { this.selectColony(b.id, e.shiftKey); return; }
        this.drag = { x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
      }
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      const x = e.offsetX, y = e.offsetY;
      this.mouse = { x, y, in: true };
      if (this.pan) { this.view.x = this.pan.cx - ((x - this.pan.x) * this.dpr) / this.px / this.view.zoom; this.view.y = this.pan.cy - ((y - this.pan.y) * this.dpr) / this.px / this.view.zoom; }
      if (this.drag) { this.drag.x1 = x; this.drag.y1 = y; }
    });
    on(el, 'pointerleave', () => { this.mouse.in = false; });
    on(el, 'pointerup', (e: PointerEvent) => {
      if (this.pan && (e.button === 1 || e.button === 0)) { this.pan = null; return; }
      if (this.drag && e.button === 0) { this.finishDrag(false); this.drag = null; }
    });
    on(el, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      const [wx, wy] = this.toWorld(e.offsetX, e.offsetY);
      this.zi = Math.max(0, Math.min(ZOOMS.length - 1, this.zi + (e.deltaY > 0 ? -1 : 1)));
      const z = ZOOMS[this.zi];
      // keep the point under the cursor fixed
      const fx = (e.offsetX * this.dpr) / this.px - this.gl.fbW / 2, fy = (e.offsetY * this.dpr) / this.px - this.gl.fbH / 2;
      this.view.zoom = z; this.view.x = wx - fx / z; this.view.y = wy - fy / z;
      this.hud();
    }, { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') { e.preventDefault(); this.togglePause(); }
      else if (k === 'escape') { if (this.placing) this.placing = false; else this.sel.clear(); this.hud(); }
      else if (k === 'h') this.selectMother();
      else if (k === 'n' || k === 'b') this.startPlacing();
      else if (/^[1-9]$/.test(k)) {
        // 1..9: the colonies in order (twice quickly: jump there)
        const n = +k, c = this.cols[n - 1];
        if (c) this.selectColony(c.id, e.shiftKey, this.lastKey.n === n && performance.now() - this.lastKey.t < 400);
        this.lastKey = { n, t: performance.now() };
      }
      else if (k === '+' || k === '=') { this.zi = Math.min(ZOOMS.length - 1, this.zi + 1); this.view.zoom = ZOOMS[this.zi]; this.hud(); }
      else if (k === '-') { this.zi = Math.max(0, this.zi - 1); this.view.zoom = ZOOMS[this.zi]; this.hud(); }
      else if (k === 'delete') this.sel.clear();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
    // minimap: click / drag to look there, right click to send the selection
    const mm = (e: PointerEvent) => {
      const r = this.mini.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * WORLD, wy = ((e.clientY - r.top) / r.height) * WORLD;
      if (e.button === 2) { this.issue(wx, wy); return; }
      if (e.buttons & 1) { this.view.x = wx; this.view.y = wy; }
    };
    on(this.mini, 'pointerdown', (e: PointerEvent) => { this.mini.setPointerCapture(e.pointerId); mm(e); });
    on(this.mini, 'pointermove', mm);
    on(this.mini, 'contextmenu', (e: MouseEvent) => e.preventDefault());
  }
  finishDrag(dbl: boolean) {
    const d = this.drag!, f = this.cur;
    if (!f) return;
    const small = Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5;
    if (!d.add) this.sel.clear();
    if (small) {
      const i = this.pick(d.x0, d.y0);
      const now = performance.now();
      dbl = dbl || (i >= 0 && this.lastClick.i === i && now - this.lastClick.t < 380);
      this.lastClick = { i, t: now };
      if (i >= 0 && f.ents[i * STRIDE + 4] === 0) {
        if (dbl) {
          // double click: every cell of that kind on screen
          const k = f.ents[i * STRIDE + 3] % 16;
          for (let j = 0; j < f.n; j++) { const o = j * STRIDE; if (f.ents[o + 7] < 0 || f.ents[o + 4] !== 0 || f.ents[o + 3] % 16 !== k) continue; const [sx, sy] = this.toScreen(this.rx[j], this.ry[j]); if (sx >= 0 && sy >= 0 && sx <= this.w && sy <= this.h) this.sel.set(j, f.ents[o + 7]); }
        } else this.sel.set(i, f.ents[i * STRIDE + 7]);
      }
    } else {
      const [ax, ay] = this.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), [bx, by] = this.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const hits: number[] = [];
      for (let j = 0; j < f.n; j++) {
        const o = j * STRIDE; if (f.ents[o + 7] < 0 || f.ents[o + 4] !== 0) continue;
        if (this.rx[j] >= ax && this.rx[j] <= bx && this.ry[j] >= ay && this.ry[j] <= by) hits.push(j);
      }
      // units first; the mother and nodes only when nothing else is in the box
      const units = hits.filter(j => { const k = f.ents[j * STRIDE + 3] % 16; return k !== Kind.MOTHER && k !== Kind.NODE; });
      for (const j of units.length ? units : hits) this.sel.set(j, f.ents[j * STRIDE + 7]);
    }
    for (const id of this.sel.keys()) { const o = id * STRIDE; if (f.ents[o + 3] % 16 === Kind.MOTHER && !(f.ents[o + 6] & 256) && f.ents[o + 8] >= 0) { this.activeCol = f.ents[o + 8]; break; } }
    this.hud();
  }
  order(sx: number, sy: number) {
    if (!this.sel.size) return;
    const f = this.cur; if (!f) return;
    const t = this.pick(sx, sy, col => col !== 0);
    const [wx, wy] = this.toWorld(sx, sy);
    if (t >= 0) { this.cmd({ t: 'attack', ids: this.selIds(), target: t }); this.pings.push({ x: this.rx[t], y: this.ry[t], t: 0, c: '#f87171' }); return; }
    this.issue(wx, wy);
  }
  issue(wx: number, wy: number) {
    if (!this.sel.size) return;
    // right click near food: the workers gather there
    let nearMote = false;
    for (let i = 0; i < this.nm && !nearMote; i++) if (Math.hypot(this.motes[i * 3] - wx, this.motes[i * 3 + 1] - wy) < 60) nearMote = true;
    this.cmd({ t: nearMote ? 'gather' : 'move', ids: this.selIds(), x: wx, y: wy });
    this.pings.push({ x: wx, y: wy, t: 0, c: nearMote ? '#fde047' : '#86efac' });
  }
  placeNode(sx: number, sy: number) {
    const [wx, wy] = this.toWorld(sx, sy);
    // the nearest worker of the active colony swims there and settles (the simulation picks it)
    this.cmd({ t: 'nodeAt', x: wx, y: wy, colony: this.activeCol >= 0 ? this.activeCol : undefined });
    this.pings.push({ x: wx, y: wy, t: 0, c: '#a78bfa' });
    this.placing = false; this.hud();
  }
  /** can a node go here? touches the own biofilm, NODE_GAP from every node / colony (any nation) */
  nodeOk(wx: number, wy: number) {
    const f = this.cur;
    if (!f || !this.ownsBio(wx, wy)) return false;
    for (let i = 0; i < f.n; i++) {
      const o = i * STRIDE; if (f.ents[o + 7] < 0) continue;
      const k = f.ents[o + 3] % 16;
      if (k !== Kind.NODE && !(k === Kind.MOTHER && !(f.ents[o + 6] & 256))) continue;
      if ((this.rx[i] - wx) ** 2 + (this.ry[i] - wy) ** 2 < NODE_GAP * NODE_GAP) return false;
    }
    return true;
  }
  ownsBio(wx: number, wy: number) {
    if (!this.bioOwn) return false;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const bx = Math.floor(wx / BIO) + dx, by = Math.floor(wy / BIO) + dy;
      if (bx >= 0 && by >= 0 && bx < BIO_N && by < BIO_N && this.bioOwn[by * BIO_N + bx] === 0) return true;
    }
    return false;
  }

  // --- frame -----------------------------------------------------------------------------------------------------------------------------
  start() { const loop = (now: number) => { if (this.disposed) return; this.frame(now); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  frame(now: number) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
    const cpu0 = performance.now();
    // size
    const dpr = window.devicePixelRatio || 1, cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    this.dpr = dpr; this.px = Math.max(1, Math.round(2 * dpr)); this.w = cw; this.h = ch;
    this.gl.resize(Math.round(cw * dpr), Math.round(ch * dpr), this.px);
    if (this.overlay.width !== Math.round(cw * dpr)) { this.overlay.width = Math.round(cw * dpr); this.overlay.height = Math.round(ch * dpr); }
    // keyboard panning
    const sp = (620 / this.view.zoom) * dt;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.view.y -= sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.view.y += sp;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.view.x -= sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.view.x += sp;
    this.view.x = Math.max(-400, Math.min(WORLD + 400, this.view.x)); this.view.y = Math.max(-400, Math.min(WORLD + 400, this.view.y));
    const t = now / 1000;
    const batches = this.build(t, dt);
    this.gl.draw(this.view, t, this.deep(t), batches, true);
    this.drawOverlay(t, dt);
    if (this.miniDirty) this.paintMiniBase();
    this.drawMini();
    // engine FPS (CPU time of a frame, like the demo)
    this.fpsAcc += performance.now() - cpu0; this.fpsN++;
    if (this.fpsN >= 30) { this.fps = Math.round(1000 / Math.max(0.1, this.fpsAcc / this.fpsN)); this.fpsAcc = 0; this.fpsN = 0; }
    if (now - this.lastHud > 250) { this.lastHud = now; this.hover = this.mouse.in ? this.pick(this.mouse.x, this.mouse.y) : -1; this.hud(); }
  }

  /** big organisms far below: drifting silhouettes, tinted by the depth (parallax 0.55) */
  deep(t: number): Batch {
    const depth = 0.55, v = this.view, a = this.buf.deep;
    const hw = this.gl.fbW / 2 / (v.zoom * depth) + 200, hh = this.gl.fbH / 2 / (v.zoom * depth) + 200, T = 760;
    let n = 0;
    const col = this.world.species[0].mode === 'alien' ? [0.08, 0.07, 0.17] : [0.04, 0.12, 0.16];
    for (let ty = Math.floor((v.y - hh) / T); ty <= Math.floor((v.y + hh) / T); ty++) for (let tx = Math.floor((v.x - hw) / T); tx <= Math.floor((v.x + hw) / T); tx++) {
      const h = hashf(tx, ty);
      if (h > 0.55 || n >= 190) continue;
      const h2 = hashf(tx + 91, ty - 17), h3 = hashf(tx - 33, ty + 57);
      const set = 1 + Math.floor(h2 * (this.world.species.length - 1)), amoeba = h3 < 0.2;
      const e = amoeba ? this.atlas.bySprite[(NEUTRAL_SET + 6) * 16 + Kind.AMOEBA] : this.atlas.bySprite[set * 16 + (h3 < 0.6 ? Kind.MOTHER : Kind.HUNTER)];
      if (!e) continue;
      const x = (tx + 0.2 + h2 * 0.6) * T + Math.sin(t * 0.05 + h * 9) * 60, y = (ty + 0.2 + h3 * 0.6) * T + Math.cos(t * 0.04 + h2 * 7) * 60;
      this.put(a, n++, x, y, h * 6.28 + t * 0.03 * (h2 - 0.5), 2 + h3 * 1.6, e, h, 2, col[0], col[1], col[2], 0.74, 0.4);
    }
    return { data: a, count: n, depth };
  }

  build(t: number, dt: number): Batch[] {
    const f = this.cur, p = this.prev, v = this.view;
    const out: Batch[] = [{ data: this.ground, count: this.groundN, depth: 1 }];
    if (!f) return out;
    if (this.rx.length < f.n) { this.rx = new Float32Array(f.n + 1024); this.ry = new Float32Array(f.n + 1024); this.ra = new Float32Array(f.n + 1024); }
    const alpha = p ? Math.max(0, Math.min(1, (performance.now() - f.t) / Math.max(16, f.t - p.t))) : 1;
    const hw = this.gl.fbW / 2 / v.zoom + 60, hh = this.gl.fbH / 2 / v.zoom + 60;
    const dots = v.zoom < DOT_ZOOM;
    const a = this.buf.cells, mb = this.buf.motes;
    let n = 0, nm = 0;
    // two passes: rooted cells (mothers, nodes) under the swimmers
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < f.n; i++) {
      const o = i * STRIDE, gen = f.ents[o + 7];
      if (gen < 0) continue;
      const k = f.ents[o + 3] % 16;
      const rooted = k === Kind.MOTHER || k === Kind.NODE;
      if ((pass === 0) !== rooted) continue;
      let x = f.ents[o], y = f.ents[o + 1], ang = f.ents[o + 2];
      if (p && i < p.n && p.ents[o + 7] === gen) {
        x = p.ents[o] + (x - p.ents[o]) * alpha; y = p.ents[o + 1] + (y - p.ents[o + 1]) * alpha;
        let da = ang - p.ents[o + 2]; da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2; ang = p.ents[o + 2] + da * alpha;
      }
      this.rx[i] = x; this.ry[i] = y; this.ra[i] = ang;
      if (Math.abs(x - v.x) > hw || Math.abs(y - v.y) > hh || n >= 19990) continue;
      const col = f.ents[o + 4], flags = f.ents[o + 6];
      const e = this.atlas.bySprite[f.ents[o + 3]];
      if (!e) continue;
      if (dots) {
        const gc = col === 0 && this.cols.length > 1 && f.ents[o + 8] >= 0 ? this.colRgb.get(f.ents[o + 8]) : undefined;
        const c = gc ?? (col >= 0 ? this.palette[col] : [150, 170, 160]);
        const d = KINDS[k].r * (col === 0 ? 3 : 2.4);
        const oo = n * INST;
        this.put(a, n++, x, y, 0, -1, e, 0, 0, c[0] / 255, c[1] / 255, c[2] / 255, 1, col < 0 ? 0.6 : 1);
        a[oo + 6] = d; a[oo + 7] = d;
        continue;
      }
      let tr = 0, tg = 0, tb = 0, amt = 0;
      if (flags & 2) { tr = 1; tg = 1; tb = 1; amt = 0.55; }
      else if (flags & 4) { tr = 0.25; tg = 0.2; tb = 0.18; amt = 0.25 + 0.15 * Math.sin(t * 6 + i); }
      const fps = k === Kind.NODE || k === Kind.MOTHER ? 4 : k === Kind.DIATOM ? 1 : 8;
      this.put(a, n++, x, y, ang, 1, e, (i * 0.37) % 1, fps, tr, tg, tb, amt, 1);
      if ((flags & 1) && n < 19990) { const me = this.atlas.entries.get('mote:0')!; this.put(a, n++, x - Math.cos(ang) * 1.5, y - Math.sin(ang) * 1.5, 0, 0.9, me, 0, 0, 0, 0, 0, 0, 1); }
    }
    // motes and spit
    if (!dots) {
      for (let i = 0; i < this.nm && nm < 8990; i++) {
        const x = this.motes[i * 3], y = this.motes[i * 3 + 1];
        if (Math.abs(x - v.x) > hw || Math.abs(y - v.y) > hh) continue;
        const e = this.atlas.entries.get(`mote:${this.motes[i * 3 + 2] | 0}`)!;
        this.put(mb, nm++, x, y, 0, 1, e, (i * 0.13) % 1, 3, 0, 0, 0, 0, 1);
      }
      const te = this.atlas.entries.get('toxin')!;
      for (let i = 0; i < this.np && nm < 8990; i++) this.put(mb, nm++, this.shots[i * 3], this.shots[i * 3 + 1], this.shots[i * 3 + 2], 1, te, 0, 0, 0, 0, 0, 0, 1);
    }
    // death sparks
    const fb = this.buf.fx;
    let nf = 0;
    this.fx = this.fx.filter(q => (q.t += dt) < q.life);
    for (const q of this.fx) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - dt * 3; q.vy *= 1 - dt * 3;
      if (nf < 3990) this.put(fb, nf++, q.x, q.y, 0, 1, q.e, 0, 0, q.c[0] / 255, q.c[1] / 255, q.c[2] / 255, 0.6, 1 - q.t / q.life);
    }
    out.push({ data: mb, count: nm, depth: 1 }, { data: a, count: n, depth: 1 }, { data: fb, count: nf, depth: 1 });
    return out;
  }

  drawOverlay(t: number, dt: number) {
    const c = this.overlay.getContext('2d')!, f = this.cur, dpr = this.dpr, z = this.view.zoom;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const k = (this.px / dpr) * z;   // css px per world px
    if (f) {
      // the player's colonies: a ring in the colony's colour around each cell (once there is more than one)
      if (z >= DOT_ZOOM && this.cols.length > 1) {
        c.lineWidth = z >= 0.6 ? 2 : 1.5;
        for (let i = 0; i < f.n; i++) {
          const o = i * STRIDE; if (f.ents[o + 7] < 0 || f.ents[o + 4] !== 0 || f.ents[o + 8] < 0 || this.sel.has(i)) continue;
          const gc = this.colRgb.get(f.ents[o + 8]); if (!gc) continue;
          const [sx, sy] = this.toScreen(this.rx[i], this.ry[i]);
          if (sx < -20 || sy < -20 || sx > this.w + 20 || sy > this.h + 20) continue;
          const r = Math.max(3, KINDS[f.ents[o + 3] % 16].r * k + 2);
          c.strokeStyle = `rgba(${gc[0]},${gc[1]},${gc[2]},0.6)`;
          c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.stroke();
        }
      }
      // travelling mother cells: a dashed ring where they would root
      c.lineWidth = 1.5;
      for (let i = 0; i < f.n; i++) {
        const o = i * STRIDE; if (f.ents[o + 7] < 0 || f.ents[o + 4] !== 0 || !(f.ents[o + 6] & 256)) continue;
        const [sx, sy] = this.toScreen(this.rx[i], this.ry[i]);
        c.strokeStyle = 'rgba(253,230,138,0.8)'; c.setLineDash([4, 4]);
        c.beginPath(); c.arc(sx, sy, Math.max(8, 450 * k), 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
      // selection rings + health
      c.lineWidth = 1.5;
      for (const id of this.sel.keys()) {
        const o = id * STRIDE, kind = f.ents[o + 3] % 16, [sx, sy] = this.toScreen(this.rx[id], this.ry[id]), r = Math.max(4, KINDS[kind].r * k + 3);
        c.strokeStyle = 'rgba(134,239,172,0.9)';
        c.beginPath(); c.ellipse(sx, sy, r, r * 0.92, 0, 0, Math.PI * 2); c.stroke();
        this.hpBar(c, sx, sy - r - 4, Math.max(14, r * 1.4), f.ents[o + 5]);
      }
      // own damaged cells and the hovered one
      if (z >= 0.46) for (let i = 0; i < f.n; i++) {
        const o = i * STRIDE; if (f.ents[o + 7] < 0 || this.sel.has(i)) continue;
        const hp = f.ents[o + 5];
        if (hp >= 0.999 || f.ents[o + 4] < 0) continue;
        const [sx, sy] = this.toScreen(this.rx[i], this.ry[i]);
        if (sx < -20 || sy < -20 || sx > this.w + 20 || sy > this.h + 20) continue;
        const r = KINDS[f.ents[o + 3] % 16].r * k + 3;
        this.hpBar(c, sx, sy - r - 4, Math.max(12, r * 1.2), hp, f.ents[o + 4] === 0 ? undefined : '#f87171');
      }
      if (this.hover >= 0 && this.hover < f.n && f.ents[this.hover * STRIDE + 7] >= 0 && !this.sel.has(this.hover)) {
        const o = this.hover * STRIDE, col = f.ents[o + 4], [sx, sy] = this.toScreen(this.rx[this.hover], this.ry[this.hover]);
        const r = Math.max(4, KINDS[f.ents[o + 3] % 16].r * k + 3);
        c.strokeStyle = col === 0 ? 'rgba(134,239,172,0.5)' : col < 0 ? 'rgba(250,250,210,0.5)' : 'rgba(248,113,113,0.8)';
        c.setLineDash([3, 3]); c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
    }
    // colony names when zoomed out
    this.badges = [];
    if (z < 0.5 && this.colonies.length) {
      c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
      // one name per cluster of the same nation (every colony of the player)
      const shown: [number, number, number][] = [];
      for (let i = 0; i < this.colonies.length / 4; i++) {
        const o = i * 4, nat = this.colonies[o + 2];
        if (!this.colonies[o + 3]) continue;
        const [sx, sy] = this.toScreen(this.colonies[o], this.colonies[o + 1]);
        if (sx < -80 || sy < -20 || sx > this.w + 80 || sy > this.h + 20) continue;
        if (shown.some(q => q[2] === nat && Math.hypot(q[0] - sx, q[1] - sy) < (nat === 0 ? 90 : 260))) continue;
        shown.push([sx, sy, nat]);
        const sp = this.world.species[nat];
        if (nat === 0) continue;
        const label = `${sp.genus} ${sp.species}`;
        const tw = c.measureText(label).width + 12;
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(sx - tw / 2, sy - 26, tw, 16);
        c.fillStyle = nat === 0 ? '#86efac' : this.paletteCss[nat];
        c.fillText(label, sx, sy - 14);
      }
    }
    // colony badges in the regional view: colour, name and size on the centre of the colony's cells (click: select)
    if (z < 0.5) {
      c.font = '700 11px ui-sans-serif, system-ui'; c.textAlign = 'left';
      for (const g of this.cols) {
        const [sx, sy] = this.toScreen(g.cx, g.cy);
        if (sx < -100 || sy < -20 || sx > this.w + 100 || sy > this.h + 20) continue;
        const label = `${g.name} · ${g.n}`, tw = c.measureText(label).width + 22, bh = 18;
        const bx = sx - tw / 2, by = sy + 8;
        c.fillStyle = 'rgba(6,12,16,0.85)';
        c.beginPath(); c.roundRect(bx, by, tw, bh, 9); c.fill();
        c.strokeStyle = g.color; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = g.color;
        c.beginPath(); c.arc(bx + 9, by + bh / 2, 4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f8fafc';
        c.fillText(label, bx + 17, by + bh / 2 + 4);
        this.badges.push({ x: bx, y: by, w: tw, h: bh, id: g.id });
      }
    }
    // order pings
    this.pings = this.pings.filter(q => (q.t += dt) < 0.6);
    for (const q of this.pings) {
      const [sx, sy] = this.toScreen(q.x, q.y), r = 4 + (1 - q.t / 0.6) * 12;
      c.strokeStyle = q.c; c.globalAlpha = 1 - q.t / 0.6; c.lineWidth = 2;
      c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
    // node placement: every biofilm's keep-out range (own violet, foreign red) and the ghost
    if (this.placing && f) {
      const R = NODE_GAP * k;
      for (let i = 0; i < f.n; i++) {
        const o = i * STRIDE; if (f.ents[o + 7] < 0) continue;
        const kd = f.ents[o + 3] % 16;
        if (kd !== Kind.NODE && !(kd === Kind.MOTHER && !(f.ents[o + 6] & 256))) continue;
        const [sx, sy] = this.toScreen(this.rx[i], this.ry[i]);
        if (sx < -R || sy < -R || sx > this.w + R || sy > this.h + R) continue;
        const own = f.ents[o + 4] === 0;
        c.fillStyle = own ? 'rgba(167,139,250,0.12)' : 'rgba(248,113,113,0.12)';
        c.strokeStyle = own ? 'rgba(167,139,250,0.7)' : 'rgba(248,113,113,0.7)';
        c.lineWidth = 1.5; c.setLineDash([6, 4]);
        c.beginPath(); c.arc(sx, sy, R, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
      }
      if (this.mouse.in) {
        const [wx, wy] = this.toWorld(this.mouse.x, this.mouse.y), ok = this.nodeOk(wx, wy);
        c.strokeStyle = ok ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.45)'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(this.mouse.x, this.mouse.y, R, 0, Math.PI * 2); c.stroke();
        c.fillStyle = ok ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.45)';
        c.beginPath(); c.arc(this.mouse.x, this.mouse.y, Math.max(5, 12 * k), 0, Math.PI * 2); c.fill();
        c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center'; c.fillStyle = ok ? '#bbf7d0' : '#fecaca';
        c.fillText(ok ? 'Clique para fixar o nódulo' : 'Fora do seu biofilme ou perto de outro biofilme', this.mouse.x, this.mouse.y - Math.max(14, 12 * k) - 6);
      }
    }
    // box
    if (this.drag) {
      const d = this.drag;
      c.strokeStyle = 'rgba(134,239,172,0.9)'; c.fillStyle = 'rgba(134,239,172,0.08)'; c.lineWidth = 1;
      c.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      c.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
    void t;
  }
  hpBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, col?: string) {
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
    c.fillStyle = col ?? (hp > 0.6 ? '#4ade80' : hp > 0.3 ? '#facc15' : '#f87171');
    c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, hp)), 2);
  }

  paintMiniBase() {
    this.miniDirty = false;
    const c = this.miniBase.getContext('2d')!, N = 192, img = c.createImageData(N, N);
    const own = this.bioOwn;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4, o = own ? own[(y * 2) * BIO_N + x * 2] : 255;
      if (o !== 255) { const p = this.palette[o]; img.data[i] = p[0] * 0.8; img.data[i + 1] = p[1] * 0.8; img.data[i + 2] = p[2] * 0.8; }
      else { img.data[i] = 10; img.data[i + 1] = 30; img.data[i + 2] = 38; }
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.fillStyle = 'rgba(160,140,110,0.8)';
    for (const r of this.world.rocks) c.fillRect((r.x / WORLD) * N - 0.5, (r.y / WORLD) * N - 0.5, 1, 1);
    c.fillStyle = '#fb923c';
    for (const v of this.world.vents) c.fillRect((v.x / WORLD) * N - 1, (v.y / WORLD) * N - 1, 2, 2);
  }
  drawMini() {
    const m = this.mini, dpr = this.dpr;
    const W = m.clientWidth, H = m.clientHeight;
    if (m.width !== Math.round(W * dpr)) { m.width = Math.round(W * dpr); m.height = Math.round(H * dpr); }
    const c = m.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.miniBase, 0, 0, W, H);
    const s = W / WORLD;
    // colonies
    for (let i = 0; i < this.colonies.length / 4; i++) {
      const o = i * 4, nat = this.colonies[o + 2];
      c.fillStyle = nat === 0 ? '#ffffff' : this.paletteCss[nat];
      const r = nat === 0 ? 3 : 2;
      c.fillRect(this.colonies[o] * s - r / 2, this.colonies[o + 1] * s - r / 2, r, r);
    }
    // selected cells
    const f = this.cur;
    if (f) { c.fillStyle = '#86efac'; for (const id of this.sel.keys()) c.fillRect(this.rx[id] * s - 1, this.ry[id] * s - 1, 2, 2); }
    // the camera
    const [ax, ay] = this.toWorld(0, 0), [bx, by] = this.toWorld(this.w, this.h);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1;
    c.strokeRect(ax * s + 0.5, ay * s + 0.5, (bx - ax) * s, (by - ay) * s);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.offs.forEach(f => f());
    this.gl.dispose();
  }
}

function hashf(x: number, y: number) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export type { CellSpecies };
