// Deterministic "scanner" data for celestial bodies, plus display names/descriptions.
// Derived only from the body's seed/config so it is identical for every player.
import seedrandom from 'seedrandom';
import { CelestialBody, StarClass } from './types';
import { PlanetType } from '../planet-generator/generator';

export const PLANET_TYPE_NAMES: Record<string, string> = {
  'earth-like': 'Terrestre',
  'rocky-airless': 'Rochoso Sem Atmosfera',
  'arid': 'Árido / Desértico',
  'toxic-atmosphere': 'Atmosfera Tóxica',
  'glacial': 'Glacial',
  'gas-giant': 'Gigante Gasoso',
  'alien-life': 'Vida Alienígena',
  'lava-world': 'Mundo de Lava',
  'ocean-world': 'Mundo Oceânico',
  'frozen-ocean': 'Oceano Congelado',
  'tidally-locked': 'Rotação Síncrona',
  'tidally-locked-dead': 'Rotação Síncrona (Morto)',
  'carbon-world': 'Mundo de Carbono',
  'swamp-world': 'Mundo Pantanoso',
  'ash-world': 'Mundo de Cinzas',
};

export const PLANET_TYPE_DESCRIPTIONS: Record<string, string> = {
  'earth-like': 'Um mundo temperado com oceanos líquidos, atmosfera respirável e vegetação abundante. Condições ideais para o desenvolvimento de vida complexa.',
  'rocky-airless': 'Um corpo rochoso sem atmosfera significativa, coberto por crateras de impacto e regolito. Similar a Mercúrio ou à Lua.',
  'arid': 'Mundo desértico com vastas planícies de areia e cânions profundos. Atmosfera fina e temperaturas extremas entre dia e noite.',
  'toxic-atmosphere': 'Envolvido por uma atmosfera densa e corrosiva. Chuvas ácidas e pressão extrema tornam a superfície hostil.',
  'glacial': 'Um mundo congelado coberto por camadas espessas de gelo. Temperaturas extremamente baixas e ventos cortantes.',
  'gas-giant': 'Um colosso gasoso sem superfície sólida. Bandas atmosféricas, tempestades ciclônicas massivas e ventos de milhares de km/h.',
  'alien-life': 'Um mundo exótico que abriga formas de vida com bioquímica diferente da terrestre. Flora e fauna de cores e formas incomuns.',
  'lava-world': 'Superfície coberta por oceanos de magma e vulcões em erupção constante. Temperaturas superiores a 1000°C.',
  'ocean-world': 'Um planeta coberto por um oceano global profundo, com raras ilhas vulcânicas e possível vida marinha.',
  'frozen-ocean': 'Oceano global sob uma crosta de gelo. Fraturas e gêiseres revelam um oceano subterrâneo potencialmente habitável.',
  'tidally-locked': 'Um lado em dia perpétuo, outro em noite eterna, com uma faixa crepuscular intermediária.',
  'tidally-locked-dead': 'Metade derretida em lava permanente, metade congelada no vácuo escuro. Totalmente estéril.',
  'carbon-world': 'Rico em grafite, diamantes e hidrocarbonetos. Superfície escura com lagos de metano e etano.',
  'swamp-world': 'Mundo úmido e quente coberto por pântanos densos e vegetação primitiva. Atmosfera rica em metano.',
  'ash-world': 'Coberto por camadas profundas de cinzas vulcânicas. Rios de lava serpenteiam entre planícies cinzentas.',
};

export const STAR_CLASS_NAMES: Record<string, string> = {
  O: 'Gigante Azul (Classe O)', B: 'Azul-Branca (Classe B)', A: 'Branca (Classe A)',
  F: 'Amarelo-Branca (Classe F)', G: 'Anã Amarela (Classe G)', K: 'Anã Laranja (Classe K)',
  M: 'Anã Vermelha (Classe M)',
};

export const STAR_PHYSICS: Record<StarClass, { tempK: number; massSun: number; lumSun: number; lifeGyr: number }> = {
  O: { tempK: 38000, massSun: 40, lumSun: 250000, lifeGyr: 0.005 },
  B: { tempK: 18000, massSun: 8, lumSun: 3000, lifeGyr: 0.1 },
  A: { tempK: 8500, massSun: 2.1, lumSun: 20, lifeGyr: 1.2 },
  F: { tempK: 6600, massSun: 1.3, lumSun: 3, lifeGyr: 4 },
  G: { tempK: 5700, massSun: 1, lumSun: 1, lifeGyr: 10 },
  K: { tempK: 4400, massSun: 0.7, lumSun: 0.3, lifeGyr: 30 },
  M: { tempK: 3100, massSun: 0.25, lumSun: 0.02, lifeGyr: 200 },
};

function hashRng(body: CelestialBody) {
  return seedrandom((body.planetConfig?.seed ?? body.id) + '_info');
}

/** Visual spin period of the body in simulation ticks (shared by renderer + scanner). */
export function spinPeriodTicks(body: CelestialBody): number {
  const rng = hashRng(body);
  const t = body.planetConfig?.planetType;
  if (t === PlanetType.GAS_GIANT) return 500 + rng() * 500;
  if (t === PlanetType.TIDALLY_LOCKED || t === PlanetType.TIDALLY_LOCKED_DEAD) return 1e9;
  if (body.type === 'moon') return 1600 + rng() * 2400;
  return 900 + rng() * 1800;
}

export interface BodyStat { label: string; value: string; color?: string }

const TEMP_C: Partial<Record<PlanetType, [number, number]>> = {
  [PlanetType.EARTH_LIKE]: [4, 28],
  [PlanetType.ALIEN_LIFE]: [8, 38],
  [PlanetType.OCEAN_WORLD]: [2, 24],
  [PlanetType.SWAMP_WORLD]: [25, 55],
  [PlanetType.ARID]: [-40, 55],
  [PlanetType.TOXIC_ATMOSPHERE]: [380, 480],
  [PlanetType.GLACIAL]: [-230, -150],
  [PlanetType.FROZEN_OCEAN]: [-190, -140],
  [PlanetType.LAVA_WORLD]: [900, 1600],
  [PlanetType.ASH_WORLD]: [120, 400],
  [PlanetType.CARBON_WORLD]: [-180, -90],
  [PlanetType.ROCKY_AIRLESS]: [-170, 200],
  [PlanetType.GAS_GIANT]: [-220, -110],
  [PlanetType.TIDALLY_LOCKED_DEAD]: [-200, 700],
  [PlanetType.TIDALLY_LOCKED]: [-120, 120],
};

const PRESSURE: Partial<Record<PlanetType, [number, number]>> = {
  [PlanetType.EARTH_LIKE]: [0.8, 1.3],
  [PlanetType.ALIEN_LIFE]: [0.6, 2.2],
  [PlanetType.OCEAN_WORLD]: [1, 3],
  [PlanetType.SWAMP_WORLD]: [1.5, 4],
  [PlanetType.ARID]: [0.005, 0.2],
  [PlanetType.TOXIC_ATMOSPHERE]: [40, 95],
  [PlanetType.GLACIAL]: [0, 0.02],
  [PlanetType.FROZEN_OCEAN]: [0, 0.001],
  [PlanetType.LAVA_WORLD]: [0.1, 5],
  [PlanetType.ASH_WORLD]: [2, 10],
  [PlanetType.CARBON_WORLD]: [0.5, 2],
};

const ATMOSPHERE: Partial<Record<PlanetType, string>> = {
  [PlanetType.EARTH_LIKE]: 'N₂ 78% · O₂ 21% · Ar',
  [PlanetType.ALIEN_LIFE]: 'N₂ · O₂ · traços exóticos',
  [PlanetType.OCEAN_WORLD]: 'N₂ · H₂O · O₂',
  [PlanetType.SWAMP_WORLD]: 'N₂ · CH₄ · H₂O',
  [PlanetType.ARID]: 'CO₂ 95% · N₂ · Ar',
  [PlanetType.TOXIC_ATMOSPHERE]: 'CO₂ 96% · SO₂ · H₂SO₄',
  [PlanetType.GLACIAL]: 'N₂ rarefeito · CH₄',
  [PlanetType.FROZEN_OCEAN]: 'O₂ tênue (exosfera)',
  [PlanetType.LAVA_WORLD]: 'SiO · Na · vapor rochoso',
  [PlanetType.ASH_WORLD]: 'SO₂ · CO₂ · cinzas',
  [PlanetType.CARBON_WORLD]: 'CH₄ · CO · C₂H₆',
  [PlanetType.GAS_GIANT]: 'H₂ 90% · He 10% · NH₃',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function bodyStats(body: CelestialBody): BodyStat[] {
  const pc = body.planetConfig;
  const rng = hashRng(body);
  const stats: BodyStat[] = [];
  if (body.type === 'star' && body.starClass) {
    const s = STAR_PHYSICS[body.starClass];
    stats.push({ label: 'Temperatura', value: `${Math.round(s.tempK * (0.95 + rng() * 0.1)).toLocaleString('pt-BR')} K` });
    stats.push({ label: 'Massa', value: `${(s.massSun * (0.9 + rng() * 0.2)).toFixed(2)} M☉` });
    stats.push({ label: 'Luminosidade', value: `${(s.lumSun * (0.85 + rng() * 0.3)).toPrecision(3)} L☉` });
    stats.push({ label: 'Vida estimada', value: s.lifeGyr < 1 ? `${Math.round(s.lifeGyr * 1000)} Ma` : `${s.lifeGyr} Ga` });
    return stats;
  }
  if (!pc) {
    stats.push({ label: 'Composição', value: body.type === 'comet' ? 'Gelo · poeira' : 'Rocha · metais' });
    return stats;
  }
  const t = pc.planetType;
  const isGas = t === PlanetType.GAS_GIANT;
  const gravity = isGas ? (1.2 + (pc.planetSize - 1.5) * 0.9) : (0.3 + pc.planetSize * 0.36);
  stats.push({ label: 'Gravidade', value: `${gravity.toFixed(2)} g`, color: gravity > 1.6 ? '#f97316' : undefined });

  const tr = TEMP_C[t] ?? [-100, 50];
  const temp = Math.round(lerp(tr[0], tr[1], rng()));
  stats.push({ label: 'Temp. média', value: `${temp > 0 ? '+' : ''}${temp} °C`, color: temp > 60 ? '#fb923c' : temp < -40 ? '#7dd3fc' : '#86efac' });

  const pr = PRESSURE[t];
  if (!isGas) stats.push({ label: 'Pressão', value: pr ? `${lerp(pr[0], pr[1], rng()).toPrecision(2)} atm` : '≈ 0 atm (vácuo)' });
  stats.push({ label: 'Atmosfera', value: ATMOSPHERE[t] ?? 'Inexistente' });

  const period = spinPeriodTicks(body);
  const hours = period > 1e8 ? null : (period / 1200) * 24;
  stats.push({ label: 'Duração do dia', value: hours === null ? 'Travado (síncrono)' : `${hours.toFixed(1)} h` });

  const bio = body.isHabitable ? 'Complexa' : t === PlanetType.SWAMP_WORLD || t === PlanetType.OCEAN_WORLD ? (rng() < 0.6 ? 'Microbiana' : 'Nenhuma detectada') : t === PlanetType.FROZEN_OCEAN ? (rng() < 0.3 ? 'Possível (subsuperfície)' : 'Nenhuma detectada') : 'Ausente';
  stats.push({ label: 'Biosfera', value: bio, color: bio === 'Complexa' ? '#4ade80' : bio === 'Ausente' ? undefined : '#a3e635' });

  // Earth Similarity Index (simplified): gravity, temperature, pressure distance from Earth
  const pMid = pr ? lerp(pr[0], pr[1], 0.5) : 0;
  const esi = isGas ? 0 : Math.max(0,
    (1 - Math.min(1, Math.abs(gravity - 1) / 1.5)) *
    (1 - Math.min(1, Math.abs(temp - 15) / 120)) *
    (1 - Math.min(1, Math.abs(Math.log10(Math.max(0.001, pMid))) / 2)));
  stats.push({ label: 'Similaridade c/ Terra', value: `${Math.round(esi * 100)}%`, color: esi > 0.75 ? '#4ade80' : esi > 0.4 ? '#facc15' : '#f87171' });
  return stats;
}
