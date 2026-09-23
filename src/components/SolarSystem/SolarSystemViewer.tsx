import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Orbit, Tag, Thermometer, Maximize2, ZoomIn, ZoomOut, X, Globe2 } from 'lucide-react';
import { CelestialBody } from '../../lib/solar-system/types';
import { STAR_DATA, AU_TO_PX } from '../../lib/solar-system/generator';
import { SurfaceModal } from './SurfaceModal';
import { PlanetPreview } from './PlanetPreview';
import { BodySprite } from '../../lib/render/bodySprite';
import { SpaceBackdrop } from '../../lib/render/spaceBackdrop';
import { glowSprite, starRaysSprite, starSurfaceFrames, asteroidSpriteSet, RGB } from '../../lib/render/celestialSprites';
import { hexToRgb } from '../../lib/render/planetSphere';
import { cancelPlanetTexturesExcept } from '../../lib/planet-generator/planetClient';
import { bodyStats, PLANET_TYPE_NAMES, PLANET_TYPE_DESCRIPTIONS, STAR_CLASS_NAMES } from '../../lib/solar-system/bodyInfo';

interface ViewerProps {
  bodies: CelestialBody[];
  showZones?: boolean;
  systemAge?: number;
}

// Simulation time: a 1 AU orbit takes this many ticks (see orbitalSpeed) and represents one year.
const orbitalSpeed = (body: CelestialBody) => {
  const a = body.orbit.semiMajorAxis;
  const mult = body.type === 'moon' ? 0.02 : 0.15;
  return (50 / Math.sqrt(Math.max(0.1, a * a * a))) * mult;
};
const TICKS_PER_YEAR = (Math.PI * 2) / ((50 / Math.pow(AU_TO_PX, 1.5)) * 0.15);
const ticksToDays = (t: number) => (t / TICKS_PER_YEAR) * 365.25;
const SPEEDS = [1, 4, 16, 64];

interface ScreenBody { x: number; y: number; r: number; visible: boolean }

export function SolarSystemViewer({ bodies, showZones = false, systemAge = 1 }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [zonesOn, setZonesOn] = useState(showZones);
  const [labelsOn, setLabelsOn] = useState(true);
  const [orbitsOn, setOrbitsOn] = useState(true);
  const [viewingSurface, setViewingSurface] = useState<CelestialBody | null>(null);
  const [clockDays, setClockDays] = useState(0);
  const [zoomLabel, setZoomLabel] = useState(1);

  useEffect(() => setZonesOn(showZones), [showZones]);

  // Mirror of UI state for the render loop (avoids restarting the loop on every change)
  const ui = useRef({ focusedId, speed, paused, zonesOn, labelsOn, orbitsOn, hoveredId: null as string | null });
  ui.current.focusedId = focusedId;
  ui.current.speed = speed;
  ui.current.paused = paused;
  ui.current.zonesOn = zonesOn;
  ui.current.labelsOn = labelsOn;
  ui.current.orbitsOn = orbitsOn;

  const cam = useRef({ x: 0, y: 0, zoom: 1 });
  const target = useRef({ x: 0, y: 0, zoom: 1 });
  const fitZoom = useRef(1);
  const sim = useRef({ ticks: 0, spin: 0 });
  const size = useRef({ w: 800, h: 600, dpr: 1 });
  const worldPos = useRef(new Map<string, { x: number; y: number }>());
  const screen = useRef(new Map<string, ScreenBody>());

  const byId = useMemo(() => new Map(bodies.map(b => [b.id, b])), [bodies]);
  const primary = useMemo(() => bodies.find(b => b.id === 'star-1'), [bodies]);
  const sprites = useMemo(() => {
    const m = new Map<string, BodySprite>();
    bodies.forEach(b => { if (b.type === 'planet' || b.type === 'moon') m.set(b.id, new BodySprite(b)); });
    return m;
  }, [bodies]);
  const backdrop = useMemo(
    () => new SpaceBackdrop({ seed: primary?.name ?? 'system', nebula: 0.55, dim: systemAge > 0.8 ? (systemAge - 0.8) * 3 : 0 }),
    [primary?.name, systemAge],
  );
  const moonsOf = useMemo(() => {
    const m = new Map<string, CelestialBody[]>();
    bodies.forEach(b => { if (b.type === 'moon' && b.parentId) { if (!m.has(b.parentId)) m.set(b.parentId, []); m.get(b.parentId)!.push(b); } });
    return m;
  }, [bodies]);

  // ---------------------------------------------------------------------------
  // Texture requests (worker pool). Planets first, then large moons.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let i = 0;
    sprites.forEach(s => { s.requestTexture(s.body.type === 'planet' ? 50 - i++ : 5); });
    return () => cancelPlanetTexturesExcept([]);
  }, [sprites]);

  useEffect(() => {
    if (!focusedId) return;
    sprites.get(focusedId)?.requestTexture(100);
    moonsOf.get(focusedId)?.forEach(m => sprites.get(m.id)?.requestTexture(90));
  }, [focusedId, sprites, moonsOf]);

  // ---------------------------------------------------------------------------
  // Fit whole system on new data
  // ---------------------------------------------------------------------------
  const fitSystem = (instant = false) => {
    const { w, h } = size.current;
    const far = Math.max(
      AU_TO_PX * 0.8,
      ...bodies.filter(b => b.type === 'planet' || (b.type === 'star' && b.parentId)).map(b => b.orbit.semiMajorAxis * (1 + b.orbit.eccentricity)),
    );
    const z = (Math.min(w, h) * 0.47) / far;
    fitZoom.current = z;
    target.current = { x: 0, y: 0, zoom: z };
    if (instant) cam.current = { x: 0, y: 0, zoom: z };
  };

  useEffect(() => {
    setFocusedId(null);
    setViewingSurface(null);
    sim.current = { ticks: 0, spin: 0 };
    fitSystem(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodies]);

  // ---------------------------------------------------------------------------
  // Canvas sizing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current, canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const first = size.current.w === 800 && size.current.h === 600;
      size.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (first) fitSystem(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HUD clock
  useEffect(() => {
    const id = setInterval(() => {
      setClockDays(ticksToDays(sim.current.ticks));
      setZoomLabel(cam.current.zoom / fitZoom.current);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const asteroidSprites = asteroidSpriteSet();
    const starAgeDim = systemAge >= 0.7 ? Math.min(1, (systemAge - 0.7) / 0.3) : 0;
    const stars = bodies.filter(b => b.type === 'star');
    const planets = bodies.filter(b => b.type === 'planet');
    const moons = bodies.filter(b => b.type === 'moon');
    const asteroids = bodies.filter(b => b.type === 'asteroid');
    const comets = bodies.filter(b => b.type === 'comet');
    const starFrames = new Map(stars.map(s => [s.id, starSurfaceFrames(hexToRgb(s.baseColor), s.id + s.name, 192)]));

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      const U = ui.current;
      if (!U.paused) {
        sim.current.ticks += dt * 60 * U.speed;
        sim.current.spin += dt * 60 * Math.min(U.speed, 4);
      }
      const T = sim.current.ticks;
      const { w, h, dpr } = size.current;

      // --- Orbital positions (parents are always listed before children) ---
      const pos = worldPos.current;
      for (const b of bodies) {
        let cx = 0, cy = 0;
        if (b.parentId) { const p = pos.get(b.parentId); if (p) { cx = p.x; cy = p.y; } }
        const a = b.orbit.semiMajorAxis;
        if (a > 0) {
          const e = b.orbit.eccentricity;
          const th = b.orbit.trueAnomaly + T * orbitalSpeed(b);
          const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
          const lx = r * Math.cos(th), ly = r * Math.sin(th);
          const ap = b.orbit.argumentOfPeriapsis || 0;
          cx += lx * Math.cos(ap) - ly * Math.sin(ap);
          cy += lx * Math.sin(ap) + ly * Math.cos(ap);
        }
        pos.set(b.id, { x: cx, y: cy });
      }

      // --- Camera ---
      const C = cam.current, TG = target.current;
      if (U.focusedId) { const fp = pos.get(U.focusedId); if (fp) { TG.x = fp.x; TG.y = fp.y; } }
      const k = 1 - Math.exp(-dt * 6);
      C.x += (TG.x - C.x) * k;
      C.y += (TG.y - C.y) * k;
      C.zoom = Math.exp(Math.log(C.zoom) + (Math.log(TG.zoom) - Math.log(C.zoom)) * k);
      const Z = C.zoom;
      const toX = (wx: number) => (wx - C.x) * Z + w / 2;
      const toY = (wy: number) => (wy - C.y) * Z + h / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop.draw(ctx, w, h, C.x * Z, C.y * Z, time, Z / fitZoom.current);

      const starPos = pos.get('star-1') ?? { x: 0, y: 0 };
      const S = screen.current;
      S.clear();

      // --- Zones & protoplanetary disk (world space) ---
      if (primary && (U.zonesOn || systemAge <= 0.3)) {
        ctx.save();
        ctx.translate(toX(0), toY(0));
        ctx.scale(Z, Z);
        const sData = STAR_DATA[primary.starClass!];
        const farthest = Math.max(...planets.map(b => b.orbit.semiMajorAxis), sData.hzOut * AU_TO_PX * 3);
        if (systemAge <= 0.3) {
          const dust = Math.max(0, 1 - systemAge / 0.3);
          const R = farthest * 1.2;
          const g = ctx.createRadialGradient(0, 0, primary.radius * 2, 0, 0, R);
          g.addColorStop(0, `rgba(220,140,80,${0.22 * dust})`);
          g.addColorStop(0.35, `rgba(170,110,80,${0.14 * dust})`);
          g.addColorStop(0.7, `rgba(110,80,90,${0.07 * dust})`);
          g.addColorStop(1, 'rgba(50,40,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        }
        if (U.zonesOn) {
          const hzIn = sData.hzIn * AU_TO_PX, hzOut = sData.hzOut * AU_TO_PX;
          const hot = ctx.createRadialGradient(0, 0, 0, 0, 0, hzIn);
          hot.addColorStop(0, 'rgba(255,60,0,0.22)'); hot.addColorStop(1, 'rgba(255,80,0,0.03)');
          ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(0, 0, hzIn, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(40,255,120,0.09)';
          ctx.beginPath(); ctx.arc(0, 0, hzOut, 0, Math.PI * 2); ctx.arc(0, 0, hzIn, 0, Math.PI * 2, true); ctx.fill();
          const cold = ctx.createRadialGradient(0, 0, hzOut, 0, 0, farthest * 1.5);
          cold.addColorStop(0, 'rgba(0,120,255,0.02)'); cold.addColorStop(1, 'rgba(0,80,220,0.12)');
          ctx.fillStyle = cold;
          ctx.beginPath(); ctx.arc(0, 0, farthest * 1.5, 0, Math.PI * 2); ctx.arc(0, 0, hzOut, 0, Math.PI * 2, true); ctx.fill();
          ctx.lineWidth = 1.5 / Z;
          ctx.setLineDash([8 / Z, 6 / Z]);
          ctx.strokeStyle = 'rgba(255,110,40,0.35)'; ctx.beginPath(); ctx.arc(0, 0, hzIn, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(60,255,130,0.35)'; ctx.beginPath(); ctx.arc(0, 0, hzOut, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // --- Screen radius helpers ---
      // Exaggerate sizes when zoomed out (stylised map) and converge to true scale at zoom 1
      const visZ = Math.max(Z, Math.pow(Z, 0.4));
      const planetR = (b: CelestialBody) => Math.max(b.radius * (b.type === 'moon' ? Z : visZ), b.type === 'moon' ? 1.3 : 2.4);
      const moonVisible = (m: CelestialBody) => {
        const parent = byId.get(m.parentId!);
        return !!parent && m.orbit.semiMajorAxis * Z > planetR(parent) + 3;
      };

      // --- Orbits + motion trails ---
      if (U.orbitsOn) {
        ctx.lineWidth = 1;
        for (const b of [...planets, ...moons, ...comets, ...stars]) {
          const a = b.orbit.semiMajorAxis;
          if (a === 0) continue;
          if (b.type === 'moon' && !moonVisible(b)) continue;
          const parent = b.parentId ? pos.get(b.parentId) : undefined;
          const px = parent?.x ?? 0, py = parent?.y ?? 0;
          const e = b.orbit.eccentricity, ap = b.orbit.argumentOfPeriapsis || 0;
          const cxw = px - a * e * Math.cos(ap), cyw = py - a * e * Math.sin(ap);
          const rx = a * Z, ry = a * Math.sqrt(1 - e * e) * Z;
          if (rx < 3 || rx > 2e5) continue;
          const isFocus = U.focusedId === b.id || U.hoveredId === b.id;
          let col = b.type === 'moon' ? '150,160,190' : b.isHabitable ? '90,255,160' : b.type === 'comet' ? '160,220,255' : '130,160,255';
          if (b.type === 'star') col = '255,220,150';
          ctx.strokeStyle = `rgba(${col},${isFocus ? 0.55 : b.type === 'comet' ? 0.08 : b.type === 'moon' ? 0.12 : 0.16})`;
          if (b.type === 'comet') ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.ellipse(toX(cxw), toY(cyw), rx, ry, ap, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Fading trail behind planets
          if (b.type === 'planet' || (b.type === 'moon' && rx > 30)) {
            const th0 = b.orbit.trueAnomaly + T * orbitalSpeed(b);
            const [tr, tg, tb] = hexToRgb(b.baseColor);
            const SEG = 18, span = 0.55;
            let lxp = 0, lyp = 0;
            for (let s = 0; s <= SEG; s++) {
              const th = th0 - (s / SEG) * span;
              const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
              const ox = r * Math.cos(th), oy = r * Math.sin(th);
              const X = toX(px + ox * Math.cos(ap) - oy * Math.sin(ap));
              const Y = toY(py + ox * Math.sin(ap) + oy * Math.cos(ap));
              if (s > 0) {
                ctx.strokeStyle = `rgba(${tr},${tg},${tb},${(1 - s / SEG) * 0.55})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(lxp, lyp); ctx.lineTo(X, Y); ctx.stroke();
              }
              lxp = X; lyp = Y;
            }
            ctx.lineWidth = 1;
          }
        }
      }

      // --- Stars ---
      for (const s of stars) {
        const p = pos.get(s.id)!;
        const X = toX(p.x), Y = toY(p.y);
        const r = Math.max(s.radius * Math.max(Z, Math.pow(Z, 0.4)), 5);
        S.set(s.id, { x: X, y: Y, r, visible: true });
        if (X < -r * 10 || X > w + r * 10 || Y < -r * 10 || Y > h + r * 10) continue;
        const base = hexToRgb(s.baseColor);
        const grey = 40;
        const rgb: RGB = [base[0] + (grey - base[0]) * starAgeDim, base[1] + (grey - base[1]) * starAgeDim, base[2] + (grey - base[2]) * starAgeDim];
        const life = 1 - starAgeDim;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (life > 0.02) {
          ctx.globalAlpha = 0.55 * life;
          const G1 = r * 9;
          ctx.drawImage(glowSprite(base, 1.8), X - G1, Y - G1, G1 * 2, G1 * 2);
          ctx.globalAlpha = 0.85 * life;
          const G2 = r * 2.6;
          ctx.drawImage(glowSprite(base, 2.6), X - G2, Y - G2, G2 * 2, G2 * 2);
          ctx.globalAlpha = 0.5 * life;
          const rays = starRaysSprite(base, s.id);
          const RR = r * 6.5 * (1 + 0.04 * Math.sin(time * 1.7));
          ctx.translate(X, Y);
          ctx.rotate(time * 0.03);
          ctx.drawImage(rays, -RR, -RR, RR * 2, RR * 2);
          ctx.rotate(-time * 0.07);
          ctx.globalAlpha = 0.3 * life;
          ctx.drawImage(rays, -RR * 0.8, -RR * 0.8, RR * 1.6, RR * 1.6);
        }
        ctx.restore();
        // Photosphere with cross-faded granulation frames
        const frames = starFrames.get(s.id)!;
        const ft = time * 2.5;
        const f0 = Math.floor(ft) % frames.length, f1 = (f0 + 1) % frames.length, fa = ft - Math.floor(ft);
        ctx.save();
        ctx.drawImage(frames[f0], X - r, Y - r, r * 2, r * 2);
        ctx.globalAlpha = fa;
        ctx.drawImage(frames[f1], X - r, Y - r, r * 2, r * 2);
        if (starAgeDim > 0) {
          ctx.globalAlpha = starAgeDim * 0.85;
          ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
          ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // --- Asteroids ---
      if (asteroids.length) {
        ctx.fillStyle = 'rgba(170,160,150,0.7)';
        for (let i = 0; i < asteroids.length; i++) {
          const b = asteroids[i];
          const p = pos.get(b.id)!;
          const X = toX(p.x), Y = toY(p.y);
          if (X < -10 || X > w + 10 || Y < -10 || Y > h + 10) continue;
          const r = b.radius * Z;
          if (r < 1.1) ctx.fillRect(X, Y, r < 0.5 ? 1 : 1.5, r < 0.5 ? 1 : 1.5);
          else {
            const spr = asteroidSprites[i % asteroidSprites.length];
            const d = r * 2.6;
            ctx.drawImage(spr, X - d / 2, Y - d / 2, d, d);
          }
        }
      }

      // --- Comets (coma + dust tail + ion tail, pointing away from the star) ---
      for (const c of comets) {
        const p = pos.get(c.id)!;
        const X = toX(p.x), Y = toY(p.y);
        const dx = p.x - starPos.x, dy = p.y - starPos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        const tailWorld = Math.min(900, (AU_TO_PX * AU_TO_PX * 0.35) / dist);
        const L = Math.max(10, tailWorld * Z);
        S.set(c.id, { x: X, y: Y, r: Math.max(3, c.radius * Z), visible: true });
        if (X < -L && X > w + L) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // dust tail: curved, wider, warm
        const bend = 0.25;
        const ex = X + (ux + -uy * bend) * L, ey = Y + (uy + ux * bend) * L;
        const g1 = ctx.createLinearGradient(X, Y, ex, ey);
        g1.addColorStop(0, 'rgba(255,240,210,0.5)'); g1.addColorStop(1, 'rgba(255,220,180,0)');
        ctx.fillStyle = g1;
        const wd = Math.max(2, L * 0.12);
        ctx.beginPath();
        ctx.moveTo(X - uy * 2, Y + ux * 2);
        ctx.quadraticCurveTo(X + ux * L * 0.5 - uy * wd * 0.5, Y + uy * L * 0.5 + ux * wd * 0.5, ex - uy * wd, ey + ux * wd);
        ctx.lineTo(ex + uy * wd * 0.3, ey - ux * wd * 0.3);
        ctx.quadraticCurveTo(X + ux * L * 0.5, Y + uy * L * 0.5, X + uy * 2, Y - ux * 2);
        ctx.fill();
        // ion tail: straight, thin, blue
        const g2 = ctx.createLinearGradient(X, Y, X + ux * L * 1.4, Y + uy * L * 1.4);
        g2.addColorStop(0, 'rgba(120,200,255,0.7)'); g2.addColorStop(1, 'rgba(80,160,255,0)');
        ctx.strokeStyle = g2; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + ux * L * 1.4, Y + uy * L * 1.4); ctx.stroke();
        const cg = Math.max(4, Math.min(24, L * 0.08));
        ctx.drawImage(glowSprite([200, 240, 255], 2), X - cg, Y - cg, cg * 2, cg * 2);
        ctx.restore();
        ctx.fillStyle = '#eaffff';
        ctx.beginPath(); ctx.arc(X, Y, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // --- Planets & moons ---
      const drawBody = (b: CelestialBody) => {
        const p = pos.get(b.id)!;
        const X = toX(p.x), Y = toY(p.y);
        const r = planetR(b);
        const ringPad = b.hasRings ? 3.2 : 1.6;
        const vis = !(X < -r * ringPad || X > w + r * ringPad || Y < -r * ringPad || Y > h + r * ringPad);
        S.set(b.id, { x: X, y: Y, r, visible: vis });
        if (!vis) return;
        const dx = starPos.x - p.x, dy = starPos.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const light: [number, number, number] = [(dx / d) * 0.93, (dy / d) * 0.93, 0.37];
        const spr = sprites.get(b.id);
        if (spr && r >= 3) {
          spr.draw(ctx, X, Y, r, sim.current.spin, light, 1, dpr);
        } else {
          ctx.fillStyle = b.baseColor;
          ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
        }
        if (b.isForming) {
          ctx.strokeStyle = `rgba(255,110,20,${0.35 + Math.sin(time * 4) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(X, Y, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
      };
      for (const b of planets) drawBody(b);
      for (const m of moons) if (moonVisible(m)) drawBody(m);

      // --- Labels ---
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (U.labelsOn) {
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        for (const b of [...stars, ...planets, ...moons]) {
          const sb = S.get(b.id);
          if (!sb || !sb.visible) continue;
          if (b.type === 'moon' && !(U.focusedId === b.parentId || U.focusedId === b.id || sb.r > 5)) continue;
          if (b.type === 'star' && b.id !== 'star-1' && sb.r < 6) continue;
          const label = b.type === 'moon' ? b.name.split(' ').pop()! : b.name;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillText(label, sb.x + 1, sb.y + sb.r * (b.hasRings ? 1.6 : 1) + 7);
          ctx.fillStyle = b.isHabitable ? 'rgba(140,255,190,0.95)' : b.type === 'moon' ? 'rgba(200,205,220,0.75)' : 'rgba(235,240,255,0.9)';
          ctx.fillText(label, sb.x, sb.y + sb.r * (b.hasRings ? 1.6 : 1) + 6);
        }
      }

      // --- Focus brackets & hover ring ---
      const bracket = (id: string, color: string, spin: boolean) => {
        const sb = S.get(id);
        if (!sb) return;
        const R = sb.r * (byId.get(id)?.hasRings ? 1.9 : 1) + 9;
        ctx.save();
        ctx.translate(sb.x, sb.y);
        if (spin) ctx.rotate(time * 0.6);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        for (let q = 0; q < 4; q++) {
          ctx.beginPath();
          ctx.arc(0, 0, R, q * Math.PI / 2 + 0.2, q * Math.PI / 2 + Math.PI / 2 - 0.2);
          ctx.stroke();
        }
        ctx.restore();
      };
      if (U.hoveredId && U.hoveredId !== U.focusedId) {
        bracket(U.hoveredId, 'rgba(255,255,255,0.45)', false);
        const hb = byId.get(U.hoveredId), sb = S.get(U.hoveredId);
        if (hb && sb) {
          const sub = hb.type === 'star' ? (STAR_CLASS_NAMES[hb.starClass!] ?? 'Estrela') : hb.planetConfig ? (PLANET_TYPE_NAMES[hb.planetConfig.planetType] ?? '') : hb.type === 'comet' ? 'Cometa' : 'Lua rochosa';
          ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
          const tw = Math.max(ctx.measureText(hb.name).width, sub.length * 6.2) + 20;
          const bx = Math.min(w - tw - 4, Math.max(4, sb.x - tw / 2)), by = sb.y - sb.r - 50;
          ctx.fillStyle = 'rgba(8,10,20,0.85)';
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.beginPath(); ctx.roundRect(bx, by, tw, 36, 8); ctx.fill(); ctx.stroke();
          ctx.textAlign = 'left';
          ctx.fillStyle = '#fff'; ctx.fillText(hb.name, bx + 10, by + 5);
          ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
          ctx.fillStyle = hb.isHabitable ? '#6ee7b7' : '#a3a3a3'; ctx.fillText(sub, bx + 10, by + 21);
          ctx.textAlign = 'center';
        }
      }
      if (U.focusedId) bracket(U.focusedId, 'rgba(120,255,200,0.85)', true);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bodies, byId, sprites, backdrop, primary, systemAge]);

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ down: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, pinch: 0 });

  const clampZoom = (z: number) => Math.max(fitZoom.current * 0.2, Math.min(80, z));

  const zoomAt = (factor: number, mx: number, my: number) => {
    const { w, h } = size.current;
    const C = cam.current, TG = target.current;
    const nz = clampZoom(TG.zoom * factor);
    if (ui.current.focusedId) { TG.zoom = nz; return; }
    // keep the world point under the cursor fixed
    const wx = C.x + (mx - w / 2) / C.zoom, wy = C.y + (my - h / 2) / C.zoom;
    C.zoom = nz; TG.zoom = nz;
    C.x = TG.x = wx - (mx - w / 2) / nz;
    C.y = TG.y = wy - (my - h / 2) / nz;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hitTest = (mx: number, my: number): string | null => {
    let best: string | null = null, bestD = Infinity;
    screen.current.forEach((sb, id) => {
      if (!sb.visible) return;
      const d = Math.hypot(sb.x - mx, sb.y - my);
      const hr = Math.max(sb.r + 4, 12);
      if (d <= hr && d < bestD) { best = id; bestD = d; }
    });
    return best;
  };

  const focusBody = (id: string | null) => {
    setFocusedId(id);
    if (!id) return;
    const b = byId.get(id);
    if (!b) return;
    const { w, h } = size.current;
    const m = Math.min(w, h);
    let z: number;
    if (b.type === 'star') z = fitZoom.current * 3;
    else {
      const moons = moonsOf.get(id) ?? [];
      const reach = moons.length ? Math.max(...moons.map(x => x.orbit.semiMajorAxis * (1 + x.orbit.eccentricity))) + b.radius : b.radius * 6;
      z = (m * 0.36) / reach;
    }
    target.current.zoom = clampZoom(z);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (pointers.current.size === 1) {
      Object.assign(d, { down: true, moved: false, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      d.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      d.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;

    if (pointers.current.size === 2 && d.pinch > 0) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(dist / d.pinch, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      d.pinch = dist;
      return;
    }
    if (d.down) {
      const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
        d.moved = true;
        if (ui.current.focusedId) setFocusedId(null);
        ui.current.focusedId = null;
      }
      if (d.moved) {
        const C = cam.current, TG = target.current;
        C.x -= dx / C.zoom; C.y -= dy / C.zoom;
        TG.x = C.x; TG.y = C.y; TG.zoom = C.zoom;
      }
      d.lx = e.clientX; d.ly = e.clientY;
      return;
    }
    const hit = hitTest(mx, my);
    ui.current.hoveredId = hit;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (pointers.current.size === 0) {
      if (d.down && !d.moved) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) focusBody(hit);
      }
      d.down = false;
      d.pinch = 0;
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || viewingSurface) return;
      const { w, h } = size.current;
      if (e.code === 'Space') { e.preventDefault(); setPaused(p => !p); }
      else if (e.key === 'Escape') setFocusedId(null);
      else if (e.key === '+' || e.key === '=') zoomAt(1.25, w / 2, h / 2);
      else if (e.key === '-') zoomAt(0.8, w / 2, h / 2);
      else if (e.key.toLowerCase() === 'f') { setFocusedId(null); ui.current.focusedId = null; fitSystem(); }
      else if (e.key.toLowerCase() === 'o') setOrbitsOn(v => !v);
      else if (e.key.toLowerCase() === 'l') setLabelsOn(v => !v);
      else if (e.key.toLowerCase() === 'z') setZonesOn(v => !v);
      else if (/^[1-9]$/.test(e.key)) {
        const planets = bodies.filter(b => b.type === 'planet');
        const p = planets[parseInt(e.key) - 1];
        if (p) focusBody(p.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodies, viewingSurface]);

  const focused = focusedId ? byId.get(focusedId) ?? null : null;
  const years = Math.floor(clockDays / 365.25);
  const days = Math.floor(clockDays % 365.25);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { ui.current.hoveredId = null; }}
      />

      {/* Time & view controls */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[118px] sm:bottom-[128px] z-20 flex items-center gap-1 bg-black/55 backdrop-blur-md border border-white/10 rounded-full px-2 py-1.5 shadow-2xl">
        <HudButton onClick={() => setPaused(p => !p)} title="Pausar (Espaço)" active={paused}>
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </HudButton>
        {SPEEDS.map(s => (
          <button key={s} onClick={() => { setSpeed(s); setPaused(false); }}
            className={`px-2 py-1 rounded-full text-[11px] font-mono font-bold transition-colors ${speed === s && !paused ? 'bg-emerald-500/25 text-emerald-300' : 'text-neutral-400 hover:text-white'}`}>
            {s}×
          </button>
        ))}
        <div className="hidden sm:block text-[11px] font-mono text-neutral-300 px-2 min-w-[118px] text-center tabular-nums">
          Ano {years} · Dia {days}
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <HudButton onClick={() => setOrbitsOn(v => !v)} title="Órbitas (O)" active={orbitsOn}><Orbit className="w-4 h-4" /></HudButton>
        <HudButton onClick={() => setLabelsOn(v => !v)} title="Nomes (L)" active={labelsOn}><Tag className="w-4 h-4" /></HudButton>
        <HudButton onClick={() => setZonesOn(v => !v)} title="Zonas térmicas (Z)" active={zonesOn}><Thermometer className="w-4 h-4" /></HudButton>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <HudButton onClick={() => zoomAt(0.75, size.current.w / 2, size.current.h / 2)} title="Afastar (-)"><ZoomOut className="w-4 h-4" /></HudButton>
        <span className="hidden sm:inline text-[10px] font-mono text-neutral-500 w-10 text-center tabular-nums">{zoomLabel < 10 ? zoomLabel.toFixed(1) : Math.round(zoomLabel)}×</span>
        <HudButton onClick={() => zoomAt(1.33, size.current.w / 2, size.current.h / 2)} title="Aproximar (+)"><ZoomIn className="w-4 h-4" /></HudButton>
        <HudButton onClick={() => { setFocusedId(null); ui.current.focusedId = null; fitSystem(); }} title="Visão geral (F)"><Maximize2 className="w-4 h-4" /></HudButton>
      </div>

      {/* Focused body details */}
      {focused && (
        <BodyDetails
          body={focused}
          bodies={bodies}
          onClose={() => setFocusedId(null)}
          onFocus={focusBody}
          onSurface={() => setViewingSurface(focused)}
        />
      )}

      {/* Body strip */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/85 to-black/30 backdrop-blur-sm border-t border-white/5 px-2 sm:px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar">
        {bodies.filter(b => b.type === 'star').map(star => (
          <button key={star.id} onClick={() => focusBody(star.id)}
            className={`flex items-center gap-2 flex-shrink-0 px-3 rounded-xl border transition-colors ${focusedId === star.id ? 'bg-amber-400/10 border-amber-300/40' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07]'}`}>
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: star.baseColor, boxShadow: `0 0 12px ${star.baseColor}` }} />
            <span className="font-bold text-sm text-white whitespace-nowrap">{star.name}</span>
          </button>
        ))}
        <div className="w-px bg-white/10 mx-1 flex-shrink-0" />
        {bodies.filter(b => b.type === 'planet').map((planet, i) => {
          const moons = moonsOf.get(planet.id) ?? [];
          return (
            <div key={planet.id} className={`flex flex-col flex-shrink-0 rounded-xl p-1.5 border transition-colors ${focusedId === planet.id ? 'bg-emerald-400/10 border-emerald-300/30' : 'bg-white/[0.03] border-white/5 hover:border-white/15'}`}>
              <button onClick={() => focusBody(planet.id)} className="flex items-center gap-2 px-1.5 py-1 text-left">
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-black/60" style={{ background: `radial-gradient(circle at 35% 35%, ${planet.baseColor}, #000 110%)` }} />
                <span className="text-neutral-100 font-semibold whitespace-nowrap text-xs sm:text-sm">{planet.name}</span>
                {planet.isHabitable && <span className="text-[10px] text-emerald-300">●</span>}
                <span className="hidden sm:inline text-[9px] text-neutral-600 font-mono ml-1">{i + 1}</span>
              </button>
              {moons.length > 0 && (
                <div className="flex gap-1 flex-wrap px-1 max-w-[190px]">
                  {moons.map(moon => (
                    <button key={moon.id} onClick={() => focusBody(moon.id)}
                      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono transition-colors ${focusedId === moon.id ? 'bg-white/25 text-white' : 'bg-black/40 text-neutral-400 hover:text-white'}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moon.baseColor }} />
                      {moon.name.split(' ').pop()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingSurface && <SurfaceModal body={viewingSurface} onClose={() => setViewingSurface(null)} />}
    </div>
  );
}

function HudButton({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-full transition-colors ${active ? 'text-emerald-300 bg-emerald-400/15' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}>
      {children}
    </button>
  );
}

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string; key?: React.Key }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1.5">
      <span className="text-neutral-500 text-xs">{label}</span>
      <span className="font-mono text-neutral-100 text-xs text-right" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/60 font-bold mb-1">{title}</h3>
      {children}
    </div>
  );
}

function BodyDetails({ body, bodies, onClose, onFocus, onSurface }: {
  body: CelestialBody; bodies: CelestialBody[]; onClose: () => void; onFocus: (id: string) => void; onSurface: () => void;
}) {
  const primary = bodies.find(b => b.id === 'star-1');
  const moons = bodies.filter(b => b.parentId === body.id && b.type === 'moon');
  const pc = body.planetConfig;
  const distAu = (body.type === 'moon' ? (bodies.find(b => b.id === body.parentId)?.orbit.semiMajorAxis ?? 0) : body.orbit.semiMajorAxis) / AU_TO_PX;
  const periodDays = body.orbit.semiMajorAxis > 0 ? ticksToDays((Math.PI * 2) / orbitalSpeed(body)) : 0;

  let zone = '—', zoneColor = '#888';
  if (primary && body.type !== 'star') {
    const sd = STAR_DATA[primary.starClass!];
    if (distAu < sd.hzIn) { zone = 'Zona Quente'; zoneColor = '#ff8a4c'; }
    else if (distAu <= sd.hzOut) { zone = 'Zona Habitável'; zoneColor = '#4ade80'; }
    else { zone = 'Zona Fria'; zoneColor = '#60a5fa'; }
  }

  const subtitle = body.type === 'star' ? (STAR_CLASS_NAMES[body.starClass ?? ''] ?? 'Estrela')
    : pc ? PLANET_TYPE_NAMES[pc.planetType] ?? pc.planetType
    : body.type === 'moon' ? 'Lua rochosa' : body.type;
  const desc = body.type === 'star'
    ? `Estrela ${STAR_CLASS_NAMES[body.starClass ?? ''] ?? ''}. ${body.starClass === 'G' ? 'Similar ao nosso Sol, fornece calor e luz moderados.' : body.starClass === 'M' ? 'Pequena e fria, com uma zona habitável muito próxima.' : body.starClass === 'O' || body.starClass === 'B' ? 'Extremamente quente e luminosa, com vida curta e intensa.' : 'Irradia energia constante sobre seus mundos.'}`
    : pc ? PLANET_TYPE_DESCRIPTIONS[pc.planetType] ?? '' : 'Pequeno corpo rochoso e sem ar, marcado por crateras antigas.';

  const stats = bodyStats(body);

  return (
    <div className="absolute z-30 top-16 right-2 sm:right-4 left-2 sm:left-auto sm:w-[340px] bottom-[170px] sm:bottom-auto sm:max-h-[calc(100%-240px)] flex flex-col bg-[#070a12]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_80px_rgba(0,0,0,0.7)] overflow-hidden">
      <div className="relative p-4 pb-3 border-b border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full text-neutral-500 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        <div className="flex items-center gap-3">
          <PlanetPreview body={body} size={84} />
          <div className="min-w-0">
            <h2 className="font-black text-lg text-white leading-tight truncate">{body.name}</h2>
            <div className="text-xs text-neutral-400">{subtitle}</div>
            {body.isHabitable && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2 py-0.5">● Vida detectada</div>}
            {body.isForming && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-300 bg-orange-400/10 border border-orange-400/30 rounded-full px-2 py-0.5">Em formação</div>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        <p className="text-xs text-neutral-400 leading-relaxed mt-3">{desc}</p>

        <Section title="Leitura do Scanner">
          {stats.map(s => <Row key={s.label} label={s.label} value={s.value} color={s.color} />)}
        </Section>

        {body.type !== 'star' && body.orbit.semiMajorAxis > 0 && (
          <Section title="Órbita">
            <Row label={body.type === 'moon' ? 'Distância da estrela' : 'Semi-eixo maior'} value={`${distAu.toFixed(2)} UA`} />
            <Row label="Excentricidade" value={body.orbit.eccentricity.toFixed(3)} />
            <Row label="Período orbital" value={periodDays > 700 ? `${(periodDays / 365.25).toFixed(1)} anos` : `${periodDays.toFixed(1)} dias`} />
            <Row label="Zona térmica" value={zone} color={zoneColor} />
          </Section>
        )}

        {pc && (
          <Section title="Superfície">
            <Row label="Tamanho" value={`${pc.planetSize.toFixed(2)} R⊕`} />
            {pc.planetType !== 'gas-giant' && <Row label="Nível do mar" value={`${(pc.seaLevel * 100).toFixed(0)}%`} />}
            <Row label="Vulcanismo" value={pc.volcanicActivity > 0.6 ? 'Intenso' : pc.volcanicActivity > 0.3 ? 'Moderado' : 'Baixo'} />
            <Row label="Crateras" value={pc.craterDensity > 0.7 ? 'Alta densidade' : pc.craterDensity > 0.3 ? 'Média' : 'Baixa'} />
            <Row label="Anéis" value={body.hasRings ? 'Sim' : 'Não'} />
          </Section>
        )}

        {moons.length > 0 && (
          <Section title={`Luas (${moons.length})`}>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {moons.map(m => (
                <button key={m.id} onClick={() => onFocus(m.id)} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/10 text-left">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: `radial-gradient(circle at 35% 35%, ${m.baseColor}, #000 120%)` }} />
                  <span className="text-xs text-neutral-300 truncate">{m.name.split(' ').pop()}</span>
                  <span className="text-[9px] text-neutral-500 ml-auto truncate">{m.planetConfig ? (PLANET_TYPE_NAMES[m.planetConfig.planetType] ?? '').split(' ')[0] : 'Rochosa'}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      {pc && (
        <div className="p-3 border-t border-white/5 bg-black/40">
          <button onClick={onSurface}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
            <Globe2 className="w-4 h-4" /> Explorar Superfície
          </button>
        </div>
      )}
    </div>
  );
}
