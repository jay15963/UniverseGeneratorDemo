import { SolarSystemConfig, StarClass } from '../solar-system/types';

export enum GalaxyShape {
  SPIRAL = 'spiral',
  BARRED_SPIRAL = 'barred_spiral',
  ELLIPTICAL = 'elliptical',
  RING = 'ring',
  IRREGULAR = 'irregular'
}



export enum GalaxyLayer {
  SYSTEM = 'system',           // Artistic representation
  HABITABILITY = 'habitability', // Heatmap (Red core, Green sweet spot, Grey edges)
  STAR_TYPE = 'star_type',       // Coloring by star class
  DANGER = 'danger'              // Highlights black holes and supernova dead zones
}

export interface GalaxyConfig {
  seed: string;
  shape: GalaxyShape;
  age: number;            // 0.0 (Young/Chaotic) to 1.0 (Ancient/Dead)
  numStars: number;       // 1000 to 10000
  anomalyFactor: number;  // 0 to 1 (Intensity of Perlin noise / Clusters)
  radius: number;         // Logical boundary for rendering (e.g. 500)
}

export interface StellarSystemMetadata {
  id: string;
  name: string;          // Procedurally generated name (e.g. "Veyara-7" or "Krython Devourer")
  x: number;
  y: number;
  
  // Stored for the Solar System Generator to consume when user clicks
  // This is heavily modified by the Galaxy Generator's Logic (Sweet Spot, Anomalies)
  config: SolarSystemConfig;
  
  // Metadata for rendering on the Galaxy Map Canvas
  baseColor: string;     // Color in SYSTEM view
  habitability: number;  // 0 to 1 (Determines green/red in HABITABILITY view)
  starClass: StarClass | 'BH' | 'NS' | 'P'; // Includes Black Hole, Neutron Star, Pulsar
  isDeadZone: boolean;   // Caught in a supernova/anomaly blast?
  size: number;          // Rendering size in pixels
}
