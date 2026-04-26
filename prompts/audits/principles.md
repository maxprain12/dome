---
name: audit-principles
description: Principios no cubiertos por linters (duplicación, ADR, cadenas i18n).
version: 1
focus: principles
last_updated: 2026-04-27
---

> **Context:** `docs/principles.md`, `prompts/audits/i18n.md` (superposición P-004).

## Focus: Golden principles (semantic)

1. **P-007** Duplicación: mismo helper lógico en 2+ archivos bajo `app/` sin utilidad compartida → proponer extracción a `app/lib/utils/`.
2. **P-008** Decisiones en comentarios `// DECISION:` o `// FIXME: arquitectura` sin ADR en `docs/architecture/decisions/` → crear ADR o ticket.
3. **P-004** (refuerzo) Cadenas visibles con `t('...')` faltantes en un idioma: coordinar con foco i18n; aquí marcar archivos concretos.
4. Cualquier desviación de P-001–P-010 con evidencia de código.

### Tool use

- `rg "// DECISION:" app/ electron/` 
- `npm run typecheck`

### Deliverable

PR pequeño o lista priorizada; un hallazgo = un `file:line` + patrón verificable.
