# Plan 013: Settings — i18n cadenas hardcodeadas en español

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/settings/DomeSyncSettings.tsx app/components/settings/CloudStorageSettings.tsx app/lib/i18n.ts`

## Status

- **Priority**: P2 | **Effort**: M | **Planned at**: `b500063c`

## Why this matters

DomeSyncSettings y CloudStorageSettings mezclan `t()` con strings españolas literales — rompe en/fr/pt.

## Steps

1. Auditar `DomeSyncSettings.tsx`, `CloudStorageSettings.tsx` para strings literales
2. Añadir keys en `app/lib/i18n.ts` (en, es, fr, pt)
3. Reemplazar todas las cadenas
4. Buscar otros settings con mismo patrón: `grep -rn '"Conectado\|"Activa\|"Cargando' app/components/settings/`

**Verify**: cambiar idioma a en en app → settings cloud/sync en inglés

## Done criteria

- [ ] 0 strings españolas hardcoded en esos paneles
- [ ] 4 idiomas completos para nuevas keys
