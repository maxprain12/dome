# KB LLM: unificación UX (Learn, Studio, Runs, enlaces)

Este documento alinea la experiencia de usuario con el pipeline **raw → wiki → Q&A → outputs** descrito en la estrategia KB.

## Ajustes (activación global y por proyecto)

En **Ajustes → Knowledge Base** puedes activar el modo KB LLM global, intervalos de compilación/salud, reindexado automático y sincronizar las automatizaciones. La misma pantalla incluye el bloque **Qué debes saber** (cuándo encaja, cuándo no, limitaciones). En **Proyectos**, cada fila tiene un selector **KB LLM** (heredar / forzar activado / forzar desactivado) y una línea de ayuda bajo el control.

## Pestañas del shell


| Pestaña         | Contenido                                                 | Rol en el pipeline                                                          |
| --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Learn**       | Espacio de estudio: Studio outputs, flashcards, decks     | Consume y organiza **outputs** (mindmaps, guías, tablas, etc.).             |
| **Studio**      | Alias de Learn con sección enfocada en contenido generado | Abre el mismo `LearnPage` con vista inicial útil para inspeccionar outputs. |
| **Flashcards**  | Alias de Learn enfocado en decks                          | Acceso rápido a repetición espaciada ligada al corpus.                      |
| **Runs**        | Registro de ejecuciones de agentes/workflows              | Trazabilidad de **compilación** y **lint** automatizados.                   |
| **Automations** | Reglas programadas o contextuales                         | Dispara compilación incremental o health checks.                            |


Implementación: `[app/components/shell/ContentRouter.tsx](../app/components/shell/ContentRouter.tsx)` mapea `studio` y `flashcards` a `LearnPage` vía `[LearnTabShell](../app/components/learn/LearnTabShell.tsx)`.

## Enlaces

- **Chat / MarkdownRenderer**: soporta `[[wiki]]` y enlaces `dome://resource/...` — ideal para respuestas de agentes.
- **Editor de notas (Tiptap)**: las convenciones de wikilink pueden diferir; para paridad total, priorizar enlaces `dome://` en contenido generado por agentes (ver instrucciones en `AgentChatView`).
- **Backlinks**: panel lateral en workspace — útil para navegar la wiki compilada.

## Flujo recomendado para el usuario

1. Ingesta en **Library** (recursos raw con `dome_kb.wikiRole: "raw"` cuando aplique).
2. Ejecutar agente de compilación (chat o automation) usando `[prompts/kb-wiki-compile.md](../prompts/kb-wiki-compile.md)`.
3. Revisar **Runs** si la tarea fue programada.
4. Abrir **Learn** o **Studio** para outputs; archivar outputs relevantes de vuelta al wiki (`wikiRole: "output"`).
5. Ejecutar **health** (`[prompts/kb-wiki-health.md](../prompts/kb-wiki-health.md)`) de forma periódica.

## Mejoras futuras (no bloqueantes)

- Unificar resolución de `[[título]]` en el visor de notas como en el chat.
- Deep link único "Abrir pipeline KB" que active Learn + proyecto + filtro por `topicId`.

