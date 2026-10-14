// The campaign HUD: the nation's treasury, research and era, the turn and season; the selected army (regiments)
// or settlement (growth, buildings, recruiting, garrison); the research tree, diplomacy, offers from other nations,
// the chronicle of the turn, and the battle prompt when armies meet.
import React, { useEffect, useRef, useState } from 'react';
import { Coins, FlaskConical, Hourglass, Handshake, ScrollText, Swords, Shield, Hammer, Users, X, ChevronRight, Crown, Flag, LogOut, Sparkles } from 'lucide-react';
import type { Campaign, Battle, Army, Settlement } from '../../../lib/game/campaign/campaign';
import {
  PLAYER, REBELS, nameOf, colorOf, diplo, factionTotals, income, recruitable, buildable, orderBuild, orderRecruit, cancelRecruit, unitCost, buildCost,
  slotsUsed, recruitSlots, availableTechs, seasonOf, yearOf, armyById, settlementById, armyPower, defencePower, declareWar, makePeace, makeAlliance, accepts, gift,
  answerOffer, ERA_NAMES, moveOf, popCap,
} from '../../../lib/game/campaign/campaign';
import { unitById, CLASS_NAME } from '../../../lib/game/campaign/units';
import { TECHS, techCost, buildingById, levelOf, LEVELS, slotsOf, SEASONS, ADVANCE_NEED } from '../../../lib/game/campaign/defs';
import type { CampaignLayer } from './CampaignLayer';
import type { WarArt } from '../war/art';
import type { Genome } from '../../../lib/creature/genome';

interface Props {
  c: Campaign; layer: CampaignLayer; art: WarArt; genomes: Genome[];
  tick: number; refresh: () => void;
  onEndTurn: () => void; aiTurn: boolean;
  prompt: { b: Battle; resolve: (how: 'fight' | 'auto' | 'cancel') => void } | null;
  onExit: () => void;
  toast: string | null;
}

export function CampaignHud({ c, layer, art, genomes, tick, refresh, onEndTurn, aiTurn, prompt, onExit, toast }: Props) {
  const me = c.factions[PLAYER];
  const [panel, setPanel] = useState<'research' | 'diplo' | 'log' | null>(null);
  const tot = factionTotals(c, PLAYER);
  const tech = me.research ? TECHS.find(t => t.id === me.research) : null;
  const sel = layer.sel;
  const army = sel.army !== undefined ? armyById(c, sel.army) : undefined;
  const town = sel.settlement !== undefined ? settlementById(c, sel.settlement) : undefined;
  const flash = (msg: string | null) => { if (msg) layer.api?.flash(msg); refresh(); };
  void tick;
  return (
    <div className="pointer-events-none fixed inset-0 z-[320] text-white select-none">
      {/* top bar */}
      <div className="pointer-events-auto absolute top-12 left-2 right-[200px] flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl pl-1.5 pr-3 py-1.5">
          <div className="w-7 h-7 rounded-md border border-black/40 flex items-center justify-center" style={{ background: me.color }}><Crown className="w-4 h-4 text-black/70" /></div>
          <div className="leading-tight">
            <div className="text-sm font-black">{nameOf(c, PLAYER)}</div>
            <div className="text-[10px] font-mono text-amber-200/80">Era {ERA_NAMES[me.era]} · {SEASONS[seasonOf(c.turn)]}, ano {yearOf(c.turn)}</div>
          </div>
        </div>
        <Stat icon={<Coins className="w-4 h-4 text-amber-300" />} label="Ouro" value={Math.floor(me.gold).toLocaleString('pt-BR')} sub={`${tot.net >= 0 ? '+' : ''}${Math.round(tot.net)}/turno`} warn={tot.net < 0} title={`Receita ${Math.round(tot.gold)} · manutenção do exército ${Math.round(tot.upkeep)}`} />
        <button onClick={() => setPanel(panel === 'research' ? null : 'research')} className={`flex items-center gap-2 bg-black/70 border rounded-xl px-3 py-1.5 text-left ${!tech ? 'border-amber-300/70 animate-pulse' : 'border-white/10 hover:bg-white/10'}`}>
          <FlaskConical className="w-4 h-4 text-sky-300" />
          <div className="leading-tight min-w-[120px]">
            <div className="text-[10px] text-neutral-400">Pesquisa · +{Math.round(tot.research)}/turno</div>
            <div className="text-xs font-bold">{tech ? tech.name : 'Escolha uma pesquisa'}</div>
            {tech && <div className="h-1 w-full rounded bg-white/10 mt-0.5"><div className="h-full rounded bg-sky-400" style={{ width: `${Math.min(100, (me.rp / techCost(tech)) * 100)}%` }} /></div>}
          </div>
        </button>
        <button onClick={() => setPanel(panel === 'diplo' ? null : 'diplo')} className="flex items-center gap-1.5 bg-black/70 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-2 text-xs"><Handshake className="w-4 h-4" /> Diplomacia{c.offers.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-400 text-black font-bold">{c.offers.length}</span>}</button>
        <button onClick={() => setPanel(panel === 'log' ? null : 'log')} className="flex items-center gap-1.5 bg-black/70 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-2 text-xs"><ScrollText className="w-4 h-4" /> Crônica</button>
      </div>
      {/* end turn */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-end gap-2">
        <div className="text-[11px] font-mono text-neutral-300 bg-black/60 rounded-lg px-2 py-1">Turno {c.turn + 1}</div>
        <button disabled={aiTurn || !!prompt} onClick={onEndTurn} className="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-black bg-gradient-to-r from-amber-300 to-yellow-200 disabled:opacity-50 shadow-[0_0_30px_rgba(252,211,77,0.3)]">
          {aiTurn ? <><Hourglass className="w-5 h-5 animate-spin" /> Outras nações…</> : <>Encerrar turno <ChevronRight className="w-5 h-5" /></>}
        </button>
      </div>
      {/* chronicle (last lines) */}
      <div className="pointer-events-auto absolute bottom-3 left-3 w-[330px] max-w-[45vw] flex flex-col gap-1">
        {c.log.slice(-5).map((l, i) => (
          <button key={i} onClick={() => { if (l.x !== undefined && layer.api) layer.api.jump(l.x, l.y!); }} className={`text-left text-[11px] px-2 py-1 rounded-lg bg-black/60 border border-white/5 ${l.kind === 'bad' || l.kind === 'war' ? 'text-red-200' : l.kind === 'era' ? 'text-amber-200' : l.kind === 'battle' ? 'text-orange-200' : 'text-neutral-200'}`}>
            <span className="text-neutral-500 font-mono mr-1">{l.turn + 1}</span>{l.text}
          </button>
        ))}
      </div>
      {/* selection */}
      {army && <ArmyPanel c={c} a={army} art={art} genomes={genomes} layer={layer} refresh={refresh} />}
      {town && <TownPanel c={c} s={town} art={art} genomes={genomes} layer={layer} flash={flash} />}
      {/* panels */}
      {panel === 'research' && <ResearchPanel c={c} close={() => setPanel(null)} refresh={refresh} />}
      {panel === 'diplo' && <DiploPanel c={c} close={() => setPanel(null)} flash={flash} />}
      {panel === 'log' && (
        <Modal title="Crônica" close={() => setPanel(null)}>
          <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-1">
            {[...c.log].reverse().map((l, i) => <div key={i} className="text-xs text-neutral-200"><span className="font-mono text-neutral-500 mr-2">T{l.turn + 1}</span>{l.text}</div>)}
          </div>
        </Modal>
      )}
      {/* offers */}
      {c.offers.length > 0 && !prompt && !aiTurn && (
        <div className="pointer-events-auto absolute top-[230px] right-3 w-72 flex flex-col gap-2">
          {c.offers.slice(0, 3).map(o => (
            <div key={o.id} className="rounded-xl bg-black/80 border border-amber-300/40 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold" style={{ color: colorOf(c, o.from) }}><Flag className="w-3.5 h-3.5" /> {nameOf(c, o.from)}</div>
              <div className="text-neutral-200 mt-1">{o.kind === 'peace' ? 'propõe paz.' : o.kind === 'alliance' ? 'propõe uma aliança.' : `exige um tributo de ${o.gold} de ouro — ou é guerra.`}</div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => { answerOffer(c, o.id, true); refresh(); }} className="flex-1 py-1 rounded-md bg-emerald-400 text-black font-bold">Aceitar</button>
                <button onClick={() => { answerOffer(c, o.id, false); refresh(); }} className="flex-1 py-1 rounded-md bg-white/10">Recusar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* battle prompt */}
      {prompt && <BattlePrompt c={c} p={prompt} />}
      {toast && <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/80 border border-white/15 text-sm">{toast}</div>}
    </div>
  );
}

function Stat({ icon, label, value, sub, warn, title }: { icon: React.ReactNode; label: string; value: string; sub?: string; warn?: boolean; title?: string }) {
  return (
    <div title={title} className="flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5">
      {icon}
      <div className="leading-tight">
        <div className="text-[10px] text-neutral-400">{label}</div>
        <div className="text-sm font-bold font-mono">{value} {sub && <span className={`text-[10px] ${warn ? 'text-red-300' : 'text-emerald-300'}`}>{sub}</span>}</div>
      </div>
    </div>
  );
}
function Modal({ title, close, children, wide }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="pointer-events-auto absolute inset-0 bg-black/50 flex items-center justify-center p-4" onClick={close}>
      <div className={`rounded-2xl bg-[#0b0f16]/95 border border-white/10 p-4 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><div className="font-black tracking-wide">{title}</div><button onClick={close} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function Portrait({ art, g, era, unit, size = 40 }: { key?: React.Key; art: WarArt; g: Genome; era: number; unit: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, setT] = useState(0);
  const u = unitById(unit);
  const sh = u.el === 'vehicle' || u.el === 'piece' ? null : art.soldier(g, era, u, 'idle');
  useEffect(() => {
    if (!sh && u.el !== 'vehicle' && u.el !== 'piece') { const id = setTimeout(() => setT(t => t + 1), 400); return () => clearTimeout(id); }
    const c = ref.current; if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (!sh) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '20px sans-serif'; x.textAlign = 'center'; x.fillText(u.cls === 'air' || u.cls === 'heli' ? '✈' : '▣', c.width / 2, c.height * 0.7); return; }
    x.imageSmoothingEnabled = false;
    const k = Math.min(c.width / sh.cw, c.height / sh.ch) * 1.25;
    x.drawImage(sh.canvas, 0, 2 * sh.ch, sh.cw, sh.ch, (c.width - sh.cw * k) / 2, c.height - sh.ch * k + 6, sh.cw * k, sh.ch * k);
  });
  return <canvas ref={ref} width={size} height={size} className="shrink-0" style={{ imageRendering: 'pixelated', width: size, height: size }} />;
}

function ArmyPanel({ c, a, art, genomes, layer, refresh }: { c: Campaign; a: Army; art: WarArt; genomes: Genome[]; layer: CampaignLayer; refresh: () => void }) {
  const mine = a.owner === PLAYER;
  const g = genomes[a.owner] ?? genomes[0];
  const era = a.owner >= 0 ? c.factions[a.owner].era : 0;
  const town = a.at !== null ? settlementById(c, a.at) : null;
  return (
    <div className="pointer-events-auto absolute top-[108px] left-2 w-[320px] max-h-[62vh] overflow-y-auto rounded-xl bg-black/75 backdrop-blur-md border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono tracking-widest" style={{ color: colorOf(c, a.owner) }}>{town ? `GUARNIÇÃO DE ${town.name.toUpperCase()}` : 'EXÉRCITO'}</div>
          <div className="font-bold text-sm">{nameOf(c, a.owner)}</div>
        </div>
        <button onClick={() => { layer.sel = {}; refresh(); }} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="text-[11px] text-neutral-400 mt-1">Força {Math.round(armyPower(a))}{mine ? ` · movimento ${a.mp.toFixed(0)}/${moveOf(c.factions[PLAYER]).toFixed(0)}` : ''}{a.boat ? ' · embarcado' : ''}</div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {a.regs.map((r, i) => {
          const u = unitById(r.u);
          return (
            <div key={i} title={`${u.name} — ${u.blurb}`} className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/5 p-1">
              <Portrait art={art} g={g} era={era} unit={r.u} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] leading-tight truncate">{u.name}</div>
                <div className="h-1 rounded bg-white/10 mt-0.5"><div className="h-full rounded bg-emerald-400" style={{ width: `${(r.men / u.men) * 100}%` }} /></div>
                <div className="text-[9px] font-mono text-neutral-400">{r.men}/{u.men}{r.xp ? ' ' + '★'.repeat(Math.min(3, Math.ceil(r.xp / 3))) : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      {mine && <div className="text-[10px] text-neutral-500 mt-2">Botão direito no mapa: mover · sobre um inimigo ou povoação: atacar.</div>}
    </div>
  );
}

function TownPanel({ c, s, art, genomes, layer, flash }: { c: Campaign; s: Settlement; art: WarArt; genomes: Genome[]; layer: CampaignLayer; flash: (m: string | null) => void }) {
  const mine = s.owner === PLAYER;
  const f = s.owner >= 0 ? c.factions[s.owner] : null;
  const inc = income(c, s), lv = levelOf(s.pop);
  const garrison = c.armies.filter(a => a.at === s.id);
  const [tab, setTab] = useState<'build' | 'recruit'>('recruit');
  const era = f?.era ?? 0;
  return (
    <div className="pointer-events-auto absolute top-[108px] left-2 w-[360px] max-h-[68vh] overflow-y-auto rounded-xl bg-black/75 backdrop-blur-md border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono tracking-widest" style={{ color: colorOf(c, s.owner) }}>{s.capital ? 'CAPITAL · ' : ''}{LEVELS[lv].name.toUpperCase()}</div>
          <div className="font-black text-base">{s.name}</div>
          <div className="text-[11px] text-neutral-400">{nameOf(c, s.owner)}</div>
        </div>
        <button onClick={() => { layer.sel = {}; flash(null); }} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
        <div className="rounded-md bg-white/5 p-1.5"><Users className="w-3.5 h-3.5 inline mr-1 text-emerald-300" />{Math.round(s.pop).toLocaleString('pt-BR')}<div className="text-[9px] text-emerald-300">{inc.grow >= 0 ? '+' : ''}{Math.round(inc.grow)} · máx {Math.round(popCap(c, s) / 1000)}k</div></div>
        <div className="rounded-md bg-white/5 p-1.5"><Coins className="w-3.5 h-3.5 inline mr-1 text-amber-300" />+{Math.round(inc.gold)}</div>
        <div className="rounded-md bg-white/5 p-1.5"><FlaskConical className="w-3.5 h-3.5 inline mr-1 text-sky-300" />+{Math.round(inc.research)}</div>
      </div>
      {s.unrest > 0 && <div className="text-[11px] text-orange-300 mt-1">Agitação após a conquista: rendas pela metade ({s.unrest} turnos).</div>}
      {!mine && <div className="text-[11px] text-neutral-400 mt-2">Defesa estimada: {Math.round(defencePower(c, s) + garrison.reduce((q, a) => q + armyPower(a), 0))}{s.built.includes('walls') ? ' · muralhas' : ''}</div>}
      {/* garrison */}
      {garrison.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-neutral-400 mb-1">Guarnição</div>
          {garrison.map(a => (
            <button key={a.id} onClick={() => { layer.sel = { army: a.id }; flash(null); }} className="w-full flex flex-wrap gap-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 p-1">
              {a.regs.map((r, i) => <Portrait key={i} art={art} g={genomes[a.owner] ?? genomes[0]} era={era} unit={r.u} size={26} />)}
              {mine && <span className="text-[10px] text-sky-300 self-center ml-1">selecionar para marchar</span>}
            </button>
          ))}
        </div>
      )}
      {mine && (
        <>
          <div className="flex gap-1 mt-3">
            <button onClick={() => setTab('recruit')} className={`flex-1 py-1 rounded-md text-xs ${tab === 'recruit' ? 'bg-amber-300 text-black font-bold' : 'bg-white/5'}`}><Swords className="w-3.5 h-3.5 inline mr-1" />Recrutar ({s.queue.length}/{recruitSlots(s)})</button>
            <button onClick={() => setTab('build')} className={`flex-1 py-1 rounded-md text-xs ${tab === 'build' ? 'bg-amber-300 text-black font-bold' : 'bg-white/5'}`}><Hammer className="w-3.5 h-3.5 inline mr-1" />Construir ({slotsUsed(s)}/{slotsOf(lv)})</button>
          </div>
          {tab === 'recruit' ? (
            <div className="mt-2">
              {s.queue.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{s.queue.map((u, i) => <button key={i} onClick={() => { cancelRecruit(c, s, i); flash(null); }} title="Cancelar" className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px]">{unitById(u).name} ✕</button>)}</div>}
              <div className="grid grid-cols-2 gap-1">
                {recruitable(c, s).map(u => (
                  <button key={u.id} onClick={() => flash(orderRecruit(c, s, u.id))} title={u.blurb} className="flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 p-1 text-left">
                    <Portrait art={art} g={genomes[PLAYER]} era={era} unit={u.id} size={32} />
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight">{u.name}</div>
                      <div className="text-[9px] text-neutral-400">{CLASS_NAME[u.cls]}</div>
                      <div className="text-[9px] font-mono text-amber-200">{unitCost(s, u)} · {u.upkeep}/t</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {s.build && <div className="rounded-lg bg-amber-300/10 border border-amber-300/30 p-1.5 text-[11px]">Em obras: <b>{buildingById(s.build.id).names[era]}</b> · {s.build.left} turno(s)</div>}
              {s.built.map(id => <div key={id} className="text-[11px] text-emerald-200">✓ {buildingById(id).names[era]}</div>)}
              {buildable(c, s).map(b => (
                <button key={b.id} disabled={!!s.build} onClick={() => flash(orderBuild(c, s, b.id))} className="flex items-center justify-between rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/5 px-2 py-1 text-left">
                  <div><div className="text-xs font-bold">{b.names[era]}</div><div className="text-[10px] text-neutral-400">{b.blurb}</div></div>
                  <div className="text-[10px] font-mono text-amber-200 shrink-0 ml-2">{buildCost(c, s, b)} · {b.turns}t</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResearchPanel({ c, close, refresh }: { c: Campaign; close: () => void; refresh: () => void }) {
  const me = c.factions[PLAYER];
  const av = new Set(availableTechs(me).map(t => t.id));
  const eras = [...new Set(TECHS.map(t => t.era))].filter(e => e <= me.era + 1);
  return (
    <Modal title="Pesquisa" close={close} wide>
      <div className="text-[11px] text-neutral-400 mb-2">Pesquise {ADVANCE_NEED} tecnologias da era para liberar a que abre a era seguinte (destacada).</div>
      <div className="flex flex-col gap-2 max-h-[64vh] overflow-y-auto">
        {eras.slice(-3).map(e => (
          <div key={e}>
            <div className="text-[10px] font-mono tracking-widest text-amber-200/70 mb-1">ERA {ERA_NAMES[e].toUpperCase()}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TECHS.filter(t => t.era === e).map(t => {
                const done = me.techs.includes(t.id), cur = me.research === t.id, ok = av.has(t.id);
                return (
                  <button key={t.id} disabled={!ok} onClick={() => { me.research = t.id; refresh(); close(); }}
                    className={`text-left rounded-lg border p-2 ${done ? 'bg-emerald-500/15 border-emerald-300/30' : cur ? 'bg-sky-500/25 border-sky-300' : ok ? 'bg-white/5 border-white/15 hover:bg-white/10' : 'bg-white/[0.02] border-white/5 opacity-50'} ${t.advance ? 'ring-1 ring-amber-300/60' : ''}`}>
                    <div className="text-xs font-bold flex items-center gap-1">{t.advance && <Sparkles className="w-3 h-3 text-amber-300" />}{t.name}</div>
                    <div className="text-[10px] text-neutral-400">{t.blurb}</div>
                    <div className="text-[9px] font-mono text-sky-200 mt-0.5">{done ? 'concluída' : cur ? `${Math.floor(me.rp)}/${techCost(t)}` : techCost(t)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function DiploPanel({ c, close, flash }: { c: Campaign; close: () => void; flash: (m: string | null) => void }) {
  const me = c.factions[PLAYER];
  const met = c.factions.filter(f => f.id !== PLAYER && f.alive && me.met.includes(f.id));
  return (
    <Modal title="Diplomacia" close={close} wide>
      {!met.length && <div className="text-sm text-neutral-400">Nenhuma outra nação encontrada ainda — explore o mundo.</div>}
      <div className="flex flex-col gap-1.5 max-h-[64vh] overflow-y-auto">
        {met.map(f => {
          const d = diplo(c, PLAYER, f.id);
          const st = d.s === 'war' ? 'Guerra' : d.s === 'alliance' ? 'Aliança' : 'Paz';
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 border border-white/5 p-2">
              <div className="w-4 h-8 rounded-sm" style={{ background: f.color }} />
              <div className="min-w-[180px] flex-1">
                <div className="text-sm font-bold">{nameOf(c, f.id)}</div>
                <div className="text-[10px] text-neutral-400">Era {ERA_NAMES[f.era]} · {c.settlements.filter(s => s.owner === f.id).length} povoações · relação {Math.round(d.v)}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${d.s === 'war' ? 'bg-red-500/30 text-red-200' : d.s === 'alliance' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/10'}`}>{st}</span>
              {d.s === 'war' && <button onClick={() => { if (accepts(c, f.id, PLAYER, 'peace')) { makePeace(c, PLAYER, f.id); flash('Paz aceita.'); } else flash('Recusaram a paz.'); }} className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15"><Handshake className="w-3.5 h-3.5 inline mr-1" />Propor paz</button>}
              {d.s === 'peace' && <button onClick={() => { if (accepts(c, f.id, PLAYER, 'alliance')) { makeAlliance(c, PLAYER, f.id); flash('Aliança firmada.'); } else flash('Recusaram a aliança.'); }} className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15"><Shield className="w-3.5 h-3.5 inline mr-1" />Propor aliança</button>}
              {d.s !== 'war' && <button onClick={() => { if (confirm(`Declarar guerra a ${nameOf(c, f.id)}?`)) { declareWar(c, PLAYER, f.id); flash(null); } }} className="px-2 py-1 rounded-md text-xs bg-red-500/20 hover:bg-red-500/30"><Swords className="w-3.5 h-3.5 inline mr-1" />Declarar guerra</button>}
              <button onClick={() => { const v = Math.round(60 * Math.pow(1.5, me.era)); flash(gift(c, PLAYER, f.id, v) ? `Presente de ${v} de ouro enviado.` : 'Ouro insuficiente.'); }} className="px-2 py-1 rounded-md text-xs bg-amber-300/20 hover:bg-amber-300/30"><Coins className="w-3.5 h-3.5 inline mr-1" />Presente</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function BattlePrompt({ c, p }: { c: Campaign; p: { b: Battle; resolve: (how: 'fight' | 'auto' | 'cancel') => void } }) {
  const b = p.b;
  const att = armyById(c, b.att);
  const defs = b.defs.map(id => armyById(c, id)).filter(Boolean) as Army[];
  const town = b.settlement !== null ? settlementById(c, b.settlement) : null;
  const pa = att ? armyPower(att) : 0, pd = defs.reduce((q, a) => q + armyPower(a), 0) + b.militia.reduce((q, r) => q + (unitById(r.u).cost / 10) * (r.men / unitById(r.u).men), 0) + (town ? defencePower(c, town) * 0.3 : 0);
  const mineAtt = b.attacker === PLAYER;
  const ratio = mineAtt ? pa / Math.max(1, pd) : pd / Math.max(1, pa);
  const odds = ratio > 1.6 ? 'Vitória decisiva provável' : ratio > 1.1 ? 'Vantagem' : ratio > 0.85 ? 'Equilibrada' : ratio > 0.6 ? 'Desvantagem' : 'Muito arriscado';
  const men = (a?: Army) => (a ? a.regs.reduce((q, r) => q + r.men, 0) : 0);
  return (
    <div className="pointer-events-auto absolute inset-0 bg-black/55 flex items-center justify-center p-4">
      <div className="w-[440px] rounded-2xl bg-[#0f0c0a]/95 border border-amber-300/40 p-5">
        <div className="text-[10px] font-mono tracking-[0.3em] text-amber-200/70">{town ? 'CERCO' : 'BATALHA'}{town ? ` · ${town.name.toUpperCase()}` : ''}</div>
        <div className="text-xl font-black mt-0.5">{mineAtt ? 'Atacar?' : 'Seu exército foi atacado!'}</div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div className="rounded-lg bg-white/5 p-2"><div className="text-xs font-bold" style={{ color: colorOf(c, b.attacker) }}>{nameOf(c, b.attacker)}</div><div className="text-[11px] text-neutral-300">{att?.regs.length ?? 0} unidades · {men(att)} soldados</div></div>
          <div className="rounded-lg bg-white/5 p-2"><div className="text-xs font-bold" style={{ color: colorOf(c, b.defender) }}>{b.defender === REBELS ? 'Independentes' : nameOf(c, b.defender)}</div><div className="text-[11px] text-neutral-300">{defs.reduce((q, a) => q + a.regs.length, 0) + b.militia.length} unidades · {defs.reduce((q, a) => q + men(a), 0) + b.militia.reduce((q, r) => q + r.men, 0)} soldados</div></div>
        </div>
        <div className="mt-2 text-xs text-neutral-300">Previsão: <b className={ratio >= 1 ? 'text-emerald-300' : 'text-orange-300'}>{odds}</b></div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => p.resolve('fight')} className="flex-1 py-2 rounded-xl font-bold text-black bg-amber-300 hover:bg-amber-200"><Swords className="w-4 h-4 inline mr-1" />Comandar a batalha</button>
          <button onClick={() => p.resolve('auto')} className="flex-1 py-2 rounded-xl font-bold bg-white/10 hover:bg-white/15">Resolver automaticamente</button>
        </div>
        {mineAtt && <button onClick={() => p.resolve('cancel')} className="w-full mt-2 py-1.5 rounded-lg text-xs text-neutral-400 hover:bg-white/5">Recuar e não atacar</button>}
      </div>
    </div>
  );
}
