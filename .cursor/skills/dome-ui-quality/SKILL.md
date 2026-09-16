---
name: dome-ui-quality
description: Construye y pule UI de Dome desktop (Electron + React + shadcn). Use when editing app/components, layouts, empty states, dashboards, modals, or visual density in the Dome renderer.
---

# Dome UI quality

## Antes de codear

1. Lee `.cursor/rules/ui-product-quality.mdc` y el componente vecino del mismo hub.
2. Formula la intención: jerarquía, densidad, una acción primaria.
3. Reutiliza `Button`, `Card`, `Dialog`, `DetailModal`, `ListState`, `HubPageHeader`, `SafeText`.

## Implementación

- Tokens CSS (`bg-background`, `text-foreground`, `border-border`). Cero hex.
- Estados: loading / empty-as-dashboard / error / success.
- `min-w-0` + ellipsis en filas y cards. Timestamps cortos con `formatShortDistance`.
- i18n en 4 idiomas. Labels humanos, nunca UUID.

## Verificar

```bash
pnpm run check:guardrails
```

Ejercita el flujo en la UI (click/navegar). Un screenshot no basta.
