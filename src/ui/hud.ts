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
  private readonly marker: HTMLElement;
  private readonly goalMarker: HTMLElement;
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
    this.marker = h('div', 'marker hidden', '▲', this.root);
    this.goalMarker = h('div', 'marker goal hidden', '▲', this.root);
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

  private placeMarker(el: HTMLElement, pt: { x: number; y: number } | null): void {
    show(el, !!pt);
    if (!pt) return;
    const off = pt.x < 0 || pt.y < 0 || pt.x > innerWidth || pt.y > innerHeight;
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    const ang = Math.atan2(pt.y - cy, pt.x - cx);
    const r = Math.min(cx, cy) * 0.82;
    const mx = off ? cx + Math.cos(ang) * r : pt.x;
    const my = off ? cy + Math.sin(ang) * r : pt.y - 40 * this.zoom;
    // HUD увеличен через CSS zoom — экранные пиксели переводим в его единицы
    el.style.transform = `translate(${mx / this.zoom}px, ${my / this.zoom}px) rotate(${off ? ang + Math.PI / 2 : Math.PI}rad)`;
  }

  update(w: World, dt: number, touch: boolean, hutScreen: { x: number; y: number }, goalScreen: { x: number; y: number } | null): void {
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
