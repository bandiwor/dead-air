import { describe, expect, it } from 'vitest';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { ECHO_DELAY } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';
import { input, quietWorld, step } from './helpers/sim';

describe('Отголосок — вы сами в прошлом', () => {
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
    for (let i = 0; i < 120; i++) {
      step(w, input({ mx: -1 }), 1 / 60);
      const past = path[path.length - ECHO_DELAY + i]!;
      if (!e.active) break;
      expect(e.x).toBeCloseTo(past[0], 4);
      expect(e.z).toBeCloseTo(past[1], 4);
      expect(e.yaw).toBeCloseTo(past[2], 4);
    }
  });

  it('стреляет теми же выстрелами, что вы — 5 секунд назад; попадает в вас, если вы на линии', () => {
    const w = quietWorld(6);
    w.player.x = 0;
    w.player.z = 0;
    // стреляем вправо, стоя на месте
    const log: SimEvent[] = [];
    step(w, input({ aiming: true, ax: 1, az: 0, fire: true }), 0.4, log);
    step(w, input(), 0.2);
    const myShots = log.filter((e) => e.type === 'shot' && e.c !== 1).length;
    expect(myShots).toBeGreaterThan(0);
    // уходим вперёд, на линию собственного огня
    step(w, input({ mx: 1 }), 1.2);
    spawnEnemy(w, Kind.Echo, 0, 0);
    const hp0 = 100;
    w.player.hp = hp0;
    const later: SimEvent[] = [];
    // ждём, пока прошлое дойдёт до выстрелов (стоим на линии огня)
    step(w, input(), 4.5, later, false);
    const echoShots = later.filter((e) => e.type === 'shot' && e.c === 1).length;
    expect(echoShots).toBe(myShots);
    expect(later.some((e) => e.type === 'tracer' && e.c === 4)).toBe(true);
    expect(w.player.hp).toBeLessThan(hp0);
  });

  it('встанете на месте — прошлое придёт к вам и ударит', () => {
    const w = quietWorld(7);
    step(w, input({ mx: 1 }), 2);
    spawnEnemy(w, Kind.Echo, 0, 0);
    const log: SimEvent[] = [];
    step(w, input(), 7, log);
    expect(w.flags.has('broke:3')).toBe(true);
    expect(log.some((e) => e.type === 'vanish' && e.a === Kind.Echo)).toBe(true);
  });

  it('пока прошлого не накопилось — невидим и безвреден', () => {
    const w = quietWorld(8);
    const e = spawnEnemy(w, Kind.Echo, 3, 3)!;
    step(w, input(), 1);
    expect(e.delay).toBe(1);
    expect(e.active).toBe(true);
  });
});
