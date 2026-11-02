import type { StrKey } from '../i18n';
import type { KindId } from './enemies';
import type { Beat, Effect, ExtraDef, HouseScript, Shot } from './script';

export type SpawnFrom = 'crevice' | 'pond' | 'forest' | 'behind';

export interface WaveDef {
  at: number;
  spawns: { kind: KindId; count: number; from: SpawnFrom }[];
  pulse: number;
  startLine?: StrKey;
  endLine?: StrKey;
  reward?: { weapon?: string; house: number };
}

/** Ночь целиком — данные: волны, сценарий, дома, особые действия, кат-сцены, Наказ. */
export interface NightDef {
  id: string;
  index: number;
  titleKey: StrKey;
  duration: number;
  startHour: number;
  endHour: number;
  reelSeconds: number;
  /** Густота тумана (по умолчанию 0.03). */
  fog: number;
  /** Свет в окнах в начале ночи (по индексу дома). */
  lights: boolean[];
  /** Какие виды оружия уже есть в начале. */
  startWeapons: string[];
  waves: WaveDef[];
  beats: Beat[];
  rules: StrKey[];
  /** Номер пункта Наказа, который нарушает стук/открытие двери (0 — не нарушает). */
  knockRule: number;
  knockPrompt: StrKey;
  houses: HouseScript[];
  extras: ExtraDef[];
  fragments: StrKey[];
  intro: Shot[];
  dawn: Shot[];
  /** Реплика вместо последней в рассвете, если игрок искал правду. */
  dawnTruth: StrKey;
  dawnTitle: StrKey;
  dawnSub: StrKey;
}

export type { Effect };
