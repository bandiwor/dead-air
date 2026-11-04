import { describe, expect, it } from 'vitest';
import { input, quietWorld, step } from './helpers/sim';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { fireWeapon } from '../src/sim/combat';
import { NIGHT1 } from '../src/content/night1';
import { NIGHT2 } from '../src/content/night2';
import { NIGHT4F } from '../src/content/night4';
import { NIGHTS } from '../src/content/nights';
import { World } from '../src/sim/world';

describe('Стрелять дорого', () => {
  it('патронов мало: в начале — два барабана револьвера', () => {
    const w = new World({ seed: 1, night: NIGHT1, scare: 0 });
    expect(w.player.reserve[0]).toBeLessThanOrEqual(14);
  });

  it('выстрелы копят шум, и из леса приходят новые', () => {
    const w = quietWorld(1, { ...NIGHT1, waves: NIGHT1.waves.map((x) => ({ ...x, at: 1e9 })) });
    const before = w.aliveEnemies();
    for (let i = 0; i < 9; i++) fireWeapon(w);
    step(w, input(), 0.1);
    expect(w.aliveEnemies()).toBeGreaterThan(before);
  });

  it('тишина остывает: редкие выстрелы никого не зовут', () => {
    const w = quietWorld(1, { ...NIGHT1, waves: NIGHT1.waves.map((x) => ({ ...x, at: 1e9 })) });
    for (let i = 0; i < 6; i++) {
      fireWeapon(w);
      step(w, input(), 8);
    }
    expect(w.aliveEnemies()).toBe(0);
  });
});

describe('Меньше волн, больше тишины', () => {
  it('в каждой ночи не больше трёх волн и между ними — минута и больше', () => {
    for (const n of NIGHTS) {
      expect(n.waves.length, n.id).toBeLessThanOrEqual(3);
      for (let i = 1; i < n.waves.length; i++) expect(n.waves[i]!.at - n.waves[i - 1]!.at, n.id).toBeGreaterThanOrEqual(90);
    }
  });
});

describe('Бобина — ресурс', () => {
  it('одна бобина держит эфир больше двух минут', () => {
    for (const n of [NIGHT1, NIGHT2, NIGHT4F]) expect(n.reelSeconds).toBeGreaterThanOrEqual(120);
  });

  it('заправка тратит запасную бобину; без запаса радиоузел не заправить', () => {
    const w = quietWorld();
    const door = w.layout.hutDoor;
    w.player.x = door.x;
    w.player.z = door.z;
    w.air = 0.5;
    expect(w.player.reels).toBe(1);
    step(w, input({ action: true }), 3);
    expect(w.air).toBeGreaterThan(0.95);
    expect(w.player.reels).toBe(0);
    w.air = 0.5;
    step(w, input({ action: true }), 3);
    expect(w.player.canReel).toBe(false);
    expect(w.player.noReel).toBe(true);
    expect(w.air).toBeLessThan(0.6);
  });

  it('бобину можно подобрать', () => {
    const w = quietWorld();
    w.player.x = 3;
    w.player.z = 3;
    w.director.dropPickup(5, 0, 3.4, 3);
    step(w, input(), 0.1);
    expect(w.player.reels).toBe(2);
  });

  it('после волны в дальнем доме оставляют бобину', () => {
    const w = new World({ seed: 2, night: { ...NIGHT1, beats: [] }, scare: 0 });
    (w.director as unknown as { endWave(): void }).endWave();
    expect(w.pickups.some((p) => p.active && p.kind === 5)).toBe(true);
  });
});

describe('Наказ бережёт тех, кто его держит', () => {
  const warded = () => {
    const w = quietWorld();
    (w.cfg.night as { wards?: unknown }).wards = NIGHT1.wards;
    return w;
  };

  it('пока не стучали — в дом не входят даже через открытую дверь', () => {
    const w = warded();
    const h = w.layout.houses[0]!;
    w.setDoor(0, true);
    const e = spawnEnemy(w, Kind.Whisperer, h.x - 8, h.z - 8)!;
    let inside = false;
    for (let i = 0; i < 20 * 6 && !inside; i++) {
      w.player.x = h.x;
      w.player.z = h.z;
      w.updatePlayerHouse();
      step(w, input(), 1 / 6);
      w.player.hp = 100;
      inside = Math.hypot(e.x - h.x, e.z - h.z) < 2;
    }
    expect(inside).toBe(false);
    expect(w.flags.has('ward:houses')).toBe(true);
    // постучали — защита пропала
    w.flags.add('broke:2');
    expect(w.ward('houses')).toBe(false);
  });

  it('пока играет радио, Молчун не заходит в свет столба', () => {
    const w = warded();
    const pole = w.layout.pole;
    w.player.x = pole.x + 1;
    w.player.z = pole.z + 1;
    const e = spawnEnemy(w, Kind.Mute, pole.x + 12, pole.z)!;
    let minD = 99;
    for (let i = 0; i < 60 * 10; i++) {
      step(w, input(), 1 / 60);
      w.player.hp = 100;
      minD = Math.min(minD, Math.hypot(e.x - pole.x, e.z - pole.z));
    }
    expect(minD).toBeGreaterThanOrEqual(6.9);
    w.air = 0;
    step(w, input(), 0.1);
    expect(w.ward('pole')).toBe(false);
  });
});
