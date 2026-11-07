import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@linguacall/i18n': resolve(import.meta.dirname, '../../packages/i18n/src/index.ts'),
      '@linguacall/translation': resolve(
        import.meta.dirname,
        '../../packages/translation/src/index.ts',
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', 'e96f-188-163-4-22.ngrok-free.app', '*.ngrok-free.app'],
    fs: {
      allow: [resolve(import.meta.dirname, '../..')],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
