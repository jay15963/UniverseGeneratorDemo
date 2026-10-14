// The civilisation eras (tribal .. space): the grand campaign on the home planet. Loads the planet, founds the
// nations on the best city sites (the player's capital where the lineage lived), draws every settlement with the
// city generator (re-planned when its nation enters a new era, grown with its population), runs the turns (the
// other nations' moves, battles, economy) and switches the same planet view into real-time battles.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SurvivalView } from '../../Survival/SurvivalView';
import { useHomePlanet } from '../useHomePlanet';
import { PlanetLoading } from '../PlanetLoading';
import type { GameSave } from '../../../lib/game/save';
import { saveGame } from '../../../lib/game/save';
import { civEra, eraById } from '../../../lib/game/eras';
import { CampaignWorld, WX } from '../../../lib/game/campaign/world';
import {
  newCampaign, moveArmy, autoResolve, applyOutcome, endTurnEconomy, aiTurn, PLAYER, nameOf, type Campaign, type Battle, type Site,
  settlementById, ERA_NAMES,
} from '../../../lib/game/campaign/campaign';
import { levelOf } from '../../../lib/game/campaign/defs';
import { cityName } from '../../../lib/city/plan';
import { seedToInt } from '../../../lib/terrain/noise';
import { TILE } from '../../../lib/terrain/types';
import { planetFauna } from '../../../lib/fauna/species';
import { StructPool } from '../../../lib/structure/structPool';
import { WarArt, factionGenome, factionCulture, pickMount } from '../war/art';
import { CampaignLayer } from './CampaignLayer';
import { CampaignHud } from './CampaignHud';
import { LayerHost } from './LayerHost';
import { BattleLayer } from '../battle/BattleLayer';
import { BattleHud } from '../battle/BattleHud';
import { battleSetup, battleOutcome } from '../battle/setup';
import { BattleSim } from '../../../lib/game/battle/sim';
import type { Genome } from '../../../lib/creature/genome';
import type { Culture } from '../../../lib/structure/genome';

const REGIONAL = 10;   // ZOOMS index of 1/32
const BATTLE_ZOOM = 6; // 1/2

interface Props { save: GameSave; onExit: () => void; onAdvance: () => void }

export function CampaignEra({ save, onExit }: Props) {
  const P = useHomePlanet(Math.max(0.9, save.lifeStage), false);
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [status, setStatus] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const world = useMemo(() => (P.grid ? new CampaignWorld(P.grid) : null), [P.grid]);
  const sp = P.species;

  // --- the campaign: loaded, or founded on the planet's best sites -----------------------------------
  useEffect(() => {
    if (!world || !P.session || !P.home || camp) return;
    let dead = false;
    (async () => {
      const prev = save.campaign as Campaign | undefined;
      if (prev && prev.v === 1 && prev.factions?.length) { world.buildRegions(prev.settlements); if (!dead) setCamp(prev); return; }
      setStatus('FUNDANDO AS NAÇÕES…');
      const seed = seedToInt(String(P.home!.config.seed)) >>> 0;
      const raw = await P.session!.citySites(48, seed);
      const sites: Site[] = raw.map((s, i) => {
        const x = (s.tx + 0.5) * TILE, y = (s.ty + 0.5) * TILE, cell = world.cellOf(x, y);
        let coast = false;
        for (let dy = -2; dy <= 2 && !coast; dy++) for (let dx = -2; dx <= 2; dx++) if (!world.isLand(world.cellOf(x + dx * world.CELL, y + dy * world.CELL))) { coast = true; break; }
        const sseed = (Math.imul(s.tx, 73856093) ^ Math.imul(s.ty, 19349663) ^ seed) >>> 0;
        return { x, y, tx: s.tx, ty: s.ty, capital: s.capital, evo: s.evo, coast, fert: world.G.fert[cell] / 255, name: cityName(sseed, coast, 0) + (i < 0 ? '' : ''), seed: sseed };
      });
      if (!sites.length) { setStatus('Este mundo não tem terras habitáveis.'); return; }
      let home = save.home;
      if (!home && P.origin) home = { x: (P.origin.x + 0.5) * world.CELL, y: (P.origin.y + 0.5) * world.CELL };
      const era = eraById(save.era).civ ?? 0;
      const c = newCampaign(world, { seed, era, home: home ?? { x: sites[0].x, y: sites[0].y }, sites, species: `${sp.genus} ${sp.species}` });
      world.buildRegions(c.settlements);
      save.campaign = c; saveGame(save);
      if (!dead) setCamp(c);
    })().catch(e => setStatus(String(e)));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, P.session, P.home]);

  // --- art: the species in every nation's colours, their cultures, a mount from the planet's fauna ------
  const vpool = useRef<StructPool | null>(null);
  const hostRef = useRef<LayerHost | null>(null);
  const art = useMemo(() => {
    if (!P.session) return null;
    let mount = null;
    try { mount = pickMount(planetFauna({ ...P.session.config, life: { level: 'animal' } })); } catch { /* no fauna */ }
    return new WarArt(() => hostRef.current?.api?.store ?? null, () => (vpool.current ??= new StructPool(2, () => new Worker(new URL('../../../lib/vehicle/vehicle.worker.ts', import.meta.url), { type: 'module' }))), mount);
  }, [P.session]);
  useEffect(() => () => { vpool.current?.dispose(); vpool.current = null; }, []);
  const genomes = useMemo<Genome[]>(() => (camp ? camp.factions.map(f => factionGenome(sp, f.color)) : []), [camp, sp]);
  const cultures = useMemo<Culture[]>(() => (camp ? camp.factions.map(f => factionCulture(f.seed, sp.mode, 0.5)) : []), [camp, sp]);
  const rebelGenome = useMemo(() => factionGenome(sp, '#8a8f98'), [sp]);
  const rebelCulture = useMemo(() => factionCulture(1234, sp.mode), [sp]);
  const gOf = (fid: number) => (fid < 0 ? rebelGenome : genomes[fid]);
  const cOf = (fid: number) => (fid < 0 ? rebelCulture : cultures[fid]);

  const layer = useMemo(() => (camp && world && art && P.fog ? new CampaignLayer(camp, world, art, genomes, P.fog) : null), [camp, world, art, P.fog, genomes]);
  const host = useMemo(() => (layer ? new LayerHost(layer) : null), [layer]);
  hostRef.current = host;

  // --- cities: every settlement drawn by the city generator -------------------------------------------
  const planned = useRef(new Map<number, { era: number; p: number }>());
  const planning = useRef(false);
  const cityP = (c: Campaign, s: Campaign['settlements'][number]) => Math.max(30, Math.min(254, Math.round(40 + levelOf(s.pop) * 42 + Math.min(1, s.pop / 30000) * 40)));
  const syncCities = async () => {
    if (!camp || !P.session || !P.fog || planning.current) return;
    // only once the view stands (the planner shares the planet worker with the terrain) and only what is known
    const api = host?.api;
    const cap = settlementById(camp, camp.factions[PLAYER].capital) ?? camp.settlements[0];
    if (!api || !api.tile(cap.x, cap.y)) return;
    planning.current = true;
    try {
      const order = [...camp.settlements].sort((a, b) => world!.dist(a.x, a.y, cap.x, cap.y) - world!.dist(b.x, b.y, cap.x, cap.y));
      for (const s of order) {
        if (s.owner !== PLAYER && !P.fog.known(s.x / world!.CELL, s.y / world!.CELL)) continue;
        const era = s.owner >= 0 ? camp.factions[s.owner].era : Math.max(0, camp.factions[PLAYER].era - 1);
        const p = cityP(camp, s);
        const had = planned.current.get(s.cityId);
        if (had && had.era === era) {
          if (Math.abs(had.p - p) >= 8) { P.session.setCityLevel(s.cityId, p); had.p = p; host?.api?.citiesChanged(); }
          continue;
        }
        try {
          await P.session.planCity(s.tx, s.ty, era, p, s.cityId, s.name, sp.seed, s.seed);
          planned.current.set(s.cityId, { era, p });
          host?.api?.citiesChanged();
        } catch { planned.current.set(s.cityId, { era, p }); }
      }
    } finally { planning.current = false; }
  };
  useEffect(() => {
    if (!camp || !P.session || !host) return;
    P.session.setCityZones(false);
    const id = setInterval(() => { void syncCities(); }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camp, P.session, host]);

  // --- turn flow ----------------------------------------------------------------------------------------
  const [aiBusy, setAiBusy] = useState(false);
  const [prompt, setPrompt] = useState<{ b: Battle; resolve: (how: 'fight' | 'auto' | 'cancel') => void } | null>(null);
  const [battle, setBattle] = useState<{ sim: BattleSim; layer: BattleLayer; b: Battle; done: () => void; title: string } | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ending, setEnding] = useState<null | 'won' | 'lost' | 'beaten'>(null);
  const [newEra, setNewEra] = useState<number | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(q => (q === t ? null : q)), 2600); };

  const persist = () => {
    if (!camp) return;
    const me = camp.factions[PLAYER];
    const eraId = civEra(me.era);
    save.era = eraId;
    if (!save.reached.includes(eraId)) save.reached.push(eraId);
    save.campaign = camp;
    if (camp.winner === PLAYER) save.won = true;
    saveGame(save);
  };

  /** a battle the player is in: fought on the terrain or auto-resolved */
  const runBattle = (b: Battle, how: 'fight' | 'auto'): Promise<void> => new Promise(resolve => {
    if (!camp || !world || !host) { resolve(); return; }
    const finish = () => { if (layer) layer.version++; persist(); refresh(); resolve(); };
    if (how === 'auto') { const text = applyOutcome(camp, world, b, autoResolve(camp, b)); flash(text); finish(); return; }
    const api = host.api;
    if (!api) { applyOutcome(camp, world, b, autoResolve(camp, b)); finish(); return; }
    // bring the camera to the battlefield and let the terrain stream in
    const town = b.settlement !== null ? settlementById(camp, b.settlement) : null;
    api.jump(town ? town.x : b.x, town ? town.y : b.y, BATTLE_ZOOM);
    setPreparing('PREPARANDO O CAMPO DE BATALHA…');
    const t0 = performance.now();
    const wait = () => {
      const cx = town ? town.x : b.x, cy = town ? town.y : b.y;
      let ok = 0, n = 0;
      for (let dy = -800; dy <= 800; dy += 200) for (let dx = -1100; dx <= 1100; dx += 220) { n++; if (api.tile(cx + dx, cy + dy)) ok++; }
      if (ok / n < 0.9 && performance.now() - t0 < 15000) { setTimeout(wait, 300); return; }
      const { setup, me } = battleSetup(camp, b, api);
      const sim = new BattleSim(setup);
      const g2: [Genome, Genome] = [gOf(b.attacker), gOf(b.defender)];
      const c2: [Culture, Culture] = [cOf(b.attacker), cOf(b.defender)];
      const bl = new BattleLayer(sim, art!, g2, c2, me);
      host.set(bl);
      const waitSprites = () => {
        if (bl.readiness() < 0.85 && performance.now() - t0 < 25000) { setPreparing(`VESTINDO AS TROPAS… ${Math.round(bl.readiness() * 100)}%`); setTimeout(waitSprites, 300); return; }
        setPreparing(null);
        const title = town ? `Cerco de ${town.name}` : `Batalha de ${nameOf(camp, b.attacker)} × ${nameOf(camp, b.defender)}`;
        setBattle({ sim, layer: bl, b, title, done: () => {
          applyOutcome(camp, world, b, battleOutcome(sim, b));
          host.set(layer!);
          api.jump(sim.setup.cx, sim.setup.cy, REGIONAL - 2);
          setBattle(null);
          finish();
        } });
      };
      waitSprites();
    };
    wait();
  });

  const askBattle = (b: Battle, canCancel: boolean): Promise<void> => new Promise(resolve => {
    setPrompt({ b, resolve: how => {
      setPrompt(null);
      if (how === 'cancel' && canCancel) { resolve(); return; }
      void runBattle(b, how === 'cancel' ? 'auto' : how).then(resolve);
    } });
  });

  useEffect(() => {
    if (!layer || !camp || !world) return;
    layer.onChange = refresh;
    layer.onOrder = (a, x, y) => {
      if (aiBusy || prompt || battle) return;
      const r = moveArmy(camp, world, a, x, y);
      if (r.k === 'blocked') flash(r.reason);
      else if (r.k === 'battle') void askBattle(r.battle, true);
      layer.updateMet();
      persist();
      refresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, camp, world, aiBusy, prompt, battle]);

  const endTurn = async () => {
    if (!camp || !world || !layer || aiBusy) return;
    setAiBusy(true);
    layer.busy = true;
    layer.sel = {};
    try {
      const eraBefore = camp.factions[PLAYER].era;
      for (const f of camp.factions) {
        if (f.id === PLAYER || !f.alive) continue;
        await aiTurn(camp, world, f, { playerBattle: b => askBattle(b, false) });
        layer.version++;
      }
      const ev = endTurnEconomy(camp, world);
      layer.version++;
      layer.updateMet();
      for (const e of ev) if (e.k === 'won') setEnding(e.f === PLAYER ? 'won' : 'beaten');
      if (!camp.factions[PLAYER].alive) setEnding('lost');
      if (camp.factions[PLAYER].era > eraBefore) setNewEra(camp.factions[PLAYER].era);
      persist();
      void syncCities();
    } finally {
      layer.busy = false;
      setAiBusy(false);
      refresh();
    }
  };

  // keyboard: Enter ends the turn
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && !battle && !prompt && !aiBusy) void endTurn(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  // autosave on leave
  useEffect(() => () => persist(), // eslint-disable-line react-hooks/exhaustive-deps
    [camp]);

  if (!P.session || !P.grid || !P.fog || !camp || !layer || !host || !world) {
    return <PlanetLoading status={status || P.status} progress={P.progress} species={sp} error={P.error} onBack={onExit} />;
  }
  const cap = settlementById(camp, camp.factions[PLAYER].capital) ?? camp.settlements[0];
  return (
    <>
      <SurvivalView session={P.session} mapX={Math.floor(cap.x / world.CELL) % (WX / world.CELL)} mapY={Math.floor(cap.y / world.CELL)} spectator title="Mundo natal"
        discovery={{ fog: P.fog, sight: 200 }} startZoom={REGIONAL} cityLabels={false} onExit={onExit} game={host}
        gameHud={battle
          ? <BattleHud layer={battle.layer} title={battle.title} onDone={battle.done} />
          : <CampaignHud c={camp} layer={layer} art={art!} genomes={genomes} tick={tick} refresh={refresh} onEndTurn={() => void endTurn()} aiTurn={aiBusy} prompt={prompt} onExit={onExit} toast={toast} />} />
      {preparing && (
        <div className="fixed inset-0 z-[400] bg-black/80 flex flex-col items-center justify-center gap-3 text-white">
          <div className="w-10 h-10 rounded-full border-2 border-amber-300/30 border-t-amber-300 animate-spin" />
          <div className="font-mono text-xs tracking-widest text-amber-100/80">{preparing}</div>
        </div>
      )}
      {newEra !== null && !battle && (
        <div className="fixed inset-0 z-[400] bg-black/70 flex items-center justify-center p-4" onClick={() => setNewEra(null)}>
          <div className="rounded-2xl bg-[#0f0d08]/95 border border-amber-300/50 p-6 text-center text-white max-w-md">
            <div className="text-[10px] font-mono tracking-[0.3em] text-amber-200/70">UMA NOVA ERA</div>
            <div className="text-3xl font-black mt-1">Era {ERA_NAMES[newEra]}</div>
            <p className="text-sm text-neutral-300 mt-2">{eraById(civEra(newEra)).blurb}</p>
            <p className="text-xs text-neutral-400 mt-2">Suas tropas foram reequipadas e as cidades da nação se transformam.</p>
            <button className="mt-4 px-4 py-2 rounded-xl bg-amber-300 text-black font-bold">Continuar</button>
          </div>
        </div>
      )}
      {ending && (
        <div className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center p-4">
          <div className={`rounded-2xl p-6 text-center text-white max-w-md border ${ending === 'won' ? 'bg-[#0b1410]/95 border-emerald-300/50' : 'bg-[#140b0b]/95 border-red-300/40'}`}>
            <div className="text-3xl font-black">{ending === 'won' ? 'Rumo às estrelas!' : ending === 'beaten' ? 'Outra nação partiu primeiro' : 'Sua nação caiu'}</div>
            <p className="text-sm text-neutral-300 mt-2">{ending === 'won' ? `A nave colonial de ${sp.genus} ${sp.species} deixou o mundo natal. Da célula às estrelas: a linhagem venceu.` : ending === 'beaten' ? 'A nave colonial de uma nação rival deixou o planeta. Você pode continuar a campanha.' : 'Sem povoações, a nação deixou de existir.'}</p>
            <div className="flex gap-2 justify-center mt-4">
              {ending !== 'lost' && <button onClick={() => setEnding(null)} className="px-4 py-2 rounded-xl bg-white/10 font-bold">Continuar</button>}
              <button onClick={onExit} className="px-4 py-2 rounded-xl bg-amber-300 text-black font-bold">Eras da linhagem</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
