# SOP: shadcn/ui en Dome (Base UI + preset)

Dome usa **[shadcn/ui](https://ui.shadcn.com/)** como librería principal de componentes UI (primitivos **Base UI**, estilo **base-luma**, preset **olive**). Los componentes viven en el repo (`app/components/ui/`), no en `node_modules`.

Configuración actual: [`components.json`](../../components.json) en la raíz del monorepo.

---

## Stack UI (renderer)

| Capa | Tecnología |
|------|------------|
| Componentes | shadcn/ui (`button`, `dialog`, …) en `app/components/ui/` |
| Primitivos | `@base-ui/react` (vía shadcn CLI) |
| Estilos | Tailwind CSS v3 + tokens CSS en `app/globals.css` |
| Utilidad | `cn()` en `app/lib/utils/index.ts` (export desde `formatting.ts`) |
| Iconos (preset) | `@hugeicons/react` + `@hugeicons/core-free-icons` |
| Fuente (preset) | `@fontsource-variable/inter` |
| Animaciones | `tw-animate-css` (import en `app/globals.css`) |

**Migración COMPLETADA (jul-2026):** `app/components/ui/` contiene SOLO componentes shadcn originales (sin barrel `index.ts`; importar cada componente por su ruta). Las composiciones de app sin equivalente shadcn viven en `app/components/shared/` (SubpageHeader, SubpageFooter, ListState, Toolbar, DatePicker, DateTimePicker, FilterChipGroup, ResourceIcon, CollapsibleRow, DrawerLayout, ActiveFilterBanner, ConfirmDialog, PromptModal, ThemeProvider, WindowControls, SearchField, EntityIcon, ErrorState, LoadingState, HorizontalScrollArea, **InlineDetailCard**). No crear wrappers nuevos en `ui/`; no añadir Mantine ni primitivos ad-hoc. OJO: `input.tsx` y `textarea.tsx` usan `forwardRef` (React 18) — re-aplicar si se regeneran con el CLI.

**Master–detail (list + side Card, no Sheet):** see [inline-detail-surfaces.md](./inline-detail-surfaces.md).

---

## Inicializar shadcn en este monorepo (pnpm)

El CLI de shadcn ejecuta internamente `pnpm add …` **sin** el flag `-w`. En un monorepo pnpm eso falla con:

```text
[ERR_PNPM_ADDING_TO_ROOT] Running this command will add the dependency to the workspace root…
```

### Solución recomendada: shim temporal de pnpm

No renombrar ni quitar `pnpm-workspace.yaml`. Usar un shim que inyecte `-w` en `pnpm add`:

```bash
REAL_PNPM=$(which pnpm)
mkdir -p /tmp/pnpm-shim
cat > /tmp/pnpm-shim/pnpm << EOF
#!/bin/bash
if [[ "\$1" == "add" ]]; then
  exec "$REAL_PNPM" add -w "\${@:2}"
else
  exec "$REAL_PNPM" "\$@"
fi
EOF
chmod +x /tmp/pnpm-shim/pnpm

PATH=/tmp/pnpm-shim:$PATH pnpm dlx shadcn@latest init \
  --preset b6tOz2FLk \
  --template vite \
  --pointer \
  --yes \
  --force

rm -rf /tmp/pnpm-shim
```

Comando equivalente al preset visual de [shadcn/create](https://ui.shadcn.com/create) (Vite, Base UI, pointer, sin monorepo, sin RTL).

### Alternativa: `.npmrc`

Añadir en [`.npmrc`](../../.npmrc):

```ini
ignore-workspace-root-check=true
```

Permite que `pnpm add` en la raíz funcione sin shim. Útil si varias personas del equipo ejecutan shadcn con frecuencia.

---

## Añadir componentes

Tras `init`, instalar primitivos. **Recrea el shim de pnpm** si borraste `/tmp/pnpm-shim` (el CLI ejecuta `pnpm add` sin `-w`):

```bash
REAL_PNPM=$(which pnpm)
mkdir -p /tmp/pnpm-shim
cat > /tmp/pnpm-shim/pnpm << EOF
#!/bin/bash
if [[ "\$1" == "add" ]]; then
  exec "$REAL_PNPM" add -w "\${@:2}"
else
  exec "$REAL_PNPM" "\$@"
fi
EOF
chmod +x /tmp/pnpm-shim/pnpm

PATH=/tmp/pnpm-shim:$PATH pnpm dlx shadcn@latest add card input textarea dialog alert-dialog \
  select badge switch checkbox dropdown-menu popover tooltip alert separator \
  collapsible slider progress tabs sheet scroll-area calendar sonner \
  --yes --overwrite

rm -rf /tmp/pnpm-shim
```

Los archivos se generan en `app/components/ui/` (p. ej. `button.tsx`). Alias de import:

```tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

### Providers globales (`app/main.tsx`)

Tras añadir `tooltip` y `sonner`, la app debe incluir:

```tsx
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

<TooltipProvider>
  <Toaster position="top-right" richColors closeButton />
  <BrowserRouter>...</BrowserRouter>
</TooltipProvider>
```

El `Toaster` de shadcn usa `data-theme` en `<html>` (no `next-themes`).

---

## Theming

- **Fuente de verdad de color:** tokens shadcn en `app/globals.css` (`:root` / `.dark`). Estado extra (`--success`, sombras) en `:root[data-theme="light|dark"]`.
- Marca Dome: `--primary` forest, `--primary-hover`, `--brand-lime|mint|lavender`. Ver `.claude/rules/new-color-palette.md`.
- Variantes custom (no pisar con `shadcn add --overwrite` sin diff):
  - `Button`: pill; `soft`; `secondary`/`outline` = outline forest
  - `Badge`: `lime` \| `mint` \| `lavender`
  - `Card`: `variant` `default` \| `lime` \| `lavender` \| `brand`
- shadcn imports al inicio de `globals.css`:

  ```css
  @import "tw-animate-css";
  @import "shadcn/tailwind.css";
  @import "@fontsource-variable/inter";
  ```

- Tema de la app: `data-theme="light|dark"` + clase `.dark` en `<html>` (ver `ThemeProvider`).
- No hardcodear hex en componentes; `pnpm run check:design-system` lo verifica en CI.

---

## Convenciones al implementar UI nueva

1. Preferir componentes shadcn sobre `DomeButton`, `DomeModal`, etc. (legacy).
2. Componer con Tailwind + `cn()`; no CSS modules salvo casos legacy.
3. i18n: claves en los 4 idiomas (`app/lib/i18n.ts` o `@dome/i18n`).
4. Accesibilidad: usar primitivos shadcn (focus, roles); botones solo-icono con `aria-label`.
5. Tras añadir un componente shadcn, ejecutar:

   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run build
   ```

---

## Referencias

| Recurso | Ruta |
|---------|------|
| Config shadcn | `components.json` |
| Tokens + estilos globales | `app/globals.css` |
| Tailwind | `tailwind.config.cjs` |
| Guía visual / marca | `docs/features/dome-design-guide.md` |
| Reglas UI (agentes) | `.claude/rules/ui-style-guidelines.md` |

Si hay discrepancia entre docs y código generado por shadcn, **gana el código** en `app/components/ui/` y `app/globals.css`.
