import { t, type StrKey } from '../i18n';
import type { Settings } from '../platform/storage';
import { h, show } from './dom';

export interface ScreenHandlers {
  onTap: () => void;
  onAcceptDisclaimer: () => void;
  onStart: () => void;
  onResume: () => void;
  onRetry: () => void;
  onToTitle: () => void;
  onSettingsChange: (s: Settings) => void;
  onClick: () => void;
  /** Строка «Обновления» в настройках: проверить или применить. */
  onUpdateRow: () => void;
  onUpdateApply: () => void;
}

type ScreenId = 'boot' | 'disclaimer' | 'loading' | 'title' | 'settings' | 'pause' | 'dead' | 'dawn' | 'none';

/** Экраны-меню в стиле терминала: моно-шрифт, жёсткие рамки, никаких градиентов. */
export class Screens {
  private readonly root: HTMLElement;
  private readonly screens = new Map<ScreenId, HTMLElement>();
  private readonly loadingText: HTMLElement;
  private readonly loadingBar: HTMLElement;
  private readonly rulesList: HTMLElement;
  private settingsBack: ScreenId = 'title';
  private settings: Settings;
  private readonly h: ScreenHandlers;
  readonly letterbox: HTMLElement;
  readonly skipHint: HTMLElement;
  private readonly updateModal: HTMLElement;
  private updateText = '';
  private versionLabel = '';
  current: ScreenId = 'none';

  constructor(parent: HTMLElement, settings: Settings, handlers: ScreenHandlers) {
    this.root = h('div', 'screens', undefined, parent);
    this.settings = { ...settings };
    this.h = handlers;

    this.letterbox = h('div', 'letterbox', undefined, parent);
    h('div', 'lb-top', undefined, this.letterbox);
    h('div', 'lb-bottom', undefined, this.letterbox);
    this.skipHint = h('div', 'skip-hint hidden', t('ui.skip'), parent);

    // загрузочный экран-заставка: нужен жест пользователя для звука и полноэкранного режима
    const boot = this.screen('boot');
    h('div', 'logo', t('ui.title'), boot);
    h('div', 'sub', t('ui.subtitle'), boot);
    h('div', 'blink', t('ui.tap'), boot);
    h('div', 'small', t('ui.headphones'), boot);
    boot.addEventListener('pointerdown', () => handlers.onTap());

    const disc = this.screen('disclaimer');
    const box = h('div', 'panel', undefined, disc);
    h('div', 'panel-title', t('ui.disclaimer.title'), box);
    h('p', 'panel-text', t('ui.disclaimer.body'), box);
    this.button(box, 'ui.disclaimer.accept', () => handlers.onAcceptDisclaimer());

    const load = this.screen('loading');
    h('div', 'logo', t('ui.title'), load);
    this.loadingText = h('div', 'sub', t('ui.loading'), load);
    const lb = h('div', 'bar bar-load', undefined, load);
    this.loadingBar = h('div', 'bar-fill', undefined, lb);

    const title = this.screen('title');
    h('div', 'logo', t('ui.title'), title);
    h('div', 'sub', t('ui.subtitle'), title);
    const menu = h('div', 'menu', undefined, title);
    this.button(menu, 'ui.start', () => handlers.onStart());
    this.button(menu, 'ui.settings', () => this.openSettings('title'));
    h('div', 'small foot', t('ui.credits'), title);

    this.screen('settings');
    this.buildSettings();

    const pause = this.screen('pause');
    h('div', 'logo small-logo', t('ui.paused'), pause);
    const pcol = h('div', 'pause-cols', undefined, pause);
    const pm = h('div', 'menu', undefined, pcol);
    this.button(pm, 'ui.resume', () => handlers.onResume());
    this.button(pm, 'ui.settings', () => this.openSettings('pause'));
    this.button(pm, 'ui.toTitle', () => handlers.onToTitle());
    const rules = h('div', 'panel rules', undefined, pcol);
    rules.dataset.scroll = '1';
    h('div', 'panel-title', t('ui.rules'), rules);
    this.rulesList = h('ol', 'rules-list', undefined, rules);

    const dead = this.screen('dead');
    h('div', 'logo red', t('death.title'), dead);
    h('div', 'sub', t('death.sub'), dead);
    const dm = h('div', 'menu', undefined, dead);
    this.button(dm, 'ui.retry', () => handlers.onRetry());
    this.button(dm, 'ui.toTitle', () => handlers.onToTitle());

    const dawn = this.screen('dawn');
    h('div', 'logo', t('dawn.title'), dawn);
    h('div', 'sub', t('dawn.sub'), dawn);
    const dwm = h('div', 'menu', undefined, dawn);
    this.button(dwm, 'ui.retry', () => handlers.onRetry());
    this.button(dwm, 'ui.toTitle', () => handlers.onToTitle());

    // окно «доступно обновление» — поверх меню, не поверх игры
    this.updateModal = h('div', 'update-modal hidden', undefined, parent);
    const up = h('div', 'panel', undefined, this.updateModal);
    h('div', 'panel-title', t('update.title'), up);
    h('p', 'panel-text', t('update.body'), up);
    const um = h('div', 'menu row', undefined, up);
    this.button(um, 'update.apply', () => handlers.onUpdateApply());
    this.button(um, 'update.later', () => show(this.updateModal, false));

    h('div', 'rotate', t('ui.rotate'), parent);
  }

  showUpdatePrompt(on: boolean): void {
    show(this.updateModal, on);
  }

  /** Статус обновления для строки в настройках. */
  setUpdateStatus(text: string, version: string): void {
    this.updateText = text;
    this.versionLabel = version;
    if (this.current === 'settings') this.buildSettings();
  }

  private screen(id: ScreenId): HTMLElement {
    const el = h('div', `screen screen-${id} hidden`, undefined, this.root);
    this.screens.set(id, el);
    return el;
  }

  private button(parent: HTMLElement, key: StrKey, fn: () => void): HTMLButtonElement {
    const b = h('button', 'mbtn', t(key), parent);
    b.addEventListener('click', () => {
      this.h.onClick();
      fn();
    });
    return b;
  }

  open(id: ScreenId): void {
    this.current = id;
    for (const [k, el] of this.screens) show(el, k === id);
  }

  setLoading(stage: StrKey, frac: number): void {
    this.loadingText.textContent = `${t('ui.loading')} · ${t(stage)}`;
    this.loadingBar.style.transform = `scaleX(${frac.toFixed(3)})`;
  }

  setRules(keys: readonly StrKey[]): void {
    this.rulesList.textContent = '';
    for (const k of keys) h('li', '', t(k), this.rulesList);
  }

  private openSettings(back: ScreenId): void {
    this.settingsBack = back;
    this.buildSettings();
    this.open('settings');
  }

  private buildSettings(): void {
    const el = this.screens.get('settings')!;
    el.textContent = '';
    const box = h('div', 'panel settings', undefined, el);
    box.dataset.scroll = '1';
    h('div', 'panel-title', t('ui.settings'), box);
    const s = this.settings;
    const commit = (): void => {
      this.h.onSettingsChange({ ...s });
      this.buildSettings();
    };
    const row = (label: StrKey, value: string, fn: () => void): void => {
      const r = h('button', 'setting', undefined, box);
      h('span', '', t(label), r);
      h('span', 'val', value, r);
      r.addEventListener('click', () => {
        this.h.onClick();
        fn();
        commit();
      });
    };
    const onoff = (v: boolean): string => (v ? t('settings.on') : t('settings.off'));
    const steps = [0, 0.25, 0.5, 0.8, 1];
    row('settings.scare', `${Math.round(s.scare * 100)}%`, () => {
      const i = steps.findIndex((x) => x >= s.scare - 0.01);
      s.scare = steps[(i + 1) % steps.length]!;
    });
    row('settings.flashes', onoff(s.reduceFlashes), () => (s.reduceFlashes = !s.reduceFlashes));
    row('settings.vibration', onoff(s.vibration), () => (s.vibration = !s.vibration));
    row('settings.autofire', onoff(s.autofire), () => (s.autofire = !s.autofire));
    row('settings.quality', t(`settings.quality.${s.quality}` as StrKey), () => (s.quality = (s.quality + 1) % 3));
    row('settings.volume', `${Math.round(s.volume * 100)}%`, () => (s.volume = s.volume >= 1 ? 0 : Math.round((s.volume + 0.2) * 10) / 10));
    const upd = h('button', 'setting', undefined, box);
    h('span', '', t('settings.updates'), upd);
    h('span', 'val', this.updateText, upd);
    upd.addEventListener('click', () => {
      this.h.onClick();
      this.h.onUpdateRow();
    });
    h('div', 'small version', this.versionLabel, box);
    this.button(box, 'ui.back', () => this.open(this.settingsBack));
  }

  updateSettings(s: Settings): void {
    this.settings = { ...s };
  }
}
