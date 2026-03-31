import { create } from 'zustand';
import { UniverseGalaxyMetadata } from '../lib/universe/types';
import { StellarSystemMetadata, GalaxyConfig, GalaxyLayer } from '../lib/galaxy/types';
import { CelestialBody, SolarSystemConfig } from '../lib/solar-system/types';

// ======================================================
// LOD Levels (Scene hierarchy)
// ======================================================
export type LODLevel = 'universe' | 'galaxy' | 'system';

// ======================================================
// Game Phase
// ======================================================
export type GamePhase = 'setup' | 'exploring';

// ======================================================
// Navigation breadcrumb (for "Back" functionality)
// ======================================================
export interface NavigationEntry {
  level: LODLevel;
  label: string;       // e.g. "NGC 4012" or "Veyara-7"
  galaxySeed?: string;
  galaxyAge?: number;
  galaxyStarCount?: number;
  galaxyShape?: string;
  systemConfig?: SolarSystemConfig;
}

// ======================================================
// Game Engine State
// ======================================================
interface GameEngineState {
  // --- Phase ---
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;

  // --- Universe Setup Parameters ---
  rootSeed: string;
  setRootSeed: (seed: string) => void;
  universeAge: number;
  setUniverseAge: (age: number) => void;
  numGalaxies: number;
  setNumGalaxies: (n: number) => void;

  // --- LOD / Scene ---
  currentLevel: LODLevel;
  navigationStack: NavigationEntry[];

  // --- Generated Data for Active Scene ---
  // Universe level
  galaxies: UniverseGalaxyMetadata[];
  setGalaxies: (g: UniverseGalaxyMetadata[]) => void;

  // Galaxy level
  activeGalaxyMeta: UniverseGalaxyMetadata | null;
  galaxyStars: StellarSystemMetadata[];
  galaxyConfig: GalaxyConfig | null;
  setGalaxyScene: (meta: UniverseGalaxyMetadata, stars: StellarSystemMetadata[], config: GalaxyConfig) => void;

  // System level
  activeStarMeta: StellarSystemMetadata | null;
  systemBodies: CelestialBody[];
  systemConfig: SolarSystemConfig | null;
  setSystemScene: (star: StellarSystemMetadata, bodies: CelestialBody[], config: SolarSystemConfig) => void;

  // --- Transitions ---
  isTransitioning: boolean;
  transitionDirection: 'in' | 'out';

  enterGalaxy: (galaxyMeta: UniverseGalaxyMetadata) => void;
  enterSystem: (starMeta: StellarSystemMetadata) => void;
  goBack: () => void;

  // --- Reset ---
  resetGame: () => void;
}

export const useGameEngine = create<GameEngineState>((set, get) => ({
  // Phase
  phase: 'setup',
  setPhase: (phase) => set({ phase }),

  // Universe params
  rootSeed: 'COSMOS-' + Math.random().toString(36).substring(2, 8),
  setRootSeed: (seed) => set({ rootSeed: seed }),
  universeAge: 0.5,
  setUniverseAge: (age) => set({ universeAge: age }),
  numGalaxies: 3000,
  setNumGalaxies: (n) => set({ numGalaxies: n }),

  // LOD
  currentLevel: 'universe',
  navigationStack: [],

  // Universe data
  galaxies: [],
  setGalaxies: (g) => set({ galaxies: g }),

  // Galaxy data
  activeGalaxyMeta: null,
  galaxyStars: [],
  galaxyConfig: null,
  setGalaxyScene: (meta, stars, config) => set({
    activeGalaxyMeta: meta,
    galaxyStars: stars,
    galaxyConfig: config,
  }),

  // System data
  activeStarMeta: null,
  systemBodies: [],
  systemConfig: null,
  setSystemScene: (star, bodies, config) => set({
    activeStarMeta: star,
    systemBodies: bodies,
    systemConfig: config,
  }),

  // Transitions
  isTransitioning: false,
  transitionDirection: 'in',

  enterGalaxy: (galaxyMeta) => {
    const state = get();
    set({
      isTransitioning: true,
      transitionDirection: 'in',
      navigationStack: [
        ...state.navigationStack,
        {
          level: 'universe',
          label: 'Universo',
        }
      ],
    });

    // Small delay so the hyperspace animation can play
    setTimeout(() => {
      set({
        currentLevel: 'galaxy',
        activeGalaxyMeta: galaxyMeta,
        isTransitioning: false,
      });
    }, 800);
  },

  enterSystem: (starMeta) => {
    const state = get();
    set({
      isTransitioning: true,
      transitionDirection: 'in',
      navigationStack: [
        ...state.navigationStack,
        {
          level: 'galaxy',
          label: state.activeGalaxyMeta?.name || 'Galáxia',
          galaxySeed: state.activeGalaxyMeta?.galaxySeed,
          galaxyAge: state.activeGalaxyMeta?.age,
          galaxyStarCount: state.activeGalaxyMeta?.starCount,
          galaxyShape: state.activeGalaxyMeta?.shape,
        }
      ],
    });

    setTimeout(() => {
      set({
        currentLevel: 'system',
        activeStarMeta: starMeta,
        isTransitioning: false,
      });
    }, 800);
  },

  goBack: () => {
    const state = get();
    const stack = [...state.navigationStack];
    const prev = stack.pop();

    if (!prev) return;

    set({
      isTransitioning: true,
      transitionDirection: 'out',
    });

    setTimeout(() => {
      set({
        currentLevel: prev.level,
        navigationStack: stack,
        isTransitioning: false,
        // Clear child data when going back
        ...(prev.level === 'universe' ? {
          activeGalaxyMeta: null,
          galaxyStars: [],
          galaxyConfig: null,
          activeStarMeta: null,
          systemBodies: [],
          systemConfig: null,
        } : {}),
        ...(prev.level === 'galaxy' ? {
          activeStarMeta: null,
          systemBodies: [],
          systemConfig: null,
        } : {}),
      });
    }, 600);
  },

  resetGame: () => set({
    phase: 'setup',
    currentLevel: 'universe',
    navigationStack: [],
    galaxies: [],
    activeGalaxyMeta: null,
    galaxyStars: [],
    galaxyConfig: null,
    activeStarMeta: null,
    systemBodies: [],
    systemConfig: null,
    isTransitioning: false,
  }),
}));
