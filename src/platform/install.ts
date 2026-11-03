/**
 * Установка как приложения (PWA).
 *
 * Chrome/Edge/Samsung присылают `beforeinstallprompt` — мы его придерживаем и показываем
 * своё окошко в меню, а системный диалог вызываем по кнопке. На iPhone/iPad такого события нет:
 * там показываем подсказку «Поделиться → На экран „Домой“».
 * Решение игрока («позже», «не предлагать») хранится локально с проверкой схемы.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'none' | 'prompt' | 'ios';

const KEY = 'dead-air:install';
const SNOOZE_MS = 3 * 24 * 3600 * 1000;

export interface InstallState {
  /** До какого момента не предлагать (мс с эпохи). */
  until: number;
  never: boolean;
}

export function parseInstallState(raw: string | null): InstallState {
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    const until = typeof o.until === 'number' && Number.isFinite(o.until) && o.until >= 0 ? o.until : 0;
    return { until, never: o.never === true };
  } catch {
    return { until: 0, never: false };
  }
}

/**
 * Запущена ли игра как установленное приложение. Проверять до первого requestFullscreen:
 * в обычной вкладке в полноэкранном режиме `display-mode: fullscreen` тоже совпадает.
 */
export function isStandalone(): boolean {
  const mm = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;
  const apiFullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
  return mm('(display-mode: standalone)') || (mm('(display-mode: fullscreen)') && !apiFullscreen) || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** iOS/iPadOS Safari: установка только вручную через «Поделиться». */
export function isIosSafari(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
  return ios && !otherBrowser && /Safari/.test(ua);
}

export class Installer {
  private deferred: InstallPromptEvent | null = null;
  private state: InstallState;
  /** Запомнено при старте: потом вкладка может уйти в полноэкранный режим. */
  private readonly installed = isStandalone();
  /** Вызывается, когда установка стала доступна или перестала быть доступной. */
  onChange: () => void = () => undefined;

  constructor() {
    this.state = parseInstallState(this.read());
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as InstallPromptEvent;
      this.onChange();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.state.never = true;
      this.save();
      this.onChange();
    });
  }

  /** Что можно предложить на этом устройстве прямо сейчас (без учёта «позже»). */
  get mode(): InstallMode {
    if (this.installed) return 'none';
    if (this.deferred) return 'prompt';
    if (isIosSafari()) return 'ios';
    return 'none';
  }

  /** Показывать ли всплывающее предложение сейчас. */
  shouldOffer(now = Date.now()): boolean {
    return this.mode !== 'none' && !this.state.never && now >= this.state.until;
  }

  /** Системный диалог установки. true — игрок согласился. */
  async install(): Promise<boolean> {
    const ev = this.deferred;
    if (!ev) return false;
    this.deferred = null;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === 'accepted') {
        this.state.never = true;
        this.save();
        return true;
      }
      this.snooze();
      return false;
    } finally {
      this.onChange();
    }
  }

  snooze(now = Date.now()): void {
    this.state.until = now + SNOOZE_MS;
    this.save();
  }

  never(): void {
    this.state.never = true;
    this.save();
  }

  private read(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* приватный режим — просто не запоминаем */
    }
  }
}
