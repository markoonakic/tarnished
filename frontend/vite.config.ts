import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-markdown')) {
            return 'markdown';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/react-router/')
          ) {
            return 'react';
          }
          if (id.includes('node_modules/echarts-for-react')) {
            return 'echarts-react';
          }
          if (id.includes('node_modules/zrender/')) {
            return 'zrender';
          }
          if (id.includes('node_modules/echarts/')) {
            return 'echarts-core';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5577',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
