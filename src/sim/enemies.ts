import { clamp, wrapAngle } from '../core/math';
import { ENEMIES, Kind } from '../content/enemies';
import { WORLD, groundAt, heightAt, water } from '../proc/terrain';
import { ECHO_DELAY, type World } from './world';
import type { Enemy } from './types';
import { damagePlayer, echoFire, killEnemy } from './combat';
import { steerAround } from './collision';
import { houseAt, toLocal } from './houses';
import { doorOf } from '../proc/layout';
import { PLAYER_R } from './player';

const TORCH_RANGE = 16;
const TORCH_HALF = 0.44;

/** Сила фонаря: керосиновая лампа ребёнка слабее, садящаяся батарейка — тусклее. */
export function torchFactor(w: World): number {
  // третья фаза Хора: фонарь гаснет совсем — видно только криком
  if (w.flags.has('lightsOut')) return 0;
  if (w.cfg.night.child) return w.player.lampCovered ? 0.12 : 0.6;
  if (!w.cfg.night.battery) return 1;
  const b = w.player.battery;
  return b > 0 ? 0.45 + 0.55 * b : 0.25;
}

export function spawnEnemy(w: World, kind: Kind, x: number, z: number, fake = false): Enemy | null {
  const e = w.allocEnemy();
  if (!e) return null;
  const def = ENEMIES[kind];
  e.active = true;
  e.kind = kind;
  e.x = x;
  e.z = z;
  e.y = groundAt(x, z);
  e.vx = e.vz = e.kx = e.kz = 0;
  e.hp = e.maxHp = def.hp;
  e.r = def.radius;
  e.speed = def.speed * w.rng.range(0.9, 1.12);
  e.state = 0;
  e.t = 0;
  e.atkCd = 0.6;
  e.fake = fake;
  e.litTorch = e.litAny = false;
  e.litTime = 0;
  e.flash = 0;
  e.fade = 0;
  e.avoid = 0;
  e.avoidSign = w.rng.sign();
  e.burn = 0;
  e.age = 0;
  e.stepAcc = 0;
  e.phase = w.rng.range(0, Math.PI * 2);
  e.yaw = Math.atan2(w.player.z - z, w.player.x - x);
  e.delay = 0;
  if (kind === Kind.Echo) {
    // появляется там, где вы были 5 секунд назад
    const i = w.pastAt(ECHO_DELAY);
    if (i !== null) {
      e.x = w.past[i]!;
      e.z = w.past[i + 1]!;
      e.yaw = w.past[i + 2]!;
      e.tx = w.past[i + 3]!;
    }
    e.atkCd = 0.4;
    w.flags.add('echoSeen');
  }
  if (kind === Kind.Mute) w.flags.add('muteSeen');
  w.emit('spawn', e.x, e.y, e.z, kind, fake ? 1 : 0);
  return e;
}

export function updateEnemies(w: World, dt: number): void {
  const p = w.player;
  const cx = Math.cos(p.yaw);
  const cz = Math.sin(p.yaw);

  for (const e of w.enemies) {
    if (!e.active) continue;
    e.t += dt;
    e.age += dt;
    e.atkCd = Math.max(0, e.atkCd - dt);
    e.flash = Math.max(0, e.flash - dt * 6);
    e.reveal = Math.max(0, e.reveal - dt);
    e.fade = Math.min(1, e.fade + dt * 1.5);

    // --- освещённость ---
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    e.litTorch = false;
    const range = TORCH_RANGE * torchFactor(w);
    if (dist < range && dist > 0.01) {
      const dot = (dx * cx + dz * cz) / dist;
      if (dot > Math.cos(TORCH_HALF) || dist < 1.6) {
        const tWall = w.statics.raycast(p.x, p.z, dx / dist, dz / dist, dist, false);
        e.litTorch = tWall >= dist - 0.3;
      }
    }
    let nearFlare = 99;
    for (const f of w.flares) if (f.active) nearFlare = Math.min(nearFlare, Math.hypot(e.x - f.x, e.z - f.z));
    const nearPole = !w.deadAir && Math.hypot(e.x - w.layout.pole.x, e.z - w.layout.pole.z) < 7;
    e.litAny = e.litTorch || nearFlare < 6.5 || nearPole;
    e.litTime = e.litTorch ? e.litTime + dt : Math.max(0, e.litTime - dt * 2);

    // отладка: враги замирают (свет и видимость считаются как обычно)
    if (w.cheats.freeze) {
      e.vx = e.vz = 0;
      continue;
    }
    switch (e.kind) {
      case Kind.Whisperer:
        whisperer(w, e, dist, nearFlare, dt);
        break;
      case Kind.Mute:
        mute(w, e, dist, dt);
        break;
      case Kind.Echo:
        echo(w, e, dist, dt);
        break;
      case Kind.Apparition:
        apparition(w, e, dt);
        break;
      case Kind.Unseeing:
        unseeing(w, e, dist, dt);
        break;
      case Kind.Choir:
        choir(w, e, dist, dt);
        break;
    }
    if (!e.active) continue;
    // фигура «на воде» стоит на поверхности пруда
    e.y = e.kind === Kind.Apparition && e.delay === 1 ? water.level : Math.max(heightAt(e.x, e.z), onPierY(e));
  }

  separate(w);
}

function onPierY(e: Enemy): number {
  const pr = WORLD.pier;
  return e.x >= pr.x0 && e.x <= pr.x1 && e.z >= pr.z0 && e.z <= pr.z1 ? pr.y : -99;
}

function moveToward(w: World, e: Enemy, tx: number, tz: number, speed: number, dt: number, collide = true): number {
  if (collide) {
    // обход срубов: цель за домом → идём к его свободному углу
    const skip = houseAt(w.layout.houses, tx, tz);
    [tx, tz] = steerAround(w.statics, e.x, e.z, tx, tz, e.r, skip);
  }
  let dx = tx - e.x;
  let dz = tz - e.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  if (e.avoid > 0) {
    e.avoid -= dt;
    const a = 1.1 * e.avoidSign;
    const rx = dx * Math.cos(a) - dz * Math.sin(a);
    const rz = dx * Math.sin(a) + dz * Math.cos(a);
    dx = rx;
    dz = rz;
  }
  e.vx = dx * speed;
  e.vz = dz * speed;
  e.kx *= Math.exp(-6 * dt);
  e.kz *= Math.exp(-6 * dt);
  const ox = e.x;
  const oz = e.z;
  const pos = { x: e.x + (e.vx + e.kx) * dt, z: e.z + (e.vz + e.kz) * dt };
  if (collide) w.statics.resolve(pos, e.r);
  e.x = pos.x;
  e.z = pos.z;
  const moved = Math.hypot(e.x - ox, e.z - oz);
  if (collide && speed > 0.5 && moved < speed * dt * 0.3 && e.avoid <= 0) {
    e.avoid = 0.7;
    e.avoidSign = -e.avoidSign;
  }
  if (speed > 0.1) e.yaw = e.yaw + wrapAngle(Math.atan2(dz, dx) - e.yaw) * Math.min(1, dt * 10);
  return d;
}

function contactAttack(w: World, e: Enemy, dist: number, dmg: number, cd: number, knock: number): void {
  if (dist < e.r + PLAYER_R + 0.25 && e.atkCd <= 0) {
    e.atkCd = cd;
    damagePlayer(w, dmg, e.x, e.z, knock);
  }
}

function whisperer(w: World, e: Enemy, dist: number, nearFlare: number, dt: number): void {
  const p = w.player;
  if (e.t < 0.05 && !e.fake && w.rng.chance(0.35)) w.emit('alert', e.x, e.y, e.z);
  let speed = e.speed;
  let tx = p.x;
  let tz = p.z;
  // шептун сухой, как старая бумага: в огне ракеты вспыхивает, горит ещё пару секунд
  // после того, как выбежал из света, и поджигает тех, кто ползёт вплотную
  if (nearFlare < 5.5 && !e.fake) {
    if (e.burn <= 0) w.emit('ignite', e.x, e.y + 0.5, e.z, e.kind);
    e.burn = Math.max(e.burn, 2.2);
  }
  if (e.burn > 0 && !e.fake) {
    e.burn = Math.max(0, e.burn - dt);
    e.hp -= 14 * dt;
    if (e.hp <= 0) {
      killEnemy(w, e, false);
      return;
    }
    for (const o of w.enemies) {
      if (o === e || !o.active || o.kind !== Kind.Whisperer || o.fake || o.burn > 0) continue;
      if (Math.hypot(o.x - e.x, o.z - e.z) < 0.95 && w.rng.chance(dt * 2.5)) {
        o.burn = 1.8;
        w.emit('ignite', o.x, o.y + 0.5, o.z, o.kind);
      }
    }
    // мечется прочь от игрока и от огня
    tx = e.x + (e.x - p.x);
    tz = e.z + (e.z - p.z);
    speed *= 1.15;
  } else if (e.litTorch) {
    speed *= 1 - ENEMIES[Kind.Whisperer].lightFear;
    if (e.litTime > 1.3) {
      // слишком долго в свете — отпрянуть в сторону
      const side = e.avoidSign;
      tx = e.x - (p.z - e.z) * side;
      tz = e.z + (p.x - e.x) * side;
      speed *= 1.6;
      if (e.litTime > 2.2) e.litTime = 0;
    }
  }
  [tx, tz] = route(w, e, tx, tz);
  moveToward(w, e, tx, tz, speed, dt);
  e.stepAcc += speed * dt;

  if (e.fake) {
    if (dist < 1.1) {
      w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
      p.sanity = Math.max(0, p.sanity - 3);
      e.active = false;
    }
    if (e.t > 14) {
      w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
      e.active = false;
    }
    return;
  }
  contactAttack(w, e, dist, ENEMIES[Kind.Whisperer].dmg, ENEMIES[Kind.Whisperer].atkCd, 3);
}

function mute(w: World, e: Enemy, dist: number, dt: number): void {
  const p = w.player;
  // state: 0 — идёт на шум, 1 — рывок, 2 — восстановление после рывка
  if (e.state === 0) {
    let best = -1;
    let bestT = -1;
    for (let i = 0; i < 8; i++) {
      const loud = w.noises[i * 4 + 2]!;
      const t = w.noises[i * 4 + 3]!;
      if (loud <= 0 || w.time - t > 6) continue;
      const nd = Math.hypot(w.noises[i * 4]! - e.x, w.noises[i * 4 + 1]! - e.z);
      if (nd < loud * 34 && t > bestT) {
        best = i;
        bestT = t;
      }
    }
    if (best >= 0) {
      e.tx = w.noises[best * 4]!;
      e.tz = w.noises[best * 4 + 1]!;
    } else if (e.t < 1 || (e.tx === 0 && e.tz === 0)) {
      e.tx = w.layout.pole.x;
      e.tz = w.layout.pole.z;
    }
    const [rx, rz] = route(w, e, e.tx, e.tz);
    const d = moveToward(w, e, rx, rz, e.speed, dt);
    if (d < 1.5 && best < 0) {
      // бредёт к последнему месту, где было шумно, затем — к площади
      e.tx = w.layout.pole.x + w.rng.range(-8, 8);
      e.tz = w.layout.pole.z + w.rng.range(-8, 8);
    }
    const heard = w.time - p.lastNoiseT < 1.2 || (p.moving && dist < 5);
    if (dist < 7 && heard && e.atkCd <= 0) {
      e.state = 1;
      e.t = 0;
      e.tx = p.x;
      e.tz = p.z;
      w.emit('charge', e.x, e.y, e.z);
    }
    if (w.rng.chance(dt * 0.25)) w.emit('growl', e.x, e.y + 1.5, e.z);
    contactAttack(w, e, dist, ENEMIES[Kind.Mute].dmg, ENEMIES[Kind.Mute].atkCd, 6);
  } else if (e.state === 1) {
    moveToward(w, e, e.tx + (e.tx - e.x), e.tz + (e.tz - e.z), 7, dt);
    if (dist < e.r + PLAYER_R + 0.3) {
      damagePlayer(w, 34, e.x, e.z, 14);
      e.state = 2;
      e.t = 0;
    }
    if (e.t > 1.1) {
      e.state = 2;
      e.t = 0;
    }
  } else {
    e.vx = e.vz = 0;
    if (e.t > 1.6) {
      e.state = 0;
      e.t = 0;
      e.atkCd = 1.5;
    }
  }
}

/**
 * Отголосок — вы сами, ECHO_DELAY тиков (1 с) назад. Проигрывает записанное прошлое точь-в-точь:
 * тот же путь, тот же прицел, то же оружие, те же выстрелы — и они ранят вас нынешнего.
 * Стоите — прошлое догоняет и сливается с вами (без вреда). Пойдёте назад по своему следу —
 * столкнётесь с собой, и это больно.
 */
function echo(w: World, e: Enemy, dist: number, dt: number): void {
  const p = w.player;
  const i = w.pastAt(ECHO_DELAY);
  e.delay = i === null ? 1 : 0;
  if (i === null) return; // прошлого ещё не накопилось — ждёт, невидимый
  const b = w.past;
  const ox = e.x;
  const oz = e.z;
  e.x = b[i]!;
  e.z = b[i + 1]!;
  e.yaw = b[i + 2]!;
  e.tx = b[i + 3]!;
  const flags = b[i + 4]!;
  // скорость — только для анимации шага
  e.vx = (e.x - ox) / Math.max(dt, 1e-6);
  e.vz = (e.z - oz) / Math.max(dt, 1e-6);
  e.stepAcc += Math.hypot(e.x - ox, e.z - oz);
  if (e.stepAcc > 1.05) {
    e.stepAcc = 0;
    w.emit('echoStep', e.x, e.y, e.z);
  }
  if (flags & 2) echoFire(w, e, e.tx, e.yaw);
  if (dist < e.r + PLAYER_R + 0.15 && e.atkCd <= 0) {
    if (p.stillT > 0.4) {
      // вы стояли — прошлое догнало и вошло в вас: тихо, без вреда
      w.flags.add('echoMerged');
      w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
    } else {
      // вы шли навстречу своему следу — столкнулись с собой
      damagePlayer(w, ENEMIES[Kind.Echo].dmg, e.x, e.z, 4);
      w.flags.add('broke:3');
      p.sanity = Math.max(0, p.sanity - 14);
      w.emit('vanish', e.x, e.y, e.z, e.kind, 1);
    }
    e.active = false;
  }
}

function apparition(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  void dt;
  if (e.state === 1) {
    // стоит спиной (к воде, к стене); от взгляда не исчезает — ждёт, что позовут
    return;
  }
  if (e.state === 3) {
    e.yaw = e.yaw + wrapAngle(Math.atan2(p.z - e.z, p.x - e.x) - e.yaw) * 0.04;
    return;
  }
  e.yaw = Math.atan2(p.z - e.z, p.x - e.x);
  if (e.state === 2) {
    // за спиной: исчезнет, только когда вы обернётесь и посветите на него — и тогда лицо
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const looking = (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / d > Math.cos(0.55);
    if ((looking && e.t > 0.3) || e.t > e.tx) {
      e.active = false;
      w.emit('vanish', e.x, e.y, e.z, e.kind, 1);
      w.jumpscare();
    }
    return;
  }
  if (e.litTorch && e.t > 0.2) {
    w.emit('vanish', e.x, e.y, e.z, e.kind, 2);
    p.sanity = clamp(p.sanity - 6, 0, 100);
    e.active = false;
    return;
  }
  if (e.t > e.tx) {
    w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
    e.active = false;
  }
}

/**
 * Хор: одиннадцать жителей в одном теле. Пули его кормят (см. damageEnemy), тишина — убивает:
 * если игрок не шумит дольше 2.5 с, песня захлёбывается. Раз в несколько секунд — волна песни:
 * рассудок, урон рядом и новые шептуны, которые провоцируют стрелять.
 */
function choir(w: World, e: Enemy, dist: number, dt: number): void {
  const p = w.player;
  w.flags.add('choirUp');
  // Три фазы:
  //  1 — песня зовёт шептунов, выстрелы кормят; убивает только тишина;
  //  2 — Хор поёт фамилии одиннадцати дворов; крик в паузе сбивает песню (сильно ранит);
  //  3 — фонарь гаснет совсем: видно только криком, а умирает Хор по-прежнему от тишины.
  const phase = e.hp > 66 ? 1 : e.hp > 33 ? 2 : 3;
  if (phase !== e.state) {
    e.state = phase;
    w.emit('choirPhase', e.x, e.y + 1.5, e.z, phase);
    w.flags.add(`choir:${phase}`);
    if (phase === 3) w.flags.add('lightsOut');
  }
  e.avoid = Math.max(0, e.avoid - dt); // оглушён криком: молчит
  const silent = w.time - p.lastNoiseT > 2.5;
  if (silent) e.hp -= (phase === 2 ? 3.5 : 7.5) * dt;
  if (e.hp <= 0) {
    killEnemy(w, e, false);
    return;
  }
  if (phase === 2 && e.avoid <= 0) {
    // перекличка: каждые 6 с — пауза после фамилии, 2 с, когда можно перебить
    e.tz -= dt;
    e.delay = Math.max(0, e.delay - dt);
    if (e.tz <= 0) {
      e.tz = 6;
      e.delay = 2;
      e.phase = (e.phase + 1) % 11;
      w.emit('choirNames', e.x, e.y + 1.5, e.z, Math.floor(e.phase), 2);
    }
  }
  if (dist < 30) moveToward(w, e, p.x, p.z, e.speed * (silent ? 0.6 : 1.3), dt);
  e.tx -= dt;
  if (e.tx <= 0 && e.avoid <= 0) {
    e.tx = 4.5;
    w.emit('choirPulse', e.x, e.y + 1.5, e.z, silent ? 0 : 1);
    if (dist < 14) {
      p.sanity = Math.max(0, p.sanity - 5);
      damagePlayer(w, 6, e.x, e.z, 2);
    }
    let alive = 0;
    for (const o of w.enemies) if (o.active && o.kind === Kind.Whisperer) alive++;
    for (let i = 0; i < 2 && alive < 10; i++, alive++) {
      const a = w.rng.range(0, Math.PI * 2);
      spawnEnemy(w, Kind.Whisperer, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3);
    }
  }
  contactAttack(w, e, dist, ENEMIES[Kind.Choir].dmg, ENEMIES[Kind.Choir].atkCd, 8);
}

/** Крик посреди переклички Хора: песня сбивается. true — попали в паузу. */
export function shoutAtChoir(w: World): boolean {
  const p = w.player;
  for (const e of w.enemies) {
    if (!e.active || e.kind !== Kind.Choir || e.state !== 2 || e.delay <= 0) continue;
    if (Math.hypot(e.x - p.x, e.z - p.z) > 30) continue;
    e.hp -= 18;
    e.delay = 0;
    e.avoid = 3;
    w.emit('choirStun', e.x, e.y + 1.5, e.z);
    return true;
  }
  return false;
}

/**
 * Невидевший: двигается, только когда на него не смотрят. В луче фонаря — каменеет.
 * Механика из Наказа: «если кто-то закрыл лицо руками — не отворачивайтесь».
 */
function unseeing(w: World, e: Enemy, dist: number, dt: number): void {
  const p = w.player;
  const seen = e.litTorch && dist < 15;
  if (seen) {
    e.vx = e.vz = 0;
    e.kx *= Math.exp(-6 * dt);
    e.kz *= Math.exp(-6 * dt);
    e.state = 1;
    e.seenYaw = p.yaw;
    return;
  }
  if (e.state === 1) {
    // сорвался с места, как только вы отвели взгляд
    e.state = 0;
    if (dist < 10) w.emit('alert', e.x, e.y, e.z, 1);
    // Наказ: «если кто-то закрыл лицо руками — не отворачивайтесь». Не мигнувший свет, а именно
    // поворот спиной к тому, кто рядом, — нарушение, и он бросается сразу, рывком.
    const rule = w.cfg.night.turnRule;
    const turned = Math.abs(wrapAngle(p.yaw - e.seenYaw)) > 1.2;
    if (rule && turned && dist < 7 && e.delay !== 2) {
      w.flags.add(`broke:${rule}`);
      w.flags.add('turnedAway');
      const d = dist || 1;
      e.kx += ((p.x - e.x) / d) * 9;
      e.kz += ((p.z - e.z) / d) * 9;
      e.atkCd = 0;
    }
  }
  if (e.delay === 2) {
    procession(w, e, dt);
    return;
  }
  if (e.delay === 3) {
    // свидетели: подходят и встают вокруг — смотреть, что вы решите. Не нападают.
    if (dist > 2.8) moveToward(w, e, p.x, p.z, 0.8, dt);
    else {
      e.vx = e.vz = 0;
      e.yaw = Math.atan2(p.z - e.z, p.x - e.x);
    }
    return;
  }
  let tx = p.x;
  let tz = p.z;
  [tx, tz] = route(w, e, tx, tz);
  moveToward(w, e, tx, tz, e.speed, dt);
  e.stepAcc += e.speed * dt;
  if (e.stepAcc > 1.3) {
    e.stepAcc = 0;
    if (dist < 14) w.emit('echoStep', e.x, e.y, e.z, 1);
  }
  contactAttack(w, e, dist, ENEMIES[Kind.Unseeing].dmg, ENEMIES[Kind.Unseeing].atkCd, 5);
}

/**
 * Процессия: одиннадцать выходят из Глядня и идут к радиоузлу — домой. Не нападают.
 * Пока на них светят — стоят. Дошедший до двери «входит» в дом: эфир гаснет.
 * Не дошедшие к концу — уходят обратно под воду.
 */
function procession(w: World, e: Enemy, dt: number): void {
  const d = w.layout.hutDoor;
  if (e.age < 0) {
    // ещё под водой — ждёт своей очереди
    e.vx = e.vz = 0;
    return;
  }
  if (e.age > 55) {
    w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
    e.active = false;
    return;
  }
  moveToward(w, e, d.x, d.z, 1.15, dt);
  e.stepAcc += 1.15 * dt;
  if (e.stepAcc > 1.4) {
    e.stepAcc = 0;
    w.emit('echoStep', e.x, e.y, e.z, 1);
  }
  if (Math.hypot(e.x - d.x, e.z - d.z) < 1.8) {
    // вошёл в дом, который когда-то был его: радио захлёбывается
    w.air = 0;
    w.flags.add('procReached');
    w.player.sanity = Math.max(0, w.player.sanity - 8);
    w.emit('scare', e.x, 1, e.z, -1, 0, 0, 'wet');
    w.emit('vanish', e.x, e.y, e.z, e.kind, 2);
    e.active = false;
  }
}

/**
 * Если игрок в доме, а враг снаружи (или наоборот) — идти через дверной проём:
 * сначала к крыльцу, потом внутрь. Так они «входят в дверь», а не трутся о стены.
 */
function route(w: World, e: Enemy, tx: number, tz: number): [number, number] {
  const ph = w.playerHouse;
  const eh = houseAt(w.layout.houses, e.x, e.z);
  if (ph === eh) return [tx, tz];
  const h = w.layout.houses[ph >= 0 ? ph : eh];
  if (!h) return [tx, tz];
  const outside = doorOf(h, 1.4);
  const inside = doorOf(h, -0.9);
  // «в створе двери» — по локальным координатам дома: дальше идём насквозь, без возврата к крыльцу
  const [lx, lz] = toLocal(h, e.x, e.z);
  const inDoorway = Math.abs(lx) < 0.9 && lz > h.d / 2 - 1.2 && lz < h.d / 2 + 1.7;
  if (ph >= 0) return inDoorway ? [inside.x, inside.z] : [outside.x, outside.z];
  return inDoorway ? [outside.x, outside.z] : [inside.x, inside.z];
}

function separate(w: World): void {
  const list = w.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    if (!a.active || a.kind === Kind.Echo || a.kind === Kind.Apparition) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (!b.active || b.kind === Kind.Echo || b.kind === Kind.Apparition) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rr = a.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / d;
      const ma = a.kind === Kind.Mute ? 6 : 1;
      const mb = b.kind === Kind.Mute ? 6 : 1;
      const ka = mb / (ma + mb);
      const kb = ma / (ma + mb);
      a.x -= dx * push * ka;
      a.z -= dz * push * ka;
      b.x += dx * push * kb;
      b.z += dz * push * kb;
    }
  }
}
