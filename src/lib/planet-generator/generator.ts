import seedrandom from 'seedrandom';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { Delaunay } from 'd3-delaunay';

export enum PlanetType {
  EARTH_LIKE = 'earth-like',
  ROCKY_AIRLESS = 'rocky-airless',
  ARID = 'arid',
  TOXIC_ATMOSPHERE = 'toxic-atmosphere',
  GLACIAL = 'glacial',
  GAS_GIANT = 'gas-giant',
  ALIEN_LIFE = 'alien-life',
  LAVA_WORLD = 'lava-world',
  OCEAN_WORLD = 'ocean-world',
  FROZEN_OCEAN = 'frozen-ocean',
  TIDALLY_LOCKED = 'tidally-locked',
  TIDALLY_LOCKED_DEAD = 'tidally-locked-dead',
  CARBON_WORLD = 'carbon-world',
  SWAMP_WORLD = 'swamp-world',
  ASH_WORLD = 'ash-world',
}

export enum PlanetCapability {
  BIOMES = 'biomes',
  FERTILITY = 'fertility',
  FAUNA = 'fauna',
  RIVERS = 'rivers',
  RESOURCES = 'resources',
  SPICES = 'spices',
}

export function hasCapability(type: PlanetType, cap: PlanetCapability): boolean {
  switch (cap) {
    case PlanetCapability.BIOMES:
      // Only Earth-like and Alien-life have full biome maps
      return [PlanetType.EARTH_LIKE, PlanetType.ALIEN_LIFE].includes(type);
    case PlanetCapability.RIVERS:
      return [PlanetType.EARTH_LIKE, PlanetType.ALIEN_LIFE].includes(type);
    case PlanetCapability.FERTILITY:
    case PlanetCapability.FAUNA:
    case PlanetCapability.RESOURCES:
    case PlanetCapability.SPICES:
      // Strictly restricted as requested: "apenas planetas earth like ou alien like"
      return [PlanetType.EARTH_LIKE, PlanetType.ALIEN_LIFE].includes(type);
    default:
      return false;
  }
}

export interface PlanetConfig {
  seed: string;
  width: number;
  height: number;
  numPlates: number;
  seaLevel: number;
  baseTemperature: number;
  baseMoisture: number;
  planetSize: number;
  planetType: PlanetType;
  // Rocky Airless / shared rocky
  craterDensity: number;
  surfaceHue: string;
  // Arid
  dustStormIntensity: number;
  // Toxic Atmosphere
  cloudDensity: number;
  volcanicActivity: number;
  // Glacial
  iceFractureDensity: number;
  // Gas Giant
  bandContrast: number;
  stormFrequency: number;
  colorPalette: string;
  // Alien Life
  vegetationHue: string;
  waterHue: string;
  // Lava World
  crustAge: number;
  // Ocean World
  islandDensity: number;
  // Frozen Ocean
  lineaeDensity: number;
  iceThickness: number;
  // Tidally Locked
  starIntensity: number;
  twilightWidth: number;
  // Carbon World
  crystalDensity: number;
  hydrocarbonLakes: number;
  // Swamp World
  bioluminescence: number;
  waterLevel: number;
  // Ash World
  ashDepth: number;
  emberActivity: number;
}

export enum LayerType {
  ELEVATION = 'elevation',
  HEIGHTMAP = 'heightmap',
  TECTONIC = 'tectonic',
  TEMPERATURE = 'temperature',
  MOISTURE = 'moisture',
  BIOME = 'biome',
  NORMAL = 'normal',
  FINAL = 'final',
  MOVEMENT = 'movement',
  FERTILITY = 'fertility',
  ORES = 'ores',
  SPICES = 'spices',
  RESOURCES = 'resources',
  FAUNA = 'fauna',
}

export enum BiomeType {
  OCEAN_DEEP = 0,
  OCEAN_SHALLOW = 1,
  OCEAN_ICE = 2,
  SNOW = 3,
  TUNDRA = 4,
  TAIGA = 5,
  COLD_DESERT = 6,
  STEPPE = 7,
  GRASSLAND = 8,
  SEASONAL_FOREST = 9,
  TEMPERATE_RAINFOREST = 10,
  SAVANNA = 11,
  SUBTROPICAL_DESERT = 12,
  TROPICAL_RAINFOREST = 13,
}

export const BIOME_BASE_COSTS: Record<BiomeType, number> = {
  [BiomeType.OCEAN_DEEP]: 7,
  [BiomeType.OCEAN_SHALLOW]: 6,
  [BiomeType.OCEAN_ICE]: 8,
  [BiomeType.SNOW]: 5,
  [BiomeType.TUNDRA]: 3,
  [BiomeType.TAIGA]: 2, // Base ground. 1 or 2 more via trees
  [BiomeType.COLD_DESERT]: 4,
  [BiomeType.STEPPE]: 1,
  [BiomeType.GRASSLAND]: 1,
  [BiomeType.SEASONAL_FOREST]: 1, // Base ground equivalent to Grassland. 1 or 2 more via density
  [BiomeType.TEMPERATE_RAINFOREST]: 1, // 1 to 2 more via dense trees
  [BiomeType.SAVANNA]: 2, // Sparse bushes, harsh ground. Usually stays 2 or 3
  [BiomeType.SUBTROPICAL_DESERT]: 4,
  [BiomeType.TROPICAL_RAINFOREST]: 1, // 2 to 3 more via very dense trees
};

export const BIOME_NAMES: Record<BiomeType, string> = {
  [BiomeType.OCEAN_DEEP]: 'Deep Ocean',
  [BiomeType.OCEAN_SHALLOW]: 'Shallow Ocean',
  [BiomeType.OCEAN_ICE]: 'Sea Ice',
  [BiomeType.SNOW]: 'Snow / Ice',
  [BiomeType.TUNDRA]: 'Tundra',
  [BiomeType.TAIGA]: 'Taiga',
  [BiomeType.COLD_DESERT]: 'Cold Desert',
  [BiomeType.STEPPE]: 'Steppe',
  [BiomeType.GRASSLAND]: 'Grassland',
  [BiomeType.SEASONAL_FOREST]: 'Seasonal Forest',
  [BiomeType.TEMPERATE_RAINFOREST]: 'Temperate Rainforest',
  [BiomeType.SAVANNA]: 'Savanna',
  [BiomeType.SUBTROPICAL_DESERT]: 'Subtropical Desert',
  [BiomeType.TROPICAL_RAINFOREST]: 'Tropical Rainforest',
};

interface Plate {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  type: 'oceanic' | 'continental';
  baseElevation: number;
}

export class PlanetGenerator {
  config: PlanetConfig;
  rng: seedrandom.PRNG;
  noise2D: (x: number, y: number) => number;
  noise3D: (x: number, y: number, z: number) => number;
  
  elevation: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  tectonicPlates: Int32Array;
  secondTectonicPlates: Int32Array;
  plateDistances: Float32Array;
  boundaryTypes: Int8Array; // 0: none, 1: convergent, 2: divergent, 3: transform
  waterAccumulation: Float32Array; // For rivers
  biomeIds: Uint8Array;
  movementCosts: Uint8Array;
  fertility: Float32Array;
  ores: Float32Array;        // 0-1: ore density
  spices: Float32Array;      // 0-1: spice density  
  resources: Float32Array;   // 0-1: environmental resource density
  fauna: Float32Array;       // 0-1: fauna density
  
  plates: Plate[];
  
  constructor(config: PlanetConfig) {
    this.config = config;
    this.rng = seedrandom(config.seed);
    this.noise2D = createNoise2D(this.rng);
    this.noise3D = createNoise3D(this.rng);
    
    const size = config.width * config.height;
    this.elevation = new Float32Array(size);
    this.temperature = new Float32Array(size);
    this.moisture = new Float32Array(size);
    this.tectonicPlates = new Int32Array(size);
    this.secondTectonicPlates = new Int32Array(size);
    this.plateDistances = new Float32Array(size);
    this.boundaryTypes = new Int8Array(size);
    this.waterAccumulation = new Float32Array(size);
    this.biomeIds = new Uint8Array(size);
    this.movementCosts = new Uint8Array(size);
    this.fertility = new Float32Array(size);
    this.ores = new Float32Array(size);
    this.spices = new Float32Array(size);
    this.resources = new Float32Array(size);
    this.fauna = new Float32Array(size);
    this.plates = [];
  }

  async generate(onProgress?: (progress: number, status: string) => void) {
    const yieldThread = () => new Promise(resolve => setTimeout(resolve, 0));
    const pt = this.config.planetType;
    const isGas = pt === PlanetType.GAS_GIANT;

    // Gas giants skip everything solid
    if (isGas) {
      if (onProgress) onProgress(0.3, 'Generating Gas Bands...');
      await yieldThread();
      this.generateGasGiant();
      if (onProgress) onProgress(0.7, 'Calculating Atmospheric Temperature...');
      await yieldThread();
      this.generateClimate();
      if (onProgress) onProgress(1.0, 'Done');
      return;
    }

    // All solid planets share tectonics + elevation
    if (onProgress) onProgress(0.05, 'Generating Tectonic Plates...');
    await yieldThread();
    this.generateTectonics();
    
    if (onProgress) onProgress(0.2, 'Generating Elevation...');
    await yieldThread();
    this.generateElevation();

    // Crater-based planets
    const hasCraters = [PlanetType.ROCKY_AIRLESS, PlanetType.GLACIAL, PlanetType.FROZEN_OCEAN, PlanetType.TIDALLY_LOCKED_DEAD].includes(pt);
    if (hasCraters) {
      if (onProgress) onProgress(0.35, 'Generating Craters...');
      await yieldThread();
      this.generateCraters();
    }

    // Climate for all solid planets
    if (onProgress) onProgress(0.45, 'Calculating Surface Temperature...');
    await yieldThread();
    this.generateClimate();

    // 4.5 Biomes & Biological Layers (Earth-like / Alien-life only)
    if (hasCapability(pt, PlanetCapability.BIOMES)) {
      if (onProgress) onProgress(0.55, 'Generating Rivers...');
      await yieldThread();
      this.generateRivers();
      
      if (onProgress) onProgress(0.70, 'Generating Biomes...');
      await yieldThread();
      this.generateBiomes();
      
      if (hasCapability(pt, PlanetCapability.FERTILITY)) {
        if (onProgress) onProgress(0.80, 'Generating Soil Fertility...');
        await yieldThread();
        this.generateFertility();
      }
      
      if (hasCapability(pt, PlanetCapability.FAUNA)) {
        if (onProgress) onProgress(0.90, 'Distributing Fauna...');
        await yieldThread();
      }

      if (hasCapability(pt, PlanetCapability.RESOURCES) || hasCapability(pt, PlanetCapability.SPICES)) {
        if (onProgress) onProgress(0.95, 'Mapping Surface Resources & Spices...');
        await yieldThread();
        this.generateResources();
      }
    }
    // Ocean World: has aquatic fauna/resources but no land biomes
    else if (pt === PlanetType.OCEAN_WORLD) {
      if (onProgress) onProgress(0.70, 'Generating Ocean Currents...');
      await yieldThread();
      this.generateRivers();
      
      if (hasCapability(pt, PlanetCapability.FAUNA)) {
        if (onProgress) onProgress(0.90, 'Populating Ocean Fauna...');
        await yieldThread();
        this.generateResources(); 
      }
    }
    // Dry rocky family: only ores
    else {
      if (onProgress) onProgress(0.80, 'Surveying Mineral Deposits...');
      await yieldThread();
      // Only ores are generated below, generateResources is skipped to strictly follow user rule
    }
    await yieldThread();
    this.generateRockyOres();

    if (onProgress) onProgress(1.0, 'Done');
  }

  private fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number, scale: number): number {
    let total = 0;
    let frequency = scale * this.config.planetSize;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      // Map x (0 to 1) to a circle in 3D space for seamless horizontal wrapping
      const angle = x * Math.PI * 2;
      const radius = 1 / (Math.PI * 2);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      
      total += this.noise3D(cx * frequency, y * frequency, cz * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxValue;
  }

  private generateTectonics() {
    const { width, height, numPlates } = this.config;
    const points = new Float64Array(numPlates * 2);
    
    for (let i = 0; i < numPlates; i++) {
      points[i * 2] = this.rng() * width;
      points[i * 2 + 1] = this.rng() * height;
      
      const isContinental = this.rng() > 0.5;
      this.plates.push({
        id: i,
        x: points[i * 2],
        y: points[i * 2 + 1],
        dx: (this.rng() - 0.5) * 2,
        dy: (this.rng() - 0.5) * 2,
        type: isContinental ? 'continental' : 'oceanic',
        baseElevation: isContinental ? 0.45 + this.rng() * 0.15 : 0.05 + this.rng() * 0.1
      });
    }

    // Assign pixels to plates
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Domain warping for jagged boundaries
        const warpX = (this.fbm(x / width, y / height, 4, 0.5, 2.0, 5.0) - 0.5) * 40;
        const warpY = (this.fbm(x / width + 0.5, y / height + 0.5, 4, 0.5, 2.0, 5.0) - 0.5) * 40;
        
        let wx = x + warpX;
        let wy = y + warpY;
        
        // Wrap wx
        if (wx < 0) wx += width;
        if (wx >= width) wx -= width;
        
        let closestPlate = 0;
        let secondClosestPlate = 0;
        let minDist = Infinity;
        let secondMinDist = Infinity;
        
        for (let i = 0; i < numPlates; i++) {
          const px = this.plates[i].x;
          const py = this.plates[i].y;
          
          let dx = Math.abs(wx - px);
          if (dx > width / 2) dx = width - dx;
          let dy = wy - py;
          
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            secondMinDist = minDist;
            secondClosestPlate = closestPlate;
            minDist = dist;
            closestPlate = i;
          } else if (dist < secondMinDist) {
            secondMinDist = dist;
            secondClosestPlate = i;
          }
        }
        
        this.tectonicPlates[index] = closestPlate;
        this.secondTectonicPlates[index] = secondClosestPlate;
        
        const distToBoundary = (secondMinDist - minDist) / 2;
        this.plateDistances[index] = distToBoundary;

        // Determine boundary type if close to boundary
        if (distToBoundary < 40) {
          const p1 = this.plates[closestPlate];
          const p2 = this.plates[secondClosestPlate];
          
          // Vector from p1 to p2
          let bdx = p2.x - p1.x;
          if (bdx > width / 2) bdx -= width;
          if (bdx < -width / 2) bdx += width;
          let bdy = p2.y - p1.y;
          
          // Normalize boundary vector
          const blen = Math.sqrt(bdx * bdx + bdy * bdy);
          bdx /= blen; bdy /= blen;
          
          // Relative velocity
          const rvx = p1.dx - p2.dx;
          const rvy = p1.dy - p2.dy;
          
          // Dot product of relative velocity and boundary normal
          const dot = rvx * bdx + rvy * bdy;
          
          if (dot > 0.3) {
            this.boundaryTypes[index] = 1; // Convergent
          } else if (dot < -0.3) {
            this.boundaryTypes[index] = 2; // Divergent
          } else {
            this.boundaryTypes[index] = 3; // Transform
          }
        } else {
          this.boundaryTypes[index] = 0;
        }
      }
    }
  }

  private generateElevation() {
    const { width, height, seaLevel } = this.config;
    
    const structuralElev = new Float32Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        const nx = x / width;
        const ny = y / height;
        
        const p1Id = this.tectonicPlates[index];
        const p2Id = this.secondTectonicPlates[index];
        const distToBoundary = this.plateDistances[index];
        const bType = this.boundaryTypes[index];
        
        const p1 = this.plates[p1Id];
        const p2 = this.plates[p2Id];
        
        // 1. Smooth blending of base plate elevations
        const blendZone = 40; // pixels
        let weight1 = 1.0;
        let weight2 = 0.0;
        
        if (distToBoundary < blendZone) {
            const t = distToBoundary / blendZone;
            // Smoothstep from 0.5 to 1.0: at t=0 (boundary), weight is 0.5. At t=1 (edge), weight is 1.0.
            weight1 = 0.5 + 0.5 * (t * t * (3 - 2 * t)); 
            weight2 = 1.0 - weight1;
        }
        
        let baseElev = p1.baseElevation * weight1 + p2.baseElevation * weight2;
        
        // 2. Continental shape noise (low frequency)
        // Using nx, ny directly prevents the skewed coordinate space that caused "ribbons"
        let shapeNoise = this.fbm(nx, ny, 5, 0.5, 2.0, 3.0);
        let elevation = baseElev + shapeNoise * 0.25;

        // 3. Tectonic boundary effects (Mountains, Trenches, Island Arcs)
        if (distToBoundary < 25) {
           const effect = Math.pow((25 - distToBoundary) / 25, 1.5); // Smooth falloff
           
           const getModifier = (p: Plate, other: Plate, pId: number, otherId: number) => {
               if (bType === 1) { // Convergent
                   if (p.type === 'continental' && other.type === 'continental') {
                       let mNoise = this.fbm(nx, ny, 4, 0.5, 2.0, 15.0);
                       mNoise = 1.0 - Math.abs(mNoise * 2.0 - 1.0); // Ridged noise
                       return (mNoise * mNoise) * 0.6; // Himalayas
                   } else if (p.type === 'continental' && other.type === 'oceanic') {
                       let mNoise = this.fbm(nx, ny, 4, 0.5, 2.0, 15.0);
                       mNoise = 1.0 - Math.abs(mNoise * 2.0 - 1.0); // Ridged noise
                       return (mNoise * mNoise) * 0.5; // Andes
                   } else if (p.type === 'oceanic' && other.type === 'continental') {
                       return -0.2; // Trench
                   } else {
                       // Island arcs (Oceanic-Oceanic Convergent)
                       if (pId > otherId) {
                           // High frequency noise for distinct islands in an archipelago
                           const hotspot = this.fbm(nx, ny, 3, 0.5, 2.0, 30.0);
                           if (hotspot > 0.65) {
                               const islandProfile = Math.pow((hotspot - 0.65) / 0.35, 2);
                               return islandProfile * 0.7;
                           }
                           return 0;
                       } else {
                           return -0.2; // Trench
                       }
                   }
               } else if (bType === 2) { // Divergent
                   if (p.type === 'oceanic' && other.type === 'oceanic') {
                       const ridgeNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 20.0);
                       return ridgeNoise * 0.1; // Mid-ocean ridge
                   } else if (p.type === 'continental' && other.type === 'continental') {
                       const riftNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 15.0);
                       return -riftNoise * 0.15; // Rift valley
                   }
               } else if (bType === 3) { // Transform
                   if (p.type === 'continental' && other.type === 'continental') {
                       const faultNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 25.0);
                       return (faultNoise - 0.5) * 0.1; // Broken terrain
                   } else {
                       return -0.02; // Subtle fault line depression
                   }
               }
               return 0;
           };

           const mod1 = getModifier(p1, p2, p1Id, p2Id);
           const mod2 = getModifier(p2, p1, p2Id, p1Id);
           
           // Blend the modifiers using the same weights as base elevation to ensure perfect continuity across the boundary seam
           const blendedMod = mod1 * weight1 + mod2 * weight2;
           elevation += effect * blendedMod;
        }

        structuralElev[index] = elevation;
      }
    }
    
    // Separable Box Blur to heal Voronoi Triple Point 1px Plate Jumps
    const tempElev = new Float32Array(width * height);
    const R = 3; // 7x7 blur filter (R=3) completely hides 1px jumps into perfect gentle slopes without wiping out continents
    const windowSize = R * 2 + 1;
    
    // Horizontal blur (with X wrapping)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let dx = -R; dx <= R; dx++) {
                let nx = x + dx;
                if (nx < 0) nx += width;
                if (nx >= width) nx -= width;
                sum += structuralElev[y * width + nx];
            }
            tempElev[y * width + x] = sum / windowSize;
        }
    }
    
    // Vertical blur (no Y wrapping, edges clamped)
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            for (let dy = -R; dy <= R; dy++) {
                let ny = y + dy;
                if (ny >= 0 && ny < height) {
                    sum += tempElev[ny * width + x];
                    count++;
                }
            }
            structuralElev[y * width + x] = sum / count; // Reuse array to save memory
        }
    }

    // 4. Flatten ocean floor and add ruggedness to land
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        let elevation = structuralElev[index];
        const nx = x / width;
        const ny = y / height;

        if (elevation < seaLevel) {
            const depth = seaLevel - elevation;
            elevation = seaLevel - Math.pow(depth, 0.7) * 0.3;
        } else {
            // Base land noise to prevent perfectly smooth flatlands/ramps, but keep it subtle for flatter plains
            let landNoise = (this.fbm(nx, ny, 4, 0.5, 2.0, 20.0) - 0.5) * 0.02;
            
            // Add mountain ranges based on elevation (higher = more rugged)
            // Squaring the ruggedness makes lowlands much flatter and highlands much sharper
            const normalizedElev = Math.max(0, (elevation - seaLevel) / (1 - seaLevel));
            const ruggedness = Math.pow(normalizedElev, 2.0); 
            
            let mNoise = this.fbm(nx, ny, 6, 0.5, 2.0, 12.0);
            mNoise = 1.0 - Math.abs(mNoise * 2.0 - 1.0); // Ridged noise for sharp mountain peaks
            
            elevation += landNoise + (mNoise * mNoise) * ruggedness * 0.5;
        }

        this.elevation[index] = Math.max(0, Math.min(1.0, elevation));
      }
    }
  }

  private generateClimate() {
    const { width, height, seaLevel, baseTemperature, baseMoisture } = this.config;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const elev = this.elevation[index];
        
        // Latitude: 0 at equator, 1 at poles
        const latitude = Math.abs(y / height - 0.5) * 2;
        
        // Base temperature
        let temp = 1.0 - Math.pow(latitude, 1.5); 
        
        // Apply baseTemperature offset (-0.5 to 0.5)
        temp += (baseTemperature - 0.5);
        
        // Altitude cooling (lapse rate)
        if (elev > seaLevel) {
          const altitude = (elev - seaLevel) / (1 - seaLevel);
          temp -= altitude * 0.6;
        }
        
        // Noise variation
        temp += this.fbm(x / width, y / height, 4, 0.5, 2.0, 3.0) * 0.1;
        this.temperature[index] = Math.max(0, Math.min(1, temp));
        
        // Moisture
        let moist = 0;
        if (elev <= seaLevel) {
          moist = 1.0; // Oceans are fully wet
        } else {
          // Base moisture from latitude (simplified Hadley cells)
          // Wet at equator (0), dry at tropics (0.3), wet at temperate (0.6), dry at poles (1.0)
          const cellMoisture = Math.cos(latitude * Math.PI * 3) * 0.5 + 0.5;
          moist = cellMoisture * 0.5 + 0.15; // Boost base moisture slightly
          
          // Apply baseMoisture offset (-0.5 to 0.5)
          moist += (baseMoisture - 0.5) * 1.5; // Make the slider have more impact
          
          // Add organic noise for moisture distribution (simulates complex weather patterns)
          // This replaces the 1D raycast which caused horizontal streaks
          moist += this.fbm(x / width + 0.5, y / height + 0.5, 5, 0.5, 2.0, 3.0) * 0.4;
          
          // Altitude drying (mountains are generally drier and hold less moisture)
          if (elev > seaLevel) {
              const altitude = (elev - seaLevel) / (1 - seaLevel);
              moist -= altitude * 0.4;
          }
        }
        
        this.moisture[index] = Math.max(0, Math.min(1, moist));
      }
    }
  }

  private generateRivers() {
    const { width, height, seaLevel } = this.config;
    // Visually half the rivers from the last try to prevent clutter
    const numRivers = Math.floor((width * height) / 1600); 
    
    // Top 70% of land threshold
    const highPlaceThreshold = seaLevel + (1.0 - seaLevel) * 0.3;
    const maxSteps = Math.max(10000, width * 2);

    for (let i = 0; i < numRivers; i++) {
        let x = Math.floor(this.rng() * width);
        let y = Math.floor(this.rng() * height);
        let index = y * width + x;
        
        if (this.elevation[index] <= highPlaceThreshold || this.moisture[index] < 0.2) {
            continue; // Must start at high moisture and high elevation
        }
        
        let volume = 1;
        let steps = 0;
        let visited = new Set<number>();
        let dirX = 0; 
        let dirY = 0;
        
        while (steps < maxSteps) {
            visited.add(index);
            volume += 0.5; // Water gets thicker
            
            // Draw visually wide rivers natively into waterAccumulation array
            let radius = Math.min(3.0, Math.max(1.5, 1.5 + volume / 50));
            let greenRadius = radius + 6.0; // 6 tiles wide fertile floodplains
            let rInt = Math.ceil(greenRadius); // Overshoot for sand and green buffers
            
            if (radius > 0) {
                for (let ry = -rInt; ry <= rInt; ry++) {
                    for (let rx = -rInt; rx <= rInt; rx++) {
                        let nx = x + rx;
                        let ny = y + ry;
                        
                        if (nx < 0) nx += width;
                        if (nx >= width) nx -= width;
                        
                        if (ny >= 0 && ny < height) {
                            let ni = ny * width + nx;
                            let dist = Math.sqrt(rx*rx + ry*ry);
                            
                            if (dist <= radius) {
                                // Ensure center builds up depth accumulation additively to create smooth deep centers
                                this.waterAccumulation[ni] += 2.0 + (volume / Math.max(1.0, dist));
                            } else if (dist <= radius + 2.0) {
                                // Sand buffer marker. Non-additive. Ensures it marks the rim but never overflows into deep water.
                                this.waterAccumulation[ni] = Math.max(this.waterAccumulation[ni], 1.0);
                            }
                            
                            // Floodplain Moisture Logic (Oasis/Nile effect)
                            if (dist <= greenRadius) {
                                // Add moisture smoothly falling off with distance
                                // The FBM adds irregularity so the green bank isn't a perfectly straight tube
                                const bankNoise = this.fbm(nx/width, ny/height, 3, 0.5, 2.0, 50.0);
                                if (bankNoise > 0.3) {
                                    // Soft moisture boost up to +0.45, dynamically clamped at 0.48 max
                                    // This guarantees rivers in deserts create GRASSLAND (cost 1, bright green) and don't spawn TROPICAL FORESTS.
                                    // Math.max guarantees we never dry out an already lush rainforest.
                                    const moistBoost = (1.0 - (dist / greenRadius)) * 0.45;
                                    const targetMoist = this.moisture[ni] + moistBoost;
                                    this.moisture[ni] = Math.max(this.moisture[ni], Math.min(targetMoist, 0.48));
                                }
                            }
                        }
                    }
                }
            }
            
            // Add extra to the exact center origin
            this.waterAccumulation[index] += volume;

            let bestDownhill = Infinity;
            let bestUphillScore = Infinity;
            let pNextX = -1; let pNextY = -1;
            let pUpNextX = -1; let pUpNextY = -1;
            
            // Look for next path
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    let nx = x + dx;
                    let ny = y + dy;
                    
                    if (nx < 0) nx += width;
                    if (nx >= width) nx -= width;
                    if (ny < 0 || ny >= height) continue;
                    
                    const nIndex = ny * width + nx;
                    if (visited.has(nIndex)) continue; // Never cross previous path in the same river
                    
                    const nElev = this.elevation[nIndex];
                    
                    // Route Elev: Apply a high frequency wobble noise ON TOP of the terrain slope strictly for river routing!
                    // This fractures the pure straight diagonal FBM ramps, forcing the river to snake (S-curves) left and right to find the artificial low points!
                    const wiggleNoise = this.fbm(nx / width, ny / height, 3, 0.5, 2.0, 300.0);
                    const routeElev = nElev + (wiggleNoise - 0.5) * 0.007; // Wobbles by +- 0.0035 elevation internally
                    
                    if (routeElev < this.elevation[index]) {
                        // Natural steep descent with guaranteed meandering
                        if (routeElev < bestDownhill) {
                            bestDownhill = routeElev;
                            pNextX = nx;
                            pNextY = ny;
                        }
                    } else {
                        // Uphill trapped / Crater basin edge
                        let penalty = 0;
                        if (dirX !== 0 || dirY !== 0) {
                             const len1 = Math.sqrt(dx*dx + dy*dy);
                             const len2 = Math.sqrt(dirX*dirX + dirY*dirY);
                             const dot = (dx * dirX + dy * dirY) / (len1 * len2);
                             // If turning sharply uphill from current momentum, penalize heavily
                             penalty = (1.0 - dot) * 0.03; 
                        }
                        const score = routeElev + penalty;
                        if (score < bestUphillScore) {
                            bestUphillScore = score;
                            pUpNextX = nx;
                            pUpNextY = ny;
                        }
                    }
                }
            }
            
            let nextX = -1;
            let nextY = -1;

            if (pNextX !== -1) {
                // Flow down organically!
                nextX = pNextX;
                nextY = pNextY;
            } else if (pUpNextX !== -1) {
                // Must spill over trap, pick the path of least resistance using inertia to avoid spiraling
                nextX = pUpNextX;
                nextY = pUpNextY;
                // CRUCIAL DIFFERENCE: We do NOT artificialize / destruct the elevation array!
                // Keeping original native FBM noise ensures future downhill calculations function perfectly.
            } else {
                // Fully trapped by its own visited pixels. End river.
                break;
            }
            
            let stepDx = nextX - x;
            let stepDy = nextY - y;
            if (stepDx > 1) stepDx = -1;
            if (stepDx < -1) stepDx = 1;
            
            // Adjust momentum vector
            dirX = dirX * 0.7 + stepDx * 0.3;
            dirY = dirY * 0.7 + stepDy * 0.3;
            
            x = nextX;
            y = nextY;
            index = y * width + x;
            steps++;
            
            if (this.elevation[index] <= seaLevel) {
                break; // Hit the Coastline
            }
        }
    }
  }

  private generateBiomes() {
    const { width, height, seaLevel } = this.config;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const elev = this.elevation[index];
        const temp = this.temperature[index];
        const moist = this.moisture[index];
        const waterAcc = this.waterAccumulation[index];
        
        let biome = BiomeType.GRASSLAND;
        
        if (elev <= seaLevel) {
            // Ocean Biomes
            if (temp < 0.15) {
                biome = BiomeType.OCEAN_ICE;
            } else if (elev > seaLevel - 0.15) {
                biome = BiomeType.OCEAN_SHALLOW;
            } else {
                biome = BiomeType.OCEAN_DEEP;
            }
        } else {
            // Land Biomes (Whittaker Classification)
            if (temp < 0.15) {
                biome = BiomeType.SNOW;
            } else if (temp < 0.25) {
                biome = BiomeType.TUNDRA;
            } else if (temp < 0.35) {
                if (moist > 0.4) biome = BiomeType.TAIGA;
                else if (moist > 0.2) biome = BiomeType.STEPPE;
                else biome = BiomeType.COLD_DESERT;
            } else if (temp < 0.65) {
                if (moist > 0.8) biome = BiomeType.TEMPERATE_RAINFOREST;
                else if (moist > 0.5) biome = BiomeType.SEASONAL_FOREST;
                else if (moist > 0.35) biome = BiomeType.GRASSLAND;
                else biome = BiomeType.STEPPE;
            } else {
                if (moist > 0.65) biome = BiomeType.TROPICAL_RAINFOREST;
                else if (moist > 0.45) biome = BiomeType.SAVANNA;
                else biome = BiomeType.SUBTROPICAL_DESERT;
            }
        }
        
        this.biomeIds[index] = biome;
        
        // Movement Cost logic
        let cost = BIOME_BASE_COSTS[biome];
        
        if (elev > seaLevel) {
            // ----- DYNAMIC TREE CANOPY PENALTY -----
            const nx = x / width;
            const ny = y / height;
            const baseVegNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 40.0);
            const detailVegNoise = this.fbm(nx, ny, 2, 0.5, 2.0, 150.0);
            const vegNoise = baseVegNoise * 0.7 + detailVegNoise * 0.3;
            
            let treeCapacity = moist;
            if (temp < 0.2) treeCapacity *= Math.max(0, temp / 0.2); 
            if (temp > 0.7 && moist < 0.25) treeCapacity *= 0.3; 
            
            let rawVegDensity = (treeCapacity * 2.2) + (vegNoise - 0.5) * 1.2 - 0.2;
            
            const edge0 = 0.1;
            const edge1 = 0.8;
            const tVeg = Math.max(0, Math.min(1, (rawVegDensity - edge0) / (edge1 - edge0)));
            let vegDensity = tVeg * tVeg * (3 - 2 * tVeg);
            
            if (vegDensity > 0.1) {
                // Modest woods vs densely packed jungle trees
                cost += vegDensity > 0.6 ? 2 : 1; 
            }

            // Use slope magnitudes previously matched to visual shading
            let leftElev = elev;
            let upElev = elev;
            if (x > 0) leftElev = this.elevation[index - 1];
            if (y > 0) upElev = this.elevation[index - width];
            
            const dx = elev - leftElev;
            const dy = elev - upElev;
            const slopeMagnitude = Math.sqrt(dx * dx + dy * dy) * 100.0;
            
            // Relevo obstacles addition
            if (slopeMagnitude > 1.2) {
                cost += 3; // Mountainous/Rocky
            } else if (slopeMagnitude > 0.8) {
                cost += 2; // Foothills
            } else if (slopeMagnitude > 0.4) {
                cost += 1; // Hills / Morros
            }
            
            // River traversal penalty (+2 movement)
            if (waterAcc >= 2.0) {
                cost += 2;
            }
        }
        
        this.movementCosts[index] = Math.min(255, cost);
      }
    }
  }

  private generateFertility() {
    const { width, height, seaLevel } = this.config;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const elev = this.elevation[index];
        
        if (elev <= seaLevel) {
          this.fertility[index] = 0;
          continue;
        }
        
        const temp = this.temperature[index];
        const moist = this.moisture[index];
        const waterAcc = this.waterAccumulation[index];
        
        // 1. Temperature: Frost/Tundra kills fertility. Desert heat diminishes it. Best is 0.4 - 0.7
        let tempScore = 1.0;
        if (temp < 0.25) tempScore = Math.max(0, temp / 0.25);
        else if (temp > 0.8) tempScore = Math.max(0.5, 1.0 - (temp - 0.8) * 1.5); 
        
        // 2. Moisture is critical (Exponential curve to visibly pop oasis borders in deserts)
        let moistScore = Math.pow(moist, 0.45);
        
        // 3. Slope: Mountains erode topsoil. Valleys collect it.
        let leftElev = elev;
        let upElev = elev;
        if (x > 0) leftElev = this.elevation[index - 1];
        if (y > 0) upElev = this.elevation[index - width];
        
        const dx = elev - leftElev;
        const dy = elev - upElev;
        const slopeMagnitude = Math.sqrt(dx * dx + dy * dy) * 100.0;
        
        let slopeScore = Math.max(0, 1.0 - (slopeMagnitude * 0.8));
        if (slopeMagnitude <= 0.2) slopeScore = 1.0; // Perfect flat plains
        
        let fertility = tempScore * moistScore * slopeScore;
        
        // 4. River Silt: Floodplains deposit super-rich minerals
        if (waterAcc >= 1.0) {
            fertility = Math.min(1.0, fertility + 0.5);
        }
        
        // 5. Volcanic Ash: Tectonic boundaries
        const distToPlate = this.plateDistances[index];
        const bType = this.boundaryTypes[index];
        if ((bType === 1 || bType === 2) && distToPlate < 15) {
            const ashBonus = (1.0 - (distToPlate / 15)) * 0.4;
            fertility = Math.min(1.0, fertility + ashBonus);
        }
        
        // FBM dirt irregularity
        const soilNoise = this.fbm(x / width, y / height, 3, 0.5, 2.0, 100.0) - 0.5;
        fertility = Math.max(0, Math.min(1.0, fertility + soilNoise * 0.2));
        
        this.fertility[index] = fertility;
      }
    }
  }

  private generateResources() {
    const { width, height, seaLevel } = this.config;
    const pt = this.config.planetType;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const elev = this.elevation[index];
        const temp = this.temperature[index];
        const moist = this.moisture[index];
        const biome = this.biomeIds[index];
        const waterAcc = this.waterAccumulation[index];
        const nx = x / width;
        const ny = y / height;
        const distToPlate = this.plateDistances[index];
        const bType = this.boundaryTypes[index];
        
        // ==================== ORES ====================
        if (elev > seaLevel) {
            const landHeight = (elev - seaLevel) / (1 - seaLevel);
            let leftElev = elev;
            let upElev = elev;
            if (x > 0) leftElev = this.elevation[index - 1];
            if (y > 0) upElev = this.elevation[index - width];
            const dx = elev - leftElev;
            const dy = elev - upElev;
            const slopeMag = Math.sqrt(dx * dx + dy * dy) * 100.0;
            
            let oreScore = Math.pow(landHeight, 0.6) * 0.6;
            if (slopeMag > 0.5) oreScore += Math.min(0.3, slopeMag * 0.15);
            if ((bType === 1 || bType === 2) && distToPlate < 20) {
                oreScore += (1.0 - distToPlate / 20) * 0.4;
            }
            if (biome === BiomeType.SUBTROPICAL_DESERT || biome === BiomeType.COLD_DESERT) {
                oreScore += 0.2;
            }
            
            const oreNoise = this.fbm(nx, ny, 4, 0.5, 2.0, 60.0);
            const oreVein = this.fbm(nx + 5.7, ny + 3.2, 3, 0.5, 2.5, 120.0);
            oreScore += (oreNoise - 0.5) * 0.3;
            if (oreVein > 0.65) oreScore += (oreVein - 0.65) * 1.5;
            
            this.ores[index] = Math.max(0, Math.min(1.0, oreScore));
        } else {
            this.ores[index] = 0;
        }
        
        // ==================== SPICES ====================
        if (elev > seaLevel && hasCapability(pt, PlanetCapability.BIOMES)) {
            let spiceScore = 0;
            if (biome === BiomeType.SAVANNA) spiceScore = 0.15;
            if (biome === BiomeType.SEASONAL_FOREST) spiceScore = 0.25;
            if (biome === BiomeType.TROPICAL_RAINFOREST) spiceScore = 0.55;
            if (biome === BiomeType.TEMPERATE_RAINFOREST) spiceScore = 0.35;
            
            if (temp < 0.35) spiceScore *= 0.1;
            else if (temp > 0.5) spiceScore *= 1.0 + (temp - 0.5) * 0.5;
            spiceScore *= Math.pow(moist, 0.3);
            
            if (waterAcc >= 1.0 && waterAcc < 10.0 && temp > 0.5) {
                spiceScore += 0.25;
            }
            
            // VegDensity for higher tiers
            const baseVeg = this.fbm(nx, ny, 3, 0.5, 2.0, 40.0);
            const detVeg = this.fbm(nx, ny, 2, 0.5, 2.0, 150.0);
            const rawVeg = (moist * 2.2) + (baseVeg * 0.7 + detVeg * 0.3 - 0.5) * 1.2 - 0.2;
            const tV = Math.max(0, Math.min(1, (rawVeg - 0.1) / 0.7));
            const vegDensity = tV * tV * (3 - 2 * tV);
            
            if (vegDensity > 0.8 && temp > 0.6) spiceScore += 0.2;
            if ((bType === 1 || bType === 2) && distToPlate < 10 && biome === BiomeType.TROPICAL_RAINFOREST) {
                spiceScore += 0.3;
            }
            
            const spiceNoise = this.fbm(nx + 2.1, ny + 1.3, 3, 0.5, 2.0, 80.0);
            spiceScore += (spiceNoise - 0.5) * 0.2;
            this.spices[index] = Math.max(0, Math.min(1.0, spiceScore));
        } else {
            this.spices[index] = 0;
        }
        
        // ==================== ENVIRONMENTAL RESOURCES (Wood/Stone/Clay) ====================
        if (elev > seaLevel) {
            let resScore = 0;
            
            // Wood: Only for biomes-capable planets
            if (hasCapability(pt, PlanetCapability.BIOMES)) {
                const baseVegR = this.fbm(nx, ny, 3, 0.5, 2.0, 40.0);
                const detVegR = this.fbm(nx, ny, 2, 0.5, 2.0, 150.0);
                const rawVegR = (moist * 2.2) + (baseVegR * 0.7 + detVegR * 0.3 - 0.5) * 1.2 - 0.2;
                const tVR = Math.max(0, Math.min(1, (rawVegR - 0.1) / 0.7));
                const vegDensR = tVR * tVR * (3 - 2 * tVR);
                
                if (vegDensR > 0.1) {
                    resScore = vegDensR * 0.5;
                    if (biome === BiomeType.TAIGA) resScore += 0.15;
                    if (biome === BiomeType.TROPICAL_RAINFOREST || biome === BiomeType.TEMPERATE_RAINFOREST) resScore += 0.25;
                }
            }
            
            // Stone/Marble: steep slopes and rocky outcrops (All Solid Planets)
            let lElev = elev;
            let uElev = elev;
            if (x > 0) lElev = this.elevation[index - 1];
            if (y > 0) uElev = this.elevation[index - width];
            const slopeR = Math.sqrt(Math.pow(elev - lElev, 2) + Math.pow(elev - uElev, 2)) * 100.0;
            
            if (slopeR > 0.6) {
                resScore += Math.min(0.4, (slopeR - 0.6) * 0.3);
            }
            
            // Clay/Reeds: river adjacent lowlands
            if (waterAcc >= 1.0 && waterAcc < 5.0 && slopeR < 0.3) {
                resScore += 0.2;
            }
            
            const resNoise = this.fbm(nx + 8.3, ny + 4.7, 3, 0.5, 2.0, 70.0);
            resScore += (resNoise - 0.5) * 0.15;
            this.resources[index] = Math.max(0, Math.min(1.0, resScore));
        } else {
            this.resources[index] = 0;
        }
        
        // ==================== FAUNA ====================
        if (hasCapability(pt, PlanetCapability.FAUNA)) {
            let faunaScore = 0;
            if (elev <= seaLevel) {
                // Aquatic
                const depth = 1.0 - (elev / seaLevel);
                if (depth < 0.3) faunaScore = 0.12 + depth * 0.3;
                else if (depth < 0.55) faunaScore = 0.30 + (depth - 0.3) * 0.6;
                else {
                    faunaScore = 0.50 + (depth - 0.55) * 0.6;
                    if (temp < 0.25) faunaScore += 0.15; // Ice leviathans
                    if (depth > 0.8) faunaScore += 0.2; // Abyssal
                }
                const fNoise = this.fbm(nx + 6.1, ny + 9.4, 3, 0.5, 2.0, 50.0);
                faunaScore += (fNoise - 0.5) * 0.1;
            } else {
                // Terrestrial
                const landHeight = (elev - seaLevel) / (1 - seaLevel);
                if (waterAcc > 2.0) faunaScore = 0.2;
                else if (biome === BiomeType.GRASSLAND || biome === BiomeType.STEPPE) faunaScore = 0.35;
                else if (biome === BiomeType.SAVANNA) faunaScore = 0.30;
                else if (biome === BiomeType.SEASONAL_FOREST || biome === BiomeType.TAIGA) faunaScore = 0.4;
                else if (biome === BiomeType.TROPICAL_RAINFOREST) faunaScore = 0.65;
                
                if (landHeight > 0.7) faunaScore *= 0.5; // Altitude penalty
                faunaScore += (this.fbm(nx + 6.1, ny + 9.4, 3, 0.5, 2.0, 50.0) - 0.5) * 0.15;
            }
            this.fauna[index] = Math.max(0, Math.min(1.0, faunaScore));
        } else {
            this.fauna[index] = 0;
        }
      }
    }
  }

  private generateGasGiant() {
    const { width, height, bandContrast, stormFrequency } = this.config;
    const bc = bandContrast || 0.6;
    const sf = stormFrequency || 0.4;

    // Pre-generate storm data (oval vortices at fixed positions)
    const stormCount = Math.floor(2 + sf * 15);
    const storms: { cx: number; cy: number; rx: number; ry: number; intensity: number; rotation: number }[] = [];
    for (let s = 0; s < stormCount; s++) {
      storms.push({
        cx: this.fbm(s * 1.7 + 0.1, s * 2.3 + 0.2, 1, 0.5, 2, 1),
        cy: 0.12 + this.fbm(s * 3.1 + 0.3, s * 0.7 + 0.4, 1, 0.5, 2, 1) * 0.76,
        rx: 0.015 + this.fbm(s * 5.5 + 0.5, 0, 1, 0.5, 2, 1) * (s < 2 ? 0.04 : 0.02), // first 2 can be big
        ry: 0.008 + this.fbm(s * 4.2 + 0.6, 0, 1, 0.5, 2, 1) * (s < 2 ? 0.02 : 0.01),
        intensity: 0.4 + this.fbm(s * 6.1, s * 7.2, 1, 0.5, 2, 1) * 0.6,
        rotation: this.fbm(s * 8.3, s * 9.1, 1, 0.5, 2, 1) * Math.PI * 2,
      });
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const nx = x / width;
        const ny = y / height;

        // === DOMAIN WARPING for turbulent band edges ===
        // Low-freq warp creates large-scale chevron/wave patterns at band boundaries
        const warpAmt = 0.03 + bc * 0.04;
        const warpX = this.fbm(nx * 2.0 + 13.7, ny * 1.5 + 5.3, 3, 0.55, 2.0, 15.0) * warpAmt;
        const warpY = this.fbm(nx * 1.8 + 7.1, ny * 2.0 + 11.9, 3, 0.55, 2.0, 15.0) * warpAmt;
        const wny = ny + warpX;
        const wnx = nx + warpY * 0.3; // mostly horizontal warp

        // === MULTI-FREQUENCY BANDS (varied widths) ===
        // Layer 1: broad bands (major zones/belts)
        const band1 = Math.sin(wny * Math.PI * 12.0) * 0.5 + 0.5;
        // Layer 2: medium subdivisions
        const band2 = Math.sin(wny * Math.PI * 22.0 + wnx * 0.5) * 0.5 + 0.5;
        // Layer 3: fine detail bands
        const band3 = Math.sin(wny * Math.PI * 38.0 + wnx * 1.2) * 0.5 + 0.5;

        // Combine with decreasing weight for natural varied-width appearance
        const bandMix = band1 * 0.55 + band2 * 0.30 + band3 * 0.15;

        // === WITHIN-BAND TURBULENCE (streaky cloud detail) ===
        // Horizontally elongated noise for the streaky appearance
        const inBandTurb = this.fbm(wnx * 6.0, wny * 0.8, 4, 0.5, 2.0, 40.0);
        // Fine wispy detail
        const wispNoise = this.fbm(wnx * 10.0 + 3.3, wny * 1.5 + 7.7, 3, 0.5, 2.0, 80.0);

        let value = bandMix + (inBandTurb - 0.5) * bc * 0.35 + (wispNoise - 0.5) * 0.08;

        // === STORM VORTICES (oval with spiral arms) ===
        let stormValue = 0;
        let stormDark = 0; // dark spots
        for (const storm of storms) {
          let dx = nx - storm.cx;
          if (dx > 0.5) dx -= 1.0;
          if (dx < -0.5) dx += 1.0;
          const dy = ny - storm.cy;

          // Rotated elliptical distance
          const cosR = Math.cos(storm.rotation), sinR = Math.sin(storm.rotation);
          const rx = (dx * cosR + dy * sinR) / storm.rx;
          const ry = (-dx * sinR + dy * cosR) / storm.ry;
          const dist = Math.sqrt(rx * rx + ry * ry);

          if (dist < 1.5) {
            // Spiral arm pattern
            const angle = Math.atan2(ry, rx);
            const spiral = Math.sin(angle * 2 + dist * 8 - storm.rotation * 3) * 0.5 + 0.5;

            if (dist < 1.0) {
              const t = 1.0 - dist;
              const stormContrib = t * t * storm.intensity * (0.7 + spiral * 0.3);
              stormValue = Math.max(stormValue, stormContrib);
            }
            // Outer swirl influence
            if (dist >= 0.8 && dist < 1.5) {
              const outerT = (1.5 - dist) / 0.7;
              value += outerT * spiral * 0.05 * storm.intensity;
            }
          }
        }

        // Small dark spots (scattered across bands)
        const spotNoise = this.fbm(nx * 15 + 5.5, ny * 15 + 3.3, 2, 0.5, 2, 1);
        if (spotNoise > 0.78) {
          stormDark = (spotNoise - 0.78) / 0.22 * 0.4;
        }

        // Small bright spots (white ovals)
        const brightSpotNoise = this.fbm(nx * 12 + 9.9, ny * 12 + 1.1, 2, 0.5, 2, 1);
        let brightSpot = 0;
        if (brightSpotNoise > 0.80) {
          brightSpot = (brightSpotNoise - 0.80) / 0.20 * 0.3;
        }

        value = Math.max(0, Math.min(1, value));

        this.elevation[index] = value;
        // Secondary channel: within-band color richness
        this.moisture[index] = this.fbm(wnx * 4.0 + 7.7, wny * 0.6 + 3.3, 4, 0.5, 2.0, 50.0);
        // Storm channel: pack storm & spots data
        this.temperature[index] = Math.max(0, Math.min(1, stormValue + brightSpot - stormDark));
      }
    }
  }

  private generateCraters() {
    const { width, height, craterDensity } = this.config;
    const density = craterDensity || 0.5;
    
    // 3 tiers of craters by size
    const largeCraters = Math.floor(5 + density * 15);
    const mediumCraters = Math.floor(80 + density * 250);
    const smallCraters = Math.floor(1500 + density * 4000);
    
    const applyCrater = (cx: number, cy: number, radius: number, depthFactor: number) => {
      const rimRadius = radius * 1.2;
      const ejectaRadius = radius * 1.8;
      
      for (let dy = -Math.ceil(ejectaRadius); dy <= ejectaRadius; dy++) {
        const py = cy + dy;
        if (py < 0 || py >= height) continue;
        for (let dx = -Math.ceil(ejectaRadius); dx <= ejectaRadius; dx++) {
          let px = (cx + dx) % width;
          if (px < 0) px += width;
          
          const dist = Math.sqrt(dx * dx + dy * dy);
          const idx = py * width + px;
          
          if (dist < radius) {
            // Bowl depression: parabolic profile
            const t = dist / radius;
            const bowlDepth = (1 - t * t) * depthFactor;
            this.elevation[idx] -= bowlDepth;
          } else if (dist < rimRadius) {
            // Raised rim
            const t = (dist - radius) / (rimRadius - radius);
            const rimHeight = (1 - t) * depthFactor * 0.3;
            this.elevation[idx] += rimHeight;
          } else if (dist < ejectaRadius) {
            // Ejecta blanket: gentle elevation bump
            const t = (dist - rimRadius) / (ejectaRadius - rimRadius);
            const ejecta = (1 - t) * depthFactor * 0.08;
            this.elevation[idx] += ejecta;
          }
        }
      }
    };
    
    // Large impacts
    for (let i = 0; i < largeCraters; i++) {
      const cx = Math.floor(this.rng() * width);
      const cy = Math.floor(this.rng() * height * 0.9 + height * 0.05);
      const radius = 20 + this.rng() * 45;
      applyCrater(cx, cy, radius, 0.06 + this.rng() * 0.04);
    }
    
    // Medium impacts
    for (let i = 0; i < mediumCraters; i++) {
      const cx = Math.floor(this.rng() * width);
      const cy = Math.floor(this.rng() * height);
      const radius = 5 + this.rng() * 18;
      applyCrater(cx, cy, radius, 0.03 + this.rng() * 0.03);
    }
    
    // Small impacts (microcraters)
    for (let i = 0; i < smallCraters; i++) {
      const cx = Math.floor(this.rng() * width);
      const cy = Math.floor(this.rng() * height);
      const radius = 1 + this.rng() * 5;
      applyCrater(cx, cy, radius, 0.01 + this.rng() * 0.02);
    }
    
    // Normalize elevation back to 0-1 range
    let minElev = Infinity, maxElev = -Infinity;
    for (let i = 0; i < width * height; i++) {
      if (this.elevation[i] < minElev) minElev = this.elevation[i];
      if (this.elevation[i] > maxElev) maxElev = this.elevation[i];
    }
    const range = maxElev - minElev || 1;
    for (let i = 0; i < width * height; i++) {
      this.elevation[i] = (this.elevation[i] - minElev) / range;
    }
  }

  private generateRockyOres() {
    const { width, height } = this.config;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const elev = this.elevation[index];
        const nx = x / width;
        const ny = y / height;
        const distToPlate = this.plateDistances[index];
        const bType = this.boundaryTypes[index];
        
        // Rocky planets: ore everywhere, no sea level gating
        let oreScore = elev * 0.4; // Higher = more ore
        
        // Slope calculation
        let leftElev = elev;
        let upElev = elev;
        if (x > 0) leftElev = this.elevation[index - 1];
        if (y > 0) upElev = this.elevation[index - width];
        const dx = elev - leftElev;
        const dy = elev - upElev;
        const slopeMag = Math.sqrt(dx * dx + dy * dy) * 100.0;
        
        // Crater rims and slopes expose ore veins
        if (slopeMag > 0.4) oreScore += Math.min(0.3, slopeMag * 0.2);
        
        // Tectonic zones
        if ((bType === 1 || bType === 2) && distToPlate < 20) {
          oreScore += (1.0 - distToPlate / 20) * 0.4;
        }
        
        // FBM vein patterns
        const oreNoise = this.fbm(nx, ny, 4, 0.5, 2.0, 60.0);
        const oreVein = this.fbm(nx + 5.7, ny + 3.2, 3, 0.5, 2.5, 120.0);
        oreScore += (oreNoise - 0.5) * 0.25;
        if (oreVein > 0.65) oreScore += (oreVein - 0.65) * 1.5;
        
        this.ores[index] = Math.max(0, Math.min(1.0, oreScore));
        
        // Resources: only stone/regolith on rocky planets
        let resScore = 0;
        if (slopeMag > 0.5) resScore += Math.min(0.5, (slopeMag - 0.5) * 0.4);
        resScore += elev * 0.2;
        const resNoise = this.fbm(nx + 8.3, ny + 4.7, 3, 0.5, 2.0, 70.0);
        resScore += (resNoise - 0.5) * 0.15;
        this.resources[index] = Math.max(0, Math.min(1.0, resScore));
      }
    }
  }
  // Helper: slope-lit rocky surface with configurable base color
  private renderRockySurface(index: number, x: number, y: number, bR: number, bG: number, bB: number): [number, number, number] {
    const { width, height } = this.config;
    const elev = this.elevation[index];
    const nx = x / width, ny = y / height;
    const bright = 0.6 + elev * 0.5;
    let r = Math.floor(bR * bright), g = Math.floor(bG * bright), b = Math.floor(bB * bright);
    const sn = this.fbm(nx, ny, 4, 0.5, 2.0, 80.0);
    const mv = (sn - 0.5) * 30;
    r = Math.max(0, Math.min(255, r + Math.floor(mv)));
    g = Math.max(0, Math.min(255, g + Math.floor(mv * 0.8)));
    b = Math.max(0, Math.min(255, b + Math.floor(mv * 0.6)));
    if (elev < 0.3) { const d = (0.3 - elev) / 0.3; r = Math.floor(r * (1 - d * 0.3)); g = Math.floor(g * (1 - d * 0.3)); b = Math.floor(b * (1 - d * 0.3)); }
    const ej = this.fbm(nx + 3.3, ny + 7.7, 3, 0.5, 2.0, 200.0);
    if (ej > 0.6 && elev > 0.4) { const t = (ej - 0.6) / 0.4; r = Math.min(255, r + Math.floor(t * 40)); g = Math.min(255, g + Math.floor(t * 40)); b = Math.min(255, b + Math.floor(t * 35)); }
    let le = elev, ue = elev;
    if (x > 0) le = this.elevation[index - 1]; if (y > 0) ue = this.elevation[index - width];
    const dx = elev - le, dy = elev - ue;
    const slope = (dx + dy) * 50.0;
    const shade = Math.max(0.3, Math.min(1.6, 1.0 + slope));
    return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
  }

  // Helper: slope calculation
  private getSlope(index: number, x: number, y: number): [number, number, number] {
    const { width } = this.config;
    const elev = this.elevation[index];
    let le = elev, ue = elev;
    if (x > 0) le = this.elevation[index - 1]; if (y > 0) ue = this.elevation[index - width];
    const dx = elev - le, dy = elev - ue;
    return [dx, dy, Math.sqrt(dx * dx + dy * dy) * 100.0];
  }

  private renderPlanetSurface(index: number, x: number, y: number): [number, number, number] {
    const { width, height, seaLevel } = this.config;
    const pt = this.config.planetType;
    const elev = this.elevation[index];
    const nx = x / width, ny = y / height;

    // ============================================================
    // ROCKY AIRLESS
    // ============================================================
    if (pt === PlanetType.ROCKY_AIRLESS) {
      const h = this.config.surfaceHue || 'gray';
      const [bR, bG, bB] = h === 'reddish' ? [160,115,90] : h === 'yellowish' ? [170,155,100] : [140,140,135];
      return this.renderRockySurface(index, x, y, bR, bG, bB);
    }

    // ============================================================
    // ARID (Mars-like)
    // ============================================================
    if (pt === PlanetType.ARID) {
      const h = this.config.surfaceHue || 'reddish';
      let bR: number, bG: number, bB: number;
      if (h === 'yellowish') { bR=185; bG=170; bB=110; }
      else if (h === 'orange') { bR=190; bG=140; bB=80; }
      else if (h === 'gray') { bR=150; bG=145; bB=135; }
      else { bR=180; bG=115; bB=80; } // reddish default

      const bright = 0.55 + elev * 0.55;
      let r = Math.floor(bR * bright), g = Math.floor(bG * bright), b = Math.floor(bB * bright);

      // Dust dunes noise
      const dust = this.config.dustStormIntensity || 0.3;
      const duneNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 60.0);
      const duneStripe = Math.sin((nx * 300 + duneNoise * 20) * Math.PI) * 0.5 + 0.5;
      const duneEffect = duneStripe * dust * 0.15;
      r = Math.min(255, r + Math.floor(duneEffect * 40));
      g = Math.min(255, g + Math.floor(duneEffect * 30));

      // Canyon darkening in steep slopes
      const [dx, dy, sm] = this.getSlope(index, x, y);
      if (sm > 0.8) { const t = Math.min(1, (sm - 0.8) * 0.5); r = Math.floor(r * (1 - t * 0.4)); g = Math.floor(g * (1 - t * 0.4)); b = Math.floor(b * (1 - t * 0.4)); }

      // Thin CO2 polar caps (at extreme latitudes only, very thin)
      const latAbs = Math.abs(ny - 0.5) * 2;
      if (latAbs > 0.85) { const ic = Math.min(1, (latAbs - 0.85) / 0.15); r = Math.floor(r * (1-ic) + 220 * ic); g = Math.floor(g * (1-ic) + 210 * ic); b = Math.floor(b * (1-ic) + 200 * ic); }

      const slope = (dx + dy) * 45.0;
      const shade = Math.max(0.35, Math.min(1.5, 1.0 + slope));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // TOXIC ATMOSPHERE (Venus-like)
    // ============================================================
    if (pt === PlanetType.TOXIC_ATMOSPHERE) {
      const h = this.config.surfaceHue || 'yellowish';
      const [bR, bG, bB] = h === 'reddish' ? [160,100,70] : h === 'gray' ? [130,125,120] : [175,155,90];

      // Base rocky surface
      let [r, g, b] = this.renderRockySurface(index, x, y, bR, bG, bB);

      // Lava flows in low areas
      const va = this.config.volcanicActivity || 0.4;
      const lavaNoise = this.fbm(nx + 2.2, ny + 4.4, 3, 0.5, 2.0, 40.0);
      if (elev < 0.35 && lavaNoise > (0.7 - va * 0.3)) {
        const t = Math.min(1, (lavaNoise - (0.7 - va * 0.3)) * 5);
        r = Math.floor(r * (1-t) + 220 * t); g = Math.floor(g * (1-t) + 100 * t); b = Math.floor(b * (1-t) + 20 * t);
      }

      return [r, g, b];
    }

    // ============================================================
    // GLACIAL (Pluto-like)
    // ============================================================
    if (pt === PlanetType.GLACIAL) {
      const h = this.config.surfaceHue || 'white-blue';
      let bR: number, bG: number, bB: number;
      if (h === 'pinkish') { bR=210; bG=185; bB=190; }
      else if (h === 'pale-blue') { bR=180; bG=200; bB=230; }
      else { bR=210; bG=220; bB=240; } // white-blue

      const bright = 0.7 + elev * 0.35;
      let r = Math.floor(bR * bright), g = Math.floor(bG * bright), b = Math.floor(bB * bright);

      // Nitrogen plains (smooth low areas)
      if (elev < 0.4) {
        const plainNoise = this.fbm(nx + 1.1, ny + 2.2, 2, 0.5, 2.0, 50.0);
        const pt2 = (0.4 - elev) / 0.4 * plainNoise;
        r = Math.floor(r * (1-pt2*0.3) + 220 * pt2*0.3); g = Math.floor(g * (1-pt2*0.2) + 215 * pt2*0.2); b = Math.floor(b * (1-pt2*0.1));
      }

      // Ice fractures
      const fd = this.config.iceFractureDensity || 0.5;
      const fracNoise = this.fbm(nx, ny, 4, 0.5, 2.0, 100.0);
      const isFrac = Math.abs(fracNoise - 0.5) < (0.015 + fd * 0.02);
      if (isFrac) { r = Math.floor(r * 0.5); g = Math.floor(g * 0.5); b = Math.floor(b * 0.6); }

      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.5, Math.min(1.4, 1.0 + (dx + dy) * 40));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // GAS GIANT
    // ============================================================
    if (pt === PlanetType.GAS_GIANT) {
      const v = this.elevation[index]; // band value (0-1)
      const m = this.moisture[index];  // secondary color noise
      const stormData = this.temperature[index]; // storm/spot data
      const cp = this.config.colorPalette || 'jovian';

      // 6-stop gradient palette [R,G,B] for rich band coloring
      // stops at v=0.0, 0.2, 0.4, 0.6, 0.8, 1.0
      type C = [number,number,number];
      let stops: C[];
      if (cp === 'saturnian') {
        stops = [[160,145,110],[180,165,125],[200,185,145],[215,200,160],[230,215,175],[240,230,200]];
      } else if (cp === 'uranian') {
        stops = [[50,110,150],[70,140,175],[90,165,195],[120,185,210],[150,205,225],[180,220,235]];
      } else if (cp === 'alien-purple') {
        stops = [[55,25,80],[80,40,115],[120,60,150],[155,85,180],[180,110,200],[200,140,220]];
      } else if (cp === 'crimson') {
        stops = [[70,20,15],[110,35,25],[155,55,35],[185,80,45],[210,110,60],[230,140,80]];
      } else { // jovian (matched to reference image)
        stops = [[120,80,50],[160,115,70],[195,165,115],[215,195,155],[235,220,190],[245,238,225]];
      }

      // Interpolate through 6 stops
      const seg = Math.min(4, Math.floor(v * 5));
      const segT = (v * 5) - seg;
      const s0 = stops[seg], s1 = stops[Math.min(5, seg + 1)];
      let r = Math.floor(s0[0]*(1-segT) + s1[0]*segT);
      let g = Math.floor(s0[1]*(1-segT) + s1[1]*segT);
      let b = Math.floor(s0[2]*(1-segT) + s1[2]*segT);

      // Secondary noise adds within-band color richness
      const mVar = (m - 0.5) * 25;
      r = Math.max(0, Math.min(255, r + Math.floor(mVar * 0.8)));
      g = Math.max(0, Math.min(255, g + Math.floor(mVar * 0.6)));
      b = Math.max(0, Math.min(255, b + Math.floor(mVar * 0.4)));

      // Storm coloring: storms are brighter/warmer, dark spots are darker
      if (stormData > 0.05) {
        // Positive = storm/bright spot → push toward warm white
        const t = Math.min(1, stormData * 1.5);
        r = Math.min(255, r + Math.floor(t * 60));
        g = Math.min(255, g + Math.floor(t * 40));
        b = Math.min(255, b + Math.floor(t * 15));
      } else if (stormData < -0.05) {
        // Negative = dark spot
        const t = Math.min(1, Math.abs(stormData) * 2);
        r = Math.floor(r * (1 - t * 0.5));
        g = Math.floor(g * (1 - t * 0.5));
        b = Math.floor(b * (1 - t * 0.45));
      }

      // Latitude-based darkening at poles (gas giants are dimmer at poles)
      const latAbs = Math.abs(ny - 0.5) * 2;
      if (latAbs > 0.7) {
        const poleDim = (latAbs - 0.7) / 0.3 * 0.25;
        r = Math.floor(r * (1 - poleDim)); g = Math.floor(g * (1 - poleDim)); b = Math.floor(b * (1 - poleDim));
      }

      return [r, g, b];
    }

    // ============================================================
    // LAVA WORLD
    // ============================================================
    if (pt === PlanetType.LAVA_WORLD) {
      const va = this.config.volcanicActivity || 0.5;
      const ca = this.config.crustAge || 0.5;
      const crustDark = 0.3 + ca * 0.4; // older = darker crust

      // Dark crust base
      let r = Math.floor(40 + elev * 50 * crustDark);
      let g = Math.floor(30 + elev * 35 * crustDark);
      let b = Math.floor(25 + elev * 25 * crustDark);

      // Lava in cracks (where slope is steep = fissure)
      const [dx, dy, sm] = this.getSlope(index, x, y);
      const lavaCrack = this.fbm(nx, ny, 4, 0.5, 2.0, 60.0);
      const crackIntensity = Math.abs(lavaCrack - 0.5) < (0.03 + va * 0.04) ? 1 : 0;

      // Lava pools in low areas
      const lavaPool = elev < (0.3 + va * 0.15) ? Math.min(1, ((0.3 + va * 0.15) - elev) / 0.15) : 0;

      // Age affects how much lava shows (young = lots, old = barely)
      const lavaAmount = (crackIntensity + lavaPool * 0.7 + (sm > 0.5 ? 0.4 : 0)) * (1 - ca * 0.6);
      const lavaT = Math.min(1, lavaAmount);

      // Lava glow: orange-red to yellow-white
      const glowR = Math.floor(255 * (0.8 + lavaT * 0.2));
      const glowG = Math.floor(80 + lavaT * 120);
      const glowB = Math.floor(10 + lavaT * 30);

      r = Math.floor(r * (1-lavaT) + glowR * lavaT);
      g = Math.floor(g * (1-lavaT) + glowG * lavaT);
      b = Math.floor(b * (1-lavaT) + glowB * lavaT);

      // Slope shading for crust
      const slope = (dx + dy) * 40;
      const shade = Math.max(0.4, Math.min(1.4, 1.0 + slope * (1-lavaT)));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // OCEAN WORLD
    // ============================================================
    if (pt === PlanetType.OCEAN_WORLD) {
      const temp = this.temperature[index];
      const isld = this.config.islandDensity || 0.1;
      const islandNoise = this.fbm(nx, ny, 5, 0.5, 2.0, 40.0);
      const isIsland = elev > (1.0 - isld) && islandNoise > 0.5;

      if (isIsland) {
        // Volcanic island: dark basalt
        const [dx, dy] = this.getSlope(index, x, y);
        const shade = Math.max(0.4, Math.min(1.4, 1.0 + (dx+dy)*40));
        return [Math.min(255, Math.floor(80*shade)), Math.min(255, Math.floor(75*shade)), Math.min(255, Math.floor(65*shade))];
      }

      // Ocean depth gradient
      const depth = 1.0 - elev;
      const t = Math.pow(depth, 0.35);
      let r = Math.floor(60 * (1-t) + 8 * t);
      let g = Math.floor(170 * (1-t) + 20 * t);
      let b = Math.floor(200 * (1-t) + 55 * t);

      // Ice at poles
      if (temp < 0.12) {
        const iceA = Math.min(1, (0.12 - temp) / 0.06);
        r = Math.floor(r*(1-iceA) + 220*iceA); g = Math.floor(g*(1-iceA) + 235*iceA); b = Math.floor(b*(1-iceA) + 255*iceA);
      }
      return [r, g, b];
    }

    // ============================================================
    // FROZEN OCEAN (Europa-like)
    // ============================================================
    if (pt === PlanetType.FROZEN_OCEAN) {
      const h = this.config.surfaceHue || 'white';
      let bR: number, bG: number, bB: number;
      if (h === 'bluish') { bR=190; bG=210; bB=240; }
      else if (h === 'brownish') { bR=210; bG=200; bB=185; }
      else { bR=230; bG=235; bB=240; } // white

      const bright = 0.7 + elev * 0.35;
      let r = Math.floor(bR * bright), g = Math.floor(bG * bright), b = Math.floor(bB * bright);

      // Lineae (crack streaks) - Europa's signature feature
      const ld = this.config.lineaeDensity || 0.5;
      const linNoise1 = this.fbm(nx * 1.5, ny * 3, 3, 0.5, 2.0, 80.0);
      const linNoise2 = this.fbm(nx * 3, ny * 1.5 + 5.5, 3, 0.5, 2.0, 80.0);
      const isLinea1 = Math.abs(linNoise1 - 0.5) < (0.01 + ld * 0.015);
      const isLinea2 = Math.abs(linNoise2 - 0.5) < (0.01 + ld * 0.015);
      if (isLinea1 || isLinea2) {
        // Brown-reddish lineae (tidal mineral deposits)
        r = Math.floor(r * 0.5 + 120 * 0.5); g = Math.floor(g * 0.4 + 80 * 0.6); b = Math.floor(b * 0.3 + 50 * 0.7);
      }

      // Subtle surface noise
      const sn = this.fbm(nx, ny, 2, 0.5, 2.0, 120.0);
      r = Math.max(0, Math.min(255, r + Math.floor((sn-0.5)*15)));
      g = Math.max(0, Math.min(255, g + Math.floor((sn-0.5)*12)));

      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.6, Math.min(1.3, 1.0 + (dx + dy) * 30));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // TIDALLY LOCKED & TIDALLY LOCKED DEAD
    // ============================================================
    if (pt === PlanetType.TIDALLY_LOCKED || pt === PlanetType.TIDALLY_LOCKED_DEAD) {
      const si = this.config.starIntensity || 0.7;
      const tw = this.config.twilightWidth || 0.3;
      const temp = this.temperature[index];
      let moist = this.moisture[index];

      // nx=0 is the sub-stellar point (center of star-facing side), nx=0.5 is anti-stellar
      const starFacing = 1.0 - Math.abs(nx - 0.0 > 0.5 ? nx - 1.0 : nx) * 2; // 1 at nx=0, 0 at nx=0.5
      const darkSide = 1.0 - starFacing;
      const terminator = 1.0 - Math.abs(starFacing - 0.5) * 2 / tw; // peaks at the terminator line

      if (elev <= seaLevel) {
        if (pt === PlanetType.TIDALLY_LOCKED_DEAD) {
            // Lava if facing star, solid basalt otherwise
            const isLava = starFacing > 0.5;
            let r = isLava ? 220 : 40, g = isLava ? 80 : 35, b = isLava ? 20 : 35;
            return [r, g, b];
        }
        // Water in terminator zone
        const depth = 1.0 - (elev / seaLevel);
        const t = Math.pow(depth, 0.3);
        let r = Math.floor(60*(1-t) + 10*t), g = Math.floor(160*(1-t) + 20*t), b = Math.floor(190*(1-t) + 50*t);
        // Darken by star exposure
        const lightMul = 0.15 + starFacing * si * 0.85;
        return [Math.floor(r * lightMul), Math.floor(g * lightMul), Math.floor(b * lightMul)];
      }

      let r: number, g: number, b: number;
      if (pt === PlanetType.TIDALLY_LOCKED_DEAD) {
        // Dead planet surface
        if (starFacing > 0.5) {
            // Scorched / Magma
            r = 140 + starFacing * 60; g = 80 + starFacing * 20; b = 40;
        } else {
            // Frozen dark rock
            r = 60; g = 60; b = 70;
        }
      } else if (terminator > 0 && moist > 0.3) {
        // Habitable terminator band: green vegetation
        const vegT = Math.min(1, terminator * moist * 2);
        r = Math.floor(150 * (1-vegT) + 60 * vegT); g = Math.floor(130 * (1-vegT) + 100 * vegT); b = Math.floor(100 * (1-vegT) + 40 * vegT);
      } else if (starFacing > 0.6) {
        // Hot side: scorched desert/lava
        const heatT = (starFacing - 0.6) / 0.4 * si;
        r = Math.floor(160 + heatT * 60); g = Math.floor(120 - heatT * 40); b = Math.floor(80 - heatT * 50);
      } else {
        // Dark/cold side: frozen
        const coldT = Math.min(1, darkSide);
        r = Math.floor(150 * (1-coldT) + 180 * coldT); g = Math.floor(140 * (1-coldT) + 195 * coldT); b = Math.floor(130 * (1-coldT) + 220 * coldT);
      }

      // Directional lighting from the star
      const lightMul = 0.1 + starFacing * si * 0.9;
      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.3, Math.min(1.5, lightMul + (dx + dy) * 30));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // CARBON WORLD
    // ============================================================
    if (pt === PlanetType.CARBON_WORLD) {
      const h = this.config.surfaceHue || 'graphite';
      let bR: number, bG: number, bB: number;
      if (h === 'obsidian') { bR=30; bG=28; bB=35; }
      else if (h === 'amber') { bR=80; bG=65; bB=30; }
      else { bR=50; bG=48; bB=45; } // graphite

      const bright = 0.5 + elev * 0.6;
      let r = Math.floor(bR * bright), g = Math.floor(bG * bright), b = Math.floor(bB * bright);

      // Hydrocarbon lakes (dark liquid pools in lowlands)
      const hl = this.config.hydrocarbonLakes || 0.3;
      const lakeNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 40.0);
      if (elev < (0.3 + hl * 0.2) && lakeNoise > 0.4) {
        const t = Math.min(1, ((0.3 + hl * 0.2) - elev) / 0.15);
        r = Math.floor(r * (1-t) + 15 * t); g = Math.floor(g * (1-t) + 12 * t); b = Math.floor(b * (1-t) + 20 * t);
      }

      // Crystal formations (bright sparkles on high elevation)
      const cd = this.config.crystalDensity || 0.4;
      const crystalNoise = this.fbm(nx + 9.9, ny + 1.1, 3, 0.5, 2.0, 200.0);
      if (crystalNoise > (0.75 - cd * 0.15) && elev > 0.5) {
        const sparkle = (crystalNoise - (0.75 - cd * 0.15)) * 8;
        r = Math.min(255, r + Math.floor(sparkle * 80)); g = Math.min(255, g + Math.floor(sparkle * 90)); b = Math.min(255, b + Math.floor(sparkle * 120));
      }

      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.3, Math.min(1.5, 1.0 + (dx + dy) * 45));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // ASH WORLD
    // ============================================================
    if (pt === PlanetType.ASH_WORLD) {
      const h = this.config.surfaceHue || 'gray';
      let bR: number, bG: number, bB: number;
      if (h === 'dark-gray') { bR=70; bG=68; bB=65; }
      else if (h === 'yellowish') { bR=130; bG=125; bB=90; }
      else { bR=140; bG=138; bB=132; } // light gray ash

      const ad = this.config.ashDepth || 0.5;
      const ea = this.config.emberActivity || 0.3;

      // Ash covers everything uniformly with depth
      const ashNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 50.0);
      const ashCover = 0.5 + ad * 0.5;
      const bright = 0.5 + elev * 0.4 + ashNoise * 0.1;
      let r = Math.floor(bR * bright * ashCover);
      let g = Math.floor(bG * bright * ashCover);
      let b = Math.floor(bB * bright * ashCover);

      // Ember zones (glowing red-orange in cracks)
      const emberNoise = this.fbm(nx + 4.4, ny + 6.6, 4, 0.5, 2.0, 70.0);
      if (emberNoise > (0.7 - ea * 0.25)) {
        const t = Math.min(1, (emberNoise - (0.7 - ea * 0.25)) * 5);
        r = Math.floor(r * (1-t) + 200 * t); g = Math.floor(g * (1-t) + 80 * t); b = Math.floor(b * (1-t) + 15 * t);
      }

      // Solidified lava flows (darker streaks)
      const lavaFlow = this.fbm(nx * 2, ny + 3.3, 3, 0.5, 2.0, 30.0);
      if (lavaFlow > 0.6 && elev < 0.5) {
        const t = (lavaFlow - 0.6) / 0.4 * 0.4;
        r = Math.floor(r * (1-t)); g = Math.floor(g * (1-t)); b = Math.floor(b * (1-t));
      }

      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.4, Math.min(1.4, 1.0 + (dx + dy) * 40));
      return [Math.min(255, Math.floor(r * shade)), Math.min(255, Math.floor(g * shade)), Math.min(255, Math.floor(b * shade))];
    }

    // ============================================================
    // SWAMP WORLD (uses Earth-Like rendering with modifications)
    // ============================================================
    if (pt === PlanetType.SWAMP_WORLD) {
      const temp = this.temperature[index];
      const moist = this.moisture[index];
      const wl = this.config.waterLevel || 0.6;
      const bio = this.config.bioluminescence || 0.5;

      if (elev <= seaLevel) {
        // Murky swamp water
        const depth = 1.0 - (elev / seaLevel);
        const t = Math.pow(depth, 0.3);
        let r = Math.floor(40*(1-t) + 15*t), g = Math.floor(90*(1-t) + 40*t), b = Math.floor(70*(1-t) + 30*t);

        // Bioluminescence in shallow water
        if (depth < 0.4 && bio > 0.2) {
          const bioNoise = this.fbm(nx + 7.7, ny + 8.8, 3, 0.5, 2.0, 80.0);
          if (bioNoise > 0.55) {
            const glow = (bioNoise - 0.55) * bio * 5;
            g = Math.min(255, g + Math.floor(glow * 100)); b = Math.min(255, b + Math.floor(glow * 60));
          }
        }
        return [r, g, b];
      }

      // Dense swamp vegetation
      const vegNoise = this.fbm(nx, ny, 3, 0.5, 2.0, 40.0);
      const vegDensity = Math.min(1, moist * 2 + vegNoise * 0.5);

      // Muddy ground with dense alien vegetation
      let r = Math.floor(80 - vegDensity * 40), g = Math.floor(70 + vegDensity * 50), b = Math.floor(40 - vegDensity * 15);

      // Shallow standing water in low areas
      if (elev < seaLevel + (1-seaLevel) * wl * 0.3) {
        const waterT = Math.min(1, (seaLevel + (1-seaLevel)*wl*0.3 - elev) * 10);
        r = Math.floor(r*(1-waterT) + 50*waterT); g = Math.floor(g*(1-waterT) + 80*waterT); b = Math.floor(b*(1-waterT) + 60*waterT);
      }

      // Bioluminescent patches on land
      if (bio > 0.3) {
        const bioNoise = this.fbm(nx + 3.3, ny + 5.5, 3, 0.5, 2.0, 100.0);
        if (bioNoise > 0.6) {
          const glow = (bioNoise - 0.6) * bio * 4;
          g = Math.min(255, g + Math.floor(glow * 80)); b = Math.min(255, b + Math.floor(glow * 50));
        }
      }

      const [dx, dy] = this.getSlope(index, x, y);
      const shade = Math.max(0.5, Math.min(1.3, 1.0 + (dx+dy)*30));
      return [Math.min(255, Math.floor(r*shade)), Math.min(255, Math.floor(g*shade)), Math.min(255, Math.floor(b*shade))];
    }

    // ============================================================
    // ALIEN LIFE (Earth-Like with alien colors)
    // ============================================================
    if (pt === PlanetType.ALIEN_LIFE) {
      const temp = this.temperature[index];
      const moist = this.moisture[index];
      const vh = this.config.vegetationHue || 'purple';
      const wh = this.config.waterHue || 'green';

      // Alien water colors
      let waterR: number, waterG: number, waterB: number;
      if (wh === 'green') { waterR=30; waterG=140; waterB=80; }
      else if (wh === 'amber') { waterR=160; waterG=130; waterB=40; }
      else if (wh === 'magenta') { waterR=140; waterG=40; waterB=120; }
      else if (wh === 'dark') { waterR=20; waterG=25; waterB=35; }
      else { waterR=40; waterG=150; waterB=160; } // teal

      if (elev <= seaLevel) {
        const depth = 1.0 - (elev / seaLevel);
        const t = Math.pow(depth, 0.3);
        const r = Math.floor(waterR * (1-t*0.6)); const g = Math.floor(waterG * (1-t*0.5)); const b = Math.floor(waterB * (1-t*0.4));
        // Ice at poles
        if (temp < 0.15) {
          const iceA = Math.min(1, (0.15-temp)/0.05);
          return [Math.floor(r*(1-iceA)+220*iceA), Math.floor(g*(1-iceA)+230*iceA), Math.floor(b*(1-iceA)+245*iceA)];
        }
        return [r, g, b];
      }

      // Alien vegetation colors (dense forest)
      let treeR: number, treeG: number, treeB: number;
      // Alien ground tint (grassland/steppe - lighter version of veg hue)
      let grassR: number, grassG: number, grassB: number;
      if (vh === 'purple') { treeR=80; treeG=30; treeB=100; grassR=120; grassG=90; grassB=130; }
      else if (vh === 'red') { treeR=120; treeG=30; treeB=25; grassR=150; grassG=95; grassB=80; }
      else if (vh === 'blue') { treeR=30; treeG=50; treeB=110; grassR=90; grassG=110; grassB=140; }
      else if (vh === 'cyan') { treeR=20; treeG=100; treeB=110; grassR=80; grassG=130; grassB=130; }
      else if (vh === 'green') { treeR=25; treeG=75; treeB=30; grassR=100; grassG=130; grassB=70; }
      else { treeR=130; treeG=70; treeB=20; grassR=150; grassG=120; grassB=70; } // orange

      // Ground: blend between desert/earthy tones and alien-tinted grassland based on moisture
      let groundR: number, groundG: number, groundB: number;
      if (temp < 0.2) {
        // Cold tundra (stays neutral grayish)
        const s = Math.max(0, (0.2 - temp) / 0.2);
        groundR = grassR * (1-s) + 200 * s; groundG = grassG * (1-s) + 200 * s; groundB = grassB * (1-s) + 220 * s;
      } else if (moist < 0.25) {
        // Arid/desert areas: earthy tan with slight alien tint
        const s = Math.max(0, (0.25 - moist) / 0.25);
        groundR = grassR * (1-s) + 190 * s; groundG = grassG * (1-s) + 170 * s; groundB = grassB * (1-s) + 130 * s;
      } else {
        // Moist areas: strong alien grass color
        const s = Math.min(1, (moist - 0.25) / 0.5);
        groundR = (grassR * 0.7 + 160 * 0.3) * (1-s) + grassR * s;
        groundG = (grassG * 0.7 + 140 * 0.3) * (1-s) + grassG * s;
        groundB = (grassB * 0.7 + 100 * 0.3) * (1-s) + grassB * s;
      }

      const vegNoise = this.fbm(nx, ny, 3, 0.5, 2, 40) * 0.7 + this.fbm(nx, ny, 2, 0.5, 2, 150) * 0.3;
      let vegDensity = Math.max(0, Math.min(1, moist * 2 + (vegNoise - 0.5) * 1.2 - 0.2));
      if (temp < 0.2) vegDensity *= temp / 0.2;

      let r = Math.floor(groundR * (1-vegDensity) + treeR * vegDensity);
      let g = Math.floor(groundG * (1-vegDensity) + treeG * vegDensity);
      let b = Math.floor(groundB * (1-vegDensity) + treeB * vegDensity);

      const [dx, dy, sm] = this.getSlope(index, x, y);
      if (sm > 1.2) { const t = Math.min(1, (sm-1.2)*0.8); r = Math.floor(r*(1-t)+110*t); g = Math.floor(g*(1-t)+110*t); b = Math.floor(b*(1-t)+115*t); }
      let slope = (dx+dy)*40;
      if (vegDensity > 0.1) { slope += (this.fbm(nx,ny,2,0.5,2,250)-0.5)*vegDensity*0.4; }
      const shade = Math.max(0.4, Math.min(1.5, 1.0+slope));
      r = Math.floor(r*shade); g = Math.floor(g*shade); b = Math.floor(b*shade);

      // Snow caps
      const mf = Math.min(1, (elev-seaLevel)/(1-seaLevel));
      if (temp-(mf*0.6) < 0.15) { const ls = Math.max(0.4,Math.min(1.5,1+slope)); r=Math.floor(240*ls); g=Math.floor(240*ls); b=Math.floor(255*ls); }

      // Rivers
      if (this.waterAccumulation[index] > 2) {
        const dv = Math.min(1, (this.waterAccumulation[index]-2)/80);
        const ea = Math.min(1, (this.waterAccumulation[index]-2)/1);
        r = Math.floor(r*(1-ea) + waterR*(1-dv*0.5)*ea); g = Math.floor(g*(1-ea) + waterG*(1-dv*0.4)*ea); b = Math.floor(b*(1-ea) + waterB*(1-dv*0.3)*ea);
      }

      return [Math.max(0,Math.min(255,r)), Math.max(0,Math.min(255,g)), Math.max(0,Math.min(255,b))];
    }

    // ============================================================
    // EARTH-LIKE (default fallback)
    // ============================================================
    const temp = this.temperature[index];
    const moist = this.moisture[index];

    if (elev <= seaLevel) {
      const depth = 1.0 - (elev / seaLevel);
      const t = Math.pow(depth, 0.3);
      let r = Math.floor(70*(1-t)+10*t), g = Math.floor(180*(1-t)+20*t), b = Math.floor(210*(1-t)+60*t);
      if (temp < 0.15) {
        const warpX = this.fbm(nx, ny, 2, 0.5, 2, 20) * 0.05;
        const warpY = this.fbm(nx+0.5, ny+0.5, 2, 0.5, 2, 20) * 0.05;
        const crackFbm = this.fbm(nx+warpX, ny+warpY, 3, 0.5, 2, 40);
        if (Math.abs(crackFbm-0.5) >= 0.02) {
          const iceA = Math.min(1, (0.15-temp)/0.05);
          const icebergNoise = this.fbm(nx, ny, 3, 0.5, 2, 60);
          const iR = icebergNoise > 0.65 ? 255 : 220, iG = icebergNoise > 0.65 ? 255 : 235, iB = 255;
          r = Math.floor(r*(1-iceA)+iR*iceA); g = Math.floor(g*(1-iceA)+iG*iceA); b = Math.floor(b*(1-iceA)+iB*iceA);
        }
      }
      return [r, g, b];
    }

    // Land
    let groundR: number, groundG: number, groundB: number;
    if (temp < 0.2) { const s=Math.max(0,(0.2-temp)/0.2); groundR=140*(1-s)+240*s; groundG=130*(1-s)+240*s; groundB=120*(1-s)+255*s; }
    else if (moist < 0.25) { const s=Math.max(0,(0.25-moist)/0.25); groundR=160*(1-s)+210*s; groundG=150*(1-s)+190*s; groundB=110*(1-s)+150*s; }
    else { const s=Math.min(1,(moist-0.25)/0.5); groundR=150*(1-s)+90*s; groundG=140*(1-s)+120*s; groundB=90*(1-s)+50*s; }

    const vegNoise = this.fbm(nx,ny,3,0.5,2,40)*0.7 + this.fbm(nx,ny,2,0.5,2,150)*0.3;
    let tc = moist;
    if (temp<0.2) tc *= Math.max(0,temp/0.2);
    if (temp>0.7 && moist<0.25) tc *= 0.3;
    const rawVD = tc*2.2 + (vegNoise-0.5)*1.2 - 0.2;
    const smoothT = Math.max(0,Math.min(1,(rawVD-0.1)/0.7));
    let vegDensity = smoothT*smoothT*(3-2*smoothT);

    let treeR: number, treeG: number, treeB: number;
    if (temp>0.6) { treeR=25; treeG=65; treeB=30; }
    else if (temp>0.3) { treeR=40; treeG=85; treeB=45; }
    else { treeR=45; treeG=75; treeB=65; }

    let r = Math.floor(groundR*(1-vegDensity)+treeR*vegDensity);
    let g = Math.floor(groundG*(1-vegDensity)+treeG*vegDensity);
    let b = Math.floor(groundB*(1-vegDensity)+treeB*vegDensity);

    const [dx, dy, slopeMag] = this.getSlope(index, x, y);
    if (slopeMag > 1.2) { const rb=Math.min(1,(slopeMag-1.2)*0.8); r=Math.floor(r*(1-rb)+110*rb); g=Math.floor(g*(1-rb)+110*rb); b=Math.floor(b*(1-rb)+115*rb); vegDensity=0; }
    let slope = (dx+dy)*40;
    if (vegDensity>0.1) { slope += ((this.fbm(nx,ny,2,0.5,2,250)-0.5)+(this.fbm(nx+0.5,ny+0.5,2,0.5,2,250)-0.5))*vegDensity*0.4; }
    let shade = Math.max(0.4,Math.min(1.5,1+slope));
    r = Math.floor(r*shade); g = Math.floor(g*shade); b = Math.floor(b*shade);

    const mf = Math.min(1,(elev-seaLevel)/(1-seaLevel));
    if (temp-(mf*0.6)<0.15) { const ls=Math.max(0.4,Math.min(1.5,1+slope)); r=Math.floor(240*ls); g=Math.floor(240*ls); b=Math.floor(255*ls); }

    // Sandy banks
    if (this.waterAccumulation[index]>=1 && this.waterAccumulation[index]<=3) {
      const sn = this.fbm(nx,ny,3,0.5,2,80);
      if (sn>0.15) { let ls=1.0; if(elev>seaLevel){ls=Math.max(0.7,Math.min(1.2,1+(dx+dy)*30));} r=Math.floor(210*ls); g=Math.floor(190*ls); b=Math.floor(140*ls); }
    }
    // Rivers
    if (this.waterAccumulation[index]>2) {
      const dv=Math.max(0,Math.min(1,(this.waterAccumulation[index]-2)/80));
      const dt2=Math.pow(dv,0.8);
      const wR=Math.floor(70*(1-dt2)+25*dt2), wG=Math.floor(180*(1-dt2)+115*dt2), wB=Math.floor(210*(1-dt2)+185*dt2);
      const ea2=Math.min(1,(this.waterAccumulation[index]-2)/1);
      r=Math.floor(r*(1-ea2)+wR*ea2); g=Math.floor(g*(1-ea2)+wG*ea2); b=Math.floor(b*(1-ea2)+wB*ea2);
    }
    return [Math.max(0,Math.min(255,r)), Math.max(0,Math.min(255,g)), Math.max(0,Math.min(255,b))];
  }

  render(ctx: CanvasRenderingContext2D, layer: LayerType) {
    const { width, height, seaLevel } = this.config;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixelIndex = index * 4;
        
        let r = 0, g = 0, b = 0;
        
        if (layer === LayerType.ELEVATION) {
          const val = this.elevation[index];
          if (val <= seaLevel) {
            const depth = 1.0 - (val / seaLevel); // 0 at coast, 1 at deepest
            const t = Math.pow(depth, 0.3); // Flatter curve means it stays coastal longer
            r = Math.floor(70 * (1 - t) + 10 * t);
            g = Math.floor(180 * (1 - t) + 20 * t);
            b = Math.floor(210 * (1 - t) + 60 * t);
          } else {
            const land = (val - seaLevel) / (1 - seaLevel);
            const c = Math.floor(land * 255);
            r = c; g = c; b = c;
            
            // Draw rivers on elevation map
            if (this.waterAccumulation[index] > 2) {
              r = 50; g = 100; b = 200;
            }
          }
        } else if (layer === LayerType.HEIGHTMAP) {
          const val = this.elevation[index];
          const c = Math.floor(val * 255);
          r = c; g = c; b = c;
        } else if (layer === LayerType.TECTONIC) {
          const plateId = this.tectonicPlates[index];
          const prng = seedrandom(plateId.toString());
          r = Math.floor(prng() * 200 + 55);
          g = Math.floor(prng() * 200 + 55);
          b = Math.floor(prng() * 200 + 55);
          
          const dist = this.plateDistances[index];
          const bType = this.boundaryTypes[index];
          
          if (dist < 3) {
            if (bType === 1) { r = 255; g = 0; b = 0; } // Convergent: Red
            else if (bType === 2) { r = 0; g = 255; b = 0; } // Divergent: Green
            else if (bType === 3) { r = 255; g = 255; b = 0; } // Transform: Yellow
            else { r = 0; g = 0; b = 0; }
          }
        } else if (layer === LayerType.TEMPERATURE) {
          const val = this.temperature[index];
          r = Math.floor(val * 255);
          g = Math.floor((1 - Math.abs(val - 0.5) * 2) * 255);
          b = Math.floor((1 - val) * 255);
        } else if (layer === LayerType.MOISTURE) {
          const val = this.moisture[index];
          r = Math.floor((1 - val) * 255);
          g = Math.floor((1 - val) * 200 + 55);
          b = Math.floor(val * 255);
        } else if (layer === LayerType.NORMAL) {
          // Calculate normal map from elevation
          const leftX = x > 0 ? x - 1 : width - 1;
          const rightX = x < width - 1 ? x + 1 : 0;
          const upY = y > 0 ? y - 1 : 0;
          const downY = y < height - 1 ? y + 1 : height - 1;
          
          const leftElev = this.elevation[y * width + leftX];
          const rightElev = this.elevation[y * width + rightX];
          const upElev = this.elevation[upY * width + x];
          const downElev = this.elevation[downY * width + x];
          
          // Gradients
          const dx = (rightElev - leftElev) * 5.0; // Scale factor for bumpiness
          const dy = (downElev - upElev) * 5.0;
          const dz = 1.0;
          
          // Normalize
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const nx = dx / len;
          const ny = dy / len;
          const nz = dz / len;
          
          // Map to 0-255
          r = Math.floor((nx * 0.5 + 0.5) * 255);
          g = Math.floor((ny * 0.5 + 0.5) * 255);
          b = Math.floor((nz * 0.5 + 0.5) * 255);
        } else if (layer === LayerType.BIOME || layer === LayerType.FINAL) {
          const rgb = this.renderPlanetSurface(index, x, y);
          r = rgb[0]; g = rgb[1]; b = rgb[2];
        } else if (layer === LayerType.MOVEMENT) {
          const cost = this.movementCosts[index];
          
          if (cost <= 1) {
              // 1: Green
              r = 50; g = 200; b = 50;
          } else if (cost <= 4) {
              // 2 to 4: Green to Yellow
              const t = (cost - 1) / 3.0;
              r = Math.floor(50 * (1 - t) + 255 * t);
              g = Math.floor(200 * (1 - t) + 215 * t);
              b = Math.floor(50 * (1 - t) + 0 * t);
          } else if (cost <= 8) {
              // 4 to 8: Yellow to Red
              const t = (cost - 4) / 4.0;
              r = Math.floor(255 * (1 - t) + 220 * t);
              g = Math.floor(215 * (1 - t) + 20 * t);
              b = Math.floor(0 * (1 - t) + 20 * t);
          } else {
              // 8+: Red to Dark Red
              const t = Math.min(1.0, (cost - 8) / 5.0);
              r = Math.floor(220 * (1 - t) + 80 * t);
              g = Math.floor(20 * (1 - t) + 0 * t);
              b = Math.floor(20 * (1 - t) + 0 * t);
          }
        } else if (layer === LayerType.FERTILITY) {
          const elev = this.elevation[index];
          if (elev <= seaLevel) {
             const depth = 1.0 - (elev / seaLevel); 
             const t = Math.pow(depth, 0.3);
             r = Math.floor(70 * (1 - t) + 10 * t);
             g = Math.floor(180 * (1 - t) + 20 * t);
             b = Math.floor(210 * (1 - t) + 60 * t);
          } else if (this.waterAccumulation[index] > 2.0) {
             // Draw actual river water instead of raw soil
             const depthVariance = Math.max(0, Math.min(1.0, (this.waterAccumulation[index] - 2.0) / 80.0));
             const t = Math.pow(depthVariance, 0.8);
             r = Math.floor(70 * (1 - t) + 25 * t);
             g = Math.floor(180 * (1 - t) + 115 * t);
             b = Math.floor(210 * (1 - t) + 185 * t);
          } else {
             const f = this.fertility[index]; // Range 0 to 1
             
             if (f < 0.33) {
                 const t = f / 0.33;
                 // Barren Desert/Rock (160, 150, 100) -> Dry Grass (180, 190, 80)
                 r = Math.floor(160 * (1 - t) + 180 * t);
                 g = Math.floor(150 * (1 - t) + 190 * t);
                 b = Math.floor(100 * (1 - t) + 80 * t);
             } else if (f < 0.66) {
                 const t = (f - 0.33) / 0.33;
                 // Dry Grass (180, 190, 80) -> Rich Green (100, 180, 60)
                 r = Math.floor(180 * (1 - t) + 100 * t);
                 g = Math.floor(190 * (1 - t) + 180 * t);
                 b = Math.floor(80 * (1 - t) + 60 * t);
             } else {
                 const t = (f - 0.66) / 0.34;
                 // Rich Green (100, 180, 60) -> Hyper-Lush Jungle (30, 130, 30)
                 r = Math.floor(100 * (1 - t) + 30 * t);
                 g = Math.floor(180 * (1 - t) + 130 * t);
                 b = Math.floor(60 * (1 - t) + 30 * t);
             }
          }
        } else if (layer === LayerType.ORES) {
          const elev = this.elevation[index];
          if (elev <= seaLevel) {
             r = 30; g = 30; b = 40;
          } else {
             const o = this.ores[index];
             if (o < 0.15) {
                 // Barren -> Dark Gray
                 r = 60; g = 58; b = 55;
             } else if (o < 0.35) {
                 const t = (o - 0.15) / 0.20;
                 // Gray -> Copper Brown
                 r = Math.floor(60 * (1-t) + 180 * t);
                 g = Math.floor(58 * (1-t) + 120 * t);
                 b = Math.floor(55 * (1-t) + 60 * t);
             } else if (o < 0.60) {
                 const t = (o - 0.35) / 0.25;
                 // Copper -> Silver
                 r = Math.floor(180 * (1-t) + 200 * t);
                 g = Math.floor(120 * (1-t) + 200 * t);
                 b = Math.floor(60 * (1-t) + 210 * t);
             } else if (o < 0.80) {
                 const t = (o - 0.60) / 0.20;
                 // Silver -> Gold  
                 r = Math.floor(200 * (1-t) + 255 * t);
                 g = Math.floor(200 * (1-t) + 215 * t);
                 b = Math.floor(210 * (1-t) + 0 * t);
             } else {
                 const t = (o - 0.80) / 0.20;
                 // Gold -> Diamond Cyan
                 r = Math.floor(255 * (1-t) + 120 * t);
                 g = Math.floor(215 * (1-t) + 255 * t);
                 b = Math.floor(0 * (1-t) + 255 * t);
             }
          }
        } else if (layer === LayerType.SPICES) {
          const elev = this.elevation[index];
          if (elev <= seaLevel) {
             r = 30; g = 30; b = 40;
          } else {
             const s = this.spices[index];
             if (s < 0.05) {
                 r = 50; g = 45; b = 40;
             } else if (s < 0.25) {
                 const t = (s - 0.05) / 0.20;
                 // Dark -> Earthy Green
                 r = Math.floor(50 * (1-t) + 100 * t);
                 g = Math.floor(45 * (1-t) + 130 * t);
                 b = Math.floor(40 * (1-t) + 60 * t);
             } else if (s < 0.50) {
                 const t = (s - 0.25) / 0.25;
                 // Earthy -> Warm Amber
                 r = Math.floor(100 * (1-t) + 220 * t);
                 g = Math.floor(130 * (1-t) + 160 * t);
                 b = Math.floor(60 * (1-t) + 50 * t);
             } else if (s < 0.75) {
                 const t = (s - 0.50) / 0.25;
                 // Amber -> Hot Magenta
                 r = Math.floor(220 * (1-t) + 200 * t);
                 g = Math.floor(160 * (1-t) + 50 * t);
                 b = Math.floor(50 * (1-t) + 150 * t);
             } else {
                 const t = (s - 0.75) / 0.25;
                 // Hot Magenta -> Bioluminescent Purple
                 r = Math.floor(200 * (1-t) + 160 * t);
                 g = Math.floor(50 * (1-t) + 80 * t);
                 b = Math.floor(150 * (1-t) + 255 * t);
             }
          }
        } else if (layer === LayerType.RESOURCES) {
          const elev = this.elevation[index];
          if (elev <= seaLevel) {
             r = 30; g = 30; b = 40;
          } else {
             const res = this.resources[index];
             if (res < 0.10) {
                 r = 55; g = 50; b = 45;
             } else if (res < 0.35) {
                 const t = (res - 0.10) / 0.25;
                 // Dark -> Stone Gray
                 r = Math.floor(55 * (1-t) + 150 * t);
                 g = Math.floor(50 * (1-t) + 140 * t);
                 b = Math.floor(45 * (1-t) + 130 * t);
             } else if (res < 0.60) {
                 const t = (res - 0.35) / 0.25;
                 // Stone -> Lumber Brown
                 r = Math.floor(150 * (1-t) + 140 * t);
                 g = Math.floor(140 * (1-t) + 100 * t);
                 b = Math.floor(130 * (1-t) + 50 * t);
             } else {
                 const t = (res - 0.60) / 0.40;
                 // Lumber -> Rich Mahogany
                 r = Math.floor(140 * (1-t) + 100 * t);
                 g = Math.floor(100 * (1-t) + 55 * t);
                 b = Math.floor(50 * (1-t) + 25 * t);
             }
          }
        } else if (layer === LayerType.FAUNA) {
          const elev = this.elevation[index];
          const f = this.fauna[index];
          if (elev <= seaLevel || this.waterAccumulation[index] > 2.0) {
             // Aquatic fauna scale: Dark Navy -> Teal -> distinct Leviathan glow
             if (f < 0.05) {
                 r = 15; g = 20; b = 40;
             } else if (f < 0.30) {
                 const t = (f - 0.05) / 0.25;
                 // Dark Navy -> Dark Teal (reef zone)
                 r = Math.floor(15 * (1-t) + 25 * t);
                 g = Math.floor(20 * (1-t) + 90 * t);
                 b = Math.floor(40 * (1-t) + 120 * t);
             } else if (f < 0.55) {
                 const t = (f - 0.30) / 0.25;
                 // Dark Teal -> Medium Teal (predator zone)
                 r = Math.floor(25 * (1-t) + 30 * t);
                 g = Math.floor(90 * (1-t) + 160 * t);
                 b = Math.floor(120 * (1-t) + 185 * t);
             } else if (f < 0.72) {
                 const t = (f - 0.55) / 0.17;
                 // Medium Teal -> Bright Cyan (deep ocean)
                 r = Math.floor(30 * (1-t) + 0 * t);
                 g = Math.floor(160 * (1-t) + 220 * t);
                 b = Math.floor(185 * (1-t) + 255 * t);
             } else {
                 const t = Math.min(1.0, (f - 0.72) / 0.28);
                 // Bright Cyan -> Glowing White-Violet (LEVIATHAN)
                 r = Math.floor(0 * (1-t) + 180 * t);
                 g = Math.floor(220 * (1-t) + 160 * t);
                 b = Math.floor(255 * (1-t) + 255 * t);
             }
          } else {
             // Terrestrial fauna: Dark -> Orange -> Red -> Crimson
             if (f < 0.05) {
                 r = 50; g = 45; b = 40;
             } else if (f < 0.25) {
                 const t = (f - 0.05) / 0.20;
                 r = Math.floor(50 * (1-t) + 180 * t);
                 g = Math.floor(45 * (1-t) + 150 * t);
                 b = Math.floor(40 * (1-t) + 50 * t);
             } else if (f < 0.50) {
                 const t = (f - 0.25) / 0.25;
                 r = Math.floor(180 * (1-t) + 240 * t);
                 g = Math.floor(150 * (1-t) + 160 * t);
                 b = Math.floor(50 * (1-t) + 30 * t);
             } else if (f < 0.75) {
                 const t = (f - 0.50) / 0.25;
                 r = Math.floor(240 * (1-t) + 220 * t);
                 g = Math.floor(160 * (1-t) + 60 * t);
                 b = Math.floor(30 * (1-t) + 30 * t);
             } else {
                 const t = (f - 0.75) / 0.25;
                 r = Math.floor(220 * (1-t) + 180 * t);
                 g = Math.floor(60 * (1-t) + 20 * t);
                 b = Math.floor(30 * (1-t) + 40 * t);
             }
          }
        }
        
        data[pixelIndex] = r;
        data[pixelIndex + 1] = g;
        data[pixelIndex + 2] = b;
        data[pixelIndex + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
}

