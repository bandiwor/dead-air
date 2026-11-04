import { describe, expect, it } from 'vitest';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import type { SimEvent } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { input, quietWorld, step } from './helpers/sim';

function flareAt(w: World, x: number, z: number): void {
  const f = w.flares.find((x) => !x.active)!;
  f.active = true;
  f.x = x;
  f.z = z;
  f.y = 0;
  f.t = 0;
  f.life = 10;
}

describe('огонь: шептуны горят', () => {
  it('в огне ракеты вспыхивают, горят и после того, как выбежали, и сгорают дотла', () => {
    const w = quietWorld(1);
    w.player.x = 30;
    w.player.z = 30;
    const e = spawnEnemy(w, Kind.Whisperer, 0, 0)!;
    flareAt(w, 1, 0);
    const log: SimEvent[] = [];
    step(w, input(), 0.2, log);
    expect(e.burn).toBeGreaterThan(0);
    expect(log.some((x) => x.type === 'ignite')).toBe(true);
    // ракета гаснет — огонь на теле ещё держится
    w.flares.forEach((f) => (f.active = false));
    step(w, input(), 0.5, log);
    expect(e.burn).toBeGreaterThan(0);
    step(w, input(), 3, log);
    const kill = log.find((x) => x.type === 'kill');
    expect(kill).toBeTruthy();
    expect(kill!.b).toBe(2); // сгорел
  });

  it('огонь перекидывается на тех, кто ползёт вплотную', () => {
    const w = quietWorld(2);
    w.player.x = 30;
    w.player.z = 30;
    const a = spawnEnemy(w, Kind.Whisperer, 0, 0)!;
    const b = spawnEnemy(w, Kind.Whisperer, 0.5, 0)!;
    a.burn = 2;
    // держим рядом (без движения), пока не перекинется
    w.cheats.freeze = false;
    let spread = false;
    for (let i = 0; i < 120 && !spread; i++) {
      b.x = a.x + 0.5;
      b.z = a.z;
      step(w, input(), 1 / 60);
      spread = b.burn > 0;
    }
    expect(spread).toBe(true);
  });

  it('Немой и Невидевший от ракеты не загораются', () => {
    const w = quietWorld(3);
    w.player.x = 30;
    w.player.z = 30;
    const m = spawnEnemy(w, Kind.Mute, 0, 0)!;
    const u = spawnEnemy(w, Kind.Unseeing, 2, 0)!;
    flareAt(w, 1, 0);
    step(w, input(), 1);
    expect(m.burn).toBe(0);
    expect(u.burn).toBe(0);
  });
});
