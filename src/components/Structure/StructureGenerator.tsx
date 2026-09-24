import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Download, Sparkles, Layers, Grid3x3, Castle, Moon, Sun, Home, Factory, Pickaxe, Store, Shield, Loader2 } from 'lucide-react';
import { makeCulture, describeCulture, CATEGORIES, SIZES, ERAS, eraMeta, Category, Size, StructParams, DEFAULT_SPARAMS, ColorMode } from '../../lib/structure/genome';
import { typesFor, typeById, typeName } from '../../lib/structure/registry';
import { renderStructure, structData, toCanvas, StructSpec, StructSprite, SFRAMES, LOD_K, Lod, CREATURE_K } from '../../lib/structure/render';
import { renderStructureAsync, structSheetAsync } from '../../lib/structure/structAsync';
import { makeGenome } from '../../lib/creature/genome';
import { renderCreature, CreatureSprite } from '../../lib/creature/render';
import { makeKit, MAT_PT } from '../../lib/structure/kit';
import { drawStructBackdrop } from '../../lib/structure/backdrop';
import { Dir8, DIRS, DIR_PT } from '../../lib/creature/pose';

interface Props { onBack: () => void }

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

type SliderDef = { key: keyof StructParams; label: string; fmt: (v: number) => string; hint: string };
const SLIDERS: SliderDef[] = [
  { key: 'gravity', label: 'Gravidade', fmt: v => `${(0.2 + v * 2.8).toFixed(1)} g`, hint: 'Baixa: construções altas e esguias. Alta: baixas, maciças, paredes inclinadas e contrafortes.' },
  { key: 'temperature', label: 'Temperatura', fmt: v => `${Math.round(-60 + v * 140)} °C`, hint: 'Frio: telhados íngremes, peles, toras, blocos de gelo. Calor: terraços, cúpulas, adobe.' },
  { key: 'water', label: 'Umidade / chuva', fmt: v => `${Math.round(v * 100)}%`, hint: 'Úmido: palafitas, beirais largos, palha. Seco: telhados planos e barro.' },
  { key: 'exotic', label: 'Exotismo', fmt: v => `${Math.round(v * 100)}%`, hint: 'Formas menos familiares: casulos, hexágonos, cogumelos, agulhas, chifres.' },
  { key: 'wealth', label: 'Riqueza', fmt: v => (v < 0.33 ? 'Austera' : v < 0.66 ? 'Próspera' : 'Opulenta'), hint: 'Ornamentos, molduras, mármore, cobre e ouro.' },
  { key: 'star', label: 'Estrela', fmt: v => (v < 0.2 ? 'Anã vermelha' : v < 0.45 ? 'Laranja (K)' : v < 0.7 ? 'Amarela (G)' : v < 0.88 ? 'Branca (F)' : 'Gigante azul'), hint: 'Tinge o céu e, no modo alienígena, os pigmentos.' },
];
const CAT_ICON: Record<Category, React.ReactNode> = {
  residential: <Home className="w-4 h-4" />, industrial: <Factory className="w-4 h-4" />, extraction: <Pickaxe className="w-4 h-4" />,
  commercial: <Store className="w-4 h-4" />, military: <Shield className="w-4 h-4" />,
};
const ARROWS: Record<Dir8, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };

/** Draws the diorama + structure into ctx (logical pixels). */
function paint(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, spec: StructSpec, sp: StructSprite, t: number, frame: number, who?: CreatureSprite | null) {
  const K = makeKit(spec.culture, spec.era, spec.night);
  drawStructBackdrop(ctx, W, H, gy, spec.culture, K.groundRGB, spec.night, t);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(W / 2, gy + 2, Math.min(sp.w * 0.46, W * 0.45), Math.max(3, sp.w * 0.08), 0, 0, Math.PI * 2); ctx.fill();
  const n = sp.frames.length, bx = Math.round(W / 2 - (who ? who.w / 2 + 8 : 0));
  ctx.drawImage(sp.frames[((frame % n) + n) % n], Math.round(bx - sp.ax), Math.round(gy - sp.ay));
  if (who) { // a citizen of the builders' species, in the era's clothes, for scale
    const cx = bx + (sp.w - sp.ax) + 10 + who.ax, cy = gy + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy, who.w * 0.35, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    const m = who.frames.length;
    ctx.drawImage(who.frames[Math.max(0, Math.floor(t * 7)) % m], Math.round(cx - who.ax), Math.round(cy - who.ay));
  }
}

export function StructureGenerator({ onBack }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<StructParams>(DEFAULT_SPARAMS);
  const [mode, setMode] = useState<ColorMode>('earth');
  const [cat, setCat] = useState<Category>('residential');
  const [size, setSize] = useState<Size>('small');
  const [typeSel, setTypeSel] = useState<string>('auto');
  const [era, setEra] = useState(0);
  const [variant, setVariant] = useState(0);
  const [dir, setDir] = useState<Dir8>('SE');
  const [night, setNight] = useState(false);
  // one level of detail only: the gameplay world (the regional map was removed from the game)
  const lod: Lod = 'gameplay';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2);

  const [live, setLive] = useState({ seed, params, mode });
  useEffect(() => { const id = setTimeout(() => setLive({ seed, params, mode }), 90); return () => clearTimeout(id); }, [seed, params, mode]);
  const culture = useMemo(() => makeCulture(live.seed, live.params, live.mode), [live]);

  const types = useMemo(() => typesFor(cat, size), [cat, size]);
  const type = typeSel !== 'auto' && types.some(t => t.id === typeSel) ? typeById(typeSel) : types[(variant + Math.floor(culture.r[80] * 7)) % types.length];
  const spec: StructSpec = useMemo(() => ({ culture, type: type.id, size, era, variant, night }), [culture, type.id, size, era, variant, night]);
  // regional LOD renders instantly; the gameplay one (4.5x bigger) comes from a worker, the last one stays up meanwhile
  const regional = useMemo(() => renderStructure(spec, dir, SFRAMES, LOD_K.regional), [spec, dir]);
  const [game, setGame] = useState<StructSprite | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (lod !== 'gameplay') return;
    let alive = true;
    setBusy(true);
    renderStructureAsync(spec, dir, LOD_K.gameplay).then(sp => { if (alive) { if (sp) setGame(sp); setBusy(false); } });
    return () => { alive = false; };
  }, [spec, dir, lod]);
  const sprite = lod === 'gameplay' && game ? game : regional;
  const gameplay = lod === 'gameplay' && !!game;
  // the builders: a citizen of a species from the same seed and world, in the clothes of the era
  const citizen = useMemo(() => {
    const p = culture.params;
    const g = makeGenome(culture.seed, { gravity: p.gravity, temperature: p.temperature, water: p.water, atmosphere: 0.5, star: p.star, diet: 0.5, exotic: p.exotic, size: 0.5 }, culture.mode);
    return { g, sprite: renderCreature(g, ERAS[era], 'SW', variant, 8, 'idle', CREATURE_K) };
  }, [culture, era, variant]);
  const who = gameplay ? citizen.sprite : null;
  const meta = eraMeta(ERAS[era]);
  const title = typeName(type, era);

  const W = Math.max(208, Math.ceil((sprite.w + (who ? who.w + 20 : 0) + 64) / 16) * 16);
  const below = sprite.h - sprite.ay;
  const H = Math.max(Math.round((W * 9) / 16), sprite.h + 56);
  const gy = H - Math.max(26, below + 18);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const fit = Math.min((el.clientWidth * dpr) / W, (el.clientHeight * dpr) / H);
      setScale((fit >= 1 ? Math.floor(fit) : fit) / dpr); // giant gameplay structures may need to shrink
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      paint(ctx, W, H, gy, spec, sprite, t, Math.floor(t * 8), who);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spec, sprite, W, H, gy, who]);

  // the same structure through the eight eras, rendered progressively
  const [eraThumbs, setEraThumbs] = useState<Record<number, HTMLCanvasElement>>({});
  useEffect(() => {
    let cancelled = false, i = 0;
    const next: Record<number, HTMLCanvasElement> = {};
    const run = () => {
      if (cancelled || i >= ERAS.length) return;
      const e = i++, d = structData({ ...spec, era: e }, 'SE', 1);
      next[e] = toCanvas(d.frames[0], d.w, d.h);
      setEraThumbs({ ...next });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(id); };
  }, [spec.culture, spec.type, spec.size, spec.variant, spec.night]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dirThumbs, setDirThumbs] = useState<Partial<Record<Dir8, HTMLCanvasElement>>>({});
  useEffect(() => {
    let cancelled = false, i = 0;
    const out: Partial<Record<Dir8, HTMLCanvasElement>> = {};
    const run = () => {
      if (cancelled || i >= DIRS.length) return;
      const d = DIRS[i++];
      out[d] = renderStructure(spec, d, SFRAMES).frames[0];
      setDirThumbs({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 120);
    return () => { cancelled = true; clearTimeout(id); };
  }, [spec]);

  const setParam = (k: keyof StructParams, v: number) => setParams(p => ({ ...p, [k]: v }));
  const randomWorld = () => setParams({ gravity: Math.random() * 0.8, temperature: Math.random(), water: Math.random(), exotic: Math.random() * 0.9, wealth: Math.random(), star: Math.random() });
  const info = describeCulture(culture);
  const K = useMemo(() => makeKit(culture, era, false), [culture, era]);
  const swatches = [K.wall, K.roof, K.trim, K.accent, K.glow].map(m => m.ramp[3]);

  const download = async (what: 'png' | 'sheet' | 'eras') => {
    const k = LOD_K[lod];
    const out = document.createElement('canvas');
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    if (what === 'png') {
      const k = 4, c = document.createElement('canvas');
      c.width = W; c.height = H;
      paint(c.getContext('2d')!, W, H, gy, spec, sprite, 0, 0, who);
      out.width = W * k; out.height = H * k;
      o.imageSmoothingEnabled = false;
      o.drawImage(c, 0, 0, W * k, H * k);
    } else if (what === 'sheet') {
      // gameplay sheet: one row per facing (E, SE, S, SW, W, NW, N, NE), one column per frame, 1:1 pixels
      setBusy(true);
      const sh = await structSheetAsync(spec, k);
      setBusy(false);
      if (!sh) return;
      out.width = sh.cw * sh.frames; out.height = sh.ch * DIRS.length;
      o.drawImage(toCanvas(sh.data, out.width, out.height), 0, 0);
    } else {
      const sps = ERAS.map((_, e) => structData({ ...spec, era: e }, dir, 1, k));
      const cw = Math.max(...sps.map(s => s.w)) + 12, ch = Math.max(...sps.map(s => s.h)) + 28;
      out.width = cw * 4 * 2; out.height = ch * 2 * 2 + 40;
      o.fillStyle = '#07090f'; o.fillRect(0, 0, out.width, out.height);
      o.fillStyle = '#e6e0c8'; o.font = 'bold 22px ui-sans-serif, system-ui'; o.fillText(`${type.name} — arquitetura ${culture.name}, 8 eras`, 16, 28);
      o.imageSmoothingEnabled = false;
      sps.forEach((s, e) => {
        const x = (e % 4) * cw * 2, y = 40 + Math.floor(e / 4) * ch * 2;
        o.drawImage(toCanvas(s.frames[0], s.w, s.h), x + (cw * 2 - s.w * 2) / 2, y + ch * 2 - 30 - s.h * 2, s.w * 2, s.h * 2);
        o.fillStyle = '#9aa3b8'; o.font = '14px ui-sans-serif, system-ui'; o.fillText(`${eraMeta(ERAS[e]).name} · ${typeName(type, e)}`, x + 8, y + ch * 2 - 8);
      });
    }
    const a = document.createElement('a');
    a.download = `${culture.name}-${type.id}-${size}-${lod}${what === 'eras' ? '-eras' : `-${meta.name}${what === 'sheet' ? '-sprites' : ''}`}.png`.replace(/\s+/g, '_');
    a.href = out.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#06070c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <Castle className="w-5 h-5 text-amber-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-amber-300 bg-clip-text text-transparent">GERADOR DE ESTRUTURAS</h1>
        <div className="ml-auto text-right hidden sm:block">
          <div className="italic font-serif text-lg leading-none text-amber-100">{title}</div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-neutral-500 mt-1">ARQUITETURA {culture.name.toUpperCase()} · SEMENTE {seed}{variant ? ` · VARIANTE ${variant}` : ''}</div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] min-h-0">
        {/* controls */}
        <aside className="order-2 lg:order-1 border-r border-white/5 bg-black/25 p-4 overflow-y-auto space-y-5">
          <section>
            <Label>Categoria</Label>
            <div className="grid grid-cols-1 gap-1">
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { setCat(c.id); setTypeSel('auto'); }} title={c.hint}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${cat === c.id ? 'bg-amber-300/15 border-amber-300/60 text-amber-100' : 'border-white/5 text-neutral-300 hover:bg-white/5'}`}>
                  {CAT_ICON[c.id]} {c.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <Label>Tamanho</Label>
            <div className="grid grid-cols-4 gap-1">
              {SIZES.map(s => (
                <button key={s.id} onClick={() => setSize(s.id)} title={s.span} className={`px-1 py-1.5 rounded-lg text-[11px] font-bold border ${size === s.id ? 'bg-amber-300 text-black border-amber-300' : 'border-white/10 text-neutral-300 hover:bg-white/10'}`}>{s.name}</button>
              ))}
            </div>
          </section>
          <section>
            <Label>Tipo</Label>
            <select value={typeSel} onChange={e => setTypeSel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="auto" className="bg-neutral-900">Automático (pela variante)</option>
              {types.map(t => <option key={t.id} value={t.id} className="bg-neutral-900">{t.name}</option>)}
            </select>
            <button onClick={() => setVariant(v => v + 1)} className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-amber-300/25 text-amber-200 hover:bg-amber-500/10">
              <Sparkles className="w-3.5 h-3.5" /> Outra variante (mesma arquitetura)
            </button>
          </section>
          <section>
            <Label>Semente da arquitetura</Label>
            <div className="flex gap-2">
              <input value={seed} onChange={e => { setSeed(e.target.value.toUpperCase().slice(0, 16)); setVariant(0); }}
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:border-amber-400/60" />
              <button onClick={() => { setSeed(randomSeed()); setVariant(0); }} title="Nova cultura" className="px-3 rounded-lg bg-amber-600/80 hover:bg-amber-500 border border-white/10"><Dices className="w-4 h-4" /></button>
            </div>
          </section>
          <section>
            <Label>Tipo de mundo</Label>
            <select value={mode} onChange={e => setMode(e.target.value as ColorMode)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="earth" className="bg-neutral-900">Earth-like — paleta natural</option>
              <option value="alien" className="bg-neutral-900">Alien-like — paleta alienígena</option>
            </select>
            <p className="mt-1.5 text-[10px] text-neutral-500 leading-relaxed">{mode === 'earth' ? 'Só a paleta é terrestre (pedra, madeira, barro, tijolo, concreto, vidro); as formas continuam livres.' : 'Pigmentos livres, tingidos pela luz da estrela.'}</p>
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
                  <input type="range" min={0} max={1} step={0.01} value={params[s.key]} onChange={e => setParam(s.key, +e.target.value)} className="w-full accent-amber-400" />
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* stage */}
        <main className="order-1 lg:order-2 flex flex-col min-h-0 min-w-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-w-0 min-h-[260px] sm:min-h-[340px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: "pixelated" }} className="absolute rounded-lg shadow-2xl" />
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono">
              <span className="text-amber-300">{CATEGORIES.find(c => c.id === cat)!.name.toUpperCase()}</span> <span className="text-neutral-400">· {SIZES.find(s => s.id === size)!.name} · {meta.name}{meta.years ? ` · ${meta.years}` : ''}</span>
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button onClick={() => setNight(n => !n)} className="flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] font-bold hover:bg-white/10">
                {night ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-sky-300" />} {night ? 'Dia' : 'Noite'}
              </button>
            </div>
            {busy && <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-neutral-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> renderizando…</div>}
            {gameplay && !busy && <div className="absolute bottom-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-neutral-400">ao lado: um(a) cidadão(ã) {citizen.g.name.people} da era, para escala</div>}
            <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 bg-black/60 border border-white/10 rounded-xl p-1.5" title="Direção (para o mapa de gameplay)">
              {(['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'] as (Dir8 | '')[]).map((d, i) => d ? (
                <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`w-7 h-7 rounded-md text-xs font-bold ${dir === d ? 'bg-amber-300 text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/15'}`}>{ARROWS[d]}</button>
              ) : <div key={i} className="w-7 h-7 flex items-center justify-center text-[9px] font-mono text-neutral-500">8×</div>)}
            </div>
          </div>

          {/* era timeline */}
          <div className="bg-black/40 border border-white/5 rounded-2xl px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono tracking-[0.2em] text-amber-300">ERA</span>
              <input type="range" min={0} max={ERAS.length - 1} step={1} value={era} onChange={e => setEra(+e.target.value)} className="flex-1 accent-amber-300" />
            </div>
            <div className="grid mt-2 gap-1" style={{ gridTemplateColumns: `repeat(${ERAS.length}, minmax(0, 1fr))` }}>
              {ERAS.map((s, i) => (
                <button key={s} onClick={() => setEra(i)} title={typeName(type, i)} className={`group flex flex-col items-center rounded-lg p-1 border transition-colors ${era === i ? 'border-amber-300/70 bg-amber-300/10' : 'border-transparent hover:border-white/10'}`}>
                  <Thumb canvas={eraThumbs[i] ?? null} />
                  <span className={`hidden md:block text-[9px] leading-tight text-center mt-1 ${era === i ? 'text-amber-200' : 'text-neutral-500 group-hover:text-neutral-300'}`}>{eraMeta(s).name}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* card */}
        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">ESTRUTURA</div>
            <div className="italic font-serif text-2xl text-amber-100 leading-tight">{title}</div>
            <div className="mt-1 text-sm font-bold text-amber-300">Arquitetura {culture.name}</div>
            <div className="text-[12px] text-neutral-400">construída pelo povo {citizen.g.name.people}</div>
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{type.blurb}</p>
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500 mb-1.5">8 DIREÇÕES</div>
            <div className="grid grid-cols-4 gap-1">
              {DIRS.map(d => (
                <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`rounded-lg border p-1 ${dir === d ? 'border-amber-300/70 bg-amber-300/10' : 'border-white/5 hover:border-white/15'}`}>
                  <Thumb canvas={dirThumbs[d] ?? null} />
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {[['Materiais', `${MAT_PT[K.wallKind] ?? K.wallKind} · telhado de ${MAT_PT[K.roofKind] ?? K.roofKind}`] as [string, string], ...info].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]">
                <span className="text-neutral-500">{k}</span><span className="text-neutral-200 text-right">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {swatches.map((c, i) => <div key={i} className="flex-1 h-6 rounded-md border border-white/10" style={{ background: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` }} title={['Paredes', 'Telhado', 'Acabamento', 'Pigmento', 'Luz'][i]} />)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => download('png')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Download className="w-3.5 h-3.5" /> PNG</button>
            <button onClick={() => download('sheet')} title="8 direções × 8 quadros, pixels 1:1, para o mapa de gameplay" className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Grid3x3 className="w-3.5 h-3.5" /> Sprites</button>
            <button onClick={() => download('eras')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Layers className="w-3.5 h-3.5" /> Eras</button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">{SFRAMES} quadros por direção · pixel art 2D desenhada por código (polígonos, elipses e cápsulas em rampas de cor com contorno seletivo), como as criaturas. As direções da esquerda são espelhadas das da direita. Animações: fumaça, fogo, velas de moinho, bandeiras, rodas, bombas, guindastes e luzes.</p>
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
