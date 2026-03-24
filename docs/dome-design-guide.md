# Guía de diseño Dome — Identidad visual y contenido

Documento de referencia para mantener coherencia entre la aplicación **Dome** (producto) y los **materiales de comunicación** (posts, presentaciones, gráficos). Los valores numéricos de color y tipografía provienen de la implementación actual en `app/globals.css`.

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
4. **Accesibilidad** — Contraste mínimo orientado a **WCAG AA** en texto sobre fondo (la app usa combinaciones validadas en tema claro).

---

## 3. Paleta de color oficial

La identidad visual actual es **minimalista**, con acento **verde oliva** (“Many” / interacción) y fondos **grises neutros**. No usar la paleta morada/lavanda de documentación antigua si el objetivo es alinear el post con la app **tal como se ve hoy**.

### 3.1 Tema claro (uso principal en capturas y mockups)

| Rol | Variable CSS | Hex (referencia) | Uso en posts |
|-----|--------------|------------------|----------------|
| Texto principal | `--primary-text` | `#1A1A1A` | Titulares, cuerpo principal |
| Texto secundario | `--secondary-text` | `#5C5C5C` | Subtítulos, pies de foto |
| Texto terciario | `--tertiary-text` | `#6B6B6B` | Metadatos, leyendas pequeñas |
| Fondo principal | `--bg` | `#FAFAFA` | Fondo de carrusel o plantilla |
| Superficie / tarjeta | `--bg-secondary` | `#FFFFFF` | Paneles, “cards” en gráficos |
| Fondo sutil | `--bg-tertiary` | `#F5F5F5` | Bloques de cita o zonas secundarias |
| Borde | `--border` | `#E5E5E5` | Separadores y marcos suaves |
| Acento / marca | `--accent`, `--base` | `#596037` | Logo wordmark, botones, iconos activos, enlaces en piezas |
| Acento secundario (highlight) | `--secondary` (Many Green) | `#E0EAB4` | Fondos de badge, chips, destacados suaves |
| Éxito (semántico) | `--success` | `#596037` | Estados positivos (alineado al acento) |
| Error | `--error` | `#E88585` | Solo alertas reales, con moderación |
| Info | `--info` | `#7B9DD0` | Tips o notas informativas |

**Sidebar (solo contexto app):** `--dome-sidebar-bg` en claro: `#f0f0ed` (tono piedra cálido). Útil si maquetas una captura con barra lateral.

### 3.2 Tema oscuro (capturas nocturnas o piezas “dark mode”)

| Rol | Variable | Hex (referencia) |
|-----|----------|------------------|
| Texto principal | `--primary-text` | `#E8E8E8` |
| Fondo | `--bg` | `#121212` |
| Superficie | `--bg-secondary` | `#1E1E1E` |
| Acento | `--accent` | `#A4AD7A` |

### 3.3 Reglas rápidas para identidad corporativa

- **Primario para “marca” en gráficos:** oliva `#596037` sobre fondo `#FAFAFA` o blanco `#FFFFFF`.
- **Secundario para áreas suaves:** verde pálido `#E0EAB4` (no como texto largo; mejor como fondo de etiqueta).
- **No mezclar** con paletas genéricas (azul cielo `#0ea5e9`, morados fuertes) salvo campañas puntuales que expliquen la excepción.
- **Exportación:** en PNG/JPG para redes, comprobar contraste del texto sobre el fondo elegido (herramientas: WebAIM Contrast Checker, Stark, etc.).

---

## 4. Tipografía

Definición en producto (`app/globals.css`):

| Uso | Familia |
|-----|---------|
| UI y marketing general | **Inter** — `var(--font-sans)` |
| Código, snippets, CLI | **JetBrains Mono** — `var(--font-mono)` |

**Stack completo (referencia):**

```text
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

### Escala sugerida para gráficos y posts (alineada a la guía UI interna)

| Nivel | Tamaño aprox. | Peso | Uso |
|-------|----------------|------|-----|
| H1 | 24 px | 600 | Título principal del post (imagen) |
| H2 | 18 px | 600 | Subtítulo o sección |
| H3 | 16 px | 600 | Encabezados de lista |
| Cuerpo | 14 px | 400 | Párrafos en carruseles multi-slide |
| Pequeño / pie | 12–13 px | 400–500 | Créditos, “Más en dome.app”, disclaimers |

**Normas de copy en UI (aplicables a microcopy en imágenes):**

- Preferir **sentence case** (“Organiza tu investigación”) frente a **Title Case** excesivo.
- Etiquetas cortas: **2–4 palabras** cuando el espacio es limitado.
- Mayúsculas solo en **overlines** o categorías muy breves.

---

## 5. Espaciado, radios y sombras

### 5.1 Grid de espaciado (base 4 px)

Variables: `--space-1` (4px) … `--space-12` (48px).

**Patrones:**

| Contexto | Valor típico |
|----------|----------------|
| Icono ↔ texto | 8 px (`--space-2`) |
| Entre bloques en un slide | 16–24 px |
| Padding de “card” en mockup | 16–24 px |
| Margen seguro en bordes del arte (redes) | ≥ 24 px del borde del lienzo |

### 5.2 Radios de esquina

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 4 px | Tags, chips |
| `--radius-md` | 6 px | Botones, inputs |
| `--radius-lg` | 8 px | Tarjetas |
| `--radius-xl` | 12 px | Paneles grandes |
| `--radius-2xl` | 16 px | Modales / hero |
| `--radius-full` | píldora | Avatares, badges redondos |

### 5.3 Sombras (minimal)

En tema claro las sombras son muy suaves (`--shadow-sm` … `--shadow-xl`). En piezas promocionales, **no exagerar** la profundidad: coherencia con la UI real.

### 5.4 Movimiento (si animas video o motion)

- Rápido: **120 ms** (`--transition-fast`)
- Estándar: **220 ms** (`--transition-base`)
- Lento / énfasis: **300 ms** con curva `cubic-bezier(0.16, 1, 0.3, 1)` (`--transition-slow`)

Respeta **prefers-reduced-motion** en web; en video, evita parpadeos rápidos.

---

## 6. Tono de voz y contenido para posts

| Hacer | Evitar |
|-------|--------|
| Beneficios concretos (flujo de trabajo, tiempo, foco) | Superlativos vacíos (“el mejor”, “revolucionario”) |
| “Tú” o “tu biblioteca” cuando sea natural | Jerga interna de repo (`IPC`, `SQLite`) salvo audiencia técnica |
| Verbos de acción en CTA: “Descargar”, “Probar”, “Organizar” | CTAs genéricos: “Click aquí” |
| Honestidad sobre límites (beta, requisitos del sistema) | Promesas de disponibilidad cloud si el mensaje es solo local |

**Ejemplo de línea de asunto / pie:**

- Bueno: “Dome reúne notas, PDFs y agentes de IA en un solo escritorio.”
- Regular: “La plataforma definitiva del futuro del conocimiento.”

---

## 7. Plantillas visuales para publicaciones

### 7.1 Post tipo “anuncio de función”

1. Fondo: `--bg` o `--bg-secondary`.
2. Barra superior o lateral fina en `--accent` (#596037) como identificador de marca.
3. Título en Inter semibold, `--primary-text`.
4. Una captura de pantalla real con **sombra ligera** y radio `--radius-lg`.
5. Pie: versión de app o “dome.app” en `--secondary-text`, 12–13 px.

### 7.2 Post tipo “cita / tip de investigación”

1. Fondo `--bg-tertiary` o bloque `--secondary` (#E0EAB4) con texto `--primary-text` (comprobar contraste).
2. Cita en cuerpo 16–18 px; autor o fuente en `--tertiary-text`.

### 7.3 Carrusel (LinkedIn / Instagram)

- Slide 1: problema + promesa (máx. 2 líneas de título).
- Slides intermedios: un concepto por slide; numeración discreta (`--tertiary-text`).
- Último slide: CTA + URL o handle; fondo blanco o `#FAFAFA` con acento oliva en botón o subrayado.

---

## 8. Logo y activos

- Usar los activos del repositorio (`assets/`, iconos de app) sin deformar proporciones.
- En tema oscuro, la app aplica filtros al logo en ciertos contextos (`--dome-logo-filter`); en material externo, preferir **logo sobre fondo claro** o versión monocromo derivada del acento oliva para máxima claridad.

---

## 9. Checklist antes de publicar

- [ ] Colores alineados a la sección 3 (sin mezclar paletas legacy).
- [ ] Texto principal legible (contraste AA en cuerpo).
- [ ] Tipografía Inter (o sistema del lienzo si Inter no está disponible: usar **Segoe UI** / **Roboto** como sustituto cercano, no fuentes decorativas).
- [ ] Márgenes seguros y bordes no recortados en redes.
- [ ] Un solo mensaje principal por pieza.
- [ ] CTA o siguiente paso claro (web, descarga, newsletter).

---

## 10. Referencias en el repositorio

| Recurso | Ruta |
|---------|------|
| Tokens CSS (fuente de verdad) | `app/globals.css` |
| Paleta histórica / notas (puede estar desactualizada respecto al código) | `.claude/rules/new-color-palette.md` |
| Guía UI genérica (valores antiguos de marca) | `.claude/rules/ui-style-guidelines.md` |

Si hay discrepancia entre documentos y código, **prevalece `app/globals.css`**.

---

## 11. Versión

- **Guía:** 1.0  
- **Basada en:** `app/globals.css` (temas `light` / `dark`)  
- **Objetivo:** coherencia de marca en posts, presentaciones y capturas promocionales de Dome.
