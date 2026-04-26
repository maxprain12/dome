# Principios de ingeniería (golden principles)

Cada regla tiene un id **P-NNN** que linters, CI y el auditor pueden citar en mensajes de error. Detalle y motivación: [architecture/boundaries.md](./architecture/boundaries.md).

| ID     | Título (resumen) |
| ------ | ---------------- |
| P-001  | El renderer nunca importa módulos Node/DB |
| P-002  | Validar argumentos IPC en el límite (schemas; ver Zod) |
| P-003  | Logs estructurados en main; evitar `console.log` ruido en producción |
| P-004  | i18n: textos de UI en en/es/fr/pt en `app/lib/i18n.ts` |
| P-005  | Colores con variables CSS, no hex literales en estilos |
| P-006  | Imports de solo tipo: `import type { … }` (verbatimModuleSyntax) |
| P-007  | Preferir utilidades compartidas a helpers duplicados |
| P-008  | Planes de trabajo no triviales en `docs/plans/active/` (versionado) |
| P-009  | Política de merge con alto caudal (flaky, fix-forward, PRs pequeños) |
| P-010  | Embeddings: prefijos y modelo solo en el servicio documentado (Nomic) |

## P-001 — Renderer nunca importa módulos Node/DB

En `app/` no se importan `better-sqlite3`, `node:fs`, `electron` (renderer), `child_process`, etc. Toda I/O pasa por `window.electron.invoke(...)` y handlers en `electron/ipc/`.

Cumplimiento: ESLint `dome/no-renderer-node-imports` (fs / `node:fs` / `better-sqlite3` / prefijo `bun:`) + job `architecture-check` en CI (`grep` adicional).

## P-002 — Validar formas de datos en el límite IPC

Cada `ipcMain.handle` debe validar o tipar de forma explícita los argumentos. Los módulos nuevos en `electron/ipc/*.cjs` con handlers deben usar **Zod** (o patrón documentado en `scripts/ipc-zod-legacy.txt` solo para herencia).

## P-003 — Logs estructurados en el main process

En procesos con acceso a Node, priorizar log estructurado o prefijos de dominio; `console.log` masivo dificulta el razonamiento de agentes y observabilidad.

## P-004 — i18n

Cualquier cadena visible al usuario pasa por `t('…')` y entradas en **cuatro** idiomas en `app/lib/i18n.ts`.

## P-005 — Colores

Solo `var(--…)`; ver `.claude/rules/new-color-palette.md` y excepciones en `app/globals.css`.

## P-006 — Type-only imports

Con `verbatimModuleSyntax: true`, los tipos se importan con `import type`.

## P-007 — Utilidades compartidas

No duplicar el mismo helper en múltiples sitios: extraer a `app/lib/utils/` o similar.

## P-008 — Planes versionados

Cambios complejos: plan en `docs/plans/active/<slug>.md` con frontmatter, antes o durante la implementación.

## P-009 — Política de merge con alto caudal

- Tests **flaky**: preferir reintentos acotados en CI frente a bloqueo indefinido mientras haya tarea de estabilización en curso.
- **Fix-forward** cuando el coste de revertir supera el de un parche pequeño y seguro.
- PRs pequeños y revisables (orientativo **&lt;200 LOC**) para `auto-merge` y revisión de agente.
- Etiquetar o documentar casos `@flaky` con un máximo de reintentos (p. ej. 3) acordado con CI.

## P-010 — Nomic / embeddings

No duplicar lógica de prefijos de tarea ni carga de modelo fuera de `electron/services/embeddings.service.cjs` (prefijos `search_document:` / `search_query:`).
