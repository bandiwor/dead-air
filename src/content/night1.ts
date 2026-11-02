import type { StrKey } from '../i18n';
import type { KindId } from './enemies';
import type { Beat, Effect } from './script';

export type SpawnFrom = 'crevice' | 'pond' | 'forest' | 'behind';

export interface WaveDef {
  at: number;
  spawns: { kind: KindId; count: number; from: SpawnFrom }[];
  pulse: number;
  startLine?: StrKey;
  endLine?: StrKey;
  reward?: { weapon?: string; house: number };
}

export interface NightDef {
  id: string;
  duration: number;
  startHour: number;
  endHour: number;
  reelSeconds: number;
  waves: WaveDef[];
  beats: Beat[];
  rules: StrKey[];
  /** Сценарии взаимодействий, которые нарушают Наказ. */
  pierCall: Effect[];
  switchOff: Effect[];
  /** Обрывки, которые договаривают шептуны в тишине (по порядку — так складывается история). */
  fragments: StrKey[];
}

/*
 * Ночь первая. Логика:
 *  — Радио глушит правду. В мёртвом эфире убитые шептуны договаривают фразы → «обрывки».
 *  — Наказ можно нарушить: выключить радио, постучать, пройти по своим следам, позвать с пристани.
 *    Нарушение = страх и потеря рассудка, но и правда (записки, обрывки, другая концовка).
 *  — Скримеры стоят там, куда игрок придёт сам: дом у колодца, зеркало, пристань.
 */
export const NIGHT1: NightDef = {
  id: 'night1',
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
        { deadAir: true }, { line: 'n1.names4' },
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
  pierCall: [
    { flag: 'broke:4' }, { objective: 'obj.air', marker: null }, { line: 'n1.call1' }, { scare: 'duck' },
    { wait: 1.8 }, { scare: 'turn' }, { wait: 1.4 }, { scare: 'jumpscare' }, { despawnPier: true },
    { fragment: true }, { line: 'n1.call2' }, { wait: 1 }, { spawn: 'mute', count: 1, at: 'pierWater' },
  ],
  switchOff: [{ flag: 'broke:1' }, { deadAir: true }, { line: 'n1.broke1' }],
  fragments: ['frag.1', 'frag.2', 'frag.3', 'frag.4', 'frag.5', 'frag.6', 'frag.7', 'frag.8', 'frag.9', 'frag.10'],
};
