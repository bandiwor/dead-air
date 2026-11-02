import type { StrKey } from '../i18n';
import type { SoundId } from './assets';

export interface WeaponDef {
  id: string;
  nameKey: StrKey;
  kind: 'hitscan' | 'flare';
  dmg: number;
  pellets: number;
  /** Разброс (радианы, ±). */
  spread: number;
  /** Пауза между выстрелами (с). */
  rate: number;
  mag: number;
  reload: number;
  range: number;
  /** Громкость выстрела для слуха врагов (1 ≈ слышно за 30 м). */
  noise: number;
  /** Сколько целей пробивает. */
  pierce: number;
  knock: number;
  shake: number;
  sound: SoundId;
  startReserve: number;
  owned: boolean;
  /** Порция патронов из ящика. */
  crate: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'revolver', nameKey: 'weapon.revolver', kind: 'hitscan', dmg: 34, pellets: 1, spread: 0.025,
    rate: 0.3, mag: 7, reload: 1.8, range: 28, noise: 0.7, pierce: 1, knock: 1.6, shake: 0.2,
    sound: 'revolver', startReserve: 35, owned: true, crate: 14,
  },
  {
    id: 'shotgun', nameKey: 'weapon.shotgun', kind: 'hitscan', dmg: 15, pellets: 9, spread: 0.2,
    rate: 0.75, mag: 2, reload: 1.6, range: 13, noise: 1, pierce: 1, knock: 4.5, shake: 0.5,
    sound: 'shotgun', startReserve: 14, owned: false, crate: 8,
  },
  {
    id: 'rifle', nameKey: 'weapon.rifle', kind: 'hitscan', dmg: 110, pellets: 1, spread: 0.004,
    rate: 0.95, mag: 5, reload: 2.3, range: 48, noise: 1.2, pierce: 4, knock: 3.5, shake: 0.42,
    sound: 'rifle', startReserve: 15, owned: false, crate: 5,
  },
  {
    id: 'smg', nameKey: 'weapon.smg', kind: 'hitscan', dmg: 17, pellets: 1, spread: 0.075,
    rate: 0.085, mag: 35, reload: 2.5, range: 24, noise: 0.9, pierce: 1, knock: 0.9, shake: 0.12,
    sound: 'smg', startReserve: 70, owned: false, crate: 35,
  },
  {
    id: 'flaregun', nameKey: 'weapon.flaregun', kind: 'flare', dmg: 20, pellets: 1, spread: 0,
    rate: 0.6, mag: 1, reload: 2, range: 20, noise: 0.45, pierce: 1, knock: 0, shake: 0.12,
    sound: 'flaregun', startReserve: 3, owned: true, crate: 2,
  },
];

export function weaponIndex(id: string): number {
  return WEAPONS.findIndex((w) => w.id === id);
}
