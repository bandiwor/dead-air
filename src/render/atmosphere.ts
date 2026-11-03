import * as THREE from 'three';
import { Kind } from '../content/enemies';
import { WORLD, heightAt, water } from '../proc/terrain';
import type { World } from '../sim/world';
import { Rng } from '../core/rng';

/**
 * Атмосфера: всё, что делает воздух «плотным».
 *  — объёмный луч фонаря и пылинки, вспыхивающие только внутри луча;
 *  — ореолы вокруг ламп, окон, ракет и вспышек выстрелов;
 *  — стелющийся по земле туман;
 *  — мягкие тени-пятна под персонажами (они «стоят» на земле);
 *  — рябь на пруду; морось (ночь вторая).
 * Всё — дешёвые спрайты и инстансы; количество зависит от качества.
 */

// ---------------------------------------------------------------- шейдеры

const GLOW_VS = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FS = /* glsl */ `
varying vec4 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * pow(max(0.0, 1.0 - r), 2.4);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const MIST_FS = /* glsl */ `
varying vec4 vColor;
void main() {
  // мягкая дымка: плавный купол без краёв, складывается с темнотой (аддитивно — без сортировки)
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * pow(max(0.0, 1.0 - r * r), 2.0);
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const MOTE_VS = /* glsl */ `
attribute float aSeed;
uniform float uScale;
uniform vec3 uLightPos;
uniform vec3 uLightDir;
uniform float uLightOn;
uniform float uTime;
varying float vLit;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 v = wp.xyz - uLightPos;
  float d = length(v);
  float c = dot(v / max(d, 0.001), uLightDir);
  // пылинка видна только в конусе фонаря и мерцает, поворачиваясь к свету
  vLit = uLightOn * smoothstep(0.86, 0.95, c) * smoothstep(17.0, 3.0, d) * (0.45 + 0.55 * sin(uTime * 2.0 + aSeed * 30.0));
  vec4 mv = viewMatrix * wp;
  gl_PointSize = max(1.5, 0.06 * uScale / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FS = /* glsl */ `
varying float vLit;
void main() {
  if (vLit < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * vLit, vLit);
}`;

const BEAM_VS = /* glsl */ `
varying float vAlong;
varying float vFacing;
varying vec2 vUvA;
void main() {
  vAlong = position.y;
  vUvA = vec2(atan(position.x, position.z), position.y);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FS = /* glsl */ `
varying float vAlong;
varying float vFacing;
varying vec2 vUvA;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uColor;
uniform float uCut;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  // плотнее у фонаря, к краям конуса и вдаль — тает; по лучу плывёт пыль
  float along = smoothstep(0.0, 0.06, vAlong) * pow(1.0 - vAlong, 1.6);
  float edge = pow(vFacing, 2.0);
  float dust = 0.55 + 0.45 * noise(vec2(vUvA.x * 3.0, vUvA.y * 7.0 - uTime * 0.35));
  // луч не проходит сквозь стены: обрезан там, где упирается в сруб (мягко, без ступеньки)
  float cut = 1.0 - smoothstep(uCut - 0.04, uCut, vAlong);
  float a = uIntensity * along * edge * dust * cut;
  gl_FragColor = vec4(uColor, a);
}`;

// ---------------------------------------------------------------- система

interface Glow {
  x: number;
  y: number;
  z: number;
  size: number;
  r: number;
  g: number;
  b: number;
  a: number;
  life: number;
  max: number;
}

const GLOW_MAX = 96;

export interface AtmosphereOpts {
  quality: number;
}

export class Atmosphere {
  readonly root = new THREE.Group();
  private readonly rng = new Rng(31337);
  private time = 0;

  // ореолы
  private readonly glowGeo = new THREE.BufferGeometry();
  private readonly glowPos = new Float32Array(GLOW_MAX * 3);
  private readonly glowCol = new Float32Array(GLOW_MAX * 4);
  private readonly glowSize = new Float32Array(GLOW_MAX);
  private readonly bursts: Glow[] = [];
  private readonly glowU = { uScale: { value: 300 } };

  // луч фонаря
  private readonly beam: THREE.Mesh;
  private readonly beamU = { uIntensity: { value: 0.11 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe2b0) }, uCut: { value: 1 } };
  /** Длина луча в метрах (уходит в землю примерно на 10 м). */
  private static readonly BEAM_LEN = 15;

  // пылинки
  private readonly motes: THREE.Points;
  private readonly motePos: Float32Array;
  private readonly moteU = {
    uScale: { value: 300 },
    uLightPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(1, 0, 0) },
    uLightOn: { value: 1 },
    uTime: { value: 0 },
  };

  // туман
  private readonly mist: THREE.Points;
  private readonly mistPos: Float32Array;
  private readonly mistCol: Float32Array;
  private readonly mistSize: Float32Array;
  private readonly mistVel: Float32Array;
  private readonly mistU = { uScale: { value: 300 }, uTime: { value: 0 } };
  private mistDensity = 1;

  // тени-пятна
  private readonly blobs: THREE.InstancedMesh;

  // рябь
  private readonly ripples: THREE.InstancedMesh;
  private readonly rip: { x: number; z: number; t: number; max: number; s: number }[] = [];
  private ripHead = 0;
  private rippleT = 0;

  // морось
  private readonly rain: THREE.LineSegments;
  private readonly rainPos: Float32Array;
  private readonly rainN: number;
  rainOn = false;

  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly c = new THREE.Color();

  constructor(o: AtmosphereOpts) {
    const q = o.quality;

    // ---- ореолы
    this.glowGeo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.glowGeo.setAttribute('aColor', new THREE.BufferAttribute(this.glowCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.glowGeo.setAttribute('aSize', new THREE.BufferAttribute(this.glowSize, 1).setUsage(THREE.DynamicDrawUsage));
    const glows = new THREE.Points(
      this.glowGeo,
      new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glows.frustumCulled = false;
    glows.renderOrder = 5;
    this.root.add(glows);

    // ---- луч фонаря: открытый конус, узким концом у фонаря
    const cone = new THREE.CylinderGeometry(3.6, 0.07, 1, 24, 6, true).translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(
      cone,
      new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: this.beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }),
    );
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 4;
    this.root.add(this.beam);

    // ---- пылинки
    const nMotes = q >= 2 ? 260 : q === 1 ? 160 : 70;
    this.motePos = new Float32Array(nMotes * 3);
    const seeds = new Float32Array(nMotes);
    for (let i = 0; i < nMotes; i++) {
      this.motePos.set([this.rng.range(-14, 14), this.rng.range(0.2, 2.6), this.rng.range(-14, 14)], i * 3);
      seeds[i] = this.rng.next();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MOTE_VS, fragmentShader: MOTE_FS, uniforms: this.moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.root.add(this.motes);

    // ---- туман клочьями у земли
    const nMist = q >= 2 ? 110 : q === 1 ? 70 : 35;
    this.mistPos = new Float32Array(nMist * 3);
    this.mistCol = new Float32Array(nMist * 4);
    this.mistSize = new Float32Array(nMist);
    this.mistVel = new Float32Array(nMist * 2);
    for (let i = 0; i < nMist; i++) this.placeMist(i, 0, 0, true);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.mistPos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setAttribute('aColor', new THREE.BufferAttribute(this.mistCol, 4).setUsage(THREE.DynamicDrawUsage));
    fg.setAttribute('aSize', new THREE.BufferAttribute(this.mistSize, 1));
    this.mist = new THREE.Points(fg, new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: MIST_FS, uniforms: this.mistU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mist.frustumCulled = false;
    this.mist.visible = nMist > 0;
    this.mist.renderOrder = 3;
    this.root.add(this.mist);

    // ---- тени-пятна под персонажами (радиальный градиент — процедурная маска)
    const blobTex = radialTexture(32);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat, 72);
    this.blobs.frustumCulled = false;
    this.blobs.count = 0;
    this.root.add(this.blobs);

    // ---- рябь на воде
    const ripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 28).rotateX(-Math.PI / 2), ripMat, 48);
    this.ripples.frustumCulled = false;
    this.ripples.count = 0;
    for (let i = 0; i < 48; i++) {
      this.ripples.setColorAt(i, this.c.set(0));
      this.rip.push({ x: 0, z: 0, t: 1, max: 1, s: 1 });
    }
    this.root.add(this.ripples);

    // ---- морось: наклонные штрихи, падающие вокруг камеры
    this.rainN = q >= 2 ? 700 : q === 1 ? 450 : 220;
    this.rainPos = new Float32Array(this.rainN * 6);
    const rcol = new Float32Array(this.rainN * 6);
    for (let i = 0; i < this.rainN; i++) {
      this.rainPos.set([this.rng.range(-16, 16), this.rng.range(0, 14), this.rng.range(-16, 16)], i * 6);
      rcol.set([0.0, 0.0, 0.0, 0.32, 0.38, 0.42], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('color', new THREE.BufferAttribute(rcol, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.root.add(this.rain);
  }

  /** Плотность тумана (ночь вторая — гуще). */
  setMist(density: number): void {
    this.mistDensity = density;
  }

  setScale(px: number): void {
    this.glowU.uScale.value = px;
    this.moteU.uScale.value = px;
    this.mistU.uScale.value = px;
  }

  /** Кратковременный ореол: вспышка выстрела, огонь взрыва. */
  burst(x: number, y: number, z: number, size: number, color: number, intensity: number, life: number): void {
    if (this.bursts.length > 24) this.bursts.shift();
    this.c.set(color);
    this.bursts.push({ x, y, z, size, r: this.c.r, g: this.c.g, b: this.c.b, a: intensity, life, max: life });
  }

  ripple(x: number, z: number, size = 1): void {
    const r = this.rip[this.ripHead]!;
    this.ripHead = (this.ripHead + 1) % this.rip.length;
    r.x = x;
    r.z = z;
    r.t = 0;
    r.max = 1.2 + size * 0.6;
    r.s = size;
  }

  private placeMist(i: number, cx: number, cz: number, init: boolean): void {
    const a = this.rng.range(0, Math.PI * 2);
    const rr = init ? this.rng.range(2, 30) : this.rng.range(20, 30);
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    this.mistPos.set([x, heightAt(x, z) + this.rng.range(0.25, 0.9), z], i * 3);
    this.mistSize[i] = this.rng.range(7, 13);
    this.mistVel[i * 2] = this.rng.range(0.15, 0.45);
    this.mistVel[i * 2 + 1] = this.rng.range(-0.1, 0.1);
    // низины и вода — гуще
    const low = heightAt(x, z) < 0 ? 1.4 : 1;
    this.mistCol.set([0.16, 0.2, 0.23, 0.05 * low], i * 4);
  }

  update(w: World, dt: number, flash: THREE.SpotLight, flashOn: boolean, focusX: number, focusZ: number, windows: readonly { x: number; y: number; z: number; house: number }[]): void {
    this.time += dt;
    const t = this.time;
    const p = w.player;

    // ---- луч фонаря
    const lp = flash.position;
    const dir = this.v.copy(flash.target.position).sub(lp).normalize();
    this.beam.position.copy(lp);
    this.q.setFromUnitVectors(this.up, dir);
    this.beam.quaternion.copy(this.q);
    const len = Atmosphere.BEAM_LEN;
    this.beam.scale.set(1, len, 1);
    // где луч упирается в стену: двумерный луч по коллизиям мира (двери учтены), в долях длины конуса
    const hl = Math.hypot(dir.x, dir.z);
    if (hl > 1e-4) {
      const tWall = w.statics.raycast(lp.x, lp.z, dir.x / hl, dir.z / hl, len * hl, false);
      const target = Math.min(1, (tWall / hl + 0.15) / len);
      // плавно: когда стена уходит из-под луча, он не «выстреливает» на всю длину за кадр
      this.beamU.uCut.value += (target - this.beamU.uCut.value) * (target < this.beamU.uCut.value ? 1 : Math.min(1, dt * 10));
    }
    this.beamU.uTime.value = t;
    this.beamU.uIntensity.value = flashOn ? 0.2 * Math.min(1, flash.intensity / 340) : 0;
    this.beam.visible = flashOn && p.alive;

    // ---- пылинки: кружатся вокруг игрока, светятся только в луче
    this.moteU.uLightPos.value.copy(lp);
    this.moteU.uLightDir.value.copy(dir);
    this.moteU.uLightOn.value = flashOn ? 1 : 0;
    this.moteU.uTime.value = t;
    const mp = this.motePos;
    for (let i = 0; i < mp.length; i += 3) {
      mp[i] = mp[i]! + Math.sin(t * 0.3 + i) * dt * 0.15 + dt * 0.08;
      mp[i + 1] = mp[i + 1]! + Math.cos(t * 0.4 + i * 0.7) * dt * 0.05;
      mp[i + 2] = mp[i + 2]! + Math.cos(t * 0.25 + i * 1.3) * dt * 0.15;
      // переносим пылинки, отставшие от игрока
      if (mp[i]! - p.x > 14) mp[i] = mp[i]! - 28;
      if (mp[i]! - p.x < -14) mp[i] = mp[i]! + 28;
      if (mp[i + 2]! - p.z > 14) mp[i + 2] = mp[i + 2]! - 28;
      if (mp[i + 2]! - p.z < -14) mp[i + 2] = mp[i + 2]! + 28;
      const gy = p.y;
      if (mp[i + 1]! < gy + 0.1 || mp[i + 1]! > gy + 3) mp[i + 1] = gy + 0.3 + ((i * 0.37) % 2.4);
    }
    this.motes.geometry.attributes.position!.needsUpdate = true;

    // ---- туман: дрейфует по ветру, отставшие клочья переносятся вперёд
    if (this.mist.visible) {
      this.mistU.uTime.value = t;
      const n = this.mistSize.length;
      for (let i = 0; i < n; i++) {
        this.mistPos[i * 3] = this.mistPos[i * 3]! + this.mistVel[i * 2]! * dt;
        this.mistPos[i * 3 + 2] = this.mistPos[i * 3 + 2]! + this.mistVel[i * 2 + 1]! * dt;
        const dx = this.mistPos[i * 3]! - focusX;
        const dz = this.mistPos[i * 3 + 2]! - focusZ;
        if (dx * dx + dz * dz > 34 * 34) this.placeMist(i, focusX, focusZ, false);
        // клочья медленно «дышат»; над низинами и водой — гуще
        const low = heightAt(this.mistPos[i * 3]!, this.mistPos[i * 3 + 2]!) < 0 ? 1.4 : 1;
        this.mistCol[i * 4 + 3] = Math.min(0.06, (0.02 + 0.01 * Math.sin(t * 0.1 + i)) * this.mistDensity * low);
      }
      this.mist.geometry.attributes.position!.needsUpdate = true;
      this.mist.geometry.attributes.aColor!.needsUpdate = true;
    }

    // ---- ореолы: постоянные + кратковременные
    let n = 0;
    const put = (x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void => {
      if (n >= GLOW_MAX) return;
      this.glowPos.set([x, y, z], n * 3);
      this.glowCol.set([r, g, b, a], n * 4);
      this.glowSize[n] = size;
      n++;
    };
    const pole = w.layout.pole;
    if (!w.deadAir) {
      const fl = w.air < 0.12 && Math.random() < 0.3 ? 0.25 : 1;
      put(pole.x + 0.55, heightAt(pole.x, pole.z) + 5.85, pole.z, 4.2, 1, 0.62, 0.22, 0.42 * fl);
    }
    const hd = w.layout.hutDoor;
    put(hd.x + 0.6, heightAt(hd.x, hd.z) + 2.1, hd.z - 0.85, 2.6, 1, 0.66, 0.28, 0.5);
    for (const wn of windows) {
      if (wn.house >= 0 && !w.houseLight[wn.house]) continue;
      put(wn.x, wn.y, wn.z, 2.2, 1, 0.6, 0.2, 0.32);
    }
    for (const f of w.flares) {
      if (!f.active) continue;
      const k = f.t < 0.3 ? f.t / 0.3 : f.t > f.life - 3 ? Math.max(0, (f.life - f.t) / 3) : 1;
      put(f.x, f.y + 0.4, f.z, 5 + Math.sin(t * 23 + f.x) * 0.6, 1, 0.82, 0.55, 0.6 * k);
    }
    for (const pr of w.projectiles) if (pr.active && pr.kind === 1) put(pr.x, pr.y, pr.z, 2.4, 1, 0.8, 0.5, 0.7);
    // «фосфорная» дымка вокруг явлений
    for (const e of w.enemies) if (e.active && e.kind === Kind.Apparition) put(e.x, e.y + 1.4, e.z, 3, 0.5, 0.85, 0.78, 0.12);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.bursts.splice(i, 1);
        continue;
      }
      const k = b.life / b.max;
      put(b.x, b.y, b.z, b.size * (0.7 + 0.3 * k), b.r, b.g, b.b, b.a * k);
    }
    this.glowGeo.setDrawRange(0, n);
    this.glowGeo.attributes.position!.needsUpdate = true;
    this.glowGeo.attributes.aColor!.needsUpdate = true;
    this.glowGeo.attributes.aSize!.needsUpdate = true;

    // ---- тени-пятна
    let nb = 0;
    const blob = (x: number, y: number, z: number, r: number): void => {
      if (nb >= 72) return;
      this.m4.compose(this.v.set(x, y + 0.04, z), this.q.identity(), this.s.set(r * 2, 1, r * 2));
      this.blobs.setMatrixAt(nb++, this.m4);
    };
    if (p.alive) blob(p.x, p.y, p.z, 0.55);
    for (const e of w.enemies) {
      if (!e.active || e.kind === Kind.Apparition || e.fake) continue;
      if (e.kind === Kind.Echo && !e.litAny) continue;
      if (e.y < water.level - 0.1) continue;
      blob(e.x, e.y, e.z, e.r * 1.5);
    }
    this.blobs.count = nb;
    this.blobs.instanceMatrix.needsUpdate = true;

    // ---- рябь: от существ в воде и от мороси
    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      this.rippleT = this.rainOn ? 0.05 : 0.6;
      const pd = WORLD.pond;
      const a = this.rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(this.rng.next()) * pd.r * 0.85;
      this.ripple(pd.x + Math.cos(a) * rr, pd.z + Math.sin(a) * rr, this.rainOn ? 0.35 : 0.6);
      for (const e of w.enemies) {
        if (e.active && heightAt(e.x, e.z) < water.level && Math.hypot(e.vx, e.vz) > 0.2) this.ripple(e.x, e.z, 1.4);
      }
    }
    let nr = 0;
    for (const r of this.rip) {
      if (r.t >= r.max) continue;
      r.t += dt;
      const k = r.t / r.max;
      const sc = 0.15 + k * 1.6 * r.s;
      this.m4.compose(this.v.set(r.x, water.level + 0.02, r.z), this.q.identity(), this.s.set(sc, 1, sc));
      this.ripples.setMatrixAt(nr, this.m4);
      const br = (1 - k) * 0.22;
      this.ripples.setColorAt(nr, this.c.setRGB(br * 0.8, br, br));
      nr++;
    }
    this.ripples.count = nr;
    this.ripples.instanceMatrix.needsUpdate = true;
    if (this.ripples.instanceColor) this.ripples.instanceColor.needsUpdate = true;

    // ---- морось
    this.rain.visible = this.rainOn;
    if (this.rainOn) {
      const rp = this.rainPos;
      const wx = 1.6;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6;
        let x = rp[o + 3]! + wx * dt;
        let y = rp[o + 4]! - 15 * dt;
        let z = rp[o + 5]!;
        if (y < heightAt(x, z) || x - focusX > 16 || x - focusX < -16 || z - focusZ > 16 || z - focusZ < -16) {
          x = focusX + this.rng.range(-16, 16);
          z = focusZ + this.rng.range(-16, 16);
          y = heightAt(x, z) + this.rng.range(6, 14);
        }
        rp.set([x - wx * 0.035, y + 0.5, z, x, y, z], o);
      }
      this.rain.geometry.attributes.position!.needsUpdate = true;
    }
  }
}

/** Радиальный градиент (маска пятна тени) — процедурно. */
function radialTexture(size: number): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 1.6) * 255;
      d.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
