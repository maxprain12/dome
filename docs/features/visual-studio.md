# Dome Visual Studio

A local marketing scene gallery at `http://127.0.0.1:5188/visual-studio.html`.

## Start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run visual-studio
```

Select Library, Many or Study, then choose composition, full screen or isolated detail. Light/dark, ES/EN/FR/PT, initial/result states and landscape/portrait compositions are available. Settings are preserved in the URL; **Copy link** shares the selected preset with someone running the same local studio.

**Export PNG · 2×** downloads a native Chromium screenshot at twice the canvas resolution. Detail exports have transparent backgrounds. **Open canvas** opens only the export surface. The scene itself is intentionally inert: change its state using the studio controls. It does not call AI providers, Electron, accounts or the production database.

## Starter pack

With the studio running:

```bash
pnpm run visual-studio:export
```

Writes nine Spanish/light PNGs (three scenes × three formats) and a manifest to the ignored `visual-studio-exports/` folder. Nothing is copied into or published on the landing automatically. To use an image there, copy it into that project's `public/assets/` and reference its public URL.

Canvas sizes before 2× export:

| Format | Size |
| --- | --- |
| Composition, landscape | 1440 × 1040 |
| Composition, portrait | 1000 × 1250 |
| Full screen | 1440 × 960 |
| Transparent detail | 960 × 720 |

## Fidelity and fixtures

Direct product imports: `ManyComposerSurface`, `ManyConversationSurface`, `ManyAvatar`, `LearnDeckCard`, `ResourceIcon`, and the existing Button, Card, Badge, Progress and ToggleGroup primitives. Fonts and theme tokens come from `app/globals.css`. No duplicate component library is maintained.

The window shell, library arrangement, document cover and flashcard composition are marketing layouts built from these primitives, not a claim to be pixel-identical captures of the complete Electron screens. They use the fictional Atlas research project. Sources, text, answers and progress are illustrative fixtures; state changes never invoke a model. The foreground recrops deliberately enlarge selected UI for landing-page legibility.

- `app/visual-studio/Scenes.tsx`: scene compositions and fixture structure.
- `packages/i18n/locales/{es,en,fr,pt}/visualStudio.json`: localized UI and fictional content, loaded by the existing app i18n system.
- `app/visual-studio/settings.ts`: accepted presets, dimensions and filenames shared by browser and exporter.
- `app/visual-studio/studio.css`: gallery and marketing arrangement styles, loaded only by this entry.
- `scripts/visual-studio/export-plugin.ts`: same-origin local screenshot service, only loaded by the studio config.

Add further product scenes by extending the preset registry, translations and scene composition. Favor portable presentational components; avoid importing screen controllers that require Electron stores or IPC.

## Validation

```bash
pnpm run visual-studio:build
node scripts/visual-studio/smoke.mjs
```

The smoke check requires the local studio. It verifies control changes and URL persistence, a real browser download, 2× dimensions and transparent PNG pixels, rejection of foreign-origin requests, four languages, image loading and mobile overflow. The normal repository typecheck/lint cover the renderer files.

The separate build writes `dist-visual-studio/`. Static builds support previewing scenes only; PNG export needs the running local Vite service. The Electron entry and normal app build are not replaced. No new IPC channels or dependencies are required.
