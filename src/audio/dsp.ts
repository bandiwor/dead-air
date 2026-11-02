import type { Rng } from '../core/rng';

/** Мелкие строительные блоки синтеза поверх Web Audio. Работают и в OfflineAudioContext. */

export type Ctx = BaseAudioContext;
export type NoiseColor = 'white' | 'pink' | 'brown';

const noiseCache = new WeakMap<Ctx, Map<string, AudioBuffer>>();

export function noiseBuffer(ctx: Ctx, seconds: number, rng: Rng, color: NoiseColor = 'white'): AudioBuffer {
  const key = `${color}:${seconds}`;
  let m = noiseCache.get(ctx);
  if (!m) {
    m = new Map();
    noiseCache.set(ctx, m);
  }
  const cached = m.get(key);
  if (cached) return cached;
  const len = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = rng.next() * 2 - 1;
    if (color === 'white') d[i] = white;
    else if (color === 'pink') {
      // фильтр Пола Келлета
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
  }
  m.set(key, buf);
  return buf;
}

export function noise(ctx: Ctx, rng: Rng, seconds: number, color: NoiseColor = 'white', at = 0): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, Math.max(2, Math.ceil(seconds)), rng, color);
  s.loop = true;
  s.loopStart = rng.range(0, 1);
  s.start(at, rng.range(0, 1));
  s.stop(at + seconds + 0.05);
  return s;
}

export function osc(ctx: Ctx, type: OscillatorType, freq: number, at: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

export function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.707, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

export function gain(ctx: Ctx, v = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Огибающая «щелчок → экспоненциальный спад». */
export function perc(p: AudioParam, at: number, peak: number, attack: number, decay: number): void {
  if (at > 0) p.setValueAtTime(0.0001, 0);
  p.setValueAtTime(0.0001, at);
  p.linearRampToValueAtTime(peak, at + Math.max(0.0005, attack));
  p.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

/** Огибающая «нарастание → удержание → спад». */
export function ahr(p: AudioParam, at: number, peak: number, attack: number, hold: number, release: number): void {
  if (at > 0) p.setValueAtTime(0.0001, 0);
  p.setValueAtTime(0.0001, at);
  p.linearRampToValueAtTime(peak, at + attack);
  p.setValueAtTime(peak, at + attack + hold);
  p.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
}

export function sweep(p: AudioParam, at: number, from: number, to: number, dur: number): void {
  p.setValueAtTime(from, at);
  p.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();
/** Мягкое ограничение (tanh) — «аналоговая» насыщенность. */
export function saturator(ctx: Ctx, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const key = Math.round(drive * 100);
  let c = curves.get(key);
  if (!c) {
    c = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    curves.set(key, c);
  }
  ws.curve = c;
  ws.oversample = '2x';
  return ws;
}

/** Цепочка: последовательно соединяет узлы, возвращает последний. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return nodes[nodes.length - 1]!;
}

/**
 * Импульсный отклик «ночной лес»: редкие ранние отражения от стволов + диффузный хвост,
 * в котором высокие частоты затухают быстрее (воздух и хвоя глушат верх).
 */
export function forestImpulse(ctx: Ctx, rng: Rng, seconds = 3.2): AudioBuffer {
  const len = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const decay = Math.exp(-t * 2.3);
      const white = rng.next() * 2 - 1;
      // коэффициент сглаживания растёт со временем → хвост темнеет
      const k = Math.min(0.97, 0.15 + t * 0.55);
      lp = lp * k + white * (1 - k);
      const fadeIn = Math.min(1, t / 0.012);
      d[i] = lp * decay * fadeIn * (1.6 - k);
    }
    // ранние отражения: эхо от опушки
    for (let r = 0; r < 14; r++) {
      const t = rng.range(0.012, 0.16);
      const i = Math.floor(t * ctx.sampleRate);
      d[i] = (d[i] ?? 0) + rng.range(-0.6, 0.6) * Math.exp(-t * 8);
    }
    // далёкий отклик леса
    for (let r = 0; r < 3; r++) {
      const t = rng.range(0.3, 0.75);
      const i0 = Math.floor(t * ctx.sampleRate);
      for (let j = 0; j < 400; j++) d[i0 + j] = (d[i0 + j] ?? 0) + (rng.next() * 2 - 1) * 0.12 * Math.exp(-j / 120);
    }
  }
  return buf;
}
