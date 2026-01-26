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

### CSS Variables

```css
/* Brand Colors */
--brand-primary: #0ea5e9;      /* Sky blue - primary actions, links */
--brand-secondary: #a855f7;    /* Purple - AI features, premium */
--brand-accent: #10b981;       /* Emerald - success, confirmations */

/* Text Colors */
--primary: #111827;            /* Dark gray - headings, important text */
--secondary: #6b7280;          /* Medium gray - body text, descriptions */
--tertiary: #9ca3af;           /* Light gray - placeholder, disabled */

/* Background Colors */
--bg: #ffffff;                 /* Main background */
--bg-secondary: #f9fafb;       /* Cards, panels */
--bg-tertiary: #f3f4f6;        /* Inputs, subtle backgrounds */
--bg-hover: #e5e7eb;           /* Hover states */

/* Border Colors */
--border: #e5e7eb;             /* Default borders */
--border-focus: #0ea5e9;       /* Focus states */

/* Semantic Colors */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;
```

### Usage Guidelines

| Element | Color Variable |
|---------|---------------|
| Primary buttons | `--brand-primary` |
| Links | `--brand-primary` |
| AI features | `--brand-secondary` |
| Success states | `--brand-accent` |
| Body text | `--secondary` |
| Headings | `--primary` |
| Disabled elements | `--tertiary` |
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
  background: var(--brand-primary);
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
  border-color: var(--brand-primary);
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
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
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

## Responsive Breakpoints

```css
/* Mobile first approach */
--breakpoint-sm: 640px;   /* Large phones */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Small laptops */
--breakpoint-xl: 1280px;  /* Desktops */
--breakpoint-2xl: 1536px; /* Large screens */
```

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
