import { ru, type Dict, type StrKey } from './ru';

export type { StrKey } from './ru';

const locales: Record<string, Dict> = { ru };
let current: Dict = ru;

export function setLocale(id: string): void {
  current = locales[id] ?? ru;
}

export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = current[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export function isStrKey(k: string): k is StrKey {
  return k in current;
}
