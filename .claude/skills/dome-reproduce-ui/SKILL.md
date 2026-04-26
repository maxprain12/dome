---
name: dome-reproduce-ui
description: Reproducir bugs de UI con Electron + worktree aislado (DOME_PROFILE) y DevTools; plantilla de plan.
---

# Reproducir / validar UI (Dome)

## Preparación

1. `DOME_PROFILE=<slug>`, `DOME_VITE_PORT` distinto de otros worktrees.
2. `npm run dev` y `npm run electron` (o dos terminales) con la misma env.
3. Conectar depuración remota: añade `--remote-debugging-port=9222` al binario de Electron (flags en tu script de arranque local; no requiere cambio en prod si no se aplica allí).

## Bucle (until clean)

- Snapshot DOM / cons **antes** y **después** de la ruta de UI.
- Si el fallo se va: documenta en `docs/plans/active/<bug>.md` y enlaza al PR.

## Enlaces

- [docs/architecture/agent-runtime-tools.md](../../docs/architecture/agent-runtime-tools.md)
- [docs/architecture/worktree-isolation.md](../../docs/architecture/worktree-isolation.md)
