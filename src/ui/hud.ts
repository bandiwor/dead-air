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
  readonly buttons: HTMLElement;
  readonly pauseBtn: HTMLElement;
  private cache = new Map<HTMLElement, string>();
  private subQueue: { text: string; style: number }[] = [];
  private subT = 0;
  private toastT = 0;
  private sanityLie = 0;

  constructor(parent: HTMLElement, input: Input) {
    this.root = h('div', 'hud hidden', undefined, parent);
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

    this.buttons = h('div', 'buttons', undefined, this.root);
    const mk = (id: 'action' | 'swap' | 'throw' | 'reload', key: Parameters<typeof t>[0]): void => {
      const b = h('button', `btn btn-${id}`, t(key), this.buttons);
      input.bindButton(b, id);
    };
    mk('swap', 'btn.swap');
    mk('reload', 'btn.reload');
    mk('throw', 'btn.throw');
    mk('action', 'btn.action');
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  setVisible(on: boolean): void {
    show(this.root, on);
  }

  setTouch(on: boolean): void {
    show(this.buttons, on);
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

  clearSubs(): void {
    this.subQueue = [];
    this.subT = 0;
    this.subs.classList.remove('on');
  }

  update(w: World, dt: number, touch: boolean, hutScreen: { x: number; y: number }): void {
    const p = w.player;
    const hours = w.clockHours % 24;
    const hh = Math.floor(hours);
    const mm = Math.floor((hours - hh) * 60);
    this.set(this.clock, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const d = w.director;
    this.set(this.wave, d.waveActive ? t('hud.wave', { n: d.waveIndex + 1 }) : t('hud.lull'));
    this.set(this.airLabel, w.deadAir ? t('hud.deadAir') : t('hud.air'));
    this.air.classList.toggle('low', w.air < 0.25);
    this.air.classList.toggle('dead', w.deadAir);
    this.airFill.style.transform = `scaleX(${w.air.toFixed(3)})`;
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

    show(this.prompt, p.canReel);
    if (p.canReel) {
      this.set(this.promptLabel, touch ? t('prompt.reel') : t('prompt.reelKb'));
      this.promptFill.style.transform = `scaleX(${p.reel.toFixed(3)})`;
    }

    // метка радиоузла, когда бобина садится и узел за краем экрана
    const needAir = w.air < 0.35 && !p.canReel;
    const off = hutScreen.x < 0 || hutScreen.y < 0 || hutScreen.x > innerWidth || hutScreen.y > innerHeight;
    show(this.marker, needAir);
    if (needAir) {
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const ang = Math.atan2(hutScreen.y - cy, hutScreen.x - cx);
      const r = Math.min(cx, cy) * 0.82;
      const mx = off ? cx + Math.cos(ang) * r : hutScreen.x;
      const my = off ? cy + Math.sin(ang) * r : hutScreen.y - 40;
      this.marker.style.transform = `translate(${mx}px, ${my}px) rotate(${off ? ang + Math.PI / 2 : Math.PI}rad)`;
    }

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
