# Arquitectura – índice

**Ecosistema:** el índice [MASTER](../../MASTER.md) relaciona Dome Desktop, dome-provider y el sitio `landing-page-dome`; este directorio cubre sólo **arquitectura del cliente Desktop**.
- [Capas y dependencias](layers.md) — modelo de referencia (Types → Config → Repo → Service → Runtime → UI).
- [Dominios de producto](domains.md) — mapa al código (`app/`, `electron/ipc/`).
- [Fronteras renderer / main](boundaries.md) — IPC, validación, seguridad.
- [Canales IPC](ipc-channels.md) — **autogenerado**; ejecutar `npm run generate:ipc-inventory` tras añadir handlers.
- [Aislamiento por worktree](worktree-isolation.md) — `DOME_PROFILE` y desarrollo en paralelo.
- [Herramientas de runtime para agentes](agent-runtime-tools.md) — DevTools, observabilidad local.
- [Decisiones (ADRs)](decisions/) — registro de decisiones numeradas.

Las guías de **features** del producto están en [../features/](../features/).
