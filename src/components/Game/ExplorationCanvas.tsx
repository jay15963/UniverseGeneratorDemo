import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameEngine } from '../../stores/useGameEngine';
import { UniverseViewer } from '../Universe/UniverseViewer';
import { GalaxyViewer } from '../Galaxy/GalaxyViewer';
import { SolarSystemViewer } from '../SolarSystem/SolarSystemViewer';
import { GalaxyGenerator } from '../../lib/galaxy/generator';
import { SolarSystemGenerator } from '../../lib/solar-system/generator';
import { GalaxyConfig, GalaxyLayer } from '../../lib/galaxy/types';
import { ChevronLeft, Home, Map } from 'lucide-react';

interface ExplorationCanvasProps {
  onBackToMenu: () => void;
}

export function ExplorationCanvas({ onBackToMenu }: ExplorationCanvasProps) {
  const currentLevel = useGameEngine(s => s.currentLevel);
  const galaxies = useGameEngine(s => s.galaxies);
  const universeAge = useGameEngine(s => s.universeAge);
  const numGalaxies = useGameEngine(s => s.numGalaxies);
  const rootSeed = useGameEngine(s => s.rootSeed);
  const navigationStack = useGameEngine(s => s.navigationStack);
  const isTransitioning = useGameEngine(s => s.isTransitioning);

  const activeGalaxyMeta = useGameEngine(s => s.activeGalaxyMeta);
  const galaxyStars = useGameEngine(s => s.galaxyStars);
  const galaxyConfig = useGameEngine(s => s.galaxyConfig);
  const setGalaxyScene = useGameEngine(s => s.setGalaxyScene);

  const activeStarMeta = useGameEngine(s => s.activeStarMeta);
  const systemBodies = useGameEngine(s => s.systemBodies);
  const systemConfig = useGameEngine(s => s.systemConfig);
  const setSystemScene = useGameEngine(s => s.setSystemScene);

  const enterGalaxy = useGameEngine(s => s.enterGalaxy);
  const enterSystem = useGameEngine(s => s.enterSystem);
  const goBack = useGameEngine(s => s.goBack);
  const resetGame = useGameEngine(s => s.resetGame);

  const [galaxyLayer, setGalaxyLayer] = useState<GalaxyLayer>(GalaxyLayer.SYSTEM);

  // =============================================
  // Auto-generate Galaxy data when entering a galaxy
  // =============================================
  useEffect(() => {
    if (currentLevel !== 'galaxy' || !activeGalaxyMeta) return;
    
    // If we already have stars for this galaxy, skip
    if (galaxyStars.length > 0 && galaxyConfig?.seed === activeGalaxyMeta.galaxySeed) return;

    const config: GalaxyConfig = {
      seed: activeGalaxyMeta.galaxySeed,
      shape: activeGalaxyMeta.shape,
      age: activeGalaxyMeta.age,
      numStars: Math.min(activeGalaxyMeta.starCount, 5000), // Performance cap
      anomalyFactor: 0.5,
      radius: 400,
    };

    const generator = new GalaxyGenerator(config);
    const stars = generator.generate();
    setGalaxyScene(activeGalaxyMeta, stars, config);
  }, [currentLevel, activeGalaxyMeta]);

  // =============================================
  // Auto-generate System data when entering a system
  // =============================================
  useEffect(() => {
    if (currentLevel !== 'system' || !activeStarMeta) return;
    
    // If we already have bodies for this system, skip
    if (systemBodies.length > 0 && systemConfig?.seed === activeStarMeta.config.seed) return;

    const config = activeStarMeta.config;
    const generator = new SolarSystemGenerator(config);
    const bodies = generator.generateSystem();
    setSystemScene(activeStarMeta, bodies, config);
  }, [currentLevel, activeStarMeta]);

  // =============================================
  // Build breadcrumb
  // =============================================
  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; onClick: () => void }[] = [];

    // Home is always first
    crumbs.push({
      label: 'Universo',
      onClick: () => {
        if (currentLevel !== 'universe') {
          // Reset back to universe
          resetGame();
          // Re-enter exploring
          useGameEngine.getState().setPhase('exploring');
        }
      }
    });

    if (activeGalaxyMeta && (currentLevel === 'galaxy' || currentLevel === 'system')) {
      crumbs.push({
        label: activeGalaxyMeta.name,
        onClick: () => {
          if (currentLevel === 'system') {
            goBack();
          }
        }
      });
    }

    if (activeStarMeta && currentLevel === 'system') {
      crumbs.push({
        label: activeStarMeta.name,
        onClick: () => {} // Current level
      });
    }

    return crumbs;
  }, [currentLevel, activeGalaxyMeta, activeStarMeta]);

  // LOD Level labels
  const levelLabels: Record<string, string> = {
    universe: 'VISÃO UNIVERSAL',
    galaxy: 'VISÃO GALÁCTICA',
    system: 'SISTEMA SOLAR'
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* ===== TOP HUD BAR ===== */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/90 via-black/60 to-transparent pointer-events-none" style={{ minHeight: '48px' }}>
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Back button */}
          {currentLevel !== 'universe' && !isTransitioning && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
          )}

          {/* Menu button */}
          <button
            onClick={() => { resetGame(); onBackToMenu(); }}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-sm"
          >
            <Home className="w-3.5 h-3.5" />
            Menu
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 ml-3 text-xs font-mono">
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-neutral-600 mx-1">›</span>}
                <button
                  onClick={c.onClick}
                  className={`transition-colors ${
                    i === breadcrumbs.length - 1
                      ? 'text-white font-bold'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {c.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Level indicator */}
        <div className="pointer-events-none">
          <span className="text-[10px] font-bold tracking-[0.25em] text-fuchsia-400/70 bg-fuchsia-500/10 px-3 py-1 rounded-full border border-fuchsia-500/20">
            {levelLabels[currentLevel] || currentLevel.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ===== SCENE CONTENT ===== */}
      <div className={`flex-1 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {currentLevel === 'universe' && (
          <div className="w-full h-full [&>div>div:first-child]:top-14">
            <UniverseViewer
              galaxies={galaxies}
              config={{ seed: rootSeed, age: universeAge, maxGalaxies: numGalaxies }}
              onEnterGalaxy={(partialConfig) => {
                // Find the matching galaxy by seed
                const targetGalaxy = galaxies.find(g => g.galaxySeed === partialConfig.seed);
                if (targetGalaxy) {
                  enterGalaxy(targetGalaxy);
                }
              }}
            />
          </div>
        )}

        {currentLevel === 'galaxy' && galaxyConfig && (
          <div className="w-full h-full [&>div>div:first-child]:top-14">
            <GalaxyViewer
              stars={galaxyStars}
              layer={galaxyLayer}
              config={galaxyConfig}
              onEnterSystem={(sysConfig) => {
                // Find the star metadata matching this config seed
                const targetStar = galaxyStars.find(s => s.config.seed === sysConfig.seed);
                if (targetStar) {
                  enterSystem(targetStar);
                }
              }}
            />
          </div>
        )}

        {currentLevel === 'system' && systemConfig && (
          <div className="w-full h-full bg-black">
            <SolarSystemViewer
              bodies={systemBodies}
              showZones={false}
              systemAge={systemConfig.systemAge}
            />
          </div>
        )}
      </div>
    </div>
  );
}
