import type { NightDef } from './night';

/*
 * Ночь первая. Логика:
 *  — Радио глушит правду. В мёртвом эфире убитые шептуны договаривают фразы → «обрывки».
 *  — Наказ можно нарушить: выключить радио, постучать, пройти по своим следам, позвать с пристани.
 *    Нарушение = страх и потеря рассудка, но и правда (записки, обрывки, другая концовка).
 *  — Скримеры стоят там, куда игрок придёт сам: дом у колодца, зеркало, пристань.
 */
export const NIGHT1: NightDef = {
  id: 'night1',
  index: 1,
  titleKey: 'night.1',
  fog: 0.03,
  // тёплая ночь: натриевый янтарь против сине-чёрного
  look: { shadow: [0.62, 0.78, 1.0], highlight: [1.07, 0.98, 0.84], desat: 0, mist: 1, rain: false },
  lights: [true, false, false, true, false, false],
  startWeapons: ['revolver', 'flaregun'],
  knockRule: 2,
  knockPrompt: 'prompt.knock',
  dawnTruth: 'cut.dawn.3b',
  dawnTitle: 'dawn.title',
  dawnSub: 'dawn.sub',
  duration: 540,
  startHour: 22,
  endHour: 6,
  reelSeconds: 85,
  rules: ['rule.1', 'rule.2', 'rule.3', 'rule.4', 'rule.5'],
  waves: [
    { at: 22, pulse: 2.6, spawns: [{ kind: 'whisperer', count: 6, from: 'crevice' }], startLine: 'n1.w1', endLine: 'n1.w1e' },
    {
      at: 105, pulse: 1.8,
      spawns: [{ kind: 'whisperer', count: 8, from: 'crevice' }, { kind: 'whisperer', count: 4, from: 'forest' }],
      startLine: 'n1.w2', endLine: 'n1.w2e', reward: { weapon: 'rifle', house: 3 },
    },
    {
      at: 190, pulse: 2,
      spawns: [{ kind: 'mute', count: 1, from: 'pond' }, { kind: 'whisperer', count: 9, from: 'forest' }],
      startLine: 'n1.w3', endLine: 'n1.w3e', reward: { weapon: 'smg', house: 0 },
    },
    {
      at: 275, pulse: 1.6,
      spawns: [{ kind: 'echo', count: 1, from: 'behind' }, { kind: 'whisperer', count: 11, from: 'crevice' }],
      startLine: 'n1.w4',
    },
    {
      at: 365, pulse: 1.4,
      spawns: [{ kind: 'mute', count: 1, from: 'crevice' }, { kind: 'mute', count: 1, from: 'pond' }, { kind: 'whisperer', count: 14, from: 'forest' }],
      startLine: 'n1.w5',
    },
    {
      at: 455, pulse: 1.1,
      spawns: [
        { kind: 'echo', count: 1, from: 'behind' }, { kind: 'mute', count: 2, from: 'pond' },
        { kind: 'whisperer', count: 10, from: 'crevice' }, { kind: 'whisperer', count: 10, from: 'forest' },
      ],
      startLine: 'n1.w6',
    },
  ],
  beats: [
    { id: 'nakaz', when: { t: 0.4 }, do: [{ note: 'note.nakaz' }, { objective: 'obj.air', marker: null }] },
    { id: 'start', when: { t: 2 }, do: [{ line: 'n1.start.2' }] },
    { id: 'hut', when: { flag: 'hutVisited' }, do: [{ line: 'n1.hut', style: 2 }] },
    // голос в эфире узнаёт вас — первая трещина в «я здесь чужой»
    { id: 'voice', when: { t: 50 }, do: [{ scare: 'duck' }, { wait: 1.2 }, { scare: 'speaker' }, { line: 'n1.voice', style: 1 }, { wait: 3 }, { line: 'n1.voice2' }] },

    // после первой волны: дом у колодца приглашает войти
    {
      id: 'house2',
      when: { flag: 'wave:1:end' },
      do: [
        { wait: 3 }, { openDoor: 2 }, { light: 2, on: true },
        { drop: 'weapon', weapon: 'shotgun', house: 2, inside: true },
        { line: 'n1.house2' }, { objective: 'obj.house2', marker: { house: 2 } },
      ],
    },
    { id: 'house2in', when: { flag: 'inside:2' }, do: [{ line: 'n1.house2in' }, { objective: 'obj.air', marker: null }] },
    // ловушка: дверь захлопывается, свет гаснет, скребутся, лицо в темноте, дверь распахивается
    {
      id: 'slam',
      when: { flag: 'got:shotgun' },
      do: [
        { wait: 0.6 }, { closeDoor: 2 }, { light: 2, on: false }, { scare: 'duck' },
        { wait: 1.2 }, { scare: 'scratch', house: 2 }, { line: 'n1.slam' },
        { wait: 3.6 }, { scare: 'jumpscare' },
        { wait: 0.9 }, { openDoor: 2 }, { spawn: 'whisperer', count: 4, at: 'doorOut', house: 2 },
      ],
    },
    { id: 'knockHint', when: { flag: 'wave:2:end' }, do: [{ wait: 4 }, { line: 'n1.knockHint' }] },
    { id: 'broke2', when: { flag: 'broke:2' }, do: [{ line: 'n1.broke2' }] },
    { id: 'broke3', when: { flag: 'broke:3' }, do: [{ line: 'n1.broke3' }] },

    // мёртвый эфир: тишина делает шёпот словами
    { id: 'deadair', when: { flag: 'deadAir' }, do: [{ line: 'n1.deadair' }, { wait: 4 }, { line: 'n1.fragHint' }] },
    // когда эфир возвращается — под фонарём кто-то стоит
    { id: 'air', when: { flag: 'airRestored' }, do: [{ wait: 0.8 }, { appear: 'pole' }, { wait: 1.6 }, { line: 'n1.air' }] },

    // середина ночи: громкоговоритель читает фамилии и обрывается на двенадцатой
    {
      id: 'names',
      when: { flag: 'wave:3:end' },
      do: [
        { scare: 'names' }, { line: 'n1.names1', style: 1 }, { wait: 4 },
        { line: 'n1.names2', style: 1 }, { wait: 4 }, { line: 'n1.names3', style: 1 }, { wait: 2.5 },
        { deadAir: true }, { line: 'n1.names4' }, { wait: 2 }, { line: 'n1.names5' },
      ],
    },
    // 03:30 — на краю пристани кто-то стоит спиной. Ждёт, что позовут.
    {
      id: 'pier',
      when: { t: 330 },
      do: [{ appear: 'pier' }, { line: 'n1.pier' }, { objective: 'obj.pier', marker: { pier: true } }],
    },
    { id: 'sanity', when: { sanityBelow: 35 }, do: [{ line: 'n1.sanity' }] },
  ],
  extras: [
    {
      id: 'pier', prompt: 'prompt.call', rule: true, at: 'pierEnd', r: 2, hold: 1.4, enabled: false, once: true,
      effects: [
        { flag: 'broke:4' }, { objective: 'obj.air', marker: null }, { line: 'n1.call1' }, { scare: 'duck' },
    { wait: 1.8 }, { scare: 'turn' }, { wait: 1.4 }, { scare: 'jumpscare' }, { despawnPier: true },
    { fragment: true }, { line: 'n1.call2' }, { wait: 1 }, { spawn: 'mute', count: 1, at: 'pierWater' },
      ],
    },
    { id: 'switch', prompt: 'prompt.switch', rule: true, at: 'hutSide', r: 1.1, hold: 0, enabled: true, once: false, effects: [{ flag: 'broke:1' }, { deadAir: true }, { line: 'n1.broke1' }] },
  ],
  houses: [
    { house: 0, notes: [{ id: 'dinner', key: 'note.dinner', x: 0.9, z: -1.3 }, { id: 'receiver', key: 'note.receiver', x: -2.45, z: 1.0 }],
      knock: [{ scare: 'knockBack', house: 0 }, { wait: 2.2 }, { openDoor: 0 }, { line: 'n1.open0' }] },
    { house: 1, notes: [{ id: 'mirror', key: 'note.mirror', x: 0, z: -1.7, after: [{ scare: 'duck' }, { wait: 0.4 }, { appear: 'behind' }, { line: 'n1.behind' }] }],
      knock: [{ scare: 'knockBack', house: 1 }, { wait: 2.6 }, { openDoor: 1 }, { line: 'n1.open1' }] },
    { house: 2, notes: [{ id: 'drawings', key: 'note.drawings', x: -1.5, z: -2.05 }], knock: [] },
    { house: 3, notes: [{ id: 'list', key: 'note.list', x: -1.2, z: -1.2 }], knock: [{ wait: 5 }, { openDoor: 3 }, { line: 'n1.open3' }] },
    { house: 4, notes: [{ id: 'floor', key: 'note.floor', x: 1.2, z: 0.2 }],
      knock: [{ scare: 'scratch', house: 4 }, { wait: 2.5 }, { openDoor: 4 }, { spawn: 'whisperer', count: 5, at: 'inside', house: 4 }, { line: 'n1.open4' }] },
    { house: 5, notes: [{ id: 'photo', key: 'note.photo', x: 1.95, z: -0.6 }],
      knock: [{ light: 5, on: true }, { appear: 'window', house: 5 }, { wait: 2.2 }, { light: 5, on: false }, { wait: 1 }, { openDoor: 5 }, { line: 'n1.open5' }] },
  ],
  intro: [
    { from: [-34, 30, -78], to: [-14, 22, -66], lookFrom: [-4, 2, -46], lookTo: [-3, 0, -40], dur: 6, fov: 38, line: 'cut.intro.1' },
    { from: [44, 7, 38], to: [33, 5, 32], lookFrom: [17, 0, 19], lookTo: [20, -0.4, 19], dur: 6, fov: 36, line: 'cut.intro.2' },
    { from: [-5, 2.2, 7], to: [-2.5, 3.5, 4.5], lookFrom: [0, 6.6, 0], lookTo: [0, 7, 0], dur: 6, fov: 42, line: 'cut.intro.3' },
    { from: [1, 4, 10], to: [3.5, 14, 13], lookFrom: [5, 1.2, 0], lookTo: [3.8, 0.5, 2.6], dur: 9, fov: 42, line: 'cut.intro.4' },
  ],
  dawn: [
    { from: [8, 9, 34], to: [12, 6, 30], lookFrom: [18, 0, 18], lookTo: [20, -0.4, 19], dur: 6, fov: 36, line: 'cut.dawn.1' },
    { from: [14, 1.8, 21.5], to: [16, 1.5, 20.6], lookFrom: [22, -0.6, 19], lookTo: [24, -0.8, 19.5], dur: 6, fov: 40, line: 'cut.dawn.2' },
    { from: [20.5, 2.4, 19], to: [21.2, 1.4, 19], lookFrom: [22.5, -0.75, 19], lookTo: [22.6, -0.76, 19.1], dur: 6, fov: 44, line: 'cut.dawn.3' },
    { from: [3, 3, 4], to: [5, 2.2, 1.5], lookFrom: [6.5, 1.2, -4.5], lookTo: [6.5, 1.0, -3], dur: 7, fov: 40, line: 'cut.dawn.4' },
  ],
  fragments: ['frag.1', 'frag.2', 'frag.3', 'frag.4', 'frag.5', 'frag.6', 'frag.7', 'frag.8', 'frag.9', 'frag.10'],
};
