# Dome - LinkedIn Visual Style Guide (Minimal Edition)
## Knowledge Management & Academic Research | 100% Offline

---

## 🎨 Design Philosophy

### Minimalist Principles
- **Less is more**: Remove decorative elements that don't serve a purpose
- **Whitespace as design**: Let content breathe
- **Typography hierarchy**: Use size and weight, not color, for emphasis
- **Purposeful color**: Color draws attention, use sparingly
- **Icon system**: Lucide icons only (consistent, professional)

### Brand Identity

**Logo: Many Ghost**
- SVG provided: Clean, simple, recognizable
- Usage: Top-left corner or alongside content
- Size range: 70-120px depending on template
- Always use the original SVG (no recreations)

---

## 🎨 Color Palette (Refined & Minimal)

### Primary Colors
```
Background White:    #FFFFFF
Background Gray:     #FAFAFA
Many Green:          #E0EAB4 (from SVG)
Many Outline:        #596037 (from SVG)
```

### Text Colors
```
Primary Text:        #1A1A1A
Secondary Text:      #6B6B6B
Tertiary Text:       #8A8A8A
```

### Accent Colors (Use Sparingly)
```
Accent Green:        #596037 (for highlights)
Border Gray:         #E5E5E5
Background Gray:     #FAFAFA
```

### Dark Mode (Tech Posts Only)
```
Background:          #1A1A1A
Card Background:     #0F0F0F
Primary Text:        #FFFFFF
Secondary Text:      #B0B0B0
Tertiary Text:       #8A8A8A
Accent:              #E0EAB4
```

---

## 📐 Layout System

### Grid & Spacing
```
Base unit: 8px
Padding:   60px (desktop), 40px (mobile)
Gaps:      20px (tight), 32px (normal), 60px (loose)
Margins:   24px, 32px, 48px, 80px
```

### Dimensions
```
LinkedIn Post Square:    1200x1200px
LinkedIn Post Vertical:  1200x1500px
Instagram Square:        1080x1080px
```

### Safe Zones
```
Keep important content:
- 80px from edges on 1200x1200
- 60px from edges on 1080x1080
```

---

## 🖋️ Typography System

### Font Stack
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Monospace (code/tech)**:
```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

### Type Scale
```
Hero Title:     72-82px, weight 700, line-height 0.95
H1 Title:       48-56px, weight 700, line-height 1.1
H2 Subtitle:    28-32px, weight 600, line-height 1.2
Body Large:     20-24px, weight 400, line-height 1.6
Body:           18-20px, weight 400, line-height 1.5
Body Small:     16-18px, weight 400, line-height 1.5
Caption:        14-16px, weight 500, line-height 1.4
Label:          14px,    weight 600, uppercase
```

### Letter Spacing
```
Headlines:     -0.02em
Subheadings:   -0.01em
Body:          0
Labels:        0.05em (uppercase only)
```

---

## ✏️ Icon System: Lucide

### Why Lucide?
- Consistent stroke width (2px standard)
- Professional, minimal aesthetic
- Extensive library (1000+ icons)
- MIT licensed, free
- CDN available

### Usage Guidelines
```html
<!-- Always use from CDN -->
<script src="https://unpkg.com/lucide@latest"></script>

<!-- Or inline SVG -->
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <path d="..."/>
</svg>
```

### Icon Sizes
```
Small:    20-24px (inline with text)
Medium:   28-32px (section headers)
Large:    40-48px (hero sections)
```

### Recommended Icons for Dome
```
Features:
- check (checkmark)
- tag (tagging)
- link (connections)
- search (search)
- lock (privacy)
- zap (performance)
- shield (security)
- database (storage)
- cpu (processing)

Actions:
- arrow-right (CTA)
- external-link (links)
- download (downloads)
- upload (uploads)

Content:
- book-open (research)
- lightbulb (ideas)
- target (goals)
- sparkles (AI/ML)
```

---

## 📱 Template Structures

### Template 1: Feature Announcement (1200x1200)
```
┌────────────────────────┐
│ [Many]                 │ 80px padding
│                        │
│                        │
│   [Icon]               │ Center-aligned
│   Title (82px)         │ content area
│   Subtitle (28px)      │
│                        │
│   ✓ Feature 1          │ Clean list
│   ✓ Feature 2          │ with checks
│   ✓ Feature 3          │
│                        │
│ ─────────────────────  │
│ Badge    |    Link     │ Footer
└────────────────────────┘
```

### Template 2: Tips List (1080x1080)
```
┌────────────────────────┐
│ [Many]           #05   │ Header
│                        │
│   [Icon] Title         │
│                        │
│ 1 [icon] Tip text      │ Minimal
│ ─────────────────────  │ cards
│ 2 [icon] Tip text      │ with
│ ─────────────────────  │ dividers
│ 3 [icon] Tip text      │
│ ─────────────────────  │
│ 4 [icon] Tip text      │
│                        │
│ CTA          |    Link │ Footer
└────────────────────────┘
```

### Template 3: Story/Case (1200x1500)
```
┌────────────────────────┐
│ [Many] Title           │ Header with
│        Subtitle        │ border
│ ─────────────────────  │
│                        │
│ │ "Quote in italics    │ Quote with
│ │  Author name"        │ left border
│                        │
│   [Icon] Section       │
│   Body text paragraph  │ Story
│                        │ content
│   ┌──────┬──────┐     │ Stats
│   │ Stat │ Stat │     │ grid
│   └──────┴──────┘     │
│                        │
│ ─────────────────────  │
│ [icon] CTA  |   Link   │ Footer
│                        │
│ #hashtags              │
└────────────────────────┘
```

### Template 4: Tech Deep Dive (1200x1200)
```
┌────────────────────────┐ Dark
│ [Many]      dome/tech  │ background
│                        │ (#1A1A1A)
│   [Icon] Title         │
│   Subtitle             │
│                        │
│ > tech_stack           │
│ ┌──────┬──────┐       │ Tech
│ │ Tech │ Tech │       │ grid
│ └──────┴──────┘       │
│                        │
│ ┌──────────────┐      │ Code
│ │ // code here │      │ block
│ └──────────────┘      │
│                        │
│ [Icon] Why it matters  │ Explanation
│ Text explanation       │
│                        │
│ #tags    |    link     │ Footer
└────────────────────────┘
```

### Template 5: Use Case Collage (Paper) (1200x1500)
```
┌──────────┬──────────┬──────────┐
│ [Many]   │          │ Title    │ Fondo fragmentado:
│ zone 1   │  zone 2  │ (serif)  │ grid 3x3 de zonas
├──────────┼──────────┼──────────┤   con tonos distintos
│  ┌────┐  │          │  ┌────┐  │ (#FAFAFA, #FFF, #EEF0E8…)
│  │note│  │  zone 5  │  │note│  │ Varios recortes de
│  └────┘  │          │  └────┘  │ papel (blanco, sombra,
├──────────┼──────────┼──────────┤   rotación sutil) con
│ zone 4   │  ┌────┐  │  zone 6  │ citas/testimonios cortos
│          │  │note│  │          │ en sans-serif.
│          │  └────┘  │          │
├──────────┴──────────┴──────────┤
│ [icon] CTA  |   github link    │ Footer
└────────────────────────────────┘
```

- **Fondo fragmentado**: Grid 3×3 de zonas (`.zone`) con tonos ligeramente distintos (#F5F5F5, #FFFFFF, #EEF0E8, #F8F8F8, #F0F2EE). Separación 3px, fondo del contenedor #1A1A1A.
- **Tipografía**: Título en una zona en serif (Lora/Georgia, ~26px). Texto de los recortes en Inter (sans-serif), 14–16px.
- **Recortes de papel** (`.paper-cut`): Varios por post (4–5). `background: #FFFFFF`, `box-shadow: 0 2px 10px rgba(0,0,0,0.1)`, `border: 1px solid #E5E5E5`, `transform: rotate(-1.5deg)` (u otros ángulos sutiles). Citas/testimonios cortos por recorte.
- **Imágenes de stock**: Cada zona usa una imagen de [Picsum Photos](https://picsum.photos) (API gratuita, sin clave). URL: `https://picsum.photos/seed/{seed}/400/476`. Seeds temáticos por post (ej. academic-desk, student-campus, pro-office, writer-typewriter).
- **Toque retro**: Sobre las imágenes, `filter: sepia(0.22) contrast(1.06) saturate(0.88)`. Overlay en degradado en cada zona para legibilidad del título.
- **Granulado fotográfico**: Capa `.grain-overlay` con SVG `feTurbulence` (noise), `opacity: 0.06`, cubriendo todo el post.
- **Uso**: Casos de uso y casos de éxito de Dome; contenido en español.

---

## 🎯 Design Rules

### DO ✅
- Use generous whitespace (minimum 60px padding)
- Stick to 2-3 font sizes per post
- Use Many logo consistently in same position
- Align everything to a grid
- Use Lucide icons exclusively
- Keep backgrounds white or #FAFAFA (except dark tech posts)
- Use single accent color per post
- Make text hierarchy clear through size/weight, not color
- Test readability on mobile

### DON'T ❌
- Use emoji (use Lucide icons instead)
- Use gradients (except subtle on dark backgrounds)
- Use more than 3 colors
- Use decorative elements
- Center-align body text
- Use multiple font families (exception: Template 5 uses serif for title + sans-serif for paper)
- Over-decorate with borders/shadows (exception: paper-cut component in Template 5)
- Use stock photos
- Clutter with too many elements

---

## 📐 Component Library

### Many Logo Component
```html
<div style="width: 80px; height: 80px;">
  <svg viewBox="0 0 500 500" fill="none">
    [Use provided SVG code]
  </svg>
</div>
```

### Checkmark List Item
```html
<div style="display: flex; gap: 20px;">
  <svg width="24" height="24" stroke="#596037">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
  <span>Feature text</span>
</div>
```

### Section Divider
```html
<div style="border-top: 1px solid #E5E5E5;"></div>
```

### Card (Minimal)
```html
<div style="background: #FAFAFA; 
            padding: 32px; 
            border-radius: 8px;">
  Content
</div>
```

### Quote Block
```html
<div style="border-left: 3px solid #E0EAB4;
            padding-left: 48px;">
  <p style="font-style: italic;">"Quote"</p>
  <p>— Author</p>
</div>
```

---

## 🎨 Color Usage Guidelines

### Light Theme (Default)
- **Background**: White (#FFFFFF) or very light gray (#FAFAFA)
- **Text**: Dark gray scale (#1A1A1A → #8A8A8A)
- **Accents**: Many green (#596037) for icons, highlights
- **Borders**: Light gray (#E5E5E5)

### Dark Theme (Tech Posts)
- **Background**: Near black (#1A1A1A)
- **Text**: White → gray scale (#FFFFFF → #8A8A8A)
- **Accents**: Many green (#E0EAB4) brighter for contrast
- **Borders**: Dark gray with transparency

### Accent Color Priority
1. Many green (#596037 or #E0EAB4)
2. Black/White (contrast)
3. Gray (structure)

**Never use**:
- Bright blues, reds, yellows (except dark mode subtle accents)
- Multiple accent colors
- Color for decoration only

---

## 📏 Spacing Scale

### Consistent Spacing
```
4px   - Micro spacing (icon to text)
8px   - Base unit
12px  - Tight
16px  - Compact
20px  - Comfortable (list items)
24px  - Standard
32px  - Loose
48px  - Section spacing
60px  - Large gaps
80px  - Container padding
```

### Margin & Padding Patterns
```
Small elements:   16-20px
Medium elements:  24-32px
Large sections:   48-80px
Container edges:  60-80px
```

---

## 🔤 Text Formatting

### Emphasis Techniques
```
Primary hierarchy:   Font size
Secondary hierarchy: Font weight
Tertiary:           Color (sparingly)
Never use:          Underline, italic (except quotes)
```

### Line Length
```
Optimal:  60-75 characters
Maximum:  85 characters
Titles:   No limit (wrap naturally)
```

### Alignment
```
Titles:      Left or center (be consistent)
Body:        Always left
Captions:    Left
Numbers:     Right (in tables)
```

---

## 📱 Responsive Considerations

### Mobile View (Critical)
LinkedIn mobile shows ~60% of desktop width:
- Text minimum 18px
- Icons minimum 24px
- Padding minimum 40px
- Test all posts at 600px width

### Desktop Optimization
- Use full canvas
- Generous whitespace
- Clear hierarchy
- Sharp text rendering

---

## 🛠️ Tools & Resources

### Design Tools
- **Figma**: Best for component systems
- **Canva Pro**: Quick iterations
- **SVG Editor**: For Many modifications

### Icon Library
- **Lucide**: https://lucide.dev
- Download: https://github.com/lucide-icons/lucide
- CDN: https://unpkg.com/lucide@latest

### Font Resources
- **Inter**: https://rsms.me/inter/
- **JetBrains Mono**: https://jetbrains.com/mono/
- Google Fonts: Both available

### Color Tools
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Coolors**: For palette verification
- Target: AAA contrast for body text

---

## ✅ Quality Checklist

Before publishing:
- [ ] Many logo present and sized correctly
- [ ] Only Lucide icons used (no emoji)
- [ ] Text readable at 50% zoom
- [ ] Proper padding (60-80px)
- [ ] Consistent spacing scale
- [ ] Maximum 3 colors total
- [ ] Alignment is consistent
- [ ] Clean hierarchy (size/weight)
- [ ] Footer present with CTA
- [ ] GitHub link included
- [ ] Mobile-tested (600px width)
- [ ] No decorative elements
- [ ] Background is white or #FAFAFA (or #1A1A1A for tech)

---

## 🎯 Post Type Characteristics

### Feature Announcement
- **Vibe**: Clean, professional, exciting
- **Background**: White
- **Many**: Top-left, 120px
- **Icon**: Single feature icon (48px)
- **Layout**: Centered content

### Tips & Tricks
- **Vibe**: Educational, organized
- **Background**: White
- **Many**: Top-left, 70px
- **Icons**: Multiple (24px each)
- **Layout**: List with dividers

### Use Case / Story
- **Vibe**: Narrative, human
- **Background**: White
- **Many**: With header, 80px
- **Quote**: Left border accent
- **Layout**: Vertical flow

### Use Case Collage (Paper)
- **Vibe**: Collage, paper cut, cases of success
- **Background**: White
- **Many**: Top-left corner, 80px
- **Title**: Serif (Lora/Georgia), 72px
- **Paper cut**: Shadow, slight rotation, sans-serif text
- **Layout**: Hero title + one or two paper overlays, footer

### Tech Deep Dive
- **Vibe**: Technical, sophisticated
- **Background**: Dark (#1A1A1A)
- **Many**: Top-left, 90px
- **Code**: Monospace font
- **Layout**: Structured sections

---

## 🎨 Brand Consistency

### Always Include
1. Many ghost logo (proper SVG)
2. GitHub link (github.com/maxprain12/dome)
3. Consistent spacing system
4. Lucide icons only
5. Inter font (or system fallback)

### Never Include
1. Emoji (❌ use Lucide icons instead)
2. Stock photos
3. Decorative patterns
4. Multiple fonts
5. Bright colors outside palette
6. Gradients (except subtle on dark)
7. Drop shadows (except minimal card shadows)

---

## 📈 A/B Testing Framework

### Test Variables
- Title size: 72px vs 82px
- Many position: Top-left vs centered
- Background: Pure white vs #FAFAFA
- Icon style: Outlined vs minimal
- Layout: Centered vs left-aligned

### Metrics to Track
- Impressions
- Engagement rate
- Click-through rate
- Comments
- Saves

### Test Duration
- Minimum 5 posts per variant
- Track over 2 weeks
- Document findings

---

**Version**: 2.0 (Minimal Edition)  
**Updated**: February 2026  
**For**: Dome by maxprain12  
**Icon System**: Lucide  
**Many SVG**: Provided by user
