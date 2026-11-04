import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { NIGHT2 } from '../src/content/night2';
import { emptyInput, type InputFrame, type SimEvent } from '../src/sim/types';
import { doorOf } from '../src/proc/layout';
import { toWorld } from '../src/sim/houses';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';

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

describe('ночь вторая', () => {
  it('лампа: бобина заблокирована, пока не нарушишь «не открывать двери»', () => {
    const w = new World({ seed: 11, night: NIGHT2, scare: 1 });
    const log: SimEvent[] = [];
    w.flags.add('wave:1:end');
    step(w, emptyInput(), 3, log);
    expect(w.flags.has('reelLocked')).toBe(true);
    // у радиоузла бобину сменить нельзя
    const hd = w.layout.hutDoor;
    walkTo(w, hd.x, hd.z, log);
    w.air = 0.5;
    step(w, emptyInput(), 0.1, log);
    expect(w.player.canReel).toBe(false);
    // открыть первый дом (нарушение пункта 2), взять лампу
    const h = w.layout.houses[0]!;
    const d = doorOf(h, 0.9);
    walkTo(w, d.x + 3, d.z + 2, log);
    walkTo(w, d.x, d.z, log);
    const f = emptyInput();
    f.action = true;
    // нажатие — постучать (можно), удержание — открыть (нарушение пункта 2)
    step(w, f, 0.1, log);
    expect(w.flags.has('broke:2')).toBe(false);
    step(w, emptyInput(), 0.2, log);
    step(w, f, 1.2, log);
    step(w, emptyInput(), 3, log);
    expect(w.flags.has('broke:2')).toBe(true);
    expect(w.doorOpen[0]).toBe(true);
    const [ix, iz] = toWorld(h, 0, 1.2);
    walkTo(w, ix, iz, log);
    const [lx, lz] = toWorld(h, 1.6, -1.0);
    walkTo(w, lx, lz, log);
    step(w, f, 1.2, log);
    step(w, emptyInput(), 4, log);
    expect(w.flags.has('gotLamp')).toBe(true);
    expect(w.flags.has('reelLocked')).toBe(false);
    expect(log.some((e) => e.type === 'scare' && e.s === 'jumpscare')).toBe(true);
  });

  it('Невидевший замирает в луче и идёт, когда отвернулись', () => {
    const w = new World({ seed: 12, night: NIGHT2, scare: 1 });
    w.player.x = 3;
    w.player.z = 3;
    const e = spawnEnemy(w, Kind.Unseeing, 11, 3)!;
    const look = emptyInput();
    look.aiming = true;
    look.ax = 1;
    look.az = 0;
    step(w, look, 1);
    const x1 = e.x;
    step(w, look, 1);
    expect(Math.abs(e.x - x1)).toBeLessThan(0.01);
    const away = emptyInput();
    away.aiming = true;
    away.ax = -1;
    away.az = 0;
    step(w, away, 0.5);
    expect(e.x).toBeLessThan(x1 - 0.5);
  });

  it('ночь проходит без исключений', () => {
    const w = new World({ seed: 13, night: NIGHT2, scare: 1 });
    const f = emptyInput();
    for (let i = 0; i < 60 * 300; i++) {
      f.mx = Math.cos(i * 0.004);
      f.mz = Math.sin(i * 0.005);
      f.aiming = true;
      f.ax = Math.cos(i * 0.01);
      f.az = Math.sin(i * 0.01);
      f.fire = i % 30 < 15;
      w.step(f, 1 / 60);
      w.clearEvents();
      w.player.hp = 100;
    }
    expect(w.flags.has('wave:2:start')).toBe(true);
  });
});
