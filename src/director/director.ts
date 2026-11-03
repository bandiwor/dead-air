import { KIND_BY_ID, Kind } from '../content/enemies';
import { SCARES, type ScareDef, type ScareKind } from '../content/scares';
import { weaponIndex } from '../content/weapons';
import type { SpawnFrom, WaveDef } from '../content/night';
import { WORLD, isWater } from '../proc/terrain';
import { spawnEnemy } from '../sim/enemies';
import type { World } from '../sim/world';

interface QueueItem {
  kind: Kind;
  from: SpawnFrom;
  left: number;
}

interface Pending {
  at: number;
  kind: ScareKind;
}

/**
 * Режиссёр страха: ведёт волны, распределяет спавн «толчками», держит паузы и кладёт
 * пугающие биты так, чтобы они не повторялись (учёт привыкания) и чаще приходились на затишье.
 * Детерминирован: использует только world.rng.
 */
export class Director {
  private readonly w: World;
  waveIndex = -1;
  waveActive = false;
  private queue: QueueItem[] = [];
  private pulseT = 0;
  private holdT = 0;
  private nextScareAt = 16;
  private readonly cooldownUntil = new Map<ScareKind, number>();
  private readonly uses = new Map<ScareKind, number>();
  private pending: Pending[] = [];
  private jumpscares = 0;
  lastScareAt = -99;

  constructor(w: World) {
    this.w = w;
  }

  get wave(): WaveDef | undefined {
    return this.w.cfg.night.waves[this.waveIndex];
  }

  update(dt: number): void {
    const w = this.w;
    const waves = w.cfg.night.waves;
    const next = waves[this.waveIndex + 1];
    if (next && w.time >= next.at) this.startWave(this.waveIndex + 1);

    // --- спавн толчками; при перегрузе — пауза (ритм «нарастание → пик → передышка») ---
    if (this.queue.length > 0) {
      this.pulseT -= dt;
      if (w.intensity > 0.82 && this.holdT < 4) {
        this.holdT += dt;
      } else if (this.pulseT <= 0) {
        this.holdT = 0;
        const wave = this.wave;
        this.pulseT = (wave?.pulse ?? 2) * w.rng.range(0.7, 1.3);
        const group = w.rng.int(1, 3);
        for (let i = 0; i < group && this.queue.length > 0; i++) {
          if (w.aliveEnemies() >= 34) break;
          const qi = w.rng.int(0, this.queue.length - 1);
          const item = this.queue[qi]!;
          this.spawnFrom(item.kind, item.from);
          item.left--;
          if (item.left <= 0) this.queue.splice(qi, 1);
        }
      }
    } else if (this.waveActive && w.aliveEnemies() === 0) {
      this.endWave();
    }

    // --- отложенные действия ---
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      if (w.time >= p.at) {
        this.pending.splice(i, 1);
        this.execute(p.kind);
      }
    }

    // --- биты страха ---
    if (w.time >= this.nextScareAt) this.pickScare();
  }

  private startWave(i: number): void {
    const w = this.w;
    const wave = w.cfg.night.waves[i];
    if (!wave) return;
    this.waveIndex = i;
    this.waveActive = true;
    for (const s of wave.spawns) this.queue.push({ kind: KIND_BY_ID[s.kind], from: s.from, left: s.count });
    this.pulseT = 1.5;
    w.emit('waveStart', 0, 0, 0, i + 1);
    w.flags.add(`wave:${i + 1}:start`);
    if (wave.startLine) w.emit('line', 0, 0, 0, 0, 0, 0, wave.startLine);
  }

  private endWave(): void {
    const w = this.w;
    const wave = this.wave;
    this.waveActive = false;
    w.emit('waveEnd', 0, 0, 0, this.waveIndex + 1);
    w.flags.add(`wave:${this.waveIndex + 1}:end`);
    if (wave?.endLine) w.emit('line', 0, 0, 0, 0, 0, 0, wave.endLine);
    // награды: тайники у дверей тёмных домов, дальних от игрока — чтобы пришлось идти в темноту
    const spots = w.layout.doorSpots
      .map((s, i) => ({ s, i, d: Math.hypot(s.x - w.player.x, s.z - w.player.z) }))
      .sort((a, b) => b.d - a.d);
    if (wave?.reward) {
      const s = w.layout.doorSpots[wave.reward.house];
      const wi = wave.reward.weapon ? weaponIndex(wave.reward.weapon) : -1;
      if (s && wi >= 0) this.dropPickup(1, wi, s.x, s.z);
    }
    const a = spots[0];
    const b = spots[1];
    const c = spots[2];
    if (a) this.dropPickup(0, 0, a.s.x + 0.6, a.s.z);
    if (b) this.dropPickup(this.waveIndex % 2 === 0 ? 2 : 3, 0, b.s.x - 0.6, b.s.z);
    if (c && this.waveIndex >= 2) this.dropPickup(0, 0, c.s.x, c.s.z + 0.5);
    // без радио главный ресурс — батарейки для фонаря
    if (w.cfg.night.battery && c) this.dropPickup(4, 0, c.s.x - 0.5, c.s.z - 0.5);
    this.nextScareAt = Math.min(this.nextScareAt, w.time + 6);
  }

  dropPickup(kind: number, a: number, x: number, z: number): void {
    for (const pk of this.w.pickups) {
      if (pk.active) continue;
      pk.active = true;
      pk.kind = kind;
      pk.a = a;
      pk.x = x;
      pk.z = z;
      pk.t = 0;
      return;
    }
  }

  private spawnFrom(kind: Kind, from: SpawnFrom): void {
    const w = this.w;
    const rng = w.rng;
    let x = 0;
    let z = 0;
    if (from === 'crevice') {
      const c = WORLD.crevice;
      const t = rng.range(0, 0.35);
      x = c.ax + (c.bx - c.ax) * t + rng.range(-1, 1);
      z = c.az + (c.bz - c.az) * t + rng.range(-1, 1);
    } else if (from === 'pond') {
      x = WORLD.pond.x + rng.range(-5, 4);
      z = WORLD.pond.z + rng.range(-5, 5);
    } else if (from === 'behind' || from === 'forest') {
      const p = w.player;
      for (let tries = 0; tries < 12; tries++) {
        const base = from === 'behind' ? p.yaw + Math.PI : rng.range(0, Math.PI * 2);
        const a = base + rng.range(-1.1, 1.1);
        const r = rng.range(22, 30);
        x = p.x + Math.cos(a) * r;
        z = p.z + Math.sin(a) * r;
        if (Math.hypot(x, z) < WORLD.bounds - 2 && !isWater(x, z)) break;
      }
    }
    spawnEnemy(w, kind, x, z);
  }

  // ----------------------------------------------------------------------------------

  private pickScare(): void {
    const w = this.w;
    const lull = !this.waveActive || this.queue.length === 0;
    const sanity = w.player.sanity;
    let total = 0;
    const weights: number[] = [];
    for (const s of SCARES) {
      const ok = this.allowed(s, sanity);
      const used = this.uses.get(s.id) ?? 0;
      const wgt = ok ? (s.weight * (lull ? s.lull : 1)) / (1 + used * s.fatigue) : 0;
      weights.push(wgt);
      total += wgt;
    }
    const setting = w.cfg.scare;
    // чем выше «сила страха» и ниже рассудок, тем плотнее биты
    const gap = (lull ? 13 : 20) * (1.4 - setting * 0.6) * (0.6 + sanity / 250);
    this.nextScareAt = w.time + gap * w.rng.range(0.7, 1.35);
    if (total <= 0) return;
    let r = w.rng.next() * total;
    for (let i = 0; i < SCARES.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        const s = SCARES[i]!;
        this.uses.set(s.id, (this.uses.get(s.id) ?? 0) + 1);
        this.cooldownUntil.set(s.id, w.time + s.cooldown);
        this.lastScareAt = w.time;
        this.begin(s);
        return;
      }
    }
  }

  private allowed(s: ScareDef, sanity: number): boolean {
    const w = this.w;
    if (w.time < s.minT || sanity > s.maxSanity || w.cfg.scare < s.minSetting) return false;
    if ((this.cooldownUntil.get(s.id) ?? -1) > w.time) return false;
    if (s.id === 'jumpscare' && this.jumpscares >= 2) return false;
    // нельзя пугать посреди сценарной сцены и внутри домов (там свои скримеры)
    if (s.id === 'jumpscare' && w.playerHouse >= 0) return false;
    if (s.id === 'pier' && w.flags.has('pierFigure')) return false;
    if (s.id === 'speaker' && w.deadAir) return false;
    if (s.id === 'pier' && Math.hypot(w.player.x - WORLD.pier.x1, w.player.z - WORLD.pier.z0) < 12) return false;
    return true;
  }

  private begin(s: ScareDef): void {
    const w = this.w;
    // Перед значимыми битами — тишина: звук приглушается, страх-потенциация испуга.
    if (s.id === 'jumpscare' || s.id === 'pier' || s.id === 'edge') {
      w.emit('scare', 0, 0, 0, 0, 0, 0, 'duck');
      this.pending.push({ at: w.time + (s.id === 'jumpscare' ? 2.2 : 1.2), kind: s.id });
      return;
    }
    this.execute(s.id);
  }

  private execute(kind: ScareKind): void {
    const w = this.w;
    const p = w.player;
    const rng = w.rng;
    switch (kind) {
      case 'whisper': {
        const a = p.yaw + Math.PI + rng.range(-0.6, 0.6);
        const r = rng.range(3, 6);
        w.emit('scare', p.x + Math.cos(a) * r, 1.4, p.z + Math.sin(a) * r, 0, 0, 0, 'whisper');
        break;
      }
      case 'branch': {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(9, 16);
        w.emit('scare', p.x + Math.cos(a) * r, 0.5, p.z + Math.sin(a) * r, 0, 0, 0, 'branch');
        break;
      }
      case 'silence':
        w.emit('scare', 0, 0, 0, 14, 0, 0, 'silence');
        break;
      case 'steps': {
        const a = p.yaw + Math.PI + rng.range(-0.4, 0.4);
        w.emit('scare', p.x + Math.cos(a) * 7, 0, p.z + Math.sin(a) * 7, a, 0, 0, 'steps');
        break;
      }
      case 'window': {
        const i = rng.int(0, w.layout.houses.length - 1);
        w.flags.add('windowLit');
        w.emit('scare', 0, 0, 0, i, 0, 0, 'window');
        break;
      }
      case 'speaker': {
        const n = rng.int(1, 3);
        w.emit('scare', w.layout.pole.x, 5, w.layout.pole.z, n, 0, 0, 'speaker');
        w.emit('line', 0, 0, 0, 1, 0, 0, `n1.speaker.${n}`);
        break;
      }
      case 'pier': {
        const e = spawnEnemy(w, Kind.Apparition, WORLD.pier.x1 - 0.6, (WORLD.pier.z0 + WORLD.pier.z1) / 2);
        if (e) e.tx = 22;
        w.flags.add('pierSeen');
        break;
      }
      case 'edge': {
        const a = p.yaw + rng.range(-0.5, 0.5);
        const r = rng.range(16.5, 19);
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (!isWater(x, z)) {
          const e = spawnEnemy(w, Kind.Apparition, x, z);
          if (e) e.tx = 10;
        }
        break;
      }
      case 'fake': {
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const a = p.yaw + Math.PI + rng.range(-1, 1);
          const r = rng.range(10, 14);
          const x = p.x + Math.cos(a) * r;
          const z = p.z + Math.sin(a) * r;
          if (!isWater(x, z)) spawnEnemy(w, Kind.Whisperer, x, z, true);
        }
        break;
      }
      case 'jumpscare':
        this.jumpscares++;
        w.jumpscare();
        break;
    }
  }
}
