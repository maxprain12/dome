# T02 — Logging estructurado en el main process

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: M · **Área**: Observabilidad
**Estado**: ✅ Implementada (2026-06-10) — `electron/core/logger.cjs`: JSON-lines con niveles (debug gated por `DOME_LOG_LEVEL`/`DEBUG`), **archivo en `<userData>/logs/dome-main.log` con rotación** (5MB × 3, init lazy y seguro fuera de Electron), **redacción de secretos** (campos key/token/secret/password/authorization + valores `sk-*`/`Bearer`), truncado de strings largas, y serialización a prueba de circulares. Conectado a `process.on('uncaughtException'/'unhandledRejection')` en `main.cjs`. Tests `logger.test.mjs` 4/4 ✓ en `test:security`. Pendiente menor: migración oportunista del resto de `console.*` por módulo y botón "abrir carpeta de logs" en settings (helper `getLogDirectory()` ya exportado).

## Problema

El logging del main es `console.log/error` ad-hoc: 46 llamadas solo en `electron/tools/ai-tools-handler.cjs`, strings sin formato común, sin niveles, sin contexto (runId, tool, canal IPC) y sin persistencia/rotación. Cuando un usuario reporta "se quedó colgado", no hay nada que mirar. Langfuse/LangSmith (`electron/core/observability.cjs`) cubren tracing de LLM, no logs operacionales.

## Qué hay que hacer

1. **Logger central** `electron/core/logger.cjs`:
   - API: `logger.child({ scope: 'run-engine' }).info('run started', { runId })` — niveles debug/info/warn/error, salida JSON-lines.
   - Destinos: consola en dev (pretty), archivo en userData (`logs/dome-main.log`) siempre, con rotación (5MB × 3 archivos). `electron-log` ya resuelve archivo+rotación y es estándar en Electron — usarlo como backend en vez de reinventar.
   - **Masking**: nunca loguear API keys, tokens ni contenido completo de mensajes (reutilizar los helpers de masking de `observability.cjs`).
2. **Migración por módulos**, empezando por los de más valor diagnóstico: `agent-runtime.cjs`, `run-engine.cjs`, `tool-dispatcher.cjs`/`ai-tools-handler.cjs` (incluir nombre de tool y duración en cada ejecución), handlers IPC con error, `database.cjs` (migraciones), `update-service.cjs`.
3. **Contexto correlacionable**: toda línea de un run lleva `runId`; toda línea de tool lleva `tool` + `runId`. Es lo que permite reconstruir un run fallido.
4. **Captura global**: `process.on('uncaughtException'/'unhandledRejection')` → logger.error + (decidir) diálogo/notificación según gravedad. Verificar qué hace hoy `electron/core/init.cjs` y consolidar.
5. **Acceso para soporte**: entrada en Settings → "Abrir carpeta de logs" (canal IPC tipo `shell:openPath` ya existente o nuevo `system:openLogs`).

## Criterios de aceptación

- [ ] `logs/dome-main.log` existe, rota, y contiene JSON-lines con timestamp/nivel/scope.
- [ ] Un run fallido se puede reconstruir desde el log con su `runId` (inicio, tools con duración, error).
- [ ] Ninguna clave/token aparece en logs (grep de verificación con una clave de prueba).
- [ ] Botón en settings para abrir la carpeta de logs.

## Riesgos / notas

- No migrar los 46 console.* de golpe: logger primero, migración oportunista por módulo (cada PR que toque un archivo lo migra).
- Nivel por defecto `info`; `debug` activable con env (`DOME_LOG_LEVEL`) para no engordar el archivo.
