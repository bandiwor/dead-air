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
export type WardKind = 'houses' | 'pole' | 'trail';

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
  /**
   * «Смотреть в воду»: у пруда, луж и в подполе можно заглянуть в отражение. Там видно то,
   * чего нет наверху (записки reflect, кто стоит за спиной). Хватает на один вдох; задержишься —
   * срабатывает overstay.
   */
  reflect?: { puddles: { x: number; z: number; r: number }[]; overstay: Effect[] };
  /**
   * Наказ охраняет тех, кто его держит: пока пункт `rule` не нарушен, действует защита.
   * houses — твари не входят в дома; pole — Молчуны не заходят в свет столба (пока играет радио);
   * trail — Отголосок бьёт вполсилы.
   */
  wards?: { rule: number; kind: WardKind }[];
  /** Запасных бобин в начале ночи (по умолчанию 1). Новые находят в домах и после волн. */
  reels?: number;
  /** Индекс пункта Наказа «не отворачиваться от закрывших лицо» (Невидевшие). */
  turnRule?: number;
  /**
   * Ночь с развилкой: какой вариант играть, решает последняя концовка прошлой ночи
   * (id концовки → id ночи; '*' — если концовки нет).
   */
  branch?: Record<string, string>;
  /** Глухой сруб посреди ночи (двенадцатый двор во «Весне»): x, z, размеры, поворот. */
  block?: { x: number; z: number; w: number; d: number; rot: number };
  /** На рассвете вода уходит до этого уровня — показывается то, что было на дне. */
  dawnRecede?: number;
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
