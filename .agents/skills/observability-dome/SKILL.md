---
name: observability-dome
description: Consultar señal local (OTLP/Vector) cuando el stack de docs/observability está levantado; plantillas de preguntas para agentes.
---

# Observability (Dome, local)

## Cuándo usar

- Después de añadir export OTLP o logs estructurados en `electron/`.
- Para correlacionar un fallo con un flujo (recurso, IPC, ruta UI).

## Pasos

1. Confirmar que el operador haya levantado el stack documentado en `docs/observability/README.md`.
2. Preguntar con ventana temporal: *últimos 5 min, dominio=resources, nivel error*.
3. Si solo hay `console` en el main, agregar poco a poco campos `domain`, `channel`, `durationMs` en un único módulo de log.

## Límites

- No asumir Victoria/LogQL en CI; el valor está en *dev* con el compose que elija el equipo.
