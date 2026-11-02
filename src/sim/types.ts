import type { Kind } from '../content/enemies';

/** Абстрактный ввод одного тика. Один формат для тача, клавиатуры/мыши и (позже) геймпада. */
export interface InputFrame {
  /** Движение в плоскости мира: x — вправо по экрану, z — вниз по экрану. */
  mx: number;
  mz: number;
  ax: number;
  az: number;
  aiming: boolean;
  fire: boolean;
  /** Удерживается. */
  action: boolean;
  /** Нажатия (срабатывают на одном тике). */
  swap: boolean;
  throw: boolean;
  reload: boolean;
  /** Мягкая помощь прицеливания (тач). */
  assist: boolean;
}

export function emptyInput(): InputFrame {
  return { mx: 0, mz: 0, ax: 0, az: 0, aiming: false, fire: false, action: false, swap: false, throw: false, reload: false, assist: false };
}

export type EvType =
  | 'shot' | 'tracer' | 'hit' | 'kill' | 'explosion' | 'step' | 'echoStep' | 'playerHurt' | 'playerDeath'
  | 'reload' | 'dryfire' | 'swap' | 'pickup' | 'throw' | 'flareLand' | 'deadAir' | 'airRestored'
  | 'reelProgress' | 'line' | 'scare' | 'waveStart' | 'waveEnd' | 'dawn' | 'alert' | 'growl' | 'charge'
  | 'vanish' | 'bounce' | 'spawn' | 'splash' | 'note' | 'knock' | 'door' | 'houseLight' | 'fragment';

export interface SimEvent {
  type: EvType;
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
  c: number;
  s: string;
}

export class Enemy {
  active = false;
  id = 0;
  kind: Kind = 0;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** Импульс от отдачи/взрывов. */
  kx = 0;
  kz = 0;
  yaw = 0;
  hp = 0;
  maxHp = 0;
  r = 0.4;
  speed = 0;
  state = 0;
  t = 0;
  atkCd = 0;
  fake = false;
  litTorch = false;
  litAny = false;
  litTime = 0;
  /** 0..1 — вспышка попадания (для рендера). */
  flash = 0;
  /** 0..1 — видимость/проявление (для рендера). */
  fade = 0;
  tx = 0;
  tz = 0;
  avoid = 0;
  avoidSign = 1;
  burn = 0;
  stepAcc = 0;
  /** Для Отголоска: отставание по следу (в отсчётах). */
  delay = 0;
  phase = 0;
}

export class Projectile {
  active = false;
  /** 0 — шашка, 1 — сигнальная ракета */
  kind = 0;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  fuse = 0;
  bounces = 0;
}

export class Flare {
  active = false;
  x = 0;
  y = 0;
  z = 0;
  t = 0;
  life = 0;
}

export class Barrel {
  alive = true;
  x = 0;
  z = 0;
  hp = 30;
  fuse = -1;
}

export class Pickup {
  active = false;
  /** 0 — патроны, 1 — оружие (a — индекс), 2 — шашки, 3 — аптечка */
  kind = 0;
  a = 0;
  x = 0;
  z = 0;
  t = 0;
}

export interface Player {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  kx: number;
  kz: number;
  yaw: number;
  hp: number;
  sanity: number;
  alive: boolean;
  weapon: number;
  mag: number[];
  reserve: number[];
  owned: boolean[];
  cooldown: number;
  reload: number;
  dynamite: number;
  throwCd: number;
  stillT: number;
  moving: boolean;
  invuln: number;
  stepAcc: number;
  reel: number;
  holdingReel: boolean;
  inLight: boolean;
  lastNoiseT: number;
  canReel: boolean;
  /** Индекс интерактива в фокусе (или −1) и прогресс удержания. */
  focus: number;
  focusHold: number;
  actionPrev: boolean;
  holding: boolean;
}

export type InteractKind = 'knock' | 'note' | 'pier' | 'switch';

export class Interactable {
  id = '';
  kind: InteractKind = 'note';
  x = 0;
  z = 0;
  r = 1.2;
  house = -1;
  key = '';
  enabled = true;
  used = false;
  /** 0 — нажатие, иначе — секунды удержания. */
  hold = 0;
}
