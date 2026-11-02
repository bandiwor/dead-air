/**
 * Каталог «битов страха» для Режиссёра. Данные, не код.
 * weight — базовый вес; fatigue — насколько быстро тип надоедает (привыкание);
 * lull — множитель веса в затишье (страх ожидания важнее страха события).
 */
export type ScareKind =
  | 'whisper' | 'branch' | 'silence' | 'pier' | 'edge' | 'window'
  | 'speaker' | 'steps' | 'jumpscare' | 'fake';

export interface ScareDef {
  id: ScareKind;
  weight: number;
  cooldown: number;
  fatigue: number;
  minT: number;
  maxSanity: number;
  lull: number;
  /** Минимальная настройка «силы страха», при которой бит разрешён. */
  minSetting: number;
  /** Пустая тревога: ничего не нападает. */
  falseAlarm: boolean;
}

export const SCARES: readonly ScareDef[] = [
  { id: 'whisper', weight: 3, cooldown: 22, fatigue: 0.35, minT: 15, maxSanity: 100, lull: 1.4, minSetting: 0, falseAlarm: true },
  { id: 'branch', weight: 3, cooldown: 14, fatigue: 0.3, minT: 10, maxSanity: 100, lull: 1.6, minSetting: 0, falseAlarm: true },
  { id: 'silence', weight: 1.6, cooldown: 70, fatigue: 0.6, minT: 40, maxSanity: 100, lull: 2, minSetting: 0, falseAlarm: true },
  { id: 'steps', weight: 2, cooldown: 40, fatigue: 0.5, minT: 50, maxSanity: 90, lull: 1.8, minSetting: 0, falseAlarm: true },
  { id: 'window', weight: 2, cooldown: 35, fatigue: 0.4, minT: 30, maxSanity: 100, lull: 1.5, minSetting: 0, falseAlarm: true },
  { id: 'pier', weight: 2.2, cooldown: 75, fatigue: 0.5, minT: 70, maxSanity: 100, lull: 1.8, minSetting: 0, falseAlarm: true },
  { id: 'edge', weight: 2, cooldown: 45, fatigue: 0.45, minT: 110, maxSanity: 85, lull: 1.3, minSetting: 0.15, falseAlarm: true },
  { id: 'speaker', weight: 1.4, cooldown: 85, fatigue: 0.4, minT: 95, maxSanity: 100, lull: 1.6, minSetting: 0, falseAlarm: true },
  { id: 'fake', weight: 2.5, cooldown: 18, fatigue: 0.15, minT: 60, maxSanity: 45, lull: 0.9, minSetting: 0.1, falseAlarm: true },
  { id: 'jumpscare', weight: 2, cooldown: 140, fatigue: 1, minT: 120, maxSanity: 75, lull: 1.6, minSetting: 0.25, falseAlarm: false },
];
