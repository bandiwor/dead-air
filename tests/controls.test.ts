import { describe, expect, it } from 'vitest';
import { wrapAngle } from '../src/core/math';
import { input, quietWorld, step } from './helpers/sim';

const ang = (a: number, b: number): number => Math.abs(wrapAngle(a - b));

describe('управление: куда смотрит персонаж', () => {
  // мышь наведена вверх по экрану (−z), идём вправо (+x)
  const soft = { aiming: true, ax: 0, az: -1, aimSoft: true };

  it('мышь просто наведена, а идём в другую сторону — смотрит по ходу', () => {
    const w = quietWorld(1);
    step(w, input({ ...soft, mx: 1 }), 0.8);
    expect(ang(w.player.yaw, 0)).toBeLessThan(0.1);
  });

  it('остановились — разворачивается к курсору плавно, не рывком', () => {
    const w = quietWorld(1);
    step(w, input({ ...soft, mx: 1 }), 0.8);
    step(w, input(soft), 0.1);
    // через 0.1 с ещё на полпути…
    const mid = ang(w.player.yaw, -Math.PI / 2);
    expect(mid).toBeGreaterThan(0.6);
    step(w, input(soft), 1.4);
    // …через полторы — смотрит на курсор
    expect(ang(w.player.yaw, -Math.PI / 2)).toBeLessThan(0.05);
  });

  it('зажали огонь — сразу на прицел, даже на ходу, и полсекунды держит взгляд', () => {
    const w = quietWorld(2);
    step(w, input({ ...soft, mx: 1, fire: true }), 0.3);
    expect(ang(w.player.yaw, -Math.PI / 2)).toBeLessThan(0.05);
    step(w, input({ ...soft, mx: 1 }), 0.3);
    expect(ang(w.player.yaw, -Math.PI / 2)).toBeLessThan(0.1);
  });

  it('резкий выстрел назад на ходу — пуля точно в прицел с первого же кадра', () => {
    const w = quietWorld(3);
    step(w, input({ mx: 1 }), 0.5); // идём вправо, смотрим вправо
    const log = step(w, input({ mx: 1, aiming: true, ax: -1, az: 0.3, fire: true }), 1 / 60);
    const shot = log.find((e) => e.type === 'shot');
    expect(shot).toBeTruthy();
    expect(ang(shot!.b, Math.atan2(0.3, -1))).toBeLessThan(1e-6);
  });

  it('мягкий прицел мыши не замедляет шаг; пятиться с оружием — медленнее, чем идти вперёд', () => {
    const run = (o: Parameters<typeof input>[0]): number => {
      const w = quietWorld(4);
      const x0 = w.player.x;
      step(w, input(o), 1);
      return w.player.x - x0;
    };
    const free = run({ mx: 1 });
    const softRun = run({ ...soft, mx: 1 });
    const forward = run({ mx: 1, aiming: true, ax: 1, az: 0 });
    const backward = run({ mx: 1, aiming: true, ax: -1, az: 0 });
    expect(softRun).toBeCloseTo(free, 1);
    expect(forward).toBeLessThan(free);
    expect(backward).toBeLessThan(forward);
  });

  it('клавиши 1–5 выбирают оружие, только если оно есть', () => {
    const w = quietWorld(5);
    const p = w.player;
    p.owned = p.owned.map((_, i) => i !== 2);
    step(w, input({ select: 3 }), 1 / 60);
    expect(p.weapon).toBe(3);
    step(w, input({ select: 2 }), 1 / 60);
    expect(p.weapon).toBe(3);
  });
});
