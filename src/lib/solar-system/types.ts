import { PlanetConfig, PlanetType } from '../planet-generator/generator';

export type StarClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface Orbit {
  semiMajorAxis: number; // Distância (raio em px ou au)
  eccentricity: number;  // 0 = Círculo, >0 = Elipse
  trueAnomaly: number;   // Posição atual no ângulo (0 a 2PI)
  argumentOfPeriapsis: number; // Rotação do periastro
}

export type CelestialBodyType = 'star' | 'planet' | 'moon' | 'asteroid' | 'comet';

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialBodyType;
  parentId?: string;     // ID do corpo que está orbitando (estrela ou planeta)
  orbit: Orbit;
  radius: number;        // Tamanho visual do círculo
  baseColor: string;     // Cor predominante para renderização 2D simple
  hasRings: boolean;
  planetConfig?: PlanetConfig; // Configuração completa gerencial (null para estrelas/asteroides puros)
  
  // Custom properties for specific types
  starClass?: StarClass; // Se type === 'star'
  isHabitable?: boolean; // Se a bio detectou chance de vida (Earth/Alien)
  isForming?: boolean;   // Se o corpo ainda está em formação (sistemas jovens)
}

export interface SolarSystemConfig {
  seed: string;
  systemAge: number;     // 0 a 1 (0 = jovem caótico, 1 = velho estável)
  starClass: StarClass;
  isBinary: boolean;
  numPlanets: number;    // Ex: 3 a 15
  rockyPercentage: number; // 0 a 1
  lifeChance: number;    // 0 a 1
  numMoons: number;      // Ex: 0 a 30 (distribuídas)
  numAsteroidBelts: number; // Ex: 0 a 3
  starName?: string;     // If provided by Galaxy, use this instead of generating one
}
