// Play mode: pick the era to start in. Only the cellular era is open for now; the others are shown locked, each with
// a portrait of the same sample species at that stage (the lineage the player will walk).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Lock, Play } from 'lucide-react';
import { makeGenome, Stage, DEFAULT_PARAMS } from '../../lib/creature/genome';
import { renderCreature } from '../../lib/creature/render';
import { drawKind, spriteCanvas } from '../../lib/cell/art';
import { Kind, loadSpecies, makeSpecies } from '../../lib/cell/look';

interface Props { onBack: () => void; onCell: () => void }

interface Era { id: string; name: string; group: string; blurb: string; stage: Stage | 'cell'; open?: boolean }
const ERAS: Era[] = [
  { id: 'cell', name: 'Celular', group: 'Vida', blurb: 'RTS de colônias numa poça primordial: divida, espalhe o biofilme e domine centenas de colônias.', stage: 'cell', open: true },
  { id: 'aqua', name: 'Aquática', group: 'Vida', blurb: 'O primeiro corpo: cardumes, formações e migrações.', stage: Stage.AQUA },
  { id: 'land', name: 'Terrestre', group: 'Vida', blurb: 'Bandos, território, estações e relações entre espécies.', stage: Stage.LAND },
  { id: 'late', name: 'Animal tardio', group: 'Vida', blurb: 'De pé nas duas patas: proto-ferramentas e proto-sociedades.', stage: Stage.AMPHIBIAN },
  { id: 'tribal', name: 'Tribal', group: 'Civilização', blurb: 'A primeira aldeia: a estratégia começa de verdade.', stage: Stage.TRIBAL },
  { id: 'medieval', name: 'Medieval', group: 'Civilização', blurb: '', stage: Stage.MEDIEVAL },
  { id: 'classic', name: 'Clássica', group: 'Civilização', blurb: '', stage: Stage.RENAISSANCE },
  { id: 'industrial', name: 'Industrial', group: 'Civilização', blurb: '', stage: Stage.INDUSTRIAL },
  { id: 'modern', name: 'Moderna', group: 'Civilização', blurb: '', stage: Stage.MODERN },
  { id: 'contemporary', name: 'Contemporânea', group: 'Civilização', blurb: '', stage: Stage.CONTEMPORARY },
  { id: 'futurist', name: 'Futurista', group: 'Civilização', blurb: '', stage: Stage.FUTURIST },
  { id: 'space', name: 'Espacial', group: 'Civilização', blurb: '', stage: Stage.SPACE },
];

export function EraSelect({ onBack, onCell }: Props) {
  const species = useMemo(() => loadSpecies() ?? makeSpecies('LINHAGEM'), []);
  const genome = useMemo(() => makeGenome(species.seed, DEFAULT_PARAMS, species.mode), [species]);
  const [pics, setPics] = useState<Record<string, HTMLCanvasElement>>({});
  useEffect(() => {
    let dead = false, i = 0;
    const out: Record<string, HTMLCanvasElement> = {};
    const run = () => {
      if (dead || i >= ERAS.length) return;
      const e = ERAS[i++];
      out[e.id] = e.stage === 'cell' ? spriteCanvas(drawKind(species, Kind.MOTHER, 1)) : renderCreature(genome, e.stage, 'SE').frames[0];
      setPics({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 30);
    return () => { dead = true; clearTimeout(id); };
  }, [genome, species]);

  return (
    <div className="min-h-screen bg-[#05060b] text-white font-sans">
      <header className="flex items-center gap-3 px-4 sm:px-8 py-4 border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <h1 className="font-black tracking-[0.2em] text-sm sm:text-base">ESCOLHA A ERA</h1>
        <span className="ml-auto text-[11px] text-neutral-500 hidden sm:block">Da célula à era espacial — uma linhagem só.</span>
      </header>
      <div className="max-w-6xl mx-auto p-4 sm:p-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {ERAS.map((e, i) => (
          <button key={e.id} disabled={!e.open} onClick={e.open ? onCell : undefined}
            className={`group relative text-left rounded-2xl border overflow-hidden transition-all ${e.open ? 'border-teal-300/40 bg-gradient-to-b from-teal-500/10 to-black hover:border-teal-200 hover:-translate-y-0.5 shadow-[0_0_30px_rgba(45,212,191,0.12)]' : 'border-white/5 bg-white/[0.02] cursor-not-allowed'}`}>
            <div className={`h-32 sm:h-36 flex items-center justify-center ${e.open ? 'bg-[#07181e]' : 'bg-black/40'}`}>
              <Pic canvas={pics[e.id]} locked={!e.open} />
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-mono tracking-[0.25em] ${e.group === 'Vida' ? 'text-teal-300/70' : 'text-amber-300/60'}`}>{String(i + 1).padStart(2, '0')} · {e.group.toUpperCase()}</span>
                {!e.open && <Lock className="w-3.5 h-3.5 text-neutral-500" />}
              </div>
              <div className={`font-black text-lg ${e.open ? 'text-white' : 'text-neutral-500'}`}>{e.name}</div>
              <p className={`text-[11px] leading-snug mt-0.5 min-h-[28px] ${e.open ? 'text-neutral-300' : 'text-neutral-600'}`}>{e.open ? e.blurb : e.blurb || 'Em breve.'}</p>
              {e.open && <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-black bg-teal-300 rounded-lg px-3 py-1.5 group-hover:bg-teal-200"><Play className="w-3.5 h-3.5" /> Jogar</div>}
            </div>
          </button>
        ))}
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
