// The evolution tree of the cellular era: five branches of research paid with DNA (from engulfed / killed cells and
// discovered species) and energy. One research at a time; stolen genes make every research cheaper.
import { X, FlaskConical, Lock, CheckCircle2 } from 'lucide-react';
import { TECHS, BRANCHES, geneDiscount, KINDS } from '../../lib/cell/look';
import type { Stats } from '../../lib/cell/sim';
import type { CellEngine } from './engine';

const BRANCH_COL: Record<string, string> = { met: '#facc15', mot: '#38bdf8', mem: '#a78bfa', pre: '#f87171', com: '#34d399' };

export function TechPanel({ st, eng, onClose }: { st: Stats; eng: CellEngine | null; onClose: () => void }) {
  const disc = geneDiscount(st.genes.length);
  const cur = st.research ? TECHS.find(t => t.id === st.research!.id) : null;
  return (
    <div className="absolute top-14 left-2 z-30 w-[640px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-80px)] overflow-y-auto no-scrollbar rounded-2xl bg-[#061318]/95 border border-teal-300/25 shadow-2xl text-xs">
      <div className="sticky top-0 z-10 bg-[#061318]/95 flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 font-black text-sm text-teal-100"><FlaskConical className="w-4 h-4 text-teal-300" /> Árvore de evolução</div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-violet-200" title="DNA: engula ou mate células (amebas e diatomáceas rendem mais) e descubra espécies">🧬 {st.dna.toFixed(1)} DNA</span>
          {disc < 1 && <span className="text-[10px] text-teal-300" title="Cada gene roubado barateia a pesquisa">-{Math.round((1 - disc) * 100)}% DNA (genes)</span>}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {cur && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-teal-400/10 border border-teal-300/25">
          <div className="flex justify-between"><b className="text-teal-100">Pesquisando: {cur.name}</b><span className="font-mono text-teal-200">{Math.round(st.research!.p * 100)}%</span></div>
          <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-teal-300" style={{ width: `${st.research!.p * 100}%` }} /></div>
        </div>
      )}
      <div className="grid grid-cols-5 gap-1.5 p-2">
        {BRANCHES.map(([b, name]) => (
          <div key={b} className="flex flex-col gap-1.5 min-w-0">
            <div className="text-center text-[10px] font-black uppercase tracking-[0.12em] py-1 rounded-md" style={{ color: BRANCH_COL[b], background: `${BRANCH_COL[b]}18` }}>{name}</div>
            {TECHS.filter(t => t.branch === b).map(t => {
              const done = st.techs.includes(t.id), busy = st.research?.id === t.id;
              const reqOk = t.req.every(r => st.techs.includes(r));
              const dna = Math.ceil(t.dna * disc), can = !done && !st.research && reqOk && st.dna >= dna && st.energy >= t.energy;
              const reqNames = t.req.map(r => TECHS.find(q => q.id === r)!.name).join(', ');
              return (
                <button key={t.id} disabled={!can} onClick={() => eng?.cmd({ t: 'research', id: t.id })}
                  title={`${t.desc}${t.req.length ? `\nRequer: ${reqNames}` : ''}${t.unlock !== undefined ? `\nLibera: ${KINDS[t.unlock].name}` : ''}\n${t.time} s de pesquisa`}
                  className={`text-left rounded-lg border p-1.5 transition ${done ? 'border-emerald-300/40 bg-emerald-400/10' : busy ? 'border-teal-300/60 bg-teal-400/15 animate-pulse' : can ? 'border-white/20 bg-white/[0.06] hover:bg-white/10 hover:border-white/40' : 'border-white/5 bg-white/[0.02]'} ${!reqOk && !done ? 'opacity-45' : ''}`}>
                  <div className="flex items-center gap-1">
                    {done ? <CheckCircle2 className="w-3 h-3 text-emerald-300 shrink-0" /> : !reqOk ? <Lock className="w-3 h-3 text-neutral-500 shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BRANCH_COL[b] }} />}
                    <span className="font-bold text-[10.5px] leading-tight text-neutral-100">{t.name}</span>
                  </div>
                  <div className="mt-0.5 text-[9.5px] leading-snug text-neutral-400">{t.desc}</div>
                  {!done && <div className="mt-1 font-mono text-[9.5px]"><span className={st.dna >= dna ? 'text-violet-200' : 'text-red-300'}>🧬{dna}</span> · <span className={st.energy >= t.energy ? 'text-cyan-200' : 'text-red-300'}>⚡{t.energy}</span> · <span className="text-neutral-500">{t.time}s</span></div>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="px-3 pb-3 text-[10px] text-neutral-500 leading-snug">DNA vem de células engolidas (fagócitas) ou mortas — amebas e diatomáceas rendem mais — e de cada espécie descoberta (+3). Cada gene roubado deixa as pesquisas 8% mais baratas. <b className="text-neutral-400">Multicelularidade</b> é exigida para evoluir.</p>
    </div>
  );
}
