import { t, type StrKey } from '../i18n';
import type { IconPart } from '../content/achievements';
import type { InstallMode } from '../platform/install';
import { h, show } from './dom';
import { iconSvg } from './icons';

/** Иконка: телефон боком, в нём радиомачта, стрелка «на экран». */
const ICON: IconPart[] = [
  { r: [3, 6, 18, 12] },
  { l: [12, 9, 12, 15] },
  { p: 'M12 9 L15 8 L15 11 L12 10.5' },
  { l: [6, 15, 18, 15] },
  { p: 'M19 2 V5 M17.5 3.5 L19 5 L20.5 3.5' },
];

export interface InstallHandlers {
  onInstall: () => void;
  onLater: () => void;
  onNever: () => void;
  onClick: () => void;
}

/**
 * Карточка «Установить игру»: выезжает сверху (поверх логотипа), кнопки меню остаются доступны.
 * На iPhone вместо кнопки — инструкция (у Safari нет системного диалога установки).
 */
export class InstallCard {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly installBtn: HTMLButtonElement;
  private readonly laterBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, hd: InstallHandlers) {
    this.root = h('div', 'install-card hidden', undefined, parent);
    this.root.setAttribute('role', 'dialog');
    const ic = h('div', 'install-icon', undefined, this.root);
    ic.appendChild(iconSvg(ICON, 34));
    const txt = h('div', 'install-text', undefined, this.root);
    h('div', 'install-title', t('install.title'), txt);
    this.body = h('div', 'install-body', '', txt);
    const btns = h('div', 'install-btns', undefined, this.root);
    const mk = (key: StrKey, cls: string, fn: () => void): HTMLButtonElement => {
      const b = h('button', `ibtn ${cls}`, t(key), btns);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hd.onClick();
        fn();
      });
      return b;
    };
    this.installBtn = mk('install.do', 'primary', () => hd.onInstall());
    this.laterBtn = mk('install.later', '', () => hd.onLater());
    mk('install.never', 'faint', () => hd.onNever());
  }

  open(mode: InstallMode): void {
    if (mode === 'none') return;
    const ios = mode === 'ios';
    this.body.textContent = t(ios ? 'install.ios' : 'install.body');
    show(this.installBtn, !ios);
    this.laterBtn.textContent = t(ios ? 'install.ok' : 'install.later');
    show(this.root, true);
    requestAnimationFrame(() => this.root.classList.add('on'));
  }

  close(): void {
    this.root.classList.remove('on');
    setTimeout(() => {
      if (!this.root.classList.contains('on')) show(this.root, false);
    }, 320);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('on');
  }
}
