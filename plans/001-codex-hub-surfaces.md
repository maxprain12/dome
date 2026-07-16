# Plan 001 — Lenguaje visual Codex para hubs

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** M  
**Depende de:** —

## Objetivo

Definir y materializar un kit de superficies compartidas (rail, surface, group, row, search-in-rail, hub header) para que Email, GitHub, Social, Marketplace y Settings compartan el mismo lenguaje visual Codex: limpio, claro, minimalista.

## Drift check

Inventariar:

- [`app/components/settings/blocks.tsx`](../app/components/settings/blocks.tsx) — `SettingsSurface` / `SettingsGroup` / `SettingsRow`
- [`app/components/settings/SettingsShell.tsx`](../app/components/settings/SettingsShell.tsx) — rail + search
- [`app/globals.css`](../app/globals.css) — tokens `--background`, `--card`, `--muted`, `--sidebar*`, `--radius`
- Hubs actuales: Email, GitHub, Social, Marketplace (densidad, headers, cards sueltas)

Comparar con el look Settings WIP: rail ~15rem, labels uppercase muted, filas `rounded-xl border bg-card`, contenido centrado `max-w-*`.

## Diseño destino

Extraer (o generalizar sin romper Settings) composiciones en `app/components/shared/` o `app/components/hub/`:

| Pieza | Rol |
|-------|-----|
| `HubShell` | Layout rail opcional + main scroll |
| `HubHeader` | Título, subtítulo, acciones (Crear / refresh) |
| `HubSearch` | InputGroup search en rail o bajo header |
| `HubSurface` / `HubGroup` / `HubRow` | Equivalente a Settings blocks, reutilizable |
| `HubSectionLabel` | Uppercase 10–11px muted |
| `InstallCard` | Card catálogo: icono, título, descripción, CTA Instalar |

No crear un “UniversalHub” que mezcle datos de dominios. Solo chrome visual.

## Implementación

1. Extraer primitivos de `blocks.tsx` a un módulo compartido (`hub/` o renombrar a `Surface`/`Group`/`Row` genéricos) y hacer que Settings reexporte o consuma lo mismo.
2. Documentar en el plan de consumo (y opcionalmente comentario en módulo) espaciado, tipografía y cuándo usar Card vs Row.
3. Añadir `InstallCard` mínimo (props: icon, title, description, actionLabel, onAction) para Marketplace (013).
4. Verificar tokens: cero hex inline; `check:design-system` limpio en archivos tocados.
5. No rediseñar aún Email/GitHub/Social/Marketplace — solo el kit. Esos son 010–013.

## Validación

- Settings sigue renderizando igual (smoke visual / snapshot mental de filas).
- Typecheck + lint en archivos nuevos.
- Ningún consumidor nuevo obligatorio fuera de Settings en este PR.

## Criterios de aceptación

- Kit importable desde hubs futuros.
- Settings usa el mismo kit (sin duplicar CSS paralelo).
- Documentado en README de plans / comentario de módulo qué pieza usar dónde.

## STOP conditions

Detener si generalizar `blocks.tsx` rompe deep links o tests de registry de Settings. En ese caso: copiar patrones a `hub/` sin tocar Settings y alinear en 002.

## Mantenimiento

Cualquier hub nuevo debe usar Hub* / Surface* antes de inventar otra card con border ad-hoc.
