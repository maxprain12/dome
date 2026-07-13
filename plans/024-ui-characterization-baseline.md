# Plan 024: Establecer el contrato de interacción del renderer antes del rediseño

> **Executor instructions**: ejecuta cada paso y no cambies presentación de producción. Si un flujo actual no puede caracterizarse sin modificar su comportamiento, detente y repórtalo.
>
> **Drift check**: `git diff --stat b500063c..HEAD -- package.json app/ electron/ .github/workflows/ci.yml`

## Status

- **Execution**: DONE
- **Priority**: P0 | **Effort**: L | **Risk**: LOW
- **Depends on**: none
- **Category**: tests / redesign prerequisite
- **Planned at**: `b500063c`, 2026-07-13

## Why this matters

El rediseño reemplazará shell, navegación, overlays y todas las superficies visuales. Actualmente no hay `*.test.*` o `*.spec.*` bajo `app/`; los scripts de `package.json:42-76` cubren principalmente Electron, servicios y agent-core. Sin caracterización, una interfaz visualmente correcta puede romper tabs, atajos, deep links, streaming, HITL o mutaciones sin señal de CI.

## Current state

- `app/components/shell/AppShell.tsx:115-399` concentra eventos globales, persistencia de paneles e aislamiento de proyectos.
- `app/components/shell/DomeTabBar.tsx:323-381` implementa Cmd/Ctrl+Tab, Cmd/Ctrl+W, 1–9 y roving focus.
- `app/pages/SettingsPage.tsx:56-143` resuelve aliases, eventos y secciones.
- `app/components/agents/AgentChatView.tsx:619-708` contiene streaming, scroll, abort y HITL.
- No se debe reemplazar Jest/Vitest de paquetes existentes; añade una configuración renderer acotada.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm run typecheck` | exit 0 |
| Lint | `pnpm run lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |
| Architecture | `pnpm run depcruise` | 0 violations |
| UI tests | `pnpm run test:ui` | all pass |
| Electron smoke | `pnpm run test:e2e:electron` | all pass |

## Scope

**In scope**: `package.json`, lockfile, renderer test config/setup, `app/**/*.test.tsx`, Electron E2E harness, CI job.  
**Out of scope**: cambios visuales, lógica productiva, contratos IPC, snapshots masivos de HTML.

## Steps

1. Añade Vitest + Testing Library + user-event + jest-dom para renderer, reutilizando las versiones del workspace cuando existan. Configura alias `@`, jsdom y mocks explícitos de `window.electron`; no simules resultados que el test no afirme.
2. Añade helpers de test para Zustand, i18n en cuatro idiomas y preload. Restaura stores y listeners después de cada test.
3. Caracteriza `AppShell`, `DomeTabBar`, sidebar efectivo, `ContentRouter` y `SettingsPage`: activar/cerrar tabs, atajos, cambio de proyecto, panel izquierdo/derecho, aliases y navegación externa a Settings.
4. Caracteriza overlays: focus inicial, Escape, click outside, retorno de focus y confirmación destructiva.
5. Caracteriza flujos críticos: proyecto create/delete, búsqueda por teclado, chat send/abort/HITL, run detail, deck edit/study, viewer toolbar, evento de calendario, email select/compose, pipeline detail y cloud import.
6. Añade Playwright Electron (o el runner Electron ya adoptado por el repo si aparece durante drift) para un smoke test por dominio. Usa `DOME_PROFILE` aislado y fixtures temporales; nunca la base de datos real del usuario.
7. Integra `test:ui` y `test:e2e:electron` en CI antes de los planes visuales.

## Test plan

- Tests de comportamiento, no snapshots completos: rol/nombre, estado de stores, evento emitido y foco.
- Casos mínimos: happy path, error visible, Escape, teclado, ventana estrecha y `prefers-reduced-motion`.
- Cada dominio posterior debe ampliar estos tests antes de borrar su UI anterior.

## Done criteria

- [ ] `find app -name '*.test.tsx' | wc -l` devuelve al menos 12
- [ ] `pnpm run test:ui` y `pnpm run test:e2e:electron` salen 0
- [ ] CI ejecuta ambos comandos
- [ ] Ningún archivo visual productivo cambió
- [ ] Gates de repo salen 0

## STOP conditions

- El runner requiere desactivar `contextIsolation` o `sandbox`.
- Los tests necesitan usar datos del perfil real.
- Un contrato actual es ambiguo entre sidebar, tab store y router: documenta la ambigüedad antes de fijarla en un test.

## Maintenance notes

Estos tests son la especificación funcional del rediseño. Un executor posterior puede cambiar markup, pero no debe alterar el resultado observable sin actualizar explícitamente este contrato.
