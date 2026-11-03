import { clamp, damp, dampAngle, wrapAngle } from '../core/math';
import { groundAt, heightAt, isWater, surfaceAt, water } from '../proc/terrain';
import { WEAPONS } from '../content/weapons';
import { Kind } from '../content/enemies';
import { TRAIL_SIZE, type World } from './world';
import type { InputFrame } from './types';
import { fireWeapon, throwDynamite } from './combat';
import { updateInteract } from './interact';

export const PLAYER_R = 0.38;
const SPEED = 4.7;
const TRAIL_STEP = 0.12;

/** Крутизна, начиная с которой склон — стена (≈51°). */
export const MAX_SLOPE = 1.25;

function slopeOf(ox: number, oz: number, nx: number, nz: number): number {
  const d = Math.hypot(nx - ox, nz - oz);
  return d > 1e-6 ? (heightAt(nx, nz) - heightAt(ox, oz)) / d : 0;
}

/**
 * Шаг по рельефу. Горизонтальная скорость постоянна только на ровном: на подъёме шаг короче
 * (иначе по крутому склону персонаж «взлетает»), на спуске — по длине вдоль склона.
 * В слишком крутую стену не идём — скользим вдоль неё по одной из осей.
 */
export function slopeStep(ox: number, oz: number, nx: number, nz: number): [number, number] {
  let s = slopeOf(ox, oz, nx, nz);
  if (s > MAX_SLOPE) {
    if (slopeOf(ox, oz, nx, oz) <= MAX_SLOPE) nz = oz;
    else if (slopeOf(ox, oz, ox, nz) <= MAX_SLOPE) nx = ox;
    else return [ox, oz];
    s = slopeOf(ox, oz, nx, nz);
  }
  const k = s > 0 ? 1 / (1 + s * 0.9) : 1 / Math.sqrt(1 + s * s);
  return [ox + (nx - ox) * k, oz + (nz - oz) * k];
}

export function updatePlayer(w: World, inp: InputFrame, dt: number): void {
  const p = w.player;
  if (!p.alive) return;

  p.invuln = Math.max(0, p.invuln - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.throwCd = Math.max(0, p.throwCd - dt);

  // --- бобина (удержание действия у радиоузла) ---
  const door = w.layout.hutDoor;
  const nearHut = Math.hypot(p.x - door.x, p.z - door.z) < 2.1;
  if (nearHut && !w.flags.has('hutVisited')) w.flags.add('hutVisited');
  // без лампы (вторая ночь) бобину не запустить
  p.canReel = nearHut && w.air < 0.985 && !w.flags.has('reelLocked') && !w.cfg.night.noRadio;
  p.holdingReel = p.canReel && inp.action;
  if (p.holdingReel) {
    p.reel += dt / 2.4;
    if (p.reel >= 1) {
      p.reel = 0;
      w.air = 1;
      if (w.deadAir) {
        w.deadAir = false;
        w.flags.add('airRestored');
      }
      w.emit('airRestored', door.x, 1, door.z);
    } else {
      w.emit('reelProgress', door.x, 1, door.z, p.reel);
    }
  } else {
    p.reel = Math.max(0, p.reel - dt * 2);
  }
  updateInteract(w, inp, dt);

  // --- движение ---
  let mx = inp.mx;
  let mz = inp.mz;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  const moving = ml > 0.12 && !p.holdingReel && !p.holding;
  const speed = SPEED * (inp.aiming ? 0.82 : 1) * (moving ? 1 : 0);
  p.vx = damp(p.vx, mx * speed, 14, dt);
  p.vz = damp(p.vz, mz * speed, 14, dt);
  p.kx = damp(p.kx, 0, 7, dt);
  p.kz = damp(p.kz, 0, 7, dt);

  const ox = p.x;
  const oz = p.z;
  let nx = ox + (p.vx + p.kx) * dt;
  let nz = oz + (p.vz + p.kz) * dt;
  // склоны: в гору — медленнее, отвесные стены (Щель) не пройти; вниз — без рывков
  [nx, nz] = slopeStep(ox, oz, nx, nz);
  // в воду не заходят; но если вода поднялась под ногами — выбраться можно куда угодно
  const inWater = isWater(ox, oz);
  if (isWater(nx, nz) && !inWater) {
    if (!isWater(nx, oz)) nz = oz;
    else if (!isWater(ox, nz)) nx = ox;
    else {
      nx = ox;
      nz = oz;
    }
  }
  const pos = { x: nx, z: nz };
  w.statics.resolve(pos, PLAYER_R);
  for (const b of w.barrels) {
    if (!b.alive) continue;
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < PLAYER_R + 0.45 && d > 1e-4) {
      pos.x = b.x + (dx / d) * (PLAYER_R + 0.45);
      pos.z = b.z + (dz / d) * (PLAYER_R + 0.45);
    }
  }
  if (isWater(pos.x, pos.z) && !inWater) {
    pos.x = ox;
    pos.z = oz;
  }
  p.x = pos.x;
  p.z = pos.z;
  p.y = groundAt(p.x, p.z);
  w.updatePlayerHouse();
  const travelled = Math.hypot(p.x - ox, p.z - oz);
  p.moving = travelled > 0.2 * dt;
  p.stillT = p.moving ? 0 : p.stillT + dt;

  // --- шаги: звук + шум для слуха врагов ---
  p.stepAcc += travelled;
  if (p.stepAcc > 1.05) {
    p.stepAcc = 0;
    w.emit('step', p.x, p.y, p.z, surfaceAt(p.x, p.z));
    w.noise(p.x, p.z, 0.18);
  }

  // --- след для Отголоска ---
  const li = ((w.trailCount + TRAIL_SIZE - 1) % TRAIL_SIZE) * 2;
  if (w.trailCount === 0 || Math.hypot(p.x - w.trail[li]!, p.z - w.trail[li + 1]!) >= TRAIL_STEP) {
    const i = (w.trailCount % TRAIL_SIZE) * 2;
    w.trail[i] = p.x;
    w.trail[i + 1] = p.z;
    w.trailCount++;
  }

  // --- прицел ---
  const al = Math.hypot(inp.ax, inp.az);
  if (inp.aiming && al > 0.08) {
    let yaw = Math.atan2(inp.az, inp.ax);
    if (inp.assist) yaw = assistAim(w, yaw);
    p.yaw = dampAngle(p.yaw, yaw, 30, dt);
  } else if (moving) {
    p.yaw = dampAngle(p.yaw, Math.atan2(mz, mx), 9, dt);
  }

  // --- оружие ---
  const wd = WEAPONS[p.weapon]!;
  if (p.reload > 0) {
    p.reload -= dt;
    if (p.reload <= 0) {
      const need = wd.mag - p.mag[p.weapon]!;
      const take = Math.min(need, p.reserve[p.weapon]!);
      p.mag[p.weapon]! += take;
      p.reserve[p.weapon]! -= take;
      p.reload = 0;
    }
  }
  if (inp.swap) {
    p.reload = 0;
    for (let k = 1; k <= WEAPONS.length; k++) {
      const idx = (p.weapon + k) % WEAPONS.length;
      if (p.owned[idx]) {
        p.weapon = idx;
        break;
      }
    }
    p.cooldown = Math.max(p.cooldown, 0.25);
    w.emit('swap', p.x, p.y, p.z, p.weapon);
  }
  const startReload = (): void => {
    const cur = WEAPONS[p.weapon]!;
    if (p.reload <= 0 && p.mag[p.weapon]! < cur.mag && p.reserve[p.weapon]! > 0) {
      p.reload = cur.reload;
      w.emit('reload', p.x, p.y, p.z, p.weapon);
    }
  };
  if (inp.reload) startReload();
  // ребёнок во флешбэке безоружен
  if (inp.fire && p.owned[p.weapon] && !p.holdingReel && !p.holding && p.cooldown <= 0 && p.reload <= 0) {
    if (p.mag[p.weapon]! > 0) {
      fireWeapon(w);
    } else if (p.reserve[p.weapon]! > 0) {
      startReload();
    } else {
      p.cooldown = 0.4;
      w.emit('dryfire', p.x, p.y, p.z);
    }
  }
  if (inp.throw && p.dynamite > 0 && p.throwCd <= 0) throwDynamite(w);

  // --- голос: крик-сонар (третья ночь) ---
  p.voiceCd = Math.max(0, p.voiceCd - dt);
  if (inp.voice && w.cfg.night.voice && p.voiceCd <= 0) shout(w);

  // --- фонарь садится ---
  if (w.cfg.night.battery) p.battery = Math.max(0, p.battery - dt / 210);

  // --- находки ---
  for (const pk of w.pickups) {
    if (!pk.active) continue;
    pk.t += dt;
    if (Math.hypot(p.x - pk.x, p.z - pk.z) > 1.25) continue;
    pk.active = false;
    if (pk.kind === 0) {
      for (let i = 0; i < WEAPONS.length; i++) if (p.owned[i]) p.reserve[i]! += WEAPONS[i]!.crate;
    } else if (pk.kind === 1) {
      p.owned[pk.a] = true;
      w.flags.add(`got:${WEAPONS[pk.a]!.id}`);
      p.reserve[pk.a]! += WEAPONS[pk.a]!.crate;
      p.weapon = pk.a;
      p.reload = 0;
    } else if (pk.kind === 2) {
      p.dynamite += 2;
    } else if (pk.kind === 4) {
      p.battery = Math.min(1, p.battery + 0.5);
    } else if (pk.kind === 3) {
      p.hp = Math.min(100, p.hp + 45);
      p.sanity = Math.min(100, p.sanity + 10);
    }
    w.emit('pickup', pk.x, p.y, pk.z, pk.kind, pk.a);
  }

  // --- рассудок ---
  updateSanity(w, dt);
}

function assistAim(w: World, yaw: number): number {
  const p = w.player;
  let best = 0.32;
  let bestYaw = yaw;
  for (const e of w.enemies) {
    if (!e.active || e.kind === Kind.Apparition) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 18) continue;
    const ey = Math.atan2(dz, dx);
    const diff = Math.abs(wrapAngle(ey - yaw));
    if (diff < best) {
      best = diff;
      bestYaw = ey;
    }
  }
  return yaw + wrapAngle(bestYaw - yaw) * 0.55;
}

function updateSanity(w: World, dt: number): void {
  const p = w.player;
  const pole = w.layout.pole;
  let inLight = !w.deadAir && Math.hypot(p.x - pole.x, p.z - pole.z) < 8.5;
  for (const f of w.flares) if (f.active && Math.hypot(p.x - f.x, p.z - f.z) < 6.5) inLight = true;
  for (const h of w.layout.houses) if (h.lit && Math.hypot(p.x - h.x, p.z - h.z) < h.w * 0.5 + 3.5) inLight = true;
  const door = w.layout.hutDoor;
  if (Math.hypot(p.x - door.x, p.z - door.z) < 3.5) inLight = true;
  p.inLight = inLight;

  let ds = inLight ? 1.3 : -0.32;
  if (w.deadAir && !w.cfg.night.noRadio) ds -= 1.1;
  let seen = 0;
  for (const e of w.enemies) if (e.active && e.litTorch && !e.fake) seen++;
  ds -= 0.12 * Math.min(3, seen);
  // Восстановление в свете ограничено: тот, кто долго смотрел в темноту, полностью не отойдёт.
  const cap = 100 - Math.min(30, w.time / 18);
  p.sanity = clamp(p.sanity + ds * dt, 0, Math.max(p.sanity, cap));
  if (p.y < water.level) p.sanity = Math.max(0, p.sanity - dt * 2);
}


/**
 * Крик. Немой герой впервые подаёт голос: звук расходится кольцом и на секунды
 * «проявляет» всё вокруг; шептуны отшатываются. Но крик слышат все — и Хор им кормится.
 */
export function shout(w: World): void {
  const p = w.player;
  p.voiceCd = 4;
  p.lastNoiseT = w.time;
  w.noise(p.x, p.z, 1.1);
  w.emit('shout', p.x, p.y + 1.5, p.z);
  for (const e of w.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > 24) continue;
    e.reveal = 2.6;
    if (e.kind === Kind.Whisperer && d < 7) {
      e.litTime = 2;
      e.atkCd = Math.max(e.atkCd, 1.4);
    }
  }
}
