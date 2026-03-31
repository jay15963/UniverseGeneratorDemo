import React, { useEffect, useRef, useState } from 'react';
import { useGameEngine } from '../../stores/useGameEngine';
import { UniverseGenerator } from '../../lib/universe/generator';
import { UniverseGalaxyMetadata } from '../../lib/universe/types';
import { ChevronLeft, Play, RefreshCw } from 'lucide-react';

// Puff texture cache for galaxy rendering
const createPuff = (rgb: string) => {
  const cvs = document.createElement('canvas');
  cvs.width = 64; cvs.height = 64;
  const c = cvs.getContext('2d');
  if (c) {
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `${rgb}1.0)`);
    grad.addColorStop(0.1, `${rgb}0.8)`);
    grad.addColorStop(0.3, `${rgb}0.3)`);
    grad.addColorStop(0.6, `${rgb}0.1)`);
    grad.addColorStop(1, `${rgb}0)`);
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
  }
  return cvs;
};

const puffCache: Record<string, HTMLCanvasElement> = {};
function getPuffForColor(color: string) {
  if (!puffCache[color]) {
    const hslaPrefix = color.replace('hsl', 'hsla').replace(')', ', ');
    puffCache[color] = createPuff(hslaPrefix);
  }
  return puffCache[color];
}

interface UniverseSetupProps {
  onBackToMenu: () => void;
}

export function UniverseSetup({ onBackToMenu }: UniverseSetupProps) {
  const rootSeed = useGameEngine(s => s.rootSeed);
  const setRootSeed = useGameEngine(s => s.setRootSeed);
  const universeAge = useGameEngine(s => s.universeAge);
  const setUniverseAge = useGameEngine(s => s.setUniverseAge);
  const numGalaxies = useGameEngine(s => s.numGalaxies);
  const setNumGalaxies = useGameEngine(s => s.setNumGalaxies);
  const setGalaxies = useGameEngine(s => s.setGalaxies);
  const setPhase = useGameEngine(s => s.setPhase);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [generatedGalaxies, setGeneratedGalaxies] = useState<UniverseGalaxyMetadata[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Resize
  useEffect(() => {
    const handleResize = () => setDimensions({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate universe reactively on param change (timelapse effect)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const gen = new UniverseGenerator({ seed: rootSeed, age: universeAge, maxGalaxies: numGalaxies });
        const result = gen.generate();
        setGeneratedGalaxies(result);
      } catch (e) {
        console.error("Universe Generation Failed:", e);
      }
    }, 40);
  }, [rootSeed, universeAge, numGalaxies]);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = dimensions.w;
    canvas.height = dimensions.h;

    // Background
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Use the same coordinate system as UniverseViewer:
    // LOGICAL_RADIUS defines the bounding area, ratio maps logical coords to canvas space,
    // and a fixed scale of 2.0x zooms into the center for a good overview.
    const LOGICAL_RADIUS = Math.max(10000, Math.sqrt(numGalaxies) * 200) * 1.5;
    const scale = 2.0; // Fixed zoom matching UniverseViewer default
    const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);

    // Cosmic Background Radiation Flash
    if (universeAge < 0.1) {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, LOGICAL_RADIUS * ratio);
      const flashAlpha = 1 - (universeAge * 10);
      rg.addColorStop(0, `rgba(255, 200, 150, ${flashAlpha})`);
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath(); ctx.arc(0, 0, LOGICAL_RADIUS * ratio, 0, Math.PI * 2);
      ctx.fillStyle = rg; ctx.fill();
    }

    // Render galaxies with frustum culling
    const viewportHalfW = (canvas.width / 2) / scale;
    const viewportHalfH = (canvas.height / 2) / scale;

    for (let i = 0; i < generatedGalaxies.length; i++) {
      const g = generatedGalaxies[i];
      const cx = g.x * ratio;
      const cy = g.y * ratio;

      // Frustum culling
      if (
        cx < -viewportHalfW - 100 || cx > viewportHalfW + 100 ||
        cy < -viewportHalfH - 100 || cy > viewportHalfH + 100
      ) continue;

      const galRadius = (g.size * 30) * ratio;
      const puff = getPuffForColor(g.baseColor);

      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = g.isDead ? 0.2 : 0.9;

      const angle = ((g.x * 12.9898) + (g.y * 78.233)) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.drawImage(puff, -galRadius * 0.8, -galRadius * 0.8, galRadius * 1.6, galRadius * 1.6);
      ctx.restore();

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }, [generatedGalaxies, dimensions, universeAge, numGalaxies]);

  const handleExplore = () => {
    setGalaxies(generatedGalaxies);
    setPhase('exploring');
  };

  const randomizeSeed = () => {
    setRootSeed('COSMOS-' + Math.random().toString(36).substring(2, 8));
  };

  // Age label logic
  const getAgeLabel = (age: number) => {
    if (age < 0.02) return 'Singularidade';
    if (age < 0.1) return 'Big Bang';
    if (age < 0.25) return 'Era Primordial';
    if (age < 0.5) return 'Formação Estelar';
    if (age < 0.7) return 'Era Dourada';
    if (age < 0.9) return 'Decadência';
    return 'Morte Térmica';
  };

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Fullscreen Canvas Background */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full"
      />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />

      {/* Back Button */}
      <button
        onClick={onBackToMenu}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors bg-black/40 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/10 hover:border-white/20"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Menu</span>
      </button>

      {/* Title */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 text-center">
        <h1 className="text-2xl font-black tracking-[0.3em] text-white/90 drop-shadow-lg">
          CRIAÇÃO DO UNIVERSO
        </h1>
        <p className="text-xs text-neutral-400 tracking-widest mt-1 font-mono">
          CONFIGURE OS PARÂMETROS CÓSMICOS
        </p>
      </div>

      {/* Controls Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-8 pt-16 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {/* Seed */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-32 text-right shrink-0">
              Semente
            </label>
            <div className="flex gap-2 flex-1">
              <input
                type="text"
                value={rootSeed}
                onChange={(e) => setRootSeed(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-fuchsia-500/50 transition-colors backdrop-blur-sm"
                placeholder="Enter seed..."
              />
              <button
                onClick={randomizeSeed}
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors"
                title="Randomizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Age Slider */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-32 text-right shrink-0">
              Idade
            </label>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-fuchsia-400 font-mono">{getAgeLabel(universeAge)}</span>
                <span className="text-sm font-mono text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded">
                  {Math.round(universeAge * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={universeAge}
                onChange={(e) => setUniverseAge(parseFloat(e.target.value))}
                className="w-full accent-fuchsia-500 h-2"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 font-medium">
                <span>Singularidade</span>
                <span>Expansão</span>
                <span>Morte Térmica</span>
              </div>
            </div>
          </div>

          {/* Galaxy Count Slider */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-32 text-right shrink-0">
              Galáxias
            </label>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyan-400 font-mono">
                  {numGalaxies < 2000 ? 'Esparso' : numGalaxies < 3500 ? 'Moderado' : 'Denso'}
                </span>
                <span className="text-sm font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">
                  {numGalaxies.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="5000"
                step="100"
                value={numGalaxies}
                onChange={(e) => setNumGalaxies(parseInt(e.target.value))}
                className="w-full accent-cyan-500 h-2"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 font-medium">
                <span>1.000</span>
                <span>3.000</span>
                <span>5.000</span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex gap-6 text-xs text-neutral-500 font-mono">
              <span>Galáxias Visíveis: <span className="text-white font-bold">{generatedGalaxies.length.toLocaleString()}</span></span>
              <span>Estrelas Estimadas: <span className="text-white font-bold">{(generatedGalaxies.reduce((a, g) => a + g.starCount, 0)).toLocaleString()}k</span></span>
            </div>

            {/* EXPLORE Button */}
            <button
              onClick={handleExplore}
              disabled={generatedGalaxies.length === 0}
              className="group flex items-center gap-3 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-fuchsia-900/30 hover:shadow-fuchsia-900/50 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
              EXPLORAR UNIVERSO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
