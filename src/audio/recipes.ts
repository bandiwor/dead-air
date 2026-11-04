import type { ProcSoundId } from '../content/assets';
import type { Rng } from '../core/rng';
import { ahr, chain, filter, gain, noise, osc, perc, saturator, sweep, type Ctx } from './dsp';

/**
 * Рецепты процедурных звуков. Каждый рецепт: длительность + построение графа в OfflineAudioContext.
 * Результат запекается в AudioBuffer при загрузке → в игре нулевая нагрузка на синтез.
 *
 * Звуковая палитра намеренно ограничена тем, где синтез звучит убедительно:
 * механика, выстрелы, взрывы, дерево, шорохи, дыхание, радио. Никаких «реалистичных» голосов.
 */
export interface Recipe {
  dur: (rng: Rng) => number;
  build: (ctx: Ctx, out: AudioNode, rng: Rng, dur: number) => void;
}

interface GunSpec {
  crack: number; // громкость щелчка
  bright: number; // частота среза щелчка
  body: number; // длительность «тела»
  bodyFrom: number;
  bodyTo: number;
  thumpFrom: number;
  thumpTo: number;
  thump: number;
  tail: number;
  slap: number; // эхо от опушки
  drive: number;
}

function gun(ctx: Ctx, out: AudioNode, rng: Rng, g: GunSpec): void {
  const sum = gain(ctx, 1);
  const sat = saturator(ctx, g.drive);
  chain(sum, sat, out);

  // 1. Щелчок/трескотня — сверхзвуковая волна, почти белый шум
  const cr = gain(ctx);
  chain(noise(ctx, rng, 0.08), filter(ctx, 'highpass', g.bright * rng.range(0.9, 1.1)), cr, sum);
  perc(cr.gain, 0, g.crack, 0.0006, 0.05);

  // 2. Тело — пороховые газы: шум с быстро «закрывающимся» фильтром
  const body = gain(ctx);
  const lp = filter(ctx, 'lowpass', g.bodyFrom, 0.9);
  sweep(lp.frequency, 0, g.bodyFrom, g.bodyTo, g.body);
  chain(noise(ctx, rng, g.body + 0.1), lp, body, sum);
  perc(body.gain, 0, 0.95, 0.001, g.body);

  // 3. Удар в грудь — низкий синус с падающей частотой (на телефоне слышно его гармонику)
  const th = gain(ctx);
  const o = osc(ctx, 'sine', g.thumpFrom, 0, g.thump);
  sweep(o.frequency, 0, g.thumpFrom, g.thumpTo, g.thump * 0.6);
  const o2 = osc(ctx, 'triangle', g.thumpFrom * 2, 0, g.thump * 0.5);
  sweep(o2.frequency, 0, g.thumpFrom * 2, g.thumpTo * 2, g.thump * 0.4);
  const th2 = gain(ctx, 0.25);
  chain(o, th, sum);
  chain(o2, th2, th);
  perc(th.gain, 0, 1, 0.002, g.thump);

  // 4. Хвост и отклик леса
  const tail = gain(ctx);
  chain(noise(ctx, rng, g.tail + 0.2, 'brown'), filter(ctx, 'lowpass', 700), tail, sum);
  ahr(tail.gain, 0.01, 0.35, 0.03, 0.05, g.tail);
  for (let i = 0; i < 2; i++) {
    const d = ctx.createDelay(2);
    d.delayTime.value = rng.range(0.22, 0.42) * (i + 1);
    const eg = gain(ctx, g.slap / (i + 1.5));
    chain(sum, d, filter(ctx, 'lowpass', 1400 - i * 500), eg, out);
  }
}

function click(ctx: Ctx, out: AudioNode, rng: Rng, at: number, freq: number, vol: number): void {
  const g = gain(ctx);
  chain(noise(ctx, rng, 0.03), filter(ctx, 'bandpass', freq, 6), g, out);
  perc(g.gain, at, vol, 0.0005, 0.02);
  const r = gain(ctx);
  chain(osc(ctx, 'sine', freq * 0.66, at, 0.05), r, out);
  perc(r.gain, at, vol * 0.3, 0.0005, 0.03);
}

const VOWELS: readonly [number, number, number][] = [
  [800, 1200, 2500], // а
  [500, 900, 2400], // о
  [480, 1800, 2550], // э
  [300, 2200, 2950], // и
  [350, 700, 2350], // у
  [420, 1500, 2450], // ы
];

/** Шёпот: розовый шум через три форманты, слоги с фрикативами (с/ш), выдох в конце. */
function whisperInto(ctx: Ctx, out: AudioNode, rng: Rng, dur: number, voiced: boolean): void {
  const master = gain(ctx, 0.0001);
  chain(master, filter(ctx, 'highpass', voiced ? 180 : 320), out);
  const src = voiced ? osc(ctx, 'sawtooth', rng.range(100, 125), 0, dur) : noise(ctx, rng, dur, 'pink');
  if (voiced) {
    // интонация и «плывущая лента»
    const f = (src as OscillatorNode).frequency;
    let t = 0;
    while (t < dur) {
      f.linearRampToValueAtTime(rng.range(88, 132), t + 0.25);
      t += rng.range(0.2, 0.45);
    }
  }
  const fs: BiquadFilterNode[] = [];
  const amps = [1, 0.7, 0.35];
  for (let k = 0; k < 3; k++) {
    const bp = filter(ctx, 'bandpass', 500, voiced ? 9 : 6);
    const g = gain(ctx, amps[k]!);
    chain(src, bp, g, master);
    fs.push(bp);
  }
  if (voiced) {
    // немного шума поверх голоса — дыхание
    const br = gain(ctx, 0.15);
    chain(noise(ctx, rng, dur, 'pink'), filter(ctx, 'bandpass', 1800, 1), br, master);
  }
  const fric = gain(ctx, 0.0001);
  chain(noise(ctx, rng, dur), filter(ctx, 'highpass', rng.range(3800, 5200)), fric, out);

  let t = rng.range(0.02, 0.1);
  master.gain.setValueAtTime(0.0001, 0);
  while (t < dur - 0.25) {
    const syl = rng.range(0.09, 0.22);
    const v = rng.pick(VOWELS);
    for (let k = 0; k < 3; k++) {
      fs[k]!.frequency.setTargetAtTime(v[k]! * rng.range(0.92, 1.08), t, 0.02);
    }
    const peak = rng.range(0.5, 1);
    master.gain.setTargetAtTime(peak, t, 0.018);
    master.gain.setTargetAtTime(0.03, t + syl, 0.03);
    if (rng.chance(0.45)) {
      fric.gain.setTargetAtTime(rng.range(0.25, 0.55), Math.max(0, t - 0.04), 0.01);
      fric.gain.setTargetAtTime(0.0001, t + 0.02, 0.015);
    }
    t += syl + rng.range(0.02, rng.chance(0.2) ? 0.3 : 0.08);
  }
  // выдох
  master.gain.setTargetAtTime(0.25, dur - 0.3, 0.05);
  master.gain.setTargetAtTime(0.0001, dur - 0.12, 0.04);
}

function growlInto(ctx: Ctx, out: AudioNode, rng: Rng, dur: number, rise: number, vol: number): void {
  const amp = gain(ctx, 0);
  const lp = filter(ctx, 'lowpass', 420, 5);
  chain(lp, saturator(ctx, 3), amp, out);
  const base = rng.range(46, 56);
  const freqs = [base, base * 1.06, base * 0.5, base * 2.01];
  const types: OscillatorType[] = ['sawtooth', 'sawtooth', 'square', 'sawtooth'];
  const levels = [0.5, 0.4, 0.3, 0.12];
  freqs.forEach((f, i) => {
    const o = osc(ctx, types[i]!, f, 0, dur);
    o.frequency.linearRampToValueAtTime(f * rise, dur * 0.55);
    o.frequency.linearRampToValueAtTime(f * (rise * 0.85), dur);
    chain(o, gain(ctx, levels[i]!), lp);
  });
  // хрип: амплитудная модуляция шумом низкой частоты
  const rough = gain(ctx, 0.6);
  chain(noise(ctx, rng, dur, 'white'), filter(ctx, 'lowpass', 28), rough);
  rough.connect(amp.gain);
  // гармоника для динамиков телефона
  const harm = gain(ctx, 0.5);
  chain(lp, filter(ctx, 'peaking', 320, 1.2, 8), harm, amp);
  const breath = gain(ctx, 0);
  chain(noise(ctx, rng, dur, 'pink'), filter(ctx, 'bandpass', 900, 1.5), breath, out);
  ahr(breath.gain, 0, 0.25 * vol, 0.15, dur * 0.5, dur * 0.4);
  ahr(amp.gain, 0, vol, 0.2, dur * 0.45, dur * 0.4);
}

export const RECIPES: Record<ProcSoundId, Recipe> = {
  revolver: {
    dur: () => 1.6,
    build: (c, o, r) => gun(c, o, r, { crack: 0.9, bright: 2200, body: 0.22, bodyFrom: 4200, bodyTo: 260, thumpFrom: 150, thumpTo: 48, thump: 0.22, tail: 1.1, slap: 0.3, drive: 2.2 }),
  },
  shotgun: {
    dur: () => 2.2,
    build: (c, o, r) => gun(c, o, r, { crack: 1, bright: 1600, body: 0.42, bodyFrom: 3200, bodyTo: 160, thumpFrom: 110, thumpTo: 36, thump: 0.34, tail: 1.6, slap: 0.42, drive: 3 }),
  },
  rifle: {
    dur: () => 2.6,
    build: (c, o, r) => gun(c, o, r, { crack: 1.2, bright: 2800, body: 0.3, bodyFrom: 5200, bodyTo: 220, thumpFrom: 130, thumpTo: 40, thump: 0.3, tail: 2, slap: 0.55, drive: 2.6 }),
  },
  smg: {
    dur: () => 0.7,
    build: (c, o, r) => gun(c, o, r, { crack: 0.8, bright: 2600, body: 0.12, bodyFrom: 4600, bodyTo: 380, thumpFrom: 170, thumpTo: 60, thump: 0.12, tail: 0.4, slap: 0.18, drive: 2 }),
  },
  flaregun: {
    dur: () => 1.3,
    build: (c, o, r) => {
      const th = gain(c);
      const s = osc(c, 'sine', 210, 0, 0.12);
      sweep(s.frequency, 0, 210, 70, 0.1);
      chain(s, th, o);
      perc(th.gain, 0, 0.9, 0.002, 0.12);
      const pop = gain(c);
      chain(noise(c, r, 0.08), filter(c, 'bandpass', 1500, 1.2), pop, o);
      perc(pop.gain, 0, 0.6, 0.001, 0.06);
      const wh = gain(c, 0.0001);
      const bp = filter(c, 'bandpass', 900, 1.6);
      sweep(bp.frequency, 0.03, 900, 3600, 0.9);
      chain(noise(c, r, 1.2, 'pink'), bp, wh, o);
      ahr(wh.gain, 0.02, 0.5, 0.15, 0.3, 0.6);
    },
  },
  reload: {
    dur: () => 0.95,
    build: (c, o, r) => {
      click(c, o, r, 0, 3100, 0.6);
      for (let i = 0; i < 6; i++) click(c, o, r, 0.12 + i * 0.035, 4200, 0.18);
      click(c, o, r, 0.48, 2600, 0.5);
      const sl = gain(c, 0.0001);
      chain(noise(c, r, 0.2), filter(c, 'bandpass', 1800, 2), sl, o);
      ahr(sl.gain, 0.55, 0.2, 0.04, 0.05, 0.08);
      click(c, o, r, 0.7, 2200, 0.8);
    },
  },
  dryfire: { dur: () => 0.15, build: (c, o, r) => click(c, o, r, 0, 2900, 0.5) },
  swap: {
    dur: () => 0.4,
    build: (c, o, r) => {
      const g = gain(c);
      chain(noise(c, r, 0.2, 'pink'), filter(c, 'bandpass', 1100, 0.8), g, o);
      ahr(g.gain, 0, 0.35, 0.04, 0.06, 0.1);
      click(c, o, r, 0.22, 2500, 0.45);
    },
  },
  explosion: {
    dur: () => 4,
    build: (c, o, r) => {
      const sum = gain(c, 1);
      chain(sum, saturator(c, 3.5), o);
      const cr = gain(c);
      chain(noise(c, r, 0.1), filter(c, 'highpass', 1200), cr, sum);
      perc(cr.gain, 0, 1, 0.0005, 0.08);
      const body = gain(c);
      const lp = filter(c, 'lowpass', 5000, 0.8);
      sweep(lp.frequency, 0, 5000, 140, 1.9);
      chain(noise(c, r, 2.8), lp, body, sum);
      perc(body.gain, 0, 1, 0.002, 2.5);
      const sub = gain(c);
      const s = osc(c, 'sine', 72, 0, 1.4);
      sweep(s.frequency, 0, 72, 26, 0.9);
      chain(s, sub, sum);
      perc(sub.gain, 0, 1.3, 0.004, 1.3);
      const h = gain(c);
      const s2 = osc(c, 'triangle', 144, 0, 0.8);
      sweep(s2.frequency, 0, 144, 52, 0.6);
      chain(s2, h, sum);
      perc(h.gain, 0, 0.5, 0.004, 0.7);
      const rum = gain(c);
      chain(noise(c, r, 3.8, 'brown'), filter(c, 'lowpass', 260), rum, sum);
      ahr(rum.gain, 0.05, 0.8, 0.2, 0.6, 2.8);
      // осколки и треск горящего
      let t = 0.05;
      for (let i = 0; i < 70; i++) {
        t += r.range(0.005, 0.06) * (1 + i / 25);
        if (t > 3.6) break;
        const g = gain(c);
        chain(noise(c, r, 0.02), filter(c, 'bandpass', r.range(1500, 6000), 3), g, o);
        perc(g.gain, t, r.range(0.05, 0.35) * Math.exp(-t * 0.8), 0.0005, 0.012);
      }
      for (let i = 0; i < 4; i++) {
        const tt = r.range(0.4, 1.8);
        const g = gain(c);
        chain(osc(c, 'sine', r.range(80, 140), tt, 0.1), g, o);
        perc(g.gain, tt, 0.25, 0.002, 0.08);
      }
    },
  },
  fuse: {
    dur: () => 1.9,
    build: (c, o, r) => {
      const g = gain(c, 0.3);
      chain(noise(c, r, 1.9), filter(c, 'highpass', 3500), g, o);
      const am = gain(c, 0.3);
      chain(noise(c, r, 1.9), filter(c, 'lowpass', 60), am);
      am.connect(g.gain);
      for (let t = 0; t < 1.8; t += r.range(0.02, 0.09)) {
        const k = gain(c);
        chain(noise(c, r, 0.01), filter(c, 'bandpass', r.range(2000, 7000), 4), k, o);
        perc(k.gain, t, r.range(0.1, 0.4), 0.0003, 0.006);
      }
    },
  },
  stepGrass: {
    dur: () => 0.3,
    build: (c, o, r) => {
      const f = r.range(1100, 1700);
      const a = gain(c);
      chain(noise(c, r, 0.2), filter(c, 'bandpass', f * 1.4, 0.9), a, o);
      perc(a.gain, 0, 0.35, 0.002, 0.03);
      const b = gain(c);
      chain(noise(c, r, 0.25), filter(c, 'bandpass', f, 0.7), filter(c, 'lowpass', 4000), b, o);
      ahr(b.gain, 0.025, 0.6, 0.015, 0.03, 0.09);
      const th = gain(c);
      chain(osc(c, 'sine', r.range(80, 100), 0, 0.08), th, o);
      perc(th.gain, 0, 0.25, 0.003, 0.05);
    },
  },
  stepDirt: {
    dur: () => 0.25,
    build: (c, o, r) => {
      const b = gain(c);
      chain(noise(c, r, 0.2), filter(c, 'bandpass', r.range(700, 1000), 0.8), b, o);
      ahr(b.gain, 0, 0.6, 0.006, 0.02, 0.08);
      const th = gain(c);
      chain(osc(c, 'sine', r.range(70, 90), 0, 0.09), th, o);
      perc(th.gain, 0, 0.4, 0.003, 0.06);
    },
  },
  stepWood: {
    dur: () => 0.6,
    build: (c, o, r) => {
      const th = gain(c);
      chain(osc(c, 'sine', r.range(140, 180), 0, 0.1), th, o);
      perc(th.gain, 0, 0.7, 0.002, 0.07);
      const k = gain(c);
      chain(noise(c, r, 0.15), filter(c, 'bandpass', r.range(600, 800), 4), k, o);
      perc(k.gain, 0, 0.5, 0.001, 0.08);
      const hol = gain(c);
      chain(noise(c, r, 0.2), filter(c, 'bandpass', r.range(210, 260), 14), hol, o);
      perc(hol.gain, 0, 1.6, 0.002, 0.15);
      if (r.chance(0.6)) {
        // скрип доски
        const cr = gain(c, 0.0001);
        const so = osc(c, 'sawtooth', r.range(340, 420), 0.05, 0.4);
        so.frequency.linearRampToValueAtTime(r.range(260, 330), 0.42);
        chain(so, filter(c, 'bandpass', 900, 8), cr, o);
        ahr(cr.gain, 0.06, 0.12, 0.08, 0.12, 0.15);
      }
    },
  },
  stepMud: {
    dur: () => 0.35,
    build: (c, o, r) => {
      const g = gain(c);
      const bp = filter(c, 'bandpass', 500, 6);
      sweep(bp.frequency, 0, 450, 1400, 0.18);
      chain(noise(c, r, 0.25), bp, g, o);
      ahr(g.gain, 0, 0.7, 0.01, 0.05, 0.12);
      const th = gain(c);
      chain(osc(c, 'sine', 70, 0, 0.1), th, o);
      perc(th.gain, 0, 0.4, 0.005, 0.07);
    },
  },
  whisper: {
    dur: (r) => r.range(1.5, 2.6),
    build: (c, o, r, d) => whisperInto(c, o, r, d, false),
  },
  speakerVoice: {
    dur: (r) => r.range(2.2, 3.2),
    build: (c, o, r, d) => {
      // «громкоговоритель»: полоса 500–2800 Гц, перегруз, фон эфира
      const horn = gain(c, 1);
      chain(horn, filter(c, 'highpass', 480, 0.9), filter(c, 'lowpass', 2800, 1.2), filter(c, 'peaking', 1500, 1.5, 5), saturator(c, 4), gain(c, 0.7), o);
      whisperInto(c, horn, r, d, true);
      const st = gain(c, 0.06);
      chain(noise(c, r, d), filter(c, 'bandpass', 2200, 0.8), st, o);
    },
  },
  choir: {
    dur: () => 3.4,
    build: (c, o, r, d) => {
      // одиннадцать голосов на одном аккорде вальса, чуть вразнобой; гласная «а» → «у»
      const bus = gain(c, 0.0001);
      const f1 = filter(c, 'bandpass', 760, 3);
      const f2 = filter(c, 'bandpass', 1150, 4);
      bus.connect(f1).connect(o);
      bus.connect(f2).connect(gain(c, 0.6)).connect(o);
      sweep(f1.frequency, 0, 760, 380, d);
      sweep(f2.frequency, 0, 1150, 820, d);
      const chord = [110, 138.6, 164.8, 220];
      for (let i = 0; i < 11; i++) {
        const base = chord[i % chord.length]! * (1 + r.range(-0.012, 0.012));
        const v = osc(c, 'sawtooth', base, r.range(0, 0.25), d);
        v.frequency.linearRampToValueAtTime(base * r.range(0.97, 0.995), d);
        chain(v, gain(c, 0.06), bus);
      }
      chain(noise(c, r, d, 'pink'), filter(c, 'bandpass', 900, 1.2), gain(c, 0.05), bus);
      ahr(bus.gain, 0, 1, 0.6, d - 1.6, 0.9);
    },
  },
  screech: {
    dur: () => 0.9,
    build: (c, o, r) => {
      const amp = gain(c, 0.0001);
      chain(amp, filter(c, 'bandpass', 1700, 2), saturator(c, 4), o);
      const f0 = r.range(480, 620);
      for (const ratio of [1, 1.071]) {
        const so = osc(c, 'sawtooth', f0 * ratio, 0, 0.9);
        so.frequency.linearRampToValueAtTime(f0 * ratio * 1.8, 0.14);
        so.frequency.linearRampToValueAtTime(f0 * ratio * 1.25, 0.8);
        const mod = osc(c, 'sine', r.range(150, 220), 0, 0.9);
        const idx = gain(c, f0 * 1.2);
        chain(mod, idx);
        idx.connect(so.frequency);
        chain(so, gain(c, 0.5), amp);
      }
      const hiss = gain(c, 0.0001);
      chain(noise(c, r, 0.9), filter(c, 'bandpass', 3200, 1.5), hiss, o);
      ahr(hiss.gain, 0, 0.3, 0.03, 0.2, 0.4);
      ahr(amp.gain, 0, 0.7, 0.025, 0.25, 0.5);
    },
  },
  growl: { dur: (r) => r.range(1.6, 2.2), build: (c, o, r, d) => growlInto(c, o, r, d, 1.05, 0.7) },
  roar: { dur: () => 1.8, build: (c, o, r, d) => growlInto(c, o, r, d, 1.7, 1) },
  hit: {
    dur: () => 0.35,
    build: (c, o, r) => {
      const th = gain(c);
      const s = osc(c, 'sine', r.range(100, 130), 0, 0.12);
      sweep(s.frequency, 0, 120, 50, 0.1);
      chain(s, th, o);
      perc(th.gain, 0, 0.8, 0.001, 0.1);
      const wet = gain(c);
      chain(noise(c, r, 0.2), filter(c, 'lowpass', 1600), wet, o);
      perc(wet.gain, 0, 0.5, 0.001, 0.12);
      const sq = gain(c);
      const bp = filter(c, 'bandpass', 800, 5);
      sweep(bp.frequency, 0.01, 800, 260, 0.15);
      chain(noise(c, r, 0.2), bp, sq, o);
      ahr(sq.gain, 0.01, 0.6, 0.01, 0.03, 0.1);
    },
  },
  gore: {
    dur: () => 0.9,
    build: (c, o, r) => {
      for (let i = 0; i < 5; i++) {
        const t = r.range(0, 0.22);
        const g = gain(c);
        chain(noise(c, r, 0.12), filter(c, 'bandpass', r.range(350, 1500), 3), g, o);
        ahr(g.gain, t, r.range(0.3, 0.7), 0.004, 0.02, 0.07);
      }
      const th = gain(c);
      chain(osc(c, 'sine', 70, 0, 0.15), th, o);
      perc(th.gain, 0, 0.9, 0.002, 0.14);
      for (let i = 0; i < 3; i++) {
        const t = 0.3 + i * r.range(0.1, 0.18);
        const g = gain(c);
        const s = osc(c, 'sine', r.range(500, 800), t, 0.05);
        s.frequency.exponentialRampToValueAtTime(r.range(900, 1300), t + 0.04);
        chain(s, g, o);
        perc(g.gain, t, 0.15, 0.002, 0.04);
      }
    },
  },
  death: {
    dur: () => 1.2,
    build: (c, o, r) => {
      const g = gain(c, 0.0001);
      const bp = filter(c, 'bandpass', 500, 9);
      chain(noise(c, r, 1.2, 'pink'), bp, g, o);
      let t = 0;
      while (t < 1) {
        bp.frequency.setTargetAtTime(r.range(320, 950), t, 0.02);
        t += r.range(0.06, 0.12);
      }
      ahr(g.gain, 0, 2.5, 0.05, 0.5, 0.5);
      const moan = gain(c, 0.0001);
      const s = osc(c, 'sawtooth', r.range(170, 200), 0, 1.1);
      s.frequency.exponentialRampToValueAtTime(r.range(70, 90), 1);
      chain(s, filter(c, 'bandpass', 650, 4), moan, o);
      ahr(moan.gain, 0, 0.25, 0.05, 0.4, 0.5);
    },
  },
  hurt: {
    dur: () => 0.6,
    build: (c, o, r) => {
      const th = gain(c);
      const s = osc(c, 'sine', 80, 0, 0.3);
      sweep(s.frequency, 0, 80, 38, 0.25);
      chain(s, th, o);
      perc(th.gain, 0, 1, 0.002, 0.3);
      const n = gain(c);
      chain(noise(c, r, 0.3, 'brown'), filter(c, 'lowpass', 500), n, o);
      perc(n.gain, 0, 0.8, 0.002, 0.25);
      const gasp = gain(c, 0.0001);
      chain(noise(c, r, 0.5, 'pink'), filter(c, 'bandpass', 1300, 2), gasp, o);
      ahr(gasp.gain, 0.08, 0.3, 0.05, 0.05, 0.25);
    },
  },
  heartbeat: {
    dur: () => 0.6,
    build: (c, o) => {
      const beat = (t: number, v: number): void => {
        for (const [f, k] of [[52, 1], [104, 0.4], [156, 0.15]] as const) {
          const g = gain(c);
          chain(osc(c, 'sine', f, t, 0.14), g, o);
          perc(g.gain, t, v * k, 0.008, 0.12);
        }
      };
      beat(0, 1);
      beat(0.24, 0.72);
    },
  },
  sting: {
    dur: () => 2,
    build: (c, o, r) => {
      const sum = gain(c, 1);
      chain(sum, filter(c, 'highpass', 160), saturator(c, 5), gain(c, 0.55), o);
      const cluster = [233, 247, 262, 277, 311, 370, 466, 494];
      for (const f of cluster) {
        const so = osc(c, 'sawtooth', f * r.range(0.99, 1.01), 0, 1.9);
        so.frequency.exponentialRampToValueAtTime(f * 1.55, 0.35);
        so.frequency.exponentialRampToValueAtTime(f * 1.4, 1.8);
        const g = gain(c);
        chain(so, g, sum);
        ahr(g.gain, 0, 0.16, 0.004, 0.45, 1.3);
      }
      const n = gain(c);
      const bp = filter(c, 'bandpass', 1200, 1.5);
      sweep(bp.frequency, 0, 1200, 4800, 0.4);
      chain(noise(c, r, 1.6), bp, n, sum);
      ahr(n.gain, 0, 0.5, 0.003, 0.3, 1);
      const sub = gain(c);
      const s = osc(c, 'sine', 64, 0, 0.6);
      sweep(s.frequency, 0, 64, 30, 0.5);
      chain(s, sub, o);
      perc(sub.gain, 0, 1, 0.003, 0.55);
    },
  },
  /**
   * Удар скримера. Рефлекс испуга срабатывает на громкий широкополосный звук с почти мгновенным
   * нарастанием (единицы миллисекунд): чем медленнее фронт, тем слабее вздрагивание. Поэтому —
   * белый шум с фронтом 1 мс, «удар в грудь» на 50 Гц и металлический визг сверху. Никаких аккордов.
   */
  shock: {
    dur: () => 1.3,
    build: (c, o, r) => {
      // широкополосный удар
      const n = gain(c, 0.0001);
      chain(noise(c, r, 1.2), filter(c, 'highpass', 180), saturator(c, 8), n, o);
      n.gain.setValueAtTime(0.0001, 0);
      n.gain.linearRampToValueAtTime(1, 0.001);
      n.gain.exponentialRampToValueAtTime(0.25, 0.09);
      n.gain.exponentialRampToValueAtTime(0.0001, 0.7);
      // удар в грудь
      const sub = gain(c, 0.0001);
      const s = osc(c, 'sine', 58, 0, 0.8);
      s.frequency.exponentialRampToValueAtTime(26, 0.6);
      chain(s, saturator(c, 3), sub, o);
      sub.gain.setValueAtTime(0.0001, 0);
      sub.gain.linearRampToValueAtTime(1.1, 0.002);
      sub.gain.exponentialRampToValueAtTime(0.0001, 0.75);
      // металлический визг: несогласные частоты, дрожат и сползают вниз
      const scr = gain(c, 0.0001);
      chain(scr, filter(c, 'highpass', 900), saturator(c, 4), gain(c, 0.5), o);
      for (const f of [1870, 2630, 3390, 4410]) {
        const so = osc(c, 'square', f * r.range(0.97, 1.03), 0, 1.2);
        so.frequency.exponentialRampToValueAtTime(f * 0.62, 1.1);
        const vib = osc(c, 'sine', r.range(17, 26), 0, 1.2);
        const vg = gain(c, f * 0.04);
        chain(vib, vg);
        vg.connect(so.frequency);
        chain(so, gain(c, 0.12), scr);
      }
      scr.gain.setValueAtTime(0.0001, 0);
      scr.gain.linearRampToValueAtTime(0.9, 0.003);
      scr.gain.exponentialRampToValueAtTime(0.3, 0.35);
      scr.gain.exponentialRampToValueAtTime(0.0001, 1.2);
    },
  },
  swell: {
    dur: () => 1.7,
    build: (c, o, r) => {
      const g = gain(c, 0.0001);
      chain(noise(c, r, 1.6), filter(c, 'highpass', 2800), filter(c, 'peaking', 6500, 1, 6), g, o);
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.45, 1.45);
      g.gain.setValueAtTime(0.0001, 1.46);
      const lo = gain(c, 0.0001);
      const s = osc(c, 'sine', 40, 0, 1.5);
      s.frequency.linearRampToValueAtTime(58, 1.45);
      chain(s, lo, o);
      lo.gain.exponentialRampToValueAtTime(0.5, 1.4);
      lo.gain.setValueAtTime(0.0001, 1.46);
    },
  },
  branch: {
    dur: () => 0.5,
    build: (c, o, r) => {
      for (const t of [0, r.range(0.015, 0.03), r.range(0.05, 0.08)]) {
        const g = gain(c);
        chain(noise(c, r, 0.03), filter(c, 'bandpass', r.range(2000, 3200), 2), g, o);
        perc(g.gain, t, r.range(0.4, 0.8), 0.0004, 0.012);
      }
      const res = gain(c);
      chain(noise(c, r, 0.15), filter(c, 'bandpass', r.range(800, 1100), 7), res, o);
      perc(res.gain, 0, 1, 0.001, 0.1);
    },
  },
  reel: {
    dur: () => 1.3,
    build: (c, o, r) => {
      const cl = gain(c);
      chain(osc(c, 'sine', 180, 0, 0.1), cl, o);
      perc(cl.gain, 0, 0.6, 0.001, 0.06);
      click(c, o, r, 0, 1200, 0.5);
      click(c, o, r, 0.16, 2400, 0.4);
      const m = gain(c, 0.0001);
      const so = osc(c, 'sawtooth', 60, 0.2, 1.1);
      so.frequency.exponentialRampToValueAtTime(120, 0.8);
      chain(so, filter(c, 'lowpass', 420, 3), m, o);
      ahr(m.gain, 0.2, 0.25, 0.2, 0.4, 0.4);
    },
  },
  pickup: {
    dur: () => 0.5,
    build: (c, o, r) => {
      for (const [f, v] of [[1320, 0.3], [2140, 0.2], [3010, 0.08]] as const) {
        const g = gain(c);
        chain(osc(c, 'sine', f, 0.01, 0.4), g, o);
        perc(g.gain, 0.01, v, 0.001, 0.35);
      }
      click(c, o, r, 0, 2000, 0.4);
    },
  },
  ui: {
    dur: () => 0.12,
    build: (c, o, r) => {
      const g = gain(c);
      chain(osc(c, 'square', 660, 0, 0.05), filter(c, 'lowpass', 2400), g, o);
      perc(g.gain, 0, 0.15, 0.001, 0.04);
      click(c, o, r, 0, 3000, 0.2);
    },
  },
  static: {
    dur: () => 1.4,
    build: (c, o, r) => {
      const g = gain(c, 0.0001);
      chain(noise(c, r, 1.4), filter(c, 'bandpass', 2400, 0.7), g, o);
      ahr(g.gain, 0, 0.5, 0.01, 0.9, 0.4);
      const am = gain(c, 0.4);
      chain(noise(c, r, 1.4), filter(c, 'lowpass', 30), am);
      am.connect(g.gain);
      for (let t = 0; t < 1.3; t += r.range(0.01, 0.07)) {
        const k = gain(c);
        chain(noise(c, r, 0.01), k, o);
        perc(k.gain, t, r.range(0.1, 0.5), 0.0003, 0.004);
      }
    },
  },
  cricket: {
    dur: () => 0.3,
    build: (c, o, r) => {
      const f = r.range(4200, 4800);
      const pulses = r.int(3, 4);
      for (let i = 0; i < pulses; i++) {
        const t = i * 0.032;
        const g = gain(c);
        chain(osc(c, 'sine', f, t, 0.03), g, o);
        ahr(g.gain, t, 0.2, 0.004, 0.01, 0.008);
      }
    },
  },
  frog: {
    dur: () => 0.6,
    build: (c, o, r) => {
      const g = gain(c, 0.0001);
      const so = osc(c, 'sawtooth', r.range(120, 160), 0, 0.45);
      so.frequency.linearRampToValueAtTime(r.range(95, 115), 0.4);
      chain(so, filter(c, 'bandpass', 620, 4), g, o);
      for (let t = 0; t < 0.4; t += 0.04) {
        g.gain.setValueAtTime(0.35, t);
        g.gain.setTargetAtTime(0.0001, t + 0.012, 0.008);
      }
    },
  },
  splash: {
    dur: () => 0.9,
    build: (c, o, r) => {
      const g = gain(c);
      const bp = filter(c, 'bandpass', 1400, 1.2);
      sweep(bp.frequency, 0, 1400, 380, 0.4);
      chain(noise(c, r, 0.6), bp, g, o);
      ahr(g.gain, 0, 0.7, 0.005, 0.05, 0.35);
      for (let i = 0; i < 4; i++) {
        const t = r.range(0.1, 0.6);
        const b = gain(c);
        const s = osc(c, 'sine', r.range(350, 500), t, 0.06);
        s.frequency.exponentialRampToValueAtTime(r.range(800, 1200), t + 0.05);
        chain(s, b, o);
        perc(b.gain, t, 0.12, 0.002, 0.05);
      }
    },
  },
  bounce: {
    dur: () => 0.25,
    build: (c, o, r) => {
      const g = gain(c);
      chain(osc(c, 'sine', r.range(200, 240), 0, 0.08), g, o);
      perc(g.gain, 0, 0.5, 0.001, 0.05);
      const n = gain(c);
      chain(noise(c, r, 0.08), filter(c, 'bandpass', 900, 2), n, o);
      perc(n.gain, 0, 0.3, 0.001, 0.04);
    },
  },
  knock: {
    // три удара костяшками в бревенчатую дверь: глухой удар + резонанс доски
    dur: () => 1.2,
    build: (c, o, r) => {
      for (const t of [0, r.range(0.26, 0.3), r.range(0.54, 0.6)]) {
        const th = gain(c);
        const s = osc(c, 'sine', r.range(110, 130), t, 0.12);
        sweep(s.frequency, t, 130, 80, 0.06);
        chain(s, th, o);
        perc(th.gain, t, 0.9, 0.002, 0.09);
        const wd = gain(c);
        chain(noise(c, r, 0.1), filter(c, 'bandpass', r.range(650, 850), 5), wd, o);
        perc(wd.gain, t, 0.7, 0.001, 0.07);
        const res = gain(c);
        chain(noise(c, r, 0.2), filter(c, 'bandpass', 210, 16), res, o);
        perc(res.gain, t, 2.2, 0.002, 0.16);
      }
    },
  },
  creak: {
    // медленный скрип петель: «смычок» по пиле через узкие резонансы
    dur: () => 2.2,
    build: (c, o, r) => {
      const g = gain(c, 0.0001);
      const so = osc(c, 'sawtooth', r.range(90, 120), 0, 2.1);
      let t = 0;
      while (t < 2) {
        so.frequency.linearRampToValueAtTime(r.range(70, 160), t + 0.15);
        t += r.range(0.08, 0.2);
      }
      const am = gain(c, 0.5);
      chain(noise(c, r, 2.1), filter(c, 'lowpass', 35), am);
      am.connect(g.gain);
      chain(so, filter(c, 'bandpass', r.range(700, 1100), 9), filter(c, 'peaking', 1800, 4, 6), g, o);
      ahr(g.gain, 0.05, 0.35, 0.3, 1.0, 0.6);
    },
  },
  slam: {
    dur: () => 1.8,
    build: (c, o, r) => {
      const sum = gain(c, 1);
      chain(sum, saturator(c, 3), o);
      const th = gain(c);
      const s = osc(c, 'sine', 95, 0, 0.4);
      sweep(s.frequency, 0, 95, 38, 0.3);
      chain(s, th, sum);
      perc(th.gain, 0, 1.2, 0.002, 0.35);
      const wd = gain(c);
      chain(noise(c, r, 0.4), filter(c, 'lowpass', 1800), wd, sum);
      perc(wd.gain, 0, 1, 0.001, 0.25);
      for (let i = 0; i < 6; i++) {
        // дребезг стекла и петель
        const t = 0.05 + i * r.range(0.04, 0.09);
        const k = gain(c);
        chain(noise(c, r, 0.03), filter(c, 'bandpass', r.range(2500, 5000), 8), k, o);
        perc(k.gain, t, 0.3 * (1 - i / 6), 0.0005, 0.03);
      }
    },
  },
  scratch: {
    // ногти по брёвнам: рваный высокочастотный шум с «зацепами»
    dur: (r) => r.range(0.7, 1.2),
    build: (c, o, r, d) => {
      const g = gain(c, 0.0001);
      const bp = filter(c, 'bandpass', r.range(2500, 3800), 3);
      chain(noise(c, r, d), bp, g, o);
      let t = 0;
      while (t < d - 0.05) {
        g.gain.setTargetAtTime(r.range(0.2, 0.9), t, 0.005);
        g.gain.setTargetAtTime(0.02, t + r.range(0.02, 0.06), 0.01);
        bp.frequency.setTargetAtTime(r.range(2000, 4500), t, 0.02);
        t += r.range(0.03, 0.09);
      }
      g.gain.setTargetAtTime(0.0001, d - 0.05, 0.01);
    },
  },
  tapestop: {
    // «плёнку остановили»: аккорд и шум падают по высоте до гула
    dur: () => 1.4,
    build: (c, o, r) => {
      const sum = gain(c, 0.0001);
      const lp = filter(c, 'lowpass', 4000, 1);
      sweep(lp.frequency, 0, 4000, 120, 0.9);
      chain(sum, lp, saturator(c, 2), o);
      for (const f of [220, 261.6, 329.6, 110]) {
        const so = osc(c, 'sawtooth', f, 0, 1.3);
        so.frequency.setValueAtTime(f, 0);
        so.frequency.exponentialRampToValueAtTime(f * 0.12, 0.95);
        chain(so, gain(c, 0.2), sum);
      }
      const n = gain(c, 0.3);
      chain(noise(c, r, 1.3), filter(c, 'bandpass', 1800, 0.8), n, sum);
      sum.gain.setValueAtTime(0.0001, 0);
      sum.gain.linearRampToValueAtTime(0.7, 0.02);
      sum.gain.setTargetAtTime(0.0001, 0.9, 0.12);
      // щелчок механизма в конце
      const k = gain(c);
      chain(noise(c, r, 0.03), filter(c, 'bandpass', 2600, 6), k, o);
      perc(k.gain, 1.0, 0.6, 0.0005, 0.02);
    },
  },
  scream: {
    // нечеловеческий крик: два голоса с быстрым вибрато через форманту «а», перегруз
    dur: () => 1.5,
    build: (c, o, r) => {
      const amp = gain(c, 0.0001);
      const sat = saturator(c, 6);
      chain(amp, filter(c, 'highpass', 220), sat, gain(c, 0.6), o);
      const formants: [number, number][] = [[850, 1], [1250, 0.7], [2600, 0.45], [3400, 0.25]];
      const voices = [r.range(380, 440), r.range(520, 600)];
      for (const f0 of voices) {
        const so = osc(c, 'sawtooth', f0, 0, 1.5);
        so.frequency.linearRampToValueAtTime(f0 * 1.45, 0.18);
        so.frequency.linearRampToValueAtTime(f0 * 1.2, 1.3);
        const vib = osc(c, 'sine', r.range(11, 15), 0, 1.5);
        const vg = gain(c, f0 * 0.06);
        chain(vib, vg);
        vg.connect(so.frequency);
        for (const [ff, k] of formants) chain(so, filter(c, 'bandpass', ff * r.range(0.95, 1.05), 7), gain(c, k * 0.6), amp);
      }
      const br = gain(c, 0.0001);
      chain(noise(c, r, 1.5), filter(c, 'bandpass', 2400, 1), br, o);
      ahr(br.gain, 0, 0.35, 0.01, 0.6, 0.6);
      const rough = gain(c, 0.35);
      chain(noise(c, r, 1.5), filter(c, 'lowpass', 70), rough);
      rough.connect(amp.gain);
      ahr(amp.gain, 0, 0.9, 0.012, 0.75, 0.6);
    },
  },
};
