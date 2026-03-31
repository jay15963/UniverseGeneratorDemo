import React from 'react';
import { GalaxyLayer } from '../../lib/galaxy/types';
import { Info } from 'lucide-react';

interface GalaxyLegendProps {
  layer: GalaxyLayer;
}

export function GalaxyLegend({ layer }: GalaxyLegendProps) {
  if (layer === GalaxyLayer.SYSTEM) return null;

  const renderContent = () => {
    switch (layer) {
      case GalaxyLayer.HABITABILITY:
        return (
          <>
            <LegendItem color="#ff2222" label="Nuclear Core / Supernova Zone (Hostile)" />
            <LegendItem color="#555555" label="Outer Edges (Barren / Low Metallicity)" />
            <LegendItem color="rgb(50, 150, 50)" label="Habitable Sweet Spot (Mature Systems)" />
            <LegendItem color="rgb(50, 255, 50)" label="Optimal / Rich Systems" />
          </>
        );
      case GalaxyLayer.STAR_TYPE:
        return (
          <div className="flex gap-4">
            <div className="space-y-2">
              <LegendItem color="#72c8faff" label="O/B - Blue Giants" />
              <LegendItem color="#bdcdfcff" label="A/F - White Dwarfs" />
              <LegendItem color="#facea4ff" label="G - Yellow Dwarfs (Sun)" />
              <LegendItem color="#fc5f30ff" label="K/M - Red/Orange Dwarfs" />
            </div>
            <div className="space-y-2">
              <LegendItem color="#000000" label="BH - Black Hole" border="#555" />
              <LegendItem color="#00eeffff" label="NS - Neutron Star" />
              <LegendItem color="#935ffcff" label="P - Pulsar" />
            </div>
          </div>
        );
      case GalaxyLayer.DANGER:
        return (
          <>
            <LegendItem color="#000000" label="Supermassive / Black Holes" border="#f00" />
            <LegendItem color="#ff0055" label="Anomaly Dead Zone (Destroyed Systems)" />
            <LegendItem color="rgba(50, 50, 50, 0.4)" label="Safe Zone" />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="absolute bottom-4 left-4 bg-neutral-900/95 border border-neutral-700/50 p-4 rounded-xl shadow-2xl backdrop-blur-sm pointer-events-none z-10 w-[400px]">
      <div className="flex items-center gap-2 text-neutral-400 mb-3 text-sm font-semibold border-b border-neutral-800 pb-2">
        <Info className="w-4 h-4" />
        <span>Legend: {layer.toUpperCase()}</span>
      </div>
      <div className="space-y-2 text-sm text-neutral-300">
        {renderContent()}
      </div>
    </div>
  );
}

function LegendItem({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-4 h-4 rounded-full"
        style={{
          backgroundColor: color,
          border: `1px solid ${border || 'transparent'}`
        }}
      />
      <span>{label}</span>
    </div>
  );
}
