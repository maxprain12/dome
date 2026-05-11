---
name: pptx-design
description: "PowerPoint/PPTX design for Dome. Use when creating ppt_create with PptxGenJS (script) or spec. Palettes, typography, layouts. Script must await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })."
---

# PPTX Design Skill

Guías de diseño para presentaciones en Dome. Usa `ppt_create` con `spec` (JSON) o `script` (PptxGenJS / JavaScript). **Python no está soportado.**

## PptxGenJS — fin de script

```javascript
await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
```

## PptxGenJS — básico

```javascript
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';

const slide = pres.addSlide();
slide.background = { color: '0D1B2A' };
slide.addText('Título', {
  x: 0.5, y: 0.5, w: 9, h: 1,
  fontSize: 36, bold: true, color: 'FFFFFF',
});

await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH });
```

## Colores

PptxGenJS usa hex **sin** `#` en opciones: `color: 'FFFFFF'`, `fill: { color: '1E2761' }`.

## Bullets

```javascript
slide.addText(
  [
    { text: 'Item 1', options: { bullet: true, breakLine: true } },
    { text: 'Item 2', options: { bullet: true } },
  ],
  { x: 0.5, y: 1.2, w: 8, h: 3, fontSize: 16, color: 'E0E1DD' }
);
```

## Shapes

```javascript
slide.addShape(pres.ShapeType.rect, {
  x: 0, y: 0, w: 0.15, h: 5.625,
  fill: { color: 'CADCFC' },
});
```

## Paletas (hex sin #)

| Theme | Primary | Accent |
|-------|---------|--------|
| Midnight Executive | 1E2761 | FFFFFF |
| Forest & Moss | 2C5F2D | F5F5F5 |
| Ocean Gradient | 065A82 | 21295C |
| Coral Energy | F96167 | 2F3C7E |

## Imágenes

En el runner no hay `fetch` genérico: usa rutas locales o base64 según la API de PptxGenJS (`addImage`). Para fotos remotas, el usuario debe tener archivo local o usar otro flujo.

## Reglas

- Contenido REAL del documento — nunca placeholders
- Contraste WCAG AA
- Una idea por slide; máx ~6 bullets
- Sin líneas bajo títulos
- Con `script`, añade elementos visuales (formas, tabla, gráfico) cuando aplique
