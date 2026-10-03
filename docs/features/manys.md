# Many’s

Many’s reúne colaboradores cloud en una pestaña de Dome. Abrir uno es una conversación: el agente decide cómo trabajar. Contexto y recurrencias no son la pantalla principal; se abren desde el encabezado. Una pregunta o una aprobación pendiente aparece en el hilo. El ordenador se abre al lado y el Many local sigue disponible.

Una tarea enviada se guarda en Provider antes de aparecer como aceptada. El request key se conserva si se pierde la respuesta, y los borradores sobreviven al cierre de la pestaña. Detener respuesta pausa la tarea y libera su intento; cancelar la tarea registra una cancelación durable. Esperar datos o aprobación también libera capacidad.

El usuario selecciona proyectos, recursos y capacidades. Compartir un recurso no comparte el resto del proyecto. Todas las búsquedas, lecturas, blobs y escrituras del runtime pasan por el adaptador del vault. Las propuestas de escritura que parten de una revisión antigua se conservan para revisión en Many’s.

El ordenador se abre junto a la conversación. Tomar control pausa y fencea al agente; el usuario puede navegar, escribir y ejecutar comandos. Devolverlo exige una captura nueva antes de reanudar tareas. Los archivos se publican como recursos de la biblioteca; las tarjetas guardan IDs, no URLs temporales.

## Código

- `app/components/manys/`: interfaz y revisiones.
- `app/lib/manys/api.ts`: cliente IPC e idempotencia de envío.
- `electron/ipc/agents/manys.cjs`: proxy OAuth sin exponer credenciales al renderer.
- `electron/agents/manys-client.cjs`: herramientas del Many local y delegación de pipelines.
- `packages/manys-runtime/`: harness portable, protocolo 1.
- Provider `lib/manys/`: contratos, repositorios, créditos, vault, ejecución y gateway.

[Plan versionado](../../plans/active/2026-10-03-manys-v1.md). La infraestructura se prepara con la guía `docs/manys.md` de Provider.
