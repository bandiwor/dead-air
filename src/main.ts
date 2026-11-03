import './style.css';
import { installFullscreenKeeper, installGestureGuards, registerServiceWorker } from './platform/native';
import { prefetchChunks } from './boot/loader';

/*
 * Точка входа — намеренно крошечная: стили, нативные мелочи и загрузчик.
 * Всё тяжёлое (Three.js и сама игра) приходит отдельными файлами, пока на экране — проценты.
 */
installGestureGuards();
installFullscreenKeeper();
registerServiceWorker();

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

function fatal(msg: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = msg;
  document.body.appendChild(el);
}

function loaderScreen(parent: HTMLElement): { set: (loaded: number, total: number) => void; remove: () => void } {
  const el = document.createElement('div');
  el.className = 'screen screen-loading boot-loader';
  const mk = (cls: string, text = ''): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  };
  const title = mk('logo', 'МЁРТВЫЙ ЭФИР');
  const sub = mk('sub', 'загрузка…');
  const bar = mk('bar bar-load');
  const fill = mk('bar-fill');
  bar.appendChild(fill);
  el.append(title, sub, bar);
  parent.appendChild(el);
  return {
    set(loaded, total) {
      const k = total > 0 ? loaded / total : 0;
      sub.textContent = `загрузка ${Math.round(k * 100)}% (${Math.round(loaded / 1024)}/${Math.round(total / 1024)} KB)`;
      fill.style.transform = `scaleX(${k.toFixed(3)})`;
    },
    remove() {
      el.remove();
    },
  };
}

async function boot(host: HTMLElement): Promise<void> {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    fatal('Нужен браузер с поддержкой WebGL 2.');
    return;
  }
  const ui = loaderScreen(host);
  try {
    await prefetchChunks((p) => ui.set(p.loaded, p.total));
    const { start } = await import('./app/start');
    ui.remove();
    start(host);
  } catch (e) {
    ui.remove();
    fatal(`Ошибка запуска: ${(e as Error).message}`);
  }
}

void boot(root);
window.addEventListener('error', (e) => console.error(e.error ?? e.message));
