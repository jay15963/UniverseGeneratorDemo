// Cinematic versions of the universe, galaxy and solar-system maps: the same generators and sprites as the game's
// viewers, but drawn from a scripted camera (no UI) so the trailer can fly from the whole universe down to one planet.
import { UniverseGenerator } from '../../lib/universe/generator';
import { UniverseGalaxyMetadata } from '../../lib/universe/types';
import { GalaxyGenerator } from '../../lib/galaxy/generator';
import { GalaxyConfig, GalaxyShape, StellarSystemMetadata } from '../../lib/galaxy/types';
import { SolarSystemGenerator } from '../../lib/solar-system/generator';
import { CelestialBody } from '../../lib/solar-system/types';
import { PlanetConfig, PlanetType } from '../../lib/planet-generator/generator';
import { galaxySprite, peekGalaxySprite, cssColorToRgb, glowSprite, starRaysSprite, starSurfaceFrames, RGB } from '../../lib/render/celestialSprites';
import { bakeGalaxyGlow } from '../../lib/render/galaxyGlow';
import { SpaceBackdrop } from '../../lib/render/spaceBackdrop';
import { BodySprite } from '../../lib/render/bodySprite';
import { hexToRgb } from '../../lib/render/planetSphere';
import { mulberry, seedToInt } from '../../lib/terrain/noise';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** exponential zoom between two scales (perceived speed stays constant) */
export const zoomLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

// ---------------------------------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------------------------------
export class UniverseScene {
  readonly galaxies: UniverseGalaxyMetadata[];
  readonly LR: number;
  private backdrop: SpaceBackdrop;
  /** the spiral galaxy the camera dives into */
  readonly target: UniverseGalaxyMetadata;

  constructor(seed: string) {
    const maxGalaxies = 3000;
    this.galaxies = new UniverseGenerator({ seed, age: 0.55, maxGalaxies }).generate();
    this.LR = Math.max(10000, Math.sqrt(maxGalaxies) * 200) * 1.5;
    this.backdrop = new SpaceBackdrop({ seed: seed + '_cosmos', nebula: 0.3, density: 0.18, hues: [230, 280, 200], dim: 0.35 });
    // a big, living spiral not far from the centre of the frame
    const spirals = this.galaxies.filter(g => !g.isDead && (g.shape === GalaxyShape.SPIRAL || g.shape === GalaxyShape.BARRED_SPIRAL));
    const score = (g: UniverseGalaxyMetadata) => g.size * 2 - Math.hypot(g.x, g.y) / this.LR * 3;
    this.target = (spirals.length ? spirals : this.galaxies).reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  private warmed = 0;
  /** Bakes the galaxy sprites a few at a time (call every frame before the universe is shown). true when done. */
  warm(n: number) {
    for (const end = Math.min(this.galaxies.length, this.warmed + n); this.warmed < end; this.warmed++) {
      const g = this.galaxies[this.warmed];
      const hsh = Math.abs(Math.sin(g.x * 12.9898 + g.y * 78.233) * 43758.5453), frac = hsh - Math.floor(hsh);
      galaxySprite(g.shape, cssColorToRgb(g.baseColor), Math.floor(((frac * 13.7) % 1) * 6));
    }
    return this.warmed >= this.galaxies.length;
  }

  /** scale at which the target galaxy fills `frac` of the short side */
  fillScale(w: number, h: number, frac: number) {
    const ratio = Math.min(w, h) / 2 / this.LR;
    return (Math.min(w, h) * frac) / (this.target.size * 30 * ratio * 2.2);
  }

  /** cx/cy: camera centre in universe units; scale as in the game's viewer */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, cx: number, cy: number, scale: number) {
    const ratio = Math.min(w, h) / 2 / this.LR;
    this.backdrop.draw(ctx, w, h, cx * ratio * scale * 0.5, cy * ratio * scale * 0.5, t, scale / 2);
    ctx.save();
    ctx.translate(w / 2 - cx * ratio * scale, h / 2 - cy * ratio * scale);
    ctx.scale(scale, scale);
    const hw = w / 2 / scale + 60, hh = h / 2 / scale + 60, vx = cx * ratio, vy = cy * ratio;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    const t0 = performance.now();
    for (const g of this.galaxies) {
      const x = g.x * ratio, y = g.y * ratio;
      const R = g.size * 30 * ratio * 2.2;
      if (x + R < vx - hw || x - R > vx + hw || y + R < vy - hh || y - R > vy + hh) continue;
      const hsh = Math.abs(Math.sin(g.x * 12.9898 + g.y * 78.233) * 43758.5453);
      const frac = hsh - Math.floor(hsh);
      const incl = 0.22 + ((frac * 7.31) % 1) * 0.78;
      // sprites are baked within a small time budget per frame; until then a soft glow stands in
      const rgb = cssColorToRgb(g.baseColor), variant = Math.floor(((frac * 13.7) % 1) * 6);
      let sprite = peekGalaxySprite(g.shape, rgb, variant);
      if (!sprite && performance.now() - t0 < 5) sprite = galaxySprite(g.shape, rgb, variant);
      if (!sprite) {
        ctx.globalAlpha = g.isDead ? 0.15 : 0.6;
        ctx.drawImage(glowSprite(rgb, 2), x - R * 0.6, y - R * 0.6, R * 1.2, R * 1.2);
        continue;
      }
      ctx.globalAlpha = g.isDead ? 0.22 : 0.95;
      ctx.save();
      ctx.translate(x, y);
      // galaxies turn, ever so slowly
      ctx.rotate(frac * Math.PI * 2 + t * 0.01);
      ctx.scale(1, g.shape === GalaxyShape.ELLIPTICAL ? Math.max(0.6, incl) : incl);
      ctx.drawImage(sprite, -R, -R, R * 2, R * 2);
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------------
// Galaxy
// ---------------------------------------------------------------------------------------------------
export interface EarthStar { star: StellarSystemMetadata; bodies: CelestialBody[]; planet: CelestialBody }

export class GalaxyScene {
  readonly stars: StellarSystemMetadata[];
  readonly config: GalaxyConfig;
  readonly LR: number;
  private glow: HTMLCanvasElement | null;
  private backdrop: SpaceBackdrop;
  private groups = new Map<string, StellarSystemMetadata[]>();

  constructor(meta: UniverseGalaxyMetadata) {
    this.config = { seed: meta.galaxySeed, shape: meta.shape, age: meta.age, numStars: Math.min(meta.starCount, 5000), anomalyFactor: 0.5, radius: 400 };
    this.stars = new GalaxyGenerator(this.config).generate();
    this.LR = this.config.radius * 1.5;
    this.glow = this.stars.length ? bakeGalaxyGlow(this.stars, this.LR, this.config.radius, this.config.age, this.config.seed) : null;
    this.backdrop = new SpaceBackdrop({ seed: this.config.seed + '_intergalactic', nebula: 0.22, density: 0.7 });
    for (const s of this.stars) {
      if (s.starClass === 'BH') continue;
      if (!this.groups.has(s.baseColor)) this.groups.set(s.baseColor, []);
      this.groups.get(s.baseColor)!.push(s);
    }
  }

  /** A star with an Earth-like world, in the calm middle of the disc (tries the most habitable stars first). */
  findEarthStar(): EarthStar | null {
    const cand = this.stars.filter(s => s.starClass !== 'BH' && s.starClass !== 'NS' && s.starClass !== 'P')
      .sort((a, b) => b.habitability - a.habitability).slice(0, 400);
    for (const star of cand) {
      const bodies = new SolarSystemGenerator(star.config).generateSystem();
      const planet = bodies.find(b => b.type === 'planet' && b.planetConfig?.planetType === PlanetType.EARTH_LIKE);
      if (planet) return { star, bodies, planet };
    }
    return null;
  }

  /** rotated position of a star in view units (logical * ratio) */
  where(s: StellarSystemMetadata, w: number, h: number, rot: number) {
    const ratio = Math.min(w, h) / 2 / this.LR;
    const c = Math.cos(rot), n = Math.sin(rot);
    return { x: (s.x * c - s.y * n) * ratio, y: (s.x * n + s.y * c) * ratio };
  }

  /** cx/cy in view units (see `where`); `focus` gets a star glow that grows with the zoom */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, cx: number, cy: number, scale: number, rot: number, focus?: StellarSystemMetadata) {
    const ratio = Math.min(w, h) / 2 / this.LR;
    this.backdrop.draw(ctx, w, h, cx * scale * 2, cy * scale * 2, t, scale);
    ctx.save();
    ctx.translate(w / 2 - cx * scale, h / 2 - cy * scale);
    ctx.scale(scale, scale);
    ctx.rotate(rot);
    if (this.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = Math.max(0.22, 1 - (scale - 1) / 6);
      const E = this.LR * ratio;
      ctx.drawImage(this.glow, -E, -E, E * 2, E * 2);
      ctx.restore();
    }
    const size = Math.max(0.6 / scale, 1 / scale);
    for (const [color, list] of this.groups) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const s of list) { const x = s.x * ratio, y = s.y * ratio; ctx.moveTo(x + size, y); ctx.arc(x, y, size, 0, Math.PI * 2); }
      ctx.fill();
    }
    ctx.restore();
    if (focus) {
      const p = this.where(focus, w, h, rot);
      const X = (p.x - cx) * scale + w / 2, Y = (p.y - cy) * scale + h / 2;
      const rgb = cssColorToRgb(focus.baseColor);
      const r = 2 + Math.pow(scale, 0.75) * 0.9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite(rgb, 1.6), X - r * 6, Y - r * 6, r * 12, r * 12);
      ctx.drawImage(glowSprite([255, 250, 240], 3), X - r, Y - r, r * 2, r * 2);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Solar system
// ---------------------------------------------------------------------------------------------------
const orbitalSpeed = (b: CelestialBody) => {
  const a = b.orbit.semiMajorAxis;
  return (50 / Math.sqrt(Math.max(0.1, a * a * a))) * (b.type === 'moon' ? 0.02 : 0.15);
};

export class SystemScene {
  readonly bodies: CelestialBody[];
  private sprites = new Map<string, BodySprite>();
  private starFrames = new Map<string, HTMLCanvasElement[]>();
  private backdrop: SpaceBackdrop;
  readonly far: number;
  pos = new Map<string, { x: number; y: number }>();

  /** `surface`: replaces the planet config of `targetId` (so the sprite, the globe and the ground are one world) */
  constructor(bodies: CelestialBody[], targetId?: string, surface?: PlanetConfig) {
    this.bodies = bodies.map(b => (b.id === targetId && surface ? { ...b, planetConfig: surface, isHabitable: true } : b));
    let i = 0;
    for (const b of this.bodies) {
      if (b.type === 'planet' || b.type === 'moon') {
        const s = new BodySprite(b);
        s.requestTexture(b.id === targetId ? 200 : b.type === 'planet' ? 60 - i++ : 5);
        this.sprites.set(b.id, s);
      }
      if (b.type === 'star') this.starFrames.set(b.id, starSurfaceFrames(hexToRgb(b.baseColor), b.id + b.name, 192));
    }
    const primary = this.bodies.find(b => b.type === 'star');
    this.backdrop = new SpaceBackdrop({ seed: primary?.name ?? 'system', nebula: 0.55 });
    this.far = Math.max(300, ...this.bodies.filter(b => b.type === 'planet').map(b => b.orbit.semiMajorAxis * (1 + b.orbit.eccentricity)));
  }

  fitZoom(w: number, h: number) { return (Math.min(w, h) * 0.47) / this.far; }
  /** zoom at which a body is drawn with screen radius r */
  zoomForRadius(id: string, r: number) { const b = this.bodies.find(q => q.id === id)!; return r / b.radius; }

  /** orbital positions at simulation ticks T */
  update(T: number) {
    for (const b of this.bodies) {
      let cx = 0, cy = 0;
      if (b.parentId) { const p = this.pos.get(b.parentId); if (p) { cx = p.x; cy = p.y; } }
      const a = b.orbit.semiMajorAxis;
      if (a > 0) {
        const e = b.orbit.eccentricity, th = b.orbit.trueAnomaly + T * orbitalSpeed(b);
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
        const lx = r * Math.cos(th), ly = r * Math.sin(th), ap = b.orbit.argumentOfPeriapsis || 0;
        cx += lx * Math.cos(ap) - ly * Math.sin(ap);
        cy += lx * Math.sin(ap) + ly * Math.cos(ap);
      }
      this.pos.set(b.id, { x: cx, y: cy });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, T: number, cx: number, cy: number, Z: number) {
    const toX = (x: number) => (x - cx) * Z + w / 2, toY = (y: number) => (y - cy) * Z + h / 2;
    this.backdrop.draw(ctx, w, h, cx * Z, cy * Z, t, Z / this.fitZoom(w, h));
    const visZ = Math.max(Z, Math.pow(Z, 0.33));
    const planetR = (b: CelestialBody) => Math.max(b.radius * (b.type === 'moon' ? Z : visZ), b.type === 'moon' ? 1.3 : 3);
    // orbits
    ctx.lineWidth = 1;
    for (const b of this.bodies) {
      if (b.type !== 'planet') continue;
      const a = b.orbit.semiMajorAxis, e = b.orbit.eccentricity, ap = b.orbit.argumentOfPeriapsis || 0;
      const rx = a * Z, ry = a * Math.sqrt(1 - e * e) * Z;
      if (rx < 3 || rx > 2e5) continue;
      ctx.strokeStyle = `rgba(${b.isHabitable ? '90,255,160' : '130,160,255'},0.16)`;
      ctx.beginPath();
      ctx.ellipse(toX(-a * e * Math.cos(ap)), toY(-a * e * Math.sin(ap)), rx, ry, ap, 0, Math.PI * 2);
      ctx.stroke();
    }
    const star = this.pos.get('star-1') ?? { x: 0, y: 0 };
    for (const s of this.bodies) {
      if (s.type !== 'star') continue;
      const p = this.pos.get(s.id)!;
      const X = toX(p.x), Y = toY(p.y), r = Math.max(s.radius * Math.max(Z, Math.pow(Z, 0.4)), 5);
      if (X < -r * 12 || X > w + r * 12 || Y < -r * 12 || Y > h + r * 12) continue;
      const base = hexToRgb(s.baseColor) as RGB;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glowSprite(base, 1.8), X - r * 9, Y - r * 9, r * 18, r * 18);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glowSprite(base, 2.6), X - r * 2.6, Y - r * 2.6, r * 5.2, r * 5.2);
      ctx.globalAlpha = 0.5;
      const rays = starRaysSprite(base, s.id), RR = r * 6.5;
      ctx.translate(X, Y); ctx.rotate(t * 0.03);
      ctx.drawImage(rays, -RR, -RR, RR * 2, RR * 2);
      ctx.restore();
      const fr = this.starFrames.get(s.id)!;
      ctx.drawImage(fr[Math.floor(t * 2.5) % fr.length], X - r, Y - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(170,160,150,0.7)';
    for (const b of this.bodies) {
      if (b.type !== 'asteroid') continue;
      const p = this.pos.get(b.id)!, X = toX(p.x), Y = toY(p.y);
      if (X > -2 && X < w + 2 && Y > -2 && Y < h + 2) ctx.fillRect(X, Y, 1.5, 1.5);
    }
    for (const b of this.bodies) {
      if (b.type !== 'planet' && b.type !== 'moon') continue;
      if (b.type === 'moon') {
        const parent = this.bodies.find(q => q.id === b.parentId);
        if (!parent || b.orbit.semiMajorAxis * Z <= planetR(parent) + 3) continue;
      }
      const p = this.pos.get(b.id)!, X = toX(p.x), Y = toY(p.y), r = planetR(b);
      if (X < -r * 3 || X > w + r * 3 || Y < -r * 3 || Y > h + r * 3) continue;
      const dx = star.x - p.x, dy = star.y - p.y, d = Math.hypot(dx, dy) || 1;
      const spr = this.sprites.get(b.id);
      if (spr) spr.draw(ctx, X, Y, r, T * 4, [(dx / d) * 0.93, (dy / d) * 0.93, 0.37], 1, dpr);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Hyperspace jump (the game's transition, as a pure drawing function) and cloud fog
// ---------------------------------------------------------------------------------------------------
const STREAKS = (() => {
  const r = mulberry(seedToInt('hyperspace'));
  return Array.from({ length: 260 }, () => ({
    a: r() * Math.PI * 2, speed: 0.5 + r() * 2, dist: r() * 0.3, len: 20 + r() * 80, b: 0.3 + r() * 0.7, hue: r() > 0.8 ? 200 + r() * 60 : 0,
  }));
})();

/** p: 0..1. 'in' accelerates into a white flash; 'out' decelerates from it. */
export function drawHyperspace(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, dir: 'in' | 'out') {
  const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
  const e = dir === 'in' ? p * p * p : 1 - Math.pow(1 - p, 3);
  ctx.save();
  // streaks rush out of the centre
  ctx.fillStyle = `rgba(0,0,0,${dir === 'in' ? 0.35 * e : 0.35 * (1 - e)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (const s of STREAKS) {
    const d = s.dist * maxR + maxR * 1.5 * (dir === 'in' ? e : 1 - e * 0.6) * s.speed;
    const L = s.len * (0.5 + (dir === 'in' ? e : 1 - e) * 2.5);
    const alpha = s.b * (dir === 'in' ? e : 1 - e);
    if (alpha < 0.01) continue;
    ctx.strokeStyle = s.hue ? `hsla(${s.hue},80%,70%,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1 + (dir === 'in' ? e : 1 - e) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(s.a) * d, cy + Math.sin(s.a) * d);
    ctx.lineTo(cx + Math.cos(s.a) * (d - L), cy + Math.sin(s.a) * (d - L));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  const k = dir === 'in' ? Math.max(0, (p - 0.4) / 0.6) : 1 - p;
  if (k > 0) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * Math.max(0.05, dir === 'in' ? k : 1));
    g.addColorStop(0, `rgba(200,180,255,${k * 0.6})`);
    g.addColorStop(0.3, `rgba(100,80,200,${k * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const white = dir === 'in' ? Math.max(0, (p - 0.8) / 0.2) : Math.max(0, 1 - p / 0.35);
  if (white > 0) { ctx.fillStyle = `rgba(255,255,255,${white * 0.9})`; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

/** Soft cumulus texture (value-noise fbm) used to fly through the cloud deck. */
function bakeCloud(seed: number) {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!, img = x.createImageData(N, N);
  const r = mulberry(seed), G = 32, grid = Array.from({ length: G * G }, () => r());
  const val = (u: number, v: number) => {
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const s = (q: number) => q * q * (3 - 2 * q);
    const at = (a: number, b: number) => grid[((b % G) + G) % G * G + ((a % G) + G) % G];
    return lerp(lerp(at(i, j), at(i + 1, j), s(fu)), lerp(at(i, j + 1), at(i + 1, j + 1), s(fu)), s(fv));
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let f = 0, a = 0.5, fr = 4 / N;
    for (let o = 0; o < 5; o++) { f += val(i * fr, j * fr) * a; a *= 0.5; fr *= 2; }
    const d = Math.hypot(i - N / 2, j - N / 2) / (N / 2);
    const v = Math.max(0, Math.min(1, (f - 0.35) * 2.4)) * Math.max(0, 1 - d * d);
    const k = (j * N + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = v * 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
let clouds: HTMLCanvasElement[] | null = null;
/** bakes the cloud textures ahead of the dive */
export function warmFog() { if (!clouds) clouds = [1, 2, 3].map(bakeCloud); }

/** k: 0 = clear, 1 = inside the cloud (screen white). Puffs rush past the camera as k grows. */
export function drawCloudFog(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, t: number, tint: RGB = [235, 242, 255]) {
  if (k <= 0) return;
  if (!clouds) clouds = [1, 2, 3].map(bakeCloud);
  const m = Math.max(w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < 9; i++) {
    const ph = (i / 9 + k * 0.9 + t * 0.02) % 1; // each puff grows from the centre towards the edges
    const s = m * (0.3 + ph * ph * 2.6);
    const a = Math.sin(ph * Math.PI) * Math.min(1, k * 1.6);
    const ang = i * 2.39996, off = ph * m * 0.45;
    ctx.globalAlpha = a * 0.85;
    ctx.drawImage(clouds[i % 3], w / 2 + Math.cos(ang) * off - s / 2, h / 2 + Math.sin(ang) * off - s / 2, s, s);
  }
  const white = Math.max(0, (k - 0.55) / 0.45);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${white})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
