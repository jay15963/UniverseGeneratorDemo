import { 
  GalaxyConfig, 
  StellarSystemMetadata, 
  GalaxyShape 
} from './types';
import { SolarSystemConfig, StarClass } from '../solar-system/types';
import seedrandom from 'seedrandom';

// A simple 2D Perlin Noise / Value Noise class for anomalies
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

export class GalaxyGenerator {
  public config: GalaxyConfig;
  private prng: seedrandom.PRNG;
  private numSeed: number;
  private noise: Noise2D;
  public galaxyName: string = '';
  public smbhName: string = '';
  
  // Track center for rendering offsets (assume standard map is 2x radius width)
  public centerX: number = 0;
  public centerY: number = 0;

  // Syllable pools for procedural name generation
  private static readonly PREFIXES = ['Al','Vel','Zan','Kry','Tho','Vor','Nex','Sol','Aur','Eri','Cen','Ori','Dra','Lyr','Oph','Ser','Umi','Cas','And','Per','Pho','Tuc','Gru','Mus','Pav','Lup','Nor','Tel','Cir','Hor'];
  private static readonly MIDS = ['tha','vey','xen','dri','mus','lor','pha','nar','tel','gon','ris','ven','tar','mol','syn','kra','don','ber','cal','fin','jan','mer','val','wyn'];
  private static readonly SUFFIXES = ['ra','on','is','ax','um','ix','os','ia','us','ar','el','an','or','al','en','yr','as','es','ir','ur'];
  private static readonly GALAXY_TITLES = ['Nexus','Expanse','Reach','Dominion','Nebula','Cluster','Void','Crucible','Rift','Crown','Veil','Forge','Spiral','Gate','Bastion','Remnant','Sanctum','Abyss'];
  private static readonly BH_EPITHETS = ['Devourer','Maw','Abyss','Singularity','Oblivion','Void','Leviathan','Behemoth','Colossus','Annihilator','Tyrant','Eclipse','Dread','Warden','Sovereign','Omega','Harbinger','Phantom'];
  private static readonly BH_PREFIXES = ['The','The Great','The Eternal','The Silent','The Hungering','The Undying','The Ancient','The Abyssal','The Dreaded','The Primordial'];

  constructor(config: GalaxyConfig) {
    this.config = config;
    this.numSeed = [...config.seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    this.prng = seedrandom(this.numSeed.toString());
    this.noise = new Noise2D(this.numSeed + 1337);
    
    // Generate galaxy name and SMBH name deterministically from seed
    const nameRng = seedrandom(config.seed + '-names');
    this.galaxyName = this.generateGalaxyName(nameRng);
    this.smbhName = this.generateSMBHName(nameRng);
  }

  private pick<T>(arr: readonly T[], rng: seedrandom.PRNG): T {
    return arr[Math.floor(rng() * arr.length)];
  }

  private generateGalaxyName(rng: seedrandom.PRNG): string {
    const base = this.pick(GalaxyGenerator.PREFIXES, rng) + this.pick(GalaxyGenerator.MIDS, rng) + this.pick(GalaxyGenerator.SUFFIXES, rng);
    const title = this.pick(GalaxyGenerator.GALAXY_TITLES, rng);
    return `${base} ${title}`;
  }

  private generateSMBHName(rng: seedrandom.PRNG): string {
    const prefix = this.pick(GalaxyGenerator.BH_PREFIXES, rng);
    const base = this.pick(GalaxyGenerator.PREFIXES, rng) + this.pick(GalaxyGenerator.SUFFIXES, rng);
    const epithet = this.pick(GalaxyGenerator.BH_EPITHETS, rng);
    return `${prefix} ${base} ${epithet}`;
  }

  private generateStarName(index: number): string {
    // Each star gets a deterministic unique name from its index
    const nameRng = seedrandom(this.config.seed + `-star-${index}`);
    const pre = this.pick(GalaxyGenerator.PREFIXES, nameRng);
    const mid = this.pick(GalaxyGenerator.MIDS, nameRng);
    const suf = this.pick(GalaxyGenerator.SUFFIXES, nameRng);
    const num = Math.floor(nameRng() * 900) + 100; // 100-999
    return `${pre}${mid}${suf}-${num}`;
  }

  private generateBHName(index: number, isCore: boolean): string {
    const nameRng = seedrandom(this.config.seed + `-bh-${index}`);
    const base = this.pick(GalaxyGenerator.PREFIXES, nameRng) + this.pick(GalaxyGenerator.SUFFIXES, nameRng);
    if (isCore) {
      return `${base} ${this.pick(GalaxyGenerator.BH_EPITHETS, nameRng)}`;
    }
    return `${base}-${Math.floor(nameRng() * 9000) + 1000}`;
  }

  private generateNSName(index: number, isPulsar: boolean): string {
    const nameRng = seedrandom(this.config.seed + `-ns-${index}`);
    const pre = this.pick(GalaxyGenerator.PREFIXES, nameRng);
    const suf = this.pick(GalaxyGenerator.SUFFIXES, nameRng);
    const id = Math.floor(nameRng() * 9000) + 1000;
    return isPulsar ? `PSR ${pre}${suf}-${id}` : `NSR ${pre}${suf}-${id}`;
  }

  public generate(): StellarSystemMetadata[] {
    const stars: StellarSystemMetadata[] = [];
    
    // REDUCE STAR COUNT FOR ANCIENT GALAXIES
    // If age >= 0.9, multiplier scales from 0.20 down to 0.01 at 1.0.
    let countMultiplier = 1.0;
    if (this.config.age >= 0.9) {
        countMultiplier = 0.20 - ((this.config.age - 0.9) * 1.9); // math fix: at 0.9 -> 0.20. At 1.0 -> 0.01
    }
    const actualStarCount = Math.max(1, Math.floor(this.config.numStars * countMultiplier));

    // SCALE GALAXY RADIUS BASED ON STAR COUNT!
    // base formula: Math.sqrt(stars) * 6
    // for 10000 -> 100 * 6 = 600 radius. for 100 -> 10 * 6 = 60 radius.
    this.config.radius = Math.max(50, Math.sqrt(actualStarCount) * 6);
    
    // Generate the supermassive black hole at the very center
    stars.push(this.createSupermassiveBlackHole());

    for (let i = 1; i < actualStarCount; i++) {
      const { x, y } = this.getPosition(i);
      stars.push(this.generateStellarSystem(i, x, y));
    }

    return stars;
  }

  private createSupermassiveBlackHole(): StellarSystemMetadata {
    const sysConfig: SolarSystemConfig = {
      seed: this.config.seed + "-SMBH-0",
      systemAge: 1, // ancient
      starClass: 'O', // Doesn't matter, will be overridden
      isBinary: false,
      numPlanets: 0,
      rockyPercentage: 0,
      lifeChance: 0,
      numMoons: 0,
      numAsteroidBelts: 3
    };

    return {
      id: "SMBH",
      name: this.smbhName,
      x: 0,
      y: 0,
      config: sysConfig,
      baseColor: '#000000',
      habitability: 0,
      starClass: 'BH',
      isDeadZone: true,
      size: 6 // Big black hole
    };
  }

  private generateStellarSystem(index: number, x: number, y: number): StellarSystemMetadata {
    // 1. Calculate normalized distance from center (0 to 1)
    const distanceToCenter = Math.sqrt(x * x + y * y);
    const normalizedDistance = Math.min(1, distanceToCenter / this.config.radius);

    // 2. Base Habitability / Sweet Spot Calculation (Gaussian Curve)
    // Sweet spot is around 40% to 60% of the radius
    // Formula: e^(-((d - 0.5)^2)/0.04) -> Peak at 0.5, falls off rapidly
    let habitability = Math.exp(-Math.pow(normalizedDistance - 0.5, 2) / 0.08);

    // 3. Apply Perlin Noise for Biomes / Clusters
    const noiseVal = this.noise.noise(x * 0.01, y * 0.01);
    
    // Anomaly Factor defines how much the noise can override normal rules
    let isDeadZone = false;
    if (this.config.anomalyFactor > 0) {
       // If noise is extremely low and anomaly is high, it's a dead supernova zone
       if (noiseVal < 0.2 * this.config.anomalyFactor) {
          isDeadZone = true;
          habitability = 0; // Destroyed
       }
       // If noise is exactly high, it's a rich nebula, buff habitability slightly
       else if (noiseVal > 0.8) {
          habitability = Math.min(1.0, habitability + (0.3 * this.config.anomalyFactor));
       }
    }

    // 4. Star Class Determination
    let starClassRaw = this.determineStarClass(normalizedDistance, isDeadZone);
    
    // Re-map to proper StarClass limit for SolarSystemConfig, even if it's BH/NS
    let mappedConfigStarClass: StarClass = 'M';
    if (['O','B','A','F','G','K','M'].includes(starClassRaw)) {
        mappedConfigStarClass = starClassRaw as StarClass;
    } else {
        // Black holes / Neutron stars get mapped to 'O' or 'B' for rendering logic inside the SolarSystem module
        // But the Galaxy Module knows them as 'BH', 'NS', 'P'
        mappedConfigStarClass = 'O'; 
    }

    // Colors mapping
    let baseColor = '#ffffff';
    let size = 1.0;
    
    if (['BH', 'NS', 'P'].includes(starClassRaw)) {
      if (starClassRaw === 'BH') { 
         baseColor = '#111'; 
         // Se for BH no núcleo, é um "Supermassivo menor" (Size 2). Se for nas bordas (deadZone), é estelar (Size 0.75)
         size = normalizedDistance < 0.15 ? 2.0 : 0.75; 
      }
      else if (starClassRaw === 'NS') { baseColor = '#8bf'; size = 0.6; }
      else { baseColor = '#dcf'; size = 0.6; } // Pulsar
    } else {
      switch(mappedConfigStarClass) {
        case 'O': baseColor = '#9bb0ff'; size = 1.0; break;
        case 'B': baseColor = '#aabfff'; size = 1.0; break;
        case 'A': baseColor = '#cad7ff'; size = 1.0; break;
        case 'F': baseColor = '#f8f7ff'; size = 1.0; break;
        case 'G': baseColor = '#fff4ea'; size = 1.0; break; 
        case 'K': baseColor = '#ffd2a1'; size = 1.0; break;
        case 'M': baseColor = '#ffcc6f'; size = 1.0; break; 
      }
    }

    // Apply Physical Distribution Rules based on numeric Age
    if (this.config.age < 0.3 && this.prng() > 0.3) {
      if (['O', 'B', 'A', 'F'].includes(mappedConfigStarClass)) {
         mappedConfigStarClass = this.prng() > 0.5 ? 'K' : 'M'; // Bias para anãs vermelhas/amarelas quentes e em formação
      }
    } else if (this.config.age >= 0.7 && this.config.age < 0.9 && this.prng() > 0.4) {
      if (['G', 'K', 'M'].includes(mappedConfigStarClass)) {
         mappedConfigStarClass = this.prng() > 0.5 ? 'O' : 'B'; // Gigantes Azuis e Brancas proliferam
      }
    } else if (this.config.age >= 0.9) {
       // Quase tudo morto
       if (this.prng() > 0.2) { // 80% chance to force kill main sequence explicitly visual
           starClassRaw = this.prng() > 0.5 ? 'BH' : (this.prng() > 0.5 ? 'NS' : 'P');
           mappedConfigStarClass = 'O'; // Fake mapping pro sistema interno renderizador
       }
    }

    // 5. Generate specific Solar System Config
    // ============================================================
    // GALAXY AGE → SYSTEM AGE CONSTRAINT
    // The galaxy's age is the ABSOLUTE ceiling for stellar system maturity.
    // A young galaxy CANNOT have old, mature systems — they haven't had time to form.
    // ============================================================
    const galAge = this.config.age;
    let sysAge: number;

    if (galAge < 0.20) {
      // Extremely young galaxy: ALL systems are still forming (protoplanetary disks)
      sysAge = this.prng() * 0.15; // 0% - 15%
    } else if (galAge < 0.30) {
      // Young galaxy: Most systems forming, rare few starting to stabilize
      if (this.prng() < 0.1) { // 10% chance of early-formed system
        sysAge = 0.2 + this.prng() * 0.2; // 20% - 40%
      } else {
        sysAge = this.prng() * 0.20; // 0% - 20% (still forming)
      }
    } else if (galAge < 0.70) {
      // Sweet spot (30% - 69%): Systems can be fully mature
      // Most systems here should be in the "formed" state (sysAge > 30%)
      const maturityCeiling = 0.3 + (galAge - 0.3) * 1.5; // at galAge 0.3→0.3, at 0.69→0.885
      
      // We want a floor for most systems to avoid "forming" worlds in a 40% galaxy
      if (this.prng() < 0.8) {
          // 80% chance for a "formed" system (age > 30%)
          sysAge = 0.31 + this.prng() * (Math.min(1.0, maturityCeiling) - 0.31);
      } else {
          // 20% chance for a lingering young system
          sysAge = this.prng() * 0.30;
      }
    } else if (galAge < 0.80) {
      // Aging galaxy (70% - 79%): Most systems are old, rare few are still middle-aged
      if (this.prng() < 0.15) { // 15% chance of lingering mature system
        sysAge = 0.5 + this.prng() * 0.3; // 50% - 80%
      } else {
        sysAge = 0.7 + this.prng() * 0.25; // 70% - 95% (old/dying)
      }
    } else {
      // Ancient galaxy (80%+): All systems are ancient relics
      sysAge = 0.8 + this.prng() * 0.2; // 80% - 100%
    }

    let numPlanets = Math.floor(this.prng() * 12) + 1; // 1 to 12
    let rockyPct = this.prng();
    let lifeChance = this.prng() * 0.2; // base 20%
    let numAsteroidBelts = this.prng() > 0.5 ? 1 : 0;

    // Life chance is ZERO if galaxy is too young or too old for biology
    if (galAge < 0.25 || galAge > 0.85) {
      lifeChance = 0;
    }

    if (isDeadZone) {
      sysAge = this.prng() * 0.1; // Newly formed from ash
      numPlanets = Math.floor(this.prng() * 3); // Max 2
      lifeChance = 0;
      numAsteroidBelts = 2 + Math.floor(this.prng() * 3); // Lots of debris
    } else if (normalizedDistance < 0.3) {
      // Core: High radiation, low water/life chance
      lifeChance = this.prng() * 0.05; // 5% max
      numPlanets = Math.floor(this.prng() * 5); // Tighter orbits, fewer planets
    } else if (normalizedDistance > 0.7) {
      // Edges: Low metallicity, low planets
      rockyPct = this.prng() * 0.3; // Mostly gas or frozen
    } else {
      // Sweet Spot (spatially) — only boost life if galaxy age also allows it
      if (habitability > 0.5 && galAge >= 0.30 && galAge < 0.70) {
         lifeChance = 0.3 + (this.prng() * 0.7); // 30% to 100%
         numPlanets = 5 + Math.floor(this.prng() * 8); // Rich dense systems
         rockyPct = 0.5 + (this.prng() * 0.5); // High metals
      }
    }

    // Generate the unique name for this celestial body
    let bodyName: string;
    if (['BH'].includes(starClassRaw)) {
      bodyName = this.generateBHName(index, normalizedDistance < 0.15);
    } else if (starClassRaw === 'NS') {
      bodyName = this.generateNSName(index, false);
    } else if (starClassRaw === 'P') {
      bodyName = this.generateNSName(index, true);
    } else {
      bodyName = this.generateStarName(index);
    }

    // Final Config to store
    const sysConfig: SolarSystemConfig = {
      seed: `${this.config.seed}-SYS-${index}`,
      systemAge: sysAge,
      starClass: mappedConfigStarClass,
      isBinary: this.prng() > 0.85, // 15% chance
      numPlanets,
      rockyPercentage: rockyPct,
      lifeChance,
      numMoons: Math.floor(this.prng() * 20),
      numAsteroidBelts,
      starName: bodyName
    };

    return {
      id: `STAR-${index}`,
      name: bodyName,
      x, 
      y,
      config: sysConfig,
      baseColor,
      habitability,
      starClass: starClassRaw,
      isDeadZone,
      size
    };
  }

  private determineStarClass(dist: number, deadZone: boolean): StarClass | 'BH' | 'NS' | 'P' {
    const roll = this.prng();
    
    // Ancient Age (>0.9) intensely forces death state across the map
    if (this.config.age >= 0.9 && roll < 0.8) {
       if (roll < 0.3) return 'BH';
       if (roll < 0.5) return 'NS';
       return 'P';
    }

    if (deadZone) {
      // Em idades jovens (<0.3), áreas de deadzones aglomeram muito Caos de Buracos Negros espalhados
      const bhChance = this.config.age < 0.3 ? 0.4 : 0.2;
      if (roll < bhChance) return 'BH';
      if (roll < 0.6) return 'NS';
      return 'P'; // Pulsar
    }

    if (dist < 0.1) {
      // Core: lots of giants or black holes
      if (roll < 0.05) return 'BH';
      if (roll < 0.2) return 'O';
      if (roll < 0.4) return 'B';
    }

    // General distribution (biased towards Red/Yellow dwarfs)
    // Sweet spot tends to favor G and K classes
    if (dist > 0.3 && dist < 0.7 && this.prng() > 0.5) {
       // Sweet spot bias
       if (roll < 0.4) return 'G'; // Sun-like
       if (roll < 0.8) return 'K';
       return 'F';
    }

    // Standard IMF (Initial Mass Function) simplified
    if (roll < 0.7) return 'M'; // 70% Red Dwarfs
    if (roll < 0.85) return 'K'; // 15% Orange
    if (roll < 0.92) return 'G'; // 7% Yellow
    if (roll < 0.95) return 'F';
    if (roll < 0.98) return 'A';
    if (roll < 0.99) return 'B';
    return 'O'; // Extremely rare blue supergiant
  }

  private getPosition(index: number): { x: number, y: number } {
    let x = 0; let y = 0;
    const r = this.config.radius;
    const randR = this.prng() * r;
    const randAng = this.prng() * Math.PI * 2;

    switch (this.config.shape) {
      case GalaxyShape.SPIRAL: {
        // Archimedean Spiral with Noise
        const arms = 2 + Math.floor(this.prng() * 3); // 2 to 4 arms
        const armOffset = (this.prng() * Math.PI * 2) / arms;
        
        // Randomly pick an arm
        const arm = Math.floor(this.prng() * arms);
        
        // Distance from center 
        // Bias towards center using exponential
        const dist = Math.pow(this.prng(), 2) * r;
        
        // Spiral angle based on distance
        const twist = 5; // How many turns
        const angle = (dist / r) * twist * Math.PI + (arm * (Math.PI * 2 / arms));
        
        // Add spread (thickness of the arm)
        const spread = (this.prng() - 0.5) * (r * 0.15);
        
        // Adding general core sphere
        if (this.prng() < 0.2) {
           const coreR = this.prng() * (r * 0.2);
           x = Math.cos(randAng) * coreR;
           y = Math.sin(randAng) * coreR;
        } else {
           x = Math.cos(angle) * dist + Math.cos(randAng) * spread;
           y = Math.sin(angle) * dist + Math.sin(randAng) * spread;
        }
        break;
      }
      
      case GalaxyShape.BARRED_SPIRAL: {
         // Similar to spiral but starts from a central bar
         const arms = 2; // Typically 2
         // Use gaussian for distance to cluster more towards center
         const gaussianD = Math.abs(this.prng() + this.prng() + this.prng() - 1.5) / 1.5;
         const dist = gaussianD * r;
         const barLen = r * 0.25;
         
         if (dist < barLen && this.prng() > 0.3) {
            // Inside the bar (elliptical shape in center)
            // Using prng() + prng() pushes density smoothly to the core, fading at the edges
            const rBar = Math.abs(this.prng() + this.prng() - 1.0); 
            const angBar = this.prng() * Math.PI * 2;
            x = Math.cos(angBar) * rBar * barLen;
            y = Math.sin(angBar) * rBar * (barLen * 0.3); // Squish Y to make an elongated rounded bar
            
            // Randomly rotate the bar
            const barAng = Math.PI / 4;
            const rx = x * Math.cos(barAng) - y * Math.sin(barAng);
            const ry = x * Math.sin(barAng) + y * Math.cos(barAng);
            x = rx; y = ry;
         } else {
            // Spiral arms starting from bar ends
            const arm = Math.floor(this.prng() * arms);
            const twist = 3;
            // Shift angle to start at bar ends
            const angle = ((dist - barLen) / (r - barLen)) * twist * Math.PI + (arm * Math.PI);
            
            // Gaussian spread for soft fading edges instead of hard cut-offs
            const spreadGaussian = (this.prng() + this.prng() + this.prng() - 1.5) / 1.5;
            // Spread increases slightly as it goes outward
            const spreadAmount = r * 0.05 + (dist / r) * (r * 0.05); 
            const spread = spreadGaussian * spreadAmount;
            
            x = Math.cos(angle) * dist + Math.cos(randAng) * spread;
            y = Math.sin(angle) * dist + Math.sin(randAng) * spread;
         }
         break;
      }

      case GalaxyShape.ELLIPTICAL: {
         // Simple 3D Gaussian projected to 2D
         // High density in center
         const u = this.prng() + this.prng() + this.prng() - 1.5; // Roughly gaussian
         const v = this.prng() + this.prng() + this.prng() - 1.5;
         
         // Stretch x slightly to make it an ellipse
         x = (u * r * 0.8);
         y = (v * r * 0.5);
         break;
      }

      case GalaxyShape.RING: { // Sombrero / Ring
         const coreR = r * 0.15;
         const ringInner = r * 0.6;
         const ringOuter = r;

         const isCore = this.prng() < 0.2; // 20% in the core
         
         if (isCore) {
            // Gaussian for core to fade out
            const gaussian = (this.prng() + this.prng() + this.prng() - 1.5) * 2;
            const d = Math.abs(gaussian) * coreR;
            x = Math.cos(randAng) * d;
            y = Math.sin(randAng) * d;
         } else {
            // Gaussian distribution for the ring so it blends softly into the void
            // Normal distribution centered between inner and outer ring
            const baseD = ringInner + (ringOuter - ringInner) * 0.5;
            const spread = (ringOuter - ringInner) * 1.5; 
            const gaussian = (this.prng() + this.prng() + this.prng() - 1.5) * 1.5; // -2.25 to 2.25
            const d = baseD + (gaussian * spread / 2);

            x = Math.cos(randAng) * d;
            // Compress Y for perspective
            y = (Math.sin(randAng) * d) * 0.3; 
         }
         break;
      }

      case GalaxyShape.IRREGULAR: {
         // Clustered distribution using noise, softly fading into the void
         let found = false;
         let attempts = 0;
         while(!found && attempts < 10) {
            // Using prng() + prng() instead of sqrt gives a natural heavy fade-out towards edges
            const testR = Math.abs(this.prng() + this.prng() - 1.0) * r;
            const testAng = this.prng() * Math.PI * 2;
            const testX = Math.cos(testAng) * testR;
            const testY = Math.sin(testAng) * testR;
            
            // If noise is high enough, place star here
            // Make noise requirement stricter at the edges to fade out chunks naturally
            const distancePenalty = (testR / r) * 0.2;
            if (this.noise.noise(testX * 0.02, testY * 0.02) - distancePenalty > 0.3) {
               x = testX;
               y = testY;
               found = true;
            }
            attempts++;
         }
         
         // Fallback if loop failed (ensure it's still round and central-biased)
         if (!found) {
            const fbR = Math.abs(this.prng() + this.prng() - 1.0) * r;
            const fbAng = this.prng() * Math.PI * 2;
            x = Math.cos(fbAng) * fbR;
            y = Math.sin(fbAng) * fbR;
         }
         break;
      }
    }

    // Se a idade for muito jovem (< 0.3), injetar Caos (Scatter positions drástico) na galáxia toda
    if (this.config.age < 0.3) {
       // Fator multiplicador de caos indo de 1.0 (em 0.0 age) ate 0.0 (em 0.3 age)
       const chaosFactor = (0.3 - this.config.age) / 0.3;
       x += (this.prng() - 0.5) * (r * 0.4) * chaosFactor;
       y += (this.prng() - 0.5) * (r * 0.4) * chaosFactor;
    }

    return { x, y };
  }
}
