# T03 — Errores de tools/runs visibles para el usuario

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: M · **Área**: Observabilidad / UX

## Problema

Los errores del main process (fallo de una tool, run que muere, migración con problema, proveedor LLM que rechaza la clave) acaban en `console.error` del main, que el usuario nunca ve. Síntomas típicos: un run que aparece "colgado" o terminado sin resultado, una automation que falla en silencio cada noche, transcripción que no llega — sin ninguna pista en la UI de por qué.

## Qué hay que hacer

1. **Inventario de caminos de error silencioso**: revisar dónde los handlers devuelven `{ success: false, error }` y el renderer lo ignora o lo traga (`catch` vacíos: `grep -rn "catch" app/lib/ --include='*.ts' | grep -i "// \|{}"` y muestreo), y dónde el main loguea sin notificar.
2. **Canal de notificación de errores**: evento `system:error-notification` (main → renderer, broadcast vía `windowManager`) con `{ severity, scope, message, detail?, runId? }`. En el renderer, un listener global lo muestra como toast/notificación (usar el sistema de notificaciones existente de Mantine si ya se usa, o el patrón que haya).
3. **Conectar las fuentes de mayor dolor**:
   - Runs/automations fallidos → toast + estado de error claro en `RunLogView.tsx` con el mensaje del error (no solo "failed").
   - Errores de proveedor LLM (clave inválida, rate limit, modelo inexistente) → mensaje específico en el chat donde ocurrió, con acción ("revisar settings de IA").
   - Fallos de indexación/embeddings y de cloud-sync → indicador no intrusivo (badge en settings o status bar) en vez de silencio.
4. **Mensajes accionables**: mapear los errores comunes a textos i18n con causa+acción (4 idiomas), no volcar stack traces al usuario. El detalle técnico va al log ([T02](T02-logging-estructurado.md)) y a un "ver detalles" expandible.
5. No sobre-notificar: errores repetidos del mismo scope se agrupan (throttle por scope, p. ej. 1 toast/minuto) — una automation rota no debe generar 50 toasts.

## Criterios de aceptación

- [ ] Matar una tool a propósito (clave inválida, URL inexistente) produce feedback visible y entendible en la UI.
- [ ] Una automation fallida se distingue en la Runs UI con su motivo.
- [ ] Los toasts de error están traducidos y con acción cuando aplica.
- [ ] Errores repetidos se agrupan en vez de inundar.

## Riesgos / notas

- Requiere el canal nuevo en `ALLOWED_CHANNELS` de `preload.cjs` y registro en `electron/ipc/` (seguir `.claude/sops/new-ipc-channel.md`).
- Coordinar con [T02](T02-logging-estructurado.md): el mismo evento que se loguea es el que se notifica — una sola fuente.
