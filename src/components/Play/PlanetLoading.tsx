// The loading screen of the eras played on the home planet (never names the planet).
import React from 'react';
import type { CellSpecies } from '../../lib/cell/look';

export function PlanetLoading({ status, progress, species, error, onBack }: { status: string; progress: number; species: CellSpecies; error?: string; onBack: () => void }) {
  return (
    <div className="fixed inset-0 bg-[#03060c] text-white flex flex-col items-center justify-center gap-4 z-[300]">
      {error ? <>
        <p className="text-red-300 max-w-md text-center text-sm">{error}</p>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm">Voltar</button>
      </> : <>
        <div className="w-12 h-12 rounded-full border-2 border-sky-400/25 border-t-sky-300 animate-spin" />
        <p className="font-mono text-xs text-sky-200/80 tracking-widest">{status || 'PREPARANDO A ERA…'}</p>
        <div className="w-56 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sky-300 transition-all" style={{ width: `${Math.max(0.06, progress) * 100}%` }} /></div>
        <p className="italic font-serif text-amber-100/70 text-sm">{species.genus} {species.species}</p>
      </>}
    </div>
  );
}
