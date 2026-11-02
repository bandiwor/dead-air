import type { World } from './world';
import type { InputFrame } from './types';

/**
 * Взаимодействия: ближайший активный объект в радиусе — «в фокусе».
 * Короткое нажатие ДЕЙСТВ. — стук/осмотр/рубильник; удержание — позвать с пристани.
 */
export function updateInteract(w: World, inp: InputFrame, dt: number): void {
  const p = w.player;
  const pressed = inp.action && !p.actionPrev;
  p.actionPrev = inp.action;
  p.holding = false;
  if (p.canReel || !p.alive) {
    p.focus = -1;
    p.focusHold = 0;
    return;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < w.interactables.length; i++) {
    const it = w.interactables[i]!;
    if (!it.enabled) continue;
    // рубильник бессмысленен в мёртвом эфире
    if (it.id === 'switch' && w.deadAir) continue;
    // записки и вещи в домах — только изнутри
    if ((it.kind === 'note' || (it.kind === 'custom' && it.house >= 0)) && w.playerHouse !== it.house) continue;
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < it.r && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  if (best !== p.focus) p.focusHold = 0;
  p.focus = best;
  if (best < 0) return;
  const it = w.interactables[best]!;
  if (it.hold > 0) {
    if (inp.action) {
      p.holding = true;
      p.focusHold += dt;
      if (p.focusHold >= it.hold) {
        p.focusHold = 0;
        trigger(w, best);
      }
    } else {
      p.focusHold = Math.max(0, p.focusHold - dt * 2);
    }
  } else if (pressed) {
    trigger(w, best);
  }
}

function trigger(w: World, index: number): void {
  const it = w.interactables[index]!;
  const p = w.player;
  const night = w.cfg.night;
  switch (it.kind) {
    case 'note': {
      const first = !w.notesRead.includes(it.id);
      if (first) w.notesRead.push(it.id);
      w.flags.add(it.id);
      w.emit('note', it.x, 1, it.z, 0, 0, 0, it.key);
      if (first) {
        const def = night.houses.find((h) => h.house === it.house)?.notes.find((n) => `note:${n.id}` === it.id);
        // эффекты «после прочтения» случатся сразу после закрытия записки (симуляция стоит, пока её читают)
        if (def?.after) w.later(0.25, () => w.narrative.run(def.after!));
      }
      break;
    }
    case 'knock': {
      it.enabled = false;
      it.used = true;
      w.emit('knock', it.x, 1, it.z, it.house);
      w.noise(it.x, it.z, 0.25);
      if (night.knockRule > 0) {
        p.sanity = Math.max(0, p.sanity - 5);
        w.flags.add(`broke:${night.knockRule}`);
      }
      const def = night.houses.find((h) => h.house === it.house);
      if (def) w.later(1.6, () => w.narrative.run(def.knock));
      break;
    }
    case 'custom':
      if (it.once) {
        it.enabled = false;
        it.used = true;
      }
      w.narrative.run(it.effects);
      break;
  }
}
