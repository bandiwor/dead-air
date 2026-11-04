import type { NightDef } from './night';
import { NIGHT1 } from './night1';
import { NIGHT2 } from './night2';
import { NIGHT3A, NIGHT3B } from './night3';
import { NIGHT4F, NIGHT4L, NIGHT4N } from './night4';

/** Все ночи по порядку. Новая ночь = файл данных + строка здесь. */
export const NIGHTS: readonly NightDef[] = [NIGHT1, NIGHT2, NIGHT3A, NIGHT3B, NIGHT4L, NIGHT4F, NIGHT4N];

/** Ночи, которые видны в меню (части ночи — скрыты). */
export const MENU_NIGHTS: readonly NightDef[] = NIGHTS.filter((n) => !n.hidden);

/** Ночь с развилкой → вариант по последней концовке (без развилки — сама ночь). */
export function resolveNight(index: number, lastEnding: string): number {
  const br = NIGHTS[index]?.branch;
  if (!br) return index;
  const id = br[lastEnding] ?? br['*'];
  const k = NIGHTS.findIndex((n) => n.id === id);
  return k >= 0 ? k : index;
}
