import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { World } from '../sim/world';
import { WORLD, groundAt } from '../proc/terrain';
import type { TextureSet } from './textures';
import { buildWorldView, COLORS, type WorldView } from './worldView';
import { ActorsView } from './actors';
import { Fx } from './fx';
import { PostPass } from './post';
import { shared } from './materials';
import { Showcase } from './showcase';

export interface CameraShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

const HEIGHTS = [
  [216, 252, 288, 324],
  [270, 324, 360, 405],
  [324, 378, 432, 486],
];

/**
 * Рендер: низкое внутреннее разрешение (динамическое) → пост-проход → апскейл «пиксель в пиксель»
 * средствами браузера (image-rendering: pixelated). Дёшево для мобильных и задаёт стиль.
 */
export class GameRenderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 140);
  readonly view: WorldView;
  readonly actors: ActorsView;
  readonly fx: Fx;
  readonly post = new PostPass();
  readonly flashlight: THREE.SpotLight;
  private readonly aura: THREE.PointLight;
  private readonly fog: THREE.FogExp2;
  private readonly hemi: THREE.HemisphereLight;
  private readonly moon: THREE.DirectionalLight;
  /** Кат-сцена: чуть больше лунного света и реже туман — зрителю нужно видеть место. */
  cinematic = false;
  /** Густота тумана текущей ночи. */
  baseFog = 0.03;
  private rt: THREE.WebGLRenderTarget;
  readonly showcase: Showcase;
  /** 0..1 — проявление стоп-кадра. */
  private showT = 0;
  private showOn = false;
  /** Вспышка негатива при скримере (отключается «меньше вспышек»). */
  invertFlash = true;
  private quality: number;
  private resIndex = 2;
  private frameMs = 16;
  private resTimer = 0;
  private trauma = 0;
  private readonly camPos = new THREE.Vector3(0, 30, 30);
  private readonly camLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private time = 0;
  /** Внешние эффекты от игры (0..1). */
  glitch = 0;
  hurt = 0;
  flashFx = 0;
  fade = 0;
  flashlightOn = true;
  /** Время от начала скримера (−1 — нет). Лицо → тьма → лицо ещё раз: второй удар бьёт сильнее первого. */
  private faceT = -1;
  private faceFrame = -1;
  private flicker = 0;

  constructor(canvas: HTMLCanvasElement, w: World, tex: TextureSet, quality: number) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.gl.setPixelRatio(1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.rt = this.makeTarget(640, 360);
    this.showcase = new Showcase(tex, this.rt.texture.type);

    this.fog = new THREE.FogExp2(COLORS.fog, 0.03);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(COLORS.fog);

    this.hemi = new THREE.HemisphereLight(0x2a3a52, 0x0b0d0e, 0.85);
    this.scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x8ea4c8, 0.32);
    this.moon = moon;
    moon.position.set(-30, 50, -20);
    this.scene.add(moon);

    this.flashlight = new THREE.SpotLight(0xffe4b8, 160, 28, 0.5, 0.55, 1.6);
    this.flashlight.castShadow = true;
    const sm = quality >= 2 ? 1024 : quality === 1 ? 512 : 256;
    this.flashlight.shadow.mapSize.set(sm, sm);
    this.flashlight.shadow.camera.near = 0.3;
    this.flashlight.shadow.camera.far = 28;
    this.flashlight.shadow.bias = -0.0008;
    this.flashlight.shadow.normalBias = 0.03;
    this.scene.add(this.flashlight, this.flashlight.target);
    this.aura = new THREE.PointLight(0xffd8a8, 5, 6, 1.4);
    this.scene.add(this.aura);

    this.view = buildWorldView(w.layout, tex, quality);
    this.scene.add(this.view.root);
    this.actors = new ActorsView(tex);
    this.scene.add(this.actors.root);
    this.fx = new Fx(quality);
    this.fx.syncFog(this.fog);
    this.scene.add(this.fx.root);
    this.camera.add(this.actors.face);
    this.actors.face.position.set(0, -0.08, -1.7);
    this.scene.add(this.camera);
    this.resIndex = 2;
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const half = this.gl.extensions.has('EXT_color_buffer_half_float') || this.gl.extensions.has('EXT_color_buffer_float');
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    return rt;
  }

  /** Стоп-кадр: замораживаем последний кадр и показываем существо. */
  startShowcase(kind: number): void {
    this.showOn = true;
    this.showT = 0;
    this.showcase.start(kind, this.rt.width, this.rt.height);
  }

  stopShowcase(): void {
    this.showOn = false;
  }

  get showcaseActive(): boolean {
    return this.showOn || this.showT > 0;
  }

  setQuality(q: number): void {
    this.quality = q;
    this.resIndex = Math.min(this.resIndex, 3);
  }

  /** Подгоняет внутреннее разрешение под экран и бюджет кадра. */
  resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const h = HEIGHTS[this.quality]![this.resIndex]!;
    const w = Math.round((h * cssW) / Math.max(1, cssH));
    if (this.rt.width !== w || this.rt.height !== h) {
      this.rt.setSize(w, h);
      this.gl.setSize(w, h, false);
      this.post.u.uRes.value.set(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.fx.setScale(h * 1.1);
    }
  }

  addTrauma(t: number): void {
    this.trauma = clamp(this.trauma + t, 0, 1);
  }

  showFace(_seconds = 0): void {
    this.faceT = 0;
  }

  /** Камера по умолчанию: наклонный вид сверху, с упреждением по прицелу. */
  private zoom = 0;

  followCamera(w: World, dt: number): void {
    const p = w.player;
    // в доме камера опускается и подходит ближе: тесно, видно только комнату
    this.zoom = damp(this.zoom, w.playerHouse >= 0 ? 1 : 0, 2.5, dt);
    const lead = 3.2 - this.zoom * 2.4;
    const tx = p.x + Math.cos(p.yaw) * lead;
    const tz = p.z + Math.sin(p.yaw) * lead * 0.8;
    const ty = p.y;
    this.camLook.x = damp(this.camLook.x, tx, 4, dt);
    this.camLook.y = damp(this.camLook.y, ty + 0.5, 4, dt);
    this.camLook.z = damp(this.camLook.z, tz, 4, dt);
    this.camPos.set(this.camLook.x, this.camLook.y + 15 - this.zoom * 6.5, this.camLook.z + 9.8 - this.zoom * 4.6);
    this.camera.fov = damp(this.camera.fov, 42, 3, dt);
  }

  shotCamera(shot: CameraShot): void {
    this.camPos.copy(shot.pos);
    this.camLook.copy(shot.look);
    this.camera.fov = shot.fov;
  }

  snapCamera(w: World): void {
    const p = w.player;
    this.camLook.set(p.x, p.y + 0.5, p.z);
    this.camPos.set(p.x, p.y + 15, p.z + 9.8);
  }

  render(w: World, dt: number, playing: boolean): void {
    const t0 = performance.now();
    this.time += dt;
    shared.uTime.value = this.time;
    const p = w.player;
    shared.uPlayer.value.set(p.x, p.y, p.z);

    // фонарь
    const dx = Math.cos(p.yaw);
    const dz = Math.sin(p.yaw);
    this.flashlight.position.set(p.x + dx * 0.4, p.y + 1.35, p.z + dz * 0.4);
    this.flashlight.target.position.set(p.x + dx * 9, groundAt(p.x + dx * 9, p.z + dz * 9), p.z + dz * 9);
    // лёгкое дрожание луча при низком рассудке
    this.flicker = Math.max(0, this.flicker - dt);
    const sanity = p.sanity / 100;
    if (this.flicker <= 0 && Math.random() < dt * (1 - sanity) * 0.8) this.flicker = 0.08 + Math.random() * 0.25;
    const flick = this.flicker > 0 ? (Math.random() < 0.5 ? 0.1 : 0.6) : 1;
    this.flashlight.intensity = this.flashlightOn && p.alive ? 160 * flick : 0;
    this.aura.position.set(p.x, p.y + 1.6, p.z);
    this.aura.intensity = this.flashlightOn ? 5 : 0;
    this.hemi.intensity = damp(this.hemi.intensity, this.cinematic ? 1.7 : 0.85, 2, dt);
    this.moon.intensity = damp(this.moon.intensity, this.cinematic ? 0.9 : 0.32, 2, dt);
    this.fog.density = damp(this.fog.density, this.cinematic ? this.baseFog * 0.55 : this.baseFog, 2, dt);

    // фонарь на столбе гаснет в мёртвом эфире
    const lampOn = !w.deadAir;
    const lampFlicker = lampOn && w.air < 0.12 ? (Math.random() < 0.3 ? 0.2 : 1) : 1;
    this.view.poleLight.intensity = lampOn ? 60 * lampFlicker : 0;
    (this.view.poleLamp.material as THREE.MeshBasicMaterial).color.setHex(lampOn && lampFlicker > 0.5 ? COLORS.sodium : 0x1a1208);

    // ракеты
    const fl = this.fx.flareLights;
    let fi = 0;
    for (const f of w.flares) {
      if (!f.active || fi >= fl.length) continue;
      const k = f.t < 0.3 ? f.t / 0.3 : f.t > f.life - 3 ? Math.max(0, (f.life - f.t) / 3) : 1;
      fl[fi]!.position.set(f.x, f.y + 0.6, f.z);
      fl[fi]!.intensity = (50 + Math.sin(this.time * 31 + f.x) * 8) * k;
      fi++;
      if (Math.random() < dt * 30) this.fx.flareSparks(f.x, f.y, f.z);
    }
    for (; fi < fl.length; fi++) fl[fi]!.intensity = 0;
    for (const pr of w.projectiles) if (pr.active) this.fx.trail(pr.x, pr.y, pr.z, pr.kind === 1);

    // вода
    const wn = (this.view.water.material as THREE.MeshStandardMaterial).normalMap!;
    wn.offset.set(this.time * 0.01, this.time * 0.006);

    this.actors.update(w, dt, this.view.barrels);
    this.fx.update(dt);

    // камера и тряска
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    this.camera.position.copy(this.camPos);
    this.camera.position.x += (Math.random() - 0.5) * sh * 1.2;
    this.camera.position.y += (Math.random() - 0.5) * sh * 0.8;
    this.camera.position.z += (Math.random() - 0.5) * sh * 1.2;
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ((Math.random() - 0.5) * sh * 0.06);
    this.camera.updateProjectionMatrix();

    // скример
    let faceOn = false;
    let invert = 0;
    if (this.faceT >= 0) {
      this.faceT += dt;
      const f = this.faceT;
      // удар → темнота → второй удар вплотную, с распахнутой челюстью
      faceOn = f < 0.55 || (f > 0.82 && f < 1.0);
      if (f > 1.2) this.faceT = -1;
      const face = this.actors.face;
      // рывки, как в покадровой анимации: поза меняется скачком, а не плавно
      const frame = Math.floor(f * 14);
      if (frame !== this.faceFrame) {
        this.faceFrame = frame;
        face.rotation.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5);
        face.position.x = (Math.random() - 0.5) * 0.12;
        face.position.y = -0.08 + (Math.random() - 0.5) * 0.08;
      }
      face.position.z = f < 0.55 ? -1.7 + Math.min(0.55, f * 2.2) : -0.95;
      this.actors.faceJaw.rotation.x = f < 0.55 ? Math.min(0.9, f * 3) : 1.25;
      invert = this.invertFlash && (f < 0.05 || (f > 0.82 && f < 0.86)) ? 1 : 0;
    }
    this.actors.face.visible = faceOn;
    this.post.u.uInvert.value = invert;
    // дома: снять крышу над тем, где игрок; двери; свет внутри
    const v = this.view;
    for (let i = 0; i < v.roofs.length; i++) v.roofs[i]!.visible = w.playerHouse !== i;
    for (let i = 0; i < v.doors.length; i++) {
      const open = w.doorOpen[i];
      const d = v.doors[i]!;
      d.rotation.y = damp(d.rotation.y, open ? 1.75 : 0, open ? 1.6 : 22, dt);
    }
    const ph = w.playerHouse;
    const pierFigure = w.flags.has('pierFigure') && w.interactables.some((it) => it.id === 'pier' && it.enabled);
    if (ph >= 0 && w.houseLight[ph]) {
      const h = w.layout.houses[ph]!;
      v.interiorLight.color.setHex(0xffb060);
      v.interiorLight.position.set(h.x, (v.houseY[ph] ?? 0) + 2.1, h.z);
      v.interiorLight.distance = 7;
      v.interiorLight.intensity = 16 * (Math.random() < 0.04 ? 0.5 : 1);
    } else if (pierFigure) {
      // та же лампа (число источников постоянно) — холодный просвет луны над краем пристани
      v.interiorLight.color.setHex(0x9fb8e0);
      v.interiorLight.position.set(WORLD.pier.x1 - 0.5, 3.5, (WORLD.pier.z0 + WORLD.pier.z1) / 2 + 0.6);
      v.interiorLight.distance = 9;
      v.interiorLight.intensity = 22;
    } else {
      v.interiorLight.intensity = 0;
    }

    // пост
    const u = this.post.u;
    u.uTime.value = this.time;
    u.uGlitch.value = clamp(this.glitch + (faceOn ? 1 : 0), 0, 1);
    u.uSanity.value = playing ? clamp(1 - sanity, 0, 1) * 0.85 : 0.1;
    u.uHurt.value = this.hurt;
    u.uFlash.value = this.flashFx * this.fx.flashScale;
    u.uFade.value = this.fade;
    u.uDeadAir.value = w.deadAir ? 1 : 0;

    // стоп-кадр: основная сцена не перерисовывается (кадр «замёрз»), рисуется витрина
    this.showT = this.showOn ? Math.min(1, this.showT + dt * 2.2) : Math.max(0, this.showT - dt * 3);
    if (this.showT > 0) {
      this.showcase.update(dt);
      this.gl.setRenderTarget(this.showcase.rt);
      this.gl.setClearColor(0x000000, 0);
      this.gl.clear();
      this.gl.render(this.showcase.scene, this.showcase.camera);
      this.gl.setClearColor(0x000000, 1);
    }
    if (!this.showOn) {
      this.gl.setRenderTarget(this.rt);
      this.gl.render(this.scene, this.camera);
    }
    this.gl.setRenderTarget(null);
    u.tScene.value = this.rt.texture;
    u.tShow.value = this.showcase.rt.texture;
    u.uShow.value = this.showT;
    u.uGlitch.value = Math.max(u.uGlitch.value, this.showOn && this.showT < 0.5 ? 0.9 - this.showT : 0);
    this.gl.render(this.post.scene, this.post.camera);

    // динамическое разрешение
    // Интервал кадра — честный сигнал нагрузки GPU+CPU. Падаем быстро, растём осторожно.
    void t0;
    this.frameMs = this.frameMs * 0.94 + dt * 1000 * 0.06;
    this.resTimer += dt;
    if (this.resTimer > 2.5) {
      this.resTimer = 0;
      if (this.frameMs > 21 && this.resIndex > 0) this.resIndex--;
      else if (this.frameMs < 17.4 && this.resIndex < 2) this.resIndex++;
      this.resize();
    }
  }

  /** Экранные координаты точки мира (CSS-пиксели) — для прицела мышью и подсказок. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    this.tmp.set(x, y, z).project(this.camera);
    return { x: (this.tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-this.tmp.y * 0.5 + 0.5) * window.innerHeight };
  }
}
