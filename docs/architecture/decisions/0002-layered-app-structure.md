---
id: 0002
title: Estructura por capas en el renderer
status: accepted
date: 2026-04-27
updated: 2026-06-22
---

# ADR-0002: Alinear el frontend con capas explícitas

## Contexto

El post de “engineering hardness” recomienda capas fijas (Types → Config → … → UI) y validación de dependencias para que los agentes no rompan bordes.

## Decisión (aceptada)

- Reglas progresivas en [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) configuradas y validadas en CI (`pnpm run depcruise`).
- El árbol de `app/` se ajusta por etapas con excepciones documentadas inline en `.dependency-cruiser.cjs`.
- 1479 módulos y 3866 dependencias validadas; 0 violaciones en `pnpm run depcruise`.

## Estado

**accepted** — implementado y validado en CI. El ADR se mantiene como referencia histórica de la decisión.
