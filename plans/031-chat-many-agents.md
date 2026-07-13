# Plan 031 — Chat, Many, agentes y equipos

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–028

## Objetivo

Unificar todas las conversaciones en un sistema visual y de interacción basado en shadcn, manteniendo runtimes, streaming, tools, adjuntos, menciones y modelos de datos actuales. Many será una sidebar derecha, no una tercera variante de chat.

## Drift check

Inventariar `chat`, `AgentChat`, Many, agent-team, composer, message parts, tool calls, stores y eventos de streaming. Registrar todas las variantes antes de sustituirlas.

## Arquitectura destino

- Primitivas compartidas: `MessageScroller`, `Message`, `MessageBubble`, `MessageAttachment`, `MessageMarker`, `ToolCall`, `Composer`.
- Un único composer con `InputGroupTextarea`, attachments, modelo/contexto y submit/cancel.
- Many: panel derecho `Resizable` con `Tabs` Conversation/History/Context; en estrecho `Sheet`.
- Fullscreen/popout consumen el mismo view-model, no copias del componente.

## Implementación

1. Congelar mediante tests streaming incremental, autoscroll, stop, retry, edición, tools, adjuntos, menciones, historial y selección de agente/equipo.
2. Diseñar tipos de presentación discriminados sobre los eventos existentes; preservar payloads y orden.
3. Componer mensajes con `ScrollArea`, `Avatar`, `Badge`, `Button`, `DropdownMenu`, `Collapsible`, `Alert`, `Skeleton`, `Tooltip` y Hugeicons.
4. Consolidar composers y sus atajos; usar `Field` para errores y estado, `Popover + Command` para menciones/modelo y `InputGroup` para acciones.
5. Montar Many en la sidebar derecha definida por 027. Compartir su view-model entre docked, Sheet y fullscreen; eliminar layouts legacy al quedar sin consumidores.
6. Rehacer AgentChat y Team con las mismas primitivas; representar delegación/tool activity como contenido estructurado, no burbujas especiales ad hoc.
7. Motion: entrada solo de mensajes ya completos con opacity/transform breve; streaming sin animar cada token; scroll instantáneo en reduced motion; cursores/typing sin layout animation.
8. Asegurar live regions discretas, foco estable y nombres accesibles en acciones icon-only.

## Validación

Tests unitarios de normalización y composer; renderer tests de streaming/autoscroll/tools; Playwright de conversación, Many docked/Sheet y teclado. Ejecutar typecheck, lint, build, IPC inventory y depcruise.

## Criterios de aceptación

Una implementación de mensajes y una de composer sirven chat, Many, agentes y equipos; no se pierden eventos; Many ocupa únicamente la sidebar derecha; reduced motion y lectores de pantalla no reciben ruido por token.

## STOP conditions

No normalizar payloads del runtime/IPC ni eliminar un renderer de message part desconocido. Detener si hay eventos sin mapping y documentarlos.

## Mantenimiento

Exigir que nuevos message parts implementen el union compartido, estado accesible y tests de streaming.
