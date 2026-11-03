import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEXTURES, type TextureId } from '../src/content/assets';
import { generateTexture, seedFor } from '../src/proc/textures';
import { encodePng } from './helpers/png';

const ids = Object.keys(TEXTURES) as TextureId[];
const gen = (id: TextureId) => {
  const src = TEXTURES[id] as { proc: Parameters<typeof generateTexture>[0]; size?: number };
  return generateTexture(src.proc, src.size ?? 128, seedFor(id, 1953));
};

/**
 * Шов при повторе: разница между последней и первой строкой (столбцом) сравнивается
 * с самым резким перепадом между соседними строками внутри текстуры (пазы, стыки — легальны).
 */
function seam(d: Uint8Array, n: number): { edge: number; worst: number } {
  const px = (x: number, y: number, c: number) => d[(y * n + x) * 4 + c]!;
  const rowDiff = (y0: number, y1: number) => {
    let s = 0;
    for (let x = 0; x < n; x++) for (let c = 0; c < 3; c++) s += Math.abs(px(x, y0, c) - px(x, y1, c));
    return s / n;
  };
  const colDiff = (x0: number, x1: number) => {
    let s = 0;
    for (let y = 0; y < n; y++) for (let c = 0; c < 3; c++) s += Math.abs(px(x0, y, c) - px(x1, y, c));
    return s / n;
  };
  let worst = 0;
  for (let i = 0; i < n - 1; i++) worst = Math.max(worst, rowDiff(i, i + 1), colDiff(i, i + 1));
  const edge = Math.max(rowDiff(n - 1, 0), colDiff(n - 1, 0));
  return { edge, worst };
}

describe('процедурные текстуры', () => {
  for (const id of ids) {
    it(`${id}: детерминирована, не плоская, без шва при повторе`, () => {
      const a = gen(id);
      const b = gen(id);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
      expect(a.data.length).toBe(a.size * a.size * 4);
      // есть детали (дисперсия яркости), но нет выжженных/провальных областей целиком
      let min = 255;
      let max = 0;
      let sum = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const l = (a.data[i]! + a.data[i + 1]! + a.data[i + 2]!) / 3;
        min = Math.min(min, l);
        max = Math.max(max, l);
        sum += l;
      }
      const mean = sum / (a.data.length / 4);
      expect(max - min).toBeGreaterThan(20);
      expect(mean).toBeGreaterThan(15);
      expect(mean).toBeLessThan(240);
      // шов не должен быть заметно резче, чем перепады внутри текстуры
      const s = seam(a.data, a.size);
      expect(s.edge).toBeLessThanOrEqual(s.worst * 1.05 + 1);
    });
  }

  it('выгрузка для глаза (DUMP_TEXTURES=папка)', () => {
    const dir = process.env.DUMP_TEXTURES;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const id of ids) {
      const t = gen(id);
      // плитка 2×2 — видно, повторяется ли текстура без швов
      const n = t.size * 2;
      const out = new Uint8Array(n * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.set(t.data.subarray(((y % t.size) * t.size + (x % t.size)) * 4, ((y % t.size) * t.size + (x % t.size)) * 4 + 4), (y * n + x) * 4);
      writeFileSync(join(dir, `${id}.png`), encodePng(n, n, out));
    }
  });
});
