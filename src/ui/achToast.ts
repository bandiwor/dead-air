import { t } from '../i18n';
import type { AchievementDef } from '../content/achievements';
import { h } from './dom';
import { iconSvg } from './icons';

/** Всплывающее «Достижение»: очередь, по одному, сверху по центру, не мешает игре. */
export class AchToast {
  private readonly root: HTMLElement;
  private readonly queue: AchievementDef[] = [];
  private busy = false;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'ach-toast', undefined, parent);
  }

  push(a: AchievementDef): void {
    this.queue.push(a);
    if (!this.busy) this.next();
  }

  private next(): void {
    const a = this.queue.shift();
    if (!a) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.root.textContent = '';
    this.root.className = `ach-toast r-${a.rarity}`;
    const ic = h('div', 'ach-icon', undefined, this.root);
    ic.appendChild(iconSvg(a.icon, 30));
    const txt = h('div', 'ach-text', undefined, this.root);
    h('div', 'ach-tag', t('ach.unlocked'), txt);
    h('div', 'ach-name', t(a.name), txt);
    requestAnimationFrame(() => this.root.classList.add('on'));
    setTimeout(() => this.root.classList.remove('on'), 3200);
    setTimeout(() => this.next(), 3700);
  }
}
