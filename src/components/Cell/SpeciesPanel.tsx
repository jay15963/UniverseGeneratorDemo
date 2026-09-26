// The species panel of the cellular era: the genes the player has stolen, the way to the multicellular stage, and the
// diplomacy with every species met so far (relation, gifts, peace, symbiosis, endosymbiosis, breaking a pact).
import React from 'react';
import { X, Dna, Gift, Handshake, HeartHandshake, Sparkles, Swords, CheckCircle2, Circle } from 'lucide-react';
import { CellSpecies, GENES, geneOf, DNA_FOR_GENE, teamColour } from '../../lib/cell/look';
import type { Stats } from '../../lib/cell/sim';
import type { CellEngine } from './engine';

const PACT = ['Guerra', 'Paz', 'Simbiose'];
const PACT_COL = ['text-red-300 bg-red-500/15 border-red-400/30', 'text-sky-200 bg-sky-500/15 border-sky-300/30', 'text-emerald-200 bg-emerald-500/15 border-emerald-300/30'];

export function SpeciesPanel({ st, species, eng, thumb, onClose }: {
  st: Stats; species: CellSpecies[]; eng: CellEngine | null; thumb: (set: number) => string | undefined; onClose: () => void;
}) {
  const genes = GENES.filter(g => st.genes.includes(g.id));
  const cells = st.counts.reduce((a, b) => a + b, 0);
  const steps: [boolean, string][] = [
    [st.mito, 'Endossimbiose (uma espécie em simbiose vira sua organela)'],
    [st.genes.length >= 3, `3 genes (${st.genes.length}/3)`],
    [cells >= 60, `60 células (${cells}/60)`],
    [st.techs.includes('com4'), 'Pesquisa Multicelularidade (árvore de evolução)'],
  ];
  const known = [...st.nations].sort((a, b) => b.pact - a.pact || b.rel - a.rel);
  return (
    <div className="absolute top-14 left-2 z-30 w-[380px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-80px)] overflow-y-auto no-scrollbar rounded-2xl bg-[#061318]/95 border border-teal-300/25 shadow-2xl text-xs">
      <div className="sticky top-0 bg-[#061318]/95 flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 font-black text-sm text-teal-100"><Dna className="w-4 h-4 text-teal-300" /> Espécies e genes</div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>

      {/* the way to the next era */}
      <div className="m-2 p-2.5 rounded-xl bg-gradient-to-br from-teal-500/10 to-violet-500/10 border border-white/10">
        <div className="font-bold text-teal-100 mb-1">Rumo ao multicelular</div>
        {steps.map(([ok, label], i) => (
          <div key={i} className={`flex gap-1.5 items-center ${ok ? 'text-emerald-300' : 'text-neutral-300'}`}>{ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 text-neutral-500" />}{label}</div>
        ))}
        <button disabled={!st.canEvolve} onClick={() => eng?.cmd({ t: 'evolve' })}
          className={`mt-2 w-full py-2 rounded-lg font-black text-sm ${st.canEvolve ? 'text-black bg-gradient-to-r from-teal-300 to-violet-300 hover:brightness-110 shadow-[0_0_24px_rgba(167,139,250,0.4)]' : 'bg-white/5 text-neutral-500'}`}>
          <Sparkles className="inline w-4 h-4 -mt-0.5 mr-1" />Evoluir para multicelular
        </button>
      </div>

      {/* the stolen genes */}
      <div className="px-3 pt-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-1">Seus genes</div>
        {!genes.length && !st.mito && <p className="text-[11px] text-neutral-500 leading-snug">Nenhum ainda. Engula (fagócitas) ou mate células de outras espécies: cada uma deixa DNA. Com {DNA_FOR_GENE} de DNA, o gene daquela espécie vira seu.</p>}
        <div className="space-y-1">
          {st.mito && <div className="px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-300/30"><b className="text-violet-100">Mitocôndria</b> <span className="text-neutral-300">· +50% de energia, divisão mais rápida (endossimbiose)</span></div>}
          {genes.map(g => <div key={g.id} className="px-2 py-1 rounded-lg bg-teal-500/10 border border-teal-300/20"><b className="text-teal-100">{g.name}</b> <span className="text-neutral-300">· {g.desc}</span></div>)}
        </div>
      </div>

      {/* diplomacy */}
      <div className="px-3 pt-3 pb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-1">Espécies conhecidas ({known.length})</div>
        {!known.length && <p className="text-[11px] text-neutral-500">Nenhuma ainda: a poça parece vazia, mas as outras espécies estão na névoa. Explore (flageladas!) para descobri-las.</p>}
        <div className="space-y-1.5">
          {known.map(n => {
            const sp = species[n.id], g = geneOf(sp), c = teamColour(sp), own = st.genes.includes(g.id);
            const t = thumb(n.id);
            return (
              <div key={n.id} className={`rounded-xl border p-2 ${n.alive ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center shrink-0 border" style={{ borderColor: `rgb(${c.join(',')})` }}>{t && <img src={t} className="max-w-8 max-h-8" style={{ imageRendering: 'pixelated' }} />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="italic font-serif text-[13px] text-amber-50 truncate">{sp.genus} {sp.species}</div>
                    <div className="text-[10px] text-neutral-500">{n.alive ? `${n.colonies} colônias · ${n.cells} células · força ${n.power}` : 'Extinta'}</div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${PACT_COL[n.pact]}`}>{PACT[n.pact]}</span>
                </div>
                {/* relation bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500 w-12">Relação</span>
                  <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
                    <div className={`absolute top-0 bottom-0 ${n.rel >= 0 ? 'left-1/2 bg-emerald-400' : 'right-1/2 bg-red-400'}`} style={{ width: `${Math.abs(n.rel) / 2}%` }} />
                  </div>
                  <span className={`font-mono text-[10px] w-7 text-right ${n.rel >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{n.rel}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500 w-12">Gene</span>
                  <span className={`flex-1 truncate text-[10px] ${own ? 'text-teal-300' : 'text-neutral-300'}`} title={g.desc}>{g.name}{own ? ' ✓' : ''}</span>
                  {!own && <span className="font-mono text-[10px] text-violet-200">DNA {Math.min(DNA_FOR_GENE, n.dna).toFixed(1)}/{DNA_FOR_GENE}</span>}
                </div>
                {n.alive && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Act onClick={() => eng?.cmd({ t: 'gift', nation: n.id })} icon={<Gift className="w-3 h-3" />} label="Presente (50)" title="Dá 50 nutrientes: melhora a relação" />
                    {n.pact === 0 && <Act onClick={() => eng?.cmd({ t: 'propose', nation: n.id, kind: 'peace' })} icon={<Handshake className="w-3 h-3" />} label="Propor paz" title="Aceita com relação 10+, ou se for mais fraca que você" />}
                    {n.pact === 1 && <Act onClick={() => eng?.cmd({ t: 'propose', nation: n.id, kind: 'symbiosis' })} icon={<HeartHandshake className="w-3 h-3" />} label="Propor simbiose" title={`Depois de 45 s de paz e relação 40+ (paz há ${n.pactFor} s). Trocam nutrientes e energia e comem no biofilme um do outro.`} />}
                    {n.pact === 2 && !st.mito && <Act onClick={() => eng?.cmd({ t: 'propose', nation: n.id, kind: 'endo' })} icon={<Sparkles className="w-3 h-3" />} label="Endossimbiose" title={`Depois de 90 s de simbiose e relação 60+ (simbiose há ${n.pactFor} s): o parceiro vira organela, com o gene dele e a mitocôndria.`} hot />}
                    {n.pact > 0 && <Act onClick={() => eng?.cmd({ t: 'propose', nation: n.id, kind: 'war' })} icon={<Swords className="w-3 h-3" />} label="Romper" title="Volta à guerra" danger />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Act({ onClick, icon, label, title, hot, danger }: { onClick: () => void; icon: React.ReactNode; label: string; title: string; hot?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold ${hot ? 'bg-violet-400/20 border-violet-300/50 text-violet-100 hover:bg-violet-400/30' : danger ? 'bg-red-500/10 border-red-400/30 text-red-200 hover:bg-red-500/20' : 'bg-white/5 border-white/10 text-neutral-200 hover:bg-white/10'}`}>
      {icon}{label}
    </button>
  );
}
