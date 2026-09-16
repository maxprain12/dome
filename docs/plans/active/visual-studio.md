---
title: Dome Visual Studio
status: implemented
---

# Objective
Local, browser-only marketing scene gallery using real Dome presentational components and deterministic fictional data. Start with Library, Many and Study; full-screen, composition and transparent detail presets. Keep the Electron startup and production build unchanged.

# Implementation
- Separate Vite entry and local export endpoint, bound to loopback.
- Reuse ManyComposerSurface, ManyConversationSurface, LearnDeckCard, ResourceIcon and shadcn primitives with Dome theme and translations.
- Share validated scene parameters between preview and Playwright PNG export. Export immutable, reproducible presets; scene controls are the source of truth.
- Provide ES/EN/FR/PT, light/dark, two scene states, portrait/landscape compositions, and a downloadable starter pack.
- Verify exports, mobile workbench, component interactions and required repository checks. Document what is real UI versus marketing composition.

# Validation
- Renderer typecheck and lint passed (existing lint warnings only).
- Application and studio production builds passed.
- IPC inventory, full/diff Sonar patterns and dependency boundaries passed.
- Browser export and visual checks recorded in the PR.
