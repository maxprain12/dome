# Plan 007 — Sistema de menciones unificado

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** L  
**Depende de:** 003

## Objetivo

Extender `@` en Many y notas para mencionar **people** (y seguir permitiendo resources), con chips tipados y resolución a identities GitHub/email/social.

## Drift check

- Many: `@` resources, `/` skills, `#` MCP — pickers en [`ManyComposerPickers.tsx`](../app/components/many/composer/ManyComposerPickers.tsx), hooks `useResourceMention`, etc.
- Notas: `MentionHeaderInput` → `db:resources:searchForMention`
- GitHub UI: `MentionTextarea` + `github:issues:listMentionables` (solo issues, no Many)

## Diseño destino

Picker `@` unificado:

1. People (preferido si query parece handle/nombre)
2. Resources (como hoy)

Chip payload: `{ type: 'person'|'resource', id, label, identities? }`.

Al enviar a Many, el mensaje serializa menciones (p.ej. `[@label](person:id)`) y el system/tool context incluye identity map para el modelo.

## Implementación

1. IPC `people:search` (003) en el hook de menciones.
2. Unificar picker visual (Popover/Command, no portal manual — ver Component Lifecycle rules).
3. Chips en composer ([`ManyComposerChips.tsx`](../app/components/many/composer/ManyComposerChips.tsx)).
4. Notas: mismo search people+resources.
5. Markdown renderer: resolver `person:` links.
6. i18n empty/loading.

## Validación

- Test del ranking people vs resource.
- Typecheck.

## Criterios de aceptación

- Teclear `@max` sugiere person con identity github/email.
- Insertar chip no rompe send.
- Resource mention sigue funcionando.

## STOP conditions

No sustituir mentionables GitHub in-issue por people global sin mapear `source=github` identity; el editor de issues puede seguir usando API GitHub nativa.

## Mantenimiento

Nueva identity source → icono + label en chip.
