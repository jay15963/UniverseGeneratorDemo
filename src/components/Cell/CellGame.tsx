// The cellular era (play mode): a colony RTS in a microscopic pool. Loading (world, sprite atlas on a worker pool,
// simulation worker), then the engine (engine.ts) draws the pool and the HUD below drives it: resources, the nation's
// cells and groups (top right), the division bar of the active colony, selection and stances (delegation), objectives,
// minimap.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, FastForward, Home, Target, HelpCircle, X, CheckCircle2, Circle, Sprout, Zap, Users, Hexagon, Trophy, Skull, CircleDot, Plus, Trash2, Layers } from 'lucide-react';
import { CellSpecies, KINDS, Kind, TRAINABLE, ROLE } from '../../lib/cell/look';
import { makeWorld, WorldDef } from '../../lib/cell/world';
import { buildAtlas, atlasJobs, Atlas, LAYER } from '../../lib/cell/atlas';
import { STANCES, GRACE, COLONY_GAP } from '../../lib/cell/sim';
import { CellEngine, HudState, GROUP_COLORS } from './engine';

interface Props { species: CellSpecies; onExit: () => void; onRestart: () => void }

const GOALS: [string, string][] = [
  ['food', 'Acumule 200 nutrientes'],
  ['divide', 'Divida a célula-mãe para criar uma célula'],
  ['photo', 'Leve uma fotossintética a um feixe de luz dentro do biofilme'],
  ['node', 'Transforme uma coletora em nódulo de biofilme (N)'],
  ['colony', 'Funde uma nova colônia (divida uma célula-mãe e leve-a a um espaço livre)'],
  ['rival', 'Destrua uma colônia rival (a célula-mãe dela)'],
  ['big', 'Chegue a 80 células'],
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
  [Kind.WORKER]: 'Só a coletora cria biofilme: selecione coletoras e aperte N para transformá-las em nódulo na borda do território. Cada nódulo expande o território e dá +6 de população.',
  [Kind.PHOTO]: 'Fica parada no biofilme gerando energia. Sob um feixe de luz, gera o dobro.',
  [Kind.MOTHER]: `Nasce solta: selecione e clique com o botão direito num espaço livre a ${COLONY_GAP}+ de outras células-mãe (fora de biofilme estrangeiro). Ao parar, ela se fixa e vira uma nova colônia (+8 de população).`,
  [Kind.SCOUT]: 'Rápida e com reserva maior: ótima para achar nutrientes, luz e espaços livres.',
};
const ORDER: Kind[] = [Kind.MOTHER, Kind.NODE, Kind.WORKER, Kind.PHOTO, Kind.SCOUT, Kind.HUNTER, Kind.SPITTER, Kind.ARMOR];

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
  const [form, setForm] = useState<{ name: string; color: string } | null>(null);
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
        setAtlas(at);
        const eng = new CellEngine(canvasRef.current!, overlayRef.current!, miniRef.current!, world, at, sim, s => setHud(s));
        engineRef.current = eng;
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
    for (let k = 0; k < 8; k++) {
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

  const eng = engineRef.current;
  const st = hud?.stats;
  const sel = hud?.sel;
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const selTotal = sel ? sel.counts.reduce((a, b) => a + b, 0) : 0;
  const lost = st && !st.alive;
  const won = st?.won && !wonSeen;
  const mothers = st?.mothers ?? [];
  const active = mothers.find(m => m.id === hud?.active);
  const activeIdx = active ? mothers.filter(m => m.rooted).indexOf(active) + 1 : 0;
  const queue = active?.queue ?? [];
  const openForm = () => { const n = (hud?.groups.length ?? 0) + 1; setForm({ name: `Grupo ${n}`, color: GROUP_COLORS[(n - 1) % GROUP_COLORS.length] }); };

  return (
    <div className="fixed inset-0 bg-[#031016] text-white font-sans overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full cursor-crosshair" style={{ cursor: hud?.placing ? 'copy' : undefined }} />

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
            <Res icon={<Sprout className="w-4 h-4 text-yellow-300" />} v={Math.floor(st.food)} title="Nutrientes (as coletoras trazem para o biofilme)" />
            <Res icon={<Zap className="w-4 h-4 text-cyan-300" />} v={Math.floor(st.energy)} title="Energia (fotossintéticas e as células-mãe produzem)" />
            <Res icon={<Users className="w-4 h-4 text-emerald-300" />} v={`${st.pop}/${st.cap}`} title="População / limite: +8 por colônia, +6 por nódulo" warn={st.pop >= st.cap} />
            <Res icon={<CircleDot className="w-4 h-4 text-amber-200" />} v={st.colonies} title="Colônias (células-mãe fixadas)" />
            <Res icon={<Hexagon className="w-4 h-4 text-violet-300" />} v={st.nodes} title="Nódulos de biofilme" />
            <span className="text-neutral-400 text-xs w-10 text-right" title="Tempo de jogo">{mm(st.time)}</span>
            <div className="flex gap-0.5 ml-1">
              <button onClick={() => eng?.togglePause()} title="Pausar (Espaço)" className={`p-1 rounded ${hud!.paused ? 'bg-amber-400 text-black' : 'hover:bg-white/10'}`}>{hud!.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
              {[1, 2, 4].map(k => <button key={k} onClick={() => eng?.setSpeed(k)} title={`Velocidade ${k}x`} className={`px-1.5 rounded text-[11px] ${hud!.speed === k ? 'bg-teal-400 text-black' : 'hover:bg-white/10 text-neutral-300'}`}>{k === 4 ? <FastForward className="w-3.5 h-3.5" /> : `${k}x`}</button>)}
            </div>
          </div>
          <div className="pointer-events-auto flex gap-2 items-center">
            <span className="hidden sm:inline text-[10px] font-mono text-emerald-300/80 bg-black/50 rounded px-2 py-1" title="FPS do motor (1000 / ms de CPU por quadro)">{hud!.fps} FPS</span>
            <button onClick={() => eng?.selectMother()} title="Célula-mãe (H)" className="p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10"><Home className="w-4 h-4" /></button>
            <button onClick={() => setHelp(true)} title="Como jogar" className="p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10"><HelpCircle className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* messages */}
      {st?.msg && <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-black/75 border border-teal-300/30 text-sm text-teal-50 pointer-events-none max-w-[520px] text-center">{st.msg}</div>}

      {/* objectives */}
      {phase === 'play' && st && (
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

      {/* the nation: cells by kind + groups (top right) */}
      {phase === 'play' && st && hud && (
        <div className="absolute top-14 right-2 z-20 w-[238px] max-h-[calc(100vh-330px)] overflow-y-auto no-scrollbar rounded-xl bg-black/65 border border-white/10 text-xs">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <span>Células</span><span className="font-mono normal-case tracking-normal">{st.counts.reduce((a, b) => a + b, 0)}</span>
          </div>
          <div className="px-1.5 pb-1.5 grid grid-cols-2 gap-1">
            {ORDER.map(k => (
              <button key={k} onClick={e => eng?.selectAllKind(k, e.shiftKey)} disabled={!st.counts[k]}
                title={`Selecionar todas: ${KINDS[k].name}`}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg border text-left ${st.counts[k] ? 'border-white/10 bg-white/[0.04] hover:bg-teal-400/15 hover:border-teal-300/40' : 'border-transparent opacity-35'}`}>
                <span className="w-6 h-5 flex items-center justify-center shrink-0">{thumbs[k] && <img src={thumbs[k]} className="max-h-5 max-w-6" style={{ imageRendering: 'pixelated' }} />}</span>
                <span className="flex-1 min-w-0 truncate text-[11px] text-neutral-200">{KINDS[k].name.replace(' de biofilme', '')}</span>
                <span className="font-mono text-[11px] text-teal-200">{st.counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="px-3 pt-1 pb-1 flex items-center justify-between border-t border-white/5 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Grupos</span>
            {selTotal > 0 && !form && <button onClick={openForm} className="normal-case tracking-normal text-[11px] font-bold text-teal-300 hover:text-teal-100">+ Novo (G)</button>}
          </div>
          {form && (
            <div className="mx-2 mb-2 p-2 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
              <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value.slice(0, 24) })}
                onKeyDown={e => { if (e.key === 'Enter') { eng?.createGroup(form.name, form.color); setForm(null); } if (e.key === 'Escape') setForm(null); }}
                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-teal-300/60" />
              <div className="flex gap-1">
                {GROUP_COLORS.map(c => <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-5 h-5 rounded-full border-2 ${form.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />)}
              </div>
              <div className="flex gap-1">
                <button onClick={() => { eng?.createGroup(form.name, form.color); setForm(null); }} className="flex-1 py-1 rounded-md font-bold text-black bg-teal-300 hover:bg-teal-200">Criar com {selTotal} células</button>
                <button onClick={() => setForm(null)} className="px-2 rounded-md bg-white/10 hover:bg-white/15"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
          <div className="px-1.5 pb-2 space-y-1">
            {hud.groups.length === 0 && !form && <p className="px-1.5 text-[10px] text-neutral-500 leading-snug">Selecione células e crie um grupo (G ou Ctrl+1..9) para dar ordens e comportamentos a todas de uma vez.</p>}
            {hud.groups.map(g => (
              <div key={g.id} className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-lg border ${sel?.group === g.id ? 'border-white/40 bg-white/10' : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
                <button onClick={e => eng?.selectGroup(g.id, e.shiftKey, e.detail >= 2)} title="Clique: selecionar · duplo clique: ir até o grupo" className="flex-1 min-w-0 flex items-center gap-1.5 text-left">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-neutral-100">{g.name}</span>
                    <span className="block text-[9px] text-neutral-500">{g.n} células · {STANCES[g.stance] ?? ''}</span>
                  </span>
                  {g.key > 0 && <span className="font-mono text-[10px] px-1 rounded bg-white/10 text-neutral-300">{g.key}</span>}
                </button>
                {selTotal > 0 && sel?.group !== g.id && <button onClick={() => eng?.addToGroup(g.id)} title="Adicionar a seleção a este grupo" className="p-0.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>}
                <button onClick={() => eng?.deleteGroup(g.id)} title="Desfazer o grupo" className="p-0.5 rounded hover:bg-white/10 text-neutral-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {TIP_NOTE[tip.k] && <p className="mt-1.5 text-amber-100/90 leading-snug bg-amber-400/10 border border-amber-300/20 rounded-md px-2 py-1">{TIP_NOTE[tip.k]}</p>}
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono">
                <span className="text-yellow-300">🟡 {KINDS[tip.k].food}</span><span className="text-cyan-300">⚡ {KINDS[tip.k].energy}</span><span className="text-neutral-300">⏱ {KINDS[tip.k].time}s</span>
                <span className="text-neutral-400">vida {KINDS[tip.k].hp}</span><span className="text-neutral-400">ataque {KINDS[tip.k].dmg || '—'}</span><span className="text-neutral-400">pop {KINDS[tip.k].pop}</span>
              </div>
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
            <div className="hidden lg:flex flex-col justify-center px-2 text-[10px] leading-tight text-neutral-400 w-20">Dividir<br /><b className="text-teal-200">{activeIdx ? `Colônia ${activeIdx}` : 'célula-mãe'}</b>{mothers.filter(m => m.rooted).length > 1 && <span className="text-[9px] text-neutral-500 mt-0.5">selecione outra para trocar</span>}</div>
            {TRAINABLE.map(k => {
              const K = KINDS[k], ok = st.food >= K.food && st.energy >= K.energy && st.alive && !!active?.rooted;
              return (
                <button key={k} onClick={() => eng?.train(k)} disabled={!ok}
                  onMouseEnter={e => { const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); setTip({ k, x: b.left - r.left + b.width / 2 }); }}
                  className={`group relative w-[58px] sm:w-[66px] rounded-lg border px-1 pt-1 pb-0.5 flex flex-col items-center ${ok ? 'border-white/10 bg-white/5 hover:bg-teal-400/15 hover:border-teal-300/50' : 'border-white/5 bg-white/[0.02] opacity-50'} ${k === Kind.MOTHER ? 'ml-1' : ''}`}>
                  <div className="h-8 w-full flex items-center justify-center">{thumbs[k] && <img src={thumbs[k]} className="max-h-8 max-w-full" style={{ imageRendering: 'pixelated' }} />}</div>
                  <div className="text-[10px] font-bold truncate w-full text-center">{k === Kind.MOTHER ? 'Colônia' : K.name}</div>
                  <div className="text-[9px] font-mono text-neutral-400"><span className="text-yellow-300">{K.food}</span>{K.energy ? <> · <span className="text-cyan-300">{K.energy}</span></> : null}</div>
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
              Arraste para selecionar células. Botão direito: mover / atacar / coletar. No painel acima, clique num tipo para selecionar todas.
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
              {sel.group >= 0 && <div className="mb-1 text-[10px] text-neutral-400">Grupo: <b style={{ color: hud!.groups.find(g => g.id === sel.group)?.color }}>{hud!.groups.find(g => g.id === sel.group)?.name}</b></div>}
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">Comportamento (delegação)</div>
              <div className="grid grid-cols-3 gap-1 mb-1">
                {STANCES.map((s, i) => (
                  <button key={i} onClick={() => eng?.setStance(i)} title={STANCE_HINT[i]} className={`px-1 py-1 rounded-md text-[10px] font-bold ${sel.stance === i ? 'bg-teal-400 text-black' : 'bg-white/5 hover:bg-white/10 text-neutral-200'}`}>{s}</button>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500 leading-snug min-h-[26px]">{STANCE_HINT[sel.stance >= 0 && sel.stance < 5 ? sel.stance : 0]}</p>
              {sel.seeds > 0 && <p className="mt-1 text-[10px] text-amber-200 leading-snug bg-amber-400/10 rounded-md px-2 py-1">Célula-mãe solta: clique com o botão direito num espaço livre (a {COLONY_GAP}+ de outras células-mãe) para fundar a colônia.</p>}
              {sel.workers > 0 && (
                <button onClick={() => eng?.startPlacing()} className={`mt-1 w-full py-1.5 rounded-md font-bold text-[11px] ${hud?.placing ? 'bg-violet-400 text-black' : 'bg-violet-500/20 border border-violet-300/40 text-violet-100 hover:bg-violet-500/30'}`}>
                  {hud?.placing ? 'Clique no mapa (borda do biofilme)…' : `Virar nódulo de biofilme (N) · ${KINDS[Kind.NODE].food}/${KINDS[Kind.NODE].energy}`}
                </button>
              )}
              {sel.group < 0 && !form && <button onClick={openForm} className="mt-1 w-full py-1.5 rounded-md font-bold text-[11px] bg-white/5 border border-white/10 hover:bg-white/10">Criar grupo com a seleção (G)</button>}
            </>
          )}
        </div>
      )}

      <Hotkeys onGroup={() => { if (selTotal > 0) openForm(); }} />

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
              <li>🟣 <b>Biofilme</b> é o seu território: dentro dele as células se curam e comem; fora, morrem de fome. <b>A coletora vira nódulo</b> (N): expande o território e dá +6 de população.</li>
              <li>🎯 <b>Grupos</b>: selecione células e aperte G (ou Ctrl+1..9) para criar um grupo com nome e cor. Dê ordens e comportamentos (Defender, Caçar…) ao grupo inteiro.</li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-400 font-mono">
              <span>Arrastar: selecionar</span><span>Botão direito: ordem</span>
              <span>Duplo clique: todas do tipo</span><span>WASD / setas: câmera</span>
              <span>1..9: selecionar grupo</span><span>Roda: zoom</span>
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
            <div className="text-2xl font-black mb-1">{won ? 'A poça é sua!' : 'Extinção'}</div>
            <p className="text-sm text-neutral-300 mb-4">{won
              ? `${species.genus} ${species.species} domina a poça primordial. A próxima era (aquática) chega em breve — por enquanto você pode continuar jogando.`
              : 'A última célula-mãe da sua espécie morreu. Sem ela, o biofilme desaparece e as células morrem de fome.'}</p>
            <div className="flex gap-2 justify-center">
              {won && <button onClick={() => setWonSeen(true)} className="px-4 py-2 rounded-xl font-bold bg-emerald-400 text-black">Continuar jogando</button>}
              {!won && <button onClick={onRestart} className="px-4 py-2 rounded-xl font-bold bg-teal-300 text-black">Tentar de novo</button>}
              <button onClick={onExit} className="px-4 py-2 rounded-xl font-bold bg-white/10 hover:bg-white/15">Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** G opens the new-group form (the engine owns the other keys) */
function Hotkeys({ onGroup }: { onGroup: () => void }) {
  const ref = useRef(onGroup);
  ref.current = onGroup;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ref.current(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  return null;
}

function Res({ icon, v, title, warn }: { icon: React.ReactNode; v: React.ReactNode; title: string; warn?: boolean }) {
  return <span title={title} className={`flex items-center gap-1 ${warn ? 'text-amber-300' : 'text-neutral-100'}`}>{icon}{v}</span>;
}
