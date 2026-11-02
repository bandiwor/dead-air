import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { NIGHT1 } from '../src/content/night1';
import { emptyInput, type InputFrame, type SimEvent } from '../src/sim/types';
import { doorOf } from '../src/proc/layout';
import { interiorOf } from '../src/content/interiors';
import { toWorld } from '../src/sim/houses';
import { Kind } from '../src/content/enemies';

function step(w: World, f: InputFrame, secs: number, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < secs * 60; i++) {
    w.step(f, 1 / 60);
    for (let k = 0; k < w.eventCount; k++) log.push({ ...w.events[k]! });
    w.clearEvents();
    w.player.hp = 100;
  }
  return log;
}

function walkTo(w: World, x: number, z: number, log: SimEvent[], max = 20): void {
  const f = emptyInput();
  for (let i = 0; i < max * 60; i++) {
    const p = w.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) break;
    f.mx = dx / d;
    f.mz = dz / d;
    step(w, f, 1 / 60, log);
  }
}

const press = (w: World, log: SimEvent[]): void => {
  const f = emptyInput();
  f.action = true;
  step(w, f, 0.1, log);
  step(w, emptyInput(), 0.1, log);
};

describe('сценарий ночи', () => {
  it('Наказ показывается в начале', () => {
    const w = new World({ seed: 1, night: NIGHT1, scare: 1 });
    const log = step(w, emptyInput(), 1);
    expect(log.some((e) => e.type === 'note' && e.s === 'note.nakaz')).toBe(true);
  });

  it('дом у колодца: дверь открывается, обрез внутри, ловушка со скримером', () => {
    const w = new World({ seed: 2, night: NIGHT1, scare: 1 });
    const log: SimEvent[] = [];
    w.flags.add('wave:1:end');
    step(w, emptyInput(), 5, log);
    expect(w.doorOpen[2]).toBe(true);
    const h = w.layout.houses[2]!;
    const d = doorOf(h, 1.2);
    const [ax, az] = toWorld(h, 4.5, 0);
    walkTo(w, ax, az, log);
    const [bx, bz] = toWorld(h, 4.5, 4);
    walkTo(w, bx, bz, log);
    walkTo(w, d.x, d.z, log);
    const [ix, iz] = toWorld(h, 0, 1.2);
    walkTo(w, ix, iz, log);
    const [sx, sz] = toWorld(h, interiorOf(2)!.spot[0], interiorOf(2)!.spot[1] + 0.7);
    walkTo(w, sx, sz, log);
    expect(w.playerHouse).toBe(2);
    expect(w.flags.has('got:shotgun')).toBe(true);
    step(w, emptyInput(), 3, log);
    expect(w.doorOpen[2]).toBe(false);
    step(w, emptyInput(), 6, log);
    expect(log.some((e) => e.type === 'scare' && e.s === 'jumpscare')).toBe(true);
    expect(w.doorOpen[2]).toBe(true);
  });

  it('стук нарушает Наказ и открывает дом; зеркало прячет кого-то за спиной', () => {
    const w = new World({ seed: 3, night: NIGHT1, scare: 1 });
    const log: SimEvent[] = [];
    const h = w.layout.houses[1]!;
    const d = doorOf(h, 0.9);
    walkTo(w, d.x, d.z, log);
    press(w, log);
    expect(w.flags.has('broke:2')).toBe(true);
    step(w, emptyInput(), 6, log);
    expect(w.doorOpen[1]).toBe(true);
    const [mx, mz] = toWorld(h, 0, -1.2);
    walkTo(w, d.x, d.z - 0, log);
    walkTo(w, mx, mz, log);
    expect(w.playerHouse).toBe(1);
    press(w, log);
    expect(log.some((e) => e.type === 'note' && e.s === 'note.mirror')).toBe(true);
    step(w, emptyInput(), 1, log);
    expect(w.enemies.some((e) => e.active && e.kind === Kind.Apparition && e.state === 2)).toBe(true);
    // поворачиваемся — лицо
    const f = emptyInput();
    f.aiming = true;
    f.ax = -Math.cos(w.player.yaw);
    f.az = -Math.sin(w.player.yaw);
    step(w, f, 1, log);
    expect(log.filter((e) => e.type === 'scare' && e.s === 'jumpscare').length).toBeGreaterThan(0);
  });

  it('пристань: позвать — скример, обрывок, Немой из воды', () => {
    const w = new World({ seed: 4, night: NIGHT1, scare: 1 });
    const log: SimEvent[] = [];
    w.time = 329;
    step(w, emptyInput(), 2, log);
    const pier = w.interactables.find((i) => i.id === 'pier')!;
    expect(pier.enabled).toBe(true);
    walkTo(w, 11.5, 19, log);
    walkTo(w, pier.x, pier.z, log);
    const f = emptyInput();
    f.action = true;
    step(w, f, 2, log);
    step(w, emptyInput(), 6, log);
    expect(w.flags.has('broke:4')).toBe(true);
    expect(log.some((e) => e.type === 'scare' && e.s === 'jumpscare')).toBe(true);
    expect(w.fragments).toBeGreaterThan(0);
    expect(w.enemies.some((e) => e.active && e.kind === Kind.Mute)).toBe(true);
  });

  it('рубильник: эфир умирает, убитые в тишине шептуны договаривают', () => {
    const w = new World({ seed: 5, night: NIGHT1, scare: 1 });
    const log: SimEvent[] = [];
    const sw = w.interactables.find((i) => i.id === 'switch')!;
    walkTo(w, sw.x, sw.z, log);
    press(w, log);
    step(w, emptyInput(), 0.5, log);
    expect(w.deadAir).toBe(true);
    expect(w.flags.has('broke:1')).toBe(true);
  });
});
