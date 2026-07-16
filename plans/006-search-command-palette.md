# Plan 006 — Buscador vitaminado (⌘K)

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** L  
**Depende de:** 005

## Objetivo

Extender Command Palette para mostrar grupos por fuente (resources, issues, email, people, social) con deep-links a las tabs correctas.

## Drift check

- [`app/components/search/CommandPalette.tsx`](../app/components/search/CommandPalette.tsx)
- [`useCommandPaletteSearch.ts`](../app/components/search/) — `db:search:unified` + hybrid re-rank
- [`commandPaletteNav.tsx`](../app/components/search/) — nav estática a GitHub/Email (no search)
- Tipos en `commandPaletteTypes.ts`

## Diseño destino

Secciones en resultados:

1. Navegación / acciones (como ahora)
2. Resources
3. People
4. GitHub issues
5. Email
6. Social posts

Cada item: icono de dominio, título, snippet, Enter → `openGitHubTab` / `openEmailTab` / resource / person inspector.

Empty state por sección si no hay hits (no mostrar sección vacía).

## Implementación

1. Tipar respuesta unified search multi-kind (005).
2. Actualizar `useCommandPaletteSearch` para mapear kinds → filas UI.
3. Preview opcional (issue title/state; email from/subject).
4. i18n labels de sección.
5. Keyboard: flechas atraviesan secciones.

## Validación

- Playwright o test unit del mapper de resultados.
- Smoke ⌘K con fixtures mock IPC.

## Criterios de aceptación

- Buscar un issue conocido abre GitHub en contexto.
- Buscar un person muestra identities.
- Sin regresión en nav estática.

## STOP conditions

Si 005 aún no expone un kind, no inventar queries live IMAP/GitHub en la palette (latencia). Esperar índice.

## Mantenimiento

Nuevo kind → fila en mapper + i18n + deep-link helper en tab store.
