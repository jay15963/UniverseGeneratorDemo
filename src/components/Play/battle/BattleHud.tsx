// The battle HUD: clock and balance of forces, speed, the player's unit cards (men, morale, ammunition), the
// orders of the selection (formations of the era's style, run, fire at will, hold, bombard), deployment,
// combined-arms command points / sectors / reinforcements, withdrawal and the result.
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Flag, Swords, Footprints, Crosshair, Shield, Square, Bot, Target } from 'lucide-react';
import type { BattleLayer } from './BattleLayer';
import { FORM_NAME, formsFor, type Unit } from '../../../lib/game/battle/sim';

const STYLE_NAME = { warband: 'Bandos de guerra', formation: 'Formações', line: 'Infantaria de linha', trench: 'Guerra de trincheiras', combined: 'Armas combinadas' };

export function BattleHud({ layer, title, onDone }: { layer: BattleLayer; title: string; onDone: () => void }) {
  const [, setTick] = useState(0);
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  const mid = useRef(0);
  useEffect(() => {
    layer.onChange = () => setTick(t => t + 1);
    const id = setInterval(() => {
      setTick(t => t + 1);
      const m = layer.sim.messages.splice(0);
      if (m.length) setMsgs(q => [...q, ...m.map(text => ({ id: ++mid.current, text }))].slice(-5));
    }, 300);
    const id2 = setInterval(() => setMsgs(q => q.slice(1)), 3500);
    return () => { clearInterval(id); clearInterval(id2); layer.onChange = null; };
  }, [layer]);
  const sim = layer.sim, me = layer.me, them = (1 - me) as 0 | 1;
  const mine = sim.units.filter(u => u.side === me);
  const sel = [...layer.sel];
  const power = (k: 0 | 1) => sim.units.filter(u => u.side === k && !u.gone && !u.rout).reduce((q, u) => q + sim.count(u) * (u.def.el === 'vehicle' ? 12 : u.def.el === 'piece' ? 6 : 1) * (1 + u.def.era[0] * 0.2), 0);
  const pm = power(me), pt = power(them), share = pm / Math.max(1, pm + pt);
  const mm = Math.floor(sim.t / 60), ss = Math.floor(sim.t % 60);
  const combined = sim.style === 'combined';
  const forms = sel.length ? [...new Set(sel.flatMap(u => formsFor(sim.style, u.def)))] : [];
  const anyArt = sel.some(u => u.def.indirect || u.def.cls === 'air');
  const cas = (k: 0 | 1) => sim.casualties(k);
  const won = sim.winner === me;

  return (
    <div className="pointer-events-none fixed inset-0 z-[320] text-white select-none">
      {/* top bar */}
      <div className="pointer-events-auto absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5">
          <Swords className="w-4 h-4 text-amber-300" />
          <div className="text-sm font-bold">{title}</div>
          <div className="text-[10px] font-mono text-amber-200/70">{STYLE_NAME[sim.style]}</div>
          <div className="font-mono text-sm tabular-nums ml-1">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
          <div className="w-px h-4 bg-white/15 mx-1" />
          <button onClick={() => { layer.paused = !layer.paused; setTick(t => t + 1); }} className="p-1 rounded hover:bg-white/10" title="Pausa (espaço)">{layer.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
          {[1, 2, 3].map(s => <button key={s} onClick={() => { layer.speed = s; setTick(t => t + 1); }} className={`px-1.5 py-0.5 rounded text-xs font-mono ${layer.speed === s ? 'bg-amber-300 text-black' : 'hover:bg-white/10'}`}>{s}×</button>)}
        </div>
        <div className="w-80 h-2.5 rounded-full overflow-hidden bg-red-500/70 border border-black/40" title="Equilíbrio de forças">
          <div className="h-full bg-sky-400" style={{ width: `${share * 100}%` }} />
        </div>
        {combined && (
          <div className="flex items-center gap-2 bg-black/70 border border-white/10 rounded-xl px-3 py-1 text-xs">
            <span className="text-sky-300 font-mono">⚑ {Math.floor(sim.pts[me])} pts</span>
            <span className="text-neutral-400">vitória</span>
            <div className="w-28 h-1.5 bg-white/10 rounded-full overflow-hidden flex"><div className="bg-sky-400 h-full" style={{ width: `${(sim.vp[me] / 600) * 50}%` }} /><div className="flex-1" /><div className="bg-red-400 h-full" style={{ width: `${(sim.vp[them] / 600) * 50}%` }} /></div>
            {sim.sectors.map(s => <span key={s.name} className={`px-1.5 rounded font-bold ${s.owner === me ? 'bg-sky-500/40' : s.owner === them ? 'bg-red-500/40' : 'bg-white/10'}`}>{s.name[0]}</span>)}
          </div>
        )}
        {sim.phase === 'deploy' && (
          <div className="flex items-center gap-2 bg-black/75 border border-sky-300/40 rounded-xl px-3 py-2 text-xs max-w-[560px]">
            <span className="text-sky-200">Posicione as tropas na zona azul: selecione (clique ou arraste uma caixa) e use o botão direito — arrastando, você desenha a linha (largura e frente).{combined ? ' Compre unidades com pontos de comando nos cartões; conquiste setores para ganhar pontos e vencer.' : ''} Na batalha: botão direito num inimigo ataca; R corre, F fogo à vontade, G segura, espaço pausa.</span>
            <button onClick={() => { sim.start(); setTick(t => t + 1); }} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-300 text-black font-bold">Iniciar batalha</button>
          </div>
        )}
      </div>
      {/* right: withdraw, auto */}
      <div className="pointer-events-auto absolute top-12 left-3 flex flex-col items-start gap-1.5">
        <button onClick={() => { sim.autoPlayer = !sim.autoPlayer; setTick(t => t + 1); }} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${sim.autoPlayer ? 'bg-amber-300 text-black border-amber-200' : 'bg-black/60 border-white/10 hover:bg-white/10'}`} title="Os oficiais comandam por você">
          <Bot className="w-3.5 h-3.5" /> Comando automático
        </button>
        {sim.phase !== 'end' && <button onClick={() => { if (confirm('Retirar todas as tropas? A batalha está perdida, mas os sobreviventes se salvam.')) { sim.withdraw(me); setTick(t => t + 1); } }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/20 border border-red-300/30 hover:bg-red-500/30"><Flag className="w-3.5 h-3.5" /> Retirar</button>}
      </div>
      {/* messages */}
      <div className="absolute top-[150px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        {msgs.map(m => <div key={m.id} className="px-2.5 py-1 rounded-lg bg-black/70 text-xs text-amber-100 border border-white/10">{m.text}</div>)}
      </div>
      {/* orders of the selection */}
      {sel.length > 0 && sim.phase !== 'end' && (
        <div className="pointer-events-auto absolute bottom-[118px] left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1.5 max-w-[92vw]">
          {forms.map(f => <button key={f} onClick={() => layer.setForm(f)} className={`px-2 py-1 rounded-md text-xs border ${sel.every(u => u.form === f) ? 'bg-sky-400 text-black border-sky-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>{FORM_NAME[f]}</button>)}
          {forms.length > 0 && <div className="w-px h-5 bg-white/15" />}
          <Toggle on={sel.every(u => u.run)} onClick={() => layer.key('r', true, new KeyboardEvent('keydown'))} icon={<Footprints className="w-3.5 h-3.5" />} label="Correr (R)" />
          <Toggle on={sel.every(u => u.fireAtWill)} onClick={() => layer.key('f', true, new KeyboardEvent('keydown'))} icon={<Crosshair className="w-3.5 h-3.5" />} label="Fogo à vontade (F)" />
          <Toggle on={sel.every(u => u.guard)} onClick={() => layer.key('g', true, new KeyboardEvent('keydown'))} icon={<Shield className="w-3.5 h-3.5" />} label="Segurar posição (G)" />
          <button onClick={() => layer.key('h', true, new KeyboardEvent('keydown'))} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/5 border border-white/10 hover:bg-white/10"><Square className="w-3.5 h-3.5" /> Parar (H)</button>
          {anyArt && <button onClick={() => { layer.aim = 'fire'; setTick(t => t + 1); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-500/30 border border-orange-300/40 hover:bg-orange-500/40"><Target className="w-3.5 h-3.5" /> {sel.some(u => u.def.cls === 'air') ? 'Ataque aéreo' : 'Bombardear'}</button>}
        </div>
      )}
      {/* unit cards */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-1.5 max-w-[96vw] overflow-x-auto">
        {mine.map(u => <Card key={u.id} u={u} layer={layer} selected={layer.sel.has(u)} onClick={e => {
          if (combined && !u.deployed && !u.strike) {
            if (u.def.cls === 'air') { layer.sel.clear(); layer.sel.add(u); layer.aim = 'fire'; setTick(t => t + 1); return; }
            if (sim.callIn(u)) { layer.sel.clear(); layer.sel.add(u); }
            setTick(t => t + 1); return;
          }
          if (u.gone || sim.count(u) === 0) return;
          if (!e.shiftKey) layer.sel.clear();
          if (e.shiftKey && layer.sel.has(u)) layer.sel.delete(u); else layer.sel.add(u);
          if (e.detail === 2 && layer.api) { const [x, y] = sim.centre(u); layer.api.jump(x, y); }
          setTick(t => t + 1);
        }} />)}
      </div>
      {/* the end */}
      {sim.phase === 'end' && (
        <div className="pointer-events-auto absolute inset-0 bg-black/55 flex items-center justify-center">
          <div className={`rounded-2xl p-6 w-[380px] text-center border ${won ? 'bg-[#0f1a10]/95 border-emerald-300/40' : 'bg-[#1a0f0f]/95 border-red-300/40'}`}>
            <div className={`text-3xl font-black ${won ? 'text-emerald-200' : 'text-red-200'}`}>{won ? 'Vitória' : 'Derrota'}</div>
            <div className="text-sm text-neutral-300 mt-1">{sim.endReason}</div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
              {([me, them] as const).map(k => { const c = cas(k); return (
                <div key={k} className="rounded-lg bg-white/5 p-2">
                  <div className={`text-xs font-bold ${k === me ? 'text-sky-300' : 'text-red-300'}`}>{sim.setup.sides[k].name}</div>
                  <div className="font-mono text-xs text-neutral-300 mt-1">baixas {c.lost} / {c.start}</div>
                </div>
              ); })}
            </div>
            <button onClick={onDone} className="mt-5 w-full py-2.5 rounded-xl font-bold text-black bg-amber-300 hover:bg-amber-200">Voltar ao mapa da campanha</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${on ? 'bg-amber-300 text-black border-amber-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>{icon}{label}</button>;
}

function Card({ u, layer, selected, onClick }: { key?: React.Key; u: Unit; layer: BattleLayer; selected: boolean; onClick: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = layer.sim;
  const n = sim.count(u);
  const p = layer.portrait(u);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (!p) return;
    x.imageSmoothingEnabled = false;
    const k = Math.min((c.width - 2) / p.w, (c.height - 2) / p.h) * (u.def.el === 'vehicle' || u.def.el === 'piece' ? 1 : 1.4);
    x.drawImage(p.c, p.sx, p.sy, p.w, p.h, (c.width - p.w * k) / 2, c.height - p.h * k + (u.def.el === 'vehicle' ? -4 : 6), p.w * k, p.h * k);
  });
  const dead = u.gone || u.shattered || n === 0;
  const reserve = sim.style === 'combined' && !u.deployed && !u.strike;
  const m = Math.max(0, Math.min(1, u.morale / Math.max(1, u.mor0)));
  return (
    <button onClick={onClick} title={`${u.def.name}${u.def.blurb ? ' — ' + u.def.blurb : ''}`}
      className={`relative w-[62px] shrink-0 rounded-lg border text-left overflow-hidden ${selected ? 'border-sky-300 bg-sky-500/25' : 'border-white/10 bg-white/5 hover:bg-white/10'} ${dead ? 'opacity-35' : reserve ? 'opacity-70' : ''}`}>
      <div className="h-[44px] bg-black/30 flex items-end justify-center" style={{ boxShadow: `inset 0 3px 0 ${u.color}` }}>
        <canvas ref={ref} width={60} height={44} style={{ imageRendering: 'pixelated' }} />
      </div>
      <div className="px-1 pb-1">
        <div className="text-[9px] leading-tight truncate">{u.def.name}</div>
        <div className="h-1 rounded bg-white/10 mt-0.5 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(n / Math.max(1, u.start)) * 100}%` }} /></div>
        <div className="h-1 rounded bg-white/10 mt-0.5 overflow-hidden"><div className={`h-full ${u.rout ? 'bg-red-500' : m > 0.6 ? 'bg-sky-300' : m > 0.3 ? 'bg-yellow-300' : 'bg-orange-400'}`} style={{ width: `${(u.rout ? 1 : m) * 100}%` }} /></div>
        <div className="text-[8px] font-mono text-neutral-400 mt-0.5">{reserve ? `${u.def.pts} pts` : u.rout ? 'fugindo' : `${n}/${u.start}`}</div>
      </div>
    </button>
  );
}
