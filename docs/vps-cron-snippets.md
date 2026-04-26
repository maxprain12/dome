# Snippets de cron (VPS) — focos añadidos

Añade al `crontab` del operador (horarios orientativos; ajusta colisión con audits existentes):

```cron
# Documentación (drift) — 1x/día
0 22 * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh --focus docs >> /var/log/dome-audit.log 2>&1

# Arquitectura (depcruise / boundary) — 1x/día
30 18 * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh --focus arch >> /var/log/dome-audit.log 2>&1

# Principios (semántico) — 1x/día
30 20 * * *  REPO_DIR=/opt/dome-audit/dome /opt/dome-audit/vps-audit.sh --focus principles >> /var/log/dome-audit.log 2>&1
```

Los prompts viven en `prompts/audits/{docs,arch,principles}.md`. El dashboard incluye las tarjetas y `vps-audit-dashboard.sh` regenera `docs/quality/scorecard.md` en el clon bajo `REPO_DIR` cuando el directorio existe.
