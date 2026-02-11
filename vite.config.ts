import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  // Base path for assets (absolute so deep routes resolve correctly)
  base: '/',

  // Resolve aliases (match Next.js @/ pattern)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
      // Stub bun:sqlite for renderer process (same as Next.js webpack config)
      'bun:sqlite': path.resolve(__dirname, './app/lib/db/__stubs__/bun-sqlite.ts'),
    },
  },

  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Externalize native modules (vectordb, lancedb)
      external: ['vectordb', /^@lancedb\//],
    },
  },

  // Development server
  server: {
    port: 5173,
    strictPort: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    exclude: ['vectordb', '@lancedb/vectordb'],
    include: ['lucide-react'],
  },
});
