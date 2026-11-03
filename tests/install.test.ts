import { describe, expect, it } from 'vitest';
import { isIosSafari, parseInstallState } from '../src/platform/install';

describe('установка PWA', () => {
  it('сохранённое состояние проверяется', () => {
    expect(parseInstallState(null)).toEqual({ until: 0, never: false });
    expect(parseInstallState('мусор')).toEqual({ until: 0, never: false });
    expect(parseInstallState('{"until":"zzz","never":"yes"}')).toEqual({ until: 0, never: false });
    expect(parseInstallState('{"until":-5,"never":true}')).toEqual({ until: 0, never: true });
    expect(parseInstallState('{"until":1e300,"never":false}')).toEqual({ until: 1e300, never: false });
  });

  it('iPhone Safari — инструкция; другие браузеры на iOS и Android — нет', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    expect(isIosSafari(ios, 5)).toBe(true);
    expect(isIosSafari(iosChrome, 5)).toBe(false);
    expect(isIosSafari(ipad, 5)).toBe(true);
    expect(isIosSafari(ipad, 0)).toBe(false);
    expect(isIosSafari(android, 5)).toBe(false);
  });
});
