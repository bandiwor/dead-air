import type { StrKey } from '../i18n';

/**
 * Достижения. Редкость отражает сложность/скрытность: обычные — то, что случится само собой,
 * легендарные — то, что требует понять игру (и пойти против её привычек).
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** Примитивы иконки: контурный рисунок 24×24, цвет задаёт редкость. */
export type IconPart =
  | { p: string } // path d
  | { c: [number, number, number] } // circle cx cy r
  | { l: [number, number, number, number] } // line
  | { r: [number, number, number, number] }; // rect x y w h

export interface AchievementDef {
  id: string;
  rarity: Rarity;
  name: StrKey;
  desc: StrKey;
  icon: IconPart[];
  /** Скрытое: до получения описание не показывается. */
  secret?: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ---- обычные
  { id: 'first_blood', rarity: 'common', name: 'ach.first_blood', desc: 'ach.first_blood.d', icon: [{ c: [12, 12, 6] }, { l: [12, 2, 12, 8] }, { l: [12, 16, 12, 22] }, { l: [2, 12, 8, 12] }, { l: [16, 12, 22, 12] }, { c: [12, 12, 1] }] },
  { id: 'reel', rarity: 'common', name: 'ach.reel', desc: 'ach.reel.d', icon: [{ c: [7, 11, 4] }, { c: [17, 11, 4] }, { c: [7, 11, 1] }, { c: [17, 11, 1] }, { p: 'M3 19 H21' }, { p: 'M7 15 L5 19 M17 15 L19 19' }] },
  { id: 'reader', rarity: 'common', name: 'ach.reader', desc: 'ach.reader.d', icon: [{ p: 'M6 3 H15 L19 7 V21 H6 Z' }, { p: 'M15 3 V7 H19' }, { l: [9, 11, 16, 11] }, { l: [9, 14, 16, 14] }, { l: [9, 17, 13, 17] }] },
  { id: 'dawn1', rarity: 'common', name: 'ach.dawn1', desc: 'ach.dawn1.d', icon: [{ p: 'M2 17 H22' }, { p: 'M6 17 A6 6 0 0 1 18 17' }, { l: [12, 5, 12, 8] }, { l: [5, 9, 7, 11] }, { l: [19, 9, 17, 11] }, { l: [5, 20, 19, 20] }] },
  { id: 'armed', rarity: 'common', name: 'ach.armed', desc: 'ach.armed.d', icon: [{ p: 'M2 10 H17 V13 H2 Z' }, { p: 'M17 11 H22' }, { c: [9, 16, 3] }, { p: 'M4 13 L3 19 H6 L7 13' }] },
  // ---- необычные
  { id: 'boom', rarity: 'uncommon', name: 'ach.boom', desc: 'ach.boom.d', icon: [{ p: 'M12 2 L14 8 L20 5 L16 11 L22 13 L15 15 L17 21 L12 17 L7 21 L9 15 L2 13 L8 11 L4 5 L10 8 Z' }] },
  { id: 'knock', rarity: 'uncommon', name: 'ach.knock', desc: 'ach.knock.d', icon: [{ r: [5, 3, 10, 18] }, { c: [12, 12, 0.8] }, { p: 'M18 8 A4 4 0 0 1 18 14' }, { p: 'M20 6 A7 7 0 0 1 20 16' }] },
  { id: 'switch', rarity: 'uncommon', name: 'ach.switch', desc: 'ach.switch.d', icon: [{ r: [6, 4, 12, 16] }, { l: [12, 14, 17, 7] }, { c: [17, 7, 1.5] }, { l: [9, 18, 15, 18] }] },
  { id: 'dawn2', rarity: 'uncommon', name: 'ach.dawn2', desc: 'ach.dawn2.d', icon: [{ p: 'M7 13 A5 5 0 0 1 17 13' }, { p: 'M2 16 Q5 14 8 16 T14 16 T20 16' }, { p: 'M2 20 Q5 18 8 20 T14 20 T20 20' }] },
  { id: 'overheard', rarity: 'uncommon', name: 'ach.overheard', desc: 'ach.overheard.d', icon: [{ p: 'M8 20 C4 16 6 13 6 9 A6 6 0 0 1 18 9 C18 13 13 13 13 17 A3 3 0 0 1 8 20' }, { p: 'M10 9 A2 2 0 0 1 14 9 C14 11 12 11 12 13' }] },
  { id: 'naturalist', rarity: 'uncommon', name: 'ach.naturalist', desc: 'ach.naturalist.d', icon: [{ p: 'M4 4 H20 V20 H4 Z' }, { p: 'M8 16 C8 10 16 10 16 16' }, { c: [10, 9, 1] }, { c: [14, 9, 1] }, { l: [8, 16, 16, 16] }] },
  { id: 'lamp', rarity: 'uncommon', name: 'ach.lamp', desc: 'ach.lamp.d', icon: [{ p: 'M8 17 V8 A4 4 0 0 1 16 8 V17 Z' }, { l: [7, 17, 17, 17] }, { l: [9, 17, 9, 21] }, { l: [12, 17, 12, 21] }, { l: [15, 17, 15, 21] }, { p: 'M10 13 L12 9 L14 13' }] },
  // ---- редкие
  { id: 'archivist', rarity: 'rare', name: 'ach.archivist', desc: 'ach.archivist.d', icon: [{ r: [7, 3, 12, 15] }, { p: 'M5 6 V20 H16' }, { p: 'M3 9 V22 H13' }, { l: [10, 7, 16, 7] }, { l: [10, 10, 16, 10] }, { l: [10, 13, 14, 13] }] },
  { id: 'caller', rarity: 'rare', name: 'ach.caller', desc: 'ach.caller.d', icon: [{ p: 'M2 18 H15' }, { l: [5, 18, 5, 22] }, { l: [12, 18, 12, 22] }, { c: [18, 6, 2] }, { p: 'M18 8 V14 M16 10 L18 9 L20 10 M17 18 L18 14 L19 18' }, { p: 'M15 20 Q18 19 22 20' }] },
  { id: 'fullstory', rarity: 'rare', name: 'ach.fullstory', desc: 'ach.fullstory.d', icon: [{ p: 'M3 4 H21 V16 H11 L6 20 V16 H3 Z' }, { l: [6, 8, 18, 8] }, { l: [6, 12, 15, 12] }] },
  { id: 'obedient', rarity: 'rare', name: 'ach.obedient', desc: 'ach.obedient.d', icon: [{ p: 'M4 6 L6 8 L9 4' }, { l: [12, 6, 20, 6] }, { p: 'M4 12 L6 14 L9 10' }, { l: [12, 12, 20, 12] }, { p: 'M4 18 L6 20 L9 16' }, { l: [12, 18, 20, 18] }] },
  { id: 'statue', rarity: 'rare', name: 'ach.statue', desc: 'ach.statue.d', icon: [{ c: [12, 9, 6] }, { r: [7, 6, 4, 7] }, { r: [13, 6, 4, 7] }, { p: 'M6 22 C6 17 18 17 18 22' }] },
  { id: 'dawn3', rarity: 'rare', name: 'ach.dawn3', desc: 'ach.dawn3.d', icon: [{ p: 'M5 13 L12 6 L19 13' }, { l: [8, 10, 8, 14] }, { l: [16, 10, 16, 14] }, { p: 'M2 15 Q5 13 8 15 T14 15 T20 15' }, { p: 'M2 19 Q5 17 8 19 T14 19 T20 19' }] },
  // ---- легендарные
  { id: 'silence', rarity: 'legendary', name: 'ach.silence', desc: 'ach.silence.d', icon: [{ p: 'M4 12 Q12 7 20 12 Q12 17 4 12 Z' }, { l: [7, 10, 7, 14] }, { l: [10, 9, 10, 15] }, { l: [14, 9, 14, 15] }, { l: [17, 10, 17, 14] }] },
  { id: 'name', rarity: 'legendary', name: 'ach.name', desc: 'ach.name.d', secret: true, icon: [{ c: [12, 12, 3] }, { p: 'M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M5.6 18.4 L7.8 16.2 M16.2 7.8 L18.4 5.6' }] },
  { id: 'three', rarity: 'legendary', name: 'ach.three', desc: 'ach.three.d', secret: true, icon: [{ p: 'M12 22 V12' }, { p: 'M12 12 L5 4 M12 12 V3 M12 12 L19 4' }, { c: [5, 4, 1.4] }, { c: [12, 3, 1.4] }, { c: [19, 4, 1.4] }] },
];

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
