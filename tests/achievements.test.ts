import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/content/achievements';
import { isStrKey } from '../src/i18n';
import { AchievementTracker } from '../src/app/achievements';
import { quietWorld, input, step } from './helpers/sim';
import { spawnEnemy } from '../src/sim/enemies';
import { Kind } from '../src/content/enemies';
import { explode } from '../src/sim/combat';

function tracker() {
  const progress = { unlocked: 1, seen: [] as number[], ach: [] as string[], endings: [] as string[], items: [] as string[] };
  const got: string[] = [];
  const t = new AchievementTracker(progress, () => undefined, (a) => got.push(a.id));
  return { t, progress, got };
}

describe('достижения', () => {
  it('данные: уникальные id, все тексты есть, у каждой иконки есть рисунок, все редкости представлены', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(isStrKey(a.name), a.id).toBe(true);
      expect(isStrKey(a.desc), a.id).toBe(true);
      expect(a.icon.length).toBeGreaterThan(0);
    }
    for (const r of ['common', 'uncommon', 'rare', 'legendary']) expect(ACHIEVEMENTS.some((a) => a.rarity === r)).toBe(true);
  });

  it('первое убийство и «громкое слово» за взрыв с тремя убитыми', () => {
    const { t, got } = tracker();
    const w = quietWorld();
    w.player.x = 30;
    w.player.z = 30;
    for (let i = 0; i < 3; i++) spawnEnemy(w, Kind.Whisperer, -5 + i * 0.6, 3);
    explode(w, -4.4, 3, 5, 200);
    t.onEvents(w);
    expect(got).toContain('first_blood');
    expect(got).toContain('boom');
  });

  it('не выдаёт повторно и сохраняет', () => {
    const { t, progress, got } = tracker();
    t.unlock('reel');
    t.unlock('reel');
    expect(got.filter((x) => x === 'reel').length).toBe(1);
    expect(progress.ach).toEqual(['reel']);
  });

  it('по флагам: стук, рубильник, лампа; концовки копятся в «три исхода»', () => {
    const { t, progress, got } = tracker();
    const w = quietWorld();
    w.flags.add('broke:2');
    w.flags.add('broke:1');
    w.flags.add('gotLamp');
    t.check(w);
    expect(got).toEqual(expect.arrayContaining(['knock', 'switch', 'lamp']));
    for (const e of ['flood', 'loop', 'name']) {
      w.flags.add(`end:${e}`);
      t.check(w);
    }
    expect(progress.endings.sort()).toEqual(['flood', 'loop', 'name']);
    expect(got).toEqual(expect.arrayContaining(['name', 'three']));
  });

  it('«образцовый жилец» — только без нарушений', () => {
    const a = tracker();
    const w = quietWorld();
    w.time = w.cfg.night.duration - 0.01;
    step(w, input(), 0.1);
    w.emit('dawn');
    a.t.onEvents(w);
    expect(a.got).toContain('obedient');
    const b = tracker();
    const w2 = quietWorld();
    w2.flags.add('broke:2');
    w2.emit('dawn');
    b.t.onEvents(w2);
    expect(b.got).not.toContain('obedient');
  });
});
