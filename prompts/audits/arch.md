---
name: audit-arch
description: Arquitectura — capas, dependency-cruiser, boundary P-001.
version: 1
focus: arch
last_updated: 2026-04-27
---

> **Context:** `prompts/shared/project-context.md`, `docs/architecture/layers.md`, `.dependency-cruiser.cjs`.

## Focus: Architecture

1. Ejecuta `npm run depcruise` y **no** propongas silenciar reglas salvo con ADR.
2. Revisa que no existan imports de `app/` a `electron/` o `better-sqlite3` vía ruta indirecta.
3. Confirma el architecture guard de CI: `grep` en `app/` no debe listar módulos prohibidos; si el proyecto usa ESLint `dome/no-renderer-node-imports`, alinea el mensaje con P-001.
4. IPC nuevo: comprobar `electron/preload.cjs` y registro en `index.cjs` (SOP new-ipc).

### Tool use

- `npm run typecheck` / `npm run lint` / `npm run depcruise`
- `npm run check:ipc-inventory` si el cambio toca canales

### Deliverable

Un PR con arreglos mecánicos; hallazgos con rutas reales y patrones `grep`ables.
