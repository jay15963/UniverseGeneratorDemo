import { useState, useEffect, useRef } from 'react';
import { PlanetConfig, PlanetType, LayerType } from '../lib/planet-generator/generator';
import { openPlanetSession, PlanetSession } from '../lib/planet-generator/planetClient';

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
  const [session, setSession] = useState<PlanetSession | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleGenerate = () => {
    cancelRef.current?.();
    setIsGenerating(true);
    setProgress(0);
    setStatus('Inicializando...');
    const job = openPlanetSession(config, (p, s) => { setProgress(p); setStatus(s); });
    cancelRef.current = job.cancel;
    job.ready.then(sess => {
      setSession(sess);
      setIsGenerating(false);
    }).catch(() => {});
  };

  // Initial generation + cleanup
  useEffect(() => {
    handleGenerate();
    return () => cancelRef.current?.();
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
    session,
    handleGenerate,
  };
}
