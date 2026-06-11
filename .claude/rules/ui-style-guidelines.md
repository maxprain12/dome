# Dome - UI Style Guidelines

## Design Principles

### 1. Clarity Over Decoration
- Every element should serve a purpose
- Avoid purely decorative elements that add visual noise
- Use whitespace generously to create breathing room

### 2. Consistent Visual Hierarchy
- Primary actions should be immediately visible
- Secondary actions should be discoverable but not distracting
- Use size, weight, and color to establish hierarchy

### 3. Responsive Feedback
- Every interaction should have immediate visual feedback
- Use subtle animations to confirm actions
- Loading states should be informative, not just decorative

### 4. Accessibility First
- Maintain sufficient color contrast (WCAG AA minimum)
- Support keyboard navigation for all interactive elements
- Provide clear focus states

---

## Color System

> **Fuente de verdad: [`new-color-palette.md`](new-color-palette.md) y `app/globals.css`.**
> Las variables `--brand-*` están **eliminadas** (ya no existen en `globals.css`). No usar valores
> hex en componentes — siempre variables CSS. El check `pnpm run check:design-system` lo verifica en CI.

### Variables vigentes (resumen)

```css
/* Texto */
--primary-text     /* títulos, texto importante */
--secondary-text   /* texto de cuerpo, descripciones */
--tertiary-text    /* placeholders, deshabilitado */

/* Fondos */
--bg               /* fondo principal */
--bg-secondary     /* cards, paneles */
--bg-tertiary      /* inputs, fondos sutiles */
--bg-hover         /* estados hover */

/* Interactivo */
--accent           /* botones primarios, links, focus */
--secondary        /* estados activos, highlights */

/* Bordes */
--border
--border-hover

/* Semánticos (con par light/dark y variantes -bg) */
--success / --success-bg
--warning / --warning-bg
--error / --error-bg
--info / --info-bg
```

Los valores hex por tema viven en `app/globals.css` (`:root` y `[data-theme="dark"]`); consultarlos ahí, no copiarlos a componentes.

### Usage Guidelines

| Element | Color Variable |
|---------|---------------|
| Primary buttons | `--accent` |
| Links | `--accent` |
| Success states | `--success` |
| Error states | `--error` |
| Body text | `--secondary-text` |
| Headings | `--primary-text` |
| Disabled elements | `--tertiary-text` |
| Card backgrounds | `--bg-secondary` |
| Input backgrounds | `--bg-tertiary` |

---

## Typography

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 24px | 600 | 1.3 |
| H2 | 18px | 600 | 1.4 |
| H3 | 16px | 600 | 1.4 |
| Body | 14px | 400 | 1.5 |
| Small | 13px | 400 | 1.5 |
| Caption | 12px | 500 | 1.4 |
| Overline | 11px | 600 | 1.4 |

### Text Rules
- Use sentence case for UI text (not Title Case)
- Labels should be concise (2-4 words max)
- Error messages should be helpful, not technical
- Use `text-transform: uppercase` sparingly (only for overlines)

---

## Spacing

### Base Unit: 4px

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

### Usage Patterns

| Context | Spacing |
|---------|---------|
| Icon to text | 8px |
| Between form fields | 16px |
| Section padding | 24px |
| Card padding | 16-24px |
| Button padding | 10px 16px (sm), 12px 20px (md), 14px 24px (lg) |

---

## Border Radius

```css
--radius-sm: 4px;    /* Small buttons, tags */
--radius-md: 6px;    /* Buttons, inputs */
--radius-lg: 8px;    /* Cards */
--radius-xl: 12px;   /* Modals, large cards */
--radius-2xl: 16px;  /* Panels */
--radius-full: 9999px; /* Pills, avatars */
```

---

## Shadows

```css
/* Subtle elevation */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);

/* Cards, dropdowns */
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
             0 2px 4px -1px rgba(0, 0, 0, 0.06);

/* Modals, popovers */
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
             0 4px 6px -2px rgba(0, 0, 0, 0.05);

/* Floating elements */
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
             0 10px 10px -5px rgba(0, 0, 0, 0.04);
```

---

## Transitions

```css
--transition-fast: 150ms ease;   /* Hover states, micro-interactions */
--transition-base: 200ms ease;   /* Most transitions */
--transition-slow: 300ms ease;   /* Complex animations */
```

### When to Animate

| Animation | Duration | Easing |
|-----------|----------|--------|
| Hover color change | 150ms | ease |
| Button press | 100ms | ease-out |
| Modal appear | 200ms | ease-out |
| Dropdown open | 150ms | ease-out |
| Page transitions | 300ms | ease-in-out |

---

## Component Patterns

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--accent);
  color: white;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 14px;
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--border);
  padding: 10px 16px;
  border-radius: var(--radius-md);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--border-focus);
}

/* Ghost Button */
.btn-ghost {
  background: transparent;
  color: var(--secondary);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.btn-ghost:hover {
  background: var(--bg-tertiary);
  color: var(--primary);
}
```

### Cards

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  transition: all var(--transition-fast);
}

.card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}

.card-interactive {
  cursor: pointer;
}

.card-interactive:hover {
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--primary);
  transition: all var(--transition-fast);
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}

.input::placeholder {
  color: var(--tertiary);
}
```

### Dropdown Menus

```css
.dropdown {
  position: fixed;          /* Always use fixed positioning */
  z-index: 9999;            /* High z-index to avoid overlap issues */
  min-width: 180px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  animation: dropdown-appear 0.15s ease-out;
}

@keyframes dropdown-appear {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.dropdown-item:hover {
  background: var(--bg-secondary);
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
```

### Modals

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: overlay-appear 0.2s ease-out;
}

@keyframes overlay-appear {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  animation: modal-appear 0.2s ease-out;
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
```

---

## Z-Index Scale

```css
--z-dropdown: 100;
--z-sticky: 200;
--z-fixed: 300;
--z-modal-backdrop: 400;
--z-modal: 500;
--z-popover: 600;
--z-tooltip: 700;
--z-toast: 800;
--z-max: 9999;
```

---

## Responsive Breakpoints (desktop app — 03/T06)

Dome es una app Electron: el objetivo es robustez entre la ventana mínima y
pantallas grandes, **no** mobile-first. Contrato vigente:

| Umbral | Qué pasa |
|--------|----------|
| **800×600** | Tamaño mínimo de ventana, forzado en `electron/main.cjs` (`minWidth`/`minHeight`). Toda vista principal debe ser usable aquí. |
| **≤ 980px** | El panel derecho (Many) pasa a overlay (`position: absolute`, `width: min(380px, 86vw)`) y el sidebar izquierdo cede ancho (`min(260px, 28vw)`, mínimo 200px). Definido en `app/globals.css` (`@media (max-width: 980px)`). |
| **> 980px** | Layout de tres paneles completo (sidebar 260px + contenido + Many 280–600px redimensionable). |

Reglas al añadir UI nueva:
- Anchos fijos solo si caben a 800px de ventana; si no, `min()`/`clamp()`.
- El contenido principal siempre con `min-width: 0` dentro de filas flex.
- Probar a 800×600 y ~1000×700 antes de mergear cambios de layout.

Tailwind sigue ofreciendo sus breakpoints estándar (`sm`/`md`/`lg`…) para
utilidades puntuales, pero los umbrales de comportamiento del shell son los
de la tabla.

---

## Dark Mode

When implementing dark mode, swap these values:

```css
/* Dark Mode Variables */
--primary: #f9fafb;
--secondary: #9ca3af;
--tertiary: #6b7280;
--bg: #111827;
--bg-secondary: #1f2937;
--bg-tertiary: #374151;
--bg-hover: #4b5563;
--border: #374151;
```

---

## Do's and Don'ts

### Do
- Use CSS variables for all colors
- Maintain consistent spacing (multiples of 4px)
- Provide hover and focus states for all interactive elements
- Use `position: fixed` for dropdowns to avoid overflow issues
- Test UI at different viewport sizes
- Use semantic colors for feedback (success, error, warning)

### Don't
- Hardcode color values in components
- Use arbitrary spacing values
- Create custom button styles without following the pattern
- Use `z-index` values outside the defined scale
- Forget to handle dark mode
- Ignore keyboard navigation

---

## Implementation Checklist

Before shipping a component:

- [ ] Colors use CSS variables
- [ ] Spacing follows 4px grid
- [ ] Has hover state
- [ ] Has focus state (visible focus ring)
- [ ] Has disabled state if applicable
- [ ] Animations use defined transitions
- [ ] Works with keyboard navigation
- [ ] Tested in dark mode
- [ ] Dropdown/popover uses fixed positioning
- [ ] Z-index follows the scale

---

**Last Updated:** 2025-01-17
