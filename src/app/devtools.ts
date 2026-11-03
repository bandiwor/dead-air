import { t } from '../i18n';
import { Kind } from '../content/enemies';
import { WEAPONS } from '../content/weapons';
import { NIGHTS } from '../content/nights';
import { BESTIARY } from '../content/bestiary';
import { WORLD, isWater } from '../proc/terrain';
import { spawnEnemy } from '../sim/enemies';
import { killEnemy } from '../sim/combat';
import { toWorld } from '../sim/houses';
import { saveProgress } from '../platform/storage';
import { DebugPanel, type DbgSection } from '../ui/debugPanel';
import type { Game } from './game';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const KIND_NAMES: Record<number, string> = { 0: 'ШЕП', 1: 'НЕМ', 2: 'ОТГ', 3: 'ЯВЛ', 4: 'НЕВ' };

/**
 * Инструменты отладки: читы, управление временем, телепорт, спавн, вид, сюжет.
 * Желаемое состояние читов хранится здесь и переносится в каждый новый мир (новая ночь, «ещё раз»).
 */
export class DevTools {
  private readonly g: Game;
  private readonly panel: DebugPanel;
  private readonly cheats = { god: false, ammo: false, freeze: false };
  private showStats = true;
  private hideHud = false;
  private fpsT = performance.now();
  private frames = 0;
  private fps = 0;

  constructor(g: Game, parent: HTMLElement) {
    this.g = g;
    this.panel = new DebugPanel(parent);
    this.panel.build(this.sections());
    const tick = (): void => {
      this.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.addEventListener('keydown', (e) => {
      // ` или F1 — панель отладки (на ПК)
      if (!this.enabled) return;
      if (e.code === 'Backquote' || e.code === 'F1') {
        e.preventDefault();
        this.panel.setOpen(!this.panel.open);
      }
    });
  }

  private enabled = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.panel.setEnabled(on);
    if (on && this.showStats) this.panel.stats.classList.remove('hidden');
    if (!on) {
      this.cheats.god = this.cheats.ammo = this.cheats.freeze = false;
      this.g.renderer!.debugDraw.group.visible = false;
      this.g.renderer!.debugZoom = 0;
      this.g.hud.root.classList.remove('dbg-hide');
      this.apply();
    }
  }

  private get w() {
    return this.g.world;
  }

  private apply(): void {
    Object.assign(this.w.cheats, this.cheats);
  }

  private sections(): DbgSection[] {
    const g = this.g;
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => ({ kind: 'toggle' as const, label, get, set });
    const action = (label: string, run: () => void) => ({ kind: 'action' as const, label, run });
    const cheat = (key: keyof DevTools['cheats'], label: string) =>
      toggle(label, () => this.cheats[key], (v) => {
        this.cheats[key] = v;
        this.apply();
      });
    const speedLabel = (): string => t('dbg.speed', { n: g.timeScale });
    const spawnAhead = (kind: number): void => {
      const p = this.w.player;
      for (const dist of [8, 6, 4]) {
        const x = p.x + Math.cos(p.yaw) * dist;
        const z = p.z + Math.sin(p.yaw) * dist;
        if (isWater(x, z) && kind !== Kind.Unseeing) continue;
        const e = spawnEnemy(this.w, kind as Kind, x, z);
        if (e && kind === Kind.Apparition) e.tx = 6;
        return;
      }
    };
    const tp = (x: number, z: number): void => {
      const p = this.w.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      this.w.updatePlayerHouse();
      g.renderer?.snapCamera(this.w);
    };

    return [
      {
        title: 'dbg.sec.cheats',
        items: [
          cheat('god', t('dbg.god')),
          cheat('ammo', t('dbg.ammo')),
          cheat('freeze', t('dbg.freeze')),
          action(t('dbg.weapons'), () => {
            const p = this.w.player;
            WEAPONS.forEach((wd, i) => {
              p.owned[i] = true;
              p.mag[i] = wd.mag;
              p.reserve[i] = Math.max(p.reserve[i]!, wd.crate * 4);
            });
            p.dynamite = Math.max(p.dynamite, 9);
          }),
          action(t('dbg.heal'), () => {
            this.w.player.hp = 100;
            this.w.player.sanity = 100;
          }),
          action(t('dbg.insane'), () => (this.w.player.sanity = 15)),
        ],
      },
      {
        title: 'dbg.sec.time',
        items: [
          toggle(t('dbg.pause'), () => g.simPaused, (v) => (g.simPaused = v)),
          action(t('dbg.step'), () => g.requestStep()),
          // одна кнопка: показывает текущую скорость, по нажатию — следующая
          action(speedLabel(), () => {
            const i = SPEEDS.indexOf(g.timeScale);
            g.timeScale = SPEEDS[(i + 1) % SPEEDS.length]!;
            this.panel.build(this.sections());
          }),
          action(t('dbg.plus30'), () => (this.w.time += 30)),
          action(t('dbg.nextWave'), () => {
            const next = this.w.cfg.night.waves[this.w.director.waveIndex + 1];
            if (next) this.w.time = Math.max(this.w.time, next.at);
          }),
          action(t('dbg.dawn'), () => (this.w.time = this.w.cfg.night.duration - 0.5)),
        ],
      },
      {
        title: 'dbg.sec.world',
        items: [
          action(t('dbg.killAll'), () => {
            for (const e of this.w.enemies) if (e.active && e.kind !== Kind.Apparition) killEnemy(this.w, e, false);
          }),
          action(t('dbg.deadAir'), () => (this.w.air = 0)),
          action(t('dbg.restoreAir'), () => {
            this.w.air = 1;
            if (this.w.deadAir) {
              this.w.deadAir = false;
              this.w.emit('airRestored', 0, 1, 0);
            }
            this.w.flags.delete('reelLocked');
          }),
          action(t('dbg.doors'), () => this.w.layout.houses.forEach((_, i) => this.w.setDoor(i, true))),
          action(t('dbg.jumpscare'), () => this.w.jumpscare()),
        ],
      },
      {
        title: 'dbg.sec.spawn',
        items: [
          action(t('dbg.spawn.whisperer'), () => spawnAhead(Kind.Whisperer)),
          action(t('dbg.spawn.mute'), () => spawnAhead(Kind.Mute)),
          action(t('dbg.spawn.echo'), () => spawnAhead(Kind.Echo)),
          action(t('dbg.spawn.unseeing'), () => spawnAhead(Kind.Unseeing)),
          action(t('dbg.spawn.apparition'), () => spawnAhead(Kind.Apparition)),
        ],
      },
      {
        title: 'dbg.sec.tp',
        items: [
          action(t('dbg.tp.square'), () => tp(2.5, 2.5)),
          action(t('dbg.tp.hut'), () => tp(this.w.layout.hutDoor.x, this.w.layout.hutDoor.z + 0.5)),
          action(t('dbg.tp.pier'), () => tp(WORLD.pier.x1 - 2.5, (WORLD.pier.z0 + WORLD.pier.z1) / 2)),
          action(t('dbg.tp.crevice'), () => tp(WORLD.crevice.ax + 0.5, WORLD.crevice.az + 3)),
          ...this.w.layout.houses.map((h, i) =>
            action(t('dbg.tp.house', { n: i }), () => {
              this.w.setDoor(i, true);
              const [x, z] = toWorld(h, 0, 0.6);
              tp(x, z);
            }),
          ),
        ],
      },
      {
        title: 'dbg.sec.view',
        items: [
          toggle(t('dbg.collision'), () => !!g.renderer?.debugDraw.group.visible, (v) => {
            if (g.renderer) g.renderer.debugDraw.group.visible = v;
          }),
          toggle(t('dbg.stats'), () => this.showStats, (v) => {
            this.showStats = v;
            this.panel.stats.classList.toggle('hidden', !v);
          }),
          toggle(t('dbg.zoom'), () => (g.renderer?.debugZoom ?? 0) > 0, (v) => {
            if (g.renderer) g.renderer.debugZoom = v ? 1.6 : 0;
          }),
          toggle(t('dbg.hud'), () => this.hideHud, (v) => {
            this.hideHud = v;
            g.hud.root.classList.toggle('dbg-hide', v);
          }),
        ],
      },
      {
        title: 'dbg.sec.story',
        items: [
          ...Object.entries(BESTIARY).map(([kind, card]) =>
            action(t('dbg.card', { name: t(card!.name) }), () => {
              this.panel.setOpen(false);
              g.showBeastCard(Number(kind));
            }),
          ),
          action(t('dbg.resetBeast'), () => {
            g.progress.seen = [];
            saveProgress(g.progress);
          }),
          action(t('dbg.unlock'), () => {
            g.progress.unlocked = NIGHTS.length;
            saveProgress(g.progress);
            g.refreshNights();
          }),
          ...NIGHTS.map((n, i) =>
            action(t('dbg.night', { name: t(n.titleKey) + (n.hidden ? ' · II' : '') }), () => {
              this.panel.setOpen(false);
              g.nightIdx = i;
              g.startNight();
            }),
          ),
        ],
      },
    ];
  }

  /** Оверлей статистики и список флагов (несколько раз в секунду). */
  updateStats(): void {
    if (!this.enabled) return;
    this.apply();
    const now = performance.now();
    if (now - this.fpsT > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsT);
      this.frames = 0;
      this.fpsT = now;
    }
    const w = this.w;
    const p = w.player;
    const r = this.g.renderer;
    const st = r?.stats;
    const kinds: Record<number, number> = {};
    for (const e of w.enemies) if (e.active) kinds[e.kind] = (kinds[e.kind] ?? 0) + (e.fake ? 0 : 1);
    const enemyLine = Object.entries(kinds).map(([k, n]) => `${KIND_NAMES[Number(k)] ?? k}:${n}`).join(' ') || '—';
    const focus = p.focus >= 0 ? w.interactables[p.focus]?.id : '—';
    const d = w.director as unknown as { nextScareAt: number; waveIndex: number; waveActive: boolean };
    const lines = [
      `FPS ${this.fps.toFixed(0)}  кадр ${st?.frameMs.toFixed(1)} мс  ${st?.width}×${st?.height}`,
      `draw ${st?.calls}  tris ${((st?.triangles ?? 0) / 1000).toFixed(1)}k  prog ${st?.programs}  tex ${st?.textures}  geo ${st?.geometries}`,
      `${w.cfg.night.id}  t ${w.time.toFixed(1)}/${w.cfg.night.duration}  ×${this.g.timeScale}${this.g.simPaused ? ' ПАУЗА' : ''}  режим ${this.g.mode}`,
      `волна ${d.waveIndex + 1}${d.waveActive ? ' идёт' : ''}  враги ${enemyLine}`,
      `эфир ${(w.air * 100).toFixed(0)}%${w.deadAir ? ' МЁРТВ' : ''}  напр. ${w.intensity.toFixed(2)}  пугалка через ${(d.nextScareAt - w.time).toFixed(0)} с`,
      `hp ${p.hp.toFixed(0)}  рассудок ${p.sanity.toFixed(0)}  дом ${w.playerHouse}  фокус ${focus}`,
      `pos ${p.x.toFixed(1)}, ${p.z.toFixed(1)}  y ${p.y.toFixed(2)}  обрывки ${w.fragments}  записи ${w.notesRead.length}`,
    ];
    this.panel.stats.textContent = lines.join('\n');
    this.panel.setFlags(`флаги (${w.flags.size}):\n${[...w.flags].sort().join('  ')}`);
  }
}
