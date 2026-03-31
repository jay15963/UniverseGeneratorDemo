import React, { useEffect, useRef, useState } from 'react';
import { StellarSystemMetadata, GalaxyLayer, GalaxyConfig } from '../../lib/galaxy/types';
import { ZoomIn, ZoomOut, Crosshair, Map as MapIcon, Info, ChevronRight, AlertTriangle } from 'lucide-react';
import { GalaxyLegend } from './GalaxyLegend';

const createPuff = (rgb: string) => {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;
    const c = cvs.getContext('2d');
    if (c) {
       const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
       grad.addColorStop(0, `${rgb}0.15)`);
       grad.addColorStop(0.3, `${rgb}0.08)`);
       grad.addColorStop(0.6, `${rgb}0.02)`);
       grad.addColorStop(1, `${rgb}0)`);
       c.fillStyle = grad;
       c.fillRect(0, 0, 128, 128);
    }
    return cvs;
};

// Cache singleton de texturas de fumaça cósmica para altíssima performance Canvas
const PUFFS = {
   blue: createPuff('rgba(60, 130, 255, '),
   orange: createPuff('rgba(255, 120, 50, '),
   purple: createPuff('rgba(150, 50, 255, '),
   pink: createPuff('rgba(255, 50, 150, ')
};

interface GalaxyViewerProps {
   stars: StellarSystemMetadata[];
   layer: GalaxyLayer;
   config: GalaxyConfig;
   onEnterSystem: (config: any) => void;
}

export function GalaxyViewer({ stars, layer, config, onEnterSystem }: GalaxyViewerProps) {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const hudCanvasRef = useRef<HTMLCanvasElement>(null);
   const containerRef = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(1);
   const [offset, setOffset] = useState({ x: 0, y: 0 });
   const [isDragging, setIsDragging] = useState(false);
   const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
   const pointerDownPos = useRef({ x: 0, y: 0 });
   const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
   const lastPinchDistance = useRef<number | null>(null);
   const [hoveredStar, setHoveredStar] = useState<StellarSystemMetadata | null>(null);
   const [selectedStar, setSelectedStar] = useState<StellarSystemMetadata | null>(null);
   const [dimensions, setDimensions] = useState({ w: 1200, h: 800 });

   // Logical space based on the generator radius. We add padding so the edges aren't touching canvas borders.
   const LOGICAL_RADIUS = config.radius * 1.5;

   // Track parent container resize to dynamically resize canvas and eliminate black bars
   useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver((entries) => {
         const { width, height } = entries[0].contentRect;
         if (width > 0 && height > 0) {
            setDimensions({ w: width, h: height });
         }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
   }, []);

   useEffect(() => {
      // Reset pan/zoom when a new galaxy is generated
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setSelectedStar(null);
   }, [stars.length]); // Only reset if number of stars change (new gen)

   // -- Render Loop --
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background clearing
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();

      // Apply Transform for Pan & Zoom (Center origin)
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(scale, scale);

      // Calcular o Ratio o mais cedo possível, pois as Nebulosas também usam coordenadas mapeadas agora
      const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

      // Render Stars

      const colorGroups: Record<string, { x: number, y: number, size: number }[]> = {};
      const outlineGroups: Record<string, { x: number, y: number, size: number }[]> = {}; // for BH strokes

      stars.forEach(star => {
         const cx = star.x * ratio;
         const cy = star.y * ratio;

         let renderColor = star.baseColor;

         // FORÇAR O MESMO TAMANHO PARA TODAS AS ESTRELAS (Exceto anomalias muito específicas)
         let renderSize = 1.0;
         if (star.id === 'SMBH') {
            renderSize = 6.0;
         }

         // Layer overrides
         if (layer === GalaxyLayer.HABITABILITY) {
            if (star.isDeadZone) {
               renderColor = '#ff2222'; // Danger red
               renderSize = star.id === 'SMBH' ? 6.0 : 1.2;
            } else if (star.habitability > 0.6) {
               // Green sweet spot
               const val = Math.floor(star.habitability * 255);
               renderColor = `rgb(50, ${val}, 50)`;
            } else if (star.habitability < 0.2) {
               // Edges / Deep core
               if (Math.abs(star.x) < config.radius * 0.3 && Math.abs(star.y) < config.radius * 0.3) {
                  renderColor = '#ff5500'; // Hot core
               } else {
                  renderColor = '#555555'; // Cold edges
               }
            } else {
               renderColor = '#aaaaaa'; // Mid
            }
         }
         else if (layer === GalaxyLayer.STAR_TYPE) {
            const typeColors: Record<string, string> = {
               'O': '#43b6f8ff', 'B': '#9cc5faff', 'A': '#cad7ff', 'F': '#f8f7ff',
               'G': '#facea4ff', 'K': '#fc3030ff', 'M': '#fa7641ff',
               'BH': '#000000', 'NS': '#00eeffff', 'P': '#935ffcff'
            };
            renderColor = typeColors[star.starClass] || '#ffffff';
            // NS and Pulsars outline
            if (['NS', 'P'].includes(star.starClass)) {
               if (!outlineGroups['#444']) outlineGroups['#444'] = [];
               outlineGroups['#444'].push({ x: cx, y: cy, size: renderSize / scale });
            }
         }
         else if (layer === GalaxyLayer.DANGER) {
            if (star.isDeadZone || ['BH', 'NS', 'P'].includes(star.starClass)) {
               renderColor = star.starClass === 'BH' ? '#000' : '#ff0055';
               renderSize = star.id === 'SMBH' ? 6.0 : 2.0; // Emphasize
               if (['NS', 'P'].includes(star.starClass)) {
                  if (!outlineGroups['#ff0000']) outlineGroups['#ff0000'] = [];
                  outlineGroups['#ff0000'].push({ x: cx, y: cy, size: renderSize / scale });
               }
            } else {
               renderColor = 'rgba(50, 50, 50, 0.2)'; // Hide rest
            }
         }

         // Pular buracos negros comuns aqui para o render especial no final
         if (star.starClass === 'BH') return;

         // Desenhando: agrupamos por cor para desenhar em Batch.
         // O tamanho base não é menor que 0.8 / scale para que pontinhos nunca desapareçam totalmente de tao finos
         const finalSize = Math.max(0.6 / scale, renderSize / scale);

         if (!colorGroups[renderColor]) colorGroups[renderColor] = [];
         colorGroups[renderColor].push({ x: cx, y: cy, size: finalSize });
      });

      // RENDER: Usando Batch Path Rendering. 
      // Em vez de 10.000 chamadas pesadas, disparamos apenas um beginPath + fill por cor exclusiva da paleta inteira!
      for (const color in colorGroups) {
         ctx.fillStyle = color;
         ctx.beginPath();
         for (const pt of colorGroups[color]) {
            ctx.moveTo(pt.x + pt.size, pt.y);
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
         }
         ctx.fill();
      }

      // Strokes para BH/Danger
      for (const color in outlineGroups) {
         ctx.strokeStyle = color;
         ctx.lineWidth = 1.5 / scale;
         ctx.beginPath();
         for (const pt of outlineGroups[color]) {
            ctx.moveTo(pt.x + pt.size, pt.y);
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
         }
         ctx.stroke();
      }

      // Passagem especial para TODOS os Buracos Negros com Disco de Acreção (Escalam via Zoom)
      const blackHoles = stars.filter(s => s.starClass === 'BH');
      blackHoles.forEach(bh => {
         // Hide normal BHs if Danger layer is active and they aren't meant to be highlighted
         if (layer === GalaxyLayer.DANGER && !bh.isDeadZone && !['BH'].includes(bh.starClass)) return;

         const cx = bh.x * ratio;
         const cy = bh.y * ratio;
         // Múltiplo do tamanho em relação à estrela comum (que tem tamanho base 1.0)
         let multiplier = 1.0;
         if (bh.id === 'SMBH') multiplier = 4.0;
         else if (bh.size === 2.0) multiplier = 2.0;

         // Dividir pelo scale impede que os buracos negros fiquem gigantes ao dar zoom in
         // Isso garante que eles tenham SEMPRE a proporção extata exigida: 4x, 2x ou 1x o tamanho do PIXEL de uma estrela.
         const bhSize = Math.max(0.6 / scale, multiplier / scale);

         ctx.save();
         ctx.translate(cx, cy);
         // Consistent random-looking rotation based on their coordinates
         ctx.rotate((Math.abs(bh.x * 100)) % (Math.PI * 2));

         // Accretion disk
         ctx.beginPath();
         ctx.ellipse(0, 0, bhSize * 4, bhSize * 1.5, 0, 0, Math.PI * 2);
         const grad = ctx.createRadialGradient(0, 0, bhSize, 0, 0, bhSize * 4);
         grad.addColorStop(0, 'rgba(255, 200, 100, 0.9)');
         grad.addColorStop(0.4, 'rgba(200, 50, 100, 0.5)');
         grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
         ctx.fillStyle = grad;
         ctx.fill();

         // Event Horizon
         ctx.beginPath();
         ctx.arc(0, 0, bhSize, 0, Math.PI * 2);
         ctx.fillStyle = '#000000';
         ctx.fill();

         // Fixed 1px outline regardless of zoom so it stays sharp
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
         ctx.lineWidth = 1 / scale;
         ctx.stroke();

         ctx.restore();
      });

      // Render "Smoky" Background Nebula ON TOP of stars & BHs (hides them with gas until zoomed in)
      if (layer === GalaxyLayer.SYSTEM && stars.length > 0) {
         renderNebulaBackground(ctx, ratio);
      }

      ctx.restore();
   }, [stars, layer, scale, offset, config.radius, dimensions.w, dimensions.h]);

   // -- HUD Render Loop (Extremely Fast, only runs for hovered/selected) --
   useEffect(() => {
      const canvas = hudCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(scale, scale);

      const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

      [hoveredStar, selectedStar].forEach(star => {
         if (!star) return;
         const cx = star.x * ratio;
         const cy = star.y * ratio;

         ctx.strokeStyle = star === selectedStar ? '#fff' : '#aaa';
         ctx.lineWidth = 2 / scale;
         ctx.beginPath();
         ctx.moveTo(cx - 10 / scale, cy); ctx.lineTo(cx + 10 / scale, cy);
         ctx.moveTo(cx, cy - 10 / scale); ctx.lineTo(cx, cy + 10 / scale);
         ctx.stroke();
         ctx.beginPath();
         ctx.arc(cx, cy, 6 / scale, 0, Math.PI * 2);
         ctx.stroke();
      });

      ctx.restore();
   }, [hoveredStar, selectedStar, scale, offset, config.radius, dimensions.w, dimensions.h]);

   const renderNebulaBackground = (ctx: CanvasRenderingContext2D, ratio: number) => {
      // Background central bem tênue para não ter vazios profundos (Fallback)
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, LOGICAL_RADIUS);
      // Fades central fallback glow based on age
      const bgAlpha = Math.max(0, 0.05 * (1 - Math.max(0, config.age - 0.7) * 3));
      rg.addColorStop(0, `rgba(255, 230, 200, ${bgAlpha})`);
      rg.addColorStop(0.3, `rgba(150, 100, 200, ${bgAlpha * 0.4})`);
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(-LOGICAL_RADIUS * 2, -LOGICAL_RADIUS * 2, LOGICAL_RADIUS * 4, LOGICAL_RADIUS * 4);

      if (stars.length === 0) return;

      ctx.save();
      // O modo Textura/Screen ignora fundos escuros e apenas adiciona luminosidade neon
      ctx.globalCompositeOperation = 'screen';
      
      // Realismo: Nebulosas só são vistas inteiras de muito longe. Quando se dá zoom (escala > 1x), 
      // a opacidade cai gradativamente para não tampar a visão das estrelas singulares.
      // Em 6x de zoom elas ficam 100% invisíveis, permitindo que a GPU respire.
      let baseOpacity = Math.max(0, 1 - ((scale - 1) / 5)); 
      
      // Galáxias Velhas consomem polvo/poeira. Acima de 0.8 age, despenca para a escuridão absoluta.
      if (config.age > 0.8) {
         baseOpacity *= Math.max(0, 1 - ((config.age - 0.8) * 5)); // fading to 0 by 0.9+
      }
      
      const opacityTarget = baseOpacity;
      ctx.globalAlpha = opacityTarget;
      
      if (opacityTarget > 0.01) {
         // Sub-Amostragem inteligente: NUNCA rodar para 10.000 astros, apenas ~350 chaves estruturais.
         // Como os pontos seguem o exato desenho em espiral matematicão, os ~350 puffs formam braços perfeitos.
         const step = Math.max(1, Math.floor(stars.length / 350));
         
         for (let i = 0; i < stars.length; i += step) {
             const star = stars[i];
             const cx = star.x * ratio;
             const cy = star.y * ratio;
             
             // Aproximação normalizada pro centro (0.0 até 1.0)
             const distSq = star.x*star.x + star.y*star.y;
             const normDist = Math.sqrt(distSq) / config.radius;

             // Color structure: Núcleo (Core) é Laranja/Rosso brilhante, e Braços são Azulados/Violetas
             let puff = PUFFS.blue;
             
             if (star.isDeadZone) {
                puff = PUFFS.purple;
             } else if (config.age < 0.3) {
                // Jovem: Predominantemente poeira quente vermelha/laranja
                puff = (i % 3 === 0) ? PUFFS.pink : PUFFS.orange;
             } else {
                if (normDist < 0.25) puff = PUFFS.orange;
                else if (normDist < 0.4) puff = (i % 2 === 0) ? PUFFS.orange : PUFFS.pink;
             }

             // Variação de tamanho estática pseudo-aleatória por índice
             const puffSize = 100 + ((i * 13) % 250); // Mínimo 100px, máx 350px raio de fumaça
             
             // Desenhar direto a textura pre-calculada na posição X e Y
             ctx.drawImage(puff, cx - puffSize/2, cy - puffSize/2, puffSize, puffSize);
         }
      }
      ctx.restore();
   };

   const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const newScale = Math.max(0.2, Math.min(20, scale - e.deltaY * zoomSensitivity));
      applyZoom(newScale);
   };

   const applyZoom = (newScale: number) => {
      setScale(newScale);
      if (selectedStar) {
         const ratio = (Math.min(canvasRef.current?.width || 1200, canvasRef.current?.height || 800) / 2) / LOGICAL_RADIUS;
         setOffset({
            x: -(selectedStar.x * ratio) * newScale,
            y: -(selectedStar.y * ratio) * newScale
         });
      }
   };

   const handlePointerDown = (e: React.PointerEvent) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size === 1) {
         setIsDragging(true);
         setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
         pointerDownPos.current = { x: e.clientX, y: e.clientY };
      } else if (activePointers.current.size === 2) {
         setIsDragging(false);
         const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
         lastPinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      }
   };

   const handlePointerMove = (e: React.PointerEvent) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size === 2 && lastPinchDistance.current !== null) {
         const points = Array.from(activePointers.current.values()) as { x: number, y: number }[];
         const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
         const delta = distance / lastPinchDistance.current;
         
         const newScale = Math.max(0.2, Math.min(20, scale * delta));
         applyZoom(newScale);
         lastPinchDistance.current = distance;
         return;
      }

      if (isDragging) {
         setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
         });
         // Clear hover while panning
         if (hoveredStar) setHoveredStar(null);
         return;
      }

      // Hit test
      if (stars.length === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Convert DOM coords to Canvas coords (factoring in canvas actual resolution)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // Convert Canvas to Logical (Undo translate and scale)
      const logicalX = (mouseX - (canvas.width / 2 + offset.x)) / scale;
      const logicalY = (mouseY - (canvas.height / 2 + offset.y)) / scale;

      const ratio = (Math.min(canvas.width, canvas.height) / 2) / LOGICAL_RADIUS;

      // Find closest star
      let closest: StellarSystemMetadata | null = null;
      let mindistSq = Infinity;

      // Fast bounds check distance
      const hitRadius = 15 / scale; // Screen-space hit box
      const hitRadiusSq = hitRadius * hitRadius;

      for (let i = 0; i < stars.length; i++) {
         const star = stars[i];
         const cx = star.x * ratio;
         const cy = star.y * ratio;

         // Quick bounding box reject
         if (Math.abs(cx - logicalX) > hitRadius || Math.abs(cy - logicalY) > hitRadius) continue;

         const distSq = (cx - logicalX) * (cx - logicalX) + (cy - logicalY) * (cy - logicalY);
         if (distSq < hitRadiusSq && distSq < mindistSq) {
            mindistSq = distSq;
            closest = star;
         }
      }

      setHoveredStar(closest);
   };

   const handlePointerUp = (e: React.PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size < 2) {
         lastPinchDistance.current = null;
      }

      // Detect if this was a click (not a drag) using distance threshold
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      const wasClick = Math.sqrt(dx * dx + dy * dy) < 5; // Less than 5px = click

      setIsDragging(false);
      if (wasClick && hoveredStar) {
         setSelectedStar(hoveredStar);
      }
   };

   // -- Celestial Body Info Descriptions --
   const getCelestialInfo = (star: StellarSystemMetadata): { name: string; type: string; emoji: string; description: string; color: string } => {
      const dist = Math.sqrt(star.x * star.x + star.y * star.y);
      const normDist = dist / config.radius;

      if (star.id === 'SMBH') {
         return {
            name: star.name,
            type: 'Supermassive Black Hole',
            emoji: '🕳️',
            color: '#ff6b35',
            description: `The cosmic titan at the heart of this galaxy. With a mass equivalent to millions of suns compressed into a singularity smaller than our solar system, ${star.name} bends the very fabric of spacetime around it. Its colossal accretion disk radiates with the fury of a trillion stars, while jets of superheated plasma scream outward at nearly the speed of light. Every star, every planet, every atom in this galaxy dances to its gravitational symphony — an ancient, invisible conductor orchestrating the birth and death of worlds across billions of years.`
         };
      }

      if (star.starClass === 'BH') {
         if (normDist < 0.15) {
            return {
               name: star.name,
               type: 'Intermediate-Mass Black Hole',
               emoji: '⚫',
               color: '#c44dff',
               description: `A voracious predator lurking in the dense galactic core. Born from the merger of smaller black holes or the direct collapse of massive gas clouds, ${star.name} patrols the inner sanctum of the galaxy. It feeds on passing stars, shredding them into spiraling ribbons of superheated plasma. Its accretion disk glows with an eerie violet luminescence, a grim lighthouse warning nearby stellar systems of their potential fate.`
            };
         }
         return {
            name: star.name,
            type: 'Stellar-Mass Black Hole',
            emoji: '🌑',
            color: '#888',
            description: `The silent corpse of a once-mighty star. When a massive star exhausted its nuclear fuel, its core collapsed catastrophically — the outermost layers were ejected in a supernova explosion, while the core imploded beyond the threshold of physics itself. What remains is ${star.name}, an invisible sphere of absolute darkness surrounded by a faint accretion disk of captured interstellar dust. It reveals itself only through the gravitational lensing of distant starlight bending around its event horizon.`
         };
      }

      if (star.starClass === 'NS') {
         return {
            name: star.name,
            type: 'Neutron Star',
            emoji: '💫',
            color: '#88bbff',
            description: `A teaspoon of ${star.name} weighs as much as a mountain. Born from the death throes of a supernova, this neutron star is an impossibly dense sphere barely 20 kilometers across yet containing more mass than our Sun. Its surface gravity is 200 billion times stronger than Earth's. The magnetic field is so intense that it warps atomic structure itself, creating exotic states of matter found nowhere else in the universe.`
         };
      }

      if (star.starClass === 'P') {
         return {
            name: star.name,
            type: 'Pulsar (Rotating Neutron Star)',
            emoji: '📡',
            color: '#ddccff',
            description: `A cosmic lighthouse spinning at impossible speeds. ${star.name} emits twin beams of electromagnetic radiation from its magnetic poles — as it spins up to hundreds of times per second, these beams sweep across space like a celestial searchlight. First mistaken for alien signals by astronomers, pulsars are among the most precise clocks in the universe. The rhythmic pulses can be detected across thousands of light-years.`
         };
      }

      // Main-sequence stars — use star.name for all
      const starDescs: Record<string, { type: string; emoji: string; color: string; description: string }> = {
         'O': {
            type: 'O-Class Blue Supergiant',
            emoji: '🔵',
            color: '#9bb0ff',
            description: `A titanic furnace of thermonuclear fury. ${star.name} is among the rarest and most luminous stars in the galaxy, burning through its hydrogen fuel at a reckless pace — living fast and dying spectacularly in a supernova after just a few million years. Its surface temperature exceeds 30,000 K, bathing surrounding nebulae in intense ultraviolet radiation.`
         },
         'B': {
            type: 'B-Class Blue Giant',
            emoji: '💎',
            color: '#aabfff',
            description: `A brilliant jewel of the spiral arms. ${star.name} burns with an intense blue-white luminosity, outshining our Sun by thousands of times. It is a signature star of young stellar nurseries, often found embedded within glowing emission nebulae. Its fierce radiation sculpts the interstellar medium, carving cavities in gas clouds.`
         },
         'A': {
            type: 'A-Class Main Sequence',
            emoji: '⚪',
            color: '#cad7ff',
            description: `An elegant star of crystalline white light. ${star.name} glows with a pure white brilliance, stable enough to sustain planetary systems for hundreds of millions of years. Its spectra are dominated by strong hydrogen absorption lines, and it may host debris disks harboring forming planets.`
         },
         'F': {
            type: 'F-Class Main Sequence',
            emoji: '✨',
            color: '#f8f7ff',
            description: `A warm, inviting star on the cusp of habitability. ${star.name} is slightly hotter and more luminous than our Sun, offering generous habitable zones where liquid water could persist on rocky worlds. Its lifetime of several billion years provides sufficient time for complex life to evolve.`
         },
         'G': {
            type: 'G-Class Main Sequence (Sun-like)',
            emoji: '☀️',
            color: '#fff4ea',
            description: `A perfect, golden star — the same class as our own Sun. ${star.name} is a goldilocks star: not too hot, not too cold, with a lifetime spanning 10 billion years. Its stable energy output and generous habitable zone make it a prime candidate for harboring life-bearing worlds.`
         },
         'K': {
            type: 'K-Class Main Sequence',
            emoji: '🟠',
            color: '#ffd2a1',
            description: `A patient, long-lived ember of the galaxy. ${star.name} burns its fuel with remarkable efficiency, shining steadily for 15 to 30 billion years — far outlasting our Sun. Its lower UV output and reduced stellar flare activity make it an excellent host for life. Quiet, stable, and persistent.`
         },
         'M': {
            type: 'M-Class Red Dwarf',
            emoji: '🔴',
            color: '#ffcc6f',
            description: `The most abundant type of star in the universe, yet invisible to the naked eye. ${star.name} burns with a cool, ruddy glow and can survive for trillions of years — far longer than the current age of the universe itself. Any habitable planet would be tidally locked, forever showing one face to its star.`
         }
      };

      const cls = star.starClass as string;
      const desc = starDescs[cls];
      if (desc) return { name: star.name, ...desc };
      return { name: star.name, type: 'Unknown', emoji: '❓', color: '#fff', description: 'An unidentified celestial object.' };
   };

   return (
      <div className="lg:col-span-3 flex flex-col gap-4 relative h-full min-h-[600px]">

         {/* HUD overlays */}
         <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => applyZoom(Math.min(20, scale * 1.2))}><ZoomIn className="w-5 h-5" /></button>
            <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => applyZoom(Math.max(0.2, scale / 1.2))}><ZoomOut className="w-5 h-5" /></button>
            <button className="bg-neutral-800/80 p-2 rounded text-neutral-300 hover:text-white" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} title="Recenter"><Crosshair className="w-5 h-5" /></button>
         </div>

         <div
            ref={containerRef}
            className="flex-1 bg-black rounded-xl border border-neutral-700 overflow-hidden relative"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => { setIsDragging(false); setHoveredStar(null); }}
         >
            <canvas
               ref={canvasRef}
               width={dimensions.w}
               height={dimensions.h}
               className="w-full h-full absolute inset-0 cursor-crosshair"
            />
            <canvas
               ref={hudCanvasRef}
               width={dimensions.w}
               height={dimensions.h}
               className="w-full h-full absolute inset-0 pointer-events-none"
            />

            {stars.length === 0 && (
               <div className="absolute inset-0 flex items-center justify-center text-neutral-500 font-medium">
                  Configure parameters and Generate Galaxy
               </div>
            )}

         </div>

         {/* Selected Star Details Panel */}
         {selectedStar && (() => {
            const info = getCelestialInfo(selectedStar);
            const isBHtype = ['BH', 'NS', 'P'].includes(selectedStar.starClass);
            return (
            <div className="absolute top-4 right-4 sm:top-14 sm:right-4 left-4 sm:left-auto bottom-4 sm:bottom-4 bg-neutral-900/95 border border-fuchsia-500/40 rounded-xl shadow-2xl backdrop-blur-sm sm:w-96 z-20 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-right-4 duration-300">
               {/* Header */}
               <div className="p-5 pb-3 border-b border-neutral-700/50">
                  <div className="flex items-start justify-between mb-1">
                     <div className="flex items-center gap-2">
                        <span className="text-2xl">{info.emoji}</span>
                        <div>
                           <h3 className="text-base font-bold text-white leading-tight">{info.name}</h3>
                           <span className="text-xs font-medium" style={{ color: info.color }}>{info.type}</span>
                        </div>
                     </div>
                     <button onClick={() => setSelectedStar(null)} className="text-neutral-500 hover:text-white transition-colors p-1">
                        <span className="text-lg leading-none">&times;</span>
                     </button>
                  </div>
               </div>

               {/* Scrollable Content */}
               <div className="flex-1 overflow-y-auto p-5 pt-4 space-y-4">
                  {/* Description */}
                  <p className="text-sm text-neutral-400 leading-relaxed">{info.description}</p>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                     <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                        <span className="block text-neutral-500 text-xs mb-0.5">Classification</span>
                        <span className="font-semibold text-neutral-200">{selectedStar.starClass}</span>
                     </div>
                     <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                        <span className="block text-neutral-500 text-xs mb-0.5">System Age</span>
                        <span className="font-semibold text-neutral-200">{Math.round(selectedStar.config.systemAge * 100)}%</span>
                     </div>
                     {!isBHtype && (
                        <>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Planets</span>
                           <span className="font-semibold text-neutral-200">{selectedStar.config.numPlanets}</span>
                        </div>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Moons</span>
                           <span className="font-semibold text-neutral-200">{selectedStar.config.numMoons}</span>
                        </div>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Rocky %</span>
                           <span className="font-semibold text-neutral-200">{Math.round(selectedStar.config.rockyPercentage * 100)}%</span>
                        </div>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Life Chance</span>
                           <span className="font-semibold text-neutral-200">{Math.round(selectedStar.config.lifeChance * 100)}%</span>
                        </div>
                        </>
                     )}
                     {isBHtype && (
                        <>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Debris Belts</span>
                           <span className="font-semibold text-neutral-200">{selectedStar.config.numAsteroidBelts}</span>
                        </div>
                        <div className="bg-neutral-800/80 p-2.5 rounded-lg">
                           <span className="block text-neutral-500 text-xs mb-0.5">Habitability</span>
                           <span className="font-semibold text-red-400">0%</span>
                        </div>
                        </>
                     )}
                  </div>

                  {/* Habitability Bar */}
                  {!isBHtype && (
                     <div>
                        <div className="flex justify-between text-xs mb-1">
                           <span className="text-neutral-500">Habitability Index</span>
                           <span className="font-semibold" style={{ color: selectedStar.habitability > 0.6 ? '#4ade80' : selectedStar.habitability > 0.3 ? '#facc15' : '#f87171' }}>
                              {Math.round(selectedStar.habitability * 100)}%
                           </span>
                        </div>
                        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                           <div className="h-full rounded-full transition-all" style={{
                              width: `${selectedStar.habitability * 100}%`,
                              background: selectedStar.habitability > 0.6 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : selectedStar.habitability > 0.3 ? 'linear-gradient(90deg, #eab308, #facc15)' : 'linear-gradient(90deg, #dc2626, #f87171)'
                           }} />
                        </div>
                     </div>
                  )}

                  {/* Alerts */}
                  {selectedStar.isDeadZone && (
                     <div className="bg-red-950/40 text-red-400 p-3 rounded-lg text-xs flex items-start gap-2 border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                           <span className="font-semibold block mb-0.5">⚠ Supernova Dead Zone</span>
                           This region was devastated by a cataclysmic supernova blast. Surviving matter has been irradiated beyond recovery. No biological systems can exist here.
                        </div>
                     </div>
                  )}
                  {selectedStar.habitability > 0.7 && !selectedStar.isDeadZone && !isBHtype && (
                     <div className="bg-emerald-950/40 text-emerald-400 p-3 rounded-lg text-xs flex items-start gap-2 border border-emerald-500/20">
                        <span className="text-base">🌱</span>
                        <div>
                           <span className="font-semibold block mb-0.5">Galactic Sweet Spot</span>
                           This system resides in the optimal habitability zone of the galaxy — far enough from the lethal radiation of the core, yet close enough to benefit from high metallicity for rocky planet formation.
                        </div>
                     </div>
                  )}

                  {/* Coordinates */}
                  <div className="text-xs text-neutral-600 pt-2 border-t border-neutral-800">
                     Position: ({selectedStar.x.toFixed(1)}, {selectedStar.y.toFixed(1)}) · Seed: {selectedStar.config.seed}
                  </div>
               </div>

               {/* Footer Action */}
               {!isBHtype && (
                  <div className="p-4 pt-3 border-t border-neutral-700/50">
                     <button
                        onClick={() => onEnterSystem(selectedStar.config)}
                        className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-900/30"
                     >
                        Enter System <ChevronRight className="w-4 h-4" />
                     </button>
                  </div>
               )}
            </div>
            );
         })()}

         <GalaxyLegend layer={layer} />
      </div>
   );
}
