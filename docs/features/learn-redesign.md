# Learn Redesign

Integration of the Learn prototype (6 sections, 16 UI states) into Dome Desktop.

## Architecture

```
LearnPage (router)
├── LearnLibrary — KPI strip, streak, filters, deck cards, empty ramps
├── GenerateWizard (3 steps + progress)
├── DeckOverview — tabs: Questions / History / Sources / Settings
├── FlashPlayer — SRS flashcard study (Space flip, 1–4 SRS, S skip)
├── QuizPlayer → Quiz (learnMode + quiz_runs persistence)
├── MindMapView — canvas + interactive lr-mind-side panel
├── GuideReader — TOC + scroll-spy study guide
├── FaqReader — accordion Q&A + local search
├── TimelineView — vertical timeline + date filter
└── TableView — dynamic columns, sort, global search
```

### State (`useLearnStore`)

| Field | Purpose |
|-------|---------|
| `view` | `library` \| `deck` \| `studying` |
| `wizard` | 3-step generate flow (type, sources, config) |
| `progress` | Generation phases + draft preview |
| `kpis` / `streak` | Global Learn metrics from main process |

### IPC

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `learn:getKpis` | renderer → main | Due today, mastery, streak, time today |
| `learn:getStreak` | renderer → main | 7-day activity strip |
| `quiz:createRun` / `listRuns` / `getRun` | renderer → main | Quiz attempt history (`quiz_runs` table) |
| `studio:progress` | main → renderer | Generation phase updates (`broadcast`) |
| `studio:cancel` | renderer → main | Cancel in-flight generation |
| `flashcard:sessionEnded` | main → renderer | Refreshes KPIs after SRS or quiz run |

Renderer hooks subscribe via `window.electron.on(...)` (not `window.addEventListener`).

### CSS

`app/styles/learn.css` — `.lr-*` classes mapped to existing design tokens (no new CSS variables).

## 16 UI States

| # | State | Component |
|---|-------|-----------|
| 1 | Library empty | `LearnEmptyState` |
| 2 | Library populated | `LearnLibrary` + `LearnDeckCard` |
| 3 | Library filtered | `LearnFilterBar` + section subtitle count |
| 4–6 | Generate steps 1–3 | `GenerateWizard` |
| 7 | Generate progress | `GenerateProgressView` (real `studio:progress`) |
| 8 | Deck overview | `DeckOverview` (flash + quiz KPIs) |
| 9–12 | Quiz Q / correct / wrong / results | `Quiz` (learnMode) |
| 13–14 | Flash front / back | `FlashPlayer` |
| 15 | Mind map | `MindMapView` |
| 16 | Guide reader | `GuideReader` |

Additional study modes: FAQ (`FaqReader`), Timeline (`TimelineView`), Table (`TableView`).

## Keyboard shortcuts

| Context | Keys |
|---------|------|
| Wizard | `Esc` close, `Enter` continue |
| Quiz | `1–4` options, `Enter` submit/next, `S` skip |
| Flash | `Space`/`Enter` flip, `1–4` SRS, `S` skip |

## Files

- `app/components/learn/` — all Learn UI
- `app/lib/learn/` — types, SRS, deck items, quiz stats, generate errors
- `app/lib/hooks/useLearnKpis.ts`, `useLearnStreak.ts`, `useStudioGenerateStream.ts`
- `electron/services/learn-kpis.cjs`, `studio-progress.cjs`
- `electron/ipc/learn.cjs`, `quiz.cjs`, `flashcards.cjs`
- `docs/features/learn-tool-schemas.md` — JSON output schemas

## Tests

```bash
pnpm run test:studio:tools
pnpm run test:learn:kpis
pnpm run test:generate:wizard
```

## Screenshots

Manual QA captures: `assets/learn-redesign/` (one per major section).
