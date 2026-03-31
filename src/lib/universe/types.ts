import { GalaxyShape } from '../galaxy/types';
import { SolarSystemConfig } from '../solar-system/types';

export interface UniverseConfig {
  seed: string;
  age: number; // 0.0 to 1.0 (0% to 100%)
  maxGalaxies: number; // 1000 to 100000
}

export interface UniverseGalaxyMetadata {
  id: string;      // Unique identifier (usually index based)
  name: string;    // Procedural majestic generic name
  x: number;       // Position in logical space
  y: number;
  size: number;    // Multiplier size (visual and bounding box)
  shape: GalaxyShape; // The topological form (Spiral, Elliptical, etc.)
  starCount: number; // Total logical stars (calculated directly from generator scale)
  
  // Dynamic properties synced to Universe Timeline:
  age: number;       // The *local* age of this specific galaxy based on the Universe Expansion Wave (0.0 to 1.0).
  baseColor: string; // The core visual tint for LOD 1 rendering.
  isDead: boolean;   // Quick flag if age > 1.0 or if randomly died early.

  // The actual seed passed down to the GalaxyGenerator so it perfectly generates its internals deterministically
  galaxySeed: string; 
}

// When transitioning to actual Galaxy Explorer, the Controller derives `GalaxyConfig` from the UI.
// So `UniverseGalaxyMetadata` acts as a lightweight proxy/blueprint.
