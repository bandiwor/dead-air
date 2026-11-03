/**
 * Детерминированные шумы. Все функции чистые; `period > 0` даёт бесшовную (тайлящуюся) версию.
 */

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, p: number): number => ((a % p) + p) % p;
const fade = (t: number): number => t * t * (3 - 2 * t);

/** period — период по x (и по y, если periodY не задан). Для растянутых узоров период задаётся по осям отдельно. */
export function valueNoise(x: number, y: number, seed: number, period = 0, periodY = period): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  let x0 = xi;
  let y0 = yi;
  let x1 = xi + 1;
  let y1 = yi + 1;
  if (period > 0) {
    x0 = mod(x0, period);
    x1 = mod(x1, period);
  }
  if (periodY > 0) {
    y0 = mod(y0, periodY);
    y1 = mod(y1, periodY);
  }
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const u = fade(xf);
  const v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(
  x: number, y: number, seed: number, octaves = 4, period = 0, lacunarity = 2, gain = 0.5, periodY = period,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 31, period > 0 ? period * freq : 0, periodY > 0 ? periodY * freq : 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged-шум: тонкие «трещины» и прожилки. */
export function ridged(x: number, y: number, seed: number, octaves = 4, period = 0, periodY = period): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, y * freq, seed + i * 17, period > 0 ? period * freq : 0, periodY > 0 ? periodY * freq : 0);
    sum += amp * (1 - Math.abs(n * 2 - 1));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Ячеистый шум Ворли. Возвращает F1 (расстояние до ближайшей точки), в out[0..1] — F1, F2. */
export function worley(x: number, y: number, seed: number, period = 0, out?: Float32Array): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      const hx = period > 0 ? mod(cx, period) : cx;
      const hy = period > 0 ? mod(cy, period) : cy;
      const px = cx + hash2(hx, hy, seed);
      const py = cy + hash2(hx, hy, seed + 101);
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  if (out) {
    out[0] = f1;
    out[1] = f2;
  }
  return f1;
}
