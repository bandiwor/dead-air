/**
 * Проверка обновлений для статической сборки (GitHub Pages).
 * При сборке рядом с игрой кладётся version.json с id сборки (SHA коммита).
 * Игра периодически запрашивает его мимо кэша; если id другой — вышла новая версия.
 * Обновление: сбросить кэши Service Worker и перезагрузить страницу.
 */
export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'offline' | 'dev';

interface VersionInfo {
  id: string;
  version: string;
}

const POLL_MS = 5 * 60 * 1000;

export class Updater {
  readonly currentId = __BUILD_ID__;
  readonly currentVersion = __APP_VERSION__;
  status: UpdateStatus = import.meta.env.PROD ? 'idle' : 'dev';
  latest: VersionInfo | null = null;
  onChange: (s: UpdateStatus) => void = () => undefined;
  private timer = 0;

  start(): void {
    if (!import.meta.env.PROD) return;
    void this.check();
    this.timer = window.setInterval(() => void this.check(), POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    window.addEventListener('online', () => void this.check());
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async check(): Promise<UpdateStatus> {
    if (!import.meta.env.PROD) return this.set('dev');
    if (this.status === 'available') return this.status;
    this.set('checking');
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as unknown;
      if (!isVersion(data)) throw new Error('bad version.json');
      this.latest = data;
      return this.set(data.id !== this.currentId ? 'available' : 'latest');
    } catch {
      return this.set('offline');
    }
  }

  /** Сбрасывает кэши и перезагружает страницу на новую версию. */
  async apply(): Promise<void> {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('dead-air')).map((k) => caches.delete(k)));
      const reg = await navigator.serviceWorker?.getRegistration();
      // не ждём дольше секунды — навигация всё равно пойдёт в сеть (network-first)
      await Promise.race([reg?.update(), new Promise((r) => setTimeout(r, 1000))]);
    } catch {
      /* перезагрузка всё равно возьмёт свежую страницу из сети */
    }
    const url = new URL(location.href);
    url.searchParams.set('v', this.latest?.id ?? String(Date.now()));
    location.replace(url.toString());
  }

  get label(): string {
    return `v${this.currentVersion} · ${this.currentId.slice(0, 7)}`;
  }

  private set(s: UpdateStatus): UpdateStatus {
    this.status = s;
    this.onChange(s);
    return s;
  }
}

function isVersion(v: unknown): v is VersionInfo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0 && o.id.length < 64 && typeof o.version === 'string';
}
