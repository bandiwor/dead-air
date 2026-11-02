import type { BeatDef } from '../content/night1';
import type { World } from '../sim/world';

/**
 * Нарративный движок: декларативные биты (условие → реплики). Никакого исполняемого кода в контенте.
 * Реплики идут очередью, чтобы не налезать друг на друга.
 */
export class Narrative {
  private readonly w: World;
  private readonly done = new Set<string>();
  private queue: { key: string; style: number }[] = [];
  private nextLineAt = 0;

  constructor(w: World) {
    this.w = w;
  }

  update(_dt: number): void {
    const w = this.w;
    for (const b of w.cfg.night.beats) {
      if (this.done.has(b.id) || !this.check(b)) continue;
      this.done.add(b.id);
      for (const key of b.lines) this.queue.push({ key, style: b.style ?? 0 });
    }
    if (this.queue.length > 0 && w.time >= this.nextLineAt) {
      const l = this.queue.shift()!;
      w.emit('line', 0, 0, 0, l.style, 0, 0, l.key);
      this.nextLineAt = w.time + 4.2;
    }
  }

  private check(b: BeatDef): boolean {
    const w = this.w;
    const c = b.when;
    if ('t' in c) return w.time >= c.t;
    if ('flag' in c) return w.flags.has(c.flag);
    if ('sanityBelow' in c) return w.player.sanity < c.sanityBelow;
    return false;
  }
}
