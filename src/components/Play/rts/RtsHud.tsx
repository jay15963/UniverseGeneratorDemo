// HUD of the creature eras: resources and the planet's life stage, speed, the evolution tree, the objectives, and
// the panels for what is selected (castes and their orders, a nest / den with its spawning queue).
import React, { useEffect, useRef, useState } from 'react';
import { X, FlaskConical, Target, Pause, Play, Square, Shield, Crosshair, Home, Swords, Users, Leaf, Snowflake, Sun, Droplets } from 'lucide-react';
import type { RtsClient, HudState } from '../../../lib/game/rts/client';
import type { RtsLayer } from './RtsLayer';
import { Ord, type RtsDefs } from '../../../lib/game/rts/defs';
import type { Sheet } from '../../../lib/fauna/spriteStore';

interface Props {
  client: RtsClient; layer: RtsLayer; defs: RtsDefs; eraName: string;
  onExit: () => void; onVictory: () => void; victoryLabel: string;
  toast: string | null;
}
const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];

export function RtsHud({ client, layer, defs, eraName, onExit, onVictory, victoryLabel, toast }: Props) {
  const [h, setH] = useState<HudState>(client.hud);
  const [, setTick] = useState(0);
  const [techOpen, setTechOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(true);
  useEffect(() => {
    let last = 0;
    const off = client.subscribe(s => { const now = performance.now(); if (now - last > 200) { last = now; setH({ ...s }); } });
    const off2 = layer.subscribe(() => setTick(t => t + 1));
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => { off(); off2(); clearInterval(id); };
  }, [client, layer]);
  const st = h.stats;
  const aqua = defs.mode === 'aqua';
  const sel = layer.selection();
  const selB = layer.selB !== null ? client.builds.find(b => b.id === layer.selB) ?? null : null;
  const C = defs.castes;
  const research = st?.research ? defs.techs.find(t => t.id === st.research!.id) : null;
  const me = h.nations[0];
  const allIds = [...sel.values()].flat();
  const builders = allIds.filter(i => C[client.cur.get(i)?.kind ?? 0]?.builder);

  return (
    <>
      {/* top-left: resources, life, speed */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 w-[300px] max-w-[calc(100vw-24px)] text-white text-xs">
        <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-300/80 uppercase">Era {eraName}</div>
            <div className="flex gap-1">
              <button onClick={() => client.cmd({ c: 'pause', v: !h.paused })} title="Pausar (P)" className="p-1 rounded hover:bg-white/10">{h.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}</button>
              {[1, 2, 4].map(v => <button key={v} onClick={() => client.cmd({ c: 'speed', v })} className={`px-1.5 rounded font-mono ${h.speed === v ? 'bg-cyan-400/30 text-cyan-100' : 'hover:bg-white/10 text-neutral-300'}`}>{v}×</button>)}
              <button onClick={onExit} title="Sair (o jogo é salvo)" className="p-1 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="mt-1 italic font-serif text-amber-100 text-sm truncate">{me?.name}</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 font-mono tabular-nums">
            <Stat icon="🍖" label="Comida" v={st ? Math.floor(st.food) : 0} sub={st ? `-${st.upkeep.toFixed(2)}/s` : ''} />
            <Stat icon="🧬" label="DNA" v={st ? st.dna.toFixed(1) : '0'} />
            <Stat icon="👥" label="População" v={st ? `${st.pop}/${st.cap}` : '0'} warn={!!st && st.pop >= st.cap} />
          </div>
          {aqua ? (
            <div className="mt-2" title="O oxigênio das espécies dos mares faz a vida subir à terra: 30% plantas e anfíbios nas costas, 60% a vegetação avança e a fauna terrestre aparece">
              <div className="flex justify-between text-[10px] text-neutral-300"><span className="flex items-center gap-1"><Droplets className="w-3 h-3 text-cyan-300" /> Oxigênio · estágio de vida</span><span className="font-mono">{Math.round(h.lifeStage * 100)}%</span></div>
              <div className="relative mt-0.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: `${h.lifeStage * 100}%` }} />
                {[0.3, 0.6, 0.9].map(m => <div key={m} className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${m * 100}%` }} />)}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{h.lifeStage < 0.3 ? 'Só os mares vivem; a terra é árida' : h.lifeStage < 0.6 ? 'Plantas nas costas e nos rios; anfíbios nas margens' : 'A vegetação avança terra adentro'}</div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
              {h.season === 3 ? <Snowflake className="w-3.5 h-3.5 text-sky-200" /> : h.season === 1 ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Leaf className="w-3.5 h-3.5 text-emerald-300" />}
              {SEASONS[h.season]} {h.season === 3 && <span className="text-sky-200/80">— menos comida; o frio castiga sem Fogo</span>}
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => setTechOpen(o => !o)} className={`flex-1 flex items-center justify-center gap-1 rounded-lg py-1 border ${techOpen ? 'bg-violet-500/30 border-violet-300/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
              <FlaskConical className="w-3.5 h-3.5" /> Evolução{research ? ` ${Math.round((st!.research!.p) * 100)}%` : ''}
            </button>
            <button onClick={() => setGoalsOpen(o => !o)} className={`flex-1 flex items-center justify-center gap-1 rounded-lg py-1 border ${goalsOpen ? 'bg-amber-500/20 border-amber-300/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}><Target className="w-3.5 h-3.5" /> Objetivos</button>
          </div>
        </div>
        {goalsOpen && h.victory && (
          <div className="bg-black/70 backdrop-blur-md border border-amber-300/20 rounded-xl px-3 py-2">
            <div className="text-[10px] font-mono tracking-[0.2em] text-amber-300/80 uppercase mb-1">Para a próxima era</div>
            {h.victory.lines.map(([t, ok]) => <div key={t} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-300' : 'text-neutral-300'}`}><span>{ok ? '✔' : '○'}</span>{t}</div>)}
            {h.victory.ok && <button onClick={onVictory} className="mt-2 w-full rounded-lg py-1.5 font-bold text-black bg-gradient-to-r from-amber-300 to-emerald-300 animate-pulse">{victoryLabel}</button>}
          </div>
        )}
        {techOpen && st && (
          <div className="bg-black/80 backdrop-blur-md border border-violet-300/25 rounded-xl p-2 space-y-1 max-h-[46vh] overflow-y-auto no-scrollbar">
            {research && <div className="px-1 text-violet-100">Pesquisando <b>{research.name}</b><div className="h-1 rounded-full bg-white/10 mt-0.5"><div className="h-full bg-violet-300" style={{ width: `${st.research!.p * 100}%` }} /></div></div>}
            {defs.techs.map(t => {
              const done = st.techs.includes(t.id), reqOk = t.req.every(r => st.techs.includes(r)), lifeOk = !t.life || h.lifeStage >= t.life;
              const can = !done && !st.research && reqOk && lifeOk && st.dna >= t.dna && st.food >= t.food;
              return (
                <button key={t.id} disabled={!can} onClick={() => client.cmd({ c: 'research', id: t.id })}
                  className={`w-full text-left rounded-lg border px-2 py-1 ${done ? 'border-emerald-300/30 bg-emerald-400/10' : can ? 'border-white/20 bg-white/5 hover:bg-white/10' : 'border-white/5 opacity-60'}`}
                  title={`${t.desc}${t.req.length ? `\nRequer: ${t.req.map(r => defs.techs.find(q => q.id === r)?.name).join(', ')}` : ''}${t.life ? `\nEstágio de vida ≥ ${Math.round(t.life * 100)}%` : ''}`}>
                  <div className="flex justify-between"><b className={t.id === defs.final ? 'text-amber-200' : ''}>{done ? '✔ ' : ''}{t.name}</b>{!done && <span className="font-mono text-[10px]"><span className={st.dna >= t.dna ? 'text-violet-200' : 'text-red-300'}>🧬{t.dna}</span> <span className={st.food >= t.food ? 'text-lime-200' : 'text-red-300'}>🍖{t.food}</span></span>}</div>
                  <div className="text-[10px] text-neutral-400 leading-snug">{t.desc}{!lifeOk ? ` · requer estágio de vida ${Math.round(t.life! * 100)}%` : ''}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* bottom: selection */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 max-w-[calc(100vw-24px)] text-white text-xs">
        {selB ? (
          <div className="bg-black/75 backdrop-blur-md border border-white/15 rounded-xl p-2.5 min-w-[340px]">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2"><Home className="w-4 h-4 text-emerald-300" /><b className="text-sm">{defs.buildings[selB.type].name}</b><span className="font-mono text-neutral-400">{Math.round(selB.hp * 100)}%</span></div>
              {selB.queue > 0 && <button onClick={() => client.cmd({ c: 'cancel', b: selB.id })} className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 border border-red-300/20 text-red-200">Cancelar último</button>}
            </div>
            {defs.buildings[selB.type].trains ? (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                  {C.map(c => {
                    const locked = !!c.req && !st?.techs.includes(c.req);
                    return (
                      <button key={c.id} disabled={locked || !st || st.food < c.cost} onClick={() => client.cmd({ c: 'train', b: selB.id, caste: c.id })}
                        title={`${c.name}\n${c.blurb}\nVida ${c.hp} · dano ${c.dmg}${c.ranged ? ' (à distância)' : ''} · velocidade ${c.speed}\nSustento ${c.upkeep}/s · população ${c.pop}${locked ? `\nRequer: ${defs.techs.find(t => t.id === c.req)?.name}` : ''}`}
                        className={`flex flex-col items-center rounded-lg border px-1 py-1 ${locked ? 'border-white/5 opacity-40' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}>
                        <Portrait layer={layer} kind={c.id} />
                        <span className="text-[10px] leading-tight text-center">{c.name}</span>
                        <span className="text-[10px] font-mono text-lime-200">🍖{c.cost}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-[10px] text-neutral-400">Fila: {selB.queue} {selB.queue ? `· ${Math.round(selB.prog * 100)}%` : ''} · clique direito no mapa marca o ponto de reunião</div>
              </>
            ) : <div className="text-[11px] text-neutral-300">{defs.buildings[selB.type].blurb}</div>}
          </div>
        ) : allIds.length ? (
          <div className="bg-black/75 backdrop-blur-md border border-white/15 rounded-xl p-2.5 min-w-[340px]">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {[...sel.entries()].map(([k, ids]) => (
                <button key={k} onClick={() => { layer.sel = new Set(ids); layer.selB = null; setTick(t => t + 1); }} title={C[k].blurb}
                  className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1.5 py-0.5 hover:bg-white/10">
                  <Portrait layer={layer} kind={k} small /> <span>{C[k].name}</span><b className="font-mono">×{ids.length}</b>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={() => { layer.armAttack = true; setTick(t => t + 1); }} icon={<Swords className="w-3.5 h-3.5" />} label="Atacar-mover (A)" />
              <Btn onClick={() => allIds.forEach(i => { const e = client.cur.get(i); if (e) client.cmd({ c: 'order', ids: [i], o: Ord.IDLE, x: e.x, y: e.y }); })} icon={<Square className="w-3.5 h-3.5" />} label="Parar (S)" />
              <Btn onClick={() => allIds.forEach(i => { const e = client.cur.get(i); if (e) client.cmd({ c: 'order', ids: [i], o: Ord.HOLD, x: e.x, y: e.y }); })} icon={<Shield className="w-3.5 h-3.5" />} label="Segurar (H)" />
              {builders.length > 0 && defs.buildings.map(b => {
                const locked = !!b.req && !st?.techs.includes(b.req);
                return <Btn key={b.id} disabled={locked} onClick={() => { layer.placing = b.id; setTick(t => t + 1); }} icon={<Crosshair className="w-3.5 h-3.5" />}
                  label={`${b.name} 🍖${b.cost}`} title={`${b.blurb}${locked ? `\nRequer: ${defs.techs.find(t => t.id === b.req)?.name}` : ''}`} tone="emerald" />;
              })}
            </div>
            {layer.placing !== null && <div className="mt-1 text-[11px] text-emerald-200">Clique no lugar para {defs.buildings[layer.placing].site === 'shelf' ? 'fundar o ninhal (água rasa da plataforma)' : defs.buildings[layer.placing].site === 'shore' ? 'erguer a sentinela (margem com vegetação)' : 'construir'} · botão direito cancela</div>}
          </div>
        ) : (
          <div className="flex gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-1.5">
            <Btn onClick={() => { const mine = client.builds.filter(b => b.nation === 0 && defs.buildings[b.type].trains); if (mine.length) { const i = (mine.findIndex(b => b.id === layer.selB) + 1) % mine.length; layer.selB = mine[i].id; layer.sel.clear(); layer.api?.jump(mine[i].x, mine[i].y); setTick(t => t + 1); } }}
              icon={<Home className="w-3.5 h-3.5" />} label={aqua ? 'Ninhais' : 'Tocas'} />
            <Btn onClick={() => { layer.sel = new Set([...client.cur.values()].filter(e => e.nation === 0 && !C[e.kind].gather).map(e => e.id)); layer.selB = null; setTick(t => t + 1); }} icon={<Swords className="w-3.5 h-3.5" />} label="Combatentes" />
            <Btn onClick={() => { layer.sel = new Set([...client.cur.values()].filter(e => e.nation === 0 && C[e.kind].gather).map(e => e.id)); layer.selB = null; setTick(t => t + 1); }} icon={<Users className="w-3.5 h-3.5" />} label={C[0].name + 'es'} />
            <span className="self-center text-[10px] text-neutral-400 px-1 hidden sm:inline">arraste para selecionar · botão direito ordena · roda: zoom</span>
          </div>
        )}
      </div>
      {toast && <div className="absolute left-1/2 -translate-x-1/2 top-16 bg-black/80 border border-amber-300/30 text-amber-200 text-sm rounded-lg px-3 py-1.5 pointer-events-none">{toast}</div>}
    </>
  );
}

function Stat({ icon, label, v, sub, warn }: { icon: string; label: string; v: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-1.5 py-1 ${warn ? 'bg-red-500/15' : 'bg-white/5'}`} title={label}>
      <div className="text-[9px] text-neutral-400 font-sans">{icon} {label}</div>
      <div className="text-sm font-bold leading-tight">{v}</div>
      {sub && <div className="text-[9px] text-neutral-500">{sub}</div>}
    </div>
  );
}
function Btn({ onClick, icon, label, title, disabled, tone }: { key?: React.Key; onClick: () => void; icon: React.ReactNode; label: string; title?: string; disabled?: boolean; tone?: 'emerald' }) {
  return (
    <button disabled={disabled} onClick={onClick} title={title ?? label}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-40 ${tone === 'emerald' ? 'border-emerald-300/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}
/** a caste's portrait from its sprite sheet (south-east facing, first frame) */
function Portrait({ layer, kind, small }: { layer: RtsLayer; kind: number; small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useEffect(() => {
    let dead = false;
    const poll = () => { if (dead) return; const s = layer.api ? layer.sheet({ kind, nation: 0 }, 'idle') : null; if (s) setSheet(s); else setTimeout(poll, 300); };
    poll();
    return () => { dead = true; };
  }, [layer, kind]);
  useEffect(() => {
    const c = ref.current; if (!c || !sheet) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = false;
    const s = Math.min(c.width / sheet.cw, c.height / sheet.ch);
    x.drawImage(sheet.canvas, 0, sheet.ch, sheet.cw, sheet.ch, (c.width - sheet.cw * s) / 2, (c.height - sheet.ch * s) / 2, sheet.cw * s, sheet.ch * s);
  }, [sheet]);
  return <canvas ref={ref} width={small ? 22 : 40} height={small ? 18 : 32} style={{ imageRendering: 'pixelated' }} />;
}
