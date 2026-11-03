import { ACHIEVEMENTS, type AchievementDef } from '../content/achievements';
import { BESTIARY } from '../content/bestiary';
import { Kind } from '../content/enemies';
import { weaponIndex } from '../content/weapons';
import type { World } from '../sim/world';
import type { Progress } from '../platform/storage';

/**
 * Трекер достижений: читает события симуляции и состояние мира, ничего в них не меняет.
 * Счётчики «за ночь» сбрасываются при старте новой ночи.
 */
export class AchievementTracker {
  private readonly progress: Progress;
  private readonly save: () => void;
  private readonly onUnlock: (a: AchievementDef) => void;
  private statueKills = 0;
  private shotsInChoir = 0;
  private choirSeen = false;

  constructor(progress: Progress, save: () => void, onUnlock: (a: AchievementDef) => void) {
    this.progress = progress;
    this.save = save;
    this.onUnlock = onUnlock;
  }

  has(id: string): boolean {
    return this.progress.ach.includes(id);
  }

  unlock(id: string): void {
    if (this.has(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    this.progress.ach.push(id);
    this.save();
    this.onUnlock(def);
  }

  resetNight(): void {
    this.statueKills = 0;
    this.shotsInChoir = 0;
    this.choirSeen = false;
  }

  /** Вызывается до того, как события кадра будут обработаны и очищены. */
  onEvents(w: World): void {
    let explosiveKills = 0;
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i]!;
      switch (e.type) {
        case 'kill':
          this.unlock('first_blood');
          if (e.b > 0) explosiveKills++;
          if (e.a === Kind.Unseeing && ++this.statueKills >= 10) this.unlock('statue');
          break;
        case 'airRestored':
          this.unlock('reel');
          break;
        case 'note':
          if (e.s !== 'note.nakaz' && e.s !== 'note.nakaz2' && e.s !== 'note.nakaz3') this.unlock('reader');
          break;
        case 'shot':
          if (this.choirSeen && !w.flags.has('choirDown')) this.shotsInChoir++;
          break;
        case 'dawn':
          this.onDawn(w);
          break;
      }
    }
    if (explosiveKills >= 3) this.unlock('boom');
  }

  /** Периодические проверки состояния (раз в кадр — дёшево: только флаги и счётчики). */
  check(w: World): void {
    const f = w.flags;
    if (f.has('choirUp')) this.choirSeen = true;
    if (f.has('choirDown') && this.choirSeen && this.shotsInChoir === 0) this.unlock('silence');
    if (w.player.owned[weaponIndex('smg')] && !w.cfg.night.startWeapons.includes('smg')) this.unlock('armed');
    if (w.cfg.night.knockRule > 0 && f.has(`broke:${w.cfg.night.knockRule}`)) this.unlock('knock');
    if (f.has('broke:1')) this.unlock('switch');
    if (w.cfg.night.id === 'night1' && f.has('broke:4')) this.unlock('caller');
    if (f.has('gotLamp')) this.unlock('lamp');
    if (w.fragments >= 5) this.unlock('overheard');
    if (w.fragments >= 10) this.unlock('fullstory');
    const totalNotes = w.cfg.night.houses.reduce((n, h) => n + h.notes.length, 0);
    if (totalNotes > 0 && w.notesRead.filter((id) => id.startsWith('note:')).length >= totalNotes) this.unlock('archivist');
    const beasts = Object.keys(BESTIARY).map(Number);
    if (beasts.every((k) => this.progress.seen.includes(k))) this.unlock('naturalist');
    for (const end of ['flood', 'loop', 'name']) {
      if (f.has(`end:${end}`) && !this.progress.endings.includes(end)) {
        this.progress.endings.push(end);
        this.save();
      }
    }
    if (f.has('end:name')) this.unlock('name');
    if (['flood', 'loop', 'name'].every((x) => this.progress.endings.includes(x))) this.unlock('three');
  }

  private onDawn(w: World): void {
    const n = w.cfg.night;
    if (n.id === 'night1') this.unlock('dawn1');
    if (n.id === 'night2') this.unlock('dawn2');
    if (n.id === 'night3b') this.unlock('dawn3');
    const broke = [...w.flags].some((x) => x.startsWith('broke:'));
    if (n.knockRule > 0 && !broke) this.unlock('obedient');
  }
}
