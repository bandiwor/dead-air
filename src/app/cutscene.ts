import * as THREE from 'three';
import { easeInOut } from '../core/math';
import type { StrKey } from '../i18n';
import type { Shot } from '../content/script';

export type { Shot };

/**
 * Кат-сцены как данные: список планов с движением камеры и репликами.
 * Игра на время сцены не останавливает мир — он «дышит» (звук, ветер, свет).
 */
export class Cutscene {
  private i = 0;
  private t = 0;
  private readonly shots: Shot[];
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  done = false;
  /** Реплика плана и сколько он длится — субтитр живёт ровно столько же. */
  onLine: (key: StrKey, dur: number) => void = () => undefined;

  constructor(shots: Shot[]) {
    this.shots = shots;
  }

  start(): void {
    this.i = 0;
    this.t = 0;
    this.done = false;
    const s = this.shots[0];
    if (s?.line) this.onLine(s.line, s.dur);
  }

  /** Номер текущего плана и время в нём (для постановки сцены). */
  get shot(): number {
    return this.i;
  }

  get shotT(): number {
    return this.t;
  }

  skip(): void {
    this.done = true;
  }

  /** Возвращает текущий план камеры или null, если сцена окончена. */
  update(dt: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number; k: number } | null {
    if (this.done) return null;
    const s = this.shots[this.i];
    if (!s) {
      this.done = true;
      return null;
    }
    this.t += dt;
    if (this.t >= s.dur) {
      this.i++;
      this.t = 0;
      const n = this.shots[this.i];
      if (!n) {
        this.done = true;
        return null;
      }
      if (n.line) this.onLine(n.line, n.dur);
      return this.update(0);
    }
    const k = easeInOut(Math.min(1, this.t / s.dur));
    this.pos.set(...s.from).lerp(new THREE.Vector3(...s.to), k);
    this.look.set(...s.lookFrom).lerp(new THREE.Vector3(...s.lookTo), k);
    // общий прогресс (для затемнений на краях)
    const edge = Math.min(this.t / 0.6, (s.dur - this.t) / 0.6, 1);
    return { pos: this.pos, look: this.look, fov: s.fov ?? 40, k: edge };
  }
}

