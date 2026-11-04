import { describe, expect, it } from 'vitest';
import { NOTE_BOOK, NOTE_TOTAL } from '../src/content/notes';
import { isStrKey } from '../src/i18n';

describe('доска записок', () => {
  it('по главе на каждую ночь из меню, в каждой — записки', () => {
    expect(NOTE_BOOK.length).toBe(4);
    for (const ch of NOTE_BOOK) expect(ch.notes.length, ch.title).toBeGreaterThan(1);
    expect(NOTE_TOTAL).toBe(NOTE_BOOK.reduce((a, c) => a + c.notes.length, 0));
  });

  it('у каждой записки есть текст, без повторов; записки из воды помечены', () => {
    const all = NOTE_BOOK.flatMap((c) => c.notes);
    for (const n of all) expect(isStrKey(n.key), n.key).toBe(true);
    expect(new Set(all.map((n) => n.key)).size).toBe(all.length);
    const water = all.filter((n) => n.kind === 'water').map((n) => n.key);
    expect(water).toEqual(expect.arrayContaining(['note.reflHut', 'note.reflStreet', 'note.reflKey', 'note.reflCellar']));
    expect(all.find((n) => n.key === 'note.nakaz')?.kind).toBe('nakaz');
  });
});
