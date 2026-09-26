// The player's home planet (play mode): the real world of the explorable universe the lineage lives on, under the
// discovery fog. At first only the waters where the species was born are known; the camera (the creatures, from the
// aquatic era on) reveals a circle around itself, Civilization style, and what was seen stays discovered.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Globe2, Eye, RotateCcw, Sparkles } from 'lucide-react';
import { loadSpecies, makeSpecies, saveSpecies, universeOf, type CellSpecies } from '../../lib/cell/look';
import { findHomeworld, homeConfig, AQUATIC_START_STAGE, type HomeWorld } from '../../lib/play/homeworld';
import { Discovery } from '../../lib/play/discovery';
import { openPlanetSession, type PlanetSession } from '../../lib/planet-generator/planetClient';
import { LayerType } from '../../lib/planet-generator/generator';
import { LIFE_STAGE_PT } from '../../lib/planet-generator/lifeStage';
import { mulberry, seedToInt } from '../../lib/terrain/noise';
import { MapViewer } from '../MapViewer';

interface Props { onBack: () => void }

/** previews of the planet through the aquatic era (the era itself will push the stage with its oxygen) */
const STAGES: [number, string][] = [[AQUATIC_START_STAGE, 'Início da era aquática'], [0.45, 'Meio: costas verdes'], [0.78, 'Fim: a vegetação avança'], [1, 'Planeta verde']];
/** sight of the camera at the gameplay zooms (tiles) */
const SIGHT = 160;
/** the waters the species was born in, discovered from the start (map px) */
const ORIGIN_R = 12;

export function HomeWorldView({ onBack }: Props) {
  const [sp, setSp] = useState<CellSpecies>(() => loadSpecies() ?? makeSpecies('LINHAGEM'));
  const [err, setErr] = useState('');
  // the home world is drawn once from the universe seed and kept with the species
  useEffect(() => {
    if (sp.home && sp.home.universeSeed === universeOf(sp)) return;
    let dead = false;
    findHomeworld(universeOf(sp), sp.mode).then(home => {
      if (dead) return;
      if (!home) { setErr('Este universo não tem um mundo oceânico vivo. Troque a semente do universo no editor da célula.'); return; }
      const next = { ...sp, home }; saveSpecies(next); setSp(next);
    }).catch(e => setErr(String(e)));
    return () => { dead = true; };
  }, [sp]);
  const home = sp.home && sp.home.universeSeed === universeOf(sp) ? sp.home : null;

  const [stage, setStage] = useState(AQUATIC_START_STAGE);
  const config = useMemo(() => (home ? homeConfig(home, stage) : null), [home, stage]);
  const [session, setSession] = useState<PlanetSession | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!config) return;
    setSession(null);
    const job = openPlanetSession(config, (p, s) => { setProgress(p); setStatus(s); });
    let live: PlanetSession | null = null;
    job.ready.then(s => { live = s; setSession(s); }).catch(() => {});
    return () => { job.cancel(); live?.dispose(); };
  }, [config]);

  // one fog per planet (whatever the preview stage)
  const fog = useMemo(() => (home ? new Discovery(`${home.universeSeed}:${home.bodyId}:${home.config.seed}`, home.config.width, home.config.height) : null), [home]);
  const [fogReady, setFogReady] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setFogReady(false);
    if (!fog || !session || !home) return;
    if (fog.seen > 0) { setFogReady(true); return; }
    let dead = false;
    findOrigin(session, home).then(o => { if (dead) return; fog.reveal(o.x, o.y, ORIGIN_R); fog.save(); setFogReady(true); });
    return () => { dead = true; };
  }, [fog, session, home, tick]);
  useEffect(() => () => fog?.save(), [fog]);
  // the share discovered keeps moving while the camera explores
  const [, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(n => n + 1), 1000); return () => clearInterval(id); }, []);

  const pct = fog ? fog.fraction * 100 : 0;
  return (
    <div className="min-h-screen lg:h-screen bg-[#04070d] text-white font-sans flex flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Eras</button>
        <div className="w-px h-5 bg-white/10" />
        <Globe2 className="w-5 h-5 text-sky-300" />
        <div className="min-w-0">
          <h1 className="font-black tracking-wide text-base sm:text-lg leading-tight truncate">{home ? home.bodyName : 'Planeta natal'}</h1>
          <p className="text-[10px] sm:text-[11px] font-mono text-sky-200/70 truncate">
            {home ? `estrela ${home.starName} · galáxia ${home.galaxyName} · universo ${home.universeSeed}` : 'procurando no universo…'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="italic font-serif text-amber-100">{sp.genus} {sp.species}</span>
          {fog && <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 font-mono" title="Parte do planeta já vista pela sua espécie">🧭 {pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}% descoberto</span>}
          <select value={stage} onChange={e => setStage(+e.target.value)} title="Prévia da evolução da vida no planeta ao longo da era aquática"
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1">
            {STAGES.map(([v, l]) => <option key={v} value={v} className="bg-neutral-900">{l}</option>)}
          </select>
          {fog && <button onClick={() => { fog.reset(); setTick(t => t + 1); }} title="Esquecer o que foi descoberto (volta só às águas de origem)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><RotateCcw className="w-3.5 h-3.5" /> Recomeçar</button>}
        </div>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 p-3 sm:p-5">
        <div className="min-h-0 flex flex-col lg:overflow-y-auto no-scrollbar">
          {config && fogReady ? (
            <div key={`${config.seed}:${stage}:${tick}`} className="flex-1 min-h-0 flex flex-col"><MapViewer layer={LayerType.FINAL} config={config} isGenerating={!session} progress={progress} status={status} session={session}
              compact worldName={home!.bodyName} fog={fog} sight={SIGHT} /></div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-neutral-400">
              {err ? <p className="text-red-300 max-w-md text-center">{err}</p> : <>
                <div className="w-10 h-10 rounded-full border-2 border-sky-400/30 border-t-sky-300 animate-spin" />
                <p className="font-mono text-xs">{!home ? 'Viajando pelo universo até o planeta natal…' : !session ? (status || 'Gerando o planeta…') : 'Achando as águas de origem…'}</p>
                {home && !session && <div className="w-56 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sky-300" style={{ width: `${progress * 100}%` }} /></div>}
              </>}
            </div>
          )}
        </div>
        <aside className="space-y-3 text-[12px] leading-relaxed text-neutral-300">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80 mb-1"><Sparkles className="w-3.5 h-3.5" /> O mundo da linhagem</div>
            <p>Um planeta de verdade do universo explorável: o mesmo mundo, da era aquática à espacial. Troque a <b className="text-white">semente do universo</b> no editor da célula para nascer em outro lugar.</p>
            <p className="mt-1.5 text-neutral-400">{LIFE_STAGE_PT(stage)}.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80 mb-1"><Eye className="w-3.5 h-3.5" /> Neblina de descoberta</div>
            <p>Só as águas onde a espécie nasceu são conhecidas. O resto do planeta é escuro até que alguém da espécie chegue perto: a visão é um círculo em volta de cada criatura, e o que foi visto fica descoberto para sempre.</p>
            <p className="mt-1.5 text-neutral-400">Para testar: <b className="text-neutral-200">Espectador</b> e clique numa área descoberta; nos zooms de gameplay a câmera revela {SIGHT} tiles em volta. Numa era aquática, a costa aparece ao nadar perto dela.</p>
          </div>
        </aside>
      </div>
    </div>
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
