# Plan 035: People inspect + squared radius

> **Status**: DONE  
> **Depends on**: 031, 032  
> **Category**: direction / design-system

Reverts the pill look from [031-brand-primitives.md](031-brand-primitives.md) (`Button`/`Badge` `rounded-full`, `Card` `rounded-2xl`) without reopening brand color or motion work in 030–032. `--radius` is `0.375rem`; primitives use `rounded-md` / `rounded-lg`. People is a master–detail surface (filters via `ToggleGroup`, selected row `bg-brand-mint`). Chat chips and tool rows open `EntityPeekDialog` (`PersonPeekBody` / `ToolPeekBody`) instead of dumping raw JSON or wrapping identifiers at 4 letters.

Does **not** replace 031 — only the radius/pill decision.
