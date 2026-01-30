# Dome Design System Update

## Color Palette Implementation

### Light Theme (`data-theme="light"`)
```css
--text: #040316
--background: #fbfbfe
--primary: #e0eab3
--secondary: #998eec
--accent: #7b76d0
```

**Semantic Colors (Derived)**
- `--primary-text`: #040316 (headings, important text)
- `--secondary-text`: #4a4766 (body text, descriptions)
- `--tertiary-text`: #858299 (placeholders, disabled)

**Background Variants**
- `--bg`: #fbfbfe (main background)
- `--bg-secondary`: #f2f2f9 (cards, panels)
- `--bg-tertiary`: #e8e8f2 (inputs, hover states)

**Interactive Elements**
- `--accent`: #7b76d0 (primary buttons, links)
- `--secondary`: #998eec (active states, highlights)

### Dark Theme (`data-theme="dark"`)
```css
--text: #eae9fc
--background: #010104
--primary: #424c15
--secondary: #1e1371
--accent: #332f89
```

**Semantic Colors (Derived)**
- `--primary-text`: #eae9fc
- `--secondary-text`: #b8b7d4
- `--tertiary-text`: #85849d

**Background Variants**
- `--bg`: #010104
- `--bg-secondary`: #0d0d1a
- `--bg-tertiary`: #181829

## Key Improvements

### 1. Consistent Color System
- All colors now use the new palette
- Semantic naming for better maintainability
- Proper text/background contrast for accessibility

### 2. Refined Component Styles

#### Buttons
- Primary buttons use `--accent` with subtle shadows
- Hover states include lift effect (`translateY(-1px)`)
- Active states with scale feedback

#### Cards
- Softer shadows for depth
- Hover transform for interactivity
- Border color transitions to `--accent`

#### Inputs
- 1.5px borders for definition
- Focus states with `--accent` and translucent ring
- Smooth transitions on all states

#### Dropdowns & Modals
- Improved z-index management
- Backdrop blur for depth
- Refined animations (cubic-bezier easing)
- Proper overflow handling

### 3. Typography Enhancements
- Added negative letter-spacing (-0.02em) for headings
- Improved line-height (1.65) for readability
- Better text rendering with antialiasing

### 4. Layout Improvements
- Fixed z-index scale to prevent overlapping
- Proper overflow management on containers
- Backdrop blur on navigation for glassmorphism
- Better separation between layout layers

### 5. Editor (ProseMirror) Updates
- Code blocks with borders and proper padding
- Blockquotes with accent border and background
- Improved link styles with better hover states
- Mark/highlight using palette colors

### 6. New Utility Classes

#### Hover Interactions
```css
.hover-lift    /* Subtle lift on hover */
.hover-scale   /* Scale up slightly */
.hover-brightness  /* Brighten on hover */
```

#### Content Width
```css
.content-prose   /* 72ch for reading */
.content-wide    /* 90rem max */
.content-narrow  /* 48rem max */
```

#### Spacing
```css
.spacing-section   /* var(--space-8) */
.spacing-component /* var(--space-4) */
.spacing-tight     /* var(--space-2) gap */
.spacing-normal    /* var(--space-4) gap */
.spacing-loose     /* var(--space-6) gap */
```

#### Z-index Management
```css
.stack-layer-1  /* z-index: 1 */
.stack-layer-2  /* z-index: 2 */
.stack-layer-3  /* z-index: 3 */
```

## Theme Provider

New `ThemeProvider` component manages theme switching:

```tsx
import { useTheme } from '@/components/ThemeProvider';

function MyComponent() {
  const { toggleTheme, setTheme, getTheme } = useTheme();

  return (
    <button onClick={toggleTheme}>
      Toggle Theme
    </button>
  );
}
```

**Features:**
- Persists theme to localStorage
- Auto-detects system preference on first load
- Smooth transitions between themes

## Component Updates

### WorkspaceLayout
- Updated to use new color variables
- Better error states with palette colors
- Consistent loading indicators

### SidePanel
- Refined tab styling
- Better contrast for active states
- Fixed background colors

## Animation Refinements

### Dropdown Appear
```css
from: opacity: 0, scale(0.96), translateY(-8px)
to:   opacity: 1, scale(1), translateY(0)
```

### Modal Appear
```css
from: opacity: 0, scale(0.94), translateY(20px)
to:   opacity: 1, scale(1), translateY(0)
```

## Z-Index Scale
```css
--z-dropdown: 100
--z-sticky: 200
--z-fixed: 300
--z-modal-backdrop: 400
--z-modal: 500
--z-popover: 600
--z-tooltip: 700
--z-toast: 800
--z-max: 9999
```

## Spacing Scale
Based on 4px increments:
```css
--space-1: 4px    --space-6: 24px
--space-2: 8px    --space-8: 32px
--space-3: 12px   --space-10: 40px
--space-4: 16px   --space-12: 48px
--space-5: 20px
```

## Border Radius
```css
--radius-sm: 4px
--radius-md: 6px
--radius-lg: 8px
--radius-xl: 12px
--radius-2xl: 16px
--radius-full: 9999px
```

## Transitions
```css
--transition-fast: 120ms ease-in-out
--transition-base: 220ms ease-in-out
--transition-slow: 300ms cubic-bezier(0.16, 1, 0.3, 1)
```

## Next Steps

To fully adopt the new design system:

1. **Update remaining components** to use new color variables:
   - Replace `var(--primary)` → `var(--primary-text)`
   - Replace `var(--secondary)` → `var(--secondary-text)`
   - Replace `var(--brand-primary)` → `var(--accent)`

2. **Add theme toggle** in settings panel using `useTheme()` hook

3. **Test accessibility** - ensure WCAG AA contrast ratios

4. **Add dark mode screenshots** to documentation

5. **Consider adding more theme variants** (e.g., high contrast mode)

## Migration Guide

### Before
```tsx
<div style={{ color: 'var(--primary)', background: 'var(--bg-secondary)' }}>
  <p style={{ color: 'var(--secondary)' }}>Text</p>
</div>
```

### After
```tsx
<div style={{ color: 'var(--primary-text)', background: 'var(--bg-secondary)' }}>
  <p style={{ color: 'var(--secondary-text)' }}>Text</p>
</div>
```

### Component Classes
Replace inline styles with utility classes where possible:

```tsx
// Before
<button style={{ background: 'var(--brand-primary)', color: 'white' }}>
  Click me
</button>

// After
<button className="btn btn-primary">
  Click me
</button>
```

## Performance Considerations

- All transitions use hardware-accelerated properties (transform, opacity)
- Backdrop blur uses `-webkit-backdrop-filter` for Safari compatibility
- CSS variables enable instant theme switching without re-renders
- Reduced motion respects user preferences

---

**Last Updated:** 2026-01-28
**Design Direction:** Scholarly Precision meets Modern Minimalism
