# Dome

> Intelligent Desktop Application for Knowledge Management and Academic Research

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.1-00C853?style=flat)](https://langchain-ai.github.io/langgraphjs/)
[![License](https://img.shields.io/badge/License-Custom%20Open%20Source-blue.svg)](LICENSE)

**v1.1.0** — Dome is a comprehensive desktop application designed for researchers, academics, and knowledge workers who need to manage, organize, and synthesize information from multiple sources efficiently.

---

## Table of Contents

- [Overview](#overview)
- [What's New in v1.1.0](#whats-new-in-v110)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Dome provides a unified workspace for managing your research and knowledge. It combines powerful AI capabilities with an intuitive interface, allowing you to:

- **Organize resources** (notes, PDFs, videos, audios, images, URLs) in projects
- **Many AI Assistant** — Chat with LangGraph-powered agent (web search, resource search, memory, MCP tools)
- **Many Agents** — Create specialized agents (hijos de Many) with custom instructions, tools, MCP, and icons
- **Studio** — Generate mindmaps, quizzes, flashcards, guides, FAQs, timelines from your content
- **Flashcards** — Spaced repetition (SM-2) with AI-generated decks from your documents
- **Annotate PDFs** with highlights, comments, and notes
- **Notion-style editor** for rich documents
- **Manage academic sources** and generate citations
- **MCP Integration** — Connect Model Context Protocol servers for extended AI capabilities
- **Web scraping** for offline access
- **WhatsApp** connection for mobile integration

---

## What's New in v1.1.0

- **Many Agents** — Create custom agents with personalized instructions, tool selection (web, resources, context, studio, excel, etc.), MCP integration, and icons; each agent has its own chat sessions
- **Studio with Tools** — Mindmaps, quizzes, guides, FAQs, timelines, and flashcards now use AI tools (resource search, semantic search) for richer generation from project content
- **Agent Chat Store** — Per-agent sessions stored in localStorage; switch between agents and sessions in the Home sidebar
- **Tool Catalog** — 40+ tools grouped by category (web, memory, resources, context, flashcards, studio, audio, research, graph, notebook, excel)

## What's New in v1.0.0

- **LangGraph** — AI chat with tools runs on LangGraph; persistent sessions (SQLite checkpoints)
- **Many** — Assistant panel with sessions, quick prompts, resource + web tools
- **MCP** — Model Context Protocol support; connect stdio/http servers in Settings → MCP
- **Studio** — Generate mindmaps, quizzes, guides, FAQs, timelines, tables, flashcards from projects
- **Flashcards** — SM-2 spaced repetition; AI-generated decks via Many or Studio
- **Vite** — Migrated from Next.js to Vite for faster builds

---

## Features

### Knowledge Hub

Centralized management for all your resources:

| Resource Type | Description |
|---------------|-------------|
| **Notes** | Rich text documents with the Notion-style editor |
| **PDFs** | Academic papers and documents with annotation support |
| **Videos** | YouTube videos with thumbnail extraction and metadata |
| **Audios** | Audio files with transcription capabilities |
| **Images** | Visual resources with thumbnail generation |
| **URLs** | Web articles with automatic content extraction |
| **Folders** | Hierarchical organization within projects |

### AI Integration

Dome uses **LangGraph** for the chat-with-tools experience and supports multiple AI providers:

**Supported Providers:**
- OpenAI (GPT-4, GPT-4o, etc.)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
- Google (Gemini models)
- Ollama (Local models — Llama, Mistral, etc.)
- Venice (Privacy-focused AI)
- Synthetic (Custom providers)

**Many AI Assistant (LangGraph-powered):**
- **Persistent sessions** — Conversations survive app restart (SQLite checkpoints)
- **Streaming chat** with real-time tool execution
- **Built-in tools**: Web search, web fetch, resource search, semantic search, project context
- **Memory tools** — Save and recall information across sessions
- **Flashcard creation** — Generate study decks from documents via chat
- **MCP tools** — Use tools from configured Model Context Protocol servers
- **Quick prompts** — Summarize, organize, search your resources in one click

**Many Agents (v1.1.0):**
- **Custom agents** — Create specialized assistants with custom names, descriptions, and system instructions
- **Tool selection** — Choose which tools each agent can use (web, resources, context, studio, excel, notebook, graph, etc.)
- **MCP per agent** — Attach MCP servers to specific agents
- **Sessions per agent** — Each agent maintains its own chat history in the sidebar
- **Agent onboarding** — Guided flow: name → instructions → tools → MCP → skills → icon

**Other AI Capabilities:**
- **Semantic Search** — Find resources by meaning (LanceDB)
- **Auto-Transcription** — Convert audio/video to text
- **Document Summarization** — Quick summaries of long documents

### MCP (Model Context Protocol)

Extend Many's capabilities with external MCP servers:

- **Configure servers** in Settings → MCP
- **stdio** — Run local commands (e.g. `npx`, `uvx`) with optional args and env
- **http** — Connect to remote MCP servers via URL
- **Test connection** — Verify servers before using in chat
- Tools from MCP servers are automatically available to Many

### Studio

Generate study materials and visualizations from your project sources:

| Output Type | Description |
|-------------|-------------|
| **Mindmap** | Visual concept maps |
| **Quiz** | Interactive quiz from content |
| **Guide** | Structured study guide |
| **FAQ** | Question-answer pairs |
| **Timeline** | Chronological views |
| **Table** | Structured data tables |
| **Flashcards** | AI-generated decks (SM-2 spaced repetition) |

Use **Studio** in the home sidebar to select a project and generate outputs. Many can also create flashcards directly from chat.

### Flashcards

Study with spaced repetition:

- **Create decks** manually or ask Many to generate them from your documents
- **SM-2 algorithm** for optimal review scheduling
- **Study sessions** with swipe gestures (known/unknown)
- **Stats** — Cards due, retention, progress per deck
- **Integration** — Decks appear in Studio and link to resources

### PDF Viewer with Annotations

Full-featured PDF viewer with comprehensive annotation tools:

- **Highlight**: Mark important text with custom colors
- **Underline**: Emphasize key passages
- **Strikethrough**: Mark text for revision
- **Comments**: Add notes to specific sections
- **Page Navigation**: Quick jump to any page
- **Zoom Controls**: Fit to width, fit to page, custom zoom

### Notion-Style Editor

Powerful rich text editor built with Tiptap (ProseMirror):

**Block Types:**
- Headings (H1-H6)
- Paragraphs with rich formatting
- Bullet and numbered lists
- Task lists with checkboxes
- Callout blocks with icons
- Toggle blocks (collapsible content)
- Code blocks with syntax highlighting
- Tables with row/column controls
- Dividers (line, dots, space)

**Special Blocks:**
- **PDF Embeds**: Embed PDF pages directly in notes
- **File Blocks**: Reference attached files
- **Resource Mentions**: Link to other resources with @mentions
- **Images**: Inline image support

**Features:**
- Slash commands (/) for quick block insertion
- Bubble menu for text formatting
- Drag handles for block reordering
- Typography improvements (smart quotes, etc.)

### YouTube Integration

- Extract video thumbnails in multiple qualities
- Fetch video metadata (title, channel, duration)
- Support for various URL formats (youtube.com, youtu.be, embeds)

### WhatsApp Integration

Connect your WhatsApp for mobile access:

- QR code authentication
- Message handling and routing
- Support for text, audio, image, and document messages
- Real-time connection status

### Web Scraper

Playwright-powered web content extraction:

- Extract article text and metadata
- Capture page screenshots
- Extract Open Graph tags
- Fetch author and publication information
- Download images from pages

### Academic Library

Comprehensive source management for academic work:

**Source Types:**
- Articles
- Books
- Websites
- Videos
- Podcasts

**Citation Features:**
- Multiple citation styles (APA, MLA, Chicago, Harvard, Vancouver, IEEE)
- Automatic bibliography generation
- DOI and ISBN support
- Author and publication tracking

### Settings & Customization

- **General** — Profile, auto-save, backup preferences
- **Appearance** — Light, dark, and system theme modes
- **AI Configuration** — Providers, API keys, models, embedding models
- **MCP** — Configure Model Context Protocol servers (stdio/http)
- **Plugins** — Extensibility and integrations
- **WhatsApp** — Connection management

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh/) |
| Desktop Framework | [Electron 32](https://www.electronjs.org/) |
| Frontend | [Vite 7](https://vitejs.dev/) + [React 18](https://reactjs.org/) |
| UI Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Rich Text Editor | [Tiptap](https://tiptap.dev/) (ProseMirror) |
| AI Agent | [LangGraph](https://langchain-ai.github.io/langgraphjs/) + [LangChain](https://js.langchain.com/) |
| MCP | [@langchain/mcp-adapters](https://js.langchain.com/docs/integrations/tools/mcp) |
| Relational Database | SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) |
| Vector Database | [LanceDB](https://lancedb.com/) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| Web Automation | [Playwright](https://playwright.dev/) |
| PDF Rendering | [PDF.js](https://mozilla.github.io/pdf.js/) |

---

## Installation

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- [Node.js](https://nodejs.org/) >= 18 (required for Electron)
- macOS, Windows, or Linux

### Steps

1. **Clone the repository**

```bash
git clone https://github.com/maxprain12/dome.git
cd dome
```

2. **Install dependencies**

```bash
bun install
```

3. **Set up environment variables** (optional)

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```bash
# Optional: Default API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

4. **Start in development mode**

```bash
bun run electron:dev
```

This will start:
- Vite dev server at http://localhost:5173
- Electron application with hot reload

### Available Commands

```bash
# Development
bun run dev              # Start Vite dev server only
bun run electron         # Start Electron only
bun run electron:dev     # Full development (Vite + Electron)

# Production
bun run build            # Build Vite
bun run electron:build   # Build desktop application

# Utilities
bun run test:db          # Test database connection
bun run clean            # Clean build artifacts
bun run rebuild:natives  # Rebuild native modules (better-sqlite3, sharp, etc.)
bun run verify:natives  # Verify native modules
```

---

## Usage Guide

### 1. Initial Setup

When you first launch Dome:

1. **Complete the onboarding** with your profile information
2. **Configure AI** (optional but recommended):
   - Go to **Settings** (gear icon) → **AI Configuration**
   - Select your AI provider (OpenAI, Anthropic, Google, Ollama)
   - For **Ollama** (local, sin API key): [guía de instalación](docs/guia-instalacion-ollama.md)
   - For cloud providers: Enter your API key and choose models for chat and embeddings

3. **Configure MCP** (optional): Add MCP servers in Settings → MCP for extended AI tools

### 2. Creating Projects

Projects are the main organizational unit:

1. Click **Projects** in the sidebar
2. Click **+ New Project**
3. Enter a name and description
4. Use folders within projects for additional organization

### 3. Adding Resources

Add different types of content to your projects:

**Notes:**
- Click **+ New Resource** → **Note**
- Use the Notion-style editor to write
- Insert blocks with `/` commands

**PDFs:**
- Drag and drop PDF files
- Or click **+ New Resource** → **Import PDF**
- View with annotations in the PDF viewer

**URLs:**
- Click **+ New Resource** → **URL**
- Enter the web address
- Content will be automatically scraped

**Media (Videos/Audio/Images):**
- Drag and drop files
- Or use **+ New Resource** → select type
- YouTube URLs are automatically detected

### 4. Using the AI Assistant (Many)

The LangGraph-powered assistant helps with research:

1. Click the **Many** floating button (bottom-right)
2. Chat with context from your current resource — Many knows what you're viewing
3. Enable **My resources** and **Web search** for tool use
4. Use quick prompts: "Summarize my current resource", "Search my resources"
5. Create flashcards: "Generate flashcards from this document"
6. Sessions persist across app restarts

### 5. Studio — Generate Study Materials

From your project content:

1. Go to **Home** → **Studio** (sidebar)
2. Select a project
3. Choose output type: Mindmap, Quiz, Guide, FAQ, Timeline, Table, Flashcards
4. Click **Generate** — AI uses tools (resource search, semantic search) to fetch sources and create the output
5. View and edit outputs; flashcards open in study mode

### 5b. Many Agents — Custom Assistants (v1.1.0)

Create specialized AI agents tailored to your workflow:

1. Go to **Home** → click **+ Agente** in the sidebar
2. Follow the onboarding: name, instructions, tools, MCP servers, skills, icon
3. Your agent appears in the sidebar; click to chat with it
4. Each agent has its own sessions; switch between agents anytime

### 6. Flashcards

Study with spaced repetition:

1. **Home** → **Flashcards**
2. Create a deck manually or ask Many: "Create flashcards from my notes about X"
3. Use swipe (← known / → unknown) or buttons during study
4. Track progress and due cards per deck

### 7. Annotating PDFs

The PDF viewer provides comprehensive annotation:

1. Open a PDF resource
2. Use the toolbar to select annotation type
3. Click and drag on text to annotate
4. Add comments by clicking the comment icon
5. View all annotations in the side panel

### 8. Semantic Search

Find resources by meaning:

1. Click the **Search** icon or press `Cmd/Ctrl + K`
2. Enter your query in natural language
3. Results are ranked by semantic similarity
4. Filter by type, project, or tags

### 9. Managing Sources

For academic work:

1. Go to **Library** in the sidebar
2. Click **+ New Source**
3. Fill in bibliographic information
4. Link sources to resources
5. Generate citations with your preferred style

### 10. Using the Editor

The Notion-style editor supports:

**Keyboard Shortcuts:**
- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + U` - Underline
- `Cmd/Ctrl + K` - Insert link
- `/` - Open block menu

**Block Commands:**
- `/heading1` - Large heading
- `/heading2` - Medium heading
- `/bullet` - Bullet list
- `/numbered` - Numbered list
- `/todo` - Task list
- `/callout` - Callout block
- `/toggle` - Collapsible section
- `/code` - Code block
- `/divider` - Horizontal line
- `/pdf` - Embed PDF
- `/file` - Attach file

### 11. WhatsApp Connection

To connect WhatsApp:

1. Go to **Settings** → **WhatsApp**
2. Click **Connect**
3. Scan the QR code with your phone
4. Messages will sync automatically

---

## Project Structure

```
dome/
├── app/                          # React Application (Renderer Process)
│   ├── components/               # React Components
│   │   ├── chat/                 # AI Chat (messages, tool cards)
│   │   ├── CommandCenter/        # Search and command palette
│   │   ├── editor/               # Notion-style editor
│   │   │   ├── blocks/           # Custom block components
│   │   │   └── extensions/       # Tiptap extensions
│   │   ├── flashcards/           # Flashcard decks, study view
│   │   ├── many/                 # Many AI panel (floating, chat, header)
│   │   ├── agents/               # Many Agents: onboarding, chat, steps
│   │   ├── onboarding/           # First-run setup
│   │   ├── settings/             # Settings panels (AI, MCP, etc.)
│   │   ├── studio/               # Studio home view (mindmap, quiz, etc.)
│   │   ├── user/                 # User profile components
│   │   ├── viewers/              # Resource viewers (PDF, Video, etc.)
│   │   └── workspace/            # Workspace layout
│   ├── lib/                      # Business Logic
│   │   ├── ai/                   # AI Client, LangChain adapter, Tools
│   │   │   ├── catalogs/         # Model catalogs by provider
│   │   │   ├── providers/        # Provider implementations
│   │   │   └── tools/            # Web, resources, memory, flashcards
│   │   ├── db/                   # Database clients
│   │   ├── hooks/                # React hooks
│   │   ├── store/                # Zustand (useManyStore, useAgentChatStore, etc.)
│   │   ├── agents/               # Many Agents API and catalog
│   │   ├── studio/               # Studio constants and outputs
│   │   └── utils/                # Utilities
│   ├── types/                    # TypeScript definitions
│   └── workspace/                # Workspace routes
├── electron/                     # Electron Main Process
│   ├── main.cjs                  # Entry point, IPC handlers
│   ├── preload.cjs               # Preload (IPC bridge)
│   ├── database.cjs              # SQLite operations
│   ├── file-storage.cjs          # File system management
│   ├── ai-cloud-service.cjs      # Cloud AI providers
│   ├── ai-tools-handler.cjs      # AI tools (resources, flashcard create)
│   ├── langgraph-agent.cjs       # LangGraph agent (chat with tools)
│   ├── mcp-client.cjs            # MCP server connections
│   ├── ollama-service.cjs        # Ollama integration
│   ├── youtube-service.cjs       # YouTube utilities
│   ├── web-scraper.cjs           # Playwright scraper
│   ├── thumbnail.cjs             # Image thumbnail generation
│   ├── window-manager.cjs        # Window management
│   ├── security.cjs              # Security utilities
│   └── whatsapp/                 # WhatsApp integration
├── prompts/                       # System prompts (Many, tools)
├── public/                       # Static assets
├── assets/                       # Application assets
├── scripts/                      # Build and utility scripts
├── package.json                  # Dependencies and scripts
├── vite.config.ts                # Vite configuration
├── tailwind.config.cjs           # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

---

## Configuration

### AI Providers

Configure AI in **Settings** → **AI Configuration**:

**OpenAI:**
```
Provider: openai
API Key: sk-...
Model: gpt-4o (or gpt-4, gpt-3.5-turbo)
Embedding Model: text-embedding-3-small
```

**Anthropic:**
```
Provider: anthropic
API Key: sk-ant-...
Model: claude-3-5-sonnet-latest (or claude-3-opus)
```

**Google:**
```
Provider: google
API Key: AIza...
Model: gemini-1.5-pro (or gemini-1.5-flash)
```

**Ollama (Local):**
```
Provider: ollama
Base URL: http://localhost:11434
Model: glm-5:cloud (or llama3.2, mistral, etc.)
Embedding Model: mxbai-embed-large:latest
```

📖 **[Guía completa de instalación con Ollama](docs/guia-instalacion-ollama.md)** – Instalación paso a paso, configuración recomendada y solución de problemas.

### MCP Servers

Configure in **Settings** → **MCP**:

**stdio** (local process):
```json
{
  "name": "my-tools",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
  "env": { "API_KEY": "optional" }
}
```

**http** (remote):
```json
{
  "name": "remote-mcp",
  "type": "http",
  "url": "https://your-mcp-server.com/mcp"
}
```

### Data Storage Locations

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/dome/` |
| Windows | `%APPDATA%/dome/` |
| Linux | `~/.config/dome/` |

**Directory Structure:**
```
dome/
├── dome.db          # SQLite database
├── dome-vector/         # LanceDB vector database
├── dome-files/          # Stored files (PDFs, images, etc.)
│   ├── pdfs/
│   ├── images/
│   ├── audios/
│   ├── videos/
│   └── avatars/
└── dome-thumbnails/     # Generated thumbnails
```

---

## Contributing

**Contributions are welcome and encouraged!**

Dome is an open-source project, and we believe in the power of community collaboration to make it better. Every contribution, no matter how small, helps improve the project for everyone.

### How to Contribute

1. **Fork the repository** (for development only)
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following the code style guidelines
4. **Test your changes** thoroughly
5. **Commit with descriptive messages**
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** to the main repository

### Code Style

- Use TypeScript with strict mode
- Follow the existing code patterns
- Use 2 spaces for indentation
- Use `const` by default, `let` when necessary, never `var`
- Document complex functions with JSDoc comments

### Important Notes

- **Main Repository**: This is the official and main repository for Dome
- **Fork Support**: We do not provide official support for forks. Please contribute back to the main repository instead of maintaining separate forks
- **Questions**: For questions about contributing, open an issue in the repository

### Contact

For questions, suggestions, or commercial inquiries:

**Email**: alder.velasquezobando@gmail.com

---

## License

Dome is released under a custom open-source license. See the [LICENSE](LICENSE) file for full details.

**Summary:**
- Free for personal and educational use
- Modifications and contributions welcome
- Commercial use requires written permission
- Contact: alder.velasquezobando@gmail.com

---

## Acknowledgments

Dome is built with these amazing open-source projects:

- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [Vite](https://vitejs.dev/) - Build tool and dev server
- [React](https://reactjs.org/) - UI library
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [LangGraph](https://langchain-ai.github.io/langgraphjs/) - AI agent framework
- [LangChain](https://js.langchain.com/) - LLM orchestration and tools
- [Tiptap](https://tiptap.dev/) - Headless editor framework
- [LanceDB](https://lancedb.com/) - Vector database
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Playwright](https://playwright.dev/) - Browser automation
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering
- [Lucide](https://lucide.dev/) - Icon library
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite bindings

---

<p align="center">
  <b>Built with passion for researchers and knowledge workers</b>
</p>
