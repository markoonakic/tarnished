import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        'iframe-scanner': resolve(__dirname, 'src/content/iframe-scanner.ts'),
        popup: resolve(__dirname, 'src/popup/index.ts'),
        options: resolve(__dirname, 'src/options/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'iframe-scanner'
            ? 'content/iframe-scanner.js'
            : '[name]/index.js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: (id) =>
          id.includes('node_modules') ? 'vendor' : undefined,
      },
    },
    target: 'es2020',
    minify: false,
    sourcemap: true,
  },
  plugins: [
    {
      name: 'copy-manifest',
      writeBundle() {
        copyFileSync(
          resolve(__dirname, 'src/manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );
      },
    },
    // Content scripts run as classic scripts, not modules.
    {
      name: 'inline-content-scripts',
      enforce: 'post',
      generateBundle(options, bundle) {
        const scriptsToInline = [
          'content/index.js',
          'content/iframe-scanner.js',
        ];

        const inlinedChunks = new Set<string>();
        for (const scriptName of scriptsToInline) {
          const script = bundle[scriptName];
          if (!script || script.type !== 'chunk') continue;

          const imports = [...(script.imports || [])];

          // Dependencies must initialize before their consumers (including
          // bundler runtime helpers used by the polyfill and logger).
          const chunksToDelete = new Set<string>();
          const dependencyCode: string[] = [];
          function inlineDependency(importPath: string) {
            if (chunksToDelete.has(importPath)) return;
            const chunk = bundle[importPath];
            if (chunk && chunk.type === 'chunk') {
              chunksToDelete.add(importPath);
              for (const dependency of chunk.imports)
                inlineDependency(dependency);
              dependencyCode.push(chunk.code);
            }
          }
          for (const importPath of imports) inlineDependency(importPath);
          let code = [...dependencyCode, script.code].join('\n');

          code = code.replace(/^import\s+.*?;\s*$/gm, '');
          code = code.replace(/^import\s+.*?from\s+['"].*?['"];\s*$/gm, '');

          code = code.replace(/^export\s+\{[^}]*\};\s*$/gm, '');
          code = code.replace(/^export\s+default\s+[^;]+;\s*$/gm, '');

          // Keep shared declarations local when a scanner is injected again.
          script.code = `(function () {\n${code.trim()}\n})();`;
          script.imports = [];
          for (const chunkPath of chunksToDelete) inlinedChunks.add(chunkPath);
        }

        // Both classic scripts need shared chunks before removal.
        for (const chunkPath of inlinedChunks) {
          const usedByModule = Object.values(bundle).some(
            (item) => item.type === 'chunk' && item.imports.includes(chunkPath)
          );
          if (!usedByModule) {
            delete bundle[chunkPath];
            delete bundle[chunkPath + '.map'];
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@lib': resolve(__dirname, 'src/lib'),
    },
  },
});
