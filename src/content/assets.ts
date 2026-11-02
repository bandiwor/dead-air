/**
 * Манифест ассетов. Любой элемент можно заменить файлом, не трогая код:
 *
 *   ground: { proc: 'ground' }                     — процедурная текстура
 *   ground: { file: 'assets/textures/ground.png' } — файл из public/
 *
 *   shotgun: { proc: 'shotgun', variations: 3 }    — процедурный звук (запекается при старте)
 *   shotgun: { file: 'assets/sounds/shotgun.ogg' } — файл (можно массив вариаций)
 *
 * Живые слои (ветер, гул, радиовальс) пока синтезируются всегда; их замена файлом — следующий шаг.
 */
export type ProcTextureId =
  | 'ground' | 'bark' | 'birch' | 'needles' | 'logs' | 'planks' | 'roof' | 'metal' | 'skin' | 'cloth' | 'waterNormal';

export type TextureSource = { proc: ProcTextureId; size?: number } | { file: string };

export const TEXTURES = {
  ground: { proc: 'ground', size: 128 },
  bark: { proc: 'bark', size: 64 },
  birch: { proc: 'birch', size: 64 },
  needles: { proc: 'needles', size: 64 },
  logs: { proc: 'logs', size: 128 },
  planks: { proc: 'planks', size: 128 },
  roof: { proc: 'roof', size: 128 },
  metal: { proc: 'metal', size: 64 },
  skin: { proc: 'skin', size: 64 },
  cloth: { proc: 'cloth', size: 64 },
  waterNormal: { proc: 'waterNormal', size: 128 },
} satisfies Record<string, TextureSource>;
export type TextureId = keyof typeof TEXTURES;

export type ProcSoundId =
  | 'revolver' | 'shotgun' | 'rifle' | 'smg' | 'flaregun' | 'reload' | 'dryfire' | 'swap'
  | 'explosion' | 'fuse' | 'stepGrass' | 'stepWood' | 'stepDirt' | 'stepMud'
  | 'whisper' | 'screech' | 'growl' | 'roar' | 'hit' | 'gore' | 'death' | 'hurt'
  | 'heartbeat' | 'sting' | 'swell' | 'branch' | 'reel' | 'pickup' | 'ui' | 'static'
  | 'speakerVoice' | 'cricket' | 'frog' | 'splash' | 'bounce';

export type SoundSource =
  | { proc: ProcSoundId; variations?: number }
  | { file: string | string[] };

export const SOUNDS = {
  revolver: { proc: 'revolver', variations: 3 },
  shotgun: { proc: 'shotgun', variations: 2 },
  rifle: { proc: 'rifle', variations: 2 },
  smg: { proc: 'smg', variations: 4 },
  flaregun: { proc: 'flaregun' },
  reload: { proc: 'reload' },
  dryfire: { proc: 'dryfire' },
  swap: { proc: 'swap' },
  explosion: { proc: 'explosion', variations: 2 },
  fuse: { proc: 'fuse' },
  stepGrass: { proc: 'stepGrass', variations: 5 },
  stepWood: { proc: 'stepWood', variations: 4 },
  stepDirt: { proc: 'stepDirt', variations: 4 },
  stepMud: { proc: 'stepMud', variations: 3 },
  whisper: { proc: 'whisper', variations: 5 },
  screech: { proc: 'screech', variations: 3 },
  growl: { proc: 'growl', variations: 2 },
  roar: { proc: 'roar' },
  hit: { proc: 'hit', variations: 3 },
  gore: { proc: 'gore', variations: 3 },
  death: { proc: 'death', variations: 3 },
  hurt: { proc: 'hurt', variations: 2 },
  heartbeat: { proc: 'heartbeat' },
  sting: { proc: 'sting' },
  swell: { proc: 'swell' },
  branch: { proc: 'branch', variations: 3 },
  reel: { proc: 'reel' },
  pickup: { proc: 'pickup' },
  ui: { proc: 'ui' },
  static: { proc: 'static' },
  speakerVoice: { proc: 'speakerVoice', variations: 3 },
  cricket: { proc: 'cricket', variations: 3 },
  frog: { proc: 'frog', variations: 2 },
  splash: { proc: 'splash', variations: 2 },
  bounce: { proc: 'bounce' },
} satisfies Record<string, SoundSource>;
export type SoundId = keyof typeof SOUNDS;
