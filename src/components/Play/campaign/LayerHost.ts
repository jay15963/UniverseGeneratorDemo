// One game layer slot of the planet view, whose content changes: the campaign map, then a battle, then the map
// again - on the same view, so the terrain, the cities and the camera stay loaded.
import type { GameLayer, GameFrame, GameDraw, WorldApi, PointerInfo } from '../../../lib/game/layer';

export class LayerHost implements GameLayer {
  api: WorldApi | null = null;
  constructor(public inner: GameLayer) {}
  set(l: GameLayer) {
    if (l === this.inner) return;
    this.inner.detach?.();
    this.inner = l;
    if (this.api) l.attach(this.api);
  }
  attach(api: WorldApi) { this.api = api; this.inner.attach(api); }
  detach() { this.inner.detach?.(); this.api = null; }
  update(f: GameFrame) { this.inner.update(f); }
  collect(f: GameFrame): GameDraw[] { return this.inner.collect(f); }
  overlay(o: CanvasRenderingContext2D, f: GameFrame) { this.inner.overlay(o, f); }
  pointerDown(p: PointerInfo) { return this.inner.pointerDown?.(p) ?? false; }
  pointerMove(p: PointerInfo) { this.inner.pointerMove?.(p); }
  pointerUp(p: PointerInfo) { this.inner.pointerUp?.(p); }
  key(k: string, down: boolean, e: KeyboardEvent) { return this.inner.key?.(k, down, e) ?? false; }
  sight() { return this.inner.sight?.() ?? []; }
  box() { return this.inner.box?.() ?? null; }
}
