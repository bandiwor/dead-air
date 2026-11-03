import { Game } from './game';
import { setLocale } from '../i18n';

/**
 * Тяжёлая часть игры (Three.js, рендер, симуляция, звук, тексты).
 * Загружается асинхронно из src/main.ts, пока на экране — индикатор загрузки.
 */
export function start(root: HTMLElement): Game {
  setLocale('ru');
  const game = new Game(root);
  // ?debug — доступ к состоянию из консоли/автотестов (только чтение по договорённости)
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Game }).__game = game;
  return game;
}
