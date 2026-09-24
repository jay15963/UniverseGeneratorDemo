/// <reference lib="webworker" />
// Runs the (heavy) PlanetGenerator off the main thread.
//
// Two kinds of work:
//  - 'texture': one-shot generation of a small equirectangular texture (+ cloud alpha map)
//               used to paint planets as rotating spheres in the system view.
//  - sessions:  a full-resolution generator kept alive in this worker so the surface map can
//               switch layers and probe pixels without ever copying the raw fields to the UI thread.
import seedrandom from 'seedrandom';
import { createNoise3D } from 'simplex-noise';
import { PlanetGenerator, LayerType, PlanetConfig } from './generator';
import type { WorkerRequest, WorkerResponse, PlanetProbe } from './workerProtocol';
import { cloudProfileFor } from './visualProfile';
import { TerrainGenerator } from '../terrain/terrainGen';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const sessions = new Map<string, PlanetGenerator>();
const terrains = new Map<string, TerrainGenerator>();
function terrainFor(sessionId: string): TerrainGenerator {
  let t = terrains.get(sessionId);
  if (!t) {
    const gen = sessions.get(sessionId);
    if (!gen) throw new Error('Unknown session ' + sessionId);
    t = new TerrainGenerator(gen);
    terrains.set(sessionId, t);
  }
  return t;
}

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

/** Seamless spherical fBm cloud map. Sampling noise on the unit sphere avoids polar pinching. */
function generateClouds(config: PlanetConfig, width: number, height: number): Uint8ClampedArray | null {
  const profile = cloudProfileFor(config);
  if (!profile) return null;
  const noise = createNoise3D(seedrandom(config.seed + '_clouds'));
  const out = new Uint8ClampedArray(width * height);
  const { coverage, sharpness, scale, bandStretch } = profile;
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * Math.PI * 2;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon), py = sl * bandStretch;
      // Domain warp gives swirly, cyclone-like shapes
      const wx = noise(px * 2 + 11.3, py * 2, pz * 2) * 0.25;
      const wz = noise(px * 2, py * 2 + 7.1, pz * 2) * 0.25;
      let f = 0, amp = 1, freq = scale, norm = 0;
      for (let o = 0; o < 5; o++) {
        f += noise((px + wx) * freq, py * freq, (pz + wz) * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2.1;
      }
      f = f / norm * 0.5 + 0.5; // 0..1
      // Fewer clouds over the equatorial desert belt, more in storm tracks
      const latBias = 0.08 * Math.cos(lat * 3);
      let v = (f + latBias - (1 - coverage)) * sharpness;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      out[y * width + x] = Math.round(v * 255);
    }
  }
  return out;
}

function probe(gen: PlanetGenerator, x: number, y: number): PlanetProbe | null {
  const { width, height } = gen.config;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const i = y * width + x;
  return {
    elevation: gen.elevation[i],
    temperature: gen.temperature[i],
    moisture: gen.moisture[i],
    biome: gen.biomeIds[i],
    movementCost: gen.movementCosts[i],
    fertility: gen.fertility[i],
    ore: gen.ores[i],
    spice: gen.spices[i],
    resource: gen.resources[i],
    fauna: gen.fauna[i],
    boundaryType: gen.boundaryTypes[i],
    plateDistance: gen.plateDistances[i],
    water: gen.waterAccumulation[i],
  };
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.kind) {
      case 'texture': {
        const gen = new PlanetGenerator(msg.config);
        await gen.generate();
        const data = gen.renderToBuffer(msg.layer ?? LayerType.FINAL);
        const clouds = generateClouds(msg.config, msg.config.width, msg.config.height);
        const transfer: Transferable[] = [data.buffer];
        if (clouds) transfer.push(clouds.buffer);
        post({ kind: 'texture', id: msg.id, width: msg.config.width, height: msg.config.height, data, clouds }, transfer);
        break;
      }
      case 'open': {
        const gen = new PlanetGenerator(msg.config);
        sessions.set(msg.sessionId, gen);
        await gen.generate((p, s) => post({ kind: 'progress', id: msg.id, progress: p, status: s }));
        const clouds = generateClouds(msg.config, 1024, 512);
        post({ kind: 'opened', id: msg.id, clouds, cloudWidth: 1024, cloudHeight: 512 }, clouds ? [clouds.buffer] : []);
        break;
      }
      case 'render': {
        const gen = sessions.get(msg.sessionId);
        if (!gen) throw new Error('Unknown session ' + msg.sessionId);
        const data = gen.renderToBuffer(msg.layer);
        post({ kind: 'layer', id: msg.id, width: gen.config.width, height: gen.config.height, data }, [data.buffer]);
        break;
      }
      case 'probe': {
        const gen = sessions.get(msg.sessionId);
        post({ kind: 'probe', id: msg.id, probe: gen ? probe(gen, msg.x, msg.y) : null });
        break;
      }
      case 'chunk': {
        const chunk = terrainFor(msg.sessionId).chunk(msg.cx, msg.cy);
        post({ kind: 'chunk', id: msg.id, chunk }, [...chunk.rows.map(r => r.px.buffer), chunk.ground.buffer, chunk.biome.buffer, chunk.rock.buffer, chunk.temp.buffer, chunk.level.buffer, chunk.ramp.buffer, chunk.lava.buffer, chunk.mini.buffer]);
        break;
      }
      case 'spawn': {
        const sp = terrainFor(msg.sessionId).spawn(msg.x, msg.y);
        post({ kind: 'spawn', id: msg.id, tx: sp.tx, ty: sp.ty });
        break;
      }
      case 'close': {
        sessions.delete(msg.sessionId);
        terrains.delete(msg.sessionId);
        break;
      }
    }
  } catch (e) {
    post({ kind: 'error', id: (msg as any).id ?? -1, message: e instanceof Error ? e.message : String(e) });
  }
};
