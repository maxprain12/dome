# React Doctor — false positives verificados

Patrones confirmados con grep/Read; no suprimir sin verificar el shape del código.

## `.claude/worktrees/**/.github/workflows/build.yml`

- **Regla:** `react-doctor/build-pipeline-secret-boundary`
- **Motivo:** Copias stale de worktrees de agentes; el workflow canónico es `.github/workflows/build.yml` en la raíz del repo.
- **Verificación:** `glob .claude/worktrees/**/build.yml` — no editar worktrees; excluido en `.react-doctor.json`.
