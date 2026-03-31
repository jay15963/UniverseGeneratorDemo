import React, { useState } from 'react';
import { usePlanetController } from './hooks/usePlanetController';
import { useSolarSystemController } from './hooks/useSolarSystemController';
import { useGalaxyController } from './hooks/useGalaxyController';
import { Sidebar } from './components/Sidebar';
import { MapViewer } from './components/MapViewer';
import { PlanetStats } from './components/PlanetStats';
import { MainMenu } from './components/MainMenu';
import { SolarSystemSidebar } from './components/SolarSystem/SolarSystemSidebar';
import { SolarSystemViewer } from './components/SolarSystem/SolarSystemViewer';
import { GalaxySidebar } from './components/Galaxy/GalaxySidebar';
import { GalaxyViewer } from './components/Galaxy/GalaxyViewer';

import { UniverseSidebar } from './components/Universe/UniverseSidebar';
import { UniverseViewer } from './components/Universe/UniverseViewer';
import { useUniverseController } from './hooks/useUniverseController';
import { GameApplication } from './components/Game/GameApplication';

export default function App() {
  const { config, setConfig, bodies, isGenerating, handleGenerate, showZones, setShowZones } = useSolarSystemController();
  
  const [currentView, setCurrentView] = useState<'menu' | 'game' | 'planet-generator' | 'system-generator' | 'galaxy-generator' | 'universe-generator'>('menu');

  // Controllers
  const planetCtrl = usePlanetController();
  const solarSystemCtrl = useSolarSystemController();
  const galaxyCtrl = useGalaxyController();
  const universeCtrl = useUniverseController();

  if (currentView === 'menu') {
    return (
      <MainMenu 
        onStart={() => setCurrentView('planet-generator')} 
        onSolarSystemStart={() => setCurrentView('system-generator')} 
        onGalaxyStart={() => setCurrentView('galaxy-generator')}
        onUniverseStart={() => setCurrentView('universe-generator')}
        onPlay={() => setCurrentView('game')}
      />
    );
  }

  if (currentView === 'game') {
    return <GameApplication onBackToMenu={() => setCurrentView('menu')} />;
  }

  if (currentView === 'universe-generator') {
    return (
      <div className="min-h-screen bg-black text-neutral-100 p-6 font-sans">
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
          <UniverseSidebar 
            config={universeCtrl.config}
            setConfig={universeCtrl.setConfig}
            isGenerating={universeCtrl.isGenerating}
            handleGenerate={universeCtrl.handleGenerate}
            onBackToMenu={() => setCurrentView('menu')}
          />
          <UniverseViewer 
             galaxies={universeCtrl.galaxies} 
             config={universeCtrl.config}
             onEnterGalaxy={(sysConfig) => {
                 galaxyCtrl.setConfig(prev => ({...prev, ...sysConfig}));
                 setCurrentView('galaxy-generator');
                 // Trigger generation immediately
                 setTimeout(() => galaxyCtrl.handleGenerate(), 100);
             }} 
          />
        </div>
      </div>
    );
  }

  if (currentView === 'system-generator') {
    return (
      <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 font-sans">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
          <SolarSystemSidebar 
            config={config}
            setConfig={setConfig}
            isGenerating={isGenerating}
            handleGenerate={handleGenerate}
            onBackToMenu={() => setCurrentView('menu')}
            showZones={showZones}
            setShowZones={setShowZones}
          />
          <SolarSystemViewer bodies={bodies} showZones={showZones} systemAge={config.systemAge} />
        </div>
      </div>
    );
  }

  if (currentView === 'galaxy-generator') {
    return (
      <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 font-sans">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
          <GalaxySidebar 
            config={galaxyCtrl.config}
            setConfig={galaxyCtrl.setConfig}
            layer={galaxyCtrl.layer}
            setLayer={galaxyCtrl.setLayer}
            isGenerating={galaxyCtrl.isGenerating}
            handleGenerate={galaxyCtrl.handleGenerate}
            onBackToMenu={() => setCurrentView('menu')}
            galaxyName={galaxyCtrl.galaxyName}
          />
          <GalaxyViewer 
             stars={galaxyCtrl.stars} 
             layer={galaxyCtrl.layer} 
             config={galaxyCtrl.config}
             onEnterSystem={(sysConfig) => {
                 setConfig(sysConfig);
                 setCurrentView('system-generator');
                 // Trigger generation immediately
                 setTimeout(() => handleGenerate(), 100);
             }} 
          />
        </div>
      </div>
    );
  }

  // Planet Generator View (currentView === 'planet-generator')
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar Controls (View) */}
        <Sidebar 
          config={planetCtrl.config}
          setConfig={planetCtrl.setConfig}
          layer={planetCtrl.layer}
          setLayer={planetCtrl.setLayer}
          isGenerating={planetCtrl.isGenerating}
          handleGenerate={planetCtrl.handleGenerate}
          onBackToMenu={() => setCurrentView('menu')}
        />

        {/* Main View Area */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <MapViewer 
            layer={planetCtrl.layer}
            config={planetCtrl.config}
            isGenerating={planetCtrl.isGenerating}
            progress={planetCtrl.progress}
            status={planetCtrl.status}
            canvasRef={planetCtrl.canvasRef}
            generatorRef={planetCtrl.generatorRef}
          />
          <PlanetStats config={planetCtrl.config} />
        </div>

      </div>
    </div>
  );
}
