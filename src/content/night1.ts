import type { StrKey } from '../i18n';
import type { KindId } from './enemies';

export type SpawnFrom = 'crevice' | 'pond' | 'forest' | 'behind';

export interface WaveDef {
  /** Секунда ночи, когда волна начинается. */
  at: number;
  spawns: { kind: KindId; count: number; from: SpawnFrom }[];
  /** Пауза между «толчками» спавна. */
  pulse: number;
  startLine?: StrKey;
  endLine?: StrKey;
  /** Что появляется у двери дома после волны. */
  reward?: { weapon?: string; house: number };
}

export interface BeatDef {
  id: string;
  when:
    | { t: number }
    | { flag: string }
    | { sanityBelow: number };
  lines: StrKey[];
  /** 0 — рассказчик, 1 — голос из громкоговорителя, 2 — записка. */
  style?: number;
}

export interface NightDef {
  id: string;
  duration: number;
  startHour: number;
  endHour: number;
  /** Сколько секунд играет одна бобина. */
  reelSeconds: number;
  waves: WaveDef[];
  beats: BeatDef[];
  rules: StrKey[];
}

export const NIGHT1: NightDef = {
  id: 'night1',
  duration: 470,
  startHour: 22,
  endHour: 6,
  reelSeconds: 80,
  rules: ['rule.1', 'rule.2', 'rule.3', 'rule.4', 'rule.5'],
  waves: [
    { at: 22, pulse: 2.6, spawns: [{ kind: 'whisperer', count: 6, from: 'crevice' }], startLine: 'n1.w1', endLine: 'n1.w1e' },
    {
      at: 85, pulse: 1.8,
      spawns: [{ kind: 'whisperer', count: 8, from: 'crevice' }, { kind: 'whisperer', count: 4, from: 'forest' }],
      startLine: 'n1.w2', endLine: 'n1.w2e', reward: { weapon: 'shotgun', house: 2 },
    },
    {
      at: 150, pulse: 2,
      spawns: [{ kind: 'mute', count: 1, from: 'pond' }, { kind: 'whisperer', count: 9, from: 'forest' }],
      startLine: 'n1.w3', endLine: 'n1.w3e', reward: { weapon: 'rifle', house: 3 },
    },
    {
      at: 218, pulse: 1.6,
      spawns: [{ kind: 'echo', count: 1, from: 'behind' }, { kind: 'whisperer', count: 11, from: 'crevice' }],
      startLine: 'n1.w4', endLine: 'n1.w4e', reward: { weapon: 'smg', house: 0 },
    },
    {
      at: 290, pulse: 1.4,
      spawns: [
        { kind: 'mute', count: 1, from: 'crevice' }, { kind: 'mute', count: 1, from: 'pond' },
        { kind: 'whisperer', count: 14, from: 'forest' },
      ],
      startLine: 'n1.w5',
    },
    {
      at: 365, pulse: 1.1,
      spawns: [
        { kind: 'echo', count: 1, from: 'behind' }, { kind: 'mute', count: 2, from: 'pond' },
        { kind: 'whisperer', count: 10, from: 'crevice' }, { kind: 'whisperer', count: 10, from: 'forest' },
      ],
      startLine: 'n1.w6',
    },
  ],
  beats: [
    { id: 'start', when: { t: 1.5 }, lines: ['n1.start.1', 'n1.start.2'] },
    { id: 'hut', when: { flag: 'hutVisited' }, lines: ['n1.hut'], style: 2 },
    { id: 'muteHint', when: { flag: 'muteSeen' }, lines: ['n1.mute.hint'] },
    { id: 'echoHint', when: { flag: 'echoSeen' }, lines: ['n1.echo.hint'] },
    { id: 'deadair', when: { flag: 'deadAir' }, lines: ['n1.deadair'] },
    { id: 'air', when: { flag: 'airRestored' }, lines: ['n1.air'] },
    { id: 'pier', when: { flag: 'pierSeen' }, lines: ['n1.pier'] },
    { id: 'window', when: { flag: 'windowLit' }, lines: ['n1.window'] },
    { id: 'sanity', when: { sanityBelow: 35 }, lines: ['n1.sanity'] },
  ],
};
