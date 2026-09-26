// The player's home planet (play mode): the real world of the explorable universe the lineage lives on, under the
// discovery fog. It opens straight into the planet's own view (the same zooms as the spectator mode) at the waters
// the species was born in; the rest of the world is unknown until the camera (the creatures, from the aquatic era
// on) comes near. The planet's name is never shown: where one lives is found out by going there.
import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { loadSpecies, makeSpecies, saveSpecies, universeOf, type CellSpecies } from '../../lib/cell/look';
import { findHomeworld, homeConfig, AQUATIC_START_STAGE, type HomeWorld } from '../../lib/play/homeworld';
import { Discovery } from '../../lib/play/discovery';
import { openPlanetSession, type PlanetSession } from '../../lib/planet-generator/planetClient';
import { PlanetType } from '../../lib/planet-generator/generator';
import { mulberry, seedToInt } from '../../lib/terrain/noise';
import { SurvivalView } from '../Survival/SurvivalView';

interface Props { onBack: () => void }

/** previews of the planet through the aquatic era (the era itself will push the stage with its oxygen) */
const STAGES: [number, string][] = [[AQUATIC_START_STAGE, 'Início da era aquática'], [0.45, 'Meio: costas verdes'], [0.78, 'Fim: a vegetação avança'], [1, 'Planeta verde']];
/** sight of the camera at the gameplay zooms (tiles) */
const SIGHT = 160;
/** the waters the species was born in, discovered from the start (map px) */
const ORIGIN_R = 12;

const homeFits = (sp: CellSpecies, h?: HomeWorld): h is HomeWorld =>
  !!h && h.universeSeed === universeOf(sp) && (h.config.planetType === PlanetType.ALIEN_LIFE) === (sp.mode === 'alien');

export function HomeWorldView({ onBack }: Props) {
  const [sp, setSp] = useState<CellSpecies>(() => loadSpecies() ?? makeSpecies('LINHAGEM'));
  const [err, setErr] = useState('');
  // the home world is drawn once from the universe seed (secretly) and kept with the species
  useEffect(() => {
    if (homeFits(sp, sp.home)) return;
    let dead = false;
    findHomeworld(universeOf(sp), sp.mode).then(home => {
      if (dead) return;
      if (!home) { setErr('Este universo não tem um mundo habitável para a sua espécie. Troque a semente do universo no editor da célula.'); return; }
      const next = { ...sp, home }; saveSpecies(next); setSp(next);
    }).catch(e => setErr(String(e)));
    return () => { dead = true; };
  }, [sp]);
  const home = homeFits(sp, sp.home) ? sp.home : null;

  const [stage, setStage] = useState(AQUATIC_START_STAGE);
  const config = useMemo(() => (home ? homeConfig(home, stage) : null), [home, stage]);
  const [session, setSession] = useState<PlanetSession | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!config) return;
    setSession(null);
    const job = openPlanetSession(config, (p) => setProgress(p));
    let live: PlanetSession | null = null;
    job.ready.then(s => { live = s; setSession(s); }).catch(() => {});
    return () => { job.cancel(); live?.dispose(); };
  }, [config]);

  // one fog per planet (whatever the preview stage); the waters of origin are known from the start
  const fog = useMemo(() => (home ? new Discovery(`${home.universeSeed}:${home.bodyId}:${home.config.seed}`, home.config.width, home.config.height) : null), [home]);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setOrigin(null);
    if (!fog || !session || !home) return;
    let dead = false;
    findOrigin(session, home).then(o => {
      if (dead) return;
      if (fog.seen === 0) { fog.reveal(o.x, o.y, ORIGIN_R); fog.save(); }
      setOrigin(o);
    });
    return () => { dead = true; };
  }, [fog, session, home, tick]);
  useEffect(() => () => fog?.save(), [fog]);
  // the share discovered keeps moving while the camera explores
  const [, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(n => n + 1), 1000); return () => clearInterval(id); }, []);

  if (!session || !origin || !fog) {
    return (
      <div className="fixed inset-0 bg-[#03060c] text-white flex flex-col items-center justify-center gap-4">
        {err ? <>
          <p className="text-red-300 max-w-md text-center text-sm">{err}</p>
          <button onClick={onBack} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm">Voltar</button>
        </> : <>
          <div className="w-12 h-12 rounded-full border-2 border-sky-400/25 border-t-sky-300 animate-spin" />
          <p className="font-mono text-xs text-sky-200/80 tracking-widest">{!home ? 'ATRAVESSANDO O UNIVERSO…' : !session ? 'DESCENDO AO MUNDO NATAL…' : 'CHEGANDO ÀS ÁGUAS DE ORIGEM…'}</p>
          <div className="w-56 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sky-300 transition-all" style={{ width: `${(home ? 0.15 + progress * 0.85 : 0.08) * 100}%` }} /></div>
          <p className="italic font-serif text-amber-100/70 text-sm">{sp.genus} {sp.species}</p>
        </>}
      </div>
    );
  }

  const pct = fog.fraction * 100;
  return (
    <>
      <div key={`${config!.seed}:${stage}:${tick}`}>
        <SurvivalView session={session} mapX={origin.x} mapY={origin.y} spectator title="Mundo natal" aquatic
          discovery={{ fog, sight: SIGHT }} onExit={() => { fog.save(); onBack(); }} />
      </div>
      <div className="fixed z-[320] bottom-16 left-3 flex flex-col gap-1.5 text-xs">
        <span className="self-start italic font-serif text-amber-100 bg-black/60 border border-white/10 rounded-lg px-2 py-1">{sp.genus} {sp.species}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-1 rounded-lg bg-black/60 border border-white/10 font-mono text-neutral-200" title="Parte do planeta já vista pela sua espécie">🧭 {pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}% descoberto</span>
          <select value={stage} onChange={e => setStage(+e.target.value)} title="Prévia da evolução da vida no planeta ao longo da era aquática"
            className="bg-black/70 border border-white/10 rounded-lg px-2 py-1 text-neutral-200">
            {STAGES.map(([v, l]) => <option key={v} value={v} className="bg-neutral-900">{l}</option>)}
          </select>
          <button onClick={() => { fog.reset(); setTick(t => t + 1); }} title="Esquecer o que foi descoberto (volta só às águas de origem)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-neutral-200 hover:bg-white/10"><RotateCcw className="w-3.5 h-3.5" /> Recomeçar</button>
        </div>
      </div>
    </>
  );
}

/** the waters the species was born in: a shallow sea point near a coast (deterministic per planet) */
async function findOrigin(session: PlanetSession, home: HomeWorld): Promise<{ x: number; y: number }> {
  const rnd = mulberry(seedToInt(home.config.seed + ':origin'));
  const W = session.width, H = session.height, sea = home.config.seaLevel;
  let best: { x: number; y: number; s: number } | null = null;
  for (let batch = 0; batch < 8; batch++) {
    const pts = Array.from({ length: 48 }, () => ({ x: Math.floor(rnd() * W), y: Math.floor(H * (0.2 + rnd() * 0.6)) }));
    const probes = await Promise.all(pts.map(p => session.probe(p.x, p.y).catch(() => null)));
    probes.forEach((pr, i) => {
      if (!pr || pr.elevation > sea) return;
      const depth = sea - pr.elevation;
      // shallow, mild water scores best
      const s = depth * 10 + Math.abs(pr.temperature - 0.6);
      if (!best || s < best.s) best = { ...pts[i], s };
    });
    if (best && (best as { s: number }).s < 0.3) break;
  }
  return best ?? { x: W / 2, y: H / 2 };
}
