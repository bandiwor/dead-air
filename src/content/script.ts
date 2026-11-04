import type { StrKey } from '../i18n';

/**
 * Язык сценария: декларативные условия и эффекты. Контент описывает «что происходит»,
 * движок (narrative/script.ts) исполняет. Исполняемого кода в контенте нет.
 */

export type SpawnAt = 'doorOut' | 'inside' | 'pierWater' | 'behind' | 'crevice' | 'forest';
export type AppearAt = 'pier' | 'behind' | 'pole' | 'window' | 'water' | 'corner' | 'choir' | 'procession';
export type ScareId = 'jumpscare' | 'scratch' | 'duck' | 'knockBack' | 'turn' | 'names' | 'speaker' | 'wet';

export type Effect =
  | { line: StrKey; style?: number }
  | { note: StrKey }
  | { wait: number }
  | { openDoor: number }
  | { closeDoor: number }
  | { light: number; on: boolean }
  | { deadAir: true }
  | { spawn: 'whisperer' | 'mute' | 'unseeing'; count: number; at: SpawnAt; house?: number }
  | { appear: AppearAt; house?: number }
  | { despawnPier: true }
  | { enable: string }
  | { disable: string }
  | { unflag: string }
  | { letter: string }
  | { dawn: true }
  | { radio: number }
  | { scare: ScareId; house?: number }
  | { objective: StrKey | ''; marker?: { house?: number; pier?: boolean; at?: [number, number] } | null }
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
  /** Все флаги из списка. */
  flags?: string[];
  /** Игрок ближе r к точке (x, z). */
  near?: [number, number, number];
}

export interface Beat {
  id: string;
  when: Condition;
  do: Effect[];
}

/** Записка/улика внутри дома (локальные координаты дома). */
export interface NoteDef {
  id: string;
  key: StrKey;
  x: number;
  z: number;
  after?: Effect[];
}

/** Что происходит с домом в эту ночь: записки и ответ на стук/попытку открыть. */
export interface HouseScript {
  house: number;
  notes: NoteDef[];
  /** Пусто — дверь этим способом не открыть (откроет сценарий). */
  knock: Effect[];
}

export type Anchor = 'pierEnd' | 'pierStart' | 'hutSide' | 'hutDoorSide' | { house: number; x: number; z: number } | { x: number; z: number } | { door: number };

/** Особое действие ночи: рубильник, позвать с пристани, посмотреть в воду, взять лампу… */
export interface ExtraDef {
  id: string;
  prompt: StrKey;
  /** Нарушает Наказ (подсказка подсвечивается). */
  rule: boolean;
  at: Anchor;
  r: number;
  hold: number;
  enabled: boolean;
  once: boolean;
  /** Показывать искру-подсказку. */
  glint?: boolean;
  /** Видно и доступно только в отражении (когда смотришь в воду). */
  reflect?: boolean;
  effects: Effect[];
}

/** План кат-сцены. */
export interface Shot {
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo: [number, number, number];
  dur: number;
  fov?: number;
  line?: StrKey;
}
