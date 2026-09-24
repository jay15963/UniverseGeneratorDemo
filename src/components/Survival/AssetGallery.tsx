import React, { useEffect, useRef } from 'react';
import { SpriteBank, paintPlayer } from '../../lib/terrain/sprites';
import { Feat } from '../../lib/terrain/types';
import { featureName } from '../../lib/terrain/items';

// Every procedural asset on one sheet (open with #galeria). Handy for art review.
const ROWS: [Feat, number[]][] = [
  [Feat.OAK, [0, 1, 4, 5]], [Feat.BIRCH, [0, 1]], [Feat.MAPLE, [0, 2, 3]], [Feat.PINE, [0, 4]], [Feat.SPRUCE, [0, 4]],
  [Feat.ACACIA, [0]], [Feat.KAPOK, [0]], [Feat.PALM, [0, 1]], [Feat.WILLOW, [0]], [Feat.DEAD_TREE, [0]],
  [Feat.BUSH, [0, 4]], [Feat.BERRY_BLUE, [0]], [Feat.BERRY_RED, [0]], [Feat.BERRY_BLACK, [0]],
  [Feat.TALL_GRASS, [0, 3, 6]], [Feat.FERN, [0, 4]], [Feat.REEDS, [0]], [Feat.CATTAIL, [0]], [Feat.FLAX, [0]],
  [Feat.FLOWER, [0, 3, 6, 9, 12, 15, 18]], [Feat.MUSHROOM, [0, 5, 6, 9]], [Feat.WILD_CROP, [0, 2, 4, 6, 8]],
  [Feat.CACTUS, [0, 3]], [Feat.DEAD_BUSH, [0]], [Feat.LILY_PAD, [0, 3]],
  [Feat.STICK, [0, 3]], [Feat.LOOSE_STONE, [0, 5, 7, 11, 14, 17, 20, 23]], [Feat.FLINT, [0]],
  [Feat.NUGGET_COPPER, [0]], [Feat.NUGGET_TIN, [0]], [Feat.NUGGET_GOLD, [0]], [Feat.LIMONITE, [0]], [Feat.SEASHELL, [0, 1, 2]],
  [Feat.BOULDER, [0, 2, 9, 19, 4]], [Feat.FALLEN_LOG, [0, 4]], [Feat.STUMP, [0]],
  [Feat.ICE_CRYSTAL, [0]], [Feat.OBSIDIAN, [0]], [Feat.SULFUR, [0]], [Feat.DIAMOND, [0]], [Feat.SALT_CRYSTAL, [0]],
];

export function AssetGallery() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const bank = new SpriteBank(0);
    const Z = 3, pad = 10, colW = 80 * Z;
    const items: { s: ReturnType<SpriteBank['get']>; label: string }[] = [];
    for (const [t, vs] of ROWS) for (const v of vs) items.push({ s: bank.get(t, v), label: featureName({ id: '', t, v, x: 0, y: 0, l: 0 }) });
    items.push({ s: bank.get(Feat.BERRY_BLUE, 0, true), label: 'Arbusto colhido' });
    const perRow = Math.max(1, Math.floor((window.innerWidth - 40) / colW));
    const rowH = 90 * Z;
    const player = paintPlayer();
    c.width = perRow * colW + pad * 2;
    c.height = Math.ceil(items.length / perRow) * rowH + 140 * Z / 2 + pad * 2;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#4a6a34'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.font = '12px ui-sans-serif, system-ui'; ctx.textAlign = 'center';
    items.forEach((it, i) => {
      const cx = pad + (i % perRow) * colW + colW / 2, by = pad + Math.floor(i / perRow) * rowH + rowH - 30;
      ctx.drawImage(it.s.c, cx - it.s.ax * Z, by - it.s.ay * Z, it.s.c.width * Z, it.s.c.height * Z);
      ctx.fillStyle = '#fff'; ctx.fillText(it.label, cx, by + 20);
    });
    const py = c.height - 80 * Z / 2 - pad;
    (['down', 'up', 'left', 'right'] as const).forEach((d, di) => player[d].forEach((f, fi) => ctx.drawImage(f, pad + (di * 4 + fi) * 20 * Z, py, 16 * Z, 24 * Z)));
  }, []);
  return <div className="min-h-screen bg-neutral-900 p-4 overflow-auto"><canvas ref={ref} style={{ imageRendering: 'pixelated' }} /></div>;
}
