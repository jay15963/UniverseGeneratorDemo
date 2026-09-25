// Life scanner (play mode): sweeps the universe galaxy by galaxy, nearest first from where the player is, with a pool
// of workers, and lists the worlds with life. The filter goes from intelligent species only down to any life at all
// (animal, plants, microbes). Clicking a world jumps to its star system.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radar, X, Pause, Play } from 'lucide-react';
import { useGameEngine } from '../../stores/useGameEngine';
import type { ScanHit } from '../../lib/solar-system/scan.worker';
import type { UniverseGalaxyMetadata } from '../../lib/universe/types';
import { LIFE_ORDER, LifeLevel } from '../../lib/planet-generator/generator';
import { LIFE_NAMES } from '../../lib/solar-system/life';
import { ERA_NAMES } from '../../lib/city/codes';
import { PLANET_TYPE_NAMES } from '../../lib/solar-system/bodyInfo';

const FILTERS: { id: LifeLevel; label: string }[] = [
  { id: 'intelligent', label: 'Inteligente' },
  { id: 'animal', label: 'Animal +' },
  { id: 'plants', label: 'Vegetal +' },
  { id: 'microbial', label: 'Qualquer vida' },
];
const LEVEL_COL: Record<LifeLevel, string> = { none: '#737373', microbial: '#a3e635', plants: '#4ade80', animal: '#38bdf8', intelligent: '#fbbf24' };
const MAX_HITS = 4000;

export function LifeScanner({ onClose }: { onClose: () => void }) {
  const galaxies = useGameEngine(s => s.galaxies);
  const here = useGameEngine(s => s.activeGalaxyMeta);
  const jumpToSystem = useGameEngine(s => s.jumpToSystem);
  const [filter, setFilter] = useState<LifeLevel>('intelligent');
  const [hits, setHits] = useState<ScanHit[]>([]);
  const [prog, setProg] = useState({ galaxies: 0, systems: 0 });
  const [running, setRunning] = useState(true);
  const runRef = useRef(true);
  runRef.current = running;

  // nearest galaxies first, from the one the player is in (or from the heart of the universe)
  const queue = useMemo(() => {
    const ox = here?.x ?? 0, oy = here?.y ?? 0;
    return galaxies.filter(g => !g.isDead).sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy));
  }, [galaxies, here]);
  const byId = useMemo(() => new Map(galaxies.map(g => [g.id, g])), [galaxies]);

  // worker pool; the scan resumes where it stopped when the panel is paused
  const next = useRef(0);
  const pump = useRef<() => void>(() => {});
  useEffect(() => {
    next.current = 0;
    setHits([]); setProg({ galaxies: 0, systems: 0 });
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    const workers = Array.from({ length: n }, () => ({ w: new Worker(new URL('../../lib/solar-system/scan.worker.ts', import.meta.url), { type: 'module' }), busy: false }));
    let alive = true, id = 1, total = 0;
    const send = () => {
      for (const s of workers) {
        if (s.busy || !runRef.current || next.current >= queue.length || total >= MAX_HITS) continue;
        const g: UniverseGalaxyMetadata = queue[next.current++];
        s.busy = true;
        s.w.postMessage({ id: id++, galaxy: g });
      }
    };
    for (const s of workers) s.w.onmessage = (ev: MessageEvent) => {
      s.busy = false;
      if (!alive) return;
      const m = ev.data;
      if (m.ok) {
        total += m.hits.length;
        if (m.hits.length) setHits(h => (h.length > MAX_HITS ? h : h.concat(m.hits)));
        setProg(p => ({ galaxies: p.galaxies + 1, systems: p.systems + m.systems }));
      }
      send();
    };
    pump.current = send;
    send();
    return () => { alive = false; workers.forEach(s => s.w.terminate()); };
  }, [queue]);
  useEffect(() => { if (running) pump.current(); }, [running]);

  const min = LIFE_ORDER.indexOf(filter);
  const shown = useMemo(() => hits.filter(h => LIFE_ORDER.indexOf(h.level) >= min)
    .sort((a, b) => LIFE_ORDER.indexOf(b.level) - LIFE_ORDER.indexOf(a.level) || (b.era ?? 0) - (a.era ?? 0)).slice(0, 300), [hits, min]);
  const done = prog.galaxies >= queue.length;

  return (
    <div className="absolute right-2 sm:right-4 top-16 z-50 w-[340px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-90px)] flex flex-col bg-black/85 backdrop-blur-md border border-emerald-400/25 rounded-2xl text-white shadow-2xl">
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm"><Radar className="w-4 h-4" /> Scanner de vida</div>
        <div className="flex gap-1">
          {!done && <button onClick={() => setRunning(r => !r)} title={running ? 'Pausar' : 'Continuar'} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10">{running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}</button>}
          <button onClick={onClose} title="Fechar" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="px-3 pt-2 flex flex-wrap gap-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${filter === f.id ? 'bg-emerald-500 text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}>{f.label}</button>
        ))}
      </div>
      <div className="px-3 pt-2 text-[11px] text-neutral-400 font-mono">
        {prog.galaxies}/{queue.length} galáxias · {prog.systems.toLocaleString('pt-BR')} sistemas · {shown.length}{shown.length >= 300 ? '+' : ''} mundos
        {!done && running && <span className="text-emerald-300 animate-pulse"> · escaneando…</span>}
      </div>
      <div className="mt-2 mb-2 mx-2 overflow-y-auto no-scrollbar flex-1 min-h-[80px]">
        {shown.length === 0 && <div className="text-center text-xs text-neutral-500 py-6">{done ? 'Nenhum mundo encontrado com esse filtro.' : 'Procurando…'}</div>}
        {shown.map((h, i) => {
          const g = byId.get(h.galaxyId);
          return (
            <button key={i} onClick={() => { if (g) { jumpToSystem(g, h.star, h.bodyId); onClose(); } }}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 border-b border-white/5">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-sm truncate">{h.body}{h.moon ? ' (lua)' : ''}</span>
                <span className="text-[10px] font-bold shrink-0" style={{ color: LEVEL_COL[h.level] }}>
                  {h.level === 'intelligent' ? `Inteligente · ${ERA_NAMES[h.era ?? 0]}` : LIFE_NAMES[h.level]}
                </span>
              </div>
              <div className="text-[10px] text-neutral-500 truncate">{g?.name ?? '?'} › {h.star.name} · {PLANET_TYPE_NAMES[h.planetType] ?? h.planetType}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
