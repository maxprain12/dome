# Herramientas de runtime para agentes

## DevTools (Chrome) y Depuración

- Con Electron en dev, se puede conectar a **Chrome DevTools** remoto con `--remote-debugging-port=9222` (u otro libre) en el arranque de Electron (añadir a los argumentos de línea de comandos o variable de entorno acordada en tu flujo local).
- Flujo recomendado: snapshot DOM antes/después, consola, red — alineado con el bucle *reproducir → arreglar → revalidar*.

## Observabilidad local (opcional)

- Ver [../observability/README.md](../observability/README.md) y la skill [`.claude/skills/observability-dome/`](../../.claude/skills/observability-dome/SKILL.md): OTLP/Vector o equivalente **solo** donde el operador haya levantado el stack en dev.
- No es obligatorio para CI; el objetivo es señal estructurada para el agente cuando exista.

## Skills

- `observability-dome` — plantillas de consulta (metáfora LogQL/PromQL) sobre archivos o endpoints locales si el compose está arriba.
- `dome-reproduce-ui` — checklist para enlazar worktree + DevTools + anotar en `docs/plans/active/`.
