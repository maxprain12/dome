# Calidad: metodología

- **Focos de auditoría** (VPS): ver `scripts/vps-audit.sh` y `prompts/audits/*.md`.
- **Scorecard por dominio × capa**: generado en [scorecard.md](scorecard.md) por `scripts/vps-audit-dashboard.sh` (o job dedicado) a partir de findings JSON; excluir `resolved_reason: stale_unverifiable` en agregados.
- **Criterios de severidad** compartidos: `prompts/shared/project-context.md`.
