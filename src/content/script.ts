import type { StrKey } from '../i18n';

/**
 * Язык сценария: декларативные условия и эффекты. Контент описывает «что происходит»,
 * движок (narrative/script.ts) исполняет. Исполняемого кода в контенте нет.
 */

export type SpawnAt = 'doorOut' | 'inside' | 'pierWater' | 'behind' | 'crevice' | 'forest';
export type AppearAt = 'pier' | 'behind' | 'pole' | 'window';
export type ScareId = 'jumpscare' | 'scratch' | 'duck' | 'knockBack' | 'turn' | 'names';

export type Effect =
  | { line: StrKey; style?: number }
  | { note: StrKey }
  | { wait: number }
  | { openDoor: number }
  | { closeDoor: number }
  | { light: number; on: boolean }
  | { deadAir: true }
  | { spawn: 'whisperer' | 'mute'; count: number; at: SpawnAt; house?: number }
  | { appear: AppearAt; house?: number }
  | { despawnPier: true }
  | { scare: ScareId; house?: number }
  | { objective: StrKey | ''; marker?: { house?: number; pier?: boolean } | null }
  | { flag: string }
  | { sanity: number }
  | { fragment: true }
  | { drop: 'weapon' | 'ammo' | 'med' | 'dynamite'; weapon?: string; house: number; inside: boolean };

/** Все указанные поля должны выполняться одновременно. */
export interface Condition {
  t?: number;
  flag?: string;
  notFlag?: string;
  sanityBelow?: number;
}

export interface Beat {
  id: string;
  when: Condition;
  do: Effect[];
}
