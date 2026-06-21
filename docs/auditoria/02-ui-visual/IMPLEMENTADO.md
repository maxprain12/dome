# 02 — UI Visual — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Colores hardcodeados | ✅ | Paletas centralizadas en `app/lib/ui/palettes.ts`; ratchet 0/0; 111 fallbacks `var(--x, #hex)` eliminados |
| T02 Dark mode roto | ✅ | Variables semánticas `--success/--error/--warning/--info` (+ `-bg`) en ambos temas |
| T03 Paleta deprecada | ✅ | Eliminados `--brand-*` en `globals.css`; ResourceCard migrado |
| T04 Lint design system | ✅ | `check:design-system` + CI |
| T05 i18n 100% | ✅ | Badges de estado traducidos a 4 idiomas |

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

## Pendiente menor (no-código)

- Pase visual manual de T01/T02 en ambos temas (home, sidebar, learn, editor, canvas).
- Verificación de T04/T05 en runtime (axe DevTools sobre las vistas principales).
