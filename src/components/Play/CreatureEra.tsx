// The creature eras (aquatic, land) on the home planet: the simulation worker over the planet grid, the RTS layer
// on the planet view (the aquatic era is played in the underwater layer), the HUD, saving, the life stage pushed by
// the oxygen, and the way into the next era.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SurvivalView } from '../Survival/SurvivalView';
import { useHomePlanet } from './useHomePlanet';
import { RtsClient } from '../../lib/game/rts/client';
import { defsFor, type RtsMode } from '../../lib/game/rts/defs';
import { wildFor } from '../../lib/game/rts/wild';
import { WX, type RtsSave } from '../../lib/game/rts/sim';
import { RtsLayer } from './rts/RtsLayer';
import { RtsHud } from './rts/RtsHud';
import { lineageGenome, saveGame, advance, type GameSave } from '../../lib/game/save';
import { homeConfig } from '../../lib/play/homeworld';
import { PlanetLoading } from './PlanetLoading';
import type { PlanetGrid } from '../../lib/planet-generator/planetClient';

interface Props { mode: RtsMode; save: GameSave; onExit: () => void; onAdvance: () => void }

/** underwater gameplay zoom 1 (index in SurvivalView's underwater ladder), surface zoom 1 */
const START_ZOOM: Record<RtsMode, number> = { aqua: -9, land: 4 };

export function CreatureEra({ mode, save, onExit, onAdvance }: Props) {
  const P = useHomePlanet(save.lifeStage, mode === 'aqua');
  const defs = defsFor(mode);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(q => (q === t ? null : q)), 2600); };
  const [lost, setLost] = useState(false);

  // where the era starts (world px): the waters of origin, or where the last era left the lineage
  const start = useMemo(() => {
    if (!P.grid || !P.origin) return null;
    const CELL = WX / P.grid.w;
    if (save.home) return save.home;
    const o = { x: (P.origin.x + 0.5) * CELL, y: (P.origin.y + 0.5) * CELL };
    return mode === 'aqua' ? o : nearestShore(P.grid, o.x, o.y, CELL) ?? o;
  }, [P.grid, P.origin, save.home, mode]);

  const client = useMemo(() => {
    if (!P.grid || !start || !P.home) return null;
    const sp = P.species;
    const prev = save.creature as { mode: RtsMode; sim: RtsSave } | undefined;
    return new RtsClient({
      mode, grid: P.grid, seed: P.home.config.seed, lifeStage: save.lifeStage, alien: sp.mode === 'alien',
      player: { name: `${sp.genus} ${sp.species}`, seed: sp.seed, params: lineageGenome(sp).params, x: start.x, y: start.y },
      rivals: 11, wild: wildFor(homeConfig(P.home, save.lifeStage, mode === 'aqua'), mode),
      save: prev && prev.mode === mode ? prev.sim : null, dna: save.dna, techs: save.techs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P.grid, start, P.home, mode]);
  useEffect(() => () => client?.dispose(), [client]);

  const layer = useMemo(() => {
    if (!client || !P.home) return null;
    const sp = P.species;
    return new RtsLayer(client, defs, over => lineageGenome(sp, over), wildFor(homeConfig(P.home, save.lifeStage, mode === 'aqua'), mode), sp.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // messages, defeat, the life stage pushed by the oxygen, autosave
  const applied = useRef(save.lifeStage);
  const lastApply = useRef(0);
  useEffect(() => {
    if (!client) return;
    client.onMsg = flash;
    let centred = false;
    const off = client.subscribe(h => {
      const now = performance.now();
      // the simulation settles the lineage on the nearest habitable spot: look at it once
      if (!centred && layer?.api) { const b = client.builds.find(q => q.nation === 0); if (b) { centred = true; layer.api.jump(b.x, b.y); } }
      if (P.session && Math.abs(h.lifeStage - applied.current) >= 0.03 && now - lastApply.current > 15000) {
        applied.current = h.lifeStage; lastApply.current = now;
        P.session.setLifeStage(h.lifeStage);
        layer?.api?.refreshTerrain();
      }
    });
    const prevEv = client.onEvents;
    client.onEvents = ev => { prevEv?.(ev); for (const e of ev) { if (e.k === 'msg' && e.text) flash(e.text); if (e.k === 'lost') setLost(true); } };
    const persist = async () => {
      const s = await client.save();
      save.creature = { mode, sim: s };
      save.lifeStage = client.hud.lifeStage || save.lifeStage;
      if (client.hud.stats) save.dna = client.hud.stats.dna;
      saveGame(save);
    };
    const id = setInterval(persist, 30000);
    return () => { off(); clearInterval(id); void persist(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, layer, P.session]);

  const victory = () => {
    if (!client) return;
    const mine = client.builds.filter(b => b.nation === 0);
    const at = mode === 'aqua' ? mine.find(b => defs.buildings[b.type].site === 'shore') ?? mine[0] : mine.find(b => defs.buildings[b.type].trains) ?? mine[0];
    const st = client.hud.stats;
    save.dna = st?.dna ?? save.dna;
    save.techs = [...new Set([...save.techs, ...(st?.techs ?? [])])];
    save.lifeStage = Math.max(save.lifeStage, client.hud.lifeStage, mode === 'aqua' ? 0.62 : 0.92);
    advance(save, mode === 'aqua' ? 'land' : 'tribal', at ? { x: at.x, y: at.y } : start ?? undefined);
    onAdvance();
  };

  if (!P.session || !P.grid || !start || !client || !layer || !P.fog) return <PlanetLoading status={P.status} progress={P.progress} species={P.species} error={P.error} onBack={onExit} />;
  const CELL = WX / P.grid.w;
  return (
    <>
      <SurvivalView session={P.session} mapX={Math.floor(start.x / CELL)} mapY={Math.floor(start.y / CELL)} spectator title="Mundo natal"
        aquatic={mode === 'aqua'} noFauna discovery={{ fog: P.fog, sight: 160 }} startZoom={START_ZOOM[mode]} onExit={onExit}
        game={layer} gameHud={<RtsHud client={client} layer={layer} defs={defs} eraName={mode === 'aqua' ? 'Aquática' : 'Terrestre'} onExit={onExit}
          onVictory={victory} victoryLabel={mode === 'aqua' ? 'Conquistar a terra →' : 'Sapiência: fundar a primeira tribo →'} toast={toast} />} />
      {lost && (
        <div className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center">
          <div className="bg-[#0b0f14] border border-red-300/30 rounded-2xl p-6 text-center text-white max-w-sm">
            <div className="text-xl font-black text-red-200">A linhagem se extinguiu</div>
            <p className="text-sm text-neutral-300 mt-2">Sem ninhais e sem criaturas, a espécie desapareceu deste mundo.</p>
            <div className="mt-4 flex gap-2 justify-center">
              <button onClick={() => { save.creature = undefined; saveGame(save); location.reload(); }} className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-300/30">Recomeçar a era</button>
              <button onClick={onExit} className="px-3 py-1.5 rounded-lg bg-white/10">Sair</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** the land point nearest to (x, y) that touches the sea (world px) */
function nearestShore(G: PlanetGrid, x: number, y: number, CELL: number): { x: number; y: number } | null {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  const at = (i: number, j: number) => G.elev[Math.max(0, Math.min(G.h - 1, j)) * G.w + (((i % G.w) + G.w) % G.w)];
  for (let r = 1; r < 200; r++) for (let a = 0; a < r * 8; a++) {
    const t = (a / (r * 8)) * Math.PI * 2, i = Math.round(cx + Math.cos(t) * r), j = Math.round(cy + Math.sin(t) * r);
    if (at(i, j) < G.sea) continue;
    if (at(i + 1, j) < G.sea || at(i - 1, j) < G.sea || at(i, j + 1) < G.sea || at(i, j - 1) < G.sea) {
      // a cell further inland, so the den stands on solid ground
      const di = Math.sign(i - cx), dj = Math.sign(j - cy);
      return { x: (i + di * 1.5 + 0.5) * CELL, y: (j + dj * 1.5 + 0.5) * CELL };
    }
  }
  return null;
}
