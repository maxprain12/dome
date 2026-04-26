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
    },
    schema: [],
  },
  create(context) {
    // Alineado con .github/workflows/ci.ts architecture-check (mejora: bloquea imports explícitos
    // de módulos que no deben usarse nunca en el renderer; path/os a veces se resuelven a shims
    // en Vite — migrar a utilidades puras con el tiempo).
    const FORBIDDEN = new Set(['fs', 'node:fs', 'better-sqlite3']);

    return {
      ImportDeclaration(node) {
        const src = node.source && node.source.value;
        if (typeof src !== 'string') return;
        if (FORBIDDEN.has(src) || src.startsWith('bun:')) {
          context.report({ node, messageId: 'forbidden', data: { module: src } });
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
        const a = node.arguments[0];
        if (!a || a.type !== 'Literal' || typeof a.value !== 'string') return;
        if (FORBIDDEN.has(a.value) || a.value.startsWith('bun:')) {
          context.report({ node, messageId: 'forbidden', data: { module: a.value } });
        }
      },
    };
  },
};
