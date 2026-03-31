import { useState, useEffect, useRef } from 'react';
import { PlanetGenerator, PlanetConfig, PlanetType, LayerType } from '../lib/planet-generator/generator';

export function usePlanetController() {
  const [config, setConfig] = useState<PlanetConfig>({
    seed: 'earth-42',
    width: 2048,
    height: 1024,
    numPlates: 30,
    seaLevel: 0.5,
    baseTemperature: 0.5,
    baseMoisture: 0.5,
    planetSize: 2.0,
    planetType: PlanetType.EARTH_LIKE,
    craterDensity: 0.5,
    surfaceHue: 'gray',
    dustStormIntensity: 0.3,
    cloudDensity: 0.6,
    volcanicActivity: 0.4,
    iceFractureDensity: 0.5,
    bandContrast: 0.6,
    stormFrequency: 0.4,
    colorPalette: 'jovian',
    vegetationHue: 'purple',
    waterHue: 'green',
    crustAge: 0.5,
    islandDensity: 0.1,
    lineaeDensity: 0.5,
    iceThickness: 0.6,
    starIntensity: 0.7,
    twilightWidth: 0.3,
    crystalDensity: 0.4,
    hydrocarbonLakes: 0.3,
    bioluminescence: 0.5,
    waterLevel: 0.6,
    ashDepth: 0.5,
    emberActivity: 0.3,
  });

  const [layer, setLayer] = useState<LayerType>(LayerType.FINAL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generatorRef = useRef<PlanetGenerator | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress(0);
    setStatus('Initializing...');
    
    // Use setTimeout to allow UI to update
    setTimeout(async () => {
      const generator = new PlanetGenerator(config);
      generatorRef.current = generator;
      
      await generator.generate((p, s) => {
        setProgress(p);
        setStatus(s);
      });
      
      renderLayer(layer);
      setIsGenerating(false);
    }, 50);
  };

  const renderLayer = (l: LayerType) => {
    if (!generatorRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    generatorRef.current.render(ctx, l);
  };

  useEffect(() => {
    renderLayer(layer);
  }, [layer]);

  // Initial generation
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    config,
    setConfig,
    layer,
    setLayer,
    isGenerating,
    progress,
    status,
    canvasRef,
    handleGenerate,
    generatorRef,
  };
}
