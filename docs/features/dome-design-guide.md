# Guía de diseño Dome — Identidad visual y contenido

Documento de referencia para mantener coherencia entre la aplicación **Dome** (producto) y los **materiales de comunicación** (posts, presentaciones, gráficos). Los valores numéricos de color y tipografía provienen de `app/globals.css` y la hoja corporativa Dome.

---

## 1. Qué es Dome (marca en una frase)

**Dome** es una aplicación de escritorio para **gestión del conocimiento e investigación académica**: notas, PDFs, agentes de IA, automatizaciones y búsqueda semántica, en un entorno nativo y enfocado.

**Atributos de marca útiles al redactar o diseñar:**

| Atributo | Cómo traducirlo en diseño y copy |
|----------|----------------------------------|
| Enfoque y profundidad | Poca decoración; jerarquía clara; textos útiles, no slogans vacíos |
| Estudio y lectura | Fondos suaves, buen contraste, sin saturación agresiva |
| Herramienta profesional | Tono directo; evitar exceso de jerga de marketing |
| Privacidad / escritorio | “En tu equipo”, “local”, “tu biblioteca” cuando aplique |

---

## 2. Principios de diseño (alineados con el producto)

1. **Claridad antes que ornamentación** — Cada elemento debe tener función; el espacio en blanco es parte del sistema.
2. **Jerarquía consistente** — Título → subtítulo → cuerpo → detalle; un solo color de acento por pieza.
3. **Feedback y estados** — En UI: hover, focus y estados de carga visibles. En gráficos estáticos: CTAs o pies de imagen legibles.
4. **Accesibilidad** — Contraste mínimo orientado a **WCAG AA** en texto sobre fondo.

---

## 3. Paleta de color oficial

Identidad **forest / lime / mint / lavender**. No usar paletas moradas antiguas ni azules genéricos salvo campañas puntuales.

### 3.1 Tema claro

| Rol | Variable CSS | Hex | Uso |
|-----|--------------|-----|-----|
| Texto / ink | `--foreground` | `#1A1A1A` | Titulares, cuerpo |
| Texto muted | `--muted-foreground` | `#8C8C8C` | Metadatos |
| Fondo chrome | `--background` | `#F2F2F2` | Fondo app / carrusel |
| Superficie | `--card` | `#FFFFFF` | Cards, paneles |
| Primary / CTA | `--primary` | `#4A5D3F` | Botones, wordmark, iconos activos |
| Hover | `--primary-hover` | `#5E7153` | Hover de CTA |
| Lime | `--brand-lime` | `#DDE9B2` | Chips, soft buttons, cards tinted |
| Mint | `--brand-mint` | `#EEF5E0` | Hover soft, fondos sutiles |
| Lavender | `--brand-lavender` | `#CFD1EB` | Acento secundario / tags |
| Borde | `--border` | `#D9D9D9` | Separadores |
| Éxito | `--success` | `#5B8F42` | Estados positivos |
| Error | `--destructive` | `#BD3F32` | Alertas reales |

### 3.2 Tema oscuro (equivalentes)

| Rol | Hex |
|-----|-----|
| Fondo | `#141612` |
| Superficie | `#1C1F1A` |
| Texto | `#F2F2F0` |
| Primary (sage) | `#A8B89A` |
| Primary hover | `#B8C6AA` |
| Lime / mint / lavender | `#3A4228` / `#2A3020` / `#2E2F3A` |
| Destructive | `#E07066` |
| Success | `#8FBC6E` |

### 3.3 Reglas rápidas

- **Primario marca:** forest `#4A5D3F` sobre `#F2F2F2` o blanco.
- **Suaves:** lime / mint como fondos de etiqueta, no como texto largo.
- **Botones:** pill; primary solid; secondary/outline con borde forest; soft = lime.
- **Exportación:** comprobar contraste (WebAIM, Stark, etc.).

---

## 4. Tipografía

| Uso | Familia |
|-----|---------|
| UI y marketing | **Inter** — `var(--font-sans)` |
| Código | **JetBrains Mono** — `var(--font-mono)` |

### Escala de marca (gráficos, heroes, empty states)

| Nivel | Tamaño / line-height | Peso | Token |
|-------|----------------------|------|-------|
| H1 | 40 / 48 | 700 | `--text-h1` · `text-brand-h1` |
| H2 | 32 / 40 | 700 | `--text-h2` |
| H3 | 24 / 32 | 700 | `--text-h3` |
| Body | 16 / 24 | 400 | `--text-body` |
| Body sm | 14 / 20 | 400 | `--text-body-sm` |
| Caption | 12 / 16 | 500 | `--text-caption` |

### UI de producto

Controles y listas densas: `text-xs` / `text-sm` de shadcn. No aplicar H1 40px a toolbars.

**Normas de copy:** sentence case; etiquetas 2–4 palabras; mayúsculas solo en overlines breves.

---

## 5. Espaciado, radios y sombras

### 5.1 Grid (base 4 px)

`--space-1` (4px) … `--space-12` (48px).

### 5.2 Radios

| Superficie | Tratamiento |
|------------|-------------|
| Botones / chips | `rounded-full` (pill) |
| Inputs | `rounded-md` (~8–10px) |
| Cards | `rounded-2xl` (~16–22px con `--radius: 0.75rem`) |

### 5.3 Motion

Tokens en `globals.css`: `--ease-out`, `--duration-press` (150ms), `--duration-popover` (200ms), `--duration-overlay` (250ms). Overlays shadcn y `Button` press los usan. Respetar `prefers-reduced-motion`.

---

## 6. Componentes de referencia (producto)

Ver implementación en `app/components/ui/button.tsx`, `badge.tsx`, `card.tsx` y reglas en `.claude/rules/new-color-palette.md`.

---

## 7. Checklist para piezas estáticas

- [ ] Forest `#4A5D3F` como acento principal (no morado legacy)
- [ ] Inter en títulos y cuerpo
- [ ] Contraste AA en texto sobre fondos lime/mint
- [ ] Botones con forma pill en mockups de UI
- [ ] Dark: sage `#A8B89A`, no primary blanco puro
