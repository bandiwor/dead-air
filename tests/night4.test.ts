import { describe, expect, it } from 'vitest';
import { MENU_NIGHTS, NIGHTS, resolveNight } from '../src/content/nights';
import { NIGHT4F, NIGHT4L, NIGHT4N } from '../src/content/night4';
import type { NightDef } from '../src/content/night';
import type { World } from '../src/sim/world';
import { input, makeWorld, step } from './helpers/sim';
import { houseAt } from '../src/sim/houses';
import { isWater } from '../src/proc/terrain';

function use(w: World, id: string, secs: number): void {
  const it = w.interactables.find((i) => i.id === id)!;
  w.player.x = it.x;
  w.player.z = it.z;
  step(w, input(), 1 / 60);
  step(w, input({ action: true }), secs);
}

describe('ночь четвёртая: развилка по концовке третьей', () => {
  it('в меню одна четвёртая ночь; вариант выбирает последняя концовка', () => {
    const menu = MENU_NIGHTS.filter((n) => n.index === 4);
    expect(menu).toEqual([NIGHT4L]);
    const i4 = NIGHTS.indexOf(NIGHT4L);
    expect(NIGHTS[resolveNight(i4, 'loop')]).toBe(NIGHT4L);
    expect(NIGHTS[resolveNight(i4, 'flood')]).toBe(NIGHT4F);
    expect(NIGHTS[resolveNight(i4, 'name')]).toBe(NIGHT4N);
    expect(NIGHTS[resolveNight(i4, '')]).toBe(NIGHT4L);
    // у ночей без развилки ничего не меняется
    expect(resolveNight(0, 'flood')).toBe(0);
  });
});

describe('«Опять»: петля', () => {
  it('выключить радио самому под утро — выйти из петли', () => {
    const w = makeWorld(1, { ...NIGHT4L, waves: [] } as NightDef);
    step(w, input(), 1);
    w.time = 361;
    step(w, input(), 0.2);
    use(w, 'switch', 0.2);
    step(w, input(), 0.5);
    expect(w.flags.has('loopBroken')).toBe(true);
  });

  it('рано выключить — ещё не выход', () => {
    const w = makeWorld(1, { ...NIGHT4L, waves: [] } as NightDef);
    step(w, input(), 1);
    use(w, 'switch', 0.2);
    step(w, input(), 0.5);
    expect(w.flags.has('loopBroken')).toBe(false);
  });
});

describe('«Стук»: стучат к вам', () => {
  it('разлившаяся вода — лужи по деревне: на суше, не в домах, в них можно заглянуть', () => {
    const w = makeWorld(1, { ...NIGHT4F, waves: [], beats: [] });
    for (const p of NIGHT4F.reflect!.puddles) {
      expect(isWater(p.x, p.z), `${p.x},${p.z}`).toBe(false);
      expect(houseAt(w.layout.houses, p.x, p.z), `${p.x},${p.z}`).toBe(-1);
      expect(w.waterNear(p.x, p.z)).toBe(true);
    }
  });

  it('стук — несколько секунд, чтобы открыть; открыть — нарушение и «милость»', () => {
    const w = makeWorld(1, { ...NIGHT4F, waves: [] });
    w.cheats.god = true;
    step(w, input(), 41);
    const let1 = w.interactables.find((i) => i.id === 'let1')!;
    expect(let1.enabled).toBe(true);
    use(w, 'let1', 2);
    expect(w.flags.has('mercy')).toBe(true);
    expect(w.flags.has('broke:1')).toBe(true);
  });

  it('не открыли — через 14 с дверь «закрывается» сама', () => {
    const w = makeWorld(1, { ...NIGHT4F, waves: [] });
    w.cheats.god = true;
    step(w, input(), 41);
    step(w, input(), 15);
    expect(w.interactables.find((i) => i.id === 'let1')!.enabled).toBe(false);
    expect(w.flags.has('mercy')).toBe(false);
  });
});

describe('«Отклик»: выслушать одиннадцать', () => {
  it('одиннадцать стоят у дверей и у столба; выслушали всех — на пристани ждут; подошли — утро', () => {
    const w = makeWorld(1, NIGHT4N);
    step(w, input(), 1);
    expect(w.enemies.filter((e) => e.active).length).toBe(11);
    expect(w.interactables.find((i) => i.id === 'mother')!.enabled).toBe(false);
    for (let i = 0; i < 11; i++) {
      use(w, `listen${i}`, 1.5);
      step(w, input(), 0.2);
      expect(w.flags.has(`heard${i}`), `listen${i}`).toBe(true);
    }
    step(w, input(), 3);
    expect(w.interactables.find((i) => i.id === 'mother')!.enabled).toBe(true);
    use(w, 'mother', 2.5);
    step(w, input(), 9);
    expect(w.state).toBe('dawn');
  });

  it('оружия нет и волн нет', () => {
    expect(NIGHT4N.startWeapons).toEqual([]);
    expect(NIGHT4N.waves).toEqual([]);
  });
});

describe('вода в четвёртой ночи не отрезает деревню', () => {
  it('площадь, крыльцо радиоузла и двери домов — сухие до самого утра', () => {
    const w = makeWorld(1, { ...NIGHT4F, waves: [], beats: [] });
    w.time = 419;
    step(w, input(), 0.1);
    const hd = w.layout.hutDoor;
    expect(isWater(hd.x, hd.z)).toBe(false);
    expect(isWater(0, 2)).toBe(false);
    for (const h of w.layout.houses) {
      const fx = h.x + Math.sin(h.rot) * (h.d / 2 + 1.5);
      const fz = h.z + Math.cos(h.rot) * (h.d / 2 + 1.5);
      expect(isWater(fx, fz), `дом ${h.id}`).toBe(false);
    }
  });
});
