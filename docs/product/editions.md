---
status: active
created: 2026-08-21
domain: product
---

# Ediciones Dome

Un runtime, tres ediciones. El catálogo en código (`app/lib/editions/catalog.ts`) es la fuente de verdad de nav, módulos y soul de Many. Este documento es el contrato de control: dueño, DoD y freeze.

Default: **`pro`**. Persistencia: setting `user_role` (id de edición). Roles legacy `developer` → `dev`, `research` / `generalist` → `pro`.

## Matriz módulo → edición

`library` (Home) es de plataforma y no es toggleable.

| Módulo | Pro | Study | Dev | Estatus |
| --- | --- | --- | --- | --- |
| Biblioteca / ingest / Many | sí | sí | sí | core |
| Proyectos | sí | sí | sí | core |
| Personas + leads | sí | no | no | edition Pro |
| Email | sí (canal) | no | no | edition Pro |
| Social | sí (canal) | no | no | edition Pro |
| Learn / Studio / flashcards | no | sí | no | edition Study |
| Calendario | no (opt-in) | sí | no | edition |
| GitHub | no (opt-in) | no | sí | edition Dev |
| Automatizar (`agents`) | sí (secundario) | no | sí | platform |
| Pipelines / workflows / automations / runs | opt-in | no | opt-in | platform |
| Marketplace | fondo | fondo | fondo | platform |
| Tags | opt-in | opt-in | opt-in | platform |
| Pets / citation-APA como hero | — | — | — | archived (settings) |

## Nav por defecto (orden)

Tras aplicar la edición, la sidebar primaria debe coincidir con `NAV_ITEM_ORDER` ∩ módulos on + `library`.

- **Pro:** Home, Proyectos, Personas, Correo, Social, Agentes, Marketplace
- **Study:** Home, Proyectos, Calendario, Learn, Marketplace
- **Dev:** Home, Proyectos, GitHub, Agentes, Marketplace

Pipelines, workflows, automations, runs, calendar (Pro), github (Pro), people (Study/Dev) y learn (Pro/Dev) se pueden reactivar en Ajustes → Funciones. No se borra código.

## DoD por edición

Cada PR que toque un módulo de edición debe pasar el smoke de nav: `app/lib/editions/catalog.test.ts` (visibilidad por edición). Manual: arrancar, elegir la edición, Many abre, la nav coincide con la tabla.

Cambiar de edición en Ajustes reaplica nav y soul; **no borra** biblioteca ni personas.

## Freeze windows

- Un PR de Learn/Studio/flashcards no entra en el copy ni la nav default de **Pro**. Vive en Study.
- Social editorial / event cards: solo si alimentan **Personas** o salen de **Documentos**. Si es un producto aparte, no merge a default Pro.
- Canvas / teams / workflows: profundidad de Automatizar, no homepage de Pro.
- Nada en `off` global sin edición dueña. Para retirar un módulo: estatus `archived` aquí, con fecha y motivo — no un flag huérfano.

## Builds

Hoy: un Electron. Mañana (solo si se vende sola): `VITE_DOME_EDITION=pro|study|dev` para el nombre del installer. No forks ni tres runtimes.

## Migración de roles

| `user_role` antiguo | Edición |
| --- | --- |
| `pro` | pro |
| `study` | study |
| `dev` / `developer` | dev |
| `research` / `generalist` | pro |
| (vacío) | no se fuerza; default de onboarding = pro |
