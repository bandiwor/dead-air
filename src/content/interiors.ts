import type { StrKey } from '../i18n';
import type { Effect } from './script';

/**
 * Интерьеры домов Устья. Координаты локальные: x — вдоль фасада, z — вглубь (дверь на +z).
 * Каждая записка — улика к главной тайне: деревня «замолчала» человека, а вы — двенадцатый двор.
 */
export type FurnitureType =
  | 'table' | 'chair' | 'chairWall' | 'bed' | 'stove' | 'shelf' | 'radio' | 'mirror'
  | 'frame' | 'drawings' | 'bench' | 'hole' | 'chest' | 'chairDown';

export interface Furniture {
  type: FurnitureType;
  x: number;
  z: number;
  rot?: number;
  /** Радиус коллизии (0 — проходимо). */
  r?: number;
}

export interface NoteDef {
  id: string;
  key: StrKey;
  x: number;
  z: number;
  /** Что происходит сразу после прочтения. */
  after?: Effect[];
}

export interface InteriorDef {
  house: number;
  furniture: Furniture[];
  notes: NoteDef[];
  /** Ответ дома на стук (после общего «вы постучали»). */
  knock: Effect[];
  /** Куда кладутся находки внутри. */
  spot: [number, number];
}

export const INTERIORS: InteriorDef[] = [
  {
    house: 0,
    furniture: [
      { type: 'stove', x: -2.1, z: -1.4, r: 0.75 },
      { type: 'table', x: 0.9, z: -1.3, r: 0.55 },
      { type: 'chair', x: 0.9, z: -0.5 },
      { type: 'chairWall', x: 2.5, z: -2.0, rot: Math.PI },
      { type: 'shelf', x: -2.75, z: 1.0, rot: Math.PI / 2 },
      { type: 'radio', x: -2.7, z: 1.0, rot: Math.PI / 2 },
      { type: 'bed', x: 2.0, z: 1.2 },
    ],
    notes: [
      { id: 'dinner', key: 'note.dinner', x: 0.9, z: -1.3 },
      { id: 'receiver', key: 'note.receiver', x: -2.45, z: 1.0 },
    ],
    knock: [{ scare: 'knockBack', house: 0 }, { wait: 2.2 }, { openDoor: 0 }, { line: 'n1.open0' }],
    spot: [0.9, -1.3],
  },
  {
    house: 1,
    furniture: [
      { type: 'mirror', x: 0, z: -2.05 },
      { type: 'bed', x: -1.6, z: -0.6, r: 0.5 },
      { type: 'bench', x: 1.7, z: -1.3 },
      { type: 'chairDown', x: 1.0, z: 0.6 },
    ],
    notes: [
      {
        id: 'mirror',
        key: 'note.mirror',
        x: 0,
        z: -1.7,
        // за спиной кто-то есть — повернитесь (фонарь) и увидите его лицо
        after: [{ scare: 'duck' }, { wait: 0.4 }, { appear: 'behind' }, { line: 'n1.behind' }],
      },
    ],
    knock: [{ scare: 'knockBack', house: 1 }, { wait: 2.6 }, { openDoor: 1 }, { line: 'n1.open1' }],
    spot: [1.7, -1.3],
  },
  {
    house: 2,
    furniture: [
      { type: 'table', x: 0.6, z: -1.3, r: 0.55 },
      { type: 'bench', x: 0.6, z: -0.4 },
      { type: 'drawings', x: -1.5, z: -2.3 },
      { type: 'stove', x: -2.0, z: 1.0, r: 0.75 },
      { type: 'chest', x: 2.2, z: 1.3, r: 0.4 },
    ],
    notes: [{ id: 'drawings', key: 'note.drawings', x: -1.5, z: -2.05 }],
    knock: [],
    spot: [0.6, -1.3],
  },
  {
    house: 3,
    furniture: [
      { type: 'table', x: -1.2, z: -1.2, r: 0.55 },
      { type: 'chair', x: -1.2, z: -0.4 },
      { type: 'chest', x: 2.4, z: -1.8, r: 0.4 },
      { type: 'shelf', x: 1.4, z: -2.25 },
      { type: 'bed', x: 2.1, z: 1.2 },
    ],
    notes: [{ id: 'list', key: 'note.list', x: -1.2, z: -1.2 }],
    // никто не отвечает; дверь открывается сама — будто её и не запирали
    knock: [{ wait: 5 }, { openDoor: 3 }, { line: 'n1.open3' }],
    spot: [-1.2, -1.2],
  },
  {
    house: 4,
    furniture: [
      { type: 'hole', x: 0, z: -0.7 },
      { type: 'chairDown', x: -1.5, z: 0.4 },
      { type: 'chairDown', x: 1.4, z: -1.5 },
      { type: 'table', x: -1.5, z: -1.3 },
    ],
    notes: [{ id: 'floor', key: 'note.floor', x: 1.2, z: 0.2 }],
    // в ответ — скрежет изнутри, и из-под пола лезут они
    knock: [
      { scare: 'scratch', house: 4 },
      { wait: 2.5 },
      { openDoor: 4 },
      { spawn: 'whisperer', count: 5, at: 'inside', house: 4 },
      { line: 'n1.open4' },
    ],
    spot: [1.2, 0.2],
  },
  {
    house: 5,
    furniture: [
      { type: 'frame', x: 2.28, z: -0.6, rot: -Math.PI / 2 },
      { type: 'bed', x: -1.4, z: -1.0, r: 0.5 },
      { type: 'chair', x: 1.3, z: 0.6, rot: 2.4 },
    ],
    notes: [{ id: 'photo', key: 'note.photo', x: 1.95, z: -0.6 }],
    // свет загорается, в окне — силуэт; свет гаснет; дверь открыта
    knock: [{ light: 5, on: true }, { appear: 'window', house: 5 }, { wait: 2.2 }, { light: 5, on: false }, { wait: 1 }, { openDoor: 5 }, { line: 'n1.open5' }],
    spot: [1.3, 0.6],
  },
];

export function interiorOf(house: number): InteriorDef | undefined {
  return INTERIORS.find((i) => i.house === house);
}
