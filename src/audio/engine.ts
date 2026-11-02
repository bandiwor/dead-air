import { SOUNDS, type SoundId, type SoundSource } from '../content/assets';
import { Rng, hashString } from '../core/rng';
import { clamp } from '../core/math';
import { forestImpulse, gain } from './dsp';
import { RECIPES } from './recipes';

export interface PlayOpts {
  x?: number;
  z?: number;
  vol?: number;
  rate?: number;
  /** 0..1 — доля в реверберацию (по умолчанию растёт с расстоянием). */
  reverb?: number;
  bus?: 'sfx' | 'amb' | 'music' | 'ui';
  delay?: number;
  /** Низкий приоритет (шаги и т. п.) — отбрасывается при перегрузе. */
  low?: boolean;
}

const SAMPLE_RATE = 44100;
const MAX_VOICES = 30;

/**
 * Звуковой движок: мастер-лимитер, шины, реверберация «ночной лес», позиционирование,
 * пул голосов, запекание процедурных звуков и загрузка файлов-замен.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private muffle!: BiquadFilterNode;
  buses!: Record<'sfx' | 'amb' | 'music' | 'ui', GainNode>;
  reverbIn!: GainNode;
  private readonly buffers = new Map<SoundId, AudioBuffer[]>();
  private voices = 0;
  private lx = 0;
  private lz = 0;
  private readonly rng = new Rng(hashString('audio'));
  private volume = 0.9;

  /** Создаётся по первому касанию (требование браузеров). */
  init(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.18;
    this.master = gain(ctx, this.volume);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this.buses = {
      sfx: gain(ctx, 0.9),
      amb: gain(ctx, 0.7),
      music: gain(ctx, 0.75),
      ui: gain(ctx, 0.6),
    };
    this.buses.sfx.connect(this.muffle);
    this.buses.amb.connect(this.muffle);
    this.buses.music.connect(this.limiter);
    this.buses.ui.connect(this.limiter);
    const conv = ctx.createConvolver();
    conv.buffer = forestImpulse(ctx, new Rng(hashString('forest-ir')));
    this.reverbIn = gain(ctx, 0.55);
    this.reverbIn.connect(conv);
    conv.connect(this.muffle);
    return ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  /** Запекает все процедурные звуки и загружает файлы-замены. */
  async load(onProgress: (done: number, total: number) => void): Promise<void> {
    const ctx = this.init();
    const entries = Object.entries(SOUNDS) as [SoundId, SoundSource][];
    let done = 0;
    const tasks = entries.map(async ([id, src]) => {
      try {
        const list = 'file' in src ? await this.loadFiles(ctx, src.file) : await this.bake(id, src);
        this.buffers.set(id, list);
      } catch (e) {
        // Один сломанный звук не должен блокировать игру: он просто будет молчать.
        console.error(`sound "${id}" failed`, e);
      }
      onProgress(++done, entries.length);
    });
    await Promise.all(tasks);
  }

  private async loadFiles(ctx: AudioContext, file: string | string[]): Promise<AudioBuffer[]> {
    const files = Array.isArray(file) ? file : [file];
    const out: AudioBuffer[] = [];
    for (const f of files) {
      const res = await fetch(f);
      if (!res.ok) throw new Error(`sound ${f}: ${res.status}`);
      out.push(await ctx.decodeAudioData(await res.arrayBuffer()));
    }
    return out;
  }

  private async bake(id: SoundId, src: { proc: keyof typeof RECIPES; variations?: number }): Promise<AudioBuffer[]> {
    const recipe = RECIPES[src.proc];
    const n = src.variations ?? 1;
    const out: AudioBuffer[] = [];
    for (let v = 0; v < n; v++) {
      const rng = new Rng(hashString(`${id}:${v}`));
      const dur = recipe.dur(rng);
      const off = new OfflineAudioContext(1, Math.ceil(dur * SAMPLE_RATE), SAMPLE_RATE);
      const outGain = off.createGain();
      outGain.connect(off.destination);
      recipe.build(off, outGain, rng, dur);
      out.push(await off.startRendering());
    }
    return out;
  }

  /** Живые слои могут быть заменены файлом: тогда используется буфер. */
  bufferOf(id: SoundId): AudioBuffer | undefined {
    return this.buffers.get(id)?.[0];
  }

  setListener(x: number, z: number): void {
    this.lx = x;
    this.lz = z;
  }

  play(id: SoundId, o: PlayOpts = {}): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const list = this.buffers.get(id);
    if (!list || list.length === 0) return null;
    if (this.voices >= MAX_VOICES && o.low) return null;
    if (this.voices >= MAX_VOICES + 8) return null;
    const buf = list[Math.floor(this.rng.next() * list.length)]!;
    const t = ctx.currentTime + (o.delay ?? 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * this.rng.range(0.96, 1.04);
    const g = ctx.createGain();
    let vol = o.vol ?? 1;
    let pan = 0;
    let dist = 0;
    if (o.x !== undefined && o.z !== undefined) {
      const dx = o.x - this.lx;
      const dz = o.z - this.lz;
      dist = Math.hypot(dx, dz);
      vol *= 1 / (1 + Math.pow(dist / 7, 1.35));
      pan = clamp(dx / Math.max(4, dist), -1, 1) * clamp(dist / 3, 0, 1) * 0.85;
    }
    if (vol < 0.004) return null;
    g.gain.value = vol;
    src.connect(g);
    let tail: AudioNode = g;
    if (dist > 10) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(16000 * Math.exp(-(dist - 10) / 18), 700, 16000);
      tail.connect(lp);
      tail = lp;
    }
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.buses[o.bus ?? 'sfx']);
    const send = o.reverb ?? clamp(0.15 + dist / 35, 0, 0.9);
    if (send > 0.01) {
      const s = ctx.createGain();
      s.gain.value = send;
      tail.connect(s);
      s.connect(this.reverbIn);
    }
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
    };
    src.start(t);
    return src;
  }

  /** Оглушение после взрыва: фильтр на sfx/amb + звон. */
  deafen(amount: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.muffle.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(clamp(20000 * (1 - amount) + 500, 500, 20000), t);
    f.setTargetAtTime(20000, t + 0.4, 0.9);
    const o = ctx.createOscillator();
    o.frequency.value = 3900 + this.rng.range(-200, 200);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * amount, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g);
    g.connect(this.buses.ui);
    o.start(t);
    o.stop(t + 3);
  }

  /** Приглушить фон (перед ударом страха — тишина). */
  duck(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const b of [this.buses.amb, this.buses.music]) {
      b.gain.cancelScheduledValues(t);
      b.gain.setTargetAtTime(0.06, t, 0.25);
      b.gain.setTargetAtTime(b === this.buses.amb ? 0.7 : 0.75, t + seconds, 0.6);
    }
  }
}
