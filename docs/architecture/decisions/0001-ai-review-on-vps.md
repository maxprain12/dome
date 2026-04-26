---
id: 0001
title: AI PR review on VPS, not only GitHub Actions
status: accepted
date: 2026-04-27
---

# ADR-0001: Revisión de PR con IA en el VPS (dos caminos)

## Contexto

- El driver `scripts/ai-review.mjs` ejecuta tres pases (architecture, logic, style) con prompts en `prompts/review/`.
- GitHub Actions puede fallar con PRs grandes (timeout en jobs, truncado de diffs) y con límites de tasa al combinar auto-merge, project-sync y publicación de reviews en el mismo minuto.
- En el host VPS ya existen credenciales OpenCode/MiniMax (OpenCode) y reintentos con `Retry-After` (ver comentario de cabecera en `scripts/vps-pr-review.sh`).
- Los PRs generados por `vps-audit.sh` se auto-fusionan en segundos; un cron periódico alcanzaba 0 PRs abiertas y el review nunca se aplicaba.

## Decisión

1. **Cron `scripts/vps-pr-review.sh`**: a `:23` y `:53` de cada hora, revisa PRs abiertos, deduplica por SHA (marcador en `/var/log/dome-audit-findings/pr-reviews/<pr>-<sha>.done`), y ejecuta `ai-review.mjs` con backoff ante rate limits.
2. **Review inline en `scripts/vps-audit.sh`**: antes de `gh pr merge --auto`, ejecuta el mismo `ai-review.mjs` sobre el diff del PR de auditoría y escribe el mismo marcador, para no duplicar trabajo si el cron corre después.
3. **No reintroducir** `.github/workflows/ai-review.yml` como fuente de veridad; la pila viva de revisión de IA es la del VPS (y el dashboard asociado).

## Consecuencias

- Operación depende de un entorno (VPS) con `GH_TOKEN`, clave de API (p. ej. en `/opt/dome-audit/.minimax-api.env`) y repositorio clonado en `REPO_DIR`.
- El dashboard estático bajo `/var/www/dome-audit/index.html` (o equivalente) es la superficie de observabilidad; opcional: exponerlo tras proxy o GitHub Pages con contenido no sensible.
- Los agentes y humanos deben leer `scripts/vps-pr-review.sh` y la sección inline de `vps-audit.sh`, no un workflow inexistente en `.github/workflows/`.

## Alternativas consideradas

- **Solo Actions**: descartada por timeout y rate limits en el flujo real del repo.
- **Solo cron**: insuficiente para PRs de auditoría de ciclo de vida de segundos.
