export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const saturate = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function distToSegment(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 0 ? saturate(((px - ax) * abx + (pz - az) * abz) / l2) : 0;
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
