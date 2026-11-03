import { emptyInput, type InputFrame } from '../sim/types';
import { vibrate } from './native';

const STICK_R = 62;
/** Левый стик: мёртвая зона, полная скорость уже на половине хода, «поводок» короче радиуса. */
const MOVE_DEAD = 0.1;
const MOVE_FULL = 0.55;
const MOVE_LEASH = 0.8;
/** Правый стик: до AIM_FIRE — только целиться (широкая зона без стрельбы), дальше — огонь. */
const AIM_DEAD = 0.12;
const AIM_FIRE = 0.62;

interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  el: HTMLElement;
  knob: HTMLElement;
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Буква → физическая клавиша, если браузер не прислал code (удалённый рабочий стол, экранная клавиатура). */
const BY_KEY: Record<string, string> = {
  w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', e: 'KeyE', q: 'KeyQ', g: 'KeyG', r: 'KeyR', f: 'KeyF',
  ц: 'KeyW', ф: 'KeyA', ы: 'KeyS', в: 'KeyD', у: 'KeyE', й: 'KeyQ', п: 'KeyG', к: 'KeyR', а: 'KeyF',
};

export function keyCode(e: { code: string; key: string }): string {
  if (e.code && e.code !== 'Unidentified') return e.code;
  return BY_KEY[e.key.toLowerCase()] ?? e.key;
}

export type ButtonId = 'action' | 'swap' | 'throw' | 'reload' | 'voice' | 'pause';

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
  private edges = { swap: false, throw: false, reload: false, action: false, voice: false };
  private select = -1;
  /** Позиция игрока на экране (для прицела мышью). */
  playerScreen = { x: 0, y: 0 };
  autofire = true;
  enabled = false;
  onPause: () => void = () => undefined;
  usingTouch = false;
  /** Прицел-курсор для мыши: системный курсор в игре скрыт. */
  private readonly reticle: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.moveEl = this.makeStick('stick-move');
    this.aimEl = this.makeStick('stick-aim');
    this.reticle = document.createElement('div');
    this.reticle.className = 'reticle';
    root.appendChild(this.reticle);

    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.moveEv(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      const code = keyCode(e);
      // удержание всегда обновляет состояние (если отпускание потерялось — оно восстановится);
      // одиночные нажатия срабатывают только на первом событии
      this.keys.add(code);
      if (this.enabled && MOVE_KEYS.has(code)) e.preventDefault();
      if (e.repeat) return;
      if (code === 'KeyQ') this.edges.swap = true;
      if (code === 'KeyG') this.edges.throw = true;
      if (code === 'KeyR') this.edges.reload = true;
      if (code === 'KeyF') this.edges.voice = true;
      if (/^Digit[1-5]$/.test(code)) this.select = Number(code.slice(5)) - 1;
      if (code === 'KeyE' || code === 'Space') this.edges.action = true;
      if (code === 'Escape' || code === 'KeyP') this.onPause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(keyCode(e));
      this.keys.delete(e.code);
    });
    // отпускание клавиши вне окна не приходит: всё, что было зажато, считаем отпущенным
    const release = (): void => {
      this.keys.clear();
      this.mouse.down = false;
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    document.addEventListener('fullscreenchange', release);
    // колесо: одна смена оружия на одно движение, а не по щелчку за каждый шаг прокрутки
    let lastWheel = 0;
    window.addEventListener(
      'wheel',
      () => {
        const now = performance.now();
        if (now - lastWheel > 220) this.edges.swap = true;
        lastWheel = now;
      },
      { passive: true },
    );
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
      if (id === 'action') {
        this.held.action = true;
        this.edges.action = true;
      }
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
    if (left && !this.move) {
      // левый стик — плавающий: появляется под пальцем
      this.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, el: this.moveEl, knob: this.moveEl.firstElementChild as HTMLElement };
      this.moveEl.style.transform = `translate(${e.clientX - STICK_R}px, ${e.clientY - STICK_R}px)`;
      (this.moveEl.firstElementChild as HTMLElement).style.transform = 'translate(0px, 0px)';
      this.moveEl.classList.add('on');
    } else if (!left && !this.aim) {
      // правый стик — неподвижный: направление считается от его центра, где бы ни коснулись справа
      const r = this.aimEl.getBoundingClientRect();
      let ox = r.left + r.width / 2;
      let oy = r.top + r.height / 2;
      if (Math.hypot(e.clientX - ox, e.clientY - oy) > STICK_R * 1.5) {
        // коснулись далеко от стика — он на это касание переезжает под палец (иначе сразу огонь)
        this.aimEl.style.translate = `${e.clientX - ox}px ${e.clientY - oy}px`;
        ox = e.clientX;
        oy = e.clientY;
      }
      this.aim = { id: e.pointerId, ox, oy, x: 0, y: 0, el: this.aimEl, knob: this.aimEl.firstElementChild as HTMLElement };
      this.aimEl.classList.add('on');
      this.moveEv(e);
    } else return;
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
      this.reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      return;
    }
    const s = this.move?.id === e.pointerId ? this.move : this.aim?.id === e.pointerId ? this.aim : null;
    if (!s) return;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    let d = Math.hypot(dx, dy);
    if (s === this.move && d > STICK_R * MOVE_LEASH) {
      // левый стик тянется за пальцем, но держит его на «поводке» короче радиуса:
      // если чуть ослабить палец, скорость не падает — персонаж продолжает идти
      const k = (d - STICK_R * MOVE_LEASH) / d;
      s.ox += dx * k;
      s.oy += dy * k;
      // и не уползает за край экрана
      s.ox = Math.min(Math.max(s.ox, STICK_R), window.innerWidth * 0.5);
      s.oy = Math.min(Math.max(s.oy, STICK_R), window.innerHeight - STICK_R * 0.5);
      dx = e.clientX - s.ox;
      dy = e.clientY - s.oy;
      d = Math.hypot(dx, dy);
      s.el.style.transform = `translate(${s.ox - STICK_R}px, ${s.oy - STICK_R}px)`;
    }
    s.x = dx / STICK_R;
    s.y = dy / STICK_R;
    // ручка не выходит за кольцо
    const kd = d > STICK_R ? STICK_R / d : 1;
    s.knob.style.transform = `translate(${dx * kd}px, ${dy * kd}px)`;
    if (s === this.aim) this.aimEl.classList.toggle('firing', Math.hypot(s.x, s.y) > this.fireAt());
  }

  /** Сколько нужно отклонить правый стик, чтобы пошла стрельба (до этого — только прицел). */
  private fireAt(): number {
    return this.autofire ? AIM_FIRE : 0.92;
  }

  private up(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouse.down = false;
      return;
    }
    for (const key of ['move', 'aim'] as const) {
      const s = this[key];
      if (s && s.id === e.pointerId) {
        s.el.classList.remove('on', 'firing');
        s.knob.style.transform = 'translate(0px, 0px)';
        if (s === this.aim) this.aimEl.style.translate = '';
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
    this.edges = { swap: false, throw: false, reload: false, action: false, voice: false };
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
    out.aimSoft = false;
    if (this.move) {
      const l = Math.hypot(this.move.x, this.move.y);
      if (l > MOVE_DEAD) {
        // плавная кривая: мелкие движения — шаг, половина хода — бег
        const t = Math.min(1, (l - MOVE_DEAD) / (MOVE_FULL - MOVE_DEAD));
        const k = (t * t * (3 - 2 * t) * 0.35 + t * 0.65) / l;
        out.mx = this.move.x * k;
        out.mz = this.move.y * k;
      }
    }
    if (this.aim) {
      const l = Math.hypot(this.aim.x, this.aim.y);
      if (l > AIM_DEAD) {
        out.aiming = true;
        out.ax = this.aim.x;
        out.az = this.aim.y;
        out.fire = l > this.fireAt();
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
        // мышь просто наведена — «мягкий» прицел: на ходу персонаж смотрит по ходу
        out.aimSoft = !this.mouse.down;
      }
    }
    // короткий тап не теряется: «защёлка» держит действие хотя бы один тик
    out.action = this.held.action || k.has('KeyE') || k.has('Space') || this.edges.action;
    this.edges.action = false;
    out.swap = this.edges.swap;
    out.throw = this.edges.throw;
    out.reload = this.edges.reload;
    out.voice = this.edges.voice;
    out.select = this.select;
    this.select = -1;
    this.edges.swap = this.edges.throw = this.edges.reload = this.edges.voice = false;
    // курсор-прицел виден только в игре с мышью
    const mouseUi = this.enabled && !this.usingTouch && this.mouse.active;
    this.root.classList.toggle('mouse-aim', mouseUi);
    this.reticle.classList.toggle('firing', mouseUi && this.mouse.down);
    if (!this.enabled) {
      out.mx = out.mz = 0;
      out.fire = out.aiming = out.action = out.swap = out.throw = out.reload = out.voice = false;
      out.select = -1;
    }
    return out;
  }
}
