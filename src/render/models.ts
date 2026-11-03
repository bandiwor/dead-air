import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';

/**
 * Процедурные модели. Всё строится из примитивов в один BufferGeometry на модель
 * (вершинные цвета + атрибуты конечностей для GPU-анимации).
 */

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  color: number;
  /** Опора конечности (x,y,z) и фаза. */
  limb?: [number, number, number, number];
  limbW?: number;
  /** Разброс яркости цвета по вершинам (оживляет плоские грани). */
  jitter?: number;
}

const tmpColor = new THREE.Color();

export class Builder {
  private parts: THREE.BufferGeometry[] = [];
  private readonly rng: Rng;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  add(geo: THREE.BufferGeometry, o: PartOpts): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), q, new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    g.applyMatrix4(m);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    tmpColor.set(o.color);
    for (let i = 0; i < n; i++) {
      const j = o.jitter ? 1 + (this.rng.next() - 0.5) * o.jitter : 1;
      col[i * 3] = tmpColor.r * j;
      col[i * 3 + 1] = tmpColor.g * j;
      col[i * 3 + 2] = tmpColor.b * j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const limb = new Float32Array(n * 4);
    const lw = new Float32Array(n);
    if (o.limb) {
      for (let i = 0; i < n; i++) {
        limb.set(o.limb, i * 4);
        lw[i] = o.limbW ?? 1;
      }
    }
    g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 4));
    g.setAttribute('aLimbW', new THREE.BufferAttribute(lw, 1));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, o: PartOpts): this {
    return this.add(new THREE.BoxGeometry(w, h, d), o);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error('merge failed');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Простая треугольная призма — фронтон крыши. */
function gable(w: number, h: number, d: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const v = [
    // перед
    -hw, 0, hd, hw, 0, hd, 0, h, hd,
    // зад
    hw, 0, -hd, -hw, 0, -hd, 0, h, -hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ флора

export function spruceGeometry(seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  b.add(new THREE.CylinderGeometry(0.09, 0.2, 2.2, 6), { pos: [0, 1.1, 0], color: 0x3a2c22, jitter: 0.2 });
  const tiers = 5;
  let y = 1.1;
  let rad = 1.75;
  for (let i = 0; i < tiers; i++) {
    const h = 1.9 - i * 0.18;
    b.add(new THREE.ConeGeometry(rad, h, 7, 1, false), {
      pos: [r.range(-0.08, 0.08), y + h / 2, r.range(-0.08, 0.08)],
      rot: [r.range(-0.05, 0.05), r.range(0, 6.28), r.range(-0.05, 0.05)],
      color: i % 2 ? 0x22301f : 0x1b2a1c,
      jitter: 0.5,
    });
    y += h * 0.55;
    rad *= 0.78;
  }
  return b.build();
}

export function birchGeometry(seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  b.add(new THREE.CylinderGeometry(0.07, 0.13, 6, 6), { pos: [0, 3, 0], rot: [r.range(-0.04, 0.04), 0, r.range(-0.04, 0.04)], color: 0xd8d4c8, jitter: 0.15 });
  for (let i = 0; i < 4; i++) {
    b.add(new THREE.IcosahedronGeometry(r.range(0.8, 1.2), 0), {
      pos: [r.range(-0.7, 0.7), r.range(4.6, 6.3), r.range(-0.7, 0.7)],
      scale: [1, 0.8, 1],
      color: 0x3c4426,
      jitter: 0.5,
    });
  }
  return b.build();
}

export function deadTreeGeometry(seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  b.add(new THREE.CylinderGeometry(0.08, 0.22, 5, 5), { pos: [0, 2.5, 0], color: 0x2b241f, jitter: 0.2 });
  for (let i = 0; i < 5; i++) {
    const y = r.range(2, 4.6);
    const a = r.range(0, 6.28);
    const len = r.range(0.8, 1.8);
    b.add(new THREE.CylinderGeometry(0.02, 0.06, len, 4), {
      pos: [Math.cos(a) * len * 0.4, y + len * 0.25, Math.sin(a) * len * 0.4],
      rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9],
      color: 0x2b241f,
    });
  }
  return b.build();
}

export function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const r = new Rng(seed);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * r.range(0.8, 1.2), p.getY(i) * r.range(0.5, 0.9), p.getZ(i) * r.range(0.8, 1.2));
  }
  g.computeVertexNormals();
  return new Builder(seed).add(g, { color: 0x3a3a38, jitter: 0.3 }).build();
}

export function grassGeometry(): THREE.BufferGeometry {
  const b = new Builder(5);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.06, 0.45, 1, 2);
    const p = g.attributes.position!;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > 0.2) p.setX(k, p.getX(k) * 0.1);
    b.add(g, { pos: [(i - 1) * 0.07, 0.22, 0], rot: [0.15 * (i - 1), (i * Math.PI) / 3, 0.2 * (i - 1)], color: i === 1 ? 0x48502c : 0x343d22, jitter: 0.3 });
  }
  return b.build();
}

// ------------------------------------------------------------------ постройки

export interface HouseParts {
  walls: THREE.BufferGeometry;
  roof: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  windows: THREE.BufferGeometry;
}

export function houseGeometry(w: number, d: number, h: number, seed: number, flatRoof = false, hollow = false): HouseParts {
  const r = new Rng(seed);
  const walls = new Builder(seed);
  const roof = new Builder(seed + 1);
  const trim = new Builder(seed + 2);
  const win = new Builder(seed + 3);
  const T = 0.18; // толщина сруба (как в симуляции)
  const DH = 0.62; // полупроём двери
  const wallC = 0xb09276;

  if (hollow) {
    // полый сруб: стены изнутри видны, когда снята крыша
    walls.box(w, h, T, { pos: [0, h / 2 - 0.15, -d / 2 + T / 2], color: wallC, jitter: 0.1 });
    walls.box(T, h, d, { pos: [-w / 2 + T / 2, h / 2 - 0.15, 0], color: wallC, jitter: 0.1 });
    walls.box(T, h, d, { pos: [w / 2 - T / 2, h / 2 - 0.15, 0], color: wallC, jitter: 0.1 });
    const side = w / 2 - DH;
    walls.box(side, h, T, { pos: [-(DH + side / 2), h / 2 - 0.15, d / 2 - T / 2], color: wallC, jitter: 0.1 });
    walls.box(side, h, T, { pos: [DH + side / 2, h / 2 - 0.15, d / 2 - T / 2], color: wallC, jitter: 0.1 });
    walls.box(DH * 2, h - 1.95, T, { pos: [0, 1.95 + (h - 1.95) / 2 - 0.15, d / 2 - T / 2], color: wallC });
    // потолок — часть «крыши»: снимается вместе с ней
    roof.box(w, 0.06, d, { pos: [0, h - 0.18, 0], color: 0x4a3c30 });
  } else {
    walls.box(w, h, d, { pos: [0, h / 2 - 0.15, 0], color: wallC, jitter: 0.1 });
  }
  walls.box(w + 0.12, 0.3, 0.12, { pos: [0, 0.02, d / 2 + 0.0], color: 0x6b5848 });
  walls.box(w + 0.12, 0.3, 0.12, { pos: [0, 0.02, -d / 2], color: 0x6b5848 });

  if (flatRoof) {
    roof.box(w + 0.6, 0.12, d + 0.6, { pos: [0, h + 0.05, 0], rot: [0.12, 0, 0], color: 0x9a9890 });
  } else {
    const rh = w * 0.42;
    roof.add(gable(w, rh, d), { pos: [0, h - 0.15, 0], color: 0x9c8064 });
    const slope = Math.atan2(rh, w / 2);
    const len = Math.hypot(w / 2, rh) + 0.35;
    for (const sd of [-1, 1]) {
      roof.box(len, 0.1, d + 0.7, {
        pos: [(sd * w) / 4 + sd * 0.04, h - 0.15 + rh / 2 + 0.07, 0],
        rot: [0, 0, -sd * slope],
        color: 0x8e8e86,
        jitter: 0.08,
      });
    }
    roof.box(0.45, 1.1, 0.45, { pos: [w * 0.22, h + rh * 0.55, -d * 0.18], color: 0x5a4e46, jitter: 0.2 });
  }
  if (!hollow) trim.box(0.9, 1.75, 0.08, { pos: [0, 0.9, d / 2 + 0.03], color: 0x4a3b2e });
  // крыльцо (на +z)
  trim.box(1.7, 0.18, 0.9, { pos: [0, 0.0, d / 2 + 0.45], color: 0x6a5a48 });
  trim.box(0.08, 1.9, 0.08, { pos: [-0.8, 0.9, d / 2 + 0.85], color: 0x5a4a3a });
  trim.box(0.08, 1.9, 0.08, { pos: [0.8, 0.9, d / 2 + 0.85], color: 0x5a4a3a });
  trim.box(1.9, 0.08, 1.0, { pos: [0, 1.95, d / 2 + 0.45], rot: [0.25, 0, 0], color: 0x6f6e66 });

  // окна сквозные — свет изнутри виден снаружи, ночь снаружи видна изнутри
  const winSpots: [number, number, number][] = [
    [-w * 0.32, 1.25, d / 2 - T / 2],
    [w * 0.32, 1.25, d / 2 - T / 2],
    [w / 2 - T / 2, 1.25, r.range(-0.6, 0.6)],
    [-w / 2 + T / 2, 1.25, r.range(-0.6, 0.6)],
  ];
  for (const [x, y, z] of winSpots) {
    const sideWin = Math.abs(x) > w / 2 - 0.2;
    const rotY = sideWin ? Math.PI / 2 : 0;
    win.box(0.62, 0.72, T + 0.05, { pos: [x, y, z], rot: [0, rotY, 0], color: 0xffffff });
    const ox = sideWin ? Math.sign(x) * (T / 2 + 0.03) : 0;
    const oz = sideWin ? 0 : T / 2 + 0.03;
    trim.box(0.82, 0.1, 0.06, { pos: [x + ox, y + 0.43, z + oz], rot: [0, rotY, 0], color: 0xb8b0a0 });
    trim.box(0.82, 0.1, 0.06, { pos: [x + ox, y - 0.43, z + oz], rot: [0, rotY, 0], color: 0xb8b0a0 });
    trim.box(0.62, 0.05, 0.06, { pos: [x + ox, y, z + oz], rot: [0, rotY, 0], color: 0x3a3028 });
  }
  return { walls: walls.build(), roof: roof.build(), trim: trim.build(), windows: win.build() };
}

/** Дверь: петля в начале координат, полотно уходит в +x. */
export function doorGeometry(): THREE.BufferGeometry {
  const b = new Builder(17);
  b.box(1.22, 1.9, 0.07, { pos: [0.61, 0.95 - 0.15, 0], color: 0x4a3b2e, jitter: 0.15 });
  b.box(1.1, 0.1, 0.09, { pos: [0.61, 0.5, 0], color: 0x3a2e24 });
  b.box(1.1, 0.1, 0.09, { pos: [0.61, 1.3, 0], color: 0x3a2e24 });
  b.box(0.06, 0.06, 0.12, { pos: [1.05, 0.95, 0], color: 0x1e1c1a });
  return b.build();
}

/** Мебель и пол одного дома (локальные координаты). */
export function furnitureGeometry(list: readonly { type: string; x: number; z: number; rot?: number }[], w: number, d: number, seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  // пол чуть выше выровненной земли — трава не просвечивает
  b.box(w - 0.36, 0.08, d - 0.36, { pos: [0, -0.01, 0], color: 0x5a4a3a, jitter: 0.25 });
  for (const f of list) {
    const rot = f.rot ?? 0;
    const at = (lx: number, ly: number, lz: number): [number, number, number] => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return [f.x + lx * c + lz * s, ly, f.z - lx * s + lz * c];
    };
    const box = (bw: number, bh: number, bd: number, lx: number, ly: number, lz: number, color: number, extra: [number, number, number] = [0, 0, 0]): void => {
      b.box(bw, bh, bd, { pos: at(lx, ly, lz), rot: [extra[0], rot + extra[1], extra[2]], color, jitter: 0.15 });
    };
    switch (f.type) {
      case 'table':
        box(1.2, 0.06, 0.75, 0, 0.72, 0, 0x6a5440);
        for (const [lx, lz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]] as const) box(0.06, 0.72, 0.06, lx, 0.36, lz, 0x4a3a2c);
        box(0.22, 0.04, 0.22, -0.25, 0.77, 0.12, 0xb8b0a0);
        box(0.22, 0.04, 0.22, 0.25, 0.77, -0.12, 0xb8b0a0);
        break;
      case 'chair':
      case 'chairWall':
        box(0.42, 0.05, 0.42, 0, 0.45, 0, 0x5a4634);
        box(0.42, 0.5, 0.05, 0, 0.7, -0.19, 0x5a4634);
        for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) box(0.05, 0.45, 0.05, lx, 0.22, lz, 0x3a2e24);
        break;
      case 'chairDown':
        box(0.42, 0.05, 0.42, 0, 0.21, 0, 0x5a4634, [Math.PI / 2, r.range(0, 3), 0]);
        box(0.42, 0.5, 0.05, 0.1, 0.05, 0.3, 0x5a4634, [0, r.range(0, 3), Math.PI / 2]);
        break;
      case 'bed':
        box(1.9, 0.35, 0.9, 0, 0.18, 0, 0x4a3a2c);
        box(1.8, 0.12, 0.85, 0, 0.42, 0, 0x6e6a60);
        box(0.4, 0.12, 0.6, -0.65, 0.52, 0, 0x8a8478);
        break;
      case 'stove':
        box(1.3, 1.6, 1.5, 0, 0.8, 0, 0xa8a49a);
        box(0.5, 0.4, 0.06, 0, 0.75, 0.76, 0x0a0806);
        box(0.6, 0.9, 0.6, 0.2, 2.0, -0.3, 0x9a968c);
        break;
      case 'shelf':
        box(1.0, 0.05, 0.28, 0, 1.3, 0, 0x5a4634);
        box(1.0, 0.05, 0.28, 0, 0.9, 0, 0x5a4634);
        break;
      case 'radio':
        box(0.42, 0.28, 0.24, 0, 1.47, 0, 0x5a3e2a);
        box(0.3, 0.12, 0.02, 0, 1.5, 0.125, 0xc8a050);
        break;
      case 'mirror':
        box(0.74, 1.15, 0.06, 0, 1.1, 0, 0x3a2e24);
        box(0.84, 1.25, 0.03, 0, 1.08, 0.05, 0xc8c4b8);
        break;
      case 'frame':
        box(0.5, 0.4, 0.04, 0, 1.5, 0, 0x2a2420);
        box(0.42, 0.32, 0.02, 0, 1.5, 0.025, 0xb0a890);
        break;
      case 'drawings':
        for (let i = 0; i < 4; i++) box(0.3, 0.24, 0.015, -0.6 + i * 0.4, 1.2 + (i % 2) * 0.3, 0, 0xc8c0a8, [0, 0, r.range(-0.15, 0.15)]);
        break;
      case 'bench':
        box(1.4, 0.06, 0.35, 0, 0.45, 0, 0x5a4634);
        box(0.06, 0.45, 0.3, -0.6, 0.22, 0, 0x3a2e24);
        box(0.06, 0.45, 0.3, 0.6, 0.22, 0, 0x3a2e24);
        break;
      case 'chest':
        box(0.9, 0.5, 0.5, 0, 0.25, 0, 0x4a3828);
        box(0.92, 0.05, 0.52, 0, 0.5, 0, 0x2a221a);
        break;
      case 'hole':
        box(1.3, 0.04, 1.0, 0, -0.06, 0, 0x020202);
        for (let i = 0; i < 4; i++) box(0.16, 0.04, 0.9, -0.5 + i * 0.33, 0.1, 0, 0x5a4a3a, [r.range(-0.6, 0.6), 0, r.range(-0.8, 0.8)]);
        break;
    }
  }
  return b.build();
}

/** Рубильник на стене радиоузла. */
export function switchGeometry(): THREE.BufferGeometry {
  const b = new Builder(23);
  b.box(0.36, 0.5, 0.12, { pos: [0, 1.3, 0], color: 0x3a3e38 });
  b.box(0.05, 0.3, 0.05, { pos: [0, 1.42, 0.1], rot: [0.5, 0, 0], color: 0x1a1a18 });
  b.box(0.1, 0.06, 0.06, { pos: [0, 1.56, 0.17], color: 0xb08a3a });
  return b.build();
}

export function poleGeometry(): THREE.BufferGeometry {
  const b = new Builder(11);
  b.add(new THREE.CylinderGeometry(0.11, 0.16, 7.5, 7), { pos: [0, 3.75, 0], color: 0x4a3a2c, jitter: 0.2 });
  b.box(1.4, 0.1, 0.1, { pos: [0, 6.6, 0], color: 0x3e3226 });
  // рупор громкоговорителя, смотрит на площадь
  b.add(new THREE.CylinderGeometry(0.42, 0.07, 0.9, 10, 1, true), { pos: [0.05, 6.95, 0.42], rot: [Math.PI / 2 + 0.35, 0, 0], color: 0x6f7468 });
  b.add(new THREE.CylinderGeometry(0.42, 0.07, 0.9, 10, 1, true), { pos: [-0.05, 6.95, -0.42], rot: [-Math.PI / 2 - 0.35, 0, 0], color: 0x6f7468 });
  b.box(0.3, 0.25, 0.3, { pos: [0, 6.95, 0], color: 0x55584e });
  // фонарь
  b.box(0.08, 0.6, 0.08, { pos: [0.55, 6.25, 0], color: 0x2c2c2a });
  return b.build();
}

export function pierGeometry(x0: number, x1: number, z0: number, z1: number, y: number, seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  for (let x = x0; x < x1; x += 0.36) {
    const missing = x > x1 - 3.5 && r.chance(0.18);
    if (missing) continue;
    b.box(0.3, 0.08, z1 - z0 + r.range(-0.15, 0.1), {
      pos: [x + 0.15, y - 0.04, (z0 + z1) / 2 + r.range(-0.05, 0.05)],
      rot: [0, r.range(-0.02, 0.02), r.range(-0.03, 0.03)],
      color: 0x8a8070,
      jitter: 0.25,
    });
  }
  for (let x = x0 + 0.5; x < x1; x += 2.2) {
    for (const z of [z0 + 0.1, z1 - 0.1]) {
      b.add(new THREE.CylinderGeometry(0.09, 0.1, 3, 6), { pos: [x, y - 1.5, z], rot: [r.range(-0.05, 0.05), 0, r.range(-0.05, 0.05)], color: 0x3a3228 });
    }
  }
  // лодка, привязанная к пристани
  const hull = new THREE.CylinderGeometry(0.62, 0.5, 3.2, 8, 1, false, 0, Math.PI);
  b.add(hull, { pos: [x1 - 3, y - 0.38, z1 + 0.85], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.55], color: 0x4d4438, jitter: 0.2 });
  b.box(0.12, 0.05, 1.0, { pos: [x1 - 3.4, y - 0.15, z1 + 0.85], color: 0x5a4f40 });
  return b.build();
}

export function wellGeometry(): THREE.BufferGeometry {
  const b = new Builder(21);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.5, 0.75, 0.16, { pos: [Math.cos(a) * 0.6, 0.37, Math.sin(a) * 0.6], rot: [0, -a + Math.PI / 2, 0], color: 0x6e5c4a, jitter: 0.2 });
  }
  b.box(0.08, 1.6, 0.08, { pos: [-0.7, 1.1, 0], color: 0x4a3c30 });
  b.box(0.08, 1.6, 0.08, { pos: [0.7, 1.1, 0], color: 0x4a3c30 });
  b.box(1.7, 0.06, 1.0, { pos: [-0.38, 2.05, 0], rot: [0, 0, 0.55], color: 0x7a786e });
  b.box(1.7, 0.06, 1.0, { pos: [0.38, 2.05, 0], rot: [0, 0, -0.55], color: 0x7a786e });
  b.add(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), { pos: [0, 1.5, 0], rot: [0, 0, Math.PI / 2], color: 0x5a4a3a });
  return b.build();
}

export function fenceGeometry(ax: number, az: number, bx: number, bz: number, seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const b = new Builder(seed);
  const len = Math.hypot(bx - ax, bz - az);
  const ang = Math.atan2(bz - az, bx - ax);
  const n = Math.max(2, Math.floor(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (r.chance(0.12)) continue;
    b.box(0.09, r.range(1.0, 1.25), 0.09, {
      pos: [ax + (bx - ax) * t, 0.5, az + (bz - az) * t],
      rot: [r.range(-0.08, 0.08), 0, r.range(-0.12, 0.12)],
      color: 0x5a4c3e,
    });
  }
  for (const y of [0.45, 0.85]) {
    b.box(len, 0.07, 0.05, { pos: [(ax + bx) / 2, y + r.range(-0.05, 0.05), (az + bz) / 2], rot: [0, -ang, r.range(-0.03, 0.03)], color: 0x6a5a48 });
  }
  return b.build();
}

export function barrelGeometry(): THREE.BufferGeometry {
  const b = new Builder(31);
  b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 10), { pos: [0, 0.47, 0], color: 0x48553f, jitter: 0.15 });
  for (const y of [0.15, 0.47, 0.8]) b.add(new THREE.CylinderGeometry(0.415, 0.415, 0.05, 10), { pos: [0, y, 0], color: 0x2f342a });
  b.box(0.14, 0.04, 0.14, { pos: [0.18, 0.96, 0], color: 0x2a2a28 });
  return b.build();
}

export function crateGeometry(long = false): THREE.BufferGeometry {
  const b = new Builder(41);
  if (long) {
    b.box(1.1, 0.16, 0.3, { pos: [0, 0.08, 0], color: 0x5a4a38, jitter: 0.2 });
    b.box(0.9, 0.06, 0.06, { pos: [0.05, 0.2, 0], color: 0x2a2826 });
  } else {
    b.box(0.55, 0.38, 0.4, { pos: [0, 0.19, 0], color: 0x6a5a40, jitter: 0.2 });
    b.box(0.57, 0.06, 0.42, { pos: [0, 0.3, 0], color: 0x3e3428 });
  }
  return b.build();
}

export function dynamiteGeometry(): THREE.BufferGeometry {
  const b = new Builder(51);
  for (let i = 0; i < 3; i++) b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 6), { pos: [(i - 1) * 0.08, 0, 0], rot: [Math.PI / 2, 0, 0], color: 0x9a7a52 });
  b.box(0.26, 0.04, 0.05, { color: 0x2a2420 });
  return b.build();
}

// ------------------------------------------------------------------ существа

interface HumanoidSpec {
  height: number;
  coat: number;
  skin: number;
  pants: number;
  thin?: number;
  armLen?: number;
  headTilt?: number;
  flashlight?: boolean;
  /** Керосиновая лампа в опущенной левой руке (ребёнок). */
  lantern?: boolean;
}

/** Где правая кисть взрослого (рост 1.8) держит рукоять оружия — в координатах модели. */
export const HAND_R: [number, number, number] = [0.1, 1.2, 0.4];

/** Брусок от точки a до точки b (рука, ствол): длинная ось бруска — вдоль отрезка. */
function segment(b: Builder, a: [number, number, number], c: [number, number, number], w: number, d: number, o: Omit<PartOpts, 'pos' | 'rot'>): void {
  const dir = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  b.box(w, len, d, { ...o, pos: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], rot: [e.x, e.y, e.z] });
}

export function humanoidGeometry(s: HumanoidSpec): THREE.BufferGeometry {
  const k = s.height / 1.8;
  const thin = s.thin ?? 1;
  const armLen = (s.armLen ?? 0.68) * k;
  const b = new Builder(61);
  const hip = 0.88 * k;
  const sh = 1.45 * k;
  for (const side of [-1, 1]) {
    b.box(0.16 * thin, 0.86 * k, 0.17, { pos: [side * 0.11, hip - 0.43 * k, 0], color: s.pants, limb: [side * 0.11, hip, 0, side > 0 ? 0 : Math.PI], limbW: 1 });
    b.box(0.17 * thin, 0.08, 0.26, { pos: [side * 0.11, 0.04, 0.05], color: 0x1c1a18, limb: [side * 0.11, hip, 0, side > 0 ? 0 : Math.PI], limbW: 1 });
    // с оружием руки вытянуты вперёд и не болтаются; у ребёнка лампа — в опущенной левой руке
    if (s.flashlight) continue;
    const limb: [number, number, number, number] = [side * 0.29, sh, 0, side > 0 ? Math.PI : 0];
    b.box(0.12 * thin, armLen, 0.13, { pos: [side * 0.29 * thin, sh - armLen / 2, 0], color: s.coat, limb, limbW: 0.75 });
    b.box(0.1, 0.12, 0.11, { pos: [side * 0.29 * thin, sh - armLen - 0.04, 0], color: s.skin, limb, limbW: 0.75 });
    if (s.lantern && side < 0) {
      // керосиновая лампа: дужка, колба, донце — висит под кистью и качается вместе с рукой
      const y = sh - armLen - 0.12;
      const x = side * 0.29 * thin;
      b.box(0.02, 0.1, 0.02, { pos: [x, y, 0], color: 0x2a2a26, limb, limbW: 0.75 });
      b.box(0.13, 0.03, 0.13, { pos: [x, y - 0.06, 0], color: 0x3a3428, limb, limbW: 0.75 });
      b.box(0.1, 0.13, 0.1, { pos: [x, y - 0.14, 0], color: 0xffc070, limb, limbW: 0.75 });
      b.box(0.14, 0.03, 0.14, { pos: [x, y - 0.22, 0], color: 0x3a3428, limb, limbW: 0.75 });
    }
  }
  b.box(0.48 * thin, 0.66 * k, 0.27, { pos: [0, (hip + sh) / 2 + 0.04, 0], color: s.coat, jitter: 0.1 });
  b.box(0.27, 0.3 * k, 0.27, { pos: [0, sh + 0.21 * k, 0.01], rot: [0, 0, s.headTilt ?? 0], color: s.skin });
  if (s.flashlight) {
    // хват двумя руками: правая держит оружие, левая подводит фонарь под ствол
    const shR: [number, number, number] = [0.27 * thin, sh - 0.04, 0];
    const shL: [number, number, number] = [-0.27 * thin, sh - 0.04, 0];
    const handR: [number, number, number] = [0.1, 1.2 * k, 0.4];
    const handL: [number, number, number] = [-0.02, 1.12 * k, 0.36];
    const elbowR: [number, number, number] = [0.26, 1.18 * k, 0.12];
    const elbowL: [number, number, number] = [-0.24, 1.1 * k, 0.12];
    segment(b, shR, elbowR, 0.12, 0.13, { color: s.coat });
    segment(b, elbowR, handR, 0.11, 0.12, { color: s.coat });
    segment(b, shL, elbowL, 0.12, 0.13, { color: s.coat });
    segment(b, elbowL, handL, 0.11, 0.12, { color: s.coat });
    b.box(0.1, 0.1, 0.11, { pos: handR, color: s.skin });
    b.box(0.1, 0.1, 0.11, { pos: handL, color: s.skin });
    // оружие — отдельная модель (своя у каждого ствола), вставляется в правую кисть: HAND_R
    // фонарь: корпус в левой кисти, под стволом; светлое стекло спереди
    b.box(0.07, 0.07, 0.24, { pos: [handL[0] + 0.03, handL[1] + 0.02, handL[2] + 0.12], color: 0x40403c });
    b.box(0.09, 0.09, 0.03, { pos: [handL[0] + 0.03, handL[1] + 0.02, handL[2] + 0.25], color: 0xfff0c8 });
  }
  return b.build();
}

/** Невидевший: закрыл лицо обеими руками; мокрая одежда, кожа цвета речной воды. */
export function unseeingGeometry(): THREE.BufferGeometry {
  const b = new Builder(75);
  const skin = 0x7d8a8c;
  const cloth = 0x2a3034;
  const hip = 0.9;
  for (const side of [-1, 1]) {
    b.box(0.16, 0.88, 0.17, { pos: [side * 0.11, hip - 0.44, 0], color: cloth, limb: [side * 0.11, hip, 0, side > 0 ? 0 : Math.PI], limbW: 1 });
    // плечо → локоть вперёд-вверх → ладонь на лице
    b.box(0.11, 0.36, 0.12, { pos: [side * 0.27, 1.4, 0.1], rot: [-0.9, 0, side * 0.25], color: cloth });
    b.box(0.1, 0.34, 0.11, { pos: [side * 0.12, 1.62, 0.24], rot: [-0.25, 0, side * -0.6], color: skin });
    b.box(0.13, 0.17, 0.05, { pos: [side * 0.055, 1.72, 0.17], rot: [0, 0, side * 0.15], color: skin, jitter: 0.2 });
  }
  b.box(0.46, 0.66, 0.26, { pos: [0, 1.22, 0], color: cloth, jitter: 0.15 });
  b.box(0.25, 0.3, 0.26, { pos: [0, 1.72, 0.0], rot: [0.15, 0, 0], color: skin });
  // мокрые пряди на затылке
  for (let i = 0; i < 5; i++) b.box(0.04, 0.32, 0.03, { pos: [-0.1 + i * 0.05, 1.62, -0.13], color: 0x101414 });
  return b.build();
}

/** Шептун: ползущее существо на четырёх длинных конечностях, голова у земли. */
export function whispererGeometry(): THREE.BufferGeometry {
  const b = new Builder(71);
  const skin = 0x8e877c;
  b.box(0.34, 0.24, 0.95, { pos: [0, 0.62, 0], rot: [-0.18, 0, 0], color: skin, jitter: 0.2 });
  b.box(0.26, 0.22, 0.3, { pos: [0, 0.5, 0.62], rot: [0.4, 0, 0], color: 0xa29a8e });
  b.box(0.2, 0.06, 0.12, { pos: [0, 0.4, 0.74], color: 0x140c0c }); // рот
  const limbs: [number, number, number][] = [
    [-0.2, 0.65, 0.35],
    [0.2, 0.65, 0.35],
    [-0.2, 0.62, -0.38],
    [0.2, 0.62, -0.38],
  ];
  limbs.forEach(([x, y, z], i) => {
    const phase = i === 0 || i === 3 ? 0 : Math.PI;
    b.box(0.07, 0.8, 0.07, { pos: [x * 1.6, y - 0.32, z + 0.08], rot: [0.25, 0, x > 0 ? -0.35 : 0.35], color: skin, limb: [x, y, z, phase], limbW: 1 });
  });
  // лишняя пара тонких рук, тянущихся вперёд
  for (const side of [-1, 1]) {
    b.box(0.04, 0.04, 0.7, { pos: [side * 0.14, 0.42, 0.9], rot: [0.3, side * 0.2, 0], color: 0x7e786e, limb: [side * 0.14, 0.5, 0.6, side > 0 ? 1.2 : 2.7], limbW: 0.5 });
  }
  return b.build();
}

/** Немой: огромный, сгорбленный, безликий; руки до земли. */
export function muteGeometry(): THREE.BufferGeometry {
  const b = new Builder(81);
  const skin = 0x5a524a;
  b.box(1.1, 1.05, 0.8, { pos: [0, 1.75, 0.15], rot: [0.45, 0, 0], color: skin, jitter: 0.2 });
  b.box(0.85, 0.6, 0.65, { pos: [0, 1.0, 0], color: 0x4a443e });
  b.box(0.38, 0.4, 0.38, { pos: [0, 2.15, 0.62], rot: [0.6, 0, 0], color: 0x6a625a }); // голова без лица
  b.box(0.3, 0.03, 0.04, { pos: [0, 2.05, 0.82], rot: [0.6, 0, 0], color: 0x1a1210 }); // зашитый рот
  for (const side of [-1, 1]) {
    b.box(0.26, 1.7, 0.28, { pos: [side * 0.72, 1.25, 0.35], rot: [0.15, 0, side * -0.08], color: skin, limb: [side * 0.62, 2.1, 0.3, side > 0 ? 0 : Math.PI], limbW: 0.6 });
    b.box(0.34, 0.22, 0.4, { pos: [side * 0.76, 0.38, 0.45], color: 0x3a342e, limb: [side * 0.62, 2.1, 0.3, side > 0 ? 0 : Math.PI], limbW: 0.6 });
    b.box(0.3, 0.75, 0.32, { pos: [side * 0.25, 0.38, -0.05], color: 0x403a34, limb: [side * 0.25, 0.75, 0, side > 0 ? Math.PI : 0], limbW: 0.8 });
  }
  return b.build();
}

/**
 * Лицо для скримера: голова и отдельная челюсть (она отвисает). Асимметрия, пустые глазницы
 * со зрачками-точками, мокрые пряди — «почти лицо», которое мозг не может принять.
 */
export function faceGeometry(): { head: THREE.BufferGeometry; jaw: THREE.BufferGeometry } {
  const b = new Builder(91);
  b.box(0.5, 0.62, 0.42, { pos: [0, 0.12, 0], rot: [0, 0, 0.05], color: 0x9c968a, jitter: 0.35 });
  b.box(0.46, 0.2, 0.4, { pos: [0.02, 0.48, -0.02], rot: [0, 0, -0.12], color: 0x8a8478, jitter: 0.3 });
  // глазницы разной высоты и размера
  b.box(0.16, 0.2, 0.05, { pos: [-0.12, 0.16, 0.215], rot: [0, 0, 0.18], color: 0x020101 });
  b.box(0.11, 0.14, 0.05, { pos: [0.13, 0.22, 0.215], rot: [0, 0, -0.1], color: 0x020101 });
  // зрачки-точки: смотрят в разные стороны
  b.box(0.022, 0.022, 0.02, { pos: [-0.1, 0.13, 0.245], color: 0xf0ece0 });
  b.box(0.018, 0.018, 0.02, { pos: [0.15, 0.24, 0.245], color: 0xf0ece0 });
  // потёки из глаз
  b.box(0.025, 0.22, 0.02, { pos: [-0.14, -0.02, 0.232], color: 0x2a0606 });
  b.box(0.02, 0.16, 0.02, { pos: [0.12, 0.08, 0.232], color: 0x2a0606 });
  b.box(0.035, 0.1, 0.05, { pos: [0.0, 0.0, 0.215], color: 0x2a2220 });
  // верхние зубы
  for (let i = 0; i < 7; i++) b.box(0.02, 0.05 + (i % 3) * 0.02, 0.02, { pos: [-0.075 + i * 0.025, -0.16, 0.225], color: 0xb0a890 });
  b.box(0.2, 0.06, 0.05, { pos: [0, -0.13, 0.205], color: 0x080303 });
  // мокрые пряди — висят по бокам до подбородка и ниже
  for (let i = 0; i < 9; i++) {
    const side = i < 5 ? -1 : 1;
    const k = i % 5;
    b.box(0.035, 0.7 + k * 0.08, 0.035, { pos: [side * (0.2 + k * 0.025), 0.05 - k * 0.04, 0.1 + k * 0.02], rot: [0, 0, side * 0.08], color: 0x0c0d0d });
  }
  const jaw = new Builder(92);
  // челюсть: петля сверху-сзади (ноль координат), рот — чёрная пасть
  jaw.box(0.4, 0.2, 0.38, { pos: [0, -0.1, 0.02], color: 0x948e82, jitter: 0.35 });
  jaw.box(0.2, 0.08, 0.06, { pos: [0, -0.02, 0.2], color: 0x060202 });
  for (let i = 0; i < 6; i++) jaw.box(0.02, 0.05, 0.02, { pos: [-0.06 + i * 0.025, 0.02, 0.21], color: 0xa89f88 });
  return { head: b.build(), jaw: jaw.build() };
}

/**
 * Хор: одиннадцать тел, вросших друг в друга спинами, — кольцо лиц наружу, рты открыты.
 * Ноги общие, короткие; тело качается в такт вальса (анимация конечностей).
 */
export function choirGeometry(): THREE.BufferGeometry {
  const b = new Builder(97);
  const rng = new Rng(97);
  const skin = 0x6f6a62;
  const cloth = 0x2e2a26;
  b.box(1.5, 1.2, 1.5, { pos: [0, 0.75, 0], color: 0x3a342e, jitter: 0.25 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = 0.62 + rng.range(-0.08, 0.1);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const hgt = 1.9 + rng.range(-0.25, 0.3);
    const tilt = rng.range(0.1, 0.35);
    // туловище наклонено наружу
    b.box(0.42, 0.9, 0.26, { pos: [x * 1.1, hgt - 0.55, z * 1.1], rot: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt], color: cloth, jitter: 0.2 });
    // голова и чёрный провал рта
    const hx = Math.sin(a) * (r + 0.3);
    const hz = Math.cos(a) * (r + 0.3);
    b.box(0.24, 0.3, 0.24, { pos: [hx, hgt, hz], rot: [rng.range(-0.4, 0.2), a, rng.range(-0.3, 0.3)], color: skin, jitter: 0.15 });
    b.box(0.1, 0.13, 0.05, { pos: [Math.sin(a) * (r + 0.43), hgt - 0.06, Math.cos(a) * (r + 0.43)], rot: [0, a, 0], color: 0x0a0606 });
    // руки висят и качаются
    const side = i % 2 === 0 ? 1 : -1;
    b.box(0.09, 0.8, 0.1, {
      pos: [Math.sin(a) * (r + 0.2) + Math.cos(a) * 0.2 * side, hgt - 0.85, Math.cos(a) * (r + 0.2) - Math.sin(a) * 0.2 * side],
      color: skin,
      limb: [Math.sin(a) * r, hgt - 0.45, Math.cos(a) * r, a],
      limbW: 0.5,
    });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0.2, 0.7, 0.2, { pos: [Math.sin(a) * 0.55, 0.35, Math.cos(a) * 0.55], color: cloth, limb: [Math.sin(a) * 0.55, 0.7, Math.cos(a) * 0.55, i % 2 ? 0 : Math.PI], limbW: 1 });
  }
  return b.build();
}

/** Развалины двенадцатого двора на дне пруда: нижние венцы, печь, притолока. */
export function ruinGeometry(): THREE.BufferGeometry {
  const b = new Builder(121);
  const wood = 0x2a2620;
  const W = 5.6;
  const D = 4.6;
  for (let k = 0; k < 3; k++) {
    const y = 0.15 + k * 0.28;
    const cut = k === 2 ? 0.55 : 1;
    b.box(W * cut, 0.26, 0.26, { pos: [-(W * (1 - cut)) / 2, y, D / 2], color: wood, jitter: 0.3 });
    b.box(W * (k === 1 ? 0.7 : 1), 0.26, 0.26, { pos: [0, y, -D / 2], color: wood, jitter: 0.3 });
    b.box(0.26, 0.26, D * (k === 2 ? 0.4 : 1), { pos: [-W / 2, y, k === 2 ? -D * 0.3 : 0], color: wood, jitter: 0.3 });
    if (k < 2) b.box(0.26, 0.26, D, { pos: [W / 2, y, 0], color: wood, jitter: 0.3 });
  }
  // печь — уцелела
  b.box(1.1, 1.6, 1.1, { pos: [1.4, 0.8, -1.2], color: 0x5c5650, jitter: 0.2 });
  b.box(0.45, 0.9, 0.45, { pos: [1.5, 2.0, -1.3], color: 0x4c4640 });
  // притолока с вырезанной буквой — косо стоящая рама двери
  b.box(0.16, 1.9, 0.16, { pos: [-0.6, 0.95, D / 2 + 0.05], rot: [0, 0, 0.12], color: wood });
  b.box(0.16, 1.7, 0.16, { pos: [0.5, 0.85, D / 2 + 0.05], rot: [0, 0, 0.05], color: wood });
  b.box(1.3, 0.2, 0.2, { pos: [0, 1.88, D / 2 + 0.05], rot: [0, 0, 0.09], color: 0x3a342c });
  return b.build();
}

/** Заслонка на запруде: два бетонных быка, ржавый щит, ворот с колесом. */
export function sluiceGeometry(): THREE.BufferGeometry {
  const b = new Builder(131);
  const conc = 0x5a5a56;
  const rust = 0x5a3a26;
  for (const side of [-1, 1]) b.box(0.9, 3.4, 1.4, { pos: [side * 2.1, 1.2, 0], color: conc, jitter: 0.2 });
  b.box(3.4, 2.6, 0.18, { pos: [0, 0.9, 0], color: rust, jitter: 0.35 });
  for (let i = 0; i < 4; i++) b.box(3.4, 0.08, 0.24, { pos: [0, 0.1 + i * 0.7, 0], color: 0x3a2618 });
  b.box(5.2, 0.25, 0.6, { pos: [0, 3.0, 0], color: conc });
  b.box(0.12, 1.2, 0.12, { pos: [0, 3.7, 0], color: 0x2a2a28 });
  b.add(new THREE.TorusGeometry(0.45, 0.05, 4, 12), { pos: [0, 4.3, 0.1], color: 0x4a2c1a });
  return b.build();
}

/** Лодка-плоскодонка: днище, борта, нос, банка и весло. Нос — в +z. */
export function boatGeometry(): THREE.BufferGeometry {
  const b = new Builder(141);
  const wood = 0x4a3a2a;
  b.box(1.1, 0.1, 2.8, { pos: [0, 0.05, 0], color: 0x2e241a, jitter: 0.2 });
  for (const s of [-1, 1]) b.box(0.08, 0.36, 2.8, { pos: [s * 0.55, 0.22, 0], color: wood, jitter: 0.25 });
  b.box(1.1, 0.36, 0.08, { pos: [0, 0.22, -1.4], color: wood });
  b.box(0.9, 0.36, 0.08, { pos: [0, 0.3, 1.5], rot: [-0.5, 0, 0], color: wood });
  b.box(1.0, 0.06, 0.3, { pos: [0, 0.32, -0.2], color: 0x5a4a38 });
  b.box(0.05, 0.05, 2.1, { pos: [0.4, 0.42, 0.3], rot: [0.05, 0.3, 0], color: 0x6a5a44 });
  return b.build();
}

// ------------------------------------------------------------------ оружие и находки

const ALONG_Z: [number, number, number] = [Math.PI / 2, 0, 0];

/**
 * Оружие: рукоять в начале координат (там, где кисть), ствол — в +z.
 * Одна и та же модель — в руках игрока и Отголоска, на земле и в карточке находки.
 */
export function weaponGeometry(id: string): THREE.BufferGeometry {
  const b = new Builder(151);
  const metal = 0x2a2a2c;
  const dark = 0x1c1c1e;
  const wood = 0x5a3a22;
  if (id === 'shotgun') {
    // обрез: два ствола, укороченное ложе с пистолетной рукоятью
    b.box(0.05, 0.11, 0.07, { pos: [0, -0.04, -0.02], rot: [0.35, 0, 0], color: wood, jitter: 0.2 });
    b.box(0.06, 0.07, 0.12, { pos: [0, 0.05, 0.05], color: metal });
    for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.019, 0.019, 0.42, 6), { pos: [s * 0.019, 0.075, 0.32], rot: ALONG_Z, color: dark });
    b.box(0.06, 0.04, 0.17, { pos: [0, 0.035, 0.22], color: wood, jitter: 0.2 });
  } else if (id === 'rifle') {
    // карабин: длинное деревянное ложе с прикладом, ствол, рукоять затвора
    b.box(0.05, 0.075, 0.78, { pos: [0, 0.035, 0.08], color: wood, jitter: 0.15 });
    b.box(0.05, 0.13, 0.2, { pos: [0, -0.01, -0.28], rot: [-0.12, 0, 0], color: wood, jitter: 0.15 });
    b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), { pos: [0, 0.08, 0.62], rot: ALONG_Z, color: dark });
    b.box(0.04, 0.05, 0.16, { pos: [0, 0.085, 0.06], color: metal });
    b.box(0.06, 0.015, 0.015, { pos: [0.04, 0.09, 0.02], color: metal });
    b.box(0.03, 0.03, 0.02, { pos: [0.075, 0.08, 0.02], color: metal });
  } else if (id === 'smg') {
    // «дедов автомат»: деревянный приклад, кожух ствола, круглый диск снизу
    b.box(0.05, 0.09, 0.26, { pos: [0, 0.0, -0.13], rot: [-0.08, 0, 0], color: wood, jitter: 0.15 });
    b.box(0.06, 0.07, 0.22, { pos: [0, 0.06, 0.1], color: metal });
    b.box(0.052, 0.052, 0.22, { pos: [0, 0.07, 0.32], color: 0x343436 });
    for (let i = 0; i < 4; i++) b.box(0.054, 0.012, 0.025, { pos: [0, 0.098, 0.25 + i * 0.045], color: dark });
    b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), { pos: [0, -0.035, 0.1], rot: [0, 0, Math.PI / 2], color: metal });
  } else if (id === 'flaregun') {
    // ракетница: толстый короткий ствол, оранжевая пластмасса
    const orange = 0xc25a1a;
    b.box(0.05, 0.12, 0.06, { pos: [0, -0.04, 0], rot: [0.3, 0, 0], color: orange, jitter: 0.15 });
    b.box(0.06, 0.07, 0.1, { pos: [0, 0.05, 0.04], color: orange });
    b.add(new THREE.CylinderGeometry(0.036, 0.036, 0.2, 10), { pos: [0, 0.07, 0.18], rot: ALONG_Z, color: 0xb04a14 });
    b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 10), { pos: [0, 0.07, 0.285], rot: ALONG_Z, color: 0x140a06 });
  } else {
    // револьвер: деревянные щёчки, рамка, барабан, ствол, курок
    b.box(0.045, 0.12, 0.06, { pos: [0, -0.04, -0.01], rot: [0.3, 0, 0], color: 0x4a3020, jitter: 0.2 });
    b.box(0.045, 0.07, 0.1, { pos: [0, 0.05, 0.04], color: metal });
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), { pos: [0, 0.055, 0.08], rot: ALONG_Z, color: 0x3a3a3c });
    b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), { pos: [0, 0.075, 0.21], rot: ALONG_Z, color: dark });
    b.box(0.015, 0.04, 0.02, { pos: [0, 0.1, 0.0], rot: [-0.5, 0, 0], color: dark });
  }
  return b.build();
}

/** Находки (не оружие): цинк с патронами, аптечка, связка шашек, батарейки. Стоят на земле, центр в нуле. */
export function itemGeometry(id: string): THREE.BufferGeometry {
  const b = new Builder(161);
  if (id === 'med') {
    b.box(0.34, 0.14, 0.24, { pos: [0, 0.07, 0], color: 0xd8d4c8, jitter: 0.08 });
    b.box(0.36, 0.02, 0.26, { pos: [0, 0.145, 0], color: 0xbab6aa });
    b.box(0.14, 0.012, 0.045, { pos: [0, 0.157, 0], color: 0xa02020 });
    b.box(0.045, 0.012, 0.14, { pos: [0, 0.158, 0], color: 0xa02020 });
    b.box(0.08, 0.03, 0.02, { pos: [0, 0.16, -0.13], color: 0x4a4640 });
  } else if (id === 'dynamite') {
    for (let i = 0; i < 3; i++) b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), { pos: [(i - 1) * 0.09, 0.045 + (i === 1 ? 0.07 : 0), 0], rot: ALONG_Z, color: 0x9a3a2a, jitter: 0.15 });
    b.box(0.3, 0.05, 0.04, { pos: [0, 0.07, 0.06], color: 0x2a2420 });
    b.box(0.3, 0.05, 0.04, { pos: [0, 0.07, -0.06], color: 0x2a2420 });
    b.box(0.012, 0.012, 0.14, { pos: [0, 0.16, 0.2], rot: [0.5, 0, 0], color: 0xc8c0a0 });
  } else if (id === 'battery') {
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 10), { pos: [s * 0.05, 0.07, 0], color: 0x2a2a2c, jitter: 0.1 });
      b.add(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 10), { pos: [s * 0.05, 0.125, 0], color: 0xb87333 });
      b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6), { pos: [s * 0.05, 0.15, 0], color: 0x9a9a9a });
    }
  } else {
    // цинк с патронами: зелёный ящик, крышка приоткрыта, сверху — россыпь латуни
    b.box(0.34, 0.15, 0.22, { pos: [0, 0.075, 0], color: 0x3c4a32, jitter: 0.12 });
    b.box(0.35, 0.02, 0.23, { pos: [0, 0.16, -0.03], rot: [-0.25, 0, 0], color: 0x34402c });
    for (let i = 0; i < 5; i++) {
      b.add(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 6), { pos: [-0.12 + i * 0.06, 0.19, 0.05], rot: [Math.PI / 2, 0, 0.3 * i], color: 0xc8a050 });
    }
  }
  return b.build();
}
