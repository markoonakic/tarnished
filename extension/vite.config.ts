import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';

// Custom plugin to copy public files to dist
function copyPublicFiles() {
  return {
    name: 'copy-public-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const publicDir = resolve(__dirname, 'public');
      const srcDir = resolve(__dirname, 'src');

      // Ensure dist directory exists
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      // Recursively copy files from public to dist
      function copyRecursive(src: string, dest: string) {
        if (!existsSync(dest)) {
          mkdirSync(dest, { recursive: true });
        }

        const entries = readdirSync(src);
        for (const entry of entries) {
          const srcPath = resolve(src, entry);
          const destPath = resolve(dest, entry);

          if (statSync(srcPath).isDirectory()) {
            copyRecursive(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      }

      // Copy public files to dist
      if (existsSync(publicDir)) {
        copyRecursive(publicDir, distDir);
      }

      // Copy manifest.json to dist
      const manifestSrc = resolve(srcDir, 'manifest.json');
      const manifestDest = resolve(distDir, 'manifest.json');
      if (existsSync(manifestSrc)) {
        copyFileSync(manifestSrc, manifestDest);
      }
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.ts'),
        options: resolve(__dirname, 'src/options/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Output to appropriate subdirectories
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/index.js';
          }
          if (chunkInfo.name === 'popup') {
            return 'popup/index.js';
          }
          if (chunkInfo.name === 'options') {
            return 'options/index.js';
          }
          return '[name]/index.js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'es2020',
    minify: false, // Keep readable for debugging during development
    sourcemap: true,
  },
  plugins: [
    copyPublicFiles(),
    // Plugin to inline content script dependencies (but keep shared chunks for others)
    {
      name: 'inline-content-script',
      enforce: 'post',
      generateBundle(options, bundle) {
        // Find the content script
        const contentScript = bundle['content/index.js'];
        if (!contentScript || contentScript.type !== 'chunk') return;

        // Get all imports from content script
        const imports = [...(contentScript.imports || [])];
        if (imports.length === 0) return;

        // Inline all imported chunks into content script
        let code = contentScript.code;
        const chunksToDelete = new Set<string>();

        for (const importPath of imports) {
          const chunk = bundle[importPath];
          if (chunk && chunk.type === 'chunk') {
            // Prepend the chunk's code
            code = chunk.code + '\n' + code;
            chunksToDelete.add(importPath);
          }
        }

        // Remove import statements from code
        code = code.replace(/^import\s+.*?;\s*$/gm, '');
        code = code.replace(/^import\s+.*?from\s+['"].*?['"];\s*$/gm, '');

        // Remove export statements
        code = code.replace(/^export\s+\{[^}]*\};\s*$/gm, '');
        code = code.replace(/^export\s+default\s+[^;]+;\s*$/gm, '');

        contentScript.code = code.trim();
        contentScript.imports = [];

        // Only delete chunks that are ONLY used by content script
        // Check if any other entry point uses these chunks
        for (const chunkPath of chunksToDelete) {
          let usedByOther = false;
          for (const [name, item] of Object.entries(bundle)) {
            if (item.type === 'chunk' && name !== 'content/index.js' && item.imports?.includes(chunkPath)) {
              usedByOther = true;
              break;
            }
          }
          if (!usedByOther) {
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
