import { WEAPONS } from '../content/weapons';
import { Kind } from '../content/enemies';
import { groundAt, heightAt, water } from '../proc/terrain';
import { rayCircle } from './collision';
import { PLAYER_R } from './player';
import type { World } from './world';
import type { Enemy } from './types';

const MUZZLE = 0.7;
const hits: { e: Enemy; t: number }[] = [];

export function fireWeapon(w: World): void {
  const p = w.player;
  const wd = WEAPONS[p.weapon]!;
  if (!w.cheats.ammo) p.mag[p.weapon]! -= 1;
  p.cooldown = wd.rate;
  p.fired = p.weapon + 1;
  const mx = p.x + Math.cos(p.yaw) * MUZZLE;
  const mz = p.z + Math.sin(p.yaw) * MUZZLE;
  w.emit('shot', mx, p.y + 1.15, mz, p.weapon, p.yaw);
  w.noise(p.x, p.z, wd.noise);
  p.lastNoiseT = w.time;
  // отдача
  p.kx -= Math.cos(p.yaw) * wd.knock * 0.35;
  p.kz -= Math.sin(p.yaw) * wd.knock * 0.35;

  if (wd.kind === 'flare') {
    const pr = allocProjectile(w);
    if (pr) {
      pr.kind = 1;
      pr.x = mx;
      pr.z = mz;
      pr.y = p.y + 1.2;
      pr.vx = Math.cos(p.yaw) * 19;
      pr.vz = Math.sin(p.yaw) * 19;
      pr.vy = 2.5;
      pr.fuse = 1.6;
      pr.bounces = 0;
    }
    return;
  }

  for (let k = 0; k < wd.pellets; k++) {
    const a = p.yaw + (w.rng.next() * 2 - 1) * wd.spread;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const range = wd.range * (wd.pellets > 1 ? w.rng.range(0.75, 1) : 1);
    const tStatic = w.statics.raycast(mx, mz, dx, dz, range);
    let tEnd = tStatic;
    let hitType = tStatic < range ? 2 : 0;

    hits.length = 0;
    for (const e of w.enemies) {
      if (!e.active) continue;
      if (e.kind === Kind.Echo && !e.litAny) continue; // Отголосок неуязвим в темноте
      const t = rayCircle(mx, mz, dx, dz, e.x, e.z, e.r + 0.08);
      if (t >= 0 && t < tStatic) hits.push({ e, t });
    }
    for (const b of w.barrels) {
      if (!b.alive) continue;
      const t = rayCircle(mx, mz, dx, dz, b.x, b.z, 0.45);
      if (t >= 0 && t < tEnd && (hits.length === 0 || t < minT())) {
        b.hp -= wd.dmg;
        if (b.hp <= 0 && b.fuse < 0) b.fuse = 0.05;
        tEnd = t;
        hitType = 2;
        hits.length = 0;
      }
    }
    hits.sort((u, v) => u.t - v.t);
    let pierced = 0;
    let falloffDmg = wd.dmg;
    for (const h of hits) {
      if (pierced >= wd.pierce) break;
      const e = h.e;
      const dmg = falloffDmg * (wd.pellets > 1 ? Math.max(0.35, 1 - h.t / range) : 1);
      damageEnemy(w, e, dmg, dx * wd.knock, dz * wd.knock);
      tEnd = h.t;
      hitType = 1;
      pierced++;
      falloffDmg *= 0.7;
    }
    w.emit('tracer', mx, p.y + 1.15, mz, mx + dx * tEnd, mz + dz * tEnd, hitType);
  }
}

/**
 * Выстрел Отголоска: ваш собственный выстрел из прошлого — с того же места, в ту же сторону,
 * из того же оружия. Ранит только вас (врагов прошлого здесь уже нет). Шум не поднимает.
 */
export function echoFire(w: World, e: Enemy, weapon: number, yaw: number): void {
  const wd = WEAPONS[weapon];
  if (!wd) return;
  const p = w.player;
  const mx = e.x + Math.cos(yaw) * MUZZLE;
  const mz = e.z + Math.sin(yaw) * MUZZLE;
  w.emit('shot', mx, e.y + 1.15, mz, weapon, yaw, 1);
  if (wd.kind === 'flare') return;
  let dealt = 0;
  for (let k = 0; k < wd.pellets; k++) {
    const a = yaw + (w.rng.next() * 2 - 1) * wd.spread;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const range = wd.range;
    const tStatic = w.statics.raycast(mx, mz, dx, dz, range);
    const t = rayCircle(mx, mz, dx, dz, p.x, p.z, PLAYER_R + 0.05);
    const hit = t >= 0 && t < tStatic && p.alive;
    if (hit) dealt += wd.dmg * 0.25 * (wd.pellets > 1 ? Math.max(0.35, 1 - t / range) : 1);
    const tEnd = hit ? t : tStatic;
    w.emit('tracer', mx, e.y + 1.15, mz, mx + dx * tEnd, mz + dz * tEnd, hit ? 4 : 3);
  }
  if (dealt > 0) {
    // пули памяти слабее настоящих: не больше 10 за выстрел
    damagePlayer(w, Math.min(10, dealt), e.x, e.z, 1.5);
    w.flags.add('echoShot');
  }
}

function minT(): number {
  let m = Infinity;
  for (const h of hits) if (h.t < m) m = h.t;
  return m;
}

export function damageEnemy(w: World, e: Enemy, dmg: number, kx: number, kz: number, explosive = false): void {
  if (!e.active) return;
  if (e.fake) {
    // Галлюцинация: исчезает без крови. Игра не сообщает, что её не было.
    w.emit('vanish', e.x, e.y, e.z, e.kind, 0);
    e.active = false;
    return;
  }
  if (e.kind === Kind.Apparition) return;
  if (e.kind === Kind.Choir) {
    // пули и взрывы кормят Хор: он растёт и поёт громче
    e.hp = Math.min(150, e.hp + dmg * 0.35);
    e.flash = 1;
    w.emit('feed', e.x, e.y + 1.5, e.z, e.hp);
    return;
  }
  const mass = e.kind === Kind.Mute ? 6 : e.kind === Kind.Unseeing ? 2 : 1;
  e.hp -= dmg;
  e.flash = 1;
  e.kx += kx / mass;
  e.kz += kz / mass;
  w.emit('hit', e.x, e.y + (e.kind === Kind.Mute ? 1.4 : 0.6), e.z, dmg, kx, kz);
  if (e.hp <= 0) killEnemy(w, e, explosive);
}

export function killEnemy(w: World, e: Enemy, explosive: boolean): void {
  e.active = false;
  if (e.kind === Kind.Choir) {
    w.flags.add('choirDown');
    // песня кончилась — фонарь вспыхивает снова
    w.flags.delete('lightsOut');
    w.player.battery = Math.max(w.player.battery, 0.6);
  }
  // В тишине умирающий шептун договаривает то, что не сказал. Радио это заглушает.
  if (w.deadAir && e.kind === Kind.Whisperer && w.time - w.lastFragT > 3.5) {
    w.addFragment(e.x, e.y + 0.6, e.z);
    w.player.sanity = Math.max(0, w.player.sanity - 2);
  }
  // b: 1 — разорван взрывом, 2 — сгорел, 0 — обычная смерть
  w.emit('kill', e.x, e.y, e.z, e.kind, explosive ? 1 : e.burn > 0 ? 2 : 0, e.yaw);
  w.player.sanity = Math.min(100, w.player.sanity + 0.6);
  w.intensity = Math.min(1, w.intensity + 0.04);
}

export function damagePlayer(w: World, dmg: number, fromX: number, fromZ: number, knock: number): void {
  const p = w.player;
  if (!p.alive || p.invuln > 0 || w.cheats.god) return;
  p.hp -= dmg;
  p.invuln = 0.35;
  p.sanity = Math.max(0, p.sanity - dmg * 0.18);
  const dx = p.x - fromX;
  const dz = p.z - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  p.kx += (dx / d) * knock;
  p.kz += (dz / d) * knock;
  w.intensity = Math.min(1, w.intensity + dmg * 0.012);
  w.emit('playerHurt', p.x, p.y, p.z, dmg, dx / d, dz / d);
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.canReel = false;
    p.holdingReel = false;
    w.state = 'dead';
    w.emit('playerDeath', p.x, p.y, p.z);
  }
}

export function throwDynamite(w: World): void {
  const p = w.player;
  const pr = allocProjectile(w);
  if (!pr) return;
  p.dynamite--;
  p.throwCd = 0.7;
  pr.kind = 0;
  pr.x = p.x + Math.cos(p.yaw) * 0.5;
  pr.z = p.z + Math.sin(p.yaw) * 0.5;
  pr.y = p.y + 1.4;
  pr.vx = Math.cos(p.yaw) * 10.5 + p.vx * 0.5;
  pr.vz = Math.sin(p.yaw) * 10.5 + p.vz * 0.5;
  pr.vy = 6.2;
  pr.fuse = 1.75;
  pr.bounces = 0;
  w.emit('throw', pr.x, pr.y, pr.z);
}

function allocProjectile(w: World) {
  for (const pr of w.projectiles) {
    if (!pr.active) {
      pr.active = true;
      return pr;
    }
  }
  return null;
}

export function explode(w: World, x: number, z: number, radius: number, dmg: number): void {
  const y = groundAt(x, z);
  w.emit('explosion', x, y, z, radius);
  w.noise(x, z, 1.7);
  w.player.lastNoiseT = w.time;
  w.intensity = Math.min(1, w.intensity + 0.25);
  for (const e of w.enemies) {
    if (!e.active || e.kind === Kind.Apparition) continue;
    const dx = e.x - x;
    const dz = e.z - z;
    const d = Math.hypot(dx, dz);
    if (d > radius) continue;
    const f = 1 - d / radius;
    const k = 16 * f;
    damageEnemy(w, e, dmg * (0.35 + 0.65 * f), (dx / (d || 1)) * k, (dz / (d || 1)) * k, true);
  }
  const p = w.player;
  const pd = Math.hypot(p.x - x, p.z - z);
  if (pd < radius) {
    const f = 1 - pd / radius;
    damagePlayer(w, 55 * f, x, z, 12 * f);
  }
  for (const b of w.barrels) {
    if (!b.alive || b.fuse >= 0) continue;
    if (Math.hypot(b.x - x, b.z - z) < radius) b.fuse = 0.12 + w.rng.next() * 0.1;
  }
}

export function updateProjectiles(w: World, dt: number): void {
  for (const pr of w.projectiles) {
    if (!pr.active) continue;
    pr.vy -= 18 * dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.z += pr.vz * dt;
    // стены домов
    const pos = { x: pr.x, z: pr.z };
    for (const b of w.statics.boxes) {
      const bx = pos.x;
      const bz = pos.z;
      if (pushBoxPoint(pos, b)) {
        pr.vx = -pr.vx * 0.4;
        pr.vz = -pr.vz * 0.4;
        pr.x = pos.x + (pos.x - bx) * 0.1;
        pr.z = pos.z + (pos.z - bz) * 0.1;
      }
    }
    const g = groundAt(pr.x, pr.z);
    const wet = heightAt(pr.x, pr.z) < water.level && pr.y < water.level;
    if (pr.y <= g + 0.05 || wet) {
      if (pr.kind === 1) {
        landFlare(w, pr.x, Math.max(g, wet ? water.level : g), pr.z);
        pr.active = false;
        continue;
      }
      if (wet) {
        w.emit('splash', pr.x, water.level, pr.z);
        pr.active = false; // шашка тонет
        continue;
      }
      pr.y = g + 0.05;
      if (Math.abs(pr.vy) > 2) w.emit('bounce', pr.x, pr.y, pr.z);
      pr.vy = Math.abs(pr.vy) * 0.32;
      pr.vx *= 0.55;
      pr.vz *= 0.55;
      pr.bounces++;
    }
    pr.fuse -= dt;
    if (pr.fuse <= 0) {
      pr.active = false;
      if (pr.kind === 0) explode(w, pr.x, pr.z, 5.5, 170);
      else landFlare(w, pr.x, Math.max(groundAt(pr.x, pr.z), pr.y), pr.z);
    }
  }
}

function pushBoxPoint(pos: { x: number; z: number }, b: { cx: number; cz: number; hw: number; hd: number; c: number; s: number }): boolean {
  const rx = pos.x - b.cx;
  const rz = pos.z - b.cz;
  const lx = rx * b.c - rz * b.s;
  const lz = rx * b.s + rz * b.c;
  if (Math.abs(lx) > b.hw || Math.abs(lz) > b.hd) return false;
  let ox = lx;
  let oz = lz;
  if (b.hw - Math.abs(lx) < b.hd - Math.abs(lz)) ox = Math.sign(lx) * (b.hw + 0.05);
  else oz = Math.sign(lz) * (b.hd + 0.05);
  pos.x = b.cx + ox * b.c + oz * b.s;
  pos.z = b.cz - ox * b.s + oz * b.c;
  return true;
}

function landFlare(w: World, x: number, y: number, z: number): void {
  let slot = w.flares[0]!;
  for (const f of w.flares) {
    if (!f.active) {
      slot = f;
      break;
    }
    if (f.t > slot.t) slot = f;
  }
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.t = 0;
  slot.life = 24;
  w.emit('flareLand', x, y, z);
}

export function updateFlares(w: World, dt: number): void {
  for (const f of w.flares) {
    if (!f.active) continue;
    f.t += dt;
    if (f.t > f.life) f.active = false;
  }
}

export function updateBarrels(w: World, dt: number): void {
  for (const b of w.barrels) {
    if (!b.alive || b.fuse < 0) continue;
    b.fuse -= dt;
    if (b.fuse <= 0) {
      b.alive = false;
      explode(w, b.x, b.z, 6.5, 200);
    }
  }
}
