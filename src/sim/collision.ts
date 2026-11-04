import type { HouseDef, Layout } from '../proc/layout';
import { WORLD } from '../proc/terrain';
import { INTERIORS } from '../content/interiors';
import { DOOR_HALF, WALL, toWorld } from './houses';

export interface Box {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
}

const CELL = 4;
const N = 44; // покрывает ±88 м
const OFF = (N * CELL) / 2;

export function boxOf(h: HouseDef, pad = 0): Box {
  return { cx: h.x, cz: h.z, hw: h.w / 2 + pad, hd: h.d / 2 + pad, c: Math.cos(h.rot), s: Math.sin(h.rot) };
}

/** Прямоугольник в локальных координатах дома → OBB в мире. */
function localBox(h: HouseDef, lx: number, lz: number, hw: number, hd: number): Box {
  const [cx, cz] = toWorld(h, lx, lz);
  return { cx, cz, hw, hd, c: Math.cos(h.rot), s: Math.sin(h.rot) };
}

/** Полый сруб: четыре стены, в передней — дверной проём. */
export function houseWalls(h: HouseDef): Box[] {
  const hw = h.w / 2;
  const hd = h.d / 2;
  const t = WALL / 2;
  const side = (hw - DOOR_HALF) / 2;
  return [
    localBox(h, 0, -hd + t, hw, t),
    localBox(h, -hw + t, 0, t, hd),
    localBox(h, hw - t, 0, t, hd),
    localBox(h, -(DOOR_HALF + side), hd - t, side, t),
    localBox(h, DOOR_HALF + side, hd - t, side, t),
  ];
}

export function doorBox(h: HouseDef): Box {
  return localBox(h, 0, h.d / 2 - WALL / 2, DOOR_HALF, WALL / 2);
}

/**
 * Статическая геометрия мира для коллизий и лучей. Деревья — круги в равномерной сетке, дома — OBB.
 * Никаких аллокаций в запросах.
 */
export class Statics {
  readonly treeX: Float32Array;
  readonly treeZ: Float32Array;
  readonly treeR: Float32Array;
  readonly cells: Int32Array[];
  readonly boxes: Box[];
  readonly poles: { x: number; z: number; r: number }[];
  /** Двери домов: закрытая дверь — препятствие. */
  readonly doors: Box[];
  readonly doorOpen: boolean[];
  /** Контуры построек целиком — для обхода врагами (их не видно сквозь срубы). */
  readonly footprints: Box[];

  constructor(layout: Layout) {
    const n = layout.trees.length;
    this.treeX = new Float32Array(n);
    this.treeZ = new Float32Array(n);
    this.treeR = new Float32Array(n);
    const buckets: number[][] = Array.from({ length: N * N }, () => []);
    layout.trees.forEach((t, i) => {
      this.treeX[i] = t.x;
      this.treeZ[i] = t.z;
      this.treeR[i] = 0.28 * t.s;
      const cx = Math.floor((t.x + OFF) / CELL);
      const cz = Math.floor((t.z + OFF) / CELL);
      if (cx >= 0 && cz >= 0 && cx < N && cz < N) buckets[cz * N + cx]!.push(i);
    });
    this.cells = buckets.map((b) => Int32Array.from(b));
    this.boxes = [...layout.houses.flatMap((h) => houseWalls(h)), boxOf(layout.hut)];
    this.doors = layout.houses.map((h) => doorBox(h));
    this.footprints = [...layout.houses.map((h) => boxOf(h)), boxOf(layout.hut)];
    this.doorOpen = layout.houses.map(() => false);
    this.poles = [{ x: layout.pole.x, z: layout.pole.z, r: 0.3 }];
    for (const it of INTERIORS) {
      const h = layout.houses[it.house];
      if (!h) continue;
      for (const f of it.furniture) {
        if (!f.r) continue;
        const [x, z] = toWorld(h, f.x, f.z);
        this.poles.push({ x, z, r: f.r });
      }
    }
  }

  /** Выталкивает круг из статики. Возвращает true, если было столкновение. */
  resolve(pos: { x: number; z: number }, r: number): boolean {
    let hit = false;
    const x0 = Math.floor((pos.x - r - 1 + OFF) / CELL);
    const x1 = Math.floor((pos.x + r + 1 + OFF) / CELL);
    const z0 = Math.floor((pos.z - r - 1 + OFF) / CELL);
    const z1 = Math.floor((pos.z + r + 1 + OFF) / CELL);
    for (let cz = z0; cz <= z1; cz++) {
      if (cz < 0 || cz >= N) continue;
      for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cx >= N) continue;
        const cell = this.cells[cz * N + cx]!;
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k]!;
          hit = pushCircle(pos, r, this.treeX[i]!, this.treeZ[i]!, this.treeR[i]!) || hit;
        }
      }
    }
    for (const p of this.poles) hit = pushCircle(pos, r, p.x, p.z, p.r) || hit;
    for (const b of this.boxes) hit = pushBox(pos, r, b) || hit;
    for (let i = 0; i < this.doors.length; i++) if (!this.doorOpen[i]) hit = pushBox(pos, r, this.doors[i]!) || hit;
    const d = Math.hypot(pos.x, pos.z);
    if (d > WORLD.bounds) {
      pos.x *= WORLD.bounds / d;
      pos.z *= WORLD.bounds / d;
      hit = true;
    }
    return hit;
  }

  /** Ближайшее пересечение луча (dx,dz — единичный) со статикой, не дальше maxT. */
  raycast(ox: number, oz: number, dx: number, dz: number, maxT: number, trees = true): number {
    let best = maxT;
    for (const b of this.boxes) {
      const t = rayBox(ox, oz, dx, dz, b);
      if (t >= 0 && t < best) best = t;
    }
    for (let i = 0; i < this.doors.length; i++) {
      if (this.doorOpen[i]) continue;
      const t = rayBox(ox, oz, dx, dz, this.doors[i]!);
      if (t >= 0 && t < best) best = t;
    }
    if (trees) {
      const ex = ox + dx * best;
      const ez = oz + dz * best;
      const x0 = Math.floor((Math.min(ox, ex) + OFF) / CELL);
      const x1 = Math.floor((Math.max(ox, ex) + OFF) / CELL);
      const z0 = Math.floor((Math.min(oz, ez) + OFF) / CELL);
      const z1 = Math.floor((Math.max(oz, ez) + OFF) / CELL);
      for (let cz = Math.max(0, z0); cz <= Math.min(N - 1, z1); cz++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(N - 1, x1); cx++) {
          const cell = this.cells[cz * N + cx]!;
          for (let k = 0; k < cell.length; k++) {
            const i = cell[k]!;
            const t = rayCircle(ox, oz, dx, dz, this.treeX[i]!, this.treeZ[i]!, this.treeR[i]! + 0.05);
            if (t >= 0 && t < best) best = t;
          }
        }
      }
    }
    for (const p of this.poles) {
      const t = rayCircle(ox, oz, dx, dz, p.x, p.z, p.r);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

/**
 * Обход построек: если прямая к цели упирается в сруб, вернуть ближайший свободный угол
 * (расширенный на радиус), через который путь короче. Иначе — саму цель.
 * skip — индекс постройки, внутри которой цель (туда идут через дверь, а не вокруг).
 */
export function steerAround(st: Statics, x: number, z: number, tx: number, tz: number, r: number, skip: number): [number, number] {
  const dx = tx - x;
  const dz = tz - z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) return [tx, tz];
  const ux = dx / dist;
  const uz = dz / dist;
  let hitI = -1;
  let hitT = dist;
  for (let i = 0; i < st.footprints.length; i++) {
    if (i === skip) continue;
    const t = rayBox(x, z, ux, uz, inflate(st.footprints[i]!, r * 0.9));
    if (t >= 0 && t < hitT) {
      hitT = t;
      hitI = i;
    }
  }
  if (hitI < 0) return [tx, tz];
  const b = inflate(st.footprints[hitI]!, r + 0.5);
  let best: [number, number] = [tx, tz];
  let bestLen = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = sx * b.hw;
    const lz = sz * b.hd;
    const cx = b.cx + lx * b.c + lz * b.s;
    const cz = b.cz - lx * b.s + lz * b.c;
    // угол должен быть виден напрямую (не сквозь этот же сруб)
    const ex = cx - x;
    const ez = cz - z;
    const el = Math.hypot(ex, ez);
    if (el < 0.3) continue;
    const t = rayBox(x, z, ex / el, ez / el, inflate(st.footprints[hitI]!, r * 0.5));
    if (t >= 0 && t < el - 0.2) continue;
    // из угла цель должна быть видна; иначе — штраф (придётся огибать дальше)
    const fx = tx - cx;
    const fz = tz - cz;
    const fl = Math.hypot(fx, fz) || 1;
    const tf = rayBox(cx, cz, fx / fl, fz / fl, inflate(st.footprints[hitI]!, r * 0.5));
    const blocked = tf >= 0 && tf < fl - 0.2;
    const len = el + fl + (blocked ? (b.hw + b.hd) * 2 : 0);
    if (len < bestLen) {
      bestLen = len;
      best = [cx, cz];
    }
  }
  return best;
}

function inflate(b: Box, d: number): Box {
  return { cx: b.cx, cz: b.cz, hw: b.hw + d, hd: b.hd + d, c: b.c, s: b.s };
}

export function pushCircle(pos: { x: number; z: number }, r: number, cx: number, cz: number, cr: number): boolean {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const rr = r + cr;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-4;
  const k = (rr - d) / d;
  pos.x += dx * k;
  pos.z += dz * k;
  return true;
}

export function pushBox(pos: { x: number; z: number }, r: number, b: Box): boolean {
  const rx = pos.x - b.cx;
  const rz = pos.z - b.cz;
  // в локальные координаты (поворот на −rot)
  const lx = rx * b.c - rz * b.s;
  const lz = rx * b.s + rz * b.c;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx));
  const qz = Math.max(-b.hd, Math.min(b.hd, lz));
  let nx = lx - qx;
  let nz = lz - qz;
  let d2 = nx * nx + nz * nz;
  if (d2 >= r * r) return false;
  let ox: number;
  let oz: number;
  if (d2 < 1e-8) {
    // центр внутри — выталкиваем по ближайшей грани
    const px = b.hw - Math.abs(lx);
    const pz = b.hd - Math.abs(lz);
    if (px < pz) {
      ox = (Math.sign(lx) || 1) * (b.hw + r);
      oz = lz;
    } else {
      ox = lx;
      oz = (Math.sign(lz) || 1) * (b.hd + r);
    }
  } else {
    const d = Math.sqrt(d2);
    nx /= d;
    nz /= d;
    ox = qx + nx * r;
    oz = qz + nz * r;
    d2 = 0;
  }
  // обратно в мир (поворот на +rot)
  pos.x = b.cx + ox * b.c + oz * b.s;
  pos.z = b.cz - ox * b.s + oz * b.c;
  return true;
}

export function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = fx * dx + fz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

export function rayBox(ox: number, oz: number, dx: number, dz: number, b: Box): number {
  const rx = ox - b.cx;
  const rz = oz - b.cz;
  const lox = rx * b.c - rz * b.s;
  const loz = rx * b.s + rz * b.c;
  const ldx = dx * b.c - dz * b.s;
  const ldz = dx * b.s + dz * b.c;
  let tmin = -Infinity;
  let tmax = Infinity;
  if (Math.abs(ldx) < 1e-9) {
    if (lox < -b.hw || lox > b.hw) return -1;
  } else {
    let t1 = (-b.hw - lox) / ldx;
    let t2 = (b.hw - lox) / ldx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(ldz) < 1e-9) {
    if (loz < -b.hd || loz > b.hd) return -1;
  } else {
    let t1 = (-b.hd - loz) / ldz;
    let t2 = (b.hd - loz) / ldz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < 0 || tmin > tmax) return -1;
  return tmin < 0 ? 0 : tmin;
}
