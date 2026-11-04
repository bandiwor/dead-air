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
const SKIN: Record<number, number> = { [Kind.Whisperer]: 0x8e877c, [Kind.Mute]: 0x5a524a, [Kind.Echo]: 0x7a8682, [Kind.Apparition]: 0x101010, [Kind.Unseeing]: 0x7d8a8c, [Kind.Choir]: 0x6f6a62 };

export interface EventCtx {
  audio: AudioEngine;
  amb: Ambience;
  r: GameRenderer;
  hud: Hud;
  scare: number;
  reduceFlashes: boolean;
  onDeath: () => void;
  onDawn: () => void;
  onNote: (key: string) => void;
  /** Подобрана находка: kind/a — как в Pickup, amount — сколько досталось. */
  onPickup: (kind: number, a: number, amount: number) => void;
  /** Показать скример поверх всего (лицо в полный экран). */
  onJumpscare: () => void;
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

  // окна: свет по состоянию дома; «мигание» поверх
  c.r.view.windowMats.forEach((mat, idx) => {
    const left = windowFlicker.get(idx);
    if (left !== undefined) {
      if (left - dt <= 0) windowFlicker.delete(idx);
      else windowFlicker.set(idx, left - dt);
      mat.color.setHex(Math.random() < 0.5 ? COLORS.windowLit : COLORS.windowDark);
    } else {
      mat.color.setHex(w.houseLight[idx] ? COLORS.windowLit : COLORS.windowDark);
    }
  });

  // непрерывные эффекты
  c.r.hurt = Math.max(0, c.r.hurt - dt * 1.4);
  c.r.flashFx = Math.max(0, c.r.flashFx - dt * 4);
  let near = 99;
  let eerie = 0;
  for (const e of w.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.kind !== Kind.Apparition) near = Math.min(near, d);
    // помехи рядом с «неправильным»; фигура на пристани — тише, её нужно успеть рассмотреть
    if (e.kind === Kind.Echo || e.kind === Kind.Apparition) eerie = Math.max(eerie, (1 - d / 12) * (e.state === 1 ? 0.35 : 1));
  }
  creatureAmbience(w, c, dt);
  finaleCues(w, c, dt);
  const target = Math.max(0, eerie * 0.55, (0.35 - p.sanity / 100) * 0.9, w.deadAir ? 0.12 : 0);
  c.r.glitch = Math.max(target, c.r.glitch - dt * 1.8);
  nearestEnemy = near;
}

export let nearestEnemy = 99;

/**
 * Пока держат решение у заслонки — слышно, к чему оно ведёт: открыть — шум воды и тишина
 * спящей деревни; выбросить ключ — издалека начинается вальс; имя — голос матери.
 */
let finaleT = 0;
function finaleCues(w: World, c: EventCtx, dt: number): void {
  const p = w.player;
  const it = p.focus >= 0 ? w.interactables[p.focus] : undefined;
  if (!it || !it.finale || !p.holding) {
    finaleT = 0;
    return;
  }
  finaleT -= dt;
  if (finaleT > 0) return;
  finaleT = 1.3;
  const k = Math.min(1, p.focusHold / Math.max(0.1, it.hold));
  if (it.id === 'open') c.audio.play('splash', { vol: 0.3 + k * 0.6, rate: 0.5, reverb: 0.8, low: true });
  else if (it.id === 'throw') c.audio.play('speakerVoice', { vol: 0.25 + k * 0.6, rate: 0.85, bus: 'music', reverb: 0.7 });
  else if (it.id === 'name') c.audio.play('whisper', { vol: 0.35 + k * 0.6, rate: 0.85, reverb: 0.5 });
  c.r.glitch = Math.max(c.r.glitch, k * 0.5);
}

/** Кто из шептунов уже под лучом (чтобы шипение звучало один раз на вход в свет). */
const litBefore = new Set<number>();

/**
 * Живые эффекты существ, каждый кадр: огонь на горящих, дымок с шептунов в луче (свет им
 * неприятен — как сказанное вслух), пыль за Немым, вода с Невидевших, фосфорный шлейф Отголоска.
 */
function creatureAmbience(w: World, c: EventCtx, dt: number): void {
  const fx = c.r.fx;
  const rnd = fx.rng;
  for (const e of w.enemies) {
    if (!e.active || e.fake) {
      litBefore.delete(e.id);
      continue;
    }
    const moving = Math.hypot(e.vx, e.vz) > 0.3;
    switch (e.kind) {
      case Kind.Whisperer: {
        if (e.burn > 0) {
          const n = Math.ceil(dt * 50);
          for (let i = 0; i < n; i++) fx.burning(e.x, e.y, e.z, Math.min(1, e.burn));
          if (rnd.chance(dt * 3)) c.audio.play('fuse', { x: e.x, z: e.z, vol: 0.35, rate: rnd.range(1.1, 1.5) });
        } else if (e.litTorch) {
          if (rnd.chance(dt * 24)) fx.wisps(e.x, e.y, e.z);
          if (!litBefore.has(e.id)) {
            litBefore.add(e.id);
            // шипит и сжимается, как от ожога
            c.audio.play('scratch', { x: e.x, z: e.z, vol: 0.55, rate: 1.7, reverb: 0.2 });
          }
        }
        if (!e.litTorch) litBefore.delete(e.id);
        break;
      }
      case Kind.Mute:
        if (moving && rnd.chance(dt * 5)) fx.dust(e.x, e.z);
        break;
      case Kind.Unseeing:
        if (rnd.chance(dt * (moving ? 10 : 4))) fx.drips(e.x, e.y, e.z);
        break;
      case Kind.Echo:
        if (!e.delay && moving && rnd.chance(dt * 30)) fx.afterimage(e.x, e.y, e.z);
        break;
      case Kind.Choir:
        if (rnd.chance(dt * 8)) fx.wisps(e.x + rnd.range(-0.8, 0.8), e.y + 1.2, e.z + rnd.range(-0.8, 0.8));
        break;
    }
  }
}

/** Появление — у каждого своё и про то, откуда оно. */
function birth(e: SimEvent, w: World, c: EventCtx): void {
  const { audio, r } = c;
  const p = w.player;
  const dist = Math.hypot(e.x - p.x, e.z - p.z);
  const wet = e.y < -0.5;
  switch (e.a) {
    case Kind.Whisperer:
      // недоговорённое слово выкапывается из земли, куда его закопали
      if (wet) audio.play('splash', { x: e.x, z: e.z, vol: 0.5 });
      else {
        r.fx.emergeDirt(e.x, e.z, false);
        if (dist < 22) audio.play('scratch', { x: e.x, z: e.z, vol: 0.4, rate: 0.9 });
      }
      break;
    case Kind.Mute:
      // тишина проламывает землю снизу
      r.fx.emergeDirt(e.x, e.z, true);
      audio.play('growl', { x: e.x, z: e.z, vol: 0.9, rate: 0.6 });
      audio.play('slam', { x: e.x, z: e.z, vol: 0.8, rate: 0.6, reverb: 0.5 });
      if (dist < 25) r.addTrauma(0.25 * (1 - dist / 25));
      break;
    case Kind.Echo:
      // собирается из ваших же следов
      r.fx.assemble(e.x, e.y, e.z);
      audio.play('static', { x: e.x, z: e.z, vol: 0.5, rate: 1.3 });
      break;
    case Kind.Unseeing:
      // поднимается из пруда — или из ила, если вылез на берег
      r.fx.emergeWet(e.x, e.y, e.z);
      audio.play('splash', { x: e.x, z: e.z, vol: wet ? 0.8 : 0.5, rate: wet ? 1 : 0.8 });
      break;
    case Kind.Choir:
      r.fx.emergeDirt(e.x, e.z, true);
      audio.play('choir', { x: e.x, z: e.z, vol: 0.8, rate: 0.85, reverb: 0.7 });
      r.addTrauma(0.3);
      break;
  }
}

/**
 * Смерть — тоже у каждого своя. b: 1 — взрыв, 2 — сгорел.
 *  • Шептун: недоговорённое слово рассыпается пеплом и чёрными хлопьями; сгоревший — угли и пятно.
 *  • Немой: тишина лопается грудой камней — и на секунду становится по-настоящему тихо.
 *  • Отголосок: кадры прошлого разлетаются назад по вашему пути, плёнку «зажёвывает».
 *  • Невидевший: утопленник возвращается в воду — брызги и лужа.
 *  • Хор: одиннадцать тел расходятся, песня захлёбывается.
 */
function death(e: SimEvent, c: EventCtx, dist: number): void {
  const { audio, r } = c;
  const explosive = e.b === 1;
  switch (e.a) {
    case Kind.Whisperer:
      if (explosive) r.fx.gore(e.x, e.y, e.z, false, true, SKIN[e.a]!);
      else if (e.b === 2) {
        r.fx.incinerate(e.x, e.y, e.z);
        audio.play('fuse', { x: e.x, z: e.z, vol: 0.8, rate: 0.8 });
      } else r.fx.crumble(e.x, e.y, e.z);
      // обрывок шёпота — на полуслове
      audio.play('whisper', { x: e.x, z: e.z, vol: 0.6, rate: 1.25, reverb: 0.4 });
      audio.play('death', { x: e.x, z: e.z, vol: 0.45, rate: 1.1 });
      r.addTrauma(0.06);
      break;
    case Kind.Mute:
      r.fx.shatter(e.x, e.y, e.z, explosive);
      audio.play('explosion', { x: e.x, z: e.z, vol: 0.7, rate: 0.55, reverb: 0.5 });
      audio.play('gore', { x: e.x, z: e.z, vol: 0.6, rate: 0.6 });
      // после — тишина: мир глохнет на мгновение
      audio.duck(1.4);
      r.addTrauma(dist < 18 ? 0.45 : 0.2);
      break;
    case Kind.Echo:
      r.fx.rewind(e.x, e.y, e.z, e.c);
      audio.play('tapestop', { x: e.x, z: e.z, vol: 0.9, reverb: 0.5 });
      audio.play('static', { x: e.x, z: e.z, vol: 0.6 });
      r.glitch = Math.max(r.glitch, 0.8);
      break;
    case Kind.Unseeing:
      if (explosive) r.fx.gore(e.x, e.y, e.z, false, true, SKIN[e.a]!);
      r.fx.splashDown(e.x, e.y, e.z);
      audio.play('splash', { x: e.x, z: e.z, vol: 1, rate: 0.75, reverb: 0.4 });
      audio.play('death', { x: e.x, z: e.z, vol: 0.5, rate: 0.75 });
      r.addTrauma(0.1);
      break;
    case Kind.Choir:
      r.fx.disband(e.x, e.y, e.z);
      audio.play('choir', { x: e.x, z: e.z, vol: 1.2, rate: 0.55, reverb: 0.8 });
      audio.play('tapestop', { x: e.x, z: e.z, vol: 1, delay: 0.4 });
      r.addTrauma(0.6);
      r.glitch = 1;
      break;
    default:
      r.fx.gore(e.x, e.y, e.z, false, explosive, SKIN[e.a] ?? 0x888888);
      audio.play('death', { x: e.x, z: e.z, vol: 0.6 });
  }
}

function handle(e: SimEvent, w: World, c: EventCtx): void {
  const { audio, r, hud } = c;
  const p = w.player;
  const dist = Math.hypot(e.x - p.x, e.z - p.z);
  switch (e.type) {
    case 'shot': {
      const wd = WEAPONS[e.a]!;
      if (e.c === 1) {
        // выстрел Отголоска: ваш же выстрел, но глухой, как из-под воды, и вспышка холодная
        audio.play(wd.sound, { x: e.x, z: e.z, vol: 0.7, rate: 0.82, reverb: 0.9, low: true });
        r.fx.muzzleFlash(e.x, e.y, e.z, e.b, 0.6);
        r.atmos.burst(e.x, e.y, e.z, 3, 0x7fd6c2, 0.6, 0.12);
        break;
      }
      audio.play(wd.sound, { x: e.x, z: e.z, vol: 1, reverb: 0.45 });
      r.fx.muzzleFlash(e.x, e.y, e.z, e.b, wd.id === 'shotgun' || wd.id === 'rifle' ? 1.4 : wd.id === 'flaregun' ? 0.6 : 1);
      r.atmos.burst(e.x, e.y, e.z, wd.id === 'smg' ? 3 : 4.5, 0xffc070, c.reduceFlashes ? 0.4 : 0.9, 0.08);
      if (wd.id === 'smg' || wd.id === 'rifle') r.fx.casing(e.x, e.y, e.z, e.b, false);
      r.addTrauma(wd.shake);
      vibrate(wd.id === 'smg' ? 6 : 18);
      break;
    }
    case 'tracer': {
      const hot = e.c === 1;
      if (e.c >= 3) {
        // трассер из прошлого — фосфорный; 4 — попал в вас
        r.fx.tracers.add(e.x, e.y, e.z, e.a, e.y - 0.3, e.b, 0.45, 1.3, 1.15);
        if (e.c === 4) r.glitch = Math.max(r.glitch, 0.6);
        break;
      }
      r.fx.tracers.add(e.x, e.y, e.z, e.a, e.y - 0.3, e.b, 1.4, hot ? 0.7 : 1.0, hot ? 0.4 : 0.55);
      if (e.c === 2) r.fx.impact(e.a, e.y - 0.4, e.b, 0, 0, false);
      break;
    }
    case 'hit':
      r.fx.impact(e.x, e.y, e.z, e.b / 4, e.c / 4, true);
      audio.play('hit', { x: e.x, z: e.z, vol: 0.8 });
      break;
    case 'kill':
      death(e, c, dist);
      break;
    case 'ignite':
      // шептун вспыхнул: сухой треск, как от бумаги
      audio.play('fuse', { x: e.x, z: e.z, vol: 0.7, rate: 1.3 });
      audio.play('screech', { x: e.x, z: e.z, vol: 0.45, rate: 1.35 });
      r.fx.flash(e.x, e.y, e.z, 14, 0.2);
      break;
    case 'explosion': {
      r.fx.explosion(e.x, e.y, e.z, e.a);
      r.atmos.burst(e.x, e.y + 1.2, e.z, e.a * 4, 0xff9040, c.reduceFlashes ? 0.5 : 1, 0.7);
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
      // a=1 — мокрые шаги Невидевшего; иначе ваши же шаги с задержкой
      if (e.a === 1) audio.play('stepMud', { x: e.x, z: e.z, vol: 0.7, rate: 0.85, reverb: 0.5 });
      else audio.play(STEP_SOUNDS[0]!, { x: e.x, z: e.z, vol: 0.55, rate: 0.9, reverb: 0.7 });
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
      c.onPickup(e.a, e.b, e.c);
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
      // a=1 — Невидевший сорвался с места, когда вы отвернулись: короткий мокрый вдох
      if (e.a === 1) audio.play('splash', { x: e.x, z: e.z, vol: 0.6, rate: 1.4 });
      else audio.play('screech', { x: e.x, z: e.z, vol: 0.7 });
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
      if (e.b !== 1) birth(e, w, c);
      break;
    case 'reelProgress':
      break;
    case 'note':
      audio.play('swap', { vol: 0.5, rate: 0.8 });
      c.onNote(e.s);
      break;
    case 'knock':
      audio.play('knock', { x: e.x, z: e.z, vol: 1, reverb: 0.3 });
      vibrate([15, 250, 15, 250, 15]);
      break;
    case 'door':
      if (e.b > 0) audio.play('creak', { x: e.x, z: e.z, vol: 1, reverb: 0.3 });
      else {
        audio.play('slam', { x: e.x, z: e.z, vol: 1.3, reverb: 0.4 });
        r.addTrauma(0.45);
        vibrate(90);
      }
      break;
    case 'fragment':
      audio.play('whisper', { x: e.x, z: e.z, vol: 1, reverb: 0.5, rate: 0.9 });
      r.glitch = Math.max(r.glitch, 0.5);
      break;
    case 'shout':
      // крик: собственный голос, сорванный, и «волна», проявляющая темноту
      audio.play('scream', { x: e.x, z: e.z, vol: 0.55, rate: 0.62, reverb: 0.8 });
      audio.play('swell', { vol: 0.3, rate: 0.7, reverb: 0.5 });
      r.fx.shockRing(e.x, e.y, e.z, 14);
      r.atmos.burst(e.x, e.y + 1, e.z, 6, 0x9fe8d8, 0.5, 0.4);
      r.addTrauma(0.2);
      vibrate([30, 30, 60]);
      break;
    case 'letter':
      audio.play('whisper', { vol: 1, rate: 0.7, reverb: 0.6 });
      audio.play('pickup', { vol: 0.6, rate: 0.6, reverb: 0.4 });
      hud.toastText(t('pickup.letter', { l: e.s }));
      r.glitch = Math.max(r.glitch, 0.7);
      break;
    case 'choirPulse':
      audio.play('choir', { x: e.x, z: e.z, vol: 1.3, reverb: 0.6 });
      r.addTrauma(dist < 14 ? 0.45 : 0.15);
      r.glitch = Math.max(r.glitch, dist < 14 ? 0.8 : 0.3);
      if (dist < 14) vibrate([50, 40, 50]);
      break;
    case 'feed':
      // выстрел в Хор — он подхватывает звук
      r.glitch = Math.max(r.glitch, 0.45);
      audio.play('choir', { x: e.x, z: e.z, vol: 0.45, rate: 1.25, reverb: 0.4 });
      break;
    case 'drown':
      audio.play('splash', { x: e.x, z: e.z, vol: 0.9, rate: 0.6, reverb: 0.3 });
      r.hurt = Math.min(1, r.hurt + 0.25);
      vibrate(40);
      break;
    case 'gaze':
      // заметили из окна: ставня хлопает, радио громче
      audio.play('slam', { x: e.x, z: e.z, vol: 0.8, rate: 1.2, reverb: 0.3 });
      audio.play('speakerVoice', { x: e.x, z: e.z, vol: 0.5, rate: 1.15, bus: 'music' });
      vibrate(30);
      break;
    case 'lamp':
      // ладонь на стекле лампы
      audio.play('dryfire', { x: e.x, z: e.z, vol: 0.35, rate: 0.7 });
      break;
    case 'reveal':
      // эхо проявило спрятанное: фосфорная искра на месте
      r.fx.assemble(e.x, e.y, e.z);
      audio.play('whisper', { x: e.x, z: e.z, vol: 0.4, rate: 1.3, reverb: 0.6 });
      break;
    case 'choirNames':
      // фамилия — и пауза, в которую можно крикнуть
      audio.play('choir', { x: e.x, z: e.z, vol: 0.9, rate: 0.9 + (e.a % 4) * 0.04, reverb: 0.6 });
      hud.toastText(t('hud.choirPause'));
      break;
    case 'choirStun':
      audio.play('tapestop', { x: e.x, z: e.z, vol: 1, reverb: 0.5 });
      audio.play('static', { x: e.x, z: e.z, vol: 0.6 });
      r.glitch = 1;
      r.addTrauma(0.4);
      break;
    case 'choirPhase':
      audio.play('sting', { vol: 0.6, rate: 0.6 + e.a * 0.1, reverb: 0.4 });
      if (e.a === 3) {
        // фонарь гаснет: щелчок, тишина
        audio.play('dryfire', { vol: 0.8, rate: 0.5 });
        audio.duck(2);
      }
      r.glitch = Math.max(r.glitch, 0.7);
      break;
    case 'reflect':
      // взгляд уходит под воду: всё глохнет, слышно собственное сердце
      audio.underwater(e.a === 1);
      if (e.a === 1) {
        audio.play('splash', { vol: 0.25, rate: 0.7, low: true });
        audio.play('heartbeat', { vol: 0.5, rate: 0.9 });
      }
      break;
    case 'reflectFigure':
      // в отражении за спиной — шёпот совсем близко, но не громче сердца
      audio.play('whisper', { x: e.x, z: e.z, vol: 0.45, rate: 0.8, reverb: 0.2 });
      break;
    case 'overstay':
      audio.underwater(false);
      audio.play('splash', { vol: 1, rate: 0.6, reverb: 0.4 });
      audio.play('sting', { vol: 0.5, rate: 0.7 });
      r.glitch = 1;
      r.addTrauma(0.5);
      vibrate([60, 40, 120]);
      break;
    case 'houseLight':
      audio.play('dryfire', { vol: 0.3, rate: 0.6 });
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
    case 'names':
      // громкоговоритель перечисляет дворы
      for (let i = 0; i < 4; i++) audio.play('speakerVoice', { x: e.x, z: e.z, vol: 1.1, bus: 'music', reverb: 0.5, rate: 0.8, delay: i * 3 });
      audio.play('static', { x: e.x, z: e.z, vol: 0.8, bus: 'music', delay: 11.5 });
      break;
    case 'wet': {
      // из воды: всплеск, мокрые ладони по доскам, шёпот снизу
      const p = w.player;
      audio.play('splash', { x: p.x + 1, z: p.z + 1, vol: 1, rate: 0.7, reverb: 0.5 });
      for (let i = 0; i < 6; i++) audio.play('scratch', { x: p.x + (Math.random() - 0.5) * 3, z: p.z + (Math.random() - 0.5) * 3, vol: 0.7, rate: 0.6, delay: 0.2 + i * 0.18 });
      audio.play('whisper', { x: p.x, z: p.z + 1, vol: 1, rate: 0.75, delay: 0.3 });
      r.glitch = Math.max(r.glitch, 0.6);
      vibrate([20, 80, 20, 80, 20]);
      break;
    }
    case 'knockBack':
      // из-за двери отвечают тем же ритмом, только медленнее
      audio.play('knock', { x: e.x, z: e.z, vol: 1.1, rate: 0.72, reverb: 0.5 });
      vibrate([20, 340, 20, 340, 20]);
      break;
    case 'scratch': {
      const h = e.a >= 0 ? w.layout.houses[e.a] : undefined;
      const cx = h?.x ?? e.x;
      const cz = h?.z ?? e.z;
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = 2.6 + Math.random() * 0.6;
        audio.play(i % 4 === 3 ? 'knock' : 'scratch', { x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, vol: 0.9, delay: i * 0.28 + Math.random() * 0.15, rate: 0.8 + Math.random() * 0.4 });
      }
      for (let i = 0; i < 3; i++) audio.play('whisper', { x: cx + (Math.random() - 0.5) * 6, z: cz + (Math.random() - 0.5) * 6, vol: 0.8, delay: 0.6 + i * 0.9 });
      vibrate([30, 60, 30, 60, 30, 200, 60]);
      r.glitch = Math.max(r.glitch, 0.4);
      break;
    }
    case 'jumpscare': {
      // Удар: широкополосный шум с фронтом 1 мс + визг + крик, без реверба — сухо и в упор.
      // Фон в тот же миг обрывается: контраст громкости важнее самой громкости.
      c.onJumpscare();
      audio.duck(2.2);
      const v = 0.6 + 0.5 * c.scare;
      // визг — главный: высокий, режущий, как в классических скримерах; удар под ним — «в грудь»
      audio.play('shock', { vol: v * 0.7, bus: 'ui', reverb: 0 });
      audio.play('shriek', { vol: 0.65 + 0.45 * c.scare, bus: 'ui', reverb: 0.05 });
      // второй удар — через 0.72 с, когда игрок уже выдохнул: визг выше и ближе
      audio.play('shock', { vol: v * 0.8, bus: 'ui', reverb: 0.1, delay: 0.72, rate: 0.85 });
      audio.play('shriek', { vol: 0.7 + 0.45 * c.scare, bus: 'ui', reverb: 0.1, delay: 0.72, rate: 1.12 });
      r.glitch = 1;
      r.addTrauma(1);
      vibrate([160, 30, 40, 400, 200]);
      break;
    }
  }
}
