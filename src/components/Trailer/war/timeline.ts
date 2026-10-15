// Trailer II, locked to "WAR" by @Makai-symphony (98 BPM: a beat every 0.612 s, a bar every 2.449 s, first beat at
// 0.01 s). Every cut sits on that grid (or on the drum hits measured in the track). Sections of the music:
//   0 - 9.8 intro · 9.8 the drop (drum fill 15.3 - 17.2) · 44 a breath · 68.6 - 83.3 breakdown · 83.3 build ·
//   98 climax · 122.5 calmer · 137.2 finale · 152.2 dead stop · 153.07 the last hit (end card) · 154.6 silence.
import type { Track } from '../overlay';
import type { Music } from '../Trailer';

export const BPM = 98, BEAT = 60 / BPM, B0 = 0.01;
export const bar = (n: number) => B0 + n * 4 * BEAT;
export const beat = (k: number) => B0 + k * BEAT;
/** silent title cards before the music */
export const INTRO = 6;
export const STOP = 152.2;
export const FINAL = beat(250);
export const END = FINAL + 5.3;

export const WAR_TRACK: Track = { title: 'WAR', artist: '@Makai-symphony', bpm: BPM, first: B0 };
export const WAR_MUSIC: Music = { title: 'WAR', artist: '@Makai-symphony', youtube: 'wYGH0xdfrTo' };
export const CREDIT = 'Music: "WAR" by @Makai-symphony';

/** the drum fill after the drop: one lineage stage per hit */
export const FILL = [bar(6), 15.34, 15.66, 15.98, 16.27, 16.75];
/** the last hits before the stop: one flash each */
export const LAST_HITS = [bar(61), 150.06, 150.67, 151.13, 151.52];
/** strong hits of the track (camera shakes in the battles) */
export const HITS = [20.26, 27.03, 28.24, 53.62, 62.34, 64.91, 87.62, 90.83, 126.6, 137.17, 144.09, 147.62, 148.23, 148.6];

/** The film, scene by scene (start times). Ground scenes are filmed on the planet; the others are drawn. */
export const S = {
  globe: bar(0), cells: bar(2), reef: bar(4), abyss: bar(5), fill: bar(6), coast: bar(7), wild: bar(8), rise: bar(9),
  city0: bar(10), cities: bar(11), map: bar(15),
  dawn: bar(18), clash: bar(20), knights: bar(22), siege: bar(24), line: bar(25), cannons: bar(27),
  soldiers: bar(28), trenchDawn: bar(32), barrage: bar(34), tanks1: bar(37), ww2: bar(38), combined: bar(40), strike: bar(42),
  helis: bar(43), machines: bar(45), future: bar(47), capital: bar(50), recap: bar(52), launch: bar(54), warp: bar(56),
  universe: bar(58), flashes: bar(61), stop: STOP, end: FINAL,
};
/** cities through the ages: era -> [start, end) */
export const CITY_SLOTS: [number, number][] = [
  [S.city0, beat(44)], [beat(44), beat(46)], [beat(46), beat(48)], [beat(48), beat(50)], [beat(50), beat(52)], [beat(52), beat(54)], [beat(54), beat(56)], [beat(56), S.map],
];
