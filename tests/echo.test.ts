import { describe, expect, it } from 'vitest';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { ECHO_DELAY } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';
import { input, quietWorld, step } from './helpers/sim';

describe('Отголосок — вы сами в прошлом', () => {
  it('задержка — секунда', () => {
    expect(ECHO_DELAY).toBe(60);
  });

  it('повторяет путь и прицел точь-в-точь, с задержкой в ECHO_DELAY тиков', () => {
    const w = quietWorld(5);
    const path: [number, number, number][] = [];
    // ходим «восьмёркой», запоминая каждый тик
    for (let i = 0; i < 700; i++) {
      const a = i * 0.02;
      step(w, input({ mx: Math.cos(a), mz: Math.sin(a * 2), aiming: true, ax: Math.sin(a), az: Math.cos(a) }), 1 / 60);
      path.push([w.player.x, w.player.z, w.player.yaw]);
    }
    const e = spawnEnemy(w, Kind.Echo, 0, 0)!;
    for (let i = 0; i < ECHO_DELAY - 2; i++) {
      step(w, input({ mx: -1 }), 1 / 60);
      const past = path[path.length - ECHO_DELAY + i]!;
      if (!e.active) break;
      expect(e.x).toBeCloseTo(past[0], 4);
      expect(e.z).toBeCloseTo(past[1], 4);
      expect(e.yaw).toBeCloseTo(past[2], 4);
    }
  });

  it('стреляет теми же выстрелами, что вы секунду назад; попадает, если вы ушли на линию огня', () => {
    const w = quietWorld(6);
    w.player.x = 8;
    w.player.z = 12;
    spawnEnemy(w, Kind.Echo, 0, 0);
    const log: SimEvent[] = [];
    // стоим и стреляем вправо…
    step(w, input({ aiming: true, ax: 1, az: 0, fire: true }), 0.4, log, false);
    // …и тут же идём туда, куда стреляли
    w.player.hp = 100;
    step(w, input({ mx: 1 }), 1.6, log, false);
    const mine = log.filter((e) => e.type === 'shot' && e.c !== 1).length;
    const echoes = log.filter((e) => e.type === 'shot' && e.c === 1).length;
    expect(mine).toBeGreaterThan(0);
    expect(echoes).toBe(mine);
    expect(log.some((e) => e.type === 'tracer' && e.c === 4)).toBe(true);
    expect(w.player.hp).toBeLessThan(100);
    // пули памяти слабее настоящих
    expect(w.player.hp).toBeGreaterThanOrEqual(100 - 10 * mine);
  });

  it('стоите — прошлое догоняет и тихо сливается с вами', () => {
    const w = quietWorld(7);
    step(w, input({ mx: 1 }), 2);
    spawnEnemy(w, Kind.Echo, 0, 0);
    w.player.hp = 100;
    const log: SimEvent[] = [];
    step(w, input(), 2, log, false);
    expect(w.flags.has('echoMerged')).toBe(true);
    expect(w.flags.has('broke:3')).toBe(false);
    expect(w.player.hp).toBe(100);
  });

  it('пойдёте назад по своему следу — столкнётесь с собой', () => {
    const w = quietWorld(9);
    step(w, input({ mx: 1 }), 2);
    spawnEnemy(w, Kind.Echo, 0, 0);
    w.player.hp = 100;
    step(w, input({ mx: -1 }), 1.5, [], false);
    expect(w.flags.has('broke:3')).toBe(true);
    expect(w.player.hp).toBeLessThan(100);
  });

  it('пока прошлого не накопилось — невидим и безвреден', () => {
    const w = quietWorld(8);
    const e = spawnEnemy(w, Kind.Echo, 3, 3)!;
    step(w, input(), 0.5);
    expect(e.delay).toBe(1);
    expect(e.active).toBe(true);
  });
});
