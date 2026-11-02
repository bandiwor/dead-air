import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { buildLayout, type Layout } from '../proc/layout';
import { WORLD } from '../proc/terrain';
import { WEAPONS } from '../content/weapons';
import type { NightDef } from '../content/night1';
import { Kind } from '../content/enemies';
import { Statics } from './collision';
import { Barrel, Enemy, Flare, Pickup, Projectile, type EvType, type InputFrame, type Player, type SimEvent } from './types';
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
    };
    this.director = new Director(this);
    this.narrative = new Narrative(this);
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
