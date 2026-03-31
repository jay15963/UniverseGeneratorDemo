import React from 'react';
import { useGameEngine } from '../../stores/useGameEngine';
import { UniverseSetup } from './UniverseSetup';
import { ExplorationCanvas } from './ExplorationCanvas';
import { HyperspaceTransition } from './HyperspaceTransition';

interface GameApplicationProps {
  onBackToMenu: () => void;
}

export function GameApplication({ onBackToMenu }: GameApplicationProps) {
  const phase = useGameEngine(s => s.phase);
  const isTransitioning = useGameEngine(s => s.isTransitioning);
  const transitionDirection = useGameEngine(s => s.transitionDirection);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {phase === 'setup' && (
        <UniverseSetup onBackToMenu={onBackToMenu} />
      )}

      {phase === 'exploring' && (
        <ExplorationCanvas onBackToMenu={onBackToMenu} />
      )}

      {/* Hyperspace overlay */}
      {isTransitioning && (
        <HyperspaceTransition direction={transitionDirection} />
      )}
    </div>
  );
}
