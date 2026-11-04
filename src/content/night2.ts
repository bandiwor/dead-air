import type { NightDef } from './night';
import type { Effect } from './script';
import { HOUSE_SITES } from '../proc/sites';
import { WORLD } from '../proc/terrain';

/** Точка в координатах дома (x — вдоль фасада, z — вглубь, дверь на +z) → мир. */
function inHouse(i: number, lx: number, lz: number): { x: number; z: number } {
  const h = HOUSE_SITES[i]!;
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}
const frontOf = (i: number, out: number, side = 0): { x: number; z: number } => inHouse(i, side, HOUSE_SITES[i]!.d / 2 + out);

/** Лужи после весенней ночи. В каждую можно заглянуть; в некоторых видно то, чего нет наверху. */
const PUDDLE_HUT = { x: 8.6, z: -1.6, r: 0.9 };
const PUDDLE_KEY = { ...frontOf(3, 2.4, 1.6), r: 0.8 };
const CELLAR = { ...inHouse(4, 1.2, -0.6), r: 0.7 };

/** Открыть дверь — нарушить пункт 2. Стучать можно: за дверью отвечают. */
const open = (i: number, extra: Effect[] = []): NightDef['extras'][number] => ({
  id: `open${i}`, prompt: 'prompt.open', rule: true, at: { door: i }, r: 1.3, hold: 0.8, enabled: false, once: true,
  effects: [{ flag: 'broke:2' }, { openDoor: i }, ...extra],
});

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
  reelSeconds: 130,
  reels: 1,
  // стучать можно, открывать — нет: пока пункт 2 цел, в дома они не входят
  wards: [{ rule: 1, kind: 'pole' }, { rule: 2, kind: 'houses' }, { rule: 3, kind: 'trail' }],
  fog: 0.042,
  // вода: холоднее, зеленее, бледнее; морось и туман гуще
  look: { shadow: [0.55, 0.8, 0.9], highlight: [0.95, 1.0, 0.94], desat: 0.18, mist: 1.6, rain: true },
  lights: [false, false, false, false, false, false],
  startWeapons: ['revolver', 'flaregun', 'shotgun'],
  // стучать можно — открывать нельзя: стук здесь разговор, а не нарушение
  knockRule: 0,
  knockPrompt: 'prompt.knock2',
  // ночь повторяет ту весну: Глядень всю ночь выходит из берегов, к рассвету отступает
  water: { from: -0.75, to: -0.32, t0: 30, t1: 500 },
  dawnRecede: -1.7,
  turnRule: 6,
  reflect: {
    puddles: [PUDDLE_HUT, PUDDLE_KEY, CELLAR, { x: -6, z: 4, r: 1 }, { x: 3, z: 8.5, r: 0.8 }, { x: -9, z: -10, r: 0.9 }, { x: 18, z: -3, r: 0.8 }],
    // задержались дольше вдоха — вода смотрит в ответ
    overstay: [{ flag: 'broke:4' }, { line: 'n2.overstay' }, { scare: 'wet' }, { wait: 0.8 }, { spawn: 'unseeing', count: 2, at: 'behind' }],
  },
  rules: ['rule2.1', 'rule2.2', 'rule2.3', 'rule2.4', 'rule2.5', 'rule2.6'],
  dawnTruth: 'cut2.dawn.3b',
  dawnTitle: 'dawn2.title',
  dawnSub: 'dawn2.sub',
  // Три волны; между ними — вода поднимается, и в тишине приходит процессия.
  waves: [
    { at: 25, pulse: 2.4, spawns: [{ kind: 'unseeing', count: 3, from: 'pond' }, { kind: 'whisperer', count: 4, from: 'crevice' }], startLine: 'n2.w1' },
    {
      at: 240, pulse: 1.8,
      spawns: [{ kind: 'mute', count: 1, from: 'crevice' }, { kind: 'unseeing', count: 6, from: 'pond' }, { kind: 'whisperer', count: 5, from: 'forest' }],
      startLine: 'n2.w3', endLine: 'n1.w2e', reward: { weapon: 'rifle', house: 3 },
    },
    {
      at: 420, pulse: 1.25,
      spawns: [
        { kind: 'echo', count: 1, from: 'behind' }, { kind: 'unseeing', count: 8, from: 'pond' },
        { kind: 'mute', count: 1, from: 'crevice' }, { kind: 'whisperer', count: 6, from: 'forest' },
      ],
      startLine: 'n2.w6',
    },
  ],
  beats: [
    { id: 'nakaz', when: { t: 0.4 }, do: [{ note: 'note.nakaz2' }, { objective: 'obj.air', marker: null }] },
    { id: 'start', when: { t: 2 }, do: [{ line: 'n2.start' }, { wait: 4 }, { line: 'n2.reflectHint' }] },
    { id: 'turned', when: { flag: 'turnedAway' }, do: [{ line: 'n2.turned' }] },
    { id: 'rising', when: { t: 200 }, do: [{ line: 'n2.rising' }] },
    { id: 'lull1', when: { t: 110 }, do: [{ line: 'n2.w2' }] },
    { id: 'lull2', when: { t: 350 }, do: [{ scare: 'steps' }, { wait: 2 }, { line: 'n2.w4' }, { wait: 2 }, { spawn: 'echo', count: 1, at: 'behind' }] },
    { id: 'lull3', when: { t: 390 }, do: [{ line: 'n2.w5' }] },
    { id: 'broke2', when: { flag: 'broke:2' }, do: [{ line: 'n2.broke2' }] },
    { id: 'broke3', when: { flag: 'broke:3' }, do: [{ line: 'n1.broke3' }] },
    { id: 'deadair', when: { flag: 'deadAir' }, do: [{ line: 'n2.deadair' }] },

    // лопнула лампа: чтобы соблюсти пункт 1, придётся нарушить пункт 2
    {
      id: 'lamp',
      when: { flag: 'wave:1:end' },
      do: [
        { wait: 2 }, { flag: 'reelLocked' }, { scare: 'duck' }, { line: 'n2.lamp1' }, { line: 'n2.lamp2' },
        { objective: 'obj.lamp', marker: { house: 0 } }, { enable: 'lamp' }, { enable: 'open0' }, { appear: 'corner', house: 0 },
      ],
    },
    { id: 'corner', when: { flag: 'inside:0', notFlag: 'gotLamp' }, do: [{ line: 'n2.corner' }] },

    // зарубки на косяке радиоузла
    { id: 'marksHint', when: { t: 150 }, do: [{ enable: 'marks' }, { line: 'n2.marksHint' }] },
    { id: 'marks', when: { flag: 'marks' }, do: [{ wait: 0.5 }, { line: 'n2.marks2' }] },

    // процессия: одиннадцать выходят из воды и идут к радиоузлу — домой. Держите их в луче.
    {
      id: 'procession',
      when: { t: 165 },
      do: [
        { scare: 'duck' }, { wait: 1 }, { line: 'n2.proc1' }, { appear: 'procession' }, { objective: 'obj.procession', marker: null },
        { wait: 4 }, { line: 'n2.proc2' }, { wait: 50 }, { objective: 'obj.air', marker: null },
      ],
    },
    { id: 'procReached', when: { flag: 'procReached' }, do: [{ line: 'n2.procReached' }] },
    // перекличка: громкоговоритель читает дворы — и ждёт двенадцатого. Можно ответить.
    {
      id: 'rollcall',
      when: { flag: 'wave:2:end' },
      do: [
        { scare: 'names' }, { line: 'n2.names1', style: 1 }, { enable: 'answer' }, { wait: 4 },
        { line: 'n2.names2', style: 1 }, { wait: 4 }, { line: 'n2.names3', style: 1 }, { wait: 12 }, { disable: 'answer' },
      ],
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
    { house: 0, notes: [{ id: 'receiver2', key: 'note.receiver2', x: -2.45, z: 1.0 }], knock: [{ line: 'n2.kn0', style: 1 }, { enable: 'open0' }] },
    {
      house: 1,
      notes: [{ id: 'mirror2', key: 'note.mirror2', x: 0, z: -1.7, after: [{ scare: 'duck' }, { wait: 0.8 }, { spawn: 'unseeing', count: 3, at: 'doorOut', house: 1 }, { line: 'n2.mirrorAfter' }] }],
      knock: [{ line: 'n2.kn1', style: 1 }, { enable: 'open1' }],
    },
    { house: 2, notes: [{ id: 'cradle', key: 'note.cradle', x: 0.6, z: -1.3 }], knock: [{ scare: 'knockBack', house: 2 }, { wait: 1.6 }, { line: 'n2.kn2', style: 1 }, { enable: 'open2' }] },
    { house: 3, notes: [{ id: 'sluice', key: 'note.sluice', x: -1.2, z: -1.2 }], knock: [{ line: 'n2.kn3', style: 1 }, { wait: 3 }, { line: 'n2.kn3b', style: 1 }, { enable: 'open3' }] },
    { house: 4, notes: [{ id: 'floor2', key: 'note.floor2', x: 1.2, z: 0.2 }], knock: [{ scare: 'scratch', house: 4 }, { wait: 1.5 }, { line: 'n2.kn4', style: 1 }, { enable: 'open4' }] },
    {
      house: 5,
      notes: [{ id: 'photo2', key: 'note.photo2', x: 1.95, z: -0.6, after: [{ scare: 'duck' }, { wait: 0.7 }, { scare: 'jumpscare' }] }],
      knock: [{ line: 'n2.kn5', style: 1 }, { enable: 'open5' }],
    },
  ],
  extras: [
    open(0, [{ line: 'n2.open' }]),
    open(1, [{ line: 'n2.open' }]),
    open(2, [{ line: 'n2.open2' }]),
    open(3, [{ line: 'n2.open' }]),
    open(4, [{ spawn: 'unseeing', count: 2, at: 'inside', house: 4 }, { line: 'n2.open4' }]),
    open(5, [{ line: 'n2.open' }]),
    // увиденное только в отражении
    {
      id: 'reflHut', prompt: 'prompt.reflRead', rule: false, at: { x: PUDDLE_HUT.x, z: PUDDLE_HUT.z }, r: 1.6, hold: 1, enabled: true, once: true, reflect: true,
      effects: [{ note: 'note.reflHut' }, { flag: 'reflHut' }],
    },
    {
      id: 'reflStreet', prompt: 'prompt.reflRead', rule: false, at: { x: 15, z: 23.5 }, r: 2, hold: 1, enabled: true, once: true, reflect: true,
      effects: [{ note: 'note.reflStreet' }, { flag: 'reflStreet' }],
    },
    {
      id: 'reflKey', prompt: 'prompt.reflRead', rule: false, at: { x: PUDDLE_KEY.x, z: PUDDLE_KEY.z }, r: 1.5, hold: 1, enabled: true, once: true, reflect: true,
      effects: [{ note: 'note.reflKey' }, { flag: 'reflKey' }],
    },
    {
      id: 'reflCellar', prompt: 'prompt.reflRead', rule: false, at: { house: 4, x: 1.2, z: -0.6 }, r: 1.3, hold: 1, enabled: true, once: true, reflect: true,
      effects: [{ note: 'note.reflCellar' }, { flag: 'reflCellar' }],
    },
    // перекличка: ответить за двенадцатый двор — нарушить пункт 5
    {
      id: 'answer', prompt: 'prompt.answer', rule: true, at: { x: WORLD.pole.x + 1.3, z: WORLD.pole.z + 0.9 }, r: 2.2, hold: 1.6, enabled: false, once: true,
      effects: [
        { flag: 'broke:5' }, { disable: 'answer' }, { line: 'n2.answer1' }, { scare: 'speaker' }, { wait: 2.6 },
        { line: 'n2.answer2', style: 1 }, { fragment: true }, { wait: 3 }, { line: 'n2.answer3' }, { spawn: 'unseeing', count: 3, at: 'behind' },
      ],
    },
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
    { from: [10, 8, 34], to: [14, 5, 30], lookFrom: [26, -0.8, 19], lookTo: [27, -0.8, 19], dur: 7, fov: 36, line: 'cut2.dawn.1' },
    // вода ушла: посреди пруда из неё торчит конёк крыши двенадцатого двора
    { from: [19, 2.6, 25], to: [21, 2, 24], lookFrom: [27, -1.5, 19], lookTo: [27, -1.3, 19], dur: 7, fov: 40, line: 'cut2.dawn.2' },
    { from: [22.5, 1.2, 22], to: [24, 0.7, 21], lookFrom: [27, -1.35, 19], lookTo: [27, -1.25, 19.1], dur: 6, fov: 44, line: 'cut2.dawn.3' },
  ],
};
