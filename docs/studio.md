# Studio

Documentación del generador de contenido de Dome: transforma tus recursos en materiales de estudio y trabajo.

---

## ¿Qué es el Studio?

El **Studio** utiliza IA para generar automáticamente diferentes tipos de contenido a partir de uno o varios recursos de tu biblioteca. Es la forma más rápida de extraer valor de tus documentos sin tener que leerlos completos.

---

## Tipos de generación

| Tipo | Descripción | Output |
|------|-------------|--------|
| **Resumen** | Síntesis concisa del contenido principal | Nota en Dome |
| **Mindmap** | Mapa mental visual de conceptos y relaciones | Nota con diagrama |
| **Quiz** | Preguntas de opción múltiple para evaluar comprensión | Nota con preguntas |
| **Flashcards** | Tarjetas de memoria frente/reverso | Deck en Flashcards |
| **Guide** | Guía paso a paso o tutorial estructurado | Nota en Dome |
| **FAQ** | Preguntas frecuentes con respuestas | Nota en Dome |
| **Timeline** | Línea temporal de eventos o pasos | Nota en Dome |

---

## Acceder al Studio

### Desde un recurso abierto

1. Abre cualquier recurso (PDF, nota, URL, video)
2. Haz clic en el icono **Studio** (varita mágica ✨) en la barra de herramientas del workspace
3. Selecciona el tipo de contenido a generar
4. Configura opciones si las hay (idioma, profundidad, número de items)
5. Haz clic en **Generar**

### Desde múltiples recursos

1. Selecciona varios recursos en la vista de proyecto (Cmd+Click)
2. Haz clic derecho → **Studio** → tipo de contenido
3. El Studio combina el contenido de todos los recursos seleccionados

---

## Configuración por tipo

### Resumen

| Opción | Descripción |
|--------|-------------|
| Longitud | Corto (200 palabras) / Medio (500) / Largo (1000+) |
| Estilo | Bullet points / Prosa / Ejecutivo (5 puntos clave) |
| Idioma | Hereda el idioma del documento o configura uno |

### Quiz

| Opción | Descripción |
|--------|-------------|
| Número de preguntas | 5 / 10 / 20 |
| Dificultad | Fácil / Media / Difícil |
| Tipo | Solo opción múltiple / Verdadero-Falso / Mixto |

### Flashcards

| Opción | Descripción |
|--------|-------------|
| Número de tarjetas | 10 / 20 / 50 |
| Tipo | Concepto-Definición / Pregunta-Respuesta / Fecha-Evento |
| Deck destino | Deck existente / Crear nuevo deck |

### Mindmap

| Opción | Descripción |
|--------|-------------|
| Profundidad | 2 niveles / 3 niveles / 4 niveles |
| Nodos máximos por nivel | 3 / 5 / 8 |

---

## Output y destino

- **Notas y resúmenes**: se crean como nueva nota en el mismo proyecto que el recurso origen
- **Flashcards**: se crean en el módulo de Flashcards, asociadas al recurso origen
- **Mindmaps**: se insertan en una nota nueva como diagrama (Mermaid)

El nombre del output generado incluye el tipo y el nombre del recurso origen:
```
"Resumen - Machine Learning Basics"
"Quiz - Capítulo 3 Termodinámica"
"Flashcards - Vocabulario Inglés Técnico"
```

---

## IPC Channels

| Canal | Parámetros | Descripción |
|-------|-----------|-------------|
| `studio:generate` | `StudioRequest` | Iniciar generación |
| `studio:getStatus` | `jobId` | Estado de un job de generación |
| `studio:cancel` | `jobId` | Cancelar generación en curso |

```typescript
interface StudioRequest {
  type: 'summary' | 'mindmap' | 'quiz' | 'flashcards' | 'guide' | 'faq' | 'timeline';
  resourceIds: string[];        // uno o varios recursos
  options: {
    language?: string;          // 'es' | 'en' | auto-detect
    length?: 'short' | 'medium' | 'long';
    count?: number;             // para quiz y flashcards
    difficulty?: 'easy' | 'medium' | 'hard';
    deckId?: string;            // para flashcards: deck destino
    outputFolderId?: string;    // carpeta donde guardar el output
  };
}
```

---

## Integración con el Run Engine

Las generaciones de Studio se ejecutan como **Runs** en el Run Engine, con `outputMode: 'studio_output'`. Esto significa que:

- Aparecen en el historial de Runs
- Puedes cancelar una generación en curso desde Runs
- Los errores quedan registrados y puedes reintentar

---

## Casos de uso

### Para estudiar un PDF

```
1. Importar PDF → esperar "Listo para IA"
2. Studio → Resumen (estilo ejecutivo) → revisar en 2 minutos
3. Studio → Flashcards → estudiar con SM-2 durante los próximos días
4. Studio → Quiz → autoevalúate antes del examen
```

### Para preparar una presentación

```
1. Reunir varios recursos del proyecto
2. Seleccionar todos → Studio → Resumen (largo)
3. El resumen se convierte en el borrador de la presentación
4. Usar el Writer Agent para pulir el texto
```

### Para aprender de páginas web

```
1. Pegar URL en Command Center (Cmd+K)
2. Dome guarda el artículo
3. Studio → Mindmap → visualiza los conceptos clave
4. Studio → FAQ → entiende los conceptos con preguntas/respuestas
```

---

*Ver también: [flashcards.md](./flashcards.md) para el sistema de repetición espaciada, [runs.md](./runs.md) para el Run Engine.*
