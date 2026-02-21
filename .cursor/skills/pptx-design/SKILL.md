---
name: pptx-design
description: "PowerPoint/PPTX design for Dome. Use when creating ppt_create with script (PptxGenJS) or spec. Palettes, typography, layouts, PptxGenJS tutorial. Script must call pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })."
---

# PPTX Design Skill

Guías de diseño para presentaciones en Dome. Para slides tematizadas, usa `ppt_create` con `script` (código PptxGenJS).

## PptxGenJS — Requisito obligatorio

El script debe terminar con:
```javascript
pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
```

## PptxGenJS — Básico

```javascript
const PptxGenJS = require('pptxgenjs');
const pres = new PptxGenJS();
pres.layout = 'LAYOUT_16x9';
pres.title = 'Título';

// Slide
const s = pres.addSlide();
s.background = { color: '0D1B2A' };
s.addText('Título', { x: 0.5, y: 0.5, w: 9, fontSize: 36, bold: true, color: 'FFFFFF' });

// Al final (OBLIGATORIO)
pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
```

## Colores

- Hex **sin** "#": `"FF0000"`, `"1E2761"`
- PptxGenJS no acepta "#" en colores

## Bullets

```javascript
slide.addText([
  { text: 'Item 1', options: { bullet: true, breakLine: true } },
  { text: 'Item 2', options: { bullet: true } }
], { x: 0.5, y: 1, w: 8, h: 3 });
```

Nunca usar "•" como carácter; usar `bullet: true`.

## Shapes

```javascript
slide.addShape(pres.shapes.RECTANGLE, { x: 1, y: 1, w: 3, h: 2, fill: { color: '1E2761' } });
```

## Paletas (hex sin #)

| Theme | Primary | Accent |
|-------|---------|--------|
| Midnight Executive | 1E2761 | FFFFFF |
| Forest & Moss | 2C5F2D | F5F5F5 |
| Ocean Gradient | 065A82 | 21295C |
| Coral Energy | F96167 | 2F3C7E |

## Reglas

- Contraste WCAG AA
- Una idea por slide
- Máx 5-7 bullets
- Sin líneas bajo títulos
- Cada slide con elemento visual (shape, icono, etc.)
