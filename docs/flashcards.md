# Flashcards

Documentación del sistema de tarjetas de memoria de Dome con algoritmo SM-2 (Spaced Repetition).

---

## Concepto

Las **Flashcards** de Dome implementan el algoritmo **SM-2** (SuperMemo 2) para optimizar el aprendizaje por repetición espaciada. El sistema calcula automáticamente cuándo volver a mostrarte cada tarjeta según tu rendimiento, maximizando la retención a largo plazo.

### ¿Qué es SM-2?

SM-2 es un algoritmo de repetición espaciada que:

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
  // Campos SM-2:
  interval: number;       // días hasta próxima revisión
  repetition: number;     // número de veces revisada con éxito consecutivo
  efactor: number;        // factor de facilidad (2.5 inicial)
  nextReview: string;     // fecha de próxima revisión (ISO date)
  lastReview?: string;
  createdAt: string;
}
```

---

## Calificaciones SM-2

En cada sesión de estudio, tras ver la respuesta, califica tu recuerdo:


| Calificación | Botón        | Descripción                      | Efecto en SM-2                      |
| ------------ | ------------ | -------------------------------- | ----------------------------------- |
| 0 — Nada     | 😵 Olvidado  | No recordé nada                  | Resetea: intervalo = 1 día          |
| 1 — Mal      | 😕 Difícil   | Apenas recordé, incorrecto       | Resetea: intervalo = 1 día          |
| 2 — Regular  | 😐 Regular   | Recordé con dificultad, correcto | Intervalo corto (≤ 3 días)          |
| 3 — Bien     | 😊 Fácil     | Recordé con pequeño esfuerzo     | Intervalo estándar (efactor normal) |
| 4 — Muy bien | 😄 Muy fácil | Recordé con facilidad            | Intervalo largo (efactor aumenta)   |


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
| `flashcards:review`      | `{ cardId, grade }`    | Registrar resultado de revisión (aplica SM-2)    |
| `flashcards:getDueCount` | `deckId`               | Número de tarjetas pendientes hoy                |


---

## SQLite schema

```sql
CREATE TABLE flashcard_decks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  resourceId  TEXT,           -- FK resources (origen si se generó desde Studio)
  projectId   TEXT,
  createdAt   TEXT,
  updatedAt   TEXT
);

CREATE TABLE flashcards (
  id          TEXT PRIMARY KEY,
  deckId      TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  -- SM-2 fields
  interval    INTEGER DEFAULT 1,
  repetition  INTEGER DEFAULT 0,
  efactor     REAL DEFAULT 2.5,
  nextReview  TEXT NOT NULL,       -- ISO date YYYY-MM-DD
  lastReview  TEXT,
  createdAt   TEXT,
  updatedAt   TEXT
);

CREATE INDEX flashcards_deck_next ON flashcards(deckId, nextReview);
```

---

*Ver también: [studio.md](./studio.md) para generación automática de flashcards desde documentos.*