// "Assistir demo": a self-running film of the game's worlds. Space shots of each planet, then the camera dives to the
// surface and a director films it in spectator mode - coasts, wildlife, cliffs, time-lapses, weather, and a pull-out
// to the world map. No HUD: only the engine's frame rate (what it could reach with vsync off).
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PlanetConfig, PlanetType } from '../../lib/planet-generator/generator';
import { openPlanetSession, requestPlanetTexture, PlanetSession, PlanetTexture } from '../../lib/planet-generator/planetClient';
import { atmosphereFor, cloudProfileFor, emissiveFor } from '../../lib/planet-generator/visualProfile';
import { renderSphere } from '../../lib/render/planetSphere';
import { SpaceBackdrop } from '../../lib/render/spaceBackdrop';
import { glowSprite, ringSprite, starRaysSprite, RingSprite } from '../../lib/render/celestialSprites';
import { haloSprite } from '../../lib/render/bodySprite';
import { frameMeter } from '../../lib/render/frameMeter';
import { SurvivalView } from '../Survival/SurvivalView';
import { scout, SurfaceCine, ShotSpec } from './director';

type RGB = [number, number, number];

const BASE: PlanetConfig = {
  seed: 'demo', width: 2048, height: 1024, numPlates: 30, seaLevel: 0.5, baseTemperature: 0.5, baseMoisture: 0.55,
  planetSize: 2, planetType: PlanetType.EARTH_LIKE, craterDensity: 0.4, surfaceHue: 'gray', dustStormIntensity: 0.3,
  cloudDensity: 0.55, volcanicActivity: 0.3, iceFractureDensity: 0.5, bandContrast: 0.6, stormFrequency: 0.4,
  colorPalette: 'jovian', vegetationHue: 'green', waterHue: 'blue', crustAge: 0.5, islandDensity: 0.2, lineaeDensity: 0.5,
  iceThickness: 0.5, starIntensity: 0.7, twilightWidth: 0.3, crystalDensity: 0.4, hydrocarbonLakes: 0.3,
  bioluminescence: 0.5, waterLevel: 0.6, ashDepth: 0.5, emberActivity: 0.4,
} as PlanetConfig;
const cfg = (over: Partial<PlanetConfig>): PlanetConfig => ({ ...BASE, ...over });

interface DemoPlanet { config: PlanetConfig; shots: ShotSpec[]; star: RGB }

// The film: every world is shown at its best time of day and weather.
const PLANETS: DemoPlanet[] = [
  {
    config: cfg({ seed: 'demo-gaia-7', planetType: PlanetType.EARTH_LIKE, baseTemperature: 0.55, baseMoisture: 0.62 }), star: [255, 226, 180],
    shots: [
      { kind: 'coast', dur: 11, hour: [9, 9.6] },
      { kind: 'wild', dur: 12, hour: [7.2, 8], speed: 9, zoom: [3, 3] },
      { kind: 'peaks', dur: 10, hour: [14, 14.5], zoom: [2, 2] },
      { kind: 'coast', dur: 13, hour: [16.6, 21.2] },
      { kind: 'wild', dur: 10, hour: [12, 12.4], weather: 'storm', speed: 14 },
    ],
  },
  {
    config: cfg({ seed: 'demo-xeno-3', planetType: PlanetType.ALIEN_LIFE, vegetationHue: 'purple', waterHue: 'green', baseMoisture: 0.65 }), star: [200, 220, 255],
    shots: [
      { kind: 'wild', dur: 12, hour: [10, 10.5], speed: 10 },
      { kind: 'coast', dur: 11, hour: [13, 13.5], weather: 'rain' },
      { kind: 'coast', dur: 12, hour: [18.2, 22] },
      { kind: 'wild', dur: 8, hour: [11, 11.3], speed: 12 },
      { kind: 'rise', dur: 11, hour: [11.3, 11.6] },
    ],
  },
  {
    config: cfg({ seed: 'demo-thalassa', planetType: PlanetType.OCEAN_WORLD, islandDensity: 0.22 }), star: [255, 240, 210],
    shots: [
      { kind: 'coast', dur: 12, hour: [11, 11.5], speed: 22 },
      { kind: 'coast', dur: 10, hour: [15, 15.4], weather: 'rain' },
      { kind: 'coast', dur: 11, hour: [5.2, 7.2], zoom: [3, 3] },
    ],
  },
  {
    config: cfg({ seed: 'demo-bayou-2', planetType: PlanetType.SWAMP_WORLD, baseTemperature: 0.65 }), star: [255, 210, 160],
    shots: [
      { kind: 'wild', dur: 11, hour: [8, 8.6], speed: 10 },
      { kind: 'coast', dur: 11, hour: [19, 22.5] },
    ],
  },
  {
    config: cfg({ seed: 'demo-inferno', planetType: PlanetType.LAVA_WORLD, volcanicActivity: 0.9, emberActivity: 0.8, crustAge: 0.2 }), star: [255, 180, 120],
    shots: [
      { kind: 'lava', dur: 11, hour: [12, 12.4], zoom: [2, 2], speed: 18 },
      { kind: 'lava', dur: 12, hour: [19.2, 23], speed: 18 },
      { kind: 'rise', dur: 10, hour: [23, 23.2] },
    ],
  },
  {
    config: cfg({ seed: 'demo-boreas', planetType: PlanetType.GLACIAL, baseTemperature: 0.2 }), star: [220, 235, 255],
    shots: [
      { kind: 'peaks', dur: 11, hour: [10, 10.4], weather: 'snow', zoom: [3, 3] },
      { kind: 'peaks', dur: 10, hour: [16.5, 18.6], zoom: [2, 2] },
      { kind: 'rise', dur: 12, hour: [18.6, 18.8] },
    ],
  },
];
// opens the film: a ringed gas giant drifting past
const GIANT = cfg({ seed: 'demo-jove', planetType: PlanetType.GAS_GIANT, colorPalette: 'jovian', bandContrast: 0.75, stormFrequency: 0.6 });

// ---------------------------------------------------------------------------------------------------
// Space shots
// ---------------------------------------------------------------------------------------------------
class SpaceShot {
  tex: PlanetTexture | null = null;
  private img: ImageData | null = null;
  private sphere = document.createElement('canvas');
  private lastRot = -1;
  private atmo; private cloud; private emissive;
  private ring: RingSprite | null;
  private backdrop: SpaceBackdrop;
  private rays: HTMLCanvasElement;
  private fade = 0;

  constructor(readonly config: PlanetConfig, private star: RGB, rings: boolean) {
    this.atmo = atmosphereFor(config);
    this.cloud = cloudProfileFor(config);
    this.emissive = emissiveFor(config);
    this.ring = rings ? ringSprite(config.seed, this.atmo?.color ?? [210, 190, 160], false) : null;
    this.backdrop = new SpaceBackdrop({ seed: config.seed + '_demo', nebula: 0.9, density: 1.1 });
    this.rays = starRaysSprite(star, config.seed);
    requestPlanetTexture(config, 1000, 512).then(t => { this.tex = t; }).catch(() => { /* stays a starfield */ });
  }

  /** px/py/pr in CSS px; sx/sy: the star. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, dt: number, px: number, py: number, pr: number, sx: number, sy: number) {
    this.backdrop.draw(ctx, w, h, t * 22, t * 5, t);
    const sr = Math.min(w, h) * 0.03;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowSprite(this.star, 1.4), sx - sr * 16, sy - sr * 16, sr * 32, sr * 32);
    ctx.drawImage(glowSprite([255, 250, 235], 3), sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.02);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(this.rays, -sr * 14, -sr * 14, sr * 28, sr * 28);
    ctx.restore();
    const tex = this.tex;
    if (!tex) return;
    this.fade = Math.min(1, this.fade + dt * 1.2);
    const lx = sx - px, ly = sy - py, ll = Math.hypot(lx, ly) || 1;
    const light: [number, number, number] = [lx / ll * 0.85, ly / ll * 0.85, 0.52];
    const ring = this.ring;
    const drawRing = (back: boolean) => {
      if (!ring) return;
      const R = pr * Math.min(ring.outer, 2.25);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.32);
      ctx.beginPath();
      if (back) ctx.rect(-R - 2, -R - 2, R * 2 + 4, R + 2); else ctx.rect(-R - 2, 0, R * 2 + 4, R + 2);
      ctx.clip();
      ctx.scale(1, 0.22);
      ctx.globalAlpha = 0.9 * this.fade;
      ctx.drawImage(ring.canvas, -R, -R, R * 2, R * 2);
      ctx.restore();
    };
    drawRing(true);
    if (this.atmo) {
      const outer = pr * (1 + this.atmo.thickness * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.atmo.intensity * 0.6 * this.fade;
      ctx.drawImage(haloSprite(this.atmo.color, pr / outer), px - outer + light[0] * pr * 0.06, py - outer + light[1] * pr * 0.06, outer * 2, outer * 2);
      ctx.restore();
    }
    const size = Math.max(64, Math.min(640, Math.round(pr * 2 * dpr / 8) * 8));
    const rot = (t / 90) % 1;
    if (!this.img || this.img.width !== size || Math.abs(rot - this.lastRot) > 0.5 / tex.width) {
      if (!this.img || this.img.width !== size) { this.img = new ImageData(size, size); this.sphere.width = size; this.sphere.height = size; }
      renderSphere(this.img, tex, {
        rotation: rot, cloudRotation: rot * 1.15 + 0.2, light, ambient: 0.025, emissive: this.emissive,
        cloudColor: this.cloud?.color ?? [255, 255, 255], cloudOpacity: this.cloud?.opacity ?? 0,
        rimColor: this.atmo?.color ?? null, rimStrength: this.atmo ? this.atmo.intensity : 0,
      });
      this.sphere.getContext('2d')!.putImageData(this.img, 0, 0);
      this.lastRot = rot;
    }
    ctx.save();
    ctx.globalAlpha = this.fade;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.sphere, px - pr, py - pr, pr * 2, pr * 2);
    ctx.restore();
    drawRing(false);
  }
  get atmoColor(): RGB { return (this.atmo?.color as RGB) ?? [200, 220, 255]; }
}

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
        const fade = Math.max(1 - t / 1.5, (t - 9) / 1.2);
        if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, w, h); }
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
        const fin = phase === 'space' ? 1 - t / 1.2 : 0;
        if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${fin})`; ctx.fillRect(0, 0, w, h); }
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
