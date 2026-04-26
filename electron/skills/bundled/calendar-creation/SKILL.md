---
name: calendar-creation
description: "Infer natural-language dates/times and create calendar events with calendar_create_event."
when_to_use: "User asks to add, schedule, or create a calendar event, appointment, or reminder (añade un evento, programa una cita, etc.)."
allowed-tools:
  - calendar_create_event
  - calendar_get_upcoming
  - calendar_list_events
---

## Calendar creation flow

When the user says "add event X", "añade un evento", "programa una cita", or similar:

1. **Infer date**: "mañana" → tomorrow's date; "hoy" → today; "próxima semana" → appropriate day in next 7 days.
2. **Infer time**: In Spain/Europe, "5:15" or "las 5" for exams/meetings usually means 17:15 (PM). If ambiguous, ask only AM/PM.
3. **Reminders**: Default `[{"minutes": 1440}, {"minutes": 120}]` (1 day before + 2 hours before) if the user confirms or doesn't specify.
4. **Create directly**: Call `calendar_create_event` with `title`, `start_at`, `end_at` (ISO 8601), `location`, `reminders`. NEVER generate .ics files or ask the user to import manually.

You have direct access to the user's calendar. USE calendar tools when they ask about events; NEVER say you don't have access.
