---
name: audit-docs
description: Doc drift — coherencia entre docs/, AGENTS.md, package.json e inventario IPC.
version: 1
focus: docs
last_updated: 2026-04-27
---

> **Context:** `prompts/shared/project-context.md`, `AGENTS.md`, `docs/principles.md`.

## Focus: Documentation & registry

1. Ejecuta `npm run check:ipc-inventory` (o `npm run generate:ipc-inventory` y compara) — `docs/architecture/ipc-channels.md` debe listar los mismos `ipcMain.handle` / `ipcMain.on` que el código.
2. Busca enlaces rotos en `docs/**/*.md` (rutas a archivos que ya no existen tras moves a `docs/features/`).
3. `AGENTS.md`: versión de Electron y referencias a revisión de IA deben coincidir con `package.json` y con [ADR-0001](../../docs/architecture/decisions/0001-ai-review-on-vps.md) (ruta canónica en el clon: `docs/architecture/decisions/0001-ai-review-on-vps.md`).
4. `docs/principles.md`: cada P-NNN citado por un futuro linter debe existir; marcar TBD si el cumplimiento mecánico falta.
5. ADRs en `docs/architecture/decisions/`: frontmatter `status:`; `proposed` >30 días sin actualizar → hallazgo ⚠️.

### Tool use (antes de proponer parches)

- `npm run typecheck` en el repo.
- `grep -R "docs/[a-z]" docs/ --include='*.md'` para enlaces antiguos a raíz de `docs/` que deberían ser `docs/features/…`.

### Deliverable

Correcciones en PR; hallazgos con `file` en un `.md` de docs y `pattern` citable en la línea del diff.
