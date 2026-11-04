import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { buildLayout, type Layout } from '../proc/layout';
import { WORLD, isWater, water } from '../proc/terrain';
import { WEAPONS } from '../content/weapons';
import type { NightDef } from '../content/night';
import { Kind } from '../content/enemies';
import { Statics } from './collision';
import { Barrel, Enemy, Flare, Interactable, Pickup, Projectile, type EvType, type InputFrame, type Player, type SimEvent } from './types';
import { doorOf } from '../proc/layout';
import { houseAt, toWorld } from './houses';
import { updatePlayer } from './player';
import { updateEnemies } from './enemies';
import { damagePlayer, updateBarrels, updateFlares, updateProjectiles } from './combat';
import { Director } from '../director/director';
import { Narrative } from '../narrative/narrative';

export interface WorldConfig {
  seed: number;
  night: NightDef;
  /** 0..1 — настройка «силы страха» (часть конфигурации, чтобы симуляция оставалась детерминированной). */
  scare: number;
}

export const TRAIL_SIZE = 4096;
/**
 * Прошлое игрока — по тику: x, z, прицел, оружие, флаги (1 — шёл, 2 — выстрелил).
 * Отголосок проигрывает его с задержкой ECHO_DELAY (1 с) — точь-в-точь, включая выстрелы.
 */
export const PAST_SIZE = 1024;
export const PAST_STRIDE = 5;
export const ECHO_DELAY = 60;
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
  readonly past = new Float32Array(PAST_SIZE * PAST_STRIDE);
  /** Смотрит ли игрок сейчас в воду, может ли посмотреть здесь, сколько раз уже смотрел. */
  reflecting = false;
  canReflect = false;
  reflectCount = 0;
  /** Кто стоит за спиной в отражении (виден только там; когда вы поднимете глаза — окажется рядом). */
  reflectFigure: { x: number; z: number } | null = null;
  pastCount = 0;

  /** Шумы: x, z, громкость, время. Кольцо из 8. */
  readonly noises = new Float32Array(8 * 4);
  noiseHead = 0;

  /** 0..1 — заряд текущей бобины. */
  air = 1;
  deadAir = false;
  intensity = 0;
  readonly flags = new Set<string>();
  private nextEnemyId = 1;
  /** Читы режима отладки. В обычной игре всегда выключены. */
  readonly cheats = { god: false, ammo: false, freeze: false };
  /** Собранные буквы имени (третья ночь). */
  letters = '';
  /** Насколько громче играет радио (флешбэк: «сделали погромче»). */
  radioGain = 1;
  private drownT = 0;

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
  marker: { house?: number; pier?: boolean; at?: [number, number] } | null = null;
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
      owned: WEAPONS.map((w) => cfg.night.startWeapons.includes(w.id)),
      cooldown: 0, reload: 0, dynamite: 3, throwCd: 0, stillT: 0, moving: false, invuln: 0,
      stepAcc: 0, reel: 0, holdingReel: false, inLight: true, lastNoiseT: -99, canReel: false,
      focus: -1, focusHold: 0, actionPrev: false, holding: false, voiceCd: 0, battery: 1, fired: 0, aimHold: 0, breath: 1,
    };
    this.doorOpen = this.statics.doorOpen;
    water.level = cfg.night.water?.from ?? WORLD.waterLevel;
    if (cfg.night.dynamite !== undefined) this.player.dynamite = cfg.night.dynamite;
    if (cfg.night.start) {
      this.player.x = cfg.night.start[0];
      this.player.z = cfg.night.start[1];
    }
    if (cfg.night.noRadio) {
      // радио мертво с самого начала: без события «мёртвый эфир» и без сюжетных реплик о нём
      this.air = 0;
      this.deadAir = true;
    }
    this.houseLight = this.layout.houses.map((_, i) => cfg.night.lights[i] ?? false);
    this.buildInteractables();
    this.director = new Director(this);
    this.narrative = new Narrative(this);
  }

  private buildInteractables(): void {
    const night = this.cfg.night;
    const add = (o: Partial<Interactable>): void => {
      this.interactables.push(Object.assign(new Interactable(), o));
    };
    for (const hs of night.houses) {
      const h = this.layout.houses[hs.house];
      if (!h) continue;
      const d = doorOf(h, 0.9);
      // пустой ответ — эту дверь откроет только сценарий
      add({ id: `knock:${hs.house}`, kind: 'knock', x: d.x, z: d.z, r: 1.3, house: hs.house, enabled: hs.knock.length > 0, prompt: night.knockPrompt, rule: night.knockRule > 0 });
      for (const n of hs.notes) {
        const [x, z] = toWorld(h, n.x, n.z);
        add({ id: `note:${n.id}`, kind: 'note', x, z, r: 1.15, house: hs.house, key: n.key, prompt: 'prompt.read' });
      }
    }
    const hut = this.layout.hut;
    for (const ex of night.extras) {
      let x = 0;
      let z = 0;
      let house = -1;
      const a = ex.at;
      if (a === 'pierEnd') {
        x = WORLD.pier.x1 - 2.2;
        z = (WORLD.pier.z0 + WORLD.pier.z1) / 2;
      } else if (a === 'pierStart') {
        x = WORLD.pier.x0 + 1.2;
        z = WORLD.pier.z1 + 0.4;
      } else if (a === 'hutSide') {
        // рубильник на боковой стене — далеко от двери, чтобы не путать со сменой бобины
        [x, z] = toWorld(hut, -hut.w / 2 - 0.7, 0);
      } else if (a === 'hutDoorSide') {
        [x, z] = toWorld(hut, 1.3, hut.d / 2 + 0.6);
      } else if ('door' in a) {
        const h = this.layout.houses[a.door];
        if (h) ({ x, z } = doorOf(h, 0.9));
      } else if ('house' in a) {
        const h = this.layout.houses[a.house];
        if (h) [x, z] = toWorld(h, a.x, a.z);
        house = a.house;
      } else {
        x = a.x;
        z = a.z;
      }
      const noteFx = ex.effects.find((e) => 'note' in e);
      const noteKey = noteFx && 'note' in noteFx ? noteFx.note : '';
      add({ id: ex.id, kind: 'custom', x, z, r: ex.r, house, enabled: ex.enabled, hold: ex.hold, prompt: ex.prompt, rule: ex.rule, once: ex.once, glint: !!ex.glint, effects: ex.effects, reflect: !!ex.reflect, key: noteKey });
    }
  }

  /** Есть ли рядом вода, в которую можно заглянуть: берег пруда, лужа, подпол. */
  waterNear(x: number, z: number): boolean {
    const rf = this.cfg.night.reflect;
    if (!rf) return false;
    for (const pd of rf.puddles) if (Math.hypot(x - pd.x, z - pd.z) < pd.r + 0.6) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (isWater(x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5)) return true;
    }
    return false;
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

  /** Паводок: если вода поднялась под ногами — тонешь. */
  private drowning(dt: number): void {
    const p = this.player;
    if (!p.alive || !this.cfg.night.water) return;
    const depth = water.level - p.y;
    if (depth > 0.35) {
      this.drownT += dt;
      if (this.drownT > 0.8) {
        this.drownT = 0;
        this.emit('drown', p.x, water.level, p.z);
        damagePlayer(this, 9 + depth * 6, p.x + 0.1, p.z, 0);
      }
      this.flags.add('drowning');
    } else this.drownT = 0;
  }

  /** Сюжетная концовка: рассвет наступает сразу. */
  endNight(): void {
    if (this.state !== 'play') return;
    this.state = 'dawn';
    for (const e of this.enemies) {
      if (e.active) {
        this.emit('vanish', e.x, e.y, e.z, e.kind, 1);
        e.active = false;
      }
    }
    this.emit('dawn');
  }

  /** Записывает текущий тик игрока в кольцевой буфер прошлого. */
  private recordPast(): void {
    const p = this.player;
    const i = (this.pastCount % PAST_SIZE) * PAST_STRIDE;
    const b = this.past;
    b[i] = p.x;
    b[i + 1] = p.z;
    b[i + 2] = p.yaw;
    b[i + 3] = p.fired > 0 ? p.fired - 1 : p.weapon;
    b[i + 4] = (p.moving ? 1 : 0) | (p.fired > 0 ? 2 : 0);
    p.fired = 0;
    this.pastCount++;
  }

  /** Тик прошлого `back` тиков назад (или null, если столько ещё не записано). */
  pastAt(back: number): number | null {
    if (this.pastCount - 1 - back < 0 || back >= PAST_SIZE) return null;
    return ((this.pastCount - 1 - back) % PAST_SIZE) * PAST_STRIDE;
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

    // вода
    const wv = this.cfg.night.water;
    if (wv) {
      const k = clamp((this.time - wv.t0) / Math.max(0.001, wv.t1 - wv.t0), 0, 1);
      water.level = wv.from + (wv.to - wv.from) * k;
    } else water.level = WORLD.waterLevel;

    // эфир
    if (!this.cfg.night.noRadio) this.air -= dt / this.cfg.night.reelSeconds;
    if (this.air <= 0) {
      this.air = 0;
      if (!this.deadAir) {
        this.deadAir = true;
        this.flags.add('deadAir');
        this.emit('deadAir', WORLD.pole.x, 4, WORLD.pole.z);
      }
    }

    updatePlayer(this, input, dt);
    this.recordPast();
    this.drowning(dt);
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
