import type { ProcTextureId } from '../content/assets';
import { Rng } from '../core/rng';
import { clamp, lerp, smoothstep } from '../core/math';
import { fbm, ridged, valueNoise, worley } from './noise';

/**
 * Генераторы текстур: чистые функции (id, size, seed) → RGBA8. Тайлятся бесшовно.
 * Принцип «естественности»: каждый слой имеет физический смысл (волокна, стыки, износ, сырость),
 * палитра узкая и приглушённая — финальное единство даёт пост-обработка (палитра + дизеринг).
 */
export interface TexData {
  size: number;
  data: Uint8Array;
}

type Px = (u: number, v: number, out: number[]) => void;

function paint(size: number, fn: Px): TexData {
  const data = new Uint8Array(size * size * 4);
  const c = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      c[3] = 255;
      fn(x / size, y / size, c);
      const i = (y * size + x) * 4;
      data[i] = clamp(c[0]!, 0, 255);
      data[i + 1] = clamp(c[1]!, 0, 255);
      data[i + 2] = clamp(c[2]!, 0, 255);
      data[i + 3] = clamp(c[3]!, 0, 255);
    }
  }
  return { size, data };
}

const mix3 = (out: number[], a: readonly number[], b: readonly number[], t: number): void => {
  out[0] = lerp(a[0]!, b[0]!, t);
  out[1] = lerp(a[1]!, b[1]!, t);
  out[2] = lerp(a[2]!, b[2]!, t);
};
const mul = (out: number[], k: number): void => {
  out[0]! *= k;
  out[1]! *= k;
  out[2]! *= k;
};

const F2 = new Float32Array(2);

const GEN: Record<ProcTextureId, (size: number, seed: number) => TexData> = {
  /** Нейтральная детализация земли: цвет даёт вершинная раскраска рельефа (трава/тропа/ил). */
  ground: (size, seed) =>
    paint(size, (u, v, c) => {
      const P = 8;
      const n = fbm(u * P, v * P, seed, 4, P);
      const blades = ridged(u * 32, v * 32 * 0.35, seed + 3, 2, 32);
      const pebble = worley(u * 16, v * 16, seed + 7, 16);
      let k = 0.72 + (n - 0.5) * 0.5 + (blades - 0.5) * 0.28;
      if (pebble < 0.16) k *= 0.82 + pebble;
      const g = 200 * k;
      c[0] = g;
      c[1] = g * 1.02;
      c[2] = g * 0.94;
    }),

  bark: (size, seed) =>
    paint(size, (u, v, c) => {
      const P = 4;
      const furrow = ridged(u * P * 2, v * P * 0.5, seed, 3, P * 2);
      const n = fbm(u * 16, v * 16, seed + 1, 3, 16);
      const k = 0.35 + furrow * 0.45 + (n - 0.5) * 0.2;
      mix3(c, [38, 30, 24], [96, 82, 66], k);
    }),

  birch: (size, seed) =>
    paint(size, (u, v, c) => {
      const lent = valueNoise(u * 3, v * 22, seed, 3);
      const n = fbm(u * 12, v * 12, seed + 5, 3, 12);
      mix3(c, [196, 192, 180], [226, 222, 210], n);
      if (lent > 0.72) mix3(c, [c[0]!, c[1]!, c[2]!], [28, 26, 24], smoothstep(0.72, 0.8, lent));
    }),

  needles: (size, seed) =>
    paint(size, (u, v, c) => {
      const P = 8;
      const clump = fbm(u * P, v * P, seed, 4, P);
      const strands = ridged(u * 40, v * 40, seed + 2, 2, 40);
      const k = clump * 0.7 + strands * 0.3;
      mix3(c, [14, 24, 18], [52, 70, 48], k);
    }),

  /** Бревенчатый сруб: горизонтальные брёвна, тёмные пазы с мхом, торцевые трещины. */
  logs: (size, seed) =>
    paint(size, (u, v, c) => {
      const rows = 5;
      const fy = v * rows;
      const row = Math.floor(fy);
      const ly = fy - row;
      const round = Math.sin(ly * Math.PI); // профиль бревна
      const grain = ridged(u * 3 + row * 7.3, ly * 2, seed + row, 3, 3);
      const n = fbm(u * 16, v * 16, seed + 9, 3, 16);
      const k = 0.25 + round * 0.55 + (grain - 0.5) * 0.3 + (n - 0.5) * 0.2;
      mix3(c, [34, 26, 20], [118, 96, 72], k);
      // сырость — снизу каждого бревна темнее
      mul(c, lerp(0.75, 1, smoothstep(0.0, 0.5, ly)));
      // мох в пазах
      if (ly < 0.12 || ly > 0.92) {
        const moss = fbm(u * 24, v * 24, seed + 4, 2, 24);
        mix3(c, [c[0]!, c[1]!, c[2]!], [40, 52, 30], moss * 0.8);
        mul(c, 0.6);
      }
    }),

  /** Доски пристани/радиоузла: волокна, щели, гвозди, серое выветривание. */
  planks: (size, seed) =>
    paint(size, (u, v, c) => {
      const cols = 4;
      const fx = u * cols;
      const col = Math.floor(fx);
      const lx = fx - col;
      const off = valueNoise(col * 3.1, 0, seed + 3) * 2;
      const grain = fbm(lx * 2, (v + off) * 14, seed + col * 13, 3);
      const fine = ridged(lx * 8, (v + off) * 40, seed + 1, 2);
      const weather = fbm(u * 6, v * 6, seed + 8, 3, 6);
      const k = 0.3 + grain * 0.45 + fine * 0.15;
      mix3(c, [46, 40, 34], [128, 118, 102], k);
      mix3(c, [c[0]!, c[1]!, c[2]!], [104, 104, 100], weather * 0.4); // серение дерева
      if (lx < 0.04 || lx > 0.96) mul(c, 0.3);
      const nailV = ((v + off * 0.5) * 2) % 1;
      if ((Math.abs(lx - 0.5) < 0.05 && Math.abs(nailV - 0.1) < 0.02)) {
        c[0] = 58;
        c[1] = 40;
        c[2] = 30;
      }
    }),

  /** Кровля: старый шифер с волной, лишайник и подтёки вниз по скату. */
  roof: (size, seed) =>
    paint(size, (u, v, c) => {
      const wave = Math.sin(u * Math.PI * 2 * 6) * 0.5 + 0.5;
      const rowV = (v * 4) % 1;
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const streak = fbm(u * 24, v * 2, seed + 2, 3, 24);
      let k = 0.38 + wave * 0.22 + (n - 0.5) * 0.25 - streak * 0.15;
      if (rowV < 0.05) k *= 0.55;
      mix3(c, [44, 46, 46], [126, 126, 120], k);
      const lichen = fbm(u * 12, v * 12, seed + 6, 3, 12);
      if (lichen > 0.62) mix3(c, [c[0]!, c[1]!, c[2]!], [98, 104, 70], smoothstep(0.62, 0.75, lichen) * 0.7);
    }),

  /** Ржавый металл бочек и столба. */
  metal: (size, seed) =>
    paint(size, (u, v, c) => {
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const rust = fbm(u * 6 + 3, v * 6, seed + 1, 4, 6);
      const drip = fbm(u * 20, v * 2.5, seed + 2, 2, 20);
      mix3(c, [44, 54, 46], [74, 86, 74], n);
      const r = smoothstep(0.5, 0.7, rust + (drip - 0.5) * 0.4);
      mix3(c, [c[0]!, c[1]!, c[2]!], [96, 50, 28], r);
    }),

  /** Кожа существ: бледная, с венами и пятнами. */
  skin: (size, seed) =>
    paint(size, (u, v, c) => {
      const n = fbm(u * 6, v * 6, seed, 4, 6);
      const vein = ridged(u * 10, v * 10, seed + 3, 3, 10);
      const blot = worley(u * 5, v * 5, seed + 9, 5, F2);
      mix3(c, [104, 98, 90], [168, 160, 148], n);
      if (vein > 0.86) mix3(c, [c[0]!, c[1]!, c[2]!], [70, 56, 64], (vein - 0.86) * 6);
      if (blot < 0.2) mul(c, 0.85);
    }),

  cloth: (size, seed) =>
    paint(size, (u, v, c) => {
      const weave = (Math.sin(u * size * 1.2) * Math.sin(v * size * 1.2)) * 0.5 + 0.5;
      const n = fbm(u * 6, v * 6, seed, 3, 6);
      const k = 0.4 + n * 0.45 + weave * 0.1;
      mix3(c, [34, 34, 36], [86, 84, 80], k);
    }),

  /** Нормали воды: мелкая рябь (RGB = нормаль в касательном пространстве). */
  waterNormal: (size, seed) => {
    const h = (u: number, v: number): number => fbm(u * 8, v * 8, seed, 4, 8);
    const e = 1 / size;
    return paint(size, (u, v, c) => {
      const dx = (h(u + e, v) - h(u - e, v)) * 6;
      const dy = (h(u, v + e) - h(u, v - e)) * 6;
      const l = Math.hypot(dx, dy, 1);
      c[0] = (-dx / l * 0.5 + 0.5) * 255;
      c[1] = (-dy / l * 0.5 + 0.5) * 255;
      c[2] = (1 / l * 0.5 + 0.5) * 255;
    });
  },
};

export function generateTexture(id: ProcTextureId, size: number, seed: number): TexData {
  const gen = GEN[id];
  return gen(size, seed);
}

/** Стабильный сид из id (чтобы замена одного генератора не сдвигала остальные). */
export function seedFor(id: string, base: number): number {
  let h = base >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return new Rng(h).u32();
}
