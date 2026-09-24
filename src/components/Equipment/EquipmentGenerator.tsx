import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Download, Sparkles, Grid3x3, Swords, Shield, Hand, Backpack, Shirt, Layers, Shuffle } from 'lucide-react';
import { makeGenome, DEFAULT_PARAMS, CreatureParams, ColorMode, STAGES } from '../../lib/creature/genome';
import { drawBackdrop, GROUND_Y } from '../../lib/creature/backdrop';
import { toCanvas } from '../../lib/creature/render';
import { Dir8, DIRS, DIR_PT, Anim } from '../../lib/creature/pose';
import { HAND_TYPES, handById, HandType } from '../../lib/equipment/hand';
import { AUX_TYPES, auxById } from '../../lib/equipment/aux';
import { WEAR_STYLES, wearById, PIECES, Piece } from '../../lib/equipment/wear';
import { matById, clsName } from '../../lib/equipment/materials';
import { Loadout, ItemSel, WearSel, equippedData, itemData, matsFor, eraStage } from '../../lib/equipment/loadout';
import { DEATHS, Death, DEATH_FRAMES } from '../../lib/creature/death';

interface Props { onBack: () => void }
const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const ERA_N = 8;
const eraMeta = (e: number) => STAGES.find(s => s.id === eraStage(e))!;
const ANIMS: [Anim, string][] = [['idle', 'Parado'], ['walk', 'Andando'], ['run', 'Correndo'], ['use', 'Usando']];
const ARROWS: Record<Dir8, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
const ALL_PIECES: Piece[] = PIECES.map(p => p.id);
type Tab = 'main' | 'off' | 'two' | 'aux' | 'wear';
const TABS: { id: Tab; name: string; icon: React.ReactNode }[] = [
  { id: 'main', name: 'Mão principal', icon: <Swords className="w-3.5 h-3.5" /> },
  { id: 'off', name: 'Mão secundária', icon: <Shield className="w-3.5 h-3.5" /> },
  { id: 'two', name: 'Duas mãos', icon: <Hand className="w-3.5 h-3.5" /> },
  { id: 'aux', name: 'Auxiliar', icon: <Backpack className="w-3.5 h-3.5" /> },
  { id: 'wear', name: 'Vestimenta', icon: <Shirt className="w-3.5 h-3.5" /> },
];
type SliderDef = { key: keyof CreatureParams; label: string; fmt: (v: number) => string };
const SLIDERS: SliderDef[] = [
  { key: 'temperature', label: 'Temperatura', fmt: v => `${Math.round(-60 + v * 140)} °C` },
  { key: 'water', label: 'Umidade', fmt: v => `${Math.round(v * 100)}%` },
  { key: 'gravity', label: 'Gravidade', fmt: v => `${(0.2 + v * 2.8).toFixed(1)} g` },
  { key: 'exotic', label: 'Exotismo', fmt: v => `${Math.round(v * 100)}%` },
  { key: 'size', label: 'Porte', fmt: v => (v < 0.3 ? 'Pequeno' : v < 0.7 ? 'Médio' : 'Grande') },
];

/** the best material of the same class the era already knows (a loadout keeps working when the era changes) */
function adaptMat(classes: string[], matId: string, e: number): string {
  const m = matById(matId);
  if (m.era <= e && classes.includes(m.cls)) return m.id;
  const same = matsFor([m.cls], e).filter(q => classes.includes(q.cls));
  if (same.length) return same[same.length - 1].id;
  const any = matsFor(classes, e);
  return any.length ? any[any.length - 1].id : m.id;
}
function adapt(L: Loadout, e: number): Loadout {
  const hand = (s?: ItemSel | null) => { const T = s && handById(s.type); if (!s || !T || (T.minEra ?? 0) > e) return null; return { ...s, mat: adaptMat(T.mats, s.mat, e) }; };
  const aux = (s?: ItemSel | null) => { const T = s && auxById(s.type); if (!s || !T) return null; return { ...s, mat: adaptMat(T.mats, s.mat, e) }; };
  const w = L.wear; const W = w && wearById(w.style);
  return {
    main: hand(L.main), off: hand(L.off), two: hand(L.two), back: aux(L.back), belt: aux(L.belt),
    wear: w && W ? ((W.minEra ?? 0) > e ? { ...w, style: 'civil' } : { ...w, mat: adaptMat(W.mats, w.mat, e) }) : null,
  };
}
/** first pick for a newly chosen type: the toughest material the era knows (cloth for plain clothes) */
function bestMat(classes: string[], e: number, soft = false): string {
  const ms = matsFor(soft && classes.includes('fiber') ? ['fiber'] : classes, e).filter(m => m.cls !== 'energy' || e >= 7);
  if (!ms.length) return matsFor(classes, 7)[0]?.id ?? 'wood';
  return ms.reduce((a, b) => (b.hard + b.era * 0.05 > a.hard + a.era * 0.05 ? b : a)).id;
}
const itemName = (T: HandType, e: number, mat: string) => `${T.eraNames?.[e] || T.name} de ${matById(mat).name}`;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function randomLoadout(e: number): Loadout {
  const ok = (T: HandType) => (T.minEra ?? 0) <= e && matsFor(T.mats, e).length > 0;
  const withMat = (T: { id: string; mats: string[] }): ItemSel => ({ type: T.id, mat: pick(matsFor(T.mats, e)).id, variant: Math.floor(Math.random() * 20) });
  const twoH = Math.random() < 0.4;
  const ones = HAND_TYPES.filter(t => t.slot === 'one' && ok(t)), twos = HAND_TYPES.filter(t => t.slot === 'two' && ok(t));
  const main = withMat(pick(ones.filter(t => t.id !== 'shield')));
  const offT = Math.random() < 0.5 ? handById('shield')! : pick(ones.filter(t => t.id === 'dagger' || t.id === 'light' || t.id === 'shield'));
  const two = withMat(pick(twos));
  const styles = WEAR_STYLES.filter(w => (w.minEra ?? 0) <= e && matsFor(w.mats, e).length);
  const ws = pick(styles);
  return {
    main: twoH ? null : main, off: twoH ? null : withMat(offT), two: twoH ? two : null,
    back: Math.random() < 0.6 ? withMat(two.type === 'bow' ? auxById('quiver')! : pick(AUX_TYPES.filter(a => a.slot === 'back'))) : null,
    belt: Math.random() < 0.6 ? withMat(pick(AUX_TYPES.filter(a => a.slot === 'belt'))) : null,
    wear: { style: ws.id, mat: pick(matsFor(ws.mats, e)).id, variant: Math.floor(Math.random() * 20), pieces: ALL_PIECES.filter(p => p !== 'cloak' || Math.random() < 0.4) },
  };
}

export function EquipmentGenerator({ onBack }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<CreatureParams>(DEFAULT_PARAMS);
  const [mode, setMode] = useState<ColorMode>('earth');
  const [era, setEra] = useState(1);
  const [anim, setAnim] = useState<Anim>('use');
  const [death, setDeath] = useState<Death | null>(null);
  const [dir, setDir] = useState<Dir8>('SE');
  const [tab, setTab] = useState<Tab>('main');
  const [load, setLoad] = useState<Loadout>({
    main: { type: 'sword', mat: 'bronze', variant: 0 }, off: { type: 'shield', mat: 'wood', variant: 0 }, two: null,
    back: { type: 'backpack', mat: 'leather', variant: 0 }, belt: { type: 'pouch', mat: 'leather', variant: 0 },
    wear: { style: 'leather', mat: 'leather', variant: 0, pieces: ALL_PIECES.filter(p => p !== 'cloak') },
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);

  const [live, setLive] = useState({ seed, params, mode });
  useEffect(() => { const id = setTimeout(() => setLive({ seed, params, mode }), 80); return () => clearTimeout(id); }, [seed, params, mode]);
  const g = useMemo(() => makeGenome(live.seed, live.params, live.mode), [live]);
  const eff = useMemo(() => adapt(load, era), [load, era]);
  const k = 1; // always the detailed level, like everything in the game
  const sprite = useMemo(() => {
    const d = equippedData(g, era, eff, dir, anim, 8, k, death ?? undefined);
    return { frames: d.frames.map(f => toCanvas(f, d.w, d.h)), w: d.w, h: d.h, ax: d.ax, ay: d.ay };
  }, [g, era, eff, dir, anim, k, death]);

  const W = Math.max(200, Math.ceil((sprite.w + 60) / 16) * 16), H = Math.max(Math.round(W * 9 / 16), sprite.h + 40);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const dpr = window.devicePixelRatio || 1; setScale(Math.max(1, Math.floor(Math.min((el.clientWidth * dpr) / W, (el.clientHeight * dpr) / H))) / dpr); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);
  useEffect(() => {
    const c = canvasRef.current!, ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      drawBackdrop(ctx, W, H, eraStage(era), g, t);
      const gy = GROUND_Y(H) + 3, img = sprite.frames[death ? Math.min(DEATH_FRAMES - 1, Math.floor((t % 3.6) * 7.5)) : Math.floor(t * (anim === 'use' ? 9 : 7)) % sprite.frames.length]; // a death plays once, holds, then replays
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(W / 2, gy, Math.min(sprite.w * 0.3, 40), 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(img, Math.round(W / 2 - sprite.ax), gy - sprite.ay);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sprite, W, H, g, era, anim, death]);

  // the focused item alone, 8 facings (like inventory icons)
  const focus: ItemSel | null = tab === 'main' ? eff.main ?? null : tab === 'off' ? eff.off ?? null : tab === 'two' ? eff.two ?? null : null;
  const [itemThumbs, setItemThumbs] = useState<Partial<Record<Dir8, HTMLCanvasElement>>>({});
  const [itemBig, setItemBig] = useState<{ frames: HTMLCanvasElement[]; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!focus) { setItemThumbs({}); setItemBig(null); return; }
    let cancelled = false, i = 0;
    const out: Partial<Record<Dir8, HTMLCanvasElement>> = {};
    const d = itemData(g, era, focus, 'SE', 8, 2);
    setItemBig({ frames: d.frames.map(f => toCanvas(f, d.w, d.h)), w: d.w, h: d.h });
    const run = () => { if (cancelled || i >= DIRS.length) return; const dd = DIRS[i++], s = itemData(g, era, focus, dd, 1, 1); out[dd] = toCanvas(s.frames[0], s.w, s.h); setItemThumbs({ ...out }); setTimeout(run, 0); };
    const id = setTimeout(run, 60);
    return () => { cancelled = true; clearTimeout(id); };
  }, [g, era, JSON.stringify(focus)]); // eslint-disable-line react-hooks/exhaustive-deps
  const bigRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = bigRef.current;
    if (!c || !itemBig) return;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      c.width = itemBig.w; c.height = itemBig.h;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(itemBig.frames[Math.floor(Math.max(0, now - t0) / 110) % itemBig.frames.length], 0, 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [itemBig]);

  // the same loadout through the eras
  const [eraThumbs, setEraThumbs] = useState<Record<number, HTMLCanvasElement>>({});
  useEffect(() => {
    let cancelled = false, e = 0;
    const out: Record<number, HTMLCanvasElement> = {};
    const run = () => { if (cancelled || e >= ERA_N) return; const ee = e++, d = equippedData(g, ee, adapt(load, ee), 'SE', 'idle', 1, 1); out[ee] = toCanvas(d.frames[0], d.w, d.h); setEraThumbs({ ...out }); setTimeout(run, 0); };
    const id = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [g, load]);

  const setSel = (slot: keyof Loadout, v: ItemSel | WearSel | null) => setLoad(L => {
    const n: Loadout = { ...L, [slot]: v };
    if (slot === 'two' && v) { n.main = null; n.off = null; }
    if ((slot === 'main' || slot === 'off') && v) n.two = null;
    return n;
  });
  const handPanel = (slot: 'main' | 'off' | 'two') => {
    const s = load[slot];
    const types = HAND_TYPES.filter(t => (slot === 'two' ? t.slot === 'two' : t.slot === 'one') && (t.minEra ?? 0) <= era);
    const T = s ? handById(s.type) : undefined;
    const mats = T ? matsFor(T.mats, era) : [];
    return (
      <div className="space-y-2">
        <select value={s?.type ?? ''} onChange={e => { const t = handById(e.target.value); setSel(slot, t ? { type: t.id, mat: s && t.mats.includes(matById(s.mat).cls) ? adaptMat(t.mats, s.mat, era) : bestMat(t.mats, era), variant: s?.variant ?? 0 } : null); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
          <option value="" className="bg-neutral-900">— nada —</option>
          {types.map(t => <option key={t.id} value={t.id} className="bg-neutral-900">{t.eraNames?.[era] || t.name}</option>)}
        </select>
        {s && T && <>
          <MatPick mats={mats} value={eff[slot]?.mat ?? s.mat} onChange={m => setSel(slot, { ...s, mat: m })} />
          <button onClick={() => setSel(slot, { ...s, variant: s.variant + 1 })} className="w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-orange-300/25 text-orange-200 hover:bg-orange-500/10"><Sparkles className="w-3.5 h-3.5" /> Outro desenho</button>
          <p className="text-[10px] text-neutral-500 leading-relaxed">{T.blurb}</p>
        </>}
      </div>
    );
  };
  const auxPanel = (slot: 'back' | 'belt', label: string) => {
    const s = load[slot], T = s ? auxById(s.type) : undefined;
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <select value={s?.type ?? ''} onChange={e => { const t = auxById(e.target.value); setSel(slot, t ? { type: t.id, mat: s && t.mats.includes(matById(s.mat).cls) ? adaptMat(t.mats, s.mat, era) : bestMat(t.mats, era), variant: s?.variant ?? 0 } : null); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
          <option value="" className="bg-neutral-900">— nada —</option>
          {AUX_TYPES.filter(a => a.slot === slot).map(t => <option key={t.id} value={t.id} className="bg-neutral-900">{t.eraNames?.[era] || t.name}</option>)}
        </select>
        {s && T && <div className="flex gap-2"><div className="flex-1"><MatPick mats={matsFor(T.mats, era)} value={eff[slot]?.mat ?? s.mat} onChange={m => setSel(slot, { ...s, mat: m })} /></div>
          <button title="Outro desenho" onClick={() => setSel(slot, { ...s, variant: s.variant + 1 })} className="px-3 rounded-lg border border-orange-300/25 text-orange-200 hover:bg-orange-500/10"><Sparkles className="w-3.5 h-3.5" /></button></div>}
      </div>
    );
  };
  const wearPanel = () => {
    const w = load.wear, S = w ? wearById(w.style) : undefined;
    return (
      <div className="space-y-2">
        <select value={w?.style ?? ''} onChange={e => { const st = WEAR_STYLES.find(x => x.id === e.target.value); setSel('wear', st ? { style: st.id, mat: bestMat(st.mats, era, st.id === 'simple' || st.id === 'padded' || st.id === 'civil'), variant: w?.variant ?? 0, pieces: w?.pieces ?? ALL_PIECES } : null); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
          <option value="" className="bg-neutral-900">— sem roupa —</option>
          {WEAR_STYLES.filter(s => (s.minEra ?? 0) <= era).map(s => <option key={s.id} value={s.id} className="bg-neutral-900">{s.name}</option>)}
        </select>
        {w && S && <>
          {S.id !== 'civil' && <MatPick mats={matsFor(S.mats, era)} value={eff.wear?.mat ?? w.mat} onChange={m => setSel('wear', { ...w, mat: m })} />}
          <button onClick={() => setSel('wear', { ...w, variant: w.variant + 1 })} className="w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-orange-300/25 text-orange-200 hover:bg-orange-500/10"><Sparkles className="w-3.5 h-3.5" /> {S.id === 'civil' ? 'Outro cidadão' : 'Outro desenho'}</button>
          {S.id !== 'civil' && <div className="flex flex-wrap gap-1">
            {PIECES.map(p => { const on = w.pieces.includes(p.id); return (
              <button key={p.id} onClick={() => setSel('wear', { ...w, pieces: on ? w.pieces.filter(q => q !== p.id) : [...w.pieces, p.id] })} className={`px-2 py-1 rounded-md text-[11px] font-bold border ${on ? 'bg-orange-300/20 border-orange-300/60 text-orange-100' : 'border-white/10 text-neutral-500 hover:text-neutral-200'}`}>{p.name}</button>
            ); })}
          </div>}
          <p className="text-[10px] text-neutral-500 leading-relaxed">{S.blurb} A criatura é gerada sem roupa e a vestimenta se ajusta ao corpo dela: porte, cabeça, pernas, braços extras e cauda.</p>
        </>}
      </div>
    );
  };

  const people = g.name.people, meta = eraMeta(era);
  const focusT = focus ? handById(focus.type) : undefined;
  const title = focusT && focus ? itemName(focusT, era, focus.mat) : tab === 'wear' && eff.wear ? `${wearById(eff.wear.style).name}${eff.wear.style !== 'civil' ? ` de ${matById(eff.wear.mat).name}` : ''}` : tab === 'aux' ? [eff.back, eff.belt].filter(Boolean).map(s => `${(auxById(s!.type)!.eraNames?.[era] || auxById(s!.type)!.name)} de ${matById(s!.mat).name}`).join(' · ') || 'Nada carregado' : 'Mãos livres';
  const lines: [string, string][] = [];
  if (eff.two) lines.push(['Duas mãos', itemName(handById(eff.two.type)!, era, eff.two.mat)]);
  if (eff.main) lines.push(['Mão principal', itemName(handById(eff.main.type)!, era, eff.main.mat)]);
  if (eff.off) lines.push(['Mão secundária', itemName(handById(eff.off.type)!, era, eff.off.mat)]);
  if (eff.back) lines.push(['Costas', `${auxById(eff.back.type)!.eraNames?.[era] || auxById(eff.back.type)!.name} de ${matById(eff.back.mat).name}`]);
  if (eff.belt) lines.push(['Cintura', `${auxById(eff.belt.type)!.eraNames?.[era] || auxById(eff.belt.type)!.name} de ${matById(eff.belt.mat).name}`]);
  if (eff.wear) lines.push(['Vestimenta', `${wearById(eff.wear.style).name}${eff.wear.style !== 'civil' ? ` (${matById(eff.wear.mat).name})` : ''}`]);

  const download = (what: 'png' | 'sheet' | 'item') => {
    const out = document.createElement('canvas'), o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    if (what === 'png') {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d')!; drawBackdrop(x, W, H, eraStage(era), g, 0); x.drawImage(sprite.frames[0], Math.round(W / 2 - sprite.ax), GROUND_Y(H) + 3 - sprite.ay);
      out.width = W * 4; out.height = H * 4; o.imageSmoothingEnabled = false; o.drawImage(c, 0, 0, W * 4, H * 4);
    } else if (what === 'sheet') {
      // gameplay sheet: per animation, one row per facing (E, SE, S, SW, W, NW, N, NE) x 8 frames, 1:1 pixels
      // with a death selected: that death in 8 facings x 16 frames; otherwise every animation
      const rows = death ? DIRS.map(d => equippedData(g, era, eff, d, 'die', DEATH_FRAMES, k, death)) : ANIMS.flatMap(([a]) => DIRS.map(d => equippedData(g, era, eff, d, a, 8, k)));
      const nf = death ? DEATH_FRAMES : 8;
      const cw = Math.max(...rows.map(r => r.w)), ch = Math.max(...rows.map(r => r.h));
      out.width = cw * nf; out.height = ch * rows.length;
      rows.forEach((r, i) => r.frames.forEach((f, j) => o.drawImage(toCanvas(f, r.w, r.h), j * cw + (cw - r.w) / 2, i * ch + (ch - r.h))));
    } else {
      if (!focus) return;
      const rows = DIRS.map(d => itemData(g, era, focus, d, 8, 1));
      const cw = Math.max(...rows.map(r => r.w)), ch = Math.max(...rows.map(r => r.h));
      out.width = cw * 8; out.height = ch * 8;
      rows.forEach((r, i) => r.frames.forEach((f, j) => o.drawImage(toCanvas(f, r.w, r.h), j * cw + (cw - r.w) / 2, i * ch + (ch - r.h) / 2)));
    }
    const a = document.createElement('a');
    a.download = `${people}-${what === 'item' && focus ? focus.type : 'equipado'}-${meta.name}${what === 'png' ? '' : '-sprites'}.png`.replace(/\s+/g, '_');
    a.href = out.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#06070c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <Swords className="w-5 h-5 text-orange-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-orange-300 bg-clip-text text-transparent">GERADOR DE EQUIPAMENTOS</h1>
        <div className="ml-auto text-right hidden sm:block">
          <div className="italic font-serif text-lg leading-none text-amber-100">{title}</div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-neutral-500 mt-1">POVO {people.toUpperCase()} · SEMENTE {seed}</div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[310px_1fr_290px] min-h-0">
        <aside className="order-2 lg:order-1 border-r border-white/5 bg-black/25 p-4 overflow-y-auto space-y-5">
          <section>
            <div className="grid grid-cols-5 gap-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} title={t.name} className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[9px] font-bold leading-tight ${tab === t.id ? 'bg-orange-300/15 border-orange-300/60 text-orange-100' : 'border-white/5 text-neutral-400 hover:bg-white/5'}`}>{t.icon}{t.name}</button>
              ))}
            </div>
            <div className="mt-3">
              {tab === 'main' && handPanel('main')}
              {tab === 'off' && handPanel('off')}
              {tab === 'two' && handPanel('two')}
              {tab === 'aux' && <div className="space-y-4">{auxPanel('back', 'Costas')}{auxPanel('belt', 'Cintura')}</div>}
              {tab === 'wear' && wearPanel()}
            </div>
            <button onClick={() => setLoad(randomLoadout(era))} className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg bg-orange-600/80 hover:bg-orange-500 border border-white/10"><Shuffle className="w-3.5 h-3.5" /> Equipamento aleatório</button>
          </section>
          <section>
            <Label>Espécie (quem fabrica e usa)</Label>
            <div className="flex gap-2">
              <input value={seed} onChange={e => setSeed(e.target.value.toUpperCase().slice(0, 16))} className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:border-orange-400/60" />
              <button onClick={() => setSeed(randomSeed())} title="Nova espécie" className="px-3 rounded-lg bg-orange-600/80 hover:bg-orange-500 border border-white/10"><Dices className="w-4 h-4" /></button>
            </div>
            <select value={mode} onChange={e => setMode(e.target.value as ColorMode)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="earth" className="bg-neutral-900">Earth-like — paleta natural</option>
              <option value="alien" className="bg-neutral-900">Alien-like — paleta alienígena</option>
            </select>
            <div className="space-y-2 mt-3">
              {SLIDERS.map(s => (
                <div key={s.key}>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-neutral-300">{s.label}</span><span className="font-mono text-cyan-200/90">{s.fmt(params[s.key])}</span></div>
                  <input type="range" min={0} max={1} step={0.01} value={params[s.key]} onChange={e => setParams(p => ({ ...p, [s.key]: +e.target.value }))} className="w-full accent-orange-400" />
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="order-1 lg:order-2 flex flex-col min-h-0 min-w-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-w-0 min-h-[260px] sm:min-h-[340px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: 'pixelated' }} className="absolute rounded-lg shadow-2xl" />
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono"><span className="text-orange-300">{meta.name.toUpperCase()}</span> <span className="text-neutral-400">· {meta.years} · povo {people}</span></div>
            <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
              <div className="flex gap-1 bg-black/60 border border-white/10 rounded-xl p-1">
                {ANIMS.map(([a, n]) => <button key={a} onClick={() => { setAnim(a); setDeath(null); }} className={`px-2 py-1 rounded-md text-[11px] font-bold ${anim === a && !death ? 'bg-orange-400 text-black' : 'text-neutral-300 hover:bg-white/10'}`}>{n}</button>)}
                <select value={death ?? ''} onChange={e => setDeath((e.target.value || null) as Death | null)} title="Animações de morte" className={`rounded-md text-[11px] font-bold px-1 ${death ? 'bg-red-600 text-white' : 'bg-transparent text-neutral-300'}`}>
                  <option value="" className="bg-neutral-900">Morte…</option>
                  {DEATHS.map(d => <option key={d.id} value={d.id} className="bg-neutral-900">{d.brutal ? '☠ ' : ''}{d.name}</option>)}
                </select>
              </div>
            </div>
            {itemBig && <div className="absolute bottom-3 left-3 bg-black/60 border border-white/10 rounded-xl p-2 flex flex-col items-center" title="O item sozinho">
              <canvas ref={bigRef} style={{ width: Math.min(itemBig.w * 2, 120), height: Math.min(itemBig.h * 2, 140), imageRendering: 'pixelated', objectFit: 'contain' }} />
              <span className="text-[9px] text-neutral-500 mt-1">item sozinho</span>
            </div>}
            <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 bg-black/60 border border-white/10 rounded-xl p-1.5" title="Direção (para o mapa de gameplay)">
              {(['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'] as (Dir8 | '')[]).map((d, i) => d ? (
                <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`w-7 h-7 rounded-md text-xs font-bold ${dir === d ? 'bg-amber-300 text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/15'}`}>{ARROWS[d]}</button>
              ) : <div key={i} className="w-7 h-7 flex items-center justify-center text-[9px] font-mono text-neutral-500">8×</div>)}
            </div>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-2xl px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono tracking-[0.2em] text-orange-300">ERA</span>
              <input type="range" min={0} max={ERA_N - 1} step={1} value={era} onChange={e => setEra(+e.target.value)} className="flex-1 accent-orange-300" />
            </div>
            <div className="grid mt-2 gap-1" style={{ gridTemplateColumns: `repeat(${ERA_N}, minmax(0, 1fr))` }}>
              {Array.from({ length: ERA_N }, (_, e) => (
                <button key={e} onClick={() => setEra(e)} className={`group flex flex-col items-center rounded-lg p-1 border ${era === e ? 'border-orange-300/70 bg-orange-300/10' : 'border-transparent hover:border-white/10'}`}>
                  <Thumb canvas={eraThumbs[e] ?? null} />
                  <span className={`hidden md:block text-[9px] leading-tight text-center mt-1 ${era === e ? 'text-orange-200' : 'text-neutral-500'}`}>{eraMeta(e).name}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">{TABS.find(t => t.id === tab)!.name.toUpperCase()}</div>
            <div className="italic font-serif text-2xl text-amber-100 leading-tight">{title}</div>
            <div className="mt-1 text-sm font-bold text-orange-300">feito e usado pelo povo {people}</div>
            {focus && <div className="text-[12px] text-neutral-400">{clsName(matById(focus.mat).cls)} · conhecido desde a era {eraMeta(matById(focus.mat).era).name.toLowerCase()}</div>}
          </div>
          {focus && <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500 mb-1.5">ITEM · 8 DIREÇÕES</div>
            <div className="grid grid-cols-4 gap-1">{DIRS.map(d => <div key={d} title={DIR_PT[d]} className="rounded-lg border border-white/5 p-1"><Thumb canvas={itemThumbs[d] ?? null} /></div>)}</div>
          </div>}
          <div className="rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {lines.map(([a, b]) => <div key={a} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]"><span className="text-neutral-500">{a}</span><span className="text-neutral-200 text-right">{b}</span></div>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => download('png')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Download className="w-3.5 h-3.5" /> PNG</button>
            <button onClick={() => download('sheet')} title="Criatura equipada: 4 animações × 8 direções × 8 quadros" className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Grid3x3 className="w-3.5 h-3.5" /> Sprites</button>
            <button onClick={() => download('item')} disabled={!focus} title="O item sozinho: 8 direções × 8 quadros" className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"><Layers className="w-3.5 h-3.5" /> Item</button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">Pixel art 2D desenhada por código, como as criaturas. Cada ferramenta pode ser feita de qualquer recurso que o tipo aceite e que a era já conheça; ao mudar a era, o material mais próximo é usado. "Usando" mostra a criatura golpeando, estocando, erguendo a luz, bloqueando, puxando o arco ou mirando.</p>
        </aside>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) { return <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">{children}</div>; }
function MatPick({ mats, value, onChange }: { mats: { id: string; name: string; cls: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs">
      {mats.map(m => <option key={m.id} value={m.id} className="bg-neutral-900">{m.name} · {clsName(m.cls as never)}</option>)}
    </select>
  );
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
    const s = Math.min(c.width / canvas.width, c.height / canvas.height), k = s >= 1 ? Math.floor(s) : s;
    x.drawImage(canvas, (c.width - canvas.width * k) / 2, (c.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  }, [canvas]);
  return <canvas ref={ref} width={64} height={48} className="w-full max-w-[64px] aspect-[4/3]" style={{ imageRendering: 'pixelated' }} />;
}
