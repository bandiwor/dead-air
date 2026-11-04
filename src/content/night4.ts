import type { NightDef } from './night';
import type { StrKey } from '../i18n';
import type { Beat, ExtraDef } from './script';
import { NIGHT1 } from './night1';
import { WORLD } from '../proc/terrain';
import { HUT_SITE } from '../proc/sites';

/*
 * Ночь четвёртая «Отклик» — после выбора у заслонки. Одна карта, три разных ночи:
 *
 *  • «Ключ в воде» → night4l «Опять». Та же первая ночь, но вы её помните: каждое событие
 *    знаешь заранее, и от этого страшнее. Выход из петли — самому выключить радио под утро.
 *  • «Половодье» → night4f «Стук». Устье в воде. Теперь стучат к вам — в радиоузел, в ваш дом.
 *    Наказ написан вашей рукой: «не открывать». Откроете хоть раз — между вами и ими разница.
 *  • «Имя» → night4n «Отклик». Тихая ночь без чудовищ: одиннадцать дворов вышли к своим дверям.
 *    Подходите к каждому и слушайте, что они видели. Последней на пристани ждёт мать.
 */

// ------------------------------------------------------------------ «Опять»

const deja: Beat[] = [
  { id: 'deja1', when: { t: 3 }, do: [{ line: 'n4l.deja1' }] },
  { id: 'deja2', when: { t: 45 }, do: [{ line: 'n4l.deja2' }] },
  // дом у колодца: вы знаете, что внутри
  { id: 'dejaHouse', when: { flag: 'wave:1:end' }, do: [{ wait: 1 }, { line: 'n4l.dejaHouse' }] },
  { id: 'dejaPier', when: { t: 320 }, do: [{ line: 'n4l.dejaPier' }] },
  // выход из петли: самому выключить радио, когда до утра недалеко
  { id: 'lateSwitch', when: { t: 360 }, do: [{ line: 'n4l.lateSwitch' }] },
  { id: 'loopBroken', when: { flags: ['broke:1', 'lateNight'] }, do: [{ flag: 'loopBroken' }, { line: 'n4l.broken' }] },
  { id: 'lateNight', when: { t: 360 }, do: [{ flag: 'lateNight' }] },
];

export const NIGHT4L: NightDef = {
  ...NIGHT1,
  id: 'night4l',
  index: 4,
  titleKey: 'night.4',
  // ночь в меню — одна; играется тот вариант, к которому привела концовка третьей ночи
  branch: { loop: 'night4l', flood: 'night4f', name: 'night4n', '*': 'night4l' },
  // всё то же, но выцветшее: так выглядит то, что видишь второй раз
  look: { shadow: [0.62, 0.66, 0.74], highlight: [1.02, 0.98, 0.9], desat: 0.55, mist: 1.15, rain: false },
  beats: [
    ...NIGHT1.beats.map((b) => (b.id === 'nakaz' ? { ...b, do: [{ note: 'note.nakaz4' as const }, { objective: 'obj.air' as const, marker: null }] } : b)),
    ...deja,
  ],
  intro: [
    { from: [8, 6, 10], to: [4, 5, 6], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 8, fov: 42, line: 'cut4l.i1' },
    { from: [1, 4, 10], to: [3.5, 14, 13], lookFrom: [5, 1.2, 0], lookTo: [3.8, 0.5, 2.6], dur: 7, fov: 42, line: 'cut4l.i2' },
  ],
  dawnTruth: 'end4l.d2',
  dawnTitle: 'end4l.t',
  dawnSub: 'end4l.s',
  dawn: [
    { from: [6, 10, 12], to: [3, 8, 8], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 7, fov: 42, line: 'end4l.d1' },
    { from: [10, 9, 14], to: [6, 6, 10], lookFrom: [6.5, 1.2, -4.5], lookTo: [6.5, 1, -3], dur: 7, fov: 40, line: 'end4l.d2' },
  ],
  endings: [
    {
      flag: 'loopBroken', title: 'end4lb.t', sub: 'end4lb.s',
      dawn: [
        { from: [6, 10, 12], to: [3, 8, 8], lookFrom: [0, 6, 0], lookTo: [0, 6.6, 0], dur: 7, fov: 42, line: 'end4lb.d1' },
        { from: [-6, 14, 30], to: [-2, 18, 40], lookFrom: [0, 2, 0], lookTo: [0, 8, -30], dur: 8, fov: 44, line: 'end4lb.d2' },
      ],
    },
  ],
};

// ------------------------------------------------------------------ «Стук»

/** Стук в радиоузел: голос за дверью, несколько секунд, чтобы решить, — и всё. */
function knock(i: number, at: number): Beat {
  return {
    id: `kn${i}`, when: { t: at },
    do: [{ scare: 'knockHut' }, { line: `n4f.kn${i}` as StrKey, style: 1 }, { enable: `let${i}` }, { wait: 14 }, { disable: `let${i}` }],
  };
}
function letIn(i: number): ExtraDef {
  return {
    // сбоку от крыльца, у окна: у самой двери — смена бобины, не перепутать
    id: `let${i}`, prompt: 'prompt.letIn', rule: true, at: { x: HUT_SITE.x + 2.8, z: HUT_SITE.z + HUT_SITE.d / 2 + 1.1 }, r: 1.3, hold: 1.4, enabled: false, once: true,
    effects: [{ flag: 'broke:1' }, { flag: 'mercy' }, { disable: `let${i}` }, { line: `n4f.let${i}` as StrKey }],
  };
}

export const NIGHT4F: NightDef = {
  id: 'night4f',
  index: 4,
  titleKey: 'night.4',
  hidden: true,
  duration: 420,
  startHour: 22,
  endHour: 6,
  reelSeconds: 130,
  reels: 1,
  wards: [{ rule: 2, kind: 'pole' }],
  fog: 0.05,
  look: { shadow: [0.5, 0.74, 0.86], highlight: [0.9, 0.98, 1.0], desat: 0.3, mist: 1.8, rain: true },
  lights: [false, false, false, false, false, false],
  startWeapons: ['revolver', 'flaregun', 'shotgun', 'rifle'],
  // Устье в воде: Глядень у самых срубов, по всей деревне — разлившаяся вода (лужи).
  // В них можно заглянуть, как во второй ночи.
  water: { from: -0.32, to: -0.28, t0: 0, t1: 420 },
  reflect: {
    puddles: [
      { x: 3, z: 6, r: 1.6 }, { x: -6, z: 4, r: 1.4 }, { x: 8, z: 8, r: 1.8 }, { x: 15, z: 8, r: 1.5 }, { x: -5, z: -9, r: 1.3 },
      { x: 9, z: -8, r: 1.4 }, { x: -8, z: 14, r: 1.2 }, { x: 4, z: 17, r: 1.5 }, { x: 18, z: 0, r: 1.6 }, { x: -9.5, z: 2.5, r: 1.2 },
      { x: 2, z: -3, r: 1.1 }, { x: 11, z: 2, r: 1.2 },
    ],
    overstay: [{ line: 'n4f.overstay' }, { scare: 'wet' }, { wait: 0.8 }, { spawn: 'unseeing', count: 2, at: 'behind' }],
  },
  knockRule: 0,
  knockPrompt: 'prompt.knock2',
  rules: ['rule4f.1', 'rule4f.2', 'rule4f.3'],
  dawnTruth: 'end4f.d2',
  dawnTitle: 'end4f.t',
  dawnSub: 'end4f.s',
  waves: [
    { at: 25, pulse: 2.2, spawns: [{ kind: 'unseeing', count: 5, from: 'pond' }, { kind: 'whisperer', count: 4, from: 'forest' }] },
    { at: 140, pulse: 1.8, spawns: [{ kind: 'unseeing', count: 7, from: 'pond' }, { kind: 'mute', count: 1, from: 'pond' }] },
    { at: 260, pulse: 1.5, spawns: [{ kind: 'unseeing', count: 9, from: 'pond' }, { kind: 'whisperer', count: 6, from: 'forest' }, { kind: 'echo', count: 1, from: 'behind' }] },
  ],
  beats: [
    { id: 'nakaz', when: { t: 0.4 }, do: [{ note: 'note.nakaz4f' }, { objective: 'obj.air', marker: null }] },
    { id: 'start', when: { t: 2 }, do: [{ line: 'n4f.start' }, { wait: 4 }, { line: 'n4f.start2' }] },
    knock(1, 40), knock(2, 110), knock(3, 180), knock(4, 250), knock(5, 330),
    { id: 'mercyLine', when: { flag: 'mercy' }, do: [{ wait: 4 }, { line: 'n4f.mercy' }] },
  ],
  houses: [],
  extras: [letIn(1), letIn(2), letIn(3), letIn(4), letIn(5)],
  fragments: ['frag2.1', 'frag2.2', 'frag2.3', 'frag2.4', 'frag2.5', 'frag2.6', 'frag2.7', 'frag2.8', 'frag2.9', 'frag2.10'],
  intro: [
    { from: [20, 12, 30], to: [14, 9, 24], lookFrom: [0, 0, 0], lookTo: [-4, 0, -2], dur: 7, fov: 44, line: 'cut4f.i1' },
    { from: [10, 4, 2], to: [8.5, 3, 0], lookFrom: [6.5, 1.2, -4.5], lookTo: [6.5, 1, -3.2], dur: 7, fov: 40, line: 'cut4f.i2' },
  ],
  dawn: [
    { from: [12, 14, 20], to: [6, 10, 14], lookFrom: [0, 0, 0], lookTo: [-6, 0, -4], dur: 7, fov: 44, line: 'end4f.d1' },
    { from: [10, 4, 2], to: [8.5, 3, 0], lookFrom: [6.5, 0.6, -3], lookTo: [6.5, 0.4, -2.8], dur: 7, fov: 42, line: 'end4f.d2' },
  ],
  endings: [
    {
      flag: 'mercy', title: 'end4fm.t', sub: 'end4fm.s',
      dawn: [
        { from: [12, 14, 20], to: [6, 10, 14], lookFrom: [0, 0, 0], lookTo: [-6, 0, -4], dur: 7, fov: 44, line: 'end4fm.d1' },
        { from: [10, 4, 2], to: [8.5, 3, 0], lookFrom: [6.5, 0.6, -3], lookTo: [6.5, 0.4, -2.8], dur: 7, fov: 42, line: 'end4fm.d2' },
      ],
    },
  ],
};

// ------------------------------------------------------------------ «Отклик»

/** Одиннадцать дворов: шесть — у своих дверей, пятеро — у столба. Подойти и выслушать. */
const POLE = WORLD.pole;
const ring = (i: number): { x: number; z: number } => {
  const a = (i / 5) * Math.PI * 2 + 0.6;
  return { x: POLE.x + Math.cos(a) * 3.2, z: POLE.z + Math.sin(a) * 3.2 };
};
function listen(i: number): ExtraDef {
  return {
    id: `listen${i}`, prompt: 'prompt.listen', rule: false, at: i < 6 ? { door: i } : ring(i - 6), r: 1.7, hold: 1.2, enabled: true, once: true, glint: true,
    effects: [{ line: `n4n.v${i}` as StrKey, style: 1 }, { flag: `heard${i}` }],
  };
}
const heardAll = Array.from({ length: 11 }, (_, i) => `heard${i}`);

export const NIGHT4N: NightDef = {
  id: 'night4n',
  index: 4,
  titleKey: 'night.4',
  hidden: true,
  duration: 9999,
  startHour: 4,
  endHour: 6,
  reelSeconds: 1e9,
  fog: 0.03,
  // предрассветное: серо, тихо, без дождя
  look: { shadow: [0.7, 0.74, 0.82], highlight: [1.05, 1.0, 0.95], desat: 0.4, mist: 1.0, rain: false },
  lights: [true, true, true, true, true, true],
  startWeapons: [],
  dynamite: 0,
  // громкоговоритель молчит: никто не просит его включить
  noRadio: true,
  knockRule: 0,
  knockPrompt: 'prompt.knock2',
  rules: [],
  dawnTruth: 'end4n.d3',
  dawnTitle: 'end4n.t',
  dawnSub: 'end4n.s',
  waves: [],
  beats: [
    { id: 'start', when: { t: 0.5 }, do: [{ appear: 'villagers' }, { line: 'n4n.start' }, { wait: 4 }, { line: 'n4n.start2' }, { objective: 'obj.listen', marker: null }] },
    { id: 'half', when: { flags: ['heard0', 'heard1', 'heard2', 'heard3', 'heard4'] }, do: [{ line: 'n4n.half' }] },
    {
      id: 'all', when: { flags: heardAll },
      do: [{ wait: 2 }, { line: 'n4n.all' }, { objective: 'obj.mother', marker: { pier: true } }, { enable: 'mother' }],
    },
    // не дослушали — утро всё равно придёт
    { id: 'late', when: { t: 600 }, do: [{ line: 'n4n.late' }, { enable: 'mother' }, { objective: 'obj.mother', marker: { pier: true } }] },
  ],
  houses: [],
  extras: [
    ...Array.from({ length: 11 }, (_, i) => listen(i)),
    {
      id: 'mother', prompt: 'prompt.mother', rule: false, at: 'pierEnd', r: 2.2, hold: 2, enabled: false, once: true,
      effects: [{ objective: '', marker: null }, { line: 'n4n.mother1' }, { wait: 3.5 }, { line: 'n4n.mother2', style: 2 }, { wait: 4 }, { dawn: true }],
    },
  ],
  fragments: ['frag3.1', 'frag3.2', 'frag3.3', 'frag3.4', 'frag3.5', 'frag3.6', 'frag3.7', 'frag3.8', 'frag3.9', 'frag3.10'],
  intro: [
    { from: [10, 14, 22], to: [6, 10, 16], lookFrom: [0, 0, 0], lookTo: [0, 0.5, 0], dur: 7, fov: 44, line: 'cut4n.i1' },
    { from: [-8, 5, 2], to: [-4, 4, 4], lookFrom: [-13, 1.2, -2], lookTo: [-12, 1.2, 0], dur: 7, fov: 40, line: 'cut4n.i2' },
  ],
  dawn: [
    { from: [16, 4, 26], to: [19, 3, 23], lookFrom: [24, 0.5, 19], lookTo: [27, 0, 19], dur: 7, fov: 40, line: 'end4n.d1' },
    { from: [10, 9, 14], to: [6, 7, 10], lookFrom: [0, 1, 0], lookTo: [0, 1.5, 0], dur: 7, fov: 44, line: 'end4n.d2' },
    { from: [3, 3, 4], to: [5, 2.2, 1.5], lookFrom: [6.5, 1.2, -4.5], lookTo: [6.5, 1.0, -3], dur: 7, fov: 40, line: 'end4n.d3' },
  ],
};
