import * as THREE from 'three';
import { Kind } from '../content/enemies';
import type { TextureSet } from './textures';
import { ITEMS, ITEM_SHOWCASE_BASE } from '../content/items';
import { choirGeometry, itemGeometry, weaponGeometry, humanoidGeometry, muteGeometry, unseeingGeometry, whispererGeometry } from './models';

/**
 * Витрина существа для стоп-кадра бестиария: отдельная маленькая сцена с театральным светом,
 * рендерится в свою текстуру с прозрачным фоном и накладывается поверх замершего кадра в пост-проходе.
 */
export class Showcase {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 50);
  rt: THREE.WebGLRenderTarget;
  private readonly meshes = new Map<number, THREE.Mesh>();
  private current: THREE.Mesh | null = null;
  private readonly tex: TextureSet;
  private center = new THREE.Vector3();
  private radius = 1;
  t = 0;
  kind = -1;

  constructor(tex: TextureSet, type: THREE.TextureDataType) {
    this.tex = tex;
    this.rt = new THREE.WebGLRenderTarget(320, 180, { type, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.scene.add(new THREE.HemisphereLight(0x2a3a52, 0x050505, 0.35));
    // холодный бледный ключ сверху-справа (как фонарь, светящий в лицо), «фосфорная» контровая сзади
    const key = new THREE.SpotLight(0xc8ccd4, 40, 20, 0.55, 0.7, 1.5);
    key.position.set(2.5, 4, 3.5);
    this.scene.add(key, key.target);
    const rim = new THREE.PointLight(0x7fd6c2, 55, 12, 1.4);
    rim.position.set(-2, 2.5, -2.5);
    this.scene.add(rim);
    const under = new THREE.PointLight(0xffb060, 3, 6, 1.6);
    under.position.set(0.5, 0.1, 1.5);
    this.scene.add(under);
  }

  private mesh(kind: number): THREE.Mesh {
    let m = this.meshes.get(kind);
    if (m) return m;
    let geo: THREE.BufferGeometry;
    let map = this.tex.skin;
    let k = 1.6;
    const item = kind >= ITEM_SHOWCASE_BASE ? ITEMS[kind - ITEM_SHOWCASE_BASE] : undefined;
    if (item) {
      // находка: оружие повёрнуто боком к камере, прочее — как лежит
      geo = item.model.startsWith('weapon:') ? weaponGeometry(item.model.slice(7)).rotateY(Math.PI / 2) : itemGeometry(item.model);
      geo.computeBoundingSphere();
      const im = new THREE.MeshLambertMaterial({ vertexColors: true });
      im.color.setScalar(1.6);
      const mi = new THREE.Mesh(geo, im);
      this.meshes.set(kind, mi);
      return mi;
    }
    if (kind === Kind.Whisperer) geo = whispererGeometry();
    else if (kind === Kind.Mute) geo = muteGeometry();
    else if (kind === Kind.Unseeing) geo = unseeingGeometry();
    else if (kind === Kind.Choir) geo = choirGeometry();
    else {
      geo = humanoidGeometry({ height: 1.8, coat: 0x6a7672, skin: 0x8a9490, pants: 0x4a5450 });
      map = this.tex.cloth;
      k = 1.5;
    }
    const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, emissive: kind === Kind.Echo ? 0x0c2a26 : 0x000000 });
    mat.color.setScalar(k * 0.75);
    m = new THREE.Mesh(geo, mat);
    geo.computeBoundingSphere();
    this.meshes.set(kind, m);
    return m;
  }

  start(kind: number, w: number, h: number): void {
    if (this.current) this.scene.remove(this.current);
    this.kind = kind;
    this.t = 0;
    this.current = this.mesh(kind);
    this.scene.add(this.current);
    const bs = this.current.geometry.boundingSphere!;
    this.center.copy(bs.center);
    this.radius = bs.radius;
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  stop(): void {
    this.kind = -1;
  }

  update(dt: number): void {
    if (!this.current) return;
    this.t += dt;
    const m = this.current;
    // медленный поворот и «дыхание»
    m.rotation.y = 0.55 + Math.sin(this.t * 0.45) * 0.35;
    const breathe = 1 + Math.sin(this.t * 1.7) * 0.012;
    m.scale.set(1, breathe, 1);
    const r = this.radius;
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (1.25 - Math.min(this.t, 8) * 0.015);
    const shift = r * 0.95 * (this.camera.aspect / 1.78);
    const c = this.center;
    // модель — в левой части кадра: камера смотрит правее неё
    this.camera.position.set(c.x + shift, c.y + r * 0.15, c.z + dist);
    this.camera.lookAt(c.x + shift, c.y, c.z);
  }
}
