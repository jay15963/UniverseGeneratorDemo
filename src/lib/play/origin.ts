// The waters the species was born in: a shallow, mild sea point of the home planet (deterministic per planet),
// and the shore nearest to a point (where a lineage climbs onto the land).
import type { PlanetSession } from '../planet-generator/planetClient';
import type { HomeWorld } from './homeworld';
import { mulberry, seedToInt } from '../terrain/noise';

/** map px of a shallow sea point near a coast */
export async function findOrigin(session: PlanetSession, home: HomeWorld): Promise<{ x: number; y: number }> {
  const rnd = mulberry(seedToInt(home.config.seed + ':origin'));
  const W = session.width, H = session.height, sea = home.config.seaLevel;
  let best: { x: number; y: number; s: number } | null = null;
  for (let batch = 0; batch < 8; batch++) {
    const pts = Array.from({ length: 48 }, () => ({ x: Math.floor(rnd() * W), y: Math.floor(H * (0.2 + rnd() * 0.6)) }));
    const probes = await Promise.all(pts.map(p => session.probe(p.x, p.y).catch(() => null)));
    probes.forEach((pr, i) => {
      if (!pr || pr.elevation > sea) return;
      const depth = sea - pr.elevation;
      const s = depth * 10 + Math.abs(pr.temperature - 0.6);
      if (!best || s < best.s) best = { ...pts[i], s };
    });
    if (best && (best as { s: number }).s < 0.3) break;
  }
  return best ?? { x: W / 2, y: H / 2 };
}
