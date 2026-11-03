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

export default defineConfig({
  base: './',
  plugins: [cspPlugin(), versionPlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // полные прогоны ночей ботом занимают несколько секунд
    testTimeout: 30000,
    environment: 'node',
  },
} as never);
