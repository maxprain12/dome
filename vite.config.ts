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
      // @dome/* workspace packages (resolved at the Vite level; TS uses
      // matching paths in tsconfig.json).
      { find: /^@dome\/i18n$/, replacement: path.resolve(__dirname, './packages/i18n/src/index.ts') },
// Root alias last (most general)
      { find: '@', replacement: path.resolve(__dirname, './app') },
    ],
  },

  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const afterNM = id.split('node_modules/').pop() ?? '';
          const segments = afterNM.split('/');
          const pkg = segments[0]?.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
          if (!pkg) return;
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler' || pkg === 'react-router' || pkg === 'react-router-dom') {
            return 'vendor-react';
          }
          if (pkg.startsWith('@mantine')) return 'vendor-mantine';
          if (pkg.startsWith('@tiptap')) return 'vendor-tiptap';
          return undefined;
        },
      },
    },
  },

  // Development server (override with DOME_VITE_PORT or VITE_DEV_PORT for worktrees)
  server: {
    port: (() => {
      const p = process.env.DOME_VITE_PORT || process.env.VITE_DEV_PORT;
      if (p && /^\d+$/.test(p)) return parseInt(p, 10);
      return 5173;
    })(),
    strictPort: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    exclude: ['pyodide'],
    include: ['lucide-react', 'exceljs'],
  },
});
