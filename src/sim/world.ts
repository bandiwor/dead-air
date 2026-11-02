import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { buildLayout, type Layout } from '../proc/layout';
import { WORLD } from '../proc/terrain';
import { WEAPONS } from '../content/weapons';
import type { NightDef } from '../content/night1';
import { Kind } from '../content/enemies';
import { Statics } from './collision';
import { Barrel, Enemy, Flare, Interactable, Pickup, Projectile, type EvType, type InputFrame, type Player, type SimEvent } from './types';
import { INTERIORS } from '../content/interiors';
import { doorOf } from '../proc/layout';
import { houseAt, toWorld } from './houses';
import { updatePlayer } from './player';
import { updateEnemies } from './enemies';
import { updateBarrels, updateFlares, updateProjectiles } from './combat';
import { Director } from '../director/director';
import { Narrative } from '../narrative/narrative';

export interface WorldConfig {
  seed: number;
  night: NightDef;
  /** 0..1 — настройка «силы страха» (часть конфигурации, чтобы симуляция оставалась детерминированной). */
  scare: number;
}

export const TRAIL_SIZE = 4096;
export const MAX_ENEMIES = 64;
const MAX_EVENTS = 512;

export type WorldState = 'play' | 'dead' | 'dawn';

/**
 * Состояние мира и фиксированный шаг симуляции. Ничего не знает о рендере, звуке и DOM —
 * поэтому запускается в Node (тесты, проверка реплеев).
 */
export class World {
  readonly cfg: WorldConfig;
  readonly rng: Rng;
  readonly layout: Layout;
  readonly statics: Statics;
  readonly director: Director;
  readonly narrative: Narrative;

  tick = 0;
  time = 0;
  state: WorldState = 'play';

  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly flares: Flare[] = [];
  readonly barrels: Barrel[] = [];
  readonly pickups: Pickup[] = [];

  readonly events: SimEvent[] = [];
  eventCount = 0;

  /** След игрока для Отголоска: x,z по очереди. trailCount — сколько всего отсчётов записано. */
  readonly trail = new Float32Array(TRAIL_SIZE * 2);
  trailCount = 0;

  /** Шумы: x, z, громкость, время. Кольцо из 8. */
  readonly noises = new Float32Array(8 * 4);
  noiseHead = 0;

  /** 0..1 — заряд текущей бобины. */
  air = 1;
  deadAir = false;
  intensity = 0;
  readonly flags = new Set<string>();
  private nextEnemyId = 1;

  /** Двери домов и свет в окнах (меняются сценарием). */
  readonly doorOpen: boolean[];
  readonly houseLight: boolean[];
  readonly interactables: Interactable[] = [];
  playerHouse = -1;
  fragments = 0;
  lastFragT = -99;
  readonly notesRead: string[] = [];
  /** Текущая задача и метка на экране. */
  objective = '';
  marker: { house?: number; pier?: boolean } | null = null;
  private timers: { at: number; fn: () => void }[] = [];

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.layout = buildLayout();
    this.statics = new Statics(this.layout);
    for (let i = 0; i < MAX_ENEMIES; i++) this.enemies.push(new Enemy());
    for (let i = 0; i < 16; i++) this.projectiles.push(new Projectile());
    for (let i = 0; i < 6; i++) this.flares.push(new Flare());
    for (let i = 0; i < 24; i++) this.pickups.push(new Pickup());
    for (const b of this.layout.barrels) {
      const barrel = new Barrel();
      barrel.x = b.x;
      barrel.z = b.z;
      this.barrels.push(barrel);
    }
    for (let i = 0; i < MAX_EVENTS; i++) this.events.push({ type: 'shot', x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, s: '' });

    this.player = {
      x: 3.5, y: 0, z: 2.5, vx: 0, vz: 0, kx: 0, kz: 0, yaw: -Math.PI / 2,
      hp: 100, sanity: 100, alive: true,
      weapon: 0,
      mag: WEAPONS.map((w) => w.mag),
      reserve: WEAPONS.map((w) => w.startReserve),
      owned: WEAPONS.map((w) => w.owned),
      cooldown: 0, reload: 0, dynamite: 3, throwCd: 0, stillT: 0, moving: false, invuln: 0,
      stepAcc: 0, reel: 0, holdingReel: false, inLight: true, lastNoiseT: -99, canReel: false,
      focus: -1, focusHold: 0, actionPrev: false, holding: false,
    };
    this.doorOpen = this.statics.doorOpen;
    this.houseLight = this.layout.houses.map((h) => h.lit);
    this.buildInteractables();
    this.director = new Director(this);
    this.narrative = new Narrative(this);
  }

  private buildInteractables(): void {
    const add = (o: Partial<Interactable>): void => {
      this.interactables.push(Object.assign(new Interactable(), o));
    };
    this.layout.houses.forEach((h, i) => {
      const d = doorOf(h, 0.9);
      // в дом у колодца не стучат — он откроется сам
      add({ id: `knock:${i}`, kind: 'knock', x: d.x, z: d.z, r: 1.3, house: i, enabled: i !== 2 });
    });
    for (const it of INTERIORS) {
      const h = this.layout.houses[it.house];
      if (!h) continue;
      for (const n of it.notes) {
        const [x, z] = toWorld(h, n.x, n.z);
        add({ id: `note:${n.id}`, kind: 'note', x, z, r: 1.15, house: it.house, key: n.key });
      }
    }
    add({ id: 'pier', kind: 'pier', x: WORLD.pier.x1 - 2.2, z: (WORLD.pier.z0 + WORLD.pier.z1) / 2, r: 2, enabled: false, hold: 1.4 });
    // рубильник на боковой стене радиоузла — далеко от двери, чтобы не путать со сменой бобины
    const hut = this.layout.hut;
    const [sx, sz] = toWorld(hut, -hut.w / 2 - 0.7, 0);
    add({ id: 'switch', kind: 'switch', x: sx, z: sz, r: 1.1 });
  }

  /** Отложенное действие сценария (в секундах симуляции). */
  later(delay: number, fn: () => void): void {
    this.timers.push({ at: this.time + delay, fn });
  }

  setDoor(i: number, open: boolean): void {
    if (this.doorOpen[i] === open) return;
    this.doorOpen[i] = open;
    const h = this.layout.houses[i];
    if (!h) return;
    const d = doorOf(h, 0);
    this.emit('door', d.x, 1, d.z, i, open ? 1 : 0);
    // открытую дверь больше не нужно «стучать»
    const knock = this.interactables.find((it) => it.id === `knock:${i}`);
    if (knock && open) knock.enabled = false;
  }

  setHouseLight(i: number, on: boolean): void {
    this.houseLight[i] = on;
    this.emit('houseLight', 0, 0, 0, i, on ? 1 : 0);
  }

  /** Обрывок правды: следующий по порядку. */
  addFragment(x: number, y: number, z: number): void {
    const list = this.cfg.night.fragments;
    if (this.fragments >= list.length) return;
    const key = list[this.fragments]!;
    this.fragments++;
    this.lastFragT = this.time;
    this.emit('fragment', x, y, z, this.fragments);
    this.emit('line', x, y, z, 3, 0, 0, key);
  }

  /** Скример: лицо в упор. Всегда сопровождается потерей рассудка. */
  jumpscare(): void {
    this.emit('scare', this.player.x, 1.5, this.player.z, 0, 0, 0, 'jumpscare');
    this.player.sanity = Math.max(0, this.player.sanity - 14);
    this.intensity = 1;
  }

  updatePlayerHouse(): void {
    const h = houseAt(this.layout.houses, this.player.x, this.player.z);
    if (h !== this.playerHouse) {
      this.playerHouse = h;
      if (h >= 0) this.flags.add(`inside:${h}`);
    }
  }

  get nightT(): number {
    return this.time;
  }

  /** Часы ночи в часах (22.0 … 30.0). */
  get clockHours(): number {
    const n = this.cfg.night;
    const span = (n.endHour + 24 - n.startHour) % 24;
    return n.startHour + (clamp(this.time / n.duration, 0, 1) * span);
  }

  emit(type: EvType, x = 0, y = 0, z = 0, a = 0, b = 0, c = 0, s = ''): void {
    if (this.eventCount >= this.events.length) return;
    const e = this.events[this.eventCount++]!;
    e.type = type;
    e.x = x;
    e.y = y;
    e.z = z;
    e.a = a;
    e.b = b;
    e.c = c;
    e.s = s;
  }

  clearEvents(): void {
    this.eventCount = 0;
  }

  noise(x: number, z: number, loud: number): void {
    const i = this.noiseHead * 4;
    this.noises[i] = x;
    this.noises[i + 1] = z;
    this.noises[i + 2] = loud;
    this.noises[i + 3] = this.time;
    this.noiseHead = (this.noiseHead + 1) % 8;
  }

  allocEnemy(): Enemy | null {
    for (const e of this.enemies) {
      if (!e.active) {
        e.id = this.nextEnemyId++;
        return e;
      }
    }
    return null;
  }

  aliveEnemies(includeFake = false): number {
    let n = 0;
    for (const e of this.enemies) {
      if (e.active && e.kind !== Kind.Apparition && (includeFake || !e.fake)) n++;
    }
    return n;
  }

  step(input: InputFrame, dt: number): void {
    if (this.state !== 'play') return;
    this.tick++;
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }

    // эфир
    this.air -= dt / this.cfg.night.reelSeconds;
    if (this.air <= 0) {
      this.air = 0;
      if (!this.deadAir) {
        this.deadAir = true;
        this.flags.add('deadAir');
        this.emit('deadAir', WORLD.pole.x, 4, WORLD.pole.z);
      }
    }

    updatePlayer(this, input, dt);
    this.director.update(dt);
    updateEnemies(this, dt);
    updateProjectiles(this, dt);
    updateFlares(this, dt);
    updateBarrels(this, dt);
    this.narrative.update(dt);

    this.intensity = clamp(this.intensity * Math.exp(-0.16 * dt), 0, 1);

    if (this.time >= this.cfg.night.duration && this.state === 'play') {
      this.state = 'dawn';
      for (const e of this.enemies) {
        if (e.active) {
          this.emit('vanish', e.x, e.y, e.z, e.kind, 1);
          e.active = false;
        }
      }
      this.emit('dawn');
    }
  }

  /** Хеш ключевого состояния — для проверки детерминизма. */
  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (v: number): void => {
      h ^= Math.round(v * 1000) | 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    const p = this.player;
    mix(this.tick);
    mix(p.x);
    mix(p.z);
    mix(p.hp);
    mix(p.sanity);
    mix(p.yaw);
    for (const m of p.mag) mix(m);
    for (const e of this.enemies) {
      if (!e.active) continue;
      mix(e.kind);
      mix(e.x);
      mix(e.z);
      mix(e.hp);
    }
    mix(this.air);
    for (const s of this.rng.snapshot()) mix(s);
    return h >>> 0;
  }
}
