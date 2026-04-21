import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  // Base path for assets (absolute so deep routes resolve correctly)
  base: '/',

  // Resolve aliases (match Next.js @/ pattern)
  // NOTE: Array form required so specific aliases match before general ones.
  resolve: {
    alias: [
      // More specific @excalidraw sub-paths first, before the general package alias
      { find: '@excalidraw/excalidraw/index.css', replacement: path.resolve(__dirname, './app/lib/stubs/excalidraw.css') },
      { find: '@excalidraw/excalidraw/types', replacement: path.resolve(__dirname, './app/lib/stubs/excalidraw-stub.tsx') },
      { find: '@excalidraw/excalidraw', replacement: path.resolve(__dirname, './app/lib/stubs/excalidraw-stub.tsx') },
      // Stub bun:sqlite for renderer process
      { find: 'bun:sqlite', replacement: path.resolve(__dirname, './app/lib/db/__stubs__/bun-sqlite.ts') },
// Root alias last (most general)
      { find: '@', replacement: path.resolve(__dirname, './app') },
    ],
  },

  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  // Development server
  server: {
    port: 5173,
    strictPort: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    exclude: ['pyodide'],
    include: ['lucide-react'],
  },
});
