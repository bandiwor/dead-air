import { t, type StrKey } from '../i18n';
import type { Settings } from '../platform/storage';
import { h, show } from './dom';
import { ACHIEVEMENTS, RARITY_ORDER } from '../content/achievements';
import { iconSvg } from './icons';

export interface ScreenHandlers {
  onTap: () => void;
  onAcceptDisclaimer: () => void;
  onStart: (night: number) => void;
  onNext: () => void;
  onResume: () => void;
  onRetry: () => void;
  onToTitle: () => void;
  onSettingsChange: (s: Settings) => void;
  onClick: () => void;
  /** Строка «Обновления» в настройках: проверить или применить. */
  onUpdateRow: () => void;
  onUpdateApply: () => void;
}

type ScreenId = 'boot' | 'disclaimer' | 'loading' | 'title' | 'settings' | 'pause' | 'dead' | 'dawn' | 'achievements' | 'none';

/** Экраны-меню в стиле терминала: моно-шрифт, жёсткие рамки, никаких градиентов. */
export class Screens {
  private readonly root: HTMLElement;
  private readonly screens = new Map<ScreenId, HTMLElement>();
  private readonly loadingText: HTMLElement;
  private readonly loadingBar: HTMLElement;
  private readonly journal: HTMLElement;
  private readonly dawnStats: HTMLElement;
  private readonly dawnTitle: HTMLElement;
  private readonly dawnSub: HTMLElement;
  private readonly dawnNext: HTMLButtonElement;
  private readonly nightMenu: HTMLElement;
  private readonly noteModal: HTMLElement;
  private readonly beast: HTMLElement;
  private beastTimer = 0;
  private readonly noteText: HTMLElement;
  private onNoteClose: () => void = () => undefined;
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
    // «отпускание» пальца — жест, на который браузер разрешает полноэкранный режим и звук
    boot.addEventListener('click', () => handlers.onTap());

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
    this.nightMenu = h('div', 'menu nights', undefined, menu);
    this.button(menu, 'ui.achievements', () => this.open('achievements'));
    this.button(menu, 'ui.settings', () => this.openSettings('title'));
    h('div', 'small foot', t('ui.credits'), title);

    this.screen('settings');
    this.screen('achievements');
    this.buildSettings();

    const pause = this.screen('pause');
    h('div', 'logo small-logo', t('ui.paused'), pause);
    const pcol = h('div', 'pause-cols', undefined, pause);
    const pm = h('div', 'menu', undefined, pcol);
    this.button(pm, 'ui.resume', () => handlers.onResume());
    this.button(pm, 'ui.settings', () => this.openSettings('pause'));
    this.button(pm, 'ui.toTitle', () => handlers.onToTitle());
    this.journal = h('div', 'panel rules journal', undefined, pcol);
    this.journal.dataset.scroll = '1';

    const dead = this.screen('dead');
    h('div', 'logo red', t('death.title'), dead);
    h('div', 'sub', t('death.sub'), dead);
    const dm = h('div', 'menu', undefined, dead);
    this.button(dm, 'ui.retry', () => handlers.onRetry());
    this.button(dm, 'ui.toTitle', () => handlers.onToTitle());

    const dawn = this.screen('dawn');
    this.dawnTitle = h('div', 'logo', t('dawn.title'), dawn);
    this.dawnSub = h('div', 'sub', t('dawn.sub'), dawn);
    this.dawnStats = h('div', 'small', '', dawn);
    const dwm = h('div', 'menu', undefined, dawn);
    this.dawnNext = this.button(dwm, 'ui.next', () => handlers.onNext());
    this.button(dwm, 'ui.retry', () => handlers.onRetry());
    this.button(dwm, 'ui.toTitle', () => handlers.onToTitle());

    // записка: игра стоит, пока её читают
    this.noteModal = h('div', 'note-modal hidden', undefined, parent);
    const paper = h('div', 'note-paper', undefined, this.noteModal);
    paper.dataset.scroll = '1';
    this.noteText = h('div', 'note-text', '', paper);
    this.button(paper, 'ui.close', () => {
      show(this.noteModal, false);
      this.onNoteClose();
    });

    // карточка бестиария (справа от витрины существа)
    this.beast = h('div', 'beast hidden', undefined, parent);

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

  /** Стоп-кадр: имя, описание и совет печатаются, как на машинке. */
  showBeast(name: string, desc: string, tip: string, onClose: () => void): void {
    const el = this.beast;
    el.textContent = '';
    const card = h('div', 'beast-card', undefined, el);
    h('div', 'beast-tag', t('ui.new'), card);
    const nm = h('div', 'beast-name', '', card);
    const ds = h('div', 'beast-desc', '', card);
    const tp = h('div', 'beast-tip', '', card);
    const hint = h('div', 'beast-hint', t('ui.continue'), card);
    hint.style.opacity = '0';
    show(el, true);
    const parts: [HTMLElement, string][] = [[nm, name], [ds, desc], [tp, tip]];
    let pi = 0;
    let ci = 0;
    clearInterval(this.beastTimer);
    const started = performance.now();
    this.beastTimer = window.setInterval(() => {
      const part = parts[pi];
      if (!part) {
        clearInterval(this.beastTimer);
        hint.style.opacity = '1';
        return;
      }
      ci += pi === 0 ? 1 : 3;
      part[0].textContent = part[1].slice(0, ci);
      if (ci >= part[1].length) {
        pi++;
        ci = 0;
      }
    }, 28);
    const close = (e: Event): void => {
      e.stopPropagation();
      // не даём пролистнуть случайным касанием в первые полторы секунды
      if (performance.now() - started < 1500) return;
      clearInterval(this.beastTimer);
      el.removeEventListener('pointerdown', close);
      show(el, false);
      onClose();
    };
    el.addEventListener('pointerdown', close);
  }

  /** Список достижений: иконка и название окрашены по редкости, закрытые — тусклые. */
  setAchievements(unlocked: readonly string[]): void {
    const el = this.screens.get('achievements')!;
    el.textContent = '';
    const box = h('div', 'panel ach-list', undefined, el);
    box.dataset.scroll = '1';
    h('div', 'panel-title', t('ui.achievements'), box);
    h('div', 'small', t('ach.count', { n: unlocked.length, total: ACHIEVEMENTS.length }), box);
    const sorted = [...ACHIEVEMENTS].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    for (const a of sorted) {
      const got = unlocked.includes(a.id);
      const row = h('div', `ach-row r-${a.rarity}${got ? '' : ' locked'}`, undefined, box);
      const ic = h('div', 'ach-icon', undefined, row);
      ic.appendChild(iconSvg(a.icon));
      const txt = h('div', 'ach-text', undefined, row);
      h('div', 'ach-name', got || !a.secret ? t(a.name) : '???', txt);
      h('div', 'ach-desc', got || !a.secret ? t(a.desc) : t('ach.secret'), txt);
      h('div', 'ach-rarity', t(`rarity.${a.rarity}` as StrKey), row);
    }
    this.button(box, 'ui.back', () => this.open('title'));
  }

  showNote(text: string, onClose: () => void): void {
    this.noteText.textContent = text;
    this.onNoteClose = onClose;
    show(this.noteModal, true);
  }

  setDawn(title: StrKey, sub: StrKey, stats: string, hasNext: boolean): void {
    this.dawnTitle.textContent = t(title);
    this.dawnSub.textContent = t(sub);
    this.dawnStats.textContent = stats;
    show(this.dawnNext, hasNext);
  }

  /** Список ночей на титуле: открытые — кнопки, закрытые — подпись. */
  setNights(titles: readonly StrKey[], unlocked: number): void {
    this.nightMenu.textContent = '';
    titles.forEach((key, i) => {
      if (i < unlocked) this.button(this.nightMenu, key, () => this.h.onStart(i));
      else {
        const b = h('div', 'mbtn locked', undefined, this.nightMenu);
        h('div', '', t(key), b);
        h('div', 'small', t('night.locked'), b);
      }
    });
  }

  /** Журнал в паузе: Наказ (нарушенные зачёркнуты), прочитанное, услышанное в тишине. */
  setJournal(rules: readonly { key: StrKey; broken: boolean }[], notes: readonly StrKey[], heard: readonly StrKey[]): void {
    const j = this.journal;
    j.textContent = '';
    h('div', 'panel-title', t('ui.rules'), j);
    const ol = h('ol', 'rules-list', undefined, j);
    for (const r of rules) {
      const li = h('li', r.broken ? 'broken' : '', t(r.key), ol);
      if (r.broken) li.dataset.tag = t('ui.broken');
    }
    h('h4', '', t('ui.notes'), j);
    if (notes.length === 0) h('div', 'small', t('ui.nothing'), j);
    for (const n of notes) h('p', 'jnote', t(n), j);
    h('h4', '', `${t('ui.heard')} · ${heard.length}/10`, j);
    if (heard.length === 0) h('div', 'small', t('ui.nothing'), j);
    for (const f of heard) h('div', 'frag', t(f), j);
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
    row('settings.debug', onoff(s.debug), () => (s.debug = !s.debug));
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
