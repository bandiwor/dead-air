import { t, type StrKey } from '../i18n';
import { h, show } from './dom';

export type DbgItem =
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { kind: 'action'; label: string; run: () => void };

export interface DbgSection {
  title: StrKey;
  items: DbgItem[];
}

/**
 * Панель отладки (DOM): кнопки крупные — удобно пальцем на телефоне.
 * Оверлей статистики обновляется несколько раз в секунду, не каждый кадр.
 */
export class DebugPanel {
  readonly button: HTMLButtonElement;
  readonly stats: HTMLElement;
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly flags: HTMLElement;
  private sections: DbgSection[] = [];
  private refreshers: (() => void)[] = [];
  open = false;
  onToggle: (open: boolean) => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.button = h('button', 'dbg-btn hidden', 'DBG', parent);
    this.button.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.setOpen(!this.open);
    });
    this.stats = h('pre', 'dbg-stats hidden', '', parent);
    this.root = h('div', 'dbg-panel hidden', undefined, parent);
    this.root.dataset.scroll = '1';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    const head = h('div', 'dbg-head', undefined, this.root);
    h('div', 'dbg-title', t('dbg.title'), head);
    const close = h('button', 'dbg-close', t('dbg.close'), head);
    close.addEventListener('click', () => this.setOpen(false));
    this.body = h('div', 'dbg-body', undefined, this.root);
    this.flags = h('pre', 'dbg-flags', '', this.root);
  }

  setEnabled(on: boolean): void {
    show(this.button, on);
    if (!on) {
      this.setOpen(false);
      show(this.stats, false);
    }
  }

  setOpen(open: boolean): void {
    this.open = open;
    show(this.root, open);
    if (open) this.refresh();
    this.onToggle(open);
  }

  build(sections: DbgSection[]): void {
    this.sections = sections;
    this.body.textContent = '';
    this.refreshers = [];
    for (const sec of sections) {
      h('div', 'dbg-sec', t(sec.title), this.body);
      const grid = h('div', 'dbg-grid', undefined, this.body);
      for (const it of sec.items) {
        const b = h('button', 'dbg-item', it.label, grid);
        if (it.kind === 'toggle') {
          const upd = (): void => {
            b.classList.toggle('on', it.get());
            b.textContent = `${it.label}: ${it.get() ? t('dbg.on') : t('dbg.off')}`;
          };
          upd();
          this.refreshers.push(upd);
          b.addEventListener('click', () => {
            it.set(!it.get());
            upd();
          });
        } else {
          b.addEventListener('click', () => {
            it.run();
            this.refresh();
          });
        }
      }
    }
  }

  refresh(): void {
    for (const r of this.refreshers) r();
  }

  setFlags(text: string): void {
    if (this.open) this.flags.textContent = text;
  }

  get sectionCount(): number {
    return this.sections.length;
  }
}
