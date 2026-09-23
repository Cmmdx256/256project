import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import fs from 'fs';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = process.env.BASE_URL || (mode === 'production' && !process.env.VERCEL && !process.env.CF_PAGES ? '/256project/' : '/');

  return {
    base,
    plugins: [
      react(),
      svgr(),
      {
        name: 'suppress-wasm-warnings',
        configResolved(config) {
          // oxlint-disable-next-line typescript/unbound-method
          const originalWarn = config.logger.warn;
          config.logger.warn = (msg, options) => {
            // Suppress WASM runtime externalization warnings
            if (msg.includes('externalized for browser compatibility') && msg.includes('wasm-runtime.js')) {
              return;
            }
            originalWarn(msg, options);
          };
        },
      },
      {
        name: 'copy-404-html',
        closeBundle() {
          const indexPath = path.resolve(__dirname, 'dist/index.html');
          const notFoundPath = path.resolve(__dirname, 'dist/404.html');
          if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, notFoundPath);
          }
        },
      },
    ],
    worker: {
      format: 'es',
    },
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
    },
    server: {
      headers: {
        // E2E tests will fail on WebKit if caching enabled.
        // Only seem to be a problem in localhost.
        // https://predr.ag/blog/debugging-safari-if-at-first-you-succeed/
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 10000,
      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress "Module externalized for browser compatibility" warnings for WASM runtime files
          if (warning.code === 'MODULE_EXTERNALIZED' && warning.message?.includes('wasm-runtime.js')) {
            return;
          }
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('@xyflow/react') || id.includes('dagre')) {
              return 'inheritance';
            }
            if (id.includes('monaco-editor')) {
              return 'monaco';
            }
          },
        },
      },
    },
  };
});
