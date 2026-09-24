// Colour ramps shared by the ground rasterizer (worker) and the sprite painter (main thread).
// Ramps go dark -> light. Everything is plain data so it is safe inside a worker.

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const ramp = (...hs: string[]): RGB[] => hs.map(hex);

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
export function hueShift(c: RGB, deg: number, satMul = 1): RGB {
  if (!deg && satMul === 1) return c;
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb((h + deg + 360) % 360, Math.min(1, s * satMul), l);
}
export const shiftRamp = (r: RGB[], deg: number, satMul = 1) => r.map(c => hueShift(c, deg, satMul));
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const darken = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Hue rotation applied to all vegetation of an alien world (matches the surface map colours). */
export function vegetationHueShift(vegetationHue: string | undefined, alien: boolean): number {
  if (!alien) return 0;
  switch (vegetationHue) {
    case 'purple': return 165;
    case 'teal': return 55;
    case 'autumn-red': case 'red': return -85;
    case 'emerald': return 18;
    case 'blue': return 110;
    default: return 0;
  }
}
export function waterHueShift(waterHue: string | undefined, alien: boolean): number {
  if (!alien) return 0;
  switch (waterHue) {
    case 'green': return -90;
    case 'indigo': return 25;
    case 'cyan': return -25;
    case 'magenta': return 90;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Vegetation
// ---------------------------------------------------------------------------
export const LEAF = {
  oak: ramp('#1d3a1f', '#2c5a28', '#3f7a31', '#5b9a3a', '#86bd4f', '#b5dc6e'),
  birch: ramp('#2a4a1e', '#46742c', '#679b37', '#8fc14a', '#b8dd66', '#dff08c'),
  maple: ramp('#3a2a14', '#6b3a18', '#9a4b1d', '#c9692a', '#e8943d', '#f7c35d'),
  pine: ramp('#0f2619', '#173a24', '#21502f', '#2f6a3a', '#43854a', '#64a45c'),
  spruce: ramp('#0e2224', '#163635', '#1f4b45', '#2a6155', '#3c7b66', '#5a9a7e'),
  jungle: ramp('#0e2e18', '#154624', '#1f6430', '#2e843a', '#48a544', '#7ccc55'),
  acacia: ramp('#2b3514', '#45521d', '#627126', '#839232', '#a6b346', '#cfd26a'),
  willow: ramp('#23391b', '#35572a', '#4b7536', '#669444', '#86b257', '#aacd73'),
  palm: ramp('#173a1c', '#235625', '#34742e', '#4b9336', '#6fb444', '#9fd162'),
  bush: ramp('#1b341b', '#284d24', '#3a6a2e', '#52893a', '#72a84a', '#9ac564'),
  grass: ramp('#28481f', '#355f26', '#46782d', '#5c9236', '#78ab42', '#9cc553'),
  dryGrass: ramp('#5a4a23', '#7a652e', '#9b8138', '#b99c45', '#d4b85a', '#ead27a'),
  fern: ramp('#15321a', '#1f4a24', '#2d6630', '#3f853b', '#5aa449', '#83c45e'),
  moss: ramp('#2e3b22', '#3e5029', '#526832', '#6a823c', '#869d4b'),
};

export const BARK = {
  oak: ramp('#1f140c', '#3a2616', '#553a22', '#71502f', '#8e6a40'),
  birch: ramp('#2a2622', '#8f8a80', '#c9c3b6', '#e6e1d4', '#f7f4ec'),
  pine: ramp('#1e120b', '#3d2415', '#5a371f', '#7a4d2c', '#9a653a'),
  palm: ramp('#3b2a17', '#5c4424', '#7d5f35', '#9e7c48', '#bf9c5e'),
  dead: ramp('#1f1a16', '#3b332c', '#5a4f45', '#7a6d60', '#9c8f80'),
  kapok: ramp('#2b2520', '#4c4238', '#6d6052', '#90826f', '#b2a48d'),
};

// ---------------------------------------------------------------------------
// Geology
// ---------------------------------------------------------------------------
export enum RockType { GRANITE, ANDESITE, BASALT, LIMESTONE, SANDSTONE, CHALK, SHALE, PERIDOTITE }
export const ROCK_NAMES: Record<RockType, string> = {
  [RockType.GRANITE]: 'Granito', [RockType.ANDESITE]: 'Andesito', [RockType.BASALT]: 'Basalto',
  [RockType.LIMESTONE]: 'Calcário', [RockType.SANDSTONE]: 'Arenito', [RockType.CHALK]: 'Giz',
  [RockType.SHALE]: 'Xisto', [RockType.PERIDOTITE]: 'Peridotito',
};
export const ROCK_RAMPS: Record<RockType, RGB[]> = {
  [RockType.GRANITE]: ramp('#3a3432', '#5e5552', '#857a74', '#a89c93', '#c9bfb4', '#e6ddd2'),
  [RockType.ANDESITE]: ramp('#2c2c2e', '#48484b', '#66666a', '#85858a', '#a4a4a8', '#c4c4c7'),
  [RockType.BASALT]: ramp('#141416', '#232326', '#35353a', '#4a4a50', '#616168', '#7c7c84'),
  [RockType.LIMESTONE]: ramp('#5a5446', '#817a64', '#a59d84', '#c3bca2', '#dbd5bd', '#efead6'),
  [RockType.SANDSTONE]: ramp('#5c3a22', '#86552f', '#a8703d', '#c58d52', '#dcab6c', '#efc98d'),
  [RockType.CHALK]: ramp('#8a877d', '#aeaa9e', '#c9c6bb', '#dddad0', '#ecEae2', '#fbfaf5'),
  [RockType.SHALE]: ramp('#221f27', '#353140', '#4a4558', '#5f5a70', '#777189', '#918aa3'),
  [RockType.PERIDOTITE]: ramp('#1c2a1e', '#2f4231', '#445c44', '#5b7657', '#76906c', '#94ab85'),
};

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
export const GROUND_RAMPS = {
  grass: ramp('#2a4a1f', '#386126', '#4a7a2e', '#5f9437', '#7aad44', '#9dc655'),
  lushGrass: ramp('#1f4a22', '#2a6129', '#387a30', '#4b9438', '#63ad43', '#83c653'),
  dryGrass: ramp('#6d5f2d', '#8a7836', '#a69040', '#bfa84d', '#d3bd60', '#e4d17a'),
  tundra: ramp('#3f4331', '#555a3f', '#6c714d', '#868a5e', '#a0a270', '#b9b986'),
  snow: ramp('#8ea3b8', '#adbfd0', '#c8d7e4', '#dde8f0', '#eef4f8', '#ffffff'),
  forest: ramp('#241a12', '#35271a', '#473522', '#5a452c', '#6f5636', '#856842'),
  needles: ramp('#241a14', '#35271d', '#473426', '#5a4230', '#6e523b', '#836447'),
  jungle: ramp('#1d2410', '#2a3416', '#38451c', '#495824', '#5d6d2e', '#74843a'),
  dirt: ramp('#3a2819', '#503823', '#664a2e', '#7c5c3a', '#937048', '#aa8557'),
  mud: ramp('#221a12', '#30251a', '#3f3222', '#4f3f2b', '#604d35', '#725d41'),
  clay: ramp('#5a3326', '#7a4430', '#98563b', '#b36a48', '#c98059', '#db976c'),
  blueClay: ramp('#34414c', '#46586a', '#5a6f83', '#70869b', '#879db0', '#a0b4c4'),
  peat: ramp('#17110c', '#231a12', '#302318', '#3e2e1f', '#4d3a27', '#5d4731'),
  sand: ramp('#8f7746', '#ab9055', '#c3a866', '#d6bd7a', '#e5cf8f', '#f1e0a8'),
  redSand: ramp('#6a2f18', '#8a4120', '#a8562b', '#c26d38', '#d68849', '#e6a360'),
  gravel: ramp('#3b3835', '#55514c', '#6f6a63', '#8a847b', '#a59e94', '#c0b9ae'),
  marsh: ramp('#26351c', '#344723', '#44592a', '#566d33', '#6a833e', '#80994b'),
  regolith: ramp('#2e2d2c', '#454341', '#5d5a57', '#76726e', '#8f8b86', '#aaa59f'),
  ice: ramp('#4f7d9c', '#6b98b5', '#8ab3cb', '#a9cadd', '#c8e0ec', '#e6f3f9'),
  lava: ramp('#5c0e04', '#961d05', '#d23b06', '#f26b10', '#ffa32e', '#ffe07a'),
  ash: ramp('#1c1a1a', '#2c2929', '#3d3939', '#504b4a', '#645e5c', '#7a7370'),
  sulfur: ramp('#5a4a0c', '#7e6a12', '#a38c1b', '#c5ad2a', '#e0cb45', '#f3e678'),
  graphite: ramp('#0e0e10', '#18181b', '#232327', '#2f2f35', '#3d3d45', '#4e4e58'),
  water: ramp('#0b2a4a', '#10395f', '#164a73', '#1e5c86', '#2a7098', '#3d86aa'),
  shallow: ramp('#1f5a78', '#276b86', '#317d93', '#3e8f9f', '#50a2aa', '#67b5b4'),
  swampWater: ramp('#1e2a1c', '#263625', '#30432c', '#3a5033', '#465e3b', '#546c45'),
};
