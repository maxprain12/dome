# Modos explícitos de Many

El selector de la persona define el modo del turno. El texto del modelo, una
lista numerada, la complejidad de la tarea o una oferta de planificación no
cambian el modo. También existen los comandos completos `/agent`, `/plan` y
`/draft`. El modo queda fijado al comenzar cada run y se guarda en su metadata.

| Modo | Resultado | Herramientas y transición |
| --- | --- | --- |
| Agent | Completa el trabajo autorizado y responde con resultados. | Política habitual de herramientas y aprobaciones. No crea artefactos de Plan por iniciativa propia. |
| Plan | Investiga y propone pasos ejecutables. | Lectura; cambios bloqueados. El plan listo permite Ejecutar, Mantener o Refinar. Ejecutar inicia un turno nuevo en Agent. |
| Draft | Prepara un borrador completo para revisar. | Lecturas disponibles; los cambios piden aprobación. Aprobar una acción no aprueba automáticamente la siguiente. Aceptar todas en Draft tiene su propio alcance. |

Pedir un esquema en Agent puede producir texto en el chat, pero no cambia el
modo ni crea el panel de Plan. Seleccionar Plan tampoco transforma respuestas
anteriores de Agent en planes. La UI conserva un plan generado explícitamente
para consultarlo, sin adjuntarlo a cada respuesta posterior. Los planes antiguos
sin procedencia se muestran al elegir Plan, pero no se infieren en Agent/Draft.

## Investigación de referencia — 1 de octubre de 2026

- [Pi: extensión oficial de ejemplo](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts): activa el modo mediante comando/atajo/flag, cambia herramientas, separa ejecución de planificación y retira contexto de Plan al salir. Dome conserva la separación y aplica sus propias restricciones; no copia el código del ejemplo.
- [Claude Code: modos de permisos](https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode): el modo Plan investiga y propone; la aceptación cambia el modo para ejecutar. Sus excepciones y configuración de shell son específicas de Claude y no se trasladan a Dome.
- [OpenCode: agentes](https://opencode.ai/docs/agents/#use-plan): distingue Build y Plan mediante controles del usuario y permisos. Dome conserva tres modos porque Draft añade una revisión de cambios que su producto necesita.
- [Codex: contrato de Plan](https://github.com/openai/codex/blob/main/codex-rs/collaboration-mode-templates/templates/plan.md): distingue el modo de colaboración de una lista de progreso. [Su contrato Default](https://github.com/openai/codex/blob/main/codex-rs/collaboration-mode-templates/templates/default.md) explicita que las instrucciones anteriores de Plan dejan de estar activas. Dome declara esa salida en cada turno Agent o Draft.

Decisión propia: aplicar el modo en instrucciones, oferta de herramientas,
control antes de ejecutarlas y presentación. Una instrucción al modelo por sí
sola no garantiza el comportamiento del runtime.

## Implementación

`shared/many-mode-policy.json` contiene las instrucciones y el inventario común
de operaciones que modifican datos. Se empaqueta con Electron y se importa en
el renderer y la extensión. Main añade las herramientas CMS y externas en el
límite de ejecución. Cada nueva herramienta con efectos debe actualizar este
inventario y las pruebas de modo.

Plan oculta operaciones de escritura, incluida memoria guardada, archivos,
contactos, entidades, investigación persistida, formularios del navegador y
subagentes capaces de cambiar datos. Las herramientas MCP sin clasificación de
solo lectura quedan fuera de Plan; Draft pide revisión antes de ejecutarlas.
Las lecturas pueden usar servicios de pago bajo la configuración y límites ya
existentes: seleccionar Plan no significa que una investigación sea gratuita.

El runtime reemplaza las instrucciones de modo conocidas sin borrar texto del
usuario. Su hook rechaza cambios en Plan incluso con `skipHitl` o una aprobación
anterior. Draft no hereda «aceptar todas» de Agent; su aprobación global tiene
un alcance propio. Al reanudar una acción aprobada, el hook sigue vigente para
las siguientes llamadas.

El artefacto se crea únicamente al finalizar correctamente un run con metadata
`agentMode: plan`. La vista no interpreta respuestas arbitrarias para crear
planes. Cambiar manualmente de modo cierra el panel y abandona el seguimiento de
ejecución; el botón Ejecutar activa ese seguimiento de forma explícita.

## Validación

Pruebas de transiciones, instrucciones sin duplicar, herramientas ocultas,
bloqueo de cambios en Plan, Draft con aprobaciones previas y nuevas acciones,
artefactos y respuestas ordinarias. La extensión comprueba que Agent no crea el
panel, que elegir Plan no recupera una respuesta vieja y que Ejecutar envía Agent.
No se necesitan sesiones personales ni llamadas reales a modelos para estos
contratos. La calidad de las respuestas de cada proveedor requiere evaluación
adicional con conversaciones reales autorizadas.
