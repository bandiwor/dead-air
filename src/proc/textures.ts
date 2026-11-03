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

/*
 * Правило бесшовности: по каждой оси частота шума — целое число и равна периоду
 * (u, v ∈ [0,1) → u*f с периодом f). Для растянутых узоров период задаётся по осям отдельно.
 */
const GEN: Record<ProcTextureId, (size: number, seed: number) => TexData> = {
  /** Нейтральная детализация земли: цвет даёт вершинная раскраска рельефа (трава/тропа/ил). */
  ground: (size, seed) =>
    paint(size, (u, v, c) => {
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const blades = ridged(u * 32, v * 11, seed + 3, 2, 32, 11);
      const pebble = worley(u * 16, v * 16, seed + 7, 16);
      let k = 0.72 + (n - 0.5) * 0.5 + (blades - 0.5) * 0.28;
      if (pebble < 0.16) k *= 0.82 + pebble;
      const g = 200 * k;
      c[0] = g;
      c[1] = g * 1.02;
      c[2] = g * 0.94;
    }),

  /** Кора ели: вертикальные борозды, чешуйки, тёмные щели. */
  bark: (size, seed) =>
    paint(size, (u, v, c) => {
      const furrow = ridged(u * 8, v * 2, seed, 3, 8, 2);
      const scales = worley(u * 10, v * 6, seed + 4, 10, F2);
      const crack = F2[1]! - F2[0]!;
      const n = fbm(u * 16, v * 16, seed + 1, 3, 16);
      let k = 0.3 + furrow * 0.45 + (n - 0.5) * 0.2;
      if (crack < 0.06) k *= 0.55 + crack * 6;
      mix3(c, [34, 27, 21], [100, 84, 66], k);
      void scales;
    }),

  /** Берёза: белая береста, неровные горизонтальные чечевички, редкие чёрные наросты. */
  birch: (size, seed) =>
    paint(size, (u, v, c) => {
      const n = fbm(u * 6, v * 6, seed + 5, 3, 6);
      const peel = fbm(u * 4, v * 16, seed + 9, 2, 4, 16);
      mix3(c, [184, 180, 168], [226, 222, 208], n);
      if (peel > 0.62) mix3(c, [c[0]!, c[1]!, c[2]!], [196, 178, 150], smoothstep(0.62, 0.72, peel) * 0.6);
      // чечевички: в ячейках сетки 4×14 — случайной длины, сдвига и толщины, не в каждой
      const gx = u * 4;
      const gy = v * 14;
      const cx = Math.floor(gx);
      const cy = Math.floor(gy);
      const h1 = valueNoise(cx + 0.5, cy + 0.5, seed + 11, 0, 0);
      if (h1 > 0.5) {
        const fx = gx - cx;
        const fy = gy - cy;
        const len = 0.25 + h1 * 0.45;
        const ox = valueNoise(cx + 0.5, cy + 0.5, seed + 12, 0, 0) * (1 - len);
        const oy = 0.3 + valueNoise(cx + 0.5, cy + 0.5, seed + 13, 0, 0) * 0.4;
        const th = 0.05 + (h1 - 0.5) * 0.1;
        const dxl = (fx - ox) / len;
        if (dxl > 0 && dxl < 1 && Math.abs(fy - oy) < th * Math.sin(dxl * Math.PI)) mix3(c, [c[0]!, c[1]!, c[2]!], [26, 24, 22], 0.9);
      }
      const knot = worley(u * 2, v * 3, seed + 21, 2, F2);
      if (knot < 0.06) mix3(c, [c[0]!, c[1]!, c[2]!], [22, 20, 18], smoothstep(0.06, 0.02, knot) * 0.85);
    }),

  needles: (size, seed) =>
    paint(size, (u, v, c) => {
      const clump = fbm(u * 8, v * 8, seed, 4, 8);
      const strands = ridged(u * 40, v * 40, seed + 2, 2, 40);
      const k = clump * 0.7 + strands * 0.3;
      mix3(c, [14, 24, 18], [52, 70, 48], k);
    }),

  /** Бревенчатый сруб: горизонтальные брёвна, тёмные пазы с мхом, волокна. */
  logs: (size, seed) =>
    paint(size, (u, v, c) => {
      const rows = 5;
      const fy = v * rows;
      const row = Math.floor(fy) % rows;
      const ly = fy - Math.floor(fy);
      const round = Math.sin(ly * Math.PI); // профиль бревна
      const grain = ridged(u * 3, ly * 2, seed + row, 3, 3, 0);
      const n = fbm(u * 16, v * 16, seed + 9, 3, 16);
      const k = 0.25 + round * 0.55 + (grain - 0.5) * 0.3 + (n - 0.5) * 0.2;
      mix3(c, [34, 26, 20], [118, 96, 72], k);
      // паз между брёвнами — тёмный с обеих сторон, со мхом
      const edge = Math.min(ly, 1 - ly);
      if (edge < 0.1) {
        const moss = fbm(u * 24, v * 24, seed + 4, 2, 24);
        mix3(c, [c[0]!, c[1]!, c[2]!], [40, 52, 30], moss * 0.8);
        mul(c, 0.45 + edge * 4);
      }
      // продольные трещины усушки — тонкие, вдоль бревна, у каждого бревна свои
      const cr = valueNoise(u * 4, 0.5 + row * 3.7, seed + 40, 4, 0);
      if (Math.abs(ly - 0.35 - cr * 0.3) < 0.018 && cr > 0.45) mul(c, 0.55);
    }),

  /** Доски: волокна, щели, стыки досок на разной высоте, гвозди у стыков, серое выветривание. */
  planks: (size, seed) =>
    paint(size, (u, v, c) => {
      const cols = 4;
      const fx = u * cols;
      const col = Math.floor(fx) % cols;
      const lx = fx - Math.floor(fx);
      const off = valueNoise(col + 0.5, 0.5, seed + 3, 0, 0) * 2;
      const grain = fbm(lx * 2, (v + off) * 14, seed + col * 13, 3, 0, 2, 0.5, 14);
      const fine = ridged(lx * 8, (v + off) * 40, seed + 1, 2, 0, 40);
      const weather = fbm(u * 6, v * 6, seed + 8, 3, 6);
      const k = 0.3 + grain * 0.45 + fine * 0.15;
      mix3(c, [46, 40, 34], [128, 118, 102], k);
      mix3(c, [c[0]!, c[1]!, c[2]!], [104, 104, 100], weather * 0.4);
      if (lx < 0.04 || lx > 0.96) mul(c, 0.3);
      // стык досок: у каждой своя высота
      const joint = valueNoise(col + 0.5, 1.5, seed + 5, 0, 0);
      const dv = Math.abs(((v - joint + 1.5) % 1) - 0.5);
      if (dv > 0.492) mul(c, 0.35);
      if (dv > 0.46 && dv < 0.475 && Math.abs(lx - 0.5) < 0.06) {
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
      const streak = fbm(u * 24, v * 2, seed + 2, 3, 24, 2, 0.5, 2);
      let k = 0.38 + wave * 0.22 + (n - 0.5) * 0.25 - streak * 0.15;
      if (rowV < 0.05) k *= 0.55;
      mix3(c, [44, 46, 46], [126, 126, 120], k);
      const lichen = fbm(u * 12, v * 12, seed + 6, 3, 12);
      if (lichen > 0.62) mix3(c, [c[0]!, c[1]!, c[2]!], [98, 104, 70], smoothstep(0.62, 0.75, lichen) * 0.7);
    }),

  /** Ржавый металл бочек и столба: краска, ржавчина с мягким краем, подтёки, точки коррозии. */
  metal: (size, seed) =>
    paint(size, (u, v, c) => {
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const rust = fbm(u * 6 + 3, v * 6, seed + 1, 4, 6);
      const drip = fbm(u * 20, v * 3, seed + 2, 2, 20, 2, 0.5, 3);
      mix3(c, [44, 54, 46], [74, 86, 74], n);
      const r = smoothstep(0.45, 0.78, rust + (drip - 0.5) * 0.45);
      mix3(c, [c[0]!, c[1]!, c[2]!], [92, 48, 26], r);
      const pit = worley(u * 24, v * 24, seed + 7, 24);
      if (pit < 0.07) mix3(c, [c[0]!, c[1]!, c[2]!], [40, 22, 14], 0.7);
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

  /** Ткань: грубое плетение, складки, потёртости и грязь. */
  cloth: (size, seed) =>
    paint(size, (u, v, c) => {
      const weave = (Math.sin(u * Math.PI * 2 * 32) * Math.sin(v * Math.PI * 2 * 32)) * 0.5 + 0.5;
      const thread = Math.sin((u + v) * Math.PI * 2 * 48) * 0.5 + 0.5;
      const fold = fbm(u * 3, v * 6, seed + 2, 3, 3, 2, 0.5, 6);
      const wear = fbm(u * 8, v * 8, seed + 5, 3, 8);
      const dirt = fbm(u * 5, v * 5, seed + 9, 4, 5);
      let k = 0.3 + fold * 0.45 + weave * 0.12 + thread * 0.05;
      if (wear > 0.62) k += (wear - 0.62) * 0.9;
      mix3(c, [28, 28, 30], [96, 92, 86], k);
      if (dirt < 0.38) mix3(c, [c[0]!, c[1]!, c[2]!], [44, 36, 26], (0.38 - dirt) * 2.2);
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
