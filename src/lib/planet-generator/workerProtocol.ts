import type { LayerType, PlanetConfig } from './generator';

export interface PlanetProbe {
  elevation: number;
  temperature: number;
  moisture: number;
  biome: number;
  movementCost: number;
  fertility: number;
  ore: number;
  spice: number;
  resource: number;
  fauna: number;
  boundaryType: number;
  plateDistance: number;
  water: number;
}

export type WorkerRequest =
  | { kind: 'texture'; id: number; config: PlanetConfig; layer?: LayerType }
  | { kind: 'open'; id: number; sessionId: string; config: PlanetConfig }
  | { kind: 'render'; id: number; sessionId: string; layer: LayerType }
  | { kind: 'probe'; id: number; sessionId: string; x: number; y: number }
  | { kind: 'close'; sessionId: string };

export type WorkerResponse =
  | { kind: 'texture'; id: number; width: number; height: number; data: Uint8ClampedArray; clouds: Uint8ClampedArray | null }
  | { kind: 'progress'; id: number; progress: number; status: string }
  | { kind: 'opened'; id: number; clouds: Uint8ClampedArray | null; cloudWidth: number; cloudHeight: number }
  | { kind: 'layer'; id: number; width: number; height: number; data: Uint8ClampedArray }
  | { kind: 'probe'; id: number; probe: PlanetProbe | null }
  | { kind: 'error'; id: number; message: string };
