# Flashcards

Documentación del sistema de tarjetas de memoria de Dome con algoritmo **FSRS** (Free Spaced Repetition Scheduler). Las tarjetas legacy con campos SM-2 se migran automáticamente (migración DB 38).

---

## Concepto

Las **Flashcards** de Dome implementan **FSRS** para optimizar el aprendizaje por repetición espaciada. El sistema calcula automáticamente cuándo volver a mostrarte cada tarjeta según tu rendimiento, maximizando la retención a largo plazo. La UI de estudio (`FlashPlayer`) incluye volteo 3D de la tarjeta.

### ¿Qué es FSRS?

FSRS es un algoritmo moderno de repetición espaciada que:

- Muestra las tarjetas que estás a punto de olvidar (antes de que lo hagas)
- Si recuerdas bien una tarjeta, el intervalo hasta verla de nuevo se alarga (1d → 3d → 7d → 15d...)
- Si fallas una tarjeta, el intervalo se resetea
- Optimiza el tiempo de estudio para el máximo efecto de retención

---

## Estructura de datos

```typescript
interface FlashcardDeck {
  id: string;
  name: string;
  description?: string;
  resourceId?: string;    // recurso origen (si se generó desde Studio)
  projectId?: string;
  cardCount: number;
  dueToday: number;       // tarjetas con revisión pendiente hoy
  createdAt: string;
}

interface Flashcard {
  id: string;
  deckId: string;
  front: string;          // pregunta / concepto
  back: string;           // respuesta / definición
  // Campos FSRS (Free Spaced Repetition Scheduler) — algoritmo activo en v2.6.1:
  stability: number;      // estabilidad FSRS (en días)
  fsrsDifficulty: number; // dificultad FSRS (1–10)
  fsrsState: number;      // 0=new, 1=learning, 2=review, 3=relearning
  // Campos legacy SM-2 (mantenidos en DB para compatibilidad hacia atrás):
  interval: number;       // días hasta próxima revisión
  repetition: number;     // número de veces revisada con éxito consecutivo
  efactor: number;        // factor de facilidad (2.5 inicial)
  nextReview: string;     // fecha de próxima revisión (ISO date)
  lastReview?: string;
  createdAt: string;
}
```

---

## Calificaciones FSRS

En cada sesión de estudio, tras ver la respuesta, califica tu recuerdo (las mismas 4 opciones que SM-2, pero ahora consumidas por el scheduler FSRS):


| Calificación | Botón        | Descripción                      | Efecto en FSRS                                       |
| ------------ | ------------ | -------------------------------- | ---------------------------------------------------- |
| 1 — Mal      | 😕 Difícil   | Apenas recordé, incorrecto       | Lapse: stability → 0, vuelve a `learning`            |
| 2 — Regular  | 😐 Regular   | Recordé con dificultad, correcto | Recorta `stability`, `difficulty` +0.1               |
| 3 — Bien     | 😊 Fácil     | Recordé con pequeño esfuerzo     | `stability *= difficulty_factor`, schedule N días    |
| 4 — Muy bien | 😄 Muy fácil | Recordé con facilidad            | `stability *= harder_factor`, schedule más lejos     |

(SM-2 permanece en la DB para downgrades; FSRS es el algoritmo activo desde v2.6.1.)


> **Consejo**: Sé honesto en tu calificación. La efectividad del algoritmo depende de ello.

---

## Crear decks

### Manualmente

1. Ve a **Flashcards** en la barra lateral
2. Haz clic en **Nuevo deck**
3. Escribe el nombre y descripción opcional
4. Dentro del deck, haz clic en **+ Nueva tarjeta**
5. Escribe el **frente** (pregunta/concepto) y el **reverso** (respuesta/definición)
6. Guarda la tarjeta

### Desde Studio (generación IA)

Esta es la forma más rápida de crear decks a partir de tus documentos:

1. Abre cualquier recurso (PDF, nota, URL)
2. Haz clic en **Studio** (varita mágica)
3. Selecciona **Flashcards**
4. La IA genera tarjetas automáticamente del contenido
5. Revisa y edita las tarjetas generadas
6. Haz clic en **Guardar deck**

### Desde Many

```
"Crea flashcards sobre los conceptos de machine learning de mi nota 'ML Basics'"
"Genera un deck de vocabulario de inglés de los PDFs de mi proyecto 'English'"
```

---

## Sesión de estudio

1. Abre un deck con tarjetas pendientes (el número indica cuántas hay para hoy)
2. Haz clic en **Estudiar (N tarjetas)**
3. La sesión comienza:

```
┌─────────────────────────────────┐
│                                 │
│      ¿Qué es backpropagation?   │  ← FRENTE (pregunta)
│                                 │
└─────────────────────────────────┘
           [Ver respuesta]
                  │
                  ▼
┌─────────────────────────────────┐
│                                 │
│   Algoritmo para calcular       │
│   gradientes en redes           │  ← REVERSO (respuesta)
│   neuronales mediante la        │
│   regla de la cadena            │
│                                 │
└─────────────────────────────────┘
  [😵]  [😕]  [😐]  [😊]  [😄]
```

1. Evalúa tu respuesta con los botones
2. La sesión continúa hasta completar todas las tarjetas del día
3. Al terminar, aparece el resumen de la sesión

### Resumen de sesión

Al finalizar, Dome muestra:

- Tarjetas estudiadas
- Porcentaje de recordadas correctamente
- Próxima sesión programada

---

## Panel del deck

En cada deck puedes ver:

- **Pendientes hoy**: tarjetas con revisión programada para hoy
- **Nuevas**: tarjetas que nunca se han estudiado
- **Aprendidas**: tarjetas con intervalo > 21 días (bien consolidadas)
- **Total**: número total de tarjetas

---

## IPC Channels


| Canal                    | Parámetros             | Descripción                                      |
| ------------------------ | ---------------------- | ------------------------------------------------ |
| `flashcards:listDecks`   | `{ projectId? }`       | Lista todos los decks                            |
| `flashcards:getDeck`     | `deckId`               | Obtener deck por ID                              |
| `flashcards:createDeck`  | `DeckData`             | Crear nuevo deck                                 |
| `flashcards:updateDeck`  | `{ id, updates }`      | Actualizar deck                                  |
| `flashcards:deleteDeck`  | `deckId`               | Eliminar deck y sus tarjetas                     |
| `flashcards:getCards`    | `{ deckId, dueOnly? }` | Obtener tarjetas (opcionalmente solo las de hoy) |
| `flashcards:createCard`  | `CardData`             | Crear tarjeta                                    |
| `flashcards:updateCard`  | `{ id, updates }`      | Editar tarjeta                                   |
| `flashcards:deleteCard`  | `id`                   | Eliminar tarjeta                                 |
| `flashcards:review`      | `{ cardId, grade }`    | Registrar resultado de revisión (aplica FSRS)     |
| `flashcards:getDueCount` | `deckId`               | Número de tarjetas pendientes hoy                |


---

## DuckDB schema (en `dome.duckdb`, migración 0008_learn)

```sql
CREATE TABLE flashcard_decks (
  id          TEXT PRIMARY KEY,
  resource_id TEXT,           -- FK resources (origen si se generó desde Studio)
  project_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  card_count  BIGINT NOT NULL DEFAULT 0,
  tags        TEXT,
  settings    TEXT,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

CREATE TABLE flashcards (
  id          TEXT PRIMARY KEY,
  deck_id     TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  difficulty  TEXT DEFAULT 'medium',
  -- FSRS fields (algoritmo activo en v2.6.1)
  stability       DOUBLE,
  fsrs_difficulty DOUBLE,
  fsrs_state      BIGINT DEFAULT 0,
  -- Legacy SM-2 fields (compatibilidad hacia atrás)
  ease_factor     DOUBLE DEFAULT 2.5,
  interval        BIGINT DEFAULT 0,
  repetitions     BIGINT DEFAULT 0,
  lapses          BIGINT DEFAULT 0,
  scheduled_days  BIGINT DEFAULT 0,
  learning_steps  BIGINT DEFAULT 0,
  last_rating     BIGINT,
  next_review_at  BIGINT,
  last_reviewed_at BIGINT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX idx_flashcards_deck ON flashcards(deck_id);
CREATE INDEX idx_flashcards_next_review ON flashcards(next_review_at);
```

---

*Ver también: [studio.md](./studio.md) para generación automática de flashcards desde documentos.*