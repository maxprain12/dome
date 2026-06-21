# Studio Generation Tools

Seven AI tools gather source context for structured Learn/Studio outputs. The model returns JSON matching the output type; persistence goes through `studio:create` + validators.

## Tools

| Tool name | Output type | Handler (main) |
|-----------|-------------|----------------|
| `generate_mindmap` | `mindmap` | `gatherStudioMindmapContext` |
| `generate_quiz` | `quiz` | `gatherStudioQuizContext` |
| `generate_guide` | `guide` | `gatherStudioGuideContext` |
| `generate_faq` | `faq` | `gatherStudioFaqContext` |
| `generate_timeline` | `timeline` | `gatherStudioTimelineContext` |
| `generate_table` | `table` | `gatherStudioTableContext` |
| `flashcard_create` | `flashcards` | `flashcardCreate` (ai-tools-handler) |

Renderer definitions: `app/lib/ai/tools/studio-outputs.ts`, `app/lib/ai/tools/flashcards.ts`  
Main gather logic: `electron/tools/ai-tools-extra.cjs`  
Dispatch map: `electron/tools/tool-dispatcher.cjs`  
**Full JSON schemas**: [`learn-tool-schemas.md`](./learn-tool-schemas.md)

## Common parameters

```typescript
{
  project_id?: string;   // scope to project when source_ids omitted
  source_ids?: string[]; // resource IDs to include
}
```

Quiz additionally accepts `num_questions` (1–20) and `difficulty` (`easy` | `medium` | `hard`).

## Output schemas

### mindmap
```json
{ "type": "mindmap", "nodes": [{ "id": "...", "label": "...", "description?": "..." }], "edges": [{ "id": "...", "source": "...", "target": "...", "label?": "..." }] }
```

### quiz
```json
{ "type": "quiz", "questions": [{ "id": "...", "type": "multiple_choice"|"true_false", "question": "...", "options?": ["..."], "correct": 0, "explanation": "...", "source_citation?": { "source_id": "...", "passage": "..." } }] }
```

### guide
```json
{ "type": "guide", "sections": [{ "title": "...", "content": "..." }] }
```

### faq
```json
{ "type": "faq", "pairs": [{ "question": "...", "answer": "...", "source_id?": "..." }] }
```

### timeline
```json
{ "type": "timeline", "events": [{ "date": "...", "title": "...", "description": "...", "source_id?": "..." }] }
```

### table
```json
{ "type": "table", "columns": [{ "key": "...", "label": "..." }], "rows": [{ "...": "..." }] }
```

## Progress streaming

Gather handlers emit `studio:progress` via `wrapStudioGather` in `electron/tools/ai-tools-handler.cjs` (uses `windowManager.broadcast`):

1. `read` — Reading sources  
2. `extract` — Extracted key concepts  
3. `ready` — Context ready (or `error` on failure)

Renderer: `useStudioGenerateStream` listens on `studio:progress`; 90 s timeout fallback.

Cancel: `studio:cancel` with `runId`.

## Validation

`electron/services/studio-validators.cjs` normalizes and validates content before DuckDB insert (tabla `studio_outputs` en `dome.duckdb`). Run `pnpm run test:studio` for regression tests.

## Tests

```bash
pnpm run test:studio:tools   # 7 gather shapes + progress broadcast smoke
pnpm run test:studio         # validator normalization
```
