# Calendar

Agenda de Dome: eventos locales + sync Google, bridges GitHub/Social/Pipelines, tools de Many, y enlaces a recursos del vault.

---

## Visión general

El **Calendar** vive como pestaña singleton del shell (`openCalendarTab` → `CalendarPage`). Many puede crear/leer/modificar eventos (HITL en mutaciones). Google Calendar se sincroniza bidireccionalmente. Eventos de GitHub, posts Social y items de Pipelines aparecen vía `metadata.source`.

---

## UI (renderer)

| Pieza | Rol |
|-------|-----|
| `app/pages/CalendarPage.tsx` | Orquestación: load/sync/import, filtros, grid + upcoming |
| `CalendarHero` / `CalendarUpcoming` | Chrome shadcn (toolbar + feed 7d) |
| `CalendarGrid` | Navegación + tabs día/semana/mes/año |
| `CalendarMonthView` / `CalendarTimeViews` / `CalendarYearView` | Vistas del scheduler (grid custom; no DayPicker) |
| `EventModal` + `EventDetailChrome` | Ficha shadcn Card que sustituye «Próximos» al abrir: create/edit y detalle; pills de color (`calendar_color`); sin franja/gradiente; recursos vinculados |
| `shared/DatePicker` + `DateTimePicker` | Pickers (shadcn `ui/calendar`) |

Vista por defecto: **month**. Alturas con flex del shell (`min-h-0`), sin `100vh` hardcode.

---

## Vistas

- **Día / semana**: timeline horaria con drag/move/resize.
- **Mes**: celdas + DnD HTML5 entre días.
- **Año**: mini-meses; click → mes.

---

## Crear / editar eventos

Campos: título, ubicación, todo el día, inicio/fin, descripción, **recursos vinculados** (`metadata.resourceIds: string[]`).

Desde el modal se puede:

| Origen | Acción |
|--------|--------|
| `metadata.source === 'github'` | Abrir tab GitHub + URL remota |
| `metadata.source === 'pipeline'` | Abrir tab Pipelines |
| `metadata.source === 'social'` | Abrir tab Social |
| `metadata.resourceIds` | Abrir recurso en tab (`openResourceTab`) |

`updateEvent` hace **merge** de metadata (no reemplazo ciego) para no perder provenance al setear `resourceIds`.

---

## Many / tools

Tools: `calendar_list_events`, `calendar_get_upcoming`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`.

Create/update aceptan `resource_ids` opcional → `metadata.resourceIds`.

---

## Sync e integraciones

- **Google**: OAuth + `calendar_event_links` (remote ids; no usar para resources).
- **GitHub / Social / Pipelines**: bridges escriben eventos locales con metadata de provenance.
- **ICS**: import vía preview + confirm en Dialog.

Settings: sección `calendar` en Settings (shell mode).

---

## Schema (runtime SQLite)

Tablas en `electron/core/db/schema.cjs`: `calendar_accounts`, `calendar_calendars`, `calendar_events` (`metadata` TEXT JSON), `calendar_event_links` (Google), `calendar_notifications`.

Enlace a recursos Dome: solo `metadata.resourceIds` (sin migración / sin FK).
