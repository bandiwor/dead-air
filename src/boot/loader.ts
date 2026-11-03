/**
 * Загрузчик тяжёлых частей сборки с честным прогрессом в байтах.
 *
 * Список файлов и их размеры вписывает в код плагин сборки (vite.config.ts → chunkManifestPlugin):
 * строка-заглушка ниже заменяется на JSON вида [["assets/three-….js", 612345], …].
 * Файлы скачиваются потоком (видно каждый килобайт), попадают в кэш браузера и Service Worker,
 * после чего import() берёт их уже оттуда.
 */
const MANIFEST: unknown = '__DEAD_AIR_CHUNKS__';

export interface LoadProgress {
  loaded: number;
  total: number;
}

export function chunkList(m: unknown = MANIFEST): [string, number][] {
  if (!Array.isArray(m)) return [];
  return m.filter((x): x is [string, number] => Array.isArray(x) && typeof x[0] === 'string' && /^assets\/[\w.-]+\.js$/.test(x[0]) && Number.isFinite(x[1]) && x[1] > 0);
}

export async function prefetchChunks(onProgress: (p: LoadProgress) => void, list = chunkList()): Promise<void> {
  const total = list.reduce((a, [, n]) => a + n, 0);
  if (total === 0) return;
  const done = new Map<string, number>();
  const report = (): void => {
    let loaded = 0;
    for (const v of done.values()) loaded += v;
    onProgress({ loaded: Math.min(loaded, total), total });
  };
  report();
  await Promise.all(
    list.map(async ([file, size]) => {
      try {
        const res = await fetch(new URL(file, document.baseURI), { credentials: 'same-origin' });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        let got = 0;
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          got += value.byteLength;
          done.set(file, Math.min(got, size));
          report();
        }
      } catch {
        // без потока (старый браузер, офлайн-кэш) — import() скачает сам
      }
      done.set(file, size);
      report();
    }),
  );
}
