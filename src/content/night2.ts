import type { NightDef } from './night';

/*
 * Ночь вторая «Глядень». Правда: двенадцатый двор (Ивашовы) стоял в низине у пруда.
 * Весенней ночью пришла вода; заслонку на запруде не подняли — берегли огороды; окна закрыли,
 * чтобы не слышать. Выплыл один мальчик. Его дом подняли из воды и сложили заново — радиоузлом.
 *
 * Механика ночи — противоречие Наказа: чтобы радио не замолкло (пункт 1), нужна лампа из чужого дома,
 * а открывать двери запрещено (пункт 2). Подчиниться всем правилам сразу нельзя.
 * Новые существа — Невидевшие: замирают под взглядом, бросаются, когда отворачиваешься.
 */
export const NIGHT2: NightDef = {
  id: 'night2',
  index: 2,
  titleKey: 'night.2',
  duration: 540,
  startHour: 22,
  endHour: 6,
  reelSeconds: 80,
  fog: 0.042,
  // вода: холоднее, зеленее, бледнее; морось и туман гуще
  look: { shadow: [0.55, 0.8, 0.9], highlight: [0.95, 1.0, 0.94], desat: 0.18, mist: 1.6, rain: true },
  lights: [false, false, false, false, false, false],
  startWeapons: ['revolver', 'flaregun', 'shotgun'],
  knockRule: 2,
  knockPrompt: 'prompt.open',
  rules: ['rule2.1', 'rule2.2', 'rule2.3', 'rule2.4', 'rule2.5', 'rule2.6'],
  dawnTruth: 'cut2.dawn.3b',
  dawnTitle: 'dawn2.title',
  dawnSub: 'dawn2.sub',
  waves: [
    { at: 20, pulse: 2.4, spawns: [{ kind: 'whisperer', count: 6, from: 'crevice' }, { kind: 'unseeing', count: 2, from: 'pond' }], startLine: 'n2.w1' },
    {
      at: 100, pulse: 1.9,
      spawns: [{ kind: 'unseeing', count: 4, from: 'pond' }, { kind: 'whisperer', count: 8, from: 'forest' }],
      startLine: 'n2.w2', endLine: 'n1.w2e', reward: { weapon: 'rifle', house: 3 },
    },
    {
      at: 185, pulse: 1.8,
      spawns: [{ kind: 'mute', count: 1, from: 'crevice' }, { kind: 'unseeing', count: 4, from: 'forest' }, { kind: 'whisperer', count: 6, from: 'forest' }],
      startLine: 'n2.w3', endLine: 'n1.w3e', reward: { weapon: 'smg', house: 0 },
    },
    {
      at: 270, pulse: 1.5,
      spawns: [{ kind: 'echo', count: 1, from: 'behind' }, { kind: 'unseeing', count: 6, from: 'pond' }, { kind: 'whisperer', count: 8, from: 'crevice' }],
      startLine: 'n2.w4',
    },
    {
      at: 360, pulse: 1.3,
      spawns: [{ kind: 'mute', count: 2, from: 'pond' }, { kind: 'unseeing', count: 6, from: 'forest' }, { kind: 'whisperer', count: 10, from: 'forest' }],
      startLine: 'n2.w5',
    },
    {
      at: 450, pulse: 1.05,
      spawns: [
        { kind: 'echo', count: 1, from: 'behind' }, { kind: 'unseeing', count: 8, from: 'pond' },
        { kind: 'mute', count: 1, from: 'crevice' }, { kind: 'whisperer', count: 12, from: 'forest' },
      ],
      startLine: 'n2.w6',
    },
  ],
  beats: [
    { id: 'nakaz', when: { t: 0.4 }, do: [{ note: 'note.nakaz2' }, { objective: 'obj.air', marker: null }] },
    { id: 'start', when: { t: 2 }, do: [{ line: 'n2.start' }] },
    { id: 'broke2', when: { flag: 'broke:2' }, do: [{ line: 'n2.broke2' }] },
    { id: 'broke3', when: { flag: 'broke:3' }, do: [{ line: 'n1.broke3' }] },
    { id: 'deadair', when: { flag: 'deadAir' }, do: [{ line: 'n2.deadair' }] },

    // лопнула лампа: чтобы соблюсти пункт 1, придётся нарушить пункт 2
    {
      id: 'lamp',
      when: { flag: 'wave:1:end' },
      do: [
        { wait: 2 }, { flag: 'reelLocked' }, { scare: 'duck' }, { line: 'n2.lamp1' }, { line: 'n2.lamp2' },
        { objective: 'obj.lamp', marker: { house: 0 } }, { enable: 'lamp' }, { appear: 'corner', house: 0 },
      ],
    },
    { id: 'corner', when: { flag: 'inside:0', notFlag: 'gotLamp' }, do: [{ line: 'n2.corner' }] },

    // зарубки на косяке радиоузла
    { id: 'marksHint', when: { t: 150 }, do: [{ enable: 'marks' }, { line: 'n2.marksHint' }] },
    { id: 'marks', when: { flag: 'marks' }, do: [{ wait: 0.5 }, { line: 'n2.marks2' }] },

    // процессия: одиннадцать выходят из воды
    {
      id: 'procession',
      when: { flag: 'wave:3:end' },
      do: [{ scare: 'duck' }, { wait: 1 }, { line: 'n2.proc1' }, { spawn: 'unseeing', count: 6, at: 'pierWater' }, { wait: 4 }, { line: 'n2.proc2' }],
    },
    // фигура на воде
    {
      id: 'water',
      when: { t: 340 },
      do: [{ appear: 'water' }, { line: 'n2.water' }, { objective: 'obj.look', marker: { pier: true } }, { enable: 'look' }],
    },
    { id: 'sanity', when: { sanityBelow: 30 }, do: [{ line: 'n2.sanity' }] },
  ],
  houses: [
    { house: 0, notes: [{ id: 'receiver2', key: 'note.receiver2', x: -2.45, z: 1.0 }], knock: [{ openDoor: 0 }, { line: 'n2.open' }] },
    {
      house: 1,
      notes: [{ id: 'mirror2', key: 'note.mirror2', x: 0, z: -1.7, after: [{ scare: 'duck' }, { wait: 0.8 }, { spawn: 'unseeing', count: 3, at: 'doorOut', house: 1 }, { line: 'n2.mirrorAfter' }] }],
      knock: [{ openDoor: 1 }, { line: 'n2.open' }],
    },
    { house: 2, notes: [{ id: 'cradle', key: 'note.cradle', x: 0.6, z: -1.3 }], knock: [{ scare: 'knockBack', house: 2 }, { wait: 2 }, { openDoor: 2 }, { line: 'n2.open2' }] },
    { house: 3, notes: [{ id: 'sluice', key: 'note.sluice', x: -1.2, z: -1.2 }], knock: [{ openDoor: 3 }, { line: 'n2.open' }] },
    { house: 4, notes: [{ id: 'floor2', key: 'note.floor2', x: 1.2, z: 0.2 }], knock: [{ openDoor: 4 }, { spawn: 'unseeing', count: 2, at: 'inside', house: 4 }, { line: 'n2.open4' }] },
    {
      house: 5,
      notes: [{ id: 'photo2', key: 'note.photo2', x: 1.95, z: -0.6, after: [{ scare: 'duck' }, { wait: 0.7 }, { scare: 'jumpscare' }] }],
      knock: [{ openDoor: 5 }, { line: 'n2.open' }],
    },
  ],
  extras: [
    { id: 'switch', prompt: 'prompt.switch', rule: true, at: 'hutSide', r: 1.1, hold: 0, enabled: true, once: false, effects: [{ flag: 'broke:1' }, { deadAir: true }, { line: 'n2.broke1' }] },
    {
      id: 'lamp', prompt: 'prompt.lamp', rule: false, at: { house: 0, x: 2.2, z: -1.6 }, r: 1.1, hold: 0.8, enabled: false, once: true, glint: true,
      effects: [
        { flag: 'gotLamp' }, { unflag: 'reelLocked' }, { objective: 'obj.air', marker: null }, { line: 'n2.lamp3' },
        { scare: 'duck' }, { wait: 1.1 }, { scare: 'turn' }, { wait: 1.4 }, { scare: 'jumpscare' }, { despawnPier: true },
      ],
    },
    { id: 'marks', prompt: 'prompt.read', rule: false, at: 'hutDoorSide', r: 1.2, hold: 0, enabled: false, once: true, glint: true, effects: [{ note: 'note.marks' }, { flag: 'marks' }] },
    {
      id: 'look', prompt: 'prompt.look', rule: true, at: 'pierStart', r: 1.8, hold: 2.2, enabled: false, once: true,
      effects: [
        { flag: 'broke:4' }, { objective: 'obj.air', marker: null }, { line: 'n2.look1' }, { scare: 'duck' },
        { wait: 1.6 }, { line: 'n2.look2' }, { scare: 'wet' }, { wait: 1.4 }, { scare: 'jumpscare' }, { despawnPier: true },
        { fragment: true }, { wait: 0.8 }, { spawn: 'unseeing', count: 3, at: 'pierWater' },
      ],
    },
  ],
  fragments: ['frag2.1', 'frag2.2', 'frag2.3', 'frag2.4', 'frag2.5', 'frag2.6', 'frag2.7', 'frag2.8', 'frag2.9', 'frag2.10'],
  intro: [
    { from: [40, 12, 40], to: [34, 8, 32], lookFrom: [27, -0.8, 19], lookTo: [26, -0.8, 19], dur: 7, fov: 38, line: 'cut2.intro.1' },
    { from: [9, 3, 1], to: [8, 2.6, -0.5], lookFrom: [6.5, 1.4, -3], lookTo: [6.5, 1.2, -3.2], dur: 6, fov: 40, line: 'cut2.intro.2' },
    { from: [2, 5, 10], to: [3.5, 14, 13], lookFrom: [4, 1, 2], lookTo: [3.8, 0.5, 2.6], dur: 7, fov: 42, line: 'cut2.intro.3' },
  ],
  dawn: [
    { from: [10, 8, 34], to: [14, 5, 30], lookFrom: [26, -0.8, 19], lookTo: [27, -0.8, 19], dur: 6, fov: 36, line: 'cut2.dawn.1' },
    { from: [19, 2.2, 23], to: [21, 1.6, 22], lookFrom: [27, -0.7, 19], lookTo: [27.5, -0.6, 18.5], dur: 7, fov: 40, line: 'cut2.dawn.2' },
    { from: [22, 1.4, 21], to: [23.5, 1.2, 20.5], lookFrom: [27.5, -0.5, 18.5], lookTo: [27.6, -0.3, 18.4], dur: 6, fov: 44, line: 'cut2.dawn.3' },
  ],
};
