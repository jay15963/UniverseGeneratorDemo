import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Dices, Dna, Download, Sparkles, Layers, Users, Grid3x3, GitBranch, Play } from 'lucide-react';
import { makeGenome, describe, STAGES, Stage, CreatureParams, DEFAULT_PARAMS, Locomotion, Covering, LegType, Genome, ColorMode, isCiv } from '../../lib/creature/genome';
import { renderCreature, CreatureSprite, FRAMES, animsFor, ANIM_PT, Anim, spriteSheet, toCanvas } from '../../lib/creature/render';
import { drawBackdrop, GROUND_Y } from '../../lib/creature/backdrop';
import { Dir8, DIRS, DIR_PT } from '../../lib/creature/pose';

export interface PickMode {
  /** landing: the player designs their species and plays its tribal era */
  params: CreatureParams; mode: ColorMode; planetName: string;
  onPick: (g: Genome, citizen: number) => void;
}
interface Props { onBack: () => void; pick?: PickMode }

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

type SliderDef = { key: keyof CreatureParams; label: string; fmt: (v: number) => string; hint: string };
const SLIDERS: SliderDef[] = [
  { key: 'gravity', label: 'Gravidade', fmt: v => `${(0.2 + v * 2.8).toFixed(1)} g`, hint: 'Alta: corpos baixos e robustos, pernas colunares. Baixa: pernas longas, voo.' },
  { key: 'temperature', label: 'Temperatura', fmt: v => `${Math.round(-60 + v * 140)} °C`, hint: 'Frio: pelos claros e densos, penas. Calor: escamas, quitina, orelhas grandes.' },
  { key: 'water', label: 'Umidade / água', fmt: v => `${Math.round(v * 100)}%`, hint: 'Úmido: pele lisa e tons de mata. Seco: escamas e tons de areia.' },
  { key: 'atmosphere', label: 'Atmosfera', fmt: v => `${(0.1 + v * 4.9).toFixed(1)} atm`, hint: 'Densa favorece asas e criaturas voadoras.' },
  { key: 'star', label: 'Estrela', fmt: v => (v < 0.2 ? 'Anã vermelha' : v < 0.45 ? 'Laranja (K)' : v < 0.7 ? 'Amarela (G)' : v < 0.88 ? 'Branca (F)' : 'Gigante azul'), hint: 'Estrelas fracas geram olhos maiores; no modo alienígena a luz tinge os pigmentos.' },
  { key: 'diet', label: 'Dieta', fmt: v => (v < 0.36 ? 'Herbívoro' : v < 0.66 ? 'Onívoro' : 'Carnívoro'), hint: 'Carnívoros: cara temível (sobrancelha pesada, presas, rosnado). Herbívoros: cara tranquila, olhos grandes.' },
  { key: 'exotic', label: 'Exotismo', fmt: v => `${Math.round(v * 100)}%`, hint: 'Mais olhos, antenas, pedúnculos, tentáculos e bioluminescência.' },
  { key: 'size', label: 'Porte', fmt: v => (v < 0.3 ? 'Pequeno' : v < 0.7 ? 'Médio' : 'Grande'), hint: 'Tamanho do corpo em todas as fases.' },
];
const LOCO_OPTS: [Locomotion | 'auto', string][] = [['auto', 'Automático'], ['quadruped', 'Quadrúpede'], ['biped', 'Bípede'], ['hopper', 'Saltador'], ['hexapod', 'Hexápode'], ['octopod', 'Octópode'], ['serpent', 'Serpente'], ['flyer', 'Voador'], ['dragon', 'Quadrúpede alado'], ['centauroid', 'Centauroide']];
const COVER_OPTS: [Covering | 'auto', string][] = [['auto', 'Automático'], ['fur', 'Pelos'], ['feathers', 'Penas'], ['scales', 'Escamas'], ['skin', 'Pele'], ['chitin', 'Quitina'], ['plates', 'Placas ósseas']];
const LEG_OPTS: [LegType | 'auto', string][] = [['auto', 'Automático'], ['digitigrade', 'Digitígradas'], ['plantigrade', 'Plantígradas'], ['unguligrade', 'Com cascos'], ['column', 'Colunares'], ['avian', 'De ave'], ['insectoid', 'Articuladas'], ['sprawl', 'Esparramadas'], ['tentacle', 'Tentáculos'], ['stubby', 'Curtas']];
const GROUP_COL: Record<string, string> = { 'Célula': 'text-teal-300', 'Oceano': 'text-sky-300', 'Terra': 'text-lime-300', 'Civilização': 'text-amber-300' };

/** timeline: 13 steps; steps 2-4 fork into the giant branch, the aquatic and land steps also have a leviathan */
const STEPS: [Stage, Stage | null, Stage | null][] = [
  [Stage.CELL, null, null], [Stage.AQUA_LARVA, null, null], [Stage.AQUA, Stage.AQUA_GIANT, Stage.AQUA_LEVIATHAN], [Stage.AMPHIBIAN, Stage.AMPHIBIAN_GIANT, null], [Stage.LAND, Stage.LAND_GIANT, Stage.LAND_LEVIATHAN],
  [Stage.TRIBAL, null, null], [Stage.MEDIEVAL, null, null], [Stage.RENAISSANCE, null, null], [Stage.INDUSTRIAL, null, null], [Stage.MODERN, null, null], [Stage.CONTEMPORARY, null, null], [Stage.FUTURIST, null, null], [Stage.SPACE, null, null],
];
type Cat = 'normal' | 'giant' | 'leviathan';
const CATS: [Cat, string, string][] = [['normal', 'Normal', 'A linha principal da espécie'], ['giant', 'Gigante', 'Ramo gigante: aquática gigante → anfíbia gigante → terrestre gigante'], ['leviathan', 'Leviatã', 'A categoria ápice (fauna de topo): leviatã aquático dos abismos e leviatã terrestre, como os dinossauros']];
const ALL_STAGES: Stage[] = [...STEPS.map(s => s[0]), ...STEPS.filter(s => s[1] !== null).map(s => s[1]!), ...STEPS.filter(s => s[2] !== null).map(s => s[2]!)];
const nameOf = (s: Stage) => STAGES.find(x => x.id === s)!;

function applyOverrides(g: Genome, loco: Locomotion | 'auto', cover: Covering | 'auto', legs: LegType | 'auto'): Genome {
  const out = { ...g };
  if (cover !== 'auto') {
    out.covering = cover;
    if (cover === 'feathers') out.jaw = out.jaw === 'teeth' && g.params.diet > 0.7 ? 'teeth' : 'beak';
    if (cover === 'chitin') { out.jaw = 'mandibles'; out.antennae = true; if (legs === 'auto') out.legType = 'insectoid'; }
    if (cover !== 'chitin' && out.jaw === 'mandibles') out.jaw = 'teeth';
    if (cover !== 'feathers' && out.jaw === 'beak') out.jaw = g.params.diet > 0.5 ? 'teeth' : 'soft';
    if (cover !== 'fur') { out.cheekFluff = false; if (out.back === 'mane') out.back = 'none'; if (out.tail === 'tuft' || out.tail === 'bushy') out.tail = 'plain'; }
    if (cover === 'fur' || cover === 'skin') { if (out.legType === 'insectoid' && legs === 'auto') out.legType = 'digitigrade'; }
  }
  if (loco !== 'auto') {
    out.locomotion = loco;
    out.wings = loco !== 'flyer' && loco !== 'dragon' ? 'none' : out.covering === 'feathers' ? 'feather' : out.covering === 'chitin' ? 'insect' : 'membrane';
    if (loco === 'octopod' && legs === 'auto') out.legType = 'insectoid';
  }
  if (legs !== 'auto') out.legType = legs;
  return out;
}

/** Draws the diorama + creature for a stage into ctx (logical pixels). */
function paintStage(ctx: CanvasRenderingContext2D, W: number, H: number, st: Stage, g: Genome, sp: CreatureSprite, t: number, frame: number, anim: Anim = 'walk') {
  drawBackdrop(ctx, W, H, st, g, t);
  const n = sp.frames.length, img = sp.frames[((frame % n) + n) % n];
  if (sp.grounded) {
    const gy = GROUND_Y(H) + 3;
    const alt = anim === 'fly' ? Math.round(22 + Math.sin(t * 2.2) * 3) : 0;
    ctx.fillStyle = `rgba(0,0,0,${alt ? 0.18 : 0.28})`;
    ctx.beginPath(); ctx.ellipse(W / 2, gy, Math.min(sp.w * (alt ? 0.3 : 0.42), 70), alt ? 2 : 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, Math.round(W / 2 - sp.ax), gy - sp.ay - alt);
  } else {
    const bob = Math.round(Math.sin(t * 1.3) * 3);
    ctx.drawImage(img, Math.round(W / 2 - sp.ax), Math.round(H / 2 - sp.ay + bob));
  }
}

export function CreatureGenerator({ onBack, pick }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [params, setParams] = useState<CreatureParams>(pick?.params ?? DEFAULT_PARAMS);
  const [mode, setMode] = useState<ColorMode>(pick?.mode ?? 'earth');
  const [step, setStep] = useState(pick ? 5 : 4);
  const [animSel, setAnimSel] = useState<Anim | null>(null);
  const [cat, setCat] = useState<Cat>('normal');
  const [dir, setDir] = useState<Dir8>('E');
  const [citizen, setCitizen] = useState(0);
  const [loco, setLoco] = useState<Locomotion | 'auto'>('auto');
  const [cover, setCover] = useState<Covering | 'auto'>('auto');
  const [legs, setLegs] = useState<LegType | 'auto'>('auto');
  const [mutation, setMutation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);
  const stage: Stage = pick ? Stage.TRIBAL : cat === 'leviathan' && STEPS[step][2] !== null ? STEPS[step][2]! : cat !== 'normal' && STEPS[step][1] !== null ? STEPS[step][1]! : STEPS[step][0];

  // debounced parameters so dragging a slider stays fluid
  const [live, setLive] = useState({ seed, params, loco, cover, legs, mutation, mode });
  useEffect(() => { const id = setTimeout(() => setLive({ seed, params, loco, cover, legs, mutation, mode }), 70); return () => clearTimeout(id); }, [seed, params, loco, cover, legs, mutation, mode]);

  const genome = useMemo(() => {
    const base = makeGenome(live.seed + (live.mutation ? `~${live.mutation}` : ''), live.params, live.mode);
    // a mutation keeps the species' name & colours but redraws its body plan
    if (live.mutation) { const o = makeGenome(live.seed, live.params, live.mode); Object.assign(base, { name: o.name, primary: o.primary, secondary: o.secondary, belly: o.belly, pattern: o.pattern }); }
    return applyOverrides(base, live.loco, live.cover, live.legs);
  }, [live]);
  const anims = useMemo(() => animsFor(genome, stage), [genome, stage]);
  const anim: Anim = animSel && anims.includes(animSel) ? animSel : (anims[stage === Stage.LAND || isCiv(stage) ? 1 : 0] ?? anims[0]);
  const sprite = useMemo(() => renderCreature(genome, stage, dir, citizen, FRAMES, anim), [genome, stage, dir, citizen, anim]);
  const info = useMemo(() => describe(genome, stage), [genome, stage]);
  const meta = nameOf(stage);

  const W = Math.max(256, Math.ceil((sprite.w + 60) / 16) * 16), H = Math.max(Math.round(W * 9 / 16), sprite.h + 40);

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
      paintStage(ctx, W, H, stage, genome, sprite, t, Math.floor(t * 7), anim);
      if (flash.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash.current * 0.5})`; ctx.fillRect(0, 0, W, H);
        flash.current = Math.max(0, flash.current - (now - last) / 350);
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [genome, sprite, stage, W, H, anim]);

  // evolution strip, rendered progressively (main line + giant branch)
  const [thumbs, setThumbs] = useState<Record<number, HTMLCanvasElement>>({});
  useEffect(() => {
    let cancelled = false;
    const todo: Stage[] = ALL_STAGES;
    const next: Record<number, HTMLCanvasElement> = {};
    let i = 0;
    const step2 = () => {
      if (cancelled || i >= todo.length) return;
      const st = todo[i++];
      next[st] = renderCreature(genome, st, 'E', citizen).frames[0];
      setThumbs({ ...next });
      setTimeout(step2, 0);
    };
    const id = setTimeout(step2, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [genome, citizen]);

  // the 8 facings of the current stage (for the gameplay map)
  const [dirThumbs, setDirThumbs] = useState<Partial<Record<Dir8, HTMLCanvasElement>>>({});
  useEffect(() => {
    let cancelled = false;
    const out: Partial<Record<Dir8, HTMLCanvasElement>> = {};
    let i = 0;
    const run = () => {
      if (cancelled || i >= DIRS.length) return;
      const d = DIRS[i++];
      out[d] = renderCreature(genome, stage, d, citizen, FRAMES, anim).frames[0];
      setDirThumbs({ ...out });
      setTimeout(run, 0);
    };
    const id = setTimeout(run, 120);
    return () => { cancelled = true; clearTimeout(id); };
  }, [genome, stage, citizen, anim]);

  const setParam = (k: keyof CreatureParams, v: number) => setParams(p => ({ ...p, [k]: v }));
  const randomWorld = () => setParams({ gravity: Math.random() * 0.8, temperature: Math.random(), water: Math.random(), atmosphere: Math.random(), star: Math.random(), diet: Math.random(), exotic: Math.random() * 0.9, size: Math.random() });

  const download = (what: 'png' | 'lineage' | 'sheet') => {
    const out = document.createElement('canvas');
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    if (what === 'png') {
      const k = 4;
      out.width = W * k; out.height = H * k;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      paintStage(c.getContext('2d')!, W, H, stage, genome, sprite, 0, 0, anim);
      o.drawImage(c, 0, 0, W * k, H * k);
    } else if (what === 'sheet') {
      // gameplay sprite sheet: one row per facing (E, SE, S, SW, W, NW, N, NE), one column per frame, every animation stacked
      const sheets = anims.map(a => spriteSheet(genome, stage, a, 1, citizen));
      out.width = Math.max(...sheets.map(sh => sh.cw * sh.frames)); out.height = sheets.reduce((s2, sh) => s2 + sh.ch * DIRS.length, 0);
      let y = 0;
      for (const sh of sheets) { o.drawImage(toCanvas(sh.data, sh.cw * sh.frames, sh.ch * DIRS.length), 0, y); y += sh.ch * DIRS.length; }
    } else {
      const list = ALL_STAGES;
      const sps = list.map(s => renderCreature(genome, s, 'E', citizen));
      const cw = Math.max(...sps.map(s => s.w)) + 8, chh = Math.max(...sps.map(s => s.h)) + 16;
      const cols = 8;
      out.width = cw * cols * 2; out.height = Math.ceil(list.length / cols) * chh * 2 + 40;
      o.fillStyle = '#07090f'; o.fillRect(0, 0, out.width, out.height);
      o.fillStyle = '#e6e0c8'; o.font = 'bold 22px ui-sans-serif, system-ui'; o.fillText(`${info.title} — linhagem evolutiva`, 16, 28);
      sps.forEach((sp, i) => {
        const cx = (i % cols) * cw * 2, cy = 40 + Math.floor(i / cols) * chh * 2;
        o.drawImage(sp.frames[0], cx + (cw * 2 - sp.w * 2) / 2, cy + chh * 2 - 26 - sp.h * 2, sp.w * 2, sp.h * 2);
        o.fillStyle = '#9aa3b8'; o.font = '14px ui-sans-serif, system-ui'; o.fillText(nameOf(list[i]).name, cx + 8, cy + chh * 2 - 8);
      });
    }
    const a = document.createElement('a');
    a.download = `${genome.name.genus}-${what === 'sheet' ? `sprites-${nameOf(stage).name}` : what === 'lineage' ? 'linhagem' : nameOf(stage).name}.png`.replace(/\s+/g, '_');
    a.href = out.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#06070c] text-neutral-100 font-sans flex flex-col overflow-x-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-black/40">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Menu</button>
        <div className="w-px h-5 bg-white/10" />
        <Dna className="w-5 h-5 text-fuchsia-300" />
        <h1 className="font-black tracking-[0.18em] text-sm sm:text-base bg-gradient-to-r from-white to-fuchsia-300 bg-clip-text text-transparent">{pick ? `CRIE SUA ESPÉCIE · ${pick.planetName.toUpperCase()}` : 'GERADOR DE CRIATURAS'}</h1>
        {pick && (
          <button onClick={() => pick.onPick(genome, citizen)} className="ml-3 flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-sm text-black bg-gradient-to-r from-amber-300 to-orange-400 hover:from-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.35)]">
            <Play className="w-4 h-4" /> Jogar com esta espécie
          </button>
        )}
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
            <Label>Tipo de mundo</Label>
            <select value={mode} onChange={e => setMode(e.target.value as ColorMode)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
              <option value="earth" className="bg-neutral-900">Earth-like — cores naturais</option>
              <option value="alien" className="bg-neutral-900">Alien-like — cores alienígenas</option>
            </select>
            <p className="mt-1.5 text-[10px] text-neutral-500 leading-relaxed">{mode === 'earth' ? 'Pelagens, peles e penas em pigmentos naturais escolhidos pelo clima: tons claros no frio, de areia no deserto, escuros e ruivos nos trópicos úmidos.' : 'Pigmentos livres, tingidos pela luz da estrela — mais exótico, como em Spore.'}</p>
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
            <Pick label="Locomoção" value={loco} opts={LOCO_OPTS} onChange={v => setLoco(v as Locomotion | 'auto')} />
            <Pick label="Cobertura" value={cover} opts={COVER_OPTS} onChange={v => setCover(v as Covering | 'auto')} />
            <Pick label="Pernas" value={legs} opts={LEG_OPTS} onChange={v => setLegs(v as LegType | 'auto')} />
          </section>
        </aside>

        {/* stage */}
        <main className="order-1 lg:order-2 flex flex-col min-h-0 p-3 sm:p-4 gap-3">
          <div ref={wrapRef} className="relative flex-1 min-h-[240px] sm:min-h-[320px] flex items-center justify-center rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, imageRendering: 'pixelated' }} className="rounded-lg shadow-2xl" />
            <div className="absolute top-3 left-3 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono">
              <span className={GROUP_COL[meta.group]}>{meta.group.toUpperCase()}</span> <span className="text-neutral-400">· {meta.name}{meta.years ? ` · ${meta.years}` : ''} · {meta.scale}</span>
            </div>
            <div className="absolute top-3 right-3 flex gap-1 bg-black/60 border border-white/10 rounded-xl p-1">
              {anims.map(a => (
                <button key={a} onClick={() => setAnimSel(a)} className={`px-2 py-1 rounded-md text-[11px] font-bold ${anim === a ? 'bg-fuchsia-400 text-black' : 'text-neutral-300 hover:bg-white/10'}`}>{ANIM_PT[a]}</button>
              ))}
            </div>
            {/* compass */}
            {stage !== Stage.CELL && (
              <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 bg-black/60 border border-white/10 rounded-xl p-1.5" title="Direção (para o mapa de gameplay)">
                {(['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'] as (Dir8 | '')[]).map((d, i) => d ? (
                  <button key={d} onClick={() => setDir(d)} title={DIR_PT[d]} className={`w-7 h-7 rounded-md text-xs font-bold ${dir === d ? 'bg-amber-300 text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/15'}`}>{ARROWS[d]}</button>
                ) : <div key={i} className="w-7 h-7 flex items-center justify-center text-[9px] font-mono text-neutral-500">8×</div>)}
              </div>
            )}
          </div>

          {/* evolution timeline */}
          {pick ? (
            <div className="bg-black/40 border border-amber-300/20 rounded-2xl px-4 py-3 text-sm text-amber-100/90">
              Você joga com a <b>era tribal</b> da sua espécie por enquanto. Ajuste o mundo natal, a semente e as mutações até gostar — as roupas mudam em <b>Outro cidadão</b>.
            </div>
          ) : <div className="bg-black/40 border border-white/5 rounded-2xl px-4 pt-3 pb-2">
            <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.2em] mb-1">
              {(['Célula', 'Oceano', 'Terra', 'Civilização'] as const).map(gp => <span key={gp} className={GROUP_COL[gp]}>{gp.toUpperCase()}</span>)}
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={STEPS.length - 1} step={1} value={step} onChange={e => setStep(+e.target.value)} className="flex-1 accent-amber-300" />
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-white/10">
                <GitBranch className="w-3.5 h-3.5 mx-1 text-neutral-500" />
                {CATS.map(([c, label, hint]) => (
                  <button key={c} onClick={() => setCat(c)} title={hint}
                    className={`text-[11px] font-bold px-2 py-1 rounded-md ${cat === c ? (c === 'leviathan' ? 'bg-violet-400/25 text-violet-100' : c === 'giant' ? 'bg-sky-400/20 text-sky-100' : 'bg-white/10 text-white') : 'text-neutral-400 hover:text-white'}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="grid mt-2 gap-1" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}>
              {STEPS.map(([main, alt, lev], i) => (
                <div key={i} className="flex flex-col gap-1">
                  {lev !== null
                    ? <ThumbBtn canvas={thumbs[lev]} active={stage === lev} label={nameOf(lev).name} onClick={() => { setStep(i); setCat('leviathan'); }} tone="violet" />
                    : <div className="hidden md:block flex-1" />}
                  {alt !== null
                    ? <ThumbBtn canvas={thumbs[alt]} active={stage === alt} label={nameOf(alt).name} onClick={() => { setStep(i); setCat('giant'); }} tone="sky" />
                    : <div className="hidden md:block flex-1" />}
                  <ThumbBtn canvas={thumbs[main]} active={stage === main} label={nameOf(main).name} onClick={() => { setStep(i); setCat('normal'); }} />
                </div>
              ))}
            </div>
          </div>}
        </main>

        {/* species card */}
        <aside className="order-3 border-l border-white/5 bg-black/25 p-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-neutral-500">ESPÉCIE</div>
            <div className="italic font-serif text-2xl text-amber-100 leading-tight">{info.title}</div>
            {info.society && <div className="mt-1 text-sm font-bold text-amber-300">{info.society}</div>}
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{info.blurb}</p>
            {isCiv(stage) && (
              <button onClick={() => setCitizen(c => c + 1)} className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded-lg border border-amber-300/30 text-amber-200 hover:bg-amber-400/10">
                <Users className="w-3.5 h-3.5" /> Outro cidadão (roupas da época)
              </button>
            )}
          </div>
          {stage !== Stage.CELL && (
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
          )}
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
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => download('png')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Download className="w-3.5 h-3.5" /> PNG</button>
            <button onClick={() => download('sheet')} title="8 direções × 8 quadros, pixels 1:1, para o mapa de gameplay" className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Grid3x3 className="w-3.5 h-3.5" /> Sprites</button>
            <button onClick={() => download('lineage')} className="flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"><Layers className="w-3.5 h-3.5" /> Linhagem</button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">{FRAMES} quadros por direção · pixel art desenhada por código, em rampas de cor com contorno seletivo. As direções da esquerda são espelhadas das da direita.</p>
        </aside>
      </div>
    </div>
  );
}

const ARROWS: Record<Dir8, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };

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
function ThumbBtn({ canvas, active, label, onClick, tone = 'amber' }: { canvas?: HTMLCanvasElement; active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'sky' | 'violet' }) {
  const on = tone === 'sky' ? 'border-sky-300/70 bg-sky-300/10' : tone === 'violet' ? 'border-violet-300/70 bg-violet-300/10' : 'border-amber-300/70 bg-amber-300/10';
  return (
    <button onClick={onClick} title={label} className={`group flex flex-col items-center rounded-lg p-1 border transition-colors ${active ? on : 'border-transparent hover:border-white/10'}`}>
      <Thumb canvas={canvas ?? null} />
      <span className={`hidden md:block text-[9px] leading-tight text-center mt-1 ${active ? (tone === 'sky' ? 'text-sky-200' : tone === 'violet' ? 'text-violet-200' : 'text-amber-200') : 'text-neutral-500 group-hover:text-neutral-300'}`}>{label}</span>
    </button>
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
    const s = Math.min(c.width / canvas.width, c.height / canvas.height);
    const k = s >= 1 ? Math.floor(s) : s;
    x.drawImage(canvas, (c.width - canvas.width * k) / 2, (c.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  }, [canvas]);
  return <canvas ref={ref} width={64} height={48} className="w-full max-w-[64px] aspect-[4/3]" style={{ imageRendering: 'pixelated' }} />;
}
