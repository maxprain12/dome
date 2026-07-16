# Plan 013 — Marketplace / Complementos Codex

**Estado:** DONE · **Prioridad:** P1 · **Esfuerzo:** L  
**Depende de:** 001

## Objetivo

Rediseñar Marketplace (y coherencia con Plugins/Skills en Settings) al estilo Complementos Codex: Instalados, filtros Público/Personal, grid de cards con Instalar, tabs Complementos | Habilidades.

## Drift check

- [`app/components/marketplace/MarketplaceView.tsx`](../app/components/marketplace/MarketplaceView.tsx)
- Settings: [`PluginsSection.tsx`](../app/components/settings/sections/PluginsSection.tsx), [`SkillsSection.tsx`](../app/components/settings/sections/SkillsSection.tsx)
- Docs marketplace en `docs/features/marketplace/`

## Diseño destino

- HubHeader: tabs Complementos | Habilidades; refresh; Crear (si aplica)
- Título + subtítulo + HubSearch
- Fila “Instalados” (avatares/iconos)
- Filtros Público | Personal
- Grid `InstallCard` (001): featured + productivity sections
- Skills: lista limpia alineada al mismo chrome

## Implementación

1. Rehacer MarketplaceView con kit 001 + InstallCard.
2. No fusionar modelos agents/workflows/mcp/skills/plugins — filtros claros.
3. Sheet detalle (como plugins settings) para install/enable.
4. Alinear copy i18n (en/es/fr/pt); tono Dome, no “ChatGPT”.
5. Deep link desde Settings plugins/skills ↔ marketplace donde tenga sentido.

## Validación

- Smoke: filtrar, instalar mock, abrir detalle.
- Typecheck, lint.

## Criterios de aceptación

- Cards densas pero aireadas; CTA Instalar visible.
- Instalados y catálogo en una composición clara.
- Settings plugins/skills no quedan como isla visual distinta sin razón.

## STOP conditions

No cambiar formato de manifests de plugins/skills. Solo UI + navegación.

## Mantenimiento

Nuevo tipo de catálogo → filtro + InstallCard props, no layout paralelo.
