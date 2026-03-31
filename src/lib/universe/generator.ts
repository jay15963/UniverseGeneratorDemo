import { UniverseConfig, UniverseGalaxyMetadata } from './types';
import { GalaxyShape } from '../galaxy/types';
import seedrandom from 'seedrandom';

// A simple 2D Perlin / Value Noise for Cosmic Web distribution
class Noise2D {
  private p: Uint8Array;

  constructor(seed: number) {
    this.p = new Uint8Array(256);
    const rng = seedrandom(seed.toString());
    for (let i = 0; i < 256; i++) {
        this.p[i] = Math.floor(rng() * 256);
    }
  }

  private fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(t: number, a: number, b: number) { return a + t * (b - a); }
  private grad(hash: number, x: number, y: number) {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number) {
      let X = Math.floor(x) & 255;
      let Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = this.fade(x);
      const v = this.fade(y);
      const A = this.p[X] + Y;
      const B = this.p[X + 1] + Y;
      return this.lerp(v, 
          this.lerp(u, this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y)),
          this.lerp(u, this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1))
      ) * 0.5 + 0.5; // Normalized to 0.0 - 1.0
  }
}

export class UniverseGenerator {
  public config: UniverseConfig;
  private prng: seedrandom.PRNG;
  private numSeed: number;
  private noise: Noise2D;
  
  // Naming parts
  private static readonly G_PREFIXES = ['Andro','Magel','Triang','Centa','Fornax','Virgo','Sculp','Dorado','Leo','Lyra'];
  private static readonly G_SUFFIXES = ['meda','lanic','ulum','urus',' Cluster',' Major',' Minor',' Galaxy',' Stream',' Cloud'];

  constructor(config: UniverseConfig) {
    this.config = config;
    this.numSeed = [...config.seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    this.prng = seedrandom(config.seed);
    this.noise = new Noise2D(this.numSeed * 42);
  }

  private pick<T>(arr: readonly T[], rng: seedrandom.PRNG): T {
    return arr[Math.floor(rng() * arr.length)];
  }

  private generateGalaxyName(index: number): string {
    const rng = seedrandom(`${this.config.seed}-name-${index}`);
    const pre = this.pick(UniverseGenerator.G_PREFIXES, rng);
    const suf = this.pick(UniverseGenerator.G_SUFFIXES, rng);
    
    // Some galaxies have alphanumeric designations
    if (rng() > 0.6) {
       return `NGC ${Math.floor(rng() * 8000) + 1000}`;
    } else if (rng() > 0.8) {
       return `M${Math.floor(rng() * 110)}`;
    }
    
    return `${pre}${suf}`;
  }

  public generate(): UniverseGalaxyMetadata[] {
    const galaxies: UniverseGalaxyMetadata[] = [];
    const maxGalaxies = this.config.maxGalaxies;
    
    // Limit max logical radius of the universe based on galaxy count to keep density reasonable
    const universeRadius = Math.max(10000, Math.sqrt(maxGalaxies) * 200);

    // Reduction logic: If universe is dying (>0.9), cull the galaxy count
    let livingThreshold = 1.0;
    if (this.config.age >= 0.9) {
       // From 0.9 to 1.0, living drops from 1.0 to 0.0 (almost everything dies)
       livingThreshold = 1.0 - ((this.config.age - 0.9) * 10); 
    }

    // We use a quasi-random distribution based on the Cosmic Web (Noise)
    // To generate 100k O(N) fast: we just blindly generate random coordinates
    // and check against a coarse noise function. If it passes, it's a valid galaxy.
    // If noise is exceptionally high -> It's a "Collided" massive galaxy.

    // 0% -> Singularity (Nothing)
    if (this.config.age <= 0.01) {
       return galaxies; // Empty, handled by viewer for the bright flash
    }

    // Between 0.02 and 0.05 -> Dust phase (handled by Viewer). Few early galaxies.
    const spawnMultiplier = Math.min(1.0, (Math.max(0, this.config.age - 0.05)) * 5); // 0 at 0.05, 1.0 at 0.25

    if (spawnMultiplier <= 0) {
        return galaxies; // Too young for physical galaxies, just dust.
    }

    const targetCount = Math.floor(maxGalaxies * spawnMultiplier);

    // Pre-calculate to save ops inside loop
    const rSqBound = universeRadius * universeRadius;
    
    // We deterministically step through a sequence to find valid positions
    let coordsGenerated = 0;
    let index = 0;
    
    // Loop until we find our target galaxies
    while (coordsGenerated < targetCount && index < maxGalaxies * 5) { // Safety limit
       index++;
       
       // Deterministic placement
       const rRng = seedrandom(`${this.config.seed}-r-${index}`);
       const localPrng = seedrandom(`${this.config.seed}-g-${index}`);
       
       // Sqrt distribution for uniform spherical volume projected to 2D disc
       const rad = Math.sqrt(rRng()) * universeRadius;
       const ang = rRng() * Math.PI * 2;
       const x = Math.cos(ang) * rad;
       const y = Math.sin(ang) * rad;

       // Density check against Cosmic Web
       const noiseVal = this.noise.noise(x * 0.0003, y * 0.0003);
       
       if (noiseVal < 0.35) {
          continue; // Void area, skip creating galaxy here
       }

       // 1. WAVE EXPANSION AGE
       // Center was born first. Edges are born later.
       // Normalized dist (0 to 1) dictates birth time.
       const normDist = Math.max(0, Math.min(1, rad / universeRadius));
       // Max birth time is 0.7 (so edges don't start forming until universe is 70% old).
       const birthTime = normDist * 0.70; 
       
       if (this.config.age < birthTime) {
          continue; // This galaxy hasn't formed yet because the expansion wave hasn't reached it!
       }

       // Calculate its LOCAL relative age (how long it has existed)
       // If it just formed, it has 0 age. As universe ages, it ages.
       // Normalize this so localAge scales from 0.0 to 1.0 (death).
       // A galaxy lives roughly 0.3 to 0.5 universe time units.
       const galaxyLifespan = 0.3 + (localPrng() * 0.2); // Each galaxy lives fixed time
       let localAge = (this.config.age - birthTime) / galaxyLifespan;
       
       let isDead = false;
       if (localAge >= 1.0) {
           isDead = true;
           localAge = 1.0;
           // If universe is dying, physically remove it from array based on threshold to thin them out
           if (localPrng() > livingThreshold) {
               continue; // Culled completely.
           }
       }

       coordsGenerated++;

       // 2. MERGERS & COLLISIONS (Determined purely by structural Noise density)
       let isCollided = false;
       if (noiseVal > 0.75) {
          isCollided = true; // Density is so high here, mergers happened.
       }

       // 3. SHAPE EVOLUTION
       let shape = GalaxyShape.SPIRAL; // default
       if (isCollided) {
          if (localAge < 0.15) {
             shape = GalaxyShape.IRREGULAR; // Just collided
          } else if (localAge < 0.30) {
             shape = GalaxyShape.ELLIPTICAL; // Settling
          } else {
             // Settled into massive spiral/ring
             const shapeRoll = localPrng();
             if (shapeRoll < 0.6) shape = GalaxyShape.BARRED_SPIRAL;
             else if (shapeRoll < 0.8) shape = GalaxyShape.SPIRAL;
             else shape = GalaxyShape.RING;
          }
       } else {
          // Normal solitary galaxies
          const shapeRoll = localPrng();
          if (shapeRoll < 0.5) shape = GalaxyShape.SPIRAL;
          else if (shapeRoll < 0.7) shape = GalaxyShape.BARRED_SPIRAL;
          else if (shapeRoll < 0.85) shape = GalaxyShape.ELLIPTICAL;
          else if (shapeRoll < 0.95) shape = GalaxyShape.IRREGULAR; // Dwarf irregular
          else shape = GalaxyShape.RING;
       }

       // 4. SIZE AND STARS
       const baseSize = 0.5 + localPrng() * 1.5; // multiplier
       const sizeAmp = isCollided ? (1.5 + localPrng()) : 1.0; // Collided are 150-250% bigger
       const finalSize = baseSize * sizeAmp;

       // Base logical stars mapping (1000 - 15000 approx) 
       // This determines what the GalaxyGenerator inside will run with.
       const starCount = Math.floor(1000 + (finalSize * 3000)); 

       // 5. BASE COLOR (LOD 1) Redshift / Age Tint
       let hue = 0, sat = 0, lig = 0;
       if (isDead) {
           // Absolute dark/dead
           hue = localPrng() > 0.5 ? 240 : 260;
           sat = 15; lig = Math.floor(10 + localPrng() * 5);
       } else if (localAge < 0.1) {
           // Newborn / Redshifted (H: 340 to 15)
           hue = (340 + localPrng() * 35) % 360;
           sat = 90 + localPrng() * 10;
           lig = 50 + localPrng() * 15;
       } else if (localAge < 0.3) {
           // Young forming (H: 15 to 45)
           hue = 15 + localPrng() * 30;
           sat = 85 + localPrng() * 15;
           lig = 50 + localPrng() * 20;
       } else if (localAge < 0.7) {
           // Sweet spot (Blue/White/Purple) (H: 200 to 280)
           hue = 200 + localPrng() * 80;
           sat = 80 + localPrng() * 20;
           lig = 65 + localPrng() * 25;
       } else {
           // Old (Red Dwarfs dominating) (H: 350 to 10)
           hue = (350 + localPrng() * 20) % 360;
           sat = 60 + localPrng() * 20;
           lig = 35 + localPrng() * 15;
       }
       
       const baseColor = `hsl(${Math.floor(hue)}, ${Math.floor(sat)}%, ${Math.floor(lig)}%)`;

       galaxies.push({
           id: `UNI-GAL-${index}`,
           name: this.generateGalaxyName(index),
           x,
           y,
           size: finalSize,
           shape,
           starCount,
           age: localAge,
           baseColor,
           isDead,
           galaxySeed: `${this.config.seed}-GAL-${index}`
       });
    }

    return galaxies;
  }
}
