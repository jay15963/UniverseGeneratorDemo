// (stub while the campaign is being written)
import React from 'react';
import type { GameSave } from '../../../lib/game/save';
export function CampaignEra({ onExit }: { save: GameSave; onExit: () => void; onAdvance: () => void }) {
  return <div className="fixed inset-0 bg-black text-white flex items-center justify-center"><button onClick={onExit}>Voltar</button></div>;
}
