# React Doctor — false positives verificados

Patrones confirmados con grep/Read; no suprimir sin verificar el shape del código.

## `.claude/worktrees/**/.github/workflows/build.yml`

- **Regla:** `react-doctor/build-pipeline-secret-boundary`
- **Motivo:** Copias stale de worktrees de agentes; el workflow canónico es `.github/workflows/build.yml` en la raíz del repo.
## `pdfjs-dist` supply chain score

- **Regla:** `socket/low-supply-chain-score`
- **Motivo:** Mozilla `pdfjs-dist` incluye código nativo/wasm y scripts de build; score Socket ~36. Es dependencia core del visor PDF (no hay alternativa equivalente en el stack).
- **Mitigación:** `supplyChain.minScore: 35` en `.react-doctor.json`; versión fijada vía `pnpm` lockfile.

## `app/components/notebook/NotebookEditor.tsx` — `role="button"`

- **Regla:** `react-doctor/prefer-tag-over-role`
- **Motivo:** El contenedor de celda envuelve inputs/contentEditable; `<button>` sería HTML inválido (interactive anidado).
- **Verificación:** grep `NotebookEditor.tsx:494` — mantiene `div` con comentario explícito.
