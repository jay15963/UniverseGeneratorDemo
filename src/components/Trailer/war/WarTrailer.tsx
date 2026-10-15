// Trailer II: "from a single cell to a world at war - and to the stars", locked to "WAR" by @Makai-symphony.
// Same machinery as the first film (the music is the clock, hard cuts on the grid, all text drawn on the film's own
// canvas, recordable), with new subjects: the microscopic pool, the deep sea, the lineage, one city of the same
// culture through all eight eras, the nations spreading on the strategic map, and the battles of every age fought
// by the game's battle engine on the planet itself; then the colony ship and the stars.
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SurvivalView } from '../../Survival/SurvivalView';
import { Soundtrack } from '../Trailer';
import { drawCards, drawEndCard, drawNowPlaying, FilmRecorder } from '../overlay';
import { warmFog } from '../cosmos';
import { Stage } from '../../../lib/creature/genome';
import type { GameLayer, GameFrame, GameDraw } from '../../../lib/game/layer';
import type { PlanetSession } from '../../../lib/planet-generator/planetClient';
import { LayerHost } from '../../Play/campaign/LayerHost';
import { WarStage } from './stage';
import { WarCine, type GShot } from './director';
import { frontOf, groupOf, actionOf, sideOf } from './battles';
import { SwimLayer } from './swim';
import { GlobeScene, CellScene, LineageScene, SoldiersScene, MachinesScene, LaunchScene, CosmosScene, drawFlash } from './scenes';
import { S, CITY_SLOTS, FILL, LAST_HITS, INTRO, STOP, FINAL, END, BEAT, beat, WAR_TRACK, WAR_MUSIC, CREDIT } from './timeline';

/** the soundtrack served with the site, when present (it is not in the repository: see CLAUDE.md) */
export const WAR_SOUNDTRACK = `${import.meta.env.BASE_URL}trailer/war.mp3`;

const CARDS = [
  { text: 'One species.', at: -INTRO + 0.6, weight: 300, dy: -1.25 },
  { text: 'One world.', at: -INTRO + 2.1, weight: 300, dy: 0 },
  { text: 'Every age of war.', at: -INTRO + 3.6, weight: 600, dy: 1.25 },
];
const FILL_STAGES = [Stage.AQUA_LARVA, Stage.AQUA, Stage.AQUA_GIANT, Stage.AQUA_LEVIATHAN, Stage.AMPHIBIAN, Stage.LAND];
const RECAP = [Stage.CELL, Stage.AQUA, Stage.AMPHIBIAN, Stage.LAND, Stage.TRIBAL, Stage.MEDIEVAL, Stage.INDUSTRIAL, Stage.SPACE];
/** hours of the day of the city of each era (golden light for the old ones, noon for the new) */
const CITY_HOUR: [number, number][] = [[7.2, 7.5], [8.5, 8.8], [9.5, 9.8], [11, 11.3], [12, 12.3], [13, 13.3], [15, 15.3], [16, 16.3]];

/** nothing on the planet (between battles) */
const NONE: GameLayer = { attach() { /* */ }, update() { /* */ }, collect: (): GameDraw[] => [], overlay(_o: CanvasRenderingContext2D, _f: GameFrame) { /* */ } };

interface Mount { session: PlanetSession; cine: WarCine; host: LayerHost; x: number; y: number }

export function WarTrailer({ onExit, seek = -INTRO, step = 0, record }: { onExit: () => void; seek?: number; step?: number; record?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const prepRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<Mount | null>(null);
  const [standby, setStandby] = useState(true);
  const [chrome, setChrome] = useState(false);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    let id = 0;
    const move = () => { setChrome(true); clearTimeout(id); id = window.setTimeout(() => setChrome(false), 1500); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') exitRef.current(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key);
    return () => { clearTimeout(id); window.removeEventListener('pointermove', move); window.removeEventListener('keydown', key); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let alive = true, raf = 0;
    const music = new Soundtrack(ytRef.current!, seek, record, WAR_MUSIC, WAR_SOUNDTRACK);
    const recorder = record ? new FilmRecorder(record, INTRO, 'claude-cooked-trailer-2') : null;
    let curT = seek;
    const clock = () => curT;

    // --- built before the title cards ---
    const stage = new WarStage();
    const globe = new GlobeScene();
    const cosmos = new CosmosScene();
    let cells: CellScene | null = null;
    const lineage = new LineageScene(stage);
    const soldiers = new SoldiersScene(stage);
    const machines = new MachinesScene(stage);
    const launch = new LaunchScene(stage);
    let shots: GShot[] = [];
    const swimmers: SwimLayer[] = [];
    let cine: WarCine | null = null;
    const host = new LayerHost(NONE);
    let prepared = false, prepStatus = 'PREPARANDO…';
    lineage.preload([...FILL_STAGES, ...RECAP, Stage.TRIBAL]);
    soldiers.preload();
    stage.prepare(s => { prepStatus = `PREPARANDO · ${s}`; }).then(() => {
      if (!alive) return;
      shots = buildShots(stage, swimmers, clock);
      cine = new WarCine(shots, clock);
      machines.preload(); launch.preload();
      const first = shots.find(s => isFinite(s.x))!;
      const S0 = stage.S;
      setMount({ session: stage.session!, cine, host, x: Math.floor(first.x / S0), y: Math.floor(first.y / S0) });
      prepared = true;
    }).catch(e => { console.error('trailer II', e); prepStatus = 'FALHOU AO PREPARAR'; });

    // --- the clock and the frame ---
    let started = false, t0 = 0, prepT0 = -1, frames = 0, lastT = 0, sbSig = true;
    const ground = (t: number) => shots.some(s => t >= s.at && t < s.end);
    const groundSoon = (t: number) => shots.some(s => t >= s.at - 0.35 && t < s.end);
    const flashAt = (t: number, at: number, d = 0.35) => (t >= at && t < at + d ? 1 - (t - at) / d : 0);

    const frame = (nowMs: number) => {
      if (!alive) return;
      if (!started) {
        if (prepT0 < 0) prepT0 = nowMs;
        const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
        if (canvas.width !== w0 || canvas.height !== h0) { canvas.width = w0; canvas.height = h0; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w0, h0);
        const t1 = performance.now();
        while (performance.now() - t1 < 10 && !cosmos.warm(4));
        warmFog();
        if (!cells) cells = new CellScene();
        stage.api = host.api;
        // the cities' buildings are rendered before the film rolls (their shots are a second long)
        const built = !!cine && cine.warmLeft === 0 && swimmers.every(l => l.ready);
        if (prepared && !built && cine && isFinite(cine.warmLeft)) prepStatus = `PREPARANDO · AS CONSTRUÇÕES… ${cine.warmLeft}`;
        const ok = (prepared && built && globe.ready && (!recorder || recorder.ready)) || nowMs - prepT0 > 150000;
        if (prepRef.current) { prepRef.current.style.opacity = String(Math.min(1, (nowMs - prepT0) / 800) * 0.6); prepRef.current.textContent = record ? 'PREPARANDO A GRAVAÇÃO…' : prepStatus; }
        if (!ok) { raf = requestAnimationFrame(frame); return; }
        if (prepRef.current) prepRef.current.style.opacity = '0';
        started = true; t0 = nowMs;
        if (recorder) { recorder.start(canvas, () => music.audioTrack()); if (recRef.current) recRef.current.style.opacity = '1'; }
      }
      const pre = step ? seek + frames++ * step : seek + (nowMs - t0) / 1000;
      if (pre >= 0 && !music.started && !step) music.start(pre);
      const t = pre < 0 || step ? pre : music.now();
      curT = t;
      const dt = Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
      if (import.meta.env.DEV) (window as unknown as { __trailerT: number; __war: WarStage }).__trailerT = t;
      if (import.meta.env.DEV) (window as unknown as { __war: WarStage }).__war = stage;
      stage.api = host.api;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // --- the planet: the right game layer, the battles run with the music, the map's turns ---
      const live = cine?.current(t).shot ?? null;
      host.set(live?.layer ?? NONE);
      for (const b of stage.battles) {
        if (t < b.spec.start || t > b.spec.end + 0.5) continue;
        b.spec.events?.forEach((e, i) => { if (t >= e.at && !b.done.has(i)) { b.done.add(i); e.run(b.sim); } });
        b.layer.advanceTo(t - b.spec.start, live?.layer === b.layer ? 40 : 6);
      }
      if (t >= S.map && t < S.dawn) stage.showTurn(1 + Math.floor((t - S.map) / BEAT) * 2);
      const sb = !groundSoon(t);
      if (sb !== sbSig) { sbSig = sb; setStandby(sb); }

      // --- the drawn scenes ---
      if (t < 0 || t >= STOP) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        if (t < 0) drawCards(ctx, w, h, t, CARDS);
        if (t >= FINAL) drawEndCard(ctx, w, h, t, FINAL, CREDIT, 1.05);
        if (t >= END) {
          alive = false;
          music.stop();
          if (recorder) recorder.finish().then(() => exitRef.current()); else exitRef.current();
          return;
        }
      } else if (ground(t)) {
        // filmed on the planet (the view is under this canvas): a light vignette
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else if (t < S.cells) {
        globe.draw(ctx, w, h, dpr, t, dt, 0, S.cells);
      } else if (t < S.reef) {
        cells?.draw(ctx, w, h, t, S.cells, S.reef);
      } else if (t >= S.fill && t < S.coast) {
        let i = 0;
        while (i + 1 < FILL.length && t >= FILL[i + 1]) i++;
        lineage.draw(ctx, w, h, t, FILL_STAGES[i], 190 + i * 15, flashAt(t, FILL[i], 0.22) * 0.8);
      } else if (t >= S.rise && t < S.city0) {
        const up = t >= beat(38);
        lineage.draw(ctx, w, h, t, up ? Stage.TRIBAL : Stage.LAND, 30, up ? flashAt(t, beat(38), 0.3) : 0);
      } else if (t >= S.soldiers && t < S.trenchDawn) {
        const k = (t - S.soldiers) / (2 * BEAT), i = Math.min(7, Math.floor(k));
        soldiers.draw(ctx, w, h, t, i, k - i);
      } else if (t >= S.machines && t < S.future) {
        const k = (t - S.machines) / BEAT, i = Math.min(7, Math.floor(k));
        machines.draw(ctx, w, h, t, i, k - i);
      } else if (t >= S.recap && t < S.launch) {
        const i = Math.min(7, Math.floor((t - S.recap) / BEAT));
        lineage.draw(ctx, w, h, t, RECAP[i], 200 + i * 20, flashAt(t, S.recap + i * BEAT, 0.18) * 0.5);
      } else if (t >= S.launch && t < S.warp) {
        launch.draw(ctx, w, h, dpr, t, dt, (t - S.launch) / (S.warp - S.launch));
      } else if (t >= S.warp && t < S.universe) {
        cosmos.warp(ctx, w, h, t, (t - S.warp) / (S.universe - S.warp));
      } else if (t >= S.universe && t < S.flashes) {
        cosmos.out(ctx, w, h, t, (t - S.universe) / (S.flashes - S.universe));
      } else if (t >= S.flashes) {
        let i = 0;
        while (i + 1 < LAST_HITS.length && t >= LAST_HITS[i + 1]) i++;
        drawFlash(ctx, w, h, t, LAST_HITS[i], i, soldiers, machines);
      } else {
        // a ground shot that is not ready on a slow machine: black rather than an empty planet
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      }

      // --- over everything: flashes on the big cuts, the letterbox, the credit badge ---
      const fl = Math.max(flashAt(t, S.reef, 0.4), flashAt(t, S.warp, 0.5), flashAt(t, S.barrage, 0.25) * 0.5, flashAt(t, S.combined, 0.25) * 0.5);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, w, h); }
      if (t >= 0 && t < STOP) {
        const bh = Math.round(h * 0.07);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
        drawNowPlaying(ctx, w, h, t, Math.min(1, t / 0.8), WAR_TRACK);
      }
      if (recorder && t >= -INTRO) recorder.frame(canvas, t);
      raf = requestAnimationFrame(frame);
    };
    const id = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, 60);
    return () => {
      alive = false;
      clearTimeout(id);
      cancelAnimationFrame(raf);
      music.dispose();
      recorder?.cancel();
      stage.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {mount && <SurvivalView session={mount.session} mapX={mount.x} mapY={mount.y} title="" onExit={onExit} cinematic={mount.cine} standby={standby} aquatic game={mount.host} />}
      <div ref={ytRef} className="fixed left-0 bottom-0 z-[1] pointer-events-none" style={{ width: 200, height: 200, opacity: 0 }} />
      <div className="fixed inset-0 z-[400] select-none pointer-events-none" style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div ref={prepRef} className="absolute left-0 right-0 bottom-8 text-center text-white text-xs tracking-[0.3em]" style={{ opacity: 0 }}>PREPARANDO…</div>
        {record && (
          <div ref={recRef} className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 text-[11px] text-white/85 font-mono transition-opacity" style={{ opacity: 0 }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> GRAVANDO · mantenha esta aba aberta e visível
          </div>
        )}
        <button onClick={onExit} title="Sair (Esc)"
          className={`pointer-events-auto absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white/80 hover:text-white transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0'}`}>
          <X className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}

/** every shot filmed on the planet, placed on the stage's cities, battles and spots (`swimmers` gets the sea layers,
 *  which move on the film's `clock`) */
function buildShots(stage: WarStage, swimmers: SwimLayer[], clock: () => number): GShot[] {
  const out: GShot[] = [];
  const add = (s: Omit<GShot, 'x' | 'y'> & { x?: number; y?: number; p?: { x: number; y: number } }) => {
    const p = s.p ?? { x: s.x ?? NaN, y: s.y ?? NaN };
    out.push({ ...s, x: p.x, y: p.y });
  };
  const sp = stage.spots;
  // the lineage's sea creatures swim through the underwater shots (around the place the stage found)
  const reefSwim = new SwimLayer(stage, () => sp.reef, [{ stage: Stage.AQUA_LARVA, n: 14, k: 0.3, speed: 70, spread: 260, lift: 14 }, { stage: Stage.AQUA, n: 6, k: 0.42, speed: 55, spread: 320, lift: 22 }], clock, (S.reef + S.abyss) / 2);
  const abyssSwim = new SwimLayer(stage, () => sp.abyss, [{ stage: Stage.AQUA_LEVIATHAN, n: 1, k: 0.9, speed: 45, spread: 120, lift: 40 }, { stage: Stage.AQUA, n: 8, k: 0.4, speed: 60, spread: 420, lift: 26 }], clock, (S.abyss + S.fill) / 2);
  reefSwim.preload(); abyssSwim.preload();
  swimmers.push(reefSwim, abyssSwim);
  add({ at: S.reef, end: S.abyss, p: sp.reef, zoom: [3, 3], sub: true, hour: [11, 11.4], pan: [140, 30], layer: reefSwim });
  add({ at: S.abyss, end: S.fill, p: sp.abyss, zoom: [2, 2], sub: true, hour: [12, 12.2], pan: [-110, 20], layer: abyssSwim });
  add({ at: S.coast, end: S.wild, p: sp.coast, zoom: [2, 2], refine: 'coast', hour: [7.4, 7.9], pan: [150, 10] });
  const avoid = stage.cities.filter(c => c.ok).map(c => ({ x: c.x, y: c.y, r: 3200 }));
  add({ at: S.wild, end: S.rise, p: sp.wild, zoom: [2, 2], refine: 'land', avoid, hour: [17, 18.4], pan: [-120, 30] });
  stage.cities.forEach((c, era) => {
    const [a, b] = CITY_SLOTS[era];
    add({ at: a, end: b, p: c.view, zoom: [2, 2], hour: CITY_HOUR[era], fauna: false, pan: [era % 2 ? -90 : 90, 0] });
  });
  if (stage.campaign) add({ at: S.map, end: S.dawn, p: sp.centre, world: true, zoom: [1, 6.5], hour: [12, 12], fauna: false, layer: stage.campaign.layer });
  const bat = (id: string) => stage.battles.find(b => b.spec.id === id);
  const battle = (id: string, at: number, end: number, zoom: number, hour: [number, number], focus: 'front' | 'action' | string[] | { action: string[] }, o: Partial<GShot> = {}) => {
    const b = bat(id);
    if (!b) return;
    const f = focus === 'front' ? () => frontOf(b.sim)
      : focus === 'action' ? () => actionOf(b.sim) ?? frontOf(b.sim)
      : 'action' in focus ? () => actionOf(b.sim, focus.action) ?? frontOf(b.sim)
      : () => groupOf(b.sim, 0, focus) ?? frontOf(b.sim);
    out.push({ at, end, x: b.cx, y: b.cy, zoom: [zoom, zoom], hour, fauna: false, layer: b.layer, focus: f, shake: 1, ...o });
  };
  battle('tribal', S.dawn, S.clash, 1, [5.7, 6.5], 'front', { shake: 0.3 });
  battle('tribal', S.clash, S.knights, 2, [6.6, 6.9], 'front');
  battle('medieval', S.knights, S.siege, 2, [9.5, 9.8], ['cav']);
  battle('siege', S.siege, S.line, 1, [16, 16.4], ['art']);
  battle('line', S.line, S.cannons, 2, [10, 10.3], 'front', { shake: 0.8 });
  battle('line', S.cannons, S.soldiers, 2, [10.4, 10.6], ['art']);
  battle('trench', S.trenchDawn, S.barrage, 2, [5.3, 5.8], ['gun'], { weather: 'cloudy', shake: 0 });
  battle('trench', S.barrage, S.tanks1, 1, [6, 6.6], 'front', { weather: 'rain' });
  battle('trench', S.tanks1, S.ww2, 2, [6.7, 6.9], ['tank'], { weather: 'rain' });
  battle('ww2', S.ww2, S.combined, 1, [13, 13.4], ['tank']);
  battle('ww2', S.combined, S.strike, 2, [13.5, 13.8], 'action');
  battle('ww2', S.strike, S.helis, 1, [13.9, 14.1], 'front', { focus: () => { const b = bat('ww2'); return b ? sideOf(b.sim, 1) : null; } });
  battle('modern', S.helis, S.machines, 2, [17, 17.5], { action: ['heli'] }, { shake: 0.7 });
  battle('future', S.future, beat(194), 1, [18.6, 18.9], { action: ['tank'] });
  battle('future', beat(194), S.capital, 2, [19, 19.3], 'action');
  const cap = stage.cities[7];
  if (cap) add({ at: S.capital, end: S.recap, p: cap.wide, zoom: [1, 1], hour: [16.5, 18.8], fauna: false, pan: [-260, -60] });
  return out.filter(s => isFinite(s.x) && isFinite(s.y));
}
