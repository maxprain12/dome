---
title: Neutral, grouped shadcn navigation for both shell sidebars
status: implemented
---

Follow the supplied reference with quiet group labels, icon rows, nested disclosure menus and neutral active states. Replace the main sidebar's card-selection treatment; retain the existing navigation destinations, feature visibility, project tools and settings search/deep links.

- Compose shared shell navigation from installed shadcn Sidebar and Collapsible primitives.
- Group main destinations into workspace, connections and Many; organize settings by the existing registry.
- Keep the current sidebar store/TitleBar collapse behavior, remove hidden controls from keyboard navigation and fix the narrow-window width override.
- Use sidebar-scoped neutral tokens for selection/hover and subtle hierarchy guides; remove the outer rail border.
- Verify interaction behavior, both themes and real rendered sidebars, then run project gates and integrate via PR/CI.

## Result and validation

Both shell sidebars use shared shadcn navigation composition, neutral sidebar tokens and nested disclosure groups. Settings retain their registry IDs, hidden-section filtering and deep links; exact-name searches win on Enter. The shell opts out of shadcn's default Cmd/Ctrl+B handler to preserve editor formatting. Menu buttons forward refs for React 18 disclosure focus.

- 341 renderer tests passed, including settings disclosure, Many history actions and tour disclosure coverage.
- Chromium review of the actual sidebar components in light/dark and a narrow shell: no page errors, Agentes/Contactos navigation activates the correct destination, and collapsed width is zero.
- Typecheck, lint (existing warnings only), production build, IPC inventory, Sonar full/diff, dependency boundaries, UI contracts and design-system checks passed.
