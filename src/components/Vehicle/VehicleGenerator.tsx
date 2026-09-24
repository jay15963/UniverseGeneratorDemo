import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Download, Sparkles, Layers, Grid3x3, Ship, Moon, Sun, Truck, Plane, Anchor, Loader2, Pause, Play, Zap } from 'lucide-react';
import { makeCulture, describeCulture, ERAS, eraMeta, StructParams, DEFAULT_SPARAMS, ColorMode } from '../../lib/structure/genome';
import { toCanvas, LOD_K, CREATURE_K } from '../../lib/structure/render';
import { makeGenome, Stage, Genome } from '../../lib/creature/genome';
import { renderCreature, CreatureSprite } from '../../lib/creature/render';
import { makeKit } from '../../lib/structure/kit';
import { drawStructBackdrop } from '../../lib/structure/backdrop';
import { Dir8, DIRS, DIR_PT } from '../../lib/creature/pose';
import { DOMAINS, CLASSES, VSIZES, Domain, VClass, VSize, vtypesFor, vtypeById, vtypeName, available, firstEra, VType } from '../../lib/vehicle/catalog';
import { vehicleData, VSpec, VFRAMES } from '../../lib/vehicle/render';
import { renderVehicleAsync, vehicleSheetAsync, VehSprite } from '../../lib/vehicle/vehAsync';
import type { VAnim } from '../../lib/vehicle/vparts';

interface Props { onBack: () => void }

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
type SliderDef = { key: keyof StructParams; label: string; fmt: (v: number) => string; hint: string };
const SLIDERS: SliderDef[] = [
  { key: 'gravity', label: 'Gravidade', fmt: v => `${(0.2 + v * 2.8).toFixed(1)} g`, hint: 'O mundo natal da cultura que constrói os veículos.' },
  { key: 'temperature', label: 'Temperatura', fmt: v => `${Math.round(-60 + v * 140)} °C`, hint: 'Frio: pintura militar de neve. Calor seco: areia.' },
  { key: 'water', label: 'Umidade / chuva', fmt: v => `${Math.round(v * 100)}%`, hint: 'Úmido: camuflagem de selva. Seco: deserto.' },
  { key: 'exotic', label: 'Exotismo', fmt: v => `${Math.round(v * 100)}%`, hint: 'Formas menos humanas: pernas mecânicas mais cedo, cascos arredondados, andadores de inseto.' },
  { key: 'wealth', label: 'Riqueza', fmt: v => (v < 0.33 ? 'Austera' : v < 0.66 ? 'Próspera' : 'Opulenta'), hint: 'Materiais e acabamentos.' },
  { key: 'star', label: 'Estrela', fmt: v => (v < 0.2 ? 'Anã vermelha' : v < 0.45 ? 'Laranja (K)' : v < 0.7 ? 'Amarela (G)' : v < 0.88 ? 'Branca (F)' : 'Gigante azul'), hint: 'Tinge o céu e, no modo alienígena, os pigmentos.' },
];
const DOMAIN_ICON: Record<Domain, React.ReactNode> = { land: <Truck className="w-4 h-4" />, naval: <Anchor className="w-4 h-4" />, air: <Plane className="w-4 h-4" /> };
const MOVE_PT: Record<Domain, string> = { land: 'Andando', naval: 'Navegando', air: 'Voando' };
const ARROWS: Record<Dir8, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
type RGB = [number, number, number];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** the sea: from a horizon line down, with ripples drifting */
function drawSea(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, water: RGB[], night: boolean, t: number) {
  const hz = Math.round(gy - Math.min(60, gy * 0.35)), dim = night ? 0.45 : 1;
  const c = (i: number): RGB => [water[i][0] * dim, water[i][1] * dim, water[i][2] * dim];
  const steps = 6;
  for (let i = 0; i < steps; i++) { ctx.fillStyle = css(c(Math.min(5, 3 + Math.floor((i * 3) / steps)) as number)); ctx.fillRect(0, hz + Math.floor(((H - hz) * i) / steps), W, Math.ceil((H - hz) / steps) + 1); }
  ctx.fillStyle = css(c(4), 0.9);
  ctx.fillRect(0, hz, W, 1);
  for (let i = 0; i < 70; i++) {
    const y = hz + 3 + ((i * 37) % Math.max(1, H - hz - 3)), sp = 2 + (i % 5), x = ((i * 91 + t * sp * 4) % (W + 40)) - 20, w = 4 + ((i * 13) % 9) * (0.4 + (y - hz) / (H - hz));
    ctx.fillStyle = css(i % 3 ? c(5) : c(1), 0.55);
    ctx.fillRect(x | 0, y | 0, w | 0, 1);
  }
}

/** a draught beast for the preview (never part of the asset): a four-legged herbivore of the same world */
function beastGenome(seed: string, p: StructParams, mode: ColorMode): Genome {
  let g: Genome | null = null;
  for (let i = 0; i < 16; i++) {
    g = makeGenome(`${seed}-TRACAO-${i}`, { gravity: p.gravity, temperature: p.temperature, water: p.water, atmosphere: 0.5, star: p.star, diet: 0.05, exotic: p.exotic * 0.6, size: 0.85 }, mode);
    if (g.locomotion === 'quadruped' && g.wings === 'none') return g;
  }
  return g!;
}

interface Scene { sp: VehSprite; who: CreatureSprite | null; beast: CreatureSprite | null; naval: boolean; night: boolean; water: RGB[]; ground: RGB }
function paint(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, spec: VSpec, sc: Scene, t: number, frame: number) {
  drawStructBackdrop(ctx, W, H, gy, spec.culture, sc.ground, spec.night, t);
  if (sc.naval) drawSea(ctx, W, H, gy, sc.water, spec.night, t);
  const { sp, who, beast } = sc;
  const n = sp.frames.length, bx = Math.round(W / 2 - (who ? who.w / 2 + 8 : 0));
  if (!sc.naval) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(bx, gy + 2, Math.min(sp.w * 0.4, W * 0.45), Math.max(3, sp.w * 0.06), 0, 0, Math.PI * 2); ctx.fill(); }
  const f = ((frame % n) + n) % n;
  const drawBeast = () => {
    if (!beast || !sp.hitch) return;
    const L = Math.hypot(sp.hitch.x, sp.hitch.y) || 1, ux = sp.hitch.x / L, uy = sp.hitch.y / L, reach = beast.w * 0.3;
    const cx = bx + sp.hitch.x + ux * reach, cy = gy + sp.hitch.y + uy * reach;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, beast.w * 0.3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(beast.frames[frame % beast.frames.length], Math.round(cx - beast.ax), Math.round(cy - beast.ay));
  };
  const beastFront = !!sp.hitch && sp.hitch.z > 0;
  if (!beastFront) drawBeast();
  ctx.drawImage(sp.frames[f], Math.round(bx - sp.ax), Math.round(gy - sp.ay));
  if (beastFront) drawBeast();
  if (who) { // a citizen of the builders' species, in the era's clothes, for scale
    const cx = bx + (sp.w - sp.ax) + 10 + who.ax, cy = sc.naval ? gy + 12 : gy + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy, who.w * 0.35, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(who.frames[Math.max(0, Math.floor(t * 7)) % who.frames.length], Math.round(cx - who.ax), Math.round(cy - who.ay));
  }
}

export function VehicleGenerator({ onBack }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<StructParams>(DEFAULT_SPARAMS);
  const [mode, setMode] = useState<ColorMode>('earth');
  const [domain, setDomain] = useState<Domain>('land');
  const [cls, setCls] = useState<VClass>('civil');
  const [typeSel, setTypeSel] = useState<string>('');
  const [sizeSel, setSizeSel] = useState<VSize>('medium');
  const [era, setEra] = useState(1);
  const [variant, setVariant] = useState(0);
  const [dir, setDir] = useState<Dir8>('SE');
  const [night, setNight] = useState(false);
  const [anim, setAnim] = useState<VAnim>('move');
  const [paused, setPaused] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const [live, setLive] = useState({ seed, params, mode });
  useEffect(() => { const id = setTimeout(() => setLive({ seed, params, mode }), 90); return () => clearTimeout(id); }, [seed, params, mode]);
  const culture = useMemo(() => makeCulture(live.seed, live.params, live.mode), [live]);

  const classes = CLASSES.filter(c => vtypesFor(domain, c.id).length > 0);
  const types = vtypesFor(domain, classes.some(c => c.id === cls) ? cls : classes[0].id);
  const type: VType = types.find(t => t.id === typeSel) ?? types[variant % types.length];
  const size: VSize = type.sizes.includes(sizeSel) ? sizeSel : type.sizes[Math.min(type.sizes.length - 1, 1)] ?? type.sizes[0];
  const exists = available(type, era, size);
  const vAnim: VAnim = anim === 'use' && !type.use ? 'move' : anim;
  const spec: VSpec = useMemo(() => ({ culture, type: type.id, size, era, variant, night, anim: vAnim }), [culture, type.id, size, era, variant, night, vAnim]);

  const [sprite, setSprite] = useState<VehSprite | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!exists) { setBusy(false); return; }
    let alive = true;
    setBusy(true);
    renderVehicleAsync(spec, dir, LOD_K.gameplay).then(sp => { if (alive) { if (sp) setSprite(sp); setBusy(false); } });
    return () => { alive = false; };
  }, [spec, dir, exists]);

  // the builders: a citizen of a species from the same seed and world, in the clothes of the era
  const citizen = useMemo(() => {
    const p = culture.params;
    const g = makeGenome(culture.seed, { gravity: p.gravity, temperature: p.temperature, water: p.water, atmosphere: 0.5, star: p.star, diet: 0.5, exotic: p.exotic, size: 0.5 }, culture.mode);
    return { g, sprite: renderCreature(g, ERAS[era], 'SW', variant, 8, 'idle', CREATURE_K) };
  }, [culture, era, variant]);
  const pulled = type.beastUntil !== undefined && era <= type.beastUntil;
  const beastG = useMemo(() => beastGenome(culture.seed, culture.params, culture.mode), [culture]);
  const beast = useMemo(() => (pulled ? renderCreature(beastG, Stage.LAND, dir, 0, 8, vAnim === 'move' ? 'walk' : 'idle', CREATURE_K) : null), [pulled, beastG, dir, vAnim]);
  const K = useMemo(() => makeKit(culture, era, night), [culture, era, night]);
  const meta = eraMeta(ERAS[era]);
  const title = exists ? vtypeName(type, era, size) : vtypeName(type, firstEra(type), size);

  const sp = sprite;
  const extra = beast && sp?.hitch ? beast.w * 1.2 : 0;
  const W = sp ? Math.max(320, Math.ceil((sp.w + citizen.sprite.w + 20 + extra * 2 + 64) / 16) * 16) : 320;
  const below = sp ? sp.h - sp.ay : 20;
  const H = sp ? Math.max(Math.round((W * 9) / 16), sp.h + 70 + (beast ? beast.h * 0.5 : 0)) : 180;
  const gy = H - Math.max(domain === 'naval' ? 40 : 26, below + 18);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const fit = Math.min((el.clientWidth * dpr) / W, (el.clientHeight * dpr) / H);
      setScale((fit >= 1 ? Math.floor(fit) : fit) / dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  const scene: Scene | null = sp ? { sp, who: citizen.sprite, beast, naval: domain === 'naval', night, water: K.water.ramp as RGB[], ground: K.groundRGB } : null;
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    let frozen = 0;
    const loop = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      if (!paused) frozen = t;
      if (scene) paint(ctx, W, H, gy, spec, scene, frozen, Math.floor(frozen * 8));
      else { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spec, scene?.sp, scene?.beast, W, H, gy, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // the same design through the eight eras (blank where the type does not exist yet)
  const [eraThumbs, setEraThumbs] = useState<Record<number, HTMLCanvasElement | null>>({});
  useEffect(() => {
    let cancelled = false, i = 0;
    const next: Record<number, HTMLCanvasElement | null> = {};
    const run = () => {
      if (cancelled || i >= ERAS.length) return;
      const e = i++;
      if (available(type, e, size)) { const d = vehicleData({ ...spec, era: e, anim: 'idle' }, 'SE', 1, 0.5); next[e] = toCanvas(d.frames[0], d.w, d.h); } else next[e] = null;
      setEraThumbs({ ...next });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [spec.culture, spec.type, spec.size, spec.variant, spec.night]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dirThumbs, setDirThumbs] = useState<Partial<Record<Dir8, HTMLCanvasElement>>>({});
  useEffect(() => {
    let cancelled = false, i = 0;
    const out: Partial<Record<Dir8, HTMLCanvasElement>> = {};
    if (!exists) { setDirThumbs({}); return; }
    const run = () => {
      if (cancelled || i >= DIRS.length) return;
      const d = DIRS[i++], v = vehicleData({ ...spec, anim: 'idle' }, d, 1, 0.6);
      out[d] = toCanvas(v.frames[0], v.w, v.h);
      setDirThumbs({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 150);
    return () => { cancelled = true; clearTimeout(id); };
  }, [spec.culture, spec.type, spec.size, spec.variant, spec.night, spec.era, exists]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (k: keyof StructParams, v: number) => setParams(p => ({ ...p, [k]: v }));
  const randomWorld = () => setParams({ gravity: Math.random() * 0.8, temperature: Math.random(), water: Math.random(), exotic: Math.random() * 0.9, wealth: Math.random(), star: Math.random() });
  const info = describeCulture(culture);
  const pickDomain = (d: Domain) => { setDomain(d); setTypeSel(''); if (!CLASSES.some(c => c.id === cls && vtypesFor(d, c.id).length)) setCls('civil'); if (d === 'air' && era < 3) setEra(3); };

  const download = async (what: 'png' | 'sheet' | 'eras') => {
    if (!scene || !exists) return;
    const out = document.createElement('canvas');
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    if (what === 'png') {
      const k = 2, c = document.createElement('canvas');
      c.width = W; c.height = H;
      paint(c.getContext('2d')!, W, H, gy, spec, scene, 0, 0);
      out.width = W * k; out.height = H * k;
      o.imageSmoothingEnabled = false;
      o.drawImage(c, 0, 0, W * k, H * k);
    } else if (what === 'sheet') {
      // one row per facing (E, SE, S, SW, W, NW, N, NE), one column per frame, 1:1 pixels, current animation
      setBusy(true);
      const sh = await vehicleSheetAsync(spec, LOD_K.gameplay);
      setBusy(false);
      if (!sh) return;
      out.width = sh.cw * sh.frames; out.height = sh.ch * DIRS.length;
      o.drawImage(toCanvas(sh.data, out.width, out.height), 0, 0);
    } else {
      const es = ERAS.map((_, e) => e).filter(e => available(type, e, size));
      const sps = es.map(e => vehicleData({ ...spec, era: e, anim: 'idle' }, dir, 1, 2));
      const cw = Math.max(...sps.map(s => s.w)) + 16, ch = Math.max(...sps.map(s => s.h)) + 30;
      out.width = cw * 4; out.height = ch * Math.ceil(sps.length / 4) + 40;
      o.fillStyle = '#07090f'; o.fillRect(0, 0, out.width, out.height);
      o.fillStyle = '#e6e0c8'; o.font = 'bold 20px ui-sans-serif, system-ui'; o.fillText(`${CLASSES.find(c => c.id === type.cls)!.name} ${DOMAINS.find(d => d.id === domain)!.name.toLowerCase()} — ${culture.name}`, 16, 28);
      sps.forEach((s, i) => {
        const x = (i % 4) * cw, y = 40 + Math.floor(i / 4) * ch;
        o.drawImage(toCanvas(s.frames[0], s.w, s.h), x + (cw - s.w) / 2, y + ch - 26 - s.h);
        o.fillStyle = '#9aa3b8'; o.font = '13px ui-sans-serif, system-ui'; o.fillText(`${eraMeta(ERAS[es[i]]).name} · ${vtypeName(type, es[i], size)}`, x + 8, y + ch - 8);
      });
    }
    const a = document.createElement('a');
    a.download = `${culture.name}-${type.id}-${size}${what === 'eras' ? '-eras' : `-${meta.name}${what === 'sheet' ? `-${vAnim}-sprites` : ''}`}.png`.replace(/\s+/g, '_');
    a.href = out.toDataURL('image/png');
    a.click();
  };

  const animBtns: [VAnim, string][] = [['idle', domain === 'air' && type.id === 'airTransformer' ? 'Andador' : 'Parado'], ['move', MOVE_PT[domain]]];
  if (type.use) animBtns.push(['use', type.use]);

  return (
    <div className="min-h-screen lg:h-screen bg-[#06070c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <Ship className="w-5 h-5 text-sky-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-sky-300 bg-clip-text text-transparent">GERADOR DE VEÍCULOS</h1>
        <div className="ml-auto text-right hidden sm:block">
          <div className="italic font-serif text-lg leading-none text-sky-100">{title}</div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-neutral-500 mt-1">ENGENHARIA {culture.name.toUpperCase()} · SEMENTE {seed}{variant ? ` · VARIANTE ${variant}` : ''}</div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] min-h-0">
        {/* controls */}
        <aside className="order-2 lg:order-1 border-r border-white/5 bg-black/25 p-4 overflow-y-auto space-y-5">
          <section>
            <Label>Domínio</Label>
            <div className="grid grid-cols-3 gap-1">
              {DOMAINS.map(d => (
                <button key={d.id} onClick={() => pickDomain(d.id)} title={d.hint}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-bold border ${domain === d.id ? 'bg-sky-300/15 border-sky-300/60 text-sky-100' : 'border-white/5 text-neutral-300 hover:bg-white/5'}`}>
                  {DOMAIN_ICON[d.id]} {d.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <Label>Categoria</Label>
            <div className="grid grid-cols-2 gap-1">
              {classes.map(c => (
                <button key={c.id} onClick={() => { setCls(c.id); setTypeSel(''); }} title={c.hint}
                  className={`px-2 py-1.5 rounded-lg text-[12px] border ${type.cls === c.id ? 'bg-sky-300/15 border-sky-300/60 text-sky-100' : 'border-white/5 text-neutral-300 hover:bg-white/5'}`}>{c.name}</button>
              ))}
            </div>
          </section>
          <section>
            <Label>Tipo</Label>
            <select value={type.id} onChange={e => setTypeSel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              {types.map(t => <option key={t.id} value={t.id} className="bg-neutral-900">{available(t, era, t.sizes.includes(size) ? size : t.sizes[0]) ? vtypeName(t, era, t.sizes.includes(size) ? size : t.sizes[0]) : `${vtypeName(t, firstEra(t), t.sizes[0])} (a partir da era ${eraMeta(ERAS[firstEra(t)]).name})`}</option>)}
            </select>
            <button onClick={() => { setVariant(v => v + 1); }} className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-sky-300/25 text-sky-200 hover:bg-sky-500/10">
              <Sparkles className="w-3.5 h-3.5" /> Outro projeto (mesma engenharia)
            </button>
          </section>
          <section>
            <Label>Porte</Label>
            <div className="grid grid-cols-3 gap-1">
              {VSIZES.map(s => {
                const ok = type.sizes.includes(s.id);
                return <button key={s.id} disabled={!ok} onClick={() => setSizeSel(s.id)} title={ok ? '' : 'Este tipo não tem esse porte'} className={`px-1 py-1.5 rounded-lg text-[11px] font-bold border ${size === s.id ? 'bg-sky-300 text-black border-sky-300' : ok ? 'border-white/10 text-neutral-300 hover:bg-white/10' : 'border-white/5 text-neutral-600 cursor-not-allowed'}`}>{s.name}</button>;
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-neutral-500 leading-relaxed">{domain === 'naval' ? 'Navios têm sempre o dobro do tamanho dos veículos terrestres e aéreos do mesmo porte.' : type.sizes.length === 1 ? 'Este tipo tem tamanho único.' : pulled ? 'O porte muda pouco o tamanho, mas aumenta a capacidade de carga.' : 'Pequeno, médio e grande, como as estruturas.'}</p>
          </section>
          <section>
            <Label>Semente da engenharia</Label>
            <div className="flex gap-2">
              <input value={seed} onChange={e => { setSeed(e.target.value.toUpperCase().slice(0, 16)); setVariant(0); }}
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:border-sky-400/60" />
              <button onClick={() => { setSeed(randomSeed()); setVariant(0); }} title="Nova cultura" className="px-3 rounded-lg bg-sky-700/80 hover:bg-sky-600 border border-white/10"><Dices className="w-4 h-4" /></button>
            </div>
          </section>
          <section>
            <Label>Tipo de mundo</Label>
            <select value={mode} onChange={e => setMode(e.target.value as ColorMode)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="earth" className="bg-neutral-900">Earth-like — paleta natural</option>
              <option value="alien" className="bg-neutral-900">Alien-like — paleta alienígena</option>
            </select>
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
                  <input type="range" min={0} max={1} step={0.01} value={params[s.key]} onChange={e => setParam(s.key, +e.target.value)} className="w-full accent-sky-400" />
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* stage */}
        <main className="order-1 lg:order-2 flex flex-col min-h-0 min-w-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-w-0 min-h-[260px] sm:min-h-[340px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: 'pixelated', opacity: exists ? 1 : 0.15 }} className="absolute rounded-lg shadow-2xl" />
            {!exists && <div className="absolute inset-0 flex items-center justify-center p-6 text-center"><div className="bg-black/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-neutral-300 max-w-sm">Este veículo ainda não existe na era <b className="text-sky-200">{meta.name}</b>. Surge na era <b className="text-sky-200">{eraMeta(ERAS[firstEra(type)]).name}</b>.<button onClick={() => setEra(firstEra(type))} className="block mx-auto mt-2 text-[12px] font-bold text-sky-300 hover:text-sky-100">Ir para essa era →</button></div></div>}
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono">
              <span className="text-sky-300">{DOMAINS.find(d => d.id === domain)!.name.toUpperCase()} · {CLASSES.find(c => c.id === type.cls)!.name.toUpperCase()}</span> <span className="text-neutral-400">· {VSIZES.find(s => s.id === size)!.name} · {meta.name}</span>
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              {animBtns.map(([a, label]) => (
                <button key={a} onClick={() => setAnim(a)} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold border ${vAnim === a ? 'bg-sky-300 text-black border-sky-300' : 'bg-black/60 border-white/10 hover:bg-white/10'}`}>{a === 'use' && <Zap className="w-3.5 h-3.5" />}{label}</button>
              ))}
              <button onClick={() => setPaused(p => !p)} title={paused ? 'Continuar' : 'Pausar'} className="bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 hover:bg-white/10">{paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}</button>
              <button onClick={() => setNight(n => !n)} title={night ? 'Dia' : 'Noite'} className="bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 hover:bg-white/10">{night ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-sky-300" />}</button>
            </div>
            {busy && <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-neutral-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> renderizando…</div>}
            {!busy && exists && <div className="absolute bottom-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-neutral-400 max-w-[60%]">ao lado: um(a) cidadão(ã) {citizen.g.name.people} da era, para escala{beast ? ' · o animal de tração é só ilustrativo (no jogo, criaturas são atreladas)' : ''}</div>}
            <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 bg-black/60 border border-white/10 rounded-xl p-1.5" title="Direção (para o mapa de gameplay)">
              {(['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'] as (Dir8 | '')[]).map((d, i) => d ? (
                <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`w-7 h-7 rounded-md text-xs font-bold ${dir === d ? 'bg-sky-300 text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/15'}`}>{ARROWS[d]}</button>
              ) : <div key={i} className="w-7 h-7 flex items-center justify-center text-[9px] font-mono text-neutral-500">8×</div>)}
            </div>
          </div>

          {/* era timeline */}
          <div className="bg-black/40 border border-white/5 rounded-2xl px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono tracking-[0.2em] text-sky-300">ERA</span>
              <input type="range" min={0} max={ERAS.length - 1} step={1} value={era} onChange={e => setEra(+e.target.value)} className="flex-1 accent-sky-300" />
            </div>
            <div className="grid mt-2 gap-1" style={{ gridTemplateColumns: `repeat(${ERAS.length}, minmax(0, 1fr))` }}>
              {ERAS.map((s, i) => {
                const ok = available(type, i, size);
                return (
                  <button key={s} onClick={() => setEra(i)} title={ok ? vtypeName(type, i, size) : 'não existe nesta era'} className={`group flex flex-col items-center rounded-lg p-1 border transition-colors ${era === i ? 'border-sky-300/70 bg-sky-300/10' : 'border-transparent hover:border-white/10'} ${ok ? '' : 'opacity-40'}`}>
                    {ok ? <Thumb canvas={eraThumbs[i] ?? null} /> : <div className="w-full max-w-[64px] aspect-[4/3] flex items-center justify-center text-[16px] text-neutral-600">—</div>}
                    <span className={`hidden md:block text-[9px] leading-tight text-center mt-1 ${era === i ? 'text-sky-200' : 'text-neutral-500 group-hover:text-neutral-300'}`}>{eraMeta(s).name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* card */}
        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">VEÍCULO</div>
            <div className="italic font-serif text-2xl text-sky-100 leading-tight">{title}</div>
            <div className="mt-1 text-sm font-bold text-sky-300">Engenharia {culture.name}</div>
            <div className="text-[12px] text-neutral-400">construído pelo povo {citizen.g.name.people}</div>
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{type.blurb}</p>
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500 mb-1.5">8 DIREÇÕES</div>
            <div className="grid grid-cols-4 gap-1">
              {DIRS.map(d => (
                <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`rounded-lg border p-1 ${dir === d ? 'border-sky-300/70 bg-sky-300/10' : 'border-white/5 hover:border-white/15'}`}>
                  <Thumb canvas={dirThumbs[d] ?? null} />
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {([['Domínio', DOMAINS.find(d => d.id === domain)!.name], ['Categoria', CLASSES.find(c => c.id === type.cls)!.name], ['Porte', `${VSIZES.find(s => s.id === size)!.name}${type.sizes.length === 1 ? ' (único)' : ''}`], ['Animações', animBtns.map(b => b[1]).join(' · ')]] as [string, string][]).concat(info).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]">
                <span className="text-neutral-500">{k}</span><span className="text-neutral-200 text-right">{v}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => download('png')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Download className="w-3.5 h-3.5" /> PNG</button>
            <button onClick={() => download('sheet')} title="8 direções × 8 quadros da animação atual, pixels 1:1, para o mapa de gameplay" className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Grid3x3 className="w-3.5 h-3.5" /> Sprites</button>
            <button onClick={() => download('eras')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Layers className="w-3.5 h-3.5" /> Eras</button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">{VFRAMES} quadros por direção e animação · pixel art 2D desenhada por código, como as criaturas e as estruturas. Torretas giram independentes do corpo; rodas, esteiras, pernas, hélices, rotores, velas e remos se movem; disparos, fumaça e esteira na água são animados.</p>
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
