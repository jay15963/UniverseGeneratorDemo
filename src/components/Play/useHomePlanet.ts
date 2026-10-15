// Shared loading of the home planet for every era played on it: the lineage (cell species), its home world
// (drawn once from the universe seed), the planet session at the save's life stage, the planet grid for the
// simulations, the discovery fog and the waters of origin.
import { useEffect, useMemo, useState } from 'react';
import { saveSpecies, universeOf, type CellSpecies } from '../../lib/cell/look';
import { findHomeworld, homeConfig, type HomeWorld } from '../../lib/play/homeworld';
import { Discovery } from '../../lib/play/discovery';
import { findOrigin } from '../../lib/play/origin';
import { openPlanetSession, type PlanetSession, type PlanetGrid } from '../../lib/planet-generator/planetClient';
import { PlanetType } from '../../lib/planet-generator/generator';
import { currentSpecies } from '../../lib/game/save';

const homeFits = (sp: CellSpecies, h?: HomeWorld): h is HomeWorld =>
  !!h && h.universeSeed === universeOf(sp) && (h.config.planetType === PlanetType.ALIEN_LIFE) === (sp.mode === 'alien');

export interface HomePlanet {
  species: CellSpecies; home: HomeWorld | null; session: PlanetSession | null; grid: PlanetGrid | null; fog: Discovery | null;
  /** waters of origin (map px) */
  origin: { x: number; y: number } | null;
  progress: number; error: string; status: string;
}

export function useHomePlanet(lifeStage: number, aquaticView: boolean): HomePlanet {
  const [sp, setSp] = useState<CellSpecies>(() => currentSpecies());
  const [error, setError] = useState('');
  useEffect(() => {
    if (homeFits(sp, sp.home)) return;
    let dead = false;
    findHomeworld(universeOf(sp), sp.mode).then(home => {
      if (dead) return;
      if (!home) { setError('Este universo não tem um mundo habitável para a sua espécie. Troque a semente do universo no editor da célula.'); return; }
      const next = { ...sp, home }; saveSpecies(next); setSp(next);
    }).catch(e => setError(String(e)));
    return () => { dead = true; };
  }, [sp]);
  const home = homeFits(sp, sp.home) ? sp.home : null;
  // the session opens once at the life stage the era starts with (the era then pushes it live)
  const [stage0] = useState(lifeStage);
  const config = useMemo(() => (home ? homeConfig(home, stage0, aquaticView) : null), [home, stage0, aquaticView]);
  const [session, setSession] = useState<PlanetSession | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!config) return;
    setSession(null);
    const job = openPlanetSession(config, p => setProgress(p));
    let live: PlanetSession | null = null;
    job.ready.then(s => { live = s; setSession(s); }).catch(() => {});
    return () => { job.cancel(); live?.dispose(); };
  }, [config]);
  const [grid, setGrid] = useState<PlanetGrid | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setGrid(null); setOrigin(null);
    if (!session || !home) return;
    let dead = false;
    Promise.all([session.grid(), findOrigin(session, home)]).then(([g, o]) => { if (!dead) { setGrid(g); setOrigin(o); } }).catch(e => setError(String(e)));
    return () => { dead = true; };
  }, [session, home]);
  const fog = useMemo(() => (home ? new Discovery(`${home.universeSeed}:${home.bodyId}:${home.config.seed}`, home.config.width, home.config.height) : null), [home]);
  useEffect(() => () => fog?.save(), [fog]);
  const status = error ? error : !home ? 'ATRAVESSANDO O UNIVERSO…' : !session ? 'DESCENDO AO MUNDO NATAL…' : !grid ? 'MAPEANDO O PLANETA…' : '';
  return { species: sp, home, session, grid, fog, origin, progress, error, status };
}
