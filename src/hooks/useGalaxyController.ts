import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  GalaxyConfig, 
  StellarSystemMetadata, 
  GalaxyShape, 
  GalaxyLayer 
} from '../lib/galaxy/types';
import { GalaxyGenerator } from '../lib/galaxy/generator';

export function useGalaxyController() {
  const [config, setConfig] = useState<GalaxyConfig>({
    seed: Math.random().toString(36).substring(2, 8),
    shape: GalaxyShape.SPIRAL,
    age: 0.5,
    numStars: 2500,       // Default
    anomalyFactor: 0.5,
    radius: 400           // Base rendering radius logically
  });

  const [stars, setStars] = useState<StellarSystemMetadata[]>([]);
  const [layer, setLayer] = useState<GalaxyLayer>(GalaxyLayer.SYSTEM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [galaxyName, setGalaxyName] = useState('');
  
  const generatorRef = useRef<GalaxyGenerator | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleGenerate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsGenerating(true);
    
    // Slight delay to handle slider movement smoothly
    timerRef.current = setTimeout(() => {
      const generator = new GalaxyGenerator(config);
      generatorRef.current = generator;
      
      const newStars = generator.generate();
      setStars(newStars);
      setGalaxyName(generator.galaxyName);
      
      setIsGenerating(false);
    }, 60); // Slightly more delay for galaxy as it's a bit heavier (2500 stars)
  }, [config]);

  // Fully Reactive generation
  useEffect(() => {
    handleGenerate();
  }, [
    config.age, 
    config.seed, 
    config.shape, 
    config.numStars, 
    config.anomalyFactor
  ]);

  return {
    config,
    setConfig,
    stars,
    layer,
    setLayer,
    isGenerating,
    handleGenerate,
    generatorRef,
    galaxyName
  };
}
