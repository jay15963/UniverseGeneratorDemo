// Plays the save's current era on the home planet: the creature RTS (aquatic, land) or the grand campaign
// (tribal .. space). Winning an era moves the save on and remounts the next one.
import React, { useState } from 'react';
import { loadGame, newGame, saveGame, type GameSave } from '../../lib/game/save';
import { eraById } from '../../lib/game/eras';
import { CreatureEra } from './CreatureEra';
import { CampaignEra } from './campaign/CampaignEra';

export function EraPlay({ onExit }: { onExit: () => void }) {
  const [save, setSave] = useState<GameSave>(() => { const g = loadGame() ?? newGame('aqua'); saveGame(g); return g; });
  const [run, setRun] = useState(0);
  const next = () => { const g = loadGame(); if (g) setSave(g); setRun(r => r + 1); };
  const era = eraById(save.era);
  if (era.kind === 'creature') return <React.Fragment key={`${save.era}:${run}`}><CreatureEra mode={save.era === 'aqua' ? 'aqua' : 'land'} save={save} onExit={onExit} onAdvance={next} /></React.Fragment>;
  if (era.kind === 'campaign') return <React.Fragment key={`campaign:${run}`}><CampaignEra save={save} onExit={onExit} onAdvance={next} /></React.Fragment>;
  return null;
}
