# Plan 011 — Tab GitHub Codex

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Depende de:** 001

## Objetivo

Rediseñar el hub GitHub (repos, issues, kanban, detalle) con lenguaje Codex, preservando sync bidireccional y mentionables para Many (007/008).

## Drift check

- [`app/components/github/`](../app/components/github/) — GitHubView, Kanban, IssueDetailPanel, MentionTextarea
- Sync: [`electron/github/github-sync-service.cjs`](../electron/github/github-sync-service.cjs)
- Docs: [`docs/features/github-sync.md`](../docs/features/github-sync.md)
- Plan viejo 036 (borrado) era UI shadcn batch — este plan es Codex hub completo

## Diseño destino

- HubHeader: repo Combobox, sync status, New issue
- Tabs: Issues | Board | Milestones | Releases (según lo existente)
- Lista: DataTable / HubRow; detalle Sheet
- Densidad alta pero aire Codex (whitespace en chrome, no en cada celda)

## Implementación

1. Aplicar kit 001 al chrome; no reescribir lógica de sync.
2. Unificar loading/empty/error.
3. Sheet detalle issue; Dialog crear; AlertDialog destructivo.
4. Exponer mentionables ya existentes a consumers Many (documentar IPC).
5. i18n + Hugeicons.
6. Deep-link desde palette (006) a issue id.

## Validación

- Smoke: list, open issue, sync now.
- Typecheck, lint.
- No regresiones en move/kanban DnD.

## Criterios de aceptación

- Auth/repo context intactos.
- UI coherente con Email/Social Codex.
- Mentionables siguen disponibles.

## STOP conditions

Detener si un cambio de UI exige alterar formato persistido de issues o política local-dirty-wins.

## Mantenimiento

Adapters API separados de view-models; no UniversalHub con Social.
