import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Backpack, Map as MapIcon, Hand, ZoomIn, ZoomOut } from 'lucide-react';
import type { PlanetSession, TerrainPool } from '../../lib/planet-generator/planetClient';
import { PlanetType, BiomeType } from '../../lib/planet-generator/generator';
import { ChunkData, Feature, Feat, CHUNK, CHUNK_PX, TILE, GROUND_INFO, Ground, solidRadius, WORLD_TILES_X, LIFT, MAX_LEVEL, TREES, LIQUID_FRAMES } from '../../lib/terrain/types';
import { paintTribalPlayer, Dir, PLAYER_AX, PLAYER_AY } from '../../lib/terrain/player';
import { NatureFx, FxContext } from './natureFx';
import { BAYER4, seedToInt } from '../../lib/terrain/noise';
import { SpriteBank, Sprite } from '../../lib/terrain/sprites';
import { ITEMS, harvestFor, featureName, ItemDef } from '../../lib/terrain/items';
import { vegetationHueShift, ROCK_NAMES, RockType } from '../../lib/terrain/palettes';
import { GLWorld, TexRegion, rgba } from '../../lib/render/glWorld';
import { planetFauna } from '../../lib/fauna/species';
import { SpriteStore } from '../../lib/fauna/spriteStore';
import { Fauna, World, AnimalDraw } from './fauna';
import { Genome, Stage as CStage } from '../../lib/creature/genome';
import { LayerType } from '../../lib/planet-generator/generator';
import { frameMeter } from '../../lib/render/frameMeter';
import type { Cinematic, CineApi } from '../Demo/cinema';

interface Props {
  session: PlanetSession;
  mapX: number;
  mapY: number;
  title: string;
  onExit: () => void;
  /** Free camera instead of the character: no collisions, speed grows as the zoom widens, drag to pan. */
  spectator?: boolean;
  /** the player's own species (drawn in its tribal era); falls back to the painted tribal hunter */
  playerCreature?: { genome: Genome; citizen: number } | null;
  /** Scripted camera (demo reel): no HUD, no input, nothing saved; implies the spectator camera. */
  cinematic?: Cinematic | null;
  /** loaded but invisible (a later scene of a trailer): terrain streams in, nothing is drawn */
  standby?: boolean;
}

/** A drawable image: a GPU texture region (WebGL path) or a canvas (Canvas2D fallback). */
interface Img { reg?: TexRegion; c?: HTMLCanvasElement; w: number; h: number }
interface LoadedRow { y: number; h: number; img: Img; anim: Img[] | null }
interface LoadedChunk {
  data: ChunkData; rows: LoadedRow[]; mini: HTMLCanvasElement; lastUsed: number;
  byRow: Feature[][];   // features bucketed by local tile row, pre-sorted by y
  tex: WebGLTexture | null;
}
/** Regional LOD block: REGION_N x REGION_N colours sampled every `step` tiles. */
interface RegionBlock { img: Img; slot: number; step: number; tx: number; ty: number; lastUsed: number }
const REGION_N = 64;
const REGION_SLOTS = (2048 / REGION_N) ** 2;
/** Zoom stops (CSS px per world px). >= 1: gameplay, 1/2..1/128: regional, below: world map. */
const ZOOMS = [6, 5, 4, 3, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32, 1 / 64, 1 / 128, 1 / 256, 1 / 512, 1 / 1024, 0];
type Lod = 'local' | 'regional' | 'world';
const lodOf = (z: number): Lod => (z >= 0.99 ? 'local' : z >= 1 / 128 - 1e-9 ? 'regional' : 'world');
const LOD_NAME: Record<Lod, string> = { local: 'LOD 1 · Local', regional: 'LOD 2 · Regional', world: 'LOD 3 · Mapa-múndi' };
const WORLD_PX = WORLD_TILES_X * TILE;

/** Everything the scene needs to draw, independent of the backend. */
interface Painter {
  blit(im: Img, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  sprite(c: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number): void;
  shadow(x: number, y: number, rx: number): void;
  flushShadows(): void;
}
function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
  let any = false;
  return {
    blit: (im, sx, sy, sw, sh, dx, dy, dw, dh) => ctx.drawImage(im.c!, sx, sy, sw, sh, dx, dy, dw, dh),
    sprite: (c, sx, sy, sw, sh, dx, dy) => (sw === c.width && sh === c.height ? ctx.drawImage(c, dx, dy) : ctx.drawImage(c, sx, sy, sw, sh, dx, dy, sw, sh)),
    shadow: (x, y, rx) => {
      if (!any) { ctx.beginPath(); any = true; }
      ctx.moveTo(x + rx * 1.25, y);
      ctx.ellipse(x + rx * 0.25, y, rx, rx * 0.38, 0, 0, Math.PI * 2);
    },
    flushShadows: () => { if (any) { ctx.fillStyle = 'rgba(8,12,6,0.28)'; ctx.fill(); any = false; } },
  };
}
const SHADOW_COL = rgba(8, 12, 6, 0.28);
function glPainter(gl: GLWorld, shadowTex: HTMLCanvasElement): Painter {
  return {
    blit: (im, sx, sy, sw, sh, dx, dy, dw, dh) => gl.quad(im.reg!, sx, sy, sw, sh, dx, dy, dw, dh),
    sprite: (c, sx, sy, sw, sh, dx, dy) => { const r = gl.atlas(c); gl.quad(r, sx, sy, sw, sh, dx, dy, sw, sh); },
    shadow: (x, y, rx) => { const r = gl.atlas(shadowTex); gl.quad(r, 0, 0, r.w, r.h, x - rx * 0.75, y - rx * 0.38, rx * 2, rx * 0.76, SHADOW_COL); },
    flushShadows: () => { /* drawn immediately */ },
  };
}
/** Pixel-art ellipse used for contact shadows on the GPU path. */
function shadowSprite() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 12;
  const x = c.getContext('2d')!;
  const img = x.createImageData(32, 12);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 32; i++) {
    const d = ((i + 0.5 - 16) / 16) ** 2 + ((j + 0.5 - 6) / 6) ** 2;
    if (d <= 1) img.data[(j * 32 + i) * 4 + 3] = 255;
    img.data[(j * 32 + i) * 4] = img.data[(j * 32 + i) * 4 + 1] = img.data[(j * 32 + i) * 4 + 2] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
function canvasImg(px: Uint8ClampedArray, w: number, h: number): Img {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return { c, w, h };
}
/** Packs all terrain rows (and liquid animation frames) of a chunk into the columns of a single texture. */
function packChunkRows(gl: GLWorld, data: ChunkData): { rows: LoadedRow[]; tex: WebGLTexture } {
  const items: { px: Uint8ClampedArray; h: number; col: number; y: number }[] = [];
  for (const r of data.rows) { items.push({ px: r.px, h: r.h, col: 0, y: 0 }); if (r.anim) for (const a of r.anim) items.push({ px: a, h: r.h, col: 0, y: 0 }); }
  let colH = 2048, cols = 1, usedH = 1;
  for (;;) {
    let col = 0, y = 0;
    usedH = 1;
    for (const it of items) {
      if (y + it.h > colH) { col++; y = 0; }
      it.col = col; it.y = y; y += it.h + 1;
      usedH = Math.max(usedH, y);
    }
    cols = col + 1;
    if (cols * CHUNK_PX <= gl.maxTex || colH >= gl.maxTex) break;
    colH = Math.min(gl.maxTex, colH * 2);
  }
  const TW = cols * CHUNK_PX;
  const tex = gl.newTexture(TW, usedH);
  for (const it of items) gl.upload(tex, it.col * CHUNK_PX, it.y, CHUNK_PX, it.h, it.px);
  const region = (it: typeof items[number]): Img => ({ reg: { tex, x: it.col * CHUNK_PX, y: it.y, w: CHUNK_PX, h: it.h, tw: TW, th: usedH }, w: CHUNK_PX, h: it.h });
  let k = 0;
  const rows = data.rows.map(r => {
    const img = region(items[k++]);
    const anim = r.anim ? r.anim.map(() => region(items[k++])) : null;
    return { y: r.y, h: r.h, img, anim };
  });
  return { rows, tex };
}

const DRY_GROUND = new Set<Ground>([Ground.SAND, Ground.RED_SAND, Ground.DIRT, Ground.DRY_GRASS, Ground.GRAVEL, Ground.ASH, Ground.REGOLITH, Ground.SALT_FLAT]);

const BIOME_PT: Record<number, string> = {
  [BiomeType.SNOW]: 'Deserto de neve', [BiomeType.TUNDRA]: 'Tundra', [BiomeType.TAIGA]: 'Taiga', [BiomeType.COLD_DESERT]: 'Deserto frio',
  [BiomeType.STEPPE]: 'Estepe', [BiomeType.GRASSLAND]: 'Pradaria', [BiomeType.SEASONAL_FOREST]: 'Floresta temperada',
  [BiomeType.TEMPERATE_RAINFOREST]: 'Floresta úmida temperada', [BiomeType.SAVANNA]: 'Savana', [BiomeType.SUBTROPICAL_DESERT]: 'Deserto',
  [BiomeType.TROPICAL_RAINFOREST]: 'Floresta tropical',
};
const SWAY = new Set<Feat>([Feat.TALL_GRASS, Feat.REEDS, Feat.CATTAIL, Feat.FLAX, Feat.FLOWER, Feat.FERN, Feat.WILD_CROP]);
const DAY_SECONDS = 360;
/** player species sprite scale: the tribal figure ends up ~34 px tall, like the painted hunter */
const PLAYER_K = 0.4;
const REACH = 26;
const SPEED = 74;

export function SurvivalView({ session, mapX, mapY, title, onExit, spectator: spectatorProp = false, playerCreature = null, cinematic = null, standby = false }: Props) {
  const cine = cinematic;
  const spectator = spectatorProp || !!cine;
  const standbyRef = useRef(standby);
  standbyRef.current = standby;
  const preloadRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const cfg = session.config;
  const saveKey = `survival:${cfg.seed}:${cfg.planetType}`;

  const [loading, setLoading] = useState('Descendo pela atmosfera…');
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [miniOn, setMiniOn] = useState(true);
  const [hud, setHud] = useState({ biome: '', ground: '', temp: 0, lat: 0, lon: 0, clock: '08:00', rock: '', alt: 0, weather: 'clear' });
  const [prompt, setPrompt] = useState<{ text: string; action: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bank = useMemo(() => new SpriteBank(vegetationHueShift(cfg.vegetationHue, cfg.planetType === PlanetType.ALIEN_LIFE)), [cfg]);
  // wildlife: 200+ species for living worlds, sprites rendered by workers on demand
  const store = useMemo(() => new SpriteStore(), []);
  useEffect(() => () => store.dispose(), [store]);
  const fauna = useMemo(() => new Fauna(planetFauna(cfg), store, cfg.seed), [cfg, store]);
  const player = useMemo(() => paintTribalPlayer(), []);
  const poolRef = useRef<TerrainPool | null>(null);
  const glRef = useRef<GLWorld | null>(null);
  const poolCenter = useRef({ x: mapX, y: mapY });
  const poolMoving = useRef(false);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const aliveRef = useRef(true);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [lodLabel, setLodLabel] = useState<{ lod: Lod; zoom: number }>({ lod: 'local', zoom: 3 });
  const [perf, setPerf] = useState({ fps: 0, cpu: 0, chunkMs: 0, workers: 1, chunks: 0, draws: 0, gpu: false });
  const [perfOn, setPerfOn] = useState(true);
  const fx = useMemo(() => new NatureFx(seedToInt(cfg.seed + '_fx')), [cfg]);
  // Dev-only handle for automated visual checks (time of day, weather...)
  useEffect(() => { if (import.meta.env.DEV) (window as any).__survival = { G, fx, fauna, store }; }, [fx]);

  // Mutable game state (kept out of React to avoid per-frame renders)
  const G = useRef({
    x: 0, y: 0, dir: 'down' as Dir, moving: false, anim: 0, level: 0, lift: 0, camX: 0, camY: 0, lensK: 0, gatherT: 0, stepPhase: 0,
    keys: new Set<string>(), joy: { x: 0, y: 0 },
    zoom: 3, zoomView: 3, zoomIdx: 3, dir8: 2,
    chunks: new Map<string, LoadedChunk>(), pending: new Set<string>(),
    taken: new Set<string>(), picked: new Map<string, number>(),
    target: null as Feature | null, hover: null as Feature | null,
    floaters: [] as { x: number; y: number; t: number; text: string }[],
    time: 0.33 * DAY_SECONDS, ready: false, mouse: { x: -1, y: -1 },
  });

  // ---------------------------------------------------------------------------
  // Save / load (inventory & gathered resources persist per planet)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (cine) return;
    try {
      const raw = localStorage.getItem(saveKey);
      if (raw) {
        const s = JSON.parse(raw);
        G.current.taken = new Set(s.taken ?? []);
        G.current.picked = new Map((s.picked ?? []).filter((e: unknown) => Array.isArray(e)));
        if (typeof s.time === 'number') G.current.time = s.time;
        setInventory(s.inv ?? {});
        setOrder(s.order ?? Object.keys(s.inv ?? {}));
      }
    } catch { /* storage unavailable */ }
  }, [saveKey]);
  const invRef = useRef({ inventory, order });
  invRef.current = { inventory, order };
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(saveKey, JSON.stringify({
          inv: invRef.current.inventory, order: invRef.current.order,
          taken: [...G.current.taken].slice(-20000), picked: [...G.current.picked.entries()].slice(-5000), time: G.current.time,
        }));
      } catch { /* ignore */ }
    };
    if (cine) return;
    const id = setInterval(save, 4000);
    return () => { clearInterval(id); save(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey]);

  // ---------------------------------------------------------------------------
  // Spawn
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    // the spectator camera goes exactly where it was dropped (even over the ocean)
    const S = WORLD_TILES_X / session.width;
    const start = spectator ? Promise.resolve({ tx: Math.floor((mapX + 0.5) * S), ty: Math.floor((mapY + 0.5) * S) }) : session.spawn(mapX, mapY);
    start.then(({ tx, ty }) => {
      if (!alive) return;
      poolCenter.current = { x: mapX, y: mapY };
      G.current.x = tx * TILE + TILE / 2;
      G.current.y = ty * TILE + TILE / 2;
      G.current.zoomIdx = ZOOMS.indexOf(window.innerWidth < 700 ? 2 : 3);
      G.current.zoomView = ZOOMS[G.current.zoomIdx];
      setLoading('Gerando terreno…');
      // spin up one terrain worker per spare CPU core
      session.terrainPool(mapX, mapY).then(pool => {
        if (!alive) { pool.dispose(); return; }
        poolRef.current = pool;
      }).catch(() => { /* keep using the session worker */ });
    }).catch(e => setLoading('Falha ao pousar: ' + e.message));
    return () => { alive = false; poolRef.current?.dispose(); poolRef.current = null; };
  }, [session, mapX, mapY, spectator]);

  /** Re-seats the parallel terrain workers around a new map point once the camera travelled far from the old window. */
  const recenterPool = (mx: number, my: number) => {
    if (poolMoving.current) return;
    poolMoving.current = true;
    session.terrainPool(mx, my).then(pool => {
      poolMoving.current = false;
      if (!aliveRef.current) { pool.dispose(); return; }
      const old = poolRef.current;
      poolRef.current = pool;
      poolCenter.current = { x: mx, y: my };
      old?.dispose();
    }).catch(() => { poolMoving.current = false; });
  };

  // ---------------------------------------------------------------------------
  // Chunk streaming
  // ---------------------------------------------------------------------------
  const requestChunks = () => {
    const g = G.current;
    if (!g.x && !g.y) return;
    const pcx = Math.floor(g.x / CHUNK_PX), pcy = Math.floor(g.y / CHUNK_PX);
    const want: [number, number, number][] = [];
    const pool = poolRef.current;
    const R = pool ? 3 : 2;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) want.push([pcx + dx, pcy + dy, dx * dx + dy * dy]);
    // a scripted camera also streams in the place of its next cut
    const pre = preloadRef.current;
    if (pre) {
      const qx = Math.floor(pre.x / CHUNK_PX), qy = Math.floor(pre.y / CHUNK_PX);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) want.push([qx + dx, qy + dy, dx * dx + dy * dy + 2]);
    }
    want.sort((a, b) => a[2] - b[2]);
    for (const [cx, cy] of want) {
      const key = `${cx},${cy}`;
      if (g.chunks.has(key) || g.pending.has(key)) continue;
      if (g.pending.size >= (pool ? pool.size + 1 : 2)) break;
      g.pending.add(key);
      (pool ?? session).chunk(cx, cy).then(data => {
        g.pending.delete(key);
        if (!aliveRef.current) return;
        const gl = glRef.current;
        let rows: LoadedRow[], tex: WebGLTexture | null = null;
        if (gl) ({ rows, tex } = packChunkRows(gl, data));
        else rows = data.rows.map(r => ({ y: r.y, h: r.h, img: canvasImg(r.px, CHUNK_PX, r.h), anim: r.anim ? r.anim.map(a => canvasImg(a, CHUNK_PX, r.h)) : null }));
        const byRow: Feature[][] = Array.from({ length: CHUNK }, () => []);
        for (const f of data.features) byRow[Math.max(0, Math.min(CHUNK - 1, Math.floor(f.y / TILE) - data.cy * CHUNK))].push(f);
        for (const b of byRow) b.sort((a, b2) => (a.t === Feat.LILY_PAD ? a.y - 100 : a.y) - (b2.t === Feat.LILY_PAD ? b2.y - 100 : b2.y));
        data.rows = []; // pixel buffers now live in the canvases
        const mini = document.createElement('canvas');
        mini.width = CHUNK; mini.height = CHUNK;
        mini.getContext('2d')!.putImageData(new ImageData(data.mini as Uint8ClampedArray<ArrayBuffer>, CHUNK, CHUNK), 0, 0);
        g.chunks.set(key, { data, rows, mini, lastUsed: performance.now(), byRow, tex });
        fauna.spawnChunk(data.cx, data.cy, world);
        const cap = cine ? 150 : 64;
        if (g.chunks.size > cap) {
          const far = [...g.chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed).slice(0, g.chunks.size - cap);
          for (const [k, c] of far) { g.chunks.delete(k); fauna.removeChunk(k); if (c.tex) glRef.current?.deleteTexture(c.tex); }
        }
        requestChunks();
      }).catch(() => g.pending.delete(key));
    }
  };

  // ---------------------------------------------------------------------------
  // World queries
  // ---------------------------------------------------------------------------
  const chunkAt = (wx: number, wy: number) => G.current.chunks.get(`${Math.floor(wx / CHUNK_PX)},${Math.floor(wy / CHUNK_PX)}`);
  const cellAt = (wx: number, wy: number) => {
    const c = chunkAt(wx, wy);
    if (!c) return null;
    const tx = Math.floor(wx / TILE) - c.data.cx * CHUNK, ty = Math.floor(wy / TILE) - c.data.cy * CHUNK;
    return { c, k: ty * CHUNK + tx };
  };
  const groundAt = (wx: number, wy: number): Ground | null => {
    const q = cellAt(wx, wy);
    return q ? (q.c.data.ground[q.k] as Ground) : null;
  };
  const levelAt = (wx: number, wy: number): number | null => {
    const q = cellAt(wx, wy);
    return q ? q.c.data.level[q.k] : null;
  };
  /** Continuous ground height (screen px) - interpolated along stairways so the player glides up/down. */
  const liftAt = (wx: number, wy: number): number => {
    const q = cellAt(wx, wy);
    if (!q) return G.current.lift;
    const L = q.c.data.level[q.k], d = q.c.data.ramp[q.k];
    const fx = (wx / TILE) - Math.floor(wx / TILE), fy = (wy / TILE) - Math.floor(wy / TILE);
    const drop = d === 1 ? fy : d === 2 ? 1 - fy : d === 3 ? fx : d === 4 ? 1 - fx : 0;
    return (L - drop) * LIFT;
  };
  const tileInfo = (wx: number, wy: number) => {
    const q = cellAt(wx, wy);
    if (!q) return null;
    const d = q.c.data;
    return { g: d.ground[q.k] as Ground, biome: d.biome[q.k], rock: d.rock[q.k], temp: d.temp[q.k], level: d.level[q.k] };
  };
  const nearbyFeatures = (wx: number, wy: number, fn: (f: Feature) => void) => {
    const pcx = Math.floor(wx / CHUNK_PX), pcy = Math.floor(wy / CHUNK_PX);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = G.current.chunks.get(`${pcx + dx},${pcy + dy}`);
      if (c) for (const f of c.data.features) if (!G.current.taken.has(f.id)) fn(f);
    }
  };
  /** Cliffs block; one-level steps are only possible where the upper tile is a ramp. */
  const canStep = (fx: number, fy: number, tx: number, ty: number) => {
    const a = cellAt(fx, fy), b = cellAt(tx, ty);
    if (!a || !b) return false;
    const la = a.c.data.level[a.k], lb = b.c.data.level[b.k];
    if (la === lb) return true;
    if (Math.abs(la - lb) !== 1) return false;
    // the upper tile must be a stairway that descends exactly towards the lower tile
    const up = lb > la ? { q: b, x: tx, y: ty } : { q: a, x: fx, y: fy };
    const lo = lb > la ? { x: fx, y: fy } : { x: tx, y: ty };
    const d = up.q.c.data.ramp[up.q.k];
    if (!d) return false;
    const dx = Math.floor(lo.x / TILE) - Math.floor(up.x / TILE), dy = Math.floor(lo.y / TILE) - Math.floor(up.y / TILE);
    return (d === 1 && dy === 1 && dx === 0) || (d === 2 && dy === -1 && dx === 0) || (d === 3 && dx === 1 && dy === 0) || (d === 4 && dx === -1 && dy === 0);
  };
  /** What the wildlife needs to know about the terrain. */
  const world: World = {
    tile: (wx, wy) => {
      const q = cellAt(wx, wy);
      if (!q) return null;
      const d = q.c.data, gr = d.ground[q.k] as Ground, info = GROUND_INFO[gr];
      return { water: !!info.water, deep: gr === Ground.DEEP_WATER, blocking: !!info.blocking, level: d.level[q.k], biome: d.biome[q.k], color: [d.mini[q.k * 4], d.mini[q.k * 4 + 1], d.mini[q.k * 4 + 2]] };
    },
    canStep: (fx0, fy0, tx, ty) => canStep(fx0, fy0, tx, ty),
  };
  const blocked = (wx: number, wy: number, fromX: number, fromY: number) => {
    const g = groundAt(wx, wy);
    if (g === null || GROUND_INFO[g].blocking) return true;
    if (!canStep(fromX, fromY, wx, wy)) return true;
    const lv = levelAt(wx, wy);
    let hit = false;
    nearbyFeatures(wx, wy, f => {
      if (hit || f.l !== lv) return;
      const r = solidRadius(f.t);
      if (r && Math.abs(f.x - wx) < r + 4 && Math.abs(f.y - 1 - wy) < r * 0.6 + 3) hit = true;
    });
    return hit;
  };

  // ---------------------------------------------------------------------------
  // Gathering
  // ---------------------------------------------------------------------------
  const addItems = (items: [string, number][]) => {
    setInventory(prev => {
      const next = { ...prev };
      for (const [id, n] of items) next[id] = (next[id] ?? 0) + n;
      return next;
    });
    setOrder(prev => {
      const next = [...prev];
      for (const [id] of items) if (!next.includes(id)) next.push(id);
      return next;
    });
  };
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? null : t)), 1800); };

  const interact = (f: Feature | null) => {
    const g = G.current;
    if (!f || spectator) return;
    if (f.l !== g.level) { flash(f.l > g.level ? 'Está no alto — encontre uma rampa para subir' : 'Está lá embaixo — desça por uma rampa'); return; }
    if (Math.hypot(f.x - g.x, f.y - g.y) > REACH + 14) { flash('Muito longe — aproxime-se'); return; }
    const h = harvestFor(f);
    if (h.kind === 'take' || (h.kind === 'pick' && !g.picked.has(f.id))) {
      if (h.kind === 'take') g.taken.add(f.id); else g.picked.set(f.id, g.time);
      g.gatherT = 0.5;
      if (Math.abs(f.x - g.x) > Math.abs(f.y - g.y)) g.dir = f.x < g.x ? 'left' : 'right'; else g.dir = f.y < g.y ? 'up' : 'down';
      addItems(h.items);
      h.items.forEach(([id, n], i) => g.floaters.push({ x: f.x, y: f.y - f.l * LIFT - 14 - i * 9, t: 0, text: `+${n} ${ITEMS[id]?.name ?? id}` }));
    } else if (h.kind === 'pick') flash('Já colhido — os frutos voltam em cerca de um dia');
    else if (h.kind === 'tool') flash(`Requer ${h.tool} (em breve: crafting)`);
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (bagOpen) setBagOpen(false); else onExit(); return; }
      if (cine) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { e.preventDefault(); G.current.keys.add(k); }
      if (k === 'e' || k === ' ') { e.preventDefault(); interact(G.current.target); }
      if (k === 'i' || k === 'tab') { e.preventDefault(); setBagOpen(o => !o); }
      if (k === 'm') setMiniOn(o => !o);
      if (e.key === 'F3' || k === 'p') { e.preventDefault(); setPerfOn(o => !o); }
      if (k === '-' || k === '_' || k === 'q') zoomStep(1);
      if (k === '=' || k === '+' || k === 'z') zoomStep(-1);
      e.stopImmediatePropagation();
    };
    const up = (e: KeyboardEvent) => { G.current.keys.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagOpen, onExit]);

  /** Current zoom target in CSS px per world px (the last stop fits the whole planet on screen). */
  const zoomTarget = () => {
    const g = G.current;
    const z = ZOOMS[g.zoomIdx];
    if (z) return z;
    const c = canvasRef.current;
    const W = c?.clientWidth || window.innerWidth, H = c?.clientHeight || window.innerHeight;
    return Math.min(W / WORLD_PX, H / (WORLD_PX * (session.height / session.width))) * 0.92;
  };
  const zoomStep = (d: number) => { const g = G.current; g.zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, g.zoomIdx + d)); };

  useEffect(() => {
    const c = canvasRef.current!;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cine) return;
      acc += e.deltaY;
      if (Math.abs(acc) < 40 && Math.abs(e.deltaY) < 40) return; // trackpads: accumulate small deltas
      zoomStep(acc > 0 ? 1 : -1);
      acc = 0;
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Screen point -> world-screen coords (x, y as drawn, i.e. y already includes lift). */
  const screenToWorld = (sx: number, sy: number) => {
    const g = G.current;
    const c = canvasRef.current!;
    return { x: g.camX + (sx - c.clientWidth / 2) / g.zoomView, y: g.camY + (sy - c.clientHeight / 2) / g.zoomView };
  };
  const featureUnder = (wx: number, wy: number): Feature | null => {
    let best: Feature | null = null, bd = 1e9;
    nearbyFeatures(wx, wy + 40, f => {
      const s = bank.get(f.t, f.v, G.current.picked.has(f.id));
      const fy = f.y - f.l * LIFT;
      const x0 = f.x - s.ax, y0 = fy - s.ay;
      if (wx >= x0 - 2 && wx <= x0 + s.c.width + 2 && wy >= (s.tall ? fy - 14 : y0 - 2) && wy <= fy + 4) {
        const d = Math.hypot(f.x - wx, fy - wy) + (s.tall ? 10 : 0);
        if (d < bd) { bd = d; best = f; }
      }
    });
    return best as Feature | null;
  };

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    aliveRef.current = true;
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    // WebGL2 batched renderer; Canvas2D only as a fallback for browsers without it
    let gl: GLWorld | null = null;
    try { gl = GLWorld.create(canvas); } catch (e) { console.warn('WebGL2 indisponível, usando Canvas2D', e); }
    glRef.current = gl;
    const ctx = gl ? null : (canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d'))!;
    const octx = overlay.getContext('2d')!;
    const painter: Painter = gl ? glPainter(gl, shadowSprite()) : canvasPainter(ctx!);
    const lens = document.createElement('canvas');
    const lctx = lens.getContext('2d')!;
    const lensPainter = canvasPainter(lctx);
    const LENS = 132; // world px
    let raf = 0, last = performance.now(), hudT = 0, spotsT = 0;
    let waterSpots: { x: number; y: number; l: number }[] = [];
    let lavaSpots: { x: number; y: number; l: number }[] = [];
    const t0 = performance.now();
    let lodShown: Lod | null = null, zoomShown = -1;

    // --- regional LOD blocks & world map ---
    const regions = new Map<string, RegionBlock>();
    const regionPending = new Set<string>();
    const freeSlots: number[] = [];
    const regionTex = gl ? gl.newTexture(2048, 2048) : null;
    for (let i = REGION_SLOTS - 1; i >= 0; i--) freeSlots.push(i);
    let regionStep = 0;
    let mapImg: Img | null = null, mapLoading = false;
    const worldTilesY = WORLD_TILES_X * (session.height / session.width);

    const loadMap = () => {
      if (mapLoading) return;
      mapLoading = true;
      session.renderLayer(LayerType.FINAL).then(im => {
        if (!aliveRef.current) return;
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d')!.putImageData(im, 0, 0);
        if (gl) {
          let src = c;
          if (c.width > gl.maxTex) { src = document.createElement('canvas'); src.width = gl.maxTex; src.height = Math.round(c.height * gl.maxTex / c.width); src.getContext('2d')!.drawImage(c, 0, 0, src.width, src.height); }
          const tex = gl.newTexture(src.width, src.height);
          gl.upload(tex, 0, 0, src.width, src.height, src);
          mapImg = { reg: { tex, x: 0, y: 0, w: src.width, h: src.height, tw: src.width, th: src.height }, w: src.width, h: src.height };
        } else mapImg = { c, w: c.width, h: c.height };
      }).catch(() => { mapLoading = false; });
    };

    const requestRegions = (step: number, x0: number, y0: number, x1: number, y1: number, cx: number, cy: number) => {
      const pool = poolRef.current;
      if (!pool) return;
      if (step !== regionStep) { pool.clearRegions(); regionStep = step; }
      const span = REGION_N * step, spanPx = span * TILE;
      const want: [number, number, number][] = [];
      for (let by = Math.floor(y0 / spanPx); by <= Math.floor(y1 / spanPx); by++) {
        if (by * span >= worldTilesY || (by + 1) * span <= 0) continue;
        for (let bx = Math.floor(x0 / spanPx); bx <= Math.floor(x1 / spanPx); bx++) {
          const k = `${step}:${bx}:${by}`;
          const hit = regions.get(k);
          if (hit) { hit.lastUsed = performance.now(); continue; }
          if (regionPending.has(k)) continue;
          want.push([bx, by, ((bx + 0.5) * spanPx - cx) ** 2 + ((by + 0.5) * spanPx - cy) ** 2]);
        }
      }
      want.sort((a, b) => a[2] - b[2]);
      for (const [bx, by] of want) {
        if (regionPending.size >= pool.size * 2) break;
        if (!pool.coversTile(bx * span + span / 2, by * span + span / 2)) continue;
        const k = `${step}:${bx}:${by}`;
        regionPending.add(k);
        pool.region(bx * span, by * span, step, REGION_N).then(px => {
          regionPending.delete(k);
          if (!aliveRef.current) return;
          let img: Img, slot = -1;
          const evict = () => {
            let oldK = '', oldT = Infinity;
            for (const [kk, b] of regions) if (b.lastUsed < oldT) { oldT = b.lastUsed; oldK = kk; }
            const b = regions.get(oldK);
            if (b) { regions.delete(oldK); if (b.slot >= 0) freeSlots.push(b.slot); }
          };
          if (gl && regionTex) {
            if (!freeSlots.length) evict();
            slot = freeSlots.pop()!;
            const per = 2048 / REGION_N;
            const sx = (slot % per) * REGION_N, sy = Math.floor(slot / per) * REGION_N;
            gl.upload(regionTex, sx, sy, REGION_N, REGION_N, px);
            img = { reg: { tex: regionTex, x: sx, y: sy, w: REGION_N, h: REGION_N, tw: 2048, th: 2048 }, w: REGION_N, h: REGION_N };
          } else {
            if (regions.size >= 600) evict();
            img = canvasImg(px, REGION_N, REGION_N);
          }
          regions.set(k, { img, slot, step, tx: bx * span, ty: by * span, lastUsed: performance.now() });
        }).catch(() => regionPending.delete(k));
      }
    };

    const drawMap = (p: Painter, x0: number, x1: number) => {
      if (!mapImg) return;
      const H = WORLD_PX * (session.height / session.width);
      for (let k = Math.floor(x0 / WORLD_PX); k <= Math.floor(x1 / WORLD_PX); k++) p.blit(mapImg, 0, 0, mapImg.w, mapImg.h, k * WORLD_PX, 0, WORLD_PX, H);
    };
    const drawRegions = (p: Painter, step: number, x0: number, y0: number, x1: number, y1: number) => {
      // coarser blocks first (they fill the gaps while finer ones stream in), then the current resolution
      const list: RegionBlock[] = [];
      for (const b of regions.values()) {
        if (b.step < step || b.step > step * 16) continue;
        const s = REGION_N * b.step * TILE;
        const dx = b.tx * TILE, dy = b.ty * TILE;
        if (dx > x1 || dx + s < x0 || dy > y1 || dy + s < y0) continue;
        list.push(b);
      }
      list.sort((a, b) => b.step - a.step);
      for (const b of list) { const s = REGION_N * b.step * TILE; p.blit(b.img, 0, 0, REGION_N, REGION_N, b.tx * TILE, b.ty * TILE, s, s); }
    };

    const playerFrame = () => {
      const g = G.current;
      if (g.gatherT > 0) return player.gather[g.dir][Math.min(3, Math.floor((1 - g.gatherT / 0.5) * 4))];
      if (g.moving) return player.walk[g.dir][Math.floor(g.anim) % 6];
      return player.idle[g.dir][Math.floor(performance.now() / 380) % 4];
    };

    const drawScene = (p: Painter, x0: number, x1: number, y0: number, y1: number, t: number, stop: { row: number; y: number } | null) => {
      const g = G.current;
      const rowFrom = Math.floor(y0 / TILE) - 1, rowTo = Math.floor((y1 + MAX_LEVEL * LIFT) / TILE) + 1;
      const cx0 = Math.floor(x0 / CHUNK_PX), cx1 = Math.floor(x1 / CHUNK_PX);
      const pf = playerFrame();
      const prow = g.ready && !spectator ? Math.floor(g.y / TILE) : -1e9;
      const liquidFrame = Math.floor(t * 7) % LIQUID_FRAMES;
      const nowMs = performance.now();
      const fx0 = x0 - 40, fx1 = x1 + 40;
      const own = playerCreature ? store.get(`player:${g.moving ? 'walk' : 'idle'}`, playerCreature.genome, CStage.TRIBAL, g.moving ? 'walk' : 'idle', PLAYER_K, playerCreature.citizen, true) : null;
      const drawPlayer = () => {
        if (own) {
          const fr = Math.floor(g.moving ? g.anim * 1.35 : performance.now() / 160) % own.frames;
          p.sprite(own.canvas, fr * own.cw, g.dir8 * own.ch, own.cw, own.ch, Math.round(g.x - own.ax), Math.round(g.y - g.lift - own.ay));
        } else p.sprite(pf, 0, 0, pf.width, pf.height, Math.round(g.x - PLAYER_AX), Math.round(g.y - g.lift - PLAYER_AY));
      };
      // wildlife bucketed by tile row (sorted by y inside)
      const animals = new Map<number, AnimalDraw[]>();
      for (const d of animalDraws) { const rr = Math.floor(d.a.y / TILE); if (!animals.has(rr)) animals.set(rr, []); animals.get(rr)!.push(d); }
      const drawAnimal = (d: AnimalDraw) => {
        const sh = d.sheet;
        if (d.clip > 0) {
          // surfacing swimmer: only what sticks out of the water, cut at the water line
          const vis = Math.max(0, Math.min(sh.ch, Math.round(sh.ch * (1 - d.clip) * 1.25)));
          if (vis > 0) p.sprite(sh.canvas, d.frame * sh.cw, d.row * sh.ch, sh.cw, vis, Math.round(d.x - sh.ax), Math.round(d.y - vis));
          return;
        }
        p.sprite(sh.canvas, d.frame * sh.cw, d.row * sh.ch, sh.cw, sh.ch, Math.round(d.x - sh.ax), Math.round(d.y - sh.ay));
      };
      let cyCur = 1e9;
      const rowChunks: (LoadedChunk | undefined)[] = [];
      for (let r = rowFrom; r <= rowTo; r++) {
        if (stop && r > stop.row) break;
        const cy = Math.floor(r / CHUNK), j = r - cy * CHUNK;
        if (cy !== cyCur) {
          cyCur = cy;
          rowChunks.length = 0;
          for (let cx = cx0; cx <= cx1; cx++) { const c = g.chunks.get(`${cx},${cy}`); rowChunks.push(c); if (c) c.lastUsed = nowMs; }
        }
        // 1. terrain row (animated frame when it holds water / lava)
        for (let k = 0; k < rowChunks.length; k++) {
          const c = rowChunks[k];
          if (!c) continue;
          const row = c.rows[j];
          if (!row) continue;
          const im = row.anim ? row.anim[liquidFrame] : row.img;
          p.blit(im, 0, 0, im.w, im.h, (cx0 + k) * CHUNK_PX, row.y, im.w, im.h);
        }
        // 2. contact shadows of this row
        for (let k = 0; k < rowChunks.length; k++) {
          const c = rowChunks[k];
          if (!c) continue;
          for (const f of c.byRow[j]) {
            if (f.x < fx0 || f.x > fx1 || g.taken.has(f.id)) continue;
            const sh = bank.get(f.t, f.v, false).shadow;
            if (sh) p.shadow(f.x, f.y - f.l * LIFT, sh);
          }
        }
        if (r === prow) p.shadow(g.x - 0.5, g.y - g.lift, 6);
        const rowAnimals = animals.get(r);
        if (rowAnimals) for (const d of rowAnimals) if (d.clip === 0) p.shadow(d.x - d.sheet.cw * 0.05, d.shadowY, Math.max(3, d.sheet.cw * 0.28));
        p.flushShadows();
        let ai = 0;
        // 3. sprites of this row in y order, player merged in
        let playerDone = r !== prow;
        for (let k = 0; k < rowChunks.length; k++) {
          const c = rowChunks[k];
          if (!c) continue;
          for (const f of c.byRow[j]) {
            if (f.x < fx0 || f.x > fx1 || g.taken.has(f.id)) continue;
            while (rowAnimals && ai < rowAnimals.length && rowAnimals[ai].a.y < f.y && f.t !== Feat.LILY_PAD) drawAnimal(rowAnimals[ai++]);
            if (!playerDone && f.y > g.y && f.t !== Feat.LILY_PAD) { drawPlayer(); playerDone = true; }
            if (stop && r === stop.row && f.y > stop.y) continue;
            const s = bank.get(f.t, f.v, g.picked.has(f.id));
            const W = s.c.width, H = s.c.height;
            const x = f.x - s.ax, y = f.y - f.l * LIFT - s.ay;
            if (TREES.has(f.t)) {
              // canopy sways in the wind, trunk stays rooted
              const dx = Math.round(fx.sway(t, f.x, f.y, 1.4));
              if (dx === 0) p.sprite(s.c, 0, 0, W, H, x, y);
              else {
                const split = Math.max(1, H - 12);
                p.sprite(s.c, 0, 0, W, split, x + dx, y);
                p.sprite(s.c, 0, split, W, H - split, x, y + split);
              }
            } else {
              const dx = SWAY.has(f.t) ? Math.round(fx.sway(t * 1.3, f.x, f.y, 1.6)) : 0;
              p.sprite(s.c, 0, 0, W, H, x + dx, y);
            }
          }
        }
        if (rowAnimals) while (ai < rowAnimals.length) drawAnimal(rowAnimals[ai++]);
        if (!playerDone) drawPlayer();
      }
    };
    let animalDraws: AnimalDraw[] = [];

    const maskCache = new Map<number, HTMLCanvasElement>();
    const lensMask = (k: number) => {
      const q = Math.round(k * 12);
      let m = maskCache.get(q);
      if (m) return m;
      m = document.createElement('canvas');
      m.width = LENS; m.height = LENS;
      const mc = m.getContext('2d')!;
      const img = mc.createImageData(LENS, LENS);
      const R = (LENS / 2 - 3) * (q / 12), band = 7;
      for (let y = 0; y < LENS; y++) for (let x = 0; x < LENS; x++) {
        const d = Math.hypot(x + 0.5 - LENS / 2, (y + 0.5 - LENS / 2) * 1.12);
        let on = d < R - band;
        if (!on && d < R) on = (d - (R - band)) / band < BAYER4[(y & 3) * 4 + (x & 3)];
        img.data[(y * LENS + x) * 4 + 3] = on ? 255 : 0;
      }
      mc.putImageData(img, 0, 0);
      maskCache.set(q, m);
      return m;
    };

    /** Pulsing "you are here" marker for the zoomed-out views (overlay, device px). */
    const drawPlayerMarker = (sx: number, sy: number, t: number, dpr: number, big: boolean, cam = false) => {
      const pulse = (t * 1.2) % 1;
      if (cam) {
        // spectator: a camera reticle instead of the character pin
        octx.save();
        octx.strokeStyle = `rgba(125,211,252,${1 - pulse})`; octx.lineWidth = 2 * dpr;
        octx.beginPath(); octx.arc(sx, sy, (8 + pulse * 18) * dpr, 0, Math.PI * 2); octx.stroke();
        octx.strokeStyle = '#e0f2fe'; octx.lineWidth = 1.5 * dpr;
        octx.beginPath();
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(sx + ax * 4 * dpr, sy + ay * 4 * dpr); octx.lineTo(sx + ax * 10 * dpr, sy + ay * 10 * dpr); }
        octx.stroke();
        if (big) {
          octx.font = `600 ${11 * dpr}px ui-sans-serif, system-ui`; octx.textAlign = 'left';
          octx.fillStyle = 'rgba(0,0,0,0.7)'; octx.fillText('Câmera', sx + 13 * dpr + 1, sy - 9 * dpr + 1);
          octx.fillStyle = '#e0f2fe'; octx.fillText('Câmera', sx + 13 * dpr, sy - 9 * dpr);
        }
        octx.restore();
        return;
      }
      octx.save();
      octx.lineWidth = 2 * dpr;
      octx.strokeStyle = `rgba(255,90,58,${1 - pulse})`;
      octx.beginPath(); octx.arc(sx, sy, (6 + pulse * (big ? 26 : 16)) * dpr, 0, Math.PI * 2); octx.stroke();
      octx.fillStyle = '#ff5a3a'; octx.strokeStyle = '#fff';
      octx.beginPath(); octx.arc(sx, sy, 4.5 * dpr, 0, Math.PI * 2); octx.fill(); octx.stroke();
      // heading arrow
      const g = G.current;
      const a = g.dir === 'up' ? -Math.PI / 2 : g.dir === 'down' ? Math.PI / 2 : g.dir === 'left' ? Math.PI : 0;
      octx.translate(sx, sy); octx.rotate(a);
      octx.fillStyle = '#fff';
      octx.beginPath(); octx.moveTo(13 * dpr, 0); octx.lineTo(8 * dpr, -3.5 * dpr); octx.lineTo(8 * dpr, 3.5 * dpr); octx.fill();
      octx.restore();
      if (big) {
        octx.font = `600 ${11 * dpr}px ui-sans-serif, system-ui`;
        octx.textAlign = 'left';
        octx.fillStyle = 'rgba(0,0,0,0.7)'; octx.fillText('Você está aqui', sx + 12 * dpr + 1, sy - 9 * dpr + 1);
        octx.fillStyle = '#fff'; octx.fillText('Você está aqui', sx + 12 * dpr, sy - 9 * dpr);
      }
    };

    // --- demo reel: the director drives camera, clock and weather ---
    fx.lantern = !cine;
    let cineFade = cine ? 1 : 0, cineZoom = 3, cineWeather = '';
    const cineApi: CineApi = {
      loaded: (x, y, zoom) => {
        if (lodOf(zoom) !== 'local') return !!mapImg;
        const hw = canvas.clientWidth / zoom / 2 + 8, hh = canvas.clientHeight / zoom / 2 + 8;
        const g = G.current;
        for (let cy = Math.floor((y - hh) / CHUNK_PX); cy <= Math.floor((y + hh + MAX_LEVEL * LIFT) / CHUNK_PX); cy++)
          for (let cx = Math.floor((x - hw) / CHUNK_PX); cx <= Math.floor((x + hw) / CHUNK_PX); cx++) if (!g.chunks.has(`${cx},${cy}`)) return false;
        return true;
      },
      get viewW() { return canvas.clientWidth; },
      get viewH() { return canvas.clientHeight; },
      tile: (x, y) => {
        const q = cellAt(x, y);
        return q ? { water: !!GROUND_INFO[q.c.data.ground[q.k] as Ground].water, lava: !!q.c.data.lava[q.k], level: q.c.data.level[q.k] } : null;
      },
      animals: () => fauna.all,
      pending: () => G.current.pending.size,
      get worldZoom() {
        return Math.min(canvas.clientWidth / WORLD_PX, canvas.clientHeight / (WORLD_PX * (session.height / session.width))) * 0.92;
      },
    };

    let fpsFrames = 0, fpsT = performance.now(), cpuAcc = 0, last0 = 0;
    const frame = (now: number) => {
      const cpu0 = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      const g = G.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const DW = Math.round(W * dpr), DH = Math.round(H * dpr);
      if (canvas.width !== DW || canvas.height !== DH) { canvas.width = DW; canvas.height = DH; }
      if (overlay.width !== DW || overlay.height !== DH) { overlay.width = DW; overlay.height = DH; }
      if (!spectator || lodOf(g.zoomView) === 'local') requestChunks();
      // keep the worker field window under the camera / player
      if (g.ready && Math.floor(now / 1000) !== Math.floor(last0 / 1000)) {
        const mpx = g.x / TILE / (WORLD_TILES_X / session.width), mpy = g.y / TILE / (WORLD_TILES_X / session.width);
        let dxm = Math.abs(mpx - poolCenter.current.x) % session.width;
        dxm = Math.min(dxm, session.width - dxm);
        if (dxm > 70 || Math.abs(mpy - poolCenter.current.y) > 70) recenterPool(Math.round(((mpx % session.width) + session.width) % session.width), Math.round(mpy));
      }
      last0 = now;

      if (!g.ready) {
        const c = chunkAt(g.x, g.y);
        if (c && g.x) { g.ready = true; setLoading(''); g.level = levelAt(g.x, g.y) ?? 0; g.lift = liftAt(g.x, g.y); }
      }

      if (cine && (g.x || g.y)) {
        const cam = cine.update(dt, cineApi);
        g.x = cam.x; g.y = cam.y; cineZoom = cam.zoom; cineFade = cam.fade;
        preloadRef.current = cam.preload ?? null;
        if (cam.hour !== undefined) g.time = ((((cam.hour / 24) % 1) + 1) % 1) * DAY_SECONDS;
        // hard cuts: the new weather is there at once
        if (cam.weather && cam.weather !== cineWeather) { cineWeather = cam.weather; fx.force(cam.weather, true); }
        if (g.ready && !mapImg) loadMap();
      }

      // --- spectator camera: free flight, faster the further the zoom is pulled out ---
      if (spectator && g.ready) {
        let mx = 0, my = 0;
        const K = g.keys;
        if (K.has('a') || K.has('arrowleft')) mx -= 1;
        if (K.has('d') || K.has('arrowright')) mx += 1;
        if (K.has('w') || K.has('arrowup')) my -= 1;
        if (K.has('s') || K.has('arrowdown')) my += 1;
        const len = Math.hypot(mx, my);
        if (len > 0) {
          const sp = (K.has('shift') ? 1400 : 520) / g.zoomView; // screen px per second, whatever the zoom
          g.x += (mx / len) * sp * dt; g.y += (my / len) * sp * dt;
        }
        const worldH = WORLD_PX * (session.height / session.width);
        g.y = Math.max(TILE, Math.min(worldH - TILE, g.y));
        g.moving = false;
        const q = cellAt(g.x, g.y);
        if (q) { g.level = q.c.data.level[q.k]; g.lift += (liftAt(g.x, g.y) - g.lift) * Math.min(1, dt * 8); }
        g.time += dt;
      }

      // --- movement ---
      if (g.ready && !spectator) {
        let mx = 0, my = 0;
        const K = g.keys;
        if (K.has('a') || K.has('arrowleft')) mx -= 1;
        if (K.has('d') || K.has('arrowright')) mx += 1;
        if (K.has('w') || K.has('arrowup')) my -= 1;
        if (K.has('s') || K.has('arrowdown')) my += 1;
        mx += g.joy.x; my += g.joy.y;
        const len = Math.hypot(mx, my);
        g.moving = len > 0.15;
        if (g.moving) {
          mx /= Math.max(1, len); my /= Math.max(1, len);
          if (Math.abs(mx) > Math.abs(my)) g.dir = mx < 0 ? 'left' : 'right'; else g.dir = my < 0 ? 'up' : 'down';
          g.dir8 = ((Math.round(Math.atan2(my, mx) / (Math.PI / 4)) % 8) + 8) % 8;
          const gr = groundAt(g.x, g.y);
          const sp = SPEED * (gr !== null ? GROUND_INFO[gr].speed || 0.4 : 1);
          const nx = g.x + mx * sp * dt, ny = g.y + my * sp * dt;
          if (!blocked(nx, g.y, g.x, g.y)) g.x = nx;
          if (!blocked(g.x, ny, g.x, g.y)) g.y = ny;
          g.anim += dt * 9 * (sp / SPEED);
          // footfalls: dust on dry ground, splashes in water
          const phase = Math.floor(g.anim / 3);
          if (phase !== g.stepPhase) {
            g.stepPhase = phase;
            if (gr !== null && DRY_GROUND.has(gr)) fx.dust(g.x + (Math.random() - 0.5) * 4, g.y - g.lift, gr === Ground.SAND || gr === Ground.RED_SAND ? '#d8c08a' : gr === Ground.ASH ? '#6a6460' : '#a08a64');
          }
          if (gr !== null && GROUND_INFO[gr].water && Math.random() < dt * 6) fx.ring(g.x, g.y - g.lift, 5, 'rgba(220,240,255,0.6)');
        } else g.anim = 0;
        if (g.gatherT > 0) g.gatherT = Math.max(0, g.gatherT - dt);
        g.level = levelAt(g.x, g.y) ?? g.level;
        g.lift += (liftAt(g.x, g.y) - g.lift) * Math.min(1, dt * 25);
        g.time += dt;
        if (Math.floor(g.time) % 5 === 0) for (const [id, tp] of g.picked) if (g.time - tp > DAY_SECONDS) g.picked.delete(id);
      }

      // --- zoom (smooth, in log space) & level of detail ---
      const zt = cine ? cineZoom : zoomTarget();
      g.zoom = zt;
      const lz = Math.log(g.zoomView), lt = Math.log(zt);
      g.zoomView = cine || Math.abs(lt - lz) < 0.004 ? zt : Math.exp(lz + (lt - lz) * Math.min(1, dt * 11));
      const Z = g.zoomView;
      const lod = lodOf(Z);
      if (lod !== lodShown || (!cine && zt !== zoomShown)) { lodShown = lod; zoomShown = zt; setLodLabel({ lod, zoom: zt }); }
      const local = lod === 'local';
      if (standbyRef.current) { raf = requestAnimationFrame(frame); return; }

      // --- interaction target (same terrace only; hand-gatherables win over tool-only things) ---
      let target: Feature | null = null, td = REACH, toolT: Feature | null = null, toolD = REACH - 6;
      if (g.ready && local && !spectator) nearbyFeatures(g.x, g.y, f => {
        if (f.l !== g.level) return;
        const h = harvestFor(f);
        if (h.kind === 'none' || (h.kind === 'pick' && g.picked.has(f.id))) return;
        const d = Math.hypot(f.x - g.x, f.y - g.y);
        if (h.kind === 'tool') { if (d < toolD) { toolD = d; toolT = f; } }
        else if (d < td) { td = d; target = f; }
      });
      g.target = (target ?? toolT) as Feature | null;

      // --- camera ---
      const S = Z * dpr;
      const [shx, shy] = local ? fx.shake() : [0, 0];
      let camYw = g.y - g.lift - 8 + shy;
      if (!local) {
        // keep the planet's surface filling the screen vertically (poles stay at the edges)
        const worldH = WORLD_PX * (session.height / session.width), halfH = H / Z / 2;
        camYw = worldH <= halfH * 2 ? worldH / 2 : Math.max(halfH, Math.min(worldH - halfH, camYw));
      }
      const camX = Math.round((g.x + shx) * S) / S, camY = Math.round(camYw * S) / S;
      g.camX = camX; g.camY = camY;
      if (local && g.mouse.x >= 0) { const w = screenToWorld(g.mouse.x, g.mouse.y); g.hover = featureUnder(w.x, w.y); } else g.hover = null;
      const tx0 = Math.round(DW / 2 - camX * S), ty0 = Math.round(DH / 2 - camY * S);
      const toScreen = (x: number, y: number): [number, number] => [x * S + tx0, y * S + ty0];
      const vw = W / Z / 2 + 48, vh = H / Z / 2 + 64;
      const x0 = camX - vw, x1 = camX + vw, y0 = camY - vh, y1 = camY + vh;
      const t = (now - t0) / 1000;
      const day = (g.time / DAY_SECONDS) % 1;
      const sun = Math.sin((day - 0.25) * Math.PI * 2);

      let fxc: FxContext | null = null;
      if (local) {
        // --- sample water / lava spots for ambient effects ---
        spotsT -= dt;
        if (spotsT <= 0 && g.ready) {
          spotsT = 0.6;
          waterSpots = []; lavaSpots = [];
          for (let k = 0; k < 90 && (waterSpots.length < 8 || lavaSpots.length < 24); k++) {
            const wx = x0 + Math.random() * (x1 - x0), wy = y0 + Math.random() * (y1 - y0);
            const q = cellAt(wx, wy);
            if (!q) continue;
            const gr = q.c.data.ground[q.k] as Ground;
            const cxw = (Math.floor(wx / TILE) + 0.5) * TILE, cyw = (Math.floor(wy / TILE) + 0.5) * TILE;
            if (GROUND_INFO[gr].water && gr !== Ground.DEEP_WATER && waterSpots.length < 8) waterSpots.push({ x: cxw, y: cyw, l: q.c.data.level[q.k] });
            else if (gr === Ground.DEEP_WATER && waterSpots.length < 8 && Math.random() < 0.5) waterSpots.push({ x: cxw, y: cyw, l: 0 });
            if (q.c.data.lava[q.k] && lavaSpots.length < 24) lavaSpots.push({ x: cxw, y: cyw, l: q.c.data.level[q.k] });
          }
        }
        const visible: Feature[] = [];
        const falls: { x: number; y: number; w: number; h: number }[] = [];
        for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor((y1 + MAX_LEVEL * LIFT) / CHUNK_PX); cy++) for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
          const c = g.chunks.get(`${cx},${cy}`);
          if (!c) continue;
          for (const f of c.data.falls) if (f.x < x1 && f.x + f.w > x0 && f.y < y1 && f.y + f.h > y0) falls.push(f);
          if (visible.length < 400) for (const f of c.data.features) if (f.x > x0 && f.x < x1 && f.y > y0 && f.y < y1 && !g.taken.has(f.id)) visible.push(f);
        }
        const info0 = g.ready ? tileInfo(g.x, g.y) : null;
        fxc = {
          t, dt, day, sun, view: { x0, y0, x1, y1 }, player: { x: g.x, y: g.y, lift: g.lift }, visible, waterSpots, lavaSpots, falls,
          surface: (wx: number, wy: number) => {
            const q = cellAt(wx, wy);
            if (!q) return null;
            const gr = q.c.data.ground[q.k] as Ground;
            return { water: !!GROUND_INFO[gr].water, lift: q.c.data.level[q.k] * LIFT };
          },
          climate: { temp: info0?.temp ?? 0.5, moist: 0.5, living: cfg.planetType === PlanetType.EARTH_LIKE || cfg.planetType === PlanetType.ALIEN_LIFE || cfg.planetType === PlanetType.OCEAN_WORLD || cfg.planetType === PlanetType.SWAMP_WORLD, desert: info0?.biome === BiomeType.SUBTROPICAL_DESERT || info0?.biome === BiomeType.COLD_DESERT },
        };
        if (g.ready) { fx.update(fxc); fauna.update(dt, g.x, g.y, world, fx, Math.random); }
      } else {
        if (!mapImg) loadMap();
        if (lod === 'regional' && g.ready) {
          const step = 2 ** Math.ceil(Math.log2(Math.max(1, 3 / (TILE * zt))));
          requestRegions(step, x0, y0, x1, y1, camX, camY);
        }
      }

      // --- vision lens: when terrain or a tree hides the player, cut a dithered window through it ---
      let lensOn = false;
      if (g.ready && local) {
        const feet = g.y - g.lift, head = feet - 22;
        let occ = false;
        const pr = Math.floor(g.y / TILE), pc = Math.floor(g.x / TILE);
        for (let r = pr + 1; r <= pr + MAX_LEVEL && !occ; r++) for (let c = pc - 1; c <= pc + 1; c++) {
          const L = levelAt(c * TILE, r * TILE);
          if (L !== null && L > g.level && r * TILE - L * LIFT < feet - 12) { occ = true; break; }
        }
        if (!occ) nearbyFeatures(g.x, g.y, f => {
          if (occ || f.y <= g.y) return;
          const s = bank.get(f.t, f.v, g.picked.has(f.id));
          if (!s.tall) return;
          const fy = f.y - f.l * LIFT;
          if (Math.abs(f.x - g.x) < s.c.width / 2 - 3 && fy - s.ay < feet - 8 && fy > head + 6) occ = true;
        });
        g.lensK += ((occ ? 1 : 0) - g.lensK) * Math.min(1, dt * 7);
        lensOn = g.lensK > 0.04 && !spectator;
      } else g.lensK = 0;
      const lensX = g.x, lensY = g.y - g.lift - 10;
      const lensStop = { row: Math.floor(g.y / TILE), y: g.y };

      animalDraws = local && g.ready ? fauna.collect(x0, y0, x1, y1) : [];
      // --- render the world ---
      if (gl) {
        gl.begin(camX, camY, S, [0.02, 0.027, 0.047]);
        if (local) {
          drawScene(painter, x0, x1, y0, y1, t, null);
          if (lensOn) {
            const [sx, sy] = toScreen(lensX, lensY);
            gl.lens(sx, sy, (LENS / 2 - 3) * g.lensK * S, S);
            drawScene(painter, lensX - LENS / 2, lensX + LENS / 2, lensY - LENS / 2, lensY + LENS / 2, t, lensStop);
            gl.lens(0, 0, 0, 1);
          }
        } else {
          drawMap(painter, x0, x1);
          if (lod === 'regional') drawRegions(painter, regionStep || 1, x0, y0, x1, y1);
        }
        gl.flush();
      } else if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, DW, DH);
        ctx.setTransform(S, 0, 0, S, tx0, ty0);
        ctx.imageSmoothingEnabled = false;
        if (local) {
          drawScene(painter, x0, x1, y0, y1, t, null);
          if (lensOn) {
            const D = Math.round(LENS * S);
            if (lens.width !== D) { lens.width = D; lens.height = D; }
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.globalCompositeOperation = 'source-over';
            lctx.clearRect(0, 0, D, D);
            lctx.setTransform(S, 0, 0, S, Math.round(D / 2 - lensX * S), Math.round(D / 2 - lensY * S));
            lctx.imageSmoothingEnabled = false;
            drawScene(lensPainter, lensX - LENS / 2, lensX + LENS / 2, lensY - LENS / 2, lensY + LENS / 2, t, lensStop);
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.globalCompositeOperation = 'destination-in';
            lctx.drawImage(lensMask(g.lensK), 0, 0, D, D);
            lctx.globalCompositeOperation = 'source-over';
            const [sx, sy] = toScreen(lensX, lensY);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(lens, Math.round(sx - D / 2), Math.round(sy - D / 2));
          }
        } else {
          drawMap(painter, x0, x1);
          if (lod === 'regional') drawRegions(painter, regionStep || 1, x0, y0, x1, y1);
        }
      }

      // --- overlay: world effects, markers, text, screen-space weather & night ---
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, DW, DH);
      if (local && fxc) {
        octx.setTransform(S, 0, 0, S, tx0, ty0);
        octx.imageSmoothingEnabled = false;
        fx.drawWorldBelow(octx, fxc);
        fx.drawWorldAbove(octx, fxc);

        const mark = g.target;
        if (mark) {
          const s = bank.get(mark.t, mark.v, g.picked.has(mark.id));
          const my = mark.y - mark.l * LIFT;
          const top = my - Math.min(s.ay, 30) - 6 + Math.sin(t * 5) * 1.5;
          octx.fillStyle = '#fff';
          octx.beginPath(); octx.moveTo(mark.x - 3, top - 4); octx.lineTo(mark.x + 3, top - 4); octx.lineTo(mark.x, top); octx.fill();
          octx.strokeStyle = 'rgba(255,255,255,0.7)'; octx.lineWidth = 1 / Z;
          octx.beginPath(); octx.ellipse(mark.x, my, 6, 2.5, 0, 0, Math.PI * 2); octx.stroke();
        }

        // floating pickup texts
        octx.font = '600 6px ui-sans-serif, system-ui'; octx.textAlign = 'center';
        for (let i = g.floaters.length - 1; i >= 0; i--) {
          const fl = g.floaters[i];
          fl.t += dt;
          if (fl.t > 1.4) { g.floaters.splice(i, 1); continue; }
          octx.globalAlpha = 1 - fl.t / 1.4;
          octx.fillStyle = '#000'; octx.fillText(fl.text, fl.x + 0.5, fl.y - fl.t * 14 + 0.5);
          octx.fillStyle = '#fff6c8'; octx.fillText(fl.text, fl.x, fl.y - fl.t * 14);
          octx.globalAlpha = 1;
        }

        octx.setTransform(1, 0, 0, 1, 0, 0);
        if (lensOn) {
          // soft rim of the vision window
          const [sx, sy] = toScreen(lensX, lensY);
          octx.strokeStyle = `rgba(255,255,255,${0.18 * g.lensK})`;
          octx.lineWidth = Math.max(1, S / 2);
          octx.beginPath(); octx.ellipse(sx, sy, (LENS / 2 - 3) * g.lensK * S, (LENS / 2 - 3) * g.lensK * S / 1.12, 0, 0, Math.PI * 2); octx.stroke();
        }
        if (sun > -0.2 && sun < 0.25) { octx.fillStyle = `rgba(255,120,40,${(1 - Math.abs(sun - 0.02) / 0.23) * 0.12})`; octx.fillRect(0, 0, DW, DH); }
        fx.drawScreen(octx, DW, DH, S, fxc, toScreen);
      } else if (g.ready && !cine) {
        // zoomed-out views: a clear "you are here" marker (drawn at every horizontal wrap of the planet)
        const [px, py] = toScreen(g.x, g.y - g.lift);
        for (let k = -1; k <= 1; k++) {
          const sx = px + k * WORLD_PX * S;
          if (sx > -40 && sx < DW + 40) drawPlayerMarker(sx, py, t, dpr, lod === 'world', spectator);
        }
        if (lod === 'world') {
          // latitude / longitude graticule
          octx.strokeStyle = 'rgba(255,255,255,0.08)'; octx.lineWidth = 1;
          const worldH = WORLD_PX * (session.height / session.width);
          octx.beginPath();
          for (let i = 1; i < 6; i++) { const [, yy] = toScreen(0, (worldH * i) / 6); octx.moveTo(0, Math.round(yy) + 0.5); octx.lineTo(DW, Math.round(yy) + 0.5); }
          for (let k = Math.floor(x0 / WORLD_PX); k <= Math.floor(x1 / WORLD_PX); k++) for (let i = 0; i < 12; i++) {
            const [xx] = toScreen(k * WORLD_PX + (WORLD_PX * i) / 12, 0);
            octx.moveTo(Math.round(xx) + 0.5, toScreen(0, 0)[1]); octx.lineTo(Math.round(xx) + 0.5, toScreen(0, worldH)[1]);
          }
          octx.stroke();
        }
      }

      if (cineFade > 0.002) {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.fillStyle = `rgba(0,0,0,${Math.min(1, cineFade)})`;
        octx.fillRect(0, 0, DW, DH);
      }

      // minimap
      const mini = miniRef.current;
      if (mini && g.ready && local) {
        const mc = mini.getContext('2d')!;
        const MW = mini.width;
        mc.fillStyle = '#05070c'; mc.fillRect(0, 0, MW, MW);
        mc.imageSmoothingEnabled = false;
        const scale = 1 / 16 * (MW / 160) * 2;
        const ox = MW / 2 - g.x * scale, oy = MW / 2 - g.y * scale;
        g.chunks.forEach(c => mc.drawImage(c.mini, ox + c.data.cx * CHUNK_PX * scale, oy + c.data.cy * CHUNK_PX * scale, CHUNK_PX * scale, CHUNK_PX * scale));
        mc.fillStyle = '#fff'; mc.fillRect(MW / 2 - 2, MW / 2 - 2, 4, 4);
        mc.fillStyle = '#ff5a3a'; mc.fillRect(MW / 2 - 1, MW / 2 - 1, 2, 2);
      }

      // HUD text (throttled)
      hudT += dt;
      if (hudT > 0.25 && g.ready) {
        hudT = 0;
        const info = tileInfo(g.x, g.y);
        const hours = Math.floor(day * 24), mins = Math.floor((day * 24 - hours) * 60);
        const txTiles = g.x / TILE, tyTiles = g.y / TILE;
        if (info) setHud({
          biome: info.biome !== 255 ? BIOME_PT[info.biome] ?? '' : '',
          ground: GROUND_INFO[info.g].name,
          temp: Math.round(-30 + info.temp * 90 - info.temp * info.temp * 30),
          lat: (0.5 - tyTiles / worldTilesY) * 180,
          lon: ((((txTiles / WORLD_TILES_X) % 1) + 1) % 1) * 360 - 180,
          clock: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
          rock: ROCK_NAMES[info.rock as RockType] ?? '',
          alt: info.level * 40,
          weather: fx.weather,
        });
        const f = local ? g.hover ?? g.target : null;
        if (f) {
          const h = harvestFor(f);
          const inRange = Math.hypot(f.x - g.x, f.y - g.y) <= REACH + 14 && f.l === g.level;
          setPrompt({
            text: featureName(f),
            action: h.kind === 'take' || (h.kind === 'pick' && !g.picked.has(f.id)) ? (inRange ? 'E · Coletar' : f.l !== g.level ? 'Em outro nível do terreno' : 'Aproxime-se para coletar')
              : h.kind === 'pick' ? 'Já colhido' : h.kind === 'tool' ? `Requer ${h.tool}` : null,
          });
        } else setPrompt(null);
      }

      const cpuMs = performance.now() - cpu0;
      cpuAcc += cpuMs;
      frameMeter.add(cpuMs, now);
      fpsFrames++;
      if (now - fpsT >= 500) {
        const pool = poolRef.current;
        setPerf({ fps: Math.round((fpsFrames * 1000) / (now - fpsT)), cpu: cpuAcc / fpsFrames, chunkMs: pool?.avgMs ?? 0, workers: pool?.size ?? 1, chunks: G.current.chunks.size, draws: gl?.drawCalls ?? 0, gpu: !!gl });
        fpsFrames = 0; fpsT = now; cpuAcc = 0;
      }
      // requestAnimationFrame runs at the display's native refresh rate (60/120/144/240 Hz...) - no extra cap
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      aliveRef.current = false;
      // GPU resources die with this renderer: drop chunks so a remount re-uploads them
      G.current.chunks.clear();
      G.current.pending.clear();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, player, fx, fauna, store, playerCreature]);

  // ---------------------------------------------------------------------------
  // Touch joystick
  // ---------------------------------------------------------------------------
  const joyRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [joyVis, setJoyVis] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);

  const itemIcon = (it: ItemDef) => <ItemIcon def={it} bank={bank} />;

  const ui = cine ? (
    <div className="fixed inset-0 z-[300] bg-black select-none pointer-events-none" style={{ visibility: standby ? 'hidden' : 'visible' }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" />
      {loading && <div className="absolute inset-0 bg-black" />}
    </div>
  ) : (
    <div className="fixed inset-0 z-[300] bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ imageRendering: 'pixelated', cursor: spectator ? (dragRef.current ? 'grabbing' : 'grab') : 'crosshair' }}
        onPointerMove={e => {
          if (e.pointerType === 'mouse') G.current.mouse = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
          const d = dragRef.current;
          if (d && d.id === e.pointerId) {
            // drag the terrain under the cursor: one screen pixel = 1/zoom world pixels
            const g = G.current;
            g.x -= (e.clientX - d.x) / g.zoomView; g.y -= (e.clientY - d.y) / g.zoomView;
            d.x = e.clientX; d.y = e.clientY;
          }
        }}
        onPointerLeave={() => { G.current.mouse = { x: -1, y: -1 }; }}
        onPointerDown={e => {
          if (spectator) {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            return;
          }
          if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.5) {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            joyRef.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
            setJoyVis({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
            return;
          }
          const w = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
          interact(featureUnder(w.x, w.y) ?? G.current.target);
        }}
        onPointerUp={e => { if (dragRef.current?.id === e.pointerId) dragRef.current = null; if (joyRef.current?.id === e.pointerId) { joyRef.current = null; G.current.joy = { x: 0, y: 0 }; setJoyVis(null); } }}
        onPointerCancel={() => { dragRef.current = null; joyRef.current = null; G.current.joy = { x: 0, y: 0 }; setJoyVis(null); }}
        onPointerMoveCapture={e => {
          const j = joyRef.current;
          if (!j || j.id !== e.pointerId) return;
          const dx = e.clientX - j.ox, dy = e.clientY - j.oy;
          const len = Math.hypot(dx, dy), max = 50;
          G.current.joy = { x: dx / Math.max(max, len), y: dy / Math.max(max, len) };
          setJoyVis({ ox: j.ox, oy: j.oy, x: j.ox + dx * Math.min(1, max / (len || 1)), y: j.oy + dy * Math.min(1, max / (len || 1)) });
        }}
      />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Level of detail + zoom controls */}
      {!loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
          <button onClick={() => zoomStep(-1)} title="Aproximar (roda / +)" className="bg-black/60 border border-white/10 rounded-xl p-2 text-neutral-300 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
          <div className="flex flex-col gap-1 py-1">
            {(['local', 'regional', 'world'] as Lod[]).map(l => (
              <div key={l} title={LOD_NAME[l]} className={`w-2 h-2 rounded-full mx-auto ${lodLabel.lod === l ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]' : 'bg-white/25'}`} />
            ))}
          </div>
          <button onClick={() => zoomStep(1)} title="Afastar (roda / -)" className="bg-black/60 border border-white/10 rounded-xl p-2 text-neutral-300 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
        </div>
      )}
      {!loading && lodLabel.lod !== 'local' && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${spectator ? 'bottom-[70px]' : 'bottom-[76px]'} pointer-events-none bg-black/70 border border-white/15 rounded-lg px-3 py-1.5 text-center`}>
          <div className="text-white font-bold text-sm tracking-wide">{LOD_NAME[lodLabel.lod]}</div>
          <div className="text-[11px] font-mono text-neutral-400">
            {lodLabel.lod === 'regional' ? `1 px ≈ ${(1 / (TILE * lodLabel.zoom)).toFixed(lodLabel.zoom > 1 / 32 ? 1 : 0)} m · a região ao redor` : 'superfície do planeta inteiro'} · roda para voltar
          </div>
        </div>
      )}

      {/* Performance overlay (F3 / P) */}
      {perfOn && !loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none bg-black/65 border border-white/10 rounded-lg px-2.5 py-1 font-mono text-[11px] text-neutral-200 tabular-nums flex gap-3">
          <span className={perf.fps >= 100 ? 'text-emerald-300' : perf.fps >= 55 ? 'text-amber-300' : 'text-red-400'}>{perf.fps} FPS</span>
          <span title="Tempo de CPU por quadro">{perf.cpu.toFixed(2)} ms CPU</span>
          <span title="Quadros por segundo possíveis se o monitor permitisse">~{perf.cpu > 0 ? Math.round(1000 / perf.cpu) : 0} máx</span>
          <span title="Renderizador" className={perf.gpu ? 'text-cyan-300' : 'text-amber-300'}>{perf.gpu ? `WebGL2 · ${perf.draws} draw` : 'Canvas2D'}</span>
          <span title="Workers de terreno em paralelo / tempo médio por chunk" className="hidden sm:inline">{perf.workers}× núcleos · {perf.chunkMs.toFixed(0)} ms/chunk</span>
        </div>
      )}
      {/* Top-left: location */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-white min-w-[200px]">
          <div className="text-[10px] font-mono tracking-[0.2em] text-emerald-300/80 uppercase">{title}</div>
          <div className="font-bold text-sm">{hud.biome || hud.ground}</div>
          <div className="text-[11px] text-neutral-300 font-mono">
            {hud.ground}{hud.rock ? ` · rocha: ${hud.rock}` : ''}
          </div>
          <div className="text-[11px] text-neutral-400 font-mono">
            {hud.temp > 0 ? '+' : ''}{hud.temp}°C · alt. {hud.alt} m · {Math.abs(hud.lat).toFixed(2)}°{hud.lat >= 0 ? 'N' : 'S'} {Math.abs(hud.lon).toFixed(2)}°{hud.lon >= 0 ? 'L' : 'O'}
          </div>
          {fauna.species.length > 0 && <div className="text-[11px] text-emerald-300/80 font-mono">fauna: {fauna.species.length} espécies · {fauna.count} animais por perto</div>}
        </div>
      </div>

      {/* Top-right: clock, minimap, exit */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-sm tabular-nums" title="Hora e clima">{({ clear: '☀️', cloudy: '☁️', rain: '🌧️', snow: '❄️', storm: '⛈️' } as Record<string, string>)[hud.weather] ?? ''} {hud.clock}</div>
          <button onClick={() => setMiniOn(o => !o)} title="Minimapa (M)" className="bg-black/60 border border-white/10 rounded-xl p-2 text-neutral-300 hover:text-white"><MapIcon className="w-4 h-4" /></button>
          <button onClick={onExit} title="Voltar à órbita (Esc)" className="bg-black/60 border border-white/10 rounded-xl p-2 text-neutral-300 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <canvas ref={miniRef} width={160} height={160} className={`rounded-xl border border-white/15 shadow-2xl w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] ${miniOn ? '' : 'hidden'}`} style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* Prompt */}
      {prompt && !loading && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[92px] pointer-events-none bg-black/70 border border-white/15 rounded-lg px-3 py-1.5 text-center">
          <div className="text-white font-bold text-sm">{prompt.text}</div>
          {prompt.action && <div className={`text-[11px] font-mono ${prompt.action.startsWith('Requer') ? 'text-amber-300' : 'text-emerald-300'}`}>{prompt.action}</div>}
        </div>
      )}
      {toast && <div className="absolute left-1/2 -translate-x-1/2 top-20 bg-black/80 border border-amber-300/30 text-amber-200 text-sm rounded-lg px-3 py-1.5 pointer-events-none">{toast}</div>}

      {spectator && !loading && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 pointer-events-none bg-black/65 backdrop-blur-md border border-sky-300/25 rounded-xl px-3 py-2 text-center">
          <div className="text-sky-200 font-bold text-xs tracking-[0.25em]">MODO ESPECTADOR</div>
          <div className="text-[11px] font-mono text-neutral-300">WASD / setas ou arrastar · Shift acelera · roda: zoom (mais afastado = mais rápido)</div>
        </div>
      )}

      {/* Hotbar */}
      {!spectator && <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-1.5 max-w-[calc(100%-16px)] overflow-x-auto no-scrollbar">
        {Array.from({ length: 9 }).map((_, i) => {
          const id = order[i];
          const it = id ? ITEMS[id] : undefined;
          return (
            <div key={i} title={it ? `${it.name} — ${it.desc}` : ''} className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
              {it && itemIcon(it)}
              {it && <span className="absolute bottom-0 right-1 text-[11px] font-bold text-white drop-shadow-[0_1px_0_#000]">{inventory[id]}</span>}
            </div>
          );
        })}
        <button onClick={() => setBagOpen(o => !o)} title="Mochila (I)" className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-amber-500/20 border border-amber-300/30 text-amber-200 flex items-center justify-center shrink-0"><Backpack className="w-5 h-5" /></button>
      </div>}

      {/* Mobile action button */}
      {!spectator && <button
        className="sm:hidden absolute right-4 bottom-24 w-16 h-16 rounded-full bg-emerald-500/80 border-2 border-white/40 text-black flex items-center justify-center shadow-2xl active:scale-95"
        onPointerDown={e => { e.stopPropagation(); interact(G.current.target); }}
      ><Hand className="w-7 h-7" /></button>}
      {joyVis && (
        <div className="absolute pointer-events-none" style={{ left: joyVis.ox - 50, top: joyVis.oy - 50 }}>
          <div className="w-[100px] h-[100px] rounded-full border-2 border-white/30 bg-white/5" />
          <div className="absolute w-10 h-10 rounded-full bg-white/40" style={{ left: joyVis.x - joyVis.ox + 30, top: joyVis.y - joyVis.oy + 30 }} />
        </div>
      )}

      {/* Bag */}
      {bagOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4" onClick={() => setBagOpen(false)}>
          <div className="bg-[#14100c]/95 border-2 border-[#5a4430] rounded-2xl p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-amber-100 font-black tracking-wide flex items-center gap-2"><Backpack className="w-5 h-5" /> Mochila</h2>
              <button onClick={() => setBagOpen(false)} className="text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {order.length === 0 && <p className="text-neutral-400 text-sm">Vazia. Colete gravetos, pedras soltas, pederneira, frutas e fibras pelo terreno.</p>}
            <div className="space-y-1.5">
              {order.map(id => {
                const it = ITEMS[id];
                if (!it) return null;
                return (
                  <div key={id} className="flex items-center gap-3 bg-white/[0.04] border border-white/5 rounded-lg p-2">
                    <div className="w-10 h-10 rounded-md bg-black/40 flex items-center justify-center shrink-0">{itemIcon(it)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-amber-50">{it.name} <span className="text-[10px] font-mono text-amber-300/70 ml-1">{it.cat}</span></div>
                      <div className="text-[11px] text-neutral-400 leading-snug">{it.desc}</div>
                    </div>
                    <div className="text-lg font-black text-white tabular-nums">{inventory[id]}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-neutral-500">WASD/setas: andar · E/Espaço/clique: coletar · Roda ou +/-: zoom (local → regional → mapa-múndi) · I: mochila · M: minimapa · P/F3: desempenho · Esc: sair</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 bg-[#03050b] flex flex-col items-center justify-center text-center p-6">
          <div className="relative w-16 h-16 mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
          </div>
          <div className="text-emerald-300 font-mono text-sm">{loading}</div>
          <div className="text-neutral-500 text-xs mt-2">{title}</div>
        </div>
      )}
    </div>
  );
  return createPortal(ui, document.body);
}

function ItemIcon({ def, bank }: { def: ItemDef; bank: SpriteBank }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const src = 'custom' in def.icon ? bank.icon(def.icon.custom) : bank.get(def.icon.t, def.icon.v, def.icon.state === 'empty').c;
    const k = Math.max(1, Math.floor(Math.min(32 / src.width, 32 / src.height)));
    const w = src.width * k, h = src.height * k;
    if (w > 32 || h > 32) { const s = Math.min(32 / src.width, 32 / src.height); ctx.drawImage(src, (32 - src.width * s) / 2, (32 - src.height * s) / 2, src.width * s, src.height * s); }
    else ctx.drawImage(src, Math.round((32 - w) / 2), Math.round((32 - h) / 2), w, h);
  }, [def, bank]);
  return <canvas ref={ref} width={32} height={32} className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />;
}
