import { Rng } from '../core/rng';
import { distToSegment } from '../core/math';
import { WORLD, heightAt } from './terrain';

export interface HouseDef {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  lit: boolean;
}

export interface TreeDef {
  x: number;
  z: number;
  s: number;
  rot: number;
  /** 0 — ель, 1 — сухое дерево, 2 — берёза */
  kind: number;
}

export interface Spot {
  x: number;
  z: number;
}

export interface Layout {
  houses: HouseDef[];
  hut: HouseDef;
  hutDoor: Spot;
  pole: Spot;
  trees: TreeDef[];
  barrels: Spot[];
  fences: { ax: number; az: number; bx: number; bz: number }[];
  /** Точки у дверей домов: тайники, патроны, находки. */
  doorSpots: Spot[];
}

/** Мир фиксирован (сид карты постоянен): место должно выучиваться. */
export const MAP_SEED = 1953;

export function doorOf(h: HouseDef, out = 0.9): Spot {
  // Дверь — на «южной» (локальной +z) стороне дома.
  const lx = 0;
  const lz = h.d / 2 + out;
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}

export function buildLayout(): Layout {
  const rng = new Rng(MAP_SEED);
  const houses: HouseDef[] = [
    { id: 0, x: -13, z: -5, w: 6, d: 5, h: 2.6, rot: 0.35, lit: true },
    { id: 1, x: -12.5, z: 9, w: 5.5, d: 4.5, h: 2.5, rot: -0.25, lit: false },
    { id: 2, x: -2, z: 13.5, w: 6, d: 5, h: 2.7, rot: 0.1, lit: false },
    { id: 3, x: 13, z: -11, w: 6.5, d: 5, h: 2.7, rot: -0.4, lit: true },
    { id: 4, x: -3, z: -15, w: 5, d: 4.5, h: 2.4, rot: 0.15, lit: false },
    { id: 5, x: 12.5, z: 4.5, w: 5, d: 4, h: 2.4, rot: 0.5, lit: false },
  ];
  const hut: HouseDef = { id: 100, x: 6.5, z: -4.5, w: 3.6, d: 3, h: 2.4, rot: 0, lit: true };

  const trees: TreeDef[] = [];
  const cell = 1.7;
  const occupied = new Set<number>();
  const key = (x: number, z: number): number => (Math.floor(x / cell) + 200) * 1000 + (Math.floor(z / cell) + 200);
  const c = WORLD.crevice;
  for (let i = 0; i < 9000 && trees.length < 950; i++) {
    const x = rng.range(-WORLD.bounds - 4, WORLD.bounds + 4);
    const z = rng.range(-WORLD.bounds - 4, WORLD.bounds + 4);
    const r = Math.hypot(x, z);
    if (r > WORLD.bounds + 5) continue;
    if (r < WORLD.village.r + 3) continue;
    if (Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 3) continue;
    if (distToSegment(x, z, c.ax, c.az, c.bx, c.bz) < c.w + 2.5) continue;
    if (distToSegment(x, z, c.ax, c.az, 0, -6) < 3.2) continue; // тропа к Щели
    if (distToSegment(x, z, 4, 6, WORLD.pier.x0, WORLD.pier.z0 + 1) < 3.2) continue; // тропа к пруду
    const density = 0.12 + 0.85 * Math.min(1, Math.max(0, (r - 22) / 30));
    if (!rng.chance(density)) continue;
    const k = key(x, z);
    if (occupied.has(k)) continue;
    occupied.add(k);
    const roll = rng.next();
    trees.push({
      x,
      z,
      s: rng.range(0.8, 1.45),
      rot: rng.range(0, Math.PI * 2),
      kind: roll < 0.1 ? 1 : roll < 0.22 ? 2 : 0,
    });
  }

  const fences = [
    { ax: -18, az: -12, bx: -18, bz: 2 },
    { ax: -18, az: 2, bx: -15, bz: 15 },
    { ax: 8, az: 12, bx: 4, bz: 18 },
    { ax: 17, az: -16, bx: 19, bz: -4 },
  ];

  return {
    houses,
    hut,
    hutDoor: doorOf(hut, 1.0),
    pole: { x: WORLD.pole.x, z: WORLD.pole.z },
    trees,
    barrels: [
      { x: -6, z: 2.5 },
      { x: 4, z: 7.5 },
      { x: 9.5, z: -8.5 },
      { x: -8, z: -10.5 },
      { x: 9, z: 16.5 },
    ],
    fences,
    doorSpots: houses.map((h) => doorOf(h, 1.3)),
  };
}

/** Удобная проверка, что точка проходима для спавна на суше. */
export function isDryGround(x: number, z: number): boolean {
  return heightAt(x, z) > WORLD.waterLevel + 0.3;
}
