// The cellular era (play mode): a colony RTS in a microscopic pool. Loading (world, sprite atlas on a worker pool,
// simulation worker), then the engine (engine.ts) draws the pool and the HUD below drives it: resources, the nation's
// colonies and their cells (top right), the division bar of the chosen colony, selection and stances (delegation), objectives,
// minimap.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, FastForward, Home, Target, HelpCircle, X, CheckCircle2, Circle, Sprout, Zap, Users, Hexagon, Trophy, Skull, CircleDot, ChevronDown, Dna, FlaskConical, Lock, Shield, Wind } from 'lucide-react';
import { CellSpecies, KINDS, Kind, TRAINABLE, ROLE, saveSpecies, SPECIES_KINDS, LOCKED, TECHS, TITANS, titanType } from '../../lib/cell/look';
import { makeGenome, Stage, DEFAULT_PARAMS } from '../../lib/creature/genome';
import { renderCreature } from '../../lib/creature/render';
import { SpeciesPanel } from './SpeciesPanel';
import { TechPanel } from './TechPanel';
import { makeWorld, WorldDef } from '../../lib/cell/world';
import { buildAtlas, atlasJobs, Atlas, LAYER } from '../../lib/cell/atlas';
import { STANCES, GRACE, COLONY_GAP, NODE_GAP } from '../../lib/cell/sim';
import { CellEngine, HudState } from './engine';

interface Props { species: CellSpecies; onExit: () => void; onRestart: () => void }

const GOALS: [string, string][] = [
  ['food', 'Acumule 200 nutrientes'],
  ['divide', 'Divida a célula-mãe para criar uma célula'],
  ['photo', 'Coloque uma fotossintética sob um feixe de luz dentro do biofilme'],
  ['node', 'Fixe um nódulo de biofilme (botão Nódulo na barra de divisão)'],
  ['colony', 'Funde uma nova colônia (divida uma célula-mãe e leve-a a um espaço livre)'],
  ['gene', 'Roube um gene: engula células de outra espécie com fagócitas'],
  ['pact', 'Faça as pazes com outra espécie (painel Espécies)'],
  ['endo', 'Endossimbiose: transforme um parceiro simbiótico em organela'],
  ['big', 'Chegue a 60 células'],
];
const STANCE_HINT = [
  'Cada tipo faz o seu trabalho sozinho: coletoras colhem, fotossintéticas buscam luz, combatentes guardam a área.',
  'Procura e carrega nutrientes para o biofilme.',
  'Guarda o ponto onde está e ataca quem entrar na área.',
  'Patrulha em volta e ataca inimigos e presas que encontrar.',
  'Explora o mundo sem parar. Volta para comer quando a reserva acaba.',
];
/** extra lines of the division tooltips */
const TIP_NOTE: Partial<Record<Kind, string>> = {
  [Kind.WORKER]: 'Não luta: foge dos inimigos e só coleta. É a coletora que cria biofilme: use o botão Nódulo e a coletora mais próxima da colônia vai até o ponto e se transforma.',
  [Kind.NODE]: `Entra no modo de posicionamento: clique na borda do seu biofilme. Não pode ficar a menos de ${NODE_GAP} de outro nódulo ou colônia, nem de inimigos - os alcances aparecem no mapa. Expande o território e dá +6 de população.`,
  [Kind.PHOTO]: 'Estrutura (F): clique no mapa, dentro do seu biofilme, onde ela deve se fixar. Não custa manutenção e gera energia; sob um feixe de luz, o dobro. Shift: colocar várias.',
  [Kind.SENTINEL]: 'Estrutura (T): clique no mapa, dentro do seu biofilme. Atira de longe (270) em tudo que chega perto: proteja fotossintéticas, nódulos e colônias.',
  [Kind.MOTHER]: `Nasce solta: selecione e clique com o botão direito num espaço livre a ${COLONY_GAP}+ de outras células-mãe (fora de biofilme estrangeiro). Ao parar, ela se fixa e vira uma nova colônia (+8 de população).`,
  [Kind.SCOUT]: 'Rápida e com reserva maior: ótima para achar nutrientes, luz e espaços livres.',
};
const ORDER: Kind[] = [Kind.MOTHER, Kind.NODE, Kind.WORKER, Kind.PHOTO, Kind.SENTINEL, Kind.SCOUT, Kind.HUNTER, Kind.SPITTER, Kind.ARMOR, Kind.TITAN];
/** the division bar: the node sits next to the worker that becomes it */
const BAR: Kind[] = [Kind.WORKER, Kind.NODE, Kind.PHOTO, Kind.SENTINEL, Kind.SCOUT, Kind.HUNTER, Kind.SPITTER, Kind.ARMOR, Kind.TITAN, Kind.MOTHER];
const PLACE_KINDS: Kind[] = [Kind.NODE, Kind.PHOTO, Kind.SENTINEL];
const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

export function CellGame({ species, onExit, onRestart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CellEngine | null>(null);
  const [prog, setProg] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'play' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [hud, setHud] = useState<HudState | null>(null);
  const [help, setHelp] = useState(true);
  const [goalsOpen, setGoalsOpen] = useState(true);
  const [wonSeen, setWonSeen] = useState(false);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [tip, setTip] = useState<{ k: Kind; x: number } | null>(null);
  const [panel, setPanel] = useState<'' | 'species' | 'tech'>('');
  const [world, setWorld] = useState<WorldDef | null>(null);
  const worldSeed = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  useEffect(() => {
    let dead = false;
    let sim: Worker | null = null;
    (async () => {
      try {
        const world: WorldDef = makeWorld(worldSeed, species);
        sim = new Worker(new URL('../../lib/cell/sim.worker.ts', import.meta.url), { type: 'module' });
        const ready = new Promise<void>(res => { sim!.onmessage = (e: MessageEvent) => { if (e.data.t === 'ready') res(); }; });
        sim.postMessage({ t: 'init', seed: worldSeed, player: species });
        sim.postMessage({ t: 'cmd', cmd: { t: 'pause', on: true } });
        const at = await buildAtlas(atlasJobs(world.species), p => !dead && setProg(p));
        await ready;
        if (dead) return;
        setAtlas(at); setWorld(world);
        const eng = new CellEngine(canvasRef.current!, overlayRef.current!, miniRef.current!, world, at, sim, s => setHud(s));
        engineRef.current = eng;
        if (import.meta.env.DEV) (window as unknown as { __cell?: CellEngine }).__cell = eng;   // browser tests
        sim.onmessage = (e: MessageEvent) => { if (e.data.t === 'frame') eng.onFrame(e.data); };
        eng.start();
        setPhase('play');
      } catch (e) {
        console.error(e);
        setErr(e instanceof Error ? e.message : String(e)); setPhase('error');
      }
    })();
    return () => { dead = true; engineRef.current?.dispose(); engineRef.current = null; sim?.postMessage({ t: 'stop' }); setTimeout(() => sim?.terminate(), 100); };
  }, [species, worldSeed]);

  // the pool waits while the help card is open
  useEffect(() => {
    const e = engineRef.current;
    if (phase === 'play' && e) e.cmd({ t: 'pause', on: help });
  }, [help, phase]);

  // unit portraits from the atlas
  const thumbs = useMemo(() => {
    if (!atlas) return {} as Record<number, string>;
    const out: Record<number, string> = {};
    for (let k = 0; k < SPECIES_KINDS; k++) {
      const e = atlas.bySprite[k];
      if (!e) continue;
      const c = document.createElement('canvas'); c.width = e.w; c.height = e.h;
      const img = c.getContext('2d')!.createImageData(e.w, e.h), L = atlas.layers[e.layer];
      for (let y = 0; y < e.h; y++) img.data.set(L.subarray(((e.y + y) * LAYER + e.x) * 4, ((e.y + y) * LAYER + e.x + e.w) * 4), y * e.w * 4);
      c.getContext('2d')!.putImageData(img, 0, 0);
      out[k] = c.toDataURL();
    }
    return out;
  }, [atlas]);

  // portraits of other species (their mother cell) for the species panel
  const thumbCache = useRef(new Map<number, string>());
  const thumbOf = (set: number) => {
    if (!atlas) return undefined;
    const hit = thumbCache.current.get(set);
    if (hit) return hit;
    const e = atlas.bySprite[set * 16 + Kind.MOTHER];
    if (!e) return undefined;
    const c = document.createElement('canvas'); c.width = e.w; c.height = e.h;
    const img = c.getContext('2d')!.createImageData(e.w, e.h), L = atlas.layers[e.layer];
    for (let y = 0; y < e.h; y++) img.data.set(L.subarray(((e.y + y) * LAYER + e.x) * 4, ((e.y + y) * LAYER + e.x + e.w) * 4), y * e.w * 4);
    c.getContext('2d')!.putImageData(img, 0, 0);
    const url = c.toDataURL();
    thumbCache.current.set(set, url);
    return url;
  };

  const eng = engineRef.current;
  const st = hud?.stats;
  const sel = hud?.sel;
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const selTotal = sel ? sel.counts.reduce((a, b) => a + b, 0) : 0;
  const lost = st && !st.alive;
  const won = st?.evolved && !wonSeen;
  const evolvedPic = useMemo(() => {
    if (!st?.evolved) return null;
    const c = st.counts, fight = c[Kind.HUNTER] + c[Kind.SPITTER] * 0.8, calm = c[Kind.PHOTO] + c[Kind.WORKER] * 0.5;
    const diet = Math.max(0.05, Math.min(0.95, 0.2 + fight / Math.max(1, fight + calm) * 0.8));
    const size = Math.max(0.1, Math.min(0.95, 0.35 + c[Kind.ARMOR] / Math.max(1, c.reduce((a, b) => a + b, 0)) * 3));
    saveSpecies({ ...species, evolved: { genes: st.genes, diet, size, at: Date.now() } });
    const g = makeGenome(species.seed, { ...DEFAULT_PARAMS, diet, size, exotic: species.mode === 'alien' ? 0.6 : 0.25 }, species.mode);
    return { url: renderCreature(g, Stage.AQUA_LARVA, 'E').frames[0].toDataURL(), diet };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.evolved]);
  const colonies = hud?.colonies ?? [];
  const active = colonies.find(c => c.id === hud?.active) ?? colonies[0];
  const queue = active?.queue ?? [];
  const myTitan = TITANS[titanType(species)];
  const titanLim = st ? (st.techs.includes('tit3') ? 3 : st.techs.includes('tit2') ? 2 : st.techs.includes('tit1') ? 1 : 0) : 0;
  const titanUsed = st ? st.counts[Kind.TITAN] + colonies.reduce((a, c) => a + c.queue.filter(q => q.kind === Kind.TITAN).length, 0) : 0;

  return (
    <div className="fixed inset-0 bg-[#031016] text-white font-sans overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full cursor-crosshair" style={{ cursor: hud && (hud.placing >= 0 || hud.cloud) ? 'copy' : undefined }} />

      {phase !== 'play' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#031016] z-50">
          <div className="text-[10px] font-mono tracking-[0.5em] text-teal-300/70 mb-3">ERA CELULAR</div>
          <div className="italic font-serif text-3xl text-teal-100 mb-1">{species.genus} {species.species}</div>
          <div className="text-sm text-neutral-400 mb-6">{phase === 'error' ? 'Não foi possível iniciar' : 'Gerando a poça primordial e 64 espécies rivais…'}</div>
          {phase === 'error'
            ? <div className="text-red-300 text-sm max-w-md text-center">{err}<button onClick={onExit} className="block mx-auto mt-4 px-4 py-2 rounded-lg bg-white/10">Voltar</button></div>
            : <div className="w-72 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-teal-400 to-emerald-300 transition-[width]" style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
        </div>
      )}

      {/* top bar */}
      {phase === 'play' && st && (
        <div className="absolute top-0 inset-x-0 flex items-start justify-between gap-2 p-2 pointer-events-none z-20">
          <div className="pointer-events-auto flex gap-2 items-center">
            <button onClick={onExit} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-xs text-neutral-300 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
            <div className="hidden md:block px-3 py-1.5 rounded-xl bg-black/60 border border-white/10">
              <div className="italic font-serif text-sm text-teal-100 leading-tight">{species.genus} {species.species}</div>
              <div className="text-[9px] font-mono tracking-[0.25em] text-teal-300/70">ERA CELULAR</div>
            </div>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-3 px-3 py-1.5 rounded-xl bg-black/65 border border-white/10 text-sm font-mono">
            <Res icon={<Sprout className="w-4 h-4 text-yellow-300" />} v={<>{Math.floor(st.food)}<span className="text-neutral-500 text-[10px]">/{st.foodCap}</span> <span className="text-[10px] text-emerald-300">+{fmt(st.foodRate)}</span></>}
              title={`Nutrientes: as coletoras trazem para o biofilme. Estoque máximo ${st.foodCap} (cresce com colônias e nódulos). +${fmt(st.foodRate)}/s agora.`} warn={st.food >= st.foodCap - 1} />
            <span title={`Energia: fotossintéticas e células-mãe produzem +${fmt(st.energyIn)}/s; a manutenção das células gasta -${fmt(st.energyOut)}/s. Estoque máximo ${st.energyCap}. Sem energia as células começam a morrer.`}
              className={`flex items-center gap-1 ${st.energy < 5 && st.energyIn < st.energyOut ? 'text-red-300 animate-pulse' : 'text-neutral-100'}`}>
              <Zap className="w-4 h-4 text-cyan-300" />{Math.floor(st.energy)}<span className="text-neutral-500 text-[10px]">/{st.energyCap}</span>
              <span className="text-[10px] text-emerald-300">+{fmt(st.energyIn)}</span><span className="text-[10px] text-red-300">-{fmt(st.energyOut)}</span>
              <span className={`text-[10px] font-bold ${st.energyIn - st.energyOut >= 0 ? 'text-emerald-200' : 'text-red-300'}`}>({st.energyIn - st.energyOut >= 0 ? '+' : ''}{fmt(st.energyIn - st.energyOut)}/s)</span>
            </span>
            <Res icon={<Dna className="w-4 h-4 text-violet-300" />} v={st.dna.toFixed(1)} title="DNA: paga as pesquisas da árvore de evolução" />
            <Res icon={<Users className="w-4 h-4 text-emerald-300" />} v={`${st.pop}/${st.cap}`} title="População / limite: +8 por colônia, +6 por nódulo" warn={st.pop >= st.cap} />
            <Res icon={<CircleDot className="w-4 h-4 text-amber-200" />} v={st.ncol} title="Colônias (células-mãe fixadas)" />
            <Res icon={<Hexagon className="w-4 h-4 text-violet-300" />} v={st.nodes} title="Nódulos de biofilme" />
            <span className="text-neutral-400 text-xs w-10 text-right" title="Tempo de jogo">{mm(st.time)}</span>
            <div className="flex gap-0.5 ml-1">
              <button onClick={() => eng?.togglePause()} title="Pausar (Espaço)" className={`p-1 rounded ${hud!.paused ? 'bg-amber-400 text-black' : 'hover:bg-white/10'}`}>{hud!.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
              {[1, 2, 4].map(k => <button key={k} onClick={() => eng?.setSpeed(k)} title={`Velocidade ${k}x`} className={`px-1.5 rounded text-[11px] ${hud!.speed === k ? 'bg-teal-400 text-black' : 'hover:bg-white/10 text-neutral-300'}`}>{k === 4 ? <FastForward className="w-3.5 h-3.5" /> : `${k}x`}</button>)}
            </div>
          </div>
          <div className="pointer-events-auto flex gap-2 items-center">
            <span className="hidden sm:inline text-[10px] font-mono text-emerald-300/80 bg-black/50 rounded px-2 py-1" title="FPS do motor (1000 / ms de CPU por quadro)">{hud!.fps} FPS</span>
            <button onClick={() => setPanel(o => (o === 'tech' ? '' : 'tech'))} title="Árvore de evolução (pesquisas com DNA)" className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold ${panel === 'tech' ? 'bg-teal-400 text-black border-teal-300' : 'bg-black/60 border-white/10 hover:bg-white/10'}`}>
              <FlaskConical className="w-4 h-4" /> Evolução {st.research && <span className="font-mono font-normal text-[10px] opacity-80">{Math.round(st.research.p * 100)}%</span>}
            </button>
            <button onClick={() => setPanel(o => (o === 'species' ? '' : 'species'))} title="Espécies: genes, diplomacia e evolução" className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold ${panel === 'species' ? 'bg-teal-400 text-black border-teal-300' : st.canEvolve ? 'bg-violet-500/30 border-violet-300 text-violet-50 animate-pulse' : 'bg-black/60 border-white/10 hover:bg-white/10'}`}>
              <Dna className="w-4 h-4" /> Espécies <span className="font-mono font-normal text-[10px] opacity-80">{st.nations.length} · {st.genes.length + (st.mito ? 1 : 0)} genes</span>
            </button>
            <button onClick={() => eng?.selectMother()} title="Célula-mãe (H)" className="p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10"><Home className="w-4 h-4" /></button>
            <button onClick={() => setHelp(true)} title="Como jogar" className="p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10"><HelpCircle className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* messages */}
      {phase === 'play' && st && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 max-w-[540px] w-[calc(100vw-560px)] min-w-[280px]">
          {st.msg && <div className="px-4 py-2 rounded-xl bg-black/75 border border-teal-300/30 text-sm text-teal-50 pointer-events-none text-center">{st.msg}</div>}
          {st.events.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 pointer-events-none">
              {st.events.map(e => (
                <span key={e.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-black/70" style={{ color: EVENT_COL[e.kind], borderColor: `${EVENT_COL[e.kind]}66` }}>
                  {e.name}{e.until < 1e8 ? ` · ${Math.max(0, Math.ceil(e.until - st.time))} s` : ''}
                </span>
              ))}
            </div>
          )}
          {world && st.offers.map(o => {
            const sp = world.species[o.nation];
            return (
              <div key={o.id} className="pointer-events-auto w-full rounded-xl bg-[#0a1a20]/95 border border-amber-300/40 shadow-xl px-3 py-2 text-xs flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: eng?.paletteCss[o.nation] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-amber-50"><i className="font-serif">{sp.genus} {sp.species}</i> {o.kind === 'peace' ? 'propõe paz.' : o.kind === 'symbiosis' ? 'propõe simbiose (troca de recursos e biofilme compartilhado).' : <>exige <b className="text-yellow-300">{o.amount} nutrientes</b> de tributo ou ataca.</>}</div>
                  <div className="text-[10px] text-neutral-500">Responda em {Math.max(0, Math.ceil(o.until - st.time))} s (sem resposta = recusa)</div>
                </div>
                <button onClick={() => eng?.cmd({ t: 'answer', id: o.id, yes: true })} className="px-2 py-1 rounded-md bg-emerald-400/90 text-black font-bold hover:bg-emerald-300">{o.kind === 'tribute' ? 'Pagar' : 'Aceitar'}</button>
                <button onClick={() => eng?.cmd({ t: 'answer', id: o.id, yes: false })} className="px-2 py-1 rounded-md bg-white/10 font-bold hover:bg-red-500/30">Recusar</button>
              </div>
            );
          })}
        </div>
      )}

      {/* objectives */}
      {phase === 'play' && st && !panel && (
        <div className="absolute top-16 left-2 z-20 w-64 max-w-[calc(100vw-16px)] rounded-xl bg-black/60 border border-white/10 text-xs">
          <button onClick={() => setGoalsOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 font-bold text-teal-200"><span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Objetivos</span><span className="text-neutral-500">{Object.values(hud!.goals).filter(Boolean).length}/{GOALS.length}</span></button>
          {goalsOpen && <div className="px-3 pb-2 space-y-1">
            {GOALS.map(([k, label]) => (
              <div key={k} className={`flex gap-2 items-start ${hud!.goals[k] ? 'text-emerald-300/80 line-through' : 'text-neutral-200'}`}>
                {hud!.goals[k] ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <Circle className="w-3.5 h-3.5 shrink-0 mt-px text-neutral-500" />}{label}
              </div>
            ))}
            {st.time < GRACE && <div className="pt-1 text-[10px] text-amber-300/80">As espécies rivais atacam você em {Math.ceil(GRACE - st.time)} s.</div>}
          </div>}
        </div>
      )}

      {/* the colonies (top right): each colony is a group of cells - its counts by kind, click to select */}
      {phase === 'play' && st && hud && (
        <div className="absolute top-14 right-2 z-20 w-[246px] max-h-[calc(100vh-330px)] overflow-y-auto no-scrollbar rounded-xl bg-black/65 border border-white/10 text-xs">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <span>Colônias</span><span className="font-mono normal-case tracking-normal">{st.counts.reduce((a, b) => a + b, 0)} células</span>
          </div>
          <div className="px-1.5 pb-2 space-y-1.5">
            {colonies.map(c => (
              <div key={c.id} className={`rounded-lg border ${sel?.colony === c.id ? 'border-white/40 bg-white/10' : active?.id === c.id ? 'border-white/15 bg-white/[0.05]' : 'border-white/5 bg-white/[0.03]'}`}>
                <button onClick={e => eng?.selectColony(c.id, e.shiftKey, e.detail >= 2)} title="Clique: selecionar a colônia · duplo clique: ir até ela"
                  className="w-full flex items-center gap-1.5 px-2 pt-1.5 text-left">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[11px] font-bold text-neutral-100">{c.name}</span>
                    <span className="block text-[9px] text-neutral-500">{c.n} células · {STANCES[c.stance] ?? ''}</span>
                  </span>
                  {c.idx <= 9 && <span className="font-mono text-[10px] px-1 rounded bg-white/10 text-neutral-300" title={`Tecla ${colonies.indexOf(c) + 1}`}>{colonies.indexOf(c) + 1}</span>}
                </button>
                <div className="flex flex-wrap gap-1 px-1.5 pb-1.5 pt-1">
                  {ORDER.filter(k => c.counts[k]).map(k => (
                    <button key={k} onClick={e => eng?.selectColony(c.id, e.shiftKey, false, k)} title={`Selecionar: ${KINDS[k].name} da ${c.name}`}
                      className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-black/30 border border-white/10 hover:bg-teal-400/15 hover:border-teal-300/40">
                      {thumbs[k] && <img src={thumbs[k]} className="h-4 max-w-5" style={{ imageRendering: 'pixelated' }} />}
                      <span className="font-mono text-[10px] text-teal-100">{c.counts[k]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {st.seeds > 0 && <div className="px-2 py-1 rounded-lg bg-amber-400/10 border border-amber-300/20 text-[10px] text-amber-100">{st.seeds} célula-mãe solta procurando espaço para uma nova colônia</div>}
          </div>
        </div>
      )}

      {phase === 'play' && st && panel === 'species' && world && <SpeciesPanel st={st} species={world.species} eng={eng} thumb={thumbOf} onClose={() => setPanel('')} />}
      {phase === 'play' && st && panel === 'tech' && <TechPanel st={st} eng={eng} onClose={() => setPanel('')} />}

      {/* minimap */}
      <div className={`absolute left-2 bottom-2 z-20 ${phase === 'play' ? '' : 'invisible'}`}>
        <canvas ref={miniRef} className="w-[160px] h-[160px] sm:w-[192px] sm:h-[192px] rounded-lg border border-white/20 bg-black cursor-pointer" style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* division bar of the active colony */}
      {phase === 'play' && st && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 max-w-[calc(100vw-470px)] min-w-[300px]">
          {tip && (
            <div className="pointer-events-none absolute bottom-full mb-2 w-72 rounded-xl bg-[#08161c]/95 border border-teal-300/30 shadow-2xl p-3 text-xs" style={{ left: Math.max(0, tip.x - 144) }}>
              <div className="flex items-center gap-2">
                {thumbs[tip.k] && <img src={thumbs[tip.k]} className="h-8" style={{ imageRendering: 'pixelated' }} />}
                <div>
                  <div className="font-black text-sm text-white">{KINDS[tip.k].name}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-teal-300/80">{ROLE[tip.k]}</div>
                </div>
              </div>
              <p className="mt-2 text-neutral-200 leading-snug">{KINDS[tip.k].blurb}</p>
              {tip.k === Kind.TITAN && <p className="mt-1.5 text-violet-100 leading-snug bg-violet-400/10 border border-violet-300/25 rounded-md px-2 py-1">O titã da sua espécie é um <b>{myTitan.name}</b> — poder: <b>{myTitan.power}</b>. {myTitan.desc} Titãs vivos: {titanUsed}/{titanLim} (Gigantismo aumenta o limite). Sempre visível para todos.</p>}
              {TIP_NOTE[tip.k] && <p className="mt-1.5 text-amber-100/90 leading-snug bg-amber-400/10 border border-amber-300/20 rounded-md px-2 py-1">{TIP_NOTE[tip.k]}</p>}
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono">
                <span className="text-yellow-300">🟡 {KINDS[tip.k].food}</span><span className="text-cyan-300">⚡ {KINDS[tip.k].energy}</span><span className="text-neutral-300">⏱ {KINDS[tip.k].time}s</span>
                <span className="text-neutral-400">vida {KINDS[tip.k].hp}</span><span className="text-neutral-400">ataque {KINDS[tip.k].dmg || '—'}</span><span className="text-neutral-400">pop {KINDS[tip.k].pop}</span>
                <span className="col-span-3 text-cyan-200/80">manutenção {KINDS[tip.k].upkeep ? `-${KINDS[tip.k].upkeep} ⚡/s` : 'nenhuma'}</span>
              </div>
              {LOCKED[tip.k] && !st.techs.includes(LOCKED[tip.k]!) && <p className="mt-1.5 text-red-200 bg-red-500/10 border border-red-400/20 rounded-md px-2 py-1">Bloqueada: pesquise <b>{TECHS.find(t => t.id === LOCKED[tip.k])!.name}</b> na árvore de evolução.</p>}
            </div>
          )}
          {queue.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/65 border border-white/10">
              {st.pop + KINDS[queue[0].kind].pop > st.cap && <span className="text-[10px] text-amber-300 mr-1 max-w-[170px] leading-tight">Sem espaço: transforme uma coletora em nódulo (N) ou funde outra colônia</span>}
              {queue.map((q, i) => (
                <button key={i} onClick={() => eng?.cancel(i)} title={`${KINDS[q.kind].name} — clique para cancelar`} className="relative w-9 h-9 rounded-md bg-white/5 border border-white/10 hover:border-red-400/60 overflow-hidden">
                  {thumbs[q.kind] && <img src={thumbs[q.kind]} className="absolute inset-0 m-auto max-w-[80%] max-h-[80%]" style={{ imageRendering: 'pixelated' }} />}
                  {i === 0 && <div className="absolute bottom-0 left-0 h-1 bg-teal-300" style={{ width: `${q.p * 100}%` }} />}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex gap-1 p-1.5 rounded-xl bg-black/70 border border-white/10" onMouseLeave={() => setTip(null)}>
            <div className="flex flex-col justify-center px-1.5 w-[124px]">
              <span className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 mb-0.5">Colônia</span>
              <div className="relative">
                <select value={active?.id ?? ''} onChange={e => eng?.setColony(+e.target.value)} title="Qual colônia divide (clicar numa célula-mãe também escolhe)"
                  className="w-full appearance-none bg-white/5 border border-white/15 rounded-md pl-5 pr-5 py-1 text-[11px] font-bold text-neutral-100 focus:outline-none focus:border-teal-300/60">
                  {colonies.map(c => <option key={c.id} value={c.id} className="bg-neutral-900">{c.name}</option>)}
                </select>
                {active && <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: active.color }} />}
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
              </div>
            </div>
            {[...BAR, ...TRAINABLE.filter(k => !BAR.includes(k))].map(k => {
              const K = KINDS[k], placing = hud?.placing === k, place = PLACE_KINDS.includes(k);
              const lock = LOCKED[k] && !st.techs.includes(LOCKED[k]!) ? TECHS.find(t => t.id === LOCKED[k])! : null;
              const disc = st.techs.includes('com3') && k !== Kind.NODE ? 0.85 : 1, fc = Math.round(K.food * disc), ec = Math.round(K.energy * disc);
              const ok = !lock && st.food >= fc && st.energy >= ec && st.alive && !!active && (k !== Kind.NODE || st.counts[Kind.WORKER] > 0) && (k !== Kind.TITAN || titanUsed < titanLim);
              return (
                <button key={k} onClick={() => eng?.train(k)} disabled={!ok}
                  onMouseEnter={e => { const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); setTip({ k, x: b.left - r.left + b.width / 2 }); }}
                  className={`group relative w-[56px] sm:w-[62px] rounded-lg border px-1 pt-1 pb-0.5 flex flex-col items-center ${placing ? 'border-violet-300 bg-violet-400/30' : ok ? (place ? 'border-violet-300/25 bg-white/5 hover:bg-violet-400/20 hover:border-violet-300/60' : 'border-white/10 bg-white/5 hover:bg-teal-400/15 hover:border-teal-300/50') : 'border-white/5 bg-white/[0.02] opacity-50'} ${k === Kind.MOTHER ? 'ml-1' : ''}`}>
                  <div className="h-8 w-full flex items-center justify-center">{thumbs[k] && <img src={thumbs[k]} className="max-h-8 max-w-full" style={{ imageRendering: 'pixelated' }} />}</div>
                  {lock && <Lock className="absolute top-1 right-1 w-3 h-3 text-neutral-300" />}
                  <div className="text-[10px] font-bold truncate w-full text-center">{k === Kind.MOTHER ? 'Colônia' : k === Kind.NODE ? 'Nódulo' : k === Kind.TITAN ? `Titã ${lock ? '' : `${titanUsed}/${titanLim}`}` : K.name}</div>
                  {lock ? <div className="text-[8.5px] text-red-200/80 truncate w-full text-center">{lock.name}</div>
                    : <div className="text-[9px] font-mono text-neutral-400"><span className="text-yellow-300">{fc}</span>{ec ? <> · <span className="text-cyan-300">{ec}</span></> : null}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* selection */}
      {phase === 'play' && sel && (
        <div className="absolute right-2 bottom-2 z-20 w-[250px] rounded-xl bg-black/70 border border-white/10 p-2 text-xs">
          {selTotal === 0 ? (
            <div className="text-neutral-400 leading-relaxed">
              {hud?.hover ? <div className="text-neutral-100 font-bold mb-1">{hud.hover}</div> : null}
              Arraste para selecionar células. Botão direito: mover / atacar / coletar. No painel de colônias, clique numa colônia ou num tipo de célula dela para selecionar.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 mb-2">
                {sel.counts.map((n, k) => n ? (
                  <button key={k} onClick={() => eng?.filterKind(k)} title={`Só ${KINDS[k].name}`} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 hover:bg-white/10">
                    {thumbs[k] && <img src={thumbs[k]} className="h-5" style={{ imageRendering: 'pixelated' }} />}<span className="font-mono">{n}</span>
                  </button>
                ) : null)}
              </div>
              {sel.colony >= 0 && <div className="mb-1 text-[10px] text-neutral-400">Colônia inteira: <b style={{ color: colonies.find(c => c.id === sel.colony)?.color }}>{colonies.find(c => c.id === sel.colony)?.name}</b> (o comportamento vale para as células que ela gerar)</div>}
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">Comportamento (delegação)</div>
              <div className="grid grid-cols-3 gap-1 mb-1">
                {STANCES.map((s, i) => (
                  <button key={i} onClick={() => eng?.setStance(i)} title={STANCE_HINT[i]} className={`px-1 py-1 rounded-md text-[10px] font-bold ${sel.stance === i ? 'bg-teal-400 text-black' : 'bg-white/5 hover:bg-white/10 text-neutral-200'}`}>{s}</button>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500 leading-snug min-h-[26px]">{STANCE_HINT[sel.stance >= 0 && sel.stance < 5 ? sel.stance : 0]}</p>
              {(st?.techs.includes('mot3') || (st?.techs.includes('pre3') && sel.counts[Kind.SPITTER] > 0)) && (
                <div className="mt-1.5 flex gap-1">
                  {st?.techs.includes('mot3') && <button onClick={() => eng?.cyst()} title="Encistamento (C): as células param, ficam blindadas (+3 de armadura) e não gastam energia. De novo para despertar." className="flex-1 flex items-center justify-center gap-1 px-1 py-1 rounded-md bg-amber-500/15 border border-amber-300/30 text-amber-100 text-[10px] font-bold hover:bg-amber-500/25"><Shield className="w-3 h-3" /> Cisto</button>}
                  {st?.techs.includes('pre3') && sel.counts[Kind.SPITTER] > 0 && <button onClick={() => eng?.aimCloud()} title="Nuvem de toxina (X): clique no alvo; a secretora selecionada mais próxima (até 420) lança uma nuvem que envenena por 5 s. Recarga 20 s." className={`flex-1 flex items-center justify-center gap-1 px-1 py-1 rounded-md border text-[10px] font-bold ${hud?.cloud ? 'bg-lime-400 text-black border-lime-300' : 'bg-lime-500/15 border-lime-300/30 text-lime-100 hover:bg-lime-500/25'}`}><Wind className="w-3 h-3" /> Nuvem de toxina</button>}
                </div>
              )}
              {sel.seeds > 0 && <p className="mt-1 text-[10px] text-amber-200 leading-snug bg-amber-400/10 rounded-md px-2 py-1">Célula-mãe solta: clique com o botão direito num espaço livre (a {COLONY_GAP}+ de outras células-mãe) para fundar a colônia.</p>}
            </>
          )}
        </div>
      )}

      {/* help */}
      {phase === 'play' && help && (
        <div className="absolute inset-0 z-40 bg-black/55 flex items-center justify-center p-4" onClick={() => setHelp(false)}>
          <div className="max-w-lg w-full rounded-2xl bg-[#07161c]/95 border border-teal-300/25 p-5 text-sm text-neutral-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-[10px] font-mono tracking-[0.4em] text-teal-300/80">ERA CELULAR</div>
                <div className="text-xl font-black">A poça primordial</div>
              </div>
              <button onClick={() => setHelp(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-neutral-300 leading-relaxed mb-3">Dezenas de espécies disputam esta poça, cada uma uma nação. Você começa com <b>uma célula-mãe</b>. Cresça, funde colônias e domine a poça.</p>
            <ul className="space-y-1.5 text-[13px] leading-snug">
              <li>🟡 <b>Nutrientes</b>: as coletoras colhem e levam ao biofilme. ⚡ <b>Energia</b>: fotossintéticas (o dobro sob os feixes de luz).</li>
              <li>🧫 <b>Dividir</b>: os botões embaixo criam células a partir da célula-mãe. O botão <b>Colônia</b> cria uma nova célula-mãe para fundar outra colônia num espaço livre.</li>
              <li>🟣 <b>Biofilme</b> é o seu território: dentro dele as células se curam e comem; fora, morrem de fome. O botão <b>Nódulo</b> manda uma coletora virar nódulo: expande o território e dá +6 de população.</li>
              <li>🌫️ <b>Névoa</b>: você só vê as células de outras espécies perto das suas. Uma espécie (nome, cor e território) só aparece depois de avistada.</li>
              <li>⚡ <b>Manutenção</b>: cada célula gasta energia por segundo (veja +entrada −gasto no topo). Sem energia, as células morrem. <b>Fotossintéticas</b> e <b>Sentinelas</b> são estruturas: escolha no mapa onde se fixam.</li>
              <li>🔬 <b>Evolução</b>: gaste DNA (de células engolidas, mortas ou espécies descobertas) em pesquisas: novas células, habilidades (Cisto, Nuvem de toxina) e melhorias.</li>
              <li>🧬 <b>Espécies</b> (botão no topo): roube genes engolindo células de outras espécies, faça paz e simbiose, e chegue à endossimbiose para evoluir para <b>multicelular</b>.</li>
              <li>🎯 <b>Colônias</b>: cada colônia é um grupo com cor e nome, com as células que ela gerou. Selecione uma colônia (painel à direita ou 1..9) e dê ordens e comportamentos (Defender, Caçar…) a ela inteira. Coletoras nunca lutam: fogem.</li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-400 font-mono">
              <span>Arrastar: selecionar</span><span>Botão direito: ordem</span>
              <span>Duplo clique: todas do tipo</span><span>WASD / setas: câmera</span>
              <span>1..9: selecionar colônia</span><span>N: nódulo</span>
              <span>F / T: fotossintética / sentinela</span><span>C / X: cisto / nuvem</span>
              <span>Espaço: pausa</span><span>H: célula-mãe</span>
            </div>
            <button onClick={() => setHelp(false)} className="mt-4 w-full py-2.5 rounded-xl font-bold text-black bg-gradient-to-r from-teal-300 to-emerald-300">Começar</button>
          </div>
        </div>
      )}

      {/* end screens */}
      {(lost || won) && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className={`max-w-md w-full rounded-2xl p-6 text-center border ${won ? 'bg-[#0b1a12]/95 border-emerald-300/40' : 'bg-[#1a0b0b]/95 border-red-300/30'}`}>
            {won ? <Trophy className="w-10 h-10 mx-auto text-amber-300 mb-2" /> : <Skull className="w-10 h-10 mx-auto text-red-300 mb-2" />}
            <div className="text-2xl font-black mb-1">{won ? 'Multicelular!' : 'Extinção'}</div>
            {won && evolvedPic && (
              <div className="my-3 flex flex-col items-center">
                <div className="w-full h-36 rounded-xl bg-[#07181e] border border-white/10 flex items-center justify-center"><img src={evolvedPic.url} className="max-h-32" style={{ imageRendering: 'pixelated', height: '8rem', objectFit: 'contain' }} /></div>
                <div className="mt-1 text-[11px] text-neutral-400">A larva aquática de {species.genus} · {evolvedPic.diet > 0.6 ? 'predadora' : evolvedPic.diet < 0.36 ? 'filtradora' : 'onívora'} · {st!.genes.length} genes herdados</div>
              </div>
            )}
            <p className="text-sm text-neutral-300 mb-4">{won
              ? `As células de ${species.genus} ${species.species} se uniram num só corpo. A composição da sua colônia decidiu o corpo da espécie (mais fagócitas: predadora; mais fotossintéticas: tranquila). A era aquática chega em breve — sua espécie está salva para ela.`
              : 'A última célula-mãe da sua espécie morreu. Sem ela, o biofilme desaparece e as células morrem de fome.'}</p>
            <div className="flex gap-2 justify-center">
              {won && <button onClick={() => { setWonSeen(true); eng?.cmd({ t: 'pause', on: false }); }} className="px-4 py-2 rounded-xl font-bold bg-emerald-400 text-black">Continuar na poça</button>}
              {!won && <button onClick={onRestart} className="px-4 py-2 rounded-xl font-bold bg-teal-300 text-black">Tentar de novo</button>}
              <button onClick={onExit} className="px-4 py-2 rounded-xl font-bold bg-white/10 hover:bg-white/15">Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EVENT_COL: Record<string, string> = { bloom: '#fde047', toxic: '#a3e635', current: '#7dd3fc', heat: '#fb923c', plague: '#e879f9' };

function Res({ icon, v, title, warn }: { icon: React.ReactNode; v: React.ReactNode; title: string; warn?: boolean }) {
  return <span title={title} className={`flex items-center gap-1 ${warn ? 'text-amber-300' : 'text-neutral-100'}`}>{icon}{v}</span>;
}
