import type { NightDef } from './night';
import { WORLD } from '../proc/terrain';
import { HOUSE_SITES } from '../proc/sites';

/*
 * Ночь третья «Половодье» — две части.
 *
 * «Весна» (флешбэк): ты — младший Ивашов в ночь наводнения. Без оружия, с керосиновой лампой.
 * Деревня живая: свет в окнах, вальс. Вода поднимается. Ты стучишь в те же двери, в которые
 * сам не стучал две ночи, — и на каждый стук за дверью делают радио громче. Так игрок узнаёт,
 * зачем появилось радио. Спасаешься в лодке у пристани.
 *
 * «Щель» (настоящее): радио мертво, пруд высох, посреди — развалины двенадцатого двора.
 * Новые глаголы: голос (крик-сонар) и садящийся фонарь. Буквы имени. В верховье Щели —
 * заслонка и Хор, которого кормит стрельба и убивает тишина. Три концовки.
 */

/** Двенадцатый двор: у воды, на склоне чаши пруда. */
export const YARD12 = { x: 35, z: 25, w: 5.6, d: 4.6, rot: 0.4 };
/** Точка перед дверью двенадцатого двора (out — сколько метров от стены). */
const yardFront = (out: number): [number, number] => [YARD12.x + Math.sin(YARD12.rot) * (YARD12.d / 2 + out), YARD12.z + Math.cos(YARD12.rot) * (YARD12.d / 2 + out)];
export const MOTHER_AT = yardFront(0.35);
/** За домом Звонарёвых: гвоздь с ключом видно в заднее окно. */
const Z = HOUSE_SITES[3]!;
const KEY_WINDOW: [number, number] = [Z.x - Math.sin(Z.rot) * (Z.d / 2 + 0.9), Z.z - Math.cos(Z.rot) * (Z.d / 2 + 0.9)];
/** Заслонка — в верховье Щели. */
const C = WORLD.crevice;
const along = (t: number): [number, number] => [C.ax + (C.bx - C.ax) * t, C.az + (C.bz - C.az) * t];
export const SLUICE = { x: along(0.97)[0], z: along(0.97)[1] };
const RAVINE_IN = along(0.06);
const RAVINE_MID = along(0.45);
const CHOIR_AT = along(0.72);
const NAME_LETTER = along(0.88);
/** Ключ на дне Щели: здесь его уронил мальчик двадцать лет назад. */
const KEY_BOTTOM = along(0.9);

export const NIGHT3A: NightDef = {
  id: 'night3a',
  index: 3,
  titleKey: 'night.3',
  duration: 9999,
  startHour: 1,
  endHour: 5,
  reelSeconds: 1e9,
  fog: 0.026,
  // память: тёплый выцветший свет, весенний дождь
  look: { shadow: [0.75, 0.72, 0.8], highlight: [1.12, 0.98, 0.78], desat: 0.28, mist: 1.3, rain: true },
  lights: [true, true, true, true, true, true],
  startWeapons: [],
  dynamite: 0,
  child: true,
  // ребёнок маленький, лампа светит недалеко — камера ближе
  cam: 0.66,
  // начинаем у порога своего дома; сам дом — глухой сруб, сквозь него не пройти
  start: yardFront(1.4),
  block: YARD12,
  sluice: true,
  water: { from: -1.9, to: -0.25, t0: 20, t1: 330 },
  knockRule: 0,
  knockPrompt: 'prompt.knock3',
  rules: [],
  next: 'night3b',
  dawnTruth: 'cut3a.d2',
  dawnTitle: 'dawn.title',
  dawnSub: 'dawn.sub',
  waves: [],
  beats: [
    {
      id: 'start', when: { t: 0.6 },
      do: [{ line: 'n3a.start1', style: 2 }, { line: 'n3a.start2' }, { objective: 'obj.zvonar', marker: { house: 3 } }, { wait: 6 }, { line: 'n3a.lampHint' }],
    },
    // мать зовёт по имени — и вальс съедает его, чем громче радио, тем меньше слышно
    { id: 'mom1', when: { t: 14 }, do: [{ line: 'n3a.mom1', style: 2 }] },
    { id: 'mom2', when: { t: 60 }, do: [{ line: 'n3a.mom2', style: 2 }] },
    { id: 'mom3', when: { t: 120 }, do: [{ line: 'n3a.mom3', style: 2 }] },
    { id: 'drown', when: { flag: 'drowning' }, do: [{ line: 'n3a.drown' }] },
    { id: 'gazed', when: { flag: 'gazed' }, do: [{ line: 'n3a.gazeHint' }] },
    // Звонарёвы отказали — ключ можно взять самому: он на гвозде, видно в заднее окно
    { id: 'door3', when: { flag: 'k3' }, do: [{ wait: 4 }, { line: 'n3a.after3' }, { objective: 'obj.keyWindow', marker: { at: KEY_WINDOW } }, { enable: 'key' }] },
    { id: 'gotKey', when: { flag: 'gotKey' }, do: [{ line: 'n3a.gotKey' }, { objective: 'obj.sluice3a', marker: { at: [SLUICE.x, SLUICE.z] } }, { enable: 'trySluice' }] },
    { id: 'late', when: { t: 270 }, do: [{ line: 'n3a.late' }, { flag: 'toBoat' }] },
    { id: 'boat', when: { flag: 'toBoat' }, do: [{ line: 'n3a.boat' }, { objective: 'obj.boat', marker: { pier: true } }, { enable: 'boat' }] },
  ],
  houses: [
    { house: 5, notes: [], knock: [{ line: 'n3a.k5', style: 1 }, { radio: 1.3 }, { flag: 'k5' }] },
    { house: 2, notes: [], knock: [{ line: 'n3a.k2a', style: 1 }, { wait: 2.5 }, { line: 'n3a.k2b', style: 1 }, { radio: 1.6 }, { flag: 'k2' }] },
    { house: 1, notes: [], knock: [{ appear: 'window', house: 1 }, { line: 'n3a.k1', style: 1 }, { radio: 1.9 }, { flag: 'k1' }] },
    { house: 0, notes: [], knock: [{ line: 'n3a.k0', style: 1 }, { light: 0, on: false }, { radio: 2.2 }, { flag: 'k0' }] },
    { house: 4, notes: [], knock: [{ line: 'n3a.k4', style: 1 }, { radio: 2.5 }, { flag: 'k4' }] },
    { house: 3, notes: [], knock: [{ line: 'n3a.k3a', style: 1 }, { wait: 2.6 }, { line: 'n3a.k3b', style: 1 }, { radio: 3 }, { light: 3, on: false }, { flag: 'k3' }] },
  ],
  extras: [
    {
      // ключ на гвозде за окном — только с прикрытой лампой: в доме не спят
      id: 'key', prompt: 'prompt.takeKey', rule: false, at: { x: KEY_WINDOW[0], z: KEY_WINDOW[1] }, r: 1.4, hold: 1.6, enabled: false, once: true, dark: true, glint: true,
      effects: [{ flag: 'gotKey' }, { objective: '', marker: null }],
    },
    {
      // заслонка: ребёнку не хватает сил, ключ выскальзывает в воду — и остаётся там на двадцать лет
      id: 'trySluice', prompt: 'prompt.trySluice', rule: false, at: { x: SLUICE.x + 0.8, z: SLUICE.z + 1 }, r: 1.3, hold: 3, enabled: false, once: true,
      effects: [
        { objective: '', marker: null }, { line: 'n3a.sluice1' }, { scare: 'duck' }, { wait: 2.6 },
        { line: 'n3a.sluice2' }, { scare: 'wet' }, { flag: 'keyDropped' }, { wait: 2 }, { flag: 'toBoat' },
      ],
    },
    {
      id: 'boat', prompt: 'prompt.boat', rule: false, at: 'pierEnd', r: 2, hold: 1.2, enabled: false, once: true,
      effects: [{ objective: '', marker: null }, { line: 'n3a.inBoat' }, { wait: 4 }, { dawn: true }],
    },
  ],
  fragments: ['frag2.1', 'frag2.2', 'frag2.3', 'frag2.4', 'frag2.5', 'frag2.6', 'frag2.7', 'frag2.8', 'frag2.9', 'frag2.10'],
  intro: [
    { from: [44, 9, 40], to: [40, 6, 34], lookFrom: [35, -0.5, 25], lookTo: [34, -0.8, 26], dur: 6, fov: 38, line: 'cut3a.i1' },
    { from: [28, 4, 34], to: [31, 3, 33], lookFrom: [35, 0.5, 25], lookTo: [35, 0.2, 25.5], dur: 6, fov: 40, line: 'cut3a.i2' },
    { from: [8, 6, 10], to: [4, 5, 6], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 6, fov: 42, line: 'cut3a.i3' },
  ],
  dawn: [
    { from: [16, 10, 36], to: [22, 8, 32], lookFrom: [27, -0.5, 19], lookTo: [28, -0.5, 19], dur: 7, fov: 38, line: 'cut3a.d1' },
    // утро: на месте двенадцатого двора из воды торчит только конёк крыши
    { from: [22, 4.5, 36], to: [26, 3.5, 33], lookFrom: [35, -0.3, 25], lookTo: [35, -0.1, 25.5], dur: 7, fov: 40, line: 'cut3a.d2' },
  ],
};

export const NIGHT3B: NightDef = {
  id: 'night3b',
  index: 3,
  titleKey: 'night.3',
  hidden: true,
  duration: 1200,
  startHour: 22,
  endHour: 6,
  reelSeconds: 1e9,
  fog: 0.048,
  look: { shadow: [0.5, 0.62, 0.82], highlight: [0.92, 0.95, 1.0], desat: 0.3, mist: 1.4, rain: false },
  lights: [false, false, false, false, false, false],
  startWeapons: ['revolver', 'flaregun', 'shotgun', 'rifle'],
  dynamite: 2,
  noRadio: true,
  cam: 0.74,
  voice: true,
  battery: true,
  ruin: true,
  sluice: true,
  water: { from: -2.8, to: -2.8, t0: 0, t1: 1 },
  knockRule: 0,
  knockPrompt: 'prompt.knock3',
  rules: ['rule3.1', 'rule3.2', 'rule3.3', 'rule3.4', 'rule3.5'],
  // на дне высохшего Глядня — лужа: в ней по-прежнему та ночь
  reflect: {
    puddles: [{ x: WORLD.pond.x, z: WORLD.pond.z, r: 1.4 }],
    overstay: [{ line: 'n3b.overstay' }, { scare: 'wet' }, { wait: 0.8 }, { spawn: 'unseeing', count: 2, at: 'behind' }],
  },
  dawnTruth: 'end.loop.2',
  dawnTitle: 'end.loop.t',
  dawnSub: 'end.loop.s',
  waves: [
    { at: 25, pulse: 2.4, spawns: [{ kind: 'whisperer', count: 8, from: 'forest' }, { kind: 'unseeing', count: 3, from: 'pond' }] },
    { at: 120, pulse: 2, spawns: [{ kind: 'unseeing', count: 5, from: 'forest' }, { kind: 'whisperer', count: 8, from: 'crevice' }] },
    { at: 230, pulse: 1.8, spawns: [{ kind: 'mute', count: 1, from: 'pond' }, { kind: 'whisperer', count: 10, from: 'forest' }, { kind: 'echo', count: 1, from: 'behind' }] },
  ],
  beats: [
    { id: 'nakaz', when: { t: 0.4 }, do: [{ note: 'note.nakaz3' }, { objective: 'obj.letters', marker: null }] },
    { id: 'start', when: { t: 2 }, do: [{ line: 'n3b.start' }, { wait: 3 }, { line: 'n3b.voiceHint' }, { wait: 4 }, { line: 'n3b.lettersHint' }] },
    { id: 'battery', when: { t: 70 }, do: [{ line: 'n3b.battery' }] },
    // «Н»: Отголосок в Щели — пройдёте назад по своему следу, и он, рассыпаясь, покажет камень
    { id: 'echoLetter', when: { flag: 'broke:3' }, do: [{ line: 'n3b.echoLetter' }, { enable: 'letter3' }] },
    // вход в Щель: тесно, темно; там живёт тишина
    {
      id: 'ravine',
      when: { near: [RAVINE_IN[0], RAVINE_IN[1], 5] },
      do: [
        { line: 'n3b.ravine' }, { spawn: 'mute', count: 1, at: 'crevice' }, { objective: 'obj.sluice', marker: { at: [SLUICE.x, SLUICE.z] } },
        { wait: 6 }, { spawn: 'echo', count: 1, at: 'behind' },
      ],
    },
    // по краю Щели над вами кто-то идёт
    { id: 'above1', when: { near: [RAVINE_MID[0], RAVINE_MID[1], 4] }, do: [{ scare: 'steps' }, { wait: 2 }, { line: 'n3b.above' }] },
    { id: 'above2', when: { near: [NAME_LETTER[0], NAME_LETTER[1], 5], notFlag: 'choirUp' }, do: [{ scare: 'steps' }] },
    // первое касание заслонки: из-под щита — лицо
    { id: 'sluiceFace', when: { near: [SLUICE.x, SLUICE.z, 3.4] }, do: [{ wait: 0.3 }, { scare: 'jumpscare' }, { wait: 1.6 }, { line: 'n3b.sluiceFace' }] },
    { id: 'choirP2', when: { flag: 'choir:2' }, do: [{ line: 'n3b.choirP2' }] },
    { id: 'choirP3', when: { flag: 'choir:3' }, do: [{ line: 'n3b.choirP3' }] },
    { id: 'keyFound', when: { flag: 'hasKey' }, do: [{ line: 'n3b.keyFound' }] },
    {
      id: 'choir',
      when: { near: [CHOIR_AT[0], CHOIR_AT[1], 9] },
      do: [{ scare: 'duck' }, { wait: 1 }, { appear: 'choir' }, { line: 'n3b.choir1' }, { wait: 4 }, { line: 'n3b.choir2' }],
    },
    { id: 'choirDown', when: { flag: 'choirDown' }, do: [{ line: 'n3b.choirDown' }, { objective: 'obj.findKey', marker: { at: [KEY_BOTTOM[0], KEY_BOTTOM[1]] } }] },
    // ключ на дне + Хор замолчал → можно решать
    {
      id: 'decide', when: { flags: ['choirDown', 'hasKey'] },
      do: [{ enable: 'open' }, { enable: 'throw' }, { objective: 'obj.decide', marker: { at: [SLUICE.x, SLUICE.z] } }],
    },
    { id: 'nameReady', when: { flags: ['letters:4', 'choirDown'] }, do: [{ enable: 'name' }, { line: 'n3b.nameReady' }] },
    { id: 'sanity', when: { sanityBelow: 30 }, do: [{ line: 'n2.sanity' }] },
  ],
  houses: [],
  extras: [
    // Буквы имени — там, где Наказ запрещает искать. Послушание не даёт ничего.
    // «В» — пункт 4: позвать с пристани. Из ила поднимается мальчик и показывает на развалины.
    {
      id: 'callPier', prompt: 'prompt.call', rule: true, at: 'pierEnd', r: 2.2, hold: 1.4, enabled: true, once: true,
      effects: [
        { flag: 'broke:4' }, { line: 'n3b.call1' }, { scare: 'duck' }, { wait: 1.6 }, { appear: 'boy' }, { line: 'n3b.call2' },
        { enable: 'letter1' }, { objective: 'obj.ruin', marker: { at: [YARD12.x, YARD12.z] } },
      ],
    },
    { id: 'letter1', prompt: 'prompt.read', rule: false, at: { x: YARD12.x, z: YARD12.z }, r: 2.2, hold: 0, enabled: false, once: true, glint: true, effects: [{ note: 'note.ruin' }, { letter: 'В' }, { objective: 'obj.letters', marker: null }] },
    // «А» — пункт 2: постучать в радиоузел — в дом Ивашовых. Изнутри отвечает плёнка — голос матери.
    {
      id: 'knockHut', prompt: 'prompt.knock3b', rule: true, at: 'hutDoorSide', r: 1.4, hold: 0, enabled: true, once: true,
      effects: [{ flag: 'broke:2' }, { line: 'n3b.knock1' }, { wait: 2.4 }, { scare: 'speaker' }, { line: 'n3b.knock2', style: 2 }, { enable: 'letter2' }],
    },
    { id: 'letter2', prompt: 'prompt.read', rule: false, at: 'hutSide', r: 1.3, hold: 0, enabled: false, once: true, glint: true, effects: [{ note: 'note.reel' }, { letter: 'А' }] },
    // «Н» — пункт 3: появится, когда вы пройдёте по своим следам (см. бит echoLetter)
    { id: 'letter3', prompt: 'prompt.read', rule: false, at: { x: RAVINE_MID[0], z: RAVINE_MID[1] }, r: 1.6, hold: 0, enabled: false, once: true, glint: true, effects: [{ note: 'note.letterCave' }, { letter: 'Н' }] },
    // «Я» — на заслонке, в темноте: проступает только от крика
    { id: 'letter4', prompt: 'prompt.read', rule: false, at: { x: NAME_LETTER[0] + 1.2, z: NAME_LETTER[1] }, r: 1.6, hold: 0, enabled: true, once: true, voice: true, effects: [{ note: 'note.letterSluice' }, { letter: 'Я' }] },
    // ключ на дне Щели — двадцать лет назад его уронил мальчик. Видно только криком.
    { id: 'key3b', prompt: 'prompt.takeKey3b', rule: false, at: { x: KEY_BOTTOM[0] - 0.9, z: KEY_BOTTOM[1] }, r: 1.6, hold: 0.8, enabled: true, once: true, voice: true, effects: [{ flag: 'hasKey' }, { note: 'note.keyFound' }] },
    // в луже на дне Глядня — лодка и мальчик в ней
    { id: 'reflBoat', prompt: 'prompt.reflRead', rule: false, at: { x: WORLD.pond.x, z: WORLD.pond.z }, r: 2, hold: 1, enabled: true, once: true, reflect: true, effects: [{ note: 'note.reflBoat' }] },
    {
      id: 'open', prompt: 'prompt.sluice', rule: false, at: { x: SLUICE.x + 0.8, z: SLUICE.z + 1 }, r: 1.1, hold: 4.5, enabled: false, once: true, finale: true,
      effects: [{ flag: 'end:flood' }, { line: 'end.flood.0' }, { wait: 4 }, { dawn: true }],
    },
    {
      id: 'throw', prompt: 'prompt.throwKey', rule: false, at: { x: SLUICE.x - 1.6, z: SLUICE.z + 2 }, r: 1.1, hold: 4.5, enabled: false, once: true, finale: true,
      effects: [{ flag: 'end:loop' }, { line: 'end.loop.0' }, { wait: 4 }, { dawn: true }],
    },
    {
      id: 'name', prompt: 'prompt.name', rule: true, at: { x: SLUICE.x - 0.2, z: SLUICE.z + 3.2 }, r: 1.2, hold: 4.5, enabled: false, once: true, finale: true,
      effects: [{ flag: 'broke:5' }, { flag: 'end:name' }, { line: 'end.name.0' }, { wait: 4.5 }, { dawn: true }],
    },
  ],
  fragments: ['frag3.1', 'frag3.2', 'frag3.3', 'frag3.4', 'frag3.5', 'frag3.6', 'frag3.7', 'frag3.8', 'frag3.9', 'frag3.10'],
  intro: [
    { from: [42, 12, 40], to: [38, 8, 33], lookFrom: [27, -2.5, 19], lookTo: [33, -2.4, 24], dur: 6, fov: 38, line: 'cut3b.i1' },
    { from: [9, 3, 1], to: [8, 2.6, -0.5], lookFrom: [6.5, 1.4, -3], lookTo: [6.5, 1.2, -3.2], dur: 6, fov: 40, line: 'cut3b.i2' },
    { from: [-8, 16, -24], to: [-6, 14, -32], lookFrom: [-4, 0, -40], lookTo: [-2, 2, -55], dur: 7, fov: 40, line: 'cut3b.i3' },
  ],
  dawn: [
    { from: [-6, 6, -40], to: [-4, 9, -46], lookFrom: [-2, 1, -55], lookTo: [0, 0, -20], dur: 6, fov: 40, line: 'end.loop.1' },
    { from: [6, 10, 12], to: [3, 8, 8], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 7, fov: 42, line: 'end.loop.2' },
  ],
  endings: [
    {
      flag: 'end:flood', title: 'end.flood.t', sub: 'end.flood.s',
      dawn: [
        { from: [-4, 6, -48], to: [-4, 12, -38], lookFrom: [-2, 0, -56], lookTo: [0, -1, -10], dur: 7, fov: 40, line: 'end.flood.1' },
        { from: [12, 14, 20], to: [6, 10, 14], lookFrom: [0, 0, 0], lookTo: [-6, 0, -4], dur: 7, fov: 44, line: 'end.flood.2' },
      ],
    },
    {
      flag: 'end:loop', title: 'end.loop.t', sub: 'end.loop.s',
      dawn: [
        { from: [-6, 6, -40], to: [-4, 9, -46], lookFrom: [-2, 1, -55], lookTo: [0, 0, -20], dur: 6, fov: 40, line: 'end.loop.1' },
        { from: [6, 10, 12], to: [3, 8, 8], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 7, fov: 42, line: 'end.loop.2' },
      ],
    },
    {
      flag: 'end:name', title: 'end.name.t', sub: 'end.name.s',
      dawn: [
        { from: [-4, 5, -46], to: [-3, 7, -50], lookFrom: [-2, 1.5, -55], lookTo: [-2, 1.5, -56], dur: 6, fov: 40, line: 'end.name.1' },
        { from: [44, 10, 38], to: [38, 7, 32], lookFrom: [27, -2.4, 19], lookTo: [34, -2.4, 24], dur: 7, fov: 38, line: 'end.name.2' },
        { from: [31, 1.2, 23], to: [29.5, 0.2, 21.2], lookFrom: [27, -2.3, 19], lookTo: [27, -2.4, 19], dur: 7, fov: 44, line: 'end.name.3' },
      ],
    },
  ],
};
