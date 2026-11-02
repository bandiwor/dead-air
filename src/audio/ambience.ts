import { Rng, hashString } from '../core/rng';
import { clamp } from '../core/math';
import { WORLD } from '../proc/terrain';
import type { AudioEngine } from './engine';
import { filter, gain, noiseBuffer, saturator } from './dsp';

export interface AmbienceState {
  px: number;
  pz: number;
  /** 0..1 — напряжение от Режиссёра. */
  tension: number;
  /** 0..1 — рассудок. */
  sanity: number;
  hp: number;
  deadAir: boolean;
  nearestEnemy: number;
  playing: boolean;
}

/** Ноты: A2 = 110 Гц. */
const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Романс-вальс в ля миноре: Am – Dm – E – Am – F – Dm – E – Am. */
const CHORDS: readonly number[][] = [
  [57, 60, 64], [62, 65, 69], [64, 68, 71], [57, 60, 64],
  [53, 57, 60], [62, 65, 69], [64, 68, 71], [57, 60, 64],
];
const SCALE = [57, 59, 60, 62, 64, 65, 67, 68, 69, 71, 72, 74, 76];

/**
 * Живые слои: ветер, гул, природа (сверчки/лягушки — замолкают рядом с опасностью),
 * сердцебиение и радиовальс из громкоговорителя на площади.
 */
export class Ambience {
  private readonly e: AudioEngine;
  private readonly rng = new Rng(hashString('ambience'));
  private started = false;

  private windGain!: GainNode;
  private windLp!: BiquadFilterNode;
  private leavesGain!: GainNode;
  private droneGain!: GainNode;
  private droneLp!: BiquadFilterNode;
  private droneRub!: GainNode;
  private radioIn!: GainNode;
  private radioOut!: GainNode;
  private radioPan!: StereoPannerNode;

  private gustT = 0;
  private natureT = 1;
  private frogT = 3;
  private heartT = 0;
  private silenceUntil = 0;

  // радио
  private radioOn = true;
  private melody: { bar: number; beat: number; note: number; len: number }[] = [];
  private nextNoteTime = 0;
  private step = 0;
  private sanity = 1;

  constructor(e: AudioEngine) {
    this.e = e;
    this.composeMelody(new Rng(hashString('waltz-ustye')));
  }

  /** Мелодия сочиняется по сиду один раз: песня, которую игрок успеет выучить — и заметить, когда она «сломается». */
  private composeMelody(r: Rng): void {
    const patterns = [
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [2, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1]],
      [[0, 3]],
    ];
    let prev = 64;
    for (let half = 0; half < 2; half++) {
      for (let bar = 0; bar < 8; bar++) {
        const chord = CHORDS[bar]!;
        const pat = bar === 7 ? patterns[3]! : r.pick(patterns);
        for (const [beat, len] of pat) {
          let note: number;
          if (beat === 0) {
            note = chord[r.int(0, 2)]! + 12;
            while (note - prev > 7) note -= 12;
            while (prev - note > 7) note += 12;
          } else {
            const idx = SCALE.indexOf(prev) >= 0 ? SCALE.indexOf(prev) : 4;
            const stepN = r.pick([-2, -1, -1, 1, 1, 2]);
            note = SCALE[clamp(idx + stepN, 0, SCALE.length - 1)]!;
          }
          if (half === 1 && bar >= 6) note = chord[0]! + 12;
          this.melody.push({ bar: bar + half * 8, beat: beat!, note, len: len! });
          prev = note;
        }
      }
    }
  }

  start(): void {
    const ctx = this.e.ctx;
    if (!ctx || this.started) return;
    this.started = true;
    const r = this.rng;

    // ветер
    const windSrc = this.loopSource('static', noiseBuffer(ctx, 8, r, 'pink'));
    this.windLp = filter(ctx, 'lowpass', 500, 0.6);
    this.windGain = gain(ctx, 0.35);
    windSrc.connect(this.windLp);
    this.windLp.connect(this.windGain);
    this.windGain.connect(this.e.buses.amb);
    const leaves = this.loopSource('static', noiseBuffer(ctx, 6, r, 'white'));
    this.leavesGain = gain(ctx, 0.02);
    leaves.connect(filter(ctx, 'bandpass', 5200, 0.6)).connect(this.leavesGain).connect(this.e.buses.amb);

    // гул (драм-нижний слой; гармоники — для телефонных динамиков)
    this.droneLp = filter(ctx, 'lowpass', 260, 1.2);
    this.droneGain = gain(ctx, 0.1);
    this.droneLp.connect(this.droneGain).connect(this.e.buses.music);
    const mk = (type: OscillatorType, f: number, v: number, detune = 0): GainNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const g = gain(ctx, v);
      o.connect(g).connect(this.droneLp);
      o.start();
      // медленный дрейф
      const lfo = ctx.createOscillator();
      lfo.frequency.value = r.range(0.03, 0.09);
      const lg = gain(ctx, r.range(3, 7));
      lfo.connect(lg).connect(o.detune);
      lfo.start();
      return g;
    };
    mk('sine', 55, 0.5);
    mk('sine', 82.41, 0.3, 6);
    mk('triangle', 110, 0.12, -4);
    mk('triangle', 164.8, 0.05, 3);
    this.droneRub = gain(ctx, 0);
    const rubO = ctx.createOscillator();
    rubO.type = 'sawtooth';
    rubO.frequency.value = 58.27; // малая секунда к ля — трение
    rubO.connect(this.droneRub).connect(this.droneLp);
    rubO.start();
    const rumble = this.loopSource('static', noiseBuffer(ctx, 5, r, 'brown'));
    rumble.connect(filter(ctx, 'bandpass', 90, 1)).connect(gain(ctx, 0.4)).connect(this.droneLp);

    // радио: громкоговоритель — полоса, насыщение, позиционирование по площади
    this.radioIn = gain(ctx, 1);
    this.radioOut = gain(ctx, 0);
    this.radioPan = ctx.createStereoPanner();
    this.radioIn
      .connect(filter(ctx, 'highpass', 380, 0.9))
      .connect(filter(ctx, 'lowpass', 3000, 1))
      .connect(filter(ctx, 'peaking', 1700, 1.4, 5))
      .connect(saturator(ctx, 2.2))
      .connect(this.radioOut)
      .connect(this.radioPan)
      .connect(this.e.buses.music);
    const send = gain(ctx, 0.5);
    this.radioOut.connect(send).connect(this.e.reverbIn);
    // треск пластинки/эфира
    const crackle = this.loopSource('static', noiseBuffer(ctx, 3, r, 'white'));
    crackle.connect(filter(ctx, 'highpass', 2500)).connect(gain(ctx, 0.012)).connect(this.radioIn);
    this.nextNoteTime = ctx.currentTime + 0.3;
  }

  private loopSource(_id: string, fallback: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.e.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = fallback;
    s.loop = true;
    s.start();
    return s;
  }

  silence(seconds: number): void {
    const ctx = this.e.ctx;
    if (ctx) this.silenceUntil = ctx.currentTime + seconds;
  }

  setRadio(on: boolean): void {
    if (on === this.radioOn) return;
    this.radioOn = on;
    const ctx = this.e.ctx;
    if (!ctx) return;
    if (on) {
      this.step = 0;
      this.nextNoteTime = ctx.currentTime + 1.1;
    }
  }

  update(s: AmbienceState, dt: number): void {
    const ctx = this.e.ctx;
    if (!ctx || !this.started) return;
    const t = ctx.currentTime;
    const r = this.rng;
    this.sanity = s.sanity;

    // ветер порывами
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = r.range(3, 9);
      const strength = r.range(0.2, 1);
      this.windLp.frequency.setTargetAtTime(300 + strength * 900, t, 1.4);
      this.windGain.gain.setTargetAtTime(0.18 + strength * 0.3, t, 1.6);
      this.leavesGain.gain.setTargetAtTime(0.008 + strength * 0.035, t, 1.2);
    }

    // гул и трение растут с напряжением; в мёртвом эфире гул становится слышен — «тишина гудит»
    const tension = clamp(s.tension + (1 - s.sanity) * 0.5, 0, 1);
    this.droneLp.frequency.setTargetAtTime(180 + tension * 1300, t, 0.8);
    this.droneGain.gain.setTargetAtTime(0.07 + tension * 0.22 + (s.deadAir ? 0.12 : 0), t, 0.8);
    this.droneRub.gain.setTargetAtTime(tension * tension * 0.18, t, 0.8);

    // природа замолкает, когда рядом опасность — древний сигнал хищника
    const natureOk = s.playing && t > this.silenceUntil && s.nearestEnemy > 12 && !s.deadAir;
    this.natureT -= dt;
    if (natureOk && this.natureT <= 0) {
      this.natureT = r.range(0.25, 1.3);
      const a = r.range(0, Math.PI * 2);
      const d = r.range(7, 22);
      this.e.play('cricket', { x: s.px + Math.cos(a) * d, z: s.pz + Math.sin(a) * d, vol: r.range(0.25, 0.6), bus: 'amb', low: true, reverb: 0.3 });
    }
    this.frogT -= dt;
    const pd = Math.hypot(s.px - WORLD.pond.x, s.pz - WORLD.pond.z);
    if (natureOk && this.frogT <= 0 && pd < 40) {
      this.frogT = r.range(1.2, 3.5);
      this.e.play('frog', { x: WORLD.pond.x + r.range(-8, 8), z: WORLD.pond.z + r.range(-8, 8), vol: 0.5, bus: 'amb', low: true });
    }

    // сердцебиение
    const fear = clamp((0.55 - s.hp) * 1.6, 0, 1) + clamp((0.6 - s.sanity) * 1.4, 0, 1) + (s.nearestEnemy < 4 ? 0.4 : 0);
    if (s.playing && fear > 0.05) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const bpm = 62 + clamp(fear, 0, 1.4) * 55;
        this.heartT = 60 / bpm;
        this.e.play('heartbeat', { vol: clamp(fear, 0, 1) * 0.9, bus: 'ui', reverb: 0 });
      }
    }

    // радио
    const dxp = WORLD.pole.x - s.px;
    const dzp = WORLD.pole.z - s.pz;
    const dist = Math.hypot(dxp, dzp);
    const vol = this.radioOn && s.playing ? 0.55 / (1 + Math.pow(dist / 11, 1.3)) : 0;
    this.radioOut.gain.setTargetAtTime(vol, t, 0.3);
    this.radioPan.pan.setTargetAtTime(clamp(dxp / Math.max(6, dist), -1, 1) * 0.8, t, 0.2);
    if (this.radioOn) this.scheduleRadio(ctx);
  }

  private scheduleRadio(ctx: AudioContext): void {
    const bpm = 84;
    const beatDur = 60 / bpm;
    const barDur = beatDur * 3;
    const loopBars = 16;
    // планируем на 0.4 с вперёд
    while (this.nextNoteTime < ctx.currentTime + 0.4) {
      const bar = this.step % loopBars;
      const t0 = this.nextNoteTime;
      const chord = CHORDS[bar % 8]!;
      const wrong = clamp((0.6 - this.sanity) * 1.6, 0, 0.8);
      const drift = -wrong * 40; // при низком рассудке всё «сползает» вниз
      // бас на раз, аккорд на два-три
      this.note(ctx, midi(chord[0]! - 12), t0, beatDur * 0.9, 'triangle', 0.22, drift);
      for (const b of [1, 2]) {
        for (const n of chord) this.note(ctx, midi(n), t0 + b * beatDur, beatDur * 0.55, 'triangle', 0.05, drift);
      }
      // мелодия
      for (const m of this.melody) {
        if (m.bar !== bar) continue;
        let n = m.note;
        if (this.rng.chance(wrong * 0.5)) n += this.rng.sign(); // «неправильная» нота — малая секунда
        this.note(ctx, midi(n), t0 + m.beat * beatDur, m.len * beatDur * 0.95, 'square', 0.07, drift, true);
        this.note(ctx, midi(n), t0 + m.beat * beatDur, m.len * beatDur * 0.95, 'triangle', 0.12, drift + 4, true);
      }
      this.nextNoteTime += barDur * (1 + (this.rng.next() - 0.5) * wrong * 0.25);
      this.step++;
    }
  }

  private note(ctx: AudioContext, f: number, t: number, len: number, type: OscillatorType, vol: number, detune: number, vibrato = false): void {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.025);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.05, 0.2);
    g.gain.setTargetAtTime(0.0001, t + len, 0.08);
    o.connect(g).connect(this.radioIn);
    if (vibrato) {
      const l = ctx.createOscillator();
      l.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.value = 9;
      l.connect(lg).connect(o.detune);
      l.start(t);
      l.stop(t + len + 0.4);
    }
    o.start(t);
    o.stop(t + len + 0.4);
  }
}
