// Cell editor: before the cellular era the player designs their species - name, colour mode and many appearance
// sliders - and sees every unit kind the colony will divide into (they share the species' look, each with its own
// anatomy). Dice for the name, the appearance and the seed, like the creature generator.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Play, Microscope, Shuffle, Palette } from 'lucide-react';
import {
  CellSpecies, CellLook, LOOK_SLIDERS, SHAPES, PATTERNS, KINDS, Kind, SPECIES_KINDS, randomLook, randomName, randomSeed,
  makeSpecies, loadSpecies, saveSpecies, cellColours, CellShape, CellPattern,
} from '../../lib/cell/look';
import { drawKind, spriteCanvas, CellSprite } from '../../lib/cell/art';
import type { ColorMode } from '../../lib/creature/genome';

interface Props { onBack: () => void; onStart: (sp: CellSpecies) => void }

const ORDER: Kind[] = [Kind.MOTHER, Kind.WORKER, Kind.SCOUT, Kind.HUNTER, Kind.PHOTO, Kind.ARMOR, Kind.SPITTER, Kind.NODE];

export function CellEditor({ onBack, onStart }: Props) {
  const [sp, setSp] = useState<CellSpecies>(() => loadSpecies() ?? makeSpecies(randomSeed()));
  const [kind, setKind] = useState<Kind>(Kind.WORKER);
  const setLook = (patch: Partial<CellLook>) => setSp(s => ({ ...s, look: { ...s.look, ...patch } }));

  // debounced so dragging a slider stays fluid
  const [live, setLive] = useState(sp);
  useEffect(() => { const id = setTimeout(() => setLive(sp), 60); return () => clearTimeout(id); }, [sp]);

  const preview = useMemo(() => drawKind(live, kind), [live.seed, live.look, live.mode, kind]);
  const [thumbs, setThumbs] = useState<Partial<Record<Kind, HTMLCanvasElement>>>({});
  useEffect(() => {
    let dead = false, i = 0;
    const out: Partial<Record<Kind, HTMLCanvasElement>> = {};
    const run = () => {
      if (dead || i >= ORDER.length) return;
      const k = ORDER[i++];
      out[k] = spriteCanvas(drawKind(live, k, 1));
      setThumbs({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 120);
    return () => { dead = true; clearTimeout(id); };
  }, [live.seed, live.look, live.mode]);

  // animated preview in a little pool
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = 200, H = 128;
  const [scale, setScale] = useState(4);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { const dpr = window.devicePixelRatio || 1; setScale(Math.max(1, Math.floor(Math.min(el.clientWidth * dpr / W, el.clientHeight * dpr / H))) / dpr); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvasRef.current!, ctx = c.getContext('2d')!;
    const frames = preview.frames.map((_, f) => spriteCanvas(preview, f));
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      drawPool(ctx, W, H, t, live.mode);
      const img = frames[Math.floor(t * 8) % frames.length];
      const bob = Math.round(Math.sin(t * 1.3) * 2);
      ctx.drawImage(img, Math.round(W / 2 - preview.w / 2), Math.round(H / 2 - preview.h / 2 + bob));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [preview, live.mode]);

  const col = cellColours(sp.look, sp.mode);
  const groups = ['Cor', 'Forma', 'Organelas', 'Apêndices'] as const;
  const start = () => { saveSpecies(sp); onStart(sp); };
  const K = KINDS[kind];

  return (
    <div className="min-h-screen lg:h-screen bg-[#04090c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      <header className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Eras</button>
        <div className="w-px h-5 bg-white/10" />
        <Microscope className="w-5 h-5 text-teal-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-teal-300 bg-clip-text text-transparent">CRIE SUA CÉLULA</h1>
        <div className="flex items-center gap-1 ml-auto">
          <input value={sp.genus} onChange={e => setSp(s => ({ ...s, genus: cap(e.target.value.replace(/\s+/g, '').slice(0, 18)) }))} aria-label="Gênero"
            className="w-32 sm:w-36 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 italic font-serif text-amber-100 focus:outline-none focus:border-teal-300/60" />
          <input value={sp.species} onChange={e => setSp(s => ({ ...s, species: e.target.value.replace(/\s+/g, '').toLowerCase().slice(0, 18) }))} aria-label="Espécie"
            className="w-28 sm:w-32 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 italic font-serif text-amber-100 focus:outline-none focus:border-teal-300/60" />
          <button onClick={() => setSp(s => ({ ...s, ...randomName() }))} title="Nome aleatório" className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Dices className="w-4 h-4" /></button>
        </div>
        <button onClick={start} className="flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-sm text-black bg-gradient-to-r from-teal-300 to-emerald-300 hover:from-teal-200 shadow-[0_0_24px_rgba(94,234,212,0.3)]">
          <Play className="w-4 h-4" /> Começar a era celular
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_290px] min-h-0">
        <aside className="order-2 lg:order-1 border-r border-white/5 bg-black/25 p-4 overflow-y-auto space-y-5">
          <section>
            <Label>Semente</Label>
            <div className="flex gap-2">
              <input value={sp.seed} onChange={e => setSp(s => ({ ...s, seed: e.target.value.toUpperCase().slice(0, 16) }))}
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:border-teal-400/60" />
              <button onClick={() => setSp(s => ({ ...s, seed: randomSeed() }))} title="Semente aleatória (a disposição das organelas e a linhagem das próximas eras)" className="px-3 rounded-lg bg-teal-600/80 hover:bg-teal-500 border border-white/10"><Dices className="w-4 h-4" /></button>
            </div>
            <button onClick={() => { const seed = randomSeed(); setSp(s => ({ ...s, look: randomLook(seed) })); }} className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-teal-300/25 text-teal-100 hover:bg-teal-500/10">
              <Shuffle className="w-3.5 h-3.5" /> Aparência aleatória
            </button>
          </section>
          <section>
            <Label>Tipo de mundo</Label>
            <select value={sp.mode} onChange={e => setSp(s => ({ ...s, mode: e.target.value as ColorMode }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="earth" className="bg-neutral-900">Earth-like — pigmentos naturais</option>
              <option value="alien" className="bg-neutral-900">Alien-like — cores livres</option>
            </select>
            <p className="mt-1.5 text-[10px] text-neutral-500 leading-relaxed">{sp.mode === 'earth' ? 'As cores correm por pigmentos de micróbios reais: âmbar, oliva, verdes, cinza-azulado, lilás, rosado. Vale para todas as espécies da poça.' : 'Matizes livres e bioluminescência forte, para toda a poça.'}</p>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <Pick label="Forma" value={sp.look.shape} opts={SHAPES} onChange={v => setLook({ shape: v as CellShape })} />
            <Pick label="Padrão" value={sp.look.pattern} opts={PATTERNS} onChange={v => setLook({ pattern: v as CellPattern })} />
          </section>
          {groups.map(g => (
            <section key={g}>
              <Label>{g}</Label>
              <div className="space-y-2.5">
                {LOOK_SLIDERS.filter(s => s.group === g).map(s => (
                  <div key={s.key}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-neutral-300">{s.label}</span>
                      <span className="font-mono text-teal-200/90">{s.max ? Math.round(sp.look[s.key]) : `${Math.round(sp.look[s.key] * 100)}%`}</span>
                    </div>
                    <input type="range" min={0} max={s.max ?? 1} step={s.step ?? 0.01} value={sp.look[s.key]} onChange={e => setLook({ [s.key]: +e.target.value } as Partial<CellLook>)}
                      className="w-full accent-teal-400" style={s.key.toLowerCase().includes('hue') ? { accentColor: `hsl(${sp.look[s.key] * 360},70%,55%)` } : undefined} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <main className="order-1 lg:order-2 flex flex-col min-h-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-h-[260px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: 'pixelated' }} className="rounded-lg" />
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono">
              <span className="text-teal-300">CÉLULA</span> <span className="text-neutral-400">· vista de cima · ≈ 40 µm</span>
            </div>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-2xl p-2">
            <div className="text-[10px] font-mono tracking-[0.2em] text-neutral-500 px-1 mb-1">AS CÉLULAS DA SUA COLÔNIA</div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {ORDER.map(k => (
                <button key={k} onClick={() => setKind(k)} title={KINDS[k].blurb} className={`flex flex-col items-center rounded-lg p-1 border ${kind === k ? 'border-teal-300/70 bg-teal-300/10' : 'border-transparent hover:border-white/10'}`}>
                  <Thumb canvas={thumbs[k] ?? null} />
                  <span className={`text-[10px] leading-tight text-center mt-0.5 ${kind === k ? 'text-teal-100' : 'text-neutral-400'}`}>{KINDS[k].name}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">ESPÉCIE</div>
            <div className="italic font-serif text-2xl text-amber-100 leading-tight break-words">{sp.genus} {sp.species}</div>
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">Uma célula que vai fundar a primeira colônia da linhagem {sp.genus}. As cores, o padrão e a mancha ocular seguem a espécie nas próximas eras.</p>
          </div>
          <div className="rounded-xl border border-white/5 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-teal-100">{thumbs[kind] && <MiniImg canvas={thumbs[kind]!} />}{K.name}</div>
            <p className="mt-1 text-[12px] text-neutral-400 leading-relaxed">{K.blurb}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <Stat k="Vida" v={K.hp} /><Stat k="Armadura" v={K.armor} />
              <Stat k="Velocidade" v={K.speed} /><Stat k="Ataque" v={K.dmg ? `${K.dmg}${K.range > 20 ? ' (dist.)' : ''}` : '—'} />
              {kind !== Kind.MOTHER && <><Stat k="Nutrientes" v={K.food} /><Stat k="Energia" v={K.energy} /></>}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-[0.3em] text-neutral-500 mb-1.5"><Palette className="w-3 h-3" /> PALETA</div>
            <div className="flex gap-2">
              {[col.mem, col.cyto, col.nuc, col.acc].map((c, i) => (
                <div key={i} className="flex-1 h-6 rounded-md border border-white/10" style={{ background: `hsl(${c.h * 360},${c.s * 100}%,${c.l * 100}%)` }} title={['Membrana', 'Citoplasma', 'Núcleo', 'Organelas'][i]} />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">Pixel art desenhada por código: {SPECIES_KINDS} tipos de célula × 8 quadros de animação. No jogo, cada célula gira para onde nada.</p>
        </aside>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** a small microscope pool behind the preview: dark water, drifting motes, soft caustic light */
function drawPool(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, mode: ColorMode) {
  ctx.fillStyle = mode === 'alien' ? '#0d0b1f' : '#07181e';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const s = Math.sin(i * 91.7) * 43758.5, h = s - Math.floor(s);
    const s2 = Math.sin(i * 12.3) * 9431.7, h2 = s2 - Math.floor(s2);
    const x = ((h * W + t * (4 + h2 * 6)) % W + W) % W, y = ((h2 * H + t * (1 + h * 2)) % H + H) % H;
    ctx.fillStyle = i % 5 === 0 ? 'rgba(160,210,190,0.35)' : 'rgba(90,150,150,0.25)';
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
  const g = ctx.createRadialGradient(W * 0.35, H * 0.3, 4, W * 0.35, H * 0.3, W * 0.6);
  g.addColorStop(0, mode === 'alien' ? 'rgba(120,90,200,0.18)' : 'rgba(120,200,160,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">{children}</div>;
}
function Pick({ label, value, opts, onChange }: { label: string; value: string; opts: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs">
        {opts.map(([v, l]) => <option key={v} value={v} className="bg-neutral-900">{l}</option>)}
      </select>
    </div>
  );
}
function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-neutral-500">{k}</span><span className="font-mono text-neutral-200">{v}</span></div>;
}
function Thumb({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (!canvas) return;
    x.imageSmoothingEnabled = false;
    const s = Math.min(c.width / canvas.width, c.height / canvas.height), k = s >= 1 ? Math.floor(s) : s;
    x.drawImage(canvas, (c.width - canvas.width * k) / 2, (c.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  }, [canvas]);
  return <canvas ref={ref} width={64} height={48} className="w-full max-w-[72px] aspect-[4/3]" style={{ imageRendering: 'pixelated' }} />;
}
function MiniImg({ canvas }: { canvas: HTMLCanvasElement }) {
  const url = useMemo(() => canvas.toDataURL(), [canvas]);
  return <img src={url} className="h-6" style={{ imageRendering: 'pixelated' }} />;
}
export type { CellSprite };
