# Guardrails — mapa principio → regla → script → CI

Índice único para agentes. El detalle de cada contrato vive en el script citado.

| Principio | Regla Cursor | Script | CI |
|-----------|--------------|--------|----|
| P-001 renderer ↛ Node | architecture rules | ESLint `dome/no-renderer-node-imports` | `architecture-check` |
| P-004 i18n 4 idiomas | `i18n-four-languages.mdc` | `pnpm run check:i18n-keys` | job lint |
| P-005 colores | `ui-product-quality.mdc` | `pnpm run check:design-system` | job lint |
| P-011 Sonar | `sonar-clean-code.mdc` | `pnpm run check:sonar-patterns` | job lint |
| UI composition | `ui-product-quality.mdc` | `pnpm run check:ui-contracts` | job lint |
| No IDs opacos | `no-raw-ids-in-ui.mdc` | `pnpm run check:no-raw-ids` | job lint |
| Texto contenido | SOP text-containment | `pnpm run check:text-containment` | job lint |

Gate local rápido (hook pre commit/push):

```bash
pnpm run check:guardrails
```

Excepciones de hex: allowlist en `scripts/check-hardcoded-colors.mjs`.
Excepciones de `SelectValue` vacío / `formatDistanceToNow`: allowlists en los scripts correspondientes (ratchet: no añadir archivos).
