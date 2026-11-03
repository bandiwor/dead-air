import type { NightDef } from './night';
import { NIGHT1 } from './night1';
import { NIGHT2 } from './night2';
import { NIGHT3A, NIGHT3B } from './night3';

/** Все ночи по порядку. Новая ночь = файл данных + строка здесь. */
export const NIGHTS: readonly NightDef[] = [NIGHT1, NIGHT2, NIGHT3A, NIGHT3B];

/** Ночи, которые видны в меню (части ночи — скрыты). */
export const MENU_NIGHTS: readonly NightDef[] = NIGHTS.filter((n) => !n.hidden);
