import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const MobileToggle = () => (
    <button 
      onClick={toggleSidebar}
      className="lg:hidden fixed bottom-6 right-6 z-[60] bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95"
    >
      {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </button>
  );

  const SidebarContainer = ({ children }: { children: React.ReactNode }) => (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={closeSidebar}
        />
      )}
      
      {/* Sidebar Drawer */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-[280px] sm:w-[320px] lg:w-auto lg:col-span-1
        transform lg:transform-none transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        bg-neutral-900 lg:bg-transparent shadow-2xl lg:shadow-none
        flex flex-col h-full lg:h-auto overflow-y-auto lg:overflow-visible
      `}>
        {children}
      </div>
    </>
  );

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
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative p-4 lg:p-6">
          <MobileToggle />
          <SidebarContainer>
            <UniverseSidebar 
              config={universeCtrl.config}
              setConfig={universeCtrl.setConfig}
              isGenerating={universeCtrl.isGenerating}
              handleGenerate={universeCtrl.handleGenerate}
              onBackToMenu={() => { closeSidebar(); setCurrentView('menu'); }}
            />
          </SidebarContainer>
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
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative p-4 lg:p-6">
          <MobileToggle />
          <SidebarContainer>
            <SolarSystemSidebar 
              config={config}
              setConfig={setConfig}
              isGenerating={isGenerating}
              handleGenerate={handleGenerate}
              onBackToMenu={() => { closeSidebar(); setCurrentView('menu'); }}
              showZones={showZones}
              setShowZones={setShowZones}
            />
          </SidebarContainer>
          <SolarSystemViewer bodies={bodies} showZones={showZones} systemAge={config.systemAge} />
        </div>
      </div>
    );
  }

  if (currentView === 'galaxy-generator') {
    return (
      <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 font-sans">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 relative p-4 lg:p-6">
          <MobileToggle />
          <SidebarContainer>
            <GalaxySidebar 
              config={galaxyCtrl.config}
              setConfig={galaxyCtrl.setConfig}
              layer={galaxyCtrl.layer}
              setLayer={galaxyCtrl.setLayer}
              isGenerating={galaxyCtrl.isGenerating}
              handleGenerate={galaxyCtrl.handleGenerate}
              onBackToMenu={() => { closeSidebar(); setCurrentView('menu'); }}
              galaxyName={galaxyCtrl.galaxyName}
            />
          </SidebarContainer>
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
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 lg:p-6 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        <MobileToggle />
        
        {/* Sidebar Controls (View) */}
        <SidebarContainer>
          <Sidebar 
            config={planetCtrl.config}
            setConfig={planetCtrl.setConfig}
            layer={planetCtrl.layer}
            setLayer={planetCtrl.setLayer}
            isGenerating={planetCtrl.isGenerating}
            handleGenerate={planetCtrl.handleGenerate}
            onBackToMenu={() => { closeSidebar(); setCurrentView('menu'); }}
          />
        </SidebarContainer>

        {/* Main View Area */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="h-[400px] sm:h-[600px] lg:h-auto">
            <MapViewer 
              layer={planetCtrl.layer}
              config={planetCtrl.config}
              isGenerating={planetCtrl.isGenerating}
              progress={planetCtrl.progress}
              status={planetCtrl.status}
              canvasRef={planetCtrl.canvasRef}
              generatorRef={planetCtrl.generatorRef}
            />
          </div>
          <PlanetStats config={planetCtrl.config} />
        </div>

      </div>
    </div>
  );
}
