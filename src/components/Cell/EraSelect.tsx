// Play mode: the lineage's eras. The save (`game/save.ts`) holds the era the lineage is in; reached eras are
// marked, the current one continues, any other starts a new game there (for trying every era). Each card shows a
// portrait of the player's species at that stage.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Globe2, Check, Star, RotateCcw } from 'lucide-react';
import { renderCreature } from '../../lib/creature/render';
import { drawKind, spriteCanvas } from '../../lib/cell/art';
import { Kind, loadSpecies, makeSpecies } from '../../lib/cell/look';
import { ERA_LIST, eraById, eraIndex, type EraId, type BattleStyle } from '../../lib/game/eras';
import { loadGame, newGame, saveGame, clearGame, lineageGenome } from '../../lib/game/save';

interface Props { onBack: () => void; onCell: () => void; onHome: () => void; onPlay: () => void }

const STYLE: Record<BattleStyle, string> = {
  warband: 'Bandos de guerra', formation: 'Formações (Total War)', line: 'Infantaria de linha', trench: 'Guerra de trincheiras', combined: 'Armas combinadas',
};

export function EraSelect({ onBack, onCell, onHome, onPlay }: Props) {
  const species = useMemo(() => loadSpecies() ?? makeSpecies('LINHAGEM'), []);
  const genome = useMemo(() => lineageGenome(species), [species]);
  const [save, setSave] = useState(() => loadGame());
  const [pics, setPics] = useState<Record<string, HTMLCanvasElement>>({});
  useEffect(() => {
    let dead = false, i = 0;
    const out: Record<string, HTMLCanvasElement> = {};
    const run = () => {
      if (dead || i >= ERA_LIST.length) return;
      const e = ERA_LIST[i++];
      out[e.id] = e.id === 'cell' ? spriteCanvas(drawKind(species, Kind.MOTHER, 1)) : renderCreature(genome, e.stage, 'SE').frames[0];
      setPics({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 30);
    return () => { dead = true; clearTimeout(id); };
  }, [genome, species]);

  const cur = save?.era ?? null;
  const pick = (id: EraId) => {
    if (id === 'cell') { onCell(); return; }
    if (cur === id) { onPlay(); return; }
    if (save && !confirm(`Começar uma nova partida na era ${eraById(id).name}? A partida atual (era ${eraById(save.era).name}) será substituída.`)) return;
    const g = newGame(id);
    saveGame(g); setSave(g); onPlay();
  };

  return (
    <div className="min-h-screen bg-[#05060b] text-white font-sans">
      <header className="flex items-center gap-3 px-4 sm:px-8 py-4 border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <h1 className="font-black tracking-[0.2em] text-sm sm:text-base">ERAS DA LINHAGEM</h1>
        <span className="ml-auto text-[11px] text-neutral-500 hidden sm:block">Da célula à nave colonial — uma linhagem só, num mundo só.</span>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4 sm:pt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/25 bg-gradient-to-r from-amber-500/10 via-black to-black px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-mono tracking-[0.25em] text-amber-200/70">SUA LINHAGEM</div>
            <div className="font-serif italic text-xl text-amber-50 truncate">{species.genus} {species.species}</div>
            <p className="text-[11px] text-neutral-400">{save ? <>Na era <b className="text-white">{eraById(save.era).name}</b>{save.won ? ' · a nave colonial partiu — vitória!' : ''} · {save.reached.length} de {ERA_LIST.length} eras alcançadas</> : 'Comece na era celular: cada vitória leva a espécie à era seguinte.'}</p>
          </div>
          {save && save.era !== 'cell' && <button onClick={onPlay} className="inline-flex items-center gap-1.5 text-sm font-bold text-black bg-amber-300 hover:bg-amber-200 rounded-lg px-4 py-2"><Play className="w-4 h-4" /> Continuar</button>}
          {save && <button onClick={() => { if (confirm('Apagar a partida salva desta linhagem?')) { clearGame(); setSave(null); } }} title="Apagar a partida" className="p-2 rounded-lg bg-white/5 text-neutral-400 hover:text-white"><RotateCcw className="w-4 h-4" /></button>}
        </div>
        <button onClick={onHome} className="flex items-center gap-3 text-left rounded-2xl border border-sky-300/30 bg-gradient-to-r from-sky-500/10 via-black to-black px-4 py-3 hover:border-sky-200 transition-colors">
          <Globe2 className="w-8 h-8 text-sky-300 shrink-0" />
          <div className="min-w-0">
            <div className="font-black leading-tight">Mundo natal</div>
            <p className="text-[11px] text-neutral-400 max-w-[220px]">Passeie pelo planeta da linhagem, sob a neblina de descoberta.</p>
          </div>
        </button>
      </div>
      <div className="max-w-6xl mx-auto p-4 sm:p-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {ERA_LIST.map((e, i) => {
          const reached = !!save?.reached.includes(e.id), here = cur === e.id, ahead = !reached && (!save || eraIndex(e.id) > eraIndex(save.era));
          return (
            <button key={e.id} onClick={() => pick(e.id)}
              className={`group relative text-left rounded-2xl border overflow-hidden transition-all hover:-translate-y-0.5 ${here ? 'border-amber-300/60 bg-gradient-to-b from-amber-500/15 to-black shadow-[0_0_30px_rgba(252,211,77,0.15)]' : reached ? 'border-teal-300/40 bg-gradient-to-b from-teal-500/10 to-black hover:border-teal-200' : 'border-white/10 bg-white/[0.02] hover:border-white/30'}`}>
              <div className={`h-32 sm:h-36 flex items-center justify-center ${reached || here ? 'bg-[#07181e]' : 'bg-black/40'}`}>
                <Pic canvas={pics[e.id]} locked={ahead} />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-mono tracking-[0.25em] ${e.group === 'Vida' ? 'text-teal-300/70' : 'text-amber-300/60'}`}>{String(i + 1).padStart(2, '0')} · {e.group.toUpperCase()}</span>
                  {here ? <Star className="w-3.5 h-3.5 text-amber-300" /> : reached ? <Check className="w-3.5 h-3.5 text-teal-300" /> : null}
                </div>
                <div className={`font-black text-lg ${ahead ? 'text-neutral-400' : 'text-white'}`}>{e.name}</div>
                {e.battle && <div className="text-[10px] font-mono text-amber-200/60">{STYLE[e.battle]}</div>}
                <p className={`text-[11px] leading-snug mt-0.5 min-h-[28px] ${ahead ? 'text-neutral-500' : 'text-neutral-300'}`}>{e.blurb}</p>
                <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-1.5 ${here ? 'text-black bg-amber-300' : reached ? 'text-black bg-teal-300' : 'text-neutral-300 bg-white/10'}`}>
                  <Play className="w-3.5 h-3.5" /> {e.id === 'cell' ? (here ? 'Continuar' : 'Nova linhagem') : here ? 'Continuar' : 'Começar aqui'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Pic({ canvas, locked }: { canvas?: HTMLCanvasElement; locked: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (!canvas) return;
    x.imageSmoothingEnabled = false;
    const s = Math.min((c.width - 8) / canvas.width, (c.height - 8) / canvas.height), k = s >= 1 ? Math.floor(s) : s;
    x.drawImage(canvas, (c.width - canvas.width * k) / 2, (c.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  }, [canvas]);
  return <canvas ref={ref} width={160} height={120} className="h-full max-w-full" style={{ imageRendering: 'pixelated', filter: locked ? 'grayscale(1) brightness(0.35)' : undefined }} />;
}
