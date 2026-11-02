import { emptyInput, type InputFrame } from '../sim/types';
import { vibrate } from './native';

const STICK_R = 62;

interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  el: HTMLElement;
  knob: HTMLElement;
}

export type ButtonId = 'action' | 'swap' | 'throw' | 'reload' | 'pause';

/**
 * Ввод: плавающие стики (появляются под пальцем), кнопки, клавиатура/мышь — всё сводится
 * в один InputFrame. Нажатия (swap/throw/reload) живут один тик симуляции.
 */
export class Input {
  private readonly root: HTMLElement;
  private move: Stick | null = null;
  private aim: Stick | null = null;
  private readonly moveEl: HTMLElement;
  private readonly aimEl: HTMLElement;
  private readonly keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, active: false };
  private held = { action: false };
  private edges = { swap: false, throw: false, reload: false };
  /** Позиция игрока на экране (для прицела мышью). */
  playerScreen = { x: 0, y: 0 };
  autofire = true;
  enabled = false;
  onPause: () => void = () => undefined;
  usingTouch = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.moveEl = this.makeStick('stick-move');
    this.aimEl = this.makeStick('stick-aim');

    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.moveEv(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.edges.swap = true;
      if (e.code === 'KeyG') this.edges.throw = true;
      if (e.code === 'KeyR') this.edges.reload = true;
      if (e.code === 'Escape') this.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    window.addEventListener('wheel', () => (this.edges.swap = true), { passive: true });
  }

  private makeStick(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `stick ${cls}`;
    const knob = document.createElement('div');
    knob.className = 'knob';
    el.appendChild(knob);
    this.root.appendChild(el);
    return el;
  }

  bindButton(el: HTMLElement, id: ButtonId): void {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      vibrate(8);
      el.classList.add('pressed');
      if (id === 'action') this.held.action = true;
      else if (id === 'pause') this.onPause();
      else this.edges[id] = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
    });
    const release = (): void => {
      el.classList.remove('pressed');
      if (id === 'action') this.held.action = false;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.usingTouch = false;
      this.mouse.down = e.button === 0;
      this.mouse.active = true;
      return;
    }
    this.usingTouch = true;
    const left = e.clientX < window.innerWidth * 0.45;
    const s: Stick = {
      id: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      x: 0,
      y: 0,
      el: left ? this.moveEl : this.aimEl,
      knob: (left ? this.moveEl : this.aimEl).firstElementChild as HTMLElement,
    };
    if (left && !this.move) this.move = s;
    else if (!left && !this.aim) this.aim = s;
    else return;
    s.el.style.transform = `translate(${s.ox - STICK_R}px, ${s.oy - STICK_R}px)`;
    s.knob.style.transform = 'translate(0px, 0px)';
    s.el.classList.add('on');
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  private moveEv(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
      return;
    }
    const s = this.move?.id === e.pointerId ? this.move : this.aim?.id === e.pointerId ? this.aim : null;
    if (!s) return;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // стик «едет» за пальцем — не нужно возвращаться к центру
      const k = (d - STICK_R) / d;
      s.ox += dx * k;
      s.oy += dy * k;
      dx = e.clientX - s.ox;
      dy = e.clientY - s.oy;
      s.el.style.transform = `translate(${s.ox - STICK_R}px, ${s.oy - STICK_R}px)`;
    }
    s.x = dx / STICK_R;
    s.y = dy / STICK_R;
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private up(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouse.down = false;
      return;
    }
    for (const key of ['move', 'aim'] as const) {
      const s = this[key];
      if (s && s.id === e.pointerId) {
        s.el.classList.remove('on');
        this[key] = null;
      }
    }
  }

  reset(): void {
    this.move = null;
    this.aim = null;
    this.moveEl.classList.remove('on');
    this.aimEl.classList.remove('on');
    this.held.action = false;
    this.mouse.down = false;
    this.edges = { swap: false, throw: false, reload: false };
  }

  /** Снимок ввода для одного тика; нажатия сбрасываются. */
  sample(out: InputFrame = emptyInput()): InputFrame {
    out.mx = 0;
    out.mz = 0;
    out.ax = 0;
    out.az = 0;
    out.aiming = false;
    out.fire = false;
    out.assist = false;
    if (this.move) {
      const dz = 0.14;
      const l = Math.hypot(this.move.x, this.move.y);
      if (l > dz) {
        const k = Math.min(1, (l - dz) / (1 - dz)) / l;
        out.mx = this.move.x * k;
        out.mz = this.move.y * k;
      }
    }
    if (this.aim) {
      const l = Math.hypot(this.aim.x, this.aim.y);
      if (l > 0.18) {
        out.aiming = true;
        out.ax = this.aim.x;
        out.az = this.aim.y;
        out.fire = this.autofire ? l > 0.35 : l > 0.85;
        out.assist = true;
      }
    }
    // клавиатура
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const kz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      out.mx = kx / l;
      out.mz = kz / l;
    }
    if (!this.usingTouch && this.mouse.active) {
      const dx = this.mouse.x - this.playerScreen.x;
      const dy = this.mouse.y - this.playerScreen.y;
      if (Math.hypot(dx, dy) > 4) {
        out.aiming = true;
        out.ax = dx;
        out.az = dy * 1.25; // компенсация наклона камеры
        out.fire = this.mouse.down;
      }
    }
    out.action = this.held.action || k.has('KeyE') || k.has('Space');
    out.swap = this.edges.swap;
    out.throw = this.edges.throw;
    out.reload = this.edges.reload;
    this.edges.swap = this.edges.throw = this.edges.reload = false;
    if (!this.enabled) {
      out.mx = out.mz = 0;
      out.fire = out.aiming = out.action = out.swap = out.throw = out.reload = false;
    }
    return out;
  }
}
