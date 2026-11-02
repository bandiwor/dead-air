import * as THREE from 'three';
import { easeInOut } from '../core/math';
import type { StrKey } from '../i18n';

export interface Shot {
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo: [number, number, number];
  dur: number;
  fov?: number;
  line?: StrKey;
}

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
  onLine: (key: StrKey) => void = () => undefined;

  constructor(shots: Shot[]) {
    this.shots = shots;
  }

  start(): void {
    this.i = 0;
    this.t = 0;
    this.done = false;
    const s = this.shots[0];
    if (s?.line) this.onLine(s.line);
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
      if (n.line) this.onLine(n.line);
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

export const INTRO: Shot[] = [
  { from: [-34, 30, -78], to: [-14, 22, -66], lookFrom: [-4, 2, -46], lookTo: [-3, 0, -40], dur: 6, fov: 38, line: 'cut.intro.1' },
  { from: [44, 7, 38], to: [33, 5, 32], lookFrom: [17, 0, 19], lookTo: [20, -0.4, 19], dur: 6, fov: 36, line: 'cut.intro.2' },
  { from: [-5, 2.2, 7], to: [-2.5, 3.5, 4.5], lookFrom: [0, 6.6, 0], lookTo: [0, 7, 0], dur: 6, fov: 42, line: 'cut.intro.3' },
  { from: [1, 4, 10], to: [3.5, 14, 13], lookFrom: [5, 1.2, 0], lookTo: [3.8, 0.5, 2.6], dur: 6, fov: 42, line: 'cut.intro.4' },
];

export const DAWN: Shot[] = [
  { from: [8, 9, 34], to: [12, 6, 30], lookFrom: [18, 0, 18], lookTo: [20, -0.4, 19], dur: 6, fov: 36, line: 'cut.dawn.1' },
  { from: [14, 1.8, 21.5], to: [16, 1.5, 20.6], lookFrom: [22, -0.6, 19], lookTo: [24, -0.8, 19.5], dur: 6, fov: 40, line: 'cut.dawn.2' },
  { from: [20.5, 2.4, 19], to: [21.2, 1.4, 19], lookFrom: [22.5, -0.75, 19], lookTo: [22.6, -0.76, 19.1], dur: 6, fov: 44, line: 'cut.dawn.3' },
];
