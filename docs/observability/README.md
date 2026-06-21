# Observabilidad local (opcional)

- **Objetivo**: ofrecer señal estructurada (OTLP) para agentes en desarrollo, alineado con el bucle *query → razonar → arreglar* del post de Codex.
- **Contenedor** (opcional): si tienes `docker-compose.yml` y `vector.yaml` bajo `docs/observability/`, ajústalos a tu entorno; no hay un único despliegue obligatorio en CI.
- **Siguiente paso** típico: añadir export OTLP desde el proceso main (Node) o desde un *bridge* IPC que reenvíe eventos.

## Crash trace (main process, debug)

Para diagnosticar cierres inesperados (~30–90 s tras abrir), Dome incluye un tracer ligero en `electron/core/crash-tracer.cjs` (no requiere stack OTLP).

**Activación** (cualquiera):

- `DOME_CRASH_TRACE=1`
- `DOME_PROFILE=<nombre>` (perfil aislado de userData)
- `NODE_ENV=development` (`pnpm run electron:dev`)

**Salida**: `~/Library/Application Support/Dome/logs/crash-trace.jsonl` (o `Dome-wt-<profile>/logs/` con perfil).

**Qué registra**:

- Breadcrumbs de ciclo de vida (`will-quit`, `render-process-gone`, señales)
- Cada `setTimeout` / `setInterval` / `setImmediate` al **disparar**, con stack de quien lo programó
- Entrada `kind: "fatal"` con buffer completo + timers pendientes en `uncaughtException` / `unhandledRejection`

**Reproducir crash en app empaquetada**:

```bash
DOME_CRASH_TRACE=1 /Applications/Dome.app/Contents/MacOS/Dome
# o perfil aislado:
DOME_PROFILE=crash-debug pnpm run electron:dev
```

Tras el cierre, revisa las últimas líneas de `crash-trace.jsonl` y correlaciona con `dome-main.log`. La línea `fatal` incluye el timer/stack que disparó justo antes del abort.

Desactivar explícitamente: `DOME_CRASH_TRACE=0`.
