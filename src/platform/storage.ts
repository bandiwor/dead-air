/**
 * Настройки и прогресс в localStorage. Всё, что читается, проходит проверку схемы:
 * повреждённые или подделанные данные не роняют игру — подставляются значения по умолчанию.
 */
export interface Settings {
  version: 1;
  scare: number;
  reduceFlashes: boolean;
  vibration: boolean;
  quality: number;
  autofire: boolean;
  volume: number;
  disclaimerAccepted: boolean;
  /** Режим отладки: оверлей статистики, панель читов, отрисовка коллизий. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  scare: 0.8,
  reduceFlashes: false,
  vibration: true,
  quality: 1,
  autofire: true,
  volume: 0.9,
  disclaimerAccepted: false,
  debug: false,
};

const KEY = 'dead-air:settings';

const num = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, quality: guessQuality() };
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null) throw new Error('bad');
    const d = DEFAULT_SETTINGS;
    return {
      version: 1,
      scare: num(o.scare, 0, 1, d.scare),
      reduceFlashes: bool(o.reduceFlashes, d.reduceFlashes),
      vibration: bool(o.vibration, d.vibration),
      quality: Math.round(num(o.quality, 0, 2, d.quality)),
      autofire: bool(o.autofire, d.autofire),
      volume: num(o.volume, 0, 1, d.volume),
      disclaimerAccepted: bool(o.disclaimerAccepted, false),
      debug: bool(o.debug, false),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, quality: guessQuality() };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* приватный режим — живём без сохранения */
  }
}

function guessQuality(): number {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 4) return 0;
  if (mem >= 8 && cores >= 8) return 2;
  return 1;
}

/** Прогресс: сколько ночей открыто и каких существ игрок уже видел (для стоп-кадра бестиария). */
export interface Progress {
  unlocked: number;
  seen: number[];
  /** Полученные достижения и увиденные концовки. */
  ach: string[];
  endings: string[];
  /** Какие находки уже видели (первая — стоп-кадр, дальше — маленькая карточка). */
  items: string[];
}

const PKEY = 'dead-air:progress';

export function loadProgress(): Progress {
  try {
    const o = JSON.parse(localStorage.getItem(PKEY) ?? '{}') as Record<string, unknown>;
    const unlocked = typeof o.unlocked === 'number' && Number.isInteger(o.unlocked) ? Math.min(20, Math.max(1, o.unlocked)) : 1;
    const seen = Array.isArray(o.seen) ? o.seen.filter((v): v is number => Number.isInteger(v) && v >= 0 && v < 32) : [];
    const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_:]{1,32}$/.test(x)).slice(0, 64) : []);
    return { unlocked, seen, ach: ids(o.ach), endings: ids(o.endings), items: ids(o.items) };
  } catch {
    return { unlocked: 1, seen: [], ach: [], endings: [], items: [] };
  }
}

/** Сброс прогресса на месте (на объект ссылаются трекер достижений и меню). Настройки не трогаем. */
export function resetProgress(p: Progress): void {
  p.unlocked = 1;
  p.seen.length = 0;
  p.ach.length = 0;
  p.endings.length = 0;
  p.items.length = 0;
  saveProgress(p);
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {
    /* приватный режим */
  }
}
