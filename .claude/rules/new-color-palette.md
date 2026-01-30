# Dome New Color Palette - Quick Reference

## Color Variables Reference

### Light Theme
```css
/* Core Theme */
--text: #040316
--background: #fbfbfe
--primary: #e0eab3
--secondary: #998eec
--accent: #7b76d0

/* Text Colors */
--primary-text: #040316      /* Use for headings, important text */
--secondary-text: #4a4766    /* Use for body text, descriptions */
--tertiary-text: #858299     /* Use for placeholders, disabled text */

/* Backgrounds */
--bg: #fbfbfe                /* Main background */
--bg-secondary: #f2f2f9      /* Cards, panels */
--bg-tertiary: #e8e8f2       /* Inputs, subtle backgrounds */
--bg-hover: #e3e3ed          /* Hover states */

/* Borders */
--border: #dcdce8
--border-hover: #c8c8db

/* Interactive */
--accent: #7b76d0            /* Primary buttons, links, focus */
--secondary: #998eec         /* Active states, highlights */
```

### Dark Theme
```css
/* Core Theme */
--text: #eae9fc
--background: #010104
--primary: #424c15
--secondary: #1e1371
--accent: #332f89

/* Text Colors */
--primary-text: #eae9fc
--secondary-text: #b8b7d4
--tertiary-text: #85849d

/* Backgrounds */
--bg: #010104
--bg-secondary: #0d0d1a
--bg-tertiary: #181829
--bg-hover: #222238

/* Interactive */
--accent: #5550a8
--secondary: #4a45a8
```

## Common Patterns

### Text
```tsx
// Headings
<h1 style={{ color: 'var(--primary-text)' }}>Heading</h1>

// Body text
<p style={{ color: 'var(--secondary-text)' }}>Paragraph</p>

// Muted/disabled text
<span style={{ color: 'var(--tertiary-text)' }}>Disabled</span>
```

### Buttons
```tsx
// Primary action
<button className="btn btn-primary">Save</button>

// Secondary action
<button className="btn btn-secondary">Cancel</button>

// Ghost button
<button className="btn btn-ghost">Menu</button>
```

### Cards
```tsx
<div className="card p-4">
  Content here
</div>
```

### Inputs
```tsx
<input className="input" placeholder="Enter text..." />
```

### Links
```tsx
// Links automatically use --accent
<a href="#">Link text</a>
```

## DO's and DON'Ts

### ✅ DO
- Use `--primary-text` for text (not `--primary`)
- Use `--accent` for interactive elements
- Use `--bg-secondary` for cards and panels
- Apply `className="btn btn-primary"` for buttons
- Use semantic color names

### ❌ DON'T
- Don't use `--primary` for text color (it's a background color)
- Don't use `--brand-primary` (deprecated, use `--accent`)
- Don't hardcode color values
- Don't use `--base` directly (use `--accent` instead)
- Don't forget to use the new text color variables

## Component Class Reference

### Buttons
```css
.btn              /* Base button styles */
.btn-primary      /* Accent background, white text */
.btn-secondary    /* Secondary background, primary text */
.btn-ghost        /* Transparent background */
```

### Cards
```css
.card            /* Elevated card with border */
```

### Inputs
```css
.input           /* Text input with focus states */
```

### Dropdowns
```css
.dropdown-menu   /* Dropdown container */
.dropdown-item   /* Dropdown item */
.dropdown-divider /* Separator */
```

### Modals
```css
.modal-overlay   /* Backdrop with blur */
.modal-content   /* Modal container */
.modal-header    /* Header with border */
.modal-body      /* Content area */
.modal-footer    /* Footer with actions */
```

## Migration Checklist

When updating a component:

- [ ] Replace `var(--primary)` with `var(--primary-text)` for text
- [ ] Replace `var(--secondary)` with `var(--secondary-text)` for text
- [ ] Replace `var(--tertiary)` with `var(--tertiary-text)` for text
- [ ] Replace `var(--brand-primary)` with `var(--accent)`
- [ ] Use `className="btn btn-primary"` instead of inline button styles
- [ ] Use `className="card"` for card containers
- [ ] Check hover and focus states use `--accent`
- [ ] Ensure backgrounds use `--bg`, `--bg-secondary`, or `--bg-tertiary`

## Quick Test

To verify the palette is working:

1. Check that `<html>` has `data-theme="light"` or `data-theme="dark"`
2. Text should be readable with good contrast
3. Interactive elements (buttons, links) should use purple/lavender tones
4. Hover states should have smooth transitions
5. Focus states should show accent-colored rings

## Theme Switching

```tsx
import { useTheme } from '@/components/ThemeProvider';

function ThemeToggle() {
  const { toggleTheme, getTheme } = useTheme();

  return (
    <button onClick={toggleTheme}>
      Current: {getTheme()}
    </button>
  );
}
```

---

**Remember:** The new palette uses soft, scholarly colors that are easier on the eyes for long reading sessions. The light theme uses soft purples and lavenders, while maintaining excellent readability.
