---
id: 0002
title: Estructura por capas en el renderer
status: proposed
date: 2026-04-27
---

# ADR-0002: Alinear el frontend con capas explícitas

## Contexto

El post de “engineering hardness” recomienda capas fijas (Types → Config → … → UI) y validación de dependencias para que los agentes no rompan bordes.

## Decisión (propuesta)

- Introducir reglas progresivas en [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) y ajustar el árbol de `app/` por etapas.
- Cualquier excepción queda anotada en este ADR o en `dependency-cruiser` con comentario.

## Estado

**proposed** — se validará tras reducir falsos positivos en migraciones reales.
