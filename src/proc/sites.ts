/**
 * Авторские места застройки — общий источник для рельефа (выравнивание площадок)
 * и раскладки деревни. Без зависимостей, чтобы не было циклов импорта.
 */
export interface Site {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  lit: boolean;
}

export const HOUSE_SITES: readonly Site[] = [
  { id: 0, x: -13, z: -5, w: 6, d: 5, h: 2.6, rot: 0.35, lit: true },
  { id: 1, x: -12.5, z: 9, w: 5.5, d: 4.5, h: 2.5, rot: -0.25, lit: false },
  { id: 2, x: -2, z: 13.5, w: 6, d: 5, h: 2.7, rot: 0.1, lit: false },
  { id: 3, x: 13, z: -11, w: 6.5, d: 5, h: 2.7, rot: -0.4, lit: true },
  { id: 4, x: -3, z: -15, w: 5, d: 4.5, h: 2.4, rot: 0.15, lit: false },
  { id: 5, x: 12.5, z: 4.5, w: 5, d: 4, h: 2.4, rot: 0.5, lit: false },
];

export const HUT_SITE: Site = { id: 100, x: 6.5, z: -4.5, w: 3.6, d: 3, h: 2.4, rot: 0, lit: true };
