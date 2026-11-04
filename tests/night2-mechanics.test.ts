import { describe, expect, it } from 'vitest';
import { NIGHT2 } from '../src/content/night2';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { houseAt } from '../src/sim/houses';
import { isWater, water, WORLD } from '../src/proc/terrain';
import type { SimEvent } from '../src/sim/types';
import type { NightDef } from '../src/content/night';
import { input, makeWorld, step } from './helpers/sim';

const quiet = (o: Partial<NightDef> = {}): NightDef => ({ ...NIGHT2, waves: [], beats: [], ...o });
const P = NIGHT2.reflect!.puddles;

describe('ночь вторая: смотреть в воду', () => {
  it('у лужи можно заглянуть в отражение; пока смотришь — стоишь на месте и тратишь вдох', () => {
    const w = makeWorld(1, quiet());
    w.player.x = P[3]!.x;
    w.player.z = P[3]!.z;
    step(w, input(), 0.1);
    expect(w.canReflect).toBe(true);
    const log: SimEvent[] = [];
    step(w, input({ action: true, mx: 1 }), 1, log);
    expect(w.reflecting).toBe(true);
    expect(log.some((e) => e.type === 'reflect' && e.a === 1)).toBe(true);
    expect(w.player.breath).toBeLessThan(0.8);
    expect(Math.hypot(w.player.x - P[3]!.x, w.player.z - P[3]!.z)).toBeLessThan(0.1);
    step(w, input(), 0.1, log);
    expect(w.reflecting).toBe(false);
    // вдох восстанавливается
    const b = w.player.breath;
    step(w, input(), 2);
    expect(w.player.breath).toBeGreaterThan(b);
  });

  it('вдали от воды заглянуть некуда', () => {
    const w = makeWorld(1, quiet());
    w.player.x = 2;
    w.player.z = -1;
    step(w, input({ action: true }), 0.3);
    expect(w.reflecting).toBe(false);
  });

  it('задержался дольше вдоха — нарушение пункта 4 и вода смотрит в ответ', () => {
    const w = makeWorld(1, quiet());
    w.player.x = P[3]!.x;
    w.player.z = P[3]!.z;
    const log: SimEvent[] = [];
    step(w, input({ action: true }), 4, log);
    expect(w.reflecting).toBe(false);
    expect(w.flags.has('broke:4')).toBe(true);
    expect(log.some((e) => e.type === 'overstay')).toBe(true);
    step(w, input(), 1.5, log);
    expect(w.enemies.filter((e) => e.active && e.kind === Kind.Unseeing).length).toBe(2);
  });

  it('то, что в отражении, читается только в отражении', () => {
    const w = makeWorld(1, quiet());
    const it = w.interactables.find((i) => i.id === 'reflHut')!;
    w.player.x = it.x;
    w.player.z = it.z;
    step(w, input(), 0.1);
    // наверху эта записка не в фокусе
    expect(w.player.focus === w.interactables.indexOf(it)).toBe(false);
    const log: SimEvent[] = [];
    step(w, input({ action: true }), 1.5, log);
    expect(log.some((e) => e.type === 'note' && e.s === 'note.reflHut')).toBe(true);
    expect(w.notesRead).toContain('reflHut');
  });

  it('со второго раза за спиной в отражении кто-то стоит — и, когда поднимешь глаза, он там', () => {
    const w = makeWorld(1, quiet());
    w.time = 200;
    w.player.x = P[3]!.x;
    w.player.z = P[3]!.z;
    step(w, input({ action: true }), 0.3);
    step(w, input(), 1);
    const log: SimEvent[] = [];
    step(w, input({ action: true }), 0.3, log);
    expect(log.some((e) => e.type === 'reflectFigure')).toBe(true);
    step(w, input(), 0.3, log);
    expect(w.enemies.some((e) => e.active && e.kind === Kind.Apparition)).toBe(true);
  });

  it('всё, что видно в отражении, — на суше, и рядом есть вода, в которую можно заглянуть', () => {
    const w = makeWorld(1, quiet());
    for (const it of w.interactables.filter((i) => i.reflect)) {
      expect(isWater(it.x, it.z), it.id).toBe(false);
      expect(w.waterNear(it.x, it.z), it.id).toBe(true);
    }
  });

  it('лужи — на суше и не внутри домов (кроме подпола)', () => {
    const w = makeWorld(1, quiet());
    for (const p of P) {
      expect(isWater(p.x, p.z)).toBe(false);
      const inside = houseAt(w.layout.houses, p.x, p.z);
      if (p === NIGHT2.reflect!.puddles[2]) expect(inside).toBe(4);
      else expect(inside).toBe(-1);
    }
  });
});

describe('ночь вторая: вода, Невидевшие, процессия, двери, перекличка', () => {
  it('Глядень всю ночь прибывает', () => {
    const w = makeWorld(1, quiet());
    const l0 = water.level;
    step(w, input(), 120);
    expect(water.level).toBeGreaterThan(l0);
    expect(water.level).toBeLessThanOrEqual(-0.3);
    // пристань и площадь сухие
    expect(isWater(WORLD.pier.x0 + 1, (WORLD.pier.z0 + WORLD.pier.z1) / 2)).toBe(false);
    expect(isWater(0, 0)).toBe(false);
  });

  it('отвернулся от Невидевшего рядом — нарушение пункта 6 и он бросается', () => {
    const w = makeWorld(1, quiet());
    w.player.x = 3;
    w.player.z = 3;
    const e = spawnEnemy(w, Kind.Unseeing, 7, 3)!;
    e.age = 5;
    step(w, input({ aiming: true, ax: 1, az: 0 }), 0.5);
    expect(e.state).toBe(1);
    step(w, input({ aiming: true, ax: -1, az: 0, fire: true }), 0.3);
    expect(w.flags.has('broke:6')).toBe(true);
  });

  it('свет мигнул, но вы не отворачивались — не нарушение', () => {
    const w = makeWorld(1, quiet());
    w.player.x = 3;
    w.player.z = 3;
    const e = spawnEnemy(w, Kind.Unseeing, 7, 3)!;
    e.age = 5;
    step(w, input({ aiming: true, ax: 1, az: 0 }), 0.5);
    w.player.battery = 0;
    e.litTorch = false;
    // уходим вбок, глядя туда же
    step(w, input({ aiming: true, ax: 1, az: 0.3 }), 0.2);
    expect(w.flags.has('broke:6')).toBe(false);
  });

  it('процессия: одиннадцать идут к радиоузлу; в луче стоят; дошедший гасит эфир', () => {
    const w = makeWorld(1, quiet());
    w.narrative.run([{ appear: 'procession' }]);
    const proc = w.enemies.filter((e) => e.active && e.kind === Kind.Unseeing && e.delay === 2);
    expect(proc.length).toBe(11);
    // игрок далеко и смотрит в другую сторону — они идут
    w.player.x = -30;
    w.player.z = -30;
    w.cheats.god = true;
    step(w, input(), 60);
    expect(w.flags.has('procReached')).toBe(true);
    expect(w.air).toBeLessThan(0.05);
  });

  it('стучать можно: за дверью отвечают, нарушения нет; открыть — удержанием, и это нарушение', () => {
    const w = makeWorld(1, quiet());
    const k = w.interactables.find((i) => i.id === 'knock:3')!;
    w.player.x = k.x;
    w.player.z = k.z;
    const log: SimEvent[] = [];
    step(w, input({ action: true }), 0.1, log);
    step(w, input(), 6, log);
    expect(log.some((e) => e.type === 'line' && e.s === 'n2.kn3')).toBe(true);
    expect(w.flags.has('broke:2')).toBe(false);
    expect(w.doorOpen[3]).toBe(false);
    step(w, input({ action: true }), 1.2, log);
    expect(w.flags.has('broke:2')).toBe(true);
    expect(w.doorOpen[3]).toBe(true);
  });

  it('перекличка: можно ответить за двенадцатый двор — нарушение пункта 5', () => {
    const w = makeWorld(1, { ...NIGHT2, waves: [] });
    w.flags.add('wave:4:end');
    step(w, input(), 1);
    const a = w.interactables.find((i) => i.id === 'answer')!;
    expect(a.enabled).toBe(true);
    w.player.x = a.x;
    w.player.z = a.z;
    const log: SimEvent[] = [];
    step(w, input({ action: true }), 2, log);
    step(w, input(), 16, log);
    expect(w.flags.has('broke:5')).toBe(true);
    expect(log.some((e) => e.type === 'line' && e.s === 'n2.answer2')).toBe(true);
  });
});
