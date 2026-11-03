import { beforeEach, describe, expect, it } from 'vitest';

// минимальная подмена localStorage для Node
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { loadSettings, saveSettings, loadProgress, saveProgress, DEFAULT_SETTINGS } = await import('../src/platform/storage');
const { isVersion } = await import('../src/platform/updates');

describe('настройки', () => {
  beforeEach(() => mem.clear());

  it('без сохранения — значения по умолчанию', () => {
    const s = loadSettings();
    expect(s.scare).toBe(DEFAULT_SETTINGS.scare);
    expect(s.disclaimerAccepted).toBe(false);
  });

  it('сохранение и загрузка', () => {
    saveSettings({ ...DEFAULT_SETTINGS, scare: 0.25, reduceFlashes: true, quality: 2, disclaimerAccepted: true });
    const s = loadSettings();
    expect(s.scare).toBe(0.25);
    expect(s.reduceFlashes).toBe(true);
    expect(s.quality).toBe(2);
    expect(s.disclaimerAccepted).toBe(true);
  });

  it('мусор и подделки не ломают игру: зажимаются или сбрасываются', () => {
    mem.set('dead-air:settings', '{not json');
    expect(loadSettings().scare).toBe(DEFAULT_SETTINGS.scare);
    mem.set('dead-air:settings', JSON.stringify({ scare: 99, quality: -5, volume: 'громко', vibration: 'да', __proto__: { x: 1 } }));
    const s = loadSettings();
    expect(s.scare).toBe(1);
    expect(s.quality).toBe(0);
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.vibration).toBe(DEFAULT_SETTINGS.vibration);
  });
});

describe('прогресс', () => {
  beforeEach(() => mem.clear());

  it('по умолчанию открыта одна ночь', () => {
    expect(loadProgress()).toEqual({ unlocked: 1, seen: [] });
  });

  it('сохраняется и валидируется', () => {
    saveProgress({ unlocked: 2, seen: [0, 4] });
    expect(loadProgress()).toEqual({ unlocked: 2, seen: [0, 4] });
    mem.set('dead-air:progress', JSON.stringify({ unlocked: 9999, seen: [1, 'x', -3, 2.5, 4] }));
    const p = loadProgress();
    expect(p.unlocked).toBeLessThanOrEqual(20);
    expect(p.seen).toEqual([1, 4]);
    mem.set('dead-air:progress', 'null');
    expect(loadProgress().unlocked).toBe(1);
  });
});

describe('version.json', () => {
  it('принимает только корректный формат', () => {
    expect(isVersion({ id: 'abc123', version: '0.1.0' })).toBe(true);
    expect(isVersion({ id: '', version: '0.1.0' })).toBe(false);
    expect(isVersion({ id: 'x'.repeat(100), version: '1' })).toBe(false);
    expect(isVersion({ id: 5, version: '1' })).toBe(false);
    expect(isVersion(null)).toBe(false);
    expect(isVersion('abc')).toBe(false);
  });
});
