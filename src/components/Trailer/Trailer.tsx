// The trailer. One timeline locked to the soundtrack ("Leaf" by Infraction, 100 BPM: a beat every 0.6 s, a bar
// every 2.4 s, first beat at 0.45 s). Every cut sits on the beat grid; the end card lands at 2:17 where the music
// fades out. The clock is the music itself, so a slow frame never pushes the picture out of sync.
//
//   -6.0  title cards on black, no music yet
//    0.0  the universe, the music starts            | intro      0 - 19.65
//    2.85 dive into a spiral galaxy -> hyperspace
//    6.45 the galaxy, dive into a star with an Earth-like world -> hyperspace
//   10.65 its solar system, dive into the planet -> hyperspace
//   14.85 the globe turning for 3 s, 17.85 into the clouds
//   19.65 the surface: nature                       | build     19.65 - 58.05
//   58.05 space, other worlds, more nature          | breakdown 58.05 - 96.45
//   96.45 lava, ice, the pull-out to the world map  | climax    96.45 - 116
//  110.85 20 creatures, 0.5 s each; 120.85 one is picked; 122 its evolution, 1 s per stage; 134 the space age for 3 s
//  137.0  end card (5 s)
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PlanetConfig, PlanetType } from '../../lib/planet-generator/generator';
import { openPlanetSession, PlanetSession } from '../../lib/planet-generator/planetClient';
import { SolarSystemGenerator } from '../../lib/solar-system/generator';
import { SurvivalView } from '../Survival/SurvivalView';
import { scout, SurfaceCine, ShotSpec } from '../Demo/director';
import { SpaceShot } from '../Demo/spaceShot';
import { WORLDS, STARS, GIANT, cfg } from '../Demo/worlds';
import { UniverseScene, GalaxyScene, SystemScene, EarthStar, drawHyperspace, drawCloudFog, warmFog, ease, zoomLerp } from './cosmos';
import { CreatureMontage } from './creatures';
import { drawTitles, drawNowPlaying, FilmRecorder } from './overlay';

// ---------------------------------------------------------------------------------------------------
// Timeline (seconds on the soundtrack)
// ---------------------------------------------------------------------------------------------------
const INTRO = 6;
const BAR = 2.4;
const T = {
  universeZoom: 2.85, galaxy: 6.45, system: 10.65, globe: 14.85, clouds: 17.85, surface: 19.65,
  xenoSpace: 48.45, flyby: 58.05, galaxyPan: 67.65, systemPan: 82.05, globes: 91.65,
  creatures: 110.85, lineup: 120.85, evolution: 122, spaceAge: 134, end: 137, final: 142,
};
const HYPER_IN = 0.6, HYPER_OUT = 0.5;
const MUSIC = { title: 'Leaf', artist: 'Infraction', youtube: 'oeCvq6VbtmY' };
/** the soundtrack served with the site, when present (it is not in the repository: see CLAUDE.md) */
export const LOCAL_SOUNDTRACK = `${import.meta.env.BASE_URL}trailer/leaf.mp3`;

type Key = keyof typeof WORLDS;
interface SurfacePlan { world: Key; prepareAt: number; end: number; shots: ShotSpec[] }
const shot = (kind: ShotSpec['kind'], at: number, hour: [number, number], extra: Partial<ShotSpec> = {}): ShotSpec => ({ kind, at, hour, dur: 0, ...extra });

const SURFACES: SurfacePlan[] = [
  {
    world: 'gaia', prepareAt: -99, end: T.xenoSpace, shots: [
      shot('coast', 19.65, [9, 9.4]),
      shot('wild', 24.45, [7.4, 7.9], { speed: 9 }),
      shot('peaks', 29.25, [14, 14.3], { zoom: [2, 2] }),
      shot('coast', 34.05, [17.2, 21]),
      shot('wild', 38.85, [12, 12.2], { weather: 'storm', speed: 14 }),
      shot('rise', 43.65, [12.2, 12.3]),
    ],
  },
  {
    world: 'xeno', prepareAt: 20, end: T.galaxyPan, shots: [
      shot('wild', 50.85, [10, 10.3], { speed: 10 }),
      shot('coast', 55.65, [13, 13.3], { weather: 'rain' }),
      shot('coast', 62.85, [18.4, 22]),
    ],
  },
  { world: 'ocean', prepareAt: 44, end: T.systemPan, shots: [shot('coast', 72.45, [11, 11.3], { speed: 22 }), shot('coast', 77.25, [5.4, 7.2])] },
  { world: 'bayou', prepareAt: 62, end: T.globes, shots: [shot('wild', 86.85, [8, 8.4], { speed: 10 })] },
  { world: 'inferno', prepareAt: 70, end: 101.25, shots: [shot('lava', 96.45, [12, 12.2], { zoom: [2, 2], speed: 18 }), shot('lava', 98.85, [20, 22.5], { speed: 18 })] },
  {
    world: 'boreas', prepareAt: 78, end: T.creatures, shots: [
      shot('peaks', 101.25, [10, 10.3], { weather: 'snow' }),
      shot('peaks', 103.65, [16.8, 18.2], { zoom: [2, 2] }),
      shot('rise', 106.05, [18.2, 18.3]),
    ],
  },
];
/** windows where the space canvas covers the ground */
const SPACE_WINDOWS: [number, number][] = [[-99, T.surface], [T.xenoSpace, SURFACES[1].shots[0].at!], [T.flyby, 62.85], [T.galaxyPan, 72.45], [T.systemPan, 86.85], [T.globes, 96.45], [T.creatures, 999]];
// eight more worlds, one per beat, right before the drop
const MONTAGE: PlanetConfig[] = [
  cfg({ seed: 'tr-rock', planetType: PlanetType.ROCKY_AIRLESS, craterDensity: 0.8 }),
  cfg({ seed: 'tr-dune', planetType: PlanetType.ARID, surfaceHue: 'reddish' }),
  cfg({ seed: 'tr-uranus', planetType: PlanetType.GAS_GIANT, colorPalette: 'uranian', bandContrast: 0.5 }),
  cfg({ seed: 'tr-europa', planetType: PlanetType.FROZEN_OCEAN, lineaeDensity: 0.8 }),
  cfg({ seed: 'tr-venus', planetType: PlanetType.TOXIC_ATMOSPHERE }),
  cfg({ seed: 'tr-alien2', planetType: PlanetType.ALIEN_LIFE, vegetationHue: 'red', waterHue: 'magenta' }),
  cfg({ seed: 'tr-ash', planetType: PlanetType.ASH_WORLD }),
  cfg({ seed: 'tr-jove2', planetType: PlanetType.GAS_GIANT, colorPalette: 'alien-purple', bandContrast: 0.8, stormFrequency: 0.7 }),
];

// ---------------------------------------------------------------------------------------------------
// Soundtrack clock: the music's own position once it plays (local file, else the YouTube player)
// ---------------------------------------------------------------------------------------------------
interface YTPlayer { playVideo(): void; pauseVideo(): void; seekTo(s: number, a: boolean): void; getCurrentTime(): number; getPlayerState(): number; destroy(): void }
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void } }

class Soundtrack {
  private audio: HTMLAudioElement | null = null;
  private yt: YTPlayer | null = null;
  private startPerf = 0;
  private startAt = 0;
  started = false;
  private corr = 0;

  private actx: AudioContext | null = null;
  private tap: MediaStreamAudioDestinationNode | null = null;

  /** `file`: a soundtrack the viewer picked (always used, and recordable) */
  constructor(private host: HTMLElement, private seek: number, file?: string) {
    if (file) { this.audio = new Audio(file); this.audio.preload = 'auto'; return; }
    const url = LOCAL_SOUNDTRACK;
    fetch(url, { method: 'HEAD' }).then(r => {
      if (r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')) {
        this.audio = new Audio(url);
        this.audio.preload = 'auto';
        if (this.started) this.playNow();
      } else this.loadYouTube();
    }).catch(() => this.loadYouTube());
  }
  private loadYouTube() {
    const make = () => {
      const el = document.createElement('div');
      this.host.appendChild(el);
      this.yt = new window.YT!.Player(el, {
        videoId: MUSIC.youtube, width: 200, height: 200,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, start: Math.max(0, Math.floor(this.seek)) },
        events: { onReady: () => { if (this.started) this.playNow(); } },
      });
    };
    if (window.YT?.Player) { make(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); make(); };
    if (!document.getElementById('yt-api')) {
      const s = document.createElement('script');
      s.id = 'yt-api'; s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  }
  private playNow() {
    const at = this.now();
    if (this.audio) { this.audio.currentTime = Math.max(0, at); this.audio.play().catch(() => { /* muted autoplay: the picture still runs */ }); }
    else if (this.yt) { try { this.yt.seekTo(Math.max(0, at), true); this.yt.playVideo(); } catch { /* not ready */ } }
  }
  /** music starts now, at `at` seconds */
  start(at: number) { this.started = true; this.startPerf = performance.now(); this.startAt = at; this.playNow(); }
  now(): number {
    const est = this.startAt + (performance.now() - this.startPerf) / 1000 + this.corr;
    if (!this.started) return est;
    // follow the music's own position (it is the master), gently to hide coarse updates
    let m: number | null = null;
    if (this.audio && !this.audio.paused && this.audio.currentTime > 0) m = this.audio.currentTime;
    else if (this.yt) { try { if (this.yt.getPlayerState() === 1) m = this.yt.getCurrentTime(); } catch { /* ignore */ } }
    if (m !== null) {
      const d = m - est;
      if (Math.abs(d) > 0.5) this.corr += d; else this.corr += d * 0.08;
    }
    return this.startAt + (performance.now() - this.startPerf) / 1000 + this.corr;
  }
  /** The music as a recordable track (local file only): routed through Web Audio to the speakers and a tap. */
  audioTrack(): MediaStreamTrack | null {
    if (!this.audio) return null;
    if (!this.tap) {
      this.actx = new AudioContext();
      const src = this.actx.createMediaElementSource(this.audio);
      this.tap = this.actx.createMediaStreamDestination();
      src.connect(this.actx.destination);
      src.connect(this.tap);
      this.actx.resume().catch(() => { /* resumed by the next gesture */ });
    }
    return this.tap.stream.getAudioTracks()[0] ?? null;
  }
  stop() { try { this.audio?.pause(); this.yt?.pauseVideo(); } catch { /* ignore */ } }
  dispose() { this.stop(); try { this.yt?.destroy(); this.actx?.close(); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------------
interface Mounted { key: string; session: PlanetSession; cine: SurfaceCine; x: number; y: number; standby: boolean }

export function Trailer({ onExit, seek = -INTRO, step = 0, record }: {
  onExit: () => void; seek?: number;
  /** fixed clock step per frame (testing: no music) */ step?: number;
  /** record the film into a video file (the value is the soundtrack URL) */ record?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const prepRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<HTMLDivElement>(null);
  const [surfaces, setSurfaces] = useState<Mounted[]>([]);
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
    const music = new Soundtrack(ytRef.current!, seek, record);
    const recorder = record ? new FilmRecorder(record, INTRO) : null;
    // the directors on the ground read the trailer's time (set once per frame below)
    let curT = -INTRO;
    const clock = () => curT;

    // --- heavy scenes are built up front (behind the black of the title cards) ---
    const universe = new UniverseScene('Claude');
    const galaxy = new GalaxyScene(universe.target);
    const earth: EarthStar | null = galaxy.findEarthStar();
    const system = earth ? new SystemScene(earth.bodies, earth.planet.id, WORLDS.gaia) : null;
    const globe = new SpaceShot(WORLDS.gaia, STARS.gaia, false, 40, 1024);
    globe.maxSize = 900;
    const xenoShot = new SpaceShot(WORLDS.xeno, STARS.xeno, false, 60);
    const flyby = new SpaceShot(GIANT, [255, 232, 200], true, 120);
    const other = universe.galaxies.filter(g => g !== universe.target && !g.isDead && g.size > 1).sort((a, b) => b.size - a.size)[3] ?? universe.target;
    const galaxy2 = new GalaxyScene(other);
    // the busiest of a few systems of that galaxy (many planets, rings)
    let system2: SystemScene | null = null, busiest = -1;
    for (const st of galaxy2.stars.filter(q => q.starClass !== 'BH' && q.starClass !== 'NS' && q.starClass !== 'P').slice(0, 12)) {
      const bodies = new SolarSystemGenerator(st.config).generateSystem();
      const k = bodies.filter(q => q.type === 'planet').length + (bodies.some(q => q.hasRings) ? 4 : 0);
      if (k > busiest) { busiest = k; system2 = new SystemScene(bodies); }
    }
    const orbits = new Map<Key, SpaceShot>([['gaia', globe], ['xeno', xenoShot]]);
    const orbitOf = (k: Key) => { let s = orbits.get(k); if (!s) { s = new SpaceShot(WORLDS[k], STARS[k], false, 60); orbits.set(k, s); } return s; };
    const montage: SpaceShot[] = [];
    const creatures = new CreatureMontage('trailer');
    let preloaded = false;

    // --- planet surfaces: generated ahead, mounted invisible, cut to on the beat ---
    const plans = SURFACES.map(p => ({ ...p, session: null as PlanetSession | null, cine: null as SurfaceCine | null, job: null as { cancel: () => void } | null, gone: false }));
    const prepare = (p: typeof plans[number]) => {
      const job = openPlanetSession(WORLDS[p.world]);
      p.job = job;
      job.ready.then(async session => {
        if (!alive) { session.dispose(); return; }
        p.session = session;
        const spots = await scout(session);
        p.cine = new SurfaceCine(p.shots, spots, session.width, WORLDS[p.world].seed, clock, p.end);
      }).catch(() => { /* cancelled */ });
    };
    let sig = '';
    const syncSurfaces = (now: number) => {
      const list: Mounted[] = [];
      for (const p of plans) {
        if (!p.job && now >= p.prepareAt) prepare(p);
        const first = p.shots[0].at!;
        if (p.cine && p.session && !p.gone && now >= first - 14 && now < p.end) {
          list.push({ key: p.world, session: p.session, cine: p.cine, x: p.cine.start.x, y: p.cine.start.y, standby: now < first - 0.15 });
        }
        if (!p.gone && now >= p.end + 0.3 && p.session) {
          p.gone = true;
          const s = p.session;
          setTimeout(() => s.dispose(), 800);
        }
      }
      const s = list.map(m => m.key + (m.standby ? '~' : '')).join(',');
      if (s !== sig) { sig = s; setSurfaces(list); }
    };

    const inSpace = (t: number) => SPACE_WINDOWS.some(([a, b]) => t >= a && t < b);
    const lin = (t: number, a: number, d = 1.2) => Math.max(0, Math.min(1, (t - a) / d));
    let started = false, t0 = 0, prepT0 = -1, frames = 0;
    let lastT = 0;
    const firstWorld = plans.find(p => p.shots[0].at! > seek) ?? plans[0];

    const frame = (nowMs: number) => {
      if (!alive) return;
      if (!started) {
        // preparation (black): the first world's ground, the globe and the galaxy sprites are made before the
        // title cards, so the film itself never waits for them
        if (prepT0 < 0) prepT0 = nowMs;
        const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
        if (canvas.width !== w0 || canvas.height !== h0) { canvas.width = w0; canvas.height = h0; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w0, h0);
        curT = firstWorld.shots[0].at! - 10;
        syncSurfaces(curT);
        const t1 = performance.now();
        while (performance.now() - t1 < 12 && !universe.warm(4));
        warmFog();
        const ok = ((firstWorld.cine?.ready && firstWorld.cine.idle && globe.tex && universe.warm(0)) || nowMs - prepT0 > 40000) && (!recorder || recorder.ready);
        if (prepRef.current) prepRef.current.style.opacity = String(Math.min(1, (nowMs - prepT0) / 800) * 0.6);
        if (!ok) { raf = requestAnimationFrame(frame); return; }
        if (prepRef.current) prepRef.current.style.opacity = '0';
        started = true; t0 = nowMs;
        if (recorder) { recorder.start(canvas, () => music.audioTrack()); if (recRef.current) recRef.current.style.opacity = '1'; }
      }
      // before the music: a plain clock through the title cards
      const pre = step ? seek + frames++ * step : seek + (nowMs - t0) / 1000;
      if (pre >= 0 && !music.started && !step) music.start(pre);
      const t = pre < 0 || step ? pre : music.now();
      curT = t;
      const dt = Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
      if (import.meta.env.DEV) (window as unknown as { __trailerT: number }).__trailerT = t;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight, m = Math.min(w, h);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      syncSurfaces(t);

      // lazy extras (textures and sprites stream in while the first minute plays)
      if (t > 55 && !montage.length) for (const c of MONTAGE) montage.push(new SpaceShot(c, [255, 236, 210], c.planetType === PlanetType.GAS_GIANT, 30));
      if (t > 60 && !preloaded) { preloaded = true; creatures.preload(); }

      // bake the universe's galaxy sprites through the title cards (~3 ms per frame instead of one long stall)
      if (t < 0) { const t1 = performance.now(); while (performance.now() - t1 < 6 && !universe.warm(4)); if (t > -1.5) warmFog(); }

      if (t < 0 || t >= T.end) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        if (t >= T.final) {
          alive = false;
          music.stop();
          if (recorder) recorder.finish().then(() => exitRef.current()); else exitRef.current();
          return;
        }
      } else if (t < T.galaxy) {
        // --- the universe; then a spiral galaxy rushes in ---
        const k = ease((t - T.universeZoom) / (T.galaxy - HYPER_IN * 0.5 - T.universeZoom));
        const s0 = universe.fillScale(w, h, 0.035) * (1 + t * 0.03), s1 = universe.fillScale(w, h, 0.9);
        let sc = t < T.universeZoom ? s0 : zoomLerp(s0, s1, k);
        const hp = (t - (T.galaxy - HYPER_IN)) / HYPER_IN;
        if (hp > 0) sc *= 1 + hp * hp * 3;
        const c = 0.55 + 0.45 * Math.min(1, k * 1.4);
        universe.draw(ctx, w, h, t, universe.target.x * c, universe.target.y * c, sc);
        if (hp > 0) drawHyperspace(ctx, w, h, hp, 'in');
      } else if (t < T.system) {
        // --- inside the galaxy: towards the star that has an Earth-like world ---
        const u = t - T.galaxy, rot = t * 0.015;
        const star = earth?.star;
        const target = star ? galaxy.where(star, w, h, rot) : { x: 0, y: 0 };
        const k = ease(u / (T.system - T.galaxy - HYPER_IN * 0.4));
        let sc = zoomLerp(1, 60, k);
        const hp = (t - (T.system - HYPER_IN)) / HYPER_IN;
        if (hp > 0) sc *= 1 + hp * hp * 4;
        const c = Math.min(1, ease(u / 2.2));
        galaxy.draw(ctx, w, h, t, target.x * c, target.y * c, sc, rot, star);
        if (u < HYPER_OUT) drawHyperspace(ctx, w, h, u / HYPER_OUT, 'out');
        if (hp > 0) drawHyperspace(ctx, w, h, hp, 'in');
      } else if (t < T.globe) {
        // --- the solar system: towards the blue planet ---
        const u = t - T.system;
        if (system && earth) {
          const ticks = 2000 + u * 60 * 3;
          system.update(ticks);
          const p = system.pos.get(earth.planet.id)!;
          const k = ease(u / (T.globe - T.system - HYPER_IN * 0.3));
          let Z = zoomLerp(system.fitZoom(w, h), system.zoomForRadius(earth.planet.id, m * 0.14), k);
          const hp = (t - (T.globe - HYPER_IN)) / HYPER_IN;
          if (hp > 0) Z *= 1 + hp * hp * 3;
          const c = ease(Math.min(1, k * 1.3));
          system.draw(ctx, w, h, dpr, t, ticks, p.x * c, p.y * c, Z);
          if (u < HYPER_OUT) drawHyperspace(ctx, w, h, u / HYPER_OUT, 'out');
          if (hp > 0) drawHyperspace(ctx, w, h, hp, 'in');
        }
      } else if (t < T.surface) {
        // --- the globe turning, then down through the clouds ---
        const u = t - T.globe;
        const dive = Math.max(0, (t - T.clouds) / (T.surface - T.clouds));
        const pr = m * 0.36 * zoomLerp(1, 7, ease(dive) * ease(dive));
        globe.draw(ctx, w, h, dpr, u + 3, dt, w / 2, h / 2, pr, w * 0.1, h * 0.14);
        if (u < HYPER_OUT) drawHyperspace(ctx, w, h, u / HYPER_OUT, 'out');
        if (dive > 0) drawCloudFog(ctx, w, h, Math.pow(dive, 1.4), t);
      } else if (!inSpace(t)) {
        // --- on the ground (SurvivalView underneath); the cloud deck clears in the first second ---
        const here = plans.find(p => t >= p.shots[0].at! && t < p.end);
        if (here && !here.cine?.ready) {
          // safety net on a slow machine: that world is not ready yet, so it is shown from orbit meanwhile
          const s = orbitOf(here.world);
          s.draw(ctx, w, h, dpr, t, dt, w * 0.55, h * 0.54, m * 0.36, w * 0.12, h * 0.18);
        }
        if (t < T.surface + 1.2) drawCloudFog(ctx, w, h, 1 - ease((t - T.surface) / 1.2), t);
      } else if (t < T.flyby) {
        // --- another world from orbit ---
        const k = ease((t - T.xenoSpace) / BAR);
        xenoShot.draw(ctx, w, h, dpr, t, dt, w * (0.6 - k * 0.1), h * 0.54, m * (0.2 + k * 0.2), w * 0.12, h * 0.18);
      } else if (t < T.galaxyPan) {
        // --- a ringed giant slides past ---
        const k = (t - T.flyby) / (2 * BAR);
        flyby.draw(ctx, w, h, dpr, t, dt, w * (1.2 - k * 0.7), h * (0.7 - k * 0.08), m * (0.62 + k * 0.1), w * 0.14, h * 0.2);
      } else if (t < T.systemPan) {
        // --- a different galaxy, turning ---
        const g2 = galaxy2 ?? galaxy;
        const k = (t - T.galaxyPan) / (2 * BAR);
        g2.draw(ctx, w, h, t, 0, 0, zoomLerp(1.05, 1.9, k), t * 0.03);
      } else if (t < T.globes) {
        // --- a busy solar system in fast-forward ---
        const s2 = system2 ?? system;
        if (s2) {
          // riding along with its biggest planet (rings and moons), the rest of the system wheeling behind
          const k = (t - T.systemPan) / (2 * BAR);
          const ticks = 500 + (t - T.systemPan) * 60 * 6;
          s2.update(ticks);
          const hero = s2.bodies.filter(b => b.type === 'planet').reduce((a, b) => ((b.hasRings ? 2 : 1) * b.radius > (a.hasRings ? 2 : 1) * a.radius ? b : a));
          const p = s2.pos.get(hero.id)!;
          const Z = zoomLerp(s2.zoomForRadius(hero.id, m * 0.05), s2.zoomForRadius(hero.id, m * 0.1), k);
          s2.draw(ctx, w, h, dpr, t, ticks, p.x + (w * 0.12) / Z, p.y, Z);
        }
      } else if (t < 96.45) {
        // --- eight worlds, one per beat ---
        const i = Math.min(montage.length - 1, Math.floor((t - T.globes) / (BAR / 4)));
        const s = montage[Math.max(0, i)];
        if (s) {
          const u = ((t - T.globes) % (BAR / 4)) / (BAR / 4);
          s.draw(ctx, w, h, dpr, t, dt, w / 2, h / 2, m * (0.3 + u * 0.03), w * 0.12, h * 0.16);
        }
      } else if (t < T.lineup) {
        creatures.drawGallery(ctx, w, h, Math.floor((t - T.creatures) / 0.5), t);
      } else if (t < T.evolution) {
        creatures.drawLineup(ctx, w, h, (t - T.lineup) / (T.evolution - T.lineup), t);
      } else {
        creatures.drawEvolution(ctx, w, h, Math.min(12, Math.floor(t - T.evolution)), t);
      }
      drawTitles(ctx, w, h, t);
      if (t >= 0) drawNowPlaying(ctx, w, h, t, Math.min(1, t / 0.8));
      if (recorder && t >= -INTRO) recorder.frame(canvas, t);
      raf = requestAnimationFrame(frame);
    };
    // give the first paint a moment, then roll
    const id = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, 60);
    return () => {
      alive = false;
      clearTimeout(id);
      cancelAnimationFrame(raf);
      music.dispose();
      recorder?.cancel();
      creatures.dispose();
      for (const p of plans) { p.job?.cancel(); p.session?.dispose(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {surfaces.map(s => (
        <React.Fragment key={s.key}>
          <SurvivalView session={s.session} mapX={s.x} mapY={s.y} title="" onExit={onExit} cinematic={s.cine} standby={s.standby} />
        </React.Fragment>
      ))}
      {/* the YouTube player (fallback soundtrack) is hidden under everything; the film shows a "now playing" badge */}
      <div ref={ytRef} className="fixed left-0 bottom-0 z-[1] pointer-events-none" style={{ width: 200, height: 200, opacity: 0 }} />
      <div className="fixed inset-0 z-[400] select-none pointer-events-none" style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div ref={prepRef} className="absolute left-0 right-0 bottom-8 text-center text-white text-xs tracking-[0.3em]" style={{ opacity: 0 }}>{record ? 'PREPARANDO A GRAVAÇÃO…' : 'PREPARANDO…'}</div>
        {/* shown on screen only - not part of the recorded video */}
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
