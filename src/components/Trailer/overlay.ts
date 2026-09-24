// Everything the trailer writes on screen is drawn on its canvas (so it is also in the recorded video):
// the title cards, the end card and the "now playing" badge. Plus the recorder that turns the film into a file.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const FONT = '"Inter", "Helvetica Neue", Arial, ui-sans-serif, system-ui, sans-serif';
const INTRO = 6, END = 137;
const lin = (t: number, a: number, d = 1.2) => Math.max(0, Math.min(1, (t - a) / d));

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight: number, alpha: number, spacing = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Title cards (before the music) and the end card (2:17), each line fading in linearly. */
export function drawTitles(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const big = Math.min(w * 0.058, h * 0.1, 76);
  if (t < 0) {
    line(ctx, 'Claude gave me $100', w / 2, h / 2 - big * 0.62, big, 300, lin(t, -INTRO + 0.6));
    line(ctx, 'and I cooked.', w / 2, h / 2 + big * 0.62, big, 600, lin(t, -INTRO + 2.4));
  } else if (t >= END) {
    const s = big * 0.78;
    line(ctx, 'Made with Claude Opus 5.5', w / 2, h / 2 - s * 0.55, s, 300, lin(t, END + 0.3));
    line(ctx, 'running in a web browser at 500+ FPS', w / 2, h / 2 + s * 0.6, s * 0.5, 300, lin(t, END + 1.6) * 0.78);
    line(ctx, '@jaayyyy.ay', w / 2, h * 0.86, s * 0.42, 400, lin(t, END + 2.9) * 0.9, s * 0.06);
  }
}

/** A "now playing" pill, bottom-left: a spinning record, the track, and an equaliser that pulses on the beat (100 BPM). */
export function drawNowPlaying(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, alpha: number) {
  if (alpha <= 0) return;
  const k = Math.max(0.7, Math.min(1.4, Math.min(w, h) / 820));
  const H = 50 * k, pad = 9 * k, R = H / 2 - pad * 0.55;
  const title = 'Leaf', artist = 'Infraction';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${14 * k}px ${FONT}`;
  const tw = ctx.measureText(`${title} · ${artist}`).width;
  const W = pad + R * 2 + 12 * k + Math.max(tw, 80 * k) + 14 * k + 26 * k + pad * 1.4;
  const x = 18 * k, y = h - 18 * k - H;
  // glass pill
  ctx.fillStyle = 'rgba(8,10,20,0.58)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, W, H, H / 2); ctx.fill(); ctx.stroke();

  // spinning record
  const cx = x + pad + R, cy = y + H / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 2.6);
  const disc = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  disc.addColorStop(0, '#2a2a33'); disc.addColorStop(1, '#0b0b10');
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let g = 0.5; g < 1; g += 0.14) { ctx.beginPath(); ctx.arc(0, 0, R * g, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5 * k;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.78, -0.5, 0.2); ctx.stroke();
  const label = ctx.createLinearGradient(-R * 0.35, -R * 0.35, R * 0.35, R * 0.35);
  label.addColorStop(0, '#a78bfa'); label.addColorStop(1, '#22d3ee');
  ctx.fillStyle = label;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0b10';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // text
  const tx = cx + R + 12 * k;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${1.6 * k}px`;
  ctx.font = `600 ${8.5 * k}px ${FONT}`;
  ctx.fillStyle = 'rgba(167,243,208,0.85)';
  ctx.fillText('NOW PLAYING', tx, cy - 4 * k);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.font = `600 ${14 * k}px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(title, tx, cy + 12 * k);
  const tw1 = ctx.measureText(title + ' ').width;
  ctx.font = `400 ${14 * k}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`· ${artist}`, tx + tw1, cy + 12 * k);

  // equaliser: five bars, each with its own sway, all kicked by the beat
  const beat = (((t - 0.45) / 0.6) % 1 + 1) % 1, kick = Math.exp(-beat * 5);
  const bx = x + W - pad * 1.4 - 26 * k, bw = 3.2 * k, maxH = H * 0.46;
  const grad = ctx.createLinearGradient(0, cy + maxH / 2, 0, cy - maxH / 2);
  grad.addColorStop(0, '#22d3ee'); grad.addColorStop(1, '#a78bfa');
  ctx.fillStyle = grad;
  for (let i = 0; i < 5; i++) {
    const sway = 0.5 + 0.5 * Math.sin(t * (4.1 + i * 1.37) + i * 1.9) * Math.sin(t * (1.3 + i * 0.41));
    const v = Math.min(1, 0.18 + sway * 0.5 + kick * (0.55 - Math.abs(i - 2) * 0.1));
    const bh = Math.max(bw, maxH * v);
    ctx.beginPath(); ctx.roundRect(bx + i * (bw + 2.2 * k), cy - bh / 2, bw, bh, bw / 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------
// Recorder: composites the ground (WebGL + effects) under the trailer canvas every frame and encodes an MP4.
// WebCodecs (H.264 + AAC) with timestamps from the soundtrack clock, so picture and music stay locked whatever the frame
// rate; the music is encoded straight from the file. Browsers without WebCodecs fall back to MediaRecorder.
// ---------------------------------------------------------------------------------------------------
// H.264 first (plays everywhere, Instagram included); VP9 in MP4 for browsers without an H.264 encoder
const VIDEO: [string, 'avc' | 'vp9'][] = [['avc1.640033', 'avc'], ['avc1.640032', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['vp09.00.40.08', 'vp9']];
const MR_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
const FPS = 60;

function save(blob: Blob, ext: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `claude-cooked-trailer.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export class FilmRecorder {
  private comp = document.createElement('canvas');
  private cx = this.comp.getContext('2d', { alpha: false })!;
  /** true once the encoders are configured and the music is decoded */
  ready = false;
  private failed = false;
  // WebCodecs path
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private venc: VideoEncoder | null = null;
  private music: AudioBuffer | null = null;
  private acodec: 'aac' | 'opus' = 'aac';
  private lastTs = -1;
  private lastKey = -1e9;
  // MediaRecorder fallback
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private type = '';

  /** @param lead seconds of picture before the music starts (the title cards) */
  constructor(private soundtrack: string, private lead: number) {
    this.prepare().catch(e => { console.warn('WebCodecs indisponível, usando MediaRecorder', e); this.failed = true; this.ready = true; });
  }

  private size() {
    // at most 1080p, even dimensions (H.264)
    const vw = window.innerWidth * Math.min(2, window.devicePixelRatio || 1), vh = window.innerHeight * Math.min(2, window.devicePixelRatio || 1);
    const k = Math.min(1, 1920 / vw, 1080 / vh);
    return [Math.round((vw * k) / 2) * 2, Math.round((vh * k) / 2) * 2];
  }

  private async prepare() {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') throw new Error('no WebCodecs');
    const [W, H] = this.size();
    this.comp.width = W; this.comp.height = H;
    let vcfg: VideoEncoderConfig | null = null, vkind: 'avc' | 'vp9' = 'avc';
    for (const [codec, kind] of VIDEO) {
      const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 20_000_000, framerate: FPS, latencyMode: 'quality', ...(kind === 'avc' ? { avc: { format: 'avc' as const } } : {}) };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { vcfg = c; vkind = kind; break; }
    }
    if (!vcfg) throw new Error('no video encoder');
    const buf = await (await fetch(this.soundtrack)).arrayBuffer();
    this.music = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(buf);
    const acfg = (codec: string): AudioEncoderConfig => ({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });
    if (!(await AudioEncoder.isConfigSupported(acfg('mp4a.40.2'))).supported) {
      if (!(await AudioEncoder.isConfigSupported(acfg('opus'))).supported) throw new Error('no audio encoder');
      this.acodec = 'opus';
    }
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: vkind, width: W, height: H, frameRate: FPS },
      audio: { codec: this.acodec, numberOfChannels: 2, sampleRate: 48000 },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    this.venc = new VideoEncoder({ output: (c, m) => this.muxer!.addVideoChunk(c, m), error: e => console.error('video encoder', e) });
    this.venc.configure(vcfg);
    this.ready = true;
  }

  /** MediaRecorder fallback needs the live music track */
  start(source: HTMLCanvasElement, audio: () => MediaStreamTrack | null) {
    if (!this.failed) return;
    this.comp.width = source.width; this.comp.height = source.height;
    const stream = this.comp.captureStream(FPS);
    const a = audio();
    if (a) stream.addTrack(a);
    this.type = MR_TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
    this.rec = new MediaRecorder(stream, { mimeType: this.type || undefined, videoBitsPerSecond: 16_000_000 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000);
  }

  /** call once per frame, after the trailer canvas is drawn; `t` is the soundtrack time */
  frame(source: HTMLCanvasElement, t: number) {
    const c = this.cx, W = this.comp.width, H = this.comp.height;
    if (this.venc) {
      const ts = Math.max(0, Math.round((t + this.lead) * 1e6));
      if (ts < this.lastTs + 1e6 / FPS - 2000 || this.venc.encodeQueueSize > 8) return; // 60 fps cap / encoder busy
      this.lastTs = ts;
    } else if (!this.rec) return;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    // the visible planet surface (its canvases keep their frame: preserveDrawingBuffer in cinematic mode)
    for (const el of document.querySelectorAll<HTMLCanvasElement>('canvas[data-cine]')) {
      if ((el.parentElement as HTMLElement).style.visibility === 'hidden' || !el.width) continue;
      c.drawImage(el, 0, 0, W, H);
    }
    c.drawImage(source, 0, 0, W, H);
    if (this.venc) {
      const vf = new VideoFrame(this.comp, { timestamp: this.lastTs });
      const key = this.lastTs - this.lastKey >= 2e6;
      if (key) this.lastKey = this.lastTs;
      this.venc.encode(vf, { keyFrame: key });
      vf.close();
    }
  }

  /** stops, and hands the file to the browser as a download */
  async finish(): Promise<void> {
    if (this.rec) {
      const rec = this.rec;
      this.rec = null;
      await new Promise<void>(res => { rec.onstop = () => res(); rec.stop(); });
      const mime = this.type.split(';')[0] || 'video/webm';
      save(new Blob(this.chunks, { type: mime }), mime.includes('mp4') ? 'mp4' : 'webm');
      return;
    }
    if (!this.venc || !this.muxer || !this.music) return;
    await this.venc.flush();
    // the music, from the file, after the silent title cards
    const aenc = new AudioEncoder({ output: (c, m) => this.muxer!.addAudioChunk(c, m), error: e => console.error('audio encoder', e) });
    aenc.configure({ codec: this.acodec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });
    const m = this.music, lead = Math.round(this.lead * 48000), total = lead + m.length, N = 4096;
    const L = m.getChannelData(0), R = m.numberOfChannels > 1 ? m.getChannelData(1) : L;
    for (let i = 0; i < total; i += N) {
      const n = Math.min(N, total - i), data = new Float32Array(n * 2);
      for (let j = 0; j < n; j++) {
        const k = i + j - lead;
        if (k >= 0) { data[j] = L[k]; data[n + j] = R[k]; }
      }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    this.muxer.finalize();
    save(new Blob([this.muxer.target.buffer], { type: 'video/mp4' }), 'mp4');
    this.venc.close(); aenc.close();
    this.venc = null;
  }
  cancel() { try { this.rec?.stop(); this.venc?.close(); } catch { /* ignore */ } this.rec = null; this.venc = null; }
}
