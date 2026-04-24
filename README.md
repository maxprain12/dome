<div align="center">

# Dome

> Intelligent Desktop Application for Knowledge Management and Academic Research

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.1-00C853?style=flat)](https://langchain-ai.github.io/langgraphjs/)
[![License](https://img.shields.io/badge/License-Custom%20Open%20Source-blue.svg)](LICENSE)

![GitHub Stars](https://img.shields.io/github/stars/maxprain12/dome?style=for-the-badge&labelColor=grey&color=6366f1)
![GitHub Forks](https://img.shields.io/github/forks/maxprain12/dome?style=for-the-badge&labelColor=grey&color=6366f1)
![GitHub Issues](https://img.shields.io/github/issues/maxprain12/dome?style=for-the-badge&labelColor=grey&color=6366f1)
![Latest Release](https://img.shields.io/github/v/release/maxprain12/dome?style=for-the-badge&labelColor=grey&color=6366f1)

</div>

Dome is an open-source desktop app for researchers, academics, and knowledge workers. Organize notes, PDFs, videos, and URLs in projects, then let AI index, search, and synthesize everything — locally or in the cloud, your choice.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [Core Maintainers](#core-maintainers)
- [Repo Activity](#repo-activity)
- [License](#license)

---

## Features

| | |
|---|---|
| **Many AI Assistant** | LangGraph-powered chat with web search, resource search, memory, and MCP tools |
| **Many Agents** | Custom agents with their own instructions, tools, MCP servers, and sessions |
| **Agent Canvas** | Visual drag-and-drop workflow builder (D3 + SVG edges) |
| **Agent Teams** | Multi-agent collaboration in a shared chat session |
| **Studio** | Generate mindmaps, quizzes, flashcards, guides, FAQs, and timelines from your content |
| **PageIndex** | Reasoning-based AI indexing — no embeddings needed, runs automatically in background |
| **Flashcards** | SM-2 spaced repetition with AI-generated decks |
| **Calendar** | Google Calendar sync + AI tools to create and manage events from chat |
| **Google Drive** | Native import with PKCE OAuth 2.0 — tokens stored locally, never on Dome servers |
| **PDF Viewer** | Highlight, underline, comment, and annotate |
| **PowerPoint Viewer** | Full `.pptx` rendering and presentation mode, no LibreOffice needed |
| **Notion-style Editor** | Tiptap-based with slash commands, tables, columns, toggles, callouts |
| **Web Scraper** | Playwright-based — no Brave API key required |
| **Academic Library** | APA, MLA, Chicago, Harvard, Vancouver, IEEE citations |
| **MCP Integration** | Connect `stdio` or `http` MCP servers; tools available to all agents |
| **Marketplace** | Community agents, plugins, skills, and workflows |
| **Plugins** | Pets and custom views; i18n in EN / ES / FR / PT |
| **WhatsApp** | Mobile integration via QR code |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh/) |
| Desktop | [Electron 32](https://www.electronjs.org/) |
| Frontend | [Vite 7](https://vitejs.dev/) + [React 18](https://reactjs.org/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [Mantine UI](https://mantine.dev/) |
| AI Agent | [LangGraph](https://langchain-ai.github.io/langgraphjs/) + [LangChain](https://js.langchain.com/) |
| MCP | [@langchain/mcp-adapters](https://js.langchain.com/docs/integrations/tools/mcp) |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| AI Index | PageIndex (reasoning-based, SQLite-backed) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Editor | [Tiptap](https://tiptap.dev/) + Dome Editor (MIT) |
| Graphs | [D3.js](https://d3js.org/) |
| Web automation | [Playwright](https://playwright.dev/) |
| PDF | [PDF.js](https://mozilla.github.io/pdf.js/) |
| PowerPoint | [pptx-preview](https://github.com/mesmerize-dev/pptx-preview) |
| i18n | [react-i18next](https://react.i18next.com/) |
| Analytics | [PostHog](https://posthog.com/) (opt-in) |

---

## Installation

**Prerequisites:** [Bun](https://bun.sh/) ≥ 1.3.0, [Node.js](https://nodejs.org/) ≥ 18, macOS / Windows / Linux.

```bash
git clone https://github.com/maxprain12/dome.git
cd dome
bun install
cp .env.example .env.local   # optional — add your API keys
bun run electron:dev
```

```bash
bun run dev              # Vite dev server only
bun run electron:dev     # Full dev (Vite + Electron)
bun run electron:build   # Production build
bun run rebuild:natives  # Rebuild native modules after Node version change
```

---

## Configuration

### AI providers

Go to **Settings → AI Configuration** and pick your provider:

| Provider | Key field | Example model |
|----------|-----------|---------------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| Google | `GOOGLE_API_KEY` | `gemini-1.5-pro` |
| Ollama (local) | Base URL | `llama3.2` |

> For OCR on scanned PDFs with Ollama, use a vision model: `llava`, `moondream2`, `minicpm-v`, or `glm4v`.

### Google Drive

Set in `.env.local` (or as GitHub secrets for CI):

```bash
DOME_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DOME_GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-secret
```

See [Cloud Storage Setup](docs/cloud-storage-setup.md) for the full OAuth guide.

### MCP servers

Add in **Settings → MCP**:

```json
{ "name": "fs", "type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"] }
{ "name": "remote", "type": "http", "url": "https://your-mcp-server.com/mcp" }
```

### Data locations

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/dome/` |
| Windows | `%APPDATA%/dome/` |
| Linux | `~/.config/dome/` |

---

## Contributing

Contributions are welcome — code, docs, bug reports, ideas.

```bash
git checkout -b feature/your-feature
# make changes
git commit -m "feat: describe your change"
git push origin feature/your-feature
# open a Pull Request
```

- TypeScript strict mode, 2-space indent, `const` by default
- Please contribute back to main rather than maintaining a fork
- Questions: open an issue or email **alder.velasquezobando@gmail.com**

### Releases & CI/CD

Desktop binaries (macOS `.dmg`, Windows `.exe`) are built with GitHub Actions on every published release. To publish: create a version tag, draft a release, and click **Publish release**.

## Core Maintainers

| Alder Velásquez |
|----------------|
| <img src="https://github.com/maxprain12.png" width="160px" alt="Alder Velásquez" /> |
| <a href="https://github.com/maxprain12"><img src="https://api.iconify.design/devicon:github.svg" width="22px"></a> |

---

## Repo Activity

![Alt](https://repobeats.axiom.co/api/embed/9e6f8c5613e2c12c76f3938028105e4dc14c7135.svg "Repobeats analytics image")

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=maxprain12/dome&type=Date)](https://star-history.com/#maxprain12/dome&Date)

---

## License

Free for personal and educational use. Commercial use requires written permission. See [LICENSE](LICENSE).

Contact: alder.velasquezobando@gmail.com

---

<p align="center"><b>Built with passion for researchers and knowledge workers</b></p>
