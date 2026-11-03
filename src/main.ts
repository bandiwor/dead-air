import './style.css';
import { Game } from './app/game';
import { installFullscreenKeeper, installGestureGuards, registerServiceWorker } from './platform/native';
import { setLocale } from './i18n';

setLocale('ru');
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

const probe = document.createElement('canvas').getContext('webgl2');
if (!probe) {
  fatal('Нужен браузер с поддержкой WebGL 2.');
} else {
  try {
    const game = new Game(root);
    // ?debug — доступ к состоянию из консоли/автотестов (только чтение по договорённости)
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Game }).__game = game;
  } catch (e) {
    fatal(`Ошибка запуска: ${(e as Error).message}`);
  }
}
window.addEventListener('error', (e) => console.error(e.error ?? e.message));
