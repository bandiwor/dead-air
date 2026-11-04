import { t, isStrKey } from '../i18n';
import { WEAPONS } from '../content/weapons';
import type { World } from '../sim/world';
import { h, show } from './dom';
import type { Input } from '../platform/input';

/** Минимальный «фосфорный» HUD. Обновляется дёшево: DOM трогается только при изменении значений. */
export class Hud {
  readonly root: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly airLabel: HTMLElement;
  private readonly airFill: HTMLElement;
  private readonly air: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly dyn: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptFill: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly subs: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly marker: { el: HTMLElement; label: HTMLElement };
  private readonly goalMarker: { el: HTMLElement; label: HTMLElement };
  private readonly objective: HTMLElement;
  private readonly letters: HTMLElement;
  private readonly br: HTMLElement;
  readonly buttons: HTMLElement;
  readonly pauseBtn: HTMLElement;
  private cache = new Map<HTMLElement, string>();
  private subQueue: { text: string; style: number }[] = [];
  private subT = 0;
  private toastT = 0;
  private sanityLie = 0;
  /** Масштаб интерфейса (--ui из CSS), обновляется при смене размера окна. */
  private zoom = 1;

  constructor(parent: HTMLElement, input: Input) {
    this.root = h('div', 'hud hidden', undefined, parent);
    const readZoom = (): void => {
      this.zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
    };
    readZoom();
    window.addEventListener('resize', readZoom);
    const tl = h('div', 'hud-tl', undefined, this.root);
    this.clock = h('div', 'hud-clock', '22:00', tl);
    this.wave = h('div', 'hud-wave', '', tl);
    this.air = h('div', 'hud-air', undefined, tl);
    this.airLabel = h('span', 'hud-air-label', t('hud.air'), this.air);
    const bar = h('div', 'bar', undefined, this.air);
    this.airFill = h('div', 'bar-fill', undefined, bar);

    this.pauseBtn = h('button', 'btn-pause', 'II', this.root);
    input.bindButton(this.pauseBtn, 'pause');

    const bl = h('div', 'hud-bl', undefined, this.root);
    const hp = h('div', 'bar bar-hp', undefined, bl);
    this.hpFill = h('div', 'bar-fill', undefined, hp);

    const br = h('div', 'hud-br', undefined, this.root);
    this.br = br;
    this.weapon = h('div', 'hud-weapon', '', br);
    this.ammo = h('div', 'hud-ammo', '', br);
    this.dyn = h('div', 'hud-dyn', '', br);

    this.prompt = h('div', 'hud-prompt hidden', undefined, this.root);
    this.promptLabel = h('div', 'prompt-label', '', this.prompt);
    const pb = h('div', 'bar bar-prompt', undefined, this.prompt);
    this.promptFill = h('div', 'bar-fill', undefined, pb);
    this.subs = h('div', 'subs', '', this.root);
    this.toast = h('div', 'toast', '', this.root);
    this.marker = { el: h('div', 'marker hidden', '▲', this.root), label: h('div', 'marker-dist hidden', '', this.root) };
    this.goalMarker = { el: h('div', 'marker goal hidden', '▲', this.root), label: h('div', 'marker-dist goal hidden', '', this.root) };
    this.objective = h('div', 'hud-objective', '', this.root);
    this.letters = h('div', 'hud-letters hidden', '', tl);

    this.buttons = h('div', 'buttons', undefined, this.root);
    const mk = (id: 'action' | 'swap' | 'throw' | 'reload' | 'voice', key: Parameters<typeof t>[0]): void => {
      const b = h('button', `btn btn-${id}`, t(key), this.buttons);
      input.bindButton(b, id);
    };
    mk('swap', 'btn.swap');
    mk('reload', 'btn.reload');
    mk('throw', 'btn.throw');
    mk('action', 'btn.action');
    mk('voice', 'btn.voice');
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  setVisible(on: boolean): void {
    show(this.root, on);
    if (!on) this.root.parentElement?.classList.remove('touch-ui');
  }

  setTouch(on: boolean): void {
    show(this.buttons, on);
    // неподвижный правый стик виден всегда, пока играют пальцами
    this.root.parentElement?.classList.toggle('touch-ui', on);
  }

  line(key: string, style: number): void {
    if (!isStrKey(key)) return;
    this.subQueue.push({ text: t(key), style });
  }

  toastText(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    this.toastT = 2.2;
  }

  /**
   * Субтитр кат-сцены: сбрасывает очередь и показывается сразу, ровно на время плана,
   * чтобы текст не отставал от картинки.
   */
  cue(key: string, secs: number): void {
    if (!isStrKey(key)) return;
    this.subQueue = [];
    const text = t(key);
    this.subs.textContent = text;
    this.subs.className = 'subs on style-0';
    this.subT = Math.max(1.5, secs - 0.35);
  }

  clearSubs(): void {
    this.subQueue = [];
    this.subT = 0;
    this.subs.classList.remove('on');
  }

  /**
   * Стрелка к цели. Цель на экране — стрелка над ней. За краем — стрелка у края экрана
   * (на луче из центра, с отступом от рамки) смотрит наружу, рядом — сколько метров идти.
   */
  private placeMarker(m: { el: HTMLElement; label: HTMLElement }, pt: { x: number; y: number; dist: number } | null): void {
    show(m.el, !!pt);
    if (!pt) {
      show(m.label, false);
      return;
    }
    const W = innerWidth;
    const H = innerHeight;
    const pad = 48 * this.zoom;
    const off = pt.x < pad * 0.5 || pt.y < pad * 0.5 || pt.x > W - pad * 0.5 || pt.y > H - pad * 0.5;
    const cx = W / 2;
    const cy = H / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const ang = Math.atan2(dy, dx);
    let mx = pt.x;
    let my = pt.y - 40 * this.zoom;
    if (off) {
      // пересечение луча из центра с прямоугольником экрана, ужатым на отступ
      const tx = Math.abs(dx) > 1e-3 ? (cx - pad) / Math.abs(dx) : Infinity;
      const ty = Math.abs(dy) > 1e-3 ? (cy - pad) / Math.abs(dy) : Infinity;
      const k = Math.min(tx, ty);
      mx = cx + dx * k;
      my = cy + dy * k;
    }
    // HUD увеличен через CSS zoom — экранные пиксели переводим в его единицы
    const z = this.zoom;
    m.el.style.transform = `translate(${mx / z}px, ${my / z}px) rotate(${off ? ang + Math.PI / 2 : Math.PI}rad)`;
    show(m.label, off);
    if (off) {
      // подпись — сбоку от стрелки, в сторону центра по горизонтали: у нижнего края не налезает
      // на субтитры, у боковых — не уходит за экран
      const side = Math.abs(dx) < 1 ? 1 : -Math.sign(dx);
      const lx = mx + side * 36 * z;
      const ly = my;
      const d = pt.dist < 10 ? Math.round(pt.dist) : Math.round(pt.dist / 5) * 5;
      this.set(m.label, `${d} м`);
      m.label.style.transform = `translate(${lx / z}px, ${ly / z}px) translate(-50%, -50%)`;
    }
  }

  update(w: World, dt: number, touch: boolean, hutScreen: { x: number; y: number; dist: number }, goalScreen: { x: number; y: number; dist: number } | null): void {
    const p = w.player;
    const hours = w.clockHours % 24;
    const hh = Math.floor(hours);
    const mm = Math.floor((hours - hh) * 60);
    this.set(this.clock, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const d = w.director;
    this.set(this.wave, w.cfg.night.waves.length === 0 ? '' : d.waveActive ? t('hud.wave', { n: d.waveIndex + 1 }) : t('hud.lull'));
    const night = w.cfg.night;
    // без радио полоса эфира становится зарядом фонаря
    const level = night.battery ? p.battery : w.air;
    this.set(this.airLabel, night.battery ? t('hud.battery') : w.deadAir ? t('hud.deadAir') : t('hud.air'));
    this.air.classList.toggle('low', level < 0.25);
    this.air.classList.toggle('dead', !night.battery && w.deadAir);
    show(this.air, !!night.battery || (!night.noRadio && !night.child));
    this.airFill.style.transform = `scaleX(${level.toFixed(3)})`;
    // ребёнок не носит оружия; крик — только там, где он есть
    const armed = !night.child;
    show(this.br, armed);
    this.buttons.classList.toggle('unarmed', !armed);
    this.buttons.classList.toggle('voiced', !!night.voice);
    show(this.letters, !!night.voice);
    if (night.voice) {
      const name = 'ВАНЯ';
      let s = `${t('hud.name')}: `;
      for (const ch of name) s += w.letters.includes(ch) ? `${ch} ` : '_ ';
      this.set(this.letters, s.trim());
    }
    this.hpFill.style.transform = `scaleX(${(p.hp / 100).toFixed(3)})`;
    this.hpFill.parentElement!.classList.toggle('low', p.hp < 35);

    const wd = WEAPONS[p.weapon]!;
    this.set(this.weapon, t(wd.nameKey));
    // При низком рассудке счётчик патронов «врёт» на единицу — игрок перестаёт доверять интерфейсу.
    this.sanityLie -= dt;
    let mag = p.mag[p.weapon]!;
    if (p.sanity < 45 && this.sanityLie <= 0 && Math.random() < dt * 0.3) this.sanityLie = 1.5;
    if (this.sanityLie > 0 && mag > 1) mag += 1;
    this.set(this.ammo, p.reload > 0 ? t('hud.reload') : mag === 0 && p.reserve[p.weapon] === 0 ? t('hud.empty') : `${mag} / ${p.reserve[p.weapon]}`);
    this.set(this.dyn, `${t('btn.throw')} × ${p.dynamite}`);

    // подсказка действия: бобина или объект в фокусе
    const focus = p.focus >= 0 ? w.interactables[p.focus] : undefined;
    show(this.prompt, p.canReel || !!focus);
    if (p.canReel) {
      this.set(this.promptLabel, touch ? t('prompt.reel') : t('prompt.reelKb'));
      this.promptFill.style.transform = `scaleX(${p.reel.toFixed(3)})`;
      this.prompt.classList.remove('rule');
    } else if (focus) {
      this.set(this.promptLabel, t((focus.prompt || 'prompt.read') as Parameters<typeof t>[0]));
      this.promptFill.style.transform = `scaleX(${focus.hold > 0 ? (p.focusHold / focus.hold).toFixed(3) : '0'})`;
      // нарушение Наказа подсвечено иначе — игрок понимает цену выбора
      this.prompt.classList.toggle('rule', focus.rule);
    }

    this.set(this.objective, w.objective ? t(w.objective as Parameters<typeof t>[0]) : '');

    // метки: радиоузел (когда бобина садится) и сюжетная цель
    this.placeMarker(this.marker, !night.noRadio && w.air < 0.35 && !p.canReel ? hutScreen : null);
    this.placeMarker(this.goalMarker, goalScreen);

    // субтитры
    this.subT -= dt;
    if (this.subT <= 0) {
      const next = this.subQueue.shift();
      if (next) {
        this.subs.textContent = next.text;
        this.subs.className = `subs on style-${next.style}`;
        this.subT = Math.max(3.2, next.text.length * 0.065);
      } else {
        this.subs.classList.remove('on');
      }
    }
    this.toastT -= dt;
    if (this.toastT <= 0) this.toast.classList.remove('on');
  }
}
