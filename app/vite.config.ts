import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createPackedModule } from './scripts/rc1-performance-pack';
export default defineConfig({
  base: './', plugins: [react(), {
    name: 'lossless-route-data',
    apply: 'build',
    enforce: 'post',
    transform(_code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/data/routes.json')) return;
      return { code: createPackedModule(JSON.parse(readFileSync(id, 'utf8'))), map: null };
    },
  }],
  // Stable evidence-rich snapshot can be cached independently of interface changes.
  // Optional comparison/evaluation screens use actual lazy imports in App.
  build: { rollupOptions: { output: { manualChunks(id: string) {
    if (id.replaceAll('\\', '/').endsWith('/src/data/routes.json')) return 'route-data';
  } } } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
} as Parameters<typeof defineConfig>[0]);
