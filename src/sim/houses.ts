import type { HouseDef } from '../proc/layout';

/** Перевод координат дома (x — вдоль фасада, z — вглубь, дверь на +z) в мир и обратно. */
export function toWorld(h: HouseDef, lx: number, lz: number): [number, number] {
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  return [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
}

export function toLocal(h: HouseDef, x: number, z: number): [number, number] {
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  const rx = x - h.x;
  const rz = z - h.z;
  return [rx * c - rz * s, rx * s + rz * c];
}

export const WALL = 0.18;
export const DOOR_HALF = 0.62;

/** Индекс дома, внутри которого точка (или −1). */
export function houseAt(houses: readonly HouseDef[], x: number, z: number): number {
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i]!;
    const [lx, lz] = toLocal(h, x, z);
    if (Math.abs(lx) < h.w / 2 - WALL * 0.5 && Math.abs(lz) < h.d / 2 - WALL * 0.5) return i;
  }
  return -1;
}
