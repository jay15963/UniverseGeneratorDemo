import { useState, useCallback, useRef, useEffect } from 'react';
import { UniverseConfig, UniverseGalaxyMetadata } from '../lib/universe/types';
import { UniverseGenerator } from '../lib/universe/generator';

export function useUniverseController() {
  const [config, setConfig] = useState<UniverseConfig>({
    seed: 'BigBang',
    age: 0.1, // Start young
    maxGalaxies: 3000,
  });

  const [galaxies, setGalaxies] = useState<UniverseGalaxyMetadata[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const generatorRef = useRef<UniverseGenerator | null>(null);

  // Sync / Real-time Generation for Timelapse effect
  useEffect(() => {
     try {
         const gen = new UniverseGenerator(config);
         generatorRef.current = gen;
         setGalaxies(gen.generate());
     } catch (e) {
         console.error("Universe Generation Failed:", e);
     }
  }, [config.age, config.seed, config.maxGalaxies]);

  const handleGenerate = useCallback(() => {
    setIsGenerating(true);
    
    // Use setTimeout to allow UI to render the "Generating" state
    // since building 100k array might block main thread for ~100-300ms.
    setTimeout(() => {
      try {
         const gen = new UniverseGenerator(config);
         generatorRef.current = gen;
         const result = gen.generate();
         setGalaxies(result);
      } catch (e) {
         console.error("Universe Generation Failed:", e);
      } finally {
         setIsGenerating(false);
      }
    }, 50);

  }, [config]);

  return {
    config,
    setConfig,
    galaxies,
    isGenerating,
    handleGenerate,
  };
}
