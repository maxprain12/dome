# T06 — Hardening de shell:exec y fix ReDoS en file search

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: S · **Área**: Seguridad
**Estado**: ✅ Implementada (verificada 2026-06-10) — `electron/core/shell-policy.cjs` (`assessShellCommand`, denylist) aplicado en `shell.cjs`; la regex de `shell:file:search` reemplazada por `picomatch` (fix ReDoS) con `SEARCH_MAX_DEPTH`. Tests `shell-policy.test.mjs` en verde.

## Problema

`electron/ipc/core/shell.cjs`:

1. `shell:exec` (líneas 34-75) ejecuta el comando con `exec()` tras aprobación HITL, pero sin ninguna restricción adicional: una aprobación distraída del usuario permite cualquier comando (`rm -rf ~`, exfiltración, etc.). El prompt de aprobación es la única barrera.
2. `shell:file:search` (línea ~112) construye una regex desde el patrón del usuario con `pattern.replace(/\*/g, '.*')` — un patrón malicioso o accidental (`(a+)+`-style tras la conversión) puede causar ReDoS y congelar el main process.

## Qué hay que hacer

1. **shell:exec**:
   - Mostrar en el diálogo de aprobación el comando completo y el cwd (verificar que ya se hace; si no, añadirlo).
   - Añadir una denylist dura que rechace sin preguntar: `rm -rf /`, `sudo`, `mkfs`, `dd of=/dev/`, redirecciones a `~/.ssh`, `curl | sh`, etc. (lista en un módulo testeable, p. ej. `electron/core/shell-policy.cjs`).
   - Limitar `maxBuffer` y confirmar que `EXEC_TIMEOUT_MS` existe y es razonable (≤60s por defecto).
   - Considerar `spawn` con array de args en vez de `exec` con string cuando el llamador pueda estructurarlo (evita inyección por metacaracteres del shell).
2. **shell:file:search**:
   - Escapar el patrón antes de convertir comodines: `pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')`.
   - O mejor: no usar regex — comparar con `path.basename` + `String.includes`/glob con `picomatch` (ya hay deps de glob en el árbol).
   - Cap de resultados y profundidad de recursión.

## Criterios de aceptación

- [ ] Un patrón hostil en `shell:file:search` (p. ej. `(((((a*)*)*)*)*` con asteriscos) no bloquea el main process.
- [ ] Comandos de la denylist se rechazan sin llegar al diálogo de aprobación.
- [ ] El diálogo HITL muestra comando + cwd literalmente.
- [ ] Tests unitarios del módulo de policy (lista de comandos permitidos/bloqueados).

## Riesgos / notas

- No convertir esto en una whitelist estricta sin consultar: los agentes usan shell para tareas variadas y una whitelist corta rompería flujos. Denylist + HITL + timeout es el equilibrio razonable hoy.
- Relacionada con [T01](T01-sandbox-renderer.md): mientras el renderer no esté sandboxed, esta superficie importa el doble.
