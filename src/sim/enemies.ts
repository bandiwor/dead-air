import { clamp, wrapAngle } from '../core/math';
import { ENEMIES, Kind } from '../content/enemies';
import { WORLD, groundAt, heightAt } from '../proc/terrain';
import { TRAIL_SIZE, type World } from './world';
import type { Enemy } from './types';
import { damagePlayer } from './combat';
import { houseAt } from './houses';
import { doorOf } from '../proc/layout';
import { PLAYER_R } from './player';

const TORCH_RANGE = 16;
const TORCH_HALF = 0.44;

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
  e.stepAcc = 0;
  e.phase = w.rng.range(0, Math.PI * 2);
  e.yaw = Math.atan2(w.player.z - z, w.player.x - x);
  e.delay = 0;
  if (kind === Kind.Echo) {
    e.delay = 46; // ≈ 5.5 м позади по вашему пути
    const pos = trailAt(w, e.delay);
    e.x = pos[0];
    e.z = pos[1];
    w.flags.add('echoSeen');
  }
  if (kind === Kind.Mute) w.flags.add('muteSeen');
  w.emit('spawn', e.x, e.y, e.z, kind, fake ? 1 : 0);
  return e;
}

const tmp: [number, number] = [0, 0];
function trailAt(w: World, back: number): [number, number] {
  const idx = Math.max(0, w.trailCount - 1 - back);
  const i = (idx % TRAIL_SIZE) * 2;
  tmp[0] = w.trail[i]!;
  tmp[1] = w.trail[i + 1]!;
  return tmp;
}

export function updateEnemies(w: World, dt: number): void {
  const p = w.player;
  const cx = Math.cos(p.yaw);
  const cz = Math.sin(p.yaw);

  for (const e of w.enemies) {
    if (!e.active) continue;
    e.t += dt;
    e.atkCd = Math.max(0, e.atkCd - dt);
    e.flash = Math.max(0, e.flash - dt * 6);
    e.fade = Math.min(1, e.fade + dt * 1.5);

    // --- освещённость ---
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    e.litTorch = false;
    if (dist < TORCH_RANGE && dist > 0.01) {
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
    }
    if (!e.active) continue;
    e.y = Math.max(heightAt(e.x, e.z), onPierY(e));
  }

  separate(w);
}

function onPierY(e: Enemy): number {
  const pr = WORLD.pier;
  return e.x >= pr.x0 && e.x <= pr.x1 && e.z >= pr.z0 && e.z <= pr.z1 ? pr.y : -99;
}

function moveToward(w: World, e: Enemy, tx: number, tz: number, speed: number, dt: number, collide = true): number {
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
  if (nearFlare < 5.5 && !e.fake) {
    // ракета обжигает: бегут прочь
    e.burn += dt;
    e.hp -= 11 * dt;
    if (e.hp <= 0) {
      w.emit('kill', e.x, e.y, e.z, e.kind, 0, e.yaw);
      e.active = false;
      return;
    }
    tx = e.x + (e.x - p.x);
    tz = e.z + (e.z - p.z);
    speed *= 1.1;
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

function echo(w: World, e: Enemy, dist: number, dt: number): void {
  const p = w.player;
  // Отголосок — это ваш путь, отстающий на e.delay отсчётов. Стоите — он тоже стоит.
  if (p.stillT > 2.6) {
    w.emit('vanish', e.x, e.y, e.z, e.kind, 1);
    e.active = false;
    return;
  }
  if (p.moving) e.delay = Math.max(6, e.delay - dt * 2.4);
  const pos = trailAt(w, Math.round(e.delay));
  const ox = e.x;
  const oz = e.z;
  e.x = pos[0];
  e.z = pos[1];
  const moved = Math.hypot(e.x - ox, e.z - oz);
  if (moved > 0.001) e.yaw = Math.atan2(e.z - oz, e.x - ox);
  e.stepAcc += moved;
  if (e.stepAcc > 1.05) {
    e.stepAcc = 0;
    w.emit('echoStep', e.x, e.y, e.z);
  }
  if (dist < e.r + PLAYER_R + 0.2 && e.atkCd <= 0) {
    damagePlayer(w, ENEMIES[Kind.Echo].dmg, e.x, e.z, 4);
    w.flags.add('broke:3');
    p.sanity = Math.max(0, p.sanity - 14);
    e.atkCd = 1;
    e.delay = 46; // отпрянул назад по следу
  }
}

function apparition(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  void dt;
  if (e.state === 1) {
    // стоит спиной на краю пристани, лицом к воде; от взгляда не исчезает — ждёт, что позовут
    e.yaw = 0;
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
  if (ph >= 0) {
    // снаружи → внутрь
    if (Math.hypot(e.x - outside.x, e.z - outside.z) > 0.9) return [outside.x, outside.z];
    return [inside.x, inside.z];
  }
  // изнутри → наружу
  if (Math.hypot(e.x - inside.x, e.z - inside.z) > 0.7) return [inside.x, inside.z];
  return [outside.x, outside.z];
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
