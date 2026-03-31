import seedrandom from 'seedrandom';
import { CelestialBody, CelestialBodyType, SolarSystemConfig, Orbit, StarClass } from './types';
import { PlanetConfig, PlanetType } from '../planet-generator/generator';
export { PlanetType };

// Unified conversion: 1 AU = this many pixels in the viewer
export const AU_TO_PX = 400;

// Habitable zones widened so 3+ planets can comfortably fit inside
export const STAR_DATA: Record<StarClass, { r: number, hzIn: number, hzOut: number, color: string }> = {
  O: { r: 15.0, hzIn: 40.0, hzOut: 60.0, color: '#9bb0ff' }, // Blue Giant (Narrow & Deadly)
  B: { r: 7.0,  hzIn: 12.0, hzOut: 25.0, color: '#aabfff' }, 
  A: { r: 2.5,  hzIn: 4.0,  hzOut: 8.0,  color: '#cad7ff' }, 
  F: { r: 1.4,  hzIn: 1.2,  hzOut: 2.4,  color: '#f8f7ff' }, 
  G: { r: 1.0,  hzIn: 0.85, hzOut: 1.4,  color: '#fffbdf' }, // Yellow (Sun-like) - Tightened
  K: { r: 0.8,  hzIn: 0.45, hzOut: 0.9,  color: '#ffd2a1' }, // Orange - Tightened
  M: { r: 0.3,  hzIn: 0.12, hzOut: 0.3,  color: '#ff6644' }, // Red Dwarf - Tightened
};

const PLANET_NAME_PREFIXES = ["Kepler", "Gliese", "TRAPPIST", "Alpha", "HD", "K2", "Proxima", "LHS", "Tau", "Eridani"];
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

export class SolarSystemGenerator {
  config: SolarSystemConfig;
  rng: seedrandom.PRNG;
  bodies: CelestialBody[] = [];
  starName: string = '';

  constructor(config: SolarSystemConfig) {
    this.config = config;
    this.rng = seedrandom(config.seed);
  }

  random(min: number, max: number): number {
    return this.rng() * (max - min) + min;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random(min, max + 1));
  }

  generateSystem(): CelestialBody[] {
    this.bodies = [];
    
    // 1. Generate Stars
    this.generateStars();

    // 2. Generate Planets
    this.generatePlanets();

    // 3. Generate Asteroid Belts (as a visual collection of bodies)
    this.generateAsteroidBelts();

    // 4. Generate Comets (Oort cloud visitors)
    this.generateComets();

    return this.bodies;
  }

  private generateStars() {
    // If the galaxy already assigned a name, use it. Otherwise generate one.
    if (this.config.starName) {
      this.starName = this.config.starName;
    } else {
      const prefix = PLANET_NAME_PREFIXES[this.randomInt(0, PLANET_NAME_PREFIXES.length - 1)];
      const num = this.randomInt(10, 9999);
      this.starName = `${prefix}-${num}`;
    }

    const sData = STAR_DATA[this.config.starClass];

    if (this.config.isBinary) {
      // Binary system: primary star fixed at center, secondary orbits around it
      const starSubName1 = `${this.starName} A`;
      const starSubName2 = `${this.starName} B`;
      const binaryOrbitSpacing = sData.r * 60 + this.random(20, 50);

      // Primary star: FIXED at origin so planets/zones stay stable
      this.bodies.push({
        id: 'star-1',
        name: starSubName1,
        type: 'star',
        starClass: this.config.starClass,
        radius: sData.r * 25, // Visual scale
        baseColor: sData.color,
        hasRings: false,
        orbit: {
          semiMajorAxis: 0, // Fixed at center
          eccentricity: 0,
          trueAnomaly: 0,
          argumentOfPeriapsis: 0
        }
      });

      // Second star orbits the primary
      this.bodies.push({
        id: 'star-2',
        name: starSubName2,
        type: 'star',
        parentId: 'star-1',
        starClass: this.config.starClass,
        radius: (sData.r * 25) * 0.7,
        baseColor: sData.color,
        hasRings: false,
        orbit: {
          semiMajorAxis: binaryOrbitSpacing * 2, // Orbit radius around primary
          eccentricity: 0.1,
          trueAnomaly: this.rng() * Math.PI * 2,
          argumentOfPeriapsis: 0
        }
      });
    } else {
      // Single Star
      this.bodies.push({
        id: 'star-1',
        name: this.starName,
        type: 'star',
        starClass: this.config.starClass,
        radius: sData.r * 40, // Visual scale
        baseColor: sData.color,
        hasRings: false,
        orbit: {
          semiMajorAxis: 0,
          eccentricity: 0,
          trueAnomaly: 0,
          argumentOfPeriapsis: 0
        }
      });
    }
  }

  private generatePlanets() {
    const { rockyPercentage, lifeChance, starClass, systemAge } = this.config;
    const sData = STAR_DATA[starClass];

    // ============================================================
    // AGE-BASED DECAY: Old systems lose planets, moons, and life
    // 70-79%: Light decay (keeps 80% down to 50%)
    // 80-100%: Heavy decay (keeps 50% down to 1%)
    // ============================================================
    let decayMultiplier = 1.0;
    if (systemAge >= 0.80) {
      // Heavy decay: 0.50 at age 0.80 → 0.01 at age 1.0
      decayMultiplier = 0.50 - ((systemAge - 0.80) * 2.45); // 0.80→0.50, 1.0→0.01
      decayMultiplier = Math.max(0.01, decayMultiplier);
    } else if (systemAge >= 0.70) {
      // Light decay: 0.80 at age 0.70 → 0.50 at age 0.80
      decayMultiplier = 0.80 - ((systemAge - 0.70) * 3.0); // 0.70→0.80, 0.80→0.50
    }

    const actualNumPlanets = Math.max(0, Math.floor(this.config.numPlanets * decayMultiplier));
    const actualNumMoons = Math.max(0, Math.floor(this.config.numMoons * decayMultiplier));

    // Life is impossible in very old systems
    let effectiveLifeChance = lifeChance;
    if (systemAge >= 0.85) {
      effectiveLifeChance = 0;
    } else if (systemAge >= 0.75) {
      effectiveLifeChance = lifeChance * Math.max(0, 1 - ((systemAge - 0.75) * 10)); // fades 0.75→1.0, 0.85→0.0
    }

    // Start distance: must be beyond star's visual radius
    const starVisualRadiusAu = (sData.r * 40) / AU_TO_PX;
    let currentDistanceAu = starVisualRadiusAu + this.random(0.1, 0.3);
    
    // Se for binário, planetas devem nascer depois da órbita da segunda estrela
    if (this.config.isBinary) {
        const binaryOrbitSpacingAu = (sData.r * 60 + 50) * 2 / AU_TO_PX;
        currentDistanceAu = Math.max(currentDistanceAu, binaryOrbitSpacingAu + this.random(0.5, 1.0));
    }
    
    // Determine how many are rocky based on config
    let numRocky = Math.round(actualNumPlanets * rockyPercentage);
    let numGas = actualNumPlanets - numRocky;

    // Distributing types based on distance rule
    // Create an array of expected planet compositions and sort them by distance roughly
    // Rocky tends to be inside, Gas tends to be outside, but we can shuffle it slightly
    const planetTypesArray: ('rocky' | 'gas')[] = [];
    for (let i = 0; i < numRocky; i++) planetTypesArray.push('rocky');
    for (let i = 0; i < numGas; i++) planetTypesArray.push('gas');
    
    // Sort array so rocky is more likely first, gas later, with some randomness
    planetTypesArray.sort(() => (this.rng() - 0.5) + 0.3); // Bias gas to end

    for (let i = 0; i < actualNumPlanets; i++) {
        const pComp = planetTypesArray[i] || 'rocky'; // fallback if array is shorter after decay
        
        // Progressive spacing: inner planets close together, outer planets far apart
        const minGapAu = 120 / AU_TO_PX;
        const hzScale = (sData.hzIn + sData.hzOut) / 2;
        const spacing = minGapAu + hzScale * (0.04 + i * 0.02) + this.random(0.03, 0.1) * hzScale;
        currentDistanceAu += spacing;

        // === AGE-BASED ORBIT CHAOS ===
        let orbitEccentricity: number;
        if (systemAge <= 0.20) {
            // Very young: chaotic, irregular orbits
            orbitEccentricity = this.random(0.15, 0.5);
        } else if (systemAge <= 0.30) {
            // Young: slightly less chaotic, starting to stabilize
            orbitEccentricity = this.random(0.05, 0.3);
        } else if (systemAge <= 0.69) {
            // Sweet spot: stable, slightly elliptical
            orbitEccentricity = this.random(0.01, 0.15);
        } else {
            // Mature+: very stable circular orbits
            orbitEccentricity = this.random(0, 0.05);
        }

        // === AGE-BASED LIFE CHANCE (already computed above as effectiveLifeChance) ===
        // For young systems, further reduce
        let localLifeChance = effectiveLifeChance;

        // STAR-CLASS PENALTY
        if (['O', 'B', 'A'].includes(starClass)) localLifeChance *= 0.05; // Radiation/Short life
        else if (starClass === 'F') localLifeChance *= 0.4;
        else if (starClass === 'M') localLifeChance *= 0.3; // Flares/Tidally locked
        
        if (systemAge <= 0.20) {
            localLifeChance = 0; // No life in very young systems
        } else if (systemAge <= 0.30) {
            localLifeChance = localLifeChance * 0.1; // Very unlikely
        }

        // === IS THIS BODY STILL FORMING? ===
        let isFormingBody = false;
        if (systemAge <= 0.20) {
            isFormingBody = true; // All planets forming as lava worlds in very young systems
        } else if (systemAge <= 0.30) {
            isFormingBody = this.rng() < 0.7; // 70% chance of still forming
        }

        // Determine specific PlanetType based on distance (currentDistanceAu vs hzIn/hzOut)
        const isHotZone = currentDistanceAu < sData.hzIn;
        const isHabitableZone = currentDistanceAu >= sData.hzIn && currentDistanceAu <= sData.hzOut;
        const isColdZone = currentDistanceAu > sData.hzOut;

        let specificType: PlanetType;
        let isHabitable = false;

        if (pComp === 'gas') {
            specificType = PlanetType.GAS_GIANT;
        } else {
            // Rocky logic
            if (isHotZone) {
                // If it's EXTREMELY close to an M-class star, high chance of Tidally Locked Dead
                if (starClass === 'M' && currentDistanceAu < 0.05 && this.rng() > 0.2) {
                    specificType = PlanetType.TIDALLY_LOCKED_DEAD;
                } else {
                    const rnd = this.rng();
                    // Lava worlds are only found in young systems or as extreme anomalies.
                    // If system is > 30%, we replace the random lava world with rocky-airless or ash.
                    if (rnd < 0.4 && systemAge <= 0.30) specificType = PlanetType.LAVA_WORLD;
                    else if (rnd < 0.6) specificType = PlanetType.ROCKY_AIRLESS;
                    else if (rnd < 0.8) specificType = PlanetType.ASH_WORLD;
                    else if (rnd < 0.9) specificType = PlanetType.TOXIC_ATMOSPHERE;
                    else specificType = PlanetType.ARID;
                }
            } else if (isHabitableZone) {
            // Chance of life (age-adjusted) - Extra check for life robustness
                if (this.rng() < localLifeChance) {
                    isHabitable = true;
                    // Lower Earth-like occurrence, favor variety
                    const lifeRoll = this.rng();
                    if (lifeRoll < 0.4) specificType = PlanetType.EARTH_LIKE;
                    else if (lifeRoll < 0.8) specificType = PlanetType.ALIEN_LIFE;
                    else specificType = PlanetType.OCEAN_WORLD; // Habitable but strictly oceanic
                } else {
                    const rnd = this.rng();
                    if (rnd < 0.3) specificType = PlanetType.ARID; 
                    else if (rnd < 0.5) specificType = PlanetType.SWAMP_WORLD; 
                    else if (rnd < 0.7) specificType = PlanetType.OCEAN_WORLD;
                    else if (rnd < 0.85) specificType = PlanetType.TOXIC_ATMOSPHERE;
                    else specificType = PlanetType.ROCKY_AIRLESS; 
                }
            } else {
                // Cold Zone
                const rnd = this.rng();
                if (rnd < 0.5) specificType = PlanetType.GLACIAL;
                else if (rnd < 0.8) specificType = PlanetType.FROZEN_OCEAN;
                else specificType = PlanetType.CARBON_WORLD;
            }
        }

        // Forming rocky planets are always molten lava
        if (isFormingBody && pComp !== 'gas') {
            specificType = PlanetType.LAVA_WORLD;
            isHabitable = false;
        }

        // Setup base config for the planet
        const pSeed = `${this.config.seed}_planet_${i}`;
        const pSize = pComp === 'gas' ? this.random(1.5, 3.0) : this.random(1.5, 2.5);
        
        let pConfig: PlanetConfig = {
            seed: pSeed,
            width: 1024,
            height: 512,
            numPlates: this.randomInt(35, 55),
            seaLevel: this.random(0.48, 0.62),
            baseTemperature: isHotZone ? 0.8 : (isColdZone ? 0.2 : 0.5),
            baseMoisture: isHabitable ? this.random(0.5, 0.8) : this.random(0.1, 0.4),
            planetSize: pSize,
            planetType: specificType,
            craterDensity: systemAge <= 0.30 ? this.random(0.6, 1.0) : this.random(0.1, 0.5), // Young = more craters
            surfaceHue: ['gray', 'reddish', 'yellowish'][this.randomInt(0, 2)],
            dustStormIntensity: this.random(0.1, 0.8),
            cloudDensity: this.random(0.3, 0.9),
            volcanicActivity: systemAge <= 0.20 ? this.random(0.7, 1.0) : this.random(0.1, 0.4), // Young = volcanic
            iceFractureDensity: this.random(0.2, 0.8),
            bandContrast: this.random(0.2, 0.8),
            stormFrequency: this.random(0.2, 0.8),
            colorPalette: ['jovian', 'saturnian', 'uranian', 'neptunian'][this.randomInt(0, 3)],
            vegetationHue: isHabitable ? ['green', 'purple', 'teal', 'autumn-red', 'emerald'][this.randomInt(0, 4)] : 'green',
            waterHue: isHabitable ? ['blue', 'green', 'indigo', 'cyan', 'azure'][this.randomInt(0, 4)] : 'blue',
            crustAge: systemAge,
            islandDensity: this.random(0.1, 0.4),
            lineaeDensity: 0.5,
            iceThickness: this.random(0.2, 1.0),
            starIntensity: isHotZone ? 1.0 : 0.5,
            twilightWidth: 0.2,
            crystalDensity: 0.5,
            hydrocarbonLakes: 0.5,
            bioluminescence: 0.5,
            waterLevel: 0.5,
            ashDepth: 0.5,
            emberActivity: 0.5
        };

        // Determine Base visual color for radar map
        let visualColor = '#888888';
        if (pComp === 'gas') {
            const pal = pConfig.colorPalette;
            if (pal === 'jovian' || pal === 'crimson') visualColor = '#d98b55';
            else if (pal === 'saturnian') visualColor = '#e3cd9a';
            else if (pal === 'uranian') visualColor = '#81c6db';
            else if (pal === 'alien-purple') visualColor = '#a865b5';
        } else {
            if (specificType === PlanetType.LAVA_WORLD || specificType === PlanetType.TIDALLY_LOCKED_DEAD || specificType === PlanetType.ASH_WORLD) visualColor = '#ff4d00';
            else if (specificType === PlanetType.ARID) visualColor = '#d5925a';
            else if (specificType === PlanetType.EARTH_LIKE) visualColor = '#4287f5';
            else if (specificType === PlanetType.ALIEN_LIFE) visualColor = pConfig.waterHue === 'magenta' ? '#d842f5' : (pConfig.waterHue === 'cyan' ? '#42f5e0' : '#42f560');
            else if (specificType === PlanetType.OCEAN_WORLD) visualColor = '#155bb5';
            else if (specificType === PlanetType.GLACIAL || specificType === PlanetType.FROZEN_OCEAN) visualColor = '#c4f0ff';
            else if (specificType === PlanetType.TOXIC_ATMOSPHERE) visualColor = '#cacc5a';
        }

        // Higher chance of rings on gas giants
        const wantsRings = pComp === 'gas' ? (this.rng() < 0.7) : (this.rng() < 0.1);

        const planetId = `planet-${i}`;
        const orbitRadius = Math.max(80, currentDistanceAu * AU_TO_PX); // Scale AU to pixels

        // Save planet
        this.bodies.push({
            id: planetId,
            name: `${this.starName} ${ROMAN_NUMERALS[i]}`,
            type: 'planet',
            parentId: 'star-1',
            orbit: {
                semiMajorAxis: orbitRadius,
                eccentricity: orbitEccentricity,
                trueAnomaly: this.rng() * Math.PI * 2,
                argumentOfPeriapsis: this.rng() * Math.PI * 2
            },
            radius: pSize * 6,
            baseColor: visualColor,
            hasRings: wantsRings,
            planetConfig: pConfig,
            isHabitable: isHabitable,
            isForming: isFormingBody
        });

        // Moons for this planet
        // Calculate how many moons to give (gas giants get 2-5x more)
        const moonWeight = pComp === 'gas' ? this.random(3, 8) : this.random(0, 2);
        // We'll normalize this later, or just assign them dynamically now based on average
        // Simple approach: just assign N moons based on weight
        let numMoonsForPlanet = Math.round(moonWeight * (actualNumMoons / 15)); // Scaling factor, uses decayed count
        if (numMoonsForPlanet > 0) {
            this.generateMoonsForPlanet(planetId, numMoonsForPlanet, orbitRadius, isHabitableZone, isHotZone);
        }
    }
  }

  private generateMoonsForPlanet(planetId: string, count: number, parentOrbitPx: number, isHabitableZone: boolean, isHotZone: boolean) {
      let moonDist = 18; // Start distance from planet center in relative Px scale

      for (let m = 0; m < count; m++) {
          moonDist += this.random(5, 12);
          
          let mType = PlanetType.ROCKY_AIRLESS;
          let mLife = false;
          let mColor = '#aaaaaa';

          const age = this.config.systemAge;
          const isMoonForming = age <= 0.20 ? true : (age <= 0.30 ? this.rng() < 0.7 : false);
          const moonEcc = age <= 0.20 ? this.random(0.05, 0.3) : (age <= 0.30 ? this.random(0, 0.15) : this.random(0, 0.05));

          // Compute moon life chance identically to planets
          let effectiveLifeChance = this.config.lifeChance;
          if (age >= 0.85) effectiveLifeChance = 0;
          else if (age >= 0.75) effectiveLifeChance = this.config.lifeChance * Math.max(0, 1 - ((age - 0.75) * 10));

          let moonLifeChance = effectiveLifeChance;
          if (age <= 0.20) moonLifeChance = 0;
          else if (age <= 0.30) moonLifeChance = effectiveLifeChance * 0.1;

          // Small moons are just grey rocks
          // Large moons can have life if in HZ
          const goesLarge = this.rng() > 0.6;
          
          if (isMoonForming) {
              mType = PlanetType.LAVA_WORLD;
              mLife = false;
              mColor = '#ff4d00';
          } else if (goesLarge && isHabitableZone && this.rng() < moonLifeChance) {
              mType = this.rng() < 0.7 ? PlanetType.EARTH_LIKE : PlanetType.ALIEN_LIFE;
              mLife = true;
              mColor = mType === PlanetType.EARTH_LIKE ? '#4287f5' : '#d842f5';
          } else if (goesLarge && !isHotZone && this.rng() > 0.5) {
              mType = PlanetType.GLACIAL;
              mColor = '#c4f0ff';
          } else if (goesLarge && isHotZone && this.rng() > 0.5) {
              // Moon lava worlds also restricted by age
              mType = age <= 0.30 ? PlanetType.LAVA_WORLD : PlanetType.ROCKY_AIRLESS;
              mColor = mType === PlanetType.LAVA_WORLD ? '#ff4d00' : '#888888';
          } else if (goesLarge) {
              const r = this.rng();
              if (r < 0.1) { mType = PlanetType.OCEAN_WORLD; mColor = '#155bb5'; }
              else if (r < 0.2) { mType = PlanetType.SWAMP_WORLD; mColor = '#5c7a52'; }
              else if (r < 0.3) { mType = PlanetType.ARID; mColor = '#d5925a'; }
              else if (r < 0.4) { mType = PlanetType.ASH_WORLD; mColor = '#994444'; }
              else if (r < 0.5) { mType = PlanetType.TOXIC_ATMOSPHERE; mColor = '#cacc5a'; }
          }

          const mSize = goesLarge ? this.random(0.8, 1.5) : this.random(0.1, 0.3); // Increased size for detailed noise
          const mConfig: PlanetConfig = {
              seed: `${this.config.seed}_moon_${planetId}_${m}`,
              width: 512, height: 256,
              numPlates: goesLarge ? this.randomInt(20, 30) : 5, // Increased plates for detail
              seaLevel: mLife ? 0.6 : 0,
              baseTemperature: 0.5, baseMoisture: mLife ? 0.5 : 0,
              planetSize: mSize,
              planetType: mType,
              craterDensity: this.random(0.5, 1.0),
              surfaceHue: 'gray',
              dustStormIntensity: 0, cloudDensity: 0.5, volcanicActivity: 0,
              iceFractureDensity: 0.5, bandContrast: 0, stormFrequency: 0,
              colorPalette: '', 
              vegetationHue: mLife ? ['green', 'purple', 'teal', 'autumn-red', 'emerald'][this.randomInt(0, 4)] : 'green',
              waterHue: mLife ? ['blue', 'green', 'indigo', 'cyan', 'azure'][this.randomInt(0, 4)] : 'blue',
              crustAge: this.config.systemAge, islandDensity: 0.2, lineaeDensity: 0.5,
              iceThickness: 0.5, starIntensity: 0.5, twilightWidth: 0.2,
              crystalDensity: 0, hydrocarbonLakes: 0, bioluminescence: 0,
              waterLevel: 0.5, ashDepth: 0, emberActivity: 0
          };

          this.bodies.push({
            id: `${planetId}-moon-${m}`,
            name: `${this.bodies.find(b => b.id === planetId)?.name} ${String.fromCharCode(97 + m)}`,
            type: 'moon',
            parentId: planetId,
            orbit: {
                semiMajorAxis: moonDist,
                eccentricity: moonEcc,
                trueAnomaly: this.rng() * Math.PI * 2,
                argumentOfPeriapsis: this.rng() * Math.PI * 2
            },
            radius: mSize * 5,
            baseColor: mColor,
            hasRings: false,
            planetConfig: goesLarge ? mConfig : undefined,
            isHabitable: mLife,
            isForming: isMoonForming
          });
      }
  }

  private generateAsteroidBelts() {
      const sData = STAR_DATA[this.config.starClass];
      const age = this.config.systemAge;
      // Belt must be outside star and habitable zone
      const minBeltAu = Math.max(3.0, sData.hzOut * 1.5);
      
      // Young systems: more belts, more rocks, wider spread
      const beltCount = this.config.numAsteroidBelts + (age <= 0.20 ? 2 : (age <= 0.30 ? 1 : 0));
      
      for (let b = 0; b < beltCount; b++) {
          const beltRadiusAu = this.random(minBeltAu, minBeltAu + 10.0);
          const beltRadiusPx = beltRadiusAu * AU_TO_PX;

          // Young systems have 3-5x more rocks
          const ageMult = age <= 0.20 ? 4 : (age <= 0.30 ? 2 : 1);
          const numRocks = this.randomInt(50, 150) * ageMult;
          // Young systems scatter wider
          const spread = age <= 0.20 ? 80 : (age <= 0.30 ? 40 : 20);

          for (let r = 0; r < numRocks; r++) {
              const radVariance = beltRadiusPx + this.random(-spread, spread);
              const asteroidEcc = age <= 0.20 ? this.random(0.05, 0.35) : (age <= 0.30 ? this.random(0, 0.2) : this.random(0, 0.1));
              
              this.bodies.push({
                id: `belt-${b}-rock-${r}`,
                name: `Asteroid`,
                type: 'asteroid',
                parentId: 'star-1',
                orbit: {
                    semiMajorAxis: radVariance,
                    eccentricity: asteroidEcc,
                    trueAnomaly: this.rng() * Math.PI * 2,
                    argumentOfPeriapsis: this.rng() * Math.PI * 2
                },
                radius: this.random(0.5, age <= 0.20 ? 2.5 : 1.5), // Larger debris in young systems
                baseColor: age <= 0.20 ? '#8a6a4a' : '#6a6a6a', // More brownish in young systems
                hasRings: false
              });
          }
      }
  }

  private generateComets() {
      const sData = STAR_DATA[this.config.starClass];
      const numComets = this.randomInt(0, 3);
      const starRadiusPx = sData.r * 40;
      
      for (let c = 0; c < numComets; c++) {
          // Comet orbit scaled to system size, with periapsis outside the star
          const semiMajorAu = this.random(sData.hzOut * 3, sData.hzOut * 8);
          const semiMajorPx = semiMajorAu * AU_TO_PX;
          // Ensure periapsis (closest approach) is outside the star
          const maxEcc = Math.min(0.95, 1 - (starRadiusPx * 1.5) / semiMajorPx);
          const ecc = this.random(Math.max(0.5, maxEcc - 0.2), maxEcc);

          this.bodies.push({
              id: `comet-${c}`,
              name: `Comet ${this.starName[0]}-${Math.round(this.rng()*100)}`,
              type: 'comet',
              parentId: 'star-1',
              orbit: {
                  semiMajorAxis: semiMajorPx,
                  eccentricity: ecc,
                  trueAnomaly: this.rng() * Math.PI * 2,
                  argumentOfPeriapsis: this.rng() * Math.PI * 2
              },
              radius: 1.5,
              baseColor: '#e0ffff',
              hasRings: false
          });
      }
  }
}
