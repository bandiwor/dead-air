import * as THREE from 'three';
import { Kind } from '../content/enemies';
import type { World } from '../sim/world';
import { WORLD, heightAt } from '../proc/terrain';
import type { TextureSet } from './textures';
import { creature } from './materials';
import { crateGeometry, dynamiteGeometry, faceGeometry, humanoidGeometry, muteGeometry, whispererGeometry } from './models';

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
  private readonly herds: Record<number, Herd>;
  private readonly crates: THREE.InstancedMesh;
  private readonly longCrates: THREE.InstancedMesh;
  private readonly dynamite: THREE.InstancedMesh;
  readonly face: THREE.Mesh;
  /** Янтарные искры у того, что стоит осмотреть. */
  private readonly glints: THREE.InstancedMesh;
  private readonly phases = new Map<number, number>();
  private playerPhase = 0;
  private time = 0;

  constructor(tex: TextureSet) {
    const coat = new THREE.MeshLambertMaterial({ map: tex.cloth, vertexColors: true });
    coat.color.setScalar(1.8);
    this.player = herd(humanoidGeometry({ height: 1.8, coat: 0x3a3a34, skin: 0x9a8270, pants: 0x262624, flashlight: true }), coat, 1);
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
      [Kind.Echo]: herd(humanoidGeometry({ height: 1.8, coat: 0x6a7672, skin: 0x8a9490, pants: 0x4a5450, flashlight: false }), echoMat, 4),
      [Kind.Apparition]: herd(
        humanoidGeometry({ height: 2.35, coat: 0x060606, skin: 0x0a0a0a, pants: 0x050505, thin: 0.7, armLen: 1.05, headTilt: 0.45 }),
        new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x111111 }),
        4,
        false,
      ),
    };
    this.root.add(this.player.mesh);
    for (const h of Object.values(this.herds)) this.root.add(h.mesh);

    const crateMat = new THREE.MeshLambertMaterial({ map: tex.planks, vertexColors: true, emissive: 0x2a1a06 });
    crateMat.color.setScalar(1.6);
    this.crates = new THREE.InstancedMesh(crateGeometry(false), crateMat, 24);
    this.longCrates = new THREE.InstancedMesh(crateGeometry(true), crateMat, 8);
    this.dynamite = new THREE.InstancedMesh(dynamiteGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), 16);
    for (const m of [this.crates, this.longCrates, this.dynamite]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.root.add(m);
    }

    // лицо светится собственным бледным светом — оно должно читаться даже в полной темноте
    this.glints = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffc070 }), 16);
    this.glints.count = 0;
    this.glints.frustumCulled = false;
    this.root.add(this.glints);

    const faceMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.skin, fog: false });
    faceMat.color.setScalar(1.15);
    this.face = new THREE.Mesh(faceGeometry(), faceMat);
    this.face.visible = false;
  }

  update(w: World, dt: number, barrels: THREE.InstancedMesh): void {
    this.time += dt;
    const p = w.player;

    // игрок
    const speed = Math.hypot(p.vx, p.vz);
    this.playerPhase += speed * dt * 2.3;
    this.writeInstance(this.player, 0, p.x, p.y, p.z, p.yaw, this.playerPhase, Math.min(1, speed / 4.7) * 0.75, p.invuln > 0.25 ? 0.6 : 0, 1, 0, 0, 0);
    this.player.mesh.count = p.alive ? 1 : 0;
    this.player.mesh.visible = true;
    commit(this.player);

    // существа
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const e of w.enemies) {
      if (!e.active) {
        this.phases.delete(e.id);
        continue;
      }
      const h = this.herds[e.kind]!;
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
        fade = e.litAny ? 1 : dist < 3.5 ? 0.5 : 0.18;
        rim = 1;
        glitch = 0.04;
      } else if (e.kind === Kind.Apparition) {
        amp = 0;
        fade = Math.min(1, e.t * 0.6) * 0.95;
        // фигура на пристани должна читаться силуэтом — «кайма» ярче
        rim = e.state === 1 || e.state === 3 ? 0.8 : e.state === 2 ? 0.5 : 0.25;
        glitch = e.litTorch ? 0.6 : 0.02;
      }
      ph += sp * dt * stride;
      this.phases.set(e.id, ph);
      const y = e.y + (e.kind === Kind.Whisperer && e.y < WORLD.waterLevel ? 0 : 0);
      this.writeInstance(h, i, e.x, y, e.z, e.yaw, ph, amp, e.flash, fade, glitch, rim, lean);
    }
    for (const [k, h] of Object.entries(this.herds)) {
      h.mesh.count = counts[Number(k)]!;
      commit(h);
    }

    // находки
    let nc = 0;
    let nl = 0;
    for (const pk of w.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(this.time * 2 + pk.x) * 0.04;
      m4.compose(v.set(pk.x, heightAt(pk.x, pk.z) + 0.02 + bob, pk.z), q.setFromAxisAngle(UP, pk.x * 3.1), sc.set(1, 1, 1));
      if (pk.kind === 1) this.longCrates.setMatrixAt(nl++, m4);
      else this.crates.setMatrixAt(nc++, m4);
    }
    this.crates.count = nc;
    this.longCrates.count = nl;
    this.crates.instanceMatrix.needsUpdate = true;
    this.longCrates.instanceMatrix.needsUpdate = true;

    // непрочитанные записки в открытых домах
    let ng = 0;
    for (const it of w.interactables) {
      if (it.kind !== 'note' || !it.enabled || w.notesRead.includes(it.id)) continue;
      if (!w.doorOpen[it.house]) continue;
      const pulse = 0.8 + Math.sin(this.time * 4 + it.x) * 0.35;
      m4.compose(v.set(it.x, heightAt(it.x, it.z) + 1.0 + Math.sin(this.time * 2) * 0.05, it.z), q.setFromAxisAngle(UP, this.time * 1.5), sc.set(pulse, pulse * 1.4, pulse));
      if (ng < 16) this.glints.setMatrixAt(ng++, m4);
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

  private writeInstance(h: Herd, i: number, x: number, y: number, z: number, yaw: number, phase: number, amp: number, flash: number, fade: number, glitch: number, rim: number, lean: number): void {
    // модель смотрит в +z; направление (cos yaw, sin yaw) → поворот вокруг Y
    q.setFromAxisAngle(UP, Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    m4.compose(v.set(x, y, z), q, sc.set(1, 1, 1));
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
