import { describe, expect, it } from 'vitest';
import { chunkList } from '../src/boot/loader';
import { keyCode } from '../src/platform/input';

describe('загрузчик', () => {
  it('в dev-режиме (заглушка не заменена) список пуст — игра грузится обычным import()', () => {
    expect(chunkList('__DEAD_AIR_CHUNKS__')).toEqual([]);
  });

  it('берёт только файлы из assets/ с положительным размером', () => {
    const list = chunkList([
      ['assets/three-abc.js', 100],
      ['assets/start-x_y.js', 50],
      ['../etc/passwd', 10],
      ['https://evil.example/x.js', 10],
      ['assets/a.js', -1],
      ['assets/b.js', Number.NaN],
      'мусор',
    ]);
    expect(list).toEqual([['assets/three-abc.js', 100], ['assets/start-x_y.js', 50]]);
  });
});

describe('клавиатура', () => {
  it('физическая клавиша важнее буквы; без code — по букве, в том числе в русской раскладке', () => {
    expect(keyCode({ code: 'KeyD', key: 'в' })).toBe('KeyD');
    expect(keyCode({ code: '', key: 'd' })).toBe('KeyD');
    expect(keyCode({ code: 'Unidentified', key: 'В' })).toBe('KeyD');
    expect(keyCode({ code: '', key: 'ф' })).toBe('KeyA');
  });
});
