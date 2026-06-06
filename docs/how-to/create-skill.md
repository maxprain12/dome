# How to Create a Skill

Skills are specialized prompt modules that augment an agent's behavior on demand. They follow the **progressive disclosure** pattern: the agent loads the skill content only when needed, keeping the context window lean.

Dome uses the native skills loader in `@dome/agent-core` (`loadSkills`, `formatSkillsForSystemPrompt`), which follows the same progressive-disclosure pattern as [Agent Skills](https://agentskills.io) / [llmstxt](https://llmstxt.org).

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

### From Settings (recommended)

1. Open **Settings → Skills → Install from GitHub**
2. Paste the repository URL (e.g. `https://github.com/anthropics/skills`)
3. Enter the skill name (e.g. `pptx`) or click **Browse** to pick from the list
4. Click **Install**

This is equivalent to the open ecosystem CLI:

```bash
npx skills add https://github.com/anthropics/skills --skill pptx
```

Dome downloads the **full skill folder** (SKILL.md plus scripts, references, etc.) into `~/.dome/skills/<name>/`.

### Manual install

Place the skill folder inside your personal skills directory:

```
~/.dome/skills/
└── my-skill-id/
    ├── SKILL.md
    └── (optional scripts, references, assets…)
```

Dome picks it up automatically on next agent invocation — no restart needed.

### Compatible repository layouts

Dome discovers skills in repos using the same conventions as [vercel-labs/skills](https://github.com/vercel-labs/skills):

- `.claude-plugin/marketplace.json` (Anthropic plugin repos)
- `skills/<skill-name>/SKILL.md` (e.g. `anthropics/skills`)
- `skills.json` index at repo root
- Single-skill repo with `SKILL.md` at root or in a subdirectory

> **Note:** Some skills (e.g. Anthropic's `pptx`) reference external tools (Python, LibreOffice, npm). Dome installs the skill **files**; running bundled scripts depends on your system environment.

---

## Publishing a skill to GitHub

Structure your repository so the `SKILL.md` is at the root or in a named subdirectory:

```
github.com/you/my-skill/
├── SKILL.md          ← single-skill repo (Dome will find this)
└── README.md

# OR multi-skill repo (Anthropic-style):
github.com/you/skill-pack/
├── skills/
│   ├── skill-one/
│   │   └── SKILL.md
│   └── skill-two/
│       └── SKILL.md
└── .claude-plugin/marketplace.json   ← optional plugin manifest
```

### `skills.json` index (optional, for multi-skill repos)

```json
[
  { "id": "skill-one", "name": "Skill One", "description": "What it does", "path": "skill-one" },
  { "id": "skill-two", "name": "Skill Two", "description": "What it does", "path": "skill-two" }
]
```

Users install your skill via **Settings → Skills → Install from GitHub** by pasting your repo URL and skill name.

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
