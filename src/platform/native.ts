/**
 * «Нативность» в браузере: полноэкранный режим, блокировка ландшафта, экран не гаснет,
 * вибрация, запрет системных жестов (масштаб, pull-to-refresh, выделение, контекстное меню),
 * пауза при сворачивании.
 */
type WakeLock = { release: () => Promise<void> };
let wakeLock: WakeLock | null = null;
let vibrationEnabled = true;

export function setVibration(on: boolean): void {
  vibrationEnabled = on;
}

export function vibrate(pattern: number | number[]): void {
  if (!vibrationEnabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS: нет API — компенсируем визуально */
  }
}

export const isTouch = (): boolean => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const isStandalone = (): boolean =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function enterImmersive(): Promise<void> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement && isTouch() && !isStandalone()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    }
  } catch {
    /* не все браузеры разрешают */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* iOS Safari: блокировки нет — показываем «поверните устройство» */
  }
  await keepAwake();
}

async function keepAwake(): Promise<void> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock;
    if (wl && !wakeLock) {
      wakeLock = await wl.request('screen');
    }
  } catch {
    /* нет разрешения — не критично */
  }
}

export function installGestureGuards(): void {
  const stop = (e: Event): void => e.preventDefault();
  document.addEventListener('contextmenu', stop);
  document.addEventListener('gesturestart', stop as EventListener, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('selectstart', stop);
  document.addEventListener(
    'touchmove',
    (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-scroll]')) return;
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      wakeLock = null;
      void keepAwake();
    }
  });
}

export function onHidden(cb: () => void, onShown: () => void): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cb();
    else onShown();
  });
  window.addEventListener('pagehide', cb);
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
