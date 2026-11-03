import { describe, expect, it } from 'vitest';
import { NIGHT3A, NIGHT3B, YARD12 } from '../src/content/night3';
import { MENU_NIGHTS, NIGHTS } from '../src/content/nights';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { damageEnemy } from '../src/sim/combat';
import { WORLD, heightAt, isWater, water } from '../src/proc/terrain';
import type { World } from '../src/sim/world';
import { input, makeWorld, step, walkTo } from './helpers/sim';
import { slopeStep } from '../src/sim/player';
import { t } from '../src/i18n';

/** Встать на интерактив и удерживать действие, пока он не сработает. */
function use(w: World, id: string, secs = 4): void {
  const it = w.interactables.find((i) => i.id === id)!;
  expect(it, id).toBeTruthy();
  w.player.x = it.x;
  w.player.z = it.z + Math.min(0.5, it.r * 0.5);
  w.player.y = heightAt(w.player.x, w.player.z);
  // отпустить кнопку: короткое нажатие срабатывает по фронту
  step(w, input(), 1 / 60);
  step(w, input({ action: true }), secs);
}

describe('ночь третья: «Весна»', () => {
  it('ребёнок безоружен, начинает у двенадцатого двора, вода поднимается', () => {
    const w = makeWorld(3, NIGHT3A);
    expect(w.player.owned.some(Boolean)).toBe(false);
    expect(Math.hypot(w.player.x - 33, w.player.z - 30)).toBeLessThan(0.5);
    expect(water.level).toBeCloseTo(-1.9, 2);
    expect(isWater(w.player.x, w.player.z)).toBe(false);
    step(w, input(), 100);
    const mid = water.level;
    expect(mid).toBeGreaterThan(-1.9);
    step(w, input(), 80);
    expect(water.level).toBeCloseTo(-0.25, 2);
    expect(mid).toBeLessThan(water.level);
  });

  it('стрелять нечем: выстрел ничего не делает', () => {
    const w = makeWorld(3, NIGHT3A);
    const log = step(w, input({ aiming: true, ax: 1, fire: true }), 2);
    expect(log.some((e) => e.type === 'shot')).toBe(false);
  });

  it('глубокая вода топит', () => {
    const w = makeWorld(3, NIGHT3A);
    step(w, input(), 175);
    w.player.x = WORLD.pond.x;
    w.player.z = WORLD.pond.z;
    w.player.hp = 100;
    const log = step(w, input(), 3, [], false);
    expect(w.player.hp).toBeLessThan(100);
    expect(log.some((e) => e.type === 'drown')).toBe(true);
  });

  it('после стука к Звонарёвым — лодка; в лодке ночь кончается', () => {
    const w = makeWorld(3, NIGHT3A);
    expect(w.interactables.find((i) => i.id === 'boat')!.enabled).toBe(false);
    w.flags.add('k3');
    step(w, input(), 4);
    expect(w.flags.has('toBoat')).toBe(true);
    expect(w.interactables.find((i) => i.id === 'boat')!.enabled).toBe(true);
    use(w, 'boat', 7);
    expect(w.state).toBe('dawn');
  });

  it('за каждой дверью делают радио громче', () => {
    const w = makeWorld(3, NIGHT3A);
    const knocks = w.interactables.filter((i) => i.kind === 'knock');
    expect(knocks.length).toBe(6);
    let last = w.radioGain;
    for (const k of NIGHT3A.houses) {
      const it = knocks.find((i) => i.house === k.house)!;
      w.player.x = it.x;
      w.player.z = it.z;
      step(w, input({ action: true }), 0.1);
      step(w, input(), 7);
      expect(w.radioGain, `дом ${k.house}`).toBeGreaterThan(last);
      last = w.radioGain;
    }
    expect(w.flags.has('k3')).toBe(true);
  });
});

describe('ночь третья: «Щель»', () => {
  it('цепочка: «Весна» ведёт в «Щель», в меню только одна третья ночь', () => {
    expect(NIGHTS.find((n) => n.id === NIGHT3A.next)).toBe(NIGHT3B);
    expect(MENU_NIGHTS).toContain(NIGHT3A);
    expect(MENU_NIGHTS).not.toContain(NIGHT3B);
  });

  it('радио мертво с начала, но рассудок не съедает тишина эфира', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
    expect(w.deadAir).toBe(true);
    const s0 = w.player.sanity;
    step(w, input(), 20);
    // темнота подтачивает как обычно (−0.32/с), но без штрафа мёртвого эфира (−1.1/с)
    expect(w.player.sanity).toBeGreaterThanOrEqual(s0 - 8);
  });

  it('пруд высох: развалины двенадцатого двора на суше', () => {
    makeWorld(4, NIGHT3B);
    expect(isWater(YARD12.x, YARD12.z)).toBe(false);
    expect(isWater(WORLD.pond.x, WORLD.pond.z)).toBe(false);
  });

  it('крик проявляет существ и пугает шептунов; перезарядка', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
    const e = spawnEnemy(w, Kind.Whisperer, w.player.x + 5, w.player.z)!;
    const log = step(w, input({ voice: true }), 1 / 60);
    expect(log.some((x) => x.type === 'shout')).toBe(true);
    expect(e.reveal).toBeGreaterThan(2);
    expect(e.litTime).toBeGreaterThan(1);
    const again = step(w, input({ voice: true }), 1 / 60);
    expect(again.some((x) => x.type === 'shout')).toBe(false);
  });

  it('фонарь садится, батарейки заряжают', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
    const b0 = w.player.battery;
    step(w, input(), 60);
    expect(w.player.battery).toBeLessThan(b0);
    const b1 = w.player.battery;
    w.director.dropPickup(4, 0, w.player.x, w.player.z);
    step(w, input(), 0.5);
    expect(w.player.battery).toBeGreaterThan(b1);
  });

  it('Хор: выстрелы кормят, тишина убивает', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
    const c = spawnEnemy(w, Kind.Choir, w.player.x + 40, w.player.z)!;
    const hp0 = c.hp;
    damageEnemy(w, c, 40, 0, 0);
    expect(c.hp).toBeGreaterThan(hp0);
    expect(c.active).toBe(true);
    w.player.lastNoiseT = w.time;
    step(w, input(), 30);
    expect(c.active).toBe(false);
    expect(w.flags.has('choirDown')).toBe(true);
  });

  it('буквы собираются по одной и без повторов', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: NIGHT3B.beats.filter((b) => b.id !== 'nakaz') });
    use(w, 'letter1', 0.2);
    expect(w.letters).toBe('В');
    expect(w.flags.has('letters:1')).toBe(true);
    use(w, 'letter1', 0.2);
    expect(w.letters).toBe('В');
    use(w, 'letter2', 0.2);
    expect(w.letters).toBe('ВА');
  });

  it('три концовки: каждая ставит свой флаг и кончает ночь', () => {
    for (const [id, flag] of [['open', 'end:flood'], ['throw', 'end:loop'], ['name', 'end:name']] as const) {
      // Хор к этому моменту уже замолчал — сцену его появления не повторяем
      const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: NIGHT3B.beats.filter((b) => b.id !== 'choir' && b.id !== 'ravine') });
      w.flags.add('choirDown');
      for (const l of ['letters:1', 'letters:2', 'letters:3', 'letters:4']) w.flags.add(l);
      step(w, input(), 0.5);
      use(w, id, 8);
      expect(w.flags.has(flag), id).toBe(true);
      expect(w.state, id).toBe('dawn');
      if (id === 'name') expect(w.flags.has('broke:5')).toBe(true);
    }
  });

  it('имя нельзя произнести, пока не собраны буквы и не замолчал Хор', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [] });
    step(w, input(), 0.5);
    expect(w.interactables.find((i) => i.id === 'name')!.enabled).toBe(false);
    w.flags.add('choirDown');
    step(w, input(), 0.5);
    expect(w.interactables.find((i) => i.id === 'name')!.enabled).toBe(false);
  });

  it('у каждой концовки есть сцена, заголовок и подпись', () => {
    expect(NIGHT3B.endings!.map((e) => e.flag).sort()).toEqual(['end:flood', 'end:loop', 'end:name']);
    for (const e of NIGHT3B.endings!) expect(e.dawn.length).toBeGreaterThan(0);
  });
});

describe('Щель: рельеф', () => {
  const C = WORLD.crevice;
  const at = (t: number): [number, number] => [C.ax + (C.bx - C.ax) * t, C.az + (C.bz - C.az) * t];

  it('из деревни по пологому спуску доходят до заслонки и до всех мест концовок', () => {
    for (const id of ['letter3', 'letter4', 'open', 'throw', 'name']) {
      const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
      w.cheats.freeze = true;
      w.player.x = 0;
      w.player.z = -14;
      const route: [number, number][] = [at(-0.25), at(0.1), at(0.4), at(0.7), at(0.92)];
      for (const [x, z] of route) walkTo(w, x, z, [], 30);
      const it = w.interactables.find((i) => i.id === id)!;
      walkTo(w, it.x, it.z, [], 15);
      expect(Math.hypot(w.player.x - it.x, w.player.z - it.z), id).toBeLessThan(it.r);
    }
  });

  it('по отвесной стене Щели не выбраться и не «взлететь»', () => {
    const w = makeWorld(4, { ...NIGHT3B, waves: [], beats: [] });
    w.cheats.freeze = true;
    const [x, z] = at(0.6);
    w.player.x = x;
    w.player.z = z;
    // перпендикуляр к Щели
    const nx = C.bz - C.az;
    const nz = -(C.bx - C.ax);
    const l = Math.hypot(nx, nz);
    const y0 = heightAt(x, z);
    step(w, input({ mx: nx / l, mz: nz / l }), 4);
    expect(w.player.y - y0).toBeLessThan(2);
  });

  it('в гору медленнее, чем по ровному', () => {
    const flat = slopeStep(0, 0, 0.1, 0);
    expect(flat[0]).toBeCloseTo(0.1, 3);
    // подъём по склону Щели к верховью
    const [ax, az] = at(-0.25);
    const [bx, bz] = at(-0.05);
    const d = Math.hypot(bx - ax, bz - az);
    const up = slopeStep(ax, az, ax + ((bx - ax) / d) * 0.1, az + ((bz - az) / d) * 0.1);
    expect(Math.hypot(up[0] - ax, up[1] - az)).toBeLessThan(0.1);
  });
});

describe('кат-сцены успевают за субтитрами', () => {
  it('каждый план длится не меньше, чем читается его реплика', () => {
    for (const n of NIGHTS) {
      const shots = [...n.intro, ...n.dawn, ...(n.endings ?? []).flatMap((e) => e.dawn)];
      for (const s of shots) {
        if (!s.line) continue;
        const len = t(s.line).length;
        expect(s.dur, `${n.id}: ${s.line}`).toBeGreaterThanOrEqual(Math.max(4, len * 0.065 + 1));
      }
    }
  });

  it('реплика перед рассветом успевает прозвучать до начала сцены', () => {
    for (const n of NIGHTS) {
      for (const x of n.extras) {
        const i = x.effects.findIndex((e) => 'dawn' in e);
        if (i < 0) continue;
        const before = x.effects.slice(0, i);
        if (!before.some((e) => 'line' in e)) continue;
        const wait = before.reduce((a, e) => a + ('wait' in e ? e.wait : 0), 0);
        expect(wait, `${n.id}: ${x.id}`).toBeGreaterThanOrEqual(3.6);
      }
    }
  });
});
