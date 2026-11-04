import type { StrKey } from '../i18n';
import type { IconPart } from './achievements';
import { WEAPONS } from './weapons';

/**
 * Находки: всё, что можно подобрать. Первая находка каждого вида — стоп-кадр с моделью
 * (как первая встреча с существом), дальше — маленькая карточка снизу: иконка, название, сколько.
 */
export interface ItemDef {
  id: string;
  name: StrKey;
  desc: StrKey;
  tip: StrKey;
  /** Что показывает маленькая карточка: «+14 патр.» и т. п. ({n} — количество). */
  count: StrKey;
  /** Модель для витрины: 'weapon:<id>' или id находки. */
  model: string;
  icon: IconPart[];
}

const WEAPON_ICONS: Record<string, IconPart[]> = {
  revolver: [{ p: 'M3 9 H18 V12 H10 L9 18 H5 L6 12 H3 Z' }, { c: [11.5, 10.5, 1.8] }],
  shotgun: [{ l: [2, 9, 21, 9] }, { l: [2, 11.5, 21, 11.5] }, { p: 'M15 11.5 L13.5 18 H17.5 L19 11.5' }, { l: [8, 13.5, 13, 13.5] }],
  rifle: [{ l: [1, 10, 23, 10] }, { p: 'M1 10 L1 14 L9 12.5' }, { l: [12, 8, 12, 10] }, { l: [12, 8, 14, 7] }],
  smg: [{ r: [7, 8, 9, 4] }, { l: [16, 10, 22, 10] }, { c: [11, 15.5, 2.6] }, { p: 'M7 9 L2 11 L2 13 L7 12' }],
  flaregun: [{ r: [5, 8, 11, 5] }, { p: 'M6 13 L5 19 H9 L10 13' }, { c: [19, 10.5, 1.6] }, { l: [21, 10.5, 23, 10.5] }],
};

export const ITEMS: readonly ItemDef[] = [
  ...WEAPONS.map((w) => ({
    id: `weapon:${w.id}`,
    name: w.nameKey,
    desc: `item.${w.id}.desc` as StrKey,
    tip: `item.${w.id}.tip` as StrKey,
    count: 'item.count.ammo' as StrKey,
    model: `weapon:${w.id}`,
    icon: WEAPON_ICONS[w.id] ?? WEAPON_ICONS.revolver!,
  })),
  {
    id: 'ammo', name: 'pickup.ammo', desc: 'item.ammo.desc', tip: 'item.ammo.tip', count: 'item.count.ammo', model: 'ammo',
    icon: [{ r: [5, 9, 3, 10] }, { r: [10.5, 9, 3, 10] }, { r: [16, 9, 3, 10] }, { p: 'M5 9 L6.5 5 L8 9 M10.5 9 L12 5 L13.5 9 M16 9 L17.5 5 L19 9' }],
  },
  {
    id: 'dynamite', name: 'item.dynamite.name', desc: 'item.dynamite.desc', tip: 'item.dynamite.tip', count: 'item.count.pcs', model: 'dynamite',
    icon: [{ r: [4, 9, 14, 2.6] }, { r: [4, 12, 14, 2.6] }, { r: [4, 15, 14, 2.6] }, { p: 'M18 12 Q21 10 20 6' }, { l: [19, 4, 21, 6] }],
  },
  {
    id: 'med', name: 'pickup.med', desc: 'item.med.desc', tip: 'item.med.tip', count: 'item.count.hp', model: 'med',
    icon: [{ r: [4, 7, 16, 12] }, { l: [12, 9.5, 12, 16.5] }, { l: [8.5, 13, 15.5, 13] }, { p: 'M9 7 V5 H15 V7' }],
  },
  {
    id: 'reel', name: 'pickup.reel', desc: 'item.reel.desc', tip: 'item.reel.tip', count: 'item.count.reel', model: 'reel',
    icon: [{ c: [12, 12, 8] }, { c: [12, 12, 2] }, { c: [12, 6.5, 1.6] }, { c: [16.8, 14.8, 1.6] }, { c: [7.2, 14.8, 1.6] }],
  },
  {
    id: 'battery', name: 'pickup.battery', desc: 'item.battery.desc', tip: 'item.battery.tip', count: 'item.count.charge', model: 'battery',
    icon: [{ r: [8, 6, 8, 15] }, { r: [10.5, 4, 3, 2] }, { p: 'M13 9 L10.5 13.5 H13.5 L11 18' }],
  },
];

/** Вид находки по событию подбора (kind из Pickup, a — индекс оружия). */
export function itemFor(kind: number, a: number): ItemDef | undefined {
  const id = kind === 1 ? `weapon:${WEAPONS[a]?.id}` : kind === 2 ? 'dynamite' : kind === 3 ? 'med' : kind === 4 ? 'battery' : kind === 5 ? 'reel' : 'ammo';
  return ITEMS.find((i) => i.id === id);
}

/** Номер витрины для находки: существа занимают 0..99. */
export const ITEM_SHOWCASE_BASE = 100;
export function itemShowcaseKind(item: ItemDef): number {
  return ITEM_SHOWCASE_BASE + ITEMS.indexOf(item);
}
