// Discovery fog (Civilization style): in the play mode every place of the home planet the player's creatures have
// not seen yet is unknown - fully dark on the world map, the regional blocks and the gameplay chunks. Sight is a
// circle centred on each creature; once seen a place stays discovered (saved per planet in localStorage).
// The mask has the planet map's resolution (1 cell = 1 map px = 64 tiles on a 2048-wide map); the renderers give it
// an organic, dithered edge.

const KEY = 'ugd:fog:';

export class Discovery {
  readonly w: number; readonly h: number;
  readonly mask: Uint8Array;
  /** bumped on every change (renderers cache on it) */
  version = 0;
  seen = 0;
  private saveT = 0;
  private dirty = false;

  constructor(readonly key: string, w: number, h: number) {
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    try {
      const s = localStorage.getItem(KEY + key);
      if (s) this.decode(s);
    } catch { /* private mode */ }
    for (let i = 0; i < this.mask.length; i++) this.seen += this.mask[i];
  }

  /** share of the planet discovered (0..1) */
  get fraction() { return this.seen / this.mask.length; }

  /** reveals a disc (map px, x wraps); returns whether anything new was seen */
  reveal(mx: number, my: number, r: number): boolean {
    const { w, h, mask } = this;
    let changed = false;
    const y0 = Math.max(0, Math.floor(my - r)), y1 = Math.min(h - 1, Math.ceil(my + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - my, half = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (half <= 0) continue;
      const x0 = Math.ceil(mx - half - 0.5), x1 = Math.floor(mx + half - 0.5);
      for (let x = x0; x <= x1; x++) {
        const i = y * w + (((x % w) + w) % w);
        if (!mask[i]) { mask[i] = 1; this.seen++; changed = true; }
      }
    }
    if (changed) { this.version++; this.dirty = true; this.scheduleSave(); }
    return changed;
  }

  /** how unknown a map point is, 0 (discovered) .. 1 (unknown), bilinear between cell centres */
  unknownAt(mx: number, my: number): number {
    const { w, h, mask } = this;
    const fx = mx - 0.5, fy = Math.max(0, Math.min(h - 1.001, my - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w, ya = y0 * w, yb = Math.min(h - 1, y0 + 1) * w;
    const a = mask[ya + xa], b = mask[ya + xb], c = mask[yb + xa], d = mask[yb + xb];
    return 1 - ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
  }
  known(mx: number, my: number) {
    const x = ((Math.floor(mx) % this.w) + this.w) % this.w, y = Math.floor(my);
    return y >= 0 && y < this.h && this.mask[y * this.w + x] === 1;
  }

  private scheduleSave() {
    if (this.saveT) return;
    this.saveT = window.setTimeout(() => { this.saveT = 0; this.save(); }, 2000);
  }
  save() {
    if (!this.dirty) return;
    this.dirty = false;
    try { localStorage.setItem(KEY + this.key, this.encode()); } catch { /* quota / private mode */ }
  }
  reset() { this.mask.fill(0); this.seen = 0; this.version++; this.dirty = true; this.save(); }

  // run lengths of alternating 0/1 cells (starting with 0) as LEB128 varints, base64
  private encode(): string {
    const out: number[] = [];
    const push = (n: number) => { while (n >= 128) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); };
    let cur = 0, run = 0;
    for (let i = 0; i < this.mask.length; i++) {
      if (this.mask[i] === cur) run++;
      else { push(run); cur ^= 1; run = 1; }
    }
    push(run);
    let s = '';
    for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192));
    return `${this.w}x${this.h}:${btoa(s)}`;
  }
  private decode(str: string) {
    const [dim, data] = str.split(':');
    if (dim !== `${this.w}x${this.h}` || !data) return;
    const bin = atob(data);
    let p = 0, cur = 0, i = 0;
    while (p < bin.length && i < this.mask.length) {
      let n = 0, mul = 1, b: number;
      do { b = bin.charCodeAt(p++); n += (b & 127) * mul; mul *= 128; } while (b & 128 && p < bin.length);
      if (cur) this.mask.fill(1, i, Math.min(this.mask.length, i + n));
      i += n; cur ^= 1;
    }
  }
}
