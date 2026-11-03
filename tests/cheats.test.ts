import { describe, expect, it } from 'vitest';
import { input, quietWorld, step } from './helpers/sim';
import { spawnEnemy } from '../src/sim/enemies';
import { Kind } from '../src/content/enemies';
import { WEAPONS } from '../src/content/weapons';

describe('читы режима отладки', () => {
  it('по умолчанию выключены', () => {
    const w = quietWorld();
    expect(w.cheats).toEqual({ god: false, ammo: false, freeze: false });
  });

  it('бессмертие: урон не проходит', () => {
    const w = quietWorld();
    w.cheats.god = true;
    w.player.x = 3;
    w.player.z = 9;
    const e = spawnEnemy(w, Kind.Mute, 3.8, 9)!;
    e.atkCd = 0;
    step(w, input(), 10, [], false);
    expect(w.player.hp).toBe(100);
    expect(w.state).toBe('play');
  });

  it('бесконечные патроны: магазин не пустеет', () => {
    const w = quietWorld();
    w.cheats.ammo = true;
    w.player.x = 3;
    w.player.z = 9;
    step(w, input({ aiming: true, ax: 1, fire: true }), 5);
    expect(w.player.mag[0]).toBe(WEAPONS[0]!.mag);
  });

  it('заморозка: враги стоят', () => {
    const w = quietWorld();
    w.cheats.freeze = true;
    w.player.x = 3;
    w.player.z = 9;
    const e = spawnEnemy(w, Kind.Whisperer, 13, 9)!;
    step(w, input(), 2);
    expect(e.x).toBeCloseTo(13, 5);
  });
});
