import { dampAngle } from '../core/math';
import * as THREE from 'three';
import { Kind } from '../content/enemies';
import type { World } from '../sim/world';
import { WORLD, heightAt } from '../proc/terrain';
import type { TextureSet } from './textures';
import { creature } from './materials';
import { WEAPONS } from '../content/weapons';
import { HAND_R, choirGeometry, dynamiteGeometry, itemGeometry, weaponGeometry, faceGeometry, humanoidGeometry, muteGeometry, unseeingGeometry, whispererGeometry } from './models';

interface Herd {
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  fx: THREE.InstancedBufferAttribute;
}

function herd(geo: THREE.BufferGeometry, mat: THREE.MeshLambertMaterial, max: number, shadows = true): Herd {
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const fx = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  anim.setUsage(THREE.DynamicDrawUsage);
  fx.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iAnim', anim);
  geo.setAttribute('iFx', fx);
  const mesh = new THREE.InstancedMesh(geo, creature(mat), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  if (shadows) {
    mesh.castShadow = true;
    mesh.customDepthMaterial = creature(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), true);
  }
  mesh.receiveShadow = true;
  return { mesh, anim, fx };
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const sc = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Визуальное представление динамических сущностей. Читает World, ничего в него не пишет. */
export class ActorsView {
  readonly root = new THREE.Group();
  private readonly player: Herd;
  /** Младший Ивашов во флешбэке: ниже ростом, без оружия, с лампой. */
  private readonly child: Herd;
  private readonly herds: Record<number, Herd>;
  /** Оружие в руках (игрок, Отголоски) — по модели на ствол. */
  private readonly guns: Herd[];
  /** Находки на земле: оружие (по стволу) и прочее (патроны, шашки, аптечка, батарейки). */
  private readonly groundGuns: THREE.InstancedMesh[];
  private readonly groundItems: Record<number, THREE.InstancedMesh>;
  private readonly dynamite: THREE.InstancedMesh;
  readonly face: THREE.Group;
  readonly faceJaw: THREE.Mesh;
  /** Янтарные искры у того, что стоит осмотреть. */
  private readonly glints: THREE.InstancedMesh;
  private readonly phases = new Map<number, number>();
  private playerPhase = 0;
  /** Видимый поворот игрока: симуляция разворачивает мгновенно (выстрел точно в прицел), глаз — за ~0.1 с. */
  visualYaw = 0;
  private time = 0;

  constructor(tex: TextureSet) {
    const coat = new THREE.MeshLambertMaterial({ map: tex.cloth, vertexColors: true });
    coat.color.setScalar(1.8);
    this.player = herd(humanoidGeometry({ height: 1.8, coat: 0x3a3a34, skin: 0x9a8270, pants: 0x262624, flashlight: true }), coat, 1);
    this.child = herd(humanoidGeometry({ height: 1.25, coat: 0x4a3e30, skin: 0xa88a74, pants: 0x2a2620, thin: 0.85, lantern: true }), coat, 1);
    const skin = (k: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ map: tex.skin, vertexColors: true });
      m.color.setScalar(k);
      return m;
    };
    const echoMat = new THREE.MeshLambertMaterial({ map: tex.cloth, vertexColors: true, emissive: 0x0c2a26 });
    echoMat.color.setScalar(1.6);
    this.herds = {
      [Kind.Whisperer]: herd(whispererGeometry(), skin(1.7), 48),
      [Kind.Mute]: herd(muteGeometry(), skin(1.6), 8),
      [Kind.Echo]: herd(humanoidGeometry({ height: 1.8, coat: 0x6a7672, skin: 0x8a9490, pants: 0x4a5450, flashlight: true }), echoMat, 4),
      [Kind.Apparition]: herd(
        humanoidGeometry({ height: 2.35, coat: 0x060606, skin: 0x0a0a0a, pants: 0x050505, thin: 0.7, armLen: 1.05, headTilt: 0.45 }),
        new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x111111 }),
        4,
        false,
      ),
      [Kind.Unseeing]: herd(unseeingGeometry(), skin(1.5), 24),
      [Kind.Choir]: herd(choirGeometry(), skin(1.4), 1),
    };
    this.root.add(this.player.mesh, this.child.mesh);
    for (const h of Object.values(this.herds)) this.root.add(h.mesh);

    const gunMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    gunMat.color.setScalar(1.5);
    this.guns = WEAPONS.map((wd) => {
      // оружие у самого фонаря: тени не отбрасывает, иначе ствол рисует чёрную полосу посреди луча
      const hgun = herd(weaponGeometry(wd.id).translate(...HAND_R), gunMat, 5, false);
      this.root.add(hgun.mesh);
      return hgun;
    });
    // находки чуть светятся тёплым — их видно в темноте, как раньше ящики
    const lootMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1a06 });
    lootMat.color.setScalar(1.5);
    this.groundGuns = WEAPONS.map((wd) => new THREE.InstancedMesh(weaponGeometry(wd.id).rotateZ(Math.PI / 2).translate(0, 0.05, 0).scale(1.25, 1.25, 1.25), lootMat, 4));
    this.groundItems = {
      0: new THREE.InstancedMesh(itemGeometry('ammo'), lootMat, 12),
      2: new THREE.InstancedMesh(itemGeometry('dynamite'), lootMat, 12),
      3: new THREE.InstancedMesh(itemGeometry('med'), lootMat, 12),
      4: new THREE.InstancedMesh(itemGeometry('battery'), lootMat, 12),
    };
    this.dynamite = new THREE.InstancedMesh(dynamiteGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), 16);
    for (const m of [...this.groundGuns, ...Object.values(this.groundItems), this.dynamite]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.root.add(m);
    }

    // лицо светится собственным бледным светом — оно должно читаться даже в полной темноте
    this.glints = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffc070 }), 32);
    this.glints.count = 0;
    this.glints.frustumCulled = false;
    this.root.add(this.glints);

    const faceMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.skin, fog: false });
    faceMat.color.setScalar(1.15);
    const fg = faceGeometry();
    this.face = new THREE.Group();
    this.face.add(new THREE.Mesh(fg.head, faceMat));
    this.faceJaw = new THREE.Mesh(fg.jaw, faceMat);
    this.faceJaw.position.set(0, -0.17, -0.02);
    this.face.add(this.faceJaw);
    this.face.visible = false;
  }

  update(w: World, dt: number, barrels: THREE.InstancedMesh): void {
    this.time += dt;
    const p = w.player;

    // игрок
    const speed = Math.hypot(p.vx, p.vz);
    this.playerPhase += speed * dt * 2.3;
    this.visualYaw = dampAngle(this.visualYaw, p.yaw, 28, dt);
    const isChild = !!w.cfg.night.child;
    const ph = isChild ? this.child : this.player;
    const other = isChild ? this.player : this.child;
    this.writeInstance(ph, 0, p.x, p.y, p.z, this.visualYaw, this.playerPhase * (isChild ? 1.4 : 1), Math.min(1, speed / 4.7) * 0.75, p.invuln > 0.25 ? 0.6 : 0, 1, 0, 0, 0);
    ph.mesh.count = p.alive ? 1 : 0;
    ph.mesh.visible = true;
    other.mesh.count = 0;
    commit(ph);
    const gunCount = this.guns.map(() => 0);
    if (!isChild && p.alive && p.owned[p.weapon]) {
      const g = this.guns[p.weapon]!;
      this.writeInstance(g, 0, p.x, p.y, p.z, this.visualYaw, this.playerPhase, Math.min(1, speed / 4.7) * 0.75, p.invuln > 0.25 ? 0.6 : 0, 1, 0, 0, 0);
      gunCount[p.weapon] = 1;
    }

    // существа
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const e of w.enemies) {
      if (!e.active) {
        this.phases.delete(e.id);
        continue;
      }
      const h = this.herds[e.kind];
      if (!h) continue;
      const i = counts[e.kind]!;
      if (i >= h.mesh.instanceMatrix.count) continue;
      counts[e.kind] = i + 1;
      const sp = Math.hypot(e.vx, e.vz);
      let ph = this.phases.get(e.id) ?? e.phase;
      const dist = Math.hypot(e.x - p.x, e.z - p.z);
      let amp = 0.6;
      let stride = 2.2;
      let fade = e.fade;
      let rim = dist < 10 ? (1 - dist / 10) * 0.9 : 0;
      let lean = 0;
      let glitch = e.fake ? 0.05 : 0;
      if (e.kind === Kind.Whisperer) {
        stride = 3.4;
        amp = Math.min(0.9, sp / 3);
        lean = e.litTorch ? -0.15 : 0;
      } else if (e.kind === Kind.Mute) {
        stride = 1.4;
        amp = Math.min(0.5, sp / 3);
        lean = e.state === 1 ? 0.35 : e.state === 2 ? -0.1 : 0;
      } else if (e.kind === Kind.Echo) {
        stride = 2.3;
        amp = 0.6;
        // вы сами в прошлом: в темноте — едва различимый силуэт, в свете — целиком
        fade = e.delay ? 0 : e.litAny ? 1 : dist < 6 ? 0.55 : 0.3;
        rim = 1;
        glitch = 0.04;
      } else if (e.kind === Kind.Unseeing) {
        // под взглядом — статуя: ни шага, ни дрожи
        stride = 2.6;
        amp = e.state === 1 ? 0 : 0.8;
        rim = Math.max(rim, 0.35);
        lean = e.state === 1 ? 0 : 0.18;
      } else if (e.kind === Kind.Apparition) {
        amp = 0;
        fade = Math.min(1, e.t * 0.6) * 0.95;
        // фигура на пристани должна читаться силуэтом — «кайма» ярче
        rim = e.state === 1 || e.state === 3 ? 0.8 : e.state === 2 ? 0.5 : 0.25;
        glitch = e.litTorch ? 0.6 : 0.02;
      } else if (e.kind === Kind.Choir) {
        // качается в три четверти, дрожит, когда его кормят
        stride = 1;
        amp = 0.5;
        ph = this.time * 2.2;
        rim = Math.max(rim, 0.45);
        glitch = 0.03 + e.flash * 0.4;
      }
      // крик проявляет темноту: всё, что рядом, на миг очерчено
      if (e.reveal > 0) {
        const k = Math.min(1, e.reveal);
        fade = Math.max(fade, k);
        rim = Math.max(rim, k);
      }
      ph += sp * dt * stride;
      this.phases.set(e.id, ph);
      const y = e.y + (e.kind === Kind.Whisperer && e.y < WORLD.waterLevel ? 0 : 0);
      const scale = e.kind === Kind.Choir ? 0.75 + (e.hp / Math.max(1, e.maxHp)) * 0.45 : 1;
      this.writeInstance(h, i, e.x, y, e.z, e.yaw, ph, amp, e.flash, fade, glitch, rim, lean, scale);
      // Отголосок держит то же оружие, что держали вы
      if (e.kind === Kind.Echo) {
        const wi = Math.round(e.tx);
        const g = this.guns[wi];
        if (g && gunCount[wi]! < 5) this.writeInstance(g, gunCount[wi]!++, e.x, y, e.z, e.yaw, ph, amp, e.flash, fade, glitch, rim, lean);
      }
    }
    for (const [k, h] of Object.entries(this.herds)) {
      h.mesh.count = counts[Number(k)]!;
      commit(h);
    }
    this.guns.forEach((g, i) => {
      g.mesh.count = gunCount[i]!;
      commit(g);
    });

    // находки
    const gc = this.groundGuns.map(() => 0);
    const ic: Record<number, number> = { 0: 0, 2: 0, 3: 0, 4: 0 };
    for (const pk of w.pickups) {
      if (!pk.active) continue;
      // лежит на земле и медленно поворачивается — чтобы глаз зацепился
      m4.compose(v.set(pk.x, heightAt(pk.x, pk.z) + 0.02, pk.z), q.setFromAxisAngle(UP, pk.x * 3.1 + this.time * 0.6), sc.set(1, 1, 1));
      if (pk.kind === 1) {
        const mesh = this.groundGuns[pk.a];
        if (mesh && gc[pk.a]! < 4) mesh.setMatrixAt(gc[pk.a]!++, m4);
      } else {
        const mesh = this.groundItems[pk.kind] ?? this.groundItems[0]!;
        const k = pk.kind in ic ? pk.kind : 0;
        if (ic[k]! < 12) mesh.setMatrixAt(ic[k]!++, m4);
      }
    }
    this.groundGuns.forEach((m, i) => {
      m.count = gc[i]!;
      m.instanceMatrix.needsUpdate = true;
    });
    for (const [k, m] of Object.entries(this.groundItems)) {
      m.count = ic[Number(k)]!;
      m.instanceMatrix.needsUpdate = true;
    }

    // непрочитанные записки в открытых домах
    let ng = 0;
    for (const it of w.interactables) {
      const isNote = it.kind === 'note' && !w.notesRead.includes(it.id);
      if (!it.enabled || !(isNote || it.glint)) continue;
      if (it.house >= 0 && !w.doorOpen[it.house]) continue;
      const pulse = 0.8 + Math.sin(this.time * 4 + it.x) * 0.35;
      m4.compose(v.set(it.x, heightAt(it.x, it.z) + 1.0 + Math.sin(this.time * 2) * 0.05, it.z), q.setFromAxisAngle(UP, this.time * 1.5), sc.set(pulse, pulse * 1.4, pulse));
      if (ng < 16) this.glints.setMatrixAt(ng++, m4);
    }
    // находки на земле — та же янтарная искра, что у записок: видно издалека и в темноте
    for (const pk of w.pickups) {
      if (!pk.active || ng >= 32) continue;
      const pulse = 0.7 + Math.sin(this.time * 4 + pk.x) * 0.3;
      m4.compose(v.set(pk.x, heightAt(pk.x, pk.z) + 0.55 + Math.sin(this.time * 2 + pk.z) * 0.05, pk.z), q.setFromAxisAngle(UP, this.time * 1.5), sc.set(pulse, pulse * 1.4, pulse));
      this.glints.setMatrixAt(ng++, m4);
    }
    this.glints.count = ng;
    this.glints.instanceMatrix.needsUpdate = true;

    // шашки в полёте
    let nd = 0;
    for (const pr of w.projectiles) {
      if (!pr.active || pr.kind !== 0) continue;
      q.setFromEuler(new THREE.Euler(this.time * 9, this.time * 4, 0));
      m4.compose(v.set(pr.x, pr.y, pr.z), q, sc.set(1, 1, 1));
      this.dynamite.setMatrixAt(nd++, m4);
    }
    this.dynamite.count = nd;
    this.dynamite.instanceMatrix.needsUpdate = true;

    // бочки: взорванные — прячем
    w.barrels.forEach((b, i) => {
      if (!b.alive) {
        m4.makeScale(0, 0, 0);
        barrels.setMatrixAt(i, m4);
      }
    });
    barrels.instanceMatrix.needsUpdate = true;
  }

  private writeInstance(h: Herd, i: number, x: number, y: number, z: number, yaw: number, phase: number, amp: number, flash: number, fade: number, glitch: number, rim: number, lean: number, scale = 1): void {
    // модель смотрит в +z; направление (cos yaw, sin yaw) → поворот вокруг Y
    q.setFromAxisAngle(UP, Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    m4.compose(v.set(x, y, z), q, sc.set(scale, scale, scale));
    h.mesh.setMatrixAt(i, m4);
    h.anim.setXYZW(i, phase, 0, amp, flash);
    h.fx.setXYZW(i, fade, glitch, rim, lean);
  }
}

function commit(h: Herd): void {
  h.mesh.instanceMatrix.needsUpdate = true;
  h.anim.needsUpdate = true;
  h.fx.needsUpdate = true;
}
