// "Assistir demo": a self-running film of the game's worlds. Space shots of each planet, then the camera dives to the
// surface and a director films it in spectator mode - coasts, wildlife, cliffs, time-lapses, weather, and a pull-out
// to the world map. No HUD: only the engine's frame rate (what it could reach with vsync off).
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PlanetConfig } from '../../lib/planet-generator/generator';
import { openPlanetSession, PlanetSession } from '../../lib/planet-generator/planetClient';
import { frameMeter } from '../../lib/render/frameMeter';
import { SurvivalView } from '../Survival/SurvivalView';
import { scout, SurfaceCine, ShotSpec } from './director';
import { SpaceShot } from './spaceShot';
import { WORLDS, STARS, GIANT, RGB } from './worlds';

interface DemoPlanet { config: PlanetConfig; shots: ShotSpec[]; star: RGB }

// The film: every world is shown at its best time of day and weather.
const PLANETS: DemoPlanet[] = [
  {
    config: WORLDS.gaia, star: STARS.gaia,
    shots: [
      { kind: 'coast', dur: 11, hour: [9, 9.6] },
      { kind: 'wild', dur: 12, hour: [7.2, 8], speed: 9, zoom: [3, 3] },
      { kind: 'peaks', dur: 10, hour: [14, 14.5], zoom: [2, 2] },
      { kind: 'coast', dur: 13, hour: [16.6, 21.2] },
      { kind: 'wild', dur: 10, hour: [12, 12.4], weather: 'storm', speed: 14 },
    ],
  },
  {
    config: WORLDS.xeno, star: STARS.xeno,
    shots: [
      { kind: 'wild', dur: 12, hour: [10, 10.5], speed: 10 },
      { kind: 'coast', dur: 11, hour: [13, 13.5], weather: 'rain' },
      { kind: 'coast', dur: 12, hour: [18.2, 22] },
      { kind: 'wild', dur: 8, hour: [11, 11.3], speed: 12 },
      { kind: 'rise', dur: 11, hour: [11.3, 11.6] },
    ],
  },
  {
    config: WORLDS.ocean, star: STARS.ocean,
    shots: [
      { kind: 'coast', dur: 12, hour: [11, 11.5], speed: 22 },
      { kind: 'coast', dur: 10, hour: [15, 15.4], weather: 'rain' },
      { kind: 'coast', dur: 11, hour: [5.2, 7.2], zoom: [3, 3] },
    ],
  },
  {
    config: WORLDS.bayou, star: STARS.bayou,
    shots: [
      { kind: 'wild', dur: 11, hour: [8, 8.6], speed: 10 },
      { kind: 'coast', dur: 11, hour: [19, 22.5] },
    ],
  },
  {
    config: WORLDS.inferno, star: STARS.inferno,
    shots: [
      { kind: 'lava', dur: 11, hour: [12, 12.4], zoom: [2, 2], speed: 18 },
      { kind: 'lava', dur: 12, hour: [19.2, 23], speed: 18 },
      { kind: 'rise', dur: 10, hour: [23, 23.2] },
    ],
  },
  {
    config: WORLDS.boreas, star: STARS.boreas,
    shots: [
      { kind: 'peaks', dur: 11, hour: [10, 10.4], weather: 'snow', zoom: [3, 3] },
      { kind: 'peaks', dur: 10, hour: [16.5, 18.6], zoom: [2, 2] },
      { kind: 'rise', dur: 12, hour: [18.6, 18.8] },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------
// The reel
// ---------------------------------------------------------------------------------------------------
interface Prepared { session: PlanetSession; cine: SurfaceCine }
interface Surface { key: string; session: PlanetSession; cine: SurfaceCine; x: number; y: number }

const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const APPROACH = 7;
const REVEAL = 1.5;

export function DemoReel({ onExit, startAt = -1 }: { onExit: () => void; /** first scene (-1 = the opening flyby) */ startAt?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [chrome, setChrome] = useState(true);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // the close button shows up only while the mouse moves
  useEffect(() => {
    let id = setTimeout(() => setChrome(false), 2500);
    const move = () => { setChrome(true); clearTimeout(id); id = setTimeout(() => setChrome(false), 2000); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') exitRef.current(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key);
    return () => { clearTimeout(id); window.removeEventListener('pointermove', move); window.removeEventListener('keydown', key); };
  }, []);

  // frame-rate readout: engine CPU time per frame, not the monitor's refresh rate
  useEffect(() => {
    const id = setInterval(() => {
      const ms = frameMeter.take();
      if (fpsRef.current) fpsRef.current.textContent = ms > 0 ? String(Math.round(1000 / ms)) : '—';
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let alive = true;
    const jobs: { cancel: () => void }[] = [];
    const sessions = new Set<PlanetSession>();
    const prepared = new Map<number, Promise<Prepared>>();
    const prepare = (i: number) => {
      let p = prepared.get(i);
      if (p) return p;
      const P = PLANETS[i];
      const job = openPlanetSession(P.config);
      jobs.push(job);
      p = job.ready.then(async session => {
        sessions.add(session);
        const spots = await scout(session);
        const cine = new SurfaceCine(P.shots, spots, session.width, P.config.seed);
        return { session, cine };
      });
      p.catch(() => { /* cancelled */ });
      prepared.set(i, p);
      return p;
    };

    const shots = new Map<number, SpaceShot>();
    const shotFor = (i: number) => {
      let s = shots.get(i);
      if (!s) { s = new SpaceShot(PLANETS[i].config, PLANETS[i].star, false); shots.set(i, s); }
      return s;
    };
    // scene -1 is the gas giant flyby, then the planets in order, forever
    let scene = Math.min(startAt, PLANETS.length - 1), t = 0;
    let phase: 'space' | 'reveal' | 'surface' = 'space';
    let shot = scene < 0 ? new SpaceShot(GIANT, [255, 232, 200], true) : shotFor(scene);
    let ready: Prepared | null = null;
    let mounted = false, approachK = 0, clock = 0;
    prepare(Math.max(0, startAt)).then(p => { if (scene === Math.max(0, startAt)) ready = p; });
    shotFor(Math.max(0, startAt));

    const next = () => {
      // leave the current planet: free its generator and start the next world
      const old = ready;
      ready = null; mounted = false;
      setSurface(null);
      if (old) { prepared.delete(scene); shots.delete(scene); setTimeout(() => { old.session.dispose(); sessions.delete(old.session); }, 300); }
      scene = (scene + 1) % PLANETS.length;
      shot = shotFor(scene);
      const s = scene;
      prepare(s).then(p => { if (scene === s) ready = p; });
      t = 0; phase = 'space';
      canvas.style.opacity = '1';
    };

    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const cpu0 = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      t += dt; clock += dt;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const m = Math.min(w, h);

      if (scene === -1) {
        // --- opening: a ringed giant slides past a far star ---
        const k = ease(t / 10);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        shot.draw(ctx, w, h, dpr, t, dt, w * (1.25 - k * 0.75), h * (0.7 - k * 0.08), m * (0.62 + k * 0.1), w * 0.14, h * 0.2);
        if (t > 10.2) { scene = PLANETS.length - 1; next(); }
      } else if (phase !== 'surface') {
        // --- approach: the planet grows until the camera dives through its atmosphere ---
        if (ready && !mounted && t > APPROACH - 3) {
          mounted = true;
          const r = ready;
          setSurface({ key: `${scene}:${now}`, session: r.session, cine: r.cine, x: r.cine.start.x, y: r.cine.start.y });
        }
        // keeps creeping closer while the terrain loads; the dive starts from wherever the approach ended
        if (phase === 'space') approachK = ease(t / APPROACH) * 0.85 + Math.max(0, t - APPROACH) * 0.012;
        if (phase === 'space' && t > APPROACH && ready?.cine.ready) { phase = 'reveal'; t = 0; }
        const k = approachK;
        let pr = m * (0.08 + k * 0.42), px = w * (0.64 - k * 0.14), py = h * (0.56 - k * 0.06);
        let alpha = 1, flash = 0;
        if (phase === 'reveal') {
          const r = Math.min(1, t / REVEAL);
          pr *= 1 + r * r * 7; px += (w / 2 - px) * r; py += (h / 2 - py) * r;
          flash = Math.sin(Math.min(1, r * 1.2) * Math.PI) * 0.55;
          alpha = 1 - ease((r - 0.35) / 0.65);
          if (r >= 1) { phase = 'surface'; t = 0; }
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        shot.draw(ctx, w, h, dpr, clock, dt, px, py, pr, w * 0.12, h * 0.18);
        if (flash > 0) { const c = shot.atmoColor; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${flash})`; ctx.fillRect(0, 0, w, h); }
        canvas.style.opacity = String(alpha);
        if (phase === 'surface') canvas.style.opacity = '0';
      } else {
        // --- on the ground: the director films; when it is done, on to the next world ---
        if (ready?.cine.finished) next();
        // prepare the next world while this one plays
        else if (t > 2) prepare((scene + 1) % PLANETS.length);
      }
      if (phase !== 'surface') frameMeter.add(performance.now() - cpu0, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      jobs.forEach(j => j.cancel());
      sessions.forEach(s => s.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {surface && (
        <React.Fragment key={surface.key}>
          <SurvivalView session={surface.session} mapX={surface.x} mapY={surface.y} title="" onExit={onExit} cinematic={surface.cine} />
        </React.Fragment>
      )}
      <div className="fixed inset-0 z-[400] pointer-events-none select-none">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full bg-black" />
        <div className="absolute top-3 left-3 font-mono text-[12px] tabular-nums text-white/80 bg-black/45 rounded px-2 py-0.5" style={{ textShadow: '0 1px 0 #000' }}>
          <span ref={fpsRef}>—</span> FPS
        </div>
        <button onClick={onExit} title="Sair (Esc)"
          className={`pointer-events-auto absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white/80 hover:text-white transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0'}`}>
          <X className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}
