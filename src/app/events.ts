import { WEAPONS } from '../content/weapons';
import { Kind } from '../content/enemies';
import { t } from '../i18n';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/types';
import type { AudioEngine } from '../audio/engine';
import type { Ambience } from '../audio/ambience';
import type { GameRenderer } from '../render/renderer';
import type { Hud } from '../ui/hud';
import { vibrate } from '../platform/native';
import { COLORS } from '../render/worldView';
import type { SoundId } from '../content/assets';

const STEP_SOUNDS: SoundId[] = ['stepGrass', 'stepWood', 'stepDirt', 'stepMud'];
const SKIN: Record<number, number> = { [Kind.Whisperer]: 0x8e877c, [Kind.Mute]: 0x5a524a, [Kind.Echo]: 0x7a8682, [Kind.Apparition]: 0x101010 };

export interface EventCtx {
  audio: AudioEngine;
  amb: Ambience;
  r: GameRenderer;
  hud: Hud;
  scare: number;
  reduceFlashes: boolean;
  onDeath: () => void;
  onDawn: () => void;
}

/** Окна: временные «мигания» света в домах (сцена «В доме зажгли свет»). */
const windowFlicker = new Map<number, number>();

/**
 * Переводит события симуляции в звук, эффекты, вибрацию и интерфейс.
 * Симуляция ничего об этом не знает — слой представления можно заменить целиком.
 */
export function handleEvents(w: World, c: EventCtx, dt: number): void {
  const p = w.player;
  for (let i = 0; i < w.eventCount; i++) handle(w.events[i]!, w, c);
  w.clearEvents();

  // мигающие окна
  for (const [idx, left] of windowFlicker) {
    const nl = left - dt;
    const mat = c.r.view.windowMats[idx];
    if (!mat) continue;
    if (nl <= 0) {
      windowFlicker.delete(idx);
      mat.color.setHex(COLORS.windowLit);
    } else {
      windowFlicker.set(idx, nl);
      mat.color.setHex(Math.random() < 0.5 ? COLORS.windowLit : COLORS.windowDark);
    }
  }

  // непрерывные эффекты
  c.r.hurt = Math.max(0, c.r.hurt - dt * 1.4);
  c.r.flashFx = Math.max(0, c.r.flashFx - dt * 4);
  let near = 99;
  let eerie = 0;
  for (const e of w.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.kind !== Kind.Apparition) near = Math.min(near, d);
    if (e.kind === Kind.Echo || e.kind === Kind.Apparition) eerie = Math.max(eerie, 1 - d / 12);
  }
  const target = Math.max(0, eerie * 0.55, (0.35 - p.sanity / 100) * 0.9, w.deadAir ? 0.12 : 0);
  c.r.glitch = Math.max(target, c.r.glitch - dt * 1.8);
  nearestEnemy = near;
}

export let nearestEnemy = 99;

function handle(e: SimEvent, w: World, c: EventCtx): void {
  const { audio, r, hud } = c;
  const p = w.player;
  const dist = Math.hypot(e.x - p.x, e.z - p.z);
  switch (e.type) {
    case 'shot': {
      const wd = WEAPONS[e.a]!;
      audio.play(wd.sound, { x: e.x, z: e.z, vol: 1, reverb: 0.45 });
      r.fx.muzzleFlash(e.x, e.y, e.z, e.b, wd.id === 'shotgun' || wd.id === 'rifle' ? 1.4 : wd.id === 'flaregun' ? 0.6 : 1);
      if (wd.id === 'smg' || wd.id === 'rifle') r.fx.casing(e.x, e.y, e.z, e.b, false);
      r.addTrauma(wd.shake);
      vibrate(wd.id === 'smg' ? 6 : 18);
      break;
    }
    case 'tracer': {
      const hot = e.c === 1;
      r.fx.tracers.add(e.x, e.y, e.z, e.a, e.y - 0.3, e.b, 1.4, hot ? 0.7 : 1.0, hot ? 0.4 : 0.55);
      if (e.c === 2) r.fx.impact(e.a, e.y - 0.4, e.b, 0, 0, false);
      break;
    }
    case 'hit':
      r.fx.impact(e.x, e.y, e.z, e.b / 4, e.c / 4, true);
      audio.play('hit', { x: e.x, z: e.z, vol: 0.8 });
      break;
    case 'kill': {
      const big = e.a === Kind.Mute;
      r.fx.gore(e.x, e.y, e.z, big, e.b > 0, SKIN[e.a] ?? 0x888888);
      audio.play('gore', { x: e.x, z: e.z, vol: big ? 1 : 0.8 });
      audio.play('death', { x: e.x, z: e.z, vol: big ? 1 : 0.6, rate: big ? 0.6 : 1 });
      r.addTrauma(big ? 0.35 : 0.08);
      break;
    }
    case 'explosion': {
      r.fx.explosion(e.x, e.y, e.z, e.a);
      audio.play('explosion', { x: e.x, z: e.z, vol: 1.3, reverb: 0.6 });
      const k = Math.max(0, 1 - dist / 30);
      r.addTrauma(0.3 + k * 0.7);
      r.flashFx = Math.max(r.flashFx, k * (c.reduceFlashes ? 0.15 : 0.6));
      if (dist < 12) audio.deafen(1 - dist / 12);
      vibrate([40, 20, 80]);
      break;
    }
    case 'step':
      audio.play(STEP_SOUNDS[e.a] ?? 'stepGrass', { x: e.x, z: e.z, vol: 0.32, low: true, reverb: 0.1 });
      break;
    case 'echoStep':
      // ваши же шаги — с задержкой и чуть ниже
      audio.play(STEP_SOUNDS[0]!, { x: e.x, z: e.z, vol: 0.55, rate: 0.9, reverb: 0.7 });
      break;
    case 'playerHurt':
      r.hurt = Math.min(1, r.hurt + e.a / 30);
      audio.play('hurt', { vol: 0.9, reverb: 0.1 });
      r.addTrauma(0.25 + e.a / 80);
      vibrate(60);
      break;
    case 'playerDeath':
      audio.play('sting', { vol: 0.5 * c.scare + 0.2 });
      audio.play('gore', { vol: 1 });
      r.hurt = 1;
      vibrate([80, 40, 160]);
      c.onDeath();
      break;
    case 'reload':
      audio.play('reload', { x: e.x, z: e.z, vol: 0.8, rate: WEAPONS[e.a]!.reload < 1.8 ? 1.15 : 0.95 });
      if (WEAPONS[e.a]!.id === 'shotgun') {
        r.fx.casing(e.x, e.y + 1, e.z, p.yaw, true);
        r.fx.casing(e.x, e.y + 1, e.z, p.yaw + 0.3, true);
      }
      break;
    case 'dryfire':
      audio.play('dryfire', { vol: 0.8 });
      break;
    case 'swap':
      audio.play('swap', { vol: 0.8 });
      hud.toastText(t(WEAPONS[e.a]!.nameKey));
      break;
    case 'pickup': {
      audio.play('pickup', { vol: 0.8 });
      vibrate([10, 30, 10]);
      const text = e.a === 1 ? t('pickup.weapon', { name: t(WEAPONS[e.b]!.nameKey) }) : e.a === 2 ? t('pickup.dynamite') : e.a === 3 ? t('pickup.med') : t('pickup.ammo');
      hud.toastText(text);
      break;
    }
    case 'throw':
      audio.play('swap', { vol: 0.5 });
      audio.play('fuse', { x: e.x, z: e.z, vol: 0.5 });
      break;
    case 'flareLand':
      audio.play('bounce', { x: e.x, z: e.z, vol: 0.4 });
      break;
    case 'deadAir':
      audio.play('static', { x: e.x, z: e.z, vol: 1, bus: 'music' });
      c.amb.setRadio(false);
      vibrate(30);
      break;
    case 'airRestored':
      audio.play('reel', { x: e.x, z: e.z, vol: 0.9 });
      c.amb.setRadio(true);
      break;
    case 'line':
      hud.line(e.s, e.a);
      break;
    case 'scare':
      scare(e, w, c);
      break;
    case 'waveStart':
      audio.play('swell', { vol: 0.35, bus: 'music', reverb: 0.3 });
      break;
    case 'dawn':
      c.onDawn();
      break;
    case 'alert':
      audio.play('screech', { x: e.x, z: e.z, vol: 0.7 });
      break;
    case 'growl':
      audio.play('growl', { x: e.x, z: e.z, vol: 1 });
      break;
    case 'charge':
      audio.play('roar', { x: e.x, z: e.z, vol: 1.2 });
      r.addTrauma(dist < 10 ? 0.3 : 0.1);
      break;
    case 'vanish':
      r.fx.vanish(e.x, e.y, e.z);
      audio.play('static', { x: e.x, z: e.z, vol: e.b === 2 ? 0.9 : 0.35, rate: 1.4 });
      if (e.b === 2) {
        r.glitch = 1;
        audio.play('swell', { vol: 0.5, rate: 1.6 });
      }
      break;
    case 'bounce':
      audio.play('bounce', { x: e.x, z: e.z, vol: 0.6 });
      break;
    case 'splash':
      audio.play('splash', { x: e.x, z: e.z, vol: 0.8 });
      break;
    case 'spawn':
      if (e.y < -0.5) audio.play('splash', { x: e.x, z: e.z, vol: 0.7 });
      break;
    case 'reelProgress':
      break;
  }
}

function scare(e: SimEvent, w: World, c: EventCtx): void {
  const { audio, r } = c;
  const p = w.player;
  switch (e.s) {
    case 'duck':
      audio.duck(2.6);
      break;
    case 'whisper':
      audio.play('whisper', { x: e.x, z: e.z, vol: 0.9, reverb: 0.35 });
      break;
    case 'branch':
      audio.play('branch', { x: e.x, z: e.z, vol: 1 });
      break;
    case 'silence':
      c.amb.silence(e.a);
      break;
    case 'steps': {
      // шаги приближаются из-за спины и обрываются в полуметре
      for (let i = 0; i < 5; i++) {
        const k = i / 5;
        audio.play('stepGrass', { x: e.x + (p.x - e.x) * k * 0.85, z: e.z + (p.z - e.z) * k * 0.85, vol: 0.5 + k * 0.3, delay: i * 0.48, reverb: 0.4 });
      }
      break;
    }
    case 'window':
      windowFlicker.set(e.a, 3.2);
      audio.play('branch', { x: w.layout.houses[e.a]?.x ?? 0, z: w.layout.houses[e.a]?.z ?? 0, vol: 0.6, rate: 0.7 });
      break;
    case 'speaker':
      audio.play('speakerVoice', { x: e.x, z: e.z, vol: 1.1, bus: 'music', reverb: 0.5, rate: 0.85 });
      break;
    case 'jumpscare':
      r.showFace(0.42);
      r.glitch = 1;
      r.flashFx = c.reduceFlashes ? 0.1 : 0.45;
      audio.play('sting', { vol: 0.35 + 0.55 * c.scare, reverb: 0.2 });
      vibrate([120, 30, 60]);
      break;
  }
}
