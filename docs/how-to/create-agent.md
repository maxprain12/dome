# How to Create an Agent

Agents are AI personas with a fixed system prompt and a curated set of tools. They appear in the **Agents** section of the Marketplace and can be installed to be used in agent chat.

---

## File format

An agent is a `manifest.json` file inside a named directory:

```
public/agents/my-agent-id/
└── manifest.json
```

### `manifest.json` schema

```json
{
  "id": "my-agent-id",
  "name": "Human-Readable Name",
  "description": "Short one-liner shown in the marketplace card.",
  "longDescription": "Longer description shown in the agent detail view.",
  "systemInstructions": "You are an expert in X. Your role is to...",
  "toolIds": ["web_search", "resource_get", "resource_create"],
  "mcpServerIds": [],
  "iconIndex": 1,
  "author": "Your Name",
  "version": "1.0.0",
  "tags": ["research", "writing"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1747612800000
}
```

### Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique slug, matches directory name |
| `name` | string | ✅ | Display name |
| `description` | string | ✅ | Short description (1–2 sentences) |
| `longDescription` | string | optional | Shown in detail view |
| `systemInstructions` | string | ✅ | Full system prompt for the agent |
| `toolIds` | string[] | ✅ | List of Dome tool names the agent can use |
| `mcpServerIds` | string[] | optional | MCP servers to attach |
| `iconIndex` | number | optional | Sprite index (1–18) for the agent avatar |
| `author` | string | optional | Creator name |
| `version` | string | optional | Semver string |
| `tags` | string[] | optional | Used for filtering in marketplace |
| `featured` | boolean | optional | Pin to top of marketplace |
| `downloads` | number | optional | Display count (cosmetic) |
| `createdAt` | number | optional | Unix timestamp in ms |

### Available tool IDs

Common tools to include in `toolIds`:

```
web_search              resource_search          resource_get
resource_create         resource_update          resource_delete
resource_hybrid_search  resource_semantic_search resource_get_section
resource_list           resource_get_library_overview
flashcard_create        artifact_create          artifact_update_state
docx_create             docx_get                 docx_update
excel_get               ppt_create               ppt_get_slide_images
calendar_create_event   calendar_list_events     calendar_get_upcoming
link_resources          get_related_resources    generate_knowledge_graph
deep_research           web_fetch                dome_load_doc
remember_fact           shell_exec               browser_get_active_tab
```

---

## Registering the agent in the catalog

Add an entry to `public/agents.json`:

```json
[
  {
    "id": "my-agent-id",
    "name": "Human-Readable Name",
    "description": "Short one-liner.",
    "featured": false,
    "version": "1.0.0",
    "iconIndex": 1,
    "tags": ["research"],
    "downloads": 0
  }
]
```

---

## Writing effective system instructions

A good system prompt:

1. **States the persona clearly** — "You are an expert academic researcher specializing in literature reviews."
2. **Lists responsibilities** — "Your role is to: (1) search for sources, (2) evaluate credibility, (3) synthesize findings."
3. **Gives tool guidance** — "Always search the Dome library first before going to the web."
4. **Sets constraints** — "Never fabricate citations. If you can't find a source, say so."
5. **Specifies output format** — "Present your findings as a numbered list with source links."

---

## Example

```json
{
  "id": "quick-summarizer",
  "name": "Quick Summarizer",
  "description": "Summarizes any resource into bullet points in seconds.",
  "longDescription": "Drop any PDF, note, or web page and get a clear bullet-point summary with key takeaways.",
  "systemInstructions": "You are a concise summarizer. When given a resource, extract the 5 most important points as bullets. Be direct, avoid filler phrases, and always include a one-sentence TL;DR at the top. Use resource_get or resource_get_section to read the content before summarizing.",
  "toolIds": ["resource_get", "resource_get_section", "resource_hybrid_search"],
  "iconIndex": 3,
  "author": "Dome Team",
  "version": "1.0.0",
  "tags": ["reading", "productivity"],
  "featured": false,
  "downloads": 0,
  "createdAt": 1747612800000
}
```
