import { build } from 'vite';

await build({
  configFile: false,
  logLevel: 'warn',
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'ES2022' } }) },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: { entry: 'electron/browser-native/page-entry.ts', name: 'domePage', formats: ['iife'], fileName: () => 'browser-page.js' },
  },
});
