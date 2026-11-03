import { distToSegment, lerp, smoothstep } from '../core/math';
import { fbm } from './noise';
import { HOUSE_SITES, HUT_SITE } from './sites';

/**
 * Авторская топология мира (фиксирована — игрок её выучивает).
 * Процедурной является поверхность и детали, а не расположение ключевых мест.
 *
 *            N (−z)
 *        холм «Молчун» с расщелиной «Щель»
 *                 |
 *   лес  —  деревня Устье (0,0)  —  лес
 *                      \
 *                пруд «Глядень» с пристанью
 *            S (+z)
 */
export const WORLD = {
  half: 80,
  bounds: 70,
  waterLevel: -0.75,
  village: { x: 0, z: 0, r: 21 },
  hill: { x: -4, z: -46, r: 24, h: 10 },
  crevice: { ax: -5, az: -31, bx: -1.5, bz: -58, w: 2.8, depth: 7 },
  pond: { x: 27, z: 19, r: 13 },
  pier: { x0: 10.5, x1: 23, z0: 17.9, z1: 20.1, y: -0.2 },
  pole: { x: 0, z: 0 },
} as const;

/**
 * Текущий уровень воды. Обычно — WORLD.waterLevel; в третьей ночи меняется со временем
 * (паводок в «Весне», осушенный пруд в «Щели»). Задаётся миром на каждом шаге.
 */
export const water = { level: WORLD.waterLevel as number };

export function onPier(x: number, z: number): boolean {
  const p = WORLD.pier;
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
}

function rawHeight(x: number, z: number): number {
  let h = (fbm(x * 0.035 + 100, z * 0.035 + 100, 7, 4) - 0.5) * 3.2;
  h += (fbm(x * 0.13, z * 0.13, 11, 2) - 0.5) * 0.5;

  const v = WORLD.village;
  const dv = Math.hypot(x - v.x, z - v.z);
  h = lerp(h, 0.08 + h * 0.12, smoothstep(v.r, v.r * 0.5, dv));

  const hill = WORLD.hill;
  const dh = Math.hypot(x - hill.x, z - hill.z);
  h += hill.h * Math.exp(-((dh / hill.r) ** 2) * 1.6);

  const c = WORLD.crevice;
  const dc = distToSegment(x, z, c.ax, c.az, c.bx, c.bz);
  const hillMask = smoothstep(hill.r * 1.4, hill.r * 0.6, dh);
  const cut = 1 - smoothstep(c.w * 0.35, c.w, dc);
  h -= cut * c.depth * hillMask;

  const p = WORLD.pond;
  const dp = Math.hypot(x - p.x, z - p.z);
  const bowl = 1 - smoothstep(p.r * 0.5, p.r * 1.05, dp);
  h = lerp(h, -2.6, bowl);

  return h;
}

export function isWater(x: number, z: number): boolean {
  return heightAt(x, z) < water.level + 0.12 && !onPier(x, z);
}

/** Высота, по которой ходит игрок/враги (пристань — над водой). */
export function groundAt(x: number, z: number): number {
  return onPier(x, z) ? WORLD.pier.y : heightAt(x, z);
}

/** 0 — трава, 1 — доски, 2 — земля/тропа, 3 — ил у воды. */
export function surfaceAt(x: number, z: number): number {
  if (onPier(x, z)) return 1;
  const h = heightAt(x, z);
  if (h < water.level + 0.6) return 3;
  if (Math.hypot(x, z) < 11) return 2;
  return 0;
}

/**
 * Площадки под срубами выровнены: пол дома лежит ровно, земля не прорастает сквозь доски,
 * а высота, по которой ходит игрок, совпадает с полом.
 */
const PADS = [...HOUSE_SITES, HUT_SITE].map((h) => ({
  x: h.x,
  z: h.z,
  r: Math.hypot(h.w, h.d) / 2 + 0.4,
  y: rawHeight(h.x, h.z),
}));

export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    const dx = x - p.x;
    const dz = z - p.z;
    const r = p.r + 2;
    if (dx * dx + dz * dz > r * r) continue;
    h = lerp(h, p.y, smoothstep(p.r + 2, p.r, Math.sqrt(dx * dx + dz * dz)));
  }
  return h;
}

/** Высота пола дома (для рендера): та же, что у выровненной площадки. */
export function padHeight(x: number, z: number): number {
  return rawHeight(x, z);
}
