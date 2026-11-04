import { describe, expect, it } from 'vitest';
import { input, quietWorld, step, walkTo } from './helpers/sim';
import { WEAPONS, weaponIndex } from '../src/content/weapons';
import { Kind } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/enemies';
import { explode, killEnemy } from '../src/sim/combat';
import { WORLD } from '../src/proc/terrain';
import { NIGHT2 } from '../src/content/night2';
import type { SimEvent } from '../src/sim/types';

/** Ставит игрока в точку и смотрит вдоль +x. */
function place(w: ReturnType<typeof quietWorld>, x: number, z: number): void {
  w.player.x = x;
  w.player.z = z;
  w.player.yaw = 0;
}
const aimX = input({ aiming: true, ax: 1, az: 0 });

describe('оружие', () => {
  it('выстрел тратит патрон, ставит паузу и шумит', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const log = step(w, input({ aiming: true, ax: 1, fire: true }), 1 / 60);
    expect(w.player.mag[0]).toBe(WEAPONS[0]!.mag - 1);
    expect(w.player.cooldown).toBeGreaterThan(0);
    expect(log.some((e) => e.type === 'shot')).toBe(true);
    expect(log.some((e) => e.type === 'tracer')).toBe(true);
  });

  it('пустой магазин: перезарядка из запаса; без запаса — щелчок', () => {
    const w = quietWorld();
    place(w, 3, 3);
    w.player.mag[0] = 0;
    const r0 = w.player.reserve[0]!;
    step(w, input({ fire: true, aiming: true, ax: 1 }), 1 / 60);
    expect(w.player.reload).toBeGreaterThan(0);
    step(w, input(), WEAPONS[0]!.reload + 0.1);
    expect(w.player.mag[0]).toBe(WEAPONS[0]!.mag);
    expect(w.player.reserve[0]).toBe(r0 - WEAPONS[0]!.mag);
    w.player.mag[0] = 0;
    w.player.reserve[0] = 0;
    const log = step(w, input({ fire: true, aiming: true, ax: 1 }), 0.05);
    expect(log.some((e) => e.type === 'dryfire')).toBe(true);
  });

  it('смена оружия — только на имеющееся', () => {
    const w = quietWorld();
    expect(w.player.owned.filter(Boolean).length).toBe(2);
    step(w, input({ swap: true }), 1 / 60);
    expect(w.player.weapon).toBe(weaponIndex('flaregun'));
    step(w, input(), 0.4);
    step(w, input({ swap: true }), 1 / 60);
    expect(w.player.weapon).toBe(weaponIndex('revolver'));
  });

  it('пуля убивает шептуна на линии огня, стена его закрывает', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const e = spawnEnemy(w, Kind.Whisperer, 8, 3)!;
    e.speed = 0;
    const log: SimEvent[] = [];
    for (let i = 0; i < 10 && e.active; i++) step(w, input({ aiming: true, ax: 1, fire: true }), 0.32, log);
    expect(e.active).toBe(false);
    expect(log.some((x) => x.type === 'kill')).toBe(true);
  });

  it('ракетница: горящая ракета на земле', () => {
    const w = quietWorld();
    place(w, 3, 3);
    w.player.weapon = weaponIndex('flaregun');
    step(w, input({ aiming: true, ax: 1, fire: true }), 1 / 60);
    step(w, input(), 2);
    expect(w.flares.some((f) => f.active)).toBe(true);
  });

  it('шашка взрывается, бьёт по радиусу и поджигает бочки цепочкой', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const near = spawnEnemy(w, Kind.Whisperer, -5, 2.5)!;
    const far = spawnEnemy(w, Kind.Whisperer, -30, -30)!;
    const log: SimEvent[] = [];
    explode(w, -6, 2.5, 5.5, 170);
    step(w, input(), 1, log);
    expect(near.active).toBe(false);
    expect(far.active).toBe(true);
    expect(w.barrels[0]!.alive).toBe(false); // бочка в (−6, 2.5)
    expect(log.filter((e) => e.type === 'explosion').length).toBeGreaterThanOrEqual(1);
  });

  it('взрыв рядом ранит и самого игрока', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const hp = w.player.hp;
    explode(w, 4, 3, 5, 150);
    expect(w.player.hp).toBeLessThan(hp);
  });
});

describe('игрок', () => {
  it('не заходит в воду, но ходит по пристани', () => {
    const w = quietWorld();
    walkTo(w, WORLD.pier.x0 - 1, (WORLD.pier.z0 + WORLD.pier.z1) / 2);
    expect(walkTo(w, WORLD.pier.x1 - 1, (WORLD.pier.z0 + WORLD.pier.z1) / 2)).toBe(true);
    w.player.x = WORLD.pond.x - WORLD.pond.r - 1;
    w.player.z = WORLD.pond.z - 4;
    walkTo(w, WORLD.pond.x, WORLD.pond.z - 4, [], 3);
    expect(w.player.y).toBeGreaterThan(WORLD.waterLevel);
  });

  it('смерть: hp 0 → состояние dead, событие', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const e = spawnEnemy(w, Kind.Mute, 3.6, 3)!;
    e.atkCd = 0;
    const log = step(w, input(), 30, [], false);
    expect(w.state).toBe('dead');
    expect(log.some((x) => x.type === 'playerDeath')).toBe(true);
  });

  it('аптечка лечит, но не выше 100', () => {
    const w = quietWorld();
    place(w, 3, 3);
    w.player.hp = 80;
    w.director.dropPickup(3, 0, 3.5, 3);
    step(w, input(), 0.1, [], false);
    expect(w.player.hp).toBe(100);
  });

  it('находка оружия открывает его, переключает и ставит флаг', () => {
    const w = quietWorld();
    place(w, 3, 3);
    w.director.dropPickup(1, weaponIndex('rifle'), 3.5, 3);
    step(w, input(), 0.1);
    expect(w.player.owned[weaponIndex('rifle')]).toBe(true);
    expect(w.player.weapon).toBe(weaponIndex('rifle'));
    expect(w.flags.has('got:rifle')).toBe(true);
  });

  it('рассудок падает в темноте и восстанавливается у фонаря', () => {
    const w = quietWorld();
    place(w, 40, 40);
    const s0 = w.player.sanity;
    step(w, input(), 5);
    expect(w.player.sanity).toBeLessThan(s0);
    place(w, 1.5, 1.5);
    const s1 = w.player.sanity;
    step(w, input(), 5);
    expect(w.player.sanity).toBeGreaterThan(s1);
  });

  it('бобина: эфир садится, смена у радиоузла возвращает его', () => {
    const w = quietWorld();
    w.air = 0.2;
    const d = w.layout.hutDoor;
    walkTo(w, d.x, d.z);
    step(w, input({ action: true }), 3);
    expect(w.air).toBeGreaterThan(0.9);
  });

  it('мёртвый эфир наступает, когда бобина кончилась', () => {
    const w = quietWorld();
    w.air = 0.001;
    const log = step(w, input(), 0.2);
    expect(w.deadAir).toBe(true);
    expect(log.some((e) => e.type === 'deadAir')).toBe(true);
  });
});

describe('существа', () => {
  it('шептун замедляется в луче фонаря', () => {
    const a = quietWorld(1);
    const b = quietWorld(1);
    // открытое место между площадью и прудом
    place(a, 3, 9);
    place(b, 3, 9);
    const ea = spawnEnemy(a, Kind.Whisperer, 13, 9)!;
    const eb = spawnEnemy(b, Kind.Whisperer, 13, 9)!;
    step(a, aimX, 0.8);
    step(b, input({ aiming: true, ax: -1 }), 0.8);
    expect(13 - ea.x).toBeGreaterThan(0.3);
    expect(13 - ea.x).toBeLessThan(13 - eb.x);
  });

  it('Немой идёт на шум выстрела', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const e = spawnEnemy(w, Kind.Mute, -15, 3)!;
    step(w, input({ aiming: true, ax: -1, fire: true }), 0.1);
    const d0 = Math.hypot(e.x - 3, e.z - 3);
    step(w, input(), 3);
    expect(Math.hypot(e.x - 3, e.z - 3)).toBeLessThan(d0);
  });

  it('Отголосок идёт по вашему следу и рассеивается, если стоять', () => {
    const w = quietWorld();
    place(w, -5, 3);
    walkTo(w, 8, 3);
    walkTo(w, 8, -3);
    const e = spawnEnemy(w, Kind.Echo, 0, 0)!;
    // он стоит на вашем недавнем пути
    expect(Math.abs(e.z - 3) < 0.5 || Math.abs(e.x - 8) < 0.5).toBe(true);
    const x0 = e.x;
    const z0 = e.z;
    step(w, input(), 1);
    expect(Math.hypot(e.x - x0, e.z - z0)).toBeLessThan(0.01);
    step(w, input(), 2);
    expect(e.active).toBe(false);
  });

  it('явление исчезает, если посветить на него', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const e = spawnEnemy(w, Kind.Apparition, 10, 3)!;
    e.tx = 30;
    const log = step(w, aimX, 1);
    expect(e.active).toBe(false);
    expect(log.some((x) => x.type === 'vanish')).toBe(true);
  });

  it('враги заходят в дом через дверь, а не застревают у стены', () => {
    const w = quietWorld();
    const h = w.layout.houses[0]!;
    w.setDoor(0, true);
    w.player.x = h.x;
    w.player.z = h.z;
    w.updatePlayerHouse();
    const e = spawnEnemy(w, Kind.Whisperer, h.x - 8, h.z - 8)!;
    let inside = false;
    for (let i = 0; i < 20 * 6 && !inside; i++) {
      step(w, input(), 1 / 6);
      w.player.x = h.x;
      w.player.z = h.z;
      inside = Math.hypot(e.x - h.x, e.z - h.z) < 2;
    }
    expect(inside).toBe(true);
  });

  it('фальшивые шептуны (галлюцинации) исчезают от пули без крови', () => {
    const w = quietWorld();
    place(w, 3, 3);
    const e = spawnEnemy(w, Kind.Whisperer, 7, 3, true)!;
    e.speed = 0;
    const log = step(w, input({ aiming: true, ax: 1, fire: true }), 0.5);
    expect(e.active).toBe(false);
    expect(log.some((x) => x.type === 'vanish')).toBe(true);
    expect(log.some((x) => x.type === 'hit')).toBe(false);
  });
});

describe('Режиссёр', () => {
  it('волна стартует по расписанию, после зачистки — флаг и находки у домов', () => {
    const w = quietWorld();
    (w.cfg.night as { waves: unknown }).waves = [{ at: 1, pulse: 0.2, spawns: [{ kind: 'whisperer', count: 2, from: 'crevice' }] }];
    step(w, input(), 4);
    expect(w.flags.has('wave:1:start')).toBe(true);
    for (const e of w.enemies) e.active = false;
    step(w, input(), 0.2);
    expect(w.flags.has('wave:1:end')).toBe(true);
    expect(w.pickups.filter((p) => p.active).length).toBeGreaterThan(0);
  });

  it('за ночь не больше двух случайных скримеров', () => {
    const w = quietWorld();
    (w.director as unknown as { nextScareAt: number }).nextScareAt = 0;
    w.player.sanity = 10;
    let js = 0;
    for (let i = 0; i < 540; i++) {
      w.player.sanity = 10;
      const log = step(w, input(), 1);
      js += log.filter((e) => e.type === 'scare' && e.s === 'jumpscare').length;
      if (w.state !== 'play') break;
    }
    expect(js).toBeLessThanOrEqual(2);
  });
});

describe('сценарный движок', () => {
  it('wait откладывает, enable/disable, flag/unflag, objective работают', () => {
    const w = quietWorld();
    w.narrative.run([{ flag: 'a' }, { wait: 1 }, { flag: 'b' }, { unflag: 'a' }, { disable: 'switch' }, { objective: 'obj.air', marker: { pier: true } }]);
    expect(w.flags.has('a')).toBe(true);
    expect(w.flags.has('b')).toBe(false);
    step(w, input(), 1.1);
    expect(w.flags.has('b')).toBe(true);
    expect(w.flags.has('a')).toBe(false);
    expect(w.interactables.find((i) => i.id === 'switch')!.enabled).toBe(false);
    expect(w.objective).toBe('obj.air');
    expect(w.marker?.pier).toBe(true);
  });

  it('биты срабатывают один раз', () => {
    const w = quietWorld();
    (w.cfg.night as { beats: unknown }).beats = [{ id: 'x', when: { flag: 'go' }, do: [{ sanity: -10 }] }];
    w.flags.add('go');
    const s0 = w.player.sanity;
    step(w, input(), 1 / 60);
    step(w, input(), 1 / 60);
    expect(w.player.sanity).toBeCloseTo(s0 - 10, 0);
  });

  it('обрывки идут строго по порядку и не больше 10', () => {
    const w = quietWorld();
    const log: SimEvent[] = [];
    for (let i = 0; i < 14; i++) {
      w.addFragment(0, 0, 0);
      step(w, input(), 1 / 60, log);
    }
    expect(w.fragments).toBe(10);
    const lines = log.filter((e) => e.type === 'line' && e.a === 3).map((e) => e.s);
    expect(lines).toEqual(w.cfg.night.fragments);
  });

  it('убитый в темноте шептун договаривает фразу, убитый в луче — исчезает молча', () => {
    const w = quietWorld();
    place(w, 3, 3);
    // в луче фонаря — ни слова, даже в мёртвом эфире
    w.air = 0;
    step(w, input(), 4);
    const e1 = spawnEnemy(w, Kind.Whisperer, 7, 3)!;
    e1.speed = 0;
    e1.hp = 1;
    step(w, input({ aiming: true, ax: 1 }), 0.1);
    expect(e1.litTorch).toBe(true);
    step(w, input({ aiming: true, ax: 1, fire: true }), 0.1);
    expect(e1.active).toBe(false);
    expect(w.fragments).toBe(0);
    // в темноте (вне луча, вдали от столба) — договаривает
    const e2 = spawnEnemy(w, Kind.Whisperer, 3, 3)!;
    e2.litTorch = false;
    e2.litAny = false;
    w.time += 5;
    killEnemy(w, e2, false);
    expect(w.fragments).toBe(1);
  });

  it('при радио у столба убитый в темноте молчит: эфир заглушает', () => {
    const w = quietWorld();
    const e = spawnEnemy(w, Kind.Whisperer, 2, 2)!;
    e.litTorch = false;
    e.litAny = true; // свет столба
    killEnemy(w, e, false);
    expect(w.fragments).toBe(0);
  });

  it('вторая ночь стартует с обрезом, всё тёмное', () => {
    const w = quietWorld(1, NIGHT2);
    expect(w.player.owned[weaponIndex('shotgun')]).toBe(true);
    expect(w.houseLight.every((l) => !l)).toBe(true);
  });
});
