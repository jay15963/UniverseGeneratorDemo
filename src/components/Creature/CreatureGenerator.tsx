import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Dna, Download, Sparkles, Layers } from 'lucide-react';
import { makeGenome, describe, STAGES, Stage, CreatureParams, DEFAULT_PARAMS, Locomotion, Covering, Genome } from '../../lib/creature/genome';
import { renderCreature, CreatureSprite, FRAMES } from '../../lib/creature/render';
import { drawBackdrop, GROUND_Y } from '../../lib/creature/backdrop';

interface Props { onBack: () => void }

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

type SliderDef = { key: keyof CreatureParams; label: string; fmt: (v: number) => string; hint: string };
const SLIDERS: SliderDef[] = [
  { key: 'gravity', label: 'Gravidade', fmt: v => `${(0.2 + v * 2.8).toFixed(1)} g`, hint: 'Alta: corpos baixos e robustos, mais patas. Baixa: pernas longas, voo.' },
  { key: 'temperature', label: 'Temperatura', fmt: v => `${Math.round(-60 + v * 140)} °C`, hint: 'Frio: pelos, penas e gordura. Calor: escamas, quitina, orelhas grandes.' },
  { key: 'water', label: 'Umidade / água', fmt: v => `${Math.round(v * 100)}%`, hint: 'Úmido: pele lisa e cores verdes. Seco: escamas e tons de areia.' },
  { key: 'atmosphere', label: 'Atmosfera', fmt: v => `${(0.1 + v * 4.9).toFixed(1)} atm`, hint: 'Densa favorece asas e criaturas voadoras.' },
  { key: 'star', label: 'Estrela', fmt: v => (v < 0.2 ? 'Anã vermelha' : v < 0.45 ? 'Laranja (K)' : v < 0.7 ? 'Amarela (G)' : v < 0.88 ? 'Branca (F)' : 'Gigante azul'), hint: 'Estrelas fracas geram olhos maiores; a luz tinge os pigmentos.' },
  { key: 'diet', label: 'Dieta', fmt: v => (v < 0.36 ? 'Herbívoro' : v < 0.66 ? 'Onívoro' : 'Carnívoro'), hint: 'Predadores: olhos frontais, dentes, garras. Herbívoros: chifres, olhos laterais.' },
  { key: 'exotic', label: 'Exotismo', fmt: v => `${Math.round(v * 100)}%`, hint: 'Mais olhos, antenas, pedúnculos, bioluminescência e cores improváveis.' },
  { key: 'size', label: 'Porte', fmt: v => (v < 0.3 ? 'Pequeno' : v < 0.7 ? 'Médio' : 'Grande'), hint: 'Tamanho do corpo em todas as fases.' },
];
const LOCO_OPTS: [Locomotion | 'auto', string][] = [['auto', 'Automático'], ['quadruped', 'Quadrúpede'], ['biped', 'Bípede'], ['hexapod', 'Hexápode'], ['serpent', 'Serpente'], ['flyer', 'Voador (asas)']];
const COVER_OPTS: [Covering | 'auto', string][] = [['auto', 'Automático'], ['fur', 'Pelos'], ['feathers', 'Penas'], ['scales', 'Escamas'], ['skin', 'Pele'], ['chitin', 'Quitina'], ['plates', 'Placas ósseas']];
const GROUP_COL: Record<string, string> = { 'Célula': 'text-teal-300', 'Oceano': 'text-sky-300', 'Terra': 'text-lime-300', 'Civilização': 'text-amber-300' };

function applyOverrides(g: Genome, loco: Locomotion | 'auto', cover: Covering | 'auto'): Genome {
  if (loco === 'auto' && cover === 'auto') return g;
  const out = { ...g };
  if (cover !== 'auto') {
    out.covering = cover;
    if (cover === 'feathers' && out.jaw !== 'teeth') out.jaw = 'beak';
    if (cover === 'chitin') { out.jaw = 'mandibles'; out.feet = 'insect'; out.antennae = true; }
    if (cover === 'fur' && out.feet === 'insect') out.feet = 'paw';
    if (cover !== 'chitin' && out.jaw === 'mandibles') out.jaw = 'teeth';
    if (cover !== 'feathers' && out.jaw === 'beak') out.jaw = g.params.diet > 0.5 ? 'teeth' : 'soft';
  }
  if (loco !== 'auto') {
    out.locomotion = loco;
    out.arms = loco === 'hexapod' ? 4 : 2;
    out.wings = loco !== 'flyer' ? 'none' : out.covering === 'feathers' ? 'feather' : out.covering === 'chitin' ? 'insect' : 'membrane';
  }
  return out;
}

/** Draws the diorama + creature for a stage into ctx (logical pixels). */
function paintStage(ctx: CanvasRenderingContext2D, W: number, H: number, st: Stage, g: Genome, sp: CreatureSprite, t: number, frame: number) {
  drawBackdrop(ctx, W, H, st, g, t);
  const n = sp.frames.length, img = sp.frames[((frame % n) + n) % n];
  if (sp.grounded) {
    const gy = GROUND_Y(H) + 3;
    const x = Math.round(W / 2 - sp.ax), y = gy - sp.ay;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(W / 2, gy, Math.min(sp.w * 0.42, 60), 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, x, y);
  } else {
    const bob = Math.round(Math.sin(t * 1.3) * 3);
    ctx.drawImage(img, Math.round(W / 2 - sp.ax), Math.round(H / 2 - sp.ay + bob));
  }
}

export function CreatureGenerator({ onBack }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<CreatureParams>(DEFAULT_PARAMS);
  const [stage, setStage] = useState<Stage>(Stage.LAND);
  const [loco, setLoco] = useState<Locomotion | 'auto'>('auto');
  const [cover, setCover] = useState<Covering | 'auto'>('auto');
  const [mutation, setMutation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);

  // debounced parameters so dragging a slider stays fluid
  const [live, setLive] = useState({ seed, params, loco, cover, mutation });
  useEffect(() => { const id = setTimeout(() => setLive({ seed, params, loco, cover, mutation }), 70); return () => clearTimeout(id); }, [seed, params, loco, cover, mutation]);

  const genome = useMemo(() => {
    const base = makeGenome(live.seed + (live.mutation ? `~${live.mutation}` : ''), live.params);
    // a mutation keeps the species' name & colours from the original seed but redraws its body plan
    if (live.mutation) { const orig = makeGenome(live.seed, live.params); base.name = orig.name; base.primary = orig.primary; base.secondary = orig.secondary; base.pattern = orig.pattern; }
    return applyOverrides(base, live.loco, live.cover);
  }, [live]);
  const sprite = useMemo(() => renderCreature(genome, stage), [genome, stage]);
  const info = useMemo(() => describe(genome, stage), [genome, stage]);
  const meta = STAGES[stage];

  // scene size grows with big creatures, keeps 16:9
  const W = Math.max(256, Math.ceil((sprite.w + 60) / 16) * 16), H = Math.round(W * 9 / 16);

  // integer pixel scaling for the stage canvas
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const s = Math.max(1, Math.floor(Math.min((el.clientWidth * dpr) / W, (el.clientHeight * dpr) / H)));
      setScale(s / dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // animation loop
  const flash = useRef(0);
  useEffect(() => { flash.current = 1; }, [stage]);
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      paintStage(ctx, W, H, stage, genome, sprite, t, Math.floor(t * 7));
      if (flash.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash.current * 0.5})`; ctx.fillRect(0, 0, W, H);
        flash.current = Math.max(0, flash.current - (now - last) / 350);
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [genome, sprite, stage, W, H]);

  // evolution strip: every stage of the lineage, rendered progressively
  const [thumbs, setThumbs] = useState<(HTMLCanvasElement | null)[]>(() => STAGES.map(() => null));
  useEffect(() => {
    let cancelled = false, i = 0;
    const next: (HTMLCanvasElement | null)[] = STAGES.map(() => null);
    const step = () => {
      if (cancelled || i >= STAGES.length) return;
      const sp = renderCreature(genome, STAGES[i].id);
      next[i] = sp.frames[0];
      setThumbs([...next]);
      i++;
      setTimeout(step, 0);
    };
    const id = setTimeout(step, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [genome]);

  const setParam = (k: keyof CreatureParams, v: number) => setParams(p => ({ ...p, [k]: v }));
  const randomWorld = () => setParams({ gravity: Math.random() * 0.8, temperature: Math.random(), water: Math.random(), atmosphere: Math.random(), star: Math.random(), diet: Math.random(), exotic: Math.random() * 0.9, size: Math.random() });

  const download = (sheet: boolean) => {
    const k = 4;
    const out = document.createElement('canvas');
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    if (!sheet) {
      out.width = W * k; out.height = H * k;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      paintStage(c.getContext('2d')!, W, H, stage, genome, sprite, 0, 0);
      o.drawImage(c, 0, 0, W * k, H * k);
    } else {
      const sps = STAGES.map(s => renderCreature(genome, s.id));
      const cw = Math.max(...sps.map(s => s.w)) + 8, chh = Math.max(...sps.map(s => s.h)) + 16;
      const cols = 7;
      out.width = cw * cols * 3; out.height = chh * 2 * 3 + 40;
      o.fillStyle = '#07090f'; o.fillRect(0, 0, out.width, out.height);
      o.fillStyle = '#e6e0c8'; o.font = 'bold 22px ui-sans-serif, system-ui'; o.fillText(`${info.title} — linhagem evolutiva`, 16, 28);
      sps.forEach((sp, i) => {
        const cx = (i % cols) * cw * 3, cy = 40 + Math.floor(i / cols) * chh * 3;
        o.drawImage(sp.frames[0], cx + (cw * 3 - sp.w * 3) / 2, cy + (chh * 3 - 30 - sp.h * 3) / 2 + (sp.grounded ? chh * 0.5 : 0), sp.w * 3, sp.h * 3);
        o.fillStyle = '#9aa3b8'; o.font = '14px ui-sans-serif, system-ui'; o.fillText(STAGES[i].name, cx + 8, cy + chh * 3 - 10);
      });
    }
    const a = document.createElement('a');
    a.download = `${genome.name.genus}-${sheet ? 'linhagem' : STAGES[stage].name}.png`.replace(/\s+/g, '_');
    a.href = out.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#06070c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      {/* header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <Dna className="w-5 h-5 text-fuchsia-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-fuchsia-300 bg-clip-text text-transparent">GERADOR DE CRIATURAS</h1>
        <div className="ml-auto text-right hidden sm:block">
          <div className="italic font-serif text-lg leading-none text-amber-100">{info.title}</div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-neutral-500 mt-1">SEMENTE {seed}{mutation ? ` · MUTAÇÃO ${mutation}` : ''}</div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] min-h-0">
        {/* controls */}
        <aside className="order-2 lg:order-1 border-r border-white/5 bg-black/25 p-4 overflow-y-auto space-y-5">
          <section>
            <Label>Semente da espécie</Label>
            <div className="flex gap-2">
              <input value={seed} onChange={e => { setSeed(e.target.value.toUpperCase().slice(0, 16)); setMutation(0); }}
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:border-fuchsia-400/60" />
              <button onClick={() => { setSeed(randomSeed()); setMutation(0); }} title="Nova espécie" className="px-3 rounded-lg bg-fuchsia-600/80 hover:bg-fuchsia-500 border border-white/10"><Dices className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setMutation(m => m + 1)} className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-fuchsia-300/25 text-fuchsia-200 hover:bg-fuchsia-500/10">
              <Sparkles className="w-3.5 h-3.5" /> Mutar (mantém nome e cores)
            </button>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <Label>Mundo natal</Label>
              <button onClick={randomWorld} className="text-[10px] font-mono text-cyan-300/80 hover:text-cyan-200 mb-2">planeta aleatório</button>
            </div>
            <div className="space-y-3">
              {SLIDERS.map(s => (
                <div key={s.key} title={s.hint}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-neutral-300">{s.label}</span>
                    <span className="font-mono text-cyan-200/90">{s.fmt(params[s.key])}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={params[s.key]} onChange={e => setParam(s.key, +e.target.value)} className="w-full accent-fuchsia-400" />
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div>
              <Label>Locomoção</Label>
              <select value={loco} onChange={e => setLoco(e.target.value as Locomotion | 'auto')} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs">
                {LOCO_OPTS.map(([v, l]) => <option key={v} value={v} className="bg-neutral-900">{l}</option>)}
              </select>
            </div>
            <div>
              <Label>Cobertura</Label>
              <select value={cover} onChange={e => setCover(e.target.value as Covering | 'auto')} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs">
                {COVER_OPTS.map(([v, l]) => <option key={v} value={v} className="bg-neutral-900">{l}</option>)}
              </select>
            </div>
          </section>
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Cada espécie é uma função da semente e do planeta: mova os controles e a mesma criatura se adapta. Tudo é desenhado por código — nenhuma imagem pronta.
          </p>
        </aside>

        {/* stage */}
        <main className="order-1 lg:order-2 flex flex-col min-h-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-h-[240px] sm:min-h-[340px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: 'pixelated' }} className="rounded-lg shadow-2xl" />
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono">
              <span className={GROUP_COL[meta.group]}>{meta.group.toUpperCase()}</span> <span className="text-neutral-400">· {meta.name}{meta.years ? ` · ${meta.years}` : ''} · {meta.scale}</span>
            </div>
          </div>

          {/* evolution slider */}
          <div className="bg-black/40 border border-white/5 rounded-2xl px-4 pt-3 pb-2">
            <div className="flex justify-between text-[10px] font-mono tracking-[0.2em] mb-1">
              {(['Célula', 'Oceano', 'Terra', 'Civilização'] as const).map(gp => <span key={gp} className={GROUP_COL[gp]}>{gp.toUpperCase()}</span>)}
            </div>
            <input type="range" min={0} max={STAGES.length - 1} step={1} value={stage} onChange={e => setStage(+e.target.value as Stage)} className="w-full accent-amber-300" />
            <div className="grid mt-2 gap-1" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
              {STAGES.map((s, i) => (
                <button key={s.id} onClick={() => setStage(s.id)} title={s.name}
                  className={`group flex flex-col items-center rounded-lg p-1 border transition-colors ${stage === s.id ? 'border-amber-300/70 bg-amber-300/10' : 'border-transparent hover:border-white/10'}`}>
                  <Thumb canvas={thumbs[i]} />
                  <span className={`hidden md:block text-[9px] leading-tight text-center mt-1 ${stage === s.id ? 'text-amber-200' : 'text-neutral-500 group-hover:text-neutral-300'}`}>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* species card */}
        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">ESPÉCIE</div>
            <div className="italic font-serif text-2xl text-amber-100 leading-tight">{info.title}</div>
            {info.society && <div className="mt-1 text-sm font-bold text-amber-300">{info.society}</div>}
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{info.blurb}</p>
          </div>
          <div className="rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {info.lines.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]">
                <span className="text-neutral-500">{k}</span><span className="text-neutral-200 text-right">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {[genome.primary, genome.secondary, genome.belly, genome.accent, genome.eye].map((c, i) => (
              <div key={i} className="flex-1 h-6 rounded-md border border-white/10" style={{ background: `hsl(${c.h * 360},${c.s * 100}%,${c.l * 100}%)` }} title={['Primária', 'Secundária', 'Ventre', 'Destaque', 'Olhos'][i]} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => download(false)} className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Download className="w-3.5 h-3.5" /> PNG</button>
            <button onClick={() => download(true)} className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Layers className="w-3.5 h-3.5" /> Linhagem</button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">{FRAMES} quadros de animação por fase · sombreamento em rampas de cor com contorno seletivo, como pixel art feita à mão.</p>
        </aside>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">{children}</div>;
}

function Thumb({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (!canvas) return;
    x.imageSmoothingEnabled = false;
    const s = Math.min(c.width / canvas.width, c.height / canvas.height);
    const k = s >= 1 ? Math.floor(s) : s;
    x.drawImage(canvas, (c.width - canvas.width * k) / 2, (c.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  }, [canvas]);
  return <canvas ref={ref} width={64} height={48} className="w-full max-w-[64px] aspect-[4/3]" style={{ imageRendering: 'pixelated' }} />;
}
