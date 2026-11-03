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
  /** Облик ночи: тени/света (раздельное тонирование), обесцвечивание, клочья тумана, морось. */
  /** Множитель дальности камеры (меньше — ближе). */
  cam?: number;
  look: { shadow: [number, number, number]; highlight: [number, number, number]; desat: number; mist: number; rain: boolean };
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

  // ---- необязательное (третья ночь) ----
  /** Не показывать в меню: часть другой ночи. */
  hidden?: boolean;
  /** После рассвета сразу начинается эта ночь (без экрана рассвета). */
  next?: string;
  /** Игрок — ребёнок: без оружия, с керосиновой лампой. */
  child?: boolean;
  /** Радио мертво: нет бобин и эфира. */
  noRadio?: boolean;
  /** Действие «Голос»: крик-сонар. */
  voice?: boolean;
  /** Фонарь садится; батарейки — находки. */
  battery?: boolean;
  /** Уровень воды по времени (паводок или осушенный пруд). */
  water?: { from: number; to: number; t0: number; t1: number };
  /** Где игрок начинает (по умолчанию — у площади). */
  start?: [number, number];
  /** Шашки в начале (по умолчанию 3). */
  dynamite?: number;
  /** Показать на карте: развалины двенадцатого двора в осушенном пруду, заслонку в Щели. */
  ruin?: boolean;
  sluice?: boolean;
  /** Концовки: выбираются по флагу, у каждой свой рассвет. */
  endings?: { flag: string; dawn: Shot[]; title: StrKey; sub: StrKey }[];
}

export type { Effect };
