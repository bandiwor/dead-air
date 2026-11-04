import type { StrKey } from '../i18n';
import type { Effect } from './script';
import { MENU_NIGHTS, NIGHTS } from './nights';

/**
 * Доска записок: всё, что можно прочитать в игре, по ночам — в домах, в воде, на развалинах.
 * Собирается из данных ночей автоматически: новая записка в контенте сама появится на доске.
 */
export type NoteKind = 'house' | 'water' | 'find' | 'nakaz';

export interface NoteEntry {
  key: StrKey;
  kind: NoteKind;
}

export interface NoteChapter {
  title: StrKey;
  notes: NoteEntry[];
}

function fromEffects(list: readonly Effect[], kind: NoteKind, out: NoteEntry[]): void {
  for (const e of list) if ('note' in e) out.push({ key: e.note, kind });
}

/** Записка живёт в той главе, где встретилась впервые («Опять» повторяет дома первой ночи). */
const placed = new Set<string>();

function chapterOf(title: StrKey): NoteEntry[] {
  const out: NoteEntry[] = [];
  // части одной ночи (Весна и Щель) — одна глава
  for (const n of NIGHTS.filter((x) => x.titleKey === title)) {
    for (const b of n.beats) fromEffects(b.do, b.id.startsWith('nakaz') ? 'nakaz' : 'find', out);
    for (const h of n.houses) {
      for (const note of h.notes) {
        out.push({ key: note.key as StrKey, kind: 'house' });
        if (note.after) fromEffects(note.after, 'house', out);
      }
    }
    for (const x of n.extras) fromEffects(x.effects, x.reflect ? 'water' : 'find', out);
  }
  // без повторов: одна и та же записка может встречаться в нескольких местах и ночах
  return out.filter((e) => (placed.has(e.key) ? false : (placed.add(e.key), true)));
}

export const NOTE_BOOK: readonly NoteChapter[] = MENU_NIGHTS.map((n) => ({ title: n.titleKey, notes: chapterOf(n.titleKey) }));

export const NOTE_TOTAL = NOTE_BOOK.reduce((a, c) => a + c.notes.length, 0);
