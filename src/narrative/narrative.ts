import type { AppearAt, Beat, Condition, Effect, SpawnAt } from '../content/script';
import { interiorOf } from '../content/interiors';
import { KIND_BY_ID, Kind } from '../content/enemies';
import { weaponIndex } from '../content/weapons';
import { WORLD, isWater } from '../proc/terrain';
import { doorOf } from '../proc/layout';
import { spawnEnemy } from '../sim/enemies';
import { toWorld } from '../sim/houses';
import type { World } from '../sim/world';

/**
 * Сценарный движок: проверяет условия битов и исполняет эффекты из белого списка.
 * `wait` откладывает остаток списка, не блокируя игру.
 */
export class Narrative {
  private readonly w: World;
  private readonly done = new Set<string>();
  private queue: { key: string; style: number }[] = [];
  private nextLineAt = 0;

  constructor(w: World) {
    this.w = w;
  }

  update(_dt: number): void {
    const w = this.w;
    for (const b of w.cfg.night.beats) {
      if (this.done.has(b.id) || !this.check(b)) continue;
      this.done.add(b.id);
      this.run(b.do);
    }
    if (this.queue.length > 0 && w.time >= this.nextLineAt) {
      const l = this.queue.shift()!;
      w.emit('line', 0, 0, 0, l.style, 0, 0, l.key);
      this.nextLineAt = w.time + 3.6;
    }
  }

  private check(b: Beat): boolean {
    const c: Condition = b.when;
    const w = this.w;
    if (c.t !== undefined && w.time < c.t) return false;
    if (c.flag !== undefined && !w.flags.has(c.flag)) return false;
    if (c.notFlag !== undefined && w.flags.has(c.notFlag)) return false;
    if (c.sanityBelow !== undefined && w.player.sanity >= c.sanityBelow) return false;
    if (c.flags && !c.flags.every((f) => w.flags.has(f))) return false;
    if (c.near && Math.hypot(w.player.x - c.near[0], w.player.z - c.near[1]) > c.near[2]) return false;
    return true;
  }

  run(list: readonly Effect[], from = 0): void {
    for (let i = from; i < list.length; i++) {
      const e = list[i]!;
      if ('wait' in e) {
        this.w.later(e.wait, () => this.run(list, i + 1));
        return;
      }
      this.apply(e);
    }
  }

  private apply(e: Effect): void {
    const w = this.w;
    const p = w.player;
    if ('line' in e) this.queue.push({ key: e.line, style: e.style ?? 0 });
    else if ('note' in e) w.emit('note', 0, 0, 0, 0, 0, 0, e.note);
    else if ('openDoor' in e) w.setDoor(e.openDoor, true);
    else if ('closeDoor' in e) w.setDoor(e.closeDoor, false);
    else if ('light' in e) w.setHouseLight(e.light, e.on);
    else if ('deadAir' in e) w.air = 0;
    else if ('flag' in e) w.flags.add(e.flag);
    else if ('unflag' in e) w.flags.delete(e.unflag);
    else if ('letter' in e) {
      if (!w.letters.includes(e.letter)) {
        w.letters += e.letter;
        w.flags.add(`letters:${w.letters.length}`);
        w.emit('letter', p.x, p.y + 1, p.z, w.letters.length, 0, 0, e.letter);
      }
    } else if ('dawn' in e) w.endNight();
    else if ('radio' in e) w.radioGain = e.radio;
    else if ('enable' in e || 'disable' in e) {
      const id = 'enable' in e ? e.enable : e.disable;
      const it = w.interactables.find((i) => i.id === id);
      if (it) it.enabled = 'enable' in e;
    }
    else if ('sanity' in e) p.sanity = Math.max(0, Math.min(100, p.sanity + e.sanity));
    else if ('fragment' in e) w.addFragment(p.x, p.y + 1, p.z);
    else if ('objective' in e) {
      w.objective = e.objective;
      if (e.marker !== undefined) w.marker = e.marker;
    } else if ('spawn' in e) {
      for (let k = 0; k < e.count; k++) {
        const [x, z] = this.spot(e.at, e.house);
        spawnEnemy(w, KIND_BY_ID[e.spawn], x, z);
      }
    } else if ('appear' in e) this.appear(e.appear, e.house);
    else if ('despawnPier' in e) {
      for (const en of w.enemies) {
        if (en.active && en.kind === Kind.Apparition && (en.state === 1 || en.state === 3)) {
          w.emit('vanish', en.x, en.y, en.z, en.kind, 2);
          en.active = false;
        }
      }
    } else if ('scare' in e) {
      if (e.scare === 'jumpscare') w.jumpscare();
      else if (e.scare === 'turn') {
        for (const en of w.enemies) if (en.active && en.kind === Kind.Apparition && en.state === 1) en.state = 3;
      } else if (e.scare === 'knockHut') {
        // стучат в дверь радиоузла — к вам
        const d = w.layout.hutDoor;
        w.emit('scare', d.x, 1, d.z, -1, 0, 0, 'knockBack');
      } else if (e.scare === 'steps') {
        // шаги — из-за спины игрока, а не от столба
        const a = p.yaw + Math.PI;
        w.emit('scare', p.x + Math.cos(a) * 7, 1, p.z + Math.sin(a) * 7, -1, 0, 0, 'steps');
      } else {
        const h = e.house !== undefined ? w.layout.houses[e.house] : undefined;
        w.emit('scare', h?.x ?? w.layout.pole.x, 1, h?.z ?? w.layout.pole.z, e.house ?? -1, 0, 0, e.scare);
      }
    } else if ('drop' in e) {
      const h = w.layout.houses[e.house];
      if (!h) return;
      let x: number;
      let z: number;
      if (e.inside) {
        const it = interiorOf(e.house);
        [x, z] = toWorld(h, it?.spot[0] ?? 0, it?.spot[1] ?? 0);
      } else {
        const d = doorOf(h, 1.3);
        x = d.x;
        z = d.z;
      }
      const kind = e.drop === 'weapon' ? 1 : e.drop === 'dynamite' ? 2 : e.drop === 'med' ? 3 : e.drop === 'reel' ? 5 : 0;
      w.director.dropPickup(kind, e.weapon ? weaponIndex(e.weapon) : 0, x, z);
    }
  }

  private spot(at: SpawnAt, house?: number): [number, number] {
    const w = this.w;
    const r = w.rng;
    const h = house !== undefined ? w.layout.houses[house] : undefined;
    if (at === 'doorOut' && h) {
      const d = doorOf(h, r.range(1.5, 3.5));
      return [d.x + r.range(-1, 1), d.z + r.range(-1, 1)];
    }
    if (at === 'inside' && h) return toWorld(h, r.range(-1, 1), r.range(-1.2, 0));
    if (at === 'pierWater') return [WORLD.pier.x1 + r.range(1, 3), (WORLD.pier.z0 + WORLD.pier.z1) / 2 + r.range(-2, 2)];
    if (at === 'crevice') return [WORLD.crevice.ax + r.range(-1, 1), WORLD.crevice.az + r.range(-1, 1)];
    const p = w.player;
    for (let i = 0; i < 10; i++) {
      const a = (at === 'behind' ? p.yaw + Math.PI : r.range(0, 6.28)) + r.range(-1, 1);
      const x = p.x + Math.cos(a) * 20;
      const z = p.z + Math.sin(a) * 20;
      if (!isWater(x, z)) return [x, z];
    }
    return [p.x + 20, p.z];
  }

  /**
   * Явления. Состояния призрака: 0 — исчезает от взгляда; 1 — стоит спиной (пристань);
   * 3 — обернулся; 2 — за спиной: стоит, пока не посмотришь, и тогда — лицо.
   */
  private appear(at: AppearAt, house?: number): void {
    const w = this.w;
    const p = w.player;
    if (at === 'pier' || at === 'water') {
      // стоит спиной, лицом к воде; на воде — посреди Глядня
      const onWater = at === 'water';
      const e = spawnEnemy(w, Kind.Apparition, onWater ? WORLD.pond.x : WORLD.pier.x1 - 0.5, onWater ? WORLD.pond.z : (WORLD.pier.z0 + WORLD.pier.z1) / 2);
      if (e) {
        e.state = 1;
        e.tx = 9999;
        e.yaw = onWater ? Math.atan2(WORLD.pond.z - p.z, WORLD.pond.x - p.x) : 0;
        e.delay = onWater ? 1 : 0;
      }
      w.flags.add('pierFigure');
      const pier = w.interactables.find((it) => it.id === 'pier');
      if (pier) pier.enabled = true;
    } else if (at === 'corner' && house !== undefined) {
      // сидит лицом в угол, у задней стены
      const h = w.layout.houses[house];
      if (!h) return;
      const [x, z] = toWorld(h, 2.4, -1.85);
      const [bx, bz] = toWorld(h, 2.4, -3);
      const e = spawnEnemy(w, Kind.Apparition, x, z);
      if (e) {
        e.state = 1;
        e.tx = 9999;
        e.yaw = Math.atan2(bz - z, bx - x);
      }
    } else if (at === 'choir') {
      // Хор перед заслонкой, в верховье Щели
      const c = WORLD.crevice;
      const e = spawnEnemy(w, Kind.Choir, c.bx + (c.ax - c.bx) * 0.18, c.bz + (c.az - c.bz) * 0.18);
      if (e) e.tx = 3;
    } else if (at === 'procession') {
      // одиннадцать — цепочкой из пруда в сторону радиоузла, один за другим
      const d = w.layout.hutDoor;
      const pc = WORLD.pond;
      const dx = d.x - pc.x;
      const dz = d.z - pc.z;
      const l = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 11; i++) {
        const k = pc.r * 0.92 - i * 1.5;
        const side = (i % 2 ? 1 : -1) * 0.5;
        const x = pc.x + (dx / l) * k - (dz / l) * side;
        const z = pc.z + (dz / l) * k + (dx / l) * side;
        const e = spawnEnemy(w, Kind.Unseeing, x, z);
        if (e) {
          e.delay = 2;
          e.age = -i * 0.6; // выходят из воды по очереди
        }
      }
      w.flags.add('procession');
    } else if (at === 'witnesses') {
      // одиннадцать поднимаются снизу по Щели — полукругом, на отдалении
      const c = WORLD.crevice;
      const dx = c.ax - c.bx;
      const dz = c.az - c.bz;
      const l = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 11; i++) {
        const back = 9 + (i % 4) * 1.6;
        const side = (i - 5) * 0.55;
        const x = p.x + (dx / l) * back - (dz / l) * side;
        const z = p.z + (dz / l) * back + (dx / l) * side;
        const e = spawnEnemy(w, Kind.Unseeing, x, z);
        if (e) e.delay = 3;
      }
      w.flags.add('witnesses');
    } else if (at === 'villagers') {
      // одиннадцать дворов вышли из домов: у каждой двери — по фигуре, остальные — у столба
      for (const h of w.layout.houses) {
        const d = doorOf(h, 1.7);
        const e = spawnEnemy(w, Kind.Apparition, d.x, d.z);
        if (e) {
          e.state = 1;
          e.tx = 9999;
          e.yaw = Math.atan2(w.layout.pole.z - d.z, w.layout.pole.x - d.x);
        }
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        const x = w.layout.pole.x + Math.cos(a) * 4.4;
        const z = w.layout.pole.z + Math.sin(a) * 4.4;
        const e = spawnEnemy(w, Kind.Apparition, x, z);
        if (e) {
          e.state = 1;
          e.tx = 9999;
          e.yaw = a + Math.PI;
        }
      }
      w.flags.add('villagers');
    } else if (at === 'boy') {
      // мальчик поднимается из ила посреди сухого пруда и показывает на развалины
      const e = spawnEnemy(w, Kind.Apparition, WORLD.pond.x + 2, WORLD.pond.z + 2);
      if (e) {
        e.state = 1;
        e.tx = 9999;
        e.yaw = Math.atan2(25 - (WORLD.pond.z + 2), 35 - (WORLD.pond.x + 2));
      }
      w.flags.add('boy');
    } else if (at === 'behind') {
      const a = p.yaw + Math.PI;
      const e = spawnEnemy(w, Kind.Apparition, p.x + Math.cos(a) * 1.3, p.z + Math.sin(a) * 1.3);
      if (e) {
        e.state = 2;
        e.tx = 7;
      }
    } else if (at === 'pole') {
      const e = spawnEnemy(w, Kind.Apparition, w.layout.pole.x + 0.9, w.layout.pole.z + 0.6);
      if (e) e.tx = 1.4;
    } else if (at === 'window' && house !== undefined) {
      const h = w.layout.houses[house];
      if (!h) return;
      const [x, z] = toWorld(h, h.w * 0.3, h.d / 2 - 0.5);
      const e = spawnEnemy(w, Kind.Apparition, x, z);
      if (e) e.tx = 2.2;
    }
  }
}
