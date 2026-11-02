import type { NightDef } from './night';
import { NIGHT1 } from './night1';
import { NIGHT2 } from './night2';

/** Все ночи по порядку. Новая ночь = файл данных + строка здесь. */
export const NIGHTS: readonly NightDef[] = [NIGHT1, NIGHT2];
