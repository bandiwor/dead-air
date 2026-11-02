import * as THREE from 'three';
import { Rng } from '../core/rng';
import { distToSegment, smoothstep } from '../core/math';
import { WORLD, heightAt } from '../proc/terrain';
import type { Layout } from '../proc/layout';
import { fbm } from '../proc/noise';
import type { TextureSet } from './textures';
import { triplanar } from './materials';
import { INTERIORS } from '../content/interiors';
import {
  barrelGeometry, birchGeometry, deadTreeGeometry, doorGeometry, fenceGeometry, furnitureGeometry, grassGeometry, houseGeometry, switchGeometry,
  pierGeometry, poleGeometry, rockGeometry, spruceGeometry, wellGeometry,
} from './models';

export const COLORS = {
  fog: 0x05080b,
  sodium: 0xe8a33d,
  phosphor: 0x7fd6c2,
  windowLit: 0xd8912e,
  windowDark: 0x0b1014,
};

export interface WorldView {
  root: THREE.Group;
  windowMats: THREE.MeshBasicMaterial[];
  barrels: THREE.InstancedMesh;
  water: THREE.Mesh;
  poleLamp: THREE.Mesh;
  poleLight: THREE.PointLight;
  hutLight: THREE.PointLight;
  /** По дому: крыша (скрывается изнутри), петля двери, высота пола. */
  roofs: THREE.Mesh[];
  doors: THREE.Object3D[];
  interiorLight: THREE.PointLight;
  houseY: number[];
}

const PATHS: [number, number, number, number][] = [
  [0, 0, -5, -31],
  [0, 0, 11, 18.5],
  [0, 0, -13, -5],
  [0, 0, -12.5, 9],
  [0, 0, -2, 13.5],
  [0, 0, 13, -11],
  [0, 0, -3, -15],
  [0, 0, 12.5, 4.5],
  [0, 0, 6.5, -4.5],
];

function terrainColor(x: number, z: number, h: number, out: THREE.Color): void {
  const n = fbm(x * 0.08, z * 0.08, 77, 3);
  const n2 = fbm(x * 0.3, z * 0.3, 78, 2);
  // трава: тёмная, местами выгоревшая
  out.setRGB(0.05 + n * 0.035, 0.065 + n * 0.04, 0.035 + n2 * 0.015);
  let path = 0;
  for (const [ax, az, bx, bz] of PATHS) path = Math.max(path, smoothstep(1.7, 0.6, distToSegment(x, z, ax, az, bx, bz) + (n2 - 0.5) * 0.8));
  const square = smoothstep(9, 5, Math.hypot(x, z) + (n - 0.5) * 3);
  const dirt = Math.max(path, square);
  if (dirt > 0) out.lerp(new THREE.Color(0.07 + n2 * 0.03, 0.055 + n2 * 0.02, 0.04), dirt);
  // ил у воды
  if (h < WORLD.waterLevel + 0.7) out.lerp(new THREE.Color(0.03, 0.03, 0.025), smoothstep(WORLD.waterLevel + 0.7, WORLD.waterLevel, h));
  // камень в расщелине и на крутых местах холма
  const c = WORLD.crevice;
  const dc = distToSegment(x, z, c.ax, c.az, c.bx, c.bz);
  const rock = smoothstep(c.w * 1.6, c.w * 0.6, dc) * smoothstep(-40, -32, -z - 0) + smoothstep(5, 9, h) * 0.5;
  if (rock > 0) out.lerp(new THREE.Color(0.06, 0.058, 0.055), Math.min(1, rock));
  // в глубине Щели — темнее
  if (h < -0.5 && dc < c.w) out.multiplyScalar(0.6);
}

export function buildWorldView(layout: Layout, tex: TextureSet, quality: number): WorldView {
  const root = new THREE.Group();
  const rng = new Rng(4242);

  // ----- рельеф
  const SIZE = WORLD.half * 2 + 20;
  const SEG = quality >= 2 ? 180 : quality === 1 ? 150 : 110;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    terrainColor(x, z, h, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  const groundMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.ground, vertexColors: true, color: 0xffffff }), { scale: 0.45 });
  groundMat.color.setScalar(4.2);
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = true;
  root.add(ground);

  // ----- вода
  const wg = new THREE.CircleGeometry(WORLD.pond.r * 1.15, 40);
  wg.rotateX(-Math.PI / 2);
  tex.waterNormal.repeat.set(5, 5);
  const water = new THREE.Mesh(
    wg,
    new THREE.MeshStandardMaterial({ color: 0x0a1215, roughness: 0.08, metalness: 0.1, normalMap: tex.waterNormal, normalScale: new THREE.Vector2(0.35, 0.35) }),
  );
  water.position.set(WORLD.pond.x, WORLD.waterLevel, WORLD.pond.z);
  water.receiveShadow = true;
  root.add(water);

  // ----- деревья (три типа, по одному draw call)
  const kinds = [
    { kind: 0, geo: spruceGeometry(1), tex: tex.needles, scale: 0.9 },
    { kind: 1, geo: deadTreeGeometry(2), tex: tex.bark, scale: 0.8 },
    { kind: 2, geo: birchGeometry(3), tex: tex.birch, scale: 0.7 },
  ];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const k of kinds) {
    const list = layout.trees.filter((t) => t.kind === k.kind);
    const mat = triplanar(new THREE.MeshLambertMaterial({ map: k.tex, vertexColors: true }), { scale: k.scale, occluderFade: true, sway: k.kind === 0 ? 0.012 : 0.02 });
    mat.color.setScalar(2.6);
    const im = new THREE.InstancedMesh(k.geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      v.set(t.x, heightAt(t.x, t.z) - 0.1, t.z);
      s.set(t.s, t.s * rng.range(0.9, 1.15), t.s);
      m4.compose(v, q, s);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
  }

  // ----- камни у Щели и на холме
  const rocks = new THREE.InstancedMesh(rockGeometry(5), triplanar(new THREE.MeshLambertMaterial({ map: tex.ground, vertexColors: true }), { scale: 0.7 }), 90);
  (rocks.material as THREE.MeshLambertMaterial).color.setScalar(2.4);
  for (let i = 0; i < 90; i++) {
    const cr = WORLD.crevice;
    const t = rng.next();
    const side = rng.sign();
    const x = cr.ax + (cr.bx - cr.ax) * t + side * rng.range(cr.w * 0.9, cr.w * 3);
    const z = cr.az + (cr.bz - cr.az) * t + rng.range(-1, 1);
    const sc = rng.range(0.3, 1.3);
    q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3)));
    m4.compose(v.set(x, heightAt(x, z) + sc * 0.2, z), q, s.set(sc, sc, sc));
    rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  // ----- трава вокруг деревни
  const grassCount = quality >= 2 ? 4200 : quality === 1 ? 2600 : 1200;
  const grassMat = triplanar(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { scale: 1, sway: 0.12 });
  grassMat.color.setScalar(2.2);
  const grass = new THREE.InstancedMesh(grassGeometry(), grassMat, grassCount);
  let gi = 0;
  for (let tries = 0; tries < grassCount * 4 && gi < grassCount; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 42;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < WORLD.waterLevel + 0.25) continue;
    if (Math.hypot(x, z) < 6) continue;
    let onPath = false;
    for (const [ax, az, bx, bz] of PATHS) if (distToSegment(x, z, ax, az, bx, bz) < 1.1) onPath = true;
    if (onPath) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
    const sc = rng.range(0.7, 1.5);
    m4.compose(v.set(x, h, z), q, s.set(sc, sc * rng.range(0.8, 1.4), sc));
    grass.setMatrixAt(gi++, m4);
  }
  grass.count = gi;
  grass.receiveShadow = true;
  root.add(grass);

  // ----- дома: всё сливается по материалам
  const wallParts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];
  const windowMats: THREE.MeshBasicMaterial[] = [];
  const place = (g: THREE.BufferGeometry, x: number, z: number, rot: number, y: number): THREE.BufferGeometry => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1)));
    return g;
  };
  const allHouses = [...layout.houses, layout.hut];
  const roofMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.roof, vertexColors: true }), { scale: 0.5, occluderFade: true });
  roofMat.color.setScalar(1.6);
  const plankMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.planks, vertexColors: true }), { scale: 0.9, occluderFade: true });
  plankMat.color.setScalar(1.7);
  const furnMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.planks, vertexColors: true }), { scale: 1.1 });
  furnMat.color.setScalar(1.7);
  const roofs: THREE.Mesh[] = [];
  const doors: THREE.Object3D[] = [];
  const furnParts: THREE.BufferGeometry[] = [];
  const houseY: number[] = [];
  for (const h of allHouses) {
    const y = heightAt(h.x, h.z) + 0.04;
    const isHut = h === layout.hut;
    const parts = houseGeometry(h.w, h.d, h.h, 100 + h.id, isHut, !isHut);
    wallParts.push(place(parts.walls, h.x, h.z, h.rot, y));
    trimParts.push(place(parts.trim, h.x, h.z, h.rot, y));
    // крыша у каждого дома своя — её снимают, когда игрок внутри
    const roof = new THREE.Mesh(place(parts.roof, h.x, h.z, h.rot, y), roofMat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    root.add(roof);
    const wm = new THREE.MeshBasicMaterial({ color: h.lit ? COLORS.windowLit : COLORS.windowDark, fog: true });
    const wmesh = new THREE.Mesh(place(parts.windows, h.x, h.z, h.rot, y), wm);
    root.add(wmesh);
    if (isHut) continue;
    roofs.push(roof);
    windowMats.push(wm);
    houseY.push(y);
    // дверь на петле: группа в проёме, полотно поворачивается внутрь
    const hinge = new THREE.Group();
    const door = new THREE.Mesh(doorGeometry(), plankMat);
    door.castShadow = true;
    hinge.add(door);
    const c = Math.cos(h.rot);
    const sn = Math.sin(h.rot);
    const lx = -0.62;
    const lz = h.d / 2 - 0.09;
    const holder = new THREE.Group();
    holder.position.set(h.x + lx * c + lz * sn, y, h.z - lx * sn + lz * c);
    holder.rotation.y = h.rot;
    holder.add(hinge);
    root.add(holder);
    doors.push(hinge);
    const it = INTERIORS.find((i) => i.house === h.id);
    if (it) furnParts.push(place(furnitureGeometry(it.furniture, h.w, h.d, 500 + h.id), h.x, h.z, h.rot, y));
  }
  const furniture = new THREE.Mesh(mergeAll(furnParts), furnMat);
  furniture.castShadow = true;
  furniture.receiveShadow = true;
  root.add(furniture);
  // свет внутри дома, где игрок (одна лампа на всех — число источников постоянно)
  const interiorLight = new THREE.PointLight(0xffb060, 0, 7, 1.5);
  root.add(interiorLight);
  // рубильник на стене радиоузла
  {
    const hut = layout.hut;
    const sw = new THREE.Mesh(switchGeometry(), plankMat);
    const lx = -hut.w / 2 - 0.06;
    sw.position.set(hut.x + lx * Math.cos(hut.rot), heightAt(hut.x, hut.z), hut.z - lx * Math.sin(hut.rot));
    sw.rotation.y = hut.rot - Math.PI / 2;
    root.add(sw);
  }
  const mergedMesh = (parts: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(mergeAll(parts), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const logsMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.logs, vertexColors: true }), { scale: 0.7, occluderFade: true });
  logsMat.color.setScalar(1.6);
  mergedMesh(wallParts, logsMat);
  mergedMesh(trimParts, plankMat);

  // ----- столб с громкоговорителем
  const pole = new THREE.Mesh(poleGeometry(), triplanar(new THREE.MeshLambertMaterial({ map: tex.planks, vertexColors: true }), { scale: 1.2, occluderFade: true }));
  (pole.material as THREE.MeshLambertMaterial).color.setScalar(1.8);
  pole.position.set(layout.pole.x, heightAt(layout.pole.x, layout.pole.z), layout.pole.z);
  pole.castShadow = true;
  root.add(pole);
  const poleLamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: COLORS.sodium }));
  poleLamp.position.set(layout.pole.x + 0.55, pole.position.y + 5.9, layout.pole.z);
  root.add(poleLamp);
  const poleLight = new THREE.PointLight(COLORS.sodium, 60, 17, 1.6);
  poleLight.position.copy(poleLamp.position).add(new THREE.Vector3(0, -0.3, 0));
  root.add(poleLight);

  // ----- радиоузел: антенна и лампа у двери
  const hut = layout.hut;
  const hy = heightAt(hut.x, hut.z);
  const antenna = new THREE.Mesh(
    mergeAll([
      new THREE.CylinderGeometry(0.04, 0.06, 6, 5).translate(hut.x - 1.2, hy + 3, hut.z - 1),
      new THREE.BoxGeometry(1.6, 0.04, 0.04).translate(hut.x - 1.2, hy + 5.6, hut.z - 1),
      new THREE.BoxGeometry(1.1, 0.04, 0.04).translate(hut.x - 1.2, hy + 5.0, hut.z - 1),
    ].map((g) => g.toNonIndexed())),
    new THREE.MeshLambertMaterial({ color: 0x3a3c38 }),
  );
  antenna.castShadow = true;
  root.add(antenna);
  const hutLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: COLORS.sodium }));
  hutLamp.position.set(layout.hutDoor.x + 0.6, hy + 2.1, layout.hutDoor.z - 0.85);
  root.add(hutLamp);
  const hutLight = new THREE.PointLight(COLORS.sodium, 18, 8, 1.6);
  hutLight.position.copy(hutLamp.position).add(new THREE.Vector3(0, -0.2, 0.4));
  root.add(hutLight);

  // ----- пристань с лодкой, колодец, заборы
  const pr = WORLD.pier;
  const pier = new THREE.Mesh(pierGeometry(pr.x0, pr.x1, pr.z0, pr.z1, pr.y, 7), triplanar(new THREE.MeshLambertMaterial({ map: tex.planks, vertexColors: true }), { scale: 1 }));
  (pier.material as THREE.MeshLambertMaterial).color.setScalar(1.6);
  pier.castShadow = pier.receiveShadow = true;
  root.add(pier);

  const h2 = layout.houses[2]!;
  const well = new THREE.Mesh(wellGeometry(), plankMat);
  well.position.set(h2.x - 4.2, heightAt(h2.x - 4.2, h2.z - 1), h2.z - 1);
  well.castShadow = true;
  root.add(well);

  const fenceParts = layout.fences.map((f, i) => {
    const g = fenceGeometry(f.ax, f.az, f.bx, f.bz, 300 + i);
    const p = g.attributes.position!;
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + heightAt(p.getX(k), p.getZ(k)));
    return g;
  });
  mergedMesh(fenceParts, plankMat);

  // ----- бочки с горючим
  const barrelMat = triplanar(new THREE.MeshLambertMaterial({ map: tex.metal, vertexColors: true }), { scale: 1.4 });
  barrelMat.color.setScalar(2.2);
  const barrels = new THREE.InstancedMesh(barrelGeometry(), barrelMat, layout.barrels.length);
  layout.barrels.forEach((b, i) => {
    m4.compose(v.set(b.x, heightAt(b.x, b.z), b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), s.set(1, 1, 1));
    barrels.setMatrixAt(i, m4);
  });
  barrels.castShadow = true;
  root.add(barrels);

  return { root, windowMats, barrels, water, poleLamp, poleLight, hutLight, roofs, doors, interiorLight, houseY };
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // все части собраны Builder'ом — атрибуты совпадают; для «сырых» геометрий оставляем только общие
  const names = Object.keys(parts[0]!.attributes).filter((n) => parts.every((p) => p.attributes[n]));
  for (const p of parts) for (const n of Object.keys(p.attributes)) if (!names.includes(n)) p.deleteAttribute(n);
  const total = parts.reduce((a, p) => a + p.attributes.position!.count, 0);
  const g = new THREE.BufferGeometry();
  for (const n of names) {
    const size = parts[0]!.attributes[n]!.itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const p of parts) {
      const a = p.attributes[n] as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, off);
      off += a.count * size;
    }
    g.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  g.computeBoundingSphere();
  return g;
}
