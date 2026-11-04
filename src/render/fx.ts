import * as THREE from 'three';
import { Rng } from '../core/rng';
import { heightAt } from '../proc/terrain';

/**
 * Эффекты: частицы (искры/огонь — аддитивно; дым/кровь — обычно), трассеры, осколки и гильзы,
 * пятна крови и копоти, кольца ударной волны, пул динамических источников света.
 * Всё — фиксированные пулы, без аллокаций в кадре.
 */

const PARTICLE_VS = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const PARTICLE_FS = /* glsl */ `
varying vec4 vColor;
#include <fog_pars_fragment>
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  if (vColor.a < bayer4(gl_FragCoord.xy) * 0.96 + 0.02) discard;
  gl_FragColor = vec4(vColor.rgb, 1.0);
  #include <fog_fragment>
}`;

class Particles {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grow: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly base: Float32Array;
  private head = 0;
  readonly uniforms = { uScale: { value: 300 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, fogNear: { value: 0 }, fogFar: { value: 0 } };

  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: this.uniforms,
      transparent: additive,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, a: number, grow = 0, grav = 0, drag = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.base[i * 4] = r;
    this.base[i * 4 + 1] = g;
    this.base[i * 4 + 2] = b;
    this.base[i * 4 + 3] = a;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) {
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i]! -= dt;
      const k = Math.max(0, this.life[i]! / this.maxLife[i]!);
      const dr = Math.exp(-this.drag[i]! * dt);
      this.vel[i * 3]! *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * dr - this.grav[i]! * dt;
      this.vel[i * 3 + 2]! *= dr;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      const gy = heightAt(this.pos[i * 3]!, this.pos[i * 3 + 2]!);
      if (this.pos[i * 3 + 1]! < gy) {
        this.pos[i * 3 + 1] = gy;
        this.vel[i * 3 + 1] = -this.vel[i * 3 + 1]! * 0.2;
        this.vel[i * 3]! *= 0.5;
        this.vel[i * 3 + 2]! *= 0.5;
      }
      this.size[i]! += this.grow[i]! * dt;
      this.col[i * 4] = this.base[i * 4]!;
      this.col[i * 4 + 1] = this.base[i * 4 + 1]!;
      this.col[i * 4 + 2] = this.base[i * 4 + 2]!;
      this.col[i * 4 + 3] = this.base[i * 4 + 3]! * k;
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aColor!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
  }
}

class Tracers {
  readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly life: Float32Array;
  private readonly base: Float32Array;
  private head = 0;
  private readonly n = 96;

  constructor() {
    this.pos = new Float32Array(this.n * 6);
    this.col = new Float32Array(this.n * 6);
    this.life = new Float32Array(this.n);
    this.base = new Float32Array(this.n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.lines.frustumCulled = false;
  }

  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, g: number, b: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos.set([x0, y0, z0, x1, y1, z1], i * 6);
    this.life[i] = 1;
    this.base[i * 3] = r;
    this.base[i * 3 + 1] = g;
    this.base[i * 3 + 2] = b;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      this.life[i] = Math.max(0, this.life[i]! - dt * 9);
      const k = this.life[i]! * this.life[i]!;
      for (let e = 0; e < 2; e++) {
        // хвост гаснет быстрее головы
        const kk = e === 0 ? k * 0.3 : k;
        this.col[i * 6 + e * 3] = this.base[i * 3]! * kk;
        this.col[i * 6 + e * 3 + 1] = this.base[i * 3 + 1]! * kk;
        this.col[i * 6 + e * 3 + 2] = this.base[i * 3 + 2]! * kk;
      }
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
    this.lines.geometry.attributes.color!.needsUpdate = true;
  }
}

/** Осколки, ошмётки и гильзы с простой физикой. */
class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly n = 220;
  private readonly st: Float32Array; // x y z vx vy vz rx ry rz wx wy wz s life
  private head = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.st = new Float32Array(this.n * 14);
    for (let i = 0; i < this.n; i++) {
      this.mesh.setColorAt(i, this.c.set(0x000000));
      this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
    }
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: number, life: number, rng: Rng): void {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    const o = i * 14;
    this.st.set([x, y, z, vx, vy, vz, rng.range(0, 6), rng.range(0, 6), rng.range(0, 6), rng.range(-12, 12), rng.range(-12, 12), rng.range(-12, 12), size, life], o);
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const o = i * 14;
      const st = this.st;
      if (st[o + 13]! <= 0) continue;
      st[o + 13]! -= dt;
      const g = heightAt(st[o]!, st[o + 2]!);
      if (st[o + 1]! > g + st[o + 12]! * 0.5 || st[o + 4]! > 0.5) {
        st[o + 4]! -= 22 * dt;
        st[o]! += st[o + 3]! * dt;
        st[o + 1]! += st[o + 4]! * dt;
        st[o + 2]! += st[o + 5]! * dt;
        st[o + 6]! += st[o + 9]! * dt;
        st[o + 7]! += st[o + 10]! * dt;
        st[o + 8]! += st[o + 11]! * dt;
      }
      if (st[o + 1]! < g + st[o + 12]! * 0.5) {
        st[o + 1] = g + st[o + 12]! * 0.5;
        st[o + 4] = Math.abs(st[o + 4]!) > 3 ? -st[o + 4]! * 0.3 : 0;
        st[o + 3]! *= 0.5;
        st[o + 5]! *= 0.5;
        st[o + 9]! *= 0.4;
        st[o + 10]! *= 0.4;
        st[o + 11]! *= 0.4;
      }
      const sink = st[o + 13]! < 2 ? st[o + 13]! / 2 : 1;
      const s = st[o + 12]! * sink;
      this.e.set(st[o + 6]!, st[o + 7]!, st[o + 8]!);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(st[o]!, st[o + 1]!, st[o + 2]!), this.q, this.s.set(s, s * 0.7, s * 1.2));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Пятна крови и копоти на земле (неровные «кляксы» из круга со случайными радиусами). */
class Decals {
  readonly mesh: THREE.InstancedMesh;
  private readonly n = 90;
  private head = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor() {
    const g = new THREE.CircleGeometry(1, 14);
    const r = new Rng(9);
    const p = g.attributes.position!;
    for (let i = 1; i < p.count; i++) {
      const k = r.range(0.55, 1.25);
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, this.n);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.n; i++) {
      this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.c.set(0));
    }
    this.mesh.receiveShadow = true;
  }

  add(x: number, z: number, size: number, color: number, rot: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    const y = heightAt(x, z) + 0.03 + i * 0.0003;
    this.m4.makeRotationY(rot).scale(new THREE.Vector3(size, 1, size * 0.8)).setPosition(x, y, z);
    this.mesh.setMatrixAt(i, this.m4);
    this.mesh.setColorAt(i, this.c.set(color));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface PooledLight {
  light: THREE.PointLight;
  life: number;
  max: number;
  peak: number;
}

export class Fx {
  readonly root = new THREE.Group();
  readonly add: Particles;
  readonly norm: Particles;
  readonly tracers = new Tracers();
  readonly debris = new Debris();
  readonly decals = new Decals();
  private readonly rings: { mesh: THREE.Mesh; life: number; max: number; r: number; tint: [number, number, number] }[] = [];
  private readonly balls: { mesh: THREE.Mesh; life: number; max: number; r: number }[] = [];
  private readonly lights: PooledLight[] = [];
  readonly flareLights: THREE.PointLight[] = [];
  readonly muzzle: THREE.PointLight;
  readonly rng = new Rng(777);
  /** Ограничение вспышек (настройка доступности). */
  flashScale = 1;

  constructor(quality: number) {
    const cap = quality >= 2 ? 2400 : quality === 1 ? 1600 : 900;
    this.add = new Particles(cap, true);
    this.norm = new Particles(cap, false);
    this.root.add(this.add.points, this.norm.points, this.tracers.lines, this.debris.mesh, this.decals.mesh);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffc890, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      ring.visible = false;
      this.root.add(ring);
      this.rings.push({ mesh: ring, life: 0, max: 0.4, r: 1, tint: [1, 0.7, 0.45] });
    }
    // огненные шары взрывов: раздуваются, остывают от жёлтого к тёмно-красному
    for (let i = 0; i < 3; i++) {
      // неровный «клубящийся» шар: вершины сдвинуты шумом
      const bg = new THREE.IcosahedronGeometry(1, 2);
      const bp = bg.attributes.position!;
      for (let k = 0; k < bp.count; k++) {
        const j = 0.7 + this.rng.next() * 0.55;
        bp.setXYZ(k, bp.getX(k) * j, bp.getY(k) * j, bp.getZ(k) * j);
      }
      const ball = new THREE.Mesh(
        bg,
        new THREE.MeshBasicMaterial({ color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      ball.visible = false;
      this.root.add(ball);
      this.balls.push({ mesh: ball, life: 0, max: 0.5, r: 1 });
    }
    // Количество источников фиксировано: смена числа ламп заставляет three перекомпилировать шейдеры.
    const nExp = quality >= 1 ? 2 : 1;
    for (let i = 0; i < nExp; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 26, 1.4);
      this.root.add(l);
      this.lights.push({ light: l, life: 0, max: 1, peak: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffd6a0, 0, 15, 1.5);
      this.root.add(l);
      this.flareLights.push(l);
    }
    this.muzzle = new THREE.PointLight(0xffd090, 0, 12, 1.6);
    this.root.add(this.muzzle);
  }

  setScale(px: number): void {
    this.add.uniforms.uScale.value = px;
    this.norm.uniforms.uScale.value = px;
  }

  syncFog(fog: THREE.FogExp2): void {
    for (const p of [this.add, this.norm]) {
      p.uniforms.fogColor.value.copy(fog.color);
      p.uniforms.fogDensity.value = fog.density;
    }
  }

  flash(x: number, y: number, z: number, peak: number, life: number): void {
    let best = this.lights[0]!;
    for (const l of this.lights) if (l.life <= 0 || l.life < best.life) best = l;
    best.light.position.set(x, y, z);
    best.life = life;
    best.max = life;
    best.peak = peak * this.flashScale;
  }

  muzzleFlash(x: number, y: number, z: number, yaw: number, big: number): void {
    this.muzzle.position.set(x, y, z);
    this.muzzle.intensity = 40 * big * this.flashScale;
    const r = this.rng;
    const cx = Math.cos(yaw);
    const cz = Math.sin(yaw);
    for (let i = 0; i < 6 + big * 6; i++) {
      const sp = r.range(4, 14) * big;
      const a = yaw + r.range(-0.25, 0.25);
      this.add.spawn(x, y, z, Math.cos(a) * sp, r.range(-0.5, 1.5), Math.sin(a) * sp, r.range(0.04, 0.09), r.range(0.12, 0.3) * big, 1.6, 1.1, 0.55, 1);
    }
    // дымок у ствола
    for (let i = 0; i < 3; i++) {
      this.norm.spawn(x + cx * 0.3, y, z + cz * 0.3, cx * r.range(0.4, 1.4), r.range(0.3, 0.9), cz * r.range(0.4, 1.4), r.range(0.6, 1.2), r.range(0.15, 0.3), 0.18, 0.18, 0.17, 0.6, 0.6, -0.2, 1.5);
    }
  }

  casing(x: number, y: number, z: number, yaw: number, shell: boolean): void {
    const r = this.rng;
    const side = yaw + Math.PI / 2;
    this.debris.spawn(x, y, z, Math.cos(side) * r.range(1.5, 3), r.range(2.5, 4), Math.sin(side) * r.range(1.5, 3), shell ? 0.06 : 0.035, shell ? 0x6a2a20 : 0xb08a3a, 6, r);
  }

  impact(x: number, y: number, z: number, nx: number, nz: number, blood: boolean): void {
    const r = this.rng;
    if (blood) {
      for (let i = 0; i < 9; i++) {
        this.norm.spawn(x, y, z, nx * r.range(1, 5) + r.range(-1.5, 1.5), r.range(0.5, 3.5), nz * r.range(1, 5) + r.range(-1.5, 1.5), r.range(0.35, 0.8), r.range(0.07, 0.16), 0.22, 0.015, 0.012, 1, 0, 14, 0.5);
      }
      if (r.chance(0.5)) this.decals.add(x + nx * r.range(0.5, 1.5), z + nz * r.range(0.5, 1.5), r.range(0.25, 0.55), 0x2a0606, r.range(0, 6));
    } else {
      for (let i = 0; i < 5; i++) {
        this.add.spawn(x, y, z, r.range(-3, 3), r.range(1, 4), r.range(-3, 3), r.range(0.08, 0.2), r.range(0.05, 0.1), 1.2, 0.9, 0.5, 1, 0, 16);
      }
      this.norm.spawn(x, y, z, 0, 0.6, 0, 0.8, 0.25, 0.15, 0.14, 0.12, 0.5, 0.5, -0.1, 2);
    }
  }

  gore(x: number, y: number, z: number, big: boolean, explosive: boolean, skin: number): void {
    const r = this.rng;
    const n = (big ? 18 : 8) * (explosive ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const sp = explosive ? r.range(4, 11) : r.range(1.5, 5);
      const a = r.range(0, Math.PI * 2);
      this.debris.spawn(x, y + 0.4, z, Math.cos(a) * sp, r.range(3, 9), Math.sin(a) * sp, r.range(0.08, big ? 0.35 : 0.2), r.chance(0.5) ? skin : 0x3a0808, r.range(14, 22), r);
    }
    for (let i = 0; i < n * 3; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(1, explosive ? 9 : 5);
      this.norm.spawn(x, y + 0.5, z, Math.cos(a) * sp, r.range(1, 6), Math.sin(a) * sp, r.range(0.4, 1), r.range(0.08, 0.2), 0.25, 0.01, 0.01, 1, 0, 16, 0.4);
    }
    const splats = big ? 4 : 2;
    for (let i = 0; i < splats; i++) this.decals.add(x + r.range(-1.2, 1.2), z + r.range(-1.2, 1.2), r.range(0.5, big ? 1.6 : 0.9), i % 2 ? 0x220404 : 0x300606, r.range(0, 6));
  }

  vanish(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 40; i++) {
      this.add.spawn(x + r.range(-0.3, 0.3), y + r.range(0.2, 1.9), z + r.range(-0.3, 0.3), r.range(-1.5, 1.5), r.range(-0.5, 2), r.range(-1.5, 1.5), r.range(0.3, 0.9), r.range(0.06, 0.14), 0.25, 0.85, 0.75, 1, 0, -0.5, 2);
    }
  }

  explosion(x: number, y: number, z: number, radius: number): void {
    const r = this.rng;
    this.flash(x, y + 1.5, z, 220, 0.6);
    for (let i = 0; i < 70; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(2, 11);
      this.add.spawn(x, y + 0.5, z, Math.cos(a) * sp, r.range(2, 10), Math.sin(a) * sp, r.range(0.3, 0.9), r.range(0.4, 1.1), 1.8, r.range(0.6, 1), 0.25, 1, -0.6, 4, 2.2);
    }
    for (let i = 0; i < 60; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(6, 20);
      this.add.spawn(x, y + 0.4, z, Math.cos(a) * sp, r.range(3, 14), Math.sin(a) * sp, r.range(0.4, 1.4), r.range(0.05, 0.1), 1.6, 1.2, 0.6, 1, 0, 18, 0.5);
    }
    for (let i = 0; i < 40; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.5, 4);
      this.norm.spawn(x + Math.cos(a), y + r.range(0.5, 2), z + Math.sin(a), Math.cos(a) * sp, r.range(1, 3.5), Math.sin(a) * sp, r.range(2.5, 5), r.range(0.8, 1.6), 0.07, 0.065, 0.06, 0.85, 0.8, -0.35, 1.2);
    }
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(4, 12);
      this.debris.spawn(x, y + 0.3, z, Math.cos(a) * sp, r.range(4, 12), Math.sin(a) * sp, r.range(0.06, 0.2), r.chance(0.5) ? 0x2a2622 : 0x3a3028, r.range(10, 18), r);
    }
    this.decals.add(x, z, radius * 0.55, 0x0c0b0a, r.range(0, 6));
    const ball = this.balls.find((b) => b.life <= 0) ?? this.balls[0]!;
    ball.mesh.position.set(x, y + 0.8, z);
    ball.life = ball.max = 0.55;
    ball.r = radius * 0.55;
    ball.mesh.visible = true;
    const ring = this.rings.find((rr) => rr.life <= 0) ?? this.rings[0]!;
    ring.mesh.position.set(x, y + 0.2, z);
    ring.life = ring.max = 0.45;
    ring.r = radius * 1.6;
    ring.tint = [1, 0.7, 0.45];
    ring.mesh.visible = true;
  }

  /** Расходящееся кольцо (крик): медленнее и шире взрывного. */
  shockRing(x: number, y: number, z: number, radius: number): void {
    const ring = this.rings.find((rr) => rr.life <= 0) ?? this.rings[0]!;
    ring.mesh.position.set(x, y + 0.2, z);
    ring.life = ring.max = 1.1;
    ring.r = radius;
    ring.tint = [0.05, 0.14, 0.12];
    ring.mesh.visible = true;
  }

  // ================================================================ существа
  // Каждое появление и каждая смерть — про то, чем существо является (docs/GDD.md §7).

  /** Шептун выползает из-под земли: комья земли и пыль. */
  emergeDirt(x: number, z: number, big: boolean): void {
    const r = this.rng;
    const y = heightAt(x, z);
    const n = big ? 26 : 8;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.6, big ? 5 : 2.4);
      this.debris.spawn(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * sp, r.range(2, big ? 9 : 5), Math.sin(a) * sp, r.range(0.04, big ? 0.22 : 0.09), r.chance(0.5) ? 0x3a2e22 : 0x2a221a, r.range(4, 9), r);
    }
    for (let i = 0; i < (big ? 30 : 8); i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.5, big ? 4 : 1.6);
      this.norm.spawn(x, y + 0.2, z, Math.cos(a) * sp, r.range(0.2, 1.4), Math.sin(a) * sp, r.range(0.8, big ? 1.8 : 1.1), r.range(0.2, big ? 0.6 : 0.35), 0.13, 0.11, 0.09, 0.3, 0.7, -0.1, 1.6);
    }
    if (big) this.decals.add(x, z, r.range(1.6, 2.2), 0x120e0a, r.range(0, 6));
  }

  /** Отголосок собирается из фосфорных следов: искры стягиваются к нему. */
  assemble(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 36; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(1.2, 2.6);
      const h = r.range(0.1, 1.8);
      const life = r.range(0.35, 0.6);
      this.add.spawn(x + Math.cos(a) * d, y + h, z + Math.sin(a) * d, (-Math.cos(a) * d) / life, 0, (-Math.sin(a) * d) / life, life, r.range(0.05, 0.12), 0.3, 1.0, 0.85, 1, -0.6, 0, 0);
    }
  }

  /** Невидевший поднимается из ила/воды: брызги, грязь, стекающая вода. */
  emergeWet(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 22; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.5, 2.5);
      this.norm.spawn(x, y + 0.2, z, Math.cos(a) * sp, r.range(2, 5), Math.sin(a) * sp, r.range(0.4, 0.9), r.range(0.05, 0.12), 0.22, 0.28, 0.3, 0.9, 0, 16, 0.3);
    }
    this.decals.add(x, z, r.range(0.8, 1.2), 0x0c1416, r.range(0, 6));
  }

  /** Горящий шептун: языки огня, искры, чёрный дым. k — сила огня 0..1. */
  burning(x: number, y: number, z: number, k: number): void {
    const r = this.rng;
    if (r.chance(0.9)) this.add.spawn(x + r.range(-0.3, 0.3), y + r.range(0.3, 0.7), z + r.range(-0.3, 0.3), r.range(-0.3, 0.3), r.range(1.2, 2.6), r.range(-0.3, 0.3), r.range(0.25, 0.5), r.range(0.12, 0.26) * (0.6 + k * 0.6), 1.9, r.range(0.6, 0.9), 0.2, 1, -0.6, -1.5, 1.4);
    if (r.chance(0.35)) this.add.spawn(x, y + 0.5, z, r.range(-1.5, 1.5), r.range(2, 5), r.range(-1.5, 1.5), r.range(0.5, 1.1), r.range(0.03, 0.05), 2, 1.1, 0.4, 1, 0, -2, 0.5);
    if (r.chance(0.4)) this.norm.spawn(x, y + 0.9, z, r.range(-0.2, 0.2), r.range(0.8, 1.6), r.range(-0.2, 0.2), r.range(1, 1.8), r.range(0.15, 0.3), 0.04, 0.035, 0.03, 0.55, 1.2, -0.2, 0.8);
  }

  /** Шептун в луче фонаря: бледный дымок с кожи — свет его жжёт, как сказанное вслух. */
  wisps(x: number, y: number, z: number): void {
    const r = this.rng;
    this.norm.spawn(x + r.range(-0.25, 0.25), y + r.range(0.4, 0.75), z + r.range(-0.25, 0.25), r.range(-0.2, 0.2), r.range(0.5, 1.1), r.range(-0.2, 0.2), r.range(0.6, 1.1), r.range(0.06, 0.14), 0.55, 0.55, 0.5, 0.35, 1.4, -0.3, 1);
  }

  /** Немой: пыль из-под ног. */
  dust(x: number, z: number): void {
    const r = this.rng;
    const y = heightAt(x, z);
    for (let i = 0; i < 2; i++) this.norm.spawn(x + r.range(-0.5, 0.5), y + 0.1, z + r.range(-0.5, 0.5), r.range(-0.6, 0.6), r.range(0.1, 0.5), r.range(-0.6, 0.6), r.range(0.6, 1.1), r.range(0.15, 0.3), 0.13, 0.12, 0.1, 0.25, 0.6, 0, 1.5);
  }

  /** Невидевший: с него течёт вода. */
  drips(x: number, y: number, z: number): void {
    const r = this.rng;
    this.norm.spawn(x + r.range(-0.25, 0.25), y + r.range(0.8, 1.6), z + r.range(-0.2, 0.2), 0, -0.3, 0, r.range(0.3, 0.5), r.range(0.025, 0.045), 0.35, 0.45, 0.5, 0.8, 0, 9, 0);
  }

  /** Отголосок: за ним тянутся фосфорные кадры — вы видите своё прошлое движение. */
  afterimage(x: number, y: number, z: number): void {
    const r = this.rng;
    this.add.spawn(x + r.range(-0.15, 0.15), y + r.range(0.3, 1.7), z + r.range(-0.15, 0.15), 0, 0.1, 0, r.range(0.4, 0.7), r.range(0.06, 0.1), 0.15, 0.55, 0.48, 1, -0.4, 0, 0);
  }

  /** Шептун умер: не кровь — недоговорённое слово рассыпается чёрными хлопьями, как сгоревшая бумага. */
  crumble(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 46; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.3, 2.2);
      this.norm.spawn(x + r.range(-0.3, 0.3), y + r.range(0.3, 0.8), z + r.range(-0.3, 0.3), Math.cos(a) * sp, r.range(0.4, 2.4), Math.sin(a) * sp, r.range(1.2, 2.4), r.range(0.04, 0.09), 0.05, 0.045, 0.045, 1, -0.3, 0.6, 1.8);
    }
    // несколько бледных «букв» — светящиеся обрывки, тают в воздухе
    for (let i = 0; i < 8; i++) this.add.spawn(x, y + 0.6, z, r.range(-0.8, 0.8), r.range(0.6, 1.8), r.range(-0.8, 0.8), r.range(0.8, 1.4), r.range(0.03, 0.06), 0.7, 0.7, 0.62, 1, 0, -0.2, 1.2);
    for (let i = 0; i < 6; i++) this.debris.spawn(x, y + 0.4, z, r.range(-2, 2), r.range(1, 4), r.range(-2, 2), r.range(0.05, 0.12), 0x2a2622, r.range(6, 10), r);
    this.decals.add(x, z, r.range(0.5, 0.8), 0x0a0908, r.range(0, 6));
  }

  /** Шептун сгорел: вспышка, угли, пепел, выжженное пятно. */
  incinerate(x: number, y: number, z: number): void {
    const r = this.rng;
    this.flash(x, y + 0.8, z, 30, 0.35);
    for (let i = 0; i < 30; i++) this.add.spawn(x, y + 0.4, z, r.range(-2.5, 2.5), r.range(1.5, 5), r.range(-2.5, 2.5), r.range(0.5, 1.3), r.range(0.03, 0.07), 2, r.range(0.6, 1), 0.25, 1, 0, 3, 0.8);
    for (let i = 0; i < 24; i++) this.norm.spawn(x + r.range(-0.3, 0.3), y + 0.4, z + r.range(-0.3, 0.3), r.range(-0.5, 0.5), r.range(0.8, 2), r.range(-0.5, 0.5), r.range(1.6, 3), r.range(0.2, 0.5), 0.06, 0.055, 0.05, 0.6, 1.1, -0.15, 0.7);
    for (let i = 0; i < 10; i++) this.debris.spawn(x, y + 0.3, z, r.range(-1.5, 1.5), r.range(1, 3), r.range(-1.5, 1.5), r.range(0.04, 0.1), r.chance(0.5) ? 0x141210 : 0x3a1a08, r.range(6, 12), r);
    this.decals.add(x, z, r.range(0.9, 1.3), 0x060504, r.range(0, 6));
  }

  /** Немой — сама тишина, сжатая в камень: лопается на груду камней и облако пыли. */
  shatter(x: number, y: number, z: number, explosive: boolean): void {
    const r = this.rng;
    const stones = [0x5a524a, 0x4a443e, 0x6a625a, 0x3a342e, 0x2e2a26];
    const n = explosive ? 70 : 48;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = explosive ? r.range(4, 12) : r.range(1.5, 6.5);
      this.debris.spawn(x + r.range(-0.4, 0.4), y + r.range(0.5, 2.2), z + r.range(-0.4, 0.4), Math.cos(a) * sp, r.range(2, 9), Math.sin(a) * sp, r.range(0.06, 0.34), stones[i % stones.length]!, r.range(16, 26), r);
    }
    for (let i = 0; i < 40; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.8, 4);
      this.norm.spawn(x, y + r.range(0.3, 2), z, Math.cos(a) * sp, r.range(0.2, 1.4), Math.sin(a) * sp, r.range(1.2, 2.2), r.range(0.25, 0.7), 0.14, 0.13, 0.12, 0.3, 0.7, -0.05, 1.4);
    }
    this.decals.add(x, z, r.range(1.6, 2.2), 0x161412, r.range(0, 6));
  }

  /** Отголосок: кадры прошлого разлетаются назад — туда, откуда вы шли. yaw — куда он смотрел. */
  rewind(x: number, y: number, z: number, yaw: number): void {
    const r = this.rng;
    const bx = -Math.cos(yaw);
    const bz = -Math.sin(yaw);
    for (let i = 0; i < 70; i++) {
      const sp = r.range(2, 9);
      this.add.spawn(x + r.range(-0.2, 0.2), y + r.range(0.1, 1.8), z + r.range(-0.2, 0.2), bx * sp + r.range(-0.8, 0.8), r.range(-0.2, 0.4), bz * sp + r.range(-0.8, 0.8), r.range(0.3, 0.8), r.range(0.04, 0.12), 0.3, 1.1, 0.95, 1, -0.3, 0, 1.2);
    }
    this.flash(x, y + 1, z, 18, 0.25);
  }

  /** Невидевший возвращается в воду: тело рушится брызгами, остаётся лужа. */
  splashDown(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 60; i++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.5, 4);
      this.norm.spawn(x + r.range(-0.2, 0.2), y + r.range(0.3, 1.7), z + r.range(-0.2, 0.2), Math.cos(a) * sp, r.range(0.5, 4), Math.sin(a) * sp, r.range(0.4, 0.9), r.range(0.04, 0.11), 0.3, 0.4, 0.45, 0.85, 0, 14, 0.4);
    }
    for (let i = 0; i < 6; i++) this.debris.spawn(x, y + 0.8, z, r.range(-2, 2), r.range(1, 3), r.range(-2, 2), r.range(0.06, 0.14), 0x6d7a7c, r.range(8, 14), r);
    this.decals.add(x, z, r.range(1.2, 1.7), 0x0a1214, r.range(0, 6));
  }

  /** Хор распадается на одиннадцать тел. */
  disband(x: number, y: number, z: number): void {
    const r = this.rng;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r.range(-0.2, 0.2);
      const sp = r.range(3, 6);
      this.debris.spawn(x + Math.cos(a) * 0.6, y + r.range(1, 2), z + Math.sin(a) * 0.6, Math.cos(a) * sp, r.range(3, 6), Math.sin(a) * sp, r.range(0.35, 0.5), i % 2 ? 0x6f6a62 : 0x2e2a26, r.range(20, 30), r);
    }
    this.shatter(x, y, z, false);
    this.vanish(x, y, z);
  }

  flareSparks(x: number, y: number, z: number): void {
    const r = this.rng;
    this.add.spawn(x, y + 0.1, z, r.range(-1, 1), r.range(1.5, 4), r.range(-1, 1), r.range(0.3, 0.7), r.range(0.06, 0.13), 1.6, 1.3, 0.8, 1, 0, 6);
    if (r.chance(0.3)) this.norm.spawn(x, y + 0.3, z, r.range(-0.3, 0.3), r.range(0.6, 1.4), r.range(-0.3, 0.3), r.range(1.5, 3), r.range(0.3, 0.6), 0.2, 0.18, 0.16, 0.5, 0.4, -0.2, 0.6);
  }

  trail(x: number, y: number, z: number, hot: boolean): void {
    const r = this.rng;
    if (hot) this.add.spawn(x, y, z, r.range(-0.4, 0.4), r.range(-0.2, 0.6), r.range(-0.4, 0.4), r.range(0.15, 0.35), r.range(0.08, 0.16), 1.6, 1.0, 0.55, 1, -0.2);
    else this.add.spawn(x, y, z, r.range(-0.8, 0.8), r.range(0.5, 1.5), r.range(-0.8, 0.8), r.range(0.08, 0.2), 0.05, 1.5, 1.1, 0.5, 1, 0, 4);
  }

  update(dt: number): void {
    this.add.update(dt);
    this.norm.update(dt);
    this.tracers.update(dt);
    this.debris.update(dt);
    this.muzzle.intensity *= Math.exp(-dt * 40);
    for (const l of this.lights) {
      if (l.life <= 0) {
        l.light.intensity = 0;
        continue;
      }
      l.life -= dt;
      const k = Math.max(0, l.life / l.max);
      l.light.intensity = l.peak * k * k;
    }
    for (const b of this.balls) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - Math.max(0, b.life / b.max);
      const sc = b.r * (0.3 + Math.sqrt(k) * 1.0);
      b.mesh.scale.set(sc, sc * 0.8, sc);
      b.mesh.position.y += dt * 1.5;
      b.mesh.rotation.y += dt * 2;
      b.mesh.rotation.x += dt * 1.3;
      const cool = 1 - k;
      (b.mesh.material as THREE.MeshBasicMaterial).color.setRGB(1.25 * cool, (0.85 * cool) ** 1.6, (0.4 * cool) ** 3);
      if (b.life <= 0) b.mesh.visible = false;
    }
    for (const rg of this.rings) {
      if (rg.life <= 0) continue;
      rg.life -= dt;
      const k = 1 - Math.max(0, rg.life / rg.max);
      const s = 0.3 + k * rg.r;
      rg.mesh.scale.set(s, 1, s);
      (rg.mesh.material as THREE.MeshBasicMaterial).color.setRGB(rg.tint[0] * (1 - k), rg.tint[1] * (1 - k), rg.tint[2] * (1 - k));
      if (rg.life <= 0) rg.mesh.visible = false;
    }
  }
}
