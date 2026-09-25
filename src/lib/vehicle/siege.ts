// Siege engines and the guns that replace them, one line per size:
//  small  - ballista (medieval; steel-bow ballista in the classical era) -> mounted machine gun (Gatling, Maxim, heavy
//           machine gun, automatic grenade launcher) -> rail autogun -> plasma repeater
//  medium - catapult (onager / mangonel / traction) -> cannon (culverin, falconet, mortar) -> anti-tank gun ->
//           anti-tank missile / recoilless rifle -> rail lance -> plasma lance
//  large  - trebuchet (counterweight / hinged / traction) -> bombard or siege mortar -> howitzer -> heavy howitzer /
//           rocket artillery -> mass driver -> plasma artillery
// plus the ram (tribal to industrial) and the siege tower (medieval, classical). Carriages vary by design and era:
// wheels, split trails, sledges, tripods, beds, mechanical legs, hover plates. The engine faces +f and throws there.
import type { V3 } from '../structure/draft';
import { crate, sack } from '../structure/parts';
import { VCtx, block, loft, wheelRow, wheel, legs, hover, runners, rod, light, banner, exhaust, up, pick, moving, lerp, smooth, frameOf, dome, pod, groundShadow, transformed, yawFrame, add, tracks } from './vparts';
import { barrels, Gun, fire, flash, yawFor } from './weapons';

type Carriage = 'wheels2' | 'wheels4' | 'split' | 'box' | 'sled' | 'tripod' | 'legs' | 'hover' | 'bed';

// ---------------------------------------------------------------------------------------------------
// Carriages
// ---------------------------------------------------------------------------------------------------
/** a gun carriage; returns the height of the trunnions (where the gun pivots) and where they are along f */
function carriage(x: VCtx, kind: Carriage, s: number, o: { trunnion?: number; shield?: boolean } = {}): { y: number; f: number } {
  const { e, P, D } = x, wood = e <= 2, m = wood ? P.plank : x.body, m2 = wood ? P.wood : x.body2;
  const style = e <= 2 ? 'spoke' as const : e === 3 ? 'spoke' as const : e <= 5 ? 'tyre' as const : 'hubless' as const;
  switch (kind) {
    case 'wheels2': case 'split': case 'box': {
      const r = (e <= 3 ? 2.6 : 1.9) * s, W = 4.6 * s, y = r + (o.trunnion ?? 0.6) * s;
      wheelRow(x, W, [0], r, (e <= 3 ? 0.5 : 0.9) * s, style, e >= 4 ? x.body2 : undefined);
      // axle and cheeks (the two side plates holding the trunnions)
      D.cap([-W / 2 - 0.4, r, 0], [W / 2 + 0.4, r, 0], 0.35 * s, 0.35 * s, P.dark, D.depth([0, r, 0]) - 0.05);
      for (const q of [-1, 1]) block(x, q * 1.1 * s - 0.35 * s, -1.6 * s, q * 1.1 * s + 0.35 * s, 1.2 * s, r - 0.6 * s, y + 0.5 * s, m2, m2);
      // trail(s) resting on the ground behind
      if (kind === 'split') for (const q of [-1, 1]) D.cap([q * 0.9 * s, r - 0.3 * s, -0.8 * s], [q * 3.2 * s, 0.5 * s, -9 * s], 0.45 * s, 0.35 * s, m, D.depth([q * 2 * s, r * 0.5, -5 * s]));
      else D.cap([0, r - 0.2 * s, -1 * s], [0, 0.6 * s, -9 * s], kind === 'box' ? 0.9 * s : 0.55 * s, 0.5 * s, m, D.depth([0, r * 0.5, -5 * s]));
      if (o.shield) up(x, () => {
        const sy = r * 0.4, sf = 1.3 * s, sw = 3.4 * s, sh = y + 2.6 * s;
        D.poly([[-sw, sy, sf], [sw, sy, sf], [sw * 0.92, sh, sf - 0.5 * s], [sw * 0.3, sh + 0.8 * s, sf - 0.6 * s], [-sw * 0.3, sh + 0.8 * s, sf - 0.6 * s], [-sw * 0.92, sh, sf - 0.5 * s]], { ...x.body, tex: 'plates' }, D.depth([0, y, sf]) + (D.facing([0, 0, 1]) > 0 ? 0.4 : -0.4), { g: D.group(), flat: 0.85, dark: D.light([0, 0.2, 1]) });
      });
      return { y, f: 0.2 * s };
    }
    case 'wheels4': {
      const r = 2.1 * s, W = 6 * s;
      wheelRow(x, W, [3.6 * s, -3.6 * s], r, 0.6 * s, style);
      block(x, -W / 2 + 0.3, -5 * s, W / 2 - 0.3, 5 * s, r, r + 1 * s, m, m);
      return { y: r + 1 * s, f: 0 };
    }
    case 'bed': { // a heavy timber bed on the ground (bombards, mortars) with wedges
      block(x, -2.6 * s, -5 * s, 2.6 * s, 4.5 * s, 0, 1.6 * s, m, m, { slopeF: 0.3 });
      for (const q of [-1, 1]) block(x, q * 2.2 * s - 0.4 * s, -3 * s, q * 2.2 * s + 0.4 * s, 2.5 * s, 1.6 * s, 3.4 * s, m2, m2);
      return { y: 2.8 * s, f: 0 };
    }
    case 'sled': runners(x, 5 * s, 10 * s, wood ? P.wood : P.steel); block(x, -2.4 * s, -4 * s, 2.4 * s, 4 * s, 2.2, 2.2 + 0.8 * s, m, m); return { y: 2.2 + 1.8 * s, f: 0 };
    case 'tripod': {
      const y = 3.2 * s;
      for (const [a, f] of [[0, 2.6], [-2.2, -1.8], [2.2, -1.8]]) D.cap([0, y - 0.3 * s, 0], [a * s, 0.2, f * s], 0.28 * s, 0.22 * s, P.dark, D.depth([a * s * 0.5, y * 0.5, f * s * 0.5]));
      D.ell([0, y - 0.3 * s, 0], 0.5 * s, 0.5 * s, P.dark, D.depth([0, y, 0]) + 0.01, { g: D.group() });
      return { y, f: 0 };
    }
    case 'legs': {
      const hip = 5 * s, bob2 = moving(x) ? Math.abs(Math.sin(x.ph)) * 0.4 : 0;
      legs(x, 3 * s, [2 * s, -2 * s], hip, hip, 0.5 * s, P.steel, x.C.params.exotic > 0.5 ? 'insect' : 'bird', 'claw');
      pod(x, [0, hip + 0.3 + bob2, 0], 4.6 * s, 6 * s, 2 * s, x.body);
      return { y: hip + 1.4 * s + bob2, f: 0 };
    }
    case 'hover': {
      const y = 2.4 * s + Math.sin(x.ph) * 0.4;
      hover(x, 5 * s, 8 * s, y, e >= 7 ? 'antigrav' : 'pads');
      if (e >= 7) groundShadow(x, 5 * s, 8 * s, y);
      loft(x, [{ f: 4 * s, w: 2.4 * s, bw: 2 * s, tw: 1.6 * s, wy: 0.3, y0: y, y1: y + 1 * s }, { f: -4 * s, w: 2.4 * s, bw: 2 * s, tw: 1.6 * s, wy: 0.3, y0: y, y1: y + 1.2 * s }], x.body, { round: 1 });
      return { y: y + 2 * s, f: 0 };
    }
  }
}
/** a gun (barrel + breech) on its trunnions, elevated; fires its shot; returns the muzzle */
function gunOn(x: VCtx, g: Gun, piv: V3, el: number, breech = 1.5, yaw = 0) {
  const D = x.D, s = g.r, dir: V3 = [Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)];
  const ref = { key: D.depth(piv) + 0.2, depth: D.depth(piv) };
  let out: V3[] = [];
  up(x, () => {
    const back = add(piv, dir, -breech * s * 2.2);
    if (g.kind !== 'rockets' && g.kind !== 'missile') D.cap(back, add(piv, dir, 0.4), s * 1.8, s * 1.6, g.m ?? x.P.dark, D.depth(back) > ref.depth ? ref.key + 0.02 : ref.key - 0.02);
    out = barrels(x, g, piv, dir, ref);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Small: ballista -> machine gun -> rail autogun -> plasma repeater
// ---------------------------------------------------------------------------------------------------
function ballistaLine(x: VCtx) {
  const { e, P, D } = x, s = x.Z;
  if (e <= 2) {
    const kind = pick(x.d[11], [['scorpion', 2], ['cart', 2], ['repeater', 1.2]] as [string, number][]);
    const c = kind === 'scorpion' ? carriage(x, 'tripod', s * 1.1) : carriage(x, 'wheels2', s * 0.9, { trunnion: 0.4 });
    const y = c.y + 0.4 * s, f = frameOf(x), firing = x.anim === 'use';
    // draw: cocked (string back) until frame 4, snap, then winched back over 5-7
    const draw = !firing ? 1 : f < 4 ? 1 : f === 4 ? 0 : (f - 4) / 4;
    up(x, () => {
      const L = 9 * s, steel = e === 2;
      D.cap([0, y, -L * 0.5], [0, y + 0.2, L * 0.5], 0.55 * s, 0.5 * s, P.plank, D.depth([0, y, 0]));
      D.cap([0, y + 0.55 * s, -L * 0.45], [0, y + 0.6 * s, L * 0.45], 0.2 * s, 0.2 * s, P.dark, D.depth([0, y, 0]) + 0.005, { noLine: true });
      // the bow: two torsion arms (steel bow in the classical era)
      const arm = (q: number): V3 => [q * (steel ? 5.2 : 4.4) * s, y + 0.5 * s, L * 0.32 - (steel ? 1.2 + draw * 1.6 : 0.6 + draw * 1.9) * s];
      for (const q of [-1, 1]) {
        if (!steel) block(x, q * 1.1 * s - 0.5 * s, L * 0.28, q * 1.1 * s + 0.5 * s, L * 0.38, y - 0.8 * s, y + 1.6 * s, P.wood, P.dark);
        D.cap([q * 1 * s, y + 0.4 * s, L * 0.35], arm(q), (steel ? 0.3 : 0.5) * s, 0.3 * s, steel ? P.steel : P.wood, D.depth([q * 2.5 * s, y, L * 0.3]) + 0.01);
        rod(x, arm(q), [0, y + 0.6 * s, L * 0.32 - (1.2 + draw * (steel ? 3.2 : 3.6)) * s], 0.12, P.rope, D.depth([q * s, y, 0]) + 0.02);
      }
      if (steel) { D.ell([0, y, -L * 0.45], 0.9 * s, 0.9 * s, P.wood, D.depth([0, y, -L * 0.45]) + 0.01, { g: D.group() }); for (const q of [-1, 1]) rod(x, [q * 0.9 * s, y, -L * 0.45], [q * 0.9 * s, y + 1.4 * s, -L * 0.45], 0.2, P.wood); }
      if (kind === 'repeater') block(x, -0.9 * s, L * 0.02, 0.9 * s, L * 0.22, y + 0.7 * s, y + 3 * s, P.plank, P.wood);
      // the bolt sits in the groove until it is loosed
      if (!firing || f < 4 || f === 7) D.cap([0, y + 0.8 * s, L * 0.32 - (1.2 + draw * 3) * s], [0, y + 0.8 * s, L * 0.5 + 1], 0.2 * s, 0.2 * s, P.wood, D.depth([0, y, L * 0.3]) + 0.03);
      fire(x, { kind: 'bolt', len: 4, r: 0.3 }, [0, y + 0.8 * s, L * 0.5 + 1], [0, 0.05, 1], { key: D.depth([0, y, 0]) + 0.1, depth: D.depth([0, y, 0]) });
    });
    x.label = kind === 'repeater' ? 'Balista de repetição' : e === 2 ? 'Balista de aço' : kind === 'scorpion' ? 'Escorpião' : 'Balista';
    return;
  }
  // machine guns and their descendants
  const kind = e === 3 ? pick(x.d[11], [['gatling', 2], ['maxim', 2]] as [string, number][]) : e === 4 ? pick(x.d[11], [['hmg', 2], ['wheeledmg', 1.5]] as [string, number][]) : e === 5 ? pick(x.d[11], [['hmg', 2], ['agl', 1.3]] as [string, number][]) : e === 6 ? 'rail' : 'plasma';
  const yaw = yawFor(x, { sweep: 0.35 });
  if (kind === 'gatling') {
    const c = carriage(x, 'wheels2', s * 0.95, { trunnion: 0.7 });
    gunOn(x, { kind: 'rotary', n: 8, len: 5.5 * s, r: 0.22 * s, m: x.P.brass }, [0, c.y + 0.4, c.f], 0.03, 1.2, yaw);
    up(x, () => block(x, -0.6 * s, -1.4 * s, 0.6 * s, 0.2 * s, c.y + 1.3 * s, c.y + 3 * s, x.P.brass, x.P.brass));
    x.label = 'Metralhadora giratória';
  } else if (kind === 'maxim' || kind === 'hmg') {
    const c = kind === 'maxim' && x.d[12] < 0.5 ? carriage(x, 'wheels2', s * 0.7, { trunnion: 0.3, shield: true }) : carriage(x, 'tripod', s * 0.8);
    gunOn(x, { kind: 'mg', len: 5 * s, r: 0.3 * s, muzzle: kind === 'maxim' ? 'cooling' : 'flash' }, [0, c.y + 0.3, c.f], 0.02, 1.4, yaw);
    up(x, () => { for (const q of [-1, 1]) rod(x, [q * 0.5 * s, c.y, -1.8 * s], [q * 0.6 * s, c.y + 0.6 * s, -2.3 * s], 0.15, x.P.dark); if (e >= 5) block(x, 0.4 * s, -0.8 * s, 0.9 * s, 0.6 * s, c.y + 0.6 * s, c.y + 1.3 * s, x.P.dark, x.P.dark); block(x, 0.6 * s, -0.8 * s, 1.5 * s, 0.4 * s, c.y - 0.6 * s, c.y + 0.4 * s, x.body2, x.body2); });
    x.label = kind === 'maxim' ? 'Metralhadora refrigerada a água' : e === 4 ? 'Metralhadora pesada' : 'Metralhadora pesada moderna';
  } else if (kind === 'wheeledmg') {
    const c = carriage(x, 'wheels2', s * 0.6, { trunnion: 0.3, shield: true });
    gunOn(x, { kind: 'mg', len: 4.5 * s, r: 0.3 * s, muzzle: 'cooling' }, [0, c.y + 0.3, c.f], 0.02, 1.4, yaw);
    x.label = 'Metralhadora de rodas';
  } else if (kind === 'agl') {
    const c = carriage(x, 'tripod', s * 0.8);
    gunOn(x, { kind: 'auto', len: 3 * s, r: 0.45 * s, muzzle: 'plain' }, [0, c.y + 0.4, c.f], 0.1, 1, yaw);
    up(x, () => D.cap([0.9 * s, c.y + 0.1, 0], [0.9 * s, c.y + 0.1, -0.8 * s], 0.9 * s, 0.9 * s, x.body2, D.depth([s, c.y, 0])));
    x.label = 'Lança-granadas automático';
  } else if (kind === 'rail') {
    const walker = x.d[12] < 0.5, c = carriage(x, walker ? 'legs' : 'hover', s * 0.8);
    gunOn(x, { kind: 'rail', len: 5.5 * s, r: 0.3 * s, muzzle: 'fork', n: 1 }, [0, c.y + 0.3, c.f + 0.5], 0.03, 1, yaw);
    x.label = walker ? 'Arma automática andadora' : 'Arma automática flutuante';
    // automatic: the rail gun cycles each frame -> reuse the machine-gun stream for the extra shots
    if (x.anim === 'use') up(x, () => fire(x, { kind: 'mg', len: 5, r: 0.25 }, [Math.sin(yaw) * 6 * s, c.y + 0.5, c.f + Math.cos(yaw) * 6 * s], [Math.sin(yaw), 0.03, Math.cos(yaw)], { key: D.depth([0, c.y, 0]) + 0.2, depth: D.depth([0, c.y, 0]) }, 1));
  } else {
    const c = carriage(x, 'hover', s * 0.8);
    gunOn(x, { kind: 'plasma', len: 4.5 * s, r: 0.45 * s, muzzle: 'bulb', n: 2 }, [0, c.y + 0.4, c.f + 0.5], 0.03, 1, yaw);
    x.label = 'Repetidor de plasma';
  }
}

// ---------------------------------------------------------------------------------------------------
// Medium: catapult -> cannon -> anti-tank gun -> AT missile -> rail lance -> plasma lance
// ---------------------------------------------------------------------------------------------------
function catapultLine(x: VCtx) {
  const { e, P, D } = x, s = x.Z;
  if (e <= 1) {
    const kind = pick(x.d[11], [['onager', 2], ['mangonel', 2], ['traction', 1.2]] as [string, number][]);
    const c = carriage(x, x.C.params.temperature < 0.3 && x.d[12] < 0.5 ? 'sled' : 'wheels4', s * 0.95);
    const y = c.y, f = frameOf(x), firing = x.anim === 'use';
    // the arm rests pointing BACK (cocked), whips up and forward against the crossbar at the front, then is winched
    // back down: θ is the arm's angle from +f (forward) towards up
    const rest = Math.PI - 0.22, hit = 1.2;
    const th = !firing ? rest : f < 4 ? rest : f === 4 ? (rest + hit) / 2 : f === 5 ? hit : lerp(hit, rest, (f - 5) / 3);
    const piv: V3 = [0, y + 1.2 * s, -1 * s], Larm = 9 * s;
    const tip: V3 = [0, piv[1] + Math.sin(th) * Larm, piv[2] + Math.cos(th) * Larm];
    up(x, () => {
      // uprights and the padded crossbar in front of the pivot
      for (const q of [-1, 1]) { D.cap([q * 2.3 * s, y, 3 * s], [q * 1.6 * s, y + 7 * s, 1.6 * s], 0.55 * s, 0.45 * s, P.wood, D.depth([q * 2 * s, y + 3 * s, 2 * s])); D.cap([q * 2.3 * s, y, -3 * s], [q * 1.6 * s, y + 7 * s, 1.6 * s], 0.45 * s, 0.4 * s, P.wood, D.depth([q * 2 * s, y + 3 * s, -0.5 * s])); }
      D.cap([-2 * s, y + 7 * s, 1.6 * s], [2 * s, y + 7 * s, 1.6 * s], 0.7 * s, 0.7 * s, P.wood, D.depth([0, y + 7 * s, 1.6 * s]) + 0.01);
      D.cap([-1.3 * s, y + 7.2 * s, 1.9 * s], [1.3 * s, y + 7.2 * s, 1.9 * s], 0.9 * s, 0.9 * s, P.hide, D.depth([0, y + 7 * s, 1.9 * s]) + 0.02);
      // the torsion bundle (onager, mangonel) or pull ropes (traction)
      if (kind !== 'traction') D.cap([-2 * s, piv[1], piv[2]], [2 * s, piv[1], piv[2]], 1.1 * s, 1.1 * s, P.rope, D.depth(piv) + 0.01);
      else for (let k = 0; k < 4; k++) rod(x, [0, piv[1] + Math.sin(th) * Larm * 0.2, piv[2] + Math.cos(th) * Larm * 0.2], [(k - 1.5) * 0.9 * s, 0.3, piv[2] + 5 * s], 0.12, P.rope);
      const armKey = D.depth([0, (piv[1] + tip[1]) / 2, (piv[2] + tip[2]) / 2]) + 0.03;
      D.cap([0, piv[1] - Math.sin(th) * 1.5 * s, piv[2] - Math.cos(th) * 1.5 * s], tip, 0.6 * s, 0.45 * s, P.wood, armKey);
      // winch at the back
      D.cap([-2.2 * s, y + 0.6 * s, -4.4 * s], [2.2 * s, y + 0.6 * s, -4.4 * s], 0.6 * s, 0.6 * s, P.wood, D.depth([0, y, -4.4 * s]) + 0.01);
      rod(x, [0, y + 0.6 * s, -4.4 * s], tip, 0.1, P.rope, armKey - 0.001);
      // bucket or sling with the stone; the stone flies from frame 5
      if (kind === 'mangonel') D.ell(tip, 1.1 * s, 0.7 * s, P.wood, armKey + 0.001, { g: D.group() });
      else rod(x, tip, [tip[0], tip[1] - 2 * s, tip[2] - 0.5 * s], 0.1, P.rope, armKey + 0.001);
      const held: V3 = kind === 'mangonel' ? [tip[0], tip[1] + 0.8 * s, tip[2]] : [tip[0], tip[1] - 2.2 * s, tip[2] - 0.5 * s];
      if (!firing || f < 5) D.ell(held, 1 * s, 1 * s, x.K.stone, armKey + 0.002, { g: D.group() });
      else { const a = (f - 5) + 0.5, q: V3 = [0, tip[1] + a * 5 - a * a * 1.2, tip[2] + a * 14]; D.ell(q, 1 * s, 1 * s, x.K.stone, 2e4 + D.depth(q), { g: D.group() }); }
      if (firing && f === 5) for (let k = 0; k < 3; k++) D.ell([0, tip[1] + k * 0.3, tip[2] - k], 0.6 + k * 0.3, 0.4, P.dust, 1e5 + k, { g: D.group(), noLine: true });
    });
    x.label = kind === 'onager' ? 'Onagro' : kind === 'traction' ? 'Catapulta de tração' : 'Catapulta';
    return;
  }
  const yaw = yawFor(x, { sweep: 0.2 });
  if (e === 2) { // cannons: culverin, falconet, mortar
    const kind = pick(x.d[11], [['culverin', 3], ['falconet', 1.5], ['mortar', 1.2]] as [string, number][]);
    if (kind === 'mortar') { const c = carriage(x, 'bed', s * 0.8); gunOn(x, { kind: 'mortar', len: 3.4 * s, r: 1 * s, muzzle: 'bell', m: P.bronze }, [0, c.y + 0.3, 0], 0.85, 0.8, yaw); x.label = 'Morteiro'; return; }
    const c = carriage(x, 'wheels2', s * (kind === 'falconet' ? 0.75 : 0.95));
    gunOn(x, { kind: 'cannon', len: (kind === 'falconet' ? 6 : 9) * s, r: (kind === 'falconet' ? 0.45 : 0.6) * s, muzzle: 'bell', m: x.d[13] < 0.5 ? P.bronze : P.dark }, [0, c.y + 0.3, c.f], 0.1, 1.4, yaw);
    up(x, () => { crate(x, 2.6 * s, -3 * s, 0, 1.6 * s, P.wood); for (let k = 0; k < 3; k++) D.ell([-2.6 * s + k * 0.8, 0.6 * s, -3 * s], 0.6 * s, 0.6 * s, P.dark, D.depth([-2.6 * s, 0.5, -3 * s]) + k * 0.01, { g: D.group() }); });
    x.label = kind === 'falconet' ? 'Falconete' : 'Canhão';
    return;
  }
  if (e <= 4) {
    const c = carriage(x, 'split', s * (e === 3 ? 0.8 : 0.9), { shield: true, trunnion: 0.3 });
    gunOn(x, { kind: 'cannon', len: (e === 3 ? 8 : 11) * s, r: (e === 3 ? 0.35 : 0.42) * s, muzzle: e === 4 && x.d[12] < 0.6 ? 'brake' : 'plain' }, [0, c.y + 0.4, c.f + 0.6 * s], 0.04, 1.5, yaw);
    x.label = 'Canhão anticarro';
    return;
  }
  if (e === 5) {
    if (x.d[12] < 0.5) { // guided missile on a tripod: a launch tube with a sight
      const c = carriage(x, 'tripod', s * 0.85);
      gunOn(x, { kind: 'missile', len: 5.5 * s, r: 0.5 * s }, [0, c.y + 0.6, -2 * s], 0.06, 0.5, yaw);
      up(x, () => block(x, 0.7 * s, -1.6 * s, 1.6 * s, -0.2 * s, c.y - 0.2, c.y + 1, x.body2, x.body2));
      x.label = 'Lançador de mísseis anticarro';
    } else { // recoilless rifle: a long tube open at the back (the back blast is part of the shot)
      const c = carriage(x, 'tripod', s * 0.85);
      const m = gunOn(x, { kind: 'cannon', len: 9 * s, r: 0.4 * s, muzzle: 'plain' }, [0, c.y + 0.5, 0], 0.04, 2.5, yaw);
      if (x.anim === 'use' && frameOf(x) <= 5 && frameOf(x) >= 4) up(x, () => flash(x, [-Math.sin(yaw) * 3 * s, c.y + 0.5, -Math.cos(yaw) * 3 * s], [-Math.sin(yaw), 0, -Math.cos(yaw)], 2.2 * s, { key: 2e4, depth: 1e4 }, 6));
      void m;
      x.label = 'Canhão sem recuo';
    }
    return;
  }
  const c = carriage(x, e === 6 ? (x.d[12] < 0.5 ? 'legs' : 'hover') : 'hover', s * 0.85);
  gunOn(x, e === 6 ? { kind: 'rail', len: 10 * s, r: 0.45 * s, muzzle: 'fork' } : { kind: 'plasma', len: 8 * s, r: 0.6 * s, muzzle: 'bulb' }, [0, c.y + 0.4, c.f], 0.04, 1.2, yaw);
  x.label = e === 6 ? 'Lança de trilho' : 'Lança de plasma';
}

// ---------------------------------------------------------------------------------------------------
// Large: trebuchet -> bombard / siege mortar -> howitzer -> heavy howitzer / rocket artillery -> mass driver -> plasma
// ---------------------------------------------------------------------------------------------------
function trebuchetLine(x: VCtx) {
  const { e, P, D } = x, s = x.Z * 0.8;
  if (e <= 1) {
    const kind = pick(x.d[11], [['fixed', 2], ['hinged', 2], ['traction', 1]] as [string, number][]);
    const c = carriage(x, 'wheels4', s * 1.6), y = c.y, f = frameOf(x), firing = x.anim === 'use';
    const Hp = 17 * s, piv: V3 = [0, y + Hp, 0], L1 = 20 * s, L2 = 5.5 * s;
    // φ: the long arm's angle from +f towards up. At rest it points back and down (sling on the ground behind);
    // the counterweight drops and the arm sweeps up over the top to release the stone forward
    const rest = Math.PI + 0.75, release = 1.25;
    const ph = !firing ? rest : f < 4 ? rest : f === 4 ? lerp(rest, release, 0.45) : f === 5 ? release : lerp(release, rest, (f - 5) / 3);
    const tip: V3 = [0, piv[1] + Math.sin(ph) * L1, piv[2] + Math.cos(ph) * L1], cw: V3 = [0, piv[1] - Math.sin(ph) * L2, piv[2] - Math.cos(ph) * L2];
    up(x, () => {
      for (const q of [-1, 1]) for (const fs of [1, -1]) D.cap([q * 3.2 * s, y, fs * 6 * s], [q * 1.4 * s, piv[1], 0], 0.8 * s, 0.6 * s, P.wood, D.depth([q * 2.5 * s, y + Hp / 2, fs * 3 * s]));
      for (const q of [-1, 1]) D.cap([q * 3.2 * s, y + Hp * 0.45, -4.6 * s], [q * 3.2 * s, y + Hp * 0.45, 4.6 * s], 0.5 * s, 0.5 * s, P.wood, D.depth([q * 3 * s, y + Hp / 2, 0]));
      D.cap([-1.8 * s, piv[1], 0], [1.8 * s, piv[1], 0], 0.7 * s, 0.7 * s, P.dark, D.depth(piv) + 0.01);
      const armKey = D.depth([0, (tip[1] + cw[1]) / 2, (tip[2] + cw[2]) / 2]) + 0.05;
      D.cap(cw, tip, 0.9 * s, 0.5 * s, P.wood, armKey);
      if (kind === 'traction') for (let k = 0; k < 5; k++) rod(x, cw, [(k - 2) * 0.8 * s, y + 0.5, cw[2] + 2 * s], 0.1, P.rope, armKey - 0.01);
      else {
        const box: V3 = kind === 'hinged' ? [0, cw[1] - 3.2 * s, cw[2]] : cw;
        if (kind === 'hinged') rod(x, cw, box, 0.3, P.dark, armKey + 0.001);
        block(x, -2.2 * s, box[2] - 2.2 * s, 2.2 * s, box[2] + 2.2 * s, box[1] - 4.4 * s, box[1] - 0.2 * s, P.plank, x.K.stone);
      }
      // the sling: lies on the ground behind at rest, whips round while throwing
      const sEnd: V3 = !firing || f < 4 ? [0, Math.max(0.8, tip[1] - 6 * s), tip[2] + 2 * s] : f === 4 ? [0, tip[1] - 4 * s, tip[2] - 3 * s] : [0, tip[1] + 3 * s, tip[2] + 4 * s];
      rod(x, tip, sEnd, 0.12, P.rope, armKey + 0.002);
      if (!firing || f < 5) D.ell(sEnd, 1.4 * s, 1.4 * s, x.K.stone, armKey + 0.003, { g: D.group() });
      else { const a = (f - 5) + 0.6, q: V3 = [0, tip[1] + a * 6 - a * a * 1.5, tip[2] + a * 18]; D.ell(q, 1.4 * s, 1.4 * s, x.K.stone, 2e4 + D.depth(q), { g: D.group() }); }
      if (firing && f === 4) for (let k = 0; k < 3; k++) D.ell([Math.sin(k * 2) * 3 * s, 0.8, cw[2] + Math.cos(k * 2) * 3 * s], 1.5 + k * 0.4, 0.8, P.dust, -800 + k, { g: D.group(), noLine: true });
      banner(x, [0, piv[1] + 1, 0], 4 * s, 4 * s, x.body);
    });
    x.label = kind === 'hinged' ? 'Trabuco de contrapeso articulado' : kind === 'traction' ? 'Trabuco de tração' : 'Trabuco';
    return;
  }
  const yaw = yawFor(x, { sweep: 0.15 });
  if (e === 2) {
    if (x.d[11] < 0.5) { const c = carriage(x, 'bed', s * 1.3); gunOn(x, { kind: 'cannon', len: 9 * s, r: 1.3 * s, muzzle: 'bell', m: x.d[12] < 0.5 ? P.bronze : P.dark }, [0, c.y + 0.6, -1.5 * s], 0.08, 1.2, yaw); up(x, () => { for (let k = 0; k < 4; k++) D.ell([2.8 * s + (k % 2) * 1.4, 1, -5 * s + Math.floor(k / 2) * 1.4], 1.1 * s, 1.1 * s, x.K.stone, D.depth([3 * s, 1, -5 * s]) + k * 0.01, { g: D.group() }); }); x.label = 'Bombarda'; }
    else { const c = carriage(x, 'bed', s * 1.2); gunOn(x, { kind: 'mortar', len: 4 * s, r: 1.7 * s, muzzle: 'bell', m: P.bronze }, [0, c.y + 0.6, 0], 0.9, 0.8, yaw); x.label = 'Morteiro de cerco'; }
    return;
  }
  if (e <= 4) {
    const c = carriage(x, e === 3 ? 'box' : 'split', s * (e === 3 ? 1.35 : 1.45), { shield: e === 4 && x.d[12] < 0.5, trunnion: 0.8 });
    gunOn(x, { kind: 'howitzer', len: (e === 3 ? 9 : 12) * s, r: (e === 3 ? 0.75 : 0.85) * s, muzzle: e === 4 ? 'brake' : 'plain' }, [0, c.y + 0.5, c.f], 0.5, 1.6, yaw);
    // recoil cylinders under the barrel
    up(x, () => D.cap([0, c.y - 0.2, -1.4 * s], [0, c.y + 1.6 * s, 1.8 * s], 0.5 * s, 0.5 * s, x.body2, D.depth([0, c.y, 0]) - 0.03));
    x.label = e === 3 ? 'Obuseiro' : 'Obuseiro pesado';
    return;
  }
  if (e === 5) {
    if (x.d[11] < 0.5) { // rocket artillery on a truck
      const L = 22 * x.Z * 0.6, w = 3.2 * x.Z * 0.8, r = 2 * x.Z * 0.7;
      wheelRow(x, w * 2, [L * 0.35, 0, -L * 0.33], r, 1.1, 'lug');
      block(x, -w, -L / 2, w, L / 2, r * 0.8, r * 0.8 + 1.2, x.body2, x.body2);
      up(x, () => {
        loft(x, [{ f: L / 2, w, bw: w, tw: w * 0.8, wy: 0.1, y0: r * 0.8 + 1.2, y1: r * 0.8 + 4 }, { f: L / 2 - 5, fb: L / 2 - 5.4, w, bw: w, tw: w * 0.8, wy: 0.1, y0: r * 0.8 + 1.2, y1: r * 0.8 + 5 }], x.body, { top: x.body });
        const piv: V3 = [0, r * 0.8 + 2.4, -L * 0.2];
        const el = x.anim === 'use' ? 0.55 : 0.12;
        const f2 = yawFrame(0, piv[1], piv[2], yaw * 0.5);
        transformed(x, f2.T, f2.Tn, () => {
          const ref = { key: D.depth([0, 0, 0]) + 0.2, depth: D.depth([0, 0, 0]) };
          for (const q of [-1, 1]) barrels(x, { kind: 'rockets', n: 4, len: 8, r: 0.55, m: x.body }, [q * 1.4, 0.9, -1], [0, Math.sin(el), Math.cos(el)], ref);
        });
        light(x, [w * 0.7, r * 0.8 + 2.2, L / 2 + 0.1], 0.5, x.K.glow);
      });
      x.label = 'Lança-foguetes múltiplo';
      return;
    }
    const c = carriage(x, 'split', s * 1.5, { trunnion: 0.8 });
    gunOn(x, { kind: 'howitzer', len: 17 * s, r: 0.75 * s, muzzle: 'brake' }, [0, c.y + 0.6, c.f], 0.45, 1.6, yaw);
    up(x, () => { D.cap([0, c.y - 0.2, -1.4 * s], [0, c.y + 1.6 * s, 1.8 * s], 0.5 * s, 0.5 * s, x.body2, D.depth([0, c.y, 0]) - 0.03); for (const q of [-1, 1]) D.cap([q * 2 * s, c.y - 1, 1 * s], [q * 3 * s, 0.3, 2 * s], 0.3 * s, 0.3 * s, P.dark, D.depth([q * 2.5 * s, 1, 1.5 * s])); });
    x.label = 'Obuseiro moderno';
    return;
  }
  if (e === 6) {
    const legged = x.d[12] < 0.5;
    let y = 0;
    if (legged) { const hip = 7 * s; legs(x, 5 * s, [4 * s, -4 * s], hip, hip, 0.8 * s, P.steel, 'insect', 'claw'); y = hip; }
    else { tracks(x, 6 * s, 14 * s, 1.6 * s, 1.6 * s, { style: 'rubber' }); y = 3.6 * s; }
    loft(x, [{ f: 6 * s, w: 3.4 * s, bw: 3 * s, tw: 2.4 * s, wy: 0.3, y0: y, y1: y + 2.6 * s }, { f: -6 * s, w: 3.4 * s, bw: 3 * s, tw: 2.4 * s, wy: 0.3, y0: y, y1: y + 2.6 * s }], x.body, { top: x.body2 });
    gunOn(x, { kind: 'rail', len: 18 * s, r: 0.7 * s, muzzle: 'fork' }, [0, y + 3.4 * s, -2 * s], 0.35, 1.2, yaw);
    x.label = legged ? 'Canhão de massa andador' : 'Canhão de massa';
    return;
  }
  const c = carriage(x, 'hover', s * 1.6);
  up(x, () => dome(x, [0, c.y - 0.6 * s, -2 * s], 2.6 * s, 2.6 * s, 2.2 * s, x.body2));
  gunOn(x, { kind: 'plasma', len: 14 * s, r: 1 * s, muzzle: 'bulb' }, [0, c.y + 1.2 * s, -1 * s], 0.4, 1, yaw);
  x.label = 'Artilharia de plasma';
}

// ---------------------------------------------------------------------------------------------------
// Ram and siege tower
// ---------------------------------------------------------------------------------------------------
function ram(x: VCtx) {
  const { e, P, D } = x, s = x.Z * 0.8, f = frameOf(x), firing = x.anim === 'use';
  const swing = firing ? [0, -1.5, -2.8, -3.2, 3.5, 2.2, 1, 0.3][f] * s : 0;
  if (e === 0) { // a log slung from a frame on runners
    runners(x, 7 * s, 18 * s, P.wood);
    up(x, () => {
      for (const ff of [-5 * s, 5 * s]) for (const q of [-1, 1]) D.cap([q * 3.2 * s, 2.2, ff], [0, 9 * s, ff], 0.5, 0.4, P.wood, D.depth([q * 1.5 * s, 5, ff]));
      D.cap([0, 9 * s, -6 * s], [0, 9 * s, 6 * s], 0.5, 0.5, P.wood, D.depth([0, 9 * s, 0]));
      const k = D.depth([0, 5 * s, 0]) + 0.05;
      D.cap([0, 5 * s, -9 * s + swing], [0, 5 * s, 11 * s + swing], 1.3 * s, 1.1 * s, x.K.trunk, k);
      for (const ff of [-5 * s, 5 * s]) rod(x, [0, 9 * s, ff], [0, 5.6 * s, ff + swing], 0.14, P.rope, k + 0.01);
    });
    x.label = 'Aríete'; return;
  }
  const W = 9 * s, L = 18 * s, c = carriage(x, 'wheels4', s * 1.2), y = c.y;
  up(x, () => {
    for (const ff of [-L / 2 + 1, L / 2 - 1]) for (const q of [-1, 1]) D.cap([q * W / 2, y, ff], [q * W / 2, y + 6 * s, ff], 0.5, 0.5, P.wood, D.depth([q * W / 2, y + 3, ff]));
    const roofM = e >= 3 ? { ...x.K.iron, tex: 'plates' as const } : P.hide;
    loft(x, [{ f: L / 2 + 0.5, w: W / 2 + 0.6, bw: W / 2 + 0.6, tw: 0.3, wy: 0, y0: y + 6 * s, y1: y + 10 * s }, { f: -L / 2 - 0.5, w: W / 2 + 0.6, bw: W / 2 + 0.6, tw: 0.3, wy: 0, y0: y + 6 * s, y1: y + 10 * s }], roofM, { open: true, top: null });
    const k = D.depth([0, y + 3 * s, 0]) + 0.05;
    D.cap([0, y + 3.4 * s, -L / 2 - 1 + swing], [0, y + 3.4 * s, L / 2 + 3 + swing], 1.3 * s, 1.2 * s, x.K.trunk, k);
    const head: V3 = [0, y + 3.4 * s, L / 2 + 3.5 + swing];
    if (x.C.params.exotic > 0.6) D.cap(head, add(head, [0, 0.4, 3 * s]), 1.6 * s, 0.1, P.bone, k + 0.01);
    else D.ell(head, 1.8 * s, 1.5 * s, e >= 2 ? x.K.iron : x.K.metal, k + 0.01, { g: D.group() });
    for (const ff of [-L / 4, L / 4]) rod(x, [0, y + 6 * s, ff], [0, y + 3.8 * s, ff + swing], 0.14, e >= 3 ? P.dark : P.rope, k + 0.01);
    if (e === 3) exhaust(x, [W * 0.25, y + 12 * s, -L / 3], 'steam', 1.4);
    if (firing && f === 4) for (let q = 0; q < 4; q++) D.ell(add(head, [Math.sin(q * 1.6) * 1.5, Math.cos(q * 1.6) * 1.5, 1.5]), 0.6, 0.6, P.dust, 1e5 + q, { g: D.group(), noLine: true });
  });
  x.label = e >= 3 ? 'Aríete a vapor' : 'Aríete coberto';
}
function siegeTower(x: VCtx) {
  const { P, D } = x, s = x.Z * 0.75, W = 12 * s, L = 12 * s, f = frameOf(x);
  wheelRow(x, W, [-L * 0.3, L * 0.3], 2.4 * s, 1 * s, 'disk');
  const y = 2.6 * s, H = 30 * s;
  loft(x, [{ f: L / 2, w: W / 2, bw: W / 2, tw: W * 0.4, wy: 0, y0: y, y1: y + H }, { f: -L / 2, w: W / 2, bw: W / 2, tw: W * 0.4, wy: 0, y0: y, y1: y + H }], x.d[11] < 0.5 ? P.hide : P.plank, { top: P.plank });
  up(x, () => {
    for (let i = 1; i < 5; i++) { const yy = y + (H * i) / 5, ww = W / 2 - (W * 0.1 * i) / 5; for (const q of [-1, 1]) D.cap([q * ww, yy, -L / 2 + (L * 0.1 * i) / 5], [q * ww, yy, L / 2 - (L * 0.1 * i) / 5], 0.4, 0.4, P.wood, D.depth([q * ww, yy, 0]) + 0.01, { noLine: true }); }
    // merlons on top, the drawbridge that drops forward in action
    for (let i = 0; i < 4; i++) for (const q of [-1, 1]) block(x, q * W * 0.4 - 0.6, -L * 0.4 + i * L * 0.27, q * W * 0.4 + 0.6, -L * 0.4 + i * L * 0.27 + 1.2, y + H, y + H + 2, P.plank, P.plank);
    const drop = x.anim === 'use' ? smooth(f / 4) : 0, hy = y + H - 4 * s, hf = L * 0.41, len = 9 * s, a = drop * Math.PI / 2;
    const end: V3 = [0, hy + Math.cos(a) * len, hf + Math.sin(a) * len];
    D.poly([[-4 * s, hy, hf], [4 * s, hy, hf], [4 * s, end[1], end[2]], [-4 * s, end[1], end[2]]], P.plank, D.depth([0, hy, hf + 1]) + 0.2, { g: D.group(), flat: 0.8, dark: D.light([0, Math.sin(a), Math.cos(a)]), uv: [[-4 * s, hy, hf], [4 * s, hy, hf], [-4 * s, end[1], end[2]]] });
    for (const q of [-1, 1]) rod(x, [q * 4 * s, y + H + 1, hf - 1], [q * 4 * s, end[1], end[2]], 0.12, P.rope);
    banner(x, [W * 0.3, y + H + 2, -L * 0.3], 6 * s, 5 * s, x.body);
    sack(x, W * 0.3, -L * 0.1, y + H, 1.6, P.hide);
  });
  x.label = 'Torre de cerco';
}

export const SIEGE = { ballista: ballistaLine, catapult: catapultLine, trebuchet: trebuchetLine, ram, siegeTower };
void wheel; void light; void pod; void smooth; void exhaust;
