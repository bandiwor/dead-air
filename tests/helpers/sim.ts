import { World } from '../../src/sim/world';
import { emptyInput, type InputFrame, type SimEvent } from '../../src/sim/types';
import type { NightDef } from '../../src/content/night';
import { NIGHT1 } from '../../src/content/night1';

/** Общие помощники для тестов симуляции. */
export function makeWorld(seed = 1, night: NightDef = NIGHT1): World {
  return new World({ seed, night, scare: 1 });
}

export function step(w: World, f: InputFrame, secs: number, log: SimEvent[] = [], god = true): SimEvent[] {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    w.step(f, 1 / 60);
    for (let k = 0; k < w.eventCount; k++) log.push({ ...w.events[k]! });
    w.clearEvents();
    if (god) w.player.hp = 100;
  }
  return log;
}

export function input(o: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...o };
}

/** Тихий мир: без волн, сценария и случайных пугалок — для изолированных проверок механик. */
export function quietWorld(seed = 1, base: NightDef = NIGHT1): World {
  const night: NightDef = { ...base, waves: [], beats: [] };
  const w = new World({ seed, night, scare: 0 });
  // Режиссёр не будет пугать: отодвигаем время следующего бита
  (w.director as unknown as { nextScareAt: number }).nextScareAt = 1e9;
  return w;
}

export function walkTo(w: World, x: number, z: number, log: SimEvent[] = [], max = 20): boolean {
  const f = emptyInput();
  for (let i = 0; i < max * 60; i++) {
    const p = w.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    f.mx = dx / d;
    f.mz = dz / d;
    step(w, f, 1 / 60, log);
  }
  return false;
}
