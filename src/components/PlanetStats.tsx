import React from 'react';
import { PlanetConfig } from '../lib/planet-generator/generator';

interface PlanetStatsProps {
  config: PlanetConfig;
}

export function PlanetStats({ config }: PlanetStatsProps) {
  return (
    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-neutral-400">
      <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <span className="block text-neutral-500 mb-1">Resolution</span>
        <span className="font-mono text-neutral-300">{config.width} × {config.height}</span>
      </div>
      <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <span className="block text-neutral-500 mb-1">Tectonic Plates</span>
        <span className="font-mono text-neutral-300">{config.numPlates}</span>
      </div>
      <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <span className="block text-neutral-500 mb-1">Sea Level</span>
        <span className="font-mono text-neutral-300">{(config.seaLevel * 100).toFixed(1)}%</span>
      </div>
      <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <span className="block text-neutral-500 mb-1">Seed</span>
        <span className="font-mono text-neutral-300 truncate">{config.seed}</span>
      </div>
    </div>
  );
}
