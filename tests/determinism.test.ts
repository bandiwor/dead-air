import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { NIGHT1 } from '../src/content/night1';
import { emptyInput, type InputFrame } from '../src/sim/types';
import { Rng } from '../src/core/rng';

/** Сценарный «бот»: ходит кругами, стреляет, бросает шашки, меняет оружие. */
function scriptedInput(tick: number): InputFrame {
  const f = emptyInput();
  const a = tick * 0.004;
  f.mx = Math.cos(a);
  f.mz = Math.sin(a * 1.3);
  f.aiming = true;
  f.ax = Math.cos(a * 3);
  f.az = Math.sin(a * 3);
  f.fire = tick % 40 < 20;
  f.throw = tick % 900 === 450;
  f.swap = tick % 1200 === 600;
  f.action = tick % 3000 > 2800;
  return f;
}

function run(seed: number, ticks: number): { hash: number; world: World } {
  const world = new World({ seed, night: NIGHT1, scare: 0.8 });
  for (let i = 0; i < ticks; i++) {
    world.step(scriptedInput(i), 1 / 60);
    world.clearEvents();
  }
  return { hash: world.hash(), world };
}

describe('детерминизм симуляции', () => {
  it('одинаковые сид и ввод → одинаковое состояние', () => {
    const a = run(42, 60 * 120);
    const b = run(42, 60 * 120);
    expect(a.hash).toBe(b.hash);
  });

  it('другой сид → другое состояние', () => {
    expect(run(42, 60 * 60).hash).not.toBe(run(43, 60 * 60).hash);
  });

  it('ночь проходит без исключений и враги появляются', () => {
    const world = new World({ seed: 7, night: NIGHT1, scare: 1 });
    let maxEnemies = 0;
    let lines = 0;
    for (let i = 0; i < 60 * 200; i++) {
      world.step(scriptedInput(i), 1 / 60);
      for (let k = 0; k < world.eventCount; k++) if (world.events[k]!.type === 'line') lines++;
      world.clearEvents();
      maxEnemies = Math.max(maxEnemies, world.aliveEnemies());
      if (world.state !== 'play') break;
    }
    expect(maxEnemies).toBeGreaterThan(0);
    expect(lines).toBeGreaterThan(0);
  });
});

describe('Rng', () => {
  it('воспроизводим', () => {
    const a = new Rng(1);
    const b = new Rng(1);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('в диапазоне [0,1)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
