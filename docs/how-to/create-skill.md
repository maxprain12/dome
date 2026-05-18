# How to Create a Skill

Skills are specialized prompt modules that augment an agent's behavior on demand. They follow the **progressive disclosure** pattern: the agent loads the skill content only when needed, keeping the context window lean.

Dome uses the [deepagents](https://deepagents.io) skills framework, which implements the same pattern as [llmstxt](https://llmstxt.org) but for specialized prompts rather than documentation pages.

---

## File format

A skill is a single `SKILL.md` file with a YAML frontmatter block followed by Markdown instructions.

```markdown
---
name: my-skill-id
description: "One-line description shown in the skills list."
when_to_use: "Natural-language description of when the agent should invoke this skill."
allowed-tools:
  - tool_name_1
  - tool_name_2
paths:
  - "keyword trigger"
  - "otro trigger"
---

# Skill Title

## Instructions for the agent

1. First step — what to do first.
2. Second step — what tool to call with which arguments.
3. ...

## Hard constraints

- ❌ Never do X.
- ❌ Never call tool Y without doing Z first.
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique slug identifier (lowercase, hyphens only) |
| `description` | ✅ | Short one-liner shown in settings and marketplace |
| `when_to_use` | ✅ | Sentence describing the trigger condition |
| `allowed-tools` | optional | List of Dome tool names this skill needs |
| `paths` | optional | Keyword triggers for automatic activation |

### Body (Markdown)

Write the body as clear, numbered instructions telling the agent exactly what to do, which tools to call, in what order, and with what arguments. Include:

- A step-by-step flow
- Example tool calls with concrete argument shapes
- Hard constraints (things the agent must never do)
- Error handling guidance

---

## Installing a skill

Place the `SKILL.md` file inside a directory named with the skill ID:

```
~/.dome/skills/
└── my-skill-id/
    └── SKILL.md
```

Dome picks it up automatically on next agent invocation — no restart needed.

---

## Publishing a skill to GitHub

Structure your repository so the `SKILL.md` is at the root or in a named subdirectory:

```
github.com/you/my-skill/
├── SKILL.md          ← single-skill repo (Dome will find this)
└── README.md

# OR multi-skill repo:
github.com/you/skill-pack/
├── skill-one/
│   └── SKILL.md
├── skill-two/
│   └── SKILL.md
└── skills.json       ← optional index for the Dome marketplace browser
```

### `skills.json` index (optional, for multi-skill repos)

```json
[
  { "id": "skill-one", "name": "Skill One", "description": "What it does", "path": "skill-one" },
  { "id": "skill-two", "name": "Skill Two", "description": "What it does", "path": "skill-two" }
]
```

Users install your skill via **Settings → Skills → Install from GitHub** by pasting your repo URL.

---

## Example: a minimal skill

```markdown
---
name: summarize-pdf
description: "Summarize a PDF resource into a concise note."
when_to_use: "User asks to summarize, extract key points, or get a TL;DR of a PDF."
allowed-tools:
  - resource_get_section
  - resource_create
---

## PDF Summary Flow

1. Call `resource_get_section` with `resource_id` and a broad `query` like "main points" to extract the most relevant passages.
2. Synthesize those passages into a 3–5 bullet executive summary.
3. Call `resource_create` with `type: "note"` and `title: "Summary: <original title>"` to save the summary to the library.
4. Return a `dome://resource/<id>` link to the user.

## Hard constraints

- ❌ Never fabricate content not present in the original PDF.
- ❌ Never skip saving the note — the user expects a persistent resource.
```
