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
  // в отражении доступно только то, что видно в отражении, и наоборот
  const refl = w.reflecting;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < w.interactables.length; i++) {
    const it = w.interactables[i]!;
    if (!it.enabled) continue;
    if (it.reflect !== refl) continue;
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

  // «Смотреть в воду»: у пруда, лужи, в подполе — держите ДЕЙСТВ., и взгляд уходит в отражение.
  // Пока смотрите, стоите на месте; хватает на один вдох (вдох тратит player.ts).
  w.canReflect = !refl && best < 0 && !!w.cfg.night.reflect && p.breath > 0.25 && w.waterNear(p.x, p.z);
  if (!refl && w.canReflect && inp.action) setReflect(w, true);
  else if (refl && !inp.action) setReflect(w, false);
  if (w.reflecting) p.holding = true;
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

/** Войти в отражение / выйти из него. */
export function setReflect(w: World, on: boolean): void {
  if (w.reflecting === on) return;
  const p = w.player;
  w.reflecting = on;
  w.emit('reflect', p.x, p.y, p.z, on ? 1 : 0);
  if (on) {
    w.reflectCount++;
    // со второго раза, ближе к середине ночи, за спиной в отражении кто-то стоит
    if (w.reflectCount >= 2 && w.time > 120 && !w.flags.has('reflectFigure')) {
      w.flags.add('reflectFigure');
      const a = p.yaw + Math.PI;
      w.reflectFigure = { x: p.x + Math.cos(a) * 1.4, z: p.z + Math.sin(a) * 1.4 };
      w.emit('reflectFigure', w.reflectFigure.x, p.y, w.reflectFigure.z);
    }
  } else if (w.reflectFigure) {
    // подняли глаза — а он и правда стоит за спиной
    w.reflectFigure = null;
    w.narrative.run([{ appear: 'behind' }, { line: 'n2.behindReal' }]);
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
      // увиденное в отражении — тоже прочитанное (идёт в журнал и в счёт правды)
      if (it.reflect && it.key && !w.notesRead.includes(it.id)) w.notesRead.push(it.id);
      if (it.once) {
        it.enabled = false;
        it.used = true;
      }
      w.narrative.run(it.effects);
      break;
  }
}
