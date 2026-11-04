import * as THREE from 'three';
import { World } from '../sim/world';
import { MENU_NIGHTS, NIGHTS } from '../content/nights';
import type { NightDef } from '../content/night';
import { emptyInput } from '../sim/types';
import { hashString } from '../core/rng';
import { AudioEngine } from '../audio/engine';
import { Ambience } from '../audio/ambience';
import { GameRenderer } from '../render/renderer';
import { loadTextures, type TextureSet } from '../render/textures';
import { Input } from '../platform/input';
import { enterImmersive, isTouch, onHidden, setVibration } from '../platform/native';
import { loadProgress, loadSettings, resetProgress, saveProgress, saveSettings, type Settings, type Progress } from '../platform/storage';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { Cutscene, type Shot } from './cutscene';
import type { StrKey } from '../i18n';
import { doorOf } from '../proc/layout';
import { WORLD, heightAt, water } from '../proc/terrain';
import { Kind } from '../content/enemies';
import { spawnEnemy } from '../sim/enemies';
import { YARD12 } from '../content/night3';
import { Updater, type UpdateStatus } from '../platform/updates';
import { t } from '../i18n';
import { handleEvents, nearestEnemy } from './events';
import { BESTIARY } from '../content/bestiary';
import { DevTools } from './devtools';
import { AchievementTracker } from './achievements';
import { AchToast } from '../ui/achToast';
import { PickupCard } from '../ui/pickupCard';
import { ScareOverlay } from '../ui/scareOverlay';
import { itemFor, itemShowcaseKind, type ItemDef } from '../content/items';
import { Installer } from '../platform/install';
import { InstallCard } from '../ui/installCard';

type Mode = 'boot' | 'loading' | 'title' | 'intro' | 'play' | 'note' | 'beast' | 'pause' | 'dying' | 'dead' | 'dawn' | 'dawnScreen';

const STEP = 1 / 60;
const TEX_SEED = 1953;

/**
 * Корень композиции: связывает симуляцию, рендер, звук, ввод и интерфейс.
 * Единственное место, которое знает обо всех слоях.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly root: HTMLElement;
  private settings: Settings;
  readonly audio = new AudioEngine();
  private readonly amb: Ambience;
  private readonly input: Input;
  readonly hud: Hud;
  private readonly screens: Screens;
  renderer: GameRenderer | null = null;
  world: World;
  mode: Mode = 'boot';
  private acc = 0;
  private last = 0;
  private attempt = 0;
  private cut: Cutscene | null = null;
  private readonly introSeen = new Set<number>();
  nightIdx = 0;
  progress: Progress = loadProgress();
  private menuT = 0;
  private modeT = 0;
  private readonly frame = emptyInput();
  private readonly updater = new Updater();
  private updateOffered = false;
  private readonly menuPos = new THREE.Vector3();
  private readonly menuLook = new THREE.Vector3(0, 2, 0);
  /** Отладка: масштаб времени, пауза симуляции, шаг по одному тику. */
  timeScale = 1;
  simPaused = false;
  private stepOnce = false;
  private dev: DevTools | null = null;
  private statsT = 0;
  /** Индекс следующей части ночи, которая начнётся после рассветной сцены (или −1). */
  private chainNext = -1;
  /** Постановка рассветной сцены: что показываем и сколько она уже идёт. */
  private stage: { kind: 'boat' | 'flood' | 'loop' | 'name' | null; t: number; step: number } = { kind: null, t: 0, step: -1 };
  private readonly installer = new Installer();
  private installCard!: InstallCard;
  /** Предложение установки показывается не чаще раза за запуск и не сразу. */
  private installOffered = false;
  /** Когда (performance.now) игрок оказался в меню; 0 — не в меню. */
  private installAt = 0;
  readonly ach: AchievementTracker;
  private readonly achToast: AchToast;
  private readonly pickupCard: PickupCard;
  private readonly scareOverlay: ScareOverlay;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    setVibration(this.settings.vibration);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    root.appendChild(this.canvas);
    const touch = document.createElement('div');
    touch.className = 'touch';
    root.appendChild(touch);
    this.input = new Input(touch);
    this.input.autofire = this.settings.autofire;
    this.input.onPause = () => this.togglePause();
    this.amb = new Ambience(this.audio);
    this.hud = new Hud(touch, this.input);
    this.screens = new Screens(root, this.settings, {
      onTap: () => void this.onBootTap(),
      onAcceptDisclaimer: () => {
        this.settings.disclaimerAccepted = true;
        saveSettings(this.settings);
        void this.load().catch((e: unknown) => this.fail(e));
      },
      onStart: (n: number) => {
        this.nightIdx = Math.max(0, NIGHTS.indexOf(MENU_NIGHTS[n]!));
        this.startNight();
      },
      onNext: () => {
        const nx = this.nextMenuNight(NIGHTS[this.nightIdx]!);
        if (nx) this.nightIdx = NIGHTS.indexOf(nx);
        this.startNight();
      },
      onResume: () => this.resume(),
      onRetry: () => this.startNight(),
      onToTitle: () => this.toTitle(),
      onSettingsChange: (s) => this.applySettings(s),
      onClick: () => this.audio.play('ui', { bus: 'ui', vol: 0.8, reverb: 0 }),
      onUpdateRow: () => {
        if (this.updater.status === 'available') void this.updater.apply();
        else void this.updater.check();
      },
      onUpdateApply: () => void this.updater.apply(),
      onInstallRow: () => this.openInstall(),
      onResetProgress: () => {
        resetProgress(this.progress);
        this.introSeen.clear();
        this.refreshNights();
        this.screens.setAchievements(this.progress.ach);
      },
    });
    this.installCard = new InstallCard(root, {
      onInstall: () => {
        this.installCard.close();
        void this.installer.install();
      },
      onLater: () => {
        this.installer.snooze();
        this.installCard.close();
      },
      onNever: () => {
        this.installer.never();
        this.installCard.close();
      },
      onClick: () => this.audio.play('ui', { bus: 'ui', vol: 0.8, reverb: 0 }),
    });
    this.installer.onChange = () => this.screens.setInstallMode(this.installer.mode);
    this.screens.setInstallMode(this.installer.mode);
    this.world = this.makeWorld();
    this.achToast = new AchToast(root);
    this.pickupCard = new PickupCard(touch);
    this.scareOverlay = new ScareOverlay(root);
    this.ach = new AchievementTracker(this.progress, () => saveProgress(this.progress), (a) => {
      this.achToast.push(a);
      this.audio.play('pickup', { bus: 'ui', vol: 0.7, rate: a.rarity === 'legendary' ? 0.7 : 1, reverb: 0.3 });
      this.screens.setAchievements(this.progress.ach);
    });
    this.screens.setAchievements(this.progress.ach);
    this.refreshNights();
    this.screens.open('boot');
    this.updater.onChange = (st) => this.onUpdateStatus(st);
    this.onUpdateStatus(this.updater.status);
    this.updater.start();

    onHidden(
      () => {
        if (this.mode === 'play' || this.mode === 'intro') this.pause();
        this.audio.suspend();
      },
      () => void this.audio.resume(),
    );
    window.addEventListener('resize', () => this.renderer?.resize());
    touch.addEventListener('pointerdown', () => {
      if (this.mode === 'intro' || this.mode === 'dawn') this.cut?.skip();
    });
    requestAnimationFrame((t) => this.loop(t));
  }

  private makeWorld(): World {
    const night = NIGHTS[this.nightIdx]!;
    return new World({ seed: hashString(`${night.id}:${this.attempt}:${Date.now() & 0xffff}`), night, scare: this.settings.scare });
  }

  private async onBootTap(): Promise<void> {
    if (this.mode !== 'boot') return;
    this.audio.init();
    void this.audio.resume();
    void enterImmersive();
    if (!this.settings.disclaimerAccepted) {
      this.screens.open('disclaimer');
      this.mode = 'loading';
      return;
    }
    await this.load().catch((e: unknown) => this.fail(e));
  }

  private fail(e: unknown): void {
    console.error(e);
    const el = document.createElement('div');
    el.className = 'fatal';
    el.textContent = `Ошибка: ${(e as Error)?.message ?? String(e)}`;
    document.body.appendChild(el);
  }

  private async load(): Promise<void> {
    this.mode = 'loading';
    this.screens.open('loading');
    const tex: TextureSet = await loadTextures(TEX_SEED, (d, n) => this.screens.setLoading('ui.loading.textures', (d / n) * 0.3));
    await this.audio.load((d, n) => this.screens.setLoading('ui.loading.sounds', 0.3 + (d / n) * 0.5));
    this.screens.setLoading('ui.loading.world', 0.85);
    await new Promise((r) => setTimeout(r, 0));
    this.renderer = new GameRenderer(this.canvas, this.world, tex, this.settings.quality);
    this.renderer.fx.flashScale = this.settings.reduceFlashes ? 0.35 : 1;
    this.renderer.invertFlash = !this.settings.reduceFlashes;
    this.renderer.resize();
    const rr = this.renderer;
    this.input.mouseAim = (sx, sy) => rr.aimFromScreen(this.world, sx, sy);
    this.setDebug(this.settings.debug);
    this.audio.setVolume(this.settings.volume);
    this.amb.start();
    this.screens.setLoading('ui.loading.world', 1);
    this.toTitle();
  }

  private applySettings(s: Settings): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    saveSettings(s);
    this.screens.updateSettings(s);
    setVibration(s.vibration);
    this.input.autofire = s.autofire;
    this.audio.setVolume(s.volume);
    this.setDebug(s.debug);
    if (this.renderer) {
      this.renderer.fx.flashScale = s.reduceFlashes ? 0.35 : 1;
      this.renderer.invertFlash = !s.reduceFlashes;
      if (qualityChanged) {
        this.renderer.setQuality(s.quality);
        this.renderer.resize();
      }
    }
  }

  /** Режим отладки: панель, оверлей, доступ из консоли (window.__game). */
  private setDebug(on: boolean): void {
    if (on && !this.dev && this.renderer) this.dev = new DevTools(this, this.root);
    this.dev?.setEnabled(on);
    if (on) (window as unknown as { __game: Game }).__game = this;
    else {
      this.timeScale = 1;
      this.simPaused = false;
    }
  }

  requestStep(): void {
    this.stepOnce = true;
  }

  private onUpdateStatus(st: UpdateStatus): void {
    this.screens.setUpdateStatus(t(`update.${st}`), this.updater.label);
    if (st === 'available') this.offerUpdate();
  }

  /** Окно обновления показывается только в меню — никогда посреди боя или кат-сцены. */
  private offerUpdate(): void {
    if (this.updater.status !== 'available' || this.updateOffered) return;
    const menus: string[] = ['boot', 'title', 'pause', 'dead', 'dawnScreen'];
    if (!menus.includes(this.mode)) return;
    this.updateOffered = true;
    this.screens.showUpdatePrompt(true);
  }

  /**
   * Рассвет — не только камера: то, о чём говорят субтитры, должно быть видно в кадре.
   * Симуляция стоит, поэтому сцену двигаем отсюда, только для показа.
   */
  private stageDawn(dt: number): void {
    const st = this.stage;
    const r = this.renderer;
    const cut = this.cut;
    if (!st.kind || !r || !cut) return;
    st.t += dt;
    const w = this.world;
    const p = w.player;
    const shot = cut.shot;
    const enter = shot !== st.step;
    st.step = shot;
    const ease = (x: number): number => x * x * (3 - 2 * x);
    if (st.kind === 'boat') {
      // лодку уносит на середину пруда; к утру дом уходит под воду по конёк
      const k = ease(Math.min(1, st.t / 7));
      const sx = WORLD.pier.x1 + 1.1;
      const sz = (WORLD.pier.z0 + WORLD.pier.z1) / 2 + 1.4;
      const bx = sx + (WORLD.pond.x + 1 - sx) * k;
      const bz = sz + (WORLD.pond.z + 2 - sz) * k;
      r.boatAt = { x: bx, z: bz };
      p.x = bx;
      p.z = bz;
      p.y = water.level - 0.1;
      p.vx = p.vz = 0;
      r.flashlightOn = true;
      r.yard12Sink = shot >= 1 ? 1 : 0;
      for (let i = 0; i < w.houseLight.length; i++) if (shot >= 1) w.houseLight[i] = false;
    } else if (st.kind === 'flood') {
      // вода идёт вниз по Щели и встаёт в деревне по окна
      water.level = -2.8 + 3.7 * ease(Math.min(1, st.t / 7.5));
    } else if (st.kind === 'loop') {
      if (enter && shot === 1) this.amb.setRadio(true);
    } else if (st.kind === 'name') {
      if (enter && shot === 1) {
        // одиннадцать встают из ила вокруг развалин — руки опущены
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2;
          const x = YARD12.x + Math.cos(a) * 4.2;
          const z = YARD12.z + Math.sin(a) * 4.2;
          const e = spawnEnemy(w, Kind.Apparition, x, z);
          if (!e) continue;
          e.y = heightAt(x, z);
          e.yaw = Math.atan2(YARD12.z - z, YARD12.x - x);
          e.state = 1;
          e.t = 10;
        }
      }
      if (enter && shot === 2) {
        for (const e of w.enemies) e.active = false;
        // на дне Глядня — лужа: в ней видно отражение
        water.level = heightAt(WORLD.pond.x, WORLD.pond.z) + 0.25;
      }
    }
  }

  /** Окошко установки по кнопке в настройках — без учёта «позже». */
  private openInstall(): void {
    this.installOffered = true;
    this.installCard.open(this.installer.mode);
  }

  /** Само предлагает установку: только в меню, через пару секунд, если не мешает окно обновления. */
  private maybeOfferInstall(): void {
    const menu = this.mode === 'title' || this.mode === 'dawnScreen';
    if (!menu) {
      this.installAt = 0;
      // посреди игры окошко не висит; в паузе (из настроек) — можно
      const busy = this.mode === 'play' || this.mode === 'intro' || this.mode === 'dawn' || this.mode === 'dying';
      if (busy && this.installCard.isOpen) this.installCard.close();
      return;
    }
    if (this.installOffered || this.screens.updateOpen || !this.installer.shouldOffer()) return;
    const now = performance.now();
    if (this.installAt === 0) this.installAt = now;
    if (now - this.installAt < 2500) return;
    this.installOffered = true;
    this.installCard.open(this.installer.mode);
  }

  private toTitle(): void {
    this.mode = 'title';
    this.input.enabled = false;
    this.input.reset();
    this.hud.setVisible(false);
    this.hud.clearSubs();
    this.screens.open('title');
    this.offerUpdate();
    this.letterbox(false);
    this.world = this.makeWorld();
    if (this.renderer) this.renderer.fade = 0;
  }

  startNight(): void {
    if (!this.renderer) return;
    this.attempt++;
    this.world = this.makeWorld();
    this.ach.resetNight();
    this.hud.clearSubs();
    this.screens.open('none');
    this.renderer.fade = 0;
    this.renderer.hurt = 0;
    this.amb.setRadio(!NIGHTS[this.nightIdx]!.noRadio);
    void enterImmersive();
    this.renderer.setNight(NIGHTS[this.nightIdx]!);
    if (!this.introSeen.has(this.nightIdx)) {
      this.introSeen.add(this.nightIdx);
      this.mode = 'intro';
      this.cut = new Cutscene(NIGHTS[this.nightIdx]!.intro);
      this.cut.onLine = (k, d) => this.hud.cue(k, d);
      this.letterbox(true);
      this.hud.setVisible(true);
      this.hud.setTouch(false);
      this.cut.start();
    } else {
      this.beginPlay();
    }
  }

  private beginPlay(): void {
    this.mode = 'play';
    this.letterbox(false);
    this.hud.setVisible(true);
    this.hud.setTouch(isTouch());
    this.input.enabled = true;
    this.input.reset();
    this.renderer?.snapCamera(this.world);
    this.acc = 0;
  }

  /** Журнал: какие пункты Наказа нарушены, что прочитано, что услышано в тишине. */
  private refreshJournal(): void {
    const w = this.world;
    const night = w.cfg.night;
    const rules = night.rules.map((key, i) => ({ key, broken: w.flags.has(`broke:${i + 1}`) }));
    const notes = w.notesRead
      .map((id) => w.interactables.find((it) => it.id === id)?.key)
      .filter((k): k is string => !!k) as StrKey[];
    const heard = night.fragments.slice(0, w.fragments);
    this.screens.setJournal(rules, notes, heard);
  }

  refreshNights(): void {
    this.screens.setNights(MENU_NIGHTS.map((n) => n.titleKey), this.progress.unlocked);
  }

  /** Следующая ночь в меню (части одной ночи не считаются). */
  private nextMenuNight(n: NightDef): NightDef | undefined {
    return MENU_NIGHTS.find((m) => m.index === n.index + 1);
  }

  private brokenCount(): number {
    let n = 0;
    for (let i = 1; i <= 6; i++) if (this.world.flags.has(`broke:${i}`)) n++;
    return n;
  }

  /**
   * Первая встреча с существом — кинематографичный стоп-кадр: кадр замирает,
   * слева проявляется модель, справа имя, описание и совет. Один раз за всю игру на каждое существо.
   */
  private checkBestiary(): void {
    const w = this.world;
    const p = w.player;
    for (const e of w.enemies) {
      if (!e.active || e.fake || this.progress.seen.includes(e.kind)) continue;
      const card = BESTIARY[e.kind as keyof typeof BESTIARY];
      if (!card) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 13 || e.fade < 0.6 || !(e.litAny || d < 5)) continue;
      this.progress.seen.push(e.kind);
      saveProgress(this.progress);
      this.showBeastCard(e.kind);
      return;
    }
  }

  /** Стоп-кадр с карточкой существа (вызывается и из отладки). */
  showBeastCard(kind: number): void {
    const card = BESTIARY[kind as keyof typeof BESTIARY];
    if (!card) return;
    this.freezeCard(kind, t(card.name), t(card.desc), t(card.tip), 'ui.new');
  }

  /**
   * Находка: первая каждого вида — стоп-кадр с моделью (как первая встреча с существом),
   * повторные — маленькая карточка снизу с иконкой и количеством.
   */
  private onPickup(kind: number, a: number, amount: number): void {
    const item = itemFor(kind, a);
    if (!item) return;
    if (!this.progress.items.includes(item.id) && this.mode === 'play') {
      this.progress.items.push(item.id);
      saveProgress(this.progress);
      this.showItemCard(item);
    } else {
      this.pickupCard.show(item, amount);
    }
  }

  showItemCard(item: ItemDef): void {
    this.freezeCard(itemShowcaseKind(item), t(item.name), t(item.desc), t(item.tip), 'ui.found');
  }

  private freezeCard(kind: number, name: string, desc: string, tip: string, tag: StrKey): void {
    if (this.mode !== 'play') return;
    this.mode = 'beast';
    this.input.enabled = false;
    this.input.reset();
    this.renderer?.startShowcase(kind);
    this.hud.root.classList.add('beastmode');
    this.audio.duck(3);
    this.audio.play('tapestop', { bus: 'ui', vol: 0.9, reverb: 0.2 });
    this.audio.play('sting', { bus: 'ui', vol: 0.35, rate: 0.55, delay: 0.35, reverb: 0.4 });
    this.screens.showBeast(name, desc, tip, () => {
      this.renderer?.stopShowcase();
      this.hud.root.classList.remove('beastmode');
      if (this.mode !== 'beast') return;
      this.mode = 'play';
      this.input.enabled = true;
      this.input.reset();
      this.acc = 0;
    }, tag);
  }

  /** Записка: игра стоит, пока её читают. */
  private openNote(key: string): void {
    if (this.mode !== 'play') return;
    this.mode = 'note';
    this.input.enabled = false;
    this.input.reset();
    this.screens.showNote(t(key as StrKey), () => {
      if (this.mode !== 'note') return;
      this.mode = 'play';
      this.input.enabled = true;
      this.input.reset();
      this.acc = 0;
    });
  }

  private pause(): void {
    if (this.mode !== 'play' && this.mode !== 'intro') return;
    this.mode = 'pause';
    this.input.enabled = false;
    this.input.reset();
    this.hud.setVisible(false);
    this.refreshJournal();
    this.screens.open('pause');
    this.offerUpdate();
  }

  /**
   * Esc / P: открыть меню паузы или закрыть его. Из настроек, открытых в паузе, — назад в паузу.
   * Записку и карточку существа Esc тоже закрывает (как кнопка «продолжить»).
   */
  private togglePause(): void {
    if (this.mode === 'play' || this.mode === 'intro') this.pause();
    else if (this.mode === 'pause') {
      if (this.screens.current === 'settings') this.screens.open('pause');
      else this.resume();
    } else if (this.mode === 'note' || this.mode === 'beast') this.screens.dismissCard();
  }

  private resume(): void {
    if (this.mode !== 'pause') return;
    this.screens.open('none');
    void this.audio.resume();
    if (this.cut && !this.cut.done) {
      this.mode = 'intro';
      this.hud.setVisible(true);
    } else {
      this.beginPlay();
    }
  }

  private letterbox(on: boolean): void {
    if (this.renderer) this.renderer.cinematic = on;
    this.hud.root.classList.toggle('cine', on);
    this.screens.letterbox.classList.toggle('on', on);
    this.screens.skipHint.classList.toggle('hidden', !on);
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.modeT += dt;
    const r = this.renderer;
    if (!r) return;
    this.maybeOfferInstall();
    const w = this.world;

    if (this.mode === 'play' || this.mode === 'dying') {
      const maxSteps = Math.ceil(6 * this.timeScale);
      if (this.simPaused) {
        this.acc = 0;
        if (this.stepOnce) {
          this.stepOnce = false;
          w.step(this.input.sample(this.frame), STEP);
        }
      } else {
        this.acc += dt * this.timeScale;
      }
      let steps = 0;
      while (this.acc >= STEP && steps < maxSteps) {
        w.step(this.input.sample(this.frame), STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
      const mp = this.input.mousePos;
      r.mouseLook = mp && this.mode === 'play' ? { x: (mp.x / innerWidth) * 2 - 1, y: (mp.y / innerHeight) * 2 - 1 } : null;
      r.followCamera(w, dt);
      if (this.mode === 'play') this.checkBestiary();
    } else if (this.mode === 'intro' || this.mode === 'dawn') {
      const shot = this.cut?.update(dt);
      if (this.mode === 'dawn') this.stageDawn(dt);
      if (shot) {
        r.shotCamera({ pos: shot.pos, look: shot.look, fov: shot.fov });
        r.fade = 1 - Math.min(1, shot.k * 1.2);
      } else if (this.mode === 'intro') {
        r.fade = 0;
        this.hud.clearSubs();
        this.beginPlay();
      } else if (this.chainNext >= 0) {
        // часть ночи окончена — сразу следующая часть, без экрана рассвета
        r.fade = 1;
        this.nightIdx = this.chainNext;
        this.chainNext = -1;
        this.letterbox(false);
        this.startNight();
      } else {
        r.fade = 1;
        this.mode = 'dawnScreen';
        this.hud.setVisible(false);
        this.letterbox(false);
        this.screens.open('dawn');
        this.offerUpdate();
      }
    } else if (this.mode === 'title' || this.mode === 'loading') {
      this.menuT += dt;
      const a = this.menuT * 0.04;
      this.menuPos.set(Math.cos(a) * 26, 11, Math.sin(a) * 26 + 4);
      r.shotCamera({ pos: this.menuPos, look: this.menuLook, fov: 44 });
    }

    if (this.mode === 'dying') {
      r.fade = Math.min(1, this.modeT / 2.2);
      if (this.modeT > 2.4) {
        this.mode = 'dead';
        this.hud.setVisible(false);
        this.screens.open('dead');
        this.offerUpdate();
      }
    }

    const ctx = {
      audio: this.audio,
      amb: this.amb,
      r,
      hud: this.hud,
      scare: this.settings.scare,
      reduceFlashes: this.settings.reduceFlashes,
      onDeath: () => {
        this.mode = 'dying';
        this.modeT = 0;
        this.input.enabled = false;
        this.input.reset();
      },
      onNote: (key: string) => this.openNote(key),
      onPickup: (kind: number, a: number, amount: number) => this.onPickup(kind, a, amount),
      onJumpscare: () => this.scareOverlay.play(this.settings.reduceFlashes),
      onDawn: () => {
        this.mode = 'dawn';
        this.input.enabled = false;
        this.input.reset();
        this.hud.setTouch(false);
        this.letterbox(true);
        // концовка зависит от того, искал ли игрок правду: нарушения, записи, услышанное
        const w2 = this.world;
        const truth = this.brokenCount() * 2 + w2.notesRead.length + w2.fragments;
        const night = w2.cfg.night;
        let shots: Shot[] = night.dawn.map((sh, i) => (i === night.dawn.length - 1 && truth >= 5 ? { ...sh, line: night.dawnTruth } : sh));
        let title = night.dawnTitle;
        let sub = night.dawnSub;
        // у ночи может быть несколько концовок — выбирает флаг, поставленный решением игрока
        const end = night.endings?.find((e) => w2.flags.has(e.flag));
        if (end) {
          shots = end.dawn;
          title = end.title;
          sub = end.sub;
          const id = end.flag.replace('end:', '');
          if (!this.progress.endings.includes(id)) this.progress.endings.push(id);
        }
        this.stage = { kind: night.child ? 'boat' : ((end?.flag.replace('end:', '') ?? null) as typeof this.stage.kind), t: 0, step: -1 };
        const nextPart = night.next ? NIGHTS.findIndex((n) => n.id === night.next) : -1;
        this.chainNext = nextPart;
        // рассвет открывает следующую ночь (но не часть той же самой)
        if (nextPart < 0 && this.progress.unlocked < night.index + 1) {
          this.progress.unlocked = night.index + 1;
          this.refreshNights();
        }
        saveProgress(this.progress);
        this.screens.setDawn(title, sub, t('dawn.stats', { r: this.brokenCount(), n: w2.notesRead.length, f: w2.fragments }), !!this.nextMenuNight(night));
        this.cut = new Cutscene(shots);
        this.cut.onLine = (k, d) => this.hud.cue(k, d);
        this.cut.start();
      },
    };
    this.ach.onEvents(w);
    if (this.mode === 'play' || this.mode === 'dying') this.ach.check(w);
    handleEvents(w, ctx, dt);

    const playing = this.mode === 'play' || this.mode === 'note' || this.mode === 'beast' || this.mode === 'dying' || this.mode === 'pause';
    r.flashlightOn = this.mode !== 'title' && this.mode !== 'loading';
    r.render(w, dt, playing);
    const p = w.player;
    this.audio.setListener(p.x, p.z);
    this.amb.update(
      {
        px: this.mode === 'title' ? r.camera.position.x : p.x,
        pz: this.mode === 'title' ? r.camera.position.z : p.z,
        tension: w.intensity,
        sanity: p.sanity / 100,
        hp: p.hp / 100,
        deadAir: w.deadAir,
        radioGain: w.radioGain,
        nearestEnemy,
        playing: this.mode !== 'boot',
      },
      dt,
    );
    if (this.dev) {
      this.statsT -= dt;
      if (this.statsT <= 0) {
        this.statsT = 0.25;
        this.dev.updateStats();
      }
    }
    const ps = r.project(p.x, p.y + 1, p.z);
    this.input.playerScreen = ps;
    if (this.mode === 'play' || this.mode === 'note' || this.mode === 'beast' || this.mode === 'intro' || this.mode === 'dawn') {
      const door = w.layout.hutDoor;
      // метка цели: экранная точка + расстояние от игрока (подписывается, когда цель за краем экрана)
      const mark = (x: number, z: number): { x: number; y: number; dist: number } => ({ ...r.project(x, 1, z), dist: Math.hypot(x - p.x, z - p.z) });
      let goal: { x: number; y: number; dist: number } | null = null;
      const m = w.marker;
      if (m && m.house !== undefined && w.playerHouse !== m.house) {
        const h = w.layout.houses[m.house];
        if (h) {
          const d = doorOf(h, 1);
          goal = mark(d.x, d.z);
        }
      } else if (m?.pier) goal = mark(WORLD.pier.x1 - 0.5, (WORLD.pier.z0 + WORLD.pier.z1) / 2);
      else if (m?.at) goal = mark(m.at[0], m.at[1]);
      this.hud.update(w, dt, this.input.usingTouch || isTouch(), mark(door.x, door.z), goal);
    }
  }
}
