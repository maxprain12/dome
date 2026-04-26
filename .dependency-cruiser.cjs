/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-app-to-electron-or-main',
      comment:
        'Renderer (app) must not import the Electron main tree or main-process-only modules. P-001. See docs/architecture/boundaries.md',
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '^electron/' },
    },
    {
      name: 'no-app-better-sqlite3',
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '^node_modules/better-sqlite3' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules', dependencyTypes: ['npm', 'npm-dev'] },
    tsPreCompilationDeps: true,
    exclude: { path: '(dist|build|release|node_modules|electron)>' },
  },
};
