# Calendar

Documentación del módulo de calendario de Dome (introducido en v2.0.0).

---

## Visión general

El **Calendar** de Dome integra gestión de eventos con herramientas de IA. Many puede crear, leer y modificar eventos directamente desde el chat, y los eventos de Google Calendar se sincronizan bidirecionalmente.

---

## Vistas

### Vista día
Muestra los eventos de un día con una línea de tiempo horaria. Ideal para planificación diaria detallada.

### Vista semana
Muestra la semana completa (Lun-Dom) con todos los eventos. Vista por defecto.

### Navegación

| Acción | Descripción |
|--------|-------------|
| Flechas ← → | Navegar al día/semana anterior o siguiente |
| Botón "Hoy" | Volver al día/semana actual |
| Click en fecha | Ir a esa semana en vista semana, o al día en vista día |

---

## Crear eventos

### Manualmente

1. Haz clic en cualquier slot vacío del calendario
2. Se abre el modal de creación con:
   - **Título**: nombre del evento (obligatorio)
   - **Fecha y hora inicio** / **Fecha y hora fin**
   - **Todo el día**: toggle para eventos sin hora específica
   - **Descripción**: notas adicionales
   - **Color**: etiqueta de color para identificar el evento
   - **Google Calendar**: si está conectado, elige el calendario destino
3. Haz clic en **Guardar**

### Desde el chat de Many

Many puede crear eventos con lenguaje natural:

```
"Crea una reunión mañana a las 10am titulada 'Revisión del proyecto'"
"Agenda una hora de estudio el viernes de 15:00 a 16:00"
"Bloquea toda la mañana del lunes"
```

Many usa la herramienta `create_event` automáticamente.

---

## Google Calendar Sync

### Conectar Google Calendar

1. Ve a **Settings → Calendar**
2. Haz clic en **Conectar Google Calendar**
3. El navegador se abre con la autorización de Google
4. Autoriza los permisos solicitados:
   - `calendar.events` — Leer y escribir eventos
   - Dome **NO** solicita acceso a Gmail, contactos ni Drive
5. Vuelves a Dome con la cuenta conectada

### Sincronización

- **Lectura**: Los eventos de Google Calendar aparecen en el calendario de Dome (marca de Google)
- **Escritura**: Los eventos creados o editados en calendarios vinculados a Google se propagan a la API de Google cuando hay enlace (`calendar_event_links`)
- **Manual**: Botón **Sincronizar** en la vista Calendario
- **Automática**: Configurable en **Ajustes → Calendario** (intervalo mínimo en minutos; el proceso principal comprueba periódicamente si toca ejecutar sync)

### Importar eventos (.ics)

1. En la vista **Calendario**, pulsa **Importar .ics**
2. Elige un archivo `.ics`
3. Revisa la vista previa (número de eventos válidos)
4. Elige el calendario destino y confirma; los duplicados próximos pueden omitirse automáticamente

### Many y confirmación (HITL)

Las herramientas del asistente que **crean, actualizan o borran** eventos (`calendar_create_event`, `calendar_update_event`, `calendar_delete_event`) requieren **aprobación explícita** en el flujo de Many antes de aplicarse, igual que otras acciones sensibles.

### Desconectar

Settings → Calendar → botón **Desconectar** junto a la cuenta de Google.

---

## Herramientas IA del calendario

Many tiene acceso a estas herramientas cuando está habilitado el calendario:

### `create_event`

```typescript
create_event({
  title: string,
  startTime: string,   // ISO 8601: "2026-03-20T10:00:00"
  endTime: string,     // ISO 8601
  description?: string,
  allDay?: boolean,
  calendarId?: string  // ID del calendario Google (opcional)
})
```

### `update_event`

```typescript
update_event({
  eventId: string,
  title?: string,
  startTime?: string,
  endTime?: string,
  description?: string
})
```

### `delete_event`

```typescript
delete_event({
  eventId: string
})
```

### `list_events`

```typescript
list_events({
  startDate: string,   // "2026-03-20"
  endDate: string,
  calendarId?: string
})
```

---

## IPC Channels

| Canal | Parámetros | Descripción |
|-------|-----------|-------------|
| `calendar:getEvents` | `{ startDate, endDate }` | Obtener eventos de un rango |
| `calendar:createEvent` | `EventData` | Crear evento |
| `calendar:updateEvent` | `{ id, updates }` | Actualizar evento |
| `calendar:deleteEvent` | `id` | Eliminar evento |
| `calendar:connect-google` | — | Iniciar OAuth con Google |
| `calendar:disconnect-google` | — | Revocar acceso a Google Calendar |
| `calendar:sync` | — | Sincronización manual con Google |
| `calendar:getCalendars` | — | Lista calendarios de Google disponibles |

---

## SQLite schema

```sql
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  start_time    TEXT NOT NULL,     -- ISO 8601
  end_time      TEXT NOT NULL,
  all_day       INTEGER DEFAULT 0,
  description   TEXT,
  color         TEXT,
  google_event_id TEXT,            -- null si no está en Google Calendar
  google_calendar_id TEXT,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE calendar_connections (
  id          TEXT PRIMARY KEY,
  provider    TEXT,                -- 'google'
  email       TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at  INTEGER,
  created_at  TEXT
);
```

---

## UI Components

| Componente | Descripción |
|-----------|-------------|
| `CalendarPage` | Página principal del calendario |
| `CalendarWeekView` | Vista de semana |
| `CalendarDayView` | Vista de día |
| `EventModal` | Modal de creación/edición de eventos |
| `EventCard` | Tarjeta de evento en el calendario |
| `GoogleCalendarSync` | Componente de estado de sincronización |

---

*Introducido en Dome v2.0.0. Ver [settings.md](./settings.md) para configuración del calendar.*
