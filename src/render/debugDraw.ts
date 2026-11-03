import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Box } from '../sim/collision';
import { Kind } from '../content/enemies';
import { WORLD, heightAt } from '../proc/terrain';
import { PLAYER_R } from '../sim/player';

const KIND_COLOR: Record<number, number> = {
  [Kind.Whisperer]: 0xffcc66,
  [Kind.Mute]: 0xff5544,
  [Kind.Echo]: 0x66ffee,
  [Kind.Apparition]: 0xcc88ff,
  [Kind.Unseeing]: 0x88aaff,
  [Kind.Choir]: 0xff88cc,
};
const DYN_MAX = 24000;

/**
 * Отладочная отрисовка поверх мира: стены и постройки, деревья и мебель, границы мира,
 * двери (красная — закрыта, зелёная — открыта), враги по типам (белый — в луче), фонарь,
 * радиусы взаимодействий (бирюзовый — доступно, серый — выключено), находки.
 */
export class DebugDraw {
  readonly group = new THREE.Group();
  private readonly dyn: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  private readonly c = new THREE.Color();

  constructor(w: World) {
    // статика — один раз
    const sp: number[] = [];
    const sc: number[] = [];
    const push = (x0: number, z0: number, x1: number, z1: number, color: number): void => {
      this.c.set(color);
      sp.push(x0, heightAt(x0, z0) + 0.08, z0, x1, heightAt(x1, z1) + 0.08, z1);
      sc.push(this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b);
    };
    for (const b of w.statics.boxes) boxLines(b, push, 0xff7744);
    for (const b of w.statics.footprints) boxLines(b, push, 0x775533);
    for (let i = 0; i < w.statics.treeX.length; i++) circle(w.statics.treeX[i]!, w.statics.treeZ[i]!, w.statics.treeR[i]!, 8, push, 0x55aa55);
    for (const p of w.statics.poles) circle(p.x, p.z, p.r, 10, push, 0xffaa66);
    circle(0, 0, WORLD.bounds, 96, push, 0xff3333);
    const pr = WORLD.pier;
    boxLines({ cx: (pr.x0 + pr.x1) / 2, cz: (pr.z0 + pr.z1) / 2, hw: (pr.x1 - pr.x0) / 2, hd: (pr.z1 - pr.z0) / 2, c: 1, s: 0 }, push, 0xaaaa66);
    circle(WORLD.pond.x, WORLD.pond.z, WORLD.pond.r, 48, push, 0x3388ff);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85, fog: false });
    const stat = new THREE.LineSegments(sg, mat);
    stat.renderOrder = 999;
    stat.frustumCulled = false;
    this.group.add(stat);

    this.pos = new Float32Array(DYN_MAX * 3);
    this.col = new Float32Array(DYN_MAX * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.dyn = new THREE.LineSegments(dg, mat);
    this.dyn.renderOrder = 1000;
    this.dyn.frustumCulled = false;
    this.group.add(this.dyn);
    this.group.visible = false;
  }

  private seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    if (this.n >= DYN_MAX - 2) return;
    this.c.set(color);
    const i = this.n * 3;
    this.pos.set([x0, y0, z0, x1, y1, z1], i);
    this.col.set([this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b], i);
    this.n += 2;
  }

  private ring(x: number, z: number, r: number, color: number, n = 16, y = heightAt(x, z) + 0.1): void {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      this.seg(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, color);
    }
  }

  update(w: World): void {
    if (!this.group.visible) return;
    this.n = 0;
    const p = w.player;
    // игрок и конус фонаря
    this.ring(p.x, p.z, PLAYER_R, 0xffffff);
    const y = p.y + 0.15;
    for (const s of [-0.44, 0, 0.44]) this.seg(p.x, y, p.z, p.x + Math.cos(p.yaw + s) * 16, y, p.z + Math.sin(p.yaw + s) * 16, s === 0 ? 0xffffaa : 0x888855);
    // двери
    w.statics.doors.forEach((b, i) => {
      boxLines(b, (x0, z0, x1, z1, c) => this.seg(x0, p.y + 0.3, z0, x1, p.y + 0.3, z1, c), w.doorOpen[i] ? 0x44ff66 : 0xff2222);
    });
    // враги
    for (const e of w.enemies) {
      if (!e.active) continue;
      const color = e.litTorch ? 0xffffff : e.fake ? 0x777777 : (KIND_COLOR[e.kind] ?? 0xffffff);
      this.ring(e.x, e.z, e.r, color, 12, e.y + 0.1);
      this.seg(e.x, e.y + 0.1, e.z, e.x + Math.cos(e.yaw) * 1.2, e.y + 0.1, e.z + Math.sin(e.yaw) * 1.2, color);
      if (e.kind === Kind.Mute) this.seg(e.x, e.y + 0.2, e.z, e.tx, heightAt(e.tx, e.tz) + 0.2, e.tz, 0xff5544);
    }
    // взаимодействия и находки
    for (const it of w.interactables) this.ring(it.x, it.z, it.r, it.enabled ? 0x7fd6c2 : 0x444444, 20);
    for (const pk of w.pickups) if (pk.active) this.ring(pk.x, pk.z, 1.25, 0xe8a33d, 12);
    for (const f of w.flares) if (f.active) this.ring(f.x, f.z, 6.5, 0xffd6a0, 24);
    const g = this.dyn.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position!.needsUpdate = true;
    g.attributes.color!.needsUpdate = true;
  }
}

type Push = (x0: number, z0: number, x1: number, z1: number, color: number) => void;

function boxLines(b: Box, push: Push, color: number): void {
  const pts: [number, number][] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = sx * b.hw;
    const lz = sz * b.hd;
    pts.push([b.cx + lx * b.c + lz * b.s, b.cz - lx * b.s + lz * b.c]);
  }
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!;
    const c = pts[(i + 1) % 4]!;
    push(a[0], a[1], c[0], c[1], color);
  }
}

function circle(x: number, z: number, r: number, n: number, push: Push, color: number): void {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    push(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, color);
  }
}
