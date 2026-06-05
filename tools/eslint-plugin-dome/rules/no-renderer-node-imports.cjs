'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow Node/Electron/DB imports in the renderer (P-001).' },
    messages: {
      forbidden: `[P-001] Import prohibido en renderer: "{{module}}".
Remedio: usa IPC.
  1) Handler en electron/ipc/<domain>.cjs
  2) Registro en electron/ipc/index.cjs
  3) Canal en electron/preload.cjs ALLOWED_CHANNELS
  4) Renderer: window.electron.invoke('dominio:accion', args)
see: docs/architecture/boundaries.md | docs/principles.md`,

      // R9 — workspace-scaffold: @dome/ai, @dome/agent-core, @dome/tools and @dome/prompts
      // are Node-only. The renderer must not import them (even as `import type`) — the
      // only @dome/* package the renderer can pull from is @dome/i18n.
      forbiddenDomePackage:
        '[R9] El paquete "{{module}}" es Node-only y no debe importarse desde el renderer (app/). ' +
        'Si solo necesitas tipos, usa `import type` desde un archivo que NO sea renderer-side. ' +
        'El único paquete @dome/* que el renderer puede importar como runtime es @dome/i18n. ' +
        'See: longrunning-task/03-migration-strategy.md (R9) | packages/*/README.md',
    },
    schema: [],
  },
  create(context) {
    // Alineado con .github/workflows/ci.ts architecture-check (mejora: bloquea imports explícitos
    // de módulos que no deben usarse nunca en el renderer; path/os a veces se resuelven a shims
    // en Vite — migrar a utilidades puras con el tiempo).
    const FORBIDDEN = new Set(['fs', 'node:fs', 'better-sqlite3']);

    // Phase 0 — workspace-scaffold (R9). The new monorepo packages that touch Node/DB/native
    // modules are main-process-only. @dome/i18n is the one renderer-safe package.
    // Pattern matches the @dome scope + any of the Node-only names.
    const DOME_NODE_ONLY = /^@dome\/(ai|agent-core|tools|prompts)(?:\/.*)?$/;

    return {
      ImportDeclaration(node) {
        const src = node.source && node.source.value;
        if (typeof src !== 'string') return;
        if (FORBIDDEN.has(src) || src.startsWith('bun:')) {
          context.report({ node, messageId: 'forbidden', data: { module: src } });
          return;
        }
        if (DOME_NODE_ONLY.test(src)) {
          context.report({ node, messageId: 'forbiddenDomePackage', data: { module: src } });
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
        const a = node.arguments[0];
        if (!a || a.type !== 'Literal' || typeof a.value !== 'string') return;
        if (FORBIDDEN.has(a.value) || a.value.startsWith('bun:')) {
          context.report({ node, messageId: 'forbidden', data: { module: a.value } });
          return;
        }
        if (DOME_NODE_ONLY.test(a.value)) {
          context.report({ node, messageId: 'forbiddenDomePackage', data: { module: a.value } });
        }
      },
    };
  },
};
