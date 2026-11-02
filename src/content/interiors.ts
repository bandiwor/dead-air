
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

export interface InteriorDef {
  house: number;
  furniture: Furniture[];
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
    spot: [1.2, 0.2],
  },
  {
    house: 5,
    furniture: [
      { type: 'frame', x: 2.28, z: -0.6, rot: -Math.PI / 2 },
      { type: 'bed', x: -1.4, z: -1.0, r: 0.5 },
      { type: 'chair', x: 1.3, z: 0.6, rot: 2.4 },
    ],
    spot: [1.3, 0.6],
  },
];

export function interiorOf(house: number): InteriorDef | undefined {
  return INTERIORS.find((i) => i.house === house);
}
