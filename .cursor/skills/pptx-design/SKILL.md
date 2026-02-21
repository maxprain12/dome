---
name: pptx-design
description: "PowerPoint/PPTX design for Dome. Use when creating ppt_create with script (Python/python-pptx) or spec. Palettes, typography, layouts. Script must call prs.save(os.environ['PPTX_OUTPUT_PATH'])."
---

# PPTX Design Skill

Guías de diseño para presentaciones en Dome. Para slides tematizadas, usa `ppt_create` con `script` (código Python / python-pptx).

## Python/python-pptx — Requisito obligatorio

El script debe terminar con:
```python
prs.save(os.environ['PPTX_OUTPUT_PATH'])
```

## Python — Básico

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import os

prs = Presentation()
prs.slide_width = Inches(10)
prs.slide_height = Inches(5.625)

def rgb(h):
    h = h.lstrip('#')
    return RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

slide = prs.slides.add_slide(prs.slide_layouts[6])
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = rgb('0D1B2A')
tb = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(1))
tf = tb.text_frame
p = tf.paragraphs[0]
r = p.add_run()
r.text = 'Título'
r.font.size = Pt(36)
r.font.bold = True

# Al final (OBLIGATORIO)
prs.save(os.environ['PPTX_OUTPUT_PATH'])
```

## Colores

- Hex **sin** "#": `"FF0000"`, `"1E2761"`
- Usar helper `rgb('1E2761')` para RGBColor en python-pptx

## Bullets

```python
add_bullets(slide, ['Item 1', 'Item 2', 'Item 3'], 0.5, 1, 8, 3)
```

Prepend `"• "` manualmente o usar helper add_bullets del ppt-context.

## Shapes

```python
slide.shapes.add_shape(1, Inches(1), Inches(1), Inches(3), Inches(2))
# Rectángulo = 1, Oval = 9
```

## Paletas (hex sin #)

| Theme | Primary | Accent |
|-------|---------|--------|
| Midnight Executive | 1E2761 | FFFFFF |
| Forest & Moss | 2C5F2D | F5F5F5 |
| Ocean Gradient | 065A82 | 21295C |
| Coral Energy | F96167 | 2F3C7E |

## Imágenes desde URL

python-pptx no acepta URLs. Usar helper con urllib:

```python
from urllib.request import urlopen
from io import BytesIO

def add_picture_from_url(slide, url, x, y, w, h):
    data = BytesIO(urlopen(url).read())
    slide.shapes.add_picture(data, Inches(x), Inches(y), Inches(w), Inches(h))

# Picsum (como en posts): https://picsum.photos/seed/{seed}/{width}/{height}
add_picture_from_url(slide, 'https://picsum.photos/seed/tech-architecture/400/300', 5.5, 1.0, 4.0, 3.0)
```

## Reglas

- Cada slide con contenido REAL del documento — nunca placeholders ni slides vacías
- Contraste WCAG AA: fondo oscuro → texto claro (FFFFFF, E0E1DD); fondo claro → texto oscuro (1E2761, 2D3748). Nunca texto oscuro sobre fondo oscuro.
- Una idea por slide
- Máx 5-7 bullets
- Sin líneas bajo títulos
- Cada slide con elemento visual (shape, icono, etc.)
