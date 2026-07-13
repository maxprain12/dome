# Plan 022: Icons — eliminar dead code + roadmap lucide-adapter

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/icons/`

## Status

- **Priority**: P3 | **Effort**: S | **Planned at**: `b500063c`

## Why this matters

icon-columns-4/5, icon-mermaid sin imports; youtube-icon duplicado; lucide-adapter contradice preset Hugeicons.

## Steps

1. **DELETE** `app/components/icons/icon-columns-4.tsx`, `icon-columns-5.tsx`, `icon-mermaid.tsx` (0 imports verificado con grep)
2. Verificar youtube-icon vs lucide-adapter Youtube — eliminar duplicado no usado
3. Limpiar `icons/index.ts` si solo exporta YoutubeIcon sin consumidores
4. Documentar en plans/README follow-up: migración gradual lucide-adapter → Hugeicons (NO en este plan — blast radius ~200 imports)

**Verify**: `pnpm run typecheck` exit 0; grep cada filename deleted → 0

## Done criteria

- [ ] 3 icon files muertos eliminados
- [ ] typecheck pass

## Out of scope

- Migración masiva lucide-adapter (proyecto separado P3 L)
