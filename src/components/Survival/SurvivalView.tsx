import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Backpack, Map as MapIcon, Hand } from 'lucide-react';
import type { PlanetSession } from '../../lib/planet-generator/planetClient';
import { PlanetType, BiomeType } from '../../lib/planet-generator/generator';
import { ChunkData, Feature, Feat, CHUNK, CHUNK_PX, TILE, GROUND_INFO, Ground, solidRadius, WORLD_TILES_X } from '../../lib/terrain/types';
import { SpriteBank, paintPlayer, Dir, Sprite } from '../../lib/terrain/sprites';
import { ITEMS, harvestFor, featureName, ItemDef } from '../../lib/terrain/items';
import { vegetationHueShift, ROCK_NAMES, RockType } from '../../lib/terrain/palettes';

interface Props {
  session: PlanetSession;
  mapX: number;
  mapY: number;
  title: string;
  onExit: () => void;
}

interface LoadedChunk { data: ChunkData; canvas: HTMLCanvasElement; mini: HTMLCanvasElement; lastUsed: number }

const BIOME_PT: Record<number, string> = {
  [BiomeType.SNOW]: 'Deserto de neve', [BiomeType.TUNDRA]: 'Tundra', [BiomeType.TAIGA]: 'Taiga', [BiomeType.COLD_DESERT]: 'Deserto frio',
  [BiomeType.STEPPE]: 'Estepe', [BiomeType.GRASSLAND]: 'Pradaria', [BiomeType.SEASONAL_FOREST]: 'Floresta temperada',
  [BiomeType.TEMPERATE_RAINFOREST]: 'Floresta úmida temperada', [BiomeType.SAVANNA]: 'Savana', [BiomeType.SUBTROPICAL_DESERT]: 'Deserto',
  [BiomeType.TROPICAL_RAINFOREST]: 'Floresta tropical',
};
const SWAY = new Set<Feat>([Feat.TALL_GRASS, Feat.REEDS, Feat.CATTAIL, Feat.FLAX, Feat.FLOWER, Feat.FERN, Feat.WILD_CROP]);
const DAY_SECONDS = 360;
const REACH = 26;
const SPEED = 74;

export function SurvivalView({ session, mapX, mapY, title, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const cfg = session.config;
  const saveKey = `survival:${cfg.seed}:${cfg.planetType}`;

  const [loading, setLoading] = useState('Descendo pela atmosfera…');
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [miniOn, setMiniOn] = useState(true);
  const [hud, setHud] = useState({ biome: '', ground: '', temp: 0, lat: 0, lon: 0, clock: '08:00', rock: '' });
  const [prompt, setPrompt] = useState<{ text: string; action: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bank = useMemo(() => new SpriteBank(vegetationHueShift(cfg.vegetationHue, cfg.planetType === PlanetType.ALIEN_LIFE)), [cfg]);
  const player = useMemo(() => paintPlayer(), []);

  // Mutable game state (kept out of React to avoid per-frame renders)
  const G = useRef({
    x: 0, y: 0, dir: 'down' as Dir, moving: false, anim: 0,
    keys: new Set<string>(), joy: { x: 0, y: 0 },
    zoom: 3,
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
    const id = setInterval(save, 4000);
    return () => { clearInterval(id); save(); };
  }, [saveKey]);

  // ---------------------------------------------------------------------------
  // Spawn
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    session.spawn(mapX, mapY).then(({ tx, ty }) => {
      if (!alive) return;
      G.current.x = tx * TILE + TILE / 2;
      G.current.y = ty * TILE + TILE / 2;
      G.current.zoom = window.innerWidth < 700 ? 2 : 3;
      setLoading('Gerando terreno…');
    }).catch(e => setLoading('Falha ao pousar: ' + e.message));
    return () => { alive = false; };
  }, [session, mapX, mapY]);

  // ---------------------------------------------------------------------------
  // Chunk streaming
  // ---------------------------------------------------------------------------
  const requestChunks = () => {
    const g = G.current;
    if (!g.x && !g.y) return;
    const pcx = Math.floor(g.x / CHUNK_PX), pcy = Math.floor(g.y / CHUNK_PX);
    const want: [number, number, number][] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) want.push([pcx + dx, pcy + dy, dx * dx + dy * dy]);
    want.sort((a, b) => a[2] - b[2]);
    for (const [cx, cy] of want) {
      const key = `${cx},${cy}`;
      if (g.chunks.has(key) || g.pending.has(key)) continue;
      if (g.pending.size >= 2) break;
      g.pending.add(key);
      session.chunk(cx, cy).then(data => {
        g.pending.delete(key);
        const canvas = document.createElement('canvas');
        canvas.width = CHUNK_PX; canvas.height = CHUNK_PX;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(data.pixels as Uint8ClampedArray<ArrayBuffer>, CHUNK_PX, CHUNK_PX), 0, 0);
        const mini = document.createElement('canvas');
        mini.width = CHUNK; mini.height = CHUNK;
        const mctx = mini.getContext('2d')!;
        mctx.imageSmoothingEnabled = true;
        mctx.drawImage(canvas, 0, 0, CHUNK, CHUNK);
        g.chunks.set(key, { data, canvas, mini, lastUsed: performance.now() });
        // evict far chunks
        if (g.chunks.size > 49) {
          const far = [...g.chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed).slice(0, g.chunks.size - 49);
          for (const [k] of far) g.chunks.delete(k);
        }
        requestChunks();
      }).catch(() => g.pending.delete(key));
    }
  };

  // ---------------------------------------------------------------------------
  // World queries
  // ---------------------------------------------------------------------------
  const chunkAt = (wx: number, wy: number) => G.current.chunks.get(`${Math.floor(wx / CHUNK_PX)},${Math.floor(wy / CHUNK_PX)}`);
  const groundAt = (wx: number, wy: number): Ground | null => {
    const c = chunkAt(wx, wy);
    if (!c) return null;
    const tx = Math.floor(wx / TILE) - c.data.cx * CHUNK, ty = Math.floor(wy / TILE) - c.data.cy * CHUNK;
    return c.data.ground[ty * CHUNK + tx] as Ground;
  };
  const tileInfo = (wx: number, wy: number) => {
    const c = chunkAt(wx, wy);
    if (!c) return null;
    const tx = Math.floor(wx / TILE) - c.data.cx * CHUNK, ty = Math.floor(wy / TILE) - c.data.cy * CHUNK;
    const k = ty * CHUNK + tx;
    return { g: c.data.ground[k] as Ground, biome: c.data.biome[k], rock: c.data.rock[k], temp: c.data.temp[k] };
  };
  const nearbyFeatures = (wx: number, wy: number, fn: (f: Feature) => void) => {
    const pcx = Math.floor(wx / CHUNK_PX), pcy = Math.floor(wy / CHUNK_PX);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = G.current.chunks.get(`${pcx + dx},${pcy + dy}`);
      if (c) for (const f of c.data.features) if (!G.current.taken.has(f.id)) fn(f);
    }
  };
  const blocked = (wx: number, wy: number) => {
    const g = groundAt(wx, wy);
    if (g === null || GROUND_INFO[g].blocking) return true;
    let hit = false;
    nearbyFeatures(wx, wy, f => {
      if (hit) return;
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
    if (!f) return;
    if (Math.hypot(f.x - g.x, f.y - g.y) > REACH + 14) { flash('Muito longe — aproxime-se'); return; }
    const h = harvestFor(f);
    if (h.kind === 'take' || (h.kind === 'pick' && !g.picked.has(f.id))) {
      if (h.kind === 'take') g.taken.add(f.id); else g.picked.set(f.id, g.time);
      addItems(h.items);
      h.items.forEach(([id, n], i) => g.floaters.push({ x: f.x, y: f.y - 14 - i * 9, t: 0, text: `+${n} ${ITEMS[id]?.name ?? id}` }));
    } else if (h.kind === 'pick') flash('Já colhido — os frutos voltam em cerca de um dia');
    else if (h.kind === 'tool') flash(`Requer ${h.tool} (em breve: crafting)`);
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (bagOpen) setBagOpen(false); else onExit(); return; }
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); G.current.keys.add(k); }
      if (k === 'e' || k === ' ') { e.preventDefault(); interact(G.current.target); }
      if (k === 'i' || k === 'tab') { e.preventDefault(); setBagOpen(o => !o); }
      if (k === 'm') setMiniOn(o => !o);
      e.stopImmediatePropagation();
    };
    const up = (e: KeyboardEvent) => { G.current.keys.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagOpen, onExit]);

  useEffect(() => {
    const c = canvasRef.current!;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const g = G.current; g.zoom = Math.max(2, Math.min(6, g.zoom + (e.deltaY < 0 ? 1 : -1))); };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  const screenToWorld = (sx: number, sy: number) => {
    const g = G.current;
    const c = canvasRef.current!;
    return { x: g.x + (sx - c.clientWidth / 2) / g.zoom, y: g.y + (sy - c.clientHeight / 2) / g.zoom };
  };
  const featureUnder = (wx: number, wy: number): Feature | null => {
    let best: Feature | null = null, bd = 1e9;
    nearbyFeatures(wx, wy, f => {
      const s = bank.get(f.t, f.v, G.current.picked.has(f.id));
      const x0 = f.x - s.ax, y0 = f.y - s.ay;
      const small = !s.tall;
      if (wx >= x0 - 2 && wx <= x0 + s.c.width + 2 && wy >= (small ? y0 - 2 : f.y - 14) && wy <= f.y + 4) {
        const d = Math.hypot(f.x - wx, f.y - wy) + (s.tall ? 10 : 0);
        if (d < bd) { bd = d; best = f; }
      }
    });
    return best as Feature | null;
  };

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), hudT = 0;
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      const g = G.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      requestChunks();

      if (!g.ready) {
        const c = chunkAt(g.x, g.y);
        if (c && g.x) { g.ready = true; setLoading(''); }
      }

      // --- movement ---
      if (g.ready) {
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
          const gr = groundAt(g.x, g.y);
          const sp = SPEED * (gr !== null ? GROUND_INFO[gr].speed || 0.4 : 1);
          const nx = g.x + mx * sp * dt, ny = g.y + my * sp * dt;
          if (!blocked(nx, g.y)) g.x = nx;
          if (!blocked(g.x, ny)) g.y = ny;
          g.anim += dt * 8 * (sp / SPEED);
        } else g.anim = 0;
        g.time += dt;
        if (Math.floor(g.time) % 5 === 0) for (const [id, t0] of g.picked) if (g.time - t0 > DAY_SECONDS) g.picked.delete(id);
      }

      // --- interaction target: nearest gatherable in front of the player ---
      // hand-gatherable things always win over things that need a tool
      let target: Feature | null = null, td = REACH, toolT: Feature | null = null, toolD = REACH - 6;
      if (g.ready) nearbyFeatures(g.x, g.y, f => {
        const h = harvestFor(f);
        if (h.kind === 'none' || (h.kind === 'pick' && g.picked.has(f.id))) return;
        const d = Math.hypot(f.x - g.x, f.y - g.y);
        if (h.kind === 'tool') { if (d < toolD) { toolD = d; toolT = f; } }
        else if (d < td) { td = d; target = f; }
      });
      g.target = (target ?? toolT) as Feature | null;
      if (g.mouse.x >= 0) { const w = screenToWorld(g.mouse.x, g.mouse.y); g.hover = featureUnder(w.x, w.y); } else g.hover = null;

      // --- render ---
      const Z = g.zoom, S = Z * dpr;
      const camX = Math.round(g.x * S) / S, camY = Math.round(g.y * S) / S;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(S, 0, 0, S, Math.round(canvas.width / 2 - camX * S), Math.round(canvas.height / 2 - camY * S));
      ctx.imageSmoothingEnabled = false;
      const vw = W / Z / 2 + 48, vh = H / Z / 2 + 64;
      const x0 = camX - vw, x1 = camX + vw, y0 = camY - vh, y1 = camY + vh;
      const t = now / 1000;

      // ground
      for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor(y1 / CHUNK_PX); cy++) {
        for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
          const c = g.chunks.get(`${cx},${cy}`);
          if (c) { ctx.drawImage(c.canvas, cx * CHUNK_PX, cy * CHUNK_PX); c.lastUsed = now; }
        }
      }
      // water glints
      ctx.fillStyle = 'rgba(220,240,255,0.55)';
      for (let ty = Math.floor(y0 / TILE); ty <= y1 / TILE; ty++) for (let tx = Math.floor(x0 / TILE); tx <= x1 / TILE; tx++) {
        const gr = groundAt(tx * TILE, ty * TILE);
        if (gr === null || gr > Ground.SWAMP_WATER) continue;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const ph = Math.sin(t * 1.6 + (h % 628) / 100);
        if (ph > 0.75) ctx.fillRect(tx * TILE + (h % 11) + Math.round(ph * 2), ty * TILE + ((h >> 4) % 13), 3, 1);
      }

      // collect visible features + player, y-sorted
      type Item = { y: number; f?: Feature; s?: Sprite };
      const list: Item[] = [];
      for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor(y1 / CHUNK_PX); cy++) {
        for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
          const c = g.chunks.get(`${cx},${cy}`);
          if (!c) continue;
          for (const f of c.data.features) {
            if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1 + 40) continue;
            if (g.taken.has(f.id)) continue;
            list.push({ y: f.t === Feat.LILY_PAD ? f.y - 1000 : f.y, f, s: bank.get(f.t, f.v, g.picked.has(f.id)) });
          }
        }
      }
      if (g.ready) list.push({ y: g.y });
      list.sort((a, b) => a.y - b.y);

      // shadows
      ctx.fillStyle = 'rgba(8,12,6,0.28)';
      for (const it of list) {
        const sh = it.s ? it.s.shadow : 5;
        if (!sh) continue;
        const x = it.f ? it.f.x : g.x, y = it.f ? it.f.y : g.y;
        ctx.beginPath(); ctx.ellipse(x + sh * 0.25, y, sh, sh * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      }
      // sprites
      const frames = player[g.dir];
      const pf = frames[g.moving ? Math.floor(g.anim) % 4 : 0];
      for (const it of list) {
        if (!it.f) { ctx.drawImage(pf, Math.round(g.x - 8), Math.round(g.y - 22)); continue; }
        const f = it.f, s = it.s!;
        let dx = 0;
        if (SWAY.has(f.t)) dx = Math.sin(t * 1.8 + f.x * 0.045 + f.y * 0.02) > 0.55 ? 1 : 0;
        let alpha = 1;
        if (s.tall && g.ready && g.y < f.y && g.y > f.y - s.ay + 6 && Math.abs(g.x - f.x) < s.c.width / 2 - 2) alpha = 0.42;
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.drawImage(s.c, f.x - s.ax + dx, f.y - s.ay);
        if (alpha < 1) ctx.globalAlpha = 1;
      }

      // target marker
      const mark = g.target;
      if (mark) {
        const s = bank.get(mark.t, mark.v, g.picked.has(mark.id));
        const top = mark.y - Math.min(s.ay, 30) - 6 + Math.sin(t * 5) * 1.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(mark.x - 3, top - 4); ctx.lineTo(mark.x + 3, top - 4); ctx.lineTo(mark.x, top); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1 / Z;
        ctx.beginPath(); ctx.ellipse(mark.x, mark.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
      }

      // floating pickup texts
      ctx.font = '600 6px ui-sans-serif, system-ui'; ctx.textAlign = 'center';
      for (let i = g.floaters.length - 1; i >= 0; i--) {
        const fl = g.floaters[i];
        fl.t += dt;
        if (fl.t > 1.4) { g.floaters.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - fl.t / 1.4;
        ctx.fillStyle = '#000'; ctx.fillText(fl.text, fl.x + 0.5, fl.y - fl.t * 14 + 0.5);
        ctx.fillStyle = '#fff6c8'; ctx.fillText(fl.text, fl.x, fl.y - fl.t * 14);
        ctx.globalAlpha = 1;
      }

      // day / night
      const day = (g.time / DAY_SECONDS) % 1; // 0 = midnight
      const sun = Math.sin((day - 0.25) * Math.PI * 2); // -1 night .. 1 noon
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (sun < 0.25) {
        const k = Math.min(1, (0.25 - sun) / 0.8);
        ctx.fillStyle = `rgba(10,16,48,${k * 0.55})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (sun > -0.2 && sun < 0.25) { ctx.fillStyle = `rgba(255,120,40,${(1 - Math.abs(sun - 0.02) / 0.23) * 0.12})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      }

      // minimap
      const mini = miniRef.current;
      if (mini && g.ready) {
        const mc = mini.getContext('2d')!;
        const MW = mini.width;
        mc.fillStyle = '#05070c'; mc.fillRect(0, 0, MW, MW);
        mc.imageSmoothingEnabled = false;
        const scale = 1 / 16 * (MW / 160) * 2; // minimap px per world px
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
        const worldTilesY = WORLD_TILES_X / 2;
        if (info) setHud({
          biome: info.biome !== 255 ? BIOME_PT[info.biome] ?? '' : '',
          ground: GROUND_INFO[info.g].name,
          temp: Math.round(-30 + info.temp * 90 - info.temp * info.temp * 30),
          lat: (0.5 - tyTiles / worldTilesY) * 180,
          lon: ((txTiles / WORLD_TILES_X) % 1) * 360 - 180,
          clock: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
          rock: ROCK_NAMES[info.rock as RockType] ?? '',
        });
        const f = g.hover ?? g.target;
        if (f) {
          const h = harvestFor(f);
          const inRange = Math.hypot(f.x - g.x, f.y - g.y) <= REACH + 14;
          setPrompt({
            text: featureName(f),
            action: h.kind === 'take' || (h.kind === 'pick' && !g.picked.has(f.id)) ? (inRange ? 'E · Coletar' : 'Aproxime-se para coletar')
              : h.kind === 'pick' ? 'Já colhido' : h.kind === 'tool' ? `Requer ${h.tool}` : null,
          });
        } else setPrompt(null);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, player]);

  // ---------------------------------------------------------------------------
  // Touch joystick
  // ---------------------------------------------------------------------------
  const joyRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [joyVis, setJoyVis] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);

  const itemIcon = (it: ItemDef) => <ItemIcon def={it} bank={bank} />;

  const ui = (
    <div className="fixed inset-0 z-[300] bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ imageRendering: 'pixelated', cursor: 'crosshair' }}
        onPointerMove={e => { if (e.pointerType === 'mouse') G.current.mouse = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }; }}
        onPointerLeave={() => { G.current.mouse = { x: -1, y: -1 }; }}
        onPointerDown={e => {
          if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.5) {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            joyRef.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
            setJoyVis({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
            return;
          }
          const w = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
          interact(featureUnder(w.x, w.y) ?? G.current.target);
        }}
        onPointerUp={e => { if (joyRef.current?.id === e.pointerId) { joyRef.current = null; G.current.joy = { x: 0, y: 0 }; setJoyVis(null); } }}
        onPointerCancel={() => { joyRef.current = null; G.current.joy = { x: 0, y: 0 }; setJoyVis(null); }}
        onPointerMoveCapture={e => {
          const j = joyRef.current;
          if (!j || j.id !== e.pointerId) return;
          const dx = e.clientX - j.ox, dy = e.clientY - j.oy;
          const len = Math.hypot(dx, dy), max = 50;
          G.current.joy = { x: dx / Math.max(max, len), y: dy / Math.max(max, len) };
          setJoyVis({ ox: j.ox, oy: j.oy, x: j.ox + dx * Math.min(1, max / (len || 1)), y: j.oy + dy * Math.min(1, max / (len || 1)) });
        }}
      />

      {/* Top-left: location */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-white min-w-[200px]">
          <div className="text-[10px] font-mono tracking-[0.2em] text-emerald-300/80 uppercase">{title}</div>
          <div className="font-bold text-sm">{hud.biome || hud.ground}</div>
          <div className="text-[11px] text-neutral-300 font-mono">
            {hud.ground}{hud.rock ? ` · rocha: ${hud.rock}` : ''}
          </div>
          <div className="text-[11px] text-neutral-400 font-mono">
            {hud.temp > 0 ? '+' : ''}{hud.temp}°C · {Math.abs(hud.lat).toFixed(2)}°{hud.lat >= 0 ? 'N' : 'S'} {Math.abs(hud.lon).toFixed(2)}°{hud.lon >= 0 ? 'L' : 'O'}
          </div>
        </div>
      </div>

      {/* Top-right: clock, minimap, exit */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-sm tabular-nums">{hud.clock}</div>
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

      {/* Hotbar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-1.5 max-w-[calc(100%-16px)] overflow-x-auto no-scrollbar">
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
      </div>

      {/* Mobile action button */}
      <button
        className="sm:hidden absolute right-4 bottom-24 w-16 h-16 rounded-full bg-emerald-500/80 border-2 border-white/40 text-black flex items-center justify-center shadow-2xl active:scale-95"
        onPointerDown={e => { e.stopPropagation(); interact(G.current.target); }}
      ><Hand className="w-7 h-7" /></button>
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
            <p className="mt-3 text-[10px] text-neutral-500">WASD/setas: andar · E/Espaço/clique: coletar · Roda: zoom · I: mochila · M: minimapa · Esc: sair</p>
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
