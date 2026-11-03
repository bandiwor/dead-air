import { t } from '../i18n';
import type { ItemDef } from '../content/items';
import { h } from './dom';
import { iconSvg } from './icons';

/**
 * Маленькая карточка находки снизу по центру: иконка, название, сколько досталось.
 * Подряд идущие находки не копятся в очередь — новая сразу сменяет старую.
 */
export class PickupCard {
  private readonly root: HTMLElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'pickup-card', undefined, parent);
  }

  show(item: ItemDef, amount: number): void {
    const el = this.root;
    el.textContent = '';
    const ic = h('div', 'pickup-icon', undefined, el);
    ic.appendChild(iconSvg(item.icon, 28));
    const txt = h('div', 'pickup-text', undefined, el);
    h('div', 'pickup-name', t(item.name), txt);
    if (amount > 0) h('div', 'pickup-count', t(item.count, { n: amount }), txt);
    el.classList.remove('on');
    void el.offsetWidth; // перезапуск анимации
    el.classList.add('on');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => el.classList.remove('on'), 2200);
  }
}
