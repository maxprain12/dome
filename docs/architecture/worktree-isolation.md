# Aislamiento por worktree (`DOME_PROFILE`)

## Problema

Por defecto Electron usa un único `userData` por usuario, por lo que varios clones (worktrees) comparten la misma base DuckDB y datos (`dome.duckdb`).

## Solución

Definir `DOME_PROFILE` (nombre seguro, p. ej. rama o slug) **antes** de arrancar el proceso main:

- El `userData` pasa a ser un subdirectorio con sufijo `*-wt-<perfil>`.
- En desarrollo, puedes fijar `DOME_VITE_PORT` o `VITE_DEV_PORT` para el servidor Vite y apuntar Electron a la misma URL.

## Uso

```bash
# Script de conveniencia
./scripts/dev-worktree.sh mi-rama-123

# Manual
export DOME_PROFILE=mi-rama-123
export DOME_VITE_PORT=5174
# terminal 1: pnpm run dev
# terminal 2: con la misma env, electron . (o pnpm run electron)
```

Implementación: `electron/main.cjs` (early `app.setPath('userData', …)`) y [vite.config.ts](../../vite.config.ts) para el puerto.
