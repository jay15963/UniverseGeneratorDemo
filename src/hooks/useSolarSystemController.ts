import { useState, useRef, useCallback, useEffect } from 'react';
import { SolarSystemConfig, CelestialBody } from '../lib/solar-system/types';
import { SolarSystemGenerator } from '../lib/solar-system/generator';

export function useSolarSystemController() {
  const [config, setConfig] = useState<SolarSystemConfig>({
    seed: Math.random().toString(36).substring(2, 8),
    systemAge: 0.5,
    starClass: 'G',
    isBinary: false,
    numPlanets: 8,
    rockyPercentage: 0.5,
    lifeChance: 0.1,
    numMoons: 15,
    numAsteroidBelts: 1
  });

  const [bodies, setBodies] = useState<CelestialBody[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const generatorRef = useRef<SolarSystemGenerator | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleGenerate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsGenerating(true);
    
    // Small delay to keep UI responsive during slider dragging
    timerRef.current = setTimeout(() => {
      const generator = new SolarSystemGenerator(config);
      generatorRef.current = generator;
      
      const newBodies = generator.generateSystem();
      setBodies(newBodies);
      
      setIsGenerating(false);
    }, 40);
  }, [config]);

  // Fully Reactive generation
  useEffect(() => {
    handleGenerate();
  }, [
    config.systemAge, 
    config.seed, 
    config.starClass, 
    config.isBinary, 
    config.numPlanets, 
    config.rockyPercentage, 
    config.lifeChance, 
    config.numMoons, 
    config.numAsteroidBelts
  ]);

  return {
    config,
    setConfig,
    bodies,
    isGenerating,
    handleGenerate,
    showZones,
    setShowZones
  };
}
