import { describe, expect, it } from 'vitest';
import { NIGHTS } from '../src/content/nights';
import { World } from '../src/sim/world';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { isWater } from '../src/proc/terrain';
import { houseAt } from '../src/sim/houses';
import { PLAYER_R } from '../src/sim/player';

/** Бот: ходит по деревне кругами, стреляет во все стороны, меняет бобины, когда рядом. */
function playNight(seed: number, nightIdx: number): { w: World; log: SimEvent[]; hash: number } {
  const night = NIGHTS[nightIdx]!;
  const w = new World({ seed, night, scare: 1 });
  const log: SimEvent[] = [];
  const f = emptyInput();
  for (let i = 0; i < (night.duration + 5) * 60; i++) {
    const a = i * 0.003;
    f.mx = Math.cos(a) * 0.8;
    f.mz = Math.sin(a * 1.7) * 0.8;
    f.aiming = true;
    f.ax = Math.cos(i * 0.02);
    f.az = Math.sin(i * 0.02);
    f.fire = i % 20 < 10;
    f.action = i % 600 < 200;
    f.throw = i % 1500 === 700;
    f.swap = i % 2400 === 1200;
    w.step(f, 1 / 60);
    for (let k = 0; k < w.eventCount; k++) {
      const e = w.events[k]!;
      if (e.type === 'dawn' || e.type === 'waveEnd' || e.type === 'waveStart' || e.type === 'note') log.push({ ...e });
    }
    w.clearEvents();
    w.player.hp = 100;
    if (w.state !== 'play') break;
  }
  return { w, log, hash: w.hash() };
}

describe('ночи целиком', () => {
  NIGHTS.forEach((night, idx) => {
    it(`${night.id}: доходит до рассвета, все волны стартуют`, () => {
      const { w, log } = playNight(77, idx);
      expect(w.state).toBe('dawn');
      expect(log.some((e) => e.type === 'dawn')).toBe(true);
      expect(log.filter((e) => e.type === 'waveStart').length).toBe(night.waves.length);
      // на рассвете все существа исчезли
      expect(w.enemies.some((e) => e.active)).toBe(false);
    });

    it(`${night.id}: полный прогон детерминирован`, () => {
      expect(playNight(5, idx).hash).toBe(playNight(5, idx).hash);
    });

    it(`${night.id}: особые действия — на суше, к ним можно подойти`, () => {
      const w = new World({ seed: 1, night, scare: 1 });
      for (const it of w.interactables) {
        if (it.house >= 0) continue;
        expect(isWater(it.x, it.z), it.id).toBe(false);
        // в радиусе действия есть точка, где может стоять игрок
        let ok = false;
        for (let a = 0; a < 24 && !ok; a++) {
          for (const r of [0, 0.4, 0.8]) {
            if (r > it.r - 0.1) continue;
            const pos = { x: it.x + Math.cos((a / 24) * 6.283) * r, z: it.z + Math.sin((a / 24) * 6.283) * r };
            if (isWater(pos.x, pos.z) || houseAt(w.layout.houses, pos.x, pos.z) >= 0) continue;
            const p2 = { ...pos };
            w.statics.resolve(p2, PLAYER_R);
            if (Math.hypot(p2.x - pos.x, p2.z - pos.z) < 0.05) ok = true;
          }
        }
        expect(ok, it.id).toBe(true);
      }
    });
  });
});
