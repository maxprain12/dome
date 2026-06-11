# 02 — UI Visual — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Colores hardcodeados | ⚠️ Parcial | Ratchet activo; baseline 279 hex |
| T02 Dark mode roto | ⚠️ Parcial | ResourceCard, WorkflowDetail, paleta brand |
| T03 Paleta deprecada | ✅ | Eliminados `--brand-*` en `globals.css`; ResourceCard migrado |
| T04 Lint design system | ✅ | `check:design-system` + CI |
| T05 i18n 100% | ⚠️ | Sin cambios masivos; defaults en nuevas claves |

## Archivos clave

- `scripts/check-hardcoded-colors.mjs`, `scripts/baselines/hardcoded-colors.txt`
- `app/globals.css` (sin `--brand-accent` / `--brand-secondary`)
- `app/components/home/ResourceCard.tsx`, `marketplace/WorkflowDetail.tsx`

## Cómo validar

```bash
# Ratchet de colores (no debe subir el conteo)
pnpm run check:design-system

# Sin aliases brand en CSS
grep -n "--brand-" app/globals.css   # → 0

# Dark mode visual
pnpm run electron:dev
# Settings → tema oscuro → Home (ResourceCard hover), Marketplace workflow detail

# Lint en CI
# Job "Design system ratchet" en .github/workflows/ci.yml
```

## Pendiente

- Migración masiva T01: reducir baseline hacia 0 (archivos con más hex: `home-dashboard.css`, `UnifiedSidebar.tsx`, `_tiptap-dome-bridge.scss`)
- Completar T02: VideoPlayer (overlay intencional blanco), ppt/client hover
