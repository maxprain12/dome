# How to Create a Workflow

Workflows are visual pipelines that chain multiple agents together. Each workflow is defined as a node graph with inputs, agent nodes, and an output — similar to how LangGraph defines stateful pipelines.

---

## File format

A workflow is a `manifest.json` inside a named directory:

```
public/workflows/my-workflow-id/
└── manifest.json
```

### `manifest.json` schema

```json
{
  "id": "my-workflow-id",
  "name": "Workflow Name",
  "description": "Short description of what this workflow does.",
  "longDescription": "Detailed description shown in the detail view.",
  "author": "Your Name",
  "version": "1.0.0",
  "tags": ["research", "writing"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1747612800000,
  "estimatedTime": "~2 min",
  "difficulty": "beginner",
  "inputTypes": ["text"],
  "outputType": "article",
  "category": "research",
  "useCases": ["Summarize and rewrite PDFs", "Generate reports from notes"],
  "nodes": [...],
  "edges": [...]
}
```

---

## Node types

### `textInput` — user input node

```json
{
  "id": "input-1",
  "type": "textInput",
  "position": { "x": 80, "y": 200 },
  "data": {
    "label": "Topic or document",
    "placeholder": "Enter a research topic or paste a URL..."
  }
}
```

### `agent` — agent execution node

```json
{
  "id": "agent-1",
  "type": "agent",
  "position": { "x": 400, "y": 200 },
  "data": {
    "label": "Researcher",
    "agentId": "dome-research-pro",
    "systemPromptOverride": "",
    "outputKey": "research_output"
  }
}
```

- `agentId`: references a `manifest.json` agent by its `id`.
- `systemPromptOverride`: optional — replaces the agent's default system prompt for this workflow step.
- `outputKey`: name used to pass this node's output to the next node.

### `output` — final output node

```json
{
  "id": "output-1",
  "type": "output",
  "position": { "x": 720, "y": 200 },
  "data": {
    "label": "Final report",
    "outputMode": "note"
  }
}
```

- `outputMode`: `"note"` (save to library), `"chat_only"` (show in chat), `"studio_output"`.

---

## Edges

Edges connect nodes in order:

```json
[
  { "id": "e1", "source": "input-1", "target": "agent-1" },
  { "id": "e2", "source": "agent-1", "target": "agent-2" },
  { "id": "e3", "source": "agent-2", "target": "output-1" }
]
```

---

## Registering the workflow in the catalog

Add an entry to `public/workflows.json`:

```json
[
  {
    "id": "my-workflow-id",
    "name": "Workflow Name",
    "description": "Short description.",
    "featured": false,
    "version": "1.0.0",
    "tags": ["research"],
    "estimatedTime": "~2 min",
    "difficulty": "beginner",
    "category": "research",
    "useCases": ["Use case 1"],
    "downloads": 0
  }
]
```

---

## Difficulty levels and categories

**Difficulty**: `"beginner"`, `"intermediate"`, `"advanced"`

**Categories**: `"research"`, `"writing"`, `"data"`, `"knowledge"`, `"education"`, `"productivity"`

---

## Example — Research & Write

A 4-node workflow: user inputs a topic → researcher agent gathers sources → writer agent drafts an article → saves as a note.

```json
{
  "id": "research-write",
  "name": "Research & Write",
  "description": "Research a topic on the web and write a structured article.",
  "estimatedTime": "~3 min",
  "difficulty": "beginner",
  "category": "research",
  "nodes": [
    {
      "id": "input-1",
      "type": "textInput",
      "position": { "x": 80, "y": 200 },
      "data": { "label": "Research topic", "placeholder": "e.g. quantum computing breakthroughs 2025" }
    },
    {
      "id": "researcher",
      "type": "agent",
      "position": { "x": 380, "y": 200 },
      "data": {
        "label": "Researcher",
        "agentId": "dome-research-pro",
        "outputKey": "research"
      }
    },
    {
      "id": "writer",
      "type": "agent",
      "position": { "x": 680, "y": 200 },
      "data": {
        "label": "Writer",
        "agentId": "dome-writing-coach",
        "outputKey": "article"
      }
    },
    {
      "id": "output-1",
      "type": "output",
      "position": { "x": 980, "y": 200 },
      "data": { "label": "Finished article", "outputMode": "note" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "input-1", "target": "researcher" },
    { "id": "e2", "source": "researcher", "target": "writer" },
    { "id": "e3", "source": "writer", "target": "output-1" }
  ]
}
```
