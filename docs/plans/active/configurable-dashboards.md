---
title: Configurable home and social dashboards
status: active
---

## Scope
Redesign Home around recent work, agenda, projects and Many. Redesign Social around editorial work and measured results. Use current data sources, translated copy and existing theme tokens. Keep Connections permanently expanded.

## Implementation
- Shared configurable panel grid: visibility, order, half/full width, reset; persist Home and Social independently on this device.
- Responsive, keyboard-accessible cards and an accessible customization sheet.
- Preserve existing resource, project, calendar, chat and social navigation.
- Validate configuration recovery, navigation and empty/data states; inspect rendered light/dark and narrow layouts.
- Run repository checks, open PR and enable squash auto-merge.

## Validation
- 18 targeted renderer tests pass (configuration recovery/persistence/isolation/reset, agenda selection, permanent navigation, editorial queues and existing post detail flow).
- Browser inspection at 1280px and 620px, light/dark themes; no horizontal overflow. Browser reload preserves configuration. Preview used isolated fixture data, not the user's database.
- Typecheck, lint (existing warnings only), build, IPC inventory, Sonar checks, dependency-cruiser, design-system and UI-contract checks pass.
- Preferences are local to this device and independent for Home/Social; no new dependencies or IPC channels.
