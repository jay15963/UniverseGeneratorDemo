// Engine frame cost, independent of the display's refresh rate: every renderer adds the CPU time it spent on a
// frame and the demo shows 1000 / average - the frame rate the game could reach with vsync off.
// Renderers sharing one animation frame (same rAF timestamp) add up into a single frame.
let acc = 0, n = 0, lastStamp = -1;
export const frameMeter = {
  add(ms: number, stamp: number) {
    acc += ms;
    if (stamp !== lastStamp) { n++; lastStamp = stamp; }
  },
  /** Average ms per frame since the last call (0 when nothing was drawn). */
  take(): number { const v = n ? acc / n : 0; acc = 0; n = 0; return v; },
};
