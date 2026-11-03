import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
/** Идентификатор сборки: в CI — SHA коммита, локально — время. По нему игра узнаёт об обновлениях. */
const BUILD_ID = (process.env.BUILD_ID ?? `local-${Date.now().toString(36)}`).slice(0, 12);
const BUILT_AT = new Date().toISOString();

/**
 * Строгая CSP добавляется только в production-сборку:
 * dev-сервер Vite использует websocket для HMR, и CSP ему мешает.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'dead-air-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      );
    },
  };
}

/** Кладёт в сборку version.json — его игра периодически запрашивает, минуя кэш. */
function versionPlugin(): Plugin {
  return {
    name: 'dead-air-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: BUILD_ID, version: pkg.version, builtAt: BUILT_AT }),
      });
    },
  };
}

/**
 * Вписывает в точку входа список тяжёлых файлов (всё, что грузится через import())
 * с их размерами — загрузчик показывает честный прогресс «N% (n/N KB)».
 */
function chunkManifestPlugin(): Plugin {
  return {
    name: 'dead-air-chunk-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const entry = chunks.find((c) => c.isEntry);
      if (!entry) return;
      const lazy = new Set<string>();
      const visit = (file: string): void => {
        if (lazy.has(file) || file === entry.fileName) return;
        const c = byName.get(file);
        if (!c) return;
        lazy.add(file);
        c.imports.forEach(visit);
      };
      entry.dynamicImports.forEach(visit);
      const list = [...lazy].map((f) => [f, Buffer.byteLength(byName.get(f)!.code)]);
      const re = /(["'`])__DEAD_AIR_CHUNKS__\1/;
      if (!re.test(entry.code)) this.error('chunk manifest placeholder not found in entry');
      entry.code = entry.code.replace(re, JSON.stringify(list));
    },
  };
}

/** Целевые браузеры для lightningcss (major << 16). */
const CSS_TARGETS = { chrome: 100 << 16, safari: (15 << 16) | (4 << 8), firefox: 102 << 16, edge: 100 << 16 };

export default defineConfig({
  base: './',
  plugins: [cspPlugin(), versionPlugin(), chunkManifestPlugin()],
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: CSS_TARGETS },
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    cssMinify: 'lightningcss',
    // terser: максимальное сжатие без «небезопасных» преобразований, которые ломают Three.js
    minify: 'terser',
    terserOptions: {
      ecma: 2020,
      module: true,
      toplevel: true,
      compress: {
        passes: 3,
        ecma: 2020,
        module: true,
        toplevel: true,
        pure_getters: 'strict',
        drop_debugger: true,
        pure_funcs: ['console.debug'],
        reduce_funcs: true,
        reduce_vars: true,
        hoist_props: true,
        join_vars: true,
        collapse_vars: true,
        sequences: true,
        booleans: true,
        unused: true,
      },
      mangle: { toplevel: true, module: true },
      format: { comments: false, ecma: 2020, ascii_only: false },
    },
    rollupOptions: {
      output: {
        // Three.js — отдельным файлом: меняется редко, кэшируется надолго
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three/ }],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // полные прогоны ночей ботом занимают несколько секунд
    testTimeout: 30000,
    environment: 'node',
  },
} as never);
