/**
 * Бестиарий. Каждое существо — метафора: см. docs/GDD.md §7.
 * Поведение задаётся параметрами; новые типы поведения регистрируются в sim/enemies.ts.
 */
export const Kind = {
  /** Шептун — недоговорённое слово. Боится света. */
  Whisperer: 0,
  /** Немой — сама тишина. Слеп, идёт на шум. */
  Mute: 1,
  /** Отголосок — ваш собственный путь. Идёт по вашим следам. */
  Echo: 2,
  /** Тот, кого не позвали. Исчезает, если на него посмотреть. */
  Apparition: 3,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export interface EnemyDef {
  kind: Kind;
  id: string;
  hp: number;
  speed: number;
  radius: number;
  dmg: number;
  atkCd: number;
  /** Насколько свет фонаря замедляет (0..1). */
  lightFear: number;
  mass: number;
}

export const ENEMIES: Record<Kind, EnemyDef> = {
  [Kind.Whisperer]: { kind: Kind.Whisperer, id: 'whisperer', hp: 28, speed: 3.6, radius: 0.4, dmg: 7, atkCd: 1.05, lightFear: 0.55, mass: 1 },
  [Kind.Mute]: { kind: Kind.Mute, id: 'mute', hp: 280, speed: 1.6, radius: 0.95, dmg: 18, atkCd: 1.4, lightFear: 0, mass: 6 },
  [Kind.Echo]: { kind: Kind.Echo, id: 'echo', hp: 120, speed: 0, radius: 0.4, dmg: 24, atkCd: 1, lightFear: 0, mass: 1 },
  [Kind.Apparition]: { kind: Kind.Apparition, id: 'apparition', hp: 1, speed: 0, radius: 0.4, dmg: 0, atkCd: 99, lightFear: 0, mass: 1 },
};

export type KindId = 'whisperer' | 'mute' | 'echo';
export const KIND_BY_ID: Record<KindId, Kind> = { whisperer: Kind.Whisperer, mute: Kind.Mute, echo: Kind.Echo };
