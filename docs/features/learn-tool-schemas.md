# Learn Tool Output Schemas

JSON shapes persisted in `studio_outputs.content` (tabla DuckDB `studio_outputs`) o en decks de flashcards vía `flashcard_create`. Validators live in `electron/services/studio-validators.cjs`. Renderer tool definitions: `app/lib/ai/tools/studio-outputs.ts`, `app/lib/ai/tools/flashcards.ts`.

## Common envelope

Every studio output JSON includes a `type` field matching the Learn/Studio tile.

```json
{ "type": "<output_type>", "...": "..." }
```

## flashcards

Created via `flashcard_create` (not `studio:create` directly). Deck rows live in `flashcard_decks` + `flashcards`.

**Tool input** (`flashcard_create`):

```json
{
  "project_id": "string?",
  "resource_id": "string?",
  "source_ids": ["string"]?,
  "title": "string?",
  "description": "string?",
  "cards": [
    {
      "question": "string",
      "answer": "string",
      "difficulty": "easy|medium|hard?"
    }
  ]
}
```

**Minimum**: `cards` array with ≥1 pair.

## mindmap

```json
{
  "type": "mindmap",
  "nodes": [
    { "id": "string", "label": "string", "description": "string?" }
  ],
  "edges": [
    { "id": "string", "source": "string", "target": "string", "label": "string?" }
  ]
}
```

Gather: `generate_mindmap` → `gatherStudioMindmapContext` (`electron/tools/ai-tools-extra.cjs`).

## quiz

```json
{
  "type": "quiz",
  "questions": [
    {
      "id": "string",
      "type": "multiple_choice|true_false",
      "question": "string",
      "options": ["string"]?,
      "correct": 0,
      "explanation": "string",
      "source_citation": { "source_id": "string", "passage": "string" }?
    }
  ]
}
```

Gather params: `num_questions` (1–20), `difficulty` (`easy`|`medium`|`hard`).

## guide

```json
{
  "type": "guide",
  "sections": [
    { "title": "string", "content": "string" }
  ]
}
```

## faq

```json
{
  "type": "faq",
  "pairs": [
    {
      "question": "string",
      "answer": "string",
      "source_id": "string?"
    }
  ]
}
```

## timeline

```json
{
  "type": "timeline",
  "events": [
    {
      "date": "string",
      "title": "string",
      "description": "string",
      "source_id": "string?"
    }
  ]
}
```

## table

```json
{
  "type": "table",
  "columns": [
    { "key": "string", "label": "string" }
  ],
  "rows": [
    { "<column_key>": "string|number" }
  ]
}
```

## Progress streaming

Gather handlers wrapped by `wrapStudioGather` in `electron/tools/ai-tools-handler.cjs` emit `studio:progress` with phases:

| Phase | Meaning |
|-------|---------|
| `read` | Reading sources |
| `extract` | Extracted key concepts |
| `ready` | Context ready for model |
| `error` | Gather failed |

Payload: `{ runId, phase, message, current?, total?, error? }`.

Cancel in-flight runs: IPC `studio:cancel` with `{ runId }`.

## Tests

```bash
pnpm run test:studio:tools   # gather shapes + progress smoke
pnpm run test:studio         # validator normalization
```

See also `docs/features/studio-tools.md`.
